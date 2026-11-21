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
// Numery (zakres 15600-15999, docs/numery-blokow.md):
//   15600-15603  podpory: kratka (wzdłuż x), kratka (wzdłuż z), tyczka,
//                pergola,
//   15616 + 64 × gatunek + 8 × etap + mocowanie (kolejność VINE_STAGES
//                i VINE_MOUNTS).
// Raz nadanego numeru nie wolno zmieniać.
// ------------------------------------------------------------

import { BUSH_GROWTH_SECONDS } from '../config.js';
import { registerShape } from './woodShapes.js';

export const VINE_FIRST_ID = 15600;
export const VINE_END_ID = 16000;
const SPECIES_FIRST_ID = 15616;
const SPECIES_SLOTS = 64;

export const VINE_STAGES = ['young', 'leaves', 'flower', 'unripe', 'ripe'];
export const VINE_MOUNTS = ['north', 'south', 'east', 'west', 'trellis', 'trellis_z', 'pole', 'roof'];
export const FLAT_MOUNTS = ['north', 'south', 'east', 'west'];

// Ile sekund trwa etap i po ilu łodyga staje się liśćmi.
export const VINE_STAGE_SECONDS = 240;
export const VINE_YOUNG_SECONDS = BUSH_GROWTH_SECONDS;

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
    pergola: { id: 15603, mount: 'roof', name: 'Pergola', label: 'Pergola', textures: { all: 'pergola_slats' } }
};

// Podpora pod mocowaniem (null - pełny blok obok).
export const SUPPORT_OF_MOUNT = Object.fromEntries(Object.entries(VINE_SUPPORTS).map(([type, support]) => [support.mount, type]));

// Pola gatunku:
//   index        - numer gatunku (numery bloków),
//   name / label / of - nazwa po angielsku, po polsku i w dopełniaczu,
//   stages       - etapy po łodydze (young), po kolei,
//   item / count - co i ile daje zbiór dojrzałych owoców,
//   height       - najwyżej tyle bloków nad ziemią,
//   hang         - owoce wiszą pod pergolą (tekstura vine_<gatunek>_hang),
//   labels       - nazwy etapów (bez wpisu - domyślne).
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
    }

};

export const VINE_NAMES = Object.keys(VINES);

export function vineType(species, stage, mount) {
    return `vine_${species}_${stage}_${mount}`;
}

export function vineId(species, stage, mount) {
    return SPECIES_FIRST_ID + VINES[species].index * SPECIES_SLOTS + VINE_STAGES.indexOf(stage) * 8 + VINE_MOUNTS.indexOf(mount);
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

// Gatunek pnącza, który się sadzi tym owocem (null - żaden).
export function vineOfItem(item) {
    return VINE_NAMES.find((species) => VINES[species].item === item) ?? null;
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
    ripe: (vine) => `${vine.label} (owoce)`
};

// Rodzaj kształtu (ShapeBoxes.js) dla mocowania na podporze.
const SHAPE_OF_MOUNT = {
    trellis: { kind: 'vine_trellis', facing: 'north' },
    trellis_z: { kind: 'vine_trellis', facing: 'east' },
    pole: { kind: 'vine_pole' },
    roof: { kind: 'vine_roof' }
};

// Wszystkie bloki pnączy i podpór (do BLOCK_TYPES w BlockRegistry.js).
export function vineBlocks() {

    const blocks = {};

    for (const [type, support] of Object.entries(VINE_SUPPORTS)) {
        blocks[type] = {
            id: support.id,
            name: support.name,
            label: support.label,
            sound: 'wood',
            hardness: 0.6,
            solid: true,
            opaque: false,
            model: 'shape',
            cutout: true,
            category: 'budowa',
            textures: support.textures,
            vineSupport: support.mount,
            ...(support.hidden ? { inventory: false, creative: false, drops: support.base, pick: support.base } : {})
        };
        registerShape(support.id, { type, ...SHAPE_OF_MOUNT[support.mount], support: true });
    }

    for (const [species, vine] of Object.entries(VINES)) {

        for (const stage of ['young', ...vine.stages]) {

            const texture = `vine_${species}_${stage}`;
            const next = nextVineStage(species, stage);

            for (const mount of VINE_MOUNTS) {

                const type = vineType(species, stage, mount);
                const id = vineId(species, stage, mount);
                const supportType = SUPPORT_OF_MOUNT[mount];
                const support = supportType ? VINE_SUPPORTS[supportType] : null;
                const hang = vine.hang && mount === 'roof' && stage === 'ripe';

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
                    // Środkowy przycisk bierze owoc (nim się sadzi).
                    pick: vine.item,
                    // Zniszczone pnącze nic nie daje (dojrzałe - owoce, jak przy
                    // zbiorze); z podpory zostaje sama podpora (GameInteraction).
                    drops: null,
                    ...(support
                        ? {
                            solid: true, opaque: false, model: 'shape', cutout: true, hardness: 0.6,
                            textures: support.textures,
                            shapeTextures: hang ? [texture, `vine_${species}_hang`] : [texture],
                            vineSupportType: supportType
                        }
                        : { solid: false, model: 'flat', flat: { attach: mount }, textures: { all: texture } }),
                    ...(next ? { grows: { into: vineType(species, next, mount), seconds: stage === 'young' ? VINE_YOUNG_SECONDS : VINE_STAGE_SECONDS, vine: species } } : {}),
                    ...(stage === 'ripe' ? { harvest: { item: vine.item, count: vine.count, becomes: vineType(species, 'leaves', mount) } } : {})
                };

                if (support) registerShape(id, { type, ...SHAPE_OF_MOUNT[mount], hang });

                infoByType.set(type, { species, stage, mount });
                infoById.set(id, { species, stage, mount });

            }

        }

    }

    return blocks;

}
