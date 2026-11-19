// ------------------------------------------------------------
// OPADŁE OWOCE (1.22.0) - pomysł Kamila
//
// Owoce, których nikt nie zebrał, po swojej porze spadają na ziemię:
// roślina zostaje pusta, a pod nią leży płaska warstwa opadłych owoców
// (jak opadłe liście). Przez zimę gniją - ziemia pod nimi ma szansę
// zamienić się w czarnoziem, a wiosną z części wyrasta sadzonka tej
// samej rośliny. Zasady i liczby: game/Orchard.js.
//
// Każda owocująca roślina ma swój blok opadłych owoców (żeby było
// wiadomo, jaka sadzonka z nich wyrośnie); rośliny dające ten sam owoc
// (krzak i krzew leszczyny) mają ten sam rysunek.
//
// Numery (zakres 15200-15399, raz nadany numer się nie zmienia - nowe
// rośliny dopisuje się NA KOŃCU swoich katalogów):
//   15200 + n       krzaki z 0.50.0 (kolejność FRUIT_BUSHES),
//   15216 + 4g + o  krzewy jagodowe (g - numer gatunku w SHRUB_NAMES,
//                   o - numer odmiany),
//   15300 + n       rośliny niskie (kolejność LOW_PLANT_NAMES),
//   15320 + n       drzewa (TREES poniżej).
// ------------------------------------------------------------

import { SHRUBS, SHRUB_NAMES, shrubType } from './shrubs.js';
import { LOW_PLANTS, LOW_PLANT_NAMES, lowPlantType } from './lowPlants.js';

export const FALLEN_FIRST_ID = 15200;
export const FALLEN_END_ID = 15400;

// Drzewa: [nazwa, blok z owocami, owoc, sadzonka, podpis].
const TREES = [
    ['jablon', 'jablon_leaves_jablka', 'jablon_jablko', 'jablon_sapling', 'jabłoni'],
    ['olive', 'olive_leaves_oliwki', 'olive_oliwki', 'olive_sapling', 'oliwki']
];

// blok z owocami -> blok opadłych owoców.
const fallenByFruit = new Map();

// Blok opadłych owoców dla bloku z owocami (albo null - np. dynia,
// kwiaty lipy: nie mają czego zrzucić).
export function fallenFor(fruitType) {
    return fallenByFruit.get(fruitType) ?? null;
}

// Wszystkie bloki opadłych owoców (do BLOCK_TYPES). bushes - FRUIT_BUSHES
// z BlockRegistry.js (podane z zewnątrz, żeby nie zapętlić importów).
export function fallenFruitBlocks(bushes) {

    const blocks = {};

    const add = (type, id, label, item, sapling, fruitTypes) => {
        blocks[type] = {
            id,
            name: `Fallen fruit (${type.replace('fallen_', '')})`,
            label: `Opadłe owoce ${label}`,
            sound: 'plant',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            category: 'rosliny',
            creative: false,
            textures: { all: `fallen_${item}` },
            randomRotation: ['top'],
            // Podniesione (zniszczone) dają jeden owoc.
            drops: item,
            fallen: { item, sapling }
        };
        for (const fruit of fruitTypes) fallenByFruit.set(fruit, type);
    };

    Object.entries(bushes).forEach(([species, bush], index) => {
        add(`fallen_bush_${species}`, 15200 + index, `(${bush.labels[1].toLowerCase().replace(/ \(.*\)$/, '')})`, bush.item, `${species}_sapling`,
            [`${species}_bush_few`, `${species}_bush_full`]);
    });

    SHRUB_NAMES.forEach((species, group) => {
        SHRUBS[species].varieties.forEach((variety, index) => {
            const suffix = variety.key ? `_${variety.key}` : '';
            add(`fallen_shrub_${species}${suffix}`, 15216 + group * 4 + index, variety.of,
                variety.item, shrubType(species, 'sapling', index), [shrubType(species, 'fruit', index)]);
        });
    });

    LOW_PLANT_NAMES.forEach((species, index) => {
        const plant = LOW_PLANTS[species];
        if (!plant.item) return;
        add(`fallen_low_${species}`, 15300 + index, plant.of, plant.item, lowPlantType(species, 'young'), [lowPlantType(species, 'fruit')]);
    });

    TREES.forEach(([name, fruit, item, sapling, label], index) => {
        add(`fallen_${name}`, 15320 + index, label, item, sapling, [fruit]);
    });

    return blocks;

}
