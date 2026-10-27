// Regresje łupów: prawdziwe Game, World, BlockBreaker, Chunk i Inventory.
// Uruchomienie: node tools/sprawdz_lupy.mjs (Node 22.15+).
// Opcjonalnie: [katalog-projektu] [plik-Game.js] do porównania wersji.
// Pomijamy tylko tworzenie sceny/renderera, generator terenu i światło.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2]
    ? pathToFileURL(resolve(process.argv[2]) + sep)
    : new URL('../', import.meta.url);
const url = (path) => new URL(path, root).href;
const gameUrl = process.argv[3] ? pathToFileURL(resolve(process.argv[3])).href : url('src/game/Game.js');
const worldUrl = url('src/world/World.js');

// Importujemy całe klasy, bez wycinania ani kopiowania badanych metod.
// Pozostałe zależności Game/World dotyczą grafiki i nie są tu wywoływane.
const realImports = new Map([
    [gameUrl, new Set(['../world/World.js', '../world/Light.js', '../blocks/BlockRegistry.js', '../items/ItemRegistry.js', './Inventory.js', '../config.js'])],
    [worldUrl, new Set(['../blocks/BlockRegistry.js', '../config.js', './Chunk.js', './Light.js'])]
]);
const stubs = new Map();
for (const [parent, allowed] of realImports) {
    const source = readFileSync(new URL(parent), 'utf8');
    for (const [, bindings, specifier] of source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
        if (allowed.has(specifier)) continue;
        const names = bindings.trim().startsWith('{')
            ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}')).split(',').map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean)
            : [];
        const body = names.map((name) => `export const ${name} = undefined;`).join('\n');
        stubs.set(`${parent}|${specifier}`, `data:text/javascript,${encodeURIComponent(body)}`);
    }
}
registerHooks({
    resolve(specifier, context, nextResolve) {
        const stub = stubs.get(`${context.parentURL}|${specifier}`);
        if (stub) return { url: stub, shortCircuit: true };
        if (context.parentURL === gameUrl && realImports.get(gameUrl).has(specifier)) {
            return nextResolve(new URL(specifier, url('src/game/Game.js')).href, context);
        }
        return nextResolve(specifier, context);
    }
});

const { Game } = await import(gameUrl);
const { World } = await import(worldUrl);
const { Inventory, SLOT_COUNT } = await import(url('src/game/Inventory.js'));
const { BlockBreaker } = await import(url('src/interaction/BlockBreaker.js'));
const { ATTACH_OFFSETS, getBlockId, getAttach } = await import(url('src/blocks/BlockRegistry.js'));

function fixture(mode = 'adventure') {
    const world = Object.assign(Object.create(World.prototype), {
        chunks: new Map(), savedChunks: new Map(), dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
        generator: { generateChunk() {} },
        light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
    });
    const notices = [];
    const game = Object.assign(Object.create(Game.prototype), {
        world, mode, inventory: Inventory.load({}, 'adventure'), breaker: new BlockBreaker(world),
        playBlockSound() {}, achieve() {}, debris: { burst() {} }, onNotice: (message) => notices.push(message)
    });
    const set = (x, y, z, type) => assert.equal(world.setBlock(x, y, z, type), true);
    const hit = (x = 0, y = 50, z = 0) => ({ hit: true, block: { x, y, z, type: world.getBlock(x, y, z) } });
    const count = (type) => game.inventory.slots.reduce((n, item) => n + (item?.type === type ? item.count : 0), 0);
    const fill = (type = 'stone') => game.inventory.slots.fill(null).forEach((_, i) => game.inventory.set(i, { type, count: 64 }));
    return { game, world, notices, set, hit, count, fill };
}

function attached(f, type, x = 0, y = 50, z = 0) {
    const attach = getAttach(getBlockId(type));
    assert.ok(attach, `${type} jest dekoracją`);
    const [dx, dy, dz] = ATTACH_OFFSETS[attach];
    const position = [x - dx, y - dy, z - dz];
    f.set(...position, type);
    return position;
}

function fixedRandom(value, run) {
    const original = Math.random;
    Math.random = () => value;
    try { return run(); } finally { Math.random = original; }
}

let checked = 0;
let failed = 0;
function test(name, run) {
    checked++;
    try { run(); console.log(`OK: ${name}`); }
    catch (error) { failed++; console.error(`BŁĄD: ${name}\n${error.stack}`); }
}

test('cztery ściany i wierzch: każdy łup dokładnie raz', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    const positions = ['spruce_wreath', 'spruce_wreath_south', 'spruce_wreath_east', 'spruce_wreath_west', 'oak_leaf_litter'].map((type) => attached(f, type));
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.count('stone'), 1);
    assert.equal(f.count('spruce_wreath'), 4);
    assert.equal(f.count('oak_leaf_litter'), 1);
    for (const p of positions) assert.equal(f.world.getBlock(...p), null);
});

for (const type of ['moss_carpet', 'snow_layer', 'beech_leaf_litter']) {
    test(`${type}: zniszczenie podpory oddaje dekorację`, () => {
        const f = fixture();
        f.set(0, 50, 0, 'stone');
        attached(f, type);
        assert.equal(f.game.breakTarget(f.hit()), true);
        assert.equal(f.count(type), 1);
    });
}

test('pełny ekwipunek: miejsce na podporę nie wystarcza na dekorację', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    attached(f, 'moss_carpet');
    f.fill();
    f.game.inventory.set(0, { type: 'stone', count: 63 });
    const before = JSON.stringify(f.game.inventory.data);
    assert.equal(f.game.breakTarget(f.hit()), false);
    assert.equal(f.world.getBlock(0, 50, 0), 'stone');
    assert.equal(f.world.getBlock(0, 51, 0), 'moss_carpet');
    assert.equal(JSON.stringify(f.game.inventory.data), before);
    assert.deepEqual(f.notices, ['Ekwipunek pełny']);
});

test('dwa rodzaje łupów nie mogą współdzielić ostatniego pustego slotu', () => {
    const f = fixture();
    f.set(0, 50, 0, 'dirt');
    attached(f, 'moss_carpet');
    f.fill();
    f.game.inventory.set(SLOT_COUNT - 1, null);
    assert.equal(f.game.breakTarget(f.hit()), false);
    assert.equal(f.world.getBlock(0, 50, 0), 'dirt');
    assert.equal(f.world.getBlock(0, 51, 0), 'moss_carpet');
    assert.equal(f.game.inventory.get(SLOT_COUNT - 1), null);
});

test('dekoracje sumują ilość w istniejącym stosie', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    attached(f, 'spruce_wreath');
    attached(f, 'spruce_wreath_south');
    f.fill();
    f.game.inventory.set(0, { type: 'stone', count: 63 });
    f.game.inventory.set(1, { type: 'spruce_wreath', count: 63 });
    assert.equal(f.game.breakTarget(f.hit()), false);
    f.game.inventory.set(1, { type: 'spruce_wreath', count: 62 });
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.count('spruce_wreath'), 64);
});

test('dekoracja oparta o inny blok pozostaje i nie daje łupu', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    f.set(1, 50, -1, 'stone');
    f.set(1, 50, 0, 'spruce_wreath');
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.world.getBlock(1, 50, 0), 'spruce_wreath');
    assert.equal(f.count('spruce_wreath'), 0);
});

test('krzak nad ziemią: sadzonka i wszystkie owoce trafiają do ekwipunku', () => fixedRandom(0.999, () => {
    const f = fixture();
    f.set(0, 50, 0, 'grass');
    f.set(0, 51, 0, 'strawberry_bush_full');
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.world.getBlock(0, 51, 0), null);
    assert.equal(f.count('dirt'), 1);
    assert.equal(f.count('strawberry_sapling'), 1);
    assert.equal(f.count('strawberry'), 4);
}));

test('krzak nad ziemią: brak miejsca na całą paczkę zachowuje oba bloki', () => fixedRandom(0.999, () => {
    const f = fixture();
    f.set(0, 50, 0, 'grass');
    f.set(0, 51, 0, 'strawberry_bush_full');
    f.fill();
    f.game.inventory.set(0, { type: 'dirt', count: 63 });
    f.game.inventory.set(1, null);
    assert.equal(f.game.breakTarget(f.hit()), false);
    assert.equal(f.world.getBlock(0, 50, 0), 'grass');
    assert.equal(f.world.getBlock(0, 51, 0), 'strawberry_bush_full');
}));

test('łupy losowe z liści są sprawdzane razem z samym blokiem', () => fixedRandom(0, () => {
    const f = fixture();
    f.set(0, 50, 0, 'oak_leaves');
    f.fill();
    f.game.inventory.set(0, null);
    assert.equal(f.game.breakTarget(f.hit()), false);
    assert.equal(f.world.getBlock(0, 50, 0), 'oak_leaves');
    f.game.inventory.slots.fill(null);
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.count('oak_leaves'), 1);
    assert.equal(f.count('oak_sapling'), 1);
    assert.equal(f.count('acorn'), 1);
}));

test('tryb kreatywny usuwa bloki bez przyznawania łupów', () => {
    const f = fixture('creative');
    f.set(0, 50, 0, 'stone');
    attached(f, 'moss_carpet');
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.world.getBlock(0, 51, 0), null);
    assert.ok(f.game.inventory.slots.every((item) => item === null));
});

test('nieudane niszczenie nie przyznaje żadnych łupów', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    attached(f, 'moss_carpet');
    f.game.breaker.breakBlock = () => false;
    assert.equal(f.game.breakTarget(f.hit()), false);
    assert.equal(f.world.getBlock(0, 51, 0), 'moss_carpet');
    assert.ok(f.game.inventory.slots.every((item) => item === null));
});

test('łup dostają tylko faktycznie usunięte bloki podparte', () => {
    const f = fixture();
    f.set(0, 50, 0, 'stone');
    attached(f, 'moss_carpet');
    // Symulacja zmienionego wyniku operacji: podpora znika, dekoracja zostaje.
    f.game.breaker.breakBlock = () => f.world.getChunk(0, 0).setId(0, 50, 0, 0);
    assert.equal(f.game.breakTarget(f.hit()), true);
    assert.equal(f.count('stone'), 1);
    assert.equal(f.count('moss_carpet'), 0);
});

console.log(`Sprawdzonych przypadków: ${checked}, błędów: ${failed}.`);
process.exitCode = failed ? 1 : 0;
