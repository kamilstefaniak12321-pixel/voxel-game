import {
    BLOCK_LIGHT_COLOR
} from '../config.js';

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
//   light          - jak mocno blok świeci: 0-15 (opcjonalne,
//                    domyślnie 0; 15 = najjaśniej, jak lampa).
//                    Tyle bloków mniej więcej sięga jego światło.
//   lightColor     - kolor światła, np. '#ff3020' (opcjonalne,
//                    domyślnie BLOCK_LIGHT_COLOR z config.js)
//   liquid         - ciecz, np. woda (opcjonalne): ściany między
//                    dwoma takimi samymi blokami nie są rysowane,
//                    celownik i stawianie bloków przez nią przechodzą

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

        // Lampa świeci najmocniej, jak się da.

        light: 15,

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

    },


    // Kolorowe lampy. Światła różnych kolorów mieszają się ze sobą
    // (czerwona + niebieska = fioletowe światło między nimi).

    lamp_red: {

        id: 6,
        name: 'Red Lamp',

        solid: true,

        light: 15,
        lightColor: '#ff3a2a',

        textures: {
            all: 'lamp_red'
        }

    },


    lamp_green: {

        id: 7,
        name: 'Green Lamp',

        solid: true,

        light: 15,
        lightColor: '#4cff5a',

        textures: {
            all: 'lamp_green'
        }

    },


    lamp_blue: {

        id: 8,
        name: 'Blue Lamp',

        solid: true,

        light: 15,
        lightColor: '#3a6bff',

        textures: {
            all: 'lamp_blue'
        }

    },


    lamp_purple: {

        id: 9,
        name: 'Purple Lamp',

        solid: true,

        light: 15,
        lightColor: '#b45cff',

        textures: {
            all: 'lamp_purple'
        }

    },


    // Meteoryt - zostaje w kraterze po uderzeniu (src/game/Meteorites.js).
    // Lekko się żarzy.

    meteorite: {

        id: 10,
        name: 'Meteorite',

        solid: true,

        light: 7,
        lightColor: '#ff7a30',

        textures: {
            all: 'meteorite'
        }

    },


    // Piasek - plaże i dno morza (teren realistyczny).

    sand: {

        id: 11,
        name: 'Sand',

        solid: true,

        textures: {
            all: 'sand'
        },

        randomRotation: ['top']

    },


    // Woda - morze w terenie realistycznym. Na razie WSTĘPNA:
    // nieprzezroczysta (widać tylko powierzchnię), bez pływania - gracz
    // chodzi po dnie. Prawdziwa woda (przezroczysta, z pływaniem
    // i płynięciem) - etap 2 w docs/generator-terenu.md.
    //   liquid - ciecz: ściany między dwoma blokami wody nie są
    //            rysowane, a celownik i stawianie bloków przez nią przechodzą.

    water: {

        id: 12,
        name: 'Water',

        solid: false,
        opaque: false,
        liquid: true,

        textures: {
            all: 'water'
        }

    },


    // ------------------------------------------------------------
    // SKAŁY - budowa geologiczna terenu realistycznego
    // (src/world/terrain/Geology.js). Zwykły kamień (stone) jest
    // skałą "domyślną", te są w swoich miejscach:
    // ------------------------------------------------------------

    // Granit - podłoże pod całym lądem; pod górami podchodzi pod
    // samą powierzchnię (granitowe szczyty). Tylko w nim są żyły
    // lepidolitu.

    granite: {

        id: 13,
        name: 'Granite',

        solid: true,

        textures: {
            all: 'granite'
        },

        randomRotation: ['top', 'bottom']

    },


    // Wapień - warstwy na wyżynach i płaskowyżach (białe skałki
    // i urwiska).

    limestone: {

        id: 14,
        name: 'Limestone',

        solid: true,

        textures: {
            all: 'limestone'
        }

    },


    // Piaskowiec - warstwy na nizinach, wybrzeżach i płaskowyżach
    // (pod piaskiem plaż).

    sandstone: {

        id: 15,
        name: 'Sandstone',

        solid: true,

        textures: {
            top: 'sandstone_top',
            side: 'sandstone_side',
            bottom: 'sandstone_top'
        },

        randomRotation: ['top', 'bottom']

    },


    // Łupek - skała gór (nad granitowym trzonem).

    slate: {

        id: 16,
        name: 'Slate',

        solid: true,

        textures: {
            top: 'slate_top',
            side: 'slate_side',
            bottom: 'slate_top'
        },

        randomRotation: ['top', 'bottom']

    },


    // Bazalt - najgłębsze podłoże i dno głębokiego morza.

    basalt: {

        id: 17,
        name: 'Basalt',

        solid: true,

        textures: {
            top: 'basalt_top',
            side: 'basalt_side',
            bottom: 'basalt_top'
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
const liquidById = new Uint8Array(MAX_BLOCK_ID + 1);
const lightById = new Uint8Array(MAX_BLOCK_ID + 1);

// Kolor światła: [czerwony, zielony, niebieski], każdy 0-1.

const lightColorById = new Array(MAX_BLOCK_ID + 1).fill(null);


// '#ff8040' albo 0xff8040 -> [1, 0.5, 0.25]

function parseColor(value, blockType) {

    const number =
        typeof value === 'number'
            ? value
            : parseInt(String(value).replace('#', ''), 16);

    if (!Number.isFinite(number) || number < 0 || number > 0xffffff) {
        throw new Error(`Blok "${blockType}": nieprawidłowy lightColor: ${value}`);
    }

    return [
        ((number >> 16) & 255) / 255,
        ((number >> 8) & 255) / 255,
        (number & 255) / 255
    ];

}


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

    liquidById[id] = definition.liquid ? 1 : 0;

    lightById[id] =
        Math.max(0, Math.min(15, Math.floor(definition.light ?? 0)));

    lightColorById[id] =
        parseColor(definition.lightColor ?? BLOCK_LIGHT_COLOR, type);

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


// Ciecz (woda): bez kolizji, celownik przez nią przechodzi.

export function isLiquidId(id) {

    return liquidById[id] === 1;

}


// Kolor światła bloku: [czerwony, zielony, niebieski], każdy 0-1.

export function getLightColor(id) {

    return lightColorById[id] ?? [1, 1, 1];

}


// Jak mocno blok świeci (0 = wcale, 15 = najjaśniej).

export function getLightEmission(id) {

    return lightById[id];

}
