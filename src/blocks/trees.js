import { TREE_GROWTH_SECONDS } from '../config.js';
import { TREE_CATALOG, TREE_SLOT } from './treeCatalog.js';
export { BASE_TREE_NAMES } from './treeCatalog.js';

// Stable block definitions shared by all built-in tree species.
export const TREE_SPECIES = TREE_CATALOG;
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

// Liście: tekstura losowo obrócona na każdej ścianie.

const LEAF_ROTATION = ['top', 'bottom', 'left', 'right', 'front', 'back'];


function speciesBlocks(species, tree) {

    const parts = treeParts(species);

    const [logLabel, strippedLabel, planksLabel, leavesLabel, saplingLabel] = tree.labels;

    const id = tree.firstId;

    const textures = tree.textures;


    return {

        [parts.log]: {
            id,
            name: `${tree.name} Log`,
            label: logLabel,
            tree: species,
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
            part: 'sapling',
            solid: false,
            model: 'cross',
            plant: SAPLING_SHAPE,
            textures: { all: textures.sapling },
            grows: { tree: species, seconds: tree.growthSeconds ?? TREE_GROWTH_SECONDS }
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
// DODATKI GATUNKÓW Z KATALOGU
//
// Opadłe liście (jeśli gatunek je ma) i odmiany liści. Odmiana z "zbior"
// (np. liście z jabłkami): PPM zbiera przedmiot, a liście zamieniają się
// w "odrastające" - wyglądają jak zwykłe liście i po "odrasta" sekundach
// (średnio) znów są odmianą. Bez "odrasta" - po zbiorze zostają zwykłe
// liście. Odmiany i opadłe liście zniszczone w przygodzie dają zwykłe
// liście (i zbiór, jeśli był).
// ------------------------------------------------------------

export function treeVariantType(species, key) {

    return `${species}_leaves_${key}`;

}


function treeExtras(definition) {

    const species = definition.id;

    const parts = treeParts(species);


    const blocks = {};


    if (definition.textures.leafLitter) {

        blocks[`${species}_leaf_litter`] = {
            id: definition.firstId + TREE_SLOT.litter,
            name: `${definition.name} Leaf Litter`,
            label: definition.litterLabel,
            tree: species,
            part: 'litter',
            sound: 'plant',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            textures: { all: definition.textures.leafLitter },
            randomRotation: ['top']
        };

    }


    definition.variants.forEach((variant, i) => {

        const type = treeVariantType(species, variant.key);

        const regrowing = `${type}_growing`;

        const id = definition.firstId + TREE_SLOT.variants + i * 2;

        blocks[type] = {
            id,
            name: `${definition.name} Leaves (${variant.key})`,
            label: variant.label,
            tree: species,
            part: 'leaves',
            sound: 'plant',
            solid: true,
            opaque: false,
            model: 'leaves',
            textures: { all: variant.texture },
            randomRotation: LEAF_ROTATION,
            drops: parts.leaves,
            loot: definition.loot,
            harvest: variant.harvest
                ? { item: variant.harvest.item, count: variant.harvest.count, becomes: variant.regrow ? regrowing : parts.leaves }
                : undefined
        };

        if (variant.regrow) {

            blocks[regrowing] = {
                id: id + 1,
                name: `${definition.name} Leaves (${variant.key} regrowing)`,
                label: variant.afterLabel ?? `${definition.labels[3]} (po zbiorze)`,
                tree: species,
                    part: 'leaves',
                sound: 'plant',
                solid: true,
                opaque: false,
                model: 'leaves',
                textures: { all: definition.textures.leaves },
                randomRotation: LEAF_ROTATION,
                creative: false,
                drops: parts.leaves,
                pick: parts.leaves,
                loot: definition.loot,
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

        const extras = tree.shape ? treeExtras(tree) : EXTRAS[species] ?? {};

        const entries = Object.entries({ ...speciesBlocks(species, tree), ...extras });

        entries.sort(([, a], [, b]) => PART_ORDER.indexOf(a.part) - PART_ORDER.indexOf(b.part));

        Object.assign(blocks, Object.fromEntries(entries));

    }

    return blocks;

}
