// ------------------------------------------------------------
// KRZEWY JAGODOWE W ŚWIECIE (1.17.0)
//
// Dzikie krzewy stoją w kratkach siatki (SHRUB_GRID bloków): w każdej
// kratce ziarno świata losuje miejsce i to, czy coś tam rośnie. Tak jak
// drzewa (trees/Forests.js) krzew nie zapisuje się nigdzie - każdy chunk
// wylicza go od nowa i wstawia swój kawałek, więc kawałki pasują do siebie.
//
// Gdzie rosną: pole habitat gatunku (blocks/shrubs.js) - waga w biomie.
// Krzewy trzymają się kęp: pole "zarośli" (gładki szum) mówi, gdzie jest
// gęsto, a w jednej kępie rośnie zwykle jeden gatunek i jedna odmiana.
//
// Wstawianie (stampShrub - to samo w generatorze i przy sadzonce):
//   - liście wchodzą tylko w powietrze i drobne rośliny,
//   - krzew bez pnia układa się na gruncie kolumna po kolumnie (stok),
//   - krzew z pniem stoi sztywno, a pnie schodzą do ziemi.
// ------------------------------------------------------------

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config.js';
import { getBlockId, isLeavesId, isLiquidId } from '../../blocks/BlockRegistry.js';
import { SHRUBS, SHRUB_NAMES } from '../../blocks/shrubs.js';
import { buildShrub, SHRUB_REACH } from './ShrubShapes.js';
import { canReplace } from '../trees/Forests.js';

// Odstęp siatki krzewów (bloki), wielkość kępy jednego gatunku i pola
// zarośli (bloki).
export const SHRUB_GRID = 7;
export const SHRUB_PATCH = 22;
export const SHRUB_FIELD = 46;

// Szansa na krzew w kratce przy sumie wag biomu 1, w środku zarośli.
export const SHRUB_DENSITY = 0.08;

// Od jakiej wartości pola zarośli (0-1) krzewy w ogóle rosną i od jakiej
// rosną najgęściej.
export const SHRUB_THICKET = [0.5, 0.8];

// Największa różnica wysokości sąsiednich kolumn pod środkiem krzewu.
const MAX_SLOPE = 2;

const CACHE_SIZE = 4096;

function hash01(seed, x, z, salt) {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(salt + 1, 0x9e3779b1) ^ seed;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

// Gładki szum 0-1 o oczku `cell` bloków.
function field(seed, x, z, cell, salt) {
    const fx = x / cell, fz = z / cell;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = smooth(fx - x0), tz = smooth(fz - z0);
    const a = hash01(seed, x0, z0, salt), b = hash01(seed, x0 + 1, z0, salt);
    const c = hash01(seed, x0, z0 + 1, salt), d = hash01(seed, x0 + 1, z0 + 1, salt);
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

// Suma wag gatunków w biomie i lista [gatunek, waga] (raz na biom).
const BIOME_SHRUBS = new Map();

export function biomeShrubs(biome) {
    let entry = BIOME_SHRUBS.get(biome);
    if (!entry) {
        const list = SHRUB_NAMES.map((name) => [name, SHRUBS[name].habitat?.[biome] ?? 0]).filter(([, weight]) => weight > 0);
        entry = { list, total: list.reduce((sum, [, weight]) => sum + weight, 0) };
        BIOME_SHRUBS.set(biome, entry);
    }
    return entry;
}


export class Shrubs {

    // generator - RealisticGenerator (compute, biomes.classify, surfaceKind).

    constructor(generator, base) {
        this.generator = generator;
        this.seed = Math.imul(base ^ 0x3c6ef372, 0x85ebca6b) >>> 0;
        this.cache = new Map();
        this.sample = {};
        this.neighbor = {};
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

    shrubAt(gx, gz) {
        const key = (gx + 32768) * 65536 + (gz + 32768);
        if (this.cache.has(key)) return this.cache.get(key);
        const shrub = this.findShrub(gx, gz);
        if (this.cache.size >= CACHE_SIZE) this.cache.clear();
        this.cache.set(key, shrub);
        return shrub;
    }

    // Krzew kratki (gx, gz) albo null: { x, y, z, species, variety, seed,
    // size, shape }.
    findShrub(gx, gz) {

        const G = SHRUB_GRID, seed = this.seed;
        const x = gx * G + Math.floor(hash01(seed, gx, gz, 1) * G);
        const z = gz * G + Math.floor(hash01(seed, gx, gz, 2) * G);

        // Najpierw tanio: poza zaroślami nie liczymy terenu.
        const thicket = field(seed, x, z, SHRUB_FIELD, 3);
        if (thicket <= SHRUB_THICKET[0]) return null;
        const dense = smooth(Math.min(1, (thicket - SHRUB_THICKET[0]) / (SHRUB_THICKET[1] - SHRUB_THICKET[0])));
        const roll = hash01(seed, gx, gz, 4);
        if (roll >= dense * SHRUB_DENSITY * 4) return null;

        const generator = this.generator;
        const sample = generator.compute(x, z, 0, this.sample);
        const height = sample.height;

        if (sample.ocean || sample.water > height || sample.riverGap < 1 || height + 2 + 8 >= CHUNK_HEIGHT) return null;

        const biome = generator.biomes.classify(x, z, sample);
        const { list, total } = biomeShrubs(biome);
        if (total <= 0 || roll >= dense * SHRUB_DENSITY * Math.min(4, total)) return null;

        let slope = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            slope = Math.max(slope, Math.abs(height - generator.compute(x + dx, z + dz, 0, this.neighbor).height));
            if (slope > MAX_SLOPE) return null;
        }

        // Gatunek: zwykle ten sam w całej kępie (SHRUB_PATCH), czasem inny.
        const px = Math.floor(x / SHRUB_PATCH), pz = Math.floor(z / SHRUB_PATCH);
        const own = hash01(seed, gx, gz, 5) < 0.3;
        let pick = (own ? hash01(seed, gx, gz, 6) : hash01(seed, px, pz, 7)) * total;
        let species = list[list.length - 1][0];
        for (const [name, weight] of list) {
            if (pick < weight) { species = name; break; }
            pick -= weight;
        }

        const definition = SHRUBS[species];
        const ground = generator.surfaceKind(x, z, sample, slope);
        if (!(definition.ground ?? ['grass']).includes(ground)) return null;

        const variety = Math.floor(hash01(seed, px, pz, 8) * definition.varieties.length);
        const shrubSeed = (hash01(seed, gx, gz, 9) * 4294967296) >>> 0;
        const size = hash01(seed, gx, gz, 10) ** 0.8;

        return { x, y: height + 1, z, species, variety, seed: shrubSeed, size, shape: buildShrub(species, variety, shrubSeed, size) };

    }

    forEachShrub(x0, z0, x1, z1, callback) {
        const G = SHRUB_GRID, R = SHRUB_REACH;
        for (let gz = Math.floor((z0 - R) / G); gz <= Math.floor((z1 + R) / G); gz++) {
            for (let gx = Math.floor((x0 - R) / G); gx <= Math.floor((x1 + R) / G); gx++) {
                const shrub = this.shrubAt(gx, gz);
                if (!shrub) continue;
                const reach = shrub.shape.reach;
                if (shrub.x + reach < x0 || shrub.x - reach > x1 || shrub.z + reach < z0 || shrub.z - reach > z1) continue;
                callback(shrub);
            }
        }
    }

    // Wstawia do świeżo wygenerowanego chunka jego kawałki krzewów.
    placeShrubs(chunk) {
        const baseX = chunk.cx * CHUNK_SIZE, baseZ = chunk.cz * CHUNK_SIZE;
        const S = CHUNK_SIZE;
        const access = {
            get: (x, y, z) => {
                const lx = x - baseX, lz = z - baseZ;
                return lx < 0 || lx >= S || lz < 0 || lz >= S || y < 0 || y >= CHUNK_HEIGHT ? -1 : chunk.getId(lx, y, lz);
            },
            set: (x, y, z, type) => chunk.setId(x - baseX, y, z - baseZ, this.idOf(type))
        };
        this.forEachShrub(baseX, baseZ, baseX + S - 1, baseZ + S - 1, (shrub) => stampShrub(access, shrub));
    }

}


// Czy na komórce o numerze `below` może stać krzew (stały grunt: nie
// powietrze, nie woda, nie liście ani roślina).
function isGround(below) {
    return below > 0 && !isLiquidId(below) && !isLeavesId(below) && !canReplace(below, false);
}

// Wstawia krzew przez `access` ({ get(x, y, z) -> numer bloku albo -1
// poza zasięgiem, set(x, y, z, typ) }). Zwraca liczbę postawionych bloków.
export function stampShrub(access, shrub) {

    const { shape } = shrub;
    let placed = 0;

    // Grunt każdej kolumny (krzew bez pnia): pierwsza wolna komórka nad
    // stałym gruntem, najwyżej 2 bloki wyżej albo 3 niżej niż środek.
    const grounds = new Map();
    const groundOf = (x, z) => {
        const key = `${x},${z}`;
        if (grounds.has(key)) return grounds.get(key);
        let found = null;
        for (let y = shrub.y + 2; y >= Math.max(1, shrub.y - 3); y--) {
            const here = access.get(x, y, z);
            if (here < 0) break;
            if (!canReplace(here, false)) continue;
            if (isGround(access.get(x, y - 1, z))) { found = y; break; }
        }
        grounds.set(key, found);
        return found;
    };

    for (const [dx, dy, dz, type] of shape.blocks) {

        const x = shrub.x + dx, z = shrub.z + dz;
        const stem = SHRUBS[shrub.species].stem === 'log' && type.endsWith('_stem');
        let y;

        if (shape.rigid) {
            y = shrub.y + dy;
        }
        else {
            const ground = groundOf(x, z);
            if (ground === null) continue;
            y = ground + dy;
        }

        if (y < 1 || y >= CHUNK_HEIGHT) continue;

        const old = access.get(x, y, z);
        if (old < 0) continue;

        // Podstawa (sadzonka) zawsze ustępuje; pień wchodzi też w liście.
        const base = dx === 0 && dy === 0 && dz === 0;
        if (!base && !canReplace(old, stem)) continue;
        if (base && !canReplace(old, true)) continue;

        access.set(x, y, z, type);
        placed++;

        // Pień krzewu z pniem schodzi do ziemi (stok).
        if (shape.rigid && stem && dy === 0) {
            for (let yy = y - 1, depth = 0; yy >= 1 && depth < 3; yy--, depth++) {
                const below = access.get(x, yy, z);
                if (below < 0 || !canReplace(below, true)) break;
                access.set(x, yy, z, type);
                placed++;
            }
        }

    }

    return placed;

}


// Krzew w świecie (sadzonka, która urosła, albo komenda /krzewy): blok po
// bloku przez world.setBlock. Zwraca kształt albo null (nic nie stanęło).
export function plantShrub(world, x, y, z, species, variety = 0, seed = 1, size = 0.5) {

    if (!SHRUBS[species] || y < 1 || y + 8 >= CHUNK_HEIGHT) return null;

    const shape = buildShrub(species, Math.min(variety, SHRUBS[species].varieties.length - 1), seed, size);
    const access = {
        get: (bx, by, bz) => (by < 0 || by >= CHUNK_HEIGHT ? -1 : world.getBlockId(bx, by, bz)),
        set: (bx, by, bz, type) => world.setBlock(bx, by, bz, type)
    };

    // Miejsce na podstawę: nad sadzonką nie może stać blok budynku ani skała.
    if (!canReplace(world.getBlockId(x, y, z), true)) return null;

    return stampShrub(access, { x, y, z, species, shape }) > 0 ? shape : null;

}


