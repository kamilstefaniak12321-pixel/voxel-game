// Exact generation/save equivalence plus actual worker scheduling and lifecycle.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Worker as NodeWorker } from 'node:worker_threads';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[]; export const getAtlasAverage=()=>null;
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};
        ` };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});
const { ChunkGeneration } = await import('../src/world/ChunkGeneration.js');
const { ChunkGenerationData } = await import('../src/world/ChunkGenerationData.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { TerrainGenerationCache } = await import('../src/world/terrain/GenerationCache.js');
const { sampleFarTile } = await import('../src/world/farSamples.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { Scene } = await import('three');
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const pause = () => new Promise(resolve => setTimeout(resolve, 2));
async function until(test) {
    const started = performance.now();
    while (!test()) {
        if (performance.now() - started > 20000) throw new Error('Worker did not finish');
        await pause();
    }
}
function workerFactory(module = 'ChunkGenerationWorker') {
    const worker = new NodeWorker(new URL('./fixtures/chunk-generation-worker.mjs', import.meta.url), { workerData: { module } });
    const adapter = {
        postMessage: (data, transfer) => worker.postMessage(data, transfer),
        terminate: () => worker.terminate()
    };
    worker.on('message', data => adapter.onmessage?.({ data }));
    worker.on('error', error => adapter.onerror?.(error));
    return adapter;
}
function reference(generator, cx, cz, saved) {
    const chunk = new Chunk(cx, cz);
    const loaded = saved !== undefined && chunk.loadBlocks(saved);
    if (loaded) generator.fillFlow(chunk);
    else { generator.generateChunk(chunk); chunk.updateSolidBelow(); }
    return chunk;
}
function same(data, chunk, label) {
    for (const key of ['blocks', 'flow', 'tint', 'biomes', 'blockCount', 'maxY', 'solidBelow']) {
        eq(data[key], chunk[key], `${label}: ${key}`);
    }
    eq([...data.growing].sort((a,b)=>a-b), [...chunk.growing].sort((a,b)=>a-b), `${label}: growing plants`);
}

// Replacing all river caches must not alter the result even across zone borders,
// reported river/lake coordinates, distant travel, or numeric/string seeds.
for (const seed of [2138286349, 'porownanie-kamila', 'lighting-rtx3050-0231']) {
    const retained = new RealisticGenerator(seed);
    const resetEveryJob = new ChunkGenerationData('realistic', seed, { zones: 0 });
    for (const [cx, cz] of [[11,-16],[12,-16],[15,0],[16,0],[500,500],[-120,-121]]) {
        const data = resetEveryJob.generate(cx, cz);
        same(data, reference(retained, cx, cz), `cache reset ${seed}/${cx}/${cz}`);
    }
    eq(resetEveryJob.resets, 6, 'bounded cache really resets between jobs');
}

const seed = 2138286349;
const generation = new ChunkGeneration('realistic', seed, { workerFactory });
const baseline = new RealisticGenerator(seed);
function farData(generator, x0, z0, spacing, cells = 8) {
    const count = (cells + 2) ** 2;
    const heights = new Int16Array(count), kinds = new Uint8Array(count), materialIds = new Uint16Array(count);
    sampleFarTile(generator,x0,z0,spacing,cells,heights,kinds,0,cells+2,materialIds);
    return { heights,kinds,materialIds };
}
const farCache = new TerrainGenerationCache('realistic',seed,{zones:0});
for (const [x,z,spacing] of [[176,-256,1],[240,0,4],[-1920,-1936,16],[8000,8000,64]]) {
    eq(farData(farCache.prepare(),x,z,spacing),farData(baseline,x,z,spacing),'bounded LOD generator exact samples');
}
eq(farCache.resets,4,'far cache resets between independent tiles');
const farWorker = workerFactory('FarTerrainWorker');
try {
    let result, ready=false;
    farWorker.onmessage = ({data}) => { if(data.type==='ready') ready=true; if(data.type==='tile') result=data; };
    farWorker.onerror = error => { throw error; };
    await until(()=>ready);
    farWorker.postMessage({type:'init',terrain:'realistic',seed});
    farWorker.postMessage({type:'tile',id:1,x0:176,z0:-256,spacing:4,cells:8});
    await until(()=>!!result);
    const expected=farData(baseline,176,-256,4);
    for(const key of Object.keys(expected)) eq(result[key],expected[key],`actual LOD worker ${key}`);
} finally { farWorker.terminate(); }
try {
    generation.start();
    await until(()=>generation.workerReady);
    ok(generation.request(11,-16), 'first request accepted');
    ok(generation.request(12,-16), 'second request accepted');
    ok(!generation.request(13,-16), 'third request is backpressured');
    await until(() => generation.getStats().ready === 2);
    for (const [cx,cz] of [[11,-16],[12,-16]]) {
        same(generation.take(cx,cz), reference(baseline,cx,cz), `real worker ${cx}/${cz}`);
    }
    eq(generation.getStats().pending, 0, 'all worker jobs consumed');

    // High block IDs and a player edit remain untouched. Legacy one-byte saves
    // follow exactly the existing Chunk.loadBlocks migration path.
    const saved = reference(baseline, 11, -16).blocks.slice();
    saved[20 * 256 + 8 * 16 + 8] = getBlockId('indygowiec_etap3');
    const savedCopy = saved.slice();
    for (const bytes of [saved, new Uint8Array(16*16*64).fill(1), new Uint16Array(3)]) {
        ok(generation.request(11,-16,bytes), 'saved request accepted');
        await until(() => generation.getStats().ready === 1);
        same(generation.take(11,-16,bytes), reference(baseline,11,-16,bytes), 'saved data and derived flow');
        ok(bytes.byteLength > 0, 'saved buffers were not detached');
    }
    eq(saved, savedCopy, 'saved data never mutated by worker');

    generation.request(500,500);
    generation.retain(() => false);
    await until(() => generation.getStats().pending === 0);
    eq(generation.getStats().ready, 0, 'teleport discards obsolete result');
    ok(generation.getStats().discarded > 0, 'discard counted');

    generation.request(11,-16,saved);
    await until(() => generation.getStats().ready === 1);
    eq(generation.take(11,-16,saved.slice()), null, 'new save snapshot invalidates queued data');
} finally { generation.dispose(); }
eq(generation.getStats().pending, 0, 'dispose clears pending work');
ok(!generation.request(0,0), 'disposed stream cannot restart');

// Real World.update: no call to the main-thread generator while jobs run;
// queue remains populated so the far terrain cannot expose a missing ring.
const world = new World(new Scene(), seed, new Map(), 'realistic');
world.enableChunkStreaming({ workerFactory });
world.generator.generateChunk = () => { throw new Error('Main-thread generation during streaming'); };
world.generator.fillFlow = () => { throw new Error('Main-thread flow during streaming'); };
try {
    world.update(8000,8000,3,4);
    ok(world.loadQueue.length > 0, 'pending chunks stay in load queue');
    ok(Number.isFinite(world.completeRadius()), 'incomplete radius stays finite');
    await until(() => {
        // Pump frames while imports finish, but leave ready results unapplied
        // so the subsequent queue-reordering assertion sees both of them.
        world.update(8000,8000,3,0);
        return world.generation.getStats().ready === 2;
    });
    world.setCenter(8032,8000,3);
    eq(world.generation.getStats().ready, 2, 'ready jobs still wanted after centre moves');
    world.streamChunks(Infinity);
    eq(world.generation.getStats().applied, 2, 'ready jobs outside new queue front cannot deadlock');
    await until(() => {
        world.update(8000,8000,1,4);
        return world.loadQueue.length === 0;
    });
    eq(world.chunks.size, 5, 'all requested chunks arrived');
    eq(world.completeRadius(), Infinity, 'radius complete only after results are installed');
    for (const chunk of world.chunks.values()) same(chunk, reference(baseline,chunk.cx,chunk.cz), 'World adoption');
    for (const [x,z] of [[8000,8000],[8015,8000],[7999,8000]]) {
        eq(world.biomeAt(x,z), baseline.biomeAt(x,z), 'cached exact biome');
    }
    world.generator.biomeAt = () => { throw new Error('Main-thread rivers from biome query'); };
    ok(world.biomeAt(8000,8000), 'biome query only reads loaded chunk');
    const game={world,player:{pos:{x:8000,y:40,z:8000}},achievementBiome:null};
    const traveller=ACHIEVEMENTS.find(item=>item.id==='tourist');
    ok(traveller,'real biome achievement exists');
    traveller.check(game,{collect:()=>1});
    eq(game.achievementBiome.key,world.biomeAt(8000,8000),'achievement uses cached biome without river computation');
    ok(world.generation.getStats().applied === 5, 'adoption stats');

    eq(world.ensurePlayerColumn(-8000,-8000), null, 'fast movement waits instead of blocking');
    await until(() => !!world.ensurePlayerColumn(-8000,-8000));
    ok(world.getChunk(-500,-500), 'fast movement waits for actual terrain');
    ok(world.ensurePlayerColumn(1e12,1e12), 'outside border does not wait forever');

    // A synchronous command/edit wins over an already pending result.
    world.generation.request(0,0);
    await until(() => world.generation.getStats().ready === 1);
    const edited = world.createChunk(0,0);
    edited.setId(1,30,1,getBlockId('stone'));
    const data = world.generation.take(0,0);
    eq(world.applyGeneratedChunk(data), edited, 'late result does not replace live chunk');
    eq(edited.getId(1,30,1),getBlockId('stone'),'edit survives');
} finally { world.dispose(); }
ok(!world.generation.enabled, 'World.dispose terminates worker');

// Creation errors, runtime failures, and a worker that never replies fail closed
// into the established synchronous path instead of leaving holes forever.
const warn = console.warn;
console.warn = () => {};
try {
    const failed = new ChunkGeneration('realistic', seed, { workerFactory: () => { throw Error('unavailable'); } });
    ok(!failed.request(0,0), 'failed worker request returns false');
    eq(failed.getStats().failures,1,'startup failure counted');
    ok(!failed.enabled,'startup fallback enabled');
    let fake;
    const stalled = new ChunkGeneration('realistic', seed, { workerFactory: () => fake = { postMessage(){}, terminate(){ this.stopped=true; } } });
    stalled.start();
    fake.onmessage({data:{type:'ready'}});
    stalled.request(0,0);
    [...stalled.jobs.values()][0].started -= 20000;
    ok(!stalled.checkHealth(),'stalled worker falls back');
    ok(fake.stopped,'stalled worker stopped');
    let delayed;
    const starting = new ChunkGeneration('realistic',seed,{workerFactory:()=>delayed={
        messages:[],postMessage(message){this.messages.push(message);},terminate(){}
    }});
    ok(!starting.request(0,0),'no chunk is sent before module imports finish');
    eq(delayed.messages,[],'init also waits for installed message handler');
    eq(starting.jobs.size,0,'requests remain in World queue until worker ready');
    delayed.onmessage({data:{type:'ready'}});
    eq(delayed.messages.map(message=>message.type),['init'],'ready handshake initializes generator');
    ok(starting.request(0,0),'request accepted after ready');
    eq(delayed.messages.map(message=>message.type),['init','chunk'],'init precedes first chunk');
    starting.dispose();
    const noReady = new ChunkGeneration('realistic',seed,{workerFactory:()=>({postMessage(){},terminate(){}})});
    noReady.start(); noReady.started-=20000;
    ok(!noReady.checkHealth(),'missing ready message cannot hang world forever');
    const fallback = new World(new Scene(), seed, new Map(), 'realistic');
    fallback.enableChunkStreaming({ workerFactory: () => { throw Error('unavailable'); } });
    try {
        const chunk = fallback.ensurePlayerColumn(0,0);
        ok(chunk?.blocks,'fallback installs real terrain');
        same(chunk, reference(baseline,0,0),'fallback result');
    } finally { fallback.dispose(); }
} finally { console.warn = warn; }
console.log(`OK: streaming terenu — ${checks} sprawdzeń zgodności, zapisu, granic, kolejki i cyklu życia prawdziwego workera.`);
