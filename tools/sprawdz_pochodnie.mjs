// Pochodnie: prawdziwe przepisy, stawianie, światło, barwienie i zapis.
// Node >= 22.15, bez instalowania zależności.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readTexturePng } from './texture_regions.mjs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { registerHooks } from 'node:module';
import { memoryDatabase } from './fixtures/memory-database.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture = null, atlasAverageTexture = null;
            export const atlasReady = Promise.resolve({ tileSize:16, mipmaps:false });
            export const atlasAveragesReady = Promise.resolve();
            export const getTileColors = () => [];
            export const getAtlasAverage = () => null;
            export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
        ` };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const R = await import('../src/blocks/BlockRegistry.js');
const { TORCH_VARIANTS, TORCH_BLOCKS, getTorchInfo, isTorchId, torchType } = await import('../src/blocks/torches.js');
const { getDyeColor } = await import('../src/items/dyes.js');
const I = await import('../src/items/ItemRegistry.js');
const C = await import('../src/crafting/Crafting.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { dyeTorch } = await import('../src/game/TorchInteraction.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { ChunkGenerationData, generationTransfers } = await import('../src/world/ChunkGenerationData.js');
const { LightEngine } = await import('../src/world/Light.js');
const { WorldStorage, createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { getTorchAnimationFrame } = await import('../src/rendering/TorchMaterial.js');
const THREE = await import('three');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const colors = ['plain','white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'];
const attaches = ['down','north','south','east','west'];
check(TORCH_VARIANTS.length === 17, 'Podstawowa pochodnia i 16 barw');
check(Object.keys(TORCH_BLOCKS).length === 85, 'Każda barwa ma pięć mocowań');
check(new Set(Object.values(R.BLOCK_TYPES).map(d => d.id)).size === Object.keys(R.BLOCK_TYPES).length, 'Numery bloków nie kolidują');
check(R.getBlockId('campfire') === 10000, 'Numer istniejącego ogniska pozostał bez zmian');
for (const [colorIndex,color] of colors.entries()) for (const [sideIndex,attach] of attaches.entries()) {
    const type = torchType(color, attach), id = R.getBlockId(type), info = getTorchInfo(type);
    check(id === 10010 + colorIndex * 5 + sideIndex, `${type}: stabilny numer zapisu`);
    check(isTorchId(id) && getTorchInfo(id)?.colorKey === color && info?.attach === attach, `${type}: rozpoznanie po nazwie i numerze`);
    check(!R.isSolidId(id) && !R.isOpaqueId(id), `${type}: nie blokuje gracza ani światła`);
    check(R.getLightEmission(id) === 14, `${type}: stała emisja niezależna od animacji`);
    check(R.getDropType(type) === torchType(color), `${type}: łup zachowuje barwę`);
    check(I.itemExists(torchType(color)) && I.getPlacedBlock(torchType(color)) === torchType(color), `${type}: da się trzymać i postawić`);
    check(R.CREATIVE_BLOCKS.includes(type) === (attach === 'down'), `${type}: bez duplikatów ściennych w ekwipunku`);
}
check(!isTorchId(0) && !isTorchId(10000) && getTorchInfo('stone') == null, 'Zwykłe bloki nie są pochodniami');

// Każdy barwnik jest osiągalny od składników roślinnych, także przez mieszanie.
const dyes = colors.slice(1).map(color => `dye_${color}`);
for (const dye of dyes) check(I.itemExists(dye) && getDyeColor(dye) === dye.slice(4), `${dye}: przedmiot barwnika`);
const dyeRecipes = C.RECIPE_LIST.filter(r => dyes.includes(r.result[0]));
const reachable = new Set(Object.keys(R.BLOCK_TYPES).concat(Object.keys(I.ITEM_TYPES)).filter(type => !dyes.includes(type)));
for (let pass = 0; pass < dyes.length; pass++) for (const recipe of dyeRecipes) {
    const cells = C.recipeCells(recipe).filter(Boolean);
    if (cells.every(spec => C.ingredientTypes(spec).some(type => reachable.has(type)))) reachable.add(recipe.result[0]);
}
for (const dye of dyes) check(reachable.has(dye), `${dye}: można uzyskać z dostępnych surowców`);
for (const recipe of dyeRecipes) {
    const inventory = Inventory.load({}, 'adventure');
    C.recipeCells(recipe).forEach((spec,index) => { if (spec) inventory.craft[index] = {type:C.ingredientTypes(spec)[0], count:2}; });
    check(C.gridResult(inventory.craft)?.type === recipe.result[0], `${recipe.id}: prawdziwa siatka 2×2`);
    const crafted = C.craftFromGrid(inventory);
    check(crafted?.type === recipe.result[0] && crafted.count === recipe.result[1], `${recipe.id}: ilość wyniku`);
}
const torchRecipe = C.RECIPE_LIST.find(r => r.result[0] === 'torch');
check(Boolean(torchRecipe), 'Podstawową pochodnię da się wytworzyć');
check(C.gridResult([{type:'stick',count:1},{type:'resin',count:1},null,null])?.type === 'torch', 'Patyk i żywica dają pochodnie');
for (const color of colors.slice(1)) {
    const grid = [{type:'torch',count:1},{type:`dye_${color}`,count:1},null,null];
    check(C.gridResult(grid)?.type === torchType(color), `${color}: barwienie w wytwarzaniu`);
}

function fixture() {
    const cells = new Map(), world = {
        cells, writes:0,
        getBlockId(x,y,z) { return cells.get(`${x},${y},${z}`) ?? 0; },
        getBlock(x,y,z) { return R.getBlockTypeById(this.getBlockId(x,y,z)); },
        setBlock(x,y,z,type) { const key=`${x},${y},${z}`, id=R.getBlockId(type); if(this.getBlockId(x,y,z)===id) return false; cells.set(key,id);this.writes++; return true; },
        attachedPlantSupported: World.prototype.attachedPlantSupported,
        removeUnsupported: World.prototype.removeUnsupported
    };
    return world;
}
const mounting = [
    ['down',{x:0,y:1,z:0}],['north',{x:0,y:0,z:1}],['south',{x:0,y:0,z:-1}],
    ['east',{x:-1,y:0,z:0}],['west',{x:1,y:0,z:0}]
];
for (const [attach,normal] of mounting) {
    const world = fixture(); world.setBlock(3,5,3,'stone');
    const placer = new BlockPlacer(world, {intersectsBlock:() => false});
    const hit = {hit:true,block:{x:3,y:5,z:3,type:'stone'},normal};
    const type = placer.placeBlock(hit, 'torch_blue'), target = placer.targetOf(hit,'torch_blue');
    check(type === torchType('blue',attach), `${attach}: prawidłowe mocowanie`);
    check(world.getBlock(target.x,target.y,target.z) === type, `${attach}: blok został postawiony`);
    world.setBlock(3,5,3,null); world.removeUnsupported(3,5,3);
    check(world.getBlock(target.x,target.y,target.z) === null, `${attach}: usunięte oparcie usuwa pochodnię`);
}
{
    const world=fixture(); world.setBlock(3,5,3,'stone');
    const placer=new BlockPlacer(world,{intersectsBlock:()=>false});
    check(!placer.placeBlock({hit:true,block:{x:3,y:5,z:3},normal:{x:0,y:-1,z:0}},'torch'), 'Pochodnia nie wisi na suficie');
    world.setBlock(3,6,3,'water');
    check(!placer.placeBlock({hit:true,block:{x:3,y:5,z:3},normal:{x:0,y:1,z:0}},'torch'), 'Woda nie zostaje zastąpiona pochodnią');
    world.setBlock(3,6,3,null); world.setBlock(3,5,3,'short_grass');
    check(!placer.placeBlock({hit:true,block:{x:3,y:5,z:3},normal:{x:0,y:1,z:0}},'torch'), 'Brak pełnego podłoża blokuje stawianie');
}

for (const attach of attaches) {
    const world=fixture(), inventory=Inventory.load({},'adventure');
    world.setBlock(4,8,4,torchType('plain',attach)); inventory.set(0,{type:'dye_red',count:3}); inventory.selected=0;
    const game={world,inventory,mode:'adventure',playBlockSound(){},onNotice(){}};
    const hit={hit:true,block:{x:4,y:8,z:4,type:torchType('plain',attach)}};
    check(dyeTorch(game,hit,'dye_red'), `${attach}: użycie barwnika obsłużone`);
    check(world.getBlock(4,8,4)===torchType('red',attach)&&inventory.selectedItem.count===2, `${attach}: barwa, mocowanie, zużycie jednej sztuki`);
    const writes=world.writes;
    check(dyeTorch(game,hit,'dye_red')&&inventory.selectedItem.count===2&&world.writes===writes, `${attach}: ta sama barwa nic nie zużywa ani nie przelicza`);
    inventory.set(0,{type:'dye_blue',count:1}); game.mode='creative';
    check(dyeTorch(game,hit,'dye_blue')&&inventory.selectedItem.count===1&&world.getBlock(4,8,4)===torchType('blue',attach), `${attach}: kreatywny nie zużywa barwnika`);
    game.mode='adventure'; inventory.set(0,null);
    dyeTorch(game,hit,'dye_red');
    check(world.getBlock(4,8,4)===torchType('blue',attach)&&inventory.selectedItem===null, `${attach}: brak barwnika nie zmienia świata`);
}

// Zapis przez prawdziwą warstwę IndexedDB, z portem pamięciowym.
const chunk=new Chunk(-1,2);
for (const [i,type] of Object.keys(TORCH_BLOCKS).entries()) chunk.setId(i%16,2+Math.floor(i/16),7,R.getBlockId(type));
check(chunk.torches.size===85, 'Indeks obejmuje wszystkie postawione pochodnie');
const revision=chunk.torchRevision;chunk.setId(0,2,7,R.getBlockId('torch'));
check(chunk.torchRevision===revision, 'Ten sam blok nie zmienia rewizji indeksu');
const storage=new WorldStorage(memoryDatabase()), info=createWorldInfo('Pochodnie','torches','flat','adventure');
await storage.saveWorldAndChunks(info,[chunk]);const stored=await storage.loadChunks(info.id);
check(stored.get('-1,2') instanceof Uint16Array,'Numery pochodni zapisane bez obcinania do bajtu');
const restored=new Chunk(-1,2);check(restored.loadBlocks(stored.get('-1,2')),'Wczytanie chunka');
assert.deepEqual(restored.blocks,chunk.blocks);check(restored.torches.size===85,'Indeks odbudowany po wczytaniu');
const generated=new ChunkGenerationData('flat',123).generate(-1,2,stored.get('-1,2'));
const transferred=structuredClone(generated,{transfer:generationTransfers(generated)});
check(transferred.torches.length===85&&transferred.modified,'Wątek generacji przekazuje indeks zapisanych pochodni');
assert.deepEqual(transferred.blocks,chunk.blocks);
restored.setId(0,2,7,0);check(restored.torches.size===84&&restored.torchRevision>0,'Usunięcie czyści indeks');
const old=new Chunk(0,0);old.loadBlocks(new Uint8Array(old.blocks.length));check(old.torches.size===0,'Stary zapis nadal się wczytuje');

// Wąska pochodnia nie przechwytuje promienia idącego przez resztę komórki.
{
    const world=fixture(); world.setBlock(0,2,0,'torch'); world.setBlock(0,2,-2,'stone');
    const ray=new VoxelRaycast(world,8);
    check(ray.cast(new THREE.Vector3(.5,2.4,2),new THREE.Vector3(0,0,-1)).block?.type==='torch','Celownik trafia w trzonek');
    check(ray.cast(new THREE.Vector3(.1,2.4,2),new THREE.Vector3(0,0,-1)).block?.type==='stone','Celownik omija pustą część komórki pochodni');
}

// RGB światła zmienia się przy barwieniu, a pełna ściana go zatrzymuje.
{
    const c=new Chunk(0,0);
    for(let y=0;y<128;y++)for(let z=0;z<16;z++)c.setId(8,y,z,R.getBlockId('stone'));
    c.setId(4,5,8,R.getBlockId('torch_red'));
    const engine=new LightEngine({getChunk:(cx,cz)=>cx===0&&cz===0?c:null});engine.initChunk(c);
    const left=c.index(5,5,8),right=c.index(10,5,8),source=c.index(4,5,8);
    check(c.lightR[left]>c.lightB[left]&&c.lightR[left]>0,'Czerwona pochodnia oświetla sąsiadów na czerwono');
    check(c.lightR[right]===0&&c.lightG[right]===0&&c.lightB[right]===0,'Lita ściana nie przepuszcza emisji');
    c.setId(4,5,8,R.getBlockId('torch_blue'));engine.blockChanged(c,source);
    check(c.lightB[left]>c.lightR[left],'Przebarwienie aktualizuje kolor światła');
    c.setId(4,5,8,0);engine.blockChanged(c,source);
    check(c.lightR[left]===0&&c.lightG[left]===0&&c.lightB[left]===0,'Zniszczenie pochodni usuwa jej światło');
}

// PNG dekodowany bez bibliotek: test widzi piksele, nie tylko metadane.
function rgbaPng(data) {
    assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    let width,height,depth,type;const idat=[];
    for(let i=8;i<data.length;) {const length=data.readUInt32BE(i),kind=data.toString('ascii',i+4,i+8),body=data.subarray(i+8,i+8+length);if(kind==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);depth=body[8];type=body[9];}if(kind==='IDAT')idat.push(body);i+=12+length;}
    assert.equal(depth,8);assert.equal(type,6,'Źródło pozostaje RGBA');
    const bytes=inflateSync(Buffer.concat(idat)),stride=width*4,out=Buffer.alloc(stride*height);
    const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
    for(let y=0;y<height;y++){const filter=bytes[y*(stride+1)];for(let x=0;x<stride;x++){const i=y*stride+x,a=x>=4?out[i-4]:0,b=y?out[i-stride]:0,c=y&&x>=4?out[i-stride-4]:0;out[i]=(bytes[y*(stride+1)+x+1]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;}}
    return {width,height,pixels:out};
}
const sourceManifest=JSON.parse(await readFile(new URL('../assets/models/torch/SOURCE.json',import.meta.url),'utf8'));
check(sourceManifest.textures.length===17,'Manifest obejmuje wszystkie tekstury moda');
for(const color of colors){
    const name=color==='plain'?'torch':`torch_${color}`;
    const png=readTexturePng(`assets/models/torch/${name}.png`);
    const {width,height,pixels}=rgbaPng(png);
    check(createHash('sha256').update(pixels).digest('hex')===sourceManifest.textures.find(entry=>entry.file===`${name}.png`)?.rgbaSha256,`${name}: oryginalne piksele RGBA bez zmian po przeniesieniu do arkusza`);
    check(width===16&&height===320,`${name}: pełne 20 klatek`);
    const frames=Array.from({length:20},(_,i)=>createHash('sha256').update(pixels.subarray(i*1024,(i+1)*1024)).digest('hex'));
    check(new Set(frames).size===20,`${name}: wszystkie klatki różne`);
    check(pixels.some((value,i)=>i%4===3&&value>0&&value<255),`${name}: zachowana półprzezroczystość płomienia`);
    const metadata=JSON.parse(await readFile(new URL(`../assets/models/torch/${name}.png.mcmeta`,import.meta.url),'utf8'));
    check(metadata.animation.frametime===2&&metadata.animation.interpolate===true,`${name}: tempo i interpolacja źródła`);
}
for(const [time,frame,next,mix] of [[0,0,1,0],[.05,0,1,.5],[.1,1,2,0],[1.95,19,0,.5],[2,0,1,0],[4.05,0,1,.5]]){
    const sample=getTorchAnimationFrame(time);
    check(sample.frame===frame&&sample.next===next&&Math.abs(sample.mix-mix)<1e-8,`Animacja t=${time}: właściwa klatka i zawijanie`);
}
console.log(`OK: pochodnie — ${checks} sprawdzeń rejestru, przepisów, mocowania, barwienia, zapisu, światła i 20-klatkowych tekstur.`);
