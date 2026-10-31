import { BLUEBERRY_MODELS } from '../../assets/models/blueberry/model-data.js';

// Visual state only: block IDs, harvest and growth clocks remain authoritative.
// Curves follow Kamil's Blockbench clips, with neutral starts, smaller bounce
// and fruit scaling about each fruit's own centre. See docs/animacje-roslin.md.
export const BLUEBERRY_IDS = Object.freeze({ young: 94, empty: 95, few: 96, full: 97 });
const STAGES = new Map(Object.entries(BLUEBERRY_IDS).map(([stage, id]) => [id, stage]));
const berries = BLUEBERRY_MODELS.full.filter(p => p.berry);
const few = new Set(BLUEBERRY_MODELS.few.filter(p => p.berry).map(p => JSON.stringify(p)));
const fewMask = berries.map(p => few.has(JSON.stringify(p)) ? 1 : 0);
export const isAnimatedPlant = id => STAGES.has(id);
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const ROOT = [0, 0, 0];

export function blueberryPose(id) {
    const stage = STAGES.get(id);
    return { size: stage === 'young' ? .55 : 1, core: stage ? 1 : 0,
        fluff: stage ? 1 : 0, lift: 0, leafAngle: 0, berryAngle: 0,
        fruit: Float32Array.from(berries, (_, i) => stage === 'full' ? 1 : stage === 'few' ? fewMask[i] : 0) };
}

// Radians; all clips start/end at zero and settle with a smaller second swing.
function sway(t, delay = 0) {
    const keys = [[0, 0], [.08, -2], [.19, 2.5], [.29, 2], [.41, -.8], [.5, -.3], [.56, 0]];
    t -= delay;
    if (t <= 0 || t >= .56) return 0;
    for (let i = 1; i < keys.length; i++) {
        if (t <= keys[i][0]) {
            const [a, av] = keys[i - 1], [b, bv] = keys[i];
            return mix(av, bv, smooth((t - a) / (b - a))) * Math.PI / 180;
        }
    }
    return 0;
}

export function animationKind(before, after) {
    if (!isAnimatedPlant(before)) return isAnimatedPlant(after) ? 'place' : null;
    if (after === 0) return 'break';
    if (!isAnimatedPlant(after)) return null;
    if (after === BLUEBERRY_IDS.empty && (before === 96 || before === 97)) return 'harvest';
    return before !== after ? 'grow' : null;
}

export const PLANT_CLIP_SECONDS = Object.freeze({ place: .6, harvest: .64, break: .42, reject: .66, grow: 1.8 });

export function sampleBlueberryAnimation(event, t, out = blueberryPose(0)) {
    const { from, to, kind } = event;
    const progress = smooth(t / event.duration);
    out.size = mix(from.size, to.size, kind === 'grow' ? smooth(t / 1.15) : progress);
    out.core = mix(from.core, to.core, smooth((t - (kind === 'break' ? .1 : 0)) / .275));
    out.fluff = mix(from.fluff, to.fluff, smooth((t - (kind === 'place' ? .04 : kind === 'break' ? .06 : 0)) / .275));
    out.lift = from.lift * (1 - progress);
    out.leafAngle = from.leafAngle * (1 - progress);
    out.berryAngle = from.berryAngle * (1 - progress);
    if (kind === 'place') {
        // 1 pixel at most; the solid core stays rooted.
        out.lift += Math.sin(Math.PI * clamp((t - .12) / .26)) ** 2 / 16
            + Math.sin(Math.PI * clamp((t - .38) / .2)) ** 2 / 64;
    }
    if (kind === 'place' || kind === 'harvest' || kind === 'reject') {
        out.leafAngle += sway(t, .04);
        out.berryAngle += sway(t);
    }
    for (let i = 0; i < out.fruit.length; i++) {
        let f;
        if (kind === 'grow') {
            // Existing fruit stays in place; new fruit appears in small waves.
            const delay = (from.size < to.size ? .65 : .15) + (i % 4) * .07;
            f = smooth((t - delay) / .85);
        } else {
            f = smooth((t - (kind === 'place' ? .12 : 0)) / .275);
        }
        out.fruit[i] = mix(from.fruit[i], to.fruit[i], f);
    }
    if (t >= event.duration) {
        Object.assign(out, to, { fruit: out.fruit });
        out.fruit.set(to.fruit);
    }
    return out;
}

// Canonical full model: six core sheets, nine outer sheets, 24 fruit cubes.
// No per-vertex allocation. Return model-space xyz and the normal in `out`.
export function transformBlueberryVertex(face, vertex, pose, out) {
    const berry = face.berry;
    const outer = !berry && face.partIndex >= 6;
    const scale = berry ? pose.fruit[face.partIndex - 15] : outer ? pose.fluff : pose.core;
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
    // A collapsed sheet must also lose wind, otherwise it opens into a sliver.
    const windY = berry ? face.center[1] * pose.size : vertex[1] * pose.size;
    out[6] = Math.round(102 * Math.min(1, windY / .75) ** 2 * (berry ? 1 : scale));
    return out;
}
