import * as THREE from 'three';
import { getRiverPlantFaces } from '../rendering/RiverPlantGeometry.js';
import { getItemModel as getFruitItemModel } from '../rendering/ItemGeometry.js';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { ITEM_TYPES, isItemType } from '../items/ItemRegistry.js';
import { getAtlasUV, blockAtlasTexture, getTileMask } from '../rendering/TextureAtlas.js';
import { getFaceTexture, setPotatoDefine } from '../rendering/BlockRenderData.js';
import { createModelMaterial } from '../rendering/ModelMaterial.js';
import { getTorchInfo } from '../blocks/torches.js';
import { itemShapeFaces, buildFacesGeometry } from '../rendering/ShapeGeometry.js';
import { getTorchFaces } from '../rendering/TorchGeometry.js';
import { createTorchModel, disposeTorchModel } from '../rendering/TorchMaterial.js';
import { blockSurfaceProfile, SURFACE_PROFILES } from '../rendering/SurfaceProfiles.js';
import { skinTexture } from './skin.js';

// ------------------------------------------------------------
// MODEL GRACZA
//
// Klockowa postać jak w Minecrafcie (wymiary w pikselach skórki,
// 32 piksele = wysokość gracza), ale z większą liczbą stawów:
//
//            [ głowa ]            8 x 8 x 8      staw: szyja
//          ┌─[klatka]─┐           8 x 6 x 4      staw: talia
//   ramię ─┤ [brzuch] ├─ ramię    8 x 6 x 4      (miednica)
//  przedr. │          │ przedr.   ręce 4 x 6 x 4 + 4 x 6 x 4   stawy: bark, łokieć
//          [udo][udo]             nogi 4 x 6 x 4 + 4 x 6 x 4   stawy: biodro, kolano
//          [gol.][gol.]
//
// Tułów, ręce i nogi to "zginane klocki": wyprostowane wyglądają jak
// jeden klocek, a w środku (łokieć, kolano, talia) zginają się bez
// szpar - dwie połowy obracają się osobno, a pas wierzchołków w stawie
// leży w połowie między nimi (gładkie zgięcie). Styl 'blocks' robi
// z każdej połowy osobny, sztywny klocek (widać wyraźnie dwie części).
//
// Animacje (PlayerAnimator.js) ustawiają kąty stawów: setPose(pose).
// Szczegóły i układ skórki: docs/gracz.md.
// ------------------------------------------------------------

// Rozmiar jednego piksela skórki w blokach (gracz ma 1,8 bloku).

export const MODEL_PIXEL = 1.8 / 32;

const SKIN_SIZE = 64;


// Kości (stawy): rodzic, położenie względem rodzica (piksele).
// Model patrzy w stronę -Z (do przodu), +X to jego prawa strona.

const BONES = {
    pelvis: { parent: null, at: [0, 12, 0] },       // miednica (dół tułowia)
    waist: { parent: 'pelvis', at: [0, 6, 0] },     // talia
    neck: { parent: 'waist', at: [0, 6, 0] },       // szyja (dół głowy)
    shoulderR: { parent: 'waist', at: [6, 4, 0] },  // prawy bark
    elbowR: { parent: 'shoulderR', at: [0, -4, 0] },
    shoulderL: { parent: 'waist', at: [-6, 4, 0] },
    elbowL: { parent: 'shoulderL', at: [0, -4, 0] },
    hipR: { parent: 'pelvis', at: [2, 0, 0] },      // prawe biodro
    kneeR: { parent: 'hipR', at: [0, -6, 0] },
    hipL: { parent: 'pelvis', at: [-2, 0, 0] },
    kneeL: { parent: 'hipL', at: [0, -6, 0] }
};

const BONE_NAMES = Object.keys(BONES);


// Części modelu: środek klocka (x, z), góra i rozmiar (piksele), miejsce
// w skórce (uv - zwykła warstwa, overlay - wierzchnia) i kości:
// [kość górnej połowy, kość dolnej połowy] (zginany klocek) albo jedna.
// Wierzchnia warstwa jest trochę większa (inflate).

const PARTS = [
    { name: 'head', x: 0, z: 0, top: 32, size: [8, 8, 8], uv: [0, 0], overlay: [32, 0], inflate: 0.5, bones: ['neck'] },
    { name: 'body', x: 0, z: 0, top: 24, size: [8, 12, 4], uv: [16, 16], overlay: [16, 32], inflate: 0.25, bones: ['waist', 'pelvis'] },
    { name: 'armR', x: 6, z: 0, top: 24, size: [4, 12, 4], uv: [40, 16], overlay: [40, 32], inflate: 0.25, bones: ['shoulderR', 'elbowR'] },
    { name: 'armL', x: -6, z: 0, top: 24, size: [4, 12, 4], uv: [32, 48], overlay: [48, 48], inflate: 0.25, bones: ['shoulderL', 'elbowL'] },
    { name: 'legR', x: 2, z: 0, top: 12, size: [4, 12, 4], uv: [0, 16], overlay: [0, 32], inflate: 0.25, bones: ['hipR', 'kneeR'] },
    { name: 'legL', x: -2, z: 0, top: 12, size: [4, 12, 4], uv: [16, 48], overlay: [0, 48], inflate: 0.25, bones: ['hipL', 'kneeL'] }
];


// Pusta poza: wszystkie kąty 0 (stoi prosto, ręce wzdłuż ciała).
// Kąty w radianach; znaki:
//   lean   - pochylenie do przodu (+),
//   twist  - skręt w lewo (+, patrząc z góry przeciwnie do zegara),
//   sway   - przechył na prawy bok (+),
//   swing  - ręka / noga do przodu (+),
//   spread - ręka / noga w bok, od ciała (+),
//   bend   - zgięcie łokcia (+ przedramię do przodu) / kolana (+ goleń do tyłu),
//   pitch  - głowa w górę (+), yaw - głowa w lewo (+), roll - przechył głowy.
// drop - o ile pikseli obniżyć miednicę (kucanie, ugięte nogi).

export function createPose() {

    return {
        drop: 0,
        pelvis: { lean: 0, twist: 0, sway: 0 },
        waist: { lean: 0, twist: 0, sway: 0 },
        head: { pitch: 0, yaw: 0, roll: 0 },
        armR: { swing: 0, spread: 0, twist: 0, bend: 0 },
        armL: { swing: 0, spread: 0, twist: 0, bend: 0 },
        legR: { swing: 0, spread: 0, twist: 0, bend: 0 },
        legL: { swing: 0, spread: 0, twist: 0, bend: 0 }
    };

}

// ------------------------------------------------------------
// Budowa geometrii
// ------------------------------------------------------------

// Zbiera wierzchołki, a na końcu robi z nich BufferGeometry.

class GeometryBuilder {

    constructor() {

        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.skinIndex = [];
        this.skinWeight = [];
        this.indices = [];

        this.groups = [];

    }


    // Czworokąt: 4 rogi (kolejność: lewy górny, prawy górny, lewy dolny,
    // prawy dolny - patrząc na ścianę z zewnątrz), uv rogów (piksele
    // skórki) i kości rogów: [[indeks, waga], ...].

    quad(corners, normal, uvs, skins) {

        const base = this.positions.length / 3;

        for (let i = 0; i < 4; i++) {

            const [x, y, z] = corners[i];

            this.positions.push(x * MODEL_PIXEL, y * MODEL_PIXEL, z * MODEL_PIXEL);
            this.normals.push(...normal);
            this.uvs.push(uvs[i][0] / SKIN_SIZE, 1 - uvs[i][1] / SKIN_SIZE);

            const skin = skins[i];

            this.skinIndex.push(skin[0][0], skin[1]?.[0] ?? 0, 0, 0);
            this.skinWeight.push(skin[0][1], skin[1]?.[1] ?? 0, 0, 0);

        }

        this.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);

    }


    // Grupa (materiał) dla trójkątów dodanych od `start`.

    group(start, materialIndex) {

        this.groups.push({ start, count: this.indices.length - start, materialIndex });

    }


    build() {

        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinIndex, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinWeight, 4));

        geometry.setIndex(this.indices);

        for (const { start, count, materialIndex } of this.groups) {
            geometry.addGroup(start, count, materialIndex);
        }

        return geometry;

    }

}


// Klocek części modelu (jedna warstwa skórki).
//   part     - wpis z PARTS,
//   uvOrigin - róg miejsca w skórce,
//   inflate  - powiększenie (piksele; wierzchnia warstwa),
//   style    - 'smooth' (gładkie zgięcia) albo 'blocks' (osobne klocki).
//
// Ściany biorą obrazek ze skórki jak w Minecrafcie: w pasie pod
// wierzchem i spodem kolejno prawy bok, przód, lewy bok, tył.

function addPart(builder, part, uvOrigin, inflate, style, boneIndex) {

    const [w, h, d] = part.size;
    const [u, v] = uvOrigin;

    const x0 = part.x + w / 2 + inflate;   // prawa strona (+X)
    const x1 = part.x - w / 2 - inflate;   // lewa strona (-X)
    const zf = part.z - d / 2 - inflate;   // przód (-Z)
    const zb = part.z + d / 2 + inflate;   // tył (+Z)

    const yTop = part.top + inflate;
    const yBottom = part.top - h - inflate;


    const upper = boneIndex[part.bones[0]];
    const lower = boneIndex[part.bones[1] ?? part.bones[0]];

    const bendable = part.bones.length > 1;


    // Wysokości pasów boków (od góry): cały klocek albo dwie połowy.
    // W skórce połowa to h / 2 pikseli; pasy pokrywają się w środku.

    const ySplit = part.top - h / 2;

    const bands = bendable
        ? [
            { from: yTop, to: ySplit, vFrom: 0, vTo: h / 2, top: true },
            { from: ySplit, to: yBottom, vFrom: h / 2, vTo: h, top: false }
        ]
        : [{ from: yTop, to: yBottom, vFrom: 0, vTo: h, top: true }];


    // Kości rogu na wysokości y (gładko: pas w stawie dzielony 50 / 50).

    const skinAt = (y, band) => {

        if (!bendable) {
            return [[upper, 1]];
        }

        if (style === 'smooth') {

            if (Math.abs(y - ySplit) < 0.001) {
                return [[upper, 0.5], [lower, 0.5]];
            }

            return [[y > ySplit ? upper : lower, 1]];

        }

        return [[band.top ? upper : lower, 1]];

    };


    // Boki (każdy pas osobno). Kolejność rogów: lewy górny, prawy górny,
    // lewy dolny, prawy dolny - patrząc na ścianę z zewnątrz.

    const sides = [
        // przód (-Z): lewa strona obrazka = prawa strona modelu (+X)
        { normal: [0, 0, -1], a: [x0, zf], b: [x1, zf], u0: u + d, u1: u + d + w },
        // tył (+Z)
        { normal: [0, 0, 1], a: [x1, zb], b: [x0, zb], u0: u + 2 * d + w, u1: u + 2 * d + 2 * w },
        // prawy bok (+X): od tyłu do przodu
        { normal: [1, 0, 0], a: [x0, zb], b: [x0, zf], u0: u, u1: u + d },
        // lewy bok (-X): od przodu do tyłu
        { normal: [-1, 0, 0], a: [x1, zf], b: [x1, zb], u0: u + d + w, u1: u + 2 * d + w }
    ];


    for (const band of bands) {

        const v0 = v + d + band.vFrom;
        const v1 = v + d + band.vTo;

        const skinTop = skinAt(band.from, band);
        const skinBottom = skinAt(band.to, band);

        for (const side of sides) {

            builder.quad(
                [
                    [side.a[0], band.from, side.a[1]],
                    [side.b[0], band.from, side.b[1]],
                    [side.a[0], band.to, side.a[1]],
                    [side.b[0], band.to, side.b[1]]
                ],
                side.normal,
                [[side.u0, v0], [side.u1, v0], [side.u0, v1], [side.u1, v1]],
                [skinTop, skinTop, skinBottom, skinBottom]
            );

        }

    }


    // Wierzch (+Y): na obrazku przód modelu na dole, prawa strona po lewej.

    const top = [[upper, 1]];

    builder.quad(
        [[x0, yTop, zb], [x1, yTop, zb], [x0, yTop, zf], [x1, yTop, zf]],
        [0, 1, 0],
        [[u + d, v], [u + d + w, v], [u + d, v + d], [u + d + w, v + d]],
        [top, top, top, top]
    );


    // Spód (-Y): na obrazku przód modelu u góry.

    const bottom = [[lower, 1]];

    builder.quad(
        [[x0, yBottom, zf], [x1, yBottom, zf], [x0, yBottom, zb], [x1, yBottom, zb]],
        [0, -1, 0],
        [[u + d + w, v], [u + d + 2 * w, v], [u + d + w, v + d], [u + d + 2 * w, v + d]],
        [bottom, bottom, bottom, bottom]
    );


    // Osobne klocki: zamknięcia w stawie (żeby przy zgięciu nie było
    // widać pustego środka) - z obrazkiem spodu i wierzchu.

    if (bendable && style === 'blocks') {

        const upperSkin = [[upper, 1]];
        const lowerSkin = [[lower, 1]];

        builder.quad(
            [[x0, ySplit, zf], [x1, ySplit, zf], [x0, ySplit, zb], [x1, ySplit, zb]],
            [0, -1, 0],
            [[u + d + w, v], [u + d + 2 * w, v], [u + d + w, v + d], [u + d + 2 * w, v + d]],
            [upperSkin, upperSkin, upperSkin, upperSkin]
        );

        builder.quad(
            [[x0, ySplit, zb], [x1, ySplit, zb], [x0, ySplit, zf], [x1, ySplit, zf]],
            [0, 1, 0],
            [[u + d, v], [u + d + w, v], [u + d, v + d], [u + d + w, v + d]],
            [lowerSkin, lowerSkin, lowerSkin, lowerSkin]
        );

    }

}


// Sama prawa ręka (widok z oczu - FirstPersonHand.js): grupa 0 - zwykła
// warstwa, grupa 1 - rękaw (wierzchnia). Dłoń (dół ręki) w punkcie
// (0, 0, 0), ręka idzie w górę (+Y) do barku; przód ręki (-Z) jak
// w modelu.

export function buildArmGeometry() {

    const builder = new GeometryBuilder();

    const part = PARTS.find((p) => p.name === 'armR');

    const bones = { shoulderR: 0, elbowR: 0 };

    addPart(builder, part, part.uv, 0, 'blocks', bones);

    builder.group(0, 0);

    const overlayStart = builder.indices.length;

    addPart(builder, part, part.overlay, part.inflate, 'blocks', bones);

    builder.group(overlayStart, 1);

    const geometry = builder.build();

    geometry.deleteAttribute('skinIndex');
    geometry.deleteAttribute('skinWeight');

    geometry.translate(-part.x * MODEL_PIXEL, -(part.top - part.size[1]) * MODEL_PIXEL, -part.z * MODEL_PIXEL);

    return geometry;

}


// Cała geometria modelu: grupa 0 - zwykła warstwa, grupa 1 - wierzchnia.

function buildGeometry(style, boneIndex) {

    const builder = new GeometryBuilder();

    for (const part of PARTS) {
        addPart(builder, part, part.uv, 0, style, boneIndex);
    }

    builder.group(0, 0);


    const overlayStart = builder.indices.length;

    for (const part of PARTS) {
        addPart(builder, part, part.overlay, part.inflate, style, boneIndex);
    }

    builder.group(overlayStart, 1);


    return builder.build();

}

// ------------------------------------------------------------
// Blok w ręce: mały sześcian z teksturami bloku z atlasu.
// ------------------------------------------------------------

const HELD_FACES = [
    // nazwa ściany (BlockRenderData), normalna, rogi (lewy górny, prawy górny, lewy dolny, prawy dolny)
    ['right', [1, 0, 0], [[1, 1, 1], [1, 1, 0], [1, 0, 1], [1, 0, 0]]],
    ['left', [-1, 0, 0], [[0, 1, 0], [0, 1, 1], [0, 0, 0], [0, 0, 1]]],
    ['top', [0, 1, 0], [[0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 1, 1]]],
    ['bottom', [0, -1, 0], [[0, 0, 1], [1, 0, 1], [0, 0, 0], [1, 0, 0]]],
    ['front', [0, 0, 1], [[0, 1, 1], [1, 1, 1], [0, 0, 1], [1, 0, 1]]],
    ['back', [0, 0, -1], [[1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]]]
];


// Roślina w ręce: dwie skrzyżowane płaszczyzny (każda z obu stron).

const S = Math.SQRT1_2;

const HELD_PLANT_FACES = [
    ['front', [S, 0, -S], [[0, 1, 0], [1, 1, 1], [0, 0, 0], [1, 0, 1]]],
    ['front', [-S, 0, S], [[1, 1, 1], [0, 1, 0], [1, 0, 1], [0, 0, 0]]],
    ['front', [S, 0, S], [[0, 1, 1], [1, 1, 0], [0, 0, 1], [1, 0, 0]]],
    ['front', [-S, 0, -S], [[1, 1, 0], [0, 1, 1], [1, 0, 0], [0, 0, 1]]]
];


// Przedmiot (obrazek z grubością) - trochę większy niż blok w ręce.

const HELD_BLOCK_SCALE = 4.5;
const HELD_ITEM_SCALE = 8;


// ------------------------------------------------------------
// GRUBE PRZEDMIOTY W RĘCE (0.84.0, pomysł Kamila)
//
// Przedmiot (narzędzie, patyk, szyszka...) nie jest kartką bez grubości:
// obrazek 16 x 16 jest "wytłoczony" na grubość jednego piksela. Przód
// i tył to cały obrazek (przezroczyste piksele odpada alphaTest), a każdy
// widoczny piksel na brzegu ma ściankę boczną w swoim kolorze - jak
// przedmioty w Minecrafcie. Kształt brzegów z atlasu (getTileMask).
//
// Układ: x - w prawo na obrazku, y - w górę, z - grubość; środek
// obrazka w (0, 0, 0), obrazek ma rozmiar 1 x 1.
// ------------------------------------------------------------

export const ITEM_THICKNESS = 1 / 16;

// Obrazek w dłoni postaci: x obrazka (w prawo) - do przodu i trochę
// w dół, y (w górę) - w górę i trochę do przodu, przód obrazka w prawo
// (model patrzy w stronę -z). Przekątna trzonka (1, 1) idzie wtedy do
// przodu, ok. 20 stopni w górę.

const HELD_TILT = -25 * Math.PI / 180;
const HELD_ITEM_BASIS = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, Math.sin(HELD_TILT), -Math.cos(HELD_TILT)),
    new THREE.Vector3(0, Math.cos(HELD_TILT), Math.sin(HELD_TILT)),
    new THREE.Vector3(1, 0, 0)
);

export function buildExtrudedItemGeometry(textureName, profile = SURFACE_PROFILES.matte) {

    // Zwykły margines kafelka (jak płaski obrazek) - bez prześwitów
    // sąsiednich kafelków atlasu na brzegach.
    const uv = getAtlasUV(textureName);
    const mask = getTileMask(textureName);
    const positions = [], normals = [], uvs = [], indices = [], profiles = [];
    const half = ITEM_THICKNESS / 2;

    // Ścianka: środek, normalna, połowy rozmiarów wzdłuż dwóch osi;
    // cornerUv(róg) - UV rogu z jego położenia.
    const quad = (center, normal, a, b, cornerUv) => {
        const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0) [a, b] = [b, a];
        const base = positions.length / 3;
        for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            const corner = [center[0] + a[0] * i + b[0] * j, center[1] + a[1] * i + b[1] * j, center[2] + a[2] * i + b[2] * j];
            positions.push(...corner);
            normals.push(...normal);
            uvs.push(...cornerUv(corner));
            profiles.push(...profile);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    // Przód i tył: cały obrazek (UV z położenia - z tyłu odbity, jak
    // prawdziwy przedmiot oglądany od drugiej strony).
    for (const side of [1, -1]) {
        quad([0, 0, half * side], [0, 0, side], [0.5, 0, 0], [0, 0.5, 0],
            ([x, y]) => [x > 0 ? uv.uMax : uv.uMin, y > 0 ? uv.vMax : uv.vMin]);
    }

    // Boki: brzeg każdego widocznego piksela, w kolorze tego piksela.
    if (mask) {
        const N = 16, size = 1 / N;
        const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && mask[y * N + x] === 1;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                if (!at(x, y)) continue;
                const texel = [uv.uMin + (x + 0.5) / N * (uv.uMax - uv.uMin), uv.vMax - (y + 0.5) / N * (uv.vMax - uv.vMin)];
                const cx = (x + 0.5) * size - 0.5, cy = 0.5 - (y + 0.5) * size;
                const flatUv = () => texel;
                if (!at(x - 1, y)) quad([cx - size / 2, cy, 0], [-1, 0, 0], [0, size / 2, 0], [0, 0, half], flatUv);
                if (!at(x + 1, y)) quad([cx + size / 2, cy, 0], [1, 0, 0], [0, size / 2, 0], [0, 0, half], flatUv);
                if (!at(x, y - 1)) quad([cx, cy + size / 2, 0], [0, 1, 0], [size / 2, 0, 0], [0, 0, half], flatUv);
                if (!at(x, y + 1)) quad([cx, cy - size / 2, 0], [0, -1, 0], [size / 2, 0, 0], [0, 0, half], flatUv);
            }
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(profiles, 2));
    geometry.setIndex(indices);
    geometry.userData.extruded = true;
    return geometry;

}


// Narzędzia trzyma się za koniec trzonka (lewy dolny róg obrazka),
// resztę przedmiotów - mniej więcej za środek.

const TOOL_GRIP = [-0.5 + 3 / 16, -0.5 + 3 / 16];
const ITEM_GRIP = [-0.2, -0.38];

export function itemGrip(type) {
    const item = ITEM_TYPES[type];
    // Kategoria 'narzedzia' ma też barwniki i tratwę - za trzonek tylko
    // prawdziwe narzędzia (pole tool) i patyk.
    return item?.tool || type === 'stick' ? TOOL_GRIP : ITEM_GRIP;
}


export function buildBlockGeometry(type) {

    // Owoce krzaków korzystają z tych samych ścian co owoce na roślinie.
    // Inne przedmioty zachowują płaski obrazek.

    const item = isItemType(type) ? ITEM_TYPES[type] : null;
    const fruit = item && getFruitItemModel(type);
    const torch = getTorchInfo(type);

    const definition = item ? { textures: { all: item.icon } } : getBlockDefinition(type);

    // Schody, półbloki, płoty, furtki, stół (0.90.0): ten sam model co
    // ikonka, wyśrodkowany (stół - zmniejszony, bo ma dwa bloki).
    const shapeFaces = !item && (definition.model === 'shape' || definition.model === 'door') ? itemShapeFaces(definition.pick) : null;
    if (shapeFaces) {
        const geometry = buildFacesGeometry(shapeFaces);
        geometry.center();
        geometry.computeBoundingBox();
        const size = geometry.boundingBox.getSize(new THREE.Vector3());
        const scale = 1 / Math.max(1, size.x, size.y, size.z);
        geometry.scale(scale, scale, scale);
        const count = geometry.getAttribute('position').count;
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(count * 3).fill(1), 3));
        geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(new Array(count * 2).fill(0).map((_, i) => SURFACE_PROFILES.matte[i % 2]), 2));
        return geometry;
    }

    if (torch || fruit || definition.model === 'riverPlant') {
        // Ten sam model co nad rzeką, bez otaczającej go wody.
        const positions = [], normals = [], uvs = [], colors = [], indices = [], profiles = [];
        const river = definition.riverPlant;
        const texture = torch ? torch.variant.texture : fruit ? fruit.texture : river.texture ?? 'snow';
        const faces = torch ? getTorchFaces(torch.colorKey, 'down') : fruit ? fruit.faces : getRiverPlantFaces(river.kind, 0, river.waterlogged, river.tuft);
        const regions = new Map();
        for (const face of faces) {
            const name = face.texture ?? texture;
            const region = `${name}:${face.uv ? 'model' : 'tile'}`;
            // Source UVs already inset each little face. Insetting the whole
            // atlas again can shift a berry's 2px patch into transparent pixels.
            if (!regions.has(region)) regions.set(region, getAtlasUV(name, face.uv ? 0 : undefined));
            const uv = regions.get(region);
            const texel = [(uv.uMin + uv.uMax) / 2, (uv.vMin + uv.vMax) / 2];
            const base = positions.length / 3;
            for (let i = 0; i < 4; i++) {
                positions.push(...face.vertices[i]);
                normals.push(...face.normal);
                uvs.push(...(face.uv ? [uv.uMin + face.uv[i][0] * (uv.uMax - uv.uMin), uv.vMax - face.uv[i][1] * (uv.vMax - uv.vMin)] : texel));
                colors.push(...face.color.map(value => value / 255));
                profiles.push(...(face.surfaceProfile ?? SURFACE_PROFILES.matte));
            }
            indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(profiles, 2));
        geometry.setIndex(indices);
        geometry.center();
        if (fruit) {
            // Display scale only; preserve all proportions and relative parts.
            // A single 1/16 berry must remain readable in both camera modes.
            geometry.computeBoundingBox();
            const size = geometry.boundingBox.getSize(new THREE.Vector3());
            const scale = .8 / Math.max(size.x, size.y, size.z, .001);
            geometry.scale(scale, scale, scale);
        }
        return geometry;
    }

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    const profiles = [];

    // Przedmioty i płaskie dekoracje: gruby obrazek (0.84.0).
    if (item || definition.model === 'flat') {
        const name = getFaceTexture(definition.textures, 'front');
        return buildExtrudedItemGeometry(name, blockSurfaceProfile(definition, 'front'));
    }

    const faces =
        definition.model === 'cross' ? HELD_PLANT_FACES :
        HELD_FACES;


    for (const [faceName, normal, corners] of faces) {

        const uv = getAtlasUV(getFaceTexture(definition.textures, faceName));

        const base = positions.length / 3;

        // Rogi kafelka: lewy górny, prawy górny, lewy dolny, prawy dolny.

        const cornerUv = [[uv.uMin, uv.vMax], [uv.uMax, uv.vMax], [uv.uMin, uv.vMin], [uv.uMax, uv.vMin]];

        for (let i = 0; i < 4; i++) {

            positions.push(corners[i][0] - 0.5, corners[i][1] - 0.5, corners[i][2] - 0.5);
            normals.push(...normal);
            uvs.push(...cornerUv[i]);
            profiles.push(...blockSurfaceProfile(definition, faceName));

        }

        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);

    }


    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    // Wspólny materiał trzymanych roślin używa kolorów modeli rzecznych.
    // Biały mnożnik zachowuje tekstury dawnych przedmiotów i roślin.
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(1), 3));
    geometry.setAttribute('surfaceProfile', new THREE.Uint8BufferAttribute(profiles, 2));
    geometry.setIndex(indices);

    // Roślina z paczki na kilku kafelkach (np. 2 x 3): bez rozciągania.
    const sprite = !item && definition.plant?.sprite;
    if (sprite && sprite.width !== sprite.height) {
        const size = Math.max(sprite.width, sprite.height);
        geometry.scale(sprite.width / size, sprite.height / size, sprite.width / size);
    }

    return geometry;

}

// ------------------------------------------------------------

export class PlayerModel {

    constructor() {

        // Całość: ustawiana w miejscu stóp gracza i obracana jak jego ciało.

        this.object = new THREE.Group();

        this.object.name = 'player-model';


        // Kości.

        this.bones = {};

        for (const name of BONE_NAMES) {

            const bone = new THREE.Bone();

            bone.name = name;

            const [x, y, z] = BONES[name].at;

            bone.position.set(x * MODEL_PIXEL, y * MODEL_PIXEL, z * MODEL_PIXEL);

            this.bones[name] = bone;

        }

        for (const name of BONE_NAMES) {

            const parent = BONES[name].parent;

            if (parent) {
                this.bones[parent].add(this.bones[name]);
            }

        }

        this.boneIndex = Object.fromEntries(BONE_NAMES.map((name, i) => [name, i]));


        this.materials = [
            createModelMaterial({ map: skinTexture }),
            createModelMaterial({ map: skinTexture, alphaTest: 0.5 })
        ];

        this.style = 'smooth';

        this.overlay = true;

        this.mesh = null;

        this.buildMesh();


        // Blok w prawej ręce (przy dłoni, na dole przedramienia).

        this.heldType = null;
        this.heldTorch = null;
        this.lowDetail = false;

        this.heldMaterial = createModelMaterial({ map: blockAtlasTexture });

        // Rośliny mają przezroczyste tło tekstury.
        this.heldPlantMaterial = createModelMaterial({ map: blockAtlasTexture, alphaTest: 0.5, vertexColors: true });

        this.held = new THREE.Mesh(new THREE.BufferGeometry(), this.heldMaterial);

        this.held.scale.setScalar(HELD_BLOCK_SCALE * MODEL_PIXEL);
        this.held.position.set(0, -6.5 * MODEL_PIXEL, -2.2 * MODEL_PIXEL);
        this.held.rotation.set(-0.3, Math.PI / 4, 0);
        this.held.visible = false;

        this.bones.elbowR.add(this.held);

    }


    // (Prze)budowa siatki - po zmianie stylu zgięć.

    buildMesh() {

        const pose = this.mesh ? this.savePose() : null;

        if (this.mesh) {

            this.mesh.removeFromParent();
            this.mesh.geometry.dispose();

            // Tekstura z kośćmi (tworzy ją three.js przy pierwszym rysowaniu).
            this.mesh.skeleton.dispose();

        }


        // Kości w pozycji spoczynkowej (do powiązania z siatką).

        for (const bone of Object.values(this.bones)) {
            bone.rotation.set(0, 0, 0);
        }

        this.bones.pelvis.position.y = BONES.pelvis.at[1] * MODEL_PIXEL;


        const geometry = buildGeometry(this.style, this.boneIndex);

        const mesh = new THREE.SkinnedMesh(geometry, this.materials);

        mesh.frustumCulled = false;

        mesh.add(this.bones.pelvis);

        mesh.updateMatrixWorld(true);

        mesh.bind(new THREE.Skeleton(BONE_NAMES.map((name) => this.bones[name])));

        this.mesh = mesh;

        this.object.add(mesh);

        this.applyOverlay();

        if (pose) {
            this.restorePose(pose);
        }

    }


    savePose() {

        return Object.fromEntries(
            Object.entries(this.bones).map(([name, bone]) => [name, bone.rotation.clone()])
        );

    }


    restorePose(saved) {

        for (const [name, rotation] of Object.entries(saved)) {
            this.bones[name].rotation.copy(rotation);
        }

    }


    // 'smooth' - gładkie zgięcia, 'blocks' - osobne klocki.

    setStyle(style) {

        if (style === this.style) {
            return;
        }

        this.style = style;

        this.buildMesh();

    }


    // Wierzchnia warstwa skórki (czapka, kurtka, rękawy, nogawki).

    setOverlay(on) {

        this.overlay = on;

        this.applyOverlay();

    }


    applyOverlay() {

        this.materials[1].visible = this.overlay;

    }


    // Blok albo przedmiot trzymany w prawej ręce (nazwa albo null).

    setHeldBlock(type) {

        if (type === this.heldType) {
            return;
        }

        this.heldType = type;

        if (this.heldTorch) {
            disposeTorchModel(this.heldTorch);
            this.heldTorch = null;
        }

        this.held.geometry.dispose();

        const torch = getTorchInfo(type);
        if (torch) {
            this.held.geometry = new THREE.BufferGeometry();
            this.held.visible = false;
            this.heldTorch = createTorchModel(torch.colorKey, 'down');
            // Tools change held.position for their grip; a torch has its own
            // anchor, independent of the previously selected item.
            this.heldTorch.position.set(0, -6.5 * MODEL_PIXEL, -2.2 * MODEL_PIXEL);
            this.heldTorch.rotation.set(-0.3, Math.PI / 4, 0);
            this.heldTorch.scale.setScalar(0.72);
            this.bones.elbowR.add(this.heldTorch);
            this.setLowDetail(this.lowDetail);
            return;
        }

        this.held.geometry = type ? buildBlockGeometry(type) : new THREE.BufferGeometry();

        this.held.visible = Boolean(type);

        // Gruby przedmiot (0.84.0): trzymany za trzonek (narzędzia) albo
        // środek, płasko w płaszczyźnie ruchu ręki - obrazkiem w prawo,
        // koniec z głowicą do przodu i lekko w górę, ostrze siekiery
        // w dół, jak przy rąbaniu. Bloki - jak dawniej.

        if (this.held.geometry.userData.extruded) {
            const [gx, gy] = itemGrip(type);
            this.held.geometry.translate(-gx, -gy, 0);
            this.held.quaternion.setFromRotationMatrix(HELD_ITEM_BASIS);
            this.held.position.set(0, -6.2 * MODEL_PIXEL, -0.6 * MODEL_PIXEL);
        }
        else {
            this.held.position.set(0, -6.5 * MODEL_PIXEL, -2.2 * MODEL_PIXEL);
            this.held.rotation.set(-0.3, Math.PI / 4, 0);
        }

        const block = type && !isItemType(type) ? getBlockDefinition(type) : null;

        // Płaska dekoracja (wieniec, opadłe liście) - jak przedmiot.

        const flat = (isItemType(type) && !getFruitItemModel(type)) || block?.model === 'flat';

        this.held.scale.setScalar((flat ? HELD_ITEM_SCALE : HELD_BLOCK_SCALE) * MODEL_PIXEL);

        // Przezroczyste piksele (rośliny, liście, przedmioty) - materiał
        // z alphaTest.

        this.held.material = block && (block.model ?? 'cube') === 'cube'
            ? this.heldMaterial
            : this.heldPlantMaterial;

        const light = block?.light ?? 0;

        this.heldMaterial.userData.uniforms.uModelGlow.value = light / 15;

    }


    setLowDetail(on) {
        this.lowDetail = Boolean(on);
        const materials = [...this.materials, this.heldMaterial, this.heldPlantMaterial];
        this.heldTorch?.traverse(object => {
            if (object.isMesh) materials.push(...(Array.isArray(object.material) ? object.material : [object.material]));
        });
        setPotatoDefine(materials, this.lowDetail);
    }


    // Ustawia stawy według pozy (createPose).

    setPose(pose) {

        const b = this.bones;

        b.pelvis.position.y = (BONES.pelvis.at[1] - pose.drop) * MODEL_PIXEL;

        b.pelvis.rotation.set(-pose.pelvis.lean, pose.pelvis.twist, -pose.pelvis.sway);
        b.waist.rotation.set(-pose.waist.lean, pose.waist.twist, -pose.waist.sway);

        b.neck.rotation.set(pose.head.pitch, pose.head.yaw, pose.head.roll, 'YXZ');


        // Ręce i nogi: do przodu = obrót wokół X, w bok = wokół Z (prawa
        // strona +, lewa -), zgięcie w stawie środkowym.

        const limb = (bone, joint, values, side, kneeLike) => {

            bone.rotation.set(values.swing, values.twist * side, values.spread * side, 'ZXY');

            joint.rotation.set(kneeLike ? -values.bend : values.bend, 0, 0);

        };

        limb(b.shoulderR, b.elbowR, pose.armR, 1, false);
        limb(b.shoulderL, b.elbowL, pose.armL, -1, false);
        limb(b.hipR, b.kneeR, pose.legR, 1, true);
        limb(b.hipL, b.kneeL, pose.legL, -1, true);

    }


    // Położenie: stopy w (x, y, z), ciało obrócone o yaw; lift -
    // dodatkowo w górę (podgląd skoku).

    place(position, yaw, lift = 0) {

        this.object.position.copy(position);

        this.object.position.y += lift;

        this.object.rotation.set(0, yaw, 0);

    }


    dispose() {

        this.object.removeFromParent();

        this.mesh.geometry.dispose();

        this.mesh.skeleton.dispose();

        this.held.geometry.dispose();

        if (this.heldTorch) {
            disposeTorchModel(this.heldTorch);
            this.heldTorch = null;
        }

        for (const material of [...this.materials, this.heldMaterial, this.heldPlantMaterial]) {
            material.dispose();
        }

    }

}
