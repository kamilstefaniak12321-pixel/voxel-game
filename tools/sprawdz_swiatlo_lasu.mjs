// Real incremental sky transport; no browser, user saves or mock light solver.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true,
            source: 'export const getAtlasAverage = name => globalThis.leafAverage(name); export const atlasAveragesReady=Promise.resolve();' };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/')) ? { ...context, format: 'module' } : context);
    }
});
const { Chunk } = await import('../src/world/Chunk.js');
const { LightEngine } = await import('../src/world/Light.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { CANOPY_SKY_LEVELS, canopyTransmission } = await import('../src/world/CanopyPolicy.js');
const { createCanopySampler, leafCanopyColor } = await import('../src/rendering/CanopyLighting.js');
const { atmosphericLightToBrightness } = await import('../src/rendering/LightPolicy.js');
const S = 16, H = 128, LAYER = S * S;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
function makeWorld(blocks = null, order = [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const chunks = new Map();
    const world = { getChunk: (x, z) => chunks.get(`${x},${z}`), chunks };
    for (const [x, z] of order) {
        const chunk = new Chunk(x, z); chunks.set(`${x},${z}`, chunk);
        if (blocks) chunk.blocks.set(blocks.get(`${x},${z}`));
        else for (let lz = 0; lz < S; lz++) for (let lx = 0; lx < S; lx++) {
            chunk.blocks[chunk.index(lx, 20, lz)] = getBlockId('stone');
            for (let y = 72; y < 78; y++) chunk.blocks[chunk.index(lx, y, lz)] = getBlockId('maple_leaves');
        }
        chunk.maxY = 80;
    }
    for (const chunk of chunks.values()) {
        chunk.west = world.getChunk(chunk.cx - 1, chunk.cz) ?? null;
        chunk.east = world.getChunk(chunk.cx + 1, chunk.cz) ?? null;
        chunk.north = world.getChunk(chunk.cx, chunk.cz - 1) ?? null;
        chunk.south = world.getChunk(chunk.cx, chunk.cz + 1) ?? null;
    }
    world.light = new LightEngine(world);
    for (const chunk of chunks.values()) world.light.initChunk(chunk);
    return world;
}
function edit(world, x, y, z, name) {
    const chunk = world.getChunk(Math.floor(x / S), Math.floor(z / S));
    const index = chunk.index(x - chunk.cx * S, y, z - chunk.cz * S);
    chunk.blocks[index] = getBlockId(name);
    world.light.blockChanged(chunk, index);
}
function verifyFresh(world, label) {
    const blocks = new Map([...world.chunks].map(([key, chunk]) => [key, chunk.blocks]));
    const fresh = makeWorld(blocks, [[1, 1], [0, 1], [1, 0], [0, 0]]);
    for (const [key, chunk] of world.chunks) {
        assert.deepEqual(chunk.skySources, fresh.chunks.get(key).skySources, label + ': direct sources ' + key); checks++;
        assert.deepEqual(chunk.skyLight, fresh.chunks.get(key).skyLight, label + ': flood sky ' + key); checks++;
        for (const channel of ['lightR', 'lightG', 'lightB']) {
            assert.deepEqual(chunk[channel], fresh.chunks.get(key)[channel], label + ': ' + channel); checks++;
        }
    }
}
const world = makeWorld();
const sample = y => world.light.getLight(16, y, 16).sky;
const initialFloorSky = sample(21);
check(sample(21) === sample(60), 'Fifty blocks of clear air below the same canopy do not absorb sky');
check(sample(21) >= CANOPY_SKY_LEVELS[6] && sample(21) < 15, 'Tall forest is shaded but receives transmitted sky');
check(sample(79) === 15, 'Open sky remains unchanged');
for (let layers = 1; layers <= H; layers++) {
    check(CANOPY_SKY_LEVELS[layers] <= CANOPY_SKY_LEVELS[layers - 1], 'More foliage cannot amplify sky');
    check(canopyTransmission(layers) < canopyTransmission(layers - 1), 'Unquantized transport attenuates every leaf layer');
}
verifyFresh(world, 'Initial forest, reversed load order');
for (const [name, x, y, z] of [
    ['stone', 15, 65, 15], ['stone', 16, 64, 16], [null, 15, 65, 15],
    [null, 16, 75, 16], ['ginkgo_leaves', 16, 66, 16], [null, 16, 64, 16],
    ['lamp_red', 15, 40, 16], ['stone', 15, 41, 16], [null, 15, 40, 16],
    ['maple_leaves', 16, 75, 16]
]) { edit(world, x, y, z, name); verifyFresh(world, `Edit ${name} at ${x},${y},${z}`); }

// A closed room below leaves must remain pitch dark. Open/close a skylight at
// the four-chunk intersection; edited results must equal a full reinitialization.
for (let y = 30; y <= 36; y++) for (let x = 12; x <= 20; x++) for (let z = 12; z <= 20; z++)
    if (y === 30 || y === 36 || x === 12 || x === 20 || z === 12 || z === 20) edit(world, x, y, z, 'stone');
check(world.light.getLight(16, 33, 16).sky === 0, 'Opaque cave/roof blocks transmitted forest sky');
verifyFresh(world, 'Closed room under canopy');
edit(world, 16, 36, 16, null);
check(world.light.getLight(16, 33, 16).sky > 0, 'Opening skylight admits filtered sky');
verifyFresh(world, 'Open skylight');
edit(world, 16, 36, 16, 'stone');
check(world.light.getLight(16, 33, 16).sky === 0, 'Closing skylight removes dependent sky');
verifyFresh(world, 'Reclosed skylight');
check(atmosphericLightToBrightness(initialFloorSky) ** 2.2 > .1, 'Forest floor retains readable linear sky energy');
check([...world.chunks.values()].every(chunk => chunk.skySources.byteLength === 32768), 'Additional sky metadata is exactly 32 KiB per 16×128×16 chunk');

// Actual atlas pixels, including texture-pack-compatible lookup by material ID.
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
globalThis.leafAverage = name => {
    const region = readTextureRegion(name), sum = [0, 0, 0]; let samples = 0;
    for (let i = 0; i < region.rgba.length; i += 4) {
        if (region.rgba[i + 3] < 128) continue;
        samples++;
        for (let c = 0; c < 3; c++) sum[c] += linear(region.rgba[i + c] / 255);
    }
    return { r: sum[0] / samples, g: sum[1] / samples, b: sum[2] / samples };
};
const hueCases = [['oak_leaves', 1], ['ginkgo_leaves', 0], ['maple_leaves', 0]];
for (const [leaf, dominant] of hueCases) {
    const color = leafCanopyColor(getBlockId(leaf));
    check(color[dominant] > color[2], leaf + ': actual leaf atlas has expected hue');
    const forest = makeWorld();
    for (const chunk of forest.chunks.values()) for (let i = 0; i < chunk.blocks.length; i++)
        if (chunk.blocks[i] === getBlockId('maple_leaves')) chunk.blocks[i] = getBlockId(leaf);
    const sampler = createCanopySampler(forest), filter = Array.from(sampler.sample(16.5, 25, 16.5));
    check(filter.every(value => value >= .675 && value <= 1.001), leaf + ': restrained filter, no amplification');
    check(filter[dominant] > filter[2], leaf + ': ground receives correct foliage hue');
    check(Array.from(sampler.sample(16.5, 79, 16.5)).every(value => value === 1), leaf + ': open air remains neutral');
    const roof = forest.getChunk(1, 1); roof.blocks[roof.index(0, 29, 0)] = getBlockId('stone');
    const closed = createCanopySampler(forest);
    check(Array.from(closed.sample(16.5, 25, 16.5)).every(value => value === 1), leaf + ': no colored transmission through opaque roof');
    const night = filter.map(value => value * 0);
    check(night.every(value => value === 0), 'Color filtering cannot emit light without sky');
}
const { createFarCanopySampler, packCanopy, unpackCanopy } = await import('../src/world/FarCanopy.js');
const { SURFACE_MATERIAL_COUNT } = await import('../src/rendering/SurfaceMaterials.js');
const palette = new Uint8Array(SURFACE_MATERIAL_COUNT * 18);
for (const [leaf] of hueCases) {
    const id = getBlockId(leaf), rgb = leafCanopyColor(id);
    for (let f = 0; f < 6; f++) for (let c = 0; c < 3; c++) palette[id * 18 + f * 3 + c] = Math.round(Math.sqrt(rgb[c]) * 255);
    const box = [-16, 72, -16, 16, 78, 16, id, 0, 0, 0, 16, 1];
    const data = Float32Array.from([...box, ...box]);
    const sampler = createFarCanopySampler(data, [0], palette);
    const repeated = createFarCanopySampler(data, [0, 12], palette);
    const low = [...sampler.sample(0, 22, 0)], high = [...sampler.sample(0, 60, 0)];
    assert.deepEqual(low, high, leaf + ': LOD clear air retains filtered sky'); checks++;
    assert.deepEqual(low, repeated.sample(0, 22, 0), leaf + ': overlapping identical proxies do not double-absorb'); checks++;
    assert.deepEqual([...sampler.sample(0, 80, 0)], [1, 1, 1], leaf + ': above LOD crown is neutral'); checks++;
    check(Math.max(...low) <= canopyTransmission(6) + .0001, leaf + ': LOD follows shared density policy');
    const decoded = unpackCanopy(packCanopy(low));
    check(decoded.every((value, c) => Math.abs(value - low[c]) <= 1 / 62 + 1e-8), 'RGB555 error at most half a quantization step');
    check(packCanopy([1, 1, 1]) === 32767 && packCanopy([0, 0, 0]) === 0, 'Packed light stays in positive Int16 range');
}
console.log(`OK: światło lasu — ${checks} sprawdzeń kolumn, edycji, granic, dachu, źródeł i kolorów atlasu oraz LOD.`);
