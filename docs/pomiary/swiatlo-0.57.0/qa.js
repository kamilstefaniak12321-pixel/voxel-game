import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo } from '/src/storage/WorldStorage.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';
import { buildLightingReference, placeLightingReferenceCamera, LIGHTING_REFERENCE_CAMERAS,
    LIGHTING_REFERENCE_PRESETS, LIGHTING_REFERENCE_SEED } from '/src/dev/LightingReference.js';

const panel = document.querySelector('aside'), status = panel.querySelector('[data-status]');
const setStatus = text => { if (status.textContent !== text) status.textContent = text; };
const output = panel.querySelector('pre'), errors = [];
const consoleError = console.error;
console.error = (...values) => {
    if (errors.length < 100) errors.push(values.map(String).join(' '));
    consoleError(...values);
};
addEventListener('error', event => errors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack ?? event.reason)));
const config = await window.lightingQA.config();
// Osobny profil aplikacji i dodatkowo brak odczytu/zapisu ustawień/światów.
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
const configured = { potato: false, renderScale: 100, viewDistance: 64, farTerrain: 1024,
    farDetail: 2, shadows: 3, fpsLimit: 0, brightness: 0, lightingModel: 'world',
    lightingLook: config.baseline ? 'baseline' : 'natural', cloudCover: 0,
    meteorites: false, lightShafts: false, bounceLight: false, showHand: false, loadBudget: 8,
    volumeMaster: 0, musicVolume: 0, autoUpdates: false };
for (const [key, value] of Object.entries(configured)) settings.set(key, value);
await atlasReady;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(config.width, config.height);
renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const input = new Proxy({}, { get: (_, key) => key === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
const info = createWorldInfo('Odbiór palety', LIGHTING_REFERENCE_SEED, 'flat', 'developer');
let game = await Game.start(renderer, input, null, info, settings);
game.camera.aspect = config.width / config.height;
game.camera.updateProjectionMatrix();
game.hand.resize(config.width / config.height);
game.plantGrowth.speed = 0;
settings.onChange(key => { game?.applySettings(key); applyPlantShadowOverride(); });
buildLightingReference({ game, world: game.world, player: game.player });
game.time.speed = 0;
const gl = renderer.getContext();
const gpu = gl.getExtension('EXT_disjoint_timer_query_webgl2');
const debug = gl.getExtension('WEBGL_debug_renderer_info');
const device = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webgl2: renderer.capabilities.isWebGL2, gpuTimerSupported: !!gpu, userAgent: navigator.userAgent,
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], devicePixelRatio, antialias: gl.getContextAttributes().antialias };
panel.querySelector('[data-device]').textContent = `${config.version} · ${device.renderer} · ${config.width}×${config.height}`;

let preset = 'noon', camera = 'overview', look = config.baseline ? 'baseline' : 'natural';
let animate = true, run = null, pending = [], lastFrame = 0, readySince = 0, settleFrames = 3, photograph = false;
let sceneName = 'paleta', switching = false, plantShadows = true, motion = 'static', motionOrigin = 0;
let photoBatch = null;
let debugView = 'full';
const components = { sun: true, moon: true, sky: true, bounce: true, local: true, emission: true };
const diagnostics = config.baseline ? null : await import('/src/rendering/LightingDiagnostics.js');
const FOREST_SEED = 2138286349;
const FOREST_CAMERAS = {
    panorama: { position: [188, 132, -252], target: [216, 67, -202] },
    bank: { position: [188, 54.6, -252], target: [168, 52, -265] }
};
const lookSupported = 'lightingLook' in SETTINGS_DEFAULTS;
const cloudsSupported = 'cloudCover' in SETTINGS_DEFAULTS;
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
const settingsSnapshot = () => Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)]));
const summaries = values => {
    if (!values.length) return { samples: 0, medianMs: null, p95Ms: null, meanMs: null };
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return { samples: values.length, medianMs: sorted[Math.floor((sorted.length - 1) * .5)],
        p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], meanMs: mean,
        p99Ms: sorted[Math.ceil(sorted.length * .99) - 1], maxMs: sorted.at(-1), averageFps: 1000 / mean };
};
function resources() {
    return { chunks: game.world.chunks.size, queued: game.world.loadQueue?.length ?? 0,
        dirty: game.world.dirtyChunks.size, meshVersion: game.world.meshVersion ?? 0,
        far: game.farTerrain.stats(), shadow: game.shadows.stats(),
        worldOutput: game.worldOutput?.stats?.() ?? { mode: 'original-0.56.1', samples: 0, estimatedBytes: 0 },
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        programs: renderer.info.programs?.length ?? 0,
        failedPrograms: renderer.info.programs?.filter(program => program.diagnostics?.runnable === false).length ?? 0,
        heapMiB: performance.memory?.usedJSHeapSize / 1048576 };
}
function report() {
    return { scene: sceneName, seed: sceneName === 'forest' ? FOREST_SEED : LIGHTING_REFERENCE_SEED, device, preset, camera, look, animate,
        view: sceneName === 'forest' ? FOREST_CAMERAS[camera] : LIGHTING_REFERENCE_CAMERAS[camera],
        actualCamera: { position: game.camera.position.toArray(), direction: game.camera.getWorldDirection(new THREE.Vector3()).toArray() },
        motion, motionPeriodSeconds: 30, plantShadowsRequested: plantShadows,
        debugView, components: { ...components },
        forest: sceneName === 'forest' ? { terrain: 'realistic', groundAtReference: game.world.generator.getHeight(188, -252),
            referenceEye: [188, 132, -252], near: 64, horizon: 1024, shadowTarget: 800, lightShafts: settings.get('lightShafts') } : null,
        requested: LIGHTING_REFERENCE_PRESETS[preset],
        effective: { time: game.time.days, cloudCover: cloudsSupported ? settings.get('cloudCover') : null,
            lightingLook: lookSupported ? settings.get('lightingLook') : '0.56.1-original' },
        settings: settingsSnapshot(), resources: resources(), errors: [...errors] };
}
const fileName = () => `${sceneName}-${camera}-${preset}-${look}-${motion}-${plantShadows ? 'plants' : 'no-plants'}-${debugView}`;
function changed() {
    readySince = 0; settleFrames = 3; motionOrigin = performance.now();
    panel.querySelector('[data-light-shafts]').checked = settings.get('lightShafts');
    for (const button of panel.querySelectorAll('[data-preset]')) button.setAttribute('aria-pressed', button.dataset.preset === preset);
    for (const button of panel.querySelectorAll('[data-camera]')) button.setAttribute('aria-pressed', button.dataset.camera === camera);
    for (const button of panel.querySelectorAll('[data-look]')) button.setAttribute('aria-pressed', button.dataset.look === look);
    for (const button of panel.querySelectorAll('[data-scene]')) button.setAttribute('aria-pressed', button.dataset.scene === sceneName);
    status.textContent = `${sceneName} / ${camera} / ${preset} / ${look}. Wczytywanie i stabilizacja…`;
}
function presetTo(name) {
    if (run || photograph || switching) return;
    preset = name;
    game.time.days = LIGHTING_REFERENCE_PRESETS[name].time;
    settings.set('cloudCover', LIGHTING_REFERENCE_PRESETS[name].cloudCover * 100);
    changed();
}
function cameraTo(name) {
    if (run || photograph || switching) return;
    camera = name;
    if (sceneName === 'forest') forestCamera(0);
    else placeLightingReferenceCamera(game.player, name);
    changed();
}
function pointCamera(position, target) {
    const [x, y, z] = position;
    const dx = target[0] - x, dy = target[1] - y, dz = target[2] - z;
    game.player.pos.set(x, y - game.player.eyeHeight, z);
    game.player.vel.set(0, 0, 0);
    game.player.yaw = Math.atan2(-dx, -dz);
    game.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    game.player.flying = true;
    game.player.updateCamera();
}
function forestCamera(seconds) {
    const view = FOREST_CAMERAS[camera] ?? FOREST_CAMERAS.panorama;
    const phase = seconds / 30 * Math.PI * 2;
    if (motion === 'walk') {
        const x = 188 + 24 * Math.sin(phase), z = -252 + 12 * (Math.cos(phase) - 1);
        const ground = game.world.generator.getHeight(Math.floor(x), Math.floor(z));
        // Powtarzalny tor kamery nad gruntem, bez zmian bloków i kolizji z drzewem.
        pointCamera([x, ground + 3.6, z], [x - 16, ground + 1.5, z - 20]);
    } else if (motion === 'orbit') {
        pointCamera([view.position[0] + 12 * Math.sin(phase), view.position[1],
            view.position[2] + 12 * (Math.cos(phase) - 1)], view.target);
    } else pointCamera(view.position, view.target);
}
function applyPlantShadowOverride() {
    if (game?.shadows?.setNaturalLighting) game.shadows.setNaturalLighting(plantShadows && look === 'natural');
}
function applyDiagnostics() {
    if (!diagnostics) return;
    diagnostics.setLightingView(debugView);
    for (const [name, enabled] of Object.entries(components)) diagnostics.setLightingComponent(name, enabled);
}
const presetLabels = { noon: 'Południe', golden: 'Złota godzina', sunset: 'Zachód', overcast: 'Zachmurzenie', blueHour: 'Niebieska godzina', night: 'Noc' };
const cameraLabels = { overview: 'Całość', materials: 'Materiały', foliage: 'Borówka', roof: 'Dach', window: 'Okno', chamber: 'Komora', local: 'Ognisko' };
for (const [name, label] of Object.entries(presetLabels)) {
    const button = document.createElement('button'); button.textContent = label; button.dataset.preset = name;
    button.onclick = () => presetTo(name); panel.querySelector('[data-presets]').append(button);
}
function cameraButtons() {
    const target = panel.querySelector('[data-cameras]'); target.replaceChildren();
    const labels = sceneName === 'forest' ? { panorama: 'Panorama 132', bank: 'Brzeg z bliska' } : cameraLabels;
    for (const [name, label] of Object.entries(labels)) {
        const button = document.createElement('button'); button.textContent = label; button.dataset.camera = name;
        button.onclick = () => cameraTo(name); target.append(button);
    }
}
cameraButtons();
for (const button of panel.querySelectorAll('[data-look]')) {
    button.disabled = !lookSupported;
    button.onclick = () => { if (run || photograph || switching) return; look = button.dataset.look; settings.set('lightingLook', look); applyPlantShadowOverride(); changed(); };
}
panel.querySelector('[data-animate]').onchange = event => {
    if (run) { event.target.checked = animate; return; }
    animate = event.target.checked; changed();
};
const setControls = busy => {
    for (const button of panel.querySelectorAll('button')) button.disabled = busy || (button.dataset.look && !lookSupported);
    panel.querySelector('[data-cancel]').disabled = !run && !photoBatch;
    panel.querySelector('[data-cancel]').textContent = photoBatch ? 'Anuluj serię' : 'Anuluj';
    panel.querySelector('[data-profiles-gray]').disabled = busy || !diagnostics;
    panel.querySelector('[data-animate]').disabled = busy;
    panel.querySelector('[data-plant-shadows]').disabled = busy || !game?.shadows?.setNaturalLighting;
    panel.querySelector('[data-light-shafts]').disabled = busy;
    panel.querySelector('[data-motion]').disabled = busy;
    panel.querySelector('[data-debug-view]').disabled = busy || !diagnostics;
    for (const checkbox of panel.querySelectorAll('[data-component]')) checkbox.disabled = busy;
};
panel.querySelector('[data-plant-shadows]').disabled = !game.shadows.setNaturalLighting;
panel.querySelector('[data-plant-shadows]').onchange = event => {
    if (run || switching) return;
    plantShadows = event.target.checked; applyPlantShadowOverride(); changed();
};
panel.querySelector('[data-light-shafts]').onchange = event => {
    if (run || photograph || switching) return;
    settings.set('lightShafts', event.target.checked); changed();
};
panel.querySelector('[data-motion]').onchange = event => {
    if (run || switching) return;
    motion = event.target.value; forestCamera(0); changed();
};
if (diagnostics) {
    const select = panel.querySelector('[data-debug-view]'); select.replaceChildren(); select.disabled = false;
    for (const name of diagnostics.LIGHTING_VIEWS) {
        const option = document.createElement('option'); option.value = name; option.textContent = name; select.append(option);
    }
    select.onchange = () => { if (run || switching) return; debugView = select.value; applyDiagnostics(); changed(); };
    for (const name of Object.keys(components)) {
        const label = document.createElement('label'), checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = true; checkbox.dataset.component = name;
        checkbox.onchange = () => { if (run || switching) return; components[name] = checkbox.checked; applyDiagnostics(); changed(); };
        label.append(checkbox, name + ' '); panel.querySelector('[data-components]').append(label);
    }
} else panel.querySelector('[data-diagnostics]').title = 'Wydanie 0.56.1 nie ma tej diagnostyki.';

async function switchScene(name) {
    if (run || photograph || switching) return;
    switching = true; setControls(true);
    setStatus('Zwalniam poprzedni świat i przygotowuję osobną scenę…');
    try {
        await game.stop({ save: false }); game = null;
        sceneName = name; motion = 'static'; panel.querySelector('[data-motion]').value = motion;
        settings.set('lightShafts', name === 'forest');
        settings.set('viewDistance', 64); settings.set('farTerrain', 1024); settings.set('shadows', 3);
        const nextInfo = createWorldInfo(name === 'forest' ? 'Las i horyzont 800+' : 'Odbiór palety',
            name === 'forest' ? FOREST_SEED : LIGHTING_REFERENCE_SEED, name === 'forest' ? 'realistic' : 'flat', 'developer');
        if (name === 'forest') nextInfo.player = { x: 188, y: 130.4, z: -252, yaw: 3.65, pitch: -.7, flying: true };
        game = await Game.start(renderer, input, null, nextInfo, settings);
        game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
        game.hand.resize(config.width / config.height); game.plantGrowth.speed = 0; game.time.speed = 0;
        game.time.days = LIGHTING_REFERENCE_PRESETS[preset].time;
        camera = name === 'forest' ? 'panorama' : 'overview';
        if (name === 'forest') forestCamera(0);
        else buildLightingReference({ game, world: game.world, player: game.player });
        applyPlantShadowOverride(); applyDiagnostics();
        panel.querySelector('[data-title]').textContent = name === 'forest'
            ? 'Las / horyzont 800+ — seed 2138286349 · pełne 64, LOD 1024'
            : 'Paleta światła — stała scena 42 / flat';
        panel.querySelector('[data-forest-controls]').hidden = name !== 'forest';
        cameraButtons(); changed(); lastFrame = 0;
    } catch (error) { errors.push(String(error.stack ?? error)); setStatus('Błąd przełączania sceny: ' + error.message); }
    finally { switching = false; setControls(false); }
}
for (const button of panel.querySelectorAll('[data-scene]')) button.onclick = () => void switchScene(button.dataset.scene);
panel.querySelector('[data-reset]').onclick = () => {
    if (run || photograph || switching) return;
    if (sceneName === 'forest') { forestCamera(0); changed(); }
    else { buildLightingReference({ game, world: game.world, player: game.player }); placeLightingReferenceCamera(game.player, camera); changed(); }
};
const togglePanel = () => { if (!photograph) panel.hidden = !panel.hidden; };
panel.querySelector('[data-hide]').onclick = togglePanel;
window.lightingQA.onTogglePanel(togglePanel);

function clearQueries(owner) {
    pending = pending.filter(item => {
        if (item.owner !== owner) return true;
        gl.deleteQuery(item.query); return false;
    });
}
async function finish(reason = null) {
    if (!run) return;
    const done = run; run = null;
    clearQueries(done);
    const endResources = resources();
    const movement = done.motion !== 'static';
    const valid = !reason && done.frames.length > 100 && (movement || done.stableMeshes === endResources.meshVersion) &&
        errors.length === done.errorsAtStart && !endResources.failedPrograms && done.disjointEvents === 0 &&
        (movement || (!endResources.queued && !endResources.dirty && !endResources.far.missing));
    const result = { ...report(), valid, invalidReason: reason ?? (valid ? null : 'Zmiana geometrii, błąd, rozłączne GPU lub brak dostatecznych próbek'),
        durationSeconds: 30, warmupSeconds: 10, startedAt: done.iso,
        frame: summaries(done.frames), cpu: summaries(done.cpu), updateCpu: summaries(done.updateCpu),
        renderCpu: summaries(done.renderCpu), gpu: summaries(done.gpu),
        gpuDisjointEvents: done.disjointEvents, gpuSkipped: done.gpuSkipped,
        before: done.before, after: endResources, raw: { frames: done.frames, cpu: done.cpu, gpu: done.gpu } };
    result.geometryChanges = endResources.meshVersion - done.stableMeshes;
    result.benchmarkKind = movement ? 'movement-including-streaming' : 'static-colour-and-rendering';
    setControls(false);
    const target = await window.lightingQA.report(fileName(), result);
    output.textContent = JSON.stringify({ valid, frame: result.frame, cpu: result.cpu, gpu: result.gpu, target }, null, 2);
    status.textContent = `${valid ? 'Pomiar zapisany' : 'Pomiar nieważny'}: ${reason ?? (result.frame.averageFps?.toFixed(1) + ' FPS')}. ${target}`;
}
panel.querySelector('[data-cancel]').onclick = () => {
    if (photoBatch) photoBatch.cancelled = true;
    else void finish('Anulowano');
};
panel.querySelector('[data-measure]').onclick = () => {
    if (run || photograph || switching || !game) return;
    run = { requestedAt: performance.now(), start: null, end: null, last: null, frames: [], cpu: [],
        updateCpu: [], renderCpu: [], gpu: [], disjointEvents: 0, gpuSkipped: 0, errorsAtStart: errors.length,
        iso: new Date().toISOString(), motion, before: resources() };
    if (sceneName === 'forest') forestCamera(0);
    readySince = 0; setControls(true);
    status.textContent = 'Czekam na puste kolejki, 2 s stabilności i 10 s rozgrzewki.';
};
async function savePhoto() {
    const wasHidden = panel.hidden;
    panel.hidden = true;
    try {
        await frame(); await frame();
        return await window.lightingQA.photo(fileName(), report());
    } finally { panel.hidden = wasHidden; }
}
panel.querySelector('[data-photo]').onclick = async () => {
    if (run || photograph || switching || !game) return;
    photograph = true;
    try {
        const paths = await savePhoto();
        status.textContent = `Kadr zapisany: ${paths.photo}`;
    } finally { photograph = false; }
};

async function waitForPhotoReady(label) {
    const start = performance.now();
    let shadowsReadySince = 0;
    for (;;) {
        if (photoBatch.cancelled) throw new Error('Seria anulowana');
        if (document.hidden || !document.hasFocus()) throw new Error('Okno straciło aktywność');
        const now = performance.now(), shadows = game.shadows.stats();
        const shadowReady = !game.shadows.active || shadows.cascades.every(cascade => cascade.valid && !cascade.building);
        if (!shadowReady) shadowsReadySince = 0;
        else if (!shadowsReadySince) shadowsReadySince = now;
        if (readySince && now - readySince >= 2000 && shadowsReadySince && now - shadowsReadySince >= 500) return;
        if (now - start > 60000) throw new Error('Kolejki lub cienie nie ustabilizowały się w 60 s');
        setStatus(`${label}: czekam na teren i cienie (${Math.floor((now - start) / 1000)} s)…`);
        await frame();
    }
}
async function saveProfiles(grayscale) {
    if (run || photograph || switching || !game || (grayscale && !diagnostics)) return;
    const saved = { preset, debugView, time: game.time.days, clouds: settings.get('cloudCover'),
        motionOrigin, start: performance.now(), position: game.camera.position.toArray(),
        target: game.camera.position.clone().add(game.camera.getWorldDirection(new THREE.Vector3())).toArray() };
    const paths = [];
    photoBatch = { cancelled: false, position: saved.position, target: saved.target };
    photograph = true; setControls(true);
    let failure = null;
    try {
        debugView = grayscale ? 'grayscale' : 'full';
        panel.querySelector('[data-debug-view]').value = debugView;
        applyDiagnostics();
        const names = Object.keys(LIGHTING_REFERENCE_PRESETS);
        for (const [index, name] of names.entries()) {
            preset = name; game.time.days = LIGHTING_REFERENCE_PRESETS[name].time;
            settings.set('cloudCover', LIGHTING_REFERENCE_PRESETS[name].cloudCover * 100);
            changed();
            const label = `${grayscale ? 'Szarość' : 'Kolor'} ${index + 1}/${names.length} — ${presetLabels[name]}`;
            await waitForPhotoReady(label);
            setStatus(`${label}: zapisuję PNG i ustawienia…`);
            paths.push(await savePhoto());
        }
    } catch (error) { failure = error.message; }
    finally {
        preset = saved.preset; debugView = saved.debugView; game.time.days = saved.time;
        settings.set('cloudCover', saved.clouds);
        panel.querySelector('[data-debug-view]').value = debugView;
        applyDiagnostics();
        pointCamera(saved.position, saved.target);
        photoBatch = null; photograph = false; changed();
        motionOrigin = saved.motionOrigin + performance.now() - saved.start;
        setControls(false); panel.hidden = false;
        output.textContent = JSON.stringify({ series: grayscale ? 'grayscale' : 'colour', paths, failure }, null, 2);
        setStatus(failure ? `${failure}. Zapisano ${paths.length}/6; przywrócono preset i widok.`
            : `Zapisano 6/6 profili ${grayscale ? 'w szarości' : 'w kolorze'}. Przywrócono preset i widok.`);
    }
}
panel.querySelector('[data-profiles]').onclick = () => void saveProfiles(false);
panel.querySelector('[data-profiles-gray]').onclick = () => void saveProfiles(true);
panel.querySelector('[data-profiles-gray]').disabled = !diagnostics;

function tick(now) {
    requestAnimationFrame(tick);
    if (switching || !game) { lastFrame = 0; return; }
    const delta = lastFrame ? Math.min(.05, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (gpu && pending.length) {
        const disjoint = gl.getParameter(gpu.GPU_DISJOINT_EXT);
        if (disjoint && run) run.disjointEvents++;
        pending = pending.filter(item => {
            if (!disjoint && !gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
            if (!disjoint) item.owner.gpu.push(gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6);
            gl.deleteQuery(item.query); return false;
        });
    }
    if (run && (document.hidden || !document.hasFocus())) void finish('Okno straciło aktywność');
    if (photoBatch) pointCamera(photoBatch.position, photoBatch.target);
    else if (sceneName === 'forest') {
        const seconds = run ? (run.start === null ? 0 : Math.max(0, (now - run.start) / 1000)) : (now - motionOrigin) / 1000;
        forestCamera(seconds);
    }
    const current = run && run.start !== null && now >= run.start && now < run.end ? run : null;
    let query = null;
    if (current && gpu) {
        if (pending.length < 12 && !gl.getQuery(gpu.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) {
            query = gl.createQuery(); gl.beginQuery(gpu.TIME_ELAPSED_EXT, query);
        } else current.gpuSkipped++;
    }
    renderer.info.reset();
    const start = performance.now();
    game.update(animate ? delta : 0);
    // Po teleportacji mgła ma osiągnąć docelowe warunki także przy pauzie animacji.
    if (settleFrames > 0) { game.updateFog(10); settleFrames--; }
    const updated = performance.now();
    game.render();
    const end = performance.now();
    if (query) { gl.endQuery(gpu.TIME_ELAPSED_EXT); pending.push({ query, owner: current }); }
    if (current) {
        if (current.last !== null) current.frames.push(now - current.last);
        current.last = now;
        current.cpu.push(end - start); current.updateCpu.push(updated - start); current.renderCpu.push(end - updated);
    }
    const stable = !game.world.loadQueue?.length && !game.world.dirtyChunks.size &&
        !game.farTerrain.requests.size && !game.farTerrain.wanted.some(tile => !tile.mesh || tile.stale);
    if (!stable) readySince = 0;
    else if (!readySince) readySince = now;
    if (run) {
        if (run.start === null && readySince && now - readySince >= 2000) {
            run.start = now + 10000; run.end = run.start + 30000;
            run.before = resources(); run.stableMeshes = game.world.meshVersion ?? 0;
        }
        if (run.start === null && now - run.requestedAt > 90000) void finish('Kolejki nie ustabilizowały się w 90 s');
        else if (run.start !== null && now >= run.end && !pending.some(item => item.owner === run)) void finish();
        else if (run.start !== null && now - run.end > 5000) void finish('GPU nie oddało próbek w 5 s');
        else setStatus(run.start === null ? 'Czekam na wczytanie terenu i stabilizację…'
            : now < run.start ? `Rozgrzewka: ${Math.ceil((run.start - now) / 1000)} s`
                : `Pomiar: ${Math.max(0, Math.ceil((run.end - now) / 1000))} s`);
    } else if (!photoBatch && readySince && now - readySince >= 2000 && status.textContent.includes('stabilizacja')) {
        status.textContent = `Gotowe: ${camera} / ${preset}.` + (!cloudsSupported && preset === 'overcast'
            ? ' Wersja 0.56.1 nie ma zachmurzenia; to odniesienie południa bez chmur.' : '');
    }
}
presetTo('noon');
requestAnimationFrame(tick);
