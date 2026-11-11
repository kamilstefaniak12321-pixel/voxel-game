// ------------------------------------------------------------
// KSZTAŁTY WYROBÓW STOLARSKICH (0.90.0)
//
// Pudełka [x0, y0, z0, x1, y1, z1] w blokach (0-1 w komórce) dla schodów,
// półbloków, płotów, furtek i stołu stolarskiego (woodShapes.js):
// - render: co rysuje ChunkMesher (i ikonka, i model w dłoni),
// - collision: kolizje gracza (płot i zamknięta furtka - 1,5 bloku, nie
//   da się ich przeskoczyć; otwarta furtka - bez kolizji),
// - outline: celownik i obrys wskazanego bloku.
// Kształty opisane dla kierunku "north" (tył schodów, przód stołu,
// furtka w poprzek osi z) i obracane wokół osi pionowej.
//
// Płot łączy się z sąsiednim płotem, furtką ustawioną wzdłuż tej strony
// i pełnym blokiem (connectMask).
// ------------------------------------------------------------

import { shapeInfo, SHAPE_FACINGS } from '../blocks/woodShapes.js';
import { isOpaqueId, isSolidId } from '../blocks/BlockRegistry.js';

const P = 1 / 16;
const px = (...values) => values.map((value) => value * P);

// Obrót pudełka z układu "north" do kierunku facing (wokół środka komórki).
export function rotateBox([x0, y0, z0, x1, y1, z1], facing) {
    const map = {
        north: (x, z) => [x, z],
        east: (x, z) => [1 - z, x],
        south: (x, z) => [1 - x, 1 - z],
        west: (x, z) => [z, 1 - x]
    }[facing] ?? ((x, z) => [x, z]);
    const [ax, az] = map(x0, z0), [bx, bz] = map(x1, z1);
    return [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
}

const flipY = ([x0, y0, z0, x1, y1, z1]) => [x0, 1 - y1, z0, x1, 1 - y0, z1];

// Strony: maska bitów N=1, E=2, S=4, W=8 (kolejność SHAPE_FACINGS).
export const SIDE_BITS = { north: 1, east: 2, south: 4, west: 8 };
const SIDE_STEP = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

// --- Schody i półbloki --------------------------------------------------

const STAIRS = [[0, 0, 0, 1, .5, 1], [0, .5, 0, 1, 1, .5]];
const SLABS = { bottom: [[0, 0, 0, 1, .5, 1]], top: [[0, .5, 0, 1, 1, 1]], double: [[0, 0, 0, 1, 1, 1]] };

// --- Płot -------------------------------------------------------------------

const FENCE_POST = px(6, 0, 6, 10, 16, 10);
const FENCE_RAILS = [px(7, 12, 0, 9, 15, 6), px(7, 6, 0, 9, 9, 6)];
const FENCE_POST_COLLISION = px(6, 0, 6, 10, 24, 10);
const FENCE_ARM_COLLISION = px(6, 0, 0, 10, 24, 6);
const FENCE_ARM_OUTLINE = px(6, 6, 0, 10, 15, 6);

// --- Furtka (north: w poprzek osi z, wzdłuż x; otwiera się na północ) ---

const GATE_CLOSED = [
    px(0, 5, 7, 2, 16, 9), px(14, 5, 7, 16, 16, 9),
    px(2, 6, 7, 14, 9, 9), px(2, 12, 7, 14, 15, 9),
    px(6, 9, 7, 8, 12, 9), px(8, 9, 7, 10, 12, 9)
];
const GATE_OPEN = [
    px(0, 5, 7, 2, 16, 9), px(14, 5, 7, 16, 16, 9),
    px(0, 6, 1, 2, 9, 7), px(0, 12, 1, 2, 15, 7), px(0, 9, 1, 2, 12, 3),
    px(14, 6, 1, 16, 9, 7), px(14, 12, 1, 16, 15, 7), px(14, 9, 1, 16, 12, 3)
];
const GATE_COLLISION = [px(0, 0, 6, 16, 24, 10)];
const GATE_OUTLINE_CLOSED = [px(0, 5, 7, 16, 16, 9)];

// --- Stół stolarski (north: przód na -z, część B na -x) --------------------

const TABLE_COMMON = [
    px(0, 13, 0, 16, 16, 16),                 // blat
    px(0, 11, 1, 16, 13, 2), px(0, 11, 14, 16, 13, 15), // oskrzynia z przodu i z tyłu
    px(0, 3, 2, 16, 4, 14)                    // półka
];
const TABLE_PART = {
    a: [px(13, 0, 1, 15, 13, 3), px(13, 0, 13, 15, 13, 15), px(9, 9, 0, 13, 13, 1)], // nogi i imadło
    b: [px(1, 0, 1, 3, 13, 3), px(1, 0, 13, 3, 13, 15)]
};
const FULL = [[0, 0, 0, 1, 1, 1]];

// Wysokość blatu (przedmioty na stole leżą na niej).
export const TABLE_TOP = 1;

// --- Łączenie płotów --------------------------------------------------------

// Czy blok "id" po stronie "side" płotu przyjmuje połączenie.
export function connectsTo(id, side) {
    const info = shapeInfo(id);
    if (info?.kind === 'fence') return true;
    if (info?.kind === 'gate') {
        // Furtka north/south stoi wzdłuż x - łączy się na wschód i zachód.
        const alongX = info.facing === 'north' || info.facing === 'south';
        return alongX ? side === 'east' || side === 'west' : side === 'north' || side === 'south';
    }
    if (info) return false;
    return isOpaqueId(id) && isSolidId(id);
}

// Maska połączeń płotu w (x, y, z); getId(x, y, z) - numer bloku.
export function connectMask(getId, x, y, z) {
    let mask = 0;
    for (const side of SHAPE_FACINGS) {
        const [dx, dz] = SIDE_STEP[side];
        if (connectsTo(getId(x + dx, y, z + dz), side)) mask |= SIDE_BITS[side];
    }
    return mask;
}

// Pudełka kształtu. purpose: 'render' | 'collision' | 'outline'; mask -
// połączenia płotu (connectMask).
export function shapeBoxes(id, purpose = 'render', mask = 0) {
    const info = shapeInfo(id);
    if (!info) return null;
    switch (info.kind) {
        case 'stairs': {
            const boxes = STAIRS.map((box) => rotateBox(box, info.facing));
            return info.half === 'top' ? boxes.map(flipY) : boxes;
        }
        case 'slab':
            return SLABS[info.half];
        case 'fence': {
            const boxes = [purpose === 'collision' ? FENCE_POST_COLLISION : FENCE_POST];
            for (const side of SHAPE_FACINGS) {
                if (!(mask & SIDE_BITS[side])) continue;
                const arms = purpose === 'collision' ? [FENCE_ARM_COLLISION] : purpose === 'outline' ? [FENCE_ARM_OUTLINE] : FENCE_RAILS;
                for (const arm of arms) boxes.push(rotateBox(arm, side));
            }
            return boxes;
        }
        case 'gate': {
            if (purpose === 'collision') return info.open ? [] : GATE_COLLISION.map((box) => rotateBox(box, info.facing));
            const source = purpose === 'outline' && !info.open ? GATE_OUTLINE_CLOSED : info.open ? GATE_OPEN : GATE_CLOSED;
            return source.map((box) => rotateBox(box, info.facing));
        }
        case 'table':
            if (purpose === 'collision' || purpose === 'outline') return FULL;
            return [...TABLE_COMMON, ...TABLE_PART[info.part]].map((box) => rotateBox(box, info.facing));
        default:
            return null;
    }
}

// Obrys (jedno pudełko obejmujące kształt) - do podświetlenia.
export function boundsOf(boxes) {
    if (!boxes?.length) return null;
    const out = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const box of boxes) for (let i = 0; i < 3; i++) {
        out[i] = Math.min(out[i], box[i]);
        out[i + 3] = Math.max(out[i + 3], box[i + 3]);
    }
    return out;
}
