// ------------------------------------------------------------
// GDZIE PADA DESZCZ (1.43.1) - jedna reguła dla całej gry
//
// Pod dachem nie pada. Dach to pierwszy od góry blok w kolumnie, który
// zatrzymuje deszcz: pełny blok, liście albo woda. Tę samą regułę mają
// krople na ekranie (rendering/RainStreaks.js - RainShelter), gracz
// (czy moknie) i rzeczy w świecie: ognisko, pochodnia, polana na ziemi
// i w drewutni.
//
// Do 1.43.0 ognisko, pochodnia i drewno sprawdzały co innego - światło
// nieba nad nimi (co najmniej 12 z 15). Światło nieba wchodzi pod dach
// z boku, więc pod wąskim daszkiem albo przy krawędzi dachu ognisko
// gasło w deszczu, choć krople tam nie padały.
//
// Ile pada, liczy się tam, gdzie stoi ta rzecz (pogoda to mapa, nie
// jeden przełącznik) - LocalRain niżej, w grze game.rainAt(x, z). Do
// 1.43.0 liczył się deszcz tam, gdzie stał gracz.
// ------------------------------------------------------------

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { getWaterLevel, isSolidId, isOpaqueId } from '../blocks/BlockRegistry.js';

// Do tej odległości od gracza liczy się deszcz, który widać (game.rainNow);
// dalej - próbka pola pogody na kratkę tego boku (bloki).
export const RAIN_NEAR = 32;
export const RAIN_CELL = 32;
// Próbka kratki jest świeża przez tyle dób gry (sekunda przy zwykłym czasie).
const RAIN_FRESH_DAYS = 1 / 1200;
// Słabszy opad z pola pogody to jeszcze nie deszcz (jak nad graczem).
const RAIN_FLOOR = 0.04;

// Czy blok o tym numerze zatrzymuje deszcz.
export function stopsRain(id) {
    return id !== 0 && (getWaterLevel(id) >= 0 || isSolidId(id) || isOpaqueId(id));
}

// Czy deszcz spada na blok (x, y, z): nad nim w kolumnie nie ma niczego,
// co go zatrzymuje. Niewczytany teren - nie wiadomo, więc false.
export function rainReaches(world, x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const chunk = world?.getChunk?.(cx, cz);
    if (!chunk) return false;
    const top = Math.min(CHUNK_HEIGHT, chunk.maxY ?? CHUNK_HEIGHT) - 1;
    const blocks = chunk.blocks;
    if (blocks) {
        const column = (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE), layer = CHUNK_SIZE * CHUNK_SIZE;
        for (let by = top; by > y; by--) if (stopsRain(blocks[by * layer + column])) return false;
        return true;
    }
    // (Świat bez tablicy bloków - np. w testach.)
    for (let by = top; by > y; by--) if (stopsRain(world.getBlockId(x, by, z))) return false;
    return true;
}

// Dach nad blokiem (x, y, z): { y, id } pierwszego bloku, który zatrzymuje
// deszcz, albo null (nad blokiem otwarte niebo). Do komendy /pogoda dach.
export function roofAbove(world, x, y, z) {
    x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
    for (let by = CHUNK_HEIGHT - 1; by > y; by--) {
        const id = world.getBlockId(x, by, z);
        if (stopsRain(id)) return { y: by, id };
    }
    return null;
}

// Deszcz (0-1) w miejscu (x, z): game.rainAt, gdy gra go ma, inaczej to,
// co pada nad graczem (stare atrapy gry w testach).
export function rainAt(game, x, z) {
    const rain = typeof game?.rainAt === 'function' ? game.rainAt(x, z) : game?.rainNow;
    return Number.isFinite(rain) ? Math.max(0, Math.min(1, rain)) : 0;
}

// Deszcz w dowolnym miejscu świata dla gry `game` (game.camera, game.weather,
// game.rainNow, game.rainOverride, game.time):
//   - blisko gracza: to, co widać i słychać (game.rainNow),
//   - komenda /deszcz: pada wszędzie tyle samo,
//   - dalej: pole pogody w tym miejscu (te same fronty co na niebie),
//     bez śniegu (udział śniegu - jak przy graczu).
export class LocalRain {

    constructor(game) {
        this.game = game;
        this.cache = new Map();
        this.sample = undefined;
    }

    at(x, z) {
        const game = this.game, eye = game.camera?.position, field = game.weather?.field;
        const here = Number.isFinite(game.rainNow) ? game.rainNow : 0;
        if (!eye || !field || Math.hypot(x - eye.x, z - eye.z) <= RAIN_NEAR) return here;
        const snow = Number.isFinite(game.weather.snowShare) ? game.weather.snowShare : 0;
        if (game.rainOverride !== null && game.rainOverride !== undefined) return game.rainOverride * (1 - snow);
        const days = game.time?.days ?? 0;
        const ix = Math.floor(x / RAIN_CELL), iz = Math.floor(z / RAIN_CELL), cell = `${ix},${iz}`;
        const hit = this.cache.get(cell);
        if (hit && Math.abs(days - hit.days) < RAIN_FRESH_DAYS) return hit.rain;
        this.sample = field.sample((ix + 0.5) * RAIN_CELL, (iz + 0.5) * RAIN_CELL, days, this.sample);
        const fall = this.sample.rain > RAIN_FLOOR ? this.sample.rain : 0;
        const rain = Math.max(0, Math.min(1, fall * (1 - snow)));
        if (this.cache.size > 512) this.cache.clear();
        this.cache.set(cell, { days, rain });
        return rain;
    }
}
