// Deterministic input shared by the Node CPU and real IndexedDB benchmarks.
export const SAVED_BENCH_CELLS = 16 * 128 * 16;
export const SAVED_BENCH_NOISE_COUNT = 64;
export const savedBenchCoordinates = index => ({ cx: 256 + Math.floor(index / 64), cz: index % 64 - 32 });

export function savedBenchBlocks(index, ids, noise = false) {
    const blocks = index % 2 || noise ? new Uint16Array(SAVED_BENCH_CELLS) : new Uint8Array(SAVED_BENCH_CELLS);
    if (noise) {
        let state = ((index + 1) * 2654435761) >>> 0;
        for (let n = 0; n < blocks.length; n++) {
            state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
            blocks[n] = state & 1023;
        }
        return blocks;
    }
    const height = 23 + index % 17;
    blocks.fill(ids.stone, 0, (height - 4) * 256);
    blocks.fill(ids.dirt, (height - 4) * 256, height * 256);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const top = height + ((x + z + index) % 3);
        for (let y = height; y < top; y++) blocks[y * 256 + z * 16 + x] = ids.dirt;
        blocks[top * 256 + z * 16 + x] = ids.grass;
    }
    for (let z = 4; z < 10; z++) for (let x = 4; x < 10; x++) {
        blocks[(height + 6) * 256 + z * 16 + x] = ids.planks;
    }
    blocks[12 * 256 + 17] = 0;
    blocks[(height + 3) * 256 + 3] = index % 2 ? ids.modern : ids.planks;
    return blocks;
}

export function savedBenchSignature(blocks) {
    let result = 2166136261;
    for (let i = 0; i < blocks.length; i++) result = Math.imul(result ^ blocks[i], 16777619);
    return result >>> 0;
}
