// ------------------------------------------------------------
// ROŚLINY NISKIE (1.19.0) - z paczki Kamila "food_pack_all"
//
// Żurawina, brusznica, truskawka, poziomka, dynia i cukinia to niskie
// płyty: blok niższy niż komórka (od 3 do 14 pikseli), z rysunkiem na
// wierzchu i na bokach - tak jak na podglądach z paczki. Model 'flat'
// z polem flat.height (wysokość w blokach): rysuje je ChunkMesher
// (addFlats), obrys i celowanie - interaction/BlockBounds.js.
//
// Bloki rośliny (8 numerów, od firstId; zakres 15000-15199):
//    0  low_<roślina>_young    sadzonka (niższa płyta),
//    1  low_<roślina>_plant    roślina bez owoców (po zbiorze też),
//    2  low_<roślina>_flower   kwitnie,
//    3  low_<roślina>_unripe   niedojrzałe owoce (żurawina, brusznica),
//    4  low_<roślina>_fruit    owoce - PPM zbiera, roślina wraca do "plant",
//    5  low_<roślina>_spent    pnącze dyni po zawiązaniu owocu (żółknie).
// Kolejność życia: young -> plant -> flower -> (unripe) -> fruit.
//
// Dynia rośnie inaczej: kwitnące pnącze zawiązuje owoc w wolnej komórce
// OBOK siebie (grows.fruit - game/PlantGrowth.js): młoda dynia
// (pumpkin_young) dorasta do dyni (pumpkin), a pnącze żółknie i po
// jakimś czasie zielenieje od nowa.
//
// Poza tym: torfowiec (zielony i czerwony, niski i kępa), chrobotek
// (płaski porost na ziemi), dynia i młoda dynia.
//
// Raz nadanego numeru nie wolno zmieniać (docs/numery-blokow.md).
// ------------------------------------------------------------

import { BUSH_GROWTH_SECONDS } from '../config.js';
import { registerShape } from './woodShapes.js';

export const LOW_PLANT_FIRST_ID = 15000;
export const LOW_PLANT_ID_SLOTS = 8;
export const LOW_PLANT_END_ID = 15200;

// Ile sekund trwa etap (kwitnienie, zawiązki, dojrzewanie) i po ilu
// sadzonka staje się rośliną.
export const LOW_STAGE_SECONDS = 200;
export const LOW_YOUNG_SECONDS = BUSH_GROWTH_SECONDS;
export const PUMPKIN_SECONDS = 300;

const PARTS = ['young', 'plant', 'flower', 'unripe', 'fruit', 'spent'];

// Pola rośliny:
//   name / label / of  - nazwa po angielsku, po polsku i w dopełniaczu,
//   height / young     - wysokość płyty dorosłej i sadzonki (piksele),
//   stages             - etapy po sadzonce, po kolei,
//   item / count       - co i ile daje zbiór (PPM na etapie "fruit"),
//   seed               - przedmiot, który posadzony daje sadzonkę (gdy
//                        inny niż owoc albo żaden - truskawkę sadzi się
//                        z sadzonki, bo owoc sadzi stary krzak truskawki),
//   tiles              - etap -> [kafelek wierzchu, kafelek boku] (bez
//                        wpisu: jak etap "plant"),
//   fruitBlock         - dynia: blok zawiązywany obok kwitnącego pnącza,
//   habitat            - gdzie rośnie dziko: biom -> [gęstość w plamie,
//                        część powierzchni biomu pod plamami],
//   wild               - w jakich etapach rośnie dziko (wagi),
//   labels             - nazwy etapów (bez wpisu - domyślne).
export const LOW_PLANTS = {

    cranberry: {
        firstId: 15000, name: 'Cranberry', label: 'Żurawina', of: 'żurawiny',
        height: 6, young: 3, stages: ['plant', 'flower', 'unripe', 'fruit'],
        item: 'cranberry', count: [2, 4],
        tiles: { young: ['low_cranberry_young_top', 'low_cranberry_young_side'] },
        habitat: { wetland: [0.8, 0.16] },
        wild: { young: 0.1, plant: 0.3, flower: 0.12, unripe: 0.13, fruit: 0.35 }
    },

    lingonberry: {
        firstId: 15008, name: 'Lingonberry', label: 'Borówka brusznica', of: 'brusznicy',
        height: 5, young: 3, stages: ['plant', 'flower', 'unripe', 'fruit'],
        item: 'lingonberry', count: [2, 4],
        habitat: { pine: [0.75, 0.14], spruce: [0.7, 0.08], mugo_scrub: [0.6, 0.08], birch: [0.5, 0.04] },
        wild: { young: 0.08, plant: 0.32, flower: 0.12, unripe: 0.13, fruit: 0.35 }
    },

    strawberry: {
        firstId: 15016, name: 'Strawberry Patch', label: 'Truskawki', of: 'truskawek',
        height: 8, young: 4, stages: ['plant', 'flower', 'fruit'],
        item: 'strawberry', count: [2, 4], seed: null,
        habitat: { meadow: [0.55, 0.015], olive_grove: [0.5, 0.03] },
        wild: { young: 0.1, plant: 0.35, flower: 0.2, fruit: 0.35 }
    },

    wild_strawberry: {
        firstId: 15024, name: 'Wild Strawberry', label: 'Poziomka', of: 'poziomki',
        height: 6, young: 3, stages: ['plant', 'flower', 'fruit'],
        item: 'wild_strawberry', count: [1, 3],
        habitat: { deciduous: [0.55, 0.08], beech: [0.5, 0.06], birch: [0.55, 0.07], maple_forest: [0.5, 0.05], meadow: [0.45, 0.015] },
        wild: { young: 0.1, plant: 0.35, flower: 0.2, fruit: 0.35 }
    },

    pumpkin: {
        firstId: 15032, name: 'Pumpkin Vine', label: 'Pnącze dyni', of: 'dyni',
        height: 10, young: 4, stages: ['plant', 'flower', 'spent'],
        item: null, seed: 'pumpkin_seeds', fruitBlock: 'pumpkin_young',
        tiles: {
            flower: ['low_pumpkin_flower_top', 'low_pumpkin_plant_side'],
            spent: ['low_pumpkin_spent_top', 'low_pumpkin_spent_side']
        },
        labels: { young: 'Siewka dyni', plant: 'Pnącze dyni', flower: 'Pnącze dyni (kwitnie)', spent: 'Pnącze dyni (żółknie)' },
        habitat: { meadow: [0.45, 0.008], savanna: [0.5, 0.03] },
        // Dziko: między pnączami leżą dynie (wild.pumpkin - gotowy owoc).
        wild: { young: 0.08, plant: 0.5, flower: 0.14, spent: 0.1, pumpkin_young: 0.06, pumpkin: 0.12 }
    },

    zucchini: {
        firstId: 15040, name: 'Zucchini', label: 'Cukinia', of: 'cukinii',
        height: 14, young: 5, stages: ['plant', 'flower', 'fruit'],
        item: 'zucchini', count: [1, 2],
        tiles: {
            flower: ['low_zucchini_flower_top', 'low_zucchini_plant_side'],
            fruit: ['low_zucchini_plant_top', 'low_zucchini_fruit_side']
        },
        habitat: { olive_grove: [0.5, 0.04], savanna: [0.45, 0.03] },
        wild: { young: 0.1, plant: 0.35, flower: 0.2, fruit: 0.35 }
    }

};

export const LOW_PLANT_NAMES = Object.keys(LOW_PLANTS);

// Bloki poza roślinami z etapami (numery po kolei od 15048).
const EXTRA_FIRST_ID = 15048;

export const SPHAGNUM = ['sphagnum_green', 'sphagnum_green_tall', 'sphagnum_red', 'sphagnum_red_tall'];

// Dzikie plamy bloków bez etapów: blok -> biom -> [gęstość, część powierzchni].
export const LOW_COVER_HABITAT = {
    sphagnum_green: { wetland: [0.85, 0.14] },
    sphagnum_green_tall: { wetland: [0.6, 0.06] },
    sphagnum_red: { wetland: [0.85, 0.1] },
    sphagnum_red_tall: { wetland: [0.6, 0.05] },
    reindeer_lichen: { pine: [0.6, 0.07], mugo_scrub: [0.6, 0.08], alpine: [0.4, 0.04] }
};

export function lowPlantType(species, part) {
    return `low_${species}_${part}`;
}

// Kolejny etap po `part` albo null (owoc czeka na zbiór).
export function nextLowStage(species, part) {
    const plant = LOW_PLANTS[species];
    if (part === 'young') return plant.stages[0];
    if (part === 'spent') return 'plant';
    const index = plant.stages.indexOf(part);
    const next = index >= 0 ? plant.stages[index + 1] : undefined;
    return next && next !== 'spent' ? next : null;
}

const infoByType = new Map();

// Co to za blok: { species, part, height (piksele) } albo undefined.
export function lowPlantInfo(type) {
    return infoByType.get(type);
}

const PART_LABELS = {
    young: (plant) => `Sadzonka ${plant.of}`,
    plant: (plant) => plant.label,
    flower: (plant) => `${plant.label} (kwitnie)`,
    unripe: (plant) => `${plant.label} (niedojrzałe owoce)`,
    fruit: (plant) => `${plant.label} (owoce)`
};

const plate = (pixels) => ({ solid: false, model: 'flat', flat: { attach: 'down', height: pixels / 16 }, sound: 'plant', category: 'rosliny' });

// Wszystkie bloki roślin niskich (do BLOCK_TYPES w BlockRegistry.js).
export function lowPlantBlocks() {

    const blocks = {};

    for (const [species, plant] of Object.entries(LOW_PLANTS)) {

        const type = (part) => lowPlantType(species, part);
        const tiles = (part) => plant.tiles?.[part] ?? [`low_${species}_${part}_top`, `low_${species}_${part}_side`];
        const young = type('young');

        for (const part of ['young', ...plant.stages]) {

            const height = part === 'young' ? plant.young : plant.height;
            // Sadzonka bez własnego rysunku wygląda jak roślina, tylko niższa.
            const [top, side] = part === 'young' && !plant.tiles?.young ? tiles('plant') : tiles(part);
            const next = nextLowStage(species, part);
            const flowering = part === 'flower' && plant.fruitBlock;

            blocks[type(part)] = {
                id: plant.firstId + PARTS.indexOf(part),
                name: `${plant.name} (${part})`,
                label: plant.labels?.[part] ?? PART_LABELS[part](plant),
                ...plate(height),
                lowPlant: species,
                lowPart: part,
                textures: { top, side, bottom: top },
                // Zniszczona roślina daje sadzonkę.
                drops: young,
                ...(part === 'unripe' || part === 'spent' ? { creative: false, pick: type('plant') } : {}),
                ...(flowering
                    ? { grows: { into: type('spent'), fruit: plant.fruitBlock, seconds: LOW_STAGE_SECONDS } }
                    : next ? { grows: { into: type(next), seconds: part === 'young' ? LOW_YOUNG_SECONDS : part === 'spent' ? PUMPKIN_SECONDS : LOW_STAGE_SECONDS } } : {}),
                ...(part === 'fruit' && plant.item
                    ? { harvest: { item: plant.item, count: plant.count, becomes: type('plant') } }
                    : {})
            };

            infoByType.set(type(part), { species, part, height });

        }

    }

    let id = EXTRA_FIRST_ID;

    for (const name of SPHAGNUM) {
        const tall = name.endsWith('_tall'), red = name.includes('red');
        blocks[name] = {
            id: id++,
            name: `Sphagnum (${red ? 'red' : 'green'}${tall ? ', tall' : ''})`,
            label: `Torfowiec ${red ? 'czerwony' : 'zielony'}${tall ? ' (kępa)' : ''}`,
            ...plate(tall ? 6 : 3),
            textures: { top: `${name}_top`, side: `${name}_side`, bottom: `${name}_top` }
        };
    }

    blocks.reindeer_lichen = {
        id: id++,
        name: 'Reindeer Lichen',
        label: 'Chrobotek',
        sound: 'plant',
        solid: false,
        replaceable: true,
        model: 'flat',
        flat: { attach: 'down' },
        category: 'rosliny',
        textures: { all: 'reindeer_lichen' },
        randomRotation: ['top']
    };

    blocks.pumpkin = {
        id: id++,
        name: 'Pumpkin',
        label: 'Dynia',
        sound: 'wood',
        hardness: 0.8,
        solid: true,
        category: 'rosliny',
        textures: { top: 'pumpkin_top', side: 'pumpkin_side', bottom: 'pumpkin_top' }
    };

    blocks.pumpkin_young = {
        id,
        name: 'Young Pumpkin',
        label: 'Młoda dynia',
        sound: 'wood',
        hardness: 0.4,
        solid: true,
        opaque: false,
        model: 'shape',
        category: 'rosliny',
        textures: { top: 'pumpkin_young_top', side: 'pumpkin_young_side', bottom: 'pumpkin_young_top' },
        // Zerwana za wcześnie daje tylko pestki.
        drops: 'pumpkin_seeds',
        grows: { into: 'pumpkin', seconds: PUMPKIN_SECONDS }
    };
    registerShape(id, { type: 'pumpkin_young', kind: 'gourd' });

    return blocks;

}

// Czy blok jest dynią (dojrzałą albo młodą) - pnącze nie zawiązuje
// drugiej obok.
export function isPumpkinType(type) {
    return type === 'pumpkin' || type === 'pumpkin_young';
}
