// ------------------------------------------------------------
// SPRAWDZENIE PIĘCIU NOWYCH DRZEW I ICH BIOMÓW (0.83.0)
//
// Klon jesienny, kosodrzewina, oliwka, eukaliptus tęczowy i sekwoja
// z paczek Kamila:
// - bloki: stałe numery 1030-1079, części, okorowanie, wzrost z sadzonki,
//   deski, opał do ogniska, owoce i szyszki (zbiór, sadzenie),
// - tekstury: oryginały z paczek piksel w piksel, pochodne w atlasie,
// - kształty: powtarzalne, w granicach, wysokość jak w paczkach,
//   bliski i daleki wygląd tej samej wysokości,
// - biomy: każdy z pięciu naprawdę jest w świecie, ma swoje drzewa,
//   olbrzymy (sekwoje) nie wchodzą na siebie, chunki liczą się szybko,
// - cząsteczki: oliwki i szyszki spadają z liści jak jabłka.
//
// Uruchomienie: node tools/sprawdz_drzewa_083.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[], getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            `
        };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { TREE_NAMES, TREE_SPECIES } = await import('../src/blocks/trees.js');
const { TREE_TEXTURE_NAMES, SPECIES_SHAPE_LIMITS } = await import('../src/blocks/treeCatalog.js');
const { buildTree, treeShapeLimits, treeVisualDimensions, TREE_REACH, TREE_MAX_HEIGHT } = await import('../src/world/trees/TreeShapes.js');
const { treeSilhouette } = await import('../src/world/farVegetation.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, getGrowth, getStrip, isLeavesId } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { getRecipe, gridResult, matchesIngredient } = await import('../src/crafting/Crafting.js');
const { FIRE_WOODS, fuelType } = await import('../src/game/CampfireState.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { BIOMES, LAND_BIOMES, biomeByWord } = await import('../src/world/terrain/Biomes.js');
const { fruitOf } = await import('../src/rendering/TreeParticles.js');
const { TEXTURE_REGIONS, WORLD_ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const sha = data => createHash('sha256').update(data).digest('hex');

const NEW = {
    maple: { first: 1030, height: [14, 22], fire: true, biome: 'maple_forest', word: 'klonowy' },
    mugo: { first: 1040, height: [3, 5], item: 'mugo_cone', biome: 'mugo_scrub', word: 'kosodrzewina' },
    olive: { first: 1050, height: [5, 8], item: 'olive_oliwki', fruit: true, biome: 'olive_grove', word: 'gaj' },
    rainbow_eucalyptus: { first: 1060, height: [32, 50], biome: 'eucalyptus_forest', word: 'eukaliptusowy' },
    sequoia: { first: 1070, height: [46, 72], item: 'sequoia_cone', fruit: true, biome: 'sequoia_forest', word: 'sekwojowy' }
};

// Oryginalne tekstury z paczek Kamila (RGBA, sha256) - nie wolno ich zmieniać.
const ORIGINALS = {
    'maple/log_side.png': 'e1376e7dbb331ee135a4cc49880f5a893f2026cd985b1f16daf50a860b4747d2',
    'maple/log_top.png': '67d0a1208bda8be1c0692fce703af4de93cf9ab7b438ee28b51e7556b3cd638b',
    'maple/planks.png': '3ed841948c1975a0fb60e5b365a80ac01ff8d87b96e5dbc7d0bf8d453f3863b5',
    'maple/leaves.png': 'c74fa62ed78a033b926a6d40c428d52b3dbcbc634a5a139b3a927665e11147df',
    'maple/leaves_variant.png': '2de1f875587ec1539d45dafce7e408e57998a37fe84efc87e37f21c1e8fec28f',
    'mugo/log_side.png': '63396cbd07f05012b80be9d6d74704e6745c1cd0260fbc2427513d0e2038257e',
    'mugo/log_top.png': '66099b2bbdcea95bd61d409a722c756dce72c73632036c4b7d4249050967c1e3',
    'mugo/planks.png': 'a28db7ff12a8e8df672fc8851ce7c93d4b9c7fa09fda7aa59038da6fcc377423',
    'mugo/leaves.png': '70b84a6ab401371bc774eb7b6d8d3513da6a3301df34347b805a737853870782',
    'mugo/leaves_variant.png': 'f387fa2dd3417721e369d5520c8244a737e1dc5bd5b73239d1115798352fe8b3',
    'olive/log_side.png': '574229cbcf8e2921e2bf4b8d2654e995e6a05ddfdf76f95f0557f4900905a210',
    'olive/log_top.png': '28e938850ef79052e4361c292985439840e230050bd56aa9182edc261767a8ce',
    'olive/planks.png': 'd16c1bdea1bfe6ff413eb2fa885b5f56e94547cabeaebd9d6c88d9c49edba626',
    'olive/leaves.png': 'd9fe41486c4d49893dc793d666183f2aec622d854430d1143877059dc5c6c480',
    'olive/leaves_variant.png': 'b09c9084a71e70a71cec95b279a75e95334bef4d662c78ff7dfd086c917726b6',
    'rainbow_eucalyptus/log_side.png': '3d4f9fa9d8f925a59a355eda84f599940125f30937063c157e6f0da76910af0f',
    'rainbow_eucalyptus/log_top.png': 'd1d8fc5e171f69ce0f365edac59f8fd1b1f762debacb2a533a9c81ea45008ec4',
    'rainbow_eucalyptus/planks.png': '5eb8af492c3d13421a69916019649bc490c537e92e3d33159a0912e6b50d04ee',
    'rainbow_eucalyptus/leaves.png': 'f62c14155a73768e9cde05c7e7e718c4156393697e21c7d85e9f6f5cff10ad2a',
    'sequoia/log_side.png': '6b4591cbe7fdfb561c6e41a8964129f4b9873bded0fc3d76f7085b1fd9a2cf87',
    'sequoia/log_top.png': '8053d574631fb414e78c44bf3242a33d0e26f55779b5673dd8f426fac880bfdc',
    'sequoia/planks.png': 'f0e337e60ce0e86bf47572ee2669c4dd68242a7f5e240d369194500eeed3f103',
    'sequoia/leaves.png': 'a38dda14c71b5f73561df55ee6f32b6d98ec270db8b96102a3a62203bb5dd302',
    'sequoia/leaves_variant.png': '4be90be90e3dec710391670ef9a7fe5582f1ff80428425140258bf7550369de2'
};


// --- Bloki, przedmioty, przepisy ----------------------------------------

equal(TREE_NAMES.slice(12, 17), Object.keys(NEW), 'Gatunki 0.83 zachowują pozycje katalogu po dodawaniu kolejnych');
for (const [name, info] of Object.entries(NEW)) {
    const tree = TREE_SPECIES[name];
    equal(tree.firstId, info.first, `${name}: stały pierwszy numer`);
    for (const [offset, part] of ['log', 'log_stripped', 'planks', 'leaves', 'sapling'].entries()) {
        equal(getBlockId(`${name}_${part}`), info.first + offset, `${name}: numer ${part}`);
    }
    equal(getStrip(`${name}_log`).into, `${name}_log_stripped`, `${name}: siekiera okorowuje własny pień`);
    equal(getGrowth(`${name}_sapling`).tree, name, `${name}: sadzonka wyrasta w ten gatunek`);
    equal(gridResult([{ type: `${name}_log`, count: 1 }, null, null, null])?.type, `${name}_planks`, `${name}: pień daje deski`);
    check(getRecipe(`${name}_planks`) && matchesIngredient('#planks', `${name}_planks`), `${name}: deski we wspólnych przepisach (skrzynia, tratwa)`);
    check(Object.hasOwn(FIRE_WOODS, name) && ITEM_TYPES[fuelType(name)] && getRecipe(fuelType(name)), `${name}: opał i przepis na opał`);
    check(TEXTURE_REGIONS[`campfire_${name}`]?.width === 32 && WORLD_ATLAS_TILES[`campfire_${name}`], `${name}: drewno ogniska w atlasie`);
    check(getBlockDefinition(`${name}_sapling`).label && getBlockDefinition(`${name}_planks`).label.length > 3, `${name}: polskie nazwy`);
    if (info.item) {
        const item = ITEM_TYPES[info.item];
        check(item && item.plants === `${name}_sapling`, `${name}: ${info.item} - posadzony daje sadzonkę`);
        check(getBlockDefinition(`${name}_leaves`).loot.some(([type]) => type === info.item), `${name}: ${info.item} wypada z liści`);
    }
    for (const texture of TREE_TEXTURE_NAMES.filter(key => key.startsWith(`${name}/`))) {
        const region = readTextureRegion(texture);
        equal([region.width, region.height], [16, 16], `${texture}: 16 x 16`);
        check(WORLD_ATLAS_TILES[texture], `${texture}: kafelek w atlasie gry`);
        if (ORIGINALS[texture]) equal(sha(region.rgba), ORIGINALS[texture], `${texture}: oryginał z paczki piksel w piksel`);
        else check(region.rgba.some((value, i) => i % 4 === 3 && value > 0), `${texture}: narysowana tekstura pochodna`);
    }
}
check(Object.keys(ORIGINALS).every(key => TREE_TEXTURE_NAMES.includes(key)), 'Wszystkie oryginały w katalogu');
check(getBlockDefinition('maple_leaf_litter')?.part === 'litter', 'Klon: opadłe liście na ziemi');
check(getBlockDefinition('olive_leaves_oliwki').harvest.item === 'olive_oliwki', 'Oliwka: zbiór oliwek z liści');
check(getBlockDefinition('olive_leaves_oliwki_growing').grows.into === 'olive_leaves_oliwki', 'Oliwki odrastają');
check(getBlockDefinition('sequoia_leaves_szyszki').harvest.item === 'sequoia_cone', 'Sekwoja: szyszki z igliwia');
equal(fruitOf(getBlockDefinition('olive_leaves_oliwki')), 'olive_oliwki', 'Cząsteczki: oliwki spadają z liści');
equal(fruitOf(getBlockDefinition('sequoia_leaves_szyszki')), 'sequoia_cone', 'Cząsteczki: szyszki sekwoi spadają');
equal(fruitOf(getBlockDefinition('maple_leaves_zlote')), null, 'Złote liście klonu to nie owoc');
const ids = Object.values(TREE_SPECIES).flatMap(tree => [tree.firstId]);
equal(new Set(ids).size, ids.length, 'Bez wspólnych numerów gatunków');


// --- Kształty -------------------------------------------------------------------

check(TREE_REACH === Math.max(...Object.values(SPECIES_SHAPE_LIMITS).map(l => l.reach), 7) && TREE_MAX_HEIGHT >= 72, 'Granice wyszukiwania drzew obejmują olbrzymy');
const record = shape => sha(JSON.stringify(shape));
for (const name of Object.keys(NEW)) for (let seed = 0; seed < 24; seed++) for (const size of [0, .25, .5, .75, 1]) {
    const shape = buildTree(name, seed, size), metrics = treeVisualDimensions(name, size), limits = treeShapeLimits(name);
    equal(record(shape), record(buildTree(name, seed, size)), `${name}: powtarzalny (seed ${seed})`);
    equal(shape.top + 1, metrics.height, `${name}: bliski i daleki wygląd tej samej wysokości`);
    check(metrics.height >= NEW[name].height[0] && metrics.height <= NEW[name].height[1], `${name}: wysokość jak w paczce`);
    check(shape.blocks.every(([x, y, z]) => Math.abs(x) <= limits.reach && Math.abs(z) <= limits.reach && y >= 0 && y <= limits.maxHeight), `${name}: w granicach`);
    check(shape.blocks.some(([, , , type]) => isLeavesId(getBlockId(type))) && shape.roots.length > 0, `${name}: liście i pień przy ziemi`);
    const far = treeSilhouette({ species: name, seed, size, x: 0, y: 0, z: 0 }, 1);
    check(far.length > 0 && far.every(Number.isFinite), `${name}: sylwetka z daleka`);
}
const sequoia = buildTree('sequoia', 3, 1);
const trunk = new Set(sequoia.blocks.filter(([, y, , type]) => y === 10 && type === 'sequoia_log').map(([x, , z]) => `${x},${z}`));
check(trunk.size >= 12, `Sekwoja: gruby pień (${trunk.size} bloków przekroju)`);
const mugo = buildTree('mugo', 3, 1);
check(Math.max(...mugo.blocks.map(b => b[0])) - Math.min(...mugo.blocks.map(b => b[0])) >= 7, 'Kosodrzewina: szeroka i niska');


// --- Biomy w świecie ------------------------------------------------------------

for (const [name, info] of Object.entries(NEW)) {
    const biome = BIOMES[info.biome];
    check(biome && LAND_BIOMES.includes(info.biome) && biomeByWord(info.word) === info.biome, `${info.biome}: biom z nazwą do /biom`);
    check(Object.entries(biome.trees).sort((a, b) => b[1] - a[1])[0][0] === name, `${info.biome}: przeważa ${name}`);
}

const generator = new RealisticGenerator(42);
const found = {};
for (let z = -6000; z <= 6000 && Object.keys(found).length < 5; z += 48) for (let x = -6000; x <= 6000; x += 48) {
    const biome = generator.biomes.classify(x, z, generator.compute(x, z, 0, {}));
    const info = Object.entries(NEW).find(([, value]) => value.biome === biome);
    if (!info || found[info[0]]) continue;
    // Środek plamy: kilka chunków wokół też w tym biomie.
    let inside = 0;
    for (const [dx, dz] of [[24, 0], [-24, 0], [0, 24], [0, -24]]) inside += generator.biomes.classify(x + dx, z + dz, generator.compute(x + dx, z + dz, 0, {})) === biome;
    if (inside >= 3) found[info[0]] = [x, z];
}
equal(Object.keys(found).sort(), Object.keys(NEW).sort(), `Wszystkie pięć biomów jest w świecie (seed 42: ${JSON.stringify(found)})`);

const timings = {};
for (const [name, [x, z]] of Object.entries(found)) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const logs = {};
    const fresh = new RealisticGenerator(42);
    const start = performance.now();
    let trunks = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const chunk = new Chunk(cx + dx, cz + dz);
        fresh.generateChunk(chunk);
        const kinds = new Map();
        for (let i = 0; i < chunk.blocks.length; i++) {
            const id = chunk.blocks[i];
            if (!kinds.has(id)) {
                const block = getBlockDefinition(getBlockTypeById(id));
                kinds.set(id, block?.part === 'log' ? block.tree : null);
            }
            const tree = kinds.get(id);
            if (tree) logs[tree] = (logs[tree] ?? 0) + 1;
        }
    }
    timings[name] = (performance.now() - start) / 9;
    check((logs[name] ?? 0) > 0, `${name}: rośnie w swoim biomie (${JSON.stringify(logs)})`);
    if (name === 'sequoia') {
        fresh.forests.forEachTree(x - 96, z - 96, x + 96, z + 96, tree => { if (tree.species === 'sequoia') trunks.push(tree); });
        check(trunks.length > 0, 'Sekwoje w okolicy');
        for (const a of trunks) for (const b of trunks) if (a !== b) {
            check(Math.hypot(a.x - b.x, a.z - b.z) >= 6, 'Pnie sekwoi nie wchodzą na siebie');
        }
        check(trunks.every(tree => tree.y + 1 + buildTree('sequoia', tree.seed, tree.size).top < CHUNK_HEIGHT), 'Sekwoje mieszczą się pod limitem świata');
    }
}
const slowest = Math.max(...Object.values(timings));
check(slowest < 400, `Chunki w nowych biomach liczą się szybko (najwolniej ${slowest.toFixed(0)} ms)`);

console.log(`OK: drzewa 0.83.0 - ${checks} sprawdzeń (5 gatunków, wyroby, tekstury z paczek, kształty, 5 biomów; chunk: ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', ')}).`);
