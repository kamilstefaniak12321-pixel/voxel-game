import {Game} from '/src/game/Game.js';
import {Settings,SETTINGS_DEFAULTS} from '/src/settings/Settings.js';
import {WorldStorage,createWorldInfo} from '/src/storage/WorldStorage.js';
const defaults={...SETTINGS_DEFAULTS,potato:false,renderScale:100,viewDistance:48,farTerrain:8192,farDetail:2,shadows:3,fpsLimit:0,lightingModel:'atmosphere',showDebug:false,showHand:false,meteorites:false};
Settings.prototype.load=()=>({...defaults,revision:2});Settings.prototype.save=()=>{};
const db=await WorldStorage.open();if(!(await db.listWorlds()).length)await db.saveWorld(createWorldInfo('Cienie — próba 0.52.0',2138286349,'classic','creative'));db.db.close();
let game,gl,run=null,errors=[],results=[],gpuChecks=null,testing=false,point='fixture',pending=[],gpuExt;
const panel=document.createElement('section');panel.style.cssText='position:fixed;z-index:10000;right:10px;top:48px;width:360px;padding:12px;background:#18242bed;color:#fff;font:13px system-ui;pointer-events:auto';panel.innerHTML='<b>Cienie — próba 0.52.0</b><p data-status>Wczytaj świat próbny</p><div data-buttons></div><pre style="max-height:170px;overflow:auto;white-space:pre-wrap"></pre>';document.body.append(panel);const status=panel.querySelector('[data-status]');
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.margin='3px';b.onclick=async()=>{if(run||testing)return;try{await fn();}catch(e){errors.push(String(e.stack||e));status.textContent='BŁĄD '+e.message;await report('error');}};panel.querySelector('[data-buttons]').append(b);}
addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const oldError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));oldError(...args);};
function device(){const e=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'',buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],userAgent:navigator.userAgent};}
async function report(name){await fetch('/qa-report?name='+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:device(),settings:defaults,errors,results,gpuChecks,shadows:game.shadows.stats()},null,2)});}
function teleport(x,y,z,pitch=-.4,yaw=0){game.input.reset?.();game.player.pos.set(x,y,z);game.player.vel.set(0,0,0);game.player.yaw=yaw;game.player.pitch=pitch;game.player.flying=true;game.player.updateCamera();}
function time(fraction){game.time.days=Math.floor(game.time.days)+fraction;game.time.speed=0;}
const start=Game.start,update=Game.prototype.update,render=Game.prototype.render;
Game.start=async function(...args){args[3]={...args[3],campfires:[],player:{x:0,y:100,z:10,yaw:0,pitch:-.5,flying:true}};game=await start.apply(this,args);gl=game.renderer.getContext();gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');teleport(0,100,10);time(.43);status.textContent=device().renderer;return game;};
Game.prototype.update=function(dt){if(game===this&&testing)return;if(game===this&&run){const t=Math.max(0,Math.min(1,(performance.now()-run.start)/30000));teleport(-28.5,90,66.5-(run.flight?256*t:0),-.25);}return update.call(this,dt);};
Game.prototype.render=function(...args){if(game===this&&testing)return;const t=performance.now(),r=run&&t>=run.start&&t<run.end?run:null;let q;if(r&&gpuExt&&pending.length<8&&!gl.getQuery(gpuExt.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){q=gl.createQuery();gl.beginQuery(gpuExt.TIME_ELAPSED_EXT,q);}try{return render.apply(this,args);}finally{if(q){gl.endQuery(gpuExt.TIME_ELAPSED_EXT);pending.push({q,run:r});}if(r){r.cpu.push(performance.now()-t);if(r.last!==null)r.frames.push(t-r.last);r.last=t;}}};
const summary=a=>{const s=[...a].sort((a,b)=>a-b),sum=a.reduce((a,b)=>a+b,0);return {samples:a.length,averageMs:sum/a.length,fps:1000*a.length/sum,p99Ms:s[Math.ceil(s.length*.99)-1],maxMs:s.at(-1),over33ms:s.filter(n=>n>33.34).length};};
function frame(t){if(gl&&gpuExt){const disjoint=gl.getParameter(gpuExt.GPU_DISJOINT_EXT);pending=pending.filter(p=>{if(!disjoint&&!gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE))return true;if(!disjoint)p.run.gpu.push(gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.q);return false;});}if(run&&t>=run.end&&!pending.length){const r=run;run=null;results.push({point:r.point,frames:summary(r.frames),cpu:summary(r.cpu),gpu:summary(r.gpu),info:{...game.renderer.info.render}});status.textContent=r.point+': '+results.at(-1).frames.fps.toFixed(1)+' FPS';panel.querySelector('pre').textContent=JSON.stringify(results.at(-1),null,2);report(r.point);}requestAnimationFrame(frame);}requestAnimationFrame(frame);
function fixture(){
 for(let x=-12;x<=12;x++)for(let z=-12;z<=10;z++){game.world.setBlock(x,94,z,'stone');for(let y=95;y<103;y++)game.world.setBlock(x,y,z,null);}
 for(let y=95;y<99;y++){game.world.setBlock(-3,y,-1,'stone');game.world.setBlock(3,y,-3,'oak_log');}
 for(let x=2;x<=4;x++)for(let z=-4;z<=-2;z++)game.world.setBlock(x,99,z,'oak_leaves');
 for(let x=-1;x<=1;x++)game.world.setBlock(x,95,-2,'fern');
 game.world.setBlock(-5,95,-3,'tall_grass');game.world.setBlock(5,95,0,'short_grass');
 game.plantGrowth.speed=0;teleport(.5,96,6,-.45);time(.43);point='fixture-day';status.textContent='Bliskie cienie: słupy, liście, paproć i gracz';
}
button('Bliskie cienie',fixture);
button('Zbliżenie krawędzi',()=>{teleport(-2,95,2,-.7);point='edge-day';});
button('Dzień / noc',()=>{const night=game.time.days%1>.1;time(night?.02:.43);point=night?'fixture-night':'fixture-day';});
button('Zachód',()=>{time(.735);point='fixture-sunset';});
button('Zapisz kadr',()=>{game.render();game.renderer.domElement.toBlob(blob=>fetch('/qa-image?name='+point,{method:'POST',body:blob}));report(point);});
function benchmark(flight){teleport(-28.5,90,66.5,-.25);time(.43);game.time.speed=1;point=flight?'flight':'static';const t=performance.now();run={point,flight,start:t+10000,end:t+40000,frames:[],cpu:[],gpu:[],last:null};status.textContent='10 s rozgrzewki + 30 s pomiaru: '+point;}
button('Pomiar: widok terenu',()=>benchmark(false));button('Pomiar: lot 256 bloków',()=>benchmark(true));
button('Sprawdzenia GPU cieni',async()=>{testing=true;status.textContent='Test dalekich cieni, samocienia i ciągłych krawędzi…';try{const {checkDistantShadowRendering}=await import('/tools/shadow_render_checks.js');gpuChecks=await checkDistantShadowRendering({renderer:game.renderer,yieldBrowser:()=>new Promise(requestAnimationFrame)});status.textContent='GPU: '+gpuChecks.status;await report('gpu');}finally{testing=false;}});
await import('/src/main.js');
