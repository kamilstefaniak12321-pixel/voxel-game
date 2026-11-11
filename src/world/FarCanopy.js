import { isLeavesId } from '../blocks/BlockRegistry.js';
import { canopyTint, canopyTransmission } from './CanopyPolicy.js';

// RGB555 uses the unused fourth normal byte and albedo alpha. Position.w is
// deliberately preserved: the distant shadow shader needs its shadow base.
export const OPEN_CANOPY_PACKED = 32767;
export function packCanopy(color) {
    return Math.round(color[0] * 31) * 1024 + Math.round(color[1] * 31) * 32 + Math.round(color[2] * 31);
}
export function unpackCanopy(packed) {
    return [Math.floor(packed / 1024), Math.floor(packed / 32) % 32, packed % 32].map(value => value / 31);
}

// A short-lived spatial index of the already generated crown boxes. Integrate
// their vertical union rather than counting overlapping silhouette boxes twice.
// Queries are shared on a 4 x 4 x 2 grid; no world-generator or voxel scans.
export function createFarCanopySampler(data, boxes, palette) {
    const grid = 4, buckets = new Map(), cache = new Map(), seen = new Set();
    const white = [1, 1, 1];
    for (const at of boxes) {
        const material = data[at + 6];
        if (!isLeavesId(material)) continue;
        const identity = Array.from(data.subarray(at, at + 7)).join(',');
        if (seen.has(identity)) continue;
        seen.add(identity);
        const color = [0, 1, 2].map(c => ((palette?.[material * 18 + 6 + c] ?? 128) / 255) ** 2);
        for (let gz = Math.floor(data[at + 2] / grid); gz < Math.ceil(data[at + 5] / grid); gz++) {
            for (let gx = Math.floor(data[at] / grid); gx < Math.ceil(data[at + 3] / grid); gx++) {
                const overlapX = Math.max(0, Math.min(data[at + 3], (gx + 1) * grid) - Math.max(data[at], gx * grid));
                const overlapZ = Math.max(0, Math.min(data[at + 5], (gz + 1) * grid) - Math.max(data[at + 2], gz * grid));
                const key = (gx + 8192) + (gz + 8192) * 16384;
                if (!buckets.has(key)) buckets.set(key, []);
                buckets.get(key).push({ low: data[at + 1], high: data[at + 4], color,
                    coverage: overlapX * overlapZ / (grid * grid) });
            }
        }
    }
    function column(gx, gy, gz) {
        const columnKey = (gx + 8192) + (gz + 8192) * 16384;
        const key = columnKey + gy * 268435456;
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
        const entries = buckets.get(columnKey);
        if (!entries) { cache.set(key, white); return white; }
        const y = gy * 2, heights = [y];
        for (const entry of entries) if (entry.high > y) heights.push(Math.max(y, entry.low), entry.high);
        heights.sort((a, b) => a - b);
        const sum = [0, 0, 0];
        let layers = 0, coverage = 0;
        for (let i = 1; i < heights.length; i++) {
            const depth = heights[i] - heights[i - 1];
            if (depth === 0) continue;
            const middle = (heights[i] + heights[i - 1]) * .5;
            let weight = 0, cover = 0;
            const color = [0, 0, 0];
            for (const entry of entries) if (middle >= entry.low && middle < entry.high) {
                cover = Math.max(cover, entry.coverage);
                weight += entry.coverage;
                for (let c = 0; c < 3; c++) color[c] += entry.color[c] * entry.coverage;
            }
            if (weight === 0) continue;
            coverage = Math.max(coverage, cover);
            layers += depth * cover;
            for (let c = 0; c < 3; c++) sum[c] += color[c] / weight * depth * cover;
        }
        const transmission = canopyTransmission(layers);
        const tint = canopyTint(sum);
        const result = layers === 0 ? [1, 1, 1] : tint.map(value => 1 - coverage + coverage * transmission * value);
        cache.set(key, result);
        return result;
    }
    const result = [1, 1, 1];
    return {
        sample(x, y, z) {
            const fx = x / grid - .5, fz = z / grid - .5;
            const gx = Math.floor(fx), gz = Math.floor(fz), gy = Math.ceil(y / 2);
            const tx = fx - gx, tz = fz - gz;
            result.fill(0);
            for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
                const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
                if (!weight) continue;
                const rgb = column(gx + dx, gy, gz + dz);
                for (let c = 0; c < 3; c++) result[c] += weight * rgb[c];
            }
            return result;
        }
    };
}

export function bakeFarCanopy(positions, normals, albedo, data, boxes, x0, z0, palette) {
    const sampler = createFarCanopySampler(data, boxes, palette);
    const points = new Map();
    for (let p = 0; p < positions.length; p += 4) {
        // All face corners are integer XYZ. Sampling already quantizes height
        // to two blocks, so adjacent faces share exactly the same RGB555 result.
        const x = x0 + positions[p], y = positions[p + 1], z = z0 + positions[p + 2];
        const key = (x + 32768) + (z + 32768) * 65536 + Math.ceil(y / 2) * 4294967296;
        let packed = points.get(key);
        if (packed === undefined) {
            packed = packCanopy(sampler.sample(x, y, z));
            points.set(key, packed);
        }
        normals[p + 3] = (packed % 256) - 128;
        albedo[p + 3] = Math.floor(packed / 256);
    }
}
