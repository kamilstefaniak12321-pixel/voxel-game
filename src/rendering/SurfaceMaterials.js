import { MAX_BLOCK_ID, getBlockId, getBlockTypeById } from '../blocks/BlockRegistry.js';

// Wspólna kolejność i wybór tekstur dla bloków oraz ich dalekich powierzchni.
// Ten moduł nie używa DOM ani Three.js: działa również w workerze.
export const SURFACE_FACE_NAMES = ['right', 'left', 'top', 'bottom', 'front', 'back'];
export const SURFACE_TINT_TYPES = ['grass_warm', 'grass_cool', 'grass_high'];
export const SURFACE_MATERIAL_COUNT = MAX_BLOCK_ID + 1 + SURFACE_TINT_TYPES.length;

export function getSurfaceFaceTexture(textures, faceName) {
    if (textures.all) return textures.all;
    if (textures[faceName]) return textures[faceName];
    if (['right', 'left', 'front', 'back'].includes(faceName)) return textures.side;
    if (faceName === 'top') return textures.top;
    if (faceName === 'bottom') return textures.bottom;
    throw new Error(`Brak tekstury dla ściany: ${faceName}`);
}

// Zwykłe materiały zachowują ID bloku, również dla paczek drzew. Numery
// powyżej 255 opisują tylko odcienie LOD; nigdy nie trafiają do zapisu świata.
export function surfaceMaterialId(type) {
    const tint = SURFACE_TINT_TYPES.indexOf(type);
    if (tint >= 0) return MAX_BLOCK_ID + 1 + tint;
    return getBlockId(type === 'rock' ? 'stone' : type);
}

export function surfaceMaterialType(id) {
    return id > MAX_BLOCK_ID ? SURFACE_TINT_TYPES[id - MAX_BLOCK_ID - 1] ?? null : getBlockTypeById(id);
}
