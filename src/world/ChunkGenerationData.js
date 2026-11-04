import { Chunk } from './Chunk.js';
import { TerrainGenerationCache, generationCacheStats } from './terrain/GenerationCache.js';

export class ChunkGenerationData extends TerrainGenerationCache {

    generate(cx, cz, saved) {
        this.prepare();
        const started = performance.now();
        const chunk = new Chunk(cx, cz);
        const loaded = saved !== undefined && chunk.loadBlocks(saved);
        if (loaded) {
            this.generator.fillFlow?.(chunk);
        } else {
            this.generator.generateChunk(chunk);
            chunk.updateSolidBelow();
        }
        return {
            cx, cz, blocks: chunk.blocks, flow: chunk.flow, tint: chunk.tint, biomes: chunk.biomes,
            blockCount: chunk.blockCount, maxY: chunk.maxY,
            solidBelow: chunk.solidBelow, growing: [...chunk.growing],
            modified: loaded, invalidSaved: saved !== undefined && !loaded,
            workerMs: performance.now() - started,
            resets: this.resets, cache: generationCacheStats(this.generator)
        };
    }
}

export function generationTransfers(data) {
    return [data.blocks, data.flow, data.tint, data.biomes].filter(Boolean).map(array => array.buffer);
}
