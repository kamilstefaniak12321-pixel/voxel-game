import {
    BLOCK_LIGHT_COLOR,
    BUSH_GROWTH_SECONDS
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
//   label          - nazwa po polsku (pasek bloków, ekwipunek)
//   model          - 'cube' (zwykły sześcian, domyślnie) albo 'cross'
//                    (roślina: kilka skrzyżowanych płaszczyzn z teksturą
//                    z przezroczystością; tekstury roślin są w wierszu 2
//                    atlasu - shader kołysze je na wietrze)
//   plant          - kształt rośliny: { planes: 2 albo 3, height, width }
//   soil           - na tym bloku mogą rosnąć rośliny
//   replaceable    - postawienie bloku w tym miejscu zastępuje ten
//                    (np. trawa) - jak w Minecrafcie
//   drops          - co trafia do ekwipunku po zniszczeniu w trybie
//                    przygody (domyślnie ten sam blok, null = nic)
//   creative       - false = nie ma go w ekwipunku kreatywnym
//   sound          - materiał dźwięków (kroki, stawianie, niszczenie):
//                    grass, dirt, stone, sand, gravel, mud, plant, glass
//                    (src/audio/sounds.js); domyślnie roślina - plant,
//                    inne - stone
//   grows          - roślina rośnie (src/game/PlantGrowth.js):
//                    { into: następny etap, seconds: średnio po ilu
//                    sekundach }
//   harvest        - PPM zbiera z rośliny przedmioty: { item, count:
//                    [najmniej, najwięcej], becomes: blok po zbiorze };
//                    zniszczenie rośliny w przygodzie też je daje

// ------------------------------------------------------------
// KRZAKI OWOCOWE
//
// Każdy gatunek rośnie w czterech etapach (src/game/PlantGrowth.js):
//
//   <gatunek>_sapling   - sadzonka,
//   <gatunek>_bush      - krzak bez owoców,
//   <gatunek>_bush_few  - kilka owoców,
//   <gatunek>_bush_full - pełen owoców.
//
// PPM na krzaku z owocami zbiera je - krzak wraca do etapu "bez
// owoców" i owocuje od nowa. Owoc posadzony na ziemi daje sadzonkę
// (src/items/ItemRegistry.js). Zniszczony krzak (przygoda) daje
// sadzonkę i owoce, które na nim były.
//
// Tekstury: wiersz 3 atlasu (sadzonka i krzak bez owoców wspólne).
// ------------------------------------------------------------

export const FRUIT_BUSHES = {

    raspberry: {
        firstId: 34,
        name: 'Raspberry',
        item: 'raspberry',
        labels: ['Sadzonka maliny', 'Krzak maliny', 'Krzak maliny (kilka owoców)', 'Krzak maliny (pełen owoców)'],
        harvest: [[1, 2], [2, 4]]
    },

    blackberry: {
        firstId: 38,
        name: 'Blackberry',
        item: 'blackberry',
        labels: ['Sadzonka jeżyny', 'Krzak jeżyny', 'Krzak jeżyny (kilka owoców)', 'Krzak jeżyny (pełen owoców)'],
        harvest: [[1, 2], [2, 4]]
    },

    currant: {
        firstId: 42,
        name: 'Currant',
        item: 'currants',
        labels: ['Sadzonka porzeczki', 'Krzak porzeczki', 'Krzak porzeczki (kilka owoców)', 'Krzak porzeczki (pełen owoców)'],
        harvest: [[1, 2], [2, 4]]
    },

    hazel: {
        firstId: 46,
        name: 'Hazel',
        item: 'hazelnut',
        labels: ['Sadzonka leszczyny', 'Leszczyna', 'Leszczyna (kilka orzechów)', 'Leszczyna (pełna orzechów)'],
        harvest: [[1, 2], [2, 3]]
    }

};

// Nazwy bloków kolejnych etapów: [sadzonka, krzak, kilka, pełen].

export function bushStages(species) {

    return [`${species}_sapling`, `${species}_bush`, `${species}_bush_few`, `${species}_bush_full`];

}


function fruitBushBlocks() {

    const blocks = {};

    for (const [species, bush] of Object.entries(FRUIT_BUSHES)) {

        const stages = bushStages(species);

        const textures = ['bush_sapling', 'bush_leaves', `${species}_bush_few`, `${species}_bush_full`];

        const names = ['Sapling', 'Bush', 'Bush (Few Fruits)', 'Bush (Full)'];

        stages.forEach((type, stage) => {

            const fruiting = stage >= 2;

            blocks[type] = {

                id: bush.firstId + stage,
                name: `${bush.name} ${names[stage]}`,
                label: bush.labels[stage],

                solid: false,
                model: 'cross',

                plant: stage === 0
                    ? { planes: 2, height: 1, width: 0.42 }
                    : { planes: 3, height: 1, width: 0.5 },

                textures: { all: textures[stage] },

                // Zniszczony krzak daje sadzonkę.
                drops: stages[0],

                bush: species,
                stage,

                grows: stage < 3
                    ? { into: stages[stage + 1], seconds: BUSH_GROWTH_SECONDS }
                    : undefined,

                harvest: fruiting
                    ? { item: bush.item, count: bush.harvest[stage - 2], becomes: stages[1] }
                    : undefined

            };

        });

    }

    return blocks;

}

// ------------------------------------------------------------

export const BLOCK_TYPES = {

    grass: {

        id: 1,
        name: 'Grass Block',

        label: 'Blok trawy',

        sound: 'grass',

        soil: true,
        drops: 'dirt',

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

        label: 'Ziemia',

        sound: 'dirt',

        soil: true,

        solid: true,

        textures: {
            all: 'dirt'
        }

    },


    stone: {

        id: 3,
        name: 'Stone',

        label: 'Kamień',

        sound: 'stone',

        solid: true,

        textures: {
            all: 'stone'
        }

    },


    lamp: {

        id: 4,
        name: 'Lamp',

        label: 'Lampa',

        sound: 'glass',

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

        label: 'Lepidolit',

        sound: 'stone',

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

        label: 'Czerwona lampa',

        sound: 'glass',

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

        label: 'Zielona lampa',

        sound: 'glass',

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

        label: 'Niebieska lampa',

        sound: 'glass',

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

        label: 'Fioletowa lampa',

        sound: 'glass',

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

        label: 'Meteoryt',

        sound: 'stone',

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

        label: 'Piasek',

        sound: 'sand',

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

        label: 'Woda',

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

        label: 'Granit',

        sound: 'stone',

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

        label: 'Wapień',

        sound: 'stone',

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

        label: 'Piaskowiec',

        sound: 'stone',

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

        label: 'Łupek',

        sound: 'stone',

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

        label: 'Bazalt',

        sound: 'stone',

        solid: true,

        textures: {
            top: 'basalt_top',
            side: 'basalt_side',
            bottom: 'basalt_top'
        }

    },


    // ------------------------------------------------------------
    // RODZAJE ZIEMI - na wszystkich mogą rosnąć rośliny.
    // ------------------------------------------------------------

    humus: {
        id: 18,
        name: 'Humus',
        label: 'Czarnoziem',
        sound: 'dirt',
        solid: true,
        soil: true,
        textures: { all: 'humus' },
        randomRotation: ['top', 'bottom']
    },

    coarse_dirt: {
        id: 19,
        name: 'Coarse Dirt',
        label: 'Ziemia kamienista',
        sound: 'gravel',
        solid: true,
        soil: true,
        textures: { all: 'coarse_dirt' },
        randomRotation: ['top', 'bottom']
    },

    // Ściółka leśna: igły i liście na wierzchu, ziemia pod spodem.
    forest_floor: {
        id: 20,
        name: 'Forest Floor',
        label: 'Ściółka leśna',
        sound: 'grass',
        solid: true,
        soil: true,
        textures: { top: 'forest_floor_top', side: 'forest_floor_side', bottom: 'dirt' },
        randomRotation: ['top']
    },

    mud: {
        id: 21,
        name: 'Mud',
        label: 'Błoto',
        sound: 'mud',
        solid: true,
        soil: true,
        textures: { all: 'mud' },
        randomRotation: ['top', 'bottom']
    },

    clay: {
        id: 22,
        name: 'Clay',
        label: 'Glina',
        sound: 'mud',
        solid: true,
        soil: true,
        textures: { all: 'clay' }
    },

    gravel: {
        id: 23,
        name: 'Gravel',
        label: 'Żwir',
        sound: 'gravel',
        solid: true,
        textures: { all: 'gravel' },
        randomRotation: ['top', 'bottom']
    },


    // ------------------------------------------------------------
    // ROŚLINY - model 'cross': skrzyżowane płaszczyzny, bez kolizji,
    // nie zasłaniają światła, rosną tylko na ziemi (soil). Zniszczenie
    // bloku pod rośliną niszczy też roślinę.
    // ------------------------------------------------------------

    short_grass: {
        id: 24,
        name: 'Short Grass',
        label: 'Krótka trawa',
        solid: false,
        model: 'cross',
        plant: { planes: 3, height: 1, width: 0.48 },
        replaceable: true,
        textures: { all: 'short_grass' }
    },

    tall_grass: {
        id: 25,
        name: 'Tall Grass',
        label: 'Wysoka trawa',
        solid: false,
        model: 'cross',
        plant: { planes: 3, height: 1, width: 0.48 },
        replaceable: true,
        textures: { all: 'tall_grass' }
    },

    fern: {
        id: 26,
        name: 'Fern',
        label: 'Paproć',
        solid: false,
        model: 'cross',
        plant: { planes: 3, height: 0.95, width: 0.5 },
        replaceable: true,
        textures: { all: 'fern' }
    },

    clover: {
        id: 27,
        name: 'Clover',
        label: 'Koniczyna',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.75, width: 0.42 },
        textures: { all: 'clover' }
    },

    nettle: {
        id: 28,
        name: 'Nettle',
        label: 'Pokrzywa',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 1, width: 0.42 },
        textures: { all: 'nettle' }
    },

    plantain: {
        id: 29,
        name: 'Plantain',
        label: 'Babka zwyczajna',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.8, width: 0.42 },
        textures: { all: 'plantain' }
    },

    poppy: {
        id: 30,
        name: 'Poppy',
        label: 'Mak',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.85, width: 0.4 },
        textures: { all: 'poppy' }
    },

    cornflower: {
        id: 31,
        name: 'Cornflower',
        label: 'Chaber',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.85, width: 0.4 },
        textures: { all: 'cornflower' }
    },

    chamomile: {
        id: 32,
        name: 'Chamomile',
        label: 'Rumianek',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.8, width: 0.42 },
        textures: { all: 'chamomile' }
    },

    dandelion: {
        id: 33,
        name: 'Dandelion',
        label: 'Mniszek',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.8, width: 0.42 },
        textures: { all: 'dandelion' }
    },


    // Krzaki owocowe (FRUIT_BUSHES wyżej) - po 4 bloki na gatunek.

    ...fruitBushBlocks()

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
const plantById = new Uint8Array(MAX_BLOCK_ID + 1);
const soilById = new Uint8Array(MAX_BLOCK_ID + 1);
const replaceableById = new Uint8Array(MAX_BLOCK_ID + 1);
const lightById = new Uint8Array(MAX_BLOCK_ID + 1);
const growsById = new Uint8Array(MAX_BLOCK_ID + 1);

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

    plantById[id] = definition.model === 'cross' ? 1 : 0;

    soilById[id] = definition.soil ? 1 : 0;

    replaceableById[id] = definition.replaceable ? 1 : 0;

    growsById[id] = definition.grows ? 1 : 0;

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


// Roślina (model 'cross') - rośnie tylko na ziemi (soil).

export function isPlantId(id) {

    return plantById[id] === 1;

}


// Czy na tym bloku mogą rosnąć rośliny.

export function isSoilId(id) {

    return soilById[id] === 1;

}


// Czy postawienie bloku w tym miejscu po prostu ten blok zastępuje.

export function isReplaceableId(id) {

    return replaceableById[id] === 1;

}


// Nazwa bloku po polsku (albo zwykła nazwa, gdy nie ma polskiej).

export function getBlockLabel(type) {

    const definition = BLOCK_TYPES[type];

    return definition ? (definition.label ?? definition.name) : type;

}


// Czy roślina jeszcze rośnie (ma kolejny etap - PlantGrowth.js).

export function isGrowingId(id) {

    return growsById[id] === 1;

}


// Wzrost rośliny: { into, seconds } albo null.

export function getGrowth(type) {

    return BLOCK_TYPES[type]?.grows ?? null;

}


// Zbiór z rośliny (PPM): { item, count: [min, max], becomes } albo null.

export function getHarvest(type) {

    return BLOCK_TYPES[type]?.harvest ?? null;

}


// Co trafia do ekwipunku po zniszczeniu bloku (tryb przygody).

export function getDropType(type) {

    const definition = BLOCK_TYPES[type];

    if (!definition) {
        return null;
    }

    return definition.drops === undefined ? type : definition.drops;

}


// Materiał dźwięków bloku (src/audio/sounds.js).

export function getBlockSound(type) {

    const definition = getBlockDefinition(type);

    if (!definition) {
        return null;
    }

    return definition.sound ?? (definition.model === 'cross' ? 'plant' : 'stone');

}


// Bloki w ekwipunku kreatywnym (w kolejności z listy BLOCK_TYPES).

export const CREATIVE_BLOCKS = Object.keys(BLOCK_TYPES).filter(
    (type) => BLOCK_TYPES[type].creative !== false
);


// Kolor światła bloku: [czerwony, zielony, niebieski], każdy 0-1.

export function getLightColor(id) {

    return lightColorById[id] ?? [1, 1, 1];

}


// Jak mocno blok świeci (0 = wcale, 15 = najjaśniej).

export function getLightEmission(id) {

    return lightById[id];

}
