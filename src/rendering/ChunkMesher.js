import * as THREE from 'three';


import {
    CHUNK_SIZE,
    CHUNK_HEIGHT
} from '../config.js';


import {
    AIR_ID,
    isOpaqueId
} from '../blocks/BlockRegistry.js';


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
// Bufory wielokrotnego użytku. Zamiast tworzyć nowe tablice dla
// każdego chunka, piszemy do tych samych (rosną w razie potrzeby),
// a na końcu kopiujemy tylko potrzebny kawałek.
// ------------------------------------------------------------

let faceCapacity = 0;

let positionBuffer = null;
let normalBuffer = null;
let uvBuffer = null;


function ensureCapacity(faces) {

    if (faces <= faceCapacity) {
        return;
    }


    const capacity = Math.max(faces, faceCapacity * 2, 2048);

    const grow = (old, size) => {

        const buffer = new Float32Array(size);

        if (old) {
            buffer.set(old);
        }

        return buffer;

    };


    positionBuffer = grow(positionBuffer, capacity * 12);
    normalBuffer = grow(normalBuffer, capacity * 12);
    uvBuffer = grow(uvBuffer, capacity * 8);

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
// Wierzchołki są w współrzędnych lokalnych chunka, mesh jest
// potem przesuwany na właściwe miejsce w świecie.
//
// Zwraca null, jeśli chunk nie ma żadnej widocznej ściany.
// ------------------------------------------------------------

export function buildChunkGeometry(chunk, world) {

    if (chunk.blockCount === 0) {
        return null;
    }


    const S = CHUNK_SIZE;
    const LAYER = S * S;

    const blocks = chunk.blocks;
    const height = Math.min(chunk.maxY, CHUNK_HEIGHT);


    // Pozycja rogu chunka w świecie (w blokach) - do obrotu tekstur.

    const baseX = chunk.cx * S;
    const baseZ = chunk.cz * S;


    // Sąsiednie chunki pobieramy raz (null = niewczytany).

    const west = world.getChunk(chunk.cx - 1, chunk.cz);
    const east = world.getChunk(chunk.cx + 1, chunk.cz);
    const north = world.getChunk(chunk.cx, chunk.cz - 1);
    const south = world.getChunk(chunk.cx, chunk.cz + 1);


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


                for (
                    let faceIndex = 0;
                    faceIndex < BLOCK_FACES.length;
                    faceIndex++
                ) {

                    const face = BLOCK_FACES[faceIndex];

                    const nx = lx + face.normal[0];
                    const ny = y + face.normal[1];
                    const nz = lz + face.normal[2];


                    // Blok po drugiej stronie tej ściany.

                    let neighborId = AIR_ID;

                    if (ny < 0 || ny >= CHUNK_HEIGHT) {
                        neighborId = AIR_ID;
                    }
                    else if (nx < 0) {
                        if (west) neighborId = west.blocks[ny * LAYER + nz * S + (S - 1)];
                    }
                    else if (nx >= S) {
                        if (east) neighborId = east.blocks[ny * LAYER + nz * S];
                    }
                    else if (nz < 0) {
                        if (north) neighborId = north.blocks[ny * LAYER + (S - 1) * S + nx];
                    }
                    else if (nz >= S) {
                        if (south) neighborId = south.blocks[ny * LAYER + nx];
                    }
                    else {
                        neighborId = blocks[ny * LAYER + nz * S + nx];
                    }


                    // Ściana zasłonięta - pomijamy ją.

                    if (isOpaqueId(neighborId)) {
                        continue;
                    }


                    const rotation =
                        renderData.rotate[faceIndex]
                            ? getRotationAt(baseX + lx, y, baseZ + lz)
                            : 0;

                    const uv = renderData.uv[faceIndex][rotation];


                    ensureCapacity(faceCount + 1);


                    // 4 rogi ściany.

                    const p = faceCount * 12;
                    const t = faceCount * 8;

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

                    }


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

    const pattern = BLOCK_FACES[0].indices;

    for (let f = 0; f < faceCount; f++) {

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
