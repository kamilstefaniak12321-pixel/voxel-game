import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const model=JSON.parse(readFileSync(new URL('assets/models/campfire/ognisko-dab.bbmodel',root)));
const logs=model.elements.slice(0,6).map(element=>({
 position:element.origin.map(n=>n/16),rotation:element.rotation[1]*Math.PI/180,
 faces:Object.values(element.faces).map(face=>{
  const keys=[0,3,1,2].map(i=>face.vertices[i]);
  const vertices=keys.map(key=>element.vertices[key].map(n=>n/16));
  const a=vertices[2].map((n,i)=>n-vertices[0][i]),b=vertices[1].map((n,i)=>n-vertices[0][i]);
  const n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],length=Math.hypot(...n);
  const uv=keys.map(key=>face.uv[key]),center=[0,1].map(i=>uv.reduce((sum,p)=>sum+p[i],0)/4);
  return {vertices,normal:n.map(v=>v/length),uv:uv.map(p=>p.map((v,i)=>(v+(v<center[i]?.02:-.02))/32)),color:[255,255,255]};
 })
}));
writeFileSync(new URL('src/rendering/CampfireGeometry.js',root),
 '// Generated from the approved ognisko-dab.bbmodel. Positions in blocks; one pixel = 1/16.\nexport const CAMPFIRE_LOGS = '+JSON.stringify([1,4,0,2,5,3].map(i=>logs[i]))+';\n');
console.log('6 polan × 6 ścian; geometria ogniska odtworzona.');
