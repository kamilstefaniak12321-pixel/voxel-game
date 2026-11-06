import { WATER_SURFACE } from '../config.js';
import { createPixelPlant } from './PixelPlantBuilder.js';
import { makeTuftTemplate } from './TuftGeometry.js';
import { getBlueberryFaces } from './BlueberryGeometry.js';
import { getFruitBushFaces } from './FruitBushGeometry.js';
import { getPlaneModelFaces } from './PlaneModelGeometry.js';

// Small reusable templates, appended to the ordinary chunk plant batch. There
// are no Object3Ds, materials or draw calls per plant. Colours are linear RGB
// multipliers for one neutral texel of the snow atlas tile.
const linear = (hex) => [16, 8, 0].map((shift) => {
    const value = ((hex >> shift) & 255) / 255;
    return Math.round((value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * 255);
});
const COLORS = {
    leaf: linear(0x668943), light: linear(0x83a452), dark: linear(0x456c37),
    stem: linear(0x6a8142), stemDark: linear(0x456c37), reed: linear(0x80914c), brown: linear(0x765037),
    brownTop: linear(0x9b7951), purple: linear(0xad659b), pink: linear(0xcb85ad),
    submerged: linear(0x52794a), pad: linear(0x5d873e), padLight: linear(0x739648),
    white: linear(0xf1eadb), petalPink: linear(0xe6b5c8), pollen: linear(0xd6ae4f),
};
const cache = new Map();
const MAX_CACHED_FACES = 65536;
const MAX_CACHED_MODELS = 512;
let cachedFaces = 0;

export function riverPlantCacheStats() {
    return { models: cache.size, faces: cachedFaces, maxFaces: MAX_CACHED_FACES, maxModels: MAX_CACHED_MODELS };
}

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
    const turn = Math.floor(plantRandom(x, y, z, 23) * 4);
    return {
        variant: Math.floor(plantRandom(x, y, z, 19) * 8),
        cos: [1, 0, -1, 0][turn], sin: [0, 1, 0, -1][turn],
        x: 0.5 + (Math.floor(plantRandom(x, y, z, 31) * 3) - 1) / 16,
        z: 0.5 + (Math.floor(plantRandom(x, y, z, 37) * 3) - 1) / 16
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
    const random = randomFor(8191 + variant * 6299);
    const pick = n => Math.floor(random() * n);
    const floating = kind === 'lily' || kind === 'duckweed';
    const movement = floating ? 255 : kind === 'milfoil' ? 128 : 0;
    const height = kind === 'cattail' ? 1.9 : kind === 'loosestrife' ? 1.25 : 1;
    const model = createPixelPlant(COLORS, floating, movement, height,
        { light: 'leaf', dark: 'leaf', reed: 'leaf', submerged: 'leaf', pad: 'leaf', padLight: 'leaf', stemDark: 'branch' });
    const { sheet, box } = model;

    if (kind === 'sedge') {
        for (const axis of [2, 0]) {
            sheet(axis, 0, ({ leaf }) => {
                leaf(-1, 0, -5, 7 + pick(3), 'leaf');
                leaf(-1, 0, -2, 11 + pick(3), 'light');
                leaf(0, 0, 0, 12 + pick(3), 'leaf');
                leaf(0, 0, 3, 10 + pick(3), 'reed');
                leaf(0, 0, 5, 6 + pick(3), 'leaf');
            });
        }
    } else if (kind === 'cattail') {
        for (let i=0; i<2; i++) {
            const x = i ? 2 : -3, z = i ? 1 : -2;
            const top = (waterlogged ? 27 : 24) + pick(3) - i * 2;
            // One-pixel square stems, two-pixel thick brown heads.
            box(x, 0, z, 1, top+1, 1, 'stem');
            box(x, top-5, z, 2, 5, 2, 'brown', 'brownTop');
            sheet(2, z, ({ leaf }) => {
                leaf(x + (i ? 1 : -2), 0, i ? 3 : -3, 12 + pick(4), 'leaf');
                leaf(x + (i ? -2 : 1), 0, i ? -2 : 2, 17 + pick(3), 'reed');
            });
            sheet(0, x, ({ leaf }) => leaf(z + (i ? -2 : 1), 0, i ? -3 : 3, 12 + pick(4), 'leaf'));
        }
    } else if (kind === 'loosestrife') {
        for (let i=0; i<2; i++) {
            const x = i ? 2 : -3, z = i ? 1 : -1, top = 18 + pick(3) - i*2;
            box(x, 0, z, 1, top, 1, 'stemDark');
            for (const axis of [2, 0]) sheet(axis, axis === 2 ? z : x, ({ rect }) => {
                const root = axis === 2 ? x : z;
                for (let y=4; y<top-5; y+=4) {
                    rect(root-2, y, 2, 1, 'leaf'); rect(root+1, y+1, 2, 1, 'light');
                }
            });
            // Alternating pixel clusters around the stem; exposed faces only.
            box(x-1, top-6, z, 3, 2, 1, 'purple', 'pink');
            box(x, top-4, z-1, 1, 2, 3, 'pink', 'purple');
            box(x, top-2, z, 1, 2, 1, 'pink');
        }
    } else if (kind === 'milfoil') {
        for (const axis of [2, 0]) sheet(axis, 0, ({ rect }) => {
            for (const root of [-2, 2]) {
                const top = 10 + pick(3);
                rect(root, 0, 1, top, 'dark');
                for (let y=2; y<top-1; y+=3) {
                    rect(root-2, y, 5, 1, 'submerged');
                    rect(root-3, y+1, 1, 1, 'leaf'); rect(root+3, y+1, 1, 1, 'leaf');
                }
            }
        });
    } else if (kind === 'lily') {
        // The resting leaf is at 15/16 block, clear of the 14/16 water plane.
        const level = Math.ceil((WATER_SURFACE + .05) * 16);
        const radius = 4 + pick(2);
        sheet(1, level, ({ pixel }) => {
            for (let z=-4; z<5; z++) for (let x=-radius; x<radius; x++) {
                if (((x+.5)/radius)**2 + ((z+.5)/4.5)**2 > 1) continue;
                if (z >= 0 && x >= 0 && x <= Math.floor(z/2)) continue;
                pixel(x, z, z === -1 || x === -1 ? 'padLight' : 'pad');
            }
        });
        if (variant % 3 === 0) {
            const petal = variant % 2 ? 'petalPink' : 'white';
            box(0, level, -3, 3, 1, 3, petal);
            box(-1, level+1, -2, 1, 1, 1, petal);
            box(3, level+1, -2, 1, 1, 1, petal);
            box(1, level+1, -4, 1, 1, 1, petal);
            box(1, level+1, 0, 1, 1, 1, petal);
            box(1, level+1, -2, 1, 1, 1, 'pollen');
        }
    } else if (kind === 'duckweed') {
        const level = Math.ceil((WATER_SURFACE + .05) * 16);
        sheet(1, level, ({ rect }) => {
            for (const [x,z] of [[-4,-3],[0,-4],[3,-2],[-3,1],[1,0],[2,3]]) {
                rect(x, z, 1 + pick(2), 1 + pick(2), pick(2) ? 'padLight' : 'light');
            }
        });
    }
    return model.finish();
}

// tuft - kępka z paczki roślin (model "kepka", TuftGeometry.js): ten sam
// model z pikseli, tylko kształt z parametrów rośliny, nie z nazwy.
// mask - sąsiedzi dywanu (barwinek, TuftGeometry.js - carpet: bity 0-3
// łączenie, 4-7 krótka zasłona, 8-11 zasłona do dywanu niżej); inne
// rośliny jej nie używają.
export function getRiverPlantFaces(kind, variant, waterlogged = false, tuft = null, mask = 0) {
    if (kind.startsWith('blueberry:')) return getBlueberryFaces(kind.slice(10));
    // Półrealistyczny poziom modelu rośliny (PlantModelLevels.js).
    if (kind.startsWith('plane:')) return getPlaneModelFaces(kind, variant);
    if (kind.startsWith('fruitBush:')) {
        const [, species, stage] = kind.split(':');
        return getFruitBushFaces(species, stage);
    }
    const normalizedVariant = variant & 7;
    // Duża roślina (tuft.wide): maska litych bloków obok (ChunkMesher reachMask).
    const carpetMask = tuft?.carpet || tuft?.coating || tuft?.bracket ? mask & 0xfff : tuft?.wide ? mask & 0x1ffff : 0;
    const key = `${kind}:${normalizedVariant}:${waterlogged ? 1 : 0}:${carpetMask}`;
    let faces = cache.get(key);
    if (faces) {
        cache.delete(key);
        cache.set(key, faces);
        return faces;
    }
    faces = tuft ? makeTuftTemplate(tuft, normalizedVariant, carpetMask) : makeTemplate(kind, normalizedVariant, waterlogged);
    // Neighbor masks can create many variants during exploration/building.
    // These are deterministic derived models: eviction never changes blocks,
    // silhouettes, vertex order, or arrays already held by an active animation.
    while (cache.size && (cachedFaces + faces.length > MAX_CACHED_FACES || cache.size >= MAX_CACHED_MODELS)) {
        const oldest = cache.keys().next().value;
        cachedFaces -= cache.get(oldest).length;
        cache.delete(oldest);
    }
    if (faces.length <= MAX_CACHED_FACES) {
        cache.set(key, faces);
        cachedFaces += faces.length;
    }
    return faces;
}

// Dywan (barwinek), porost i huba leżą na całej komórce bez obrotu
// i przesunięcia - brzegi kobierców sąsiadów i ściany muszą pasować.
// Duża roślina (wystaje poza komórkę) też - maska sąsiadów jest w kierunkach
// świata.
export function plantTransform(x, y, z, tuft) {
    const transform = riverPlantTransform(x, y, z);
    return tuft?.carpet || tuft?.coating || tuft?.bracket || tuft?.wide ? { variant: transform.variant, cos: 1, sin: 0, x: 0.5, z: 0.5 } : transform;
}
