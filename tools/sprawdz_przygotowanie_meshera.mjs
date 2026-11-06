import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const { Scene } = await import('three');
const { World } = await import('../src/world/World.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry, prepareChunkPlantGeometry } = await import('../src/rendering/ChunkMesher.js');
const { clearPlantMeshTemplates } = await import('../src/rendering/PlantMeshTemplate.js');
const { getRiverPlantFaces, riverPlantCacheStats } = await import('../src/rendering/RiverPlantGeometry.js');
const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const world = new World(new Scene(), 3, new Map(), 'classic');
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
    const chunk = world.createChunk(x, z);
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) chunk.setId(lx, 9, lz, getBlockId('dirt'));
    chunk.skyLight.fill(15);
}
const chunk = world.getChunk(0, 0);
world.markDirty(chunk);
world.updateMeshes();
const originalMesh = chunk.mesh, originalGeometry = originalMesh.geometry;
for (const x of [1, 4, 8, 12]) chunk.setId(x, 10, 8, getBlockId('indygowiec_etap3'));
world.markDirty(chunk);
clearPlantMeshTemplates();
let terrainCommits = 0, plantCommits = 0;
const install = world.installChunkGeometry.bind(world);
world.installChunkGeometry = (c, geometry, kind) => {
    if (kind === 'terrain') terrainCommits++; else plantCommits++;
    return install(c, geometry, kind);
};
let checks = 0;
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

world.updateMeshes(performance.now() - 1);
equal(terrainCommits, 0, 'An expired budget cannot start a dense rebuild');
equal(chunk.mesh.geometry, originalGeometry, 'The old mesh stays visible');
equal(world.dirtyChunks.has(chunk), true, 'The rebuild remains queued');

// Force actual scan/copy yields, not only template warming. An edit after the
// first slice invalidates both cursors, including any captured padded lights.
const realNow = Object.getOwnPropertyDescriptor(performance, 'now');
let clock = 0, ticks = 0;
Object.defineProperty(performance, 'now', { configurable: true, value: () => clock += .02 });
try {
    world.updateMeshes(clock + .1);
    equal(terrainCommits, 0, 'A tiny slice cannot publish a partially built mesh');
    equal(chunk.mesh.geometry, originalGeometry, 'Preparation is read-only');
    chunk.setId(1, 10, 8, getBlockId('marzanna_etap3'));
    chunk.setId(2, 11, 8, getBlockId('cattail'));
    world.markDirty(chunk);
    while ((world.dirtyChunks.size || world.dirtyPlants.size) && ticks++ < 1000) world.updateMeshes(clock + 4);
    equal(world.dirtyChunks.size, 0, 'Terrain cursor eventually completes');
    equal(world.dirtyPlants.size, 0, 'Plant cursor eventually completes');
    equal(terrainCommits, 1, 'Only current terrain is published');
    equal(plantCommits, 1, 'Only current plants are published');
} finally {
    if (realNow) Object.defineProperty(performance, 'now', realNow);
    else delete performance.now;
}
assert.ok(ticks > 0 && ticks < 1000); checks++;
equal(chunk.mesh, originalMesh, 'Terrain mesh identity stays stable');
equal(chunk.shadowMesh.geometry, chunk.mesh.geometry, 'Terrain shadows update together');
equal(chunk.plantShadowMesh.geometry, chunk.plantMesh.geometry, 'Plant shadows share the new buffer');
for (const [kind, mesh] of [['terrain', chunk.mesh], ['plants', chunk.plantMesh]]) {
    const expected = buildChunkGeometry(chunk, world, { terrain: kind === 'terrain', plants: kind === 'plants' });
    for (const name of Object.keys(expected.attributes)) {
        equal(mesh.geometry.attributes[name].array, expected.attributes[name].array, `Current ${kind}/${name}, including edits during slices`);
    }
    equal(mesh.geometry.index.array, expected.index.array, `Current ${kind} topology`);
    expected.dispose();
}
world.markDirty(chunk);
world.updateMeshes();
equal(terrainCommits, 2, 'Unbudgeted loading also completes terrain');
equal(plantCommits, 2, 'Unbudgeted loading also completes plants');
const floor = world.getChunk(-1, -1);
let paddingReads = 0;
const getChunk = world.getChunk.bind(world);
world.getChunk = (...args) => { paddingReads++; return getChunk(...args); };
equal(prepareChunkPlantGeometry(floor, world, performance.now() + 1000), true, 'Preparation completes');
const firstReads = paddingReads;
assert.ok(firstReads > 0); checks++;
equal(prepareChunkPlantGeometry(floor, world, performance.now() + 1000), true, 'Completed preparation remains ready');
equal(paddingReads, firstReads, 'Ready chunks do not repeatedly rescan under small budgets');
buildChunkGeometry(floor, world)?.dispose();
prepareChunkPlantGeometry(floor, world, performance.now() + 1000);
assert.ok(paddingReads > firstReads); checks++;
world.dispose();

// Neighbor masks are deterministic derived data, not a permanently growing
// world history. Keep an active reference while forcing template eviction.
const tuft = blockRenderData[getBlockId('indygowiec_etap3')].riverPlant;
const retained = getRiverPlantFaces(tuft.kind, 0, false, tuft.tuft, 0);
const snapshot = structuredClone(retained);
for (let mask = 1; mask <= 180; mask++) {
    getRiverPlantFaces(tuft.kind, mask & 7, false, tuft.tuft, mask);
    const stats = riverPlantCacheStats();
    assert.ok(stats.faces <= stats.maxFaces && stats.models <= stats.maxModels); checks++;
}
equal(retained, snapshot, 'Eviction does not mutate active animation references');
const recreated = getRiverPlantFaces(tuft.kind, 0, false, tuft.tuft, 0);
assert.notEqual(recreated, retained); checks++;
equal(recreated, snapshot, 'Recreated clipped model has exactly the same faces');
console.log(`OK: przygotowanie meshera — ${checks} sprawdzeń budżetu, postępu, edycji i atomowej zmiany geometrii.`);
