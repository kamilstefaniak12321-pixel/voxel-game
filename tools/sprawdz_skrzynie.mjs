// ------------------------------------------------------------
// SPRAWDZENIE SKRZYŃ (0.81.0)
//
// - zawartość 4 x 3 x 2: z wierzchu się bierze, inny przedmiot kładzie
//   się na wierzch, ten sam dokłada, pełny wierzch - zamiana,
// - szybkie wkładanie, zapis i odczyt (z uszkodzonym zapisem),
// - blok: cztery kierunki, przód do gracza, przepis z 4 desek,
// - model: przegródki trafiają w siebie, wymiary, ikonka przodem.
//
// - 0.89.0: skrzynie z każdego rodzaju desek (numery, przepisy, tekstury).
//
// Uruchomienie: node tools/sprawdz_skrzynie.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        // The real click handler needs no DOM or renderer. Stub only unused
        // rendering dependencies; inventory and chest logic stay real.
        if (url.endsWith('/rendering/ModelMaterial.js')) return { format: 'module', shortCircuit: true,
            source: 'export const modelLight={}; export const setModelPreviewRenderer=()=>{};' };
        if (url.endsWith('/ui/ChestView.js')) return { format: 'module', shortCircuit: true,
            source: 'export class ChestView {} export const CHEST_VIEW_WIDTH=1,CHEST_VIEW_HEIGHT=1;' };
        if (url.endsWith('/sky/skyShader.js')) return { format: 'module', shortCircuit: true,
            source: 'export const skyUniforms={};' };
        return next(url, url.endsWith('.js') && url.includes('/src/') ? { ...context, format: 'module' } : context);
    }
});

const S = await import('../src/game/ChestState.js');
const { Inventory, SLOT_COUNT } = await import('../src/game/Inventory.js');
const { InventoryScreen } = await import('../src/ui/InventoryScreen.js');
const { CHEST_BLOCKS, CHEST_KINDS, WOOD_CHESTS, chestFacingForYaw, isChestId, isChestType, chestTexture, chestPlanks, CHEST_FACINGS } = await import('../src/blocks/chest.js');
const { getBlockId, getBlockDefinition, isSolidId } = await import('../src/blocks/BlockRegistry.js');
const { chestCellCenter, chestCellAt, CHEST_FACES, getChestFaces, CHEST_BOUNDS } = await import('../src/rendering/ChestGeometry.js');
const { getRecipe, findRecipe } = await import('../src/crafting/Crafting.js');
const { WORLD_ATLAS_TILES: ATLAS_TILES } = await import('../src/rendering/TextureSheetData.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const item = (type, count) => ({ type, count });


// --- Warstwy -------------------------------------------------------------

check(S.CHEST_COLUMNS === 4 && S.CHEST_ROWS === 3 && S.CHEST_LAYERS === 2, 'Skrzynia 4 x 3, dwie warstwy');

let chest = S.newChest(1, 20, -3);
check(S.isChestEmpty(chest) && S.chestItemCount(chest) === 0, 'Nowa skrzynia pusta');

let held = S.putIntoCell(chest, 0, item('stone', 10));
check(held === null && chest.layers[0][0].count === 10, 'Pusta przegródka - na spód');

held = S.putIntoCell(chest, 0, item('oak_planks', 5));
check(held === null && chest.layers[1][0].type === 'oak_planks' && chest.layers[0][0].type === 'stone', 'Inny przedmiot - na wierzch');
check(S.visibleItem(chest, 0).type === 'oak_planks' && S.coveredItem(chest, 0).type === 'stone', 'Widać wierzch, pod spodem kamień');

held = S.putIntoCell(chest, 0, item('oak_planks', 3));
check(held === null && chest.layers[1][0].count === 8, 'Ten sam przedmiot - dokłada do wierzchu');

held = S.putIntoCell(chest, 0, item('stick', 4));
check(held.type === 'oak_planks' && held.count === 8 && chest.layers[1][0].type === 'stick', 'Inny na pełnym wierzchu - zamiana z wierzchem');
check(chest.layers[0][0].type === 'stone', 'Spód zostaje');

const one = item('dirt', 5);
held = S.putIntoCell(chest, 0, one, 1);
check(held === one && one.count === 5 && chest.layers[1][0].type === 'stick', 'Jedna sztuka na zajęty wierzch - nic');

let taken = S.takeFromCell(chest, 0);
check(taken.type === 'stick' && taken.count === 4 && !chest.layers[1][0], 'Bierze się z wierzchu');
taken = S.takeFromCell(chest, 0, 4);
check(taken.type === 'stone' && taken.count === 4 && chest.layers[0][0].count === 6, 'Potem ze spodu (część stosu)');

held = S.putIntoCell(chest, 1, item('torch', 1), 1);
check(held === null && chest.layers[0][1].type === 'torch', 'Jedna sztuka na pustą przegródkę');

held = S.putIntoCell(chest, 1, item('torch', 70));
check(chest.layers[0][1].count === 64 && held.count === 7, 'Stos najwyżej 64');


// --- Szybkie wkładanie ----------------------------------------------------

chest = S.newChest(0, 0, 0);
chest.layers[0][3] = item('stone', 60);
let left = S.insertIntoChest(chest, 'stone', 10);
check(left === 0 && chest.layers[0][3].count === 64 && chest.layers[0][0].count === 6, 'Dokłada do takiego samego, reszta na pustą');
left = S.insertIntoChest(chest, 'dirt', 64 * 30);
check(left === 64 * 30 - 64 * 22 && S.chestItemCount(chest) === 24, 'Pełna skrzynia: 24 stosy (12 + 12 na wierzchu)');


// --- Zapis ----------------------------------------------------------------

// Regression: Shift+click into a full inventory must not consume an item.
// Test the real UI handler, both chest layers, partial/full transfers and
// repeated clicks. Conservation includes the inventory and both layers.
for (const layer of [0, 1]) for (const room of [0, 2, 5]) {
    const inventory = Inventory.load({}, 'adventure');
    for (let slot = 0; slot < SLOT_COUNT; slot++) inventory.set(slot, item('stone', 64));
    if (room) inventory.set(0, item('oak_planks', 64 - room));
    const source = S.newChest(0, 20, 0);
    source.layers[0][0] = item(layer ? 'dirt' : 'oak_planks', layer ? 7 : 5);
    if (layer) source.layers[1][0] = item('oak_planks', 5);
    let changes = 0;
    const screen = Object.create(InventoryScreen.prototype);
    Object.assign(screen, { chest: source, cursor: null, game: { inventory, chests: { changed: () => changes++ } } });
    screen.clickChest(0, false, true);
    const remainder = source.layers[layer][0]?.count ?? 0;
    check(remainder === 5 - room, `Shift+klik warstwa ${layer}, miejsce ${room}: zabiera tylko przyjęte`);
    check((inventory.get(0)?.type === 'oak_planks' ? inventory.get(0).count : 0) === (room ? 64 : 0), 'Przedmioty trafiają do ekwipunku');
    check(screen.cursor === null && changes === (room ? 1 : 0), 'Brak zgubionego kursora i zbędnej zmiany zapisu');
    if (room === 0) {
        for (let click = 0; click < 3; click++) screen.clickChest(0, false, true);
        check(source.layers[layer][0].count === 5 && changes === 0, 'Powtórne kliknięcia pełnego ekwipunku niczego nie usuwają');
    }
    if (layer) check(source.layers[0][0].count === 7, 'Przykryty stos pozostaje nietknięty');
    check(JSON.stringify(S.restoreChest(S.chestState(source)).layers) === JSON.stringify(source.layers), 'Stan po transferze przechodzi zapis i odczyt');
}
for (const count of [0, -1, 0.5, NaN, -Infinity]) {
    const source = S.newChest(0, 20, 0);
    source.layers[0][0] = item('oak_planks', 5);
    check(S.takeFromCell(source, 0, count) === null && source.layers[0][0].count === 5, `Niepoprawna/zerowa liczba ${count} nie zmienia skrzyni`);
}

const restored = S.restoreChest(JSON.parse(JSON.stringify(S.chestState(chest))));
check(JSON.stringify(restored.layers) === JSON.stringify(chest.layers), 'Zapis i odczyt bez zmian');
const broken = S.restoreChest({ x: 1, y: 2, z: 3, layers: [[null, { type: 'nope', count: 3 }], [item('stone', 5), item('stone', -1)]] });
check(broken.layers[0][0].type === 'stone' && !broken.layers[1][0] && !broken.layers[0][1] && !broken.layers[1][1], 'Uszkodzony zapis: wierzch bez spodu opada, złe stosy znikają');
check(S.restoreChest({ x: 0.5, y: 0, z: 0 }) === null && S.restoreChest({ x: 0, y: 999, z: 0 }) === null, 'Zła pozycja - pomijana');


// --- Blok -----------------------------------------------------------------

const types = Object.keys(CHEST_BLOCKS);
check(types.length === CHEST_KINDS.length * 4 && types.every((type) => isChestType(type) && isChestId(getBlockId(type))), 'Cztery kierunki każdej skrzyni');
check(CHEST_KINDS.length === 1 + WOOD_CHESTS.length && CHEST_KINDS[0].type === 'chest', 'Dębowa (dawna) i skrzynie z innych desek');
const ids = types.map((type) => getBlockId(type));
check(new Set(ids).size === ids.length, 'Numery bez powtórzeń');
check(['chest', 'chest_east', 'chest_south', 'chest_west'].map((type) => getBlockId(type)).join() === '10095,10096,10097,10098', 'Dębowa skrzynia - stare numery (zapisy światów)');
check(ids.filter((id) => id >= 10200).every((id) => id < 10300) && getBlockId('spruce_chest') === 10200, 'Nowe skrzynie w zakresie 10200-10299');
for (const { type, planks, texture, label } of CHEST_KINDS) {
    const facings = getBlockDefinition(type).facings;
    check(CHEST_FACINGS.every((facing) => facings[facing] && getBlockDefinition(facings[facing]).drops === type && getBlockDefinition(facings[facing]).pick === type), `${type}: każdy kierunek daje tę skrzynię`);
    check(getBlockDefinition(type).inventory !== false && CHEST_FACINGS.slice(1).every((facing) => getBlockDefinition(facings[facing]).inventory === false), `${type}: w ekwipunku jedna`);
    check(CHEST_FACINGS.every((facing) => isSolidId(getBlockId(facings[facing]))), `${type}: stała`);
    check(getBlockId(planks) > 0 && /^Skrzynia|skrzynia$/.test(label), `${type}: z desek ${planks} (${label})`);
    check(ATLAS_TILES[texture]?.w === 2 && ATLAS_TILES[texture]?.h === 2, `${type}: tekstura 32 x 32 w atlasie (${texture})`);
    check(chestTexture(facings.west) === texture && chestPlanks(facings.east) === planks, `${type}: tekstura i deski w każdym kierunku`);
    const recipe = getRecipe(type);
    check(recipe && recipe.result[0] === type && recipe.pattern.join('') === 'PPPP' && recipe.key.P === planks, `${type}: przepis z 4 desek ${planks}`);
    check(findRecipe([planks, planks, planks, planks])?.result[0] === type, `${type}: siatka 2 x 2 tych desek daje tę skrzynię`);
}
check(new Set(CHEST_KINDS.map(({ texture }) => texture)).size === CHEST_KINDS.length, 'Każda skrzynia ma swoją teksturę');
check(findRecipe(['oak_planks', 'spruce_planks', 'oak_planks', 'oak_planks']) === null, 'Mieszane deski - bez skrzyni (z jakiego drewna?)');
check(chestFacingForYaw(0) === 'south' && chestFacingForYaw(Math.PI) === 'north' &&
    chestFacingForYaw(Math.PI / 2) === 'east' && chestFacingForYaw(-Math.PI / 2) === 'west', 'Przodem do gracza');
check(CHEST_FACINGS.every((facing) => getBlockDefinition('chest').facings[facing]), 'Placer zna wszystkie kierunki');

const recipe = getRecipe('chest');
check(recipe && recipe.result[0] === 'chest' && recipe.pattern.join('') === 'PPPP', 'Przepis: 4 deski');


// --- Model ----------------------------------------------------------------

for (let cell = 0; cell < S.CHEST_CELLS; cell++) {
    const center = chestCellCenter(cell);
    check(chestCellAt(center.x, center.z) === cell, `Przegródka ${cell} trafia w siebie`);
}
check(chestCellAt(0.49, 0) === -1 && chestCellAt(0, -0.49) === -1, 'Poza środkiem - żadna przegródka');
check(chestCellCenter(0).x > chestCellCenter(3).x && chestCellCenter(0).z > chestCellCenter(8).z, 'Rząd 0 z tyłu, kolumna 0 z lewej (od przodu)');
check(CHEST_FACES.some((face) => face.part === 'lid') && CHEST_FACES.some((face) => face.part === 'body'), 'Korpus i wieko');
const ys = CHEST_FACES.flatMap((face) => face.vertices.map((v) => v[1]));
check(Math.abs(Math.max(...ys) - CHEST_BOUNDS.max[1]) < 1e-9 && Math.min(...ys) === 0, 'Wysokość 14 pikseli');
check(CHEST_FACES.every((face) => face.uv.every(([u, v]) => u >= 0 && u <= 1 && v >= 0 && v <= 1)), 'UV w kafelku');
const latch = getChestFaces().filter((face) => face.part === 'lid').flatMap((face) => face.vertices);
check(Math.max(...latch.map((v) => v[2])) > 15 / 16, 'Ikonka: zamek z przodu (do patrzącego)');

console.log(`OK: skrzynie - ${checks} sprawdzeń (warstwy, wkładanie, zapis, skrzynie z 20 rodzajów desek, przepisy, model).`);
