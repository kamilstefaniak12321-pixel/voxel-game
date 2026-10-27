import { BLOCK_TYPES } from '../blocks/BlockRegistry.js';
import { TREE_NAMES, TREE_SPECIES } from '../blocks/trees.js';
import { TREE_PACKS, TREE_PACK_ERRORS } from '../blocks/treePacks.js';
import { itemExists } from '../items/ItemRegistry.js';
import { STACK_SIZE } from '../game/Inventory.js';

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
//
// Drzewa z paczek (assets/drzewa/) same dostają deski z pnia (i opadłe
// liście z liści, jeśli je mają), a swoje przepisy mogą dopisać
// w drzewo.json ("przepisy" - PACK_RECIPES na dole pliku).
// ------------------------------------------------------------


// Pnie jednego gatunku (zwykły, okorowany, sosnowe z żywicą i górne).

function logsOf(species) {

    return Object.keys(BLOCK_TYPES).filter((type) => {
        const definition = BLOCK_TYPES[type];
        return definition.tree === species && (definition.part === 'log' || definition.part === 'stripped');
    });

}


// Opadłe liście drzew z paczek.

const PACK_LITTER = TREE_PACKS
    .filter((pack) => pack.textures.opadleLiscie)
    .map((pack) => `${pack.id}_leaf_litter`);


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
        label: PACK_LITTER.length > 0 ? 'opadłe liście (dowolne)' : 'opadłe liście (bukowe albo dębowe)',
        icon: 'beech_leaf_litter',
        types: ['beech_leaf_litter', 'oak_leaf_litter', ...PACK_LITTER]
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

    blue: {
        label: 'coś niebieskiego (chaber, borówki)',
        icon: 'cornflower',
        types: ['cornflower', 'blueberry']
    },

    purple: {
        label: 'coś fioletowego (jeżyny, wrzos, krokus)',
        icon: 'heather',
        types: ['blackberry', 'heather', 'crocus']
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
        ingredients: ['lamp', '#blue']
    },
    {
        id: 'lamp_purple',
        result: ['lamp_purple', 1],
        ingredients: ['lamp', '#purple']
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


    // BUDULEC - ściany, które różnie odbijają światło (BounceLight.js)

    {
        id: 'lime_plaster',
        result: ['lime_plaster', 4],
        ingredients: ['limestone', 'limestone', 'sand', 'sand'],
        note: 'Biały - odbija dużo światła, pokój jest jasny.'
    },
    {
        id: 'ochre_plaster',
        result: ['ochre_plaster', 4],
        ingredients: ['lime_plaster', 'lime_plaster', 'lime_plaster', 'clay'],
        note: 'Ciepły, żółty - zabarwia odbite światło.'
    },
    {
        id: 'terracotta',
        result: ['terracotta', 4],
        pattern: ['CC', 'CC'],
        key: { C: 'clay' },
        note: 'Czerwone płytki - ciepłe, czerwonawe światło w pokoju.'
    },
    {
        id: 'polished_stone',
        result: ['polished_stone', 4],
        pattern: ['SS', 'SS'],
        key: { S: 'stone' },
        note: 'Gładki i błyszczący - odbija najwięcej światła.'
    },
    {
        id: 'dark_planks',
        result: ['dark_planks', 3],
        ingredients: ['#planks', '#planks', '#planks', 'basalt'],
        note: 'Bejcowane na ciemno - pochłaniają światło, pokój jest mroczny.'
    },


    // ŚNIEG I MECH (biomy)

    {
        id: 'snow_layer',
        result: ['snow_layer', 4],
        ingredients: ['snow']
    },
    {
        id: 'snow',
        result: ['snow', 1],
        pattern: ['SS', 'SS'],
        key: { S: 'snow_layer' }
    },
    {
        id: 'moss_carpet',
        result: ['moss_carpet', 4],
        ingredients: ['moss']
    },
    {
        id: 'moss',
        result: ['moss', 1],
        pattern: ['MM', 'MM'],
        key: { M: 'moss_carpet' }
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
    },


    // Opadłe liście drzew z paczek - z liści, jak bukowe i dębowe.

    ...PACK_LITTER.map((litter) => ({
        id: litter,
        result: [litter, 2],
        ingredients: [litter.replace(/_leaf_litter$/, '_leaves')]
    }))

];

// ------------------------------------------------------------
// PRZEPISY Z PACZEK DRZEW ("przepisy" w drzewo.json)
//
//   { "wynik": "lamp_red", "ile": 1, "skladniki": ["lamp", "jablko"] }
//   { "wynik": "stick", "ile": 2, "wzor": ["D", "D"], "klucz": { "D": "deski" } }
//
// Nazwy: bloki i przedmioty gry (np. "stick", "lamp", "#planks") albo
// rzeczy z paczki: "pien", "okorowany", "deski", "liscie", "sadzonka",
// "opadleLiscie", "liscie_<odmiana>" i klucze z "przedmioty". Przepis
// z błędem jest pomijany (błąd trafia na czat gry, jak inne błędy
// paczek), reszta działa.
// ------------------------------------------------------------

const PACK_NAMES = {
    pien: '_log',
    okorowany: '_log_stripped',
    deski: '_planks',
    liscie: '_leaves',
    sadzonka: '_sapling',
    opadleLiscie: '_leaf_litter'
};


function packRecipe(pack, entry, index) {

    const where = `przepisy[${index}]`;

    const fail = (message) => {
        throw new Error(`${where}: ${message}`);
    };

    const name = (value, what) => {

        if (typeof value !== 'string' || value === '') {
            fail(`${what}: brak nazwy`);
        }

        let type = value;

        if (Object.hasOwn(PACK_NAMES, value)) {
            type = pack.id + PACK_NAMES[value];
        }
        else if (Object.hasOwn(pack.items, value)) {
            type = pack.items[value].type;
        }
        else if (value.startsWith('liscie_')) {
            type = `${pack.id}_leaves_${value.slice('liscie_'.length)}`;
        }

        const known = type.startsWith('#') ? Object.hasOwn(GROUPS, type.slice(1)) : itemExists(type);

        if (!known) {
            fail(`${what}: nie ma takiego bloku, przedmiotu ani grupy: "${value}"`);
        }

        return type;

    };

    if (!entry || typeof entry !== 'object') {
        fail('ma być { "wynik": ..., ... }');
    }

    const result = name(entry.wynik, 'wynik');

    if (result.startsWith('#')) {
        fail('wynik nie może być grupą');
    }

    const count = entry.ile ?? 1;

    if (!Number.isInteger(count) || count < 1 || count > STACK_SIZE) {
        fail(`ile: liczba od 1 do ${STACK_SIZE}`);
    }

    const recipe = {
        id: `${pack.id}_${typeof entry.id === 'string' && /^[a-z0-9_]+$/.test(entry.id) ? entry.id : index + 1}`,
        result: [result, count],
        note: typeof entry.opis === 'string' ? entry.opis : undefined,
        pack: pack.id
    };

    if (Array.isArray(entry.skladniki) === Array.isArray(entry.wzor)) {
        fail('potrzebne albo "skladniki" (lista), albo "wzor" z "klucz"');
    }

    if (entry.skladniki) {

        if (entry.skladniki.length < 1 || entry.skladniki.length > 4) {
            fail('skladniki: od 1 do 4');
        }

        recipe.ingredients = entry.skladniki.map((spec, i) => name(spec, `skladniki[${i}]`));

    }
    else {

        const pattern = entry.wzor;

        if (pattern.length < 1 || pattern.length > 2 || pattern.some((line) => typeof line !== 'string' || line.length < 1 || line.length > 2)) {
            fail('wzor: 1 albo 2 wiersze po 1 albo 2 znaki (siatka 2 x 2), np. ["DD", ".D"]');
        }

        const key = {};

        for (const char of pattern.join('')) {

            if (char === '.' || char === ' ' || key[char]) {
                continue;
            }

            if (!entry.klucz || entry.klucz[char] === undefined) {
                fail(`klucz: brak znaczenia litery "${char}" ze wzoru`);
            }

            key[char] = name(entry.klucz[char], `klucz.${char}`);

        }

        if (Object.keys(key).length === 0) {
            fail('wzor: pusty');
        }

        recipe.pattern = pattern;
        recipe.key = key;

    }

    return recipe;

}


const PACK_RECIPES = [];

for (const pack of TREE_PACKS) {

    pack.recipes.forEach((entry, index) => {

        try {

            const recipe = packRecipe(pack, entry, index);

            if ([...RECIPES, ...PACK_RECIPES].some((other) => other.id === recipe.id)) {
                throw new Error(`przepisy[${index}]: dwa przepisy o nazwie "${recipe.id}"`);
            }

            PACK_RECIPES.push(recipe);

        }
        catch (error) {
            TREE_PACK_ERRORS.push(`Drzewo "${pack.id}": ${error.message}`);
        }

    });

}

RECIPES.push(...PACK_RECIPES);
