// Real Game scene, actual fluid landings, and paired GPU renders. Switching
// the ripple mesh off is a component comparison, not an old-version FPS test.
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Settings } from '../../src/settings/Settings.js';
import { SoundManager } from '../../src/audio/SoundManager.js';
import { createWorldInfo } from '../../src/storage/WorldStorage.js';
import { findScene } from '../../src/dev/scenes.js';
import { atlasReady } from '../../src/rendering/TextureAtlas.js';
import { plantWindUniforms } from '../../src/rendering/PlantWind.js';
import { setShadowDefine } from '../../src/rendering/BlockRenderData.js';
import { shadowUniforms } from '../../src/rendering/Shadows.js';
import { RIPPLE_PERIOD } from '../../src/rendering/WaterfallRipples.js';
import { getWaterLevel, getBlockTypeById, getBlockId, getLightColor, getLightEmission } from '../../src/blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../../src/world/WaterSurface.js';
import { dynamicLightUniforms } from '../../src/world/DynamicLight.js';

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
    const checks = [], frames = new Map(), held = new Set();
    let sounds = null, dynamicLightState = null;
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
    const input = new Proxy({ isKeyDown: key => held.has(key), consumeKeyPress: () => false,
        consumeMouseDelta: () => ({ x: 0, y: 0 }) }, { get: (target, name) => target[name] ?? (() => 0) });
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
    const layers = { ripples: ripples.mesh, foam: effects.foam.mesh, mist: effects.mist.mesh,
        wet: game.wetRocks.mesh, impacts: game.waterImpacts.ripples.mesh, rain: game.rain.mesh };
    const effectStats = () => ({ foam: effects.foam.stats(), mist: effects.mist.stats(),
        wet: game.wetRocks.stats(), impacts: game.waterImpacts.stats(), rain: game.rain.stats() });

    function boundedEffects(label) {
        const s = effectStats(), persistent = ripples.surface.lastProcessed;
        ensure(s.foam.tiles <= s.foam.maxTiles && s.foam.draws <= 1, `${label}: foam buffer cap`);
        ensure(s.mist.instances <= s.mist.maxInstances && s.mist.draws <= 1, `${label}: mist instance cap`);
        ensure(s.wet.faces <= s.wet.caps.faces && s.wet.fields <= s.wet.caps.fields &&
            s.wet.lastProcessed <= s.wet.caps.cellsPerUpdate, `${label}: wet-rock discovery cap`);
        ensure(s.impacts.active <= s.impacts.limit && s.impacts.tiles <= s.impacts.maxTiles &&
            persistent + s.impacts.lastProcessed <= 48, `${label}: shared persistent/transient ring discovery cap`);
        ensure(s.rain.drops <= s.rain.limit && s.rain.lastReads <= s.rain.caps.cellsPerUpdate,
            `${label}: rain drop and voxel-read caps`);
        return s;
    }

    function updateEffects(dt) {
        effects.update(dt, game.player, game.camera);
        game.updateWaterSurfaceEffects(dt);
        if (game.sounds) game.water.waterfallAudio.update(dt, game.water.underwater);
    }

    // Visibility is restored after the draw. A paired image changes exactly
    // one layer; ordinary water, particles, player clock and all other clocks
    // remain frozen. In particular new mist cannot spoil the old loop check.
    function isolatedDraw(layer, enabled) {
        const old = Object.values(layers).map(mesh => mesh.visible);
        Object.entries(layers).forEach(([name, mesh]) => { mesh.visible = name === layer && enabled; });
        try { game.render(); }
        finally { Object.values(layers).forEach((mesh, i) => { mesh.visible = old[i]; }); }
        const gl = renderer.getContext(), pixels = new Uint8Array(WIDTH * HEIGHT * 4);
        gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        check(gl.getError() === gl.NO_ERROR, `${layer}: paired draw completes without a WebGL error`);
        return pixels;
    }

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
            updateEffects(1 / 60);
            effectsMs.push(performance.now() - started);
            const stats = ripples.stats();
            rippleMs.push(stats.lastMs); discoveryMs.push(ripples.surface.stats().lastMs);
            maxProcessed = Math.max(maxProcessed, stats.lastProcessed);
            ensure(stats.lastProcessed <= stats.caps.cellsPerUpdate && stats.emitters <= stats.caps.emitters &&
                stats.cells <= stats.caps.cellsPerEmitter * stats.caps.emitters && stats.tiles <= stats.maxTiles,
            `${label}: bounded ripple slice ${i}`);
            boundedEffects(`${label}: update ${i}`);
            if (stats.queued === 0 && game.wetRocks.stats().queued === 0 && i > 20) {
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
        const pixels = isolatedDraw('ripples', enabled && ripples.tiles > 0);
        const gl = renderer.getContext();
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

    function effectView(light = 'day') {
        aim('drop-16');
        game.time.days = light === 'night' ? 0 : .5;
        game.sky.update(game.time.days, 0, renderer.getPixelRatio());
        game.water.setUnderwater(false);
        plantWindUniforms.uTime.value = .7;
        effects.foam.setTime(.8); effects.mist.setTime(.8); effects.mist.update(0, game.camera);
        game.wetRocks.material.uniforms.uWetTime.value = .8;
    }

    function projectedRegion(center, extent) {
        const points = [];
        for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
            const p = new THREE.Vector3(center[0] + x * extent[0], center[1] + y * extent[1],
                center[2] + z * extent[2]).project(game.camera);
            points.push([(p.x + 1) * WIDTH / 2, (p.y + 1) * HEIGHT / 2]);
        }
        return { minX: Math.max(0, Math.floor(Math.min(...points.map(p => p[0])))),
            maxX: Math.min(WIDTH - 1, Math.ceil(Math.max(...points.map(p => p[0])))),
            minY: Math.max(0, Math.floor(Math.min(...points.map(p => p[1])))),
            maxY: Math.min(HEIGHT - 1, Math.ceil(Math.max(...points.map(p => p[1])))) };
    }

    function visibleWetFace() {
        const geometry = game.wetRocks.geometry, positions = geometry.attributes.position;
        const normals = geometry.attributes.normal;
        const meshes = [...world.chunks.values()].map(chunk => chunk.mesh).filter(mesh => mesh?.visible);
        game.scene.updateMatrixWorld(true);
        for (let face = 0; face < game.wetRocks.stats().faces; face++) {
            const point = new THREE.Vector3();
            for (let c = 0; c < 4; c++) point.add(new THREE.Vector3().fromBufferAttribute(positions, face * 4 + c));
            point.multiplyScalar(.25);
            if (point.x > -7 || point.x < -16) continue;
            const normal = new THREE.Vector3().fromBufferAttribute(normals, face * 4);
            const projected = point.clone().project(game.camera);
            if (Math.abs(projected.x) >= .9 || Math.abs(projected.y) >= .9 || projected.z < -1 || projected.z > 1 ||
                normal.dot(game.camera.position.clone().sub(point)) <= 0) continue;
            const ray = new THREE.Raycaster(game.camera.position, point.clone().sub(game.camera.position).normalize());
            const hit = ray.intersectObjects(meshes, false)[0];
            if (hit?.face?.materialIndex === 2 || !hit || hit.point.distanceTo(point) > .03) continue;
            return { face, point: point.toArray(), material: hit.face.materialIndex,
                pixel: [(projected.x + 1) * WIDTH / 2, (1 - projected.y) * HEIGHT / 2] };
        }
        return null;
    }

    function renderEffect(kind, light = 'day', enabled = true) {
        ensure(['foam', 'mist', 'wet', 'impacts', 'rain'].includes(kind), `Known effect layer ${kind}`);
        effectView(light);
        const playerClock = game.player.clock, stats = effectStats();
        if (kind === 'foam') check(stats.foam.tiles > 0, 'The real receiving surface feeds foam geometry');
        if (kind === 'mist') check(stats.mist.instances > 0, 'Tall falls supply real mist instances');
        const probe = kind === 'wet' ? visibleWetFace() : visiblePool(`effect-${kind}`, POOLS[2]);
        check(Boolean(probe), `${kind}: the relevant receiving water or wet rock is visible from the camera`);
        const pixels = isolatedDraw(kind, enabled);
        frames.set(`effect:${kind}:${light}:${enabled}`, pixels);
        check(game.player.clock === playerClock, `${kind}: taking a picture does not advance Player or emit an impulse`);
        return { kind, light, enabled, probe, stats,
            scope: 'Same camera, day/night lighting, frozen water/particle clocks; exactly one effect is toggled' };
    }

    function compareEffect(kind, light = 'day') {
        const first = checks.length, before = frames.get(`effect:${kind}:${light}:false`);
        const after = frames.get(`effect:${kind}:${light}:true`);
        check(Boolean(before && after), `${kind}/${light}: the on/off image pair exists`);
        const entry = entryFor(16), region = kind === 'impacts' || kind === 'rain'
            ? projectedRegion([-11.5, 17.5, 10], [5, kind === 'rain' ? 9 : 1, 5])
            : projectedRegion([entry.x, FLOOR + 1.8, entry.z], [3.8, 3.2, 3.8]);
        let changed = 0, inRegion = 0, difference = 0, luminance = 0;
        for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
            const at = (y * WIDTH + x) * 4;
            const delta = Math.max(...[0, 1, 2].map(c => Math.abs(after[at + c] - before[at + c])));
            if (delta < 1) continue;
            changed++;
            if (x < region.minX || x > region.maxX || y < region.minY || y > region.maxY) continue;
            inRegion++; difference += delta;
            luminance += .2126 * after[at] + .7152 * after[at + 1] + .0722 * after[at + 2];
        }
        check(inRegion > 3 && difference > 6, `${kind}/${light}: toggling the layer visibly changes its projected impact region`);
        return { checks: checks.slice(first), changedPixels: changed, impactRegionPixels: inRegion,
            region, summedChannelDifference: difference, affectedLuminance: luminance / Math.max(1, inRegion) };
    }

    function lightingComparison() {
        const first = checks.length, layers = {};
        for (const kind of ['foam', 'mist', 'wet']) {
            const day = compareEffect(kind, 'day'), night = compareEffect(kind, 'night');
            check(night.affectedLuminance < day.affectedLuminance,
                `${kind}: the actual night image is darker than the daylight image`);
            layers[kind] = { day: day.affectedLuminance, night: night.affectedLuminance };
        }
        return { checks: checks.slice(first), layers,
            scope: 'Rendered light response of affected pixels; manual screenshot review still judges appearance' };
    }

    function renderDynamicLight(kind, enabled) {
        ensure(['ripples', 'foam', 'wet'].includes(kind), `Dynamic-light target ${kind}`);
        const target = layers[kind], material = target.material, entry = entryFor(16);
        if (!dynamicLightState) {
            check(dynamicLightUniforms.uDynamicEnabled.value === 0, 'The torch comparison starts with the actual light volume disabled');
            dynamicLightState = { chunks: world.chunks.size, version: world.version,
                revisions: [ripples.geometryRevision, effects.foam.geometryRevision, game.wetRocks.geometryRevision] };
        }
        effectView('night'); ripples.material.uniforms.uRippleTime.value = .8;
        check(!game.shadows.enabled && !('USE_SUN_SHADOWS' in (material.defines ?? {})) &&
            !('USE_FAR_SHADOWS' in (material.defines ?? {})), `${kind}: torch comparison keeps the original shadow defines disabled`);
        const torch = getBlockId('torch'), position = new THREE.Vector3(entry.x, FLOOR + 2.5, entry.z - 1.5);
        const source = { position, color: getLightColor(torch), strength: getLightEmission(torch) };
        const started = performance.now(); game.dynamicLight.update(world, position, enabled ? [source] : []);
        const volumeUpdateMs = performance.now() - started;
        check(dynamicLightUniforms.uDynamicLight.value === game.dynamicLight.texture &&
            dynamicLightUniforms.uDynamicEnabled.value === Number(enabled),
            `${kind}: the existing DynamicLight flood-fill and live 3D texture drive the lamp state`);
        const probe = kind === 'wet' ? visibleWetFace() : visiblePool(`torch-${kind}`, POOLS[2]);
        check(Boolean(probe), `${kind}: the torch-lit target has a visible receiving surface`);

        // A brighter terrain background alone must not pass this test. Render
        // the actual effect mesh alone on fixed black, with the same lights,
        // shader, camera and shared volume, then retain the normal world PNG.
        const hidden = [], background = game.scene.background, autoClear = renderer.autoClear;
        const clearColor = renderer.getClearColor(new THREE.Color()), clearAlpha = renderer.getClearAlpha();
        const visible = target.visible;
        game.scene.traverse(object => {
            if (object !== target && (object.isMesh || object.isLine || object.isPoints || object.isSprite)) {
                hidden.push([object, object.visible]); object.visible = false;
            }
        });
        let pixels, submissions;
        try {
            target.visible = true; game.scene.background = null;
            renderer.autoClear = true; renderer.setClearColor(0, 1); renderer.setRenderTarget(null);
            renderer.render(game.scene, game.camera); submissions = renderer.info.render.calls;
            const gl = renderer.getContext(); pixels = new Uint8Array(WIDTH * HEIGHT * 4);
            gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            check(submissions === 1 && gl.getError() === gl.NO_ERROR,
                `${kind}: the target-only dynamic-light shader draws once without a WebGL error`);
        } finally {
            target.visible = visible; hidden.forEach(([object, old]) => { object.visible = old; });
            game.scene.background = background; renderer.autoClear = autoClear; renderer.setClearColor(clearColor, clearAlpha);
        }
        frames.set(`torch:${kind}:${enabled}`, pixels);
        isolatedDraw(kind, true);
        return { kind, enabled, probe, light: { position: position.toArray(), color: source.color, strength: source.strength },
            volumeUpdateMs, targetDraws: submissions, scope: 'Real DynamicLight flood-fill; metrics isolate effect radiance from terrain brightening' };
    }

    function compareDynamicLight(kind) {
        const first = checks.length, before = frames.get(`torch:${kind}:false`), after = frames.get(`torch:${kind}:true`);
        check(Boolean(before && after), `${kind}: both torch states have a target-only GPU image`);
        const entry = entryFor(16), region = projectedRegion([entry.x, FLOOR + 1.8, entry.z], [3.8, 3.2, 3.8]);
        let changedPixels = 0, luminanceIncrease = 0, maxChannelDifference = 0;
        for (let y = region.minY; y <= region.maxY; y++) for (let x = region.minX; x <= region.maxX; x++) {
            const at = (y * WIDTH + x) * 4;
            const delta = [0, 1, 2].map(c => after[at + c] - before[at + c]);
            const maximum = Math.max(...delta.map(Math.abs));
            if (maximum >= 1) changedPixels++;
            maxChannelDifference = Math.max(maxChannelDifference, maximum);
            luminanceIncrease += .2126 * delta[0] + .7152 * delta[1] + .0722 * delta[2];
        }
        check(changedPixels > 3 && maxChannelDifference > 1 && luminanceIncrease > 1,
            `${kind}: actual effect pixels brighten under the torch volume within the projected waterfall region`);
        return { checks: checks.slice(first), changedPixels, luminanceIncrease, maxChannelDifference, region,
            scope: 'Effect-only GPU radiance on unchanged black, not a whole-frame terrain-light difference' };
    }

    function finishDynamicLight() {
        const first = checks.length;
        game.dynamicLight.update(world, game.camera.position, []);
        check(dynamicLightUniforms.uDynamicEnabled.value === 0, 'The torch test restores the disabled dynamic-light state');
        check(world.chunks.size === dynamicLightState.chunks && world.version === dynamicLightState.version &&
            [ripples.geometryRevision, effects.foam.geometryRevision, game.wetRocks.geometryRevision]
                .every((revision, i) => revision === dynamicLightState.revisions[i]),
            'Torch on/off changes neither chunks, effect geometry nor discovery revisions');
        dynamicLightState = null;
        return { checks: checks.slice(first) };
    }

    async function playerImpulses() {
        const first = checks.length, player = game.player, initial = game.waterImpacts.stats().emitted.player;
        game.waterImpacts.setAmount(0); game.waterImpacts.setAmount(1);
        player.setState({ x: -14.5, y: 15.5, z: 8.5, yaw: 0, pitch: 0, flying: false });
        player.canFly = false; player.onGround = false; player.updateWater(); player.updateCamera();
        const start = player.pos.clone(), times = [];
        held.add('KeyD');
        try {
            for (let i = 0; i < 90; i++) {
                const clock = player.clock, t = performance.now(); game.update(1 / 60); times.push(performance.now() - t);
                ensure(Math.abs(player.clock - clock - 1 / 60) < 1e-7,
                    `Player impulse frame ${i}: real Game.update cannot silently pause in loading`);
                ensure(!player.collidesAt(player.pos), `Player impulse frame ${i}: movement respects collision`);
                boundedEffects(`Player impulse frame ${i}`);
                if (i % 30 === 29) await pause();
            }
        } finally { held.clear(); }
        const stats = game.waterImpacts.stats(), end = player.pos.toArray();
        check(player.pos.distanceTo(start) > 1, 'The real player moves through receiving water with a held movement key');
        check(stats.emitted.player > initial && stats.player > 0 && stats.tiles > 0,
            'Game.update creates visible transient rings from real player movement without manual add()');
        player.flying = true; player.canFly = true; player.vel.set(0, 0, 0);
        return { checks: checks.slice(first), start: start.toArray(), end, stats, gameUpdate: quantiles(times),
            scope: '90 real Game.update frames; camera-only pictures do not synthesize Player clocks' };
    }

    async function rainImpulses(roof = false) {
        const first = checks.length, rain = game.rain, impacts = game.waterImpacts, edits = [], times = [];
        const oldRandom = rain.random;
        let seed = 0x750d;
        rain.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
        rain.setIntensity(0); impacts.setAmount(0); impacts.setAmount(1);
        game.player.pos.set(.5, 38, 8.5); game.player.flying = true; game.player.vel.set(0, 0, 0);
        game.camera.position.set(-11.5, 19, 9.5);
        if (roof) for (let x = -20; x <= -3; x++) for (let z = 1; z <= 18; z++) {
            edits.push([x, 37, z, world.getBlockId(x, 37, z)]); world.setBlock(x, 37, z, 'stone');
        }
        const waterHits = rain.waterHits, surfaceHits = rain.surfaceHits, emitted = impacts.stats().emitted.rain;
        const clock = game.player.clock;
        let maxDrops = 0, maxReads = 0, maxSharedCells = 0;
        rain.setIntensity(1);
        try {
            for (let i = 0; i < 300; i++) {
                const start = performance.now(); updateEffects(1 / 60); times.push(performance.now() - start);
                const s = boundedEffects(`Rain ${roof ? 'roof' : 'open'} frame ${i}`);
                maxDrops = Math.max(maxDrops, s.rain.drops); maxReads = Math.max(maxReads, s.rain.lastReads);
                maxSharedCells = Math.max(maxSharedCells, ripples.surface.lastProcessed + s.impacts.lastProcessed);
                if (i % 60 === 59) await pause();
            }
            const stats = effectStats();
            check(game.player.clock === clock, 'Rain integration leaves the frozen Player clock unchanged');
            check(rain.surfaceHits > surfaceHits, `${roof ? 'Roofed' : 'Open'} rain reaches actual world surfaces`);
            if (roof) check(rain.waterHits === waterHits && impacts.stats().emitted.rain === emitted,
                'The first real stone roof intercepts every drop; no ring appears on water underneath');
            else check(rain.waterHits > waterHits && impacts.stats().emitted.rain > emitted && stats.impacts.rain > 0 && stats.impacts.tiles > 0,
                'Real falling raindrops hit water and create visible transient rings without manual add()');
            return { checks: checks.slice(first), roof, seed: '0x750d', waterHits: rain.waterHits - waterHits,
                surfaceHits: rain.surfaceHits - surfaceHits, emittedRain: impacts.stats().emitted.rain - emitted,
                maxDrops, maxReads, maxSharedCells, stats, update: quantiles(times) };
        } finally {
            rain.random = oldRandom;
            if (roof) {
                rain.setIntensity(0);
                for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id ? getBlockTypeById(id) : null);
            }
        }
    }

    async function audioChecks() {
        const first = checks.length, audio = game.water.waterfallAudio, times = [];
        game.rain.setIntensity(0);
        if (!sounds) { sounds = new SoundManager(settings); await sounds.ready; }
        check(sounds.buffers.get('water_waves')?.length > 0 && sounds.buffers.get('water_stream')?.length > 0,
            'Both actual waterfall recordings decode into Web Audio buffers');
        settings.set('volumeMaster', 30); settings.set('volumeWorld', 60);
        sounds.unlock(); await sounds.context.resume(); sounds.setActive(true); game.sounds = sounds;
        check(sounds.context.state === 'running', 'A real running AudioContext drives the waterfall voices');
        game.camera.position.set(-.5, 18, 9.5);
        game.player.splash = 0; game.player.leftWater = false;
        // Keep cold spikes and their phase/index. Nested spans are inclusive:
        // loop includes createVoice, and waterfallAudio includes select/trace.
        const diagnosticFrames = [], restorers = [], wrappedControls = new WeakSet();
        let currentFrame = null;
        const wrap = (object, name, label, returned = null) => {
            const original = object[name];
            object[name] = function (...args) {
                const frame = currentFrame, start = frame ? performance.now() : 0;
                try {
                    const result = original.apply(this, args);
                    returned?.(result, frame);
                    return result;
                } finally {
                    if (frame) {
                        frame.ms[label] = (frame.ms[label] ?? 0) + performance.now() - start;
                        frame.calls[label] = (frame.calls[label] ?? 0) + 1;
                    }
                }
            };
            restorers.push(() => { object[name] = original; });
        };
        wrap(audio, 'update', 'waterfallAudio'); wrap(audio, 'select', 'select'); wrap(audio, 'trace', 'trace');
        wrap(game.water, 'measureWaves', 'measureWaves');
        wrap(sounds, 'createVoice', 'createVoice', (voice, frame) => {
            if (!voice || !frame) return;
            frame.created.sources++; frame.created.gains++; frame.created.panners += Number(Boolean(voice.panner));
        });
        wrap(sounds, 'loop', 'loop', (control, frame) => {
            if (!control) return;
            if (frame) frame.loopsStarted++;
            if (wrappedControls.has(control)) return;
            wrappedControls.add(control);
            for (const name of ['setVolume', 'setPosition', 'setPitch', 'stop']) wrap(control, name, name);
        });
        const measured = (phase, scope, work, mode = 'accelerated') => {
            const frame = { index: diagnosticFrames.length, phase, scope, mode,
                cold: diagnosticFrames.length === 0, ms: {}, calls: {}, created: { sources: 0, gains: 0, panners: 0 },
                loopsStarted: 0, voicesBefore: sounds.voices, contextTime: sounds.context.currentTime,
                wallTime: performance.now() };
            currentFrame = frame;
            const start = performance.now();
            try { work(); }
            finally {
                frame.totalMs = performance.now() - start; currentFrame = null;
                frame.updateSoundsMs = scope === 'full-updateSounds' ? frame.totalMs : null;
                frame.contextEndTime = sounds.context.currentTime; frame.voicesAfter = sounds.voices;
                const stats = audio.stats();
                frame.reportedWaterfallAudioMs = stats.lastMs; frame.lastProcessed = stats.lastProcessed;
                frame.rayCells = stats.rayCells; frame.fading = stats.fading;
                diagnosticFrames.push(frame);
            }
            return frame.totalMs;
        };
        const tick = (count, phase, dt = 1 / 60, mode = 'accelerated') => {
            for (let i = 0; i < count; i++) {
                sounds.updateListener(game.camera);
                game.water.setUnderwater(game.water.isUnderwater(game.camera.position));
                const elapsed = measured(phase, 'full-updateSounds', () => game.water.updateSounds(dt), mode);
                if (mode === 'accelerated') times.push(elapsed);
                const stats = audio.stats();
                ensure(stats.lastProcessed <= stats.caps.cellsPerUpdate && stats.voices <= 4 && stats.reserved <= 4,
                    'Web Audio frame respects the voxel and real active/fading voice caps');
            }
        };
        const drain = async phase => {
            // AudioBufferSource.onended follows the real audio clock, not our
            // accelerated fixed-step clock. Keep tails counted until it fires.
            const deadline = performance.now() + 2000;
            do {
                await new Promise(resolve => setTimeout(resolve, 50)); tick(2, `${phase}:fade-wait`);
                if (audio.stats().fading === 0) return;
            } while (performance.now() < deadline);
            throw new Error('Web Audio fade tails did not release their real voices');
        };
        try {
            audio.setAmount(1); audio.refresh = 0; tick(60, 'first-start');
            const open = audio.stats();
            check(open.loops >= 3 && open.voices <= 4 && open.sources.some(source => source.sound === 'water_waves') &&
                open.sources.some(source => source.sound === 'water_stream'),
                'Short and tall real falls create distinct positional loops within the four-voice cap');
            check([...sounds.gameVoices].some(voice => voice.panner && voice.source instanceof AudioBufferSourceNode),
                'Waterfall playback owns actual AudioBufferSourceNode and positional PannerNode objects');

            const edits = [];
            for (let x = -18; x <= 4; x++) for (let y = 17; y <= 22; y++) {
                edits.push([x, y, 11, world.getBlockId(x, y, 11)]); world.setBlock(x, y, 11, 'stone');
            }
            let occluded;
            try {
                audio.refresh = 0; tick(60, 'stone-wall'); occluded = audio.stats();
                const before = open.sources.find(source => source.fall === 16);
                const after = occluded.sources.find(source => source.key === before?.key);
                check(before && after && after.occlusion < before.occlusion && after.target < before.target,
                    'A real intervening stone wall reduces the matching tall-waterfall voice');
            } finally {
                for (const [x, y, z, id] of edits) world.setBlock(x, y, z, id ? getBlockTypeById(id) : null);
            }
            game.camera.position.set(-11.5, 17.1, 9.5); audio.refresh = 0; tick(60, 'above-water');
            const above = audio.stats();
            game.camera.position.y = 16.3; tick(60, 'underwater');
            await new Promise(resolve => setTimeout(resolve, 250));
            const submerged = audio.stats();
            const source = above.sources.find(item => item.fall === 16);
            const muffled = submerged.sources.find(item => item.key === source?.key);
            check(submerged.underwater && sounds.underwater && sounds.muffle.frequency.value < 2000 &&
                source && muffled && muffled.target < source.target * .5,
                'Actual camera submersion lowers waterfall gain and the shared real lowpass frequency');
            game.camera.position.y = 18; tick(2, 'leave-water');
            audio.setAmount(.35); tick(60, 'low-detail'); await drain('low-detail');
            const low = audio.stats();
            check(low.limit === 2 && low.voices <= 2 && low.reserved <= 2, 'Low detail finishes old fades before keeping at most two voices');
            const cycles = [];
            for (let i = 0; i < 2; i++) {
                audio.setAmount(0); tick(2, `disable-${i + 1}`); await drain(`disable-${i + 1}`);
                const disabled = audio.stats();
                check(disabled.loops === 0 && disabled.voices === 0 && disabled.reserved === 0,
                    `Audio disable cycle ${i + 1} releases real fade tails and reservations`);
                audio.setAmount(1); tick(60, `re-enable-${i + 1}`); cycles.push(audio.stats());
                check(cycles.at(-1).loops > 0 && cycles.at(-1).voices <= 4,
                    `Audio re-enable cycle ${i + 1} starts bounded real voices`);
            }
            const freeze = audio.stats();
            sounds.setActive(false); tick(3, 'paused');
            check(audio.stats().voices === freeze.voices && audio.stats().lastProcessed === 0,
                'Paused audio does not create voices or perform occlusion work');
            sounds.setActive(true);
            const integratedMs = [], audioMs = [];
            for (let i = 0; i < 360; i++) {
                integratedMs.push(measured('visual-plus-waterfall-only', 'visual-plus-waterfall-only', () => updateEffects(1 / 60)));
                audioMs.push(audio.stats().lastMs); boundedEffects(`Integrated audio/visual frame ${i}`);
                ensure(audio.stats().lastProcessed <= 96 && audio.stats().voices <= 4, 'Integrated audio work stays bounded');
                if (i % 120 === 119) await pause();
            }
            const intervals = [];
            let previousRAF;
            for (let i = 0; i < 60; i++) {
                const now = await new Promise(resolve => requestAnimationFrame(resolve));
                const interval = previousRAF === undefined ? 1000 / 60 : now - previousRAF;
                if (previousRAF !== undefined) intervals.push(interval);
                previousRAF = now;
                tick(1, 'raf-steady', Math.min(.1, Math.max(0, interval / 1000)), 'raf');
            }
            const phases = [...new Set(diagnosticFrames.map(frame => frame.phase))].map(phase => {
                const frames = diagnosticFrames.filter(frame => frame.phase === phase), first = frames[0], last = frames.at(-1);
                const labels = [...new Set(frames.flatMap(frame => Object.keys(frame.calls)))];
                return { phase, mode: first.mode, scope: first.scope, firstIndex: first.index, timing: quantiles(frames.map(frame => frame.totalMs)),
                    contextSeconds: last.contextEndTime - first.contextTime, wallMs: last.wallTime + last.totalMs - first.wallTime,
                    spans: Object.fromEntries(labels.map(label => [label, { ...quantiles(frames.map(frame => frame.ms[label] ?? 0)),
                        calls: frames.reduce((total, frame) => total + (frame.calls[label] ?? 0), 0) }])) };
            });
            const slowest = frames => [...frames].sort((a, b) => b.totalMs - a.totalMs).slice(0, 12);
            const paced = diagnosticFrames.filter(frame => frame.mode === 'raf');
            check(paced.length === 60, 'Sixty real animation frames measure the complete WaterEffects.updateSounds path');
            const diagnostics = { firstFrame: diagnosticFrames[0], frames: diagnosticFrames.length, phases,
                slowFrames: slowest(diagnosticFrames.filter(frame => frame.scope === 'full-updateSounds')),
                pacedRAF: { updateSounds: quantiles(paced.map(frame => frame.totalMs)), intervals: quantiles(intervals), slowFrames: slowest(paced) },
                scope: 'All samples retain outliers. Instrumented nested spans are inclusive and must not be summed. Listener/submersion setup is outside updateSounds. Control-call counts approximate scheduling: setPosition schedules three AudioParams. rAF runs full WaterEffects.updateSounds; visual-plus-waterfall-only excludes legacy ambience.' };
            return { checks: checks.slice(first), decodedFiles: sounds.loadedCount, missingFiles: sounds.missing,
                context: sounds.context.state, open, occluded, above, submerged, low, cycles,
                updateSounds: quantiles(times), integratedEffects: quantiles(integratedMs), waterfallAudio: quantiles(audioMs), diagnostics,
                integratedScope: 'Whole waterfalls.update + Game.updateWaterSurfaceEffects + waterfallAudio.update, including periodic landing selection/sorting/packing; 360 frames, no rendering',
                scope: 'Real Web Audio decoding, nodes, positional parameters, lowpass and onended cleanup; not a listening-quality test' };
        } finally { restorers.reverse().forEach(restore => restore()); }
    }

    async function effectLimits() {
        const first = checks.length;
        game.rain.setIntensity(0); game.waterImpacts.setAmount(0); game.waterImpacts.setAmount(1);
        for (let i = 0; i < 200; i++) game.waterImpacts.add(-11.75 + (i % 3) * .3, FLOOR,
            9.1 + (i % 4) * .15, i % 4 ? 'rain' : 'player', .5);
        updateEffects(0);
        const full = boundedEffects('Burst of 200 impulses');
        check(full.impacts.active === 12 && full.impacts.player > 0,
            'An impulse burst stays at twelve records and preserves room for player rings');
        effects.setAmount(.35); game.wetRocks.setAmount(.35); game.waterImpacts.setAmount(.35); game.rain.setAmount(.35);
        await refreshRipples('Low-detail effects');
        const low = boundedEffects('Low detail');
        check(low.mist.instances <= 8 && low.wet.fields <= 2 && low.impacts.active <= 4 && low.rain.limit === 24 &&
            ripples.stats().emitters <= 4, 'Low detail applies all effect geometry, impulse, rain and discovery caps');
        effects.setAmount(0); game.wetRocks.setAmount(0); game.waterImpacts.setAmount(0); game.rain.setAmount(0);
        updateEffects(0);
        const disabled = effectStats();
        check(Object.values(layers).every(mesh => !mesh.visible) && disabled.impacts.active === 0 && disabled.rain.drops === 0,
            'Amount zero disables every visual water layer and clears transient records');
        effects.setAmount(1); game.wetRocks.setAmount(1); game.waterImpacts.setAmount(1); game.rain.setAmount(1);
        await refreshRipples('Restored effects');
        check(effects.foam.stats().tiles > 0 && effects.mist.stats().instances > 0 && game.wetRocks.stats().faces > 0,
            'Re-enabling effects restores foam, mist and wet rock from the real scene');
        return { checks: checks.slice(first), full, low, disabled, restored: effectStats() };
    }

    function shadowVariants() {
        const first = checks.length, variants = [], failures = [], gl = renderer.getContext();
        const targets = [ripples, effects.foam, effects.mist, game.wetRocks, game.waterImpacts.ripples]
            .filter(target => target.mesh.visible && target.geometry.drawRange.count > 0);
        const originals = targets.map(target => ({ target, sun: 'USE_SUN_SHADOWS' in (target.material.defines ?? {}),
            far: 'USE_FAR_SHADOWS' in (target.material.defines ?? {}), hook: target.mesh.onBeforeRender }));
        const oldError = renderer.debug.onShaderError;
        const oldDebug = renderer.debug.checkShaderErrors, revision = ripples.stats().geometryRevision;
        check(!game.shadows.enabled && shadowUniforms.uSunShadowInfo.value.y === 0,
            'Shadow variant smoke uses inactive shadow maps and zero shadow strength');
        check(ripples.mesh.visible && ripples.geometry.drawRange.count > 0,
            'Shadow shader variants execute on the existing visible ripple mesh');
        const submitted = new Map();
        for (const { target, hook } of originals) target.mesh.onBeforeRender = function (...args) {
            submitted.set(target.mesh.name, (submitted.get(target.mesh.name) ?? 0) + 1); hook.apply(this, args);
        };
        renderer.debug.checkShaderErrors = true;
        renderer.debug.onShaderError = (context, program, vertex, fragment) => failures.push(
            [context.getProgramInfoLog(program), context.getShaderInfoLog(vertex), context.getShaderInfoLog(fragment)].join('\n'));
        try {
            for (const far of [false, true]) {
                setShadowDefine(targets.map(target => target.material), true, far);
                submitted.clear();
                game.render(); gl.finish();
                const name = far ? 'sun-and-far' : 'sun-only';
                check(failures.length === 0, `${name}: ripple shaders link successfully: ${failures.join('\n')}`);
                check(targets.every(target => submitted.get(target.mesh.name) > 0) && gl.getError() === gl.NO_ERROR,
                    `${name}: every visible water-effect variant draws without a WebGL error`);
                variants.push({ name, sun: true, far, submissions: Object.fromEntries(submitted), drawCalls: renderer.info.render.calls });
            }
        } finally {
            for (const { target, sun, far, hook } of originals) {
                setShadowDefine([target.material], sun, far); target.mesh.onBeforeRender = hook;
            }
            renderer.debug.onShaderError = oldError; renderer.debug.checkShaderErrors = oldDebug;
        }
        check(ripples.stats().geometryRevision === revision, 'Compiling shadow variants does not rebuild ripple geometry');
        return { checks: checks.slice(first), variants,
            scope: 'GPU shader compilation and draw smoke with shadow weight zero; not a physical shadow-quality test' };
    }

    async function measure() {
        await refreshRipples('Measurement warmup');
        const first = checks.length, effectsMs = [], rippleMs = [], discoveryMs = [];
        const componentMs = Object.fromEntries(['foam', 'mist', 'wet', 'impacts', 'rain'].map(name => [name, []]));
        const geometryRevision = ripples.stats().geometryRevision, loaded = world.chunks.size;
        const buffers = [effects.foam.geometryRevision, effects.mist.bufferRevision, game.wetRocks.geometryRevision];
        let maxProcessed = 0, maxTiles = 0, maxEmitters = 0, maxParticles = 0;
        for (let frame = 0; frame < 720; frame++) {
            const started = performance.now(); updateEffects(1 / 60); effectsMs.push(performance.now() - started);
            const components = boundedEffects(`Measured frame ${frame}`);
            for (const name of Object.keys(componentMs)) componentMs[name].push(components[name].lastMs);
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
        check([effects.foam.geometryRevision, effects.mist.bufferRevision, game.wetRocks.geometryRevision]
            .every((revision, i) => revision === buffers[i]), 'Stable foam, mist and wet-rock animation does not upload unchanged geometry');
        check(world.chunks.size === loaded, 'Ripple updates never load a chunk');
        return { checks: checks.slice(first), effects: quantiles(effectsMs), ripples: quantiles(rippleMs), discovery: quantiles(discoveryMs),
            maxProcessed, maxTiles, maxEmitters, maxParticles, geometryRevision, stats: ripples.stats(),
            components: Object.fromEntries(Object.entries(componentMs).map(([name, values]) => [name, quantiles(values)])),
            scope: '720 fixed 1/60s whole waterfalls.update + Game.updateWaterSurfaceEffects calls, including landing selection/sort/packing; component lastMs excludes setLandings. CPU only, rendering/audio excluded; no hardware FPS claim' };
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
        for (let i = 0; i < 150; i++) updateEffects(1 / 60);
        check(effects.foam.stats().tiles === 0 && effects.mist.stats().instances === 0 && game.wetRocks.stats().faces === 0 &&
            game.waterImpacts.stats().active === 0 && game.waterImpacts.stats().tiles === 0 && game.rain.stats().drops === 0,
            'Unloaded terrain leaves no foam, mist, wet-rock faces, expired impulses or rain drops');
        if (sounds) {
            await new Promise(resolve => setTimeout(resolve, 400)); game.water.waterfallAudio.update(0);
            check(game.water.waterfallAudio.stats().voices === 0 && game.water.waterfallAudio.stats().reserved === 0,
                'Unloading actual waterfall chunks releases their real Web Audio tails');
        }
        return { checks: checks.slice(first), before: old, raised: changed,
            raisedDiscovery, removedDiscovery, unloadedDiscovery, finalStats: ripples.stats(), finalEffects: effectStats(),
            finalAudio: game.water.waterfallAudio.stats() };
    }

    async function dispose() {
        const first = checks.length, owned = [ripples, effects.foam, effects.mist, game.wetRocks,
            game.waterImpacts, game.waterImpacts.ripples, game.rain, game.water.waterfallAudio];
        await game.stop({ save: false });
        check(owned.every(effect => effect.disposed), 'Game.stop disposes every owned water effect and its audio controller');
        check(Object.values(layers).every(mesh => mesh.parent === null), 'Game.stop removes all water effect meshes from the scene');
        if (sounds) {
            const deadline = performance.now() + 2000;
            while (sounds.voices && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
            check(sounds.voices === 0 && sounds.loops.size === 0 && sounds.gameVoices.size === 0,
                'Game.stop ends real water AudioBufferSources and removes all loop controls');
            await sounds.context.close();
        }
        renderer.dispose(); renderer.domElement.remove(); frames.clear();
        return { checks: checks.slice(first), audioVoices: sounds?.voices ?? 0 };
    }
    return { initialize, render, compare, animation, renderEffect, compareEffect, lightingComparison,
        renderDynamicLight, compareDynamicLight, finishDynamicLight, playerImpulses, rainImpulses,
        audioChecks, effectLimits, shadowVariants, measure, lifecycle, dispose };
}
