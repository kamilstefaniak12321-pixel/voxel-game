// Real ripple masks/buffers, actual Player movement and bounded rain probes.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(specifier, context, next) { return next(specifier === 'three'
        ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context); },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format:'module',shortCircuit:true,source:`
            import { Color } from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url,url.endsWith('.js')&&/\/(src|assets|lib)\//.test(url)?{...context,format:'module'}:context);
    }
});
const THREE=await import('three');
const {Chunk}=await import('../src/world/Chunk.js');
const {WaterImpactRipples}=await import('../src/rendering/WaterImpactRipples.js');
const {RainEffects,RAIN_CAPS}=await import('../src/rendering/RainEffects.js');
const {Player}=await import('../src/player/Player.js');
const {getBlockId,getWaterLevel,isSolidId,fallingWaterId}=await import('../src/blocks/BlockRegistry.js');
const {CHUNK_SIZE:S,CHUNK_HEIGHT:H}=await import('../src/config.js');
let checks=0;
const ok=(v,label)=>{assert.ok(v,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const WATER=getBlockId('water'),STONE=getBlockId('stone');
function fixture({roof=false}={}){
    const chunks=new Map(),scene=new THREE.Scene();let reads=0;
    const world={spawnPoint:{x:.5,z:.5},ensureColumnLoaded(){},getGroundY:()=>10,
        getChunk:(x,z)=>chunks.get(`${x},${z}`),getFlow:()=>null,getWaterFlow:()=>[2,0],
        getLight:()=>({sky:15,red:0,green:0,blue:0}),
        getBlockId(x,y,z){reads++;if(y<0||y>=H)return 0;const cx=Math.floor(x/S),cz=Math.floor(z/S);
            return chunks.get(`${cx},${cz}`)?.getId(x-cx*S,y,z-cz*S)??0;},
        isSolid(x,y,z){return isSolidId(this.getBlockId(x,y,z));}
    };
    const set=(x,y,z,id)=>{const cx=Math.floor(x/S),cz=Math.floor(z/S),key=`${cx},${cz}`;
        let c=chunks.get(key);if(!c){c=new Chunk(cx,cz);chunks.set(key,c);}
        if(c.setId(x-cx*S,y,z-cz*S,id))c.meshRevision++;return c;};
    for(let z=-10;z<=10;z++)for(let x=-10;x<=24;x++){
        set(x,8,z,STONE);for(let y=9;y<=12;y++)set(x,y,z,WATER);
        if(roof)set(x,18,z,STONE);
    }
    const impacts=new WaterImpactRipples(scene,world);
    // The synthetic clock removes machine speed from hard work-cap checks.
    impacts.ripples.surface.now=()=>0;
    const camera=new THREE.PerspectiveCamera();camera.position.set(.5,14,.5);
    const rain=new RainEffects(scene,world,impacts,{now:()=>0,random:()=>.5});
    return {chunks,scene,world,set,impacts,rain,camera,reads:()=>reads,
        dispose(){rain.dispose();impacts.dispose();}};
}
function settle(f){for(let i=0;i<150;i++){
    f.impacts.update(.001,null,48);if(!f.impacts.stats().queued)return;
}throw Error('Impulse mask did not settle');}

// A short impact belongs to the exposed cell itself, not the lower pool layer.
// Sub-cell positions on a four-chunk corner must still draw all wet quadrants.
{
    const f=fixture();ok(f.impacts.add(-.01,12,-.01,'rain',1),'water accepts a drop');settle(f);
    const entries=f.impacts.ripples.surface.entries;
    eq(entries.length,1,'one drop owns one field');eq(entries[0].y,12,'field uses the actual top receiving layer');
    const cells=new Set(entries[0].patches.map(p=>`${p.x},${p.z}`));
    for(const x of [-1,0])for(const z of [-1,0])ok(cells.has(`${x},${z}`),'small circle crosses the exact block/chunk corner');
    ok(entries[0].patches.every(p=>getWaterLevel(f.world.getBlockId(p.x,p.y,p.z))>=0),'every tile rests on water');
    const before=f.impacts.ripples.stats().geometryRevision;
    const versions=Object.values(f.impacts.ripples.geometry.attributes).map(a=>a.version);
    for(let i=0;i<30;i++)f.impacts.update(1/120,null,48);
    eq(f.impacts.ripples.stats().geometryRevision,before,'aging an impact does not rebuild geometry');
    eq(Object.values(f.impacts.ripples.geometry.attributes).map(a=>a.version),versions,'animation uses uniforms, not vertex uploads');
    for(let i=0;i<200;i++)f.impacts.update(1/120,null,48);
    eq([f.impacts.stats().active,f.impacts.stats().tiles,f.impacts.stats().draws],[0,0,0],'single pulse expires completely instead of looping');
    f.dispose();
}

// Drops cannot create rings on ground, under a roof, in a falling stream,
// above a missing chunk, or in the covered middle of a water column.
{
    const f=fixture();f.set(1,13,1,STONE);f.set(2,12,2,STONE);f.set(3,12,3,fallingWaterId(8));
    for(const [x,y,z] of [[1.5,12,1.5],[2.5,12,2.5],[3.5,12,3.5],[.5,11,.5],[1000,12,1000]])
        eq(f.impacts.add(x,y,z,'rain',1),false,'invalid/covered receiving surface rejects an impulse');
    eq(f.impacts.add(NaN,12,0),false,'non-finite input rejected');
    f.dispose();
}

// Shared work allowance can be entirely used by waterfall masks. Transient
// jobs wait in a bounded queue and publish when the allowance becomes free.
{
    const f=fixture();f.impacts.add(.5,12,.5,'player',1);
    for(let i=0;i<5;i++){f.impacts.update(.001,null,0);eq(f.impacts.stats().lastProcessed,0,'zero budget performs no discovery');}
    ok(f.impacts.stats().queued>0,'work waits instead of borrowing another frame budget');
    for(let i=0;i<100&&f.impacts.stats().queued;i++){
        f.impacts.update(.001,null,2);ok(f.impacts.stats().lastProcessed<=2,'partial allowance is respected');
    }
    ok(f.impacts.stats().tiles>0,'deferred surface eventually becomes visible');
    f.dispose();
}

// Rain cannot consume the slots reserved for the player; lower detail and
// disabling the effect apply immediately, including already built surfaces.
for(const amount of [1,.35]){
    const f=fixture();f.impacts.setAmount(amount);
    for(let i=0;i<30;i++)f.impacts.add(.5,12,.5,'rain',1);
    const limit=amount===1?12:4;
    ok(f.impacts.stats().active<limit,'rain leaves room for player impacts');
    ok(f.impacts.add(1.5,12,1.5,'player',1),'player impact fits during rain');
    for(let i=0;i<30;i++)f.impacts.add(1.5,12,1.5,'player',1);
    ok(f.impacts.stats().active<=limit,'combined player/drop records have a hard cap');
    settle(f);f.impacts.setAmount(0);
    eq([f.impacts.stats().active,f.impacts.stats().tiles],[0,0],'disabled effects clear active geometry');
    eq(f.impacts.add(.5,12,.5),false,'disabled effects reject new work');
    f.dispose();
}

// Actual player movement produces periodic wake rings at different frame
// rates. A stalled Player clock during terrain loading cannot replay a splash.
const emitted=[];
{
    const f=fixture();
    for(let i=0;i<10;i++)f.impacts.add(.5,12,.5,'rain',1);
    f.impacts.add(.5,12,.5,'player',1);f.impacts.add(.5,12,.5,'player',1);
    f.impacts.setAmount(.35);
    eq(f.impacts.stats().player,2,'lower detail keeps existing player impulses ahead of older rain');
    eq(f.impacts.stats().active,4,'preserving player impulses still respects the lower cap');
    f.dispose();
}
for(const hz of [30,60,120]){
    const f=fixture(),player=new Player(f.world,f.camera);
    player.pos.set(.5,12.875-1.8*.78,.5);
    const input={isKeyDown:()=>false,consumeKeyPress:()=>false,consumeMouseDelta:()=>({x:0,y:0})};
    for(let i=0;i<hz*4;i++){player.update(1/hz,input);f.impacts.update(1/hz,player);}
    const count=f.impacts.stats().emitted.player;emitted.push(count);
    ok(count>=8&&count<=10,`${hz}Hz: movement produces a bounded regular wake`);
    player.splash=8;player.clock++;f.impacts.update(.01,player);const at=f.impacts.stats().emitted.player;
    for(let i=0;i<20;i++)f.impacts.update(.01,player);
    eq(f.impacts.stats().emitted.player,at,'stale splash cannot replay while physics waits for terrain');
    f.dispose();
}
ok(Math.max(...emitted)-Math.min(...emitted)<=1,'wake frequency remains comparable across FPS');

{
    const f=fixture(),player=new Player(f.world,f.camera);
    player.pos.set(.5,15,.5);player.vel.y=-40;
    player.update(.1,{isKeyDown:()=>false,consumeKeyPress:()=>false,consumeMouseDelta:()=>({x:0,y:0})});
    ok(player.splash>0&&player.pos.y+player.height<12.875,'fast real entry submerges the whole collider');
    const before=f.reads();f.impacts.update(.1,player);
    eq(f.impacts.stats().emitted.player,1,'a deep one-step splash still emits a ring at the surface');
    ok(f.reads()-before<45,'fast-entry surface search remains bounded');
    f.dispose();
}

// Actual falling drops, not a synthetic rain flag, trigger rings only after
// arriving at uncovered water. A roof consumes the same drops without rings.
for(const roof of [false,true]){
    const f=fixture({roof});
    for(let i=0;i<60;i++)f.rain.update(1/60,f.camera);
    eq(f.rain.stats().drops,0,'dry weather emits no drops');f.rain.setIntensity(1);
    let maxReads=0,maxDrops=0;
    for(let i=0;i<600;i++){
        f.rain.update(1/60,f.camera);f.impacts.update(1/60,null);
        maxReads=Math.max(maxReads,f.rain.stats().lastReads);maxDrops=Math.max(maxDrops,f.rain.stats().drops);
    }
    ok(maxReads<=RAIN_CAPS.cellsPerUpdate,'all rain ray and triangle queries respect the cell cap');
    ok(maxDrops<=RAIN_CAPS.drops,'falling drops respect the fixed pool');
    ok(f.rain.stats().surfaceHits>0,'drops actually reach a receiving surface');
    eq(f.rain.stats().waterHits>0,!roof,'a real roof prevents water impacts below it');
    if(roof){for(let z=-10;z<=10;z++)for(let x=-10;x<=24;x++)f.set(x,18,z,0);
        for(let i=0;i<180;i++){f.rain.update(1/60,f.camera);f.impacts.update(1/60,null);}
        ok(f.rain.stats().waterHits>0,'removing the roof restores real water impacts');}
    const dark={sunLightIntensity:0,moonLightIntensity:0,ambientIntensity:0};f.rain.update(.01,f.camera,dark);
    const colors=f.rain.geometry.attributes.color.array;
    ok(colors.slice(0,f.rain.stats().drops*6).every(value=>value===0),'rain does not glow without sky/local light');
    f.rain.setAmount(.35);ok(f.rain.stats().drops<=RAIN_CAPS.potatoDrops,'low detail cuts the active drop pool');
    f.chunks.clear();f.rain.update(.02,f.camera);f.impacts.update(.02,null);
    eq([f.rain.stats().drops,f.impacts.stats().tiles],[0,0],'unloaded columns remove streaks and ripple geometry');
    f.rain.setIntensity(0);eq(f.rain.stats().queued,0,'stopping rain cancels unfinished probes');
    f.dispose();
}

// Full lifecycle, including callbacks, remains safe and idempotent.
{
    const f=fixture();
    // A high unrelated block lengthens the probe at the selected column.
    f.set(-1,120,0,STONE);f.camera.position.y=100;f.rain.setIntensity(1);
    let pendingAtCap=false;
    for(let i=0;i<600&&!pendingAtCap;i++){
        f.rain.update(1/60,f.camera);
        pendingAtCap=f.rain.stats().drops>=24&&f.rain.stats().queued>0;
    }
    ok(pendingAtCap,'fixture catches a pending sky probe while the drop pool is populated');
    f.rain.setAmount(.35);
    for(let i=0;i<60;i++){f.rain.update(1/60,f.camera);ok(f.rain.stats().drops<=24,'pending probe cannot overflow the lowered pool limit');}
    f.dispose();
}

// Full lifecycle, including callbacks, remains safe and idempotent.
{
    const f=fixture();let disposed=0;
    for(const resource of [f.rain.geometry,f.rain.material,f.impacts.ripples.geometry,f.impacts.material,f.impacts.ripples.texture])
        resource.addEventListener('dispose',()=>disposed++);
    f.rain.setIntensity(1);f.impacts.add(.5,12,.5);f.dispose();f.dispose();
    eq(disposed,5,'every owned GPU resource is disposed once');eq(f.scene.children.length,0,'no effect meshes remain in the scene');
    f.rain.update(1,f.camera);f.impacts.update(1,null);eq(f.impacts.add(.5,12,.5),false,'disposed effects never restart');
}
console.log(`OK: impulsy i deszcz — ${checks} sprawdzeń masek, narożników chunków, życia fal, gracza, dachów, limitów i zasobów.`);
