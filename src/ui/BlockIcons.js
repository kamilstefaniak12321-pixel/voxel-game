import {
    BLOCK_TYPES
} from '../blocks/BlockRegistry.js';

import {
    ITEM_TYPES
} from '../items/ItemRegistry.js';

import {
    ATLAS_URL,
    ATLAS_TILES,
    ATLAS_TILE_SIZE
} from '../rendering/TextureAtlas.js';

import {
    getFaceTexture
} from '../rendering/BlockRenderData.js';

// ------------------------------------------------------------
// IKONKI BLOKÓW
//
// Dla każdego bloku rysujemy mały sześcian widziany z ukosa
// (góra + dwa boki), z tych samych tekstur co w świecie.
// Wynik to obrazki (data URL), które pasek bloków wstawia
// do <img>. Nowy blok dostaje ikonkę automatycznie. Roślina
// i przedmiot (owoc) - płaski obrazek z atlasu.
// ------------------------------------------------------------

// Rozmiar ikonki w pikselach (na ekranie może być mniejsza).

const ICON_SIZE = 64;

// Przyciemnienie boków - jak w świecie, gdzie boki są
// ciemniejsze od góry.

const LEFT_SHADE = 0.2;
const RIGHT_SHADE = 0.4;


function loadImage(url) {

    return new Promise((resolve, reject) => {

        const image = new Image();

        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Nie udało się wczytać ${url}`));

        image.src = url;

    });

}


// Rysuje jedną ścianę: kafelek atlasu "naciągnięty" na
// równoległobok podany przez transformację (a, b, c, d, e, f).

function drawFace(ctx, atlas, tileName, transform, shade) {

    const tile = ATLAS_TILES[tileName];

    if (!tile) {
        return;
    }


    const T = ATLAS_TILE_SIZE;

    ctx.setTransform(...transform);


    // Kafelek odrobinę większy niż ściana, żeby między ścianami
    // nie prześwitywały cienkie szczeliny.

    ctx.drawImage(
        atlas,
        tile.x * T, tile.y * T, T, T,
        -0.15, -0.15, T + 0.3, T + 0.3
    );


    // Cień tylko na pikselach ściany (liście mają prześwity - przez
    // nie nie może być widać ciemnego prostokąta).

    if (shade > 0) {

        ctx.globalCompositeOperation = 'source-atop';

        ctx.fillStyle = `rgba(0, 0, 0, ${shade})`;

        ctx.fillRect(-0.15, -0.15, T + 0.3, T + 0.3);

        ctx.globalCompositeOperation = 'source-over';

    }

}


// Płaski obrazek: cały kafelek atlasu na całej ikonce.

function flatIcon(atlas, tileName) {

    const canvas = document.createElement('canvas');

    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;

    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = false;

    const tile = ATLAS_TILES[tileName];

    const T = ATLAS_TILE_SIZE;

    if (tile) {
        ctx.drawImage(atlas, tile.x * T, tile.y * T, T, T, 0, 0, ICON_SIZE, ICON_SIZE);
    }

    return canvas.toDataURL();

}


// Zwraca Map: nazwa bloku albo przedmiotu -> data URL ikonki.

export async function createBlockIcons() {

    const icons = new Map();

    let atlas;

    try {
        atlas = await loadImage(ATLAS_URL);
    }
    catch (error) {
        console.warn(error);
        return icons;
    }


    const W = ICON_SIZE;
    const T = ATLAS_TILE_SIZE;

    // Jednostka: ile pikseli ikonki przypada na piksel tekstury
    // wzdłuż krawędzi ściany.

    const u = W / 2 / T;


    for (const [type, definition] of Object.entries(BLOCK_TYPES)) {

        const canvas = document.createElement('canvas');

        canvas.width = W;
        canvas.height = W;

        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = false;


        const textures = definition.textures;


        // Roślina i płaska dekoracja: płaski obrazek (jak tekstura),
        // bez sześcianu.

        if (definition.model === 'cross' || definition.model === 'flat') {

            icons.set(type, flatIcon(atlas, getFaceTexture(textures, 'front')));

            continue;

        }


        // Góra: romb od (W/2, 0) przez (W, W/4) i (0, W/4) do (W/2, W/2).

        drawFace(ctx, atlas, getFaceTexture(textures, 'top'),
            [u, u / 2, -u, u / 2, W / 2, 0], 0);


        // Lewy bok (przód bloku): od (0, W/4) do (W/2, W).

        drawFace(ctx, atlas, getFaceTexture(textures, 'front'),
            [u, u / 2, 0, u, 0, W / 4], LEFT_SHADE);


        // Prawy bok: od (W/2, W/2) do (W, 3W/4).

        drawFace(ctx, atlas, getFaceTexture(textures, 'right'),
            [u, -u / 2, 0, u, W / 2, W / 2], RIGHT_SHADE);


        icons.set(type, canvas.toDataURL());

    }


    for (const [type, item] of Object.entries(ITEM_TYPES)) {
        icons.set(type, flatIcon(atlas, item.icon));
    }


    return icons;

}
