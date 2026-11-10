import { TEXTURE_SHEETS, TEXTURE_REGIONS, TEXTURE_ALIASES, WORLD_ATLAS_TILES } from './TextureSheetData.js';

// The PNG sheets are the editable source of truth. Cropping happens once,
// before upload; shaders, repeating UI backgrounds and player skins keep
// their original local UV coordinates and never sample neighbouring regions.
const sheets = new Map(), regions = new Map(), urls = new Map(), bitmaps = new Map();

export function textureRegionKey(value) {
    let key = String(value).replaceAll('\\', '/');
    const start = key.indexOf('/assets/');
    if (start >= 0) key = key.slice(start + 1);
    const seen = new Set();
    while (TEXTURE_ALIASES[key] && TEXTURE_ALIASES[key] !== key) {
        if (seen.has(key)) throw new Error(`Cyclic texture alias: ${key}`);
        seen.add(key); key = TEXTURE_ALIASES[key];
    }
    return key;
}

export function regionInfo(key) {
    const region = TEXTURE_REGIONS[textureRegionKey(key)];
    if (!region) throw new Error(`Nieznana tekstura w atlasach: ${key}`);
    return region;
}

export function loadTextureSheet(id) {
    if (sheets.has(id)) return sheets.get(id);
    const spec = TEXTURE_SHEETS[id];
    if (!spec) return Promise.reject(new Error(`Nieznany arkusz: ${id}`));
    const promise = new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => image.width === spec.width && image.height === spec.height
            ? resolve(image) : reject(new Error(`Arkusz ${spec.file} musi mieć ${spec.width} × ${spec.height} pikseli`));
        image.onerror = () => reject(new Error(`Nie udało się wczytać arkusza ${spec.file}`));
        image.src = new URL(`../../assets/textures/${spec.file}`, import.meta.url).href;
    }).catch(error => { sheets.delete(id); throw error; });
    sheets.set(id, promise);
    return promise;
}

export function loadTextureRegion(value) {
    const key = textureRegionKey(value);
    if (regions.has(key)) return regions.get(key);
    const spec = regionInfo(key);
    const promise = loadTextureSheet(spec.sheet).then(image => {
        const canvas = document.createElement('canvas');
        canvas.width = spec.width; canvas.height = spec.height;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(image, spec.x, spec.y, spec.width, spec.height, 0, 0, spec.width, spec.height);
        return canvas;
    }).catch(error => { regions.delete(key); throw error; });
    regions.set(key, promise);
    return promise;
}

export function loadTextureRegionURL(value) {
    const key = textureRegionKey(value);
    if (!urls.has(key)) urls.set(key, loadTextureRegion(key).then(canvas => canvas.toDataURL('image/png')).catch(error => {
        urls.delete(key); throw error;
    }));
    return urls.get(key);
}

// Partially transparent emissive sprites must keep unpremultiplied RGB.
// An intermediate Canvas2D crop quantizes those colours before GPU upload.
// ImageBitmap also needs the vertical orientation baked in: WebGL ignores
// UNPACK_FLIP_Y_WEBGL for bitmaps, unlike ordinary HTMLImageElement textures.
export function loadTextureRegionBitmap(value, flipY = false) {
    const key = textureRegionKey(value), cacheKey = `${key}:${flipY}`;
    if (bitmaps.has(cacheKey)) return bitmaps.get(cacheKey);
    const spec = regionInfo(key);
    const promise = loadTextureSheet(spec.sheet).then(image => createImageBitmap(
        image, spec.x, spec.y, spec.width, spec.height,
        { premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: flipY ? 'flipY' : 'none' }
    )).catch(error => { bitmaps.delete(cacheKey); throw error; });
    bitmaps.set(cacheKey, promise);
    return promise;
}

export async function drawWorldTextureAtlas(context, tileSize = 16) {
    const entries = Object.entries(WORLD_ATLAS_TILES);
    const used = [...new Set(entries.map(([, tile]) => regionInfo(tile.region).sheet))];
    const images = new Map(await Promise.all(used.map(async id => [id, await loadTextureSheet(id)])));
    context.imageSmoothingEnabled = false;
    for (const [, tile] of entries) {
        const source = regionInfo(tile.region);
        context.drawImage(images.get(source.sheet), source.x, source.y, source.width, source.height,
            tile.x * tileSize, tile.y * tileSize, (tile.w ?? 1) * tileSize, (tile.h ?? 1) * tileSize);
    }
}
