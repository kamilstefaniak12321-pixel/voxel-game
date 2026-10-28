// Prawdziwe próbkowanie, mesher, worker i palety dalekiego terenu.
// Tylko odczyt bitmap atlasu jest zastąpiony znanymi liniowymi kolorami.
// Uruchomienie: node tools/sprawdz_materialy_far.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize:16, mipmaps:false });
                export const atlasAveragesReady = Promise.resolve();
                export function getAtlasAverage(name) {
                    if (!name) return null;
                    const code = [...name].reduce((sum,c) => sum + c.charCodeAt(0), 0);
                    return new Color(.1+(code%7)/20, .1+(code%11)/30, .1+(code%13)/40);
                }
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { BLOCK_TYPES, MAX_BLOCK_ID, getBlockId, getBlockDefinition } = await import('../src/blocks/BlockRegistry.js');
const { TREE_PACKS } = await import('../src/blocks/treePacks.js');
const { SURFACE_FACE_NAMES, SURFACE_TINT_TYPES, SURFACE_MATERIAL_COUNT,
    getSurfaceFaceTexture, surfaceMaterialId, surfaceMaterialType } = await import('../src/rendering/SurfaceMaterials.js');
const { KINDS, kindIndex, sampleFarTile, meshFarTile, createMeshScratch } = await import('../src/world/farSamples.js');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { LightLabGenerator } = await import('../src/world/terrain/LightLabGenerator.js');
const { getAtlasAverage } = await import('../src/rendering/TextureAtlas.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');

// Rejestr i paczki nie zmieniają ID; odcienie istnieją tylko w buforze Uint16.
for (const [type, definition] of Object.entries(BLOCK_TYPES)) {
    assert.ok(definition.id <= MAX_BLOCK_ID);
    assert.equal(surfaceMaterialId(type), definition.id);
    assert.equal(surfaceMaterialType(definition.id), type);
}
for (const pack of TREE_PACKS) {
    assert.ok(surfaceMaterialId(`${pack.id}_leaves`) > 0, `Paczka ${pack.id}`);
}
for (const [index, type] of SURFACE_TINT_TYPES.entries()) {
    const id = surfaceMaterialId(type);
    assert.equal(id, MAX_BLOCK_ID + 1 + index);
    assert.equal(new Uint16Array([id])[0], id);
    assert.equal(surfaceMaterialType(id), type);
}
assert.equal(surfaceMaterialId('rock'), getBlockId('stone'));
assert.equal(surfaceMaterialId('unknown'), 0);
assert.equal(surfaceMaterialType(SURFACE_MATERIAL_COUNT), null);
const textures = { top:'up', side:'side', bottom:'down', front:'front' };
assert.deepEqual(SURFACE_FACE_NAMES.map(face => getSurfaceFaceTexture(textures, face)),
    ['side', 'side', 'up', 'down', 'front', 'side']);

const palette = Uint8Array.from({ length:KINDS.length * 9 }, (_, i) => (i * 13 + 27) % 256);
const albedoPalette = Uint8Array.from({ length:SURFACE_MATERIAL_COUNT * 18 }, (_, i) => (i * 11 + 37) % 256);
const buffers = cells => {
    const size = (cells + 2) ** 2;
    return { heights:new Int16Array(size), kinds:new Uint8Array(size), materialIds:new Uint16Array(size) };
};
const sample = (generator, cells, x0 = 0, z0 = 0, spacing = 1) => {
    const raw = buffers(cells);
    sampleFarTile(generator, x0, z0, spacing, cells, raw.heights, raw.kinds, 0, cells + 2, raw.materialIds);
    return raw;
};
const mesh = (raw, cells, spacing = 1) => meshFarTile(raw.heights, raw.kinds, cells, spacing,
    palette, createMeshScratch(cells), raw.materialIds, albedoPalette);
const lab = new LightLabGenerator('surface-regression');
const raw = sample(lab, 8, -29, -31);
const rows = buffers(8);
for (let row = 0; row < 10; row++) {
    sampleFarTile(lab, -29, -31, 1, 8, rows.heights, rows.kinds, row, row + 1, rows.materialIds);
}
assert.deepEqual(rows, raw, 'Próbkowanie w kawałkach jest identyczne z całym kafelkiem');
assert.equal(lab.farSurface(-27, -29).material, 'lime_plaster');
assert.equal(lab.farSurface(-27, -29).kind, 'rock', 'Klasyczny rodzaj laboratorium pozostaje bez zmian');
const tint = sample({ farSurface:() => ({top:20, kind:'grass_high'}) }, 1);
assert.equal(tint.materialIds[4], MAX_BLOCK_ID + 3, 'Sampler nie zawija ID trawy do Uint8');

// Każda z pięciu widocznych ścian bierze odpowiednią teksturę, również dół boku.
const column = sample({ farSurface:() => ({top:20, kind:'rock', material:'oak_log'}) }, 1);
const columnMesh = mesh(column, 1);
const faces = new Set();
for (let offset = 0; offset < columnMesh.positions.length; offset += 4) {
    const n = columnMesh.normals.subarray(offset, offset + 3);
    const face = n[0] === 127 ? 0 : n[0] === -127 ? 1 : n[1] === 127 ? 2 : n[2] === 127 ? 4 : 5;
    faces.add(face);
    const start = getBlockId('oak_log') * 18 + face * 3;
    assert.deepEqual(columnMesh.surfaceAlbedo.subarray(offset, offset + 3), albedoPalette.subarray(start, start + 3));
}
assert.deepEqual([...faces].sort(), [0, 1, 2, 4, 5]);

// Równa wysokość i klasyczny rodzaj nie scalają dwóch różnych materiałów.
const mixed = sample({ farSurface:x => ({top:20, kind:'rock', material:x % 2 ? 'terracotta' : 'lime_plaster'}) }, 2);
const mixedMesh = mesh(mixed, 2);
let tops = 0;
for (let offset = 0; offset < mixedMesh.normals.length; offset += 16) {
    if (mixedMesh.normals[offset + 1] === 127) tops++;
}
assert.equal(tops, 2);

// Znane hashe czterech dotychczasowych buforów z e05f0e0 (0.23.1).
// Fixture obejmuje wszystkie klasyczne rodzaje, wodę, boki i kurtyny.
const classicHashes = new Map([
    [1, '1463456670733558bad69de33693a635852429d6f0e5d39925a10bf13f2c8bad'],
    [4, '6ab69a3687631bea890f42bc912c227c1655fb038e68d51c568a93ae5ca0b983'],
    [16, '2939d3914b181bbfd9e1feee336b4d2e355c6f9912cfdfb576629c9c2b54098d']
]);
for (const [spacing, expected] of classicHashes) {
    const fixture = buffers(32);
    for (let i = 0; i < fixture.heights.length; i++) {
        fixture.heights[i] = 20 + Math.floor(i / 7) % 5;
        fixture.kinds[i] = Math.floor(i / 3) % KINDS.length;
        fixture.materialIds[i] = surfaceMaterialId(KINDS[fixture.kinds[i]]);
    }
    const result = mesh(fixture, 32, spacing);
    const hash = createHash('sha256').update(result.positions).update(result.normals)
        .update(result.colors).update(result.indices).digest('hex');
    assert.equal(hash, expected, `Klasyczne bufory i markery, spacing=${spacing}`);
}

// Prawdziwy worker używa tych samych materiałów i przenosi dodatkowe bufory.
const messages = [];
globalThis.self = { postMessage:(message, transfer) => messages.push({message, transfer}) };
await import('../src/world/FarTerrainWorker.js');
self.onmessage({data:{type:'init', terrain:'light-lab', seed:'surface-regression'}});
self.onmessage({data:{type:'palette', colors:palette, albedo:albedoPalette}});
self.onmessage({data:{type:'tile', id:1, x0:-29, z0:-31, spacing:1, cells:8}});
const worker = messages.at(-1);
for (const key of ['heights', 'kinds', 'materialIds']) assert.deepEqual(worker.message[key], raw[key]);
assert.deepEqual(worker.message.mesh, mesh(raw, 8));
assert.ok(worker.transfer.includes(worker.message.materialIds.buffer));
assert.ok(worker.transfer.includes(worker.message.mesh.surfaceAlbedo.buffer));
delete globalThis.self;

// Palety właściwego FarTerrain: średnia atlasu bez cienia korony i dołu boku.
const terrain = Object.assign(Object.create(FarTerrain.prototype), {
    workers:[], rebuildAll() {}, world:{savedChunks:new Map(), chunks:new Map()}
});
terrain.prepareColors();
const encode = color => Uint8Array.from(color.toArray(), value => Math.round(Math.sqrt(value) * 255));
for (const type of ['oak_leaves', 'lime_plaster', 'terracotta', 'grass', 'oak_log', 'sandstone']) {
    for (const [face, name] of SURFACE_FACE_NAMES.entries()) {
        const texture = getSurfaceFaceTexture(getBlockDefinition(type).textures, name);
        const start = surfaceMaterialId(type) * 18 + face * 3;
        assert.deepEqual(terrain.surfaceAlbedoPalette.subarray(start, start + 3), encode(getAtlasAverage(texture)));
    }
}

// Zmodyfikowany chunk i ścieżka bez workera zachowują materiał budowli.
const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT);
blocks.fill(getBlockId('terracotta'), 0, CHUNK_SIZE * CHUNK_SIZE * 17);
terrain.world.savedChunks.set('0,0', blocks);
const source = sample({farSurface:() => ({top:17, kind:'grass'})}, 2);
const sourceCopy = structuredClone(source);
const tile = {x0:0, z0:0, spacing:1, cells:2, size:2, raw:source};
terrain.buildMesh(tile);
assert.deepEqual(source, sourceCopy, 'Nakładanie zmian gracza nie mutuje próbek generatora');
const offset = getBlockId('terracotta') * 18 + 2 * 3;
assert.deepEqual(tile.mesh.geometry.getAttribute('surfaceAlbedo').array.subarray(0, 3),
    terrain.surfaceAlbedoPalette.subarray(offset, offset + 3));
assert.equal(terrain.modifiedSurface(0, 0, terrain.world.savedChunks).material, 'terracotta');
tile.mesh.geometry.dispose();

console.log('OK: materiały far, 5 ścian, ID paczek/odcieni, laboratorium, worker/main, klasyczne bufory, zmienione chunki.');
