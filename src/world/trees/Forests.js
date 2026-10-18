import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../../config.js';

import {
    AIR_ID,
    getBlockId,
    isLeavesId,
    isPlantId,
    isReplaceableId,
    isSoilId,
    getAttach
} from '../../blocks/BlockRegistry.js';

import { TREE_NAMES } from '../../blocks/trees.js';

import { Noise } from '../Noise.js';

import { FORESTS, SCALES } from '../terrain/TerrainShape.js';

import { buildTree, TREE_REACH } from './TreeShapes.js';

// ------------------------------------------------------------
// LASY - gdzie w terenie realistycznym rosną drzewa i jakie
//
// Drzewa stoją na siatce (FORESTS.grid bloków): w każdej kratce
// najwyżej jedno, w losowym miejscu kratki. Czy jest i jakiego
// gatunku - zależy tylko od seeda i pozycji kratki, więc każdy chunk
// wie, jakie drzewa rosną obok niego, i wstawia u siebie ich kawałki
// (korona drzewa z sąsiedniego chunka wchodzi do tego). Dlatego
// drzewo na granicy chunków zawsze pasuje po obu stronach.
//
// Gęstość lasu: pole lasów (łąki ↔ lasy), wilgotność (w suchym
// klimacie rzadziej), wysokość (granica lasu pod gołą skałą), tylko
// na trawie i niezbyt stromo. Gatunek: klimat i plamy gatunków -
// liczby w FORESTS (TerrainShape.js), opis w docs/drzewa.md:
//
//   świerk  - zimno: wysoko w górach i w chłodnym klimacie,
//   sosna   - sucho (bory), także nad samym morzem,
//   buk     - wyżyny i pogórza, umiarkowanie wilgotno,
//   lipa    - ciepło i wilgotno, niziny i wyżyny (z dębem),
//   dąb     - ciepłe niziny,
//   brzoza  - wilgotno i nisko (blisko wody), chłodniej.
// ------------------------------------------------------------

function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

}


function smoothstep(edge0, edge1, value) {

    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);

}


function hash01(seed, x, z, salt) {

    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) | 0;

    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;

    return h >>> 0;

}


function random01(seed, x, z, salt) {

    return hash01(seed, x, z, salt) / 4294967296;

}


// Ile kratek (drzew) najwyżej pamiętamy - sąsiednie chunki pytają
// o te same drzewa, więc nie liczymy ich kilka razy.

const CACHE_SIZE = 8192;


export class Forests {

    constructor(generator, base) {

        this.generator = generator;

        this.seed = Math.imul(base ^ 0x5f3759df, 0x2c1b3c6d) >>> 0;

        // Odstęp siatki drzew (bloki).
        this.grid = FORESTS.grid;

        this.noise = {
            forest: new Noise((base + Math.imul(30, 0x9e3779b1)) >>> 0),
            species: new Noise((base + Math.imul(31, 0x9e3779b1)) >>> 0)
        };

        this.cache = new Map();

        this.sample = {};

        this.neighbor = {};

        this.scores = new Float32Array(TREE_NAMES.length);

        this.ids = new Map();

    }


    idOf(type) {

        let id = this.ids.get(type);

        if (id === undefined) {

            id = getBlockId(type);

            this.ids.set(type, id);

        }

        return id;

    }

    // --------------------------------------------------------
    // POLA
    // --------------------------------------------------------

    // Pole lasów -1..1 (łąki ↔ lasy).

    forestField(x, z) {

        return this.generator.field(this.noise.forest, x, z, FORESTS.scale, 2);

    }


    // Klimat w kolumnie: { temperature, humidity, above }.

    climate(x, z, height) {

        const N = this.generator.noise;

        const above = height - SEA_LEVEL;

        return {
            temperature: this.generator.field(N.temperature, x, z, SCALES.temperature, 2) - Math.max(0, above) / 60,
            humidity: this.generator.field(N.humidity, x, z, SCALES.humidity, 2),
            above
        };

    }


    // Gęstość lasu 0-1 (jaka część kratek ma drzewo) w kolumnie
    // o wysokości `height` i klimacie `climate`.

    density(x, z, height, climate, forest = this.forestField(x, z)) {

        let density =
            FORESTS.lone +
            (FORESTS.dense - FORESTS.lone) * smoothstep(FORESTS.from, FORESTS.full, forest);

        density *= FORESTS.dry + (FORESTS.wet - FORESTS.dry) * smoothstep(-0.7, 0.3, climate.humidity);


        // Granica lasu pod gołą skałą.

        const line = this.generator.rockLine(x, z) - FORESTS.treeLine;

        density *= 1 - smoothstep(line - FORESTS.treeLineFade, line, height);

        return clamp(density, 0, 1);

    }


    // Oceny gatunków (kolejność TREE_NAMES) - większa = lepiej mu tu.
    // jitter - losowy dodatek dla pojedynczego drzewa (0 = sam klimat).

    speciesScores(x, z, climate, jitter = null) {

        const { temperature: t, humidity: h, above } = climate;

        const s = this.scores;

        s[0] = 1.1 * smoothstep(-0.35, -0.8, t) + 0.9 * smoothstep(20, 36, above) + 0.15 * h;
        s[1] = 0.25 + 0.95 * smoothstep(-0.15, -0.55, h) + 0.3 * smoothstep(4, 1, above) - 0.3 * smoothstep(-0.5, -0.9, t);
        s[2] = 0.45 + 0.55 * smoothstep(4, 14, above) * smoothstep(-0.3, 0.2, h) - 0.6 * smoothstep(-0.45, -0.8, t) - 0.4 * smoothstep(28, 40, above);
        s[3] = 0.36 + 0.7 * smoothstep(-0.25, 0.2, t) * smoothstep(-0.25, 0.3, h) - 0.3 * smoothstep(14, 26, above);
        s[4] = 0.42 + 0.55 * smoothstep(-0.3, 0.3, t) + 0.25 * smoothstep(14, 4, above) - 0.35 * smoothstep(0.1, 0.6, h);
        s[5] = 0.25 + 0.45 * smoothstep(0, 0.5, h) + 0.45 * smoothstep(6, 1, above) - 0.4 * smoothstep(0, 0.45, t);


        // Plamy gatunków: w lesie przeważa jeden, dwa.

        for (let i = 0; i < s.length; i++) {

            s[i] += 0.45 * this.generator.field(this.noise.species, x + i * 1733, z - i * 911, FORESTS.speciesScale, 1);

            if (jitter) {
                s[i] += (jitter(i) - 0.5) * FORESTS.mix;
            }

        }

        return s;

    }


    // Gatunek z najlepszą oceną.

    bestSpecies(scores) {

        let best = 0;

        for (let i = 1; i < scores.length; i++) {

            if (scores[i] > scores[best]) {
                best = i;
            }

        }

        return TREE_NAMES[best];

    }


    // Las w kolumnie (mapa, opis miejsca, daleki teren):
    // { density, species } - species: gatunek, który tu przeważa.

    forestAt(x, z, sample) {

        const climate = this.climate(x, z, sample.height);

        const density = this.density(x, z, sample.height, climate);

        return {
            density,
            species: this.bestSpecies(this.speciesScores(x, z, climate))
        };

    }

    // --------------------------------------------------------
    // DRZEWA
    // --------------------------------------------------------

    // Drzewo w kratce (gx, gz) siatki albo null:
    // { x, y, z, species, seed, size, shape } - (x, y, z) to podstawa
    // pnia (pierwszy blok nad ziemią).

    treeAt(gx, gz) {

        const key = (gx + 32768) * 65536 + (gz + 32768);

        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        const tree = this.findTree(gx, gz);

        if (this.cache.size >= CACHE_SIZE) {
            this.cache.clear();
        }

        this.cache.set(key, tree);

        return tree;

    }


    findTree(gx, gz) {

        const G = FORESTS.grid;

        const seed = this.seed;

        const x = gx * G + Math.floor(random01(seed, gx, gz, 1) * G);
        const z = gz * G + Math.floor(random01(seed, gx, gz, 2) * G);

        const roll = random01(seed, gx, gz, 3);


        // Najpierw szybko: na łące (mała gęstość z samego pola lasów)
        // nie trzeba liczyć terenu.

        const forest = this.forestField(x, z);

        const upper = FORESTS.lone + (FORESTS.dense - FORESTS.lone) * smoothstep(FORESTS.from, FORESTS.full, forest);

        if (roll >= upper * FORESTS.wet) {
            return null;
        }


        const generator = this.generator;

        const sample = generator.compute(x, z, 0, this.sample);

        const height = sample.height;

        if (sample.ocean || height + 1 + 6 >= CHUNK_HEIGHT) {
            return null;
        }

        const climate = this.climate(x, z, height);

        if (roll >= this.density(x, z, height, climate, forest)) {
            return null;
        }


        // Nachylenie (z czterech sąsiednich kolumn) i rodzaj powierzchni -
        // drzewo tylko na trawie i niezbyt stromo.

        let slope = 0;

        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {

            slope = Math.max(slope, Math.abs(height - generator.compute(x + dx, z + dz, 0, this.neighbor).height));

            if (slope > FORESTS.maxSlope) {
                return null;
            }

        }

        if (generator.surfaceKind(x, z, sample, slope) !== 'grass') {
            return null;
        }


        const species = this.bestSpecies(
            this.speciesScores(x, z, climate, (i) => random01(seed, gx, gz, 10 + i))
        );

        const treeSeed = hash01(seed, gx, gz, 4);

        const size = 0.15 + 0.85 * random01(seed, gx, gz, 5);

        const shape = buildTree(species, treeSeed, size);

        if (height + 1 + shape.top >= CHUNK_HEIGHT) {
            return null;
        }

        return { x, y: height + 1, z, species, seed: treeSeed, size, shape };

    }


    // Wszystkie drzewa, których bloki mogą wejść do prostokąta
    // [x0, x1] x [z0, z1] (callback(tree) dla każdego, zawsze w tej
    // samej kolejności).

    forEachTree(x0, z0, x1, z1, callback) {

        const G = FORESTS.grid;

        const R = TREE_REACH;

        for (let gz = Math.floor((z0 - R) / G); gz <= Math.floor((z1 + R) / G); gz++) {

            for (let gx = Math.floor((x0 - R) / G); gx <= Math.floor((x1 + R) / G); gx++) {

                const tree = this.treeAt(gx, gz);

                if (!tree) {
                    continue;
                }

                if (tree.x + R < x0 || tree.x - R > x1 || tree.z + R < z0 || tree.z - R > z1) {
                    continue;
                }

                callback(tree);

            }

        }

    }


    // Wstawia do świeżo wygenerowanego chunka jego kawałki wszystkich
    // drzew dookoła.

    placeTrees(chunk) {

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;

        this.forEachTree(baseX, baseZ, baseX + CHUNK_SIZE - 1, baseZ + CHUNK_SIZE - 1, (tree) => {
            placeTree(chunk, baseX, baseZ, tree, (type) => this.idOf(type));
        });

    }

}

// ------------------------------------------------------------
// Wstawianie drzewa do chunka (tylko bloki w tym chunku).
//
// Zasady (takie same w każdym chunku, więc kawałki do siebie pasują):
//   - pień wchodzi w powietrze, rośliny, liście (także innego drzewa)
//     i opadłe liście; terenu (ziemi, skały) nie przebija,
//   - liście tylko w powietrze i rośliny,
//   - pień przy ziemi schodzi w dół do gruntu (stok, nabiegi),
//   - opadłe liście kładą się na trawie (najbliższej ziemi pod tym
//     miejscem, do 4 bloków niżej albo 2 wyżej niż podstawa pnia).
// ------------------------------------------------------------

export function canReplace(id, log) {

    return (
        id === AIR_ID ||
        isPlantId(id) ||
        isReplaceableId(id) ||
        getAttach(id) !== 0 ||
        (log && isLeavesId(id))
    );

}


export function placeTree(chunk, baseX, baseZ, tree, idOf) {

    const { shape } = tree;

    const S = CHUNK_SIZE;


    for (const [dx, dy, dz, type] of shape.blocks) {

        const lx = tree.x + dx - baseX;
        const lz = tree.z + dz - baseZ;

        if (lx < 0 || lx >= S || lz < 0 || lz >= S) {
            continue;
        }

        const y = tree.y + dy;

        if (y < 0 || y >= CHUNK_HEIGHT) {
            continue;
        }

        const id = idOf(type);

        if (canReplace(chunk.getId(lx, y, lz), !isLeavesId(id))) {
            chunk.setId(lx, y, lz, id);
        }

    }


    // Pień schodzi do gruntu.

    for (const [dx, dz, type] of shape.roots) {

        const lx = tree.x + dx - baseX;
        const lz = tree.z + dz - baseZ;

        if (lx < 0 || lx >= S || lz < 0 || lz >= S) {
            continue;
        }

        const log = idOf(type);

        if (chunk.getId(lx, tree.y, lz) !== log) {
            continue;
        }

        for (let y = tree.y - 1, depth = 0; y >= 0 && depth < 4; y--, depth++) {

            if (!canReplace(chunk.getId(lx, y, lz), true)) {
                break;
            }

            chunk.setId(lx, y, lz, log);

        }

    }


    // Opadłe liście.

    const litter = shape.litter.length > 0 ? idOf(`${tree.species}_leaf_litter`) : AIR_ID;

    for (const [dx, dz] of shape.litter) {

        const lx = tree.x + dx - baseX;
        const lz = tree.z + dz - baseZ;

        if (lx < 0 || lx >= S || lz < 0 || lz >= S) {
            continue;
        }

        for (let y = tree.y + 2; y >= Math.max(1, tree.y - 4); y--) {

            const below = chunk.getId(lx, y - 1, lz);

            if (below === AIR_ID || isPlantId(below) || isLeavesId(below)) {
                continue;
            }

            const here = chunk.getId(lx, y, lz);

            if (isSoilId(below) && (here === AIR_ID || isReplaceableId(here) || isPlantId(here))) {
                chunk.setId(lx, y, lz, litter);
            }

            break;

        }

    }

}
