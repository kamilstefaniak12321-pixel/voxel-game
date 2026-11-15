// ------------------------------------------------------------
// SPRAWDZENIE TRZYNASTU DRZEW I CZTERECH BIOMÓW (1.8.0)
//
// Jodła, baobab, palma kokosowa, modrzew, namorzyn, puchowiec, jukka
// (drzewo Jozuego), osika, araukaria, figowiec (banian), dracena (smocze
// drzewo), cedr i sosna oścista z paczki Kamila "drzewa_od_jodly":
// - bloki: stałe numery 1100-1229, części, okorowanie, kora, opał, deski,
//   druga kora pnia (jukka, osika, sosna oścista), korzenie (namorzyn,
//   figowiec), kokosy,
// - tekstury: oryginały z paczki piksel w piksel, pochodne w atlasie,
// - kształty: powtarzalne, w granicach, wysokość w skali 1 blok = 1 m,
//   bliski i daleki wygląd tej samej wysokości,
// - biomy: sawanna, półpustynia, las deszczowy i namorzyny naprawdę są
//   w świecie i mają swoje drzewa; palmy stoją na piasku, namorzyny
//   w płytkiej wodzie, sosny ościste na skale; pozostałe gatunki rosną
//   w dotychczasowych biomach,
// - dawne dziewiętnaście gatunków ma te same kształty co wcześniej
//   (pilnuje tego sprawdz_drzewa_085.mjs).
//
// Uruchomienie: node tools/sprawdz_drzewa_180.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

const { TREE_NAMES, TREE_SPECIES, treeLogType, treeRootsType, treeVariantType } = await import('../src/blocks/trees.js');
const { TREE_TEXTURE_NAMES, WORLD_TREE_NAMES } = await import('../src/blocks/treeCatalog.js');
const { buildTree, treeShapeLimits, treeVisualDimensions, TREE_REACH, TREE_MAX_HEIGHT } = await import('../src/world/trees/TreeShapes.js');
const { treeSilhouette, VEGETATION_STRIDE } = await import('../src/world/farVegetation.js');
const { placeTree } = await import('../src/world/trees/Forests.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, getGrowth, getStrip, isLeavesId, isLiquidId } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { getRecipe, gridResult, matchesIngredient } = await import('../src/crafting/Crafting.js');
const { FIRE_WOODS, fuelType } = await import('../src/game/CampfireState.js');
const { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } = await import('../src/config.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { BIOMES, BIOME_KEYS, LAND_BIOMES, biomeByWord } = await import('../src/world/terrain/Biomes.js');
const { fruitOf, leafSprites } = await import('../src/rendering/TreeParticles.js');
const { BARK_SHEETS } = await import('../src/rendering/BarkSheets.js');
const { WORLD_ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const sha = (data) => createHash('sha256').update(data).digest('hex');

// gatunek: pierwszy numer, wysokość dojrzałego drzewa [od, do] w blokach
// (1 blok = 1 m; w naturze: jodła 30-50 m, baobab 18-25 m i pień 7-11 m,
// palma kokosowa 15-25 m, modrzew 25-45 m, namorzyn 8-15 m, puchowiec
// 50-70 m, jukka 5-12 m, osika 20-30 m, araukaria 30-50 m, figowiec
// 20-30 m, dracena 6-10 m, cedr 30-40 m, sosna oścista 5-15 m).
const NEW = {
    fir: { first: 1100, height: [28, 44] },
    baobab: { first: 1110, height: [15, 22] },
    coconut_palm: { first: 1120, height: [12, 22] },
    larch: { first: 1130, height: [22, 38] },
    mangrove: { first: 1140, height: [7, 13] },
    kapok: { first: 1150, height: [40, 58] },
    joshua_tree: { first: 1160, height: [5, 10] },
    aspen: { first: 1170, height: [16, 26] },
    araucaria: { first: 1180, height: [26, 42] },
    banyan: { first: 1190, height: [14, 22] },
    dragon_tree: { first: 1200, height: [6, 10] },
    cedar: { first: 1210, height: [22, 36] },
    bristlecone: { first: 1220, height: [5, 11] }
};
const names = Object.keys(NEW);


// --- Katalog, bloki, przedmioty -------------------------------------------

equal(TREE_NAMES.slice(19), names, 'Trzynaście gatunków dopisanych na końcu katalogu');
equal(WORLD_TREE_NAMES, names, 'Lista do osiągnięcia "Drzewa świata"');
check(ACHIEVEMENTS.some((entry) => entry.id === 'world_trees' && entry.goal.count === 13), 'Osiągnięcie "Drzewa świata"');

for (const [name, info] of Object.entries(NEW)) {
    const tree = TREE_SPECIES[name];
    equal(tree.firstId, info.first, `${name}: stały pierwszy numer`);
    for (const [offset, part] of ['log', 'log_stripped', 'planks', 'leaves', 'sapling'].entries()) {
        equal(getBlockId(`${name}_${part}`), info.first + offset, `${name}: numer ${part}`);
    }
    equal(getStrip(`${name}_log`).into, `${name}_log_stripped`, `${name}: okorowanie`);
    check(ITEM_TYPES[getStrip(`${name}_log`).item]?.label.startsWith('Kora '), `${name}: okorowanie daje korę`);
    equal(getGrowth(`${name}_sapling`).tree, name, `${name}: sadzonka rośnie w drzewo`);
    equal(gridResult([{ type: `${name}_log`, count: 1 }, null, null, null])?.type, `${name}_planks`, `${name}: deski z pnia`);
    check(getRecipe(`${name}_planks`) && matchesIngredient('#planks', `${name}_planks`), `${name}: deski we wspólnych przepisach`);
    check(FIRE_WOODS[name] && ITEM_TYPES[fuelType(name)] && getRecipe(fuelType(name)), `${name}: opał do ogniska`);
    equal([readTextureRegion(`campfire_${name}`).width, readTextureRegion(`campfire_${name}`).height], [32, 32], `${name}: tekstura polan`);
    check(BARK_SHEETS[`${name}_log`] && BARK_SHEETS[`${name}_log_stripped`]?.like === `${name}_log`, `${name}: arkusze kory i okorowanego pnia`);
    check(WORLD_ATLAS_TILES[`${name}_log_bark`]?.w === 8 && WORLD_ATLAS_TILES[`${name}_stripped_sheet`]?.w === 8, `${name}: arkusze w atlasie`);
    check(leafSprites(name).every((index) => index >= 0), `${name}: kształt opadającego liścia`);
    equal(tree.variants.length, 1, `${name}: jedna odmiana liści`);
    equal(getBlockId(treeVariantType(name, tree.variants[0].key)), info.first + 6, `${name}: numer odmiany liści`);
}

// Druga kora pnia: ten sam okorowany pień i ta sama kora gatunku.
for (const [name, key] of [['joshua_tree', 'shaggy'], ['aspen', 'base'], ['bristlecone', 'dead']]) {
    const type = treeLogType(name, key);
    equal(getBlockId(type), NEW[name].first + 8, `${type}: numer`);
    const block = getBlockDefinition(type);
    check(block.part === 'log' && block.tree === name && block.solid, `${type}: pień gatunku`);
    equal([getStrip(type).into, getStrip(type).item], [`${name}_log_stripped`, `${name}_bark`], `${type}: okorowanie jak zwykły pień`);
    check(BARK_SHEETS[type]?.texture === `${type}_bark` && WORLD_ATLAS_TILES[`${type}_bark`], `${type}: własny arkusz kory`);
}

// Korzenie: ażurowy blok jak liście, bez sadzonek.
for (const name of ['mangrove', 'banyan']) {
    const type = treeRootsType(name), block = getBlockDefinition(type);
    equal(getBlockId(type), NEW[name].first + 9, `${type}: numer`);
    check(block.part === 'roots' && isLeavesId(getBlockId(type)) && !block.loot && block.sound === 'wood', `${type}: ażurowe korzenie bez łupu`);
}

// Kokosy: zbiór z liści, odrastają, sadzą palmę.
{
    const coconuts = getBlockDefinition('coconut_palm_leaves_kokosy');
    equal(coconuts.harvest.item, 'coconut_palm_kokos', 'Kokosy zbiera się z liści');
    equal(coconuts.harvest.becomes, 'coconut_palm_leaves_kokosy_growing', 'Kokosy odrastają');
    check(ITEM_TYPES.coconut_palm_kokos?.label === 'Kokos' && ITEM_TYPES.coconut_palm_kokos.plants === 'coconut_palm_sapling', 'Kokos: przedmiot, z którego wyrasta palma');
    check(fruitOf(coconuts) === 'coconut_palm_kokos', 'Kokosy spadają z liści jak inne owoce');
}


// --- Tekstury ----------------------------------------------------------------

for (const name of names) {
    const source = JSON.parse(readFileSync(new URL(`../docs/zrodla/drzewa-1.8/${name}/source.json`, import.meta.url)));
    for (const [file, record] of Object.entries(source.originalFiles)) {
        const image = readTextureRegion(`${name}/${file}`);
        equal([image.width, image.height], [16, 16], `${name}/${file}: 16 x 16`);
        equal(sha(image.rgba), record.rgbaSha256, `${name}/${file}: piksele z paczki bez zmian`);
    }
    for (const key of TREE_TEXTURE_NAMES.filter((key) => key.startsWith(name + '/'))) {
        const image = readTextureRegion(key);
        check(image.rgba.some((value, i) => i % 4 === 3 && value > 0), `${key}: widoczna tekstura`);
        check(WORLD_ATLAS_TILES[key], `${key}: kafelek atlasu`);
    }
    for (const key of ['stripped_side.png', 'stripped_top.png']) {
        check(readTextureRegion(`${name}/${key}`).rgba.every((value, i) => i % 4 !== 3 || value === 255), `${name}/${key}: pełne krycie`);
    }
}


// --- Kształty ------------------------------------------------------------------

check(TREE_REACH === 14 && TREE_MAX_HEIGHT === 73, `Zasięg drzew w generatorze: ${TREE_REACH} bloków, wysokość do ${TREE_MAX_HEIGHT}`);

for (const [name, info] of Object.entries(NEW)) {
    const limits = treeShapeLimits(name);
    for (let seed = 0; seed < 30; seed++) for (const size of [0, .25, .5, .75, 1]) {
        const shape = buildTree(name, seed, size), dimensions = treeVisualDimensions(name, size);
        equal(sha(JSON.stringify(shape)), sha(JSON.stringify(buildTree(name, seed, size))), `${name}: ten sam seed - to samo drzewo`);
        equal(shape.top + 1, dimensions.height, `${name}: pełna wysokość jak w wymiarach dalekiego widoku`);
        check(dimensions.height >= info.height[0] && dimensions.height <= info.height[1], `${name}: skala metrowa`);
        check(shape.blocks.every(([x, y, z]) => Math.abs(x) <= limits.reach && Math.abs(z) <= limits.reach && y >= 0 && y <= limits.maxHeight), `${name}: w granicach`);
        check(shape.blocks.every(([x, , z]) => Math.abs(x) < limits.reach && Math.abs(z) < limits.reach), `${name}: nic nie jest ucięte na granicy zasięgu`);
        check(shape.blocks.some(([x, y, z, type]) => x === 0 && y === 0 && z === 0 && getBlockDefinition(type).part === 'log'), `${name}: pień w miejscu sadzonki`);
        check(shape.roots.length > 0 && shape.blocks.some(([, , , type]) => type === `${name}_leaves`), `${name}: korzenie pnia i liście`);
        let previous = Infinity;
        for (const spacing of [1, 2, 4, 8]) {
            const far = treeSilhouette({ species: name, seed, size, x: 0, y: 0, z: 0 }, spacing);
            check(far.length > 0 && far.length % VEGETATION_STRIDE === 0 && far.every(Number.isFinite), `${name}: sylwetka ${spacing}`);
            const boxes = Array.from({ length: far.length / VEGETATION_STRIDE }, (_, i) => far.slice(i * VEGETATION_STRIDE, (i + 1) * VEGETATION_STRIDE));
            equal(Math.max(...boxes.map((box) => box[4])), dimensions.height, `${name}: sylwetka ${spacing} ma pełną wysokość`);
            check(boxes.length <= previous && boxes.every((box) => box[3] > box[0] && box[4] > box[1] && box[5] > box[2]), `${name}: sylwetka ${spacing} - coraz mniej brył, żadnej pustej`);
            previous = boxes.length;
        }
    }
}

// Cechy sylwetek z podglądów paczki.
const at = (shape, test) => shape.blocks.filter(test);
{
    const baobab = buildTree('baobab', 3, 1);
    const section = new Set(at(baobab, ([, y, , type]) => y === 4 && type === 'baobab_log').map(([x, , z]) => `${x},${z}`));
    check(section.size >= 30, `Baobab: bardzo gruby pień (${section.size} bloków przekroju)`);
    const kapok = buildTree('kapok', 3, 1);
    check(Math.min(...at(kapok, ([, , , type]) => type === 'kapok_leaves').map((b) => b[1])) >= 38, 'Puchowiec: korona dopiero na samej górze');
    check(at(kapok, ([x, y, z, type]) => y === 0 && type === 'kapok_log' && Math.max(Math.abs(x), Math.abs(z)) >= 3).length >= 4, 'Puchowiec: przypory korzeni');
    const banyan = buildTree('banyan', 3, 1);
    check(at(banyan, ([x, y, z, type]) => y === 0 && type === 'banyan_log' && Math.hypot(x, z) > 4).length >= 3, 'Figowiec: słupy korzeni daleko od pnia');
    check(at(banyan, ([, , , type]) => type === 'banyan_roots').length >= 10, 'Figowiec: wiszące korzenie powietrzne');
    check(at(banyan, ([, y, , type]) => type === 'banyan_roots' && y < 2).length === 0, 'Figowiec: pod korzeniami da się przejść');
    const mangrove = buildTree('mangrove', 3, 1);
    check(at(mangrove, ([, y, , type]) => type === 'mangrove_roots' && y === 0).length >= 4, 'Namorzyn: korzenie podporowe stoją na ziemi');
    check(mangrove.roots.some(([, , type]) => type === 'mangrove_roots'), 'Namorzyn: korzenie schodzą do gruntu jak pień');
    const palm = buildTree('coconut_palm', 3, 1);
    check(at(palm, ([, , , type]) => type === 'coconut_palm_leaves_kokosy').length >= 1, 'Palma: kokosy pod liśćmi');
    check(Math.min(...at(palm, ([, , , type]) => isLeavesId(getBlockId(type))).map((b) => b[1])) >= 15, 'Palma: liście tylko na czubku');
    const joshua = buildTree('joshua_tree', 3, 1);
    check(at(joshua, ([, , , type]) => type === 'joshua_tree_log_shaggy').length >= 4 && at(joshua, ([, y, , type]) => type === 'joshua_tree_log' && y === 0).length === 1, 'Jukka: kosmate gałęzie nad gołym pniem');
    const aspen = buildTree('aspen', 3, 1);
    check(aspen.blocks.some(([x, y, z, type]) => x === 0 && y === 0 && z === 0 && type === 'aspen_log_base') && aspen.blocks.some(([, y, , type]) => y > 5 && type === 'aspen_log'), 'Osika: ciemna kora tylko przy ziemi');
    const bristlecone = buildTree('bristlecone', 3, 1);
    const dead = at(bristlecone, ([, , , type]) => type === 'bristlecone_log_dead');
    check(dead.length >= 6 && Math.max(...dead.map((b) => b[1])) === bristlecone.top, 'Sosna oścista: martwe drewno i suchy wierzchołek');
    const dragon = buildTree('dragon_tree', 3, 1);
    const cap = at(dragon, ([, , , type]) => isLeavesId(getBlockId(type)));
    check(Math.max(...cap.map((b) => b[1])) - Math.min(...cap.map((b) => b[1])) <= 2 && Math.max(...cap.map((b) => b[0])) - Math.min(...cap.map((b) => b[0])) >= 12, 'Dracena: płaski, szeroki parasol');
    const cedar = buildTree('cedar', 3, 1);
    check(Math.max(...at(cedar, ([, , , type]) => type === 'cedar_leaves').map((b) => Math.hypot(b[0], b[2]))) >= 10, 'Cedr: szerokie, poziome piętra');
}


// --- Biomy w świecie ----------------------------------------------------------

const NEW_BIOMES = {
    savanna: { word: 'sawanna', tree: 'acacia', also: 'baobab' },
    desert: { word: 'pustynia', tree: 'joshua_tree', also: 'dragon_tree' },
    rainforest: { word: 'deszczowy', tree: 'banyan', also: 'kapok' },
    mangrove: { word: 'namorzyny', tree: 'mangrove', also: null }
};
equal(BIOME_KEYS.slice(-4), Object.keys(NEW_BIOMES), 'Cztery biomy dopisane na końcu (numery dawnych bez zmian)');
for (const [key, info] of Object.entries(NEW_BIOMES)) {
    check(LAND_BIOMES.includes(key) && biomeByWord(info.word) === key, `${key}: biom z nazwą do /biom`);
    check(BIOMES[key].trees[info.tree] > 0 && (!info.also || BIOMES[key].trees[info.also] > 0), `${key}: swoje drzewa`);
}

const generator = new RealisticGenerator(42);
const found = {};
for (let z = -6000; z <= 6000 && Object.keys(found).length < 4; z += 48) for (let x = -6000; x <= 6000; x += 48) {
    const biome = generator.biomes.classify(x, z, generator.compute(x, z, 0, {}));
    if (!NEW_BIOMES[biome] || found[biome]) continue;
    let inside = 0;
    for (const [dx, dz] of [[24, 0], [-24, 0], [0, 24], [0, -24]]) inside += generator.biomes.classify(x + dx, z + dz, generator.compute(x + dx, z + dz, 0, {})) === biome;
    if (inside >= 3) found[biome] = [x, z];
}
equal(Object.keys(found).sort(), Object.keys(NEW_BIOMES).sort(), `Wszystkie cztery biomy są w świecie (seed 42: ${JSON.stringify(found)})`);

const timings = {};
for (const [biome, [x, z]] of Object.entries(found)) {
    const fresh = new RealisticGenerator(42);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const start = performance.now();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) fresh.generateChunk(new Chunk(cx + dx, cz + dz));
    timings[biome] = (performance.now() - start) / 9;
}
const slowest = Math.max(...Object.values(timings));
check(slowest < 400, `Chunki w nowych biomach liczą się szybko (najwolniej ${slowest.toFixed(0)} ms)`);

// Wszystkie drzewa z dużego wycinka świata: każdy gatunek rośnie naprawdę,
// w swoim miejscu.
const seen = Object.fromEntries(names.map((name) => [name, []]));
let wading = 0;
for (let gz = -1500; gz < 1500; gz++) for (let gx = -400; gx < 400; gx++) {
    if ((gx + gz * 7) % 5) continue;
    const tree = generator.forests.descriptorAt(gx, gz);
    if (!tree || !seen[tree.species]) continue;
    seen[tree.species].push(tree);
    if (tree.wade) wading++;
}
for (const name of names) check(seen[name].length > 0, `${name}: rośnie w świecie (${seen[name].length} drzew w wycinku)`);

const sampleAt = (tree) => generator.compute(tree.x, tree.z, 0, {});
const biomeAt = (tree) => generator.biomes.classify(tree.x, tree.z, sampleAt(tree));
const share = (name, test) => seen[name].filter(test).length / seen[name].length;
check(share('baobab', (tree) => biomeAt(tree) === 'savanna') > 0.6, 'Baobaby - na sawannie');
check(share('joshua_tree', (tree) => biomeAt(tree) === 'desert') > 0.6 && share('dragon_tree', (tree) => biomeAt(tree) === 'desert') > 0.6, 'Jukki i draceny - na półpustyni');
check(share('kapok', (tree) => biomeAt(tree) === 'rainforest') > 0.6 && share('banyan', (tree) => biomeAt(tree) === 'rainforest') > 0.6, 'Puchowce i figowce - w lesie deszczowym');
check(seen.coconut_palm.every((tree) => generator.surfaceKind(tree.x, tree.z, sampleAt(tree), 0) === 'sand' && tree.y - 1 - SEA_LEVEL <= 6), 'Palmy kokosowe - na piasku plaży');
check(wading > 0 && seen.mangrove.every((tree) => !tree.wade || (sampleAt(tree).water - (tree.y - 1) <= 2 && sampleAt(tree).water > tree.y - 1)), `Namorzyny stoją też w płytkiej wodzie (${wading})`);
check(share('mangrove', (tree) => tree.wade || biomeAt(tree) === 'mangrove') > 0.8, 'Namorzyny - w wodzie i w biomie namorzynów');
check(seen.bristlecone.every((tree) => tree.y - 1 - SEA_LEVEL >= 26), 'Sosny ościste - wysoko w górach');
check(seen.bristlecone.some((tree) => generator.surfaceKind(tree.x, tree.z, sampleAt(tree), 0) === 'rock'), 'Sosny ościste - także na gołej skale');
check(seen.larch.every((tree) => tree.y - 1 - SEA_LEVEL >= 20) && seen.cedar.every((tree) => tree.y - 1 - SEA_LEVEL >= 16), 'Modrzewie i cedry - w górach');
check(share('fir', (tree) => ['spruce', 'beech', 'sequoia_forest'].includes(biomeAt(tree))) > 0.6, 'Jodły - w świerczynie i buczynie');
check(share('aspen', (tree) => ['birch', 'meadow', 'spruce', 'pine', 'wetland'].includes(biomeAt(tree))) > 0.6, 'Osiki - w brzezinie, na łąkach i w borach');

// Figowce (podszyt puchowców) i puchowce stoją na swoich siatkach: nie
// wchodzą na siebie.
for (const name of ['kapok', 'banyan']) {
    const trees = seen[name];
    let closest = Infinity;
    for (const a of trees) for (const b of trees) if (a !== b) closest = Math.min(closest, Math.hypot(a.x - b.x, a.z - b.z));
    check(trees.length < 2 || closest >= 8, `${name}: odstęp między pniami (najbliżej ${closest.toFixed(0)} bloków)`);
}
check(seen.kapok.every((tree) => tree.y + treeVisualDimensions('kapok', tree.size).height < CHUNK_HEIGHT), 'Puchowce mieszczą się pod limitem świata');

// Namorzyn w wodzie: pień i korzenie wypierają wodę, liście do wody nie wchodzą.
{
    const tree = generator.forests.treeAt(...(() => {
        const wade = seen.mangrove.find((candidate) => candidate.wade);
        const grid = generator.forests.grid;
        return [Math.floor(wade.x / grid), Math.floor(wade.z / grid)];
    })());
    check(tree?.wade && tree.species === 'mangrove', 'Namorzyn w wodzie: to samo drzewo w pełnym kształcie');
    const chunk = new Chunk(Math.floor(tree.x / CHUNK_SIZE), Math.floor(tree.z / CHUNK_SIZE));
    const fresh = new RealisticGenerator(42);
    fresh.generateChunk(chunk);
    const lx = tree.x - chunk.cx * CHUNK_SIZE, lz = tree.z - chunk.cz * CHUNK_SIZE;
    equal(getBlockTypeById(chunk.getId(lx, tree.y, lz)), 'mangrove_log', 'Pień namorzynu stoi na dnie');
    check(tree.y <= SEA_LEVEL, 'Podstawa pnia pod wodą');
    let rootsUnderWater = 0;
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) for (let y = tree.y - 2; y <= SEA_LEVEL; y++) {
        const type = getBlockTypeById(chunk.getId(x, y, z));
        if (type === 'mangrove_roots' || type?.startsWith('mangrove_leaves')) rootsUnderWater++;
    }
    equal(rootsUnderWater, 0, 'Pod wodą nie ma ażurowych bloków (tylko drewno)');
}

// Zwykłe sadzenie: korzenie nie wchodzą w wodę, a pień schodzi do gruntu.
{
    const shape = buildTree('mangrove', 12345, 1), chunk = new Chunk(0, 0);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) {
        chunk.setId(x, 48, z, getBlockId('dirt'));
        chunk.setId(x, 49, z, getBlockId(x < 8 ? 'grass' : 'water'));
    }
    placeTree(chunk, 0, 0, { x: 6, y: 50, z: 8, species: 'mangrove', shape }, getBlockId);
    equal(getBlockTypeById(chunk.getId(6, 50, 8)), 'mangrove_log', 'Namorzyn z sadzonki: pień');
    let water = 0;
    for (let x = 8; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) water += isLiquidId(chunk.getId(x, 49, z));
    equal(water, 8 * CHUNK_SIZE, 'Drzewo bez "wade" nie wypiera wody');
}

console.log(`OK: drzewa 1.8.0 - ${checks} sprawdzeń (13 gatunków, 4 biomy; w wycinku świata: ${names.map((name) => `${name} ${seen[name].length}`).join(', ')}; namorzyny w wodzie ${wading}; chunk: ${Object.entries(timings).map(([k, v]) => `${k} ${v.toFixed(0)} ms`).join(', ')}).`);
