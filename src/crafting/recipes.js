import { BLOCK_TYPES } from '../blocks/BlockRegistry.js';
import { TREE_NAMES, TREE_SPECIES } from '../blocks/trees.js';
import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';
import { PLANT_PACKS } from '../blocks/plantPacks.js';
import { TORCH_VARIANTS } from '../blocks/torches.js';
import { STONE_TOOL_MATERIALS, stoneToolType } from '../items/stoneTools.js';

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
// Wszystkie drzewa dostają deski z pnia i opadłe liście, jeśli je mają.
// Dodatkowe przepisy są zapisane
// we wspólnym rejestrze RECIPES poniżej.
// ------------------------------------------------------------


// Pnie jednego gatunku (zwykły, okorowany, sosnowe z żywicą i górne).

function logsOf(species) {

    return Object.keys(BLOCK_TYPES).filter((type) => {
        const definition = BLOCK_TYPES[type];
        return definition.tree === species && (definition.part === 'log' || definition.part === 'stripped');
    });

}


// Szyszki i oliwki drzew z katalogu (przedmioty <gatunek>_<klucz>) -
// tylko gatunków, które są w grze.

const inCatalog = (type) => TREE_DEFINITIONS.some((pack) => type.startsWith(`${pack.id}_`));
const CONES = ['olcha_szyszki', 'mugo_cone', 'sequoia_cone'].filter(inCatalog);
const OLIVES = ['olive_oliwki'].filter(inCatalog);


// Opadłe liście drzew z paczek.

const TREE_LITTER = TREE_DEFINITIONS
    .filter((pack) => pack.textures.leafLitter)
    .map((pack) => `${pack.id}_leaf_litter`);


// GRUPY SKŁADNIKÓW: "#nazwa" w przepisie = dowolny z listy `types`.
// label - jak grupa nazywa się w księdze przepisów, /przepisy i wiki.

export const GROUPS = {

    axes: {
        label: 'siekiera (dowolny kamień)',
        icon: 'axe',
        types: STONE_TOOL_MATERIALS.map(material => stoneToolType('axe', material.stone))
    },

    torches: {
        label: 'pochodnia (dowolny kolor)',
        icon: 'torch',
        types: TORCH_VARIANTS.map(variant => variant.type)
    },

    planks: {
        label: 'deski (dowolne)',
        icon: 'oak_planks',
        types: TREE_NAMES.map((species) => `${species}_planks`)
    },

    rock: {
        label: 'skała (kamień, granit, wapień, piaskowiec, łupek, bazalt)',
        icon: 'stone',
        types: STONE_TOOL_MATERIALS.map(material => material.stone)
    },

    cone: {
        label: 'szyszka (dowolna)',
        icon: 'spruce_cone',
        types: ['spruce_cone', 'pine_cone', ...CONES]
    },

    grass: {
        label: 'trawa (krótka, wysoka, wydmowa) albo trzcina',
        icon: 'tall_grass',
        types: ['short_grass', 'tall_grass', 'dune_grass', 'reed']
    },

    // Do pochodni i lamp: to, co się pali.
    oil: {
        label: 'żywica albo oliwki',
        icon: 'resin',
        types: ['resin', ...OLIVES]
    },

    needles: {
        label: 'igliwie (świerka albo sosny)',
        icon: 'spruce_leaves',
        types: ['spruce_leaves', 'pine_leaves']
    },

    litter: {
        label: TREE_LITTER.length > 0 ? 'opadłe liście (dowolne)' : 'opadłe liście (bukowe albo dębowe)',
        icon: 'beech_leaf_litter',
        types: ['beech_leaf_litter', 'oak_leaf_litter', ...TREE_LITTER]
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

    // Pozostałe kolory barwników (0.98.1): każdy kwiat i plon daje barwnik.
    yellow: {
        label: 'coś żółtego (mniszek)',
        icon: 'dandelion',
        types: ['dandelion']
    },

    white: {
        label: 'coś białego (rumianek)',
        icon: 'chamomile',
        types: ['chamomile']
    },

    brown: {
        label: 'coś brązowego (żołądź)',
        icon: 'acorn',
        types: ['acorn']
    },

    orange: {
        label: 'coś pomarańczowego ()',
        icon: 'dye_orange',
        types: []
    },

    pink: {
        label: 'coś różowego ()',
        icon: 'dye_pink',
        types: []
    },

    // Kwiaty do wianka: polne (bloki) i zebrane z roślin (plony).
    flowers: {
        label: 'kwiat (mak, chaber, rumianek, mniszek, krokus, wrzos)',
        icon: 'poppy',
        types: ['poppy', 'cornflower', 'chamomile', 'dandelion', 'crocus', 'heather']
    },

    // Zioła do naparów (docs/ziola.md): kubek + dwa zioła z jednej grupy.
    herbs_calm: {
        label: 'zioło na sen (kwiat lipy)',
        icon: 'linden_flower',
        types: ['linden_flower']
    },

    herbs_heal: {
        label: 'zioło lecznicze (rumianek, babka)',
        icon: 'chamomile',
        types: ['chamomile', 'plantain']
    },

    herbs_vigor: {
        label: 'zioło wzmacniające (pokrzywa)',
        icon: 'nettle',
        types: ['nettle']
    },

    // Pnie każdego gatunku: "#oak_logs" itd.
    ...Object.fromEntries(TREE_NAMES.map((species) => [`${species}_logs`, {
        label: `pień ${TREE_SPECIES[species].species[1]} (też okorowany)`,
        icon: `${species}_log`,
        types: logsOf(species)
    }]))

};


// Plony roślin w grupach składników ("grupy" w roslina.json), np. wiecha
// amarantusa - coś czerwonego (barwnik, czerwona lampa) i kwiat do wianka.
// Nazwa grupy wymienia najwyżej GROUP_LABEL_NAMES rzeczy, potem "i inne".

const GROUP_LABEL_NAMES = 5;

for (const pack of PLANT_PACKS) {

    for (const name of pack.item?.groups ?? []) {

        const group = GROUPS[name];

        group.types.push(pack.item.type);

        if (group.types.length <= GROUP_LABEL_NAMES) {
            group.label = group.label.replace(/\)$/, `, ${pack.item.label.toLowerCase()})`).replace('(, ', '(');
        }
        else if (!group.label.endsWith('i inne)')) {
            group.label = group.label.replace(/\)$/, ' i inne)');
        }

    }

}


import { FIRE_WOODS, fuelType } from '../game/CampfireState.js';
import { CHEST_KINDS } from '../blocks/chest.js';
import { WOODS } from '../blocks/woods.js';
import { TEAS, CUP } from '../items/foods.js';
import { EFFECTS } from '../items/effects.js';

export const RECIPES = [
    // Skrzynie (0.89.0): z każdego rodzaju desek - skrzynia tego drewna.
    ...CHEST_KINDS.map(({ type, planks }) => ({ id: type, result: [type, 1], pattern: ['PP', 'PP'], key: { P: planks },
        note: 'Cztery deski jednego drzewa - skrzynia z tego drewna. PPM na skrzyni: otwórz - 4 x 3 przegródki, w każdej dwie warstwy (najpierw zdejmij wierzch).' })),
    // Stół stolarski (0.90.0): dwie deski na dwóch patykach - stół z tego
    // drewna (długi na dwa bloki; na nim robi się schody, półbloki,
    // płoty i furtki).
    ...WOODS.map(({ wood, planks }) => ({ id: `${wood}_carpenter_table`, result: [`${wood}_carpenter_table`, 1],
        pattern: ['PP', 'SS'], key: { P: planks, S: 'stick' },
        note: 'Długi na dwa bloki. PPM deskami w lewą część blatu - deski na stół; PPM w wyrób na prawej części - schody, półbloki, płoty, furtki (Shift - ile się da).' })),
    { id: 'raft', result: ['raft', 1], pattern: ['PP'], key: { P: '#planks' },
        note: 'Dwie deski obok siebie. PPM na wodzie: postaw; PPM na tratwie: wsiądź. WASD: płyń, Shift: wysiądź, LPM: zabierz.' },
    ...Object.keys(FIRE_WOODS).map(wood => ({ id: fuelType(wood), result: [fuelType(wood), 4],
        ingredients: [`#${wood}_logs`, '#axes'], keep: ['#axes'],
        note: 'Siekiera zostaje. Opał: PPM na ziemię, potem dokładaj do 6 polan.' })),
    // Sen (0.98.0): słoma z trawy, z niej słomiana pościel; lniana
    // pościel z wiązek lnu. Pościel: PPM na ziemi - posłanie, PPM na
    // stelażu łóżka (z trzech stołów stolarskich) - pościelone łóżko.
    { id: 'straw', result: ['straw', 1], ingredients: ['#grass', '#grass'],
        note: 'Wysuszona trawa. Cztery sztuki dają słomianą pościel.' },
    { id: 'straw_bedding', result: ['straw_bedding', 1], pattern: ['SS', 'SS'], key: { S: 'straw' },
        note: 'PPM na ziemi: posłanie do spania. PPM na stelażu łóżka: ścieli łóżko.' },
    { id: 'linen_bedding', result: ['linen_bedding', 1], pattern: ['LL', 'LL'], key: { L: 'len_wiazka' },
        note: 'Wygodniejsza od słomianej. PPM na ziemi: posłanie. PPM na stelażu łóżka: ścieli łóżko.' },

    // Napary (0.98.1, docs/ziola.md): kubek z gliny, do niego dwa zioła
    // z jednej grupy; kubek ziół podgrzany nad płonącym ogniskiem
    // (trzymany PPM) to napar. Wypity napar oddaje kubek.
    { id: CUP, result: [CUP, 2], ingredients: ['clay', 'clay'],
        note: 'Naczynie na napary. Po wypiciu naparu kubek wraca do ekwipunku.' },
    ...Object.entries(TEAS).map(([effect, { brew, herbs }]) => ({
        id: brew, result: [brew, 1], ingredients: [CUP, `#${herbs}`, `#${herbs}`],
        note: `Przytrzymaj PPM na płonącym ognisku - powstanie napar. ${EFFECTS[effect].text}.`
    })),
    // Wianek z kwiatów: ozdoba na ścianę (blocks/decorations.js).
    { id: 'flower_wreath', result: ['flower_wreath', 1], pattern: ['FF', 'FF'], key: { F: '#flowers' },
        note: 'Cztery dowolne kwiaty. Wiesza się na ścianie jak wieniec świerkowy.' },

    { id: 'fire_starter', result: ['fire_starter', 1], ingredients: ['stick', 'stick'],
        note: '6 polan + trawa; przytrzymaj PPM starterem przez 5 sekund.' },

    // Barwniki z roślin: paczki kwiatów/owoców przypisane do istniejących
    // grup kolorów także stają się źródłem pigmentu.
    ...['red', 'yellow', 'white', 'green', 'blue', 'purple', 'brown'].map((color) => ({
        id: `dye_${color}`, result: [`dye_${color}`, 1], ingredients: [`#${color}`],
        note: 'Barwnikiem kliknij PPM postawioną pochodnię albo połącz go z pochodnią w tej siatce.'
    })),
    // Pomarańczowy i różowy także prosto z kwiatów (obok mieszania).
    ...['orange', 'pink'].map((color) => ({
        id: `dye_${color}_plant`, result: [`dye_${color}`, 1], ingredients: [`#${color}`],
        note: 'Prosto z kwiatów - bez mieszania barwników.'
    })),
    ...[
        ['orange', 'red', 'yellow'], ['magenta', 'purple', 'pink'],
        ['light_blue', 'blue', 'white'], ['lime', 'green', 'white'],
        ['pink', 'red', 'white'], ['gray', 'black', 'white'],
        ['light_gray', 'gray', 'white'], ['cyan', 'blue', 'green'],
        ['black', 'red', 'green', 'blue']
    ].map(([color, ...ingredients]) => ({
        id: `dye_${color}`, result: [`dye_${color}`, ingredients.length],
        ingredients: ingredients.map(key => `dye_${key}`),
        note: 'Mieszanie barwników.'
    })),
    { id: 'torch', result: ['torch', 4], ingredients: ['stick', '#oil'],
        note: 'Żywicę zbierz PPM z pnia sosny, oliwki - z liści oliwki. Pochodnię postaw na podłożu albo na ścianie.' },
    ...TORCH_VARIANTS.filter(variant => variant.key !== 'plain').map(variant => ({
        id: variant.type, result: [variant.type, 1], ingredients: ['#torches', `dye_${variant.key}`],
        note: 'Zmienia końcówki płomienia i odcień światła. Postawioną pochodnię można też zabarwić PPM.'
    })),

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
        stoneTool: 'axe',
        pattern: ['RR', 'RS'],
        key: { R: '#rock', S: 'stick' },
        note: 'Drewno kopie się 3 razy szybciej; PPM na pniu - okorowanie. Jeden rodzaj skały nadaje głowicy swój wygląd; mieszane skały dają zwykłą kamienną.'
    },
    {
        id: 'pickaxe',
        result: ['pickaxe', 1],
        stoneTool: 'pickaxe',
        pattern: ['RR', '.S'],
        key: { R: '#rock', S: 'stick' },
        note: 'Skały kopie się 3 razy szybciej. Jeden rodzaj skały nadaje głowicy swój wygląd; mieszane skały dają zwykłą kamienną.'
    },
    {
        id: 'shovel',
        result: ['shovel', 1],
        stoneTool: 'shovel',
        pattern: ['R', 'S'],
        key: { R: '#rock', S: 'stick' },
        note: 'Ziemię, piasek, żwir i błoto kopie się 3 razy szybciej. Wygląd głowicy zależy od użytej skały.'
    },


    // ŚWIATŁO: lepidolit świeci po rozpaleniu żywicą od kory brzozowej.
    // Kolorowa lampa - lampa i coś w tym kolorze.

    {
        id: 'lamp',
        result: ['lamp', 2],
        ingredients: ['lepidolite', '#oil', 'birch_bark'],
        note: 'Lepidolit z gór, żywica z sosny (albo oliwki), kora z brzozy (siekierą).'
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
        id: 'ochre_plaster_ochre',
        result: ['ochre_plaster', 4],
        ingredients: ['lime_plaster', 'lime_plaster', 'lime_plaster', 'ochra_grudka'],
        note: 'Z grudką żółtej ochry zamiast gliny.'
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

    ...TREE_LITTER.map((litter) => ({
        id: litter,
        result: [litter, 2],
        ingredients: [litter.replace(/_leaf_litter$/, '_leaves')]
    }))

];

// ------------------------------------------------------------
// Dodatkowe przepisy drzew zachowują historyczne nazwy i wyniki.
RECIPES.push(
    {
        id: 'jablon_czerwona_lampa', result: ['lamp_red', 1],
        ingredients: ['lamp', 'jablon_jablko'], note: 'Jabłko też jest czerwone.', tree: 'jablon'
    },
    {
        id: 'wierzba_srebrna_lampa', result: ['lamp', 1],
        ingredients: ['lamp_blue', 'wierzba_bazie'], note: 'Bazie zdejmują z lampy niebieski kolor.', tree: 'wierzba'
    }
);
