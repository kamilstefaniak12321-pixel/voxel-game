// Production raft physics/controller/crafting/save. Only the DOM texture loader is stubbed.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(s,c,next){return next(s==='three'?new URL('../lib/three/three.module.js',import.meta.url).href:s,c);},
    load(url,c,next){
        if(url.endsWith('/src/rendering/TextureAtlas.js'))return {format:'module',shortCircuit:true,source:`
            import {Color} from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`};
        return next(url,url.endsWith('.js')&&/\/(src|assets|lib)\//.test(url)?{...c,format:'module'}:c);
    }
});
const THREE=await import('three');
const {RaftBody,RAFT_CAPS}=await import('../src/game/RaftPhysics.js');
const {Rafts}=await import('../src/game/Rafts.js');
const {RAFT_MODEL,RAFT_THICKNESS}=await import('../src/rendering/RaftModel.js');
const {Player}=await import('../src/player/Player.js');
const {Inventory}=await import('../src/game/Inventory.js');
const {findRecipe,craftFromGrid}=await import('../src/crafting/Crafting.js');
const {GROUPS}=await import('../src/crafting/recipes.js');
const {WorldSaver}=await import('../src/storage/WorldSaver.js');
const {WorldStorage}=await import('../src/storage/WorldStorage.js');
const {World}=await import('../src/world/World.js');
const {memoryDatabase}=await import('./fixtures/memory-database.mjs');
const {getBlockId,isSolidId,fallingWaterId}=await import('../src/blocks/BlockRegistry.js');
const {WATER_SURFACE}=await import('../src/config.js');
const WATER=getBlockId('water'),STONE=getBlockId('stone'),REST=10+WATER_SURFACE+.08;
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const near=(a,b,t,label)=>ok(Math.abs(a-b)<=t,`${label}: ${a} vs ${b}`);
const keys=(...held)=>({isKeyDown:k=>held.includes(k),consumeMouseDelta:()=>({x:0,y:0})});

function world({drop=0,flow=2,dry=false,wall=Infinity,roof=Infinity,missing=false}={}) {
    const w={reads:0,flowReads:0,chunkReads:0,generated:0,spawnPoint:{x:.5,z:.5},ensureColumnLoaded(){this.generated++;},
        getGroundY:()=>6,getFlow:()=>null,getLight:()=>({sky:15,red:0,green:0,blue:0}),
        getChunk(x){this.chunkReads++;return missing&&x>=1?null:{};},
        getWaterFlow(){this.flowReads++;return flow?[flow,0]:null;},
        getBlockId(x,y,z){this.reads++;
            if(x>=wall&&y>=7 || x>=roof&&y===12)return STONE;
            const top=10+(x<0?drop:0),floor=6+(x<0?drop:0);
            if(y<=floor)return STONE;
            if(dry)return 0;
            if(drop&&x===0&&y>10&&y<=10+drop)return fallingWaterId(Math.min(drop,16));
            return y<=top?WATER:0;
        },isSolid(x,y,z){return isSolidId(this.getBlockId(x,y,z));},
        takeUnsavedChunks:()=>[],markUnsaved(){},hasUnsavedChanges:()=>false};
    return w;
}
function body(w,props={}){return new RaftBody(w,{id:1,x:-5.5,y:REST,z:.5,yaw:-Math.PI/2,...props});}
function advance(b,seconds,rate=60,input=null,rider=null){
    let minY=b.pos.y,ground=0,maxSteps=0;
    for(let i=0;i<seconds*rate;i++){
        b.update(1/rate,input,rider);minY=Math.min(minY,b.pos.y);ground+=Number(b.grounded);maxSteps=Math.max(maxSteps,b.steps);
        assert.ok([...b.pos.toArray(),...b.vel.toArray()].every(Number.isFinite),'finite trajectory');
        assert.ok(!b.collides(undefined,undefined,undefined,undefined,rider),'no solid penetration');
    }
    checks+=2;return {minY,ground,maxSteps,end:b.pos.toArray()};
}
function game(w=world({flow:0}),state){
    const camera=new THREE.PerspectiveCamera(),player=new Player(w,camera);
    player.pos.set(-5.5,REST+.003,.5);player.updateCamera();
    const info={id:'raft-test'},inventory=Inventory.load(info,'adventure');
    const g={world:w,player,camera,inventory,scene:new THREE.Scene(),mode:'adventure',sky:{},shadows:{}};
    Object.defineProperty(g,'selectedBlock',{get:()=>inventory.slots[inventory.selected]?.type});
    g.rafts=new Rafts(g,state);return g;
}

// Exact footprint/texture density, outward winding and shared item mesh.
const bounds=new THREE.Box3();
for(const face of RAFT_MODEL.faces){
    const v=face.vertices.map(p=>new THREE.Vector3(...p));v.forEach(p=>bounds.expandByPoint(p));
    const n=v[2].clone().sub(v[0]).cross(v[1].clone().sub(v[0])).normalize();
    ok(n.dot(new THREE.Vector3(...face.normal))>.999,'outward-facing plank triangles');
    ok(face.texture==='oak_planks'&&face.uv.flat().every(n=>n>=0&&n<=1),'reuse plank tile without atlas bleed');
}
eq(bounds.getSize(new THREE.Vector3()).toArray(),[1,RAFT_THICKNESS,2],'requested 2x1 footprint');
eq(RAFT_MODEL.faces.length*2,20,'20 triangles, no internal faces');

// All species can mix, in either row. Vertical planks still make sticks.
for(const type of GROUPS.planks.types){
    for(const row of [0,2]){
        const inv=game().inventory;inv.craft[row]={type,count:1};inv.craft[row+1]={type:'oak_planks',count:1};
        eq(findRecipe(inv.craft)?.id,'raft','horizontal mixed planks');
        const made=craftFromGrid(inv);eq([made.type,made.count],['raft',1],'one raft');
        eq(inv.craft,[null,null,null,null],'exactly two planks consumed');
    }
    ok(findRecipe([{type,count:1},null,{type,count:1},null])?.id!=='raft','vertical recipe unchanged');
}

const drift=[];
for(const rate of [30,60,120]){
    const b=body(world({flow:0}));advance(b,10,rate);near(b.pos.y,REST,.001,`${rate}Hz stable float`);
    b.world=world();const result=advance(b,12,rate);drift.push(b.pos.x);
    near(b.pos.x,-5.5+24-2/3,.04,`${rate}Hz river drift with drag`);
    near(b.pos.y,REST,.001,'no sinking on river');eq(result.ground,0,'no riverbed contact');
    ok(b.world.flowReads<=12*rate*2,'one resolved current per physics step');
}
ok(Math.max(...drift)-Math.min(...drift)<.025,'frame rate independent drift');
const falls=[];
for(const drop of [1,8,16,32])for(const rate of [30,60,120]){
    const b=body(world({drop}),{y:REST+drop,vx:2});const result=advance(b,14,rate);
    ok(b.pos.x>10,`${drop}-block waterfall is traversed`);
    near(b.pos.y,REST,.025,`${drop}-block waterfall ${rate}Hz lands floating`);
    eq(result.ground,0,'waterfall does not sink to bed');falls.push({drop,rate,...result});
}
const controlled=body(world({flow:0}));advance(controlled,2,60,keys('KeyW'),{width:.6,height:1.8,yaw:0});
ok(controlled.pos.z<-4 && Math.abs(controlled.pos.x+5.5)<.01,'camera-relative paddle direction');
const diagonal=body(world({flow:0}));advance(diagonal,2,60,keys('KeyW','KeyD'),{width:.6,height:1.8,yaw:0});
near(diagonal.pos.distanceTo(new THREE.Vector3(-5.5,REST,.5)),controlled.pos.z<0?.5-controlled.pos.z:0,.01,'no diagonal speed boost');
const bank=body(world({wall:5}),{vx:8});advance(bank,5);ok(bank.pos.x<=4.001&&bank.pos.x>3.9,'whole 2x1 hull stops at bank');
const roof=body(world({roof:5}));advance(roof,8,60,keys(),{width:.6,height:1.8,yaw:0});
ok(roof.pos.x<=4.701,'passenger head cannot pass through low bridge');
const dry=body(world({dry:true}),{y:35,vx:8,vy:-16});advance(dry,5);
near(dry.pos.y,7+RAFT_THICKNESS,.002,'high-speed dry landing without tunneling');
const unloaded=body(world({missing:true}),{x:13,vx:2});advance(unloaded,3);
ok(unloaded.pos.x<=14.751&&unloaded.waiting,'stop before unloaded hull chunk');
eq(unloaded.world.generated,0,'raft never generates missing chunks');
const stalled=body(world());stalled.update(20);eq(stalled.steps,6,'bounded work after suspended tab');

// Production terrain and authoritative flow, including its actual waterfall/bend.
const natural=new World(new THREE.Scene(),42,new Map(),'realistic');
natural.light={initChunk(){},blockChanged(){},takeChangedChunks(){}};natural.fluids.now=()=>0;
try {
    for(let cz=-41;cz<=-39;cz++)for(let cx=-13;cx<=-11;cx++)natural.generateChunk(cx,cz);
    for(let i=0;i<6000;i++){
        natural.fluids.update(.12,1);
        if(!natural.fluids.pending&&!natural.fluids.scans.size&&!natural.fluids.boundaries.size)break;
    }
    const b=body(natural,{x:-188.5,y:83+WATER_SURFACE+.08,z:-631.5,yaw:Math.PI/2});
    const result=advance(b,9,60,keys(),{width:.6,height:1.8,yaw:Math.PI/2});
    ok(b.pos.x<-200&&b.pos.y<77,`real seed-42 waterfall and bend are traversed: ${JSON.stringify({state:b.state(),water:b.water,result})}`);
    ok(b.pos.y>73&&result.ground===0,'real receiving river supports the raft');
} finally {natural.dispose();}

// Real player, item transactions, aim occlusion, saved mounted state and cleanup.
const g=game(),r=g.rafts;
g.inventory.add('raft',2);g.inventory.selected=g.inventory.slots.findIndex(v=>v?.type==='raft');
const hit={hit:true,block:{x:-6,y:10,z:0,type:'water'}};
ok(r.place(hit),'place on exposed water');eq(g.inventory.slots[g.inventory.selected].count,1,'consume one item');
ok(!r.place(hit),'refuse overlapping placement');eq(g.inventory.slots[g.inventory.selected].count,1,'failed placement costs nothing');
const b=r.bodies[0];ok(r.mount(b),'board');const before=g.player.clock;
r.update(1/60,keys('KeyW'));near(g.player.clock-before,1/60,1e-9,'mounted clock once per frame');
near(g.player.pos.y,b.pos.y+.003,1e-9,'passenger anchored above deck');
ok(!g.player.swimming&&!g.player.flying,'player swim force disabled while mounted');
const db=memoryDatabase(),storage=new WorldStorage(db),info={id:'raft-save',inventory:g.inventory.data};
const saver=new WorldSaver(storage,info,g.world,g.player,null,null,r);
ok(await saver.save(),'save succeeds');const saved=(await storage.listWorlds())[0];
eq(saved.rafts.mounted,b.id,'mounted id saved');eq(saved.rafts.rafts[0],b.state(),'pose and velocity saved together');
const restored=game();restored.player.setState(saved.player);restored.rafts.dispose();restored.rafts=new Rafts(restored,saved.rafts);
eq(restored.rafts.mounted?.id,b.id,'continue trip after loading');
ok(r.dismount(),'leave deck');ok(!g.player.collidesAt(g.player.pos),'exit has clear passenger space');
g.camera.position.set(b.pos.x,b.pos.y+2,b.pos.z);g.camera.lookAt(b.pos);g.camera.updateMatrixWorld();
ok(!r.hit(g.camera,{hit:true,distance:.5}),'terrain occludes boarding/pickup');
ok(r.hit(g.camera,{hit:false})?.body===b,'ray hits the thin deck');
const items=g.inventory.slots.map(s=>s&&({...s}));g.inventory.slots.fill({type:'stone',count:64});
ok(r.interact({breakPressed:true,placePressed:false,terrainHit:{hit:false}}),'full inventory handles pickup');
eq(r.bodies.length,1,'full inventory never deletes raft');
g.inventory.slots.splice(0,g.inventory.slots.length,...items);
ok(r.interact({breakPressed:true,placePressed:false,terrainHit:{hit:false}}),'pick up');
eq(r.bodies.length,0,'picked raft removed');eq(g.inventory.slots[g.inventory.selected].count,2,'pickup returns one raft');
ok(await saver.save(),'save removal');eq((await storage.listWorlds())[0].rafts.rafts,[],'removed raft stays removed');
let rays=0;g.raycast={castFromCamera(){rays++;return hit;}};
ok(!r.interact({breakPressed:false,placePressed:false,terrainHit:{hit:false}}),'idle frame skips interaction');
ok(!r.interact({breakPressed:true,placePressed:true,terrainHit:{hit:false}}),'simultaneous clicks preserve mining priority');
eq(rays,0,'idle and mining do not raycast water');
eq(new Rafts(g).bodies.length,0,'older save without rafts loads');
const invalid=new Rafts(g,{schema:1,rafts:[{...b.state(),x:NaN},b.state(),b.state(),{...b.state(),id:2,vx:Infinity}]});
eq(invalid.bodies.length,1,'invalid/duplicate saved rafts discarded');invalid.dispose();
ok(!r.spawn(NaN,REST,0),'reject nonfinite spawn');
// Rendering pool and simulation cap stay independent of the total save size.
for(let i=0;i<32;i++)ok(r.spawn(-40+(i%8)*3,REST,-6+Math.floor(i/8)*3),'spawn bounded fleet');
eq(r.spawn(30,REST,30),null,'32-raft world cap');
const times=[];for(let i=0;i<300;i++){r.update(1/60,keys());if(i>=60)times.push(r.lastMs);}
eq(r.views.size,8,'at most eight nearby rendered rafts');ok(r.lastSteps<=8,'bounded nearby physics');
eq(new Set([...r.views.values()].map(v=>v.mesh.geometry)).size,1,'one shared geometry');
let disposed=0;r.geometry.addEventListener('dispose',()=>disposed++);r.dispose();r.dispose();
eq(g.scene.children.length,0,'all raft meshes removed');eq(disposed,1,'geometry disposed once');
restored.rafts.dispose();
times.sort((a,b)=>a-b);
console.log(`OK: tratwa — ${checks} checks; crafting, 30/60/120Hz, 1/8/16/32-block waterfalls, collisions, item/save lifecycle.`);
console.log('RAFT_CPU='+JSON.stringify({scope:'8 active rafts, 32 stored; CPU physics/controller, no GPU',samples:times.length,p50Ms:times[Math.floor(times.length*.5)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),falls}));
