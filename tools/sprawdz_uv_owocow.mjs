import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// Keep the real atlas packing (all installed plant/tree textures) and UV math.
// Only browser image/GPU initialization is omitted, so the test can reproduce
// the nested-inset bug that an identity UV mock would hide.
const atlasSource = await readFile(new URL('../src/rendering/TextureAtlas.js', import.meta.url), 'utf8');
const layout = atlasSource.slice(0, atlasSource.indexOf('export const blockAtlasTexture ='))
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
                export const blockAtlasTexture=null,atlasAverageTexture=null,getTileMask=()=>null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage=()=>null;` };
        return next(url, context);
    }
});
const { buildBlockGeometry } = await import('../src/player/PlayerModel.js');
const { getFruitItemModel } = await import('../src/rendering/FruitBushGeometry.js');
const { getAtlasUV, ATLAS_TILES, ATLAS_COLUMNS, ATLAS_ROWS, ATLAS_TILE_SIZE, ATLAS_UV_INSET } = await import('../src/rendering/TextureAtlas.js');
const atlasWidth = ATLAS_COLUMNS * ATLAS_TILE_SIZE, atlasHeight = ATLAS_ROWS * ATLAS_TILE_SIZE;

// Owoce krzaków: model z krzaka zostaje na roślinie (prawdziwy atlas,
// region 64 x 64 borówki), ale od 1.28.0 w ręce i w ekwipunku owoc jest
// płaską ikonką (tools/owoce_ikony.py) - decyzja Kamila.
const model = getFruitItemModel('blueberry'), tile = ATLAS_TILES[model.texture];
assert.equal(tile.w * ATLAS_TILE_SIZE, 64); assert.equal(tile.h * ATLAS_TILE_SIZE, 64);
assert.ok(ATLAS_ROWS > tile.y, 'Actual packed atlas contains the imported model region');

// Ordinary block and flat-item UVs keep their original tile inset.
for (const [type, texture] of [['stone', 'stone'], ['spruce_cone', 'spruce_cone'], ['blueberry', 'blueberry'], ['strawberry', 'strawberry'],
    ['blackberry', 'blackberry'], ['chili_pepper', 'chili_pepper'], ['hazelnut', 'hazelnut']]) {
    const geometry = buildBlockGeometry(type), uv = getAtlasUV(texture), t = ATLAS_TILES[texture];
    assert.ok(Math.abs(uv.uMin * atlasWidth - t.x * ATLAS_TILE_SIZE - ATLAS_UV_INSET) < 1e-8);
    for (let i = 0; i < geometry.attributes.uv.count; i++) {
        const u = geometry.attributes.uv.getX(i), v = geometry.attributes.uv.getY(i);
        assert.ok(u >= uv.uMin - 1e-7 && u <= uv.uMax + 1e-7 && v >= uv.vMin - 1e-7 && v <= uv.vMax + 1e-7);
    }
    geometry.dispose();
}
console.log(`OK: UV owoców — rzeczywisty atlas ${atlasWidth}×${atlasHeight}, model borówki na krzaku, owoce w ręce z płaskiej ikonki (1.28.0), zachowany inset zwykłych przedmiotów.`);
