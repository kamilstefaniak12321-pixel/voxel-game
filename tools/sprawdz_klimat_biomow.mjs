// ------------------------------------------------------------
// SPRAWDZENIE KLIMATU BIOMÓW I WYROBÓW Z NOWEGO DREWNA (1.9.0)
//
// - kolor trawy: sucho (sawanna - płowozłota, półpustynia - ciepło
//   pomarańczowa), mokro (mokradła, namorzyny, las deszczowy - ciemna,
//   nasycona zieleń); płynne przejścia, zakres mnożnika, brzeg wody
//   bierze kolor z lądu, chunk wczytany z zapisu ma ten sam kolor,
// - daleki teren: własne odcienie trawy suchej i mokrej,
// - roślinność: sucha trawa (piaskownica) na sawannie i półpustyni,
//   błoto, mech, paprocie i trzcina w mokrych biomach,
// - wyroby z desek trzynastu drzew z 1.8.0: drugi zakres numerów bloków,
//   tekstury skrzyń, drzwi i klap, przepisy, sadzonki na piasku, kokos.
//
// Uruchomienie: node tools/sprawdz_klimat_biomow.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
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

const B = await import('../src/world/terrain/Biomes.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { CHUNK_SIZE, GRASS_TINT_UNIT } = await import('../src/config.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, canGrowOn } = await import('../src/blocks/BlockRegistry.js');
const { KINDS, GRASS_KINDS } = await import('../src/world/farSamples.js');
const { SURFACE_TINT_TYPES, surfaceMaterialId, surfaceMaterialType } = await import('../src/rendering/SurfaceMaterials.js');
const { WOODS } = await import('../src/blocks/woods.js');
const W = await import('../src/blocks/woodShapes.js');
const { WOOD_CHESTS, isChestId } = await import('../src/blocks/chest.js');
const { WORLD_TREE_NAMES } = await import('../src/blocks/treeCatalog.js');
const { getRecipe } = await import('../src/crafting/Crafting.js');
const { FOODS } = await import('../src/items/foods.js');
const { WORLD_ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };


// --- Kolor trawy ---------------------------------------------------------------

const T = B.GRASS_TINT;
const tint = (t, h, dry = 0, wet = 0, forest = 0) => B.grassTint(t, h, 8, [0, 0, 0], forest, dry, wet);
// Średni kolor zielonych pikseli wierzchu trawy (tekstura gry) po zabarwieniu.
// Shader mnoży kolor liniowy, więc tak samo liczymy tutaj.
const GRASS = [102, 188, 42];
const linear = (value) => (value / 255) ** 2.2, display = (value) => Math.round(255 * Math.min(1, value) ** (1 / 2.2));
const shown = (value) => value.map((k, i) => display(linear(GRASS[i]) * k));

equal(B.BIOME_KEYS.filter((key) => B.BIOMES[key].dry >= 0.5), ['savanna', 'desert'], 'Suche biomy: sawanna i półpustynia');
equal(B.BIOME_KEYS.filter((key) => B.BIOMES[key].wet >= 0.5), ['wetland', 'rainforest', 'mangrove'], 'Mokre biomy: mokradła, las deszczowy, namorzyny');
check(B.BIOMES.desert.dry > B.BIOMES.savanna.dry && B.biomeDryness('desert') === 1 && B.biomeWetness('meadow') === 0, 'Półpustynia suchsza niż sawanna');

const savanna = shown(tint(0.5, -0.25, B.BIOMES.savanna.dry)), desert = shown(tint(0.5, -0.5, B.BIOMES.desert.dry));
const meadow = shown(tint(-0.2, 0, 0, 0, -0.3)), wetland = shown(tint(-0.2, 0.1, 0, B.BIOMES.wetland.wet)), jungle = shown(tint(0.5, 0.4, 0, 1));
check(savanna[0] > savanna[1] && savanna[1] > savanna[2] * 2 && savanna[0] > 170 && savanna[1] > 150, `Sawanna: płowozłota trawa (${savanna})`);
check(desert[0] > desert[1] * 1.35 && desert[0] >= savanna[0] && desert[1] < savanna[1] - 25, `Półpustynia: cieplejsza, pomarańczowa (${desert})`);
check(meadow[1] > meadow[0] * 1.5, `Łąka zostaje zielona (${meadow})`);
check(wetland[1] < meadow[1] * 0.8 && wetland[1] > wetland[0] * 1.8 && jungle[1] < meadow[1] * 0.7 && jungle[0] < 60, `Mokre biomy: ciemna, nasycona zieleń (mokradła ${wetland}, las deszczowy ${jungle})`);
equal(tint(0.1, -0.1, 0, 0), B.grassTint(0.1, -0.1, 8, [0, 0, 0], 0), 'Bez suchości i mokrości kolor jak dotąd');

// Płynnie i w zakresie atrybutu (bajt = mnożnik x 127,5).
let jump = 0, lowest = 9, highest = 0, previous = tint(0.4, -0.3, 0, 0);
for (let dry = 0; dry <= 1.0001; dry += 0.01) {
    const now = tint(0.4, -0.3, dry, 0);
    jump = Math.max(jump, Math.hypot(now[0] - previous[0], now[1] - previous[1], now[2] - previous[2]));
    previous = now;
}
check(jump < 0.08, `Suchość zmienia kolor płynnie (największy krok ${jump.toFixed(3)})`);
for (let t = -2; t <= 2; t += 0.5) for (let h = -2; h <= 2; h += 0.5) for (const dry of [0, 0.3, 0.55, 1]) for (const wet of [0, 0.4, 1]) {
    for (const value of tint(t, h, dry, wet)) { lowest = Math.min(lowest, value); highest = Math.max(highest, value); }
}
check(lowest >= T.min && highest <= T.max && T.max === 255 / GRASS_TINT_UNIT && Math.round(highest * GRASS_TINT_UNIT) <= 255, `Mnożnik w ${T.min}-${T.max} (mieści się w bajcie)`);


// --- Chunki: kolor z biomu, szwy, zapis -----------------------------------------

const generator = new RealisticGenerator(42);
const found = {};
for (let z = -6000; z <= 6000 && Object.keys(found).length < 5; z += 48) for (let x = -6000; x <= 6000; x += 48) {
    const biome = generator.biomes.classify(x, z, generator.compute(x, z, 0, {}));
    if (!['savanna', 'desert', 'rainforest', 'mangrove', 'wetland'].includes(biome) || found[biome]) continue;
    let inside = 0;
    for (const [dx, dz] of [[24, 0], [-24, 0], [0, 24], [0, -24], [24, 24], [-24, -24]]) inside += generator.biomes.classify(x + dx, z + dz, generator.compute(x + dx, z + dz, 0, {})) === biome;
    if (inside === 6) found[biome] = [x, z];
}
equal(Object.keys(found).sort(), ['desert', 'mangrove', 'rainforest', 'savanna', 'wetland'], 'Pięć biomów do sprawdzenia w świecie');

const chunkAt = (x, z, fresh = generator) => { const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)); fresh.generateChunk(chunk); return chunk; };
// chunk.tint: 17 x 17 rogów x 3 kolory, potem bajt "zimna" na róg (1.10.0, śnieg na liściach).
const CORNERS = 17 * 17;
const average = (chunk) => { const sum = [0, 0, 0]; for (let i = 0; i < CORNERS * 3; i++) sum[i % 3] += chunk.tint[i]; return sum.map((v) => v / CORNERS / GRASS_TINT_UNIT); };
const count = (chunk, test) => { let n = 0; for (const id of chunk.blocks) if (id && test(getBlockTypeById(id))) n++; return n; };
const chunks = Object.fromEntries(Object.entries(found).map(([biome, [x, z]]) => [biome, chunkAt(x, z)]));
const colors = Object.fromEntries(Object.entries(chunks).map(([biome, chunk]) => [biome, average(chunk)]));
check(colors.savanna[0] > 3.4 && colors.savanna[2] > 2, `Chunk sawanny: złota trawa (${colors.savanna.map((v) => v.toFixed(2))})`);
check(colors.desert[0] > 3.6 && colors.desert[1] < 0.6, `Chunk półpustyni: pomarańczowa trawa (${colors.desert.map((v) => v.toFixed(2))})`);
for (const biome of ['rainforest', 'mangrove', 'wetland']) check(colors[biome][0] < 0.45 && colors[biome][1] < 0.6, `Chunk ${biome}: ciemna zieleń (${colors[biome].map((v) => v.toFixed(2))})`);

// Wspólna krawędź dwóch chunków ma ten sam kolor (biom z ramki sąsiada).
for (const [biome, [x, z]] of Object.entries(found)) {
    const a = chunks[biome], b = chunkAt(x + CHUNK_SIZE, z);
    let same = true;
    for (let j = 0; j <= 16; j++) for (let k = 0; k < 3; k++) if (a.tint[(j * 17 + 16) * 3 + k] !== b.tint[(j * 17) * 3 + k]) same = false;
    check(same, `${biome}: kolor trawy bez szwu na granicy chunków`);
    // Chunk wczytany z zapisu (same bloki) dostaje ten sam kolor.
    const loaded = new Chunk(a.cx, a.cz);
    generator.fillFlow(loaded);
    equal(Array.from(loaded.tint), Array.from(a.tint), `${biome}: po wczytaniu z zapisu ten sam kolor trawy`);
}

// Roślinność dostosowana do klimatu.
check(count(chunks.savanna, (type) => type === 'dune_grass') > 10, 'Sawanna: kępy suchej trawy');
check(count(chunks.desert, (type) => type === 'sand') > 100 && count(chunks.desert, (type) => type === 'fern') === 0, 'Półpustynia: piasek, bez paproci');
check(count(chunks.mangrove, (type) => type === 'mud') > 80, 'Namorzyny: dużo błota');
check(count(chunks.rainforest, (type) => type === 'fern' || type === 'moss_carpet' || type === 'moss') > 60, 'Las deszczowy: paprocie i mech');
check(canGrowOn(getBlockId('dune_grass'), getBlockId('grass')) && canGrowOn(getBlockId('dune_grass'), getBlockId('sand')), 'Sucha trawa rośnie na trawie i piasku');

// Daleki teren: własne odcienie.
equal(GRASS_KINDS.slice(-2), ['grass_arid', 'grass_lush'], 'Daleka trawa: sucha i mokra (dopisane na końcu)');
equal(KINDS.slice(-2), ['grass_arid', 'grass_lush'], 'Rodzaje dalekiej powierzchni tylko dopisane');
equal(SURFACE_TINT_TYPES.slice(-2), ['grass_arid', 'grass_lush'], 'Materiały dalekiej trawy');
check(surfaceMaterialType(surfaceMaterialId('grass_arid')) === 'grass_arid' && surfaceMaterialId('grass_lush') <= 65535, 'Numery materiałów dalekiej trawy');
for (const [biome, kind] of [['savanna', 'grass_arid'], ['desert', 'grass_arid'], ['wetland', 'grass_lush'], ['mangrove', 'grass_lush']]) {
    const [x, z] = found[biome];
    let hit = 0, all = 0;
    for (let dz = -16; dz <= 16; dz += 4) for (let dx = -16; dx <= 16; dx += 4) {
        const surface = generator.farSurface(x + dx, z + dz, 4, true);
        if (!String(surface.kind).startsWith('grass')) continue;
        all++;
        if (surface.kind === kind) hit++;
    }
    check(biome === 'mangrove' ? all === 0 || hit / all > 0.7 : all > 5 && hit / all > 0.7, `${biome}: daleka trawa ${kind} (${hit}/${all})`);
}


// --- Wyroby z desek trzynastu drzew ---------------------------------------------

equal(WOODS.slice(20).map((entry) => entry.wood), WORLD_TREE_NAMES, 'Trzynaście nowych rodzajów drewna dopisanych na końcu');
equal(WOOD_CHESTS.slice(19).map((entry) => entry.wood), WORLD_TREE_NAMES, 'Skrzynie z trzynastu nowych rodzajów desek');
const taken = new Map();
for (const [index, wood] of WORLD_TREE_NAMES.entries()) {
    const first = W.WOOD_BLOCK_FIRST_ID + index * W.WOOD_BLOCK_IDS;
    equal([W.shapeFirstId(20 + index), W.doorFirstId(20 + index), W.bedFirstId(20 + index)], [first, first + 28, first + 76], `${wood}: wspólny blok numerów`);
    equal(getBlockId(`${wood}_chest`), first + W.WOOD_BLOCK_CHEST, `${wood}: numer skrzyni`);
    for (const kind of Object.keys(W.SHAPE_KINDS)) {
        const type = W.shapeBaseType(wood, kind), definition = getBlockDefinition(type);
        check(definition && definition.inventory !== false && !/undefined/.test(definition.label), `${type}: przedmiot "${definition?.label}"`);
        check(getBlockId(type) >= first && getBlockId(type) < first + W.WOOD_BLOCK_IDS && W.shapeInfo(getBlockId(type))?.wood === wood, `${type}: numer w bloku swojego drewna`);
        check(kind === 'table' ? getRecipe(type) : true, `${type}: przepis`);
    }
    check(getRecipe(`${wood}_chest`) && isChestId(getBlockId(`${wood}_chest_west`)), `${wood}: skrzynia z przepisem`);
    check(W.isDoorId(W.shapeId(wood, 'door', { facing: 'south', part: 'upper', hinge: 'right', open: true })) && !W.isDoorId(W.shapeId(wood, 'trapdoor')), `${wood}: drzwi rozpoznane`);
    for (const [key, size] of [[`chest_${wood}`, [32, 32]], [`door_${wood}`, [16, 32]], [`trapdoor_${wood}`, [16, 16]]]) {
        const image = readTextureRegion(key);
        equal([image.width, image.height], size, `${key}: rozmiar`);
        check(image.rgba.some((value, i) => i % 4 === 3 && value === 255) && WORLD_ATLAS_TILES[key], `${key}: narysowana, w atlasie`);
    }
    for (let id = first; id < first + W.WOOD_BLOCK_IDS; id++) {
        const type = getBlockTypeById(id);
        if (!type) continue;
        check(!taken.has(id), `${id}: numer bez powtórzeń`);
        taken.set(id, type);
        check(getBlockDefinition(type).wood?.wood === wood || type.startsWith(`${wood}_chest`), `${type}: w bloku numerów swojego drewna`);
    }
}
equal(taken.size, 13 * (28 + 48 + 24 + 4), 'Wszystkie numery wyrobów nowych rodzajów drewna (łóżka: 24 z 32 miejsc)');
check(W.shapeId('oak', 'stairs') === 10300 + 4 * 28 && W.shapeId('jacaranda', 'bed') === 11820 + 19 * 32 && getBlockId('spruce_chest') === 10200, 'Dawne numery bez zmian');
check(getBlockDefinition('cedar_stairs').label === 'Schody cedrowe' && getBlockDefinition('kapok_fence').label === 'Płot z puchowca' && getBlockDefinition('aspen_door').label === 'Drzwi osikowe', 'Polskie nazwy wyrobów');

// Sadzonki na piasku, kokos do jedzenia.
for (const wood of ['coconut_palm', 'joshua_tree', 'dragon_tree']) check(canGrowOn(getBlockId(`${wood}_sapling`), getBlockId('sand')), `${wood}: sadzonka rośnie na piasku`);
check(!canGrowOn(getBlockId('oak_sapling'), getBlockId('sand')), 'Zwykłe sadzonki nadal tylko na ziemi');
check(FOODS.coconut_palm_kokos?.fullness > 0, 'Kokos jest jedzeniem');

console.log(`OK: klimat biomów i wyroby z nowego drewna - ${checks} sprawdzeń (sawanna ${savanna}, półpustynia ${desert}, mokradła ${wetland}, las deszczowy ${jungle}; ${taken.size} bloków wyrobów).`);
