// ------------------------------------------------------------
// ZIEMIA Z CHARAKTEREM (1.25.0)
//
// Od tego, na czym roślina stoi, zależy, jak szybko rośnie:
//   czarnoziem (i pole z niego)        - szybciej,
//   ziemia kamienista (i pole z niej)  - wolniej,
//   pole z kompostem                   - najszybciej (fertilizers.js),
//   woda w pobliżu                     - jeszcze trochę szybciej.
// Mnożniki się mnożą: pole z kompostem przy wodzie to 1,5 x 1,25.
//
// Liczy się blok dokładnie pod rośliną (sadzonka, młody krzew, roślina
// niska, owocujący krzak). Owoce w koronie drzewa i w wysokim krzewie
// nie stoją na ziemi - rosną zwykłym tempem.
//
// Woda: w odległości WATER_REACH bloków w poziomie, na wysokości ziemi
// albo jeden blok niżej (staw, rzeka, rów z wodą).
//
// Kto to liczy: game/PlantGrowth.js. Podgląd w grze: /ziemia.
// ------------------------------------------------------------

import { getBlockId, getBlockTypeById, getBlockDefinition, getWaterLevel } from './BlockRegistry.js';
import { FIELDS } from './fertilizers.js';

// Mnożnik wzrostu dla bloku pod rośliną (czego tu nie ma: 1).
export const SOIL_GROWTH = {
    humus: 1.3,
    coarse_dirt: 0.7,
    ...Object.fromEntries(Object.entries(FIELDS).filter(([, field]) => field.growth !== 1).map(([type, field]) => [type, field.growth]))
};

export const WATER_REACH = 3;
export const WATER_GROWTH = 1.25;

// To samo po numerach bloków (szybki odczyt w pętli wzrostu).
export const SOIL_GROWTH_ID = new Map(Object.entries(SOIL_GROWTH).map(([type, growth]) => [getBlockId(type), growth]));

export function soilGrowth(type) {
    return Object.hasOwn(SOIL_GROWTH, type ?? '') ? SOIL_GROWTH[type] : 1;
}

export function isSoilId(id) {
    return Boolean(getBlockDefinition(getBlockTypeById(id))?.soil);
}

// Czy przy ziemi w (x, y, z) jest woda.
export function nearWater(world, x, y, z) {
    for (let dy = 0; dy >= -1; dy--) {
        for (let dx = -WATER_REACH; dx <= WATER_REACH; dx++) {
            for (let dz = -WATER_REACH; dz <= WATER_REACH; dz++) {
                if (getWaterLevel(world.getBlockId(x + dx, y + dy, z + dz)) >= 0) return true;
            }
        }
    }
    return false;
}

// Opis ziemi w (x, y, z): { type, soil, growth, water, total }.
export function soilInfo(world, x, y, z) {
    const id = world.getBlockId(x, y, z);
    const type = getBlockTypeById(id);
    const soil = isSoilId(id);
    const growth = soilGrowth(type);
    const water = soil && nearWater(world, x, y, z);
    return { type, soil, growth, water, total: soil ? growth * (water ? WATER_GROWTH : 1) : 1 };
}
