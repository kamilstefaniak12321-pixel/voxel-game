import { SEA_LEVEL, WORLD_BORDER } from '../../config.js';

import { Noise } from '../Noise.js';

import { RIVERS } from './TerrainShape.js';

import { DETAIL_MACRO } from './RealisticGenerator.js';

// ------------------------------------------------------------
// RZEKI I JEZIORA (generator realistyczny)
//
// 1. MAKRORZEŹBA NA SIATCE: wysokość terenu bez wzgórz i pagórków
//    (RealisticGenerator.compute z DETAIL_MACRO) co RIVERS.cell bloków.
//    Na niej woda spływa: z każdej kratki do sąsiedniej, do której jest
//    najbardziej stromo w dół. Dzięki temu rzeka płynie zawsze w dół
//    zbocza (dnem doliny), a nie w poprzek.
//
// 2. ZAGŁĘBIENIA: kratka bez niższego sąsiada to dno zagłębienia. Woda
//    wypełnia je od najniższego miejsca w górę (zalewanie po kolei
//    najniższych kratek brzegu), aż znajdzie przelew - kratkę niższą niż
//    woda. Tak powstaje jezioro z płaską taflą na poziomie przelewu,
//    a rzeka wypływa z niego dalej. Zagłębienie płytsze niż
//    RIVERS.lakeMinDepth rzeka przecina (bez jeziora), a za duże
//    (RIVERS.lakeMaxCells) zostaje jeziorem bez odpływu - rzeka tam się
//    kończy.
//
// 3. ŹRÓDŁA: najwyżej jedno na kwadrat RIVERS.sourceSpacing (losowo, ale
//    zawsze tak samo dla tego seeda; wyżej - częściej). Ze źródła
//    rzeka spływa aż do morza albo do jeziora bez odpływu. Rzeki, które
//    się spotkają, płyną dalej razem (dopływy) - im więcej źródeł nad
//    danym miejscem, tym szersza rzeka. Źródło, z którego woda nie
//    dociera do morza ani jeziora w promieniu RIVERS.maxLength, jest
//    pomijane - dzięki temu każdy chunk wie, które źródła mogą do
//    niego dopłynąć (wszystkie bliżej niż ten promień), i rzeki pasują
//    na granicach chunków, bez względu na kolejność generowania.
//
// 4. KORYTO: przez środki kratek prowadzimy gładką krzywą (zaokrąglone
//    zakręty), na płaskim terenie wyginaną w meandry. Poziom wody spada
//    wzdłuż rzeki (nigdy nie rośnie) - do jeziora wpływa równo z taflą,
//    do morza na poziomie morza. Przy rzece (i jeziorze) wzgórza
//    wygładzają się do makrorzeźby, brzegi opadają łagodnie do wody, a
//    tuż przy korycie teren jest co najmniej na poziomie wody - woda nie
//    wylewa się i nie stoi "ścianą".
//
// Wszystko liczy się tylko z seeda i położenia - po kawałku, gdy jest
// potrzebne (obszary ZONE x ZONE bloków), i zostaje w pamięci.
// Opis: docs/rzeki.md.
// ------------------------------------------------------------

const CELL = RIVERS.cell;
const HALF = CELL / 2;

// Kafelek pamięci wysokości (kratek na bok).
const TILE = 64;

// Obszar przygotowywany naraz (bloki) i kratka indeksu odcinków koryta.
const ZONE = 256;
const BIN = 16;
const BINS = ZONE / BIN;

// Jak daleko od dna może sięgać jezioro (bloki) - większe kończy się
// jak jezioro bez odpływu.
const LAKE_REACH = 1024;

// Pas wokół jeziora, w którym wzgórza wygładzają się nisko nad taflą.
const LAKE_SHORE = 3 * CELL;

// Woda jeziora sięga w kratki brzegu najwyżej tyle bloków od kratek
// jeziora (Rivers.shape).
const LAKE_RIM = 6;

// Rzeka wpływa do jeziora (i wypływa z niego) od miejsca, gdzie woda
// jest tak głęboka (bloki) - trace.
const LAKE_ENTRY_DEPTH = 2;

// Ile kratek rzeki przed jeziorem (za jeziorem) płynie do niego (z niego).
const LAKE_RUN_CELLS = 3;

// Najwięcej kroków rzeki (kratek).
const MAX_STEPS = Math.ceil(RIVERS.maxLength / CELL) * 3;

// Zasięg wpływu koryta: najszersza rzeka, brzegi, meandry.
const INFLUENCE = RIVERS.halfWidth[1] + RIVERS.bank + 2;
const MARGIN = INFLUENCE + RIVERS.meander + CELL * 2 + LAKE_SHORE;

// Źródła sprawdzane przy przygotowaniu obszaru: wszystkie, z których
// rzeka mogłaby tu dopłynąć (albo do jeziora, które tu sięga).
const TRACE_RADIUS = RIVERS.maxLength + LAKE_REACH + ZONE + MARGIN;

// Daleki teren: rzeki i jeziora tylko w kratkach do tylu bloków (dalej
// i tak są węższe niż kratka, a liczenie rzek tak daleko kosztuje).
const MAX_SPACING = 32;

// down(): kratka morza i dno zagłębienia.
const SEA = -2;
const PIT = -1;

// 8 sąsiadów: [di, dj, odległość].
const NEIGHBORS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
];


const NO_LAKES = [];


// Jak bardzo teren (i poziom rzeki) może być niżej niż tafla jeziora
// d bloków za jego wodą: na początku o blok co 2 bloki, po 8 blokach
// o blok co blok.

function lakeRamp(d) {

    return d <= 0 ? 0 : d / 2 + Math.max(0, d - 8) / 2;

}


// Odległość od jeziora z listy near ([jezioro, odległość, ...]) albo
// Infinity.

function nearEdge(near, lake) {

    if (!lake || lake.shallow) {
        return Infinity;
    }

    for (let n = 0; n < near.length; n += 2) {

        if (near[n] === lake) {
            return Math.max(0, near[n + 1] < 0 ? -1 - near[n + 1] : near[n + 1]);
        }

    }

    return Infinity;

}


function key(i, j) {

    return (i + 4096) * 8192 + (j + 4096);

}

function keyI(k) {

    return Math.floor(k / 8192) - 4096;

}

function keyJ(k) {

    return (k % 8192) - 4096;

}


function smoothstep(edge0, edge1, value) {

    const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}


// Liczba 0-1 zawsze taka sama dla (seed, x, z, salt).

function hash01(seed, x, z, salt) {

    let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1)) | 0;

    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;

    return (h >>> 0) / 4294967296;

}


// Kopiec (najniższy na wierzchu) do zalewania zagłębień.

class MinHeap {

    constructor() {
        this.values = [];
        this.keys = [];
    }

    get size() {
        return this.values.length;
    }

    push(value, k) {

        const values = this.values;
        const keys = this.keys;

        let n = values.length;

        values.push(value);
        keys.push(k);

        while (n > 0) {

            const parent = (n - 1) >> 1;

            if (values[parent] <= value) {
                break;
            }

            values[n] = values[parent];
            keys[n] = keys[parent];

            n = parent;

        }

        values[n] = value;
        keys[n] = k;

    }

    // Zwraca klucz najniższego; jego wartość - w this.popped.

    pop() {

        const values = this.values;
        const keys = this.keys;

        const topValue = values[0];
        const topKey = keys[0];

        const lastValue = values.pop();
        const lastKey = keys.pop();

        const size = values.length;

        if (size > 0) {

            let n = 0;

            while (true) {

                const left = n * 2 + 1;

                if (left >= size) {
                    break;
                }

                const right = left + 1;

                const child = right < size && values[right] < values[left] ? right : left;

                if (values[child] >= lastValue) {
                    break;
                }

                values[n] = values[child];
                keys[n] = keys[child];

                n = child;

            }

            values[n] = lastValue;
            keys[n] = lastKey;

        }

        this.popped = topValue;

        return topKey;

    }

}

// ------------------------------------------------------------

export class Rivers {

    // generator - RealisticGenerator (makrorzeźba), seed - liczba.

    constructor(generator, seed) {

        this.generator = generator;

        this.seed = Math.imul(seed ^ 0x5bd1e995, 0x2545f491) >>> 0;

        this.meanderNoise = new Noise((this.seed + 0x68e31da4) >>> 0);


        // Wysokość makrorzeźby w kratkach: kafelki TILE x TILE.

        this.tiles = new Map();

        this.macroSample = {};

        this.lastSea = false;


        // Spływ: kratka -> niższa sąsiednia (albo SEA / PIT).

        this.downs = new Map();

        // Jeziora: dno -> jezioro; kratka -> jezioro (widoczne).

        this.pitLakes = new Map();

        this.lakes = [];


        // Źródła: klucz kwadratu źródeł -> true (rzeka) / false (brak).

        this.sources = new Map();

        // Rzeki: odcinki między jeziorami (runs) - kratki po kolei.

        this.runs = [];

        // Kratki rzek: liczba źródeł powyżej, poziom wody, spadek.

        this.counts = new Map();
        this.levels = new Map();
        this.slopes = new Map();


        // Przygotowane obszary: klucz -> { segments, bins, lakes }.

        this.zones = new Map();

        this.lastZone = null;
        this.lastZoneKey = NaN;

    }

    // --------------------------------------------------------
    // MAKRORZEŹBA NA SIATCE
    // --------------------------------------------------------

    // Wysokość (y) makrorzeźby w środku kratki (i, j); this.lastSea -
    // czy to morze. Poza granicą świata - bardzo wysoko (nic tam nie
    // spływa).

    height(i, j) {

        const ti = Math.floor(i / TILE);
        const tj = Math.floor(j / TILE);

        const tk = ti * 4096 + tj;

        let tile = this.tiles.get(tk);

        if (!tile) {

            tile = {
                h: new Float32Array(TILE * TILE).fill(NaN),
                sea: new Uint8Array(TILE * TILE)
            };

            this.tiles.set(tk, tile);

        }

        const n = (i - ti * TILE) * TILE + (j - tj * TILE);

        let value = tile.h[n];

        if (value !== value) {

            const x = i * CELL + HALF;
            const z = j * CELL + HALF;

            if (Math.abs(x) >= WORLD_BORDER || Math.abs(z) >= WORLD_BORDER) {
                value = 1e6;
            }
            else {

                const sample = this.generator.compute(x, z, DETAIL_MACRO, this.macroSample);

                value = sample.macro;

                tile.sea[n] = sample.ocean ? 1 : 0;

            }

            tile.h[n] = value;

        }

        this.lastSea = tile.sea[n] === 1;

        // Ta sama precyzja przy pierwszej i kolejnych wizytach. Progi
        // zalewania jezior nie mogą zależeć od kolejności próbkowania.
        return tile.h[n];

    }


    heightOf(k) {

        return this.height(keyI(k), keyJ(k));

    }


    // Dokąd spływa woda z kratki k: sąsiednia kratka (najbardziej
    // stromo w dół), SEA (to morze) albo PIT (dno zagłębienia).

    down(k) {

        let next = this.downs.get(k);

        if (next !== undefined) {
            return next;
        }

        const i = keyI(k);
        const j = keyJ(k);

        const h = this.height(i, j);

        if (this.lastSea) {
            next = SEA;
        }
        else {

            next = PIT;

            let steepest = 0;

            for (const [di, dj, distance] of NEIGHBORS) {

                const slope = (h - this.height(i + di, j + dj)) / distance;

                if (slope > steepest) {
                    steepest = slope;
                    next = key(i + di, j + dj);
                }

            }

        }

        this.downs.set(k, next);

        return next;

    }

    // --------------------------------------------------------
    // JEZIORA
    // --------------------------------------------------------

    // Jezioro w zagłębieniu z dnem w kratce pit: zalewamy kratki od
    // najniższej, aż któraś sąsiednia będzie niższa niż woda (przelew).
    // Wynik (zapamiętany): { level (y tafli, z ułamkiem), cells (Set),
    // outlet, outletFrom (przelew i kratka jeziora przed nim, albo null),
    // depth, shallow, route (płytkie: droga od dna do przelewu), bbox }.

    lakeFor(pit) {

        let lake = this.pitLakes.get(pit);

        if (lake) {
            return lake;
        }

        const heap = new MinHeap();

        const parent = new Map();

        const visited = new Set([pit]);

        const pitI = keyI(pit);
        const pitJ = keyJ(pit);

        const bottom = this.heightOf(pit);

        let level = bottom;

        const cells = [];

        let outlet = null;
        let outletFrom = null;

        heap.push(bottom, pit);


        while (heap.size > 0) {

            const k = heap.pop();

            const h = heap.popped;

            this.heightOf(k);

            // Niżej niż woda: przelew - jeśli woda stąd spływa do morza albo
            // do głębszego zagłębienia. Jeśli wraca do tego (albo do
            // płytszego, które przelewa się z powrotem tutaj) - to jedno
            // jezioro: kratka jest pod wodą, zalewamy dalej.

            if (this.lastSea || (h < level && this.drainsBelow(k, bottom, visited))) {

                outlet = k;
                outletFrom = parent.get(k);

                break;

            }

            level = Math.max(level, h);

            cells.push(k);

            const i = keyI(k);
            const j = keyJ(k);

            // Za duże (albo za daleko od dna) - jezioro bez odpływu; tafla
            // nie wyżej niż najniższa kratka brzegu.

            if (
                cells.length >= RIVERS.lakeMaxCells ||
                Math.max(Math.abs(i - pitI), Math.abs(j - pitJ)) * CELL > LAKE_REACH - CELL
            ) {

                if (heap.size > 0 && heap.values[0] < level) {
                    level = heap.values[0];
                }

                break;

            }

            for (const [di, dj] of NEIGHBORS) {

                const n = key(i + di, j + dj);

                if (!visited.has(n)) {

                    visited.add(n);

                    parent.set(n, k);

                    heap.push(this.heightOf(n), n);

                }

            }

        }


        const depth = level - bottom;

        lake = {
            id: this.lakes.length,
            pit,
            level,
            cells: new Set(cells),
            outlet,
            outletFrom,
            outletRoute: outletFrom === null ? [] : [outletFrom],
            depth,
            shallow: depth < RIVERS.lakeMinDepth && outlet !== null,
            route: null,
            visible: false,
            minX: Infinity,
            minZ: Infinity,
            maxX: -Infinity,
            maxZ: -Infinity
        };

        if (!lake.shallow && depth >= RIVERS.lakeMinDepth) {

            // Historia szukania przelewu zawiera także suche siodła
            // oraz odwiedzone za nimi części innych zagłębień. Nie są
            // one wodą tego jeziora: dawały łańcuchy osobnych basenów
            // o obrysach kratek 16 x 16. Tafla zalewa tylko spójny
            // obszar od dna, poniżej rzeczywistego poziomu bloków wody.
            const flooded = lake.cells;
            const wet = new Set();
            const pending = [pit];
            const waterLevel = Math.floor(level);

            while (pending.length > 0) {

                const k = pending.pop();

                if (wet.has(k) || !flooded.has(k) || this.heightOf(k) >= waterLevel) {
                    continue;
                }

                wet.add(k);

                for (const [di, dj] of NEIGHBORS) {
                    pending.push(key(keyI(k) + di, keyJ(k) + dj));
                }

            }

            lake.cells = wet;

            // Koryto musi nadal łączyć wodę z przelewem, nawet gdy
            // między nimi leżą usunięte z tafli suche kratki. Droga
            // zalewania już prowadzi od przelewu do dna; zachowujemy
            // jej odcinek do pierwszej naprawdę zalanej kratki.
            if (outlet !== null) {

                const route = [];
                let k = outletFrom;

                while (k !== undefined && !wet.has(k)) {
                    route.push(k);
                    k = parent.get(k);
                }

                route.push(k);
                lake.outletFrom = k;
                lake.outletRoute = route.reverse();

            }

        }

        for (const k of lake.cells) {

            const x = keyI(k) * CELL;
            const z = keyJ(k) * CELL;

            lake.minX = Math.min(lake.minX, x - CELL);
            lake.minZ = Math.min(lake.minZ, z - CELL);
            lake.maxX = Math.max(lake.maxX, x + 2 * CELL);
            lake.maxZ = Math.max(lake.maxZ, z + 2 * CELL);

        }


        // Płytkie: rzeka przechodzi przez zagłębienie drogą zalewania
        // (od dna do przelewu).

        if (lake.shallow) {

            const route = [outlet];

            let k = outletFrom;

            while (k !== undefined && k !== pit) {
                route.push(k);
                k = parent.get(k);
            }

            route.push(pit);

            lake.route = route.reverse();

        }


        this.lakes.push(lake);

        this.pitLakes.set(pit, lake);

        return lake;

    }

    // Czy woda z kratki k spływa (najbardziej stromo w dół) do morza albo
    // do zagłębienia z dnem niżej niż bottom, poza zalanymi kratkami.

    drainsBelow(k, bottom, flooded) {

        let current = k;

        for (let step = 0; step < MAX_STEPS; step++) {

            const next = this.down(current);

            if (next === SEA) {
                return true;
            }

            if (next === PIT) {
                return !flooded.has(current) && this.heightOf(current) < bottom;
            }

            current = next;

        }

        return false;

    }

    // --------------------------------------------------------
    // ŹRÓDŁA I BIEG RZEKI
    // --------------------------------------------------------

    // Bieg wody z kratki source: odcinki (runs) - kratki po kolei,
    // przerwane jeziorami (rzeka kończy się na pierwszej kratce
    // jeziora, a dalej płynie od przelewu). end: 'sea', 'lake' (jezioro
    // bez odpływu), albo 'far' / 'loop' / 'long' (nie dociera).

    trace(source, sx, sz) {

        const runs = [];

        const lakes = [];

        const seen = new Set();

        const pits = new Set();

        let run = [];

        let current = source;

        let end = 'long';

        let lakeEnd = null;


        for (let step = 0; step < MAX_STEPS; step++) {

            if (seen.has(current)) {
                end = 'loop';
                break;
            }

            seen.add(current);

            const cx = keyI(current) * CELL + HALF;
            const cz = keyJ(current) * CELL + HALF;

            if (Math.hypot(cx - sx, cz - sz) > RIVERS.maxLength) {
                end = 'far';
                break;
            }

            run.push(current);

            const next = this.down(current);

            if (next === SEA) {
                end = 'sea';
                break;
            }

            if (next !== PIT) {
                current = next;
                continue;
            }


            // Zagłębienie (to samo drugi raz - woda krąży: koniec).

            if (pits.has(current)) {
                end = 'loop';
                break;
            }

            pits.add(current);

            const lake = this.lakeFor(current);

            if (lake.shallow) {

                // Przez płytkie - drogą do przelewu. Jeśli droga wraca
                // przez kratki, którymi rzeka już przeszła, rzeka omija
                // dno (skraca się do tego miejsca).

                for (let r = 1; r < lake.route.length - 1; r++) {

                    const k = lake.route[r];

                    const back = run.indexOf(k);

                    if (back >= 0) {
                        run.length = back + 1;
                    }
                    else {
                        run.push(k);
                    }

                    seen.add(k);

                }

                current = lake.outlet;

                if (seen.has(current)) {
                    end = 'loop';
                    break;
                }

                continue;

            }


            // Jezioro: rzeka kończy się w jeziorze - na pierwszej jego
            // kratce i dalej w głąb, aż tam, gdzie woda jest głęboka (brzeg
            // jeziora bywa prawie suchy - rzeka urwałaby się przed wodą).

            const entry = run.findIndex((k) => lake.cells.has(k));

            run.length = entry + 1;

            for (const k of this.deeper(lake, run[entry])) {
                run.push(k);
            }

            runs.push({ cells: run, lake });

            lakes.push(lake);

            if (lake.outlet === null) {

                end = 'lake';
                lakeEnd = lake;
                run = null;

                break;

            }

            // Dalej od przelewu - tak samo z głębszej wody.

            run = this.deeper(lake, lake.outletFrom).reverse();

            for (const k of lake.outletRoute) {

                const x = keyI(k) * CELL + HALF;
                const z = keyJ(k) * CELL + HALF;

                if (Math.hypot(x - sx, z - sz) > RIVERS.maxLength) {
                    return { runs, lakes, end: 'far', lakeEnd: null };
                }

                run.push(k);
                seen.add(k);

            }

            current = lake.outlet;

        }


        if (run && run.length > 0) {
            runs.push({ cells: run, lake: null });
        }

        return { runs, lakes, end, lakeEnd };

    }


    // Kratki jeziora od kratki k w głąb (za każdym razem najniższa
    // sąsiednia kratka jeziora), aż woda jest głęboka na LAKE_ENTRY_DEPTH
    // bloków - bez k; pusto, gdy przy k już jest.

    deeper(lake, k) {

        const cells = [];

        while (this.heightOf(k) > lake.level - LAKE_ENTRY_DEPTH && cells.length < 4) {

            let next = -1;
            let lowest = this.heightOf(k);

            for (const [di, dj] of NEIGHBORS) {

                const n = key(keyI(k) + di, keyJ(k) + dj);

                if (lake.cells.has(n) && this.heightOf(n) < lowest) {
                    lowest = this.heightOf(n);
                    next = n;
                }

            }

            if (next < 0) {
                break;
            }

            cells.push(next);

            k = next;

        }

        return cells;

    }


    // Kwadrat źródeł (gi, gj): jest w nim źródło rzeki? Jeśli tak -
    // rzeka jest liczona i zapamiętana (raz).

    ensureSource(gi, gj) {

        const k = key(gi, gj);

        if (this.sources.has(k)) {
            return;
        }

        this.sources.set(k, false);


        // Miejsce źródła w kwadracie i szansa (wyżej - częściej).

        const spacing = RIVERS.sourceSpacing;

        const sx = Math.floor((gi + 0.15 + 0.7 * hash01(this.seed, gi, gj, 1)) * spacing);
        const sz = Math.floor((gj + 0.15 + 0.7 * hash01(this.seed, gi, gj, 2)) * spacing);

        if (Math.abs(sx) >= WORLD_BORDER - CELL || Math.abs(sz) >= WORLD_BORDER - CELL) {
            return;
        }

        const ci = Math.floor(sx / CELL);
        const cj = Math.floor(sz / CELL);

        const h = this.height(ci, cj);

        if (this.lastSea) {
            return;
        }

        const above = h - SEA_LEVEL;

        const chance = RIVERS.sourceChance[0] +
            (RIVERS.sourceChance[1] - RIVERS.sourceChance[0]) * smoothstep(4, 40, above);

        if (above < 3 || hash01(this.seed, gi, gj, 3) >= chance) {
            return;
        }


        const result = this.trace(key(ci, cj), ci * CELL + HALF, cj * CELL + HALF);

        const length = result.runs.reduce((sum, run) => sum + run.cells.length, 0);

        const ends =
            result.end === 'sea' ||
            (result.end === 'lake' && result.lakeEnd.depth >= RIVERS.lakeMinDepth);

        if (!ends || length < RIVERS.minLength) {
            return;
        }

        this.sources.set(k, true);

        this.addRiver(result);

    }


    // Rzeka ze źródła: liczba źródeł w kratkach, poziomy wody, spadki,
    // widoczne jeziora, odcinki do rysowania.

    addRiver(result) {

        for (const lake of result.lakes) {
            lake.visible = true;
        }

        for (const run of result.runs) {

            const cells = run.cells;

            // Poziom wody od ujścia w górę: nigdy nie rośnie w dół rzeki.
            // Na końcu: tafla jeziora albo morze.

            let level = run.lake ? Math.floor(run.lake.level) : SEA_LEVEL;

            const levels = new Array(cells.length);

            for (let n = cells.length - 1; n >= 0; n--) {

                const k = cells[n];

                const known = this.levels.get(k);

                if (known !== undefined) {
                    level = known;
                }
                else {

                    const h = this.heightOf(k);

                    if (n < cells.length - 1 || run.lake === null) {
                        level = Math.max(level, Math.floor(h - RIVERS.waterBelow), SEA_LEVEL);
                    }

                    // Odcinek za jeziorem zaczyna się w jeziorze - na
                    // poziomie jego tafli.

                    if (n === 0 && runStartsInLake(run, result)) {
                        level = Math.max(level, Math.floor(lakeOfRun(run, result).level));
                    }

                    this.levels.set(k, level);

                }

                levels[n] = level;

            }


            // Spadek (do meandrów i nurtu) i liczba źródeł.

            for (let n = 0; n < cells.length; n++) {

                const k = cells[n];

                this.counts.set(k, (this.counts.get(k) ?? 0) + 1);

                if (!this.slopes.has(k)) {

                    let slope = 0;

                    if (n + 1 < cells.length) {

                        const next = cells[n + 1];

                        const distance = Math.hypot(keyI(next) - keyI(k), keyJ(next) - keyJ(k)) * CELL;

                        slope = Math.max(0, (this.heightOf(k) - this.heightOf(next)) / distance);

                    }

                    this.slopes.set(k, slope);

                }

            }


            // Ramka odcinka (do szukania odcinków w obszarze).

            let minX = Infinity;
            let minZ = Infinity;
            let maxX = -Infinity;
            let maxZ = -Infinity;

            for (const k of cells) {

                const x = keyI(k) * CELL + HALF;
                const z = keyJ(k) * CELL + HALF;

                minX = Math.min(minX, x);
                minZ = Math.min(minZ, z);
                maxX = Math.max(maxX, x);
                maxZ = Math.max(maxZ, z);

            }

            // Jezioro na końcu odcinka (rzeka do niego wpływa) i na
            // początku (wypływa z niego) - przy nim poziom rzeki
            // dochodzi do tafli (shape).

            // (Kratki rzeki przy jeziorze: LAKE_RUN_CELLS za jego
            // kratkami - zakręty tam pamiętają jezioro.)

            const startLake = runStartsInLake(run, result) ? lakeOfRun(run, result) : null;

            const endLake = run.lake;

            let startTag = 0;
            let endTag = cells.length;

            if (startLake) {

                while (startTag < cells.length && startLake.cells.has(cells[startTag])) {
                    startTag++;
                }

                startTag += LAKE_RUN_CELLS;

            }

            if (endLake) {

                while (endTag > 0 && endLake.cells.has(cells[endTag - 1])) {
                    endTag--;
                }

                endTag -= LAKE_RUN_CELLS;

            }

            this.runs.push({ cells, minX, minZ, maxX, maxZ, startLake, endLake, startTag, endTag });

        }

    }

    // --------------------------------------------------------
    // OBSZARY: odcinki koryta i jeziora w pobliżu
    // --------------------------------------------------------

    zoneAt(x, z) {

        const zx = Math.floor(x / ZONE);
        const zz = Math.floor(z / ZONE);

        const k = zx * 65536 + zz;

        if (k === this.lastZoneKey) {
            return this.lastZone;
        }

        let zone = this.zones.get(k);

        if (!zone) {

            zone = this.prepareZone(zx, zz);

            this.zones.set(k, zone);

        }

        this.lastZone = zone;
        this.lastZoneKey = k;

        return zone;

    }


    prepareZone(zx, zz) {

        const x0 = zx * ZONE;
        const z0 = zz * ZONE;

        const cx = x0 + ZONE / 2;
        const cz = z0 + ZONE / 2;


        // Wszystkie źródła, z których woda może tu dopłynąć.

        const spacing = RIVERS.sourceSpacing;

        const g0 = Math.floor((cx - TRACE_RADIUS) / spacing);
        const g1 = Math.floor((cx + TRACE_RADIUS) / spacing);
        const h0 = Math.floor((cz - TRACE_RADIUS) / spacing);
        const h1 = Math.floor((cz + TRACE_RADIUS) / spacing);

        for (let gi = g0; gi <= g1; gi++) {

            for (let gj = h0; gj <= h1; gj++) {

                const dx = Math.max(0, Math.abs((gi + 0.5) * spacing - cx) - spacing / 2);
                const dz = Math.max(0, Math.abs((gj + 0.5) * spacing - cz) - spacing / 2);

                if (Math.hypot(dx, dz) <= TRACE_RADIUS) {
                    this.ensureSource(gi, gj);
                }

            }

        }


        // Odcinki koryta w obszarze (z zapasem): każdy zakręt raz.

        const zone = {
            x0,
            z0,
            segments: [],
            segmentStartLakes: [],
            segmentEndLakes: [],
            bins: Array.from({ length: BINS * BINS }, () => []),
            lakes: [],
            lakeBins: Array.from({ length: BINS * BINS }, () => [])
        };

        const done = new Set();

        const minX = x0 - MARGIN;
        const minZ = z0 - MARGIN;
        const maxX = x0 + ZONE + MARGIN;
        const maxZ = z0 + ZONE + MARGIN;

        for (const run of this.runs) {

            if (run.maxX < minX || run.minX > maxX || run.maxZ < minZ || run.minZ > maxZ) {
                continue;
            }

            const cells = run.cells;

            for (let n = 0; n < cells.length; n++) {

                const c = cells[n];

                const x = keyI(c) * CELL + HALF;
                const z = keyJ(c) * CELL + HALF;

                if (x < minX || x > maxX || z < minZ || z > maxZ) {
                    continue;
                }

                const p = n > 0 ? cells[n - 1] : -1;
                const q = n + 1 < cells.length ? cells[n + 1] : -1;

                const id = `${p},${c},${q}`;

                if (done.has(id)) {
                    continue;
                }

                done.add(id);

                this.addCurve(
                    zone, p, c, q,
                    n < run.startTag ? run.startLake : null,
                    n >= run.endTag ? run.endLake ?? null : null
                );

            }

        }


        // Odcinki do kratek indeksu (z zasięgiem wpływu: szerokość, brzegi).

        const segments = zone.segments = Float32Array.from(zone.segments);

        for (let s = 0; s < segments.length; s += SEGMENT) {

            const reach = Math.max(segments[s + 6], segments[s + 7]) + RIVERS.bank + 2;

            const sx0 = Math.min(segments[s], segments[s + 2]) - reach - x0;
            const sx1 = Math.max(segments[s], segments[s + 2]) + reach - x0;
            const sz0 = Math.min(segments[s + 1], segments[s + 3]) - reach - z0;
            const sz1 = Math.max(segments[s + 1], segments[s + 3]) + reach - z0;

            const bx0 = Math.max(0, Math.floor(sx0 / BIN));
            const bx1 = Math.min(BINS - 1, Math.floor(sx1 / BIN));
            const bz0 = Math.max(0, Math.floor(sz0 / BIN));
            const bz1 = Math.min(BINS - 1, Math.floor(sz1 / BIN));

            for (let bx = bx0; bx <= bx1; bx++) {
                for (let bz = bz0; bz <= bz1; bz++) {
                    zone.bins[bx * BINS + bz].push(s);
                }
            }

        }


        // Jeziora, do których wpływa jakaś rzeka, w pobliżu obszaru.

        for (const lake of this.lakes) {

            if (
                lake.visible && !lake.shallow &&
                lake.maxX >= minX && lake.minX <= maxX && lake.maxZ >= minZ && lake.minZ <= maxZ
            ) {
                zone.lakes.push(lake);

                // Do kratek indeksu (z pasem brzegu).

                const bx0 = Math.max(0, Math.floor((lake.minX - LAKE_SHORE - x0) / BIN));
                const bx1 = Math.min(BINS - 1, Math.floor((lake.maxX + LAKE_SHORE - x0) / BIN));
                const bz0 = Math.max(0, Math.floor((lake.minZ - LAKE_SHORE - z0) / BIN));
                const bz1 = Math.min(BINS - 1, Math.floor((lake.maxZ + LAKE_SHORE - z0) / BIN));

                for (let bx = bx0; bx <= bx1; bx++) {
                    for (let bz = bz0; bz <= bz1; bz++) {
                        zone.lakeBins[bx * BINS + bz].push(lake);
                    }
                }
            }

        }

        return zone;

    }


    // Kawałek koryta wokół kratki c (p - poprzednia, q - następna, -1 -
    // brak): krzywa od połowy drogi z p do c, przez c, do połowy drogi
    // z c do q, z meandrami - jako krótkie odcinki w zone.segments
    // (i jezioro, z którego / do którego płynie tu rzeka, w
    // zone.segmentStartLakes / segmentEndLakes - albo null).

    addCurve(zone, p, c, q, startLake, endLake) {

        if (p < 0 && q < 0) {
            return;
        }

        const C = this.pointOf(c);
        const P = p >= 0 ? this.pointOf(p) : null;
        const Q = q >= 0 ? this.pointOf(q) : null;

        const A = P ? average(P, C) : C;
        const B = Q ? average(C, Q) : C;


        // Krzywa Béziera A -> C -> B (bez p albo q - prosto).

        const steps = P && Q ? 5 : 3;

        let previous = null;

        for (let s = 0; s <= steps; s++) {

            const t = s / steps;

            let x;
            let z;
            let tx;
            let tz;

            if (P && Q) {

                const u = 1 - t;

                x = u * u * A.x + 2 * u * t * C.x + t * t * B.x;
                z = u * u * A.z + 2 * u * t * C.z + t * t * B.z;

                tx = 2 * u * (C.x - A.x) + 2 * t * (B.x - C.x);
                tz = 2 * u * (C.z - A.z) + 2 * t * (B.z - C.z);

            }
            else {

                const from = P ? A : C;
                const to = P ? C : B;

                x = from.x + (to.x - from.x) * t;
                z = from.z + (to.z - from.z) * t;

                tx = to.x - from.x;
                tz = to.z - from.z;

            }


            // Wartości (poziom wody, szerokość, meandry, nurt): od A do C,
            // potem od C do B.

            let value;

            if (P && Q) {
                value = t <= 0.5 ? mix(A, C, t * 2) : mix(C, B, t * 2 - 1);
            }
            else {
                value = P ? mix(A, C, t) : mix(C, B, t);
            }


            // Meandry: w bok od kierunku rzeki, według gładkiego szumu
            // (zależy tylko od miejsca - sąsiednie kawałki pasują).

            const length = Math.hypot(tx, tz) || 1;

            const nx = -tz / length;
            const nz = tx / length;

            const offset = value.meander * this.meanderNoise.fractal2D(x / RIVERS.meanderScale, z / RIVERS.meanderScale, 2) * 1.6;

            const point = {
                x: x + nx * offset,
                z: z + nz * offset,
                level: value.level,
                width: value.width,
                speed: value.speed
            };

            if (previous) {

                zone.segments.push(
                    previous.x, previous.z, point.x, point.z,
                    previous.level, point.level,
                    previous.width, point.width,
                    previous.speed, point.speed
                );

                zone.segmentStartLakes.push(startLake);
                zone.segmentEndLakes.push(endLake);

            }

            previous = point;

        }

    }


    // Środek kratki k i wartości rzeki w nim.

    pointOf(k) {

        const count = this.counts.get(k) ?? 1;

        const slope = this.slopes.get(k) ?? 0;

        const width = Math.min(
            RIVERS.halfWidth[1],
            RIVERS.halfWidth[0] + RIVERS.widthPerSource * (Math.sqrt(count) - 1)
        );

        return {
            x: keyI(k) * CELL + HALF,
            z: keyJ(k) * CELL + HALF,
            level: this.levels.get(k) ?? SEA_LEVEL,
            width,
            meander: RIVERS.meander * (1 - smoothstep(RIVERS.meanderSlope[0], RIVERS.meanderSlope[1], slope)),
            speed: Math.min(RIVERS.flow[1], RIVERS.flow[0] + RIVERS.flowSlope * slope)
        };

    }

    // --------------------------------------------------------
    // KOLUMNA: koryto, brzegi, jezioro
    // --------------------------------------------------------

    // Wysokość terenu w kolumnie (x, z) po rzekach i jeziorach (y,
    // z ułamkiem). macro - makrorzeźba, full - teren ze wszystkim.
    // Ustawia out.water (wierzch wody), out.river (1 - koryto, 2 -
    // brzeg), out.lake, out.flowX / flowZ. spacing > 1 (daleki teren):
    // koryto zalewa kratkę, jeśli przechodzi przez nią.

    shape(x, z, macro, full, out, spacing = 1) {

        out.river = 0;
        out.lake = false;
        out.flowX = 0;
        out.flowZ = 0;
        out.riverGap = Infinity;
        out.lakeGap = Infinity;

        // Naturalnie zanurzone dno morza nie potrzebuje wałów przy
        // korycie. Rzeka może je pogłębić, ale nie usypuje wysp ani
        // piaszczystej obwódki wokół swojego końca.
        const seaWater = out.ocean && full < SEA_LEVEL;

        // Bardzo daleki teren (kratki większe niż MAX_SPACING) - bez rzek
        // i jezior (i bez liczenia ich tak daleko).

        if (spacing > MAX_SPACING) {
            return full;
        }

        const zone = this.zoneAt(x, z);

        const lx = x - zone.x0;
        const lz = z - zone.z0;


        // Najbliższe koryto.

        const segments = zone.segments;

        const binIndex = Math.min(BINS - 1, Math.floor(lx / BIN)) * BINS + Math.min(BINS - 1, Math.floor(lz / BIN));

        const bin = zone.bins[binIndex];

        const lakes = zone.lakeBins[binIndex];

        if (bin.length === 0 && lakes.length === 0) {
            return full;
        }

        let best = -1;
        let bestGap = Infinity;
        let bestT = 0;
        let bestDistance = 0;

        const px = x + 0.5;
        const pz = z + 0.5;

        for (let n = 0; n < bin.length; n++) {

            const s = bin[n];

            const ax = segments[s];
            const az = segments[s + 1];
            const dx = segments[s + 2] - ax;
            const dz = segments[s + 3] - az;

            const length2 = dx * dx + dz * dz;

            let t = length2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / length2 : 0;

            t = t < 0 ? 0 : t > 1 ? 1 : t;

            const ox = px - ax - dx * t;
            const oz = pz - az - dz * t;

            const distance2 = ox * ox + oz * oz;

            // Na pewno dalej niż najlepszy dotąd - bez pierwiastka.

            const limit = bestGap + Math.max(segments[s + 6], segments[s + 7]);

            if (distance2 > limit * limit) {
                continue;
            }

            const distance = Math.sqrt(distance2);

            const width = segments[s + 6] + (segments[s + 7] - segments[s + 6]) * t;

            const gap = distance - width;

            if (gap < bestGap) {
                bestGap = gap;
                best = s;
                bestT = t;
                bestDistance = distance;
            }

        }


        // Jeziora w pobliżu i odległość od ich kratek (lakeEdge). Woda
        // jeziora stoi w jego kratkach i w kratkach brzegu (wyżej niż
        // tafla) do LAKE_RIM bloków od nich - tam, gdzie makrorzeźba jest
        // poniżej tafli. W kratkach przelewu (niżej niż tafla, poza
        // jeziorem) nie: tam woda odpływa rzeką.

        // Wzgórza wygładzają się przy wodzie: przy samym korycie (i nisko
        // nad taflą jeziora) teren to makrorzeźba.

        let smooth = best >= 0 ? smoothstep(1, RIVERS.bank, bestGap) : 1;

        let lake = null;

        const near = lakes.length > 0 ? [] : NO_LAKES;

        for (let n = 0; n < lakes.length; n++) {

            const candidate = lakes[n];

            if (
                x < candidate.minX - LAKE_SHORE || x >= candidate.maxX + LAKE_SHORE ||
                z < candidate.minZ - LAKE_SHORE || z >= candidate.maxZ + LAKE_SHORE
            ) {
                continue;
            }

            const edge = this.lakeEdge(candidate, x, z, 2);

            if (edge === Infinity) {
                continue;
            }

            // Ramka jeziora służy tylko do wyszukiwania. Wygładzanie
            // zależy od odległości od jego rzeczywistych kratek, nie
            // od prostokąta obejmującego także odległy ląd. Wygasa przed
            // końcem dokładnego zasięgu lakeEdge (2 * CELL), więc na
            // granicy indeksu nie powstaje nowy próg.
            const shoreSmooth = Math.max(
                smoothstep(0, 6, macro - candidate.level),
                smoothstep(LAKE_RIM, 2 * CELL, edge)
            );
            smooth = Math.min(smooth, shoreSmooth);

            // Odległość od najbliższego jeziora (biomy - mokradła).

            out.lakeGap = Math.min(out.lakeGap, edge);

            const water =
                macro < candidate.level && edge <= LAKE_RIM &&
                (edge === 0 || this.height(Math.floor(x / CELL), Math.floor(z / CELL)) >= candidate.level);

            // (Ujemna odległość: tu jest woda tego jeziora.)

            near.push(candidate, water ? -1 - edge : edge);

            if (water && (!lake || candidate.level > lake.level)) {
                lake = candidate;
            }

        }


        if (best < 0 && smooth >= 1 && near.length === 0) {
            return full;
        }

        let height = seaWater ? full : macro + (full - macro) * smooth;

        // Teren równo z taflą (makrorzeźba tuż pod nią) - bez wody
        // jeziora: to brzeg, przez który rzeka dopływa do wody.

        if (lake && Math.floor(height) >= Math.floor(lake.level)) {
            lake = null;
        }


        // Rzeka: dolina, brzegi, koryto - poza wodą jeziora (rzeka kończy
        // się na jego brzegu).

        if (best >= 0 && bestGap < INFLUENCE && lake === null) {

            let level = Math.floor(segments[best + 4] + (segments[best + 5] - segments[best + 4]) * bestT);

            // Przy jeziorze, do którego rzeka wpływa (albo z którego
            // wypływa), poziom rzeki dochodzi do tafli: przy wodzie
            // jeziora jest równy tafli, dalej zmienia się najwyżej jak
            // teren za przelewem (lakeRamp) - bez ściany wody na granicy
            // jeziora. Rzeka między dwoma bliskimi jeziorami - według
            // bliższego.

            const startLake = zone.segmentStartLakes[best / SEGMENT];
            const endLake = zone.segmentEndLakes[best / SEGMENT];

            // (Bliższego wody: kratka jeziora wyżej niż tafla jest
            // sucha - liczy się, jakby była dalej.)

            const startEdge = nearEdge(near, startLake);
            const endEdge = nearEdge(near, endLake);

            if (startEdge < Infinity || endEdge < Infinity) {

                const startWater = startEdge + Math.max(0, macro - (startLake?.level ?? 0)) * 2;
                const endWater = endEdge + Math.max(0, macro - (endLake?.level ?? 0)) * 2;

                const riverLake = startWater <= endWater ? startLake : endLake;

                const top = Math.floor(riverLake.level);

                const reach = Math.floor(lakeRamp((riverLake === startLake ? startEdge : endEdge) - LAKE_RIM - 0.5));

                level = level > top ? Math.min(level, top + reach) : Math.max(level, top - reach);

            }

            // Po wejściu do otwartej wody kończy się rzeczny próg;
            // ujście łączy się z istniejącą taflą morza.
            if (seaWater) {
                level = SEA_LEVEL;
            }

            const width = segments[best + 6] + (segments[best + 7] - segments[best + 6]) * bestT;

            const steep = RIVERS.bankSlope[0] + (RIVERS.bankSlope[1] - RIVERS.bankSlope[0]) * (out.mountains ?? 0);

            const reach = spacing > 1 ? width + spacing * 0.5 : width;

            out.riverGap = bestGap;

            if (bestDistance >= reach) {

                // Brzeg: teren opada do wody łagodnie, a tuż przy korycie
                // jest co najmniej na poziomie wody.

                // (Dalej od rzeki dolina rozchyla się coraz szybciej - na
                // końcu zasięgu nie ścina już terenu, więc nie ma progu.)

                const gap = bestDistance - width;

                const widen = 1 + 4 * smoothstep(INFLUENCE * 0.4, INFLUENCE, gap);

                height = Math.min(height, level + 1.5 + steep * gap * widen);

                // Tuż przy korycie brzeg jest blok nad wodą - także tam,
                // gdzie poziom wody zmienia się o blok (próg na rzece).

                if (!seaWater && bestDistance < width + 1.5) {

                    height = Math.max(height, level + 1);

                    out.river = 2;

                }

            }
            else {

                // Koryto: najgłębiej na środku.

                const across = Math.min(1, bestDistance / Math.max(width, 0.5));

                const bed = level - 1 - (RIVERS.depth + width * 0.3) * (1 - across * across);

                height = Math.min(height, bed + 0.99);

                out.water = Math.max(out.water, level);

                out.river = 1;


                // Nurt wzdłuż rzeki.

                const dx = segments[best + 2] - segments[best];
                const dz = segments[best + 3] - segments[best + 1];

                const length = Math.hypot(dx, dz) || 1;

                const speed = segments[best + 8] + (segments[best + 9] - segments[best + 8]) * bestT;

                out.flowX = dx / length * speed;
                out.flowZ = dz / length * speed;

            }

        }


        // Gdzie nie ma wody jeziora, teren przy nim nie jest niżej niż
        // tafla (do LAKE_RIM + 1 bloków od kratek jeziora - woda obok
        // stałaby ścianą), dalej najwyżej łagodnie opada (lakeRamp). Przy
        // przelewie to próg, przez który wypływa rzeka; na brzegu - bez
        // dołków (dolinka, wąwóz) poniżej tafli. Także dolina rzeki tu
        // nie schodzi niżej (tylko jej koryto).

        // (To samo jezioro bywa policzone dwa razy - z dwóch kratek
        // płaskiego dna: gdzie jest woda jeziora, ono terenu nie podnosi.)

        if (out.river !== 1 && !seaWater) {

            for (let n = 0; n < near.length; n += 2) {

                if (near[n + 1] >= 0) {
                    height = Math.max(height, Math.floor(near[n].level) - lakeRamp(near[n + 1] - LAKE_RIM - 1));
                }

            }

        }


        // Jezioro: woda do tafli.

        if (lake && Math.floor(height) < Math.floor(lake.level)) {

            out.water = Math.max(out.water, Math.floor(lake.level));

            out.lake = true;

            out.flowX = 0;
            out.flowZ = 0;

        }

        return height;

    }


    // Odległość środka kolumny (x, z) od najbliższej kratki jeziora
    // (0 - kolumna w kratce jeziora) wśród kratek do radius dalej;
    // Infinity, gdy żadna nie jest blisko (dokładna do radius * CELL
    // bloków). Woda jeziora jest w jego kratkach i tuż obok (w kratkach
    // brzegu, gdzie makrorzeźba schodzi poniżej tafli).

    lakeEdge(lake, x, z, radius) {

        const i = Math.floor(x / CELL);
        const j = Math.floor(z / CELL);

        const cx = x + 0.5;
        const cz = z + 0.5;

        let best = Infinity;

        for (let di = -radius; di <= radius; di++) {

            for (let dj = -radius; dj <= radius; dj++) {

                const ni = i + di;
                const nj = j + dj;

                if (!lake.cells.has(key(ni, nj))) {
                    continue;
                }

                const dx = Math.max(ni * CELL - cx, 0, cx - (ni + 1) * CELL);
                const dz = Math.max(nj * CELL - cz, 0, cz - (nj + 1) * CELL);

                best = Math.min(best, Math.hypot(dx, dz));

            }

        }

        return best;

    }


    // --------------------------------------------------------
    // OPIS (komendy, mapa)
    // --------------------------------------------------------

    // Najbliższa rzeka w promieniu radius od (x, z): { x, z, distance,
    // level, width, flowX, flowZ } albo null.

    nearest(x, z, radius = 256) {

        let found = null;

        for (let zx = Math.floor((x - radius) / ZONE); zx <= Math.floor((x + radius) / ZONE); zx++) {

            for (let zz = Math.floor((z - radius) / ZONE); zz <= Math.floor((z + radius) / ZONE); zz++) {

                const zone = this.zoneAt(zx * ZONE, zz * ZONE);

                const segments = zone.segments;

                for (let s = 0; s < segments.length; s += SEGMENT) {

                    const mx = (segments[s] + segments[s + 2]) / 2;
                    const mz = (segments[s + 1] + segments[s + 3]) / 2;

                    const distance = Math.hypot(mx - x, mz - z);

                    if (distance <= radius && (!found || distance < found.distance)) {

                        const dx = segments[s + 2] - segments[s];
                        const dz = segments[s + 3] - segments[s + 1];

                        const length = Math.hypot(dx, dz) || 1;

                        found = {
                            x: Math.floor(mx),
                            z: Math.floor(mz),
                            distance,
                            level: Math.floor(segments[s + 4]),
                            width: segments[s + 6] * 2,
                            flowX: dx / length * segments[s + 8],
                            flowZ: dz / length * segments[s + 8]
                        };

                    }

                }

            }

        }

        return found;

    }


    // Najbliższe jezioro (do którego wpływa rzeka) w promieniu radius.

    nearestLake(x, z, radius = 1024) {

        let found = null;

        for (let zx = Math.floor((x - radius) / ZONE); zx <= Math.floor((x + radius) / ZONE); zx++) {
            for (let zz = Math.floor((z - radius) / ZONE); zz <= Math.floor((z + radius) / ZONE); zz++) {
                this.zoneAt(zx * ZONE, zz * ZONE);
            }
        }

        for (const lake of this.lakes) {

            if (!lake.visible || lake.shallow) {
                continue;
            }

            const px = keyI(lake.pit) * CELL + HALF;
            const pz = keyJ(lake.pit) * CELL + HALF;

            const distance = Math.hypot(px - x, pz - z);

            if (distance <= radius && (!found || distance < found.distance)) {
                found = { x: px, z: pz, distance, level: Math.floor(lake.level), cells: lake.cells.size, outlet: lake.outlet !== null, depth: lake.depth };
            }

        }

        return found;

    }


    // Dokąd płynie woda z miejsca (x, z): { end: 'sea' | 'lake', length
    // (bloki do ujścia), lakes (ile jezior po drodze) } - tą samą drogą
    // co rzeki (/rzeka).

    downstream(x, z) {

        let current = key(Math.floor(x / CELL), Math.floor(z / CELL));

        let length = 0;

        let lakes = 0;

        const pits = new Set();

        for (let step = 0; step < MAX_STEPS * 2; step++) {

            const next = this.down(current);

            if (next === SEA) {
                return { end: 'sea', length, lakes };
            }

            if (next !== PIT) {

                length += Math.hypot(keyI(next) - keyI(current), keyJ(next) - keyJ(current)) * CELL;

                current = next;

                continue;

            }

            if (pits.has(current)) {
                break;
            }

            pits.add(current);

            const lake = this.lakeFor(current);

            if (!lake.shallow) {
                lakes++;
            }

            if (lake.outlet === null) {
                return { end: 'lake', length, lakes };
            }

            current = lake.outlet;

        }

        return { end: 'lake', length, lakes };

    }


    // Liczby do sprawdzania (/rzeka statystyki).

    stats() {

        let accepted = 0;

        for (const value of this.sources.values()) {
            if (value) accepted++;
        }

        return {
            sources: this.sources.size,
            rivers: accepted,
            runs: this.runs.length,
            lakes: this.lakes.filter((lake) => lake.visible && !lake.shallow).length,
            zones: this.zones.size,
            cells: this.downs.size
        };

    }

}


// Liczb na jeden odcinek koryta w zone.segments:
// ax, az, bx, bz, poziom A, poziom B, szerokość A, B, nurt A, B.
const SEGMENT = 10;


function average(a, b) {

    return mix(a, b, 0.5);

}


function mix(a, b, t) {

    return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
        level: a.level + (b.level - a.level) * t,
        width: a.width + (b.width - a.width) * t,
        meander: a.meander + (b.meander - a.meander) * t,
        speed: a.speed + (b.speed - a.speed) * t
    };

}


// Odcinek rzeki za jeziorem zaczyna się w kratce tego jeziora.

function runStartsInLake(run, result) {

    const index = result.runs.indexOf(run);

    return index > 0 && result.runs[index - 1].lake !== null;

}


function lakeOfRun(run, result) {

    return result.runs[result.runs.indexOf(run) - 1].lake;

}
