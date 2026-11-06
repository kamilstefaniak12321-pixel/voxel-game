import { getBlockId } from '../blocks/BlockRegistry.js';

// These are atlas variants only. Existing block IDs, inventory items and saves
// retain the same meaning; the mesher selects a picture when it builds a face.
export const PINE_TRANSITION_TEXTURES = [
    'pine_log_transition_1', 'pine_log_transition_2', 'pine_log_transition_3'
];
export const MOSS_CARPET_TEXTURES = ['moss_carpet', 'moss_carpet_2', 'moss_carpet_3'];

export const PINE_UPPER_ID = getBlockId('pine_log_upper');
const PINE_LOWER_ID = getBlockId('pine_log');
const PINE_RESIN_ID = getBlockId('pine_log_resin');

// Full-height chunks contain the whole vertical column, even at their X/Z
// boundary. Stop at a gap, stripped log or another species: the transition
// belongs to connected bark, not merely to a brown log somewhere below it.
// 0 = plain orange; 1/2/3 = dense/medium/sparse authored bark overlays.
export function pineBarkTransitionStage(blocks, index, y, layerStride) {
    if (blocks[index] !== PINE_UPPER_ID) return 0;
    for (let distance = 1; distance <= 3 && distance <= y; distance++) {
        const below = blocks[index - distance * layerStride];
        if (below === PINE_LOWER_ID || below === PINE_RESIN_ID) return distance;
        if (below !== PINE_UPPER_ID) break;
    }
    return 0;
}

// Independent of mesh order, chunk coordinates and the existing UV rotation.
// Negative coordinates use the same integer hash as positive coordinates.
export function mossCarpetVariant(x, y, z) {
    let hash = Math.imul(x, 1619) ^ Math.imul(y, 31337) ^ Math.imul(z, 6971) ^ 0x5bd1e995;
    hash = Math.imul(hash ^ (hash >>> 15), 0x45d9f3b);
    hash ^= hash >>> 16;
    return (hash >>> 0) % MOSS_CARPET_TEXTURES.length;
}
