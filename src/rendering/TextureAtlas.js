import * as THREE from 'three';
import { FIRE_WOODS } from '../game/CampfireState.js';
import { TORCH_VARIANTS } from '../blocks/torches.js';
import { DYE_ITEMS, drawDyeIcon } from '../items/dyes.js';
import { PINE_BARK_TEXTURES, drawPineBarkTextures } from './WoodAtlasTextures.js';
import { STONE_TOOL_TEXTURES, drawStoneToolTextures } from './StoneToolTextures.js';

import { PACK_TEXTURES, TREE_PACK_ERRORS } from '../blocks/treePacks.js';

import { PLANT_TEXTURES, PLANT_PACK_ERRORS } from '../blocks/plantPacks.js';
import { BLUEBERRY_TEXTURE, BLUEBERRY_ATLAS_URL } from '../blocks/blueberry.js';
import { BUSHY_GRASS_TEXTURE, BUSHY_GRASS_TEXTURE_URL } from '../blocks/bushyGrass.js';
import { PLANT_MODEL_TEXTURES } from '../blocks/plantModels.js';

import { getPackInfo, loadPackTiles, gameResolution, safeResolution, startSucceeded } from './TexturePacks.js';


export const ATLAS_COLUMNS = 16;

// Pierwszy wolny wiersz atlasu - od niego idą tekstury z paczek drzew
// (assets/drzewa/, src/blocks/treePacks.js), po kolei, kafelek za
// kafelkiem. Nie trzeba ich wklejać do terrain.png - gra dorysowuje je
// sama przy starcie.
export const PACK_ATLAS_ROW = 11;

const PACK_TILE_NAMES = Object.keys(PACK_TEXTURES);

const PLANT_TILE_NAMES = Object.keys(PLANT_TEXTURES);

// Rozmiar jednego kafelka w pikselach w terrain.png (oryginalne
// tekstury). Z paczką tekstur (TexturePacks.js) atlas w grze ma kafelki
// atlasTileSize x atlasTileSize (do 512) - UV kafelków są takie same.
export const ATLAS_TILE_SIZE = 16;

// Rozmiar kafelka w atlasie w grze (po wczytaniu - atlasReady).
export let atlasTileSize = ATLAS_TILE_SIZE;

// Start z paczką tekstur uznajemy za udany tyle po wysłaniu atlasu na
// kartę graficzną (TexturePacks.js - bezpieczny start).
const START_CHECK_MS = 5000;

// Kiedy atlas z paczką trafił na kartę graficzną (performance.now(),
// null - jeszcze nie / bez paczki) - main.js: utrata obrazu tuż po
// starcie = za duży atlas.
export let atlasUploadedAt = null;

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
    // Budulec (tools/tekstury_budulec.py) - różnie odbija światło.
    lime_plaster: { x: 12, y: 1 },
    ochre_plaster: { x: 13, y: 1 },
    terracotta: { x: 14, y: 1 },
    polished_stone: { x: 15, y: 1 },

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
    // Rośliny biomów (tools/tekstury_biomow.py).
    reed: { x: 10, y: 2 },
    heather: { x: 11, y: 2 },
    crocus: { x: 12, y: 2 },
    dune_grass: { x: 13, y: 2 },

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
    // Borówka ma własny krzak (niski, drobne listki).
    blueberry_bush_few: { x: 10, y: 3 },
    blueberry_bush_full: { x: 11, y: 3 },
    blueberry_bush: { x: 12, y: 3 },

    // Przedmioty (src/items/ItemRegistry.js) - wiersz 4: ikonki
    // w ekwipunku i obrazek w ręce.

    strawberry: { x: 0, y: 4 },
    blackberry: { x: 1, y: 4 },
    chili_pepper: { x: 2, y: 4 },
    hazelnut: { x: 3, y: 4 },
    blueberry: { x: 4, y: 4 },

    // Drzewa (src/blocks/trees.js, tekstury: tools/tekstury_drzew.py).
    // Wiersz 5 - pnie (bok z korą, góra ze słojami).

    spruce_log_side: { x: 0, y: 5 },
    spruce_log_top: { x: 1, y: 5 },
    pine_log_side: { x: 2, y: 5 },
    pine_log_top: { x: 3, y: 5 },
    beech_log_side: { x: 4, y: 5 },
    beech_log_top: { x: 5, y: 5 },
    linden_log_side: { x: 6, y: 5 },
    linden_log_top: { x: 7, y: 5 },
    oak_log_side: { x: 8, y: 5 },
    oak_log_top: { x: 9, y: 5 },
    birch_log_side: { x: 10, y: 5 },
    birch_log_top: { x: 11, y: 5 },
    pine_log_upper_side: { x: 12, y: 5 },
    pine_log_resin_side: { x: 13, y: 5 },
    pine_bark_overlay_dense: { x: 14, y: 5 },
    pine_bark_overlay_medium: { x: 15, y: 5 },
    pine_bark_overlay_sparse: { x: 15, y: 6 },

    // Wiersz 6 - okorowane pnie.

    spruce_stripped_side: { x: 0, y: 6 },
    spruce_stripped_top: { x: 1, y: 6 },
    pine_stripped_side: { x: 2, y: 6 },
    pine_stripped_top: { x: 3, y: 6 },
    beech_stripped_side: { x: 4, y: 6 },
    beech_stripped_top: { x: 5, y: 6 },
    linden_stripped_side: { x: 6, y: 6 },
    linden_stripped_top: { x: 7, y: 6 },
    oak_stripped_side: { x: 8, y: 6 },
    oak_stripped_top: { x: 9, y: 6 },
    birch_stripped_side: { x: 10, y: 6 },
    birch_stripped_top: { x: 11, y: 6 },

    // Wiersz 7 - deski, liście (z przezroczystymi prześwitami),
    // kwitnące liście lipy, opadłe liście, wieniec.

    spruce_planks: { x: 0, y: 7 },
    pine_planks: { x: 1, y: 7 },
    beech_planks: { x: 2, y: 7 },
    linden_planks: { x: 3, y: 7 },
    oak_planks: { x: 4, y: 7 },
    birch_planks: { x: 5, y: 7 },
    spruce_leaves: { x: 6, y: 7 },
    pine_leaves: { x: 7, y: 7 },
    beech_leaves: { x: 8, y: 7 },
    linden_leaves: { x: 9, y: 7 },
    oak_leaves: { x: 10, y: 7 },
    birch_leaves: { x: 11, y: 7 },
    linden_leaves_flowering: { x: 12, y: 7 },
    beech_leaf_litter: { x: 13, y: 7 },
    oak_leaf_litter: { x: 14, y: 7 },
    spruce_wreath: { x: 15, y: 7 },

    // Wiersz 8 - sadzonki i przedmioty drzew.

    spruce_sapling: { x: 0, y: 8 },
    pine_sapling: { x: 1, y: 8 },
    beech_sapling: { x: 2, y: 8 },
    linden_sapling: { x: 3, y: 8 },
    oak_sapling: { x: 4, y: 8 },
    birch_sapling: { x: 5, y: 8 },
    spruce_cone: { x: 6, y: 8 },
    pine_cone: { x: 7, y: 8 },
    resin: { x: 8, y: 8 },
    beechnuts: { x: 9, y: 8 },
    linden_flower: { x: 10, y: 8 },
    acorn: { x: 11, y: 8 },
    birch_bark: { x: 12, y: 8 },
    axe: { x: 13, y: 8 },

    // Wiersz 9 - narzędzia i surowce (tools/tekstury_narzedzi.py).

    stick: { x: 0, y: 9 },
    pickaxe: { x: 1, y: 9 },
    shovel: { x: 2, y: 9 },
    dark_planks: { x: 3, y: 9 },

    // Biomy (tools/tekstury_biomow.py): śnieg, mech.

    snow: { x: 4, y: 9 },
    moss_top: { x: 5, y: 9 },
    moss_side: { x: 6, y: 9 },
    moss_carpet: { x: 7, y: 9 },
    moss_carpet_2: { x: 8, y: 9 },
    moss_carpet_3: { x: 9, y: 9 },
    // Reserved authored handle study; the inventory stick stays at (0, 9).
    tool_handle_source: { x: 0, y: 10 }

};


// Tekstury z paczek drzew: nazwa kafelka "<drzewo>/<plik>.png".

PACK_TILE_NAMES.forEach((name, i) => {

    ATLAS_TILES[name] = {
        x: i % ATLAS_COLUMNS,
        y: PACK_ATLAS_ROW + Math.floor(i / ATLAS_COLUMNS)
    };

});


// Obrazki z paczek roślin (assets/rosliny/, src/blocks/plantPacks.js):
// pod teksturami drzew. Obrazek większy niż 16 x 16 zajmuje kilka
// kafelków obok siebie (w x h - pola w i h; zwykłe kafelki ich nie
// mają), stoi na dole, na środku. Kafelki układane rzędami, od lewej.

{

    let row = PACK_ATLAS_ROW + Math.ceil(PACK_TILE_NAMES.length / ATLAS_COLUMNS);
    let column = 0;
    let shelf = 0;

    for (const name of PLANT_TILE_NAMES) {

        const { width, height } = PLANT_TEXTURES[name];

        const w = Math.ceil(width / ATLAS_TILE_SIZE);
        const h = Math.ceil(height / ATLAS_TILE_SIZE);

        if (column + w > ATLAS_COLUMNS) {
            row += shelf;
            column = 0;
            shelf = 0;
        }

        // pw, ph - rozmiar samego obrazka w pikselach (ikonki).
        ATLAS_TILES[name] = { x: column, y: row, w, h, pw: width, ph: height };

        column += w;
        shelf = Math.max(shelf, h);

    }

}


// Wiersze atlasu w grze: tylko te, w których są kafelki (terrain.png ma
// ich 16, ale ostatnie są puste - czekają na tekstury paczek drzew). Mniej
// wierszy = mniej pamięci karty graficznej (ważne przy dużej paczce
// tekstur). Paczki drzew z wieloma teksturami dokładają wiersze same.
// Imported model atlas is packed below the plant sheets. It remains in the
// same GPU texture and plant batch, including with high-resolution packs.
ATLAS_TILES[BLUEBERRY_TEXTURE] = {
    x: 0, y: Math.max(...Object.values(ATLAS_TILES).map(tile => tile.y + (tile.h ?? 1))),
    w: 4, h: 4, pw: 64, ph: 64
};
const fireRow = ATLAS_TILES[BLUEBERRY_TEXTURE].y + 4;
Object.keys(FIRE_WOODS).forEach((wood, i) => {
    ATLAS_TILES[`campfire_${wood}`] = { x: (i % 8) * 2, y: fireRow + Math.floor(i / 8) * 2, w: 2, h: 2, pw: 32, ph: 32 };
});
const torchRow = Math.max(...Object.values(ATLAS_TILES).map(tile => tile.y + (tile.h ?? 1)));
// Tekstury poziomów modeli roślin (src/blocks/plantModels.js) - po 16 x 16.
[...TORCH_VARIANTS.map(variant => variant.texture), ...Object.keys(DYE_ITEMS), BUSHY_GRASS_TEXTURE,
    ...Object.keys(PLANT_MODEL_TEXTURES), ...PINE_BARK_TEXTURES.map(tile => tile.name),
    ...STONE_TOOL_TEXTURES.map(tile => tile.name)].forEach((name, i) => {
    ATLAS_TILES[name] = { x: i % ATLAS_COLUMNS, y: torchRow + Math.floor(i / ATLAS_COLUMNS) };
});
export const ATLAS_ROWS = Math.max(...Object.values(ATLAS_TILES).map((tile) => tile.y + (tile.h ?? 1)));


// Wiersz atlasu z roślinami.

export const PLANT_ATLAS_ROW = 2;

// ------------------------------------------------------------

const atlasUrl =
    new URL(
        '../../assets/textures/blocks/terrain.png',
        import.meta.url
    );


// Adres atlasu - przydaje się też poza 3D (np. ikonki bloków).

export const ATLAS_URL = atlasUrl.href;


// Tekstura atlasu - obrazek dostaje po wczytaniu (atlasImage niżej).

export const blockAtlasTexture =
    new THREE.Texture();

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
// WCZYTANIE ATLASU
//
// Bez paczek drzew atlas to po prostu terrain.png. Z paczkami - płótno:
// terrain.png, a w wolnych wierszach (od PACK_ATLAS_ROW) tekstury
// z folderów paczek. Brakująca albo zepsuta tekstura - fioletowo-czarna
// szachownica (od razu widać, której brakuje).
//
// Z PACZKĄ TEKSTUR (TexturePacks.js): atlas o kafelkach T x T (T -
// rozdzielczość w grze): tekstury z paczki, a czego w niej nie ma -
// oryginalne, powiększone (ostre piksele). Przy T > 16 atlas dostaje
// MIPMAPY - pomniejszone kopie (T/2, T/4... aż do 1 piksela na kafelek),
// każdy kafelek pomniejszany osobno, więc kolory sąsiednich kafelków
// się nie mieszają. Karta graficzna bierze z daleka mniejszą kopię -
// bez migotania drobnych pikseli wielkich tekstur.
//
// atlasReady - obietnica z gotowym atlasem:
//   { image, mipmaps (null bez paczki), tileSize, iconImage, iconTileSize,
//     pixelImage (kafelki 16 x 16 - średnie kolory, odłamki), pack
//     (opis paczki albo null), extras ({ cracks, moon } - Bloby z paczki) }
// atlasImage - obrazek do ikonek (src/ui/BlockIcons.js).
// ------------------------------------------------------------

function loadImage(url) {

    return new Promise((resolve, reject) => {

        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Nie udało się wczytać ${url}`));

        image.src = url;

    });

}


// Obrazek z pliku paczki tekstur (Blob) - np. pęknięcia, księżyc.

export function loadPackImage(blob) {

    const url = URL.createObjectURL(blob);

    return loadImage(url).finally(() => URL.revokeObjectURL(url));

}


function drawMissing(context, x, y) {

    const T = ATLAS_TILE_SIZE;

    for (let py = 0; py < T; py += 4) {

        for (let px = 0; px < T; px += 4) {

            context.fillStyle = ((px + py) / 4) % 2 === 0 ? '#ff00dc' : '#000000';
            context.fillRect(x * T + px, y * T + py, 4, 4);

        }

    }

}


// Płótno w zwykłej pamięci (willReadFrequently - bez karty graficznej):
// atlas z dużą paczką składamy bez obciążania karty, a ikonki i kolory
// czytają z niego piksele.

function createCanvas(width, height) {

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    canvas.getContext('2d', { willReadFrequently: true });

    return canvas;

}


// Oryginalny atlas (16 x 16 na kafelek): terrain.png i tekstury paczek drzew.

async function buildBaseAtlas() {

    const base = await loadImage(atlasUrl.href);

    const T = ATLAS_TILE_SIZE;

    const canvas = createCanvas(ATLAS_COLUMNS * T, ATLAS_ROWS * T);

    // Płótno w pamięci (nie na karcie graficznej): z atlasu czytają
    // potem piksele średnie kolory i ikonki bloków - bez czekania na
    // kartę graficzną przy każdym odczycie.

    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.imageSmoothingEnabled = false;

    context.drawImage(base, 0, 0);


    const images = await Promise.all(PACK_TILE_NAMES.map((name) =>
        loadImage(PACK_TEXTURES[name].url).catch(() => null)
    ));

    PACK_TILE_NAMES.forEach((name, i) => {

        const { x, y } = ATLAS_TILES[name];

        const image = images[i];

        if (!image) {

            drawMissing(context, x, y);

            TREE_PACK_ERRORS.push(`Drzewo "${PACK_TEXTURES[name].pack}": brak tekstury ${PACK_TEXTURES[name].file} (w grze - fioletowa szachownica)`);

            return;

        }

        if (image.width !== T || image.height !== T) {
            TREE_PACK_ERRORS.push(`Drzewo "${PACK_TEXTURES[name].pack}": tekstura ${PACK_TEXTURES[name].file} ma ${image.width} x ${image.height} pikseli zamiast ${T} x ${T}`);
        }

        context.clearRect(x * T, y * T, T, T);

        context.drawImage(image, 0, 0, image.width, image.height, x * T, y * T, T, T);

    });


    // Obrazki roślin: na dole, na środku swoich kafelków, piksel w piksel.

    const plantImages = await Promise.all(PLANT_TILE_NAMES.map((name) =>
        loadImage(PLANT_TEXTURES[name].url).catch(() => null)
    ));

    PLANT_TILE_NAMES.forEach((name, i) => {

        const { x, y, w, h } = ATLAS_TILES[name];

        const image = plantImages[i];

        context.clearRect(x * T, y * T, w * T, h * T);

        if (!image) {

            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) {
                    drawMissing(context, x + dx, y + dy);
                }
            }

            PLANT_PACK_ERRORS.push(`Roślina "${PLANT_TEXTURES[name].pack}": brak obrazka ${PLANT_TEXTURES[name].file} (w grze - fioletowa szachownica)`);

            return;

        }

        context.drawImage(
            image,
            x * T + Math.floor((w * T - image.width) / 2),
            y * T + h * T - image.height
        );

    });


    const blueberryAtlas = await loadImage(BLUEBERRY_ATLAS_URL);
    if (blueberryAtlas.width !== 64 || blueberryAtlas.height !== 64) {
        throw new Error('Atlas borówki musi mieć 64 × 64 piksele');
    }
    const blueberryTile = ATLAS_TILES[BLUEBERRY_TEXTURE];
    context.clearRect(blueberryTile.x * T, blueberryTile.y * T, 64, 64);
    context.drawImage(blueberryAtlas, blueberryTile.x * T, blueberryTile.y * T);

    const grassTexture = await loadImage(BUSHY_GRASS_TEXTURE_URL);
    if (grassTexture.width !== 16 || grassTexture.height !== 16) {
        throw new Error('Tekstura trawy kępiastej musi mieć 16 × 16 pikseli');
    }
    const grassTile = ATLAS_TILES[BUSHY_GRASS_TEXTURE];
    context.clearRect(grassTile.x * T, grassTile.y * T, T, T);
    context.drawImage(grassTexture, grassTile.x * T, grassTile.y * T);

    await Promise.all(Object.entries(PLANT_MODEL_TEXTURES).map(async ([name, url]) => {
        const tile = ATLAS_TILES[name];
        context.clearRect(tile.x * T, tile.y * T, T, T);
        const image = await loadImage(url).catch(() => null);
        if (!image || image.width !== 16 || image.height !== 16) {
            drawMissing(context, tile.x, tile.y);
            PLANT_PACK_ERRORS.push(`Model rośliny: ${name}.png ${image ? 'ma mieć 16 × 16 pikseli' : '- brak pliku'} (w grze - fioletowa szachownica)`);
            return;
        }
        context.drawImage(image, tile.x * T, tile.y * T);
    }));

    await Promise.all(Object.entries(FIRE_WOODS).map(async ([wood, [, file]]) => {
        const image = await loadImage(new URL(`../../assets/models/campfire/drewno-${file}.png`, import.meta.url).href);
        const tile = ATLAS_TILES[`campfire_${wood}`];
        context.clearRect(tile.x * T, tile.y * T, 32, 32);
        context.drawImage(image, tile.x * T, tile.y * T);
    }));

    // Ikonki i odłamki korzystają z pierwszej klatki oryginalnego arkusza.
    // Świat i dłoń mają osobny materiał z pełną animacją na GPU.
    await Promise.all(TORCH_VARIANTS.map(async variant => {
        const image = await loadImage(new URL(`../../assets/models/torch/${variant.texture}.png`, import.meta.url).href);
        if (image.width !== 16 || image.height !== 320) throw new Error(`Nieprawidłowy arkusz pochodni: ${variant.texture}`);
        const tile = ATLAS_TILES[variant.texture];
        context.clearRect(tile.x * T, tile.y * T, T, T);
        context.drawImage(image, 0, 0, 16, 16, tile.x * T, tile.y * T, T, T);
    }));
    for (const [name, dye] of Object.entries(DYE_ITEMS)) {
        const tile = ATLAS_TILES[name];
        context.clearRect(tile.x * T, tile.y * T, T, T);
        drawDyeIcon(context, dye.color, tile.x * T, tile.y * T);
    }
    drawPineBarkTextures(context, ATLAS_TILES);
    drawStoneToolTextures(context, ATLAS_TILES);

    // Gotowy atlas z powrotem jako zwykły obrazek (PNG) - tak jak sam
    // terrain.png. Rysowanie z obrazka (ikonki, średnie kolory, tekstura
    // 3D) jest tanie; z płótna przeglądarka przy każdym rysowaniu
    // przesyłałaby całe płótno od nowa.

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    if (!blob) {
        return canvas;
    }

    try {
        return await loadImage(URL.createObjectURL(blob));
    }
    catch {
        return canvas;
    }

}


// Paczka tekstur (jeśli jest): tekstury przeskalowane do rozdzielczości
// w grze (z zapisu - przy pierwszym starcie po zmianie liczone teraz).

async function loadTexturePack() {

    try {

        const info = await getPackInfo();

        if (!info) {
            return null;
        }

        // (Poprzedni start z tą rozdzielczością się nie udał - mniejsza.)

        const size = safeResolution(gameResolution(info.source, undefined, ATLAS_ROWS));

        return size > 0 ? await loadPackTiles(size) : null;

    }
    catch (error) {

        console.warn('Paczka tekstur:', error);

        return null;

    }

}


// Atlas z paczką: kafelki T x T i mipmapy (pomniejszone kopie atlasu,
// każdy kafelek osobno). Tekstury paczki dekodowane po jednej (mniej
// pamięci naraz).

async function buildPackAtlas(base, pack) {

    const T = pack.size;

    const B = ATLAS_TILE_SIZE;

    const level0 = createCanvas(ATLAS_COLUMNS * T, ATLAS_ROWS * T);

    const context = level0.getContext('2d', { willReadFrequently: true });

    context.imageSmoothingEnabled = false;

    for (const [name, { x, y, w = 1, h = 1 }] of Object.entries(ATLAS_TILES)) {

        // Obrazek rośliny na kilku kafelkach - z oryginału, powiększony
        // piksel w piksel (paczka tekstur go jeszcze nie zmienia).

        if (w > 1 || h > 1) {
            context.drawImage(base, x * B, y * B, w * B, h * B, x * T, y * T, w * T, h * T);
            continue;
        }

        const blob = pack.tiles.get(name);

        let tile = null;

        try {
            tile = blob ? await createImageBitmap(blob) : null;
        }
        catch {
            // zepsuty plik - zostaje oryginalna tekstura
        }

        if (tile) {
            context.drawImage(tile, x * T, y * T, T, T);
            tile.close();
        }
        else {
            context.drawImage(base, x * B, y * B, B, B, x * T, y * T, T, T);
        }

    }


    // Inherit a pack's orange bark/overlays unless it supplies a complete
    // transition tile of its own. Also works with high-resolution packs.
    drawPineBarkTextures(context, ATLAS_TILES, T, pack.tiles);
    drawStoneToolTextures(context, ATLAS_TILES, T, pack.tiles);
    const levels = [level0];

    if (T > B) {

        let previous = level0;

        for (let size = T / 2; size >= 1; size /= 2) {

            const level = createCanvas(ATLAS_COLUMNS * size, ATLAS_ROWS * size);

            const levelContext = level.getContext('2d', { willReadFrequently: true });

            levelContext.imageSmoothingEnabled = true;
            levelContext.imageSmoothingQuality = 'high';

            for (let y = 0; y < ATLAS_ROWS; y++) {

                for (let x = 0; x < ATLAS_COLUMNS; x++) {

                    levelContext.drawImage(previous, x * size * 2, y * size * 2, size * 2, size * 2, x * size, y * size, size, size);

                }

            }

            levels.push(level);

            previous = level;

        }

    }


    // Kopia z kafelkami size x size (albo największa, jaka jest).

    const levelOf = (size) => levels[Math.max(0, Math.round(Math.log2(T / Math.min(T, size))))];

    return {
        image: level0,
        mipmaps: levels.length > 1 ? levels : null,
        tileSize: T,
        iconImage: levelOf(64),
        iconTileSize: Math.min(T, 64),
        pixelImage: levelOf(B),
        pack: pack.pack,
        extras: pack.extras
    };

}


async function buildAtlas() {

    const [base, pack] = await Promise.all([buildBaseAtlas(), loadTexturePack()]);

    if (!pack) {

        return {
            image: base,
            mipmaps: null,
            tileSize: ATLAS_TILE_SIZE,
            iconImage: base,
            iconTileSize: ATLAS_TILE_SIZE,
            pixelImage: base,
            pack: null,
            extras: {}
        };

    }

    return await buildPackAtlas(base, pack);

}


export const atlasReady = buildAtlas();

export const atlasImage = atlasReady.then((atlas) => atlas.iconImage);


atlasReady.then(
    (atlas) => {

        atlasTileSize = atlas.tileSize;

        blockAtlasTexture.image = atlas.image;

        if (atlas.mipmaps) {

            // Mipmapy: z daleka mniejsza kopia, w obrębie kopii - ostre
            // piksele (bez mieszania z sąsiednimi kafelkami).

            blockAtlasTexture.mipmaps = atlas.mipmaps;
            blockAtlasTexture.minFilter = THREE.NearestMipmapLinearFilter;

        }

        // Po wysłaniu na kartę graficzną: duże kopie atlasu nie są już
        // potrzebne w pamięci (zostają te do ikonek i kolorów), a start
        // z paczką się udał (TexturePacks.js - bezpieczny start).

        blockAtlasTexture.onUpdate = () => {

            blockAtlasTexture.onUpdate = null;

            if (atlas.pack) {

                atlasUploadedAt = performance.now();

                for (const level of atlas.mipmaps ?? [atlas.image]) {

                    if (level !== atlas.iconImage && level !== atlas.pixelImage && level.width > ATLAS_COLUMNS * 64) {
                        level.width = 0;
                        level.height = 0;
                    }

                }

                setTimeout(startSucceeded, START_CHECK_MS);

            }

        };

        blockAtlasTexture.needsUpdate = true;

        computeAtlasAverages(atlas.pixelImage);

    },
    (error) => {

        console.warn(error);

        resolveAverages();

    }
);

// ------------------------------------------------------------

export function getAtlasUV(tileName, inset = ATLAS_UV_INSET) {

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
        (tile.x + (tile.w ?? 1)) /
        ATLAS_COLUMNS;


    const vMax =
        1 -
        tile.y /
        ATLAS_ROWS;


    const vMin =
        1 -
        (tile.y + (tile.h ?? 1)) /
        ATLAS_ROWS;


    // Odsunięcie od krawędzi kafelka, przeliczone na UV. Importowane
    // modele mają własne UV z marginesem każdej małej ściany: inset=0
    // zachowuje ich pozycje pikseli zamiast ściskać cały region atlasu.

    const insetU =
        inset /
        (ATLAS_COLUMNS * ATLAS_TILE_SIZE);

    const insetV =
        inset /
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
//       kafelek; z wieloma paczkami drzew 16 x 32) - shader bloków
//       bierze z niej kolor dalekich ścian,
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


// Piksele atlasu (RGBA, sRGB) - zapamiętane przy liczeniu średnich,
// do kolorów cząsteczek (odłamki niszczonego bloku).

let atlasPixels = null;

const tileColors = new Map();


// Kolory nieprzezroczystych pikseli kafelka (THREE.Color, liniowe) -
// pusta lista, dopóki atlas się nie wczyta.

export function getTileColors(tileName) {

    if (tileColors.has(tileName)) {
        return tileColors.get(tileName);
    }

    const tile = ATLAS_TILES[tileName];

    if (!atlasPixels || !tile) {
        return [];
    }

    const colors = [];

    const width = ATLAS_COLUMNS * ATLAS_TILE_SIZE;

    for (let y = 0; y < ATLAS_TILE_SIZE * (tile.h ?? 1); y++) {

        for (let x = 0; x < ATLAS_TILE_SIZE * (tile.w ?? 1); x++) {

            const i = ((tile.y * ATLAS_TILE_SIZE + y) * width + tile.x * ATLAS_TILE_SIZE + x) * 4;

            if (atlasPixels[i + 3] < 128) {
                continue;
            }

            colors.push(new THREE.Color(
                srgbToLinear(atlasPixels[i] / 255),
                srgbToLinear(atlasPixels[i + 1] / 255),
                srgbToLinear(atlasPixels[i + 2] / 255)
            ));

        }

    }

    tileColors.set(tileName, colors);

    return colors;

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

        context.drawImage(image, 0, 0);

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

        atlasPixels = pixels;


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
