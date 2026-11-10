// Mature-sized species use real registries, growth and chunk placement.
// Rendering is exercised separately by sprawdz_nowe_drzewa_webgl.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[], getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            `
        };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { TREE_NAMES, TREE_SPECIES } = await import('../src/blocks/trees.js');
const { TREE_TEXTURE_NAMES, TREE_DEFINITIONS } = await import('../src/blocks/treeCatalog.js');
const { buildTree, treeShapeLimits, treeVisualDimensions, TREE_REACH, TREE_MAX_HEIGHT } = await import('../src/world/trees/TreeShapes.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { placeTree } = await import('../src/world/trees/Forests.js');
const { plantTree } = await import('../src/world/trees/plantTree.js');
const { getBlockId, getGrowth, getStrip, isLeavesId } = await import('../src/blocks/BlockRegistry.js');
const { getRecipe, gridResult, matchesIngredient } = await import('../src/crafting/Crafting.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');

const species = ['acacia', 'bald_cypress', 'cherry'];
const sha = data => createHash('sha256').update(data).digest('hex');
const record = shape => sha(JSON.stringify(shape));
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; }
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks++; }
const widths = shape => {
    const leaves = shape.blocks.filter(([, , , type]) => isLeavesId(getBlockId(type)));
    return [0, 2].map(axis => Math.max(...leaves.map(cell => cell[axis])) - Math.min(...leaves.map(cell => cell[axis])) + 1);
};

check(TREE_DEFINITIONS.length >= 12, 'Every built-in tree species is registered');
check(species.every(name => TREE_NAMES.includes(name)), 'All new species are registered');
for (const [index, name] of species.entries()) {
    const pack = TREE_SPECIES[name];
    equal(pack.firstId, 1000 + index * 10, `${name}: stable reserved IDs`);
    for (const [offset, part] of ['log', 'log_stripped', 'planks', 'leaves', 'sapling'].entries()) {
        equal(getBlockId(`${name}_${part}`), pack.firstId + offset, `${name}: ${part} ID`);
    }
    equal(getStrip(`${name}_log`).into, `${name}_log_stripped`, `${name}: axe strips its own wood`);
    equal(getGrowth(`${name}_sapling`).tree, name, `${name}: sapling grows this species`);
    equal(gridResult([{ type: `${name}_log`, count: 1 }, null, null, null])?.type, `${name}_planks`, `${name}: log crafts species planks`);
    equal(gridResult([{ type: `${name}_log_stripped`, count: 1 }, null, null, null])?.count, 4, `${name}: stripped log crafts four planks`);
    check(getRecipe(`${name}_planks`), `${name}: planks have a recipe`);
    check(matchesIngredient('#planks', `${name}_planks`), `${name}: planks work in shared wooden recipes`);
    const baseline = JSON.parse(readFileSync(new URL('./fixtures/texture-atlas-079.json', import.meta.url)));
    for (const file of ['leaves.png', 'leaves_variant.png', 'log_side.png', 'log_top.png', 'planks.png']) {
        const region = readTextureRegion(`${name}/${file}`);
        equal(sha(region.rgba), baseline.tiles[`${name}/${file}`].rgbaSha256, `${name}/${file}: supplied pixels remain unmodified`);
        equal([region.width, region.height], [16, 16], `${name}/${file}: 16x16 texels`);
        check(TREE_TEXTURE_NAMES.includes(`${name}/${file}`), `${name}/${file}: texture enters atlas`);
    }
}

// A shape is deterministic in all paths, remains inside its declared search
// bounds and reaches the same total height used by distant geometry.
for (const name of species) for (let seed = 0; seed < 40; seed++) for (const size of [0, .25, .5, .75, 1]) {
    const shape = buildTree(name, seed, size), metrics = treeVisualDimensions(name, size), limits = treeShapeLimits(name);
    equal(record(shape), record(buildTree(name, seed, size)), `${name}: deterministic seed ${seed}, size ${size}`);
    equal(shape.top + 1, metrics.height, `${name}: near and far agree on height`);
    check(shape.blocks.every(([x, y, z, type]) => Math.abs(x) <= limits.reach && Math.abs(z) <= limits.reach &&
        y >= 0 && y < metrics.height && getBlockId(type) > 0), `${name}: complete registered shape inside bounds`);
    check(shape.blocks.length < 1500, `${name}: bounded geometry cost`);
    check(limits.reach <= TREE_REACH && limits.maxHeight <= TREE_MAX_HEIGHT, `${name}: global chunk search covers species bounds`);
}
for (const name of species) {
    check(record(buildTree(name, 12345, .75)) !== record(buildTree(name, 12346, .75)), `${name}: distinct seeds change the silhouette`);
    const small = buildTree(name, 12, 0), large = buildTree(name, 12, 1);
    check(large.top > small.top && large.blocks.length > small.blocks.length, `${name}: mature size progression changes geometry`);
}

const acacia = buildTree('acacia', 12345, .75);
check(acacia.top + 1 >= 10 && widths(acacia).every(width => width >= 14), 'Acacia casts a wide umbrella above a person');
check(acacia.blocks.filter(([, , , type]) => type.includes('_leaves')).every(([, y]) => y >= 3), 'Room to stand under the adult acacia');
const cypress = buildTree('bald_cypress', 12345, .75);
equal(cypress.top + 1, 33, 'Cypress is about 18 player-heights, not capped at the old 28-block envelope');
check(widths(cypress).every(width => width >= 10), 'Mature cypress crown remains broad at full height');
check(cypress.blocks.filter(([, y, , type]) => y === 1 && type === 'bald_cypress_log').length >= 8, 'Cypress has a buttressed base');
check(cypress.blocks.filter(([, y, , type]) => y === 18 && type === 'bald_cypress_log').length >= 4, 'Cypress keeps a substantial trunk above the player');
const cherry = buildTree('cherry', 12345, .75);
equal(cherry.top + 1, 9, 'Flowering cherry stays at a human-scale nine metres');
check(widths(cherry).every(width => width >= 10), 'Flowering cherry has a broad crown');

// Split the production geometry across positive and negative chunk corners.
// Every crown cell, including those beyond the former reach=7, must survive
// serialization with IDs above255 and reappear without seams.
for (const name of species) for (const [x, z] of [[15, 15], [-1, -1], [0, -16]]) {
    const shape = buildTree(name, 12345, 1), tree = { x, y: 50, z, species: name, shape };
    const limits = treeShapeLimits(name), chunks = new Map();
    for (let cx = Math.floor((x - limits.reach) / CHUNK_SIZE); cx <= Math.floor((x + limits.reach) / CHUNK_SIZE); cx++) {
        for (let cz = Math.floor((z - limits.reach) / CHUNK_SIZE); cz <= Math.floor((z + limits.reach) / CHUNK_SIZE); cz++) {
            const chunk = new Chunk(cx, cz);
            for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) chunk.setId(lx, 49, lz, getBlockId('grass'));
            placeTree(chunk, cx * CHUNK_SIZE, cz * CHUNK_SIZE, tree, getBlockId);
            const reloaded = new Chunk(cx, cz);
            reloaded.loadBlocks(chunk.blocks.slice());
            chunks.set(`${cx},${cz}`, reloaded);
        }
    }
    for (const [dx, dy, dz, type] of shape.blocks) {
        const cx = Math.floor((x + dx) / CHUNK_SIZE), cz = Math.floor((z + dz) / CHUNK_SIZE);
        equal(chunks.get(`${cx},${cz}`).getId(x + dx - cx * CHUNK_SIZE, 50 + dy, z + dz - cz * CHUNK_SIZE),
            getBlockId(type), `${name}: complete tree across chunks and reload`);
    }
}

const world = Object.assign(Object.create(World.prototype), {
    chunks: new Map(), savedChunks: new Map(), dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
    generator: { generateChunk() {} }, light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} }
});
for (const [index, name] of species.entries()) {
    const x = index * 32;
    world.setBlock(x, 49, 0, 'grass');
    world.setBlock(x, 50, 0, `${name}_sapling`);
    const grown = plantTree(world, x, 50, 0, name, 12345, .75);
    check(grown && world.getBlock(x, 50, 0) === `${name}_log`, `${name}: real sapling placement succeeds`);
    equal(plantTree(world, x, CHUNK_HEIGHT - 8, 32, name, 12345, 1), null, `${name}: growth rejects ceiling rather than clipping the crown`);
}

// Fixed points discovered in a bounded scan of the actual seed42 world.
// They exercise climate, biome, density, ground and other pack priorities;
// merely calling catalogSpecies with an invented climate would miss conflicts.
const natural = new RealisticGenerator(42);
for (const [name, gx, gz, x, y, z] of [
    ['acacia', 215, 137, 862, 51, 550],
    ['bald_cypress', 311, -70, 1247, 58, -280],
    ['cherry', 344, -400, 1379, 58, -1597]
]) {
    const descriptor = natural.forests.descriptorAt(gx, gz), tree = natural.forests.treeAt(gx, gz);
    equal(descriptor?.species, name, `${name}: actually spawns in the existing climate/biome generator`);
    equal([tree.x, tree.y, tree.z], [x, y, z], `${name}: stable natural placement`);
    equal(tree.shape.top + 1, treeVisualDimensions(name, tree.size).height, `${name}: naturally generated mature height`);
    const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    natural.generateChunk(chunk);
    equal(chunk.getId(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE), getBlockId(`${name}_log`),
        `${name}: real generated terrain contains its trunk`);
}

// Intentionally locked to0.78.0: adding new species must not silently reshape
// any of the nine existing species. Future intentional tree redesigns can
// update the respective baseline with their own reviewed reference images.
const legacy = {
    spruce: 'b12b4e24a280c4d39357e935892a4e75ae6d71b8d290d1e31c46bae9db0e43e3',
    pine: '6cdbaa58a1bc601b27607c4e77f2339e9297e5b092b18d3544595c0e37fc67a8',
    beech: '92bca92840348d8aebdca365ffd23bc3f70c98ec26c3fc2bd984c5269c95c21b',
    linden: 'baa371362a4319f3c624d743ec584ec01b8f2035b26d9779e24d44faaac38ab9',
    oak: '8f247f76bb7baae020b5ddb904beffc6f68d4942a03befaa0bd4cab1d7f7052c',
    birch: '9c6e3d4fb9750bdc65ee84183d2c1ea69755511b44496c4fc590816dacbd282b',
    jablon: '643432b7baeb3dc7eccbb852de7bdf326dc89b8a2324bd22fcb1f09d20ecc864',
    olcha: '6d7f037e3aacf442e98428dba3f15de08b836d1da3a03af7afc1cb8ea6c479e3',
    wierzba: 'f6168dba02817ddcdcf985c2b8f4cf20d7abbf3c6513d16b77e0713b246d4c29'
};
for (const [name, expected] of Object.entries(legacy)) {
    const shapes = [];
    for (let seed = 0; seed < 100; seed++) for (const size of [0, .25, .5, .75, 1]) shapes.push(record(buildTree(name, seed, size)));
    equal(sha(shapes.join('')), expected, `${name}:500 legacy shapes are unchanged`);
    equal(treeShapeLimits(name), { reach: 7, maxHeight: 28 }, `${name}: legacy shape limits remain unchanged`);
}

console.log(`OK: nowe drzewa — ${checks} sprawdzeń skali, tekstur, rejestracji, wzrostu, granic chunków i zapisu; 4500 istniejących drzew bez zmian.`);
