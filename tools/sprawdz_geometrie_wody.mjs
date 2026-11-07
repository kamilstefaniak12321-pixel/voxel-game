// Actual mesher buffers and shared physics/raycast heights, without a GPU.
// node tools/sprawdz_geometrie_wody.mjs [--benchmark] [--output result.json]
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
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { Chunk } = await import('../src/world/Chunk.js');
const { CHUNK_SIZE: S, CHUNK_HEIGHT: H, WATER_SURFACE } = await import('../src/config.js');
const { getBlockId, getWaterBaseHeight, WATER_SOURCE_ID, WATER_FALLING_ID, waterIdForLevel } =
    await import('../src/blocks/BlockRegistry.js');
const { waterSurfaceHeight } = await import('../src/world/WaterSurface.js');
const { buildChunkGeometry, createChunkGeometryJob } = await import('../src/rendering/ChunkMesher.js');
const { waterMaterial, WATER_FLOW_UV } = await import('../src/rendering/BlockRenderData.js');
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const equal = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const near = (actual, expected, label, tolerance = 1e-6) => {
    check(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
};

function fixture() {
    const chunks = new Map();
    const world = {
        reads: 0, experiments: { bushyGrass: false }, getGrassDetail: () => 0,
        getChunk: (cx, cz) => chunks.get(`${cx},${cz}`),
        getBlockId(x, y, z) {
            this.reads++;
            if (y < 0 || y >= H) return 0;
            const cx = Math.floor(x / S), cz = Math.floor(z / S);
            return this.getChunk(cx, cz)?.blocks[(y * S + z - cz * S) * S + x - cx * S] ?? 0;
        }
    };
    return { chunks, world, set(x, y, z, id) {
        const cx = Math.floor(x / S), cz = Math.floor(z / S), key = `${cx},${cz}`;
        let chunk = chunks.get(key);
        if (!chunk) { chunk = new Chunk(cx, cz); chunk.skyLight.fill(15); chunks.set(key, chunk); }
        chunk.setId(x - cx * S, y, z - cz * S, id);
        return chunk;
    } };
}

function waterQuads(geometry, chunk) {
    const group = geometry?.groups.find(group => group.materialIndex === 2);
    if (!group) return [];
    const { position, normal, plantMotion, uv } = geometry.attributes;
    const quads = [];
    for (let face = group.start / 6; face < (group.start + group.count) / 6; face++) {
        const vertices = [];
        for (let corner = 0; corner < 4; corner++) {
            const index = face * 4 + corner;
            vertices.push({ x: position.getX(index) + chunk.cx * S, y: position.getY(index),
                z: position.getZ(index) + chunk.cz * S,
                normal: [normal.getX(index), normal.getY(index), normal.getZ(index)],
                wave: plantMotion.array[index * 2], flag: plantMotion.array[index * 2 + 1],
                uv: [uv.getX(index), uv.getY(index)] });
        }
        quads.push({ vertices, indices: Array.from(geometry.index.array.subarray(face * 6, face * 6 + 6), i => i - face * 4) });
    }
    return quads;
}

function mesh(f) {
    const result = [];
    for (const chunk of f.chunks.values()) {
        const geometry = buildChunkGeometry(chunk, f.world, { terrain: true, plants: false });
        result.push(...waterQuads(geometry, chunk));
        geometry?.dispose();
    }
    return result;
}
const topAt = (quads, x, y, z) => quads.find(q => q.vertices.every(v => v.flag === 255 && v.y >= y && v.y <= y + 1)
    && Math.min(...q.vertices.map(v => v.x)) === x && Math.min(...q.vertices.map(v => v.z)) === z);

function meshHeight(quad, x, z) {
    const v = quad.vertices;
    for (let i = 0; i < 6; i += 3) {
        const a = v[quad.indices[i]], b = v[quad.indices[i + 1]], c = v[quad.indices[i + 2]];
        const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det;
        const w = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
        if (u >= -1e-8 && w >= -1e-8 && u + w <= 1 + 1e-8) return u * a.y + w * b.y + (1 - u - w) * c.y;
    }
    throw new Error('Point outside top triangles');
}

function verifyTop(f, quad, x, y, z) {
    check(!!quad, `Top exists at ${x},${y},${z}`);
    for (const [fx, fz] of [[0, 0], [1, 0], [0, 1], [1, 1], [.5, .5], [.2, .3], [.8, .7], [.1, .8]]) {
        f.world.reads = 0;
        near(waterSurfaceHeight(f.world, x, y, z, fx, fz) + y, meshHeight(quad, x + fx, z + fz), 'Shared helper matches actual triangle');
        check(f.world.reads <= 18, 'Surface query has at most 18 block reads');
    }
    for (const vertex of quad.vertices) {
        near(Math.hypot(...vertex.normal), 1, 'Unit surface normal');
        check(vertex.normal[1] > 0 && vertex.normal.every(Number.isFinite), 'Surface normal points upward');
    }
    for (let i = 0; i < 6; i += 3) {
        const [a, b, c] = quad.indices.slice(i, i + 3).map(index => quad.vertices[index]);
        const upward = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
        check(upward > 0, 'Both triangles retain upward winding');
    }
}

// Every stored level has the right isolated thickness, including falling water.
for (let level = 0; level <= 8; level++) {
    const f = fixture(), id = waterIdForLevel(level);
    f.set(4, 5, 4, id);
    const quads = mesh(f), top = topAt(quads, 4, 5, 4);
    equal(quads.length, 6, `Level ${level}: six exposed faces`);
    verifyTop(f, top, 4, 5, 4);
    for (const vertex of top.vertices) {
        near(vertex.y, 5 + getWaterBaseHeight(id), `Level ${level}: actual height`);
        equal(vertex.wave === 0, level === 8, 'Falling joins are fixed; exposed levels wave');
    }
    // Vertical exposed faces close exactly onto the top, with matching waves.
    for (const quad of quads.filter(q => q.vertices[0].flag === 128)) {
        for (const vertex of quad.vertices.filter(v => v.y > 5)) {
            const match = top.vertices.find(v => v.x === vertex.x && v.z === vertex.z);
            equal([vertex.y, vertex.wave], [match.y, match.wave], 'Top and side upper edges share position/wave');
        }
    }
}

// Padding above/below the world must not retain another mesh job's state.
for (const y of [H - 1, 0, H - 1]) {
    const f = fixture();
    f.set(0, y, 0, waterIdForLevel(4));
    const quads = mesh(f), top = topAt(quads, 0, y, 0);
    verifyTop(f, top, 0, y, 0);
    for (const vertex of top.vertices) near(vertex.y, y + WATER_SURFACE / 2, 'World-height boundary retains flow thickness');
    equal(quads.length, y === 0 ? 5 : 6, 'World floor suppresses only the bottom face');
}

// Four chunks meet at each tested corner, including negative coordinates.
for (const origin of [15, -1, -17]) {
    const f = fixture();
    const cells = [[0, 0, 1], [1, 0, 3], [0, 1, 5], [1, 1, 7]];
    for (const [dx, dz, level] of cells) f.set(origin + dx, 6, origin + dz, waterIdForLevel(level));
    const quads = mesh(f), shared = [];
    equal(quads.length, 16, 'Four neighboring water cells have no internal faces');
    for (const [dx, dz] of cells) {
        const x = origin + dx, z = origin + dz, top = topAt(quads, x, 6, z);
        verifyTop(f, top, x, 6, z);
        shared.push(top.vertices.find(v => v.x === origin + 1 && v.z === origin + 1));
    }
    for (const vertex of shared) equal([vertex.y, vertex.wave], [shared[0].y, shared[0].wave], 'Cross-chunk corner is byte-identical');
    near(shared[0].y, 6 + WATER_SURFACE / 2, 'Four flowing levels average at the shared corner');
}

// A source anchors aquatic vegetation; a waterfall/roof fills all shared corners.
for (const kind of ['water', 'water_lily', 'duckweed', 'water_milfoil', 'falling', 'stack', 'roof']) {
    const f = fixture();
    f.set(15, 5, 4, waterIdForLevel(7));
    f.set(16, 5, 4, kind === 'falling' ? WATER_FALLING_ID : ['stack', 'roof'].includes(kind) ? WATER_SOURCE_ID : getBlockId(kind));
    if (kind === 'stack') f.set(16, 6, 4, waterIdForLevel(2));
    if (kind === 'roof') f.set(16, 6, 4, getBlockId('stone'));
    const quads = mesh(f), top = topAt(quads, 15, 5, 4);
    verifyTop(f, top, 15, 5, 4);
    for (const vertex of top.vertices.filter(v => v.x === 16)) {
        const full = ['falling', 'stack', 'roof'].includes(kind);
        near(vertex.y, full ? 6 : 5 + WATER_SURFACE, `${kind}: source/full neighbor rule`);
        equal(vertex.wave, full ? 0 : 255, `${kind}: matching wave weight`);
    }
    check(!quads.some(q => q.vertices.every(v => v.x === 16 && v.flag === 128 && v.y >= 5 && v.y <= 6)), `${kind}: no face between canonical water kinds`);
}

// A genuinely nonplanar top proves interpolation is triangular, not bilinear.
const saddle = fixture();
for (let z = 3; z <= 5; z++) for (let x = 3; x <= 5; x++) {
    saddle.set(x, 5, z, waterIdForLevel(4));
}
saddle.set(3, 5, 3, waterIdForLevel(1));
saddle.set(5, 5, 5, waterIdForLevel(2));
const saddleQuads = mesh(saddle), saddleTop = topAt(saddleQuads, 4, 5, 4);
verifyTop(saddle, saddleTop, 4, 5, 4);
const saddleHeights = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dz]) => meshHeight(saddleTop, 4 + dx, 4 + dz));
check(Math.abs(saddleHeights[0] + saddleHeights[3] - saddleHeights[1] - saddleHeights[2]) > .001, 'Fixture has a nonplanar top');

// Downhill texture direction appears outside rivers; generated river data wins.
const flow = fixture();
const flowChunk = flow.set(4, 5, 4, waterIdForLevel(3));
flow.set(3, 5, 4, WATER_SOURCE_ID);
let flowTop = topAt(mesh(flow), 4, 5, 4);
check(flowTop.vertices[0].uv[0] > .5 && Math.abs(flowTop.vertices[0].uv[1] - .5) < 1e-6, 'Dynamic current points down the +X slope');
const slope = WATER_SURFACE - getWaterBaseHeight(waterIdForLevel(3));
for (const vertex of flowTop.vertices) {
    near(vertex.normal[0], slope / Math.hypot(slope, 1), 'Planar slope has its geometric X normal');
    near(vertex.normal[1], 1 / Math.hypot(slope, 1), 'Planar slope has its geometric Y normal');
    near(vertex.normal[2], 0, 'Planar slope has no false Z normal');
}
const originalTopology = flowTop.indices;
for (let i = 0; i < flowChunk.skyLight.length; i++) flowChunk.skyLight[i] = (i * 17 + (i >> 4)) % 16;
flowTop = topAt(mesh(flow), 4, 5, 4);
equal(flowTop.indices, originalTopology, 'Changing lighting cannot change water topology');
flowChunk.flow = new Int8Array(S * S * 2);
flowChunk.flow[(4 * S + 4) * 2] = -16;
flowChunk.flow[(4 * S + 4) * 2 + 1] = 24;
flowTop = topAt(mesh(flow), 4, 5, 4);
for (const vertex of flowTop.vertices) {
    near(vertex.uv[0], .5 + WATER_FLOW_UV * -16 / 127, 'River X current unchanged');
    near(vertex.uv[1], .5 + WATER_FLOW_UV * 24 / 127, 'River Z current unchanged');
}

// Interleaved jobs must retain different padded flow levels, not only liquid12.
const source = fixture();
const sourceChunk = source.set(4, 5, 4, WATER_SOURCE_ID);
const expected = buildChunkGeometry(flowChunk, flow.world);
const other = buildChunkGeometry(sourceChunk, source.world);
const jobs = [createChunkGeometryJob(flowChunk, flow.world), createChunkGeometryJob(sourceChunk, source.world)];
const nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
let clock = 0, slices = 0, results = [];
Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
try {
    do {
        results = jobs.map(job => job.step(clock + 3));
        if (slices++ === 4) buildChunkGeometry(saddle.chunks.values().next().value, saddle.world)?.dispose();
    } while (results.some(result => !result.done) && slices < 5000);
} finally {
    if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor);
    else delete performance.now;
}
check(slices > 4 && slices < 5000, 'Water geometry yields and resumes');
for (let i = 0; i < 2; i++) {
    const reference = i ? other : expected;
    equal(results[i].geometry.index.array, reference.index.array, 'Interleaved water topology');
    equal(Object.keys(results[i].geometry.attributes), Object.keys(reference.attributes), 'No additional dense water attribute');
    equal(Object.keys(reference.attributes).length, 10, 'Water retains the existing ten geometry attributes');
    for (const name of Object.keys(reference.attributes)) equal(results[i].geometry.attributes[name].array,
        reference.attributes[name].array, `Interleaved water ${name}`);
    results[i].geometry.dispose(); reference.dispose();
}

// Exercise shader installation against the real Three template. Browser CI
// separately compiles GLSL; these assertions cover sloped-surface metadata.
const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader,
    fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
waterMaterial.onBeforeCompile(shader, { capabilities: { isWebGL2: true } });
check(shader.vertexShader.includes('attribute vec2 plantMotion;'), 'Water declares packed wave/face data');
check(shader.vertexShader.includes('uWaveHeight * plantMotion.x'), 'Shallow water waves use explicit weights');
check(!shader.vertexShader.includes('fract(waterWorld.y)'), 'Waves do not depend on a flat .875 height');
check(shader.fragmentShader.includes('abs(vWaterFace) > 0.5'), 'Slopes keep top UV mapping independently of their normal');
equal(waterMaterial.defaultAttributeValues.plantMotion, [0, 1], 'Empty warmup geometry has valid water defaults');
source.world.reads = 0;
equal(waterSurfaceHeight(source.world, 2, 5, 2), 0, 'Dry central cell remains dry next to water');
equal(source.world.reads, 1, 'Dry queries stop after one block read');

console.log(`OK: geometria płynącej wody — ${checks} sprawdzeń wysokości, szwów, normalnych, UV i przeplatania.`);

if (process.argv.includes('--benchmark')) {
    // Constant-cost numeric source avoids fixture Map/string allocations.
    const grid = new Uint16Array(16 * 16 * 8);
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) grid[(5 * 16 + z) * 16 + x] = waterIdForLevel(1 + (x + z) % 7);
    const numericWorld = { getBlockId: (x, y, z) => grid[(y * 16 + z) * 16 + x] ?? 0 };
    const samples = [], iterations = 100000;
    let checksum = 0;
    for (let trial = 0; trial < 6; trial++) {
        const start = performance.now();
        for (let i = 0; i < iterations; i++) checksum += waterSurfaceHeight(numericWorld, 4 + (i & 7), 5, 4 + ((i >> 3) & 7), .3, .7);
        const ms = (performance.now() - start) / iterations;
        if (trial) samples.push(ms);
    }
    const dense = fixture();
    let denseChunk;
    for (let z = 0; z < S; z++) for (let x = 0; x < S; x++) denseChunk = dense.set(x, 5, z, waterIdForLevel(1 + (x + z) % 7));
    const meshSamples = [], denseSamples = [];
    for (let trial = 0; trial < 6; trial++) {
        const start = performance.now();
        for (let i = 0; i < 100; i++) buildChunkGeometry(flowChunk, flow.world)?.dispose();
        if (trial) meshSamples.push((performance.now() - start) / 100);
    }
    for (let trial = 0; trial < 6; trial++) {
        const start = performance.now();
        for (let i = 0; i < 100; i++) buildChunkGeometry(denseChunk, dense.world)?.dispose();
        if (trial) denseSamples.push((performance.now() - start) / 100);
    }
    const median = values => [...values].sort((a, b) => a - b)[values.length >> 1];
    const report = { checks, node: process.version, kind: 'CPU helper/mesher; not FPS or GPU timing',
        surfaceQuery: { iterationsPerTrial: iterations, samplesMs: samples, medianMs: median(samples), checksum, maximumBlockReads: 18 },
        sparseChunkMesh: { iterationsPerTrial: 100, samplesMs: meshSamples, medianMs: median(meshSamples) },
        denseFlowChunkMesh: { waterCells: S * S, iterationsPerTrial: 100, samplesMs: denseSamples, medianMs: median(denseSamples) },
        additionalPaddingBytesPerActiveMesher: (S + 2) ** 2 * (H + 2), additionalGeometryAttributes: 0 };
    const outputIndex = process.argv.indexOf('--output');
    if (outputIndex >= 0) {
        const path = process.argv[outputIndex + 1];
        assert.ok(path, '--output requires a path');
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    }
    console.log(JSON.stringify(report, null, 2));
}
