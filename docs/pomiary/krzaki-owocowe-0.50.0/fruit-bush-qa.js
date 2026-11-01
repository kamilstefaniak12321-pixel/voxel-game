// Local native QA entry point. Isolated profile; never shipped with the game.
import { Game } from '/src/game/Game.js';
import { Settings, SETTINGS_DEFAULTS } from '/src/settings/Settings.js';
import { WorldStorage, createWorldInfo } from '/src/storage/WorldStorage.js';
const defaults={...SETTINGS_DEFAULTS,potato:false,renderScale:100,viewDistance:48,farTerrain:8192,farDetail:2,shadows:3,fpsLimit:0,lightingModel:'atmosphere',showDebug:true,showHand:true};
Settings.prototype.load=()=>({...defaults,revision:2});Settings.prototype.save=()=>{};
const db=await WorldStorage.open();if(!(await db.listWorlds()).length)await db.saveWorld(createWorldInfo('Krzaki — próba 0.50.0',2138286349,'classic','adventure'));db.db.close();
const species=['strawberry','blackberry','chili','hazel','blueberry'],items=['strawberry','blackberry','chili_pepper','hazelnut','blueberry'];
const labels=['Truskawka','Jeżyna','Chili','Leszczyna','Borówka'];
const stages=['sapling','bush','bush_few','bush_full'];
let game,gl,gpuExt,run=null,pending=[],timer=null,point='ogrod',activePeak=0,rate=1,selected=0;
const results=[],integration=[],errors=[];
const panel=document.createElement('section');panel.style.cssText='position:fixed;z-index:10000;right:10px;top:48px;width:350px;padding:12px;background:#18242bed;color:#fff;font:13px system-ui;pointer-events:auto';
panel.innerHTML='<b>Krzaki i owoce 3D — próba</b><p data-device></p><p data-status>Wczytaj przygotowany świat.</p><div data-buttons></div><details><summary>Wyniki</summary><pre style="white-space:pre-wrap;max-height:200px;overflow:auto"></pre></details>';document.body.append(panel);
const status=panel.querySelector('[data-status]'),output=panel.querySelector('pre');
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.margin='2px';b.onclick=async()=>{try{await fn();}catch(e){errors.push(e.stack||e.message);status.textContent='BŁĄD: '+e.message;await report('error');}};panel.querySelector('[data-buttons]').append(b);}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const pose=()=>({x:game.player.pos.x,y:game.player.pos.y,z:game.player.pos.z,yaw:game.player.yaw,pitch:game.player.pitch});
function teleport(p){game.input.reset?.();game.player.pos.set(p.x,p.y,p.z);game.player.vel.set(0,0,0);game.player.yaw=p.yaw??0;game.player.pitch=p.pitch??-.4;game.player.flying=true;game.player.updateCamera();game.time.days=Math.floor(game.time.days)+.5;game.time.speed=0;}
function device(){const ext=gl.getExtension('WEBGL_debug_renderer_info');return{renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),drawingBuffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],userAgent:navigator.userAgent};}
async function report(name){await fetch('/qa-report?name='+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:device(),seed:game.worldInfo.seed,settings:game.settings.values,results,integration,errors},null,2)});}
addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const start=Game.start,render=Game.prototype.render,update=Game.prototype.update;
Game.start=async function(...args){args[3]={...args[3],player:{x:.5,y:64,z:7,yaw:0,pitch:-.45,flying:true}};game=await start.apply(this,args);gl=game.renderer.getContext();gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');panel.querySelector('[data-device]').textContent=device().renderer;teleport({x:.5,y:64,z:7});return game;};
Game.prototype.update=function(dt){if(!this.plantAnimations.qaWrapped){const animator=this.plantAnimations,step=animator.update.bind(animator);animator.update=d=>{const t=performance.now();step(d*rate);if(run&&t>=run.start){run.animationCpu.push(performance.now()-t);activePeak=Math.max(activePeak,animator.active.size);}};animator.qaWrapped=true;}return update.call(this,dt);};
Game.prototype.render=function(...args){const t=performance.now(),current=run&&t>=run.start&&t<run.end?run:null;let q;if(current&&gpuExt&&pending.length<8&&!gl.getQuery(gpuExt.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){q=gl.createQuery();gl.beginQuery(gpuExt.TIME_ELAPSED_EXT,q);}try{return render.apply(this,args);}finally{if(q){gl.endQuery(gpuExt.TIME_ELAPSED_EXT);pending.push({q,run:current});}if(current){current.cpu.push(performance.now()-t);if(current.last!==null)current.frames.push(t-current.last);current.last=t;}}};
const summary=a=>{const s=[...a].sort((a,b)=>a-b),sum=a.reduce((a,b)=>a+b,0),low=s.slice(-Math.max(1,Math.ceil(s.length*.01)));return{samples:a.length,averageMs:sum/a.length,fps:1000*a.length/sum,p99Ms:s[Math.ceil(s.length*.99)-1],maxMs:s.at(-1),low1Fps:1000*low.length/low.reduce((a,b)=>a+b,0),over33ms:s.filter(v=>v>33.34).length};};
function frame(t){
 if(gl&&gpuExt){const disjoint=gl.getParameter(gpuExt.GPU_DISJOINT_EXT);pending=pending.filter(p=>{if(!disjoint&&!gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE))return true;if(!disjoint)p.run.gpu.push(gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.q);return false;});}
 if(run&&t>=run.end&&!pending.length){const r=run;run=null;clearInterval(timer);results.push({point:r.point,pose:r.pose,settings:r.settings,activePeak,frames:summary(r.frames),renderCpu:summary(r.cpu),animationCpu:summary(r.animationCpu),gpu:summary(r.gpu),renderInfo:{...game.renderer.info.render}});output.textContent=JSON.stringify(results.at(-1),null,2);status.textContent=`${point}: ${results.at(-1).frames.fps.toFixed(1)} FPS; 1% ${results.at(-1).frames.low1Fps.toFixed(1)}`;report(point);}
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
function clearArea(){for(let x=-10;x<11;x++)for(let z=-21;z<9;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<66;y++)game.world.setBlock(x,y,z,null);}game.plantGrowth.speed=0;}
function inventory(){game.inventory.slots.forEach((_,i)=>game.inventory.set(i,null));items.forEach((type,i)=>game.inventory.set(i,{type,count:16}));}
function gallery(){clearArea();species.forEach((s,i)=>stages.forEach((stage,j)=>game.world.setBlock(-4+i*2,61,-j*3,s+'_'+stage)));inventory();game.settings.set('showHand',false);teleport({x:.5,y:64,z:7,pitch:-.45});status.textContent='Kolumny: truskawka, jeżyna, chili, leszczyna, borówka. Rzędy: cztery etapy.';}
function closeup(i){selected=i;point=species[i];teleport({x:-3.5+i*2,y:61,z:-6.4,pitch:-.35});game.settings.set('showHand',true);game.inventory.selected=i;status.textContent=labels[i]+' — pełny krzak i zebrany owoc';}
button('Ogród 5 × 4 etapy',gallery);labels.forEach((label,i)=>button(label,()=>closeup(i)));
button('Pomiar: 400 mieszanych',()=>benchmark(false));button('Pomiar: zmiany etapów',()=>benchmark(true));
button('Pomiar: pojedynczy wzrost',()=>benchmark(true,1));
function benchmark(animated,changes=24){if(run)return;clearArea();rate=1;activePeak=0;for(let x=-10;x<10;x++)for(let z=-20;z<0;z++)game.world.setBlock(x,61,z,species[(x+10+z+20)%5]+'_bush_full');teleport({x:.5,y:62,z:4,pitch:-.35});game.settings.set('showHand',false);point=animated?(changes===1?'400-single':'400-animated'):'400-static';if(animated){let phase=0;timer=setInterval(()=>{phase++;for(let i=0;i<changes;i++)game.world.setBlock(-6+i%12,61,-1-Math.floor(i/12)*2,species[((-6+i%12)+10+(-1-Math.floor(i/12)*2)+20)%5]+'_'+stages[phase%4]);},2400);}const t=performance.now();run={start:t+10000,end:t+40000,point,pose:pose(),frames:[],cpu:[],gpu:[],animationCpu:[],last:null,settings:Object.fromEntries(Object.keys(defaults).map(k=>[k,game.settings.get(k)]))};status.textContent='10 s rozgrzewki + 30 s pomiaru.';}
button('Test wzrostu i zbioru',async()=>{
 clearArea();rate=1;integration.length=0;teleport({x:.5,y:62,z:5});
 const check=(name,ok,details)=>{integration.push({name,ok,details});if(!ok)throw Error(name);status.textContent='OK: '+name;};
 for(let i=0;i<5;i++){
  const s=species[i],x=-4+i*2,z=0,at=()=>game.world.getBlock(x,61,z),hit=()=>({hit:true,block:{x,y:61,z,type:at()}});
  game.world.setBlock(x,61,z,s+'_bush_full');await pause(850);
  game.inventory.slots.forEach((_,k)=>game.inventory.set(k,{type:'stone',count:64}));
  check(s+' full inventory',game.harvestTarget(hit())===false&&at()===s+'_bush_full');
  await pause(800);game.inventory.set(0,null);check(s+' harvest',game.harvestTarget(hit())===true&&at()===s+'_bush'&&game.inventory.slots[0]?.type===items[i],game.inventory.slots[0]);
  await pause(800);game.plantGrowth.growAround(x+.5,z+.5,.6,1);await pause(700);
  const e=[...game.plantAnimations.active].find(e=>e.x===x&&e.z===z);check(s+' partial fruit',e?.pose.fruit.some(v=>v>0&&v<1));
  await pause(1300);check(s+' few',at()===s+'_bush_few');game.plantGrowth.growAround(x+.5,z+.5,.6,1);await pause(2000);check(s+' full',at()===s+'_bush_full');
  game.world.setBlock(x,61,z,s+'_sapling');await pause(2000);game.plantGrowth.growAround(x+.5,z+.5,.6,1);await pause(500);
  const growing=[...game.plantAnimations.active].find(e=>e.x===x&&e.z===z);check(s+' size between stages',growing?.pose.size>.55&&growing?.pose.size<1,growing?.pose.size);
  game.world.setBlock(x,61,z,null);await pause(650);check(s+' interrupted destruction',at()===null&&![...game.plantAnimations.active].some(e=>e.x===x&&e.z===z));
 }
 gallery();await pause(900);check('world saved',await game.saver.flush());check('no JS errors',errors.length===0,errors);await report('integration');
});
button('Wolny wzrost wybranego',async()=>{const s=species[selected],x=-4+selected*2;rate=.5;game.world.setBlock(x,61,-9,s+'_sapling');await pause(2200);for(let i=0;i<3;i++){game.plantGrowth.growAround(x+.5,-8.5,.6,1);await pause(3900);}rate=1;});
button('Zapisz kadr',()=>{game.highlight.mesh.material.visible=false;game.render();game.renderer.domElement.toBlob(blob=>fetch('/qa-image?name='+point,{method:'POST',body:blob}));status.textContent='Zapisano kadr: '+point;});
button('Materiały GPU',async()=>{const {checkSurfaceRendering}=await import('/tools/surface_render_checks.js');const r=await checkSurfaceRendering({game,settings:game.settings,renderer:game.renderer,yieldBrowser:async()=>{}});integration.push({name:'GPU materials',ok:r.status==='passed',details:r});await report('gpu');status.textContent='Materiały GPU: '+r.status;});
await import('/src/main.js');
