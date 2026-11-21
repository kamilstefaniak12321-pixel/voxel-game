// ------------------------------------------------------------
// KALENDARZ OWOCOWANIA (1.21.0) - kiedy co kwitnie i owocuje
//
// Krzaki, krzewy jagodowe, rośliny niskie i kilka drzew owocują tylko
// w swoich porach roku. Zasada ta sama co u kwiatów z paczek
// (blocks/plantSeasons.js - tam trafiają te wpisy): blok w świecie
// i w zapisie się NIE zmienia, zmienia się to, co gra pokazuje i na co
// pozwala. Poza porą roślina z owocami wygląda jak roślina bez owoców
// i nie da się z niej nic zebrać; w porze najpierw (pół doby) widać
// kwiaty albo pierwsze owoce, potem pełne owocowanie. Każda roślina
// budzi się i zasypia we własnej chwili (z jej miejsca w świecie).
//
// Wzrost (game/PlantGrowth.js): roślina przechodzi przez etapy tylko
// w swojej porze; poza nią czeka. Zimą nie rośnie nic.
//
// Pory: 0 - wiosna, 1 - lato, 2 - jesień, 3 - zima (sky/Seasons.js).
// Rośliny, której tu nie ma (palma kokosowa, baobab, figowiec, szyszki),
// pory nie dotyczą - owocuje cały rok.
// ------------------------------------------------------------

import { BLOCK_TYPES, bushStages, blockExists, getBlockId } from './BlockRegistry.js';
import { SHRUBS, SHRUB_NAMES, shrubType } from './shrubs.js';
import { LOW_PLANTS, LOW_PLANT_NAMES, lowPlantType } from './lowPlants.js';
import { VINES, VINE_NAMES, vineMounts, vineType } from './vines.js';

// Krzaki z 0.50.0 (blocks/BlockRegistry.js - FRUIT_BUSHES).
export const BUSH_SEASONS = {
    strawberry: [0, 1],
    blueberry: [1],
    blackberry: [1, 2],
    chili: [1, 2],
    hazel: [2]
};

// Krzewy jagodowe (blocks/shrubs.js).
export const SHRUB_SEASONS = {
    raspberry: [1],
    currant: [1],
    gooseberry: [1],
    highbush_blueberry: [1, 2],
    bramble: [1, 2],
    dog_rose: [1, 2],
    elderberry: [1, 2],
    aronia: [2],
    sea_buckthorn: [2],
    hazel: [2]
};

// Rośliny niskie (blocks/lowPlants.js).
export const LOW_SEASONS = {
    wild_strawberry: [0, 1],
    strawberry: [0, 1],
    zucchini: [1, 2],
    pumpkin: [1, 2],
    lingonberry: [1, 2],
    cranberry: [2]
};

// Pnącza (1.30.0, blocks/vines.js): kwitną i owocują latem i jesienią.
export const VINE_SEASONS = {
    grape: [1, 2],
    hop: [1, 2],
    kiwi: [1, 2],
    passion_fruit: [1, 2],
    // 1.31.0, jednoroczne: groch wcześnie (wiosna, lato), fasola później
    // (lato, jesień).
    bean: [1, 2],
    pea: [0, 1]
};

// Drzewa: [blok z owocami albo kwiatami, blok bez nich, pory].
export const TREE_SEASONS = [
    ['jablon_leaves_jablka', 'jablon_leaves_jablka_growing', [1, 2]],
    ['olive_leaves_oliwki', 'olive_leaves_oliwki_growing', [2]],
    ['linden_leaves_flowering', 'linden_leaves', [1]]
];

// Owoce, które zostają na roślinie przez zimę (jak w naturze: owoce
// dzikiej róży, rokitnik, żurawina spod śniegu). Zimą da się je zebrać,
// ale nowe nie urosną - to jedyne świeże owoce zimy.
export const WINTER_KEEPERS = { shrub: ['dog_rose', 'sea_buckthorn'], low: ['cranberry'] };

const WINTER = 3;
const withWinter = (seasons, keeps) => (keeps ? [...seasons, WINTER] : seasons);

// Nazwy do kalendarza (/kalendarz, poradnik): [nazwa, pory].
export function fruitCalendar() {
    return [
        ...Object.entries(BUSH_SEASONS).map(([species, seasons]) => [BLOCK_TYPES[bushStages(species)[1]].label.replace(/ \(.*\)$/, ''), seasons]),
        ...Object.entries(SHRUB_SEASONS).map(([species, seasons]) => [SHRUBS[species].label, withWinter(seasons, WINTER_KEEPERS.shrub.includes(species))]),
        ...Object.entries(LOW_SEASONS).map(([species, seasons]) => [LOW_PLANTS[species].label, withWinter(seasons, WINTER_KEEPERS.low.includes(species))]),
        ...Object.entries(VINE_SEASONS).map(([species, seasons]) => [VINES[species].label, seasons]),
        ['Jabłoń', [1, 2]], ['Oliwka', [2]], ['Lipa (kwiaty)', [1]]
    ];
}

// Wpisy dla plantSeasons.js: { id, stage, last, seasons, growth, shown } -
// stage: 0 roślina bez owoców, 1 kwiaty / pierwsze owoce, 2 owoce;
// seasons - kiedy owoce widać i da się je zebrać, growth - kiedy roślina
// rośnie (bez zimy); shown[poziom] - numer bloku pokazywany, gdy pora
// pozwala tylko na niższy poziom.
export function fruitSeasonEntries() {

    const entries = [];
    const add = (types, growth, keeps = false) => {
        const seasons = withWinter(growth, keeps);
        // types: [bez owoców, kwiaty?, ...owoce]
        const [rest, early, ...full] = types;
        if (!blockExists(rest)) return;
        const shown = [getBlockId(rest), getBlockId(early && blockExists(early) ? early : rest)];
        entries.push({ id: shown[0], stage: 0, last: 2, seasons, growth, shown });
        if (early && blockExists(early)) entries.push({ id: getBlockId(early), stage: 1, last: 2, seasons: growth, growth, shown });
        // (Zimują tylko dojrzałe owoce - kwiatów i zawiązków zimą nie widać.)
        for (const type of full) if (blockExists(type)) entries.push({ id: getBlockId(type), stage: 2, last: 2, seasons: type.includes('unripe') ? growth : seasons, growth, shown });
    };

    for (const [species, seasons] of Object.entries(BUSH_SEASONS)) {
        const [, bush, few, fullStage] = bushStages(species);
        add([bush, few, fullStage], seasons);
    }

    for (const species of SHRUB_NAMES) {
        const seasons = SHRUB_SEASONS[species];
        if (!seasons) continue;
        SHRUBS[species].varieties.forEach((_, variety) => {
            const type = (part) => shrubType(species, part, variety);
            // Bez etapu kwiatów pierwszym znakiem pory są niedojrzałe owoce.
            const early = blockExists(type('flower')) ? type('flower') : type('unripe');
            add([type('growing'), early, type('unripe'), type('fruit'), type('fruit_alt')].filter((name, index, all) => all.indexOf(name) === index), seasons, WINTER_KEEPERS.shrub.includes(species));
        });
    }

    for (const species of LOW_PLANT_NAMES) {
        const seasons = LOW_SEASONS[species];
        if (!seasons) continue;
        const type = (part) => lowPlantType(species, part);
        add([type('plant'), type('flower'), type('unripe'), type('fruit')], seasons, WINTER_KEEPERS.low.includes(species));
        // Pnącze dyni po owocowaniu: poza porą też wygląda jak zielone.
        if (blockExists(type('spent'))) entries.push({ id: getBlockId(type('spent')), stage: 1, last: 2, seasons, growth: seasons, shown: [getBlockId(type('plant')), getBlockId(type('spent'))] });
    }

    for (const species of VINE_NAMES) {
        const seasons = VINE_SEASONS[species];
        if (!seasons) continue;
        for (const mount of vineMounts(species)) add(VINES[species].stages.map((stage) => vineType(species, stage, mount)), seasons);
    }

    for (const [fruit, rest, seasons] of TREE_SEASONS) add([rest, null, fruit], seasons);

    return entries;

}
