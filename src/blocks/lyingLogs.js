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
// ------------------------------------------------------------

import { TREE_CATALOG } from './treeCatalog.js';

export const LYING_FIRST_ID = 16100;

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
                sound: 'wood',
                solid: true,
                textures,
                drops: `${wood}_log`,
                pick: `${wood}_log`,
                inventory: false,
                creative: false
            };
        });
    });
    return blocks;
}

// Gatunek i oś leżącego pnia po nazwie bloku albo null.
const LYING_INFO = new Map(LYING_WOODS.flatMap((wood) => LYING_AXES.map((axis) => [lyingLogType(wood, axis), { wood, axis }])));
export function lyingLogInfo(type) {
    return LYING_INFO.get(type) ?? null;
}
