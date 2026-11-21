// ------------------------------------------------------------
// PNĄCZA (1.30.0) - z paczki Kamila "food_pack_all"
//
// Winorośl, chmiel, kiwi i marakuja rosną PO PODPORZE (decyzja Kamila,
// docs/pnacza.md): sadzi się je przy murze, kratce albo tyczce, na
// ziemi, a dalej pną się same - w górę i na boki - po tej samej podporze
// (game/PlantGrowth.js: climbVine).
//
// Kawałek pnącza to jeden blok. Gdzie wisi (mount):
//   north, south, east, west  - płaski obrazek na boku pełnego bloku
//                               (mur, pień), model 'flat' jak wieniec,
//   trellis, trellis_z        - kratka z pnączem (kratka wzdłuż x albo z),
//   pole                      - tyczka owinięta pnączem,
//   roof                      - daszek pergoli z liśćmi, pod nim wiszą
//                               owoce (kiwi, marakuja).
// Podpory z pnączem to model 'shape' z prześwitami (ShapeBoxes.js,
// pudełka podpory + liści; ChunkMesher rysuje je z roślinami).
//
// Etapy kawałka: young (łodyga) -> leaves -> (flower) -> (unripe) ->
// ripe; zbiór (PPM) cofa do leaves. Owocowanie w porze roku gatunku
// (blocks/fruitSeasons.js).
//
// FASOLA I GROCH (1.31.0) - rośliny jednoroczne (annual): zimą giną,
// zostaje sama podpora (game/PlantGrowth.js). Mają własne mocowania:
//   ground                    - bez podpory płożą się po ziemi (dwie
//                               skrzyżowane płyty, mały zbiór) - tak
//                               rosną dziko,
//   net, net_z, brush         - groch: siatka (wzdłuż x albo z) i chrust,
//   wigwam                    - fasola: wigwam z tyczek, jeden blok
//                               z obrazkiem 2 x 3 bloki na dwóch
//                               skrzyżowanych płytach.
// Te na ziemi i wigwam nie mają kolizji (przechodzi się przez nie jak
// przez rośliny) i znikają, gdy zabraknie pod nimi ziemi (needsGround -
// World.setBlock).
// Fasola ma jeszcze etap dry: strąki zostawione na pędach wysychają
// i dają suchą fasolę - nasiona na następny rok.
//
// Numery (zakres 15600-15999, docs/numery-blokow.md):
//   15600-15603  podpory: kratka (wzdłuż x), kratka (wzdłuż z), tyczka,
//                pergola,
//   15604-15607  siatka (wzdłuż x), siatka (wzdłuż z), chrust, wigwam,
//   15616 + 64 × gatunek + 8 × etap + mocowanie (kolejność VINE_STAGES
//                i mocowań gatunku: VINE_MOUNTS albo pole mounts).
// Raz nadanego numeru nie wolno zmieniać.
// ------------------------------------------------------------

import { BUSH_GROWTH_SECONDS } from '../config.js';
import { registerShape } from './woodShapes.js';

export const VINE_FIRST_ID = 15600;
export const VINE_END_ID = 16000;
const SPECIES_FIRST_ID = 15616;
const SPECIES_SLOTS = 64;

export const VINE_STAGES = ['young', 'leaves', 'flower', 'unripe', 'ripe', 'dry'];
// Mocowania pnączy wieloletnich (winorośl, chmiel, kiwi, marakuja).
export const VINE_MOUNTS = ['north', 'south', 'east', 'west', 'trellis', 'trellis_z', 'pole', 'roof'];
export const FLAT_MOUNTS = ['north', 'south', 'east', 'west'];
// Mocowania bez kolizji, stojące na ziemi jak rośliny.
export const GROUND_MOUNTS = ['ground', 'wigwam'];

// Ile sekund trwa etap i po ilu łodyga staje się liśćmi.
export const VINE_STAGE_SECONDS = 240;
export const VINE_YOUNG_SECONDS = BUSH_GROWTH_SECONDS;
// Strąki fasoli zostawione na pędach wysychają średnio po tylu sekundach.
export const VINE_DRY_SECONDS = VINE_STAGE_SECONDS * 3;
// Zimą kawałek rośliny jednorocznej ginie średnio po tylu sekundach.
export const ANNUAL_WITHER_SECONDS = 60;

// Najwięcej kawałków jednego gatunku w kostce 7 x 7 x 7 wokół miejsca,
// w które pnącze chce urosnąć (tyle mniej więcej ma jedna roślina).
export const VINE_CROWD = 18;

// Najdalej tyle bloków w bok od korzenia (kawałka, który stoi na ziemi).
export const VINE_REACH = 3;

// Podpory: typ -> numer, mocowanie pnącza na niej, tekstury.
export const VINE_SUPPORTS = {
    vine_trellis: { id: 15600, mount: 'trellis', name: 'Trellis', label: 'Kratka', textures: { all: 'vine_trellis' } },
    vine_trellis_z: { id: 15601, mount: 'trellis_z', name: 'Trellis', label: 'Kratka', textures: { all: 'vine_trellis' }, hidden: true, base: 'vine_trellis' },
    garden_pole: { id: 15602, mount: 'pole', name: 'Garden Pole', label: 'Tyczka', textures: { top: 'garden_pole_top', side: 'garden_pole', bottom: 'garden_pole_top' } },
    pergola: { id: 15603, mount: 'roof', name: 'Pergola', label: 'Pergola', textures: { all: 'pergola_slats' } },
    // 1.31.0: podpory grochu i wigwam fasoli.
    pea_net: { id: 15604, mount: 'net', name: 'Pea Net', label: 'Siatka na groch', textures: { all: 'pea_net' } },
    pea_net_z: { id: 15605, mount: 'net_z', name: 'Pea Net', label: 'Siatka na groch', textures: { all: 'pea_net' }, hidden: true, base: 'pea_net' },
    pea_brush: { id: 15606, mount: 'brush', name: 'Pea Brush', label: 'Chrust na groch', textures: { all: 'pea_brush' } },
    bean_wigwam: { id: 15607, mount: 'wigwam', name: 'Bean Wigwam', label: 'Wigwam z tyczek', textures: { all: 'bean_wigwam' } }
};

// Wigwam: obrazek 2 x 3 bloki (ShapeBoxes.js: vine_wigwam, sprite).
export const WIGWAM_SPRITE = { width: 2, height: 3 };

// Podpora pod mocowaniem (null - pełny blok obok).
export const SUPPORT_OF_MOUNT = Object.fromEntries(Object.entries(VINE_SUPPORTS).map(([type, support]) => [support.mount, type]));

// Pola gatunku:
//   index        - numer gatunku (numery bloków),
//   name / label / of - nazwa po angielsku, po polsku i w dopełniaczu,
//   stages       - etapy po łodydze (young), po kolei,
//   item / count - co i ile daje zbiór dojrzałych owoców,
//   height       - najwyżej tyle bloków nad ziemią,
//   hang         - owoce wiszą pod pergolą (tekstura vine_<gatunek>_hang),
//   labels       - nazwy etapów (bez wpisu - domyślne),
//   mounts       - własne mocowania (bez wpisu - VINE_MOUNTS), najwyżej 8,
//   seed         - czym się sadzi (bez wpisu - item),
//   counts       - zbiór według mocowania (bez wpisu - count),
//   annual       - jednoroczna: zimą ginie,
//   dryItem / dryCount / dryCounts - co i ile dają suche strąki (etap dry),
//   habitat / wild - gdzie rośnie dziko (biom -> [gęstość, pokrycie])
//                  i w jakich etapach (etap -> waga) - na ziemi (ground).
export const VINES = {

    grape: {
        index: 0, name: 'Grapevine', label: 'Winorośl', of: 'winorośli',
        stages: ['leaves', 'unripe', 'ripe'], item: 'grapes', count: [2, 4], height: 5,
        labels: { young: 'Młoda winorośl', unripe: 'Winorośl (zielone grona)', ripe: 'Winorośl (winogrona)' }
    },

    hop: {
        index: 1, name: 'Hop', label: 'Chmiel', of: 'chmielu',
        stages: ['leaves', 'unripe', 'ripe'], item: 'hop_cone', count: [2, 4], height: 6,
        labels: { young: 'Młody chmiel', unripe: 'Chmiel (zielone szyszki)', ripe: 'Chmiel (dojrzałe szyszki)' }
    },

    kiwi: {
        index: 2, name: 'Kiwi Vine', label: 'Kiwi', of: 'kiwi',
        stages: ['leaves', 'flower', 'ripe'], item: 'kiwi', count: [1, 3], height: 4, hang: true,
        labels: { young: 'Młode kiwi', leaves: 'Pnącze kiwi', flower: 'Pnącze kiwi (kwitnie)', ripe: 'Pnącze kiwi (owoce)' }
    },

    passion_fruit: {
        index: 3, name: 'Passion Fruit Vine', label: 'Marakuja', of: 'marakui',
        stages: ['leaves', 'flower', 'unripe', 'ripe'], item: 'passion_fruit', count: [1, 2], height: 4, hang: true,
        labels: { young: 'Młoda marakuja', unripe: 'Marakuja (zielone owoce)', ripe: 'Marakuja (owoce)' }
    },

    // --- 1.31.0: jednoroczne --------------------------------------------------

    bean: {
        index: 4, name: 'Runner Bean', label: 'Fasola', of: 'fasoli', annual: true,
        mounts: ['ground', 'pole', 'trellis', 'trellis_z', 'wigwam'],
        stages: ['leaves', 'flower', 'ripe', 'dry'], height: 3,
        seed: 'beans', item: 'bean_pod', count: [1, 2], counts: { ground: [1, 1], wigwam: [4, 6] },
        dryItem: 'beans', dryCount: [2, 3], dryCounts: { ground: [1, 2], wigwam: [6, 9] },
        labels: { young: 'Siewki fasoli', flower: 'Fasola (kwitnie)', ripe: 'Fasola (strąki)', dry: 'Fasola (suche strąki)' },
        habitat: { savanna: [0.45, 0.025], rainforest: [0.4, 0.02] },
        wild: { young: 0.1, leaves: 0.3, flower: 0.2, ripe: 0.25, dry: 0.15 }
    },

    pea: {
        index: 5, name: 'Pea', label: 'Groch', of: 'grochu', annual: true,
        mounts: ['ground', 'net', 'net_z', 'brush', 'trellis', 'trellis_z'],
        stages: ['leaves', 'flower', 'ripe'], height: 2,
        seed: 'peas', item: 'pea_pod', count: [2, 3], counts: { ground: [1, 1] },
        labels: { young: 'Siewki grochu', flower: 'Groch (kwitnie)', ripe: 'Groch (strąki)' },
        habitat: { meadow: [0.5, 0.012], olive_grove: [0.4, 0.02] },
        wild: { young: 0.1, leaves: 0.35, flower: 0.2, ripe: 0.35 }
    }

};

export const VINE_NAMES = Object.keys(VINES);

export function vineType(species, stage, mount) {
    return `vine_${species}_${stage}_${mount}`;
}

// Mocowania gatunku (po kolei - z tego biorą się numery bloków).
export function vineMounts(species) {
    return VINES[species].mounts ?? VINE_MOUNTS;
}

export function vineId(species, stage, mount) {
    return SPECIES_FIRST_ID + VINES[species].index * SPECIES_SLOTS + VINE_STAGES.indexOf(stage) * 8 + vineMounts(species).indexOf(mount);
}

// Kolejny etap po `stage` albo null (dojrzałe czekają na zbiór).
export function nextVineStage(species, stage) {
    const stages = VINES[species].stages;
    if (stage === 'young') return stages[0];
    return stages[stages.indexOf(stage) + 1] ?? null;
}

const infoByType = new Map();
const infoById = new Map();

// Co to za blok: { species, stage, mount } albo undefined.
export function vineInfo(type) {
    return infoByType.get(type);
}

export function vineInfoById(id) {
    return infoById.get(id);
}

// Gatunek pnącza, który się sadzi tym owocem albo nasionem (null - żaden).
export function vineOfItem(item) {
    return VINE_NAMES.find((species) => (VINES[species].seed ?? VINES[species].item) === item) ?? null;
}

// Mocowanie, gdy pnącze wchodzi na podporę `type` (null - to nie podpora).
export function supportMount(type) {
    return VINE_SUPPORTS[type]?.mount ?? null;
}

const STAGE_LABELS = {
    young: (vine) => `${vine.label} (młode)`,
    leaves: (vine) => vine.label,
    flower: (vine) => `${vine.label} (kwitnie)`,
    unripe: (vine) => `${vine.label} (zielone owoce)`,
    ripe: (vine) => `${vine.label} (owoce)`,
    dry: (vine) => `${vine.label} (suche strąki)`
};

// Rodzaj kształtu (ShapeBoxes.js) dla mocowania na podporze.
const SHAPE_OF_MOUNT = {
    trellis: { kind: 'vine_trellis', facing: 'north' },
    trellis_z: { kind: 'vine_trellis', facing: 'east' },
    pole: { kind: 'vine_pole' },
    roof: { kind: 'vine_roof' },
    // Siatka na groch ma kształt kratki (inna tekstura), chrust - dwie
    // skrzyżowane płyty.
    net: { kind: 'vine_trellis', facing: 'north' },
    net_z: { kind: 'vine_trellis', facing: 'east' },
    brush: { kind: 'vine_brush' },
    ground: { kind: 'vine_ground' },
    wigwam: { kind: 'vine_wigwam', sprite: WIGWAM_SPRITE }
};

// Wszystkie bloki pnączy i podpór (do BLOCK_TYPES w BlockRegistry.js).
export function vineBlocks() {

    const blocks = {};

    for (const [type, support] of Object.entries(VINE_SUPPORTS)) {
        const onGround = GROUND_MOUNTS.includes(support.mount);
        blocks[type] = {
            id: support.id,
            name: support.name,
            label: support.label,
            sound: 'wood',
            hardness: 0.6,
            // Wigwam stoi na ziemi i przechodzi się przez niego.
            solid: !onGround,
            opaque: false,
            model: 'shape',
            cutout: true,
            category: 'budowa',
            textures: support.textures,
            vineSupport: support.mount,
            ...(onGround ? { needsGround: true, modelIcon: `item_${type}` } : {}),
            ...(support.hidden ? { inventory: false, creative: false, drops: support.base, pick: support.base } : {})
        };
        registerShape(support.id, { type, ...SHAPE_OF_MOUNT[support.mount], support: true });
    }

    for (const [species, vine] of Object.entries(VINES)) {

        for (const stage of ['young', ...vine.stages]) {

            const texture = `vine_${species}_${stage}`;
            const next = nextVineStage(species, stage);

            for (const mount of vineMounts(species)) {

                const type = vineType(species, stage, mount);
                const id = vineId(species, stage, mount);
                const supportType = SUPPORT_OF_MOUNT[mount];
                const support = supportType ? VINE_SUPPORTS[supportType] : null;
                const hang = vine.hang && mount === 'roof' && stage === 'ripe';
                // Co zostaje, gdy roślina zniknie: podpora albo nic.
                const leftover = supportType ?? null;
                const seconds = stage === 'young' ? VINE_YOUNG_SECONDS : next === 'dry' ? VINE_DRY_SECONDS : VINE_STAGE_SECONDS;

                blocks[type] = {
                    id,
                    name: `${vine.name} (${stage}, ${mount})`,
                    label: vine.labels?.[stage] ?? STAGE_LABELS[stage](vine),
                    sound: 'plant',
                    category: 'rosliny',
                    inventory: false,
                    creative: false,
                    vine: species,
                    vineStage: stage,
                    vineMount: mount,
                    // Środkowy przycisk bierze owoc albo nasiono (nim się sadzi).
                    pick: vine.seed ?? vine.item,
                    // Zniszczone pnącze nic nie daje (dojrzałe - owoce, jak przy
                    // zbiorze); z podpory zostaje sama podpora (GameInteraction).
                    drops: null,
                    ...(mount === 'wigwam'
                        // Wigwam z fasolą: cały obrazek (tyczki i liście) na płytach.
                        ? { solid: false, opaque: false, model: 'shape', cutout: true, needsGround: true,
                            textures: { all: `bean_wigwam_${stage}` }, vineSupportType: supportType }
                        : mount === 'ground'
                            ? { solid: false, opaque: false, model: 'shape', cutout: true, needsGround: true,
                                textures: { all: texture }, shapeTextures: [texture] }
                            : support
                                ? {
                                    solid: true, opaque: false, model: 'shape', cutout: true, hardness: 0.6,
                                    textures: support.textures,
                                    shapeTextures: hang ? [texture, `vine_${species}_hang`] : [texture],
                                    vineSupportType: supportType
                                }
                                : { solid: false, model: 'flat', flat: { attach: mount }, textures: { all: texture } }),
                    // Roślina jednoroczna: każdy etap "rośnie" (jest na liście
                    // rosnących chunka), żeby zimą mógł zginąć; ostatni etap
                    // tylko czeka (rest).
                    ...(next
                        ? { grows: { into: vineType(species, next, mount), seconds, vine: species, ...(vine.annual ? { annual: true } : {}) } }
                        : vine.annual ? { grows: { into: type, seconds: 1e9, vine: species, annual: true, rest: true } } : {}),
                    ...(stage === 'ripe' ? { harvest: { item: vine.item, count: vine.counts?.[mount] ?? vine.count, becomes: vineType(species, 'leaves', mount) } } : {}),
                    // Suche strąki: zbiór kończy roślinę - zostaje podpora.
                    ...(stage === 'dry' ? { harvest: { item: vine.dryItem, count: vine.dryCounts?.[mount] ?? vine.dryCount, becomes: leftover } } : {}),
                    ...(vine.annual ? { annualLeftover: leftover } : {})
                };

                if (SHAPE_OF_MOUNT[mount]) registerShape(id, { type, ...SHAPE_OF_MOUNT[mount], hang });

                infoByType.set(type, { species, stage, mount });
                infoById.set(id, { species, stage, mount });

            }

        }

    }

    return blocks;

}
