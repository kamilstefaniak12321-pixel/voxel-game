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
panel.innerHTML='<b>Borówka — animacje 0.43.0</b><div data-device>Uruchom świat testowy: seed lighting-rtx3050-0231.</div><div><button data-point="zgloszenie">Miejsce ze zdjęcia</button> <button data-point="ujscie">Ujście</button> <button data-point="koryto">Stare koryto</button> <button data-point="jezioro">Jezioro</button></div><label>X <input data-x size="5" value="968"></label> <label>Y <input data-y size="4" value="83"></label> <label>Z <input data-z size="5" value="-175"></label><button data-teleport>Przenieś</button><div><button data-near>Pełne bloki: 192</button> <button data-far>Pełne bloki: 48</button> <button data-cap>Limit 60</button> <button data-uncap>Bez limitu</button></div><button data-measure>Pomiar: 10 + 30 s</button> <button data-hide>Ukryj panel</button><div data-status>Gotowe.</div><details><summary>Wyniki</summary><pre style="max-height:220px;overflow:auto;white-space:pre-wrap"></pre></details>';
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
 if(run&&t>=run.end&&!pending.length){const finished=run;run=null;results.push({point:finished.point,pose:finished.pose,experiments:{...game.world.experiments},settings:finished.settings,activePeak,animationCpu:finished.animationCpu?.length?summary(finished.animationCpu):null,frames:summary(finished.frames),renderCpu:summary(finished.cpu),gpu:summary(finished.gpu),renderInfo:{calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles}});const report={device:device(),seed:game.worldInfo.seed,results};output.textContent=JSON.stringify(report,null,2);fetch('/river-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});status.textContent=`Gotowe: ${results.at(-1).frames.fps.toFixed(1)} FPS, 1%: ${results.at(-1).frames.low1Fps.toFixed(1)} FPS.`;}
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

// Application-owned local instrumentation; no installed game profile is used.
let animationRate=1, cycleTimer=null, animationStart=null, activePeak=0;
const integration=[];
const errors=[];
addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));
addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const gameUpdate=Game.prototype.update;
Game.prototype.update=function(dt){
  if(!this.plantAnimations.qaWrapped){
    const animator=this.plantAnimations,update=animator.update.bind(animator);
    animationStart=animator.start.bind(animator);
    animator.update=step=>{const t=performance.now();update(step*animationRate);if(run&&performance.now()>=run.start){(run.animationCpu??=[]).push(performance.now()-t);activePeak=Math.max(activePeak,animator.active.size);}};
    animator.qaWrapped=true;
  }
  return gameUpdate.call(this,dt);
};
const testCell={x:1,y:61,z:0};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const typeAt=()=>game.world.getBlock(1,61,0);
const interact=()=>game.harvestTarget({hit:true,block:{...testCell,type:typeAt()}});
function setTest(type){game.world.setBlock(1,61,0,type);}
function poseTest(){point='animacje';teleport({x:1.5,y:61,z:2.1,yaw:0,pitch:-.62});}
function resetTest(){if(!game)return;for(let x=-7;x<=7;x++)for(let z=-5;z<=8;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<=65;y++)game.world.setBlock(x,y,z,null);}game.plantGrowth.speed=0;game.settings.set('showHand',false);poseTest();game.inventory.slots.forEach((_,i)=>game.inventory.set(i,null));setTest('blueberry_bush_full');}
qaButton('Próba animacji z bliska',resetTest);
qaButton('Posadź',async()=>{setTest(null);await pause(650);setTest('blueberry_bush_full');});
qaButton('Usuń',()=>setTest(null));
qaButton('Zbierz: wolne',()=>{game.inventory.set(0,null);interact();});
qaButton('Zbierz: pełny',()=>{game.inventory.slots.forEach((_,i)=>game.inventory.set(i,{type:'stone',count:64}));interact();});
qaButton('Młody → dorosły',async()=>{setTest('blueberry_sapling');await pause(2000);game.plantGrowth.growAround(1.5,.5,1,1);});
qaButton('Odrastanie owoców',()=>game.plantGrowth.growAround(1.5,.5,1,1));
qaButton('Normalnie / 4× wolniej',()=>{animationRate=animationRate===1?.25:1;status.textContent='Tempo podglądu: '+animationRate;});
async function reportExtra(){await fetch('/river-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:device(),seed:game.worldInfo.seed,results,integration,errors,surfaceChecks,activePeak})});}
qaButton('Sprawdź cały cykl',async()=>{
  animationRate=1;resetTest();await pause(1800);
  function check(name,ok,details){integration.push({name,ok,details});if(!ok)throw Error(name);status.textContent='OK: '+name;}
  try{
    game.inventory.slots.forEach((_,i)=>game.inventory.set(i,{type:'stone',count:64}));
    const rejected=interact();check('Pełny ekwipunek zachowuje pełny krzak',rejected===false&&typeAt()==='blueberry_bush_full');
    check('Uruchomiona reakcja odmowy',[...game.plantAnimations.active].some(e=>e.kind==='reject'));
    await pause(850);game.inventory.set(0,null);const collected=interact();
    check('Zbiór daje owoce i dorosły pusty krzak',collected===true&&typeAt()==='blueberry_bush'&&game.inventory.slots[0]?.type==='blueberry',game.inventory.slots[0]);
    await pause(850);game.plantGrowth.growAround(1.5,.5,1,1);await pause(650);
    const partial=[...game.plantAnimations.active].find(e=>e.x===1&&e.z===0);
    check('Owoce narastają częściowo',partial?.pose.fruit.some(v=>v>0&&v<1),partial&&[...partial.pose.fruit]);
    await pause(1400);check('Pierwsze owoce osiągają etap few',typeAt()==='blueberry_bush_few');
    game.plantGrowth.growAround(1.5,.5,1,1);await pause(2000);check('Odrasta pełny plon',typeAt()==='blueberry_bush_full');
    setTest('blueberry_sapling');await pause(2000);game.plantGrowth.growAround(1.5,.5,1,1);await pause(450);
    const growing=[...game.plantAnimations.active].find(e=>e.x===1&&e.z===0);
    check('Płynny rozmiar sadzonki',growing?.pose.size>.55&&growing?.pose.size<1,growing?.pose.size);
    setTest(null);await pause(650);check('Przerwanie wzrostu usunięciem bez resztek',typeAt()===null&&game.plantAnimations.active.size===0);
    setTest('blueberry_bush_full');await pause(900);check('Zapis przechodzi',await game.saver.flush());
    check('Brak błędów JS',errors.length===0,errors);
  }catch(e){status.textContent='BŁĄD: '+e.message;}await reportExtra();
});
function benchmark(animated){
  if(run)return;animationRate=1;activePeak=0;clearInterval(cycleTimer);
  const animator=game.plantAnimations;
  for(const e of [...animator.active])animator.remove(e);
  animator.start=animated?animationStart:()=>false;
  for(let x=-10;x<10;x++)for(let z=-20;z<0;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<=64;y++)game.world.setBlock(x,y,z,null);game.world.setBlock(x,61,z,'blueberry_bush_full');}
  point=animated?'12-animacji-400-krzakow':'bez-animacji-400-krzakow';teleport({x:.5,y:62,z:4,yaw:0,pitch:-.35});
  let phase=0;cycleTimer=setInterval(()=>{phase++;const types=['blueberry_sapling','blueberry_bush_few','blueberry_bush_full','blueberry_bush'];for(let i=0;i<24;i++)game.world.setBlock(-6+i%12,61,-1-Math.floor(i/12)*2,types[phase%4]);},2400);
  panel.querySelector('[data-measure]').click();
  setTimeout(async()=>{clearInterval(cycleTimer);animator.start=animationStart;await pause(900);await reportExtra();},41000);
}
qaButton('Pomiar bez animacji',()=>benchmark(false));
qaButton('Pomiar z animacjami (limit 12)',()=>benchmark(true));
qaButton('Nagraj cykl (14 s)',async()=>{
  if(run)return;resetTest();teleport({x:1.5,y:61,z:-1.2,yaw:Math.PI,pitch:-.62});
  game.highlight.mesh.material.visible=false;await pause(1500);
  animationRate=.5;const stream=game.renderer.domElement.captureStream(30);
  const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});
  const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
  const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();
  setTest(null);await pause(1000);setTest('blueberry_sapling');await pause(1600);
  game.plantGrowth.growAround(1.5,.5,1,1);await pause(3900);
  game.plantGrowth.growAround(1.5,.5,1,1);await pause(3900);
  game.inventory.slots.forEach((_,i)=>game.inventory.set(i,{type:'stone',count:64}));interact();await pause(1600);
  game.inventory.set(0,null);interact();await pause(1700);recorder.stop();await done;
  stream.getTracks().forEach(t=>t.stop());animationRate=1;
  await fetch('/animation-recording',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});
  status.textContent='Zapisany film cyklu borówki';
});
