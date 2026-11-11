// ------------------------------------------------------------
// SPRAWDZENIE GRY WIELOOSOBOWEJ (0.92.0) - bez przeglądarki
//
// - kod zaproszenia: nowe kody, wpisywanie małymi literami, ze spacjami,
//   bez przedrostka; złe kody odrzucone,
// - imiona i czat: czyszczenie, długość,
// - stan gracza: pakowanie i odczyt (flagi ruchu, przedmiot, machnięcia),
// - bloki chunka: kodowanie i odczyt bez strat (także uszkodzone dane),
//   odcisk numerów bloków,
// - chunki gościa (RemoteChunkStore): czekanie na zmienione, prośby,
//   zmiany w chunkach poza pamięcią,
// - skrzynie, stoły i ogniska (StateSync): tylko zmiany, usunięcia,
//   podmiana w miejscu, bez odbijania zmian z powrotem,
// - gospodarz: zmiany gościa trafiają do pozostałych, nie do niego; złe
//   zmiany odrzucone; powitanie (wersja, bloki, ten sam gracz, komplet),
//   zapis ekwipunku gościa; tratwy gościa,
// - gość: zmiany w chunkach w pamięci i poza nią, tratwy od gospodarza,
//   pora dnia, wzrost roślin u najbliższego gracza.
//
// Uruchomienie: node tools/sprawdz_multiplayer.mjs
// Prawdziwa gra w dwóch kartach: tools/sprawdz_multiplayer_webgl.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 36, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer {}; export const TABLE_ROTATION = {};' };
        }
        if (url.endsWith('/src/net/RemotePlayers.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export class RemotePlayers {
                    constructor() { this.players = new Map(); }
                    add(id, name, skin) { this.players.set(id, { id, name, skin, state: null }); }
                    remove(id) { this.players.delete(id); }
                    receive(id, state) { const p = this.players.get(id); if (p) p.state = state; }
                    update() {}
                    positions() { return [...this.players.values()].filter((p) => p.state).map((p) => p.state); }
                    dispose() { this.players.clear(); }
                }` };
        }
        if (url.endsWith('/src/player/skin.js')) {
            return { format: 'module', shortCircuit: true, source: 'export const skinDataURL = () => "data:image/png;base64,AAAA";' };
        }
        if (url.endsWith('/src/game/RaftPhysics.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export class RaftBody {
                    constructor(world, s) { this.id = s.id; this.pos = { x: s.x, y: s.y, z: s.z, set(x, y, z) { this.x = x; this.y = y; this.z = z; },
                        distanceTo(v) { return Math.hypot(v.x - this.x, v.y - this.y, v.z - this.z); } };
                        this.vel = { x: s.vx ?? 0, y: s.vy ?? 0, z: s.vz ?? 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; this.yaw = s.yaw ?? 0; }
                    state() { return { id: this.id, x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, vx: this.vel.x, vy: this.vel.y, vz: this.vel.z }; }
                }` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const P = await import('../src/net/protocol.js');
const { RemoteChunkStore } = await import('../src/net/RemoteChunkStore.js');
const { StateSync } = await import('../src/net/StateSync.js');
const { NetHost } = await import('../src/net/NetHost.js');
const { NetClient } = await import('../src/net/NetClient.js');
const { peerOptions } = await import('../src/net/PeerTransport.js');
const { getBlockId, getBlockTypeById, BLOCK_TYPES } = await import('../src/blocks/BlockRegistry.js');
const { newChest } = await import('../src/game/ChestState.js');
const { newCampfire } = await import('../src/game/CampfireState.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { SavedChunkStore } = await import('../src/storage/SavedChunkStore.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const STONE = getBlockId('stone'), PLANKS = getBlockId('oak_planks');


// --- Kod zaproszenia, imiona, czat ----------------------------------------------

{
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const codes = new Set(Array.from({ length: 200 }, () => P.newInviteCode(random)));
    check(codes.size === 200, 'Kody zaproszeń się nie powtarzają');
    check([...codes].every((code) => /^VOXEL-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code)), 'Kod: VOXEL-XXXX-XXXX bez 0, O, 1, I, L');
    const code = [...codes][0];
    check(P.normalizeInviteCode(code) === code, 'Kod bez zmian');
    check(P.normalizeInviteCode(code.toLowerCase().replace(/-/g, ' ')) === code, 'Małe litery i spacje');
    check(P.normalizeInviteCode(code.slice(6)) === code, 'Bez przedrostka VOXEL');
    check(P.normalizeInviteCode('  ' + code.slice(6, 10) + code.slice(11) + ' ') === code, 'Same znaki kodu');
    check([null, '', 'VOXEL-1234-5678', 'VOXEL-ABCD', 'hej', 'VOXEL-ABCD-EFGH-JK'].every((bad) => P.normalizeInviteCode(bad) === null), 'Złe kody odrzucone');
    check(P.peerIdOf('VOXEL-AB23-CD45') === 'voxel-game-voxel-ab23-cd45', 'Identyfikator w serwerze połączeń');
    check(P.cleanName('  Ola  ') === 'Ola' && P.cleanName('') === 'Gracz' && P.cleanName('<b>x</b>') === 'bx/b'
        && P.cleanName('a'.repeat(40)).length === 16, 'Imię: bez < >, do 16 znaków, puste - Gracz');
    check(P.cleanChat('  hej\nty ') === 'hej ty' && P.cleanChat('x'.repeat(500)).length === 200, 'Czat: jedna linia, do 200 znaków');
    check(/^[0-9a-f]{16}$/.test(P.newPlayerId()), 'Identyfikator gracza');
    const local = peerOptions('http://127.0.0.1:9000/peer');
    check(local.host === '127.0.0.1' && local.port === 9000 && local.path === '/peer' && local.secure === false, 'Własny serwer połączeń');
    check(peerOptions('').host === undefined && peerOptions('moj.serwer.pl').secure === true && peerOptions('moj.serwer.pl').port === 443, 'Serwer domyślny, https bez protokołu');
}


// --- Stan gracza ------------------------------------------------------------------

{
    const player = { pos: { x: 10.123, y: 64, z: -5.5 }, vel: { x: 1, y: -2, z: 0 }, yaw: 1.2345, pitch: -0.3,
        onGround: true, crouching: false, sprinting: true, flying: false, swimming: true };
    const packed = P.packPlayer(player, 'oak_planks', 7);
    const state = P.unpackPlayer(JSON.parse(JSON.stringify(packed)));
    check(state.x === 10.12 && state.y === 64 && state.z === -5.5 && state.yaw === 1.235, 'Pozycja i obrót');
    check(state.onGround && state.sprinting && state.swimming && !state.crouching && !state.flying, 'Flagi ruchu');
    check(state.held === 'oak_planks' && state.swings === 7, 'Przedmiot w ręce i machnięcia');
    check(P.unpackPlayer([1, 2]) === null && P.unpackPlayer(['x', 0, 0, 0, 0, 0, 0, 0, 0, null, 0]) === null && P.unpackPlayer(null) === null, 'Zły stan odrzucony');
}


// --- Bloki chunka ---------------------------------------------------------------

{
    const size = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;
    const blocks = new Uint16Array(size);
    blocks.fill(STONE, 0, size / 4);
    for (let i = size / 4; i < size / 2; i++) blocks[i] = (i * 2654435761 >>> 0) % 900;
    blocks.fill(PLANKS, size - 70000 > 0 ? size - 70000 : 0);
    const encoded = P.encodeBlocks(blocks);
    const decoded = P.decodeBlocks(JSON.parse(JSON.stringify(encoded)));
    check(decoded.length === size && decoded.every((value, i) => value === blocks[i]), 'Bloki chunka bez strat (długie ciągi ponad 65535 też)');
    const air = P.encodeBlocks(new Uint16Array(size));
    check(air.d.length < 40, `Pusty chunk - kilka bajtów (${air.d.length})`);
    check(P.decodeBlocks({ n: 10, d: 'AAAA' }) === null && P.decodeBlocks({ n: -1, d: '' }) === null && P.decodeBlocks(null) === null
        && P.decodeBlocks({ n: 3, d: 'BQAAAA==' }) === null, 'Uszkodzone dane chunka odrzucone');
    check(P.registryFingerprint() === P.registryFingerprint() && P.registryFingerprint() !== P.registryFingerprint({ ...BLOCK_TYPES, x: { id: 99999 } }),
        'Odcisk numerów bloków');
}


// --- Chunki gościa ---------------------------------------------------------------

{
    const store = new RemoteChunkStore(['1,2', '-3,0']);
    const asked = [];
    store.onRequest = (key) => asked.push(key);
    check(store.ready('0,0'), 'Niezmieniony chunk - od razu');
    check(!store.ready('1,2') && !store.ready('1,2') && asked.join() === '1,2', 'Zmieniony - czeka, jedna prośba');
    const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
    store.receive('1,2', blocks);
    check(store.ready('1,2') && store.get('1,2') === blocks && !store.known.has('1,2'), 'Bloki przyszły - można wczytać');
    store.record('1,2', 1 * CHUNK_SIZE + 3, 5, 2 * CHUNK_SIZE + 4, STONE);
    check(blocks[(5 * CHUNK_SIZE + 4) * CHUNK_SIZE + 3] === STONE, 'Zmiana w zapamiętanych blokach');
    check(store.takeLog('1,2')?.join() === `${CHUNK_SIZE + 3},5,${2 * CHUNK_SIZE + 4},${STONE}` && store.takeLog('1,2') === null, 'I jeszcze raz po wczytaniu (wątek mógł mieć starą kopię)');
    store.record('5,5', 80, 10, 80, STONE);
    check(store.ready('5,5') && store.takeLog('5,5')?.length === 4, 'Niezmieniony chunk - zmiany po wygenerowaniu');
    store.record('-3,0', -40, 10, 3, STONE);
    check(!store.logs.has('-3,0'), 'Zmieniony, jeszcze bez bloków - zmiana przyjdzie z blokami');
    for (let i = 0; i < 5000; i++) store.record('6,6', 96, 10, 96, STONE);
    check(store.known.has('6,6') && !store.logs.has('6,6'), 'Za dużo zmian - chunk pobierany jeszcze raz');
}


// --- Skrzynie, stoły, ogniska ------------------------------------------------------

function stateGame() {
    const game = {
        chests: { chests: new Map(), version: 0, changed() { this.version++; } },
        carpenterTables: { tables: new Map(), version: 0 },
        campfires: { fires: new Map(), version: 0 }
    };
    return game;
}

{
    const sent = [];
    const game = stateGame();
    const sync = new StateSync(game, (sys, key, value) => sent.push([sys, key, value]));
    const chest = newChest(1, 2, 3);
    game.chests.chests.set('1,2,3', chest);
    sync.update(0.3);
    check(sent.length === 1 && sent[0][0] === 'chests' && sent[0][1] === '1,2,3', 'Nowa skrzynia wysłana');
    sync.update(0.3);
    check(sent.length === 1, 'Bez zmian - nic');
    chest.layers[0][0] = { type: 'stone', count: 3 };
    sync.update(0.3);
    check(sent.length === 2 && sent[1][2].layers[0][0].count === 3, 'Zmiana zawartości wysłana');
    // Zmiana od kogoś innego: podmiana w miejscu i bez odsyłania.
    const remote = JSON.parse(JSON.stringify(sent[1][2]));
    remote.layers[0][1] = { type: 'oak_planks', count: 9 };
    check(sync.apply('chests', '1,2,3', remote) && game.chests.chests.get('1,2,3') === chest && chest.layers[0][1].count === 9, 'Odebrana zmiana - ten sam obiekt (otwarta skrzynia)');
    sync.update(0.3);
    check(sent.length === 2, 'Odebranej zmiany nie odsyłamy');
    check(!sync.apply('chests', '9,9,9', remote) && !sync.apply('nope', '1,2,3', remote), 'Zła pozycja albo system - odrzucone');
    game.chests.chests.delete('1,2,3');
    sync.update(2);
    check(sent.at(-1)[2] === null, 'Usunięta skrzynia - null');
    // Ognisko: postęp spalania nie jest wysyłany, zmiana fazy tak.
    const fire = newCampfire(4, 5, 6);
    fire.logs = Array.from({ length: 6 }, () => ({ wood: 'oak', burn: 0 }));
    fire.phase = 'burning';
    game.campfires.fires.set('4,5,6', fire);
    sync.update(0.3);
    const count = sent.length;
    fire.logs[0].burn = 0.4;
    sync.update(0.3);
    check(sent.length === count, 'Ognisko: spalanie liczy każdy u siebie');
    fire.phase = 'collapsing';
    sync.update(0.3);
    check(sent.length === count + 1, 'Ognisko: nowa faza wysłana');
    // Rozpalanie przez kogoś innego - nasze gaśnięcie nie wraca przez chwilę.
    fire.phase = 'unlit'; fire.tinder = 'tall_grass'; fire.ignition = 0;
    sync.update(0.3);
    const before = sent.length;
    sync.apply('fires', '4,5,6', { ...structuredClone(fire), ignition: 0.5 });
    fire.ignition = 0.2;
    sync.update(0.3);
    check(sent.length === before, 'Cudze rozpalanie - nasze gaśnięcie nie wraca');
    // Stół.
    game.carpenterTables.tables.set('7,8,9', { x: 7, y: 8, z: 9, planks: 'oak_planks', count: 12 });
    sync.update(0.3);
    check(sent.at(-1)[0] === 'tables' && sent.at(-1)[2].count === 12, 'Deski na stole wysłane');
    check(sync.apply('tables', '7,8,9', { x: 7, y: 8, z: 9, planks: 'oak_planks', count: 5 }) && game.carpenterTables.tables.get('7,8,9').count === 5, 'Deski od kogoś innego');
}


// --- Gospodarz i gość (bez sieci) --------------------------------------------------

class FakeConnection {
    constructor() { this.messages = []; this.closed = false; this.onMessage = null; this.onClose = null; }
    send(message) { this.messages.push(JSON.parse(JSON.stringify(message))); return true; }
    close() { this.closed = true; }
    get buffered() { return 0; }
    take(type) { return this.messages.filter((message) => message.t === type); }
}

function fakeWorld() {
    const blocks = new Map(), chunks = new Map();
    const world = {
        blocks, chunks, savedChunks: new Map(), onBlockSet: null, chunkGate: null, onChunkReady: null, loadRadius: 3,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0,
        getChunk: (cx, cz) => chunks.get(`${cx},${cz}`) ?? null,
        setBlock(x, y, z, type) {
            const id = type ? getBlockId(type) : 0, previous = world.getBlockId(x, y, z);
            blocks.set(`${x},${y},${z}`, id);
            world.onBlockSet?.(x, y, z, id, previous, false);
            return true;
        }
    };
    return world;
}

function fakeGame(world = fakeWorld()) {
    const game = {
        world,
        worldInfo: { name: 'Świat', seed: 7, terrain: 'classic' },
        mode: 'adventure',
        time: { days: 1.25, speed: 1, getState() { return this.days; } },
        player: { pos: { x: 0, y: 64, z: 0 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, getState: () => ({ x: 0, y: 64, z: 0, yaw: 0, pitch: 0 }) },
        inventory: { data: { slots: [], selected: 0 } },
        selectedBlock: null,
        plantGrowth: { shouldTick: null },
        meteorites: { onSpawn: null, spawn(...args) { this.spawned = args; } },
        rafts: { bodies: [], mounted: null, nextId: 1, version: 0, removeView() {} },
        swingArm() {},
        getLoadRadius: () => 3,
        ...stateGame()
    };
    return game;
}

const hello = (id, extra = {}) => ({ t: P.MSG.HELLO, protocol: P.PROTOCOL_VERSION, name: 'Ola', id, skin: null, registry: P.registryFingerprint(), ...extra });

{
    const game = fakeGame();
    const host = new NetHost({ name: 'Kamil', id: '0123456789abcdef', skin: () => null });
    host.attach(game);
    const ola = new FakeConnection(), ela = new FakeConnection(), zly = new FakeConnection(), stary = new FakeConnection();
    for (const connection of [ola, ela, zly, stary]) host.accept(connection);
    zly.onMessage(hello('fedcba9876543210', { registry: 'inne' }));
    check(zly.take(P.MSG.REJECT).length === 1 && /bloki/i.test(zly.take(P.MSG.REJECT)[0].reason), 'Inne bloki - gość odrzucony');
    stary.onMessage(hello('fedcba9876543210', { protocol: 0 }));
    check(/wersja/i.test(stary.take(P.MSG.REJECT)[0]?.reason ?? ''), 'Inna wersja - odrzucony');
    game.world.savedChunks.set('4,4', new Uint16Array(4));
    ola.onMessage(hello('aaaaaaaaaaaaaaaa'));
    const welcome = ola.take(P.MSG.WELCOME)[0];
    check(welcome && welcome.world.seed === 7 && welcome.world.gameMode === 'adventure' && welcome.modified.includes('4,4'), 'Powitanie: ziarno, tryb, zmienione chunki');
    check(welcome.you.player.x === 1 && welcome.host.name === 'Kamil', 'Nowy gość obok gospodarza');
    ela.onMessage(hello('bbbbbbbbbbbbbbbb', { name: 'Ela' }));
    check(ola.take(P.MSG.PLAYER_JOIN).some((message) => message.name === 'Ela'), 'Inni dowiadują się o nowym graczu');
    const again = new FakeConnection();
    host.accept(again);
    again.onMessage(hello('aaaaaaaaaaaaaaaa'));
    check(again.take(P.MSG.REJECT).length === 1, 'Ten sam gracz drugi raz - odrzucony');

    // Zmiany bloków gościa: do pozostałych, nie do niego; złe odrzucone.
    ola.onMessage({ t: P.MSG.BLOCKS, l: [1, 70, 2, STONE, 1, 999, 2, STONE, 'x', 1, 1, 1, 3, 70, 3, 65000] });
    host.flushBlocks();
    check(game.world.getBlockId(1, 70, 2) === STONE && game.world.getBlockId(3, 70, 3) === 0, 'Gospodarz przyjmuje poprawne zmiany');
    check(ola.take(P.MSG.BLOCKS).length === 0 && ela.take(P.MSG.BLOCKS)[0]?.l.join() === `1,70,2,${STONE}`, 'Zmiana gościa - do innych, nie do niego');
    game.world.setBlock(5, 70, 5, 'oak_planks');
    host.flushBlocks();
    check(ola.take(P.MSG.BLOCKS).length === 1 && ela.take(P.MSG.BLOCKS).length === 2, 'Zmiana gospodarza - do wszystkich');

    // Chunki na prośbę.
    game.world.chunks.set('0,0', { modified: true, blocks: new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT).fill(STONE) });
    game.world.chunks.set('1,0', { modified: false, blocks: new Uint16Array(8) });
    ola.onMessage({ t: P.MSG.CHUNK_REQUEST, keys: ['0,0', '1,0', 'zle'] });
    const chunks = ola.take(P.MSG.CHUNK);
    check(chunks.length === 2 && P.decodeBlocks(chunks[0].data)[100] === STONE && chunks[1].data === null, 'Chunki na prośbę (niezmieniony - null)');

    // Czat, stan skrzyń, zapis gościa.
    ola.onMessage({ t: P.MSG.CHAT, text: 'cześć' });
    check(ela.take(P.MSG.CHAT)[0]?.name === 'Ola', 'Czat do innych z imieniem');
    ola.onMessage({ t: P.MSG.STATE, sys: 'tables', key: '1,1,1', v: { x: 1, y: 1, z: 1, planks: 'oak_planks', count: 4 } });
    check(game.carpenterTables.tables.get('1,1,1')?.count === 4 && ela.take(P.MSG.STATE).length === 1, 'Stół od gościa - u gospodarza i u innych');
    ola.onMessage({ t: P.MSG.SAVE, player: { x: 9, y: 70, z: 9 }, inventory: { slots: [{ type: 'stone', count: 3 }], selected: 0 } });
    check(game.worldInfo.guests.aaaaaaaaaaaaaaaa.inventory.slots[0].count === 3 && game.worldInfo.guests.aaaaaaaaaaaaaaaa.name === 'Ola', 'Ekwipunek gościa w zapisie gospodarza');

    // Tratwa gościa.
    ola.onMessage({ t: P.MSG.RAFT, v: { id: 500001, x: 3, y: 60, z: 4, yaw: 0, vx: 1, vy: 0, vz: 0 } });
    const raft = game.rafts.bodies.find((body) => body.id === 500001);
    check(raft?.remote && raft.controller?.id === 'aaaaaaaaaaaaaaaa', 'Tratwa gościa u gospodarza (płynie nią gość)');
    host.update(0.2);
    check(ela.take(P.MSG.RAFTS).at(-1)?.l.some((value) => value.id === 500001), 'Tratwy do innych');
    host.update(2);
    check(!raft.remote, 'Gość przestał płynąć - tratwa pływa u gospodarza');
    ola.onMessage({ t: P.MSG.RAFT_REMOVE, id: 500001 });
    check(!game.rafts.bodies.length, 'Tratwa zabrana przez gościa');

    // Wzrost roślin u najbliższego.
    host.players.receive('aaaaaaaaaaaaaaaa', { x: 160, y: 64, z: 0 });
    check(host.ownsChunk({ cx: 0, cz: 0 }) && !host.ownsChunk({ cx: 10, cz: 0 }), 'Rośliny rosną u gracza najbliżej');

    // Wyjście gościa.
    ola.onMessage({ t: P.MSG.BYE });
    check(ela.take(P.MSG.PLAYER_LEAVE).some((message) => message.id === 'aaaaaaaaaaaaaaaa') && !host.players.players.has('aaaaaaaaaaaaaaaa'), 'Wyjście gościa - inni wiedzą');
    // Pełny świat.
    const many = [];
    for (let i = 0; i < 8; i++) {
        const connection = new FakeConnection();
        host.accept(connection);
        connection.onMessage(hello(`c${i}`.padEnd(16, '0')));
        many.push(connection);
    }
    check(many.filter((connection) => connection.take(P.MSG.REJECT).length).length === 2, `Najwyżej ${P.MAX_GUESTS} gości`);
    host.close();
    check(ela.take(P.MSG.BYE).length === 1 && game.net === null, 'Zamknięcie świata - goście dostają pożegnanie');
}

{
    // Gość: zmiany od gospodarza, chunki, tratwy, pora dnia.
    const world = fakeWorld();
    const game = fakeGame(world);
    const client = new NetClient({ name: 'Ola', id: 'aaaaaaaaaaaaaaaa' });
    client.connection = new FakeConnection();
    client.welcome = { world: { seed: 7, speed: 1 }, state: { chests: [], tables: [], fires: [] }, rafts: [], host: { id: 'h', name: 'Kamil' }, players: [], modified: ['2,0'] };
    client.store = new RemoteChunkStore(['2,0']);
    client.store.onRequest = (key) => client.requests.add(key);
    client.hostId = 'h';
    client.attach(game);
    world.chunks.set('0,0', {});
    client.receive({ t: P.MSG.BLOCKS, l: [1, 70, 1, STONE, 40, 70, 1, STONE] });
    check(world.getBlockId(1, 70, 1) === STONE && client.connection.take(P.MSG.BLOCKS).length === 0, 'Zmiana gospodarza w chunku w pamięci - bez odsyłania');
    check(world.getBlockId(40, 70, 1) === 0 && client.store.takeLog('2,0') === null, 'Chunk zmieniony, jeszcze nie pobrany - czeka');
    client.receive({ t: P.MSG.BLOCKS, l: [20, 70, 1, STONE] });
    check(client.store.takeLog('1,0')?.join() === `20,70,1,${STONE}`, 'Chunk poza pamięcią - zmiana po wczytaniu');
    check(!world.chunkGate(2, 0) && world.chunkGate(1, 0), 'Zmieniony chunk czeka na bloki');
    client.flushRequests();
    check(client.connection.take(P.MSG.CHUNK_REQUEST)[0]?.keys.join() === '2,0', 'Prośba o chunk');
    client.receive({ t: P.MSG.CHUNK, key: '2,0', data: P.encodeBlocks(new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT).fill(PLANKS)) });
    check(world.chunkGate(2, 0) && client.store.get('2,0')[5] === PLANKS && world.loadRadius === -1, 'Bloki przyszły - chunk wraca do kolejki');
    world.setBlock(2, 71, 2, 'oak_planks');
    client.flushBlocks();
    check(client.connection.take(P.MSG.BLOCKS)[0]?.l.join() === `2,71,2,${PLANKS}`, 'Zmiana gościa do gospodarza');
    client.receive({ t: P.MSG.TIME, days: 5.5, speed: 0 });
    check(game.time.days === 5.5 && game.time.speed === 0, 'Pora dnia od gospodarza');
    client.receive({ t: P.MSG.RAFTS, l: [{ id: 3, x: 1, y: 60, z: 1, yaw: 0, vx: 0, vy: 0, vz: 0 }] });
    check(game.rafts.bodies.length === 1 && game.rafts.bodies[0].remote, 'Tratwa od gospodarza');
    client.receive({ t: P.MSG.RAFTS, l: [] });
    check(game.rafts.bodies.length === 0, 'Zabrana tratwa znika');
    client.receive({ t: P.MSG.METEOR, x: 5, y: 60, z: 5, fx: 1, fz: 0 });
    check(game.meteorites.spawned?.[1]?.remote === true, 'Meteoryt od gospodarza - bez kopania krateru');
    client.receive({ t: P.MSG.PLAYER_JOIN, id: 'e', name: 'Ela', skin: null });
    client.receive({ t: P.MSG.PLAYER, id: 'e', s: P.packPlayer({ pos: { x: 5, y: 64, z: 5 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 }, null, 0) });
    check(client.players.players.get('e')?.state?.x === 5, 'Inny gracz w świecie');
    let lost = null;
    client.onDisconnect = (reason) => { lost = reason; };
    client.receive({ t: P.MSG.BYE, reason: 'koniec' });
    check(lost === 'koniec' && client.closed, 'Gospodarz zamknął świat - gość wraca do menu');
    check(getBlockTypeById(STONE) === 'stone', 'Numery bloków');
}

{
    // Prawdziwy zapis świata gospodarza (SavedChunkStore): lista kluczy i bloki.
    const game = fakeGame();
    game.world.savedChunks = new SavedChunkStore();
    const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT).fill(STONE);
    blocks[7] = PLANKS;
    game.world.savedChunks.set('3,-2', blocks);
    const host = new NetHost({ name: 'Kamil', id: '0123456789abcdef', skin: () => null });
    host.attach(game);
    const ola = new FakeConnection();
    host.accept(ola);
    ola.onMessage(hello('aaaaaaaaaaaaaaaa'));
    check(ola.take(P.MSG.WELCOME)[0]?.modified.includes('3,-2'), 'Zapisane chunki gospodarza na liście dla gościa');
    ola.onMessage({ t: P.MSG.CHUNK_REQUEST, keys: ['3,-2'] });
    const data = P.decodeBlocks(ola.take(P.MSG.CHUNK)[0]?.data);
    check(data?.[7] === PLANKS && data[8] === STONE, 'Zapisany chunk wysłany gościowi bez zmian');
    host.close();
}

console.log(`OK: gra wieloosobowa - ${checks} sprawdzeń (kody, gracze, chunki, skrzynie, gospodarz, gość).`);
