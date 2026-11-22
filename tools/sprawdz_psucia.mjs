// ------------------------------------------------------------
// SPRAWDZENIE PSUCIA SIĘ JEDZENIA (1.23.0)
//
// - co się psuje, a co nie (każde jedzenie ma rodzaj albo świadomie
//   się nie psuje), ile dób leży,
// - temperatura: cieplej - szybciej, mróz - prawie wcale; skrzynia
//   i piwniczka wolniej, piwniczka chłodzi latem,
// - świeżość stosu: samo dokłada się tylko do takiej samej, ręcznie -
//   średnia; dzielenie, skrzynia, siatka, zapis, przedmioty na ziemi,
// - plecak: cały stos psuje się naraz i w miejscu (nic nie ginie),
//   potrawa - kompost w misce; opis "zepsuje się za...",
// - skrzynie: wczytana (temperatura z pogody, piwniczka), daleka
//   (temperatura pory roku), gość w grze ze znajomymi nie liczy skrzyń,
// - przespany czas, tempo z komendy,
// - kompost: pole z kompostem (szybszy wzrost, żyzne dla sadu),
//   czarnoziem, opróżnianie miski,
// - opisy, osiągnięcia, ikonki.
//
// Uruchomienie: node tools/sprawdz_psucia.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const S = await import('../src/items/spoilage.js');
const { COMPOST, COMPOST_BOWL, spoilKind, isPerishable, shelfDays, temperatureFactor, spoilFactor, freshLoss, daysLeft, daysText, freshText, spoilsInto, spoilText } = S;
const F = await import('../src/items/freshness.js');
const { SAME_FRESH, freshOf, makeItem, withCount, sameBatch, blend } = F;
const { Spoilage, SPOIL_STEP_DAYS, SEASON_TEMPERATURE } = await import('../src/game/Spoilage.js');
const { FOODS, getFood } = await import('../src/items/foods.js');
const { Inventory, cleanItem, STACK_SIZE } = await import('../src/game/Inventory.js');
const { itemExists, ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const C = await import('../src/game/ChestState.js');
const { newChest } = C;
const { DAY_LENGTH_MINUTES } = await import('../src/config.js');
const { YEAR_DAYS, seasonAt } = await import('../src/sky/Seasons.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { itemUses } = await import('../src/items/uses.js');
const { driesInto } = await import('../src/items/drying.js');
const R = await import('../src/blocks/BlockRegistry.js');
const FE = await import('../src/blocks/fertilizers.js');
const { restoreDrop, dropState, Drops } = await import('../src/game/Drops.js');
const { returnGrid } = await import('../src/crafting/Crafting.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, tolerance, message) => check(Math.abs(a - b) <= tolerance, `${message} (${a} ≈ ${b})`);
const manifest = textureManifest();
const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');


// --- Co się psuje ------------------------------------------------------------------

{
    const keeps = ['dried_fruit', 'hazelnut', 'beechnuts', 'acorn', 'araucaria_nuts', 'pumpkin_seeds', 'coconut_palm_kokos',
        'roasted_hazelnut', 'roasted_beechnuts', 'roasted_acorn', 'tea_calm', 'tea_heal', 'tea_vigor',
        // 1.31.0: nasiona na następny rok.
        'beans', 'peas',
        // 1.41.0: soki z pnia i syrop - napoje, jak napary.
        'birch_sap', 'maple_sap', 'palm_sap', 'baobab_water', 'maple_syrup'];
    for (const type of Object.keys(FOODS)) {
        const kind = spoilKind(type);
        check(keeps.includes(type) ? kind === null : ['soft', 'firm', 'roasted', 'dish'].includes(kind), `${type}: ${keeps.includes(type) ? 'nie psuje się' : 'psuje się'}`);
        check(spoilText(type).length > 5 && itemUses(type).includes(spoilText(type)), `${type}: opis w grze`);
        check(spoilsInto(type) === (kind === 'dish' ? COMPOST_BOWL : COMPOST), `${type}: w co się psuje`);
    }
    check(spoilKind('raspberry') === 'soft' && spoilKind('jablon_jablko') === 'firm' && spoilKind('pumpkin_slice') === 'firm' &&
        spoilKind('roasted_apple') === 'roasted' && spoilKind('dish_pumpkin_soup') === 'dish', 'Rodzaje');
    for (const type of ['stone', 'clay_cup', 'compost', 'compost_bowl', 'pumpkin', null, undefined, 'toString']) check(spoilKind(type) === null && !isPerishable(type) && shelfDays(type) === Infinity && spoilText(type) === '', `${type}: to nie jedzenie`);
    check(shelfDays('dish_compote') < shelfDays('raspberry') && shelfDays('raspberry') < shelfDays('roasted_apple') && shelfDays('roasted_apple') < shelfDays('jablon_jablko'), 'Potrawa < miękki owoc < pieczone < twardy owoc');
    check(shelfDays('raspberry') === 5 && shelfDays('jablon_jablko') === 12 && shelfDays('roasted_apple') === 6 && shelfDays('dish_compote') === 3, 'Ile dób leży - jak w poradniku');
    const guide = read('src/ui/guide.js');
    check(guide.includes('miękkie owoce leżą 5 dni, jabłka i warzywa 12, pieczone 6, a potrawy 3'), 'Poradnik podaje te same liczby');
    // Suszenie daje trwałość: każdy owoc do suszenia się psuje, susz - nie.
    for (const type of Object.keys(FOODS)) if (driesInto(type) === 'dried_fruit') check(isPerishable(type), `${type}: świeży się psuje, suszony nie`);
    check(itemExists(COMPOST) && ITEM_TYPES[COMPOST].label === 'Kompost' && manifest.tiles[ITEM_TYPES[COMPOST].icon] && !getFood(COMPOST), 'Kompost: przedmiot z ikonką, niejadalny');
    check(itemExists(COMPOST_BOWL) && ITEM_TYPES[COMPOST_BOWL].label === 'Kompost w misce' && manifest.tiles[ITEM_TYPES[COMPOST_BOWL].icon] && !getFood(COMPOST_BOWL), 'Kompost w misce: przedmiot z ikonką, niejadalny');
}


// --- Temperatura i miejsce ------------------------------------------------------------

{
    check(temperatureFactor(15) === 1 && temperatureFactor(25) === 2 && temperatureFactor(5) === 0.5, 'Dwa razy szybciej na każde 10°C');
    check(temperatureFactor(0) === S.FROZEN && temperatureFactor(-20) === S.FROZEN && temperatureFactor(60) === 4 && temperatureFactor(NaN) === 1, 'Mróz prawie zatrzymuje psucie; upał ma sufit');
    for (let t = -10; t < 40; t += 1) check(temperatureFactor(t + 1) >= temperatureFactor(t), `Cieplej - nie wolniej (${t}°C)`);
    near(freshLoss('raspberry', 5), 1, 1e-9, 'Maliny: po 5 dobach w plecaku zepsute');
    near(freshLoss('raspberry', 5, 15, 'chest'), 0.5, 1e-9, 'W skrzyni dwa razy wolniej');
    near(freshLoss('raspberry', 5, 15, 'cellar'), S.CHEST * S.CELLAR * temperatureFactor(S.CELLAR_TEMPERATURE), 1e-9, 'Piwniczka: jeszcze wolniej i chłodniej');
    check(freshLoss('raspberry', 1, 30, 'cellar') === freshLoss('raspberry', 1, S.CELLAR_TEMPERATURE, 'cellar') && freshLoss('raspberry', 1, 30, 'chest') > freshLoss('raspberry', 1, 30, 'cellar') * 4, 'Latem piwniczka trzyma chłód');
    check(freshLoss('raspberry', 1, -5, 'cellar') < freshLoss('raspberry', 1, 5, 'cellar'), 'Zimą w piwniczce też jest mróz');
    check(freshLoss('raspberry', 8, -5) < 0.1 && freshLoss('raspberry', 8, 22) > 1, 'Cała zima na mrozie: prawie nic; całe lato w plecaku: po malinach');
    check(freshLoss('dried_fruit', 100, 40) === 0 && freshLoss('raspberry', 0) === 0 && freshLoss('raspberry', -1) === 0, 'Susz i zero czasu: nic');
    check(spoilFactor(15, 'pack') === 1 && spoilFactor(15, 'chest') === S.CHEST && spoilFactor() === 1, 'Mnożnik miejsca');
    near(daysLeft('raspberry', 1), 5, 1e-9, 'Świeże maliny: 5 dób');
    near(daysLeft('raspberry', 0.5, 25), 1.25, 1e-9, 'Pół świeżości w upale: 1,25 doby');
    near(daysLeft('raspberry', 1, 15, 'chest'), 10, 1e-9, 'W skrzyni 10 dób');
    check(daysLeft('stone') === Infinity && daysLeft('raspberry', -1) === 0, 'Brzegi');
    // Zbilansowanie z porami roku (pora trwa 8 dób): jabłka w piwniczce przetrwają jesień i zimę.
    check(daysLeft('jablon_jablko', 1, 10, 'cellar') > 16 && daysLeft('raspberry', 1, 22, 'pack') < 4 && daysLeft('jablon_jablko', 1, -3, 'chest') > 100, 'Latem maliny w plecaku to parę dni, jabłka w piwniczce - dwie pory roku, na mrozie - bez końca');
    check(daysText(5) === 'ok. 5 dni' && daysText(1.6) === 'ok. 2 dni' && daysText(1) === 'ok. 1 dzień' && daysText(0.5) === 'ok. 12 godzin' && daysText(3 / 24) === 'ok. 3 godziny' &&
        daysText(1 / 24) === 'ok. 1 godzinę' && daysText(0.0001) === 'ok. 1 godzinę' && daysText(22 / 24) === 'ok. 22 godziny' && daysText(400) === 'ponad 20 dni' && daysText(Infinity) === 'bardzo długo', 'Czas słowami');
    check(freshText({ type: 'raspberry', count: 3 }) === 'świeże - zepsuje się za ok. 5 dni' && freshText({ type: 'raspberry', count: 3, fresh: 0.5 }) === 'nadal dobre - zepsuje się za ok. 3 dni' &&
        freshText({ type: 'raspberry', count: 3, fresh: 0.1 }, 15, 'chest') === 'zaraz się zepsuje - zepsuje się za ok. 1 dzień' && freshText({ type: 'stone', count: 1 }) === '' && freshText(null) === '', 'Opis stosu');
}


// --- Świeżość stosu ------------------------------------------------------------------------

function emptyInventory(mode = 'adventure') {
    const inventory = Inventory.load({}, mode);
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    return inventory;
}

{
    check(makeItem('raspberry', 3).fresh === 1 && makeItem('raspberry', 3, 0.4).fresh === 0.4 && !('fresh' in makeItem('stone', 3, 0.4)) && makeItem('raspberry', 1, NaN).fresh === 1 &&
        makeItem('raspberry', 1, 7).fresh === 1 && makeItem('raspberry', 1, -2).fresh > 0, 'makeItem: świeżość tylko dla jedzenia, w granicach');
    check(freshOf({ type: 'raspberry', count: 1 }) === 1 && freshOf({ type: 'raspberry', count: 1, fresh: 0.3 }) === 0.3 && freshOf({ type: 'stone', count: 1 }) === undefined && freshOf(null) === undefined, 'freshOf');
    const half = withCount({ type: 'raspberry', count: 10, fresh: 0.25 }, 4);
    check(half.count === 4 && half.fresh === 0.25 && half.type === 'raspberry', 'withCount zachowuje świeżość');
    check(sameBatch({ type: 'raspberry', count: 1, fresh: 0.5 }, 'raspberry', 0.5 + SAME_FRESH / 2) && !sameBatch({ type: 'raspberry', count: 1, fresh: 0.5 }, 'raspberry', 0.65) && SAME_FRESH === 0.1 &&
        !sameBatch({ type: 'raspberry', count: 1, fresh: 0.5 }, 'raspberry') && sameBatch({ type: 'raspberry', count: 1 }, 'raspberry') && sameBatch({ type: 'stone', count: 1 }, 'stone', 0.2) &&
        !sameBatch({ type: 'stone', count: 1 }, 'dirt') && !sameBatch(null, 'stone'), 'sameBatch');
    const mixed = blend({ type: 'raspberry', count: 10, fresh: 1 }, 30, 0.2);
    near(mixed.fresh, 0.4, 1e-9, 'Średnia ważona liczbą sztuk');
    check(mixed.count === 40 && blend({ type: 'stone', count: 1 }, 2).count === 3 && !('fresh' in blend({ type: 'stone', count: 1 }, 2, 0.5)), 'blend: liczba sztuk; kamień bez świeżości');

    // Zapis: świeżość przeżywa, stary zapis jest świeży, śmieci są poprawiane.
    check(cleanItem({ type: 'raspberry', count: 5, fresh: 0.37 }).fresh === 0.37 && cleanItem({ type: 'raspberry', count: 5 }).fresh === 1 && cleanItem({ type: 'raspberry', count: 5, fresh: 'x' }).fresh === 1 &&
        cleanItem({ type: 'raspberry', count: 5, fresh: 99 }).fresh === 1 && !('fresh' in cleanItem({ type: 'stone', count: 5, fresh: 0.3 })), 'cleanItem');
    const saved = Inventory.load({ inventory: { slots: [{ type: 'raspberry', count: 5, fresh: 0.37 }], selected: 0, cursor: { type: 'raspberry', count: 2, fresh: 0.9 } } }, 'adventure');
    check(saved.get(0).fresh === 0.37 && saved.get(0).count === 5 && saved.get(1).fresh === 0.9 && saved.get(1).count === 2 && saved.cursor === null, 'Wczytanie: stos pod kursorem o innej świeżości idzie na puste miejsce');

    // Samo z siebie: tylko do takiej samej świeżości; inne - na puste miejsce.
    const inventory = emptyInventory();
    inventory.set(0, { type: 'raspberry', count: 10, fresh: 0.5 });
    check(inventory.add('raspberry', 4) === 0 && inventory.get(0).count === 10 && inventory.get(1).count === 4 && inventory.get(1).fresh === 1, 'Świeży zbiór nie miesza się ze starszym stosem');
    check(inventory.add('raspberry', 3) === 0 && inventory.get(1).count === 7 && inventory.get(2) === null, 'Świeże do świeżych');
    check(inventory.add('raspberry', 2, 0, inventory.slots.length, 0.51) === 0 && inventory.get(0).count === 12 && Math.abs(inventory.get(0).fresh - 0.5) < 0.01, 'Prawie taka sama świeżość - ten sam stos');
    check(inventory.count('raspberry') === 19 && inventory.room('raspberry') === STACK_SIZE - 7 + 34 * STACK_SIZE && inventory.room('raspberry', 0.5) === STACK_SIZE - 12 + 34 * STACK_SIZE &&
        inventory.room('stone') === 34 * STACK_SIZE, 'Miejsce liczy tylko stosy o tej świeżości');
    for (let i = 2; i < inventory.slots.length; i++) inventory.set(i, { type: 'stone', count: 1 });
    check(!inventory.canAdd('raspberry', 1, 0.2) && inventory.canAdd('raspberry', 1, 0.5) && inventory.canAdd('raspberry', 57) && !inventory.canAdd('raspberry', 58) &&
        inventory.add('raspberry', 5, 0, inventory.slots.length, 0.2) === 5, 'Pełny plecak: inna świeżość się nie zmieści');
    check(inventory.canAddAll([{ type: 'raspberry', count: 57 }]) && !inventory.canAddAll([{ type: 'raspberry', count: 1, fresh: 0.2 }]), 'canAddAll ze świeżością');
    check(inventory.addItem({ type: 'raspberry', count: 1, fresh: 0.5 }) === 0 && inventory.get(0).count === 13, 'addItem');

    // Shift + klik (quickMove) przenosi ze świeżością.
    const quick = emptyInventory();
    quick.set(20, { type: 'raspberry', count: 6, fresh: 0.3 });
    quick.set(0, { type: 'raspberry', count: 6, fresh: 0.9 });
    check(quick.quickMove(20) && quick.get(20) === null && quick.get(0).count === 6 && quick.get(1).count === 6 && quick.get(1).fresh === 0.3, 'quickMove: starsze maliny obok, nie do świeżych');

    // Skrzynia: ręcznie - średnia; Shift - tylko do takiej samej; branie zachowuje.
    const chest = newChest(0, 10, 0);
    let held = C.putIntoCell(chest, 0, { type: 'raspberry', count: 10, fresh: 1 });
    check(held === null && chest.layers[0][0].fresh === 1, 'Do pustej przegródki');
    held = C.putIntoCell(chest, 0, { type: 'raspberry', count: 10, fresh: 0.5 });
    near(chest.layers[0][0].fresh, 0.75, 1e-9, 'Ręcznie stos na stos w skrzyni: średnia');
    check(held === null && chest.layers[0][0].count === 20, 'Stosy połączone');
    check(C.insertIntoChest(chest, 'raspberry', 5, 0.2) === 0 && chest.layers[0][0].count === 20 && chest.layers[0][1].count === 5 && chest.layers[0][1].fresh === 0.2, 'Shift do skrzyni: inna świeżość - osobna przegródka');
    check(C.insertIntoChest(chest, 'raspberry', 5, 0.75) === 0 && chest.layers[0][0].count === 25, 'Taka sama - dokłada');
    const taken = C.takeFromCell(chest, 0, 5);
    check(taken.count === 5 && Math.abs(taken.fresh - 0.75) < 1e-9 && chest.layers[0][0].count === 20, 'Wzięte ze skrzyni mają jej świeżość');
    const state = C.restoreChest(JSON.parse(JSON.stringify(C.chestState(chest))));
    check(Math.abs(state.layers[0][0].fresh - 0.75) < 1e-9 && state.layers[0][1].fresh === 0.2, 'Skrzynia w zapisie trzyma świeżość');
    C.putIntoCell(chest, 2, { type: 'stone', count: 1 });
    const swapped = C.putIntoCell(chest, 2, { type: 'raspberry', count: 3, fresh: 0.4 });
    check(swapped === null && chest.layers[1][2].fresh === 0.4, 'Na wierzch innej rzeczy - ze świeżością');
    const back = C.putIntoCell(chest, 2, { type: 'dirt', count: 1 });
    check(back.type === 'raspberry' && back.fresh === 0.4, 'Zamiana z wierzchem oddaje stos ze świeżością');

    // Siatka wytwarzania wraca do ekwipunku ze świeżością.
    const crafting = emptyInventory();
    crafting.set(0, { type: 'raspberry', count: 3, fresh: 1 });
    crafting.craft[0] = { type: 'raspberry', count: 2, fresh: 0.3 };
    check(returnGrid(crafting) && crafting.get(0).count === 3 && crafting.get(1).count === 2 && crafting.get(1).fresh === 0.3, 'Siatka: starsze maliny wracają osobno');

    // Przedmioty na ziemi.
    const drop = restoreDrop({ type: 'raspberry', count: 3, x: 0, y: 5, z: 0, fresh: 0.42 });
    check(drop.fresh === 0.42 && dropState(drop).fresh === 0.42 && !('fresh' in restoreDrop({ type: 'stone', count: 3, x: 0, y: 5, z: 0, fresh: 0.42 })) &&
        restoreDrop({ type: 'raspberry', count: 3, x: 0, y: 5, z: 0 }).fresh === 1, 'Leżący przedmiot: świeżość w zapisie');
    const picker = emptyInventory();
    picker.set(0, { type: 'raspberry', count: 1, fresh: 1 });
    const world = { isSolid: (x, y) => y < 5, getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId: () => 0 };
    const drops = new Drops({ world, inventory: picker, player: { pos: { x: 0.5, y: 5, z: 0.5 }, yaw: 0, pitch: 0 }, time: { days: 0.5 } });
    const a = drops.spawn('raspberry', 4, { x: 0.5, y: 5, z: 0.5 }, null, 0, 0.3);
    check(a.fresh === 0.3, 'spawn ze świeżością');
    drops.update(0.05);
    check(picker.get(0).count === 1 && picker.get(1)?.count === 4 && picker.get(1).fresh === 0.3 && drops.drops.size === 0, 'Podniesione starsze maliny leżą osobno');
    const b = drops.spawn('raspberry', 2, { x: 30.5, y: 5, z: 0.5 }, null, 9, 1), c = drops.spawn('raspberry', 2, { x: 30.6, y: 5, z: 0.5 }, null, 9, 0.2), d = drops.spawn('raspberry', 2, { x: 30.4, y: 5, z: 0.5 }, null, 9, 1);
    for (const each of [b, c, d]) each.rest = true;
    drops.merge();
    check(drops.drops.size === 2 && b.count === 4 && c.count === 2 && c.fresh === 0.2, 'Na ziemi łączą się tylko stosy o tej samej świeżości');
    check(drops.throwFromPlayer('raspberry', 1, 0.6).fresh === 0.6, 'Wyrzucone zachowuje świeżość');
    picker.selected = 1;
    drops.throwSelected(false);
    check([...drops.drops.values()].at(-1).fresh === 0.3 && picker.get(1).count === 3, 'Wyrzucenie z paska zachowuje świeżość');

    // Okno ekwipunku: wszystkie kopie stosów przez withCount / blend.
    const screen = read('src/ui/InventoryScreen.js');
    check(!/\{ type: (item|held|this\.cursor)\.type, count: /.test(screen), 'InventoryScreen nie kopiuje stosów bez świeżości');
    check(screen.includes('blend(item, moved, held.fresh)') && screen.includes('blend(item, 1, held.fresh)') && screen.includes('withCount(item, half)') &&
        screen.includes("insertIntoChest(this.chest, item.type, item.count, item.fresh") && screen.includes('throwFromPlayer(item.type, thrown, item.fresh'), 'Ręczne łączenie: średnia; połowa stosu, skrzynia i wyrzucanie ze świeżością');
    check(screen.includes('freshNote(hovered)') && screen.includes("this.freshNote(item, this.game.spoilage?.placeOf(this.chest))") && /freshText\(item, spoilage\.temperature\(\), place\)/.test(screen), 'Opis stosu pokazuje, ile jeszcze poleży (ekwipunek i skrzynia)');
    check(read('src/ui/StatusPanel.js').includes('freshText(game.inventory.selectedItem'), 'Okno statusu: świeżość jedzenia w ręce');
}


// --- Plecak --------------------------------------------------------------------------------

function setup(items, { mode = 'adventure', temperature = 15, days = 10 } = {}) {
    const inventory = emptyInventory(mode);
    items.forEach((item, i) => inventory.set(i, item));
    const notices = [], achieved = [];
    const chests = { chests: new Map(), version: 0 };
    const game = { mode, inventory, chests, time: { days }, weather: { temperature }, onNotice: (text) => notices.push(text),
        achieve: (name, data) => achieved.push([name, data]), sounds: { play() {} },
        world: { loaded: true, sky: 15, getChunk() { return this.loaded ? {} : null; }, toChunkCoord: (v) => Math.floor(v / 16), getLight() { return { sky: this.sky }; } } };
    const spoilage = new Spoilage(game);
    return { game, inventory, spoilage, notices, achieved, chests, count: (type) => inventory.count(type) };
}

{
    // Cały stos naraz, w tym samym miejscu, po tylu dobach, ile podaje opis.
    const t = setup([{ type: 'raspberry', count: 64 }, { type: 'raspberry', count: 10, fresh: 0.5 }, { type: 'jablon_jablko', count: 7 }]);
    for (let i = 0; i < 48; i++) t.spoilage.step(SPOIL_STEP_DAYS);
    near(t.inventory.get(0).fresh, 0.6, 1e-6, 'Po 2 dobach maliny mają 60% świeżości');
    near(t.inventory.get(1).fresh, 0.1, 1e-6, 'Starsze - 10%');
    check(t.count('raspberry') === 74 && t.notices.length === 0, 'Nic jeszcze nie ubyło');
    for (let i = 0; i < 24; i++) t.spoilage.step(SPOIL_STEP_DAYS);
    check(t.inventory.get(1).type === COMPOST && t.inventory.get(1).count === 10 && !('fresh' in t.inventory.get(1)) && t.inventory.get(0).type === 'raspberry' && t.inventory.get(0).count === 64, 'Starszy stos zepsuł się cały - kompost w tym samym miejscu');
    check(t.notices.length === 1 && t.notices[0] === 'Zepsuło się: 10 × Maliny' && t.achieved[0][0] === 'spoiled' && t.achieved[0][1].count === 10 && t.spoilage.spoiled === 10, 'Jeden napis o zepsutym stosie');
    for (let i = 0; i < 49; i++) t.spoilage.step(SPOIL_STEP_DAYS);
    check(t.inventory.get(0).type === COMPOST && t.inventory.get(0).count === 64 && t.inventory.get(2).type === 'jablon_jablko' && Math.abs(t.inventory.get(2).fresh - (1 - (72 + 49) / 24 / 12)) < 1e-6, 'Po 5 dobach świeże maliny to kompost, jabłka jeszcze leżą');

    // Susz i orzechy leżą bez końca.
    const dry = setup([{ type: 'dried_fruit', count: 64 }, { type: 'hazelnut', count: 64 }, { type: 'acorn', count: 64 }, { type: 'stone', count: 64 }]);
    dry.spoilage.step(64);
    check(dry.count('dried_fruit') === 64 && dry.count('hazelnut') === 64 && dry.count('acorn') === 64 && dry.count('stone') === 64 && dry.notices.length === 0 && !('fresh' in dry.inventory.get(0)), 'Susz, orzechy i kamienie po 64 dobach bez zmian');

    // Potrawa: kompost w misce, w tym samym miejscu.
    const dish = setup([{ type: 'dish_pumpkin_soup', count: 8 }]);
    dish.spoilage.step(30);
    check(dish.inventory.get(0).type === COMPOST_BOWL && dish.inventory.get(0).count === 8 && dish.count('clay_bowl') === 0 && dish.count(COMPOST) === 0, 'Zepsuta potrawa to kompost w misce');

    // Pełny plecak: nic nie ginie, bo kompost zajmuje miejsce jedzenia.
    const full = setup([{ type: 'raspberry', count: 64 }, { type: 'dish_compote', count: 5 }]);
    for (let i = 2; i < full.inventory.slots.length; i++) full.inventory.set(i, { type: 'stone', count: 64 });
    full.spoilage.step(6);
    check(full.count(COMPOST) === 64 && full.count(COMPOST_BOWL) === 5 && full.count('stone') === 64 * (full.inventory.slots.length - 2), 'Pełny plecak: kompost nie znika');

    // Siatka wytwarzania i stos pod kursorem też się starzeją.
    const hidden = setup([]);
    hidden.inventory.craft[0] = { type: 'raspberry', count: 3 };
    hidden.inventory.cursor = { type: 'raspberry', count: 2 };
    hidden.spoilage.step(1);
    near(hidden.inventory.craft[0].fresh, 0.8, 1e-9, 'Siatka się starzeje');
    near(hidden.inventory.cursor.fresh, 0.8, 1e-9, 'Stos pod kursorem też');
    hidden.spoilage.step(5);
    check(hidden.inventory.craft[0].type === COMPOST && hidden.inventory.cursor.type === COMPOST && hidden.inventory.cursor.count === 2, 'I tam psuje się w miejscu');

    // Mróz i upał.
    const frost = setup([{ type: 'raspberry', count: 64 }], { temperature: -8 });
    frost.spoilage.step(8);
    const heat = setup([{ type: 'raspberry', count: 64 }], { temperature: 28 });
    heat.spoilage.step(3);
    check(frost.count('raspberry') === 64 && frost.inventory.get(0).fresh > 0.9 && heat.count('raspberry') === 0, 'Osiem dób na mrozie: świeże; trzy doby w upale: kompost');

    // Tryb kreatywny i tempo.
    const creative = setup([{ type: 'raspberry', count: 64 }], { mode: 'creative' });
    creative.spoilage.update(100000);
    creative.spoilage.advance(100000);
    check(creative.count('raspberry') === 64 && !(creative.inventory.get(0).fresh < 1), 'Kreatywny: nic się nie psuje');
    const off = setup([{ type: 'raspberry', count: 64 }]);
    off.spoilage.speed = 0;
    off.spoilage.update(100000);
    check(off.count('raspberry') === 64 && !(off.inventory.get(0).fresh < 1), 'Tempo 0: wyłączone');

    // update: krok co godzinę gry; advance: przespana noc.
    const clock = setup([{ type: 'dish_compote', count: 64 }]);
    const hour = DAY_LENGTH_MINUTES * 60 / 24;
    clock.spoilage.update(hour * 0.9);
    check(!(clock.inventory.get(0).fresh < 1) && clock.spoilage.pending > 0, 'Przed pełną godziną nic');
    clock.spoilage.update(hour * 0.2);
    check(clock.spoilage.pending === 0 && clock.inventory.get(0).fresh < 1, 'Po godzinie - przegląd');
    const night = setup([{ type: 'dish_compote', count: 64 }]);
    night.spoilage.advance(DAY_LENGTH_MINUTES * 60 * 1.5);
    near(night.inventory.get(0).fresh, 0.5, 1e-9, 'Przespane półtorej doby: kompot w połowie świeżości');

    // Świeży zbiór po dobie nie miesza się ze stosem z wczoraj.
    const harvest = setup([{ type: 'raspberry', count: 5 }]);
    harvest.spoilage.step(1);
    harvest.inventory.add('raspberry', 3);
    check(harvest.inventory.get(0).count === 5 && harvest.inventory.get(1).count === 3 && harvest.inventory.get(1).fresh === 1, 'Dzisiejszy zbiór osobno od wczorajszego');
}


// --- Skrzynie i przedmioty na ziemi --------------------------------------------------------------

{
    const fill = (t, x = 0) => { const chest = newChest(x, 10, 0); for (let cell = 0; cell < 12; cell++) { chest.layers[0][cell] = { type: 'raspberry', count: 64 }; chest.layers[1][cell] = { type: 'raspberry', count: 64 }; } t.chests.chests.set(`${x},10,0`, chest); return chest; };
    const fresh = (chest) => chest.layers[0][0].type === 'raspberry' ? chest.layers[0][0].fresh ?? 1 : 0;

    const open = setup([]);
    const chest = fill(open);
    open.spoilage.step(5);
    near(fresh(chest), 0.5, 1e-9, 'Skrzynia pod gołym niebem: po 5 dobach połowa świeżości (2 razy wolniej niż plecak)');
    check(open.chests.version === 0 && open.notices.length === 0, 'Sama świeżość nie rozsyła skrzyni; bez napisu');

    const cellar = setup([], { temperature: 22 });
    cellar.game.world.sky = 0;
    const deep = fill(cellar);
    cellar.spoilage.step(5);
    const outside = setup([], { temperature: 22 });
    const sun = fill(outside);
    outside.spoilage.step(5);
    check(fresh(deep) > 0.8 && fresh(sun) < 0.2, `Latem w piwniczce świeżość ${fresh(deep).toFixed(2)}, na słońcu ${fresh(sun).toFixed(2)}`);

    // Cały stos zepsuty: w przegródce leży kompost.
    const rot = setup([], { temperature: 30 });
    const old = fill(rot);
    old.layers[1][3] = { type: 'dish_compote', count: 2 };
    rot.spoilage.step(64);
    check(old.layers.flat().every((item) => (item.type === COMPOST && item.count === 64) || (item.type === COMPOST_BOWL && item.count === 2)) && old.layers[1][3].type === COMPOST_BOWL && rot.chests.version === 1, 'Zepsuty stos w skrzyni to kompost (potrawa - w misce); skrzynia do zapisu');

    // Daleka skrzynia: temperatura pory roku, nie pogody przy graczu.
    let winter = 0;
    while (seasonAt(winter).index !== 3) winter += 0.25;
    const far = setup([], { temperature: 30, days: winter + YEAR_DAYS });
    far.game.world.loaded = false;
    const away = fill(far);
    far.spoilage.step(8);
    check(SEASON_TEMPERATURE.length === 4 && SEASON_TEMPERATURE[3] < 0 && SEASON_TEMPERATURE[1] > SEASON_TEMPERATURE[0] && fresh(away) > 0.9, `Daleka skrzynia zimą: mróz (świeżość ${fresh(away).toFixed(2)})`);

    // Gość w grze ze znajomymi: skrzynie i ziemię liczy gospodarz.
    const guest = setup([{ type: 'raspberry', count: 64 }]);
    guest.game.net = { isClient: true };
    const theirs = fill(guest);
    guest.game.drops = { drops: new Map([['a', { type: 'raspberry', count: 1, x: 0, z: 0 }]]), version: 0 };
    guest.spoilage.step(3);
    check(fresh(theirs) === 1 && guest.inventory.get(0).fresh < 1 && !('fresh' in guest.game.drops.drops.get('a')), 'Gość: własny plecak tak, skrzynie i ziemia nie');
    const host = setup([]);
    host.game.net = { isClient: false };
    const mine = fill(host);
    host.game.drops = { drops: new Map([['a', { type: 'raspberry', count: 4, x: 0, z: 0, fresh: 0.5 }], ['b', { type: 'dish_compote', count: 1, x: 0, z: 0 }], ['c', { type: 'stone', count: 1, x: 0, z: 0 }]]), version: 0 };
    host.spoilage.step(1);
    check(fresh(mine) < 1 && Math.abs(host.game.drops.drops.get('a').fresh - 0.3) < 1e-9 && host.game.drops.version === 0, 'Gospodarz liczy skrzynie i ziemię');
    host.spoilage.step(3);
    check(host.game.drops.drops.get('a').type === COMPOST && host.game.drops.drops.get('a').count === 4 && !('fresh' in host.game.drops.drops.get('a')) && host.game.drops.drops.get('b').type === COMPOST_BOWL &&
        host.game.drops.drops.get('c').type === 'stone' && host.game.drops.version === 2, 'Jedzenie na ziemi też się psuje - w kompost');
}


// --- Kompost: pole, czarnoziem, miska ----------------------------------------------------------------

{
    const { FERTILIZERS, FIELD_BLOCKS, fertilizerOf, isFieldBlock, fieldStats } = FE;
    const field = R.getBlockDefinition('tilled_compost');
    check(field.id === 15400 && field.soil && field.solid && R.getDropType('tilled_compost') === 'dirt' && field.field === 'compost' && manifest.tiles.tilled_compost && manifest.regions.tilled_compost &&
        field.textures.top === 'tilled_compost' && field.textures.side === 'dirt', 'Pole z kompostem: blok 15400, ziemia, własna tekstura z góry');
    check(R.getGrowth('tilled_compost').empty && R.getGrowth('tilled_compost').into === 'dirt' && R.getGrowth('tilled_compost').seconds > R.getGrowth('tilled_dirt').seconds && R.isGrowingId(field.id), 'Puste zarasta - wolniej niż zwykłe pole');
    check(FERTILIZERS.compost.field === 'tilled_compost' && FERTILIZERS.compost.growth > 1 && FERTILIZERS.compost.rich && FIELD_BLOCKS.includes('tilled_dirt') && FIELD_BLOCKS.includes('tilled_compost') && isFieldBlock('tilled_compost') &&
        isFieldBlock(R.FIELD_BLOCK) && !isFieldBlock('dirt') && !isFieldBlock(undefined), 'Tabela nawozów');
    for (const entry of Object.values(FERTILIZERS)) check(R.getBlockDefinition(entry.field)?.soil && itemExists(Object.keys(FE.FERTILIZER_ITEMS).find((item) => FE.FERTILIZER_ITEMS[item].fertilizer === 'compost')), `Nawóz ${entry.label}: jest blok pola i przedmiot`);
    check(fieldStats('tilled_compost').growth === 1.5 && fieldStats('tilled_compost').rich && fieldStats('tilled_dirt').growth === 1 && !fieldStats('tilled_dirt').rich && fieldStats('stone').growth === 1, 'Statystyki pola');
    check(fertilizerOf(COMPOST).fertilizer === 'compost' && fertilizerOf(COMPOST_BOWL).returns === 'clay_bowl' && fertilizerOf('stone') === null && fertilizerOf(null) === null && fertilizerOf('toString') === null, 'Czym się nawozi');

    const source = read('src/game/GameInteraction.js');
    check(/fertilizerOf\(this\.selectedBlock\) && this\.fertilize\(this\.currentHit\)/.test(source), 'PPM nawozem: użyźnianie');
    check(/if \(type === COMPOST_BOWL\) \{\s+this\.emptyBowl\(\);/.test(source), 'Zwykły PPM miską z kompostem ją opróżnia');
    check(/below === FIELD_BLOCK \|\| isFieldBlock\(below\)/.test(source), 'Na polu z kompostem sadzi się jak na zwykłym');
    const body = source.slice(source.indexOf('    fertilize(hit) {'), source.indexOf('    // Pusty gliniany garnek w ręce'));
    const methods = new Function('COMPOSTABLE', 'canFertilize', 'FERTILIZERS', 'fertilizerOf', 'isFieldBlock', 'isPlantId', 'COMPOST', 'COMPOST_BOWL',
        `return class { ${body.replace(/^\s*\/\/.*$/gm, '')} }`)(['grass', 'dirt', 'coarse_dirt', 'forest_floor'], FE.canFertilize, FERTILIZERS, fertilizerOf, isFieldBlock, (id) => id === 77, COMPOST, COMPOST_BOWL).prototype;
    const make = (type, { mode = 'adventure', held = COMPOST, below = null } = {}) => {
        const inventory = emptyInventory(mode);
        inventory.set(0, { type: held, count: 3 }); inventory.selected = 0;
        const set = [], achieved = [], notices = [], thrown = [];
        return { mode, inventory, set, achieved, notices, thrown, get selectedBlock() { return inventory.selectedItem?.type ?? null; },
            world: { setBlock: (x, y, z, block) => { set.push([y, block]); return true; }, getBlockId: (x, y) => (below && y === 9 ? 77 : 1), getBlock: (x, y) => (y === 8 ? below : type) },
            playBlockSound() {}, swingArm() {}, sounds: { play() {} }, drops: { throwFromPlayer: (item, count) => thrown.push([item, count]) },
            fertilize: methods.fertilize, emptyBowl: methods.emptyBowl, giveOrDrop: methods.giveOrDrop,
            achieve: (name, data) => achieved.push([name, data]), onNotice: (text) => notices.push(text), hit: { hit: true, block: { x: 1, y: 9, z: 1, type } } };
    };
    let game = make('tilled_dirt');
    check(game.fertilize(game.hit) === true && game.set.join() === '9,tilled_compost' && game.inventory.count(COMPOST) === 2 && game.achieved[0][0] === 'composted' && game.achieved[0][1].into === 'tilled_compost', 'Kompost na rozgrzebanej ziemi: pole z kompostem');
    for (const type of ['grass', 'dirt', 'coarse_dirt', 'forest_floor']) {
        game = make(type);
        check(game.fertilize(game.hit) === true && game.set.join() === '9,humus' && game.inventory.count(COMPOST) === 2 && game.achieved[0][1].into === 'humus', `${type}: kompost robi czarnoziem`);
    }
    game = make('low_strawberry_plant', { below: 'tilled_dirt' });
    check(game.fertilize(game.hit) === true && game.set.join() === '8,tilled_compost', 'Roślina na polu: kompost trafia pod nią');
    game = make('low_strawberry_plant', { below: 'tilled_compost' });
    check(game.fertilize(game.hit) === true && game.set.length === 0 && game.notices.length === 1 && game.inventory.count(COMPOST) === 3, 'Pole już użyźnione: kompost zostaje');
    game = make('stone');
    check(game.fertilize(game.hit) === false && game.set.length === 0 && game.inventory.count(COMPOST) === 3, 'Kamienia się nie użyźni');
    game = make('humus');
    check(game.fertilize(game.hit) === true && game.set.length === 0 && game.inventory.count(COMPOST) === 3 && game.notices.length === 1, 'Czarnoziem: kompost zostaje w ręce');
    game = make('dirt', { mode: 'creative' });
    check(game.fertilize(game.hit) === true && game.inventory.count(COMPOST) === 3, 'Kreatywny: kompost nie ubywa');
    check(game.fertilize({ hit: false }) === false && game.fertilize(null) === false, 'Bez celu - nic');
    game = make('dirt', { held: 'stone' });
    check(game.fertilize(game.hit) === false && game.set.length === 0, 'Kamień w ręce to nie nawóz');

    // Miska: prosto na pole (miska wraca) albo zwykły PPM (kompost i miska osobno).
    game = make('tilled_dirt', { held: COMPOST_BOWL });
    check(game.fertilize(game.hit) === true && game.set.join() === '9,tilled_compost' && game.inventory.count(COMPOST_BOWL) === 2 && game.inventory.count('clay_bowl') === 1 && game.inventory.count(COMPOST) === 0, 'Miska z kompostem na pole: pole użyźnione, miska wraca');
    game = make('stone', { held: COMPOST_BOWL });
    check(game.fertilize(game.hit) === false && game.emptyBowl() === true && game.inventory.count(COMPOST_BOWL) === 2 && game.inventory.count(COMPOST) === 1 && game.inventory.count('clay_bowl') === 1, 'PPM: jedna miska wysypana - kompost i miska');
    game.emptyBowl(); game.emptyBowl();
    check(game.emptyBowl() === false && game.inventory.count(COMPOST_BOWL) === 0 && game.inventory.count(COMPOST) === 3 && game.inventory.count('clay_bowl') === 3, 'Trzy miski - trzy komposty; pusta ręka nic nie robi');
    game = make('stone', { held: COMPOST_BOWL });
    for (let i = 1; i < game.inventory.slots.length; i++) game.inventory.set(i, { type: 'stone', count: 64 });
    check(game.emptyBowl() === true && game.thrown.length === 2 && game.thrown.map(([item]) => item).sort().join() === 'clay_bowl,compost' && game.inventory.count(COMPOST_BOWL) === 2, 'Pełny plecak: kompost i miska lądują na ziemi, nie znikają');
    game = make('stone', { held: COMPOST_BOWL, mode: 'creative' });
    check(game.emptyBowl() === false, 'Kreatywny: miski się nie opróżnia');

    // Szybszy wzrost na polu z kompostem; sad liczy je jak czarnoziem.
    const growth = read('src/game/PlantGrowth.js');
    check(/season \* \(SOIL_GROWTH_ID\.get\(below\) \?\? 1\)/.test(growth), 'Wzrost: mnożnik ziemi pod rośliną (blocks/soil.js)');
    check(/fertile\.has\(world\.getBlockId\(x, y - 1, z\)\)/.test(read('src/game/Orchard.js')), 'Sad: pole z nawozem jest żyzne');

    const gameSource = read('src/game/Game.js');
    check(/new Spoilage\(this\)/.test(gameSource) && /this\.spoilage\.update\(dt\)/.test(gameSource) && /this\.spoilage\.advance\(seconds\)/.test(gameSource), 'Psucie podłączone do gry i do przespanego czasu');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.composted.on === 'composted' && itemExists(byId.composted.icon), 'Osiągnięcie za kompost');
    check(byId.field_composted.on === 'composted' && byId.field_composted.when({ into: 'tilled_compost' }) && !byId.field_composted.when({ into: 'humus' }) && itemExists(byId.field_composted.icon), 'Osiągnięcie za pole z kompostem');
    check(itemUses(COMPOST).some((text) => text.includes('czarnoziem') && text.includes('pole z kompostem')) && itemUses(COMPOST_BOWL).some((text) => text.includes('oddaje miskę')), 'Kompost i miska: opis zastosowania');
}

console.log(`OK: psucie się jedzenia - ${checks} sprawdzeń (co się psuje, temperatura, świeżość stosów, plecak, skrzynie i piwniczka, ziemia, przespany czas, kompost i pole).`);
