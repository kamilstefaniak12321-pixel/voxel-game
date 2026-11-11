// Independent 0.84 baselines plus both 0.85 species: saved IDs, original
// pixels, mature scale, growth, chunk seams and all near/far detail levels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import { textureManifest, readTextureRegion } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            export const blockAtlasTexture=null, atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>null,getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=36,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/')) ? { ...context, format: 'module' } : context);
    }
});
const { TREE_NAMES, TREE_SPECIES, treeBlocks } = await import('../src/blocks/trees.js');
const { TREE_TEXTURE_NAMES } = await import('../src/blocks/treeCatalog.js');
const { buildTree, treeShapeLimits, treeVisualDimensions } = await import('../src/world/trees/TreeShapes.js');
const { treeSilhouette, VEGETATION_STRIDE } = await import('../src/world/farVegetation.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { placeTree } = await import('../src/world/trees/Forests.js');
const { plantTree } = await import('../src/world/trees/plantTree.js');
const { getBlockId, getBlockDefinition, getGrowth, getStrip, isLeavesId } = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');
const { getRecipe, gridResult, matchesIngredient } = await import('../src/crafting/Crafting.js');
const { FIRE_WOODS, fuelType } = await import('../src/game/CampfireState.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { LEAF_SPRITES, leafSprites } = await import('../src/rendering/TreeParticles.js');
const baseline = JSON.parse(readFileSync(new URL('./fixtures/tree-and-texture-084.json', import.meta.url)));
const manifest = textureManifest(), sha = bytes => createHash('sha256').update(bytes).digest('hex');
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

equal(TREE_NAMES, [...baseline.species, 'ginkgo', 'jacaranda'], 'Nineteen species, append-only stable catalogue');
equal([manifest.tileSize, manifest.columns, manifest.rows], [baseline.tileSize, baseline.columns, baseline.rows + 1], 'One extra GPU row preserves all old texture neighbours');
for (const [key, previous] of Object.entries(baseline.tiles)) {
    const { rgbaSha256, ...layout } = previous;
    equal(manifest.tiles[key], layout, `${key}: old GPU UV and region remain identical`);
    equal(sha(readTextureRegion(layout.region).rgba), rgbaSha256, `${key}: old source RGBA unchanged`);
}
equal(TREE_TEXTURE_NAMES.slice(0, baseline.textureNames.length), baseline.textureNames, 'All existing texture names preserve order');
const oldBlocks = Object.fromEntries(Object.entries(treeBlocks()).filter(([, block]) => baseline.species.includes(block.tree)));
equal(sha(JSON.stringify(canonical(oldBlocks))), baseline.blocksSha256, 'All seventeen old species retain saved IDs and behaviour');
for (const [species, hash] of Object.entries(baseline.shapeSha256)) {
    const actual = createHash('sha256');
    for (let seed = 0; seed < 100; seed++) for (const size of [0, .25, .5, .75, 1]) actual.update(JSON.stringify(buildTree(species, seed, size)) + '\n');
    equal(actual.digest('hex'), hash, `${species}: 500 existing shapes unchanged`);
}
const species = { ginkgo: { first: 1080, height: [18, 26] }, jacaranda: { first: 1090, height: [8, 14] } };
// Independently decoded from the two supplied ZIP files, before import.
const originalPixels = {
    'ginkgo/log_side.png': '852e86fb023d84e03de3584c4cbb2b4ce5d31f16cdd040724868678974b7a917',
    'ginkgo/log_top.png': '4754063bee5e18fe94b1556ded9400cdc22d6cd075bbef36cffc65416499650e',
    'ginkgo/planks.png': 'c7207994b0776523ea4b6e283f89c9587a292f4f5f130d3f3e74ce8d4e6e523b',
    'ginkgo/leaves.png': '4bfb7c871f031abe778050a1016ca0fdfaaf8b2b4b37d1c33099150273decfc2',
    'ginkgo/leaves_variant.png': 'e7e3ea1845ec35bc0254ad44575dfb1c562485170b89750d052ac3d297cf57e6',
    'jacaranda/log_side.png': '600251d27fdc357cc909ab17f9c8919f6ae1ee899e755deddcd210486afb9c24',
    'jacaranda/log_top.png': '4c3cedcea8d1db970ec458cd5231ca887c6cfd51bd30c0c57c87ce12394c73d8',
    'jacaranda/planks.png': 'afae5f140daacb79235088b9e57ea5136440b9f478f10257e30931dd237e2b0b',
    'jacaranda/leaves.png': 'e9552a9c96f8ff91993bab76ce6eb47290351f4e41bd0a47d039b14324c0ac73',
    'jacaranda/leaves_variant.png': 'c51630106d625f4af27e173cabf04128c1260e8f94ff2711b67731ba651a8c8c'
};
for (const [name, expected] of Object.entries(originalPixels)) equal(sha(readTextureRegion(name).rgba), expected, `${name}: exact supplied pixels`);
for (const [name, info] of Object.entries(species)) {
    const spriteNames = leafSprites(name).map(index => Object.keys(LEAF_SPRITES)[index]);
    equal(spriteNames, name === 'ginkgo' ? ['wachlarz'] : ['platek', 'waski'], `${name}: correct falling leaf sprites`);
    check(spriteNames.every(sprite => LEAF_SPRITES[sprite].length === 6 && LEAF_SPRITES[sprite].every(row => row.length === 6)), `${name}: crisp six-by-six sprites`);
    equal(TREE_SPECIES[name].firstId, info.first, `${name}: persistent block allocation`);
    for (const [offset, part] of ['log', 'log_stripped', 'planks', 'leaves', 'sapling'].entries()) equal(getBlockId(`${name}_${part}`), info.first + offset, `${name}: ${part} ID`);
    equal(getStrip(`${name}_log`).into, `${name}_log_stripped`, `${name}: stripping`);
    equal(getGrowth(`${name}_sapling`).tree, name, `${name}: sapling growth`);
    equal(gridResult([{ type: `${name}_log`, count: 1 }, null, null, null])?.type, `${name}_planks`, `${name}: planks recipe`);
    check(getRecipe(`${name}_planks`) && matchesIngredient('#planks', `${name}_planks`), `${name}: shared wooden recipes`);
    check(FIRE_WOODS[name] && ITEM_TYPES[fuelType(name)] && getRecipe(fuelType(name)), `${name}: campfire fuel`);
    equal([readTextureRegion(`campfire_${name}`).width, readTextureRegion(`campfire_${name}`).height], [32, 32], `${name}: full firewood UV sheet`);
    for (const key of TREE_TEXTURE_NAMES.filter(key => key.startsWith(name + '/'))) {
        const image = readTextureRegion(key);
        equal([image.width, image.height], [16, 16], `${key}: native pixel scale`);
        check(image.rgba.some((value, i) => i % 4 === 3 && value > 0), `${key}: visible texture`);
    }
    for (let seed = 0; seed < 40; seed++) for (const size of [0, .25, .5, .75, 1]) {
        const shape = buildTree(name, seed, size), dimensions = treeVisualDimensions(name, size), limits = treeShapeLimits(name);
        equal(sha(JSON.stringify(shape)), sha(JSON.stringify(buildTree(name, seed, size))), `${name}: deterministic seed ${seed}`);
        equal(shape.top + 1, dimensions.height, `${name}: complete mature height matches far dimensions`);
        check(dimensions.height >= info.height[0] && dimensions.height <= info.height[1], `${name}: metre scale`);
        check(shape.blocks.every(([x, y, z]) => Math.abs(x) <= limits.reach && Math.abs(z) <= limits.reach && y >= 0 && y <= limits.maxHeight), `${name}: no clipped branches`);
        const foliage = shape.blocks.filter(cell => isLeavesId(getBlockId(cell[3])));
        check(foliage.length > 40 && foliage.every(([, y]) => y >= 2), `${name}: substantial crown with room for the player`);
        let previousBoxes = Infinity;
        for (const spacing of [1, 2, 4, 8]) {
            const far = treeSilhouette({ species: name, seed, size, x: 0, y: 0, z: 0 }, spacing);
            check(far.length > 0 && far.length % VEGETATION_STRIDE === 0 && far.every(Number.isFinite), `${name}: valid LOD ${spacing}`);
            const boxes = Array.from({ length: far.length / VEGETATION_STRIDE }, (_, i) => far.slice(i * VEGETATION_STRIDE, (i + 1) * VEGETATION_STRIDE));
            equal(Math.max(...boxes.map(box => box[4])), dimensions.height, `${name}: LOD ${spacing} retains height`);
            check(boxes.length <= previousBoxes, `${name}: LOD ${spacing} reduces complexity gradually`);
            check(boxes.every(box => box[3] > box[0] && box[4] > box[1] && box[5] > box[2]), `${name}: nonempty LOD boxes`);
            previousBoxes = boxes.length;
        }
    }
}

// Natural geometry across negative/positive chunk edges and a save/load copy.
for (const name of Object.keys(species)) for (const [x, z] of [[15, 15], [-1, -1], [0, -16]]) {
    const shape = buildTree(name, 12345, 1), tree = { x, y: 50, z, species: name, shape }, limits = treeShapeLimits(name), chunks = new Map();
    for (let cx = Math.floor((x - limits.reach) / CHUNK_SIZE); cx <= Math.floor((x + limits.reach) / CHUNK_SIZE); cx++) for (let cz = Math.floor((z - limits.reach) / CHUNK_SIZE); cz <= Math.floor((z + limits.reach) / CHUNK_SIZE); cz++) {
        const chunk = new Chunk(cx, cz);
        for (let lx = 0; lx < CHUNK_SIZE; lx++) for (let lz = 0; lz < CHUNK_SIZE; lz++) chunk.setId(lx, 49, lz, getBlockId('grass'));
        placeTree(chunk, cx * CHUNK_SIZE, cz * CHUNK_SIZE, tree, getBlockId);
        const saved = new Chunk(cx, cz); saved.loadBlocks(chunk.blocks.slice()); chunks.set(`${cx},${cz}`, saved);
    }
    for (const [dx, dy, dz, type] of shape.blocks) {
        const cx = Math.floor((x + dx) / CHUNK_SIZE), cz = Math.floor((z + dz) / CHUNK_SIZE);
        equal(chunks.get(`${cx},${cz}`).getId(x + dx - cx * CHUNK_SIZE, 50 + dy, z + dz - cz * CHUNK_SIZE), getBlockId(type), `${name}: chunk seam and reload`);
    }
}
const world = Object.assign(Object.create(World.prototype), { chunks: new Map(), savedChunks: new Map(), dirtyChunks: new Set(), unsavedChunks: new Set(), version: 0,
    generator: { generateChunk() {} }, light: { initChunk() {}, blockChanged() {}, takeChangedChunks() {} } });
for (const [index, name] of Object.keys(species).entries()) {
    const x = index * 48;
    world.setBlock(x, 49, 0, 'grass'); world.setBlock(x, 50, 0, `${name}_sapling`);
    check(plantTree(world, x, 50, 0, name, 12345, .75) && world.getBlock(x, 50, 0) === `${name}_log`, `${name}: actual sapling becomes trunk`);
    equal(plantTree(world, x, CHUNK_HEIGHT - 5, 32, name, 12345, 1), null, `${name}: cannot grow through world ceiling`);
}
const natural = new RealisticGenerator(42);
for (const [name, gx, gz, x, y, z] of [
    ['ginkgo', 1190, -1188, 4762, 53, -4750],
    ['jacaranda', 302, -812, 1210, 51, -3247]
]) {
    const tree = natural.forests.treeAt(gx, gz);
    equal(tree?.species, name, `${name}: actually selected by natural climate/biome generation`);
    equal([tree.x, tree.y, tree.z], [x, y, z], `${name}: deterministic natural location`);
    const chunk = new Chunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    natural.generateChunk(chunk);
    equal(chunk.getId(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE), getBlockId(`${name}_log`), `${name}: real generated trunk is in the chunk`);
}
console.log(`OK: drzewa 0.85.0 — ${checks} sprawdzeń; dwa gatunki, 417 wcześniejszych kafelków, 17 zestawów bloków i 2500 sylwetek 0.83 bez zmian.`);
