import * as THREE from 'three';
import { MenuBackdrop } from '/src/menu/MenuBackdrop.js';
import { MENU_SCENE } from '/src/menu/menuScene.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';

// No main/Game/WorldStorage import and no settings I/O. The launcher also
// creates a unique Chromium profile, isolating atlas/texture-pack storage.
class MemorySettings extends Settings { load() { return null; } save() {} }
const settings = new MemorySettings();
settings.set('menuMotion', 'full');
settings.set('lightingLook', 'natural');
settings.set('autoUpdates', false);
const config = await window.lightingQA.config();
const panel = document.querySelector('aside'), status = panel.querySelector('[data-status]');
const errors = [], transitions = [], buckets = new Map();
const recordError = error => { if (errors.length < 100) errors.push(String(error?.stack ?? error)); };
addEventListener('error', event => recordError(event.error ?? event.message));
addEventListener('unhandledrejection', event => recordError(event.reason));
const originalError = console.error;
console.error = (...args) => { recordError(args.join(' ')); originalError(...args); };
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1); renderer.setSize(config.width, config.height); renderer.info.autoReset = false;
document.body.prepend(renderer.domElement);
const backdrop = new MenuBackdrop(renderer, settings);
const originalFail = backdrop.fail.bind(backdrop);
backdrop.fail = error => { recordError(error); originalFail(error); };
settings.onChange(() => backdrop.applySettings());
let running = false, cancel = false, previous = null, nextFrameTime = 0, changedAt = 0, readySince = 0, lastStatus = 0;
let outputViolations = 0;
const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
function select(view = backdrop.view, look = settings.get('lightingLook')) {
    settings.set('lightingLook', look); backdrop.setView(view);
    changedAt = performance.now(); readySince = 0;
    transitions.push({ view, look, at: changedAt, position: backdrop.camera.position.toArray() });
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.view === view));
    document.querySelectorAll('[data-look]').forEach(button => button.setAttribute('aria-pressed', button.dataset.look === look));
}
function summary(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    return { samples: values.length, meanMs: mean, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] ?? 0,
        averageFps: mean ? 1000 / mean : null };
}
function report() {
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { scene: MENU_SCENE, look: settings.get('lightingLook'), stats: backdrop.stats(),
        timing: { targetFps: 60, source: 'Actual intervals between rendered requestAnimationFrame callbacks; not GPU presentation timing' },
        settings: Object.fromEntries(Object.keys(SETTINGS_DEFAULTS).map(key => [key, settings.get(key)])),
        worldOutput: backdrop.world?.worldOutput.stats(), shadow: backdrop.world?.shadows.stats(),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        memory: { ...renderer.info.memory }, programs: renderer.info.programs?.length,
        failedPrograms: renderer.info.programs?.filter(program => program.diagnostics?.runnable === false).length ?? 0,
        outputViolations, errors: [...errors], transitions: [...transitions],
        measurements: Object.fromEntries([...buckets].map(([key, value]) => [key,
            { frames: summary(value.frames), cpu: summary(value.cpu) }])) };
}
async function photo(name) {
    const hidden = panel.hidden; panel.hidden = true;
    try { await frame(); await frame(); return await window.lightingQA.photo(name, report()); }
    finally { panel.hidden = hidden; }
}
async function settled() {
    const deadline = performance.now() + 120000;
    while (!cancel) {
        if (backdrop.failed || errors.length) throw new Error(errors.at(-1) ?? 'Menu nie uruchomiło się');
        if (performance.now() > deadline) throw new Error('Menu nie osiągnęło gotowości w 120 s');
        if (backdrop.world?.ready && performance.now() - readySince > 6000 && performance.now() - changedAt > 6000) return;
        await frame();
    }
}
function loop(now) {
    requestAnimationFrame(loop);
    if (document.hidden) { previous = null; nextFrameTime = 0; return; }
    // Keep the deadline remainder, as main.js does. Restarting the interval
    // at each draw would quantize a 144 Hz display down to about 48 FPS.
    const interval = 1000 / 60;
    if (now < nextFrameTime - 1) return;
    nextFrameTime = Math.max(nextFrameTime + interval, now - interval / 2);
    const duration = previous === null ? null : now - previous; previous = now;
    // Only animation gets a bounded dt. Reports retain actual frame spacing.
    const start = performance.now(); backdrop.update(duration === null ? 0 : Math.min(duration / 1000, .05));
    const cpu = performance.now() - start;
    if (backdrop.world?.ready) {
        if (!readySince) readySince = now;
        if (renderer.getRenderTarget() !== null || backdrop.world.worldOutput.active) outputViolations++;
        if (duration !== null && document.hasFocus() && now - Math.max(readySince, changedAt) > 6000) {
            const key = `${settings.get('lightingLook')}/${backdrop.view}`;
            const bucket = buckets.get(key) ?? { frames: [], cpu: [] }; buckets.set(key, bucket);
            bucket.frames.push(duration); bucket.cpu.push(cpu);
            if (bucket.frames.length > 1800) { bucket.frames.shift(); bucket.cpu.shift(); }
        }
    } else readySince = 0;
    if (now - lastStatus > 500) {
        lastStatus = now;
        status.textContent = `${settings.get('lightingLook')} / ${backdrop.view} · ${backdrop.world?.ready ? 'gotowe' : 'wczytywanie'}${running ? ' · seria' : ''}`;
        panel.querySelector('pre').textContent = JSON.stringify({ output: backdrop.world?.worldOutput.stats(),
            ready: backdrop.stats(), outputViolations, errors }, null, 2);
    }
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => { if (!running) select(button.dataset.view); });
document.querySelectorAll('[data-look]').forEach(button => button.onclick = () => { if (!running) select(backdrop.view, button.dataset.look); });
panel.querySelector('[data-photo]').onclick = () => { void photo(`menu-${settings.get('lightingLook')}-${backdrop.view}`).catch(recordError); };
panel.querySelector('[data-restart]').onclick = async () => {
    if (running) return;
    backdrop.stop(); readySince = 0; changedAt = performance.now(); await backdrop.start();
};
panel.querySelector('[data-hide]').onclick = () => { panel.hidden = true; };
window.lightingQA.onTogglePanel(() => { panel.hidden = !panel.hidden; });
panel.querySelector('[data-cancel]').onclick = () => { cancel = true; };
panel.querySelector('[data-tour]').onclick = async () => {
    if (running) return;
    running = true; cancel = false; panel.querySelector('[data-cancel]').disabled = false;
    try {
        for (const look of ['natural', 'baseline']) {
            select('home', look); await settled(); if (cancel) break;
            await photo(`menu-${look}-home`);
            for (const view of ['river', 'forest', 'mountains']) {
                select(view, look); await settled(); if (cancel) break;
                await photo(`menu-${look}-${view}`);
                select('home', look); await settled(); if (cancel) break;
            }
            if (cancel) break;
        }
    } catch (error) { recordError(error); }
    finally {
        running = false; panel.querySelector('[data-cancel]').disabled = true;
        await window.lightingQA.report(cancel ? 'menu-cancelled' : 'menu-tour', report());
    }
};
addEventListener('pagehide', () => { backdrop.dispose(); renderer.dispose(); });
select(); await backdrop.start(); requestAnimationFrame(loop);
