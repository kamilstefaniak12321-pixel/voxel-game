// ------------------------------------------------------------
// SKRZYNIA - BLOK (0.78.0)
//
// Cztery numery - przód skrzyni zwrócony na północ, wschód, południe
// albo zachód (w stronę gracza, który ją postawił). W ekwipunku jest
// jedna "Skrzynia" (chest - przodem na północ); BlockPlacer wybiera
// wersję po kierunku patrzenia (pole facings).
// Model rysuje ChestRenderer.js (ChestGeometry.js - ten sam model co
// ikonka i widok w ekwipunku); mesher chunków go pomija (model 'chest').
// Zawartość - ChestState.js / Chests.js.
// ------------------------------------------------------------

export const CHEST_FACINGS = ['north', 'east', 'south', 'west'];
export const CHEST_FIRST_ID = 10095;

const typeOf = (facing) => facing === 'north' ? 'chest' : `chest_${facing}`;
const facings = Object.fromEntries(CHEST_FACINGS.map((facing) => [facing, typeOf(facing)]));

export const CHEST_BLOCKS = Object.fromEntries(CHEST_FACINGS.map((facing, index) => [typeOf(facing), {
    id: CHEST_FIRST_ID + index,
    name: 'Chest',
    label: 'Skrzynia',
    solid: true,
    opaque: false,
    model: 'chest',
    chest: { facing },
    facings,
    ...(facing === 'north' ? {} : { inventory: false, creative: false }),
    category: 'drewno',
    sound: 'wood',
    hardness: 1.2,
    pick: 'chest',
    drops: 'chest',
    textures: { all: 'oak_planks' }
}]));

export function isChestId(id) {
    return id >= CHEST_FIRST_ID && id < CHEST_FIRST_ID + CHEST_FACINGS.length;
}

export function isChestType(type) {
    return typeof type === 'string' && Object.hasOwn(CHEST_BLOCKS, type);
}

export function chestFacing(type) {
    return CHEST_BLOCKS[type]?.chest.facing ?? null;
}

// Przód skrzyni w stronę gracza: yaw - obrót gracza (patrzy w stronę
// (-sin yaw, -cos yaw)).
export function chestFacingForYaw(yaw) {
    const x = Math.sin(yaw), z = Math.cos(yaw);
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'east' : 'west';
    return z > 0 ? 'south' : 'north';
}

// Obrót modelu (przód na -z, czyli północ) wokół osi Y.
export const CHEST_ROTATION = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };
