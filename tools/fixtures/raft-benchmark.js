// Real Game input, current resolver, raft renderer and water simulation.
import * as THREE from 'three';
import {Game} from '../../src/game/Game.js';
import {Settings} from '../../src/settings/Settings.js';
import {createWorldInfo} from '../../src/storage/WorldStorage.js';
import {atlasReady} from '../../src/rendering/TextureAtlas.js';
import {craftFromGrid} from '../../src/crafting/Crafting.js';
import {Rafts} from '../../src/game/Rafts.js';
import {WATER_SURFACE} from '../../src/config.js';

const LOW=29,TOP=45,REST=LOW+WATER_SURFACE+.08;
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
const quantiles=values=>{
    const a=[...values].sort((x,y)=>x-y),at=p=>a[Math.floor((a.length-1)*p)]??0;
    return {samples:a.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:at(1)};
};
export async function createRaftQA(){
    await atlasReady;
    const checks=[],held=new Set(),clicks=new Set();
    const check=(v,label)=>{if(!v)throw Error(label);checks.push(label);};
    const ensure=(v,label)=>{if(!v)throw Error(label);};
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.setSize(720,480);document.body.append(renderer.domElement);
    const settings=new Settings();
    for(const [key,value] of Object.entries({viewDistance:24,farTerrain:0,loadBudget:1,shadows:0,
        lightShafts:false,bounceLight:false,surfaceBounce:false,meteorites:false,showHand:false,
        viewBobbing:false,potato:true,plantModels:'simple',leafModel:'cube',volumeMaster:0,
        volumeMusic:0,lightingLook:'baseline',cloudCover:0}))settings.set(key,value);
    const input=new Proxy({isKeyDown:k=>held.has(k),consumeKeyPress:()=>false,
        consumeMousePress:k=>clicks.delete(k),consumeMouseDelta:()=>({x:0,y:0})},
        {get:(target,name)=>target[name]??(()=>0)});
    let game,deck,viewDeck;
    async function start(terrain='flat',seed=731,point={x:-10.5,y:TOP+2,z:.5}){
        const info=createWorldInfo('Tratwa — test',seed,terrain,'adventure');
        info.player={...point,yaw:-Math.PI/2,pitch:0,flying:false};
        game=await Game.start(renderer,input,null,info,settings);
        game.player.canFly=false;game.time.speed=0;game.time.days=.5;
    }
    async function settle(){
        for(let i=0;i<6000;i++){
            game.world.fluids.update(.12,.6,64);
            const s=game.world.fluids.stats();game.world.updateMeshes(performance.now()+.6);
            if(s.pending===0&&s.scans===0){game.world.updateMeshes(Infinity);return i+1;}
            if(i%16===0)await pause();
        }
        throw Error('Raft river did not settle');
    }
    function aimDown(){game.player.pitch=-Math.PI/2+.01;game.player.updateCamera();}
    function click(button){clicks.add(button);game.update(1/60);}
    async function initialize(){
        await start();const w=game.world;
        for(let x=-22;x<=35;x++)for(let z=-4;z<=4;z++){
            const top=x<0?TOP:LOW,bed=top-3,wall=x===-22||x>=30||Math.abs(z)===4;
            for(let y=26;y<=TOP+3;y++)w.setBlock(x,y,z,y<=bed||wall&&y<=TOP?'stone':y<=top?'water':null);
            if(!wall){const c=w.getChunk(Math.floor(x/16),Math.floor(z/16)),col=(z-c.cz*16)*16+x-c.cx*16;
                c.flow??=new Int8Array(512);c.flowBounds??=new Uint8Array(512);
                c.flow[col*2]=64;c.flow[col*2+1]=0;c.flowBounds[col]=bed+2;c.flowBounds[256+col]=top+1;}
        }
        const settleSteps=await settle();
        game.player.setState({x:-10.5,y:TOP+1.2,z:.5,yaw:-Math.PI/2,pitch:0,flying:false});
        game.inventory.craft[0]={type:'oak_planks',count:1};game.inventory.craft[1]={type:'spruce_planks',count:1};
        const result=craftFromGrid(game.inventory);check(result?.type==='raft'&&result.count===1,'two different planks craft one raft');
        game.inventory.add(result.type,result.count);game.inventory.selected=game.inventory.slots.findIndex(v=>v?.type==='raft');
        aimDown();click(2);
        check(game.rafts.bodies.length===1,'Game right click places raft on real water ray hit');
        check(!game.inventory.slots.some(v=>v?.type==='raft'),'placement consumes the crafted raft');
        deck=game.rafts.bodies[0];viewDeck=deck;
        aimDown();click(2);check(game.rafts.mounted===deck,'Game right click boards the deck');
        game.player.pitch=-.15;game.player.updateCamera();
        check(deck.water?.flow?.[0]===2 || w.getWaterFlow(-11,TOP,0)?.[0]===2,'real world resolves forward river flow');
        return {checks:[...checks],settleSteps,drop:TOP-LOW};
    }
    async function trip(seconds,keys=[]){
        held.clear();keys.forEach(k=>held.add(k));const trace=[],cpu=[],full=[];
        const start=deck.pos.clone();let minY=deck.pos.y,ground=0,frames=seconds*60;
        for(let i=0;i<frames;i++){
            const before=game.player.clock,t=performance.now();game.update(1/60);full.push(performance.now()-t);cpu.push(game.rafts.lastMs);
            ensure(game.rafts.mounted===deck,'passenger remains mounted');
            ensure(Math.abs(game.player.clock-before-1/60)<1e-7,'one player clock step per Game frame');
            ensure(!deck.collides(undefined,undefined,undefined,undefined,game.player),'neither hull nor passenger penetrates a solid');
            ensure(!game.player.swimming && !game.player.flying,'swim and flight do not fight raft movement');
            ensure(deck.pos.distanceTo(game.player.pos)<.004,'passenger follows waterfall and turns');
            minY=Math.min(minY,deck.pos.y);ground+=Number(deck.grounded);
            if(i%30===0)trace.push({t:i/60,position:deck.pos.toArray(),velocity:deck.vel.toArray()});
            if(i%120===119)await pause();
        }
        held.clear();return {start:start.toArray(),end:deck.pos.toArray(),minY,ground,trace,
            cpu:{rafts:quantiles(cpu),game:quantiles(full),scope:'CPU only; not gameplay FPS'}};
    }
    async function controlled(){
        const first=checks.length,result=await trip(12);
        check(deck.pos.x>10,'passive current carries raft over the 16-block lip');
        check(Math.abs(deck.pos.y-REST)<.04 && result.ground===0,'landing floats above the lower riverbed');
        check(!game.water.underwater,'passenger camera remains above the receiving water');
        const z=deck.pos.z;game.player.yaw=0;await trip(.5,['KeyW']);
        check(deck.pos.z<z-.3,'W steers relative to camera through Game input');
        // Saved player and boat snapshot resume the same occupied deck.
        const state=game.rafts.getState(),player=game.player.getState();
        game.rafts.dispose();game.player.setState(player);game.rafts=new Rafts(game,state);game.saver.rafts=game.rafts;
        deck=game.rafts.mounted;viewDeck=deck;check(Boolean(deck),'mounted snapshot resumes');
        game.update(1/60);
        held.add('ShiftLeft');game.update(1/60);held.clear();
        check(!game.rafts.mounted&&!game.player.collidesAt(game.player.pos),'Game Shift dismounts into clear space');
        // Place the camera over the deck and recover the physical item via Game LPM.
        game.player.setState({x:deck.pos.x,y:deck.pos.y+.3,z:deck.pos.z,yaw:0,pitch:-Math.PI/2+.01,flying:false});
        click(0);check(game.rafts.bodies.length===0,'Game left click removes unoccupied raft');
        check(game.inventory.slots.some(v=>v?.type==='raft'&&v.count===1),'Game pickup returns the item exactly once');
        deck=game.rafts.spawn(14.5,REST,.5,-Math.PI/2);viewDeck=deck;
        game.rafts.mount(deck);game.update(1/60);
        return {checks:checks.slice(first),result};
    }
    async function natural(){
        const first=checks.length;await game.stop({save:false});
        await start('realistic',42,{x:-188.5,y:83,z:-631.5});
        const settleSteps=await settle();
        deck=game.rafts.spawn(-188.5,83+WATER_SURFACE+.08,-631.5,Math.PI/2);viewDeck=deck;
        check(Boolean(deck)&&game.rafts.mount(deck),'board in the generated seed-42 river');
        const result=await trip(9);
        check(deck.pos.x<-200 && deck.pos.y<77,'natural river carries raft down its waterfall');
        check(deck.pos.y>73 && result.ground===0,'natural receiving river supports the raft');
        return {checks:checks.slice(first),seed:42,settleSteps,result};
    }
    function view(name){
        const p=viewDeck.pos;
        if(name.endsWith('eye')){game.player.pitch=-.7;game.player.updateCamera();}
        else {game.camera.position.set(p.x+3,p.y+3.2,p.z+3.5);game.camera.lookAt(p.x,p.y-.1,p.z);}
        game.scene.fog.near=80;game.scene.fog.far=160;game.camera.aspect=1.5;game.camera.updateProjectionMatrix();
        game.water.update(0);game.world.updateMeshes(Infinity);game.render();
        const gl=renderer.getContext();check(gl.getError()===gl.NO_ERROR,`${name}: WebGL renders textured raft`);
        return {name,position:p.toArray(),triangles:game.rafts.geometry?.index.count/3,stats:game.rafts.stats(),drawCalls:renderer.info.render.calls};
    }
    async function dispose(){await game?.stop({save:false});renderer.dispose();renderer.domElement.remove();}
    return {initialize,controlled,natural,view,dispose};
}
