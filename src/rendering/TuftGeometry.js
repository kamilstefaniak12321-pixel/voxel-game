import { createPixelPlant } from './PixelPlantBuilder.js';

// ------------------------------------------------------------
// KĘPKA - mała roślina z paczki roślin jako model z pikseli 1/16 bloku
// (model "kepka" w roslina.json, src/blocks/plantPacks.js)
//
// Roślina niższa niż blok z obrazka 16 x 16 byłaby rozmazaną plamą,
// więc zamiast obrazka jest prawdziwy, mały model - jak rośliny nad rzeką
// (RiverPlantGeometry.js, PixelPlantBuilder.js). Liście w dwóch układach:
// "rozeta" - przyziemna gwiazda wąskich liści (np. kocanka) albo "kepa" -
// gęsta, obszerna kępa wąskich, stojących liści (np. lawenda). Na łodygach
// z pikseli 1 x 1 (prostych albo rozchylonych na boki) kwiaty z kostek
// 1/16 bloku: "baldach" (kopułka z kilku koszyczków), "klos" (kłos
// z okółkami kwiatów, np. lawenda), "pak" (zamknięty pąk) albo nic.
// Kolory z palety atlasu rośliny. 8 odmian (ta sama roślina w świecie ma
// różne kępki), widać je ze wszystkich stron, kołyszą się na wietrze.
//
// Parametry (już sprawdzone przez plantPacks.js - parseTuft):
//   leaves: { layout: 'rozeta' | 'kepa' | 'krzak' | 'brak', count: [od, do],
//             length: [od, do], radius (kepa, krzak), edge (krzak: długość
//             liści z boków kopułki) }
//   stems:  { count: [od, do], height: [od, do], radius, spread (rozchylone),
//             leaves: null | { every, length } (liście na łodygach) }
//   flower: null | { kind: 'baldach' | 'klos' | 'pak' | 'pompon' | 'talerz' | 'dzwonek' | 'warstwy' | 'oset',
//             sizes: [od, do] }
//   colors: { leaf, leafLight, leafDark, stem, flower, flowerLight,
//             flowerDark, bud, center } - liniowe RGB 0-255 (jak COLORS
//             w RiverPlantGeometry.js)
//   height: wysokość w pikselach (do kołysania), seed
// ------------------------------------------------------------

function randomFor(seed) {
    let value = seed | 0;
    return () => {
        value = Math.imul(value ^ (value >>> 15), 2246822519);
        value = Math.imul(value ^ (value >>> 13), 3266489917);
        value ^= value >>> 16;
        return (value >>> 0) / 4294967296;
    };
}

// Kępa (lawenda): wąskie, stojące liście w kilku pionowych płaszczyznach
// wzdłuż i w poprzek (z każdej strony widać wachlarz liści). Liście
// wyrastają ze środka kępy i rozchylają się na boki - im bardziej na
// bok, tym niższe, więc kępa ma kształt wachlarza / kopułki. W środku
// przy ziemi ciemniejszy "pień" kępy (bez prześwitu).

function mound(tuft, variant, random, between, model) {

    const { sheet, box } = model;
    const radius = tuft.leaves.radius;
    const blades = between(tuft.leaves.count);
    const planes = [[2, -1], [0, -1], [2, 1], [0, 1]];

    if (blades > 12) {
        planes.push([variant % 2 ? 0 : 2, 0]);
    }

    planes.forEach(([axis, plane], p) => {

        const count = Math.floor(blades / planes.length) + (p < blades % planes.length ? 1 : 0);

        sheet(axis, plane, ({ pixel }) => {
            for (let i = 0; i < count; i++) {
                // Liście po kolei na boki: lewy, prawy, środkowy...
                // Liść jest ciągły (piksele stykają się bokami): gdy
                // odchyla się szybciej niż o piksel na wiersz, wiersz ma
                // poziomy odcinek - jak schodki liści na obrazku atlasu.
                const side = i % 2 ? 1 : -1;
                const root = Math.round((random() - 0.5) * 2);
                const tip = side * Math.round((0.15 + 0.85 * Math.min(1, (i % 3) / 2 + random() * 0.35)) * (radius + 2));
                const height = Math.max(2, between(tuft.leaves.length) - Math.floor(Math.abs(tip) / 2));
                const shade = (i + p + variant) % 3 === 0 ? 'leafDark' : (i + p) % 2 ? 'leaf' : 'leafLight';
                let last = root;
                for (let y = 0; y < height; y++) {
                    const t = y / Math.max(1, height - 1);
                    const x = root + Math.round((tip - root) * t ** 1.4);
                    const color = y === height - 1 ? 'leafLight' : shade;
                    for (let u = Math.min(last, x); u <= Math.max(last, x); u++) {
                        pixel(u, y, color);
                    }
                    // Szersza nasada liścia.
                    if (t < 0.4) pixel(x - side, y, color);
                    last = x;
                }
            }
        });

    });

    // Gęsty środek kępy: niska kopułka z kostek (jak mały blok liści) -
    // z niej wyrastają liście i łodygi.
    const layers = Math.max(1, Math.round(tuft.leaves.length[0] * 0.4));
    dome(box, random, Math.max(1, radius), layers, (y) => (y === layers - 1 ? 'leaf' : 'leafDark'), 'leafLight');

}

// Kopułka z kostek (kępa lawendy, krzak piwonii): okrągłe warstwy coraz
// węższe ku górze, brzeg najwyższej postrzępiony (kopułka, nie płyta),
// na wierzchu kilka pikseli innego koloru (bump). Jeden kolor na
// warstwę - ściany łączą się w prostokąty. color(y) - kolor warstwy.

function dome(box, random, core, layers, color, bump) {

    for (let y = 0; y < layers; y++) {
        const r = core * Math.sqrt(1 - (y / layers) ** 2) + 0.35;
        for (let z = -core; z <= core; z++) {
            for (let x = -core; x <= core; x++) {
                const edge = x * x + z * z > (r - 1) * (r - 1);
                if (x * x + z * z <= r * r && !(y > 0 && y === layers - 1 && edge && random() < 0.35)) {
                    box(x, y, z, 1, 1, 1, color(y));
                }
            }
        }
    }

    for (let k = 0; k < 2 + core; k++) {
        const x = Math.round((random() * 2 - 1) * (core - 0.5));
        const z = Math.round((random() * 2 - 1) * (core - 0.5));
        box(x, layers, z, 1, 1, 1, bump);
    }

}

// Kłos (lawenda): kolumna kwiatów na szczycie łodygi, co drugi piksel
// okółek - kwiatek z boku (na zmianę z czterech stron). Dół ciemniejszy,
// góra jaśniejsza, czubek - najjaśniejszy pąk. Krótki kłos (1-2) to
// zamknięte pąki, bez kwiatków z boku.

function spike(box, random, x, top, z, size) {

    const sides = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let turn = Math.floor(random() * 4);

    for (let k = 0; k < size; k++) {

        // Dół kłosa ciemniejszy, góra jaśniejsza (dwa kolory - kwiatek
        // z boku w kolorze swojej wysokości łączy się z kłosem w większe
        // ściany), na czubku jasny pąk.
        const color = k === size - 1 ? 'flowerLight' : k < size / 2 ? 'flowerDark' : 'flower';

        box(x, top + k, z, 1, 1, 1, color);

        if (size >= 3 && k < size - 1 && (k + (size % 2)) % 2 === 0) {
            const [dx, dz] = sides[turn % 4];
            box(x + dx, top + k, z + dz, 1, 1, 1, color);
            turn += 1 + (random() < 0.5 ? 1 : 0);
        }

    }

}

// Liść łodygi z góry (piwonia): środkowy listek w stronę "direction"
// (jeden z 8 kierunków), po bokach szersze blaszki - liść ma 3 piksele
// szerokości, jaśniejszy z jednej strony, ciemniejszy z drugiej, jasny
// czubek. (sx, sz) - łodyga.

const DIRECTIONS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function compoundLeaf(pixel, sx, sz, direction, size) {

    const [dx, dz] = DIRECTIONS[direction];
    const diagonal = dx !== 0 && dz !== 0;

    for (let k = 1; k <= size; k++) {

        pixel(sx + dx * k, sz + dz * k, k === size ? 'leafLight' : 'leaf');

        if (k === size && size > 1) {
            continue;
        }

        if (diagonal) {
            pixel(sx + dx * k, sz + dz * (k - 1), 'leafLight');
            pixel(sx + dx * (k - 1), sz + dz * k, 'leafDark');
        }
        else {
            pixel(sx + dx * k - dz, sz + dz * k + dx, 'leafLight');
            pixel(sx + dx * k + dz, sz + dz * k - dx, 'leafDark');
        }

    }

}

// Pompon (piwonia): pełny, kulisty kwiat z kostek. Rozmiar 1 - 3 x 3
// piksele (krzyżyk, pełna warstwa, jasny krzyżyk ze środkiem), rozmiar
// 2 - 5 x 5 (ciemny spód, dwie szerokie warstwy płatków, jaśniejszy
// wierzch ze środkiem). Jeden kolor na warstwę - mało ścian.

function pompon(box, x, top, z, size) {

    const layer = (y, radius, color, shape) => {
        for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // Krzyżyk albo kwadrat bez rogów (5 x 5) - okrągły z góry.
                const corner = radius > 1 && Math.abs(dx) === radius && Math.abs(dz) === radius;
                if (shape === 'plus' ? Math.abs(dx) + Math.abs(dz) > radius : corner) continue;
                box(x + dx, y, z + dz, 1, 1, 1, typeof color === 'function' ? color(dx, dz) : color);
            }
        }
    };

    if (size <= 1) {
        layer(top, 1, 'flowerDark', 'plus');
        layer(top + 1, 1, 'flower', 'square');
        layer(top + 2, 1, (dx, dz) => (dx === 0 && dz === 0 ? 'center' : 'flowerLight'), 'plus');
        return;
    }

    layer(top, 1, 'flowerDark', 'square');
    layer(top + 1, 2, 'flower', 'square');
    layer(top + 2, 2, 'flower', 'square');
    layer(top + 3, 1, (dx, dz) => (dx === 0 && dz === 0 ? 'center' : 'flowerLight'), 'square');

}

// Talerz (zawilec): otwarty kwiat, lekko wklęsły jak miseczka - środek
// (pręciki) i wewnętrzne płatki niżej, brzegi płatków o piksel wyżej
// i jaśniejsze (z boku widać brzeg miseczki). Kwiat jest przechylony na
// zewnątrz kępy (fx, fz - kierunek): brzeg od strony kępy wyżej, od
// zewnątrz niżej - patrzy w górę i w bok. Rozmiar 1 - 3 x 3 piksele,
// 2 - 5 x 5 (bez rogów), środek - krzyżyk pręcików.

function dish(box, x, top, z, size, fx, fz) {

    for (let dz = -size; dz <= size; dz++) {
        for (let dx = -size; dx <= size; dx++) {

            const ring = Math.max(Math.abs(dx), Math.abs(dz));
            const corner = size > 1 && Math.abs(dx) === size && Math.abs(dz) === size;
            const far = Math.abs(dx) + Math.abs(dz);

            if (corner) {
                continue;
            }

            const center = size > 1 ? far <= 1 : far === 0;
            const tilt = size > 1 ? -Math.round((dx * fx + dz * fz) * 0.5) : 0;

            if (size === 1 ? far <= 1 : ring < size) {
                box(x + dx, top + 1 + tilt, z + dz, 1, 1, 1, center ? 'center' : 'flower');
            }
            else {
                box(x + dx, top + 2 + tilt, z + dz, 1, 1, 1, 'flowerLight');
            }

        }
    }

    box(x, top, z, 1, 1, 1, 'flowerDark');

}

// Dzwonek (dzwonek gołębi): kwiat zwisający w dół z szypułki - na górze
// zielony kielich, niżej wąska szyjka, coraz szerzej, na dole szeroki,
// jaśniejszy brzeg, od spodu kremowe pręciki. Rozmiar 1 - 3 piksele
// wysokości (wąski), 2 - 4 piksele (dzwon 3 x 3 u dołu).

function bell(box, x, p, z, size) {

    box(x, p, z, 1, 1, 1, 'leafLight');

    const plus = (y, color, middle) => {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            box(x + dx, y, z + dz, 1, 1, 1, dx === 0 && dz === 0 ? middle : color);
        }
    };

    if (size <= 1) {
        box(x, p - 1, z, 1, 1, 1, 'flower');
        plus(p - 2, 'flowerLight', 'center');
        return;
    }

    box(x, p - 1, z, 1, 1, 1, 'flower');
    plus(p - 2, 'flower', 'flowerDark');

    for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
            box(x + dx, p - 3, z + dz, 1, 1, 1, dx === 0 && dz === 0 ? 'center' : 'flowerLight');
        }
    }

}

// Kłos w okółkach (szałwia): piętra kwiatów rozdzielone kawałkiem łodygi -
// na każdym piętrze krzyżyk kwiatów dookoła łodygi (niższe ciemniejsze),
// na czubku jasny pąk.

function whorledSpike(box, x, top, z, size) {

    for (let k = 0; k < size; k++) {

        if (k === size - 1) {
            box(x, top + k, z, 1, 1, 1, 'flowerLight');
        }
        else if (k % 2 === 0) {
            const color = k < size / 2 ? 'flowerDark' : 'flower';
            for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
                box(x + dx, top + k, z + dz, 1, 1, 1, dx === 0 && dz === 0 ? 'stem' : color);
            }
        }
        else {
            box(x, top + k, z, 1, 1, 1, 'stem');
        }

    }

}

// Warstwy (cynia): pełny kwiat z pięter płatków, coraz węższych ku górze -
// szeroki, ciemniejszy spód, jaśniejsze piętra wyżej, na szczycie żółty
// środek. Z boku widać schodki płatków. Rozmiar 1 - 3 x 3 piksele (dwa
// piętra), 2 - 5 x 5 (trzy piętra).

function tiers(box, x, top, z, size) {

    const layer = (y, keep, color) => {
        for (let dz = -size; dz <= size; dz++) {
            for (let dx = -size; dx <= size; dx++) {
                if (keep(Math.abs(dx), Math.abs(dz))) {
                    box(x + dx, y, z + dz, 1, 1, 1, typeof color === 'function' ? color(dx, dz) : color);
                }
            }
        }
    };
    const middle = (dx, dz) => (dx === 0 && dz === 0 ? 'center' : null);

    if (size <= 1) {
        layer(top, () => true, 'flowerDark');
        layer(top + 1, (ax, az) => ax + az <= 1, (dx, dz) => middle(dx, dz) ?? 'flower');
        return;
    }

    layer(top, (ax, az) => !(ax === 2 && az === 2), 'flowerDark');
    layer(top + 1, (ax, az) => (ax <= 1 && az <= 1) || ax + az === 2 && (ax === 0 || az === 0), 'flower');
    layer(top + 2, (ax, az) => ax + az <= 1, (dx, dz) => middle(dx, dz) ?? 'flowerLight');

}

// Oset (mikołajek): jajowata główka z kostek w kratkę (jasne i ciemne
// kwiatki na przemian), jasny czubek; pod nią płaska gwiazda kolczastych
// przysadek w 8 stron (star). Rozmiar 1 - główka 3 x 3 x 3, 2 - 3 x 3 x 4
// (szersza w środku), przysadki o piksel dłuższe od rozmiaru.

function thistle(box, x, top, z, size) {

    const checker = (dx, y, dz) => ((dx + dz + y) % 2 === 0 ? 'flower' : 'flowerDark');
    const layer = (y, plus) => {
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (plus && dx !== 0 && dz !== 0) continue;
                box(x + dx, y, z + dz, 1, 1, 1, checker(dx, y, dz));
            }
        }
    };

    if (size <= 1) {
        box(x, top, z, 1, 1, 1, 'flowerDark');
        layer(top + 1, true);
        box(x, top + 2, z, 1, 1, 1, 'flowerLight');
        return;
    }

    layer(top, true);
    layer(top + 1, false);
    layer(top + 2, true);
    box(x, top + 3, z, 1, 1, 1, 'flowerLight');

}

function star(pixel, x, z, radius) {

    DIRECTIONS.forEach(([dx, dz], direction) => {
        // Kolce po skosie o piksel krótsze - gwiazda jest okrągła.
        const length = direction % 2 ? radius - 1 : radius;
        for (let k = 1; k <= length; k++) {
            pixel(x + dx * k, z + dz * k, 'leafLight');
        }
    });

}

// ------------------------------------------------------------
// DYWAN (barwinek): roślina płożąca się po ziemi. Płaski kobierzec liści
// na całą komórkę: ciemne tło (cień między liśćmi), na nim owalne liście,
// brązowe pędy od środka na boki, wyżej kilka jaśniejszych liści
// i kwiaty-gwiazdki (albo pąki) leżące na liściach.
//
// mask - z których stron rośnie taki sam dywan (bity: 1 +x, 2 +z, 4 -x,
// 8 -z; liczy ChunkMesher): w tę stronę kobierzec sięga do samej
// krawędzi, a pęd przechodzi przez nią w stałym miejscu - u sąsiada
// zaczyna się w tym samym miejscu, więc barwinki łączą się w jeden
// dywan. Bez sąsiadów - okrągła kępka. Wszystko losowane z (odmiana,
// piksel), nie po kolei - sąsiad nie zmienia reszty kępki.
// ------------------------------------------------------------

const CARPET_SIDES = [
    { bit: 1, dx: 1, dz: 0, cross: 1 },
    { bit: 2, dx: 0, dz: 1, cross: -2 },
    { bit: 4, dx: -1, dz: 0, cross: 1 },
    { bit: 8, dx: 0, dz: -1, cross: -2 }
];

function cellRandom(variant, u, v, salt) {

    let h = Math.imul(variant + 1, 374761393) ^ Math.imul(u + 64, 668265263) ^ Math.imul(v + 64, 2246822519) ^ Math.imul(salt + 7, 3266489917);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;

}

function carpet(tuft, variant, fullMask, model) {

    const { sheet, box } = model;
    const radius = tuft.leaves.radius;
    const low = new Map();
    const high = new Map();
    const key = (u, v) => `${u},${v}`;
    const inside = (u, v) => u >= -8 && u <= 7 && v >= -8 && v <= 7;
    // Strony "otwarte" do krawędzi: sąsiad-dywan albo zasłona w dół.
    const mask = (fullMask | (fullMask >> 4) | (fullMask >> 8)) & 15;
    const side = (bit) => (mask & bit) !== 0;

    // Kształt kobierca: okrąg (postrzępiony brzeg), a w stronę sąsiada -
    // aż do krawędzi, na szerokość do sąsiednich boków (do samego rogu,
    // gdy tam też jest dywan).
    const covered = (u, v) => {
        const edge = radius + (cellRandom(variant, u, v, 1) < 0.5 ? 0 : 1);
        if (u * u + v * v <= edge * edge) return true;
        const across = (lowBit, highBit, value) => (value < 0 ? (side(lowBit) ? -8 : -edge) <= value : value <= (side(highBit) ? 7 : edge));
        if (side(1) && u >= 0 && across(8, 2, v)) return true;
        if (side(4) && u <= 0 && across(8, 2, v)) return true;
        if (side(2) && v >= 0 && across(4, 1, u)) return true;
        if (side(8) && v <= 0 && across(4, 1, u)) return true;
        return false;
    };

    // Brzeg od strony bez sąsiada postrzępiony (nie prosta linia na
    // granicy komórek), przy sąsiedzie - pełny aż do krawędzi.
    const frayed = (u, v) => [[1, 7 - u], [2, 7 - v], [4, u + 8], [8, v + 8]]
        .some(([bit, distance]) => !side(bit) && distance <= 2 && cellRandom(variant, u, v, 12) < (3 - distance) * 0.3);

    for (let v = -8; v <= 7; v++) {
        for (let u = -8; u <= 7; u++) {
            // Przy krawędzi sąsiada bez dziur - kobierce się stykają.
            const seam = (side(1) && u >= 6) || (side(4) && u <= -7) || (side(2) && v >= 6) || (side(8) && v <= -7);
            if (covered(u, v) && !frayed(u, v) && (seam || cellRandom(variant, u, v, 2) < 0.9)) {
                low.set(key(u, v), 'leafDark');
            }
        }
    }

    // Liście: owalne, po 2 piksele, poziomo albo pionowo.
    for (let v = -8; v <= 7; v++) {
        for (let u = -8; u <= 7; u++) {
            if (!low.has(key(u, v)) || cellRandom(variant, u, v, 3) > 0.42) continue;
            const along = cellRandom(variant, u, v, 4) < 0.5;
            const [u2, v2] = along ? [u + 1, v] : [u, v + 1];
            low.set(key(u, v), 'leaf');
            if (inside(u2, v2) && low.has(key(u2, v2))) low.set(key(u2, v2), 'leaf');
        }
    }

    // Pędy: od środka w kilka stron (wężykiem), w stronę sąsiada - aż
    // przez krawędź w stałym miejscu.
    const runner = (dx, dz, length, salt, cross) => {
        let u = 0, v = 0;
        for (let k = 1; k <= length; k++) {
            u += dx;
            v += dz;
            // Wężyk w poprzek, przy krawędzi sąsiada - do stałego miejsca.
            const near = cross !== null && k >= length - 3;
            if (dx !== 0) v = near ? v + Math.sign(cross - v) : v + (cellRandom(variant, k, salt, 5) < 0.25 ? (cellRandom(variant, k, salt, 6) < 0.5 ? -1 : 1) : 0);
            else u = near ? u + Math.sign(cross - u) : u + (cellRandom(variant, k, salt, 5) < 0.25 ? (cellRandom(variant, k, salt, 6) < 0.5 ? -1 : 1) : 0);
            if (!inside(u, v)) break;
            // Pęd czasem schowany pod liśćmi (przy krawędzi sąsiada - nigdy).
            if (!near && low.has(key(u, v)) && cellRandom(variant, u, v, 13) < 0.3) continue;
            low.set(key(u, v), 'stem');
        }
    };

    for (const [n, { bit, dx, dz, cross }] of CARPET_SIDES.entries()) {
        if (side(bit)) {
            runner(dx, dz, 8, n, cross);
        }
        else if (cellRandom(variant, n, 0, 7) < 0.7) {
            runner(dx, dz, Math.max(1, radius - 1), n, null);
        }
    }

    // Wyżej: kilka jaśniejszych liści (głębia kobierca).
    const leaves = Math.round(tuft.leaves.count[0] + cellRandom(variant, 0, 0, 8) * (tuft.leaves.count[1] - tuft.leaves.count[0]));
    for (let i = 0, placed = 0; i < 40 && placed < leaves * (1 + Math.min(3, popcount(mask)) * 0.5); i++) {
        const u = Math.floor(cellRandom(variant, i, 0, 9) * 15) - 8;
        const v = Math.floor(cellRandom(variant, i, 1, 9) * 15) - 8;
        if (!low.has(key(u, v)) || !low.has(key(u + 1, v))) continue;
        const color = cellRandom(variant, i, 2, 9) < 0.6 ? 'leafLight' : 'leaf';
        high.set(key(u, v), color);
        high.set(key(u + 1, v), color);
        placed++;
    }

    // Kwiaty: z listy miejsc (odmiana) te na kobiercu, nie za blisko
    // siebie ani krawędzi - w połączonym dywanie więcej kwiatów.
    const flower = tuft.flower;
    if (flower) {
        const want = Math.round(flower.count[0] + cellRandom(variant, 0, 0, 10) * (flower.count[1] - flower.count[0])) * (1 + popcount(mask) * 0.35);
        const spots = [];
        for (let i = 0; i < 16 && spots.length < want; i++) {
            const u = Math.floor(cellRandom(variant, i, 0, 11) * 12) - 6;
            const v = Math.floor(cellRandom(variant, i, 1, 11) * 12) - 6;
            if (!low.has(key(u, v)) || spots.some(([a, b]) => Math.abs(a - u) < 4 && Math.abs(b - v) < 4)) continue;
            spots.push([u, v]);
        }
        for (const [n, [u, v]] of spots.entries()) {
            const size = flower.sizes[0] === flower.sizes[1] ? flower.sizes[0] : (cellRandom(variant, n, 2, 11) < 0.5 ? flower.sizes[0] : flower.sizes[1]);
            if (flower.kind === 'pak') {
                box(u, 2, v, 1, 1, 1, 'bud');
                high.set(key(u, v), 'leaf');
            }
            else {
                starFlower(box, u, 2, v, size, n);
            }
        }
    }

    sheet(1, 0.5, ({ pixel }) => {
        for (const [cell, color] of low) {
            const [u, v] = cell.split(',').map(Number);
            pixel(u, v, color);
        }
    }, 1);

    sheet(1, 1.5, ({ pixel }) => {
        for (const [cell, color] of high) {
            const [u, v] = cell.split(',').map(Number);
            pixel(u, v, color);
        }
    }, 1);

    // Zasłony: tam, gdzie teren opada o blok, dywan spływa po boku bloku
    // pod sobą - krótko (postrzępiony brzeg), a gdy niżej rośnie dywan -
    // aż do niego (bity 8-11).
    CARPET_SIDES.forEach(({ bit }, n) => {
        if (fullMask & (bit << 8)) curtain(tuft, variant, n, true, mask, sheet);
        else if (fullMask & (bit << 4)) curtain(tuft, variant, n, false, mask, sheet);
    });

    return model.finish();

}

// Zasłona dywanu na boku bloku (strona n z CARPET_SIDES): pionowa
// płaszczyzna tuż przed ścianą (0.3 piksela), od góry w dół - ciemne tło,
// liście, pęd w tym samym miejscu co na górze (łączy się z pędem
// kobierca), czasem kwiat. Krótka: 4-8 pikseli z postrzępionym dołem;
// pełna: 16 pikseli, do dywanu niżej. Na końcach - do rogu, gdy tam też
// jest dywan albo zasłona, inaczej krócej.

function curtain(tuft, variant, n, full, open, sheet) {

    const { dx, dz, cross } = CARPET_SIDES[n];
    const axis = dx !== 0 ? 0 : 2;
    const outward = dx + dz > 0 ? 1 : -1;
    // Końce zasłony: sąsiednie strony (dla ±x: -z i +z, dla ±z: -x i +x).
    const [lowBit, highBit] = axis === 0 ? [8, 2] : [4, 1];
    const from = open & lowBit ? -8 : -tuft.leaves.radius;
    const to = open & highBit ? 7 : tuft.leaves.radius;
    const salt = 30 + n;

    sheet(axis, outward * 8.3, ({ pixel }) => {

        for (let u = from; u <= to; u++) {

            const end = u === from || u === to;
            const length = full ? 16 : 4 + Math.floor(cellRandom(variant, u, salt, 20) * 5) - (end ? 2 : 0);

            for (let k = 1; k <= length; k++) {
                if (k > 2 && k < length && cellRandom(variant, u, k + 16 * salt, 21) < 0.08) continue;
                const leaf = cellRandom(variant, u, Math.floor(k / 2) + 16 * salt, 22) < 0.42;
                pixel(u, -k, leaf ? 'leaf' : 'leafDark');
            }

        }

        // Pęd w dół - dalszy ciąg pędu z kobierca (to samo miejsce).
        const runnerLength = full ? 16 : 6;
        for (let k = 1, u = cross; k <= runnerLength; k++) {
            if (k > 3 && cellRandom(variant, k, salt, 23) < 0.2) u += cellRandom(variant, k, salt, 24) < 0.5 ? -1 : 1;
            u = Math.max(from, Math.min(to, u));
            pixel(u, -k, 'stem');
        }

        // Kwiaty na zasłonie (płasko w płaszczyźnie): krzyżyk z jasnym
        // środkiem.
        if (tuft.flower?.kind === 'gwiazdka') {
            const count = full ? 2 : 1;
            for (let i = 0; i < count; i++) {
                const u = from + 1 + Math.floor(cellRandom(variant, i, salt, 25) * Math.max(1, to - from - 1));
                const k = 2 + Math.floor(cellRandom(variant, i, salt, 26) * (full ? 12 : 2));
                pixel(u, -k, 'center');
                for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (u + a >= from && u + a <= to) pixel(u + a, -k + b, 'flowerLight');
                }
            }
        }
        else if (tuft.flower) {
            pixel(from + 2, -2, 'bud');
        }

    }, outward);

}

function popcount(mask) {

    return (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);

}

// Gwiazdka (barwinek): płaski kwiat leżący na liściach, jeden piksel
// grubości. Rozmiar 1 - krzyżyk 3 x 3, 2 - wiatraczek 5 x 5 (cztery
// płatki skręcone w jedną stronę, odbity co drugi kwiat), w środku jasna
// gwiazdka (`srodek`).

function starFlower(box, x, y, z, size, n) {

    box(x, y, z, 1, 1, 1, 'center');

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        box(x + dx, y, z + dz, 1, 1, 1, 'flowerLight');
    }

    if (size < 2) {
        return;
    }

    const flip = n % 2 ? -1 : 1;

    for (const [dx, dz] of [[2, 0], [2, flip], [-2, 0], [-2, -flip], [0, 2], [-flip, 2], [0, -2], [flip, -2]]) {
        box(x + dx, y, z + dz, 1, 1, 1, 'flower');
    }

}

// ------------------------------------------------------------
// NALOT (porosty): plama porostu na każdej ścianie komórki, za którą
// jest lity blok (mask: 1 +x, 2 +z, 4 -x, 8 -z, 16 dół, 32 góra - liczy
// ChunkMesher). Płasko, 0.3 piksela od ściany, jaśniejsze piksele o piksel
// wyżej (wypukłość). Wzór:
//   listki  - zachodzące na siebie okrągłe płatki: ciemny brzeg, jasny,
//             wypukły środek (porost liściasty - oliwkowy),
//   galazki - rozgałęzione gałązki z jasnymi, wypukłymi końcami
//             (porost krzaczkowaty - iglasty),
//   kropki  - drobne grudki skorupy w trzech odcieniach (porost
//             skorupiasty - żółta ochra).
// leaves.radius - wielkość plamy (etap wzrostu).
// ------------------------------------------------------------

const COATING_FACES = [
    { bit: 1, axis: 0, plane: 8, sign: -1 },
    { bit: 2, axis: 2, plane: 8, sign: -1 },
    { bit: 4, axis: 0, plane: -8, sign: 1 },
    { bit: 8, axis: 2, plane: -8, sign: 1 },
    { bit: 16, axis: 1, plane: 0, sign: 1 },
    { bit: 32, axis: 1, plane: 16, sign: -1 }
];

function lichenPattern(tuft, variant, face) {

    const flat = new Map();
    const raised = new Map();
    const radius = tuft.leaves.radius;
    const rnd = (a, b, salt) => cellRandom(variant, a, b, salt + face * 17);
    const ci = 8 + Math.floor(rnd(0, 0, 40) * 5) - 2;
    const cj = 8 + Math.floor(rnd(1, 0, 40) * 5) - 2;
    const inGrid = (i, j) => i >= 0 && i < 16 && j >= 0 && j < 16;
    const near = (i, j, extra = 0) => Math.hypot(i - ci, j - cj) <= radius + extra + rnd(i, j, 41) * 1.5;

    if (tuft.leaves.pattern === 'listki') {
        const lobes = Math.max(1, Math.round(radius * 1.7));
        for (let n = 0; n < lobes; n++) {
            const angle = rnd(n, 1, 42) * Math.PI * 2;
            const distance = rnd(n, 2, 42) * Math.max(0, radius - 1);
            const li = ci + Math.cos(angle) * distance, lj = cj + Math.sin(angle) * distance;
            const r = 1.4 + rnd(n, 3, 42) * 1.2;
            for (let j = Math.floor(lj - r); j <= Math.ceil(lj + r); j++) {
                for (let i = Math.floor(li - r); i <= Math.ceil(li + r); i++) {
                    if (!inGrid(i, j)) continue;
                    const d = Math.hypot(i - li, j - lj);
                    if (d > r) continue;
                    if (d < 0.8) raised.set(`${i},${j}`, 'leafLight');
                    flat.set(`${i},${j}`, d > r - 0.9 ? 'leafDark' : 'leaf');
                }
            }
        }
    }
    else if (tuft.leaves.pattern === 'galazki') {
        const roots = 2 + Math.floor(radius / 2);
        const branch = (i, j, di, dj, length, salt) => {
            for (let k = 0; k < length; k++) {
                if (!inGrid(i, j) || !near(i, j, 1)) break;
                flat.set(`${i},${j}`, 'leaf');
                if (inGrid(i + 1, j + 1) && !flat.has(`${i + 1},${j + 1}`)) flat.set(`${i + 1},${j + 1}`, 'leafDark');
                if (rnd(k, salt, 43) < 0.22 && length - k > 2) {
                    branch(i + dj, j + di, dj || di, di || dj, Math.ceil((length - k) / 2), salt * 7 + k);
                }
                if (rnd(k, salt, 44) < 0.3) [di, dj] = rnd(k, salt, 45) < 0.5 ? [di, dj || 1] : [di || 1, dj];
                i += di;
                j += dj;
            }
            if (inGrid(i - di, j - dj)) raised.set(`${i - di},${j - dj}`, 'leafLight');
        };
        const steps = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
        for (let n = 0; n < roots; n++) {
            const [di, dj] = steps[Math.floor(rnd(n, 5, 46) * 8)];
            branch(ci, cj, di, dj, radius + 2, n + 1);
        }
    }
    else {
        for (let j = 0; j < 16; j++) {
            for (let i = 0; i < 16; i++) {
                if (!near(i, j)) continue;
                const grain = rnd(i >> 1, j >> 1, 47);
                if (grain < 0.35) continue;
                const color = grain < 0.6 ? 'leafDark' : grain < 0.85 ? 'leaf' : 'leafLight';
                flat.set(`${i},${j}`, color);
                if (color === 'leafLight' && rnd(i, j, 48) < 0.4) raised.set(`${i},${j}`, 'leafLight');
            }
        }
    }

    return { flat, raised };

}

function coating(tuft, variant, mask, model) {

    const { sheet } = model;

    COATING_FACES.forEach(({ bit, axis, plane, sign }, face) => {

        if (!(mask & bit)) return;

        const { flat, raised } = lichenPattern(tuft, variant, face);

        // Siatka 16 x 16 -> współrzędne ściany: na ścianach bocznych u to
        // oś wzdłuż ściany (-8..7), v - wysokość (0..15); na dole i górze
        // u = x, v = z (-8..7).
        const draw = (cells, offset) => sheet(axis, plane + sign * offset, ({ pixel }) => {
            for (const [cell, color] of cells) {
                const [i, j] = cell.split(',').map(Number);
                pixel(i - 8, axis === 1 ? j - 8 : j, color);
            }
        }, sign);

        draw(flat, 0.3);
        draw(raised, 1);

    });

    return model.finish();

}

// ------------------------------------------------------------
// HUBA (grzyby półkowe): półki wyrastające z boku pnia. Ściana z maski
// (bity 1 +x, 2 +z, 4 -x, 8 -z - lity blok obok); przy kilku - wybór
// z odmiany. Półka: pół-elipsa z kostek, wierzch w słojach (jasny brzeg,
// ciemniejsze pasy, ciemna nasada przy pniu), spód kremowy (pory),
// leaves.count - ile półek (na różnych wysokościach), leaves.length -
// promień półki w pikselach.
// ------------------------------------------------------------

function bracket(tuft, variant, mask, model) {

    const { box } = model;
    const walls = CARPET_SIDES.filter(({ bit }) => mask & bit);
    const { dx, dz } = walls[Math.floor(cellRandom(variant, 0, 0, 50) * walls.length)];
    const rnd = (a, b) => cellRandom(variant, a, b, 51);
    const shelves = tuft.leaves.count[0] + Math.floor(rnd(0, 1) * (tuft.leaves.count[1] - tuft.leaves.count[0] + 1));
    const used = [];

    for (let n = 0; n < shelves; n++) {

        const r = tuft.leaves.length[0] + Math.floor(rnd(n, 2) * (tuft.leaves.length[1] - tuft.leaves.length[0] + 1)) - (n > 0 ? 1 : 0);
        let y = 3 + Math.floor(rnd(n, 3) * 10);
        if (used.some((other) => Math.abs(other - y) < 3)) y = Math.min(13, Math.max(...used) + 3);
        used.push(y);
        const along = Math.floor(rnd(n, 4) * 7) - 3;
        const depth = Math.max(2, Math.round(r * 0.8));

        for (let b = 0; b < depth; b++) {
            for (let a = -r; a <= r; a++) {
                const d = Math.hypot(a / r, b / depth);
                if (d > 1) continue;
                const color = d > 0.9 ? 'flowerLight' : d > 0.74 ? 'flower' : d > 0.56 ? 'flowerDark' : d > 0.36 ? 'flower' : 'stem';
                // Od ściany do środka komórki (ściana +x: x = 7, 6, ...).
                const u = Math.max(-8, Math.min(7, along + a));
                const x = dx > 0 ? 7 - b : dx < 0 ? -8 + b : u;
                const z = dz > 0 ? 7 - b : dz < 0 ? -8 + b : u;
                box(x, y, z, 1, 1, 1, color);
                if (d < 0.6) box(x, y - 1, z, 1, 1, 1, 'leafLight');
            }
        }

    }

    return model.finish();

}

export function makeTuftTemplate(tuft, variant, mask = 0) {

    const random = randomFor(40503 + variant * 7919 + tuft.seed);
    const between = ([low, high]) => low + Math.floor(random() * (high - low + 1));
    const height = tuft.height / 16;
    const model = createPixelPlant(tuft.colors, false, 0, Math.max(0.3, height));
    const { sheet, box } = model;


    // Wysokość liści przy ziemi - liście łodyg zaczynają się nad nią.
    let foliage = 1;

    // Płaskie liście (z łodyg i z brzegu krzaka): [x, y, z, kierunek, długość].
    const stemLeaves = [];

    if (tuft.leaves.layout === 'dywan') {
        return soften(carpet(tuft, variant, mask, model));
    }

    if (tuft.leaves.layout === 'nalot') {
        return soften(coating(tuft, variant, mask || 16, model));
    }

    if (tuft.leaves.layout === 'huba') {
        return soften(bracket(tuft, variant, mask & 15 || 8, model));
    }

    if (tuft.leaves.layout === 'kepa') {
        mound(tuft, variant, random, between, model);
    }
    else if (tuft.leaves.layout === 'krzak') {
        // Krzak (piwonia): wysoka kopułka liści z kostek - spód w cieniu,
        // wierzch jaśniejszy, nad nią liście łodyg i kwiaty.
        const layers = between(tuft.leaves.length);
        foliage = layers;
        const core = Math.max(1, tuft.leaves.radius);
        dome(box, random, core, layers, (y) => (y === 0 ? 'leafDark' : y === layers - 1 ? 'leafLight' : 'leaf'), 'leaf');

        // Liście wystające z boków kopułki na różnych wysokościach - krzak
        // ma postrzępiony, liściasty brzeg, nie gładką poduszkę.
        const around = 4 + core;
        const first = Math.floor(random() * 8);
        for (let i = 0; i < around; i++) {
            const direction = (first + Math.round(i * 8 / around)) % 8;
            const [dx, dz] = DIRECTIONS[direction];
            const y = Math.min(layers - 1, 1 + Math.floor(random() * Math.max(1, layers - 1)));
            const r = core * Math.sqrt(1 - (y / layers) ** 2) * (dx !== 0 && dz !== 0 ? 0.7 : 1);
            stemLeaves.push([Math.round(dx * r), y, Math.round(dz * r), direction, tuft.leaves.edge]);
        }
    }
    else if (tuft.leaves.layout === 'rozeta') {
        // Rozeta: przyziemne liście - płaska gwiazda z pikseli tuż nad ziemią
        // (gracz patrzy na małe rośliny z góry), w środku kilka kostek.
        // Płaska warstwa łączy się w kilka prostokątów - mało ścian.

        const blades = between(tuft.leaves.count);
        const directions = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
        const first = Math.floor(random() * 8);

        sheet(1, 1, ({ pixel }) => {
            for (let i = 0; i < blades; i++) {
                const [dx, dz] = directions[(first + Math.round(i * 8 / blades)) % 8];
                const length = between(tuft.leaves.length);
                const shade = (i + variant) % 2 ? 'leaf' : 'leafLight';
                for (let k = 1; k <= length; k++) {
                    pixel(dx * k, dz * k, k === length ? 'leafLight' : shade);
                    // Szersza nasada liścia przy środku.
                    if (k === 1 && dx !== 0 && dz !== 0) pixel(dx, 0, shade);
                }
            }
        });

        box(0, 0, 0, 1, 2, 1, 'leafDark', 'leaf');

        // Kilka liści stojących - kępka ma objętość, nie tylko gwiazdę na ziemi.
        const upright = tuft.leaves.length[1] + 1;
        for (const axis of [2, 0]) {
            sheet(axis, 0, ({ leaf }) => {
                leaf(-1, 0, -between([1, 3]), upright - Math.floor(random() * 2), 'leafLight');
                leaf(0, 0, between([1, 3]), upright - Math.floor(random() * 2), 'leaf');
            });
        }
    }


    // Łodygi w różnych miejscach kępki (bez dwóch w jednym miejscu).

    const stems = between(tuft.stems.count);
    const radius = tuft.stems.radius;
    const spots = [];

    for (let z = -radius; z <= radius; z++) {
        for (let x = -radius; x <= radius; x++) {
            if (x * x + z * z <= radius * radius + 1) {
                spots.push([x, z]);
            }
        }
    }

    for (let i = 0; i < stems && spots.length > 0; i++) {

        const [x, z] = spots.splice(Math.floor(random() * spots.length), 1)[0];

        // Sąsiednie miejsca też odpadają - kwiaty się nie zlewają.
        for (let k = spots.length - 1; k >= 0; k--) {
            if (Math.abs(spots[k][0] - x) <= 1 && Math.abs(spots[k][1] - z) <= 1) {
                spots.splice(k, 1);
            }
        }

        const top = between(tuft.stems.height);

        // Łodyga rozchylona: zaczyna się w kępie (bliżej środka niż jej
        // szczyt) i schodkami (piksel po pikselu) odchyla się na swoje
        // miejsce - wachlarz osobnych łodyg jak u lawendy.
        const at = (y) => {
            if (!tuft.stems.spread) return [x, z];
            const t = (y / Math.max(1, top - 1)) ** 0.8;
            return [Math.round(x * (0.4 + 0.6 * t)), Math.round(z * (0.4 + 0.6 * t))];
        };

        if (tuft.stems.spread) {
            for (let y = 0; y < top; y++) {
                const [sx, sz] = at(y);
                box(sx, y, sz, 1, 1, 1, 'stem');
            }
        }
        else {
            box(x, 0, z, 1, top, 1, 'stem');
        }

        if (tuft.stems.leaves?.whorl) {

            // Okółek (zawilec): kilka liści na jednej wysokości (ok. 0.55
            // łodygi), rozłożonych dookoła - jak parasolka pod kwiatem.
            const { whorl, length } = tuft.stems.leaves;
            const y = Math.max(1, Math.round(top * 0.55));
            const [sx, sz] = at(y);
            const first = Math.floor(random() * 8);
            for (let k = 0; k < whorl; k++) {
                stemLeaves.push([sx, y, sz, (first + Math.round(k * 8 / whorl)) % 8, between(length)]);
            }

        }
        else if (tuft.stems.leaves) {

            // Liście na łodydze (piwonia): co kilka pikseli liść w inną
            // stronę (obrót o 3/8), niżej dłuższe. Naprzeciwległe (cynia):
            // na każdym piętrze para liści w przeciwne strony, następna
            // para obrócona o ćwierć obrotu - na krzyż.
            const { every, length, opposite } = tuft.stems.leaves;
            let turn = Math.floor(random() * 8);
            for (let y = Math.max(1, foliage - 1) + Math.floor(random() * every); y < top - 2; y += every) {
                const [sx, sz] = at(y);
                const size = Math.max(1, between(length) - (y > top * 0.6 ? 1 : 0));
                stemLeaves.push([sx, y, sz, turn % 8, size]);
                if (opposite) {
                    stemLeaves.push([sx, y, sz, (turn + 4) % 8, size]);
                }
                turn += opposite ? 2 : 3;
            }

        }
        else if (!tuft.stems.spread) {

            // Listki na łodydze: najwyżej dwa piksele, z dwóch stron.
            for (let y = 2 + Math.floor(random() * 2), side = random() < 0.5 ? -1 : 1, n = 0; y < top - 1 && n < 2; y += 3, side = -side, n++) {
                if (random() < 0.5) box(x + side, y, z, 1, 1, 1, 'leafLight');
                else box(x, y, z + side, 1, 1, 1, 'leaf');
            }

        }

        const flower = tuft.flower;

        if (!flower) {
            continue;
        }

        // Rozmiar losowany tylko przy zakresie - stałe kępki (kocanka,
        // lawenda) wyglądają tak samo jak dotąd.
        const size = flower.sizes[0] === flower.sizes[1] ? flower.sizes[0] : between(flower.sizes);

        if (flower.kind === 'pak') {
            // Pąk: jeden piksel albo (rozmiar 2) okrągły pąk - krzyżyk
            // z kostek i jaśniejszy czubek.
            box(x, top, z, 1, 1, 1, 'bud');
            if (size >= 2) {
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) box(x + dx, top, z + dz, 1, 1, 1, 'bud');
                box(x, top + 1, z, 1, 1, 1, 'flowerLight');
            }
            continue;
        }

        if (flower.kind === 'straczki') {
            // Strąki (gorczyca): na górze łodygi strąki na krótkich
            // szypułkach, ukosem w górę i na zewnątrz, co 2 piksele
            // w inną stronę, na czubku łodygi strąk prosto w górę.
            let turn = Math.floor(random() * 4);
            for (let k = 0; k < size; k++) {
                const y = top - 1 - 2 * k;
                if (y < Math.max(2, foliage)) break;
                const [dx, dz] = DIRECTIONS[(turn % 4) * 2];
                const [sx, sz] = at(y);
                box(sx + dx, y, sz + dz, 1, 1, 1, 'bud');
                box(sx + dx, y + 1, sz + dz, 1, 1, 1, 'bud');
                box(sx + 2 * dx, y + 2, sz + 2 * dz, 1, 1, 1, 'flowerLight');
                turn += 1 + (random() < 0.5 ? 1 : 0);
            }
            box(x, top, z, 1, 1, 1, 'bud');
            box(x, top + 1, z, 1, 1, 1, 'bud');
            box(x, top + 2, z, 1, 1, 1, 'flowerLight');
            continue;
        }

        if (flower.kind === 'torebka') {
            // Torebka nasienna (len): kulka na szczycie łodygi - rozmiar 1:
            // jeden piksel, 2: ciemny spód, krzyżyk, jasny czubek.
            box(x, top, z, 1, 1, 1, 'bud');
            if (size >= 2) {
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) box(x + dx, top + 1, z + dz, 1, 1, 1, 'bud');
                box(x, top + 1, z, 1, 1, 1, 'bud');
                box(x, top + 2, z, 1, 1, 1, 'flowerLight');
            }
            continue;
        }

        if (flower.kind === 'klos' && flower.whorls) {
            whorledSpike(box, x, top, z, size);
            continue;
        }

        if (flower.kind === 'klos') {
            spike(box, random, x, top, z, size);
            continue;
        }

        if (flower.kind === 'pompon') {
            pompon(box, x, top, z, size);
            continue;
        }

        if (flower.kind === 'dzwonek') {
            // Dzwonki: na szczycie łodygi zielony czubek, pod nim na
            // krótkich, zagiętych szypułkach zwisające dzwonki - co 4
            // piksele w dół, pierwszy na zewnątrz kępy, następne na boki.
            box(x, top, z, 1, 1, 1, 'leafLight');
            const out = Math.abs(x) >= Math.abs(z)
                ? (x === 0 ? Math.floor(random() * 4) * 2 : (x > 0 ? 0 : 4))
                : (z > 0 ? 2 : 6);
            const sides = [out, (out + 2) % 8, (out + 6) % 8];
            if (random() < 0.5) sides.reverse().unshift(sides.pop());
            for (let k = 0, p = top - 2; k < 3 && p - (size + 2) >= Math.max(1, foliage - 1) && p >= top * 0.45; k++, p -= 4) {
                const [dx, dz] = DIRECTIONS[sides[k]];
                const [sx, sz] = at(p + 1);
                box(sx + dx, p + 1, sz + dz, 1, 1, 1, 'stem');
                box(sx + 2 * dx, p + 1, sz + 2 * dz, 1, 1, 1, 'stem');
                bell(box, sx + 2 * dx, p, sz + 2 * dz, size);
            }
            continue;
        }

        if (flower.kind === 'oset') {
            // Główka na gwieździe kolczastych przysadek (płaska gwiazda
            // w połowie najniższego piętra główki - jak liście łodyg).
            thistle(box, x, top, z, size);
            stemLeaves.push([x, top, z, -1, size + 1]);
            continue;
        }

        if (flower.kind === 'warstwy') {
            tiers(box, x, top, z, size);
            continue;
        }

        if (flower.kind === 'talerz') {
            // Na zewnątrz kępy (główna oś), ze środka - w losową stronę.
            const [fx, fz] = Math.abs(x) >= Math.abs(z)
                ? [x === 0 ? (random() < 0.5 ? -1 : 1) : Math.sign(x), 0]
                : [0, Math.sign(z)];
            dish(box, x, top, z, size, fx, fz);
            continue;
        }

        // Baldach: kopułka z kostek - dolna warstwa krzyżyk (albo romb),
        // jeden koszyczek ciemniejszy (cień), górna warstwa jaśniejsza.
        // Jeden kolor na warstwę - ściany łączą się w większe prostokąty.
        const shadow = Math.floor(random() * 4);
        let arm = 0;
        for (let dz = -size; dz <= size; dz++) {
            for (let dx = -size; dx <= size; dx++) {
                const far = Math.abs(dx) + Math.abs(dz);
                if (far > size || (size === 2 && far === 2 && random() < 0.35)) continue;
                box(x + dx, top, z + dz, 1, 1, 1, far === 1 && arm++ === shadow ? 'flowerDark' : 'flower');
            }
        }
        for (let dz = -(size - 1); dz <= size - 1; dz++) {
            for (let dx = -(size - 1); dx <= size - 1; dx++) {
                if (Math.abs(dx) + Math.abs(dz) > size - 1) continue;
                box(x + dx, top + 1, z + dz, 1, 1, 1, 'flowerLight');
            }
        }

    }

    // Liście łodyg: płaskie, poziome (gracz patrzy z góry) - wszystkie
    // liście na jednej wysokości w jednej płaszczyźnie, w połowie piksela
    // łodygi (wyrastają z jej boku).
    const levels = new Map();

    for (const leaf of stemLeaves) {
        if (!levels.has(leaf[1])) levels.set(leaf[1], []);
        levels.get(leaf[1]).push(leaf);
    }

    for (const [y, leaves] of levels) {
        sheet(1, y + 0.5, ({ pixel }) => {
            for (const [sx, , sz, direction, size] of leaves) {
                if (direction < 0) star(pixel, sx, sz, size);
                else compoundLeaf(pixel, sx, sz, direction, size);
            }
        });
    }

    return soften(model.finish());

}

// Światło jak na zwykłych roślinach (płaszczyznach z normalną w górę):
// boki kostek dostają normalną odchyloną mocno w górę, więc mała kępka
// nie ciemnieje, gdy słońce jest za nią - kształt dalej widać dzięki
// jaśniejszym i ciemniejszym pikselom.

function soften(faces) {

    return faces.map((face) => {
        const [x, y, z] = face.normal;
        const length = Math.hypot(x * 0.45, y + 1.4, z * 0.45);
        return { ...face, normal: [x * 0.45 / length, (y + 1.4) / length, z * 0.45 / length] };
    });

}
