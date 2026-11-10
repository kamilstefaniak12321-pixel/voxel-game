// Copy the exact textures produced by the browser/game atlas, not a second
// implementation of bark compositing or stone-head colouring.
// First: node tools/sprawdz_tekstury_drewna_webgl.mjs
// Then:  node tools/synchronizuj_pochodne_tekstury.mjs
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { STONE_TOOL_TEXTURES } from '../src/rendering/StoneToolTextures.js';
import { PINE_BARK_TEXTURES } from '../src/rendering/WoodAtlasTextures.js';
import { decodeTexturePng, textureManifest, textureRegionKey, writeTextureRegion } from './texture_regions.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'test-results/wood-textures/tiles');
const names = [...PINE_BARK_TEXTURES, ...STONE_TOOL_TEXTURES].map(spec => spec.name);
const outputs = [];
// Validate every input first, so a missing/outdated export cannot partly
// refresh the downloadable texture pack's source images.
for (const name of names) {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid generated tile name: ${name}`);
    const png = await readFile(resolve(source, `${name}.png`));
    if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a'
        || png.readUInt32BE(16) !== 16 || png.readUInt32BE(20) !== 16) {
        throw new Error(`Expected exported 16 × 16 PNG: ${name}`);
    }
    const key = textureRegionKey(`assets/textures/derived/${name}.png`);
    const region = textureManifest().regions[key];
    if (region.width !== 16 || region.height !== 16) throw new Error(`Expected 16 × 16 region: ${key}`);
    outputs.push({ key, image: decodeTexturePng(png) });
}
for (const { key, image } of outputs) writeTextureRegion(key, image);
console.log(`OK: ${names.length} generated regions updated in themed sheets for wiki and texture-pack export.`);
