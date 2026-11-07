// Exact coverage/surface regressions plus optional, isolated CPU microbenchmarks.
// The reference paths below reproduce 0.70.0; they are not alternative game code.
// node tools/sprawdz_cache_dalekiego_terenu.mjs [--benchmark]
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            import { Color } from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.3,.4,.2);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});
const THREE = await import('three');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { modifiedChunksInBounds } = await import('../src/world/ModifiedChunks.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { chunkMaskData, chunkMaskUniforms, CHUNK_MASK_SIZE } = await import('../src/rendering/viewUniforms.js');
const { getBlockId, isSolidId, isLiquidId, getLiquidKindId } = await import('../src/blocks/BlockRegistry.js');
const { sampleFarTile } = await import('../src/world/farSamples.js');
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const check = (value, message) => { assert.ok(value, message); checks++; };

function oldModified(world, minCx, minCz, maxCx, maxCz) {
    const result = new Map();
    const inside = (cx, cz) => cx >= minCx && cx <= maxCx && cz >= minCz && cz <= maxCz;
    for (const [key, blocks] of world.savedChunks) {
        const [cx, cz] = key.split(',').map(Number);
        if (inside(cx, cz)) result.set(key, blocks);
    }
    for (const chunk of world.chunks.values()) {
        if (chunk.modified && inside(chunk.cx, chunk.cz)) result.set(`${chunk.cx},${chunk.cz}`, chunk.blocks);
    }
    return result;
}

// Old updateMask, preserving reused output storage and texture invalidation so
// timing never charges an extra allocation only to the baseline.
function oldMask(cameraPosition) {
    const world = this.world;
    const ox = Math.floor(cameraPosition.x / CHUNK_SIZE) - (CHUNK_MASK_SIZE >> 1);
    const oz = Math.floor(cameraPosition.z / CHUNK_SIZE) - (CHUNK_MASK_SIZE >> 1);
    const origin = chunkMaskUniforms.uChunkMaskOrigin.value;
    const version = world.meshVersion ?? 0;
    if (origin.x === ox && origin.y === oz && version === this.maskVersion && this.maskCoverageVersion === this.coverageVersion) return;
    this.maskVersion = version;
    this.maskCoverageVersion = this.coverageVersion;
    origin.set(ox, oz);
    chunkMaskData.fill(0);
    for (const chunk of world.chunks.values()) {
        const i = chunk.cx - ox, j = chunk.cz - oz;
        if (chunk.mesh && i >= 0 && j >= 0 && i < CHUNK_MASK_SIZE && j < CHUNK_MASK_SIZE) chunkMaskData[j * CHUNK_MASK_SIZE + i] = 128;
    }
    for (const tile of this.shown) {
        if (!tile.mesh) continue;
        const x0 = Math.max(0, Math.ceil(tile.x0 / CHUNK_SIZE) - ox);
        const z0 = Math.max(0, Math.ceil(tile.z0 / CHUNK_SIZE) - oz);
        const x1 = Math.min(CHUNK_MASK_SIZE, Math.floor((tile.x0 + tile.size) / CHUNK_SIZE) - ox);
        const z1 = Math.min(CHUNK_MASK_SIZE, Math.floor((tile.z0 + tile.size) / CHUNK_SIZE) - oz);
        for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
            const at = z * CHUNK_MASK_SIZE + x;
            if (chunkMaskData[at] === 128) chunkMaskData[at] = 255;
        }
    }
    chunkMaskUniforms.uChunkMask.value.needsUpdate = true;
    this.shadowRevision++;
}

let randomState = 10973;
function random(max) {
    randomState ^= randomState << 13; randomState ^= randomState >>> 17; randomState ^= randomState << 5;
    return (randomState >>> 0) % max;
}
const world = { savedChunks: new Map(), chunks: new Map(), meshVersion: 1 };
for (let i = 0; i < 1500; i++) {
    const cx = random(151) - 75, cz = random(151) - 75, key = `${cx},${cz}`;
    world.savedChunks.set(key, Uint16Array.of(i));
    if (i % 3 === 0) world.chunks.set(key, { cx, cz, modified: i % 2 === 0, blocks: Uint16Array.of(i + 2000), mesh: {} });
}
for (let n = 0; n < 240; n++) {
    const cx = random(151) - 75, cz = random(151) - 75, size = [0, 1, 4, 16, 150, 4000][n % 6];
    equal(modifiedChunksInBounds(world, cx, cz, cx + size, cz + size), oldModified(world, cx, cz, cx + size, cz + size),
        'Adaptive query preserves negative coordinates, inclusive edges and live edits');
}
world.savedChunks.set('0,0', undefined);
world.savedChunks.set('1,0', null);
equal(modifiedChunksInBounds(world, 0, 0, 1, 0), oldModified(world, 0, 0, 1, 0),
    'Present empty values keep legacy map membership for vegetation suppression');

const probe = { savedChunks: new Map(world.savedChunks), chunks: new Map(world.chunks) };
let savedGets = 0, loadedGets = 0;
probe.savedChunks.get = function (key) { savedGets++; return Map.prototype.get.call(this, key); };
probe.chunks.get = function (key) { loadedGets++; return Map.prototype.get.call(this, key); };
probe.savedChunks[Symbol.iterator] = () => { throw Error('Near tile scanned all historical edits'); };
probe.chunks.values = () => { throw Error('Near tile scanned all loaded chunks'); };
modifiedChunksInBounds(probe, -1, -1, 1, 1);
equal([savedGets, loadedGets], [9, 9], 'Near query visits only its nine chunk coordinates');

class CountedSet extends Set {
    [Symbol.iterator]() { this.walks = (this.walks ?? 0) + 1; return super[Symbol.iterator](); }
}
const shown = new CountedSet();
for (let i = 0; i < 700; i++) shown.add({ x0: (random(65) - 32) * 32, z0: (random(65) - 32) * 32,
    size: [32, 64, 128, 256][i % 4], mesh: i % 11 ? {} : null });
// Include partial and outside cells. They must not claim full near coverage.
shown.add({ x0: -7, z0: -9, size: 23, mesh: {} });
shown.add({ x0: 1e6, z0: -1e6, size: 512, mesh: {} });
const far = Object.assign(Object.create(FarTerrain.prototype), { world, shown, coverageVersion: 1, shadowRevision: 0 });
const reference = { world, shown, coverageVersion: 1, shadowRevision: 0 };
const camera = new THREE.Vector3(0, 60, 0);
function sameMask(message) {
    world.meshVersion++;
    oldMask.call(reference, camera);
    const expected = chunkMaskData.slice();
    far.updateMask(camera);
    equal(chunkMaskData, expected, message);
}
sameMask('First cached mask is byte-identical to 0.70.0');
const walks = shown.walks;
const beforeRemeshTexture = chunkMaskUniforms.uChunkMask.value.version;
const beforeRemeshShadow = far.shadowRevision;
world.meshVersion++;
far.updateMask(camera);
equal(shown.walks, walks, 'New near mesh does not revisit unchanged far coverage');
equal(chunkMaskUniforms.uChunkMask.value.version, beforeRemeshTexture, 'Identical coverage does not upload a replacement texture');
equal(far.shadowRevision, beforeRemeshShadow, 'Identical coverage does not invalidate the far shadow snapshot');
const textureVersion = chunkMaskUniforms.uChunkMask.value.version;
far.updateMask(camera);
equal(chunkMaskUniforms.uChunkMask.value.version, textureVersion, 'Unchanged state does not upload mask again');
for (let n = 0; n < 100; n++) {
    if (n % 3 === 0) {
        camera.set(random(1000) - 500, 60, random(1000) - 500);
    }
    if (n % 4 === 0) {
        const tile = [...shown][random(shown.size)];
        tile.mesh = tile.mesh ? null : {};
        far.coverageVersion++; reference.coverageVersion++;
    }
    const chunk = [...world.chunks.values()][random(world.chunks.size)];
    chunk.mesh = chunk.mesh ? null : {};
    sameMask('Camera, loaded/unloaded mesh and changed coverage preserve every mask byte');
}
equal(far.coverageMask.byteLength, 16384, 'Coverage cache has a fixed 16 KiB bound');
equal(far.nextMask.byteLength, 16384, 'Mask comparison scratch has a fixed 16 KiB bound');

// Run mutations without the oracle touching the shared mask first: actual
// additions/removals and origin changes must still publish and invalidate.
const directChunk = { cx: 0, cz: 0, mesh: {} };
const direct = Object.assign(Object.create(FarTerrain.prototype), {
    world: { chunks: new Map([['0,0', directChunk]]), meshVersion: 1 },
    shown: new Set([{ x0: 0, z0: 0, size: 16, mesh: {} }]), coverageVersion: 1, shadowRevision: 0
});
camera.set(0, 60, 0); direct.updateMask(camera);
const directIndex = () => -chunkMaskUniforms.uChunkMaskOrigin.value.y * CHUNK_MASK_SIZE - chunkMaskUniforms.uChunkMaskOrigin.value.x;
equal(chunkMaskData[directIndex()], 255, 'Direct path initially publishes real near/far overlap');
let previousTexture = chunkMaskUniforms.uChunkMask.value.version, previousShadow = direct.shadowRevision;
directChunk.mesh = null; direct.world.meshVersion++; direct.updateMask(camera);
equal(chunkMaskData[directIndex()], 0, 'Unloading the near mesh clears published coverage');
equal([chunkMaskUniforms.uChunkMask.value.version, direct.shadowRevision], [previousTexture + 1, previousShadow + 1],
    'Changed coverage uploads once and invalidates far shadows once');
directChunk.mesh = {}; direct.world.meshVersion++; direct.updateMask(camera);
equal(chunkMaskData[directIndex()], 255, 'Reloading restores coverage');
direct.shown.clear(); direct.coverageVersion++; direct.updateMask(camera);
equal(chunkMaskData[directIndex()], 128, 'Removing far coverage preserves full nearby geometry');
direct.world.chunks.clear(); direct.world.meshVersion++; direct.updateMask(camera);
previousTexture = chunkMaskUniforms.uChunkMask.value.version; previousShadow = direct.shadowRevision;
camera.x = 16; direct.updateMask(camera);
equal(chunkMaskData.some(Boolean), false, 'Empty scene keeps an empty mask after recentering');
equal([chunkMaskUniforms.uChunkMask.value.version, direct.shadowRevision], [previousTexture + 1, previousShadow + 1],
    'Changing origin still republishes an otherwise identical mask');

// Exact surface descriptors match every full-block column, including an empty
// column, waterlogged plants, highest possible blocks and IDs above 255.
const blocks = new Uint16Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
const materials = ['stone', 'water', 'cattail_water', 'terracotta', 'birch_leaves'];
for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    const column = z * CHUNK_SIZE + x;
    if (column % 13 === 0) continue;
    const y = column % CHUNK_HEIGHT;
    blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = getBlockId(materials[column % materials.length]);
}
blocks[(127 * CHUNK_SIZE + 15) * CHUNK_SIZE + 15] = getBlockId('stone');
const summary = { heights: new Uint8Array(256), materials: new Uint16Array(256) };
for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const id = blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
        if (!isSolidId(id) && !isLiquidId(id)) continue;
        summary.heights[z * CHUNK_SIZE + x] = y + 1;
        summary.materials[z * CHUNK_SIZE + x] = getLiquidKindId(id) || id;
        break;
    }
}
const full = new Map([['-2,3', blocks]]), compact = new Map([['-2,3', summary]]);
for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
    equal(far.modifiedSurface(-32 + x, 48 + z, compact), far.modifiedSurface(-32 + x, 48 + z, full),
        'Compact top layer preserves full-block surface');
}
equal(summary.heights[255], 128, 'Highest top coordinate does not overflow');
const live = Uint16Array.of(99);
const surfaceStore = {
    get() { throw Error('Far terrain must not decode saved blocks'); },
    *entriesIn(...bounds) { equal(bounds, [-3, 2, -1, 4], 'Compact store receives exact query bounds'); yield ['-2,3', summary]; }
};
const compactWorld = { savedChunks: surfaceStore, chunks: new Map() };
equal(modifiedChunksInBounds(compactWorld, -3, 2, -1, 4).get('-2,3'), summary, 'Far tile receives compact surface directly');
compactWorld.chunks.set('-2,3', { cx: -2, cz: 3, blocks: live, modified: true });
equal(modifiedChunksInBounds(compactWorld, -3, 2, -1, 4).get('-2,3'), live, 'Live modifications override stored surface');

const terrain = Object.assign(Object.create(FarTerrain.prototype), {
    world: { savedChunks: full, chunks: new Map() }, workers: [], shown: new Set(),
    tiles: new Map(), requests: new Map(), scene: new THREE.Scene(), shadowRevision: 0,
    shadowSnapshots: new Set(), shadowResourcePool: [], rebuildAll() {}
});
terrain.prepareColors();
const raw = { heights: new Int16Array(18 * 18), kinds: new Uint8Array(18 * 18), materialIds: new Uint16Array(18 * 18) };
sampleFarTile({ farSurface: () => ({ top: 5, kind: 'grass', material: 'grass' }) }, -32, 48, 1, 16,
    raw.heights, raw.kinds, 0, 18, raw.materialIds);
const fullTile = { x0: -32, z0: 48, spacing: 1, cells: 16, size: 16, raw };
terrain.buildMesh(fullTile);
terrain.world.savedChunks = { *entriesIn() { yield ['-2,3', summary]; }, get() { throw Error('Unexpected block decode'); } };
const compactTile = { x0: -32, z0: 48, spacing: 1, cells: 16, size: 16, raw };
terrain.buildMesh(compactTile);
for (const name of Object.keys(fullTile.mesh.geometry.attributes)) equal(compactTile.mesh.geometry.attributes[name].array,
    fullTile.mesh.geometry.attributes[name].array, `Compact save preserves rendered ${name}`);
equal(compactTile.mesh.geometry.index.array, fullTile.mesh.geometry.index.array, 'Compact save preserves triangle topology');
equal(compactTile.geometryBundle.shadowGeometry.index.array, fullTile.geometryBundle.shadowGeometry.index.array,
    'Compact save preserves shadow topology');
terrain.tiles.set('full', fullTile); fullTile.key = 'full';
terrain.tiles.set('compact', compactTile); compactTile.key = 'compact';
terrain.dispose();

console.log(`OK: cache dalekiego terenu — ${checks} kontroli masek, zakresów, warstw powierzchni i identycznej geometrii.`);

if (process.argv.includes('--benchmark')) {
    // CPU-only, deterministic inputs; no rendering and no FPS estimate.
    const records = new Map();
    for (let z = -50; z < 50; z++) for (let x = -50; x < 50; x++) records.set(`${x},${z}`, Uint16Array.of(x + 50, z + 50));
    const benchWorld = { savedChunks: records, chunks: new Map(), meshVersion: 0 };
    for (let z = -14; z <= 14; z++) for (let x = -14; x <= 14; x++) {
        if (x * x + z * z <= 196) benchWorld.chunks.set(`${x},${z}`, { cx: x, cz: z, modified: false, mesh: {} });
    }
    // Non-overlapping 64-block tiles cover the same 128x128 mask rectangle.
    const benchShown = new Set();
    for (let z = -64; z < 64; z += 4) for (let x = -64; x < 64; x += 4) benchShown.add({ x0: x * 16, z0: z * 16, size: 64, mesh: {} });
    const baseline = { world: benchWorld, shown: benchShown, coverageVersion: 1, shadowRevision: 0 };
    const candidate = Object.assign(Object.create(FarTerrain.prototype), { world: benchWorld, shown: benchShown, coverageVersion: 1, shadowRevision: 0 });
    camera.set(0, 60, 0);
    const oldQuery = () => oldModified(benchWorld, -2, -2, 2, 2).size;
    const newQuery = () => modifiedChunksInBounds(benchWorld, -2, -2, 2, 2).size;
    const oldCoverage = () => { benchWorld.meshVersion++; oldMask.call(baseline, camera); return chunkMaskData[8192]; };
    const newCoverage = () => { benchWorld.meshVersion++; candidate.updateMask(camera); return chunkMaskData[8192]; };
    const changingChunk = benchWorld.chunks.values().next().value;
    const oldArrival = () => { changingChunk.mesh = changingChunk.mesh ? null : {}; return oldCoverage(); };
    const newArrival = () => { changingChunk.mesh = changingChunk.mesh ? null : {}; return newCoverage(); };
    let sink = 0;
    function sample(fn, iterations) {
        const start = performance.now();
        for (let n = 0; n < iterations; n++) sink += fn();
        return (performance.now() - start) / iterations;
    }
    function compare(old, current, iterations) {
        for (let i = 0; i < 50; i++) { old(); current(); }
        const before = [], after = [];
        for (let round = 0; round < 9; round++) {
            if (round % 2) { after.push(sample(current, iterations)); before.push(sample(old, iterations)); }
            else { before.push(sample(old, iterations)); after.push(sample(current, iterations)); }
        }
        const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];
        return { beforeMedianMs: median(before), afterMedianMs: median(after), before, after };
    }
    const report = {
        node: process.version, platform: process.platform, arch: process.arch,
        scope: 'CPU microbenchmarks, no GPU rendering; exact 0.70.0 reference methods, alternating 9 pairs after warm-up',
        fixture: { savedChunks: records.size, loadedChunks: benchWorld.chunks.size, shownTiles: benchShown.size, queryChunks: 25 },
        modifiedQuery: compare(oldQuery, newQuery, 80),
        changedCoverageMask: compare(oldArrival, newArrival, 800),
        unchangedCoverageRemesh: compare(oldCoverage, newCoverage, 800),
        sink
    };
    const outputAt = process.argv.indexOf('--output');
    if (outputAt !== -1) {
        assert.ok(process.argv[outputAt + 1], '--output requires a JSON file path');
        const output = resolve(process.argv[outputAt + 1]);
        await mkdir(dirname(output), { recursive: true });
        await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    }
    console.log(JSON.stringify(report, null, 2));
}
