import {
    CHUNK_SIZE,
    CHUNK_HEIGHT
} from '../../config.js';

import { getBlockId } from '../../blocks/BlockRegistry.js';

import { Noise } from '../Noise.js';

import * as SHAPE from './TerrainShape.js';

// ------------------------------------------------------------
// BUDOWA GEOLOGICZNA TERENU REALISTYCZNEGO
//
// Jaka skała jest w danym miejscu pod ziemią. Kolumna (x, z) od dołu:
//
//   bazalt   y < basaltTop     najgłębsze podłoże
//   granit   y < graniteTop    pod nizinami głęboko, pod górami tuż
//                              pod powierzchnią (albo na wierzchu)
//   kamień   y < coverBottom   zwykła skała
//   warstwy  aż do gleby       skały osadowe - poziome, lekko
//                              pofalowane pasy (STRATA_THICKNESS)
//
// Skała każdej warstwy zależy od miejsca (STRATA w TerrainShape.js):
// na wyżynach głównie wapień, na nizinach kamień i piaskowiec, na
// wybrzeżach piaskowiec, na płaskowyżach pasy piaskowca i wapienia,
// w górach łupek, pod głębokim morzem bazalt. Ta sama warstwa ciągnie
// się daleko w bok, a na granicy dwóch krajobrazów zmienia skałę -
// dlatego na urwiskach i w wąwozach widać pasy.
//
// Lepidolit jest tylko w granicie, jako rzadkie żyły - głęboko pod
// nizinami, płycej pod górami. Na powierzchnię wychodzi rzadko.
//
// Wszystko zależy tylko od seeda i pozycji, jak reszta generatora.
// ------------------------------------------------------------

// Skały warstw, w stałej kolejności (indeksy w tablicach udziałów).

const STRATA_ROCKS = ['stone', 'sandstone', 'limestone', 'slate', 'basalt'];

const STRATA_ROWS = {};

for (const [region, shares] of Object.entries(SHAPE.STRATA)) {

    STRATA_ROWS[region] = STRATA_ROCKS.map((rock) => shares[rock] ?? 0);

}


function clamp(value, min, max) {

    return value < min ? min : value > max ? max : value;

}


function smoothstep(edge0, edge1, value) {

    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);

    return t * t * (3 - 2 * t);

}


function lerp(a, b, t) {

    return a + (b - a) * t;

}


// Liczba 0..1 dla numeru warstwy (zawsze ta sama dla tego samego
// numeru i seeda).

function layerRandom(layer, seed) {

    let h = seed ^ Math.imul(layer, 0x9e3779b1);

    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;

}

// ------------------------------------------------------------
// Pole szumu 3D liczone w punktach co `step` bloków, a między nimi
// liniowo - dużo mniej liczenia niż szum w każdym bloku.
//
// W chunku punkty są liczone raz dla całego chunka (prepare + local),
// a pojedynczy blok gdziekolwiek - od razu z 8 sąsiednich punktów
// (at). Obie drogi dają DOKŁADNIE tę samą wartość.
// ------------------------------------------------------------

class GridNoise {

    constructor(noise, scale, step) {

        this.noise = noise;
        this.scale = scale;
        this.step = step;

        this.size = CHUNK_SIZE / step + 1;
        this.layer = this.size * this.size;

        this.grid = new Float32Array(
            this.layer * (Math.floor(CHUNK_HEIGHT / step) + 2)
        );

    }


    corner(x, y, z) {

        return this.noise.noise3D(x / this.scale, y / this.scale, z / this.scale);

    }


    // Punkty dla chunka o rogu (baseX, baseZ), od y = 0 do `top`.

    prepare(baseX, baseZ, top) {

        const step = this.step;
        const layers = Math.floor(top / step) + 2;

        let i = 0;

        for (let gy = 0; gy < layers; gy++) {

            for (let gz = 0; gz < this.size; gz++) {

                for (let gx = 0; gx < this.size; gx++) {

                    this.grid[i++] = this.corner(baseX + gx * step, gy * step, baseZ + gz * step);

                }

            }

        }

    }


    // Wartość w bloku (lx, y, lz) chunka z ostatniego prepare().

    local(lx, y, lz) {

        const s = this.step;
        const n = this.size;

        const gx = Math.floor(lx / s);
        const gy = Math.floor(y / s);
        const gz = Math.floor(lz / s);

        const i = (gy * n + gz) * n + gx;
        const j = i + this.layer;

        const g = this.grid;

        return trilinear(
            g[i], g[i + 1], g[i + n], g[i + n + 1],
            g[j], g[j + 1], g[j + n], g[j + n + 1],
            (lx - gx * s) / s, (y - gy * s) / s, (lz - gz * s) / s
        );

    }


    // Wartość w dowolnym bloku świata.

    at(x, y, z) {

        const s = this.step;

        const x0 = Math.floor(x / s) * s;
        const y0 = Math.floor(y / s) * s;
        const z0 = Math.floor(z / s) * s;

        return trilinear(
            this.corner(x0, y0, z0), this.corner(x0 + s, y0, z0),
            this.corner(x0, y0, z0 + s), this.corner(x0 + s, y0, z0 + s),
            this.corner(x0, y0 + s, z0), this.corner(x0 + s, y0 + s, z0),
            this.corner(x0, y0 + s, z0 + s), this.corner(x0 + s, y0 + s, z0 + s),
            (x - x0) / s, (y - y0) / s, (z - z0) / s
        );

    }

}


// c[x][y][z] w kolejności: dół (z0: x0, x1; z1: x0, x1), góra (to samo).

function trilinear(c000, c100, c001, c101, c010, c110, c011, c111, tx, ty, tz) {

    const bottom = lerp(lerp(c000, c100, tx), lerp(c001, c101, tx), tz);
    const upper = lerp(lerp(c010, c110, tx), lerp(c011, c111, tx), tz);

    return lerp(bottom, upper, ty);

}

// ------------------------------------------------------------

export class Geology {

    // generator - RealisticGenerator (jego pola: field()),
    // base      - seed jako liczba.

    constructor(generator, base) {

        this.generator = generator;

        this.seed = base | 0;

        const noise = (k) => new Noise((base + Math.imul(k, 0x9e3779b1)) >>> 0);

        this.noise = {
            granite: noise(20),
            graniteDetail: noise(21),
            cover: noise(22),
            tilt: noise(23),
            outcrop: noise(26),
            folds: noise(27)
        };

        const L = SHAPE.LEPIDOLITE;

        this.sheet = new GridNoise(noise(24), L.SCALE, 2);
        this.pocket = new GridNoise(noise(25), L.POCKET_SCALE, 4);


        this.ids = {
            stone: getBlockId('stone'),
            granite: getBlockId('granite'),
            basalt: getBlockId('basalt'),
            lepidolite: getBlockId('lepidolite')
        };

        this.strataIds = STRATA_ROCKS.map((rock) => getBlockId(rock));

        this.col = this.createColumn();

    }


    createColumn() {

        return {
            height: 0,
            basaltTop: 0,
            graniteTop: 0,
            coverBottom: 0,
            tilt: 0,
            // udziały skał warstw - narastająco (ostatni = 1)
            shares: new Float32Array(STRATA_ROCKS.length)
        };

    }


    // Granice skał w kolumnie (x, z). sample - wynik generator.compute().

    column(x, z, sample, col = this.col) {

        const field = (noise, scale, octaves) => this.generator.field(noise, x, z, scale, octaves);

        const N = this.noise;

        const height = sample.height;


        // Granit: pod nizinami i wyżynami na stałej głębokości, pod
        // górami tuż pod powierzchnią.

        const wide = field(N.granite, 230, 2);
        const detail = field(N.graniteDetail, 45, 2);

        const low =
            SHAPE.GRANITE_LOW +
            (SHAPE.GRANITE_UPLAND - SHAPE.GRANITE_LOW) * sample.upland +
            SHAPE.GRANITE_VARIATION * wide;

        const high =
            height - (SHAPE.GRANITE_MOUNTAIN_DEPTH + SHAPE.GRANITE_MOUNTAIN_VARIATION * detail);

        let graniteTop = lerp(low, high, smoothstep(0.3, 0.85, sample.mountains));

        let basaltTop = SHAPE.BASALT_TOP + 2 * detail;


        // Pod głębokim morzem nie ma granitu - dno to bazalt (skorupa
        // oceaniczna), przykryty cienkimi warstwami.

        const deepSea = sample.ocean ? smoothstep(-6, -18, sample.base) : 0;

        if (deepSea > 0) {

            graniteTop = lerp(graniteTop, 0, deepSea);
            basaltTop = lerp(basaltTop, height - 8, deepSea);

        }

        col.graniteTop = Math.round(graniteTop);
        col.basaltTop = Math.round(basaltTop);

        col.coverBottom = Math.round(
            height - SHAPE.COVER_DEPTH - SHAPE.COVER_VARIATION * field(N.cover, 120, 2)
        );

        // Warstwy są lekko pofalowane, a w górach mocno pofałdowane
        // (na zboczach widać wtedy na przemian łupek i kamień).

        col.tilt =
            SHAPE.STRATA_WARP * field(N.tilt, 160, 2) +
            SHAPE.STRATA_FOLDS * smoothstep(0.2, 0.7, sample.mountains) * field(N.folds, 70, 2);

        col.height = height;


        // Krajobrazy (0-1) -> udziały skał w warstwach.

        const mountains = smoothstep(0.25, 0.7, sample.mountains);

        const plateau = sample.plateau * smoothstep(0.3, 0.6, sample.upland) * (1 - mountains);

        const upland = Math.max(0, sample.upland * (1 - mountains) - plateau);

        let ocean = 0;
        let coast = 0;

        if (sample.ocean) {
            ocean = deepSea;
            coast = 1 - ocean;
        }
        else {
            coast = (1 - smoothstep(1, 5, sample.base)) * (1 - mountains) * (1 - upland);
        }

        const lowland = Math.max(0, 1 - mountains - plateau - upland - ocean - coast);


        const shares = col.shares;

        let total = 0;

        for (let k = 0; k < STRATA_ROCKS.length; k++) {

            shares[k] =
                STRATA_ROWS.mountains[k] * mountains +
                STRATA_ROWS.plateau[k] * plateau +
                STRATA_ROWS.upland[k] * upland +
                STRATA_ROWS.coast[k] * coast +
                STRATA_ROWS.ocean[k] * ocean +
                STRATA_ROWS.lowland[k] * lowland;

            total += shares[k];

        }

        let sum = 0;

        for (let k = 0; k < shares.length; k++) {

            sum += shares[k] / total;

            shares[k] = sum;

        }

        shares[shares.length - 1] = 1;


        return col;

    }


    // Skała na wysokości y w kolumnie (bez lepidolitu).

    rockAt(col, y) {

        if (y < col.basaltTop) {
            return this.ids.basalt;
        }

        if (y < col.graniteTop) {
            return this.ids.granite;
        }

        if (y < col.coverBottom) {
            return this.ids.stone;
        }


        const layer = Math.floor((y + col.tilt) / SHAPE.STRATA_THICKNESS);

        const r = layerRandom(layer, this.seed);

        const shares = col.shares;

        for (let k = 0; k < shares.length; k++) {

            if (r < shares[k]) {
                return this.strataIds[k];
            }

        }

        return this.strataIds[shares.length - 1];

    }


    // Przygotowanie żył lepidolitu dla chunka: punkty szumu do
    // wysokości `top` (najwyższy granit w chunku).

    prepareChunk(baseX, baseZ, top) {

        this.pocket.prepare(baseX, baseZ, top);
        this.sheet.prepare(baseX, baseZ, top);

    }


    // Czy granitowy blok (x, y, z) jest lepidolitem. depth - ile
    // bloków pod powierzchnią. lx, lz - pozycja w chunku z ostatniego
    // prepareChunk() albo -1 (pojedynczy blok - wolniej).

    isLepidolite(x, y, z, depth, lx = -1, lz = -1) {

        const L = SHAPE.LEPIDOLITE;

        const inChunk = lx >= 0;


        // Najpierw rzadkie obszary z żyłami, potem sama żyła (cienka płyta).

        const pocket = inChunk ? this.pocket.local(lx, y, lz) : this.pocket.at(x, y, z);

        if (pocket <= L.POCKET) {
            return false;
        }

        const sheet = inChunk ? this.sheet.local(lx, y, lz) : this.sheet.at(x, y, z);

        if (Math.abs(sheet) >= L.WIDTH) {
            return false;
        }


        // Tuż pod powierzchnią - tylko w nielicznych miejscach (wychodnie).

        if (depth < L.MIN_DEPTH) {
            return this.generator.field(this.noise.outcrop, x, z, 60, 1) > L.OUTCROP;
        }

        return true;

    }

}
