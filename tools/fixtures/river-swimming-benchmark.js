// Real Game.update/Player/World integration. Keyboard state is controlled;
// movement, collisions, water sampling and current resolution are unchanged.
import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Settings } from '../../src/settings/Settings.js';
import { createWorldInfo } from '../../src/storage/WorldStorage.js';
import { atlasReady } from '../../src/rendering/TextureAtlas.js';
import { WATER_SURFACE, WATER_FLOAT_SUBMERGED } from '../../src/config.js';

const WIDTH = 720, HEIGHT = 480, TOP = 25, SURFACE = TOP + WATER_SURFACE;
const RATES = [30, 60, 120], REST = SURFACE - 1.8 * WATER_FLOAT_SUBMERGED;
const NATURAL_START = { x: -188.5, y: 82.5, z: -631.5 };
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const quantiles = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = p => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
    return { samples: values.length, meanMs: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
        p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
};

export async function createRiverSwimmingQA() {
    await atlasReady;
    const checks = [], held = new Set(), columns = [];
    const ensure = (condition, label) => { if (!condition) throw new Error(label); };
    const check = (condition, label) => { ensure(condition, label); checks.push(label); };
    const near = (actual, expected, tolerance, label) => check(Math.abs(actual - expected) <= tolerance,
        `${label}: ${actual} vs ${expected}`);
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(WIDTH, HEIGHT); document.body.append(renderer.domElement);
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 24, farTerrain: 0, loadBudget: 1,
        shadows: 0, lightShafts: false, bounceLight: false, surfaceBounce: false,
        meteorites: false, showHand: false, viewBobbing: false, potato: true,
        plantModels: 'simple', leafModel: 'cube', volumeMaster: 0, volumeMusic: 0,
        lightingLook: 'baseline', cloudCover: 0 })) settings.set(key, value);
    const input = new Proxy({ isKeyDown: key => held.has(key), consumeKeyPress: () => false,
        consumeMouseDelta: () => ({ x: 0, y: 0 }) }, { get: (target, name) => target[name] ?? (() => 0) });
    let game, originalUpdate, activePlayerTimings = null;

    async function start(terrain, seed, point) {
        const info = createWorldInfo('Pływanie — izolowana próba', seed, terrain, 'adventure');
        info.player = { ...point, yaw: -Math.PI / 2, pitch: 0, flying: false };
        const started = performance.now();
        game = await Game.start(renderer, input, null, info, settings);
        game.time.speed = 0; game.time.days = .5;
        game.player.canFly = false;
        originalUpdate = game.player.update;
        game.player.update = function (...args) {
            const started = performance.now();
            try { return originalUpdate.apply(this, args); }
            finally { activePlayerTimings?.push(performance.now() - started); }
        };
        return performance.now() - started;
    }

    async function stop() {
        held.clear(); activePlayerTimings = null;
        if (game) { game.player.update = originalUpdate; await game.stop({ save: false }); game = null; }
    }

    function reset(x, y, z, yaw = -Math.PI / 2) {
        held.clear();
        const player = game.player;
        player.setState({ x, y, z, yaw, pitch: 0, flying: false });
        player.onGround = player.touchingWall = player.skyfall = false;
        player.canFly = false;
        player.updateWater(); player.updateCamera(); game.water.update(0);
    }

    async function settle(label) {
        for (let i = 0; i < 6000; i++) {
            game.world.fluids.update(.12, .6, 64);
            const stats = game.world.fluids.stats();
            ensure(stats.lastProcessed <= 64 && stats.lastChanges <= 24 && stats.lastScanCells <= 1024,
                `${label}: water work cap`);
            game.world.updateMeshes(performance.now() + .6);
            if (stats.pending === 0 && stats.scans === 0) { game.world.updateMeshes(Infinity); return i + 1; }
            if (i % 16 === 0) await pause();
        }
        throw new Error(`${label}: water did not settle`);
    }

    function current(speed) {
        for (const { chunk, column, bottom } of columns) {
            chunk.flow ??= new Int8Array(512);
            chunk.flowBounds ??= new Uint8Array(512);
            chunk.flow[column * 2] = Math.round(speed * 32); chunk.flow[column * 2 + 1] = 0;
            chunk.flowBounds[column] = bottom + 2;
            chunk.flowBounds[256 + column] = TOP + 1;
        }
    }

    async function initialize() {
        const startupMs = await start('flat', 731, { x: -10.5, y: 22, z: .5 });
        const started = performance.now(), world = game.world;
        for (let x = -28; x <= 35; x++) for (let z = -3; z <= 3; z++) {
            const bottom = x >= 0 ? 21 : 20, wall = x === -28 || x >= 28 || z === -3 || z === 3;
            for (let y = 20; y <= 26; y++) {
                const type = y <= bottom || wall && y <= TOP ? 'stone' : y <= TOP ? 'water' : null;
                world.setBlock(x, y, z, type);
            }
            if (!wall) {
                const chunk = world.getChunk(Math.floor(x / 16), Math.floor(z / 16));
                columns.push({ chunk, column: (z - chunk.cz * 16) * 16 + x - chunk.cx * 16, bottom });
            }
        }
        current(0);
        const settleSteps = await settle('Controlled river');
        check(world.getWaterFlow(-11, 24, 0) === null, 'The still-water case has no hidden current');
        check(!game.player.flying && !game.player.canFly, 'The real player has flight disabled');
        return { checks: [...checks], startupMs, fixtureMs: performance.now() - started, settleSteps,
            fixture: { bounds: { x: [-28, 28], z: [-3, 3] }, sourceLayer: TOP,
                bankPlateauX: [28, 35], bedStepX: 0, bedLevels: [20, 21],
                currentMetadata: 'Real Int8 flow and Uint8 natural channel bounds' } };
    }

    function sample(time) {
        const player = game.player, surface = player.waterLevel();
        return { time, position: player.pos.toArray(), velocity: player.vel.toArray(),
            submerged: player.submerged, buoyantSubmerged: player.buoyantSubmerged,
            eyeClearance: Number.isFinite(surface) ? player.pos.y + player.eyeHeight - surface : null,
            underwater: game.water.underwater, current: player.current ? [...player.current] : null };
    }

    async function advance(label, seconds, rate, keys = []) {
        held.clear(); keys.forEach(key => held.add(key));
        const player = game.player, start = player.pos.clone(), clock = player.clock;
        const frames = Math.round(seconds * rate), dt = 1 / rate, trace = [], fullMs = [], playerMs = [], chunks = new Set();
        let walls = 0, ground = 0, tailUnderwater = 0, path = 0, minY = player.pos.y, maxY = player.pos.y;
        activePlayerTimings = playerMs;
        try {
            for (let frame = 0; frame < frames; frame++) {
                const beforeClock = player.clock, x = player.pos.x, z = player.pos.z;
                const started = performance.now(); game.update(dt); fullMs.push(performance.now() - started);
                ensure(Math.abs(player.clock - beforeClock - dt) < 1e-7,
                    `${label}: Game skipped Player.update while terrain was loading at frame ${frame}`);
                ensure([...player.pos.toArray(), ...player.vel.toArray(), player.submerged, player.buoyantSubmerged].every(Number.isFinite),
                    `${label}: finite movement at frame ${frame}`);
                ensure(!player.collidesAt(player.pos), `${label}: the body entered a solid block at frame ${frame}`);
                walls += Number(player.touchingWall); ground += Number(player.onGround);
                path += Math.hypot(player.pos.x - x, player.pos.z - z);
                minY = Math.min(minY, player.pos.y); maxY = Math.max(maxY, player.pos.y);
                chunks.add(`${Math.floor(player.pos.x / 16)},${Math.floor(player.pos.z / 16)}`);
                if (frame >= frames - rate * 2) tailUnderwater += Number(game.water.underwater);
                if ((frame + 1) % Math.max(1, Math.round(rate / 10)) === 0) trace.push(sample((frame + 1) * dt));
                if (frame % 120 === 119) await pause();
            }
        } finally { activePlayerTimings = null; held.clear(); }
        near(player.clock - clock, seconds, 1e-6, `${label}: Player clock advances for every Game frame`);
        check(playerMs.length === frames, `${label}: exactly one real Player.update executes per Game frame`);
        return { label, rate, seconds, frames, input: keys, start: start.toArray(), end: sample(seconds),
            distance: player.pos.distanceTo(start), horizontalPath: path, visitedChunks: [...chunks],
            walls, ground, tailUnderwater, minY, maxY, trace,
            cpu: { player: quantiles(playerMs), game: quantiles(fullMs),
                scope: 'Real Player.update and whole Game.update CPU; GPU rendering is not performed per physics frame' } };
    }

    async function controlled() {
        const first = checks.length, floating = [], drift = [];
        for (const rate of RATES) {
            current(0); reset(-10.5, 22, .5);
            const rise = await advance(`Floating ${rate}Hz`, 8, rate);
            near(game.player.pos.y, REST, .006, `${rate}Hz: passive flotation reaches its configured surface equilibrium`);
            near(game.player.vel.y, 0, .006, `${rate}Hz: passive flotation has no persistent vertical motion`);
            check(rise.end.eyeClearance > .15 && rise.tailUnderwater === 0 && rise.ground === 0,
                `${rate}Hz: dry eyes and no deep-floor contact without Space`);
            const idle = await advance(`Settled ${rate}Hz`, 2, rate);
            check(idle.maxY - idle.minY < .006 && idle.tailUnderwater === 0, `${rate}Hz: the settled surface does not jitter or drown the camera`);
            floating.push({ rise, idle });

            current(2); reset(-21.5, REST, .5);
            const flow = game.world.getWaterFlow(-22, 24, 0);
            check(flow?.[0] === 2 && flow?.[1] === 0, `${rate}Hz: real resolver preserves the seeded two-block-per-second river`);
            const result = await advance(`Passive river ${rate}Hz`, 12, rate);
            near(game.player.pos.x, 2.5, .03, `${rate}Hz: no-input drift covers 24 blocks across the raised bed`);
            near(game.player.pos.y, REST, .006, `${rate}Hz: drift keeps its surface equilibrium`);
            check(result.visitedChunks.length >= 3 && result.walls === 0 && result.ground === 0 && result.tailUnderwater === 0,
                `${rate}Hz: current crosses chunk boundaries and the bed step without snagging`);
            drift.push(result);
        }
        const riseEnds = floating.map(value => value.rise.end.position[1]);
        check(Math.max(...riseEnds) - Math.min(...riseEnds) < .006, '30/60/120Hz converge to the same passive height');
        current(0); reset(-10.5, REST, .5);
        const dive = await advance('Intentional Shift dive', 1, 60, ['ShiftLeft']);
        check(game.player.pos.y < REST - 2.4 && game.water.underwater, 'Shift still submerges the real player deliberately');
        const recovery = await advance('Released Shift', 10, 60);
        near(game.player.pos.y, REST, .008, 'Releasing Shift restores passive flotation');
        check(recovery.tailUnderwater === 0, 'The camera stays above water after recovery');

        current(2); reset(27.45, REST, .5, 0);
        const bank = await advance('Passive solid bank', 1, 60);
        check(game.player.pos.x <= 27.7001, 'A real river bank still blocks passive current');
        const wall = await advance('Movement into solid bank', 1, 60, ['KeyD']);
        check(game.player.pos.x <= 27.7001 && wall.walls > 0, 'Player collision remains active against a real stone bank');
        const climb = await advance('Space exits the river', 1, 60, ['KeyD', 'Space']);
        check(game.player.pos.x > 28.3 && game.player.pos.y >= 26, 'Space plus movement still climbs onto the bank');
        return { checks: checks.slice(first), floating, drift, dive, recovery, bank, wall, climb };
    }

    async function natural() {
        const first = checks.length;
        await stop();
        const startupMs = await start('realistic', 42, NATURAL_START);
        const settleSteps = await settle('Natural river');
        reset(NATURAL_START.x, NATURAL_START.y, NATURAL_START.z, Math.PI / 2);
        const world = game.world, chunk = world.getChunk(-12, -40);
        const flow = world.getWaterFlow(-189, 82, -632);
        check(world.terrain === 'realistic' && chunk.flowBounds instanceof Uint8Array && chunk.flow instanceof Int8Array,
            'The natural segment and its flow metadata come from the production generator');
        check(flow?.[0] < -2 && Math.abs(flow[1]) < .1, 'The natural upstream current points toward the waterfall');
        const result = await advance('Natural waterfall and bend', 8, 60);
        check(game.player.pos.x < NATURAL_START.x - 12 && game.player.pos.z < NATURAL_START.z - 3,
            'Without input the player passes the natural waterfall and follows the river bend');
        check(game.player.pos.y < NATURAL_START.y - 7 && game.player.pos.y > 74,
            'The player reaches the real lower receiving river');
        check(result.end.eyeClearance > .1 && !game.water.underwater && result.ground === 0,
            'The natural river restores dry-eye flotation without resting on its bed');
        return { checks: checks.slice(first), seed: 42, start: NATURAL_START, startupMs, settleSteps, initialFlow: flow, result };
    }

    function view(name) {
        const natural = name.startsWith('natural');
        if (!natural) { current(0); reset(-10.5, REST, .5); game.update(1 / 60); }
        if (name.endsWith('overview')) {
            game.camera.position.set(...(natural ? [-182, 104, -616] : [-5, 42, 21]));
            game.camera.lookAt(...(natural ? [-197, 78, -635] : [-8, 23, 0]));
        } else game.player.updateCamera();
        game.scene.fog.near = 80; game.scene.fog.far = 160;
        game.camera.aspect = WIDTH / HEIGHT; game.camera.updateProjectionMatrix(); game.water.update(0);
        game.world.updateMeshes(Infinity); game.render();
        const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
        check(gl.getError() === gl.NO_ERROR, `${name}: WebGL renders the real swimming fixture without error`);
        return { name, player: sample(0), underwater: game.water.underwater, drawCalls: renderer.info.render.calls,
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    }

    async function dispose() { await stop(); renderer.dispose(); renderer.domElement.remove(); }
    return { initialize, controlled, natural, view, dispose };
}
