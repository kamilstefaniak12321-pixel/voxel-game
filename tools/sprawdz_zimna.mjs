// ------------------------------------------------------------
// SPRAWDZENIE ZIMNA I ZAMARZANIA (1.26.0)
//
// - odczuwalna temperatura: części (schronienie, wiatr, woda, ogień,
//   pochodnie, jedzenie), zasięgi i pułapy,
// - wychłodzenie: tempo, pułap powyżej zera i we śnie, ruch i żołądek,
//   rozgrzewanie, stopnie i ich skutki (spowolnienie, szron, zużycie
//   energii), zdarzenia, zapis,
// - jedzenie: ciepło w brzuchu z potraw i naparów, chili,
// - bryła lodu (Freeze.js): fazy, przyspieszony czas do odwilży (bez
//   migania dnia i nocy), gra ze znajomymi (czekanie, ratunek ogniem,
//   wszyscy w lodzie), odmarznięcie,
// - sen na mrozie, sieć (flaga), dźwięki, tekstura, komenda,
//   osiągnięcia, poradnik, dokumenty, podłączenie w grze.
//
// Uruchomienie: node tools/sprawdz_zimna.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const W = await import('../src/game/Warmth.js');
const WB = await import('../src/game/Wellbeing.js');
const { Freeze, lapseSeconds, LAPSE_COVERED, THAW_TEMP, THAW_HEAT, FREEZE_SECONDS, THAW_SECONDS } = await import('../src/game/Freeze.js');
const { Wellbeing, COLD_STATES, COLD_COMFORT, COLD_CAP_ABOVE_ZERO, COLD_CAP_ASLEEP, THAW_CHILL, SLEEP_WARMTH } = WB;
const { EFFECTS } = await import('../src/items/effects.js');
const { FOODS, TEAS } = await import('../src/items/foods.js');
const R = await import('../src/blocks/BlockRegistry.js');
const P = await import('../src/net/protocol.js');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { WeatherField } = await import('../src/weather/WeatherField.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');
const { DAY_LENGTH_MINUTES } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, tolerance, message) => check(Math.abs(a - b) <= tolerance, `${message} (${a} ≈ ${b})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = textureManifest();
const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;


// --- Odczuwalna temperatura ---------------------------------------------------------

{
    const { feltTemperature, falloff, fireHeat, blocksHeat, blockHeat } = W;
    const open = feltTemperature({ air: -5, sky: 15, wind: 4 });
    check(open.felt === -5 - W.WIND_CHILL * 4 && open.shelter === 0 && open.wind === -W.WIND_CHILL * 4, 'Otwarte pole: powietrze i wiatr');
    const room = feltTemperature({ air: -5, sky: 0, wind: 20 });
    check(room.felt === -5 + W.SHELTER && room.wind === 0, 'Zamknięta izba: cieplej o SHELTER, wiatr nie wieje');
    check(feltTemperature({ air: 0, sky: 15, wind: 100 }).wind === -W.WIND_MAX, 'Wiatr ma pułap');
    check(feltTemperature({ air: 10, water: true }).felt === 10 - W.WATER_CHILL, 'W wodzie zimniej');
    check(feltTemperature({ air: -10, heat: 22, food: 6 }).felt === 18, 'Ogień i jedzenie się dodają');
    check(feltTemperature().felt === 10 && Object.keys(feltTemperature()).join() === 'air,shelter,wind,water,heat,food,clothes,felt', 'Domyślnie 10°C, wszystkie części');
    check(falloff(10, 0.5, 1, 4) === 10 && falloff(10, 2.5, 1, 4) === 5 && falloff(10, 4, 1, 4) === 0 && falloff(10, NaN, 1, 4) === 0, 'Ciepło słabnie z odległością');

    const fires = new Map([
        ['a', { x: 0, y: 0, z: 0, phase: 'burning' }],
        ['b', { x: 40, y: 0, z: 0, phase: 'collapsing' }],
        ['c', { x: 80, y: 0, z: 0, phase: 'unlit' }]
    ]);
    check(fireHeat(fires, 0.5, 0.9, 0.5) === W.FIRE_HEAT, 'Tuż przy płonącym ognisku - pełne ciepło');
    check(fireHeat(fires, 40.5, 0.9, 0.5) === W.FIRE_HEAT * W.EMBERS, 'Żar grzeje o połowę słabiej');
    check(fireHeat(fires, 80.5, 0.9, 0.5) === 0 && fireHeat(fires, 0.5 + W.FIRE_REACH + 0.1, 0.9, 0.5) === 0 && fireHeat(null, 0, 0, 0) === 0, 'Zgaszone i dalekie nie grzeją');
    const middle = fireHeat(fires, 0.5 + 4, 0.9, 0.5);
    check(middle > 0 && middle < W.FIRE_HEAT, `Cztery bloki od ogniska - trochę (${middle.toFixed(1)}°C)`);

    const torch = R.getBlockId('torch');
    check(blockHeat(torch) === W.TORCH_HEAT && blockHeat(R.getBlockId('lamp')) === W.TORCH_HEAT && blockHeat(R.getBlockId('lamp_red')) === W.TORCH_HEAT &&
        blockHeat(R.getBlockId('meteorite')) > 0 && blockHeat(R.getBlockId('stone')) === 0 && blockHeat(0) === 0, 'Co grzeje: pochodnie, lampy, meteoryt');
    const cells = new Map();
    const world = { getBlockId: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0 };
    cells.set('1,0,0', torch);
    check(blocksHeat(world, 0.5, 0.5, 0.5) === W.TORCH_HEAT, 'Pochodnia obok');
    for (let i = 0; i < 6; i++) cells.set(`0,${i},1`, torch);
    check(blocksHeat(world, 0.5, 0.5, 0.5) === W.BLOCKS_MAX, 'Wiele pochodni - najwyżej BLOCKS_MAX');
    check(blocksHeat({ getBlockId: () => 0 }, 0, 0, 0) === 0, 'Bez pochodni - nic');
}


// --- Przyszła odwilż w prawdziwym polu pogody ------------------------------------------------

{
    const field = new WeatherField(12345);
    // Najzimniejsza chwila w roku (zima) i szukanie odwilży od niej.
    let coldest = 0, coldTemp = Infinity;
    for (let t = 0; t < 32; t += 1 / 24) { const air = W.airAt(field, 500, 64, 500, t); if (air < coldTemp) { coldTemp = air; coldest = t; } }
    check(coldTemp < -5, `Gdzieś w roku jest mróz (${coldTemp.toFixed(1)}°C)`);
    const thaw = W.findWarm(field, 500, 64, 500, coldest, THAW_TEMP);
    check(thaw > coldest && W.airAt(field, 500, 64, 500, thaw) >= THAW_TEMP, `Odwilż po ${(thaw - coldest).toFixed(2)} doby`);
    for (let t = coldest + 1 / 24; t < thaw - 1e-9; t += 1 / 24) check(W.airAt(field, 500, 64, 500, t) < THAW_TEMP, 'Wcześniej nie było odwilży');
    check(W.findWarm(field, 500, 64, 500, coldest, THAW_TEMP, 100) === coldest + 1 / 24, 'Z dużym dodatkiem - od razu');
    const never = W.findWarm({ sample: (x, z, t) => ({ temp: -20 + Math.sin(t) }) }, 0, 0, 0, 0, 5, 0, { limit: 4 });
    check(never > 0 && never <= 4 + 1 / 24, 'Gdy nigdy nie jest ciepło - najcieplejsza chwila w zakresie');
    const fake = W.findWarm({ sample: (x, z, t) => ({ temp: t > 3 ? 10 : -10 }) }, 0, 0, 0, 0, THAW_TEMP);
    near(fake, 3 + 1 / 24, 1e-6, 'Pierwsza ciepła godzina');
    check(W.airAt({ sample: () => ({ temp: 10 }) }, 0, 200, 0, 0) < 10, 'Wysoko zimniej');
    const started = performance.now();
    W.findWarm(field, 500, 64, 500, coldest, 99);
    check(performance.now() - started < 400, 'Rok szukania mieści się w ułamku sekundy');
}


// --- Wychłodzenie --------------------------------------------------------------------------

const make = (saved = null, days = 1) => Wellbeing.load(saved, days, () => 0.5);
const freezeTime = (felt, activity = {}) => {
    const w = make({ energy: 60, condition: 100, rest: 80 });
    let t = 0;
    while (w.chill < 100 && t < 5000) { w.update(1, { felt, ...activity }, 1); t++; }
    return t;
};

{
    check(COLD_COMFORT === 5 && Object.keys(COLD_STATES).join() === 'warm,chilly,cold', 'Stopnie zimna');
    const fast = freezeTime(-20), mid = freezeTime(-10), slow = freezeTime(-3);
    check(fast < mid && mid < slow, `Im zimniej, tym szybciej (${fast}, ${mid}, ${slow} s)`);
    check(mid >= 330 && mid <= 480, `-10°C: zamarznięcie po ${mid} s - mniej niż zimowa noc (${DAY_SECONDS * 10 / 24} s)`);
    check(fast >= 180, `-20°C: nie w mgnieniu oka (${fast} s)`);
    check(freezeTime(-10, { moving: true }) > mid && freezeTime(-10, { sprinting: true }) > freezeTime(-10, { moving: true }), 'Ruch grzeje');
    check(freezeTime(-10, { sprinting: true, swimming: true }) === mid, 'Pływanie nie grzeje');

    const above = make();
    for (let i = 0; i < 3000; i++) above.update(1, { felt: 2 }, 1);
    check(above.chill === COLD_CAP_ABOVE_ZERO && above.coldState === 'cold', 'Powyżej zera da się zmarznąć, ale nie zamarznąć');
    const summer = make();
    for (let i = 0; i < 3000; i++) summer.update(1, { felt: COLD_COMFORT + 1 }, 1);
    check(summer.chill === 0 && summer.coldState === 'warm', 'Chłodna letnia noc nie wychładza');
    const asleep = make();
    for (let i = 0; i < 3000; i++) asleep.update(1, { felt: -20, sleeping: true }, 1);
    check(asleep.chill === COLD_CAP_ASLEEP, 'We śnie nie zamarza się');

    // Rozgrzewanie: szybciej przy ogniu.
    const warm = (felt) => { const w = make({ chill: 90 }); let t = 0; while (w.chill > 0 && t < 5000) { w.update(1, { felt }, 1); t++; } return t; };
    const byFire = warm(25), inSun = warm(COLD_COMFORT + 1);
    check(byFire < inSun && byFire <= 90, `Przy ognisku rozgrzewa się szybko (${byFire} s, w zwykłym cieple ${inSun} s)`);

    // Zdarzenia: stopnie i zamarznięcie (raz).
    const w = make({ energy: 60 });
    const events = [];
    for (let i = 0; i < 600; i++) events.push(...w.update(1, { felt: -15 }, 1));
    const cold = events.filter((event) => event.type === 'cold');
    check(cold.map((event) => event.to).join() === 'chilly,cold', 'Zdarzenia: chłodno, potem zmarznięty');
    check(events.filter((event) => event.type === 'freeze').length === 1, 'Zamarznięcie zgłoszone raz');
    const loaded = make({ chill: 100 });
    check(loaded.update(1, { felt: -15 }, 1).some((event) => event.type === 'freeze'), 'Zapis z pełnym wychłodzeniem: zamarza od razu po wczytaniu');
    check(COLD_STATES.chilly.text && COLD_STATES.cold.text, 'Napisy ostrzeżeń');
    const back = [];
    for (let i = 0; i < 600; i++) back.push(...w.update(1, { felt: 30 }, 1));
    check(back.filter((event) => event.type === 'cold').map((event) => event.to).join() === 'chilly,warm', 'W cieple wraca');
    check(make().update(1, {}, 1).length === 0 && make().chill === 0, 'Bez temperatury (stary zapis, testy) - bez zmian');

    // Skutki.
    const at = (chill) => make({ chill, energy: 60, condition: 100, rest: 80 });
    check(at(0).effects === WB.STATES[at(0).state] && at(0).frost === 0, 'Ciepło: zwykłe skutki, bez szronu');
    check(at(40).effects.work < at(0).effects.work && at(40).effects.walk === at(0).effects.walk && at(40).frost === 0, 'Chłód: trochę wolniejsza praca');
    const slow70 = at(70).effects.walk, slow95 = at(95).effects.walk;
    check(slow70 < 1 && slow95 < slow70 && slow95 > 0.4 && !at(95).effects.canSprint && at(70).effects.canSprint, `Zmarznięty: coraz wolniejszy (${slow70.toFixed(2)}, ${slow95.toFixed(2)}), bez biegu pod koniec`);
    check(at(75).frost > 0 && at(100).frost === 1 && at(50).frost === 0, 'Szron rośnie od połowy');
    const drain = (chill) => { const x = at(chill); const before = x.energy; x.update(100, { felt: 30 }, 1); return before - x.energy; };
    check(drain(80) > drain(0) * 1.2, 'Zmarznięty szybciej traci energię (dreszcze)');
    const off = make({ chill: 90 });
    off.active = false;
    check(off.chill === 0 && off.coldState === 'warm' && off.effectSum('heat') === 0, 'Tryb kreatywny: bez zimna');

    // Zapis.
    check(Wellbeing.load({ chill: 250 }).data.chill === 100 && Wellbeing.load({ chill: -3 }).data.chill === 0 && Wellbeing.load({ chill: 'x' }).data.chill === 0 && Wellbeing.load(null).data.chill === 0, 'Wychłodzenie w zapisie');
    const described = at(70).describe();
    check(described.cold === 'zmarznięty' && described.chill === 70, 'Opis do okna statusu');

    // Odmarznięcie i przeskok dób.
    const thawed = make({ chill: 100, energy: 90, fullness: 300, condition: 100 });
    thawed.thawed();
    check(thawed.chill === THAW_CHILL && thawed.energy <= 5 && thawed.data.fullness === 0 && thawed.coldState === 'chilly', 'Po odmarznięciu: wyczerpany, głodny, zziębnięty');
    const skipped = make({ condition: 100, mealsToday: 2 }, 3.2);
    skipped.skipTo(14.6);
    const after = skipped.update(1, {}, 14.6);
    check(skipped.data.day === 14 && skipped.condition === 100 && !after.some((event) => event.type === 'day'), 'Dni w lodzie nie obniżają kondycji');
}


// --- Ciepło z jedzenia --------------------------------------------------------------------

{
    check(EFFECTS.warmth.heat > 0 && EFFECTS.warm.heat > 0 && EFFECTS.warmth.hours >= 2, 'Ciepło w brzuchu i rozgrzanie grzeją');
    for (const [type, food] of Object.entries(FOODS)) {
        if (type.startsWith('dish_')) check(food.effects.includes('warmth'), `${type}: potrawa z garnka grzeje`);
        if (food.kind === 'drink') check(food.effects.includes('warmth'), `${type}: napar grzeje`);
    }
    for (const { tea } of Object.values(TEAS)) check(FOODS[tea].effects[0] !== 'warmth', `${tea}: dalej przede wszystkim swój efekt`);
    check(!FOODS.raspberry.effects.includes('warmth') && !FOODS.roasted_apple.effects.includes('warmth'), 'Owoce i pieczone nie grzeją od środka');
    const w = make({ energy: 40 });
    w.eat('dish_pumpkin_soup', 1);
    check(w.effectSum('heat') === EFFECTS.warmth.heat, 'Zupa grzeje');
    w.eat('chili_pepper', 1);
    check(w.effectSum('heat') === EFFECTS.warmth.heat + EFFECTS.warm.heat, 'Zupa i chili - ciepło się dodaje');
}


// --- Bryła lodu ---------------------------------------------------------------------------------

function fakeGame({ net = null, air = -12, heat = 0, field = null } = {}) {
    const messages = [], achieved = [], sounds = [];
    const game = {
        net,
        time: { days: 30.9 },
        player: { pos: { x: 0.5, y: 64, z: 0.5 }, vel: { set() {} } },
        wellbeing: make({ chill: 100, energy: 70, fullness: 200 }, 30.9),
        warmth: { heat, parts: { air, shelter: 0, water: 0, heat, wind: 0, food: 0, felt: air + heat }, update() { return this.parts; } },
        weather: { field: field ?? { sample: (x, z, t) => ({ temp: t >= 33 ? 6 : -12 }) } },
        sleep: { cancel() { this.cancelled = true; } },
        advanced: 0,
        advanceWorld(seconds) { this.advanced += seconds; },
        onMessage: (text) => messages.push(text),
        achieve: (name, data) => achieved.push([name, data]),
        sounds: { play: (name) => sounds.push(name) },
        stopMining() {}
    };
    return { game, messages, achieved, sounds, freeze: new Freeze(game) };
}

const run = (freeze, seconds, step = 0.05) => { for (let t = 0; t < seconds; t += step) freeze.update(step); };

{
    check(lapseSeconds(0.3) >= 2 && 0.3 / lapseSeconds(0.3) <= 0.25 && lapseSeconds(LAPSE_COVERED) / 1 <= 5, 'Krótki przeskok: wolno, bez migania (najwyżej ćwierć doby na sekundę)');
    check(lapseSeconds(20) <= 9 && lapseSeconds(2) >= 3, 'Długi przeskok: kilka sekund');

    // Gra solo: lód, przyspieszony czas do odwilży, odmarznięcie.
    const t = fakeGame();
    check(t.freeze.start() && t.freeze.phase === 'freezing' && t.game.sleep.cancelled && t.sounds.includes('ice_freeze') && t.achieved[0][0] === 'frozen', 'Zamarza: dźwięk, osiągnięcie, sen przerwany');
    check(!t.freeze.start(), 'Drugi raz nie zaczyna');
    check(t.freeze.ice === 0 && t.freeze.overlay > 0.5, 'Lód dopiero rośnie, obraz już szronieje');
    run(t.freeze, FREEZE_SECONDS / 2);
    check(t.freeze.ice > 0.2 && t.freeze.ice < 0.8, `Lód w połowie (${t.freeze.ice.toFixed(2)})`);
    run(t.freeze, FREEZE_SECONDS / 2 + 0.1);
    check(t.freeze.phase === 'frozen' && t.freeze.ice === 1, 'Cała bryła');
    run(t.freeze, 1.3);
    check(t.freeze.phase === 'lapse' && t.freeze.lapse.to > 33 && t.freeze.lapse.to <= 33 + 1 / 24 + 1e-9, 'Czas biegnie do pierwszej ciepłej godziny');
    check(t.freeze.lapse.covered && t.freeze.overlay === 1, 'Długi przeskok: obraz zakryty lodem');
    const from = t.game.time.days;
    run(t.freeze, t.freeze.lapse.seconds / 2);
    const progress = t.freeze.progress;
    check(t.game.time.days > from && t.game.time.days < t.freeze.lapse.to && progress.days > 0 && progress.total > 2, 'Zegar biegnie, licznik dni rośnie');
    run(t.freeze, t.freeze.lapse.seconds / 2 + 0.1);
    check(t.freeze.phase === 'thaw' && t.game.time.days === t.freeze.lapse.to, 'Odwilż dokładnie o pierwszej ciepłej godzinie');
    near(t.game.advanced, (t.game.time.days - 30.9) * DAY_SECONDS, 1e-6, 'Świat przeliczony za cały czas w lodzie');
    check(t.sounds.includes('ice_crack') && t.game.wellbeing.data.day === Math.floor(t.game.time.days), 'Lód pęka; doba bez kary');
    run(t.freeze, THAW_SECONDS + 0.1);
    check(!t.freeze.active && t.freeze.ice === 0 && t.game.wellbeing.chill === THAW_CHILL && t.game.wellbeing.energy <= 5, 'Po odwilży: wolny, wyczerpany, zziębnięty');
    check(t.achieved.some(([name, data]) => name === 'thawed' && !data.rescued && data.days > 2) && /Minęło \d+ dni/.test(t.messages.at(-1)), 'Napis, ile minęło');

    // Krótki przeskok (noc): obraz nie jest zakryty.
    const night = fakeGame({ field: { sample: (x, z, t) => ({ temp: t >= 31.2 ? 5 : -8 }) } });
    night.freeze.start();
    run(night.freeze, FREEZE_SECONDS + 1.4);
    check(night.freeze.phase === 'lapse' && !night.freeze.lapse.covered && night.freeze.overlay < 1, 'Noc w lodzie: widać wschód słońca przez lód');

    // Ciepło obok - odtaje bez przeskoku.
    const fire = fakeGame({ heat: 20 });
    fire.freeze.start();
    run(fire.freeze, FREEZE_SECONDS + 1.4);
    check(fire.freeze.phase === 'thaw' && fire.game.advanced === 0, 'Ognisko obok - lód puszcza od razu');

    // Gra ze znajomymi - gość czeka.
    const guest = fakeGame({ net: { isHost: false, players: { players: new Map() } } });
    guest.freeze.start();
    run(guest.freeze, FREEZE_SECONDS + 5);
    check(guest.freeze.phase === 'frozen' && guest.freeze.waiting && guest.game.time.days === 30.9, 'Gość czeka w lodzie, czas płynie zwyczajnie');
    guest.game.warmth.heat = THAW_HEAT;
    guest.game.warmth.parts.heat = THAW_HEAT;
    run(guest.freeze, 0.1);
    check(guest.freeze.phase === 'thaw' && guest.freeze.thawInfo.rescued, 'Ktoś postawił pochodnię - odtaje (ratunek)');
    run(guest.freeze, THAW_SECONDS + 0.1);
    check(guest.achieved.some(([name, data]) => name === 'thawed' && data.rescued) && /Ktoś cię ogrzał/.test(guest.messages.at(-1)), 'Napis o ratunku');
    const weather = fakeGame({ net: { isHost: false, players: { players: new Map() } } });
    weather.freeze.start();
    run(weather.freeze, FREEZE_SECONDS + 2);
    weather.game.warmth.parts.air = THAW_TEMP + 1;
    run(weather.freeze, 0.1);
    check(weather.freeze.phase === 'thaw' && !weather.freeze.thawInfo.rescued, 'Samo zrobiło się ciepło - bez ratunku');

    // Gospodarz: czas przyspiesza dopiero, gdy wszyscy są w lodzie.
    const others = new Map([['a', { state: { frozen: true } }], ['b', { state: { frozen: false } }]]);
    const host = fakeGame({ net: { isHost: true, players: { players: others }, timeChanged() { this.changed = true; } } });
    host.freeze.start();
    run(host.freeze, FREEZE_SECONDS + 3);
    check(host.freeze.phase === 'frozen' && host.freeze.waiting, 'Gospodarz czeka, gdy ktoś jeszcze chodzi');
    others.get('b').state.frozen = true;
    run(host.freeze, 0.1);
    check(host.freeze.phase === 'lapse', 'Wszyscy w lodzie - czas przyspiesza');
    run(host.freeze, host.freeze.lapse.seconds + 0.2);
    check(host.game.net.changed, 'Goście dostają nowy czas');

    // Ratownik: inny gracz odtajał obok.
    const near_ = { distanceTo: () => 3 };
    const watcher = fakeGame({ net: { isHost: false, players: { players: new Map([['x', { pos: near_, state: { frozen: true } }]]) } } });
    watcher.freeze.watch();
    watcher.game.net.players.players.get('x').state.frozen = false;
    watcher.freeze.update(0.1);
    check(watcher.achieved.some(([name]) => name === 'rescued'), 'Osiągnięcie Ratownik');

    // Komenda i bezpieczeństwo.
    const cancel = fakeGame();
    cancel.freeze.start();
    cancel.freeze.cancel();
    check(!cancel.freeze.active && cancel.freeze.ice === 0, 'Przerwanie');
    const creative = fakeGame();
    creative.game.wellbeing.active = false;
    check(!creative.freeze.start(), 'Tryb kreatywny: nie zamarza');
}


// --- Sen na mrozie ----------------------------------------------------------------------------------

{
    const night = (place, felt) => { const w = make({ chill: 0, rest: 30 }); w.sleep(9, place, 0, 2.25, felt); return w.chill; };
    check(night('ground', -10) === COLD_CAP_ASLEEP, 'Noc na gołej ziemi na mrozie: budzisz się zmarznięty (nie w lodzie)');
    check(night('bed', -10) < night('ground', -10) || night('bed', -10) === COLD_CAP_ASLEEP, 'W łóżku cieplej');
    check(night('bed', 0) < night('ground', 0) && SLEEP_WARMTH.bed > SLEEP_WARMTH.mat && SLEEP_WARMTH.mat > SLEEP_WARMTH.ground, 'Łóżko > posłanie > ziemia');
    check(night('ground', 20) === 0 && night('ground', null) === 0, 'Ciepła noc i brak temperatury - bez zimna');
    const sleep = read('src/game/Sleep.js');
    check(sleep.includes('const felt = this.skipped ? game.warmth?.update(0, true).felt : null;') && sleep.includes('game.freeze?.active'), 'Sen: zimno przy przeskoku nocy; w lodzie się nie śpi');
}


// --- Sieć, obraz, dźwięki, podłączenie ----------------------------------------------------------------

{
    const player = { pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
    check(P.unpackPlayer(P.packPlayer(player, null, 0, false, false, '', true)).frozen === true && P.unpackPlayer(P.packPlayer(player, null, 0)).frozen === false &&
        P.unpackPlayer(P.packPlayer(player, null, 0, true, true, '', false)).sleeping === true, 'Flaga "zamarznięty" w stanie gracza');
    check(read('src/net/NetSession.js').includes('Boolean(game.freeze?.active)'), 'Gra wysyła flagę');
    const remote = read('src/net/RemotePlayers.js');
    check(remote.includes('entry.model.setIce(entry.ice)') && remote.includes('if (!frozen) {'), 'Inni gracze widzą bryłę lodu i zastygłą pozę');
    const model = read('src/player/PlayerModel.js');
    check(model.includes("getAtlasUV('ice_block')") && /setIce\(amount\) \{/.test(model) && model.includes('material.transparent = true'), 'Model: przezroczysta bryła z tekstury lodu');
    check(manifest.tiles.ice_block && manifest.regions.ice_block, 'Tekstura bryły lodu w atlasie');
    for (const name of ['ice_freeze', 'ice_crack', 'shiver']) {
        check(SOUNDS[name] && SOUNDS[name].files.every((file) => existsSync(new URL(`../assets/sounds/${file}`, import.meta.url))), `Dźwięk ${name}`);
    }
    const game = read('src/game/Game.js');
    check(game.includes('this.warmth = new Warmth(this);') && game.includes('this.freeze = new Freeze(this);') && game.includes('const iced = this.freeze.update(dt);') &&
        game.includes('this.warmth.update(dt);') && game.includes('this.model.setIce(this.freeze.ice);') && game.includes("if (this.freeze.phase !== 'lapse') this.time.update(dt);") &&
        game.includes('if (this.freeze.waiting) this.player.updateLook(this.input);'), 'Gra: ciepło, bryła lodu, zegar, rozglądanie się');
    const interaction = read('src/game/GameInteraction.js');
    check(interaction.includes("event.type === 'freeze'") && interaction.includes('this.freeze?.start();') && interaction.includes('felt: this.warmth') &&
        interaction.includes('this.freeze?.active'), 'Zdarzenia zimna i wychłodzenie w pętli samopoczucia');
    const panel = read('src/ui/StatusPanel.js');
    check(panel.includes('showFrost(') && panel.includes("'heart-cold'") && panel.includes("['Ciepło',") && read('index.html').includes('<div id="frost">') &&
        read('src/ui/hud.css').includes('#frost.deep'), 'Obraz: szron, lód, płatek przy sercu, wiersz w oknie statusu');
}


// --- Komenda, osiągnięcia, poradnik, dokumenty ------------------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.frozen_solid.on === 'frozen' && byId.warmed_up.on === 'warmedUp' && byId.rescuer.on === 'rescued', 'Osiągnięcia: Sopel lodu, Grzanie rąk, Ratownik');
    for (const id of ['frozen_solid', 'warmed_up', 'rescuer']) check(itemExists(byId[id].icon), `${id}: ikonka`);
    const commands = read('src/commands/worldCommands.js');
    check(/name: 'zimno'/.test(commands) && commands.includes("word === 'zamarznij'") && commands.includes("word === 'odmroz'") && read('docs/komendy.md').includes('`/zimno`'), 'Komenda /zimno z opisem');
    const chapter = GUIDE.find((entry) => entry.id === 'cold');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(text.includes('ognisko') && text.includes('bryle lodu') && text.includes('ze znajomymi') && text.includes('łóżku'), 'Poradnik: rozdział o zimnie');
    check(read('docs/zimno.md').includes('Sopel lodu') && read('CHANGELOG.md').includes('## 1.26.0') && read('docs/plan.md').includes('1.27.0'), 'Dokumenty i plan');
}

console.log(`OK: zimno i zamarzanie - ${checks} sprawdzeń (odczuwalna temperatura, odwilż w pogodzie, wychłodzenie, jedzenie, bryła lodu, gra ze znajomymi, sen, sieć, obraz, dźwięki).`);
