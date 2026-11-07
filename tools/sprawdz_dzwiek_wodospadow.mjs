// Real SoundManager/controller with a controlled Web Audio clock. Sources
// remain counted until their scheduled onended, including fading loop tails.
// node tools/sprawdz_dzwiek_wodospadow.mjs [--benchmark] [--output report.json]
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib\/three)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});
const THREE = await import('three');
const { SoundManager } = await import('../src/audio/SoundManager.js');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { WaterfallAudio, waterfallAudioProfile, WATERFALL_AUDIO_CAPS } = await import('../src/audio/WaterfallAudio.js');
const { WaterEffects } = await import('../src/game/WaterEffects.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { fallingWaterId, getBlockId } = await import('../src/blocks/BlockRegistry.js');
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const near = (a, b, label, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);

function param(value = 0) {
    return { value, targets: [], values: [],
        setTargetAtTime(v, time, constant) { this.value = v; this.targets.push({ value: v, time, constant }); },
        setValueAtTime(v, time) { this.value = v; this.values.push({ value: v, time }); }, cancelScheduledValues() {} };
}
class FakeContext {
    constructor() {
        this.currentTime = 0; this.state = 'running'; this.destination = {};
        this.sources = []; this.panners = []; this.peak = 0;
        this.listener = Object.fromEntries(['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ'].map(k => [k, param()]));
    }
    node(extra = {}) { return { disconnected: false, connect() {}, disconnect() { this.disconnected = true; }, ...extra }; }
    createGain() { return this.node({ gain: param(1) }); }
    createBiquadFilter() { return this.node({ frequency: param(), Q: param() }); }
    createDynamicsCompressor() { return this.node({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }); }
    createPanner() { const node = this.node({ positionX: param(), positionY: param(), positionZ: param() }); this.panners.push(node); return node; }
    createBufferSource() {
        const context = this;
        const node = this.node({ playbackRate: param(1), started: false, ended: false, stopTime: Infinity,
            start(time, offset) {
                this.started = true; this.startTime = time; this.offset = offset;
                context.peak = Math.max(context.peak, context.sources.filter(s => s.started && !s.ended).length);
            },
            stop(time = context.currentTime) { this.stopTime = Math.min(this.stopTime, time); context.flush(); }
        });
        this.sources.push(node); return node;
    }
    flush() {
        for (const source of this.sources) if (source.started && !source.ended && source.stopTime <= this.currentTime + 1e-9) {
            source.ended = true; source.onended?.();
        }
    }
    advance(dt) { if (this.state === 'running') this.currentTime += dt; this.flush(); }
    resume() { this.state = 'running'; return Promise.resolve(); }
}
globalThis.window = { AudioContext: FakeContext };
// Loading/decoding of these unchanged assets has its own full file test.
const originalLoad = SoundManager.prototype.load;
SoundManager.prototype.load = async function () {
    for (const name of ['water_stream', 'water_waves', 'water_underwater']) this.buffers.set(name, [{ duration: 18.58 }]);
};

function fixture({ unlocked = true, potato = false, now = () => 0 } = {}) {
    const values = { potato, volumeMaster: 100, volumeWorld: 100, volumeBlocks: 100, volumeUi: 100 };
    const settings = { get: key => values[key], onChange() {} };
    const sounds = new SoundManager(settings);
    if (unlocked) sounds.unlock();
    sounds.setActive(true);
    const chunks = new Map();
    for (let z = -3; z <= 3; z++) for (let x = -3; x <= 3; x++) chunks.set(`${x},${z}`, new Chunk(x, z));
    let chunkReads = 0;
    const world = {
        getChunk(x, z) { chunkReads++; return chunks.get(`${x},${z}`); },
        getBlockId(x, y, z) {
            if (y < 0 || y >= 128) return 0;
            const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
            return chunks.get(`${cx},${cz}`)?.blocks[(y * 16 + z - cz * 16) * 16 + x - cx * 16] ?? 0;
        },
        generateChunk() { throw new Error('Audio must never generate terrain'); }
    };
    const camera = new THREE.PerspectiveCamera(); camera.position.set(.5, 6.2, .5);
    const game = { world, sounds, settings, camera, waterfalls: { landings: [] }, player: { pos: camera.position, splash: 0 } };
    const audio = new WaterfallAudio(game, { now });
    const f = { game, audio, sounds, chunks, values, get chunkReads() { return chunkReads; },
        set(x, y, z, id) {
            const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
            const chunk = chunks.get(`${cx},${cz}`);
            if (chunk.setId(x - cx * 16, y, z - cz * 16, id)) chunk.meshRevision++;
        },
        landing(x, z, fall = 8, y = 6) {
            f.set(x, y, z, fallingWaterId(fall));
            const landing = { key: `${x},${y},${z}`, x, y, z, fall, surface: y + .2 };
            game.waterfalls.landings.push(landing); return landing;
        },
        tick(dt = 1 / 60, underwater = false) {
            sounds.context?.advance(dt); audio.update(dt, underwater);
            check(audio.lastProcessed <= 96, 'Occlusion update respects cell budget');
            check(sounds.voices <= 4, 'Actual SoundManager voices include fading tails and stay ≤4');
        },
        run(seconds = 1, underwater = false, dt = 1 / 60) {
            for (let i = 0; i < Math.ceil(seconds / dt); i++) f.tick(dt, underwater);
        },
        dispose() {
            audio.dispose(); audio.dispose(); sounds.context?.advance(1);
            equal(sounds.voices, 0, 'Dispose releases actual voice count');
            equal(sounds.loops.size, 0, 'Dispose releases loop controls');
            equal(sounds.gameVoices.size, 0, 'Dispose releases game voice references');
            check(sounds.context?.sources.every(source => source.disconnected) ?? true, 'All stopped audio nodes disconnect');
            equal(audio.game, null, 'Controller releases world/game reference');
        }
    };
    return f;
}

// Existing recordings, smooth monotonic height curve, no new download/asset.
for (const sound of ['water_stream', 'water_waves']) {
    check(SOUNDS[sound].loop && SOUNDS[sound].category === 'world', `${sound}: existing world loop`);
}
let previous = waterfallAudioProfile(1);
for (let fall = 2; fall <= 16; fall++) {
    const profile = waterfallAudioProfile(fall);
    check(profile.volume > previous.volume && profile.pitch < previous.pitch, 'Higher waterfall is louder/deeper');
    previous = profile;
}
equal(waterfallAudioProfile(-5), waterfallAudioProfile(1), 'Height lower clamp');
equal(waterfallAudioProfile(900), waterfallAudioProfile(16), 'Height upper clamp');

// One actual voice per waterfall, nearest4, stable across refreshed ordering.
{
    const f = fixture();
    for (const x of [4, 8, 12, 16, 20, 24]) f.landing(x, 0, 8);
    f.run();
    equal(f.audio.stats().loops, 4, 'Four nearest impacts play four loops');
    equal(f.audio.stats().sources.map(s => s.key), ['4,6,0', '8,6,0', '12,6,0', '16,6,0'], 'Nearest emitter selection');
    equal(f.sounds.context.peak, 4, 'Real voice peak is four');
    check(f.sounds.context.panners.every(p => p.panningModel === 'equalpower'), 'Waterfall loops retain stereo rather than HRTF');
    const controls = f.audio.slots.map(slot => slot.loop);
    f.game.waterfalls.landings.reverse(); f.game.camera.position.x += .1; f.run(.4);
    equal(f.audio.slots.map(slot => slot.loop), controls, 'Input reorder/tiny listener motion do not restart loops');
    const raysBefore = f.audio.rayCells;
    f.run(.7);
    equal(f.audio.rayCells, raysBefore, 'Unchanged paths require no additional voxel scans');
    f.values.potato = true; f.run(.7);
    equal(f.audio.stats().limit, 2, 'Settings switch selects potato cap');
    equal(f.sounds.voices, 2, 'Extra actual voices finish fading in potato mode');
    f.audio.setAmount(0); f.run(.5);
    equal(f.sounds.voices, 0, 'Amount0 releases all voices after fade');
    f.dispose();
}

// Same-plane neighboring impacts merge into their strongest representative.
{
    const f = fixture(); f.landing(6, 0, 3); f.landing(7, 0, 16); f.landing(6, 0, 8, 12);
    f.run();
    equal(f.audio.stats().loops, 2, 'Nearby same-plane impacts merge; another height remains separate');
    check(f.audio.stats().sources.some(s => s.key === '7,6,0' && s.fall === 16), 'Strongest adjacent impact wins');
    f.dispose();
}

// Symmetric equal-height/equal-distance impacts exercise both tie breakers.
// Re-enabling removes retention priority, so input order cannot hide a changed
// cold selection. Neither selection nor deduplication needs language collation.
{
    const originalLocaleCompare = String.prototype.localeCompare, originalCollator = Intl.Collator;
    String.prototype.localeCompare = () => { throw new Error('Audio selection must not initialize locale collation'); };
    Intl.Collator = () => { throw new Error('Audio selection must not construct an Intl collator'); };
    try {
        for (const potato of [false, true]) {
            const f = fixture({ potato });
            try {
                for (const [x, z] of [[10, 0], [-10, 0], [0, 10], [0, -10], [6, 8], [-6, 8], [6, -8], [-6, -8]]) {
                    f.landing(x, z, 8);
                }
                const landings = [...f.game.waterfalls.landings], limit = potato ? 2 : 4;
                const expected = ['-10,6,0', '-6,6,-8', '-6,6,8', '0,6,-10'].slice(0, limit);
                equal(new Set(landings.map(p => Math.hypot(p.x, p.z))).size, 1,
                    'Fixture has genuinely equal horizontal distances for all eight impacts');
                for (let shift = 0; shift < landings.length; shift++) {
                    const order = [...landings.slice(shift), ...landings.slice(0, shift)];
                    if (shift % 2) order.reverse();
                    f.game.waterfalls.landings = order;
                    f.audio.setAmount(1); f.run(.4);
                    equal(f.audio.selected.map(p => p.key), expected,
                        `Cold/re-enabled symmetric selection is deterministic: shift${shift}, cap${limit}`);
                    equal(f.audio.stats().loops, limit, 'Equal scores fill exactly the configured voice limit');
                    const controls = f.audio.slots.map(slot => slot.loop);
                    f.game.waterfalls.landings.reverse(); f.audio.refresh = 0; f.tick();
                    equal(f.audio.selected.map(p => p.key), expected, 'Warm input reordering keeps the same selected IDs');
                    equal(f.audio.slots.map(slot => slot.loop), controls, 'Warm reordering never restarts equal-score voices');
                    f.audio.setAmount(0); f.run(.4);
                    equal([f.sounds.voices, f.audio.stats().reserved], [0, 0],
                        'Disable releases real fade tails and retention before another cold tie');
                    check(f.sounds.context.peak <= limit, 'Symmetric selection and repeated restarts respect the actual voice cap');
                }
            } finally { f.dispose(); }
        }
        const f = fixture();
        try {
            for (const [x, z] of [[8, 1], [-8, 1], [8, -1], [-8, -1]]) f.landing(x, z, 8);
            for (let order = 0; order < 2; order++) {
                f.game.waterfalls.landings.reverse(); f.audio.setAmount(1); f.run(.4);
                equal(f.audio.selected.map(p => p.key), ['-8,6,-1', '8,6,-1'],
                    'Same-plane symmetric neighboring impacts choose stable representatives before deduplication');
                equal(f.sounds.voices, 2, 'Two adjacent pairs create two actual voices');
                f.audio.setAmount(0); f.run(.4);
            }
        } finally { f.dispose(); }
    } finally {
        String.prototype.localeCompare = originalLocaleCompare;
        Intl.Collator = originalCollator;
    }
}

// Recording and emitter replacement waits for source.onended. Suspending the
// audio clock must not release a fading reservation early using frame dt.
{
    const f = fixture(); const landing = f.landing(8, 0, 3);
    f.run();
    equal(f.audio.stats().sources[0].sound, 'water_waves', 'Small drop uses quiet splashing');
    const oldControl = f.audio.slots.find(s => s.loop).loop;
    f.set(8, 6, 0, fallingWaterId(16)); landing.fall = 16;
    f.audio.refresh = 0; f.tick();
    check(oldControl.stopped && !oldControl.ended, 'Scheduled stop is distinct from actual completion');
    f.sounds.context.state = 'suspended';
    f.run(1);
    equal(f.sounds.voices, 1, 'Suspended fade retains one real voice');
    equal(f.sounds.context.sources.length, 1, 'No replacement starts before onended');
    f.sounds.context.state = 'running'; f.run(.6);
    check(oldControl.ended, 'Control exposes actual source completion');
    equal(f.audio.stats().sources[0].sound, 'water_stream', 'Tall replacement uses stronger stream noise');
    equal(f.sounds.context.peak, 1, 'Changing the recording never overlaps two voices for one emitter');
    f.dispose();
}

// Occlusion: loaded voxel ray, solid wall/double wall, reopened path, and
// independent underwater volume plus the SoundManager shared lowpass.
{
    const f = fixture(); f.landing(12, 0, 16); f.run();
    const open = f.audio.stats().sources[0].gain;
    f.set(5, 6, 0, getBlockId('stone')); f.run(1.3);
    const wall = f.audio.stats().sources[0];
    near(wall.occlusion, .28, 'One solid voxel attenuates the path');
    check(wall.gain < open * .4, 'Wall audibly reduces target gain');
    f.set(6, 6, 0, getBlockId('stone')); f.run(.8);
    check(f.audio.stats().sources[0].occlusion < .1, 'Thicker rock attenuates further');
    f.set(5, 6, 0, 0); f.set(6, 6, 0, 0); f.run(1.3);
    near(f.audio.stats().sources[0].occlusion, 1, 'Open passage restores direct sound');
    f.sounds.setUnderwater(true); f.run(1.3, true);
    const submerged = f.audio.stats().sources[0];
    check(submerged.gain > 0 && submerged.gain < open * .3, 'Submerged waterfall remains subdued, not silent');
    equal(f.sounds.muffle.frequency.value, 750, 'Existing shared underwater lowpass remains active');
    f.sounds.setUnderwater(false); f.run(1.3);
    check(f.audio.stats().sources[0].gain > submerged.gain * 3, 'Surfacing smoothly restores waterfall volume');
    f.dispose();
}

// Occlusion traverses at most96 cells/frame and72/ray, with a real deadline.
{
    const f = fixture();
    for (const [x, z] of [[36, 0], [-36, 0], [0, 36], [0, -36]]) f.landing(x, z, 16);
    f.tick();
    equal(f.audio.lastProcessed, 96, 'Long paths are sliced at the cell cap');
    check(f.audio.stats().queued > 0, 'Remaining ray work waits for next frame');
    f.run(.5);
    equal(f.audio.stats().queued, 0, 'Bounded rays eventually complete');
    check(f.audio.slots.every(s => !s.path || s.path.cells <= 72), 'Per-ray scan cap');
    f.dispose();
    let time = 0, stride = .3;
    const timed = fixture({ now: () => time += stride }); timed.landing(8, 0);
    timed.tick(); equal(timed.audio.lastProcessed, 0, 'Expired CPU deadline starts no ray cell');
    stride = 0; timed.run(.5);
    equal(timed.audio.stats().loops, 1, 'Deadline-limited work resumes'); timed.dispose();
}

// Unloaded paths cannot be assumed acoustically open; unloaded/stale impacts
// promptly fade away and cannot synchronously create replacement chunks.
{
    const f = fixture(); f.landing(36, 0, 16); f.run();
    f.chunks.delete('1,0'); f.run(1);
    equal(f.audio.stats().sources[0].occlusion, 0, 'Unloaded intermediate chunk mutes path');
    f.chunks.delete('2,0'); f.tick();
    check(f.audio.stats().fading === 1, 'Unloaded impact begins fade immediately');
    f.run(.5); equal(f.sounds.voices, 0, 'Unloaded impact releases actual voice');
    f.dispose();
    const stale = fixture(); stale.landing(8, 0); stale.run();
    stale.set(8, 6, 0, 0); stale.tick();
    check(stale.audio.stats().fading === 1, 'Removed falling cell invalidates stale landing list');
    stale.run(.5); equal(stale.sounds.voices, 0, 'Removed impact releases voice'); stale.dispose();
}

// Distance hysteresis avoids edge chatter; leaving the listening radius frees
// the voice. Retiring slots also count against the hard cap during teleports.
{
    const f = fixture(); f.landing(38, 0, 16); f.run();
    equal(f.sounds.voices, 1, 'Impact enters at38 blocks');
    const loop = f.audio.slots.find(s => s.loop).loop;
    f.game.camera.position.x = -.5; f.run(.4);
    equal(f.audio.slots.find(s => s.loop)?.loop, loop, 'Existing impact stays through39-block hysteresis');
    f.game.camera.position.x = -2.5; f.run(.7);
    equal(f.sounds.voices, 0, 'Leaving40-block radius releases voice'); f.dispose();
    const moving = fixture();
    for (const x of [-32, -28, -24, -20, 20, 24, 28, 32]) moving.landing(x, 0, 16);
    moving.game.camera.position.x = -24.5; moving.run(.8);
    moving.game.camera.position.x = 24.5; moving.run(1.1);
    check(moving.sounds.context.peak <= 4, 'Teleport replacement including fade tails stays within four actual voices');
    check(moving.audio.stats().sources.every(s => s.position.x > 0), 'New nearest emitters eventually replace distant ones'); moving.dispose();
}

// Pausing freezes playback rate without repeated pitch/loop automation. Audio
// unlock and missing buffers can retry without leaking reservations or voices.
{
    const f = fixture(); f.landing(8, 0); f.run();
    const source = f.sounds.context.sources[0], targetCount = source.playbackRate.targets.length;
    f.sounds.setActive(false); f.run(.5);
    equal(source.playbackRate.value, 0, 'Pause keeps the source frozen');
    equal(source.playbackRate.targets.length, targetCount, 'Paused update does not overwrite frozen pitch');
    f.sounds.setActive(true); f.run(.5);
    equal(f.sounds.context.sources.length, 1, 'Resume reuses original loop'); f.dispose();
    const locked = fixture({ unlocked: false }); locked.landing(8, 0); locked.run(.7);
    equal(locked.sounds.voices, 0, 'Locked audio creates no voices');
    locked.sounds.unlock(); locked.run(.7); equal(locked.sounds.voices, 1, 'Unlock retries pending audible emitter'); locked.dispose();
    const missing = fixture(); missing.sounds.buffers.delete('water_stream'); missing.landing(8, 0); missing.run(.7);
    equal(missing.sounds.voices, 0, 'Missing recording creates no partial voice');
    missing.sounds.buffers.set('water_stream', [{ duration: 18.58 }]); missing.run(.7);
    equal(missing.sounds.voices, 1, 'Loaded recording retries bounded slot'); missing.dispose();
}

// WaterEffects owns the controller and disposes it with the world. Check the
// real manager counts across repeated enter/leave lifecycles, not just mocks.
for (let cycle = 0; cycle < 4; cycle++) {
    const f = fixture({ potato: true }); f.landing(4, 0); f.landing(8, 0); f.landing(12, 0);
    f.audio.dispose();
    const effects = new WaterEffects(f.game); f.game.water = effects;
    effects.wavesTimer = Infinity;
    for (let i = 0; i < 30; i++) { f.sounds.context.advance(1 / 30); effects.updateSounds(1 / 30); }
    equal(effects.waterfallAudio.stats().voices, 2, 'WaterEffects integration obeys potato limit');
    effects.dispose(); effects.dispose(); f.sounds.context.advance(1);
    equal(f.sounds.voices, 0, 'World exit releases waterfall sources');
    equal(f.sounds.loops.size, 0, 'World exit releases loop controls');
    equal(f.sounds.gameVoices.size, 0, 'World exit releases game voice nodes');
}

console.log(`OK: dźwięk wodospadów — ${checks} sprawdzeń wysokości, przeszkód, budżetu i cyklu głosów.`);

if (process.argv.includes('--benchmark')) {
    const trials = [];
    for (let trial = 0; trial < 6; trial++) {
        const f = fixture({ now: () => performance.now() });
        for (const [x, z] of [[36, 0], [-36, 0], [0, 36], [0, -36]]) f.landing(x, z, 16);
        for (let frame = 0; frame < 60; frame++) { f.sounds.context.advance(1 / 60); f.audio.update(1 / 60); }
        const beforeRays = f.audio.rayCells;
        const start = performance.now();
        for (let frame = 0; frame < 1800; frame++) { f.sounds.context.advance(1 / 60); f.audio.update(1 / 60); }
        const settledMs = (performance.now() - start) / 1800;
        f.set(10, 6, 0, getBlockId('stone')); f.audio.refresh = 0;
        const raySamples = [];
        for (let frame = 0; frame < 10; frame++) {
            f.sounds.context.advance(1 / 60); f.audio.update(1 / 60);
            if (f.audio.lastProcessed) raySamples.push({ ms: f.audio.lastMs, cells: f.audio.lastProcessed });
        }
        if (trial) trials.push({ settledMs, settledRayCells: f.audio.rayCells - beforeRays - raySamples.reduce((n, s) => n + s.cells, 0),
            raySamples, voices: f.sounds.voices, peakVoices: f.sounds.context.peak });
        f.audio.dispose(); f.sounds.context.advance(1);
    }
    const sorted = trials.map(t => t.settledMs).sort((a, b) => a - b);
    const report = { checks, node: process.version, platform: process.platform, arch: process.arch,
        kind: 'CPU controller with real SoundManager and controlled Web Audio nodes; no acoustic/FPS claim',
        caps: WATERFALL_AUDIO_CAPS, fixture: { emitters: 4, fall: 16, listener: [.5, 6.2, .5],
            relativeSourceXZ: [[36, 0], [-36, 0], [0, 36], [0, -36]], dt: 1 / 60,
            settleFrames: 60, measuredFrames: 1800, obstacle: [10, 6, 0], obstacleFrames: 10 },
        warmupTrials: 1, measuredTrials: 5, trials, medianSettledMs: sorted[2] };
    const output = process.argv.indexOf('--output');
    if (output >= 0) { const path = process.argv[output + 1]; assert.ok(path); await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(report, null, 2)}\n`); }
    console.log(JSON.stringify(report, null, 2));
}
SoundManager.prototype.load = originalLoad;
