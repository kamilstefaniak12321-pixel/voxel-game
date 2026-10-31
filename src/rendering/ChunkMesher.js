import * as THREE from 'three';


import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    AMBIENT_OCCLUSION,
    WATER_SURFACE,
    WATER_DEPTH_LIGHT,
    WATER_DEPTH_LIGHT_MIN
} from '../config.js';

import { WATER_FLOW_UV } from './BlockRenderData.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { getRiverPlantFaces, plantRandom, plantTransform, riverPlantTransform } from './RiverPlantGeometry.js';
import { getBushyGrassFaces } from './BushyGrassGeometry.js';
import { getAtlasUV } from './TextureAtlas.js';


import {
    AIR_ID,
    getBlockId,
    isOpaqueId,
    isLiquidId,
    getLiquidKindId,
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


const padOpaque = new Uint8Array(P_LAYER * (H + 2));
const padShade = new Uint8Array(P_LAYER * (H + 2));

// ID cieczy w komórce (0 = nie ciecz) - między dwiema komórkami tej
// samej cieczy (np. woda przy wodzie) nie rysujemy ściany.
const padLiquid = new Uint8Array(P_LAYER * (H + 2));
const padSky = new Uint8Array(P_LAYER * (H + 2));
const padR = new Uint8Array(P_LAYER * (H + 2));
const padG = new Uint8Array(P_LAYER * (H + 2));
const padB = new Uint8Array(P_LAYER * (H + 2));

// Numer dywanu w komórce (barwinek - TuftGeometry.js carpet), 0 - nie
// dywan. Dywan łączy się z sąsiadem o tym samym numerze, także przez
// granicę chunka.
const padCarpet = new Uint8Array(P_LAYER * (H + 2));
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

    // Warstwy do skopiowania: od `first` do `last` (jedna nad
    // najwyższym blokiem chunka, jeśli mieści się w świecie).
    // Niższych mesher nie ogląda (patrz hiddenBelow).

    const last = Math.min(height, H - 1);

    padTop = last;
    padBottom = first;


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
                    padSky[below] = 0;
                    padR[below] = padG[below] = padB[below] = 0;


                    // Nad światem: otwarte niebo.

                    if (height === H) {

                        const above = padIndex(x, H, z);

                        padOpaque[above] = 0;
                        padShade[above] = 0;
                        padLiquid[above] = 0;
                        padSky[above] = MAX_LIGHT;
                        padR[above] = padG[above] = padB[above] = 0;

                    }

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

function addPlants(plants, faceCount, baseX, baseZ) {

    for (let k = 0; k < plants.length; k += 4) {

        const lx = plants[k];
        const y = plants[k + 1];
        const lz = plants[k + 2];
        const id = plants[k + 3];
        const emission = getLightEmission(id) / MAX_LIGHT * 255;

        const { cross, tint } = blockRenderData[id];

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

// ------------------------------------------------------------
// Generated river plants share the existing plant material and chunk batch.
// Their cached templates carry actual surface normals and a linear albedo tint.
function addRiverPlants(plants, faceCount, baseX, baseZ, grassDetail = null, overrides = null, animationRanges = null) {
    const grass = grassDetail !== null;
    const grassUv = grass ? getAtlasUV('snow') : null;
    for (let k = 0; k < plants.length; k += 4) {
        const lx = plants[k], y = plants[k + 1], lz = plants[k + 2];
        const data = grass ? { kind: 'grass', uv: grassUv } : blockRenderData[plants[k + 3]].riverPlant;
        const wx = baseX + lx, wz = baseZ + lz;
        const transform = grass ? riverPlantTransform(wx, y, wz) : plantTransform(wx, y, wz, data.tuft);
        const event = overrides?.get(y * LAYER + lz * S + lx);
        if (event) animationRanges.push({ event, start: faceCount, transform });
        const cell = padIndex(lx, y, lz);
        // Dywan: z których stron rośnie taki sam (bity +x, +z, -x, -z).
        const mask = !grass && data.carpet
            ? (padCarpet[cell + 1] === data.carpet ? 1 : 0) | (padCarpet[cell + P] === data.carpet ? 2 : 0) |
                (padCarpet[cell - 1] === data.carpet ? 4 : 0) | (padCarpet[cell - P] === data.carpet ? 8 : 0)
            : 0;
        const faces = grass
            ? getBushyGrassFaces(plants[k + 3] === TALL_GRASS_ID, transform.variant, grassDetail)
            : getRiverPlantFaces(data.kind, transform.variant, data.waterlogged, data.tuft, mask);
        const climate = grass && meshTint ? tintOfColumn(lx, lz) : null;
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
        const { uMin, uMax, vMin, vMax } = data.uv;
        ensureCapacity(faceCount + faces.length);

        for (const face of faces) {
            const p = faceCount * 12, t = faceCount * 8, c = faceCount * 16;
            for (let i = 0; i < 4; i++) {
                const vertex = face.vertices[i];
                positionBuffer[p + i * 3] = centerX + cos * vertex[0] - sin * vertex[2];
                positionBuffer[p + i * 3 + 1] = y + vertex[1];
                positionBuffer[p + i * 3 + 2] = centerZ + sin * vertex[0] + cos * vertex[2];
                normalBuffer[p + i * 3] = cos * face.normal[0] - sin * face.normal[2];
                normalBuffer[p + i * 3 + 1] = face.normal[1];
                normalBuffer[p + i * 3 + 2] = sin * face.normal[0] + cos * face.normal[2];
                // A model pixel has one colour, without a whole 16x16 tile
                // repeated inside it. Keep the shared atlas/material batch.
                uvBuffer[t + i * 2] = face.uv ? uMin + face.uv[i][0] * (uMax - uMin) : (uMax + uMin) / 2;
                uvBuffer[t + i * 2 + 1] = face.uv ? vMax - face.uv[i][1] * (vMax - vMin) : (vMin + vMax) / 2;
                plantMotionBuffer[t + i * 2] = face.weights[i];
                plantMotionBuffer[t + i * 2 + 1] = face.movement;

                const shade = (0.79 + Math.min(1, vertex[1] / 0.8) * 0.21) * depthShade;
                colorBuffer[c + i * 4] = lampR * shade * 255 + 0.5;
                colorBuffer[c + i * 4 + 1] = lampG * shade * 255 + 0.5;
                colorBuffer[c + i * 4 + 2] = lampB * shade * 255 + 0.5;
                colorBuffer[c + i * 4 + 3] = sky * shade * 255 + 0.5;
                atmosphereLightBuffer[c + i * 4] = lampR * atmosphereScale * shade * 255 + 0.5;
                atmosphereLightBuffer[c + i * 4 + 1] = lampG * atmosphereScale * shade * 255 + 0.5;
                atmosphereLightBuffer[c + i * 4 + 2] = lampB * atmosphereScale * shade * 255 + 0.5;
                atmosphereLightBuffer[c + i * 4 + 3] = atmosphereSky * depthShade * 255 + 0.5;
                surfaceOcclusionBuffer[faceCount * 4 + i] = shade * 255 + 0.5;
                surfaceEmissionBuffer[faceCount * 4 + i] = 0;
                for (let channel = 0; channel < 3; channel++) {
                    tintBuffer[c + i * 4 + channel] = climate
                        ? Math.min(255, Math.round(face.color[channel] * climate[channel] / 128))
                        : face.color[channel];
                }
                tintBuffer[c + i * 4 + 3] = 128;
            }
            splitBuffer[faceCount++] = 0;
        }
    }
    return faceCount;
}

// PŁASKIE DEKORACJE (model 'flat'): jeden obrazek tuż przy ścianie
// sąsiada, do którego blok przylega - opadłe liście leżą na ziemi,
// wieniec wisi na ścianie. Światło - z komórki dekoracji.
// ------------------------------------------------------------

// Jak daleko od ściany sąsiada (żeby nie migotała razem z nią).
const FLAT_GAP = 0.03;

function addFlats(flats, faceCount, baseX, baseZ) {

    for (let k = 0; k < flats.length; k += 4) {

        const lx = flats[k];
        const y = flats[k + 1];
        const lz = flats[k + 2];

        const id = flats[k + 3];
        const { flat, uv, rotate, tint } = blockRenderData[id];
        const emission = getLightEmission(id) / MAX_LIGHT * 255;

        const flatTint = tint && meshTint ? tintOfColumn(lx, lz) : null;

        const faceIndex = flat.face;

        const face = BLOCK_FACES[faceIndex];

        const rotation = rotate[faceIndex] ? getRotationAt(baseX + lx, y, baseZ + lz) : 0;

        const faceUv = uv[faceIndex][rotation];


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

function waterUv(uv, lx, lz) {

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

    const u = uMin + (0.5 + WATER_FLOW_UV * fx) * (uMax - uMin);
    const v = vMin + (0.5 + WATER_FLOW_UV * fz) * (vMax - vMin);

    for (let i = 0; i < 4; i++) {
        flowUv[i * 2] = u;
        flowUv[i * 2 + 1] = v;
    }

    return flowUv;

}


function addCubeFaces(id, renderData, lx, y, lz, faceCount, baseX, baseZ) {

    const block = padIndex(lx, y, lz);

    const leaves = renderData.leaves;

    // W klasycznym modelu świecący blok jest jasny cały, bez cieni.
    // Atmosfera otrzymuje osobną emisję, niezależną od światła otoczenia.

    const emission = getLightEmission(id) / MAX_LIGHT * 255;
    const glowing = emission > 0;

    const liquid = getLiquidKindId(id);

    const tinted = renderData.tint && meshTint !== null;

    // Górny blok wody (nad nim nie ma wody ani pełnego bloku) jest
    // trochę niższy - jego górne rogi są na wysokości WATER_SURFACE.

    const above = block + FACE_FRONT[TOP_FACE];

    const topHeight =
        liquid && padLiquid[above] !== liquid && !padOpaque[above]
            ? WATER_SURFACE
            : 1;


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
            ? waterUv(renderData.uv[faceIndex][rotation], lx, lz)
            : renderData.uv[faceIndex][rotation];

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

            positionBuffer[p + i * 3] = lx + corner[0];
            positionBuffer[p + i * 3 + 1] = y + (corner[1] === 1 ? topHeight : 0);
            positionBuffer[p + i * 3 + 2] = lz + corner[2];

            normalBuffer[p + i * 3] = face.normal[0];
            normalBuffer[p + i * 3 + 1] = face.normal[1];
            normalBuffer[p + i * 3 + 2] = face.normal[2];

            uvBuffer[t + i * 2] = uv[i * 2];
            uvBuffer[t + i * 2 + 1] = uv[i * 2 + 1];
            plantMotionBuffer[t + i * 2] = 0;
            plantMotionBuffer[t + i * 2 + 1] = 0;


            // Kolor rogu:
            //   r, g, b - światło lamp (już w kolorze lamp)
            //   a       - światło nieba
            // Świecący blok: pełne światło, bez cieni w kątach.

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
            brightness0 + brightness3 > brightness1 + brightness2
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

export function buildChunkGeometry(chunk, world) {

    const overrides = world.plantAnimations?.overridesFor(chunk);
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


    fillPadding(chunk, world, height, Math.max(0, start - 1));


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
    const grassDetail = world.experiments?.bushyGrass ? (world.getGrassDetail?.(chunk) ?? 0) : null;

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


                const renderData = blockRenderData[id];

                if (!renderData) {
                    continue;
                }


                if (renderData.riverPlant) {
                    riverPlants.push(lx, y, lz, id);
                    // A waterlogged plant is still a full water cell. Drawing
                    // canonical water here also preserves flow UVs and hides
                    // faces against ordinary water and other aquatic species.
                    const liquid = getLiquidKindId(id);
                    if (liquid) liquids.push(lx, y, lz, liquid);
                    continue;
                }

                if (renderData.cross) {

                    if (grassDetail !== null && (id === SHORT_GRASS_ID || id === TALL_GRASS_ID)) {
                        bushyGrass.push(lx, y, lz, id);
                        continue;
                    }

                    plants.push(lx, y, lz, id);

                    if (renderData.cross.sprite) {
                        spriteReach = Math.max(spriteReach, renderData.cross.sprite.height, renderData.cross.sprite.width);
                    }

                    continue;

                }


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


                faceCount = addCubeFaces(id, renderData, lx, y, lz, faceCount, baseX, baseZ);

            }

        }

    }


    const cubeFaces = faceCount;

    faceCount = addPlants(plants, faceCount, baseX, baseZ);
    faceCount = addRiverPlants(riverPlants, faceCount, baseX, baseZ, null, overrides, animationRanges);
    faceCount = addRiverPlants(bushyGrass, faceCount, baseX, baseZ, grassDetail);

    const plantFaces = faceCount - cubeFaces;

    for (let k = 0; k < leaves.length; k += 4) {

        const id = leaves[k + 3];

        faceCount = addCubeFaces(id, blockRenderData[id], leaves[k], leaves[k + 1], leaves[k + 2], faceCount, baseX, baseZ);

    }

    faceCount = addFlats(flats, faceCount, baseX, baseZ);

    const cutoutFaces = faceCount - cubeFaces - plantFaces;

    for (let k = 0; k < liquids.length; k += 4) {

        const id = liquids[k + 3];

        faceCount = addCubeFaces(id, blockRenderData[id], liquids[k], liquids[k + 1], liquids[k + 2], faceCount, baseX, baseZ);

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

    }


    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(positionBuffer.slice(0, vertexCount * 3), 3)
    );

    geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(normalBuffer.slice(0, vertexCount * 3), 3)
    );

    geometry.setAttribute(
        'uv',
        new THREE.BufferAttribute(uvBuffer.slice(0, vertexCount * 2), 2)
    );

    // Światło rogów (lampy: czerwony, zielony, niebieski; niebo):
    // liczby 0-255 czytane przez kartę jako 0-1.

    geometry.setAttribute(
        'color',
        new THREE.BufferAttribute(colorBuffer.slice(0, vertexCount * 4), 4, true)
    );

    // Oba modele współdzielą mesh: przełączenie światła wybiera atrybut
    // w shaderze. RGB zawiera odcień lamp, AO i cień kierunkowy;
    // alfa tylko dostęp do nieba i tłumienie pod wodą, bez AO.
    geometry.setAttribute(
        'atmosphereLight',
        new THREE.BufferAttribute(atmosphereLightBuffer.slice(0, vertexCount * 4), 4, true)
    );

    // Osobne bajty: zasłonięcie otoczenia (i dołu kępki) oraz liniowa
    // emisja light / MAX_LIGHT. Emisja nie jest przyciemniana przez AO.
    geometry.setAttribute(
        'surfaceOcclusion',
        new THREE.BufferAttribute(surfaceOcclusionBuffer.slice(0, vertexCount), 1, true)
    );

    geometry.setAttribute(
        'surfaceEmission',
        new THREE.BufferAttribute(surfaceEmissionBuffer.slice(0, vertexCount), 1, true)
    );

    // Kolor trawy w rogach (r, g, b - 0.5 = bez zmiany; a = 1 - nie dotyczy).

    geometry.setAttribute(
        'tint',
        new THREE.BufferAttribute(tintBuffer.slice(0, vertexCount * 4), 4, true)
    );

    geometry.setAttribute(
        'plantMotion',
        new THREE.BufferAttribute(plantMotionBuffer.slice(0, vertexCount * 2), 2, true)
    );

    geometry.setIndex(
        new THREE.BufferAttribute(indices, 1)
    );


    // Grupy (i materiały - World.js):
    //   pierwsza - zwykłe ściany (materiał 0: blockMaterial),
    //   druga    - rośliny (materiał 1: plantMaterial - przezroczystość,
    //              wiatr; zawsze jest, choćby pusta - World.js chowa
    //              rośliny z daleka),
    //   potem    - liście i płaskie dekoracje (materiał 3: leafMaterial -
    //              przezroczystość bez wiatru), jeśli są,
    //   na końcu - woda (materiał 2: waterMaterial - półprzezroczysta,
    //              fale), jeśli jest.

    geometry.addGroup(0, cubeFaces * 6, 0);

    geometry.addGroup(cubeFaces * 6, plantFaces * 6, 1);

    if (cutoutFaces > 0) {
        geometry.addGroup((cubeFaces + plantFaces) * 6, cutoutFaces * 6, 3);
    }

    if (waterFaces > 0) {
        geometry.addGroup((cubeFaces + plantFaces + cutoutFaces) * 6, waterFaces * 6, 2);
    }


    // Kula obejmująca chunk - potrzebna, żeby three.js pomijał
    // chunki poza kamerą. Liczymy ją od razu z wymiarów chunka.

    geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(S / 2, height / 2, S / 2),
        Math.sqrt((S / 2) * (S / 2) * 2 + (height / 2) * (height / 2)) + Math.max(riverPlants.length ? 1.2 : 0, spriteReach)
    );

    geometry.userData.bushyGrassDetail = grassDetail;
    geometry.userData.bushyGrassCount = bushyGrass.length / 4;
    if (animationRanges.length) world.plantAnimations.bindGeometry(geometry, animationRanges);


    return geometry;

}
