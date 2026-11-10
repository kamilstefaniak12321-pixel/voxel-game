import { SEA_LEVEL } from '../../config.js';

import { Noise } from '../Noise.js';

import * as SHAPE from './TerrainShape.js';

import { BIOME_SHAPE } from './TerrainShape.js';

// ------------------------------------------------------------
// BIOMY - krajobrazy terenu realistycznego
//
// Biom w danym miejscu wynika z tego, co już jest w terenie:
//
//   wysokość     - niziny, wyżyny, góry; granica lasu, gołej skały
//                  i śniegu,
//   klimat       - temperatura (wyżej chłodniej) i wilgotność,
//   woda         - odległość od rzeki i jeziora, wybrzeże, depresje,
//   pole lasów   - gdzie są lasy, a gdzie łąki (src/world/trees/
//                  Forests.js).
//
// Kolejność sprawdzania (pierwszy pasujący wygrywa):
//   woda (morze, jezioro, rzeka) -> plaża i wydmy -> ośnieżone szczyty
//   -> skaliste góry -> góry (hala albo świerczyna) -> mokradła ->
//   las (rodzaj lasu z klimatu) -> łąka.
//
// Granice biomów są poszarpane: miejsce, w którym sprawdzamy klimat
// i pole lasów, jest lekko przesunięte szumem (BIOME_SHAPE.edge), więc
// las nie kończy się na prostej linii.
//
// Każdy biom ma tu swój opis: nazwę, kolor na mapie, wierzch ziemi,
// rośliny, krzaki, drzewa. Liczby do strojenia (gdzie jest który
// biom) - BIOME_SHAPE w TerrainShape.js. Opis: docs/biomy.md.
// ------------------------------------------------------------

// Pola biomu:
//   name    - nazwa po polsku (/biom, mapa, osiągnięcia),
//   about   - co tam jest (opis w /biom),
//   words   - słowa w komendach (/biom znajdz <słowo>),
//   color   - kolor na mapie (/mapa biomy),
//   water   - biom wodny (nie liczy się do "Turysty"),
//   ground  - wierzch ziemi zamiast trawy: [[blok, ile], ...] - ile
//             (0-1) mniej więcej części powierzchni w plamach,
//   trees   - gatunki drzew i ich udział (drzewa z paczek - swoje
//             "biomy" w drzewo.json), density - mnożnik gęstości lasu
//             (0 = bez drzew), lone - najmniejsza gęstość (w lasach -
//             las jest gęsty w całym biomie, na łąkach - pojedyncze
//             drzewa),
//   plants  - rośliny na ziemi:
//               grass   - [od, do] część kolumn z trawą (rzadko .. gęsto),
//               tall    - [od, do] jaka część trawy jest wysoka,
//               flowers - kępy kwiatów: gatunki (null = bez kwiatów),
//               flowerDensity - jak gęste kępy (domyślnie jak w PLANTS),
//               fern    - paprocie (szansa, rośnie z wilgotnością),
//               herbs   - [[blok, szansa], ...] pojedyncze zioła,
//               patches - rośliny w plamach (wrzos, krokusy, borówki):
//                         [[blok, gęstość w plamie, ile plam 0-1], ...],
//               bushes  - krzaki owocowe: gatunki (FRUIT_BUSHES),
//                         gęstość zarośli (1 = jak dotąd) i próg pola
//                         zarośli (threshold - mniej = więcej zarośli;
//                         domyślnie PLANTS.bushThreshold).

export const BIOMES = {

    sea: {
        name: 'Morze',
        about: 'otwarte morze, dno z piasku',
        words: ['morze'],
        color: '#2f5fb0',
        water: true
    },

    lake: {
        name: 'Jezioro',
        about: 'jezioro w zagłębieniu terenu',
        words: ['jezioro'],
        color: '#2f80d8',
        water: true
    },

    river: {
        name: 'Rzeka',
        about: 'rzeka - nurt niesie gracza',
        words: ['rzeka'],
        color: '#3fa9f5',
        water: true
    },

    beach: {
        name: 'Plaża i wydmy',
        about: 'piasek i pagórki wydm porośnięte piaskownicą, za wydmami pojedyncze sosny',
        words: ['plaza', 'wydmy'],
        color: '#efe0a6',
        trees: { pine: 1 },
        density: 0.3,
        lone: 0.004,
        plants: {
            grass: [0.04, 0.2],
            tall: [0.2, 0.5],
            flowers: null,
            fern: 0,
            herbs: [['plantain', 0.01]],
            bushes: null
        }
    },

    meadow: {
        name: 'Łąka',
        about: 'trawa, kępy maków, chabrów, rumianku i mniszków, zioła, dzikie truskawki, pojedyncze dęby, lipy i jabłonie',
        words: ['laka', 'łąka'],
        color: '#a8d65c',
        trees: { oak: 0.35, linden: 0.3, birch: 0.2, pine: 0.15 },
        density: 1,
        lone: 0.012,
        plants: {
            grass: [0.1, 0.6],
            tall: [0.1, 0.5],
            flowers: ['poppy', 'cornflower', 'chamomile', 'dandelion'],
            fern: 0.04,
            herbs: [['clover', 0.025], ['plantain', 0.012], ['nettle', 0.008], ['dandelion', 0.008]],
            bushes: { species: ['strawberry', 'chili', 'blackberry'], density: 1 }
        }
    },

    deciduous: {
        name: 'Las liściasty',
        about: 'dęby i lipy, ściółka i opadłe liście, leszczyna, jeżyny, pokrzywy i paprocie',
        words: ['las', 'lisciasty', 'liściasty'],
        color: '#3f9b3a',
        ground: [['forest_floor', 0.45]],
        trees: { oak: 0.46, linden: 0.4, beech: 0.06, birch: 0.08 },
        density: 1,
        lone: 0.3,
        plants: {
            grass: [0.06, 0.3],
            tall: [0.2, 0.5],
            flowers: ['chamomile', 'dandelion'],
            flowerDensity: 0.25,
            fern: 0.12,
            herbs: [['nettle', 0.03], ['clover', 0.01], ['plantain', 0.006]],
            patches: [['moss_carpet', 0.5, 0.12]],
            bushes: { species: ['hazel', 'blackberry'], density: 1.1 }
        }
    },

    beech: {
        name: 'Buczyna',
        about: 'prawie same buki, gruba ściółka z liści, mało roślin pod koronami',
        words: ['buczyna', 'buk'],
        color: '#6e9f3a',
        ground: [['forest_floor', 0.75]],
        trees: { beech: 0.84, oak: 0.05, spruce: 0.05, linden: 0.06 },
        density: 1,
        lone: 0.32,
        plants: {
            grass: [0.02, 0.12],
            tall: [0.1, 0.3],
            flowers: null,
            fern: 0.06,
            herbs: [['nettle', 0.006]],
            patches: [['moss_carpet', 0.4, 0.1]],
            bushes: { species: ['hazel'], density: 0.35 }
        }
    },

    birch: {
        name: 'Brzezina',
        about: 'brzozy, wysoka trawa, paprocie, mech, jeżyny i borówki',
        words: ['brzezina', 'brzoza'],
        color: '#8fcf6a',
        ground: [['moss', 0.12]],
        trees: { birch: 0.76, pine: 0.1, oak: 0.06, spruce: 0.08 },
        density: 0.9,
        lone: 0.24,
        plants: {
            grass: [0.25, 0.65],
            tall: [0.35, 0.65],
            flowers: ['chamomile', 'cornflower'],
            flowerDensity: 0.4,
            fern: 0.16,
            herbs: [['nettle', 0.012], ['clover', 0.01]],
            bushes: { species: ['blackberry', 'blueberry'], density: 1.2, threshold: 0.35 }
        }
    },

    pine: {
        name: 'Bór sosnowy',
        about: 'sosny na piaszczystym gruncie, wrzos, mech, borówki',
        words: ['bor', 'bór', 'sosna'],
        color: '#5f8a43',
        ground: [['forest_floor', 0.35], ['moss', 0.3]],
        trees: { pine: 0.86, birch: 0.09, spruce: 0.05 },
        density: 0.8,
        lone: 0.22,
        plants: {
            grass: [0.04, 0.2],
            tall: [0.1, 0.3],
            flowers: null,
            fern: 0.05,
            herbs: [],
            patches: [['heather', 0.6, 0.3], ['moss_carpet', 0.5, 0.12]],
            bushes: { species: ['blueberry'], density: 1.4, threshold: 0.2 }
        }
    },

    spruce: {
        name: 'Świerczyna',
        about: 'gęste, ciemne świerki w górach i chłodzie, mech, paprocie, borówki',
        words: ['swierczyna', 'świerczyna', 'swierk', 'świerk'],
        color: '#2f6b3f',
        ground: [['forest_floor', 0.5], ['moss', 0.35]],
        trees: { spruce: 0.9, beech: 0.04, birch: 0.06 },
        density: 1,
        lone: 0.32,
        plants: {
            grass: [0.02, 0.12],
            tall: [0.1, 0.3],
            flowers: null,
            fern: 0.14,
            herbs: [],
            patches: [['moss_carpet', 0.6, 0.2]],
            bushes: { species: ['blueberry'], density: 1.2, threshold: 0.25 }
        }
    },

    alpine: {
        name: 'Hala',
        about: 'górska łąka nad granicą lasu: krótka trawa, krokusy, pojedyncze świerki',
        words: ['hala'],
        color: '#c5df7a',
        ground: [['coarse_dirt', 0.08]],
        trees: { spruce: 1 },
        density: 0.12,
        lone: 0.006,
        plants: {
            grass: [0.25, 0.6],
            tall: [0.0, 0.15],
            flowers: ['crocus', 'chamomile', 'dandelion'],
            flowerDensity: 0.9,
            fern: 0,
            herbs: [['clover', 0.02], ['plantain', 0.008]],
            patches: [['crocus', 0.5, 0.25]],
            bushes: { species: ['blueberry'], density: 0.5 }
        }
    },

    rocky: {
        name: 'Skaliste góry',
        about: 'gołe skały, piargi ze żwiru, płaty śniegu pod szczytami',
        words: ['skaly', 'skały', 'skaliste', 'gory', 'góry'],
        color: '#8d8a84',
        ground: [['gravel', 0.35], ['coarse_dirt', 0.4]],
        trees: { spruce: 1 },
        density: 0,
        lone: 0,
        plants: {
            grass: [0.04, 0.18],
            tall: [0, 0.05],
            flowers: ['crocus'],
            flowerDensity: 0.3,
            fern: 0,
            herbs: [],
            bushes: null
        }
    },

    snowy: {
        name: 'Ośnieżone szczyty',
        about: 'śnieg na najwyższych szczytach',
        words: ['snieg', 'śnieg', 'szczyty', 'osniezone', 'ośnieżone'],
        color: '#f4f7fb',
        trees: { spruce: 1 },
        density: 0,
        lone: 0,
        plants: null
    },

    wetland: {
        name: 'Mokradła',
        about: 'błoto i mech przy wodzie, trzcina, wysoka trawa, olchy, wierzby i brzozy',
        words: ['mokradla', 'mokradła', 'bagno'],
        color: '#5f9e8a',
        ground: [['moss', 0.22], ['mud', 0.15]],
        trees: { birch: 0.85, oak: 0.05, spruce: 0.1 },
        density: 0.45,
        lone: 0.03,
        plants: {
            grass: [0.35, 0.7],
            tall: [0.5, 0.85],
            flowers: null,
            fern: 0.1,
            herbs: [['nettle', 0.03]],
            patches: [['reed', 0.6, 0.2], ['moss_carpet', 0.4, 0.15]],
            bushes: { species: ['blackberry'], density: 0.5 }
        }
    },

    // ---- 0.83.0: biomy nowych drzew (paczki Kamila) ----

    maple_forest: {
        name: 'Klonowy las jesienny',
        about: 'klony w jesiennych kolorach, dywan opadłych liści, trochę buków i lip, leszczyna i jeżyny',
        words: ['klonowy', 'klon', 'jesien', 'jesień'],
        color: '#d0662c',
        ground: [['forest_floor', 0.5]],
        trees: { maple: 0.82, beech: 0.06, linden: 0.06, oak: 0.06 },
        density: 1,
        lone: 0.3,
        plants: {
            grass: [0.04, 0.25],
            tall: [0.15, 0.4],
            flowers: ['chamomile'],
            flowerDensity: 0.15,
            fern: 0.08,
            herbs: [['nettle', 0.01]],
            patches: [['moss_carpet', 0.4, 0.1]],
            bushes: { species: ['hazel', 'blackberry'], density: 0.6 }
        }
    },

    sequoia_forest: {
        name: 'Las sekwojowy',
        about: 'olbrzymie sekwoje nad świerkami i sosnami, mech, dużo paproci, borówki - chłodno i wilgotno',
        words: ['sekwojowy', 'sekwoja', 'sekwoje'],
        color: '#7a4a32',
        ground: [['forest_floor', 0.6], ['moss', 0.25]],
        trees: { sequoia: 0.72, spruce: 0.18, pine: 0.1 },
        density: 0.85,
        lone: 0.3,
        plants: {
            grass: [0.02, 0.1],
            tall: [0.1, 0.3],
            flowers: null,
            fern: 0.3,
            herbs: [],
            patches: [['moss_carpet', 0.6, 0.25]],
            bushes: { species: ['blueberry'], density: 0.8 }
        }
    },

    eucalyptus_forest: {
        name: 'Las eukaliptusowy',
        about: 'bardzo wysokie eukaliptusy tęczowe z kolorową korą, gęsta wysoka trawa i paprocie - ciepło i wilgotno',
        words: ['eukaliptusowy', 'eukaliptus', 'tropikalny'],
        color: '#2f9a72',
        ground: [['forest_floor', 0.35], ['moss', 0.15]],
        trees: { rainbow_eucalyptus: 0.9, linden: 0.1 },
        density: 1,
        lone: 0.3,
        plants: {
            grass: [0.2, 0.55],
            tall: [0.4, 0.8],
            flowers: ['poppy'],
            flowerDensity: 0.2,
            fern: 0.35,
            herbs: [['nettle', 0.02]],
            patches: [['moss_carpet', 0.5, 0.15]],
            bushes: { species: ['chili', 'blackberry'], density: 0.9 }
        }
    },

    olive_grove: {
        name: 'Gaj oliwny',
        about: 'rozrzucone, sękate oliwki na suchej, ciepłej ziemi, trochę sosen i akacji, maki, rumianek, lawenda, papryczki',
        words: ['gaj', 'oliwny', 'oliwki'],
        color: '#b4b06a',
        ground: [['coarse_dirt', 0.3]],
        trees: { olive: 0.82, pine: 0.1, acacia: 0.08 },
        density: 0.22,
        lone: 0.07,
        plants: {
            grass: [0.08, 0.35],
            tall: [0.05, 0.25],
            flowers: ['poppy', 'chamomile'],
            flowerDensity: 0.5,
            fern: 0,
            herbs: [['plantain', 0.01], ['clover', 0.008]],
            bushes: { species: ['chili', 'strawberry'], density: 0.5 }
        }
    },

    mugo_scrub: {
        name: 'Kosodrzewina',
        about: 'gęste łany niskiej kosodrzewiny tuż nad granicą lasu, krokusy, borówki, mech',
        words: ['kosodrzewina', 'kosowka', 'kosówka', 'kosowa'],
        color: '#46704a',
        ground: [['coarse_dirt', 0.12], ['moss', 0.18]],
        trees: { mugo: 0.94, spruce: 0.06 },
        density: 1,
        lone: 0.3,
        plants: {
            grass: [0.15, 0.45],
            tall: [0, 0.12],
            flowers: ['crocus'],
            flowerDensity: 0.4,
            fern: 0,
            herbs: [['clover', 0.01]],
            patches: [['crocus', 0.4, 0.15]],
            bushes: { species: ['blueberry'], density: 1 }
        }
    }

};


// KOLOR TRAWY: trawa (i mech, paprocie...) lekko zmienia kolor
// z klimatem - w cieple i suchu żółciej, w chłodzie i wilgoci
// chłodniejsza, sinawa zieleń, wysoko w górach bledsza. Mnożniki
// koloru r, g, b (1 = jak tekstura) na "stopień" ciepła i wilgoci
// (-1..1), w górach (od high[0] do high[1] bloków nad morzem) kolor
// zmierza do highColor (w części highAmount). Shader zmienia tylko
// zielone piksele (BlockRenderData.js), więc ziemia i kwiaty zostają.
export const GRASS_TINT = {
    warm: [0.09, 0.02, -0.12],
    wet: [-0.05, -0.01, 0.05],
    high: [28, 50],
    highColor: [1.04, 1.0, 0.9],
    highAmount: 0.6
};


// Kolor trawy (mnożniki r, g, b do out) w klimacie: temperatura (już
// z wysokością), wilgotność, wysokość nad morzem.

export function grassTint(temperature, humidity, above, out) {

    const T = GRASS_TINT;

    const warm = clamp((temperature + 0.25) / 0.7, -1, 1);
    const wet = clamp(humidity / 0.7, -1, 1);

    const high = smoothstep(T.high[0], T.high[1], above) * T.highAmount;

    for (let k = 0; k < 3; k++) {

        const value = 1 + T.warm[k] * warm + T.wet[k] * wet;

        out[k] = clamp(value + (T.highColor[k] - value) * high, 0.7, 1.3);

    }

    return out;

}


// Lista i numery biomów (numer - szybciej niż nazwa, np. w mapie).

export const BIOME_KEYS = Object.keys(BIOMES);

export const BIOME_INDEX = Object.fromEntries(BIOME_KEYS.map((key, index) => [key, index]));

// Biomy lądowe (bez wody) - do osiągnięcia "Turysta".

export const LAND_BIOMES = BIOME_KEYS.filter((key) => !BIOMES[key].water);


// Słowo z komendy -> klucz biomu (albo null).

export function biomeByWord(word) {

    const text = String(word ?? '').toLowerCase();

    for (const key of BIOME_KEYS) {

        if (key === text || BIOMES[key].words.includes(text)) {
            return key;
        }

    }

    return null;

}


// Kolumny biomu w kolejności rodzajów lasu (scores).

const FOREST_TYPES = ['spruce', 'pine', 'beech', 'birch', 'deciduous',
    'maple_forest', 'sequoia_forest', 'eucalyptus_forest', 'olive_grove'];

// Pole lasów, od którego w lesie (nie na łące) liczy się gęstość lasów
// w Forests.js - kosodrzewina i gaj oliwny tylko powyżej (z zapasem),
// żeby szybkie odrzucanie kratek bez drzew działało jak dotąd.

const GROVE_FOREST = Math.min(BIOME_SHAPE.forestFrom - BIOME_SHAPE.forestHumid, BIOME_SHAPE.alpineForest) - 0.12;


function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

}


function smoothstep(edge0, edge1, value) {

    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);

}

// Klimat i pola biomów liczymy dokładnie tylko w węzłach siatki co
// GRID bloków, a między nimi - płynnie (liniowo). Te pola zmieniają się
// wolno (plamy setek bloków), więc wynik jest prawie ten sam, a chunk
// liczy się dużo szybciej (25 węzłów zamiast 256 kolumn). Węzły są
// pamiętane (CACHE_SIZE, po hashu pozycji).

const GRID = 4;

const CACHE_BITS = 14;
const CACHE_SIZE = 1 << CACHE_BITS;

// Wartości w węźle: temperatura (bez wysokości), wilgotność, pole lasów,
// plamy mokradeł, falowanie granicy śniegu, oceny rodzajów lasu
// (FOREST_TYPES), plamy kosodrzewiny.

const MUGO_FIELD = 5 + FOREST_TYPES.length;

const VALUES = MUGO_FIELD + 1;

// ------------------------------------------------------------

export class Biomes {

    constructor(generator, base) {

        this.generator = generator;

        const noise = (k) => new Noise((base + Math.imul(k, 0x9e3779b1)) >>> 0);

        this.noise = {
            edgeX: noise(40),
            edgeZ: noise(41),
            types: noise(42),
            wet: noise(43),
            snow: noise(44),
            mugo: noise(45)
        };

        // Wynik ostatniego classify (bez tworzenia obiektów).

        this.info = { biome: 'meadow', temperature: 0, humidity: 0, forest: 0, above: 0, snowLine: 0 };

        this.scores = new Float32Array(FOREST_TYPES.length);


        // Pamięć węzłów siatki (klucz - pozycja węzła).

        this.cacheKeys = new Float64Array(CACHE_SIZE).fill(NaN);
        this.cacheValues = new Float32Array(CACHE_SIZE * VALUES);

        this.fields = new Float32Array(VALUES);
        this.exact = new Float32Array(VALUES);

        this.tintColor = new Float32Array(3);

    }


    // Wartości pól (VALUES) policzone dokładnie w punkcie (x, z) do out.

    exactFields(x, z, out) {

        const B = BIOME_SHAPE;
        const G = this.generator;

        // Miejsce sprawdzania klimatu i lasów przesunięte szumem -
        // poszarpane granice biomów.

        const cx = x + this.field(this.noise.edgeX, x, z, B.edgeScale, 2) * B.edge;
        const cz = z + this.field(this.noise.edgeZ, x, z, B.edgeScale, 2) * B.edge;

        out[0] = G.field(G.noise.temperature, cx, cz, SHAPE.SCALES.temperature, 2);
        out[1] = G.field(G.noise.humidity, cx, cz, SHAPE.SCALES.humidity, 2);
        out[2] = G.forests.forestField(cx, cz);
        out[3] = this.field(this.noise.wet, x, z, B.wetlandScale, 2);
        out[4] = this.field(this.noise.snow, x, z, 60, 2);

        for (let i = 0; i < FOREST_TYPES.length; i++) {
            out[5 + i] = this.field(this.noise.types, cx + i * 2711, cz - i * 1291, B.forestScale, 1);
        }

        out[MUGO_FIELD] = this.field(this.noise.mugo, cx, cz, B.mugoScale, 2);

        return out;

    }


    // Węzeł siatki (gx, gz): indeks wartości w cacheValues.

    node(gx, gz) {

        let h = Math.imul(gx, 0x27d4eb2d) ^ Math.imul(gz, 0x165667b1);

        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);

        const slot = (h ^ (h >>> 13)) & (CACHE_SIZE - 1);

        const key = gx * 1048576 + gz;

        const index = slot * VALUES;

        if (this.cacheKeys[slot] !== key) {

            this.exactFields(gx * GRID, gz * GRID, this.exact);

            this.cacheValues.set(this.exact, index);

            this.cacheKeys[slot] = key;

        }

        return index;

    }


    // Kolor trawy w rogach kolumn chunka (17 x 17 rogów, r g b - bajty,
    // 128 = 1.0) - do chunk.tint (ChunkMesher.js). heightAt(i, j) -
    // wysokość terenu w rogu (i, j = 0..16).

    tintGrid(baseX, baseZ, heightAt) {

        const side = 17;

        const tint = new Uint8Array(side * side * 3);

        const color = this.tintColor;

        for (let j = 0; j < side; j++) {

            for (let i = 0; i < side; i++) {

                const fields = this.fieldsAt(baseX + i, baseZ + j);

                const above = heightAt(i, j) - SEA_LEVEL;

                grassTint(fields[0] - Math.max(0, above) / 60, fields[1], above, color);

                const n = (j * side + i) * 3;

                tint[n] = Math.round(color[0] * 127.5);
                tint[n + 1] = Math.round(color[1] * 127.5);
                tint[n + 2] = Math.round(color[2] * 127.5);

            }

        }

        return tint;

    }


    // Pola biomów w (x, z): płynnie między węzłami siatki (exact -
    // policzone dokładnie w tym punkcie: daleki teren, gdzie próbki są
    // rzadko i węzły by się nie przydały).

    fieldsAt(x, z, exact = false) {

        if (exact) {
            return this.exactFields(x, z, this.fields);
        }

        const fx = x / GRID;
        const fz = z / GRID;

        const gx = Math.floor(fx);
        const gz = Math.floor(fz);

        const tx = fx - gx;
        const tz = fz - gz;

        const a = this.node(gx, gz);
        const b = this.node(gx + 1, gz);
        const c = this.node(gx, gz + 1);
        const d = this.node(gx + 1, gz + 1);

        const v = this.cacheValues;
        const out = this.fields;

        for (let i = 0; i < VALUES; i++) {

            const top = v[a + i] + (v[b + i] - v[a + i]) * tx;
            const bottom = v[c + i] + (v[d + i] - v[c + i]) * tx;

            out[i] = top + (bottom - top) * tz;

        }

        return out;

    }


    // Pole szumu -1..1 (jak generator.field).

    field(noise, x, z, scale, octaves) {

        return this.generator.field(noise, x, z, scale, octaves);

    }


    // Wysokość granicy śniegu (bloki nad morzem) w (x, z): wyżej
    // w cieplejszym klimacie, lekko pofalowana.

    snowLine(baseTemperature, wobble) {

        const B = BIOME_SHAPE;

        return B.snowLine + B.snowWarm * baseTemperature + wobble * B.snowWobble;

    }


    // Biom w kolumnie (x, z) - klucz z BIOMES. sample - wynik
    // generator.compute (wysokość, woda, pola). jx, jz - dodatkowe
    // przesunięcie miejsca sprawdzania klimatu (drzewa na granicy
    // biomów mieszają się). Szczegóły (klimat, pole lasów...) zostają
    // w this.info.

    classify(x, z, sample, jx = 0, jz = 0, exact = false) {

        const B = BIOME_SHAPE;
        const G = this.generator;
        const info = this.info;

        const height = sample.height;
        const above = height - SEA_LEVEL;

        info.above = above;


        // Woda.

        if (sample.water > height) {

            info.biome = sample.ocean ? 'sea' : sample.lake ? 'lake' : 'river';

            return info.biome;

        }


        // Klimat i pola (w miejscu przesuniętym szumem - poszarpane
        // granice; jx, jz - jeszcze dodatkowo).

        const fields = this.fieldsAt(x + jx, z + jz, exact);

        const baseTemperature = fields[0];

        const temperature = baseTemperature - Math.max(0, above) / 60;

        const humidity = fields[1];

        const forest = fields[2];

        info.temperature = temperature;
        info.humidity = humidity;
        info.forest = forest;


        // Plaża i wydmy.

        if (
            (sample.base < 1 && above <= SHAPE.BEACH_HEIGHT && sample.depression < 0.05) ||
            sample.dune > B.duneBiome
        ) {
            info.biome = 'beach';
            return info.biome;
        }


        // Ośnieżone szczyty i skaliste góry (ponad granicą gołej skały).

        const snowLine = this.snowLine(baseTemperature, fields[4]);

        info.snowLine = snowLine;

        if (above >= snowLine) {
            info.biome = 'snowy';
            return info.biome;
        }

        const rockLine = G.rockLine(x, z) - SEA_LEVEL;

        if (above >= rockLine - B.rockyBelow) {
            info.biome = 'rocky';
            return info.biome;
        }


        // Góry: hala (nad granicą lasu i na polanach) albo świerczyna -
        // niżej w ciepłym klimacie też buczyna.

        const treeLine = rockLine - SHAPE.FORESTS.treeLine - B.alpineBelow;

        const mountain = above >= B.mountainAbove || sample.mountains > B.mountainField;

        if (mountain && (above >= treeLine || forest < B.alpineForest)) {

            // Kosodrzewina: pas tuż nad granicą lasu (szerszy, gdy
            // wilgotno), w plamach - między nimi hala.

            const band = B.mugoBand[0] + (B.mugoBand[1] - B.mugoBand[0]) * smoothstep(-0.4, 0.5, humidity);

            if (above >= treeLine && above < treeLine + band && forest > GROVE_FOREST && fields[MUGO_FIELD] > B.mugoPatch) {
                info.biome = 'mugo_scrub';
                return info.biome;
            }

            info.biome = 'alpine';
            return info.biome;
        }


        // Mokradła: przy rzekach i jeziorach na nizinach (szerzej, gdy
        // wilgotno), w depresjach i w wilgotnych obniżeniach.

        if (!mountain && above < B.wetlandAbove) {

            const wet = smoothstep(-0.3, 0.6, humidity);

            const water = Math.min(sample.riverGap ?? Infinity, sample.lakeGap ?? Infinity);

            const reach = B.wetlandReach[0] + (B.wetlandReach[1] - B.wetlandReach[0]) * wet;

            const patch = fields[3];

            if (
                water < reach * (0.75 + 0.5 * (patch * 0.5 + 0.5)) ||
                sample.depression > B.wetlandDepression ||
                (humidity > B.wetlandHumidity && patch > B.wetlandPatch && sample.flatness > 0.3)
            ) {
                info.biome = 'wetland';
                return info.biome;
            }

        }


        // Las albo łąka: pole lasów (w wilgotnym klimacie las łatwiej).

        if (forest < B.forestFrom - B.forestHumid * humidity) {

            // Na ciepłych, suchych łąkach - gaj oliwny (rzadkie drzewa).

            info.biome = !mountain && forest > GROVE_FOREST && this.oliveScore(temperature, humidity, above) + B.forestMix * fields[5 + 8] > B.oliveMeadow
                ? 'olive_grove' : 'meadow';

            return info.biome;
        }

        const type = this.forestType(fields, temperature, humidity, above);

        info.biome = mountain ? (type === 'beech' ? 'beech' : 'spruce') : type;

        return info.biome;

    }


    // Rodzaj lasu z klimatu i wysokości (najlepsza ocena; plamy
    // szumu, żeby lasy różnych rodzajów przeplatały się).

    forestType(fields, t, h, above) {

        const s = this.scores;

        s[0] = 1.15 * smoothstep(-0.35, -0.8, t) + 1.0 * smoothstep(20, 34, above) + 0.1 * h;
        s[1] = 0.3 + 1.0 * smoothstep(-0.15, -0.55, h) + 0.2 * smoothstep(5, 1, above) - 0.4 * smoothstep(-0.5, -0.9, t);
        s[2] = 0.38 + 0.62 * smoothstep(6, 16, above) * smoothstep(-0.35, 0.1, h) - 0.6 * smoothstep(-0.45, -0.8, t) - 0.6 * smoothstep(28, 38, above);
        s[3] = 0.22 + 0.5 * smoothstep(0.05, 0.5, h) + 0.4 * smoothstep(8, 2, above) - 0.45 * smoothstep(0, 0.4, t);
        s[4] = 0.45 + 0.5 * smoothstep(-0.3, 0.3, t) + 0.2 * smoothstep(12, 4, above) - 0.3 * smoothstep(0.2, 0.7, h);

        // 0.83.0 - każdy tylko w swoim klimacie (poza nim przegrywa):
        // klon - umiarkowanie i średnio wilgotno, sekwoja - chłodno,
        // bardzo wilgotno i nisko, eukaliptus - ciepło i wilgotno,
        // oliwka - ciepło i sucho.
        const F = BIOME_SHAPE.newForests;
        s[5] = F.maple[0] + F.maple[1] * smoothstep(-0.7, -0.4, t) * (1 - smoothstep(0, 0.3, t)) * smoothstep(-0.25, 0.1, h);
        s[6] = F.sequoia[0] + F.sequoia[1] * smoothstep(0.15, 0.45, h) * smoothstep(-0.95, -0.6, t) * (1 - smoothstep(-0.1, 0.2, t)) * smoothstep(26, 14, above);
        s[7] = F.eucalyptus[0] + F.eucalyptus[1] * smoothstep(0.05, 0.35, t) * smoothstep(-0.05, 0.25, h) * smoothstep(22, 10, above);
        s[8] = this.oliveScore(t, h, above);

        let best = 0;

        for (let i = 0; i < s.length; i++) {

            s[i] += BIOME_SHAPE.forestMix * fields[5 + i];

            if (s[i] > s[best]) {
                best = i;
            }

        }

        return FOREST_TYPES[best];

    }


    // Ocena gaju oliwnego (ciepło i sucho, nisko).

    oliveScore(t, h, above) {

        const F = BIOME_SHAPE.newForests;

        return F.olive[0] + F.olive[1] * smoothstep(0.1, 0.4, t) * smoothstep(-0.05, -0.3, h) * smoothstep(30, 16, above);

    }

}
