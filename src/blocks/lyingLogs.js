// ------------------------------------------------------------
// LEŻĄCE PNIE (1.36.0, ścinanie drzew - docs/scinanie.md)
//
// Ścięte drzewo pada i zostaje po nim leżący pień: bloki pnia położone
// wzdłuż osi X albo Z. To zwykłe bloki (pełne, bez własnego stanu) -
// różnią się od stojącego pnia tylko tym, na których ścianach jest
// przekrój, a na których kora (obrócona wzdłuż pnia).
//
// Numery: 16100 + 2 × miejsce gatunku na liście LYING_WOODS (+0 wzdłuż
// X, +1 wzdłuż Z). Listę wolno tylko wydłużać - numer raz nadany zostaje
// (docs/numery-blokow.md). Zarezerwowane 16100-16299 (100 gatunków).
//
// Leżący pień wykopany daje zwykły pień gatunku (<gatunek>_log).
//
// 1.37.0 (powalone drzewa - docs/powalone-drzewa.md):
//   - okorowany leżący pień: 16400 + 2 × miejsce gatunku (+0 X, +1 Z),
//     zarezerwowane 16400-16599. Korę z leżącego pnia zdziera się
//     siekierą albo gołą ręką (PPM),
//   - spróchniały pień (jeden dla wszystkich gatunków): 16300 wzdłuż X,
//     16301 wzdłuż Z - pusty w środku, wyłamuje się go gołą ręką,
//   - sucha gałąź przy powalonym pniu: 16302 - łamie się na patyki.
// ------------------------------------------------------------

import { TREE_CATALOG } from './treeCatalog.js';

export const LYING_FIRST_ID = 16100;
export const LYING_STRIPPED_FIRST_ID = 16400;
export const ROTTEN_FIRST_ID = 16300;
export const DEAD_BRANCH_ID = 16302;
export const DEAD_BRANCH = 'dead_branch';
// Przedmiot ze spróchniałego pnia (game/CampfireState.js - pali się jak polano).
export const ROTTEN_WOOD = 'rotten_wood';

export const LYING_WOODS = [
    'spruce', 'pine', 'beech', 'linden', 'oak', 'birch', 'jablon', 'olcha', 'wierzba', 'acacia',
    'bald_cypress', 'cherry', 'maple', 'mugo', 'olive', 'rainbow_eucalyptus', 'sequoia', 'ginkgo', 'jacaranda', 'fir',
    'baobab', 'coconut_palm', 'larch', 'mangrove', 'kapok', 'joshua_tree', 'aspen', 'araucaria', 'banyan', 'dragon_tree',
    'cedar', 'bristlecone'
];

export const LYING_AXES = ['x', 'z'];

// Nazwa bloku leżącego pnia gatunku wzdłuż osi 'x' albo 'z'.
export function lyingLogType(wood, axis) {
    return `${wood}_log_${axis}`;
}

// Okorowany leżący pień i spróchniały pień.
export function lyingStrippedType(wood, axis) {
    return `${wood}_log_stripped_${axis}`;
}
export function rottenLogType(axis) {
    return `rotten_log_${axis}`;
}

// Obrót kory na ścianach (kolejność ścian: +X, -X, +Y, -Y, +Z, -Z), żeby
// słoje biegły wzdłuż pnia. Ściany z przekrojem zostają bez obrotu.
export const LYING_TURNS = {
    x: [0, 0, 1, 1, 1, 1],
    z: [1, 1, 0, 0, 0, 0]
};

// Ściany z przekrojem pnia (czoła).
const END_FACES = { x: ['right', 'left'], z: ['front', 'back'] };
const FACES = ['right', 'left', 'top', 'bottom', 'front', 'back'];

function lyingLabel(label) {
    return label.startsWith('Pień ') ? `Leżący pień ${label.slice(5)}` : `${label} (leżący)`;
}

export function lyingLogBlocks() {
    const blocks = {};
    LYING_WOODS.forEach((wood, index) => {
        const tree = TREE_CATALOG[wood];
        if (!tree) throw new Error(`Leżący pień: nieznane drzewo ${wood}`);
        LYING_AXES.forEach((axis, turn) => {
            const textures = Object.fromEntries(FACES.map((face) =>
                [face, END_FACES[axis].includes(face) ? tree.textures.logTop : tree.textures.logSide]));
            blocks[lyingLogType(wood, axis)] = {
                id: LYING_FIRST_ID + index * 2 + turn,
                name: `Lying ${tree.name} Log (${axis.toUpperCase()})`,
                label: lyingLabel(tree.labels[0]),
                tree: wood,
                // Nie 'log': to nie jest pień żywego drzewa ani kłoda do przepisów.
                part: 'lying',
                lying: axis,
                // Arkusz kory jak stojący pień (rendering/BlockRenderData.js).
                barkOf: `${wood}_log`,
                sound: 'wood',
                solid: true,
                textures,
                drops: `${wood}_log`,
                pick: `${wood}_log`,
                strip: lyingStrippedType(wood, axis),
                inventory: false,
                creative: false
            };
            const stripped = Object.fromEntries(FACES.map((face) =>
                [face, END_FACES[axis].includes(face) ? tree.textures.strippedTop : tree.textures.strippedSide]));
            blocks[lyingStrippedType(wood, axis)] = {
                id: LYING_STRIPPED_FIRST_ID + index * 2 + turn,
                name: `Lying Stripped ${tree.name} Log (${axis.toUpperCase()})`,
                label: `${lyingLabel(tree.labels[0])} (okorowany)`,
                tree: wood,
                part: 'lying',
                lying: axis,
                barkOf: `${wood}_log_stripped`,
                sound: 'wood',
                solid: true,
                textures: stripped,
                drops: `${wood}_log_stripped`,
                pick: `${wood}_log_stripped`,
                inventory: false,
                creative: false
            };
        });
    });
    // Spróchniały pień: kruchy (ręką), daje spróchniałe drewno.
    LYING_AXES.forEach((axis, turn) => {
        blocks[rottenLogType(axis)] = {
            id: ROTTEN_FIRST_ID + turn,
            name: `Rotten Log (${axis.toUpperCase()})`,
            label: 'Spróchniały pień',
            part: 'rotten',
            lying: axis,
            rotten: true,
            sound: 'wood',
            solid: true,
            hardness: 0.9,
            textures: Object.fromEntries(FACES.map((face) => [face, END_FACES[axis].includes(face) ? 'rotten_log_end' : 'rotten_log_side'])),
            drops: ROTTEN_WOOD,
            pick: ROTTEN_WOOD,
            inventory: false,
            creative: false
        };
    });
    // Sucha gałąź: sterczy z ziemi przy powalonym pniu.
    blocks[DEAD_BRANCH] = {
        id: DEAD_BRANCH_ID,
        name: 'Dead Branch',
        label: 'Sucha gałąź',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 1, width: 0.46 },
        sound: 'wood',
        hardness: 0.35,
        textures: { all: 'dead_branch' },
        drops: 'stick',
        dropCount: 2,
        pick: 'stick',
        inventory: false,
        creative: false
    };
    return blocks;
}

// Gatunek i oś leżącego pnia po nazwie bloku albo null.
const LYING_INFO = new Map(LYING_WOODS.flatMap((wood) => LYING_AXES.flatMap((axis) => [
    [lyingLogType(wood, axis), { wood, axis, stripped: false }],
    [lyingStrippedType(wood, axis), { wood, axis, stripped: true }]
])));
export function lyingLogInfo(type) {
    return LYING_INFO.get(type) ?? null;
}
