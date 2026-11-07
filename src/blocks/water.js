import { WATER_SURFACE } from '../config.js';

// Persistent IDs: old worlds keep source water at 12. Internal flow states
// use the existing Uint16 save format and never become inventory items.
export const WATER_SOURCE_ID = 12;
export const WATER_FLOW_FIRST_ID = 10100;
export const WATER_FALLING_ID = 10107;

// Spadająca woda pamięta, ile bloków już spada (0.73.0): 10107 - pierwszy
// blok pod krawędzią (1), 10108-10122 - 2..16 bloków; dłuższy spadek
// zostaje na 16. Każdy blok spadającej wody bierze liczbę z bloku nad sobą
// i dodaje 1 - na dole wiadomo, z jakiej wysokości woda spadła (rozbryzg,
// piana i szybsza animacja - WaterfallEffects.js, waterMaterial).
export const WATER_FALL_MAX = 16;
export const WATER_FALLING_LAST_ID = WATER_FALLING_ID + WATER_FALL_MAX - 1;

const waterBlock = (id) => ({ id, name: 'Flowing Water', label: 'Płynąca woda',
    solid: false, opaque: false, liquid: true, inventory: false, creative: false,
    drops: null, pick: 'water', textures: { all: 'water' } });

export const FLOWING_WATER_BLOCKS = Object.fromEntries([
    ...Array.from({ length: 7 }, (_, index) => [`water_flow_${index + 1}`, waterBlock(WATER_FLOW_FIRST_ID + index)]),
    ['water_falling', waterBlock(WATER_FALLING_ID)],
    ...Array.from({ length: WATER_FALL_MAX - 1 }, (_, index) => [`water_falling_${index + 2}`, waterBlock(WATER_FALLING_ID + index + 1)])
]);

export function isFallingWaterId(id) {
    return id >= WATER_FALLING_ID && id <= WATER_FALLING_LAST_ID;
}

// Ile bloków spada woda w tym bloku (1-16); 0 - to nie spadająca woda.
export function waterFallDistance(id) {
    return isFallingWaterId(id) ? id - WATER_FALLING_ID + 1 : 0;
}

export function fallingWaterId(distance) {
    return WATER_FALLING_ID + Math.min(WATER_FALL_MAX, Math.max(1, Math.floor(distance) || 1)) - 1;
}

export function plainWaterLevel(id) {
    return id === WATER_SOURCE_ID ? 0
        : id >= WATER_FLOW_FIRST_ID && id < WATER_FALLING_ID ? id - WATER_FLOW_FIRST_ID + 1
        : isFallingWaterId(id) ? 8 : -1;
}

export function waterIdForLevel(level) {
    return level === 0 ? WATER_SOURCE_ID
        : Number.isInteger(level) && level >= 1 && level <= 8 ? WATER_FLOW_FIRST_ID + level - 1 : 0;
}

export function waterHeightForLevel(level) {
    return level === 8 ? 1 : level >= 0 && level <= 7 ? WATER_SURFACE * (8 - level) / 8 : 0;
}
