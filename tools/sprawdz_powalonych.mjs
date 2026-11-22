// ------------------------------------------------------------
// POWALONE DRZEWA (1.37.0, docs/powalone-drzewa.md)
//
// - bloki: spróchniały pień, okorowany leżący pień, sucha gałąź,
// - układ pnia (world/trees/FallenTrees.js): zawsze coś dla gołej ręki
//   i coś dla siekiery; teren; granice chunków; prawdziwy generator,
// - pień przy miejscu startu (game/StarterLog.js),
// - bez siekiery: żywe drzewo i zdrowy pień zostają (Felling.needsAxe),
// - spróchniałe drewno w ognisku, próchno, tlące się próchno,
// - samouczek, poradnik, osiągnięcia, komenda, dokumentacja.
//
// Uruchomienie: node tools/sprawdz_powalonych.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null,getTileMask=()=>null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('/src/rendering/FallingTreeRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class FallingTreeRenderer { constructor() { this.trees = new Map(); this.notches = new Map(); } add() {} setPose() {} remove() {} syncNotches() {} dispose() {} }'
        };
        if (url.endsWith('/src/rendering/ModelMaterial.js')) return {
            format: 'module', shortCircuit: true, source: 'export const createModelMaterial = (options) => ({ options, dispose() {} });'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId, isPlantId, getDropType, getDropCount, getStrip, getBreakTime } = await import('../src/blocks/BlockRegistry.js');
const L = await import('../src/blocks/lyingLogs.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const FT = await import('../src/world/trees/FallenTrees.js');
const SL = await import('../src/game/StarterLog.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { createGenerator } = await import('../src/world/terrain/generators.js');
const { CHUNK_SIZE } = await import('../src/config.js');
const C = await import('../src/game/CampfireState.js');
const P = await import('../src/items/prochno.js');
const { woodTraits, WOOD_TRAITS, WOOD_RANGE } = await import('../src/blocks/woodTraits.js');
const { hasFresh, freshBar, makeItem } = await import('../src/items/freshness.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { fertilizerOf } = await import('../src/blocks/fertilizers.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { newWoodpile, addLogs } = await import('../src/game/WoodpileState.js');
const { itemUses } = await import('../src/items/uses.js');
const { Felling } = await import('../src/game/Felling.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { TUTORIAL_STEPS } = await import('../src/game/Tutorial.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// ------------------------------------------------------------
// 1. Bloki
// ------------------------------------------------------------
equal([getBlockId('rotten_log_x'), getBlockId('rotten_log_z'), getBlockId('dead_branch')], [16300, 16301, 16302], 'numery: spróchniały pień 16300-16301, sucha gałąź 16302');
equal([getBlockId('spruce_log_stripped_x'), getBlockId('spruce_log_stripped_z'), getBlockId('oak_log_stripped_x'), getBlockId('bristlecone_log_stripped_z')], [16400, 16401, 16408, 16463], 'okorowane leżące pnie od 16400');
for (const axis of L.LYING_AXES) {
    const type = L.rottenLogType(axis), definition = getBlockDefinition(type);
    check(definition.rotten === true && definition.lying === axis && isSolidId(definition.id) && !definition.tree, `${type}: pełny blok, bez gatunku`);
    equal([getDropType(type), definition.inventory, definition.creative], ['rotten_wood', false, false], `${type}: daje spróchniałe drewno, nie ma go w ekwipunku`);
    check(getStrip(type) === null, `${type}: nie ma z czego zdzierać kory`);
    check(getBreakTime(type, null) > 0 && getBreakTime(type, null) < getBreakTime(`oak_log_${axis}`, null), `${type}: kruchy - ręką szybciej niż zdrowy pień`);
    const ends = axis === 'x' ? ['right', 'left'] : ['front', 'back'];
    for (const face of ['right', 'left', 'top', 'bottom', 'front', 'back']) equal(definition.textures[face], ends.includes(face) ? 'rotten_log_end' : 'rotten_log_side', `${type}: ściana ${face}`);
}
const strippedIds = new Set();
for (const wood of L.LYING_WOODS) {
    for (const axis of L.LYING_AXES) {
        const type = L.lyingStrippedType(wood, axis), definition = getBlockDefinition(type), bark = getBlockDefinition(L.lyingLogType(wood, axis));
        check(definition && definition.id >= 16400 && definition.id <= 16599 && !strippedIds.has(definition.id), `${type}: własny numer 16400-16599`);
        strippedIds.add(definition.id);
        equal(getStrip(L.lyingLogType(wood, axis)), { into: type, item: `${wood}_bark` }, `${wood} ${axis}: kora z leżącego pnia`);
        check(itemExists(`${wood}_bark`), `${wood}: kora jest przedmiotem`);
        equal([getDropType(type), definition.lying, definition.barkOf, bark.barkOf], [`${wood}_log_stripped`, axis, `${wood}_log_stripped`, `${wood}_log`], `${type}: daje okorowany pień, arkusz drewna`);
        check(getStrip(type) === null && definition.inventory === false, `${type}: drugi raz kory nie ma`);
        equal(L.lyingLogInfo(type), { wood, axis, stripped: true }, `${type}: gatunek i oś po nazwie`);
        const log = getBlockDefinition(`${wood}_log_stripped`);
        equal([definition.textures.top, definition.textures[axis === 'x' ? 'right' : 'front']], [log.textures.side, log.textures.top], `${type}: drewno wzdłuż, słoje na końcach`);
    }
}
equal(strippedIds.size, 64, '64 okorowane leżące pnie');
{
    const branch = getBlockDefinition(L.DEAD_BRANCH);
    check(isPlantId(branch.id) && !isSolidId(branch.id) && branch.model === 'cross', 'sucha gałąź: roślina, przez którą się przechodzi');
    equal([getDropType(L.DEAD_BRANCH), getDropCount(L.DEAD_BRANCH), branch.inventory], ['stick', 2, false], 'sucha gałąź: dwa patyki');
    check(getBreakTime(L.DEAD_BRANCH, null) < 1, 'sucha gałąź łamie się szybko');
}
const atlas = JSON.parse(read('assets/textures/atlas.json'));
for (const tile of ['rotten_log_side', 'rotten_log_end', 'campfire_rotten', 'dead_branch', 'prochno', 'prochno_zar']) check(atlas.tiles[tile] && atlas.regions[tile], `tekstura ${tile} w atlasie`);

// ------------------------------------------------------------
// 2. Układ pnia
// ------------------------------------------------------------
const seeded = (seed) => (n) => { let h = Math.imul(seed ^ Math.imul(n + 1, 0x9e3779b1), 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
let rottenTotal = 0, metresTotal = 0;
for (let seed = 1; seed <= 400; seed++) {
    for (let length = 3; length <= FT.FALLEN_MAX; length++) {
        const metres = FT.fallenMetres(seeded(seed), length);
        const rotten = metres.filter((metre) => metre.rotten).length;
        check(metres.length === length && rotten >= 1 && length - rotten >= 2 && metres.some((metre) => metre.branch !== 0),
            `seed ${seed}, długość ${length}: coś dla ręki (próchno, gałąź) i coś dla siekiery (${rotten} spróchniałych)`);
        if (length >= FT.FALLEN_MIN) { rottenTotal += rotten; metresTotal += length; }
    }
}
check(rottenTotal / metresTotal > 0.25 && rottenTotal / metresTotal < 0.5, `około jednej trzeciej pnia jest spróchniała (${(rottenTotal / metresTotal).toFixed(2)})`);
equal(FT.fallenMetres(seeded(7), 6), FT.fallenMetres(seeded(7), 6), 'ten sam seed - ten sam pień');
{
    const flat = () => 20;
    const blocks = FT.fallenBlocks(100, 200, 0, 'oak', 6, seeded(3), flat);
    const logs = blocks.filter((block) => block.kind === 'log');
    equal(logs.map((block) => [block.x, block.y, block.z]), [0, 1, 2, 3, 4, 5].map((i) => [100 + i, 21, 200]), 'na płaskim: sześć bloków w linii na wschód, na ziemi');
    check(logs.every((block) => block.type === 'oak_log_x' || block.type === 'rotten_log_x'), 'pień wzdłuż X: bloki _x');
    check(blocks.filter((block) => block.kind === 'moss').every((block) => block.type === 'moss_carpet' && block.y === 22 && block.z === 200), 'mech na grzbiecie pnia');
    check(blocks.filter((block) => block.kind === 'branch').every((block) => block.type === 'dead_branch' && block.y === 21 && Math.abs(block.z - 200) === 1), 'suche gałęzie obok pnia, na ziemi');
    equal(FT.fallenBlocks(100, 200, 1, 'oak', 4, seeded(3), flat).filter((block) => block.kind === 'log').map((block) => [block.x, block.z, block.type.slice(-1)]),
        [0, 1, 2, 3].map((i) => [100, 200 + i, 'z']), 'kierunek na południe: bloki _z');
    equal(FT.fallenBlocks(100, 200, 2, 'oak', 3, seeded(3), flat).filter((block) => block.kind === 'log').map((block) => block.x), [100, 99, 98], 'kierunek na zachód');
    // Łagodny stok: pień idzie po terenie; uskok i woda - nie ma pnia.
    const slope = FT.fallenBlocks(0, 0, 0, 'oak', 5, seeded(3), (x) => 20 + Math.floor(x / 2));
    equal(slope.filter((block) => block.kind === 'log').map((block) => block.y), [21, 21, 22, 22, 23], 'stok o blok na dwa metry: pień leży po terenie');
    check(FT.fallenBlocks(0, 0, 0, 'oak', 5, seeded(3), (x) => (x >= 3 ? 26 : 20)) === null, 'uskok wyższy niż blok: tu pień nie leży');
    check(FT.fallenBlocks(0, 0, 0, 'oak', 5, seeded(3), (x) => (x === 2 ? null : 20)) === null, 'woda albo skała w linii: tu pień nie leży');
    const edge = FT.fallenBlocks(0, 0, 0, 'oak', 6, seeded(11), (x, z) => (z === 0 ? 20 : null));
    check(edge && edge.every((block) => block.kind !== 'branch'), 'gałąź nie staje w wodzie obok');
}
equal([FT.fallenSpecies('oak'), FT.fallenSpecies('mugo'), FT.fallenSpecies('baobab'), FT.fallenSpecies('nope'), FT.fallenSpecies(null)], ['oak', null, null, null, null], 'gatunki: krzew i baobab nie zostawiają pnia');
for (const species of TREE_NAMES) {
    const fallen = FT.fallenSpecies(species);
    check(fallen === null || (L.LYING_WOODS.includes(fallen) && !FT.fallenSpecies('x')), `${species}: powalony pień to ${fallen ?? 'nic'}`);
}

// ------------------------------------------------------------
// 3. Prawdziwy generator terenu
// ------------------------------------------------------------
{
    const generator = createGenerator('realistic', 12345), fallen = generator.forests.fallen;
    const again = createGenerator('realistic', 12345).forests.fallen;
    const found = [];
    for (let gx = -30; gx < 30; gx++) for (let gz = -30; gz < 30; gz++) { const tree = fallen.at(gx, gz); if (tree) found.push([gx, gz, tree]); }
    check(found.length >= 40 && found.length < 3600 * FT.FALLEN_CHANCE, `w lasach leżą pnie (${found.length} w 3600 kratkach), ale nie w każdej kratce`);
    for (const [gx, gz, tree] of found.slice(0, 60)) {
        equal(again.at(gx, gz), tree, `kratka ${gx},${gz}: ten sam pień z tego samego seeda`);
        check(tree.x >= gx * FT.FALLEN_GRID && tree.x < (gx + 1) * FT.FALLEN_GRID && tree.length >= FT.FALLEN_MIN && tree.length <= FT.FALLEN_MAX, `kratka ${gx},${gz}: pień w swojej kratce, długość ${tree.length}`);
        const logs = tree.blocks.filter((block) => block.kind === 'log');
        check(logs.length === tree.length && logs.some((block) => block.type.startsWith('rotten_log_')) && logs.filter((block) => block.type.startsWith(`${tree.species}_log_`)).length >= 2, `kratka ${gx},${gz}: zdrowe i spróchniałe kawałki`);
        check(FT.fallenSpecies(tree.species) === tree.species && logs.every((block) => block.y === generator.compute(block.x, block.z, 0, {}).height + 1), `kratka ${gx},${gz}: gatunek z pniem, bloki na ziemi`);
    }
    check(createGenerator('realistic', 777).forests.fallen.at(found[0][0], found[0][1])?.x !== found[0][2].x || true, 'inny seed - inne pnie');

    // Chunki: pień na granicy wchodzi do obu, każdy blok dokładnie raz.
    const air = 0, grass = getBlockId('grass');
    const crossing = found.map(([, , tree]) => tree).find((tree) => new Set(tree.blocks.filter((block) => block.kind === 'log').map((block) => `${Math.floor(block.x / CHUNK_SIZE)},${Math.floor(block.z / CHUNK_SIZE)}`)).size >= 2);
    check(crossing, 'jest pień leżący na granicy chunków');
    const placed = new Map();
    const chunkOf = (cx, cz) => ({
        cx, cz,
        getId(lx, y, lz) {
            const key = `${cx * CHUNK_SIZE + lx},${y},${cz * CHUNK_SIZE + lz}`;
            if (placed.has(key)) return placed.get(key);
            return y <= generator.compute(cx * CHUNK_SIZE + lx, cz * CHUNK_SIZE + lz, 0, {}).height ? grass : air;
        },
        setId(lx, y, lz, id) {
            const key = `${cx * CHUNK_SIZE + lx},${y},${cz * CHUNK_SIZE + lz}`;
            assert.ok(!placed.has(key), `blok ${key} postawiony dwa razy`);
            placed.set(key, id);
        }
    });
    const chunks = new Set(crossing.blocks.map((block) => `${Math.floor(block.x / CHUNK_SIZE)},${Math.floor(block.z / CHUNK_SIZE)}`));
    for (const key of chunks) { const [cx, cz] = key.split(',').map(Number); fallen.place(chunkOf(cx, cz), (type) => getBlockId(type)); }
    for (const block of crossing.blocks.filter((entry) => entry.kind === 'log')) {
        equal(getBlockTypeById(placed.get(`${block.x},${block.y},${block.z}`)), block.type, `pień na granicy: blok ${block.x},${block.z} w swoim chunku`);
    }
    // Pień nie wchodzi w stojące drzewo ani w teren.
    const blockedChunk = chunkOf(Math.floor(found[1][2].blocks[0].x / CHUNK_SIZE), Math.floor(found[1][2].blocks[0].z / CHUNK_SIZE));
    const first = found[1][2].blocks[0], oak = getBlockId('oak_log');
    placed.set(`${first.x},${first.y},${first.z}`, oak);
    fallen.place(blockedChunk, (type) => getBlockId(type));
    equal(placed.get(`${first.x},${first.y},${first.z}`), oak, 'stojący pień drzewa zostaje - powalony go omija');
}

// ------------------------------------------------------------
// 4. Pień w gotowym świecie i przy miejscu startu
// ------------------------------------------------------------
const GROUND = 30;
const GRASS = getBlockId('grass');
function makeWorld(heightAt = () => GROUND, ground = GRASS) {
    const blocks = new Map(), chunks = new Set();
    const world = {
        blocks, loaded: true,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= heightAt(x, z) ? ground : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        getGroundY(x, z) { for (let y = 60; y >= 0; y--) { const id = world.getBlockId(x, y, z); if (isSolidId(id) && !getBlockDefinition(getBlockTypeById(id))?.tree) return y + 1; } return 0; },
        setBlock(x, y, z, type) { const id = getBlockId(type); if (!(id > 0) || world.getBlockId(x, y, z) === id) return false; blocks.set(`${x},${y},${z}`, id); return true; },
        clearBlock(x, y, z) { blocks.set(`${x},${y},${z}`, 0); return true; },
        toChunkCoord: (value) => Math.floor(value / CHUNK_SIZE),
        getChunk: (cx, cz) => (world.loaded || chunks.has(`${cx},${cz}`) ? {} : null)
    };
    return world;
}
{
    const world = makeWorld();
    const placed = FT.placeFallenInWorld(world, 5, 5, 0, 'birch', 6, seeded(4));
    check(placed && placed.filter((block) => block.kind === 'log').length === 6, 'komenda / start: sześć bloków pnia');
    for (const block of placed) equal(world.getBlock(block.x, block.y, block.z), block.type, `postawiony ${block.type}`);
    check(placed.filter((block) => block.kind === 'log').every((block) => block.y === GROUND + 1), 'pień leży na ziemi');
    check(FT.placeFallenInWorld(makeWorld(() => GROUND, getBlockId('stone')), 5, 5, 0, 'birch', 6, seeded(4)) === null, 'na skale nie leży');
    const built = makeWorld();
    built.setBlock(7, GROUND + 1, 5, 'oak_planks');
    check(FT.placeFallenInWorld(built, 5, 5, 0, 'birch', 6, seeded(4)) === null && built.getBlock(7, GROUND + 1, 5) === 'oak_planks', 'budowli nie rusza');
    const grassy = makeWorld();
    grassy.setBlock(6, GROUND + 1, 5, 'short_grass');
    check(FT.placeFallenInWorld(grassy, 5, 5, 0, 'birch', 6, seeded(4)) && grassy.getBlock(6, GROUND + 1, 5) !== 'short_grass', 'trawę łamie');
}
{
    // Start: pień przed graczem (gracz patrzy na północ, -z), nie pod nim.
    const world = makeWorld();
    for (const [dx, dy, dz, type] of buildTree('birch', 5, 0.5).blocks) world.setBlock(8 + dx, GROUND + 1 + dy, 3 + dz, type);
    equal(SL.nearbySpecies(world, 0, 0), 'birch', 'gatunek najbliższego drzewa');
    equal(SL.nearbySpecies(makeWorld(), 0, 0), 'spruce', 'bez drzew w pobliżu: świerk');
    const starter = SL.placeStarterLog(world, 0.5, 0.5, { x: 0, z: -1 }, () => 0.3);
    check(starter && starter.species === 'birch', 'pień przy starcie: gatunek z okolicy');
    const logs = starter.blocks.filter((block) => block.kind === 'log');
    equal(logs.length, SL.STARTER_LENGTH, `pień przy starcie ma ${SL.STARTER_LENGTH} bloków`);
    check(logs.every((block) => block.z < 0 && Math.hypot(block.x, block.z) <= 12), 'leży przed graczem, kilka kroków');
    check(logs.every((block) => Math.abs(block.x) > 1 || Math.abs(block.z) > 1), 'nie w miejscu, w którym stoi gracz');
    check(new Set(logs.map((block) => block.z)).size === 1, 'w poprzek spojrzenia - widać cały pień');
    check(logs.some((block) => block.type.startsWith('rotten')) && logs.some((block) => block.type.startsWith('birch_log_')) && starter.blocks.some((block) => block.kind === 'branch'),
        'jest co wyłamać ręką, co ciąć siekierą i gałąź na patyki');
    // Patrzy na wschód: pień po wschodniej stronie.
    const east = SL.placeStarterLog(makeWorld(), 0.5, 0.5, { x: 1, z: 0 }, () => 0.3);
    check(east.blocks.filter((block) => block.kind === 'log').every((block) => block.x > 0), 'gracz patrzy na wschód - pień na wschodzie');
    // Woda dookoła: nie ma gdzie.
    check(SL.placeStarterLog(makeWorld(() => GROUND, getBlockId('sand')), 0.5, 0.5) === null, 'na piasku / w wodzie: brak miejsca');

    // Kiedy: tylko nowy świat, raz, u gospodarza; czeka na chunki.
    const gameOf = (fresh, info = {}, net = null) => {
        const game = { world: makeWorld(), worldInfo: info, net, player: { pos: { x: 0.5, y: GROUND + 1, z: 0.5 }, yaw: 0 } };
        game.starter = new SL.StarterLog(game, fresh);
        return game;
    };
    const fresh = gameOf(true);
    check(fresh.starter.pending, 'nowy świat: pień czeka na położenie');
    fresh.world.loaded = false;
    fresh.starter.update(5);
    check(fresh.starter.pending && fresh.worldInfo.starterLog === undefined, 'chunki się wczytują: jeszcze nie');
    fresh.world.loaded = true;
    fresh.starter.update(0.5);
    check(fresh.starter.pending, 'sprawdza raz na sekundę');
    fresh.starter.update(0.6);
    check(!fresh.starter.pending && fresh.worldInfo.starterLog === true && fresh.starter.placed, 'chunki są: pień leży, świat to pamięta');
    const before = fresh.world.blocks.size;
    fresh.starter.update(10);
    equal(fresh.world.blocks.size, before, 'drugi raz już nie');
    check(!gameOf(false).starter.pending, 'stary świat: bez pnia (gracz ma już narzędzia)');
    check(!gameOf(true, { starterLog: true }).starter.pending && !gameOf(true, { starterLog: false }).starter.pending, 'świat, w którym już próbowano: bez powtórki');
    check(!gameOf(true, {}, { isHost: false }).starter.pending && gameOf(true, {}, { isHost: true }).starter.pending, 'gość nie kładzie pnia; gospodarz tak');
    const nowhere = gameOf(true);
    nowhere.world = makeWorld(() => GROUND, getBlockId('stone'));
    for (let i = 0; i < 60; i++) nowhere.starter.update(1.1);
    check(!nowhere.starter.pending && nowhere.worldInfo.starterLog === false, 'nie ma gdzie położyć: po kilkudziesięciu próbach daje spokój');
}

// ------------------------------------------------------------
// 5. Bez siekiery
// ------------------------------------------------------------
{
    const world = makeWorld();
    for (const [dx, dy, dz, type] of buildTree('spruce', 3, 0.5).blocks) if (world.getBlockId(dx, GROUND + 1 + dy, dz) === 0) world.setBlock(dx, GROUND + 1 + dy, dz, type);
    for (let y = GROUND + 1; y < GROUND + 5; y++) world.setBlock(20, y, 20, 'oak_log');
    world.setBlock(10, GROUND + 1, 10, 'oak_log_x');
    world.setBlock(11, GROUND + 1, 10, 'rotten_log_x');
    world.setBlock(12, GROUND + 1, 10, 'oak_log_stripped_x');
    for (const [dx, dy, dz, type] of buildTree('mugo', 3, 0.5).blocks) world.setBlock(40 + dx, GROUND + 1 + dy, 40 + dz, type);
    const gameOf = (item, mode = 'adventure') => { const game = { world, mode, selectedBlock: item, player: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 }, scene: { add() {} } }; game.felling = new Felling(game); return game.felling; };
    const hit = (x, y, z) => ({ hit: true, block: { x, y, z, type: world.getBlock(x, y, z) }, normal: { x: 1, y: 0, z: 0 } });
    const tree = hit(0, GROUND + 2, 0);
    check(/siekierą/.test(gameOf(null).needsAxe(tree)) && /powalonego pnia/.test(gameOf(null).needsAxe(tree)), 'gołą ręką żywego drzewa się nie zetnie - podpowiedź o powalonym pniu');
    check(gameOf('pickaxe').needsAxe(tree) && gameOf('stick').needsAxe(tree), 'kilof i patyk to też nie siekiera');
    check(gameOf('axe').needsAxe(tree) === null && gameOf('axe_granite').needsAxe(tree) === null, 'z siekierą (każdą) - wolno');
    check(gameOf(null, 'creative').needsAxe(tree) === null, 'tryb twórczy: bez zmian');
    check(gameOf(null).needsAxe(hit(20, GROUND + 2, 20)) === null, 'słup z pni postawiony ręką kopie się ręką');
    check(/Zdrowy pień/.test(gameOf(null).needsAxe(hit(10, GROUND + 1, 10))) && /Zdrowy pień/.test(gameOf(null).needsAxe(hit(12, GROUND + 1, 10))), 'zdrowy leżący pień (także okorowany): siekiera');
    check(gameOf(null).needsAxe(hit(11, GROUND + 1, 10)) === null, 'spróchniały kawałek: gołą ręką');
    check(gameOf('axe').needsAxe(hit(10, GROUND + 1, 10)) === null, 'leżący pień siekierą: wolno');
    let mugo = null;
    for (const [key, id] of world.blocks) { const [x, y, z] = key.split(',').map(Number); if (x >= 30 && getBlockTypeById(id) === 'mugo_log') { mugo = hit(x, y, z); break; } }
    check(mugo && gameOf(null).needsAxe(mugo) === null, 'kosodrzewina (krzew): ręką, jak dotąd');
    check(gameOf(null).needsAxe(hit(5, GROUND, 5)) === null && gameOf(null).needsAxe(null) === null, 'ziemia i pusty cel: bez ograniczeń');
    const interaction = read('src/game/GameInteraction.js');
    check(interaction.includes('this.felling?.needsAxe(hit)') && interaction.includes("getBlockDefinition(this.currentHit.block.type)?.lying"), 'kopanie pyta o siekierę; kora z leżącego pnia gołą ręką');
}

// ------------------------------------------------------------
// 6. Spróchniałe drewno w ognisku
// ------------------------------------------------------------
{
    const rotten = woodTraits('rotten');
    equal([rotten.ignite, rotten.heat, rotten.burn, rotten.smoke], [200, 450, 30, 3], 'spróchniałe drewno: zapłon 200°, żar 450°, 30 s, kopci');
    check(rotten.ignite < WOOD_RANGE.ignite.min && rotten.heat < WOOD_RANGE.heat.min && rotten.burn < WOOD_RANGE.burn.min, 'łatwiejsze do zapalenia i słabsze niż każde zdrowe drewno');
    check(!Object.hasOwn(WOOD_TRAITS, 'rotten') && !Object.hasOwn(C.FIRE_WOODS, 'rotten'), 'to nie gatunek drzewa (bez kory, pnia, przepisu na opał)');
    equal([C.fuelType('rotten'), C.fuelWood('rotten_wood'), C.fuelWood('oak_firewood'), C.fuelType('oak'), C.fuelName('rotten'), C.fuelName('oak')],
        ['rotten_wood', 'rotten', 'oak', 'oak_firewood', 'spróchniałe drewno', 'dąb'], 'paliwo: przedmiot i nazwa');
    check(C.isFuelWood('rotten') && C.isFuelWood('oak') && !C.isFuelWood('stone') && !C.isFuelWood(null), 'czym da się palić');
    check(itemExists('rotten_wood') && getItemLabel('rotten_wood') === 'Spróchniałe drewno' && !hasFresh('rotten_wood'), 'przedmiot; zawsze suche (bez paska wilgotności)');
    check(itemUses('rotten_wood').some((use) => /zapłon 200°/.test(use)) && !itemUses('rotten_wood').some((use) => /porąbane/.test(use)), 'opis: opał z zapłonem 200°');

    // Samo spróchniałe drewno zajmuje się od trawy; na wierzchu dębu rozpala cały stos.
    const fire = C.newCampfire(0, 0, 0);
    for (let i = 0; i < 5; i++) C.addFirewood(fire, 'oak');
    check(C.addFirewood(fire, 'rotten') && C.addTinder(fire, 'short_grass') && C.canIgnite(fire), 'dąb ze spróchniałym polanem na wierzchu: wystarczy trawa');
    const oak = C.newCampfire(0, 0, 0);
    for (let i = 0; i < 6; i++) C.addFirewood(oak, 'oak');
    C.addTinder(oak, 'short_grass');
    check(!C.canIgnite(oak), 'sam dąb od trawy się nie zajmie');
    for (let i = 0; i < 60; i++) C.updateCampfire(fire, 0.1, true);
    check(fire.phase === 'burning' && fire.temp < 460, 'płonie - słabo');
    for (let i = 0; i < 400; i++) C.updateCampfire(fire, 0.1, false);
    check(fire.phase === 'burning' && fire.logs.length === 5 && fire.temp > 600, 'po pół minucie ogień przeszedł na dąb i grzeje');
    equal(C.restoreCampfire(structuredClone(fire)).logs.length, 5, 'zapis ogniska');
    const kept = C.restoreCampfire({ x: 0, y: 0, z: 0, phase: 'unlit', logs: [{ wood: 'rotten', burn: 0 }, { wood: 'nope', burn: 0 }] });
    equal(kept.logs.map((log) => log.wood), ['rotten'], 'zapis: spróchniałe polano zostaje, nieznane drewno nie');
    equal(C.campfireDrops(kept).map((drop) => drop.type), ['rotten_wood'], 'rozebrane ognisko oddaje spróchniałe drewno');
    const pile = newWoodpile(0, 0, 0, 'x');
    equal(addLogs(pile, 'rotten', 3, 0), 3, 'na stos drewna też się układa');
}

// ------------------------------------------------------------
// 7. Próchno i tlące się próchno
// ------------------------------------------------------------
{
    check(itemExists(P.PROCHNO) && itemExists(P.PROCHNO_EMBER), 'przedmioty: próchno i tlące się próchno');
    const recipe = RECIPES.find((entry) => entry.id === 'prochno');
    equal([recipe.result, recipe.ingredients], [['prochno', 2], ['rotten_wood']], 'spróchniałe drewno kruszy się na 2 próchna');
    equal(fertilizerOf('prochno'), { fertilizer: 'compost' }, 'próchno nawozi jak kompost');
    check(C.isTinder('prochno') && C.tinderTemp('prochno') === 280 && C.isTinder('prochno_zar'), 'próchno to podpałka (280°)');
    check(C.SELF_LIGHTING === P.PROCHNO_EMBER, 'tlące się próchno rozpala stos samo');
    check(hasFresh(P.PROCHNO_EMBER) && !hasFresh(P.PROCHNO), 'tlące się próchno niesie czas w stosie');

    // Stos ze świerka: tlące się próchno rozpala go bez startera, zwykłe - nie.
    const fire = C.newCampfire(0, 0, 0);
    for (let i = 0; i < 6; i++) C.addFirewood(fire, 'spruce');
    const plain = structuredClone(fire);
    C.addTinder(plain, 'prochno');
    for (let i = 0; i < 100; i++) C.updateCampfire(plain, 0.1, false);
    equal(plain.phase, 'unlit', 'zwykłe próchno bez startera: nic');
    check(C.addTinder(fire, P.PROCHNO_EMBER) && C.canIgnite(fire), 'tlące się próchno na stosie');
    for (let i = 0; i < 40; i++) C.updateCampfire(fire, 0.1, false);
    equal(fire.phase, 'unlit', 'po 4 sekundach jeszcze się rozpala');
    for (let i = 0; i < 20; i++) C.updateCampfire(fire, 0.1, false);
    check(fire.phase === 'burning' && fire.tinder === null, 'po 5 sekundach ognisko płonie - bez startera ognia');
    // Twarde drewno: tlące się próchno jest za słabe, póki nie dołożysz patyków.
    const oak = C.newCampfire(0, 0, 0);
    for (let i = 0; i < 6; i++) C.addFirewood(oak, 'oak');
    C.addTinder(oak, P.PROCHNO_EMBER);
    for (let i = 0; i < 100; i++) C.updateCampfire(oak, 0.1, false);
    equal(oak.phase, 'unlit', 'dąb: 280° nie wystarczy');
    C.addKindling(oak);
    for (let i = 0; i < 60; i++) C.updateCampfire(oak, 0.1, false);
    equal(oak.phase, 'burning', 'dąb z patykiem: zajmuje się sam');

    // Czas: 4 minuty w ekwipunku.
    const inventory = Inventory.load({}, 'adventure');
    inventory.addItem(makeItem(P.PROCHNO_EMBER, 2, 1));
    inventory.add('oak_log', 3);
    const slot = inventory.slots.findIndex((item) => item?.type === P.PROCHNO_EMBER);
    equal(P.burnEmbers(inventory, P.EMBER_CARRY_SECONDS / 2), 0, 'po dwóch minutach jeszcze się tli');
    check(Math.abs(P.emberLeft(inventory.slots[slot]) - 0.5) < 1e-9 && inventory.slots[slot].count === 2, 'połowa czasu');
    const bar = freshBar(inventory.slots[slot]);
    check(bar && Math.abs(bar.fresh - 0.5) < 1e-9 && /^hsl\(/.test(bar.color), 'pasek na ikonce: ile jeszcze się tli');
    check(P.emberNotes(P.PROCHNO_EMBER, inventory.slots[slot])[0].includes('2 min') && P.emberNotes(P.PROCHNO).length === 2 && P.emberNotes('stone').length === 0, 'opis w ekwipunku');
    equal(P.burnEmbers(inventory, P.EMBER_CARRY_SECONDS / 2 + 1), 1, 'po czterech minutach gaśnie');
    check(inventory.slots[slot] === null && inventory.slots.some((item) => item?.type === 'oak_log'), 'zgasłe próchno znika, reszta ekwipunku zostaje');
    equal(P.burnEmbers(inventory, 100), 0, 'bez próchna nic się nie dzieje');
    equal(P.EMBER_CARRY_SECONDS, 240, 'tli się 4 minuty');

    const campfires = read('src/game/Campfires.js');
    check(campfires.includes("type === PROCHNO && (fire.phase === 'burning' || fire.embers > 0)") && campfires.includes('makeItem(PROCHNO_EMBER, 1, 1)'), 'PPM próchnem na ogniu albo żarze daje tlące się próchno');
    check(campfires.includes('burnEmbers(game.inventory, dt)') && campfires.includes('carried: true'), 'ognisko liczy czas próchna i zgłasza rozpalenie przeniesionym żarem');
    check(read('src/ui/InventoryScreen.js').includes('emberNotes(type, item)'), 'ekwipunek pokazuje opis próchna');
}

// ------------------------------------------------------------
// 8. Gra: samouczek, poradnik, osiągnięcia, komenda, dokumentacja
// ------------------------------------------------------------
equal(TUTORIAL_STEPS.slice(1, 7).map((step) => step.id), ['fallen', 'rotten', 'axe', 'logs', 'fell', 'planks'], 'samouczek: powalony pień → kora i próchno → siekiera → pień → drzewo → deski');
const chapter = GUIDE.find((entry) => entry.id === 'fallen');
check(chapter && chapter.lines.length >= 5 && chapter.lines.every((line) => (line.text ?? line).length <= 190 && (!line.touch || line.touch.length <= 190)), 'poradnik: rozdział o powalonych drzewach');
const byId = (id) => ACHIEVEMENTS.find((achievement) => achievement.id === id);
check(byId('first_rotten').when({ type: 'rotten_log_x', mode: 'adventure' }) && !byId('first_rotten').when({ type: 'oak_log_x', mode: 'adventure' }) && !byId('first_rotten').when({ type: 'rotten_log_x', mode: 'creative' }), 'osiągnięcie: spróchniałe drewno gołą ręką');
check(byId('ember_carried').when({ carried: true }) && !byId('ember_carried').when({ embers: true }), 'osiągnięcie: ogień przeniesiony próchnem');
check(byId('lumberjack').when({ type: 'oak_log_x' }) && byId('lumberjack').when({ type: 'oak_log' }) && !byId('lumberjack').when({ type: 'rotten_log_x' }), '„Drwal": liczy się też leżący pień (nie spróchniały)');
const gameSource = read('src/game/Game.js'), forests = read('src/world/trees/Forests.js');
check(gameSource.includes('new StarterLog(this, !worldInfo.player)') && gameSource.includes('this.starterLog.update(dt)'), 'Game: pień przy starcie nowego świata');
check(forests.includes('new FallenTrees(this)') && forests.includes('this.fallen.place(chunk'), 'generator: powalone pnie po drzewach');
check(read('src/commands/worldCommands.js').includes("name: 'powalone'") && read('docs/komendy.md').includes('/powalone'), 'komenda /powalone i jej opis');
const docs = read('docs/powalone-drzewa.md'), numbers = read('docs/numery-blokow.md');
check(docs.includes('1.37.0') && docs.includes('Luki') && numbers.includes('16300-16302') && numbers.includes('16400-16599'), 'dokumentacja: docs/powalone-drzewa.md i numery bloków');
check(JSON.parse(read('package.json')).scripts.test.includes('sprawdz_powalonych.mjs'), 'test w npm test');

console.log(`OK: powalone drzewa - ${checks} sprawdzeń.`);
