// ------------------------------------------------------------
// WYROBY STOLARSKIE - MODELE POZA ŚWIATEM (0.90.0)
//
// Ściany pudełek z ShapeBoxes.js w formacie modeli (jak skrzynia czy
// pochodnia): vertices - rogi TL, TR, BL, BR widziane z zewnątrz,
// uv - [u, v] w kafelku tekstury (v od góry). Służy ikonkom (BlockIcons),
// modelowi w dłoni (PlayerModel) i miniaturom na stole stolarskim
// (CarpenterTableRenderer). W świecie te same pudełka rysuje ChunkMesher.
// ------------------------------------------------------------

import * as THREE from 'three';
import { shapeBoxes, SIDE_BITS } from '../world/ShapeBoxes.js';
import { shapeId, shapeItem, shapeBaseType, WOOD_SHAPE_BLOCKS } from '../blocks/woodShapes.js';
import { BEDDINGS, beddingOf, matId } from '../blocks/bedding.js';
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

// Drzwi (0.91.0, model Kamila drzwi.bbmodel): płyta 16 x 32 x 2 px przy
// północnym brzegu dolnej komórki (y 0-2). Przód i tył - cały obrazek
// 16 x 32 tak samo (klamka po stronie przeciwnej do zawiasu), boki -
// ramka. Zawias prawy - obrazek odbity.
export const DOOR_BOX = [0, 0, 0, 1, 2, 2 / 16];

export function doorFaces(texture, hinge = 'left') {
    const [x0, y0, z0, x1, y1, z1] = DOOR_BOX;
    const u = (x) => (hinge === 'right' ? 1 - x : x);
    const v = (y) => 1 - y / 2;
    const faces = [];
    for (const [name, { normal, corners }] of Object.entries(FACE_CORNERS)) {
        const points = corners([x0, y0, z0], [x1, y1, z1]);
        const uv = points.map(([x, y, z]) => {
            if (name === 'north' || name === 'south') return [u(x), v(y)];
            if (name === 'east' || name === 'west') return [u(name === 'east' ? 1 - z * 0.5 : z * 0.5), v(y)];
            return [u(x), z * 0.5];
        });
        faces.push({ texture, color: [255, 255, 255], normal, vertices: points, uv: uv.map((pair) => pair.map(wrap)) });
    }
    return faces;
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
    const item = shapeItem(type);
    if (!item) return null;
    const { wood, kind } = item;
    const texture = WOOD_SHAPE_BLOCKS[type].textures.all;
    if (kind === 'door') {
        // Przodem do patrzącego (+z): odbijamy płytę z północnego brzegu.
        return doorFaces(texture).map((face) => ({ ...face, normal: [-face.normal[0], face.normal[1], -face.normal[2]],
            vertices: face.vertices.map(([x, y, z]) => [1 - x, y, 1 - z]) }));
    }
    if (kind === 'trapdoor') return boxFaces(shapeBoxes(shapeId(wood, 'trapdoor')), texture);
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
