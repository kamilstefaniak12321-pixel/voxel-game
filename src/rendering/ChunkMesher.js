import * as THREE from 'three';


import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    AMBIENT_OCCLUSION,
    WATER_SURFACE,
    WATER_DEPTH_LIGHT,
    WATER_DEPTH_LIGHT_MIN
} from '../config.js';

import { WATER_FLOW_UV, WATER_FALL_MARK } from './BlockRenderData.js';
import { getWaterCornerHeight } from '../world/WaterSurface.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { SURFACE_PROFILES } from './SurfaceProfiles.js';
import { getRiverPlantFaces, plantRandom, plantTransform, riverPlantTransform } from './RiverPlantGeometry.js';
import { getBushyGrassFaces } from './BushyGrassGeometry.js';
import { LEAF_PARTS } from '../../assets/models/leaves/model-data.js';
import { BUSHY_GRASS_TEXTURE } from '../blocks/bushyGrass.js';
import { getAtlasUV } from './TextureAtlas.js';
import { getPlantMeshTemplate, lightPlantMeshTemplate } from './PlantMeshTemplate.js';
import { createPlantDetailLookup } from './PlantDistanceModels.js';
import { PINE_UPPER_ID, pineBarkTransitionStage, mossCarpetVariant } from './SurfaceTextureVariants.js';
import { createCanopySampler } from './CanopyLighting.js';
const plantFaceUvCache = new Map();
const plantFaceUV = texture => {
    if (!plantFaceUvCache.has(texture)) plantFaceUvCache.set(texture, getAtlasUV(texture));
    return plantFaceUvCache.get(texture);
};


import {
    AIR_ID,
    getBlockId,
    isOpaqueId,
    isLiquidId,
    getLiquidKindId,
    getWaterBaseHeight,
    waterFallDistance,
    WATER_FALL_MAX,
    WATER_SOURCE_ID,
    isLeavesId,
    getLightEmission
} from '../blocks/BlockRegistry.js';


import {
    MAX_LIGHT,
    COLOR_LEVEL,
    lightToBrightness
} from '../world/Light.js';


import {
    BLOCK_FACES,
    blockRenderData
} from './BlockRenderData.js';

// ------------------------------------------------------------
// Zwraca liczbę 0-3 zależną tylko od pozycji bloku.
// Ten sam blok zawsze dostaje ten sam obrót tekstury,
// więc po przebudowaniu chunka nic się nie "przetasowuje".
// ------------------------------------------------------------

function getRotationAt(x, y, z) {

    let h =
        Math.imul(x, 73856093) ^
        Math.imul(y, 19349663) ^
        Math.imul(z, 83492791);

    h = Math.imul(h ^ (h >>> 13), 1274126177);

    h = h ^ (h >>> 16);

    return h & 3;

}


// Liczba 0..1 zależna od pozycji bloku i "soli" (rośliny: obrót,
// przesunięcie i wysokość każdej kępki trochę inne).

// ------------------------------------------------------------
// KOPIA OKOLICY CHUNKA
//
// Ściany na krawędzi chunka potrzebują bloków i światła z
// sąsiednich chunków. Żeby nie sprawdzać przy każdej ścianie,
// w którym chunku leży sąsiad, przed budowaniem kopiujemy chunk
// razem z jednoblokową obwódką dookoła (także z góry i z dołu)
// do trzech płaskich tablic:
//
//   padOpaque - 1, jeśli blok zasłania (światło i widok)
//   padShade  - 1, jeśli blok rzuca cień w kąty (zasłaniający albo
//               liście - korona drzewa ma cienie we wgłębieniach)
//   padSky    - światło nieba
//   padR, padG, padB - kolorowe światło lamp
//
// Współrzędne w kopii: x i z od -1 do CHUNK_SIZE, y od -1 do
// wysokości chunka. Pod światem (y = -1) jest "pełny blok",
// więc spodu najniższej warstwy nie trzeba rysować.
// ------------------------------------------------------------

const S = CHUNK_SIZE;
const H = CHUNK_HEIGHT;
const LAYER = S * S;

const P = S + 2;
const P_LAYER = P * P;


let padOpaque = new Uint8Array(P_LAYER * (H + 2));
let padShade = new Uint8Array(P_LAYER * (H + 2));

// ID cieczy w komórce (0 = nie ciecz) - między dwiema komórkami tej
// samej cieczy (np. woda przy wodzie) nie rysujemy ściany.
let padLiquid = new Uint8Array(P_LAYER * (H + 2));
// Water heights are exact multiples of 1/128; keep their state separately
// from the canonical liquid kind (which suppresses internal water faces).
let padWaterHeight = new Uint8Array(P_LAYER * (H + 2));
let padSky = new Uint8Array(P_LAYER * (H + 2));
let padR = new Uint8Array(P_LAYER * (H + 2));
let padG = new Uint8Array(P_LAYER * (H + 2));
let padB = new Uint8Array(P_LAYER * (H + 2));

// Numer dywanu w komórce (barwinek - TuftGeometry.js carpet), 0 - nie
// dywan. Dywan łączy się z sąsiadem o tym samym numerze, także przez
// granicę chunka.
let padCarpet = new Uint8Array(P_LAYER * (H + 2));
const CARPET_OF = new Uint8Array(blockRenderData.length);

blockRenderData.forEach((data, id) => {
    CARPET_OF[id] = data?.riverPlant?.carpet ?? 0;
});


// Najwyższa warstwa skopiowana dla obecnego chunka - wyżej w kopii
// zostały dane poprzedniego chunka.
let padTop = 0;

// Najniższa skopiowana warstwa (niżej - też dane poprzedniego chunka).
let padBottom = 0;


function padIndex(x, y, z) {

    return ((y + 1) * P + (z + 1)) * P + (x + 1);

}


// Przesunięcie indeksu w kopii o (dx, dy, dz).

function padOffset(dx, dy, dz) {

    return dy * P_LAYER + dz * P + dx;

}


function fillPadding(chunk, world, height, first) {
    for (const _ of fillPaddingSteps(chunk, world, height, first)) { /* synchronous callers */ }
}

function* fillPaddingSteps(chunk, world, height, first) {

    // Warstwy do skopiowania: od `first` do `last` (jedna nad
    // najwyższym blokiem chunka, jeśli mieści się w świecie).
    // Niższych mesher nie ogląda (patrz hiddenBelow).

    const last = Math.min(height, H - 1);

    padTop = last;
    padBottom = first;
    let columns = 0;

    for (let dz = -1; dz <= 1; dz++) {

        for (let dx = -1; dx <= 1; dx++) {

            const source =
                dx === 0 && dz === 0
                    ? chunk
                    : world.getChunk(chunk.cx + dx, chunk.cz + dz);


            // Które kolumny kopii pochodzą z tego chunka.

            const xFrom = dx === -1 ? -1 : dx === 0 ? 0 : S;
            const xTo = dx === -1 ? -1 : dx === 0 ? S - 1 : S;
            const zFrom = dz === -1 ? -1 : dz === 0 ? 0 : S;
            const zTo = dz === -1 ? -1 : dz === 0 ? S - 1 : S;


            for (let z = zFrom; z <= zTo; z++) {

                for (let x = xFrom; x <= xTo; x++) {

                    const column = (z - dz * S) * S + (x - dx * S);


                    for (let y = first; y <= last; y++) {

                        const p = padIndex(x, y, z);


                        // Niewczytany chunk (np. za granicą świata)
                        // traktujemy jak otwarte powietrze.

                        if (!source) {

                            padOpaque[p] = 0;
                            padShade[p] = 0;
                            padLiquid[p] = 0;
                            padWaterHeight[p] = 0;
                            padCarpet[p] = 0;
                            padSky[p] = MAX_LIGHT;
                            padR[p] = padG[p] = padB[p] = 0;

                            continue;

                        }


                        const i = y * LAYER + column;

                        const blockId = source.blocks[i];

                        padOpaque[p] = isOpaqueId(blockId) ? 1 : 0;
                        padShade[p] = padOpaque[p] | (isLeavesId(blockId) ? 1 : 0);
                        padLiquid[p] = getLiquidKindId(blockId);
                        padWaterHeight[p] = padLiquid[p] === WATER_SOURCE_ID ? getWaterBaseHeight(blockId) * 128 : 0;
                        padCarpet[p] = CARPET_OF[blockId];
                        padSky[p] = source.skyLight[i];
                        padR[p] = source.lightR[i];
                        padG[p] = source.lightG[i];
                        padB[p] = source.lightB[i];

                    }


                    // Pod światem: pełny blok.

                    const below = padIndex(x, -1, z);

                    padOpaque[below] = 1;
                    padShade[below] = 1;
                    padLiquid[below] = 0;
                    padWaterHeight[below] = 0;
                    padSky[below] = 0;
                    padR[below] = padG[below] = padB[below] = 0;


                    // Nad światem: otwarte niebo.

                    if (height === H) {

                        const above = padIndex(x, H, z);

                        padOpaque[above] = 0;
                        padShade[above] = 0;
                        padLiquid[above] = 0;
                        padWaterHeight[above] = 0;
                        padSky[above] = MAX_LIGHT;
                        padR[above] = padG[above] = padB[above] = 0;

                    }

                    // At most eight short columns per unit (including edges).
                    if ((++columns & 7) === 0) yield;
                }

            }

        }

    }

}

// ------------------------------------------------------------
// ŚWIATŁO I CIENIE W ROGACH ŚCIAN
//
// Każdy róg ściany patrzy na 4 komórki przed ścianą: tę na
// wprost (front), dwie obok rogu (side1, side2) i jedną po
// skosie (corner). Z nich liczymy:
//
//   - światło rogu: średnia z komórek bez bloku, więc światło
//     płynnie przechodzi między blokami (gładkie oświetlenie),
//   - cień rogu: im więcej z tych komórek zajmują bloki, tym
//     róg ciemniejszy (ambient occlusion - kąty są ciemniejsze).
//
// Tu liczymy raz, gdzie (względem bloku) leżą te komórki dla
// każdej ściany i każdego rogu.
// ------------------------------------------------------------

const FACE_FRONT = new Int32Array(BLOCK_FACES.length);

// [ściana * 12 + róg * 3 + 0/1/2] = side1, side2, corner

const CORNER_SAMPLES = new Int32Array(BLOCK_FACES.length * 12);


BLOCK_FACES.forEach((face, faceIndex) => {

    const [nx, ny, nz] = face.normal;

    FACE_FRONT[faceIndex] = padOffset(nx, ny, nz);


    face.corners.forEach((corner, cornerIndex) => {

        // Dla dwóch osi wzdłuż ściany: w którą stronę leży róg.

        const steps = [];

        for (let axis = 0; axis < 3; axis++) {

            if (face.normal[axis] !== 0) {
                continue;
            }

            const step = [0, 0, 0];

            step[axis] = corner[axis] === 1 ? 1 : -1;

            steps.push(step);

        }


        const [a, b] = steps;

        const base = faceIndex * 12 + cornerIndex * 3;

        CORNER_SAMPLES[base] =
            padOffset(nx + a[0], ny + a[1], nz + a[2]);

        CORNER_SAMPLES[base + 1] =
            padOffset(nx + b[0], ny + b[1], nz + b[2]);

        CORNER_SAMPLES[base + 2] =
            padOffset(nx + a[0] + b[0], ny + a[1] + b[1], nz + a[2] + b[2]);

    });

});


// Jasność dla poziomu światła (także ułamkowego - średniej
// z kilku komórek). Tablica co 1/16 poziomu.

const LEVEL_STEPS = 16;

const BRIGHTNESS = new Float32Array(MAX_LIGHT * LEVEL_STEPS + 1);
const ATMOSPHERE_BRIGHTNESS = new Float32Array(BRIGHTNESS.length);

for (let i = 0; i < BRIGHTNESS.length; i++) {
    BRIGHTNESS[i] = lightToBrightness(i / LEVEL_STEPS);
    ATMOSPHERE_BRIGHTNESS[i] = atmosphericLightToBrightness(i / LEVEL_STEPS);
}


// Przyciemnienie rogu przy 0, 1, 2 i 3 zasłaniających blokach.

const SHADE = [0, 1, 2, 3].map(
    count => 1 - AMBIENT_OCCLUSION * count / 3
);


// Ustawienie "Cienie w kątach" (0 = brak, 1 = bardzo mocne).
// Działa na meshe budowane od tej chwili - stare trzeba przebudować
// (World.remeshAll()).

export function setAmbientOcclusion(strength) {

    for (let count = 0; count < SHADE.length; count++) {
        SHADE[count] = 1 - strength * count / 3;
    }

}


// Szybkie liście (ustawienie "Liście drzew: Szybkie" i tryb
// ziemniaka): bez ścian między dwoma blokami liści - korona to sam
// wierzch, prześwity są zamalowane (leafMaterial, FAST_LEAVES). Działa
// na meshe budowane od tej chwili (World.remeshAll()).

let fastLeaves = false;

export function setFastLeaves(on) {

    fastLeaves = on;

}


// Liście z 8 części (Ustawienia -> Modele -> Liście drzew, koncept
// Kamila - assets/models/leaves): blok liści to 8 sześcianików, każdy
// z inną ćwiartką tekstury, lekko kołyszący się osobno (leafMaterial).
// Zwraca true, gdy się zmieniło (trzeba przebudować chunki).

let leafParts = false;

export function setLeafParts(on) {

    const changed = leafParts !== Boolean(on);

    leafParts = Boolean(on);

    return changed;

}


// Ściany części przygotowane raz: dla każdej - numer ściany sześcianu
// (ten sam kierunek), rogi w kolejności ścian bloku (BLOCK_FACES),
// UV 0-1 z pliku Kamila i wagi czterech rogów ściany bloku (światło).
// Ściany w środku bloku (między częściami) pomijamy - widać je tylko
// przez prześwity, a byłoby ich drugie tyle.


function compileLeafPartFaces(parts) {
    return parts.map((part, partIndex) => BLOCK_FACES.flatMap((face, faceIndex) => {

    const axis = face.normal.findIndex((n) => n !== 0);
    const sign = face.normal[axis];
    const plane = sign > 0 ? part.max[axis] : part.min[axis];

    // Ściana zakryta w całości inną częścią (tuż przed nią) - pomijamy.
    const covered = parts.some((other, otherIndex) => otherIndex !== partIndex &&
        [0, 1, 2].every((i) => i === axis
            ? other.min[i] <= plane + sign / 32 && other.max[i] >= plane + sign / 32
            : other.min[i] <= part.min[i] + 1e-6 && other.max[i] >= part.max[i] - 1e-6));

    if (covered) {
        return [];
    }

    // Na krawędzi bloku (do piksela) czy cofnięta w głąb.
    const edge = sign > 0 ? plane >= 1 - 1 / 16 - 1e-6 : plane <= 1 / 16 + 1e-6;


    const source = part.faces.find((candidate) => {
        const values = candidate.vertices.map((v) => v[axis]);
        return values.every((n) => Math.abs(n - plane) < 1e-6);
    });

    const corners = face.corners.map((corner) => corner.map((c, i) => (i === axis ? plane : c ? part.max[i] : part.min[i])));

    // UV rogu: z najbliższego wierzchołka tej ściany w pliku.
    const uv = corners.map((point) => {
        let best = 0, distance = Infinity;
        source.vertices.forEach((v, i) => {
            const d = Math.hypot(v[0] - point[0], v[1] - point[1], v[2] - point[2]);
            if (d < distance) { distance = d; best = i; }
        });
        return source.uv[best];
    });

    // Wagi rogów ściany bloku dla każdego rogu części (dwie osie ściany).
    const weights = corners.map((point) => face.corners.map((corner) => {
        let w = 1;
        for (let i = 0; i < 3; i++) {
            if (i === axis) continue;
            const t = Math.min(1, Math.max(0, point[i]));
            w *= corner[i] ? t : 1 - t;
        }
        return w;
    }));

    return [{ faceIndex, corners, uv, weights, partIndex, edge }];

    }));
}

// The middle level joins vertically adjacent source pieces, retaining their
// outer bounds. The last level keeps one envelope of the original leaf block.
// Atlas coordinates remain block-sized, so simplifying geometry does not turn
// the species texture into an unrelated solid color or change its texel scale.
function mergeLeafParts(groups) {
    return groups.map(group => {
        const min = [0, 1, 2].map(axis => Math.min(...group.map(part => part.min[axis])));
        const max = [0, 1, 2].map(axis => Math.max(...group.map(part => part.max[axis])));
        return { min, max, faces: BLOCK_FACES.map(face => {
            const vertices = face.corners.map(corner => corner.map((c, axis) => c ? max[axis] : min[axis]));
            const uAxis = face.corners[1].findIndex((value, axis) => value !== face.corners[0][axis]);
            const vAxis = face.corners[2].findIndex((value, axis) => value !== face.corners[0][axis]);
            const uv = vertices.map(vertex => [uAxis, vAxis].map(axis => {
                const start = face.corners[0][axis];
                return Math.min(1, Math.max(0, start ? 1 - vertex[axis] : vertex[axis]));
            }));
            return { vertices, uv };
        }) };
    });
}

const LEAF_PART_FACES = compileLeafPartFaces(LEAF_PARTS);
const LEAF_PART_LODS = [LEAF_PART_FACES,
    compileLeafPartFaces(mergeLeafParts([[0, 4], [1, 5], [2, 6], [3, 7]].map(indices => indices.map(i => LEAF_PARTS[i])))),
    compileLeafPartFaces(mergeLeafParts([LEAF_PARTS]))];


const leafLight = new Float32Array(BLOCK_FACES.length * 4 * 10);

const leafLightReady = new Uint8Array(BLOCK_FACES.length);

const leafValues = new Float64Array(10);


function addLeafParts(id, renderData, lx, y, lz, faceCount, baseX, baseZ, faceGroups = LEAF_PART_FACES) {

    const block = padIndex(lx, y, lz);

    const tinted = renderData.tint && meshTint !== null;

    const wx = baseX + lx, wz = baseZ + lz;

    leafLightReady.fill(0);

    for (const faces of faceGroups) {

        for (const part of faces) {

            const faceIndex = part.faceIndex;

            const front = block + FACE_FRONT[faceIndex];

            if (padOpaque[front]) continue;

            // Ściana na krawędzi bloku znika w głębi korony jak ściana
            // zwykłych liści; cofnięta w głąb bloku - przy każdym sąsiednim
            // bloku liści (szczelina między blokami liści i tak prześwituje).
            if (padShade[front] && (!part.edge || fastLeaves || deepInLeaves(block, lx, y, lz, faceIndex))) continue;


            // Światło czterech rogów ściany bloku - raz na kierunek.

            const depthShade = padLiquid[front] ? waterDepthShade(front) : 1;

            if (!leafLightReady[faceIndex]) {

                for (let i = 0; i < 4; i++) {
                    const light = cornerLight(block, faceIndex, i, front, depthShade);
                    const o = (faceIndex * 4 + i) * 10;
                    leafLight[o] = light.r; leafLight[o + 1] = light.g; leafLight[o + 2] = light.b; leafLight[o + 3] = light.a;
                    leafLight[o + 4] = light.atmosphereR; leafLight[o + 5] = light.atmosphereG;
                    leafLight[o + 6] = light.atmosphereB; leafLight[o + 7] = light.atmosphereA;
                    leafLight[o + 8] = light.brightness; leafLight[o + 9] = light.occlusion;
                }

                leafLightReady[faceIndex] = 1;

            }


            ensureCapacity(faceCount + 1);

            const p = faceCount * 12, t = faceCount * 8, c = faceCount * 16;

            const uv = renderData.uv[faceIndex][0];
            const uMin = Math.min(uv[0], uv[2], uv[4], uv[6]), uMax = Math.max(uv[0], uv[2], uv[4], uv[6]);
            const vMin = Math.min(uv[1], uv[3], uv[5], uv[7]), vMax = Math.max(uv[1], uv[3], uv[5], uv[7]);

            // Kołysanie części: siła i faza z miejsca bloku i numeru części.
            const amplitude = 150 + plantRandom(wx, y, wz, 61 + part.partIndex) * 105;
            const phase = plantRandom(wx, y, wz, 71 + part.partIndex) * 255;

            const face = BLOCK_FACES[faceIndex];

            let b0 = 0, b1 = 0, b2 = 0, b3 = 0;

            for (let i = 0; i < 4; i++) {

                const corner = part.corners[i];

                positionBuffer[p + i * 3] = lx + corner[0];
                positionBuffer[p + i * 3 + 1] = y + corner[1];
                positionBuffer[p + i * 3 + 2] = lz + corner[2];

                normalBuffer[p + i * 3] = face.normal[0];
                normalBuffer[p + i * 3 + 1] = face.normal[1];
                normalBuffer[p + i * 3 + 2] = face.normal[2];

                uvBuffer[t + i * 2] = uMin + part.uv[i][0] * (uMax - uMin);
                uvBuffer[t + i * 2 + 1] = vMax - part.uv[i][1] * (vMax - vMin);

                plantMotionBuffer[t + i * 2] = amplitude;
                plantMotionBuffer[t + i * 2 + 1] = phase;

                const values = leafValues.fill(0);
                const weights = part.weights[i];
                for (let k = 0; k < 4; k++) {
                    const o = (faceIndex * 4 + k) * 10;
                    for (let n = 0; n < 10; n++) values[n] += leafLight[o + n] * weights[k];
                }

                colorBuffer[c + i * 4] = values[0] + 0.5;
                colorBuffer[c + i * 4 + 1] = values[1] + 0.5;
                colorBuffer[c + i * 4 + 2] = values[2] + 0.5;
                colorBuffer[c + i * 4 + 3] = values[3] + 0.5;
                atmosphereLightBuffer[c + i * 4] = values[4] + 0.5;
                atmosphereLightBuffer[c + i * 4 + 1] = values[5] + 0.5;
                atmosphereLightBuffer[c + i * 4 + 2] = values[6] + 0.5;
                atmosphereLightBuffer[c + i * 4 + 3] = values[7] + 0.5;
                surfaceOcclusionBuffer[faceCount * 4 + i] = values[9] * 255 + 0.5;
                surfaceEmissionBuffer[faceCount * 4 + i] = 0;
                surfaceProfileBuffer[t + i * 2] = renderData.surfaceProfiles[faceIndex][0];
                surfaceProfileBuffer[t + i * 2 + 1] = renderData.surfaceProfiles[faceIndex][1];

                if (tinted) writeTint(c + i * 4, lx + corner[0], lz + corner[2]);
                else clearTint(c + i * 4);

                if (i === 0) b0 = values[8]; else if (i === 1) b1 = values[8]; else if (i === 2) b2 = values[8]; else b3 = values[8];

            }

            splitBuffer[faceCount] = b0 + b3 > b1 + b2 ? 1 : 0;

            faceCount++;

        }

    }

    return faceCount;

}


// Numer górnej ściany (+Y) w BLOCK_FACES.

const TOP_FACE = BLOCK_FACES.findIndex((face) => face.normal[1] === 1);


// Ściana pod wodą: światło nieba razy WATER_DEPTH_LIGHT do potęgi
// głębokości (ile bloków wody nad komórką przed ścianą).

const WATER_DEPTH_MAX = 40;

const DEPTH_SHADE = Array.from(
    { length: WATER_DEPTH_MAX + 1 },
    (_, depth) => Math.max(WATER_DEPTH_LIGHT_MIN, WATER_DEPTH_LIGHT ** depth)
);


function waterDepthShade(cell) {

    let depth = 0;

    let y = Math.floor(cell / P_LAYER) - 1;

    while (depth < WATER_DEPTH_MAX && y <= padTop && padLiquid[cell]) {

        depth++;
        y++;
        cell += P_LAYER;

    }

    return DEPTH_SHADE[depth];

}


// Komórki, z których bierzemy światło dla jednego rogu ściany.

const sampleCells = new Int32Array(4);


// Światło nieba cieniuje karta graficzna (słońce świeci z jednej
// strony). Światło lamp nie zależy od słońca, więc ściany cieniujemy
// sami: góra najjaśniejsza, spód najciemniejszy (świecący blok też,
// żeby nie wyglądał płasko).
// Kolejność ścian jak w FACE_NAMES: +X, -X, góra, dół, +Z, -Z.

const FACE_SHADE = [0.8, 0.8, 1, 0.65, 0.9, 0.9];

// Mnożnik 0.75 sprawia, że ściana tuż przy lampie jest mniej
// więcej tak jasna jak w dzień.

const LAMP_FACE_SHADE = FACE_SHADE.map(
    shade => shade * 0.75
);


// Dwa sposoby podziału ściany na trójkąty (rogi: 0 lewy górny,
// 1 prawy górny, 2 lewy dolny, 3 prawy dolny). Wybieramy ten,
// którego przekątna łączy jaśniejsze rogi - inaczej cień w rogu
// rozlewa się w brzydki pasek po skosie ściany.

const SPLIT_1_2 = BLOCK_FACES[0].indices;   // przekątna 1-2
const SPLIT_0_3 = [0, 2, 3, 0, 3, 1];       // przekątna 0-3

// ------------------------------------------------------------
// Bufory wielokrotnego użytku. Zamiast tworzyć nowe tablice dla
// każdego chunka, piszemy do tych samych (rosną w razie potrzeby),
// a na końcu kopiujemy tylko potrzebny kawałek.
// ------------------------------------------------------------

let faceCapacity = 0;

let positionBuffer = null;
let normalBuffer = null;
let uvBuffer = null;
let colorBuffer = null;
let atmosphereLightBuffer = null;
let surfaceOcclusionBuffer = null;
let surfaceEmissionBuffer = null;
let surfaceProfileBuffer = null;
let tintBuffer = null;
let plantMotionBuffer = null;
let splitBuffer = null;


function ensureCapacity(faces) {

    if (faces <= faceCapacity) {
        return;
    }


    const capacity = Math.max(faces, faceCapacity * 2, 2048);

    const grow = (old, Type, size) => {

        const buffer = new Type(size);

        if (old) {
            buffer.set(old);
        }

        return buffer;

    };


    positionBuffer = grow(positionBuffer, Float32Array, capacity * 12);
    normalBuffer = grow(normalBuffer, Float32Array, capacity * 12);
    uvBuffer = grow(uvBuffer, Float32Array, capacity * 8);
    colorBuffer = grow(colorBuffer, Uint8Array, capacity * 16);
    atmosphereLightBuffer = grow(atmosphereLightBuffer, Uint8Array, capacity * 16);
    surfaceOcclusionBuffer = grow(surfaceOcclusionBuffer, Uint8Array, capacity * 4);
    surfaceEmissionBuffer = grow(surfaceEmissionBuffer, Uint8Array, capacity * 4);
    surfaceProfileBuffer = grow(surfaceProfileBuffer, Uint8Array, capacity * 8);
    tintBuffer = grow(tintBuffer, Uint8Array, capacity * 16);
    plantMotionBuffer = grow(plantMotionBuffer, Uint8Array, capacity * 8);
    splitBuffer = grow(splitBuffer, Uint8Array, capacity);

    faceCapacity = capacity;

}

// ------------------------------------------------------------
// KOLOR TRAWY: chunk.tint (generator - teren realistyczny) to kolor
// w każdym rogu kolumny (17 x 17 rogów, r g b; 128 = bez zmiany).
// Ściany bloków z tint (trawa, mech, rośliny trawiaste) dostają go
// w atrybucie "tint" (r, g, b i 0; inne bloki i chunk bez koloru -
// 0, 0, 0, 255: bez zmiany; siatka bez tego atrybutu też bez zmiany).
// ------------------------------------------------------------

let meshTint = null;

const TINT_SIDE = S + 1;

// Kolor rogu (ix, iz - 0..16) do tintBuffer[at].

function writeTint(at, ix, iz) {

    const n = (iz * TINT_SIDE + ix) * 3;

    tintBuffer[at] = meshTint[n];
    tintBuffer[at + 1] = meshTint[n + 1];
    tintBuffer[at + 2] = meshTint[n + 2];
    tintBuffer[at + 3] = 0;

}


function clearTint(at) {

    tintBuffer[at] = 0;
    tintBuffer[at + 1] = 0;
    tintBuffer[at + 2] = 0;
    tintBuffer[at + 3] = 255;

}


// Środek kolumny (rośliny, płaskie dekoracje): średnia czterech rogów.

const columnTint = new Uint8Array(3);

function tintOfColumn(lx, lz) {

    for (let k = 0; k < 3; k++) {

        const a = meshTint[(lz * TINT_SIDE + lx) * 3 + k];
        const b = meshTint[(lz * TINT_SIDE + lx + 1) * 3 + k];
        const c = meshTint[((lz + 1) * TINT_SIDE + lx) * 3 + k];
        const d = meshTint[((lz + 1) * TINT_SIDE + lx + 1) * 3 + k];

        columnTint[k] = (a + b + c + d + 2) >> 2;

    }

    return columnTint;

}

// ------------------------------------------------------------
// ROŚLINY: kilka pionowych płaszczyzn skrzyżowanych w środku bloku
// (2 albo 3 - plant.planes), każda z dwiema stronami. Obrót,
// przesunięcie i wysokość zależą od pozycji (kępki nie stoją w równym
// rzędzie). Światło - z komórki rośliny; dół ciemniejszy (głębia
// kępki). Normalna w górę: obie strony oświetlone jak wierzch bloku.
// ------------------------------------------------------------

const PLANT_BOTTOM_SHADE = 0.68;
const SHORT_GRASS_ID = getBlockId('short_grass');
const TALL_GRASS_ID = getBlockId('tall_grass');

function addPlants(plants, faceCount, baseX, baseZ, first = 0, end = plants.length, plantData = null) {

    for (let k = first; k < end; k += 4) {

        const lx = plants[k];
        const y = plants[k + 1];
        const lz = plants[k + 2];
        const id = plants[k + 3];
        const emission = getLightEmission(id) / MAX_LIGHT * 255;

        const { cross, tint, surfaceProfiles } = plantData ? plantData(id) : blockRenderData[id];
        const profile = surfaceProfiles[4];

        const wx = baseX + lx;
        const wz = baseZ + lz;

        const plantTint = tint && meshTint ? tintOfColumn(lx, lz) : null;


        // Światło komórki rośliny.

        const cell = padIndex(lx, y, lz);

        const red = padR[cell];
        const green = padG[cell];
        const blue = padB[cell];

        const strongest = Math.max(red, green, blue);

        const sky = BRIGHTNESS[padSky[cell] * LEVEL_STEPS];

        const lamp = BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * 0.75;

        const lampR = strongest > 0 ? lamp * red / strongest : lamp;
        const lampG = strongest > 0 ? lamp * green / strongest : lamp;
        const lampB = strongest > 0 ? lamp * blue / strongest : lamp;

        const atmosphereSky = ATMOSPHERE_BRIGHTNESS[padSky[cell] * LEVEL_STEPS];
        const atmosphereLamp = ATMOSPHERE_BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * 0.75;
        const atmosphereScale = lamp > 0 ? atmosphereLamp / lamp : 0;


        // Kształt kępki.

        const angle0 = plantRandom(wx, y, wz, 1) * Math.PI;
        const centerX = lx + 0.5 + (plantRandom(wx, y, wz, 2) - 0.5) * 0.3;
        const centerZ = lz + 0.5 + (plantRandom(wx, y, wz, 3) - 0.5) * 0.3;

        // Roślina z paczki (cross.sprite): płaszczyzna ma rozmiar
        // obrazka w atlasie (w blokach) - dokładnie 16 pikseli na blok.
        const sprite = cross.sprite;
        const halfWidth = sprite ? sprite.width / 2 : cross.width;
        const top = sprite ? y + sprite.height : y + cross.height * (0.85 + 0.3 * plantRandom(wx, y, wz, 4));

        const { uMin, uMax, vMin, vMax } = cross.uv;


        for (let plane = 0; plane < cross.planes; plane++) {

            const angle = angle0 + plane * Math.PI / cross.planes;

            const dx = Math.cos(angle) * halfWidth;
            const dz = Math.sin(angle) * halfWidth;

            // Dwie strony płaszczyzny: rogi lewy górny, prawy górny,
            // lewy dolny, prawy dolny (patrząc na daną stronę).

            for (let side = 0; side < 2; side++) {

                ensureCapacity(faceCount + 1);

                const s = side === 0 ? 1 : -1;

                const xs = [centerX - dx * s, centerX + dx * s];
                const zs = [centerZ - dz * s, centerZ + dz * s];
                const us = side === 0 ? [uMin, uMax] : [uMax, uMin];

                const p = faceCount * 12;
                const t = faceCount * 8;
                const c = faceCount * 16;

                for (let i = 0; i < 4; i++) {

                    const right = i & 1;
                    const bottom = i >> 1;

                    positionBuffer[p + i * 3] = xs[right];
                    positionBuffer[p + i * 3 + 1] = bottom ? y : top;
                    positionBuffer[p + i * 3 + 2] = zs[right];

                    normalBuffer[p + i * 3] = 0;
                    normalBuffer[p + i * 3 + 1] = 1;
                    normalBuffer[p + i * 3 + 2] = 0;

                    uvBuffer[t + i * 2] = us[right];
                    uvBuffer[t + i * 2 + 1] = bottom ? vMin : vMax;
                    plantMotionBuffer[t + i * 2] = bottom ? 0 : 255;
                    plantMotionBuffer[t + i * 2 + 1] = 0;

                    const shade = bottom ? PLANT_BOTTOM_SHADE : 1;

                    colorBuffer[c + i * 4] = lampR * shade * 255 + 0.5;
                    colorBuffer[c + i * 4 + 1] = lampG * shade * 255 + 0.5;
                    colorBuffer[c + i * 4 + 2] = lampB * shade * 255 + 0.5;
                    colorBuffer[c + i * 4 + 3] = sky * shade * 255 + 0.5;

                    atmosphereLightBuffer[c + i * 4] = lampR * atmosphereScale * shade * 255 + 0.5;
                    atmosphereLightBuffer[c + i * 4 + 1] = lampG * atmosphereScale * shade * 255 + 0.5;
                    atmosphereLightBuffer[c + i * 4 + 2] = lampB * atmosphereScale * shade * 255 + 0.5;
                    atmosphereLightBuffer[c + i * 4 + 3] = atmosphereSky * 255 + 0.5;
                    surfaceOcclusionBuffer[faceCount * 4 + i] = shade * 255 + 0.5;
                    surfaceEmissionBuffer[faceCount * 4 + i] = emission + 0.5;
                    surfaceProfileBuffer[t + i * 2] = profile[0];
                    surfaceProfileBuffer[t + i * 2 + 1] = profile[1];

                    if (plantTint) {
                        tintBuffer[c + i * 4] = plantTint[0];
                        tintBuffer[c + i * 4 + 1] = plantTint[1];
                        tintBuffer[c + i * 4 + 2] = plantTint[2];
                        tintBuffer[c + i * 4 + 3] = 0;
                    }
                    else {
                        clearTint(c + i * 4);
                    }

                }

                splitBuffer[faceCount] = 0;

                faceCount++;

            }

        }

    }

    return faceCount;

}

// Dywan (barwinek - TuftGeometry.js carpet): z których stron (bity
// +x, +z, -x, -z) rośnie taki sam dywan albo dywan wyżej na ścianie
// (bity 0-3, łączenie), gdzie teren opada o blok - krótka zasłona po boku
// pełnego bloku pod dywanem (bity 4-7), a gdy niżej rośnie taki sam dywan -
// zasłona aż do niego (bity 8-11, dywany po schodkach).

const CARPET_STEPS = [[1, 1], [2, P], [4, -1], [8, -P]];

function carpetMask(cell, y, group) {

    let mask = 0;

    for (const [bit, step] of CARPET_STEPS) {

        const side = cell + step;

        if (padCarpet[side] === group) {
            mask |= bit;
        }
        else if (padOpaque[side]) {
            if (y + 1 <= padTop && padCarpet[side + P_LAYER] === group) {
                mask |= bit;
            }
        }
        else if (y - 1 >= padBottom && padOpaque[cell - P_LAYER] && !padOpaque[side - P_LAYER]) {
            mask |= padCarpet[side - P_LAYER] === group ? bit << 8 : bit << 4;
        }

    }

    return mask;

}

// Porost i huba (TuftGeometry.js coating, bracket): lite bloki obok -
// bity 1 +x, 2 +z, 4 -x, 8 -z, 16 dół, 32 góra.

function wallMask(cell) {

    return (padOpaque[cell + 1] ? 1 : 0) | (padOpaque[cell + P] ? 2 : 0) |
        (padOpaque[cell - 1] ? 4 : 0) | (padOpaque[cell - P] ? 8 : 0) |
        (padOpaque[cell - P_LAYER] ? 16 : 0) | (padOpaque[cell + P_LAYER] ? 32 : 0);

}

// Duża roślina (TuftGeometry.js reachClipper): lite bloki wokół komórki -
// bity 0-7 na tej samej wysokości (+x, +z, -x, -z, +x+z, -x+z, -x-z,
// +x-z), 8-15 piętro wyżej, 16 - blok nad rośliną.

const REACH_STEPS = [1, P, -1, -P, 1 + P, -1 + P, -1 - P, 1 - P];

function reachMask(cell, y) {

    let mask = 0;
    const above = y + 1 <= padTop;

    REACH_STEPS.forEach((step, bit) => {
        if (padOpaque[cell + step]) mask |= 1 << bit;
        if (above && padOpaque[cell + step + P_LAYER]) mask |= 1 << (bit + 8);
    });

    if (above && padOpaque[cell + P_LAYER]) mask |= 1 << 16;

    return mask;

}

// ------------------------------------------------------------
// Generated river plants share the existing plant material and chunk batch.
// Their cached templates carry actual surface normals and a linear albedo tint.
function addRiverPlants(plants, faceCount, baseX, baseZ, grassDetail = null, overrides = null, animationRanges = null, first = 0, end = plants.length, plantData = null) {
    const grass = grassDetail !== null;
    const grassUv = grass ? getAtlasUV(BUSHY_GRASS_TEXTURE) : null;
    for (let k = first; k < end; k += 4) {
        const lx = plants[k], y = plants[k + 1], lz = plants[k + 2];
        const event = overrides?.get(y * LAYER + lz * S + lx);
        // An active clip owns the original topology, even if its chunk crosses
        // a detail boundary. Never bind full-model vertices to simplified cards.
        const data = grass ? { kind: 'grass', uv: grassUv }
            : (plantData && !event ? plantData(plants[k + 3]) : blockRenderData[plants[k + 3]]).riverPlant;
        const wx = baseX + lx, wz = baseZ + lz;
        const transform = grass ? riverPlantTransform(wx, y, wz) : plantTransform(wx, y, wz, data.tuft);
        const cell = padIndex(lx, y, lz);
        const mask = grass ? 0
            : data.carpet ? carpetMask(cell, y, data.carpet)
                : data.tuft?.coating || data.tuft?.bracket ? wallMask(cell)
                    : data.tuft?.wide ? reachMask(cell, y) : 0;
        if (event) animationRanges.push({ event, start: faceCount, transform, mask });
        const faces = grass
            ? getBushyGrassFaces(plants[k + 3] === TALL_GRASS_ID, transform.variant, grassDetail)
            : getRiverPlantFaces(data.kind, transform.variant, data.waterlogged, data.tuft, mask);
        // Trawa (kępiasta i modele trawy - PlantModelLevels.js: tint)
        // dostaje kolor klimatu jak zwykła trawa.
        const climate = (grass || data.tint) && meshTint ? tintOfColumn(lx, lz) : null;
        const { cos, sin } = transform;
        const centerX = lx + transform.x;
        const centerZ = lz + transform.z;
        const red = padR[cell], green = padG[cell], blue = padB[cell];
        const strongest = Math.max(red, green, blue);
        const sky = BRIGHTNESS[padSky[cell] * LEVEL_STEPS];
        const lamp = BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * 0.75;
        const lampR = strongest > 0 ? lamp * red / strongest : lamp;
        const lampG = strongest > 0 ? lamp * green / strongest : lamp;
        const lampB = strongest > 0 ? lamp * blue / strongest : lamp;
        const atmosphereSky = ATMOSPHERE_BRIGHTNESS[padSky[cell] * LEVEL_STEPS];
        const atmosphereLamp = ATMOSPHERE_BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * 0.75;
        const atmosphereScale = lamp > 0 ? atmosphereLamp / lamp : 0;
        const depthShade = data.kind === 'milfoil' ? waterDepthShade(cell) : 1;
        ensureCapacity(faceCount + faces.length);

        const template = getPlantMeshTemplate(faces, data.uv, transform, plantFaceUV);
        lightPlantMeshTemplate(template, sky, lampR, lampG, lampB, atmosphereSky, atmosphereScale, depthShade, climate);
        const p = faceCount * 12, t = faceCount * 8, c = faceCount * 16, v = faceCount * 4;
        const positions = template.positions;
        for (let i = 0; i < positions.length; i += 3) {
            positionBuffer[p + i] = centerX + cos * positions[i] - sin * positions[i + 2];
            positionBuffer[p + i + 1] = y + positions[i + 1];
            positionBuffer[p + i + 2] = centerZ + sin * positions[i] + cos * positions[i + 2];
        }
        normalBuffer.set(template.normal, p);
        uvBuffer.set(template.uv, t);
        plantMotionBuffer.set(template.motion, t);
        colorBuffer.set(template.color, c);
        atmosphereLightBuffer.set(template.atmosphere, c);
        surfaceOcclusionBuffer.set(template.occlusion, v);
        surfaceEmissionBuffer.fill(0, v, v + template.count);
        surfaceProfileBuffer.set(template.profile, t);
        tintBuffer.set(template.tint, c);
        splitBuffer.fill(0, faceCount, faceCount + faces.length);
        faceCount += faces.length;
    }
    return faceCount;
}

// PŁASKIE DEKORACJE (model 'flat'): jeden obrazek tuż przy ścianie
// sąsiada, do którego blok przylega - opadłe liście leżą na ziemi,
// wieniec wisi na ścianie. Światło - z komórki dekoracji.
// ------------------------------------------------------------

// Jak daleko od ściany sąsiada (żeby nie migotała razem z nią).
const FLAT_GAP = 0.03;

function addFlats(flats, faceCount, baseX, baseZ, first = 0, end = flats.length) {

    for (let k = first; k < end; k += 4) {

        const lx = flats[k];
        const y = flats[k + 1];
        const lz = flats[k + 2];

        const id = flats[k + 3];
        const { flat, uv, rotate, tint, surfaceProfiles, worldTextureVariants } = blockRenderData[id];
        const emission = getLightEmission(id) / MAX_LIGHT * 255;

        const flatTint = tint && meshTint ? tintOfColumn(lx, lz) : null;

        const faceIndex = flat.face;
        const profile = surfaceProfiles[faceIndex];

        const face = BLOCK_FACES[faceIndex];

        const rotation = rotate[faceIndex] ? getRotationAt(baseX + lx, y, baseZ + lz) : 0;

        const variantUV = worldTextureVariants?.[mossCarpetVariant(baseX + lx, y, baseZ + lz)] ?? uv;
        const faceUv = variantUV[faceIndex][rotation];


        const cell = padIndex(lx, y, lz);

        const red = padR[cell];
        const green = padG[cell];
        const blue = padB[cell];

        const strongest = Math.max(red, green, blue);

        const sky = BRIGHTNESS[padSky[cell] * LEVEL_STEPS];

        const lamp = BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * LAMP_FACE_SHADE[faceIndex] * 255;

        const r = strongest > 0 ? lamp * red / strongest : lamp;
        const g = strongest > 0 ? lamp * green / strongest : lamp;
        const b = strongest > 0 ? lamp * blue / strongest : lamp;

        const atmosphereSky = ATMOSPHERE_BRIGHTNESS[padSky[cell] * LEVEL_STEPS];
        const atmosphereLamp = ATMOSPHERE_BRIGHTNESS[Math.round(COLOR_LEVEL[strongest] * LEVEL_STEPS)] * LAMP_FACE_SHADE[faceIndex] * 255;
        const atmosphereScale = lamp > 0 ? atmosphereLamp / lamp : 0;


        ensureCapacity(faceCount + 1);

        const p = faceCount * 12;
        const t = faceCount * 8;
        const c = faceCount * 16;

        for (let i = 0; i < 4; i++) {

            const corner = face.corners[i];

            // Ściana sześcianu przesunięta pod samą ścianę sąsiada.

            const position = [lx + corner[0], y + corner[1], lz + corner[2]];

            position[flat.axis] = [lx, y, lz][flat.axis] + (flat.far ? 1 - FLAT_GAP : FLAT_GAP);

            positionBuffer[p + i * 3] = position[0];
            positionBuffer[p + i * 3 + 1] = position[1];
            positionBuffer[p + i * 3 + 2] = position[2];

            normalBuffer[p + i * 3] = face.normal[0];
            normalBuffer[p + i * 3 + 1] = face.normal[1];
            normalBuffer[p + i * 3 + 2] = face.normal[2];

            uvBuffer[t + i * 2] = faceUv[i * 2];
            uvBuffer[t + i * 2 + 1] = faceUv[i * 2 + 1];
            plantMotionBuffer[t + i * 2] = 0;
            plantMotionBuffer[t + i * 2 + 1] = 0;

            colorBuffer[c + i * 4] = r + 0.5;
            colorBuffer[c + i * 4 + 1] = g + 0.5;
            colorBuffer[c + i * 4 + 2] = b + 0.5;
            colorBuffer[c + i * 4 + 3] = sky * 255 + 0.5;

            atmosphereLightBuffer[c + i * 4] = r * atmosphereScale + 0.5;
            atmosphereLightBuffer[c + i * 4 + 1] = g * atmosphereScale + 0.5;
            atmosphereLightBuffer[c + i * 4 + 2] = b * atmosphereScale + 0.5;
            atmosphereLightBuffer[c + i * 4 + 3] = atmosphereSky * 255 + 0.5;
            surfaceOcclusionBuffer[faceCount * 4 + i] = 255;
            surfaceEmissionBuffer[faceCount * 4 + i] = emission + 0.5;
            surfaceProfileBuffer[t + i * 2] = profile[0];
            surfaceProfileBuffer[t + i * 2 + 1] = profile[1];

            if (flatTint) {
                tintBuffer[c + i * 4] = flatTint[0];
                tintBuffer[c + i * 4 + 1] = flatTint[1];
                tintBuffer[c + i * 4 + 2] = flatTint[2];
                tintBuffer[c + i * 4 + 3] = 0;
            }
            else {
                clearTint(c + i * 4);
            }

        }

        splitBuffer[faceCount] = 0;

        faceCount++;

    }

    return faceCount;

}

// ------------------------------------------------------------
// LIŚCIE: ściana między dwoma blokami liści jest potrzebna, bo przez
// prześwity w liściach widać głąb korony. Ale tylko przy wierzchu
// korony - przez dwie warstwy prześwitów prawie nic już nie widać,
// więc ścianę głębiej w środku (za sąsiednimi liśćmi w tę stronę jest
// jeszcze blok liści albo pełny blok) pomijamy. Poza kopią okolicy
// chunka (krawędź) - rysujemy.
// ------------------------------------------------------------

function deepInLeaves(block, lx, y, lz, faceIndex) {

    const [nx, ny, nz] = BLOCK_FACES[faceIndex].normal;

    const x = lx + nx * 2;
    const yy = y + ny * 2;
    const z = lz + nz * 2;

    if (x < -1 || x > S || z < -1 || z > S || yy < padBottom || yy > padTop) {
        return false;
    }

    return padShade[block + FACE_FRONT[faceIndex] * 2] === 1;

}

// ------------------------------------------------------------
// ŚCIANY JEDNEGO BLOKU (sześcian, liście albo woda). Zwraca nową
// liczbę ścian w buforach.
// ------------------------------------------------------------

// Nurt rzeki budowanego chunka (chunk.flow) - do ścian wody.

let meshFlow = null;

// UV ściany wody: środek kafelka wody przesunięty o nurt (shader wody
// odczytuje z tego kierunek i siłę nurtu - BlockRenderData.js). Woda bez
// nurtu - sam środek kafelka.

const flowUv = new Float32Array(8);
const waterCorners = new Float64Array(4); // (0,0), (1,0), (0,1), (1,1)
const waterNormals = new Float64Array(12);
let waterSlopeX = 0, waterSlopeZ = 0;

function paddedWaterHeight(cell) {
    const height = padWaterHeight[cell];
    return height && (padLiquid[cell + P_LAYER] === WATER_SOURCE_ID || padOpaque[cell + P_LAYER])
        ? 1 : height / 128;
}

function prepareWaterSurface(block) {
    const center = paddedWaterHeight(block);
    if (center === 1) {
        waterCorners.fill(1);
    } else {
        const west = paddedWaterHeight(block - 1), east = paddedWaterHeight(block + 1);
        const north = paddedWaterHeight(block - P), south = paddedWaterHeight(block + P);
        waterCorners[0] = getWaterCornerHeight(paddedWaterHeight(block - P - 1), north, west, center);
        waterCorners[1] = getWaterCornerHeight(north, paddedWaterHeight(block - P + 1), center, east);
        waterCorners[2] = getWaterCornerHeight(west, center, paddedWaterHeight(block + P - 1), south);
        waterCorners[3] = getWaterCornerHeight(center, east, south, paddedWaterHeight(block + P + 1));
    }

    // Area-weighted normals of the fixed two triangles. Their shared vertices
    // average both planes; flat source water retains exactly (0,1,0).
    const ax = waterCorners[0] - waterCorners[1], az = waterCorners[0] - waterCorners[2];
    const bx = waterCorners[2] - waterCorners[3], bz = waterCorners[1] - waterCorners[3];
    waterSlopeX = ax + bx;
    waterSlopeZ = az + bz;
    const slopeLength = Math.hypot(waterSlopeX, waterSlopeZ);
    if (slopeLength > 0) {
        waterSlopeX *= 32 / (127 * slopeLength);
        waterSlopeZ *= 32 / (127 * slopeLength);
    }
    if (ax === 0 && az === 0 && bx === 0 && bz === 0) {
        waterNormals.fill(0);
        waterNormals[1] = waterNormals[4] = waterNormals[7] = waterNormals[10] = 1;
        return;
    }
    for (let i = 0; i < 4; i++) {
        const nx = i === 0 ? ax : i === 3 ? bx : (ax + bx) * 0.5;
        const nz = i === 0 ? az : i === 3 ? bz : (az + bz) * 0.5;
        const length = Math.sqrt(nx * nx + nz * nz + 1);
        waterNormals[i * 3] = nx / length;
        waterNormals[i * 3 + 1] = 1 / length;
        waterNormals[i * 3 + 2] = nz / length;
    }
}

// Bok spadającej wody: w UV zamiast nurtu - spadek (u: 1/16 na blok)
// i znacznik (v poza kafelkiem). Shader wody liczy z tego prędkość.
function fallingWaterUv(uv, fall) {

    const uMin = Math.min(uv[0], uv[2], uv[4], uv[6]);
    const uMax = Math.max(uv[0], uv[2], uv[4], uv[6]);
    const vMin = Math.min(uv[1], uv[3], uv[5], uv[7]);
    const vMax = Math.max(uv[1], uv[3], uv[5], uv[7]);

    const u = uMin + (0.5 + WATER_FLOW_UV * fall / WATER_FALL_MAX) * (uMax - uMin);
    const v = vMin + (0.5 + WATER_FLOW_UV * WATER_FALL_MARK) * (vMax - vMin);

    for (let i = 0; i < 4; i++) {
        flowUv[i * 2] = u;
        flowUv[i * 2 + 1] = v;
    }

    return flowUv;

}

function waterUv(uv, lx, lz, sloped) {

    const uMin = Math.min(uv[0], uv[2], uv[4], uv[6]);
    const uMax = Math.max(uv[0], uv[2], uv[4], uv[6]);
    const vMin = Math.min(uv[1], uv[3], uv[5], uv[7]);
    const vMax = Math.max(uv[1], uv[3], uv[5], uv[7]);

    let fx = 0;
    let fz = 0;

    if (meshFlow) {
        fx = meshFlow[(lz * S + lx) * 2] / 127;
        fz = meshFlow[(lz * S + lx) * 2 + 1] / 127;
    }

    // Generated river currents keep their direction and speed. New streams
    // outside rivers derive a downhill current from this cell's surface.
    if (sloped && fx === 0 && fz === 0) {
        fx = waterSlopeX;
        fz = waterSlopeZ;
    }

    const u = uMin + (0.5 + WATER_FLOW_UV * fx) * (uMax - uMin);
    const v = vMin + (0.5 + WATER_FLOW_UV * fz) * (vMax - vMin);

    for (let i = 0; i < 4; i++) {
        flowUv[i * 2] = u;
        flowUv[i * 2 + 1] = v;
    }

    return flowUv;

}


// Światło jednego rogu ściany sześcianu (ściana faceIndex bloku block,
// róg i; front - komórka przed ścianą). Wspólne dla zwykłych ścian
// i liści z części (addLeafParts). Wynik w CORNER (bez kopiowania).

const CORNER = { r: 0, g: 0, b: 0, a: 0, atmosphereR: 0, atmosphereG: 0, atmosphereB: 0, atmosphereA: 0, brightness: 1, occlusion: 1 };

function cornerLight(block, faceIndex, i, front, depthShade) {

    let r = FACE_SHADE[faceIndex] * 255;
    let g = r;
    let b = r;
    let a = 255;

    // Atmosfera zawsze próbuje rzeczywiste światło otoczenia,
    // również dla emisyjnych powierzchni.
    let atmosphereR = r;
    let atmosphereG = g;
    let atmosphereB = b;
    let atmosphereA = a;

    let brightness = 1;
    let occlusion = 1;


    {

        const s = faceIndex * 12 + i * 3;

        const side1 = block + CORNER_SAMPLES[s];
        const side2 = block + CORNER_SAMPLES[s + 1];
        const diagonal = block + CORNER_SAMPLES[s + 2];


        // Światło bierzemy z komórek bez bloku.
        // Gdy oba boki są zajęte, komórka po skosie
        // jest od ściany odcięta - nie liczy się.
        // Cień w kącie rzucają też liście (padShade).

        let count = 0;

        sampleCells[count++] = front;

        const shadeCount =
            padShade[side1] && padShade[side2]
                ? 3
                : padShade[side1] + padShade[side2] + padShade[diagonal];


        if (!(padOpaque[side1] && padOpaque[side2]) && !padOpaque[diagonal]) {
            sampleCells[count++] = diagonal;
        }

        if (!padOpaque[side1]) sampleCells[count++] = side1;
        if (!padOpaque[side2]) sampleCells[count++] = side2;


        // Średnia: poziom nieba, poziom lamp (z najmocniejszego
        // kanału) i suma kanałów - z niej bierzemy kolor.

        let sky = 0;
        let lampLevel = 0;
        let red = 0;
        let green = 0;
        let blue = 0;

        for (let n = 0; n < count; n++) {

            const cell = sampleCells[n];

            const cr = padR[cell];
            const cg = padG[cell];
            const cb = padB[cell];

            sky += padSky[cell];

            red += cr;
            green += cg;
            blue += cb;

            lampLevel += COLOR_LEVEL[cr > cg ? (cr > cb ? cr : cb) : (cg > cb ? cg : cb)];

        }


        const skyBrightness =
            BRIGHTNESS[Math.round(sky * LEVEL_STEPS / count)];

        const lampBrightness =
            BRIGHTNESS[Math.round(lampLevel * LEVEL_STEPS / count)];

        const shade = SHADE[shadeCount];
        occlusion = shade;

        const skyValue = skyBrightness * shade;

        const lampValue =
            lampBrightness * shade * LAMP_FACE_SHADE[faceIndex] * 255;


        // Kolor lamp: proporcje kanałów (najmocniejszy = 1).

        const strongest = Math.max(red, green, blue);

        if (strongest > 0) {

            r = lampValue * red / strongest;
            g = lampValue * green / strongest;
            b = lampValue * blue / strongest;

        }
        else {

            r = g = b = lampValue;

        }

        a = skyValue * depthShade * 255;

        const atmosphereLampValue =
            ATMOSPHERE_BRIGHTNESS[Math.round(lampLevel * LEVEL_STEPS / count)] * shade * LAMP_FACE_SHADE[faceIndex] * 255;
        const atmosphereScale = lampValue > 0 ? atmosphereLampValue / lampValue : 0;
        atmosphereR = r * atmosphereScale;
        atmosphereG = g * atmosphereScale;
        atmosphereB = b * atmosphereScale;
        atmosphereA = ATMOSPHERE_BRIGHTNESS[Math.round(sky * LEVEL_STEPS / count)] * depthShade * 255;

        brightness = Math.max(skyValue, lampValue / 255);

    }

    CORNER.r = r; CORNER.g = g; CORNER.b = b; CORNER.a = a;
    CORNER.atmosphereR = atmosphereR; CORNER.atmosphereG = atmosphereG;
    CORNER.atmosphereB = atmosphereB; CORNER.atmosphereA = atmosphereA;
    CORNER.brightness = brightness; CORNER.occlusion = occlusion;

    return CORNER;

}


function addCubeFaces(id, renderData, lx, y, lz, faceCount, baseX, baseZ, textureVariant = 0) {

    const block = padIndex(lx, y, lz);

    const leaves = renderData.leaves;
    const surfaceUV = renderData.worldTextureVariants?.[textureVariant] ?? renderData.uv;

    // W klasycznym modelu świecący blok jest jasny cały, bez cieni.
    // Atmosfera otrzymuje osobną emisję, niezależną od światła otoczenia.

    const emission = getLightEmission(id) / MAX_LIGHT * 255;
    const glowing = emission > 0;

    const liquid = getLiquidKindId(id);
    const water = liquid === WATER_SOURCE_ID;

    const tinted = renderData.tint && meshTint !== null;

    // Górny blok wody (nad nim nie ma wody ani pełnego bloku) jest
    // trochę niższy - jego górne rogi są na wysokości WATER_SURFACE.

    const above = block + FACE_FRONT[TOP_FACE];

    const topHeight =
        liquid && padLiquid[above] !== liquid && !padOpaque[above]
            ? WATER_SURFACE
            : 1;

    if (water) prepareWaterSurface(block);

    // Spadająca woda: ile bloków już spada (1-16) - boki płyną tym
    // szybciej (waterMaterial).
    const fall = water ? waterFallDistance(id) : 0;


    for (
        let faceIndex = 0;
        faceIndex < BLOCK_FACES.length;
        faceIndex++
    ) {

        // Komórka przed ścianą. Jeśli zajmuje ją
        // zasłaniający blok, ściany nie widać.

        const front = block + FACE_FRONT[faceIndex];

        if (padOpaque[front]) {
            continue;
        }

        // Liście przy liściach - tylko przy wierzchu korony
        // (szybkie liście - wcale).

        if (leaves && padShade[front] && (fastLeaves || deepInLeaves(block, lx, y, lz, faceIndex))) {
            continue;
        }

        // Woda przy wodzie - bez ściany między nimi.

        if (liquid && padLiquid[front] === liquid) {
            continue;
        }


        const face = BLOCK_FACES[faceIndex];

        const rotation =
            renderData.rotate[faceIndex]
                ? getRotationAt(baseX + lx, y, baseZ + lz)
                : 0;

        const uv = liquid
            ? (water && fall > 0 && face.normal[1] === 0
                ? fallingWaterUv(surfaceUV[faceIndex][rotation], fall)
                : waterUv(surfaceUV[faceIndex][rotation], lx, lz, water))
            : surfaceUV[faceIndex][rotation];

        // Ściana pod wodą (np. dno morza) ciemnieje z głębokością.

        const depthShade = !liquid && padLiquid[front] ? waterDepthShade(front) : 1;


        ensureCapacity(faceCount + 1);


        // 4 rogi ściany.

        const p = faceCount * 12;
        const t = faceCount * 8;
        const c = faceCount * 16;

        let brightness0 = 0;
        let brightness1 = 0;
        let brightness2 = 0;
        let brightness3 = 0;


        for (let i = 0; i < 4; i++) {

            const corner = face.corners[i];
            const waterCorner = corner[2] * 2 + corner[0];
            const height = water ? waterCorners[waterCorner] : topHeight;

            positionBuffer[p + i * 3] = lx + corner[0];
            positionBuffer[p + i * 3 + 1] = y + (corner[1] === 1 ? height : 0);
            positionBuffer[p + i * 3 + 2] = lz + corner[2];

            normalBuffer[p + i * 3] = water && faceIndex === TOP_FACE ? waterNormals[waterCorner * 3] : face.normal[0];
            normalBuffer[p + i * 3 + 1] = water && faceIndex === TOP_FACE ? waterNormals[waterCorner * 3 + 1] : face.normal[1];
            normalBuffer[p + i * 3 + 2] = water && faceIndex === TOP_FACE ? waterNormals[waterCorner * 3 + 2] : face.normal[2];

            uvBuffer[t + i * 2] = uv[i * 2];
            uvBuffer[t + i * 2 + 1] = uv[i * 2 + 1];
            // Water reuses the otherwise idle plant bytes: x = wave weight,
            // y = top (255), bottom (0), side (128). Side upper edges receive
            // the same wave as the top; integer-height waterfall joins do not.
            plantMotionBuffer[t + i * 2] = water && corner[1] === 1 && height < 1
                ? Math.round(height / WATER_SURFACE * 255) : 0;
            plantMotionBuffer[t + i * 2 + 1] = water
                ? face.normal[1] > 0 ? 255 : face.normal[1] < 0 ? 0 : 128 : 0;


            // Kolor rogu:
            //   r, g, b - światło lamp (już w kolorze lamp)
            //   a       - światło nieba
            // Świecący blok: pełne światło, bez cieni w kątach.

            const light = cornerLight(block, faceIndex, i, front, depthShade);

            let r = light.r;
            let g = light.g;
            let b = light.b;
            let a = light.a;
            let atmosphereR = light.atmosphereR;
            let atmosphereG = light.atmosphereG;
            let atmosphereB = light.atmosphereB;
            let atmosphereA = light.atmosphereA;
            let brightness = light.brightness;
            const occlusion = light.occlusion;

            // Zachowujemy bajty i przekątną klasycznego mesha lampy.
            // Jej własna emisja nie udaje już pełnego dostępu do nieba.
            if (glowing) {
                r = g = b = FACE_SHADE[faceIndex] * 255;
                a = 255;
                brightness = 1;
            }

            colorBuffer[c + i * 4] = r + 0.5;
            colorBuffer[c + i * 4 + 1] = g + 0.5;
            colorBuffer[c + i * 4 + 2] = b + 0.5;
            colorBuffer[c + i * 4 + 3] = a + 0.5;

            atmosphereLightBuffer[c + i * 4] = atmosphereR + 0.5;
            atmosphereLightBuffer[c + i * 4 + 1] = atmosphereG + 0.5;
            atmosphereLightBuffer[c + i * 4 + 2] = atmosphereB + 0.5;
            atmosphereLightBuffer[c + i * 4 + 3] = atmosphereA + 0.5;
            surfaceOcclusionBuffer[faceCount * 4 + i] = occlusion * 255 + 0.5;
            surfaceEmissionBuffer[faceCount * 4 + i] = emission + 0.5;
            surfaceProfileBuffer[t + i * 2] = renderData.surfaceProfiles[faceIndex][0];
            surfaceProfileBuffer[t + i * 2 + 1] = renderData.surfaceProfiles[faceIndex][1];

            if (tinted) {
                writeTint(c + i * 4, lx + corner[0], lz + corner[2]);
            }
            else {
                clearTint(c + i * 4);
            }


            if (i === 0) brightness0 = brightness;
            else if (i === 1) brightness1 = brightness;
            else if (i === 2) brightness2 = brightness;
            else brightness3 = brightness;

        }


        splitBuffer[faceCount] =
            !water && brightness0 + brightness3 > brightness1 + brightness2
                ? 1
                : 0;


        faceCount++;

    }


    return faceCount;

}

// ------------------------------------------------------------
// Ile dolnych warstw chunka na pewno jest schowanych.
//
// Poniżej solidBelow (Chunk.js) wszystkie komórki chunka są
// zasłaniającymi blokami. Blok na wysokości y nie ma widocznej
// ściany, jeśli zasłaniające są: jego warstwa i warstwa nad nim -
// także w czterech sąsiednich chunkach (ściany na krawędzi).
// Brak sąsiada (np. granica świata) = nic nie pomijamy.
// ------------------------------------------------------------

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function hiddenBelow(chunk, world) {

    let solid = chunk.solidBelow;

    for (const [dx, dz] of NEIGHBORS) {

        const neighbor = world.getChunk(chunk.cx + dx, chunk.cz + dz);

        if (!neighbor) {
            return 0;
        }

        solid = Math.min(solid, neighbor.solidBelow);

    }

    return Math.max(0, solid - 1);

}

// ------------------------------------------------------------
// Buduje geometrię całego chunka jako JEDEN mesh.
//
// Dodawane są tylko te ściany, które graniczą z powietrzem
// (albo z blokiem, który nie zasłania - np. przyszłe szkło).
// Ściany schowane między blokami w ogóle nie powstają.
// Sąsiad w niewczytanym chunku liczy się jako powietrze.
//
// Każdy róg ściany dostaje "kolor" ze światłem lamp (r, g, b)
// i światłem nieba (a). Klasyczny kolor zawiera też cień w kącie;
// atmosfera trzyma AO osobno od nieba, żeby nie przyciemniać nim
// bezpośredniego słońca. Lampy rozproszone nadal zawierają AO.
// Karta miesza dane między rogami (patrz BlockRenderData.js).
//
// Wierzchołki są w współrzędnych lokalnych chunka, mesh jest
// potem przesuwany na właściwe miejsce w świecie.
//
// Zwraca null, jeśli chunk nie ma żadnej widocznej ściany.
// ------------------------------------------------------------

const plantPreparation = new WeakMap();

// Preparing eight unseen detailed models in one mesh used to make the first
// visit much slower than later rebuilds. The visible update path warms one
// model at a time until its deadline, leaving the old mesh intact. The cursor
// only advances (even if the bounded template cache evicts earlier entries),
// so a diverse garden cannot keep the chunk waiting forever.
export function prepareChunkPlantGeometry(chunk, world, deadline) {
    if (!Number.isFinite(deadline)) return true;
    if (performance.now() >= deadline) return false;
    if (plantPreparation.get(chunk) === Infinity) return true;
    const overrides = world.plantAnimations?.overridesFor(chunk);
    let height = Math.min(chunk.maxY, H);
    if (overrides) for (const event of overrides.values()) height = Math.max(height, event.y + 1);
    let start = hiddenBelow(chunk, world);
    if (overrides) for (const event of overrides.values()) start = Math.min(start, event.y);
    fillPadding(chunk, world, height, Math.max(0, start - 1));
    const baseX = chunk.cx * S, baseZ = chunk.cz * S;
    const grassDetail = world.experiments?.bushyGrass ? (world.getGrassDetail?.(chunk) ?? 0) : null;
    let cursor = Math.max(start * LAYER, plantPreparation.get(chunk) ?? 0);
    const end = height * LAYER;
    for (; cursor < end; cursor++) {
        const id = overrides?.get(cursor)?.renderId ?? chunk.blocks[cursor];
        const grass = grassDetail !== null && (id === SHORT_GRASS_ID || id === TALL_GRASS_ID);
        const data = blockRenderData[id]?.riverPlant;
        if (!grass && !data) continue;
        const lx = cursor % S, lz = Math.floor(cursor / S) % S, y = Math.floor(cursor / LAYER);
        const transform = grass ? riverPlantTransform(baseX + lx, y, baseZ + lz)
            : plantTransform(baseX + lx, y, baseZ + lz, data.tuft);
        const cell = padIndex(lx, y, lz);
        const mask = grass ? 0 : data.carpet ? carpetMask(cell, y, data.carpet)
            : data.tuft?.coating || data.tuft?.bracket ? wallMask(cell)
                : data.tuft?.wide ? reachMask(cell, y) : 0;
        const faces = grass ? getBushyGrassFaces(id === TALL_GRASS_ID, transform.variant, grassDetail)
            : getRiverPlantFaces(data.kind, transform.variant, data.waterlogged, data.tuft, mask);
        getPlantMeshTemplate(faces, grass ? getAtlasUV(BUSHY_GRASS_TEXTURE) : data.uv, transform, plantFaceUV);
        if (performance.now() >= deadline) {
            plantPreparation.set(chunk, cursor + 1);
            return false;
        }
    }
    // The caller may spend its last fraction of a millisecond on this scan.
    // Keep completion until the actual build consumes it, otherwise small
    // budgets could repeatedly scan a ready chunk without ever drawing it.
    plantPreparation.set(chunk, Infinity);
    return true;
}

// Only unfinished jobs own scratch arrays. A tiny pool reuses allocations across
// chunks without retaining chunk/world references or a buffer for every chunk.
const meshScratchPool = [];

function captureMeshScratch() {
    return { padOpaque, padShade, padLiquid, padWaterHeight, padSky, padR, padG, padB, padCarpet,
        padTop, padBottom, faceCapacity, positionBuffer, normalBuffer, uvBuffer,
        colorBuffer, atmosphereLightBuffer, surfaceOcclusionBuffer, surfaceEmissionBuffer,
        surfaceProfileBuffer, tintBuffer, plantMotionBuffer, splitBuffer,
        meshTint, meshFlow, fastLeaves, leafParts, shade: SHADE.slice() };
}

function activateMeshScratch(state) {
    ({ padOpaque, padShade, padLiquid, padWaterHeight, padSky, padR, padG, padB, padCarpet,
        padTop, padBottom, faceCapacity, positionBuffer, normalBuffer, uvBuffer,
        colorBuffer, atmosphereLightBuffer, surfaceOcclusionBuffer, surfaceEmissionBuffer,
        surfaceProfileBuffer, tintBuffer, plantMotionBuffer, splitBuffer,
        meshTint, meshFlow, fastLeaves, leafParts } = state);
    for (let i = 0; i < SHADE.length; i++) SHADE[i] = state.shade[i];
}

function acquireMeshScratch() {
    const state = meshScratchPool.pop() ?? {
        padOpaque: new Uint8Array(P_LAYER * (H + 2)), padShade: new Uint8Array(P_LAYER * (H + 2)),
        padLiquid: new Uint8Array(P_LAYER * (H + 2)), padSky: new Uint8Array(P_LAYER * (H + 2)),
        padWaterHeight: new Uint8Array(P_LAYER * (H + 2)),
        padR: new Uint8Array(P_LAYER * (H + 2)), padG: new Uint8Array(P_LAYER * (H + 2)),
        padB: new Uint8Array(P_LAYER * (H + 2)), padCarpet: new Uint8Array(P_LAYER * (H + 2)),
        faceCapacity: 0, positionBuffer: null, normalBuffer: null, uvBuffer: null,
        colorBuffer: null, atmosphereLightBuffer: null, surfaceOcclusionBuffer: null,
        surfaceEmissionBuffer: null, surfaceProfileBuffer: null, tintBuffer: null,
        plantMotionBuffer: null, splitBuffer: null
    };
    Object.assign(state, { padTop: 0, padBottom: 0, meshTint: null, meshFlow: null,
        fastLeaves, leafParts, shade: SHADE.slice() });
    return state;
}

function releaseMeshScratch(state) {
    state.meshTint = state.meshFlow = null;
    // Do not retain an exceptional giant plant/chunk allocation indefinitely.
    if (meshScratchPool.length < 2 && state.faceCapacity <= 65536) meshScratchPool.push(state);
}

/**
 * Incremental, unpublished geometry. World validates its chunk revision before
 * each step and installs the result atomically. Terrain includes water inside
 * waterlogged plants; plants-only never duplicates that water or tree leaves.
 * Independent jobs can be interleaved safely, including synchronous builds.
 */
export function createChunkGeometryJob(chunk, world, options = {}) {
    const plantDetail = Math.max(0, Math.min(2, Math.floor(Number(options.plantDetail) || 0)));
    let iterator = buildChunkGeometrySteps(chunk, world,
        { terrain: true, plants: false, legacyGroups: false, ...options, plantDetail,
            plantData: plantDetail > 0 ? createPlantDetailLookup(plantDetail) : null });
    let scratch = acquireMeshScratch();
    let result = { done: false, geometry: null };
    return {
        step(deadline = Infinity) {
            if (result.done || !iterator || performance.now() >= deadline) return result;
            const previous = captureMeshScratch();
            activateMeshScratch(scratch);
            let failed = false;
            try {
                do {
                    const next = iterator.next();
                    if (next.done) {
                        result = { done: true, geometry: next.value };
                        iterator = null;
                        break;
                    }
                } while (deadline === Infinity || performance.now() < deadline);
            } catch (error) {
                failed = true;
                iterator = null;
                throw error;
            } finally {
                scratch = captureMeshScratch();
                activateMeshScratch(previous);
                if (result.done || failed) {
                    releaseMeshScratch(scratch);
                    scratch = null;
                }
            }
            return result;
        },
        cancel() {
            if (!iterator) return;
            // The generator disposes a partially copied BufferGeometry in its
            // finally block. The old visible mesh belongs to World throughout.
            iterator.return();
            iterator = null;
            releaseMeshScratch(scratch);
            scratch = null;
            result = { done: true, geometry: null };
        }
    };
}

// Compatibility for loading/tools that need one synchronous combined geometry.
// Runtime uses the split incremental jobs above; tests can request split output
// synchronously by passing the same terrain/plants options.
export function buildChunkGeometry(chunk, world, options) {
    const job = createChunkGeometryJob(chunk, world, options === undefined
        ? { terrain: true, plants: true, legacyGroups: true } : options);
    const geometry = job.step(Infinity).geometry;
    if (geometry?.userData.plantAnimationRanges?.length) {
        world.plantAnimations?.bindGeometry(geometry, geometry.userData.plantAnimationRanges);
        delete geometry.userData.plantAnimationRanges;
    }
    return geometry;
}

function* buildChunkGeometrySteps(chunk, world, { terrain, plants: includePlants, legacyGroups, leafDetail = 0, plantDetail, plantData }) {

    leafDetail = Math.max(0, Math.min(2, Math.floor(Number(leafDetail) || 0)));
    const leafFaces = LEAF_PART_LODS[leafDetail];

    plantPreparation.delete(chunk);

    // Completion removes an event from the live map without invalidating the
    // mesh: its last painted pose already matches the block. Keep that event
    // through scan/emission/install, even if it completes between slices, or a
    // scanned full-size animation model could be emitted without its final pose.
    // Other animation changes invalidate World revisions and cancel this job.
    const liveOverrides = world.plantAnimations?.overridesFor(chunk);
    const overrides = liveOverrides?.size ? new Map(liveOverrides) : null;
    const animationRanges = [];
    if (chunk.blockCount === 0 && !overrides?.size) {
        return null;
    }


    const blocks = chunk.blocks;
    let height = Math.min(chunk.maxY, H);
    if (overrides) for (const event of overrides.values()) height = Math.max(height, event.y + 1);

    meshFlow = chunk.flow;

    meshTint = chunk.tint ?? null;


    // Lity kamień głęboko pod terenem nie ma żadnej widocznej
    // ściany - zaczynamy od pierwszej warstwy, która może ją mieć.

    let start = hiddenBelow(chunk, world);
    if (overrides) for (const event of overrides.values()) start = Math.min(start, event.y);


    yield* fillPaddingSteps(chunk, world, height, Math.max(0, start - 1));


    // Pozycja rogu chunka w świecie (w blokach) - do obrotu tekstur.

    const baseX = chunk.cx * S;
    const baseZ = chunk.cz * S;


    let faceCount = 0;

    // Rośliny dokładamy na końcu (osobny materiał - przezroczystość
    // i kołysanie na wietrze), po nich liście i płaskie dekoracje
    // (przezroczystość bez wiatru), a na koniec wodę (półprzezroczysta,
    // fale): x, y, z, id po kolei.

    const plants = [];
    const riverPlants = [];
    const bushyGrass = [];
    const grassDetail = world.experiments?.bushyGrass ? Math.max(plantDetail, world.getGrassDetail?.(chunk) ?? 0) : null;

    // Najwyższa roślina z paczki (bloki) - wystaje nad swoją komórkę.
    let spriteReach = 0;

    const leaves = [];

    const flats = [];

    const liquids = [];


    for (let y = start; y < height; y++) {

        for (let lz = 0; lz < S; lz++) {

            for (let lx = 0; lx < S; lx++) {

                const index = y * LAYER + lz * S + lx;
                const id = overrides?.get(index)?.renderId ?? blocks[index];

                if (id === AIR_ID) {
                    continue;
                }


                const renderData = plantData && !overrides?.has(index) ? plantData(id) : blockRenderData[id];

                if (!renderData) {
                    continue;
                }


                // Eksperyment "trawa kępiasta" ma pierwszeństwo przed
                // poziomem modeli roślin (Ustawienia -> Modele).
                if (grassDetail !== null && (id === SHORT_GRASS_ID || id === TALL_GRASS_ID)) {
                    if (includePlants) bushyGrass.push(lx, y, lz, id);
                    continue;
                }

                if (renderData.riverPlant) {
                    if (includePlants) riverPlants.push(lx, y, lz, id);
                    // A waterlogged plant is still a full water cell. Drawing
                    // canonical water here also preserves flow UVs and hides
                    // faces against ordinary water and other aquatic species.
                    const liquid = getLiquidKindId(id);
                    if (terrain && liquid) liquids.push(lx, y, lz, liquid);
                    continue;
                }

                if (renderData.cross) {

                    if (grassDetail !== null && (id === SHORT_GRASS_ID || id === TALL_GRASS_ID)) {
                        if (includePlants) bushyGrass.push(lx, y, lz, id);
                        continue;
                    }

                    if (includePlants) plants.push(lx, y, lz, id);

                    if (includePlants && renderData.cross.sprite) {
                        spriteReach = Math.max(spriteReach, renderData.cross.sprite.height, renderData.cross.sprite.width);
                    }

                    continue;

                }


                if (!terrain) continue;

                if (renderData.leaves) {

                    leaves.push(lx, y, lz, id);

                    continue;

                }


                if (renderData.flat) {

                    flats.push(lx, y, lz, id);

                    continue;

                }


                // Woda (ciecz) - na końcu, osobna grupa (przezroczystość).

                if (isLiquidId(id)) {

                    liquids.push(lx, y, lz, id);

                    continue;

                }


                const textureVariant = id === PINE_UPPER_ID
                    ? pineBarkTransitionStage(blocks, index, y, LAYER) : 0;
                faceCount = addCubeFaces(id, renderData, lx, y, lz, faceCount, baseX, baseZ, textureVariant);

            }

            // At most 32 cells, rather than the whole chunk, per scan unit.
            if ((lz & 1) === 1) yield;
        }

    }


    const cubeFaces = faceCount;

    for (let k = 0; k < plants.length; k += 4) {
        faceCount = addPlants(plants, faceCount, baseX, baseZ, k, k + 4, plantData);
        yield;
    }
    for (let k = 0; k < riverPlants.length; k += 4) {
        faceCount = addRiverPlants(riverPlants, faceCount, baseX, baseZ, null, overrides, animationRanges, k, k + 4, plantData);
        yield;
    }
    for (let k = 0; k < bushyGrass.length; k += 4) {
        faceCount = addRiverPlants(bushyGrass, faceCount, baseX, baseZ, grassDetail, null, null, k, k + 4);
        yield;
    }

    const plantFaces = faceCount - cubeFaces;

    for (let k = 0; k < leaves.length; k += 4) {

        const id = leaves[k + 3];

        faceCount = leafParts
            ? addLeafParts(id, blockRenderData[id], leaves[k], leaves[k + 1], leaves[k + 2], faceCount, baseX, baseZ, leafFaces)
            : addCubeFaces(id, blockRenderData[id], leaves[k], leaves[k + 1], leaves[k + 2], faceCount, baseX, baseZ);
        if ((k & 31) === 28) yield;

    }

    for (let k = 0; k < flats.length; k += 4) {
        faceCount = addFlats(flats, faceCount, baseX, baseZ, k, k + 4);
        if ((k & 63) === 60) yield;
    }

    const cutoutFaces = faceCount - cubeFaces - plantFaces;

    for (let k = 0; k < liquids.length; k += 4) {

        const id = liquids[k + 3];

        faceCount = addCubeFaces(id, blockRenderData[id], liquids[k], liquids[k + 1], liquids[k + 2], faceCount, baseX, baseZ);
        if ((k & 63) === 60) yield;

    }

    const waterFaces = faceCount - cubeFaces - plantFaces - cutoutFaces;


    if (faceCount === 0) {
        return null;
    }


    // Indeksy: 2 trójkąty na ścianę. Do 65 536 wierzchołków
    // wystarczą 16-bitowe liczby (mniej pamięci).

    const vertexCount = faceCount * 4;

    const indices =
        vertexCount <= 65536
            ? new Uint16Array(faceCount * 6)
            : new Uint32Array(faceCount * 6);


    for (let f = 0; f < faceCount; f++) {

        const pattern =
            splitBuffer[f] === 1
                ? SPLIT_0_3
                : SPLIT_1_2;

        for (let i = 0; i < 6; i++) {
            indices[f * 6 + i] = f * 4 + pattern[i];
        }
        if ((f & 511) === 511) yield;

    }


    const geometry = new THREE.BufferGeometry();

    // Copy in bounded slices: committing all ten dense attributes in one
    // operation used to bypass the meshing deadline after the expensive scan.
    let published = false;
    try {
        const attributes = [
            ['position', positionBuffer, 3, false],
            ['normal', normalBuffer, 3, false],
            ['uv', uvBuffer, 2, false],
            ['color', colorBuffer, 4, true],
            ['atmosphereLight', atmosphereLightBuffer, 4, true],
            ['surfaceOcclusion', surfaceOcclusionBuffer, 1, true],
            ['surfaceEmission', surfaceEmissionBuffer, 1, true],
            ['surfaceProfile', surfaceProfileBuffer, 2, false],
            ['tint', tintBuffer, 4, true],
            ['plantMotion', plantMotionBuffer, 2, true]
        ];
        for (const [name, source, itemSize, normalized] of attributes) {
            const target = new source.constructor(vertexCount * itemSize);
            for (let offset = 0; offset < target.length; offset += 32768) {
                target.set(source.subarray(offset, Math.min(offset + 32768, target.length)), offset);
                yield;
            }
            geometry.setAttribute(name, new THREE.BufferAttribute(target, itemSize, normalized));
        }

        // Color of diffuse sky transmitted through the actual overhead leaves.
        // Three bytes per vertex, only for geometry touching a canopy. Bounded
        // slices preserve the existing meshing deadline and job cancellation.
        const canopy = createCanopySampler(world);
        let canopyColors = null;
        for (let vertex = 0; vertex < vertexCount; vertex++) {
            const offset = vertex * 3;
            const color = canopy.sample(chunk.cx * S + positionBuffer[offset] + normalBuffer[offset] * .01,
                positionBuffer[offset + 1] + normalBuffer[offset + 1] * .01,
                chunk.cz * S + positionBuffer[offset + 2] + normalBuffer[offset + 2] * .01);
            if (color[0] < .999 || color[1] < .999 || color[2] < .999) {
                canopyColors ??= new Uint8Array(vertexCount * 3).fill(255);
                for (let c = 0; c < 3; c++) canopyColors[offset + c] = Math.round(color[c] * 255);
            }
            if ((vertex & 511) === 511) yield;
        }
        if (canopyColors) geometry.setAttribute('canopyTint', new THREE.BufferAttribute(canopyColors, 3, true));

        geometry.setIndex(
            new THREE.BufferAttribute(indices, 1)
        );


        // Legacy synchronous fixtures retain the historic empty group slots.
        // Runtime geometries omit them, so Three never submits an empty draw.
        if (cubeFaces > 0 || legacyGroups) geometry.addGroup(0, cubeFaces * 6, 0);
        if (plantFaces > 0 || legacyGroups) geometry.addGroup(cubeFaces * 6, plantFaces * 6, 1);
        if (cutoutFaces > 0) geometry.addGroup((cubeFaces + plantFaces) * 6, cutoutFaces * 6, 3);
        if (waterFaces > 0) geometry.addGroup((cubeFaces + plantFaces + cutoutFaces) * 6, waterFaces * 6, 2);

        // Kula obejmująca chunk - potrzebna, żeby three.js pomijał
        // chunki poza kamerą. Liczymy ją od razu z wymiarów chunka.

        geometry.boundingSphere = new THREE.Sphere(
            new THREE.Vector3(S / 2, height / 2, S / 2),
            Math.sqrt((S / 2) * (S / 2) * 2 + (height / 2) * (height / 2))
                // Full-width grass cards can cross the chunk edge with placement
                // jitter (1/16) plus shared wind (up to .09/.055 on X/Z).
                + Math.max(riverPlants.length ? 1.2 : 0, spriteReach, bushyGrass.length ? .25 : 0)
        );

        geometry.userData.bushyGrassDetail = grassDetail;
        geometry.userData.bushyGrassCount = bushyGrass.length / 4;
        geometry.userData.leafDetail = leafDetail;
        geometry.userData.plantDetail = plantDetail;
        // Install bindings only when World publishes the finished geometry. A
        // canceled or superseded slice must never steal a live animation binding.
        if (animationRanges.length) geometry.userData.plantAnimationRanges = animationRanges;
        geometry.userData.meshPart = terrain ? (includePlants ? 'combined' : 'terrain') : 'plants';


        published = true;
        return geometry;
    } finally {
        if (!published) geometry.dispose();
    }
}
