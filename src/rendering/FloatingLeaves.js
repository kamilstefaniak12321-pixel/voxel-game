// ------------------------------------------------------------
// LIŚCIE NA WODZIE (0.88.0)
//
// Spadający liść (TreeParticles.js), który trafi w taflę wody, nie tonie
// od razu na dno: kładzie się płasko na powierzchni, kołysze z falami
// wody i przez chwilę (LEAF_FLOAT_SECONDS) dryfuje. Na rzece płynie
// z nurtem (ten sam nurt co niesie gracza - World.getWaterFlow), na
// stojącej wodzie tylko powoli krąży i lekko płynie z wiatrem. Przy
// brzegu się zatrzymuje, a z krawędzi wodospadu spada razem z wodą
// i dalej pływa w sadzawce. Na końcu powoli nasiąka i znika pod wodą.
//
// CubeParticles nie zna bloków - dostaje ten obiekt (opcja water).
// ------------------------------------------------------------

import { getWaterLevel } from '../blocks/BlockRegistry.js';
import { isFallingWaterId } from '../blocks/water.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { plantWindUniforms } from './PlantWind.js';

// Jak długo liść pływa (s, losowo z przedziału).
export const LEAF_FLOAT_SECONDS = [10, 18];

// Jaką część prędkości nurtu ma liść (reszta - opór, liść lekko zostaje).
export const LEAF_DRIFT = 0.85;

// Na stojącej wodzie: powolne krążenie (bloki/s) i ile niesie wiatr.
export const LEAF_WANDER = 0.06;
export const LEAF_WIND = 0.08;

// Pod wodospadem woda odpycha liść od kolumny (bloki/s).
export const LEAF_FALL_PUSH = 0.9;

// Liść leży tuż nad falującą taflą (bez migotania z wodą).
export const LEAF_ABOVE_WATER = 0.012;

// Wynik sprawdzenia miejsca pod liściem.
export const WATER_NONE = 0, WATER_SURFACE = 1, WATER_FALLING = 2;

// Ta sama fala co w shaderze wody (WaterWave.js) - liść unosi się razem
// z taflą.
export function waterWave(x, z, time) {
    return Math.sin(x * 0.9 + time * 1.3) * 0.5
        + Math.sin(z * 1.3 - time * 1.05) * 0.35
        + Math.sin((x + z) * 0.45 + time * 0.7) * 0.15;
}

export const leafWater = {

    // Liczby ruchu dla CubeParticles.drift.
    drift: LEAF_DRIFT, wind: LEAF_WIND, wander: LEAF_WANDER, push: LEAF_FALL_PUSH,

    // Co jest w bloku (bx, by, bz) pod punktem (x, z): WATER_SURFACE
    // (out.top - wysokość tafli w świecie, z falą), WATER_FALLING albo
    // WATER_NONE (sucho, powietrze, blok).
    probe(world, x, z, by, out) {

        if (!world?.getBlockId) return WATER_NONE;

        const bx = Math.floor(x), bz = Math.floor(z);
        const id = world.getBlockId(bx, by, bz);

        if (getWaterLevel(id) < 0) return WATER_NONE;
        if (isFallingWaterId(id)) return WATER_FALLING;

        const height = waterSurfaceHeight(world, bx, by, bz, x - bx, z - bz);
        if (height <= 0) return WATER_NONE;

        // Nad tym blokiem jest jeszcze woda: stojąca - liść wypływa wyżej,
        // spadająca (dół wodospadu) - pływa pod nią, aż nurt go wyniesie.
        if (height >= 1) {
            const above = world.getBlockId(bx, by + 1, bz);
            if (getWaterLevel(above) >= 0) {
                out.top = by + 1;
                out.underFall = isFallingWaterId(above);
                out.deeper = !out.underFall;
                return WATER_SURFACE;
            }
        }

        out.deeper = false;
        out.underFall = false;
        out.top = by + height + LEAF_ABOVE_WATER
            + waterWave(x, z, plantWindUniforms.uTime.value) * plantWindUniforms.uWaveHeight.value;
        return WATER_SURFACE;

    },

    // Nurt [x, z] w blokach/s albo null.
    flow(world, x, y, z) {
        return world?.getWaterFlow?.(Math.floor(x), y, Math.floor(z)) ?? null;
    },

    floatSeconds() {
        return LEAF_FLOAT_SECONDS[0] + Math.random() * (LEAF_FLOAT_SECONDS[1] - LEAF_FLOAT_SECONDS[0]);
    }

};
