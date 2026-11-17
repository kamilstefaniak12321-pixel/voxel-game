import { DAY_SECONDS, emptySample, weatherHash } from './WeatherField.js';

// ------------------------------------------------------------
// WIRY PYŁOWE (1.15.0)
//
// W upalne, słoneczne i prawie bezwietrzne popołudnia nad rozgrzaną
// pustynią (i - rzadziej - sawanną) wstają wiry pyłowe: wąskie, kręcące
// się słupy pyłu wysokie na kilkanaście-kilkadziesiąt bloków. Każdy żyje
// kilkadziesiąt sekund, wędruje z wiatrem i znika.
//
// Jak wyładowania burzy (Thunderstorm.js) wiry LOSUJĄ SIĘ Z CZASU GRY:
// świat dzieli się na oczka, czas na odcinki, i dla każdego oczka
// i odcinka ziarno świata mówi, czy wstaje tam wir, kiedy i jaki. Dzięki
// temu wszyscy gracze widzą te same wiry w tych samych miejscach, a gra
// niczego nie zapisuje.
//
// Tu jest samo losowanie i ruch (bez three.js - sprawdza je test);
// rysowanie: rendering/DustDevilRenderer.js.
// ------------------------------------------------------------

export const DEVILS = Object.freeze({
    // Oczko świata (bloki) i odcinek czasu (sekundy gry).
    cell: 176, slot: 48,
    // Ile sekund żyje wir, ile trwa wstawanie i zanikanie.
    life: [26, 58], rise: 4, fade: 6,
    // Z jak daleka je widać i ile naraz najwyżej się rysuje.
    range: 230, max: 3,
    // Szansa na wir w oczku na odcinek czasu w najlepszych warunkach.
    chance: 0.28,
    // Wysokość i promień u podstawy (bloki).
    height: [9, 26], radius: [0.8, 2.1],
    // Warunki: od ilu stopni (i przy ilu pełne), przy jakim wietrze
    // jeszcze wstają (i przy jakim bez przeszkód), ile chmur niskich je
    // gasi, w jakich porach doby (świt-zmierzch: 0,25-0,75).
    heat: [22, 30], wind: [4.5, 2.5], cloud: [0.3, 0.7], day: [0.37, 0.45, 0.66, 0.74],
    // Jak szybko niesie je wiatr (część prędkości wiatru) i jak szeroko
    // krążą wokół swojej drogi (bloki).
    carry: 0.6, wander: 7
});

const SALT = 0x3c6ef372;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const frac = (x) => x - Math.floor(x);

function ramp(a, b, x) {

    const t = clamp01((x - a) / (b - a));

    return t * t * (3 - 2 * t);

}


// Jak dobre są warunki na wiry (0-1) przy pogodzie `sample` (próbka pola)
// o porze doby timeOfDay (0-1).

export function devilWeather(sample, timeOfDay) {

    const D = DEVILS;

    return clamp01(sample.arid) *
        ramp(D.heat[0], D.heat[1], sample.temp) *
        ramp(D.wind[0], D.wind[1], sample.speed) *
        (1 - ramp(D.cloud[0], D.cloud[1], sample.low)) *
        ramp(D.day[0], D.day[1], timeOfDay) * ramp(D.day[3], D.day[2], timeOfDay) *
        (sample.rain > 0.02 ? 0 : 1) * (1 - clamp01(sample.wall * 2));

}


export class DustDevils {

    // field - pole pogody (WeatherField).

    constructor(field) {

        this.field = field;
        this.sample = emptySample();

        // Pogoda w oczku na początku odcinka (liczy się raz).
        this.cache = new Map();

        // Wir z komendy (/pogoda wir) albo null: { x, z, start, life, seed }.
        this.forced = null;

        // Wiry w zasięgu po ostatnim update (najbliższy pierwszy).
        this.list = [];
        this.pool = [];

        // Odległość od najbliższego wiru (bloki; Infinity - brak) i czy to
        // wir z komendy.
        this.nearest = Infinity;
        this.nearestForced = false;

    }


    // Wir oczka (cx, cz) w odcinku czasu `slot` albo null: miejsce, w którym
    // wstaje, kiedy (sekundy gry), ile żyje i jaki jest. seconds - gdy
    // podane, wir, który w tej chwili nie żyje, też daje null (bez liczenia
    // reszty).

    spawn(cx, cz, slot, seconds = null) {

        const seed = this.field.seed ^ SALT;
        const D = DEVILS;
        const key = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(slot, 83492791);
        const roll = weatherHash(key, 1, 1, seed);

        if (roll > D.chance) {
            return null;
        }

        const start = (slot + 0.9 * weatherHash(key, 2, 1, seed)) * D.slot;
        const life = D.life[0] + (D.life[1] - D.life[0]) * weatherHash(key, 6, 1, seed);

        if (seconds !== null && (seconds < start || seconds > start + life)) {
            return null;
        }

        const x = (cx + weatherHash(key, 3, 1, seed)) * D.cell;
        const z = (cz + weatherHash(key, 4, 1, seed)) * D.cell;

        // Warunki tam, gdzie wstaje, i wtedy, kiedy wstaje (liczone raz).
        let entry = this.cache.get(key);

        if (entry === undefined) {

            if (this.cache.size > 600) {
                this.cache.clear();
            }

            const days = start / DAY_SECONDS;
            const sample = this.field.sample(x, z, days, this.sample);

            entry = { ok: devilWeather(sample, frac(days)), windX: sample.windX, windZ: sample.windZ };
            this.cache.set(key, entry);

        }

        // (Im gorsze warunki, tym mniej oczek ma wir.)
        if (roll > D.chance * entry.ok) {
            return null;
        }

        const size = weatherHash(key, 5, 1, seed);

        return {
            key, x, z, start, life,
            height: D.height[0] + (D.height[1] - D.height[0]) * size,
            radius: D.radius[0] + (D.radius[1] - D.radius[0]) * (0.3 * size + 0.7 * weatherHash(key, 7, 1, seed)),
            phase: 6.2832 * weatherHash(key, 8, 1, seed),
            windX: entry.windX, windZ: entry.windZ,
            forced: false
        };

    }


    // Gdzie jest wir `devil` w chwili `seconds` i jak silny (0-1): wpisuje
    // do `out` { x, z, power, age } i zwraca out albo null (jeszcze nie
    // wstał albo już zniknął).

    place(devil, seconds, out) {

        const age = seconds - devil.start;

        if (age < 0 || age > devil.life) {
            return null;
        }

        const D = DEVILS;

        out.x = devil.x + devil.windX * D.carry * age + D.wander * Math.sin(age * 0.21 + devil.phase);
        out.z = devil.z + devil.windZ * D.carry * age + D.wander * Math.cos(age * 0.17 + devil.phase * 1.7);
        out.power = Math.min(clamp01(age / D.rise), clamp01((devil.life - age) / D.fade));
        out.age = age;
        out.height = devil.height;
        out.radius = devil.radius;
        out.phase = devil.phase;
        out.forced = devil.forced;
        out.key = devil.key;

        return out;

    }


    // Wiry w zasięgu punktu (x, z) w chwili `days` (doby gry): this.list,
    // najbliższy pierwszy, najwyżej DEVILS.max.

    update(days, x, z) {

        const D = DEVILS;
        const seconds = days * DAY_SECONDS;
        const slot = Math.floor(seconds / D.slot);
        const list = this.list;
        const pool = this.pool;

        // Stare wpisy wracają do puli.
        while (list.length) {
            pool.push(list.pop());
        }

        const consider = (devil) => {

            const out = this.place(devil, seconds, pool.pop() ?? {});

            if (!out) {
                return;
            }

            out.distance = Math.hypot(out.x - x, out.z - z);

            if (out.distance <= D.range) {
                list.push(out);
            }
            else {
                pool.push(out);
            }

        };

        // Wir żyje dłużej niż odcinek: liczą się też dwa poprzednie.
        const reach = D.range + 80;
        const x0 = Math.floor((x - reach) / D.cell);
        const x1 = Math.floor((x + reach) / D.cell);
        const z0 = Math.floor((z - reach) / D.cell);
        const z1 = Math.floor((z + reach) / D.cell);

        for (let s = slot - 2; s <= slot; s++) {
            for (let cz = z0; cz <= z1; cz++) {
                for (let cx = x0; cx <= x1; cx++) {

                    const devil = this.spawn(cx, cz, s, seconds);

                    if (devil) {
                        consider(devil);
                    }

                }
            }
        }

        if (this.forced) {

            if (seconds > this.forced.start + this.forced.life) {
                this.forced = null;
            }
            else {
                consider(this.forced);
            }

        }

        list.sort((a, b) => a.distance - b.distance);

        while (list.length > D.max) {
            pool.push(list.pop());
        }

        this.nearest = list.length ? list[0].distance : Infinity;
        this.nearestForced = list.length ? list[0].forced : false;

        return list;

    }


    // Wir z komendy: wstaje teraz w (x, z). size 0-1 - jak duży.

    force(x, z, days, size = 0.7) {

        const D = DEVILS;
        const s = clamp01(size);

        this.forced = {
            key: -1, x, z, start: days * DAY_SECONDS,
            life: D.life[1],
            height: D.height[0] + (D.height[1] - D.height[0]) * s,
            radius: D.radius[0] + (D.radius[1] - D.radius[0]) * s,
            phase: 1.3, windX: 0, windZ: 0, forced: true
        };

        return this.forced;

    }

}
