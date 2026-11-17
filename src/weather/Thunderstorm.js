import { SEA_LEVEL } from '../config.js';

import { DAY_SECONDS, weatherHash, emptySample } from './WeatherField.js';
import { cloudUniforms } from './cloudShader.js';

// ------------------------------------------------------------
// BURZA: WYŁADOWANIA (1.13.0)
//
// Gdzie i kiedy błyska, wynika - jak cała pogoda - tylko z ziarna
// świata i czasu gry: w grze ze znajomymi wszyscy widzą ten sam piorun
// w tym samym miejscu, a nic nie trafia do zapisu.
//
// LOSOWANIE. Świat jest podzielony na kratki (THUNDER.cell bloków),
// a czas na sekundowe odcinki. W każdej kratce i każdym odcinku rzuca
// się "kostką" (hash); im silniejsza burza w tym miejscu (pole pogody,
// sample.storm), tym większa szansa na wyładowanie. Większość zostaje
// w chmurze (rozświetla ją od środka), co trzecie-czwarte bije w ziemię.
//
// BŁYSK. Wyładowanie to jeden do trzech błysków w ciągu ułamka sekundy
// (piorun do ziemi - ostre i krótkie, w chmurze - miękkie i dłuższe).
// Z poziomu błysku (0-1) korzystają:
//   - chmury (cloudShader.js - uCloudFlash): świecą wokół wyładowania,
//   - teren (Game.updateStorm -> rendering/meteorLight.js): jedno światło
//     w miejscu najsilniejszego błysku oświetla krajobraz,
//   - niebo i mgiełka (skyShader.js - uStormFlash),
//   - kanał pioruna (rendering/LightningBolts.js),
//   - grzmot (audio/ThunderAudio.js) - spóźniony o odległość.
//
// Ustawienie "Błyski burzy" (mode): 'pelne' - ostre błyski, 'lagodne' -
// jedno miękkie rozjaśnienie bez migotania, 'brak' - teren i niebo nie
// błyskają wcale (zostaje łagodna poświata w chmurze i sam piorun).
// ------------------------------------------------------------

export const THUNDER = Object.freeze({
    // Kratka losowania (bloki) i odcinek czasu (sekundy gry).
    cell: 256, slot: 1,
    // Jak daleko od gracza śledzi się wyładowania (bloki).
    range: 6400,
    // Szansa na wyładowanie w kratce w ciągu sekundy w środku burzy.
    rate: 0.022,
    // Od jakiej siły burzy błyska i przy jakiej najczęściej.
    from: 0.12, full: 0.72,
    // Dźwięk: prędkość (bloki/s - blok to metr) i zasięg grzmotu.
    soundSpeed: 343, audible: 5200,
    // Ile najwyżej błysków naraz rozświetla chmury.
    cloudFlashes: 3
});

const SALT_ROLL = 0x3c6ef372;
const SALT_SHAPE = 0x1b873593;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function ramp(a, b, x) {

    const t = clamp01((x - a) / (b - a));

    return t * t * (3 - 2 * t);

}


// Błyski jednego wyładowania: chwile (s od początku), siły i czas
// gaśnięcia. Najwyżej trzy, nie częściej niż co 0,11 s.

export function strikePulses(seed, ground) {

    const roll = (k) => weatherHash(seed, k, ground ? 1 : 2, SALT_SHAPE);
    const count = ground ? 1 + Math.floor(roll(1) * 3) : 2 + Math.floor(roll(1) * 2);
    const pulses = [];

    let at = 0;

    for (let k = 0; k < count; k++) {

        pulses.push({
            at,
            gain: ground ? (k === 0 ? 1 : 0.45 + 0.35 * roll(10 + k)) : 0.5 + 0.5 * roll(10 + k),
            decay: ground ? 0.055 : 0.11
        });

        at += ground ? 0.11 + 0.12 * roll(20 + k) : 0.16 + 0.2 * roll(20 + k);

    }

    const last = pulses[pulses.length - 1];

    return { pulses, duration: last.at + (ground ? 0.32 : 0.55) };

}


// Jak długo trwa błysk w danym trybie (łagodny gaśnie powoli).

export function strikeDuration(strike, mode = 'pelne') {

    return mode === 'pelne' ? strike.duration : strike.duration + 0.7;

}


// Poziom błysku 0-1 po `age` sekundach od początku wyładowania.

export function flashLevel(strike, age, mode = 'pelne') {

    if (age < 0) {
        return 0;
    }

    if (mode !== 'pelne') {

        // Jedno miękkie rozjaśnienie: narasta 0,15 s, gaśnie pół sekundy.
        const end = strikeDuration(strike, mode);

        return age >= end ? 0 : 0.5 * ramp(0, 0.15, age) * ramp(end, Math.max(0.2, end - 0.6), age);

    }

    let level = 0;

    for (const pulse of strike.pulses) {

        const t = age - pulse.at;

        if (t >= 0) {
            level = Math.max(level, pulse.gain * Math.min(1, t / 0.012) * Math.exp(-t / pulse.decay));
        }

    }

    return age >= strike.duration ? 0 : level;

}


// Wyładowania, które zaczynają się w odcinku czasu `slot`, w promieniu
// `range` od (cx, cz). Wynik nie zależy od tego, kto i skąd pyta: ta sama
// kratka w tym samym odcinku daje zawsze to samo wyładowanie.

export function strikesInSlot(field, slot, cx, cz, range = THUNDER.range, out = [], scratch = null) {

    const systems = scratch?.systems ?? [];
    const sample = scratch?.sample ?? emptySample();
    const cell = THUNDER.cell;
    const days = slot * THUNDER.slot / DAY_SECONDS;
    const seed = (field.seed ^ SALT_ROLL) | 0;

    const i0 = Math.floor((cx - range) / cell);
    const i1 = Math.floor((cx + range) / cell);
    const j0 = Math.floor((cz - range) / cell);
    const j1 = Math.floor((cz + range) / cell);

    let gathered = false;

    for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {

            const roll = weatherHash(i, j, slot, seed);

            if (roll >= THUNDER.rate) continue;

            const x = (i + weatherHash(i, j, slot ^ 0x5bd1e995, seed + 1)) * cell;
            const z = (j + weatherHash(i, j, slot ^ 0x2545f491, seed + 2)) * cell;

            if ((x - cx) * (x - cx) + (z - cz) * (z - cz) > range * range) continue;

            if (!gathered) {
                field.systemsNear(cx, cz, days, range + cell, systems);
                gathered = true;
            }

            const storm = field.sample(x, z, days, sample, systems).storm;

            if (roll >= THUNDER.rate * clamp01((storm - THUNDER.from) / (THUNDER.full - THUNDER.from))) continue;

            const shape = Math.floor(weatherHash(i, j, slot, seed + 3) * 0x7fffffff);

            out.push(makeStrike({
                key: `${i},${j},${slot}`,
                x, z,
                time: (slot + weatherHash(i, j, slot, seed + 4)) * THUNDER.slot,
                ground: weatherHash(i, j, slot, seed + 5) < 0.28 + 0.14 * storm,
                power: 0.55 + 0.45 * weatherHash(i, j, slot, seed + 6),
                seed: shape,
                storm
            }));

        }
    }

    return out;

}


function makeStrike(base) {

    const shape = strikePulses(base.seed, base.ground);

    return {
        forced: false, begun: false, distance: Infinity, groundY: SEA_LEVEL, topY: 0,
        // Jak szeroko świeci chmura wokół wyładowania (bloki).
        glow: base.ground ? 300 : 340 + 320 * weatherHash(base.seed, 3, 3, SALT_SHAPE),
        ...base,
        pulses: shape.pulses,
        duration: shape.duration
    };

}


export class Thunderstorm {

    // weather  - pogoda w grze (Weather.js),
    // groundAt - (x, z) => wysokość ziemi w tym miejscu (piorun bije w nią).

    constructor(weather, { groundAt = null } = {}) {

        this.weather = weather;
        this.field = weather.field;
        this.groundAt = groundAt;

        this.mode = 'pelne';

        // false - burza nie błyska wcale (testy, które porównują kolory).
        this.enabled = true;

        this.now = 0;
        this.slot = null;

        // Wyładowania, które jeszcze trwają albo zaraz się zaczną.
        this.pending = [];

        // Zaczęte w tej klatce (grzmot, osiągnięcia).
        this.started = [];

        // Ostatnie kilkadziesiąt sekund - znaczniki na mapie pogody.
        this.recent = [];

        this.scratch = { systems: [], sample: emptySample() };
        this.found = [];
        this.order = [];
        this.forcedCount = 0;

        // Światło najsilniejszego błysku na terenie: miejsce, poziom 0-1,
        // zasięg (w tej odległości połowa siły).
        this.light = { x: 0, y: 0, z: 0, level: 0, range: 400, ground: false };

        // Rozjaśnienie całego nieba (0-1).
        this.sky = 0;

        // Ostatni piorun, który uderzył w ziemię (osiągnięcia).
        this.lastGround = null;

        this.clearUniforms();

    }


    // Co klatkę: days - czas gry, eye - miejsce kamery.

    update(days, eye) {

        const now = days * DAY_SECONDS;
        const slot = Math.floor(now / THUNDER.slot);
        const pending = this.pending;

        this.now = now;
        this.started.length = 0;

        if (!this.enabled) {

            pending.length = 0;
            this.order.length = 0;
            this.light.level = 0;
            this.sky = 0;
            this.slot = null;
            this.clearUniforms();

            return;

        }

        // Początek gry albo przeskok czasu (sen, /czas): stare wyładowania
        // znikają, losowanie zaczyna od bieżącej chwili.

        if (this.slot === null || slot < this.slot || slot - this.slot > 3) {

            for (let k = pending.length - 1; k >= 0; k--) {
                if (!pending[k].forced) pending.splice(k, 1);
            }

            this.slot = slot - 1;

        }

        while (this.slot < slot) {

            this.slot++;

            if (this.weather.map.maxStorm > THUNDER.from) {

                this.found.length = 0;
                strikesInSlot(this.field, this.slot, eye.x, eye.z, THUNDER.range, this.found, this.scratch);

                for (const strike of this.found) pending.push(strike);

            }

        }

        // Które już błyskają i jak mocno.

        const base = this.weather.base;
        const light = this.light;
        const order = this.order;

        let best = 0;
        let sky = 0;

        order.length = 0;
        light.level = 0;

        for (let k = pending.length - 1; k >= 0; k--) {

            const strike = pending[k];
            const age = now - strike.time;

            if (age < 0) {

                // (Wyładowanie z komendy czeka na swoją chwilę nawet po
                // przeskoku czasu; zwykłe - najwyżej jeden odcinek.)
                if (!strike.forced && age < -2 * THUNDER.slot) pending.splice(k, 1);

                continue;

            }

            if (!strike.begun) {
                this.begin(strike, eye, base);
            }

            if (age >= strikeDuration(strike, this.mode)) {
                pending.splice(k, 1);
                continue;
            }

            const level = flashLevel(strike, age, this.mode) * strike.power;

            if (level <= 0.002) continue;

            strike.level = level;
            // Jak mocno świeci od niego chmura (piorun do ziemi wynosi
            // większość światła pod chmurę).
            strike.shine = level * (strike.ground ? 0.8 : 1);
            order.push(strike);

            // Teren: liczy się błysk, który daje tu najwięcej światła.
            const lx = strike.x;
            const ly = strike.ground ? strike.groundY + 0.45 * (strike.topY - strike.groundY) : base + 40;
            const lz = strike.z;
            const range = strike.ground ? 420 : 700;
            const d2 = (lx - eye.x) ** 2 + (ly - eye.y) ** 2 + (lz - eye.z) ** 2;
            const here = level * (strike.ground ? 1 : 0.5) * range * range / (range * range + d2);

            if (here > best) {
                best = here;
                light.x = lx;
                light.y = ly;
                light.z = lz;
                light.level = level * (strike.ground ? 1 : 0.5);
                light.range = range;
                light.ground = strike.ground;
            }

            sky += level / (1 + d2 / (2200 * 2200));

        }

        if (this.mode === 'brak') {
            light.level = 0;
            sky = 0;
        }

        this.sky = Math.min(1, sky);

        // Chmury: najwyżej kilka najjaśniejszych błysków.

        order.sort((a, b) => b.shine - a.shine);

        const flashes = cloudUniforms.uCloudFlash.value;
        const soft = this.mode === 'pelne' ? 1 : 0.7;

        for (let k = 0; k < flashes.length; k++) {

            const strike = order[k];

            if (strike) {
                flashes[k].set(strike.x, strike.z, strike.glow, strike.shine * soft);
            }
            else {
                flashes[k].set(0, 0, 1, 0);
            }

        }

        cloudUniforms.uStorm.value.y = order.length > 0 ? 1 : 0;

        while (this.recent.length && now - this.recent[0].time > 60) {
            this.recent.shift();
        }

    }


    // Początek wyładowania: odległość od gracza (grzmot), wysokość ziemi
    // i podstawy chmur (kanał pioruna).

    begin(strike, eye, base) {

        strike.begun = true;
        strike.topY = base + 12;
        strike.groundY = strike.ground ? Math.max(SEA_LEVEL, this.groundAt?.(strike.x, strike.z) ?? SEA_LEVEL) : SEA_LEVEL;

        const flat = Math.hypot(strike.x - eye.x, strike.z - eye.z);

        strike.distance = strike.ground ? flat : Math.hypot(flat, Math.max(0, base + 40 - eye.y));

        this.started.push(strike);
        this.recent.push({ x: strike.x, z: strike.z, time: strike.time, ground: strike.ground });

        if (this.recent.length > 96) {
            this.recent.shift();
        }

        if (strike.ground) {
            this.lastGround = { distance: flat, time: strike.time, natural: !strike.forced };
        }

    }


    // Wyładowanie z komendy (/pogoda piorun): w miejscu (x, z), za
    // `delay` sekund. Tylko u tego gracza.

    force(x, z, { ground = true, delay = 0.2, power = 1 } = {}) {

        const strike = makeStrike({
            key: `komenda-${this.forcedCount}`,
            x, z,
            time: this.now + delay,
            ground, power,
            seed: 7919 + this.forcedCount * 104729,
            storm: 1
        });

        strike.forced = true;
        this.forcedCount++;
        this.pending.push(strike);

        return strike;

    }


    clearUniforms() {

        for (const flash of cloudUniforms.uCloudFlash.value) {
            flash.set(0, 0, 1, 0);
        }

        cloudUniforms.uStorm.value.y = 0;

    }


    dispose() {

        this.pending.length = 0;
        this.started.length = 0;
        this.recent.length = 0;
        this.light.level = 0;
        this.sky = 0;
        this.clearUniforms();

    }

}
