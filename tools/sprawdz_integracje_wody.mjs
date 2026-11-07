// Consumer integration for source, flowing and falling water. Real player,
// placement and raycast code; only bitmap loading is replaced for Node.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const { Scene, PerspectiveCamera, Vector3, Ray } = await import('three');
const { World } = await import('../src/world/World.js');
const { Player } = await import('../src/player/Player.js');
const { WaterEffects } = await import('../src/game/WaterEffects.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');
const { BlockBreaker } = await import('../src/interaction/BlockBreaker.js');
const { waterSurfaceHeight } = await import('../src/world/WaterSurface.js');
const { getBlockId, getBlockTypeById, isSolidId, isLiquidId, isWaterSourceId,
    getWaterLevel, waterIdForLevel } = await import('../src/blocks/BlockRegistry.js');

let checks = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const ok = (value, message) => { assert.ok(value, message); checks++; };
const near = (actual, expected, message) => {
    assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`); checks++;
};
const stillInput = { isKeyDown: () => false, consumeKeyPress: () => false };
const down = new Vector3(0,-1,0);

function fixture() {
    const cells = new Map(), key = (x,y,z) => `${x},${y},${z}`;
    const world = {
        spawnPoint: { x:.5, z:.5 }, ensureColumnLoaded() {}, getGroundY: () => 0,
        getBlockId: (x,y,z) => cells.get(key(x,y,z)) ?? 0,
        getBlock(x,y,z) { return getBlockTypeById(this.getBlockId(x,y,z)); },
        isSolid(x,y,z) { return isSolidId(this.getBlockId(x,y,z)); },
        getFlow: () => null
    };
    const set = (x,y,z,id) => cells.set(key(x,y,z),typeof id === 'number' ? id : getBlockId(id));
    const camera = new PerspectiveCamera();
    const player = new Player(world,camera);
    const effects = new WaterEffects({ world, camera, player });
    return { world, set, player, effects, camera };
}

// Every stored level remains non-solid, but its liquid volume ends exactly at
// its rendered height. The ray can start in the empty part of that same cell.
for (let level = 0; level <= 8; level++) {
    const f = fixture(), id = waterIdForLevel(level);
    const height = level === 8 ? 1 : .875 * (8 - level) / 8;
    f.set(0,49,0,'sand'); f.set(0,50,0,id);
    f.player.pos.set(.5,50,.5);
    near(f.player.waterLevel(),50 + height,`level ${level}: player sees exact surface`);
    f.player.updateWater();
    near(f.player.submerged,height / 1.8,`level ${level}: exact wet body fraction`);
    eq(f.player.swimming,false,`level ${level}: shallow flow does not enable swimming`);
    eq(f.player.collidesAt(f.player.pos),false,`level ${level}: water has no solid collision`);
    eq(f.player.collidesAt(new Vector3(.5,49.9,.5)),true,`level ${level}: solid floor still collides`);
    eq(f.player.moveAxis('x',.1),false,`level ${level}: movement can cross liquid`);
    eq(f.effects.isUnderwater(new Vector3(.5,50 + height - .0001,.5)),true,`level ${level}: eye just below surface is wet`);
    eq(f.effects.isUnderwater(new Vector3(.5,50 + height + .0001,.5)),false,`level ${level}: eye above surface stays dry`);
    near(f.effects.depthBelowSurface(new Vector3(.5,50.01,.5)),height - .01,`level ${level}: underwater depth uses exact height`);

    const ray = new VoxelRaycast(f.world,4), eye = new Vector3(.5,52,.5);
    const hit = ray.cast(eye,down,true);
    eq(hit.block?.type,getBlockTypeById(id),`level ${level}: includeWater targets actual state`);
    near(hit.distance,2 - height,`level ${level}: vertical ray hits surface, not cell ceiling`);
    eq(hit.normal,{x:0,y:1,z:0},`level ${level}: top hit keeps a block placement normal`);
    eq(ray.cast(eye,down).block?.type,'sand',`level ${level}: ordinary aiming passes through water`);
    eq(new VoxelRaycast(f.world,hit.distance - .0001).cast(eye,down,true).hit,false,`level ${level}: water respects maximum reach`);
    const sameCellEye = new Vector3(.5,50 + Math.min(.9999,height + .01),.5);
    if (height < 1) near(ray.cast(sameCellEye,down,true).distance,sameCellEye.y - 50 - height,
        `level ${level}: ray starting above water inside its cell still finds the surface`);
    const side = ray.cast(new Vector3(-.5,50 + height / 2,.5),new Vector3(1,0,0),true);
    near(side.distance,.5,`level ${level}: submerged side is selectable`);
    eq(side.normal,{x:-1,y:0,z:0},`level ${level}: submerged side keeps its normal`);
    if (height < 1) eq(ray.cast(new Vector3(-.5,50 + (1 + height) / 2,.5),new Vector3(1,0,0),true).hit,false,
        `level ${level}: empty space over shallow water does not intercept a horizontal ray`);
    f.player.pos.y = 50 + height + .001;
    f.player.updateWater();
    eq(f.player.submerged,0,`level ${level}: feet above the actual surface are dry`);
}

// An asymmetric patch is not a bilinear surface. Check both top triangles,
// diagonal crossings and negative/chunk-edge coordinates against an explicit
// triangle oracle independent from the shared height function.
for (const [x,z] of [[-17,-1],[15,16]]) {
    const f = fixture(), y = 50;
    const levels = [[7,7,1],[7,4,1],[6,6,2]];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        f.set(x + dx,y,z + dz,waterIdForLevel(levels[dz + 1][dx + 1]));
    }
    const h00 = .19140625, h10 = .51953125, h01 = .24609375, h11 = .51953125;
    const expectedHeight = (fx,fz) => fx + fz <= 1
        ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
        : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
    const a = new Vector3(x,y + h00,z), b = new Vector3(x + 1,y + h10,z);
    const c = new Vector3(x,y + h01,z + 1), d = new Vector3(x + 1,y + h11,z + 1);
    const ray = new VoxelRaycast(f.world,4);
    for (const [fx,fz] of [[.2,.2],[.8,.6],[.6,.4],[.1,.8]]) {
        const height = expectedHeight(fx,fz);
        near(waterSurfaceHeight(f.world,x,y,z,fx,fz),height,'shared slope matches triangle oracle');
        f.player.pos.set(x + fx,y,z + fz); f.player.updateWater();
        near(f.player.submerged,height / 1.8,'player immersion follows local slope');
        near(f.player.waterLevel(),y + height,'player level follows local slope');
        eq(f.effects.isUnderwater(new Vector3(x + fx,y + height - .0001,z + fz)),true,'camera below sloped triangle is wet');
        eq(f.effects.isUnderwater(new Vector3(x + fx,y + height + .0001,z + fz)),false,'camera above sloped triangle is dry');
        near(ray.cast(new Vector3(x + fx,y + 2,z + fz),down,true).distance,2 - height,'vertical ray follows sloped triangle');

        const direction = new Vector3(.08,-1,.05).normalize();
        const eye = new Vector3(x + fx,y + height,z + fz).addScaledVector(direction,-1);
        const oracle = new Ray(eye,direction);
        const distances = [[a,c,b],[b,c,d]].map(vertices => oracle.intersectTriangle(...vertices,false,new Vector3()))
            .filter(Boolean).map(point => point.distanceTo(eye));
        near(ray.cast(eye,direction,true).distance,Math.min(...distances),'oblique ray agrees with geometric triangle intersection');
    }
    for (const targetX of [.5,.85]) {
        const eye = new Vector3(x + .02,y + expectedHeight(targetX,.3),z + .3);
        const hit = ray.cast(eye,new Vector3(1,0,0),true);
        near(hit.distance,targetX - .02,'horizontal ray intersects slope before/after its diagonal');
        eq(hit.block,{x,y,z,type:getBlockTypeById(waterIdForLevel(4))},'sloped hit keeps the correct root cell');
    }
}

// Contiguous water is full below its surface; a detached stream only wets the
// part of the body it actually touches, not the air between it and the feet.
{
    const f = fixture();
    f.set(0,50,0,waterIdForLevel(0)); f.set(0,51,0,waterIdForLevel(6));
    f.player.pos.set(.5,50,.5); f.player.updateWater();
    near(f.player.submerged,(1 + .21875) / 1.8,'stacked water fills its lower cell');
    ok(f.player.swimming,'sufficient continuous water enables swimming');
    near(f.effects.depthBelowSurface(new Vector3(.5,50.2,.5)),1.01875,'depth traverses full column to the actual upper surface');
    f.set(0,50,0,0); f.player.pos.y = 49.5; f.player.updateWater();
    near(f.player.submerged,.21875 / 1.8,'air below a detached thin stream contributes no immersion');
    eq(f.player.swimming,false,'detached stream cannot enable swimming in dry air');
    eq(f.player.waterCellY,51,'current samples a touched water cell, not dry feet');
    eq(f.effects.depthBelowSurface(new Vector3(.5,50.2,.5)),0,'dry camera has no water depth');
    f.set(0,51,0,waterIdForLevel(7)); f.set(0,52,0,'stone');
    eq(f.effects.isUnderwater(new Vector3(.5,51.99,.5)),true,'water reaches a solid ceiling without a dry slit');
}

// Use the dynamic 3-D current if present. An intentional null must never fall
// back to an unrelated legacy river column; old lightweight ports still work.
{
    const f = fixture(), requested = [], dynamic = [2,-1];
    f.set(0,50,0,waterIdForLevel(0));
    f.world.getWaterFlow = (x,y,z) => { requested.push([x,y,z]); return dynamic; };
    f.world.getFlow = () => { throw new Error('Unexpected legacy current fallback'); };
    f.player.pos.set(.5,50,.5); f.player.updateWater(); f.player.updateMovement(.02,stillInput);
    eq(requested,[[0,50,0]],'player asks for current at its actual water cell');
    ok(f.player.current === dynamic,'player adopts the dynamic current');
    ok(f.player.vel.x > 0 && f.player.vel.z < 0,'dynamic current pushes in both horizontal axes');
    f.world.getWaterFlow = () => null;
    f.player.updateMovement(.02,stillInput);
    eq(f.player.current,null,'null dynamic current stays still');
    near(f.player.vel.x,0,'old river current cannot leak into still dynamic water');
    delete f.world.getWaterFlow;
    f.world.getFlow = () => [-1,0];
    f.player.updateMovement(.02,stillInput);
    eq(f.player.current,[-1,0],'legacy current port remains compatible');
}

// Stream ambience includes shallow flow and a vertical falling column even
// when they have no horizontal vector; positions use the same surface height.
{
    const f = fixture(), sampled = [];
    for (const [x,id] of [[0,waterIdForLevel(0)],[2,waterIdForLevel(7)],[4,waterIdForLevel(8)],
        [6,waterIdForLevel(0)],[8,getBlockId('water_lily')]]) f.set(x,50,0,id);
    f.camera.position.set(.5,50.7,.5);
    f.world.getWaterFlow = (x,y,z) => { sampled.push([x,y,z]); return x === 6 ? [1,0] : null; };
    f.world.getFlow = () => { throw new Error('Sound used legacy current despite a dynamic port'); };
    f.effects.measureWaves();
    eq(f.effects.nearbyWater,5,'sound finds all source, flow, fall and waterlogged columns');
    eq(f.effects.flowingWater,3,'flow, fall and a moving source use stream ambience');
    ok(sampled.every(([,y]) => y === 50),'ambience samples the actual water height layer');
    near(f.effects.ambience.find(item => item.flowing).center.y,50 + (.109375 + 1 + .875) / 3,
        'stream centre uses actual surface levels');
    near(f.effects.ambience.find(item => !item.flowing).center.y,50.875,'source and waterlogged wave surface stays unchanged');
}

// Exercise actual World.setBlock and BlockBreaker: no flow can be converted
// into a permanent source by planting and then harvesting an aquatic plant.
{
    const world = new World(new Scene(),'water-consumer-integration',new Map(),'flat');
    world.generator.generateChunk = () => {};
    world.light = { initChunk() {}, blockChanged() {}, takeChangedChunks() {} };
    const placer = new BlockPlacer(world,{ intersectsBlock: () => false });
    const breaker = new BlockBreaker(world);
    const hit = () => ({hit:true,block:{x:0,y:50,z:0,type:world.getBlock(0,50,0)},normal:{x:0,y:1,z:0}});
    const plants = ['water_milfoil','water_lily','duckweed','cattail_water','cattail'];
    try {
        world.setBlock(0,49,0,'sand');
        for (let level = 1; level <= 8; level++) {
            const type = getBlockTypeById(waterIdForLevel(level));
            world.setBlock(0,50,0,type);
            for (const plant of plants) {
                const version = world.version;
                eq(placer.placeBlock(hit(),plant),false,`${plant}: level ${level} cannot become a planted source`);
                eq(world.getBlock(0,50,0),type,`${plant}: rejected placement preserves the original flow`);
                eq(world.version,version,`${plant}: rejected placement changes no world state`);
            }
            ok(breaker.breakBlock(hit()),`level ${level}: original flowing water can still be removed`);
            eq(world.getBlockId(0,50,0),0,`level ${level}: removing flow does not leave a source`);
        }
        for (const plant of plants) {
            world.setBlock(0,50,0,'water');
            eq(placer.placeBlock(hit(),plant),plant === 'cattail' ? 'cattail_water' : plant,`${plant}: planting in a real source succeeds`);
            ok(isWaterSourceId(world.getBlockId(0,50,0)),`${plant}: waterlogged plant retains source semantics`);
            eq(placer.placeBlock(hit(),'duckweed'),false,`${plant}: another plant cannot overwrite it`);
            ok(breaker.breakBlock(hit()),`${plant}: harvesting succeeds`);
            eq(world.getBlock(0,50,0),'water',`${plant}: harvesting returns the existing source`);
        }
        for (let level = 0; level <= 8; level++) {
            const id = waterIdForLevel(level);
            eq(getWaterLevel(id),level,'all consumer fixtures exercise distinct registered states');
            ok(isLiquidId(id) && !isSolidId(id),'every water state remains a non-solid liquid');
        }
    } finally {
        world.dispose();
    }
}

console.log(`OK: integracje wody — ${checks} sprawdzeń poziomów, pływania, kolizji, celownika, nurtu, dźwięku i sadzenia.`);
