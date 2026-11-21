// ------------------------------------------------------------
// KSZTAŁTY WYROBÓW STOLARSKICH (0.90.0)
//
// Pudełka [x0, y0, z0, x1, y1, z1] w blokach (0-1 w komórce) dla schodów,
// półbloków, płotów, furtek, stołu stolarskiego, łóżek i posłań
// (woodShapes.js, bedding.js):
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
export function rotateBox([x0, y0, z0, x1, y1, z1, slot], facing) {
    const map = {
        north: (x, z) => [x, z],
        east: (x, z) => [1 - z, x],
        south: (x, z) => [1 - x, 1 - z],
        west: (x, z) => [z, 1 - x]
    }[facing] ?? ((x, z) => [x, z]);
    const [ax, az] = map(x0, z0), [bx, bz] = map(x1, z1);
    const rotated = [Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz)];
    // Siódma liczba - numer tekstury pudełka (0 - tekstura bloku, 1... -
    // shapeTextures bloku, np. pościel na łóżku).
    if (slot) rotated.push(slot);
    return rotated;
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

// --- Drzwi i klapy (0.91.0) ------------------------------------------------
// Drzwi z modelu Kamila (drzwi.bbmodel): płyta 16 x 32 x 2 px przy
// północnym brzegu, zawias po zachodniej stronie (lewa patrzącego na
// północ), otwierają się o 90 stopni do środka bloku. Zawias prawy - lustro.
export const DOOR_THICKNESS = 2;
const DOOR = {
    closed: px(0, 0, 0, 16, 16, DOOR_THICKNESS),
    left: px(0, 0, 0, DOOR_THICKNESS, 16, 16),
    right: px(16 - DOOR_THICKNESS, 0, 0, 16, 16, 16)
};
// Klapa 2 px (od 1.16.0, model Kamila; wcześniej 3 px); otwarta stoi przy
// brzegu "facing" (tam, gdzie zawias).
export const TRAPDOOR_THICKNESS = 2;
const TRAPDOOR = {
    bottom: px(0, 0, 0, 16, TRAPDOOR_THICKNESS, 16),
    top: px(0, 16 - TRAPDOOR_THICKNESS, 0, 16, 16, 16),
    open: px(0, 0, 0, 16, 16, TRAPDOOR_THICKNESS)
};

// --- Łóżko i posłanie (0.98.0) -----------------------------------------
// Dwa bloki długości. Układ "north": wezgłowie na północ (-z), więc
// w bloku wezgłowia szczyt łóżka jest przy z = 0, a w bloku nóg - przy
// z = 16. Stelaż: narożne słupki, szczyt z płyciną (wyższy u wezgłowia),
// boki i dno. Pościel (materac i poduszka) to osobne pudełka z własną
// teksturą (miejsce 1) - są tylko na pościelonym łóżku.
const slot1 = (box) => [...box, 1];
const BED_FRAME = {
    head: [
        px(0, 0, 0, 2, 15, 2), px(14, 0, 0, 16, 15, 2),          // słupki wezgłowia
        px(2, 12, 0, 14, 14, 2), px(2, 4, 0, 14, 6, 2),          // górna i dolna listwa szczytu
        px(2, 6, 0.5, 14, 12, 1.5),                              // płycina (cofnięta)
        px(0, 4, 2, 2, 8, 16), px(14, 4, 2, 16, 8, 16),          // boki
        px(2, 5, 2, 14, 6, 16)                                   // dno
    ],
    foot: [
        px(0, 0, 14, 2, 12, 16), px(14, 0, 14, 16, 12, 16),      // słupki w nogach
        px(2, 9, 14, 14, 11, 16), px(2, 4, 14, 14, 6, 16),       // listwy szczytu
        px(2, 6, 14.5, 14, 9, 15.5),                             // płycina
        px(0, 4, 0, 2, 8, 14), px(14, 4, 0, 16, 8, 14),          // boki
        px(2, 5, 0, 14, 6, 14)                                   // dno
    ]
};
const BED_BEDDING = {
    head: [px(2, 6, 2, 14, 10, 16), px(3, 10, 3, 13, 12, 8)].map(slot1),   // materac i poduszka
    foot: [px(2, 6, 0, 14, 10, 14)].map(slot1)
};
// Kolizja do połowy bloku: na łóżko wchodzi się bez skoku (materac się ugina).
const BED_COLLISION = { frame: [px(0, 0, 0, 16, 8, 16)], made: [px(0, 0, 0, 16, 8, 16)] };
// Celowanie (promień wzroku i obrys): pełne bryły bez szpar pod stelażem,
// żeby łatwo było trafić w łóżko - skrzynia stelaża i szczyt.
const BED_OUTLINE = {
    head: [px(0, 0, 0, 16, 8, 16), px(0, 0, 0, 16, 15, 2)],
    foot: [px(0, 0, 0, 16, 8, 16), px(0, 0, 14, 16, 12, 16)]
};
// Posłanie na ziemi: gruby na 2 px materac z poduszką, bez kolizji.
const MAT = {
    head: [px(1, 0, 1, 15, 2, 16), px(3, 2, 3, 13, 4, 8)],
    foot: [px(1, 0, 0, 15, 2, 15)]
};

// Wysokość, na której leży śpiący (w blokach nad spodem bloku).
export const BED_TOP = 10 / 16;
export const MAT_TOP = 2 / 16;

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

// Młoda dynia (1.19.0): 10 x 9 x 10 pikseli na środku komórki.
const GOURD = [[3 / 16, 0, 3 / 16, 13 / 16, 9 / 16, 13 / 16]];

// --- Podpory i pnącza (1.30.0, blocks/vines.js) ----------------------------
// Kratka "north": płyta 1 px na środku komórki, wzdłuż x. Liście pnącza na
// kratce - cienkie płyty po obu stronach (miejsce tekstury 1), na tyczce -
// pudełko dookoła słupka, na pergoli - warstwa pod listwami daszku, a pod
// nią dwie skrzyżowane płyty z wiszącymi owocami (miejsce 2).
const slot = (n) => (box) => [...box, n];
const VINE_SHAPES = {
    vine_trellis: {
        support: [px(0, 0, 7.5, 16, 16, 8.5)],
        leaves: [px(0, 0, 6.4, 16, 16, 6.5), px(0, 0, 9.5, 16, 16, 9.6)].map(slot(1)),
        collision: [px(0, 0, 7, 16, 16, 9)],
        outline: [px(0, 0, 7, 16, 16, 9)],
        vineOutline: [px(0, 0, 6.4, 16, 16, 9.6)]
    },
    vine_pole: {
        support: [px(7, 0, 7, 9, 16, 9)],
        leaves: [px(2.5, 0, 2.5, 13.5, 16, 13.5)].map(slot(1)),
        collision: [px(6.5, 0, 6.5, 9.5, 16, 9.5)],
        outline: [px(6.5, 0, 6.5, 9.5, 16, 9.5)],
        vineOutline: [px(2.5, 0, 2.5, 13.5, 16, 13.5)]
    },
    // Chrust na groch (1.31.0): dwie skrzyżowane płyty gałązek; groch
    // oplata je z obu stron.
    vine_brush: {
        support: [px(0, 0, 7.5, 16, 16, 8.5), px(7.5, 0, 0, 8.5, 16, 16)],
        leaves: [px(0, 0, 6.4, 16, 16, 6.5), px(0, 0, 9.5, 16, 16, 9.6), px(6.4, 0, 0, 6.5, 16, 16), px(9.5, 0, 0, 9.6, 16, 16)].map(slot(1)),
        collision: [px(5, 0, 5, 11, 16, 11)],
        outline: [px(2, 0, 2, 14, 16, 14)],
        vineOutline: [px(1, 0, 1, 15, 16, 15)]
    },
    // Fasola i groch bez podpory (1.31.0): dwie skrzyżowane płyty z liśćmi,
    // bez kolizji.
    vine_ground: {
        support: [],
        leaves: [px(0, 0, 7.95, 16, 16, 8.05), px(7.95, 0, 0, 8.05, 16, 16)].map(slot(1)),
        collision: [],
        outline: [px(2, 0, 2, 14, 12, 14)],
        vineOutline: [px(2, 0, 2, 14, 12, 14)]
    },
    // Wigwam z tyczek (1.31.0): dwie skrzyżowane płyty 2 x 3 bloki z całym
    // obrazkiem (info.sprite - ChunkMesher rozciąga na nie teksturę), bez
    // kolizji. Z fasolą - te same płyty, inny obrazek.
    vine_wigwam: {
        support: [px(-8, 0, 7.95, 24, 48, 8.05), px(7.95, 0, -8, 8.05, 48, 24)],
        leaves: [],
        collision: [],
        // (Celownik sprawdza tylko komórkę bloku - celuje się w dół wigwamu.)
        outline: [px(1, 0, 1, 15, 16, 15)],
        vineOutline: [px(1, 0, 1, 15, 16, 15)]
    },
    vine_roof: {
        support: [px(0, 14, 0, 16, 16, 16)],
        leaves: [px(0, 12, 0, 16, 15.9, 16)].map(slot(1)),
        hang: [px(0, 0, 7.95, 16, 16, 8.05), px(7.95, 0, 0, 8.05, 16, 16)].map(slot(2)),
        collision: [px(0, 14, 0, 16, 16, 16)],
        outline: [px(0, 14, 0, 16, 16, 16)],
        vineOutline: [px(0, 12, 0, 16, 16, 16)],
        hangOutline: [px(0, 4, 0, 16, 16, 16)]
    }
};

function vineShapeBoxes(info, purpose) {
    const shape = VINE_SHAPES[info.kind];
    const turn = (boxes) => (info.facing ? boxes.map((box) => rotateBox(box, info.facing)) : boxes);
    if (purpose === 'collision') return turn(shape.collision);
    if (purpose === 'outline') return turn(info.support ? shape.outline : info.hang ? shape.hangOutline : shape.vineOutline);
    return turn(info.support ? shape.support : [...shape.support, ...shape.leaves, ...(info.hang ? shape.hang : [])]);
}

// Pudełka kształtu. purpose: 'render' | 'collision' | 'outline'; mask -
// połączenia płotu (connectMask).
export function shapeBoxes(id, purpose = 'render', mask = 0) {
    const info = shapeInfo(id);
    if (!info) return null;
    switch (info.kind) {
        case 'vine_trellis':
        case 'vine_pole':
        case 'vine_brush':
        case 'vine_ground':
        case 'vine_wigwam':
        case 'vine_roof':
            return vineShapeBoxes(info, purpose);
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
        case 'door': {
            const box = info.open ? DOOR[info.hinge] : DOOR.closed;
            return [rotateBox(box, info.facing)];
        }
        case 'trapdoor': {
            const box = info.open ? TRAPDOOR.open : TRAPDOOR[info.half];
            return [rotateBox(box, info.facing)];
        }
        case 'bed': {
            if (purpose === 'collision') return info.bedding ? BED_COLLISION.made : BED_COLLISION.frame;
            const boxes = purpose === 'outline' ? [...BED_OUTLINE[info.part], ...(info.bedding ? BED_BEDDING[info.part] : [])]
                : info.bedding ? [...BED_FRAME[info.part], ...BED_BEDDING[info.part]] : BED_FRAME[info.part];
            return boxes.map((box) => rotateBox(box, info.facing));
        }
        case 'gourd':
            return GOURD;
        case 'mat':
            if (purpose === 'collision') return [];
            return MAT[info.part].map((box) => rotateBox(box, info.facing));
        case 'table':
        // Stół krawiecki (1.27.0, sewingTable.js) - ten sam kształt.
        case 'sewing':
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

// ------------------------------------------------------------
// PŁYTY ZASŁANIAJĄCE ŚWIATŁO (1.16.0)
//
// Drzwi i klapa to cienka płyta przy jednej ścianie swojej komórki.
// Światło (Light.js) nie przechodzi przez TĘ ścianę komórki - resztą
// komórki płynie jak przez powietrze. Liczy się miejsce, w którym płyta
// naprawdę stoi (z pudełka kształtu), a nie napis "otwarte / zamknięte":
// drzwi otwarte w bok zasłaniają boczną ścianę, klapa w suficie - górną.
//
// Maska: bit 0 - zachód (-x), 1 - wschód (+x), 2 - północ (-z),
// 3 - południe (+z), 4 - góra, 5 - dół (ta sama kolejność co sąsiedzi
// w Light.js; przeciwna ściana to numer ^ 1).
// ------------------------------------------------------------

export const FACE_BITS = { west: 1, east: 2, north: 4, south: 8, up: 16, down: 32 };

const THIN = 3 / 16 + 1e-6;

export function lightFaceMask(id) {
    const info = shapeInfo(id);
    if (info?.kind !== 'door' && info?.kind !== 'trapdoor') return 0;
    const box = shapeBoxes(id, 'render')?.[0];
    if (!box) return 0;
    const [x0, y0, z0, x1, y1, z1] = box;
    const near = (value) => value <= 1e-6, far = (value) => value >= 1 - 1e-6;
    const full = (a0, a1, b0, b1) => near(a0) && far(a1) && near(b0) && far(b1);
    let mask = 0;
    if (full(y0, y1, z0, z1)) mask |= near(x0) && x1 <= THIN ? FACE_BITS.west : far(x1) && x0 >= 1 - THIN ? FACE_BITS.east : 0;
    if (full(x0, x1, y0, y1)) mask |= near(z0) && z1 <= THIN ? FACE_BITS.north : far(z1) && z0 >= 1 - THIN ? FACE_BITS.south : 0;
    if (full(x0, x1, z0, z1)) mask |= near(y0) && y1 <= THIN ? FACE_BITS.down : far(y1) && y0 >= 1 - THIN ? FACE_BITS.up : 0;
    return mask;
}
