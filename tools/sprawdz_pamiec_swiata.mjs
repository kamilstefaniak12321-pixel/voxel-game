// Real World/Chunk/WorldSaver integration with compact saved snapshots.
// IndexedDB is an isolated in-memory port; light propagation/bitmap loading
// are irrelevant to these save invariants and are replaced by small fixtures.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Worker as NodeWorker } from 'node:worker_threads';
import { memoryDatabase } from './fixtures/memory-database.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const { Scene, PerspectiveCamera } = await import('three');
const { SavedChunkStore } = await import('../src/storage/SavedChunkStore.js');
const { WorldStorage, createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { WorldSaver } = await import('../src/storage/WorldSaver.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { Player } = await import('../src/player/Player.js');
const { summarizeSavedChunk } = await import('../src/world/SavedChunkSurface.js');
const { getBlockId, TRUNCATED_PLANT_IDS } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { PerfDiagnostics } = await import('../src/diagnostics/PerfDiagnostics.js');

let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const layer = CHUNK_SIZE * CHUNK_SIZE;
const cell = (x, y, z) => y * layer + z * CHUNK_SIZE + x;
const compact = () => new SavedChunkStore({ summarize: summarizeSavedChunk, maxDecodedBytes: layer * CHUNK_HEIGHT * 2, maxDecodedEntries: 1 });

function worldWith(saved, terrain = 'flat') {
    const world = new World(new Scene(), 'compact-save-integration', saved, terrain);
    world.light = { initChunk() {}, blockChanged() {}, takeChangedChunks() {} };
    return world;
}

function workerFactory() {
    const worker = new NodeWorker(new URL('./fixtures/chunk-generation-worker.mjs', import.meta.url));
    const adapter = {
        postMessage: (data, transfer) => worker.postMessage(data, transfer),
        terminate: () => worker.terminate()
    };
    worker.on('message', data => adapter.onmessage?.({ data }));
    worker.on('error', error => adapter.onerror?.(error));
    return adapter;
}

async function until(test) {
    const started = performance.now();
    while (!test()) {
        if (performance.now() - started > 15000) throw new Error('Saved-chunk worker did not finish');
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}

const surfaceAt = (saved, cx, cz) => [...saved.entriesIn(cx,cz,cx,cz)][0]?.[1];

function countWrites(saved) {
    const set = saved.set.bind(saved);
    let writes = 0;
    saved.set = (key, blocks) => { writes++; return set(key, blocks); };
    return () => writes;
}

function fixture(Type = Uint16Array, height = CHUNK_HEIGHT) {
    const blocks = new Type(layer * height);
    blocks.fill(getBlockId('stone'), 0, layer * 12);
    // A player-dug cave that a new terrain generator must never fill again.
    for (let y = 4; y < 8; y++) for (let z = 3; z < 9; z++) for (let x = 3; x < 9; x++) blocks[cell(x,y,z)] = 0;
    blocks[cell(4,12,4)] = getBlockId('water');
    blocks[cell(5,12,4)] = getBlockId('cattail_water');
    blocks[cell(7,26,7)] = getBlockId('terracotta');
    if (Type === Uint16Array) blocks[cell(8,13,8)] = getBlockId('indygowiec_etap3');
    return blocks;
}

// Both old half-height Uint8 records and current Uint16 records must follow
// exactly Chunk.loadBlocks' established migration, including truncated plants.
const legacy = fixture(Uint8Array, 64);
const [truncated, restored] = Object.entries(TRUNCATED_PLANT_IDS).find(([, id]) => id > 255);
ok(truncated !== undefined, 'fixture exercises an actual legacy plant migration');
legacy[cell(9,13,9)] = Number(truncated);
const modern = fixture();
const originals = new Map([['-2,-3', legacy], ['5,-7', modern]]);
const store = compact();
for (const [key, blocks] of originals) store.set(key, blocks);
const world = worldWith(store);
let generated = 0;
world.generator.generateChunk = () => { generated++; throw new Error('A saved chunk was regenerated'); };

try {
    for (const [key, blocks] of originals) {
        const [cx, cz] = key.split(',').map(Number);
        const expected = new Chunk(cx, cz);
        ok(expected.loadBlocks(blocks), `${key}: fixture is a valid saved chunk`);
        const chunk = world.ensureColumnLoaded(cx * CHUNK_SIZE + .5, cz * CHUNK_SIZE + .5);
        eq(chunk.blocks, expected.blocks, `${key}: synchronous loading keeps every saved voxel and migration`);
        ok(chunk.modified, `${key}: loaded player changes remain protected`);
        eq(store.stats().decodedBytes, 0, `${key}: copied active chunk releases its decoded cache entry`);
        eq(chunk.getId(4,5,4), 0, `${key}: cave stays empty`);
        eq(chunk.getId(4,12,4), getBlockId('water'), `${key}: saved water stays water`);
        eq(chunk.getId(7,26,7), getBlockId('terracotta'), `${key}: elevated build survives`);
        if (key === '-2,-3') eq(chunk.getId(9,13,9), Number(restored), 'old 8-bit plant ID migrates as before');

        const x = cx * CHUNK_SIZE + 10, z = cz * CHUNK_SIZE + 10;
        ok(world.setBlock(x,30,z,'granite'), `${key}: normal edit after restore works`);
        const edited = chunk.blocks.slice();
        world.unloadChunk(chunk);
        eq(world.getChunk(cx,cz), null, `${key}: chunk is truly unloaded`);
        // Evict the decoded snapshot through other normal accesses.
        for (const other of originals.keys()) store.get(other);
        const revisit = world.ensureColumnLoaded(x,z);
        eq(revisit.blocks, edited, `${key}: revisit after eviction keeps the new edit`);
        world.unloadChunk(revisit);
        eq(store.stats().decodedBytes, 0, `${key}: unloading does not retain a raw block array`);
    }
    eq(generated, 0, 'sync restore never calls the natural generator');

    // The top-layer summary is exactly the old raw-block scan, including
    // waterlogged plants, holes, buildings, and negative coordinates.
    const missesBefore = store.stats().misses;
    const far = Object.assign(Object.create(FarTerrain.prototype), { world });
    for (const key of originals.keys()) {
        const [cx, cz] = key.split(',').map(Number);
        const reference = new Map([[key, store.get(key)]]);
        const modified = far.modifiedChunksIn(cx * CHUNK_SIZE, cz * CHUNK_SIZE, CHUNK_SIZE - 1);
        for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
            const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
            eq(far.modifiedSurface(wx,wz,modified), far.modifiedSurface(wx,wz,reference), `${key}/${x}/${z}: compact far surface is exact`);
        }
    }
    // Only the two explicit oracle reads above are allowed to decode.
    eq(store.stats().misses - missesBefore, originals.size, 'distant summary queries never decode saved blocks');

    // Spawn and restoring a player position are synchronous consumers; they
    // must see a saved surface immediately even with a cold one-entry cache.
    world.spawnPoint = { x: -2 * CHUNK_SIZE + 10.5, z: -3 * CHUNK_SIZE + 10.5 };
    const player = new Player(world, new PerspectiveCamera());
    eq(player.pos.y,31,'player spawns above the saved granite platform');
    player.setState({ x:5 * CHUNK_SIZE + 10.5,y:31,z:-7 * CHUNK_SIZE + 10.5,yaw:0,pitch:0,flying:false });
    eq(player.pos.y,31,'restoring a distant player keeps the saved platform');
    eq(generated,0,'spawn and restored position do not regenerate saved chunks');

    const perf = new PerfDiagnostics();
    perf.lastGame = { world };
    const beforeStats = store.stats();
    const resources = perf.resources();
    eq(resources.savedChunks.encodedBytes,beforeStats.encodedBytes,'diagnostics reports encoded payload');
    eq(store.stats().misses,beforeStats.misses,'diagnostics does not decode any saved record');
} finally {
    world.dispose();
}
eq(store.stats().totalBytes,0,'World.dispose releases encoded data, summaries, and decoded cache');
eq(store.size,0,'World.dispose clears the save index');

// Visiting a saved build must reuse its compressed representation. Migration
// still happens on every load, while its original bytes and far surface stay
// untouched until an actual edit or a conflicting snapshot requires a write.
const visitedStore = compact();
for (const [key, blocks] of originals) visitedStore.set(key,blocks);
const visitWrites = countWrites(visitedStore);
const visitedWorld = worldWith(visitedStore);
try {
    for (const [key, blocks] of originals) {
        const [cx,cz] = key.split(',').map(Number);
        const revision = visitedStore.revision(key), surface = surfaceAt(visitedStore,cx,cz);
        const chunk = visitedWorld.generateChunk(cx,cz);
        ok(chunk.savedSnapshotRevision === revision,`${key}: synchronous restore remembers its exact saved revision`);
        ok(!visitedWorld.setBlock(cx * CHUNK_SIZE,1,cz * CHUNK_SIZE,'stone'),`${key}: unchanged block is a no-op`);
        ok(chunk.savedSnapshotRevision === revision,`${key}: no-op edit preserves saved revision`);
        visitedWorld.unloadChunk(chunk);
        eq(visitWrites(),0,`${key}: unchanged synchronous visit does not recompress`);
        ok(visitedStore.revision(key) === revision,`${key}: unchanged visit preserves snapshot identity`);
        ok(surfaceAt(visitedStore,cx,cz) === surface,`${key}: unchanged visit preserves far surface identity`);
        eq(visitedStore.get(key),blocks,`${key}: unchanged visit preserves original bytes and legacy type`);
        visitedStore.releaseDecoded(key);
    }

    const edited = visitedWorld.generateChunk(-2,-3);
    const oldRevision = visitedStore.revision('-2,-3');
    ok(visitedWorld.setBlock(-2 * CHUNK_SIZE + 10,30,-3 * CHUNK_SIZE + 10,'granite'),'edit after synchronous restore succeeds');
    eq(edited.savedSnapshotRevision,undefined,'actual edit invalidates the reusable snapshot');
    const editedBlocks = edited.blocks.slice();
    visitedWorld.unloadChunk(edited);
    eq(visitWrites(),1,'edited synchronous chunk is compressed exactly once on unload');
    ok(visitedStore.revision('-2,-3') !== oldRevision,'edited chunk gets a new snapshot revision');
    eq(visitedStore.get('-2,-3'),editedBlocks,'edited snapshot includes every migrated and edited block');
    eq(surfaceAt(visitedStore,-2,-3),summarizeSavedChunk(editedBlocks),'edited chunk refreshes the far surface');

    // A live chunk is authoritative even if another caller replaces the old
    // snapshot while it is loaded. The old marker must not skip this write.
    const live = visitedWorld.generateChunk(5,-7);
    const authoritative = live.blocks.slice();
    const replacement = fixture(); replacement[cell(7,32,7)] = getBlockId('basalt');
    visitedStore.set('5,-7',replacement);
    const replacementRevision = visitedStore.revision('5,-7');
    ok(live.savedSnapshotRevision !== replacementRevision,'replaced snapshot differs from live chunk marker');
    const beforeUnload = visitWrites();
    visitedWorld.unloadChunk(live);
    eq(visitWrites(),beforeUnload + 1,'conflicting snapshot forces authoritative live data to be compressed');
    ok(visitedStore.revision('5,-7') !== replacementRevision,'authoritative live data replaces the conflicting revision');
    eq(visitedStore.get('5,-7'),authoritative,'conflicting snapshot cannot silently replace live blocks');
    eq(surfaceAt(visitedStore,5,-7),summarizeSavedChunk(authoritative),'conflicting snapshot cannot leave a stale far surface');
} finally {
    visitedWorld.dispose();
}

// The actual worker must carry the same unchanged-snapshot guarantee through
// request/take/apply, including legacy migration and stale result rejection.
const queuedStore = compact();
for (const [key, blocks] of originals) queuedStore.set(key,blocks);
const queuedWrites = countWrites(queuedStore);
const queuedWorld = worldWith(queuedStore,'realistic');
queuedWorld.enableChunkStreaming({ workerFactory });
async function restoreQueued(cx,cz) {
    ok(queuedWorld.requestGeneratedChunk(cx,cz),'saved chunk request is accepted by the real worker');
    await until(() => queuedWorld.generation.getStats().ready === 1);
    const misses = queuedStore.stats().misses;
    const data = queuedWorld.takeGeneratedChunk(cx,cz);
    ok(data,'real worker result is accepted');
    eq(queuedStore.stats().misses,misses,'taking a worker result does not decode the snapshot again');
    return queuedWorld.applyGeneratedChunk(data);
}
try {
    queuedWorld.generation.start();
    await until(() => queuedWorld.generation.workerReady);
    for (const [key, blocks] of originals) {
        const [cx,cz] = key.split(',').map(Number);
        const revision = queuedStore.revision(key), surface = surfaceAt(queuedStore,cx,cz);
        const chunk = await restoreQueued(cx,cz);
        const expected = new Chunk(cx,cz); expected.loadBlocks(blocks);
        eq(chunk.blocks,expected.blocks,`${key}: real worker restores every migrated saved block`);
        ok(chunk.savedSnapshotRevision === revision,`${key}: worker adoption retains the original snapshot revision`);
        queuedWorld.unloadChunk(chunk);
        eq(queuedWrites(),0,`${key}: unchanged worker visit does not recompress`);
        ok(queuedStore.revision(key) === revision,`${key}: worker visit preserves saved revision`);
        ok(surfaceAt(queuedStore,cx,cz) === surface,`${key}: worker visit preserves far surface identity`);
        eq(queuedStore.get(key),blocks,`${key}: worker visit preserves original saved bytes`);
        queuedStore.releaseDecoded(key);
    }

    const edited = await restoreQueued(5,-7);
    ok(queuedWorld.setBlock(5 * CHUNK_SIZE + 10,30,-7 * CHUNK_SIZE + 10,'granite'),'worker-restored chunk accepts an edit');
    eq(edited.savedSnapshotRevision,undefined,'editing worker-restored chunk invalidates its marker');
    const editedBlocks = edited.blocks.slice();
    queuedWorld.unloadChunk(edited);
    eq(queuedWrites(),1,'edited worker-restored chunk is compressed once');
    eq(queuedStore.get('5,-7'),editedBlocks,'edited worker snapshot retains the newest blocks');
    eq(surfaceAt(queuedStore,5,-7),summarizeSavedChunk(editedBlocks),'worker edit updates its far surface');

    ok(queuedWorld.requestGeneratedChunk(5,-7),'obsolete result fixture starts a real request');
    await until(() => queuedWorld.generation.getStats().ready === 1);
    const newest = editedBlocks.slice(); newest[cell(10,31,10)] = getBlockId('basalt');
    queuedStore.set('5,-7',newest);
    const newestRevision = queuedStore.revision('5,-7'), newestSurface = surfaceAt(queuedStore,5,-7);
    const writesBeforeStale = queuedWrites();
    eq(queuedWorld.takeGeneratedChunk(5,-7),null,'obsolete worker result is rejected after saved snapshot replacement');
    eq(queuedWorld.getChunk(5,-7),null,'obsolete result never installs a live chunk');
    eq(queuedWrites(),writesBeforeStale,'rejecting obsolete result cannot overwrite the newer snapshot');
    const newestChunk = await restoreQueued(5,-7);
    eq(newestChunk.blocks,newest,'next real worker request restores the newer snapshot');
    ok(newestChunk.savedSnapshotRevision === newestRevision,'fresh result uses the newer revision');
    queuedWorld.unloadChunk(newestChunk);
    eq(queuedWrites(),writesBeforeStale,'fresh unchanged snapshot is not recompressed after stale-job recovery');
    ok(surfaceAt(queuedStore,5,-7) === newestSurface,'stale-job recovery preserves the newer far surface');
} finally {
    queuedWorld.dispose();
}

// Autosave frequently revisits all dirty live chunks. Selecting their latest
// identities must not first decode the old saved record for every position.
const liveStore = compact();
const liveWorld = worldWith(liveStore);
const liveSaver = new WorldSaver(null,{id:'live-save-selection'},liveWorld,{getState:()=>({})});
try {
    const live = [], old = [];
    for (let n = 0; n < 100; n++) {
        const cx = n - 50, cz = 12;
        liveStore.set(`${cx},${cz}`,fixture());
        live.push(liveWorld.generateChunk(cx,cz));
        old.push({cx,cz,blocks:new Uint16Array([0]),modified:true});
    }
    const before = liveStore.stats();
    const selected = liveSaver.latestChunks(old);
    eq(selected.length,100,'autosave selects all live chunks');
    for (let n = 0; n < live.length; n++) ok(selected[n] === live[n],`autosave returns live identity ${n}`);
    eq(liveStore.stats().misses,before.misses,'autosave does not decode stale snapshots of live chunks');
    eq(liveStore.stats().decodedBytes,before.decodedBytes,'autosave selection leaves decoded cache bytes unchanged');
    eq(liveStore.stats().decodedEntries,before.decodedEntries,'autosave selection leaves decoded cache entries unchanged');
} finally {
    liveSaver.stop();
    liveWorld.dispose();
}

// Malformed disk records retain the established fallback rather than causing
// the compact-store reader to refuse the entire world at startup.
eq(summarizeSavedChunk(null),null,'null snapshot has no compact surface');
eq(summarizeSavedChunk(undefined),null,'missing snapshot has no compact surface');
const invalids = [null,new Uint16Array(257).fill(getBlockId('stone')),
    new Uint16Array(layer * (CHUNK_HEIGHT + 1)).fill(getBlockId('water'))];
const invalidStore = compact();
const invalidMap = new Map();
for (let n = 0; n < invalids.length; n++) {
    invalidStore.set(`${n},-12`,invalids[n]);
    invalidMap.set(`${n},-12`,invalids[n]);
}
const compactInvalidWorld = worldWith(invalidStore), mapInvalidWorld = worldWith(invalidMap);
const generatedInvalid = [0,0];
for (const [index, target] of [compactInvalidWorld,mapInvalidWorld].entries()) {
    target.generator.generateChunk = chunk => {
        generatedInvalid[index]++;
        chunk.setId(2,5,3,getBlockId('granite'));
    };
}
const previousWarn = console.warn;
console.warn = () => {};
try {
    for (let n = 0; n < invalids.length; n++) {
        eq(compactInvalidWorld.generateChunk(n,-12).blocks,mapInvalidWorld.generateChunk(n,-12).blocks,
            `invalid record ${n} keeps the established regeneration fallback`);
    }
    eq(generatedInvalid,[invalids.length,invalids.length],'invalid compact and raw records fall back equally');
} finally {
    console.warn = previousWarn;
    compactInvalidWorld.dispose();
    mapInvalidWorld.dispose();
}

// Delayed save A fails after the same position has become edited chunk B.
// The retry must choose B even when it has also been unloaded and evicted.
const db = new WorldStorage(memoryDatabase());
const savingStore = compact();
savingStore.set('-4,6',fixture());
const savingWorld = worldWith(savingStore);
const info = createWorldInfo('Isolated save race', 'compact-save-race', 'flat', 'creative');
let failFirst;
let calls = 0;
const backend = {
    saveWorldAndChunks(...args) {
        calls++;
        if (calls === 1) return new Promise((_,reject) => { failFirst = reject; });
        return db.saveWorldAndChunks(...args);
    }
};
const saver = new WorldSaver(backend,info,savingWorld,{ getState:() => ({x:-54,y:32,z:106}) });
saver.onDiagnostic = () => {};
const wx = -4 * CHUNK_SIZE + 10, wz = 6 * CHUNK_SIZE + 10;
try {
    ok(savingWorld.setBlock(wx,30,wz,'granite'),'first live edit creates chunk A');
    const a = savingWorld.getChunk(-4,6);
    const firstSave = saver.save();
    eq(savingWorld.unsavedChunks.size,0,'A is in a real active save batch');
    savingWorld.unloadChunk(a);
    ok(savingWorld.setBlock(wx,30,wz,'basalt'),'reloaded chunk B receives a newer edit');
    const b = savingWorld.getChunk(-4,6);
    ok(a !== b,'race really uses different chunk objects');
    savingWorld.unloadChunk(b);
    savingStore.releaseDecoded('-4,6');
    failFirst(new Error('forced write failure'));
    eq(await firstSave,false,'failed write remains visibly failed');
    ok(savingWorld.hasUnsavedChanges(),'failed write retains edits for retry');
    eq(await saver.flush(),true,'retry completes');
    const disk = await db.loadChunks(info.id);
    eq(disk.get('-4,6')[cell(10,30,10)],getBlockId('basalt'),'retry writes newest unloaded B, never stale A');
    eq(savingWorld.unsavedChunks.size,0,'successful retry drains pending edits');
    eq(saver.activeBatches.size,0,'successful retry releases active snapshots');
    eq(savingWorld.ensureColumnLoaded(wx,wz).getId(10,30,10),getBlockId('basalt'),'revisit after failed/retried save keeps B');
} finally {
    saver.stop();
    savingWorld.dispose();
}

// Reopening the actual saved representation again after the world is disposed
// demonstrates that cache lifetime is separate from durable storage lifetime.
const reopened = await db.loadSavedChunks(info.id,{ summarize:summarizeSavedChunk, maxDecodedBytes:0 });
eq(reopened.get('-4,6')[cell(10,30,10)],getBlockId('basalt'),'new saved-store instance restores committed B');
eq(reopened.stats().decodedBytes,0,'zero cache still allows correct cold synchronous reads');
reopened.dispose();

console.log(`OK: pamięć świata — ${checks} sprawdzeń migracji, odczytu/edycji, powrotu, powierzchni, gracza, diagnostyki i ponawiania zapisu.`);
