import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo } from '/src/storage/WorldStorage.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';
import { applyPlantModelLevel } from '/src/rendering/PlantModelLevels.js';
import { setLeafParts } from '/src/rendering/ChunkMesher.js';
import { plantWindUniforms } from '/src/rendering/PlantWind.js';
import { PerfDiagnostics } from '/src/diagnostics/PerfDiagnostics.js';

const config = await window.distanceProof.config();
const panel = document.querySelector('aside'), statusText = panel.querySelector('[data-status]');
const errors = [], warnings = [], phases = [], checkpoints = [], samples = [];
const startupBeganAt = performance.now();
let initialized = false;
function reportStartupError(detail) {
    if (initialized) return Promise.resolve();
    statusText.textContent = 'Błąd uruchomienia. Szczegóły zapisano w startup-error.json.';
    return window.distanceProof.report('startup-error', { finished: true, valid: false,
        reason: 'startup-exception', error: detail, errors: [...errors], warnings: [...warnings],
        elapsedMs: performance.now() - startupBeganAt }).catch(() => {});
}
const originalError = console.error, originalWarn = console.warn;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); originalWarn(...args); };
addEventListener('error', event => { const detail = String(event.error?.stack ?? event.message);
    errors.push(detail); void reportStartupError(detail); });
addEventListener('unhandledrejection', event => { const detail = String(event.reason?.stack ?? event.reason);
    errors.push(detail); void reportStartupError(detail); });
const quick = config.scenario === 'quick';
const timing = quick ? { load: 15000, fixed: 5000, movement: 12000, settle: 30000, steady: 5000, visual: 4000 }
    : { load: 60000, fixed: 20000, movement: 40000, settle: 180000, steady: 20000, visual: 8000 };
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
for (const [key, value] of Object.entries({ performanceLogs: true, potato: false,
    viewDistance: quick ? 256 : 800, farTerrain: quick ? 1024 : 16384, farDetail: 1,
    fov: 70, brightness: 50, lightingLook: 'natural', atmosphereLook: 'natural', lightingMaterials: 'standard',
    surfaceBounce: false, leafTransmission: true, materialSpecular: true, bounceStrength: 18,
    bounceSaturation: 65, cloudCover: 0, renderScale: 100, fpsLimit: 120, ambientOcclusion: 45,
    shadows: 3, lightShafts: true, fancyLeaves: true, dynamicLight: true, loadBudget: 4,
    plantModels: 'detailed', plantWind: true, plantAnimations: true, leafModel: 'parts',
    bushyGrass: false, bounceLight: false, lightingModel: 'world', showHand: false,
    meteorites: false, volumeMaster: 0, volumeMusic: 0, autoUpdates: false })) settings.set(key, value);
applyPlantModelLevel(settings.get('plantModels')); setLeafParts(true);
plantWindUniforms.uPlantSway.value = 1;
await atlasReady;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(config.width, config.height); renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const input = new Proxy({}, { get: (_, key) => key === 'consumeMouseDelta' ? () => ({ x: 0, y: 0 }) : () => 0 });
const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
const device = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight], devicePixelRatio,
    hardwareConcurrency: navigator.hardwareConcurrency, deviceMemoryGiB: navigator.deviceMemory ?? null };
panel.querySelector('[data-device]').textContent = `${config.version} · ${config.baseline ? 'baza' : 'kandydat'} · ${config.width}×${config.height}`;
const info = createWorldInfo('Próba zasięgu', 'test', 'realistic', 'developer');
info.player = { x: -66, y: 80, z: -99, yaw: -.8, pitch: -.25, flying: true };
let game;
try { game = await Game.start(renderer, input, null, info, settings); }
catch (error) { const detail = String(error.stack ?? error); errors.push(detail); await reportStartupError(detail); throw error; }
game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
game.hand.resize(config.width / config.height);
game.time.days = .25; game.time.speed = 0; game.plantGrowth.speed = 0;
const startedAt = performance.now();
let phase = null, lastRaf = 0, lastFrame = 0, nextFrameTime = 0, previousWork = null, lastSample = 0;
let stopped = false, finishing = false, settledSince = 0, photoBusy = false;
let focusLostMs = 0, hiddenMs = 0, phaseId = 0, timedCheckpoint = false, visualIndex = 0;
let visualCapturePending = false, visualCaptured = false;
const verificationWarnings = [], visualNames = ['visual-near-plants', 'visual-forest', 'visual-transition', 'visual-horizon'];
const distribution = values => {
    if (!values.length) return { samples: 0 };
    const sorted = values.slice().sort((a,b) => a-b), total = values.reduce((a,b) => a+b, 0);
    return { samples: values.length, meanMs: total / values.length,
        p50Ms: sorted[Math.ceil(sorted.length * .5)-1], p95Ms: sorted[Math.ceil(sorted.length * .95)-1],
        p99Ms: sorted[Math.ceil(sorted.length * .99)-1], maxMs: sorted.at(-1),
        averageFps: total ? 1000 * values.length / total : null,
        over33ms: values.filter(v => v > 1000/30).length, over50ms: values.filter(v => v > 50).length };
};

function resources(detailed = false) {
    const w = game.world, far = game.farTerrain;
    const result = { chunks: w.chunks.size, queued: w.loadQueue.length, dirty: w.dirtyChunks.size,
        dirtyPlants: w.dirtyPlants?.size ?? null,
        meshJobs: Object.entries(w.meshJobs ?? {}).filter(([,job]) => job).map(([kind,job]) =>
            ({ kind, x: job.chunk?.cx, z: job.chunk?.cz })),
        generation: w.generation?.getStats?.(), meshVersion: w.meshVersion,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        heapMiB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
        far: { ...far.stats(), requests: far.requests?.size ?? null }, shadows: game.shadows.stats(),
        lod: { enabled: w.distanceLod ?? false, loadRadiusChunks: w.loadRadius },
        depth: { reused: game.lightShafts.lastDepthReused ?? null,
            source: game.lightShafts.lastDepthSource ?? null, extraDraws: game.lightShafts.lastDepthDraws ?? null },
        output: game.worldOutput.stats(), camera: { position: game.player.pos.toArray(), yaw: game.player.yaw, pitch: game.player.pitch },
        failedPrograms: renderer.info.programs?.filter(program => program.diagnostics?.runnable === false).length ?? 0 };
    if (detailed) {
        let plantMeshes = 0, plantVisible = 0, plantIndices = 0, emptyGroups = 0, nearBytes = 0, farBytes = 0;
        const leafLevels = [0, 0, 0], plantLevels = [0, 0, 0];
        const geometries = new Set(), arrays = new Set();
        function countGeometry(geometry) {
            if (!geometry || geometries.has(geometry)) return 0;
            geometries.add(geometry);
            emptyGroups += geometry.groups.filter(group => group.count === 0).length;
            let bytes = 0;
            for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
                const array = attribute?.array;
                if (array && !arrays.has(array.buffer)) { arrays.add(array.buffer); bytes += array.buffer.byteLength; }
            }
            return bytes;
        }
        for (const chunk of w.chunks.values()) {
            const pm = chunk.plantMesh, geometry = pm?.geometry;
            if (chunk.mesh?.geometry) leafLevels[chunk.mesh.geometry.userData.leafDetail ?? 0]++;
            if (geometry) plantLevels[geometry.userData.plantDetail ?? 0]++;
            if (geometry?.index?.count > 0) {
                plantMeshes++; plantIndices += geometry.index.count;
                if (pm.visible) plantVisible++;
            }
            nearBytes += countGeometry(chunk.mesh?.geometry) + countGeometry(geometry);
        }
        for (const tile of far.tiles?.values() ?? []) farBytes += countGeometry(tile.mesh?.geometry);
        result.geometry = { plantMeshes, plantVisible, plantIndices, emptyGroups, leafLevels, plantLevels,
            nearBytes, farBytes, bytes: nearBytes + farBytes,
            note: 'Unique CPU typed-array buffers of resident near and far geometry, including cached far tiles; not VRAM.' };
    }
    return result;
}
const diagnostics = new PerfDiagnostics({ onSummary(summary) { if (phase) phase.diagnostics.push(summary); } });
game.perfDiagnostics = diagnostics;

function cameraAt(seconds, moving = false) {
    const t = moving ? Math.min(1, seconds / (timing.movement / 1000)) : 0;
    const x = -66 - 195 * t, z = -99 + 36 * t;
    game.player.pos.set(x, 80, z); game.player.vel.set(0,0,0);
    game.player.yaw = -.8 + (moving ? Math.sin(t * Math.PI * 2) * .35 : 0);
    game.player.pitch = -.25; game.player.flying = true;
    if (phase?.name.startsWith('visual-')) {
        if (phase.name === 'visual-near-plants') {
            game.player.pos.y = game.world.getGroundY(Math.floor(x), Math.floor(z)) + 2.2;
            game.player.pitch = -.18;
        } else if (phase.name === 'visual-forest') {
            game.player.pos.y = 70; game.player.yaw = 1.25; game.player.pitch = -.15;
        } else if (phase.name === 'visual-transition') {
            game.player.pos.y = 100; game.player.pitch = -.42;
        } else if (phase.name === 'visual-horizon') game.player.pitch = -.07;
    }
    game.player.updateCamera();
}
function phaseSummary(p) {
    return { name: p.name, timedPerformance: !p.name.startsWith('visual-'), startMs: p.start - startedAt,
        durationMs: (p.end ?? performance.now()) - p.start,
        frame: distribution(p.frames), cpu: distribution(p.cpu), updateCpu: distribution(p.update), renderCpu: distribution(p.render),
        beforeReady: p.beforeReady, afterReady: ready(), before: p.before, after: p.after,
        diagnostics: p.diagnostics, raw: { frames: p.frames, cpu: p.cpu, updateCpu: p.update, renderCpu: p.render } };
}
function changePhase(name, now) {
    if (phase) { phase.end = now; phase.after = resources(true); phases.push(phaseSummary(phase)); }
    diagnostics.reset('qa-phase-boundary'); previousWork = null;
    phase = { name, id: ++phaseId, start: now, frames: [], cpu: [], update: [], render: [], diagnostics: [], before: resources(true), beforeReady: ready() };
    checkpoints.push({ phase: name, atMs: now-startedAt, resources: phase.before, ready: phase.beforeReady });
    void window.distanceProof.report('progress', snapshot());
    if (name !== 'cold-streaming' && !name.startsWith('visual-')) void window.distanceProof.photo('checkpoint-' + name);
}
function snapshot() {
    return { seed: 'test', device, elapsedMs: performance.now()-startedAt, phase: phase?.name,
        settings: Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)])),
        resources: resources(), checkpoints, phases, samples, errors: [...errors], warnings: [...warnings],
        focusLostMs, hiddenMs, stopped, verificationWarnings,
        method: { distance: settings.get('viewDistance'), horizon: settings.get('farTerrain'), timing,
            camera: 'Fixed -66,80,-99 for 60+20 s, then 195 blocks west and 36 south over 40 s with gentle scripted yaw.',
            notes: ['Real Game.update/render with scripted input and a fresh isolated world; no installed saves.',
                'Same harness, seed, settings and timed camera path against both source trees.',
                'This compares the complete distance policy, NOT equal chunk sets or equal geometry.',
                'Streaming remains active throughout; no reception cap or mesh pause.',
                'Fixed stationary sample starts after 60 s regardless of readiness; unfinished queues are reported.',
                'Steady state requires empty near load/mesh queues and zero missing, requested or transitioning far tiles for 3 s.',
                'Audio, meteors and hand disabled; time .25 and plant growth frozen in both runs.',
                'CPU closes the previous RAF interval; asynchronous GPU samples cannot be added to CPU time.',
                'Draw counters include all passes; near/far CPU geometry buffers are not measured VRAM.',
                'Visual-only camera poses follow the timed phases and do not count towards performance comparisons.',
                'Guards: 6500 MiB JavaScript heap or 420 s; guards do not demonstrate full-distance completion.'] } };
}
function ready() {
    const w = game.world, f = game.farTerrain.stats();
    const near = w.loadQueue.length === 0 && w.dirtyChunks.size === 0 && !(w.dirtyPlants?.size)
        && !Object.values(w.meshJobs ?? {}).some(Boolean);
    const far = !f.active || (f.wanted > 0 && f.missing === 0 && !(game.farTerrain.requests?.size)
        && !(f.transitioningTiles ?? 0));
    return { near, far, all: near && far };
}
async function finish(reason) {
    if (finishing || stopped) return;
    finishing = true;
    phase.end = performance.now(); phase.after = resources(true); phases.push(phaseSummary(phase));
    const steady = phases.find(p => p.name === 'settled-stationary');
    const result = { ...snapshot(), reason, finished: true,
        valid: errors.length === 0 && resources().failedPrograms === 0 && hiddenMs === 0 && focusLostMs === 0,
        steadyStateMeasured: !!steady && steady.beforeReady.all && steady.afterReady.all
            && samples.filter(s => s.phase === 'settled-stationary').every(s => s.ready.all),
        finalResources: resources(true) };
    stopped = true; result.stopped = true;
    statusText.textContent = `Zakończono: ${reason}. Wyniki zapisane.`;
    await window.distanceProof.report('result', result);
    await window.distanceProof.photo('final');
}
function startVisual(now) { visualIndex = 0; visualCaptured = false; changePhase(visualNames[visualIndex], now); }
function advance(now) {
    const elapsed = now - phase.start;
    if (phase.name === 'cold-streaming') {
        if (!timedCheckpoint && elapsed >= timing.load / 2) {
            timedCheckpoint = true;
            checkpoints.push({ phase: 'fixed-half-load', atMs: now-startedAt, resources: resources(true), ready: ready() });
            void window.distanceProof.photo('fixed-half-load');
        }
        if (elapsed >= timing.load) changePhase('fixed-stationary', now);
    } else if (phase.name === 'fixed-stationary' && elapsed >= timing.fixed) {
        changePhase('movement', now);
    } else if (phase.name === 'movement' && elapsed >= timing.movement) {
        changePhase('settling', now); settledSince = 0;
    } else if (phase.name === 'settling') {
        if (ready().all) { if (!settledSince) settledSince = now; } else settledSince = 0;
        if (settledSince && now-settledSince >= 3000) changePhase('settled-stationary', now);
        else if (elapsed >= timing.settle) {
            verificationWarnings.push('Near/far queues did not all stabilize within the settling limit; no steady-state claim.');
            startVisual(now);
        }
    } else if (phase.name === 'settled-stationary' && elapsed >= timing.steady) startVisual(now);
    else if (phase.name.startsWith('visual-') && elapsed >= timing.visual) {
        // Hold this camera while capturePage is in flight, so the file named
        // for one pose cannot accidentally contain the first frame of the next.
        if (!visualCapturePending && !visualCaptured) {
            visualCapturePending = true;
            void window.distanceProof.photo(phase.name).then(() => { visualCaptured = true; })
                .finally(() => { visualCapturePending = false; });
        } else if (visualCaptured && !visualCapturePending) {
            visualCaptured = false;
            if (++visualIndex < visualNames.length) changePhase(visualNames[visualIndex], now);
            else void finish(phases.some(p => p.name === 'settled-stationary') ? 'completed' : 'settling-time-limit');
        }
    }
}
function tick(now) {
    if (stopped || finishing) return;
    requestAnimationFrame(tick);
    const rafDelta = lastRaf ? now-lastRaf : 0; lastRaf = now;
    if (document.hidden) hiddenMs += rafDelta;
    if (!document.hasFocus()) focusLostMs += rafDelta;
    const interval = 1000 / settings.get('fpsLimit');
    if (now < nextFrameTime-1) return;
    nextFrameTime = Math.max(nextFrameTime+interval, now-interval/2);
    const dt = lastFrame ? Math.min(.05, (now-lastFrame)/1000) : 0;
    if (previousWork && previousWork.phase === phase?.id) {
        phase.frames.push(now-previousWork.at); phase.cpu.push(previousWork.cpu);
        phase.update.push(previousWork.update); phase.render.push(previousWork.render);
    }
    lastFrame = now;
    if (!phase) changePhase('cold-streaming', now);
    advance(now);
    if (finishing || stopped) return;
    if (['cold-streaming', 'fixed-stationary'].includes(phase.name)) cameraAt(0);
    else if (phase.name === 'movement') cameraAt((now-phase.start)/1000, true);
    else cameraAt(timing.movement / 1000, true);
    diagnostics.beginFrame(now, { active: true, state: 'playing', fpsLimit: settings.get('fpsLimit'), hidden: document.hidden });
    const begin = performance.now();
    try {
        renderer.info.reset(); game.update(dt);
        const updated = performance.now();
        diagnostics.beginGpu(renderer); game.render(); diagnostics.endGpu();
        const end = performance.now(); diagnostics.endFrame({ game, renderer });
        previousWork = { phase: phase.id, at: now, cpu: end-begin, update: updated-begin, render: end-updated };
    } catch (error) { errors.push(String(error.stack ?? error)); void finish('exception'); return; }
    if (now-lastSample >= 1000) {
        const current = resources();
        samples.push({ atMs: now-startedAt, phase: phase.name, resources: current, ready: ready() }); lastSample = now;
        statusText.textContent = `${phase.name}: ${current.chunks} chunków, siatki ${current.dirty}/${current.dirtyPlants ?? '—'}, daleki teren ${current.far.shown}/${current.far.wanted}, ${current.render.calls} rysowań.`;
        if (samples.length % 10 === 0) void window.distanceProof.report('progress', snapshot());
        if (current.heapMiB > 6500) void finish('heap-guard-6500MiB');
        else if (now-startedAt > 420000) void finish('total-time-limit');
    }
}
window.distanceQA = { status: snapshot };
window.distanceProof.onToggle(() => { panel.hidden = !panel.hidden; });
panel.querySelector('[data-shot]').onclick = async () => {
    if (photoBusy) return; photoBusy = true;
    try { await window.distanceProof.photo('manual-' + Math.round(performance.now()-startedAt)); } finally { photoBusy = false; }
};
await window.distanceProof.report('ready', snapshot());
initialized = true;
requestAnimationFrame(tick);
