import { diagnostics } from '/src/diagnostics/Diagnostics.js';
import { Game } from '/src/game/Game.js';
import { WorldStorage, createWorldInfo } from '/src/storage/WorldStorage.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let game;
export async function setup() {
    if (window.diagnosticsQA) return { ready: true, existing: true };
    const functionKeys = [];
    window.addEventListener('keydown', event => {
        if (/^F\d{1,2}$/.test(event.key)) {
            functionKeys.push({ key: event.key, code: event.code, repeat: event.repeat });
            if (functionKeys.length > 8) functionKeys.shift();
        }
    }, true);
    const start = Game.start;
    Game.start = async function (...args) {
        game = await start.apply(this, args);
        for (const [key, value] of Object.entries({ viewDistance: 64, farTerrain: 1024,
            fpsLimit: 0, showFps: true, showHand: false, volumeMaster: 0, volumeMusic: 0,
            meteorites: false, performanceLogs: true })) game.settings.set(key, value);
        game.applySettings();
        game.time.days = .25;
        game.time.speed = 0;
        game.plantGrowth.speed = 0;
        return game;
    };
    const storage = await WorldStorage.open();
    const worlds = await storage.listWorlds();
    if (!worlds.some(world => world.name === 'Test logów 0.67.0')) {
        const info = createWorldInfo('Test logów 0.67.0', 2138286349, 'realistic', 'developer');
        info.player = { x: 198, y: 62, z: -261, yaw: -.6, pitch: -.2, flying: true };
        await storage.saveWorld(info);
    }
    function status() {
        return { ready: true, functionKeys, state: diagnostics.snapshot({ includePrevious: false }).session.context?.state,
            activeWorld: Boolean(game), diagnostics: diagnostics.status(), report: diagnostics.snapshot({ includePrevious: true }) };
    }
    async function sample(enabled, seconds = 20) {
        game.settings.set('performanceLogs', enabled);
        await delay(5000);
        const rows = [], cpu = [];
        let last = 0, startAt;
        await new Promise(resolve => {
            function tick(now) {
                startAt ??= now;
                if (last) { rows.push(now - last); cpu.push(game.perf.currentUpdate + game.perf.currentRender); }
                last = now;
                if (now - startAt >= seconds * 1000) resolve(); else requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
        const sorted = rows.slice().sort((a, b) => a - b), sortedCpu = cpu.slice().sort((a,b)=>a-b);
        return { enabled, frames: rows.length, fps: 1000 * rows.length / rows.reduce((sum,n)=>sum+n,0),
            p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1),
            cpuMedianMs: sortedCpu[Math.floor(sortedCpu.length / 2)],
            cpuP95Ms: sortedCpu[Math.ceil(sortedCpu.length * .95)-1],
            logger: enabled ? game.perfDiagnostics.snapshot() : null,
            position: game.player.getState(), viewport: { width: game.renderer.domElement.width, height: game.renderer.domElement.height },
            queued: game.world.loadQueue.length };
    }
    window.diagnosticsQA = {
        status,
        async benchmark() {
            if (!game || diagnostics.snapshot().session.context?.state !== 'playing') throw new Error('Najpierw wejdź do świata i wznów grę.');
            const results = [];
            for (const enabled of [false, true, true, false]) results.push(await sample(enabled));
            game.settings.set('performanceLogs', true);
            await diagnostics.flush();
            return { results, report: diagnostics.snapshot(), method: '4 ×20s stationary native real main, 5s warm-up, disabled/enabled/enabled/disabled; independent RAF observer and existing PerfMonitor CPU' };
        },
        async spike() {
            if (!game) throw new Error('No world');
            game.settings.set('performanceLogs', true);
            const update = game.player.update;
            let injected = false;
            game.player.update = function (...args) {
                game.player.update = update;
                const until = performance.now() + 85;
                while (performance.now() < until) { /* Controlled one-frame diagnostic fault. */ }
                injected = true;
                return update.apply(this, args);
            };
            await delay(2200);
            return { injected, report: diagnostics.snapshot() };
        },
        async errors() {
            console.error('QA: kontrolowany błąd konsoli', new Error('QA_CONSOLE_TEST'));
            setTimeout(() => { throw new Error('QA_UNCAUGHT_TEST'); }, 0);
            Promise.reject(new Error('QA_REJECTION_TEST'));
            await delay(350);
            await diagnostics.flush();
            return diagnostics.snapshot();
        }
    };
    await diagnostics.ready;
    return { ready: true, previous: diagnostics.status().previousAvailable, version: diagnostics.session.version };
}
