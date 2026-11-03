import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// Keep the real atlas packing (all installed plant/tree textures) and UV math.
// Only browser image/GPU initialization is omitted, so the test can reproduce
// the nested-inset bug that an identity UV mock would hide.
const atlasSource = await readFile(new URL('../src/rendering/TextureAtlas.js', import.meta.url), 'utf8');
const layout = atlasSource.slice(0, atlasSource.indexOf('const atlasUrl ='))
    .replace(/^import \* as THREE from 'three';\r?\n/m, '')
    .replace(/^import \{[^\n]+\} from '.\/TexturePacks.js';\r?\n/m, '');
const uvFunction = atlasSource.match(/export function getAtlasUV\([\s\S]+?\r?\n\}/)?.[0];
assert.ok(uvFunction, 'Real atlas UV function found');
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true,
            source: `${layout}\n${uvFunction}\n
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage=()=>null;` };
        return next(url, context);
    }
});
const { buildBlockGeometry } = await import('../src/player/PlayerModel.js');
const { getFruitItemModel } = await import('../src/rendering/FruitBushGeometry.js');
const { getAtlasUV, ATLAS_TILES, ATLAS_COLUMNS, ATLAS_ROWS, ATLAS_TILE_SIZE, ATLAS_UV_INSET } = await import('../src/rendering/TextureAtlas.js');
const model = getFruitItemModel('blueberry'), mesh = buildBlockGeometry('blueberry');
const tile = ATLAS_TILES[model.texture], patchWidth = tile.w * ATLAS_TILE_SIZE, patchHeight = tile.h * ATLAS_TILE_SIZE;
const atlasWidth = ATLAS_COLUMNS * ATLAS_TILE_SIZE, atlasHeight = ATLAS_ROWS * ATLAS_TILE_SIZE;
assert.equal(patchWidth, 64); assert.equal(patchHeight, 64);
assert.ok(ATLAS_ROWS > tile.y, 'Actual packed atlas contains the imported model region');
let oldMappingLeaks = 0;
const oldRegion = getAtlasUV(model.texture);
for (const [faceIndex, face] of model.faces.entries()) {
    const lo = [0, 1].map(axis => Math.floor(Math.min(...face.uv.map(uv => uv[axis])) * (axis ? patchHeight : patchWidth)));
    const hi = [0, 1].map(axis => Math.ceil(Math.max(...face.uv.map(uv => uv[axis])) * (axis ? patchHeight : patchWidth)));
    for (let i = 0; i < 4; i++) {
        const u = mesh.attributes.uv.getX(faceIndex * 4 + i), v = mesh.attributes.uv.getY(faceIndex * 4 + i);
        const pixel = [u * atlasWidth - tile.x * ATLAS_TILE_SIZE, (1 - v) * atlasHeight - tile.y * ATLAS_TILE_SIZE];
        for (let axis = 0; axis < 2; axis++) {
            assert.ok(pixel[axis] > lo[axis] && pixel[axis] < hi[axis], 'Held berry UV stays inside its original opaque face patch');
            const expected = face.uv[i][axis] * (axis ? patchHeight : patchWidth);
            assert.ok(Math.abs(pixel[axis] - expected) < .001, 'Source texel positions survive packing and Float32 upload');
        }
        const oldPixel = [
            (oldRegion.uMin + face.uv[i][0] * (oldRegion.uMax - oldRegion.uMin)) * atlasWidth - tile.x * ATLAS_TILE_SIZE,
            (1 - oldRegion.vMax + face.uv[i][1] * (oldRegion.vMax - oldRegion.vMin)) * atlasHeight - tile.y * ATLAS_TILE_SIZE
        ];
        if (oldPixel.some((p, axis) => p < lo[axis] || p >= hi[axis])) oldMappingLeaks++;
    }
}
assert.ok(oldMappingLeaks > 0, 'Regression reproduces the old nested inset crossing a transparent texel');
mesh.dispose();

// Ordinary block and flat-item UVs keep their original tile inset.
for (const [type, texture] of [['stone', 'stone'], ['spruce_cone', 'spruce_cone']]) {
    const geometry = buildBlockGeometry(type), uv = getAtlasUV(texture), t = ATLAS_TILES[texture];
    assert.ok(Math.abs(uv.uMin * atlasWidth - t.x * ATLAS_TILE_SIZE - ATLAS_UV_INSET) < 1e-8);
    for (let i = 0; i < geometry.attributes.uv.count; i++) {
        const u = geometry.attributes.uv.getX(i), v = geometry.attributes.uv.getY(i);
        assert.ok(u >= uv.uMin - 1e-7 && u <= uv.uMax + 1e-7 && v >= uv.vMin - 1e-7 && v <= uv.vMax + 1e-7);
    }
    geometry.dispose();
}
console.log(`OK: UV owoców — rzeczywisty atlas ${atlasWidth}×${atlasHeight}, brak prześwitów na kostce, zachowany inset zwykłych przedmiotów.`);
