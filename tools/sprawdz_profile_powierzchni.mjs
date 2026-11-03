import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Real geometry, material hooks and chunk batching; only DOM-owned texture
// loading is replaced. GPU acceptance separately checks directional responses.
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getAtlasAverage=()=>null,getTileColors=()=>[];
            export const getAtlasUV=()=>({uMin:0,uMax:.0625,vMin:0,vMax:.0625});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { SURFACE_KIND: K, SURFACE_PROFILES: P, blockSurfaceProfile } = await import('../src/rendering/SurfaceProfiles.js');
const { createPixelPlant } = await import('../src/rendering/PixelPlantBuilder.js');
const { getBlueberryFaces } = await import('../src/rendering/BlueberryGeometry.js');
const { getFruitBushFaces, getFruitItemModel } = await import('../src/rendering/FruitBushGeometry.js');
const { getRiverPlantFaces } = await import('../src/rendering/RiverPlantGeometry.js');
const { blockMaterial, plantMaterial, leafMaterial } = await import('../src/rendering/BlockRenderData.js');
const { createModelMaterial } = await import('../src/rendering/ModelMaterial.js');
const { getBlockDefinition, getBlockId, BLOCK_TYPES } = await import('../src/blocks/BlockRegistry.js');
const { buildBlockGeometry } = await import('../src/player/PlayerModel.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');

let checks = 0;
const profileIs = (value, expected) => { assert.deepEqual([...value], [...expected]); checks++; };
for (const [type, face, expected] of [
    ['oak_log', 'front', P.bark], ['oak_log', 'top', P.wood],
    ['oak_log_stripped', 'front', P.wood], ['oak_planks', 'front', P.wood],
    ['oak_leaves', 'front', P.leafBlock], ['stone', 'top', P.stone], ['lamp_red', 'top', P.emissive],
    ['short_grass', 'front', P.matte]
]) profileIs(blockSurfaceProfile(getBlockDefinition(type), face), expected);
// Packs use the same typed registry metadata, never texture RGB heuristics.
for (const definition of Object.values(BLOCK_TYPES).filter(definition => definition.tree)) {
    if (definition.model === 'leaves') profileIs(blockSurfaceProfile(definition), P.leafBlock);
    if (definition.part === 'log') profileIs(blockSurfaceProfile(definition), P.bark);
}

const pixels = createPixelPlant({ leaf: [30, 80, 10], stem: [30, 80, 10] }, false, 0, 1);
pixels.sheet(2, 0, ({ pixel }) => pixel(0, 0, 'leaf'));
pixels.box(2, 0, 0, 1, 1, 1, 'leaf');
pixels.box(4, 0, 0, 1, 2, 1, 'stem');
const faces = pixels.finish();
profileIs(faces[0].surfaceProfile, P.leaf); profileIs(faces[1].surfaceProfile, P.leaf);
assert.ok(faces.some(face => face.surfaceProfile === P.leafVoxel));
assert.ok(faces.some(face => face.surfaceProfile === P.branch));
assert.ok(P.leafBlock[1] < P.leafVoxel[1] && P.leafVoxel[1] < P.leaf[1]);

for (const stage of ['young', 'empty', 'few', 'full']) {
    for (const face of getBlueberryFaces(stage)) profileIs(face.surfaceProfile,
        face.berry ? P.fruit : face.partIndex < 6 ? P.leafVoxel : P.leaf);
}
for (const [species, item] of [['strawberry', 'strawberry'], ['blackberry', 'blackberry'], ['chili', 'chili_pepper'], ['hazel', 'hazelnut']]) {
    const bush = getFruitBushFaces(species, 'full'), picked = getFruitItemModel(item);
    assert.ok(bush.some(face => face.surfaceProfile[0] === K.LEAF));
    assert.ok(bush.some(face => face.surfaceProfile[0] === K.FRUIT));
    if (species !== 'strawberry') assert.ok(bush.some(face => face.surfaceProfile[0] === K.BRANCH));
    assert.deepEqual(bush.filter(face => face.fruitIndex === 0).map(face => face.surfaceProfile), picked.faces.map(face => face.surfaceProfile));
    const held = buildBlockGeometry(item), attribute = held.getAttribute('surfaceProfile');
    assert.ok(attribute.array instanceof Uint8Array && !attribute.normalized);
    assert.equal(attribute.count, held.getAttribute('position').count);
    picked.faces.forEach((face, index) => {
        for (let corner = 0; corner < 4; corner++) profileIs(attribute.array.subarray((index * 4 + corner) * 2, (index * 4 + corner + 1) * 2), face.surfaceProfile);
    });
    held.dispose();
}
for (const kind of ['sedge', 'cattail', 'loosestrife', 'milfoil', 'lily', 'duckweed']) {
    const models = getRiverPlantFaces(kind, 0, true);
    assert.ok(models.every(face => face.surfaceProfile?.length === 2));
    assert.ok(models.some(face => face.surfaceProfile[0] === K.LEAF));
}

const world = new World(new THREE.Scene(), 42, new Map(), 'classic');
const chunk = new Chunk(0, 0); chunk.skyLight.fill(15); world.chunks.set('0,0', chunk);
for (const [i, type] of ['stone', 'oak_log', 'oak_leaves', 'lamp_red', 'chili_bush_full', 'water'].entries()) chunk.setId(1 + i * 2, 10, 4, getBlockId(type));
world.rebuildChunkMesh(chunk);
const geometry = chunk.mesh.geometry, profiles = geometry.getAttribute('surfaceProfile');
assert.ok(profiles.array instanceof Uint8Array && !profiles.normalized);
assert.equal(profiles.count, geometry.getAttribute('position').count);
assert.equal(profiles.array.byteLength, profiles.count * 2, 'Only two bytes per existing vertex');
const kinds = new Set(Array.from(profiles.array).filter((_, i) => i % 2 === 0));
for (const kind of Object.values(K)) assert.ok(kinds.has(kind), `Missing batched kind ${kind}`);
assert.deepEqual(geometry.groups.map(group => group.materialIndex), [0, 1, 3, 2], 'No material/draw-call split by profile');
const oldCount = profiles.count;
chunk.setId(9, 10, 4, getBlockId('stone')); world.rebuildChunkMesh(chunk);
assert.ok(chunk.mesh.geometry.getAttribute('surfaceProfile').count < oldCount, 'Rebuild truncates the reused profile buffer');
assert.ok(!Array.from(chunk.mesh.geometry.getAttribute('surfaceProfile').array).some((kind, i) => i % 2 === 0 && kind === K.FRUIT));
world.dispose();

const modelMaterial = createModelMaterial({ map: null });
for (const material of [blockMaterial, plantMaterial, leafMaterial, modelMaterial]) {
    profileIs(material.defaultAttributeValues.surfaceProfile, P.matte);
    const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader, { capabilities: { isWebGL2: true } });
    assert.equal((shader.vertexShader.match(/attribute vec2 surfaceProfile;/g) ?? []).length, 1);
    assert.equal((shader.fragmentShader.match(/vec3 thinLeafTransmission\(/g) ?? []).length, 1);
    assert.match(shader.fragmentShader, /#ifndef POTATO\s+#define USE_SURFACE_PROFILES/);
}
modelMaterial.dispose();

// Independent bounce must remain present when directional maps are off.
// WebGL1's early material path must not acquire the WebGL2 sampler at all.
for (const webgl2 of [false, true]) {
    const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader,
        fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
    blockMaterial.onBeforeCompile(shader, { capabilities: { isWebGL2: webgl2 } });
    assert.equal(shader.fragmentShader.includes('uniform highp sampler3D uBounceLight;'), webgl2);
    assert.match(shader.fragmentShader, /#ifdef USE_DYNAMIC_LIGHT\s+\/\/ The bounce solver[\s\S]*?blockBounce = bounceLight/);
    if (webgl2) assert.match(shader.fragmentShader, /uniform highp sampler3D uBounceLight;[\s\S]*vec3 bounceLight\(/);
    else assert.ok(!shader.fragmentShader.includes('sampler3D'));
}
console.log(`OK: ${checks} profili powierzchni — semantyczne liście/gałęzie/owoce, paczki, itemy i niezmienione grupy chunka.`);
