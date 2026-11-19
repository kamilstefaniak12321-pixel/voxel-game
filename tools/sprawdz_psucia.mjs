// ------------------------------------------------------------
// SPRAWDZENIE PSUCIA SIĘ JEDZENIA (1.23.0)
//
// - co się psuje, a co nie (każde jedzenie ma rodzaj albo świadomie
//   się nie psuje), okresy półtrwania,
// - temperatura: cieplej - szybciej, mróz - prawie wcale; skrzynia
//   i piwniczka wolniej, piwniczka chłodzi latem,
// - plecak: rozkład zgodny z półtrwaniem, kompost w zamian, miska
//   z zepsutej potrawy, napis; tryb kreatywny bez psucia,
// - skrzynie: wczytana (temperatura z pogody, piwniczka), daleka
//   (temperatura pory roku), gość w grze ze znajomymi nie liczy skrzyń,
// - przespany czas, tempo z komendy,
// - kompost: czarnoziem z ziemi i trawy,
// - opisy, osiągnięcie, ikonka.
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
const { COMPOST, spoilKind, isPerishable, halfLifeDays, temperatureFactor, spoilChance, spoiledCount, spoilText } = S;
const { Spoilage, SPOIL_STEP_DAYS, SEASON_TEMPERATURE } = await import('../src/game/Spoilage.js');
const { FOODS, getFood } = await import('../src/items/foods.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { itemExists, ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { newChest } = await import('../src/game/ChestState.js');
const { DAY_LENGTH_MINUTES } = await import('../src/config.js');
const { SEASON_DAYS, YEAR_DAYS, seasonAt } = await import('../src/sky/Seasons.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { itemUses } = await import('../src/items/uses.js');
const { driesInto } = await import('../src/items/drying.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, tolerance, message) => check(Math.abs(a - b) <= tolerance, `${message} (${a} ≈ ${b})`);
const manifest = textureManifest();
const root = new URL('../', import.meta.url);


// --- Co się psuje ------------------------------------------------------------------

{
    const keeps = ['dried_fruit', 'hazelnut', 'beechnuts', 'acorn', 'araucaria_nuts', 'pumpkin_seeds', 'coconut_palm_kokos',
        'roasted_hazelnut', 'roasted_beechnuts', 'roasted_acorn', 'tea_calm', 'tea_heal', 'tea_vigor'];
    for (const type of Object.keys(FOODS)) {
        const kind = spoilKind(type);
        check(keeps.includes(type) ? kind === null : ['soft', 'firm', 'roasted', 'dish'].includes(kind), `${type}: ${keeps.includes(type) ? 'nie psuje się' : 'psuje się'}`);
        check(spoilText(type).length > 5 && itemUses(type).includes(spoilText(type)), `${type}: opis w grze`);
    }
    check(spoilKind('raspberry') === 'soft' && spoilKind('jablon_jablko') === 'firm' && spoilKind('pumpkin_slice') === 'firm' &&
        spoilKind('roasted_apple') === 'roasted' && spoilKind('dish_pumpkin_soup') === 'dish', 'Rodzaje');
    for (const type of ['stone', 'clay_cup', 'compost', 'pumpkin', null, undefined, 'toString']) check(spoilKind(type) === null && !isPerishable(type) && halfLifeDays(type) === Infinity && spoilText(type) === '', `${type}: to nie jedzenie`);
    check(halfLifeDays('dish_compote') < halfLifeDays('raspberry') && halfLifeDays('raspberry') < halfLifeDays('roasted_apple') && halfLifeDays('roasted_apple') < halfLifeDays('jablon_jablko'), 'Potrawa < miękki owoc < pieczone < twardy owoc');
    check(halfLifeDays('raspberry') === 3 && halfLifeDays('jablon_jablko') === 7 && halfLifeDays('dish_compote') === 2, 'Okresy półtrwania jak w poradniku');
    // Suszenie daje trwałość: każdy owoc do suszenia się psuje, susz - nie.
    for (const type of Object.keys(FOODS)) if (driesInto(type) === 'dried_fruit') check(isPerishable(type), `${type}: świeży się psuje, suszony nie`);
    check(itemExists(COMPOST) && ITEM_TYPES[COMPOST].label === 'Kompost' && manifest.tiles[ITEM_TYPES[COMPOST].icon] && !getFood(COMPOST), 'Kompost: przedmiot z ikonką, niejadalny');
}


// --- Temperatura i miejsce ------------------------------------------------------------

{
    check(temperatureFactor(15) === 1 && temperatureFactor(25) === 2 && temperatureFactor(5) === 0.5, 'Dwa razy szybciej na każde 10°C');
    check(temperatureFactor(0) === S.FROZEN && temperatureFactor(-20) === S.FROZEN && temperatureFactor(60) === 4 && temperatureFactor(NaN) === 1, 'Mróz prawie zatrzymuje psucie; upał ma sufit');
    for (let t = -10; t < 40; t += 1) check(temperatureFactor(t + 1) >= temperatureFactor(t), `Cieplej - nie wolniej (${t}°C)`);
    near(spoilChance('raspberry', 3), 0.5, 1e-9, 'Maliny: po 3 dobach połowa');
    near(spoilChance('raspberry', 6), 0.75, 1e-9, 'Po 6 dobach trzy czwarte');
    near(spoilChance('raspberry', 6, 15, 'chest'), 0.5, 1e-9, 'W skrzyni dwa razy wolniej');
    near(spoilChance('raspberry', 12, 15, 'cellar'), 1 - 0.5 ** (12 * S.CHEST * S.CELLAR * temperatureFactor(S.CELLAR_TEMPERATURE) / 3), 1e-9, 'Piwniczka: jeszcze wolniej i chłodniej');
    check(spoilChance('raspberry', 1, 30, 'cellar') === spoilChance('raspberry', 1, S.CELLAR_TEMPERATURE, 'cellar') && spoilChance('raspberry', 1, 30, 'chest') > spoilChance('raspberry', 1, 30, 'cellar') * 4, 'Latem piwniczka trzyma chłód');
    check(spoilChance('raspberry', 1, -5, 'cellar') < spoilChance('raspberry', 1, 5, 'cellar'), 'Zimą w piwniczce też jest mróz');
    check(spoilChance('raspberry', 8, -5) < 0.1 && spoilChance('raspberry', 8, 22) > 0.9, 'Cała zima na mrozie: prawie nic; całe lato w plecaku: prawie wszystko');
    check(spoilChance('dried_fruit', 100, 40) === 0 && spoilChance('raspberry', 0) === 0 && spoilChance('raspberry', -1) === 0, 'Susz i zero czasu: nic');
    let state = 3;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    near(spoiledCount(10000, 0.3, random) / 10000, 0.3, 0.02, 'Losowanie sztuk zgodne z szansą');
    check(spoiledCount(64, 0, random) === 0 && spoiledCount(64, 1, random) === 64 && spoiledCount(0, 1, random) === 0, 'Brzegi');
}


// --- Plecak --------------------------------------------------------------------------------

function setup(items, { mode = 'adventure', temperature = 15, days = 10 } = {}) {
    const inventory = Inventory.load({}, mode);
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    items.forEach((item, i) => inventory.set(i, item));
    const notices = [], achieved = [];
    const chests = { chests: new Map(), version: 0 };
    const game = { mode, inventory, chests, time: { days }, weather: { temperature }, onNotice: (text) => notices.push(text),
        achieve: (name, data) => achieved.push([name, data]), sounds: { play() {} },
        world: { loaded: true, sky: 15, getChunk() { return this.loaded ? {} : null; }, toChunkCoord: (v) => Math.floor(v / 16), getLight() { return { sky: this.sky }; } } };
    const spoilage = new Spoilage(game);
    let state = 11;
    spoilage.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    return { game, inventory, spoilage, notices, achieved, chests, count: (type) => inventory.count(type) };
}

{
    // Rozkład: 20 stosów malin przez 3 doby - zostaje około połowy.
    const t = setup(Array.from({ length: 20 }, () => ({ type: 'raspberry', count: 64 })));
    for (let i = 0; i < 72; i++) t.spoilage.step(SPOIL_STEP_DAYS);
    near(t.count('raspberry') / 1280, 0.5, 0.05, 'Po 3 dobach (godzina po godzinie) zostaje połowa malin');
    check(t.count(COMPOST) === 1280 - t.count('raspberry') && t.spoilage.spoiled === t.count(COMPOST), 'Każda zepsuta sztuka to kompost');
    check(t.notices.length > 10 && /^Zepsuło się: \d+ × /.test(t.notices[0]) && t.achieved.every(([name]) => name === 'spoiled'), 'Napisy o zepsutym jedzeniu');

    // Susz i orzechy leżą bez końca.
    const dry = setup([{ type: 'dried_fruit', count: 64 }, { type: 'hazelnut', count: 64 }, { type: 'acorn', count: 64 }, { type: 'stone', count: 64 }]);
    dry.spoilage.step(64);
    check(dry.count('dried_fruit') === 64 && dry.count('hazelnut') === 64 && dry.count('acorn') === 64 && dry.count('stone') === 64 && dry.notices.length === 0, 'Susz, orzechy i kamienie po 64 dobach bez zmian');

    // Potrawa oddaje miskę.
    const dish = setup([{ type: 'dish_pumpkin_soup', count: 8 }]);
    dish.spoilage.step(30);
    check(dish.count('dish_pumpkin_soup') === 0 && dish.count('clay_bowl') === 8 && dish.count(COMPOST) === 8, 'Zepsuta potrawa: miska wraca, w niej kompost');

    // Pełny plecak: zepsute sztuki znikają, nic się nie wysypuje.
    const full = setup([{ type: 'raspberry', count: 64 }]);
    for (let i = 1; i < full.inventory.slots.length; i++) full.inventory.set(i, { type: 'stone', count: 64 });
    full.spoilage.step(0.5);
    check(full.count('raspberry') < 64 && full.count('raspberry') > 40 && full.count('stone') === 64 * (full.inventory.slots.length - 1), 'Pełny plecak: część malin zepsuta, reszta rzeczy nietknięta');

    // Mróz i upał.
    const frost = setup([{ type: 'raspberry', count: 64 }], { temperature: -8 });
    frost.spoilage.step(8);
    const heat = setup([{ type: 'raspberry', count: 64 }], { temperature: 28 });
    heat.spoilage.step(8);
    check(frost.count('raspberry') >= 55 && heat.count('raspberry') <= 2, `Osiem dób: na mrozie zostało ${frost.count('raspberry')}, w upale ${heat.count('raspberry')}`);

    // Tryb kreatywny i tempo.
    const creative = setup([{ type: 'raspberry', count: 64 }], { mode: 'creative' });
    creative.spoilage.update(100000);
    creative.spoilage.advance(100000);
    check(creative.count('raspberry') === 64, 'Kreatywny: nic się nie psuje');
    const off = setup([{ type: 'raspberry', count: 64 }]);
    off.spoilage.speed = 0;
    off.spoilage.update(100000);
    check(off.count('raspberry') === 64, 'Tempo 0: wyłączone');

    // update: krok co godzinę gry; advance: przespana noc.
    const clock = setup([{ type: 'dish_compote', count: 64 }]);
    const hour = DAY_LENGTH_MINUTES * 60 / 24;
    clock.spoilage.update(hour * 0.9);
    check(clock.count('dish_compote') === 64 && clock.spoilage.pending > 0, 'Przed pełną godziną nic');
    clock.spoilage.update(hour * 0.2);
    check(clock.spoilage.pending === 0, 'Po godzinie - przegląd');
    const night = setup([{ type: 'dish_compote', count: 64 }]);
    night.spoilage.advance(DAY_LENGTH_MINUTES * 60 * 2);
    near(night.count('dish_compote') / 64, 0.5, 0.15, 'Przespane dwie doby: połowa kompotu');
}


// --- Skrzynie ----------------------------------------------------------------------------------

{
    const fill = (t, x = 0) => { const chest = newChest(x, 10, 0); for (let cell = 0; cell < 12; cell++) { chest.layers[0][cell] = { type: 'raspberry', count: 64 }; chest.layers[1][cell] = { type: 'raspberry', count: 64 }; } t.chests.chests.set(`${x},10,0`, chest); return chest; };
    const left = (chest) => chest.layers.flat().filter((item) => item?.type === 'raspberry').reduce((sum, item) => sum + item.count, 0);
    const total = 24 * 64;

    const open = setup([]);
    const chest = fill(open);
    open.spoilage.step(6);
    near(left(chest) / total, 0.5, 0.05, 'Skrzynia pod gołym niebem: połowa po 6 dobach (2 razy wolniej niż plecak)');
    check(open.chests.version > 0 && open.notices.length === 0, 'Zmiana skrzyni do zapisu, bez napisu');

    const cellar = setup([], { temperature: 22 });
    cellar.game.world.sky = 0;
    const deep = fill(cellar);
    cellar.spoilage.step(6);
    const outside = setup([], { temperature: 22 });
    const sun = fill(outside);
    outside.spoilage.step(6);
    check(left(deep) > left(sun) * 2.5 && left(deep) / total > 0.6, `Latem w piwniczce zostaje ${left(deep)}, na słońcu ${left(sun)}`);

    // Cały stos zepsuty: w przegródce leży kompost.
    const rot = setup([], { temperature: 30 });
    const old = fill(rot);
    rot.spoilage.step(64);
    check(old.layers.flat().every((item) => item.type === COMPOST && item.count === 64), 'Zepsuty stos w skrzyni to kompost');

    // Daleka skrzynia: temperatura pory roku, nie pogody przy graczu.
    let winter = 0;
    while (seasonAt(winter).index !== 3) winter += 0.25;
    const far = setup([], { temperature: 30, days: winter + YEAR_DAYS });
    far.game.world.loaded = false;
    const away = fill(far);
    far.spoilage.step(8);
    check(SEASON_TEMPERATURE.length === 4 && SEASON_TEMPERATURE[3] < 0 && SEASON_TEMPERATURE[1] > SEASON_TEMPERATURE[0] && left(away) / total > 0.85, `Daleka skrzynia zimą: mróz (zostało ${left(away)})`);
    void SEASON_DAYS;

    // Gość w grze ze znajomymi: skrzynie liczy gospodarz.
    const guest = setup([{ type: 'raspberry', count: 64 }]);
    guest.game.net = { isClient: true };
    const theirs = fill(guest);
    guest.spoilage.step(6);
    check(left(theirs) === total && guest.count('raspberry') < 64, 'Gość: własny plecak tak, skrzynie nie');
    const host = setup([]);
    host.game.net = { isClient: false };
    const mine = fill(host);
    host.spoilage.step(6);
    check(left(mine) < total, 'Gospodarz liczy skrzynie');
}


// --- Kompost, podłączenie, osiągnięcie --------------------------------------------------------------

{
    const source = readFileSync(new URL('src/game/GameInteraction.js', root), 'utf8');
    check(/this\.selectedBlock === COMPOST && this\.fertilize\(this\.currentHit\)/.test(source), 'PPM kompostem: użyźnianie');
    const body = source.slice(source.indexOf('    fertilize(hit) {'), source.indexOf('    // Pusty gliniany garnek w ręce'));
    const fertilize = new Function('COMPOSTABLE', `return function ${body.trim()}`)(['grass', 'dirt', 'coarse_dirt', 'forest_floor']);
    const make = (type, mode = 'adventure') => {
        const inventory = Inventory.load({}, mode);
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        inventory.set(0, { type: COMPOST, count: 3 }); inventory.selected = 0;
        const set = [], achieved = [], notices = [];
        return { mode, inventory, set, achieved, notices, world: { setBlock: (x, y, z, block) => { set.push(block); return true; } }, playBlockSound() {}, swingArm() {},
            achieve: (name, data) => achieved.push([name, data]), onNotice: (text) => notices.push(text), hit: { hit: true, block: { x: 1, y: 9, z: 1, type } } };
    };
    for (const type of ['grass', 'dirt', 'coarse_dirt', 'forest_floor']) {
        const game = make(type);
        check(fertilize.call(game, game.hit) === true && game.set.join() === 'humus' && game.inventory.count(COMPOST) === 2 && game.achieved[0][0] === 'composted', `${type}: kompost robi czarnoziem`);
    }
    let game = make('stone');
    check(fertilize.call(game, game.hit) === false && game.set.length === 0 && game.inventory.count(COMPOST) === 3, 'Kamienia się nie użyźni');
    game = make('humus');
    check(fertilize.call(game, game.hit) === true && game.set.length === 0 && game.inventory.count(COMPOST) === 3 && game.notices.length === 1, 'Czarnoziem: kompost zostaje w ręce');
    game = make('dirt', 'creative');
    check(fertilize.call(game, game.hit) === true && game.inventory.count(COMPOST) === 3, 'Kreatywny: kompost nie ubywa');
    check(fertilize.call(game, { hit: false }) === false && fertilize.call(game, null) === false, 'Bez celu - nic');

    const gameSource = readFileSync(new URL('src/game/Game.js', root), 'utf8');
    check(/new Spoilage\(this\)/.test(gameSource) && /this\.spoilage\.update\(dt\)/.test(gameSource) && /this\.spoilage\.advance\(seconds\)/.test(gameSource), 'Psucie podłączone do gry i do przespanego czasu');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.composted.on === 'composted' && itemExists(byId.composted.icon), 'Osiągnięcie za kompost');
    check(itemUses(COMPOST).some((text) => text.includes('czarnoziem')), 'Kompost: opis zastosowania');
}

console.log(`OK: psucie się jedzenia - ${checks} sprawdzeń (co się psuje, temperatura, plecak, skrzynie i piwniczka, przespany czas, kompost).`);
