// ------------------------------------------------------------
// GOŚĆ - GRA W ŚWIECIE ZNAJOMEGO (0.92.0)
//
// connect() łączy się z gospodarzem po kodzie zaproszenia i czeka na
// powitanie (ziarno świata, stan, inni gracze). Świat gościa powstaje
// z tego samego ziarna, a chunki zmienione przez graczy przychodzą od
// gospodarza (RemoteChunkStore.js). Gość nic nie zapisuje u siebie -
// jego ekwipunek i pozycję co chwilę zapisuje gospodarz.
// ------------------------------------------------------------

import * as THREE from 'three';
import { CHUNK_SIZE } from '../config.js';
import { RaftBody } from '../game/RaftPhysics.js';
import { NetSession, validBlockChange } from './NetSession.js';
import { connectTo, describeError } from './PeerTransport.js';
import { RemoteChunkStore } from './RemoteChunkStore.js';
import { MSG, PROTOCOL_VERSION, peerIdOf, cleanName, unpackPlayer, registryFingerprint, decodeBlocks } from './protocol.js';

const SAVE_INTERVAL = 5;
const PREFETCH_INTERVAL = 0.5;
const PREFETCH_MARGIN = 2;
const RAFT_RATE = 1 / 12;
const TIME_SNAP = 1 / (24 * 6);     // różnica ponad 10 minut gry - przeskok
const BLOCKS_PER_MESSAGE = 4096;

export class NetClient extends NetSession {

    get isClient() { return true; }

    constructor(options) {
        super(options);
        this.connection = null;
        this.welcome = null;
        this.store = null;
        this.outgoing = [];
        this.requests = new Set();
        this.saveWait = SAVE_INTERVAL;
        this.prefetchWait = 0;
        this.raftWait = 0;
        this.hostId = null;
        this.hostName = '';
        this.queue = [];
        this.chunkWaiters = new Map();
    }

    // Łączy się i czeka na powitanie. Rzuca błąd z opisem dla gracza.
    static async connect(code, { name, id, skin, server = '', timeout = 30000 }) {
        const client = new NetClient({ name: cleanName(name), id });
        let connection;
        try {
            connection = await connectTo(peerIdOf(code), { server, timeout });
        } catch (error) {
            throw new Error(describeError(error));
        }
        client.connection = connection;
        client.code = code;
        const welcome = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gospodarz nie odpowiada.')), timeout);
            connection.onMessage = (message) => {
                if (message.t === MSG.WELCOME) { clearTimeout(timer); resolve(message); }
                else if (message.t === MSG.REJECT) { clearTimeout(timer); reject(new Error(String(message.reason ?? 'Gospodarz nie wpuścił gracza.'))); }
                else client.queue.push(message);
            };
            connection.onClose = () => { clearTimeout(timer); reject(new Error('Gospodarz zakończył połączenie.')); };
            connection.send({ t: MSG.HELLO, protocol: PROTOCOL_VERSION, name: client.name, id, skin, registry: registryFingerprint() });
        }).catch((error) => { connection.close(); throw error; });
        client.welcome = welcome;
        client.hostId = welcome.host?.id ?? 'host';
        client.hostName = cleanName(welcome.host?.name);
        client.store = new RemoteChunkStore(Array.isArray(welcome.modified) ? welcome.modified : []);
        client.store.onRequest = (key) => client.requests.add(key);
        // Do czasu wejścia do świata (Game.start) zbieramy chunki i zmiany.
        connection.onMessage = (message) => client.receive(message);
        connection.onClose = () => client.lost('Połączenie z gospodarzem zostało przerwane.');
        return client;
    }

    // Dane świata dla Game.start (bez id - nie trafia do zapisów gościa).
    worldInfo() {
        const { world, you } = this.welcome;
        return {
            name: String(world.name ?? 'Świat znajomego').replace(/[<>&"]/g, '').slice(0, 64) || 'Świat znajomego',
            seed: world.seed,
            terrain: world.terrain,
            gameMode: world.gameMode,
            time: world.time,
            experiments: world.experiments,
            player: you?.player ?? null,
            inventory: you?.inventory ?? undefined,
            wellbeing: you?.wellbeing ?? undefined,
            remote: true
        };
    }

    // Chunki zmienione wokół miejsca startu - zanim świat się wczyta.
    async prefetch(x, z, radius, timeout = 30000) {
        const keys = this.keysAround(x, z, radius);
        if (!keys.length) return;
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Gospodarz za długo wysyła świat.')), timeout);
            let left = keys.length;
            for (const key of keys) {
                this.chunkWaiters.set(key, () => { if (--left === 0) { clearTimeout(timer); resolve(); } });
                this.store.request(key);
            }
            this.flushRequests();
        });
    }

    keysAround(x, z, radius) {
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), keys = [];
        for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
            const key = `${cx + dx},${cz + dz}`;
            if (this.store.known.has(key) && !this.store.has(key)) keys.push(key);
        }
        return keys;
    }

    flushRequests() {
        if (!this.requests.size) return;
        this.connection.send({ t: MSG.CHUNK_REQUEST, keys: [...this.requests] });
        this.requests.clear();
    }

    attach(game) {
        super.attach(game);
        const world = game.world;
        world.chunkGate = (cx, cz) => this.store.ready(`${cx},${cz}`);
        world.onChunkReady = (chunk) => {
            const log = this.store.takeLog(`${chunk.cx},${chunk.cz}`);
            if (log) for (let i = 0; i < log.length; i += 4) this.applyRemoteBlock(log[i], log[i + 1], log[i + 2], log[i + 3]);
        };
        // Skrzynie, stoły, ogniska, tratwy i gracze z powitania.
        const { state, rafts, host, players } = this.welcome;
        for (const [sys, list] of Object.entries(state ?? {})) {
            const map = this.state.systems[sys]?.map();
            if (!map) continue;
            map.clear();
            for (const value of Array.isArray(list) ? list : []) this.state.apply(sys, `${value.x},${value.y},${value.z}`, value);
        }
        this.state.remember();
        // Tratwy gościa mają numery z osobnego zakresu.
        game.rafts.nextId = 100000 + Math.floor(Math.random() * 800000) * 1000;
        this.applyRafts(rafts ?? []);
        this.players.add(this.hostId, this.hostName, host?.skin);
        const hostState = unpackPlayer(host?.s);
        if (hostState) this.players.receive(this.hostId, hostState);
        for (const other of Array.isArray(players) ? players : []) this.players.add(other.id, cleanName(other.name), other.skin);
        if (Number.isFinite(this.welcome.world?.speed)) game.time.speed = this.welcome.world.speed;
        // Wiadomości, które przyszły w trakcie wczytywania.
        const queued = this.queue.splice(0);
        for (const message of queued) this.receive(message);
    }

    // --- Wiadomości od gospodarza -------------------------------------------------

    receive(message) {
        try { this.handle(message); }
        catch (error) { console.warn('Zła wiadomość od gospodarza', error); }
    }

    handle(message) {
        if (message.t === MSG.CHUNK) {
            const blocks = message.data ? decodeBlocks(message.data) : null;
            if (typeof message.key !== 'string') return;
            this.store.receive(message.key, blocks);
            this.chunkWaiters.get(message.key)?.();
            this.chunkWaiters.delete(message.key);
            // Czekające chunki trafiają z powrotem do kolejki wczytywania.
            if (this.game) this.game.world.loadRadius = -1;
            return;
        }
        if (!this.game) {
            this.queue.push(message);
            return;
        }
        const game = this.game;
        switch (message.t) {
            case MSG.BLOCKS: this.remoteBlocks(message.l); break;
            case MSG.PLAYER: {
                const state = unpackPlayer(message.s);
                if (state && typeof message.id === 'string') this.players.receive(message.id, state);
                break;
            }
            case MSG.PLAYER_JOIN:
                if (typeof message.id === 'string') {
                    const name = cleanName(message.name);
                    this.players.add(message.id, name, message.skin);
                    this.onSystem?.(`${name} dołącza do gry`);
                }
                break;
            case MSG.PLAYER_LEAVE: {
                const entry = this.players.players.get(message.id);
                if (entry) this.onSystem?.(`${entry.name} opuszcza grę`);
                this.players.remove(message.id);
                break;
            }
            case MSG.STATE: this.state.apply(message.sys, message.key, message.v ?? null); break;
            case MSG.TIME:
                if (Number.isFinite(message.days)) {
                    // Zegar biegnie u nas sam - poprawiamy tylko rozjazd.
                    const drift = message.days - game.time.days;
                    game.time.days = Math.abs(drift) > TIME_SNAP ? message.days : game.time.days + drift * 0.5;
                }
                if (Number.isFinite(message.speed)) game.time.speed = message.speed;
                break;
            case MSG.CHAT: this.receiveChat(cleanName(message.name), message.text); break;
            case MSG.RAFTS: if (Array.isArray(message.l)) this.applyRafts(message.l); break;
            case MSG.METEOR:
                if ([message.x, message.y, message.z, message.fx, message.fz].every(Number.isFinite)) {
                    game.meteorites.spawn(new THREE.Vector3(message.x, message.y, message.z),
                        { from: { x: message.fx, z: message.fz }, remote: true });
                }
                break;
            case MSG.BYE: this.lost(String(message.reason ?? 'Gospodarz zamknął świat.')); break;
            default: break;
        }
    }

    remoteBlocks(list) {
        if (!Array.isArray(list)) return;
        const world = this.game.world;
        for (let i = 0; i + 3 < list.length; i += 4) {
            const [x, y, z, id] = [list[i], list[i + 1], list[i + 2], list[i + 3]];
            if (!validBlockChange(x, y, z, id)) continue;
            this.stats.receivedBlocks++;
            const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
            if (world.getChunk(cx, cz)) this.applyRemoteBlock(x, y, z, id);
            else this.store.record(`${cx},${cz}`, x, y, z, id);
        }
    }

    // Tratwy od gospodarza (poza tą, którą sami płyniemy).
    applyRafts(list) {
        const rafts = this.game.rafts;
        const seen = new Set();
        for (const value of list) {
            if (!value || ![value.id, value.x, value.y, value.z, value.yaw, value.vx, value.vy, value.vz].every(Number.isFinite)) continue;
            seen.add(value.id);
            let body = rafts.bodies.find((other) => other.id === value.id);
            if (body === rafts.mounted) continue;
            if (!body) {
                body = new RaftBody(this.game.world, value);
                rafts.bodies.push(body);
            }
            body.remote = true;
            body.target = value;
            if (body.pos.distanceTo(new THREE.Vector3(value.x, value.y, value.z)) > 4) body.pos.set(value.x, value.y, value.z);
            body.vel.set(value.vx, value.vy, value.vz);
        }
        for (let i = rafts.bodies.length - 1; i >= 0; i--) {
            const body = rafts.bodies[i];
            if (seen.has(body.id) || body === rafts.mounted || !body.remote) continue;
            rafts.bodies.splice(i, 1);
            rafts.removeView(body.id);
        }
    }

    smoothRafts(dt) {
        const rate = 1 - Math.exp(-12 * dt);
        for (const body of this.game.rafts.bodies) {
            const target = body.target;
            if (!body.remote || !target || body === this.game.rafts.mounted) continue;
            body.pos.x += (target.x + target.vx * 0.08 - body.pos.x) * rate;
            body.pos.y += (target.y - body.pos.y) * rate;
            body.pos.z += (target.z + target.vz * 0.08 - body.pos.z) * rate;
            let turn = target.yaw - body.yaw;
            turn -= Math.round(turn / (Math.PI * 2)) * Math.PI * 2;
            body.yaw += turn * rate;
        }
    }

    // Nasze tratwy: płyniemy (stan do gospodarza), nowe i zabrane.
    syncRafts(dt) {
        const rafts = this.game.rafts;
        const known = this.knownRafts ??= new Set(rafts.bodies.map((body) => body.id));
        for (const body of rafts.bodies) {
            if (body.remote && body !== rafts.mounted) continue;
            // Postawiona przez nas albo ta, którą płyniemy.
            if (!known.has(body.id) || body === rafts.mounted) {
                this.raftWait -= dt;
                if (this.raftWait <= 0 || !known.has(body.id)) {
                    this.raftWait = RAFT_RATE;
                    this.connection.send({ t: MSG.RAFT, v: body.state() });
                }
                known.add(body.id);
            }
            body.remote = body !== rafts.mounted;
        }
        for (const id of [...known]) {
            if (rafts.bodies.some((body) => body.id === id)) continue;
            known.delete(id);
            // Zabrana przez nas (rozbita LPM) - gospodarz też ją zabiera.
            if (!this.removedByHost?.has(id)) this.connection.send({ t: MSG.RAFT_REMOVE, id });
        }
    }

    // --- Wysyłanie ---------------------------------------------------------------

    localBlock(x, y, z, id) { this.outgoing.push(x, y, z, id); }

    flushBlocks() {
        if (!this.outgoing.length) return;
        // Paczki do 4096 zmian (wiadomość w kanale ma limit wielkości).
        for (let i = 0; i < this.outgoing.length; i += BLOCKS_PER_MESSAGE * 4) {
            this.connection.send({ t: MSG.BLOCKS, l: this.outgoing.slice(i, i + BLOCKS_PER_MESSAGE * 4) });
        }
        this.stats.sentBlocks += this.outgoing.length / 4;
        this.outgoing.length = 0;
    }

    sendPlayer(s) { this.connection.send({ t: MSG.PLAYER, s }); }
    sendState(sys, key, v) { this.connection.send({ t: MSG.STATE, sys, key, v }); }
    sendChat(text) { this.connection.send({ t: MSG.CHAT, text }); }

    saveNow() {
        const game = this.game;
        if (!game || this.closed) return;
        this.connection.send({ t: MSG.SAVE, player: game.player.getState(), inventory: game.inventory.data,
            wellbeing: game.wellbeing.data });
    }

    update(dt) {
        if (this.closed || !this.game) return;
        super.update(dt);
        this.smoothRafts(dt);
        this.syncRafts(dt);
        this.prefetchWait -= dt;
        if (this.prefetchWait <= 0) {
            this.prefetchWait = PREFETCH_INTERVAL;
            const radius = Math.ceil(this.game.getLoadRadius()) + PREFETCH_MARGIN;
            for (const key of this.keysAround(this.game.player.pos.x, this.game.player.pos.z, radius)) this.store.request(key);
        }
        this.flushRequests();
        this.saveWait -= dt;
        if (this.saveWait <= 0) {
            this.saveWait = SAVE_INTERVAL;
            this.saveNow();
        }
    }

    describe() {
        return `Gość • gospodarz ${this.hostName} • graczy: ${this.players.players.size + 1}`;
    }

    lost(reason) {
        if (this.closed) return;
        this.closed = true;
        this.connection?.close();
        this.onDisconnect?.(reason);
    }

    // Wyjście z gry (zapis u gospodarza i rozłączenie).
    leave() {
        if (this.closed) return;
        this.saveNow();
        this.flushBlocks();
        this.connection.send({ t: MSG.BYE });
        this.closed = true;
        const connection = this.connection;
        setTimeout(() => connection.close(), 400);
    }
}
