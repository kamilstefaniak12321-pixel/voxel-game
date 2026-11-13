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
//            'shovel' (łopata - ziemia, piasek, żwir, błoto szybciej);
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

    // Zwój kory z okorowanej siekierą brzozy.
    birch_bark: {
        name: 'Birch Bark',
        label: 'Kora brzozowa',
        icon: 'birch_bark'
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

    stick: {
        name: 'Stick',
        label: 'Patyk',
        icon: 'stick'
    }

};


// Przedmioty drzew ze wspólnego katalogu.

for (const pack of TREE_DEFINITIONS) {

    for (const item of Object.values(pack.items)) {

        ITEM_TYPES[item.type] = {
            name: item.label,
            label: item.label,
            icon: item.texture,
            plants: item.plants ? `${pack.id}_sapling` : undefined,
            category: item.category,
            tree: pack.id
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
