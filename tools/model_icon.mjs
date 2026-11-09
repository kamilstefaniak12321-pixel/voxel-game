// Offline counterpart of BlockIcons: same named authoring regions and pure
// model rasterizer as the game, without browser or extra image dependencies.
import { modelIconPixels } from '../src/ui/ModelIcon.js';
import { readTextureRegion } from './texture_regions.mjs';

const images = new Map();
function sampleTexture(name, u, v, rgba) {
    if (!images.has(name)) images.set(name, readTextureRegion(name));
    const image = images.get(name);
    const x = Math.max(0, Math.min(image.width - 1, Math.floor(u * image.width)));
    const y = Math.max(0, Math.min(image.height - 1, Math.floor(v * image.height)));
    const index = (y * image.width + x) * 4;
    rgba.set(image.rgba.subarray(index, index + 4));
}

export function modelIconData(faces, texture = 'snow') {
    return { kind: 'pixels', size: 64,
        data: Buffer.from(modelIconPixels(faces, 64, sampleTexture, texture)).toString('base64') };
}
