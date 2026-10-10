import * as THREE from 'three';


export const ATLAS_COLUMNS = 16;
export const ATLAS_ROWS = 16;

// Rozmiar jednego kafelka w pikselach.
export const ATLAS_TILE_SIZE = 16;

// O jaką część piksela tekstury UV jest odsunięte od krawędzi
// kafelka. Dokładnie na granicy dwóch kafelków karta graficzna
// mogłaby wybrać piksel z SĄSIEDNIEGO kafelka (cienkie kolorowe
// linie na krawędziach bloków). Druga połowa tej poprawki jest
// w BlockRenderData.js ("centroid").
export const ATLAS_UV_INSET = 1 / 16;


// Pozycje tekstur wewnątrz terrain.png.

export const ATLAS_TILES = {

    grass_top: {
        x: 0,
        y: 0
    },

    grass_side: {
        x: 1,
        y: 0
    },

    dirt: {
        x: 2,
        y: 0
    },

    stone: {
        x: 3,
        y: 0
    },

    lamp: {
        x: 4,
        y: 0
    },

    lepidolite: {
        x: 5,
        y: 0
    },

    lamp_red: {
        x: 6,
        y: 0
    },

    lamp_green: {
        x: 7,
        y: 0
    },

    lamp_blue: {
        x: 8,
        y: 0
    },

    lamp_purple: {
        x: 9,
        y: 0
    },

    meteorite: {
        x: 10,
        y: 0
    }

};

// ------------------------------------------------------------

const textureLoader =
    new THREE.TextureLoader();


const atlasUrl =
    new URL(
        '../../assets/textures/blocks/terrain.png',
        import.meta.url
    );


// Adres atlasu - przydaje się też poza 3D (np. ikonki bloków).

export const ATLAS_URL = atlasUrl.href;


export const blockAtlasTexture =
    textureLoader.load(
        atlasUrl.href
    );
    
// ------------------------------------------------------------
    
blockAtlasTexture.magFilter =
    THREE.NearestFilter;


blockAtlasTexture.minFilter =
    THREE.NearestFilter;


blockAtlasTexture.generateMipmaps =
    false;


blockAtlasTexture.colorSpace =
    THREE.SRGBColorSpace;
    
// ------------------------------------------------------------

export function getAtlasUV(tileName) {

    const tile =
        ATLAS_TILES[tileName];


    if (!tile) {

        throw new Error(
            `Nieznana tekstura atlasu: ${tileName}`
        );

    }


    const uMin =
        tile.x /
        ATLAS_COLUMNS;


    const uMax =
        (tile.x + 1) /
        ATLAS_COLUMNS;


    const vMax =
        1 -
        tile.y /
        ATLAS_ROWS;


    const vMin =
        1 -
        (tile.y + 1) /
        ATLAS_ROWS;


    // Odsunięcie od krawędzi kafelka, przeliczone na UV.

    const insetU =
        ATLAS_UV_INSET /
        (ATLAS_COLUMNS * ATLAS_TILE_SIZE);

    const insetV =
        ATLAS_UV_INSET /
        (ATLAS_ROWS * ATLAS_TILE_SIZE);


    return {

        uMin: uMin + insetU,
        uMax: uMax - insetU,

        vMin: vMin + insetV,
        vMax: vMax - insetV

    };

}

// ------------------------------------------------------------
