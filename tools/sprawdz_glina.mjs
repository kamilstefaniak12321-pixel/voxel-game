// ------------------------------------------------------------
// SPRAWDZENIE GLINY (1.1.0)
//
// - trzy gliny: bloki, tekstury, numery, nazwy na mapie,
// - przepisy: mokry kubek, mokra cegła, blok cegieł, napar w każdym kubku,
// - suszenie: tylko leżąc, w dzień, pod gołym niebem, nie w wodzie;
//   cały stos naraz, zapis i odczyt postępu, łączenie stosów,
// - generator: zwykła glina przy wodzie na nizinach, czerwona w ciepłych
//   biomach, biała w górach; płaty, a nie pas; ten sam świat = ta sama glina.
//
// Uruchomienie: node tools/sprawdz_glina.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer { update() {} dispose() {} } export const TABLE_ROTATION = {}; export function productSpot() { return { x: 0, z: 0 }; }' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const { Drops, restoreDrop, dropState } = await import('../src/game/Drops.js');
const { Inventory } = await import('../src/game/Inventory.js');
const R = await import('../src/blocks/BlockRegistry.js');
const I = await import('../src/items/ItemRegistry.js');
const C = await import('../src/items/clay.js');
const { findRecipe, recipesFor } = await import('../src/crafting/Crafting.js');
const { TEAS, ROASTS, FOODS } = await import('../src/items/foods.js');
const { itemUses } = await import('../src/items/uses.js');
const { SOIL_INFO } = await import('../src/world/terrain/rocks.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { TEXTURE_REGIONS, WORLD_ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const { getBlockId } = R;


// --- Rodzaje gliny: bloki, przedmioty, tekstury --------------------------------------

check(C.CLAY_TYPES.join() === 'clay,red_clay,white_clay', 'Trzy gliny');
const ids = new Set();
for (const clay of C.CLAY_TYPES) {
    const block = R.BLOCK_TYPES[clay], bricks = R.BLOCK_TYPES[C.brickBlock(clay)];
    check(block?.solid && block.soil && block.sound === 'mud', `${clay}: blok gliny (ziemia, dźwięk błota)`);
    check(bricks?.solid && bricks.sound === 'stone' && !bricks.soil, `${clay}: blok cegieł (jak kamień)`);
    check(SOIL_INFO[clay]?.name && /^#[0-9a-f]{6}$/.test(SOIL_INFO[clay].color), `${clay}: nazwa i kolor na mapie terenu`);
    ids.add(block.id); ids.add(bricks.id);
    for (const texture of [clay, C.brickBlock(clay)]) {
        check(WORLD_ATLAS_TILES[texture], `${texture}: kafelek w atlasie świata`);
    }
    for (const item of [C.wetCup(clay), C.dryCup(clay), C.wetBrick(clay), C.dryBrick(clay)]) {
        check(I.itemExists(item) && I.getItemLabel(item) !== item, `${item}: przedmiot z polską nazwą`);
        check(TEXTURE_REGIONS[I.ITEM_TYPES[item].icon], `${item}: ikona w atlasie`);
    }
    check(/Mokr/.test(I.getItemLabel(C.wetCup(clay))) && /Mokr/.test(I.getItemLabel(C.wetBrick(clay))), `${clay}: mokre rzeczy mają to w nazwie`);
}
check(ids.size === 6, 'Każdy blok ma własny numer');
check(new Set(C.CLAY_TYPES.flatMap((clay) => [C.wetCup(clay), C.dryCup(clay), C.wetBrick(clay), C.dryBrick(clay)].map(I.getItemLabel))).size === 12, 'Dwanaście różnych nazw');
check(SOIL_INFO.red_clay.color !== SOIL_INFO.clay.color && SOIL_INFO.white_clay.color !== SOIL_INFO.clay.color, 'Gliny różnią się kolorem na mapie');


// --- Przepisy -------------------------------------------------------------------------

for (const clay of C.CLAY_TYPES) {
    check(findRecipe([clay, clay])?.result.join() === `${C.wetCup(clay)},2`, `${clay}: dwie gliny -> 2 mokre kubki`);
    check(findRecipe([clay])?.result.join() === `${C.wetBrick(clay)},2`, `${clay}: jedna glina -> 2 mokre cegły`);
    const brick = C.dryBrick(clay);
    check(findRecipe([brick, brick, brick, brick])?.result.join() === `${C.brickBlock(clay)},1`, `${clay}: cztery suche cegły -> blok`);
    const wet = C.wetBrick(clay);
    check(!findRecipe([wet, wet, wet, wet]), `${clay}: z mokrych cegieł bloku nie ma`);
    check(recipesFor(C.dryCup(clay)).length === 0 && recipesFor(brick).length === 0, `${clay}: suchych rzeczy nie da się wytworzyć - trzeba wysuszyć`);
    for (const { brew, herbs } of Object.values(TEAS)) {
        const herb = Object.keys(I.ITEM_TYPES).concat(Object.keys(R.BLOCK_TYPES)).find((type) => findRecipe([C.dryCup(clay), type, type])?.result[0] === brew);
        check(herb, `${clay}: ${brew} w suchym kubku (${herbs})`);
        check(findRecipe([C.wetCup(clay), herb, herb])?.result[0] !== brew, `${clay}: w mokrym kubku naparu nie ma`);
    }
}
check(!findRecipe(['clay', 'red_clay']), 'Glin nie miesza się w jednym kubku');
check(Object.values(TEAS).every(({ brew, tea }) => ROASTS[brew] === tea && FOODS[tea].returns === 'clay_cup'), 'Napar dalej parzy się nad ogniskiem i oddaje kubek');


// --- Suszenie -------------------------------------------------------------------------

// (1.20.0: doszły garnek i miska do gotowania.)
check(Object.keys(C.DRYING).length === 8 && Object.entries(C.DRYING).every(([wet, dry]) => I.itemExists(wet) && I.itemExists(dry)), 'Osiem rzeczy do suszenia');
check(C.driesInto('wet_clay_cup') === 'clay_cup' && C.driesInto('wet_red_clay_brick') === 'red_clay_brick', 'Mokre -> suche');
check(C.driesInto('clay_cup') === null && C.driesInto('stick') === null && C.driesInto(null) === null && C.driesInto('toString') === null, 'Reszta nie schnie');
check(!C.sunDries(0) && !C.sunDries(5 / 24) && C.sunDries(6 / 24) && C.sunDries(3.5) && C.sunDries(18.9 / 24) && !C.sunDries(19 / 24) && !C.sunDries(7 + 23 / 24), 'Słońce suszy od 6 do 19');
check(C.DRY_SECONDS >= 60 && C.DRY_SECONDS <= 300, 'Suszenie trwa od minuty do pięciu');
check(itemUses('wet_clay_cup').some((use) => /suszenie/.test(use)) && !itemUses('clay_cup').some((use) => /suszenie/.test(use)), 'Opis przedmiotu mówi o suszeniu');

function makeGame({ days = 0.5, sky = 15, water = false } = {}) {
    const achieved = [];
    const game = {
        world: {
            isSolid: (x, y, z) => y <= 10,
            getBlockId: (x, y, z) => (game.water && y === 11 ? getBlockId('water') : 0),
            getLight: () => ({ sky: game.sky, block: 0 }),
            getChunk: () => ({}),
            toChunkCoord: (value) => Math.floor(value / 16)
        },
        time: { days }, sky, water,
        player: { pos: { x: 40.5, y: 11, z: 0.5 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, eyeHeight: 1.6 },
        inventory: Inventory.load({}, 'adventure'),
        sleep: { active: false }, blackout: { active: false },
        achieve: (name, data) => achieved.push([name, data]), achieved
    };
    game.drops = new Drops(game);
    return game;
}
const run = (game, seconds, dt = 0.25) => { for (let t = 0; t < seconds - 1e-9; t += dt) game.drops.update(dt); };
const lay = (game, type, count = 1, x = 0.5) => {
    const drop = game.drops.spawn(type, count, { x, y: 11, z: 0.5 });
    run(game, 2);
    return drop;
};

{
    const game = makeGame();
    const drop = lay(game, 'wet_clay_cup', 3);
    check(drop.rest && drop.type === 'wet_clay_cup', 'Mokry kubek leży na ziemi');
    run(game, C.DRY_SECONDS - 5);
    check(drop.type === 'wet_clay_cup' && drop.dry > C.DRY_SECONDS - 10, 'Przed czasem dalej mokry');
    const version = game.drops.version;
    run(game, 6);
    check(drop.type === 'clay_cup' && drop.count === 3 && drop.dry === 0, 'Po czasie cały stos jest suchy');
    check(game.drops.version > version, 'Zmiana idzie do zapisu i do znajomych');
    check(game.achieved.some(([name, data]) => name === 'dried' && data.type === 'clay_cup' && data.count === 3), 'Gra dowiaduje się o wysuszeniu');
    run(game, C.DRY_SECONDS * 2);
    check(drop.type === 'clay_cup', 'Suchy kubek już się nie zmienia');
}
for (const [wet, dry] of Object.entries(C.DRYING)) {
    const game = makeGame();
    const drop = lay(game, wet);
    run(game, C.DRY_SECONDS + 1);
    check(drop.type === dry, `${wet} wysycha w ${dry}`);
}
for (const [name, options, change] of [
    ['w nocy', { days: 0.95 }, (game) => { game.time.days = 0.5; }],
    ['pod dachem', { sky: 6 }, (game) => { game.sky = 15; }],
    ['w wodzie', { water: true }, (game) => { game.water = false; }]
]) {
    const game = makeGame(options);
    const drop = lay(game, 'wet_red_clay_brick', 8);
    run(game, C.DRY_SECONDS * 2);
    check(drop.type === 'wet_red_clay_brick' && !(drop.dry > 0), `Nie schnie ${name}`);
    change(game);
    run(game, C.DRY_SECONDS + 1);
    check(drop.type === 'red_clay_brick' && drop.count === 8, `Schnie, gdy już nie jest ${name}`);
}
{
    // Noc przerywa suszenie, ale nie cofa postępu.
    const game = makeGame();
    const drop = lay(game, 'wet_white_clay_cup');
    run(game, C.DRY_SECONDS / 2);
    const half = drop.dry;
    game.time.days = 0.9;
    run(game, C.DRY_SECONDS);
    check(drop.dry === half && drop.type === 'wet_white_clay_cup', 'Nocą postęp stoi');
    game.time.days = 1.4;
    run(game, C.DRY_SECONDS / 2 + 3);
    check(drop.type === 'white_clay_cup', 'Rano schnie dalej od tego samego miejsca');
}
{
    // Lecący przedmiot nie schnie; zapis i odczyt trzymają postęp.
    const game = makeGame();
    const flying = game.drops.spawn('wet_clay_brick', 1, { x: 0.5, y: 60, z: 0.5 });
    game.drops.update(0.05);
    check(!flying.rest && !(flying.dry > 0), 'W locie nie schnie');
    const drop = lay(game, 'wet_clay_cup', 2, 8.5);
    run(game, 50);
    const saved = dropState(drop);
    check(saved.dry >= 49 && saved.dry <= 53 && Number.isInteger(saved.dry), 'Postęp suszenia w zapisie');
    check(dropState(lay(makeGame({ days: 0.95 }), 'wet_clay_cup')).dry === undefined, 'Bez postępu zapis jest bez pola');
    const back = restoreDrop(JSON.parse(JSON.stringify(saved)));
    check(back.dry === saved.dry && back.type === 'wet_clay_cup', 'Odczyt oddaje postęp');
    check(restoreDrop({ ...saved, dry: 1e9 }).dry === C.DRY_SECONDS && restoreDrop({ ...saved, dry: -5 }).dry === 0 && restoreDrop({ ...saved, dry: 'x' }).dry === 0, 'Zepsuty postęp w zapisie nie psuje gry');
}
{
    // Świeży mokry kubek dorzucony do prawie suchych: stos schnie od nowa.
    const game = makeGame();
    const first = lay(game, 'wet_clay_cup', 2);
    run(game, C.DRY_SECONDS - 20);
    game.drops.spawn('wet_clay_cup', 1, { x: 0.6, y: 11, z: 0.5 });
    run(game, 3);
    const all = [...game.drops.drops.values()];
    check(all.length === 1 && all[0].count === 3 && all[0].dry < 10, 'Połączony stos jest tak suchy jak świeża część');
    check(first.type === 'wet_clay_cup' || all[0].type === 'wet_clay_cup', 'I dalej mokry');
}


// --- Generator ------------------------------------------------------------------------

const generator = new RealisticGenerator(42);
const gids = generator.ids;
const share = (key, sample, size = 120) => {
    const hit = {};
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
        const id = generator.clayAt(x * 3 + 1000, z * 3 - 700, sample, key);
        if (id) hit[id] = (hit[id] ?? 0) + 1;
    }
    return Object.fromEntries(Object.entries(hit).map(([id, count]) => [R.getBlockTypeById(Number(id)), count / (size * size)]));
};
const bank = { riverGap: 2, lakeGap: Infinity }, lake = { riverGap: Infinity, lakeGap: 3 }, far = { riverGap: 40, lakeGap: Infinity };

for (const key of ['meadow', 'deciduous', 'beech', 'birch', 'pine', 'spruce', 'maple_forest', 'sequoia_forest']) {
    const near = share(key, bank);
    check(Object.keys(near).join() === 'clay' && near.clay > 0.25 && near.clay < 0.75, `${key}: przy rzece płaty zwykłej gliny (${(near.clay * 100).toFixed(0)}%)`);
    check(Object.keys(share(key, far)).length === 0, `${key}: z dala od wody gliny nie ma`);
}
check(share('meadow', lake).clay > 0.25, 'Glina leży też nad jeziorem');
check(share('wetland', bank).clay > 0.3 && share('wetland', far).clay > 0.01 && share('wetland', far).clay < share('wetland', bank).clay, 'Mokradła: glina przy wodzie i trochę dalej');
for (const key of ['olive_grove', 'eucalyptus_forest']) {
    const near = share(key, bank), open = share(key, far);
    check(Object.keys(near).join() === 'red_clay' && Object.keys(open).join() === 'red_clay', `${key}: tylko czerwona glina`);
    check(open.red_clay > 0.005 && open.red_clay < 0.2 && near.red_clay > open.red_clay, `${key}: płaty także z dala od wody (${(open.red_clay * 100).toFixed(1)}%)`);
}
for (const key of ['rocky', 'alpine', 'mugo_scrub']) {
    const near = share(key, bank), open = share(key, far);
    check(Object.keys(near).join() === 'white_clay' && Object.keys(open).join() === 'white_clay', `${key}: tylko biała glina`);
    check(open.white_clay > 0.005 && open.white_clay < 0.2, `${key}: płaty w górach (${(open.white_clay * 100).toFixed(1)}%)`);
}
for (const key of ['sea', 'lake', 'river', 'beach', 'snowy', 'nie_ma_takiego']) {
    check(Object.keys(share(key, bank, 40)).length === 0 && Object.keys(share(key, far, 40)).length === 0, `${key}: bez gliny`);
}
check(generator.clayAt(10, 10, {}, 'olive_grove') === generator.clayAt(10, 10, far, 'olive_grove'), 'Próbka bez odległości do wody = daleko od wody');

// Płaty: glina leży kawałkami (sąsiednie pola zwykle takie same), a nie
// w szachownicę ani jednym pasem.
{
    let same = 0, total = 0, runs = 0, previous = 0;
    for (let x = 0; x < 2000; x++) {
        const now = generator.clayAt(x, 123, bank, 'meadow') ? 1 : 0;
        if (x) { total++; if (now === previous) same++; else runs++; }
        previous = now;
    }
    check(same / total > 0.85 && runs > 20, `Glina przy brzegu leży płatami (${runs} zmian na 2000 bloków)`);
}

// Ten sam świat = ta sama glina; inny świat = inna.
{
    const again = new RealisticGenerator(42), other = new RealisticGenerator(43);
    let equal = true, differs = false;
    for (let i = 0; i < 400; i++) {
        const x = i * 7 - 900, z = i * 13 - 400;
        if (generator.clayAt(x, z, bank, 'meadow') !== again.clayAt(x, z, bank, 'meadow')) equal = false;
        if (generator.clayAt(x, z, bank, 'meadow') !== other.clayAt(x, z, bank, 'meadow')) differs = true;
    }
    check(equal && differs, 'Glina zależy tylko od ziarna świata');
}

// Prawdziwy teren: glina da się znaleźć w rozsądnej odległości od startu,
// na powierzchni, i jest jej mało (to znalezisko, nie dywan).
{
    let land = 0, clay = 0, nearest = Infinity;
    const kinds = new Set();
    for (let z = -1200; z <= 1200; z += 6) for (let x = -1200; x <= 1200; x += 6) {
        const type = generator.surfaceBlock(x, z);
        if (type === 'sand' || type === 'water') continue;
        land++;
        if (!C.CLAY_TYPES.includes(type)) continue;
        clay++; kinds.add(type);
        if (type === 'clay') nearest = Math.min(nearest, Math.hypot(x, z));
    }
    const part = clay / land;
    check(part > 0.002 && part < 0.05, `Glina to ${(part * 100).toFixed(2)}% lądu`);
    check(nearest < 400, `Najbliższa zwykła glina ${nearest.toFixed(0)} bloków od środka świata`);
    console.log(`  teren: glina na ${(part * 100).toFixed(2)}% lądu, najbliższa ${nearest.toFixed(0)} bloków, rodzaje: ${[...kinds].join(', ')}`);
}

// Kolumna chunka: glina na wierzchu ma pod sobą drugą warstwę gliny.
{
    const { Chunk } = await import('../src/world/Chunk.js');
    const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
    let found = null;
    search: for (let z = -1200; z <= 1200; z += 6) for (let x = -1200; x <= 1200; x += 6) {
        if (generator.surfaceBlock(x, z) === 'clay') { found = [x, z]; break search; }
    }
    check(found, 'Jest zwykła glina do sprawdzenia w chunku');
    const [x, z] = found;
    const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    generator.generateChunk(chunk);
    const lx = x - chunk.cx * CHUNK_SIZE, lz = z - chunk.cz * CHUNK_SIZE;
    let top = -1;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) if (chunk.getId(lx, y, lz) === gids.clay) { top = y; break; }
    check(top > 0 && chunk.getId(lx, top - 1, lz) === gids.clay, 'Glina w chunku ma dwa bloki grubości');
    check(!R.BLOCK_TYPES[R.getBlockTypeById(chunk.getId(lx, top + 1, lz))]?.solid, 'I leży na wierzchu - nic twardego nad nią');
}

console.log(`OK: glina - ${checks} sprawdzeń`);
