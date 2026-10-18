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
//   icon   - kafelek atlasu z obrazkiem (wiersz 4 i 8 w terrain.png)
//   plants - jaki blok (roślina) staje po posadzeniu - opcjonalne
//   tool   - narzędzie: 'axe' (siekiera - PPM na pniu okorowuje go,
//            src/game/Game.js)
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
    },


    // Dodatki drzew (src/blocks/trees.js). Szyszki, orzeszki, żołędzie
    // i kwiat lipy (z nasionkami na przysadce) posadzone na ziemi
    // dają sadzonkę. Wypadają z liści w przygodzie.

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

    // PPM siekierą na pniu - okorowany pień (z brzozy jeszcze kora).
    axe: {
        name: 'Axe',
        label: 'Siekiera',
        icon: 'axe',
        tool: 'axe'
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

// Narzędzie w ręce ('axe') albo null.

export function getTool(type) {

    return isItemType(type) ? ITEM_TYPES[type].tool ?? null : null;

}


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
