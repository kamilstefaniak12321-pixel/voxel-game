// ------------------------------------------------------------
// GOSPODARZ - ŚWIAT OTWARTY DLA ZNAJOMYCH (0.92.0)
//
// Gospodarz gra dalej w swoim świecie i jest jego właścicielem: zapisuje
// go (także ekwipunki i pozycje gości - worldInfo.guests), rozsyła zmiany
// bloków, skrzyń, stołów i ognisk, porę dnia, meteoryty i tratwy. Goście
// wysyłają mu swoje zmiany, a on przekazuje je pozostałym.
// ------------------------------------------------------------

import { getBlockTypeById } from '../blocks/BlockRegistry.js';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { Chunk } from '../world/Chunk.js';
import { RaftBody } from '../game/RaftPhysics.js';
import { NetSession, validBlockChange } from './NetSession.js';
import { openHost, describeError } from './PeerTransport.js';
import { MSG, PROTOCOL_VERSION, MAX_GUESTS, newInviteCode, peerIdOf, cleanName, unpackPlayer,
    registryFingerprint, encodeBlocks } from './protocol.js';
import { skinDataURL } from '../player/skin.js';

const CHUNKS_PER_FRAME = 6;
const MAX_BUFFERED = 768 * 1024;
const TIME_INTERVAL = 4;
const RAFT_INTERVAL = 0.15;
const FIRE_RESYNC = 10;
const RAFT_CONTROL_TIMEOUT = 1.5;
const BLOCKS_PER_MESSAGE = 4096;

export class NetHost extends NetSession {

    get isHost() { return true; }

    constructor(options) {
        super(options);
        this.code = null;
        this.guests = new Map();          // Connection -> gość
        this.outgoing = [];               // [origin, x, y, z, id]
        this.origin = null;
        this.timeWait = 0;
        this.raftWait = 0;
        this.fireWait = FIRE_RESYNC;
        this.clock = 0;
        this.handle = null;
        this.server = options.server ?? '';
        this.skin = options.skin ?? (() => skinDataURL());
    }

    // Otwiera świat: rejestruje kod w serwerze połączeń.
    async open(game, { attempts = 3 } = {}) {
        this.attach(game);
        let lastError = null;
        for (let i = 0; i < attempts && !this.handle; i++) {
            const code = newInviteCode();
            try {
                this.handle = await openHost(peerIdOf(code), {
                    server: this.server,
                    onConnection: (connection) => this.accept(connection),
                    onError: (error) => this.onSystem?.(`Połączenia: ${describeError(error)}`)
                });
                this.code = code;
            } catch (error) {
                lastError = error;
                if (error?.type !== 'unavailable-id') break;
            }
        }
        if (!this.handle) {
            this.dispose();
            throw new Error(describeError(lastError));
        }
        game.meteorites.onSpawn = (target, flat) => this.broadcast({ t: MSG.METEOR, x: target.x, y: target.y, z: target.z, fx: flat.x, fz: flat.z });
        return this.code;
    }

    get guestList() { return [...this.guests.values()].filter((guest) => guest.ready); }

    accept(connection) {
        const guest = { connection, id: null, name: '', ready: false, chunkQueue: [], raft: null };
        this.guests.set(connection, guest);
        connection.onMessage = (message) => {
            try { this.receive(guest, message); }
            catch (error) { console.warn('Zła wiadomość od gościa', error); }
        };
        connection.onClose = () => this.leave(guest);
        // Bez przywitania w 20 s - rozłączamy.
        setTimeout(() => { if (!guest.ready && !connection.closed) connection.close(); }, 20000);
    }

    reject(guest, reason) {
        guest.connection.send({ t: MSG.REJECT, reason });
        setTimeout(() => guest.connection.close(), 500);
    }

    // --- Wiadomości od gości ----------------------------------------------------

    receive(guest, message) {
        if (!guest.ready) {
            if (message.t === MSG.HELLO) this.hello(guest, message);
            return;
        }
        switch (message.t) {
            case MSG.CHUNK_REQUEST:
                if (Array.isArray(message.keys)) {
                    for (const key of message.keys.slice(0, 512)) {
                        if (typeof key === 'string' && /^-?\d+,-?\d+$/.test(key) && !guest.chunkQueue.includes(key)) guest.chunkQueue.push(key);
                    }
                    this.sendChunks(guest);
                }
                break;
            case MSG.BLOCKS: this.guestBlocks(guest, message.l); break;
            case MSG.PLAYER: {
                const state = unpackPlayer(message.s);
                if (!state) break;
                guest.state = state;
                this.players.receive(guest.id, state);
                this.broadcast({ t: MSG.PLAYER, id: guest.id, s: message.s }, guest);
                break;
            }
            case MSG.STATE:
                if (this.state.apply(message.sys, message.key, message.v ?? null)) {
                    this.broadcast({ t: MSG.STATE, sys: message.sys, key: message.key, v: message.v ?? null }, guest);
                }
                break;
            case MSG.CHAT: {
                this.receiveChat(guest.name, message.text);
                this.broadcast({ t: MSG.CHAT, id: guest.id, name: guest.name, text: message.text }, guest);
                break;
            }
            case MSG.RAFT: this.guestRaft(guest, message.v); break;
            case MSG.RAFT_REMOVE: this.removeRaft(message.id); break;
            case MSG.SAVE: this.remember(guest, message); break;
            case MSG.BYE: this.leave(guest); guest.connection.close(); break;
            default: break;
        }
    }

    hello(guest, message) {
        if (message.protocol !== PROTOCOL_VERSION) {
            this.reject(guest, 'Inna wersja gry - zaktualizujcie obaj grę do tej samej wersji.');
            return;
        }
        if (message.registry !== registryFingerprint()) {
            this.reject(guest, 'Inne bloki w grze (inna wersja gry albo paczki roślin).');
            return;
        }
        const id = typeof message.id === 'string' && /^[0-9a-f]{8,32}$/.test(message.id) ? message.id : null;
        if (!id || id === this.id || this.guestList.some((other) => other.id === id)) {
            this.reject(guest, 'Ten gracz już jest w tym świecie.');
            return;
        }
        if (this.guestList.length >= MAX_GUESTS) {
            this.reject(guest, `Świat jest pełny (najwyżej ${MAX_GUESTS + 1} graczy).`);
            return;
        }
        const game = this.game, info = game.worldInfo;
        guest.id = id;
        guest.name = cleanName(message.name);
        guest.skin = typeof message.skin === 'string' && message.skin.length < 200000 ? message.skin : null;
        guest.ready = true;
        const saved = info.guests?.[id] ?? null;
        // Nowy gość pojawia się obok gospodarza.
        const host = game.player.getState();
        const start = saved?.player ?? { ...host, x: host.x + 1, flying: false };
        guest.connection.send({
            t: MSG.WELCOME,
            protocol: PROTOCOL_VERSION,
            world: {
                name: info.name, seed: info.seed, terrain: info.terrain, gameMode: game.mode,
                experiments: game.world.experiments, time: game.time.getState(), speed: game.time.speed
            },
            you: { player: start, inventory: saved?.inventory ?? null, wellbeing: saved?.wellbeing ?? null },
            modified: this.modifiedKeys(),
            state: { chests: this.state.snapshot('chests'), tables: this.state.snapshot('tables'), fires: this.state.snapshot('fires') },
            rafts: this.raftList(),
            host: { id: this.id, name: this.name, skin: this.skin(), s: this.playerMessage() },
            players: this.guestList.filter((other) => other !== guest)
                .map((other) => ({ id: other.id, name: other.name, skin: other.skin }))
        });
        for (const other of this.guestList) {
            if (other === guest) continue;
            other.connection.send({ t: MSG.PLAYER_JOIN, id: guest.id, name: guest.name, skin: guest.skin });
        }
        this.players.add(guest.id, guest.name, guest.skin);
        this.onSystem?.(`${guest.name} dołącza do gry`);
    }

    // Klucze chunków zmienionych przez graczy (zapisane i wczytane).
    modifiedKeys() {
        const world = this.game.world, keys = new Set();
        for (const key of world.savedChunks.keys()) keys.add(key);
        for (const chunk of world.chunks.values()) if (chunk.modified) keys.add(`${chunk.cx},${chunk.cz}`);
        return [...keys];
    }

    chunkBlocks(key) {
        const world = this.game.world;
        const chunk = world.chunks.get(key);
        if (chunk) return chunk.modified ? chunk.blocks : null;
        const saved = world.savedChunks.get(key);
        world.savedChunks.releaseDecoded?.(key);
        if (saved instanceof Uint16Array && saved.length === CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT) return saved;
        // Stary zapis (inny format) - przez Chunk.loadBlocks, jak przy wczytaniu.
        if (!saved) return null;
        const legacy = new Chunk(0, 0);
        return legacy.loadBlocks(saved) ? legacy.blocks : null;
    }

    sendChunks(guest) {
        let sent = 0;
        while (guest.chunkQueue.length && sent < CHUNKS_PER_FRAME && guest.connection.buffered < MAX_BUFFERED) {
            const key = guest.chunkQueue.shift();
            const blocks = this.chunkBlocks(key);
            guest.connection.send({ t: MSG.CHUNK, key, data: blocks ? encodeBlocks(blocks) : null });
            sent++;
        }
    }

    guestBlocks(guest, list) {
        if (!Array.isArray(list)) return;
        this.origin = guest;
        try {
            for (let i = 0; i + 3 < list.length && i < 4 * BLOCKS_PER_MESSAGE; i += 4) {
                const [x, y, z, id] = [list[i], list[i + 1], list[i + 2], list[i + 3]];
                if (!validBlockChange(x, y, z, id)) continue;
                this.stats.receivedBlocks++;
                // Zmiana gościa to "nasza" zmiana - rozsyłamy ją pozostałym
                // (onBlockSet), razem z jej skutkami (np. roślina bez podłoża).
                if (this.game.world.getBlockId(x, y, z) !== id) {
                    this.game.world.setBlock(x, y, z, id ? getBlockTypeById(id) : null, false);
                }
            }
        } finally { this.origin = null; }
    }

    localBlock(x, y, z, id) {
        this.outgoing.push(this.origin, x, y, z, id);
    }

    flushBlocks() {
        if (!this.outgoing.length) return;
        const guests = this.guestList;
        if (guests.length) {
            const lists = new Map(guests.map((guest) => [guest, []]));
            for (let i = 0; i < this.outgoing.length; i += 5) {
                const origin = this.outgoing[i];
                for (const [guest, list] of lists) {
                    if (guest !== origin) list.push(this.outgoing[i + 1], this.outgoing[i + 2], this.outgoing[i + 3], this.outgoing[i + 4]);
                }
            }
            for (const [guest, list] of lists) {
                for (let i = 0; i < list.length; i += BLOCKS_PER_MESSAGE * 4) {
                    guest.connection.send({ t: MSG.BLOCKS, l: list.slice(i, i + BLOCKS_PER_MESSAGE * 4) });
                }
            }
            this.stats.sentBlocks += this.outgoing.length / 5;
        }
        this.outgoing.length = 0;
    }

    broadcast(message, except = null) {
        for (const guest of this.guestList) if (guest !== except) guest.connection.send(message);
    }

    sendPlayer(s) { this.broadcast({ t: MSG.PLAYER, id: this.id, s }); }
    sendState(sys, key, v) { this.broadcast({ t: MSG.STATE, sys, key, v }); }
    sendChat(text) { this.broadcast({ t: MSG.CHAT, id: this.id, name: this.name, text }); }

    // Ekwipunek i pozycja gościa - w zapisie świata gospodarza.
    remember(guest, message) {
        const info = this.game.worldInfo;
        info.guests ??= {};
        const previous = info.guests[guest.id] ?? {};
        info.guests[guest.id] = {
            name: guest.name,
            player: message.player && typeof message.player === 'object' ? message.player : previous.player,
            inventory: message.inventory && typeof message.inventory === 'object' ? message.inventory : previous.inventory,
            // Energia i samopoczucie gościa (Wellbeing.load naprawia zły kształt).
            wellbeing: message.wellbeing && typeof message.wellbeing === 'object' ? message.wellbeing : previous.wellbeing,
            lastSeen: Date.now()
        };
    }

    leave(guest) {
        if (!this.guests.has(guest.connection)) return;
        this.guests.delete(guest.connection);
        if (!guest.ready) return;
        guest.ready = false;
        this.players.remove(guest.id);
        for (const body of this.game.rafts.bodies) if (body.controller === guest) { body.remote = false; body.controller = null; }
        this.broadcast({ t: MSG.PLAYER_LEAVE, id: guest.id });
        this.onSystem?.(`${guest.name} opuszcza grę`);
    }

    // --- Tratwy ------------------------------------------------------------------

    raftList() {
        return this.game.rafts.bodies.map((body) => ({ ...body.state(), c: body.controller?.id ?? null }));
    }

    guestRaft(guest, value) {
        if (!value || ![value.id, value.x, value.y, value.z, value.yaw, value.vx, value.vy, value.vz].every(Number.isFinite)) return;
        const rafts = this.game.rafts;
        let body = rafts.bodies.find((other) => other.id === value.id);
        if (!body) {
            if (rafts.bodies.length >= 32) return;
            body = new RaftBody(this.game.world, value);
            rafts.bodies.push(body);
            rafts.nextId = Math.max(rafts.nextId, value.id + 1);
            rafts.version++;
        }
        if (body === rafts.mounted) return;
        body.pos.set(value.x, value.y, value.z);
        body.vel.set(value.vx, value.vy, value.vz);
        body.yaw = value.yaw;
        body.remote = true;
        body.controller = guest;
        body.controlledAt = this.clock;
    }

    removeRaft(id) {
        const rafts = this.game.rafts;
        const index = rafts.bodies.findIndex((body) => body.id === id);
        if (index < 0 || rafts.bodies[index] === rafts.mounted) return;
        rafts.bodies.splice(index, 1);
        rafts.removeView(id);
        rafts.version++;
    }

    // Czas zmienił się skokiem (wszyscy przespali noc) - goście dostają
    // go od razu, nie przy następnym zwykłym wysłaniu.
    timeChanged() {
        this.timeWait = 0;
    }

    // --- Co klatkę ---------------------------------------------------------------

    update(dt) {
        if (this.closed || !this.game) return;
        this.clock += dt;
        super.update(dt);
        for (const guest of this.guestList) this.sendChunks(guest);
        if (!this.guestList.length) return;
        this.timeWait -= dt;
        if (this.timeWait <= 0) {
            this.timeWait = TIME_INTERVAL;
            this.broadcast({ t: MSG.TIME, days: this.game.time.days, speed: this.game.time.speed });
        }
        this.fireWait -= dt;
        if (this.fireWait <= 0) {
            this.fireWait = FIRE_RESYNC;
            this.state.resendAll('fires');
        }
        // Tratwy: gdy jakieś są (pływają) albo gdy coś się zmieniło.
        const rafts = this.game.rafts;
        this.raftWait -= dt;
        if (this.raftWait <= 0 && (rafts.bodies.length || rafts.version !== this.raftVersion)) {
            this.raftWait = RAFT_INTERVAL;
            this.raftVersion = rafts.version;
            for (const body of rafts.bodies) {
                if (body.remote && this.clock - (body.controlledAt ?? 0) > RAFT_CONTROL_TIMEOUT) { body.remote = false; body.controller = null; }
            }
            this.broadcast({ t: MSG.RAFTS, l: this.raftList() });
        }
    }

    describe() {
        return `Gospodarz • kod ${this.code} • graczy: ${this.guestList.length + 1}`;
    }

    // Zamknięcie świata dla znajomych (gra toczy się dalej sama).
    close(reason = 'Gospodarz zamknął świat.') {
        if (this.closed) return;
        this.closed = true;
        this.broadcast({ t: MSG.BYE, reason });
        const connections = [...this.guests.keys()];
        setTimeout(() => {
            for (const connection of connections) connection.close();
            this.handle?.close();
        }, 300);
        if (this.game) {
            for (const body of this.game.rafts.bodies) { body.remote = false; body.controller = null; }
            this.game.meteorites.onSpawn = null;
        }
        this.dispose();
    }
}
