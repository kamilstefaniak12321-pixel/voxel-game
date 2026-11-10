import * as THREE from 'three';
import { drawPineBarkTextures } from './WoodAtlasTextures.js';
import { drawStoneToolTextures } from './StoneToolTextures.js';
import { WORLD_ATLAS_TILES } from './TextureSheetData.js';
import { drawWorldTextureAtlas } from './TextureSheets.js';

import { getPackInfo, loadPackTiles, gameResolution, safeResolution, startSucceeded } from './TexturePacks.js';


export const ATLAS_COLUMNS = 16;
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


// Stable runtime positions preserve UVs, user texture packs and model sheets.
// Source pixels live in the themed PNGs described by assets/textures/atlas.json.
export const ATLAS_TILES = Object.fromEntries(Object.entries(WORLD_ATLAS_TILES)
    .map(([name, { region, ...tile }]) => [name, tile]));
export const ATLAS_ROWS = Math.max(...Object.values(ATLAS_TILES).map(tile => tile.y + (tile.h ?? 1)));
export const PLANT_ATLAS_ROW = 2;

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
// Arkusze tematyczne są składane raz do wspólnej tekstury GPU.
// Każdy arkusz jest wczytywany raz, bez osobnych zapytań o kafelki.
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


async function buildBaseAtlas() {
    const canvas = createCanvas(ATLAS_COLUMNS * ATLAS_TILE_SIZE, ATLAS_ROWS * ATLAS_TILE_SIZE);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    await drawWorldTextureAtlas(context);

    // Gotowy atlas z powrotem jako zwykły obrazek (PNG) - tak jak sam
    // terrain.png. Rysowanie z obrazka (ikonki, średnie kolory, tekstura
    // 3D) jest tanie; z płótna przeglądarka przy każdym rysowaniu
    // przesyłałaby całe płótno od nowa.

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

    if (!blob) {
        return canvas;
    }

    try {
        const url = URL.createObjectURL(blob);
        try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
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


// Kształt kafelka 16 x 16 (1 - piksel widoczny, wiersz 0 = góra
// obrazka) albo null, dopóki atlas się nie wczyta. Do grubych
// przedmiotów w ręce (PlayerModel.buildExtrudedItemGeometry).

const tileMasks = new Map();

export function getTileMask(tileName) {

    if (tileMasks.has(tileName)) {
        return tileMasks.get(tileName);
    }

    const tile = ATLAS_TILES[tileName];

    if (!atlasPixels || !tile || (tile.w ?? 1) !== 1 || (tile.h ?? 1) !== 1) {
        return null;
    }

    const mask = new Uint8Array(ATLAS_TILE_SIZE * ATLAS_TILE_SIZE);
    const width = ATLAS_COLUMNS * ATLAS_TILE_SIZE;

    for (let y = 0; y < ATLAS_TILE_SIZE; y++) {
        for (let x = 0; x < ATLAS_TILE_SIZE; x++) {
            const i = ((tile.y * ATLAS_TILE_SIZE + y) * width + tile.x * ATLAS_TILE_SIZE + x) * 4;
            mask[y * ATLAS_TILE_SIZE + x] = atlasPixels[i + 3] >= 128 ? 1 : 0;
        }
    }

    tileMasks.set(tileName, mask);

    return mask;

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
