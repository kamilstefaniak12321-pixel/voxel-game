import {
    BLOCK_TYPES,
    CREATIVE_BLOCKS,
    blockExists,
    getBlockLabel
} from '../blocks/BlockRegistry.js';

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
//   icon   - kafelek atlasu z obrazkiem (wiersz 4 w terrain.png)
//   plants - jaki blok (roślina) staje po posadzeniu - opcjonalne
//
// Nazwy przedmiotów i bloków nie mogą się powtarzać - wszędzie poza
// światem (ekwipunek, /daj) chodzi o tę samą listę.
// ------------------------------------------------------------

export const ITEM_TYPES = {

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
    }

};


for (const [type, item] of Object.entries(ITEM_TYPES)) {

    if (type in BLOCK_TYPES) {
        throw new Error(`Przedmiot "${type}" ma taką samą nazwę jak blok`);
    }

    if (item.plants && !blockExists(item.plants)) {
        throw new Error(`Przedmiot "${type}": nieznana roślina "${item.plants}"`);
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

// Przedmiot, który nie jest blokiem (np. owoc).

export function isItemType(type) {

    return Object.hasOwn(ITEM_TYPES, type ?? '');

}


// Blok albo przedmiot - wszystko, co może leżeć w ekwipunku.

export function itemExists(type) {

    return blockExists(type) || isItemType(type);

}


// Nazwa po polsku (bloku albo przedmiotu).

export function getItemLabel(type) {

    return isItemType(type) ? ITEM_TYPES[type].label : getBlockLabel(type);

}


// Jaki blok staje po kliknięciu PPM z tym w ręce: blok - on sam,
// owoc - sadzonka, inny przedmiot - nic (null).

export function getPlacedBlock(type) {

    if (isItemType(type)) {
        return ITEM_TYPES[type].plants ?? null;
    }

    return blockExists(type) ? type : null;

}


// Wszystko w zakładce kreatywnej: bloki, potem przedmioty.

export const CREATIVE_ITEMS = [...CREATIVE_BLOCKS, ...Object.keys(ITEM_TYPES)];
