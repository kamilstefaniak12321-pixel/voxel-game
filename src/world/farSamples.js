import { WORLD_BORDER } from '../config.js';

import { BASE_TREE_NAMES, TREE_NAMES, TREE_SPECIES } from '../blocks/trees.js';
import { surfaceMaterialId } from '../rendering/SurfaceMaterials.js';

// ------------------------------------------------------------
// PRÓBKI I SIATKA DALEKIEGO TERENU
//
// Daleki teren (FarTerrain.js) to kafelki z kratek - każda kratka to
// słupek terenu o boku "spacing" bloków. Ten plik liczy dla kafelka
// wysokość i rodzaj powierzchni każdej kratki (z generatora terenu,
// generator.farSurface) i składa z nich siatkę (wierzchy i ścianki
// kratek). Działa w osobnym wątku (FarTerrainWorker.js), a gdy wątku
// nie ma - w grze, po kawałku. Bez three.js i bez okna, żeby dało się
// go wczytać w wątku.
// ------------------------------------------------------------

// Skały, które mają na dalekim terenie własny kolor (średni kolor
// wierzchu bloku). Zwykły kamień to 'rock'.

export const ROCK_KINDS = ['granite', 'limestone', 'sandstone', 'slate', 'basalt', 'lepidolite'];

// Lasy: z daleka widać korony drzew w kolorze liści gatunku
// (generator.farSurface podnosi tam teren do wysokości koron).

export const LEAF_KINDS = BASE_TREE_NAMES.map((species) => `${species}_leaves`);

// Trawa w kolorze klimatu (Biomes.js - kolor trawy): cieplejsza,
// chłodniejsza i górska (bledsza). Śnieg - ośnieżone szczyty.

export const GRASS_KINDS = ['grass_warm', 'grass_cool', 'grass_high'];

// Rodzaj powierzchni -> numer w kafelku. (Nowe rodzaje tylko na końcu -
// numery zapisują się w kafelkach liczonych w wątku.)

export const KINDS = ['grass', 'rock', 'sand', 'water', ...ROCK_KINDS, ...LEAF_KINDS, 'snow', ...GRASS_KINDS];

const WATER_KIND = KINDS.indexOf('water');

const FIRST_LEAF_KIND = KINDS.indexOf(LEAF_KINDS[0]);

const LAST_LEAF_KIND = KINDS.indexOf(LEAF_KINDS[LEAF_KINDS.length - 1]);

// Kurtyny (meshFarTile): jak głęboko pod wierzchem sięgają - korony
// drzew (do ziemi pod nimi) i woda (do dna); inne rodzaje bez kurtyn.
// Tylko w kafelkach o kratkach do CURTAIN_MAX_SPACING bloków (dalej
// prawdziwych chunków i tak nie ma).

const CURTAIN_LEAVES = 12;
const CURTAIN_WATER = 8;
const CURTAIN_MAX_SPACING = 4;

function curtainDepth(kind) {

    if (kind === WATER_KIND) {
        return CURTAIN_WATER;
    }

    return kind >= FIRST_LEAF_KIND && kind <= LAST_LEAF_KIND ? CURTAIN_LEAVES : 0;

}

// Numer rodzaju: 'stone' to to samo co 'rock', nieznany = trawa.

const KIND_INDEX = new Map(KINDS.map((kind, index) => [kind, index]));

KIND_INDEX.set('stone', KIND_INDEX.get('rock'));

export function kindIndex(kind) {

    return KIND_INDEX.get(kind) ?? 0;

}


// Blok wierzchu w chunku zmienionym przez gracza -> rodzaj powierzchni
// (inne bloki - jak trawa).

export const BLOCK_KINDS = {
    stone: 'rock',
    sand: 'sand',
    water: 'water',
    snow: 'snow'
};

for (const rock of ROCK_KINDS) {
    BLOCK_KINDS[rock] = rock;
}

for (const leaves of LEAF_KINDS) {
    BLOCK_KINDS[leaves] = leaves;
}

BLOCK_KINDS.linden_leaves_flowering = 'linden_leaves';

// Drzewa z paczek z daleka wyglądają jak gatunek gry z "podobnyDo"
// (wszystkie ich liście, także odmiany).

for (const species of TREE_NAMES) {

    const pack = TREE_SPECIES[species].pack;

    if (!pack) {
        continue;
    }

    const kind = `${pack.similar}_leaves`;

    BLOCK_KINDS[`${species}_leaves`] = kind;

    for (const variant of pack.variants) {
        BLOCK_KINDS[`${species}_leaves_${variant.key}`] = kind;
        BLOCK_KINDS[`${species}_leaves_${variant.key}_growing`] = kind;
    }

}


// Miejsce próbki kratki i (od -1 do cells - ramka jednej kratki
// dookoła, do ścianek na brzegu kafelka): środek kratki, w granicach
// świata.

export function samplePosition(origin, index, spacing) {

    const value = origin + index * spacing + (spacing >> 1);

    return Math.max(-WORLD_BORDER, Math.min(WORLD_BORDER - 1, value));

}


// Próbki kafelka: (cells + 2) x (cells + 2) kratek (z ramką), rząd po
// rzędzie (z, potem x). heights - y nad wierzchem, kinds - klasyczny rodzaj,
// materialIds (Uint16) - rzeczywisty materiał lub odcień trawy do atmosfery.
// fromRow / toRow - tylko część rzędów (liczenie po kawałku w grze).

export function sampleFarTile(generator, x0, z0, spacing, cells, heights, kinds, fromRow = 0, toRow = cells + 2, materialIds = null, groundOnly = false) {

    const W = cells + 2;

    for (let row = fromRow; row < toRow; row++) {

        const z = samplePosition(z0, row - 1, spacing);

        for (let column = 0; column < W; column++) {

            const x = samplePosition(x0, column - 1, spacing);

            const surface = generator.farSurface(x, z, spacing, groundOnly);

            heights[row * W + column] = surface.top;
            kinds[row * W + column] = kindIndex(surface.kind);
            if (materialIds) materialIds[row * W + column] = surfaceMaterialId(surface.material ?? surface.kind);

        }

    }

}


// ------------------------------------------------------------
// SIATKA KAFELKA
//
// Z wysokości kratek: wierzchy (połączone w prostokąty o tej samej
// wysokości i rodzaju), ścianki między kratkami (od niższej do
// wyższej, sąsiednie o tych samych wymiarach połączone) i fartuchy
// na brzegu kafelka - ścianki opuszczone w dół, które zasłaniają
// szczeliny przy sąsiednim kafelku innej dokładności.
//
// palette - bajty kolorów na rodzaj: [wierzch r g b, bok r g b, dół
//           boku r g b] (FarTerrain.prepareColors),
// albedoPalette - czyste albedo: 6 ścian x RGB na materialIds,
// scratch - bufory z createMeshScratch (wspólne dla kolejnych kafelków).
// Wynik: { positions (Int16, względem rogu kafelka), normals (Int8),
// colors, surfaceAlbedo (Uint8), indices, shadowIndices (Uint16) } - kopie użytej części. Po
// 4 liczby na róg (position.w: rzeczywisty dół ściany dla cienia), bo karty graficzne
// czytają bez przeliczania tylko takie formaty (3 x 16 albo 3 x 8 bitów
// przeglądarka musiałaby przerabiać).
//
// Czwarta liczba koloru to znacznik rogu (shader dalekiego terenu):
//   255 - zwykły róg,
//     0 - na wierzchu wody (wierzch kratki wody, dół ścianki nad wodą) -
//         shader obniża go do wysokości powierzchni bliskiej wody
//         (WATER_SURFACE), żeby na granicy z nią nie było szczeliny,
//   100 - róg kurtyny, 50 - róg kurtyny na wierzchu wody.
//
// KURTYNY: na granicach chunków wewnątrz kafelka (kratki do
// CURTAIN_MAX_SPACING bloków) koron drzew i wody - ścianki od wierzchu
// w dół (curtainDepth), w obie strony. Shader rysuje tylko te zwrócone
// do chunków z meshem ze słupka w chunku bez meshu: patrząc z prawdziwych
// chunków (z góry między drzewami, przez wodę) widać ścianę koron albo
// wody, a nie niebo - tam, gdzie zwykłej ścianki nie ma (sąsiad tej samej
// wysokości).
//
// Normalna ma na swojej osi 127 (= 1), a na dwóch pozostałych +-1:
// w którą stronę od środka ściany leży ten róg. Shader dalekiego terenu
// wyciąga z tego czystą normalną i odsuwa róg o pół piksela na zewnątrz,
// żeby między połączonymi ścianami (róg jednej leży w połowie krawędzi
// drugiej) nie prześwitywały pojedyncze piksele nieba. Górne rogi
// ścianek nie idą w górę (0) - ścianka nie wystawałaby nad wierzch
// kratki cienką kreską; szczelinę u góry ścianki zakrywa wierzch.
// ------------------------------------------------------------

export function createMeshScratch(cells) {

    const maxQuads = cells * cells + 2 * cells * (cells + 1) + 4 * cells * cells;

    return {
        cells,
        positions: new Int16Array(maxQuads * 16),
        normals: new Int8Array(maxQuads * 16),
        colors: new Uint8Array(maxQuads * 16),
        surfaceAlbedo: new Uint8Array(maxQuads * 16),
        shadowQuads: new Uint8Array(maxQuads),
        used: new Uint8Array(cells * cells)
    };

}


export function meshFarTile(heights, kinds, cells, spacing, palette, scratch, materialIds = null, albedoPalette = null) {

    const N = cells;

    const W = N + 2;

    const s = spacing;


    // i, j - kratka od -1 do N (z ramką).

    const H = (i, j) => heights[(j + 1) * W + i + 1];
    const K = (i, j) => kinds[(j + 1) * W + i + 1];
    const M = (i, j) => materialIds?.[(j + 1) * W + i + 1] ?? surfaceMaterialId(KINDS[K(i, j)]);


    const { positions, normals, colors, surfaceAlbedo, shadowQuads, used } = scratch;

    let quads = 0;


    // Róg ściany v (0-3): położenie, normalna i kolor (indeks
    // w palecie: wierzch, bok albo ciemniejszy dół boku). Rogi idą
    // przeciwnie do wskazówek zegara patrząc od strony normalnej.

    const corner = (v, x, y, z, nx, ny, nz, color, material, faceIndex, water = false, curtain = false, shadowBase = 0) => {

        // nx, ny, nz: 127 na osi normalnej, +-1 - strona rogu.


        const p = (quads * 4 + v) * 4;

        positions[p] = x;
        positions[p + 1] = y;
        positions[p + 2] = z;
        positions[p + 3] = shadowBase;

        normals[p] = nx;
        normals[p + 1] = ny;
        normals[p + 2] = nz;

        colors[p] = palette[color];
        colors[p + 1] = palette[color + 1];
        colors[p + 2] = palette[color + 2];
        colors[p + 3] = curtain ? (water ? 50 : 100) : (water ? 0 : 255);

        const albedo = material * 18 + faceIndex * 3;
        for (let channel = 0; channel < 3; channel++) {
            surfaceAlbedo[p + channel] = albedoPalette ? albedoPalette[albedo + channel] : palette[color + channel];
        }
        surfaceAlbedo[p + 3] = 255;

    };


    // Wierzch prostokąta kratek [i0, i1) x [j0, j1) na wysokości y.

    const top = (i0, j0, i1, j1, y, kind, material) => {

        const c = kind * 9;

        const xa = i0 * s;
        const xb = i1 * s;
        const za = j0 * s;
        const zb = j1 * s;

        const water = kind === WATER_KIND;

        corner(0, xa, y, za, -1, 127, -1, c, material, 2, water);
        corner(1, xa, y, zb, -1, 127, 1, c, material, 2, water);
        corner(2, xb, y, zb, 1, 127, 1, c, material, 2, water);
        corner(3, xb, y, za, 1, 127, -1, c, material, 2, water);

        shadowQuads[quads] = water ? 0 : 1;
        quads++;

    };


    // Ścianka w płaszczyźnie x = const (od a do b wzdłuż z),
    // zwrócona w stronę dir (+1 / -1). lowWater - pod nią woda.

    const sideX = (x, a, b, bottom, upper, kind, dir, lowWater, material, shadowBase = bottom, curtain = false, highWater = kind === WATER_KIND) => {

        const c = kind * 9;

        const n = dir * 127;
        const faceIndex = dir > 0 ? 0 : 1;

        if (dir > 0) {
            corner(0, x, bottom, a, n, -1, -1, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(1, x, upper, a, n, 0, -1, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(2, x, upper, b, n, 0, 1, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(3, x, bottom, b, n, -1, 1, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
        }
        else {
            corner(0, x, bottom, b, n, -1, 1, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(1, x, upper, b, n, 0, 1, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(2, x, upper, a, n, 0, -1, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(3, x, bottom, a, n, -1, -1, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
        }

        shadowQuads[quads] = kind !== WATER_KIND && !curtain && upper > shadowBase ? 1 : 0;
        quads++;

    };


    // Ścianka w płaszczyźnie z = const (od a do b wzdłuż x).

    const sideZ = (z, a, b, bottom, upper, kind, dir, lowWater, material, shadowBase = bottom, curtain = false, highWater = kind === WATER_KIND) => {

        const c = kind * 9;

        const n = dir * 127;
        const faceIndex = dir > 0 ? 4 : 5;

        if (dir > 0) {
            corner(0, a, bottom, z, -1, -1, n, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(1, b, bottom, z, 1, -1, n, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(2, b, upper, z, 1, 0, n, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(3, a, upper, z, -1, 0, n, c + 3, material, faceIndex, highWater, curtain, shadowBase);
        }
        else {
            corner(0, b, bottom, z, 1, -1, n, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(1, a, bottom, z, -1, -1, n, c + 6, material, faceIndex, lowWater, curtain, shadowBase);
            corner(2, a, upper, z, -1, 0, n, c + 3, material, faceIndex, highWater, curtain, shadowBase);
            corner(3, b, upper, z, 1, 0, n, c + 3, material, faceIndex, highWater, curtain, shadowBase);
        }

        shadowQuads[quads] = kind !== WATER_KIND && !curtain && upper > shadowBase ? 1 : 0;
        quads++;

    };


    // 1. Wierzchy: prostokąty kratek o tej samej wysokości i rodzaju.

    used.fill(0, 0, N * N);

    for (let j = 0; j < N; j++) {

        for (let i = 0; i < N; i++) {

            if (used[j * N + i]) {
                continue;
            }

            const h = H(i, j);
            const k = K(i, j);
            const m = M(i, j);

            let w = 1;

            while (i + w < N && !used[j * N + i + w] && H(i + w, j) === h && K(i + w, j) === k && M(i + w, j) === m) {
                w++;
            }

            let d = 1;

            rows: while (j + d < N) {

                for (let q = 0; q < w; q++) {

                    if (used[(j + d) * N + i + q] || H(i + q, j + d) !== h || K(i + q, j + d) !== k || M(i + q, j + d) !== m) {
                        break rows;
                    }

                }

                d++;

            }

            for (let dj = 0; dj < d; dj++) {
                used.fill(1, (j + dj) * N + i, (j + dj) * N + i + w);
            }

            top(i, j, i + w, j + d, h, k, m);

        }

    }


    // 2. Ścianki między kratkami i fartuchy na brzegu. Granica b
    // (płaszczyzna b * s) leży między kratką A (b - 1) i B (b);
    // ścianka należy do wyższej z nich, a na brzegu kafelka (kratka
    // z ramki jest już w sąsiednim kafelku) jest zawsze - od kratki
    // kafelka w dół, pod niższą z dwóch kratek.

    const skirt = s * 2 + 4;

    // [kierunek, dół, góra, rodzaj, pod nią woda, materiał, dół bez fartucha] albo null (ta sama
    // wysokość).

    const face = (b, hA, hB, kA, kB, mA, mB) => {

        if (b === 0) {
            return [-1, Math.min(hA, hB) - skirt, hB, kB, false, mB, Math.min(hA, hB)];
        }

        if (b === N) {
            return [1, Math.min(hA, hB) - skirt, hA, kA, false, mA, Math.min(hA, hB)];
        }

        if (hA > hB) {
            return [1, hB, hA, kA, kB === WATER_KIND, mA, hB];
        }

        if (hB > hA) {
            return [-1, hA, hB, kB, kA === WATER_KIND, mB, hA];
        }

        // Ląd równo z wodą: wierzch wody jest trochę niżej (shader) -
        // niska ścianka lądu nad wodą zasłania szczelinę.

        if (kA === WATER_KIND && kB !== WATER_KIND) {
            return [-1, hA, hB, kB, true, mB, hA];
        }

        if (kB === WATER_KIND && kA !== WATER_KIND) {
            return [1, hB, hA, kA, true, mA, hB];
        }

        return null;

    };

    // Ścianki o tej samej wysokości, rodzaju i kierunku obok siebie
    // wzdłuż granicy łączą się w jedną.

    const sides = (emit, across) => {

        for (let b = 0; b <= N; b++) {

            let run = null;
            let start = 0;

            for (let t = 0; t <= N; t++) {

                const current = t < N ? face(b, ...across(b, t)) : null;

                if (
                    run && current &&
                    current[0] === run[0] && current[1] === run[1] &&
                    current[2] === run[2] && current[3] === run[3] &&
                    current[4] === run[4] && current[5] === run[5] && current[6] === run[6]
                ) {
                    continue;
                }

                if (run) {
                    emit(b * s, start * s, t * s, run[1], run[2], run[3], run[0], run[4], run[5], run[6]);
                }

                run = current;
                start = t;

            }

        }

    };

    // Granice wzdłuż x (ścianki zwrócone w +-x) i wzdłuż z.

    sides(sideX, (b, t) => [H(b - 1, t), H(b, t), K(b - 1, t), K(b, t), M(b - 1, t), M(b, t)]);

    sides(sideZ, (b, t) => [H(t, b - 1), H(t, b), K(t, b - 1), K(t, b), M(t, b - 1), M(t, b)]);


    // 3. Kurtyny na granicach chunków wewnątrz kafelka. Kurtyna kratki
    // o wierzchu h zwrócona do sąsiada o wierzchu hn: od h - głębokość
    // do h - albo tylko poniżej zwykłej ścianki (gdy h > hn, ścianka
    // od hn do h już jest). Sąsiednie takie same łączą się.

    if (s <= CURTAIN_MAX_SPACING && 16 % s === 0) {

        const step = 16 / s;

        // [dół, góra, czy górne rogi na wierzchu wody] albo null.

        const curtain = (h, hn, kind, kindN) => {

            const depth = curtainDepth(kind);

            if (depth === 0) {
                return null;
            }

            const upper = Math.min(h, hn);

            const water = upper === h ? kind === WATER_KIND : kindN === WATER_KIND;

            return upper > h - depth ? [h - depth, upper, water] : null;

        };

        const curtains = (emit, across) => {

            for (let b = step; b < N; b += step) {

                for (const dir of [-1, 1]) {

                    let run = null;
                    let start = 0;

                    for (let t = 0; t <= N; t++) {

                        let current = null;

                        if (t < N) {

                            const [hA, hB, kA, kB, mA, mB] = across(b, t);

                            // dir -1: kurtyna kratki B (zwrócona do A),
                            // dir +1: kratki A (zwrócona do B).

                            const range = dir < 0 ? curtain(hB, hA, kB, kA) : curtain(hA, hB, kA, kB);

                            if (range) {
                                current = [range[0], range[1], dir < 0 ? kB : kA, range[2], dir < 0 ? mB : mA];
                            }

                        }

                        if (
                            run && current &&
                            current[0] === run[0] && current[1] === run[1] &&
                            current[2] === run[2] && current[3] === run[3] && current[4] === run[4]
                        ) {
                            continue;
                        }

                        if (run) {
                            emit(b * s, start * s, t * s, run[0], run[1], run[2], dir, false, run[4], run[0], true, run[3]);
                        }

                        run = current;
                        start = t;

                    }

                }

            }

        };

        curtains(sideX, (b, t) => [H(b - 1, t), H(b, t), K(b - 1, t), K(b, t), M(b - 1, t), M(b, t)]);

        curtains(sideZ, (b, t) => [H(t, b - 1), H(t, b), K(t, b - 1), K(t, b), M(t, b - 1), M(t, b)]);

    }


    // Trójkąty: dwa na ścianę.

    const indices = new Uint16Array(quads * 6);
    const shadowIndices = new Uint16Array(shadowQuads.subarray(0, quads).reduce((sum, casts) => sum + casts, 0) * 6);
    let shadowOffset = 0;

    for (let q = 0; q < quads; q++) {

        const v = q * 4;
        const n = q * 6;

        indices[n] = v;
        indices[n + 1] = v + 1;
        indices[n + 2] = v + 2;
        indices[n + 3] = v;
        indices[n + 4] = v + 2;
        indices[n + 5] = v + 3;

        if (shadowQuads[q]) {
            // Bez tymczasowego TypedArray na każdą ścianę.
            shadowIndices[shadowOffset] = v;
            shadowIndices[shadowOffset + 1] = v + 1;
            shadowIndices[shadowOffset + 2] = v + 2;
            shadowIndices[shadowOffset + 3] = v;
            shadowIndices[shadowOffset + 4] = v + 2;
            shadowIndices[shadowOffset + 5] = v + 3;
            shadowOffset += 6;
        }

    }

    const count = quads * 16;

    return {
        positions: positions.slice(0, count),
        normals: normals.slice(0, count),
        colors: colors.slice(0, count),
        surfaceAlbedo: surfaceAlbedo.slice(0, count),
        indices,
        shadowIndices
    };

}
