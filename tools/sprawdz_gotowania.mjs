// ------------------------------------------------------------
// SPRAWDZENIE GOTOWANIA W GARNKU (1.20.0)
//
// - przedmioty, ikonki, przepisy (garnek i miska z każdej gliny, bez
//   kolizji z terakotą i kubkiem), suszenie,
// - potrawy: co wychodzi z jakich składników, wartości (lepsze od
//   pieczonego), miska wraca po zjedzeniu,
// - stan garnka: składniki, gotowanie tylko nad płonącym ogniem,
//   porcje, zdejmowanie, zapis i odczyt, przespany czas,
// - prawdziwe Campfires: stawianie, wrzucanie, nabieranie miską,
//   zdejmowanie pustą ręką, pełny ekwipunek, pieczenie zablokowane,
// - nabieranie wody garnkiem (GameInteraction.fillPot),
// - osiągnięcia, dźwięki, zastosowania.
//
// Uruchomienie: node tools/sprawdz_gotowania.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/CampfireRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class CampfireRenderer { constructor() {} update() {} dispose() {} }'
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const C = await import('../src/items/cooking.js');
const { POT, POT_WATER, WET_POT, BOWL, WET_BOWL, DISHES, DISH_NAMES, COOK_SECONDS, POT_CAPACITY, dishFor, dishItem, isIngredient, ingredientKind } = C;
const P = await import('../src/game/CookingState.js');
const S = await import('../src/game/CampfireState.js');
const { Campfires } = await import('../src/game/Campfires.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { FOODS, ROASTS, getFood } = await import('../src/items/foods.js');
const { ITEM_TYPES, itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { driesInto } = await import('../src/items/clay.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { itemUses } = await import('../src/items/uses.js');
const { MEAL_ENERGY } = await import('../src/game/Wellbeing.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const root = new URL('../', import.meta.url);
const manifest = textureManifest();


// --- Przedmioty i przepisy --------------------------------------------------------

{
    for (const type of [POT, POT_WATER, WET_POT, BOWL, WET_BOWL, ...DISH_NAMES.map(dishItem)]) {
        check(itemExists(type) && ITEM_TYPES[type].label && manifest.tiles[ITEM_TYPES[type].icon], `${type}: przedmiot z ikonką`);
        check(itemUses(type).length > 0, `${type}: ma zastosowanie`);
    }
    check(driesInto(WET_POT) === POT && driesInto(WET_BOWL) === BOWL && driesInto(POT) === null, 'Mokry garnek i miska schną na słońcu');

    const craft = (cells) => findRecipe(cells)?.result ?? null;
    for (const clay of ['clay', 'red_clay', 'white_clay']) {
        equal(craft([clay, clay, clay, 'stick']), [WET_POT, 1], `${clay}: trzy gliny i patyk - mokry garnek`);
        equal(craft(['stick', clay, clay, clay]), [WET_POT, 1], `${clay}: w dowolnym układzie`);
        equal(craft([clay, clay, clay, null]), [WET_BOWL, 2], `${clay}: trzy gliny - dwie mokre miski`);
        equal(craft([clay, clay, null, null])?.[0], `wet_${clay}_cup`, `${clay}: dwie gliny - dalej kubki`);
        equal(craft([clay, null, null, null])?.[0], `wet_${clay}_brick`, `${clay}: jedna glina - dalej cegły`);
    }
    equal(craft(['clay', 'clay', 'clay', 'clay']), ['terracotta', 4], 'Cztery gliny - dalej terakota');
}


// --- Potrawy ------------------------------------------------------------------------

{
    equal(DISH_NAMES, ['vegetable_stew', 'pumpkin_soup', 'zucchini_stew', 'nut_soup', 'compote', 'mixed_stew'], 'Sześć potraw');
    const cases = [
        [['pumpkin_slice', 'zucchini'], 'vegetable_stew'], [['zucchini', 'acorn', 'pumpkin_slice'], 'vegetable_stew'],
        [['pumpkin_slice', 'pumpkin_slice'], 'pumpkin_soup'], [['pumpkin_slice', 'raspberry', 'pumpkin_slice'], 'pumpkin_soup'],
        [['zucchini', 'zucchini'], 'zucchini_stew'], [['zucchini', 'zucchini', 'hazelnut'], 'zucchini_stew'],
        [['hazelnut', 'acorn'], 'nut_soup'], [['beechnuts', 'pumpkin_seeds', 'raspberry'], 'nut_soup'],
        [['raspberry', 'blueberry'], 'compote'], [['cranberry', 'jablon_jablko', 'elderberry'], 'compote'],
        [['raspberry', 'hazelnut'], 'mixed_stew'], [['pumpkin_slice', 'raspberry'], 'mixed_stew'], [['chili_pepper', 'olive_oliwki'], 'mixed_stew']
    ];
    for (const [items, dish] of cases) equal(dishFor(items), dish, `${items.join(' + ')} -> ${dish}`);
    check(dishFor(['raspberry']) === null && dishFor([]) === null && dishFor(['raspberry', 'stone']) === null && dishFor(['raspberry', 'roasted_apple']) === null, 'Jeden składnik albo coś niejadalnego - nic');
    check(DISH_NAMES.at(-1) === 'mixed_stew' && DISHES.mixed_stew.match() === true, 'Polewka wychodzi z czegokolwiek');

    // Każdy surowy przysmak nadaje się do garnka; gotowe jedzenie - nie.
    for (const [type, food] of Object.entries(FOODS)) {
        const raw = food.kind === 'snack' && !food.returns;
        check(isIngredient(type) === raw, `${type}: ${raw ? 'składnik' : 'nie do garnka'}`);
    }
    check(ingredientKind('pumpkin_slice') === 'vegetable' && ingredientKind('hazelnut') === 'nut' && ingredientKind('raspberry') === 'fruit' &&
        ingredientKind('chili_pepper') === 'savory' && ingredientKind('stone') === null && ingredientKind(null) === null && ingredientKind('toString') === null, 'Rodzaje składników');

    const bestRoast = Math.max(...Object.values(ROASTS).map((type) => getFood(type)).filter((food) => food.kind === 'meal').map((food) => food.energy));
    for (const dish of DISH_NAMES) {
        const food = getFood(dishItem(dish)), data = DISHES[dish];
        check(food.kind === 'meal' && food.returns === BOWL && food.energy === data.energy && food.energy >= MEAL_ENERGY, `${dish}: posiłek z miski, miska wraca`);
        check(food.energy > bestRoast && food.fullness > 180, `${dish}: lepsze od pieczonego (${food.energy} > ${bestRoast})`);
        check(data.label && data.hint && Number.isInteger(data.color), `${dish}: nazwa, podpowiedź, kolor`);
    }
    check(DISHES.mixed_stew.energy < DISHES.pumpkin_soup.energy && DISHES.compote.energy < DISHES.vegetable_stew.energy, 'Przemyślana potrawa daje więcej niż polewka z byle czego');
    // Trzy kawałki dyni: surowe 24, pieczone 60, zupa 102.
    check(3 * DISHES.pumpkin_soup.energy > 3 * getFood('roasted_pumpkin_slice').energy, 'Gotowanie opłaca się bardziej niż pieczenie');
}


// --- Stan garnka ----------------------------------------------------------------------

const burning = (logs = 6) => {
    const fire = S.newCampfire(4, 10, 4);
    for (let i = 0; i < logs; i++) S.addFirewood(fire, 'oak');
    fire.phase = 'burning';
    return fire;
};

{
    check(S.newCampfire(0, 0, 0).pot === null, 'Nowe ognisko bez garnka');
    const fire = burning();
    fire.pot = P.newPot();
    check(!P.isCooking(fire.pot) && S.updateCampfire(fire, 10) === null && fire.pot.progress === 0, 'Sama woda się nie gotuje');
    check(P.addIngredient(fire.pot, 'pumpkin_slice') && !P.isCooking(fire.pot), 'Jeden składnik to za mało');
    check(!P.addIngredient(fire.pot, 'stone') && !P.addIngredient(fire.pot, 'roasted_apple'), 'Kamienia ani pieczonego się nie wrzuci');
    check(P.addIngredient(fire.pot, 'pumpkin_slice') && P.isCooking(fire.pot), 'Dwa składniki - gotuje się');
    check(S.updateCampfire(fire, COOK_SECONDS / 2) === null && Math.abs(fire.pot.progress - 0.5) < 1e-9, 'Połowa czasu - połowa');
    check(P.addIngredient(fire.pot, 'acorn') && fire.pot.progress === 0, 'Dorzucony składnik - gotowanie od nowa');
    check(!P.addIngredient(fire.pot, 'acorn') && fire.pot.items.length === POT_CAPACITY, 'Garnek mieści trzy składniki');
    check(S.updateCampfire(fire, COOK_SECONDS - 1) === null, 'Jeszcze chwila');
    check(S.updateCampfire(fire, 1.01) === 'pumpkin_soup', 'Ugotowane: zupa dyniowa');
    equal([fire.pot.dish, fire.pot.portions, fire.pot.items.length], ['pumpkin_soup', 3, 0], 'Trzy składniki - trzy porcje');
    check(S.updateCampfire(fire, 100) === null && fire.pot.portions === 3, 'Gotowa potrawa czeka');
    check(!P.canAddIngredient(fire.pot, 'acorn'), 'Do gotowej potrawy nic się nie dorzuca');

    // Zapis i odczyt.
    const saved = S.restoreCampfire(structuredClone(fire));
    equal(saved.pot, { items: [], progress: 1, dish: 'pumpkin_soup', portions: 3, empty: false }, 'Garnek z potrawą wraca z zapisu');
    equal(S.restoreCampfire({ ...structuredClone(fire), pot: { items: ['raspberry', 'stone', 'acorn', 'acorn', 'acorn', 'acorn'], progress: 7 } }).pot.items, ['raspberry', 'acorn', 'acorn'], 'Zły zapis: tylko poprawne składniki, najwyżej trzy');
    check(S.restoreCampfire({ ...structuredClone(fire), pot: { dish: 'zupa z gwoździa', portions: 2 } }).pot.dish === null, 'Zły zapis: nieznana potrawa znika');
    check(S.restoreCampfire({ ...structuredClone(fire), pot: 'garnek' }).pot === null && S.restoreCampfire({ ...structuredClone(fire), pot: undefined }).pot === null, 'Zły zapis: brak garnka');

    // Porcje.
    check(P.takePortion(fire.pot) === 'pumpkin_soup' && fire.pot.portions === 2 && !fire.pot.empty, 'Pierwsza porcja');
    P.takePortion(fire.pot);
    check(P.takePortion(fire.pot) === 'pumpkin_soup' && fire.pot.empty && fire.pot.dish === null, 'Ostatnia porcja - garnek pusty');
    check(P.takePortion(fire.pot) === null && !P.canAddIngredient(fire.pot, 'acorn'), 'Z pustego się nie nabierze i nic się nie wrzuci');
    equal(P.potDrops(fire.pot), [{ type: POT, count: 1 }], 'Pusty garnek wraca bez wody');

    // Co wraca przy zdejmowaniu.
    const fresh = P.newPot();
    equal(P.potDrops(fresh), [{ type: POT_WATER, count: 1 }], 'Nietknięty garnek wraca z wodą');
    P.addIngredient(fresh, 'acorn'); P.addIngredient(fresh, 'acorn'); P.addIngredient(fresh, 'raspberry');
    equal(P.potDrops(fresh), [{ type: POT_WATER, count: 1 }, { type: 'acorn', count: 2 }, { type: 'raspberry', count: 1 }], 'Surowe składniki wracają');
    equal(P.potDrops(null), [], 'Bez garnka nic');

    // Bez ognia się nie gotuje; gasnący ogień przerywa.
    const cold = S.newCampfire(0, 10, 0);
    cold.pot = P.newPot(); P.addIngredient(cold.pot, 'acorn'); P.addIngredient(cold.pot, 'acorn');
    check(S.updateCampfire(cold, 500) === null && cold.pot.progress === 0, 'Na zimnym ognisku nic się nie ugotuje');
    const weak = burning(1);
    weak.logs[0].burn = 1 - 10 / S.CAMPFIRE_LOG_SECONDS;
    weak.pot = P.newPot(); P.addIngredient(weak.pot, 'acorn'); P.addIngredient(weak.pot, 'acorn');
    check(S.updateCampfire(weak, 500) === null && Math.abs(weak.pot.progress - 10 / COOK_SECONDS) < 1e-6 && weak.phase === 'unlit', 'Ogień zgasł po 10 s - garnek ugotował się tylko przez 10 s');
    equal(S.campfireDrops(weak).filter((drop) => drop.type !== POT_WATER), [{ type: 'acorn', count: 2 }], 'Rozebrane ognisko oddaje garnek i składniki');
    check(S.campfireDrops(weak).some((drop) => drop.type === POT_WATER), 'Garnek też');

    // Przespana noc: ognisko pali się 8 minut, potrawa zdąży.
    const night = burning();
    night.pot = P.newPot(); P.addIngredient(night.pot, 'zucchini'); P.addIngredient(night.pot, 'pumpkin_slice');
    check(S.updateCampfire(night, 3600) === 'vegetable_stew' && night.pot.portions === 2, 'Przespany czas: potrawa gotowa rano');

    // Opisy.
    const label = (type) => type;
    const d = P.newPot();
    check(/Wrzuć/.test(P.potDescription(d, true, label)), 'Opis: pusty garnek z wodą');
    P.addIngredient(d, 'acorn');
    check(/Dorzuć/.test(P.potDescription(d, true, label)), 'Opis: jeden składnik');
    P.addIngredient(d, 'hazelnut');
    check(/Rozpal/.test(P.potDescription(d, false, label)) && /Polewka orzechowa/.test(P.potDescription(d, false, label)), 'Opis: czeka na ogień, zapowiada potrawę');
    check(/Gotuje się: Polewka orzechowa - 0%/.test(P.potDescription(d, true, label)), 'Opis: gotuje się');
    P.cookPot(d, COOK_SECONDS);
    check(/2 porcje/.test(P.potDescription(d, true, label)) && /miską/.test(P.potDescription(d, true, label)), 'Opis: gotowe');
}


// --- Prawdziwe Campfires -----------------------------------------------------------------

{
    const campfire = getBlockId('campfire');
    const setup = (items, { mode = 'adventure', phase = 'burning' } = {}) => {
        const notices = [], sounds = [], achieved = [];
        const inventory = Inventory.load({}, mode);
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        items.forEach((item, i) => inventory.set(i, item));
        inventory.selected = 0;
        const game = { mode, inventory, sounds: { play: (name) => sounds.push(name) }, swings: 0, swingArm() { this.swings++; },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
            playBlockSound: (kind, type) => sounds.push(`${kind}:${type}`), player: { pos: { x: 5, y: 10, z: 5 } },
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId: () => campfire },
            get selectedBlock() { return inventory.selectedItem?.type ?? null; },
            currentHit: { hit: true, block: { x: 4, y: 10, z: 4, type: 'campfire' } } };
        const fires = new Campfires(game, []);
        const fire = burning();
        fire.phase = phase;
        fires.fires.set('4,10,4', fire);
        const click = (slot) => { inventory.selected = slot; return fires.interact(game.currentHit, game.selectedBlock); };
        const count = (type) => inventory.count(type);
        return { game, fires, fire, inventory, notices, sounds, achieved, click, count };
    };

    // Cały obieg: garnek, składniki, gotowanie, miski, zdjęcie.
    const t = setup([{ type: POT_WATER, count: 1 }, { type: 'pumpkin_slice', count: 2 }, { type: 'zucchini', count: 2 }, { type: BOWL, count: 3 }, null, { type: POT, count: 1 }]);
    check(t.click(5) && t.fire.pot === null && /nabierz wody/.test(t.notices.at(-1)), 'Pusty garnek: najpierw woda');
    check(t.click(0) && t.fire.pot && t.count(POT_WATER) === 0, 'Garnek z wodą staje na ognisku');
    check(t.click(1) && t.click(2) && t.click(1) && t.count('pumpkin_slice') === 0 && t.count('zucchini') === 1, 'Trzy składniki znikają z ekwipunku');
    equal(t.fire.pot.items, ['pumpkin_slice', 'zucchini', 'pumpkin_slice'], 'Są w garnku');
    check(t.click(2) && t.count('zucchini') === 1 && /pełny/.test(t.notices.at(-1)), 'Czwarty się nie mieści');
    check(t.click(3) && t.count(BOWL) === 3 && /nie ma czego/.test(t.notices.at(-1)), 'Miską jeszcze nie ma czego nabrać');
    for (let s = 0; s < COOK_SECONDS + 1; s += 0.5) t.fires.update(0.5, false);
    check(t.fire.pot.dish === 'vegetable_stew' && t.achieved.some(([name, data]) => name === 'cooked' && data.dish === 'vegetable_stew'), 'Ugotowane - zdarzenie dla osiągnięć');
    check(t.notices.some((text) => /Gotowe: Gulasz warzywny/.test(text)) && t.sounds.includes('pot_ready') && t.sounds.includes('pot_boil'), 'Napis, bulgotanie i sygnał');
    t.inventory.selected = 4;
    check(t.fires.interact(t.game.currentHit, null) && t.fire.pot && /nabierz glinianą miską/.test(t.notices.at(-1)), 'Garnka z potrawą nie da się zdjąć');
    check(t.click(3) && t.count(BOWL) === 2 && t.count('dish_vegetable_stew') === 1 && t.fire.pot.portions === 2, 'Miska nabiera porcję');
    t.click(3); t.click(3);
    check(t.count(BOWL) === 0 && t.count('dish_vegetable_stew') === 3 && t.fire.pot.empty && t.achieved.filter(([name]) => name === 'served').length === 3, 'Trzy porcje - trzy miski');
    t.inventory.selected = 4;
    check(t.fires.interact(t.game.currentHit, null) && t.fire.pot === null && t.count(POT) === 2, 'Pusta ręka zdejmuje pusty garnek');

    // Zdejmowanie garnka z surowymi składnikami.
    const u = setup([{ type: POT_WATER, count: 1 }, { type: 'acorn', count: 2 }, null]);
    u.click(0); u.click(1); u.click(1);
    u.inventory.selected = 2;
    check(u.fires.interact(u.game.currentHit, null) && u.fire.pot === null && u.count(POT_WATER) === 1 && u.count('acorn') === 2, 'Zdjęty garnek oddaje wodę i surowe składniki');

    // Pełny ekwipunek: nic nie ginie.
    const full = setup([{ type: POT_WATER, count: 1 }, { type: 'acorn', count: 2 }]);
    full.click(0); full.click(1); full.click(1);
    for (let i = 0; i < full.inventory.slots.length; i++) full.inventory.set(i, { type: 'stone', count: 64 });
    full.inventory.set(0, null); full.inventory.selected = 0;
    check(full.fires.interact(full.game.currentHit, null) && full.fire.pot && /pełny/.test(full.notices.at(-1)), 'Pełny ekwipunek: garnek zostaje na ognisku');

    // Miska przy pełnym ekwipunku: ostatnia miska zamienia się w potrawę.
    const last = setup([{ type: BOWL, count: 1 }]);
    last.fire.pot = { ...P.newPot(), dish: 'compote', portions: 1, progress: 1 };
    for (let i = 1; i < last.inventory.slots.length; i++) last.inventory.set(i, { type: 'stone', count: 64 });
    check(last.click(0) && last.count('dish_compote') === 1 && last.count(BOWL) === 0, 'Ostatnia miska przy pełnym ekwipunku: potrawa trafia w jej miejsce');
    const stack = setup([{ type: BOWL, count: 2 }]);
    stack.fire.pot = { ...P.newPot(), dish: 'compote', portions: 1, progress: 1 };
    for (let i = 1; i < stack.inventory.slots.length; i++) stack.inventory.set(i, { type: 'stone', count: 64 });
    check(stack.click(0) && stack.count('dish_compote') === 0 && stack.count(BOWL) === 2 && stack.fire.pot.portions === 1, 'Dwie miski i brak miejsca: porcja zostaje w garnku');

    // Garnek zajmuje ognisko: pieczenie i parzenie czekają.
    const roast = setup([{ type: POT_WATER, count: 1 }, { type: 'jablon_jablko', count: 2 }, { type: 'brew_calm', count: 1 }]);
    roast.click(0);
    roast.inventory.selected = 1;
    for (let s = 0; s < 8; s += 0.1) roast.fires.updateRoast(0.1, true, roast.game.currentHit);
    check(roast.count('roasted_apple') === 0 && roast.fires.roast === null, 'Z garnkiem na ogniu nic się nie piecze');
    check(roast.click(2) && /zdejmij go pustą ręką/.test(roast.notices.at(-1)) && roast.count('brew_calm') === 1, 'Napar: najpierw zdejmij garnek');
    check(roast.click(1) && roast.fire.pot.items.join() === 'jablon_jablko', 'Jabłko z garnkiem na ogniu trafia do garnka');

    // Dwa garnki, garnek na zimnym ognisku, opał dalej działa.
    const two = setup([{ type: POT_WATER, count: 2 }, { type: 'oak_firewood', count: 1 }], { phase: 'unlit' });
    check(two.click(0) && two.click(0) && two.count(POT_WATER) === 1 && /już stoi/.test(two.notices.at(-1)), 'Na ognisku mieści się jeden garnek');
    two.fire.logs.pop();
    check(two.click(1) && two.fire.logs.length === 6 && two.count('oak_firewood') === 0, 'Opał dokłada się mimo garnka');

    // Tryb kreatywny nic nie zużywa.
    const creative = setup([{ type: POT_WATER, count: 1 }, { type: 'acorn', count: 1 }], { mode: 'creative' });
    creative.click(0); creative.click(1); creative.click(1);
    check(creative.count(POT_WATER) === 1 && creative.count('acorn') === 1 && creative.fire.pot.items.length === 2, 'Kreatywny: nic nie ubywa');
}


// --- Nabieranie wody -----------------------------------------------------------------------

{
    const source = readFileSync(new URL('src/game/GameInteraction.js', root), 'utf8');
    check(/this\.selectedBlock === POT && this\.fillPot\(\)/.test(source) && /castFromCamera\(this\.camera, true\)/.test(source), 'PPM pustym garnkiem: promień trafia też w wodę');
    const { Game } = { Game: null };
    void Game;
    // fillPot na atrapie gry.
    const body = source.slice(source.indexOf('    fillPot() {'), source.indexOf('    breakDrops(type'));
    const fillPot = new Function('POT', 'POT_WATER', 'isLiquidId', 'getBlockId', `return function ${body.trim().replace(/^fillPot\(\)/, 'fillPot()')}`)(POT, POT_WATER, (id) => id === 7, (type) => (type === 'water' ? 7 : 1));
    const make = (hitType, item) => {
        const inventory = Inventory.load({}, 'adventure');
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        inventory.set(0, item); inventory.selected = 0;
        const notices = [];
        return { inventory, notices, raycast: { castFromCamera: () => (hitType ? { hit: true, block: { type: hitType } } : { hit: false }) }, camera: {},
            sounds: { play() {} }, swingArm() {}, onNotice: (text) => notices.push(text), achieve() {} };
    };
    let game = make('water', { type: POT, count: 1 });
    check(fillPot.call(game) === true && game.inventory.get(0).type === POT_WATER && game.inventory.count(POT) === 0, 'Woda pod celownikiem: garnek z wodą w tym samym miejscu');
    game = make('stone', { type: POT, count: 1 });
    check(fillPot.call(game) === false && game.inventory.get(0).type === POT, 'Kamień: nic');
    game = make(null, { type: POT, count: 1 });
    check(fillPot.call(game) === false, 'Pustka: nic');
    game = make('water', { type: POT, count: 3 });
    check(fillPot.call(game) === true && game.inventory.count(POT) === 2 && game.inventory.count(POT_WATER) === 1, 'Ze stosu garnków napełnia się jeden');
}


// --- Osiągnięcia, dźwięki --------------------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.pot_cooked.on === 'cooked' && itemExists(byId.pot_cooked.icon) && itemExists(byId.pot_all_dishes.icon), 'Osiągnięcia gotowania');
    const book = { sets: new Map(), collect(key, item) { const set = this.sets.get(key) ?? new Set(); set.add(item); this.sets.set(key, set); return set.size; } };
    const results = DISH_NAMES.map((dish) => byId.pot_all_dishes.when({ dish }, book));
    check(results.slice(0, -1).every((value) => !value) && results.at(-1) === true && byId.pot_all_dishes.goal.count === DISH_NAMES.length, 'Kuchmistrz: wszystkie potrawy');
    for (const name of ['pot_boil', 'pot_drop', 'pot_serve', 'pot_ready']) {
        check(SOUNDS[name]?.files.length === 2, `${name}: dźwięk`);
        for (const file of SOUNDS[name].files) check(existsSync(new URL(`assets/sounds/${file}`, root)) && readFileSync(new URL(`assets/sounds/${file}`, root)).subarray(0, 4).toString() === 'OggS', `${file} istnieje`);
    }
    check(getItemLabel(dishItem('pumpkin_soup')) === 'Zupa dyniowa' && itemUses('raspberry').includes('składnik do garnka') && !itemUses('roasted_apple').includes('składnik do garnka'), 'Nazwy i zastosowania');
}

console.log(`OK: gotowanie w garnku - ${checks} sprawdzeń (przedmioty i przepisy, potrawy, stan garnka, ognisko, miski, woda, osiągnięcia).`);
