// Exact generation/save equivalence plus actual worker scheduling and lifecycle.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Worker as NodeWorker } from 'node:worker_threads';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[]; export const getAtlasAverage=()=>null;
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};
        ` };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});
const { Scene, PerspectiveCamera } = await import('three');
const { World, PLANT_PREFETCH_DISTANCE, PLANT_RETAIN_DISTANCE } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { MeshWorkQueue } = await import('../src/world/MeshWorkQueue.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { PlantAnimations } = await import('../src/rendering/PlantAnimations.js');
let checks = 0;
const eq = (a,b,label) => { assert.deepEqual(a,b,label); checks++; };
const ok = (a,label) => { assert.ok(a,label); checks++; };

// Thousands of entries and repeated invalidations must not leak stale heap
// nodes or require rescanning every queued chunk in each rendered frame.
let priorities = 0, origin = 0;
const queue = new MeshWorkQueue(c => { priorities++; return (c.x-origin)**2; });
const chunks = Array.from({length:3000}, (_,x)=>({x}));
for (const c of chunks) queue.add(c);
for (let i=0;i<3000;i+=3) queue.add(chunks[i]);
eq(queue.size,3000,'Requeue keeps exactly one entry per chunk');
eq(queue.heap.length,3000,'Heap has no stale duplicate nodes');
const before=priorities;
for (let i=0;i<100;i++) eq(queue.peek(),chunks[0],'Nearest item stays first');
eq(priorities,before,'Inspecting work does not rescan or sort the backlog');
origin=2600;queue.reprioritize();
eq(queue.pop(),chunks[2600],'Moving centre refreshes priorities once');
for (let i=0;i<3000;i+=7) queue.delete(chunks[i]);
let previous=-1;
while(queue.size){const c=queue.pop(),d=(c.x-origin)**2;ok(d>=previous,'Heap order after arbitrary removals');previous=d;}
eq(queue.heap.length,0,'All heap storage released');

const coverage=new World(new Scene(),'coverage',new Map(),'classic');
const pendingCoverage=coverage.createChunk(0,0);
eq(coverage.loadQueue.length,0,'No pending data in horizon fixture');
eq(coverage.completeRadius(),0,'Unpublished terrain keeps distant coverage over the player');
coverage.installChunkGeometry(pendingCoverage,null,'terrain');
eq(coverage.completeRadius(),Infinity,'Finished empty terrain is also considered processed');
const remoteCoverage=coverage.createChunk(10,0);
eq(coverage.completeRadius(),128,'Nearest missing mesh limits withdrawal without scanning all chunks');
coverage.unloadChunk(remoteCoverage);
eq(coverage.completeRadius(),Infinity,'Unloading removes obsolete coverage work');
coverage.dispose();

function patch(world,cx,cz) {
    for(let z=cz-1;z<=cz+1;z++)for(let x=cx-1;x<=cx+1;x++){
        const c=world.createChunk(x,z);
        for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++)c.setId(lx,1,lz,getBlockId('dirt'));
        c.setId(5,2,5,getBlockId('short_grass'));
        c.setId(8,2,8,getBlockId('blueberry_sapling'));
        c.skyLight.fill(15);world.markDirty(c);
    }
    return world.getChunk(cx,cz);
}
const world=new World(new Scene(),'queue-plants',new Map(),'classic');
const near=patch(world,0,0),far=patch(world,20,0);
world.updateMeshes();
ok(near.mesh&&near.plantMesh,'Near terrain and plant layers built');
ok(far.mesh&&!far.plantMesh,'Distant terrain has no allocated plant buffers');
for(const c of world.chunks.values())if(!world.wantsPlants(c))ok(!c.plantMesh,'No far plant allocation');
ok(far.mesh.geometry.groups.every(g=>g.materialIndex!==1&&g.count>0),'Terrain omits plant and empty draw groups');
const terrain=near.mesh.geometry;
world.remeshPlants();
eq(world.dirtyChunks.size,0,'Plant quality does not enqueue any terrain rebuild');
world.updateMeshes();
eq(near.mesh.geometry,terrain,'Plant quality keeps terrain buffer identity');
world.setCenter(20*16,0,52);world.updateMeshes();
ok(far.plantMesh,'Approaching builds deferred plants');
eq(near.plantMesh,null,'Leaving retention ring releases old plant buffer');
const plantBuffer=far.plantMesh.geometry;
const expected=buildChunkGeometry(far,world,{terrain:false,plants:true});
for(const name of Object.keys(expected.attributes))eq(plantBuffer.attributes[name].array,expected.attributes[name].array,'Near plant appearance '+name);
expected.dispose();
world.setCenter(11*16,0,52);world.updateMeshes();
eq(far.plantMesh.geometry,plantBuffer,'Prefetched buffer survives a boundary crossing');
eq(far.plantMesh.visible,false,'Plant main mesh hidden at144 blocks');
eq(plantBuffer.groups.length,0,'No draw groups remain for shadow visibility overrides');
eq(plantBuffer.drawRange.count,0,'Pending shadow snapshots also cannot draw hidden plants');
world.setCenter(12*16,0,52);world.updateMeshes();
eq(far.plantMesh.geometry,plantBuffer,'Reentering128 needs no rebuild');
ok(far.plantMesh.visible&&plantBuffer.groups.every(g=>g.count>0),'Visible layer restores only populated groups');
// New plant animations bind only their own layer, leaving terrain untouched.
const camera=new PerspectiveCamera();camera.position.set(20*16+8,3,8);
const animations=new PlantAnimations(world,camera);
world.centerCx=20;world.centerCz=0;
const farTerrain=far.mesh.geometry;
const index=far.index(8,2,8), id=far.blocks[index];
animations.blockChanged(far,index,0,id);
world.updateMeshes();
eq(far.mesh.geometry,farTerrain,'Animation topology does not rebuild terrain');
eq(animations.active.size,1,'Plant placement starts an actual animation');
const event=[...animations.active][0];eq(event.binding?.geometry,far.plantMesh.geometry,'Animation bound to plant buffer');animations.update(.1);
world.unloadChunk(far);
eq(far.plantMesh,null,'Unloading disposes plants');
eq(far.plantShadowMesh,null,'Unloading removes plant shadow proxy');
ok(!world.dirtyPlants.has(far),'Unloading cancels queued plant work');
animations.dispose();world.dispose();
eq(world.scene.children.length,0,'All main objects disposed');
eq(world.shadowScene.children.length,0,'All shadow objects disposed');

// Regression of the recorded ready=2 / pending=0 stall: the shared budget is
// already spent by centre bookkeeping, but a ready result must still progress.
const receiving=new World(new Scene(),'fair',new Map(),'classic');
const data=new Chunk(0,0);data.growing=[];data.torches=[];
let taken=0,applied=0,requests=0,meshCalls=0;
receiving.generation.dispose();
receiving.generation={checkHealth:()=>true,readyChunks:()=>taken?[]:[{cx:0,cz:0}],
    take:()=>{taken++;return data;},applied:()=>applied++,request:()=>requests++,retain:()=>{},dispose:()=>{}};
receiving.centerCx=0;receiving.centerCz=0;receiving.loadRadius=0;receiving.loadQueue=[[0,0,0]];
const nowDescriptor=Object.getOwnPropertyDescriptor(performance,'now');let clock=0;
Object.defineProperty(performance,'now',{configurable:true,value:()=>clock+=10});
receiving.updateMeshes=()=>{meshCalls++;};
try{receiving.update(0,0,0,4);}finally{if(nowDescriptor)Object.defineProperty(performance,'now',nowDescriptor);else delete performance.now;}
eq(applied,1,'A ready chunk is adopted despite an exhausted meshing budget');
eq(receiving.loadQueue.length,0,'Adopted chunk leaves waiting queue');
eq(meshCalls,1,'Meshing still gets a scheduling turn');
receiving.dispose();
console.log(`OK: kolejka i rośliny — ${checks} sprawdzeń kolejności, uczciwego odbioru, zasięgu, pamięci i animacji.`);
