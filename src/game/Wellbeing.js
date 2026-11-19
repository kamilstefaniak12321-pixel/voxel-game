// ------------------------------------------------------------
// ENERGIA I SAMOPOCZUCIE (0.94.0)
//
// W grze nie ma śmierci - są skutki. Ten plik liczy dwie rzeczy:
//
//   energia  - paliwo. Ubywa cały czas, szybciej przy wysiłku (bieg,
//              pływanie, kopanie, skoki). Wraca tylko z jedzenia
//              (src/items/foods.js). Mieści się jej tyle, ile wynosi
//              kondycja.
//   kondycja - "codzienna energia": ile zapasu ciało potrafi zmieścić
//              (60-130, na początku 100). Zmienia się raz na dobę gry:
//              rośnie, gdy gracz je regularnie (trzy posiłki w odstępach),
//              powoli spada, gdy je za mało.
//
// Z ilości energii wynika stan (STATES): świetnie, dobrze, głodny,
// zmęczony, wyczerpany - a z niego skutki (effects): szybkość biegu
// i pracy, przyciemnienie obrazu. Głodnemu burczy w brzuchu.
//
// Posiłek to wszystko, co gracz zje w krótkim czasie (MEAL_WINDOW).
// Liczy się, gdy da razem co najmniej MEAL_ENERGY energii i minęło
// MEAL_GAP od poprzedniego - objadanie się daje energię, ale nie
// poprawia kondycji.
//
// Od 0.97.0 dochodzą dwa skutki nieuwagi (zamiast obrażeń i śmierci):
//
//   upadek   - twarde lądowanie (fall) tłucze nogę: gracz przez jakiś
//              czas utyka - chodzi wolniej i nie biega. Im wyższy
//              upadek, tym dłużej; odpoczynek i pełny żołądek skracają.
//   tonięcie - pod wodą ubywa oddechu (breath). Gdy się skończy,
//              update zgłasza 'drown': gra gasi obraz i budzi gracza
//              na brzegu (Game.startBlackout), a blackout() zostawia
//              mu resztkę energii.
//
// Od 0.98.0 jest też wyspanie (rest, 0-100): ubywa, gdy gracz nie śpi
// (nocą szybciej), wraca we śnie (sleep) - tym lepiej, im wygodniej:
// na gołej ziemi słabo, na posłaniu dobrze, w pościelonym łóżku do
// pełna i z premią za wygodę na następny dzień (comfort). Niewyspany
// pracuje i biega wolniej. Zasypianie i noc: game/Sleep.js.
//
// Od 1.26.0 jest wychłodzenie (chill, 0-100): rośnie, gdy odczuwalna
// temperatura (game/Warmth.js - activity.felt) jest poniżej COLD_COMFORT,
// i spada, gdy jest cieplej. Stopnie (COLD_STATES): ciepło, chłód
// (dreszcze), zmarznięty (coraz wolniejszy, szron na brzegach obrazu).
// Pełne wychłodzenie (100) to zamarznięcie - update zgłasza 'freeze',
// a gra zamienia gracza w bryłę lodu (game/Freeze.js). Zamarznąć da się
// tylko na mrozie (odczuwalnie poniżej zera); w chłodzie powyżej zera
// wychłodzenie staje na COLD_CAP_ABOVE_ZERO.
//
// Sama logika, bez grafiki i dźwięku (testy: tools/sprawdz_energie.mjs,
// tools/sprawdz_zimna.mjs).
// Stan trafia do zapisu świata (worldInfo.wellbeing).
// ------------------------------------------------------------

import { getFood } from '../items/foods.js';
import { EFFECTS, getEffect } from '../items/effects.js';

export const CONDITION_MIN = 60;
export const CONDITION_MAX = 130;
export const CONDITION_START = 100;
// Zapas na start świata. Strojenie 0.99.0 (tools/sprawdz_balans.mjs):
// gracz, który nic nie je, ma usłyszeć burczenie po 7-11 minutach,
// a zmęczyć się nie wcześniej niż po kwadransie.
const ENERGY_START = 80;

// Zużycie energii na sekundę w spoczynku (doba gry to 1200 s, więc
// samo siedzenie zjada ok. 30 energii na dobę) i mnożniki wysiłku.
const REST_DRAIN = 0.025;
const DRAIN = { walk: 1.5, sprint: 3.2, swim: 3.2 };
const MINING_DRAIN = 0.05;
// Skok kosztuje tyle, co ok. sekunda biegu (0.99.0: było 0.2 - samo
// chodzenie po pagórkach zjadało prawie połowę energii).
const JUMP_COST = 0.1;
const FULL_DRAIN = 0.8;       // najedzony zużywa mniej
const GREAT_DRAIN = 0.9;      // w świetnej formie też
const FULLNESS_MAX = 600;
// Od tylu sekund sytości żołądek jest pełny - nie da się jeść dalej
// (nadmiar energii ponad kondycję przepada).
export const FULLNESS_LIMIT = 420;

// Posiłki (czas w dobach gry).
export const MEAL_ENERGY = 18;
export const MEAL_WINDOW = 0.04;
export const MEAL_GAP = 0.12;
export const MEALS_PER_DAY = 3;

// Zmiana kondycji po dobie z daną liczbą posiłków (0, 1, 2, 3 i więcej).
const CONDITION_CHANGE = [-5, -2, 1, 4];

// Upadek: od tej prędkości lądowania (bloki/s; ok. 7 bloków wysokości)
// noga jest stłuczona. Czas utykania rośnie z wysokością upadku.
export const LIMP_SPEED = 20.5;
const LIMP_SECONDS = 45;
const LIMP_PER_BLOCK = 12;
export const LIMP_MAX = 300;
const LIMP_WALK = 0.6;

// Ukłucie (kłująca roślina - mikołajek, 1.5.0): przez PRICK_SECONDS chód
// i bieg są trochę wolniejsze; kolejne ukłucie najwcześniej po
// PRICK_COOLDOWN sekundach. Nie zapisuje się (mija od razu).
export const PRICK_SECONDS = 2.5;
export const PRICK_COOLDOWN = 4;
const PRICK_SPEED = 0.72;
const LIMP_REST_HEAL = 2;      // stojąc, noga goi się 2 razy szybciej
const LIMP_FULL_HEAL = 1.25;   // najedzonemu też szybciej
const FALL_GRAVITY = 30;       // jak GRAVITY w config.js

// Oddech pod wodą: na ile sekund starcza i jak szybko wraca na powietrzu.
export const BREATH_SECONDS = 25;
const BREATH_RECOVER_SECONDS = 4;
// Po utonięciu zostaje tyle zapasu energii (część kondycji) - wyczerpanie.
const BLACKOUT_ENERGY = 0.05;

// Wyspanie: ile ubywa na sekundę, gdy gracz nie śpi (godzina gry to
// 50 s; cały dzień na nogach, 16 godzin, zjada ok. 60), i ile razy
// szybciej nocą.
export const REST_START = 80;
const REST_DRAIN_AWAKE = 60 / (16 * 50);
const REST_NIGHT_FACTOR = 1.6;
// Ile wyspania daje godzina snu w najlepszych warunkach.
const REST_PER_HOUR = 14;
// Sen jest oszczędny: tyle energii na godzinę snu (czuwanie: 1,25).
const SLEEP_ENERGY_PER_HOUR = 0.6;
const SLEEP_ENERGY_FACTOR = 0.5;
// Premia za wygodę działa tyle dób od pobudki i wymaga tylu godzin snu.
const COMFORT_DAYS = 0.6;
const COMFORT_MIN_HOURS = 4;

// Noc (do zasypiania i szybszego zmęczenia): od 19:00 do 5:00.
export const NIGHT_FROM = 19;
export const NIGHT_UNTIL = 5;

export function isNight(days) {
    const hour = (days - Math.floor(days)) * 24;
    return hour >= NIGHT_FROM || hour < NIGHT_UNTIL;
}

// Stany wyspania od najlepszego (from - od ilu punktów). Skutki mnożą
// się ze skutkami stanu energii.
export const REST_STATES = {
    rested: { label: 'wypoczęty', from: 70, sprint: 1, work: 1, dim: 0 },
    ok: { label: 'w normie', from: 35, sprint: 1, work: 1, dim: 0 },
    sleepy: { label: 'senny', from: 12, sprint: 0.85, work: 0.9, dim: 0 },
    worn: { label: 'niewyspany', from: 0, sprint: 0.6, work: 0.75, dim: 0.25 }
};
const REST_ORDER = ['rested', 'ok', 'sleepy', 'worn'];

// Gdzie gracz śpi: cap - do ilu punktów da się tam wyspać, rate - jak
// szybko (część REST_PER_HOUR). Łóżko liczy się dopiero pościelone.
export const SLEEP_PLACES = {
    // (cap 66: po nocy na ziemi gracz jest senny od popołudnia, ale
    // "niewyspany" robi się dopiero po zmroku - 0.99.0, było 60.)
    ground: { label: 'na gołej ziemi', cap: 66, rate: 0.5 },
    mat: { label: 'na posłaniu', cap: 90, rate: 0.85 },
    bed: { label: 'w łóżku', cap: 100, rate: 1 }
};

// Premia za wygodę po nocy w łóżku (poziom = comfort pościeli -
// blocks/bedding.js): szybsza praca i wolniejsze zużycie energii.
export const COMFORT = {
    1: { label: 'wygodny sen', work: 1.05, drain: 0.9 },
    2: { label: 'bardzo wygodny sen', work: 1.1, drain: 0.8 }
};

// Zimno (1.26.0). Od tej odczuwalnej temperatury (°C) w górę gracz się
// nie wychładza, tylko rozgrzewa (letnie noce bywają chłodne, ale nie
// mroźne). Poniżej wychłodzenie rośnie o (COLD_COMFORT - felt) /
// COLD_RATE na sekundę: przy -10°C od zera do zamarznięcia w niecałe
// 7 minut (mniej niż zimowa noc), przy -20°C w 4 minuty.
export const COLD_COMFORT = 5;
const COLD_RATE = 60;
// Rozgrzewanie: stałe tempo i więcej, im cieplej (przy ognisku szybko).
const WARM_BASE = 0.15;
const WARM_RATE = 15;
// Powyżej zera da się zmarznąć, ale nie zamarznąć; we śnie (łóżko,
// posłanie, ziemia) - też nie do końca: budzi się zmarznięty.
export const COLD_CAP_ABOVE_ZERO = 70;
export const COLD_CAP_ASLEEP = 85;
// Ruch grzeje: tyle razy wolniej się wychładza idący i biegnący.
const COLD_MOVING = 0.85;
const COLD_SPRINTING = 0.7;
// Wyczerpany marznie szybciej, najedzony wolniej.
const COLD_EXHAUSTED = 1.25;
const COLD_FULL = 0.85;
// Po odmarznięciu zostaje tyle wychłodzenia (chłód, nie mróz).
export const THAW_CHILL = 55;
// Sen: o ile cieplej śpi się w danym miejscu (koc, materac).
export const SLEEP_WARMTH = { ground: 0, mat: 4, bed: 8 };

// Stopnie wychłodzenia od najcieplejszego (from - od ilu punktów).
//   walk, sprint - mnożnik szybkości na początku stopnia (zmarznięty
//                  zwalnia dalej, aż do FROZEN_SLOW przy 100),
//   work, drain  - mnożniki pracy i zużycia energii.
export const COLD_STATES = {
    warm: { label: 'ciepło', from: 0, work: 1, drain: 1 },
    chilly: { label: 'chłodno', from: 30, work: 0.95, drain: 1.1, text: 'Robi ci się zimno - przydałby się ogień albo dach nad głową' },
    cold: { label: 'zmarznięty', from: 60, work: 0.85, drain: 1.3, text: 'Marzniesz! Ogrzej się przy ognisku, zanim zamarzniesz' }
};
const COLD_ORDER = ['cold', 'chilly', 'warm'];
// Zmarznięty: przy 100 punktach chodzi tak wolno (część zwykłej szybkości)
// i od tylu punktów nie biega.
const FROZEN_SLOW = 0.45;
const NO_SPRINT_CHILL = 85;

// Burczenie w brzuchu: co ile sekund (losowo z przedziału).
const RUMBLE_EVERY = [40, 80];

// Stany od najlepszego. from - od jakiej części zapasu (energia /
// kondycja); "świetnie" wymaga też dobrej kondycji (GREAT_CONDITION).
export const GREAT_CONDITION = 108;

export const STATES = {
    great: { label: 'Świetnie', from: 0.7, sprint: 1.25, work: 1.15, walk: 1, canSprint: true, dim: 0,
        text: 'Jesz regularnie i masz zapas sił. Biegasz szybciej, pracujesz sprawniej i wolniej się męczysz.' },
    good: { label: 'Dobrze', from: 0.4, sprint: 1, work: 1, walk: 1, canSprint: true, dim: 0,
        text: 'Wszystko w porządku.' },
    hungry: { label: 'Głodny', from: 0.22, sprint: 1, work: 1, walk: 1, canSprint: true, dim: 0,
        text: 'Burczy ci w brzuchu. Zjedz coś, zanim zabraknie sił.' },
    tired: { label: 'Zmęczony', from: 0.08, sprint: 0.5, work: 0.8, walk: 1, canSprint: true, dim: 0,
        text: 'Brakuje ci energii. Biegasz wolniej i wolniej kopiesz.' },
    exhausted: { label: 'Wyczerpany', from: 0, sprint: 0, work: 0.6, walk: 0.85, canSprint: false, dim: 0.7,
        text: 'Nie masz już sił. Możesz tylko iść, a praca idzie bardzo wolno. Zjedz cokolwiek.' }
};

const STATE_ORDER = ['great', 'good', 'hungry', 'tired', 'exhausted'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const number = (value, fallback) => Number.isFinite(value) ? value : fallback;


export class Wellbeing {

    // data - obiekt z zapisu (zmieniany w miejscu), days - czas gry w dobach.
    constructor(data, days = 0, random = Math.random) {
        this.data = data;
        this.random = random;
        this.active = true;
        this.rumbleIn = this.nextRumble();
        this.lastState = this.state;
        this.lastRest = this.restState;
        this.lastCold = this.coldState;
        // Czas gry z ostatniego update - do sprawdzania, czy efekt jeszcze działa.
        this.now = days;
        // Oddech (1 - pełny). Nie zapisuje się: po wejściu do świata pełny.
        this.breath = 1;
        this.drowned = false;
        // Ukłucie: ile sekund jeszcze trwa i ile do następnego możliwego.
        this.pricked = 0;
        this.prickWait = 0;
        if (!Number.isFinite(data.day) || data.day > Math.floor(days)) data.day = Math.floor(days);
    }

    // Z zapisu świata (albo nowy stan). Naprawia uszkodzone pola.
    static load(saved, days = 0, random = Math.random) {
        const source = saved && typeof saved === 'object' ? saved : {};
        const condition = clamp(number(source.condition, CONDITION_START), CONDITION_MIN, CONDITION_MAX);
        const meal = source.meal && typeof source.meal === 'object' && Number.isFinite(source.meal.last)
            ? { last: source.meal.last, energy: Math.max(0, number(source.meal.energy, 0)), counted: Boolean(source.meal.counted) }
            : null;
        const data = {
            energy: clamp(number(source.energy, Math.min(ENERGY_START, condition)), 0, condition),
            condition,
            fullness: clamp(number(source.fullness, 0), 0, FULLNESS_MAX),
            day: Number.isFinite(source.day) ? Math.floor(source.day) : Math.floor(days),
            // Doba, w której świat powstał (bez kary za za mało posiłków);
            // null - stary zapis albo ta doba już minęła.
            graceDay: Number.isFinite(source.graceDay) ? Math.floor(source.graceDay) : saved && typeof saved === 'object' ? null : Math.floor(days),
            mealsToday: clamp(Math.floor(number(source.mealsToday, 0)), 0, 99),
            lastMealAt: Number.isFinite(source.lastMealAt) ? source.lastMealAt : null,
            lastFood: typeof source.lastFood === 'string' ? source.lastFood : null,
            limp: clamp(number(source.limp, 0), 0, LIMP_MAX),
            rest: clamp(number(source.rest, REST_START), 0, 100),
            comfort: Object.hasOwn(COMFORT, source.comfort) ? Number(source.comfort) : 0,
            comfortUntil: Number.isFinite(source.comfortUntil) ? source.comfortUntil : 0,
            // Efekty z naparów: nazwa -> do kiedy działa (czas gry w dobach).
            effects: Object.fromEntries(Object.entries(source.effects && typeof source.effects === 'object' ? source.effects : {})
                .filter(([type, until]) => getEffect(type) && Number.isFinite(until))),
            meal,
            // Wychłodzenie (1.26.0, 0-100).
            chill: clamp(number(source.chill, 0), 0, 100),
            history: Array.isArray(source.history)
                ? source.history.filter(Number.isFinite).slice(-3).map((n) => clamp(Math.floor(n), 0, 99)) : []
        };
        return new Wellbeing(data, days, random);
    }

    get energy() { return this.data.energy; }
    get condition() { return this.data.condition; }
    get capacity() { return this.data.condition; }
    get full() { return this.data.fullness > 0; }

    get state() {
        const part = this.data.energy / this.capacity;
        for (const name of STATE_ORDER) {
            if (part < STATES[name].from) continue;
            if (name === 'great' && this.data.condition < GREAT_CONDITION) continue;
            return name;
        }
        return 'exhausted';
    }

    // Wychłodzenie (0-100) i jego stopień (COLD_STATES).
    get chill() { return this.active ? (this.data.chill ?? 0) : 0; }

    get coldState() {
        const chill = this.chill;
        for (const name of COLD_ORDER) if (chill >= COLD_STATES[name].from) return name;
        return 'warm';
    }

    // Szron na brzegach obrazu (0-1): od połowy wychłodzenia w górę.
    get frost() { return clamp((this.chill - 50) / 50, 0, 1); }

    // Skutki stanu (wyłączone - tryb kreatywny - jak "dobrze").
    get effects() {
        const state = STATES[this.active ? this.state : 'good'];
        const rest = this.active ? REST_STATES[this.restState] : REST_STATES.rested;
        const comfort = this.active ? COMFORT[this.data.comfort] : null;
        const boost = this.active ? this.effectFactor('work') : 1;
        const cold = COLD_STATES[this.coldState];
        if (!this.limping && rest.work === 1 && rest.dim === 0 && !comfort && boost === 1 && !(this.pricked > 0) && cold.work === 1) {
            return state;
        }
        const effects = { ...state, sprint: state.sprint * rest.sprint, work: state.work * rest.work * (comfort?.work ?? 1) * boost * cold.work,
            dim: Math.max(state.dim, rest.dim) };
        // Zmarznięty zwalnia tym bardziej, im bliżej zamarznięcia.
        if (this.coldState === 'cold') {
            const slow = 1 - (1 - FROZEN_SLOW) * clamp((this.chill - COLD_STATES.cold.from) / (100 - COLD_STATES.cold.from), 0, 1);
            effects.walk *= slow;
            effects.sprint *= slow;
            if (this.chill >= NO_SPRINT_CHILL) { effects.sprint = 0; effects.canSprint = false; }
        }
        // Stłuczona noga: wolniejszy chód i żadnego biegu, w każdym stanie.
        if (this.limping) Object.assign(effects, { walk: state.walk * LIMP_WALK, sprint: 0, canSprint: false });
        // Ukłucie: przez chwilę wolniej (chód i bieg).
        if (this.pricked > 0) { effects.walk *= PRICK_SPEED; effects.sprint *= PRICK_SPEED; }
        return effects;
    }

    get rest() { return this.data.rest; }

    get restState() {
        for (const name of REST_ORDER) if (this.data.rest >= REST_STATES[name].from) return name;
        return 'worn';
    }

    // Sen: hours godzin w miejscu place (klucz SLEEP_PLACES), comfort -
    // wygoda pościeli (tylko łóżko), days - czas gry przy pobudce.
    // Zwraca { rest, state, comfort } po śnie.
    // felt - odczuwalna temperatura w miejscu snu (1.26.0): na mrozie
    // śpiący się wychładza (w łóżku i na posłaniu mniej - SLEEP_WARMTH),
    // ale we śnie nie zamarza (COLD_CAP_ASLEEP).
    sleep(hours, place = 'ground', comfort = 0, days = this.data.day, felt = null) {
        const data = this.data, spot = SLEEP_PLACES[place] ?? SLEEP_PLACES.ground;
        if (!this.active || !(hours > 0)) return { rest: data.rest, state: this.restState, comfort: 0 };
        // Efekty snu (napar na sen): szybciej i wyżej. Liczy się efekt, który
        // działał przy zasypianiu; kończy się po porządnym śnie.
        const asleepAt = days - hours / 24;
        let rate = spot.rate, cap = spot.cap;
        for (const type of Object.keys(data.effects)) {
            const sleep = getEffect(type)?.sleep;
            if (!sleep || data.effects[type] <= asleepAt) continue;
            rate *= sleep.rate ?? 1;
            cap = Math.min(100, cap + (sleep.cap ?? 0));
            if (hours >= 1) delete data.effects[type];
        }
        this.now = days;
        // Godzina gry to 50 sekund (doba - DAY_LENGTH_MINUTES).
        if (Number.isFinite(felt)) this.cool(hours * 50, felt + (SLEEP_WARMTH[place] ?? 0), { sleeping: true });
        data.rest = Math.max(data.rest, Math.min(cap, data.rest + hours * REST_PER_HOUR * rate));
        data.energy = Math.max(0, data.energy - hours * SLEEP_ENERGY_PER_HOUR);
        data.fullness = Math.max(0, data.fullness - hours * 50);
        const earned = place === 'bed' && hours >= COMFORT_MIN_HOURS && Object.hasOwn(COMFORT, comfort) ? Number(comfort) : 0;
        data.comfort = earned;
        data.comfortUntil = earned ? days + COMFORT_DAYS : 0;
        this.lastRest = this.restState;
        return { rest: data.rest, state: this.restState, comfort: earned };
    }

    get limping() { return this.active && this.data.limp > 0; }

    // Kłująca roślina: lekki, krótki dyskomfort. Zwraca true, gdy ukłuło
    // (false - jeszcze boli po poprzednim albo tryb bez samopoczucia).
    prick() {
        if (!this.active || this.prickWait > 0) return false;
        this.pricked = PRICK_SECONDS;
        this.prickWait = PRICK_COOLDOWN;
        return true;
    }

    // --- Efekty (items/effects.js) ---------------------------------------

    // Włącza efekt na jego zwykły czas (od "days"); ponowne użycie odnawia.
    addEffect(type, days = this.now) {
        const effect = getEffect(type);
        if (!effect || !this.active) return false;
        this.data.effects[type] = days + effect.hours / 24;
        this.now = Math.max(this.now, days);
        return true;
    }

    // Nazwy efektów, które teraz działają.
    activeEffects() {
        return Object.keys(this.data.effects).filter((type) => getEffect(type) && this.data.effects[type] > this.now);
    }

    hasEffect(type) {
        return this.activeEffects().includes(type);
    }

    // Iloczyn mnożników "field" (drain, work, heal) działających efektów.
    effectFactor(field) {
        let factor = 1;
        for (const type of this.activeEffects()) factor *= EFFECTS[type][field] ?? 1;
        return factor;
    }

    // Suma pola "field" działających efektów (heat - ciepło, °C).
    effectSum(field) {
        if (!this.active) return 0;
        let sum = 0;
        for (const type of this.activeEffects()) sum += EFFECTS[type][field] ?? 0;
        return sum;
    }

    // --- Zimno (1.26.0) -----------------------------------------------------

    // Zmiana wychłodzenia przez dt sekund w odczuwalnej temperaturze felt.
    // activity jak w update. Zwraca nowe wychłodzenie.
    cool(dt, felt, activity = {}) {
        const data = this.data;
        const chill = data.chill ?? 0;
        if (!Number.isFinite(felt) || !(dt > 0)) return chill;
        if (felt >= COLD_COMFORT) {
            data.chill = Math.max(0, chill - (WARM_BASE + (felt - COLD_COMFORT) / WARM_RATE) * dt);
            return data.chill;
        }
        let rate = (COLD_COMFORT - felt) / COLD_RATE;
        if (activity.sprinting && !activity.swimming) rate *= COLD_SPRINTING;
        else if (activity.moving && !activity.swimming) rate *= COLD_MOVING;
        if (this.state === 'exhausted') rate *= COLD_EXHAUSTED;
        if (this.full) rate *= COLD_FULL;
        let cap = felt < 0 ? 100 : COLD_CAP_ABOVE_ZERO;
        if (activity.sleeping) cap = Math.min(cap, COLD_CAP_ASLEEP);
        // (Wychłodzenie ponad pułap nie spada samo - spada dopiero w cieple.)
        if (chill < cap) data.chill = Math.min(cap, chill + rate * dt);
        return data.chill;
    }

    // Odmarznięcie (Freeze.js): resztka energii, pusty żołądek, chłód.
    thawed() {
        const data = this.data;
        data.energy = Math.min(data.energy, this.capacity * BLACKOUT_ENERGY);
        data.fullness = 0;
        data.chill = Math.min(data.chill ?? 0, THAW_CHILL);
        this.lastCold = this.coldState;
        this.breath = 1;
        this.drowned = false;
    }

    // Przeskok czasu w bryle lodu (Freeze.js): nowa doba bez rozliczania
    // posiłków - zamarznięty nie mógł jeść, więc kondycja nie spada.
    skipTo(days) {
        const data = this.data;
        data.day = Math.floor(days);
        data.mealsToday = 0;
        data.lastMealAt = null;
        data.meal = null;
        this.now = days;
    }

    // Twarde lądowanie z prędkością speed (bloki/s). Zwraca liczbę sekund
    // utykania, które doszły (0 - nic się nie stało).
    fall(speed) {
        if (!this.active || !(speed >= LIMP_SPEED)) return 0;
        const height = speed * speed / (2 * FALL_GRAVITY);
        const limit = LIMP_SPEED * LIMP_SPEED / (2 * FALL_GRAVITY);
        const seconds = Math.min(LIMP_MAX, LIMP_SECONDS + (height - limit) * LIMP_PER_BLOCK);
        const before = this.data.limp;
        this.data.limp = Math.min(LIMP_MAX, Math.max(before, seconds));
        return this.data.limp - before;
    }

    // Utrata przytomności pod wodą: zostaje resztka energii, pusty
    // żołądek i pełne płuca (gracz budzi się już na brzegu).
    blackout() {
        const data = this.data;
        data.energy = Math.min(data.energy, this.capacity * BLACKOUT_ENERGY);
        data.fullness = 0;
        this.breath = 1;
        this.drowned = false;
    }

    nextRumble() {
        return RUMBLE_EVERY[0] + this.random() * (RUMBLE_EVERY[1] - RUMBLE_EVERY[0]);
    }

    // Jedna klatka. activity: { moving, sprinting, swimming, mining, jumps,
    // underwater, sleeping }. Zwraca listę zdarzeń: { type: 'rumble' },
    // { type: 'state', from, to }, { type: 'day', meals, change },
    // { type: 'healed' } (noga zdrowa), { type: 'drown' } (brak oddechu),
    // { type: 'rest', from, to } (zmiana wyspania).
    update(dt, activity = {}, days = this.data.day) {
        const events = [];
        if (!this.active || !(dt > 0)) return events;
        const data = this.data;
        this.now = days;
        this.pricked = Math.max(0, this.pricked - dt);
        this.prickWait = Math.max(0, this.prickWait - dt);
        // Efekty, których czas minął.
        for (const type of Object.keys(data.effects)) {
            // Efekt snu nie mija w trakcie snu - rozlicza go sleep().
            if (data.effects[type] <= days && !(activity.sleeping && getEffect(type)?.sleep)) {
                delete data.effects[type];
                events.push({ type: 'effectEnded', effect: type });
            }
        }

        let rate = REST_DRAIN * this.effectFactor('drain') * COLD_STATES[this.coldState].drain;
        if (activity.swimming) rate *= DRAIN.swim;
        else if (activity.sprinting) rate *= DRAIN.sprint;
        else if (activity.moving) rate *= DRAIN.walk;
        if (activity.mining) rate += MINING_DRAIN;
        if (this.full) rate *= FULL_DRAIN;
        if (this.state === 'great') rate *= GREAT_DRAIN;
        if (activity.sleeping) rate *= SLEEP_ENERGY_FACTOR;
        if (data.comfort) {
            if (days >= data.comfortUntil) { data.comfort = 0; data.comfortUntil = 0; }
            else rate *= COMFORT[data.comfort].drain;
        }
        // Wyspanie ubywa tylko na jawie (sen dolicza je przy pobudce).
        if (!activity.sleeping) {
            data.rest = Math.max(0, data.rest - REST_DRAIN_AWAKE * (isNight(days) ? REST_NIGHT_FACTOR : 1) * dt);
        }
        const rest = this.restState;
        if (rest !== this.lastRest) {
            events.push({ type: 'rest', from: this.lastRest, to: rest });
            this.lastRest = rest;
        }
        data.energy = clamp(data.energy - rate * dt - (activity.jumps ?? 0) * JUMP_COST, 0, this.capacity);
        data.fullness = Math.max(0, data.fullness - dt);

        if (data.limp > 0) {
            const heal = (activity.moving || activity.swimming ? 1 : LIMP_REST_HEAL) * (this.full ? LIMP_FULL_HEAL : 1) *
                this.effectFactor('heal');
            data.limp = Math.max(0, data.limp - dt * heal);
            if (data.limp === 0) events.push({ type: 'healed' });
        }

        if (activity.underwater) {
            this.breath = Math.max(0, this.breath - dt / BREATH_SECONDS);
            if (this.breath === 0 && !this.drowned) {
                this.drowned = true;
                events.push({ type: 'drown' });
            }
        } else if (!this.drowned) {
            this.breath = Math.min(1, this.breath + dt / BREATH_RECOVER_SECONDS);
        }

        this.rollDay(days, events);

        // Zimno (1.26.0): activity.felt - odczuwalna temperatura (Warmth.js).
        if (Number.isFinite(activity.felt)) {
            const before = data.chill ?? 0;
            this.cool(dt, activity.felt, activity);
            const cold = this.coldState;
            if (cold !== this.lastCold) {
                events.push({ type: 'cold', from: this.lastCold, to: cold });
                this.lastCold = cold;
            }
            // Raz na każde dojście do końca - także zaraz po wczytaniu
            // zapisu, w którym gracz był już cały wychłodzony.
            if (data.chill >= 100 && (before < 100 || !this.freezeSent)) events.push({ type: 'freeze' });
            this.freezeSent = data.chill >= 100;
        }

        const state = this.state;
        if (state !== this.lastState) {
            events.push({ type: 'state', from: this.lastState, to: state });
            // Pierwsze burczenie zaraz po tym, jak gracz zgłodnieje.
            if (state === 'hungry' && this.lastState !== 'tired' && this.lastState !== 'exhausted') this.rumbleIn = 2;
            this.lastState = state;
        }

        if (STATE_ORDER.indexOf(state) >= STATE_ORDER.indexOf('hungry') && !this.full) {
            this.rumbleIn -= dt;
            if (this.rumbleIn <= 0) {
                this.rumbleIn = this.nextRumble();
                events.push({ type: 'rumble' });
            }
        }
        return events;
    }

    // Nowa doba gry: rozliczenie posiłków z poprzedniej.
    rollDay(days, events = []) {
        const data = this.data;
        const today = Math.floor(days);
        if (today < data.day) {
            // Czas cofnięty komendą - zaczynamy dobę od nowa.
            data.day = today;
            data.lastMealAt = null;
            data.meal = null;
            return;
        }
        if (today === data.day) return;
        const meals = data.mealsToday;
        // Pierwsza doba w świecie nie obniża kondycji (0.99.0): gracz dopiero
        // się uczy, a zaczyna rano, więc na trzy posiłki ma mniej czasu.
        const change = Math.max(data.day === data.graceDay ? 0 : -Infinity,
            CONDITION_CHANGE[Math.min(meals, CONDITION_CHANGE.length - 1)]);
        const before = data.condition;
        data.condition = clamp(before + change, CONDITION_MIN, CONDITION_MAX);
        data.energy = Math.min(data.energy, data.condition);
        data.history = [...data.history, meals].slice(-3);
        data.mealsToday = 0;
        data.day = today;
        events.push({ type: 'day', meals, change: data.condition - before });
    }

    // Czy da się teraz zjeść ten przedmiot: { ok, reason }.
    canEat(type) {
        if (!getFood(type)) return { ok: false, reason: 'Tego nie da się zjeść' };
        if (!this.active) return { ok: false, reason: 'W tym trybie nie trzeba jeść' };
        // Napój da się wypić także z pełnym żołądkiem.
        if (this.data.fullness >= FULLNESS_LIMIT && getFood(type).kind !== 'drink') return { ok: false, reason: 'Nie zmieścisz już więcej' };
        return { ok: true, reason: null };
    }

    // Zjedzenie jednej sztuki. Zwraca { ok, reason, meal } - meal: true,
    // gdy właśnie zaliczył się posiłek.
    eat(type, days = this.data.day) {
        const check = this.canEat(type);
        if (!check.ok) return { ...check, meal: false };
        const food = getFood(type), data = this.data;
        this.rollDay(days);
        data.energy = Math.min(this.capacity, data.energy + food.energy);
        data.fullness = Math.min(FULLNESS_MAX, data.fullness + food.fullness);
        data.lastFood = type;

        if (!data.meal || days - data.meal.last > MEAL_WINDOW || days < data.meal.last) {
            data.meal = { last: days, energy: 0, counted: false };
        }
        data.meal.last = days;
        data.meal.energy += food.energy;

        let meal = false;
        if (!data.meal.counted && data.meal.energy >= MEAL_ENERGY) {
            data.meal.counted = true;
            if (data.lastMealAt === null || days - data.lastMealAt >= MEAL_GAP || days < data.lastMealAt) {
                data.mealsToday++;
                data.lastMealAt = days;
                meal = true;
            }
        }
        this.rumbleIn = this.nextRumble();
        const effects = (food.effects ?? []).filter((type) => this.addEffect(type, days));
        return { ok: true, reason: null, meal, effects, mealsToday: data.mealsToday };
    }

    // Opis słowami (okno statusu - src/ui/StatusPanel.js).
    describe() {
        const data = this.data;
        const part = data.energy / this.capacity;
        const energy = part >= 0.9 ? 'pełny zapas' : part >= 0.65 ? 'sporo' : part >= 0.4 ? 'około połowy'
            : part >= 0.22 ? 'niewiele' : part >= 0.08 ? 'bardzo mało' : 'resztki';
        const c = data.condition;
        const condition = c >= 120 ? 'znakomita' : c >= GREAT_CONDITION ? 'bardzo dobra' : c >= 95 ? 'dobra'
            : c >= 80 ? 'osłabiona' : 'słaba';
        const limp = !this.limping ? null : data.limp > 150 ? 'mocno stłuczona' : data.limp > 45 ? 'stłuczona' : 'prawie zdrowa';
        return { state: this.state, energy, condition, full: this.full, mealsToday: data.mealsToday,
            history: data.history, lastFood: data.lastFood, limp, pricked: this.pricked > 0,
            rest: REST_STATES[this.restState].label, comfort: COMFORT[data.comfort]?.label ?? null,
            cold: COLD_STATES[this.coldState].label, chill: Math.round(this.chill),
            // Działające efekty: nazwa i ile godzin gry zostało.
            effects: this.activeEffects().map((type) => ({ type, label: EFFECTS[type].label,
                hours: Math.max(0, (data.effects[type] - this.now) * 24) })) };
    }
}
