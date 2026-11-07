// Pure surface discovery: real chunks/registry/heights, no renderer or DOM.
// node tools/sprawdz_powierzchnie_fal.mjs [--benchmark] [--output report.json]
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

registerHooks({ load(url, context, next) {
    return next(url, url.endsWith('.js') && /\/src\//.test(url) ? { ...context, format: 'module' } : context);
} });
const { WaterfallRippleSurface, RIPPLE_SURFACE_CAPS } = await import('../src/rendering/WaterfallRippleSurface.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { waterSurfaceHeight, interpolateWaterHeight } = await import('../src/world/WaterSurface.js');
const { getBlockId, getWaterLevel, WATER_SOURCE_ID, waterIdForLevel } = await import('../src/blocks/BlockRegistry.js');
const { WATER_SURFACE, CHUNK_SIZE: S, CHUNK_HEIGHT: H } = await import('../src/config.js');
const STONE = getBlockId('stone'), FALLING = waterIdForLevel(8);
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const near = (a, b, label) => check(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);

function fixture(instrumentReads = true) {
    const chunks = new Map();
    let blockReads = 0, chunkReads = 0;
    const world = {
        getChunk(x, z) { chunkReads++; return chunks.get(`${x},${z}`); },
        getBlockId(x, y, z) {
            if (y < 0 || y >= H) return 0;
            const cx = Math.floor(x / S), cz = Math.floor(z / S);
            return chunks.get(`${cx},${cz}`)?.blocks[(y * S + z - cz * S) * S + x - cx * S] ?? 0;
        },
        generateChunk() { throw new Error('Surface discovery must never generate chunks'); }
    };
    const f = { world, chunks,
        get reads() { return { blockReads, chunkReads }; },
        resetReads() { blockReads = chunkReads = 0; },
        set(x, y, z, id) {
            const cx = Math.floor(x / S), cz = Math.floor(z / S), key = `${cx},${cz}`;
            let chunk = chunks.get(key);
            if (!chunk) {
                chunk = new Chunk(cx, cz);
                if (instrumentReads) chunk.blocks = new Proxy(chunk.blocks, { get(target, property) {
                    if (typeof property === 'string' && /^\d+$/.test(property)) blockReads++;
                    return Reflect.get(target, property, target);
                } });
                chunks.set(key, chunk);
            }
            if (chunk.setId(x - cx * S, y, z - cz * S, id)) chunk.meshRevision++;
            return chunk;
        },
        pool(x, y, z, radius = 6, level = 0) {
            for (let dz = -radius; dz <= radius; dz++) for (let dx = -radius; dx <= radius; dx++) {
                f.set(x + dx, y - 1, z + dz, STONE);
                f.set(x + dx, y, z + dz, waterIdForLevel(level));
            }
        },
        landing(x, y, z, fall = 16) {
            f.set(x, y, z, FALLING);
            f.set(x, y + 1, z, FALLING);
            return { x, y, z, fall, lighting: { sky: .8, local: [.1, .2, .3], classicShade: .7 } };
        }
    };
    return f;
}

function settle(surface, limit = 200) {
    let steps = 0;
    while (surface.stats().queued && steps++ < limit) {
        surface.update();
        check(surface.stats().lastProcessed <= RIPPLE_SURFACE_CAPS.cellsPerUpdate, 'Every update respects the cell cap');
    }
    equal(surface.stats().queued, 0, 'Discovery completes in bounded slices');
    return steps;
}

function verifyPatches(surface, f) {
    for (const entry of surface.entries) {
        check(entry.patches.length <= 169 && entry.dependencies.length <= 4, 'Patch/dependency storage is bounded');
        const found = new Set();
        for (const patch of entry.patches) {
            const key = `${patch.x},${patch.y},${patch.z}`;
            check(!found.has(key), 'A receiving cell is emitted once'); found.add(key);
            check(getWaterLevel(f.world.getBlockId(patch.x, patch.y, patch.z)) >= 0, 'Every patch rests on water');
            check(getWaterLevel(f.world.getBlockId(patch.x, patch.y + 1, patch.z)) < 0, 'Covered water has no patch');
            equal(patch.y, entry.y, 'BFS stays on the receiving layer');
            for (let i = 0; i < 4; i++) {
                near(patch.heights[i], waterSurfaceHeight(f.world, patch.x, patch.y, patch.z, i & 1, i >> 1), 'Corner matches mesher shared rule');
                equal(patch.waves[i], patch.heights[i] < 1 ? Math.round(patch.heights[i] / WATER_SURFACE * 255) : 0,
                    'Wave weight matches packed mesher byte');
            }
            for (const [fx, fz] of [[.2, .3], [.8, .7]]) near(
                interpolateWaterHeight(...patch.heights, fx, fz),
                waterSurfaceHeight(f.world, patch.x, patch.y, patch.z, fx, fz), 'Both triangle planes match surface queries');
        }
    }
}

// Pool receiving layer lies below the falling cell; the covered impact cell
// seeds adjacent exposed water, but is never an overlay itself.
const pool = fixture();
pool.pool(0, 5, 0);
const landing = pool.landing(0, 6, 0);
const surface = new WaterfallRippleSurface(pool.world, { now: () => 0 });
surface.setLandings([landing]);
equal(surface.entries.length, 1, 'One landing produces one emitter');
equal([surface.entries[0].x, surface.entries[0].y, surface.entries[0].z], [.5, 5, .5], 'Impact center and source pool layer');
equal([surface.entries[0].radius, surface.entries[0].opacity], [6, .44], 'Fall16 radius/opacity bounds');
equal(surface.revision, 0, 'Queued work is not a published change');
surface.update();
equal(surface.lastProcessed, 48, 'Large pool uses exactly one bounded slice');
equal(surface.entries[0].patches.length, 0, 'Partial BFS is never visible');
settle(surface);
check(surface.entries[0].patches.length > 90, 'Covered impact reaches its connected exposed pool');
check(!surface.entries[0].patches.some(p => p.x === 0 && p.z === 0), 'No ring on the falling column itself');
verifyPatches(surface, pool);

// Settled frames only compare a few chunk revisions; no water scans, geometry
// allocation or revision changes occur until an affected dependency changes.
const entry = surface.entries[0], patches = entry.patches, revision = surface.revision;
pool.resetReads();
for (let i = 0; i < 120; i++) surface.update();
equal(pool.reads.blockReads, 0, '120 settled frames inspect zero block cells');
check(pool.reads.chunkReads <= 4 * 120, 'Settled frames check at most four chunk dependencies');
equal(entry.patches, patches, 'Settled frames retain patch identity');
equal(surface.revision, revision, 'Settled frames do not republish');
surface.setLandings([{ ...landing, lighting: { ...landing.lighting, local: [...landing.lighting.local] } }]);
equal(surface.revision, revision, 'Fresh equal lighting objects do not republish');
surface.setLandings([{ ...landing, lighting: { ...landing.lighting, sky: .3 } }]);
equal(surface.revision, revision + 1, 'Changed lighting publishes once');
equal(surface.stats().queued, 0, 'Lighting changes need no BFS');
equal(entry.patches, patches, 'Lighting update retains patch geometry');
equal(entry.patches[0].lighting.sky, .3, 'Fallback patch lighting follows changed impact light');

// Local lighting is sampled once per discovered patch inside the same budget,
// so a shadowed part of a pool never inherits the bright impact's lighting.
let lightingCalls = 0;
const local = new WaterfallRippleSurface(pool.world, { now: () => 0, lightingAt: (x, y, z) => {
    lightingCalls++;
    equal(y, 6, 'Local lighting samples just above receiving water');
    return { sky: x < 0 ? .1 : .9, local: [0, 0, 0], classicShade: .5 };
} });
local.setLandings([landing]); settle(local);
equal(lightingCalls, local.stats().cells, 'One lighting sample per discovered patch');
check(local.entries[0].patches.some(p => p.lighting.sky === .1) && local.entries[0].patches.some(p => p.lighting.sky === .9),
    'One pool retains distinct local lighting');
local.update();
equal(lightingCalls, local.stats().cells, 'Settled frames do not resample lighting');
local.dispose();

// An unrelated chunk does not invalidate local water. A shore/island edit
// clears stale visible patches immediately and rebuilds only affected entries.
pool.set(100, 5, 100, STONE);
surface.update();
equal(entry.patches, patches, 'Unrelated chunk edits leave cached surface intact');
pool.set(1, 5, 0, STONE);
surface.update();
equal(entry.patches.length, 0, 'Island edit immediately removes stale visible patches');
check(surface.revision > revision + 1, 'Removal is published before a partial rebuild');
settle(surface);
check(!entry.patches.some(p => p.x === 1 && p.z === 0), 'Rebuild clips the new solid island');
verifyPatches(surface, pool);

// A wall spans the whole search area; a nearby but disconnected pool must not
// receive rings. Water under a ceiling is not a bridge to an exposed pool.
for (const barrier of ['stone', 'roof', 'air']) {
    const f = fixture(); f.pool(0, 5, 0);
    const impact = f.landing(0, 6, 0);
    for (let z = -6; z <= 6; z++) {
        if (barrier === 'roof') f.set(2, 6, z, STONE);
        else f.set(2, 5, z, barrier === 'stone' ? STONE : 0);
    }
    const s = new WaterfallRippleSurface(f.world, { now: () => 0 });
    s.setLandings([impact]); settle(s);
    check(s.entries[0].patches.every(p => p.x < 2), `${barrier}: no jump across disconnected water`);
    verifyPatches(s, f); s.dispose();
}

// Shallow runout on a floor uses the impact layer, including sloped corners
// on positive/negative chunk seams. Empty land never receives a patch.
for (const center of [15, -1, -17]) {
    const f = fixture(); f.pool(center, 7, center, 6, 4);
    const impact = f.landing(center, 7, center, 8);
    f.set(center + 1, 7, center + 1, waterIdForLevel(1));
    f.set(center - 1, 7, center - 1, waterIdForLevel(7));
    f.set(center + 2, 7, center, 0);
    const s = new WaterfallRippleSurface(f.world, { now: () => 0 });
    s.setLandings([impact]); settle(s);
    equal(s.entries[0].y, 7, 'Stone-floor drop uses shallow runout layer');
    verifyPatches(s, f);
    check(s.entries[0].patches.some(p => p.heights.some(h => h !== p.heights[0])), 'Sloped receiving geometry is retained');
    s.dispose();
}

// Missing chunks stop traversal; reloading the same coordinates with a new
// object invalidates old data even if its numeric revision happens to match.
const border = fixture(); border.pool(15, 5, 0);
const borderLanding = border.landing(15, 6, 0);
const borderSurface = new WaterfallRippleSurface(border.world, { now: () => 0 });
borderSurface.setLandings([borderLanding]); settle(borderSurface);
const oldEast = border.chunks.get('1,0');
border.chunks.delete('1,0');
borderSurface.update();
equal(borderSurface.entries[0].patches.length, 0, 'Unload immediately clears crossing patches');
settle(borderSurface);
check(borderSurface.entries[0].patches.every(p => !(p.x >= 16 && p.z >= 0)), 'No overlay in unloaded chunk');
const replacement = new Chunk(1, 0); replacement.meshRevision = oldEast.meshRevision;
border.chunks.set('1,0', replacement);
borderSurface.update();
equal(borderSurface.entries[0].patches.length, 0, 'Replacement object invalidates even equal revision');
settle(borderSurface);
check(borderSurface.entries[0].patches.every(p => !(p.x >= 16 && p.z >= 0)), 'Dry replacement cannot retain stale rings');

// Strongest nearby impact wins independently of input order; distinct planes
// and distant falls remain separate. Normal/potato/off caps apply immediately.
const many = fixture(), impacts = [];
for (let i = 0; i < 20; i++) {
    many.pool(i * 20, 5, 0, 1);
    impacts.push(many.landing(i * 20, 6, 0, i % 16 + 1));
}
many.set(1, 5, 0, WATER_SOURCE_ID);
const neighbor = many.landing(1, 6, 0, 16);
const manySurface = new WaterfallRippleSurface(many.world, { now: () => 0 });
manySurface.setLandings([impacts[0], neighbor]); settle(manySurface);
equal(manySurface.entries.length, 1, 'Neighboring impacts are deduplicated');
equal(manySurface.entries[0].x, 1.5, 'Strongest impact is representative');
const stableId = manySurface.entries[0].id;
manySurface.setLandings([neighbor, impacts[0]]);
equal(manySurface.entries[0].id, stableId, 'Reordered impacts retain stable identity');
manySurface.setLandings(impacts);
equal(manySurface.entries.length, 12, 'Normal detail has at most12 emitters');
settle(manySurface);
manySurface.setLandings(impacts, .35);
equal(manySurface.entries.length, 4, 'Potato detail has at most4 emitters');
check(manySurface.stats().queued <= 4, 'Reduced detail drops queued work too');
manySurface.setLandings(impacts, 0);
equal(manySurface.stats().emitters, 0, 'Disabled effect has no emitters');
equal(manySurface.stats().queued, 0, 'Disabled effect releases pending jobs');

// A deadline can stop before the first cell; progress resumes on later frames.
let time = 0, stride = .4;
const timed = new WaterfallRippleSurface(pool.world, { now: () => time += stride });
timed.setLandings([landing]); timed.update();
equal(timed.lastProcessed, 0, 'Expired deadline starts no cell');
stride = 0;
settle(timed);
check(timed.entries[0].patches.length > 0, 'Paused budget can resume discovery');

// A receiving cell replaced by stone cannot seed a nearby disconnected pool.
pool.set(0, 5, 0, STONE); pool.set(0, 6, 0, STONE);
surface.setLandings([landing]);
equal(surface.entries.length, 0, 'Stale dry landing is removed');
equal(surface.jobs.length, 0, 'Removed landing leaves no queued references');
for (const s of [surface, borderSurface, manySurface, timed]) {
    s.dispose(); s.dispose(); s.update(); s.setLandings([landing]);
    equal(s.stats().cells, 0, 'Disposal is idempotent and releases all patches');
    equal(s.world, null, 'Disposal releases world reference');
}
console.log(`OK: powierzchnie fal — ${checks} sprawdzeń połączeń, wysokości, granic, cache i budżetu.`);

if (process.argv.includes('--benchmark')) {
    const trials = [];
    for (let trial = 0; trial < 6; trial++) {
        const f = fixture(false), landings = [];
        for (let i = 0; i < 12; i++) { f.pool(i * 20, 5, 0); landings.push(f.landing(i * 20, 6, 0)); }
        const s = new WaterfallRippleSurface(f.world);
        s.setLandings(landings);
        const slices = [];
        let processed = 0, maxCells = 0;
        while (s.stats().queued) {
            const before = performance.now(); s.update(); slices.push(performance.now() - before);
            processed += s.lastProcessed; maxCells = Math.max(maxCells, s.lastProcessed);
        }
        f.resetReads();
        const start = performance.now();
        for (let frame = 0; frame < 1000; frame++) s.update();
        const settledMs = (performance.now() - start) / 1000;
        const refreshStart = performance.now();
        for (let refresh = 0; refresh < 100; refresh++) s.setLandings(landings);
        const refreshMs = (performance.now() - refreshStart) / 100;
        assert.equal(s.stats().queued, 0, 'Unchanged refreshes enqueue no discovery');
        if (trial) trials.push({ slices: slices.length, maximumSliceMs: Math.max(...slices), processed, maxCells,
            settledMs, refreshMs, patches: s.stats().cells });
        s.dispose();
    }
    const median = values => values.sort((a, b) => a - b)[values.length >> 1];
    const report = { checks, node: process.version, platform: process.platform, arch: process.arch,
        kind: 'CPU surface discovery with real Uint16 chunks, not GPU/frame FPS', caps: RIPPLE_SURFACE_CAPS,
        fixture: { emitters: 12, fall: 16, sourcePoolWidth: 13, settledFramesPerTrial: 1000, refreshesPerTrial: 100,
            warmupTrials: 1, measuredTrials: 5 }, stableFrameBlockReads: 0,
        trials, medianSettledMs: median(trials.map(t => t.settledMs)),
        medianRefreshMs: median(trials.map(t => t.refreshMs)), maximumSliceMs: Math.max(...trials.map(t => t.maximumSliceMs)) };
    const output = process.argv.indexOf('--output');
    if (output >= 0) { const path = process.argv[output + 1]; assert.ok(path); await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(report, null, 2)}\n`); }
    console.log(JSON.stringify(report, null, 2));
}
