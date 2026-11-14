// ------------------------------------------------------------
// STROJENIE LICZB (0.99.0)
//
// Zamiast liczb "na oko": symulacja typowego gracza na prawdziwej
// logice gry (game/Wellbeing.js) i cele, które mają być spełnione.
// Zmiana stałej w grze, która psuje pierwsze minuty albo zwykły dzień,
// zatrzymuje ten test - wtedy trzeba świadomie zmienić cel.
//
// Trzech graczy (część czasu na jawie w danej czynności, skoki na minutę):
//   spokojny - dużo chodzi i kopie, prawie nie biega,
//   zwykły   - trochę biega, chodzi po pagórkach,
//   biegacz  - głównie biegnie i skacze.
//
// Cele:
//   pierwsze minuty - bez jedzenia burczenie ma przyjść w pierwszym
//     kwadransie (nauka), ale kary nie wcześniej niż po 12 minutach,
//   zwykły dzień    - trzy pieczone posiłki wystarczają z zapasem,
//     samych jabłek trzeba najwyżej sześciu,
//   sen             - pierwszego dnia senność dopiero po zmroku; po nocy
//     na ziemi senność od popołudnia, ale "niewyspany" dopiero po 19:00;
//     posłanie i łóżko dają spokojny dzień,
//   upadki, oddech, skoki - rozsądne kary.
//
// Uruchomienie: node tools/sprawdz_balans.mjs          (cele)
//               node tools/sprawdz_balans.mjs --raport (pełne liczby)
// ------------------------------------------------------------
import assert from 'node:assert/strict';

const { Wellbeing, SLEEP_PLACES, BREATH_SECONDS, LIMP_MAX, REST_START, NIGHT_FROM, CONDITION_START } = await import('../src/game/Wellbeing.js');
const { FOODS, ROAST_SECONDS } = await import('../src/items/foods.js');
const { CAMPFIRE_BURN_SECONDS, CAMPFIRE_IGNITE_SECONDS } = await import('../src/game/CampfireState.js');
const { DAY_LENGTH_MINUTES, START_TIME_OF_DAY, BREAK_SECONDS, TOOL_SPEED } = await import('../src/config.js');

const REPORT = process.argv.includes('--raport');
const DAY = DAY_LENGTH_MINUTES * 60;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const between = (value, low, high, message) => check(value >= low && value <= high, `${message}: ${Number(value).toFixed(1)} (cel ${low}-${high})`);
const report = (...parts) => { if (REPORT) console.log(...parts); };

export const PROFILES = {
    spokojny: { walk: 0.45, sprint: 0.05, mine: 0.25, jumps: 6 },
    zwykły: { walk: 0.45, sprint: 0.2, mine: 0.25, jumps: 12 },
    biegacz: { walk: 0.25, sprint: 0.55, mine: 0.1, jumps: 20 }
};

// Gra "days" dób od rana pierwszego dnia. sleep: 'none' albo miejsce
// (21:00-6:00); eat(w, days, hour) - kiedy i co gracz je.
function simulate(profile, { days = 1, eat = null, sleep = 'none', comfort = 0 } = {}) {
    const start = START_TIME_OF_DAY;
    const w = Wellbeing.load(null, start, () => 0.5);
    const p = PROFILES[profile];
    const first = {};
    let t = start * DAY, jumps = 0, cycle = 0, asleepFrom = null;
    const dt = 0.5, end = (start + days) * DAY;
    while (t < end) {
        const now = t / DAY, hour = (now % 1) * 24;
        if (sleep !== 'none' && (hour >= 21 || hour < 6)) {
            asleepFrom ??= now;
            w.update(dt, { sleeping: true }, now);
            t += dt;
            continue;
        }
        if (asleepFrom !== null) {
            w.sleep((now - asleepFrom) * 24, sleep, comfort, now);
            asleepFrom = null;
        }
        cycle = (cycle + dt) % 60;
        const part = cycle / 60;
        const activity = { moving: part < p.walk + p.sprint, sprinting: part >= p.walk && part < p.walk + p.sprint,
            mining: part >= p.walk + p.sprint && part < p.walk + p.sprint + p.mine };
        jumps += p.jumps / 60 * dt;
        activity.jumps = Math.floor(jumps);
        jumps -= activity.jumps;
        for (const event of w.update(dt, activity, now)) {
            const minutes = (t - start * DAY) / 60;
            if (event.type === 'state') first[event.to] ??= minutes;
            if (event.type === 'rest') first[`rest:${event.to}`] ??= { day: Math.floor(now), hour };
            if (event.type === 'day') (first.days ??= []).push(event.change);
        }
        eat?.(w, now, hour);
        t += dt;
    }
    return { first, wellbeing: w };
}


// --- Pierwsze minuty: gracz, który nic nie je ----------------------------------------

{
    const none = Object.fromEntries(Object.keys(PROFILES).map((name) => [name, simulate(name, { days: 2 }).first]));
    for (const [name, first] of Object.entries(none)) {
        report(`bez jedzenia, ${name}: głodny po ${first.hungry.toFixed(1)} min, zmęczony po ${first.tired.toFixed(1)}, wyczerpany po ${first.exhausted.toFixed(1)}`);
    }
    between(none.zwykły.hungry, 7, 11, 'Zwykły gracz: burczenie w brzuchu po tylu minutach');
    between(none.zwykły.tired, 12, 18, 'Zwykły gracz: zmęczenie (pierwsza kara) po tylu minutach');
    between(none.zwykły.exhausted, 15, 24, 'Zwykły gracz: wyczerpanie po tylu minutach');
    between(none.spokojny.hungry, 9, 15, 'Spokojny gracz: burczenie');
    check(none.spokojny.tired >= 15, `Spokojny gracz ma kwadrans bez kary (${none.spokojny.tired.toFixed(1)} min)`);
    between(none.biegacz.hungry, 5, 9, 'Biegacz: burczenie');
    check(none.biegacz.tired >= 9, `Nawet biegacz nie męczy się w pierwszych minutach (${none.biegacz.tired.toFixed(1)} min)`);
    for (const first of Object.values(none)) {
        check(first.tired - first.hungry >= 3, `Od burczenia do kary mijają co najmniej 3 minuty (${(first.tired - first.hungry).toFixed(1)})`);
    }
    // Pierwsza doba nie obniża kondycji, druga bez jedzenia - tak.
    const starving = simulate('zwykły', { days: 2.8 });
    check(starving.first.days[0] === 0 && starving.first.days[1] < 0, `Pierwsza doba bez kary za posiłki, druga już nie (${starving.first.days.join(', ')})`);
    check(Wellbeing.load(null, START_TIME_OF_DAY).energy >= 0.75 * CONDITION_START, 'Na start ponad trzy czwarte zapasu');
}


// --- Zwykły dzień: ile trzeba jeść ------------------------------------------------------

{
    // Trzy pieczone posiłki o stałych porach.
    const threeMeals = (w, now, hour) => {
        w.mealsEaten ??= new Set();
        for (const at of [8, 13, 18]) {
            const key = `${Math.floor(now)}:${at}`;
            if (hour >= at && !w.mealsEaten.has(key)) { w.mealsEaten.add(key); w.eat('roasted_apple', now); }
        }
    };
    for (const name of ['spokojny', 'zwykły', 'biegacz']) {
        const { wellbeing, first } = simulate(name, { days: 4, sleep: 'mat', eat: threeMeals });
        report(`trzy pieczone posiłki, ${name}: energia po 4 dobach ${wellbeing.energy.toFixed(0)}, kondycja ${wellbeing.data.condition}, zmęczony: ${first.tired?.toFixed(0) ?? 'nigdy'}`);
        if (name !== 'biegacz') {
            check(first.tired === undefined && first.exhausted === undefined, `${name}: trzy pieczone posiłki dziennie - nigdy zmęczony`);
            check(wellbeing.data.condition > CONDITION_START, `${name}: kondycja rośnie (${wellbeing.data.condition})`);
        }
        else {
            check(first.exhausted === undefined, 'Biegacz na trzech posiłkach nie pada z wyczerpania');
        }
    }
    // Jedzenie "gdy zgłodnieję": ile sztuk na dobę.
    const perDay = (name, food) => {
        let eaten = 0;
        simulate(name, { days: 3, sleep: 'mat', eat: (w, now, hour) => {
            if (w.energy < 55 && hour > 6 && hour < 21 && w.canEat(food).ok) { w.eat(food, now); eaten++; }
        } });
        return eaten / 3;
    };
    const roasted = perDay('zwykły', 'roasted_apple'), apples = perDay('zwykły', 'jablon_jablko'), berries = perDay('zwykły', 'strawberry');
    report(`zwykły gracz na dobę: ${roasted.toFixed(1)} pieczonych jabłek albo ${apples.toFixed(1)} surowych, albo ${berries.toFixed(1)} truskawek`);
    between(roasted, 2, 3.4, 'Pieczonych jabłek na dobę (zwykły gracz)');
    between(apples, 3.5, 6, 'Surowych jabłek na dobę');
    between(berries, 6, 11, 'Truskawek na dobę');
    between(perDay('biegacz', 'roasted_apple'), 2.5, 4.4, 'Pieczonych jabłek na dobę (biegacz)');
    check(FOODS.roasted_apple.energy >= FOODS.jablon_jablko.energy * 1.6, 'Pieczenie się opłaca (ponad półtora raza więcej energii)');
}


// --- Sen -----------------------------------------------------------------------------------

{
    const fed = (w, now) => { if (w.energy < 55 && w.canEat('roasted_apple').ok) w.eat('roasted_apple', now); };
    const awake = simulate('zwykły', { days: 1.2, eat: fed }).first;
    report(`pierwsza doba bez snu: senny o ${awake['rest:sleepy'].hour.toFixed(1)}, niewyspany o ${awake['rest:worn'].hour.toFixed(1)}`);
    check(awake['rest:sleepy'].day === 0 && awake['rest:sleepy'].hour >= NIGHT_FROM - 1, `Pierwszego dnia senność przychodzi z wieczorem (${awake['rest:sleepy'].hour.toFixed(1)})`);
    check(awake['rest:worn'].hour >= 22 || awake['rest:worn'].day === 1, 'Zarwana noc: niewyspany dopiero późną nocą');

    // Stan o danej godzinie drugiego dnia po nocy w danym miejscu.
    const dayAfter = (place) => {
        const w = Wellbeing.load({ rest: SLEEP_PLACES[place].cap }, 1.25, () => 0.5);
        const at = {};
        for (let t = 1.25 * DAY; t < 1.92 * DAY; t += 1) {
            w.update(1, {}, t / DAY);
            const hour = Math.round((t / DAY % 1) * 24 * 100) / 100;
            for (const mark of [12, 15, 19, 21]) if (Math.abs(hour - mark) < 0.011) at[mark] = w.restState;
        }
        return at;
    };
    const ground = dayAfter('ground'), mat = dayAfter('mat'), bed = dayAfter('bed');
    report('po nocy na ziemi:', JSON.stringify(ground), '| na posłaniu:', JSON.stringify(mat), '| w łóżku:', JSON.stringify(bed));
    check(ground[12] === 'ok' && ground[19] === 'sleepy', 'Po nocy na ziemi: do południa w normie, wieczorem senny');
    check(ground[19] !== 'worn' && ground[21] === 'worn', 'Po nocy na ziemi "niewyspany" dopiero po zmroku');
    check(mat[15] === 'ok' && mat[19] === 'ok', 'Po nocy na posłaniu cały dzień w normie');
    check(bed[12] === 'rested' && bed[19] === 'ok' && bed[21] === 'ok', 'Po nocy w łóżku: wypoczęty do południa, w normie do nocy');
    check(SLEEP_PLACES.ground.cap < SLEEP_PLACES.mat.cap && SLEEP_PLACES.mat.cap < SLEEP_PLACES.bed.cap && REST_START > SLEEP_PLACES.ground.cap, 'Ziemia < posłanie < łóżko; start świata lepszy niż noc na ziemi');
}


// --- Upadki, oddech, skoki, czasy -----------------------------------------------------------

{
    const limp = (blocks) => Wellbeing.load(null, 0.3).fall(Math.sqrt(2 * 30 * blocks));
    report('utykanie (s) po upadku z 6, 8, 12, 20, 40 bloków:', [6, 8, 12, 20, 40].map((h) => Math.round(limp(h))).join(', '));
    check(limp(6) === 0, 'Upadek z 6 bloków jest bezpieczny');
    between(limp(8), 30, 75, 'Upadek z 8 bloków: sekundy utykania');
    between(limp(12), 75, 140, 'Upadek z 12 bloków');
    check(limp(40) === LIMP_MAX && LIMP_MAX <= 300, 'Najdłuższe utykanie: najwyżej 5 minut');
    between(BREATH_SECONDS, 20, 35, 'Oddech pod wodą (sekundy)');
    // Skoki: wejście na wzgórze (50 skoków) nie może kosztować więcej niż 6 punktów.
    const jumper = Wellbeing.load({ energy: 100 }, 0.3);
    jumper.update(0.001, { jumps: 50 }, 0.3);
    between(100 - jumper.energy, 3, 6, '50 skoków: punkty energii');
    // Czasy, które gracz odczuwa w pierwszych minutach.
    between(BREAK_SECONDS.wood, 1.5, 3, 'Pień gołą ręką (sekundy)');
    between(BREAK_SECONDS.stone, 1.8, 3.5, 'Skała gołą ręką');
    check(BREAK_SECONDS.wood / TOOL_SPEED <= 1 && BREAK_SECONDS.stone / TOOL_SPEED <= 1, 'Z narzędziem blok pęka w niecałą sekundę');
    between(ROAST_SECONDS, 3, 6, 'Pieczenie jednej sztuki');
    between(CAMPFIRE_IGNITE_SECONDS, 3, 7, 'Rozpalanie ogniska trawą');
    // Ognisko ma starczyć na prawie całą noc (10 godzin gry).
    const night = 10 / 24 * DAY;
    between(CAMPFIRE_BURN_SECONDS / night, 0.8, 1.3, 'Ognisko pali się przez taką część nocy');
}

console.log(`OK: strojenie liczb - ${checks} celów spełnionych (pierwsze minuty, zwykły dzień, sen, upadki, oddech, czasy).`);
