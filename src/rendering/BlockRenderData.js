import * as THREE from 'three';


import {
    BLOCK_TYPES,
    MAX_BLOCK_ID
} from '../blocks/BlockRegistry.js';


import {
    blockAtlasTexture,
    getAtlasUV
} from './TextureAtlas.js';

// ------------------------------------------------------------
// Jeden wspólny materiał dla wszystkich bloków (atlas tekstur).
// ------------------------------------------------------------

export const blockMaterial =
    new THREE.MeshLambertMaterial({

        map: blockAtlasTexture

    });

// ------------------------------------------------------------
// Poprawka na kolorowe kreski i kropki w oddali.
//
// Przy włączonym wygładzaniu krawędzi (antialias) karta graficzna
// na samym brzegu ściany potrafi policzyć pozycję w teksturze
// odrobinę POZA tą ścianą. W atlasie oznacza to trafienie w
// sąsiedni kafelek, czyli np. brązowe kropki na trawie.
//
// Słowo "centroid" każe liczyć tę pozycję zawsze wewnątrz ściany.
// Działa tylko w WebGL2 (czyli w każdej współczesnej przeglądarce).
// ------------------------------------------------------------

blockMaterial.onBeforeCompile = (shader, renderer) => {

    if (!renderer.capabilities.isWebGL2) {
        return;
    }


    const before = 'varying vec2 vMapUv;';
    const after = 'centroid varying vec2 vMapUv;';


    shader.vertexShader =
        shader.vertexShader.replace(
            '#include <uv_pars_vertex>',
            THREE.ShaderChunk.uv_pars_vertex.replace(before, after)
        );

    shader.fragmentShader =
        shader.fragmentShader.replace(
            '#include <uv_pars_fragment>',
            THREE.ShaderChunk.uv_pars_fragment.replace(before, after)
        );

};

// ------------------------------------------------------------

function getFaceTexture(
    textures,
    faceName
) {

    if (textures.all) {

        return textures.all;

    }


    if (
        textures[faceName]
    ) {

        return textures[faceName];

    }


    if (
        faceName === 'right' ||
        faceName === 'left' ||
        faceName === 'front' ||
        faceName === 'back'
    ) {

        return textures.side;

    }


    if (faceName === 'top') {

        return textures.top;

    }


    if (faceName === 'bottom') {

        return textures.bottom;

    }


    throw new Error(
        `Brak tekstury dla ściany: ${faceName}`
    );

}

// ------------------------------------------------------------

export const FACE_NAMES = [

    'right',   // +X
    'left',    // -X

    'top',     // +Y
    'bottom',  // -Y

    'front',   // +Z
    'back'     // -Z

];

// ------------------------------------------------------------
// SZABLON ŚCIAN BLOKU
//
// Dla każdej z 6 ścian: kierunek (normalna), 4 rogi i 6 indeksów
// (dwa trójkąty). Dane są wyciągnięte z BoxGeometry, więc układ
// wierzchołków i tekstur jest dokładnie taki sam jak wtedy,
// gdy każdy blok był osobnym sześcianem.
//
// Rogi są w współrzędnych 0..1 (róg bloku w 0,0,0).
// Kolejność rogów na ścianie:
//   0 - lewy górny     1 - prawy górny
//   2 - lewy dolny     3 - prawy dolny
// ------------------------------------------------------------

function createBlockFaces() {

    const box =
        new THREE.BoxGeometry(1, 1, 1);

    const position = box.getAttribute('position');
    const normal = box.getAttribute('normal');
    const index = box.getIndex();

    const faces = [];


    for (
        let faceIndex = 0;
        faceIndex < FACE_NAMES.length;
        faceIndex++
    ) {

        const firstVertex = faceIndex * 4;

        const corners = [];


        for (let i = 0; i < 4; i++) {

            const vertex = firstVertex + i;

            // BoxGeometry ma środek w 0,0,0 - przesuwamy o 0.5.

            corners.push([
                Math.round(position.getX(vertex) + 0.5),
                Math.round(position.getY(vertex) + 0.5),
                Math.round(position.getZ(vertex) + 0.5)
            ]);

        }


        const indices = [];

        for (let i = 0; i < 6; i++) {

            indices.push(
                index.getX(faceIndex * 6 + i) - firstVertex
            );

        }


        faces.push({

            name: FACE_NAMES[faceIndex],

            normal: [
                Math.round(normal.getX(firstVertex)),
                Math.round(normal.getY(firstVertex)),
                Math.round(normal.getZ(firstVertex))
            ],

            corners,
            indices

        });

    }


    box.dispose();

    return faces;

}


export const BLOCK_FACES = createBlockFaces();

// ------------------------------------------------------------
// UV ŚCIAN
//
// Dla jednego kafelka atlasu zwraca 4 wersje UV: obrócone
// o 0, 90, 180 i 270 stopni. Każda wersja to 8 liczb:
// u,v dla rogów 0, 1, 2, 3 (w kolejności z szablonu ścian).
// ------------------------------------------------------------

// Rogi ściany wymienione "po okręgu":
// lewy górny -> prawy górny -> prawy dolny -> lewy dolny.

const CORNER_CYCLE = [0, 1, 3, 2];


function createRotatedUVs(textureName) {

    const {
        uMin,
        uMax,
        vMin,
        vMax
    } = getAtlasUV(
        textureName
    );


    // Rogi kafelka w tej samej kolejności "po okręgu".

    const tileCycle = [
        [uMin, vMax],
        [uMax, vMax],
        [uMax, vMin],
        [uMin, vMin]
    ];


    const rotations = [];


    for (let rotation = 0; rotation < 4; rotation++) {

        const uv = new Float32Array(8);


        for (let i = 0; i < 4; i++) {

            const corner = CORNER_CYCLE[i];

            const tileCorner =
                tileCycle[(i + rotation) % 4];

            uv[corner * 2] = tileCorner[0];
            uv[corner * 2 + 1] = tileCorner[1];

        }


        rotations.push(uv);

    }


    return rotations;

}

// ------------------------------------------------------------
// DANE RENDEROWANIA BLOKÓW
//
// blockRenderData[id] = {
//     uv:     [ściana][obrót] -> Float32Array(8)
//     rotate: [ściana]        -> czy losowo obracać teksturę
// }
// ------------------------------------------------------------

export const blockRenderData =
    new Array(MAX_BLOCK_ID + 1).fill(null);


for (
    const [name, definition]
    of Object.entries(
        BLOCK_TYPES
    )
) {

    const rotatedFaces =
        definition.randomRotation ?? [];


    for (const faceName of rotatedFaces) {

        if (!FACE_NAMES.includes(faceName)) {

            throw new Error(
                `Blok "${name}": nieznana ściana ` +
                `w randomRotation: ${faceName}`
            );

        }

    }


    blockRenderData[definition.id] = {

        uv: FACE_NAMES.map(
            faceName => createRotatedUVs(
                getFaceTexture(
                    definition.textures,
                    faceName
                )
            )
        ),

        rotate: FACE_NAMES.map(
            faceName => rotatedFaces.includes(faceName)
        )

    };

}

// ------------------------------------------------------------
