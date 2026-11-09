import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readTexturePng } from './texture_regions.mjs';
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
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, context);
    }
});
const { getBlueberryFaces } = await import('../src/rendering/BlueberryGeometry.js');
const { BLUEBERRY_MODELS } = await import('../assets/models/blueberry/model-data.js');
const { getBlockId, getBlockDefinition, getGrowth, bushStages, isPlantId, getBlockSound } = await import('../src/blocks/BlockRegistry.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { buildBlockGeometry } = await import('../src/player/PlayerModel.js');
const { riverPlantBounds } = await import('../src/interaction/RiverPlantBounds.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { Scene, Vector3 } = await import('three');
const stages = bushStages('blueberry');
assert.deepEqual(stages.map(getBlockId), [94,95,96,97], 'Existing block IDs must stay stable');
for (const type of stages) {
    assert.equal(isPlantId(getBlockId(type)), true);
    assert.equal(getBlockSound(type), 'plant');
    const icon = readTexturePng(getBlockDefinition(type).modelIcon);
    assert.equal(icon.subarray(1,4).toString(), 'PNG');
}
const counts = { young:30, empty:30, few:66, full:174 };
for (const [stage, count] of Object.entries(counts)) {
    const faces = getBlueberryFaces(stage);
    assert.equal(faces.length, count);
    assert.equal(faces, getBlueberryFaces(stage), 'Templates are shared');
    const points = faces.flatMap(f => f.vertices);
    const size = [0,1,2].map(a => Math.max(...points.map(p=>p[a])) - Math.min(...points.map(p=>p[a])));
    const expected = stage === 'young' ? [.4125,.4125,.34375] : [.75,.75,.625];
    size.forEach((s,i)=>assert.ok(Math.abs(s-expected[i])<1e-6));
    assert.equal(Math.min(...points.map(p=>p[1])), 0, 'Root stays at ground level');
    for (const f of faces) {
        assert.ok(f.uv.flat().every(n=>n>=0&&n<=1));
        assert.ok(Math.abs(Math.hypot(...f.normal)-1)<1e-6);
        const a=new Vector3(...f.vertices[2]).sub(new Vector3(...f.vertices[0]));
        const b=new Vector3(...f.vertices[1]).sub(new Vector3(...f.vertices[0]));
        assert.ok(a.cross(b).dot(new Vector3(...f.normal))>0, 'Front winding matches the normal');
        assert.ok(f.weights.every(n=>n>=0&&n<=102), 'Bounded shared wind');
    }
}
assert.deepEqual(BLUEBERRY_MODELS.empty.filter(p=>!p.berry), BLUEBERRY_MODELS.full.filter(p=>!p.berry));
assert.deepEqual(BLUEBERRY_MODELS.few.filter(p=>!p.berry), BLUEBERRY_MODELS.full.filter(p=>!p.berry));
const berries = BLUEBERRY_MODELS.full.filter(p=>p.berry);
assert.equal(berries.length, 24);
assert.equal(BLUEBERRY_MODELS.few.filter(p=>p.berry).length, 6);
for(const berry of BLUEBERRY_MODELS.few.filter(p=>p.berry)) assert.ok(berries.some(b=>JSON.stringify(b)===JSON.stringify(berry)));
for(const berry of berries) {
    const vertices=berry.faces.flatMap(f=>f.v);
    for(let a=0;a<3;a++) assert.equal(Math.max(...vertices.map(v=>v[a]))-Math.min(...vertices.map(v=>v[a])),1/16);
}
const world=new World(new Scene(), 123, new Map(), 'classic');
const chunk=new Chunk(0,0);chunk.skyLight.fill(15);world.chunks.set('0,0',chunk);
// Old one-byte chunks and new two-byte chunks retain all four old states.
for(const ArrayType of [Uint8Array,Uint16Array]) {
    const old = new ArrayType(chunk.blocks.length);
    stages.forEach((type,i)=>old[i]=getBlockId(type));
    const loaded=new Chunk(0,0);assert.ok(loaded.loadBlocks(old));
    assert.deepEqual([...loaded.blocks.slice(0,4)],[94,95,96,97]);
}
const growth=new PlantGrowth(world);
chunk.setId(5,9,5,getBlockId('dirt'));chunk.setId(5,10,5,94);
const index=5+5*16+10*256;
assert.equal(growth.grow(chunk,index,getGrowth(stages[0])),true);
assert.equal(world.getBlockId(5,10,5),96,'Young grows directly to first fruit');
assert.equal(growth.grow(chunk,index,getGrowth(stages[2])),true);
assert.equal(world.getBlockId(5,10,5),97);
chunk.setId(5,10,5,95);
assert.equal(growth.grow(chunk,index,getGrowth(stages[1])),true);
assert.equal(world.getBlockId(5,10,5),96,'Harvested adult regrows fruit');
for (let i=0;i<stages.length;i++) chunk.setId(2+i*3,10,8,getBlockId(stages[i]));
const geometry=buildChunkGeometry(chunk,world);
assert.equal(geometry.groups.length,2,'Only terrain and the shared plant draw group');
for(const name of ['position','normal','uv','color','plantMotion']) assert.ok([...geometry.getAttribute(name).array].every(Number.isFinite));
for(let i=0;i<stages.length;i++) {
    const def=getBlockDefinition(stages[i]),x=2+i*3,y=10,z=8;
    const bounds=riverPlantBounds(def.riverPlant,x,y,z);
    const cx=x+(bounds.min[0]+bounds.max[0])/2,cz=z+(bounds.min[2]+bounds.max[2])/2;
    const ray=new VoxelRaycast(world,5);
    assert.equal(ray.cast(new Vector3(cx,y+2,cz),new Vector3(0,-1,0)).block.type,stages[i]);
    const held=buildBlockGeometry(stages[i]);
    assert.equal(held.index.count,getBlueberryFaces(['young','empty','few','full'][i]).length*6);
    assert.ok(new Set(held.getAttribute('uv').array).size>4,'Held model has actual leaf/berry UVs');
    held.dispose();
}
geometry.dispose();
console.log('OK: borówka — zgodne ID/zapisy, cztery modele i UV, 24 kostki 1/16, niezmienne dorosłe liście, wzrost, celownik, wspólny mesh i model w ręce.');
