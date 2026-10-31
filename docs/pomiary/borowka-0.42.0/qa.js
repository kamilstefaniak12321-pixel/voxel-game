// Local QA only, served outside the repository and installed game profile.
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
const defaults = { ...SETTINGS_DEFAULTS, potato:false, renderScale:100, viewDistance:48,
  farTerrain:8192, farDetail:2, shadows:3, fpsLimit:0, lightingModel:'atmosphere', debug:true };
Settings.prototype.load=()=>({...defaults,revision:2});
Settings.prototype.save=()=>{};
let game, run=null, point='ujscie', gl, gpuExt, pending=[];
const results=[];
let surfaceChecks=null;
const fixtures={
  brzeg:{x:.5,y:61,z:5,yaw:0,pitch:-.45},
  widok:{x:179.5,y:53,z:-242.5,yaw:-1.9333405641,pitch:-.2323760721},
  lilie:{x:181.5,y:52,z:-242.5,yaw:-1.5292555958,pitch:-.9049434294},
  palka:{x:177.5,y:52,z:-250.5,yaw:1.5630492624,pitch:-.8150301580},
  podwoda:{x:184,y:48.6,z:-241,yaw:0,pitch:-.12},
  zgloszenie:{x:188,y:132,z:-252,yaw:3.65,pitch:-.7},
  ujscie:{x:968,y:83,z:-175,yaw:0,pitch:-.65},
  koryto:{x:0,y:103,z:30,yaw:0,pitch:-.7},
  jezioro:{x:520,y:100,z:400,yaw:0,pitch:-.7}
};
const panel=document.createElement('section');
panel.id='river-qa';
panel.style.cssText='position:fixed;z-index:10000;right:10px;top:48px;width:400px;padding:10px;background:#17212aee;color:white;font:12px monospace;pointer-events:auto';
panel.innerHTML='<b>Borówka — modele v1.2</b><div data-device>Uruchom świat testowy: seed lighting-rtx3050-0231.</div><div><button data-point="zgloszenie">Miejsce ze zdjęcia</button> <button data-point="ujscie">Ujście</button> <button data-point="koryto">Stare koryto</button> <button data-point="jezioro">Jezioro</button></div><label>X <input data-x size="5" value="968"></label> <label>Y <input data-y size="4" value="83"></label> <label>Z <input data-z size="5" value="-175"></label><button data-teleport>Przenieś</button><div><button data-near>Pełne bloki: 192</button> <button data-far>Pełne bloki: 48</button> <button data-cap>Limit 60</button> <button data-uncap>Bez limitu</button></div><button data-measure>Pomiar: 10 + 30 s</button> <button data-hide>Ukryj panel</button><div data-status>Gotowe.</div><details><summary>Wyniki</summary><pre style="max-height:220px;overflow:auto;white-space:pre-wrap"></pre></details>';
document.body.append(panel);
const photoButton=document.createElement('button');photoButton.textContent='Czyste zdjęcie';panel.append(photoButton);
photoButton.onclick=()=>{if(!game)return;game.settings.set('showHand',false);game.highlight.mesh.material.visible=false;panel.style.display='none';for(const id of ['info','touch','hotbar','crosshair'])document.getElementById(id).style.visibility='hidden';};
const status=panel.querySelector('[data-status]'), output=panel.querySelector('pre');
function teleport(p){if(!game||run)return;game.input.reset?.();game.player.pos.set(p.x,p.y,p.z);game.player.vel.set(0,0,0);game.player.yaw=p.yaw??0;game.player.pitch=p.pitch??-.65;game.player.flying=true;game.player.updateCamera();game.time.days=Math.floor(game.time.days)+.5;game.time.speed=0;for(const k of ['x','y','z'])panel.querySelector(`[data-${k}]`).value=p[k];status.textContent=`${point}: ${p.x}, ${p.y}, ${p.z}`;}
for(const [key,label] of [['brzeg','Brzeg z roślinami'],['widok','Wzdłuż rzeki'],['lilie','Lilie z bliska'],['palka','Pałka z bliska'],['podwoda','Pod wodą']]) {const button=document.createElement('button');button.textContent=label;button.dataset.point=key;panel.querySelector('b').after(button);}
panel.querySelectorAll('[data-point]').forEach(b=>b.onclick=()=>{point=b.dataset.point;teleport(fixtures[point]);});
const gpuButton=document.createElement('button');gpuButton.textContent='Sprawdź materiały GPU';panel.append(gpuButton);
gpuButton.onclick=async()=>{if(!game||run)return;status.textContent='Test materiałów GPU…';try{const {checkSurfaceRendering}=await import('/tools/surface_render_checks.js');surfaceChecks=await checkSurfaceRendering({game,settings:game.settings,renderer:game.renderer,yieldBrowser:async()=>{}});status.textContent='Materiały GPU: '+surfaceChecks.status;output.textContent=JSON.stringify(surfaceChecks,null,2);fetch('/river-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:device(),seed:game.worldInfo.seed,results,surfaceChecks})});}catch(error){status.textContent='BŁĄD GPU: '+error.message;}};
panel.querySelector('[data-teleport]').onclick=()=>{point='własny';teleport(Object.fromEntries(['x','y','z'].map(k=>[k,Number(panel.querySelector(`[data-${k}]`).value)])));};
panel.querySelector('[data-near]').onclick=()=>game?.settings.set('viewDistance',192);
panel.querySelector('[data-far]').onclick=()=>game?.settings.set('viewDistance',48);
panel.querySelector('[data-cap]').onclick=()=>game?.settings.set('fpsLimit',60);
panel.querySelector('[data-uncap]').onclick=()=>game?.settings.set('fpsLimit',0);
panel.querySelector('[data-hide]').onclick=()=>{panel.style.display='none'; document.querySelector('#info').style.display='none'; document.querySelector('#touch').style.visibility='hidden';};
document.addEventListener('keydown',e=>{if(e.key==='F8'){panel.style.display=panel.style.display==='none'?'':'none';if(panel.style.display!=='none'){document.querySelector('#info').style.display='';document.querySelector('#touch').style.visibility='';}}});
const summary=a=>{const s=[...a].sort((a,b)=>a-b), sum=a.reduce((a,b)=>a+b,0), low=s.slice(-Math.max(1,Math.ceil(s.length*.01)));return{samples:a.length,averageMs:sum/a.length,fps:1000*a.length/sum,p99Ms:s[Math.ceil(s.length*.99)-1],maxMs:s.at(-1),low1Fps:1000*low.length/low.reduce((a,b)=>a+b,0),over33ms:s.filter(v=>v>33.34).length};};
const pose=()=>{const p=game.player;return{x:p.pos.x,y:p.pos.y,z:p.pos.z,yaw:p.yaw,pitch:p.pitch};};
function device(){const d=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:d?gl.getParameter(d.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],userAgent:navigator.userAgent};}
panel.querySelector('[data-measure]').onclick=()=>{if(!game||run)return;run={start:performance.now()+10000,end:performance.now()+40000,point,pose:pose(),frames:[],cpu:[],gpu:[],last:null,settings:Object.fromEntries(Object.keys(defaults).map(k=>[k,game.settings.get(k)]))};status.textContent='Rozgrzewka 10 s, następnie pomiar 30 s.';};
const start=Game.start,render=Game.prototype.render;
Game.start=async function(...args){const pointName='brzeg';args[3]={...args[3],player:{...fixtures[pointName],flying:true},inventory:args[3].inventory};game=await start.apply(this,args);gl=game.renderer.getContext();gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');panel.querySelector('[data-device]').textContent=`${device().renderer}; seed: ${game.worldInfo.seed}`;point=pointName;teleport(fixtures[point]);return game;};
Game.prototype.render=function(...args){const t=performance.now(),current=run&&t>=run.start&&t<run.end?run:null;let q=null;if(current&&gpuExt&&pending.length<8&&!gl.getQuery(gpuExt.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){q=gl.createQuery();gl.beginQuery(gpuExt.TIME_ELAPSED_EXT,q);}try{return render.apply(this,args);}finally{if(q){gl.endQuery(gpuExt.TIME_ELAPSED_EXT);pending.push({q,run:current});}if(current){current.cpu.push(performance.now()-t);if(current.last!==null)current.frames.push(t-current.last);current.last=t;}}};
function frame(t){
 if(gl&&gpuExt){const disjoint=gl.getParameter(gpuExt.GPU_DISJOINT_EXT);pending=pending.filter(p=>{if(!disjoint&&!gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE))return true;if(!disjoint)p.run.gpu.push(gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.q);return false;});}
 if(run&&t>=run.end&&!pending.length){const finished=run;run=null;results.push({point:finished.point,pose:finished.pose,experiments:{...game.world.experiments},settings:finished.settings,frames:summary(finished.frames),renderCpu:summary(finished.cpu),gpu:summary(finished.gpu),renderInfo:{calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles}});const report={device:device(),seed:game.worldInfo.seed,results};output.textContent=JSON.stringify(report,null,2);fetch('/river-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});status.textContent=`Gotowe: ${results.at(-1).frames.fps.toFixed(1)} FPS, 1%: ${results.at(-1).frames.low1Fps.toFixed(1)} FPS.`;}
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
await import('/src/main.js');


const bushes=['blueberry_sapling','blueberry_bush_few','blueberry_bush_full','blueberry_bush'];
function qaButton(label,action){const b=document.createElement('button');b.textContent=label;b.onclick=action;panel.append(b);}
qaButton('Ogród borówek',()=>{if(!game)return;for(let x=-7;x<=7;x++)for(let z=-5;z<=8;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<=65;y++)game.world.setBlock(x,y,z,null);}bushes.forEach((type,i)=>game.world.setBlock(-3+i*2,61,0,type));game.inventory.slots.fill(null);bushes.forEach((type,i)=>game.inventory.set(i,{type,count:64}));game.inventory.set(4,{type:'blueberry',count:16});game.plantGrowth.speed=0;point='ogrod';teleport(fixtures.brzeg);});
qaButton('Pełny krzak z bliska',()=>{point='pelny';teleport({x:1.5,y:61,z:2.7,yaw:0,pitch:-.58});});
qaButton('Widok z boku',()=>{point='bok';teleport({x:5.7,y:61,z:.5,yaw:Math.PI/2,pitch:-.23});});
qaButton('Odrośnij jeden etap',()=>{game.plantGrowth.growAround(.5,.5,8,1);status.textContent=bushes.map((_,i)=>game.world.getBlock(-3+i*2,61,0)).join(' / ');});
qaButton('Pełny ekwipunek',()=>{game.inventory.slots.fill(null);game.inventory.slots.forEach((_,i)=>game.inventory.set(i,{type:'stone',count:64}));status.textContent='Ekwipunek pełny';});
qaButton('Miejsce na owoce',()=>{game.inventory.set(0,null);status.textContent='Wolna kratka';});
qaButton('400 pełnych krzaków',()=>{for(let x=-10;x<10;x++)for(let z=-20;z<0;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<=64;y++)game.world.setBlock(x,y,z,null);game.world.setBlock(x,61,z,'blueberry_bush_full');}point='400-krzakow';teleport({x:.5,y:62,z:4,yaw:0,pitch:-.35});});
qaButton('Zapisz próbę',async()=>{status.textContent='Zapis: '+await game.saver.flush();});
