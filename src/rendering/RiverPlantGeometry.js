import { WATER_SURFACE } from '../config.js';

// Small reusable templates, appended to the ordinary chunk plant batch. There
// are no Object3Ds, materials or draw calls per plant. Colours are linear RGB
// multipliers for the neutral, lightly textured snow atlas tile.
const linear = (hex) => [16, 8, 0].map((shift) => {
    const value = ((hex >> shift) & 255) / 255;
    return Math.round((value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * 255);
});
const COLORS = {
    leaf: linear(0x668943), light: linear(0x83a452), dark: linear(0x456c37),
    stem: linear(0x6a8142), reed: linear(0x80914c), brown: linear(0x765037),
    brownTop: linear(0x9b7951), purple: linear(0xad659b), pink: linear(0xcb85ad),
    submerged: linear(0x52794a), pad: linear(0x5d873e), padLight: linear(0x739648),
    white: linear(0xf1eadb), petalPink: linear(0xe6b5c8), pollen: linear(0xd6ae4f),
};
const cache = new Map();

// Wspólne z mesherem i celownikiem: ta sama odmiana, obrót i pozycja.
export function plantRandom(x, y, z, salt) {
    let h = Math.imul(x, 668265263) ^ Math.imul(y, 374761393) ^
        Math.imul(z, 2246822519) ^ Math.imul(salt, 3266489917);
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export function riverPlantTransform(x, y, z) {
    const angle = plantRandom(x, y, z, 23) * Math.PI * 2;
    return {
        variant: Math.floor(plantRandom(x, y, z, 19) * 8),
        cos: Math.cos(angle), sin: Math.sin(angle),
        x: 0.5 + (plantRandom(x, y, z, 31) - 0.5) * 0.12,
        z: 0.5 + (plantRandom(x, y, z, 37) - 0.5) * 0.12
    };
}

function randomFor(seed) {
    let value = seed | 0;
    return () => {
        value = Math.imul(value ^ (value >>> 15), 2246822519);
        value = Math.imul(value ^ (value >>> 13), 3266489917);
        value ^= value >>> 16;
        return (value >>> 0) / 4294967296;
    };
}

function makeTemplate(kind, variant, waterlogged) {
    const faces = [];
    const random = randomFor(8191 + variant * 6299);
    const floating = kind === 'lily' || kind === 'duckweed';
    const movement = floating ? 255 : kind === 'milfoil' ? 128 : 0;
    const motionHeight = kind === 'cattail' ? 1.9 : kind === 'loosestrife' ? 1.25 : 1;

    function quad(a, b, c, d, color, double = false) {
        let ux = c[0] - a[0], uy = c[1] - a[1], uz = c[2] - a[2];
        let vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.hypot(nx, ny, nz) < 1e-10) {
            ux = d[0] - c[0]; uy = d[1] - c[1]; uz = d[2] - c[2];
            vx = b[0] - c[0]; vy = b[1] - c[1]; vz = b[2] - c[2];
            nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx;
        }
        const length = Math.hypot(nx, ny, nz) || 1;
        const vertices = [a, b, c, d];
        const weights = vertices.map((p) => floating ? 255 : Math.round(Math.min(1, Math.max(0, p[1] / motionHeight)) * 255));
        faces.push({ vertices, normal: [nx / length, ny / length, nz / length], color, weights, movement });
        if (double) faces.push({ vertices: [a, c, b, d], normal: [-nx / length, -ny / length, -nz / length], color, weights: [weights[0], weights[2], weights[1], weights[3]], movement });
    }

    function box(x, z, bottom, top, width, depth, color, cap = color) {
        const x0 = x - width / 2, x1 = x + width / 2;
        const z0 = z - depth / 2, z1 = z + depth / 2;
        quad([x1, top, z1], [x1, top, z0], [x1, bottom, z1], [x1, bottom, z0], color);
        quad([x0, top, z0], [x0, top, z1], [x0, bottom, z0], [x0, bottom, z1], color);
        quad([x1, top, z0], [x0, top, z0], [x1, bottom, z0], [x0, bottom, z0], color);
        quad([x0, top, z1], [x1, top, z1], [x0, bottom, z1], [x1, bottom, z1], color);
        if (cap) quad([x0, top, z0], [x1, top, z0], [x0, top, z1], [x1, top, z1], cap);
    }

    function blade(x, z, bottom, angle, height, spread, width, color, bent = true) {
        const dx = Math.cos(angle), dz = Math.sin(angle);
        const sx = -dz * width / 2, sz = dx * width / 2;
        const rootL = [x - sx, bottom, z - sz], rootR = [x + sx, bottom, z + sz];
        const tip = [x + dx * spread, bottom + height, z + dz * spread];
        if (bent) {
            const midL = [x + dx * spread * 0.32 - sx * 0.7, bottom + height * 0.72, z + dz * spread * 0.32 - sz * 0.7];
            const midR = [x + dx * spread * 0.32 + sx * 0.7, bottom + height * 0.72, z + dz * spread * 0.32 + sz * 0.7];
            quad(midL, midR, rootL, rootR, color, true);
            quad(tip, tip, midL, midR, color, true);
        } else {
            // A pointed leaf uses one triangle (the other is degenerate).
            quad(tip, tip, rootL, rootR, color, true);
        }
    }

    if (kind === 'sedge') {
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3 + random() * 0.35;
            blade((random() - 0.5) * 0.1, (random() - 0.5) * 0.1, 0,
                angle, 0.4 + random() * 0.46, 0.27 + random() * 0.15, 0.065 + random() * 0.035,
                i % 3 === 0 ? COLORS.light : COLORS.leaf);
        }
    } else if (kind === 'cattail') {
        for (let i = 0; i < 2; i++) {
            const x = (i - 0.5) * 0.23, z = (random() - 0.5) * 0.22;
            const top = (waterlogged ? 1.72 : 1.48) + random() * 0.16 - i * 0.15;
            box(x, z, 0, top + 0.05, 0.026, 0.026, COLORS.stem);
            box(x, z, top - 0.3, top, 0.075, 0.075, COLORS.brown, COLORS.brownTop);
            for (let j = 0; j < 2; j++) {
                blade(x, z, 0, i * 2.3 + j * 2.8 + random() * 0.4,
                    top * (0.53 + random() * 0.12), 0.28, 0.075, j ? COLORS.reed : COLORS.leaf);
            }
        }
    } else if (kind === 'loosestrife') {
        for (let i = 0; i < 2; i++) {
            const x = (i - 0.5) * 0.23, z = (random() - 0.5) * 0.2;
            const top = 0.96 + random() * 0.26 - i * 0.13;
            box(x, z, 0, top, 0.025, 0.025, COLORS.dark, null);
            for (let j = 0; j < 3; j++) {
                const level = top * (0.3 + j * 0.17);
                blade(x, z, level, i * 2 + j * 2.5, 0.07, 0.19 - j * 0.025, 0.09, COLORS.leaf, false);
            }
            // Three stepped, four-sided tiers make a solid flower spike,
            // with an irregular profile rather than a crossed flower image.
            for (let j = 0; j < 3; j++) {
                const bottom = top - 0.27 + j * 0.105;
                box(x + (j % 2) * 0.016, z, bottom, bottom + 0.09,
                    0.13 - j * 0.03, 0.105 - j * 0.02, j % 2 ? COLORS.pink : COLORS.purple);
            }
        }
    } else if (kind === 'milfoil') {
        for (let stem = 0; stem < 2; stem++) {
            const x = (stem - 0.5) * 0.22, z = (random() - 0.5) * 0.15;
            const top = 0.69 + random() * 0.12 - stem * 0.1;
            box(x, z, 0, top, 0.018, 0.018, COLORS.dark);
            for (let tier = 0; tier < 3; tier++) {
                const level = top * (0.28 + tier * 0.25);
                for (let arm = 0; arm < 3; arm++) {
                    const angle = arm * Math.PI * 2 / 3 + tier * 0.75 + stem;
                    blade(x, z, level, angle, 0.08, 0.23 - tier * 0.035, 0.065, COLORS.submerged, false);
                }
            }
        }
    } else if (kind === 'lily') {
        const level = WATER_SURFACE + 0.055;
        const radius = 0.29 + random() * 0.05;
        const center = [-0.035, level, 0.025];
        // Seven sectors leave the characteristic triangular notch in the pad.
        for (let i = 0; i < 7; i++) {
            const a = (i + 0.5) * Math.PI / 4, b = a + Math.PI / 4;
            const p = [center[0] + Math.cos(a) * radius, level, center[2] + Math.sin(a) * radius * 0.86];
            const q = [center[0] + Math.cos(b) * radius, level, center[2] + Math.sin(b) * radius * 0.86];
            quad(center, p, q, q, i % 3 ? COLORS.pad : COLORS.padLight, true);
        }
        if (variant % 3 === 0) {
            const flowerColor = variant % 2 ? COLORS.petalPink : COLORS.white;
            const cx = 0.13, cz = -0.09;
            for (let petal = 0; petal < 5; petal++) {
                const angle = petal * Math.PI * 2 / 5;
                const dx = Math.cos(angle), dz = Math.sin(angle), sx = -dz * 0.045, sz = dx * 0.045;
                quad([cx + dx * 0.15, level + 0.105, cz + dz * 0.15], [cx + dx * 0.15, level + 0.105, cz + dz * 0.15],
                    [cx - sx, level + 0.035, cz - sz], [cx + sx, level + 0.035, cz + sz], flowerColor, true);
            }
            box(cx, cz, level + 0.035, level + 0.09, 0.07, 0.07, COLORS.pollen);
        }
    } else if (kind === 'duckweed') {
        const level = WATER_SURFACE + 0.05;
        for (let i = 0; i < 6; i++) {
            const x = (random() - 0.5) * 0.59, z = (random() - 0.5) * 0.59;
            const size = 0.035 + random() * 0.025;
            quad([x - size, level, z - size * 0.65], [x + size, level, z - size * 0.65],
                [x - size, level, z + size * 0.65], [x + size, level, z + size * 0.65], i % 2 ? COLORS.padLight : COLORS.light, true);
        }
    }
    return faces;
}

export function getRiverPlantFaces(kind, variant, waterlogged = false) {
    const normalizedVariant = variant & 7;
    const key = `${kind}:${normalizedVariant}:${waterlogged ? 1 : 0}`;
    if (!cache.has(key)) cache.set(key, makeTemplate(kind, normalizedVariant, waterlogged));
    return cache.get(key);
}
