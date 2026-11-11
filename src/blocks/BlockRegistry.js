import {
    BLOCK_LIGHT_COLOR,
    BUSH_GROWTH_SECONDS,
    BREAK_SECONDS,
    LEAVES_BREAK_SECONDS,
    TOOL_SPEED,
    TOOL_MATERIALS
} from '../config.js';

import { treeBlocks } from './trees.js';
import { RIVER_PLANT_BLOCKS } from './riverPlants.js';
import { BLUEBERRY_STAGES, BLUEBERRY_TEXTURE, blueberryIcon } from './blueberry.js';
import { FRUIT_BUSH_PROFILES } from '../rendering/FruitBushGeometry.js';
import { PLANT_PACKS, PLANT_PIXELS, plantStageType, plantTile } from './plantPacks.js';
import { TORCH_BLOCKS } from './torches.js';
import { CHEST_BLOCKS } from './chest.js';
import { WOOD_SHAPE_BLOCKS } from './woodShapes.js';
import { FLOWING_WATER_BLOCKS, WATER_SOURCE_ID, WATER_FALLING_LAST_ID, plainWaterLevel, waterHeightForLevel } from './water.js';
export { WATER_SOURCE_ID, WATER_FALLING_ID, WATER_FALL_MAX, waterIdForLevel, isFallingWaterId, waterFallDistance, fallingWaterId } from './water.js';

// ID 0 jest zarezerwowane dla powietrza.
// Chunk przechowuje bloki jako liczby, więc pusta tablica = samo powietrze.

export const AIR_ID = 0;

// Chunk trzyma ID w Uint16Array (2 bajty na blok, 0.30.0 - wcześniej
// 1 bajt i najwyżej 255 bloków). Bloki mają numery 1-MAX_BLOCK_ID;
// ostatnie 256 numerów (65280-65535) gra trzyma dla siebie - nie trafiają
// do zapisu świata (np. odcienie trawy dalekiego terenu,
// src/rendering/SurfaceMaterials.js).
//
// Zakresy numerów (raz nadany numer zapisuje się w świecie - nie zmieniać):
//   1-99, 240-255, 256-999  bloki gry,
//   100-239                 paczki drzew i paczki roślin (dawny zakres -
//                           drzewa od dołu, rośliny od góry),
//   1000-4999               dodatkowe drzewa (treeCatalog.js),
//   5000-9999               paczki roślin (plantPacks.js),
//   10000-10099             konstrukcje (ognisko 10000, pochodnie 10010-10094,
//                           skrzynia 10095-10098),
//   10100-10107             wewnętrzne poziomy i spadanie wody,
//   10108-10122             spadanie wody 2-16 bloków (0.73.0),
//   10300-10859             wyroby stolarskie (0.90.0, po 28 na drewno -
//                           woodShapes.js: schody, półbloki, płot, furtka, stół),
//   10123-10299, 10860-65279 wolne na przyszłość.

export const MAX_BLOCK_ID = 65279;


// Pola definicji bloku:
//
//   id             - unikalny numer (zapisywany w chunkach; zakresy wyżej)
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
//   model          - 'cube' (zwykły sześcian, domyślnie), 'cross'
//                    (roślina: kilka skrzyżowanych płaszczyzn z teksturą
//                    z przezroczystością; shader kołysze je na wietrze),
//                    'leaves' (liście: sześcian z prześwitami - widać
//                    przez nie liście dalej w koronie; przepuszczają
//                    światło nieba, ale pod koroną jest cień) albo
//                    'flat' (płaski obrazek przy ścianie sąsiada -
//                    opadłe liście na ziemi, wieniec na ścianie)
//   plant          - kształt rośliny: { planes: 2 albo 3, height, width }
//   flat           - model 'flat': { attach } - do którego sąsiada
//                    przylega: 'down' (leży na bloku pod spodem),
//                    'north' (-Z), 'south' (+Z), 'east' (+X), 'west'
//                    (-X); znika, gdy ten sąsiad zniknie
//   wall           - wersje bloku na każdą stronę { north, south,
//                    east, west } - BlockPlacer.js stawia tę, która
//                    pasuje do klikniętej ściany
//   pick           - co bierze środkowy przycisk (zamiast samego bloku)
//   soil           - na tym bloku mogą rosnąć rośliny
//   ground         - roślina rośnie też na tych blokach (poza ziemią),
//                    np. ['sand'] - trzcina i piaskownica na piasku
//   replaceable    - postawienie bloku w tym miejscu zastępuje ten
//                    (np. trawa) - jak w Minecrafcie
//   drops          - co trafia do ekwipunku po zniszczeniu w trybie
//                    przygody (domyślnie ten sam blok, null = nic)
//   creative       - false = nie ma go w ekwipunku kreatywnym
//   sound          - materiał dźwięków (kroki, stawianie, niszczenie):
//                    grass, dirt, stone, sand, gravel, mud, plant, glass,
//                    wood, snow
//                    (src/audio/sounds.js); domyślnie roślina - plant,
//                    inne - stone
//   grows          - roślina rośnie (src/game/PlantGrowth.js):
//                    { into: następny etap, seconds: średnio po ilu
//                    sekundach } albo { tree: gatunek, seconds } -
//                    sadzonka wyrasta w całe drzewo
//   harvest        - PPM zbiera z rośliny przedmioty: { item, count:
//                    [najmniej, najwięcej], becomes: blok po zbiorze };
//                    zniszczenie rośliny w przygodzie też je daje
//   loot           - w przygodzie po zniszczeniu czasem wypada coś
//                    jeszcze: [[co, szansa 0-1], ...] (liście: sadzonki,
//                    szyszki, żołędzie...)
//   strip          - siekiera (PPM) zamienia blok w ten (okorowany pień)
//   bark           - przedmiot z okorowania siekierą (kora brzozowa)
//   tree, part     - gatunek drzewa i część ('log', 'leaves'...) -
//                    src/blocks/trees.js
//   hardness       - ile sekund kopie się blok w trybie przygody
//                    (domyślnie według materiału - BREAK_SECONDS
//                    w config.js)
//   category       - kategoria w ekwipunku, księdze przepisów i wiki
//                    (src/items/categories.js); zwykle dobiera się sama
//   tint           - true: zielone piksele tekstury biorą kolor trawy
//                    z klimatu (teren realistyczny - chunk.tint)
//   reflect        - jak mocno blok odbija światło słońca (światło
//                    odbite - src/world/BounceLight.js): mnożnik koloru
//                    tekstury, domyślnie 1. Więcej (np. 1.8) - gładka,
//                    błyszcząca ściana, mniej (0.5) - matowa, pochłania.

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

    strawberry: {
        firstId: 34,
        name: 'Strawberry',
        item: 'strawberry',
        labels: ['Sadzonka truskawki', 'Krzak truskawki', 'Krzak truskawki (kilka owoców)', 'Krzak truskawki (pełen owoców)'],
        harvest: [[1, 2], [2, 4]]
    },

    blackberry: {
        firstId: 38,
        name: 'Blackberry',
        item: 'blackberry',
        labels: ['Sadzonka jeżyny', 'Krzak jeżyny', 'Krzak jeżyny (kilka owoców)', 'Krzak jeżyny (pełen owoców)'],
        harvest: [[1, 2], [2, 4]]
    },

    chili: {
        firstId: 42,
        name: 'Chili Pepper',
        item: 'chili_pepper',
        labels: ['Sadzonka papryczki chili', 'Krzak papryczki chili', 'Krzak papryczki chili (kilka papryczek)', 'Krzak papryczki chili (pełen papryczek)'],
        harvest: [[1, 2], [2, 4]]
    },

    hazel: {
        firstId: 46,
        name: 'Hazel',
        item: 'hazelnut',
        labels: ['Sadzonka leszczyny', 'Leszczyna', 'Leszczyna (kilka orzechów)', 'Leszczyna (pełna orzechów)'],
        harvest: [[1, 2], [2, 3]]
    },

    // Borówka czarna - niska krzewinka z borów i świerczyn (biomy).
    // Cztery importowane modele; numery 94-97 pozostają zgodne z zapisami.
    blueberry: {
        firstId: 94,
        name: 'Blueberry',
        item: 'blueberry',
        labels: ['Sadzonka borówki', 'Krzak borówki (po zbiorze)', 'Krzak borówki (kilka owoców)', 'Krzak borówki (pełen owoców)'],
        harvest: [[1, 3], [3, 5]],
        bushTexture: 'blueberry_bush',
        height: 0.75
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

        const textures = ['bush_sapling', bush.bushTexture ?? 'bush_leaves', `${species}_bush_few`, `${species}_bush_full`];

        const names = ['Sapling', 'Bush', 'Bush (Few Fruits)', 'Bush (Full)'];

        stages.forEach((type, stage) => {

            const fruiting = stage >= 2;
            const blueberry = species === 'blueberry';
            const profile = FRUIT_BUSH_PROFILES[species];

            blocks[type] = {

                id: bush.firstId + stage,
                name: `${bush.name} ${names[stage]}`,
                label: bush.labels[stage],

                solid: false,
                model: 'riverPlant',
                category: 'rosliny',
                ...(blueberry ? {
                    riverPlant: { kind: `blueberry:${BLUEBERRY_STAGES[stage]}`, texture: BLUEBERRY_TEXTURE, waterlogged: false },
                    modelIcon: blueberryIcon(BLUEBERRY_STAGES[stage]),
                    sound: 'plant'
                } : {
                    riverPlant: { kind: `fruitBush:${species}:${BLUEBERRY_STAGES[stage]}`, texture: BLUEBERRY_TEXTURE, waterlogged: false },
                    sound: 'plant'
                }),

                plant: blueberry ? { height: stage === 0 ? .4125 : .75, width: stage === 0 ? .20625 : .375 }
                    : { height: profile.height * (stage === 0 ? profile.youngScale : 1),
                        width: profile.width * (stage === 0 ? profile.youngScale : 1) / 2 },

                textures: { all: textures[stage] },

                // Zniszczony krzak daje sadzonkę.
                drops: stages[0],

                bush: species,
                stage,

                grows: stage < 3
                    ? { into: stages[blueberry && stage === 0 ? 2 : stage + 1], seconds: BUSH_GROWTH_SECONDS * (blueberry && stage === 0 ? 2 : 1) }
                    : undefined,

                harvest: fruiting
                    ? { item: bush.item, count: bush.harvest[stage - 2], becomes: stages[1] }
                    : undefined

            };

        });

    }

    return blocks;

}

// Rośliny z paczek roślin (assets/rosliny/, src/blocks/plantPacks.js):
// blok na każdy etap wzrostu. Model 'cross' z obrazkiem większym niż
// blok - plant.sprite: rozmiar obrazka w blokach (16 pikseli = 1 blok),
// plant.width / height: zasięg rośliny dla celownika.

// Numer dywanu paczki (1-255): wszystkie etapy jednej rośliny-dywanu
// mają ten sam - barwinek łączy się z barwinkiem w każdym etapie.
const CARPET_GROUPS = new Map();

function carpetGroup(pack) {

    if (!CARPET_GROUPS.has(pack.id)) {
        CARPET_GROUPS.set(pack.id, Math.min(255, CARPET_GROUPS.size + 1));
    }

    return CARPET_GROUPS.get(pack.id);

}

function plantPackBlocks() {

    const blocks = {};

    for (const pack of PLANT_PACKS) {

        const types = pack.stages.map((_, stage) => plantStageType(pack, stage));

        pack.stages.forEach((stage, index) => {

            const last = index === pack.stages.length - 1;

            const next = last ? null : pack.stages[index + 1];

            // Mała roślina z pikseli (model "kepka" - TuftGeometry.js) idzie
            // tą samą drogą co modele roślin nad rzeką (riverPlant); kolor
            // odłamków - z obrazka przedmiotu (albo trawy).

            const shape = stage.tuft
                ? {
                    model: 'riverPlant',
                    // carpet - numer dywanu (te same łączą się w jeden).
                    riverPlant: { kind: `kepka:${pack.id}:${index}`, waterlogged: false, tuft: stage.tuft, carpet: stage.tuft.carpet ? carpetGroup(pack) : 0 },
                    plant: { height: stage.height / PLANT_PIXELS, width: stage.width / PLANT_PIXELS / 2 },
                    sound: 'plant',
                    textures: { all: pack.item ? plantTile(pack, pack.item.file) : 'tall_grass' }
                }
                : {
                    model: 'cross',
                    plant: {
                        planes: stage.planes,
                        height: stage.height / PLANT_PIXELS,
                        width: stage.width / PLANT_PIXELS / 2,
                        sprite: {
                            width: Math.ceil(stage.width / PLANT_PIXELS),
                            height: Math.ceil(stage.height / PLANT_PIXELS)
                        }
                    },
                    textures: { all: plantTile(pack, stage.file) }
                };

            blocks[types[index]] = {

                id: pack.firstId + index,
                name: `${pack.name} (${index + 1}/${pack.stages.length})`,
                label: stage.label,

                solid: false,
                category: 'rosliny',

                ...shape,

                ...(pack.ground ? { ground: pack.ground } : {}),

                // Zniszczona roślina daje młodą (do posadzenia).
                drops: types[0],

                plantPack: pack.id,
                stage: index,

                // Wyższy etap rośnie tylko, gdy ma nad sobą miejsce.
                grows: last
                    ? undefined
                    : { into: types[index + 1], seconds: pack.growthSeconds ?? BUSH_GROWTH_SECONDS, room: Math.ceil(next.height / PLANT_PIXELS) },

                harvest: last && pack.harvest
                    ? { item: pack.item.type, count: pack.harvest.count, becomes: types[pack.harvest.back] }
                    : undefined

            };

        });

    }

    return blocks;

}

// ------------------------------------------------------------

export const BLOCK_TYPES = {
    ...TORCH_BLOCKS,
    ...CHEST_BLOCKS,
    ...WOOD_SHAPE_BLOCKS,
    campfire: { id: 10000, name: 'Campfire', label: 'Ognisko', solid: false, opaque: false,
        model: 'structure', flat: { attach: 'down' }, inventory: false, creative: false,
        drops: null, sound: 'wood', pick: 'oak_firewood', textures: { all: 'oak_log_side' } },

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

        randomRotation: ['top'],

        // Kolor trawy trochę zależy od klimatu (cieplej - żółciej,
        // chłodniej i wilgotniej - chłodniejsza zieleń).
        tint: true

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

        hardness: 2.5,

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

        hardness: 4.5,

        // Świeci, ale to skała (nie lampa).
        category: 'skaly',

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


    // Woda - morze w terenie realistycznym (i postawiona przez gracza).
    // Półprzezroczysta i falująca (BlockRenderData.js - waterMaterial),
    // spowalnia i da się w niej pływać (Player.js). ID 12 jest źródłem,
    // pozostałe poziomy rozlewania mają osobne, trwałe ID.
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

        hardness: 2.8,

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

        hardness: 1.8,

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

        hardness: 1.8,

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

        hardness: 2.8,

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
        tint: true,
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
        tint: true,
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
        tint: true,
        textures: { all: 'fern' }
    },

    clover: {
        id: 27,
        name: 'Clover',
        label: 'Koniczyna',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.75, width: 0.42 },
        tint: true,
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


    // ------------------------------------------------------------
    // BIOMY (src/world/terrain/Biomes.js) - śnieg na szczytach, mech
    // w lasach, rośliny mokradeł, borów, hal i wydm. Tekstury:
    // tools/tekstury_biomow.py. Numery 240-255 - druga pula numerów
    // bloków gry (1-99 się skończyły, 100-239 są dla paczek drzew;
    // nowe bloki gry: 256-999).
    // ------------------------------------------------------------

    snow: {
        id: 98,
        name: 'Snow',
        label: 'Śnieg',
        sound: 'snow',
        solid: true,
        reflect: 1.6,
        textures: { all: 'snow' },
        randomRotation: ['top', 'bottom']
    },

    // Cienka warstwa śniegu na ziemi i skałach (płaska, jak opadłe
    // liście) - pod szczytami, gdzie śnieg leży płatami.
    snow_layer: {
        id: 99,
        name: 'Snow Layer',
        label: 'Warstwa śniegu',
        sound: 'snow',
        solid: false,
        replaceable: true,
        model: 'flat',
        flat: { attach: 'down' },
        category: 'teren',
        textures: { all: 'snow' },
        randomRotation: ['top']
    },

    moss: {
        id: 240,
        name: 'Moss',
        label: 'Mech',
        sound: 'grass',
        solid: true,
        soil: true,
        textures: { top: 'moss_top', side: 'moss_side', bottom: 'dirt' },
        randomRotation: ['top'],
        tint: true
    },

    // Kępki mchu na ziemi (płaskie, jak opadłe liście).
    moss_carpet: {
        id: 241,
        name: 'Moss Carpet',
        label: 'Kępki mchu',
        sound: 'plant',
        solid: false,
        replaceable: true,
        model: 'flat',
        flat: { attach: 'down' },
        category: 'rosliny',
        textures: { all: 'moss_carpet' },
        randomRotation: ['top'],
        tint: true
    },

    reed: {
        id: 242,
        name: 'Reed',
        label: 'Trzcina',
        solid: false,
        model: 'cross',
        plant: { planes: 3, height: 1, width: 0.46 },
        ground: ['sand'],
        textures: { all: 'reed' }
    },

    heather: {
        id: 243,
        name: 'Heather',
        label: 'Wrzos',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.72, width: 0.46 },
        ground: ['sand'],
        textures: { all: 'heather' }
    },

    crocus: {
        id: 244,
        name: 'Crocus',
        label: 'Krokus',
        solid: false,
        model: 'cross',
        plant: { planes: 2, height: 0.7, width: 0.42 },
        textures: { all: 'crocus' }
    },

    dune_grass: {
        id: 245,
        name: 'Dune Grass',
        label: 'Piaskownica (trawa wydmowa)',
        solid: false,
        model: 'cross',
        plant: { planes: 3, height: 1, width: 0.5 },
        replaceable: true,
        ground: ['sand'],
        textures: { all: 'dune_grass' }
    },


    // ------------------------------------------------------------
    // BUDULEC - ściany, które różnie odbijają światło słońca (pole
    // reflect; światło odbite - src/world/BounceLight.js). Pokój
    // z białego tynku jest jasny, z ciemnych desek - mroczny,
    // z terakoty - ciepły. Tekstury: tools/tekstury_budulec.py.
    // ------------------------------------------------------------

    lime_plaster: {
        id: 89,
        name: 'Lime Plaster',
        label: 'Tynk wapienny',
        sound: 'stone',
        solid: true,
        category: 'budowa',
        reflect: 1.1,
        textures: { all: 'lime_plaster' },
        randomRotation: ['top', 'bottom']
    },

    ochre_plaster: {
        id: 90,
        name: 'Ochre Plaster',
        label: 'Tynk ochrowy',
        sound: 'stone',
        solid: true,
        category: 'budowa',
        reflect: 1.1,
        textures: { all: 'ochre_plaster' },
        randomRotation: ['top', 'bottom']
    },

    terracotta: {
        id: 91,
        name: 'Terracotta',
        label: 'Terakota',
        sound: 'stone',
        solid: true,
        category: 'budowa',
        textures: { all: 'terracotta' }
    },

    polished_stone: {
        id: 92,
        name: 'Polished Stone',
        label: 'Polerowany kamień',
        sound: 'stone',
        solid: true,
        category: 'budowa',
        reflect: 1.8,
        textures: { all: 'polished_stone' }
    },

    dark_planks: {
        id: 93,
        name: 'Dark Planks',
        label: 'Ciemne deski',
        sound: 'wood',
        solid: true,
        category: 'budowa',
        reflect: 0.6,
        textures: { all: 'dark_planks' }
    },


    // Krzaki owocowe (FRUIT_BUSHES wyżej) - po 4 bloki na gatunek.

    ...fruitBushBlocks(),


    // Drzewa (src/blocks/trees.js) - po 5 bloków na gatunek i dodatki.

    ...treeBlocks(),

    ...RIVER_PLANT_BLOCKS,

    ...FLOWING_WATER_BLOCKS,

    // Paczki roślin (assets/rosliny/) - po bloku na etap wzrostu.

    ...plantPackBlocks()

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
const riverPlantById = new Array(MAX_BLOCK_ID + 1).fill(null);
const plantById = new Uint8Array(MAX_BLOCK_ID + 1);
const soilById = new Uint8Array(MAX_BLOCK_ID + 1);
const replaceableById = new Uint8Array(MAX_BLOCK_ID + 1);
const lightById = new Uint8Array(MAX_BLOCK_ID + 1);
const growsById = new Uint8Array(MAX_BLOCK_ID + 1);
const leavesById = new Uint8Array(MAX_BLOCK_ID + 1);
const treeById = new Uint8Array(MAX_BLOCK_ID + 1);

// Model 'flat': do którego sąsiada blok przylega (ATTACH_... niżej).
const attachById = new Uint8Array(MAX_BLOCK_ID + 1);

// Rośliny z polem ground: na jakich blokach (poza ziemią) rosną -
// zbiór ID (null - tylko ziemia).
const groundById = new Array(MAX_BLOCK_ID + 1).fill(null);

export const ATTACH_NONE = 0;
export const ATTACH_DOWN = 1;
export const ATTACH_NORTH = 2;
export const ATTACH_SOUTH = 3;
export const ATTACH_EAST = 4;
export const ATTACH_WEST = 5;

const ATTACH_CODES = {
    down: ATTACH_DOWN,
    north: ATTACH_NORTH,
    south: ATTACH_SOUTH,
    east: ATTACH_EAST,
    west: ATTACH_WEST
};

// Przesunięcie do sąsiada, do którego blok przylega: [dx, dy, dz].

export const ATTACH_OFFSETS = [
    null,
    [0, -1, 0],
    [0, 0, -1],
    [0, 0, 1],
    [1, 0, 0],
    [-1, 0, 0]
];

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

    plantById[id] = definition.model === 'cross' || definition.model === 'riverPlant' ? 1 : 0;

    riverPlantById[id] = definition.riverPlant ?? null;

    soilById[id] = definition.soil ? 1 : 0;

    replaceableById[id] = definition.replaceable ? 1 : 0;

    growsById[id] = definition.grows ? 1 : 0;

    leavesById[id] = definition.model === 'leaves' ? 1 : 0;

    treeById[id] = definition.tree ? 1 : 0;

    if (definition.model === 'flat' || definition.model === 'structure') {

        const attach = ATTACH_CODES[definition.flat?.attach];

        if (!attach) {
            throw new Error(`Blok "${type}": model 'flat' bez flat.attach (down, north, south, east, west)`);
        }

        attachById[id] = attach;

    }

    lightById[id] =
        Math.max(0, Math.min(15, Math.floor(definition.light ?? 0)));

    lightColorById[id] =
        parseColor(definition.lightColor ?? BLOCK_LIGHT_COLOR, type);

}

// Rośliny rosnące poza ziemią (pole ground) - po nazwach już ID.

for (const definition of Object.values(BLOCK_TYPES)) {

    if (definition.ground) {
        groundById[definition.id] = new Set(definition.ground.map((type) => BLOCK_TYPES[type]?.id ?? AIR_ID));
    }

}

// ------------------------------------------------------------

export function getBlockDefinition(type) {

    // Tylko własne pola listy (nie np. "constructor" z Object).

    return typeof type === 'string' && Object.hasOwn(BLOCK_TYPES, type) ? BLOCK_TYPES[type] : null;

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


// Naprawa zapisów 0.31.0-0.40.0: generator terenu realistycznego miał
// kolumnę z 1-bajtowymi numerami, więc rośliny z paczek (numery 5000+)
// zapisały się z obciętym numerem (5000 -> 136 ...) - jako nieznane,
// niewidoczne bloki. Nieznany numer 0-255, który pasuje do dokładnie
// jednej rośliny z paczki (numer & 255), wraca do niej przy wczytaniu
// chunka (Chunk.loadBlocks). 0 - nic do naprawy.

export const TRUNCATED_PLANT_IDS = new Uint16Array(256);

{
    const candidates = new Map();

    for (const definition of Object.values(BLOCK_TYPES)) {
        if (definition.id > 255 && PLANT_PACKS.some((pack) => definition.id >= pack.firstId && definition.id < pack.firstId + pack.stages.length)) {
            const low = definition.id & 255;
            candidates.set(low, candidates.has(low) ? -1 : definition.id);
        }
    }

    for (const [low, id] of candidates) {
        if (id > 0 && typeById[low] === null) {
            TRUNCATED_PLANT_IDS[low] = id;
        }
    }
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


export function isWaterloggedPlantId(id) {

    return riverPlantById[id]?.waterlogged === true;

}


// Ten sam rodzaj cieczy także pod rośliną: pływanie, ściany wody i LOD.
export function getLiquidKindId(id) {

    return getWaterLevel(id) >= 0 ? WATER_SOURCE_ID : (isLiquidId(id) ? id : AIR_ID);

}

export function getWaterLevel(id) {
    return isWaterloggedPlantId(id) ? 0 : plainWaterLevel(id);
}

export function isWaterSourceId(id) { return getWaterLevel(id) === 0; }

export function isFlowingWaterId(id) {
    return id > WATER_SOURCE_ID && id <= WATER_FALLING_LAST_ID && plainWaterLevel(id) > 0;
}

export function getWaterBaseHeight(id) { return waterHeightForLevel(getWaterLevel(id)); }


export function getRiverPlant(id) {

    return riverPlantById[id] ?? null;

}


// Roślina (model 'cross') - rośnie tylko na ziemi (soil).

export function isPlantId(id) {

    return plantById[id] === 1;

}


// Czy na tym bloku mogą rosnąć rośliny.

export function isSoilId(id) {

    return soilById[id] === 1;

}


// Czy roślina plantId może rosnąć na bloku groundId: na ziemi (soil)
// każda, a niektóre też na innych blokach (pole ground - np. piasek).

export function canGrowOn(plantId, groundId) {

    return soilById[groundId] === 1 || (groundById[plantId]?.has(groundId) ?? false);

}


// Rośliny przy tafli potrzebują otwartej powierzchni. Pływające liście
// nie są zakorzenione: usunięcie dna nie zabiera im istniejącej wody.
export function canPlantStay(plantId, groundId, aboveId = AIR_ID) {

    const river = riverPlantById[plantId];

    // Porost i huba trzymają się ścian, nie ziemi pod sobą - ich oparcie
    // sprawdza świat (World.attachedPlantSupported).
    if (river?.tuft?.coating || river?.tuft?.bracket) return true;

    // Wysokie pędy zajmują także część komórki nad korzeniami.
    if ((river?.kind === 'cattail' || river?.kind === 'loosestrife') && aboveId !== AIR_ID) return false;

    if (river?.waterlogged) {
        if (river.kind === 'lily' || river.kind === 'duckweed') {
            return aboveId === AIR_ID;
        }
    }

    return canGrowOn(plantId, groundId);

}


// Porost (przylega do każdej ściany - 'coating') albo huba (do boku
// pnia - 'bracket'); null - zwykła roślina.

export function getAttachedPlant(id) {

    const tuft = riverPlantById[id]?.tuft;

    return tuft?.coating ? 'coating' : tuft?.bracket ? 'bracket' : null;

}


// Liście (model 'leaves'): przepuszczają światło nieba, ale
// osłabione (pod koroną jest cień - Light.js).

export function isLeavesId(id) {

    return leavesById[id] === 1;

}


// Część drzewa (pień, liście, sadzonka, opadłe liście...).

export function isTreeId(id) {

    return treeById[id] === 1;

}


// Model 'flat': do którego sąsiada blok przylega (ATTACH_...).

export function getAttach(id) {

    return attachById[id];

}


// Czy postawienie bloku w tym miejscu po prostu ten blok zastępuje.

export function isReplaceableId(id) {

    return replaceableById[id] === 1;

}


// Nazwa bloku po polsku (albo zwykła nazwa, gdy nie ma polskiej).

export function getBlockLabel(type) {

    const definition = getBlockDefinition(type);

    return definition ? (definition.label ?? definition.name) : type;

}


// Czy roślina jeszcze rośnie (ma kolejny etap - PlantGrowth.js).

export function isGrowingId(id) {

    return growsById[id] === 1;

}


// Wzrost rośliny: { into, seconds } albo null.

export function getGrowth(type) {

    return getBlockDefinition(type)?.grows ?? null;

}


// Zbiór z rośliny (PPM): { item, count: [min, max], becomes } albo null.

export function getHarvest(type) {

    return getBlockDefinition(type)?.harvest ?? null;

}


// Co trafia do ekwipunku po zniszczeniu bloku (tryb przygody).

export function getDropType(type) {

    const definition = getBlockDefinition(type);

    if (!definition) {
        return null;
    }

    return definition.drops === undefined ? type : definition.drops;

}


// Ile sztuk wypada (podwójny półblok - dwa półbloki).

export function getDropCount(type) {

    return getBlockDefinition(type)?.dropCount ?? 1;

}


// Co czasem wypada dodatkowo w przygodzie: [[co, szansa], ...].

export function getLoot(type) {

    return getBlockDefinition(type)?.loot ?? [];

}


// Siekiera: na co zamienia się blok (albo null) i co z niego zostaje
// w ręce (kora brzozowa).

export function getStrip(type) {

    const definition = getBlockDefinition(type);

    return definition?.strip ? { into: definition.strip, item: definition.bark ?? null } : null;

}


// Ile sekund kopie się blok w trybie przygody. tool - narzędzie w ręce
// ('axe', 'pickaxe', 'shovel' albo null): pasujące kopie TOOL_SPEED
// razy szybciej (getBestTool).

export function getBreakTime(type, tool = null) {

    const definition = getBlockDefinition(type);

    if (!definition) {
        return 0;
    }

    const time =
        definition.hardness !== undefined ? definition.hardness :
        definition.model === 'leaves' ? LEAVES_BREAK_SECONDS :
        BREAK_SECONDS[getBlockSound(type)] ?? 1;

    return tool && getBestTool(type) === tool ? time / TOOL_SPEED : time;

}


// Narzędzie, które kopie ten blok szybciej ('axe', 'pickaxe', 'shovel')
// albo null (liście, rośliny, lampy - wszystko jedno czym).

export function getBestTool(type) {

    const definition = getBlockDefinition(type);

    if (!definition || definition.model === 'leaves') {
        return null;
    }

    const material = getBlockSound(type);

    for (const [tool, materials] of Object.entries(TOOL_MATERIALS)) {

        if (materials.includes(material)) {
            return tool;
        }

    }

    return null;

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
