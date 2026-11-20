// ------------------------------------------------------------
// KRZEWY JAGODOWE (1.17.0) - z paczki Kamila "food_pack_all"
//
// Krzew to kilka-kilkadziesiąt bloków liści (czasem z pędami albo pniem
// pod spodem), tak jak na podglądach z paczki. Inaczej niż krzaki
// owocowe z 0.50.0 (jeden blok z modelem 3D - FRUIT_BUSHES), krzew jest
// budowlą z bloków: rośnie dziko w swoich biomach (world/shrubs/) i
// wyrasta z sadzonki (grows.shrub - game/PlantGrowth.js).
//
// Bloki gatunku (16 numerów, od firstId; zakres 14300-14999):
//    0  shrub_<gatunek>_leaves    liście (same, nic na nich nie rośnie),
//    1  shrub_<gatunek>_stem      pędy albo pień (nie każdy gatunek),
//   potem po 5 na odmianę (druga odmiana - z przyrostkiem, np. _black):
//    +0 ..._sapling     sadzonka (wyrasta w cały krzew tej odmiany),
//    +1 ..._fruit       liście z dojrzałymi owocami - PPM zbiera,
//    +2 ..._growing     liście po zbiorze (wyglądają jak zwykłe) -
//                       po jakimś czasie kwitną,
//    +3 ..._flower      kwiaty - po jakimś czasie zawiązują owoce
//                       (u dzikiej róży i bzu PPM zrywa płatki / kwiaty,
//                       a gałązka zaczyna od nowa),
//    +4 ..._unripe      niedojrzałe owoce (bez, rokitnik, leszczyna).
// Kolejność życia gałązki: growing -> flower -> (unripe) -> fruit;
// gatunek bez rysunku kwiatu (rokitnik) pomija kwitnienie.
//
// Raz nadanego numeru nie wolno zmieniać (docs/numery-blokow.md).
// ------------------------------------------------------------

import { TREE_GROWTH_SECONDS } from '../config.js';

export const SHRUB_FIRST_ID = 14300;
export const SHRUB_ID_SLOTS = 16;
export const SHRUB_END_ID = 15000;

// Ile sekund trwa każdy etap gałązki po zbiorze (kwitnienie, zawiązki,
// dojrzewanie) i po ilu sadzonka wyrasta w krzew.
export const SHRUB_STAGE_SECONDS = 240;
export const SHRUB_GROWTH_SECONDS = TREE_GROWTH_SECONDS;

const LEAF_ROTATION = ['top', 'bottom', 'left', 'right', 'front', 'back'];
const SAPLING_SHAPE = { planes: 2, height: 0.8, width: 0.4 };

// Pola gatunku:
//   name / label / of   - nazwa po angielsku, po polsku i w dopełniaczu,
//   palette             - paleta jesieni liści (rendering/LeafSeasons.js),
//   varieties           - odmiany: key ('' - podstawowa), of (dopełniacz
//                         z odmianą), item (owoc), count (ile z gałązki),
//                         fruit (część tekstury owocu),
//   flower              - czy ma rysunek kwiatu; flowerItem - co daje
//                         zerwany kwiat (albo nic),
//   unripe              - czy ma rysunek niedojrzałych owoców,
//   tops                - kwiat i owoc mają osobny rysunek z góry (bez),
//   stem                - null, 'canes' (ażurowe pędy) albo 'log' (pień),
//   stemLabel           - nazwa bloku pędów / pnia,
//   shape               - sylwetka (world/shrubs/ShrubShapes.js),
//   habitat             - gdzie rośnie dziko: biom -> waga (world/shrubs/Shrubs.js),
//   ground              - na jakiej powierzchni (domyślnie tylko trawa).
export const SHRUBS = {

    aronia: {
        firstId: 14300, name: 'Chokeberry', label: 'Aronia', of: 'aronii', palette: 'czerwony',
        habitat: { wetland: 0.5, birch: 0.5, meadow: 0.2 },
        varieties: [{ key: '', of: 'aronii', item: 'aronia', count: [2, 4], fruit: 'fruit' }],
        flower: true, stem: 'canes', stemLabel: 'Pędy aronii',
        shape: { kind: 'upright', height: [1, 3], radius: [0.6, 1.9], legs: 1, fruit: 0.45 }
    },

    currant: {
        firstId: 14316, name: 'Currant', label: 'Porzeczka', of: 'porzeczki', palette: 'zolty',
        habitat: { deciduous: 0.5, wetland: 0.4, maple_forest: 0.4, beech: 0.2 },
        varieties: [
            { key: '', of: 'porzeczki czerwonej', item: 'redcurrant', count: [2, 4], fruit: 'fruit' },
            { key: 'black', of: 'porzeczki czarnej', item: 'blackcurrant', count: [2, 4], fruit: 'fruit_black' }
        ],
        flower: true, stem: null,
        shape: { kind: 'mound', height: [1, 2], radius: [0.6, 2.2], fruit: 0.5 }
    },

    gooseberry: {
        firstId: 14332, name: 'Gooseberry', label: 'Agrest', of: 'agrestu', palette: 'zolty',
        habitat: { deciduous: 0.35, rocky: 0.3, beech: 0.3, meadow: 0.15 },
        varieties: [
            { key: '', of: 'agrestu', item: 'gooseberry', count: [1, 3], fruit: 'fruit' },
            { key: 'red', of: 'agrestu czerwonego', item: 'red_gooseberry', count: [1, 3], fruit: 'fruit_red' }
        ],
        flower: true, stem: 'log', stemLabel: 'Pień agrestu',
        shape: { kind: 'mound', height: [1, 2], radius: [0.6, 1.8], standard: 0.18, fruit: 0.4 }
    },

    raspberry: {
        firstId: 14348, name: 'Raspberry', label: 'Malina', of: 'maliny', palette: 'zolty',
        habitat: { spruce: 0.6, pine: 0.5, birch: 0.6, deciduous: 0.35, alpine: 0.3, meadow: 0.2 },
        varieties: [
            { key: '', of: 'maliny', item: 'raspberry', count: [2, 4], fruit: 'fruit' },
            { key: 'yellow', of: 'maliny żółtej', item: 'yellow_raspberry', count: [2, 4], fruit: 'fruit_yellow' }
        ],
        flower: true, stem: null,
        shape: { kind: 'thicket', height: [1, 2], radius: [0.6, 3.2], fruit: 0.4 }
    },

    dog_rose: {
        firstId: 14364, name: 'Dog Rose', label: 'Dzika róża', of: 'dzikiej róży', palette: 'pomaranczowy',
        habitat: { meadow: 0.8, olive_grove: 0.4, birch: 0.3, deciduous: 0.2 },
        varieties: [{ key: '', of: 'dzikiej róży', item: 'rose_hip', count: [1, 3], fruit: 'fruit' }],
        flower: true, flowerItem: 'rose_petals', stem: null,
        shape: { kind: 'arching', height: [1, 3], radius: [0.6, 2.8], fruit: 0.4 }
    },

    elderberry: {
        firstId: 14380, name: 'Elder', label: 'Bez czarny', of: 'bzu czarnego', palette: 'zolty',
        habitat: { deciduous: 0.6, meadow: 0.35, wetland: 0.3, beech: 0.3, maple_forest: 0.4 },
        varieties: [{ key: '', of: 'bzu czarnego', item: 'elderberry', count: [2, 5], fruit: 'fruit' }],
        flower: true, flowerItem: 'elderflower', unripe: true, tops: true, stem: 'log', stemLabel: 'Pień bzu czarnego',
        shape: { kind: 'tree', height: [1, 6], radius: [0.6, 3.2], fruit: 0.4 }
    },

    sea_buckthorn: {
        firstId: 14396, name: 'Sea Buckthorn', label: 'Rokitnik', of: 'rokitnika', palette: 'plowy',
        habitat: { beach: 1.6, rocky: 0.2, alpine: 0.15 }, ground: ['sand', 'grass'],
        varieties: [{ key: '', of: 'rokitnika', item: 'sea_buckthorn_berry', count: [2, 4], fruit: 'fruit' }],
        flower: false, unripe: true, stem: 'log', stemLabel: 'Pień rokitnika',
        shape: { kind: 'tree', height: [1, 3], radius: [0.6, 2.4], fruit: 0.5 }
    },

    // Borówka wysoka (amerykańska) - owoce jak u borówki czarnej z lasu.
    highbush_blueberry: {
        firstId: 14412, name: 'Highbush Blueberry', label: 'Borówka wysoka', of: 'borówki wysokiej', palette: 'czerwony',
        habitat: { wetland: 0.4, pine: 0.45, maple_forest: 0.5, spruce: 0.25 },
        varieties: [{ key: '', of: 'borówki wysokiej', item: 'blueberry', count: [2, 5], fruit: 'fruit' }],
        flower: true, stem: null,
        shape: { kind: 'mound', height: [1, 2], radius: [0.6, 2.6], fruit: 0.45 }
    },

    // Jeżyna w zaroślach - owoce jak z leśnego krzaka jeżyny.
    bramble: {
        firstId: 14428, name: 'Bramble', label: 'Zarośla jeżyn', of: 'jeżyny', palette: 'miedziany',
        habitat: { deciduous: 0.7, birch: 0.5, meadow: 0.3, pine: 0.3, beech: 0.2 },
        varieties: [{ key: '', of: 'jeżyny', item: 'blackberry', count: [2, 4], fruit: 'fruit', fruitAlt: 'fruit_alt' }],
        flower: true, stem: null,
        shape: { kind: 'thicket', height: [1, 3], radius: [0.6, 3.0], fruit: 0.4 }
    },

    // Leszczyna jako wysoki krzew - orzechy jak z leśnej leszczyny.
    hazel: {
        firstId: 14444, name: 'Hazel Shrub', label: 'Krzew leszczyny', of: 'leszczyny', palette: 'zolty',
        habitat: { deciduous: 0.8, beech: 0.4, birch: 0.4, maple_forest: 0.4, meadow: 0.15 },
        varieties: [{ key: '', of: 'leszczyny', item: 'hazelnut', count: [1, 3], fruit: 'fruit' }],
        flower: true, unripe: true, stem: 'log', stemLabel: 'Pień leszczyny',
        shape: { kind: 'tree', height: [1, 6], radius: [0.6, 3.0], multi: true, fruit: 0.35 }
    }

};

export const SHRUB_NAMES = Object.keys(SHRUBS);

const suffix = (variety) => (variety.key ? `_${variety.key}` : '');

// Nazwy bloków gatunku. variety - numer odmiany (0 - podstawowa).
export function shrubType(species, part, variety = 0) {
    const shrub = SHRUBS[species];
    if (part === 'leaves' || part === 'stem') return `shrub_${species}_${part}`;
    return `shrub_${species}_${part}${suffix(shrub.varieties[variety])}`;
}

// Kolejny etap gałązki po `part` ('growing', 'flower', 'unripe') albo null.
export function nextShrubStage(species, part) {
    const shrub = SHRUBS[species];
    const order = ['growing', ...(shrub.flower ? ['flower'] : []), ...(shrub.unripe ? ['unripe'] : []), 'fruit'];
    const index = order.indexOf(part);
    return index >= 0 && index < order.length - 1 ? order[index + 1] : null;
}

const infoByType = new Map();

// Co to za blok krzewu: { species, part, variety } albo undefined.
export function shrubInfo(type) {
    return infoByType.get(type);
}

// Wszystkie bloki krzewów (do BLOCK_TYPES w BlockRegistry.js).
export function shrubBlocks() {

    const blocks = {};

    for (const [species, shrub] of Object.entries(SHRUBS)) {

        const texture = (part) => `shrub_${species}_${part}`;
        const leaves = shrubType(species, 'leaves');
        const add = (type, slot, part, variety, definition) => {
            blocks[type] = {
                id: shrub.firstId + slot,
                shrub: species,
                shrubPart: part,
                ...(variety === null ? {} : { shrubVariety: variety }),
                sound: 'plant',
                category: 'rosliny',
                ...definition
            };
            infoByType.set(type, { species, part, variety: variety ?? 0 });
        };
        // passable (1.18.0): przez liście krzewu da się przejść - gracz
        // wolniej, jeżyk normalnie (BlockRegistry.isPassableId).
        const leafBlock = { solid: true, opaque: false, passable: true, model: 'leaves', leafSeason: `shrub_${species}` };
        const loot = [[shrubType(species, 'sapling', 0), 0.08]];

        add(leaves, 0, 'leaves', null, {
            ...leafBlock,
            name: `${shrub.name} Leaves`,
            label: `Liście ${shrub.of}`,
            textures: { all: texture('leaves') },
            randomRotation: LEAF_ROTATION,
            loot
        });

        if (shrub.stem) {
            add(shrubType(species, 'stem'), 1, 'stem', null, shrub.stem === 'canes' ? {
                // Ażurowe pędy: jak liście przepuszczają światło. Z góry
                // i z dołu widać tylko przekroje pędów (kropki).
                solid: true, opaque: false, passable: true, model: 'leaves',
                name: `${shrub.name} Canes`,
                label: shrub.stemLabel,
                textures: { top: texture('stem_top'), side: texture('stem'), bottom: texture('stem_top') },
                drops: 'stick'
            } : {
                solid: true,
                sound: 'wood',
                name: `${shrub.name} Stem`,
                label: shrub.stemLabel,
                textures: { top: texture('stem_top'), side: texture('stem'), bottom: texture('stem_top') },
                randomRotation: ['top', 'bottom'],
                drops: 'stick'
            });
        }

        shrub.varieties.forEach((variety, v) => {

            const base = 2 + v * 5;
            const type = (part) => shrubType(species, part, v);
            const faces = (part) => shrub.tops
                ? { top: texture(`${part}_top`), side: texture(part), bottom: texture('leaves') }
                : { all: texture(part) };
            const stage = (part) => {
                const next = nextShrubStage(species, part);
                return next ? { grows: { into: type(next), seconds: SHRUB_STAGE_SECONDS } } : {};
            };

            add(type('sapling'), base, 'sapling', v, {
                name: `${shrub.name} Sapling${variety.key ? ` (${variety.key})` : ''}`,
                label: `Sadzonka ${variety.of}`,
                solid: false,
                model: 'cross',
                plant: SAPLING_SHAPE,
                textures: { all: texture('sapling') },
                grows: { shrub: species, variety: v, seconds: SHRUB_GROWTH_SECONDS }
            });

            add(type('fruit'), base + 1, 'fruit', v, {
                ...leafBlock,
                name: `${shrub.name} Leaves (fruit${variety.key ? `, ${variety.key}` : ''})`,
                label: `Owoce ${variety.of}`,
                textures: faces(variety.fruit),
                drops: leaves,
                loot,
                harvest: { item: variety.item, count: variety.count, becomes: type('growing') }
            });

            add(type('growing'), base + 2, 'growing', v, {
                ...leafBlock,
                name: `${shrub.name} Leaves (regrowing${variety.key ? `, ${variety.key}` : ''})`,
                label: `Liście ${variety.of} (po zbiorze)`,
                textures: { all: texture('leaves') },
                randomRotation: LEAF_ROTATION,
                creative: false,
                drops: leaves,
                pick: leaves,
                loot,
                ...stage('growing')
            });

            if (shrub.flower) {
                add(type('flower'), base + 3, 'flower', v, {
                    ...leafBlock,
                    name: `${shrub.name} Leaves (flowers${variety.key ? `, ${variety.key}` : ''})`,
                    label: `Kwiaty ${variety.of}`,
                    textures: faces('flower'),
                    // Druga odmiana kwitnie tak samo - w ekwipunku wystarczy jedna.
                    ...(v > 0 ? { creative: false, pick: shrubType(species, 'flower', 0) } : {}),
                    drops: leaves,
                    loot,
                    ...(shrub.flowerItem ? { harvest: { item: shrub.flowerItem, count: [1, 2], becomes: type('growing') } } : {}),
                    ...stage('flower')
                });
            }

            if (shrub.unripe) {
                add(type('unripe'), base + 4, 'unripe', v, {
                    ...leafBlock,
                    name: `${shrub.name} Leaves (unripe${variety.key ? `, ${variety.key}` : ''})`,
                    label: `Niedojrzałe owoce ${variety.of}`,
                    textures: faces('unripe'),
                    creative: false,
                    drops: leaves,
                    pick: leaves,
                    loot,
                    ...stage('unripe')
                });
            }

        });

    }

    return blocks;

}
