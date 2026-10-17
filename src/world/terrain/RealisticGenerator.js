import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    SEA_LEVEL,
    TERRAIN_DIRT_DEPTH
} from '../../config.js';

import { getBlockId, getBlockTypeById, FRUIT_BUSHES, bushStages } from '../../blocks/BlockRegistry.js';

import { Noise, seedToNumber } from '../Noise.js';

import * as SHAPE from './TerrainShape.js';

import { Geology } from './Geology.js';

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
//   5. FORMY SZCZEGÓŁOWE - depresje, wąwozy, żleby, turnie.
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
// (PLANTS w TerrainShape.js).
//
// Woda jest na razie WSTĘPNA (morze bez rzek i jezior) - patrz
// docs/generator-terenu.md, etapy 2-3.
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


// Dokładność liczenia: pełna (chunki), średnia i zgrubna (daleki teren -
// bez szczegółów mniejszych niż odstęp próbek).

export const DETAIL_FULL = 0;
export const DETAIL_MEDIUM = 1;
export const DETAIL_COARSE = 2;


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
            ravines: noise(12),
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
            bushSpecies: noise(23)
        };

        this.plantSeed = Math.imul(base, 0x2545f491) >>> 0;


        this.ids = {
            stone: getBlockId('stone'),
            dirt: getBlockId('dirt'),
            grass: getBlockId('grass'),
            sand: getBlockId('sand'),
            water: getBlockId('water'),
            granite: getBlockId('granite'),
            lepidolite: getBlockId('lepidolite'),
            shortGrass: getBlockId('short_grass'),
            tallGrass: getBlockId('tall_grass'),
            fern: getBlockId('fern'),
            clover: getBlockId('clover'),
            plantain: getBlockId('plantain'),
            nettle: getBlockId('nettle'),
            dandelion: getBlockId('dandelion')
        };

        // Kwiaty w kępach (kolejność = plamy pola gatunków).

        this.flowerIds = ['poppy', 'cornflower', 'chamomile', 'dandelion'].map(getBlockId);

        // Krzaki owocowe: [gatunek][etap] -> ID (etapy: sadzonka, krzak,
        // kilka owoców, pełen owoców).

        this.bushIds = Object.keys(FRUIT_BUSHES).map((species) => bushStages(species).map(getBlockId));


        // Skały pod ziemią (granit, wapień, piaskowiec...).

        this.geology = new Geology(this, base);


        // Kolumny chunka (granice skał) - używane ponownie.

        this.chunkColumns = Array.from(
            { length: CHUNK_SIZE * CHUNK_SIZE },
            () => this.geology.createColumn()
        );

        this.columnBuffer = new Uint8Array(CHUNK_HEIGHT);


        // Wynik ostatniego compute() (używany ponownie, bez tworzenia
        // nowych obiektów dla każdej kolumny).

        this.sample = {};

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
    // detail - DETAIL_FULL / MEDIUM / COARSE (daleki teren).
    // Wynik w `out` (domyślnie wspólny obiekt this.sample):
    //   height  - y najwyższego bloku terenu (bez wody)
    //   ocean   - czy to morze (tu woda sięga do SEA_LEVEL)
    //   oraz wartości pól (do opisu, mapy i powierzchni).

    compute(x, z, detail = DETAIL_FULL, out = this.sample) {

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

        const hills =
            this.field(N.hills, x, z, S.hills, detail === DETAIL_FULL ? 3 : detail === DETAIL_MEDIUM ? 2 : 1) *
            hillAmplitude;

        const hillocks = detail === DETAIL_COARSE
            ? 0
            : this.field(N.bumps, x, z, S.bumps, 2) *
              SHAPE.HILLOCK_HEIGHT * (1 - 0.7 * flatness) * (1 - mountains) * land;


        let height = base + uplandLift + massif + hills + hillocks;


        // Płaskowyże: teren w stopniach - płaskie wierzchy, strome krawędzie.

        if (plateau > 0 && height > 2) {
            height += (terrace(height, SHAPE.PLATEAU_STEP) - height) * plateau;
        }


        // 5. Depresje: suche obniżenia na nizinach blisko (ale nie tuż
        // przy) morzu.

        const depression =
            smoothstep(SHAPE.DEPRESSION_FROM, SHAPE.DEPRESSION_FULL, this.field(N.depressions, x, z, S.depressions, 2)) *
            (1 - upland) * (1 - mountains) *
            smoothstep(-0.10, 0.0, continent) * (1 - smoothstep(0.15, 0.40, continent));

        height += (-SHAPE.DEPRESSION_DEPTH + hillocks * 0.3 - height) * depression;


        // Wąwozy: wąskie rozcięcia wyżyn (też płaskowyżów).

        let ravine = 0;

        if (detail !== DETAIL_COARSE && upland > 0.15) {

            const cut = this.ridged(N.ravines, warpX, warpZ, S.ravines, 1);

            if (cut > SHAPE.RAVINE_EDGE) {

                const t = (cut - SHAPE.RAVINE_EDGE) / (1 - SHAPE.RAVINE_EDGE);

                ravine = SHAPE.RAVINE_DEPTH * Math.sqrt(t) * smoothstep(0.2, 0.6, upland) * (1 - mountains);

            }

        }


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


        height += crag - ravine - gully;


        // Morze tam, gdzie profil kontynentu schodzi pod wodę. Na lądzie
        // teren nie schodzi poniżej morza (poza depresjami) - inaczej przy
        // brzegu woda stałaby "ścianą" obok suchego dołka.

        const ocean = base < 0;

        if (!ocean && depression < 0.05) {
            height = Math.max(height, 0);
        }


        out.height = clamp(SEA_LEVEL + Math.floor(height), 2, CHUNK_HEIGHT - 6);
        out.ocean = ocean;

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
        out.ravine = ravine;
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


    // Rodzaj powierzchni: 'water' (dno morza), 'sand', 'rock', 'grass'.
    // slope - największa różnica wysokości do sąsiedniej kolumny.

    surfaceKind(x, z, sample, slope) {

        const height = sample.height;

        if (sample.ocean && height < SEA_LEVEL) {
            return 'seabed';
        }

        if (height <= SEA_LEVEL + SHAPE.BEACH_HEIGHT && sample.base < 1 && sample.depression < 0.05) {
            return 'sand';
        }

        if (sample.crag > 1.5 || slope >= SHAPE.ROCK_SLOPE || height > this.rockLine(x, z)) {
            return 'rock';
        }

        return 'grass';

    }

    // --------------------------------------------------------
    // CHUNK
    // --------------------------------------------------------

    generateChunk(chunk) {

        const size = CHUNK_SIZE;
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

                const top = this.fillColumn(x, z, sample, kind, this.chunkColumns[k], buffer, lx, lz);

                for (let y = 0; y <= top; y++) {
                    chunk.setId(lx, y, lz, buffer[y]);
                }

            }

        }

    }


    // Bloki jednej kolumny do `out` (od y = 0). Zwraca y najwyższego
    // bloku (terenu albo wody). lx, lz - pozycja w chunku (szum żył
    // z prepareChunk) albo -1 dla pojedynczej kolumny.

    fillColumn(x, z, sample, kind, col, out, lx = -1, lz = -1) {

        const ids = this.ids;
        const geology = this.geology;

        const height = sample.height;


        for (let y = 0; y <= height; y++) {

            const depth = height - y;

            let id;

            if (kind === 'grass' && depth <= TERRAIN_DIRT_DEPTH) {
                id = depth === 0 ? ids.grass : ids.dirt;
            }
            else if ((kind === 'sand' || kind === 'seabed') && depth <= 2) {
                id = ids.sand;
            }
            else {

                id = geology.rockAt(col, y);

                if (id === ids.granite && geology.isLepidolite(x, y, z, depth, lx, lz)) {
                    id = ids.lepidolite;
                }

            }

            out[y] = id;

        }


        // Morze do poziomu morza.

        let top = height;


        // Roślina na trawie.

        if (kind === 'grass' && height + 1 < CHUNK_HEIGHT) {

            const plant = this.plantAt(x, z, sample);

            if (plant !== 0) {

                out[height + 1] = plant;

                top = height + 1;

            }

        }

        if (sample.ocean) {

            for (let y = height + 1; y <= SEA_LEVEL; y++) {
                out[y] = ids.water;
            }

            top = Math.max(top, SEA_LEVEL);

        }

        out.fill(0, top + 1);

        return top;

    }


    // Roślina na trawie w kolumnie (x, z): ID bloku albo 0 (nic nie
    // rośnie). Liczby do strojenia: PLANTS w TerrainShape.js.

    plantAt(x, z, sample) {

        const P = SHAPE.PLANTS;
        const ids = this.ids;

        const roll = hash01(this.plantSeed, x, z, 1);


        // Krzaki owocowe: rzadkie zarośla tam, gdzie pole krzaków
        // > bushThreshold. Gatunek zmienia się wolno (plamy
        // bushSpeciesScale), więc w zaroślach rośnie zwykle jeden.

        const bushes = this.field(this.noise.bushes, x, z, P.bushScale, 2);

        if (bushes > P.bushThreshold) {

            const chance = (bushes - P.bushThreshold) / (1 - P.bushThreshold) * P.bushDensity;

            if (hash01(this.plantSeed, x, z, 5) < chance) {

                const species = this.field(this.noise.bushSpecies, x, z, P.bushSpeciesScale, 1);

                const stages = this.bushIds[clamp(Math.floor((species * 0.5 + 0.5) * this.bushIds.length), 0, this.bushIds.length - 1)];

                // Etap: najczęściej z owocami, czasem bez albo sadzonka.

                const stage = hash01(this.plantSeed, x, z, 6);

                let index = 0;

                while (index < 3 && stage >= P.bushStages[index]) {
                    index++;
                }

                return stages[index];

            }

        }


        // Kępy kwiatów.

        const flowers = this.field(this.noise.flowers, x, z, P.flowerScale, 2);

        if (flowers > P.flowerThreshold) {

            const chance = (flowers - P.flowerThreshold) / (1 - P.flowerThreshold) * P.flowerDensity;

            if (roll < chance) {

                const species = this.field(this.noise.flowerSpecies, x, z, P.flowerSpeciesScale, 1);

                let index = Math.floor((species * 0.5 + 0.5) * this.flowerIds.length);

                // Trochę innych kwiatów w kępie.

                if (hash01(this.plantSeed, x, z, 2) < P.flowerMix) {
                    index += 1 + Math.floor(hash01(this.plantSeed, x, z, 3) * (this.flowerIds.length - 1));
                }

                return this.flowerIds[clamp(index, 0, this.flowerIds.length * 2) % this.flowerIds.length];

            }

        }


        // Paprocie (wilgotno, wyżej więcej) i zioła.

        const humidity = this.field(this.noise.humidity, x, z, SHAPE.SCALES.humidity, 2);

        const uplands = smoothstep(SHAPE.RELIEF_UPLAND * 0.5, SHAPE.RELIEF_UPLAND * 1.5, sample.height - SEA_LEVEL);

        let edge = P.fern * smoothstep(P.fernHumidity, P.fernHumidity + 0.5, humidity) * (0.6 + 0.6 * uplands);

        if (roll < edge) {
            return ids.fern;
        }

        const herbs = [
            [P.clover, ids.clover],
            [P.plantain, ids.plantain],
            [P.nettle * (humidity > 0 ? 1.5 : 0.5), ids.nettle],
            [P.dandelion, ids.dandelion]
        ];

        for (const [chance, id] of herbs) {

            edge += chance;

            if (roll < edge) {
                return id;
            }

        }


        // Trawa: od rzadkiej do gęstej łąki.

        const meadow = smoothstep(-0.5, 0.5, this.field(this.noise.meadows, x, z, P.meadowScale, 2));

        edge += P.grass[0] + (P.grass[1] - P.grass[0]) * meadow;

        if (roll < edge) {

            const tall = P.tallGrass[0] + (P.tallGrass[1] - P.tallGrass[0]) * meadow;

            return hash01(this.plantSeed, x, z, 4) < tall ? ids.tallGrass : ids.shortGrass;

        }

        return 0;

    }


    // Cała kolumna (x, z) dokładnie tak, jak w chunku - bez
    // generowania chunka (mapa przekroju, komenda /skaly).
    // Zwraca { height, kind, top, blocks } (blocks - ID od y = 0).

    columnBlocks(x, z, blocks = new Uint8Array(CHUNK_HEIGHT)) {

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

        if (kind === 'grass') {
            return 'grass';
        }

        if (kind !== 'rock') {
            return 'sand';
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

    farSurface(x, z, spacing) {

        const sample = this.compute(x, z, spacing <= 8 ? DETAIL_MEDIUM : DETAIL_COARSE);

        // Morze: floor - wierzch dna (kula Ziemi z kosmosu - głębia).

        if (sample.ocean && sample.height < SEA_LEVEL) {
            return { top: SEA_LEVEL + 1, kind: 'water', floor: sample.height + 1 };
        }

        const kind = this.surfaceKind(x, z, sample, 0);

        // Goła skała - w kolorze swojego rodzaju (granit, wapień...).

        if (kind === 'rock') {
            return { top: sample.height + 1, kind: this.surfaceRock(x, z, sample, kind) };
        }

        return { top: sample.height + 1, kind };

    }


    // Opis miejsca: wysokość, pas wysokości, forma terenu, pola
    // (komenda /teren, mapa terenu /mapa).
    // slopeHint - nachylenie policzone wcześniej (mapa liczy je sama
    // z siatki wysokości); bez niego liczymy je z sąsiednich kolumn.

    describe(x, z, slopeHint = null) {

        const sample = this.compute(x, z, DETAIL_FULL, {});

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


        return {
            height,
            relief,
            landform: this.classify(sample, slope),
            surface,
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

        if (sample.base < 1 && above <= SHAPE.BEACH_HEIGHT && sample.depression < 0.05) return 'coast';

        if (sample.height < SEA_LEVEL) return 'depression';

        if (sample.crag > 2.5) return 'crag';
        if (sample.gully > 1.2) return 'gully';
        if (sample.ravine > 2) return 'ravine';

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


    // Miejsce startu nowego świata: najbliższy suchy, niezbyt stromy
    // ląd na nizinie (szukamy coraz dalej od podanego punktu).

    findSpawn(x0, z0) {

        for (let radius = 0; radius <= 4096; radius += 24) {

            const steps = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / 24);

            for (let i = 0; i < steps; i++) {

                const angle = 2 * Math.PI * i / steps;

                const x = Math.round(x0 + Math.cos(angle) * radius);
                const z = Math.round(z0 + Math.sin(angle) * radius);

                const sample = this.compute(x, z);

                const above = sample.height - SEA_LEVEL;

                if (sample.ocean || above < 2 || above > SHAPE.RELIEF_UPLAND) {
                    continue;
                }

                const flat = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(
                    ([dx, dz]) => Math.abs(this.compute(x + dx, z + dz).height - sample.height) <= 1
                );

                if (flat) {
                    return { x, z };
                }

            }

        }

        return { x: x0, z: z0 };

    }

}
