// ------------------------------------------------------------
// SPRAWDZENIE OWOCOWANIA W PORACH ROKU I SUSZENIA (1.21.0)
//
// - kalendarz: każda owocująca roślina ma pory albo świadomie ich nie
//   ma (tropiki, szyszki); wpisy trafiają do plantSeasons,
// - wygląd przez cały rok: poza porą roślina bez owoców, na początku
//   pory kwiaty / pierwsze owoce, potem owoce; blok w świecie bez zmian,
// - zima: nic nie rośnie; owoce dzikiej róży, rokitnika i żurawiny
//   zostają do zebrania, ale nie odrastają,
// - wzrost (prawdziwy PlantGrowth): w porze rośnie, poza nią czeka,
// - celowanie i zbiór: poza porą nie ma czego zebrać,
// - przebudowa chunka przy zmianie wyglądu (teren, nie same rośliny),
// - suszenie: każdy owoc -> suszone owoce, glina dalej schnie po swojemu,
// - kwiaty z paczek działają jak dotąd.
//
// Uruchomienie: node tools/sprawdz_pory_owocowania.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
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

const { Scene, Vector3 } = await import('three');
const R = await import('../src/blocks/BlockRegistry.js');
const { getBlockId, getBlockTypeById, getHarvest, getGrowth, FRUIT_BUSHES, bushStages } = R;
const P = await import('../src/blocks/plantSeasons.js');
const F = await import('../src/blocks/fruitSeasons.js');
const { SHRUBS, SHRUB_NAMES, shrubType } = await import('../src/blocks/shrubs.js');
const { LOW_PLANTS, LOW_PLANT_NAMES, lowPlantType } = await import('../src/blocks/lowPlants.js');
const { SEASON_DAYS, YEAR_DAYS, seasonAt } = await import('../src/sky/Seasons.js');
const { PLANT_PACKS } = await import('../src/blocks/plantPacks.js');
const D = await import('../src/items/drying.js');
const { DRYING } = await import('../src/items/clay.js');
const { getFood } = await import('../src/items/foods.js');
const { itemExists, ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { dishFor, isIngredient } = await import('../src/items/cooking.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { itemUses } = await import('../src/items/uses.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const manifest = textureManifest();

// Początek wiosny roku, w którym nic nie jest "przed światem".
let SPRING = 0;
while (seasonAt(SPRING).index !== 0 || seasonAt(SPRING).progress > 0.001) SPRING += 0.001;
SPRING += YEAR_DAYS;
const at = (season, part) => SPRING + (season + part) * SEASON_DAYS;
const shown = (type, days, x = 10, y = 70, z = 10) => getBlockTypeById(P.shownPlantId(getBlockId(type), x, y, z, days));
const NAMES = ['wiosna', 'lato', 'jesień', 'zima'];


// --- Kalendarz -----------------------------------------------------------------------

{
    check(Object.keys(F.BUSH_SEASONS).sort().join() === Object.keys(FRUIT_BUSHES).sort().join(), 'Każdy krzak z 0.50.0 ma pory');
    check(Object.keys(F.SHRUB_SEASONS).sort().join() === [...SHRUB_NAMES].sort().join(), 'Każdy krzew jagodowy ma pory');
    check(Object.keys(F.LOW_SEASONS).sort().join() === [...LOW_PLANT_NAMES].sort().join(), 'Każda roślina niska ma pory');
    for (const seasons of [...Object.values(F.BUSH_SEASONS), ...Object.values(F.SHRUB_SEASONS), ...Object.values(F.LOW_SEASONS)]) {
        check(seasons.length >= 1 && seasons.every((season) => season >= 0 && season <= 2), 'Pory wzrostu: wiosna, lato, jesień - nigdy zima');
    }
    const calendar = F.fruitCalendar();
    // (1.30.0: + 4 pnącza.)
    check(Object.keys(F.VINE_SEASONS).sort().join() === 'grape,hop,kiwi,passion_fruit', 'Każde pnącze ma pory');
    check(calendar.length === 28 && calendar.every(([label, seasons]) => typeof label === 'string' && label.length > 2 && seasons.length >= 1), 'Kalendarz: każda roślina ma nazwę');
    for (let season = 0; season < 3; season++) check(calendar.some(([, seasons]) => seasons.includes(season)), `${NAMES[season]}: coś owocuje`);
    const winter = calendar.filter(([, seasons]) => seasons.includes(3)).map(([label]) => label);
    check(winter.length === 3, `Zimą zostają trzy owoce (${winter.join(', ')})`);
    check(calendar.filter(([, seasons]) => seasons.includes(0)).length >= 2, 'Wiosną są co najmniej dwie rośliny (pierwsze dni nowego świata)');

    // Każdy blok ze zbiorem jest w kalendarzu albo świadomie poza nim.
    const yearRound = /^(baobab|coconut_palm|mangrove|kapok|joshua_tree|araucaria|banyan|dragon_tree|sequoia|fir|larch|cedar|bristlecone)_leaves_|^pine_log_resin$/;
    for (const [type, definition] of Object.entries(R.BLOCK_TYPES)) {
        if (!getHarvest(type)) continue;
        const info = P.plantSeasonInfo(definition.id);
        if (PLANT_PACKS.some((pack) => definition.id >= pack.firstId && definition.id < pack.firstId + pack.stages.length)) continue;
        check(yearRound.test(type) ? !info : Boolean(info?.fruit), `${type}: ${yearRound.test(type) ? 'cały rok' : 'ma pory'}`);
    }
    const entries = F.fruitSeasonEntries();
    check(new Set(entries.map((entry) => entry.id)).size === entries.length, 'Każdy blok ma jeden wpis');
    for (const entry of entries) {
        check(P.isSeasonalPlant(entry.id) && P.FRUIT_SEASONAL[entry.id] === 1 && P.plantSeasonInfo(entry.id).shown.join() === entry.shown.join(), `${getBlockTypeById(entry.id)}: w plantSeasons`);
        check(entry.shown.length === 2 && entry.shown.every((id) => getBlockTypeById(id)) && P.plantSeasonInfo(entry.shown[0]).stage === 0, `${getBlockTypeById(entry.id)}: wie, co pokazać poza porą`);
    }
    // Kwiaty z paczek: bez zmian (nie są "owocami", mają numery po kolei).
    const pack = PLANT_PACKS.find((entry) => entry.seasons);
    check(P.plantSeasonInfo(pack.firstId + 1).pack === pack.id && !P.plantSeasonInfo(pack.firstId + 1).shown && P.FRUIT_SEASONAL[pack.firstId + 1] !== 1, 'Kwiaty z paczek jak dotąd');
}


// --- Wygląd przez cały rok ---------------------------------------------------------------

{
    // Krzew: malina owocuje latem.
    const fruit = shrubType('raspberry', 'fruit'), rest = shrubType('raspberry', 'growing');
    check(shown(fruit, at(0, 0.5)) === rest && shown(fruit, at(2, 0.5)) === rest && shown(fruit, at(3, 0.5)) === rest, 'Malina poza latem: krzew bez owoców');
    check(shown(fruit, at(1, 0.5)) === fruit, 'Malina latem: owoce');
    check(shown(rest, at(1, 0.5)) === rest && shown(rest, at(3, 0.5)) === rest, 'Krzew bez owoców wygląda zawsze tak samo');
    check(shown(shrubType('raspberry', 'fruit', 1), at(1, 0.5)) === shrubType('raspberry', 'fruit', 1) && shown(shrubType('raspberry', 'fruit', 1), at(3, 0.5)) === shrubType('raspberry', 'growing', 1), 'Odmiana żółta: swoje bloki');

    // Początek pory: każda roślina budzi się w swojej chwili, najpierw kwiaty.
    let woke = 0, flowers = 0, steps = 0;
    const stages = new Set();
    for (let x = 0; x < 40; x++) {
        let previous = rest;
        for (let t = 0; t <= 2.5; t += 0.05) {
            const now = shown(fruit, at(1, 0) + t, x, 70, 3);
            stages.add(now);
            if (now !== previous) { steps++; if (previous === rest) { woke++; if (now === shrubType('raspberry', 'flower')) flowers++; } }
            previous = now;
        }
        check(previous === fruit, 'Po 2,5 doby pory wszystkie owocują');
    }
    check(woke === 40 && flowers === 40 && steps === 80 && stages.size === 3, 'Pobudka: krzew -> kwiaty -> owoce');
    const wakes = new Set();
    for (let x = 0; x < 40; x++) wakes.add(Math.round((P.nextPlantChange(getBlockId(fruit), x, 70, 3, at(1, 0) - 0.01) - at(1, 0)) * 100));
    check(wakes.size > 20 && Math.max(...wakes) <= P.WAKE_DAYS * 100 + 1 && Math.min(...wakes) >= 0, `Każda roślina we własnej chwili (${wakes.size} terminów w ${P.WAKE_DAYS} doby)`);

    // Rośliny niskie i krzaki.
    check(shown('low_wild_strawberry_fruit', at(0, 0.5)) === 'low_wild_strawberry_fruit' && shown('low_wild_strawberry_fruit', at(1, 0.5)) === 'low_wild_strawberry_fruit' &&
        shown('low_wild_strawberry_fruit', at(2, 0.5)) === 'low_wild_strawberry_plant', 'Poziomka: wiosna i lato');
    check(shown('low_pumpkin_flower', at(0, 0.5)) === 'low_pumpkin_plant' && shown('low_pumpkin_flower', at(1, 0.5)) === 'low_pumpkin_flower' && shown('low_pumpkin_spent', at(3, 0.5)) === 'low_pumpkin_plant', 'Pnącze dyni: kwitnie latem i jesienią');
    check(shown('pumpkin', at(3, 0.5)) === 'pumpkin' && !P.isSeasonalPlant(getBlockId('pumpkin')) && !P.isSeasonalPlant(getBlockId('pumpkin_young')), 'Dynia leży bez względu na porę');
    const [sapling, bush, few, full] = bushStages('strawberry');
    check(shown(full, at(2, 0.5)) === bush && shown(few, at(3, 0.5)) === bush && shown(full, at(0, 0.5)) === full && shown(sapling, at(3, 0.5)) === sapling, 'Krzak truskawki: wiosna i lato');
    check(shown('hazel_bush_full', at(1, 0.5)) === 'hazel_bush' && shown('hazel_bush_full', at(2, 0.5)) === 'hazel_bush_full', 'Leszczyna: jesień');

    // Drzewa.
    check(shown('jablon_leaves_jablka', at(0, 0.5)) === 'jablon_leaves_jablka_growing' && shown('jablon_leaves_jablka', at(1, 0.6)) === 'jablon_leaves_jablka' &&
        shown('jablon_leaves_jablka', at(2, 0.5)) === 'jablon_leaves_jablka' && shown('jablon_leaves_jablka', at(3, 0.5)) === 'jablon_leaves_jablka_growing', 'Jabłoń: lato i jesień');
    check(shown('olive_leaves_oliwki', at(1, 0.5)) === 'olive_leaves_oliwki_growing' && shown('olive_leaves_oliwki', at(2, 0.5)) === 'olive_leaves_oliwki', 'Oliwka: jesień');
    check(shown('linden_leaves_flowering', at(1, 0.5)) === 'linden_leaves_flowering' && shown('linden_leaves_flowering', at(2, 0.5)) === 'linden_leaves', 'Lipa kwitnie latem');
    check(shown('coconut_palm_leaves_kokosy', at(3, 0.5)) === 'coconut_palm_leaves_kokosy' && shown('banyan_leaves_figi', at(3, 0.5)) === 'banyan_leaves_figi', 'Palma i figowiec: cały rok');

    // Zima: zostają tylko dojrzałe owoce trzech roślin.
    for (const [type, rest2] of [[shrubType('dog_rose', 'fruit'), shrubType('dog_rose', 'growing')], [shrubType('sea_buckthorn', 'fruit'), shrubType('sea_buckthorn', 'growing')], ['low_cranberry_fruit', 'low_cranberry_plant']]) {
        check(shown(type, at(3, 0.5)) === type && shown(type, at(0, 0.5)) === rest2, `${type}: zimuje, wiosną już nie`);
    }
    check(shown('low_cranberry_flower', at(3, 0.5)) === 'low_cranberry_plant' && shown('low_cranberry_unripe', at(3, 0.5)) === 'low_cranberry_plant' && shown(shrubType('dog_rose', 'flower'), at(3, 0.5)) === shrubType('dog_rose', 'growing'), 'Kwiatów i zawiązków zimą nie widać');
    let winterFruit = 0;
    for (const entry of F.fruitSeasonEntries()) if (entry.stage > 0 && P.shownPlantId(entry.id, 3, 70, 9, at(3, 0.5)) === entry.id) winterFruit++;
    check(winterFruit === 3, `W środku zimy owoce pokazują tylko trzy bloki (${winterFruit})`);
}


// --- Wzrost ----------------------------------------------------------------------------------

{
    const factor = (type, season) => P.plantGrowthFactor(getBlockId(type), at(season, 0.5));
    for (const type of ['oak_sapling', 'tilled_dirt', 'low_cranberry_young', 'shrub_raspberry_sapling', 'pumpkin_young', 'strawberry_sapling', 'coconut_palm_leaves_kokosy_growing']) {
        check(factor(type, 0) === 1 && factor(type, 1) === 1 && factor(type, 2) === 1 && factor(type, 3) === 0, `${type}: rośnie poza zimą`);
    }
    check(factor(shrubType('raspberry', 'growing'), 1) === 1 && factor(shrubType('raspberry', 'growing'), 0) === 0 && factor(shrubType('raspberry', 'growing'), 2) === 0, 'Malina zawiązuje owoce tylko latem');
    check(factor(shrubType('raspberry', 'flower'), 1) === 1 && factor(shrubType('raspberry', 'flower'), 2) === 0 && factor('low_cranberry_unripe', 1) === 0, 'Kwiaty i zawiązki też czekają na porę');
    check(factor('low_cranberry_plant', 2) === 1 && factor('low_cranberry_plant', 3) === 0 && factor(shrubType('dog_rose', 'growing'), 3) === 0, 'Rośliny z zimującymi owocami zimą nie rosną');
    check(factor('jablon_leaves_jablka_growing', 1) === 1 && factor('jablon_leaves_jablka_growing', 0) === 0, 'Jabłka odrastają latem i jesienią');
    const winterPack = PLANT_PACKS.find((entry) => entry.seasons?.includes(3));
    if (winterPack) check(P.plantGrowthFactor(winterPack.firstId, at(3, 0.5)) > 0, `${winterPack.id}: roślina zimowa rośnie zimą`);

    // Prawdziwy PlantGrowth: krzew maliny przez lato i jesień.
    const world = new World(new Scene(), 123, new Map(), 'classic');
    const chunk = new Chunk(0, 0);
    chunk.skyLight.fill(15);
    world.chunks.set('0,0', chunk);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setId(x, 9, z, getBlockId('dirt'));
    world.setBlock(4, 10, 4, 'low_wild_strawberry_plant');
    world.setBlock(8, 10, 8, 'oak_sapling');
    const growth = new PlantGrowth(world);
    const run = (days, seconds) => { growth.days = days; growth.advance(seconds); };
    check(chunk.modified, 'Posadzone - chunk rośnie');
    run(at(3, 0.5), 6000);
    check(getBlockTypeById(world.getBlockId(4, 10, 4)) === 'low_wild_strawberry_plant' && getBlockTypeById(world.getBlockId(8, 10, 8)) === 'oak_sapling', 'Zima: przez 100 minut nic nie urosło');
    run(at(2, 0.5), 6000);
    check(getBlockTypeById(world.getBlockId(4, 10, 4)) === 'low_wild_strawberry_plant', 'Jesień: poziomka czeka na swoją porę');
    check(getBlockTypeById(world.getBlockId(8, 10, 8)) !== 'oak_sapling', 'Jesień: dąb rośnie');
    run(at(0, 0.5), 6000);
    check(getBlockTypeById(world.getBlockId(4, 10, 4)) === 'low_wild_strawberry_fruit', 'Wiosna: poziomka zakwitła i owocuje');

    // Celowanie i zbiór: zimą widać (i trafia się) roślinę bez owoców.
    const raycast = new VoxelRaycast(world, 5);
    const aim = () => raycast.cast(new Vector3(4.5, 12, 4.5), new Vector3(0, -1, 0));
    world.updateSeasons(at(0, 0.5));
    check(aim().block.type === 'low_wild_strawberry_fruit' && getHarvest(aim().block.type), 'Wiosną celownik trafia w owoce - jest co zbierać');
    world.updateSeasons(at(3, 0.5));
    check(aim().block.type === 'low_wild_strawberry_plant' && !getHarvest(aim().block.type), 'Zimą celownik trafia w roślinę bez owoców - nie ma czego zbierać');
    check(getBlockTypeById(world.getBlockId(4, 10, 4)) === 'low_wild_strawberry_fruit' && world.shownBlockId(4, 10, 4) === getBlockId('low_wild_strawberry_plant'), 'Blok w świecie zostaje bez zmian');

    // Przebudowa: zmiana wyglądu owocującego bloku brudzi cały chunk.
    world.updateSeasons(at(0, 0.5));
    buildChunkGeometry(chunk, world).dispose();
    check(Number.isFinite(chunk.seasonTerrainNext) && chunk.seasonTerrainNext > at(0, 0.5) && chunk.seasonTerrainNext < at(2, 0), 'Chunk wie, kiedy poziomka przestanie owocować');
    world.dirtyChunks.clear();
    world.updateSeasons(chunk.seasonTerrainNext - 0.05);
    check(!world.dirtyChunks.has(chunk), 'Przed terminem nic się nie przebudowuje');
    world.updateSeasons(chunk.seasonTerrainNext + 0.02);
    check(world.dirtyChunks.has(chunk) && chunk.seasonTerrainNext === undefined, 'W terminie przebudowuje się cały chunk (płyta jest w geometrii terenu)');
    // Chunk bez owocujących bloków nie ma terminu.
    const empty = new Chunk(1, 0);
    empty.skyLight.fill(15);
    world.chunks.set('1,0', empty);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) empty.setId(x, 9, z, getBlockId('dirt'));
    buildChunkGeometry(empty, world).dispose();
    check(empty.seasonTerrainNext === Infinity, 'Chunk bez owoców nie przebudowuje się z porami');
}


// --- Suszenie ------------------------------------------------------------------------------------

{
    check(D.DRYABLE_FRUITS.length >= 18 && D.DRYABLE_FRUITS.every((type) => itemExists(type) && getFood(type)), `Owoce do suszenia: ${D.DRYABLE_FRUITS.length}`);
    for (const type of D.DRYABLE_FRUITS) check(D.driesInto(type) === D.DRIED_FRUIT && itemUses(type).some((text) => text.includes('suszenie')), `${type} -> suszone owoce`);
    for (const type of ['hazelnut', 'acorn', 'pumpkin_slice', 'zucchini', 'chili_pepper', 'rose_petals', 'elderflower', 'roasted_apple', 'dish_compote', 'dried_fruit', 'stone', null, 'toString']) {
        check(D.driesInto(type) === null, `${type}: nie suszy się na owoce`);
    }
    for (const [wet, dry] of Object.entries(DRYING)) check(D.driesInto(wet) === dry, `${wet}: glina schnie jak dotąd`);
    const dried = getFood('dried_fruit');
    const best = Math.max(...D.DRYABLE_FRUITS.map((type) => getFood(type).fullness));
    check(dried.kind === 'snack' && dried.fullness >= 80 && dried.energy >= 8 && dried.energy < 18, 'Suszone owoce: syta przekąska, nie posiłek');
    check(ITEM_TYPES.dried_fruit.label === 'Suszone owoce' && manifest.tiles.dried_fruit, 'Przedmiot z ikonką');
    check(isIngredient('dried_fruit') && dishFor(['dried_fruit', 'dried_fruit']) === 'compote' && dishFor(['dried_fruit', 'hazelnut', 'acorn']) === 'nut_soup', 'Susz nadaje się do garnka (kompot zimą)');
    check(best <= 110, 'Świeże owoce bez zmian');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.dried_fruit.on === 'dried' && byId.dried_fruit.when({ type: 'dried_fruit' }) && !byId.dried_fruit.when({ type: 'clay_cup' }) && itemExists(byId.dried_fruit.icon), 'Osiągnięcie za susz');
}

console.log(`OK: owocowanie w porach roku - ${checks} sprawdzeń (kalendarz, wygląd przez rok, zima, wzrost, celowanie i zbiór, przebudowa chunków, suszenie).`);
