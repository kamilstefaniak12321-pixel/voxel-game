import {Game} from '/src/game/Game.js';
import {Settings,SETTINGS_DEFAULTS} from '/src/settings/Settings.js';
import {WorldStorage,createWorldInfo} from '/src/storage/WorldStorage.js';
import {newCampfire,addFirewood,addTinder,updateCampfire,FIRE_WOODS} from '/src/game/CampfireState.js';
import {campfireLightUniforms} from '/src/rendering/CampfireLight.js';
const defaults={...SETTINGS_DEFAULTS,potato:false,renderScale:100,viewDistance:48,farTerrain:8192,farDetail:2,shadows:3,fpsLimit:0,lightingModel:'atmosphere',showDebug:false,showHand:true};
Settings.prototype.load=()=>({...defaults,revision:2});Settings.prototype.save=()=>{};
const db=await WorldStorage.open();if(!(await db.listWorlds()).length)await db.saveWorld(createWorldInfo('Ogniska — próba 0.51.0',2138286349,'classic','adventure'));db.db.close();
let game,gl,run=null,errors=[],checks=[],results=[],rate=1,point='gallery',pending=[],gpuExt;
const panel=document.createElement('section');panel.style.cssText='position:fixed;z-index:10000;right:10px;top:48px;width:360px;padding:12px;background:#18242bed;color:#fff;font:13px system-ui;pointer-events:auto';panel.innerHTML='<b>Ogniska — próba 0.51.0</b><p data-status>Wczytaj świat próbny</p><div data-buttons></div><pre style="max-height:170px;overflow:auto;white-space:pre-wrap"></pre>';document.body.append(panel);const status=panel.querySelector('[data-status]');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
function button(label,fn){const b=document.createElement('button');b.textContent=label;b.style.margin='3px';b.onclick=async()=>{try{await fn();}catch(e){errors.push(String(e.stack||e));status.textContent='BŁĄD '+e.message;await report('error');}};panel.querySelector('[data-buttons]').append(b);}
addEventListener('error',e=>errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const oldError=console.error;console.error=(...args)=>{errors.push(args.map(String).join(' '));oldError(...args);};
function device(){const e=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'',buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],userAgent:navigator.userAgent};}
async function report(name){await fetch('/qa-report?name='+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device:device(),checks,errors,results,fireStates:game.campfires.getState(),draws:game.campfires.renderer.light.draws},null,2)});}
const start=Game.start,update=Game.prototype.update,render=Game.prototype.render;
function teleport(x=.5,y=62,z=5,pitch=-.45){game.input.reset?.();game.player.pos.set(x,y,z);game.player.vel.set(0,0,0);game.player.yaw=0;game.player.pitch=pitch;game.player.flying=true;game.player.updateCamera();game.time.days=Math.floor(game.time.days)+.02;game.time.speed=0;}
Game.start=async function(...args){args[3]={...args[3],campfires:sessionStorage.getItem('restore-fire')?args[3].campfires:[],player:{x:.5,y:64,z:7,yaw:0,pitch:-.45,flying:true}};game=await start.apply(this,args);gl=game.renderer.getContext();gpuExt=gl.getExtension('EXT_disjoint_timer_query_webgl2');teleport();status.textContent=device().renderer; if(sessionStorage.getItem('restore-fire')) { sessionStorage.removeItem('restore-fire'); setTimeout(async()=>{const f=game.campfires.get({x:0,y:61,z:0});checks.push({name:'full application reload restores burning fire',ok:f?.phase==='burning'&&f.logs.length===6&&f.logs[0].wood==='birch'&&f.logs[0].burn>=.3});await report('reload');status.textContent='Wczytanie zapisu: '+checks.at(-1).ok;},1000); } return game;};
Game.prototype.update=function(dt){if(game===this&&rate!==1)for(const fire of game.campfires.fires.values())updateCampfire(fire,dt*(rate-1));return update.call(this,dt);};
Game.prototype.render=function(...args){const t=performance.now(),r=run&&t>=run.start&&t<run.end?run:null;let q;if(r&&gpuExt&&pending.length<8&&!gl.getQuery(gpuExt.TIME_ELAPSED_EXT,gl.CURRENT_QUERY)){q=gl.createQuery();gl.beginQuery(gpuExt.TIME_ELAPSED_EXT,q);}try{return render.apply(this,args);}finally{if(q){gl.endQuery(gpuExt.TIME_ELAPSED_EXT);pending.push({q,run:r});}if(r){r.cpu.push(performance.now()-t);if(r.last!==null)r.frames.push(t-r.last);r.last=t;}}};
const summary=a=>{const s=[...a].sort((a,b)=>a-b),sum=a.reduce((a,b)=>a+b,0);return {samples:a.length,averageMs:sum/a.length,fps:1000*a.length/sum,p99Ms:s[Math.ceil(s.length*.99)-1],maxMs:s.at(-1),over33ms:s.filter(n=>n>33.34).length};};
function frame(t){if(gl&&gpuExt){const disjoint=gl.getParameter(gpuExt.GPU_DISJOINT_EXT);pending=pending.filter(p=>{if(!disjoint&&!gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE))return true;if(!disjoint)p.run.gpu.push(gl.getQueryParameter(p.q,gl.QUERY_RESULT)/1e6);gl.deleteQuery(p.q);return false;});}if(run&&t>=run.end&&!pending.length){const r=run;run=null;results.push({point:r.point,frames:summary(r.frames),cpu:summary(r.cpu),gpu:summary(r.gpu),info:{...game.renderer.info.render}});status.textContent=r.point+': '+results.at(-1).frames.fps.toFixed(1)+' FPS';panel.querySelector('pre').textContent=JSON.stringify(results.at(-1),null,2);report(r.point);}requestAnimationFrame(frame);}requestAnimationFrame(frame);
function clear(){for(const fire of game.campfires.fires.values())game.world.setBlock(fire.x,fire.y,fire.z,null);game.campfires.fires.clear();for(let x=-11;x<12;x++)for(let z=-16;z<8;z++){game.world.setBlock(x,60,z,'grass');for(let y=61;y<67;y++)game.world.setBlock(x,y,z,null);}game.plantGrowth.speed=0;game.inventory.slots.forEach((_,i)=>game.inventory.set(i,null));rate=1;}
function put(x,z,wood='oak',burn=.12){const fire=newCampfire(x,61,z);for(let i=0;i<6;i++)addFirewood(fire,wood);addTinder(fire,'tall_grass');if(burn>=0){updateCampfire(fire,5,true);updateCampfire(fire,480*burn);}game.world.setBlock(x,61,z,'campfire');game.campfires.fires.set(`${x},61,${z}`,fire);return fire;}
function gallery(){clear();Object.keys(FIRE_WOODS).forEach((wood,i)=>put((i%3)*3-3,-Math.floor(i/3)*4,wood,i<3?-.1:i<6?.5:.95));teleport(.5,63,6,-.55);point='gallery';status.textContent='9 gatunków: świeże / zwęglane / końcówka spalania';}
button('Galeria 9 ognisk',gallery);
button('Z bliska / cienie',()=>{clear();put(0,0);for(let y=61;y<64;y++)game.world.setBlock(-2,y,-2,'stone');for(let y=61;y<63;y++)game.world.setBlock(2,y,-2,'oak_log');game.world.setBlock(-3,61,0,'fern');teleport(.5,61,4,-.35);point='close';});
button('Dzień / noc',()=>{game.time.days=Math.floor(game.time.days)+(game.time.days%1<.1?.5:.02);});
button('Spalanie ×60',()=>{rate=60;status.textContent='Przyspieszenie tylko w próbie: pełny cykl w 8 sekund';});
button('Wypal i obserwuj',()=>{for(const fire of game.campfires.fires.values())if(fire.phase==='burning')fire.logs.forEach(log=>log.burn=.998);rate=1;});
button('Zapisz kadr',()=>{game.render();game.renderer.domElement.toBlob(blob=>fetch('/qa-image?name='+point,{method:'POST',body:blob}));report(point);});
button('Test interakcji i zapisu',async()=>{
 clear();teleport();checks=[];const check=(name,ok,detail)=>{checks.push({name,ok,detail});if(!ok)throw Error(name);};
 const hit={hit:true,block:{x:0,y:60,z:0,type:'grass'},normal:{x:0,y:1,z:0}};
 game.inventory.set(0,{type:'birch_firewood',count:12});game.inventory.selected=0;
 game.campfires.interact(hit,'birch_firewood');const at={hit:true,block:{x:0,y:61,z:0,type:'campfire'},normal:{x:0,y:1,z:0}};
 for(let i=0;i<5;i++)game.campfires.interact(at,'birch_firewood');let fire=game.campfires.get(at.block);
 check('six fuel consumed',fire.logs.length===6&&game.inventory.slots[0].count===6);
 game.campfires.interact(at,'birch_firewood');check('seventh refused',game.inventory.slots[0].count===6);
 game.inventory.set(1,{type:'tall_grass',count:2});game.inventory.selected=1;game.campfires.interact(at,'tall_grass');check('one tinder consumed',game.inventory.slots[1].count===1&&fire.tinder==='tall_grass');
 game.inventory.set(2,{type:'fire_starter',count:1});game.inventory.selected=2;
 updateCampfire(fire,2,true);check('ignition grows',fire.ignition>.3&&fire.ignition<.5);updateCampfire(fire,5,true);check('ignited',fire.phase==='burning');
 await pause(1600);check('six visible logs',game.campfires.renderer.views.get('0,61,0').logs.length===6);check('local shadow light on',campfireLightUniforms.uFirePowers.value[0]>0);
 updateCampfire(fire,250);check('save succeeded',await game.saver.flush());const stored=(await game.saver.storage.listWorlds()).find(w=>w.id===game.worldInfo.id);check('persisted fuel and burn',stored.campfires[0].logs[0].wood==='birch'&&stored.campfires[0].logs[0].burn>.5);
 updateCampfire(fire,480);await pause(2800);check('coals and ash',fire.ash&&fire.logs.length===0);
 game.inventory.selected=0;game.campfires.interact(at,'birch_firewood');check('refuel consumed one',fire.logs.length===1&&game.inventory.slots[0].count===5);
 const snapshot=JSON.stringify(fire);game.inventory.slots.fill({type:'stone',count:64});check('full inventory prevents dismantle',!game.breakTarget(at)&&JSON.stringify(fire)===snapshot);
 game.inventory.set(0,null);check('dismantle returns fresh fuel',game.breakTarget(at)&&game.inventory.slots[0]?.type==='birch_firewood');
 await pause(300);check('state cleaned after break',!game.campfires.get(at.block));check('no rendering errors',errors.length===0,errors);
 await report('integration');status.textContent='OK: '+checks.length+' sprawdzeń w grze';
});
function benchmark(n){clear();for(let i=0;i<n;i++)put(i%2*4-2,-Math.floor(i/2)*4);teleport(.5,62,5,-.35);point='perf-'+n;const t=performance.now();run={point,start:t+10000,end:t+40000,frames:[],cpu:[],gpu:[],last:null};status.textContent='10 s rozgrzewki + 30 s pomiaru, '+n+' ognisk';}
button('Pomiar: bez ognia',()=>benchmark(0));button('Pomiar: 1 ognisko',()=>benchmark(1));button('Pomiar: 4 ogniska',()=>benchmark(4));

button('Test trzymania PPM',async()=>{
 clear();const fire=put(0,0,'oak',-.1);teleport(.5,61,4,-.38);game.inventory.set(0,{type:'fire_starter',count:1});game.inventory.selected=0;
 const check=(name,ok,detail)=>{checks.push({name,ok,detail});if(!ok)throw Error(name);};
 await pause(350);check('raycast hits campfire',game.currentHit?.block?.type==='campfire',game.currentHit);
 game.input.mouseDown.add(2);await pause(2000);check('held RMB advances ignition',fire.ignition>.25&&fire.ignition<.6,fire.ignition);
 game.input.mouseDown.delete(2);await pause(1000);check('released RMB cancels',fire.ignition<.05,fire.ignition);
 game.input.mouseDown.add(2);await pause(5400);game.input.mouseDown.delete(2);
 check('held RMB lights fire',fire.phase==='burning');check('starter remains',game.inventory.slots[0]?.type==='fire_starter'&&game.inventory.slots[0].count===1);
 await report('hold');status.textContent='OK: prawdziwa ścieżka trzymania PPM';
});
button('Zapisz i wczytaj',async()=>{clear();put(0,0,'birch',.3);teleport(.5,61,4,-.38);await game.saver.flush();sessionStorage.setItem('restore-fire','1');location.reload();});
button('Test podpory i wody',async()=>{
 clear();teleport();const hit={hit:true,block:{x:0,y:60,z:0,type:'grass'},normal:{x:0,y:1,z:0}};
 game.inventory.set(0,{type:'oak_firewood',count:3});game.inventory.selected=0;game.campfires.interact(hit,'oak_firewood');
 game.inventory.slots.fill({type:'stone',count:64});const a=!game.breakTarget(hit)&&game.world.getBlock(0,61,0)==='campfire';
 game.inventory.set(0,null);game.inventory.set(1,null);const b=game.breakTarget(hit)&&game.inventory.slots.some(i=>i?.type==='oak_firewood');
 game.world.setBlock(3,60,0,'stone');game.world.setBlock(3,61,0,'water');game.inventory.set(0,{type:'oak_firewood',count:3});
 game.campfires.interact({hit:true,block:{x:3,y:60,z:0,type:'stone'},normal:{x:0,y:1,z:0}},'oak_firewood');
 const c=game.world.getBlock(3,61,0)==='water'&&game.inventory.slots[0].count===3;
 checks.push({name:'support with full inventory',ok:a},{name:'support returns fuel',ok:b},{name:'cannot place underwater',ok:c});
 await report('support');status.textContent='Podpora i woda: '+[a,b,c].join(', ');
});
button('Tekstura i kwadratowy popiół',async()=>{
 clear();put(-1,0,'birch',.3);const ash=put(2,0);updateCampfire(ash,600);
 ash.embers=85;teleport(1,62,4,-.5);point='texture-ash';
 await pause(600);
 const renderer=game.campfires.renderer,image=renderer.fireTexture.image;
 const pixels=image.getContext('2d').getImageData(0,0,image.width,image.height).data;
 const frames=[];
 for(let frame=0;frame<16;frame++){
   const values=[];
   for(let y=0;y<20;y++)for(let x=0;x<16;x++)values.push(...pixels.slice((y*image.width+frame*16+x)*4,(y*image.width+frame*16+x)*4+4));
   frames.push(values.join(','));
 }
 checks.push({name:'16 distinct texture frames, shared atlas 256x20',ok:image.width===256&&image.height===20&&new Set(frames).size===16});
 renderer.ashGeometry.computeBoundingBox();const box=renderer.ashGeometry.boundingBox;
 checks.push({name:'square ash footprint, 14 by 14 pixels',ok:Math.abs(box.max.x-box.min.x-.875)<1e-6&&Math.abs(box.max.z-box.min.z-.875)<1e-6});
 checks.push({name:'no shader errors with animated texture',ok:errors.length===0});
 await report('texture-ash');status.textContent='Tekstura: 16 klatek / 12 FPS; kwadratowy popiół';
});
await import('/src/main.js');
