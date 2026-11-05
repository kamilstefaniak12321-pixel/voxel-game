import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo } from '/src/storage/WorldStorage.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';
import { viewUniforms } from '/src/rendering/viewUniforms.js';
import { skyUniforms } from '/src/sky/skyShader.js';
import { buildLightingReference, LIGHTING_REFERENCE_CAMERAS, LIGHTING_REFERENCE_PRESETS } from '/src/dev/LightingReference.js';
import { buildAtmosphereHall, editAtmosphereHallWindow, ATMOSPHERE_HALL_CAMERAS, ATMOSPHERE_HALL_PROBES } from '/src/dev/AtmosphereReference.js';

const panel = document.querySelector('aside'), status = panel.querySelector('[data-status]');
const output = panel.querySelector('pre'), errors = [], warnings = [];
const config = await window.performanceQA.config();
const originalError = console.error, originalWarn = console.warn;
let startupPhase = 'renderer bootstrap';
let errorReports = 0;
const errorText = value => String(value?.stack ?? value);
const saveError = (reason, context = {}) => {
    const message = errorText(reason);
    if (errors.length < 200) errors.push(message);
    if (errorReports++ < 20) void window.performanceQA.report('renderer-error', { startupPhase, message, context,
        errors: [...errors], warnings: [...warnings] }).catch(error => originalError(error));
    return message;
};
console.error = (...args) => { saveError(args.map(errorText).join(' '), { source: 'console.error' }); originalError(...args); };
console.warn = (...args) => { if (warnings.length < 200) warnings.push(args.map(String).join(' ')); originalWarn(...args); };
addEventListener('error', event => saveError(event.error ?? event.message, { source: 'error', filename: event.filename, line: event.lineno }));
addEventListener('unhandledrejection', event => saveError(event.reason, { source: 'unhandledrejection' }));
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
for (const [key, value] of Object.entries({ potato: false, renderScale: 100, viewDistance: 64,
    farTerrain: 1024, farDetail: 2, shadows: 3, fpsLimit: 0, brightness: 0, bushyGrass: true,
    atmosphereLook: 'natural', lightingModel: 'world', lightingLook: 'natural', cloudCover: 0,
    lightingMaterials: 'standard', surfaceBounce: true, leafTransmission: true, materialSpecular: true,
    bounceStrength: 18, bounceSaturation: 65, meteorites: false, lightShafts: true, bounceLight: false,
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
panel.querySelector('[data-device]').textContent = `${config.version} · ${device.renderer} · ${config.width}×${config.height}`;
let game = null, scene = 'forest', cameraName = 'panorama', preset = 'noon', hallOpen = false;
let run = null, batch = null, pending = [], last = 0, switching = false, readySince = 0, photo = false;
const seed = 2138286349, frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const forestCameras = {
    panorama: { position: [188, 132, -252], target: [216, 67, -202] },
    river: { position: [198, 63.6, -261], target: [171.5, 45, -237.5] },
    horizon: { position: [188, 132, -252], target: [760, 95, -720] },
    high: { position: [188, 420, -252], target: [660, 65, -820] }
};
const cameraLabels = { panorama: 'Panorama', river: 'Brzeg', horizon: 'Daleki las', high: 'Z wysokości',
    hall: 'Wnętrze', window: 'Przy oknie', outside: 'Od zewnątrz', overview: 'Całość', materials: 'Materiały',
    foliage: 'Liście', roof: 'Dach', chamber: 'Komora', local: 'Ognisko' };
const presetLabels = { noon: 'Południe', golden: 'Złota godzina', sunset: 'Zachód', overcast: 'Pochmurno', blueHour: 'Zmierzch', night: 'Noc' };
const cameras = () => scene === 'forest' ? forestCameras : scene === 'hall' ? ATMOSPHERE_HALL_CAMERAS : LIGHTING_REFERENCE_CAMERAS;
settings.onChange(key => game?.applySettings(key));
const snapshotSettings = () => Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)]));
const summary = values => {
    if (!values.length) return { count: 0 };
    const sorted = [...values].sort((a, b) => a - b), sum = values.reduce((s, n) => s + n, 0);
    return { count: values.length, meanMs: sum / values.length, medianMs: (sorted[(values.length - 1) >> 1] + sorted[values.length >> 1]) / 2,
        p95Ms: sorted[Math.ceil(values.length * .95) - 1], p99Ms: sorted[Math.ceil(values.length * .99) - 1], maxMs: sorted.at(-1),
        averageFps: 1000 * values.length / sum, above16_67ms: values.filter(n => n > 1000 / 60).length,
        above33_33ms: values.filter(n => n > 1000 / 30).length, above50ms: values.filter(n => n > 50).length };
};
function pointCamera(position, target) {
    const [x, y, z] = position, dx = target[0] - x, dy = target[1] - y, dz = target[2] - z;
    game.player.pos.set(x, y - game.player.eyeHeight, z); game.player.vel.set(0, 0, 0);
    game.player.yaw = Math.atan2(-dx, -dz); game.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    game.player.flying = true; game.player.updateCamera();
}
const positionCamera = () => { const view = cameras()[cameraName]; pointCamera(view.position, view.target); };
function fly(seconds) {
    const phase = seconds / 120 * Math.PI * 2;
    const x = 188 + 96 * Math.sin(phase), z = -252 + 48 * (Math.cos(phase) - 1);
    const ground = game.world.generator.getHeight(Math.floor(x), Math.floor(z));
    pointCamera([x, ground + 18, z], [x - 40, ground + 3, z - 60]);
}
function resources() {
    return { chunks: game.world.chunks.size, queued: game.world.loadQueue?.length ?? 0,
        dirty: game.world.dirtyChunks.size, meshVersion: game.world.meshVersion ?? 0,
        far: game.farTerrain.stats(), shadow: game.shadows.stats(), bounce: game.bounce?.stats?.(),
        worldOutput: game.worldOutput?.stats?.(), streaming: game.world.generation?.getStats?.() ?? null,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length ?? 0,
        heapMiB: performance.memory?.usedJSHeapSize / 1048576,
        failedPrograms: renderer.info.programs?.filter(p => p.diagnostics?.runnable === false).length ?? 0 };
}
const uniformSnapshot = uniforms => Object.fromEntries(Object.entries(uniforms).filter(([key]) =>
    /Aerial|Haze|Fog|Underwater|FarEnabled|FarInner|FarOuter|Time/.test(key)).map(([key, { value }]) => [key, value?.toArray ? value.toArray() : value]));
function report() {
    const p = game.camera.position;
    return { scene, cameraName, preset, hallOpen, seed: game.worldInfo.seed, terrain: game.worldInfo.terrain, device,
        settings: snapshotSettings(), timeDays: game.time.days,
        actualCamera: { position: p.toArray(), direction: game.camera.getWorldDirection(new THREE.Vector3()).toArray() },
        atmosphere: { view: uniformSnapshot(viewUniforms), sky: uniformSnapshot(skyUniforms),
            cameraLight: game.world.getLight(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)),
            hallProbes: scene === 'hall' ? Object.fromEntries(Object.entries(ATMOSPHERE_HALL_PROBES).map(([key, pos]) => [key, game.world.getLight(...pos)])) : null },
        resources: resources(), errors: [...errors], warnings: [...warnings] };
}
function controls() {
    const busy = !!run || !!batch || photo || switching;
    for (const button of panel.querySelectorAll('button')) button.disabled = busy;
    panel.querySelector('[data-cancel]').disabled = !run && !batch;
    panel.querySelector('[data-hide]').disabled = false;
    panel.querySelector('[data-window]').disabled = busy || scene !== 'hall';
    panel.querySelector('[data-flight]').disabled = busy || scene !== 'forest';
}
function labels() {
    panel.querySelector('[data-toggle]').textContent = `Atmosfera: ${settings.get('atmosphereLook') === 'natural' ? 'Nowa' : '0.62'}`;
    panel.querySelector('[data-clouds]').textContent = `Chmury: ${settings.get('cloudCover')}%`;
    panel.querySelector('[data-range]').textContent = `Pełny teren: ${settings.get('viewDistance')}`;
    panel.querySelector('[data-horizon]').textContent = `Horyzont: ${settings.get('farTerrain')}`;
    panel.querySelector('[data-window]').textContent = `Okno korytarza: ${hallOpen ? 'otwarte' : 'zamknięte'}`;
    panel.querySelector('[data-potato]').textContent = `Jakość: ${settings.get('potato') ? 'ziemniak' : 'standardowa'}`;
    panel.querySelector('[data-shafts]').textContent = `Promienie: ${settings.get('lightShafts') ? 'WŁ.' : 'WYŁ.'}`;
}
const changed = message => { readySince = 0; labels(); status.textContent = `${message}: stabilizacja…`; };
function cameraButtons() {
    const target = panel.querySelector('[data-cameras]'); target.replaceChildren();
    for (const name of Object.keys(cameras())) {
        const button = document.createElement('button'); button.textContent = cameraLabels[name] ?? name;
        button.onclick = () => { cameraName = name; positionCamera(); changed(name); }; target.append(button);
    }
}
function setPreset(name) {
    preset = name; const value = LIGHTING_REFERENCE_PRESETS[name];
    game.time.days = value.time; settings.set('cloudCover', value.cloudCover * 100); changed(name);
}
async function createScene(name) {
    if (run || batch || switching) return;
    switching = true; controls(); status.textContent = 'Tworzę izolowany świat…';
    try {
        if (game) await game.stop({ save: false }); game = null; scene = name; hallOpen = false;
        cameraName = name === 'forest' ? 'panorama' : name === 'hall' ? 'hall' : 'materials';
        const view = cameras()[cameraName];
        const info = createWorldInfo('Odbiór atmosfery', name === 'forest' ? seed : 42, name === 'forest' ? 'realistic' : 'flat', 'developer');
        info.player = { x: view.position[0], y: view.position[1] - 1.6, z: view.position[2], yaw: 0, pitch: 0, flying: true };
        startupPhase = `Game.start(${name})`;
        game = await Game.start(renderer, input, null, info, settings);
        startupPhase = `build fixture(${name})`;
        game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
        game.hand.resize(config.width / config.height); game.plantGrowth.speed = 0; game.time.speed = 0;
        if (name === 'hall') { settings.set('viewDistance', 128); buildAtmosphereHall(game.world); }
        else if (name === 'palette') {
            buildLightingReference({ game, world: game.world, player: game.player });
            // Pochodnia obok neutralnych materiałów: kontrola zachowania ciepłego emitera.
            game.world.setBlock(64, 17, -92, 'torch');
        }
        positionCamera(); setPreset(preset); readySince = 0; last = 0; cameraButtons();
        startupPhase = 'running';
    } catch (error) {
        const message = saveError(error, { source: 'createScene', scene: name, info: 'Game.start includes shader warmup' });
        originalError(message); output.textContent = message; status.textContent = String(error);
    }
    finally { switching = false; controls(); labels(); }
}
const observer = PerformanceObserver.supportedEntryTypes?.includes('longtask') ? new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (run && run.start !== null && entry.startTime >= run.start && entry.startTime < run.end)
        run.longTasks.push({ atMs: entry.startTime - run.start, durationMs: entry.duration });
}) : null;
observer?.observe({ type: 'longtask', buffered: false });
function startRun(motion = 'static') {
    if (!game || run || switching || photo) return;
    run = { requestedAt: performance.now(), start: null, end: null, last: null, duration: motion === 'flight' ? 120 : 30,
        motion, frames: [], cpu: [], updateCpu: [], renderCpu: [], gpu: [], longTasks: [], milestones: [],
        disjoint: 0, skipped: 0, unsettledFrames: 0, errorsAtStart: errors.length,
        before: null, startedAt: new Date().toISOString() };
    readySince = 0; controls();
}
async function finish(reason = null) {
    if (!run) return;
    const done = run; run = null;
    pending = pending.filter(q => { if (q.owner !== done) return true; gl.deleteQuery(q.query); return false; });
    const after = resources();
    const invalidReason = reason ?? (done.motion === 'static' && done.unsettledFrames ? 'Niepusta kolejka podczas nieruchomej próby.' : null);
    const result = { ...report(), valid: !invalidReason && done.frames.length > 100 && done.errorsAtStart === errors.length && !after.failedPrograms,
        invalidReason, duration: done.duration, motion: done.motion, warmupSeconds: 10, startedAt: done.startedAt,
        frame: summary(done.frames), cpu: summary(done.cpu), updateCpu: summary(done.updateCpu), renderCpu: summary(done.renderCpu),
        gpu: summary(done.gpu), gpuValid: !!gpu && done.gpu.length > 100 && !done.disjoint,
        gpuDisjoint: done.disjoint, gpuSkipped: done.skipped, unsettledFrames: done.unsettledFrames,
        longTasks: done.longTasks, before: done.before, after, milestones: done.milestones,
        meshRebuildsDuringSample: after.meshVersion - (done.before?.meshVersion ?? after.meshVersion),
        raw: { frames: done.frames, cpu: done.cpu, updateCpu: done.updateCpu, renderCpu: done.renderCpu, gpu: done.gpu },
        notes: ['Real Game.update/render; isolated settings and no player saves.',
            'A/B uses the same code and natural HDR palette; only atmosphereLook changes.',
            'Only frame.averageFps is game FPS. GPU timing is not an FPS estimate.',
            'Static measurements require empty queues; flight intentionally includes streaming.'] };
    const path = await window.performanceQA.report(`${scene}-${cameraName}-${preset}-${settings.get('atmosphereLook')}-${done.motion}`, result);
    output.textContent = JSON.stringify({ valid: result.valid, frame: result.frame, gpu: result.gpu, meshRebuilds: result.meshRebuildsDuringSample }, null, 2);
    status.textContent = `${result.valid ? 'Zapisano' : 'Nieważny'}: ${path}`;
    if (batch && result.valid && result.gpuValid && !reason) {
        batch.results.push({ path, look: result.settings.atmosphereLook, frame: result.frame, gpu: result.gpu, cpu: result.cpu });
        if (++batch.index < batch.order.length) { settings.set('atmosphereLook', batch.order[batch.index]); labels(); startRun(); }
        else {
            const complete = batch; batch = null; settings.set('atmosphereLook', complete.restore); labels();
            const saved = await window.performanceQA.report('three-pairs', { ...report(), comparison: 'same-code A/B', results: complete.results });
            status.textContent = `Trzy pary gotowe: ${saved}`;
        }
    } else if (batch) { settings.set('atmosphereLook', batch.restore); batch = null; labels(); }
    controls();
}
function stableWorld() {
    const stream = game.world.generation?.getStats?.();
    const bounce = game.bounce?.stats?.();
    return !game.world.loadQueue?.length && !game.world.dirtyChunks.size && !stream?.pending && !stream?.ready &&
        !game.farTerrain.requests.size && !game.farTerrain.wanted.some(tile => !tile.mesh || tile.stale) &&
        (bounce?.enabled !== true || bounce.ready !== false);
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
    if (run?.motion === 'flight' && run.start !== null) fly(Math.max(0, (now - run.start) / 1000));
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
        if ((now - current.start) / 1000 >= current.milestones.length * 10) current.milestones.push({ atMs: now - current.start, ...resources() });
    }
    const stable = stableWorld();
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
    } else if (readySince && now - readySince > 2000 && status.textContent.includes('stabilizacja')) status.textContent = `${scene}/${cameraName}/${preset}: gotowe.`;
}
async function takePhotoPair(pair) {
    if (run || batch || switching || !stableWorld() || !readySince || performance.now() - readySince < 2000) {
        status.textContent = 'Zaczekaj na stabilizację przed zdjęciem.'; return;
    }
    photo = true; controls(); panel.hidden = true;
    const restore = settings.get('atmosphereLook'), beforeMesh = game.world.meshVersion ?? 0;
    try {
        const saved = [];
        for (const look of pair ? ['baseline', 'natural'] : [restore]) {
            settings.set('atmosphereLook', look); await frame(); await frame();
            saved.push(await window.performanceQA.photo(`${scene}-${cameraName}-${preset}-${look}`, { ...report(),
                frozenAnimations: true, meshRebuildsSincePairStart: (game.world.meshVersion ?? 0) - beforeMesh }));
        }
        status.textContent = `Kadry: ${saved.map(s => s.photo).join(' | ')}`;
    } finally { settings.set('atmosphereLook', restore); photo = false; panel.hidden = false; labels(); controls(); }
}
for (const button of panel.querySelectorAll('[data-scene]')) button.onclick = () => void createScene(button.dataset.scene);
for (const [name, label] of Object.entries(presetLabels)) {
    const button = document.createElement('button'); button.textContent = label;
    button.onclick = () => setPreset(name); panel.querySelector('[data-presets]').append(button);
}
panel.querySelector('[data-reset]').onclick = () => void createScene(scene);
panel.querySelector('[data-run]').onclick = () => startRun();
panel.querySelector('[data-flight]').onclick = () => { fly(0); startRun('flight'); };
panel.querySelector('[data-pairs]').onclick = () => {
    batch = { order: ['baseline', 'natural', 'natural', 'baseline', 'baseline', 'natural'], index: 0, results: [], restore: settings.get('atmosphereLook') };
    settings.set('atmosphereLook', batch.order[0]); labels(); startRun();
};
panel.querySelector('[data-cancel]').onclick = () => void finish('Anulowano');
panel.querySelector('[data-toggle]').onclick = () => { settings.set('atmosphereLook', settings.get('atmosphereLook') === 'natural' ? 'baseline' : 'natural'); changed('Atmosfera'); };
panel.querySelector('[data-clouds]').onclick = () => { settings.set('cloudCover', (settings.get('cloudCover') + 25) % 125); changed('Chmury'); };
panel.querySelector('[data-range]').onclick = () => { settings.set('viewDistance', settings.get('viewDistance') === 64 ? 128 : 64); changed('Zasięg'); };
panel.querySelector('[data-horizon]').onclick = () => { settings.set('farTerrain', settings.get('farTerrain') === 1024 ? 2048 : 1024); changed('Horyzont'); };
panel.querySelector('[data-window]').onclick = () => { hallOpen = !hallOpen; editAtmosphereHallWindow(game.world, hallOpen); changed('Okno'); };
panel.querySelector('[data-potato]').onclick = () => { settings.set('potato', !settings.get('potato')); changed('Jakość'); };
panel.querySelector('[data-shafts]').onclick = () => { settings.set('lightShafts', !settings.get('lightShafts')); changed('Promienie'); };
panel.querySelector('[data-photo]').onclick = () => void takePhotoPair(false);
panel.querySelector('[data-photo-pair]').onclick = () => void takePhotoPair(true);
const togglePanel = () => { if (!photo) panel.hidden = !panel.hidden; };
panel.querySelector('[data-hide]').onclick = togglePanel; window.performanceQA.onTogglePanel(togglePanel);
requestAnimationFrame(tick);
await createScene('forest');
