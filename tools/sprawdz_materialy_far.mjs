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
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
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
const { TREE_DEFINITIONS } = await import('../src/blocks/treeCatalog.js');
const { SURFACE_FACE_NAMES, SURFACE_TINT_TYPES, SURFACE_MATERIAL_COUNT,
    getSurfaceFaceTexture, surfaceMaterialId, surfaceMaterialType } = await import('../src/rendering/SurfaceMaterials.js');
const { KINDS, kindIndex, sampleFarTile, meshFarTile, createMeshScratch } = await import('../src/world/farSamples.js');
const { FarTerrain, TARGET_DETAIL_DISTANCE } = await import('../src/world/FarTerrain.js');
const { TestSiteGenerator } = await import('../src/world/terrain/TestSiteGenerator.js');
const { getAtlasAverage } = await import('../src/rendering/TextureAtlas.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const THREE = await import('three');
const { chunkMaskData, chunkMaskUniforms, viewUniforms } = await import('../src/rendering/viewUniforms.js');
assert.equal(viewUniforms.uFarTextureBlend.value, 1, 'Domyślny wygląd zwykłej gry zachowuje mieszanie tekstur');

// Rejestr i paczki nie zmieniają ID; odcienie istnieją tylko w buforze Uint16.
for (const [type, definition] of Object.entries(BLOCK_TYPES)) {
    assert.ok(definition.id <= MAX_BLOCK_ID);
    assert.equal(surfaceMaterialId(type), definition.id);
    assert.equal(surfaceMaterialType(definition.id), type);
}
for (const pack of TREE_DEFINITIONS) {
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
const lab = new TestSiteGenerator('surface-regression');
const raw = sample(lab, 8, -29, -31);
const rows = buffers(8);
for (let row = 0; row < 10; row++) {
    sampleFarTile(lab, -29, -31, 1, 8, rows.heights, rows.kinds, row, row + 1, rows.materialIds);
}
assert.deepEqual(rows, raw, 'Próbkowanie w kawałkach jest identyczne z całym kafelkiem');
assert.equal(lab.farSurface(-27, -29).material, 'lime_plaster');
assert.equal(lab.farSurface(-27, -29).kind, 'rock', 'Klasyczny rodzaj placu testowego pozostaje bez zmian');
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
    // W dawniej było niewykorzystanym zerem; teraz przenosi prawdziwy dół
    // ściany dla depth pass. XYZ i wszystkie stare bufory nadal są identyczne.
    const classicPositions = result.positions.slice();
    for (let i = 3; i < classicPositions.length; i += 4) classicPositions[i] = 0;
    const hash = createHash('sha256').update(classicPositions).update(result.normals)
        .update(result.colors).update(result.indices).digest('hex');
    assert.equal(hash, expected, `Klasyczne bufory i markery, spacing=${spacing}`);
}

// Prawdziwy worker używa tych samych materiałów i przenosi dodatkowe bufory.
const messages = [];
globalThis.self = { postMessage:(message, transfer) => messages.push({message, transfer}) };
await import('../src/world/FarTerrainWorker.js');
self.onmessage({data:{type:'init', terrain:'flat', seed:'surface-regression'}});
self.onmessage({data:{type:'palette', colors:palette, albedo:albedoPalette}});
self.onmessage({data:{type:'tile', id:1, x0:-29, z0:-31, spacing:1, cells:8}});
const worker = messages.at(-1);
for (const key of ['heights', 'kinds', 'materialIds']) assert.deepEqual(worker.message[key], raw[key]);
assert.deepEqual(worker.message.mesh, mesh(raw, 8));
assert.ok(worker.transfer.includes(worker.message.materialIds.buffer));
assert.ok(worker.transfer.includes(worker.message.mesh.surfaceAlbedo.buffer));
assert.ok(worker.transfer.includes(worker.message.mesh.shadowIndices.buffer), 'Worker musi przekazać indeks cieni');
delete globalThis.self;

// Palety właściwego FarTerrain: średnia atlasu bez cienia korony i dołu boku.
const terrain = Object.assign(Object.create(FarTerrain.prototype), {
    workers:[], rebuildAll() {}, world:{savedChunks:new Map(), chunks:new Map()},
    shown: new Set(), tiles: new Map(), requests: new Map(), scene: new THREE.Scene(),
    shadowRevision: 0, shadowSnapshots: new Set(), shadowResourcePool: [], shadowCenter: new THREE.Vector2(),
    lodSplits: new Set(), inner: 0, outer: 8192
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
// Woda i sztuczne kurtyny/fartuchy nie są bryłą rzucającą cień.
const waterMesh = mesh(sample({ farSurface: () => ({top:20, kind:'water', material:'water'}) }, 2), 2);
assert.ok(waterMesh.indices.length > 0, 'Woda nadal musi być widoczna');
assert.equal(waterMesh.shadowIndices.length, 0, 'Daleka woda rzuca cień');
const flatRock = mesh(sample({ farSurface: () => ({top:20, kind:'rock', material:'stone'}) }, 2), 2);
assert.equal(flatRock.shadowIndices.length, 6, 'Płaski teren powinien rzucać cień tylko wierzchem, bez kurtyn');
const raised = buffers(1); raised.heights.fill(10); raised.heights[4] = 20;
raised.kinds.fill(kindIndex('rock')); raised.materialIds.fill(surfaceMaterialId('stone'));
const raisedMesh = mesh(raised, 1);
assert.equal(raisedMesh.shadowIndices.length, 30, 'Kolumna: wierzch i cztery rzeczywiste boki');
assert.ok(raisedMesh.positions.some((v, i) => i % 4 === 1 && v < 10), 'Fixture musi zawierać widoczny fartuch LOD');
for (const index of raisedMesh.shadowIndices) {
    const effectiveY = Math.max(raisedMesh.positions[index * 4 + 1], raisedMesh.positions[index * 4 + 3]);
    assert.ok(effectiveY >= 10 && effectiveY <= 20, 'Fartuch przedłuża fizyczny cień poniżej podstawy');
    assert.equal(raisedMesh.colors[index * 4 + 3], 255, 'Kurtyna dostała indeks cienia');
}

// Snapshot ma zamrożoną maskę/origin i podtrzymuje geometrię aż do
// ostatniego użytkownika, również gdy streaming wymieni lub usunie kafel.
terrain.shown.add(tile); terrain.scene.add(tile.mesh); terrain.tiles.set('fixture', tile); tile.key = 'fixture';
const oldMask = chunkMaskData[0], oldOrigin = chunkMaskUniforms.uChunkMaskOrigin.value.clone();
chunkMaskData[0] = 127; chunkMaskUniforms.uChunkMaskOrigin.value.set(11, 12);
const firstSnapshot = terrain.collectShadowCasters(null), oldBundle = tile.geometryBundle;
assert.equal(firstSnapshot.casters.length, 1);
assert.equal(oldBundle.references, 1);
const frozenMaterial = firstSnapshot.casters[0].material;
chunkMaskData[0] = 0; chunkMaskUniforms.uChunkMaskOrigin.value.set(13, 14);
assert.equal(frozenMaterial.uniforms.uChunkMask.value.image.data[0], 127);
assert.deepEqual(frozenMaterial.uniforms.uChunkMaskOrigin.value.toArray(), [11, 12]);
chunkMaskData[0] = oldMask; chunkMaskUniforms.uChunkMaskOrigin.value.copy(oldOrigin);
const oldPositions = firstSnapshot.casters[0].geometry.getAttribute('position').array.slice();
let oldDisposed = 0, newDisposed = 0;
oldBundle.shadowGeometry.addEventListener('dispose', () => oldDisposed++);
terrain.world.savedChunks.clear(); tile.raw.heights.fill(30); terrain.buildMesh(tile);
assert.ok(terrain.shadowRevision > firstSnapshot.revision, 'Nowy widoczny mesh nie zmienia rewizji cieni');
assert.equal(oldBundle.retired, true); assert.equal(oldDisposed, 0);
assert.deepEqual(firstSnapshot.casters[0].geometry.getAttribute('position').array, oldPositions,
    'Streaming zmienił geometrię używaną przez budowaną mapę');
const secondSnapshot = terrain.collectShadowCasters(null), newBundle = tile.geometryBundle;
newBundle.shadowGeometry.addEventListener('dispose', () => newDisposed++);
const rejected = terrain.collectShadowCasters({ intersectsSphere: () => false });
assert.equal(rejected.casters.length, 0); rejected.dispose();
terrain.disposeTile(tile);
assert.equal(newBundle.retired, true); assert.equal(newDisposed, 0);
firstSnapshot.dispose(); firstSnapshot.dispose();
assert.equal(oldDisposed, 1, 'Podtrzymywana geometria musi zostać zwolniona dokładnie raz');
assert.equal(newDisposed, 0);
secondSnapshot.dispose();
assert.equal(newDisposed, 1); assert.equal(terrain.shadowSnapshots.size, 0);

// Docelowy detal obejmuje 800 bloków, horyzont nadal sięga 8192.
terrain.setDetail(2);
const chosen = terrain.selectTiles({ x: 0, z: 0, height: 0 });
assert.equal(TARGET_DETAIL_DISTANCE, 800);
assert.ok(chosen.some(t => t.distance > 7000), 'Nowy detal skrócił daleki horyzont');
assert.ok(chosen.filter(t => t.distance <= 800).every(t => t.spacing <= 4), 'Brak szczegółów casterów w zasięgu 800');

// Przekraczanie granicy detalu o jeden blok nie przełącza podziału co
// krok. Dopiero wyjście poza pas histerezy pozwala scalić ten sam kafel.
terrain.lodSplits.clear();
const detailTile = '32:8:0:0';
for (const [x, split] of [[-799, true], [-801, true], [-897, false], [-801, false], [-799, true]]) {
    terrain.selectTiles({ x, z: 128, height: 0 });
    assert.equal(terrain.lodSplits.has(detailTile), split, `Oscylacja LOD przy x=${x}`);
}

// Menu dobiera prawdziwe kafelki w trzech pasach. Nie generujemy ich
// wysokości ani siatek: sprawdzamy selekcję przestrzenną i izolację profilu.
const menuCenter = { x: -480, z: 384, height: 0 };
const selectionKeys = tiles => tiles.map(item => item.key).sort();
terrain.setDetail(1);
terrain.setRange(256, 8192);
const lowGame = selectionKeys(terrain.selectTiles(menuCenter));
terrain.setDetail(1, false, true);
terrain.setRange(256, 8192);
assert.equal(terrain.outer, 1024, 'Scenografia przekroczyła budżet horyzontu 1024');
const menuTiles = terrain.selectTiles(menuCenter);
assert.ok(menuTiles.some(item => item.distance > 800), 'Menu zgubiło zewnętrzny pas horyzontu');
assert.ok(menuTiles.filter(item => item.distance <= 512).every(item => item.spacing === 1),
    'Niskie ustawienie użytkownika zepsuło jednoblokowe kratki menu do 512');
assert.ok(menuTiles.filter(item => item.distance <= 800).every(item => item.spacing <= 2),
    'Brak kroku 2 lub mniejszego do 800');
assert.ok(menuTiles.every(item => item.spacing <= 4 && item.distance <= 1024),
    'Grube kratki albo kafelki poza horyzontem scenografii');
for (const level of [0, 1, 2, 3]) {
    terrain.setDetail(level, false, true);
    assert.deepEqual(selectionKeys(terrain.selectTiles(menuCenter)), selectionKeys(menuTiles),
        `Profil menu zależy od farDetail=${level}`);
}
terrain.wanted = menuTiles;
const menuStats = terrain.stats();
assert.equal(menuStats.profile, 'scenery');
assert.equal(menuStats.maxDistance, 1024);
assert.deepEqual(menuStats.detailTiers,
    [{ distance: 512, spacing: 1 }, { distance: 800, spacing: 2 }, { distance: 1024, spacing: 4 }]);
menuStats.detailTiers[0].spacing = 99;
assert.equal(terrain.stats().detailTiers[0].spacing, 1, 'Odczyt statystyk udostępnił mutowalny profil');

// Przejście z menu nie skraca horyzontu gry ani nie poprawia po cichu
// jej wybranego niskiego detalu. Potato jest identyczny z flagą menu i bez.
terrain.setDetail(1);
terrain.setRange(256, 8192);
assert.equal(terrain.outer, 8192);
assert.deepEqual(selectionKeys(terrain.selectTiles(menuCenter)), lowGame);
assert.equal(terrain.stats().profile, 'game');
terrain.setDetail(1, true, false);
const potatoGame = selectionKeys(terrain.selectTiles(menuCenter));
terrain.setDetail(3, true, true);
terrain.setRange(256, 8192);
assert.equal(terrain.outer, 8192, 'Profil menu zmienił zasięg trybu ziemniaka');
assert.deepEqual(selectionKeys(terrain.selectTiles(menuCenter)), potatoGame);
assert.equal(terrain.stats().profile, 'potato');
terrain.setDetail(2);

// Pula nie tworzy nowego programu/tekstury co aktualizację cienia.
// Reużycie jest dozwolone dopiero po release i nie rusza drugiej mapy.
const poolTile = { key:'pool-fixture', x0:0, z0:0, spacing:1, cells:2, size:2, raw:source };
terrain.buildMesh(poolTile); terrain.tiles.set(poolTile.key, poolTile); terrain.shown.add(poolTile);
terrain.scene.add(poolTile.mesh);
chunkMaskData[0] = 11; chunkMaskUniforms.uChunkMaskOrigin.value.set(11, 12); terrain.shadowCenter.set(1, 2);
const snapshotA = terrain.collectShadowCasters(null), materialA = snapshotA.casters[0].material;
const maskA = materialA.uniforms.uChunkMask.value;
chunkMaskData[0] = 22; chunkMaskUniforms.uChunkMaskOrigin.value.set(22, 23); terrain.shadowCenter.set(3, 4);
const snapshotB = terrain.collectShadowCasters(null), materialB = snapshotB.casters[0].material;
assert.notEqual(materialA, materialB, 'Dwie aktywne mapy współdzielą zmienny materiał');
assert.equal(maskA.image.data[0], 11);
assert.deepEqual(materialA.uniforms.uChunkMaskOrigin.value.toArray(), [11, 12]);
assert.deepEqual(materialA.uniforms.uFarCenter.value.toArray(), [1, 2]);
const poolSize = terrain.shadowResourcePool.length;
assert.equal(poolSize, 3, 'Dwie mapy oraz migawka bez dalekich casterów zachowują niezależną maskę dla bliskich casterów');
snapshotA.dispose();
const versionA = maskA.version;
chunkMaskData[0] = 33;
const snapshotC = terrain.collectShadowCasters(null);
assert.equal(snapshotC.casters[0].material, materialA, 'Wolny slot nie został użyty ponownie');
assert.equal(maskA.version, versionA + 1, 'Nowe bajty maski nie trafiły do GPU');
snapshotC.dispose();
const unchangedVersion = maskA.version, snapshotD = terrain.collectShadowCasters(null);
assert.equal(snapshotD.casters[0].material, materialA);
assert.equal(maskA.version, unchangedVersion, 'Identyczna maska powoduje zbędny upload GPU');
snapshotD.dispose();
for (let i = 0; i < 20; i++) {
    chunkMaskData[0] = 40 + i; chunkMaskUniforms.uChunkMaskOrigin.value.set(i, i + 1);
    const next = terrain.collectShadowCasters(null); next.dispose();
    assert.equal(terrain.shadowResourcePool.length, poolSize, 'Pula rośnie przy kolejnych klatkach');
    assert.equal(materialB.uniforms.uChunkMask.value.image.data[0], 22, 'Reużycie mutuje aktywny snapshot');
    assert.deepEqual(materialB.uniforms.uChunkMaskOrigin.value.toArray(), [22, 23]);
    assert.deepEqual(materialB.uniforms.uFarCenter.value.toArray(), [3, 4]);
}
const poolDisposals = new Map();
for (const slot of terrain.shadowResourcePool) for (const resource of [slot.mask, slot.material]) {
    poolDisposals.set(resource, 0);
    resource.addEventListener('dispose', () => poolDisposals.set(resource, poolDisposals.get(resource) + 1));
}
let poolGeometryDisposals = 0;
poolTile.geometryBundle.shadowGeometry.addEventListener('dispose', () => poolGeometryDisposals++);
terrain.dispose(); snapshotB.dispose();
assert.equal(terrain.shadowSnapshots.size, 0); assert.equal(terrain.shadowResourcePool.length, 0);
assert.ok([...poolDisposals.values()].every(count => count === 1), 'Zasoby puli nie zostały zwolnione dokładnie raz');
assert.equal(poolGeometryDisposals, 1);
chunkMaskData[0] = oldMask; chunkMaskUniforms.uChunkMaskOrigin.value.copy(oldOrigin);

console.log('OK: materiały far, worker/main, klasyczne bufory XYZ, cienie bez wody/kurtyn, snapshoty, detal gry 800/8192 i osobny profil menu 1/512, 2/800, 4/1024.');
