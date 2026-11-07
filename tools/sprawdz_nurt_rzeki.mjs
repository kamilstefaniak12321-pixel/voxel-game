// River current regression: identical real Player physics with the frozen
// 0.74 resolver and the current resolver, then real terrain/save/worker checks.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { Worker as NodeWorker } from 'node:worker_threads';
import { memoryDatabase } from './fixtures/memory-database.mjs';
registerHooks({
    resolve(s,c,n){return n(s==='three'?new URL('../lib/three/three.module.js',import.meta.url).href:s,c);},
    load(u,c,n){
        if(u.endsWith('/src/rendering/TextureAtlas.js'))return{format:'module',shortCircuit:true,source:`
            import {Color} from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`};
        return n(u,u.endsWith('.js')&&/\/(src|assets|lib)\//.test(u)?{...c,format:'module'}:c);
    }
});
const {Scene,PerspectiveCamera}=await import('three');
const {World}=await import('../src/world/World.js');
const {Chunk}=await import('../src/world/Chunk.js');
const {Player}=await import('../src/player/Player.js');
const {RealisticGenerator}=await import('../src/world/terrain/RealisticGenerator.js');
const {WorldStorage,createWorldInfo}=await import('../src/storage/WorldStorage.js');
const {generationTransfers}=await import('../src/world/ChunkGenerationData.js');
const {getWaterLevel,getWaterBaseHeight,fallingWaterId,waterIdForLevel,getBlockId}=await import('../src/blocks/BlockRegistry.js');
const {CHUNK_SIZE:S,CHUNK_HEIGHT:H}=await import('../src/config.js');
const L=S*S,SOURCE=getBlockId('water'),STONE=getBlockId('stone');
let checks=0;
const ok=(v,m)=>{assert.ok(v,m);checks++;};
const eq=(a,b,m)=>{assert.deepEqual(a,b,m);checks++;};
const near=(a,b,m)=>{ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);};

// Frozen 0.74 algorithm. This A/B changes only current resolution, not Player,
// collision, buoyancy, input, time step, geometry or procedural river speed.
function legacyCurrent(x,y,z){
    x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);
    const id=this.getBlockId(x,y,z),level=getWaterLevel(id);
    if(level<0)return null;
    const center=getWaterBaseHeight(id);let vx=0,vz=0;
    for(const [dx,dz]of[[-1,0],[1,0],[0,-1],[0,1]]){
        const neighbor=this.fluids.read(x+dx,y,z+dz);let difference=0;
        if(getWaterLevel(neighbor)>=0)difference=center-getWaterBaseHeight(neighbor);
        else if(neighbor===0&&getWaterLevel(this.fluids.read(x+dx,y-1,z+dz))>=0)difference=center;
        vx+=dx*difference;vz+=dz*difference;
    }
    const length=Math.hypot(vx,vz);
    if(length>.001)return[vx/length,vz/length];
    return this.getFlow(x,z)??(level===8?[0,0]:null);
}
function worldWith(seed='river-current',saved=new Map(),terrain='flat'){
    const world=new World(new Scene(),seed,saved,terrain);
    world.light={initChunk(){},blockChanged(){},takeChangedChunks(){}};
    world.fluids.now=()=>0;
    return world;
}
function put(world,x,y,z,id){
    const cx=Math.floor(x/S),cz=Math.floor(z/S);
    const chunk=world.getChunk(cx,cz)??world.createChunk(cx,cz);
    chunk.setId(x-cx*S,y,z-cz*S,id);return chunk;
}
function riverColumn(chunk,x,z,min,max,flow){
    chunk.flow??=new Int8Array(L*2);chunk.flowBounds??=new Uint8Array(L*2);
    const column=(z-chunk.cz*S)*S+x-chunk.cx*S;
    chunk.flow[column*2]=Math.round(flow[0]*32);chunk.flow[column*2+1]=Math.round(flow[1]*32);
    chunk.flowBounds[column]=min+1;chunk.flowBounds[L+column]=max+1;
}
function instrument(world){
    const stats={reads:0,generation:0},get=world.getBlockId.bind(world),read=world.fluids.read.bind(world.fluids);
    world.getBlockId=(...args)=>{stats.reads++;return get(...args);};
    world.fluids.read=(...args)=>{stats.reads++;return read(...args);};
    world.generateChunk=()=>{stats.generation++;throw new Error('Current lookup must not generate terrain');};
    world.generator.compute=()=>{stats.generation++;throw new Error('Current lookup must not sample the terrain generator');};
    return stats;
}
function channel(axis,sign,origin){
    const world=worldWith(),cross=-16;
    const point=(t,u)=>axis==='x'?[origin+(sign>0?t:-t-1),cross+u]:[cross+u,origin+(sign>0?t:-t-1)];
    const flow=axis==='x'?[2*sign,0]:[0,2*sign];
    for(let t=-8;t<=32;t++)for(let u=-4;u<=4;u++){
        const [x,z]=point(t,u),chunk=put(world,x,0,z,STONE);
        for(let y=1;y<=3;y++)put(world,x,y,z,SOURCE);
        if(t<=0){put(world,x,4,z,SOURCE);put(world,x,5,z,SOURCE);}
        if(t===1){put(world,x,4,z,fallingWaterId(1));put(world,x,5,z,waterIdForLevel(1));}
        riverColumn(chunk,x,z,1,t<=0?5:3,flow);
    }
    const start=axis==='x'?[origin+sign*-1.5,4.45,cross+.5]:[cross+.5,4.45,origin+sign*-1.5];
    world.spawnPoint={x:start[0],z:start[2]};world.ensureColumnLoaded=()=>{};world.getGroundY=()=>1;
    return{world,point,flow,start,along:p=>sign*(p[axis]-origin),counter:instrument(world)};
}
function voyage(fixture,resolver){
    const {world,counter,start,along}=fixture;world.getWaterFlow=resolver;
    const player=new Player(world,new PerspectiveCamera());player.pos.set(...start);
    const input={isKeyDown:key=>key==='Space',consumeKeyPress:()=>false};
    const before=counter.reads;let reversals=0,backward=0,walls=0,lastSign=0,min=Infinity,max=-Infinity;
    for(let frame=0;frame<600;frame++){
        const position=along(player.pos);
        player.updateWater();player.updateMovement(1/60,input);player.resolveMovement(1/60);
        const delta=along(player.pos)-position,sign=Math.sign(delta);
        if(delta< -1e-9)backward++;
        if(sign&&lastSign&&sign!==lastSign)reversals++;
        if(sign)lastSign=sign;
        if(player.touchingWall)walls++;
        if(frame>=300){min=Math.min(min,along(player.pos));max=Math.max(max,along(player.pos));}
    }
    return{end:along(player.pos),last5Seconds:[min,max],reversals,backward,walls,reads:counter.reads-before,generation:counter.generation};
}
const comparisons=[];
for(const [axis,sign,origin]of[['x',1,0],['x',-1,-16],['z',1,-16],['z',-1,0]]){
    const legacy=channel(axis,sign,origin),fixed=channel(axis,sign,origin);
    try{
        const before=voyage(legacy,legacyCurrent),after=voyage(fixed,World.prototype.getWaterFlow);
        comparisons.push({axis,sign,origin,before,after});
        ok(Math.abs(before.end)<.1&&before.last5Seconds[1]-before.last5Seconds[0]<.1,'legacy current traps the real swimmer at the step');
        ok(before.reversals>100&&before.backward>100,'legacy trap is repeated upstream reversal');
        eq(before.walls,0,'the reproduced legacy trap has no collision with a wall');
        ok(after.end>12,`same real Player crosses the step with the new current: ${JSON.stringify(after)}`);
        eq(after.backward,0,'fixed current never reverses the swimmer upstream');
        eq(after.walls,0,'fixed swimmer crosses without touching a wall');
        eq(after.generation,0,'ten seconds of swimming does not generate/sample terrain');
        const [lx,lz]=fixed.point(0,0),[fx,fz]=fixed.point(1,0);
        eq(fixed.world.getWaterFlow(lx,4,lz),fixed.flow,'covered source retains exact procedural speed at the lip');
        eq(fixed.world.getWaterFlow(fx,4,fz),fixed.flow,'attached falling column retains exact procedural speed');
        eq(fixed.world.getWaterFlow(fx,5,fz),fixed.flow,'attached surface spill retains exact procedural speed');
        const reads=fixed.counter.reads;
        fixed.world.getWaterFlow(lx,4,lz);
        eq(fixed.counter.reads-reads,5,'ordinary river resolution reads only center and four neighbors');
    }finally{legacy.world.dispose();fixed.world.dispose();}
}

// The same x/z column can contain unrelated player pools. Bounds represent
// natural terrain, not mutable waterBounds, and never scan for distant water.
{
    const {world,counter,point}=channel('x',1,0);
    try{
        const [x,z]=point(-3,0);
        for(const y of [20,0])for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)put(world,x+dx,y,z+dz,SOURCE);
        for(const y of [20,0])eq(world.getWaterFlow(x,y,z),null,'isolated pool above/below river gets no procedural current');
        put(world,x,20,z,waterIdForLevel(2));put(world,x+1,20,z,waterIdForLevel(4));put(world,x-1,20,z,waterIdForLevel(2));
        put(world,x,20,z-1,waterIdForLevel(2));put(world,x,20,z+1,waterIdForLevel(2));
        eq(world.getWaterFlow(x,20,z),[1,0],'an isolated elevated stream still follows its own local slope');
        eq(world.getWaterFlow(x,21,z),null,'dry cell in a river column never receives current');
        eq(world.getWaterFlow(10000,2,10000),null,'missing chunk never receives current');
        eq(counter.generation,0,'isolated/dry/unknown lookups do not touch the generator');
        const chunk=world.getChunk(Math.floor(x/S),Math.floor(z/S));
        eq(chunk.flowBounds.byteLength,512,'natural flow metadata costs 512 bytes in a river chunk');
    }finally{world.dispose();}
}

// A dam removes its blocked river component. A real lateral slope can carry
// water around it, but neither local high neighbors nor a bank push into rock.
{
    const f=channel('x',1,0),{world,point}=f,[x,z]=point(-3,0);
    try{
        put(world,x+1,2,z,STONE);
        eq(world.getWaterFlow(x,2,z),null,'a flat completely blocked river stops at its dam');
        put(world,x,3,z+1,0);put(world,x,2,z+1,waterIdForLevel(5));
        eq(world.getWaterFlow(x,2,z),[0,2],'real downhill side outlet diverts the current at its original speed');
        put(world,x,2,z+1,STONE);
        eq(world.getWaterFlow(x,2,z),null,'closing the side outlet does not push into its wall');
        const chunk=world.getChunk(Math.floor(x/S),Math.floor(z/S));riverColumn(chunk,x,z,1,3,[2,1]);
        put(world,x,2,z+1,SOURCE);
        eq(world.getWaterFlow(x,2,z),[0,1],'diagonal current slides along a bank using its unobstructed component');
    }finally{world.dispose();}
}

// Local water without a procedural current must still use actual occupied
// heights: a covered source and falling water are both full, not .875 vs1.
{
    const world=worldWith();
    try{
        for(let z=7;z<=9;z++)for(let x=7;x<=9;x++){put(world,x,2,z,SOURCE);put(world,x,3,z,SOURCE);}
        put(world,9,2,8,fallingWaterId(2));
        eq(world.getWaterFlow(8,2,8),null,'full source beside full falling water has no fictitious uphill');
        for(let z=7;z<=9;z++)for(let x=7;x<=9;x++){put(world,x,3,z,0);put(world,x,2,z,waterIdForLevel(3));}
        put(world,9,2,8,waterIdForLevel(5));
        eq(world.getWaterFlow(8,2,8),[1,0],'ordinary local flowing levels still follow their slope');
        const counter=instrument(world);world.getWaterFlow(8,2,8);
        ok(counter.reads<=10,'local resolver has a fixed stencil of at most ten voxel reads');
    }finally{world.dispose();}
    eq(new Chunk(0,0).flowBounds,null,'dry/nonriver chunks allocate no natural flow bounds');
}

// Real seed42, its 83->75 waterfall and the simulation's settled spill. Scan
// generated wet channel cells for an old opposing vector and verify the fix.
const natural=worldWith(42,new Map(),'realistic');
let representative;
try{
    for(let cz=-41;cz<=-39;cz++)for(let cx=-13;cx<=-11;cx++)natural.generateChunk(cx,cz);
    for(let frame=0;frame<2000;frame++){
        natural.fluids.update(.12,1);
        if(!natural.fluids.pending&&!natural.fluids.scans.size&&!natural.fluids.boundaries.size)break;
    }
    let conflicts=0;
    for(const chunk of natural.chunks.values()){
        if(!chunk.flowBounds)continue;
        for(let column=0;column<L;column++){
            const x=chunk.cx*S+column%S,z=chunk.cz*S+Math.floor(column/S),river=natural.getFlow(x,z);
            if(!river)continue;
            for(let y=chunk.flowBounds[column]-1;y<chunk.flowBounds[L+column];y++){
                if(y<0||getWaterLevel(natural.getBlockId(x,y,z))<0)continue;
                const old=legacyCurrent.call(natural,x,y,z),now=natural.getWaterFlow(x,y,z);
                if(old&&old[0]*river[0]+old[1]*river[1]<-.1){
                    conflicts++;representative??={x,y,z,river,old,now};
                    ok(!now||now[0]*river[0]+now[1]*river[1]>=-1e-9,'real generated waterfall cannot reverse its procedural current');
                }
            }
        }
    }
    ok(conflicts>0,'real seed42 includes the reproduced opposing current, not only synthetic water');

    const chunk=natural.getChunk(-12,-40),baseline=chunk.flowBounds.slice(),blocks=chunk.blocks.slice();
    const db=new WorldStorage(memoryDatabase()),info=createWorldInfo('Current bounds',42,'realistic');
    await db.saveWorldAndChunks(info,[chunk]);
    const saved=await db.loadChunks(info.id),restored=worldWith(42,saved,'realistic');
    try{
        const loaded=restored.generateChunk(chunk.cx,chunk.cz);
        eq(loaded.blocks,blocks,'saving/restoring current metadata never changes voxel contents');
        eq(loaded.flowBounds,baseline,'natural bounds rebuild on loading the existing block-only format');
        eq(loaded.flow,chunk.flow,'procedural speed and direction survive save/reload');
    }finally{restored.dispose();}
    const legacyBlocks=new Uint8Array(L*64);legacyBlocks[20*L+8*S+8]=SOURCE;
    const legacyWorld=worldWith(42,new Map([['-12,-40',legacyBlocks]]),'realistic');
    try{
        const old=legacyWorld.generateChunk(-12,-40);
        eq(old.flowBounds,baseline,'old Uint8/half-height saves also receive natural bounds without format migration');
        eq(old.getId(8,20,8),SOURCE,'restoring metadata leaves old saved blocks intact');
    }finally{legacyWorld.dispose();}
}finally{natural.dispose();}

function workerFactory(){
    const worker=new NodeWorker(new URL('./fixtures/chunk-generation-worker.mjs',import.meta.url));
    const adapter={postMessage:(data,transfer)=>worker.postMessage(data,transfer),terminate:()=>worker.terminate()};
    worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',error=>adapter.onerror?.(error));return adapter;
}
async function until(test){const start=performance.now();while(!test()){
    if(performance.now()-start>15000)throw new Error('Terrain worker timeout');await new Promise(resolve=>setTimeout(resolve,2));
}}
{
    const generator=new RealisticGenerator(42),expected=new Chunk(-12,-40);generator.generateChunk(expected);
    const world=worldWith(42,new Map(),'realistic');
    try{
        world.enableChunkStreaming({workerFactory});world.generation.start();await until(()=>world.generation.workerReady);
        ok(world.requestGeneratedChunk(-12,-40),'real worker accepts river generation');
        await until(()=>world.generation.getStats().ready===1);
        const data=world.takeGeneratedChunk(-12,-40);
        eq(data.flowBounds,expected.flowBounds,'worker creates the same natural bounds as synchronous generation');
        ok(generationTransfers(data).includes(data.flowBounds.buffer),'natural bounds participate in worker transfer');
        const chunk=world.applyGeneratedChunk(data);
        ok(chunk.flowBounds===data.flowBounds,'World adopts the transferred bounds without copying or scanning');
    }finally{world.dispose();}
}
console.log(JSON.stringify({currentAB:comparisons,generatedWaterfall:representative}));
console.log(`OK: nurt rzeki — ${checks} sprawdzeń fizyki gracza, kierunków, granic koryta, zapisu i workera.`);
