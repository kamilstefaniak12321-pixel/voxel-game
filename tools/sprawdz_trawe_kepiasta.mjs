import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? {...context,format:'module'} : context);
    }
});
const { getBushyGrassFaces } = await import('../src/rendering/BushyGrassGeometry.js');
const { normalizeWorldExperiments, grassDetailAtDistance } = await import('../src/world/WorldExperiments.js');
const { createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { SETTINGS_DEFAULTS, EXPERIMENTS } = await import('../src/settings/Settings.js');
const { WorldSaver } = await import('../src/storage/WorldSaver.js');
const { World } = await import('../src/world/World.js');
const { Scene } = await import('three');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');

for (const value of [undefined,null,{},true,{bushyGrass:'true'},{bushyGrass:1}]) {
    assert.equal(normalizeWorldExperiments(value).bushyGrass,false);
}
// 0.55.0: trawa kępiasta to ustawienie (Ustawienia - Eksperymenty) dla
// wszystkich światów, domyślnie wyłączone; świat jej nie zapisuje.
const info=createWorldInfo('Kępki',2138286349,'classic','creative');
assert.equal(info.experiments,undefined);
assert.ok(EXPERIMENTS.includes('bushyGrass'));
assert.equal(SETTINGS_DEFAULTS.bushyGrass,false);
const world=new World(new Scene(),1,new Map(),'classic',{bushyGrass:true});
const chunk=new Chunk(0,0);chunk.skyLight.fill(15);
world.chunks.set('0,0',chunk);
for (const [x,z,type] of [[2,2,'short_grass'],[5,2,'tall_grass'],[8,2,'fern'],[11,2,'water_lily'],[13,2,'stone'],[5,5,'amarantus_etap3']]) {
    chunk.setId(x,1,z,getBlockId('dirt'));chunk.setId(x,2,z,getBlockId(type));
}
chunk.tint=new Uint8Array(17*17*3).fill(128);
const blockCopy=chunk.blocks.slice();
const geometry=()=>buildChunkGeometry(chunk,world);
world.setExperiments({bushyGrass:false});
const ordinary=geometry();
world.dirtyChunks.clear();
world.setExperiments({bushyGrass:true});
assert.ok(world.dirtyChunks.has(chunk));
assert.equal(world.unsavedChunks.size,0,'Visual toggle must not mark blocks as modified');
const bushy=geometry();
assert.equal(bushy.groups.length,ordinary.groups.length,'No extra material/draw group per tuft');
assert.ok(bushy.groups[1].count>ordinary.groups[1].count);
assert.equal(bushy.userData.bushyGrassCount,2,'Only short/tall grass are replaced');
assert.ok(getBlockId('amarantus_etap3') > 0, 'Plant pack is loaded in the mixed fixture');
assert.equal(bushy.boundingSphere.radius,ordinary.boundingSphere.radius,'Large plant bounds survive the grass toggle');
assert.deepEqual(chunk.blocks,blockCopy,'Block IDs must survive toggling');

function groupData(g,material,attribute) {
    const group=g.groups.find(x=>x.materialIndex===material), a=g.getAttribute(attribute);
    return group ? Array.from(a.array.slice(group.start/6*4*a.itemSize,(group.start+group.count)/6*4*a.itemSize)) : [];
}
for (const material of [0,2,3]) for(const attr of Object.keys(ordinary.attributes)) {
    assert.deepEqual(groupData(ordinary,material,attr),groupData(bushy,material,attr),'Terrain/water must stay unchanged');
}
world.setExperiments({bushyGrass:false});
const restored=geometry();
for (const attr of Object.keys(ordinary.attributes)) assert.deepEqual(restored.getAttribute(attr).array,ordinary.getAttribute(attr).array);
assert.deepEqual(restored.index.array,ordinary.index.array);

// Zapis świata: wybór zostaje w ustawieniach, nie w świecie.
world.setExperiments({bushyGrass:true});
let saved;
const saver=new WorldSaver({saveWorldAndChunks:async value=>{saved=structuredClone(value);}}, info, world, {getState:()=>({x:0,y:10,z:0})});
assert.equal(await saver.flush(),true);
assert.equal(saved.experiments,undefined);
assert.equal(new World(new Scene(),1).experiments.bushyGrass,false,'Bez ustawienia - zwykła trawa');

const maxima=[0,0,0];
for (const tall of [false,true]) for(let variant=0;variant<8;variant++) {
    let previous=Infinity;
    for(let detail=0;detail<3;detail++) {
        const faces=getBushyGrassFaces(tall,variant,detail);
        assert.equal(faces,getBushyGrassFaces(tall,variant+8,detail));
        assert.ok(faces.length<previous && faces.length<=[128,72,50][detail]);
        previous=faces.length;maxima[detail]=Math.max(maxima[detail],faces.length);
        let roots=0;
        for(const f of faces) for(let i=0;i<4;i++) {
            const [x,y,z]=f.vertices[i];
            assert.ok([x,y,z].every(v=>Number.isFinite(v)&&Number.isInteger(v*16)));
            assert.ok(Math.abs(x)<=.375&&Math.abs(z)<=.375&&y>=0&&y<=1);
            assert.ok(f.color.every(v=>Number.isFinite(v)&&v>=0&&v<=255));
            if(y===0){roots++;assert.equal(f.weights[i],0);}
            assert.equal(f.movement,0);
        }
        assert.ok(roots>0);
    }
}
for(const [distance,previous,expected] of [[0,-1,0],[60,-1,1],[110,-1,2],[55,0,0],[57,0,1],[41,1,1],[39,1,0],[103,1,1],[105,1,2],[90,2,2],[87,2,1]]) {
    assert.equal(grassDetailAtDistance(distance,previous),expected);
}
// Moving the loaded centre queues detail changes through the existing budget.
chunk.mesh={geometry:bushy};bushy.userData.bushyGrassDetail=0;
world.dirtyChunks.clear();world.centerCx=4;world.updatePlantVisibility(chunk);
assert.ok(world.dirtyChunks.has(chunk));
for(const g of [ordinary,bushy,restored])g.dispose();
console.log(`OK: trawa kępiasta — ustawienie w Eksperymentach (nie w zapisie świata), opt-in i odwracalność, niezmienione bloki/woda, siatka 1/16, LOD ${maxima.join('/')} ścian oraz histereza.`);
