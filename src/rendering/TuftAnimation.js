import { getBlockTypeById, getBlockDefinition, getHarvest } from '../blocks/BlockRegistry.js';
import { blockRenderData } from './BlockRenderData.js';

// ------------------------------------------------------------
// ANIMACJE ROŚLIN Z PACZEK (kępki i krzewy - model "kepka")
//
// Ten sam kierunek co borówka (docs/animacje-roslin.md): krótkie,
// subtelnie sprężyste reakcje, neutralny początek i koniec, roślina
// zakorzeniona (podstawa nie podskakuje). Tylko warstwa wizualna - blok
// zmienia się od razu, animacja przedstawia wynik.
//
// - place   - posadzenie: roślina wyrasta z ok. 1/3 rozmiaru z lekkim
//             przeskokiem (do ok. 106%) i wygasającym kołysaniem,
// - grow    - kolejny etap: nowy model rośnie płynnie od rozmiaru
//             poprzedniego (stosunek wysokości) - bez skoku,
// - harvest - zbiór: najpierw kwiaty (i inne części w kolorach kwiatów)
//             maleją wokół własnych środków, potem roślina przechodzi do
//             etapu po zbiorze (płynnie, od wysokości poprzedniego) i lekko
//             się ugina i kołysze,
// - reject  - pełny ekwipunek: tylko ugięcie i kołysanie, kwiaty zostają,
// - break   - zniszczenie: szybki zanik do podstawy.
//
// Model każdego etapu jest inny (inne kostki), więc - inaczej niż
// borówka - animacja rysuje model jednego etapu (renderId): przy zbiorze
// najpierw poprzedniego (kwiaty znikają), potem nowego (jedna zwykła
// przebudowa chunka w połowie, jak przy zmianie bloku).
//
// Dywany, porosty i huby (zależą od sąsiadów) i rośliny w wodzie nie są
// animowane.
// ------------------------------------------------------------

const INFO = new Map();

// Roślina z paczki, którą animujemy: { type, pack, stage, height, tuft }.
export function tuftInfo(id) {

    if (!id) return null;
    if (INFO.has(id)) return INFO.get(id);

    const river = blockRenderData[id]?.riverPlant;
    const tuft = river?.tuft;
    let result = null;

    if (tuft && !tuft.carpet && !tuft.coating && !tuft.bracket && !river.waterlogged) {
        const type = getBlockTypeById(id);
        const definition = getBlockDefinition(type);
        // Roślina z paczki albo szczegółowy model zwykłej rośliny
        // (PlantModelLevels.js - animatePack).
        const pack = definition?.plantPack ?? river.animatePack;
        if (pack) {
            result = { type, pack, stage: definition.stage ?? 0, height: tuft.height / 16, tuft };
        }
    }

    INFO.set(id, result);
    return result;

}

export const isTuftAnimated = (id) => tuftInfo(id) !== null;

// Po zmianie poziomu modeli roślin (PlantModelLevels.js) - od nowa.
export function clearTuftInfo() {
    INFO.clear();
}

export function tuftAnimationKind(before, after) {

    const from = tuftInfo(before), to = tuftInfo(after);

    if (!from) return to ? 'place' : null;
    if (!to) return after === 0 ? 'break' : null;
    if (from.pack !== to.pack) return 'place';
    if (before === after) return null;
    if (getHarvest(from.type)?.becomes === to.type) return 'harvest';
    return 'grow';

}

export const TUFT_CLIP_SECONDS = Object.freeze({ place: .6, grow: 1.2, harvest: .7, reject: .66, break: .42 });

// Kiedy przy zbiorze kwiaty już zniknęły i rysujemy etap po zbiorze.
export const TUFT_HARVEST_SWITCH = .24;

export function tuftPose() {
    return { size: 1, bend: 0, squash: 1, bloom: 1 };
}

const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Przeskok o kilka procent i powrót (easeOutBack, łagodny).
const overshoot = (x) => { const p = clamp(x) - 1; return 1 + 2.4 * p * p * p + 1.4 * p * p; };

// Kołysanie: zaczyna się i kończy w zerze, z każdym wahnięciem słabsze.
function wobble(t, duration, amplitude, period) {
    if (t <= 0 || t >= duration) return 0;
    return amplitude * Math.sin(2 * Math.PI * t / period) * (1 - t / duration) ** 2;
}

export function sampleTuftAnimation(event, t, out = tuftPose()) {

    const { kind, duration } = event;
    const from = event.from.size;

    out.size = 1; out.bend = 0; out.squash = 1; out.bloom = 1;

    if (kind === 'place') {
        out.size = mix(from, 1, overshoot(t / .42));
        out.bend = wobble(t - .1, duration - .1, .1, .34);
    }
    else if (kind === 'grow') {
        out.size = mix(from, 1, smooth(t / (duration * .85)));
        out.bend = wobble(t, duration, .045, .5);
    }
    else if (kind === 'harvest') {
        if (event.phase === 0) {
            out.size = from;
            out.bloom = 1 - smooth(t / TUFT_HARVEST_SWITCH);
        }
        else {
            const p = (t - TUFT_HARVEST_SWITCH) / (duration - TUFT_HARVEST_SWITCH);
            out.size = mix(from, 1, smooth(p / .7));
            out.squash = 1 - .05 * Math.sin(Math.PI * clamp(p / .45));
        }
        out.bend = wobble(t, duration, .09, .3);
    }
    else if (kind === 'reject') {
        out.bend = wobble(t, duration, .08, .3);
        out.squash = 1 - .04 * Math.sin(Math.PI * clamp(t / .22));
    }
    else if (kind === 'break') {
        out.size = from * (1 - smooth(t / duration));
        out.bend = wobble(t, duration, .05, .25);
    }

    if (t >= duration) {
        out.size = kind === 'break' ? 0 : 1;
        out.bend = 0;
        out.squash = 1;
        out.bloom = kind === 'harvest' && event.phase === 0 ? 0 : 1;
    }

    return out;

}

// Środki ścian kwiatów (kwiat maleje wokół własnego środka) i które
// ściany są kwiatami - po kolorach kwiatów paczki.
const FLOWER_COLORS = ['flower', 'flowerLight', 'flowerDark', 'bud', 'center'];
const centers = new WeakMap();

function faceCenter(face) {
    let center = centers.get(face);
    if (!center) {
        center = [0, 1, 2].map((axis) => face.vertices.reduce((sum, vertex) => sum + vertex[axis], 0) / face.vertices.length);
        centers.set(face, center);
    }
    return center;
}

export function isFlowerFace(face, tuft) {
    return FLOWER_COLORS.some((name) => tuft.colors[name] === face.color);
}

// Wierzchołek modelu (współrzędne od podstawy rośliny) w pozie: out = x, y,
// z, normalna (bez zmian), waga wiatru. Rozmiar wokół podstawy, ugięcie -
// przesunięcie w bok rosnące z kwadratem wysokości (pędy giną się, podstawa
// stoi), lekkie spłaszczenie przy ugięciu.
export function transformTuftVertex(face, vertex, index, pose, event, out) {

    let x = vertex[0], y = vertex[1], z = vertex[2];

    if (pose.bloom !== 1 && event.flowerFaces?.has(face)) {
        const center = faceCenter(face);
        x = center[0] + (x - center[0]) * pose.bloom;
        y = center[1] + (y - center[1]) * pose.bloom;
        z = center[2] + (z - center[2]) * pose.bloom;
    }

    const wide = 1 + (1 - pose.squash) * .5;
    x *= pose.size * wide;
    z *= pose.size * wide;
    y *= pose.size * pose.squash;

    const shear = pose.bend * y * y / Math.max(.3, event.height);
    if (event.swayX) x += shear;
    else z += shear;

    out[0] = x; out[1] = y; out[2] = z;
    out[3] = face.normal[0]; out[4] = face.normal[1]; out[5] = face.normal[2];
    out[6] = Math.round(face.weights[index] * Math.min(1, pose.size));
    return out;

}
