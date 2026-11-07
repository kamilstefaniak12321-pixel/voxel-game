import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    SEA_LEVEL,
    TERRAIN_DIRT_DEPTH
} from '../../config.js';

import { getBlockId, getBlockTypeById, FRUIT_BUSHES, bushStages, BLOCK_TYPES } from '../../blocks/BlockRegistry.js';

import { PLANT_PACKS, plantStageType } from '../../blocks/plantPacks.js';

import { Noise, seedToNumber } from '../Noise.js';

import * as SHAPE from './TerrainShape.js';

import { FORESTS } from './TerrainShape.js';

import { Geology } from './Geology.js';

import { Forests } from '../trees/Forests.js';

import { Rivers } from './Rivers.js';

import { RiverVegetation } from './RiverVegetation.js';

import { Biomes, BIOMES, BIOME_KEYS, BIOME_INDEX, grassTint } from './Biomes.js';

// ------------------------------------------------------------
// GENERATOR TERENU "REALISTYCZNY" (w budowie)
//
// Każda kolumna (x, z) dostaje wysokość z kilku warstw:
//
//   1. KONTYNENT    - morze, szelf, wybrzeże i niziny (profil
//                     CONTINENT_PROFILE w TerrainShape.js),
//   2. WYŻYNY       - podniesienie terenu tam, gdzie pole
//                     wypiętrzenia jest średnie; płaskowyże mają
//                     płaski wierzch i strome krawędzie,
//   3. GÓRY         - tam, gdzie wypiętrzenie jest duże: podnóże
//                     i grzbiety z pola grzbietów (doliny między
//                     nimi wychodzą same); kotliny obniżają góry,
//   4. WZGÓRZA i PAGÓRKI - falowanie, słabsze przy dużej erozji
//                     (równiny),
//   5. FORMY SZCZEGÓŁOWE - depresje, żleby, turnie.
//
// Wszystkie przejścia są płynne (smoothstep), więc między nizinami,
// wyżynami i górami są pogórza i krawędzie, a nie schodki.
// Wynik zależy tylko od seeda i pozycji - każdy chunk można
// wygenerować osobno i zawsze pasuje do sąsiadów.
//
// Pod powierzchnią - skały według budowy geologicznej (Geology.js):
// granit, kamień, wapień, piaskowiec, łupek, bazalt, żyły lepidolitu.
//
// Na trawie rosną rośliny: trawa (rzadka albo gęste łąki), kępy
// kwiatów, paprocie w wilgotnych miejscach, pojedyncze zioła
// (PLANTS w TerrainShape.js), i drzewa - lasy sześciu gatunków
// (src/world/trees/Forests.js, FORESTS w TerrainShape.js).
//
// Rzeki i jeziora powstają z sieci spływu w Rivers.js. Dawna warstwa
// suchych szczelin nie wycina już niezależnych koryt w wyżynach.
// ------------------------------------------------------------

// Wartości szumu z kilku oktaw mieszczą się w wąskim zakresie -
// mnożymy je, żeby pola miały mniej więcej zakres -1..1.

const GAINS = [0, 1.6, 2.0, 2.3, 2.5];


function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

}


// Liczba 0-1 "losowa", ale zawsze taka sama dla tego miejsca
// (seed, x, z, salt) - rośliny wychodzą identycznie przy każdym
// generowaniu chunka.

function hash01(seed, x, z, salt) {

    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) | 0;

    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;

}


function smoothstep(edge0, edge1, value) {

    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);

}


// Stopnie (tarasy): płaskie półki o wysokości `step` i strome,
// krótkie przejścia między nimi.

function terrace(height, step) {

    const level = Math.floor(height / step);

    const t = height / step - level;

    return (level + smoothstep(0.75, 1, t)) * step;

}


// Wartość z tabeli [[x, y], ...] - liniowo między wierszami.

function profile(table, x) {

    if (x <= table[0][0]) {
        return table[0][1];
    }

    for (let i = 1; i < table.length; i++) {

        if (x <= table[i][0]) {

            const [x0, y0] = table[i - 1];
            const [x1, y1] = table[i];

            return y0 + (y1 - y0) * (x - x0) / (x1 - x0);

        }

    }

    return table[table.length - 1][1];

}


// Nurt rzeki z kolumny (compute: flowX, flowZ) do chunk.flow (bloki/s
// razy 32; tablica powstaje dopiero, gdy chunk ma rzekę).

function setFlow(chunk, lx, lz, sample) {

    if (sample.flowX === 0 && sample.flowZ === 0) {
        return;
    }

    chunk.flow ??= new Int8Array(CHUNK_SIZE * CHUNK_SIZE * 2);

    const n = (lz * CHUNK_SIZE + lx) * 2;

    chunk.flow[n] = clamp(Math.round(sample.flowX * 32), -127, 127);
    chunk.flow[n + 1] = clamp(Math.round(sample.flowZ * 32), -127, 127);

    // Capture the natural channel in the existing generation/restoration pass.
    // A save may contain a different pool above or below this column; its water
    // must not inherit the procedural current merely by sharing x/z.
    const bounds = chunk.flowBounds ??= new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 2);
    const column = lz * CHUNK_SIZE + lx;
    if (sample.water > sample.height) {
        bounds[column] = Math.max(0, sample.height + 1) + 1;
        bounds[CHUNK_SIZE * CHUNK_SIZE + column] = Math.min(CHUNK_HEIGHT - 1, sample.water) + 1;
    }

}


// Daleki teren: od jakiej gęstości lasu widać korony drzew i jak
// wysoko są (bloki nad ziemią - średnio dla gatunku).

const FAR_FOREST_DENSITY = 0.16;

const FAR_CANOPY = { spruce: 13, pine: 15, beech: 10, linden: 10, oak: 8, birch: 10 };


// Biomy leśne (w gęstym lesie więcej ściółki).

const FOREST_BIOMES = new Set(['deciduous', 'beech', 'birch', 'pine', 'spruce']);


// Dokładność liczenia: pełna (chunki), średnia i zgrubna (daleki teren -
// bez szczegółów mniejszych niż odstęp próbek).

export const DETAIL_FULL = 0;
export const DETAIL_MEDIUM = 1;
export const DETAIL_COARSE = 2;

// Sama "makrorzeźba" (kontynent, wyżyny, góry, płaskowyże, depresje -
// bez wzgórz, pagórków i drobnych form, bez rzek): gładka wysokość,
// po której spływają rzeki (Rivers.js). Pola jak przy DETAIL_FULL.
export const DETAIL_MACRO = 3;


// Opis biomu (Biomes.js) -> to samo po numerach bloków, do szybkiego
// generowania. Progi plam (cover -> próg pola) - PATCH_LEVELS.

function resolveBiome(biome, key) {

    const plants = biome.plants;

    // Rośliny z paczek roślin (gdzieRosnie w roslina.json): plamy jak
    // "patches", w plamie losowy etap wzrostu (ids, wagi narastająco).
    // Waga biomu (główny 1, poboczny mniej) - mniej plam. Pole plam
    // i losowanie z numeru paczki (salt), nie z miejsca na liście - nowa
    // roślina nie przesuwa plam innych.

    const packPatches = PLANT_PACKS
        .filter((pack) => pack.where?.biomes.includes(key))
        .map((pack) => {
            let sum = 0;
            return {
                id: 0,
                ids: pack.stages.map((_, stage) => getBlockId(plantStageType(pack, stage))),
                weights: pack.where.stages.map((weight) => (sum += weight)),
                density: pack.where.density,
                level: patchLevel(pack.where.cover * (pack.where.weights?.[key] ?? 1)),
                salt: pack.firstId,
                // Duża roślina (wystaje poza blok - indygowiec): nie dwie
                // obok siebie (patchPlantAt).
                spaced: pack.stages.some((stage) => stage.tuft?.wide),
                // Na czym rośnie: "ziemia" (trawa), "piasek" (z "podloze":
                // ["sand"] - kocanka, mikołajek, nagietek - plaże, wydmy),
                // "kamien" (wierzch skał - porosty); "pnie" - osobno,
                // decorateTrunks.
                surfaces: new Set([
                    ...pack.where.on,
                    ...(pack.where.on.includes('ziemia') && (pack.ground ?? []).includes('sand') ? ['piasek'] : [])
                ])
            };
        });

    return {
        key: biome,
        ground: (biome.ground ?? []).map(([type, cover]) => ({ id: getBlockId(type), level: patchLevel(cover) })),
        plants: plants ? {
            grass: plants.grass,
            tall: plants.tall,
            flowers: plants.flowers ? plants.flowers.map(getBlockId) : null,
            flowerDensity: plants.flowerDensity ?? SHAPE.PLANTS.flowerDensity,
            fern: plants.fern,
            herbs: plants.herbs.map(([type, chance]) => [chance, getBlockId(type)]),
            patches: [
                ...(plants.patches ?? []).map(([type, density, cover]) => ({ id: getBlockId(type), density, level: patchLevel(cover) })),
                ...packPatches
            ],
            bushes: plants.bushes ? {
                stages: plants.bushes.species.map((species) => bushStages(species).map(getBlockId)),
                density: plants.bushes.density,
                threshold: plants.bushes.threshold ?? SHAPE.PLANTS.bushThreshold
            } : null
        } : null
    };

}


// Pole plam (szum 2 oktawy, -1..1) nie ma równego rozkładu - próg, nad
// którym jest mniej więcej `cover` części powierzchni, z tabeli
// (zmierzone na dużym obszarze).

const PATCH_LEVELS = [
    [0, 1], [0.05, 0.65], [0.1, 0.51], [0.15, 0.41], [0.2, 0.34], [0.25, 0.27], [0.3, 0.21],
    [0.35, 0.16], [0.4, 0.1], [0.45, 0.05], [0.5, 0], [0.6, -0.1], [0.7, -0.21],
    [0.8, -0.34], [0.9, -0.51], [1, -1.01]
];

// Pnie drzew (do porostów i hub - decorateTrunks) i paczki roślin, które
// na nich rosną.

const LOG_IDS = new Uint8Array(65536);

for (const [type, definition] of Object.entries(BLOCK_TYPES)) {
    if (definition.part === 'log' || /_log($|_)/.test(type)) {
        LOG_IDS[definition.id] = 1;
    }
}

const TRUNK_PACKS = PLANT_PACKS.filter((pack) => pack.where?.on.includes('pnie'));

function patchLevel(cover) {

    return profile(PATCH_LEVELS, cover);

}

// ------------------------------------------------------------

export class RealisticGenerator {

    constructor(seed) {

        // Wspólne pola wszystkich generatorów (patrz generators.js).

        this.type = 'realistic';

        this.seaLevel = SEA_LEVEL;
        this.baseHeight = SEA_LEVEL + 4;


        // Osobny szum dla każdego pola (inny seed), żeby np. góry
        // nie pokrywały się z kotlinami.

        const base = seedToNumber(seed);

        const noise = (k) => new Noise((base + Math.imul(k, 0x9e3779b1)) >>> 0);

        this.noise = {
            warpX: noise(1),
            warpZ: noise(2),
            continent: noise(3),
            relief: noise(4),
            erosion: noise(5),
            ridges: noise(6),
            peaks: noise(7),
            hills: noise(8),
            bumps: noise(9),
            basins: noise(10),
            plateaus: noise(11),
            gullies: noise(13),
            crags: noise(14),
            depressions: noise(15),
            temperature: noise(16),
            humidity: noise(17),
            rockLine: noise(18),
            meadows: noise(19),
            flowers: noise(20),
            flowerSpecies: noise(21),
            bushes: noise(22),
            bushSpecies: noise(23),
            dunes: noise(24),
            dunePatch: noise(25),
            ground: noise(26),
            groundB: noise(27),
            patches: noise(28)
        };

        this.plantSeed = Math.imul(base, 0x2545f491) >>> 0;

        this.riverVegetation = new RiverVegetation(this.plantSeed);


        this.ids = {
            stone: getBlockId('stone'),
            dirt: getBlockId('dirt'),
            grass: getBlockId('grass'),
            sand: getBlockId('sand'),
            gravel: getBlockId('gravel'),
            water: getBlockId('water'),
            granite: getBlockId('granite'),
            lepidolite: getBlockId('lepidolite'),
            shortGrass: getBlockId('short_grass'),
            tallGrass: getBlockId('tall_grass'),
            fern: getBlockId('fern'),
            clover: getBlockId('clover'),
            plantain: getBlockId('plantain'),
            nettle: getBlockId('nettle'),
            dandelion: getBlockId('dandelion'),
            snow: getBlockId('snow'),
            snowLayer: getBlockId('snow_layer'),
            mud: getBlockId('mud'),
            clay: getBlockId('clay'),
            reed: getBlockId('reed'),
            duneGrass: getBlockId('dune_grass')
        };

        // Kwiaty w kępach (kolejność = plamy pola gatunków).

        this.flowerIds = ['poppy', 'cornflower', 'chamomile', 'dandelion'].map(getBlockId);

        // Krzaki owocowe: [gatunek][etap] -> ID (etapy: sadzonka, krzak,
        // kilka owoców, pełen owoców).

        this.bushIds = Object.keys(FRUIT_BUSHES).map((species) => bushStages(species).map(getBlockId));


        // Biomy: wierzch ziemi i rośliny każdego biomu po numerach bloków
        // (Biomes.js - BIOMES), w kolejności BIOME_KEYS.

        this.biomeData = BIOME_KEYS.map((key) => resolveBiome(BIOMES[key], key));


        // Skały pod ziemią (granit, wapień, piaskowiec...).

        this.geology = new Geology(this, base);


        // Lasy i drzewa.

        this.forests = new Forests(this, base);


        // Rzeki i jeziora (spływają po makrorzeźbie).

        this.rivers = new Rivers(this, base);


        // Biomy (łąki, lasy, góry, mokradła...).

        this.biomes = new Biomes(this, base);


        // Kolumny chunka (granice skał) - używane ponownie.

        this.chunkColumns = Array.from(
            { length: CHUNK_SIZE * CHUNK_SIZE },
            () => this.geology.createColumn()
        );

        // 2 bajty na blok - numery do 65279 (rośliny z paczek 5000+).
        this.columnBuffer = new Uint16Array(CHUNK_HEIGHT);


        // Wynik ostatniego compute() (używany ponownie, bez tworzenia
        // nowych obiektów dla każdej kolumny).

        this.sample = {};

        this.farTint = new Float32Array(3);

    }

    // --------------------------------------------------------
    // POLA
    // --------------------------------------------------------

    // Pole szumu: -1..1.

    field(noise, x, z, scale, octaves) {

        return clamp(noise.fractal2D(x / scale, z / scale, octaves) * GAINS[octaves], -1, 1);

    }


    // Pole "grzbietów": 1 na linii grzbietu, w dół po obu stronach.

    ridged(noise, x, z, scale, octaves) {

        return 1 - Math.abs(this.field(noise, x, z, scale, octaves));

    }


    // Liczy wszystkie pola i wysokość w kolumnie (x, z).
    // detail  - DETAIL_FULL / MEDIUM / COARSE (daleki teren) / MACRO
    //           (tylko makrorzeźba - out.macro, out.ocean),
    // spacing - odstęp próbek dalekiego terenu (rzeki węższe niż kratka
    //           i tak mają ją zalać - inaczej by z daleka znikały).
    // Wynik w `out` (domyślnie wspólny obiekt this.sample):
    //   height  - y najwyższego bloku terenu (bez wody)
    //   ocean   - czy to morze (tu woda sięga do SEA_LEVEL)
    //   water   - y najwyższego bloku wody (morze, rzeka, jezioro) albo 0
    //   macro   - wysokość makrorzeźby (y, z ułamkiem)
    //   river   - 0 nic, 1 koryto rzeki, 2 brzeg; lake - jezioro;
    //   flowX, flowZ - nurt rzeki (bloki na sekundę)
    //   oraz wartości pól (do opisu, mapy i powierzchni).

    compute(x, z, detail = DETAIL_FULL, out = this.sample, spacing = 1) {

        const N = this.noise;
        const S = SHAPE.SCALES;


        // Wykrzywienie: brzegi i pasma gór mają nieregularne kształty.

        const warpX = x + this.field(N.warpX, x, z, S.warp, 2) * SHAPE.WARP_STRENGTH;
        const warpZ = z + this.field(N.warpZ, x, z, S.warp, 2) * SHAPE.WARP_STRENGTH;


        // 1. Kontynent: morze ↔ ląd.

        const continent = this.field(N.continent, warpX, warpZ, S.continent, detail === DETAIL_COARSE ? 3 : 4);

        const base = profile(SHAPE.CONTINENT_PROFILE, continent);

        const land = smoothstep(-0.30, -0.18, continent);
        const inland = smoothstep(-0.15, 0.55, continent);


        // 2-3. Wypiętrzenie: niziny, wyżyny, góry. Erozja: jak gładko.

        const uplift = this.field(N.relief, warpX, warpZ, S.relief, 3) + 0.25 * inland;

        const erosion = this.field(N.erosion, x, z, S.erosion, 2);

        const flatness = smoothstep(SHAPE.PLAIN_FROM, SHAPE.PLAIN_FULL, erosion);

        let upland = smoothstep(SHAPE.UPLAND_FROM, SHAPE.UPLAND_FULL, uplift) * land;
        let mountains = smoothstep(SHAPE.MOUNTAINS_FROM, SHAPE.MOUNTAINS_FULL, uplift) * land;

        const mountainsBeforeBasins = mountains;


        // Kotliny: obniżone, płaskie dna wśród gór i wyżyn.

        const basin =
            smoothstep(SHAPE.BASIN_FROM, SHAPE.BASIN_FULL, this.field(N.basins, x, z, S.basins, 2)) *
            smoothstep(0.15, 0.5, mountains + upland * 0.5);

        mountains *= 1 - basin;
        upland *= 1 - 0.5 * basin;


        // Płaskowyże: wyżyna z płaskim wierzchem i stromą krawędzią.

        const plateau =
            smoothstep(SHAPE.PLATEAU_FROM, SHAPE.PLATEAU_FULL, this.field(N.plateaus, x, z, S.plateaus, 2)) *
            (1 - mountains);

        const steepUpland = smoothstep(0.35, 0.65, upland);

        const uplandLift = SHAPE.UPLAND_HEIGHT * (upland + (steepUpland - upland) * plateau);


        // Góry: grzbiety (r = 1 na grani), wysokość szczytów się zmienia,
        // przy dużej erozji góry są niższe i łagodniejsze.

        const ridge = this.ridged(N.ridges, warpX, warpZ, S.ridges, detail === DETAIL_COARSE ? 2 : 3);

        const peaks = 0.7 + 0.3 * this.field(N.peaks, x, z, S.peaks, 1);

        const ridgeShape = Math.pow(ridge, 1.2 + 0.8 * (1 - flatness));

        const massif =
            mountains *
            (SHAPE.MOUNTAIN_BASE + SHAPE.MOUNTAIN_RIDGE * ridgeShape * peaks * (1 - 0.3 * flatness));


        // 4. Wzgórza i pagórki.

        const hillAmplitude =
            (SHAPE.HILLS.lowland +
                (SHAPE.HILLS.upland - SHAPE.HILLS.lowland) * upland +
                SHAPE.HILLS.mountains * mountains) *
            (1 - 0.85 * flatness) *
            (1 - 0.8 * plateau) *
            land;

        const macroOnly = detail === DETAIL_MACRO;

        const hills = macroOnly ? 0 :
            this.field(N.hills, x, z, S.hills, detail === DETAIL_FULL ? 3 : detail === DETAIL_MEDIUM ? 2 : 1) *
            hillAmplitude;

        const hillocks = detail === DETAIL_COARSE || macroOnly
            ? 0
            : this.field(N.bumps, x, z, S.bumps, 2) *
              SHAPE.HILLOCK_HEIGHT * (1 - 0.7 * flatness) * (1 - mountains) * land;


        let height = base + uplandLift + massif + hills + hillocks;

        // Makrorzeźba: to samo bez wzgórz, pagórków i drobnych form.

        let macro = base + uplandLift + massif;


        // Płaskowyże: teren w stopniach - płaskie wierzchy, strome krawędzie.

        if (plateau > 0 && height > 2) {
            height += (terrace(height, SHAPE.PLATEAU_STEP) - height) * plateau;
        }

        if (plateau > 0 && macro > 2) {
            macro += (terrace(macro, SHAPE.PLATEAU_STEP) - macro) * plateau;
        }


        // 5. Depresje: suche obniżenia na nizinach blisko (ale nie tuż
        // przy) morzu.

        const depression =
            smoothstep(SHAPE.DEPRESSION_FROM, SHAPE.DEPRESSION_FULL, this.field(N.depressions, x, z, S.depressions, 2)) *
            (1 - upland) * (1 - mountains) *
            smoothstep(-0.10, 0.0, continent) * (1 - smoothstep(0.15, 0.40, continent));

        height += (-SHAPE.DEPRESSION_DEPTH + hillocks * 0.3 - height) * depression;

        macro += (-SHAPE.DEPRESSION_DEPTH - macro) * depression;


        // Morze tam, gdzie profil kontynentu schodzi pod wodę. Na lądzie
        // teren nie schodzi poniżej morza (poza depresjami) - inaczej przy
        // brzegu woda stałaby "ścianą" obok suchego dołka.

        const ocean = base < 0;

        if (!ocean && depression < 0.05) {
            macro = Math.max(macro, 0);
        }

        if (macroOnly) {

            out.macro = SEA_LEVEL + macro;
            out.ocean = ocean;
            out.mountains = mountains;
            out.height = clamp(SEA_LEVEL + Math.floor(macro), 2, CHUNK_HEIGHT - 6);

            return out;

        }


        // Wydmy: piaszczyste pagórki na płaskich wybrzeżach (nie
        // wszędzie - w plamach pola dunePatch). duneZone - jak bardzo
        // to pas wydm (0-1, biom plaży), dune - wysokość wydmy.

        let duneZone = 0;
        let dune = 0;

        const D = SHAPE.DUNES;

        if (base > D.zone[0] && base < D.zone[1] && !ocean) {

            duneZone =
                smoothstep(D.zone[0], D.zone[0] + 0.6, base) *
                (1 - smoothstep(D.zone[1] - 1.4, D.zone[1], base)) *
                smoothstep(D.patch, D.patch + 0.25, this.field(N.dunePatch, x, z, D.patchScale, 2)) *
                (1 - upland) * (1 - mountains) * (1 - smoothstep(0, 0.05, depression));

            if (duneZone > 0.02 && detail !== DETAIL_COARSE) {

                const crest = this.ridged(N.dunes, warpX, warpZ, D.scale, 2);

                dune = D.height * smoothstep(0.1, 0.6, duneZone) * smoothstep(0.3, 0.95, crest);

                height += dune;

            }

        }

        out.dune = dune;
        out.duneZone = duneZone;


        // Żleby: rynny na zboczach (nie na grani i nie na dnie doliny).

        let gully = 0;

        if (detail === DETAIL_FULL && mountains > 0.2) {

            const cut = this.ridged(N.gullies, x, z, S.gullies, 1);

            if (cut > SHAPE.GULLY_EDGE) {

                gully =
                    SHAPE.GULLY_DEPTH * (cut - SHAPE.GULLY_EDGE) / (1 - SHAPE.GULLY_EDGE) *
                    mountains * 4 * ridge * (1 - ridge);

            }

        }


        // Turnie: skalne iglice na najwyższych graniach.

        let crag = 0;

        if (detail === DETAIL_FULL && mountains > 0.3 && ridge > 0.7) {

            crag =
                SHAPE.CRAG_HEIGHT *
                smoothstep(0.3, 0.7, this.field(N.crags, x, z, S.crags, 2)) *
                mountains * smoothstep(0.7, 0.9, ridge) * (1 - flatness);

        }


        height += crag - gully;


        if (!ocean && depression < 0.05) {
            height = Math.max(height, 0);
        }


        // Rzeki i jeziora: koryta, doliny, brzegi i woda (Rivers.js) -
        // zmieniają wysokość tylko w pobliżu wody.

        out.ocean = ocean;
        out.mountains = mountains;
        out.macro = SEA_LEVEL + macro;
        out.water = ocean ? SEA_LEVEL : 0;

        const surface = this.rivers.shape(x, z, SEA_LEVEL + macro, SEA_LEVEL + height, out, spacing);


        out.height = clamp(Math.floor(surface), 2, CHUNK_HEIGHT - 6);

        out.continent = continent;
        out.uplift = uplift;
        out.erosion = erosion;
        out.ridge = ridge;
        out.mountains = mountains;
        out.mountainsBeforeBasins = mountainsBeforeBasins;
        out.upland = upland;
        out.flatness = flatness;
        out.basin = basin;
        out.plateau = plateau;
        out.depression = depression;
        out.gully = gully;
        out.crag = crag;
        out.hills = hills;
        out.hillocks = hillocks;
        out.hillAmplitude = hillAmplitude;
        out.base = base;

        return out;

    }


    getHeight(x, z) {

        return this.compute(x, z).height;

    }


    // Wysokość, powyżej której jest goła skała (lekko pofalowana).

    rockLine(x, z) {

        return SEA_LEVEL + SHAPE.ROCK_LINE + this.field(this.noise.rockLine, x, z, 40, 1) * 4;

    }


    // Rodzaj powierzchni: 'seabed' (dno morza), 'riverbed' (dno rzeki
    // i jeziora - piasek, w górach żwir), 'sand', 'rock', 'grass'.
    // slope - największa różnica wysokości do sąsiedniej kolumny.

    surfaceKind(x, z, sample, slope) {

        const height = sample.height;

        if (sample.ocean && height < SEA_LEVEL) {
            return 'seabed';
        }

        if (sample.water > height) {
            return 'riverbed';
        }

        if (height <= SEA_LEVEL + SHAPE.BEACH_HEIGHT && sample.base < 1 && sample.depression < 0.05) {
            return 'sand';
        }

        // Wydmy (biom plaży) - piasek także między nimi.

        if (sample.duneZone > SHAPE.BIOME_SHAPE.duneBiome) {
            return 'sand';
        }

        // Brzeg rzeki (stromy tylko przez koryto obok) - trawa, nie skała.

        const steep = slope >= SHAPE.ROCK_SLOPE && !(sample.river > 0);

        if (sample.crag > 1.5 || steep || height > this.rockLine(x, z)) {
            return 'rock';
        }

        return 'grass';

    }

    // --------------------------------------------------------
    // CHUNK
    // --------------------------------------------------------

    generateChunk(chunk) {

        const size = CHUNK_SIZE;
        chunk.biomes = new Uint8Array(size * size);
        const baseX = chunk.cx * size;
        const baseZ = chunk.cz * size;


        // Wysokości z ramką jednej kolumny (do nachylenia zboczy).

        const W = size + 2;

        const heights = new Int16Array(W * W);

        const samples = [];

        for (let j = 0; j < W; j++) {

            for (let i = 0; i < W; i++) {

                const inside = i > 0 && j > 0 && i <= size && j <= size;

                const sample = this.compute(baseX + i - 1, baseZ + j - 1, DETAIL_FULL, inside ? {} : this.sample);

                heights[j * W + i] = sample.height;

                if (inside) {
                    samples.push(sample);
                }

            }

        }


        // Skały każdej kolumny i najwyższy granit w chunku (do tej
        // wysokości liczymy szum żył lepidolitu).

        let graniteTop = 0;

        for (let k = 0; k < samples.length; k++) {

            const lx = k % size;
            const lz = Math.floor(k / size);

            const col = this.geology.column(baseX + lx, baseZ + lz, samples[k], this.chunkColumns[k]);

            graniteTop = Math.max(graniteTop, Math.min(col.graniteTop, col.height + 1));

        }

        if (graniteTop > 0) {
            this.geology.prepareChunk(baseX, baseZ, graniteTop);
        }


        const buffer = this.columnBuffer;

        for (let lz = 0; lz < size; lz++) {

            for (let lx = 0; lx < size; lx++) {

                const k = lz * size + lx;

                const x = baseX + lx;
                const z = baseZ + lz;

                const h = (lz + 1) * W + (lx + 1);

                const height = heights[h];

                const slope = Math.max(
                    Math.abs(height - heights[h - 1]),
                    Math.abs(height - heights[h + 1]),
                    Math.abs(height - heights[h - W]),
                    Math.abs(height - heights[h + W])
                );

                const sample = samples[k];

                const kind = this.surfaceKind(x, z, sample, slope);

                const biome = BIOME_INDEX[this.biomes.classify(x, z, sample)];
                chunk.biomes[k] = biome;

                const top = this.fillColumn(x, z, sample, kind, this.chunkColumns[k], buffer, lx, lz, biome);

                for (let y = 0; y <= top; y++) {
                    chunk.setId(lx, y, lz, buffer[y]);
                }

                setFlow(chunk, lx, lz, sample);

            }

        }


        // Drzewa - także te z sąsiednich chunków, których korony
        // tu sięgają.

        this.forests.placeTrees(chunk);


        // Porosty i huby na pniach (rośliny z "na": ["pnie"]).

        this.decorateTrunks(chunk, baseX, baseZ, heights, samples, W);


        // Kolor trawy w rogach kolumn (ChunkMesher.js) - wysokość rogu
        // to średnia czterech kolumn wokół niego.

        chunk.tint = this.biomes.tintGrid(baseX, baseZ, (i, j) =>
            (heights[j * W + i] + heights[j * W + i + 1] + heights[(j + 1) * W + i] + heights[(j + 1) * W + i + 1]) / 4
        );

    }


    // Porosty i huby na bokach pni (paczki roślin z "na": ["pnie"]): od
    // ziemi do 6 bloków w górę, w powietrzu obok pnia (w tym chunku),
    // z szansą gestosc x waga biomu (plamy - ten sam szum co na ziemi,
    // więc porośnięte są całe kępy drzew). Jedna roślina na komórkę.

    decorateTrunks(chunk, baseX, baseZ, heights, samples, W) {

        const packs = TRUNK_PACKS;

        if (packs.length === 0) {
            return;
        }

        const size = CHUNK_SIZE;
        const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];

        for (let lz = 0; lz < size; lz++) {

            for (let lx = 0; lx < size; lx++) {

                const x = baseX + lx;
                const z = baseZ + lz;
                const ground = heights[(lz + 1) * W + (lx + 1)];
                const key = BIOME_KEYS[BIOME_INDEX[this.biomes.classify(x, z, samples[lz * size + lx])]];

                for (let y = ground + 1; y <= ground + 6 && y < CHUNK_HEIGHT; y++) {

                    if (!LOG_IDS[chunk.getId(lx, y, lz)]) {
                        continue;
                    }

                    for (const [dx, dz] of steps) {

                        const ax = lx + dx;
                        const az = lz + dz;

                        if (ax < 0 || az < 0 || ax >= size || az >= size || chunk.getId(ax, y, az) !== 0) {
                            continue;
                        }

                        for (const pack of packs) {

                            const weight = pack.where.weights[key];

                            if (!weight) continue;

                            const salt = pack.firstId;
                            const wx = x + dx, wz = z + dz;

                            if (
                                this.field(this.noise.patches, wx + salt * 977, wz - salt * 613, 18, 2) > patchLevel(pack.where.cover * weight) &&
                                hash01(this.plantSeed, wx * 7 + y, wz, 60 + salt) < pack.where.density
                            ) {
                                const stage = hash01(this.plantSeed, wx, wz * 3 + y, 80 + salt);
                                let sum = 0, index = pack.where.stages.length - 1;
                                for (let s = 0; s < pack.where.stages.length; s++) {
                                    sum += pack.where.stages[s];
                                    if (stage < sum) { index = s; break; }
                                }
                                chunk.setId(ax, y, az, getBlockId(plantStageType(pack, index)));
                                break;
                            }

                        }

                    }

                }

            }

        }

    }


    // Nurt rzek i kolor trawy w chunku wczytanym z zapisu (zapis ma
    // tylko bloki).

    fillFlow(chunk) {

        const sample = {};
        chunk.biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

        const W = CHUNK_SIZE + 2;

        const heights = new Int16Array(W * W);

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        for (let j = 0; j < W; j++) {

            for (let i = 0; i < W; i++) {

                this.compute(baseX + i - 1, baseZ + j - 1, DETAIL_FULL, sample);

                heights[j * W + i] = sample.height;

                if (i > 0 && j > 0 && i <= CHUNK_SIZE && j <= CHUNK_SIZE) {
                    setFlow(chunk, i - 1, j - 1, sample);
                    chunk.biomes[(j - 1) * CHUNK_SIZE + i - 1] =
                        BIOME_INDEX[this.biomes.classify(baseX + i - 1, baseZ + j - 1, sample)];
                }

            }

        }

        chunk.tint = this.biomes.tintGrid(baseX, baseZ, (i, j) =>
            (heights[j * W + i] + heights[j * W + i + 1] + heights[(j + 1) * W + i] + heights[(j + 1) * W + i + 1]) / 4
        );

    }


    // Biom w kolumnie (x, z) - klucz z BIOMES (/biom, osiągnięcia).

    biomeAt(x, z) {

        return this.biomes.classify(x, z, this.compute(x, z, DETAIL_FULL, {}));

    }


    // Biom w kolumnie (numer z BIOME_INDEX); szczegóły (klimat, granica
    // śniegu...) zostają w this.biomes.info.

    biomeIndexAt(x, z, sample) {

        return BIOME_INDEX[this.biomes.classify(x, z, sample)];

    }


    // Bloki jednej kolumny do `out` (od y = 0). Zwraca y najwyższego
    // bloku (terenu albo wody). lx, lz - pozycja w chunku (szum żył
    // z prepareChunk) albo -1 dla pojedynczej kolumny. biome - numer
    // biomu (this.biomes.info musi być policzone dla tej kolumny - robi
    // to biomeIndexAt).

    fillColumn(x, z, sample, kind, col, out, lx = -1, lz = -1, biome = this.biomeIndexAt(x, z, sample)) {

        const ids = this.ids;
        const geology = this.geology;

        const height = sample.height;

        const key = BIOME_KEYS[biome];

        // Wierzch ziemi (trawa, ściółka, mech, błoto, śnieg...).

        const ground = kind === 'grass' ? this.groundAt(x, z, sample, biome) : ids.grass;


        for (let y = 0; y <= height; y++) {

            const depth = height - y;

            let id;

            if (kind === 'grass' && depth <= TERRAIN_DIRT_DEPTH) {
                id = depth === 0 ? ground : ground === ids.mud && depth === 1 ? ids.mud : ids.dirt;
            }
            else if ((kind === 'sand' || kind === 'seabed') && depth <= 2) {
                id = ids.sand;
            }
            else if (kind === 'riverbed' && depth <= 1) {

                // Dno rzeki i jeziora: w górach żwir, na mokradłach błoto
                // (pod nim glina), niżej piasek.

                id = sample.mountains > 0.4 && !sample.lake ? ids.gravel :
                    key === 'wetland' ? (depth === 0 ? ids.mud : ids.clay) :
                    ids.sand;

            }
            else {

                id = geology.rockAt(col, y);

                if (id === ids.granite && geology.isLepidolite(x, y, z, depth, lx, lz)) {
                    id = ids.lepidolite;
                }

            }

            out[y] = id;

        }


        // Ośnieżone szczyty: skała pod śniegiem (wyżej - grubszym).

        if (key === 'snowy' && kind === 'rock') {

            out[height] = ids.snow;

            if (height > 0 && this.biomes.info.above >= this.biomes.info.snowLine + 3) {
                out[height - 1] = ids.snow;
            }

        }


        let top = height;


        // Na wierzchu: płaty śniegu pod szczytami, roślina na ziemi,
        // piaskownica na wydmach.

        if (height + 1 < CHUNK_HEIGHT && !(sample.water > height)) {

            const decoration = this.decorationAt(x, z, sample, kind, biome, ground);

            if (decoration !== 0) {

                out[height + 1] = decoration;

                top = height + 1;

            }

        }

        // Woda: morze do poziomu morza, rzeka i jezioro do swojego.

        if (sample.water > height) {

            for (let y = height + 1; y <= sample.water; y++) {
                out[y] = ids.water;
            }

            // Rośliny wodne zachowują wodę w swojej komórce. Nie
            // zmieniają poziomu tafli, dna ani wyliczonego nurtu.
            this.riverVegetation.fillWater(x, z, sample, key, out);

            top = Math.max(top, sample.water);

        }

        out.fill(0, top + 1);

        return top;

    }


    // Wierzch ziemi w biomie: trawa albo plamy innej ziemi (ściółka,
    // mech, błoto, żwir... - ground w BIOMES), śnieg na szczytach,
    // błoto tuż przy wodzie na mokradłach.

    groundAt(x, z, sample, biome) {

        const ids = this.ids;

        const key = BIOME_KEYS[biome];

        if (key === 'snowy') {
            return ids.snow;
        }

        if (key === 'wetland' && Math.min(sample.riverGap ?? Infinity, sample.lakeGap ?? Infinity) < 2) {
            return ids.mud;
        }

        const ground = this.biomeData[biome].ground;

        // W gęstym lesie więcej ściółki (pierwsza ziemia lasów).

        const forest = FOREST_BIOMES.has(key) ? clamp(this.biomes.info.forest, -0.5, 0.8) * 0.35 : 0;

        for (let i = 0; i < ground.length; i++) {

            const level = ground[i].level - (i === 0 ? forest : 0);

            if (this.field(i === 0 ? this.noise.ground : this.noise.groundB, x, z, 14, 2) > level) {
                return ground[i].id;
            }

        }

        return ids.grass;

    }


    // Co stoi na wierzchu kolumny (ID bloku albo 0): płaty śniegu pod
    // granicą śniegu, roślina na ziemi (plantAt), piaskownica na
    // wydmach.

    decorationAt(x, z, sample, kind, biome, ground) {

        const key = BIOME_KEYS[biome];

        const info = this.biomes.info;


        // Płaty śniegu (warstwa śniegu) - coraz więcej pod samą granicą.

        if ((key === 'rocky' || key === 'alpine') && (kind === 'rock' || kind === 'grass')) {

            const cover = smoothstep(info.snowLine - SHAPE.BIOME_SHAPE.snowCover, info.snowLine, info.above);

            if (cover > 0 && hash01(this.plantSeed, x, z, 7) < cover * 0.85) {
                return this.ids.snowLayer;
            }

        }

        const riverPlant = this.riverVegetation.shoreAt(x, z, sample, key, kind);
        if (riverPlant && ground !== this.ids.snow) return riverPlant;

        if (kind === 'grass') {
            return ground === this.ids.snow ? 0 : this.plantAt(x, z, sample, biome);
        }

        // Rośliny z paczek, które rosną na piasku (plamy jak na trawie).

        if (kind === 'sand' && ground !== this.ids.snow) {
            const plant = this.patchPlantAt(x, z, biome, 'piasek');
            if (plant) return plant;
        }

        // Porosty na wierzchu skał.

        if (kind === 'rock' && ground !== this.ids.snow) {
            const plant = this.patchPlantAt(x, z, biome, 'kamien');
            if (plant) return plant;
        }

        // Piaskownica na wydmach (i rzadko na plaży).

        if (kind === 'sand' && key === 'beach') {

            const chance = 0.03 + 0.25 * smoothstep(0.3, 0.7, sample.duneZone ?? 0);

            return hash01(this.plantSeed, x, z, 8) < chance ? this.ids.duneGrass : 0;

        }

        return 0;

    }


    // Roślina z plam biomu (patches i paczki roślin) w kolumnie (x, z)
    // albo 0. surface - "ziemia", "piasek" albo "kamien".

    patchPlantAt(x, z, biome, surface) {

        const data = this.biomeData[biome].plants;

        if (!data) {
            return 0;
        }

        for (let i = 0; i < data.patches.length; i++) {

            const patch = data.patches[i];
            const salt = patch.salt ?? i;

            // Plamy biomu (bez surfaces) - tylko na ziemi.
            if (patch.surfaces ? !patch.surfaces.has(surface) : surface !== 'ziemia') {
                continue;
            }

            const roll = hash01(this.plantSeed, x, z, 20 + salt);

            if (
                this.field(this.noise.patches, x + salt * 977, z - salt * 613, 18, 2) > patch.level &&
                roll < patch.density &&
                (!patch.spaced || this.spacedPlant(x, z, salt, roll, patch.density))
            ) {

                if (!patch.ids) {
                    return patch.id;
                }

                const stage = hash01(this.plantSeed, x, z, 40 + salt);

                const index = patch.weights.findIndex((limit) => stage < limit);

                return patch.ids[index < 0 ? patch.ids.length - 1 : index];

            }

        }

        return 0;

    }


    // Duże rośliny (wystają poza blok) nie rosną tuż obok siebie: z kilku
    // wylosowanych w kwadracie 3 x 3 zostaje ta z najmniejszym losem
    // (zawsze ta sama - świat jest powtarzalny).

    spacedPlant(x, z, salt, roll, density) {

        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dz === 0) continue;
                const other = hash01(this.plantSeed, x + dx, z + dz, 20 + salt);
                if (other < density && other < roll) {
                    return false;
                }
            }
        }

        return true;

    }


    // Roślina na ziemi w kolumnie (x, z): ID bloku albo 0 (nic nie
    // rośnie). Co i jak gęsto - rośliny biomu (plants w BIOMES), liczby
    // wspólne: PLANTS w TerrainShape.js.

    plantAt(x, z, sample, biome = this.biomeIndexAt(x, z, sample)) {

        const data = this.biomeData[biome].plants;

        if (!data) {
            return 0;
        }

        const P = SHAPE.PLANTS;
        const ids = this.ids;

        const roll = hash01(this.plantSeed, x, z, 1);


        // Krzaki owocowe: rzadkie zarośla tam, gdzie pole krzaków
        // > bushThreshold. Gatunek (z gatunków biomu) zmienia się wolno
        // (plamy bushSpeciesScale), więc w zaroślach rośnie zwykle jeden.

        if (data.bushes) {

            const bushes = this.field(this.noise.bushes, x, z, P.bushScale, 2);

            const threshold = data.bushes.threshold;

            if (bushes > threshold) {

                const chance = (bushes - threshold) / (1 - threshold) * P.bushDensity * data.bushes.density;

                if (hash01(this.plantSeed, x, z, 5) < chance) {

                    const list = data.bushes.stages;

                    const species = this.field(this.noise.bushSpecies, x, z, P.bushSpeciesScale, 1);

                    const stages = list[clamp(Math.floor((species * 0.5 + 0.5) * list.length), 0, list.length - 1)];

                    // Etap: najczęściej z owocami, czasem bez albo sadzonka.

                    const stage = hash01(this.plantSeed, x, z, 6);

                    let index = 0;

                    while (index < 3 && stage >= P.bushStages[index]) {
                        index++;
                    }

                    return stages[index];

                }

            }

        }


        // Kępy kwiatów (gatunki biomu).

        if (data.flowers) {

            const flowers = this.field(this.noise.flowers, x, z, P.flowerScale, 2);

            if (flowers > P.flowerThreshold) {

                const chance = (flowers - P.flowerThreshold) / (1 - P.flowerThreshold) * data.flowerDensity;

                if (roll < chance) {

                    const list = data.flowers;

                    const species = this.field(this.noise.flowerSpecies, x, z, P.flowerSpeciesScale, 1);

                    let index = Math.floor((species * 0.5 + 0.5) * list.length);

                    // Trochę innych kwiatów w kępie.

                    if (list.length > 1 && hash01(this.plantSeed, x, z, 2) < P.flowerMix) {
                        index += 1 + Math.floor(hash01(this.plantSeed, x, z, 3) * (list.length - 1));
                    }

                    return list[clamp(index, 0, list.length * 2) % list.length];

                }

            }

        }


        // Rośliny w plamach (wrzos, krokusy, kępki mchu, trzcina...).

        const patched = this.patchPlantAt(x, z, biome, 'ziemia');

        if (patched) {
            return patched;
        }


        // Paprocie (wilgotno, wyżej więcej) i zioła.

        const humidity = this.biomes.info.humidity;

        const uplands = smoothstep(SHAPE.RELIEF_UPLAND * 0.5, SHAPE.RELIEF_UPLAND * 1.5, sample.height - SEA_LEVEL);

        let edge = data.fern * smoothstep(P.fernHumidity, P.fernHumidity + 0.5, humidity) * (0.6 + 0.6 * uplands);

        if (roll < edge) {
            return ids.fern;
        }

        for (const [chance, id] of data.herbs) {

            edge += id === ids.nettle ? chance * (humidity > 0 ? 1.5 : 0.5) : chance;

            if (roll < edge) {
                return id;
            }

        }


        // Trawa: od rzadkiej do gęstej łąki.

        const meadow = smoothstep(-0.5, 0.5, this.field(this.noise.meadows, x, z, P.meadowScale, 2));

        edge += data.grass[0] + (data.grass[1] - data.grass[0]) * meadow;

        if (roll < edge) {

            const tall = data.tall[0] + (data.tall[1] - data.tall[0]) * meadow;

            return hash01(this.plantSeed, x, z, 4) < tall ? ids.tallGrass : ids.shortGrass;

        }

        return 0;

    }


    // Cała kolumna (x, z) dokładnie tak, jak w chunku - bez
    // generowania chunka (mapa przekroju, komenda /skaly).
    // Zwraca { height, kind, top, blocks } (blocks - ID od y = 0).

    columnBlocks(x, z, blocks = new Uint16Array(CHUNK_HEIGHT)) {

        const sample = this.compute(x, z, DETAIL_FULL, {});

        const height = sample.height;

        let slope = 0;

        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            slope = Math.max(slope, Math.abs(height - this.compute(x + dx, z + dz).height));
        }

        const kind = this.surfaceKind(x, z, sample, slope);

        const col = this.geology.column(x, z, sample, this.geology.createColumn());

        const top = this.fillColumn(x, z, sample, kind, col, blocks);

        return { height, kind, top, blocks, column: col };

    }


    // Blok na samym wierzchu kolumny (bez wody) - nazwa, dokładnie
    // jak w chunku (szukanie skał: /skaly znajdz).

    surfaceBlock(x, z) {

        const sample = this.compute(x, z, DETAIL_FULL, {});

        const height = sample.height;

        let slope = 0;

        for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            slope = Math.max(slope, Math.abs(height - this.compute(x + dx, z + dz).height));
        }

        const kind = this.surfaceKind(x, z, sample, slope);

        const biome = this.biomeIndexAt(x, z, sample);

        if (kind === 'grass') {
            return getBlockTypeById(this.groundAt(x, z, sample, biome));
        }

        if (kind !== 'rock') {
            return 'sand';
        }

        if (BIOME_KEYS[biome] === 'snowy') {
            return 'snow';
        }

        const col = this.geology.column(x, z, sample, this.geology.createColumn());

        let id = this.geology.rockAt(col, height);

        if (id === this.ids.granite && this.geology.isLepidolite(x, height, z, 0)) {
            id = this.ids.lepidolite;
        }

        return getBlockTypeById(id);

    }


    // Skała, która jest na wierzchu (kind 'rock') albo tuż pod glebą
    // i piaskiem - nazwa bloku (mapa skał, daleki teren).

    surfaceRock(x, z, sample, kind) {

        const col = this.geology.column(x, z, sample, this.geology.createColumn());

        const y =
            kind === 'grass' ? sample.height - TERRAIN_DIRT_DEPTH - 1 :
            kind === 'sand' || kind === 'seabed' ? sample.height - 3 :
            sample.height;

        return getBlockTypeById(this.geology.rockAt(col, Math.max(0, y)));

    }

    // --------------------------------------------------------
    // Wspólny interfejs generatorów (generators.js)
    // --------------------------------------------------------

    // Powierzchnia dla dalekiego terenu (spacing = odstęp próbek).

    farSurface(x, z, spacing, groundOnly = false) {

        const sample = this.compute(x, z, spacing <= 8 ? DETAIL_MEDIUM : DETAIL_COARSE, this.sample, spacing);

        // Woda (morze, rzeka, jezioro): floor - wierzch dna (kula Ziemi
        // z kosmosu - głębia).

        if (sample.water > sample.height) {
            return { top: sample.water + 1, kind: 'water', floor: sample.height + 1 };
        }

        const kind = this.surfaceKind(x, z, sample, 0);

        const biome = this.biomes.classify(x, z, sample, 0, 0, spacing >= 8);

        // Ośnieżone szczyty - biało.

        if (biome === 'snowy' && (kind === 'rock' || kind === 'grass')) {
            return { top: sample.height + 1, kind: 'snow' };
        }

        // Goła skała - w kolorze swojego rodzaju (granit, wapień...).

        if (kind === 'rock') {
            return { top: sample.height + 1, kind: this.surfaceRock(x, z, sample, kind) };
        }


        // Las: korony drzew w kolorze liści gatunku, który tu przeważa,
        // teren podniesiony do wysokości koron - na skraju lasu nisko,
        // w gęstym lesie wyżej, i trochę nierówno (pojedyncze korony).

        if (kind === 'grass' && !groundOnly) {

            const forest = this.forests.forestAt(x, z, sample);

            if (forest.density >= FAR_FOREST_DENSITY) {

                const cover = smoothstep(FAR_FOREST_DENSITY, FORESTS.dense, forest.density);

                const bump = 0.75 + 0.5 * hash01(this.plantSeed, x, z, 9);

                return {
                    top: sample.height + 1 + Math.round(FAR_CANOPY[forest.species] * cover * bump),
                    kind: `${forest.species}_leaves`
                };

            }

        }

        // Trawa w kolorze klimatu (cieplejsza, chłodniejsza, górska).

        if (kind === 'grass') {
            return { top: sample.height + 1, kind: this.farGrassKind() };
        }

        return { top: sample.height + 1, kind };

    }


    // Rodzaj trawy na dalekim terenie (farSamples.js - GRASS_KINDS) z kolorem
    // trawy w miejscu ostatniego classify (this.biomes.info).

    farGrassKind() {

        const info = this.biomes.info;

        const tint = grassTint(info.temperature, info.humidity, info.above, this.farTint);

        if (info.above >= 34) {
            return 'grass_high';
        }

        if (tint[0] - tint[2] > 0.1) {
            return 'grass_warm';
        }

        if (tint[2] - tint[0] > 0.07) {
            return 'grass_cool';
        }

        return 'grass';

    }


    // Opis miejsca: wysokość, pas wysokości, forma terenu, pola
    // (komenda /teren, mapa terenu /mapa).
    // slopeHint - nachylenie policzone wcześniej (mapa liczy je sama
    // z siatki wysokości); bez niego liczymy je z sąsiednich kolumn.

    describe(x, z, slopeHint = null, spacing = 1) {

        const sample = this.compute(x, z, DETAIL_FULL, {}, spacing);

        const height = sample.height;


        // Nachylenie (różnica wysokości na blok) z sąsiadów co 2 bloki.

        let slope = slopeHint;

        if (slope === null) {

            const around = [[2, 0], [-2, 0], [0, 2], [0, -2]].map(
                ([dx, dz]) => this.compute(x + dx, z + dz).height
            );

            slope = Math.max(...around.map((h) => Math.abs(h - height))) / 2;

        }


        const above = height - SEA_LEVEL;

        const relief =
            sample.ocean && height < SEA_LEVEL ? 'sea' :
            height < SEA_LEVEL ? 'depression' :
            above < SHAPE.RELIEF_UPLAND ? 'lowland' :
            above < SHAPE.RELIEF_MOUNTAINS ? 'upland' :
            'mountains';


        // Klimat (pod przyszłe biomy): wyżej jest chłodniej.

        const temperature =
            this.field(this.noise.temperature, x, z, SHAPE.SCALES.temperature, 2) -
            Math.max(0, above) / 60;

        const humidity = this.field(this.noise.humidity, x, z, SHAPE.SCALES.humidity, 2);


        const surface = this.surfaceKind(x, z, sample, Math.round(slope * 2));

        // Las: gęstość (część kratek z drzewem) i gatunek, który przeważa.

        const forest = sample.ocean && height < SEA_LEVEL
            ? { density: 0, species: null }
            : this.forests.forestAt(x, z, sample);

        const biome = this.biomes.classify(x, z, sample);


        return {
            height,
            relief,
            // woda: 'river', 'lake', 'sea' albo null
            water: sample.water > height
                ? (sample.ocean ? 'sea' : sample.lake ? 'lake' : 'river')
                : null,
            landform: this.classify(sample, slope),
            surface,
            forest,
            // biom (klucz z BIOMES w Biomes.js)
            biome,
            // skała na wierzchu albo pod glebą (mapa skał)
            rock: this.surfaceRock(x, z, sample, surface),
            slope,
            fields: {
                kontynent: sample.continent,
                wypietrzenie: sample.uplift,
                erozja: sample.erosion,
                grzbiety: sample.ridge,
                gory: sample.mountains,
                wyzyny: sample.upland,
                kotlina: sample.basin,
                plaskowyz: sample.plateau,
                depresja: sample.depression,
                temperatura: temperature,
                wilgotnosc: humidity
            },
            sample
        };

    }


    // Forma terenu (klucz z landforms.js) z pól i nachylenia.

    classify(sample, slope) {

        const above = sample.height - SEA_LEVEL;

        if (sample.ocean && sample.height < SEA_LEVEL) return 'sea';

        if (sample.lake) return 'lake';

        if (sample.river === 1 && sample.water > sample.height) return 'river';

        if (sample.base < 1 && above <= SHAPE.BEACH_HEIGHT && sample.depression < 0.05) return 'coast';

        if (sample.height < SEA_LEVEL) return 'depression';

        if (sample.crag > 2.5) return 'crag';
        if (sample.gully > 1.2) return 'gully';

        if (sample.mountains > 0.35) {

            if (sample.ridge > 0.9) return 'ridge';
            if (sample.ridge < 0.25) return 'valley';
            if (slope < 0.6) return 'flat';

            return 'mountains';

        }

        if (sample.basin > 0.5 && sample.mountainsBeforeBasins > 0.3) return 'basin';

        if (sample.plateau * sample.upland > 0.45 && slope < 1) return 'plateau';

        if (sample.hillAmplitude > 3 && sample.hills > sample.hillAmplitude * 0.45) return 'hill';

        if (sample.hillocks > 0.9) return 'hillock';

        if (sample.flatness > 0.5 && slope < 0.75 && sample.upland < 0.5) return 'plain';

        if (sample.hillAmplitude > 3 && sample.hills < -sample.hillAmplitude * 0.45) return 'valley';

        return sample.upland > 0.5 ? 'upland' : 'lowland';

    }


    // Czy pień jakiegoś drzewa stoi najwyżej `distance` bloków od (x, z).

    treeNear(x, z, distance) {

        let found = false;

        this.forests.forEachTree(x - distance, z - distance, x + distance, z + distance, (tree) => {

            // Duży dąb ma pień 2 x 2 (x..x+1, z..z+1).

            if (tree.x - 1 - distance <= x && x <= tree.x + 1 + distance && tree.z - 1 - distance <= z && z <= tree.z + 1 + distance) {
                found = true;
            }

        });

        return found;

    }


    // Miejsce startu nowego świata: najbliższy suchy, niezbyt stromy
    // ląd na nizinie, nie przy pniu drzewa (szukamy coraz dalej od
    // podanego punktu).

    findSpawn(x0, z0) {

        for (let radius = 0; radius <= 4096; radius += 24) {

            const steps = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / 24);

            for (let i = 0; i < steps; i++) {

                const angle = 2 * Math.PI * i / steps;

                const x = Math.round(x0 + Math.cos(angle) * radius);
                const z = Math.round(z0 + Math.sin(angle) * radius);

                const sample = this.compute(x, z);

                const above = sample.height - SEA_LEVEL;

                if (sample.ocean || sample.water > 0 || sample.river > 0 || above < 2 || above > SHAPE.RELIEF_UPLAND) {
                    continue;
                }

                const flat = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(
                    ([dx, dz]) => Math.abs(this.compute(x + dx, z + dz).height - sample.height) <= 1
                );

                if (flat && !this.treeNear(x, z, 2)) {
                    return { x, z };
                }

            }

        }

        return { x: x0, z: z0 };

    }

}
