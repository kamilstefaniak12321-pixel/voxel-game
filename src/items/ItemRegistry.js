import {
    BLOCK_TYPES,
    CREATIVE_BLOCKS,
    blockExists,
    getBlockLabel
} from '../blocks/BlockRegistry.js';

import { TOOL_MATERIALS } from '../config.js';

import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';

import { PLANT_PACKS, plantTile } from '../blocks/plantPacks.js';
import { DYE_ITEMS } from './dyes.js';
import { STONE_TOOL_ITEMS } from './stoneTools.js';
import { barkType } from './bark.js';
import { CLAY_ITEMS } from './clay.js';
import { COOKING_ITEMS } from './cookingData.js';
import { CLOTHING_ITEMS } from './clothing.js';

// ------------------------------------------------------------
// PRZEDMIOTY
//
// W ekwipunku są bloki (BlockRegistry.js) i przedmioty, które nie są
// blokami - np. owoce. Przedmiotu nie da się postawić jak bloku;
// owoc posadzony na ziemi (PPM) daje sadzonkę krzaka.
//
// Pola przedmiotu:
//   name   - nazwa po angielsku
//   label  - nazwa po polsku (pasek, ekwipunek, /daj)
//   icon   - kafelek atlasu z obrazkiem (wiersz 4 i 8 w terrain.png)
//   plants - jaki blok (roślina) staje po posadzeniu - opcjonalne
//   tool   - narzędzie: 'axe' (siekiera - drewno kopie szybciej, PPM
//            na pniu okorowuje go), 'pickaxe' (kilof - skały szybciej),
//            'shovel' (łopata - ziemia, piasek, żwir, błoto szybciej),
//            'knife' (nóż - ścina trawę, kwiaty i zioła);
//            jakie materiały - TOOL_MATERIALS w src/config.js
//   category - kategoria w ekwipunku, księdze przepisów i wiki
//            (src/items/categories.js) - opcjonalne, zwykle sama się
//            dobiera
//
// Skąd się biorą i do czego służą: przepisy (src/crafting/recipes.js),
// sadzenie (plants), łupy z liści i zbiory (BlockRegistry.js).
//
// Przedmioty drzew ze wspólnego katalogu mają stałe identyfikatory
// <gatunek>_<klucz>, np. jablon_jablko.
//
// Nazwy przedmiotów i bloków nie mogą się powtarzać - wszędzie poza
// światem (ekwipunek, /daj) chodzi o tę samą listę.
// ------------------------------------------------------------

import { FIRE_WOODS, fuelType } from '../game/CampfireState.js';

export const ITEM_TYPES = {
    raft: { name: 'Raft', label: 'Tratwa', icon: 'oak_planks', category: 'narzedzia' },
    ...DYE_ITEMS,
    ...STONE_TOOL_ITEMS,
    // Mokre i suche kubki i cegły z trzech glin (1.1.0).
    ...CLAY_ITEMS,
    // Garnek, miska i potrawy (1.20.0, items/cooking.js).
    ...COOKING_ITEMS,
    // Włókna, płótna, sznur i ubrania (1.27.0, items/clothing.js).
    ...CLOTHING_ITEMS,
    ...Object.fromEntries(Object.entries(FIRE_WOODS).map(([wood, [label]]) => [fuelType(wood), {
        name: `${wood} firewood`, label: `Opał — ${label}`, icon: `campfire_${wood}`, category: 'drewno'
    }])),
    fire_starter: { name: 'Fire starter', label: 'Starter ognia', icon: 'stick', category: 'narzedzia' },

    strawberry: {
        name: 'Strawberries',
        label: 'Truskawki',
        icon: 'strawberry',
        plants: 'strawberry_sapling'
    },

    blackberry: {
        name: 'Blackberries',
        label: 'Jeżyny',
        icon: 'blackberry',
        plants: 'blackberry_sapling'
    },

    chili_pepper: {
        name: 'Chili Peppers',
        label: 'Papryczki chili',
        icon: 'chili_pepper',
        plants: 'chili_sapling'
    },

    hazelnut: {
        name: 'Hazelnut',
        label: 'Orzech laskowy',
        icon: 'hazelnut',
        plants: 'hazel_sapling'
    },

    blueberry: {
        name: 'Blueberries',
        label: 'Borówki',
        icon: 'blueberry',
        plants: 'blueberry_sapling'
    },

    // Owoce krzewów jagodowych (1.17.0, src/blocks/shrubs.js; ikonki
    // Kamila z paczki "food_pack_all"). Posadzone na rozgrzebanej ziemi
    // dają sadzonkę krzewu swojej odmiany. Płatki róży i kwiaty bzu
    // zrywa się z kwitnącego krzewu.
    aronia: { name: 'Chokeberries', label: 'Aronia', icon: 'item_aronia', category: 'owoce', plants: 'shrub_aronia_sapling' },
    redcurrant: { name: 'Redcurrants', label: 'Czerwone porzeczki', icon: 'item_redcurrant', category: 'owoce', plants: 'shrub_currant_sapling' },
    blackcurrant: { name: 'Blackcurrants', label: 'Czarne porzeczki', icon: 'item_blackcurrant', category: 'owoce', plants: 'shrub_currant_sapling_black' },
    gooseberry: { name: 'Gooseberries', label: 'Agrest', icon: 'item_gooseberry', category: 'owoce', plants: 'shrub_gooseberry_sapling' },
    red_gooseberry: { name: 'Red Gooseberries', label: 'Czerwony agrest', icon: 'item_red_gooseberry', category: 'owoce', plants: 'shrub_gooseberry_sapling_red' },
    raspberry: { name: 'Raspberries', label: 'Maliny', icon: 'item_raspberry', category: 'owoce', plants: 'shrub_raspberry_sapling' },
    yellow_raspberry: { name: 'Yellow Raspberries', label: 'Żółte maliny', icon: 'item_yellow_raspberry', category: 'owoce', plants: 'shrub_raspberry_sapling_yellow' },
    rose_hip: { name: 'Rose Hips', label: 'Owoce dzikiej róży', icon: 'item_rose_hip', category: 'owoce', plants: 'shrub_dog_rose_sapling' },
    rose_petals: { name: 'Rose Petals', label: 'Płatki dzikiej róży', icon: 'item_rose_petals', category: 'owoce' },
    elderberry: { name: 'Elderberries', label: 'Owoce bzu czarnego', icon: 'item_elderberry', category: 'owoce', plants: 'shrub_elderberry_sapling' },
    elderflower: { name: 'Elderflower', label: 'Kwiat bzu czarnego', icon: 'item_elderflower', category: 'owoce' },
    sea_buckthorn_berry: { name: 'Sea Buckthorn Berries', label: 'Owoce rokitnika', icon: 'item_sea_buckthorn', category: 'owoce', plants: 'shrub_sea_buckthorn_sapling' },

    // Owoce pnączy (1.30.0, blocks/vines.js): sadzi się je PPM przy podporze
    // (mur, kratka, tyczka) na ziemi - GameInteraction.plantVine.
    grapes: { name: 'Grapes', label: 'Winogrona', icon: 'item_grapes', category: 'owoce' },
    hop_cone: { name: 'Hop Cone', label: 'Szyszka chmielu', icon: 'item_hop_cone', category: 'owoce' },
    kiwi: { name: 'Kiwi', label: 'Kiwi', icon: 'item_kiwi', category: 'owoce' },
    passion_fruit: { name: 'Passion Fruit', label: 'Marakuja', icon: 'item_passion_fruit', category: 'owoce' },

    // Fasola i groch (1.31.0, blocks/vines.js) - jednoroczne. Sadzi się je
    // nasionami: suchą fasolą i grochem (PPM w tyczkę, wigwam, siatkę,
    // chrust albo w ziemię). Strąki to świeże warzywo.
    bean_pod: { name: 'Bean Pod', label: 'Strąk fasoli', icon: 'item_bean_pod', category: 'owoce' },
    beans: { name: 'Beans', label: 'Fasola', icon: 'item_beans', category: 'owoce' },
    pea_pod: { name: 'Pea Pod', label: 'Strąk grochu', icon: 'item_pea_pod', category: 'owoce' },
    peas: { name: 'Peas', label: 'Groch', icon: 'item_peas', category: 'owoce' },


    // Dodatki drzew (src/blocks/trees.js). Szyszki, orzeszki, żołędzie
    // i kwiat lipy (z nasionkami na przysadce) posadzone na rozgrzebanej
    // ziemi (od 0.95.0 - docs/uprawa.md) dają sadzonkę. Wypadają z liści w przygodzie.

    spruce_cone: {
        name: 'Spruce Cone',
        label: 'Szyszka świerka',
        icon: 'spruce_cone',
        plants: 'spruce_sapling'
    },

    pine_cone: {
        name: 'Pine Cone',
        label: 'Szyszka sosny',
        icon: 'pine_cone',
        plants: 'pine_sapling'
    },

    // Kropla żywicy z pnia sosny (PPM na pniu z żywicą).
    resin: {
        name: 'Resin',
        label: 'Żywica',
        icon: 'resin'
    },

    beechnuts: {
        name: 'Beechnuts',
        label: 'Orzeszki bukowe',
        icon: 'beechnuts',
        plants: 'beech_sapling'
    },

    // Kwiaty lipy z przysadką (PPM na kwitnących liściach lipy).
    linden_flower: {
        name: 'Linden Flower',
        label: 'Kwiat lipy',
        icon: 'linden_flower',
        plants: 'linden_sapling'
    },

    acorn: {
        name: 'Acorn',
        label: 'Żołądź',
        icon: 'acorn',
        plants: 'oak_sapling'
    },

    // Rośliny niskie (1.19.0, blocks/lowPlants.js - z paczki Kamila
    // "food_pack_all"). Posadzone na rozgrzebanej ziemi dają sadzonkę
    // (truskawkę sadzi się z sadzonki - owoc sadzi krzak z 0.50.0).
    cranberry: { name: 'Cranberries', label: 'Żurawina', icon: 'item_cranberry', category: 'owoce', plants: 'low_cranberry_young' },
    lingonberry: { name: 'Lingonberries', label: 'Borówki brusznice', icon: 'item_lingonberry', category: 'owoce', plants: 'low_lingonberry_young' },
    wild_strawberry: { name: 'Wild Strawberries', label: 'Poziomki', icon: 'item_wild_strawberry', category: 'owoce', plants: 'low_wild_strawberry_young' },
    pumpkin_slice: { name: 'Pumpkin Slice', label: 'Kawałek dyni', icon: 'item_pumpkin_slice', category: 'owoce' },
    pumpkin_seeds: { name: 'Pumpkin Seeds', label: 'Pestki dyni', icon: 'item_pumpkin_seeds', category: 'owoce', plants: 'low_pumpkin_young' },
    zucchini: { name: 'Zucchini', label: 'Cukinia', icon: 'item_zucchini', category: 'owoce', plants: 'low_zucchini_young' },
    roasted_pumpkin_slice: { name: 'Roasted Pumpkin Slice', label: 'Pieczona dynia', icon: 'roasted_pumpkin_slice', category: 'owoce' },
    roasted_zucchini: { name: 'Roasted Zucchini', label: 'Pieczona cukinia', icon: 'roasted_zucchini', category: 'owoce' },

    // Kompost (1.23.0, items/spoilage.js): to, co zostaje z zepsutego jedzenia.
    compost: { name: 'Compost', label: 'Kompost', icon: 'compost', category: 'narzedzia' },
    // Zepsuta potrawa: PPM wysypuje kompost i oddaje miskę.
    compost_bowl: { name: 'Compost in a Bowl', label: 'Kompost w misce', icon: 'compost_bowl', category: 'narzedzia' },

    // Suszone owoce (1.21.0, items/drying.js): z każdego owocu wysuszonego na słońcu.
    dried_fruit: { name: 'Dried Fruit', label: 'Suszone owoce', icon: 'dried_fruit', category: 'owoce' },

    // Pieczone nad ogniskiem (0.97.0 - trzymany PPM z surowym w ręce na
    // płonącym ognisku, game/Campfires.js). Porządny posiłek: jedna
    // sztuka syci jak kilka surowych. Nie da się ich posadzić.
    roasted_apple: { name: 'Roasted Apple', label: 'Pieczone jabłko', icon: 'roasted_apple', category: 'owoce' },
    roasted_hazelnut: { name: 'Roasted Hazelnuts', label: 'Prażone orzechy laskowe', icon: 'roasted_hazelnut', category: 'owoce' },
    roasted_beechnuts: { name: 'Roasted Beechnuts', label: 'Prażone orzeszki bukowe', icon: 'roasted_beechnuts', category: 'owoce' },
    roasted_acorn: { name: 'Roasted Acorn', label: 'Prażony żołądź', icon: 'roasted_acorn', category: 'owoce' },

    // Słoma (0.98.0): z dwóch kęp trawy; cztery dają słomianą pościel
    // (crafting/recipes.js, blocks/bedding.js).
    straw: { name: 'Straw', label: 'Słoma', icon: 'straw', category: 'narzedzia' },

    // Napary (0.98.1, items/foods.js - TEAS, docs/ziola.md): gliniany
    // kubek, kubek ziół (do podgrzania nad ogniskiem) i gotowy napar.
    clay_cup: { name: 'Clay Cup', label: 'Gliniany kubek', icon: 'clay_cup', category: 'narzedzia' },
    brew_calm: { name: 'Cup of Calming Herbs', label: 'Kubek ziół na sen', icon: 'brew_calm', category: 'owoce' },
    brew_heal: { name: 'Cup of Healing Herbs', label: 'Kubek ziół leczniczych', icon: 'brew_heal', category: 'owoce' },
    brew_vigor: { name: 'Cup of Invigorating Herbs', label: 'Kubek ziół wzmacniających', icon: 'brew_vigor', category: 'owoce' },
    tea_calm: { name: 'Calming Infusion', label: 'Napar na sen', icon: 'tea_calm' },
    tea_heal: { name: 'Healing Infusion', label: 'Napar leczniczy', icon: 'tea_heal' },
    tea_vigor: { name: 'Invigorating Infusion', label: 'Napar wzmacniający', icon: 'tea_vigor' },

    // Zwój kory z okorowanej siekierą brzozy. Kora pozostałych drzew
    // dopisuje się niżej sama (od 0.100.0 - items/bark.js).
    birch_bark: {
        name: 'Birch Bark',
        label: 'Kora brzozowa',
        icon: 'birch_bark',
        category: 'drewno'
    },

    // NARZĘDZIA I SUROWCE (wiersz 9 atlasu - tools/tekstury_narzedzi.py).
    // Narzędzia robi się z patyków i skał (src/crafting/recipes.js).

    // PPM siekierą na pniu - okorowany pień (z brzozy jeszcze kora).
    axe: {
        name: 'Axe',
        label: 'Siekiera',
        icon: 'axe',
        tool: 'axe'
    },

    pickaxe: {
        name: 'Pickaxe',
        label: 'Kilof',
        icon: 'pickaxe',
        tool: 'pickaxe'
    },

    shovel: {
        name: 'Shovel',
        label: 'Łopata',
        icon: 'shovel',
        tool: 'shovel'
    },

    // Nóż (0.100.0): ścina trawę, kwiaty i zioła - bez niego nic z nich
    // nie zostaje (BlockRegistry.js: pole cut; zbiór: harvest.tool).
    knife: {
        name: 'Knife',
        label: 'Nóż',
        icon: 'knife',
        tool: 'knife'
    },

    stick: {
        name: 'Stick',
        label: 'Patyk',
        icon: 'stick'
    },

    // Wypalające się pochodnie (1.35.0, items/torchFuel.js).
    // Łuczywo: szczapa żywicznego drewna - podpałka i krótka pochodnia
    // (PPM stawia zwykłą pochodnię z małym zapasem paliwa - GameInteraction.js).
    luczywo: {
        name: 'Fatwood',
        label: 'Łuczywo',
        icon: 'luczywo',
        category: 'swiatlo'
    },

    // Ogarek: wypalona pochodnia. Z żywicą albo oliwkami - znów pochodnia.
    torch_stub: {
        name: 'Torch stub',
        label: 'Ogarek pochodni',
        icon: 'torch_stub',
        category: 'swiatlo'
    }

};


// Kora każdego drzewa, którego pień da się okorować (items/bark.js):
// "Pień dębu" -> "Kora dębu".

for (const definition of Object.values(BLOCK_TYPES)) {

    if (definition.part !== 'log' || !definition.strip || definition.bark) {
        continue;
    }

    const type = barkType(definition.tree);

    ITEM_TYPES[type] ??= {
        name: `${definition.tree} bark`,
        label: definition.label.replace(/^Pień/, 'Kora').replace(/ \(.*\)$| z żywicą$/, ''),
        icon: type,
        category: 'drewno',
        tree: definition.tree
    };

}


// Przedmioty drzew ze wspólnego katalogu.

for (const pack of TREE_DEFINITIONS) {

    for (const item of Object.values(pack.items)) {

        ITEM_TYPES[item.type] = {
            name: item.label,
            label: item.label,
            icon: item.texture,
            plants: item.plants ? `${pack.id}_sapling` : undefined,
            category: item.category,
            tree: pack.id,
            // false - nie spada z drzewa jako cząsteczka (szyszki jodły,
            // kwiaty, puch): TreeParticles.fruitOf.
            falls: item.falls !== false
        };

    }

}


// Przedmioty z paczek roślin (src/blocks/plantPacks.js): <roślina>_<klucz>,
// np. amarantus_wiecha.

for (const pack of PLANT_PACKS) {

    if (pack.item) {

        ITEM_TYPES[pack.item.type] = {
            name: pack.item.name,
            label: pack.item.label,
            icon: plantTile(pack, pack.item.file),
            category: pack.item.category,
            plantPack: pack.id
        };

    }

}


for (const [type, item] of Object.entries(ITEM_TYPES)) {

    if (type in BLOCK_TYPES) {
        throw new Error(`Przedmiot "${type}" ma taką samą nazwę jak blok`);
    }

    if (item.plants && !blockExists(item.plants)) {
        throw new Error(`Przedmiot "${type}": nieznana roślina "${item.plants}"`);
    }

    if (item.tool && !Object.hasOwn(TOOL_MATERIALS, item.tool)) {
        throw new Error(`Przedmiot "${type}": nieznane narzędzie "${item.tool}" (TOOL_MATERIALS w config.js)`);
    }

}


// Łupy, kora i zbiory bloków muszą istnieć (literówka = błąd od razu).

for (const definition of Object.values(BLOCK_TYPES)) {

    const drops = [
        ...(definition.loot ?? []).map(([drop]) => drop),
        definition.bark,
        definition.harvest?.item
    ].filter(Boolean);

    for (const drop of drops) {

        if (!blockExists(drop) && !Object.hasOwn(ITEM_TYPES, drop)) {
            throw new Error(`Blok "${definition.name}": nieznany przedmiot "${drop}"`);
        }

    }

}

// Stare nazwy (z wersji 0.4.0, gdy truskawki były malinami,
// a papryczki chili porzeczkami) -> nowe. Ekwipunek z zapisu
// przechodzi przez currentType, więc nic nie ginie.

const RENAMED = {
    raspberry: 'strawberry',
    currants: 'chili_pepper'
};

for (const stage of ['sapling', 'bush', 'bush_few', 'bush_full']) {
    RENAMED[`raspberry_${stage}`] = `strawberry_${stage}`;
    RENAMED[`currant_${stage}`] = `chili_${stage}`;
}


export function currentType(type) {

    return Object.hasOwn(RENAMED, type ?? '') ? RENAMED[type] : type;

}

// ------------------------------------------------------------

// Narzędzie w ręce ('axe', 'pickaxe', 'shovel') albo null.

export function getTool(type) {

    return isItemType(type) ? ITEM_TYPES[type].tool ?? null : null;

}


// Przedmiot, który nie jest blokiem (np. owoc).

export function isItemType(type) {

    return Object.hasOwn(ITEM_TYPES, type ?? '');

}


// Blok albo przedmiot - wszystko, co może leżeć w ekwipunku.

export function itemExists(type) {

    return (blockExists(type) && BLOCK_TYPES[type].inventory !== false) || isItemType(type);

}


// Nazwa po polsku (bloku albo przedmiotu).

export function getItemLabel(type) {

    return isItemType(type) ? ITEM_TYPES[type].label : getBlockLabel(type);

}


// Jaki blok staje po kliknięciu PPM z tym w ręce: blok - on sam,
// owoc - sadzonka (tylko na rozgrzebanej ziemi - Game.canPlantAt),
// inny przedmiot - nic (null).

export function getPlacedBlock(type) {

    if (isItemType(type)) {
        return ITEM_TYPES[type].plants ?? null;
    }

    return itemExists(type) ? type : null;

}


// Wszystko w zakładce kreatywnej: bloki, potem przedmioty.

export const CREATIVE_ITEMS = [...CREATIVE_BLOCKS, ...Object.keys(ITEM_TYPES)];
