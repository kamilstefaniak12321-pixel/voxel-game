// ------------------------------------------------------------
// SPRAWDZENIE ROŚLIN NISKICH (1.19.0) - żurawina, brusznica, truskawki,
// poziomka, dynia, cukinia, torfowiec, chrobotek
//
// - katalog: numery (stałe), bloki-płyty, etapy i ich kolejność,
// - tekstury: rysunki Kamila piksel w piksel, bok płyty ma rysunek
//   w tylu dolnych wierszach, ile płyta ma wysokości,
// - geometria: wierzch i boki płyty, bok bierze dolne wiersze rysunku,
//   sąsiednie płyty i pełne bloki zasłaniają boki,
// - celowanie: pudełko do wysokości płyty,
// - wzrost i zbiór; pnącze dyni zawiązuje owoc obok siebie,
// - przedmioty, jedzenie, pieczenie, przepisy,
// - świat: plamy tylko w swoich biomach, powtarzalne, dotychczasowe
//   plamy na swoich miejscach,
// - osiągnięcia, jeżyk, komenda.
//
// Uruchomienie: node tools/sprawdz_niskie.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest, readTextureRegion, decodeTexturePng } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        // Atlas rysuje się na płótnie przeglądarki - tu wystarczy atrapa
        // (cały kafelek = UV od 0 do 1, więc widać, który kawałek rysunku
        // bierze ściana).
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = () => [];
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const { Scene } = await import('three');
const L = await import('../src/blocks/lowPlants.js');
const { LOW_PLANTS, LOW_PLANT_NAMES, SPHAGNUM, LOW_COVER_HABITAT, lowPlantType, lowPlantInfo, nextLowStage } = L;
const R = await import('../src/blocks/BlockRegistry.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, getGrowth, getHarvest, getDropType, isPlantId, isSolidId, isOpaqueId, isGrowingId, getAttach, AIR_ID } = R;
const { ITEM_TYPES, getPlacedBlock, itemExists } = await import('../src/items/ItemRegistry.js');
const { getFood, getRoast } = await import('../src/items/foods.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { cellBoxes } = await import('../src/interaction/BlockBounds.js');
const { shapeBoxes } = await import('../src/world/ShapeBoxes.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { BIOMES, BIOME_KEYS } = await import('../src/world/terrain/Biomes.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { HEDGEHOG_FOODS } = await import('../src/world/animals/Hedgehog.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message) => check(Math.abs(a - b) < 1e-6, `${message} (${a} ≈ ${b})`);
const root = new URL('../', import.meta.url);
const manifest = textureManifest();


// --- Katalog --------------------------------------------------------------------

// Numery nadane w 1.19.0 - nie wolno ich zmieniać (zapisy światów).
const FIRST_IDS = { cranberry: 15000, lingonberry: 15008, strawberry: 15016, wild_strawberry: 15024, pumpkin: 15032, zucchini: 15040 };
const EXTRA_IDS = { sphagnum_green: 15048, sphagnum_green_tall: 15049, sphagnum_red: 15050, sphagnum_red_tall: 15051,
    reindeer_lichen: 15052, pumpkin: 15053, pumpkin_young: 15054 };
const SLOT = { young: 0, plant: 1, flower: 2, unripe: 3, fruit: 4, spent: 5 };
const HEIGHTS = { cranberry: [3, 6], lingonberry: [3, 5], strawberry: [4, 8], wild_strawberry: [3, 6], pumpkin: [4, 10], zucchini: [5, 14] };

{
    check(LOW_PLANT_NAMES.join() === Object.keys(FIRST_IDS).join(), 'Sześć roślin niskich');
    const seen = new Set();
    for (const species of LOW_PLANT_NAMES) {
        const plant = LOW_PLANTS[species];
        check(plant.firstId === FIRST_IDS[species], `${species}: numer ${FIRST_IDS[species]}`);
        check(plant.young === HEIGHTS[species][0] && plant.height === HEIGHTS[species][1], `${species}: wysokości z paczki`);
        for (const part of ['young', ...plant.stages]) {
            const type = lowPlantType(species, part), definition = getBlockDefinition(type), id = getBlockId(type);
            check(id === plant.firstId + SLOT[part] && !seen.has(id) && getBlockTypeById(id) === type, `${type}: numer ${plant.firstId + SLOT[part]}`);
            seen.add(id);
            const height = part === 'young' ? plant.young : plant.height;
            check(definition.model === 'flat' && getAttach(id) !== 0 && definition.flat.height === height / 16, `${type}: płyta ${height} px`);
            check(!isSolidId(id) && !isOpaqueId(id) && isPlantId(id), `${type}: roślina bez kolizji, rośnie na ziemi`);
            check(lowPlantInfo(type).species === species && lowPlantInfo(type).part === part && lowPlantInfo(type).height === height, `${type}: opis`);
            check(definition.label && definition.category === 'rosliny' && getDropType(type) === lowPlantType(species, 'young'), `${type}: nazwa, kategoria, daje sadzonkę`);
            for (const face of ['top', 'side']) check(manifest.tiles[definition.textures[face]], `${type}: kafelek ${definition.textures[face]}`);
        }
        check(R.BLOCK_TYPES[lowPlantType(species, 'young')].label.includes(species === 'pumpkin' ? 'Siewka' : 'Sadzonka'), `${species}: sadzonka nazwana`);
    }
    for (const [type, id] of Object.entries(EXTRA_IDS)) check(getBlockId(type) === id && !seen.has(id), `${type}: numer ${id}`);
    check(SPHAGNUM.every((type) => getBlockDefinition(type).flat.height === (type.endsWith('_tall') ? 6 : 3) / 16 && !isPlantId(getBlockId(type))), 'Torfowiec: płyty 3 i 6 px');
    check(getBlockDefinition('reindeer_lichen').model === 'flat' && !getBlockDefinition('reindeer_lichen').flat.height && getBlockDefinition('reindeer_lichen').replaceable, 'Chrobotek: płaski porost');
    check(isSolidId(getBlockId('pumpkin')) && isOpaqueId(getBlockId('pumpkin')) && getDropType('pumpkin') === 'pumpkin', 'Dynia: pełny blok');
    check(isSolidId(getBlockId('pumpkin_young')) && !isOpaqueId(getBlockId('pumpkin_young')) && getDropType('pumpkin_young') === 'pumpkin_seeds', 'Młoda dynia: mniejsza, daje pestki');
    const gourd = shapeBoxes(getBlockId('pumpkin_young'), 'render');
    check(gourd.length === 1 && gourd[0].join() === [3 / 16, 0, 3 / 16, 13 / 16, 9 / 16, 13 / 16].join(), 'Młoda dynia: 10 x 9 x 10 px');
    const all = Object.values(R.BLOCK_TYPES).filter((definition) => definition.id >= L.LOW_PLANT_FIRST_ID && definition.id < L.LOW_PLANT_END_ID);
    check(all.length === 33, `33 bloki w zakresie 15000-15199 (${all.length})`);
    check(Object.values(R.BLOCK_TYPES).every((definition) => definition.lowPlant === undefined || (definition.id >= 15000 && definition.id < 15048)), 'Rośliny z etapami w swoim zakresie');
}


// --- Tekstury -------------------------------------------------------------------

{
    const same = (tile, file) => readTextureRegion(tile).rgba.equals(decodeTexturePng(readFileSync(new URL(`tools/wzorce/niskie/${file}.png`, root))).rgba);
    const pairs = [
        ['low_cranberry_fruit_top', 'cranberry/cranberry_fruit_top_hi'], ['low_cranberry_young_side', 'cranberry/cranberry_side_lo'],
        ['low_lingonberry_fruit_side', 'lingonberry/lingonberry_fruit'], ['low_lingonberry_unripe_top', 'lingonberry/lingonberry_fruit_alt_top'],
        ['low_strawberry_flower_top', 'strawberry/strawberry_flower_top'], ['low_wild_strawberry_fruit_side', 'strawberry/wild_strawberry_fruit'],
        ['low_pumpkin_plant_top', 'pumpkin_zucchini/pvine_top'], ['low_pumpkin_spent_side', 'pumpkin_zucchini/pvine_yellow_side'],
        ['pumpkin_side', 'pumpkin_zucchini/pumpkin'], ['pumpkin_young_top', 'pumpkin_zucchini/pumpkin_young_top'],
        ['low_zucchini_fruit_side', 'pumpkin_zucchini/zuc_side'], ['sphagnum_red_tall_top', 'cranberry/sphagnum_red_top_hi'],
        ['reindeer_lichen', 'lingonberry/lichen_heath'], ['item_cranberry', 'cranberry/item_cranberries'],
        ['item_lingonberry', 'lingonberry/item_lingonberries'], ['item_wild_strawberry', 'strawberry/item_wild_strawberry'],
        ['item_pumpkin_slice', 'pumpkin_zucchini/item_pumpkin_slice'], ['item_zucchini', 'pumpkin_zucchini/item_zucchini']
    ];
    for (const [tile, file] of pairs) check(same(tile, file), `${tile}: rysunek Kamila piksel w piksel (${file})`);

    // Bok płyty: w dolnych wierszach (tyle, ile płyta ma wysokości) jest rysunek.
    const filledRows = (tile) => {
        const image = readTextureRegion(tile), rows = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (image.rgba[(y * 16 + x) * 4 + 3] >= 128) { rows.push(y); break; }
        return rows;
    };
    for (const species of LOW_PLANT_NAMES) for (const part of ['young', ...LOW_PLANTS[species].stages]) {
        const definition = getBlockDefinition(lowPlantType(species, part));
        const height = Math.round(definition.flat.height * 16), rows = filledRows(definition.textures.side);
        const visible = rows.filter((y) => y >= 16 - height);
        check(visible.length >= Math.min(height, 3), `${definition.textures.side}: bok ma rysunek w dolnych ${height} wierszach (${visible.length})`);
    }
    // Bok cukinii bez owocu: bez ciemnego owocu i żółtego kwiatu, łodygi zostają.
    const empty = readTextureRegion('low_zucchini_plant_side'), fruit = readTextureRegion('low_zucchini_fruit_side');
    let changed = 0, fruitPixels = 0;
    for (let i = 0; i < 256; i++) {
        const [r, g, b, a] = empty.rgba.subarray(i * 4, i * 4 + 4);
        if (!empty.rgba.subarray(i * 4, i * 4 + 4).equals(fruit.rgba.subarray(i * 4, i * 4 + 4))) changed++;
        if (i >= 9 * 16 && a === 255 && ((r === 0x3a && g === 0x48 && b === 0x35) || (r === 0xed && g === 0xb0))) fruitPixels++;
    }
    check(changed > 30 && fruitPixels === 0, `Bok cukinii bez owocu dorysowany (${changed} pikseli)`);
    const lum = (tile) => { const image = readTextureRegion(tile); let sum = 0, n = 0; for (let i = 0; i < 256; i++) if (image.rgba[i * 4 + 3] >= 128) { sum += image.rgba[i * 4] + image.rgba[i * 4 + 1] + image.rgba[i * 4 + 2]; n++; } return sum / n; };
    check(lum('roasted_pumpkin_slice') < lum('item_pumpkin_slice') - 40 && lum('roasted_zucchini') < lum('item_zucchini') + 40, 'Pieczone: ciemniejsza dynia, cieplejsza cukinia');
}


// --- Etapy, wzrost, zbiór ---------------------------------------------------------

{
    for (const species of LOW_PLANT_NAMES) {
        const plant = LOW_PLANTS[species], type = (part) => lowPlantType(species, part);
        check(getGrowth(type('young')).into === type('plant') && isGrowingId(getBlockId(type('young'))), `${species}: sadzonka rośnie w roślinę`);
        let part = 'plant', path = ['plant'];
        while (nextLowStage(species, part)) { check(getGrowth(type(part)).into === type(nextLowStage(species, part)), `${species}: ${part} rośnie dalej`); part = nextLowStage(species, part); path.push(part); }
        if (plant.item) {
            check(part === 'fruit' && path.join() === plant.stages.join(), `${species}: ${path.join(' -> ')}`);
            const harvest = getHarvest(type('fruit'));
            check(harvest.item === plant.item && harvest.becomes === type('plant') && harvest.count.join() === plant.count.join() && !getGrowth(type('fruit')), `${species}: PPM zbiera ${plant.item}, roślina wraca do "plant"`);
            check(plant.stages.filter((stage) => stage !== 'fruit').every((stage) => getHarvest(type(stage)) === null), `${species}: zbiera się tylko owoce`);
            check(itemExists(plant.item) && getFood(plant.item), `${plant.item}: jadalny przedmiot`);
        }
    }
    const flower = getGrowth('low_pumpkin_flower');
    check(flower.fruit === 'pumpkin_young' && flower.into === 'low_pumpkin_spent' && getGrowth('low_pumpkin_spent').into === 'low_pumpkin_plant', 'Dynia: kwiat zawiązuje owoc i żółknie, potem zielenieje');
    check(getGrowth('pumpkin_young').into === 'pumpkin' && !getGrowth('pumpkin'), 'Młoda dynia dorasta');
    check(getPlacedBlock('cranberry') === 'low_cranberry_young' && getPlacedBlock('lingonberry') === 'low_lingonberry_young' &&
        getPlacedBlock('wild_strawberry') === 'low_wild_strawberry_young' && getPlacedBlock('pumpkin_seeds') === 'low_pumpkin_young' &&
        getPlacedBlock('zucchini') === 'low_zucchini_young', 'Owoce i pestki sadzą sadzonkę');
    check(getPlacedBlock('strawberry') === 'strawberry_sapling', 'Truskawka dalej sadzi krzak z 0.50.0 (płytę - z sadzonki)');
    check(getRoast('pumpkin_slice') === 'roasted_pumpkin_slice' && getRoast('zucchini') === 'roasted_zucchini' && getFood('roasted_pumpkin_slice').kind === 'meal', 'Dynię i cukinię da się upiec');
    const recipe = (id) => RECIPES.find((entry) => entry.id === id);
    check(recipe('pumpkin_slice').result.join() === 'pumpkin_slice,4' && recipe('pumpkin_slice').ingredients.join() === 'pumpkin', 'Przepis: dynia -> 4 kawałki');
    check(recipe('pumpkin_seeds').result.join() === 'pumpkin_seeds,2' && recipe('pumpkin_seeds').ingredients.join() === 'pumpkin_slice', 'Przepis: kawałek -> 2 pestki');
    for (const item of ['cranberry', 'lingonberry', 'wild_strawberry', 'pumpkin_slice', 'pumpkin_seeds', 'zucchini', 'roasted_pumpkin_slice', 'roasted_zucchini']) {
        check(ITEM_TYPES[item].label && manifest.tiles[ITEM_TYPES[item].icon] && getFood(item), `${item}: przedmiot z ikonką, jadalny`);
    }
}


// --- Świat: geometria, celowanie, dynia ----------------------------------------------

{
    const world = new World(new Scene(), 123, new Map(), 'classic');
    const chunk = new Chunk(0, 0);
    chunk.skyLight.fill(15);
    world.chunks.set('0,0', chunk);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setId(x, 9, z, getBlockId('dirt'));

    const quads = () => {
        const geometry = buildChunkGeometry(chunk, world);
        const position = geometry.attributes.position.array, uv = geometry.attributes.uv.array, out = [];
        for (let i = 0; i < position.length / 12; i++) {
            const ys = [0, 1, 2, 3].map((k) => position[i * 12 + k * 3 + 1]);
            if (Math.max(...ys) <= 10 + 1e-6 && Math.min(...ys) >= 10 - 1e-6 && Math.max(...ys) === 10) continue;   // wierzch ziemi
            if (Math.max(...ys) <= 10 && Math.min(...ys) < 10) continue;                                           // boki ziemi
            const vs = [0, 1, 2, 3].map((k) => uv[i * 8 + k * 2 + 1]), us = [0, 1, 2, 3].map((k) => uv[i * 8 + k * 2]);
            out.push({ top: Math.max(...ys), bottom: Math.min(...ys), v: [Math.min(...vs), Math.max(...vs)], u: [Math.min(...us), Math.max(...us)] });
        }
        geometry.dispose();
        return out;
    };
    const base = quads().length;

    // Jedna płyta: wierzch i cztery boki; bok = dolne wiersze rysunku.
    world.setBlock(5, 10, 5, 'low_lingonberry_fruit');
    let faces = quads().slice(base);
    const height = 5 / 16;
    const tops = faces.filter((face) => face.top === face.bottom), sides = faces.filter((face) => face.top !== face.bottom);
    check(faces.length === 5 && tops.length === 1 && sides.length === 4, `Płyta: wierzch i 4 boki (${faces.length})`);
    near(tops[0].top, 10 + height, 'Wierzch na wysokości płyty');
    check(tops[0].v[1] - tops[0].v[0] === 1 && tops[0].u[1] - tops[0].u[0] === 1, 'Wierzch: cały rysunek');
    for (const side of sides) {
        near(side.top - side.bottom, height, 'Bok tak wysoki jak płyta');
        near(side.v[1] - side.v[0], height, 'Bok: tylko dolne wiersze rysunku');
        check(side.u[1] - side.u[0] === 1 && (side.v[0] === 0 || side.v[1] === 1), 'Bok: cała szerokość, od krawędzi rysunku');
    }
    check(cellBoxes(world, getBlockId('low_lingonberry_fruit'), 5, 10, 5)[0].join() === [0, 0, 0, 1, height, 1].join(), 'Celowanie: pudełko do wysokości płyty');
    check(cellBoxes(world, getBlockId('low_zucchini_fruit'), 5, 10, 5)[0][4] === 14 / 16 && cellBoxes(world, getBlockId('reindeer_lichen'), 5, 10, 5)[0][4] < 0.1, 'Cukinia wysoka, chrobotek płaski');

    // Sąsiedzi: taka sama płyta zasłania wspólne boki, niższa - tylko swój.
    world.setBlock(6, 10, 5, 'low_lingonberry_plant');
    check(quads().length - base === 8, 'Dwie równe płyty: 2 wierzchy i 6 boków');
    world.setBlock(6, 10, 5, 'low_lingonberry_young');
    check(quads().length - base === 9, 'Wyższa obok niższej: wyższa pokazuje bok nad niższą');
    world.setBlock(6, 10, 5, 'stone');
    faces = quads();
    check(faces.filter((face) => Math.abs(face.top - face.bottom - height) < 1e-6).length === 3, 'Płyta przy kamieniu: 3 boki');
    world.setBlock(6, 10, 5, null);

    // Podłoże: bez ziemi pod spodem płyta znika; na kamieniu nie rośnie.
    world.setBlock(5, 9, 5, null);
    check(world.getBlockId(5, 10, 5) === AIR_ID, 'Bez ziemi pod spodem roślina znika');
    world.setBlock(5, 9, 5, 'dirt');

    // Dynia: kwitnące pnącze zawiązuje owoc obok.
    const growth = new PlantGrowth(world);
    const grow = (x, y, z) => growth.grow(world.getChunkAt?.(x, z) ?? chunk, chunk.index(x, y, z), getGrowth(getBlockTypeById(world.getBlockId(x, y, z))));
    world.setBlock(8, 10, 8, 'low_pumpkin_flower');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.setBlock(8 + dx, 10, 8 + dz, 'stone');
    check(grow(8, 10, 8) === false && getBlockTypeById(world.getBlockId(8, 10, 8)) === 'low_pumpkin_flower', 'Bez miejsca obok pnącze czeka z owocem');
    world.setBlock(9, 10, 8, null);
    check(grow(8, 10, 8) === true && getBlockTypeById(world.getBlockId(9, 10, 8)) === 'pumpkin_young' && getBlockTypeById(world.getBlockId(8, 10, 8)) === 'low_pumpkin_spent', 'Owoc w wolnej komórce obok, pnącze żółknie');
    check(grow(9, 10, 8) === true && getBlockTypeById(world.getBlockId(9, 10, 8)) === 'pumpkin', 'Młoda dynia dorasta do dyni');
    check(grow(8, 10, 8) === true && getBlockTypeById(world.getBlockId(8, 10, 8)) === 'low_pumpkin_plant', 'Pnącze zielenieje');
    check(grow(8, 10, 8) === true && getBlockTypeById(world.getBlockId(8, 10, 8)) === 'low_pumpkin_flower', 'I kwitnie od nowa');
    world.setBlock(7, 10, 8, null);
    check(grow(8, 10, 8) === false && world.getBlockId(7, 10, 8) === AIR_ID, 'Obok leżącej dyni drugiej nie zawiązuje');
    world.setBlock(9, 10, 8, null);
    world.setBlock(7, 9, 8, null);
    world.setBlock(9, 9, 8, getBlockId('water') ? 'water' : null);
    check(grow(8, 10, 8) === false, 'Nad dziurą i wodą owoc się nie zawiąże');

    // Zwykły wzrost i zbiór.
    world.setBlock(3, 10, 3, 'low_cranberry_young');
    for (const expected of ['plant', 'flower', 'unripe', 'fruit']) {
        check(grow(3, 10, 3) === true && getBlockTypeById(world.getBlockId(3, 10, 3)) === `low_cranberry_${expected}`, `Żurawina: etap ${expected}`);
    }
    check(getGrowth(getBlockTypeById(world.getBlockId(3, 10, 3))) === null, 'Owoce czekają na zbiór');
}


// --- Świat: dzikie plamy ---------------------------------------------------------------

{
    const generator = new RealisticGenerator('niskie-1');
    const low = (id) => id >= 15000 && id < 15200;
    // Plamy roślin niskich są na końcu listy biomu - dotychczasowe zostają na miejscach.
    for (const [index, key] of BIOME_KEYS.entries()) {
        const patches = generator.biomeData[index].plants?.patches ?? [];
        const firstLow = patches.findIndex((patch) => low(patch.id) || patch.ids?.some(low));
        check(firstLow < 0 || patches.slice(firstLow).every((patch) => low(patch.id) || patch.ids?.every(low)), `${key}: plamy roślin niskich na końcu`);
        const own = (BIOMES[key].plants?.patches ?? []).length;
        check(patches.slice(0, own).every((patch) => !low(patch.id)), `${key}: plamy biomu bez zmian`);
        const expected = new Set([
            ...LOW_PLANT_NAMES.filter((species) => LOW_PLANTS[species].habitat[key]).map((species) => LOW_PLANTS[species].firstId),
            ...Object.entries(LOW_COVER_HABITAT).filter(([, habitat]) => habitat[key]).map(([type]) => getBlockId(type))
        ]);
        const got = new Set(patches.filter((patch) => patch.salt !== undefined && (low(patch.id) || patch.ids?.some(low))).map((patch) => patch.salt));
        check(BIOMES[key].plants ? [...expected].every((salt) => got.has(salt)) && got.size === expected.size : got.size === 0, `${key}: rośliny niskie według siedlisk`);
    }
    for (const species of LOW_PLANT_NAMES) for (const key of Object.keys(LOW_PLANTS[species].habitat)) check(BIOMES[key]?.plants, `${species}: biom ${key} istnieje i ma rośliny`);
    let sum = 0;
    for (const species of LOW_PLANT_NAMES) { sum = Object.values(LOW_PLANTS[species].wild).reduce((a, b) => a + b, 0); near(sum, 1, `${species}: wagi etapów dzikich`); }

    // Próbka terenu: każda roślina gdzieś rośnie, tylko w swoich biomach, zawsze tak samo.
    const counts = {}, wrong = [];
    let land = 0, total = 0;
    const sample = {};
    // (Duży obszar rzadką siatką - gaj oliwny i sawanna są daleko od siebie.)
    for (let x = -6000; x < 6000; x += 12) for (let z = -3000; z < 3000; z += 12) {
        generator.compute(x, z, 0, sample);
        if (sample.ocean) continue;
        land++;
        const biome = generator.biomeIndexAt(x, z, sample);
        const id = generator.patchPlantAt(x, z, biome, 'ziemia');
        if (!low(id)) continue;
        total++;
        const type = getBlockTypeById(id), info = lowPlantInfo(type);
        const species = info?.species ?? (type.startsWith('pumpkin') ? 'pumpkin' : type);
        counts[species] = (counts[species] ?? 0) + 1;
        const habitat = LOW_PLANTS[species]?.habitat ?? LOW_COVER_HABITAT[species];
        if (!habitat[BIOME_KEYS[biome]]) wrong.push(`${type} w ${BIOME_KEYS[biome]}`);
        if ((x + z) % 96 === 0) check(generator.patchPlantAt(x, z, biome, 'ziemia') === id, 'Ta sama kolumna - ta sama roślina');
        check(generator.patchPlantAt(x, z, biome, 'piasek') === 0 || !low(generator.patchPlantAt(x, z, biome, 'piasek')), 'Na piasku nie rosną');
    }
    check(wrong.length === 0, `Rośliny tylko w swoich biomach (${wrong.slice(0, 3).join(', ')})`);
    for (const species of [...LOW_PLANT_NAMES, ...Object.keys(LOW_COVER_HABITAT)]) check(counts[species] > 0, `${species}: rośnie dziko (${counts[species] ?? 0} w próbce)`);
    check(total / land > 0.002 && total / land < 0.08, `Rośliny niskie zajmują ${(100 * total / land).toFixed(2)}% lądu`);
}


// --- Osiągnięcia, jeżyk -----------------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    for (const id of ['low_berries', 'low_planted', 'pumpkin_slices']) check(byId[id] && itemExists(byId[id].icon), `Osiągnięcie ${id}`);
    const book = { sets: new Map(), collect(key, item) { const set = this.sets.get(key) ?? new Set(); set.add(item); this.sets.set(key, set); return set.size; } };
    check(!byId.low_berries.when({ item: 'cranberry' }, book) && !byId.low_berries.when({ item: 'raspberry' }, book) &&
        !byId.low_berries.when({ item: 'lingonberry' }, book) && byId.low_berries.when({ item: 'wild_strawberry' }, book), 'Runo leśne: trzy różne owoce');
    check(byId.low_planted.when({ type: 'low_pumpkin_young' }) && !byId.low_planted.when({ type: 'shrub_aronia_sapling' }) && !byId.low_planted.when({ type: 'low_pumpkin_plant' }), 'Grządka: posadzona sadzonka');
    check(byId.pumpkin_slices.when({ type: 'pumpkin_slice' }) && !byId.pumpkin_slices.when({ type: 'stick' }), 'Dyniowe żniwa: pokrojona dynia');
    check(['cranberry', 'lingonberry', 'wild_strawberry'].every((item) => HEDGEHOG_FOODS.has(item)) && !HEDGEHOG_FOODS.has('pumpkin_slice'), 'Jeżyk je leśne jagody');
}

console.log(`OK: rośliny niskie - ${checks} sprawdzeń (katalog i numery, tekstury z paczki, płyty w geometrii i celowaniu, wzrost i zbiór, dynia obok pnącza, przedmioty i przepisy, dzikie plamy w biomach, osiągnięcia).`);
