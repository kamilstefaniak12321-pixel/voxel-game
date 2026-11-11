import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(s, c, next) { return next(s === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : s, c); },
    load(url, c, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            import { Color } from 'three';
            export const blockAtlasTexture=null, atlasAverageTexture=null, atlasAveragesReady=Promise.resolve();
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
            export const getAtlasAverage=()=>new Color(.3,.4,.2),getTileColors=()=>[],getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};
        ` };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/')) ? {...c,format:'module'} : c);
    }
});
const THREE = await import('three');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { createFarVegetationJob, appendFarVegetation, treeSilhouette, VEGETATION_STRIDE } = await import('../src/world/farVegetation.js');
const { sampleFarTile, meshFarTile, createMeshScratch, KINDS, kindIndex } = await import('../src/world/farSamples.js');
const { SURFACE_MATERIAL_COUNT, surfaceMaterialId } = await import('../src/rendering/SurfaceMaterials.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { chunkMaskData, chunkMaskUniforms, viewUniforms, CHUNK_MASK_SIZE } = await import('../src/rendering/viewUniforms.js');
let checks=0;
const check=(value,message)=>{assert.ok(value,message);checks++;};
const equal=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};

// The cheap path makes exactly the same placement decision, species and seed.
const generator=new RealisticGenerator('test');
let found=0;
for(let z=-24;z<-12;z++)for(let x=-72;x<-60;x++) {
    const descriptor=generator.forests.descriptorAt(x,z), real=generator.forests.treeAt(x,z);
    equal(Boolean(descriptor),Boolean(real),'Descriptor agrees with real generation');
    if(!real)continue;
    found++;
    equal({...descriptor,shape:null},{...real,shape:null},'Position/species/seed/size preserved');
    equal(descriptor.shape,null,'Descriptor retains no voxel shape');
    for(const spacing of [1,2,4,8]) {
        const silhouette=treeSilhouette(descriptor,spacing);
        check(silhouette.length>0&&silhouette.length%VEGETATION_STRIDE===0,'Finite batched proxy');
        check(silhouette.every(Number.isFinite),'No invalid proxy coordinates');
        equal(silhouette.slice(0,12),treeSilhouette(descriptor,1).slice(0,12),'Trunk survives every level');
    }
    check(treeSilhouette(descriptor,8).length<treeSilhouette(descriptor,1).length,'Farther crown uses fewer boxes');
}
check(found>0,'Fixture has actual trees');

// Bound the silhouette error at the near handoff, including rotated pack
// templates. Full voxel generation is only used as a test oracle.
const envelopeStats={};
for(const species of TREE_NAMES)for(const size of [0,.25,.5,.75,1])for(const seed of [1,42,1387]) {
    const actual=buildTree(species,seed,size).blocks.filter(b=>b[3].includes('leaves'));
    if(!actual.length)continue;
    const expected=[0,1,2].map(axis=>[Math.min(...actual.map(b=>b[axis])),Math.max(...actual.map(b=>b[axis]))+1]);
    const proxy=treeSilhouette({species,size,seed,x:0,y:0,z:0},1);
    const boxes=[];for(let at=0;at<proxy.length;at+=12)if(proxy[at+6]===surfaceMaterialId(`${species}_leaves`))boxes.push(proxy.slice(at,at+6));
    const observed=[0,1,2].map(axis=>[Math.min(...boxes.map(b=>b[axis])),Math.max(...boxes.map(b=>b[axis+3]))]);
    const error=Math.max(...expected.flatMap((range,axis)=>range.map((value,side)=>Math.abs(value-observed[axis][side]))));
    envelopeStats[species]=Math.max(envelopeStats[species]??0,error);
    check(error<=3,`${species}, size${size}, seed${seed}: silhouette envelope differs by${error} blocks`);
}

// Far-only ground sampling removes the canopy wall, leaving default behavior intact.
let forestSamples=0;
for(let z=-128;z<=0;z+=8)for(let x=-320;x<=-192;x+=8) {
    const old=generator.farSurface(x,z,2),ground=generator.farSurface(x,z,2,true);
    if(old.kind.endsWith('_leaves')) {
        forestSamples++;
        check(!ground.kind.endsWith('_leaves')&&ground.top<=old.top,'Ground stays below separated canopy');
    } else equal(ground,old,'Ground option preserves water, cliffs, meadow');
}
check(forestSamples>0,'Fixture covers canopy');

const cells=32,spacing=2,x0=-320,z0=-128,W=cells+2;
const heights=new Int16Array(W*W),kinds=new Uint8Array(W*W),materialIds=new Uint16Array(W*W);
sampleFarTile(generator,x0,z0,spacing,cells,heights,kinds,0,W,materialIds,true);
const raw=createFarVegetationJob(generator,x0,z0,cells*spacing,spacing,heights,kinds,cells).step().data;
check(raw.length>0,'Actual terrain has representative vegetation');
const sliced=createFarVegetationJob(generator,x0,z0,cells*spacing,spacing,heights,kinds,cells);
let result,steps=0;do{result=sliced.step(0);steps++;assert.ok(steps<1000);}while(!result.done);
check(steps>1,'Fallback yields between rows');equal(result.data,raw,'Worker-style and sliced fallback identical');
const palette=Uint8Array.from({length:KINDS.length*9},(_,i)=>(i*7+31)%256);
const albedo=Uint8Array.from({length:SURFACE_MATERIAL_COUNT*18},(_,i)=>(i*11+19)%256);
const base=meshFarTile(heights,kinds,cells,spacing,palette,createMeshScratch(cells),materialIds,albedo);
const mesh=appendFarVegetation(base,raw,x0,z0,palette,albedo);
equal(mesh.positions.subarray(0,base.positions.length),base.positions,'Ground XYZ and shadow base untouched');
equal(mesh.colors.subarray(0,base.colors.length),base.colors,'All ground color/curtain/water flags untouched');
for(const attribute of ['normals','surfaceAlbedo'])equal(mesh[attribute].subarray(0,base[attribute].length).filter((_,i)=>i%4!==3),base[attribute].filter((_,i)=>i%4!==3),'Ground '+attribute+' XYZ/RGB bytes untouched');
check(mesh.canopyPacked,'Canopy reuses normal padding and unused albedo alpha without another allocation');
check(mesh.vegetationStats.trees>0&&mesh.indices.length>base.indices.length,'Tree proxies are in same terrain batch');
equal(mesh.indices.length-base.indices.length,mesh.shadowIndices.length-base.shadowIndices.length,'All proxy surfaces have matching shadow geometry');
check(mesh.indices.every(index=>index<mesh.positions.length/4),'All indices stay in range');
const repeated=new Float32Array(raw.length*80);
for(let i=0;i<80;i++)repeated.set(raw,raw.length*i);
const large=appendFarVegetation(base,repeated,x0,z0,palette,albedo);
check(large.positions.length/4>65535&&large.indices instanceof Uint32Array,'Large vegetation tiles promote indices to Uint32');
check(large.indices.every(index=>index<large.positions.length/4),'Large tile indices do not wrap');
const edited=new Map();for(let z=-160;z<=0;z+=16)for(let x=-352;x<=-224;x+=16)edited.set(`${x/16},${z/16}`,true);
const removed=appendFarVegetation(base,raw,x0,z0,palette,albedo,edited);
equal(removed.indices,base.indices,'Saved player edits suppress synthetic trees and ground plants');

let packet;
globalThis.self={postMessage(message,transfer){if(message.type==='tile')packet={message,transfer};}};
await import('../src/world/FarTerrainWorker.js');
self.onmessage({data:{type:'init',terrain:'realistic',seed:'test'}});
self.onmessage({data:{type:'palette',colors:palette,albedo}});
self.onmessage({data:{type:'tile',id:55,x0,z0,spacing,cells,vegetation:true}});
equal(packet.message.vegetation,raw,'Real worker uses the same deterministic vegetation');
equal(packet.message.mesh,mesh,'Real worker and fallback publish identical merged buffers');
check(packet.transfer.includes(packet.message.vegetation.buffer),'Vegetation source transferred without cloning');
delete globalThis.self;

// The visible and shadow paths share their original position/shadowBase.
// Canopy RGB555 must share the normal allocation, never replace position.w.
const assembly=Object.assign(Object.create(FarTerrain.prototype),{modifiedChunksIn:()=>new Map(),shown:new Set(),shadowRevision:0});
const assembled={x0,z0,cells,spacing,size:cells*spacing,workerMesh:structuredClone(mesh)};
assembly.buildMesh(assembled);
const attributes=assembled.mesh.geometry.attributes,shadowAttributes=assembled.geometryBundle.shadowGeometry.attributes;
check(attributes.normal.isInterleavedBufferAttribute,'Far normal is an interleaved view');
check(attributes.normal.data===attributes.canopyLow.data,'Canopy shares the normal GPU allocation');
equal(attributes.normal.data.array,mesh.normals,'Interleaved upload preserves all packed normal/light bytes');
equal(attributes.position.array,mesh.positions,'Position XYZ and shadowBase upload unchanged');
check(shadowAttributes.shadowPosition===attributes.position&&shadowAttributes.shadowPosition.itemSize===4,'Shadow shader still receives all four original position components');
check(shadowAttributes.normal===attributes.normal,'Shadow normal uses the same xyz view');
const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
assembled.material.onBeforeCompile(shader);
check(shader.vertexShader.includes('canopyLow + 128.0'),'Signed byte is explicitly restored during RGB555 decode');
check(shader.vertexShader.includes('surfaceAlbedo.a > 0.5'),'Geometry without canopy keeps neutral alpha sentinel');
check(shader.fragmentShader.includes('canopySkyTint(canopyHue)'),'Decoded canopy affects only indirect sky irradiance');
assembled.mesh.geometry.dispose();assembled.geometryBundle.shadowGeometry.dispose();assembled.material.dispose();

// Readiness is a geometry contract, never a distance-only guess.
const world={chunks:new Map([['0,0',{cx:0,cz:0,mesh:{}}],['1,0',{cx:1,cz:0,mesh:{}}]]),meshVersion:1};
const far=Object.assign(Object.create(FarTerrain.prototype),{world,shown:new Set(),coverageVersion:0,shadowRevision:0});
far.updateMask(new THREE.Vector3(0,60,0));
const origin=chunkMaskUniforms.uChunkMaskOrigin.value;
const at=(cx,cz)=>(cz-origin.y)*CHUNK_MASK_SIZE+cx-origin.x;
equal(chunkMaskData[at(0,0)],128,'Missing far coverage preserves near mesh');
far.shown.add({x0:0,z0:0,size:16,mesh:{}});far.coverageVersion++;
far.updateMask(new THREE.Vector3(0,60,0));
equal(chunkMaskData[at(0,0)],255,'Shown far tile allows complementary handoff');
equal(chunkMaskData[at(1,0)],128,'Neighbour lacking far tile remains fully visible');
equal(chunkMaskData[at(2,0)],0,'No near geometry is never marked covered');
far.shown.clear();far.coverageVersion++;far.updateMask(new THREE.Vector3(0,60,0));
equal(chunkMaskData[at(0,0)],128,'Removing far tile restores full near coverage');

// Far quadtree uses all three increasingly coarse zones and overlaps144–192.
const selection=Object.assign(Object.create(FarTerrain.prototype),{tiles:new Map(),shown:new Set(),lodSplits:new Set(),inner:192,outer:1600});
selection.setDetail(1);viewUniforms.uDistanceLodEnabled.value=1;
const tiles=selection.selectTiles({x:0,z:0,height:0});
check(tiles.some(t=>t.distance<160),'Far geometry exists beneath handoff zone');
check(tiles.filter(t=>t.distance<=256).every(t=>t.spacing===1),'One-block ground at transition');
check(tiles.filter(t=>t.distance<=448).every(t=>t.spacing<=2),'Two-block middle tier');
check(tiles.filter(t=>t.distance<=800).every(t=>t.spacing<=4),'Four-block terrain through800');
check(tiles.some(t=>t.spacing===8&&t.vegetation),'Simplified individual trees persist beyond800');
check(tiles.some(t=>t.spacing>=16&&!t.vegetation),'Very distant horizon retains bounded canopy approximation');
viewUniforms.uDistanceLodEnabled.value=0;

// Replacing a quadtree keeps old coverage through the complementary fade;
// interrupted transitions release their retired scene objects immediately.
const makeTile=(key,x0=0,z0=0,size=32)=>({key,x0,z0,size,mesh:new THREE.Object3D(),fade:{value:new THREE.Vector2(1,0)}});
const oldTile=makeTile('old'),newTile=makeTile('new'),nextTile=makeTile('next');
const fading=Object.assign(Object.create(FarTerrain.prototype),{scene:new THREE.Scene(),shown:new Set([oldTile]),
    wanted:[newTile],tiles:new Map([[oldTile.key,oldTile],[newTile.key,newTile],[nextTile.key,nextTile]]),complete:true,shadowRevision:0,coverageVersion:0});
fading.scene.add(oldTile.mesh);fading.showWanted();
equal(fading.scene.children.length,2,'Both LOD generations remain during transition');
equal(oldTile.fade.value.toArray(),[0,-1],'Retiring generation initially owns all pixels');
equal(newTile.fade.value.toArray(),[0,1],'New generation initially owns no pixels');
const now=Object.getOwnPropertyDescriptor(performance,'now');
try {
    Object.defineProperty(performance,'now',{configurable:true,value:()=>100});
    fading.fadeStarted=-175;fading.updateTileFade();
    equal(newTile.fade.value.x,.5,'Halfway smooth transition');
    equal(oldTile.fade.value.x,newTile.fade.value.x,'Old/new masks use the identical threshold');
} finally {if(now)Object.defineProperty(performance,'now',now);else delete performance.now;}
fading.wanted=[nextTile];fading.showWanted();
check(!fading.scene.children.includes(oldTile.mesh),'Interrupted transition releases oldest coverage');
check(fading.scene.children.includes(newTile.mesh)&&fading.scene.children.includes(nextTile.mesh),'Latest two generations still overlap');
fading.hideAll();equal(fading.scene.children.length,0,'Hide clears both generations');equal(fading.retiring.size,0,'No retired meshes remain');

// Moving the inner ring can expose a new tile with no outgoing far geometry.
// A fully or partly uncovered rectangle must be opaque before updateMask
// grants the near world permission to hand its pixels to that rectangle.
for (const [name,previous,expectedFade] of [
    ['missing',[makeTile('outside',64,0,32)],[1,0]],
    ['partial',[makeTile('quarter',0,0,16)],[1,0]],
    ['complete',[makeTile('a',0,0,16),makeTile('b',16,0,16),makeTile('c',0,16,16),makeTile('d',16,16,16)],[0,1]]
]) {
    const incoming=makeTile('incoming');
    const fixture=Object.assign(Object.create(FarTerrain.prototype),{scene:new THREE.Scene(),shown:new Set(previous),
        wanted:[incoming],tiles:new Map([...previous,incoming].map(t=>[t.key,t])),complete:true,shadowRevision:0,coverageVersion:0,
        world:{chunks:new Map([['0,0',{cx:0,cz:0,mesh:{}}]]),meshVersion:1}});
    for(const tile of previous)fixture.scene.add(tile.mesh);
    fixture.showWanted();
    equal(incoming.fade.value.toArray(),expectedFade,`${name}: incoming opacity follows actual outgoing coverage`);
    fixture.updateMask(new THREE.Vector3(0,60,0));
    const index=-chunkMaskUniforms.uChunkMaskOrigin.value.y*CHUNK_MASK_SIZE-chunkMaskUniforms.uChunkMaskOrigin.value.x;
    equal(chunkMaskData[index],255,`${name}: readiness publishes only after a safe incoming fade is installed`);
    // Probe uncovered and covered quadrants at handoff weights. These are the
    // actual masks selected by showWanted, not a distance-only readiness guess.
    for(const [x,z] of [[8,8],[24,8],[8,24],[24,24]])for(const nearWeight of [0,.5,1])for(const noise of [.1,.6,.95]) {
        const incomingDraws=incoming.fade.value.y===0||noise<incoming.fade.value.x;
        const outgoingDraws=[...fixture.retiring].some(t=>x>=t.x0&&x<t.x0+t.size&&z>=t.z0&&z<t.z0+t.size&&noise>=t.fade.value.x);
        check(noise<nearWeight||incomingDraws||outgoingDraws,`${name}: every handed-off pixel retains geometry coverage`);
    }
    fixture.hideAll();
}
console.log(`OK: daleka roślinność — ${checks} kontroli pozycji, geometrii, budżetu, zapisów i gotowości przejścia. Envelopes: ${JSON.stringify(envelopeStats)}`);
