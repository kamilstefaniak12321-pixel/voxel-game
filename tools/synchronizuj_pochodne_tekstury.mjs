// Copy the exact textures produced by the browser/game atlas, not a second
// implementation of bark compositing or stone-head colouring.
// First: node tools/sprawdz_tekstury_drewna_webgl.mjs
// Then:  node tools/synchronizuj_pochodne_tekstury.mjs
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { STONE_TOOL_TEXTURES } from '../src/rendering/StoneToolTextures.js';
import { PINE_BARK_TEXTURES } from '../src/rendering/WoodAtlasTextures.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'test-results/wood-textures/tiles');
const target = resolve(root, 'assets/textures/derived');
const names = [...PINE_BARK_TEXTURES, ...STONE_TOOL_TEXTURES].map(spec => spec.name);
// Validate every input first, so a missing/outdated export cannot partly
// refresh the downloadable texture pack's source images.
for (const name of names) {
    if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid generated tile name: ${name}`);
    const png = await readFile(resolve(source, `${name}.png`));
    if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a'
        || png.readUInt32BE(16) !== 16 || png.readUInt32BE(20) !== 16) {
        throw new Error(`Expected exported 16 × 16 PNG: ${name}`);
    }
}
await mkdir(target, { recursive: true });
for (const name of names) await copyFile(resolve(source, `${name}.png`), resolve(target, `${name}.png`));
console.log(`OK: ${names.length} generated atlas tiles copied for wiki and texture-pack export.`);
