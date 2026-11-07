// Waterfall impacts: independent simulation, cache and World lifecycle checks.
// Uses real Chunk data and a stopped clock to make count budgets deterministic.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format:'module', shortCircuit:true, source:`
                import { Color } from 'three';
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url,url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? {...context,format:'module'} : context);
    }
});

const { Scene } = await import('three');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { SavedChunkStore } = await import('../src/storage/SavedChunkStore.js');
const { summarizeSavedChunk } = await import('../src/world/SavedChunkSurface.js');
const { WaterSimulation, WATER_STEP_SECONDS } = await import('../src/world/WaterSimulation.js');
const { getBlockId, getWaterLevel, fallingWaterId, waterFallDistance,
    WATER_SOURCE_ID: SOURCE, WATER_FALL_MAX } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE:S, CHUNK_HEIGHT:H } = await import('../src/config.js');

const LAYER=S*S, STONE=getBlockId('stone'), index=(x,y,z)=>y*LAYER+z*S+x;
let checks=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const around=()=>Array.from({length:9},(_,n)=>[n%3-1,Math.floor(n/3)-1]);

function grid(coordinates=around()) {
    const chunks=new Map();
    const world={
        chunks, getChunk:(cx,cz)=>chunks.get(`${cx},${cz}`)??null,
        generateChunk(){throw new Error('A landing query or simulation attempted generation');},
        setFluidBlock(x,y,z,id){return edit(x,y,z,id);},
        flushFluidChanges(){}
    };
    world.fluids=new WaterSimulation(world,{now:()=>0});
    function put(x,y,z,id){
        const cx=Math.floor(x/S),cz=Math.floor(z/S),chunk=world.getChunk(cx,cz);
        assert.ok(chunk && y>=0 && y<H,'all fixture writes must stay in loaded chunks');
        return chunk.setId(x-cx*S,y,z-cz*S,id);
    }
    function edit(x,y,z,id){
        const previous=world.fluids.read(x,y,z),changed=put(x,y,z,id);
        if(changed)world.fluids.blockChanged(x,y,z,previous);
        return changed;
    }
    function add(cx,cz,saved=null){
        const chunk=new Chunk(cx,cz);
        if(saved)chunk.loadBlocks(saved);
        else for(let z=0;z<S;z++)for(let x=0;x<S;x++)chunk.setId(x,0,z,STONE);
        chunks.set(`${cx},${cz}`,chunk);
        for(const [field,opposite,dx,dz] of [['west','east',-1,0],['east','west',1,0],['north','south',0,-1],['south','north',0,1]]){
            chunk[field]=world.getChunk(cx+dx,cz+dz);
            if(chunk[field])chunk[field][opposite]=chunk;
        }
        return chunk;
    }
    function unload(cx,cz){
        const chunk=world.getChunk(cx,cz),saved=chunk.blocks.slice();
        world.fluids.chunkUnloaded(chunk);chunks.delete(`${cx},${cz}`);
        for(const [field,opposite] of [['west','east'],['east','west'],['north','south'],['south','north']]){
            if(chunk[field])chunk[field][opposite]=null;chunk[field]=null;
        }
        return saved;
    }
    for(const [cx,cz] of coordinates)add(cx,cz);
    return Object.assign(world,{put,edit,add,unload,read:(x,y,z)=>world.fluids.read(x,y,z)});
}

function step(world){
    world.fluids.update(WATER_STEP_SECONDS,1);
    const s=world.fluids.stats();
    ok(s.lastProcessed<=64 && s.lastChanges<=24 && s.lastScanCells<=1024,'landing bookkeeping preserves simulation caps');
    return s;
}
function settle(world,label,limit=1500){
    for(let frame=0;frame<limit;frame++){
        const s=step(world);
        if(!s.pending&&!s.scans)return;
    }
    assert.fail(`${label} never becomes idle: ${JSON.stringify(world.fluids.stats())}`);
}
function landings(world,x=8.5,z=8.5,radius=100){
    const result=[];
    world.fluids.forEachLanding(x,z,radius,(...landing)=>result.push(landing));
    return result.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
}
function boot(world){for(const chunk of world.chunks.values())world.fluids.chunkLoaded(chunk);}

// A receiving source pool occupies y=1. Its waterfall ends at y=2, but
// horizontal flow belongs in the existing pool, never in a raised y=2 sheet.
{
    const world=grid();
    for(let z=6;z<=10;z++)for(let x=6;x<=10;x++)world.put(x,1,z,SOURCE);
    world.put(8,8,8,SOURCE);boot(world);
    settle(world,'waterfall into source pool');
    eq(landings(world),[[8,2,8,6]],'pool has one impact and no artificial waterfalls along its rim');
    for(let z=6;z<=10;z++)for(let x=6;x<=10;x++){
        eq(world.read(x,1,z),SOURCE,'the receiving source pool is preserved');
        if(x!==8||z!==8)eq(world.read(x,2,z),0,'falling water never raises the receiving pool by one layer');
    }
    const before=world.fluids.stats();
    for(let n=0;n<25;n++)eq(step(world).lastProcessed,0,'settled pool impact does no cell work');
    eq(world.fluids.stats().changes,before.changes,'landing queries and idle ticks never change water');
    world.edit(8,8,8,0);settle(world,'removed pool waterfall');
    eq(landings(world),[],'the impact disappears after its falling supply drains');
    eq(world.read(8,1,8),SOURCE,'removing the waterfall does not drain its receiving pool');
}

// Repair an already-saved 0.73 raised sheet: lateral candidates must reject
// a falling neighbor supported by source water, not merely stop its fanout.
{
    const world=grid();
    for(let z=1;z<=15;z++)for(let x=1;x<=15;x++)world.put(x,1,z,SOURCE);
    world.put(8,8,8,SOURCE);
    for(let y=2;y<8;y++)world.put(8,y,8,fallingWaterId(8-y));
    for(let dz=-7;dz<=7;dz++)for(let dx=-7;dx<=7;dx++){
        const distance=Math.abs(dx)+Math.abs(dz);
        if(distance>0&&distance<=7)world.put(8+dx,2,8,getBlockId(`water_flow_${distance}`));
    }
    boot(world);settle(world,'legacy raised sheet');
    for(let dz=-7;dz<=7;dz++)for(let dx=-7;dx<=7;dx++)if(dx||dz){
        eq(world.read(8+dx,2,8+dz),0,'orphan raised sheet drains from an old snapshot');
    }
    eq(landings(world),[[8,2,8,6]],'the real pool impact survives old-sheet repair');
}

// On a solid floor the falling bottom still fans into a shallow receiving
// flow pool. Adjacent falling columns must settle, rather than waking each other.
{
    const world=grid();
    for(let x=7;x<=9;x++)world.edit(x,8,8,SOURCE);
    settle(world,'wide waterfall on stone');
    eq(landings(world),[[7,1,8,7],[8,1,8,7],[9,1,8,7]],'three columns keep three real floor impacts');
    eq(getWaterLevel(world.read(8,1,9)),1,'solid-floor impact still spreads into its receiving flow pool');
    for(let n=0;n<30;n++){
        const stats=step(world);
        eq([stats.pending,stats.lastProcessed,stats.lastChanges],[0,0,0],'stable adjacent falling cells do not ping-pong in the queue');
    }
}

// Fall distance propagates from the actual upstream, caps at16, and updates
// an existing cached impact when a long fall is shortened.
{
    const world=grid();world.edit(8,30,8,SOURCE);settle(world,'long falling distance');
    for(let y=1;y<30;y++)eq(waterFallDistance(world.read(8,y,8)),Math.min(WATER_FALL_MAX,30-y),'every cell counts its vertical fall');
    eq(landings(world),[[8,1,8,16]],'long impact exposes the capped fall number');
    world.edit(8,30,8,0);world.edit(8,6,8,SOURCE);settle(world,'shortened fall');
    eq(landings(world),[[8,1,8,5]],'cached impact strength follows the shortened fall');
    for(let y=1;y<6;y++)eq(waterFallDistance(world.read(8,y,8)),6-y,'shorter upstream updates every surviving fall ID');
    for(let y=7;y<30;y++)eq(world.read(8,y,8),0,'the abandoned upper column drains');
}

// Query-time validation removes obsolete entries before the next simulation
// tick, including a changed base or a replaced falling voxel.
{
    const world=grid();world.put(8,3,8,STONE);world.edit(8,10,8,SOURCE);
    settle(world,'raised solid ledge');
    eq(landings(world).filter(([x,,z])=>x===8&&z===8),[[8,4,8,6]],'impact is directly above its solid ledge');
    world.edit(8,3,8,0);
    eq(landings(world).filter(([x,y,z])=>x===8&&y===4&&z===8),[],'opening the base immediately invalidates the old impact');
    settle(world,'opened ledge');
    ok(landings(world).some(([x,y,z,fall])=>x===8&&y===1&&z===8&&fall===9),'the fall continues to the lower floor with updated distance');
    world.edit(8,1,8,STONE);
    ok(!landings(world).some(([x,y,z])=>x===8&&y===1&&z===8),'replacing the falling voxel immediately invalidates its impact');
}

// Aquatic plants retain source water. Their implicit pool has the same impact
// contract, so they cannot create a false elevated sheet either.
for(const type of ['water_lily','water_milfoil','duckweed','cattail_water']){
    const world=grid(),plant=getBlockId(type);
    for(let z=7;z<=9;z++)for(let x=7;x<=9;x++)world.put(x,1,z,SOURCE);
    world.put(8,1,8,plant);world.edit(8,7,8,SOURCE);settle(world,`${type} receiving cell`);
    eq(world.read(8,1,8),plant,'simulation retains aquatic source identity');
    eq(landings(world),[[8,2,8,5]],'aquatic source water receives the impact at the same height');
    eq(world.read(9,2,8),0,'aquatic source water does not create a raised sheet');
}

// Restoring at a loading frontier freezes horizontal uncertainty, but its
// entirely known vertical floor remains a valid impact for visual effects.
for(const [cx,cz,lx,lz] of [[0,0,0,8],[0,0,S-1,8],[-2,-3,8,0],[-2,-3,8,S-1]]){
    const world=grid([[cx,cz]]),x=cx*S+lx,z=cz*S+lz;
    world.put(x,8,z,SOURCE);
    for(let y=1;y<8;y++)world.put(x,y,z,fallingWaterId(8-y));
    boot(world);settle(world,'saved boundary waterfall');
    eq(landings(world,x+.5,z+.5,1),[[x,1,z,7]],'saved frontier waterfall exposes its known vertical impact');
    eq(world.chunks.size,1,'landing discovery never loads neighboring terrain');
    const original=world.getChunk(cx,cz),saved=world.unload(cx,cz);
    eq(world.fluids.landings.has(original),false,'unload releases the cached Chunk reference');
    eq(landings(world,x+.5,z+.5,1),[],'unloaded impact never reaches consumers');
    const restored=world.add(cx,cz,saved);world.fluids.chunkLoaded(restored);settle(world,'boundary waterfall reload');
    ok(restored!==original,'reload uses a different Chunk object');
    eq(landings(world,x+.5,z+.5,1),[[x,1,z,7]],'reloaded impact is rebuilt under the new Chunk identity');
    // Defensive compatibility: a port that replaces a chunk without an unload
    // callback must not publish stale positions from its old cached arrays.
    world.chunks.delete(`${cx},${cz}`);
    eq(landings(world,x+.5,z+.5,1),[],'unknown/replaced cached chunk cannot keep a phantom impact');
    eq(world.fluids.landings.size,0,'defensive validation releases the stale chunk entry');
}

// Actual World save/restore hooks, rather than only the isolated port above.
{
    const blocks=new Uint16Array(LAYER*H);blocks.fill(STONE,0,LAYER);
    blocks[index(0,8,8)]=SOURCE;
    for(let y=1;y<8;y++)blocks[index(0,y,8)]=fallingWaterId(8-y);
    const saved=new SavedChunkStore({summarize:summarizeSavedChunk,maxDecodedBytes:0});saved.set('0,0',blocks);
    const world=new World(new Scene(),'waterfall-landing-lifecycle',saved,'flat');
    world.light={initChunk(){},blockChanged(){},takeChangedChunks(){}};
    world.fluids.now=()=>0;
    try{
        const chunk=world.generateChunk(0,0);settle(world,'real World restored waterfall');
        eq(landings(world,.5,8.5,1),[[0,1,8,7]],'World.generateChunk schedules landing reconstruction');
        world.unloadChunk(chunk);
        eq(world.fluids.landings.size,0,'World.unloadChunk releases all waterfall impacts for its chunk');
        const returned=world.generateChunk(0,0);settle(world,'real World returning waterfall');
        ok(returned!==chunk,'real World returns a new Chunk');
        eq(landings(world,.5,8.5,1),[[0,1,8,7]],'World revisits retain the original fall distance');
    }finally{world.dispose();}
    eq(world.fluids.landings.size,0,'World.dispose releases every landing');
    eq(saved.size,0,'landing lifecycle does not prevent disposal of saved data');
}

console.log(`OK: lądowania wodospadów — ${checks} sprawdzeń tafli, spadku, bezczynności, granic i powrotów.`);
