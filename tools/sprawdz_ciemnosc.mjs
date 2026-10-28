// Rzeczywisty mesher, materiały, rejestr bloków i krzywe światła;
// pominięte jest wyłącznie pobieranie bitmap atlasu przez przeglądarkę.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false });
                export const atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null;
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { buildChunkGeometry, setAmbientOcclusion } = await import('../src/rendering/ChunkMesher.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { atmosphericLightToBrightness } = await import('../src/rendering/LightPolicy.js');
const { lightToBrightness, MAX_LIGHT } = await import('../src/world/Light.js');
const { AMBIENT_OCCLUSION } = await import('../src/config.js');

const world = { getChunk: () => null };
const fixture = (type, sky = 0, red = 0) => {
    const chunk = new Chunk(0, 0);
    const id = getBlockId(type);
    assert.notEqual(id, 0, `Brak bloku ${type}`);
    chunk.setId(8, 8, 8, id);
    chunk.skyLight.fill(sky);
    chunk.lightR.fill(red);
    return chunk;
};
const geometryOf = chunk => {
    const geometry = buildChunkGeometry(chunk, world);
    assert.ok(geometry);
    const classic = geometry.getAttribute('color');
    const atmosphere = geometry.getAttribute('atmosphereLight');
    assert.equal(atmosphere.count, classic.count);
    assert.equal(atmosphere.itemSize, 4);
    assert.equal(atmosphere.normalized, true);
    assert.ok(atmosphere.array instanceof Uint8Array);
    return { geometry, classic: classic.array, atmosphere: atmosphere.array };
};

assert.equal(atmosphericLightToBrightness(0), 0);
assert.equal(atmosphericLightToBrightness(MAX_LIGHT), 1);
assert.ok(lightToBrightness(0) > 0, 'Klasyczny model zachowuje minimum');

// Każda ścieżka meshera: sześcian, roślina, płaska dekoracja,
// liście i półprzezroczysta woda mają zerowe światło bez źródła.
for (const type of ['stone', 'tall_grass', 'oak_leaf_litter', 'oak_leaves', 'water']) {
    const dark = geometryOf(fixture(type));
    assert.ok(dark.classic.some(v => v > 0), `${type}: klasyczny model utracił jasność`);
    assert.ok(dark.atmosphere.every(v => v === 0), `${type}: sztuczne światło bez źródła`);
    dark.geometry.dispose();

    const red = geometryOf(fixture(type, 0, 255));
    assert.ok(red.atmosphere.some((v, i) => i % 4 === 0 && v > 0), `${type}: brak czerwonej lampy`);
    assert.ok(red.atmosphere.every((v, i) => i % 4 === 0 || v === 0), `${type}: lampa dodaje obce kanały lub niebo`);
    red.geometry.dispose();

    const day = geometryOf(fixture(type, MAX_LIGHT));
    assert.ok(day.atmosphere.some((v, i) => i % 4 === 3 && v > 0));
    assert.ok(day.atmosphere.every((v, i) => i % 4 === 3 ? v === day.classic[i] : v === 0), `${type}: pełne niebo lub brak lampy zmieniły znaczenie`);
    day.geometry.dispose();
}

// Emisyjna powierzchnia nadal jest jasna sama z siebie.
const emitting = geometryOf(fixture('lamp_red'));
assert.deepEqual(emitting.atmosphere, emitting.classic);
emitting.geometry.dispose();

// AO jest liczone przed zapisem obu modeli. Przy całkowicie zasłoniętym
// rogu nie powstaje NaN/przeciek; powrót ustawienia odtwarza te same dane.
const corner = fixture('stone', 7, 80);
corner.setId(7, 9, 8, getBlockId('stone'));
corner.setId(8, 9, 7, getBlockId('stone'));
const before = geometryOf(corner);
setAmbientOcclusion(1);
const occluded = geometryOf(corner);
assert.ok(occluded.atmosphere.some((v, i) => v < before.atmosphere[i]));
setAmbientOcclusion(AMBIENT_OCCLUSION);
const restored = geometryOf(corner);
assert.deepEqual(restored.classic, before.classic);
assert.deepEqual(restored.atmosphere, before.atmosphere);
for (const sample of [before, occluded, restored]) sample.geometry.dispose();

console.log('OK: zerowe światło bez źródeł, oba atrybuty jednego mesha, rośliny/dekoracje/liście/woda, kolorowe lampy, emisja i AO.');
