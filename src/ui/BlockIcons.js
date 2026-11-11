import {
    BLOCK_TYPES
} from '../blocks/BlockRegistry.js';

import {
    ITEM_TYPES
} from '../items/ItemRegistry.js';

import {
    atlasReady,
    ATLAS_TILES
} from '../rendering/TextureAtlas.js';

import {
    getFaceTexture
} from '../rendering/BlockRenderData.js';
import { getRiverPlantFaces } from '../rendering/RiverPlantGeometry.js';
import { pixelPlantIconPixels } from './PixelPlantIcon.js';
import { modelIconPixels } from './ModelIcon.js';
import { getItemModel as getFruitItemModel } from '../rendering/ItemGeometry.js';
import { getTorchInfo } from '../blocks/torches.js';
import { getTorchFaces } from '../rendering/TorchGeometry.js';
import { loadTextureRegionURL } from '../rendering/TextureSheets.js';
import { installUiTextureSheets } from './UiTextureSheets.js';
import { getChestFaces } from '../rendering/ChestGeometry.js';

// ------------------------------------------------------------
// IKONKI BLOKÓW
//
// Dla każdego bloku rysujemy mały sześcian widziany z ukosa
// (góra + dwa boki), z tych samych tekstur co w świecie.
// Wynik to obrazki (data URL), które pasek bloków wstawia
// do <img>. Nowy blok dostaje ikonkę automatycznie. Roślina
// i zwykły przedmiot - płaski obrazek z atlasu. Owoce krzaków mają
// podgląd tego samego modelu 3D, który rośnie na roślinie.
// ------------------------------------------------------------

// Rozmiar ikonki w pikselach (na ekranie może być mniejsza).

const ICON_SIZE = 64;

// Przyciemnienie boków - jak w świecie, gdzie boki są
// ciemniejsze od góry.

const LEFT_SHADE = 0.2;
const RIGHT_SHADE = 0.4;

// Kafelek obrazka atlasu do ikonek (z paczką tekstur - mniejsza kopia,
// najwyżej 64 x 64; oryginalne tekstury - 16 x 16) i czy przy
// zmniejszaniu wygładzać (duże tekstury tak, piksele 16 x 16 nie).
let T = 16;
let smooth = false;


// Rysuje jedną ścianę: kafelek atlasu "naciągnięty" na
// równoległobok podany przez transformację (a, b, c, d, e, f).

function drawFace(ctx, atlas, tileName, transform, shade) {

    const tile = ATLAS_TILES[tileName];

    if (!tile) {
        return;
    }


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

    ctx.imageSmoothingEnabled = smooth;

    const tile = ATLAS_TILES[tileName];

    if (tile?.pw) {

        // Roślina z paczki (obrazek na kilku kafelkach, stoi na dole, na
        // środku): sam obrazek, jak największy w ikonce, w całych
        // pikselach, jeśli się da.

        const unit = T / 16;
        const width = tile.pw * unit;
        const height = tile.ph * unit;
        const sx = tile.x * T + Math.floor(((tile.w ?? 1) * T - width) / 2);
        const sy = tile.y * T + (tile.h ?? 1) * T - height;
        const fit = ICON_SIZE / Math.max(width, height);
        const scale = fit >= 1 ? Math.floor(fit) : fit;
        const dw = width * scale;
        const dh = height * scale;

        ctx.drawImage(atlas, sx, sy, width, height, Math.round((ICON_SIZE - dw) / 2), Math.round((ICON_SIZE - dh) / 2), dw, dh);

    }
    else if (tile) {
        ctx.drawImage(atlas, tile.x * T, tile.y * T, T, T, 0, 0, ICON_SIZE, ICON_SIZE);
    }

    return canvas.toDataURL();

}


// Mała roślina z pikseli (kępka z paczki roślin): model z ukosa,
// rysowany w src/ui/PixelPlantIcon.js (ten sam w wiki).

function pixelPlantIcon(faces) {

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(ICON_SIZE, ICON_SIZE);

    image.data.set(pixelPlantIconPixels(faces, ICON_SIZE));
    ctx.putImageData(image, 0, 0);

    return canvas.toDataURL();

}


// Sylwetki modeli rzecznych: liście, pędy, kolby i kwiaty zachowują
// własny kształt także w małej kratce ekwipunku.
function riverPlantIcon(kind) {

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = ICON_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.scale(4, 4);
    const polygon = (color, points) => {
        ctx.fillStyle = color;
        // Rasterize onto the same 16x16 icon grid, without antialiased slopes.
        for (let y=0; y<16; y++) for (let x=0; x<16; x++) {
            let inside = false;
            for (let i=0, j=points.length-1; i<points.length; j=i++) {
                const [ax,ay]=points[i], [bx,by]=points[j];
                if ((ay>y+.5)!==(by>y+.5) && x+.5 < (bx-ax)*(y+.5-ay)/(by-ay)+ax) inside=!inside;
            }
            if (inside) ctx.fillRect(x,y,1,1);
        }
    };
    const pixel = (color, x, y, w, h) => {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
    };

    if (kind === 'lily' || kind === 'duckweed') {
        for (const [x, y, r] of kind === 'lily' ? [[6, 10, 5], [11, 7, 3]] : [[4, 7, 2], [10, 6, 3], [7, 11, 2], [12, 11, 2]]) {
            polygon('#32754a', [[x-r,y], [x-r+1,y-2], [x+r-1,y-2], [x+r,y], [x+1,y+2], [x,y]]);
            polygon('#68a54e', [[x-r+1,y-1], [x-r+2,y-2], [x+r-1,y-2], [x+r,y], [x+1,y+1], [x,y-1]]);
        }
        if (kind === 'lily') {
            polygon('#e7dce8', [[7,8], [5,6], [7,6], [8,3], [9,6], [12,5], [10,8]]);
            polygon('#fff9ed', [[6,7], [7,5], [8,7], [10,4], [10,7], [12,7], [10,9], [8,9]]);
            pixel('#e6c856', 8, 7, 2, 1);
        }
    }
    else if (kind === 'milfoil') {
        for (const [x, top] of [[4,5], [8,2], [12,6]]) {
            pixel('#508c55', x, top, 1, 13-top);
            for (let y=top+2; y<13; y+=3) {
                polygon('#71a967', [[x,y+1], [x-3,y-1], [x-2,y+1], [x,y+2], [x+3,y-1], [x+2,y+1]]);
            }
        }
    }
    else {
        for (const [x, tip, dx] of [[6,6,-4], [7,3,-2], [8,5,2], [9,7,5], [10,8,2]]) {
            polygon('#397849', [[8,14], [x+dx,tip], [x+dx+1,tip+1], [10,14]]);
            polygon('#74a652', [[8,14], [x+dx,tip], [x+dx+1,tip+2], [9,14]]);
        }
        if (kind === 'cattail') {
            for (const [x, y] of [[6,2], [10,4]]) {
                pixel('#668449', x, y-1, 0.5, 14-y);
                pixel('#563d2e', x-0.5, y, 1.5, 4);
                pixel('#88603c', x-0.5, y, 0.5, 3);
            }
        }
        if (kind === 'loosestrife') {
            for (const [x, top] of [[5,4], [8,1], [11,5]]) {
                pixel('#638249', x, top, 0.5, 14-top);
                for (let y=top; y<top+5; y++) {
                    pixel(y%2 ? '#d28bc2' : '#9f518f', x-(y%2 ? 1:0), y, 1.5, 1);
                }
            }
        }
    }
    return canvas.toDataURL();

}


// Zwraca Map: nazwa bloku albo przedmiotu -> data URL ikonki.

export async function createBlockIcons() {

    await installUiTextureSheets();

    const icons = new Map();

    let atlas;

    // Ten sam obrazek co w świecie (z teksturami paczek drzew i paczką
    // tekstur).

    try {

        const ready = await atlasReady;

        atlas = ready.iconImage;

        T = ready.iconTileSize;

        smooth = T > 16;

    }
    catch (error) {
        console.warn(error);
        return icons;
    }


    const W = ICON_SIZE;

    // Read only the tiles used by model icons, once each. The original atlas
    // can be much taller than these tiny leaf/fruit regions with plant packs.
    const modelTiles = new Map();
    const sampleModelTexture = (name, u, v, out) => {
        if (!modelTiles.has(name)) {
            const tile = ATLAS_TILES[name];
            if (!tile) throw new Error(`Nieznana tekstura modelu: ${name}`);
            const canvas = document.createElement('canvas');
            canvas.width = (tile.w ?? 1) * T; canvas.height = (tile.h ?? 1) * T;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(atlas, tile.x * T, tile.y * T, canvas.width, canvas.height,
                0, 0, canvas.width, canvas.height);
            modelTiles.set(name, ctx.getImageData(0, 0, canvas.width, canvas.height));
        }
        const tile = modelTiles.get(name);
        const x = Math.min(tile.width - 1, Math.max(0, Math.floor(u * tile.width)));
        const y = Math.min(tile.height - 1, Math.max(0, Math.floor(v * tile.height)));
        const i = (y * tile.width + x) * 4;
        for (let channel = 0; channel < 4; channel++) out[channel] = tile.data[i + channel];
    };
    const modelIcon = (faces, texture) => {
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = W;
        const ctx = canvas.getContext('2d'), image = ctx.createImageData(W, W);
        image.data.set(modelIconPixels(faces, W, sampleModelTexture, texture));
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL();
    };

    // Jednostka: ile pikseli ikonki przypada na piksel tekstury
    // wzdłuż krawędzi ściany.

    const u = W / 2 / T;


    for (const [type, definition] of Object.entries(BLOCK_TYPES)) {

        const canvas = document.createElement('canvas');

        canvas.width = W;
        canvas.height = W;

        const ctx = canvas.getContext('2d');

        ctx.imageSmoothingEnabled = smooth;


        const textures = definition.textures;

        const torch = getTorchInfo(type);
        if (torch) {
            icons.set(type, modelIcon(getTorchFaces(torch.colorKey, 'down'), torch.variant.texture));
            continue;
        }

        if (definition.model === 'chest') {
            icons.set(type, modelIcon(getChestFaces(definition.chest.texture), definition.chest.texture));
            continue;
        }

        if (definition.modelIcon) {
            icons.set(type, await loadTextureRegionURL(definition.modelIcon));
            continue;
        }

        if (definition.model === 'riverPlant') {
            icons.set(type, definition.riverPlant.kind.startsWith('fruitBush:')
                ? modelIcon(getRiverPlantFaces(definition.riverPlant.kind, 0), definition.riverPlant.texture)
                : definition.riverPlant.tuft
                ? pixelPlantIcon(getRiverPlantFaces(definition.riverPlant.kind, 0, false, definition.riverPlant.tuft))
                : riverPlantIcon(definition.riverPlant.kind));
            continue;
        }


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
        const fruit = getFruitItemModel(type);
        icons.set(type, fruit ? modelIcon(fruit.faces, fruit.texture) : flatIcon(atlas, item.icon));
    }


    return icons;

}
