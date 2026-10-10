// ID 0 jest zarezerwowane dla powietrza.
// Chunk przechowuje bloki jako liczby, więc pusta tablica = samo powietrze.

export const AIR_ID = 0;

// Chunk trzyma ID w Uint8Array, więc mieszczą się wartości 1-255.

export const MAX_BLOCK_ID = 255;


// Pola definicji bloku:
//
//   id             - unikalny numer 1-255 (zapisywany w chunkach)
//   name           - nazwa wyświetlana w HUD
//   solid          - czy blok ma kolizję
//   opaque         - czy blok całkowicie zasłania sąsiada
//                    (opcjonalne, domyślnie takie samo jak solid;
//                    przyda się przy szkle albo liściach)
//   textures       - all  albo  top / side / bottom
//   randomRotation - lista ścian, których tekstura ma być losowo
//                    obracana o 0/90/180/270 stopni (opcjonalne)

export const BLOCK_TYPES = {

    grass: {

        id: 1,
        name: 'Grass Block',

        solid: true,

        textures: {
            top: 'grass_top',
            side: 'grass_side',
            bottom: 'dirt'
        },

        randomRotation: ['top']

    },


    dirt: {

        id: 2,
        name: 'Dirt',

        solid: true,

        textures: {
            all: 'dirt'
        }

    },


    stone: {

        id: 3,
        name: 'Stone',

        solid: true,

        textures: {
            all: 'stone'
        }

    },


    lamp: {

        id: 4,
        name: 'Lamp',

        solid: true,

        textures: {
            all: 'lamp'
        }

    },


    lepidolite: {

        id: 5,
        name: 'Lepidolite',

        solid: true,

        textures: {
            all: 'lepidolite'
        }

    }

};

// ------------------------------------------------------------
// Tablice ID -> dane bloku.
// Budowane raz przy starcie, żeby chunki i kolizje nie musiały
// za każdym razem szukać bloku po nazwie.
// ------------------------------------------------------------

const typeById = new Array(MAX_BLOCK_ID + 1).fill(null);

const solidById = new Uint8Array(MAX_BLOCK_ID + 1);
const opaqueById = new Uint8Array(MAX_BLOCK_ID + 1);


for (const [type, definition] of Object.entries(BLOCK_TYPES)) {

    const id = definition.id;


    if (
        !Number.isInteger(id) ||
        id <= AIR_ID ||
        id > MAX_BLOCK_ID
    ) {

        throw new Error(
            `Blok "${type}" ma nieprawidłowe id: ${id} ` +
            `(dozwolone 1-${MAX_BLOCK_ID}, 0 to powietrze)`
        );

    }


    if (typeById[id] !== null) {

        throw new Error(
            `Bloki "${typeById[id]}" i "${type}" mają to samo id: ${id}`
        );

    }


    typeById[id] = type;

    solidById[id] = definition.solid ? 1 : 0;

    opaqueById[id] =
        (definition.opaque ?? definition.solid) ? 1 : 0;

}

// ------------------------------------------------------------

export function getBlockDefinition(type) {

    return BLOCK_TYPES[type] || null;

}


export function blockExists(type) {

    return getBlockDefinition(type) !== null;

}

// ------------------------------------------------------------
// Przeliczanie nazwa <-> ID.
// ------------------------------------------------------------

// Zwraca ID bloku o podanej nazwie albo AIR_ID, jeśli go nie ma.

export function getBlockId(type) {

    const definition = getBlockDefinition(type);

    return definition ? definition.id : AIR_ID;

}


// Zwraca nazwę bloku o podanym ID albo null dla powietrza.

export function getBlockTypeById(id) {

    return typeById[id] ?? null;

}


export function isSolidId(id) {

    return solidById[id] === 1;

}


export function isOpaqueId(id) {

    return opaqueById[id] === 1;

}
