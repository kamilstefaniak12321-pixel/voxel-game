import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readTexturePng } from './texture_regions.mjs';
import { registerHooks } from 'node:module';
import { inflateSync } from 'node:zlib';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                import { BUSHY_GRASS_TEXTURE } from ${JSON.stringify(new URL('../src/blocks/bushyGrass.js', import.meta.url).href)};
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=name=>name===BUSHY_GRASS_TEXTURE
                    ? {uMin:.25,uMax:.5,vMin:.5,vMax:.75} : {uMin:0,uMax:1,vMin:0,vMax:1};
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/') || url.includes('/assets/models/'))
            ? {...context,format:'module'} : context);
    }
});
const { getBushyGrassFaces } = await import('../src/rendering/BushyGrassGeometry.js');
const { BUSHY_GRASS_TEXTURE_URL } = await import('../src/blocks/bushyGrass.js');
const { normalizeWorldExperiments, grassDetailAtDistance } = await import('../src/world/WorldExperiments.js');
const { createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { SETTINGS_DEFAULTS, EXPERIMENTS } = await import('../src/settings/Settings.js');
const { WorldSaver } = await import('../src/storage/WorldSaver.js');
const { World } = await import('../src/world/World.js');
const { Scene, Vector3 } = await import('three');
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
assert.ok(world.dirtyPlants.has(chunk), 'Grass appearance rebuilds the near plant layer');
assert.equal(world.dirtyChunks.size, 0, 'Grass appearance leaves terrain meshes intact');
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
const near = (a,b) => Math.abs(a-b)<1e-8;
const subtract = (a,b) => a.map((v,i)=>v-b[i]);
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot = (a,b) => a.reduce((sum,v,i)=>sum+v*b[i],0);
const vertexKey = v => v.map(n=>Math.round(n*1e8)).join(',');
for (const tall of [false,true]) for(let variant=0;variant<8;variant++) {
    let previous=Infinity;
    for(let detail=0;detail<3;detail++) {
        const faces=getBushyGrassFaces(tall,variant,detail);
        assert.equal(faces,getBushyGrassFaces(tall,variant+8,detail));
        assert.ok(faces.length<previous && faces.length<=[16,8,4][detail], 'LOD reduces geometry, without importing the whole reference meadow');
        previous=faces.length;maxima[detail]=Math.max(maxima[detail],faces.length);
        let roots=0;
        const cards=new Map();
        for(const f of faces) {
            assert.equal(f.vertices.length,4);
            assert.equal(f.uv.length,4);
            assert.ok(near(Math.hypot(...f.normal),1), 'Finite unit normal for lighting');
            // These are the real index orders emitted by the chunk mesher.
            for(const [a,b,c] of [[0,2,1],[2,3,1]]) {
                const winding=cross(subtract(f.vertices[b],f.vertices[a]),subtract(f.vertices[c],f.vertices[a]));
                assert.ok(dot(winding,f.normal)>0, 'Both triangles face the same direction as the lighting normal');
            }
            for(let i=0;i<4;i++) {
                const [x,y,z]=f.vertices[i];
                assert.ok([x,y,z].every(Number.isFinite));
                assert.ok(Math.abs(x)<=.5+1e-8&&Math.abs(z)<=.5+1e-8&&y>=-1e-8&&y<=(tall?1:.75)+1e-8);
                assert.ok(f.color.every(v=>Number.isFinite(v)&&v>=0&&v<=255));
                assert.ok(f.uv[i].every(v=>v>0&&v<1), 'UV stay inside their own atlas tile');
                assert.ok(Number.isInteger(f.weights[i])&&f.weights[i]>=0&&f.weights[i]<=255);
                // The authored PNG has its dense roots along the TOP row;
                // Blockbench's original UV deliberately places V=0 at Y=0.
                if(near(y,0)){roots++;assert.equal(f.weights[i],0);assert.ok(f.uv[i][1]<.02,'Authored texture roots stay at the ground');}
                else {assert.ok(f.weights[i]>0);assert.ok(f.uv[i][1]>.98,'Authored texture tips stay at the top');}
            }
            assert.equal(f.movement,0);
            const key=f.vertices.map(vertexKey).sort().join('|');
            if(!cards.has(key))cards.set(key,[]);
            cards.get(key).push(f);
        }
        assert.ok(roots>0);
        assert.equal(cards.size,[8,4,2][detail], 'Each distance retains a complete tuft, not the reference ground plane');
        for(const pair of cards.values()) {
            assert.equal(pair.length,2,'Every thin leaf card is visible from both sides');
            const [front,back]=pair;
            assert.ok(near(dot(front.normal,back.normal),-1));
            for(let i=0;i<4;i++) {
                const j=back.vertices.findIndex(v=>vertexKey(v)===vertexKey(front.vertices[i]));
                assert.deepEqual(front.uv[i],back.uv[j], 'The back side uses the same texel at the same point');
            }
        }
        if(detail===0) {
            const planes=Array.from(cards.values(),([face])=>{
                const axis=Math.abs(face.normal[0])>.5?0:2;
                return `${axis}:${Math.round(face.vertices[0][axis]*16)}`;
            }).sort();
            assert.deepEqual(planes,['0:-6','0:-2','0:4','0:6','2:-6','2:-4','2:2','2:6'].sort(), 'Preserve the eight original Blockbench planes and their 1/16-block spacing');
        }
    }
}

// Check the actual UV output, not just the model: a return to the old snow
// swatch must fail even if the imported cards themselves still look correct.
const plantPositions=bushy.getAttribute('position'), plantUV=bushy.getAttribute('uv');
const plantGroup=bushy.groups.find(group=>group.materialIndex===1);
const grassVertices=[];
for(let i=plantGroup.start/6*4;i<(plantGroup.start+plantGroup.count)/6*4;i++) {
    const x=plantPositions.getX(i),y=plantPositions.getY(i),z=plantPositions.getZ(i);
    if(y>=2 && y<=3 && z>1.8 && z<3.2 && ((x>1.8&&x<3.2)||(x>4.8&&x<6.2))) grassVertices.push(i);
}
assert.equal(grassVertices.length,128,'Two near tufts reach the shared chunk geometry');
for(const i of grassVertices) {
    assert.ok(plantUV.getX(i)>.25&&plantUV.getX(i)<.5);
    assert.ok(plantUV.getY(i)>.5&&plantUV.getY(i)<.75);
}

// Transparent pixels are essential: an opaque image turns eight cards into
// intersecting green walls. Decode the tiny authored PNG without a browser.
const png=readTexturePng(BUSHY_GRASS_TEXTURE_URL);
assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16),16);assert.equal(png.readUInt32BE(20),16);
assert.equal(png[24],8);assert.equal(png[25],6,'RGBA texture preserves cutout alpha');
assert.equal(png[28],0,'Non-interlaced PNG');
const compressed=[];
for(let offset=8;offset<png.length;) {
    const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);
    if(type==='IDAT')compressed.push(png.subarray(offset+8,offset+8+length));
    offset+=length+12;
}
const scanlines=inflateSync(Buffer.concat(compressed)),rgba=new Uint8Array(16*16*4);
assert.equal(scanlines.length,16*65);
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
for(let y=0;y<16;y++) {
    const filter=scanlines[y*65];assert.ok(filter<=4);
    for(let x=0;x<64;x++) {
        const i=y*64+x,left=x>=4?rgba[i-4]:0,above=y?rgba[i-64]:0,corner=y&&x>=4?rgba[i-68]:0;
        const predictor=[0,left,above,Math.floor((left+above)/2),paeth(left,above,corner)][filter];
        rgba[i]=(scanlines[y*65+1+x]+predictor)&255;
    }
}
const alpha=Array.from(rgba).filter((_,i)=>i%4===3);
assert.ok(alpha.some(a=>a===0)&&alpha.some(a=>a===255),'Leaves and empty space both survive export');

// A full-width card at the highest corner of a chunk can cross its old
// culling sphere after placement jitter and wind. Exercise actual mesh
// vertices at every corner, plus a dense meadow with varied placement.
const boundsWorld=new World(new Scene(),1,new Map(),'classic',{bushyGrass:true});
const windPoint=new Vector3();
for(const [cx,cz,dense] of [[0,0,false],[1,-1,false],[-2,3,true]]) {
    const edgeChunk=new Chunk(cx,cz);edgeChunk.skyLight.fill(15);
    boundsWorld.chunks.set(`${cx},${cz}`,edgeChunk);
    for(let x=0;x<16;x++)for(let z=0;z<16;z++) {
        if(!dense&&!((x===0||x===15)&&(z===0||z===15)))continue;
        edgeChunk.setId(x,16,z,getBlockId('dirt'));
        const type=dense&&(x+z)%3===1?'short_grass':'tall_grass';
        edgeChunk.setId(x,17,z,getBlockId(type));
    }
    assert.equal(edgeChunk.maxY,18);
    for(let detail=0;detail<3;detail++) {
        boundsWorld.getGrassDetail=()=>detail;
        const edgeGeometry=buildChunkGeometry(edgeChunk,boundsWorld);
        const position=edgeGeometry.getAttribute('position'),motion=edgeGeometry.getAttribute('plantMotion');
        assert.equal(edgeGeometry.userData.bushyGrassCount,dense?256:4);
        for(let i=0;i<position.count;i++)for(const sx of [-1,1])for(const sz of [-1,1]) {
            // Shader maxima: X = .07 + .02, Z = .055; getX returns the
            // normalized weight, so the stationary roots are also covered.
            windPoint.set(position.getX(i)+sx*.09*motion.getX(i),position.getY(i),position.getZ(i)+sz*.055*motion.getX(i));
            assert.ok(edgeGeometry.boundingSphere.containsPoint(windPoint),
                `Chunk (${cx},${cz}), LOD ${detail}: wind-blown grass must remain inside its frustum-culling bound`);
        }
        edgeGeometry.dispose();
    }
    boundsWorld.chunks.delete(`${cx},${cz}`);
}
for(const [distance,previous,expected] of [[0,-1,0],[60,-1,1],[110,-1,2],[55,0,0],[57,0,1],[41,1,1],[39,1,0],[103,1,1],[105,1,2],[90,2,2],[87,2,1]]) {
    assert.equal(grassDetailAtDistance(distance,previous),expected);
}
// Moving the loaded centre queues detail changes through the existing budget.
chunk.mesh={geometry:bushy};bushy.userData.bushyGrassDetail=0;
world.dirtyChunks.clear();world.centerCx=4;world.updatePlantVisibility(chunk);
assert.ok(world.dirtyChunks.has(chunk));
for(const g of [ordinary,bushy,restored])g.dispose();
console.log(`OK: trawa kępiasta — Eksperymenty, opt-in i odwracalność, niezmienione bloki/woda, zakorzenione dwustronne karty i UV, PNG 16×16 z alpha, obwiednia kęp na wietrze, LOD ${maxima.join('/')} ścian oraz histereza.`);
