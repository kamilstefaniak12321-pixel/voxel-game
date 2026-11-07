// Same generated old-format IndexedDB save for baseline and candidate. This
// fixture is served only by benchmark_saved_streaming.mjs, never by the game.
import { WorldStorage, createWorldInfo } from '/src/storage/WorldStorage.js';
import { getBlockId } from '/src/blocks/BlockRegistry.js';
import { SAVED_BENCH_CELLS as CELLS, SAVED_BENCH_NOISE_COUNT as NOISE_COUNT,
    savedBenchCoordinates as coordinates, savedBenchBlocks, savedBenchSignature as signature } from '/__benchmark_data__.mjs';

const WORLD = 'benchmark-terrain';
const NOISE_WORLD = 'benchmark-noise';
const check = (condition, message) => { if (!condition) throw new Error(message); };
const requestResult = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});
const completed = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = resolve; transaction.onabort = transaction.onerror = () => reject(transaction.error);
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const stone = getBlockId('stone'), dirt = getBlockId('dirt'), grass = getBlockId('grass');
const planks = getBlockId('oak_planks') || getBlockId('planks') || stone;
const modern = getBlockId('indygowiec_etap3');
check(stone > 0 && dirt > 0 && grass > 0 && modern > 255, 'Fixture needs real 8/16-bit block IDs');

function blocksFor(index, noise = false) {
    return savedBenchBlocks(index, { stone, dirt, grass, planks, modern }, noise);
}

export async function seed(chunkCount) {
    await requestResult(indexedDB.deleteDatabase('voxel-game'));
    const request = indexedDB.open('voxel-game', 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('worlds', { keyPath: 'id' });
        db.createObjectStore('chunks', { keyPath: ['worldId', 'cx', 'cz'] }).createIndex('worldId', 'worldId');
    };
    const db = await requestResult(request);
    let rawBytes = 0, noiseBytes = 0;
    try {
        for (const [worldId, count, noise] of [[WORLD, chunkCount, false], [NOISE_WORLD, NOISE_COUNT, true]]) {
            const info = { ...createWorldInfo(worldId, 731, 'flat', 'developer'), id: worldId };
            const tx = db.transaction('worlds', 'readwrite'), done = completed(tx);
            tx.objectStore('worlds').put(info); await done;
            for (let first = 0; first < count; first += 32) {
                const tx = db.transaction('chunks', 'readwrite'), done = completed(tx);
                const store = tx.objectStore('chunks');
                for (let i = first; i < Math.min(count, first + 32); i++) {
                    const blocks = blocksFor(i, noise);
                    if (noise) noiseBytes += blocks.byteLength; else rawBytes += blocks.byteLength;
                    store.put({ worldId, ...coordinates(i), blocks });
                }
                await done;
            }
        }
    } finally { db.close(); }
    return { schema: 1, chunkCount, rawBytes, noiseCount: NOISE_COUNT, noiseBytes,
        description: 'Alternating 8/16-bit stratified terrain, uneven surface and building edits; separate random 16-bit stress world' };
}

function percentile(values, fraction) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] : null;
}

async function timeOperation(operation) {
    const gaps = [], longTasks = [];
    let previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); gaps.push(now - previous); previous = now; }, 4);
    const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: 'longtask', buffered: false });
    await pause(25);
    gaps.length = 0; previous = performance.now();
    const start = performance.now();
    let value, elapsed;
    try { value = await operation(); elapsed = performance.now() - start; }
    finally {
        // Include the timer delayed by the final synchronous piece of work.
        await pause(8); clearInterval(timer); observer.disconnect();
    }
    const selected = longTasks.filter(task => task.startTime >= start);
    return { value, timing: { elapsedMs: elapsed, heartbeatSamples: gaps.length,
        heartbeatP95Ms: percentile(gaps, .95), heartbeatMaxMs: gaps.length ? Math.max(...gaps) : null,
        longTasks: selected.length, longestTaskMs: selected.length ? Math.max(...selected.map(task => task.duration)) : 0 } };
}

function retained(store) {
    if (typeof store.stats === 'function') {
        const stats = store.stats();
        return { kind: 'compact', ...stats,
            retainedDataBytes: (stats.encodedBytes ?? 0) + (stats.summaryBytes ?? 0) + (stats.decodedBytes ?? 0) };
    }
    let rawBytes = 0;
    const seen = new Set();
    for (const blocks of store.values()) if (!seen.has(blocks.buffer)) {
        seen.add(blocks.buffer); rawBytes += blocks.buffer.byteLength;
    }
    return { kind: 'eager-map', chunks: store.size, encodedBytes: rawBytes, summaryBytes: 0,
        decodedBytes: 0, retainedDataBytes: rawBytes };
}

async function exercise(storage, worldId, count, noise, summarize) {
    const open = () => typeof storage.loadSavedChunks === 'function'
        ? storage.loadSavedChunks(worldId, { summarize }) : storage.loadChunks(worldId);
    const initial = await timeOperation(open), store = initial.value;
    check(store.size === count, `${worldId}: lost records at load`);
    const atOpen = retained(store);
    const reads = [], verified = [];
    const indices = [...new Set([0, 1, 31, 32, 63, 64, Math.floor(count / 2), count - 1].filter(i => i < count))];
    for (const i of indices) {
        const { cx, cz } = coordinates(i), key = `${cx},${cz}`;
        const actual = store.get(key), expected = blocksFor(i, noise);
        check(actual?.constructor === expected.constructor, `${worldId}: array width changed at ${key}`);
        check(actual.length === CELLS && signature(actual) === signature(expected), `${worldId}: saved edit mismatch at ${key}`);
        verified.push(key);
    }
    // 512 distinct chunk visits and a revisit after cache churn. Reads happen
    // in small batches, resembling streaming admission rather than one giant
    // synchronous loop. This measures decode CPU tradeoff, not game FPS.
    const visits = Math.min(count, 512);
    const traversal = await timeOperation(async () => {
        for (let start = 0; start < visits; start += 8) {
            for (let offset = 0; offset < Math.min(8, visits - start); offset++) {
                const i = start + offset, { cx, cz } = coordinates(i);
                const began = performance.now(), blocks = store.get(`${cx},${cz}`);
                reads.push(performance.now() - began);
                check(blocks?.length === CELLS, `${worldId}: traversal lost ${cx},${cz}`);
            }
            await pause(0);
        }
    });
    const afterTraversal = retained(store);
    for (const i of indices) {
        const { cx, cz } = coordinates(i);
        check(signature(store.get(`${cx},${cz}`)) === signature(blocksFor(i, noise)), `${worldId}: revisit mismatch`);
    }
    // Actual storage write/read confirms compact loaded state does not become
    // the persistent format and does not lose a newer block during reload.
    const { cx, cz } = coordinates(0), changed = store.get(`${cx},${cz}`).slice();
    changed[12 * 256 + 17] = planks;
    await storage.saveWorldAndChunks({ ...createWorldInfo(worldId, 731, 'flat', 'developer'), id: worldId },
        [{ cx, cz, blocks: changed }], { immediate: true });
    const disk = await new Promise((resolve, reject) => {
        const request = storage.db.transaction('chunks', 'readonly').objectStore('chunks').get([worldId, cx, cz]);
        request.onsuccess = () => resolve(request.result.blocks); request.onerror = () => reject(request.error);
    });
    check(disk[12 * 256 + 17] === planks, `${worldId}: edit was not saved`);
    // Restore the exact original fixture for the next timed repetition.
    await storage.saveWorldAndChunks({ ...createWorldInfo(worldId, 731, 'flat', 'developer'), id: worldId },
        [{ cx, cz, blocks: blocksFor(0, noise) }], { immediate: true });
    window.__heldStores ??= []; window.__heldStores.push(store);
    return { worldId, count, noise, opening: initial.timing, atOpen, afterTraversal,
        traversal: { ...traversal.timing, reads: reads.length, readP50Ms: percentile(reads, .5), readP95Ms: percentile(reads, .95), readMaxMs: Math.max(...reads) },
        checks: { verified, revisited: verified.length, persistentEdit: true, fixtureRestored: true } };
}

export async function measure(chunkCount, sample) {
    let summarize;
    if (typeof WorldStorage.prototype.loadSavedChunks === 'function') {
        ({ summarizeSavedChunk: summarize } = await import('/src/world/SavedChunkSurface.js'));
    }
    const storage = await WorldStorage.open();
    try {
        const terrain = await exercise(storage, WORLD, chunkCount, false, summarize);
        const noise = await exercise(storage, NOISE_WORLD, NOISE_COUNT, true, summarize);
        return { sample, terrain, noise,
            summary: { mode: terrain.atOpen.kind, openMs: terrain.opening.elapsedMs,
                retainedMiB: terrain.afterTraversal.retainedDataBytes / 1048576,
                startupMaxGapMs: terrain.opening.heartbeatMaxMs,
                traversalReadP95Ms: terrain.traversal.readP95Ms,
                noiseRetainedMiB: noise.afterTraversal.retainedDataBytes / 1048576 } };
    } finally { storage.background?.stop(); storage.db.close(); }
}

// Separate post-measurement integration check, deliberately excluded from the
// timing samples. Uses the actual Game/World/IndexedDB save lifecycle.
export async function gameSmoke() {
    const THREE = await import('three');
    const { Game } = await import('/src/game/Game.js');
    const { Settings } = await import('/src/settings/Settings.js');
    const { atlasReady } = await import('/src/rendering/TextureAtlas.js');
    await atlasReady;
    const storage = await WorldStorage.open();
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(320, 240); document.body.append(renderer.domElement);
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 24, farTerrain: 0, loadBudget: 1,
        shadows: 0, lightShafts: false, bounceLight: false, surfaceBounce: false,
        meteorites: false, showHand: false, potato: true, plantModels: 'simple', leafModel: 'cube',
        volumeMaster: 0, volumeMusic: 0, lightingLook: 'baseline', cloudCover: 0 })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta'
        ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = (await storage.listWorlds()).find(world => world.id === WORLD);
    info.player = { x: 256 * 16 + 8.5, y: 35, z: -32 * 16 + 8.5, yaw: 0, pitch: -.4, flying: true };
    const point = { x: 256 * 16 + 1, y: 12, z: -32 * 16 + 1 };
    let game;
    const checks = [];
    const verify = (value, message) => { check(value, message); checks.push(message); };
    try {
        game = await Game.start(renderer, input, storage, info, settings);
        game.time.speed = 0;
        game.update(0); game.render();
        verify(game.world.getBlockId(point.x, point.y, point.z) === 0, 'Real Game.start restored the saved cave edit');
        verify(game.world.setBlock(point.x, point.y, point.z, 'stone'), 'World accepted an edit in a saved chunk');
        verify(await game.saver.flush(), 'Real WorldSaver transaction committed');
        const chunk = game.world.getChunk(256, -32);
        game.world.unloadChunk(chunk);
        game.world.generateChunk(256, -32);
        verify(game.world.getBlockId(point.x, point.y, point.z) === stone, 'Unload/revisit retained the latest edit');
        const store = game.world.savedChunks;
        verify(await game.stop(), 'Game.stop completed its save'); game = null;
        if (typeof store.stats === 'function') verify(store.stats().totalBytes === 0, 'Stop released compact saved data and decoded buffers');
        const reloaded = (await storage.listWorlds()).find(world => world.id === WORLD);
        game = await Game.start(renderer, input, storage, reloaded, settings);
        game.update(0); game.render();
        verify(game.world.getBlockId(point.x, point.y, point.z) === stone, 'Game restart restored the persisted latest edit');
        verify(renderer.getContext().getError() === renderer.getContext().NO_ERROR, 'Rendered saved world has no WebGL error');
        verify(await game.stop(), 'Second Game.stop completed'); game = null;
        const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { scope: 'Correctness only; no frame-rate result', checks,
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    } finally {
        if (game) await game.stop({ save: false });
        renderer.dispose(); renderer.domElement.remove();
        storage.background?.stop(); storage.db.close();
    }
}
