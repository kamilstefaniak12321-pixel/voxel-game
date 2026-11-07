// ------------------------------------------------------------
// SKRZYNIA - MODEL (0.78.0)
//
// Ściany z desek (1 piksel grubości), dno, wieko na zawiasie z tyłu
// i żelazny zamek z przodu. Środek jest pusty - gdy wieko się otworzy,
// widać dno podzielone na 4 x 3 przegródki (ChestState.js), w których
// leżą przedmioty. Ten sam model rysuje świat (ChestRenderer.js), ikonka,
// przedmiot w ręce i okno skrzyni w ekwipunku (ChestView.js).
//
// Układ modelu: x i z od -0,5 do 0,5 (środek bloku), y od 0; przód
// skrzyni na -z (północ). Tekstura: kafelek atlasu "chest" 32 x 32
// (assets/models/chest/skrzynia.png, tools/skrzynia_tekstura.py).
// Ściany jak w innych modelach: wierzchołki TL, TR, BL, BR widziane z
// zewnątrz, uv - [u, v] w kafelku (v od góry).
// ------------------------------------------------------------

import { CHEST_COLUMNS, CHEST_ROWS } from '../game/ChestState.js';

export const CHEST_TEXTURE = 'chest';

const P = 1 / 16;

// Wymiary w pikselach (z 16 na blok).
export const CHEST_BODY_HEIGHT = 10;
export const CHEST_LID_HEIGHT = 4;
export const CHEST_FLOOR = 1;

// Zawias wieka: tylna górna krawędź skrzyni.
export const CHEST_HINGE = { y: CHEST_BODY_HEIGHT * P, z: 15 * P - 0.5 };

// Środek skrzyni (bez ścianek) i jego podział na przegródki.
export const CHEST_INSIDE = { min: 2 * P - 0.5, max: 14 * P - 0.5, floor: CHEST_FLOOR * P };

const CELL_X = (CHEST_INSIDE.max - CHEST_INSIDE.min) / CHEST_COLUMNS;
const CELL_Z = (CHEST_INSIDE.max - CHEST_INSIDE.min) / CHEST_ROWS;

// Przegródka: kolumna od lewej i rząd od tyłu - tak, jak widać skrzynię
// od przodu (patrząc w stronę +z lewa ręka to +x).
export function chestCellCenter(cell) {
    const column = cell % CHEST_COLUMNS, row = Math.floor(cell / CHEST_COLUMNS);
    return {
        x: CHEST_INSIDE.max - (column + 0.5) * CELL_X,
        z: CHEST_INSIDE.max - (row + 0.5) * CELL_Z,
        width: CELL_X,
        depth: CELL_Z
    };
}

// Przegródka pod punktem dna (x, z w układzie modelu) albo -1.
export function chestCellAt(x, z) {
    const column = Math.floor((CHEST_INSIDE.max - x) / CELL_X);
    const row = Math.floor((CHEST_INSIDE.max - z) / CELL_Z);
    if (column < 0 || column >= CHEST_COLUMNS || row < 0 || row >= CHEST_ROWS) return -1;
    return row * CHEST_COLUMNS + column;
}


// Obszary tekstury (piksele kafelka 32 x 32) i jak współrzędne ściany
// (piksele modelu) trafiają w obszar.
const REGIONS = {
    side: { x: 16 * 0, y: 0, map: (h, y) => [h, CHEST_BODY_HEIGHT - y] },
    inner: { x: 16, y: 0, map: (h, v) => [h, v] },
    top: { x: 0, y: 16, map: (x, z) => [x, z] },
    lidSide: { x: 16, y: 16, map: (h, y) => [h, CHEST_BODY_HEIGHT + CHEST_LID_HEIGHT - y] },
    latch: { x: 16, y: 20, map: (h, y) => [(h - 7) * 2, 12 - y] }
};

const FACE_CORNERS = {
    north: { normal: [0, 0, -1], corners: (a, b) => [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]]] },
    south: { normal: [0, 0, 1], corners: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]]] },
    east: { normal: [1, 0, 0], corners: (a, b) => [[b[0], b[1], b[2]], [b[0], b[1], a[2]], [b[0], a[1], b[2]], [b[0], a[1], a[2]]] },
    west: { normal: [-1, 0, 0], corners: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], a[2]], [a[0], a[1], b[2]]] },
    up: { normal: [0, 1, 0], corners: (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]]] },
    down: { normal: [0, -1, 0], corners: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]]] }
};

// Współrzędne ściany w obszarze tekstury: boczne - (poziomo, wysokość),
// góra / dół - (x, z).
function faceUv(face, region, corner) {
    const [x, y, z] = corner;
    const [h, v] = face === 'north' || face === 'south' ? [x, y]
        : face === 'east' || face === 'west' ? [z, y] : [x, z];
    const [u, w] = REGIONS[region].map(h, v);
    return [(REGIONS[region].x + Math.max(0, Math.min(16, u))) / 32, (REGIONS[region].y + Math.max(0, Math.min(16, w))) / 32];
}

// Prostopadłościan w pikselach; faces: { ściana: obszar tekstury }.
function box(part, from, to, faces) {
    return Object.entries(faces).map(([face, region]) => {
        const corners = FACE_CORNERS[face].corners(from, to);
        return {
            part,
            texture: CHEST_TEXTURE,
            color: [255, 255, 255],
            normal: FACE_CORNERS[face].normal,
            vertices: corners.map(([x, y, z]) => [x * P - 0.5, y * P, z * P - 0.5]),
            uv: corners.map((corner) => faceUv(face, region, corner))
        };
    });
}

const H = CHEST_BODY_HEIGHT, L = CHEST_BODY_HEIGHT + CHEST_LID_HEIGHT;

export const CHEST_FACES = [
    // Przednia i tylna ścianka (z końcami na bokach skrzyni).
    ...box('body', [1, 0, 1], [15, H, 2], { north: 'side', south: 'inner', east: 'side', west: 'side', up: 'inner', down: 'inner' }),
    ...box('body', [1, 0, 14], [15, H, 15], { south: 'side', north: 'inner', east: 'side', west: 'side', up: 'inner', down: 'inner' }),
    // Boczne ścianki.
    ...box('body', [1, 0, 2], [2, H, 14], { west: 'side', east: 'inner', up: 'inner', down: 'inner' }),
    ...box('body', [14, 0, 2], [15, H, 14], { east: 'side', west: 'inner', up: 'inner', down: 'inner' }),
    // Dno.
    ...box('body', [2, 0, 2], [14, CHEST_FLOOR, 14], { up: 'inner', down: 'inner' }),
    // Wieko i zamek (otwierają się razem).
    ...box('lid', [1, H, 1], [15, L, 15], { up: 'top', down: 'inner', north: 'lidSide', south: 'lidSide', east: 'lidSide', west: 'lidSide' }),
    ...box('lid', [7, 8, 0], [9, 12, 1], { north: 'latch', east: 'latch', west: 'latch', up: 'latch', down: 'latch' })
];

export const CHEST_BOUNDS = { min: [P, 0, P], max: [1 - P, L * P, 1 - P] };

// Model zamkniętej skrzyni do ikonki i dłoni: (x, z) od 0 do 1,
// przodem do patrzącego na ikonkę (+z).
export function getChestFaces() {
    return CHEST_FACES.map((face) => ({
        ...face,
        normal: [-face.normal[0], face.normal[1], -face.normal[2]],
        vertices: face.vertices.map(([x, y, z]) => [0.5 - x, y, 0.5 - z])
    }));
}
