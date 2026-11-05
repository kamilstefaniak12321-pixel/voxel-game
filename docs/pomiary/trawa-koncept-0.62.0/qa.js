import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo } from '/src/storage/WorldStorage.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';

const panel = document.querySelector('aside'), status = panel.querySelector('[data-status]');
const output = panel.querySelector('pre'), errors = [], warnings = [];
const config = await window.performanceQA.config();
const originalError = console.error, originalWarn = console.warn;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); originalWarn(...args); };
addEventListener('error', event => errors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack ?? event.reason)));
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
for (const [key, value] of Object.entries({ potato: false, renderScale: 100, viewDistance: 64,
    farTerrain: 1024, farDetail: 2, shadows: 3, fpsLimit: 0, brightness: 0, bushyGrass: true,
    lightingModel: 'world', lightingLook: 'natural', cloudCover: 0, lightingMaterials: 'standard',
    surfaceBounce: true, leafTransmission: true, materialSpecular: true, bounceStrength: 18,
    bounceSaturation: 65, meteorites: false, lightShafts: true, bounceLight: false,
    showHand: false, loadBudget: 4, volumeMaster: 0, volumeMusic: 0, autoUpdates: false })) settings.set(key, value);
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
panel.querySelector('[data-device]').textContent = `${config.version} · ${config.baseline ? 'stary eksperyment' : 'koncept Kamila'} · ${device.renderer}`;
let game = null, scene = 'river', run = null, pending = [], last = 0, switching = false, readySince = 0;
let photo = false, orbit = 0, fixtureCount = 0;
settings.onChange(key => game?.applySettings(key));
const seed = 2138286349;
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
function positionCamera() {
    if (scene === 'river') {
        game.player.pos.set(198, 62, -261); game.player.vel.set(0, 0, 0);
        game.player.yaw = 2.297439 + orbit; game.player.pitch = -.4827;
        game.player.flying = true; game.player.updateCamera(); return;
    }
    const center = scene === 'dense' ? [24, 17.5, 24] : [8.5, 17.5, 8.5];
    const radius = scene === 'dense' ? 34 : 8;
    camera([center[0] + Math.sin(orbit) * radius, scene === 'dense' ? 24 : 19.4,
        center[2] + Math.cos(orbit) * radius], center);
}
function resources() {
    const grassByDetail = [0, 0, 0]; let grassChunks = 0;
    for (const chunk of game.world.chunks.values()) {
        const data = chunk.mesh?.geometry?.userData;
        if (data?.bushyGrassCount) { grassByDetail[data.bushyGrassDetail] += data.bushyGrassCount; grassChunks++; }
    }
    return { chunks: game.world.chunks.size, queued: game.world.loadQueue?.length ?? 0,
        dirty: game.world.dirtyChunks.size, grassByDetail, grassChunks,
        far: game.farTerrain.stats(), shadow: game.shadows.stats(), bounce: game.bounce?.stats?.(),
        worldOutput: game.worldOutput?.stats?.(), streaming: game.world.generation?.getStats?.() ?? null,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        heapMiB: performance.memory?.usedJSHeapSize / 1048576,
        failedPrograms: renderer.info.programs?.filter(p => p.diagnostics?.runnable === false).length ?? 0 };
}
function report() {
    return { scene, seed, terrain: game.worldInfo.terrain, fixtureCount, orbit, device,
        settings: snapshotSettings(), actualCamera: { position: game.camera.position.toArray(),
            direction: game.camera.getWorldDirection(new THREE.Vector3()).toArray() },
        resources: resources(), errors: [...errors], warnings: [...warnings] };
}
function controls(busy) {
    for (const button of panel.querySelectorAll('button')) button.disabled = busy;
    panel.querySelector('[data-cancel]').disabled = !run;
    panel.querySelector('[data-hide]').disabled = false;
}
async function createScene(name) {
    if (run || switching) return;
    switching = true; controls(true); status.textContent = 'Tworzę nowy izolowany świat…';
    try {
        if (game) await game.stop({ save: false }); game = null; scene = name; orbit = 0;
        const info = createWorldInfo('Odbiór koncepcji trawy', seed, name === 'river' ? 'realistic' : 'flat', 'developer');
        info.player = name === 'river' ? { x: 198, y: 62, z: -261, yaw: 2.297439, pitch: -.4827, flying: true }
            : { x: 24, y: 22.4, z: 58, yaw: 0, pitch: -.3, flying: true };
        game = await Game.start(renderer, input, null, info, settings);
        game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
        game.hand.resize(config.width / config.height); game.plantGrowth.speed = 0;
        game.time.speed = 0; game.time.days = .5; fixtureCount = 0;
        if (name !== 'river') {
            const cells = [];
            if (name === 'dense') for (let z = 0; z < 48; z++) for (let x = 0; x < 48; x++) cells.push([x, z]);
            else for (let z = 5; z <= 11; z += 3) for (let x = 5; x <= 11; x += 3) cells.push([x, z]);
            for (const [x, z] of cells) {
                game.world.setBlock(x, 16, z, 'grass');
                game.world.setBlock(x, 17, z, (x + z) % 2 ? 'short_grass' : 'tall_grass'); fixtureCount++;
            }
        }
        positionCamera(); readySince = 0; last = 0;
        status.textContent = `${scene}: stabilizacja terenu, świateł i cieni…`;
    } catch (error) { errors.push(String(error.stack ?? error)); status.textContent = String(error); }
    finally { switching = false; controls(false); }
}
const observer = PerformanceObserver.supportedEntryTypes?.includes('longtask') ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (run && run.start !== null && entry.startTime >= run.start && entry.startTime < run.end)
        run.longTasks.push({ atMs: entry.startTime - run.start, durationMs: entry.duration });
}) : null;
observer?.observe({ type: 'longtask', buffered: false });
function startRun() {
    if (!game || run || switching) return;
    run = { requestedAt: performance.now(), start: null, end: null, last: null, duration: 30,
        frames: [], cpu: [], updateCpu: [], renderCpu: [], gpu: [], longTasks: [],
        disjoint: 0, skipped: 0, unsettledFrames: 0, errorsAtStart: errors.length,
        before: null, startedAt: new Date().toISOString() };
    readySince = 0; controls(true);
}
async function finish(reason = null) {
    if (!run) return;
    const done = run; run = null;
    pending = pending.filter(q => { if (q.owner !== done) return true; gl.deleteQuery(q.query); return false; });
    const after = resources();
    const invalidReason = reason ?? (done.unsettledFrames ? 'Kolejki świata nie były puste podczas pomiaru nieruchomego kadru.' : null);
    const result = { ...report(), valid: !invalidReason && done.frames.length > 100 && done.errorsAtStart === errors.length && !after.failedPrograms,
        invalidReason, duration: done.duration, warmupSeconds: 10, startedAt: done.startedAt,
        frame: summary(done.frames), cpu: summary(done.cpu), updateCpu: summary(done.updateCpu), renderCpu: summary(done.renderCpu),
        gpu: summary(done.gpu), gpuValid: !!gpu && done.gpu.length > 100 && !done.disjoint,
        gpuDisjoint: done.disjoint, gpuSkipped: done.skipped, unsettledFrames: done.unsettledFrames,
        longTasks: done.longTasks, before: done.before, after,
        raw: { frames: done.frames, cpu: done.cpu, updateCpu: done.updateCpu, renderCpu: done.renderCpu, gpu: done.gpu },
        notes: ['Game.update and Game.render are real. Camera is fixed; audio and player saves are disabled.',
            'GPU query covers update/render command submission. Only frame.averageFps is game FPS.',
            'Dense scene places one grass tuft per block in a 48 x 48 field, alternating short/tall.',
            'Only compare the same scene, camera, settings, resolution and vsync across baseline/candidate.'] };
    const path = await window.performanceQA.report(`${scene}-${settings.get('bushyGrass') ? 'bushy' : 'ordinary'}-${settings.get('viewDistance')}`, result);
    output.textContent = JSON.stringify({ valid: result.valid, frame: result.frame, gpu: result.gpu, grassByDetail: after.grassByDetail }, null, 2);
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
    const start = performance.now(); let query = null;
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
    if (!stable) { readySince = 0; if (current) current.unsettledFrames++; }
    else if (!readySince) readySince = now;
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
panel.querySelector('[data-toggle]').onclick = () => {
    const next = !settings.get('bushyGrass'); settings.set('bushyGrass', next); readySince = 0;
    panel.querySelector('[data-toggle]').textContent = `Trawa eksperymentalna: ${next ? 'WŁ.' : 'WYŁ.'}`;
    status.textContent = `${scene}: stabilizacja po przełączeniu trawy…`;
};
panel.querySelector('[data-range]').onclick = () => {
    const next = settings.get('viewDistance') === 64 ? 128 : 64; settings.set('viewDistance', next); readySince = 0;
    panel.querySelector('[data-range]').textContent = `Pełny teren: ${next}`;
    status.textContent = `${scene}: stabilizacja zasięgu…`;
};
panel.querySelector('[data-orbit]').onclick = () => { orbit += Math.PI / 4; positionCamera(); readySince = 0; };
const togglePanel = () => { if (!photo) panel.hidden = !panel.hidden; };
panel.querySelector('[data-hide]').onclick = togglePanel; window.performanceQA.onTogglePanel(togglePanel);
panel.querySelector('[data-photo]').onclick = async () => {
    if (run || switching) return; photo = true; panel.hidden = true;
    try { await frame(); await frame(); const saved = await window.performanceQA.photo(`${scene}-${settings.get('bushyGrass') ? 'bushy' : 'ordinary'}`, report()); status.textContent = `Kadr: ${saved.photo}`; }
    finally { photo = false; panel.hidden = false; }
};
requestAnimationFrame(tick);
await createScene('river');
