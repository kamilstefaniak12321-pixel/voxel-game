// Repeatable transport microbenchmark. VOXEL_FOREST_BASELINE=1 loads only
// Light/Chunk from main 0.85.0; all fixtures and timing boundaries are identical.
import { registerHooks } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const baseline = process.env.VOXEL_FOREST_BASELINE === '1';
const reference = process.env.VOXEL_FOREST_REFERENCE === '1';
registerHooks({
    resolve(s, c, next) { return next(s === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : s, c); },
    load(url, c, next) {
        const referenceName = ['CanopyLighting', 'FarCanopy'].find(name => url.endsWith(`/${name}.js`));
        if (reference && referenceName) return { format: 'module', shortCircuit: true,
            source: readFileSync(new URL(`../test-results/canopy-reference/${referenceName}.js`, import.meta.url), 'utf8') };
        const file = ['Light', 'Chunk', 'farVegetation'].find(name => url.endsWith(`/src/world/${name}.js`));
        if (baseline && file) return { format: 'module', shortCircuit: true,
            source: execFileSync('git', ['show', `6828676:src/world/${file}.js`], { encoding: 'utf8' }) };
        if (baseline && url.endsWith('/src/rendering/ChunkMesher.js')) return { format: 'module', shortCircuit: true,
            source: execFileSync('git', ['show', '6828676:src/rendering/ChunkMesher.js'], { encoding: 'utf8' }) };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>({r:.2,g:.4,b:.1});
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url, url.endsWith('.js') ? { ...c, format: 'module' } : c);
    }
});
const { Chunk } = await import('../src/world/Chunk.js');
const { LightEngine } = await import('../src/world/Light.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry, setLeafParts } = await import('../src/rendering/ChunkMesher.js');
setLeafParts(true);
const stats = values => {
    values.sort((a, b) => a - b);
    return { medianMs: values[Math.floor(values.length / 2)], p95Ms: values[Math.floor(values.length * .95)] };
};
const digest = arrays => {
    const hash = createHash('sha256');
    for (const [name, array] of arrays) hash.update(name).update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    return hash.digest('hex');
};
const scenarios = [];
for (const leafLayers of [0, 6]) {
    const init = [], edit = [], meshing = [];
    let vertices = 0, canopyBytes = 0, geometrySha256;
    for (let run = 0; run < 14; run++) {
        const chunks = new Map();
        const world = { getChunk: (x, z) => chunks.get(`${x},${z}`), experiments: {}, getGrassDetail: () => 0 };
        for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
            const chunk = new Chunk(x, z); chunks.set(`${x},${z}`, chunk); chunk.maxY = 80;
            chunk.blockCount = 256 * (1 + leafLayers);
            for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
                chunk.blocks[chunk.index(lx, 20, lz)] = getBlockId('stone');
                for (let y = 72; y < 72 + leafLayers; y++) chunk.blocks[chunk.index(lx, y, lz)] = getBlockId('maple_leaves');
            }
        }
        for (const chunk of chunks.values()) {
            chunk.west = world.getChunk(chunk.cx - 1, chunk.cz) ?? null; chunk.east = world.getChunk(chunk.cx + 1, chunk.cz) ?? null;
            chunk.north = world.getChunk(chunk.cx, chunk.cz - 1) ?? null; chunk.south = world.getChunk(chunk.cx, chunk.cz + 1) ?? null;
        }
        const light = new LightEngine(world), start = performance.now();
        for (const chunk of chunks.values()) light.initChunk(chunk);
        const initMs = (performance.now() - start) / chunks.size;
        const chunk = world.getChunk(1, 1), at = chunk.index(0, 65, 0), editStart = performance.now();
        for (let i = 0; i < 40; i++) {
            chunk.blocks[at] = i % 2 ? 0 : getBlockId('stone'); light.blockChanged(chunk, at);
        }
        const editMs = (performance.now() - editStart) / 40, meshStart = performance.now();
        const geometry = buildChunkGeometry(chunk, world);
        const meshMs = performance.now() - meshStart;
        vertices = geometry.getAttribute('position').count;
        canopyBytes = geometry.getAttribute('canopyTint')?.array.byteLength ?? 0;
        if (run === 13) geometrySha256 = digest([...Object.entries(geometry.attributes).map(([name, value]) => [name, value.array]), ['index', geometry.index.array]]);
        geometry.dispose();
        if (run >= 4) { init.push(initMs); edit.push(editMs); meshing.push(meshMs); }
    }
    scenarios.push({ leafLayers, initPerChunk: stats(init), singleRoofEdit: stats(edit), meshPerChunk: stats(meshing), vertices, canopyBytes, geometrySha256 });
}
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { createFarVegetationJob, appendFarVegetation } = await import('../src/world/farVegetation.js');
const { sampleFarTile, meshFarTile, createMeshScratch, KINDS } = await import('../src/world/farSamples.js');
const { SURFACE_MATERIAL_COUNT } = await import('../src/rendering/SurfaceMaterials.js');
const generator = new RealisticGenerator('test'), cells = 32, spacing = 2, x0 = -320, z0 = -128, width = cells + 2;
const heights = new Int16Array(width * width), kinds = new Uint8Array(width * width), materials = new Uint16Array(width * width);
sampleFarTile(generator, x0, z0, spacing, cells, heights, kinds, 0, width, materials, true);
const vegetation = createFarVegetationJob(generator, x0, z0, cells * spacing, spacing, heights, kinds, cells).step().data;
const palette = new Uint8Array(KINDS.length * 9).fill(160), albedo = new Uint8Array(SURFACE_MATERIAL_COUNT * 18).fill(160);
const base = meshFarTile(heights, kinds, cells, spacing, palette, createMeshScratch(cells), materials, albedo), append = [];
let farVertices = 0, farGeometrySha256;
for (let run = 0; run < 14; run++) {
    const start = performance.now(), mesh = appendFarVegetation(base, vegetation, x0, z0, palette, albedo);
    if (run >= 4) append.push(performance.now() - start);
    farVertices = mesh.positions.length / 4;
    if (run === 13) farGeometrySha256 = digest(Object.entries(mesh).filter(([, value]) => ArrayBuffer.isView(value)));
}
console.log(JSON.stringify({ baseline, reference, node: process.version, skySourceBytesPerChunk: baseline ? 0 : 32768, scenarios,
    farTile: { vertices: farVertices, boxes: vegetation.length / 12, append: stats(append), additionalGpuBytes: 0, geometrySha256: farGeometrySha256 } }, null, 2));
