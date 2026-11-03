// Ochrona zapisanych budowli i wykopów przy zmianie generatora rzek.
// Prawdziwe WorldStorage, World, Chunk i FarTerrain; tylko port IndexedDB,
// światło i ładowanie bitmap zastępujemy fixture bez przeglądarki.
// Uruchomienie: node tools/sprawdz_rzeki_zapisy.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { memoryDatabase } from './fixtures/memory-database.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize:16, mipmaps:false });
                export const atlasAveragesReady = Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage = () => new Color(.4, .5, .6);
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { WorldStorage, createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { World } = await import('../src/world/World.js');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { sampleFarTile } = await import('../src/world/farSamples.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE } = await import('../src/config.js');

function worldWith(generator, savedChunks = new Map()) {
    return Object.assign(Object.create(World.prototype), {
        chunks: new Map(), savedChunks, dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
        generator, light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
    });
}

// Dawna dolina z rzeką. Fixture celowo różni się od kolejnego generatora:
// poprawka rzek nie może wypełnić wykopu ani skasować budowli na brzegu.
const oldGenerator = {
    generateChunk(chunk) {
        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                for (let y = 0; y < 47; y++) chunk.setId(x, y, z, getBlockId('stone'));
                if (x < 8) {
                    for (let y = 47; y <= 49; y++) chunk.setId(x, y, z, getBlockId('water'));
                } else chunk.setId(x, 47, z, getBlockId('grass'));
            }
        }
    }
};
const original = worldWith(oldGenerator);
original.generateChunk(0, 0);
original.generateChunk(1, 0); // samo odwiedzenie terenu nie utrwala go w bazie
assert.equal(original.setBlock(10, 75, 10, 'terracotta'), true);
assert.equal(original.setBlock(12, 20, 12, null), true);
const before = original.getChunk(0, 0).blocks.slice();
const storage = new WorldStorage(memoryDatabase());
const info = createWorldInfo('Regresja zapisu rzek', 'river-save-regression', 'realistic', 'creative');
await storage.saveWorldAndChunks(info, original.takeUnsavedChunks());
const saved = await storage.loadChunks(info.id);
assert.deepEqual([...saved.keys()], ['0,0'], 'Odwiedzony, niezmieniony teren nie może blokować poprawki generatora');
// Numery bloków do 255 zapisują się po 1 bajcie (packChunkBlocks, 0.30.0).
assert.ok(saved.get('0,0') instanceof Uint8Array, 'Chunk bez numerów ponad 255 zapisuje się po 1 bajcie');
assert.deepEqual(Uint16Array.from(saved.get('0,0')), before, 'Pełny zapis zachowuje wodę, budowlę i powietrze wykopu');

const generated = [], flowRestored = [];
const nextGenerator = {
    generateChunk(chunk) {
        generated.push([chunk.cx, chunk.cz]);
        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                for (let y = 0; y < 60; y++) chunk.setId(x, y, z, getBlockId('sand'));
            }
        }
    },
    fillFlow(chunk) { flowRestored.push([chunk.cx, chunk.cz]); },
    farSurface() { return { top: 60, kind: 'sand', material: 'sand' }; }
};
const reopened = worldWith(nextGenerator, saved);
const protectedChunk = reopened.generateChunk(0, 0);
assert.deepEqual(protectedChunk.blocks, before, 'Nowy generator nie może nadpisać żadnego bloku zapisanego chunka');
assert.deepEqual(generated, []);
assert.deepEqual(flowRestored, [[0,0]], 'Nurt jest odtwarzany osobno, bez regeneracji bloków');
assert.equal(protectedChunk.modified, true);
reopened.generateChunk(1, 0);
assert.deepEqual(generated, [[1,0]], 'Sąsiedni nietknięty chunk korzysta z nowego generatora');
assert.equal(reopened.getBlock(16, 59, 0), 'sand');
assert.equal(reopened.getBlock(16, 60, 0), null);
assert.equal(reopened.getBlock(10, 75, 10), 'terracotta');
assert.equal(reopened.getBlock(12, 20, 12), null);

// Po odejściu od budowli daleki mesher nadal nakłada zapis na nowy teren.
reopened.unloadChunk(protectedChunk);
const far = Object.assign(Object.create(FarTerrain.prototype), {
    world: reopened, workers: [], rebuildAll() {}, shown: new Set()
});
far.prepareColors();
const cells = CHUNK_SIZE, size = (cells + 2) ** 2;
const raw = { heights: new Int16Array(size), kinds: new Uint8Array(size), materialIds: new Uint16Array(size) };
sampleFarTile(nextGenerator, 0, 0, 1, cells, raw.heights, raw.kinds, 0, cells + 2, raw.materialIds);
const rawCopy = structuredClone(raw);
const tile = { x0: 0, z0: 0, spacing: 1, cells, size: cells, raw };
far.buildMesh(tile);
const positions = tile.mesh.geometry.getAttribute('position').array;
const normals = tile.mesh.geometry.getAttribute('normal').array;
const topLevels = new Set();
for (let i = 0; i < positions.length; i += 4) {
    if (normals[i + 1] === 127) topLevels.add(positions[i + 1]);
}
assert.ok(topLevels.has(76), 'Daleki teren zgubił szczyt budowli');
assert.ok(topLevels.has(50), 'Daleki teren zastąpił zapisaną rzekę nowym podłożem');
assert.ok(!topLevels.has(60), 'Generator nadpisał część zapisanego chunka w dalekim widoku');
assert.deepEqual(raw, rawCopy, 'Nakładanie zapisu nie może zmieniać próbek nowego generatora');
assert.deepEqual(reopened.generateChunk(0, 0).blocks, before, 'Powrót z dalekiego widoku musi zachować zapis');
assert.deepEqual(generated, [[1,0]], 'Zapisany chunk nie może regenerować się po ponownym załadowaniu');
tile.mesh.geometry.dispose();
tile.geometryBundle.shadowGeometry.dispose();

console.log('OK: zapis i ponowne wczytanie rzek, budowli i wykopu; nowy teren obok; ochrona w dalekim widoku.');
