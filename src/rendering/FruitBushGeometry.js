import { getBlueberryFaces } from './BlueberryGeometry.js';
import { createPixelPlant } from './PixelPlantBuilder.js';

const LEAF_TEXTURE = 'models/blueberry/atlas';
const FRUIT_TEXTURE = 'snow';
const P = 1 / 16;
// The hazel crown fits the existing one-cell planting rules. Only foliage,
// stems and fruit positions shorten; individual nuts retain their voxel size.
const HAZEL_HEIGHT_SCALE = 8 / 9;
const ROOT = [0, 0, 0];
const STAGES = new Set(['young', 'empty', 'few', 'full']);

// Shared geometry, not a mesh or animator for every wild bush. Leaves retain
// the cutout cards from Kamil's blueberry; fruit solids use 1/16-block voxels.
// width is the full diameter, including foliage (the world adds its own jitter).
export const FRUIT_BUSH_PROFILES = Object.freeze({
    strawberry: Object.freeze({ height: .4375, width: .8125, youngScale: .55, fruitCount: 5, fewCount: 2 }),
    blackberry: Object.freeze({ height: .9375, width: .8125, youngScale: .50, fruitCount: 7, fewCount: 2 }),
    chili: Object.freeze({ height: .875, width: .5625, youngScale: .55, fruitCount: 5, fewCount: 2 }),
    hazel: Object.freeze({ height: 1, width: .8125, youngScale: .48, fruitCount: 6, fewCount: 2 })
});

const ITEM_SPECIES = Object.freeze({ strawberry: 'strawberry', blackberry: 'blackberry',
    chili_pepper: 'chili', hazelnut: 'hazel', blueberry: 'blueberry' });

const linear = hex => [16, 8, 0].map(shift => {
    const value = ((hex >> shift) & 255) / 255;
    return Math.round((value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * 255);
});

// Fruit placement is in pixels and remains identical through all adult stages.
// The first fruit is deliberately unrotated: it is also the inventory model.
const PLACEMENTS = {
    strawberry: [[-3, 2.75, -3, 0], [3, 3.25, 2, 1], [3.5, 3, -2.5, 2], [-3, 3, 3, 3], [0, 4, -.5, 0]],
    blackberry: [[-3.5, 6, -4, 0], [3.5, 9, 3.5, 1], [4, 5, -2.5, 2], [-4, 10, 2, 3], [0, 12, -2, 1], [-2, 4, 4, 0], [3, 11, -3.5, 2]],
    chili: [[-2.5, 6.5, -2.5, 0], [2.5, 8.5, 2, 2], [2, 5, -2.5, 3], [-2, 10.5, 1.5, 1], [0, 9, -2.5, 2]],
    hazel: [[-4, 8, -3.5, 0], [3.5, 11, 3, 1], [4.5, 7, -1.5, 2], [-3, 13.5, 2.5, 3], [0, 15, -2.5, 1], [-2, 6.5, 4, 0]]
};

const LEAF_TINT = {
    strawberry: [242, 255, 205], blackberry: [186, 214, 213],
    chili: [218, 255, 222], hazel: [255, 241, 181]
};

const itemCache = new Map();
const bushCache = new Map();

function bounds(faces) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const face of faces) for (const point of face.vertices) {
        for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
        }
    }
    return { min, max, center: min.map((value, axis) => (value + max[axis]) / 2) };
}

const wind = (height, top) => Math.round(102 * Math.min(1, Math.max(0, height) / top) ** 2);

function makeFruit(species) {
    const palette = {
        red: linear(0xc83e38), redLight: linear(0xe66449), redDark: linear(0x962d38),
        seed: linear(0xe1ad63), green: linear(0x658b39), greenLight: linear(0x89a449),
        purple: linear(0x30243e), purpleLight: linear(0x594461), purpleDark: linear(0x241f31),
        nut: linear(0xa46a36), nutLight: linear(0xc48b50), nutDark: linear(0x79502d)
    };
    const model = createPixelPlant(palette, false, 0, 1);
    const { box } = model;
    if (species === 'strawberry') {
        // Tapered berry: three-pixel shoulders, a narrow tip and leafy calyx.
        box(0, 0, 0, 1, 1, 1, 'redDark');
        box(-1, 1, -1, 3, 2, 3, 'red', 'redLight');
        box(0, 3, -1, 1, 1, 3, 'green');
        box(-1, 3, 0, 3, 1, 1, 'greenLight');
        // Small seed patches share the solid surface; no coplanar overlays.
        box(-1, 1, -1, 1, 1, 1, 'seed');
        box(1, 2, 1, 1, 1, 1, 'seed');
    } else if (species === 'blackberry') {
        // An uneven cluster of lobes, not a recoloured smooth cube.
        box(0, 0, 0, 2, 3, 2, 'purple');
        box(-1, 1, 0, 1, 1, 2, 'purpleDark');
        box(2, 1, 0, 1, 1, 1, 'purpleLight');
        box(0, 1, -1, 1, 1, 1, 'purpleLight');
        box(1, 0, 2, 1, 1, 1, 'purpleDark');
        box(0, 2, 0, 1, 1, 1, 'purpleLight');
        box(0, 3, 0, 1, 1, 1, 'green');
    } else if (species === 'chili') {
        // Slender hanging pepper with a stepped hook and a green stalk.
        box(-1, 0, 0, 1, 1, 1, 'redDark');
        box(0, 1, 0, 1, 2, 1, 'red');
        box(0, 3, 0, 2, 2, 1, 'red', 'redLight');
        box(0, 5, 0, 1, 1, 1, 'green');
        box(0, 6, 0, 1, 1, 1, 'greenLight');
    } else if (species === 'hazel') {
        // Brown nut in a short green involucre, with a lighter upper shell.
        box(0, 0, 0, 2, 1, 2, 'nutDark');
        box(-1, 1, 0, 4, 2, 2, 'nut', 'nutLight');
        box(0, 1, -1, 2, 2, 4, 'nut', 'nutLight');
        box(0, 3, 0, 2, 1, 2, 'green');
        box(-1, 2, 0, 1, 2, 1, 'greenLight');
        box(2, 2, 1, 1, 2, 1, 'green');
    }
    const faces = model.finish();
    const center = bounds(faces).center;
    return faces.map(face => ({ ...face,
        vertices: face.vertices.map(point => point.map((value, axis) => value - center[axis])),
        center: ROOT, fruitIndex: 0, outer: false, texture: FRUIT_TEXTURE,
        weights: [0, 0, 0, 0] }));
}

// A single source of geometry for the picked item and every fruit on a bush.
// No item-specific deformation: inventory/held renderers only choose view/scale.
export function getFruitItemModel(itemType) {
    const species = ITEM_SPECIES[itemType];
    if (!species) return null;
    if (itemCache.has(itemType)) return itemCache.get(itemType);
    let faces;
    if (species === 'blueberry') {
        const original = getBlueberryFaces('full');
        const first = original.find(face => face.berry);
        faces = original.filter(face => face.partIndex === first.partIndex).map(face => ({ ...face,
            vertices: face.vertices.map(point => point.map((value, axis) => value - first.center[axis])),
            center: ROOT, fruitIndex: 0, outer: false, texture: LEAF_TEXTURE,
            weights: [0, 0, 0, 0] }));
    } else faces = makeFruit(species);
    const model = { species, faces, texture: species === 'blueberry' ? LEAF_TEXTURE : FRUIT_TEXTURE };
    itemCache.set(itemType, model);
    return model;
}

function leafTransform(species, part, point) {
    const profile = FRUIT_BUSH_PROFILES[species];
    let [x, y, z] = point;
    const wide = profile.width / .75;
    x *= wide; z *= wide;
    y *= profile.height / .75;
    if (species === 'chili') {
        // Visible lower stalk and a small open crown high on the plant.
        x *= part < 6 ? .8 : 1;
        z *= part < 6 ? .8 : 1;
        y = profile.height * .2 + y * .8;
    } else if (species === 'blackberry') {
        // The central core is compact; the upper sheets make an airy crown.
        if (part < 6) { x *= .88; z *= .88; }
        if (part === 11 || part === 12) y += P;
    }
    return [x, y, z];
}

function faceNormal(vertices) {
    // Indices in the chunk are 0,2,1 and 2,3,1.
    const a = vertices[0], b = vertices[2], c = vertices[1];
    const u = b.map((v, i) => v - a[i]), v = c.map((n, i) => n - a[i]);
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const length = Math.hypot(...n);
    return n.map(value => value / length);
}

function makeFoliage(species) {
    const profile = FRUIT_BUSH_PROFILES[species];
    const faces = [];
    for (const face of getBlueberryFaces('empty')) {
        // Fewer crossing sheets leave room around the hanging peppers.
        if (species === 'chili' && [4, 5, 8, 13, 14].includes(face.partIndex)) continue;
        const vertices = face.vertices.map(point => leafTransform(species, face.partIndex, point));
        faces.push({ ...face, vertices, normal: faceNormal(vertices),
            center: leafTransform(species, face.partIndex, face.center),
            color: LEAF_TINT[species], texture: LEAF_TEXTURE,
            outer: face.partIndex >= 6, fruitIndex: -1,
            weights: vertices.map(point => wind(point[1], profile.height)) });
    }
    if (species === 'hazel') {
        // A denser upper crown, with two smaller crossing sheets in addition
        // to the original blueberry layers; rooted stems remain visible below.
        for (const source of getBlueberryFaces('empty').filter(face => [9, 10].includes(face.partIndex))) {
            const vertices = source.vertices.map(([x, y, z]) => [x * .72, (.625 + y * .6) * HAZEL_HEIGHT_SCALE, z * .72]);
            faces.push({ ...source, vertices, normal: faceNormal(vertices),
                center: bounds([{vertices}]).center, color: LEAF_TINT.hazel,
                texture: LEAF_TEXTURE, outer: true, fruitIndex: -1,
                weights: vertices.map(point => wind(point[1], profile.height)) });
        }
    }
    if (species !== 'strawberry') {
        const stem = createPixelPlant({ stem: linear(species === 'hazel' ? 0x77613c : species === 'blackberry' ? 0x58633c : 0x698441) }, false, 0, profile.height);
        stem.box(0, 0, 0, 1, species === 'chili' ? 11 : species === 'hazel' ? 13 : 9, 1, 'stem');
        for (const face of stem.finish()) {
            const vertices = face.vertices.map(([x, y, z]) => [x - P / 2,
                species === 'hazel' ? y * HAZEL_HEIGHT_SCALE : y, z - P / 2]);
            faces.push({ ...face, center: ROOT, vertices,
            outer: false, fruitIndex: -1, texture: FRUIT_TEXTURE,
            weights: vertices.map(point => wind(point[1], profile.height)) });
        }
    }
    return faces;
}

function makeFullBush(species) {
    const profile = FRUIT_BUSH_PROFILES[species];
    const faces = makeFoliage(species);
    const itemType = Object.keys(ITEM_SPECIES).find(type => ITEM_SPECIES[type] === species);
    const fruit = getFruitItemModel(itemType).faces;
    for (const [fruitIndex, [x, y, z, turn]] of PLACEMENTS[species].entries()) {
        const cos = [1, 0, -1, 0][turn], sin = [0, 1, 0, -1][turn];
        const center = [x * P, y * P * (species === 'hazel' ? HAZEL_HEIGHT_SCALE : 1), z * P];
        const rotate = ([px, py, pz]) => [cos * px - sin * pz, py, sin * px + cos * pz];
        for (const face of fruit) faces.push({ ...face,
            vertices: face.vertices.map(point => rotate(point).map((value, axis) => value + center[axis])),
            normal: rotate(face.normal), center, fruitIndex,
            weights: [0, 1, 2, 3].map(() => wind(center[1], profile.height)) });
    }
    return faces;
}

export function getFruitBushFaces(species, stage = 'full') {
    const profile = FRUIT_BUSH_PROFILES[species];
    if (!profile || !STAGES.has(stage)) throw new Error(`Nieznany model krzaka: ${species}:${stage}`);
    const key = `${species}:${stage}`;
    if (bushCache.has(key)) return bushCache.get(key);
    const fullKey = `${species}:full`;
    if (!bushCache.has(fullKey)) bushCache.set(fullKey, makeFullBush(species));
    const full = bushCache.get(fullKey);
    if (stage === 'full') return full;
    const faces = full.filter(face => face.fruitIndex < 0 || stage === 'few' && face.fruitIndex < profile.fewCount);
    const result = stage === 'young' ? faces.map(face => ({ ...face,
        vertices: face.vertices.map(point => point.map(value => value * profile.youngScale)),
        center: face.center.map(value => value * profile.youngScale),
        weights: face.vertices.map(point => wind(point[1] * profile.youngScale, profile.height)) })) : faces;
    bushCache.set(key, result);
    return result;
}
