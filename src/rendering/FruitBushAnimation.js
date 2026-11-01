import { FRUIT_BUSH_PROFILES } from './FruitBushGeometry.js';
import { sampleBlueberryAnimation, PLANT_CLIP_SECONDS } from './BlueberryAnimation.js';

// Existing save IDs: each family keeps [young, empty, few, full].
const SPECIES = ['strawberry', 'blackberry', 'chili', 'hazel'];
const ROOT = [0, 0, 0];
export const FRUIT_BUSH_STAGES = ['young', 'empty', 'few', 'full'];
const INFO = new Map(SPECIES.flatMap((species, group) => FRUIT_BUSH_STAGES.map((stage, index) =>
    [34 + group * 4 + index, { species, stage, index, fullId: 37 + group * 4 }])));

export const fruitBushInfo = id => INFO.get(id) ?? null;
export const isFruitBushAnimated = id => INFO.has(id);
export { PLANT_CLIP_SECONDS };

export function fruitBushAnimationKind(before, after) {
    const old = fruitBushInfo(before), next = fruitBushInfo(after);
    if (next && old?.species !== next.species) return 'place';
    if (!old) return null;
    if (after === 0) return 'break';
    if (!next) return null;
    if (next.index === 1 && old.index >= 2) return 'harvest';
    return before !== after ? 'grow' : null;
}

export function fruitBushPose(id, species = fruitBushInfo(id)?.species) {
    const profile = FRUIT_BUSH_PROFILES[species];
    const info = fruitBushInfo(id);
    const stage = info?.species === species ? info.index : -1;
    return { size: stage === 0 ? profile.youngScale : 1, core: stage >= 0 ? 1 : 0,
        fluff: stage >= 0 ? 1 : 0, lift: 0, leafAngle: 0, berryAngle: 0,
        fruit: Float32Array.from({ length: profile.fruitCount }, (_, i) =>
            stage === 3 || (stage === 2 && i < profile.fewCount) ? 1 : 0) };
}

export function sampleFruitBushAnimation(event, time, out = fruitBushPose(0, event.species)) {
    return sampleBlueberryAnimation(event, time, out);
}

// Every component of one strawberry/pepper/nut shares its fruit pivot and
// wind displacement, so a multi-cube fruit remains a single rigid object.
export function transformFruitBushVertex(face, vertex, index, pose, event, out) {
    const berry = face.fruitIndex >= 0;
    const outer = !berry && face.outer;
    const scale = berry ? pose.fruit[face.fruitIndex] : outer ? pose.fluff : pose.core;
    const center = berry ? face.center : ROOT;
    const angle = berry ? pose.berryAngle : outer ? pose.leafAngle : 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const x = (center[0] + (vertex[0] - center[0]) * scale) * pose.size;
    const y = (center[1] + (vertex[1] - center[1]) * scale) * pose.size;
    const z = (center[2] + (vertex[2] - center[2]) * scale) * pose.size;
    out[0] = cos * x - sin * y;
    out[1] = sin * x + cos * y + (outer || berry ? pose.lift : 0);
    out[2] = z;
    out[3] = cos * face.normal[0] - sin * face.normal[1];
    out[4] = sin * face.normal[0] + cos * face.normal[1];
    out[5] = face.normal[2];
    const windY = berry ? face.center[1] * pose.size : vertex[1] * pose.size;
    out[6] = Math.round(102 * Math.min(1, windY / FRUIT_BUSH_PROFILES[event.species].height) ** 2 * (berry ? 1 : scale));
    return out;
}
