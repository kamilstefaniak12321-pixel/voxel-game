// Real Player.update, water queries and collision handling. No rendering,
// physics mocks or replacement movement integrator are used by these checks.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url,url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? {...context,format:'module'} : context);
    }
});

const { Player } = await import('../src/player/Player.js');
const { PerspectiveCamera } = await import('three');
const { getBlockId, isSolidId, fallingWaterId, waterIdForLevel } = await import('../src/blocks/BlockRegistry.js');
const { WATER_FLOAT_SUBMERGED, WATER_SWIM_SUBMERGED, WATER_SURFACE, JUMP_SPEED } = await import('../src/config.js');
const SOURCE=getBlockId('water'),STONE=getBlockId('stone');
const RATES=[30,60,120], SURFACE=25+WATER_SURFACE;
const REST=SURFACE-1.8*WATER_FLOAT_SUBMERGED, HELD=SURFACE-1.8*WATER_SWIM_SUBMERGED;
let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;};
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const near=(a,b,tolerance,label)=>ok(Math.abs(a-b)<=tolerance,`${label}: ${a} != ${b}`);

function input(keys=[]) {
    const held=new Set(keys);
    return {isKeyDown:key=>held.has(key),consumeKeyPress:()=>false,consumeMouseDelta:()=>({x:0,y:0})};
}

function fixture({floor=()=>0,top=25,flow=null,cell=null,x=.5,y=REST,z=.5}={}) {
    const world={
        reads:0,loads:0,spawnPoint:{x,z},
        ensureColumnLoaded(){this.loads++;},getGroundY:(x,z)=>floor(x,z)+1,
        getBlockId(x,y,z){
            this.reads++;
            const override=cell?.(x,y,z);
            return override??(y<=floor(x,z)?STONE:y<=top?SOURCE:0);
        },
        isSolid(x,y,z){return isSolidId(this.getBlockId(x,y,z));},
        getWaterFlow:()=>flow
    };
    const player=new Player(world,new PerspectiveCamera());
    player.pos.set(x,y,z);
    return {player,world};
}

function advance(player,seconds,rate,keys=[]) {
    const controls=input(keys),schedule=Array.isArray(rate)?rate:[1/rate];
    const samples=[];
    let elapsed=0,frame=0,minY=player.pos.y,maxY=player.pos.y,walls=0,ground=0,finite=true;
    while(elapsed<seconds-1e-10) {
        const dt=Math.min(schedule[frame%schedule.length],seconds-elapsed);
        player.update(dt,controls);
        elapsed+=dt;frame++;
        minY=Math.min(minY,player.pos.y);maxY=Math.max(maxY,player.pos.y);
        walls+=Number(player.touchingWall);ground+=Number(player.onGround);
        finite&&=[player.pos.x,player.pos.y,player.pos.z,player.vel.x,player.vel.y,player.vel.z,player.submerged,player.buoyantSubmerged].every(Number.isFinite);
        if(samples.length<Math.floor(elapsed+1e-8))samples.push(player.pos.y);
    }
    ok(finite,'every full physics frame keeps finite positions, velocities and immersion');
    return {minY,maxY,walls,ground,samples};
}

// Passive floating: no keyboard and no hidden force from the current. Starting
// below the surface must recover smoothly and settle with dry eyes at all Hz.
const rises=[];
for(const rate of RATES) {
    const f=fixture({y:22}),beforeLoads=f.world.loads;
    const result=advance(f.player,8,rate);
    near(f.player.pos.y,REST,.002,`${rate} Hz: submerged start reaches passive equilibrium`);
    near(f.player.vel.y,0,.002,`${rate} Hz: equilibrium has no persistent vertical motion`);
    near(f.player.submerged,WATER_FLOAT_SUBMERGED,.002,`${rate} Hz: passive immersion is consistent`);
    ok(f.player.pos.y+f.player.eyeHeight>SURFACE+.15,`${rate} Hz: eyes stay safely above the surface`);
    ok(result.maxY<=REST+.005,`${rate} Hz: recovery never pops out above equilibrium`);
    eq(result.ground,0,`${rate} Hz: automatic flotation never settles on the deep floor`);
    eq(f.world.loads,beforeLoads,`${rate} Hz: flotation does not load or generate terrain`);
    const settled=advance(f.player,4,rate);
    ok(settled.maxY-settled.minY<.002,`${rate} Hz: resting surface does not bob or jitter`);
    rises.push(result.samples);
}
let maxRiseDifference=0;
for(let second=0;second<8;second++) {
    const spread=Math.max(...rises.map(values=>values[second]))-Math.min(...rises.map(values=>values[second]));
    maxRiseDifference=Math.max(maxRiseDifference,spread);
    ok(spread<.025,`recovery trajectory differs by under 2.5 cm at second ${second+1}`);
}
{
    const f=fixture({y:22});advance(f.player,8,[1/30,1/120,1/60,1/90]);
    near(f.player.pos.y,REST,.003,'varying frame durations reach the same passive equilibrium');
}

// Deliberate diving wins over auto-float and even a simultaneous Space press.
// Releasing the control restores flotation without another keyboard action.
for(const rate of RATES) {
    const f=fixture();advance(f.player,1,rate,['ShiftLeft']);
    ok(f.player.pos.y<REST-2.5,`${rate} Hz: Shift dives substantially below the surface`);
    ok(f.player.vel.y<-3.5,`${rate} Hz: Shift retains a clear downward velocity`);
    advance(f.player,10,rate);
    near(f.player.pos.y,REST,.003,`${rate} Hz: release after diving returns to dry-eye flotation`);
    const both=fixture();advance(both.player,1,rate,['ShiftRight','Space']);
    ok(both.player.pos.y<REST-2.5,`${rate} Hz: explicit dive wins over simultaneous upward input`);
    const up=fixture();advance(up.player,6,rate,['Space']);
    near(up.player.pos.y,HELD,.003,`${rate} Hz: Space holds a higher controlled surface position`);
    ok(up.player.pos.y>REST+.1,`${rate} Hz: Space remains useful above passive flotation`);
}

// The original blocker: sinking into a one-block rise in an otherwise deep
// river bed. Test actual travelled distance, not riverDistance which also
// accumulates while pressing against a wall.
for(const rate of RATES)for(const boundary of [6,-16]) {
    const x=boundary-5.5,f=fixture({x,floor:(wx)=>wx>=boundary?21:20,flow:[2,0]});
    const result=advance(f.player,10,rate);
    near(f.player.pos.x,x+20,.01,`${rate} Hz: passive current crosses the submerged bed step at ${boundary}`);
    near(f.player.pos.y,REST,.003,`${rate} Hz: river drift retains its surface height`);
    eq([result.walls,result.ground],[0,0],`${rate} Hz: river drift never snags on the deep bed`);
}

// Buoyancy must not become automatic stair climbing through a real bank.
// Space and movement still provide the established way to leave the water.
for(const rate of RATES) {
    const bank=()=>fixture({x:5.6,floor:x=>x>=6?25:20,flow:[2,0]});
    const blocked=bank();advance(blocked.player,2,rate);
    ok(blocked.player.pos.x<=5.7001,`${rate} Hz: solid river bank still blocks passive drift`);
    eq(blocked.player.collidesAt(blocked.player.pos),false,`${rate} Hz: passive flotation never penetrates the bank`);
    const climbing=bank();advance(climbing.player,1,rate,['Space','KeyD']);
    ok(climbing.player.pos.x>6.3&&climbing.player.pos.y>=26,`${rate} Hz: Space plus movement still climbs onto the bank`);
    eq(climbing.player.collidesAt(climbing.player.pos),false,`${rate} Hz: climbing respects the whole player collider`);
}

// Falling water is wet and slows a fall, but never acts as a passive elevator.
// Intentional swimming can still ascend it. A receiving pool supports only
// the portion of the body that really intersects its non-falling water.
for(const rate of RATES)for(const fall of [1,8,16]) {
    const f=fixture({top:0,y:45,cell:(x,y,z)=>y>0&&y<100?fallingWaterId(fall):undefined});
    f.player.updateWater();
    near(f.player.submerged,1,1e-10,`fall ${fall}: the full body is still wet`);
    eq(f.player.buoyantSubmerged,0,`fall ${fall}: wetness is separate from support`);
    const result=advance(f.player,3,rate);
    ok(f.player.pos.y<41,`${rate} Hz/fall ${fall}: a vertical struga carries no player upward`);
    ok(result.maxY<=45&&f.player.vel.y<0,`${rate} Hz/fall ${fall}: no hidden upward rebound in falling water`);
}
for(const rate of RATES) {
    const f=fixture({top:0,y:45,cell:(x,y,z)=>y>0&&y<100?fallingWaterId(8):undefined});
    advance(f.player,3,rate,['Space']);
    ok(f.player.pos.y>48,`${rate} Hz: intentional Space swimming can ascend falling water`);
    const pool=fixture({y:23,cell:(x,y,z)=>y>=26&&y<=50?fallingWaterId(8):undefined});
    advance(pool.player,10,rate);
    near(pool.player.pos.y,26-1.8*WATER_FLOAT_SUBMERGED,.004,`${rate} Hz: a pool below a waterfall supports the body at its own level`);
    ok(pool.player.pos.y<25,`${rate} Hz: pool support cannot pull the player up the falling column`);
}

// No lift is invented from the air below a suspended sheet, including an
// isolated full source and the thinnest spreading-water level.
for(const id of [SOURCE,waterIdForLevel(7)])for(const rate of RATES) {
    const f=fixture({top:0,y:29.4,cell:(x,y,z)=>y===30?id:undefined});
    f.player.updateWater();
    ok(f.player.buoyantSubmerged<=.875/1.8+1e-10,'suspended sheet counts only its real liquid volume');
    const result=advance(f.player,2,rate);
    ok(f.player.pos.y<27&&result.maxY<=29.4,`${rate} Hz: suspended sheet cannot hold a player in the air below it`);
}

// Sloped/low surface levels and source-preserving aquatic plants keep their
// established surface rules; no source-only height assumption is introduced.
for(const level of [1,4,7]) {
    const height=WATER_SURFACE*(8-level)/8;
    const f=fixture({y:22,cell:(x,y,z)=>y===25?waterIdForLevel(level):undefined});
    advance(f.player,8,60);
    near(f.player.pos.y,25+height-1.8*WATER_FLOAT_SUBMERGED,.004,`flow level ${level}: equilibrium follows its actual surface`);
}
for(const type of ['water_lily','duckweed','water_milfoil','cattail_water']) {
    const f=fixture({y:22,cell:(x,y,z)=>y===25?getBlockId(type):undefined});
    advance(f.player,8,60);
    near(f.player.pos.y,REST,.004,`${type}: waterlogged source still supports floating`);
}

// Shallows remain walkable and jumpable. Dry movement and creative flight
// retain their own gravity/control path; ceilings still cap upward recovery.
{
    const f=fixture({floor:()=>20,top:21,y:21.0001});
    advance(f.player,2,60);
    near(f.player.pos.y,21,.001,'shallow water does not levitate a grounded player');
    eq(f.player.onGround,true,'shallow wading keeps ground contact');
    f.player.update(1/60,input(['Space']));
    near(f.player.vel.y,JUMP_SPEED,1e-8,'Space in shallow water keeps the normal ground jump');
    const dry=fixture({top:0,y:10});advance(dry.player,.2,60);
    ok(dry.player.pos.y<10&&dry.player.vel.y<0,'dry air retains normal falling');
    eq([dry.player.submerged,dry.player.buoyantSubmerged],[0,0],'dry body has neither wetness nor support');
    const flight=fixture({y:22});flight.player.flying=true;flight.player.canFly=true;
    advance(flight.player,2,60);
    near(flight.player.pos.y,22,1e-10,'creative flight ignores automatic buoyancy');
    eq(flight.player.swimming,false,'creative flight remains distinct from swimming');
    const roof=fixture({y:22,cell:(x,y,z)=>y===26?STONE:undefined});advance(roof.player,8,60);
    ok(roof.player.pos.y+roof.player.height<=26,'upward recovery stops below a solid ceiling');
    eq(roof.player.collidesAt(roof.player.pos),false,'buoyancy never passes through the ceiling');
}

// Surface force is sampled from the same 2–3 body cells as wetness. Neither
// deep lakes nor a tall falling column may trigger an upward surface scan.
for(const kind of ['pool','falling','shallow'])for(const y of [10.1,50.1,90.1]) {
    const f=fixture({top:127,y,cell:kind==='falling'?(x,y,z)=>y>0?fallingWaterId(16):undefined:
        kind==='shallow'?(x,cy,z)=>cy===Math.floor(y)?waterIdForLevel(7):cy>0?0:undefined:null});
    const beforeLoads=f.world.loads;
    f.world.reads=0;f.player.updateWater();
    ok(f.world.reads<=57,`${kind}/${y}: wetness and buoyancy have at most 57 block reads`);
    const queries=f.world.reads;
    f.player.updateSwimming(1/60,f.player.submerged,false,input());
    eq(f.world.reads,queries,`${kind}/${y}: the force calculation performs no extra terrain reads`);
    eq(f.world.loads,beforeLoads,`${kind}/${y}: no terrain loading during water sampling`);
}

console.log(`OK: pływanie — ${checks} sprawdzeń wyporności, 30/60/120 Hz, nurkowania, koryta, strug i kolizji; różnica wynurzania ${(maxRiseDifference*100).toFixed(2)} cm.`);
