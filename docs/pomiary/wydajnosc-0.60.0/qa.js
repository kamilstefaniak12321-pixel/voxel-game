import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo, WorldStorage } from '/src/storage/WorldStorage.js';
import { WorldSaver } from '/src/storage/WorldSaver.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';

const panel = document.querySelector('aside'), status = panel.querySelector('[data-status]');
const output = panel.querySelector('pre'), errors = [];
const config = await window.performanceQA.config();
const originalError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
addEventListener('error', event => errors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack ?? event.reason)));
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
for (const [key, value] of Object.entries({ potato: false, renderScale: 100, viewDistance: 64,
    farTerrain: 1024, farDetail: 2, shadows: 3, fpsLimit: 0, brightness: 0,
    lightingModel: 'world', lightingLook: 'natural', cloudCover: 0, lightingMaterials: 'standard',
    surfaceBounce: true, leafTransmission: true, materialSpecular: true, bounceStrength: 18,
    bounceSaturation: 65, meteorites: false, lightShafts: true, bounceLight: false,
    showHand: false, loadBudget: 4, volumeMaster: 0, musicVolume: 0, autoUpdates: false })) settings.set(key, value);
await atlasReady;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(config.width, config.height); renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const input = new Proxy({}, { get: (_, key) => key === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
const gl = renderer.getContext(), gpu = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const debug = gl.getExtension('WEBGL_debug_renderer_info');
const device = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webgl2: renderer.capabilities.isWebGL2, gpuTimerSupported: !!gpu,
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], devicePixelRatio, userAgent: navigator.userAgent };
panel.querySelector('[data-device]').textContent = `${config.version} · ${config.baseline ? 'baza' : 'kandydat'} · ${device.renderer}`;
let game = null, scene = 'rivers', run = null, pending = [], last = 0, switching = false, readySince = 0;
let farmCells = [], farmRemoved = null, lastEdit = -1, photo = false;
let worldTimings = null;
let storageMeasure = null;
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const snapshotSettings = () => Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)]));
const summary = a => {
    if (!a.length) return { count: 0 };
    const sorted = [...a].sort((a, b) => a - b), sum = a.reduce((s, n) => s + n, 0);
    return { count: a.length, meanMs: sum / a.length, medianMs: (sorted[(a.length - 1) >> 1] + sorted[a.length >> 1]) / 2,
        p95Ms: sorted[Math.ceil(a.length * .95) - 1], p99Ms: sorted[Math.ceil(a.length * .99) - 1], maxMs: sorted.at(-1),
        averageFps: 1000 * a.length / sum, above16_67ms: a.filter(n => n > 1000 / 60).length,
        above33_33ms: a.filter(n => n > 1000 / 30).length, above50ms: a.filter(n => n > 50).length };
};
function camera(position, target) {
    const [x, y, z] = position, dx = target[0] - x, dy = target[1] - y, dz = target[2] - z;
    game.player.pos.set(x, y - game.player.eyeHeight, z); game.player.vel.set(0, 0, 0);
    game.player.yaw = Math.atan2(-dx, -dz); game.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    game.player.flying = true; game.player.updateCamera();
}
function positionAt(seconds = 0) {
    if (scene !== 'rivers') return camera([25, 29, 29], [8, 18.5, 8]);
    if (seconds < 10) return camera([15.5, 80, 19.5], [33, 45, 37]);
    const x = 8000 + 256 * Math.min(1, Math.max(0, (seconds - 20) / 60));
    camera([x, 80, 8000], [x + 16, 51, 8016]);
}
function resources() {
    return { chunks: game.world.chunks.size, queued: game.world.loadQueue?.length ?? 0,
        dirty: game.world.dirtyChunks.size, meshVersion: game.world.meshVersion ?? 0,
        far: game.farTerrain.stats(), shadow: game.shadows.stats(), bounce: game.bounce?.stats?.(),
        worldOutput: game.worldOutput?.stats?.(), streaming: game.world.generation?.getStats?.() ?? null,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        heapMiB: performance.memory?.usedJSHeapSize / 1048576,
        failedPrograms: renderer.info.programs?.filter(p => p.diagnostics?.runnable === false).length ?? 0 };
}
function report() {
    return { scene, seed: scene === 'rivers' ? 'porownanie-kamila' : 42, device,
        settings: snapshotSettings(), actualCamera: { position: game.camera.position.toArray(),
            direction: game.camera.getWorldDirection(new THREE.Vector3()).toArray() },
        resources: resources(), errors: [...errors] };
}
function controls(busy) {
    for (const button of panel.querySelectorAll('button')) button.disabled = busy;
    panel.querySelector('[data-cancel]').disabled = !run;
    panel.querySelector('[data-hide]').disabled = false;
}
function instrument() {
    worldTimings = { update: [], generate: [], rebuild: [], prepareZone: [] };
    for (const [object, method, key] of [[game.world, 'update', 'update'], [game.world, 'generateChunk', 'generate'],
        [game.world, 'rebuildChunkMesh', 'rebuild'], [game.world.generator.rivers, 'prepareZone', 'prepareZone']]) {
        if (!object?.[method]) continue;
        const original = object[method];
        object[method] = function (...args) {
            const measured = run && run.start !== null && performance.now() >= run.start && performance.now() < run.end;
            if (!measured) return original.apply(this, args);
            const start = performance.now();
            try { return original.apply(this, args); }
            finally { worldTimings[key].push(performance.now() - start); }
        };
    }
}
async function createScene(name) {
    if (run || switching) return;
    switching = true; controls(true); status.textContent = 'Tworzę nowy izolowany świat…';
    try {
        if (game) await game.stop({ save: false }); game = null; scene = name;
        const info = createWorldInfo('Odbiór wydajności', name === 'rivers' ? 'porownanie-kamila' : 42,
            name === 'rivers' ? 'realistic' : 'flat', 'developer');
        info.player = { x: name === 'rivers' ? 15.5 : 25, y: name === 'rivers' ? 78.4 : 27.4,
            z: name === 'rivers' ? 19.5 : 29, yaw: 0, pitch: -.6, flying: true };
        game = await Game.start(renderer, input, null, info, settings);
        game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
        game.hand.resize(config.width / config.height); game.plantGrowth.speed = 0;
        game.time.speed = 0; game.time.days = .5; farmCells = []; farmRemoved = null; lastEdit = -1;
        if (name !== 'rivers') {
            const spacing = name === 'farm64' ? 2 : 1;
            for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) game.world.setBlock(x, 16, z, 'grass');
            for (let z = 0; z < 16; z += spacing) for (let x = 0; x < 16; x += spacing) {
                game.world.setBlock(x, 17, z, 'indygowiec_etap3'); farmCells.push([x, 17, z]);
            }
        }
        positionAt(); instrument(); readySince = 0; last = 0;
        status.textContent = `${scene}: stabilizacja terenu, świateł i cieni…`;
    } catch (error) { errors.push(String(error.stack ?? error)); status.textContent = String(error); }
    finally { switching = false; controls(false); }
}
const observer = PerformanceObserver.supportedEntryTypes?.includes('longtask') ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (run && run.start !== null && entry.startTime >= run.start && entry.startTime < run.end)
        run.longTasks.push({ atMs: entry.startTime - run.start, durationMs: entry.duration });
    for (const entry of list.getEntries()) if (storageMeasure && entry.startTime >= storageMeasure.start)
        storageMeasure.longTasks.push({ atMs: entry.startTime - storageMeasure.start, durationMs: entry.duration });
}) : null;
observer?.observe({ type: 'longtask', buffered: false });
function startRun() {
    if (!game || run || switching) return;
    const duration = scene === 'rivers' ? 90 : 60;
    worldTimings = { update: [], generate: [], rebuild: [], prepareZone: [] };
    run = { requestedAt: performance.now(), start: null, end: null, last: null, duration,
        frames: [], cpu: [], updateCpu: [], renderCpu: [], gpu: [], longTasks: [], edits: [],
        disjoint: 0, skipped: 0, errorsAtStart: errors.length, before: null, startedAt: new Date().toISOString() };
    positionAt(); readySince = 0; lastEdit = -1; controls(true);
}
async function finish(reason = null) {
    if (!run) return;
    const done = run; run = null;
    pending = pending.filter(q => { if (q.owner !== done) return true; gl.deleteQuery(q.query); return false; });
    const after = resources();
    const result = { ...report(), valid: !reason && done.frames.length > 100 && done.errorsAtStart === errors.length && !after.failedPrograms,
        invalidReason: reason, duration: done.duration, warmupSeconds: 10, startedAt: done.startedAt,
        frame: summary(done.frames), cpu: summary(done.cpu), updateCpu: summary(done.updateCpu), renderCpu: summary(done.renderCpu),
        gpu: summary(done.gpu), gpuValid: !!gpu && done.gpu.length > 100 && !done.disjoint,
        gpuDisjoint: done.disjoint, gpuSkipped: done.skipped,
        longTasks: done.longTasks, edits: done.edits, before: done.before, after,
        operationTimings: Object.fromEntries(Object.entries(worldTimings).map(([key, values]) => [key, summary(values)])),
        geometryChanges: after.meshVersion - (done.before?.meshVersion ?? after.meshVersion),
        raw: { frames: done.frames, cpu: done.cpu, updateCpu: done.updateCpu, renderCpu: done.renderCpu, gpu: done.gpu, operations: worldTimings },
        notes: ['CPU operation timings overlap; do not add to total frame.', 'Rivers uses fixed camera height; no synchronous generator height query in harness.',
            'Game.update and Game.render are real. Input is scripted; audio and player saves are disabled.',
            'Long tasks include renderer thread only; worker elapsed time is excluded.', 'The cold teleport is included in the continuous sample.'] };
    const path = await window.performanceQA.report(`${scene}-continuous`, result);
    output.textContent = JSON.stringify({ valid: result.valid, frame: result.frame, gpu: result.gpu, operationTimings: result.operationTimings }, null, 2);
    status.textContent = `${result.valid ? 'Zapisano' : 'Nieważny'}: ${path}`; controls(false);
}
function tick(now) {
    requestAnimationFrame(tick);
    if (!game || switching) { last = 0; return; }
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (gpu && pending.length) {
        const disjoint = gl.getParameter(gpu.GPU_DISJOINT_EXT); if (disjoint && run) run.disjoint++;
        pending = pending.filter(q => {
            if (!disjoint && !gl.getQueryParameter(q.query, gl.QUERY_RESULT_AVAILABLE)) return true;
            if (!disjoint) q.owner.gpu.push(gl.getQueryParameter(q.query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(q.query); return false;
        });
    }
    if (run && (document.hidden || !document.hasFocus())) { void finish('Okno utraciło aktywność'); return; }
    const current = run && run.start !== null && now >= run.start && now < run.end ? run : null;
    const start = performance.now();
    if (current) {
        const seconds = (now - current.start) / 1000; positionAt(seconds);
        if (scene !== 'rivers' && Math.floor(seconds) > lastEdit) {
            lastEdit = Math.floor(seconds);
            const cell = farmCells[Math.floor(lastEdit / 2) % farmCells.length], editStart = performance.now();
            if (lastEdit % 2 === 0) { game.world.setBlock(...cell, null); farmRemoved = cell; }
            else if (farmRemoved) { game.world.setBlock(...farmRemoved, 'indygowiec_etap3'); farmRemoved = null; }
            current.edits.push({ second: lastEdit, cell, removed: lastEdit % 2 === 0, cpuMs: performance.now() - editStart });
        }
    }
    let query = null;
    if (current && gpu) {
        if (pending.length < 12 && !gl.getQuery(gpu.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
            query = gl.createQuery(); gl.beginQuery(gpu.TIME_ELAPSED_EXT, query);
        } else current.skipped++;
    }
    renderer.info.reset(); game.update(photo ? 0 : dt);
    const updated = performance.now(); game.render(); const end = performance.now();
    if (query) { gl.endQuery(gpu.TIME_ELAPSED_EXT); pending.push({ query, owner: current }); }
    if (current) {
        if (current.last !== null) current.frames.push(now - current.last);
        current.last = now; current.cpu.push(end - start); current.updateCpu.push(updated - start); current.renderCpu.push(end - updated);
    }
    const streaming = game.world.generation?.getStats?.();
    const stable = !game.world.loadQueue?.length && !game.world.dirtyChunks.size && !streaming?.pending && !streaming?.ready && !game.farTerrain.requests.size &&
        !game.farTerrain.wanted.some(tile => !tile.mesh || tile.stale) && game.bounce?.stats?.().ready !== false;
    if (!stable) readySince = 0; else if (!readySince) readySince = now;
    if (run) {
        if (run.start === null && readySince && now - readySince >= 2000) {
            run.start = now + 10000; run.end = run.start + run.duration * 1000; run.before = resources();
        }
        if (run.start === null && now - run.requestedAt > 180000) void finish('Brak gotowości w 180 s');
        else if (run.start !== null && now >= run.end && !pending.some(q => q.owner === run)) void finish();
        else if (run.start !== null && now - run.end > 5000) void finish('GPU nie oddało próbek w 5 s');
        else status.textContent = run.start === null ? 'Czekam na pustą kolejkę świata…' : now < run.start
            ? `Rozgrzewka: ${Math.ceil((run.start - now) / 1000)} s` : `Pomiar: ${Math.max(0, Math.ceil((run.end - now) / 1000))} s`;
    } else if (readySince && now - readySince > 2000 && status.textContent.includes('stabilizacja')) status.textContent = `${scene}: gotowe do pomiaru.`;
}
for (const button of panel.querySelectorAll('[data-scene]')) button.onclick = () => void createScene(button.dataset.scene);
panel.querySelector('[data-reset]').onclick = () => void createScene(scene);
panel.querySelector('[data-run]').onclick = startRun;
panel.querySelector('[data-cancel]').onclick = () => void finish('Anulowano');
const togglePanel = () => { if (!photo) panel.hidden = !panel.hidden; };
panel.querySelector('[data-hide]').onclick = togglePanel; window.performanceQA.onTogglePanel(togglePanel);
panel.querySelector('[data-photo]').onclick = async () => {
    if (run || switching) return; photo = true; panel.hidden = true;
    try { await frame(); await frame(); const saved = await window.performanceQA.photo(scene, report()); status.textContent = `Kadr: ${saved.photo}`; }
    finally { photo = false; panel.hidden = false; }
};
panel.querySelector('[data-storage]').onclick = async () => {
    if (run || switching) return;
    controls(true);
    const name = `voxel-performance-qa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const requestResult = request => new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    let db, storage;
    const rows = [];
    try {
        const opening = indexedDB.open(name, 1);
        opening.onupgradeneeded = () => {
            opening.result.createObjectStore('worlds', { keyPath: 'id' });
            opening.result.createObjectStore('chunks', { keyPath: ['worldId', 'cx', 'cz'] }).createIndex('worldId', 'worldId');
        };
        db = await requestResult(opening); storage = new WorldStorage(db, { background: true });
        for (const count of [16, 128, 512]) for (let trial = 0; trial < 3; trial++) {
            status.textContent = `Prawdziwy zapis IndexedDB: ${count} chunków, próba ${trial + 1}/3…`;
            const info = createWorldInfo('Syntetyczna próba zapisu', 42, 'flat', 'developer');
            info.player = { x: 15.5, y: 20, z: 8.5, yaw: 1, pitch: 0, flying: true };
            info.campfires = [{ x: 8, y: 17, z: 8, fuel: 6, state: 'burning', progress: .25 }];
            const expectedInfo = structuredClone(info);
            const chunks = Array.from({ length: count }, (_, index) => {
                const blocks = new Uint16Array(32768).fill(1);
                if (index % 2) blocks[32767] = 65535;
                return { cx: index, cz: 0, blocks };
            });
            await frame();
            let active = true, lastBeat = performance.now();
            const heartbeats = [];
            const heartbeat = now => { if (!active) return; heartbeats.push(now - lastBeat); lastBeat = now; requestAnimationFrame(heartbeat); };
            requestAnimationFrame(heartbeat);
            storageMeasure = { start: performance.now(), longTasks: [] };
            const begin = performance.now();
            const saved = storage.saveWorldAndChunks(info, chunks);
            const submitMs = performance.now() - begin;
            // Zmiana żywego świata tuż po zleceniu nie może zmieniać snapshotu.
            info.player.x = -999; info.campfires[0].fuel = -1;
            for (const chunk of chunks) { chunk.blocks[0] = 77; chunk.blocks[32767] = 88; }
            await saved;
            const totalMs = performance.now() - begin;
            await frame(); await frame(); active = false;
            const readStart = performance.now();
            const reloaded = await storage.loadChunks(info.id);
            const loadMs = performance.now() - readStart;
            const savedInfo = (await storage.listWorlds()).find(value => value.id === info.id);
            let valid = reloaded.size === count && savedInfo.player.x === expectedInfo.player.x &&
                savedInfo.campfires[0].fuel === expectedInfo.campfires[0].fuel;
            let checkedCells = 0;
            for (let index = 0; index < count; index++) {
                const block = reloaded.get(`${index},0`);
                valid &&= block?.length === 32768 && block.BYTES_PER_ELEMENT === (index % 2 ? 2 : 1);
                for (let cell = 0; cell < 32768; cell++) {
                    if (block?.[cell] !== (index % 2 && cell === 32767 ? 65535 : 1)) valid = false;
                    checkedCells++;
                }
            }
            rows.push({ count, trial, submitMs, totalMs, loadMs, valid, checkedCells,
                heartbeat: summary(heartbeats), rawHeartbeat: heartbeats,
                longTasks: storageMeasure.longTasks, worker: storage.background ? { ...storage.background.stats } : null });
            storageMeasure = null;
            if (!valid) throw new Error(`Niezgodny snapshot ${count} chunków`);
        }
        // Prawdziwy handler pagehide przejmuje zapis, zanim worker odpowie.
        // Zdarzenie jest syntetyczne: nie zamyka ani nie przeładowuje strony.
        const exitInfo = createWorldInfo('Próba zapisu przy wyjściu', 42, 'flat', 'developer');
        const exitChunks = Array.from({ length: 16 }, (_, cx) => ({ cx, cz: 0, blocks: new Uint16Array(32768).fill(1) }));
        const unsaved = new Set(exitChunks);
        const exitWorld = { takeUnsavedChunks() { const value = [...unsaved]; unsaved.clear(); return value; },
            markUnsaved(chunks) { for (const chunk of chunks) unsaved.add(chunk); }, hasUnsavedChanges() { return !!unsaved.size; } };
        let playerX = 12;
        const saver = new WorldSaver(storage, exitInfo, exitWorld, { getState: () => ({ x: playerX, y: 20, z: 3 }) });
        const originalTransaction = db.transaction.bind(db);
        let localWrites = 0;
        db.transaction = (...args) => { if (args[1] === 'readwrite') localWrites++; return originalTransaction(...args); };
        let exit;
        try {
            saver.saveOnExit();
            const oldSave = saver.save();
            const pendingBefore = storage.background?.pending.size ?? 0;
            playerX = 77; exitChunks[0].blocks[0] = 321; unsaved.add(exitChunks[0]);
            const writesBefore = localWrites;
            dispatchEvent(new Event('pagehide'));
            const startedLocalImmediately = localWrites > writesBefore;
            const exitSave = saver.saving;
            await oldSave; await exitSave; await saver.flush();
            const reloaded = await storage.loadChunks(exitInfo.id);
            const storedInfo = (await storage.listWorlds()).find(value => value.id === exitInfo.id);
            const snapshotValid = reloaded.size === 16 && reloaded.get('0,0')?.[0] === 321 &&
                reloaded.get('15,0')?.[32767] === 1 && storedInfo?.player?.x === 77 && unsaved.size === 0;
            exit = { pendingBefore, startedLocalImmediately, localWrites, snapshotValid,
                valid: snapshotValid && (config.baseline || (pendingBefore > 0 && startedLocalImmediately)) };
        } finally { saver.stop(); db.transaction = originalTransaction; }
        const result = { ...report(), valid: rows.every(row => row.valid) && exit.valid, rows, exit,
            notes: ['Real IndexedDB in a unique QA database, no player world database.',
                'Submit time includes copying for worker postMessage; total includes the atomic transaction.',
                'All 32768 cells of every saved chunk are compared after immediate source mutation.',
                'Heartbeat includes two final animation frames; validation/readback CPU is outside write timing.',
                'One process, three consecutive repetitions per size; 16 is the cold worker trial.'] };
        const path = await window.performanceQA.report('storage-indexeddb', result);
        output.textContent = JSON.stringify({ rows, exit }, null, 2); status.textContent = `Zapis ${result.valid ? 'zweryfikowany' : 'NIEZGODNY'}: ${path}`;
    } catch (error) {
        errors.push(String(error.stack ?? error)); status.textContent = String(error);
        await window.performanceQA.report('storage-indexeddb-failure', { valid: false, rows, error: String(error.stack ?? error) });
    } finally {
        storageMeasure = null; storage?.background?.stop(); db?.close();
        await requestResult(indexedDB.deleteDatabase(name)); controls(false);
    }
};
requestAnimationFrame(tick);
await createScene('rivers');
