import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { MAX_BLOCK_ID, isSolidId, isLiquidId, getLiquidKindId } from '../blocks/BlockRegistry.js';

// The same solid/liquid column rule used by FarTerrain, without retaining a
// full block array for every old player edit. IDs stay IDs, never atlas colors.
const surfaceIds = new Uint16Array(MAX_BLOCK_ID + 1);
const visible = new Uint8Array(MAX_BLOCK_ID + 1);
for (let id = 0; id <= MAX_BLOCK_ID; id++) {
    if (isSolidId(id) || isLiquidId(id)) {
        visible[id] = 1;
        surfaceIds[id] = getLiquidKindId(id) || id;
    }
}

export function summarizeSavedChunk(blocks) {
    if (!blocks) return null;
    const columns = CHUNK_SIZE * CHUNK_SIZE;
    const heights = new Uint8Array(columns);
    const materials = new Uint16Array(columns);
    for (let column = 0; column < columns; column++) {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const id = blocks[y * columns + column];
            if (!visible[id]) continue;
            heights[column] = y + 1;
            materials[column] = surfaceIds[id];
            break;
        }
    }
    return { heights, materials };
}
