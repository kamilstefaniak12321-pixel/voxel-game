// Drzewa generowane i wyrosłe z sadzonki nie zastępują wody tylko
// dlatego, że jest w niej roślina. Liście przykrywające taflę usuwają
// wyłącznie roślinę, zgodnie z regułami World.setBlock.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { placeTree, canReplace } = await import('../src/world/trees/Forests.js');
const { plantTree } = await import('../src/world/trees/plantTree.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { getBlockId, getBlockTypeById, isLeavesId } = await import('../src/blocks/BlockRegistry.js');

const aquatics = ['water_milfoil', 'water_lily', 'duckweed', 'cattail_water'];
const tree = (blocks = [], litter = [], roots = []) => ({ x: 5, y: 52, z: 5, species: 'oak', shape: { blocks, litter, roots } });
const chunkWithPlant = (type, ground = 'mud') => {
    const chunk = new Chunk(0, 0);
    chunk.setId(5, 49, 5, getBlockId(ground));
    chunk.setId(5, 50, 5, getBlockId(type));
    return chunk;
};

for (const type of ['water', ...aquatics]) {
    const id = getBlockId(type);
    for (const log of [true, false]) assert.equal(canReplace(id, log), false, `${type}: drzewo zachowuje ciecz`);
    for (const replacement of ['oak_log', 'oak_leaves']) {
        const chunk = chunkWithPlant(type);
        placeTree(chunk, 0, 0, tree([[0, -2, 0, replacement]]), getBlockId);
        assert.equal(chunk.getId(5, 50, 5), id, `${replacement} nie wypiera ${type}`);
    }
    const chunk = chunkWithPlant(type);
    placeTree(chunk, 0, 0, tree([], [[0, 0]]), getBlockId);
    assert.equal(chunk.getId(5, 50, 5), id, `Ściółka nie wypiera ${type}`);
}

for (const type of [...aquatics, 'cattail', 'purple_loosestrife', 'river_sedge']) {
    const chunk = chunkWithPlant(type);
    placeTree(chunk, 0, 0, tree([[0, -1, 0, 'oak_leaves']]), getBlockId);
    const expected = ['water_lily', 'duckweed', 'cattail_water'].includes(type) ? 'water'
        : ['cattail', 'purple_loosestrife'].includes(type) ? null : type;
    assert.equal(getBlockTypeById(chunk.getId(5, 50, 5)), expected, `Liść nad ${type}`);
    assert.equal(getBlockTypeById(chunk.getId(5, 51, 5)), 'oak_leaves');
}

function emptyWorld() {
    return Object.assign(Object.create(World.prototype), {
        chunks: new Map(), savedChunks: new Map(), dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
        generator: { generateChunk() {} },
        light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
    });
}

// Prawdziwy proceduralny dąb i World.setBlock, tak jak przy wzroście
// sadzonki. Dwa miejsca: roślina w zasięgu ściółki i w zasięgu korony.
const shape = buildTree('oak', 1234, 0.4);
const [lx, lz] = shape.litter[0];
const [cx, cy, cz] = shape.blocks.find(([x, y, z, type]) => isLeavesId(getBlockId(type)));
for (const type of aquatics) {
    const world = emptyWorld();
    world.setBlock(5, 51, 5, 'grass');
    world.setBlock(5, 52, 5, 'oak_sapling');
    world.setBlock(5 + lx, 49, 5 + lz, 'mud');
    world.setBlock(5 + lx, 50, 5 + lz, type);
    world.setBlock(5 + cx, 51 + cy, 5 + cz, 'mud');
    world.setBlock(5 + cx, 52 + cy, 5 + cz, 'water_milfoil');
    assert.ok(plantTree(world, 5, 52, 5, 'oak', 1234, 0.4), 'Sadzonka ma miejsce na wzrost');
    assert.equal(world.getBlock(5 + lx, 50, 5 + lz), type, `Rosnąca ściółka zachowuje ${type}`);
    assert.equal(world.getBlock(5 + cx, 52 + cy, 5 + cz), 'water_milfoil', 'Rosnąca korona nie wypiera wody');
}

console.log('OK: drzewa i ściółka zachowują wodę z roślinami; przykrycie usuwa tylko niesamodzielną roślinę.');
