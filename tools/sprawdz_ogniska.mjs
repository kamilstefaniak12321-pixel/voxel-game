import assert from 'node:assert/strict';
import {Inventory} from '../src/game/Inventory.js';
import {RECIPES} from '../src/crafting/recipes.js';
import {fillGrid,craftAll,craftFromGrid,gridResult,maxCrafts,stockOf} from '../src/crafting/Crafting.js';
import {newCampfire,addFirewood,addTinder,updateCampfire,restoreCampfire,campfireDrops,fireIntensity,fireStage,burnSecondsLeft,FIRE_WOODS,TINDERS,CAMPFIRE_BURN_SECONDS,CAMPFIRE_LOG_SECONDS} from '../src/game/CampfireState.js';
import {itemExists,CREATIVE_ITEMS,getPlacedBlock} from '../src/items/ItemRegistry.js';
let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
for(const wood of Object.keys(FIRE_WOODS)) {
 const inventory=Inventory.load({},'adventure'),recipe=RECIPES.find(r=>r.id===wood+'_firewood');
 inventory.add(wood+'_log',7);inventory.add('axe',1);
 check(maxCrafts(recipe,stockOf(inventory))===7,wood+' one axe supports 7 crafts');
 check(fillGrid(inventory,recipe,7)===7,wood+' fill 7');
 check(inventory.craft.find(i=>i?.type==='axe').count===1,'only one axe moved');
 check(craftAll(inventory)[1]===7,wood+' craft all');
 check(inventory.craft.find(i=>i?.type==='axe').count===1,'axe remains');
 check(inventory.slots.reduce((n,i)=>n+(i?.type===wood+'_firewood'?i.count:0),0)===28,'28 fuel');
}
const inv=Inventory.load({},'adventure');inv.craft[2]={type:'axe',count:1};inv.craft[3]={type:'birch_log',count:2};
check(gridResult(inv.craft)?.type==='birch_firewood','manual displaced recipe');craftFromGrid(inv);
check(inv.craft[2].count===1&&inv.craft[3].count===1,'manual consumption');
inv.slots.fill({type:'stone',count:64});const before=JSON.stringify(inv.craft);check(craftAll(inv)[1]===0&&JSON.stringify(inv.craft)===before,'full bag consumes nothing');
check(!itemExists('campfire')&&!CREATIVE_ITEMS.includes('campfire')&&!getPlacedBlock('campfire'),'structure never inventory item');
const fire=newCampfire(-1,60,-16);
for(let i=0;i<5;i++)check(addFirewood(fire,'oak'),'add each log');
check(!addTinder(fire,'tall_grass'),'no tinder below six');updateCampfire(fire,10,true);check(fire.ignition===0,'cannot light incomplete');
check(addFirewood(fire,'birch')&&!addFirewood(fire,'pine'),'six maximum; mixed wood');
check(addTinder(fire,'short_grass')&&!addTinder(fire,'short_grass'),'one tinder');
updateCampfire(fire,2,true);check(fire.ignition>.3&&fire.ignition<.5,'gradual ignition');updateCampfire(fire,2,false);check(fire.ignition===0,'cancelled ignition cools');
updateCampfire(fire,5,true);check(fire.phase==='burning'&&!fire.tinder,'ignite consumes tinder');
// Od 0.100.0 polana spalają się po kolei (od wierzchu), ognisko przygasa etapami.
check(fireStage(fire)===6&&Math.abs(burnSecondsLeft(fire)-CAMPFIRE_BURN_SECONDS)<1e-6,'full stack: stage 6, eight minutes left');
updateCampfire(fire,6);const full=fireIntensity(fire);check(full>.95,'full fire shortly after ignition');
updateCampfire(fire,CAMPFIRE_LOG_SECONDS/2-6);check(fire.logs.length===6&&Math.abs(fire.logs[5].burn-.5)<1e-8&&fire.logs.slice(0,5).every(l=>l.burn===0),'only the top log burns');
updateCampfire(fire,CAMPFIRE_LOG_SECONDS/2);check(fire.logs.length===5&&fire.ash&&fire.logs.every(l=>l.wood==='oak'),'burnt log is gone, the next one takes over');
check(fireStage(fire)===5&&fireIntensity(fire)<full,'fewer logs - smaller fire');
updateCampfire(fire,240-CAMPFIRE_LOG_SECONDS);check(fire.logs.length===3&&fire.logs.every(l=>l.burn<1e-8),'halfway after 4min: three logs left');
const stages=[];{const probe=restoreCampfire(JSON.parse(JSON.stringify(fire)));for(let n=3;n>=1;n--){stages.push(fireIntensity(probe));updateCampfire(probe,CAMPFIRE_LOG_SECONDS-.01);updateCampfire(probe,.02);}}
check(stages[0]>stages[1]&&stages[1]>stages[2]&&stages[2]>.3,'fire dims stage by stage');
// Dokładanie do płonącego ogniska.
const fed=restoreCampfire(JSON.parse(JSON.stringify(fire)));
check(addFirewood(fed,'pine')&&addFirewood(fed,'pine')&&addFirewood(fed,'pine')&&!addFirewood(fed,'pine'),'burning fire takes fuel up to six');
check(fed.phase==='burning'&&Math.abs(burnSecondsLeft(fed)-6*CAMPFIRE_LOG_SECONDS)<1e-3,'refuelled fire burns longer');
updateCampfire(fed,CAMPFIRE_LOG_SECONDS+1);check(fed.logs.length===5&&fed.logs.at(-1).wood==='pine','new log burns first');
// Jedno długie przesunięcie czasu (sen) daje to samo, co wiele klatek.
const slept=restoreCampfire(JSON.parse(JSON.stringify(fire)));updateCampfire(slept,3600);
check(slept.phase==='unlit'&&slept.logs.length===0&&slept.ash&&slept.embers===0,'a long skip burns everything down to cold ash');
const saved=restoreCampfire(JSON.parse(JSON.stringify(fire)));check(saved.phase==='burning'&&saved.logs.length===3&&saved.logs[2].wood==='oak','save restores a fire with fewer logs');
updateCampfire(saved,240);check(saved.phase==='collapsing'&&saved.logs.length===1,'all charred after 8min');updateCampfire(saved,1.2);check(saved.collapse>.4&&saved.collapse<.6,'gradual collapse');check(!addFirewood(saved,'oak'),'no fuel while collapsing');updateCampfire(saved,1.2);check(saved.logs.length===0&&saved.ash&&saved.embers===90,'ash and embers');
check(addFirewood(saved,'pine'),'refuel embers');updateCampfire(saved,10,true);check(saved.phase==='unlit','refuel one does not reignite');
check(campfireDrops(saved).length===1,'only fresh fuel recoverable');
check(restoreCampfire({x:0,y:128,z:0})===null,'height validated');check(restoreCampfire({...saved,ignition:1}).ignition===0,'saved holding not restored');
console.log(`OK: ogniska i opał — ${checks} sprawdzeń.`);
import {TouchControls} from '../src/input/TouchControls.js';
class Element {
 constructor(){this.children=[];this.events={};this.classList={add(){},remove(){}};}
 appendChild(element){this.children.push(element);}
 addEventListener(name,fn){this.events[name]=fn;}
 setAttribute(name,value){this[name]=value;}
 setPointerCapture(){}
}
globalThis.document={createElement:()=>new Element(),body:new Element()};
const touchInput={keys:{},keyPressed:new Set(),mousePressed:new Set(),mouseDown:new Set()};
const touch=new TouchControls(touchInput,{},new Element());
const all=e=>[e,...e.children.flatMap(all)];const place=all(touch.root).find(e=>e['aria-label']==='Postaw');
const event={preventDefault(){},stopPropagation(){},pointerId:1};
for(const ending of ['pointerup','pointercancel','lostpointercapture']){
 place.events.pointerdown(event);check(touchInput.mousePressed.has(2)&&touchInput.mouseDown.has(2),'touch holds ignition');
 place.events[ending](event);check(!touchInput.mouseDown.has(2),'touch cancellation releases ignition');
}
console.log('OK: przytrzymanie, puszczenie i anulowanie rozpalania na dotyku.');
