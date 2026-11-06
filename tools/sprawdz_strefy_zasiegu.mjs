import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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
const { Scene } = await import('three');
const { World } = await import('../src/world/World.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { detailAtDistance, fullTerrainDistance } = await import('../src/world/DistanceLod.js');
let checks=0;
const eq=(a,b,message)=>{assert.deepEqual(a,b,message);checks++;};
const ok=(value,message)=>{assert.ok(value,message);checks++;};
eq(fullTerrainDistance(800),192,'Long visual range bounds editable voxel radius');
eq(fullTerrainDistance(32),32,'Short visual range stays short');
eq(detailAtDistance(0,undefined,[64,112]),0,'Near detail');
eq(detailAtDistance(96,undefined,[64,112]),1,'Middle detail');
eq(detailAtDistance(160,undefined,[64,112]),2,'Far detail');
for(const d of [49,60,64,70,79])eq(detailAtDistance(d,0,[64,112]),0,'Hysteresis retains nearby geometry');
for(const d of [49,60,64,70,79])eq(detailAtDistance(d,1,[64,112]),1,'Hysteresis also retains simplified geometry');
eq(detailAtDistance(300,0,[64,112]),2,'Fast outward travel can skip tiers');
eq(detailAtDistance(0,2,[64,112]),0,'Fast return restores full detail');

const world=new World(new Scene(),'distance-rings',new Map(),'classic');
world.setDistanceLod(true);
function patch(cx) {
    for(let x=cx-1;x<=cx+1;x++)for(let z=-1;z<=1;z++) {
        const c=world.createChunk(x,z);
        c.setId(5,1,5,getBlockId('dirt'));
        c.setId(5,2,5,getBlockId('short_grass'));
        c.setId(8,3,8,getBlockId('oak_leaves'));
        c.skyLight.fill(15);world.markDirty(c);
    }
    return world.getChunk(cx,0);
}
const near=patch(0),far=patch(10);
const originalBlocks=far.blocks.slice();
world.updateMeshes();
eq(near.mesh.geometry.userData.leafDetail,0,'Runtime uses full nearby foliage');
eq(far.mesh.geometry.userData.leafDetail,2,'Runtime selects far leaf level');
eq(far.plantMesh.geometry.userData.plantDetail,2,'Runtime selects far plant level');
ok(far.plantMesh.visible,'Simple plants remain visible beyond the old128-block limit');
const oldTerrain=far.mesh.geometry;
world.setCenter(5*16,0,14);
ok(world.dirtyChunks.has(far),'Moving closer schedules leaf restoration');
world.updateMeshes();
eq(far.mesh.geometry.userData.leafDetail,1,'Intermediate leaf tier is built');
ok(far.mesh.geometry!==oldTerrain,'Old mesh replaced only by complete result');
world.setCenter(10*16,0,14);world.updateMeshes();
eq(far.mesh.geometry.userData.leafDetail,0,'Returning to the tree restores original model');
eq(far.plantMesh.geometry.userData.plantDetail,0,'Nearby plants restore player quality');
eq(far.blocks,originalBlocks,'Visual LOD never modifies actual blocks');
eq(world.unsavedChunks.size,0,'Visual transitions never change the save');
const retained=patch(13);
world.setCenter(0,0,15);world.updateMeshes();
ok(retained.plantMesh.visible,'Plants at208 blocks remain available until the readiness-aware shader hands off');
ok(retained.plantMesh.geometry.groups.length>0&&retained.plantMesh.geometry.drawRange.count>0,
    'Retained plant geometry is not silently suppressed by empty draw groups');
eq(retained.plantMesh.geometry.userData.plantDetail,2,'The temporary outer reserve uses only simple plants');
world.setDistanceLod(false);world.updateMeshes();
eq(near.mesh.geometry.userData.leafDetail,0,'Disabling distance mode restores all full models');
world.dispose();
eq(world.scene.children.length,0,'Disposal releases every distance tier');

// Experimental grass has its own LOD thresholds. At96 blocks the selected
// plant tier can be2 while grass would choose1: install must compare against
// their combined level, otherwise every completed mesh queues another one.
const grassWorld=new World(new Scene(),'distance-grass',new Map(),'classic');
grassWorld.setDistanceLod(true);grassWorld.setExperiments({bushyGrass:true});
for(let x=5;x<=7;x++)for(let z=-1;z<=1;z++) {
    const c=grassWorld.createChunk(x,z);
    c.setId(5,1,5,getBlockId('dirt'));c.setId(5,2,5,getBlockId('short_grass'));
    c.skyLight.fill(15);grassWorld.markDirty(c);
}
function drainGrass() {
    const end=performance.now()+2000;
    while((grassWorld.dirtyChunks.size||grassWorld.dirtyPlants.size||Object.values(grassWorld.meshJobs).some(Boolean))&&performance.now()<end)
        grassWorld.updateMeshes(performance.now()+8);
    eq(grassWorld.dirtyChunks.size,0,'Grass terrain queue drains');
    eq(grassWorld.dirtyPlants.size,0,'Combined grass/plant LOD does not enqueue itself forever');
    ok(!Object.values(grassWorld.meshJobs).some(Boolean),'Grass LOD leaves no pending mesher');
}
drainGrass();
const grassChunk=grassWorld.getChunk(6,0);
eq(grassChunk.plantMesh.geometry.userData.bushyGrassDetail,2,'Distant experimental grass uses the coarser required level');
grassWorld.setCenter(96,0,14);drainGrass();
eq(grassChunk.plantMesh.geometry.userData.bushyGrassDetail,0,'Approaching restores detailed experimental grass');
eq(grassChunk.plantMesh.geometry.userData.plantDetail,0,'Approaching restores plant detail metadata');
grassWorld.dispose();
console.log(`OK: strefy zasięgu — ${checks} kontroli histerezy, pamięci, przybliżania i zapisu.`);
