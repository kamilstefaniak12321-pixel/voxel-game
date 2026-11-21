// ------------------------------------------------------------
// ZIMNO - ILE CIEPŁA CZUJE GRACZ (1.26.0, pomysł Kamila)
//
// Odczuwalna temperatura (felt) to temperatura powietrza tam, gdzie
// stoi gracz (pogoda: pora roku, klimat, pora doby, opad, wysokość -
// weather/Weather.js), poprawiona o to, co gracza otacza:
//
//   schronienie - im mniej nieba nad głową, tym cieplej (SHELTER, do
//                 +5°C w zamkniętej izbie) i tym mniej wieje,
//   wiatr       - na otwartym terenie wiatr wychładza (WIND_CHILL na
//                 każdy blok/s prędkości, najwyżej WIND_MAX),
//   woda        - w wodzie jest o WATER_CHILL zimniej,
//   ogień       - płonące ognisko grzeje mocno, nic dalej niż FIRE_REACH.
//                 Od 1.32.0 tym mocniej, im gorętszy ogień (fireWarmth
//                 w game/CampfireState.js: lipa ok. +14°C, sosna +18,
//                 brzoza +22, dąb +25); zapadający się stos - o połowę
//                 słabiej, sam żar po ognisku - kilka stopni,
//   pochodnie   - pochodnia i lampa grzeją trochę (TORCH_HEAT tuż obok,
//                 nic dalej niż TORCH_REACH), razem najwyżej BLOCKS_MAX;
//                 rozgrzany meteoryt też,
//   jedzenie    - ciepła potrawa, napar, chili (efekty z polem heat -
//                 items/effects.js),
//   ubrania     - (1.27.0) to, co gracz ma na sobie (items/clothing.js:
//                 wornWarmth, pełny strój z pokrzywy to około +10°C);
//                 mokre (w wodzie) grzeją tylko w WET_CLOTHES.
//
// Z odczuwalnej temperatury Wellbeing liczy wychłodzenie (chill) i jego
// skutki, a Freeze.js - zamarzanie i odwilż.
//
// Liczy się co SCAN_SECONDS (ognie i bloki wokół gracza), nie co klatkę.
// ------------------------------------------------------------

import { SEA_LEVEL } from '../config.js';
import { getBlockId } from '../blocks/BlockRegistry.js';
import { isTorchId } from '../blocks/torches.js';
import { tempAtHeight } from '../weather/WeatherField.js';
import { wornWarmth } from '../items/clothing.js';
import { fireWarmth, WARMTH_FROM, WARMTH_DEGREES, COLLAPSE_WARMTH } from './CampfireState.js';

export const SHELTER = 5;
export const WIND_CHILL = 0.7;
export const WIND_MAX = 6;
export const WATER_CHILL = 6;

// Ciepło przy ognisku o temperaturze 850° (brzoza) - punkt odniesienia;
// ile grzeje konkretne ognisko, liczy fireWarmth.
export const FIRE_HEAT = (850 - WARMTH_FROM) / WARMTH_DEGREES;
export const FIRE_CLOSE = 1.5;
export const FIRE_REACH = 7;
// Żarzące się (zapadające) ognisko grzeje słabiej.
export const EMBERS = COLLAPSE_WARMTH;

export const TORCH_HEAT = 6;
export const TORCH_REACH = 4;
export const BLOCKS_MAX = 12;
// Ile grzeją ubrania w wodzie (mokre).
export const WET_CLOTHES = 0.3;
const SCAN = Math.ceil(TORCH_REACH);

// Bloki, które grzeją: numer -> ciepło tuż obok (°C).
const HEAT_BLOCKS = new Map();
for (const type of ['lamp', 'lamp_red', 'lamp_green', 'lamp_blue', 'lamp_purple']) HEAT_BLOCKS.set(getBlockId(type), TORCH_HEAT);
HEAT_BLOCKS.set(getBlockId('meteorite'), 4);

export function blockHeat(id) {
    if (isTorchId(id)) return TORCH_HEAT;
    return HEAT_BLOCKS.get(id) ?? 0;
}

// Ile ciepła daje źródło o sile `heat` z odległości `distance`:
// pełne do `close`, potem liniowo do zera na `reach`.
export function falloff(heat, distance, close, reach) {
    if (!(distance < reach)) return 0;
    if (distance <= close) return heat;
    return heat * (reach - distance) / (reach - close);
}

// Ciepło od ognisk (fires - mapa z game/Campfires.js) w punkcie (x, y, z)
// - środek ciała gracza.
export function fireHeat(fires, x, y, z) {
    let heat = 0;
    for (const fire of fires?.values?.() ?? []) {
        const warmth = fireWarmth(fire);
        if (!warmth) continue;
        const distance = Math.hypot(fire.x + 0.5 - x, (fire.y + 0.5 - y) * 1.5, fire.z + 0.5 - z);
        heat += falloff(warmth, distance, FIRE_CLOSE, FIRE_REACH);
    }
    return heat;
}

// Ciepło od pochodni, lamp i meteorytów wokół punktu (x, y, z).
export function blocksHeat(world, x, y, z) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    let heat = 0;
    for (let dy = -SCAN; dy <= SCAN; dy++) {
        for (let dx = -SCAN; dx <= SCAN; dx++) {
            for (let dz = -SCAN; dz <= SCAN; dz++) {
                const source = blockHeat(world.getBlockId(bx + dx, by + dy, bz + dz));
                if (!source) continue;
                heat += falloff(source, Math.hypot(bx + dx + 0.5 - x, by + dy + 0.5 - y, bz + dz + 0.5 - z), 1, TORCH_REACH);
            }
        }
    }
    return Math.min(BLOCKS_MAX, heat);
}

// Odczuwalna temperatura z części. air - powietrze (°C), sky - światło
// nieba przy głowie (0-15), wind - prędkość wiatru (bloki/s), water -
// czy gracz jest w wodzie, heat - ciepło ognisk i pochodni, food -
// ciepło z jedzenia, clothes - ciepło ubrań (suchych).
// Zwraca { felt, air, shelter, wind, water, heat, food, clothes }.
export function feltTemperature({ air = 10, sky = 15, wind = 0, water = false, heat = 0, food = 0, clothes = 0 } = {}) {
    const exposure = Math.max(0, Math.min(1, sky / 15));
    const parts = {
        air,
        shelter: SHELTER * (1 - exposure),
        wind: -Math.min(WIND_MAX, WIND_CHILL * Math.max(0, wind)) * exposure,
        water: water ? -WATER_CHILL : 0,
        heat,
        food,
        clothes: water ? clothes * WET_CLOTHES : clothes
    };
    parts.felt = parts.air + parts.shelter + parts.wind + parts.water + parts.heat + parts.food + parts.clothes;
    return parts;
}

// Powietrze w (x, y, z) o czasie `days` prosto z pola pogody (bez
// wygładzania - do szukania odwilży w przyszłości, Freeze.js).
export function airAt(field, x, y, z, days) {
    return tempAtHeight(field.sample(x, z, days).temp, Math.min(y, 255), SEA_LEVEL);
}

// Kiedy (czas gry w dobach) po chwili `days` powietrze w (x, y, z),
// razem ze stałym dodatkiem `bonus` (schronienie), dojdzie do `goal`.
// Szuka co `step` doby, najdalej `limit` dób. Gdy nie dojdzie - chwila
// z najcieplejszym powietrzem.
export function findWarm(field, x, y, z, days, goal, bonus = 0, { step = 1 / 24, limit = 32 } = {}) {
    let best = days + step, warmest = -Infinity;
    for (let t = days + step; t <= days + limit + 1e-9; t += step) {
        const air = airAt(field, x, y, z, t) + bonus;
        if (air >= goal) return t;
        if (air > warmest) { warmest = air; best = t; }
    }
    return best;
}

export class Warmth {

    constructor(game) {
        this.game = game;
        this.wait = 0;
        this.parts = feltTemperature();
        // Ciepło od ognisk i pochodni (bez pogody) - do odwilży.
        this.heat = 0;
    }

    get felt() { return this.parts.felt; }

    // Co klatkę. Przelicza co SCAN_SECONDS (force - od razu).
    update(dt, force = false) {
        this.wait -= dt;
        if (this.wait > 0 && !force) return this.parts;
        this.wait = SCAN_SECONDS;
        this.parts = this.measure();
        return this.parts;
    }

    // Wszystkie części w miejscu gracza.
    measure() {
        const game = this.game, player = game.player, world = game.world;
        const x = player.pos.x, y = player.pos.y + 0.9, z = player.pos.z;
        const head = world.getLight?.(Math.floor(x), Math.floor(player.pos.y + 1.6), Math.floor(z));
        this.heat = fireHeat(game.campfires?.fires, x, y, z) + blocksHeat(world, x, y, z);
        const weather = game.weather;
        return feltTemperature({
            air: Number.isFinite(weather?.temperature) ? weather.temperature : 10,
            sky: Number.isFinite(head?.sky) ? head.sky : 15,
            wind: weather?.wind?.speed ?? 0,
            water: Boolean(player.swimming) || (player.submerged ?? 0) > 0.5,
            heat: this.heat,
            food: game.wellbeing?.effectSum?.('heat') ?? 0,
            clothes: wornWarmth(game.inventory?.equip)
        });
    }

}

export const SCAN_SECONDS = 0.5;
