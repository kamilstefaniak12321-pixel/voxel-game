import { BLOCK_TYPES } from '../blocks/BlockRegistry.js';
import { TREE_NAMES, TREE_SPECIES } from '../blocks/trees.js';

// ------------------------------------------------------------
// PRZEPISY (crafting w ekwipunku - siatka 2 x 2)
//
// Każdy przepis to jeden wpis w RECIPES:
//
//   id          - nazwa przepisu (unikalna; w /przepisy i księdze)
//   result      - [co powstaje, ile sztuk]
//   pattern     - przepis z kształtem: wiersze siatki (najwyżej 2 x 2),
//                 litery z `key`, kropka = puste miejsce. Kształt można
//                 położyć w dowolnym miejscu siatki i odbić w poziomie
//                 (jak w Minecrafcie), np. ['P', 'P'] - dwa jedno nad
//                 drugim, w lewej albo prawej kolumnie.
//   key         - co oznacza litera: nazwa bloku / przedmiotu albo
//                 "#grupa" (dowolny z GROUPS)
//   ingredients - przepis bez kształtu: lista składników (najwyżej 4),
//                 obojętne gdzie leżą
//   note        - opcjonalny dopisek w księdze przepisów i wiki
//
// Zamiast kształtu albo listy jest jedno albo drugie. Nowy przepis
// sam trafia do księgi przepisów (kategoria - według wyniku,
// src/items/categories.js), do /przepisy i do wiki (tools/wiki.mjs).
// Literówka w nazwie = błąd od razu przy starcie gry (Crafting.js).
// ------------------------------------------------------------


// Pnie jednego gatunku (zwykły, okorowany, sosnowe z żywicą i górne).

function logsOf(species) {

    return Object.keys(BLOCK_TYPES).filter((type) => {
        const definition = BLOCK_TYPES[type];
        return definition.tree === species && (definition.part === 'log' || definition.part === 'stripped');
    });

}


// GRUPY SKŁADNIKÓW: "#nazwa" w przepisie = dowolny z listy `types`.
// label - jak grupa nazywa się w księdze przepisów, /przepisy i wiki.

export const GROUPS = {

    planks: {
        label: 'deski (dowolne)',
        icon: 'oak_planks',
        types: TREE_NAMES.map((species) => `${species}_planks`)
    },

    rock: {
        label: 'skała (kamień, granit, wapień, piaskowiec, łupek, bazalt)',
        icon: 'stone',
        types: ['stone', 'granite', 'limestone', 'sandstone', 'slate', 'basalt']
    },

    cone: {
        label: 'szyszka (świerka albo sosny)',
        icon: 'spruce_cone',
        types: ['spruce_cone', 'pine_cone']
    },

    needles: {
        label: 'igliwie (świerka albo sosny)',
        icon: 'spruce_leaves',
        types: ['spruce_leaves', 'pine_leaves']
    },

    litter: {
        label: 'opadłe liście (bukowe albo dębowe)',
        icon: 'beech_leaf_litter',
        types: ['beech_leaf_litter', 'oak_leaf_litter']
    },

    red: {
        label: 'coś czerwonego (mak, truskawki, papryczki chili)',
        icon: 'poppy',
        types: ['poppy', 'strawberry', 'chili_pepper']
    },

    green: {
        label: 'coś zielonego (koniczyna, pokrzywa, paproć)',
        icon: 'clover',
        types: ['clover', 'nettle', 'fern']
    },

    // Pnie każdego gatunku: "#oak_logs" itd.
    ...Object.fromEntries(TREE_NAMES.map((species) => [`${species}_logs`, {
        label: `pień ${TREE_SPECIES[species].species[1]} (też okorowany)`,
        icon: `${species}_log`,
        types: logsOf(species)
    }]))

};


export const RECIPES = [

    // DREWNO: pień -> 4 deski tego samego drzewa (także okorowany pień).

    ...TREE_NAMES.map((species) => ({
        id: `${species}_planks`,
        result: [`${species}_planks`, 4],
        ingredients: [`#${species}_logs`]
    })),

    // Patyki: dwie deski jedna nad drugą (dowolne drzewo, mogą być różne).
    {
        id: 'stick',
        result: ['stick', 4],
        pattern: ['P', 'P'],
        key: { P: '#planks' }
    },


    // NARZĘDZIA: głowica ze skały, trzonek z patyka.

    {
        id: 'axe',
        result: ['axe', 1],
        pattern: ['RR', 'RS'],
        key: { R: '#rock', S: 'stick' },
        note: 'Drewno kopie się 3 razy szybciej; PPM na pniu - okorowanie.'
    },
    {
        id: 'pickaxe',
        result: ['pickaxe', 1],
        pattern: ['RR', '.S'],
        key: { R: '#rock', S: 'stick' },
        note: 'Skały kopie się 3 razy szybciej.'
    },
    {
        id: 'shovel',
        result: ['shovel', 1],
        pattern: ['R', 'S'],
        key: { R: '#rock', S: 'stick' },
        note: 'Ziemię, piasek, żwir i błoto kopie się 3 razy szybciej.'
    },


    // ŚWIATŁO: lepidolit świeci po rozpaleniu żywicą od kory brzozowej.
    // Kolorowa lampa - lampa i coś w tym kolorze.

    {
        id: 'lamp',
        result: ['lamp', 2],
        ingredients: ['lepidolite', 'resin', 'birch_bark'],
        note: 'Lepidolit z gór, żywica z sosny, kora z brzozy (siekierą).'
    },
    {
        id: 'lamp_red',
        result: ['lamp_red', 1],
        ingredients: ['lamp', '#red']
    },
    {
        id: 'lamp_green',
        result: ['lamp_green', 1],
        ingredients: ['lamp', '#green']
    },
    {
        id: 'lamp_blue',
        result: ['lamp_blue', 1],
        ingredients: ['lamp', 'cornflower']
    },
    {
        id: 'lamp_purple',
        result: ['lamp_purple', 1],
        ingredients: ['lamp', 'blackberry']
    },


    // OZDOBY

    {
        id: 'spruce_wreath',
        result: ['spruce_wreath', 1],
        pattern: ['NN', 'NC'],
        key: { N: 'spruce_leaves', C: '#cone' }
    },
    {
        id: 'beech_leaf_litter',
        result: ['beech_leaf_litter', 2],
        ingredients: ['beech_leaves']
    },
    {
        id: 'oak_leaf_litter',
        result: ['oak_leaf_litter', 2],
        ingredients: ['oak_leaves']
    },


    // ZIEMIA I SKAŁY

    {
        id: 'sandstone',
        result: ['sandstone', 1],
        pattern: ['SS', 'SS'],
        key: { S: 'sand' }
    },
    {
        id: 'coarse_dirt',
        result: ['coarse_dirt', 4],
        pattern: ['DG', 'GD'],
        key: { D: 'dirt', G: 'gravel' }
    },
    {
        id: 'humus',
        result: ['humus', 1],
        ingredients: ['dirt', '#litter'],
        note: 'Ziemia z próchnicą z opadłych liści.'
    },
    {
        id: 'forest_floor',
        result: ['forest_floor', 1],
        ingredients: ['dirt', '#needles']
    }

];
