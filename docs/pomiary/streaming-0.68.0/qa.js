import * as THREE from 'three';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { createWorldInfo } from '/src/storage/WorldStorage.js';
import { atlasReady } from '/src/rendering/TextureAtlas.js';
import { applyPlantModelLevel } from '/src/rendering/PlantModelLevels.js';
import { setLeafParts } from '/src/rendering/ChunkMesher.js';
import { plantWindUniforms } from '/src/rendering/PlantWind.js';
import { PerfDiagnostics } from '/src/diagnostics/PerfDiagnostics.js';

const config = await window.streamingProof.config();
const panel = document.querySelector('aside');
const statusText = panel.querySelector('[data-status]');
const errors = [], warnings = [], phases = [], checkpoints = [], samples = [];
const originalError = console.error, originalWarn = console.warn;
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args); };
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); originalWarn(...args); };
addEventListener('error', event => errors.push(String(event.error?.stack ?? event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason?.stack ?? event.reason)));
const quick = config.scenario === 'quick';
const targetChunks = quick ? 81 : 1800;
Settings.prototype.load = () => null;
Settings.prototype.save = () => {};
const settings = new Settings();
for (const [key, value] of Object.entries({ performanceLogs: true, potato: false,
    viewDistance: quick ? 64 : 800, farTerrain: quick ? 1024 : 16384, farDetail: 1,
    fov: 70, brightness: 50, lightingLook: 'natural', atmosphereLook: 'natural', lightingMaterials: 'standard',
    surfaceBounce: false, leafTransmission: true, materialSpecular: true, bounceStrength: 18,
    bounceSaturation: 65, cloudCover: 0, renderScale: 100, fpsLimit: 120, ambientOcclusion: 45,
    shadows: 3, lightShafts: true, fancyLeaves: true, dynamicLight: true, loadBudget: 4,
    plantModels: 'detailed', plantWind: true, plantAnimations: true, leafModel: 'parts',
    bushyGrass: false, bounceLight: false, lightingModel: 'world', showHand: false,
    meteorites: false, volumeMaster: 0, volumeMusic: 0, autoUpdates: false })) settings.set(key, value);
applyPlantModelLevel(settings.get('plantModels'));
setLeafParts(true);
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
const info = createWorldInfo('Próba streamingu', 'test', 'realistic', 'developer');
info.player = { x: -66, y: 80, z: -99, yaw: -.8, pitch: -.25, flying: true };
const game = await Game.start(renderer, input, null, info, settings);
game.camera.aspect = config.width / config.height; game.camera.updateProjectionMatrix();
game.hand.resize(config.width / config.height);
game.time.days = .25; game.time.speed = 0; game.plantGrowth.speed = 0;
const startedAt = performance.now();
let phase = null, lastRaf = 0, lastFrame = 0, nextFrameTime = 0, previousWork = null, lastSample = 0;
let stopped = false, finishing = false, settledSince = 0, photoBusy = false;
let focusLostMs = 0, hiddenMs = 0, phaseId = 0;
let holdStreaming = false, heldSettledSince = 0;
const verificationWarnings = [];
const originalStreamChunks = game.world.streamChunks;
game.world.streamChunks = function (...args) {
    if (holdStreaming) return;
    if (phase?.name === 'cold-streaming') {
        const remaining = targetChunks - this.chunks.size;
        if (remaining <= 0) { holdStreaming = true; return; }
        // Baseline can receive two ready chunks; candidate receives one. Cap
        // only the final reception to obtain the identical 1800-chunk boundary.
        if (remaining < 2 && this.generation) {
            const readyChunks = this.generation.readyChunks;
            const world = this;
            this.generation.readyChunks = function () { return readyChunks.call(this)
                .sort((a,b) => world.distanceToCenter(a)-world.distanceToCenter(b)).slice(0, remaining); };
            try { return originalStreamChunks.apply(this, args); }
            finally { this.generation.readyChunks = readyChunks; }
        }
    }
    return originalStreamChunks.apply(this, args);
};
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
    const w = game.world;
    const result = { chunks: w.chunks.size, queued: w.loadQueue.length, dirty: w.dirtyChunks.size,
        dirtyPlants: w.dirtyPlants?.size ?? null,
        meshJobs: Object.entries(w.meshJobs ?? {}).filter(([,job]) => job).map(([kind,job]) =>
            ({ kind, x: job.chunk?.cx, z: job.chunk?.cz })), streamingHeld: holdStreaming,
        generation: w.generation?.getStats?.(), meshVersion: w.meshVersion,
        render: { ...renderer.info.render }, memory: { ...renderer.info.memory },
        heapMiB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
        far: game.farTerrain.stats(), shadows: game.shadows.stats(),
        failedPrograms: renderer.info.programs?.filter(program => program.diagnostics?.runnable === false).length ?? 0 };
    if (detailed) {
        let plantMeshes = 0, plantVisible = 0, plantIndices = 0, emptyGroups = 0, geometryBytes = 0;
        const geometries = new Set(), arrays = new Set();
        for (const chunk of w.chunks.values()) {
            const pm = chunk.plantMesh;
            const geometry = pm?.geometry ?? chunk.mesh?.geometry;
            const plantCount = pm ? geometry?.index?.count : geometry?.userData?.plantCount;
            if (plantCount > 0) {
                plantMeshes++; plantIndices += plantCount;
                if (pm ? pm.visible : (geometry?.groups[1]?.count ?? 0) > 0) plantVisible++;
            }
            for (const mesh of [chunk.mesh, pm]) {
                if (!mesh?.geometry || geometries.has(mesh.geometry)) continue;
                geometries.add(mesh.geometry);
                emptyGroups += mesh.geometry.groups.filter(group => group.count === 0).length;
                for (const attribute of [...Object.values(mesh.geometry.attributes), mesh.geometry.index]) {
                    const array = attribute?.array;
                    if (array && !arrays.has(array.buffer)) { arrays.add(array.buffer); geometryBytes += array.buffer.byteLength; }
                }
            }
        }
        const chunkKeys = [...w.chunks.keys()].sort();
        let keyHash = 2166136261;
        for (const key of chunkKeys) for (const char of String(key) + '\n') keyHash = Math.imul(keyHash ^ char.charCodeAt(0), 16777619) >>> 0;
        result.chunkSet = { count: chunkKeys.length, fnv1a32: keyHash.toString(16).padStart(8,'0'), keys: chunkKeys };
        result.geometry = { plantMeshes, plantVisible, plantIndices, emptyGroups,
            bytes: geometryBytes, note: 'Unique CPU typed-array buffers of terrain/plant meshes; not measured VRAM.' };
    }
    return result;
}
const diagnostics = new PerfDiagnostics({ onSummary(summary) {
    if (phase) phase.diagnostics.push(summary);
} });
game.perfDiagnostics = diagnostics;
function cameraAt(seconds, moving = false) {
    const t = moving ? Math.min(1, seconds / (quick ? 12 : 30)) : 0;
    const x = -66 - 195 * t, z = -99 + 36 * t;
    game.player.pos.set(x, 80, z); game.player.vel.set(0,0,0);
    game.player.yaw = -.8 + (moving ? Math.sin(t * Math.PI * 2) * .35 : 0);
    game.player.pitch = -.25; game.player.flying = true; game.player.updateCamera();
}
function phaseSummary(p) {
    return { name: p.name, startMs: p.start - startedAt, durationMs: (p.end ?? performance.now()) - p.start,
        frame: distribution(p.frames), cpu: distribution(p.cpu), updateCpu: distribution(p.update), renderCpu: distribution(p.render),
        gpuSamples: p.diagnostics.reduce((sum,s) => sum+(s.gpu?.samples ?? 0), 0),
        before: p.before, after: p.after, diagnostics: p.diagnostics,
        raw: { frames: p.frames, cpu: p.cpu, updateCpu: p.update, renderCpu: p.render } };
}
function changePhase(name, now) {
    if (phase) { phase.end = now; phase.after = resources(true); phases.push(phaseSummary(phase)); }
    diagnostics.reset('qa-phase-boundary'); previousWork = null;
    phase = { name, id: ++phaseId, start: now, frames: [], cpu: [], update: [], render: [], diagnostics: [], before: resources(true) };
    checkpoints.push({ phase: name, atMs: now-startedAt, resources: phase.before });
    void window.streamingProof.report('progress', snapshot());
    if (name !== 'cold-streaming') void window.streamingProof.photo('checkpoint-' + name);
}
function snapshot() {
    return { seed: 'test', device, elapsedMs: performance.now()-startedAt, phase: phase?.name,
        settings: Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)])),
        resources: resources(), checkpoints, phases, samples, errors: [...errors], warnings: [...warnings],
        focusLostMs, hiddenMs, stopped, verificationWarnings,
        method: { fullDistance: settings.get('viewDistance'), farDistance: settings.get('farTerrain'),
            targetChunks, qualityChange: 'detailed → semi → detailed in one boundary (real model revision, one final target)',
            camera: 'fixed -66,80,-99, then 195 blocks west and36 south in30s; camera orientation fixed with gentle scripted yaw',
            notes: ['Real Game.update/render with scripted input and a fresh isolated world.',
                'The same harness is served against baseline and candidate source trees.',
                'Audio, meteors and hand disabled; midday/time and plant growth frozen in both runs.',
                'Frame intervals close previous work; CPU records paired with that previous work.',
                'GPU is asynchronously sampled by real PerfDiagnostics; CPU and GPU must not be added.',
                'Draw counters include all render passes. Resource counters sampled once a second.',
                'Streaming phases can have different chunk counts; compare checkpoints/buckets, not FPS alone.',
                'At 1800 chunks, only streamChunks is temporarily held; actual mesh queues drain before a15s matched stationary sample.',
                'The held sample is isolated rendering work, not a real-world steady state of the full800-block radius.',
                'Held sample is comparable only with equal chunkSet.keys and drained terrain/plants/jobs; radius and visual settings stay unchanged.',
                'Steady-state phase requires empty load and mesh queues; guard stops do not count as steady-state.'] } };
}
async function finish(reason) {
    if (finishing || stopped) return;
    finishing = true;
    phase.end = performance.now(); phase.after = resources(true); phases.push(phaseSummary(phase));
    const result = { ...snapshot(), reason, finished: true,
        valid: errors.length === 0 && resources().failedPrograms === 0 && hiddenMs === 0,
        heldSampleMeasured: phases.some(p => p.name === 'held-stationary'),
        steadyStateMeasured: phases.some(p => p.name === 'settled-stationary'),
        finalResources: resources(true) };
    stopped = true; result.stopped = true;
    statusText.textContent = `Zakończono: ${reason}. Wyniki zapisane.`;
    await window.streamingProof.report('result', result);
    await window.streamingProof.photo('final');
    // Keep the final image on screen for a visual review, without continuing work.
}
function settled() {
    const w = game.world;
    return w.loadQueue.length === 0 && meshSettled();
}
function meshSettled() {
    const w = game.world;
    return w.dirtyChunks.size === 0 && !(w.dirtyPlants?.size) && !Object.values(w.meshJobs ?? {}).some(Boolean);
}
function changePlantQuality() {
    for (const value of ['semi', 'detailed']) {
        settings.set('plantModels', value);
        if (applyPlantModelLevel(value) > 0) {
            if (game.world.remeshPlants) game.world.remeshPlants(); else game.world.remeshAll();
        }
    }
    game.applySettings('plantModels');
}
function advance(now) {
    const elapsed = now - phase.start;
    if (phase.name === 'cold-streaming' && ((game.world.chunks.size >= targetChunks && elapsed > 5000) || elapsed >= (quick ? 30000 : 150000))) {
        holdStreaming = true;
        if (game.world.chunks.size !== targetChunks) verificationWarnings.push(`Held checkpoint has ${game.world.chunks.size}, expected${targetChunks} chunks.`);
        changePhase('held-settling', now); heldSettledSince = 0;
    } else if (phase.name === 'held-settling') {
        if (meshSettled()) { if (!heldSettledSince) heldSettledSince = now; }
        else heldSettledSince = 0;
        if (heldSettledSince && now-heldSettledSince >= 2000) changePhase('held-stationary', now);
        else if (elapsed >= 30000) {
            verificationWarnings.push('Held mesh queues did not drain within30s; matched stationary sample omitted.');
            holdStreaming = false;
            changePhase('quality-remesh', now); changePlantQuality();
            checkpoints.push({ phase: 'quality-change-queued', atMs: now-startedAt, resources: resources(true) });
        }
    } else if (phase.name === 'held-stationary' && elapsed >= 15000) {
        holdStreaming = false;
        changePhase('quality-remesh', now); changePlantQuality();
        checkpoints.push({ phase: 'quality-change-queued', atMs: now-startedAt, resources: resources(true) });
    } else if (phase.name === 'quality-remesh' && elapsed >= (quick ? 15000 : 90000)) {
        changePhase('movement', now);
    } else if (phase.name === 'movement' && elapsed >= (quick ? 12000 : 30000)) {
        changePhase('settling', now); settledSince = 0;
    } else if (phase.name === 'settling') {
        if (settled()) { if (!settledSince) settledSince = now; }
        else settledSince = 0;
        if (settledSince && now-settledSince >= 3000) changePhase('settled-stationary', now);
        else if (elapsed >= (quick ? 30000 : 90000)) void finish('settling-time-limit');
    } else if (phase.name === 'settled-stationary' && elapsed >= (quick ? 10000 : 20000)) void finish('completed');
}
function tick(now) {
    if (stopped || finishing) return;
    requestAnimationFrame(tick);
    const rafDelta = lastRaf ? now-lastRaf : 0; lastRaf = now;
    if (document.hidden) hiddenMs += rafDelta;
    if (!document.hasFocus()) focusLostMs += rafDelta;
    // Match the 120 FPS setting, retaining fractional time like the app limiter.
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
    const moving = phase.name === 'movement';
    if (['cold-streaming', 'held-settling', 'held-stationary', 'quality-remesh'].includes(phase.name)) cameraAt(0);
    else if (moving) cameraAt((now-phase.start)/1000, true);
    else cameraAt(quick ? 12 : 30, true);
    diagnostics.beginFrame(now, { active: true, state: 'playing', fpsLimit: settings.get('fpsLimit'), hidden: document.hidden });
    const begin = performance.now();
    try {
        renderer.info.reset(); game.update(dt);
        const updated = performance.now();
        diagnostics.beginGpu(renderer); game.render(); diagnostics.endGpu();
        const end = performance.now();
        diagnostics.endFrame({ game, renderer });
        previousWork = { phase: phase.id, at: now, cpu: end-begin, update: updated-begin, render: end-updated };
    } catch (error) { errors.push(String(error.stack ?? error)); void finish('exception'); return; }
    if (now-lastSample >= 1000) {
        const current = resources();
        samples.push({ atMs: now-startedAt, phase: phase.name, resources: current }); lastSample = now;
        statusText.textContent = `${phase.name}: ${current.chunks} fragmentów, kolejka ${current.queued}, przebudowa ${current.dirty}/${current.dirtyPlants ?? '—'}, ${current.render.calls} rysowań.`;
        if (samples.length % 10 === 0) void window.streamingProof.report('progress', snapshot());
        if (current.heapMiB > 6500) void finish('heap-guard-6500MiB');
        else if (now-startedAt > 480000) void finish('total-time-limit');
    }
}
window.streamingQA = { status: snapshot };
window.streamingProof.onToggle(() => { panel.hidden = !panel.hidden; });
panel.querySelector('[data-shot]').onclick = async () => {
    if (photoBusy) return; photoBusy = true;
    try { await window.streamingProof.photo('manual-' + Math.round(performance.now()-startedAt)); } finally { photoBusy = false; }
};
await window.streamingProof.report('ready', snapshot());
requestAnimationFrame(tick);
