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
    },

    sand: {
        x: 11,
        y: 0
    },

    water: {
        x: 12,
        y: 0
    },

    // Skały (teren realistyczny - src/world/terrain/Geology.js).

    granite: {
        x: 13,
        y: 0
    },

    limestone: {
        x: 14,
        y: 0
    },

    sandstone_side: {
        x: 15,
        y: 0
    },

    sandstone_top: {
        x: 0,
        y: 1
    },

    slate_side: {
        x: 1,
        y: 1
    },

    slate_top: {
        x: 2,
        y: 1
    },

    basalt_side: {
        x: 3,
        y: 1
    },

    basalt_top: {
        x: 4,
        y: 1
    },

    // Rodzaje ziemi.

    humus: { x: 5, y: 1 },
    coarse_dirt: { x: 6, y: 1 },
    forest_floor_top: { x: 7, y: 1 },
    forest_floor_side: { x: 8, y: 1 },
    mud: { x: 9, y: 1 },
    clay: { x: 10, y: 1 },
    gravel: { x: 11, y: 1 },

    // Rośliny - wiersz 2 (PLANT_ATLAS_ROW). Każda roślina (model
    // 'cross') kołysze się na wietrze, z którego wiersza by nie była.

    short_grass: { x: 0, y: 2 },
    tall_grass: { x: 1, y: 2 },
    fern: { x: 2, y: 2 },
    clover: { x: 3, y: 2 },
    nettle: { x: 4, y: 2 },
    plantain: { x: 5, y: 2 },
    poppy: { x: 6, y: 2 },
    cornflower: { x: 7, y: 2 },
    chamomile: { x: 8, y: 2 },
    dandelion: { x: 9, y: 2 },

    // Krzaki owocowe - wiersz 3. Sadzonka i krzak bez owoców są
    // wspólne dla wszystkich gatunków; dalej każdy gatunek ma dwa
    // etapy: kilka owoców (few) i pełen owoców (full).

    bush_sapling: { x: 0, y: 3 },
    bush_leaves: { x: 1, y: 3 },
    strawberry_bush_few: { x: 2, y: 3 },
    strawberry_bush_full: { x: 3, y: 3 },
    blackberry_bush_few: { x: 4, y: 3 },
    blackberry_bush_full: { x: 5, y: 3 },
    chili_bush_few: { x: 6, y: 3 },
    chili_bush_full: { x: 7, y: 3 },
    hazel_bush_few: { x: 8, y: 3 },
    hazel_bush_full: { x: 9, y: 3 },

    // Przedmioty (src/items/ItemRegistry.js) - wiersz 4: ikonki
    // w ekwipunku i obrazek w ręce.

    strawberry: { x: 0, y: 4 },
    blackberry: { x: 1, y: 4 },
    chili_pepper: { x: 2, y: 4 },
    hazelnut: { x: 3, y: 4 }

};


// Wiersz atlasu z roślinami.

export const PLANT_ATLAS_ROW = 2;

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
        atlasUrl.href,
        (texture) => computeAtlasAverages(texture.image),
        undefined,
        () => resolveAverages()
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

// ------------------------------------------------------------
// ŚREDNIE KOLORY KAFELKÓW ("rozmyty atlas")
//
// Z daleka tekstury bloków zlewają się w jeden kolor. Dla każdego
// kafelka atlasu liczymy jego średni kolor:
//   atlasAverageTexture - mała tekstura 16 x 16 (jeden piksel na
//       kafelek) - shader bloków bierze z niej kolor dalekich ścian,
//   getAtlasAverage('grass_top') - ten sam kolor jako THREE.Color
//       (daleki teren, FarTerrain.js).
// Liczone raz, po wczytaniu terrain.png - nowa tekstura bloku sama
// zmienia też kolor dalekiego terenu.
// ------------------------------------------------------------

const averageData = new Uint8Array(ATLAS_COLUMNS * ATLAS_ROWS * 4).fill(128);

export const atlasAverageTexture = new THREE.DataTexture(
    averageData,
    ATLAS_COLUMNS,
    ATLAS_ROWS
);

atlasAverageTexture.magFilter = THREE.NearestFilter;
atlasAverageTexture.minFilter = THREE.NearestFilter;
atlasAverageTexture.colorSpace = THREE.SRGBColorSpace;
atlasAverageTexture.needsUpdate = true;


// Średnie kolory (liniowe) po nazwie kafelka.

const averageColors = new Map();

let resolveAverages;

// Obietnica spełniona, gdy średnie kolory są policzone.

export const atlasAveragesReady = new Promise((resolve) => {
    resolveAverages = resolve;
});


export function getAtlasAverage(tileName) {

    return averageColors.get(tileName) ?? null;

}


function srgbToLinear(value) {

    return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;

}


function linearToSrgb(value) {

    return value <= 0.0031308
        ? value * 12.92
        : 1.055 * value ** (1 / 2.4) - 0.055;

}


function computeAtlasAverages(image) {

    try {

        const tile = ATLAS_TILE_SIZE;

        const canvas = document.createElement('canvas');

        canvas.width = ATLAS_COLUMNS * tile;
        canvas.height = ATLAS_ROWS * tile;

        const context = canvas.getContext('2d', { willReadFrequently: true });

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;


        for (let ty = 0; ty < ATLAS_ROWS; ty++) {

            for (let tx = 0; tx < ATLAS_COLUMNS; tx++) {

                // Średnia liczona w kolorach liniowych - tak, jak
                // mieszałaby je karta graficzna.

                let r = 0, g = 0, b = 0, count = 0;

                for (let y = 0; y < tile; y++) {

                    for (let x = 0; x < tile; x++) {

                        const i = ((ty * tile + y) * canvas.width + tx * tile + x) * 4;

                        if (pixels[i + 3] < 128) {
                            continue;
                        }

                        r += srgbToLinear(pixels[i] / 255);
                        g += srgbToLinear(pixels[i + 1] / 255);
                        b += srgbToLinear(pixels[i + 2] / 255);

                        count++;

                    }

                }

                if (count === 0) {
                    continue;
                }

                r /= count;
                g /= count;
                b /= count;


                // W teksturze wiersz 0 jest na dole (v = 0), a w atlasie
                // kafelek y = 0 jest na górze.

                const o = ((ATLAS_ROWS - 1 - ty) * ATLAS_COLUMNS + tx) * 4;

                averageData[o] = Math.round(linearToSrgb(r) * 255);
                averageData[o + 1] = Math.round(linearToSrgb(g) * 255);
                averageData[o + 2] = Math.round(linearToSrgb(b) * 255);
                averageData[o + 3] = 255;


                for (const [name, position] of Object.entries(ATLAS_TILES)) {

                    if (position.x === tx && position.y === ty) {
                        averageColors.set(name, new THREE.Color(r, g, b));
                    }

                }

            }

        }


        atlasAverageTexture.needsUpdate = true;

    }

    catch (error) {

        console.warn('Nie udało się policzyć średnich kolorów atlasu:', error);

    }


    resolveAverages();

}
