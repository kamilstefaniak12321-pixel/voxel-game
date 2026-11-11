import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { BLOCK_TYPES, getBlockTypeById, isLeavesId, isOpaqueId } from '../blocks/BlockRegistry.js';
import * as atlas from './TextureAtlas.js';
import { canopyTint } from '../world/CanopyPolicy.js';

const S = CHUNK_SIZE, H = CHUNK_HEIGHT, LAYER = S * S;
const materials = new Map();
atlas.atlasAveragesReady?.then(() => materials.clear());

export function leafCanopyColor(id, climate = [1, 1, 1]) {
    let material = materials.get(id);
    if (!material) {
        const definition = BLOCK_TYPES[getBlockTypeById(id)];
        const texture = definition?.textures?.all ?? definition?.textures?.side;
        const average = atlas.getAtlasAverage?.(texture);
        material = { color: average ? [average.r, average.g, average.b] : [.35, .55, .2],
            tinted: definition?.tint === true };
        if (average) materials.set(id, material);
    }
    return material.color.map((value, channel) => value * (material.tinted ? climate[channel] : 1));
}

// Transient column cache: used by one geometry job, then discarded. No scans
// occur in the render loop and no retained per-world color volume is needed.
export function createCanopySampler(world, colorOfLeaf = leafCanopyColor) {
    const columns = new Map();
    function column(x, z) {
        const key = `${x},${z}`;
        if (columns.has(key)) return columns.get(key);
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = world.getChunk(cx, cz);
        if (!chunk) { columns.set(key, null); return null; }
        const lx = x - cx * S, lz = z - cz * S, at = lz * S + lx;
        const climate = [1, 1, 1], grid = chunk.tint;
        if (grid) for (let c = 0; c < 3; c++) {
            const p = (lz * (S + 1) + lx) * 3 + c;
            climate[c] = (grid[p] + grid[p + 3] + grid[p + (S + 1) * 3] + grid[p + (S + 2) * 3]) / (4 * 128);
        }
        let result = null, layers = 0;
        const sum = [0, 0, 0];
        for (let y = Math.min(H, chunk.maxY) - 1; y >= 0; y--) {
            const id = chunk.blocks[y * LAYER + at];
            if (isOpaqueId(id)) break;
            if (layers) {
                const filter = canopyTint(sum);
                for (let c = 0; c < 3; c++) result[y * 3 + c] = Math.round(filter[c] * 255);
            }
            if (isLeavesId(id)) {
                if (!result) result = new Uint8Array(H * 3).fill(255);
                const color = colorOfLeaf(id, climate);
                for (let c = 0; c < 3; c++) sum[c] += color[c];
                layers++;
            }
        }
        columns.set(key, result);
        return result;
    }
    const result = new Float32Array(3);
    return {
        sample(x, y, z) {
            result.fill(1);
            const iy = Math.floor(y);
            if (iy < 0 || iy >= H) return result;
            const x0 = Math.floor(x - .5), z0 = Math.floor(z - .5);
            const tx = x - .5 - x0, tz = z - .5 - z0;
            result.fill(0);
            for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
                const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
                if (weight === 0) continue;
                const data = column(x0 + dx, z0 + dz);
                for (let c = 0; c < 3; c++) result[c] += weight * (data ? data[iy * 3 + c] / 255 : 1);
            }
            return result;
        },
        get columns() { return columns.size; }
    };
}

export const CANOPY_LIGHTING_GLSL = /* glsl */ `
    vec3 canopySkyTint(vec3 tint) {
        float enabled = uAtmosphericLight * uLightingNatural * uSurfaceMaterials
            * uLeafTransmission * uLightingMaterial.x;
        return mix(vec3(1.0), tint, clamp(enabled, 0.0, 1.0));
    }
`;
