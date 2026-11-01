// Offline counterpart of BlockIcons' atlas sampler. The renderer is the same
// pure module used by the game; no browser or extra image dependency is needed.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { FIRE_WOODS } from '../src/game/CampfireState.js';
import { modelIconPixels } from '../src/ui/ModelIcon.js';

const sources = {
    'models/blueberry/atlas': { file: '../assets/models/blueberry/atlas.png', x: 0, y: 0, width: 64, height: 64 },
    snow: { file: '../assets/textures/blocks/terrain.png', x: 4 * 16, y: 9 * 16, width: 16, height: 16 }
};
for (const [wood, [, file]] of Object.entries(FIRE_WOODS)) sources[`campfire_${wood}`] = {
    file: `../assets/models/campfire/drewno-${file}.png`, x: 0, y: 0, width: 32, height: 32
};
const images = new Map();

// The two checked-in sources are non-interlaced 8-bit RGBA PNGs. Reject other
// formats explicitly instead of silently producing wrong documentation icons.
function readRgbaPng(file) {
    const png = readFileSync(new URL(file, import.meta.url));
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        png[24] !== 8 || png[25] !== 6 || png[28] !== 0) {
        throw new Error(`Podgląd modeli wymaga PNG RGBA 8-bit bez przeplotu: ${file}`);
    }
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20), parts = [];
    for (let p = 8; p + 12 <= png.length;) {
        const length = png.readUInt32BE(p);
        if (p + length + 12 > png.length) throw new Error(`Uszkodzony PNG: ${file}`);
        if (png.toString('ascii', p + 4, p + 8) === 'IDAT') parts.push(png.subarray(p + 8, p + 8 + length));
        p += length + 12;
    }
    const stride = width * 4, raw = inflateSync(Buffer.concat(parts));
    if (raw.length !== height * (stride + 1)) throw new Error(`Nieprawidłowe dane PNG: ${file}`);
    const data = new Uint8Array(width * height * 4);
    const paeth = (a, b, c) => {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let y = 0; y < height; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4) throw new Error(`Nieznany filtr PNG: ${file}`);
        for (let x = 0; x < stride; x++) {
            const p = y * stride + x, a = x >= 4 ? data[p - 4] : 0;
            const b = y ? data[p - stride] : 0, c = y && x >= 4 ? data[p - stride - 4] : 0;
            const predictor = filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0;
            data[p] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
        }
    }
    return { width, height, data };
}

function sampleTexture(name, u, v, rgba) {
    const source = sources[name];
    if (!source) throw new Error(`Nieznana tekstura podglądu modelu: ${name}`);
    if (!images.has(source.file)) images.set(source.file, readRgbaPng(source.file));
    const image = images.get(source.file);
    const x = source.x + Math.max(0, Math.min(source.width - 1, Math.floor(u * source.width)));
    const y = source.y + Math.max(0, Math.min(source.height - 1, Math.floor(v * source.height)));
    const index = (y * image.width + x) * 4;
    rgba.set(image.data.subarray(index, index + 4));
}

export function modelIconData(faces, texture = 'snow') {
    return { kind: 'pixels', size: 64,
        data: Buffer.from(modelIconPixels(faces, 64, sampleTexture, texture)).toString('base64') };
}
