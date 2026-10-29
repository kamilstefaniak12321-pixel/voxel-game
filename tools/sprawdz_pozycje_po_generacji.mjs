// Wczytanie pozycji po zmianie terenu: prawdziwy Player, Chunk i generator.
// Uruchomienie: node tools/sprawdz_pozycje_po_generacji.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});
const { Player } = await import('../src/player/Player.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { getBlockId, isSolidId } = await import('../src/blocks/BlockRegistry.js');
const { PerspectiveCamera } = await import('three');

const generator = new RealisticGenerator('lighting-rtx3050-0231');
const chunks = new Map();
const loaded = new Set();
const keyFor = (x, z) => `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
const world = {
    spawnPoint: { x: .5, z: .5 },
    ensureColumnLoaded(x, z) {
        const key = keyFor(x, z);
        loaded.add(key);
        if (!chunks.has(key)) {
            const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
            generator.generateChunk(chunk);
            chunks.set(key, chunk);
        }
    },
    getGroundY(x, z) { return generator.compute(x, z, 0, {}).height + 1; },
    getBlockId(x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return 0;
        const chunk = chunks.get(keyFor(x, z));
        assert.ok(chunk, 'Kolizja nie może sprawdzać niezaładowanego chunka');
        return chunk.getId(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE);
    },
    isSolid(x, y, z) { return isSolidId(this.getBlockId(x, y, z)); },
    getFlow() { return null; }
};
const state = (x, y, z, flying = false) => ({ x, y, z, yaw: .6, pitch: -.2, flying });
const player = new Player(world, new PerspectiveCamera());
const untouched = chunks.get('0,0').blocks.slice();

// W 0.25.0 dno starej suchej szczeliny było na 69. Nowy teren ma tu
// powierzchnię 75. Samo setState pozostawiało gracza wewnątrz ziemi.
player.setState(state(.5, 70, .5));
assert.deepEqual(player.getState(), state(.5, 75, .5));
assert.equal(player.collidesAt(player.pos), false);
assert.deepEqual(chunks.get('0,0').blocks, untouched, 'Ratowanie pozycji nie kopie terenu');
const input = { isKeyDown: () => false, consumeKeyPress: () => false, consumeMouseDelta: () => ({ x: 0, y: 0 }) };
for (let frame = 0; frame < 120; frame++) player.update(1 / 60, input);
assert.equal(player.collidesAt(player.pos), false, 'Gracz pozostaje wolny po uruchomieniu fizyki');
assert.ok(Math.abs(player.pos.y - 75) < .001);

// Obrys stojący na narożniku czterech chunków. Wczytanie sąsiadów
// następuje przed kolizją; test odczytu rzuci błąd dla brakującego chunka.
loaded.clear();
player.setState(state(16.05, 10, 16.05));
assert.deepEqual([...loaded].sort(), ['0,0', '0,1', '1,0', '1,1']);
assert.equal(player.collidesAt(player.pos), false);

// Zachowany wykop w zapisanym chunku: komora pod ziemią z sufitem.
// Jej powietrze jest faktycznym stanem bloków, mimo wyższego generatora.
const home = chunks.get('0,0');
for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) {
    for (let y = 20; y <= 21; y++) home.setId(x, y, z, 0);
    home.setId(x, 22, z, getBlockId('stone'));
}
const withCave = home.blocks.slice();
player.setState(state(5.5, 20, 5.5));
assert.deepEqual(player.getState(), state(5.5, 20, 5.5), 'Wolna jaskinia nie przenosi gracza na powierzchnię');
player.setState(state(5.5, 18, 5.5));
assert.equal(player.pos.y, 20, 'W razie kolizji wybieramy najbliższą wolną komorę');
assert.deepEqual(home.blocks, withCave, 'Zapisana komora pozostaje nietknięta');

// Wolny pokój w budowli oraz lot ponad terenem też zachowują pozycję.
for (let x = 8; x <= 10; x++) for (let z = 8; z <= 10; z++) {
    home.setId(x, 90, z, getBlockId('terracotta'));
    for (let y = 91; y <= 93; y++) home.setId(x, y, z, 0);
    home.setId(x, 94, z, getBlockId('terracotta'));
}
const withHouse = home.blocks.slice();
for (const saved of [state(9.5, 91, 9.5), state(9.5, 5000, 9.5, true)]) {
    player.setState(saved);
    assert.deepEqual(player.getState(), saved);
}
assert.deepEqual(home.blocks, withHouse);

// Cała kolumna do limitu budowania: szukanie kończy się nad nią.
for (let y = 0; y < CHUNK_HEIGHT; y++) home.setId(12, y, 12, getBlockId('stone'));
const withTower = home.blocks.slice();
player.setState(state(12.5, 10, 12.5));
assert.equal(player.pos.y, CHUNK_HEIGHT);
assert.equal(player.collidesAt(player.pos), false);
assert.deepEqual(home.blocks, withTower);

console.log('OK: bezpieczny powrót po zasypaniu starej szczeliny; wczytane narożniki; zachowane jaskinia, budowla i lot; bloki nietknięte.');
