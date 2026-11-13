// Energia i samopoczucie (0.94.0): zużycie, stany, posiłki, kondycja,
// zapis - sama logika (src/game/Wellbeing.js, src/items/foods.js).
// Uruchomienie:
//     node tools/sprawdz_energie.mjs

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null,getTileMask=()=>null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { getCategory } = await import('../src/items/categories.js');
const { Wellbeing, STATES, CONDITION_MIN, CONDITION_MAX, MEAL_ENERGY, MEAL_GAP, MEAL_WINDOW, GREAT_CONDITION }
    = await import('../src/game/Wellbeing.js');
const { FOODS, KIND_LABELS, getFood } = await import('../src/items/foods.js');

let checks = 0;
const ok = (value, text) => { checks++; assert.ok(value, text); };
const equal = (a, b, text) => { checks++; assert.deepEqual(a, b, text); };
const near = (a, b, text, eps = 1e-6) => { checks++; assert.ok(Math.abs(a - b) <= eps, `${text}: ${a} != ${b}`); };

const DAY = 1200;
const fresh = (saved, days = 0) => Wellbeing.load(saved, days, () => 0.5);
// Symulacja: seconds sekund z daną aktywnością, czas gry płynie.
function run(w, seconds, activity = {}, clock = { days: 0 }, dt = 0.5) {
    const events = [];
    for (let t = 0; t < seconds; t += dt) {
        clock.days += dt / DAY;
        events.push(...w.update(dt, activity, clock.days));
    }
    return events;
}

// --- Jedzenie: lista ---------------------------------------------------------
{
    ok(Object.keys(FOODS).length >= 9, 'jest co jeść');
    for (const [type, food] of Object.entries(FOODS)) {
        ok(itemExists(type) && getItemLabel(type), `${type}: taki przedmiot istnieje w grze`);
        equal(getCategory(type), 'owoce', `${type}: owoc albo nasiono`);
        ok(food.energy > 0 && food.energy <= 60, `${type}: energia`);
        ok(food.fullness > 0, `${type}: sytość`);
        ok(food.kind in KIND_LABELS, `${type}: rodzaj`);
        ok(Array.isArray(food.effects), `${type}: lista efektów (na przyszłość)`);
    }
    equal(getFood('stone'), null, 'kamienia się nie je');
    equal(getFood('toString'), null, 'nazwy z prototypu to nie jedzenie');
}

// --- Początek ----------------------------------------------------------------
{
    const w = fresh(undefined, 3.4);
    equal(w.condition, 100, 'kondycja na start');
    equal(w.energy, 75, 'zapas energii na start');
    equal(w.state, 'good', 'na start: dobrze');
    equal(w.data.day, 3, 'doba z czasu gry');
    equal(w.effects, STATES.good, 'skutki stanu');
}

// --- Zużycie -------------------------------------------------------------------
{
    const used = (activity) => { const w = fresh(); run(w, 100, activity); return 75 - w.energy; };
    const rest = used({}), walk = used({ moving: true }), sprint = used({ moving: true, sprinting: true }),
        swim = used({ swimming: true }), mine = used({ mining: true });
    ok(rest > 0, 'energia ubywa także w spoczynku');
    ok(walk > rest && sprint > walk * 1.8 && swim > walk * 1.8 && mine > rest * 2, 'wysiłek kosztuje więcej');
    const w = fresh(); w.update(0.1, { jumps: 5 }, 0);
    ok(75 - w.energy > 0.9, 'skoki kosztują');
    // Doba spokojnego chodzenia nie zjada całego zapasu, doba biegu - tak.
    const calm = fresh(); run(calm, DAY, { moving: true });
    ok(calm.energy > 20, `po dobie chodzenia coś zostaje (${calm.energy.toFixed(1)})`);
    const runner = fresh(); run(runner, DAY, { moving: true, sprinting: true });
    equal(runner.energy, 0, 'doba biegu bez jedzenia wyczerpuje');
    equal(runner.state, 'exhausted', 'i kończy się wyczerpaniem');
    ok(runner.energy >= 0, 'energia nie spada poniżej zera');
}

// --- Stany i skutki --------------------------------------------------------------
{
    const at = (energy, condition = 100) => fresh({ energy, condition }).state;
    equal(at(100), 'good', 'pełny zapas przy zwykłej kondycji: dobrze');
    equal(at(100, GREAT_CONDITION), 'great', 'pełny zapas i dobra kondycja: świetnie');
    equal(at(50, GREAT_CONDITION), 'good', 'połowa zapasu: dobrze');
    equal(at(30), 'hungry', 'mało: głodny');
    equal(at(15), 'tired', 'bardzo mało: zmęczony');
    equal(at(3), 'exhausted', 'resztki: wyczerpany');
    ok(STATES.great.sprint > 1 && STATES.great.work > 1, 'świetnie: premie');
    ok(STATES.tired.sprint < 1 && STATES.tired.work < 1 && STATES.tired.canSprint, 'zmęczony: wolniej');
    ok(!STATES.exhausted.canSprint && STATES.exhausted.dim > 0 && STATES.exhausted.walk < 1, 'wyczerpany: tylko chód');
    equal(STATES.hungry.work, 1, 'głodny: jeszcze bez kar');
    for (const state of Object.values(STATES)) ok(state.label && state.text, 'opis stanu');

    // Zdarzenia: zmiana stanu i burczenie.
    const w = fresh({ energy: 41 });
    const events = run(w, 520, { moving: true, sprinting: true });
    const states = events.filter((e) => e.type === 'state').map((e) => e.to);
    equal(states, ['hungry', 'tired', 'exhausted'], 'stany po kolei');
    ok(events.filter((e) => e.type === 'rumble').length >= 3, 'głodnemu burczy w brzuchu');
    const calm = fresh({ energy: 90 });
    equal(run(calm, 200).filter((e) => e.type === 'rumble').length, 0, 'sytemu nie burczy');
    const first = fresh({ energy: 40.05 });
    const soon = run(first, 10, { moving: true, sprinting: true });
    ok(soon.some((e) => e.type === 'rumble'), 'pierwsze burczenie zaraz po zgłodnieniu');
}

// --- Jedzenie --------------------------------------------------------------------
{
    const w = fresh({ energy: 30 });
    equal(w.canEat('stone').ok, false, 'kamienia nie zje');
    const result = w.eat('jablon_jablko', 0.3);
    ok(result.ok && !result.meal, 'jabłko zjedzone, to jeszcze nie posiłek');
    equal(w.energy, 30 + FOODS.jablon_jablko.energy, 'energia z jabłka');
    ok(w.full, 'po jedzeniu jest najedzony');
    equal(w.data.lastFood, 'jablon_jablko', 'pamięta, co jadł');
    // Najedzony zużywa mniej i nie burczy mu w brzuchu.
    const hungry = fresh({ energy: 30 }), fed = fresh({ energy: 30, fullness: 300 });
    const rumbles = run(hungry, 100).filter((e) => e.type === 'rumble').length;
    equal(run(fed, 100).filter((e) => e.type === 'rumble').length, 0, 'najedzonemu nie burczy');
    ok(rumbles >= 1 && 30 - fed.energy < 30 - hungry.energy, 'najedzony zużywa mniej');
    // Pełny żołądek nie zmieści więcej (po chwili znowu tak).
    const full = fresh({ energy: 20 });
    let eaten = 0;
    while (full.eat('jablon_jablko', 0.1).ok && eaten < 50) eaten++;
    ok(eaten >= 3 && eaten <= 8, `na raz da się zjeść kilka jabłek (${eaten})`);
    const refused = full.eat('strawberry', 0.1);
    ok(!refused.ok && refused.reason, 'pełny nie je');
    run(full, 200);
    ok(full.eat('strawberry', 0.3).ok, 'po przerwie znowu może jeść');
    const top = fresh({ energy: 95 }); top.eat('jablon_jablko', 0.1);
    equal(top.energy, 100, 'energia nie przekracza kondycji');
    // Syty też może zjeść posiłek (liczy się regularność, nie głód).
    const sated = fresh({ energy: 100 });
    sated.eat('jablon_jablko', 0.5); sated.eat('jablon_jablko', 0.5);
    equal(sated.data.mealsToday, 1, 'posiłek przy pełnym zapasie też się liczy');
    // Wyłączone (tryb kreatywny).
    const off = fresh({ energy: 10 }); off.active = false;
    equal(off.update(100, { sprinting: true }, 5).length, 0, 'wyłączone: brak zdarzeń');
    equal(off.energy, 10, 'wyłączone: energia stoi');
    equal(off.effects, STATES.good, 'wyłączone: bez kar');
    equal(off.eat('strawberry', 0).ok, false, 'wyłączone: nie je');
}

// --- Posiłki ---------------------------------------------------------------------
{
    const w = fresh({ energy: 10 });
    const bites = Math.ceil(MEAL_ENERGY / FOODS.strawberry.energy);
    let got = [];
    for (let i = 0; i < bites; i++) got.push(w.eat('strawberry', 0.30 + i * 0.001).meal);
    equal(got.filter(Boolean).length, 1, 'kilka owoców naraz to jeden posiłek');
    ok(got.at(-1), 'zalicza się po zebraniu dość energii');
    equal(w.data.mealsToday, 1, 'posiłek policzony');
    // Zaraz potem drugi "posiłek" - objadanie, nie liczy się.
    for (let i = 0; i < bites; i++) w.eat('strawberry', 0.30 + MEAL_WINDOW + 0.01 + i * 0.001);
    equal(w.data.mealsToday, 1, 'objadanie się nie daje drugiego posiłku');
    ok(w.energy > 10 + MEAL_ENERGY * 1.9, 'ale energię daje');
    // Po przerwie - kolejny.
    w.data.energy = 10;
    for (let i = 0; i < bites; i++) w.eat('strawberry', 0.30 + MEAL_GAP + 0.06 + i * 0.001);
    equal(w.data.mealsToday, 2, 'po przerwie liczy się kolejny posiłek');
    // Pojedyncze owoce co jakiś czas to nie posiłek.
    const snack = fresh({ energy: 10 });
    for (let i = 0; i < 6; i++) snack.eat('strawberry', 0.1 + i * (MEAL_WINDOW + 0.01));
    equal(snack.data.mealsToday, 0, 'pojedyncze przekąski to nie posiłek');
}

// --- Kondycja (rozliczenie doby) -----------------------------------------------------
{
    const day = (meals, condition = 100) => {
        const w = fresh({ energy: 50, condition, mealsToday: meals, day: 0 }, 0.9);
        const events = w.update(0.1, {}, 1.01);
        return { w, event: events.find((e) => e.type === 'day') };
    };
    ok(day(3).w.condition > 100 && day(3).event.change > 0, 'trzy posiłki: kondycja rośnie');
    equal(day(5).w.condition, day(3).w.condition, 'więcej niż trzy nic nie dodaje');
    ok(day(2).w.condition >= 100, 'dwa posiłki: nie gorzej');
    ok(day(1).w.condition < 100, 'jeden posiłek: powoli spada');
    ok(day(0).w.condition < day(1).w.condition, 'bez jedzenia: spada szybciej');
    equal(day(0).event.meals, 0, 'zdarzenie doby mówi, ile było posiłków');
    equal(day(3).w.data.mealsToday, 0, 'nowa doba liczy od zera');
    equal(day(2).w.data.history, [2], 'historia dni');
    equal(day(0, CONDITION_MIN).w.condition, CONDITION_MIN, 'kondycja ma dolną granicę');
    equal(day(3, CONDITION_MAX).w.condition, CONDITION_MAX, 'i górną');
    // Spadek kondycji ścina zapas.
    const w = fresh({ energy: 100, condition: 100, mealsToday: 0, day: 0 }, 0.9);
    w.update(0.01, {}, 1.0);
    ok(w.energy <= w.condition, 'energia mieści się w kondycji');
    // Skok o wiele dni (komenda) rozlicza jedną dobę.
    const jump = fresh({ energy: 50, mealsToday: 0, day: 0 }, 0.5);
    jump.update(0.01, {}, 30.2);
    equal(jump.condition, day(0).w.condition, 'skok czasu to jedna rozliczona doba');
    equal(jump.data.day, 30, 'doba nadgoniona');
    // Cofnięcie czasu niczego nie psuje.
    const back = fresh({ energy: 50, mealsToday: 2, day: 5, lastMealAt: 5.5 }, 5.6);
    equal(back.update(0.01, {}, 2.1).filter((e) => e.type === 'day').length, 0, 'cofnięty czas: bez rozliczenia');
    equal(back.data.day, 2, 'doba po cofnięciu');
    ok(back.eat('jablon_jablko', 2.2).ok, 'po cofnięciu da się jeść');

    // Tydzień regularnego jedzenia -> świetnie; tydzień głodu -> słaba kondycja.
    const good = fresh(), clock = { days: 0.2 };
    for (let d = 0; d < 7; d++) {
        for (let m = 0; m < 3; m++) {
            run(good, DAY * 0.2, { moving: true }, clock);
            for (let i = 0; i < 3; i++) good.eat('jablon_jablko', clock.days);
        }
        run(good, DAY * 0.4, {}, clock);
    }
    ok(good.condition >= GREAT_CONDITION, `tydzień regularnych posiłków: kondycja ${good.condition}`);
    good.data.energy = good.capacity;
    equal(good.state, 'great', 'i świetne samopoczucie');
    const bad = fresh(), clock2 = { days: 0.2 };
    run(bad, DAY * 7, {}, clock2, 2);
    ok(bad.condition <= 75 && bad.condition >= CONDITION_MIN, `tydzień głodu: kondycja ${bad.condition}`);
    equal(bad.state, 'exhausted', 'i wyczerpanie - ale gra trwa');
    ok(bad.eat('jablon_jablko', clock2.days).ok, 'wyczerpany może jeść');
}

// --- Zapis -------------------------------------------------------------------------
{
    const w = fresh({ energy: 40 }, 2.5);
    for (let i = 0; i < 3; i++) w.eat('hazelnut', 2.5);
    const copy = fresh(JSON.parse(JSON.stringify(w.data)), 2.6);
    equal(copy.data, w.data, 'zapis i odczyt dają to samo');
    equal(copy.data.mealsToday, 1, 'posiłek w zapisie');
    // Zepsute dane nie wywracają gry.
    for (const broken of [null, 5, 'x', [], { energy: 'dużo', condition: -4, meal: 3, history: 'a', day: NaN },
        { energy: 1e9, condition: 1e9, fullness: -5, mealsToday: -2, history: [1, 'x', 3, 4, 5, 6] }]) {
        const b = fresh(broken, 1.5);
        ok(b.condition >= CONDITION_MIN && b.condition <= CONDITION_MAX, 'kondycja w granicach');
        ok(b.energy >= 0 && b.energy <= b.condition, 'energia w granicach');
        ok(b.data.fullness >= 0 && b.data.mealsToday >= 0 && b.data.history.length <= 3, 'reszta w granicach');
        equal(b.data.day, 1, 'doba naprawiona');
        ok(b.state in STATES && b.describe().energy, 'stan i opis działają');
    }
    const future = fresh({ day: 99 }, 4.2);
    equal(future.data.day, 4, 'doba z przyszłości wraca do teraz');
}

// --- Opis słowami ------------------------------------------------------------------
{
    const words = new Set();
    for (let e = 0; e <= 100; e += 5) words.add(fresh({ energy: e }).describe().energy);
    ok(words.size >= 5, 'zapas energii opisany kilkoma słowami');
    const conditions = new Set();
    for (let c = CONDITION_MIN; c <= CONDITION_MAX; c += 5) conditions.add(fresh({ condition: c }).describe().condition);
    ok(conditions.size >= 4, 'kondycja opisana kilkoma słowami');
    ok(near !== null);
}

console.log(`OK: energia i samopoczucie - ${checks} sprawdzeń.`);
