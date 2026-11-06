// ------------------------------------------------------------
// DANE DO WIKI (wywołuje je tools/wiki.py)
//
// Czyta rejestry gry (bloki, przedmioty, kategorie, przepisy,
// osiągnięcia) i wypisuje wszystko jako JSON na standardowe wyjście.
// Nic nie zapisuje. Sam: node tools/wiki_dane.mjs > dane.json
//
// Moduły, które potrzebują three.js (atlas tekstur), nie wczytają się
// w Node - pozycje kafelków atlasu czytamy więc wprost z tekstu
// src/rendering/TextureAtlas.js, a ścianę bloku dobieramy tak samo jak
// getFaceTexture w BlockRenderData.js. Tekstury drzew z paczek
// (assets/drzewa/) mają w "tiles" ścieżkę pliku zamiast pozycji.
// ------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { modelIconData } from './model_icon.mjs';
import { STONE_TOOL_TEXTURES } from '../src/rendering/StoneToolTextures.js';
import { PINE_BARK_TEXTURES } from '../src/rendering/WoodAtlasTextures.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const src = (file) => new URL(`../src/${file}`, import.meta.url).href;

const R = await import(src('blocks/BlockRegistry.js'));
const I = await import(src('items/ItemRegistry.js'));
const C = await import(src('items/categories.js'));
const K = await import(src('crafting/Crafting.js'));
const { GROUPS } = await import(src('crafting/recipes.js'));
const A = await import(src('achievements/list.js'));
const { TOOL_MATERIALS, TOOL_SPEED } = await import(src('config.js'));
const { TREE_SPECIES } = await import(src('blocks/trees.js'));
const { PACK_TEXTURES, TREE_PACKS } = await import(src('blocks/treePacks.js'));
const { PLANT_TEXTURES, PLANT_PACKS } = await import(src('blocks/plantPacks.js'));
const { getRiverPlantFaces } = await import(src('rendering/RiverPlantGeometry.js'));
const { pixelPlantIconPixels } = await import(src('ui/PixelPlantIcon.js'));
const { getItemModel: getFruitItemModel } = await import(src('rendering/ItemGeometry.js'));

function fruitIcon(type) {
    const fruit = getFruitItemModel(type);
    return fruit ? modelIconData(fruit.faces, fruit.texture) : null;
}


// Kafelki atlasu: obiekt ATLAS_TILES z TextureAtlas.js (sam literał).

function atlasTiles() {

    const text = readFileSync(path.join(ROOT, 'src/rendering/TextureAtlas.js'), 'utf8');

    const start = text.indexOf('export const ATLAS_TILES = {');

    const open = text.indexOf('{', start);

    let depth = 0;
    let end = open;

    for (; end < text.length; end++) {

        if (text[end] === '{') depth++;
        if (text[end] === '}') depth--;

        if (depth === 0) {
            break;
        }

    }

    const literal = text.slice(open, end + 1);

    const tiles = new Function(`return (${literal});`)();

    for (const [name, texture] of Object.entries(PACK_TEXTURES)) {
        tiles[name] = { file: `assets/drzewa/${texture.pack}/${texture.file}` };
    }

    // Obrazki paczek roślin (dowolny rozmiar; region - większy niż jeden
    // kafelek, paczka tekstur go jeszcze nie zmienia).
    for (const [name, texture] of Object.entries(PLANT_TEXTURES)) {
        tiles[name] = {
            file: `assets/rosliny/${texture.pack}/${texture.file}`,
            sprite: true,
            region: texture.width > 16 || texture.height > 16
        };
    }

    // Exported from the game's actual canvas atlas by the texture browser
    // check, so documentation and downloadable packs use the same pixels.
    for (const { name } of [...PINE_BARK_TEXTURES, ...STONE_TOOL_TEXTURES]) {
        tiles[name] = { file: `assets/textures/derived/${name}.png` };
    }
    return tiles;

}


function faceTexture(textures, face) {

    if (textures.all) return textures.all;
    if (textures[face]) return textures[face];
    if (['right', 'left', 'front', 'back'].includes(face)) return textures.side;
    return textures[face];

}


const TOOL_LABELS = { axe: 'Siekiera', pickaxe: 'Kilof', shovel: 'Łopata' };

const SOUND_LABELS = {
    grass: 'trawa', dirt: 'ziemia', stone: 'kamień', sand: 'piasek', gravel: 'żwir',
    mud: 'błoto', plant: 'rośliny', glass: 'szkło', wood: 'drewno'
};


// Skąd się bierze każda rzecz (poza przepisami i terenem).

const sources = new Map();

function addSource(type, text) {

    if (!type) {
        return;
    }

    if (!sources.has(type)) {
        sources.set(type, []);
    }

    if (!sources.get(type).includes(text)) {
        sources.get(type).push(text);
    }

}


const blockTypes = Object.keys(R.BLOCK_TYPES);

for (const type of blockTypes) {

    const definition = R.BLOCK_TYPES[type];

    const label = R.getBlockLabel(type);

    const drop = R.getDropType(type);

    if (drop && drop !== type) {
        addSource(drop, `zniszczony blok: ${label}`);
    }

    for (const [item, chance] of definition.loot ?? []) {
        addSource(item, `czasem z bloku: ${label} (${Math.round(chance * 100)}%)`);
    }

    if (definition.harvest) {
        addSource(definition.harvest.item, `zbiór (PPM): ${label}`);
    }

    if (definition.strip) {
        addSource(definition.strip, `siekierą (PPM) z bloku: ${label}`);
    }

    if (definition.bark) {
        addSource(definition.bark, `okorowanie siekierą: ${label}`);
    }

    if (definition.grows?.into) {
        addSource(definition.grows.into, `wyrasta z: ${label}`);
    }

}

for (const [type, item] of Object.entries(I.ITEM_TYPES)) {

    if (item.plants) {
        addSource(item.plants, `posadzony przedmiot: ${item.label}`);
    }

}


function recipeRefs(type) {

    return {
        madeBy: K.recipesFor(type).map((recipe) => recipe.id),
        usedIn: K.recipesUsing(type).map((recipe) => recipe.id)
    };

}


const blocks = blockTypes.map((type) => {

    const definition = R.BLOCK_TYPES[type];

    const model = definition.model ?? 'cube';

    const textures = definition.textures;

    const tool = R.getBestTool(type);

    const time = R.getBreakTime(type);

    return {
        type,
        name: definition.name,
        label: R.getBlockLabel(type),
        category: C.getCategory(type),
        model,
        creative: definition.creative !== false,
        icon: definition.riverPlant && (definition.bush || definition.riverPlant.kind.startsWith('fruitBush:'))
            ? modelIconData(getRiverPlantFaces(definition.riverPlant.kind, 0), definition.riverPlant.texture)
            : definition.modelIcon ? { kind: 'file', file: definition.modelIcon } : definition.riverPlant?.tuft
            // Mała roślina z pikseli - gotowe piksele 64 x 64 (jak w grze).
            ? { kind: 'pixels', size: 64, data: Buffer.from(pixelPlantIconPixels(getRiverPlantFaces(definition.riverPlant.kind, 0, false, definition.riverPlant.tuft), 64)).toString('base64') }
            : model === 'cross' || model === 'flat'
                ? { kind: 'flat', tile: faceTexture(textures, 'front') }
                : { kind: 'cube', top: faceTexture(textures, 'top'), front: faceTexture(textures, 'front'), right: faceTexture(textures, 'right') },
        light: definition.light ?? 0,
        lightColor: definition.lightColor ?? null,
        sound: SOUND_LABELS[R.getBlockSound(type)] ?? null,
        liquid: Boolean(definition.liquid),
        solid: definition.solid !== false,
        breakTime: Math.round(time * 100) / 100,
        tool,
        toolLabel: tool ? TOOL_LABELS[tool] : null,
        toolTime: tool ? Math.round(R.getBreakTime(type, tool) * 100) / 100 : null,
        drops: R.getDropType(type),
        loot: (definition.loot ?? []).map(([item, chance]) => ({ item, chance })),
        harvest: definition.harvest ? { item: definition.harvest.item, count: definition.harvest.count } : null,
        strip: definition.strip ?? null,
        bark: definition.bark ?? null,
        grows: definition.grows ? { ...definition.grows } : null,
        tree: definition.tree ? TREE_SPECIES[definition.tree]?.species?.[0] ?? definition.tree : null,
        pack: definition.pack ?? null,
        sources: sources.get(type) ?? [],
        ...recipeRefs(type)
    };

});


const items = Object.entries(I.ITEM_TYPES).map(([type, item]) => ({
    type,
    name: item.name,
    label: item.label,
    category: C.getCategory(type),
    icon: fruitIcon(type) ?? { kind: 'flat', tile: item.icon },
    plants: item.plants ?? null,
    plantsLabel: item.plants ? R.getBlockLabel(item.plants) : null,
    tool: item.tool ?? null,
    pack: item.pack ?? null,
    toolMaterials: item.tool ? TOOL_MATERIALS[item.tool].map((material) => SOUND_LABELS[material] ?? material) : null,
    sources: sources.get(type) ?? [],
    ...recipeRefs(type)
}));


// Material aliases are real craftable results. Include them in the wiki's
// recipe index so each new tool's madeBy reference resolves to its own rock.
const wikiRecipes = [...K.RECIPE_LIST, ...STONE_TOOL_TEXTURES.map(({ name }) => K.getRecipe(name))];
const recipes = wikiRecipes.map((recipe) => ({
    id: recipe.id,
    result: { type: recipe.result[0], count: recipe.result[1], label: I.getItemLabel(recipe.result[0]) },
    category: K.recipeCategory(recipe),
    shaped: Boolean(recipe.pattern),
    cells: K.recipeCells(recipe).map((spec) => spec && {
        spec,
        label: K.ingredientLabel(spec),
        icon: K.ingredientIcon(spec)
    }),
    ingredients: K.recipeIngredients(recipe).map(({ spec, count }) => ({
        spec, count, label: K.ingredientLabel(spec), icon: K.ingredientIcon(spec)
    })),
    note: recipe.note ?? null,
    text: K.recipeText(recipe)
}));


const groups = Object.fromEntries(Object.entries(GROUPS).map(([name, group]) => [name, {
    label: group.label,
    icon: group.icon ?? group.types[0],
    types: group.types,
    labels: group.types.map((type) => I.getItemLabel(type))
}]));


const achievements = A.ACHIEVEMENTS.map((achievement) => ({
    id: achievement.id,
    tier: achievement.tier,
    title: achievement.title,
    task: achievement.task,
    comment: achievement.comment,
    icon: achievement.icon,
    secret: Boolean(achievement.secret),
    goal: achievement.goal ?? null
}));


const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));


const data = {
    version: pkg.version,
    categories: C.CATEGORY_ORDER.map((id) => ({ id, ...C.CATEGORIES[id] })),
    tiers: Object.fromEntries(A.TIER_ORDER.map((tier) => [tier, A.TIERS[tier]])),
    tools: Object.fromEntries(Object.entries(TOOL_MATERIALS).map(([tool, materials]) => [tool, {
        label: TOOL_LABELS[tool],
        materials: materials.map((material) => SOUND_LABELS[material] ?? material),
        speed: TOOL_SPEED
    }])),
    tiles: atlasTiles(),
    packs: TREE_PACKS.map((pack) => ({ id: pack.id, name: pack.species[0], firstId: pack.firstId })),
    blocks,
    items,
    recipes,
    groups,
    achievements
};

process.stdout.write(JSON.stringify(data, null, 1));
