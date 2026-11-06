// Geometry LOD must remove work, preserve species/materials and never corrupt
// a nearby animation or another incremental job's selected level.
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

const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { PLANT_MODELS } = await import('../src/blocks/plantModels.js');
const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const { applyPlantModelLevel } = await import('../src/rendering/PlantModelLevels.js');
const { PlantAnimations } = await import('../src/rendering/PlantAnimations.js');
const { createChunkGeometryJob, buildChunkGeometry, setLeafParts, setFastLeaves } =
    await import('../src/rendering/ChunkMesher.js');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const allocated = [];
const keep = geometry => { allocated.push(geometry); return geometry; };
const worldFor = chunk => ({ getChunk: (x, z) => x === chunk.cx && z === chunk.cz ? chunk : null,
    experiments: { bushyGrass: false }, getGrassDetail: () => 0,
    markPlantsDirty: c => { c.plantRevision++; } });
const single = name => {
    const chunk = new Chunk(0, 0);
    chunk.setId(8, 8, 8, typeof name === 'number' ? name : getBlockId(name));
    chunk.skyLight.fill(15);
    chunk.tint = new Uint8Array(17 * 17 * 3).fill(137);
    return chunk;
};
const build = (chunk, options) => keep(buildChunkGeometry(chunk, worldFor(chunk), options));
const bounds = geometry => { geometry.computeBoundingBox(); return [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()]; };
const values = (geometry, name) => [...new Set(geometry.attributes[name].array)].sort((a, b) => a - b);
function sameGeometry(a, b, label) {
    equal(a.groups, b.groups, label + ': groups');
    equal(a.index.array, b.index.array, label + ': topology');
    for (const name of Object.keys(b.attributes)) equal(a.attributes[name].array, b.attributes[name].array, label + ': ' + name);
}

setLeafParts(true); setFastLeaves(false);
const leafCounts = [];
for (const species of ['oak_leaves', 'birch_leaves', 'pine_leaves']) {
    const chunk = single(species);
    const levels = [0, 1, 2].map(leafDetail => build(chunk, { terrain: true, leafDetail }));
    equal(levels.map(g => g.userData.leafDetail), [0, 1, 2], 'Published leaf detail metadata');
    check(levels[0].index.count > levels[1].index.count && levels[1].index.count > levels[2].index.count,
        species + ': each farther level reduces actual geometry');
    equal(levels[2].index.count, 36, species + ': final leaf envelope has six faces');
    for (const geometry of levels) {
        equal(bounds(geometry), bounds(levels[0]), species + ': all levels retain original outer silhouette bounds');
        equal(values(geometry, 'tint'), values(levels[0], 'tint'), species + ': climate tint retained');
        equal(values(geometry, 'surfaceProfile'), values(levels[0], 'surfaceProfile'), species + ': leaf material retained');
        equal(values(geometry, 'color'), values(levels[0], 'color'), species + ': uniform light retained');
        check(geometry.attributes.uv.array.every(n => n >= 0 && n <= 1), species + ': UV remains inside species tile');
        equal(geometry.groups.map(group => group.materialIndex), [3], species + ': cutout/shadow material retained');
    }
    sameGeometry(levels[0], build(chunk, { terrain: true }), species + ': omitted detail retains original near output');
    leafCounts.push(levels.map(g => g.index.count / 6));
}

const crown = new Chunk(0, 0);
for (let x = 5; x <= 11; x++) for (let y = 5; y <= 11; y++) for (let z = 5; z <= 11; z++) crown.setId(x, y, z, getBlockId('oak_leaves'));
crown.skyLight.fill(15);
const crowns = [0, 1, 2].map(leafDetail => build(crown, { terrain: true, leafDetail }));
check(crowns[0].index.count > crowns[1].index.count && crowns[1].index.count > crowns[2].index.count, 'Dense crown costs less at every level');
for (const leafDetail of [0, 1, 2]) {
    const chunk = single('oak_leaves');
    chunk.setId(9, 8, 8, getBlockId('stone'));
    const geometry = build(chunk, { terrain: true, leafDetail });
    const group = geometry.groups.find(g => g.materialIndex === 3);
    const normals = geometry.attributes.normal.array;
    for (let i = group.start / 6 * 4; i < (group.start + group.count) / 6 * 4; i++)
        check(normals[i * 3] !== 1, 'Leaf face next to opaque stone is culled at every level');
}

setLeafParts(false);
const cube = single('oak_leaves');
const userSimple = build(cube, { terrain: true, leafDetail: 0 });
for (const leafDetail of [1, 2]) sameGeometry(build(cube, { terrain: true, leafDetail }), userSimple, 'Distance never upgrades simple user leaves');
setLeafParts(true);

applyPlantModelLevel('detailed');
const plant = single('indygowiec_etap3');
const plantId = getBlockId('indygowiec_etap3');
const originalKind = blockRenderData[plantId].riverPlant.kind;
const plantLevels = [0, 1, 2].map(plantDetail => build(plant, { terrain: false, plants: true, plantDetail }));
equal(plantLevels.map(g => g.userData.plantDetail), [0, 1, 2], 'Published plant detail metadata');
check(plantLevels[0].index.count > plantLevels[1].index.count && plantLevels[1].index.count > plantLevels[2].index.count,
    'Species-specific cards reduce detailed plant cost at each level');
equal(blockRenderData[plantId].riverPlant.kind, originalKind, 'Distance models do not mutate global model registry');
for (const geometry of plantLevels) {
    equal(geometry.groups.map(group => group.materialIndex), [1], 'Plant batch material retained');
    check(geometry.attributes.position.array.every(Number.isFinite), 'LOD plant positions stay finite');
}
applyPlantModelLevel('simple');
const userSimplePlant = build(plant, { terrain: false, plants: true, plantDetail: 0 });
for (const plantDetail of [1, 2]) sameGeometry(build(plant, { terrain: false, plants: true, plantDetail }), userSimplePlant,
    'Distance never upgrades simple user plants');
applyPlantModelLevel('detailed');

// The catalogue mixes tiny aquatic models, large shrubs and tall flower stems.
// A generic LOD must not accidentally replace a cheap species with more faces.
for (const model of PLANT_MODELS) for (const stage of model.stages) {
    const chunk = single(stage.type);
    const counts = [0, 1, 2].map(plantDetail => {
        const geometry = buildChunkGeometry(chunk, worldFor(chunk), { terrain: false, plants: true, plantDetail });
        const count = geometry?.index.count ?? 0;
        geometry?.dispose();
        return count;
    });
    check(counts[1] <= counts[0] && counts[2] <= counts[1], stage.type + ': distance never adds geometry');
    check(counts[0] === 0 || counts[2] > 0, stage.type + ': a visible species is not dropped by LOD');
}

// Water is canonical terrain even when its aquatic model is replaced by cards.
const aquatic = single('water_milfoil');
const water = build(aquatic, { terrain: true, plants: false, plantDetail: 0 });
for (const plantDetail of [1, 2]) {
    sameGeometry(build(aquatic, { terrain: true, plants: false, plantDetail }), water, 'Aquatic LOD never alters water');
    const geometry = build(aquatic, { terrain: false, plants: true, plantDetail });
    check(geometry.groups.every(g => g.materialIndex === 1), 'Aquatic LOD does not duplicate water into plant layer');
}

// Options are copied at job creation; interleaved levels cannot leak through
// module scratch buffers, and canceling a far job cannot change a nearby job.
const chunk = single('oak_leaves'), world = worldFor(chunk);
chunk.setId(5, 8, 5, plantId);
const jobs = [0, 1, 2].map(detail => {
    const options = { terrain: true, plants: true, leafDetail: detail, plantDetail: detail };
    const job = createChunkGeometryJob(chunk, world, options);
    options.leafDetail = options.plantDetail = 2 - detail;
    return job;
});
const expected = [0, 1, 2].map(detail => build(chunk, { terrain: true, plants: true, leafDetail: detail, plantDetail: detail }));
let clock = 0;
const realNow = Object.getOwnPropertyDescriptor(performance, 'now');
Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
const results = [];
try {
    for (let turn = 0; turn < 10000 && results.filter(Boolean).length < 3; turn++) {
        const index = turn % 3;
        if (!results[index]) { const r = jobs[index].step(clock + 3); if (r.done) results[index] = keep(r.geometry); }
    }
    const canceled = createChunkGeometryJob(chunk, world, { terrain: true, plants: true, leafDetail: 2, plantDetail: 2 });
    canceled.step(clock + 8); canceled.cancel();
    equal(canceled.step(Infinity), { done: true, geometry: null }, 'Canceled LOD publishes no geometry');
} finally {
    if (realNow) Object.defineProperty(performance, 'now', realNow); else delete performance.now;
}
equal(results.length, 3, 'Every interleaved job completes');
for (let i = 0; i < 3; i++) sameGeometry(results[i], expected[i], 'Interleaved level ' + i + ' is stable');

// An active near clip may travel into a lower-detail chunk before it ends.
// Its binding still requires the original topology at every requested level.
const bush = single(94), bushWorld = worldFor(bush);
bush.plantMesh = { geometry: buildChunkGeometry(bush, bushWorld, { terrain: false, plants: true }) };
const animations = new PlantAnimations(bushWorld, { position: { x: 8, y: 9, z: 8 } });
animations.blockChanged(bush, bush.index(8, 8, 8), 0, 94);
const fullClip = buildChunkGeometry(bush, bushWorld, { terrain: false, plants: true, plantDetail: 0 });
for (const plantDetail of [1, 2]) {
    const geometry = buildChunkGeometry(bush, bushWorld, { terrain: false, plants: true, plantDetail });
    sameGeometry(geometry, fullClip, 'Active animation topology retained at plant detail ' + plantDetail);
    geometry.dispose();
}
fullClip.dispose(); bush.plantMesh.geometry.dispose(); animations.dispose();
for (const geometry of allocated) geometry?.dispose();
console.log(`OK: modele odległe — ${checks} sprawdzeń; liście ${leafCounts[0].join(' → ')} ścian, rośliny ${plantLevels.map(g => g.index.count / 6).join(' → ')} ścian.`);
