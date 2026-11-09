import { CHUNK_SIZE, CHUNK_HEIGHT, SEA_LEVEL } from '../../config.js';

import {
    AIR_ID,
    getBlockId,
    isLeavesId,
    isLiquidId,
    isPlantId,
    isReplaceableId,
    isSoilId,
    canPlantStay,
    getLiquidKindId,
    getAttach
} from '../../blocks/BlockRegistry.js';

import { BASE_TREE_NAMES } from '../../blocks/trees.js';

import { TREE_PACKS } from '../../blocks/treePacks.js';

import { Noise } from '../Noise.js';

import { FORESTS, SCALES, BIOME_SHAPE } from '../terrain/TerrainShape.js';

import { buildTree, TREE_REACH, treeShapeLimits } from './TreeShapes.js';

import { BIOMES, BIOME_KEYS } from '../terrain/Biomes.js';

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
// na trawie i niezbyt stromo - i biom (src/world/terrain/Biomes.js):
// mnożnik gęstości (density) i najmniejsza gęstość (lone, pojedyncze
// drzewa), np. bór rzadszy, na mokradłach i hali pojedyncze drzewa,
// w skałach i na śniegu żadnych. Liczby w FORESTS (TerrainShape.js),
// opis w docs/drzewa.md i docs/biomy.md.
//
// Gatunek: z gatunków biomu (trees w BIOMES - np. buczyna: prawie same
// buki, las liściasty: dęby i lipy) i plam gatunków (w lesie przeważa
// jeden, dwa). Biom sprawdzamy w miejscu drzewa trochę przesuniętym
// (TREE_BIOME_JITTER), więc na granicy biomów drzewa się przeplatają.
//
// Drzewa z paczek (assets/drzewa/, "gdzieRosnie" w drzewo.json): w kratce,
// w której ma stać drzewo, paczka "losuje" swoją szansę (czestosc) -
// jeśli biom (biomy), klimat i wysokość pasują do jej zakresów
// i wypadło, stoi tam drzewo z paczki zamiast zwykłego (olcha i wierzba
// na mokradłach, jabłoń na łąkach).
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


// Liczba z nazwy (każda paczka losuje swoją szansę osobno, niezależnie
// od kolejności na liście).

function nameSalt(name) {

    let h = 0x811c9dc5;

    for (let i = 0; i < name.length; i++) {
        h = Math.imul(h ^ name.charCodeAt(i), 0x01000193);
    }

    return 1000 + ((h >>> 0) % 1000000);

}


// Paczki, które rosną same w lesie (czestosc > 0).

const WILD_PACKS = TREE_PACKS
    .filter((pack) => pack.climate.chance > 0)
    .map((pack) => ({ id: pack.id, climate: pack.climate, salt: nameSalt(pack.id) }));


// Najmniejsza gęstość (pojedyncze drzewa) w którymkolwiek biomie - do
// szybkiego odrzucania kratek bez drzewa: w lasach (FOREST_LONE) i poza
// nimi (OPEN_LONE). Biom lasu jest tylko tam, gdzie pole lasów jest
// wyższe niż FOREST_FIELD (z zapasem na poszarpane granice).

const FOREST_TYPES = ['deciduous', 'beech', 'birch', 'pine', 'spruce'];

const FOREST_LONE = Math.max(...FOREST_TYPES.map((key) => BIOMES[key].lone ?? 0));

const OPEN_LONE = Math.max(...BIOME_KEYS.filter((key) => !FOREST_TYPES.includes(key)).map((key) => BIOMES[key].lone ?? 0));

const FOREST_FIELD = Math.min(BIOME_SHAPE.forestFrom - BIOME_SHAPE.forestHumid, BIOME_SHAPE.alpineForest) - 0.2;

// O ile bloków (najwyżej) przesuwamy miejsce sprawdzania biomu drzewa.

const TREE_BIOME_JITTER = 6;

// Gatunki drzew biomów: [[numer w BASE_TREE_NAMES, udział], ...].

const BIOME_TREES = Object.fromEntries(BIOME_KEYS.map((key) => [
    key,
    Object.entries(BIOMES[key].trees ?? {}).map(([species, share]) => [BASE_TREE_NAMES.indexOf(species), share])
]));


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
        this.descriptorCache = new Map();

        this.sample = {};

        this.neighbor = {};

        this.scores = new Float32Array(BASE_TREE_NAMES.length);

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

    density(x, z, height, climate, forest = this.forestField(x, z), biome = null) {

        let density =
            FORESTS.lone +
            (FORESTS.dense - FORESTS.lone) * smoothstep(FORESTS.from, FORESTS.full, forest);

        density *= FORESTS.dry + (FORESTS.wet - FORESTS.dry) * smoothstep(-0.7, 0.3, climate.humidity);


        // Granica lasu pod gołą skałą.

        const line = this.generator.rockLine(x, z) - FORESTS.treeLine;

        density *= 1 - smoothstep(line - FORESTS.treeLineFade, line, height);


        // Biom: mnożnik i pojedyncze drzewa (bez drzew - 0).

        if (biome) {

            const def = BIOMES[biome];

            density = !def.density ? 0 : Math.max(def.lone ?? 0, density * def.density);

        }

        return clamp(density, 0, 1);

    }


    // Gatunek drzewa w biomie: udziały gatunków biomu zmienione przez
    // plamy gatunków (w lesie przeważa jeden, dwa). pick - liczba 0-1
    // (losowanie drzewa) albo null: gatunek, który tu przeważa.

    biomeSpecies(x, z, biome, pick = null) {

        const trees = BIOME_TREES[biome];

        if (!trees || trees.length === 0) {
            return null;
        }

        const s = this.scores;

        let total = 0;
        let best = trees[0][0];
        let bestWeight = -1;

        for (const [index, share] of trees) {

            const patch = this.generator.field(this.noise.species, x + index * 1733, z - index * 911, FORESTS.speciesScale, 1);

            const weight = share * Math.max(0.05, 1 + FORESTS.patches * patch);

            s[index] = weight;

            total += weight;

            if (weight > bestWeight) {
                bestWeight = weight;
                best = index;
            }

        }

        if (pick === null) {
            return BASE_TREE_NAMES[best];
        }

        let left = pick * total;

        for (const [index] of trees) {

            left -= s[index];

            if (left < 0) {
                return BASE_TREE_NAMES[index];
            }

        }

        return BASE_TREE_NAMES[trees[trees.length - 1][0]];

    }


    // Gatunek z paczki w kratce (gx, gz) albo null. climate - klimat
    // w miejscu drzewa ({ temperature, humidity, above }).

    packSpecies(gx, gz, climate, biome = null) {

        for (const pack of WILD_PACKS) {

            const { chance, temperature, humidity, height, biomes } = pack.climate;

            if (biomes && !biomes.has(biome)) {
                continue;
            }

            if (
                climate.temperature < temperature[0] || climate.temperature > temperature[1] ||
                climate.humidity < humidity[0] || climate.humidity > humidity[1] ||
                climate.above < height[0] || climate.above > height[1]
            ) {
                continue;
            }

            if (random01(this.seed, gx, gz, pack.salt) < chance) {
                return pack.id;
            }

        }

        return null;

    }


    // Las w kolumnie (mapa, opis miejsca, daleki teren):
    // { density, species } - species: gatunek, który tu przeważa.

    forestAt(x, z, sample) {

        const climate = this.climate(x, z, sample.height);

        const biome = this.generator.biomes.classify(x, z, sample);

        const density = this.density(x, z, sample.height, climate, this.forestField(x, z), biome);

        return {
            density,
            species: density > 0 ? this.biomeSpecies(x, z, biome) : null,
            biome
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


    // Distant silhouettes share placement with actual trees without retaining
    // their thousands of voxel cells in every horizon worker.
    descriptorAt(gx, gz) {
        const key = `${gx},${gz}`;
        if (this.descriptorCache.has(key)) return this.descriptorCache.get(key);
        const tree = this.findTree(gx, gz, false);
        if (this.descriptorCache.size >= CACHE_SIZE) this.descriptorCache.clear();
        this.descriptorCache.set(key, tree);
        return tree;
    }

    findTree(gx, gz, withShape = true) {

        const G = FORESTS.grid;

        const seed = this.seed;

        const x = gx * G + Math.floor(random01(seed, gx, gz, 1) * G);
        const z = gz * G + Math.floor(random01(seed, gx, gz, 2) * G);

        const roll = random01(seed, gx, gz, 3);


        // Najpierw szybko: na łące (mała gęstość z samego pola lasów)
        // nie trzeba liczyć terenu.

        const forest = this.forestField(x, z);

        const upper = FORESTS.lone + (FORESTS.dense - FORESTS.lone) * smoothstep(FORESTS.from, FORESTS.full, forest);

        if (roll >= Math.max(upper, forest > FOREST_FIELD ? FOREST_LONE : OPEN_LONE) * FORESTS.wet) {
            return null;
        }


        const generator = this.generator;

        const sample = generator.compute(x, z, 0, this.sample);

        const height = sample.height;

        // Nie w wodzie i nie na samym brzegu rzeki.

        if (sample.ocean || sample.water > height || sample.riverGap < 2 || height + 1 + 6 >= CHUNK_HEIGHT) {
            return null;
        }

        const climate = this.climate(x, z, height);

        // Biom drzewa (miejsce trochę przesunięte - na granicy biomów
        // drzewa się przeplatają).

        const biome = generator.biomes.classify(
            x, z, sample,
            (random01(seed, gx, gz, 6) - 0.5) * 2 * TREE_BIOME_JITTER,
            (random01(seed, gx, gz, 7) - 0.5) * 2 * TREE_BIOME_JITTER
        );

        if (roll >= this.density(x, z, height, climate, forest, biome)) {
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


        const species = this.packSpecies(gx, gz, climate, biome) ?? this.biomeSpecies(x, z, biome, random01(seed, gx, gz, 10));

        if (!species) {
            return null;
        }

        const treeSeed = hash01(seed, gx, gz, 4);

        const size = 0.15 + 0.85 * random01(seed, gx, gz, 5);

        // Only trees near the world ceiling need their exact shape to retain
        // the original placement rejection. Everywhere else the known bound
        // proves that a descriptor and a real tree make the same decision.
        const shape = withShape || height + 1 + treeShapeLimits(species).maxHeight >= CHUNK_HEIGHT
            ? buildTree(species, treeSeed, size) : null;

        if (shape && height + 1 + shape.top >= CHUNK_HEIGHT) {
            return null;
        }

        return { x, y: height + 1, z, species, seed: treeSeed, size, shape: withShape ? shape : null };

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

                const reach = treeShapeLimits(tree.species).reach;
                if (tree.x + reach < x0 || tree.x - reach > x1 || tree.z + reach < z0 || tree.z - reach > z1) {
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

    return !isLiquidId(id) && (
        id === AIR_ID ||
        isPlantId(id) ||
        isReplaceableId(id) ||
        getAttach(id) !== 0 ||
        (log && isLeavesId(id))
    );

}


// Generacja omija World.setBlock. Zachowujemy więc tę samą zasadę:
// liść/gałąź nad taflą usuwa zakrytą roślinę, ale zostawia jej wodę.
// Dotyczy też wysokich roślin lądowych potrzebujących miejsca nad sobą.
function setTreeBlock(chunk, lx, y, lz, id) {

    chunk.setId(lx, y, lz, id);
    if (y < 1) return;
    const below = chunk.getId(lx, y - 1, lz);
    if (isPlantId(below) && !canPlantStay(below, chunk.getId(lx, y - 2, lz), id)) {
        chunk.setId(lx, y - 1, lz, getLiquidKindId(below));
    }

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
            setTreeBlock(chunk, lx, y, lz, id);
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

            setTreeBlock(chunk, lx, y, lz, log);

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

            if (isLiquidId(below)) break;

            if (below === AIR_ID || isPlantId(below) || isLeavesId(below)) {
                continue;
            }

            const here = chunk.getId(lx, y, lz);

            if (isSoilId(below) && !isLiquidId(here) && (here === AIR_ID || isReplaceableId(here) || isPlantId(here))) {
                setTreeBlock(chunk, lx, y, lz, litter);
            }

            break;

        }

    }

}
