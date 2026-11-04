import assert from 'node:assert/strict';
import {
    getPlantMeshTemplate, lightPlantMeshTemplate,
    plantMeshTemplateStats, clearPlantMeshTemplates
} from '../src/rendering/PlantMeshTemplate.js';

// Serialization contract between cached model faces and the existing shaders.
// Includes non-pixel Blockbench coordinates, both atlas paths, semantic leaf /
// fruit profiles, all quarter turns, and the byte rounding of both light looks.
const faces = [
    { vertices: [[-.153, .0, .037], [.3125, .91, -.0625], [0, .34, .3], [.4, 1.3125, .2]],
        normal: [.6, .8, 0], color: [31, 125, 94], weights: [0, 181, 57, 255], movement: 128,
        surfaceProfile: [1, 180] },
    { vertices: [[-.25, .25, .125], [.25, .25, .125], [-.25, .75, .125], [.25, .75, .125]],
        normal: [0, 0, 1], color: [255, 191, 73], weights: [0, 0, 255, 255], movement: 0,
        surfaceProfile: [5, 0], texture: 'fruit', uv: [[0, 0], [1, 0], [0, 1], [1, 1]] }
];
const uv = { uMin: .0625, uMax: .125, vMin: .25, vMax: .3125 };
const fruitUV = { uMin: .5, uMax: .75, vMin: .625, vMax: .875 };
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
for (const [cos, sin] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const template = getPlantMeshTemplate(faces, uv, { cos, sin }, () => fruitUV);
    equal(template, getPlantMeshTemplate(faces, uv, { cos, sin }, () => fruitUV), 'Same placement shares compiled arrays');
    for (const [sky, r, g, b, atmosphereSky, scale, depth, climate] of [
        [1, 0, 0, 0, 1, 0, 1, null],
        [.52, .37, .12, .73, .45, .58, .7, [87, 193, 156]],
        [0, 0, 0, 0, 0, 0, 1, null],
        [.52, .37, .12, .73, .45, .58, .7, [87, 193, 156]],
    ]) {
        lightPlantMeshTemplate(template, sky, r, g, b, atmosphereSky, scale, depth, climate);
        let j = 0;
        for (const face of faces) for (let i = 0; i < 4; i++, j++) {
            const v = face.vertices[i], shade = (.79 + Math.min(1, v[1] / .8) * .21) * depth;
            const tile = face.texture ? fruitUV : uv;
            equal(template.positions.slice(j * 3, j * 3 + 3), Float64Array.from(v), 'Unrounded model position');
            equal(template.normal.slice(j * 3, j * 3 + 3), Float32Array.from([
                cos * face.normal[0] - sin * face.normal[2], face.normal[1], sin * face.normal[0] + cos * face.normal[2]
            ]), 'Exact rotated normal');
            equal(template.uv.slice(j * 2, j * 2 + 2), Float32Array.from(face.uv ? [
                tile.uMin + face.uv[i][0] * (tile.uMax - tile.uMin), tile.vMax - face.uv[i][1] * (tile.vMax - tile.vMin)
            ] : [(tile.uMax + tile.uMin) / 2, (tile.vMin + tile.vMax) / 2]), 'Atlas mapping');
            equal(template.motion.slice(j * 2, j * 2 + 2), Uint8Array.from([face.weights[i], face.movement]), 'Wind and float weights');
            equal(template.profile.slice(j * 2, j * 2 + 2), Uint8Array.from(face.surfaceProfile), 'Semantic material');
            equal(template.color.slice(j * 4, j * 4 + 4), Uint8Array.from([r, g, b, sky].map(x => x * shade * 255 + .5)), 'Legacy light bytes');
            equal(template.atmosphere.slice(j * 4, j * 4 + 4), Uint8Array.from([
                r * scale * shade * 255 + .5, g * scale * shade * 255 + .5, b * scale * shade * 255 + .5,
                atmosphereSky * depth * 255 + .5
            ]), 'Natural light bytes, sky independent of AO');
            equal(template.tint.slice(j * 4, j * 4 + 4), Uint8Array.from([
                ...face.color.map((value, k) => climate ? Math.min(255, Math.round(value * climate[k] / 128)) : value), 128
            ]), 'Biome tint and resetting to neutral');
            equal(template.occlusion[j], Uint8Array.of(shade * 255 + .5)[0], 'Submerged and local occlusion');
        }
    }
}

// Cache owns fixed arrays only. Copying into a chunk must not let an animation
// mutate the reusable model; eviction must recreate identical bytes.
const first = getPlantMeshTemplate(faces, uv, { cos: 1, sin: 0 }, () => fruitUV);
const copied = first.motion.slice(); copied.fill(0);
assert.ok(first.motion.some(v => v !== 0)); checks++;
const snapshot = first.normal.slice();
const large = Array.from({ length: 4000 }, () => faces[0]);
for (let n = 0; n < 30; n++) {
    getPlantMeshTemplate(large, { ...uv, uMin: n / 1000 }, { cos: 1, sin: 0 }, () => fruitUV);
    assert.ok(plantMeshTemplateStats().bytes <= plantMeshTemplateStats().limit); checks++;
}
const rebuilt = getPlantMeshTemplate(faces, uv, { cos: 1, sin: 0 }, () => fruitUV);
assert.notEqual(first, rebuilt); checks++;
equal(rebuilt.normal, snapshot, 'Eviction preserves geometry');
for (let n = 0; n < 600; n++) getPlantMeshTemplate([], uv, { cos: 1, sin: 0 }, () => fruitUV);
assert.ok(plantMeshTemplateStats().entries <= plantMeshTemplateStats().maxEntries); checks++;
clearPlantMeshTemplates();
equal(plantMeshTemplateStats().entries, 0, 'Clear entry count');
equal(plantMeshTemplateStats().bytes, 0, 'Clear byte count');
console.log(`OK: cache meshera roślin — ${checks} sprawdzeń dokładności, światła i limitu pamięci.`);
