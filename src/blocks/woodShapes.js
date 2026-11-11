// ------------------------------------------------------------
// WYROBY STOLARSKIE - BLOKI (0.90.0)
//
// Z każdego z 20 rodzajów desek (woods.js): schody, półblok, płot,
// furtka i stół stolarski (długi na dwa bloki). Robi się je na stole
// stolarskim (CarpenterTables.js), sam stół - w siatce rzemiosła.
//
// Numery 10300-10859: po 28 na drewno (WOODS - tylko dopisywać):
//   0-7    schody: kierunek (N, E, S, W) x (dolne, górne - do góry nogami),
//   8-10   półblok: dolny, górny, podwójny (pełny blok, daje 2 półbloki),
//   11     płot (łączy się z sąsiadami - shapeBoxes.js),
//   12-19  furtka: kierunek x (zamknięta, otwarta),
//   20-27  stół: kierunek x (część A - deski, część B - wyroby).
//
// Kształty (pudełka) - src/world/ShapeBoxes.js, rysuje je ChunkMesher
// (model 'shape'), kolizje - Player.collidesAt.
// ------------------------------------------------------------

import { WOODS, woodName } from './woods.js';

export const SHAPE_FIRST_ID = 10300;
export const SHAPES_PER_WOOD = 28;
export const SHAPE_FACINGS = ['north', 'east', 'south', 'west'];

const FACING_INDEX = Object.fromEntries(SHAPE_FACINGS.map((facing, index) => [facing, index]));

// Wyroby w ekwipunku (typ bazowy) i ich nazwy.
export const SHAPE_KINDS = {
    stairs: { suffix: 'stairs', noun: 'Schody', gender: 'n' },
    slab: { suffix: 'slab', noun: 'Półblok', gender: 'm' },
    fence: { suffix: 'fence', noun: 'Płot', gender: 'm' },
    gate: { suffix: 'fence_gate', noun: 'Furtka', gender: 'f' },
    table: { suffix: 'carpenter_table', noun: 'Stół stolarski', gender: 'm' },
    door: { suffix: 'door', noun: 'Drzwi', gender: 'n' },
    trapdoor: { suffix: 'trapdoor', noun: 'Klapa', gender: 'f' }
};

// Drzwi i klapy (0.91.0): numery 10860-11819, po 48 na drewno:
//   0-31   drzwi: kierunek (4) x część (dolna, górna) x zawias (lewy,
//          prawy) x (zamknięte, otwarte),
//   32-47  klapy: kierunek (4) x (dolna, górna) x (zamknięta, otwarta).
// Drzwi rysuje DoorRenderer.js (animacja otwierania z modelu Kamila),
// klapy - ChunkMesher (pudełka). Tekstury: door_<drewno> (16 x 32)
// i trapdoor_<drewno> (tools/drzwi_tekstury.py).
export const DOOR_FIRST_ID = 10860;
export const DOORS_PER_WOOD = 48;

export const shapeBaseType = (wood, kind) => `${wood}_${SHAPE_KINDS[kind].suffix}`;

// Informacja o kształcie po numerze bloku (tablica - szybko w mesherze
// i kolizjach) albo null.
const infoById = new Map();

function variants(entry, index) {

    const first = SHAPE_FIRST_ID + index * SHAPES_PER_WOOD;
    const { wood, texture, planks } = entry;
    const out = [];
    const common = (kind) => ({
        label: woodName(entry, SHAPE_KINDS[kind].noun, SHAPE_KINDS[kind].gender),
        name: `${wood} ${SHAPE_KINDS[kind].suffix}`,
        category: 'drewno',
        sound: 'wood',
        hardness: 1.2,
        textures: { all: texture },
        pick: shapeBaseType(wood, kind),
        drops: shapeBaseType(wood, kind),
        wood: { wood, planks, texture }
    });
    const hidden = { inventory: false, creative: false };
    const add = (type, id, definition, info) => {
        out.push([type, { id, ...definition }]);
        infoById.set(id, { type, wood, planks, texture, ...info });
    };

    // Schody.
    const stairs = shapeBaseType(wood, 'stairs');
    SHAPE_FACINGS.forEach((facing, f) => ['bottom', 'top'].forEach((half, h) => {
        const type = f === 0 && h === 0 ? stairs : `${stairs}_${facing}_${half}`;
        add(type, first + f * 2 + h, { ...common('stairs'), solid: true, opaque: false, model: 'shape',
            ...(type === stairs ? {} : hidden) }, { kind: 'stairs', facing, half });
    }));

    // Półbloki.
    const slab = shapeBaseType(wood, 'slab');
    add(slab, first + 8, { ...common('slab'), solid: true, opaque: false, model: 'shape' }, { kind: 'slab', half: 'bottom' });
    add(`${slab}_top`, first + 9, { ...common('slab'), solid: true, opaque: false, model: 'shape', ...hidden }, { kind: 'slab', half: 'top' });
    add(`${slab}_double`, first + 10, { ...common('slab'), solid: true, opaque: true, dropCount: 2, ...hidden }, { kind: 'slab', half: 'double' });

    // Płot.
    add(shapeBaseType(wood, 'fence'), first + 11, { ...common('fence'), solid: true, opaque: false, model: 'shape' }, { kind: 'fence' });

    // Furtka.
    const gate = shapeBaseType(wood, 'gate');
    SHAPE_FACINGS.forEach((facing, f) => [false, true].forEach((open, o) => {
        const type = f === 0 && !open ? gate : `${gate}_${facing}${open ? '_open' : ''}`;
        add(type, first + 12 + f * 2 + o, { ...common('gate'), solid: true, opaque: false, model: 'shape',
            ...(type === gate ? {} : hidden) }, { kind: 'gate', facing, open });
    }));

    // Stół stolarski: część A (tu leżą deski) i B (wyroby).
    const table = shapeBaseType(wood, 'table');
    SHAPE_FACINGS.forEach((facing, f) => ['a', 'b'].forEach((part, p) => {
        const type = f === 0 && part === 'a' ? table : `${table}_${facing}_${part}`;
        add(type, first + 20 + f * 2 + p, { ...common('table'), solid: true, opaque: false, model: 'shape',
            ...(type === table ? {} : hidden) }, { kind: 'table', facing, part });
    }));

    // Drzwi i klapy (drugi zakres numerów).
    const doorFirst = DOOR_FIRST_ID + index * DOORS_PER_WOOD;
    const doorTexture = `door_${wood}`, trapTexture = `trapdoor_${wood}`;
    const door = shapeBaseType(wood, 'door');
    SHAPE_FACINGS.forEach((facing, f) => ['lower', 'upper'].forEach((part, h) => ['left', 'right'].forEach((hinge, g) => [false, true].forEach((open, o) => {
        const base = f === 0 && h === 0 && g === 0 && !open;
        const type = base ? door : `${door}_${facing}_${part}_${hinge}${open ? '_open' : ''}`;
        add(type, doorFirst + f * 8 + h * 4 + g * 2 + o, { ...common('door'), textures: { all: doorTexture }, solid: true, opaque: false,
            model: 'door', ...(base ? {} : hidden) }, { kind: 'door', facing, part, hinge, open, texture: doorTexture });
    }))));
    const trapdoor = shapeBaseType(wood, 'trapdoor');
    SHAPE_FACINGS.forEach((facing, f) => ['bottom', 'top'].forEach((half, h) => [false, true].forEach((open, o) => {
        const base = f === 0 && h === 0 && !open;
        const type = base ? trapdoor : `${trapdoor}_${facing}_${half}${open ? '_open' : ''}`;
        add(type, doorFirst + 32 + f * 4 + h * 2 + o, { ...common('trapdoor'), textures: { all: trapTexture }, solid: true, opaque: false,
            model: 'shape', ...(base ? {} : hidden) }, { kind: 'trapdoor', facing, half, open, texture: trapTexture });
    })));

    return out;
}

export const WOOD_SHAPE_BLOCKS = Object.fromEntries(WOODS.flatMap(variants));

export function shapeInfo(id) {
    return infoById.get(id) ?? null;
}

export function isShapeId(id) {
    return infoById.has(id);
}

export function isDoorId(id) {
    return id >= DOOR_FIRST_ID && id < DOOR_FIRST_ID + WOODS.length * DOORS_PER_WOOD && infoById.get(id)?.kind === 'door';
}

// Numer bloku wyrobu danego drewna w danym stanie.
export function shapeId(wood, kind, { facing = 'north', half = 'bottom', open = false, part = 'a', hinge = 'left' } = {}) {
    const index = WOODS.findIndex((entry) => entry.wood === wood);
    if (index < 0) return 0;
    const first = SHAPE_FIRST_ID + index * SHAPES_PER_WOOD;
    const f = FACING_INDEX[facing] ?? 0;
    const doorFirst = DOOR_FIRST_ID + index * DOORS_PER_WOOD;
    if (kind === 'door') return doorFirst + f * 8 + (part === 'upper' ? 4 : 0) + (hinge === 'right' ? 2 : 0) + (open ? 1 : 0);
    if (kind === 'trapdoor') return doorFirst + 32 + f * 4 + (half === 'top' ? 2 : 0) + (open ? 1 : 0);
    if (kind === 'stairs') return first + f * 2 + (half === 'top' ? 1 : 0);
    if (kind === 'slab') return first + 8 + (half === 'top' ? 1 : half === 'double' ? 2 : 0);
    if (kind === 'fence') return first + 11;
    if (kind === 'gate') return first + 12 + f * 2 + (open ? 1 : 0);
    if (kind === 'table') return first + 20 + f * 2 + (part === 'b' ? 1 : 0);
    return 0;
}

// Typ bazowy (przedmiot) -> { wood, kind }.
export function shapeItem(type) {
    for (const entry of WOODS) for (const kind of Object.keys(SHAPE_KINDS)) {
        if (shapeBaseType(entry.wood, kind) === type) return { wood: entry.wood, kind };
    }
    return null;
}

// Kierunki: wektor w stronę "facing" i obroty.
export const FACING_VECTOR = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };

export function oppositeFacing(facing) {
    return SHAPE_FACINGS[(FACING_INDEX[facing] + 2) % 4];
}

// W którą stronę patrzy gracz (yaw: patrzy w stronę (-sin yaw, -cos yaw)).
export function lookFacing(yaw) {
    const x = -Math.sin(yaw), z = -Math.cos(yaw);
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'east' : 'west';
    return z > 0 ? 'south' : 'north';
}

// Prawa strona gracza, który patrzy w stronę "look" (druga część stołu).
export function rightOf(look) {
    return SHAPE_FACINGS[(FACING_INDEX[look] + 1) % 4];
}
