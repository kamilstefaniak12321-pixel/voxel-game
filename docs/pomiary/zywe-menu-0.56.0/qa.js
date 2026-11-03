import { MenuBackdrop } from '/src/menu/MenuBackdrop.js';
import { MENU_SCENE } from '/src/menu/menuScene.js';
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { WorldStorage, createWorldInfo } from '/src/storage/WorldStorage.js';

Settings.prototype.load = () => ({ ...SETTINGS_DEFAULTS, showDebug: false,
    meteorites: false, autoUpdates: false, volumeMaster: 30, menuMotion: 'full' });
Settings.prototype.save = () => {};
const db = await WorldStorage.open();
if (!(await db.listWorlds()).length) await db.saveWorld(createWorldInfo('Próba menu', 42, 'flat', 'creative'));
db.db.close();

let backdrop, activeGame = false, last = 0, changedAt = 0, previousView, previousFrame = 0;
const measurements = {}, transitions = [], travelFrames = [], errors = [];
addEventListener('error', event => errors.push(String(event.error?.stack || event.message)));
addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const originalUpdate = MenuBackdrop.prototype.update;
MenuBackdrop.prototype.update = function(dt) {
    backdrop = this;
    const start = performance.now();
    const result = originalUpdate.call(this, dt);
    const elapsed = performance.now() - start;
    if (this.view !== previousView) {
        previousView = this.view; changedAt = start; last = 0;
        transitions.push({ view: this.view, at: start, position: this.camera.position.toArray() });
    }
    if (previousFrame && start - changedAt < 4000 && this.world?.ready) travelFrames.push(start - previousFrame);
    previousFrame = start;
    if (this.world?.ready && start - changedAt > 4000 && document.hasFocus() && !document.hidden) {
        const bucket = measurements[this.view] ??= { frames: [], cpu: [] };
        if (last) { bucket.frames.push(start - last); bucket.cpu.push(elapsed); }
        if (bucket.frames.length > 1800) { bucket.frames.shift(); bucket.cpu.shift(); }
        last = start;
    } else last = 0;
    return result;
};
const gameStart = Game.start, gameStop = Game.prototype.stop;
Game.start = async function(...args) {
    if (backdrop?.world || backdrop?.active) errors.push('Scena menu wciąż aktywna przy starcie gry');
    const game = await gameStart.apply(this, args); activeGame = true; return game;
};
Game.prototype.stop = async function(...args) { const result = await gameStop.apply(this,args); if(result)activeGame=false; return result; };

const panel = document.createElement('aside');
panel.style.cssText = 'position:fixed;right:12px;bottom:10px;padding:8px 12px;background:#10251ddd;color:white;font:12px system-ui;z-index:10000;pointer-events:none';
document.body.append(panel);
const avg = a => a.reduce((s,x)=>s+x,0) / (a.length || 1);
const percentile = (a,p) => [...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*p)] ?? 0;
setInterval(() => {
    if (!backdrop) return;
    const summary = Object.fromEntries(Object.entries(measurements).map(([key,b])=>[key,{
        frames:b.frames.length, fps:1000/avg(b.frames), frameP95:percentile(b.frames,.95),
        cpuMean:avg(b.cpu), cpuP95:percentile(b.cpu,.95)
    }]));
    const stats = backdrop.stats();
    panel.textContent = `Próba: ${stats.view} | ${stats.ready ? 'gotowe' : 'wczytywanie'} | ${summary[stats.view]?.fps.toFixed(1) ?? '—'} FPS | ${activeGame ? 'gra' : 'menu'}`;
    const gl = backdrop.renderer.getContext(), gpu = gl.getExtension('WEBGL_debug_renderer_info');
    void window.menuQA.report({ scene: MENU_SCENE, viewport:[innerWidth,innerHeight], summary, stats,
        travel: { frames: travelFrames.length, p95: percentile(travelFrames,.95), max: Math.max(0,...travelFrames) },
        activeGame, transitions, errors, renderer:gpu ? gl.getParameter(gpu.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) });
}, 2000);
await import('/src/main.js');
