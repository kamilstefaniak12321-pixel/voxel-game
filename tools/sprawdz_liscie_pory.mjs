// ------------------------------------------------------------
// SPRAWDZENIE LIŚCI W PORACH ROKU, OWOCÓW I SZYSZEK (1.10.0)
//
// - kolor liści z pory roku (LeafSeasons.js): lato jak w teksturze, jesień
//   coraz mocniej w kolorze gatunku, zima szara, przedwiośnie wraca do
//   zieleni; iglaki i drzewa tropików zostają zielone; opadłe liście
//   zmieniają się całe; świat bez pór roku - bez zmian,
// - siatka chunka: kod liścia i śnieg w atrybucie "tint", kolor z klimatu
//   biomu złagodzony względem trawy, "zimno" zapisane w chunk.tint,
// - spadające liście: kolor pory i więcej liści jesienią,
// - owoce i szyszki trzynastu drzew z 1.8.0: przedmioty, zbiór z liści,
//   odrastanie, sadzenie, jedzenie, podpałka, spadanie z drzewa,
// - opadłe liście osiki, baobabu, figowca, puchowca i modrzewia,
// - namorzyn: sadzonka w płytkiej wodzie i drzewo wyrastające z wody,
// - nowa jukka (osobne kule liści na ramionach).
//
// Namiot figowca sprawdza tools/sprawdz_drzewa_180.mjs.
//
// Uruchomienie: node tools/sprawdz_liscie_pory.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
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
                import { Color } from 'three';
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[new Color(.1,.3,.05), new Color(.12,.34,.06), new Color(.08,.26,.04)], getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            `
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const L = await import('../src/rendering/LeafSeasons.js');
const { TREE_NAMES, TREE_SPECIES, treeVariantType, treeWaterSaplingType } = await import('../src/blocks/trees.js');
const { TREE_DEFINITIONS } = await import('../src/blocks/treeCatalog.js');
const R = await import('../src/blocks/BlockRegistry.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, getGrowth, getHarvest, isLiquidId, isWaterSourceId, isWaterloggedPlantId, isLeavesId, canPlantStay } = R;
const { ITEM_TYPES, getPlacedBlock } = await import('../src/items/ItemRegistry.js');
const { FOODS } = await import('../src/items/foods.js');
const { itemUses } = await import('../src/items/uses.js');
const { TINDERS } = await import('../src/game/CampfireState.js');
const { getRecipe } = await import('../src/crafting/Crafting.js');
const { GROUPS } = await import('../src/crafting/recipes.js');
const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const { buildChunkGeometry, setLeafParts } = await import('../src/rendering/ChunkMesher.js');
const { fruitOf, leafFallRate, TreeParticles } = await import('../src/rendering/TreeParticles.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');
const { plantTree, treeFits } = await import('../src/world/trees/plantTree.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { GRASS_TINT_UNIT, CHUNK_SIZE } = await import('../src/config.js');
const { SEASON_DAYS, nextSeasonStart } = await import('../src/sky/Seasons.js');
// Czas gry (doby) w danym miejscu roku: 0 = początek wiosny, 1 = lata...
const yearAt = (phase) => nextSeasonStart(0, 0) + SEASON_DAYS * phase;
const { WORLD_ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- Palety i kody -----------------------------------------------------------

check(L.LEAF_PALETTES.length <= L.LEAF_PALETTE_LIMIT, 'Palety mieszczą się w tablicy shadera');
equal(new Set(L.LEAF_PALETTES.map((palette) => palette.key)).size, L.LEAF_PALETTES.length, 'Palety mają różne nazwy');
for (const species of TREE_NAMES) {
    const code = L.leafCode(species), litter = L.leafCode(species, true);
    check(Number.isInteger(L.leafPaletteIndex(species)), `${species}: ma paletę jesieni`);
    // Zwykłe bloki mają w "tint.a" 0, 128 albo 255; kod liścia ze śniegiem (do +6) zostaje między nimi.
    check(code >= L.LEAF_CODE_FIRST && litter + 6 < 127 && litter % 8 === 1 && code % 8 === 0, `${species}: kod liścia ${code} w wolnym zakresie`);
    check(L.leafCode(species, false, true) + 6 < 127 && L.leafCode(species, false, true) % 8 === 0, `${species}: kod jesiennej odmiany`);
}
const paletteOf = (species) => L.LEAF_PALETTES[L.leafPaletteIndex(species)];
for (const species of ['spruce', 'pine', 'fir', 'cedar', 'araucaria', 'bristlecone', 'mugo', 'sequoia']) {
    check(paletteOf(species).change === 0 && paletteOf(species).winter > 0 && paletteOf(species).winter < 0.5, `${species}: iglak zostaje zielony, zimą tylko lekko szarzeje`);
}
for (const species of ['coconut_palm', 'mangrove', 'kapok', 'banyan', 'dragon_tree', 'joshua_tree', 'olive']) {
    check(paletteOf(species).change === 0 && paletteOf(species).winter === 0, `${species}: zimozielone`);
}
for (const species of ['maple', 'oak', 'beech', 'birch', 'linden', 'aspen', 'larch', 'bald_cypress', 'jablon', 'ginkgo']) {
    check(paletteOf(species).change === 1 && paletteOf(species).winter === 1, `${species}: zrzuca liście - pełna jesień i zima`);
}
check(L.LEAF_PALETTES.filter((palette) => palette.light).length === 3 && new Set(['maple', 'oak', 'birch', 'beech', 'larch', 'jablon'].map((species) => L.leafPaletteIndex(species))).size === 6, 'Klon, dąb, brzoza, buk, modrzew i jabłoń mają różne kolory jesieni');


// --- Kolor w ciągu roku --------------------------------------------------------

const green = new THREE.Color(0.08, 0.26, 0.04);
const at = (species, phase, litter = false) => L.seasonLeafColor(green, species, phase, new THREE.Color(), litter);
const warmth = (color) => color.r - color.g;
const saturation = (color) => (Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)) / Math.max(color.r, color.g, color.b);

equal(L.leafStage(1.5), { turn: 0, grey: 0 }, 'Lato: bez zmian');
equal(L.leafStage(0.6), { turn: 0, grey: 0 }, 'Wiosna po przedwiośniu: bez zmian');
check(L.leafStage(2.3).turn > 0.2 && L.leafStage(2.3).turn < 0.8 && L.leafStage(2.3).grey === 0, 'Środek jesieni: kolory w drodze');
check(L.leafStage(2.7).turn === 1 && L.leafStage(2.7).grey === 0, 'Późna jesień: pełne kolory, jeszcze bez szarości');
equal(L.leafStage(3.5), { turn: 1, grey: 1 }, 'Zima: szaro');
check(L.leafStage(0.1).grey > 0.3 && L.leafStage(0.1).grey < 1, 'Przedwiośnie: szarość schodzi');
{
    const early = at('birch', 0.2);
    check(L.leafStage(0.2).turn === 0 && early.g > early.r * 0.95 && early.b > at('birch', 2.7).b * 2, 'Przedwiośnie: spod szarości wychodzi zieleń, nie jesień');
}
check(Math.abs(L.leafStage(3.999).grey - L.leafStage(0.001).grey) < 0.01, 'Koniec zimy i początek wiosny bez skoku');

{
    // Im dalej w jesień, tym bardziej kolorowo (prośba Kamila).
    // Klon z paczki ma czerwoną teksturę: jesienią widać ją samą, latem liść jest zielony.
    const mapleTexel = new THREE.Color(0.5, 0.05, 0.02);
    const mapleAt = (phase) => L.seasonLeafColor(mapleTexel, 'maple', phase);
    let previous = warmth(mapleAt(2));
    for (let phase = 2.02; phase <= 2.7; phase += 0.02) {
        const now = warmth(mapleAt(phase));
        check(now >= previous - 1e-9, `Klon: jesienią coraz czerwieńszy (faza ${phase.toFixed(2)})`);
        previous = now;
    }
    check(mapleAt(1.5).g > mapleAt(1.5).r * 1.8 && mapleAt(0.6).g > mapleAt(0.6).r * 1.8, 'Klon wiosną i latem zielony');
    check(mapleAt(2.7).equals(mapleTexel), 'Klon jesienią: własna, czerwona tekstura');
    check(saturation(mapleAt(3.5)) < 0.4, 'Klon zimą szarawy');
    const ginkgoTexel = new THREE.Color(0.75, 0.55, 0.03);
    check(L.seasonLeafColor(ginkgoTexel, 'ginkgo', 1.5).g > L.seasonLeafColor(ginkgoTexel, 'ginkgo', 1.5).r * 1.5 && L.seasonLeafColor(ginkgoTexel, 'ginkgo', 2.7).equals(ginkgoTexel), 'Miłorząb: latem zielony, jesienią złoty jak tekstura');
    // Złote odmiany modrzewia i osiki: tak samo (pole "autumn" odmiany).
    const goldTexel = new THREE.Color(0.5, 0.26, 0.03);
    const gold = (phase) => L.seasonLeafColor(goldTexel, 'larch', phase, new THREE.Color(), false, false, true);
    check(gold(1.5).g > gold(1.5).r * 1.4 && gold(2.7).equals(goldTexel) && saturation(gold(3.5)) < 0.4, 'Złote igliwie modrzewia: latem zielone, jesienią złote, zimą szare');
    check(getBlockDefinition('larch_leaves_zlote').autumnLeaves === true && getBlockDefinition('aspen_leaves_zlote').autumnLeaves === true && !getBlockDefinition('larch_leaves').autumnLeaves, 'Złote odmiany oznaczone w katalogu');
    equal(blockRenderData[getBlockId('larch_leaves_zlote')].leafCode, L.leafCode('larch', false, true), 'Złota odmiana ma kod jesiennej tekstury');
    equal(L.leafCode('maple', false, true), L.leafCode('maple'), 'Klon ma jesienną teksturę w całym gatunku');
    const maple = L.seasonLeafColor(new THREE.Color(0.6, 0.3, 0.05), 'maple', 2.7, new THREE.Color(), true), birch = at('birch', 2.7), oak = at('oak', 2.7);
    check(maple.r > maple.g * 2.5, `Opadłe liście klonu jesienią czerwone (${maple.toArray().map((v) => v.toFixed(2))})`);
    check(birch.r > birch.b * 4 && birch.g > birch.b * 3 && birch.g > maple.g * 2, `Brzoza jesienią żółta (${birch.toArray().map((v) => v.toFixed(2))})`);
    check(oak.r > oak.g && oak.r < birch.r, 'Dąb jesienią brązowy - ciemniejszy od brzozy');
    for (const species of ['beech', 'birch', 'oak', 'larch']) {
        const winter = at(species, 3.5);
        check(saturation(winter) < 0.4 && saturation(winter) < saturation(at(species, 2.7)) * 0.5, `${species}: zimą szarawy`);
    }
    equal(at('beech', 3.5).toArray(), at('birch', 3.5).toArray(), 'Zimą gatunki szarzeją tak samo');
    for (const phase of [0.5, 1.5, 2.5, 3.5]) {
        check(at('olive', phase).equals(green) && at('banyan', phase).equals(green), `Oliwka i figowiec zielone cały rok (faza ${phase})`);
    }
    check(at('spruce', 2.5).equals(green), 'Świerk jesienią zielony');
    const spruce = at('spruce', 3.5);
    check(!spruce.equals(green) && spruce.g > spruce.r && saturation(spruce) > saturation(at('beech', 3.5)), 'Świerk zimą tylko przygaszony');
    const acacia = at('acacia', 2.7);
    check(warmth(acacia) > warmth(green) && acacia.g > acacia.r * 0.6, 'Akacja jesienią płowieje, ale nie do końca');
    // Tylko zielone piksele: kora gałązki i owoc w teksturze liści zostają.
    const red = new THREE.Color(0.5, 0.05, 0.04), bark = new THREE.Color(0.2, 0.12, 0.07);
    for (const color of [red, bark]) check(L.seasonLeafColor(color, 'beech', 2.7).equals(color) && L.seasonLeafColor(color, 'beech', 3.5).equals(color), 'Nie-zielony piksel się nie zmienia');
    // Opadłe liście: cały rysunek, także latem (zbrązowiałe).
    const fallen = new THREE.Color(0.6, 0.3, 0.05);
    const summer = L.seasonLeafColor(fallen, 'maple', 1.5, new THREE.Color(), true), autumn = L.seasonLeafColor(fallen, 'maple', 2.7, new THREE.Color(), true);
    const winter = L.seasonLeafColor(fallen, 'maple', 3.5, new THREE.Color(), true);
    check(!summer.equals(fallen) && summer.r > summer.g && summer.g > summer.b, 'Opadłe liście poza jesienią: brąz');
    check(warmth(autumn) > warmth(summer) && autumn.r > autumn.g * 2.5, 'Opadłe liście klonu jesienią: czerwone jak korona');
    check(saturation(winter) < 0.4, 'Opadłe liście zimą: szare');
    const birchLitter = L.seasonLeafColor(fallen, 'birch', 2.7, new THREE.Color(), true);
    check(birchLitter.g > autumn.g * 2, 'Opadłe liście brzozy jesienią żółte - kolor zależy od gatunku');
    // Ciemna i jasna tekstura opadłych liści dają podobną jasność (pierwiastek).
    const dark = L.seasonLeafColor(new THREE.Color(0.07, 0.07, 0.07), 'oak', 2.7, new THREE.Color(), true), bright = L.seasonLeafColor(new THREE.Color(0.5, 0.5, 0.5), 'oak', 2.7, new THREE.Color(), true);
    check(bright.r / dark.r < 3, 'Opadłe liście: rysunek zostaje, jasność się wyrównuje');
}

// Czas gry -> uniformy shadera.
{
    const U = L.leafSeasonUniforms;
    check(Math.abs(L.leafPhase(yearAt(2.5 + 8)) - 2.5) < 1e-9, 'Faza roku: numer pory + postęp');
    equal(L.leafSnow(yearAt(1.5)), 0, 'Latem bez śniegu');
    equal(L.leafSnow(yearAt(2.5)), 0, 'Jesienią bez śniegu');
    check(L.leafSnow(yearAt(3.5)) > 0.95, 'W środku zimy pełny (cienki) śnieg');
    check(L.leafSnow(yearAt(3.05)) > 0 && L.leafSnow(yearAt(3.05)) < 0.8, 'Śnieg przychodzi stopniowo');
    L.setLeafSeason(yearAt(3.5));
    check(U.uLeafSeason.value === 1 && Math.abs(U.uLeafPhase.value - 3.5) < 1e-9 && U.uLeafSnow.value > 0.95, 'Zima w uniformach');
    L.setLeafSeason(null);
    check(U.uLeafSeason.value === 0 && U.uLeafSnow.value === 0, 'Świat bez pór roku: liście jak dawniej');
    check(L.LEAF_TIMES.snow <= 0.85, 'Śnieg nigdy nie zakrywa liści w całości (delikatna warstwa)');
    check(U.uLeafAutumn.value.length === L.LEAF_PALETTE_LIMIT && U.uLeafRule.value.length === L.LEAF_PALETTE_LIMIT, 'Tablice palet pełnej długości');
    const render = source('src/rendering/BlockRenderData.js');
    check(render.includes('LEAF_FRAGMENT_GLSL') && render.includes('LEAF_VERTEX_GLSL') && render.includes('leafSeasonUniforms') && render.includes("'#define LEAF_SEASONS\\n'"), 'Shader bloków ma pory roku liści (tylko WebGL 2)');
    check(L.LEAF_FRAGMENT_GLSL.includes('uLeafPhase') && L.LEAF_FRAGMENT_GLSL.includes('uLeafSnow') && L.LEAF_VERTEX_GLSL.includes('tint.a'), 'Kod GLSL czyta fazę roku, śnieg i kod liścia');
    check(source('src/game/Game.js').includes('setLeafSeason(days)'), 'Gra podaje czas liściom co klatkę');
}


// Daleki teren: kolory koron skokami - kilkanaście przebudów siatek na rok.
{
    const steps = [];
    for (let phase = 0; phase < 4; phase += 0.002) {
        const step = L.leafSeasonStep(yearAt(phase));
        if (steps.at(-1) !== step) steps.push(step);
        const near = at('birch', phase), far = at('birch', step);
        check(Math.max(Math.abs(near.r - far.r), Math.abs(near.g - far.g), Math.abs(near.b - far.b)) <= 0.22, `Daleki teren nie odstaje od bliskiego (faza ${phase.toFixed(3)}: krok ${step})`);
    }
    check(steps.length >= 8 && steps.length <= 16, `Daleki teren: ${steps.length} kroków koloru na rok`);
    equal(L.leafSeasonStep(yearAt(1.2)), L.leafSeasonStep(yearAt(1.9)), 'Latem daleki teren się nie przebudowuje');
    equal(L.leafSeasonStep(yearAt(3.3)), L.leafSeasonStep(yearAt(3.9)), 'Zimą daleki teren się nie przebudowuje');
    const { FarTerrain } = await import('../src/world/FarTerrain.js');
    let rebuilt = 0;
    const far = Object.assign(Object.create(FarTerrain.prototype), { colorsReady: true, leafPhase: null, prepareColors() { rebuilt++; } });
    check(far.setLeafSeason(yearAt(1.5)) === true && far.setLeafSeason(yearAt(1.6)) === false && rebuilt === 1, 'Kolory liczone raz na krok');
    check(far.setLeafSeason(yearAt(2.5)) === true && far.leafPhase > 2 && far.leafPhase < 2.6, 'Jesień w dalekim terenie');
    check(far.setLeafSeason(null) === true && far.leafPhase === null && far.setLeafSeason(null) === false, 'Świat bez pór roku: daleki teren jak dawniej');
    const whole = L.seasonLeafColor(new THREE.Color(0.2, 0.2, 0.12), 'birch', 2.7, new THREE.Color(), false, true);
    check(whole.r > whole.b * 3, 'Średni kolor korony (nie czysto zielony) też zmienia barwę');
}


// --- Bloki: kto ma kod liścia ---------------------------------------------------

let leafBlocks = 0, litterBlocks = 0;
for (const [type, definition] of Object.entries(R.BLOCK_TYPES)) {
    const data = blockRenderData[definition.id];
    if (definition.tree && definition.part === 'leaves') {
        equal(data.leafCode, L.leafCode(definition.tree, false, definition.autumnLeaves === true), `${type}: kod liścia gatunku`);
        leafBlocks++;
    }
    else if (definition.tree && definition.part === 'litter') {
        equal(data.leafCode, L.leafCode(definition.tree, true), `${type}: kod opadłych liści`);
        litterBlocks++;
    }
    else check(!data || !data.leafCode, `${type}: nie jest liściem`);
}
check(leafBlocks >= 32 + 20 && litterBlocks === 11, `Liście ${leafBlocks} bloków, opadłe liście ${litterBlocks}`);
check(blockRenderData[getBlockId('banyan_roots')].leafCode === 0 && blockRenderData[getBlockId('mangrove_roots')].leafCode === 0, 'Korzenie powietrzne nie zmieniają koloru');


// --- Siatka chunka -------------------------------------------------------------

{
    const world = { getChunk: () => null };
    const CORNERS = 17 * 17;
    const build = (blocks, tint) => {
        const chunk = new Chunk(0, 0);
        for (const [x, y, z, type] of blocks) chunk.setId(x, y, z, getBlockId(type));
        chunk.skyLight.fill(15);
        chunk.tint = tint;
        const attribute = buildChunkGeometry(chunk, world).getAttribute('tint');
        const rows = [];
        for (let i = 0; i < attribute.count; i++) rows.push([attribute.array[i * 4], attribute.array[i * 4 + 1], attribute.array[i * 4 + 2], attribute.array[i * 4 + 3]]);
        return rows;
    };
    const tintOf = (rgb, cold) => { const tint = new Uint8Array(CORNERS * 4); for (let i = 0; i < CORNERS; i++) { tint.set(rgb, i * 3); tint[CORNERS * 3 + i] = cold; } return tint; };
    for (const parts of [false, true]) {
        setLeafParts(parts);
        const what = parts ? 'liście z części' : 'liście-kostki';
        const neutral = Math.round(GRASS_TINT_UNIT);
        const warm = build([[8, 8, 8, 'maple_leaves']], tintOf([neutral, neutral, neutral], 0));
        check(warm.length >= 24 && warm.every((row) => row[3] === L.leafCode('maple')), `${what}: kod klonu w każdym wierzchołku, w cieple bez śniegu`);
        check(warm.every((row) => row[0] === neutral && row[1] === neutral && row[2] === neutral), `${what}: w umiarkowanym klimacie kolor tekstury`);
        const cold = build([[8, 8, 8, 'maple_leaves']], tintOf([neutral, neutral, neutral], 255));
        check(cold.every((row) => row[3] === L.leafCode('maple') + 6), `${what}: w zimnie najwyższy poziom śniegu`);
        const half = build([[8, 8, 8, 'maple_leaves']], tintOf([neutral, neutral, neutral], 128));
        check(half.every((row) => row[3] > L.leafCode('maple') && row[3] < L.leafCode('maple') + 6), `${what}: na granicy zimna mniej śniegu`);
        // Sawanna: trawa 4,0 / 0,78 / 2,7 - liście płowieją słabiej.
        const gold = [255, Math.round(0.78 * GRASS_TINT_UNIT), Math.round(2.7 * GRASS_TINT_UNIT)];
        const savanna = build([[8, 8, 8, 'acacia_leaves']], tintOf(gold, 0));
        const leafTint = savanna[0].slice(0, 3).map((byte) => byte / GRASS_TINT_UNIT);
        check(leafTint[0] > 1.3 && leafTint[0] < 2 && leafTint[1] > 0.85 && leafTint[1] < 1 && leafTint[2] > 1.2 && leafTint[2] < leafTint[0], `${what}: liście sawanny cieplejsze, ale łagodniej niż trawa (${leafTint.map((v) => v.toFixed(2))})`);
        const lush = build([[8, 8, 8, 'banyan_leaves']], tintOf([Math.round(0.15 * GRASS_TINT_UNIT), Math.round(0.33 * GRASS_TINT_UNIT), Math.round(1.5 * GRASS_TINT_UNIT)], 0));
        const wetTint = lush[0].slice(0, 3).map((byte) => byte / GRASS_TINT_UNIT);
        check(wetTint[0] < 0.65 && wetTint[0] > 0.3 && wetTint[1] < 0.8, `${what}: liście mokrego biomu ciemniejsze (${wetTint.map((v) => v.toFixed(2))})`);
        const plain = build([[8, 8, 8, 'stone'], [8, 9, 8, 'maple_log']], tintOf(gold, 255));
        check(plain.every((row) => row[3] === 255), `${what}: kamień i pień bez koloru liści`);
        const litter = build([[8, 8, 8, 'grass'], [8, 9, 8, 'maple_leaf_litter']], tintOf([neutral, neutral, neutral], 0));
        check(litter.some((row) => row[3] === L.leafCode('maple', true)), `${what}: opadłe liście mają swój kod`);
        // Chunk bez koloru biomu (podgląd, dawny zapis): liście neutralne, nie czarne.
        const bare = build([[8, 8, 8, 'maple_leaves']], null);
        check(bare.every((row) => row[0] === neutral && row[3] >= L.leafCode('maple') && row[3] <= L.leafCode('maple') + 6), `${what}: chunk bez koloru biomu`);
    }
    setLeafParts(false);
    check(L.LEAF_TINT_BYTES[Math.round(GRASS_TINT_UNIT)] === Math.round(GRASS_TINT_UNIT) && L.LEAF_TINT_BYTES[0] === 0 && L.LEAF_TINT_BYTES[255] < 255, 'Łagodzenie koloru: neutralny zostaje neutralny');
    for (let byte = 1; byte < 256; byte++) check(L.LEAF_TINT_BYTES[byte] >= L.LEAF_TINT_BYTES[byte - 1], 'Łagodzenie koloru jest monotoniczne');
}

// "Zimno" w kolorze chunka: w gorących biomach 0, w zimnych miejscach świata > 0.
{
    const generator = new RealisticGenerator(42);
    const CORNERS = 17 * 17;
    const coldOf = (x, z) => { const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)); generator.generateChunk(chunk); return chunk.tint; };
    let hot = null, cold = null;
    for (let z = -6000; z <= 6000 && !(hot && cold); z += 96) for (let x = -6000; x <= 6000 && !(hot && cold); x += 96) {
        const sample = generator.compute(x, z, 0, {});
        if (sample.ocean || sample.water > sample.height) continue;
        const biome = generator.biomes.classify(x, z, sample);
        if (!hot && (biome === 'savanna' || biome === 'desert')) hot = [x, z];
        if (!cold && (biome === 'spruce' || biome === 'alpine')) cold = [x, z];
    }
    check(hot && cold, 'W świecie jest gorący i zimny biom');
    const hotTint = coldOf(...hot), coldTint = coldOf(...cold);
    equal(hotTint.length, CORNERS * 4, 'chunk.tint: trzy kolory i bajt zimna na róg');
    check(hotTint.subarray(CORNERS * 3).every((byte) => byte === 0), 'Sawanna i półpustynia: zimą bez śniegu na liściach');
    check(coldTint.subarray(CORNERS * 3).some((byte) => byte > 100), 'Bór świerkowy i góry: śnieg na liściach');
}


// --- Spadające liście -----------------------------------------------------------

check(leafFallRate(1.5) === 1, 'Latem liście spadają jak dotąd');
check(leafFallRate(2.5) > 3 && leafFallRate(2.5) > leafFallRate(2.1) && leafFallRate(2.5) > leafFallRate(2.9), 'Najwięcej liści spada w środku jesieni');
check(leafFallRate(3.5) < 0.5 && leafFallRate(0.1) < 0.6, 'Zimą i na przedwiośniu prawie nic nie spada');
{
    const particles = Object.create(TreeParticles.prototype);
    particles.phase = null;
    particles.fall = 1;
    particles.setSeason(yearAt(2.5));
    check(Math.abs(particles.phase - 2.5) < 1e-9 && particles.fall > 3, 'Cząsteczki znają porę roku');
    particles.setSeason(null);
    check(particles.phase === null && particles.fall === 1, 'Cząsteczki w świecie bez pór roku');
    const code = source('src/rendering/TreeParticles.js');
    check(code.includes('seasonLeafColor(color, definition?.tree, this.phase'), 'Spadający liść ma kolor pory roku swojego gatunku');
}


// --- Owoce i szyszki ---------------------------------------------------------------

// gatunek: [odmiana liści, przedmiot, sadzi drzewo, jadalny, spada z drzewa, podpałka]
const CROPS = {
    fir: ['szyszki', 'fir_cone', true, false, false, true],
    larch: ['szyszki', 'larch_cone', true, false, false, true],
    cedar: ['szyszki', 'cedar_cone', true, false, false, true],
    bristlecone: ['szyszki', 'bristlecone_cone', true, false, true, true],
    araucaria: ['szyszki', 'araucaria_nuts', true, true, true, false],
    baobab: ['owoce', 'baobab_fruit', true, true, true, false],
    mangrove: ['siewki', 'mangrove_propagule', true, false, true, false],
    kapok: ['puch', 'kapok_fluff', false, false, false, true],
    joshua_tree: ['kwiaty', 'joshua_tree_flowers', false, true, false, false],
    banyan: ['figi', 'banyan_fig', true, true, true, false],
    dragon_tree: ['jagody', 'dragon_tree_berries', true, true, true, false],
    coconut_palm: ['kokosy', 'coconut_palm_kokos', true, true, true, false]
};
for (const [species, [key, item, plants, edible, falls, tinder]] of Object.entries(CROPS)) {
    const type = treeVariantType(species, key), block = getBlockDefinition(type);
    check(block && block.part === 'leaves' && block.tree === species, `${type}: odmiana liści`);
    const harvest = getHarvest(type);
    check(harvest.item === item && harvest.count[0] >= 1 && harvest.count[1] >= harvest.count[0], `${type}: zbiór daje ${item}`);
    equal(harvest.becomes, `${type}_growing`, `${type}: po zbiorze liście, na których plon odrasta`);
    const growth = getGrowth(`${type}_growing`);
    check(growth.into === type && growth.seconds >= 300, `${type}: plon odrasta`);
    equal(getBlockId(`${type}_growing`), getBlockId(type) + 1, `${type}: stały numer bloku po zbiorze`);
    const data = ITEM_TYPES[item];
    check(data && data.label.length > 3 && data.tree === species, `${item}: przedmiot drzewa`);
    equal(getPlacedBlock(item), plants ? `${species}_sapling` : null, `${item}: sadzenie`);
    equal(Boolean(FOODS[item]), edible, `${item}: jadalność`);
    if (edible) check(FOODS[item].energy >= 4 && FOODS[item].fullness >= 30 && FOODS[item].kind === 'snack', `${item}: przekąska`);
    equal(Boolean(TINDERS[item]), tinder, `${item}: podpałka`);
    equal(fruitOf(block), falls ? item : null, `${item}: ${falls ? 'spada' : 'nie spada'} z drzewa`);
    equal(fruitOf(getBlockDefinition(`${type}_growing`)), null, `${type}: po zbiorze nic nie spada`);
    check(itemUses(item).length > 0, `${item}: ma zastosowanie`);
    const tile = WORLD_ATLAS_TILES[data.icon];
    check(tile, `${item}: ikona w atlasie`);
    const region = readTextureRegion(data.icon);
    equal([region.width, region.height], [16, 16], `${item}: ikona 16 x 16`);
    let solid = 0;
    for (let i = 3; i < region.rgba.length; i += 4) solid += region.rgba[i] > 0;
    check(solid >= 30 && solid <= 200, `${item}: ikona z przezroczystym tłem (${solid} pikseli)`);
    // Liście dają czasem sam przedmiot (jak szyszki sekwoi).
    if (species !== 'coconut_palm') check(TREE_SPECIES[species].loot.some(([loot]) => loot === item), `${species}: plon bywa łupem z liści`);
}
check(TINDERS.kapok_fluff >= 2, 'Puch puchowca: najlepsza podpałka');
check(FOODS.baobab_fruit.fullness > FOODS.dragon_tree_berries.fullness, 'Owoc baobabu syci bardziej niż jagody');
{
    // Odmiany z plonem naprawdę rosną na drzewach.
    for (const [species, [key]] of Object.entries(CROPS)) {
        const type = treeVariantType(species, key);
        let found = 0;
        for (let seed = 0; seed < 40 && !found; seed++) found += buildTree(species, seed, 0.8).blocks.filter((block) => block[3] === type).length;
        check(found > 0, `${species}: ${type} rośnie w koronie`);
    }
    equal(getBlockId('larch_leaves_szyszki'), 1138, 'Modrzew: druga odmiana liści w wolnych numerach');
    equal(getBlockId('baobab_leaves_owoce'), 1118, 'Baobab: druga odmiana liści w wolnych numerach');
    equal([readTextureRegion('larch/leaves_cones.png').width, readTextureRegion('baobab/leaves_fruit.png').width], [16, 16], 'Tekstury drugich odmian');
}


// --- Opadłe liście ------------------------------------------------------------------

for (const species of ['aspen', 'baobab', 'banyan', 'kapok', 'larch']) {
    const type = `${species}_leaf_litter`, block = getBlockDefinition(type), tree = TREE_SPECIES[species];
    check(block && block.part === 'litter' && block.model === 'flat' && block.tree === species, `${type}: płaski blok opadłych liści`);
    equal(block.id, tree.firstId + 5, `${type}: stały numer`);
    check(block.label.startsWith('Opadłe '), `${type}: nazwa`);
    check(GROUPS.litter.types.includes(type) && getRecipe(type)?.result[0] === type, `${type}: przepis z liści i grupa opadłych liści`);
    equal([readTextureRegion(`${species}/leaf_litter.png`).width, readTextureRegion(`${species}/leaf_litter.png`).height], [16, 16], `${type}: tekstura`);
    let lying = 0;
    for (let seed = 0; seed < 10; seed++) lying += buildTree(species, seed, 0.7).litter.length;
    check(lying > 0, `${species}: liście leżą pod drzewem`);
}
equal(TREE_DEFINITIONS.filter((tree) => tree.textures.leafLitter).length, 9, 'Dziewięć gatunków z katalogu ma opadłe liście (plus buk i dąb)');


// --- Namorzyn w wodzie ---------------------------------------------------------------

{
    const wet = treeWaterSaplingType('mangrove'), block = getBlockDefinition(wet);
    equal(block.id, 1148, 'Wodna sadzonka namorzynu: stały numer');
    check(isWaterloggedPlantId(block.id) && isLiquidId(block.id) && isWaterSourceId(block.id), 'Wodna sadzonka zajmuje komórkę wody, nie wypierając jej');
    check(block.drops === 'mangrove_sapling' && block.pick === 'mangrove_sapling' && block.creative === false, 'Zebrana daje zwykłą sadzonkę');
    equal(getGrowth(wet).tree, 'mangrove', 'Wodna sadzonka rośnie w drzewo');
    equal(getBlockDefinition('mangrove_sapling').wades, wet, 'Zwykła sadzonka zna swoją wodną postać');
    for (const ground of ['sand', 'mud', 'gravel', 'clay', 'dirt']) check(canPlantStay(block.id, getBlockId(ground)), `Wodna sadzonka stoi na dnie: ${ground}`);
    check(!canPlantStay(block.id, getBlockId('stone')) && !canPlantStay(block.id, getBlockId('water')), 'Nie na skale i nie w toni');
    check(TREE_NAMES.filter((name) => getBlockDefinition(`${name}_sapling`).wades).length === 1, 'Tylko namorzyn rośnie w wodzie');

    const { Scene } = THREE;
    const world = new World(new Scene(), 'liscie-pory', new Map(), 'flat');
    world.generator.generateChunk = () => {};
    world.light = { initChunk() {}, blockChanged() {}, takeChangedChunks() {} };
    const placer = new BlockPlacer(world, { intersectsBlock: () => false });
    // Dno z piasku na y = 49, woda głęboka na 2 (y = 50, 51).
    for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) {
        world.setBlock(x, 49, z, 'sand');
        world.setBlock(x, 50, z, 'water');
        world.setBlock(x, 51, z, 'water');
    }
    const bed = (x, z) => ({ hit: true, block: { x, y: 49, z, type: 'sand' }, normal: { x: 0, y: 1, z: 0 } });
    equal(placer.placeBlock(bed(0, 0), 'mangrove_sapling'), wet, 'Sadzonka kliknięta w dno płytkiej wody staje jako wodna');
    check(isWaterSourceId(world.getBlockId(0, 50, 0)) && world.getBlock(0, 50, 0) === wet, 'Woda została w komórce sadzonki');
    equal(placer.placeBlock(bed(0, 0), 'mangrove_sapling'), false, 'Druga sadzonka w tym samym miejscu nie wejdzie');
    equal(placer.placeBlock(bed(3, 0), 'oak_sapling'), false, 'Dąb w wodzie nie rośnie');
    world.setBlock(6, 49, 0, 'stone');
    equal(placer.placeBlock(bed(6, 0), 'mangrove_sapling'), false, 'Na skalnym dnie sadzonka nie stanie');
    // Na lądzie - zwykła sadzonka (także na piasku i błocie).
    world.setBlock(-10, 52, -10, 'mud');
    world.setBlock(-10, 53, -10, null);
    equal(placer.placeBlock({ hit: true, block: { x: -10, y: 52, z: -10, type: 'mud' }, normal: { x: 0, y: 1, z: 0 } }, 'mangrove_sapling'), 'mangrove_sapling', 'Na błocie zwykła sadzonka');

    // Drzewo wyrasta z wody.
    const shape = buildTree('mangrove', 77, 0.8);
    check(treeFits(world, 0, 50, 0, shape), 'Drzewo mieści się, choć stoi w wodzie');
    const before = new Map();
    for (const [dx, dy, dz] of shape.blocks) before.set(`${dx},${dy},${dz}`, world.getBlockId(dx, 50 + dy, dz));
    check(plantTree(world, 0, 50, 0, 'mangrove', 77, 0.8), 'Namorzyn wyrósł z wodnej sadzonki');
    equal(world.getBlock(0, 50, 0), 'mangrove_log', 'W miejscu sadzonki stoi pień');
    equal(world.getBlock(0, 51, 0), 'mangrove_log', 'Pień przechodzi przez wodę');
    let rootsInWater = 0, leavesInWater = 0, logsInWater = 0, crown = 0;
    for (const [dx, dy, dz, type] of shape.blocks) {
        const now = world.getBlock(dx, 50 + dy, dz), wasWater = isLiquidId(before.get(`${dx},${dy},${dz}`));
        if (wasWater) {
            if (now === 'mangrove_roots') rootsInWater++;
            if (isLeavesId(getBlockId(now)) && now !== 'mangrove_roots') leavesInWater++;
            if (now === 'mangrove_log') logsInWater++;
            check(now === 'mangrove_log' || isLiquidId(getBlockId(now)), `W wodzie zostaje pień albo woda (${now})`);
        }
        else if (isLeavesId(getBlockId(type)) && now === type) crown++;
    }
    check(rootsInWater === 0 && leavesInWater === 0, 'Ażurowe korzenie i liście nie robią dziur w wodzie');
    check(logsInWater >= 4, `Korzenie podporowe pod wodą stały się pniem (${logsInWater})`);
    check(crown > 40, `Korona nad wodą (${crown} bloków liści)`);
    const code = source('src/game/GameInteraction.js');
    check(code.includes('wades') && code.includes('FIELD_BLOCK'), 'Siewkę sadzi się na rozgrzebanej ziemi albo prosto w dno płytkiej wody');
}


// --- Jukka -------------------------------------------------------------------------------

for (let seed = 0; seed < 30; seed++) for (const size of [0, 0.5, 1]) {
    const tree = buildTree('joshua_tree', seed, size);
    const leaves = tree.blocks.filter(([, , , type]) => type.startsWith('joshua_tree_leaves'));
    const logs = tree.blocks.filter(([, , , type]) => type.startsWith('joshua_tree_log'));
    // Kule liści: szpice (liść bez liścia nad sobą, z liściem pod sobą).
    const set = new Set(leaves.map(([x, y, z]) => `${x},${y},${z}`));
    const tips = leaves.filter(([x, y, z]) => set.has(`${x},${y - 1},${z}`) && !set.has(`${x},${y + 1},${z}`)).length;
    check(tips >= 2, `Jukka ${seed}/${size}: co najmniej dwie kule liści (${tips})`);
    check(leaves.length <= tips * 10 + 4, `Jukka ${seed}/${size}: zwarte kule, nie jedna korona (${leaves.length} liści, ${tips} kul)`);
    check(logs.filter(([, , , type]) => type === 'joshua_tree_log_shaggy').length >= 3, `Jukka ${seed}/${size}: kosmate ramiona`);
    check(leaves.every(([, y]) => y >= 2), `Jukka ${seed}/${size}: liście tylko na końcach ramion`);
}

console.log(`OK: liście w porach roku, owoce i szyszki - ${checks} sprawdzeń (${L.LEAF_PALETTES.length} palet, ${leafBlocks} bloków liści, ${litterBlocks} rodzajów opadłych liści, ${Object.keys(CROPS).length} plonów, namorzyn w wodzie, jukka).`);
