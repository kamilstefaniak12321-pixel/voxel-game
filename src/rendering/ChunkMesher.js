import * as THREE from 'three';


import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    BLOCK_LIGHT_COLOR,
    AMBIENT_OCCLUSION
} from '../config.js';


import {
    AIR_ID,
    isOpaqueId,
    getLightEmission
} from '../blocks/BlockRegistry.js';


import {
    MAX_LIGHT,
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
//   padSky    - światło nieba
//   padBlock  - światło lamp
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
const padSky = new Uint8Array(P_LAYER * (H + 2));
const padBlock = new Uint8Array(P_LAYER * (H + 2));


function padIndex(x, y, z) {

    return ((y + 1) * P + (z + 1)) * P + (x + 1);

}


// Przesunięcie indeksu w kopii o (dx, dy, dz).

function padOffset(dx, dy, dz) {

    return dy * P_LAYER + dz * P + dx;

}


function fillPadding(chunk, world, height) {

    // Warstwy do skopiowania: od 0 do `last` (jedna nad
    // najwyższym blokiem chunka, jeśli mieści się w świecie).

    const last = Math.min(height, H - 1);


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


                    for (let y = 0; y <= last; y++) {

                        const p = padIndex(x, y, z);


                        // Niewczytany chunk (np. za granicą świata)
                        // traktujemy jak otwarte powietrze.

                        if (!source) {

                            padOpaque[p] = 0;
                            padSky[p] = MAX_LIGHT;
                            padBlock[p] = 0;

                            continue;

                        }


                        const i = y * LAYER + column;

                        padOpaque[p] = isOpaqueId(source.blocks[i]) ? 1 : 0;
                        padSky[p] = source.skyLight[i];
                        padBlock[p] = source.blockLight[i];

                    }


                    // Pod światem: pełny blok.

                    const below = padIndex(x, -1, z);

                    padOpaque[below] = 1;
                    padSky[below] = 0;
                    padBlock[below] = 0;


                    // Nad światem: otwarte niebo.

                    if (height === H) {

                        const above = padIndex(x, H, z);

                        padOpaque[above] = 0;
                        padSky[above] = MAX_LIGHT;
                        padBlock[above] = 0;

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

for (let i = 0; i < BRIGHTNESS.length; i++) {
    BRIGHTNESS[i] = lightToBrightness(i / LEVEL_STEPS);
}


// Przyciemnienie rogu przy 0, 1, 2 i 3 zasłaniających blokach.

const SHADE = [0, 1, 2, 3].map(
    count => 1 - AMBIENT_OCCLUSION * count / 3
);


// Kolor światła lamp jako ułamki 0-1.

const LAMP_R = ((BLOCK_LIGHT_COLOR >> 16) & 255) / 255;
const LAMP_G = ((BLOCK_LIGHT_COLOR >> 8) & 255) / 255;
const LAMP_B = (BLOCK_LIGHT_COLOR & 255) / 255;


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
    splitBuffer = grow(splitBuffer, Uint8Array, capacity);

    faceCapacity = capacity;

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
// i światłem nieba (a), już razem z cieniem w kącie. Karta
// graficzna płynnie miesza go między rogami i oświetla nim
// teksturę (patrz BlockRenderData.js).
//
// Wierzchołki są w współrzędnych lokalnych chunka, mesh jest
// potem przesuwany na właściwe miejsce w świecie.
//
// Zwraca null, jeśli chunk nie ma żadnej widocznej ściany.
// ------------------------------------------------------------

export function buildChunkGeometry(chunk, world) {

    if (chunk.blockCount === 0) {
        return null;
    }


    const blocks = chunk.blocks;
    const height = Math.min(chunk.maxY, H);


    fillPadding(chunk, world, height);


    // Pozycja rogu chunka w świecie (w blokach) - do obrotu tekstur.

    const baseX = chunk.cx * S;
    const baseZ = chunk.cz * S;


    let faceCount = 0;


    for (let y = 0; y < height; y++) {

        for (let lz = 0; lz < S; lz++) {

            for (let lx = 0; lx < S; lx++) {

                const id = blocks[y * LAYER + lz * S + lx];

                if (id === AIR_ID) {
                    continue;
                }


                const renderData = blockRenderData[id];

                if (!renderData) {
                    continue;
                }


                const block = padIndex(lx, y, lz);

                // Świecący blok jest jasny cały, bez cieni.

                const glowing = getLightEmission(id) > 0;


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


                    const face = BLOCK_FACES[faceIndex];

                    const rotation =
                        renderData.rotate[faceIndex]
                            ? getRotationAt(baseX + lx, y, baseZ + lz)
                            : 0;

                    const uv = renderData.uv[faceIndex][rotation];


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
                        positionBuffer[p + i * 3 + 1] = y + corner[1];
                        positionBuffer[p + i * 3 + 2] = lz + corner[2];

                        normalBuffer[p + i * 3] = face.normal[0];
                        normalBuffer[p + i * 3 + 1] = face.normal[1];
                        normalBuffer[p + i * 3 + 2] = face.normal[2];

                        uvBuffer[t + i * 2] = uv[i * 2];
                        uvBuffer[t + i * 2 + 1] = uv[i * 2 + 1];


                        // Kolor rogu:
                        //   r, g, b - światło lamp (już w kolorze lamp)
                        //   a       - światło nieba
                        // Świecący blok: pełne światło, bez cieni w kątach.

                        let r = FACE_SHADE[faceIndex] * 255;
                        let g = r;
                        let b = r;
                        let a = 255;

                        let brightness = 1;


                        if (!glowing) {

                            const s = faceIndex * 12 + i * 3;

                            const side1 = block + CORNER_SAMPLES[s];
                            const side2 = block + CORNER_SAMPLES[s + 1];
                            const diagonal = block + CORNER_SAMPLES[s + 2];


                            // Średnie światło komórek bez bloku.
                            // Gdy oba boki są zajęte, komórka po skosie
                            // jest od ściany odcięta - nie liczy się.

                            let sky = padSky[front];
                            let lamp = padBlock[front];
                            let count = 1;

                            let shadeCount;


                            if (padOpaque[side1] && padOpaque[side2]) {

                                shadeCount = 3;

                            }
                            else {

                                shadeCount =
                                    padOpaque[side1] +
                                    padOpaque[side2] +
                                    padOpaque[diagonal];

                                if (!padOpaque[diagonal]) {
                                    sky += padSky[diagonal];
                                    lamp += padBlock[diagonal];
                                    count++;
                                }

                            }


                            if (!padOpaque[side1]) {
                                sky += padSky[side1];
                                lamp += padBlock[side1];
                                count++;
                            }

                            if (!padOpaque[side2]) {
                                sky += padSky[side2];
                                lamp += padBlock[side2];
                                count++;
                            }


                            const skyBrightness =
                                BRIGHTNESS[Math.round(sky * LEVEL_STEPS / count)];

                            const lampBrightness =
                                BRIGHTNESS[Math.round(lamp * LEVEL_STEPS / count)];

                            const shade = SHADE[shadeCount];

                            const skyValue = skyBrightness * shade;

                            const lampValue =
                                lampBrightness * shade * LAMP_FACE_SHADE[faceIndex];


                            r = lampValue * LAMP_R * 255;
                            g = lampValue * LAMP_G * 255;
                            b = lampValue * LAMP_B * 255;
                            a = skyValue * 255;

                            brightness = Math.max(skyValue, lampValue);

                        }


                        colorBuffer[c + i * 4] = r + 0.5;
                        colorBuffer[c + i * 4 + 1] = g + 0.5;
                        colorBuffer[c + i * 4 + 2] = b + 0.5;
                        colorBuffer[c + i * 4 + 3] = a + 0.5;


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

            }

        }

    }


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

    geometry.setIndex(
        new THREE.BufferAttribute(indices, 1)
    );


    // Kula obejmująca chunk - potrzebna, żeby three.js pomijał
    // chunki poza kamerą. Liczymy ją od razu z wymiarów chunka.

    geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(S / 2, height / 2, S / 2),
        Math.sqrt((S / 2) * (S / 2) * 2 + (height / 2) * (height / 2))
    );


    return geometry;

}
