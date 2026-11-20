// ------------------------------------------------------------
// WYROBY STOLARSKIE - MODELE POZA ŚWIATEM (0.90.0)
//
// Ściany pudełek z ShapeBoxes.js w formacie modeli (jak skrzynia czy
// pochodnia): vertices - rogi TL, TR, BL, BR widziane z zewnątrz,
// uv - [u, v] w kafelku tekstury (v od góry). Służy ikonkom (BlockIcons),
// modelowi w dłoni (PlayerModel) i miniaturom na stole stolarskim
// (CarpenterTableRenderer). W świecie te same pudełka rysuje ChunkMesher.
// ------------------------------------------------------------

import { VINE_SUPPORTS } from '../blocks/vines.js';
import * as THREE from 'three';
import { shapeBoxes, SIDE_BITS } from '../world/ShapeBoxes.js';
import { shapeId, shapeItem, shapeBaseType, WOOD_SHAPE_BLOCKS } from '../blocks/woodShapes.js';
import { BEDDINGS, beddingOf, matId } from '../blocks/bedding.js';
import { SEWING_TABLE, sewingTableId } from '../blocks/sewingTable.js';
import { getAtlasUV } from './TextureAtlas.js';

const FACE_CORNERS = {
    north: { normal: [0, 0, -1], corners: (a, b) => [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]]],
        uv: ([x, y]) => [1 - x, 1 - y] },
    south: { normal: [0, 0, 1], corners: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]]],
        uv: ([x, y]) => [x, 1 - y] },
    east: { normal: [1, 0, 0], corners: (a, b) => [[b[0], b[1], b[2]], [b[0], b[1], a[2]], [b[0], a[1], b[2]], [b[0], a[1], a[2]]],
        uv: ([, y, z]) => [1 - z, 1 - y] },
    west: { normal: [-1, 0, 0], corners: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], a[2]], [a[0], a[1], b[2]]],
        uv: ([, y, z]) => [z, 1 - y] },
    up: { normal: [0, 1, 0], corners: (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]]],
        uv: ([x, , z]) => [x, z] },
    down: { normal: [0, -1, 0], corners: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]]],
        uv: ([x, , z]) => [x, 1 - z] }
};

// UV z pozycji w komórce (jak w świecie: słoje desek tak samo).
const wrap = (value) => Math.min(1, Math.max(0, value));

// extra - dodatkowe tekstury pudełek (box[6] = numer, od 1).
export function boxFaces(boxes, texture, offset = [0, 0, 0], extra = []) {
    const faces = [];
    for (const box of boxes) {
        const boxTexture = box[6] ? extra[box[6] - 1] ?? texture : texture;
        const a = [box[0], box[1], box[2]], b = [box[3], box[4], box[5]];
        for (const { normal, corners, uv } of Object.values(FACE_CORNERS)) {
            const points = corners(a, b);
            faces.push({
                texture: boxTexture,
                color: [255, 255, 255],
                normal,
                vertices: points.map(([x, y, z]) => [x + offset[0], y + offset[1], z + offset[2]]),
                uv: points.map((point) => uv(point).map(wrap))
            });
        }
    }
    return faces;
}

// Drzwi i klapa z modelu Kamila ("drzwi i zapadnia.bbmodel", 1.16.0).
//
// Drzwi: płyta 16 x 32 x 2 px przy północnym brzegu dolnej komórki
// (zawias lewy - przy zachodnim brzegu). Przód (od środka komórki,
// z klamką po stronie przeciwnej do zawiasu) - obrazek `texture`, tył -
// `texture`_back, krawędzie - paski z `texture`_edge (układ:
// tools/drzwi_tekstury.py). Zawias prawy - lustrzane odbicie.
export const DOOR_BOX = [0, 0, 0, 1, 2, 2 / 16];

// Klapa: płyta 16 x 2 x 16 px na dnie komórki, zawias przy północnym
// brzegu. Wierzch - `texture`, spód - `texture`_bottom, krawędzie -
// `texture`_edge. Klapa górna (half 'top') - odbicie w pionie.
export const TRAPDOOR_BOX = [0, 0, 0, 1, 2 / 16, 1];

// Ściana pudełka: uv(point) -> [u, v] w kafelku (piksele 0-16, v od góry).
function quad(faces, texture, name, a, b, uv) {
    const { normal, corners } = FACE_CORNERS[name];
    const points = corners(a, b);
    faces.push({ texture, color: [255, 255, 255], normal, vertices: points, uv: points.map((point) => uv(point).map((value) => wrap(value / 16))) });
}

// Lustro wzdłuż osi `axis` (0 - x, 1 - y) wokół środka komórki; rogi
// zamieniają się miejscami, żeby ściana dalej patrzyła na zewnątrz.
function mirrorFaces(faces, axis) {
    return faces.map((face) => {
        const flip = (list) => axis === 0 ? [list[1], list[0], list[3], list[2]] : [list[2], list[3], list[0], list[1]];
        return {
            ...face,
            normal: face.normal.map((value, i) => (i === axis ? -value : value)),
            vertices: flip(face.vertices.map((vertex) => vertex.map((value, i) => (i === axis ? 1 - value : value)))),
            uv: flip(face.uv)
        };
    });
}

export function doorFaces(texture, hinge = 'left') {
    const [x0, y0, z0, x1, y1, z1] = DOOR_BOX;
    const a = [x0, y0, z0], b = [x1, y1, z1];
    const back = `${texture}_back`, edge = `${texture}_edge`;
    const faces = [];
    const v = (y) => 16 - y * 8;
    quad(faces, texture, 'south', a, b, ([x, y]) => [x * 16, v(y)]);
    quad(faces, back, 'north', a, b, ([x, y]) => [16 - x * 16, v(y)]);
    quad(faces, edge, 'up', a, b, ([x, , z]) => [x * 16, z * 16]);
    quad(faces, edge, 'down', a, b, ([x, , z]) => [x * 16, 4 - z * 16]);
    // Boki: pasek 2 x 32 leży w kafelku w dwóch połowach (góra drzwi z lewej).
    for (const half of [0, 1]) {
        const low = [x0, 1 - half, z0], high = [x1, 2 - half, z1];
        quad(faces, edge, 'east', low, high, ([, y, z]) => [(2 - half - y) * 16, 4 + half * 2 + 2 - z * 16]);
        quad(faces, edge, 'west', low, high, ([, y, z]) => [(2 - half - y) * 16, 8 + half * 2 + z * 16]);
    }
    return hinge === 'right' ? mirrorFaces(faces, 0) : faces;
}

export function trapdoorFaces(texture, half = 'bottom') {
    const [x0, y0, z0, x1, y1, z1] = TRAPDOOR_BOX;
    const a = [x0, y0, z0], b = [x1, y1, z1];
    const bottom = `${texture}_bottom`, edge = `${texture}_edge`;
    const faces = [];
    quad(faces, texture, 'up', a, b, ([x, , z]) => [16 - x * 16, 16 - z * 16]);
    quad(faces, bottom, 'down', a, b, ([x, , z]) => [16 - x * 16, z * 16]);
    quad(faces, edge, 'west', a, b, ([, y, z]) => [z * 16, 2 - y * 16]);
    quad(faces, edge, 'east', a, b, ([, y, z]) => [16 - z * 16, 4 - y * 16]);
    quad(faces, edge, 'north', a, b, ([x, y]) => [16 - x * 16, 6 - y * 16]);
    quad(faces, edge, 'south', a, b, ([x, y]) => [x * 16, 8 - y * 16]);
    return half === 'top' ? mirrorFaces(faces, 1) : faces;
}

// Całe łóżko (obie części) z pościelą albo bez: wezgłowie na -z, środek
// łóżka w środku komórki (wystaje pół bloku w obie strony).
export function bedFaces(wood, bedding = null) {
    const texture = WOOD_SHAPE_BLOCKS[shapeBaseType(wood, 'bed')].textures.all;
    const extra = bedding ? [BEDDINGS[bedding].texture] : [];
    return [
        ...boxFaces(shapeBoxes(shapeId(wood, 'bed', { part: 'head', bedding })), texture, [0, 0, -0.5], extra),
        ...boxFaces(shapeBoxes(shapeId(wood, 'bed', { part: 'foot', bedding })), texture, [0, 0, 0.5], extra)
    ];
}

// Posłanie (obie części), jak bedFaces.
export function matFaces(bedding) {
    const texture = BEDDINGS[bedding].texture;
    return [
        ...boxFaces(shapeBoxes(matId(bedding, 'north', 'head')), texture, [0, 0, -0.5]),
        ...boxFaces(shapeBoxes(matId(bedding, 'north', 'foot')), texture, [0, 0, 0.5])
    ];
}

// Model wyrobu w ekwipunku: schody i furtka przodem do patrzącego (+z),
// płot ze szczeblami w obie strony, stół - obie części.
export function itemShapeFaces(type) {
    const bedding = beddingOf(type);
    if (bedding) return matFaces(bedding);
    if (type === SEWING_TABLE) return sewingTableFaces();
    // Kratka, tyczka, pergola (1.30.0): kształt podpory z jej teksturą.
    if (VINE_SUPPORTS[type]) {
        const support = VINE_SUPPORTS[type];
        return boxFaces(shapeBoxes(support.id), support.textures.all ?? support.textures.side);
    }
    const item = shapeItem(type);
    if (!item) return null;
    const { wood, kind } = item;
    const texture = WOOD_SHAPE_BLOCKS[type].textures.all;
    if (kind === 'door') {
        // Przód (z klamką) patrzy na +z; płyta przesunięta na środek komórki.
        return doorFaces(texture).map((face) => ({ ...face, vertices: face.vertices.map(([x, y, z]) => [x, y, z + 7 / 16]) }));
    }
    if (kind === 'trapdoor') return trapdoorFaces(texture);
    if (kind === 'bed') return bedFaces(wood, null);
    if (kind === 'table') {
        // Przód na +z (south): część B po prawej patrzącego od przodu (+x).
        return [
            ...boxFaces(shapeBoxes(shapeId(wood, 'table', { facing: 'south', part: 'a' })), texture, [-1, 0, 0]),
            ...boxFaces(shapeBoxes(shapeId(wood, 'table', { facing: 'south', part: 'b' })), texture, [0, 0, 0])
        ].map((face) => ({ ...face, vertices: face.vertices.map(([x, y, z]) => [x + 0.5, y, z]) }));
    }
    const id = kind === 'stairs' ? shapeId(wood, 'stairs', { facing: 'north' })
        : kind === 'gate' ? shapeId(wood, 'gate', { facing: 'south' })
            : shapeId(wood, kind);
    const mask = kind === 'fence' ? SIDE_BITS.east | SIDE_BITS.west : 0;
    return boxFaces(shapeBoxes(id, 'render', mask), texture);
}

// Stół krawiecki (1.27.0): kształt stołu stolarskiego, boki z desek
// brzozowych, blat z miarką (część A) i z kredą (część B). Przód na +z.
function sewingTableFaces() {
    const part = (name, offset) => boxFaces(shapeBoxes(sewingTableId('south', name), 'render'), 'birch_planks', offset)
        .map((face) => face.normal[1] === 1 && face.vertices.every(([, y]) => y > 0.99)
            ? { ...face, texture: name === 'a' ? 'sewing_table_top' : 'sewing_table_top_b' } : face);
    return [...part('a', [-1, 0, 0]), ...part('b', [0, 0, 0])]
        .map((face) => ({ ...face, vertices: face.vertices.map(([x, y, z]) => [x + 0.5, y, z]) }));
}

// Geometria z atlasu (UV przeliczone na kafelek tekstury).
export function buildFacesGeometry(faces) {
    const positions = [], normals = [], uvs = [], indices = [];
    const tiles = new Map();
    for (const face of faces) {
        if (!tiles.has(face.texture)) tiles.set(face.texture, getAtlasUV(face.texture));
        const tile = tiles.get(face.texture);
        const base = positions.length / 3;
        face.vertices.forEach((vertex, i) => {
            positions.push(...vertex);
            normals.push(...face.normal);
            uvs.push(tile.uMin + face.uv[i][0] * (tile.uMax - tile.uMin), tile.vMax - face.uv[i][1] * (tile.vMax - tile.vMin));
        });
        indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}
