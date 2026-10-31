import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format:'module', shortCircuit:true, source:'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, context);
    }
});
const { PlantAnimations, MAX_PLANT_ANIMATIONS } = await import('../src/rendering/PlantAnimations.js');
const { blueberryPose, sampleBlueberryAnimation, transformBlueberryVertex } = await import('../src/rendering/BlueberryAnimation.js');
const { getBlueberryFaces } = await import('../src/rendering/BlueberryGeometry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { getGrowth, getBlockId, getHarvest } = await import('../src/blocks/BlockRegistry.js');
const { Scene, Vector3 } = await import('three');
const gameSource = await readFile(new URL('../src/game/Game.js', import.meta.url), 'utf8');
const harvestBody = gameSource.split('    harvestTarget(hit) {')[1].split('\n    // --------------------------------------------------------')[0];
const harvestTarget = new Function('getHarvest', 'THREE', `return function(hit) {${harvestBody.trim().slice(0,-1)}}`)(getHarvest, {Vector3});
const near = (a,b,eps=1e-6) => assert.ok(Math.abs(a-b)<=eps, `${a} != ${b}`);
const world = new World(new Scene(), 123, new Map(), 'classic');
const chunk = new Chunk(-1, 0); chunk.skyLight.fill(15); world.chunks.set('-1,0',chunk);
// Do not generate unrelated terrain for this deterministic fixture.
for(let x=0;x<16;x++)for(let z=0;z<16;z++)chunk.setId(x,9,z,getBlockId('dirt'));
chunk.setId(15,10,5,94);
world.rebuildChunkMesh(chunk);
const controller = new PlantAnimations(world, { position: new Vector3(-1,11,5) });
const index=chunk.index(15,10,5);
const event=()=>controller.overridesFor(chunk)?.get(index);
const rebuild=()=>world.rebuildChunkMesh(chunk);
const finish=()=>{
    world.dirtyChunks.clear();controller.update(3);
    assert.equal(world.dirtyChunks.size,0,'Finishing never schedules a second terrain remesh');
    rebuild();assert.equal(controller.active.size,0);
};
const growth=new PlantGrowth(world);
assert.equal(growth.grow(chunk,index,getGrowth('blueberry_sapling')),true);
assert.equal(chunk.blocks[index],96,'Logical stage commits immediately');
assert.equal(event().kind,'grow');
rebuild();
const growing=event(), original=chunk.mesh.geometry;
near(growing.pose.size,.55);
assert.equal(growing.pose.fruit.reduce((a,b)=>a+b,0),0);
controller.update(.6);assert.ok(growing.pose.size>.55&&growing.pose.size<1);
assert.equal(chunk.mesh.geometry,original,'No per-frame remesh');
assert.equal(original.groups.length,2,'No new draw group');
const saved=chunk.blocks.slice();
controller.update(.3);assert.deepEqual(chunk.blocks,saved,'Animation never changes saves');
rebuild();near(event().time,.9);
const reconstructed=event().pose.size;
assert.ok(reconstructed>.55&&reconstructed<1,'Remesh preserves progress');
finish();
const staticFew=buildChunkGeometry(chunk,world);
assert.equal(chunk.mesh.geometry.index.count,staticFew.index.count);
staticFew.dispose();

// Fruit scales about its own centre, at all phases, without changing leaf size.
const harvest={kind:'harvest',duration:.64,from:blueberryPose(97),to:blueberryPose(95)};
const pose=sampleBlueberryAnimation(harvest,.13);pose.berryAngle=0;
const face=getBlueberryFaces('full').find(f=>f.berry);
const coords=face.vertices.map(v=>Array.from(transformBlueberryVertex(face,v,pose,new Float64Array(7))));
for(let axis=0;axis<3;axis++) {
    const before=face.vertices.reduce((s,v)=>s+v[axis],0)/4;
    const after=coords.reduce((s,v)=>s+v[axis],0)/4;
    near(after,face.center[axis]+(before-face.center[axis])*pose.fruit[0]);
}
const cube = getBlueberryFaces('full').filter(f=>f.partIndex===face.partIndex);
for(let axis=0;axis<3;axis++) {
    const points=cube.flatMap(f=>f.vertices.map(v=>transformBlueberryVertex(f,v,pose,new Float64Array(7))[axis]));
    near((Math.max(...points)+Math.min(...points))/2,face.center[axis]);
    near(Math.max(...points)-Math.min(...points),pose.fruit[0]/16);
}
// Full and few share their existing fruit, and all leaves reach exact static geometry.
const refill={kind:'grow',duration:1.8,from:blueberryPose(96),to:blueberryPose(97)};
const middle=sampleBlueberryAnimation(refill,.5);
refill.from.fruit.forEach((size,i)=>{if(size===1)near(middle.fruit[i],1);});
const ended=sampleBlueberryAnimation(refill,1.8);
for(const f of getBlueberryFaces('full'))for(const v of f.vertices) {
    const result=transformBlueberryVertex(f,v,ended,new Float64Array(7));
    for(let axis=0;axis<3;axis++)near(result[axis],v[axis]);
}
for(const type of ['harvest','reject','place']) {
    const clip={...harvest,kind:type,duration:.66};
    near(sampleBlueberryAnimation(clip,0).leafAngle,0);
    near(sampleBlueberryAnimation(clip,0).berryAngle,0);
    near(sampleBlueberryAnimation(clip,.66).leafAngle,0);
}

// Actual Game.harvestTarget: rejection animates but cannot remove or award fruit.
world.setBlock(-1,10,5,'blueberry_bush_full');rebuild();finish();
const inventory=Inventory.load({},'adventure');inventory.slots.forEach((_,i)=>inventory.set(i,{type:'stone',count:64}));
let awarded=0;
const game={world,inventory,plantAnimations:controller,onNotice(){},achieve(){},
    addHarvest(){awarded++;return 3;}};
const hit={hit:true,block:{x:-1,y:10,z:5,type:'blueberry_bush_full'}};
assert.equal(harvestTarget.call(game,hit),false);
assert.equal(event().kind,'reject');
assert.equal(world.getBlockId(-1,10,5),97);assert.equal(awarded,0);
const rejected=event();
controller.reject(-1,10,5);assert.equal(event(),rejected,'Repeated clicks do not restart');
rebuild();controller.update(.12);
inventory.set(0,null);
assert.equal(harvestTarget.call(game,hit),true);
assert.equal(world.getBlockId(-1,10,5),95);assert.equal(awarded,1);
assert.equal(event().kind,'harvest');rebuild();finish();

// Interrupt growth with removal: continue from current size, keep final AIR saved.
world.setBlock(-1,10,5,'blueberry_sapling');rebuild();finish();
growth.grow(chunk,index,getGrowth('blueberry_sapling'));rebuild();controller.update(.3);
const size=event().pose.size;
world.setBlock(-1,10,5,null);assert.equal(event().kind,'break');
near(event().from.size,size);near(event().to.size,size);
rebuild();assert.ok(chunk.mesh.geometry,'Removed plant can finish visually');
assert.equal(world.getBlockId(-1,10,5),0);
finish();
world.setBlock(-1,10,5,'blueberry_bush_full');rebuild();controller.update(.15);
world.setBlock(-1,10,5,'stone');assert.equal(controller.active.size,0,'Solid replacement cancels');rebuild();

// Bound work during mass commands; unrendered/far plants still commit normally.
for(let x=0;x<16;x++)for(let z=0;z<4;z++)world.setBlock(x-16,10,z,'blueberry_bush_full');
assert.equal(controller.active.size,MAX_PLANT_ANIMATIONS);
rebuild();for(let i=0;i<180;i++)controller.update(1/144);
for(const a of Object.values(chunk.mesh.geometry.attributes)) {
    assert.ok(a.array.every(Number.isFinite));
    assert.ok(a.updateRanges.length<=1,'Culled buffers have bounded update ranges');
}
controller.dispose();assert.equal(controller.active.size,0);assert.equal(world.plantAnimations,null);
const isolated=new PlantAnimations(world,{position:new Vector3(900,10,900)});
world.setBlock(-1,10,5,'blueberry_bush_few');assert.equal(isolated.active.size,0,'Far plants change without animations');
isolated.camera.position.set(-1,11,5);world.setBlock(-1,10,5,'blueberry_bush_full');
assert.equal(isolated.active.size,1);world.unloadChunk(chunk);isolated.update(.016);
assert.equal(isolated.active.size,0,'Unloading releases animation references');isolated.dispose();
world.dispose();
console.log('OK: animacje roślin — wzrost, owoce, pełny ekwipunek, przerwania, remesh, zapis i ograniczony koszt.');
