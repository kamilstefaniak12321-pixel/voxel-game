// Runtime geometry must match the original combined output, including water
// inside plants, while budgeted jobs can yield/interleave without corruption.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const { BufferGeometry } = await import('three');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { applyPlantModelLevel } = await import('../src/rendering/PlantModelLevels.js');
const { createChunkGeometryJob, buildChunkGeometry, setLeafParts, setAmbientOcclusion } =
    await import('../src/rendering/ChunkMesher.js');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };

function fixture(cx = 0) {
    const chunks = new Map();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const chunk = new Chunk(cx + dx, dz);
        chunks.set(`${chunk.cx},${chunk.cz}`, chunk);
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
            chunk.setId(x, 4, z, getBlockId('dirt'));
            if (x < 4 && z < 4) chunk.setId(x, 5, z, getBlockId('water'));
        }
        chunk.skyLight.fill(14 - Math.abs(dx));
        chunk.lightR.fill(8 + Math.abs(dz));
        chunk.lightG.fill(5);
        chunk.tint = new Uint8Array(17 * 17 * 3).fill(130 + cx);
        chunk.flow = new Int8Array(16 * 16 * 2).fill(8 + cx);
    }
    const chunk = chunks.get(`${cx},0`);
    for (const [x, z, name] of [[0, 0, 'water_lily'], [1, 1, 'water_milfoil'],
        [2, 2, 'cattail_water'], [3, 3, 'duckweed'], [5, 5, 'short_grass'],
        [6, 6, 'tall_grass'], [7, 7, 'indygowiec_etap3'], [8, 8, 'barwinek_etap3'],
        [9, 9, 'oak_leaves'], [10, 10, 'stone']]) {
        const id = getBlockId(name);
        assert.ok(id, name);
        chunk.setId(x, 5, z, id);
    }
    chunk.setId(12, 5, 12, 97); // Adult blueberry, fixed save-compatible ID.
    return { chunk, world: { getChunk: (x, z) => chunks.get(`${x},${z}`),
        experiments: { bushyGrass: false }, getGrassDetail: () => 0 } };
}

function materialData(geometry, materialIndex, name) {
    const group = geometry?.groups.find(group => group.materialIndex === materialIndex);
    if (!group) return [];
    const attribute = geometry.attributes[name];
    const start = group.start / 6 * 4 * attribute.itemSize;
    return Array.from(attribute.array.subarray(start, start + group.count / 6 * 4 * attribute.itemSize));
}

function sameGeometry(actual, expected, label) {
    equal(actual.groups, expected.groups, `${label}: groups`);
    equal(actual.index.array, expected.index.array, `${label}: topology`);
    for (const name of Object.keys(expected.attributes)) {
        equal(actual.attributes[name].array, expected.attributes[name].array, `${label}: ${name}`);
    }
}

const a = fixture(), b = fixture(6);
applyPlantModelLevel('detailed');
setLeafParts(true);
setAmbientOcclusion(.45);
for (const bushyGrass of [false, true]) {
    a.world.experiments.bushyGrass = bushyGrass;
    const combined = buildChunkGeometry(a.chunk, a.world);
    const terrain = buildChunkGeometry(a.chunk, a.world, { terrain: true, plants: false });
    const plants = buildChunkGeometry(a.chunk, a.world, { terrain: false, plants: true });
    check(terrain.groups.every(group => group.count > 0 && group.materialIndex !== 1), 'Terrain has no plant/empty draws');
    check(plants.groups.every(group => group.count > 0 && group.materialIndex === 1), 'Plants have only a real plant draw');
    for (const group of combined.groups) for (const name of Object.keys(combined.attributes)) {
        equal(materialData(group.materialIndex === 1 ? plants : terrain, group.materialIndex, name),
            materialData(combined, group.materialIndex, name), `Split material ${group.materialIndex} ${name}, grass=${bushyGrass}`);
    }
    equal(terrain.index.count + plants.index.count, combined.index.count, 'Splitting neither loses nor duplicates faces');
    check(materialData(terrain, 2, 'position').length > 0, 'Waterlogged plants retain their water in terrain');
    check(plants.attributes.position.count < combined.attributes.position.count, 'Plant storage excludes terrain');
    for (const geometry of [combined, terrain, plants]) geometry.dispose();
}
a.world.experiments.bushyGrass = false;

// Each step gets a deterministic finite number of clock checks. Different
// chunk lighting/tints/flow and an intervening synchronous call detect scratch
// state leakage that a serial completion test would miss.
const expectedTerrain = buildChunkGeometry(a.chunk, a.world, { terrain: true, plants: false });
const expectedPlants = buildChunkGeometry(b.chunk, b.world, { terrain: false, plants: true });
const terrainJob = createChunkGeometryJob(a.chunk, a.world, { terrain: true, plants: false });
const plantJob = createChunkGeometryJob(b.chunk, b.world, { terrain: false, plants: true });
let terrainResult, plantResult, slices = 0, clock = 0;
const realNow = Object.getOwnPropertyDescriptor(performance, 'now');
Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
try {
    equal(terrainJob.step(clock - 1), { done: false, geometry: null }, 'Expired budget starts no work');
    do {
        terrainResult = terrainJob.step(clock + 13);
        plantResult = plantJob.step(clock + 17);
        if (slices++ === 3) buildChunkGeometry(b.chunk, b.world)?.dispose();
    } while ((!terrainResult.done || !plantResult.done) && slices < 2000);
} finally {
    if (realNow) Object.defineProperty(performance, 'now', realNow);
    else delete performance.now;
}
check(slices > 3 && slices < 2000, `Work yields and completes (${slices} slices)`);
sameGeometry(terrainResult.geometry, expectedTerrain, 'Interleaved terrain');
sameGeometry(plantResult.geometry, expectedPlants, 'Interleaved plants');

// Cancellation during attribute copying disposes partial output; no geometry or
// animation binding may be published before installation by World.
const originalSet = BufferGeometry.prototype.setAttribute;
const originalDispose = BufferGeometry.prototype.dispose;
let copying = false, disposals = 0;
BufferGeometry.prototype.setAttribute = function (...args) { copying = true; return originalSet.apply(this, args); };
BufferGeometry.prototype.dispose = function (...args) { disposals++; return originalDispose.apply(this, args); };
const cancelled = createChunkGeometryJob(a.chunk, a.world, { terrain: true, plants: true });
clock = 0;
Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
try {
    let attempts = 0;
    while (!copying && attempts++ < 10000) cancelled.step(clock + 2);
    check(copying, 'Cancellation fixture reaches staged attribute copy');
    cancelled.cancel();
    equal(disposals, 1, 'Canceled partial BufferGeometry is disposed');
    equal(cancelled.step(Infinity), { done: true, geometry: null }, 'Canceled geometry cannot appear later');
} finally {
    BufferGeometry.prototype.setAttribute = originalSet;
    BufferGeometry.prototype.dispose = originalDispose;
    if (realNow) Object.defineProperty(performance, 'now', realNow);
    else delete performance.now;
}

// Empty terrain/plant outputs do not create placeholder meshes or empty draws.
const empty = new Chunk(0, 0);
equal(createChunkGeometryJob(empty, a.world).step(Infinity).geometry, null, 'Empty terrain is null');
const onlyWater = new Chunk(0, 0);
onlyWater.setId(4, 4, 4, getBlockId('water'));
equal(createChunkGeometryJob(onlyWater, a.world, { terrain: false, plants: true }).step(Infinity).geometry,
    null, 'Water alone creates no plant geometry');
for (const geometry of [terrainResult.geometry, plantResult.geometry, expectedTerrain, expectedPlants]) geometry.dispose();
console.log(`OK: mesher partiami — ${checks} sprawdzeń zgodności, budżetu, przeplatania i anulowania.`);
