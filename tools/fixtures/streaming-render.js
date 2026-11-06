// Real atlas + WebGL rasterization: split meshes must retain the old image.
import * as THREE from 'three';
import { Chunk } from '../../src/world/Chunk.js';
import { BLOCK_TYPES, getBlockId } from '../../src/blocks/BlockRegistry.js';
import { atlasReady, blockAtlasTexture } from '../../src/rendering/TextureAtlas.js';
import { buildChunkGeometry, createChunkGeometryJob, setLeafParts } from '../../src/rendering/ChunkMesher.js';
import { applyPlantModelLevel } from '../../src/rendering/PlantModelLevels.js';

export async function run() {
    await atlasReady;
    applyPlantModelLevel('detailed'); setLeafParts(true);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(512, 384); document.body.append(renderer.domElement);
    renderer.setClearColor(0x435060);
    const gl = renderer.getContext(), emptyDraws = [];
    for (const [name, countIndex] of [['drawElements',1],['drawArrays',2]]) {
        const original = gl[name].bind(gl);
        gl[name] = (...args) => { if (args[countIndex] === 0) emptyDraws.push(name); return original(...args); };
    }
    const materials = [0,1,2,3].map(index => new THREE.MeshBasicMaterial({
        map: blockAtlasTexture, side: THREE.DoubleSide, alphaTest: index === 1 || index === 3 ? .5 : 0,
        transparent: index === 2, opacity: index === 2 ? .65 : 1, depthWrite: index !== 2
    }));
    const chunk = new Chunk(0,0), world = { getChunk:()=>null, experiments:{bushyGrass:false} };
    for (let x=0;x<16;x++) for(let z=0;z<16;z++) {
        chunk.setId(x,2,z,getBlockId('grass')); chunk.setId(x,1,z,getBlockId('dirt'));
    }
    const waterPlant = Object.keys(BLOCK_TYPES).find(name => BLOCK_TYPES[name].riverPlant?.waterlogged);
    const names = ['short_grass','tall_grass','blueberry_bush_full','strawberry_bush_full',waterPlant,'oak_leaves','water'];
    names.forEach((name,i) => chunk.setId(2+i*2,3,7,getBlockId(name)));
    chunk.skyLight.fill(15);
    const camera = new THREE.PerspectiveCamera(45,512/384,.1,200);
    camera.position.set(23,15,25); camera.lookAt(8,2,8);
    const target = new THREE.WebGLRenderTarget(512,384), checks=[];
    const check = (condition,label) => { if(!condition) throw Error(label); checks.push(label); };
    const render = scene => {
        emptyDraws.length=0; renderer.info.reset();
        renderer.setRenderTarget(target); renderer.render(scene,camera);
        const pixels=new Uint8Array(512*384*4); renderer.readRenderTargetPixels(target,0,0,512,384,pixels);
        return {pixels,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,empty:emptyDraws.length};
    };
    const finish = options => {
        const job=createChunkGeometryJob(chunk,world,options);
        let value,steps=0;
        do { value=job.step(performance.now()+.25); if(++steps>10000) throw Error('Mesher did not finish'); } while(!value.done);
        return value.geometry;
    };
    const oldGeometry=buildChunkGeometry(chunk,world), oldScene=new THREE.Scene();
    oldScene.add(new THREE.Mesh(oldGeometry,materials));
    const terrain=finish({terrain:true,plants:false}), plants=finish({terrain:false,plants:true});
    const splitScene=new THREE.Scene(), groundMesh=new THREE.Mesh(terrain,materials), plantMesh=new THREE.Mesh(plants,materials);
    splitScene.add(groundMesh,plantMesh);
    check(terrain.groups.every(g=>g.count>0&&g.materialIndex!==1),'Terrain contains no empty or plant groups');
    check(plants.groups.every(g=>g.count>0&&g.materialIndex===1),'Plants contain only nonempty plant groups');
    const before=render(oldScene),after=render(splitScene);
    let different=0,maxDifference=0;
    for(let i=0;i<before.pixels.length;i++) {const d=Math.abs(before.pixels[i]-after.pixels[i]); if(d>1)different++;maxDifference=Math.max(maxDifference,d);}
    check(different===0,`Same rendered image including submerged plants: ${different} differing channels (max ${maxDifference})`);
    check(before.triangles===after.triangles,'Splitting keeps every rendered triangle');
    check(after.empty===0,'Split geometry issues no zero-count WebGL draws');
    const withPlants=after.calls; plantMesh.visible=false;
    const hidden=render(splitScene);
    check(hidden.empty===0&&hidden.calls<withPlants,'Hidden plants are omitted before draw submission');
    plantMesh.visible=true; const restored=render(splitScene);
    check(restored.calls===withPlants&&restored.empty===0,'Returning plants restores draws without empty calls');
    const groundOnly=new Chunk(0,0);groundOnly.setId(8,2,8,getBlockId('stone'));groundOnly.skyLight.fill(15);
    const groundJob=createChunkGeometryJob(groundOnly,world,{terrain:true,plants:false});
    const groundGeometry=groundJob.step(Infinity).geometry;
    check(groundGeometry.groups.length===1&&groundGeometry.groups[0].materialIndex===0,'Plant-free terrain has one nonempty material group');
    renderer.setRenderTarget(null);renderer.render(splitScene,camera);
    const result={checks,counts:{before:before.calls,after:after.calls,hidden:hidden.calls},triangles:after.triangles,different,maxDifference};
    target.dispose();oldGeometry.dispose();terrain.dispose();plants.dispose();groundGeometry.dispose();
    materials.forEach(m=>m.dispose());renderer.dispose();
    return result;
}
