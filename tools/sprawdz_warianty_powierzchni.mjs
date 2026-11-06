import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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
                const tiles=new Map();
                export function getAtlasUV(name) {
                    if(!tiles.has(name))tiles.set(name,tiles.size);
                    const n=tiles.get(name);return {uMin:n,uMax:n+.75,vMin:0,vMax:.75};
                }
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getAtlasUV } = await import('../src/rendering/TextureAtlas.js');
const { PINE_UPPER_ID, PINE_TRANSITION_TEXTURES, MOSS_CARPET_TEXTURES,
    pineBarkTransitionStage, mossCarpetVariant } = await import('../src/rendering/SurfaceTextureVariants.js');
const { buildChunkGeometry, createChunkGeometryJob } = await import('../src/rendering/ChunkMesher.js');
let checks = 0;
const equal = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const ids = name => getBlockId(name);
const layer = 16 * 16;

function fixture(cx = 0, cz = 0) {
    const chunk = new Chunk(cx, cz);
    chunk.skyLight.fill(15);
    const world = { getChunk: (x, z) => x === cx && z === cz ? chunk : null,
        experiments: { bushyGrass: false } };
    return { chunk, world };
}
function faceUV(geometry, center, normal) {
    const p = geometry.attributes.position.array, n = geometry.attributes.normal.array;
    for (let i = 0; i < geometry.attributes.position.count; i += 4) {
        if (!normal.every((v, k) => n[i * 3 + k] === v)) continue;
        if (!center.every((v, k) => Math.abs(v - (p[i * 3 + k] + p[(i + 1) * 3 + k]
            + p[(i + 2) * 3 + k] + p[(i + 3) * 3 + k]) / 4) < 1e-5)) continue;
        return Array.from(geometry.attributes.uv.array.slice(i * 2, (i + 4) * 2));
    }
    assert.fail(`Missing face at ${center}, normal ${normal}`);
}
function hasTile(uv, name, label) {
    const tile = getAtlasUV(name);
    check(uv.every((v, i) => i % 2 ? v === tile.vMin || v === tile.vMax : v === tile.uMin || v === tile.uMax), label);
}
function sameGeometry(a, b, label) {
    equal(a.groups, b.groups, `${label}: groups`);
    equal(a.index.array, b.index.array, `${label}: indices`);
    for (const name of Object.keys(a.attributes)) equal(a.attributes[name].array, b.attributes[name].array, `${label}: ${name}`);
}

// Exact 3-block authored progression; gaps, stripping and unrelated trees stop
// it. Neither selecting a variant nor building it changes the stored block ID.
for (const lower of ['pine_log', 'pine_log_resin']) {
    for (const [cx, cz, x, z] of [[0, 0, 0, 0], [-3, 7, 15, 15]]) {
        const { chunk, world } = fixture(cx, cz);
        chunk.setId(x, 4, z, ids(lower));
        for (let y = 5; y <= 8; y++) chunk.setId(x, y, z, PINE_UPPER_ID);
        const before = chunk.blocks.slice();
        const geometry = buildChunkGeometry(chunk, world);
        for (let y = 5; y <= 8; y++) {
            const stage = pineBarkTransitionStage(chunk.blocks, y * layer + z * 16 + x, y, layer);
            equal(stage, y === 8 ? 0 : y - 4, `${lower} stage at chunk ${cx}/${cz}, y=${y}`);
            const texture = stage ? PINE_TRANSITION_TEXTURES[stage - 1] : 'pine_log_upper_side';
            for (const [center, normal] of [
                [[x + 1, y + .5, z + .5], [1, 0, 0]], [[x, y + .5, z + .5], [-1, 0, 0]],
                [[x + .5, y + .5, z + 1], [0, 0, 1]], [[x + .5, y + .5, z], [0, 0, -1]]
            ]) hasTile(faceUV(geometry, center, normal), texture, 'Every side uses the same vertical bark stage');
        }
        hasTile(faceUV(geometry, [x + .5, 9, z + .5], [0, 1, 0]), 'pine_log_top', 'Top end-grain stays unchanged');
        equal(chunk.blocks, before, 'Meshing leaves save-compatible IDs unchanged');
        geometry.dispose();
        for (const replacement of ['pine_log_stripped', 'oak_log', 'air']) {
            chunk.setId(x, 4, z, ids(replacement));
            const after = buildChunkGeometry(chunk, world);
            for (let y = 5; y <= 7; y++) hasTile(faceUV(after, [x + 1, y + .5, z + .5], [1, 0, 0]),
                'pine_log_upper_side', 'Removing or stripping the connection refreshes all affected upper logs');
            after.dispose();
        }
        // No negative-index read at the bottom of the world.
        chunk.setId(x, 0, z, PINE_UPPER_ID);
        equal(pineBarkTransitionStage(chunk.blocks, z * 16 + x, 0, layer), 0, 'World bottom has no bark below it');
    }
}

const seen = new Set();
const full = fixture(-2, 3), other = fixture(7, -4);
for (const { chunk } of [full, other]) {
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        chunk.setId(x, 4, z, ids('dirt'));
        chunk.setId(x, 5, z, ids('moss_carpet'));
    }
    chunk.setId(4, 6, 4, ids('pine_log'));
    for (let y = 7; y <= 10; y++) chunk.setId(4, y, 4, PINE_UPPER_ID);
}
const fullGeometry = buildChunkGeometry(full.chunk, full.world);
for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const variant = mossCarpetVariant(full.chunk.cx * 16 + x, 5, full.chunk.cz * 16 + z);
    seen.add(variant);
    hasTile(faceUV(fullGeometry, [x + .5, 5.03, z + .5], [0, 1, 0]),
        MOSS_CARPET_TEXTURES[variant], 'Moss mesh selects authored variant from world coordinates');
}
equal([...seen].sort(), [0, 1, 2], 'All three moss patterns occur');
const rebuilt = buildChunkGeometry(full.chunk, full.world);
sameGeometry(rebuilt, fullGeometry, 'Rebuilding preserves moss patterns and rotation');
rebuilt.dispose();

// Interleaving budgeted jobs cannot share per-chunk pattern state.
const otherGeometry = buildChunkGeometry(other.chunk, other.world);
const jobOptions = { terrain: true, plants: true, legacyGroups: true };
const jobs = [createChunkGeometryJob(full.chunk, full.world, jobOptions), createChunkGeometryJob(other.chunk, other.world, jobOptions)];
const results = [null, null];
let clock = 0, slices = 0;
const oldNow = Object.getOwnPropertyDescriptor(performance, 'now');
Object.defineProperty(performance, 'now', { configurable: true, value: () => ++clock });
try {
    do {
        for (let i = 0; i < jobs.length; i++) if (!results[i]?.done) results[i] = jobs[i].step(clock + 19);
    } while (!results.every(result => result?.done) && ++slices < 3000);
} finally {
    if (oldNow) Object.defineProperty(performance, 'now', oldNow); else delete performance.now;
}
check(results.every(result => result?.done), 'Budgeted geometry jobs complete');
sameGeometry(results[0].geometry, fullGeometry, 'First interleaved geometry');
sameGeometry(results[1].geometry, otherGeometry, 'Second interleaved geometry');
for (const geometry of [fullGeometry, otherGeometry, ...results.map(result => result.geometry)]) geometry.dispose();
console.log(`OK: warianty powierzchni — ${checks} kontroli kory sosny, mchu, zapisu i meshera partiami.`);
