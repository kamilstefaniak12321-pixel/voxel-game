// Prawdziwe World, BlockPlacer, VoxelRaycast, Player i FarTerrain.
// Zastępujemy tylko wczytywanie bitmap i kosztowny generator fixture.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize:16, mipmaps:false });
                export const atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => new Color(.4,.5,.6);
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { World } = await import('../src/world/World.js');
const { FarTerrain } = await import('../src/world/FarTerrain.js');
const { Player } = await import('../src/player/Player.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');
const { BlockBreaker } = await import('../src/interaction/BlockBreaker.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { riverPlantBounds } = await import('../src/interaction/RiverPlantBounds.js');
const { Vector3 } = await import('three');
const { getBlockId, isLiquidId, isSolidId, isOpaqueId, getLiquidKindId, getBlockTypeById, getRiverPlant, CREATIVE_BLOCKS } = await import('../src/blocks/BlockRegistry.js');
const { WATER_SURFACE } = await import('../src/config.js');

function fixture(savedChunks = new Map()) {
    const world = Object.assign(Object.create(World.prototype), {
        chunks: new Map(), savedChunks, dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
        generator: { generateChunk() {} },
        light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
    });
    const placer = new BlockPlacer(world, { intersectsBlock: () => false });
    const set = (x, y, z, type) => world.setBlock(x, y, z, type);
    const hit = (x = 0, y = 50, z = 0, normal = {x:0,y:1,z:0}) => ({hit:true,block:{x,y,z,type:world.getBlock(x,y,z)},normal});
    const pool = (depth = 1, ground = 'sand') => {
        set(0, 49, 0, ground);
        for (let y=50; y<50+depth; y++) set(0, y, 0, 'water');
    };
    return {world, placer, set, hit, pool};
}

let checked = 0;
function test(name, run) { run(); checked++; console.log(`OK: ${name}`); }

const all = ['river_sedge','cattail','purple_loosestrife','water_milfoil','water_lily','duckweed','cattail_water'];
const wet = all.slice(3);

test('stałe ID nowych roślin oraz dawnych bloków', () => {
    assert.deepEqual(all.map(getBlockId), [246,247,248,249,250,251,252]);
    assert.equal(getBlockId('water'), 12);
    assert.equal(getBlockId('reed'), 242);
    assert.equal(getBlockId('dune_grass'), 245);
    assert.ok(all.slice(0,6).every(type => CREATIVE_BLOCKS.includes(type)));
    assert.ok(!CREATIVE_BLOCKS.includes('cattail_water'));
});

for (const type of wet) {
    test(`${type}: zachowuje wodę, pływanie i brak kolizji`, () => {
        const f = fixture(); f.pool();
        f.set(0,50,0,type);
        const id = getBlockId(type);
        assert.equal(isLiquidId(id), true);
        assert.equal(isSolidId(id), false);
        assert.equal(isOpaqueId(id), false);
        assert.equal(getLiquidKindId(id), getBlockId('water'));
        assert.equal(Player.prototype.waterLevel.call({world:f.world,pos:{x:.5,y:49.5,z:.5},height:1.8}), 50+WATER_SURFACE);
        assert.equal(new BlockBreaker(f.world).breakBlock(f.hit()), true);
        assert.equal(f.world.getBlock(0,50,0), 'water');
    });
    test(`${type}: sadzenie w powietrzu nie tworzy wody`, () => {
        const f = fixture(); f.set(0,49,0,'sand');
        assert.equal(f.placer.placeBlock(f.hit(0,49,0),type), false);
        assert.equal(f.world.getBlock(0,50,0), null);
    });
}

test('pałka dobiera suchą lub wodną postać i wymaga płytkiej wody', () => {
    const f = fixture(); f.pool();
    assert.equal(f.placer.placeBlock(f.hit(), 'cattail'), 'cattail_water');
    const dry = fixture(); dry.set(0,49,0,'grass');
    assert.equal(dry.placer.placeBlock(dry.hit(0,49,0),'cattail'), 'cattail');
    const deep = fixture(); deep.pool(2);
    assert.equal(deep.placer.placeBlock(deep.hit(0,51,0),'cattail'), false);
    assert.equal(deep.placer.placeBlock(deep.hit(),'cattail'), false);
});

test('wywłócznik rośnie na dnie w wodzie; nie w kamieniu ani na tafli', () => {
    for (const ground of ['sand','gravel','mud','dirt']) {
        const f = fixture(); f.pool(3,ground);
        assert.equal(f.placer.placeBlock(f.hit(0,49,0),'water_milfoil'), 'water_milfoil');
        assert.equal(f.placer.placeBlock(f.hit(0,52,0),'water_milfoil'), false);
    }
    const f = fixture(); f.pool(1,'stone');
    assert.equal(f.placer.placeBlock(f.hit(),'water_milfoil'), false);
});

for (const type of ['water_lily','duckweed']) {
    test(`${type}: tylko odsłonięta tafla; przykrycie usuwa roślinę, nie wodę`, () => {
        const f = fixture(); f.pool(2);
        assert.equal(f.placer.placeBlock(f.hit(),type), false);
        assert.equal(f.placer.placeBlock(f.hit(0,51,0),type), type);
        f.set(0,52,0,'water');
        assert.equal(f.world.getBlock(0,51,0), 'water');
        f.set(0,52,0,null);
        f.set(0,51,0,type);
        f.set(0,52,0,'stone');
        assert.equal(f.world.getBlock(0,51,0), 'water');
        assert.equal(f.world.getBlock(0,52,0), 'stone');
    });
}

test('zniszczenie lub wymiana dna usuwa korzenie, pozostawia wodę i taflę', () => {
    const f = fixture(); f.pool(2);
    f.set(0,50,0,'water_milfoil'); f.set(0,51,0,'water_lily');
    f.set(0,49,0,'stone');
    assert.equal(f.world.getBlock(0,50,0),'water');
    assert.equal(f.world.getBlock(0,51,0),'water_lily');
    const shallow = fixture(); shallow.pool(); shallow.set(0,50,0,'cattail_water');
    shallow.set(0,49,0,null);
    assert.equal(shallow.world.getBlock(0,50,0),'water');
});

test('solid zastępuje całą komórkę z rośliną, bez odtwarzania wody', () => {
    const f = fixture(); f.pool(); f.set(0,50,0,'duckweed');
    f.set(0,50,0,'stone');
    assert.equal(f.world.getBlock(0,50,0),'stone');
    f.set(0,50,0,null);
    assert.equal(f.world.getBlock(0,50,0),null);
});

test('sadzenie nie nadpisuje innego wodnego gatunku', () => {
    const f = fixture(); f.pool(); f.set(0,50,0,'water_lily');
    assert.equal(f.placer.placeBlock(f.hit(0,49,0),'duckweed'),false);
    assert.equal(f.world.getBlock(0,50,0),'water_lily');
});

test('suche rośliny nadal potrzebują ziemi; nie wypierają wody', () => {
    for (const type of ['river_sedge','purple_loosestrife','fern']) {
        const f = fixture(); f.set(0,49,0,'grass');
        assert.equal(f.placer.placeBlock(f.hit(0,49,0),type),type);
        f.set(0,49,0,null);
        assert.equal(f.world.getBlock(0,50,0),null);
        f.set(0,49,0,'stone');
        assert.equal(f.placer.placeBlock(f.hit(0,49,0),type),false);
    }
    const wet = fixture(); wet.pool();
    assert.equal(wet.placer.placeBlock(wet.hit(),'river_sedge'),false);
});

test('celownik pomija czystą wodę, wskazuje roślinę i pozwala wybrać taflę', () => {
    const f = fixture(); f.pool(2);
    const ray = new VoxelRaycast(f.world,8);
    const eye = new Vector3(.5,54,.5), down = new Vector3(0,-1,0);
    assert.equal(ray.cast(eye,down).block.type,'sand');
    assert.equal(ray.cast(eye,down,true).block.y,51);
    f.set(0,51,0,'water_lily');
    assert.equal(ray.cast(eye,down).block.type,'water_lily');
});

test('zapis i ponowne wczytanie utrzymuje rośliny, wodę oraz materiał LOD', () => {
    const f = fixture();
    for (const [x,type] of all.entries()) {
        f.set(x,49,0,'sand'); f.set(x,50,0,type);
    }
    const saved = new Map([['0,0', new Uint8Array(f.world.getChunk(0,0).blocks)]]);
    const restored = fixture(saved); restored.world.generateChunk(0,0);
    for (const [x,type] of all.entries()) {
        assert.equal(restored.world.getBlock(x,50,0),type);
        assert.equal(getBlockTypeById(restored.world.getBlockId(x,50,0)),type);
        const surface = FarTerrain.prototype.modifiedSurface.call({},x,0,saved);
        assert.equal(surface.material, wet.includes(type) ? 'water' : 'sand');
        assert.equal(surface.top, wet.includes(type) ? 51 : 50);
    }
});

for (const type of ['cattail', 'cattail_water', 'purple_loosestrife']) {
    test(`${type}: celownik trafia górny pęd, ale nie powietrze/ścianę ani poza zasięgiem`, () => {
        const f = fixture();
        const river = getRiverPlant(getBlockId(type));
        let x = 0, bounds = riverPlantBounds(river,x,50,0);
        while (bounds.max[1] <= 1.05 && x < 16) bounds = riverPlantBounds(river,++x,50,0);
        assert.ok(bounds.max[1] > 1.05);
        f.set(x,49,0,'sand'); f.set(x,50,0,type);
        const eyeY = 50+(1+bounds.max[1])/2;
        const eyeZ = (bounds.min[2]+bounds.max[2])/2;
        const eye = new Vector3(x-2,eyeY,eyeZ), right = new Vector3(1,0,0);
        const hit = new VoxelRaycast(f.world,8).cast(eye,right);
        assert.equal(hit.block?.type,type);
        assert.equal(hit.block.y,50,'Górny fragment wskazuje komórkę korzeni');
        assert.deepEqual(hit.normal,{x:-1,y:0,z:0});
        assert.equal(new VoxelRaycast(f.world,hit.distance-0.001).cast(eye,right).hit,false);
        const above = new Vector3(x-2,50+bounds.max[1]+0.01,eyeZ);
        assert.equal(new VoxelRaycast(f.world,8).cast(above,right).hit,false);
        f.set(x-1,Math.floor(eyeY),Math.floor(eyeZ),'stone');
        assert.equal(new VoxelRaycast(f.world,8).cast(eye,right).block.type,'stone');
    });
    test(`${type}: posadzenie pod blokiem odrzucone, zakrycie usuwa wysoki pęd`, () => {
        const f = fixture(); f.pool();
        f.set(0,51,0,'stone');
        assert.equal(f.placer.placeBlock(f.hit(),type),false);
        f.set(0,51,0,null);
        f.set(0,50,0,type);
        f.set(0,51,0,'stone');
        assert.equal(f.world.getBlock(0,50,0),type === 'cattail_water' ? 'water' : null);
    });
}

test('pływające liście nie przechwytują promienia biegnącego pod nimi', () => {
    const f = fixture(); f.pool(); f.set(0,50,0,'water_lily');
    const ray = new VoxelRaycast(f.world,8);
    assert.equal(ray.cast(new Vector3(-2,50.2,.5),new Vector3(1,0,0)).hit,false);
    assert.equal(ray.cast(new Vector3(.5,54,.5),new Vector3(0,0,0)).hit,false);
});

console.log(`Sprawdzonych przypadków roślin i wody: ${checked}.`);
