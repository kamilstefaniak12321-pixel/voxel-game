// Independent fluid rules and lifecycle regressions. The simulation uses real
// Chunk storage; the final cases also exercise World and the real terrain worker.
// Only image loading is stubbed, as in the existing save integration checks.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Worker as NodeWorker } from 'node:worker_threads';

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

const { Scene } = await import('three');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { SavedChunkStore } = await import('../src/storage/SavedChunkStore.js');
const { summarizeSavedChunk } = await import('../src/world/SavedChunkSurface.js');
const { packChunkBlocks } = await import('../src/storage/WorldStorage.js');
const { generationTransfers } = await import('../src/world/ChunkGenerationData.js');
const { WaterSimulation, WATER_STEP_SECONDS, WATER_MAX_UPDATES, WATER_MAX_CHANGES,
    WATER_MAX_SCAN_CELLS } = await import('../src/world/WaterSimulation.js');
const { getBlockId, getWaterLevel, WATER_SOURCE_ID: SOURCE, WATER_FALLING_ID: FALLING,
    waterIdForLevel, isWaterSourceId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE: S, CHUNK_HEIGHT: H, WORLD_BORDER } = await import('../src/config.js');

const LAYER = S * S, STONE = getBlockId('stone');
const cell = (x, y, z) => y * LAYER + z * S + x;
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };

// A loaded-only port: attempting an implicit generation or a write outside the
// supplied chunks is a hard failure, including when a simulation runs at edges.
function grid(coordinates = [[0,0]], fillHeight = 1) {
    const chunks = new Map(), writes = [];
    const world = {
        chunks, writes, getChunk: (cx,cz) => chunks.get(`${cx},${cz}`) ?? null,
        generateChunk() { throw new Error('Water tried to generate an unloaded chunk'); },
        setFluidBlock(x,y,z,id) {
            const previous = world.fluids.read(x,y,z);
            const changed = put(x,y,z,id);
            if (changed) { writes.push([x,y,z,id]); world.fluids.blockChanged(x,y,z,previous); }
            return changed;
        },
        flushFluidChanges() {}
    };
    world.fluids = new WaterSimulation(world, { now: () => 0 });
    function add(cx,cz,height = fillHeight, notify = false) {
        const chunk = new Chunk(cx,cz);
        for (let y = 0; y < height; y++) for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) chunk.setId(x,y,z,STONE);
        chunks.set(`${cx},${cz}`,chunk);
        for (const [field,opposite,dx,dz] of [['west','east',-1,0],['east','west',1,0],['north','south',0,-1],['south','north',0,1]]) {
            chunk[field] = world.getChunk(cx+dx,cz+dz);
            if (chunk[field]) chunk[field][opposite] = chunk;
        }
        if (notify) world.fluids.chunkLoaded(chunk);
        return chunk;
    }
    function put(x,y,z,id) {
        const cx = Math.floor(x/S), cz = Math.floor(z/S), chunk = world.getChunk(cx,cz);
        assert.ok(chunk && y >= 0 && y < H, `write must remain loaded: ${x},${y},${z}`);
        return chunk.setId(x-cx*S,y,z-cz*S,id);
    }
    function edit(x,y,z,id) {
        const previous = world.fluids.read(x,y,z), changed = put(x,y,z,id);
        if (changed) world.fluids.blockChanged(x,y,z,previous);
        return changed;
    }
    for (const [cx,cz] of coordinates) add(cx,cz);
    return Object.assign(world, { add, put, edit, read: (x,y,z) => world.fluids.read(x,y,z) });
}

const neighborhood = () => Array.from({length:9},(_,n) => [n%3-1,Math.floor(n/3)-1]);

function step(world, dt = WATER_STEP_SECONDS, cap = WATER_MAX_UPDATES) {
    world.fluids.update(dt, 1, cap);
    const s = world.fluids.stats();
    ok(s.lastProcessed <= WATER_MAX_UPDATES, 'one frame exceeds the cell-update cap');
    ok(s.lastChanges <= WATER_MAX_CHANGES, 'one frame exceeds the voxel-write cap');
    ok(s.lastScanCells <= WATER_MAX_SCAN_CELLS, 'one frame exceeds the scan cap');
    const counted = [...world.fluids.ready.values(), ...world.fluids.next.values()].reduce((n,q) => n+q.size,0);
    eq(s.pending,counted,'pending counter must match retained queue entries');
    for (const [chunk,ready] of world.fluids.ready) {
        const next = world.fluids.next.get(chunk);
        if (next) for (const index of ready) ok(!next.has(index),'a voxel must not be queued in both waves');
    }
    return s;
}

function settle(world, label, maxFrames = 1000) {
    for (let frame = 0; frame < maxFrames; frame++) {
        const stats = step(world);
        if (!stats.pending && !stats.scans) return frame + 1;
    }
    assert.fail(`${label} did not settle: ${JSON.stringify(world.fluids.stats())}`);
}

function countWater(world) {
    let count = 0;
    for (const chunk of world.chunks.values()) for (const id of chunk.blocks) if (getWaterLevel(id) >= 0) count++;
    return count;
}

// Per-column metadata shares the existing set/load pass. It must include every
// water representation and remain conservative when an extreme cell is removed.
{
    const chunk = new Chunk(0,0);
    eq(chunk.waterBounds,null,'a new dry chunk allocates no water metadata');
    chunk.setId(3,12,4,STONE);
    eq(chunk.waterBounds,null,'ordinary terrain does not allocate water metadata');
    const states = [SOURCE,...Array.from({length:8},(_,n) => waterIdForLevel(n+1)),
        ...['water_milfoil','water_lily','duckweed','cattail_water'].map(getBlockId)];
    for (let x = 0; x < states.length; x++) {
        chunk.setId(x,0,2,states[x]); chunk.setId(x,H-1,2,states[x]);
        const column = 2*S+x;
        eq(chunk.waterBounds[column],1,`state ${states[x]} includes the bottom layer`);
        eq(chunk.waterBounds[LAYER+column],H,`state ${states[x]} includes the top layer`);
    }
    ok(chunk.waterBounds instanceof Uint8Array,'water metadata uses a byte array');
    eq(chunk.waterBounds.byteLength,512,'water metadata stays fixed at 512 bytes per wet chunk');
    chunk.setId(0,0,2,0);
    chunk.setId(0,H-1,2,0);
    ok(chunk.waterBounds[2*S] <= 1 && chunk.waterBounds[LAYER+2*S] >= H,'removal keeps conservative bounds without a rescan');
    const restored = new Chunk(0,0);
    ok(restored.loadBlocks(chunk.blocks),'metadata fixture reloads');
    eq(restored.waterBounds[2*S],0,'loading reconstructs tight bounds for a now-dry column');
    eq(restored.waterBounds[LAYER+2*S],0,'loading clears the old maximum for a dry column');
    for (let x = 1; x < states.length; x++) {
        eq(restored.waterBounds[2*S+x],1,'loading includes each retained bottom water cell');
        eq(restored.waterBounds[LAYER+2*S+x],H,'loading includes each retained top water cell');
    }
    const legacy = new Uint8Array(LAYER*64); legacy[cell(4,63,5)] = SOURCE;
    restored.loadBlocks(legacy);
    eq(restored.waterBounds[5*S+4],64,'old half-height Uint8 source builds the correct lower bound');
    eq(restored.waterBounds[LAYER+5*S+4],64,'old half-height Uint8 source builds the correct upper bound');
    restored.loadBlocks(new Uint16Array(LAYER*H));
    eq(restored.waterBounds,null,'reloading a dry snapshot releases old water metadata');
    const dry = grid([[0,0]],H);
    dry.fluids.chunkLoaded(dry.getChunk(0,0));
    eq(step(dry).lastScanCells,0,'known-dry full-height terrain requires no bootstrap scan');
}

// A single source on a flat floor reaches exactly seven horizontal steps.
// The oracle is the Manhattan distance, independent of the queue algorithm.
{
    const world = grid(neighborhood());
    world.edit(8,1,8,SOURCE);
    settle(world,'flat spreading');
    for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
        const distance = Math.abs(dx)+Math.abs(dz);
        eq(getWaterLevel(world.read(8+dx,1,8+dz)),distance <= 7 ? distance : -1,`flat radius ${dx},${dz}`);
    }
    eq(countWater(world),113,'one source fills exactly the radius-seven diamond');
    const before = world.fluids.stats();
    for (let n = 0; n < 20; n++) {
        const stats = step(world);
        eq([stats.lastProcessed,stats.lastChanges,stats.lastScanCells],[0,0,0],'settled water has zero cell work');
    }
    eq(world.fluids.stats().changes,before.changes,'idle updates create no repeated writes');
    world.edit(8,1,8,0);
    settle(world,'draining the last source');
    eq(countWater(world),0,'all downstream levels disappear after the last source is removed');
}

// A tall waterfall counts its fall block by block and stays at the cap.
{
    const world = grid(neighborhood());
    world.edit(8,30,8,SOURCE);
    settle(world,'tall waterfall');
    eq(world.read(8,29,8),FALLING,'first falling block counts one');
    eq(world.read(8,14,8),FALLING + 15,'sixteen blocks of fall');
    eq(world.read(8,1,8),FALLING + 15,'longer falls stay at the cap');
    ok(getWaterLevel(FALLING + 15) === 8,'every falling state is a full water cell');
}

// Downward channels take priority; lateral spreading starts only at their floor.
{
    const world = grid(neighborhood());
    world.edit(8,8,8,SOURCE);
    settle(world,'waterfall');
    for (let y = 1; y < 8; y++) eq(world.read(8,y,8),FALLING + 7 - y,`falling column y=${y} counts ${8 - y} blocks of fall`);
    const landings = [];
    world.fluids.forEachLanding(8.5, 8.5, 4, (x, y, z, fall) => landings.push([x, y, z, fall]));
    eq(landings,[[8,1,8,7]],'the bottom of the waterfall is registered with its fall height');
    for (let y = 2; y <= 8; y++) for (const [dx,dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        eq(world.read(8+dx,y,8+dz),0,'a free downward route suppresses lateral spill');
    }
    eq(world.read(9,1,8),waterIdForLevel(1),'the waterfall spreads after reaching a floor');
    world.edit(8,8,8,0);
    settle(world,'draining waterfall');
    const drained = [];
    world.fluids.forEachLanding(8.5, 8.5, 4, (...landing) => drained.push(landing));
    eq(drained,[],'a drained waterfall has no splash left');
    eq(countWater(world),0,'a falling column never becomes its own source');
}

// A narrow channel leaves no ambiguous paths around the three tested cells.
function sourceChannel({ support = STONE, neighbors = SOURCE, above = 0 } = {}) {
    const world = grid([[0,0]],3);
    world.put(7,2,8,neighbors); world.put(9,2,8,neighbors); world.put(8,2,8,0);
    world.put(8,1,8,support); world.put(8,3,8,above);
    world.fluids.enqueue(8,2,8);
    return world;
}
{
    const world = sourceChannel();
    settle(world,'supported regeneration');
    eq(world.read(8,2,8),SOURCE,'two adjacent sources regenerate over solid support');
    const sourceSupport = sourceChannel({support:SOURCE});
    settle(sourceSupport,'pool regeneration');
    eq(sourceSupport.read(8,2,8),SOURCE,'source water below is valid regeneration support');
    const unsupported = sourceChannel({support:0});
    settle(unsupported,'unsupported pair');
    ok(!isWaterSourceId(unsupported.read(8,2,8)),'two sources over air cannot regenerate a third');
    const transient = sourceChannel({neighbors:waterIdForLevel(1)});
    settle(transient,'transient neighbors');
    ok(!isWaterSourceId(transient.read(8,2,8)),'flowing neighbors never count as sources');
    const one = sourceChannel(); one.put(9,2,8,STONE);
    settle(one,'one source');
    eq(one.read(8,2,8),waterIdForLevel(1),'one source produces a flow level, not another source');
}

// Broad edit notifications include ordinary plants; dry plants must not turn
// into air merely because their cell was checked by the simulation.
{
    const world = grid();
    const plant = getBlockId('short_grass');
    world.put(8,1,8,plant);
    world.fluids.blockChanged(8,1,8);
    eq(world.fluids.stats().pending,0,'unrelated dry edits do not wake the water queue');
    world.fluids.enqueue(8,1,8);
    settle(world,'dry plant');
    eq(world.read(8,1,8),plant,'queued dry plant is retained');
    eq(world.writes.length,0,'dry-neighborhood inspection writes no blocks');
    for (const type of ['water_milfoil','water_lily','duckweed','cattail_water']) {
        const aquatic = grid(neighborhood()), id = getBlockId(type);
        aquatic.edit(8,1,8,id);
        settle(aquatic,`${type} source`);
        eq(aquatic.read(8,1,8),id,`${type} is never replaced by plain water`);
        eq(aquatic.read(9,1,8),waterIdForLevel(1),`${type} retains its existing source water`);
    }
}

// Unknown chunks are neither empty space nor evidence that a saved upstream
// disappeared. Loading the neighbor then activates its old adjoining bank.
{
    const world = grid();
    world.put(S-1,1,8,waterIdForLevel(3));
    world.fluids.enqueue(S-1,1,8);
    settle(world,'unknown upstream');
    eq(world.read(S-1,1,8),waterIdForLevel(3),'unloaded upstream freezes a persisted edge flow');
    eq(world.chunks.size,1,'simulation never creates missing chunks');
    world.add(1,0,1,true);
    settle(world,'loaded dry upstream');
    eq(world.read(S-1,1,8),0,'flow revalidates after its missing upstream becomes loaded');

    const bank = grid();
    bank.put(S-1,1,8,SOURCE);
    bank.fluids.chunkLoaded(bank.getChunk(0,0));
    settle(bank,'bank with unknown neighbor');
    eq(bank.chunks.size,1,'exposed source bank cannot load its neighbor');
    bank.add(1,0,1,true);
    settle(bank,'new neighbor bank');
    eq(bank.read(S,1,8),waterIdForLevel(1),'loading an empty neighbor wakes an existing source bank');
    eq(bank.chunks.size,2,'boundary spreading remains in the two supplied chunks');

    const returning = grid(neighborhood());
    returning.edit(S-1,1,8,SOURCE);
    settle(returning,'upstream before unload');
    const upstream = returning.getChunk(0,0);
    returning.fluids.chunkUnloaded(upstream);
    returning.chunks.delete('0,0');
    for (const [field,opposite] of [['west','east'],['east','west'],['north','south'],['south','north']]) {
        if (upstream[field]) upstream[field][opposite] = null;
        upstream[field] = null;
    }
    returning.fluids.enqueue(S,1,8);
    settle(returning,'temporarily absent upstream');
    eq(returning.read(S,1,8),waterIdForLevel(1),'unloading upstream does not erase a connected stream');
    // The returning snapshot has no source: boundary revalidation must now
    // propagate that fact through all the previously frozen downstream water.
    returning.add(0,0,1,true);
    settle(returning,'upstream returns dry');
    eq(countWater(returning),0,'returning dry upstream drains the previously frozen downstream');

    const negative = grid([[-1,-1],[0,-1]]);
    negative.edit(-1,1,-8,SOURCE);
    settle(negative,'negative chunk seam');
    eq(negative.read(0,1,-8),waterIdForLevel(1),'negative coordinates cross a loaded seam correctly');
    const edgeCx = Math.floor((WORLD_BORDER-1)/S);
    const edge = grid([[edgeCx,0]]);
    edge.edit(WORLD_BORDER-1,1,8,SOURCE);
    settle(edge,'world border');
    eq(edge.chunks.size,1,'world border cannot trigger a chunk load');
    ok(edge.writes.every(([x]) => x < WORLD_BORDER),'no simulation writes beyond the world border');
}

// Counts are deterministic with a stopped clock. Separate fixtures saturate
// each cap, so success does not merely mean the scenario was too small.
{
    const work = grid();
    for (let i = 0; i < 200; i++) work.fluids.enqueue(i%S,0,Math.floor(i/S));
    eq(step(work).lastProcessed,64,'ready work saturates exactly the 64-cell cap');
    eq(step(work,0,7).lastProcessed,7,'callers may lower the processed-cell cap');
    const changed = grid();
    for (let i = 0; i < 100; i++) {
        const x = 2+i%10,z = 2+Math.floor(i/10);
        changed.put(x,1,z,waterIdForLevel(7)); changed.fluids.enqueue(x,1,z);
    }
    eq(step(changed).lastChanges,24,'writes saturate exactly the 24-change cap');
    const scans = grid([[0,0]],H);
    for (let x = 0; x < S; x++) { scans.put(x,0,8,SOURCE); scans.put(x,H-1,8,SOURCE); }
    scans.fluids.chunkLoaded(scans.getChunk(0,0));
    eq(step(scans,0).lastScanCells,1024,'bootstrap scan saturates exactly the 1024-cell cap');
    const duplicate = grid();
    duplicate.put(8,4,8,SOURCE);
    for (let i = 0; i < 1000; i++) duplicate.fluids.blockChanged(8,4,8);
    eq(duplicate.fluids.stats().pending,7,'repeated notifications deduplicate seven affected cells');
    eq(step(duplicate,WATER_STEP_SECONDS,1).lastProcessed,1,'dedupe fixture starts one ready cell');
    const retained = duplicate.fluids.stats().pending;
    for (let i = 0; i < 1000; i++) duplicate.fluids.enqueue(7,4,8);
    eq(duplicate.fluids.stats().pending,retained,'a ready cell cannot be duplicated into the next wave');
    duplicate.fluids.chunkUnloaded(duplicate.getChunk(0,0));
    eq(duplicate.fluids.stats().pending,0,'unloading releases both waves and their counter');
    duplicate.fluids.dispose();
    eq(step(duplicate).lastProcessed,0,'disposed simulation performs no work');

    const timed = grid([[0,0]],H);
    for (let x = 0; x < S; x++) { timed.put(x,0,8,SOURCE); timed.put(x,H-1,8,SOURCE); }
    timed.fluids.chunkLoaded(timed.getChunk(0,0));
    let clock = 0; timed.fluids.now = () => (clock += .1);
    const timedStats = step(timed);
    ok(timedStats.lastScanCells < 1024,'scan obeys the deadline before reaching its count cap');
    eq(step(timed,WATER_STEP_SECONDS,0).lastProcessed,0,'zero requested updates never processes a voxel');

    const paused = grid(); paused.edit(8,1,8,SOURCE);
    paused.fluids.update(1000,0);
    eq(paused.writes.length,0,'zero time budget never changes water');
    step(paused,1000);
    eq(paused.read(9,1,8),waterIdForLevel(1),'a long pause permits one propagation wave');
    eq(paused.read(10,1,8),0,'a long pause cannot catch up all pending water ticks in one frame');
    eq(step(paused,0).lastProcessed,0,'a newly queued wave waits for its next simulation tick');
}

// Source-only saves need bootstrapping too: saving before the first tick must
// not permanently disable water after a reload. Scans must also recheck orphan flow.
{
    const boot = grid(neighborhood()); boot.put(8,1,8,SOURCE);
    boot.fluids.chunkLoaded(boot.getChunk(0,0));
    settle(boot,'source bootstrap');
    eq(boot.read(9,1,8),waterIdForLevel(1),'a restored source starts without an edit notification');
    const orphan = grid(neighborhood()); orphan.put(8,1,8,waterIdForLevel(2));
    orphan.fluids.chunkLoaded(orphan.getChunk(0,0));
    settle(orphan,'orphan bootstrap');
    eq(orphan.read(8,1,8),0,'a restored orphan flow revalidates and drains');

    const widening = grid(neighborhood());
    widening.put(8,20,8,SOURCE);
    widening.put(8,40,8,SOURCE);
    widening.fluids.chunkLoaded(widening.getChunk(0,0));
    // The column scan is already underway when an edit expands its bounds
    // below and above the original range. Edit notifications must cover both.
    let scanCalls = 0;
    widening.fluids.now = () => ++scanCalls < 11 ? 0 : 1;
    step(widening,0);
    const unfinished = widening.fluids.scans.get(widening.getChunk(0,0));
    ok(unfinished?.waterY > 20 && unfinished.waterY < 41,'bounds fixture pauses midway through a wet column');
    widening.fluids.now = () => 0;
    widening.edit(8,1,8,SOURCE); widening.edit(8,60,8,SOURCE);
    settle(widening,'bounds widened after scanning');
    ok(getWaterLevel(widening.read(9,1,8)) > 0,'lower newly-added water is not missed by old scan bounds');
    eq(widening.read(8,59,8),FALLING,'upper newly-added water is not missed by old scan bounds');

    const oldPort = grid(); oldPort.put(8,1,8,SOURCE);
    delete oldPort.getChunk(0,0).waterBounds;
    oldPort.fluids.chunkLoaded(oldPort.getChunk(0,0));
    settle(oldPort,'old port without metadata');
    eq(oldPort.read(9,1,8),waterIdForLevel(1),'ports without bounds retain the compatible scan fallback');
}

function realWorld(saved = new SavedChunkStore({summarize:summarizeSavedChunk}), terrain = 'flat') {
    const world = new World(new Scene(),'water-simulation-regression',saved,terrain);
    let relights = 0;
    world.light = { initChunk() {}, blockChanged() { relights++; }, takeChangedChunks() {} };
    world.fluids.now = () => 0;
    world.generator.generateChunk = chunk => {
        for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) chunk.setId(x,0,z,STONE);
    };
    return { world, relights: () => relights };
}

// Real mutation path: snapshot invalidation, dirty batching, safe light bypass,
// no accidental generation, and restoration from the exact saved compact data.
{
    const blocks = new Uint16Array(LAYER*H); blocks.fill(STONE,0,LAYER); blocks[cell(8,1,8)] = SOURCE;
    const saved = new SavedChunkStore({summarize:summarizeSavedChunk,maxDecodedBytes:0});
    saved.set('0,0',blocks);
    const revision = saved.revision('0,0');
    const { world,relights } = realWorld(saved);
    try {
        const chunk = world.generateChunk(0,0);
        ok(chunk.savedSnapshotRevision === revision,'sync restore starts from the saved revision');
        eq(chunk.waterBounds[cell(8,0,8)],2,'sync restored source has matching water metadata');
        ok(world.fluids.stats().scans > 0,'sync restore schedules a bounded bootstrap');
        const beforeMesh = chunk.meshRevision, beforePlants = chunk.plantRevision;
        ok(world.setFluidBlock(9,1,8,waterIdForLevel(1)),'real fluid mutation succeeds');
        ok(world.setFluidBlock(10,1,8,waterIdForLevel(2)),'second fluid mutation succeeds');
        eq(chunk.savedSnapshotRevision,undefined,'fluid mutation invalidates the saved snapshot marker');
        ok(chunk.modified && world.unsavedChunks.has(chunk),'fluid mutation participates in autosave');
        eq(relights(),0,'air-to-water mutation avoids redundant light flooding');
        eq(chunk.meshRevision,beforeMesh,'fluid edits defer terrain invalidation until the batch flush');
        world.flushFluidChanges();
        eq(chunk.meshRevision,beforeMesh+1,'two fluid edits invalidate the terrain mesh once');
        eq(chunk.plantRevision,beforePlants,'plain water changes do not rebuild unchanged plants');
        eq(world.setFluidBlock(S,1,8,waterIdForLevel(1)),false,'real fluid API rejects unloaded coordinates');
        eq(world.chunks.size,1,'real fluid API does not generate its rejected target');

        world.setBlock(5,1,5,'lamp');
        const beforeLamp = relights();
        world.setFluidBlock(5,1,5,waterIdForLevel(1));
        eq(relights(),beforeLamp+1,'a different emission/opacity still follows the normal light path');
        world.flushFluidChanges();

        // Save while the queue still contains work, then restore: persistent
        // voxel state, not the old queue or old Chunk object, resumes the flow.
        const snapshot = chunk.blocks.slice();
        world.unloadChunk(chunk);
        eq(world.fluids.stats().pending,0,'real unload releases queued work for that chunk');
        eq(world.fluids.stats().scans,0,'real unload releases bootstrap and boundary jobs');
        eq(saved.get('0,0'),snapshot,'unload retains every transient water ID losslessly');
        const packed = packChunkBlocks(snapshot);
        ok(packed instanceof Uint16Array,'flow states select the existing Uint16 durable format');
        eq(packed,snapshot,'packing keeps source and flow state bytes');
        const returned = world.generateChunk(0,0);
        ok(returned !== chunk,'reload constructs a new Chunk');
        eq(returned.blocks,snapshot,'reload restores pending flow exactly');
        for (const [cx,cz] of neighborhood()) if (cx || cz) world.generateChunk(cx,cz);
        settle(world,'real resumed saved flow');
        eq(world.getBlockId(15,1,8),waterIdForLevel(7),'resumed source reaches the full seven-step distance');
        world.clearBlock(8,1,8);
        settle(world,'real resumed drain');
        eq(countWater(world),0,'resumed flow drains after its source is removed');
    } finally { world.dispose(); }
    eq(saved.size,0,'world disposal releases its saved snapshot store');
    eq(world.fluids.stats().pending,0,'world disposal releases simulation queues');
}

function workerFactory() {
    const worker = new NodeWorker(new URL('./fixtures/chunk-generation-worker.mjs',import.meta.url));
    const adapter = { postMessage:(data,transfer) => worker.postMessage(data,transfer), terminate:() => worker.terminate() };
    worker.on('message',data => adapter.onmessage?.({data}));
    worker.on('error',error => adapter.onerror?.(error));
    return adapter;
}
async function until(test) {
    const started = performance.now();
    while (!test()) {
        if (performance.now()-started > 15000) throw new Error('Terrain worker did not finish');
        await new Promise(resolve => setTimeout(resolve,2));
    }
}

// The actual worker reply must pass through applyGeneratedChunk's fluid hook.
// Seed no manual simulation event: only successful worker adoption can wake it.
{
    const blocks = new Uint16Array(LAYER*H); blocks.fill(STONE,0,LAYER); blocks[cell(8,1,8)] = SOURCE;
    const saved = new SavedChunkStore({summarize:summarizeSavedChunk}); saved.set('0,0',blocks);
    const {world} = realWorld(saved,'realistic');
    try {
        world.enableChunkStreaming({workerFactory}); world.generation.start();
        await until(() => world.generation.workerReady);
        ok(world.requestGeneratedChunk(0,0),'worker accepts the source-only saved chunk');
        await until(() => world.generation.getStats().ready === 1);
        const data = world.takeGeneratedChunk(0,0);
        ok(data,'worker result retains valid saved revision');
        ok(data.waterBounds instanceof Uint8Array && data.waterBounds.byteLength === 512,'real worker transfers the lazy water metadata');
        eq(data.waterBounds[8*S+8],2,'worker metadata includes the saved source layer');
        ok(generationTransfers(data).includes(data.waterBounds.buffer),'water metadata participates in the worker transfer list');
        const chunk = world.applyGeneratedChunk(data);
        eq(chunk.blocks,blocks,'worker restores every saved block');
        ok(chunk.waterBounds === data.waterBounds,'worker adoption retains the transferred bounds array');
        ok(world.fluids.scans.has(chunk),'worker adoption schedules the same fluid bootstrap');
        settle(world,'worker-adopted water');
        eq(world.getBlockId(9,1,8),waterIdForLevel(1),'worker-adopted source spreads without a player edit');
    } finally { world.dispose(); }
}

console.log(`OK: symulacja wody — ${checks} sprawdzeń zasięgu, spadania, źródeł, odpływu, granic, budżetów i zapisu.`);
