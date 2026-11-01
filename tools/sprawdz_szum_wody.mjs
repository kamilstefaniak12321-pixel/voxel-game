// ------------------------------------------------------------
// SPRAWDZENIE SZUMU WODY (0.48.0)
//
// - pętle szumu wody grają zwykłym stereo (equalpower), nie HRTF -
//   HRTF przy źródle tuż pod słuchaczem dawał pisk i jęk,
// - punkt dźwięku: zawsze co najmniej 4 bloki od uszu w poziomie, na
//   wysokości uszu (także gdy woda jest dookoła albo pod graczem),
// - płynąca woda (nurt rzeki) - strumień, stojąca - fale; dwie pętle,
// - pozycja pętli przesuwa się płynnie (setTargetAtTime),
// - plik water_stream.ogg jest i jest pętlą (bez trzasku na szwie).
//
// Uruchomienie: node tools/sprawdz_szum_wody.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false });
                export const atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null;
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { SoundManager } = await import('../src/audio/SoundManager.js');
const { WaterEffects } = await import('../src/game/WaterEffects.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Atrapa Web Audio: zapamiętuje panning i ruchy pozycji -------------

const panners = [];

function param(value = 0) {
    return {
        value, targets: [],
        setTargetAtTime(v, t, c) { this.targets.push([v, t, c]); this.value = v; },
        setValueAtTime(v) { this.value = v; },
        cancelScheduledValues() {}
    };
}

class FakeContext {
    constructor() { this.currentTime = 1; this.state = 'running'; this.destination = {}; this.listener = { positionX: param(), positionY: param(), positionZ: param(), forwardX: param(), forwardY: param(), forwardZ: param(), upX: param(), upY: param(), upZ: param() }; }
    node(extra = {}) { return { connect() {}, disconnect() {}, ...extra }; }
    createGain() { return this.node({ gain: param(1) }); }
    createBiquadFilter() { return this.node({ frequency: param(), Q: param() }); }
    createDynamicsCompressor() { return this.node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createBufferSource() { return this.node({ playbackRate: param(1), start() {}, stop() {} }); }
    createPanner() { const p = this.node({ positionX: param(), positionY: param(), positionZ: param() }); panners.push(p); return p; }
    resume() { return Promise.resolve(); }
}

globalThis.window = { AudioContext: FakeContext };
// Wczytywanie plików w teście pomijamy (bufory - niżej, ręcznie).
globalThis.OfflineAudioContext = class { decodeAudioData() { return Promise.reject(new Error('test')); } };
globalThis.fetch = () => Promise.reject(new Error('test'));

const settings = { get: () => 100, onChange() {} };
const quiet = { warn: console.warn, log: console.log };
console.warn = console.log = () => {};
const sounds = new SoundManager(settings);
await sounds.ready;
Object.assign(console, quiet);
sounds.unlock();
sounds.setActive(true);
for (const name of ['water_stream', 'water_waves', 'meteor_impact']) {
    sounds.buffers.set(name, [{ duration: 20 }]);
}

check(SOUNDS.water_stream?.loop && SOUNDS.water_stream.category === 'world', 'strumień: pętla zjawisk');

const loop = sounds.loop('water_stream', { position: new THREE.Vector3(5, 60, 0) });
check(loop && panners.at(-1).panningModel === 'equalpower', 'pętla szumu - stereo, bez HRTF');
loop.setPosition(new THREE.Vector3(8, 60, 2));
check(panners.at(-1).positionX.targets.at(-1)?.[0] === 8, 'pozycja pętli - płynnie (setTargetAtTime)');

if (SOUNDS.meteor_impact) {
    sounds.play('meteor_impact', { position: new THREE.Vector3(0, 0, 40) });
    check(panners.at(-1).panningModel === 'HRTF', 'krótkie dźwięki zjawisk - nadal HRTF');
}


// --- WaterEffects: punkt dźwięku i podział na płynącą / stojącą --------

function gameWith(columns) {
    // columns: Map "x,z" -> { top, flowing }
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0.5, 61.6, 0.5);
    camera.lookAt(0.5, 61.6, -10);
    camera.updateMatrixWorld();
    const WATER = 9;
    const world = {
        getBlockId(x, y, z) { const c = columns.get(x + ',' + z); return c && y <= c.top && y > c.top - 3 ? WATER : 0; },
        getFlow(x, z) { return columns.get(x + ',' + z)?.flowing ? [1, 0] : null; }
    };
    return { camera, world, player: { pos: camera.position, splash: 0 }, sounds };
}

const { isLiquidId } = await import('../src/blocks/BlockRegistry.js');
const water = (await import('../src/blocks/BlockRegistry.js')).getBlockId('water');

// Rzeka tuż pod graczem (stoi na moście / przy brzegu): woda w pasie x = -1..1.
const river = new Map();
for (let z = -10; z <= 10; z++) for (let x = -1; x <= 1; x++) river.set(x + ',' + z, { top: 59, flowing: true });
const game = gameWith(river);
game.world.getBlockId = (x, y, z) => { const c = river.get(x + ',' + z); return c && y <= c.top && y > c.top - 3 ? water : 0; };
check(isLiquidId(water), 'woda to ciecz');
const effects = new WaterEffects(game);
effects.measureWaves();
const stream = effects.ambience.find((a) => a.sound === 'water_stream');
const waves = effects.ambience.find((a) => a.sound === 'water_waves');
check(effects.flowingWater > 40 && stream.target > 0.5 && waves.target === 0, `płynąca woda - strumień (${effects.flowingWater} kolumn), bez fal`);

// Punkt dźwięku: co najmniej 4 bloki od uszu, na wysokości uszu, przy
// każdym kierunku patrzenia (także prawie pionowo w dół), choć środek
// wody jest tuż pod graczem.
const ear = game.camera.position;
let positions = 0;
for (const pitch of [0, -1.2, -1.55, 1.2]) {
    for (let yaw = 0; yaw < 6.3; yaw += 0.7) {
        game.camera.rotation.set(pitch, yaw, 0, 'YXZ');
        game.camera.updateMatrixWorld();
        effects.updateSounds(0.25);
        for (const a of effects.ambience) {
            if (!a.loop) continue;
            const p = a.position;
            check(Math.hypot(p.x - ear.x, p.z - ear.z) >= 4 - 1e-6, `${a.sound}: punkt dźwięku co najmniej 4 bloki od uszu`);
            check(Math.abs(p.y - ear.y) < 1e-6, `${a.sound}: na wysokości uszu`);
            positions++;
        }
    }
}
check(positions > 20, 'pętla strumienia gra przy rzece');
check(effects.ambience.find((a) => a.sound === 'water_waves').loop === null, 'przy samej rzece - bez fal');

// Jezioro (stojąca woda) - fale, bez strumienia.
const lake = new Map();
for (let z = -8; z <= 8; z++) for (let x = -8; x <= 8; x++) lake.set(x + ',' + z, { top: 59, flowing: false });
const lakeGame = gameWith(lake);
lakeGame.world.getBlockId = (x, y, z) => { const c = lake.get(x + ',' + z); return c && y <= c.top && y > c.top - 3 ? water : 0; };
const lakeEffects = new WaterEffects(lakeGame);
lakeEffects.measureWaves();
check(lakeEffects.ambience.find((a) => a.sound === 'water_waves').target > 0.5 && lakeEffects.flowingWater === 0, 'jezioro - fale, bez strumienia');
effects.dispose();
check(effects.ambience.every((a) => a.loop === null), 'wyjście ze świata zatrzymuje pętle');


// --- Plik strumienia ---------------------------------------------------

const file = new URL('../assets/sounds/water/water_stream.ogg', import.meta.url);
check(existsSync(file) && statSync(file).size > 50_000, 'plik water_stream.ogg');
try {
    const raw = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file.pathname, '-ac', '1', '-ar', '44100', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    const pcm = new Int16Array(raw.buffer, raw.byteOffset, raw.length / 2);
    const seam = Math.abs(pcm[0] - pcm[pcm.length - 1]) / 32767;
    let typical = 0;
    for (let i = 1; i < 44100; i++) typical += Math.abs(pcm[i] - pcm[i - 1]) / 32767;
    typical /= 44100;
    check(seam < typical * 8 + 0.02, `pętla bez trzasku na szwie (${seam.toFixed(3)})`);
    check(pcm.length / 44100 >= 15, 'strumień - dłuższa pętla (bez wyraźnego powtarzania)');
}
catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('(bez ffmpeg - szew pętli niesprawdzony)');
}

console.log(`OK: szum wody - ${checks} sprawdzeń (stereo bez HRTF dla pętli, płynny ruch, strumień dla płynącej wody, punkt dźwięku z dala od głowy, pętla bez trzasku).`);
