import { WATER_SURFACE } from '../config.js';

// Persistent IDs: old worlds keep source water at 12. Internal flow states
// use the existing Uint16 save format and never become inventory items.
export const WATER_SOURCE_ID = 12;
export const WATER_FLOW_FIRST_ID = 10100;
export const WATER_FALLING_ID = 10107;

export const FLOWING_WATER_BLOCKS = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [
    index === 7 ? 'water_falling' : `water_flow_${index + 1}`,
    { id: WATER_FLOW_FIRST_ID + index, name: 'Flowing Water', label: 'Płynąca woda',
        solid: false, opaque: false, liquid: true, inventory: false, creative: false,
        drops: null, pick: 'water', textures: { all: 'water' } }
]));

export function plainWaterLevel(id) {
    return id === WATER_SOURCE_ID ? 0
        : id >= WATER_FLOW_FIRST_ID && id <= WATER_FALLING_ID ? id - WATER_FLOW_FIRST_ID + 1 : -1;
}

export function waterIdForLevel(level) {
    return level === 0 ? WATER_SOURCE_ID
        : Number.isInteger(level) && level >= 1 && level <= 8 ? WATER_FLOW_FIRST_ID + level - 1 : 0;
}

export function waterHeightForLevel(level) {
    return level === 8 ? 1 : level >= 0 && level <= 7 ? WATER_SURFACE * (8 - level) / 8 : 0;
}
