import * as THREE from 'three';
import { Game } from '../../src/game/Game.js';
import { Settings } from '../../src/settings/Settings.js';
import { WorldStorage, createWorldInfo } from '../../src/storage/WorldStorage.js';
import { atlasReady } from '../../src/rendering/TextureAtlas.js';
import { waterSurfaceHeight } from '../../src/world/WaterSurface.js';
import { getBlockId, getWaterLevel, isWaterSourceId, isFlowingWaterId,
    waterIdForLevel } from '../../src/blocks/BlockRegistry.js';

const DT = .12;
const CELL_LIMIT = 64;
const CHANGE_LIMIT = 24;
const SCAN_LIMIT = 1024;
const BUDGET_MS = .6;
const pause = () => new Promise(resolve => setTimeout(resolve, 0));
const quantiles = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const at = p => sorted[Math.floor((sorted.length - 1) * p)] ?? 0;
    return { count: values.length, meanMs: values.reduce((a, b) => a + b, 0) / Math.max(1, values.length),
        p50Ms: at(.5), p95Ms: at(.95), p99Ms: at(.99), maxMs: at(1) };
};
const requestValue = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});

export async function createWaterQA() {
    await atlasReady;
    const checks = [];
    const check = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
    const storage = await WorldStorage.open();
    const info = createWorldInfo('Woda — izolowana próba', 731, 'flat', 'developer');
    info.player = { x: .5, y: 42, z: .5, yaw: 0, pitch: -.5, flying: true };
    const stone = getBlockId('stone'), source = getBlockId('water');
    check(source === 12, 'Legacy water keeps block ID 12');
    // An actual old-width save, with a supported source enclosed in stone.
    // Existing worlds must keep their sources when flow is introduced.
    const legacy = new Uint8Array(16 * 128 * 16);
    legacy.fill(stone, 0, 17 * 256);
    for (let z = 4; z <= 6; z++) for (let x = 4; x <= 6; x++) {
        legacy[23 * 256 + z * 16 + x] = stone;
        if (x !== 5 || z !== 5) legacy[24 * 256 + z * 16 + x] = stone;
    }
    legacy[24 * 256 + 5 * 16 + 5] = source;
    await storage.saveWorldAndChunks(info, [{ cx: 0, cz: 0, blocks: legacy }], { immediate: true });
    const legacyRecord = await requestValue(storage.db.transaction('chunks', 'readonly').objectStore('chunks').get([info.id, 0, 0]));
    check(legacyRecord.blocks instanceof Uint8Array, 'The compatibility fixture really uses an 8-bit disk record');

    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(720, 480); document.body.append(renderer.domElement);
    const settings = new Settings();
    for (const [key, value] of Object.entries({ viewDistance: 24, farTerrain: 0, loadBudget: 1,
        shadows: 0, lightShafts: false, bounceLight: false, surfaceBounce: false,
        meteorites: false, showHand: false, potato: true, plantModels: 'simple', leafModel: 'cube',
        volumeMaster: 0, volumeMusic: 0, lightingLook: 'baseline', cloudCover: 0 })) settings.set(key, value);
    const input = new Proxy({}, { get: (_, name) => name === 'consumeMouseDelta'
        ? () => ({ x: 0, y: 0 }) : () => 0 });
    let game = await Game.start(renderer, input, storage, info, settings);
    game.time.speed = 0; game.time.days = .4;
    check(Boolean(game.world.fluids), 'Real Game creates a water simulation');
    check(game.world.getBlockId(5, 24, 5) === source, 'Game.start restores a legacy source unchanged');
    const world = () => game.world;
    const id = (x, y, z) => world().getBlockId(x, y, z);
    const water = (x, y, z) => isWaterSourceId(id(x, y, z)) || isFlowingWaterId(id(x, y, z));
    const put = (x, y, z, type = 'stone') => world().setBlock(x, y, z, type);
    const simulationMs = [], meshMs = [], pending = [], processed = [], changed = [], scanned = [];
    let steps = 0;

    function tick() {
        const started = performance.now();
        world().fluids.update(DT, BUDGET_MS, CELL_LIMIT);
        simulationMs.push(performance.now() - started);
        const stats = world().fluids.stats();
        if (stats.lastProcessed > CELL_LIMIT) throw new Error(`Fluid update exceeded ${CELL_LIMIT} cells: ${stats.lastProcessed}`);
        if (stats.lastChanges > CHANGE_LIMIT) throw new Error(`Fluid update exceeded ${CHANGE_LIMIT} changes: ${stats.lastChanges}`);
        if (stats.lastScanCells > SCAN_LIMIT) throw new Error(`Fluid scan exceeded ${SCAN_LIMIT} cells: ${stats.lastScanCells}`);
        processed.push(stats.lastProcessed); changed.push(stats.lastChanges); scanned.push(stats.lastScanCells); pending.push(stats.pending);
        const meshStarted = performance.now();
        world().updateMeshes(meshStarted + BUDGET_MS);
        meshMs.push(performance.now() - meshStarted);
        steps++;
        return stats;
    }

    async function settle(label, maxSteps = 2400) {
        let quiet = 0;
        for (let i = 0; i < maxSteps; i++) {
            const stats = tick();
            quiet = stats.pending === 0 && stats.scans === 0 ? quiet + 1 : 0;
            if (quiet >= 3) return i + 1;
            if (i % 16 === 0) await pause();
        }
        throw new Error(`${label} did not settle: ${JSON.stringify(world().fluids.stats())}`);
    }

    function buildChannels() {
        // Include neighboring columns so fluid simulation and the mesher see
        // loaded boundaries. Water itself must never generate a new chunk.
        for (let cz = -2; cz <= 2; cz++) for (let cx = -3; cx <= 2; cx++) world().generateChunk(cx, cz);
        // One-cell-wide flat channel: source, levels 1…7, then dry stone floor.
        for (let x = -20; x <= -9; x++) for (let z = -9; z <= -7; z++) {
            put(x, 24, z);
            if (z !== -8 || x === -20 || x === -9) { put(x, 25, z); put(x, 26, z); }
        }
        // Raised channel ends above a lower, enclosed basin.
        for (let x = -1; x <= 12; x++) for (let z = -9; z <= -7; z++) {
            put(x, 24, z);
            if (x <= 3) put(x, 30, z);
            if (z !== -8 || x === -1 || x === 12) for (let y = 25; y <= 32; y++) put(x, y, z);
        }
        // River-like reservoir with a removable bank cell and dry outlet.
        for (let x = -20; x <= -4; x++) for (let z = 4; z <= 10; z++) {
            if (x > -12 && (z < 6 || z > 8)) continue;
            put(x, 24, z);
            const boundary = x <= -12 ? x === -20 || x === -12 || z === 4 || z === 10
                : z === 6 || z === 8 || x === -4;
            if (boundary) { put(x, 25, z); put(x, 26, z); }
        }
    }

    async function run() {
        buildChannels();
        const beforeCount = world().chunks.size;
        await settle('Dry fixture initialization');
        put(-19, 25, -8, 'water');
        // Verify the normal application update path actually advances water.
        for (let frame = 0; frame < 160 && !water(-18, 25, -8); frame++) {
            game.update(1 / 60); if (frame % 16 === 0) await pause();
        }
        check(water(-18, 25, -8), 'Game.update spreads a normally placed source');
        await settle('Flat spill');
        check(isWaterSourceId(id(-19, 25, -8)), 'The placed source is permanent');
        for (let level = 1; level <= 7; level++) {
            check(id(-19 + level, 25, -8) === waterIdForLevel(level), `Flat spill has exact level ${level}`);
        }
        check(!water(-11, 25, -8), 'Flat flow stops beyond seven horizontal cells');

        put(0, 31, -8, 'water');
        await settle('Waterfall');
        check(water(4, 28, -8), 'Water flows down the ledge through air');
        check(getWaterLevel(id(4, 28, -8)) === 8, 'The waterfall uses its falling state');
        check(water(4, 25, -8) && water(5, 25, -8), 'The waterfall reaches and spreads across the lower basin');
        check(!water(5, 26, -8), 'A shallow receiving basin is not filled as solid full-height cubes');

        for (let x = -19; x <= -13; x++) for (let z = 5; z <= 9; z++) put(x, 25, z, 'water');
        await settle('Sealed riverbank');
        check(!water(-11, 25, 7), 'The unbroken riverbank contains its sources');
        check(put(-12, 25, 7, null), 'The riverbank gate can be removed by the ordinary edit path');
        await settle('Breached riverbank');
        check(water(-12, 25, 7) && water(-11, 25, 7) && water(-10, 25, 7), 'Breaking a bank releases water into the dry outlet');
        check(isWaterSourceId(id(-13, 25, 7)), 'The original river source survives the breach');
        check(!isWaterSourceId(id(-11, 25, 7)), 'A single-sided outlet does not manufacture a new source');
        check(id(5, 24, 5) === source, 'The supported legacy source is still present');
        // Normal Game.update may manage its own streaming; the direct fluid
        // quiescence check below isolates water-generated work from that.
        const loaded = world().chunks.size;
        const idleStart = world().fluids.stats().processed;
        for (let i = 0; i < 12; i++) tick();
        check(world().chunks.size === loaded, 'Settled water does not generate additional chunks');
        check(world().fluids.stats().processed === idleStart, 'Stable sources and pools become idle');
        check(processed.every(value => value <= CELL_LIMIT), 'Every measured simulation slice respects its cell cap');
        check(changed.every(value => value <= CHANGE_LIMIT), 'Every measured simulation slice respects its mutation cap');
        check(scanned.every(value => value <= SCAN_LIMIT), 'Every measured initialization slice respects its scan cap');
        world().updateMeshes(Infinity);
        return { checks: [...checks], fixture: { originallyLoadedChunks: beforeCount, finalLoadedChunks: loaded,
            sourcesPlaced: 37, horizontalReach: 7, ledgeDrop: 6 },
            policy: { stepSeconds: DT, budgetMs: BUDGET_MS, maxUpdates: CELL_LIMIT, maxChanges: CHANGE_LIMIT, maxScanCells: SCAN_LIMIT },
            cpu: { simulation: quantiles(simulationMs), meshingSlices: quantiles(meshMs),
                measuredSteps: steps, maxPending: Math.max(...pending), maxProcessed: Math.max(...processed),
                maxChanged: Math.max(...changed), maxScanned: Math.max(...scanned),
                scope: 'Main-thread CPU only, fixture initialization and settling included; meshing separate; no GPU/FPS claim' },
            finalStats: world().fluids.stats() };
    }

    async function stress() {
        const first = checks.length;
        // The 32×32 floor gives 64 separated sources room to create and merge
        // many fronts. It is outside the screenshot fixtures, in real chunks.
        for (let cz = -2; cz <= 1; cz++) for (let cx = 1; cx <= 4; cx++) world().generateChunk(cx, cz);
        for (let x = 32; x < 64; x++) for (let z = -16; z < 16; z++) {
            put(x, 36, z);
            if (x === 32 || x === 63 || z === -16 || z === 15) put(x, 37, z);
        }
        await settle('Stress initialization');
        const from = simulationMs.length, initialChanges = world().fluids.stats().changes;
        const loaded = world().chunks.size, sources = [];
        for (let x = 33; x <= 61; x += 4) for (let z = -15; z <= 13; z += 4) {
            put(x, 37, z, 'water'); sources.push([x, 37, z]);
        }
        const settleSteps = await settle('64-source stress', 4000);
        let wetCells = 0;
        for (let x = 33; x < 63; x++) for (let z = -15; z < 15; z++) if (water(x, 37, z)) wetCells++;
        check(sources.length === 64, 'Stress fixture places exactly 64 independent sources');
        check(sources.every(point => isWaterSourceId(id(...point))), 'All stress sources survive colliding flow fronts');
        check(wetCells > 800, 'The stress run exercises more than 800 wetted cells');
        check(world().chunks.size === loaded, 'Stress flow never generates a missing chunk');
        const final = world().fluids.stats(), touched = final.changes - initialChanges;
        check(touched > 700, 'Stress causes more than 700 actual fluid mutations');
        check(final.pending === 0 && final.scans === 0, 'Stress drains its work queues completely');
        return { checks: checks.slice(first), fixture: { side: 32, placedSources: sources.length, wetCells,
            loadedChunks: loaded, fluidMutations: touched, settleSteps },
            cpu: { simulation: quantiles(simulationMs.slice(from)), meshingSlices: quantiles(meshMs.slice(from)),
                maxPending: Math.max(...pending.slice(from)), maxProcessed: Math.max(...processed.slice(from)),
                maxChanged: Math.max(...changed.slice(from)), maxScanned: Math.max(...scanned.slice(from)),
                scope: 'Main-thread CPU while 64 sources spread and merge; initialization and source placement excluded; meshing separate' },
            finalStats: final };
    }

    const views = {
        // Look along each open channel, not through its enclosing stone wall.
        spill: { eye: [-10.5, 34, -7.5], target: [-15.5, 25.5, -7.5],
            probes: [{ cell: [-17, 25, -8] }, { cell: [-13, 25, -8] }] },
        waterfall: { eye: [9, 35, -7.5], target: [3.5, 29, -7.5],
            probes: [{ cell: [4, 28, -8], face: 'east' }, { cell: [5, 25, -8] }] },
        breach: { eye: [-5.5, 35, 7.5], target: [-13, 25.5, 7.5],
            probes: [{ cell: [-11, 25, 7] }, { cell: [-9, 25, 7] }] },
        overview: { eye: [24, 48, 34], target: [-5, 26, 0] }
    };
    function visibleFlow(name, probes = []) {
        const meshes = [...world().chunks.values()].flatMap(chunk => [chunk.mesh, chunk.plantMesh]).filter(mesh => mesh?.visible);
        const ray = new THREE.Raycaster();
        return probes.map(({ cell, face = 'top' }) => {
            const [x, y, z] = cell, block = id(x, y, z);
            check(isFlowingWaterId(block), `${name}: visibility probe ${cell} targets flowing water`);
            const point = face === 'east' ? new THREE.Vector3(x + 1, y + .5, z + .5)
                : new THREE.Vector3(x + .5, y + waterSurfaceHeight(world(), x, y, z), z + .5);
            const projected = point.clone().project(game.camera);
            const screen = [(projected.x + 1) * 360, (1 - projected.y) * 240];
            check(projected.z > -1 && projected.z < 1 && screen[0] > 8 && screen[0] < 712 && screen[1] > 8 && screen[1] < 472,
                `${name}: flowing water at ${cell} is inside the screenshot`);
            // Check the exact visible mesh, including opaque stone. A water
            // group elsewhere or water hidden behind a wall cannot satisfy it.
            ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), game.camera);
            const hit = ray.intersectObjects(meshes, false)[0];
            check(hit?.face?.materialIndex === 2 && hit.point.distanceTo(point) < .01,
                `${name}: first visible triangle at ${cell} is the intended ${face} water face`);
            return { cell, face, level: getWaterLevel(block), screen, point: point.toArray(), firstHitDistance: hit.distance };
        });
    }
    function view(name) {
        const value = views[name]; if (!value) throw new Error(`Unknown view ${name}`);
        world().updateMeshes(Infinity);
        // Keep the streaming radius small for this CPU smoke, but let the
        // inspection cameras see all three fixtures through the fog.
        game.scene.fog.near = 80; game.scene.fog.far = 160;
        game.camera.position.set(...value.eye); game.camera.lookAt(...value.target);
        game.camera.fov = 60; game.camera.aspect = 720 / 480; game.camera.updateProjectionMatrix();
        game.render();
        const visibleFlowProbes = visibleFlow(name, value.probes);
        const gl = renderer.getContext();
        check(gl.getError() === gl.NO_ERROR, `${name}: WebGL completed without an error`);
        let waterTriangles = 0;
        const heights = new Set();
        for (const chunk of world().chunks.values()) {
            const geometry = chunk.mesh?.geometry, group = geometry?.groups.find(group => group.materialIndex === 2);
            if (!group) continue;
            waterTriangles += group.count / 3;
            const positions = geometry.attributes.position, indices = geometry.index.array;
            for (let at = group.start; at < group.start + group.count; at++) {
                const y = positions.getY(indices[at]);
                if (y > 25 && y < 26) heights.add(Number(y.toFixed(4)));
            }
        }
        check(waterTriangles > 0, `${name}: the real chunk renderer contains water triangles`);
        check(heights.size >= 4, `${name}: flowing water has multiple fractional surface heights`);
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        const pixels = new Uint8Array(720 * 480 * 4);
        gl.readPixels(0, 0, 720, 480, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const colors = new Set();
        for (let at = 0; at < pixels.length; at += 97 * 4) colors.add(`${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`);
        check(colors.size > 16, `${name}: WebGL produced a nonblank scene`);
        return { waterTriangles, fractionalHeights: [...heights].sort((a, b) => a - b),
            sampledColors: colors.size, visibleFlowProbes,
            drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
            renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    }

    async function persistence() {
        const first = checks.length;
        const points = [];
        for (let x = -19; x <= -12; x++) points.push([x, 25, -8]);
        for (let y = 25; y <= 31; y++) points.push([4, y, -8]);
        points.push([-11, 25, 7], [5, 24, 5]);
        const expected = points.map(point => id(...point));
        check(expected.some(block => block > 255 && isFlowingWaterId(block)), 'The persistence fixture includes actual 16-bit flow IDs');
        check(await game.saver.flush(), 'Water changes commit through WorldSaver');
        const disk = await storage.loadChunks(info.id);
        check([...disk.values()].some(blocks => blocks instanceof Uint16Array && blocks.some(isFlowingWaterId)),
            'The IndexedDB save contains 16-bit flowing water');
        check(await game.stop(), 'Game.stop completes the water save'); game = null;
        const savedInfo = (await storage.listWorlds()).find(value => value.id === info.id);
        game = await Game.start(renderer, input, storage, savedInfo, settings);
        game.time.speed = 0; game.time.days = .4;
        for (const [i, point] of points.entries()) {
            world().ensureColumnLoaded(point[0], point[2]);
            check(id(...point) === expected[i], `Restart preserves water at ${point.join(',')}`);
        }
        const restoredView = view('overview');
        check(put(-19, 25, -8, null), 'The original flat-channel source can be removed');
        await settle('Removed source');
        for (let x = -19; x <= -12; x++) check(!water(x, 25, -8), `Unsupported water drains at ${x},25,-8`);
        check(id(5, 24, 5) === source, 'Draining another channel does not erase the legacy source');
        return { checks: checks.slice(first), snapshot: points.map((point, i) => ({ point, id: expected[i] })),
            restoredView, finalStats: world().fluids.stats() };
    }

    async function dispose() {
        if (game) { await game.stop({ save: false }); game = null; }
        renderer.dispose(); renderer.domElement.remove(); storage.background?.stop(); storage.db.close();
    }
    return { run, view, stress, persistence, dispose };
}
