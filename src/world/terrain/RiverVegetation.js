import { SEA_LEVEL } from '../../config.js';
import { getBlockId } from '../../blocks/BlockRegistry.js';

// Małe siedliska mają wspólne, ciągłe pole niezależne od chunków.
// Nie pytamy generatora o sąsiednie kolumny: odległość od brzegu,
// głębokość i prędkość wody są już w próbce hydrologii.
function random(seed, x, z, salt) {
    let h = seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(a, b, value) {
    const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

function patch(seed, x, z, size, salt) {
    const gx = Math.floor(x / size), gz = Math.floor(z / size);
    const tx = smooth(0, 1, x / size - gx), tz = smooth(0, 1, z / size - gz);
    const a = random(seed, gx, gz, salt), b = random(seed, gx + 1, gz, salt);
    const c = random(seed, gx, gz + 1, salt), d = random(seed, gx + 1, gz + 1, salt);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

function suitable(sample, biome) {
    return !sample.ocean && (sample.mountains ?? 0) < 0.45 &&
        sample.height < SEA_LEVEL + 38 &&
        biome !== 'snowy' && biome !== 'alpine' && biome !== 'rocky';
}

export class RiverVegetation {
    constructor(seed) {
        this.seed = seed;
        this.ids = Object.fromEntries([
            'river_sedge', 'cattail', 'purple_loosestrife', 'reed',
            'water_milfoil', 'water_lily', 'duckweed', 'cattail_water'
        ].map(type => [type, getBlockId(type)]));
    }

    shoreAt(x, z, sample, biome, kind) {
        if ((kind !== 'grass' && kind !== 'sand') || sample.water > sample.height || !suitable(sample, biome)) return 0;
        const gap = Math.min(sample.riverGap ?? Infinity, sample.lakeGap ?? Infinity);
        if (gap < 0 || gap >= 5) return 0;

        const cover = patch(this.seed, x, z, 13, 71);
        // Przerwy między kępami pozostają porośnięte zwykłą niską
        // roślinnością biomu. Brzeg nie staje się jednolitą ścianą.
        const density = (0.08 + 0.6 * smooth(0.28, 0.75, cover)) * (1 - smooth(1.5, 5, gap));
        if (random(this.seed, x, z, 72) >= density) return 0;
        const species = patch(this.seed, x, z, 19, 73);
        const mix = random(this.seed, x, z, 74);
        if (gap < 1.5 && species > 0.56 && mix < 0.65) return this.ids.cattail;
        if (gap < 2.5 && species < 0.4 && mix < 0.4) return this.ids.reed;
        if (gap > 0.4 && species > 0.36 && species < 0.7 && mix < 0.25) return this.ids.purple_loosestrife;
        return this.ids.river_sedge;
    }

    fillWater(x, z, sample, biome, blocks) {
        const depth = sample.water - sample.height;
        if (depth < 1 || depth > 3 || !suitable(sample, biome) || (!sample.lake && sample.river !== 1)) return;
        const speed = Math.hypot(sample.flowX ?? 0, sample.flowZ ?? 0);
        // Środek nurtu, bystrza i głębokie jeziora zostają wolne.
        const gap = sample.riverGap ?? -Infinity;
        const edge = sample.lake ? depth <= 2 : gap > -1.65;
        if (!edge || speed > 1.5) return;

        const cover = patch(this.seed, x, z, 11, 75);
        const shelter = smooth(0.3, 0.76, cover);
        const roll = random(this.seed, x, z, 76);
        let surface = 0;
        // Pływające liście tylko w spokojnej wodzie blisko brzegu.
        // Rzęsa ma rzadsze, małe płaty; nie zakrywa całej tafli.
        if (speed < 1.05 && roll < 0.22 * shelter) {
            const species = patch(this.seed, x, z, 23, 77);
            surface = species < 0.4 && depth <= 2 ? this.ids.duckweed : this.ids.water_lily;
        }

        let root = 0;
        if (depth === 1 && !surface && random(this.seed, x, z, 78) < 0.22 * shelter) {
            root = this.ids.cattail_water;
        } else if (random(this.seed, x, z, 79) < (0.08 + 0.3 * shelter) * (1 - smooth(0.85, 1.5, speed))) {
            root = this.ids.water_milfoil;
        }
        if (root && (depth > 1 || !surface)) blocks[sample.height + 1] = root;
        if (surface) blocks[sample.water] = surface;
    }
}
