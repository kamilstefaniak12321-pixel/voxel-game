import {
    TREE_GROWTH_SECONDS
} from '../config.js';

import { TREE_PACKS, PACK_SLOT, packTile } from './treePacks.js';

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
//
// Nowe gatunki można dodawać bez pisania kodu - jako paczki drzew
// (folder w assets/drzewa/, src/blocks/treePacks.js, instrukcja:
// docs/drzewa-paczki.md). Ich bloki powstają tutaj, tak samo jak bloki
// sześciu gatunków gry (PACK_BLOCKS niżej).
// ------------------------------------------------------------

// Pola gatunku:
//   firstId - ID pnia; kolejne bloki mają kolejne ID (pień,
//             okorowany pień, deski, liście, sadzonka),
//   name    - nazwa po angielsku,
//   labels  - nazwy po polsku: [pień, okorowany, deski, liście, sadzonka],
//   name_pl - nazwa gatunku (komendy, opisy): [mianownik, dopełniacz],
//   loot    - co czasem wypada z liści w przygodzie: [[co, szansa]],
//   bark    - przedmiot przy okorowaniu siekierą (tylko brzoza),
//   pack    - paczka drzewa (tylko gatunki z assets/drzewa/).

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


// Sześć gatunków samej gry (lasy w generatorze terenu, daleki teren,
// osiągnięcie "Leśniczy" - bez gatunków z paczek).

export const BASE_TREE_NAMES = Object.keys(TREE_SPECIES);


// Gatunki z paczek (assets/drzewa/) dochodzą na koniec listy.

for (const pack of TREE_PACKS) {

    TREE_SPECIES[pack.id] = {
        firstId: pack.firstId,
        name: pack.name,
        species: pack.species,
        short: pack.short,
        labels: [pack.labels.pien, pack.labels.okorowany, pack.labels.deski, pack.labels.liscie, pack.labels.sadzonka],
        loot: pack.loot,
        bark: pack.bark ?? undefined,
        pack
    };

}


export const TREE_NAMES = Object.keys(TREE_SPECIES);


// Czy gatunek jest z paczki drzewa.

export function isPackTree(species) {

    return Boolean(TREE_SPECIES[species]?.pack);

}


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

// Liście: tekstura losowo obrócona na każdej ścianie.

const LEAF_ROTATION = ['top', 'bottom', 'left', 'right', 'front', 'back'];


// Tekstury bloków gatunku: gatunki gry - kafelki "<gatunek>_log_top"...,
// paczki - pliki PNG z folderu paczki.

function speciesTextures(species, tree) {

    const pack = tree.pack;

    if (!pack) {

        return {
            logTop: `${species}_log_top`,
            logSide: `${species}_log_side`,
            strippedTop: `${species}_stripped_top`,
            strippedSide: `${species}_stripped_side`,
            planks: `${species}_planks`,
            leaves: `${species}_leaves`,
            sapling: `${species}_sapling`
        };

    }

    const tile = (key) => packTile(pack, pack.textures[key]);

    return {
        logTop: tile('pien_gora'),
        logSide: tile('pien_bok'),
        strippedTop: tile('okorowany_gora'),
        strippedSide: tile('okorowany_bok'),
        planks: tile('deski'),
        leaves: tile('liscie'),
        sapling: tile('sadzonka')
    };

}


function speciesBlocks(species, tree) {

    const parts = treeParts(species);

    const [logLabel, strippedLabel, planksLabel, leavesLabel, saplingLabel] = tree.labels;

    const id = tree.firstId;

    const textures = speciesTextures(species, tree);

    const pack = tree.pack?.id;

    return {

        [parts.log]: {
            id,
            name: `${tree.name} Log`,
            label: logLabel,
            tree: species,
            pack,
            part: 'log',
            sound: 'wood',
            solid: true,
            textures: { top: textures.logTop, side: textures.logSide, bottom: textures.logTop },
            randomRotation: ['top', 'bottom'],
            strip: parts.stripped,
            bark: tree.bark
        },

        [parts.stripped]: {
            id: id + 1,
            name: `Stripped ${tree.name} Log`,
            label: strippedLabel,
            tree: species,
            pack,
            part: 'stripped',
            sound: 'wood',
            solid: true,
            textures: { top: textures.strippedTop, side: textures.strippedSide, bottom: textures.strippedTop },
            randomRotation: ['top', 'bottom']
        },

        [parts.planks]: {
            id: id + 2,
            name: `${tree.name} Planks`,
            label: planksLabel,
            tree: species,
            pack,
            part: 'planks',
            sound: 'wood',
            solid: true,
            textures: { all: textures.planks }
        },

        [parts.leaves]: {
            id: id + 3,
            name: `${tree.name} Leaves`,
            label: leavesLabel,
            tree: species,
            pack,
            part: 'leaves',
            sound: 'plant',
            solid: true,
            opaque: false,
            model: 'leaves',
            textures: { all: textures.leaves },
            randomRotation: LEAF_ROTATION,
            loot: tree.loot
        },

        [parts.sapling]: {
            id: id + 4,
            name: `${tree.name} Sapling`,
            label: saplingLabel,
            tree: species,
            pack,
            part: 'sapling',
            solid: false,
            model: 'cross',
            plant: SAPLING_SHAPE,
            textures: { all: textures.sapling },
            grows: { tree: species, seconds: tree.pack?.growthSeconds ?? TREE_GROWTH_SECONDS }
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
            randomRotation: LEAF_ROTATION,
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


// ------------------------------------------------------------
// DODATKI PACZEK DRZEW (assets/drzewa/)
//
// Opadłe liście (jeśli paczka je ma) i odmiany liści. Odmiana z "zbior"
// (np. liście z jabłkami): PPM zbiera przedmiot, a liście zamieniają się
// w "odrastające" - wyglądają jak zwykłe liście i po "odrasta" sekundach
// (średnio) znów są odmianą. Bez "odrasta" - po zbiorze zostają zwykłe
// liście. Odmiany i opadłe liście zniszczone w przygodzie dają zwykłe
// liście (i zbiór, jeśli był).
// ------------------------------------------------------------

export function packVariantType(species, key) {

    return `${species}_leaves_${key}`;

}


function packExtras(pack) {

    const species = pack.id;

    const parts = treeParts(species);

    const tile = (file) => packTile(pack, file);

    const blocks = {};


    if (pack.textures.opadleLiscie) {

        blocks[`${species}_leaf_litter`] = {
            id: pack.firstId + PACK_SLOT.litter,
            name: `${pack.name} Leaf Litter`,
            label: pack.labels.opadleLiscie,
            tree: species,
            pack: species,
            part: 'litter',
            sound: 'plant',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            textures: { all: tile(pack.textures.opadleLiscie) },
            randomRotation: ['top']
        };

    }


    pack.variants.forEach((variant, i) => {

        const type = packVariantType(species, variant.key);

        const regrowing = `${type}_growing`;

        const id = pack.firstId + PACK_SLOT.variants + i * 2;

        blocks[type] = {
            id,
            name: `${pack.name} Leaves (${variant.key})`,
            label: variant.label,
            tree: species,
            pack: species,
            part: 'leaves',
            sound: 'plant',
            solid: true,
            opaque: false,
            model: 'leaves',
            textures: { all: tile(variant.texture) },
            randomRotation: LEAF_ROTATION,
            drops: parts.leaves,
            loot: pack.loot,
            harvest: variant.harvest
                ? { item: variant.harvest.item, count: variant.harvest.count, becomes: variant.regrow ? regrowing : parts.leaves }
                : undefined
        };

        if (variant.regrow) {

            blocks[regrowing] = {
                id: id + 1,
                name: `${pack.name} Leaves (${variant.key} regrowing)`,
                label: variant.afterLabel ?? `${pack.labels.liscie} (po zbiorze)`,
                tree: species,
                pack: species,
                part: 'leaves',
                sound: 'plant',
                solid: true,
                opaque: false,
                model: 'leaves',
                textures: { all: tile(pack.textures.liscie) },
                randomRotation: LEAF_ROTATION,
                creative: false,
                drops: parts.leaves,
                pick: parts.leaves,
                loot: pack.loot,
                grows: { into: type, seconds: variant.regrow }
            };

        }

    });

    return blocks;

}


const PART_ORDER = ['log', 'stripped', 'planks', 'leaves', 'sapling', 'litter', 'wreath'];


// Wszystkie bloki drzew (do BLOCK_TYPES w BlockRegistry.js).

export function treeBlocks() {

    const blocks = {};

    for (const [species, tree] of Object.entries(TREE_SPECIES)) {

        const extras = tree.pack ? packExtras(tree.pack) : EXTRAS[species] ?? {};

        const entries = Object.entries({ ...speciesBlocks(species, tree), ...extras });

        entries.sort(([, a], [, b]) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part));

        Object.assign(blocks, Object.fromEntries(entries));

    }

    return blocks;

}
