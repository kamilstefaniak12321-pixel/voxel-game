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
// Buduje geometrię całego chunka jako JEDEN mesh.
//
// Dodawane są tylko te ściany, które graniczą z powietrzem
// (albo z blokiem, który nie zasłania - np. przyszłe szkło).
// Ściany schowane między blokami w ogóle nie powstają.
//
// Wierzchołki są w współrzędnych lokalnych chunka, mesh jest
// potem przesuwany na właściwe miejsce w świecie.
//
// Zwraca null, jeśli chunk nie ma żadnej widocznej ściany.
// ------------------------------------------------------------

export function buildChunkGeometry(chunk, world) {

    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    let vertexCount = 0;


    // Pozycja rogu chunka w świecie (w blokach).

    const baseX = chunk.cx * CHUNK_SIZE;
    const baseZ = chunk.cz * CHUNK_SIZE;


    if (chunk.blockCount === 0) {
        return null;
    }


    for (let y = 0; y < CHUNK_HEIGHT; y++) {

        for (let lz = 0; lz < CHUNK_SIZE; lz++) {

            for (let lx = 0; lx < CHUNK_SIZE; lx++) {

                const id = chunk.getId(lx, y, lz);

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


                    // Sąsiad po stronie tej ściany.

                    const nx = lx + face.normal[0];
                    const ny = y + face.normal[1];
                    const nz = lz + face.normal[2];

                    let neighborId;


                    if (
                        nx >= 0 && nx < CHUNK_SIZE &&
                        ny >= 0 && ny < CHUNK_HEIGHT &&
                        nz >= 0 && nz < CHUNK_SIZE
                    ) {

                        // Sąsiad w tym samym chunku.

                        neighborId = chunk.getId(nx, ny, nz);

                    }

                    else {

                        // Sąsiad w innym chunku (albo poza światem).

                        neighborId = world.getBlockId(
                            baseX + nx,
                            ny,
                            baseZ + nz
                        );

                    }


                    // Ściana zasłonięta - pomijamy ją.

                    if (isOpaqueId(neighborId)) {
                        continue;
                    }


                    const rotation =
                        renderData.rotate[faceIndex]
                            ? getRotationAt(
                                baseX + lx,
                                y,
                                baseZ + lz
                            )
                            : 0;

                    const uv =
                        renderData.uv[faceIndex][rotation];


                    // 4 rogi ściany.

                    for (let i = 0; i < 4; i++) {

                        const corner = face.corners[i];

                        positions.push(
                            lx + corner[0],
                            y + corner[1],
                            lz + corner[2]
                        );

                        normals.push(
                            face.normal[0],
                            face.normal[1],
                            face.normal[2]
                        );

                        uvs.push(
                            uv[i * 2],
                            uv[i * 2 + 1]
                        );

                    }


                    // 2 trójkąty.

                    for (let i = 0; i < 6; i++) {

                        indices.push(
                            vertexCount + face.indices[i]
                        );

                    }


                    vertexCount += 4;

                }

            }

        }

    }


    if (vertexCount === 0) {
        return null;
    }


    const geometry = new THREE.BufferGeometry();


    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3)
    );

    geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(normals, 3)
    );

    geometry.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute(uvs, 2)
    );

    geometry.setIndex(indices);


    // Potrzebne, żeby three.js mógł pomijać chunki poza kamerą.

    geometry.computeBoundingSphere();


    return geometry;

}
