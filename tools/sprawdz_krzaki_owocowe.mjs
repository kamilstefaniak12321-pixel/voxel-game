import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// Exercise the real mesher, animations, picking and held model without a DOM.
// Distinct atlas rectangles catch accidentally applying the leaf UV to fruit.
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format:'module', shortCircuit:true, source:'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format:'module', shortCircuit:true, source:`
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=name=>name==='models/blueberry/atlas'
                    ?{uMin:0,uMax:.25,vMin:0,vMax:.25}:{uMin:.5,uMax:.5625,vMin:.5,vMax:.5625};
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, {...context,format:'module'});
        return next(url, context);
    }
});

const { FRUIT_BUSH_PROFILES, getFruitBushFaces, getFruitItemModel } = await import('../src/rendering/FruitBushGeometry.js');
const { fruitBushPose, sampleFruitBushAnimation, transformFruitBushVertex } = await import('../src/rendering/FruitBushAnimation.js');
const { getBlueberryFaces } = await import('../src/rendering/BlueberryGeometry.js');
const { PlantAnimations, MAX_PLANT_ANIMATIONS } = await import('../src/rendering/PlantAnimations.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { buildBlockGeometry } = await import('../src/player/PlayerModel.js');
const { riverPlantBounds } = await import('../src/interaction/RiverPlantBounds.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { getBlockId, getBlockDefinition, getGrowth, getHarvest, bushStages, isPlantId, getBlockSound } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { getCategory } = await import('../src/items/categories.js');
const { modelIconPixels } = await import('../src/ui/ModelIcon.js');
const { BUSH_GROWTH_SECONDS } = await import('../src/config.js');
const { Scene, Vector3 } = await import('three');

const species = ['strawberry','blackberry','chili','hazel'];
const items = ['strawberry','blackberry','chili_pepper','hazelnut'];
const stages = ['young','empty','few','full'];
const near = (a,b,message='',eps=1e-6) => assert.ok(Math.abs(a-b)<=eps,`${message}: ${a} != ${b}`);
const bounds = faces => {
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(const f of faces)for(const v of f.vertices)for(let a=0;a<3;a++){min[a]=Math.min(min[a],v[a]);max[a]=Math.max(max[a],v[a]);}
    return {min,max,size:max.map((n,a)=>n-min[a]),center:max.map((n,a)=>(n+min[a])/2)};
};
const round = n => Math.round(n*1e7)/1e7;
const signature = (faces,offset=[0,0,0]) => faces.map(f=>JSON.stringify({
    vertices:f.vertices.map(v=>v.map((n,a)=>round(n-offset[a]))).sort(),
    normal:f.normal.map(round),color:f.color,uv:f.uv?.map(v=>v.map(round)),texture:f.texture??null
})).sort();
const leaves = faces => faces.filter(f=>f.fruitIndex<0);
const fruit = (faces,index) => faces.filter(f=>f.fruitIndex===index);

// Changing the visual model must not move bushes out of Plants in creative,
// crafting and the wiki. Include blueberry and every saved growth stage.
for(const name of [...species,'blueberry']) {
    for(const type of bushStages(name))assert.equal(getCategory(type),'rosliny',`${type}: plant category`);
}
for(const item of [...items,'blueberry'])assert.equal(getCategory(item),'owoce',`${item}: fruit category`);

// Stable world/inventory identities and biological timing, independent of art.
for(const [s,name] of species.entries()) {
    const types=bushStages(name), profile=FRUIT_BUSH_PROFILES[name];
    assert.deepEqual(types.map(getBlockId),[34+s*4,35+s*4,36+s*4,37+s*4]);
    assert.equal(ITEM_TYPES[items[s]].plants,types[0]);
    types.forEach((type,i)=>{
        const def=getBlockDefinition(type);
        assert.equal(def.model,'riverPlant'); assert.equal(isPlantId(def.id),true);
        assert.equal(getBlockSound(type),'plant'); assert.equal(def.drops,types[0]);
        assert.equal(def.riverPlant.kind,`fruitBush:${name}:${stages[i]}`);
        if(i<3)assert.deepEqual(getGrowth(type),{into:types[i+1],seconds:BUSH_GROWTH_SECONDS});
        else assert.equal(getGrowth(type),null);
        if(i>=2)assert.deepEqual(getHarvest(type),{
            item:items[s],count:i===2?[1,2]:name==='hazel'?[2,3]:[2,4],becomes:types[1]
        });
    });
    const full=getFruitBushFaces(name,'full');
    assert.ok(full.length<=350,`${name}: bounded full mesh, ${full.length} faces`);
    assert.equal(new Set(full.filter(f=>f.fruitIndex>=0).map(f=>f.fruitIndex)).size,profile.fruitCount);
    const adultLeaves=signature(leaves(full));
    for(const stage of stages){
        const faces=getFruitBushFaces(name,stage), b=bounds(faces);
        assert.equal(faces,getFruitBushFaces(name,stage),'Templates are cached');
        assert.ok(faces.length>0); assert.ok(b.min[1]>=-1e-8,'No plant below soil');
        assert.ok(b.max[1]<=profile.height+1e-6,`${name}: height fits profile`);
        assert.ok(b.max[1]<=1+1e-6,`${name}: does not penetrate a ceiling in the cell above`);
        for(const f of faces){
            assert.equal(f.vertices.length,4);
            assert.ok(f.vertices.flat().every(Number.isFinite));
            assert.ok(f.center.every(Number.isFinite));
            assert.ok(f.color.every(n=>Number.isFinite(n)&&n>=0&&n<=255));
            assert.ok(f.weights.every(n=>Number.isFinite(n)&&n>=0&&n<=102));
            near(Math.hypot(...f.normal),1,'Unit normal');
            const a=new Vector3(...f.vertices[2]).sub(new Vector3(...f.vertices[0]));
            const b=new Vector3(...f.vertices[1]).sub(new Vector3(...f.vertices[0]));
            assert.ok(a.cross(b).dot(new Vector3(...f.normal))>1e-10,'Mesh winding agrees with surface normal');
            if(f.uv)assert.ok(f.uv.flat().every(n=>n>=0&&n<=1));
        }
        if(stage==='young'){
            const adult=leaves(full),young=leaves(faces);
            assert.deepEqual(signature(young.map(f=>({...f,vertices:f.vertices.map(v=>v.map(n=>n/profile.youngScale))}))),signature(adult));
        }else assert.deepEqual(signature(leaves(faces)),adultLeaves,'Adult foliage does not jump between harvest stages');
        const count=new Set(faces.filter(f=>f.fruitIndex>=0).map(f=>f.fruitIndex)).size;
        assert.equal(count,stage==='full'?profile.fruitCount:stage==='few'?profile.fewCount:0);
    }
    for(let i=0;i<profile.fewCount;i++)assert.deepEqual(signature(fruit(getFruitBushFaces(name,'few'),i)),signature(fruit(full,i)));
    for(let i=0;i<profile.fruitCount;i++){
        const components=fruit(full,i),pivot=components[0].center;
        components.forEach(f=>assert.deepEqual(f.center,pivot,'Whole fruit uses one pivot, including its stem/cap'));
        const extent=bounds(components);
        extent.center.forEach((n,a)=>near(n,pivot[a],'Fruit pivot at its own centre'));
        // Source fruit voxel coordinates can be translated/rotated, but edges
        // retain the 1/16 modelling unit rather than becoming a paper sprite.
        assert.ok(extent.size.every(n=>n>0),'Fruit has volume along all axes');
    }
    const heldBush=buildBlockGeometry(types[3]),uv=heldBush.getAttribute('uv').array;
    assert.ok(uv.some(n=>n<.25)&&uv.some(n=>n>.5),'Held bush keeps separate leaf and fruit texture regions');
    heldBush.dispose();
}

// The item is one actual fruit from the bush, not a separately invented icon.
const iconHashes=new Set();
for(const [s,item]of [...items,'blueberry'].entries()){
    const name=species[s]??'blueberry',model=getFruitItemModel(item);
    assert.equal(model.species,name);
    const onBush=name==='blueberry'
        ?getBlueberryFaces('full').filter(f=>f.berry&&f.partIndex===15)
        :fruit(getFruitBushFaces(name,'full'),0);
    const local=bounds(model.faces),planted=bounds(onBush);
    assert.ok(local.size.every(n=>n>0));
    // Blueberry keeps the imported UV and cube; new fruit keeps every component.
    const geometrySignature=(faces,center)=>faces.map(f=>JSON.stringify({
        vertices:f.vertices.map(v=>v.map((n,a)=>round(n-center[a]))).sort(),
        normal:f.normal.map(round),color:f.color,uv:f.uv?.map(v=>v.map(round))
    })).sort();
    assert.deepEqual(geometrySignature(model.faces,local.center),geometrySignature(onBush,planted.center),`${name}: identical fruit source`);
    const held=buildBlockGeometry(item);held.computeBoundingBox();
    const extent=held.boundingBox.getSize(new Vector3());
    assert.ok(extent.x>0&&extent.y>0&&extent.z>0,'Held fruit is 3D');
    near(Math.max(extent.x,extent.y,extent.z),.8,'Readable held fruit size');
    assert.equal(held.index.count,model.faces.length*6);
    for(const attr of Object.values(held.attributes))assert.ok(attr.array.every(Number.isFinite));
    held.dispose();
    let texturedSamples=0;
    const pixels=modelIconPixels(model.faces,48,(texture,u,v,out)=>{
        assert.ok(Number.isFinite(u)&&Number.isFinite(v));
        if(texture==='models/blueberry/atlas')texturedSamples++;
        out[0]=texture==='models/blueberry/atlas'?100:255;
        out[1]=texture==='models/blueberry/atlas'?50:255;
        out[2]=texture==='models/blueberry/atlas'?190:255;out[3]=255;
    },model.texture);
    assert.equal(pixels.length,48*48*4);
    assert.ok(pixels.some((n,i)=>i%4===3&&n>0),'Fruit icon is visible');
    assert.ok(pixels.some((n,i)=>i%4===3&&n===0),'Icon retains transparent background');
    if(name==='blueberry')assert.ok(texturedSamples>0,'Blueberry icon samples its imported texture');
    iconHashes.add(Buffer.from(pixels).toString('base64'));
}
assert.equal(iconHashes.size,5,'All five fruit items are visually distinguishable');
assert.equal(getFruitItemModel('stone'),null);
const legacy=buildBlockGeometry('stick');assert.equal(legacy.index.count,12,'Unrelated flat items retain their geometry');legacy.dispose();

// Leaf transparency must not write depth over the fruit behind it. Test both
// drawing orders so the icon is correct for intersecting cards, not just a
// conveniently sorted model.
const card=(z,color,texture)=>({vertices:[[-.5,.5,z],[.5,.5,z],[-.5,-.5,z],[.5,-.5,z]],
    normal:[0,0,1],color,texture,uv:[[0,0],[1,0],[0,1],[1,1]]});
const back=card(0,[0,0,255],'solid'),front=card(.05,[255,0,0],'cutout');
const sampler=(transparent)=>(texture,u,v,out)=>{out.set([255,255,255,transparent&&texture==='cutout'?0:255]);};
const transparent=modelIconPixels([front,back],48,sampler(true));
assert.deepEqual(transparent,modelIconPixels([back,front],48,sampler(true)),'Transparent cards do not depend on drawing order');
for(let p=0;p<transparent.length;p+=4)if(transparent[p+3]){
    assert.equal(transparent[p],0,'Transparent foreground never covers the rear colour');
    assert.ok(transparent[p+2]>0);
}
const opaque=modelIconPixels([front,back],48,sampler(false));
assert.ok(opaque.some((n,i)=>i%4===0&&n>0),'Opaque foreground really occludes the rear fruit');

// Real world pipeline: negative chunk coordinates, saves, growth, harvest and
// animation interruption. Animations must not change the underlying inventory.
const gameSource=(await readFile(new URL('../src/game/Game.js',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
function method(signature){
    const body=gameSource.split(`    ${signature} {`)[1].split('\n    }\n')[0];
    return new Function('getHarvest','THREE',`return function ${signature} {${body}\n}`)(getHarvest,{Vector3});
}
const harvestTarget=method('harvestTarget(hit)'),addHarvest=method('addHarvest(type)');
const world=new World(new Scene(),2138286349,new Map(),'classic');
const chunk=new Chunk(-1,0);chunk.skyLight.fill(15);world.chunks.set('-1,0',chunk);
for(let x=0;x<16;x++)for(let z=0;z<16;z++)chunk.setId(x,9,z,getBlockId('dirt'));
world.rebuildChunkMesh(chunk);
const controller=new PlantAnimations(world,{position:new Vector3(-1,11,5)}),growth=new PlantGrowth(world);
const index=chunk.index(15,10,5),event=()=>controller.overridesFor(chunk)?.get(index);
const rebuild=()=>world.rebuildChunkMesh(chunk);
const settle=()=>{rebuild();for(let i=0;i<5&&controller.active.size;i++){controller.update(3);rebuild();}assert.equal(controller.active.size,0);};
const put=type=>{world.setBlock(-1,10,5,type);settle();};
for(const [s,name]of species.entries()){
    const types=bushStages(name),profile=FRUIT_BUSH_PROFILES[name];
    for(const ArrayType of [Uint8Array,Uint16Array]){
        const old=new ArrayType(chunk.blocks.length);types.forEach((type,i)=>old[i]=getBlockId(type));
        const loaded=new Chunk(0,0);assert.equal(loaded.loadBlocks(old),true);
        assert.deepEqual([...loaded.blocks.slice(0,4)],types.map(getBlockId));
    }
    put(types[0]);growth.grow(chunk,index,getGrowth(types[0]));rebuild();
    assert.equal(world.getBlockId(-1,10,5),getBlockId(types[1]));
    assert.equal(event().kind,'grow');near(event().pose.size,profile.youngScale);
    controller.update(.45);assert.ok(event().pose.size>profile.youngScale&&event().pose.size<1);
    const poseSize=event().pose.size,mesh=chunk.mesh.geometry,saved=chunk.blocks.slice();
    controller.update(.1);assert.equal(chunk.mesh.geometry,mesh,'Animation keeps shared geometry');
    assert.deepEqual(chunk.blocks,saved,'Frame updates never alter saved stage');
    rebuild();assert.ok(event().pose.size>poseSize,'Remesh does not reset growth');settle();
    growth.grow(chunk,index,getGrowth(types[1]));rebuild();controller.update(.5);
    assert.ok(event().pose.fruit.some(n=>n>0&&n<1),'New fruit has intermediate sizes');settle();
    growth.grow(chunk,index,getGrowth(types[2]));rebuild();controller.update(.5);
    for(let i=0;i<profile.fewCount;i++)near(event().pose.fruit[i],1,'Existing fruit preserved');settle();
    const def=getBlockDefinition(types[3]),b=riverPlantBounds(def.riverPlant,-1,10,5);
    const ray=new VoxelRaycast(world,5),cx=-1+(b.min[0]+b.max[0])/2,cz=5+(b.min[2]+b.max[2])/2;
    assert.equal(ray.cast(new Vector3(cx,13,cz),new Vector3(0,-1,0)).block.type,types[3]);
    const inventory=Inventory.load({},'adventure');inventory.slots.forEach((_,i)=>inventory.set(i,{type:'stone',count:64}));
    const game={world,inventory,plantAnimations:controller,addHarvest,onNotice(){},achieve(){}};
    const hit={hit:true,block:{x:-1,y:10,z:5,type:types[3]}};
    assert.equal(harvestTarget.call(game,hit),false);assert.equal(event().kind,'reject');
    assert.equal(world.getBlockId(-1,10,5),getBlockId(types[3]));assert.ok(inventory.slots.every(slot=>slot.type==='stone'));
    rebuild();controller.update(.1);const previous=event();harvestTarget.call(game,hit);assert.equal(event(),previous);
    inventory.set(0,null);assert.equal(harvestTarget.call(game,hit),true);
    assert.equal(world.getBlockId(-1,10,5),getBlockId(types[1]));assert.equal(inventory.slots[0].type,items[s]);
    assert.ok(inventory.slots[0].count>=getHarvest(types[3]).count[0]&&inventory.slots[0].count<=getHarvest(types[3]).count[1]);
    rebuild();controller.update(.12);
    const harvested=event();harvested.pose.berryAngle=0;harvested.pose.leafAngle=0;harvested.pose.lift=0;
    const f=getFruitBushFaces(name,'full').find(f=>f.fruitIndex===0);
    const out=new Float64Array(7);
    f.vertices.forEach((v,i)=>{
        transformFruitBushVertex(f,v,i,harvested.pose,harvested,out);
        for(let axis=0;axis<3;axis++)near(out[axis],f.center[axis]+(v[axis]-f.center[axis])*harvested.pose.fruit[0],'Own fruit centre');
    });settle();
    put(types[0]);growth.grow(chunk,index,getGrowth(types[0]));rebuild();controller.update(.3);
    const size=event().pose.size;world.setBlock(-1,10,5,null);
    assert.equal(event().kind,'break');near(event().from.size,size);near(event().to.size,size);
    rebuild();assert.equal(world.getBlockId(-1,10,5),0);settle();
}

// Different fruit families and package plants can replace an in-flight plant
// without recycling an incompatible pose/fruit-array into the next model.
for(const [from,to]of [['strawberry_bush_full','hazel_bush_full'],['hazel_bush_full','blueberry_bush_full'],['blueberry_bush_full','chili_bush_full'],['chili_bush_full','indygowiec_etap3'],['indygowiec_etap3','blackberry_bush_full']]){
    put(from);world.setBlock(-1,10,5,null);rebuild();controller.update(.1);
    world.setBlock(-1,10,5,to);rebuild();controller.update(.15);
    assert.equal(world.getBlockId(-1,10,5),getBlockId(to));
    for(const a of Object.values(chunk.mesh.geometry.attributes))assert.ok(a.array.every(Number.isFinite),'Cross-family replacement stays finite');
    settle();
}
for(let x=0;x<16;x++)for(let z=0;z<3;z++)world.setBlock(x-16,10,z,bushStages(species[(x+z)%4])[3]);
assert.equal(controller.active.size,MAX_PLANT_ANIMATIONS,'Shared animation budget');rebuild();
for(let i=0;i<90;i++)controller.update(1/144);
for(const a of Object.values(chunk.mesh.geometry.attributes))assert.ok(a.updateRanges.length<=1,'No growing pending range list');
controller.dispose();
const far=new PlantAnimations(world,{position:new Vector3(900,10,900)});
world.setBlock(-1,10,5,'strawberry_bush_few');assert.equal(far.active.size,0);assert.equal(world.getBlockId(-1,10,5),36);
far.camera.position.set(-1,11,5);world.setBlock(-1,10,5,'strawberry_bush_full');rebuild();assert.equal(far.active.size,1);
world.unloadChunk(chunk);far.update(.016);assert.equal(far.active.size,0);far.dispose();world.dispose();
console.log('OK: krzaki owocowe — zgodne ID i zapisy, 4 etapy, wspólne owoce 3D, ikony, wzrost, zbiór, przerwania i ograniczony koszt.');
