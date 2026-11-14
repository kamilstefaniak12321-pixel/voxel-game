// ------------------------------------------------------------
// STRAŻNIK PORZĄDKU: KATEGORIE I ZASTOSOWANIA (0.98.1)
//
// Pilnuje, żeby nowe rzeczy nie rozjeżdżały się z resztą gry:
// - kategorie: dziewięć zakładek, każda rzecz z ekwipunku ma jedną;
//   jedna zasada na rodzaj rzeczy (rośliny razem, plony razem, meble
//   razem - niezależnie od tego, w którym pliku rzecz jest opisana),
// - zastosowania: każdy przedmiot do czegoś służy (przepis, jedzenie,
//   sadzenie, narzędzie, opał, podpałka) - plon bez zastosowania
//   zatrzymuje testy,
// - grupy składników: każda niepusta, każdy kolor daje barwnik, plony
//   roślin trafiają do grup z roslina.json,
// - napary i efekty: kubek, kubek ziół, napar, zwrot kubka, działanie
//   efektów (sen, gojenie, wigor), wygasanie, zapis,
// - podpałki: lepsza podpałka - krótsze rozpalanie,
// - wianek z kwiatów, oliwki do pochodni i lamp, ochra do tynku,
// - osiągnięcia za jedzenie, pole, pieczenie, upadek, sen i napary.
//
// Uruchomienie: node tools/sprawdz_zastosowania.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const R = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES, getTool, getItemLabel, itemExists } = await import('../src/items/ItemRegistry.js');
const { CATEGORIES, CATEGORY_ORDER, getCategory } = await import('../src/items/categories.js');
const { RECIPES, GROUPS } = await import('../src/crafting/recipes.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { FOODS, ROASTS, TEAS, CUP, KIND_LABELS, getFood, getRoast, isDrink } = await import('../src/items/foods.js');
const { EFFECTS, getEffect } = await import('../src/items/effects.js');
const { PLANT_PACKS, PLANT_GROUPS, PLANT_COLOR_GROUPS, plantStageType } = await import('../src/blocks/plantPacks.js');
const { TINDERS, isTinder, fuelWood, newCampfire, addFirewood, addTinder, updateCampfire, CAMPFIRE_IGNITE_SECONDS } = await import('../src/game/CampfireState.js');
const { Wellbeing, SLEEP_PLACES } = await import('../src/game/Wellbeing.js');
const { shapeInfo } = await import('../src/blocks/woodShapes.js');
const { WALL_DECORATIONS } = await import('../src/blocks/decorations.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { itemUses, craftsFrom } = await import('../src/items/uses.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);


// --- Kategorie -----------------------------------------------------------------

const inventoryBlocks = Object.entries(R.BLOCK_TYPES).filter(([, definition]) => definition.inventory !== false).map(([type]) => type);
const everything = [...inventoryBlocks, ...Object.keys(ITEM_TYPES)];
{
    check(CATEGORY_ORDER.length === 9, 'Dziewięć zakładek - po jednej na kolumnę ekwipunku');
    check(CATEGORY_ORDER.every((key) => CATEGORIES[key].label && itemExists(CATEGORIES[key].icon)), 'Każda kategoria ma nazwę i ikonę');
    for (const type of everything) check(Object.hasOwn(CATEGORIES, getCategory(type)), `${type}: ma kategorię (${getCategory(type)})`);

    // Jedna zasada na rodzaj rzeczy.
    const expected = { stairs: 'budowa', slab: 'budowa', fence: 'budowa', gate: 'budowa', door: 'budowa', trapdoor: 'budowa',
        table: 'ozdoby', bed: 'ozdoby', mat: 'ozdoby' };
    for (const type of inventoryBlocks) {
        const definition = R.BLOCK_TYPES[type];
        const kind = shapeInfo(definition.id)?.kind;
        if (kind) check(getCategory(type) === expected[kind], `${type}: ${kind} w kategorii ${expected[kind]}`);
        if (definition.model === 'chest') check(getCategory(type) === 'ozdoby', `${type}: skrzynia to mebel`);
        if (['log', 'stripped'].includes(definition.part)) check(getCategory(type) === 'drewno', `${type}: pień w drewnie`);
        if (definition.model === 'cross' || definition.model === 'leaves' || definition.riverPlant) {
            check(getCategory(type) === 'rosliny', `${type}: roślina w roślinach`);
        }
    }
    // Rośliny z plików danych leżą razem z pozostałymi, a ich plony razem z innymi surowcami.
    for (const pack of PLANT_PACKS) {
        pack.stages.forEach((_, index) => check(getCategory(plantStageType(pack, index)) === 'rosliny', `${plantStageType(pack, index)}: roślina w roślinach`));
        if (pack.item) {
            const edible = Boolean(getFood(pack.item.type)) || Boolean(ITEM_TYPES[pack.item.type].plants);
            check(getCategory(pack.item.type) === (edible ? 'owoce' : 'narzedzia'), `${pack.item.type}: plon w ${edible ? 'jedzeniu' : 'surowcach'}`);
        }
    }
    for (const type of Object.keys(FOODS)) check(getCategory(type) === 'owoce', `${type}: jedzenie w jedzeniu`);
    for (const type of Object.keys(ITEM_TYPES)) {
        if (getTool(type)) check(getCategory(type) === 'narzedzia', `${type}: narzędzie w narzędziach`);
        if (fuelWood(type)) check(getCategory(type) === 'drewno', `${type}: opał w drewnie`);
    }
    check(getCategory('straw_bedding') === 'ozdoby' && getCategory('flower_wreath') === 'ozdoby' && getCategory('spruce_wreath') === 'ozdoby', 'Pościel i wieńce - meble i ozdoby');
    check(getCategory('straw') === 'narzedzia' && getCategory(CUP) === 'narzedzia' && getCategory('dye_red') === 'narzedzia', 'Słoma, kubek, barwnik - surowce');
    // Żadna kategoria nie jest pusta.
    for (const key of CATEGORY_ORDER) check(everything.some((type) => getCategory(type) === key), `Kategoria ${key} nie jest pusta`);
}


// --- Zastosowania ----------------------------------------------------------------

const ingredients = new Set();
for (const recipe of RECIPES) {
    for (const spec of [...(recipe.ingredients ?? []), ...Object.values(recipe.key ?? {})]) {
        if (spec.startsWith('#')) for (const type of GROUPS[spec.slice(1)].types) ingredients.add(type);
        else ingredients.add(spec);
    }
}
// Przedmioty, które działają same (nie są składnikiem ani jedzeniem).
const OWN_USE = { raft: 'stawia się na wodzie', fire_starter: 'rozpala ognisko' };

function usesOf(type) {
    const uses = [];
    if (ingredients.has(type)) uses.push('przepis');
    if (getFood(type)) uses.push('jedzenie');
    if (getRoast(type)) uses.push('ognisko');
    if (isTinder(type)) uses.push('podpałka');
    if (fuelWood(type)) uses.push('opał');
    if (getTool(type)) uses.push('narzędzie');
    if (ITEM_TYPES[type]?.plants) uses.push('sadzenie');
    if (OWN_USE[type]) uses.push(OWN_USE[type]);
    return uses;
}

{
    for (const type of Object.keys(ITEM_TYPES)) {
        check(usesOf(type).length > 0, `${type} (${getItemLabel(type)}): przedmiot bez zastosowania`);
        // Ta sama odpowiedź w grze (items/uses.js - komenda /rosliny).
        check(itemUses(type).length > 0 && itemUses(type).every((text) => typeof text === 'string' && text.length > 3), `${type}: opis zastosowania w grze`);
    }
    check(itemUses('huba_huba').some((text) => /podpałka \(2 razy/.test(text)) && craftsFrom('huba_huba').includes('Barwnik brązowy'), `Huba: podpałka i barwnik (${itemUses('huba_huba').join('; ')})`);
    check(itemUses('tea_calm')[0] === `napar (${EFFECTS.calm.label})` && itemUses('brew_calm')[0].startsWith('parzenie nad ogniskiem: Napar na sen'), 'Napar i kubek ziół: opis');
    check(itemUses('jablon_jablko').includes('jedzenie') && itemUses('jablon_jablko').some((text) => text.startsWith('pieczenie nad ogniskiem')), 'Jabłko: jedzenie i pieczenie');
    check([...craftsFrom('lawenda_bukiet')].sort().join() === ['Barwnik fioletowy', 'Fioletowa lampa', 'Kubek ziół na sen', 'Wianek z kwiatów'].join(),
        `Lawenda: barwnik, lampa, wianek, napar (${craftsFrom('lawenda_bukiet').join(', ')})`);
    // Plony roślin: zastosowanie poza samym sadzeniem.
    for (const pack of PLANT_PACKS) {
        if (!pack.item) continue;
        const uses = usesOf(pack.item.type).filter((use) => use !== 'sadzenie');
        check(uses.length > 0, `${pack.item.type}: plon rośliny "${pack.label ?? pack.folder}" bez zastosowania - dopisz "grupy" w roslina.json`);
    }
    // Rzeczy wymienione w 0.97 jako bez zastosowania.
    for (const type of ['linden_flower', 'olive_oliwki', 'len_wiazka', 'huba_huba', 'ochra_grudka', 'kocanka_bukiet', 'plantain']) {
        check((usesOf(type).length > 0 || ingredients.has(type)), `${type}: ma zastosowanie`);
    }
    check(ingredients.has('plantain') && ingredients.has('nettle') && ingredients.has('chamomile'), 'Polne zioła (babka, pokrzywa, rumianek) idą do naparów');
}


// --- Grupy składników ---------------------------------------------------------------

{
    for (const [name, group] of Object.entries(GROUPS)) {
        check(group.types.length > 0, `Grupa #${name} nie jest pusta`);
        check(group.types.every((type) => itemExists(type)), `Grupa #${name}: same istniejące rzeczy`);
        check(!/\(\)|\(, /.test(group.label) && group.label.length <= 110, `Grupa #${name}: czytelna nazwa "${group.label}"`);
    }
    check(PLANT_GROUPS.every((name) => Object.hasOwn(GROUPS, name)), 'Każda grupa z roslina.json istnieje w przepisach');
    for (const color of PLANT_COLOR_GROUPS) {
        const source = GROUPS[color].types[0];
        check(findRecipe([source])?.result[0] === `dye_${color}`, `Coś ${color} -> barwnik (${source})`);
    }
    for (const pack of PLANT_PACKS) {
        for (const group of pack.item?.groups ?? []) check(GROUPS[group].types.includes(pack.item.type), `${pack.item.type} w grupie #${group}`);
    }
    check(findRecipe(['piwonia_kwiat'])?.result[0] === 'dye_pink' && findRecipe(['dye_red', 'dye_white'])?.result[0] === 'dye_pink', 'Różowy: z kwiatu i z mieszania');
    check(findRecipe(['huba_huba'])?.result[0] === 'dye_brown' && findRecipe(['ochra_grudka'])?.result[0] === 'dye_yellow', 'Huba - brąz, ochra - żółty');
    check(findRecipe(['stick', 'olive_oliwki'])?.result[0] === 'torch' && findRecipe(['stick', 'resin'])?.result[0] === 'torch', 'Pochodnia: żywica albo oliwki');
    check(findRecipe(['lepidolite', 'olive_oliwki', 'birch_bark'])?.result[0] === 'lamp', 'Lampa: też na oliwki');
    check(findRecipe(['lime_plaster', 'lime_plaster', 'lime_plaster', 'ochra_grudka'])?.result[0] === 'ochre_plaster'
        && findRecipe(['lime_plaster', 'lime_plaster', 'lime_plaster', 'clay'])?.result[0] === 'ochre_plaster', 'Żółty tynk: z ochry albo gliny');
    check(findRecipe(['spruce_leaves', 'spruce_leaves', 'spruce_leaves', 'sequoia_cone'])?.result[0] === 'spruce_wreath', 'Wieniec: dowolna szyszka');
    check(findRecipe(['dune_grass', 'reed'])?.result[0] === 'straw', 'Słoma: też z trawy wydmowej i trzciny');
}


// --- Wianek z kwiatów --------------------------------------------------------------

{
    check(findRecipe(['poppy', 'kocanka_bukiet', 'cornflower', 'piwonia_kwiat'])?.result[0] === 'flower_wreath', 'Wianek: cztery dowolne kwiaty');
    check(findRecipe(['poppy', 'poppy', 'poppy', 'poppy'])?.result[0] === 'flower_wreath', 'Wianek: mogą być jednakowe');
    check(findRecipe(['poppy', 'poppy', 'poppy'])?.result[0] !== 'flower_wreath', 'Trzy kwiaty to za mało');
    const ids = new Set();
    for (const [base, decoration] of Object.entries(WALL_DECORATIONS)) {
        const sides = R.BLOCK_TYPES[base].wall;
        check(Object.keys(sides).length === 4 && sides.north === base, `${base}: cztery strony ściany`);
        for (const [side, type] of Object.entries(sides)) {
            const definition = R.BLOCK_TYPES[type];
            ids.add(definition.id);
            check(definition.model === 'flat' && definition.flat.attach === side && definition.drops === base && definition.pick === base, `${type}: płaska ozdoba, daje ${base}`);
            check(definition.id >= decoration.firstId && definition.id < decoration.firstId + 4 && definition.id >= 256 && definition.id <= 999, `${type}: numer w zakresie bloków gry`);
            check((definition.creative !== false) === (side === 'north'), `${type}: w trybie kreatywnym tylko jedna odmiana`);
        }
    }
    check(ids.size === Object.keys(WALL_DECORATIONS).length * 4, 'Ozdoby: numery bez powtórzeń');
    check(R.getBlockLabel('flower_wreath') === 'Wianek z kwiatów', 'Nazwa wianka');
}


// --- Podpałki ------------------------------------------------------------------------

{
    check(isTinder('short_grass') && isTinder('straw') && isTinder('birch_bark') && isTinder('huba_huba') && isTinder('porostiglasty_galazki') && !isTinder('stick'), 'Podpałki: trawa, słoma, kora, huba, porost');
    check(Object.keys(TINDERS).every((type) => itemExists(type) && TINDERS[type] > 0), 'Każda podpałka istnieje');
    check(TINDERS.huba_huba > TINDERS.birch_bark && TINDERS.birch_bark > TINDERS.straw && TINDERS.straw > TINDERS.short_grass, 'Huba najlepsza, trawa najsłabsza');
    const ignite = (tinder) => {
        const fire = newCampfire(0, 0, 0);
        for (let i = 0; i < 6; i++) addFirewood(fire, 'oak');
        check(addTinder(fire, tinder), `${tinder}: da się dołożyć na podpałkę`);
        let seconds = 0;
        while (fire.phase === 'unlit' && seconds < 20) { updateCampfire(fire, 0.05, true); seconds += 0.05; }
        return seconds;
    };
    near(ignite('short_grass'), CAMPFIRE_IGNITE_SECONDS, 'Trawa: zwykły czas rozpalania', 0.11);
    near(ignite('huba_huba'), CAMPFIRE_IGNITE_SECONDS / 2, 'Huba: dwa razy szybciej', 0.11);
    check(ignite('birch_bark') < ignite('straw') && ignite('straw') < ignite('tall_grass'), 'Kora szybciej niż słoma, słoma szybciej niż trawa');
    const stale = newCampfire(0, 0, 0);
    for (let i = 0; i < 6; i++) addFirewood(stale, 'oak');
    check(!addTinder(stale, 'stick') && !stale.tinder, 'Patyk to nie podpałka');
}


// --- Napary ------------------------------------------------------------------------------

{
    check(findRecipe(['clay', 'clay'])?.result.join() === `${CUP},2`, 'Dwie gliny - dwa kubki');
    check(Object.keys(TEAS).length === 3 && Object.keys(TEAS).every((effect) => getEffect(effect)), 'Trzy napary, każdy ze swoim efektem');
    for (const [effect, { brew, tea, herbs }] of Object.entries(TEAS)) {
        check(itemExists(brew) && itemExists(tea) && GROUPS[herbs].types.length >= 2, `${effect}: przedmioty i co najmniej dwa zioła`);
        const [first, second] = GROUPS[herbs].types;
        check(findRecipe([CUP, first, second])?.result[0] === brew && findRecipe([first, CUP, first])?.result[0] === brew, `${effect}: kubek + dwa zioła (${first}, ${second})`);
        check(findRecipe([CUP, first]) === null || findRecipe([CUP, first])?.result[0] !== brew, `${effect}: jedno zioło to za mało`);
        check(getRoast(brew) === tea && isDrink(tea) && !isDrink(brew) && !getFood(brew), `${brew} nad ogniskiem -> ${tea} (surowych ziół się nie pije)`);
        const food = FOODS[tea];
        check(food.kind === 'drink' && KIND_LABELS.drink && food.effects.join() === effect && food.returns === CUP, `${tea}: napój z efektem, kubek wraca`);
    }
    check(findRecipe([CUP, 'linden_flower', 'nettle']) === null, 'Zioła z różnych grup nie dają naparu');
    for (const [type, food] of Object.entries(FOODS)) {
        check(food.effects.every((effect) => getEffect(effect)), `${type}: znane efekty`);
        if (food.returns) check(itemExists(food.returns), `${type}: zwracany przedmiot istnieje`);
    }
    for (const [type, effect] of Object.entries(EFFECTS)) check(effect.label && effect.text && effect.hours > 0, `Efekt ${type}: nazwa, opis, czas`);
}


// --- Efekty (Wellbeing) -----------------------------------------------------------------

const DAY = 1200, HOUR = 50;
const fresh = (saved, days = 0) => Wellbeing.load(saved, days, () => 0.5);
function run(w, seconds, activity, clock, dt = 0.5) {
    const events = [];
    for (let t = 0; t < seconds; t += dt) {
        clock.days += dt / DAY;
        events.push(...w.update(dt, activity, clock.days));
    }
    return events;
}

{
    // Picie: działa z pełnym żołądkiem, włącza efekt, pokazuje go w opisie.
    const w = fresh({ energy: 50, condition: 100, fullness: 100000 }, 0.5);
    check(!w.canEat('jablon_jablko').ok && w.canEat('tea_vigor').ok, 'Napar da się wypić z pełnym żołądkiem');
    const drank = w.eat('tea_vigor', 0.5);
    check(drank.ok && drank.effects.join() === 'vigor' && w.hasEffect('vigor') && !w.hasEffect('calm'), 'Wypity napar włącza efekt');
    const info = w.describe().effects;
    check(info.length === 1 && info[0].label === EFFECTS.vigor.label, 'Okno statusu: działający efekt');
    near(info[0].hours, EFFECTS.vigor.hours, 'Ile godzin zostało');
    check(fresh({ energy: 50 }, 0.5).eat('strawberry', 0.5).effects.length === 0, 'Zwykłe jedzenie - bez efektów');

    // Wigor: wolniej ubywa energii, szybsza praca; po czasie mija (zdarzenie).
    const plain = fresh({ energy: 80, condition: 100, rest: 100 }, 0.3), vigor = fresh({ energy: 80, condition: 100, rest: 100 }, 0.3);
    vigor.addEffect('vigor', 0.3);
    const clock = { days: 0.3 };
    run(plain, 3 * HOUR, { moving: true }, { days: 0.3 });
    run(vigor, 3 * HOUR, { moving: true }, clock);
    near((80 - vigor.energy) / (80 - plain.energy), EFFECTS.vigor.drain, 'Wigor: zużycie energii według mnożnika', 0.01);
    near(vigor.effects.work / plain.effects.work, EFFECTS.vigor.work, 'Wigor: szybsza praca');
    const ended = run(vigor, 3 * HOUR, {}, clock);
    check(ended.some((event) => event.type === 'effectEnded' && event.effect === 'vigor') && !vigor.hasEffect('vigor') && vigor.describe().effects.length === 0, 'Efekt mija po swoim czasie');
    near(vigor.effects.work, plain.effects.work, 'Po wigorze praca wraca do zwykłej');

    // Gojenie: stłuczona noga zdrowieje trzy razy szybciej.
    const hurt = fresh({ energy: 80, condition: 100, limp: 120 }, 0.3), healed = fresh({ energy: 80, condition: 100, limp: 120 }, 0.3);
    healed.addEffect('heal', 0.3);
    run(hurt, 20, { moving: true }, { days: 0.3 });
    run(healed, 20, { moving: true }, { days: 0.3 });
    near((120 - healed.data.limp) / (120 - hurt.data.limp), EFFECTS.heal.heal, 'Napar leczniczy: gojenie według mnożnika', 0.01);

    // Spokój: lepszy sen w każdym miejscu, kończy się po przespanej nocy.
    const sleepWith = (place, calm, hours = 9) => {
        const s = fresh({ energy: 80, condition: 100, rest: 20 }, 0.85);
        if (calm) s.addEffect('calm', 0.85);
        return [s, s.sleep(hours, place, 0, 0.9 + hours / 24)];
    };
    check(sleepWith('mat', false)[1].rest === SLEEP_PLACES.mat.cap && sleepWith('mat', true)[1].rest === 100, 'Napar na sen: na posłaniu pełne wyspanie');
    check(sleepWith('ground', true)[1].rest === SLEEP_PLACES.ground.cap + EFFECTS.calm.sleep.cap && sleepWith('ground', true)[1].state === 'rested', 'Napar na sen: nawet na ziemi wypoczęty');
    check(sleepWith('bed', true, 3)[1].rest > sleepWith('bed', false, 3)[1].rest, 'Napar na sen: krótki sen daje więcej');
    const [calm] = sleepWith('mat', true);
    check(!calm.hasEffect('calm') && Object.keys(calm.data.effects).length === 0, 'Po przespanej nocy spokój mija');
    const [nap] = sleepWith('mat', true, 0.5);
    check(nap.hasEffect('calm'), 'Krótka drzemka nie zużywa naparu');
    // Efekt wypity po południu działa, choć jego czas minąłby w nocy.
    const late = fresh({ energy: 80, condition: 100, rest: 20 }, 0.6);
    late.addEffect('calm', 0.6);                                          // do ok. 4:24
    const lateClock = { days: 0.6 };
    run(late, 6 * HOUR, {}, lateClock);                                   // 14:24 -> 20:24
    run(late, 9 * HOUR, { sleeping: true }, lateClock);                   // sen do 5:24 (czas płynie - gra ze znajomymi)
    check(Object.hasOwn(late.data.effects, 'calm'), 'Spokój nie mija w trakcie snu');
    check(late.sleep(9, 'mat', 0, lateClock.days).rest === 100, 'Liczy się efekt z chwili zaśnięcia');
    const expired = fresh({ energy: 80, condition: 100, rest: 20 }, 0.1);
    expired.addEffect('calm', 0.1);
    run(expired, 16 * HOUR, {}, { days: 0.1 });
    check(expired.sleep(9, 'mat', 0, 1.2).rest === SLEEP_PLACES.mat.cap, 'Napar wypity za wcześnie już nie działa');

    // Odnowienie, zapis, uszkodzone pola, tryb kreatywny.
    const again = fresh({ energy: 50 }, 0.2);
    again.addEffect('heal', 0.2); again.addEffect('heal', 0.3);
    near(again.data.effects.heal, 0.3 + EFFECTS.heal.hours / 24, 'Drugi napar odnawia czas (nie sumuje)');
    const loaded = fresh(JSON.parse(JSON.stringify(again.data)), 0.3);
    check(loaded.hasEffect('heal') && loaded.data.effects.heal === again.data.effects.heal, 'Efekty zapisują się ze światem');
    const broken = fresh({ effects: { heal: 'zawsze', latanie: 5, vigor: 0.9 } }, 0.5);
    check(Object.keys(broken.data.effects).join() === 'vigor', 'Uszkodzony zapis: zostają tylko znane efekty z poprawnym czasem');
    check(Object.keys(fresh({ effects: 'tak' }).data.effects).length === 0 && Object.keys(fresh(null).data.effects).length === 0, 'Brak efektów w zapisie - pusta lista');
    const off = fresh({ energy: 50 }, 0.2);
    off.active = false;
    check(off.addEffect('vigor', 0.2) === false && off.effects.work === 1, 'Tryb kreatywny: efekty nie działają');
    check(fresh({}).addEffect('latanie') === false, 'Nieznany efekt - nic');
}


// --- Osiągnięcia za nowe mechaniki ----------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(new Set(ACHIEVEMENTS.map((entry) => entry.id)).size === ACHIEVEMENTS.length, 'Osiągnięcia: nazwy bez powtórzeń');
    for (const entry of ACHIEVEMENTS) check(itemExists(entry.icon), `${entry.id}: ikona "${entry.icon}" istnieje`);
    const collected = new Map();
    const book = { collect(key, value) { const list = collected.get(key) ?? []; if (!list.includes(value)) list.push(value); collected.set(key, list); return list.length; }, count: () => 0 };
    const earned = (id, event, data) => byId[id].on === event && (byId[id].when ? byId[id].when(data, book) : true);
    check(earned('first_meal', 'ate', { type: 'roasted_apple', meal: true, mealsToday: 1, kind: 'meal' }) && !earned('first_meal', 'ate', { meal: false, kind: 'snack' }), 'Posiłek');
    check(earned('three_meals', 'ate', { meal: true, mealsToday: 3 }) && !earned('three_meals', 'ate', { meal: true, mealsToday: 2 }) && !earned('three_meals', 'ate', { meal: false, mealsToday: 3 }), 'Trzy posiłki jednego dnia');
    check(earned('first_field', 'tilled', {}), 'Pole');
    check(earned('first_roast', 'roasted', { type: 'acorn', into: 'roasted_acorn' }) && !earned('first_roast', 'roasted', { type: 'brew_calm', into: 'tea_calm' }), 'Pieczenie (parzenie się nie liczy)');
    check(earned('bruised_leg', 'hurt', {}), 'Stłuczona noga');
    check(earned('blackout', 'blackout', {}) && byId.blackout.secret === true, 'Utonięcie (sekretne)');
    check(earned('bed_made', 'bedMade', { wood: 'oak', bedding: 'straw' }), 'Pościelone łóżko');
    check(earned('good_night', 'slept', { place: 'bed', hours: 9 }) && !earned('good_night', 'slept', { place: 'mat', hours: 9 }) && !earned('good_night', 'slept', { place: 'bed', hours: 1 }), 'Noc w łóżku');
    check(earned('under_stars', 'slept', { place: 'ground', hours: 8 }) && !earned('under_stars', 'slept', { place: 'ground', hours: 0.2 }), 'Noc na ziemi');
    check(earned('first_tea', 'ate', { type: 'tea_heal', kind: 'drink' }) && !earned('first_tea', 'ate', { type: 'strawberry', kind: 'snack' }), 'Pierwszy napar');
    check(!earned('herbalist', 'ate', { type: 'tea_calm', kind: 'drink' }) && !earned('herbalist', 'ate', { type: 'tea_calm', kind: 'drink' })
        && !earned('herbalist', 'ate', { type: 'tea_heal', kind: 'drink' }) && earned('herbalist', 'ate', { type: 'tea_vigor', kind: 'drink' }), 'Zielarz: trzy różne napary');
    check(!earned('herbalist', 'ate', { type: 'strawberry', kind: 'snack' }), 'Zielarz: jedzenie się nie liczy');
}

console.log(`OK: kategorie i zastosowania - ${checks} sprawdzeń (${everything.length} rzeczy w 9 kategoriach, ${Object.keys(ITEM_TYPES).length} przedmiotów z zastosowaniem, grupy, wianek, podpałki, napary, efekty, osiągnięcia).`);
