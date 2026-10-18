import {
    TREE_GROWTH_SECONDS
} from '../config.js';

// ------------------------------------------------------------
// DRZEWA - bloki sześciu gatunków (z koncepcji Kamila)
//
// Każdy gatunek ma pięć bloków:
//
//   <gatunek>_log           - pień (kora z boku, słoje na górze),
//   <gatunek>_log_stripped  - okorowany pień (siekiera: PPM na pniu),
//   <gatunek>_planks        - deski,
//   <gatunek>_leaves        - liście albo igliwie (model 'leaves':
//                             sześcian z prześwitami, przepuszcza
//                             trochę światła),
//   <gatunek>_sapling       - sadzonka (rośnie w drzewo -
//                             src/game/PlantGrowth.js),
//
// a do tego dodatki (DODATKI niżej): drugi pień sosny (górny,
// pomarańczowy), pień sosny z żywicą, kwitnące liście lipy, opadłe
// liście buka i dębu, wieniec świerkowy. Przedmioty (szyszki,
// żywica, orzeszki, żołędzie, kwiat lipy, kora, siekiera) są
// w src/items/ItemRegistry.js.
//
// Jak drzewa wyglądają w świecie (kształt korony, wysokość) -
// src/world/trees/TreeShapes.js, gdzie rosną - generator terenu
// (src/world/terrain/RealisticGenerator.js, docs/drzewa.md).
//
// Tekstury: wiersze 5-8 atlasu (tools/tekstury_drzew.py).
// ------------------------------------------------------------

// Pola gatunku:
//   firstId - ID pnia; kolejne bloki mają kolejne ID (pień,
//             okorowany pień, deski, liście, sadzonka),
//   name    - nazwa po angielsku,
//   labels  - nazwy po polsku: [pień, okorowany, deski, liście, sadzonka],
//   name_pl - nazwa gatunku (komendy, opisy): [mianownik, dopełniacz],
//   loot    - co czasem wypada z liści w przygodzie: [[co, szansa]],
//   bark    - przedmiot przy okorowaniu siekierą (tylko brzoza).

export const TREE_SPECIES = {

    spruce: {
        firstId: 50,
        name: 'Spruce',
        species: ['Świerk pospolity', 'świerka'],
        short: 'świerk',
        labels: ['Pień świerka', 'Okorowany pień świerka', 'Deski świerkowe', 'Igliwie świerka', 'Sadzonka świerka'],
        loot: [['spruce_sapling', 0.05], ['spruce_cone', 0.08]]
    },

    pine: {
        firstId: 55,
        name: 'Pine',
        species: ['Sosna zwyczajna', 'sosny'],
        short: 'sosna',
        labels: ['Pień sosny', 'Okorowany pień sosny', 'Deski sosnowe', 'Igliwie sosny', 'Sadzonka sosny'],
        loot: [['pine_sapling', 0.05], ['pine_cone', 0.08]]
    },

    beech: {
        firstId: 60,
        name: 'Beech',
        species: ['Buk zwyczajny', 'buka'],
        short: 'buk',
        labels: ['Pień buka', 'Okorowany pień buka', 'Deski bukowe', 'Liście buka', 'Sadzonka buka'],
        loot: [['beech_sapling', 0.05], ['beechnuts', 0.08]]
    },

    linden: {
        firstId: 65,
        name: 'Linden',
        species: ['Lipa drobnolistna', 'lipy'],
        short: 'lipa',
        labels: ['Pień lipy', 'Okorowany pień lipy', 'Deski lipowe', 'Liście lipy', 'Sadzonka lipy'],
        loot: [['linden_sapling', 0.06]]
    },

    oak: {
        firstId: 70,
        name: 'Oak',
        species: ['Dąb szypułkowy', 'dębu'],
        short: 'dąb',
        labels: ['Pień dębu', 'Okorowany pień dębu', 'Deski dębowe', 'Liście dębu', 'Sadzonka dębu'],
        loot: [['oak_sapling', 0.05], ['acorn', 0.1]]
    },

    birch: {
        firstId: 75,
        name: 'Birch',
        species: ['Brzoza brodawkowata', 'brzozy'],
        short: 'brzoza',
        labels: ['Pień brzozy', 'Okorowany pień brzozy', 'Deski brzozowe', 'Liście brzozy', 'Sadzonka brzozy'],
        loot: [['birch_sapling', 0.07]],
        bark: 'birch_bark'
    }

};


export const TREE_NAMES = Object.keys(TREE_SPECIES);


// Nazwy bloków gatunku.

export function treeParts(species) {

    return {
        log: `${species}_log`,
        stripped: `${species}_log_stripped`,
        planks: `${species}_planks`,
        leaves: `${species}_leaves`,
        sapling: `${species}_sapling`
    };

}


// Sadzonka: dwie skrzyżowane płaszczyzny, trochę niższa niż blok.

const SAPLING_SHAPE = { planes: 2, height: 0.95, width: 0.44 };


function speciesBlocks(species, tree) {

    const parts = treeParts(species);

    const [logLabel, strippedLabel, planksLabel, leavesLabel, saplingLabel] = tree.labels;

    const id = tree.firstId;

    return {

        [parts.log]: {
            id,
            name: `${tree.name} Log`,
            label: logLabel,
            tree: species,
            part: 'log',
            sound: 'wood',
            solid: true,
            textures: { top: `${species}_log_top`, side: `${species}_log_side`, bottom: `${species}_log_top` },
            randomRotation: ['top', 'bottom'],
            strip: parts.stripped,
            bark: tree.bark
        },

        [parts.stripped]: {
            id: id + 1,
            name: `Stripped ${tree.name} Log`,
            label: strippedLabel,
            tree: species,
            part: 'stripped',
            sound: 'wood',
            solid: true,
            textures: { top: `${species}_stripped_top`, side: `${species}_stripped_side`, bottom: `${species}_stripped_top` },
            randomRotation: ['top', 'bottom']
        },

        [parts.planks]: {
            id: id + 2,
            name: `${tree.name} Planks`,
            label: planksLabel,
            tree: species,
            part: 'planks',
            sound: 'wood',
            solid: true,
            textures: { all: `${species}_planks` }
        },

        [parts.leaves]: {
            id: id + 3,
            name: `${tree.name} Leaves`,
            label: leavesLabel,
            tree: species,
            part: 'leaves',
            sound: 'plant',
            solid: true,
            opaque: false,
            model: 'leaves',
            textures: { all: `${species}_leaves` },
            randomRotation: ['top', 'bottom', 'left', 'right', 'front', 'back'],
            loot: tree.loot
        },

        [parts.sapling]: {
            id: id + 4,
            name: `${tree.name} Sapling`,
            label: saplingLabel,
            tree: species,
            part: 'sapling',
            solid: false,
            model: 'cross',
            plant: SAPLING_SHAPE,
            textures: { all: `${species}_sapling` },
            grows: { tree: species, seconds: TREE_GROWTH_SECONDS }
        }

    };

}


// ------------------------------------------------------------
// DODATKI
// ------------------------------------------------------------

// Wieniec świerkowy wisi na ścianie: cztery bloki - po jednym na
// każdą stronę, do której jest przyczepiony (attach). W ekwipunku
// jest tylko pierwszy - BlockPlacer.js wybiera właściwy według
// ściany, w którą się kliknęło.

const WREATH_SIDES = {
    north: 'spruce_wreath',
    south: 'spruce_wreath_south',
    east: 'spruce_wreath_east',
    west: 'spruce_wreath_west'
};

const WREATH_IDS = { north: 85, south: 86, east: 87, west: 88 };


function wreathBlocks() {

    const blocks = {};

    for (const [side, type] of Object.entries(WREATH_SIDES)) {

        blocks[type] = {
            id: WREATH_IDS[side],
            name: 'Spruce Wreath',
            label: 'Wieniec świerkowy',
            tree: 'spruce',
            part: 'wreath',
            sound: 'plant',
            solid: false,
            model: 'flat',
            flat: { attach: side },
            wall: WREATH_SIDES,
            textures: { all: 'spruce_wreath' },
            creative: side === 'north',
            drops: WREATH_SIDES.north,
            pick: WREATH_SIDES.north
        };

    }

    return blocks;

}


// Dodatki gatunków. W ekwipunku stoją przy blokach swojego gatunku
// (kolejność: PART_ORDER - np. pień z żywicą tuż za pniem sosny).

const EXTRAS = {

    pine: {

        // Wyżej na pniu sosny kora jest cienka, łuszcząca się, rudo-
        // pomarańczowa (dół pnia - gruba, ciemna, spękana).
        pine_log_upper: {
            id: 80,
            name: 'Pine Log (Upper)',
            label: 'Pień sosny (górny)',
            tree: 'pine',
            part: 'log',
            sound: 'wood',
            solid: true,
            textures: { top: 'pine_log_top', side: 'pine_log_upper_side', bottom: 'pine_log_top' },
            randomRotation: ['top', 'bottom'],
            strip: 'pine_log_stripped'
        },

        // Żywica wycieka z pnia - PPM zbiera kroplę (pień zostaje
        // zwykłym pniem sosny).
        pine_log_resin: {
            id: 81,
            name: 'Pine Log (Resin)',
            label: 'Pień sosny z żywicą',
            tree: 'pine',
            part: 'log',
            sound: 'wood',
            solid: true,
            textures: { top: 'pine_log_top', side: 'pine_log_resin_side', bottom: 'pine_log_top' },
            randomRotation: ['top', 'bottom'],
            drops: 'pine_log',
            strip: 'pine_log_stripped',
            harvest: { item: 'resin', count: [1, 2], becomes: 'pine_log' }
        }

    },

    beech: {

        beech_leaf_litter: {
            id: 83,
            name: 'Beech Leaf Litter',
            label: 'Opadłe liście buka',
            tree: 'beech',
            part: 'litter',
            sound: 'plant',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            textures: { all: 'beech_leaf_litter' },
            randomRotation: ['top']
        }

    },

    linden: {

        // Lipa kwitnie (koniec czerwca, lipiec) - żółte kwiatki między
        // liśćmi. PPM zbiera kwiaty (zostają zwykłe liście).
        linden_leaves_flowering: {
            id: 82,
            name: 'Flowering Linden Leaves',
            label: 'Kwitnące liście lipy',
            tree: 'linden',
            part: 'leaves',
            sound: 'plant',
            solid: true,
            opaque: false,
            model: 'leaves',
            textures: { all: 'linden_leaves_flowering' },
            randomRotation: ['top', 'bottom', 'left', 'right', 'front', 'back'],
            drops: 'linden_leaves',
            loot: TREE_SPECIES.linden.loot,
            harvest: { item: 'linden_flower', count: [1, 2], becomes: 'linden_leaves' }
        }

    },

    oak: {

        oak_leaf_litter: {
            id: 84,
            name: 'Oak Leaf Litter',
            label: 'Opadłe liście dębu',
            tree: 'oak',
            part: 'litter',
            sound: 'plant',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            textures: { all: 'oak_leaf_litter' },
            randomRotation: ['top']
        }

    },

    spruce: wreathBlocks()

};


const PART_ORDER = ['log', 'stripped', 'planks', 'leaves', 'sapling', 'litter', 'wreath'];


// Wszystkie bloki drzew (do BLOCK_TYPES w BlockRegistry.js).

export function treeBlocks() {

    const blocks = {};

    for (const [species, tree] of Object.entries(TREE_SPECIES)) {

        const entries = Object.entries({ ...speciesBlocks(species, tree), ...(EXTRAS[species] ?? {}) });

        entries.sort(([, a], [, b]) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part));

        Object.assign(blocks, Object.fromEntries(entries));

    }

    return blocks;

}
