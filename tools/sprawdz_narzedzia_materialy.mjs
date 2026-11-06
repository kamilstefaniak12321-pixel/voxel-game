import assert from 'node:assert/strict';
import { STONE_TOOL_MATERIALS, STONE_TOOL_KINDS, stoneToolType } from '../src/items/stoneTools.js';
import { ITEM_TYPES, CREATIVE_ITEMS, getTool } from '../src/items/ItemRegistry.js';
import { getBreakTime } from '../src/blocks/BlockRegistry.js';
import { Inventory } from '../src/game/Inventory.js';
import { FIRE_WOODS } from '../src/game/CampfireState.js';
import { getRecipe, recipesFor, gridResult, fillGrid, maxCrafts, stockOf, craftAll, craftFromInventory } from '../src/crafting/Crafting.js';
import { ACHIEVEMENTS } from '../src/achievements/list.js';
import { STONE_TOOL_TEXTURES, stoneToolPixels, drawStoneToolTextures } from '../src/rendering/StoneToolTextures.js';

let checks = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// Every legal translation and reflection must craft the material in its head.
for (const tool of STONE_TOOL_KINDS) for (const material of STONE_TOOL_MATERIALS) {
    const type = stoneToolType(tool, material.stone), recipe = getRecipe(tool);
    equal(getTool(type), tool, `${type}: same interactions`);
    check(CREATIVE_ITEMS.includes(type), `${type}: creative inventory`);
    equal(getBreakTime(tool === 'axe' ? 'oak_log' : tool === 'pickaxe' ? 'granite' : 'dirt', getTool(type)),
        getBreakTime(tool === 'axe' ? 'oak_log' : tool === 'pickaxe' ? 'granite' : 'dirt', tool), `${type}: unchanged speed`);
    for (let y = 0; y <= 2 - recipe.shape.height; y++) for (let x = 0; x <= 2 - recipe.shape.width; x++) {
        for (const mirror of [false, true]) {
            const grid = Array(4).fill(null);
            for (const cell of recipe.shape.cells) {
                const column = mirror ? recipe.shape.width - 1 - cell.col : cell.col;
                grid[(y + cell.row) * 2 + x + column] = { type: cell.spec === 'stick' ? 'stick' : material.stone, count: 3 };
            }
            equal(gridResult(grid)?.type, type, `${type}: translated/mirrored result`);
        }
    }
    const saved = Inventory.load({ inventory: { slots: [{ type, count: 2 }], craft: [{ type, count: 1 }] } }, 'adventure');
    equal(saved.slots[0], { type, count: 2 }, `${type}: inventory reload`);
    equal(saved.craft[0], { type, count: 1 }, `${type}: crafting reload`);
    if (material.stone !== 'stone') {
        const specific = getRecipe(type);
        equal(recipesFor(type)[0], specific, `${type}: recipe lookup`);
        const inventory = Inventory.load({}, 'adventure');
        inventory.add('stone', 40); inventory.add(material.stone, 4); inventory.add('stick', 4);
        let reported = null;
        equal(craftFromInventory(inventory, specific, 1, result => { reported = result; }), 1, `${type}: command craft`);
        equal(reported?.type, type, `${type}: command reports actual result`);
        check(inventory.slots.some(item => item?.type === type), `${type}: requested stone wins over more plentiful stone`);
    }
}

equal(gridResult(['granite', 'basalt', 'granite', 'stick'])?.type, 'axe', 'mixed axe preserves legacy recipe');
equal(gridResult(['granite', 'limestone', null, 'stick'])?.type, 'pickaxe', 'mixed pickaxe preserves legacy recipe');
for (const name of ['constructor', '__proto__', 'axe_unknown', null]) {
    equal(getRecipe(name), null, 'unknown recipe name never becomes a material alias');
    equal(recipesFor(name), [], 'unknown item has no material recipe');
}

// Generic recipe autoplace still uses existing stocks, and the result callback
// used by /wytworz and achievements reports the actual material item.
const auto = Inventory.load({}, 'adventure'); auto.add('basalt', 6); auto.add('stick', 4);
let reported = null;
equal(craftFromInventory(auto, getRecipe('pickaxe'), 2, result => { reported = result; }), 2, 'generic command crafts twice');
equal(reported?.type, 'pickaxe_basalt', 'generic command reports basalt');

for (const wood of Object.keys(FIRE_WOODS)) for (const material of STONE_TOOL_MATERIALS) {
    const inventory = Inventory.load({}, 'adventure');
    const axe = stoneToolType('axe', material.stone), recipe = getRecipe(`${wood}_firewood`);
    inventory.add(`${wood}_log`, 7); inventory.add(axe, 1);
    equal(maxCrafts(recipe, stockOf(inventory)), 7, `${wood}/${axe}: one axe supports all crafts`);
    equal(fillGrid(inventory, recipe, 7), 7, `${wood}/${axe}: fill`);
    equal(inventory.craft.find(item => item?.type === axe)?.count, 1, `${axe}: only one catalyst placed`);
    equal(craftAll(inventory)[1], 7, `${wood}/${axe}: craft all`);
    equal(inventory.craft.find(item => item?.type === axe)?.count, 1, `${axe}: catalyst retained`);
    equal(inventory.slots.reduce((n, item) => n + (item?.type === `${wood}_firewood` ? item.count : 0), 0), 28, 'four fuel per log');
}

const full = Inventory.load({}, 'adventure');
full.slots.fill({ type: 'stone', count: 64 });
full.craft[0] = { type: 'oak_log', count: 2 }; full.craft[1] = { type: 'axe_granite', count: 1 };
const before = JSON.stringify(full.data);
equal(craftAll(full)[1], 0, 'full inventory rejects fuel');
equal(JSON.stringify(full.data), before, 'full inventory preserves ingredients and catalyst');

const achievement = ACHIEVEMENTS.find(entry => entry.id === 'tool_set');
const collected = new Set(), book = { collect: (key, type) => { equal(key, 'tools', 'stable achievement key'); collected.add(type); return collected.size; } };
equal(achievement.when({ type: 'axe_granite' }, book), false, 'first tool class');
equal(achievement.when({ type: 'axe_basalt' }, book), false, 'another axe does not complete a class');
equal(achievement.when({ type: 'pickaxe_limestone' }, book), false, 'second tool class');
equal(achievement.when({ type: 'shovel_sandstone' }, book), true, 'three material tool classes unlock achievement');
equal([...collected], ['axe', 'pickaxe', 'shovel'], 'achievement remains compatible with existing progress');

equal(STONE_TOOL_TEXTURES.length, 15, 'fifteen additional texture variants');
for (const spec of STONE_TOOL_TEXTURES) equal(ITEM_TYPES[spec.name]?.icon, spec.name, 'registry uses generated texture');

// Independent texture contract: all alpha and every wooden/coloured pixel
// remain exact, while neutral stone responds to the supplied rock palette.
for (const size of [16, 32]) {
    const source = new Uint8ClampedArray(size * size * 4), material = new Uint8ClampedArray(source.length);
    const pixels = [[112, 76, 44, 255], [150, 104, 60, 255], [97, 99, 105, 255], [15, 72, 28, 255], [130, 132, 136, 120], [17, 18, 19, 0]];
    for (let i = 0; i < source.length; i += 4) { source.set(pixels[(i / 4) % pixels.length], i); material.set([180, 120, 80, 255], i); }
    const output = stoneToolPixels(source, material, size);
    for (let i = 0; i < source.length; i += 4) {
        equal(output[i + 3], source[i + 3], 'alpha and silhouette preserved');
        const kind = (i / 4) % pixels.length;
        if ([0, 1, 3, 5].includes(kind)) equal([...output.slice(i, i + 4)], [...source.slice(i, i + 4)], 'wood / coloured / transparent pixels unchanged');
        else check(output[i] > output[i + 1] && output[i + 1] > output[i + 2], 'stone follows warm rock palette');
    }
    let writes = 0;
    const tiles = Object.fromEntries([...new Set(STONE_TOOL_TEXTURES.flatMap(s => [s.name, s.sourceTexture, s.materialTexture]))].map((name, i) => [name, { x: i, y: 0 }]));
    const excluded = new Set(['axe_granite', 'shovel_basalt']);
    const context = {
        getImageData: (_x, _y, w, h) => { equal([w, h], [size, size], 'pack resolution sampled'); return { data: source }; },
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
        putImageData: (_image, x, y) => { check(![...excluded].some(name => tiles[name].x * size === x && tiles[name].y * size === y), 'explicit variant override preserved'); writes++; }
    };
    drawStoneToolTextures(context, tiles, size, excluded);
    equal(writes, 13, 'only variants without explicit override generated');
}

console.log(`OK: kamienne narzędzia — ${checks} kontroli materiału, zapisu, craftingu, katalizatorów, osiągnięć i tekstur.`);
