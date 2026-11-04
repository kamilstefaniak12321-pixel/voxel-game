import { createGenerator } from './generators.js';

export const GENERATION_CACHE_LIMITS = Object.freeze({
    zones: 32, heightTiles: 512, drainageCells: 100000, routes: 2048
});

export function generationCacheStats(generator) {
    const rivers = generator?.rivers;
    return {
        zones: rivers?.zones.size ?? 0,
        heightTiles: rivers?.tiles.size ?? 0,
        drainageCells: rivers?.downs.size ?? 0,
        routes: rivers?.runs.length ?? 0
    };
}

// A whole generator is replaced between jobs. River maps share references and
// removing individual routes/lakes would make neighbouring chunks disagree.
// These are retention thresholds, not hard byte limits: the current job may
// add one region/tile before the next job replaces the generator.
export class TerrainGenerationCache {
    constructor(terrain, seed, limits = GENERATION_CACHE_LIMITS) {
        this.terrain = terrain;
        this.seed = seed;
        this.limits = limits;
        this.resets = 0;
        this.generator = createGenerator(terrain, seed);
    }

    prepare() {
        const previous = generationCacheStats(this.generator);
        if (Object.keys(this.limits).some(key => previous[key] >= this.limits[key])) {
            this.generator = createGenerator(this.terrain, this.seed);
            this.resets++;
        }
        return this.generator;
    }
}
