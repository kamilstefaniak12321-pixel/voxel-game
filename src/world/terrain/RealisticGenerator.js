import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    SEA_LEVEL,
    TERRAIN_DIRT_DEPTH,
    LEPIDOLITE_VEIN_SCALE,
    LEPIDOLITE_VEIN_THRESHOLD
} from '../../config.js';

import { getBlockId } from '../../blocks/BlockRegistry.js';

import { Noise, seedToNumber } from '../Noise.js';

import * as SHAPE from './TerrainShape.js';

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
// Woda jest na razie WSTĘPNA (morze bez rzek i jezior) - patrz
// docs/generator-terenu.md, etapy 2-3.
// ------------------------------------------------------------

// Wartości szumu z kilku oktaw mieszczą się w wąskim zakresie -
// mnożymy je, żeby pola miały mniej więcej zakres -1..1.

const GAINS = [0, 1.6, 2.0, 2.3, 2.5];


function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

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


// Żyły lepidolitu: szum 3D liczymy w punktach co VEIN_STEP bloków,
// a między nimi bierzemy średnią z sąsiednich punktów - 8 razy mniej
// liczenia szumu niż w każdym bloku (w wysokich górach to większość
// czasu generowania chunka), a żyły wyglądają prawie tak samo.

const VEIN_STEP = 2;
const VEIN_GRID = CHUNK_SIZE / VEIN_STEP + 1;
const VEIN_LAYER = VEIN_GRID * VEIN_GRID;

// Średnia z punktów jest trochę łagodniejsza niż sam szum - z progiem
// niższym o 0.04 lepidolitu jest tyle samo co w klasycznym terenie.

const VEIN_THRESHOLD = LEPIDOLITE_VEIN_THRESHOLD - 0.04;

// Wartość szumu żył w bloku (lx, y, lz) chunka - z siatki veinGrid,
// liniowo między punktami (przy VEIN_STEP 2: punkt albo średnia).

function veinAt(grid, lx, y, lz) {

    const tx = (lx % VEIN_STEP) / VEIN_STEP;
    const ty = (y % VEIN_STEP) / VEIN_STEP;
    const tz = (lz % VEIN_STEP) / VEIN_STEP;

    const i = (Math.floor(y / VEIN_STEP) * VEIN_GRID + Math.floor(lz / VEIN_STEP)) * VEIN_GRID +
        Math.floor(lx / VEIN_STEP);

    const lerp = (a, b, t) => a + (b - a) * t;

    const bottom = lerp(
        lerp(grid[i], grid[i + 1], tx),
        lerp(grid[i + VEIN_GRID], grid[i + VEIN_GRID + 1], tx),
        tz
    );

    const j = i + VEIN_LAYER;

    const upper = lerp(
        lerp(grid[j], grid[j + 1], tx),
        lerp(grid[j + VEIN_GRID], grid[j + VEIN_GRID + 1], tx),
        tz
    );

    return lerp(bottom, upper, ty);

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
            ravines: noise(12),
            gullies: noise(13),
            crags: noise(14),
            depressions: noise(15),
            temperature: noise(16),
            humidity: noise(17),
            rockLine: noise(18),
            veins: noise(19)
        };


        this.ids = {
            stone: getBlockId('stone'),
            dirt: getBlockId('dirt'),
            grass: getBlockId('grass'),
            sand: getBlockId('sand'),
            water: getBlockId('water'),
            lepidolite: getBlockId('lepidolite')
        };


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

        const ids = this.ids;


        // Wysokości z ramką jednej kolumny (do nachylenia zboczy).

        const W = size + 2;

        const heights = new Int16Array(W * W);

        const columns = [];

        for (let j = 0; j < W; j++) {

            for (let i = 0; i < W; i++) {

                const inside = i > 0 && j > 0 && i <= size && j <= size;

                const sample = this.compute(baseX + i - 1, baseZ + j - 1, DETAIL_FULL, inside ? {} : this.sample);

                heights[j * W + i] = sample.height;

                if (inside) {
                    columns.push(sample);
                }

            }

        }


        let top = 0;

        for (const sample of columns) {
            top = Math.max(top, sample.height);
        }

        const veins = this.veinGrid(baseX, baseZ, top);


        let column = 0;

        for (let lz = 0; lz < size; lz++) {

            for (let lx = 0; lx < size; lx++) {

                const sample = columns[column++];

                const x = baseX + lx;
                const z = baseZ + lz;

                const k = (lz + 1) * W + (lx + 1);

                const height = heights[k];

                const slope = Math.max(
                    Math.abs(height - heights[k - 1]),
                    Math.abs(height - heights[k + 1]),
                    Math.abs(height - heights[k - W]),
                    Math.abs(height - heights[k + W])
                );

                const kind = this.surfaceKind(x, z, sample, slope);


                for (let y = 0; y <= height; y++) {

                    const depth = height - y;

                    let id = ids.stone;

                    if (kind === 'grass') {
                        id = depth === 0 ? ids.grass : depth <= TERRAIN_DIRT_DEPTH ? ids.dirt : ids.stone;
                    }
                    else if (kind === 'sand' || kind === 'seabed') {
                        id = depth <= 2 ? ids.sand : ids.stone;
                    }


                    if (
                        id === ids.stone &&
                        veinAt(veins, lx, y, lz) > VEIN_THRESHOLD
                    ) {
                        id = ids.lepidolite;
                    }

                    chunk.setId(lx, y, lz, id);

                }


                // Morze do poziomu morza.

                if (sample.ocean) {

                    for (let y = height + 1; y <= SEA_LEVEL; y++) {
                        chunk.setId(lx, y, lz, ids.water);
                    }

                }

            }

        }

    }

    // Szum żył w punktach siatki co VEIN_STEP bloków, od y = 0 do
    // jednego punktu nad `top` (najwyższym blokiem chunka).

    veinGrid(baseX, baseZ, top) {

        const layers = Math.floor(top / VEIN_STEP) + 2;

        const grid = this.veinBuffer ??= new Float32Array(
            VEIN_LAYER * (Math.floor(CHUNK_HEIGHT / VEIN_STEP) + 2)
        );

        const scale = LEPIDOLITE_VEIN_SCALE;

        let i = 0;

        for (let gy = 0; gy < layers; gy++) {

            for (let gz = 0; gz < VEIN_GRID; gz++) {

                for (let gx = 0; gx < VEIN_GRID; gx++) {

                    grid[i++] = this.noise.veins.noise3D(
                        (baseX + gx * VEIN_STEP) / scale,
                        gy * VEIN_STEP / scale,
                        (baseZ + gz * VEIN_STEP) / scale
                    );

                }

            }

        }

        return grid;

    }

    // --------------------------------------------------------
    // Wspólny interfejs generatorów (generators.js)
    // --------------------------------------------------------

    // Powierzchnia dla dalekiego terenu (spacing = odstęp próbek).

    farSurface(x, z, spacing) {

        const sample = this.compute(x, z, spacing <= 8 ? DETAIL_MEDIUM : DETAIL_COARSE);

        if (sample.ocean && sample.height < SEA_LEVEL) {
            return { top: SEA_LEVEL + 1, kind: 'water' };
        }

        const kind = this.surfaceKind(x, z, sample, 0);

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


        return {
            height,
            relief,
            landform: this.classify(sample, slope),
            surface: this.surfaceKind(x, z, sample, Math.round(slope * 2)),
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
