// ------------------------------------------------------------
// GRA WIELOOSOBOWA - CZĘŚĆ WSPÓLNA GOSPODARZA I GOŚCIA (0.92.0)
//
// Podpina się pod grę (game.net):
// - zmiany bloków (World.onBlockSet) - wysyłane paczkami raz na klatkę;
//   woda płynie u każdego sama (ta sama symulacja z tych samych bloków),
//   więc jej kroków nie wysyłamy,
// - stan gracza 15 razy na sekundę (pozycja, ruch, przedmiot w ręce),
// - skrzynie, stoły i ogniska (StateSync.js),
// - inni gracze w świecie (RemotePlayers.js), czat,
// - wzrost roślin: chunk rośnie u gracza, który jest najbliżej.
// ------------------------------------------------------------

import { CHUNK_SIZE, CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { getBlockTypeById, MAX_BLOCK_ID } from '../blocks/BlockRegistry.js';
import { MSG, packPlayer, cleanChat } from './protocol.js';
import { StateSync } from './StateSync.js';
import { RemotePlayers } from './RemotePlayers.js';

const PLAYER_RATE = 1 / 15;

export const validBlockChange = (x, y, z, id) => Number.isSafeInteger(x) && Number.isSafeInteger(y) && Number.isSafeInteger(z) &&
    Number.isSafeInteger(id) && id >= 0 && id <= MAX_BLOCK_ID && y >= 0 && y < CHUNK_HEIGHT &&
    x >= -WORLD_BORDER && x < WORLD_BORDER && z >= -WORLD_BORDER && z < WORLD_BORDER && (id === 0 || getBlockTypeById(id) !== null);

export class NetSession {

    constructor({ name, id }) {
        this.name = name;
        this.id = id;
        this.game = null;
        this.applyingRemote = false;
        this.playerWait = 0;
        this.swings = 0;
        this.effects = 4;
        this.closed = false;
        this.onChat = null;          // (name, text) - main.js: czat
        this.onSystem = null;        // (text) - komunikat (ktoś wszedł, wyszedł)
        this.onDisconnect = null;    // (reason) - koniec gry przez sieć
        this.stats = { sentBlocks: 0, receivedBlocks: 0 };
    }

    get isHost() { return false; }
    get isClient() { return false; }

    attach(game) {
        this.game = game;
        game.net = this;
        this.players = new RemotePlayers(game);
        this.state = new StateSync(game, (sys, key, value) => this.sendState(sys, key, value));
        this.state.remember();
        game.world.onBlockSet = (x, y, z, id, previous, fluid) => {
            if (fluid || this.applyingRemote) return;
            this.localBlock(x, y, z, id);
        };
        game.plantGrowth.shouldTick = (chunk) => this.ownsChunk(chunk);
        const swing = game.swingArm.bind(game);
        game.swingArm = (...args) => { this.swings++; return swing(...args); };
    }

    // Zmiana bloku od kogoś innego - bez odsyłania jej z powrotem.
    applyRemoteBlock(x, y, z, id) {
        const world = this.game.world;
        const previous = world.getBlockId(x, y, z);
        if (previous === id) return true;
        this.applyingRemote = true;
        let changed;
        try { changed = world.setBlock(x, y, z, id ? getBlockTypeById(id) : null, false); }
        finally { this.applyingRemote = false; }
        // Ktoś postawił albo zniszczył blok: dźwięk i odłamki (kilka na klatkę).
        if (changed && this.effects > 0 && (previous === 0 || id === 0)) {
            this.effects--;
            const type = getBlockTypeById(id || previous);
            if (id === 0) this.game.debris?.burst(type, x, y, z);
            this.game.playBlockSound?.(id === 0 ? 'break' : 'place', type, { x, y, z });
        }
        return changed;
    }

    // Wzrost roślin: tylko u gracza najbliżej chunka (remis - gospodarz).
    ownsChunk(chunk) {
        const cx = (chunk.cx + 0.5) * CHUNK_SIZE, cz = (chunk.cz + 0.5) * CHUNK_SIZE;
        const me = this.game.player.pos;
        const mine = (me.x - cx) ** 2 + (me.z - cz) ** 2;
        for (const other of this.players.positions()) {
            const theirs = (other.x - cx) ** 2 + (other.z - cz) ** 2;
            if (theirs < mine || (theirs === mine && !this.isHost)) return false;
        }
        return true;
    }

    playerMessage() {
        const game = this.game;
        return packPlayer(game.player, game.selectedBlock, this.swings, Boolean(game.sleep?.lying));
    }

    chatLine(text) {
        const clean = cleanChat(text);
        if (!clean) return;
        this.sendChat(clean);
        this.onChat?.(this.name, clean);
    }

    receiveChat(name, text) {
        const clean = cleanChat(text);
        if (clean) this.onChat?.(name, clean);
    }

    update(dt) {
        if (this.closed || !this.game) return;
        this.effects = 4;
        this.playerWait -= dt;
        if (this.playerWait <= 0) {
            this.playerWait = PLAYER_RATE;
            this.sendPlayer(this.playerMessage());
        }
        this.flushBlocks();
        this.state.update(dt);
        this.players.update(dt);
    }

    // Do opisu w HUD (F3).
    describe() { return ''; }

    dispose() {
        if (!this.game) return;
        const game = this.game;
        game.world.onBlockSet = null;
        game.world.chunkGate = null;
        game.world.onChunkReady = null;
        game.plantGrowth.shouldTick = null;
        this.players.dispose();
        game.net = null;
    }

    // Wysyłanie - w NetHost / NetClient.
    localBlock() {}
    flushBlocks() {}
    sendPlayer() {}
    sendState() {}
    sendChat() {}
}

export { MSG };
