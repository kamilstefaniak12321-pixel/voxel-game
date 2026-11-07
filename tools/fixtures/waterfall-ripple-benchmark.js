// Real Game scene, actual fluid landings, and paired GPU renders. Switching
// the ripple mesh off is a component comparison, not an old-version FPS test.
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Settings } from '../../src/settings/Settings.js';
import { createWorldInfo } from '../../src/storage/WorldStorage.js';
import { findScene } from '../../src/dev/scenes.js';
import { atlasReady } from '../../src/rendering/TextureAtlas.js';
import { plantWindUniforms } from '../../src/rendering/PlantWind.js';
import { setShadowDefine } from '../../src/rendering/BlockRenderData.js';
import { shadowUniforms } from '../../src/rendering/Shadows.js';
import { RIPPLE_PERIOD } from '../../src/rendering/WaterfallRipples.js';
import { getWaterLevel } from '../../src/blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../../src/world/WaterSurface.js';

const WIDTH = 720, HEIGHT = 480, FLOOR = 16;
const POOLS = [{ fall: 3, x: 12 }, { fall: 8, x: 0 }, { fall: 16, x: -12 }];
const ISLAND = { x: -13, y: FLOOR, z: 10 };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const quantiles = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = p => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
    return { samples: values.length, meanMs: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
        p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
};

export async function createWaterfallRippleQA() {
    await atlasReady;
    const checks = [], frames = new Map();
    const ensure = (condition, label) => { if (!condition) throw new Error(label); };
    const check = (condition, label) => { ensure(condition, label); checks.push(label); };
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(WIDTH, HEIGHT); document.body.append(renderer.domElement);
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 24, farTerrain: 0, loadBudget: 1,
        shadows: 0, lightShafts: false, bounceLight: false, surfaceBounce: false,
        meteorites: false, showHand: false, viewBobbing: false, potato: false,
        plantModels: 'simple', leafModel: 'cube', volumeMaster: 0, volumeMusic: 0,
        lightingLook: 'baseline', cloudCover: 0 })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta'
        ? () => ({ x: 0, y: 0 }) : () => 0 });
    const info = createWorldInfo('Fale wodospadów — izolowana próba', 731, 'flat', 'developer');
    info.player = { x: .5, y: 40, z: -8.5, yaw: Math.PI, pitch: -.2, flying: true };
    const game = await Game.start(renderer, input, null, info, settings);
    game.time.speed = 0; game.time.days = .5;
    game.update(1 / 60);
    const world = game.world, effects = game.waterfalls, ripples = effects.ripples;
    check(Boolean(ripples?.surface && ripples?.mesh && ripples?.material.uniforms.uRippleTime),
        'Real Game owns the planar ripple renderer and connected surface cache');
    const entries = () => ripples.surface.entries;
    const entryFor = fall => entries().find(entry => entry.fall === fall && entry.y === FLOOR);
    const describe = entry => entry && ({ key: entry.key, x: entry.x, y: entry.y, z: entry.z,
        fall: entry.fall, radius: entry.radius, opacity: entry.opacity, patches: entry.patches.length });
    const poolFor = name => POOLS.find(pool => name === `drop-${pool.fall}`);
    const frameKey = (name, phase, enabled) => `${name}:${phase}:${enabled}`;

    async function settleFluids(label) {
        let quiet = 0;
        for (let i = 0; i < 6000; i++) {
            world.fluids.update(.12, .6, 64);
            const stats = world.fluids.stats();
            ensure(stats.lastProcessed <= 64 && stats.lastChanges <= 24 && stats.lastScanCells <= 1024,
                `${label}: bounded fluid slice ${i}`);
            world.updateMeshes(performance.now() + .6);
            quiet = stats.pending === 0 && stats.scans === 0 ? quiet + 1 : 0;
            if (quiet === 3) {
                world.updateMeshes(Infinity); check(true, `${label}: every fluid slice respects its work caps`); return i + 1;
            }
            if (i % 16 === 0) await pause();
        }
        throw new Error(`${label} did not settle: ${JSON.stringify(world.fluids.stats())}`);
    }

    async function refreshRipples(label) {
        const effectsMs = [], rippleMs = [], discoveryMs = [];
        const before = ripples.stats().geometryRevision;
        let maxProcessed = 0;
        effects.refresh = 0;
        for (let i = 0; i < 1000; i++) {
            const started = performance.now();
            effects.update(1 / 60, game.player);
            effectsMs.push(performance.now() - started);
            const stats = ripples.stats();
            rippleMs.push(stats.lastMs); discoveryMs.push(ripples.surface.stats().lastMs);
            maxProcessed = Math.max(maxProcessed, stats.lastProcessed);
            ensure(stats.lastProcessed <= stats.caps.cellsPerUpdate && stats.emitters <= stats.caps.emitters &&
                stats.cells <= stats.caps.cellsPerEmitter * stats.caps.emitters && stats.tiles <= stats.maxTiles,
            `${label}: bounded ripple slice ${i}`);
            if (stats.queued === 0 && i > 20) {
                check(true, `${label}: every ripple slice respects work and geometry caps`);
                return { steps: i + 1, effects: quantiles(effectsMs), ripples: quantiles(rippleMs),
                    discovery: quantiles(discoveryMs), maxProcessed, geometryUploads: stats.geometryRevision - before };
            }
            if (i % 16 === 0) await pause();
        }
        throw new Error(`${label} ripple discovery did not settle`);
    }

    function surfaceChecks(label) {
        const all = entries().flatMap(entry => entry.patches);
        check(all.length > 0, `${label}: ripple geometry covers receiving water`);
        check(all.every(patch => getWaterLevel(world.getBlockId(patch.x, patch.y, patch.z)) >= 0),
            `${label}: no ripple tile lies on dry ground`);
        check(all.every(patch => !(patch.x === ISLAND.x && patch.y === ISLAND.y && patch.z === ISLAND.z)),
            `${label}: the stone island is excluded from ripple geometry`);
        check(entries().every(entry => entry.patches.length <= ripples.stats().caps.cellsPerEmitter),
            `${label}: every emitter respects its tile cap`);
    }

    async function initialize() {
        const started = performance.now();
        for (let cz = -1; cz <= 3; cz++) for (let cx = -3; cx <= 3; cx++) world.generateChunk(cx, cz);
        const scene = findScene('wodospady');
        check(typeof scene?.build === 'function', 'The actual developer waterfall scene exists');
        const sceneDescription = scene.build({ game, world, player: game.player }, { x: 0, y: FLOOR, z: 0 });
        world.setBlock(ISLAND.x, ISLAND.y, ISLAND.z, 'stone');
        // This fourth fall lands on stone. Only its genuinely wet, shallow
        // runout may carry ripples; dry neighboring cells remain excluded.
        world.setBlock(28, 22, 10, 'water');
        game.player.pos.set(.5, 38, 8.5); game.player.flying = true;
        const fluidSteps = await settleFluids('Developer waterfalls');
        const initialDiscovery = await refreshRipples('Developer waterfalls');
        const strengths = POOLS.map(pool => {
            const entry = entryFor(pool.fall);
            check(Boolean(entry?.patches.length), `Drop ${pool.fall} reaches its real receiving pool`);
            return describe(entry);
        });
        check(strengths.every((entry, i) => i === 0 || entry.radius > strengths[i - 1].radius && entry.opacity > strengths[i - 1].opacity),
            'Higher drops produce larger, stronger ripple fields');
        const runout = entries().find(entry => entry.x > 24);
        check(Boolean(runout?.patches.length) && runout.y === FLOOR + 1,
            'A fall onto stone follows the shallow runout at its actual higher water layer');
        surfaceChecks('Initial scene');
        return { checks: [...checks], sceneDescription, initializationMs: performance.now() - started,
            fluidSteps, initialDiscovery, strengths, runout: describe(runout), stats: ripples.stats(),
            scope: 'Existing developer scene at a fixed origin; one stone island and one dry-floor fall added for masking' };
    }

    function aim(name) {
        const pool = poolFor(name);
        const eye = pool ? [pool.x + 5.5, 28, 1.5] : name === 'dry' ? [35, 29, 1] : [29, 43, -23];
        const target = pool ? [pool.x + .5, 16.9, 10.5] : name === 'dry' ? [28.5, 17.5, 10.5] : [0, 22, 12];
        game.scene.fog.near = 80; game.scene.fog.far = 160;
        game.camera.position.set(...eye); game.camera.lookAt(...target);
        game.camera.fov = pool ? 50 : 60; game.camera.aspect = WIDTH / HEIGHT;
        game.camera.updateProjectionMatrix(); game.camera.updateMatrixWorld(true);
        return pool;
    }

    function visiblePool(name, pool) {
        if (!pool) return null;
        const x = pool.x, y = FLOOR, z = 9;
        const point = new THREE.Vector3(x + .5, y + waterSurfaceHeight(world, x, y, z), z + .5);
        const projected = point.clone().project(game.camera);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), game.camera);
        const meshes = [...world.chunks.values()].map(chunk => chunk.mesh).filter(mesh => mesh?.visible);
        const hit = ray.intersectObjects(meshes, false)[0];
        check(Math.abs(projected.x) < .9 && Math.abs(projected.y) < .9 && projected.z > -1 && projected.z < 1 &&
            hit?.face?.materialIndex === 2 && hit.point.distanceTo(point) < .01,
        `${name}: the receiving pool is actually visible before any pixel comparison`);
        return { point: point.toArray(), screen: [(projected.x + 1) * WIDTH / 2, (1 - projected.y) * HEIGHT / 2] };
    }

    function render(name, phase = .8, enabled = true) {
        const pool = aim(name);
        // Freeze ordinary water waves, particles and lighting while comparing
        // the new overlay. Only its radial phase is varied between loop frames.
        plantWindUniforms.uTime.value = .7;
        ripples.material.uniforms.uRippleTime.value = phase;
        ripples.mesh.visible = enabled && ripples.tiles > 0;
        game.render();
        const gl = renderer.getContext(), pixels = new Uint8Array(WIDTH * HEIGHT * 4);
        gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        check(gl.getError() === gl.NO_ERROR, `${name}: ripple frame completes without a WebGL error`);
        const probe = visiblePool(name, pool);
        frames.set(frameKey(name, phase, enabled), pixels);
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return { name, phase, enabled, probe, stats: ripples.stats(), drawCalls: renderer.info.render.calls,
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    }

    function compare(name, phase = .8) {
        const before = frames.get(frameKey(name, phase, false)), after = frames.get(frameKey(name, phase, true));
        check(Boolean(before && after), `${name}: both overlay-off and overlay-on frames exist`);
        const pool = poolFor(name), wetCells = new Set(), rayPoint = new THREE.Vector3();
        let changedPixels = 0, poolPixels = 0, dryInteriorPixels = 0, islandPixels = 0;
        // Pixel deltas are mapped back to the receiving layer. Restrict dry
        // checks to cell interiors, away from raster edges and ordinary waves.
        const camera = game.camera.position;
        for (let i = 0; i < before.length; i += 4) {
            const delta = Math.max(Math.abs(after[i] - before[i]), Math.abs(after[i + 1] - before[i + 1]), Math.abs(after[i + 2] - before[i + 2]));
            if (delta <= 2) continue;
            changedPixels++;
            if (!pool) continue;
            const pixel = i / 4, px = pixel % WIDTH, py = Math.floor(pixel / WIDTH);
            rayPoint.set((px + .5) / WIDTH * 2 - 1, (py + .5) / HEIGHT * 2 - 1, .5).unproject(game.camera);
            const t = (FLOOR + .875 - camera.y) / (rayPoint.y - camera.y);
            const wx = camera.x + (rayPoint.x - camera.x) * t, wz = camera.z + (rayPoint.z - camera.z) * t;
            if (wx < pool.x - 5 || wx > pool.x + 5 || wz < 5 || wz > 16) continue;
            const x = Math.floor(wx), z = Math.floor(wz), inside = wx - x > .2 && wx - x < .8 && wz - z > .2 && wz - z < .8;
            if (!inside) continue;
            if (getWaterLevel(world.getBlockId(x, FLOOR, z)) >= 0) { poolPixels++; wetCells.add(`${x},${z}`); }
            else { dryInteriorPixels++; if (x === ISLAND.x && z === ISLAND.z) islandPixels++; }
        }
        check(changedPixels > 20, `${name}: enabling ripples visibly changes the rendered image`);
        if (pool) {
            check(poolPixels > 20 && wetCells.size >= 3, `${name}: visible rings span at least three receiving water blocks`);
            check(dryInteriorPixels === 0, `${name}: no ripple pixel paints the interiors of dry shore or island cells`);
        }
        return { changedPixels, receivingPixels: poolPixels, receivingCells: [...wetCells], dryInteriorPixels, islandPixels,
            scope: 'Same camera, geometry, lighting, particles and water clock; only the ripple overlay is switched' };
    }

    function animation() {
        const first = frames.get(frameKey('drop-16', .2, true));
        const middle = frames.get(frameKey('drop-16', .8, true));
        const loop = frames.get(frameKey('drop-16', .2 + RIPPLE_PERIOD, true));
        check(Boolean(first && middle && loop), 'Ripple animation has start, intermediate and full-period frames');
        let movingPixels = 0, loopPixels = 0, loopMax = 0;
        for (let i = 0; i < first.length; i += 4) {
            let moving = 0, repeat = 0;
            for (let c = 0; c < 3; c++) {
                moving = Math.max(moving, Math.abs(first[i + c] - middle[i + c]));
                repeat = Math.max(repeat, Math.abs(first[i + c] - loop[i + c]));
            }
            if (moving > 2) movingPixels++;
            if (repeat > 2) loopPixels++;
            loopMax = Math.max(loopMax, repeat);
        }
        check(movingPixels > 20, 'Radial rings move between the sampled phases');
        check(loopPixels === 0, 'A complete ripple period returns the same image within two color levels');
        return { periodSeconds: RIPPLE_PERIOD, movingPixels, loopPixels, loopMaxChannelDifference: loopMax };
    }

    function shadowVariants() {
        const first = checks.length, variants = [], failures = [], gl = renderer.getContext();
        const material = ripples.material, oldDefines = material.defines ?? {};
        const oldSun = 'USE_SUN_SHADOWS' in oldDefines, oldFar = 'USE_FAR_SHADOWS' in oldDefines;
        const oldHook = ripples.mesh.onBeforeRender, oldError = renderer.debug.onShaderError;
        const oldDebug = renderer.debug.checkShaderErrors, revision = ripples.stats().geometryRevision;
        check(!game.shadows.enabled && shadowUniforms.uSunShadowInfo.value.y === 0,
            'Shadow variant smoke uses inactive shadow maps and zero shadow strength');
        check(ripples.mesh.visible && ripples.geometry.drawRange.count > 0,
            'Shadow shader variants execute on the existing visible ripple mesh');
        let submitted = 0;
        ripples.mesh.onBeforeRender = function (...args) { submitted++; oldHook.apply(this, args); };
        renderer.debug.checkShaderErrors = true;
        renderer.debug.onShaderError = (context, program, vertex, fragment) => failures.push(
            [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].join('\n'));
        try {
            for (const far of [false, true]) {
                setShadowDefine([material], true, far);
                submitted = 0;
                game.render(); gl.finish();
                const name = far ? 'sun-and-far' : 'sun-only';
                check(failures.length === 0, `${name}: ripple shaders link successfully: ${failures.join('\n')}`);
                check(submitted > 0 && gl.getError() === gl.NO_ERROR, `${name}: the ripple variant draws without a WebGL error`);
                variants.push({ name, sun: true, far, rippleSubmissions: submitted, drawCalls: renderer.info.render.calls });
            }
        } finally {
            setShadowDefine([material], oldSun, oldFar);
            ripples.mesh.onBeforeRender = oldHook;
            renderer.debug.onShaderError = oldError; renderer.debug.checkShaderErrors = oldDebug;
        }
        check(ripples.stats().geometryRevision === revision, 'Compiling shadow variants does not rebuild ripple geometry');
        return { checks: checks.slice(first), variants,
            scope: 'GPU shader compilation and draw smoke with shadow weight zero; not a physical shadow-quality test' };
    }

    async function measure() {
        await refreshRipples('Measurement warmup');
        const first = checks.length, effectsMs = [], rippleMs = [], discoveryMs = [];
        const geometryRevision = ripples.stats().geometryRevision, loaded = world.chunks.size;
        let maxProcessed = 0, maxTiles = 0, maxEmitters = 0, maxParticles = 0;
        for (let frame = 0; frame < 720; frame++) {
            const started = performance.now(); effects.update(1 / 60, game.player); effectsMs.push(performance.now() - started);
            const stats = ripples.stats(), surface = ripples.surface.stats();
            rippleMs.push(stats.lastMs); discoveryMs.push(surface.lastMs);
            maxProcessed = Math.max(maxProcessed, stats.lastProcessed); maxTiles = Math.max(maxTiles, stats.tiles);
            maxEmitters = Math.max(maxEmitters, stats.emitters); maxParticles = Math.max(maxParticles, effects.count);
            ensure(stats.lastProcessed <= stats.caps.cellsPerUpdate && stats.emitters <= stats.caps.emitters &&
                stats.tiles <= stats.maxTiles, `Measured frame ${frame} respects ripple work and geometry caps`);
            if (frame % 120 === 0) await pause();
        }
        check(true, 'Every measured update respects ripple work and geometry caps');
        check(ripples.stats().geometryRevision === geometryRevision, 'Animation and landing refreshes do not rebuild unchanged ripple geometry');
        check(world.chunks.size === loaded, 'Ripple updates never load a chunk');
        return { checks: checks.slice(first), effects: quantiles(effectsMs), ripples: quantiles(rippleMs), discovery: quantiles(discoveryMs),
            maxProcessed, maxTiles, maxEmitters, maxParticles, geometryRevision, stats: ripples.stats(),
            scope: '720 fixed 1/60s updates on the real Game effects; main-thread CPU only, rendering excluded, no hardware FPS claim' };
    }

    async function lifecycle() {
        const first = checks.length, old = describe(entryFor(3));
        check(Boolean(old), 'The short waterfall exists before source-height mutation');
        for (let x = 11; x <= 13; x++) for (let z = 14; z <= 20; z++) world.setBlock(x, 20, z, 'stone');
        const x = Math.floor(old.x), z = Math.floor(old.z);
        world.setBlock(x, 25, z, 'water');
        await settleFluids('Raised source'); const raisedDiscovery = await refreshRipples('Raised source');
        const raised = entries().find(entry => entry.key === old.key);
        check(raised?.fall === 8 && raised.radius > old.radius && raised.opacity > old.opacity,
            'Changing the real feeder height replaces the same impact with stronger eight-block ripples');
        const changed = describe(raised);
        world.setBlock(x, 25, z, null);
        await settleFluids('Removed source'); const removedDiscovery = await refreshRipples('Removed source');
        check(!entries().some(entry => entry.key === old.key), 'Removing the source removes its ripple emitter');
        check(entries().some(entry => entry.fall === 16), 'Another waterfall stays active after removing the short one');
        for (const chunk of [...world.chunks.values()]) world.unloadChunk(chunk);
        const unloadedDiscovery = await refreshRipples('Unloaded scene');
        check(ripples.stats().emitters === 0 && ripples.stats().tiles === 0 && !ripples.mesh.visible,
            'Unloading receiving chunks removes ripple geometry');
        check(world.chunks.size === 0, 'Ripple refresh does not regenerate unloaded terrain');
        return { checks: checks.slice(first), before: old, raised: changed,
            raisedDiscovery, removedDiscovery, unloadedDiscovery, finalStats: ripples.stats() };
    }

    async function dispose() {
        await game.stop({ save: false }); renderer.dispose(); renderer.domElement.remove(); frames.clear();
    }
    return { initialize, render, compare, animation, shadowVariants, measure, lifecycle, dispose };
}
