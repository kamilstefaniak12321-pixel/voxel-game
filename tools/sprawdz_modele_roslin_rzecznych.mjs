// Real chunk mesher + generated geometry; only the browser texture loader is
// replaced. Verify water continuity and bounded, finite plant geometry.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

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

const { getRiverPlantFaces } = await import('../src/rendering/RiverPlantGeometry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { plantMaterial } = await import('../src/rendering/BlockRenderData.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { WATER_SURFACE } = await import('../src/config.js');
const kinds = ['sedge', 'cattail', 'loosestrife', 'milfoil', 'lily', 'duckweed'];
const counts = {};

for (const kind of kinds) {
    for (let variant = 0; variant < 8; variant++) {
        const waterlogged = ['milfoil', 'lily', 'duckweed', 'cattail'].includes(kind);
        const faces = getRiverPlantFaces(kind, variant, waterlogged);
        assert.equal(getRiverPlantFaces(kind, variant + 8, waterlogged), faces, 'Templates must be cached and stable');
        assert.ok(faces.length > 0 && faces.length <= 50, `${kind}: too many faces (${faces.length})`);
        counts[kind] = Math.max(counts[kind] ?? 0, faces.length);
        let roots = 0;
        for (const face of faces) {
            assert.ok(Math.abs(Math.hypot(...face.normal) - 1) < 1e-7, `${kind}: invalid normal`);
            assert.equal(face.vertices.length, 4);
            for (let i = 0; i < 4; i++) {
                const [x, y, z] = face.vertices[i];
                assert.ok([x, y, z, ...face.color, face.weights[i], face.movement].every(Number.isFinite));
                assert.ok(Math.hypot(x, z) <= 0.55 && y >= 0 && y <= 1.95, `${kind}: bounds`);
                if (y === 0) { assert.equal(face.weights[i], 0, 'Roots must not sway'); roots++; }
                if (kind === 'milfoil') { assert.ok(y < WATER_SURFACE); assert.equal(face.movement, 128); }
                if (kind === 'lily' || kind === 'duckweed') {
                    assert.ok(y > WATER_SURFACE, 'Floating leaves must remain above water');
                    assert.equal(face.movement, 255); assert.equal(face.weights[i], 255);
                }
            }
        }
        if (!['lily', 'duckweed'].includes(kind)) assert.ok(roots > 0);
    }
}

const aquatic = ['water_milfoil', 'water_lily', 'duckweed', 'cattail_water'];
const water = getBlockId('water');
function fixture() {
    const chunk = new Chunk(0, 0);
    chunk.skyLight.fill(15);
    chunk.flow = new Int8Array(16 * 16 * 2).fill(12);
    return { chunk, world: { getChunk: (cx, cz) => cx === 0 && cz === 0 ? chunk : null } };
}
function groupData(geometry, materialIndex, attribute) {
    const group = geometry.groups.find((entry) => entry.materialIndex === materialIndex);
    if (!group) return [];
    const data = geometry.getAttribute(attribute);
    return Array.from(data.array.slice(group.start / 6 * 4 * data.itemSize, (group.start + group.count) / 6 * 4 * data.itemSize));
}

for (const species of aquatic) {
    const { chunk, world } = fixture();
    chunk.setId(5, 5, 5, water);
    chunk.setId(6, 5, 5, water);
    const before = buildChunkGeometry(chunk, world);
    chunk.setId(5, 5, 5, getBlockId(species));
    const after = buildChunkGeometry(chunk, world);
    assert.ok(after.groups[1].count > 0, `${species}: missing foliage`);
    // Identical water geometry, UV flow and light despite changing its owner
    // block ID. In particular, no interior wall next to ordinary water.
    for (const attribute of ['position', 'normal', 'uv', 'color', 'atmosphereLight']) {
        assert.deepEqual(groupData(after, 2, attribute), groupData(before, 2, attribute), `${species}: changed water ${attribute}`);
    }
    assert.equal(after.groups.find((g) => g.materialIndex === 2).count, 10 * 6);
    assert.ok(groupData(after, 2, 'plantMotion').every((value) => value === 0), 'Water must not inherit stale plant motion');
    before.dispose(); after.dispose();
}

// Boundary culling must canonicalize a different species in the neighbouring
// chunk, including the top face of water below a floating plant.
{
    const { chunk, world } = fixture();
    const neighbor = new Chunk(1, 0); neighbor.skyLight.fill(15);
    world.getChunk = (cx, cz) => cz === 0 ? cx === 0 ? chunk : cx === 1 ? neighbor : null : null;
    chunk.setId(15, 5, 5, getBlockId('water_lily'));
    neighbor.setId(0, 5, 5, getBlockId('duckweed'));
    chunk.setId(15, 4, 5, water);
    const geometry = buildChunkGeometry(chunk, world);
    assert.equal(geometry.groups.find((g) => g.materialIndex === 2).count, 9 * 6);
    geometry.dispose();
}

// Reused scratch buffers must not leak river colours or animation into the
// next rebuilt chunk; conventional crossed plants retain anchored roots.
{
    const { chunk, world } = fixture();
    chunk.setId(4, 4, 4, getBlockId('stone'));
    const geometry = buildChunkGeometry(chunk, world);
    assert.ok(Array.from(geometry.getAttribute('plantMotion').array).every((v) => v === 0));
    const tint = geometry.getAttribute('tint').array;
    for (let i = 3; i < tint.length; i += 4) assert.equal(tint[i], 255);
    geometry.dispose();

    chunk.setId(4, 4, 4, getBlockId('short_grass'));
    const grass = buildChunkGeometry(chunk, world);
    const positions = groupData(grass, 1, 'position');
    const motion = groupData(grass, 1, 'plantMotion');
    let tips = 0, roots = 0;
    for (let i = 0; i < positions.length / 3; i++) {
        if (positions[i * 3 + 1] === 4) { assert.equal(motion[i * 2], 0); roots++; }
        else { assert.equal(motion[i * 2], 255); tips++; }
        assert.equal(motion[i * 2 + 1], 0);
    }
    assert.ok(tips > 0 && roots > 0, 'Conventional grass must retain wind at tips only');
    grass.dispose();
}
assert.deepEqual(plantMaterial.defaultAttributeValues.plantMotion, [0, 0]);
console.log(`OK: river models: ${JSON.stringify(counts)} quads max; 48 cached variants, roots/normals/bounds, water/flow continuity and chunk boundary culling.`);
