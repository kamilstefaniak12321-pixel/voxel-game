import { TREE_SPECIES, TREE_NAMES, treeParts, treeVariantType, treeLogType, treeRootsType } from '../../blocks/trees.js';
import { ORIGINAL_TREE_LIMITS, SPECIES_SHAPE_LIMITS } from '../../blocks/treeCatalog.js';

// ------------------------------------------------------------
// KSZTAŁTY DRZEW
//
// buildTree(gatunek, seed, size) układa jedno drzewo z bloków: pień,
// gałęzie, korona z liści, a do tego dodatki (żywica na pniu sosny,
// kwitnące liście lipy, opadłe liście pod bukiem i dębem). Ten sam
// seed = zawsze to samo drzewo, więc generator terenu może je
// rozłożyć na kilka chunków (każdy chunk wstawia swój kawałek), a
// sadzonka i komenda /drzewa korzystają z tego samego kodu.
//
// Współrzędne są względem podstawy pnia: (0, 0, 0) to pierwszy blok
// pnia (tuż nad ziemią). size 0-1 - od małego do dużego drzewa.
//
// Wygląd według koncepcji Kamila:
//   świerk  - wysoki stożek z pięter gałęzi, ciemne igliwie,
//   sosna   - wysoki goły pień (dół ciemny, góra pomarańczowa),
//             parasol z kęp igliwia na samej górze,
//   buk     - gładki szary pień, szeroka gęsta korona,
//   lipa    - gruby ciemny pień, wysoka zaokrąglona korona, kwitnie,
//   dąb     - gruby pień (duże - 2 x 2), konary na boki, szeroka
//             nieregularna korona,
//   brzoza  - smukły biały pień (czasem lekko pochylony), lekka,
//             ażurowa korona ze zwisającymi gałązkami.
//
// Pozostałe gatunki korzystają z rysunków warstw albo generatorów
// sylwetek opisanych we wspólnym treeCatalog.js.
// ------------------------------------------------------------

// Najdalej od pnia (w poziomie) i najwyżej, gdzie może być blok
// drzewa - generator terenu sprawdza drzewa z tylu bloków wokół chunka.

export const TREE_REACH = Math.max(ORIGINAL_TREE_LIMITS.reach, ...Object.values(SPECIES_SHAPE_LIMITS).map((limits) => limits.reach));

export const TREE_MAX_HEIGHT = Math.max(ORIGINAL_TREE_LIMITS.maxHeight, ...Object.values(SPECIES_SHAPE_LIMITS).map((limits) => limits.maxHeight));

const ORIGINAL_LIMITS = ORIGINAL_TREE_LIMITS;

export function treeShapeLimits(species) {
    return SPECIES_SHAPE_LIMITS[TREE_SPECIES[species]?.shape?.kind] ?? ORIGINAL_LIMITS;
}

// Shared near/far scale, in blocks (one block is approximately one metre).
// Only the mature-sized species use this contract; legacy silhouettes retain
// their original formulas and random sequence.
export function treeVisualDimensions(species, size = 0.5) {
    const shape = TREE_SPECIES[species]?.shape;
    if (!shape || !Object.hasOwn(SPECIES_SHAPE_LIMITS, shape.kind)) return null;
    const amount = Math.max(0, Math.min(1, size));
    const height = Math.round(lerp(shape.height[0], shape.height[1], amount));
    const radius = lerp(shape.radius[0], shape.radius[1], amount);
    if (shape.kind === 'bald_cypress') return {
        height, radius, trunkWidth: amount >= 0.35 ? 2 : 1,
        crownBase: Math.round(height * 0.38)
    };
    if (shape.kind === 'acacia') return {
        height, radius, trunkWidth: amount >= 0.65 ? 2 : 1,
        crownBase: height - Math.max(3, Math.round(height * 0.3))
    };
    // 0.83.0
    if (shape.kind === 'sequoia') return {
        height, radius, trunkWidth: amount >= 0.45 ? 4 : 3,
        crownBase: Math.round(height * 0.5)
    };
    if (shape.kind === 'rainbow_eucalyptus') return {
        height, radius, trunkWidth: amount >= 0.4 ? 2 : 1,
        crownBase: height - Math.max(8, Math.round(height * 0.26))
    };
    if (shape.kind === 'mugo') return { height, radius, trunkWidth: 1, crownBase: 0 };
    if (shape.kind === 'olive') return {
        height, radius, trunkWidth: amount >= 0.4 ? 2 : 1,
        crownBase: Math.max(2, Math.round(height * 0.4))
    };
    if (shape.kind === 'maple') return {
        height, radius, trunkWidth: amount >= 0.7 ? 2 : 1,
        crownBase: Math.max(3, Math.round(height * 0.3))
    };
    if (shape.kind === 'ginkgo') return {
        height, radius, trunkWidth: amount >= 0.65 ? 2 : 1,
        crownBase: Math.max(4, Math.round(height * 0.25))
    };
    if (shape.kind === 'jacaranda') return {
        height, radius, trunkWidth: 1,
        crownBase: Math.max(2, Math.round(height * 0.25))
    };
    // 1.8.0 (paczka "drzewa_od_jodly").
    const made = NEW_DIMENSIONS[shape.kind]?.(height, amount);
    if (made) return { height, radius, ...made };
    return { height, radius, trunkWidth: 1, crownBase: Math.max(2, Math.round(height * 0.35)) };
}

// Szerokość pnia i początek korony trzynastu drzew z 1.8.0 (wysokość
// w blokach, amount 0-1 - od małego do dużego drzewa).
const NEW_DIMENSIONS = {
    fir: (height, amount) => ({ trunkWidth: amount >= 0.55 ? 2 : 1, crownBase: Math.round(height * 0.3) }),
    baobab: (height, amount) => ({ trunkWidth: amount >= 0.5 ? 7 : 5, crownBase: Math.round(height * 0.55) }),
    coconut_palm: (height) => ({ trunkWidth: 1, crownBase: height - 4 }),
    larch: (height, amount) => ({ trunkWidth: amount >= 0.75 ? 2 : 1, crownBase: Math.round(height * 0.22) }),
    mangrove: (height, amount) => ({ trunkWidth: 1, crownBase: 3 + Math.round(amount * 2) }),
    kapok: (height, amount) => ({ trunkWidth: amount >= 0.5 ? 3 : 2, crownBase: height - Math.max(9, Math.round(height * 0.25)) }),
    joshua_tree: (height) => ({ trunkWidth: 1, crownBase: Math.max(2, Math.round(height * 0.35)) }),
    aspen: (height) => ({ trunkWidth: 1, crownBase: Math.round(height * 0.4) }),
    araucaria: (height, amount) => ({ trunkWidth: amount >= 0.6 ? 2 : 1, crownBase: Math.round(height * 0.55) }),
    banyan: (height, amount) => ({ trunkWidth: amount >= 0.5 ? 3 : 2, crownBase: Math.max(4, Math.round(height * 0.33)) }),
    dragon_tree: (height, amount) => ({ trunkWidth: amount >= 0.55 ? 2 : 1, crownBase: Math.max(2, Math.round(height * 0.4)) }),
    cedar: (height, amount) => ({ trunkWidth: amount >= 0.35 ? 2 : 1, crownBase: Math.round(height * 0.28) }),
    bristlecone: (height, amount) => ({ trunkWidth: amount >= 0.4 ? 2 : 1, crownBase: Math.max(2, Math.round(height * 0.4)) })
};


// Generator liczb 0-1 z seeda (mulberry32).

export function seededRandom(seed) {

    let a = seed >>> 0;

    return () => {

        a = (a + 0x6d2b79f5) | 0;

        let t = Math.imul(a ^ (a >>> 15), 1 | a);

        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    };

}


function lerp(a, b, t) {

    return a + (b - a) * t;

}


// ------------------------------------------------------------
// Zbieranie bloków jednego drzewa
// ------------------------------------------------------------

// Siła bloku: pień przykrywa liście, liście nie przykrywają pnia.

const STRENGTH = { log: 2, leaves: 1 };


class TreeBuilder {

    constructor(species, random) {

        this.species = species;
        this.random = random;
        this.parts = treeParts(species);
        this.limits = treeShapeLimits(species);

        // klucz komórki -> [x, y, z, typ, siła]
        this.cells = new Map();

        // Komórki pnia przy ziemi [x, z, typ] - w terenie pochyłym pień
        // schodzi w dół do gruntu.
        this.roots = [];

        // Kolumny (x, z), w których na ziemi leżą opadłe liście.
        this.litter = [];

    }


    key(x, y, z) {

        // y do 191 (sekwoja ma ponad 64 bloki), x i z od -64 do 63.
        return (x + 64) * 32768 + (y + 64) * 128 + (z + 64);

    }


    // Czy w komórce (x, y, z) już coś jest.

    has(x, y, z) {

        return this.cells.has(this.key(x, y, z));

    }


    set(x, y, z, type, strength) {

        x = Math.round(x);
        y = Math.round(y);
        z = Math.round(z);

        if (Math.abs(x) > this.limits.reach || Math.abs(z) > this.limits.reach || y < 0 || y > this.limits.maxHeight) {
            return;
        }

        const key = this.key(x, y, z);

        const old = this.cells.get(key);

        if (!old || old[4] < strength) {
            this.cells.set(key, [x, y, z, type, strength]);
        }

    }


    log(x, y, z, type = this.parts.log) {

        this.set(x, y, z, type, STRENGTH.log);

    }


    leaf(x, y, z, type = this.parts.leaves) {

        this.set(x, y, z, type, STRENGTH.leaves);

    }


    // Pionowy pień od y0 do y1 (włącznie) w kolumnie (x, z).

    trunk(x, z, y0, y1, type) {

        for (let y = y0; y <= y1; y++) {
            this.log(x, y, z, type);
        }

        if (y0 === 0) {
            this.roots.push([x, z, type ?? this.parts.log]);
        }

    }


    // Gałąź (konar): linia bloków pnia od (x0, y0, z0) do (x1, y1, z1).

    branch(x0, y0, z0, x1, y1, z1, type) {

        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));

        for (let i = 0; i <= steps; i++) {

            const t = i / steps;

            this.log(lerp(x0, x1, t), lerp(y0, y1, t), lerp(z0, z1, t), type);

        }

    }


    // Kępa liści: elipsoida o środku (cx, cy, cz) i promieniach rx, ry,
    // rz. Brzeg jest postrzępiony: im bliżej brzegu, tym większa szansa,
    // że liścia nie będzie (edge - od jakiej odległości, density -
    // jak gęsto na brzegu).

    blob(cx, cy, cz, rx, ry, rz, edge = 0.65, density = 0.55, type) {

        const random = this.random;

        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {

            for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {

                for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {

                    const d =
                        ((x - cx) / rx) ** 2 +
                        ((y - cy) / ry) ** 2 +
                        ((z - cz) / rz) ** 2;

                    if (d > 1) {
                        continue;
                    }

                    if (d > edge && random() > density) {
                        continue;
                    }

                    this.leaf(x, y, z, type);

                }

            }

        }

    }


    // Jedna warstwa liści (krążek o promieniu r) na wysokości y.

    disk(cx, y, cz, r, ragged = 0.3, type) {

        const random = this.random;

        const reach = Math.ceil(r);

        for (let z = -reach; z <= reach; z++) {

            for (let x = -reach; x <= reach; x++) {

                const d = Math.hypot(x, z);

                if (d > r + 0.35) {
                    continue;
                }

                // Na brzegu krążka czasem brakuje liścia.

                if (d > r - 0.65 && random() < ragged) {
                    continue;
                }

                this.leaf(cx + x, y, cz + z, type);

            }

        }

    }


    // Opadłe liście na ziemi w promieniu `radius` od pnia.

    fallen(radius, chance) {

        const random = this.random;

        for (let z = -radius; z <= radius; z++) {

            for (let x = -radius; x <= radius; x++) {

                const d = Math.hypot(x, z);

                if (d < 1 || d > radius + 0.3) {
                    continue;
                }

                if (random() < chance * (1 - 0.5 * d / radius)) {
                    this.litter.push([x, z]);
                }

            }

        }

    }


    // Gotowe drzewo.

    finish() {

        const blocks = [...this.cells.values()].map(([x, y, z, type]) => [x, y, z, type]);

        let top = 0;

        for (const block of blocks) {
            top = Math.max(top, block[1]);
        }

        return {
            species: this.species,
            blocks,
            roots: this.roots,
            litter: this.litter,
            top
        };

    }

}


// ------------------------------------------------------------
// GATUNKI
// ------------------------------------------------------------

// Świerk: pień do samej góry, piętra gałęzi (każde piętro na dole
// szersze, wyżej węższe), od dołu do góry coraz węższe - stożek.
// Końce najniższej warstwy piętra lekko opadają.

function spruce(tree, size) {

    const random = tree.random;

    const height = Math.round(lerp(10, 17, size) + random() * 2);

    const crownBase = 2 + Math.floor(random() * 2);

    const maxRadius = 1.4 + height * 0.13;

    const tier = 3;


    tree.trunk(0, 0, 0, height - 1);


    for (let y = crownBase; y < height; y++) {

        const fromTop = (height - y) / (height - crownBase);

        const inTier = (y - crownBase) % tier;

        const radius = Math.max(0.6, maxRadius * fromTop * (1 - 0.32 * inTier / (tier - 1)) + 0.4);

        tree.disk(0, y, 0, radius, 0.28);


        // Opadające końce gałęzi pod najszerszą warstwą piętra.

        if (inTier === 0 && radius > 1.5) {

            const reach = Math.round(radius);

            for (const [dx, dz] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {

                if (random() < 0.55) {
                    tree.leaf(dx, y - 1, dz);
                }

            }

        }

    }


    // Czubek.

    tree.leaf(0, height, 0);
    tree.leaf(0, height + 1, 0);

    if (random() < 0.5) {
        tree.leaf(0, height + 2, 0);
    }

}


// Sosna: wysoki goły pień (dół gruba ciemna kora, góra pomarańczowa),
// na górze parasol z kilku osobnych kęp igliwia na krótkich gałęziach.
// Czasem z pnia wycieka żywica.

function pine(tree, size) {

    const random = tree.random;

    const height = Math.round(lerp(13, 19, size) + random() * 2);

    const lower = Math.round(height * lerp(0.4, 0.55, random()));


    tree.trunk(0, 0, 0, lower - 1, 'pine_log');
    tree.trunk(0, 0, lower, height - 1, 'pine_log_upper');


    // Żywica: jeden albo dwa bloki nisko na pniu.

    // Pień już istnieje. Zmieniamy tylko jego korę: tree.log() chroni
    // istniejący pień przed nadpisaniem przez blok o tej samej sile.
    const resinAt = (y) => {

        const cell = tree.cells.get(tree.key(0, y, 0));

        if (cell?.[3] === 'pine_log' || cell?.[3] === 'pine_log_upper') {
            cell[3] = 'pine_log_resin';
        }

    };

    if (random() < 0.4) {

        resinAt(1 + Math.floor(random() * 3));

        if (random() < 0.3) {
            resinAt(4 + Math.floor(random() * 2));
        }

    }


    // Główna kępa na czubku - płaska, szeroka.

    const topRadius = lerp(2.8, 3.8, size);

    tree.blob(0, height + 0.5, 0, topRadius, 1.7, topRadius, 0.6, 0.7);

    tree.log(0, height, 0, 'pine_log_upper');


    // Boczne kępy na gałęziach, niżej i w różne strony - razem
    // parasol szeroki na 8-11 bloków.

    const clumps = 3 + Math.floor(random() * 3);

    const angle0 = random() * Math.PI * 2;

    for (let i = 0; i < clumps; i++) {

        const angle = angle0 + i * Math.PI * 2 / clumps + (random() - 0.5) * 0.7;

        const y = height - 1 - Math.floor(random() * 2) - (i % 2);

        const reach = lerp(2.4, 3.8, random()) * lerp(0.85, 1.1, size);

        const ex = Math.cos(angle) * reach;
        const ez = Math.sin(angle) * reach;

        tree.branch(0, y - 1, 0, ex, y, ez, 'pine_log_upper');

        const r = lerp(2.1, 2.9, random());

        tree.blob(ex, y + 0.8, ez, r, 1.4, r, 0.55, 0.65);

    }

}


// Buk: dość długi pień, na górze szeroka, gęsta, lekko spłaszczona
// korona z konarami w środku. Pod nim opadłe liście.

function beech(tree, size) {

    const random = tree.random;

    const height = Math.round(lerp(5, 8, size) + random());

    const radius = lerp(3.4, 4.6, size);

    const crownY = height + lerp(1.2, 2.2, size);


    tree.trunk(0, 0, 0, height + 2);


    // Konary rozchodzące się w koronie.

    const limbs = 3 + Math.floor(random() * 2);

    const angle0 = random() * Math.PI * 2;

    for (let i = 0; i < limbs; i++) {

        const angle = angle0 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.6;

        const reach = radius * 0.55;

        tree.branch(0, height - 1, 0, Math.cos(angle) * reach, height + 1 + random() * 1.5, Math.sin(angle) * reach);

    }


    tree.blob(0, crownY, 0, radius, lerp(2.8, 3.4, size), radius, 0.62, 0.6);

    // Wierzch korony trochę nierówny - kilka kopułek.

    for (let i = 0; i < 3; i++) {

        const angle = random() * Math.PI * 2;

        const r = radius * 0.5;

        tree.blob(Math.cos(angle) * r, crownY + 1.5, Math.sin(angle) * r, radius * 0.5, 1.6, radius * 0.5, 0.6, 0.5);

    }


    tree.fallen(Math.round(radius), 0.32);

}


// Lipa: gruby ciemny pień (z nabiegami korzeniowymi), wysoka,
// zaokrąglona, bardzo gęsta korona. Zwykle kwitnie - żółte kwiatki
// na wierzchu korony.

function linden(tree, size) {

    const random = tree.random;

    const height = Math.round(lerp(4, 7, size) + random());

    const radius = lerp(3.0, 3.9, size);

    const tall = lerp(3.8, 4.8, size);

    const crownY = height + tall * 0.75;


    tree.trunk(0, 0, 0, Math.round(crownY + 1));


    // Nabiegi korzeniowe - pień u dołu grubszy.

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {

        if (random() < 0.6) {
            tree.trunk(dx, dz, 0, 0);
        }

    }


    tree.blob(0, crownY, 0, radius, tall, radius, 0.6, 0.65);


    // Kwitnienie: część liści na wierzchu korony z kwiatami.

    if (random() < 0.75) {

        const share = lerp(0.3, 0.55, random());

        for (const cell of tree.cells.values()) {

            const [x, y, z, type] = cell;

            if (type !== tree.parts.leaves) {
                continue;
            }

            const d = (x / radius) ** 2 + ((y - crownY) / tall) ** 2 + (z / radius) ** 2;

            if (d > 0.45 && random() < share) {
                cell[3] = 'linden_leaves_flowering';
            }

        }

    }

}


// Dąb: duży - pień 2 x 2, krótki i gruby, z niego 3-4 konary na boki
// i w górę, na końcach konarów kępy liści - szeroka, nieregularna
// korona. Mały - pień 1 x 1 i 2-3 konary. Pod spodem opadłe liście.

function oak(tree, size) {

    const random = tree.random;

    const big = size > 0.45;

    const height = Math.round(lerp(4, 6, size) + random());

    // Środek pnia (przy 2 x 2 - między czterema kolumnami).

    const c = big ? 0.5 : 0;


    if (big) {

        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            tree.trunk(dx, dz, 0, height);
        }

    }
    else {

        tree.trunk(0, 0, 0, height + 1);

        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {

            if (random() < 0.4) {
                tree.trunk(dx, dz, 0, 0);
            }

        }

    }


    const limbs = big ? 3 + Math.floor(random() * 2) : 2 + Math.floor(random() * 2);

    const angle0 = random() * Math.PI * 2;

    const reachMax = big ? 3.6 : 2.6;

    const blobRadius = big ? lerp(2.5, 3.0, size) : lerp(2.1, 2.5, size);

    for (let i = 0; i < limbs; i++) {

        const angle = angle0 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.7;

        const reach = lerp(reachMax * 0.7, reachMax, random());

        const ex = c + Math.cos(angle) * reach;
        const ez = c + Math.sin(angle) * reach;

        const ey = height + lerp(0.8, 3.6, random());

        // Konar zaczyna się trochę niżej wierzchu pnia i jest lekko
        // wygięty (przez punkt w połowie, wyżej).

        const mx = c + Math.cos(angle) * reach * 0.5;
        const mz = c + Math.sin(angle) * reach * 0.5;

        tree.branch(c, height - 1, c, mx, height + 0.8, mz);
        tree.branch(mx, height + 0.8, mz, ex, ey, ez);

        const r = blobRadius * lerp(0.85, 1.15, random());

        tree.blob(ex, ey + 1.2, ez, r, r * 0.85, r, 0.6, 0.55);

    }


    // Środek korony - wyżej, kopuła nad konarami.

    tree.blob(c, height + 3.5, c, blobRadius * 1.15, blobRadius * 0.95, blobRadius * 1.15, 0.6, 0.6);


    tree.fallen(big ? 5 : 4, 0.24);

}


// Brzoza: smukły, wysoki pień, czasem lekko pochylony; wąska, wysoka
// i ażurowa korona (dużo prześwitów), gałązki zwisają z brzegów.

function birch(tree, size) {

    const random = tree.random;

    const height = Math.round(lerp(8, 12, size) + random() * 2);


    // Pochylenie: od pewnej wysokości pień przesuwa się o 1 blok.

    let sx = 0;
    let sz = 0;

    const lean = random() < 0.5 ? Math.round(height * lerp(0.45, 0.7, random())) : height + 1;

    if (lean <= height) {

        const direction = Math.floor(random() * 4);

        sx = [1, -1, 0, 0][direction];
        sz = [0, 0, 1, -1][direction];

    }


    tree.trunk(0, 0, 0, Math.min(lean, height) - 1);

    if (lean <= height) {
        tree.trunk(sx, sz, lean - 1, height);
    }


    const radius = lerp(1.8, 2.4, size);

    const tall = lerp(2.8, 3.6, size);

    const crownY = height - 0.5;

    tree.blob(sx, crownY, sz, radius, tall, radius, 0.45, 0.55);


    // Zwisające gałązki: pod dolnym brzegiem korony 1-2 liście w dół.

    const bottom = Math.round(crownY - tall * 0.6);

    for (let z = -2; z <= 2; z++) {

        for (let x = -2; x <= 2; x++) {

            const d = Math.hypot(x, z);

            if (d < 1.5 || d > radius + 0.2 || random() > 0.35) {
                continue;
            }

            const length = 1 + Math.floor(random() * 2);

            for (let k = 0; k < length; k++) {
                tree.leaf(sx + x, bottom - k, sz + z);
            }

        }

    }

    tree.leaf(sx, height + 1, sz);

}


// ------------------------------------------------------------
// WŁASNE KSZTAŁTY Z WSPÓLNEGO KATALOGU DRZEW
// ------------------------------------------------------------

// Szablon: komórki [x, y, z, znak] narysowane w pliku .txt. Rozmiar
// drzewa wybiera szablon (pierwszy - najmniejsze drzewa, ostatni -
// największe), a każde drzewo jest losowo obrócone i odbite, więc
// w lesie nie stoją takie same.
//   P i @ - pień (@ - podstawa, tam stała sadzonka),
//   L     - liście, l - liście, ale nie zawsze (70%),
//   inny  - odmiana liści z tym "znakiem" (np. J - liście z jabłkami).

function templateTree(tree, size, definition) {

    const random = tree.random;

    const templates = definition.shape.templates;

    const cells = templates[Math.min(templates.length - 1, Math.floor(size * templates.length))];

    const turn = Math.floor(random() * 4);

    const mirror = random() < 0.5;

    const variants = new Map(
        definition.variants.filter((variant) => variant.char).map((variant) => [variant.char, treeVariantType(definition.id, variant.key)])
    );


    for (const [cx, y, cz, char] of cells) {

        let x = mirror ? -cx : cx;
        let z = cz;

        for (let k = 0; k < turn; k++) {
            [x, z] = [-z, x];
        }

        if (char === 'P' || char === '@') {

            tree.log(x, y, z);

            if (y === 0) {
                tree.roots.push([x, z, tree.parts.log]);
            }

        }
        else if (char === 'L') {
            tree.leaf(x, y, z);
        }
        else if (char === 'l') {

            if (random() < 0.7) {
                tree.leaf(x, y, z);
            }

        }
        else if (variants.has(char)) {
            tree.leaf(x, y, z, variants.get(char));
        }

    }

}


// Gotowe kształty: liczby z drzewo.json - wysokość pnia pod koroną,
// promień i wysokość korony, gęstość brzegu korony (0-1). Każda liczba
// to [dla małego, dla dużego drzewa].

function sizes(tree, size, shape) {

    const random = tree.random;

    return {
        trunk: Math.max(1, Math.round(lerp(shape.trunk[0], shape.trunk[1], size) + (random() - 0.5) * 0.9)),
        radius: lerp(shape.radius[0], shape.radius[1], size),
        tall: Math.max(1, lerp(shape.crown[0], shape.crown[1], size)),
        density: shape.density
    };

}


// Pień o okrągłym przekroju wokół (0, 0): radiusAt(y) - promień na
// wysokości y. Każda kolumna przy ziemi schodzi do gruntu jak zwykły pień.

function roundTrunk(tree, radiusAt, top) {

    for (let y = 0; y <= top; y++) {

        const r = radiusAt(y);
        const reach = Math.ceil(r);

        for (let z = -reach; z <= reach; z++) {

            for (let x = -reach; x <= reach; x++) {

                if (Math.hypot(x, z) > r) {
                    continue;
                }

                tree.log(x, y, z);

                if (y === 0) {
                    tree.roots.push([x, z, tree.parts.log]);
                }

            }

        }

    }

}


// Korzenie powietrzne: `count` sznurów zwisających spod korony (od
// najniższego liścia w kolumnie) w pierścieniu od `near` do `far` bloków
// od pnia, najwyżej `length` bloków, nie niżej niż `floor` (miejsce na
// przejście pod drzewem).

function hangingRoots(tree, type, count, near, far, from, top, length, floor) {

    const random = tree.random;

    for (let i = 0; i < count; i++) {

        const angle = random() * Math.PI * 2;
        const distance = near + random() * (far - near);
        const x = Math.round(Math.cos(angle) * distance), z = Math.round(Math.sin(angle) * distance);

        let y = Math.max(1, from);

        while (y <= top && !tree.has(x, y, z)) {
            y++;
        }

        const hang = 1 + Math.floor(random() * length);

        if (y > top) {
            continue;
        }

        for (let k = 1; k <= hang && y - k >= floor; k++) {

            if (tree.has(x, y - k, z)) {
                break;
            }

            tree.leaf(x, y - k, z, type);

        }

    }

}


const CATALOG_SHAPES = {

    // An umbrella made from separate flattened crowns on spreading limbs.
    // Its broad shade is deliberately much wider than the standing player.
    acacia(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        const fork = Math.max(3, crownBase - 1);
        tree.trunk(0, 0, 0, fork + 1);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, fork - 2);
        }
        const limbs = 5 + Math.floor(random() * 2);
        const angle0 = random() * Math.PI * 2;
        const crownY = height - 2.5;
        tree.blob(0, crownY, 0, radius * 0.5, 1.45, radius * 0.5, 0.68, shape.density);
        for (let i = 0; i < limbs; i++) {
            const angle = angle0 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.25;
            const reach = radius * (0.52 + random() * 0.05);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = crownY - (i % 3 === 0 ? 0.7 : 0);
            tree.branch(0, fork, 0, x, y - 0.5, z);
            tree.blob(x, y, z, radius * 0.45, 1.45, radius * 0.45, 0.66, shape.density);
        }
        tree.leaf(0, height - 1, 0);

    },

    // Tall, tapered swamp tree: a buttressed base, low root knees and airy
    // tiers of horizontal limbs. Roots are placed by the existing terrain
    // rules and therefore never overwrite water or a player's construction.
    bald_cypress(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        tree.trunk(0, 0, 0, height - 2);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.round(height * 0.66));
        }
        const footHeight = Math.max(2, Math.round(height * 0.1));
        for (const [x, z] of [[-1, 0], [0, -1], [2, 1], [1, 2]]) tree.trunk(x, z, 0, footHeight);
        for (const [x, z] of [[-1, 1], [1, -1], [2, 0], [0, 2]]) tree.trunk(x, z, 0, 1);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < 4; i++) {
            const angle = phase + i * Math.PI / 2;
            const reach = 3 + Math.floor(random() * 2);
            const x = Math.round(Math.cos(angle) * reach), z = Math.round(Math.sin(angle) * reach);
            tree.trunk(x, z, 0, random() < 0.3 ? 1 : 0);
        }
        const tiers = Math.max(4, Math.round((height - crownBase) / 3.3));
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / tiers;
            const y = Math.round(lerp(crownBase + 1, height - 4, t));
            const tierRadius = radius * (1 - t * 0.66);
            const phaseAtTier = phase + tier * 1.7;
            tree.blob(0, y, 0, Math.max(1, tierRadius * 0.5), 1.25, Math.max(1, tierRadius * 0.5), 0.65, shape.density);
            for (let branch = 0; branch < 3; branch++) {
                const angle = phaseAtTier + branch * Math.PI * 2 / 3 + (random() - 0.5) * 0.3;
                const x = Math.cos(angle) * tierRadius * 0.59, z = Math.sin(angle) * tierRadius * 0.59;
                tree.branch(0, y - 1, 0, x, y, z);
                const r = Math.max(1, tierRadius * 0.46);
                tree.blob(x, y + 0.5, z, r, 1.25, r, 0.66, shape.density);
            }
        }
        tree.blob(0, height - 3, 0, Math.max(1.4, radius * 0.3), 2, Math.max(1.4, radius * 0.3), 0.68, shape.density);
        tree.leaf(0, height - 1, 0);

    },

    // A low fork and spreading round blossom clusters leave room beneath
    // an adult crown, instead of scaling a sapling into a thin tall pole.
    cherry(tree, size, shape) {

        const { height, radius, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        const fork = Math.max(2, crownBase - 1);
        tree.trunk(0, 0, 0, fork + 1);
        if (size > 0.65) tree.trunk(1, 0, 0, 0);
        const tall = (height - 1 - crownBase) / 2;
        const crownY = height - 1 - tall;
        tree.blob(0, crownY, 0, radius * 0.6, tall, radius * 0.6, 0.7, shape.density);
        const limbs = 4 + Math.floor(random() * 2);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < limbs; i++) {
            const angle = phase + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.25;
            const x = Math.cos(angle) * radius * 0.5, z = Math.sin(angle) * radius * 0.5;
            const y = crownY - (i % 3 === 0 ? 0.6 : 0);
            tree.branch(0, fork, 0, x, y, z);
            tree.blob(x, y, z, radius * 0.53, tall, radius * 0.53, 0.68, shape.density);
        }
        tree.leaf(0, height - 1, 0);

    },

    // ---- 0.83.0: paczki Kamila (klon, kosodrzewina, oliwka, eukaliptus
    // tęczowy, sekwoja). Rozmiary jak w render_info.json paczek.

    // Klon jesienny: krótki pień, szeroka, zaokrąglona korona z kilku
    // kopuł - pomarańczowa i złota.
    maple(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        const fork = crownBase + 1;
        tree.trunk(0, 0, 0, fork + 2);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, fork - 1);
        }
        const tall = (height - 1 - crownBase) / 2;
        const crownY = height - 1 - tall;
        tree.blob(0, crownY, 0, radius * 0.62, tall * 0.95, radius * 0.62, 0.62, shape.density);
        const lobes = 5 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < lobes; i++) {
            const angle = phase + i * Math.PI * 2 / lobes + (random() - 0.5) * 0.35;
            const reach = radius * (0.42 + random() * 0.08);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = crownY - tall * 0.25 + (random() - 0.5) * 1.5;
            tree.branch(0, fork, 0, x * 0.8, y - 1, z * 0.8);
            const r = radius * (0.5 + random() * 0.06);
            tree.blob(x, y, z, r, tall * 0.62, r, 0.62, shape.density);
        }
        tree.blob(0, height - 1 - tall * 0.45, 0, radius * 0.45, tall * 0.5, radius * 0.45, 0.6, shape.density);
        tree.leaf(0, height - 1, 0);

    },

    // Kosodrzewina: niski krzew bez prostego pnia - kilka pokładających
    // się pni rozchodzi się przy ziemi i podnosi końcami, na nich płaskie
    // kępy igliwia. Sąsiednie krzewy zrastają się w gęste łany.
    mugo(tree, size, shape) {

        const { height, radius } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        tree.trunk(0, 0, 0, 1);
        const stems = 3 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < stems; i++) {
            const angle = phase + i * Math.PI * 2 / stems + (random() - 0.5) * 0.6;
            const reach = radius * (0.55 + random() * 0.3);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const lift = Math.min(height - 2, 1 + Math.floor(random() * 2));
            // Pień leży na ziemi, dopiero koniec się podnosi.
            tree.branch(0, 0, 0, x * 0.6, 0, z * 0.6);
            tree.branch(x * 0.6, 0, z * 0.6, x, lift, z);
            const r = Math.max(1.4, radius * (0.42 + random() * 0.12));
            tree.blob(x, lift + 0.6, z, r, Math.max(1, (height - lift) * 0.55), r, 0.6, shape.density);
            tree.blob(x * 0.5, 1.2, z * 0.5, r * 0.8, 1.1, r * 0.8, 0.55, shape.density);
        }
        tree.blob(0, height - 2, 0, 1.6, 1.2, 1.6, 0.6, shape.density);
        tree.leaf(0, height - 1, 0);

    },

    // Oliwka: gruby, sękaty, skręcony pień (u dużych 2 x 2, z nabiegami),
    // nisko rozwidlony; płaska, szeroka, szarozielona korona z prześwitami.
    olive(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        const lean = random() * Math.PI * 2;
        const dx = Math.round(Math.cos(lean)), dz = Math.round(Math.sin(lean));
        tree.trunk(0, 0, 0, crownBase - 1);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.max(1, crownBase - 2));
            for (const [x, z] of [[-1, 0], [2, 1], [0, 2]]) if (random() < 0.7) tree.trunk(x, z, 0, 0);
        }
        // Skręt pnia: górna część przesunięta o blok w bok.
        tree.branch(0, crownBase - 1, 0, dx, crownBase + 1, dz);
        const limbs = 3 + Math.floor(random() * 2);
        const tall = Math.max(1.2, (height - crownBase) * 0.36);
        const crownY = height - 1 - tall;
        for (let i = 0; i < limbs; i++) {
            const angle = lean + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.4;
            const reach = radius * (0.5 + random() * 0.1);
            const x = dx + Math.cos(angle) * reach, z = dz + Math.sin(angle) * reach;
            tree.branch(dx, crownBase + 1, dz, x * 0.75, crownY, z * 0.75);
            const r = radius * (0.5 + random() * 0.08);
            tree.blob(x, crownY + 0.3, z, r, tall, r, 0.58, shape.density);
        }
        tree.blob(dx, crownY + 0.6, dz, radius * 0.55, tall, radius * 0.55, 0.6, shape.density);
        tree.leaf(0, height - 1, 0);

    },

    // Eukaliptus tęczowy: bardzo wysoki, prosty, kolorowy pień (u dużych
    // 2 x 2, z niskimi nabiegami) i na samej górze parasol z osobnych,
    // płaskich chmur liści na rozłożystych konarach.
    rainbow_eucalyptus(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        tree.trunk(0, 0, 0, crownBase + 2);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, crownBase);
            for (const [x, z] of [[-1, 0], [0, -1], [2, 1], [1, 2]]) tree.trunk(x, z, 0, 1);
        }
        else {
            for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (random() < 0.6) tree.trunk(x, z, 0, 0);
        }
        const limbs = 5 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        const top = height - 1;
        for (let i = 0; i < limbs; i++) {
            const angle = phase + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.3;
            const reach = radius * (0.52 + random() * 0.12);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = Math.round(lerp(crownBase + 2, top - 2.5, random()));
            const fromY = Math.max(crownBase, y - 3);
            tree.branch(0, fromY, 0, x * 0.55, y - 1, z * 0.55);
            tree.branch(x * 0.55, y - 1, z * 0.55, x, y, z);
            const r = radius * (0.38 + random() * 0.08);
            tree.blob(x, y + 0.8, z, r, 1.7, r, 0.62, shape.density);
        }
        tree.blob(0, top - 1.8, 0, radius * 0.42, 1.9, radius * 0.42, 0.62, shape.density);
        tree.leaf(0, top, 0);

    },

    // Sekwoja olbrzymia: gruby (3 x 3 albo 4 x 4) rudy pień z szeroką,
    // schodkową podstawą, długo goły; korona dopiero w górnej połowie -
    // krótkie, poziome konary z kępami igliwia, zwężająca się do
    // zaokrąglonego czubka.
    sequoia(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random;
        const low = -Math.floor((trunkWidth - 1) / 2), high = low + trunkWidth - 1;
        const top = height - 1;
        for (let x = low; x <= high; x++) for (let z = low; z <= high; z++) {
            const corner = (x === low || x === high) && (z === low || z === high);
            tree.trunk(x, z, 0, corner ? top - 6 : top - 2);
        }
        // Schodkowa podstawa: dwa pierścienie coraz niższych nabiegów.
        for (let ring = 1; ring <= 2; ring++) {
            for (let x = low - ring; x <= high + ring; x++) for (let z = low - ring; z <= high + ring; z++) {
                if (x >= low - ring + 1 && x <= high + ring - 1 && z >= low - ring + 1 && z <= high + ring - 1) continue;
                const corner = (x === low - ring || x === high + ring) && (z === low - ring || z === high + ring);
                if (corner || random() < 0.25 * ring) continue;
                tree.trunk(x, z, 0, Math.max(0, 3 - ring * 1.5 + Math.round(random())));
            }
        }
        const centre = (low + high) / 2;
        const tiers = Math.max(5, Math.round((top - crownBase) / 3));
        const phase = random() * Math.PI * 2;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / (tiers - 1);
            const y = Math.round(lerp(crownBase, top - 3, t));
            // Najszersza korona w dolnej jednej trzeciej, potem coraz węższa.
            const width = radius * (t < 0.3 ? 0.75 + t : 1.05 - (t - 0.3) * 0.95);
            const branches = 2 + Math.floor(random() * 3);
            for (let b = 0; b < branches; b++) {
                if (random() < 0.15) continue;
                const angle = phase + tier * 2.1 + b * Math.PI * 2 / branches + (random() - 0.5) * 0.5;
                const reach = trunkWidth / 2 + width * (0.55 + random() * 0.3);
                const x = centre + Math.cos(angle) * reach, z = centre + Math.sin(angle) * reach;
                tree.branch(centre + Math.cos(angle) * trunkWidth / 2, y, centre + Math.sin(angle) * trunkWidth / 2, x, y + (random() < 0.4 ? 1 : 0), z);
                const r = Math.max(1.3, width * (0.42 + random() * 0.1));
                tree.blob(x, y + 0.8, z, r, 1.5, r, 0.6, shape.density);
            }
            tree.blob(centre, y + 1, centre, trunkWidth / 2 + 1.1, 1.3, trunkWidth / 2 + 1.1, 0.7, shape.density * 0.8);
        }
        tree.blob(centre, top - 2, centre, trunkWidth / 2 + 1.2, 2.4, trunkWidth / 2 + 1.2, 0.62, shape.density);
        tree.leaf(Math.round(centre), top, Math.round(centre));

    },

    // Miłorząb: wysoki przewodnik, grubszy dół pnia i nieregularne piętra
    // wznoszących się konarów. Kępy zostawiają prześwity między piętrami;
    // złota korona zwęża się ku górze, ale nie tworzy równego stożka.
    ginkgo(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        tree.trunk(0, 0, 0, top - 2);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, crownBase + 2);
        }
        const tiers = 4 + Math.round(size);
        const phase = random() * Math.PI * 2;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / (tiers - 1);
            const y = Math.round(lerp(crownBase + 1, top - 3, t));
            const width = radius * (t < 0.3 ? 0.9 + t / 3 : 1 - (t - 0.3) * 0.8);
            const thickness = 1.4 + size * 0.3;
            // Keep the central leader inside a small leaf cluster, while
            // most foliage grows at irregular branch tips around it.
            tree.blob(0, y + 0.4, 0, Math.max(1.5, width * 0.4), thickness, Math.max(1.5, width * 0.4), 0.64, shape.density);
            for (let limb = 0; limb < 4; limb++) {
                const angle = phase + tier * 1.1 + limb * Math.PI / 2 + (random() - 0.5) * 0.3;
                const reach = width * (0.58 + random() * 0.06);
                const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
                const lift = (limb % 2) * 0.5;
                tree.branch(0, y - 2, 0, x * 0.55, y - 0.4, z * 0.55);
                tree.branch(x * 0.55, y - 0.4, z * 0.55, x, y + lift, z);
                const r = width * (0.41 + random() * 0.04);
                tree.blob(x, y + lift + 0.4, z, r, thickness, r, 0.65, shape.density);
            }
        }
        tree.blob(0, top - 1.4, 0, Math.max(1.5, radius * 0.3), 1.4, Math.max(1.5, radius * 0.3), 0.65, shape.density);
        tree.leaf(0, top, 0);

    },

    // Jakaranda: nisko rozwidlony pień i długie, łukowate konary.
    // Korona jest szerokim, płytkim sklepieniem z osobnych chmur kwiatów;
    // od spodu pozostaje przestrzeń na spacer przy pniu.
    jacaranda(tree, size, shape) {

        const { height, radius, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const phase = random() * Math.PI * 2;
        const crownY = top - 1.7;
        const thickness = 1.4 + size * 0.3;
        tree.trunk(0, 0, 0, crownBase);
        if (size > 0.7) tree.trunk(1, 0, 0, 1);
        const limbs = 6 + Math.floor(random() * 2);
        for (let limb = 0; limb < limbs; limb++) {
            const angle = phase + limb * Math.PI * 2 / limbs + (random() - 0.5) * 0.22;
            const reach = radius * (0.58 + random() * 0.05);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = crownY - (limb % 3 === 0 ? 0.8 : 0);
            const middleY = crownBase + (y - crownBase) * 0.65;
            tree.branch(0, crownBase - 1, 0, x * 0.45, middleY, z * 0.45);
            tree.branch(x * 0.45, middleY, z * 0.45, x, y - 0.4, z);
            const r = radius * (0.39 + random() * 0.04);
            tree.blob(x, y, z, r, thickness, r, 0.6, shape.density);
            // A shorter side branch breaks the perfect radial symmetry.
            const side = angle + 0.7;
            const sx = x * 0.55 + Math.cos(side) * radius * 0.22;
            const sz = z * 0.55 + Math.sin(side) * radius * 0.22;
            tree.branch(x * 0.45, middleY, z * 0.45, sx, y - 1, sz);
            tree.blob(sx, y - 0.5, sz, r * 0.7, thickness * 0.8, r * 0.7, 0.6, shape.density);
        }
        tree.blob(0, crownY + 0.25, 0, radius * 0.46, 1.4, radius * 0.46, 0.63, shape.density);
        tree.leaf(0, top, 0);

    },

    // ---- 1.8.0: trzynaście drzew z paczki Kamila "drzewa_od_jodly".
    // Rozmiary dojrzałych drzew jak w naturze (1 blok = 1 m), sylwetki
    // według podglądów z paczki.

    // Jodła: wysoki, prosty pień (dół goły, z suchymi sękami), wąski stożek
    // z gęstych pięter, czubek spłaszczony w "bocianie gniazdo".
    fir(tree, size) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, c = trunkWidth === 2 ? 0.5 : 0;
        tree.trunk(0, 0, 0, top - 1);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.round(height * 0.55));
        }
        for (let y = Math.round(crownBase * 0.45); y < crownBase - 1; y += 2 + Math.floor(random() * 3)) {
            const [dx, dz] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(random() * 4)];
            tree.log(dx > 0 ? trunkWidth : dx, y, dz > 0 ? trunkWidth : dz);
        }
        const span = Math.max(1, top - 2 - crownBase);
        for (let y = crownBase; y <= top - 2; y++) {
            const t = (y - crownBase) / span;
            const wide = (y - crownBase) % 2 === 0;
            const profile = t < 0.12 ? 0.7 + t * 2.5 : 1 - (t - 0.12) * 0.82;
            tree.disk(c, y, c, Math.max(1.2, radius * profile * (wide ? 1 : 0.62)), wide ? 0.3 : 0.45);
        }
        tree.disk(c, top - 1, c, Math.max(1.6, radius * 0.3), 0.2);
        tree.disk(c, top, c, 0.8, 0);
        tree.leaf(0, top, 0);

    },

    // Baobab: bardzo gruby, butelkowaty pień (5-7 bloków średnicy) i płaska,
    // szeroka korona z krótkich, grubych konarów na samej górze.
    baobab(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, base = trunkWidth / 2;
        roundTrunk(tree, (y) => {
            const t = y / crownBase;
            return base * (1 + 0.1 * Math.sin(Math.PI * t)) * (1 - 0.2 * t) + (y === 0 ? 0.4 : 0);
        }, crownBase);
        const limbs = 6 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        const crownY = top - 1.6;
        for (let i = 0; i < limbs; i++) {
            const angle = phase + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.3;
            const reach = radius * (0.55 + random() * 0.12);
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const x = cos * reach, z = sin * reach, y = crownY - (i % 2 ? 0.8 : 0);
            tree.branch(cos * base * 0.6, crownBase, sin * base * 0.6, x * 0.6, y - 1.5, z * 0.6);
            tree.branch(cos * base * 0.6, crownBase + 1, sin * base * 0.6, x * 0.6, y - 0.5, z * 0.6);
            tree.branch(x * 0.6, y - 1, z * 0.6, x, y - 0.3, z);
            tree.blob(x, y, z, radius * 0.4, 1.5, radius * 0.4, 0.62, shape.density);
            tree.blob(x * 0.55, y + 0.4, z * 0.55, radius * 0.36, 1.4, radius * 0.36, 0.62, shape.density);
        }
        tree.blob(0, crownY + 0.3, 0, radius * 0.45, 1.5, radius * 0.45, 0.62, shape.density);
        tree.leaf(0, top, 0);

    },

    // Palma kokosowa: smukły, łukowato wygięty pień i pióropusz długich,
    // opadających liści; pod liśćmi przy pniu kiście kokosów.
    coconut_palm(tree, size) {

        const { height, radius } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, trunkTop = top - 2;
        const lean = random() * Math.PI * 2;
        const bend = 0.5 + size * 1.5 + random() * 1.5;
        tree.trunk(0, 0, 0, 0);
        let px = 0, pz = 0;
        for (let y = 1; y <= trunkTop; y++) {
            const t = y / trunkTop;
            const x = Math.cos(lean) * bend * t * t, z = Math.sin(lean) * bend * t * t;
            tree.branch(px, y - 1, pz, x, y, z);
            // Przy przesunięciu w bok pień styka się ścianą, nie samym rogiem.
            if (Math.round(x) !== Math.round(px) || Math.round(z) !== Math.round(pz)) tree.log(x, y - 1, z);
            px = x;
            pz = z;
        }
        const fx = Math.round(px), fz = Math.round(pz);
        const fronds = 7 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < fronds; i++) {
            const angle = phase + i * Math.PI * 2 / fronds + (random() - 0.5) * 0.3;
            const cos = Math.cos(angle), sin = Math.sin(angle);
            const length = radius * (0.85 + random() * 0.2);
            const steps = Math.ceil(length * 1.4);
            let y = trunkTop + 1;
            for (let s = 1; s <= steps; s++) {
                const u = s / steps, d = length * u;
                y = trunkTop + 1 + 1.6 * u - 3.6 * u * u;
                tree.leaf(fx + cos * d, y, fz + sin * d);
                if (s % 2 && u > 0.3 && u < 0.85) {
                    const side = s % 4 === 1 ? 1 : -1;
                    tree.leaf(fx + cos * d - sin * side, y - (u > 0.6 ? 1 : 0), fz + sin * d + cos * side);
                }
            }
            tree.leaf(fx + cos * length, y - 1, fz + sin * length);
        }
        tree.leaf(fx, trunkTop + 1, fz);
        tree.leaf(fx, top, fz);
        const coconuts = treeVariantType(tree.species, 'kokosy');
        const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const first = Math.floor(random() * 4), count = 1 + Math.floor(random() * 2 + size);
        for (let i = 0; i < count; i++) {
            const [dx, dz] = spots[(first + i) % 4];
            tree.leaf(fx + dx, trunkTop, fz + dz, coconuts);
        }

    },

    // Modrzew: prosty pień, luźny, ażurowy stożek z pięter cienkich
    // konarów, których końce opadają.
    larch(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        tree.trunk(0, 0, 0, top - 1);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.round(height * 0.4));
        }
        const phase = random() * Math.PI * 2;
        const span = Math.max(1, top - 2 - crownBase);
        for (let y = crownBase, tier = 0; y <= top - 2; y += 2, tier++) {
            const t = (y - crownBase) / span;
            const r = Math.max(1.3, radius * (1 - 0.8 * t));
            const limbs = r > 3 ? 5 : 4;
            tree.disk(0, y, 0, Math.max(1, r * 0.34), 0.4);
            for (let i = 0; i < limbs; i++) {
                const angle = phase + tier * 0.9 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.4;
                const length = r * (0.75 + random() * 0.25);
                const x = Math.cos(angle) * length, z = Math.sin(angle) * length;
                if (r > 3) tree.branch(0, y, 0, x * 0.45, y, z * 0.45);
                tree.blob(x * 0.55, y + 0.2, z * 0.55, 1.1 + r * 0.12, 0.9, 1.1 + r * 0.12, 0.45, shape.density);
                tree.blob(x, y - 0.6, z, 1 + r * 0.08, 0.9, 1 + r * 0.08, 0.4, shape.density);
            }
        }
        tree.disk(0, top - 1, 0, 1, 0.3);
        tree.leaf(0, top, 0);

    },

    // Namorzyn: pień stoi na łukach korzeni podporowych (w wodzie albo
    // w błocie), nad nimi gęsta, zaokrąglona korona, spod której zwisają
    // korzenie powietrzne.
    mangrove(tree, size, shape) {

        const { height, radius, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const roots = treeRootsType(tree.species);
        tree.trunk(0, 0, 0, crownBase + 1);
        const arcs = 5 + Math.floor(random() * 3) + Math.round(size * 2);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < arcs; i++) {
            const angle = phase + i * Math.PI * 2 / arcs + (random() - 0.5) * 0.5;
            const reach = 1.6 + random() * 1.6 + size;
            const from = crownBase - 2 + (random() < 0.5 ? 1 : 0);
            const steps = Math.ceil(Math.max(reach, from)) * 2;
            let ex = 0, ez = 0;
            for (let s = 1; s <= steps; s++) {
                const u = s / steps;
                const x = Math.round(Math.cos(angle) * reach * u), z = Math.round(Math.sin(angle) * reach * u);
                if (x === 0 && z === 0) continue;
                tree.leaf(x, from * (1 - u * u), z, roots);
                ex = x;
                ez = z;
            }
            // Koniec łuku stoi na ziemi i schodzi do gruntu jak pień.
            if (ex || ez) tree.roots.push([ex, ez, roots]);
        }
        const tall = top - crownBase, cy = crownBase + tall * 0.5;
        tree.blob(0, cy, 0, radius * 0.78, tall * 0.5, radius * 0.78, 0.66, shape.density);
        const lobes = 4 + Math.floor(random() * 2);
        for (let i = 0; i < lobes; i++) {
            const angle = phase + 0.4 + i * Math.PI * 2 / lobes + (random() - 0.5) * 0.4;
            const x = Math.cos(angle) * radius * 0.42, z = Math.sin(angle) * radius * 0.42;
            const y = cy - tall * 0.1 + (random() - 0.5);
            tree.branch(0, crownBase, 0, x * 0.6, y - 0.5, z * 0.6);
            tree.blob(x, y, z, radius * 0.56, tall * 0.36, radius * 0.56, 0.66, shape.density);
        }
        tree.leaf(0, top, 0);
        hangingRoots(tree, roots, 3 + Math.round(size * 4), radius * 0.35, radius * 0.8, crownBase - 1, top, 3, 1);

    },

    // Puchowiec (kapok): olbrzym lasu deszczowego - prosty, gruby pień
    // z wysokimi przyporami korzeni i parasol z poziomych pięter konarów
    // dopiero na samej górze, ponad innymi drzewami.
    kapok(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const low = trunkWidth === 3 ? -1 : 0, high = low + trunkWidth - 1, centre = (low + high) / 2;
        for (let x = low; x <= high; x++) for (let z = low; z <= high; z++) {
            const corner = trunkWidth === 3 && x !== 0 && z !== 0;
            tree.trunk(x, z, 0, corner ? Math.round(height * 0.45) : crownBase + 2);
        }
        const finHeight = Math.round(lerp(4, 8, size));
        const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], ...(size > 0.45 ? [[1, 1], [-1, -1], [1, -1], [-1, 1]] : [])];
        for (const [dx, dz] of sides) {
            const diagonal = dx !== 0 && dz !== 0;
            const length = (diagonal ? 1 : 2) + Math.floor(random() * 2) + (size > 0.5 ? 1 : 0);
            for (let d = 1; d <= length; d++) {
                const x = (dx > 0 ? high : dx < 0 ? low : Math.round(centre)) + dx * d;
                const z = (dz > 0 ? high : dz < 0 ? low : Math.round(centre)) + dz * d;
                tree.trunk(x, z, 0, Math.max(0, Math.round(finHeight * (diagonal ? 0.6 : 1) * (1 - d / (length + 1)) ** 1.3)));
            }
        }
        const phase = random() * Math.PI * 2;
        const levels = [[crownBase + 1, 0.9], [crownBase + (top - crownBase) * 0.5, 1], [top - 2.5, 0.6]];
        for (const [index, [y, part]] of levels.entries()) {
            const r = radius * part;
            const limbs = 5 + Math.floor(random() * 2) - (index === 2 ? 1 : 0);
            for (let i = 0; i < limbs; i++) {
                const angle = phase + index * 0.7 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.3;
                const reach = r * (0.55 + random() * 0.1);
                const x = centre + Math.cos(angle) * reach, z = centre + Math.sin(angle) * reach;
                const mx = centre + Math.cos(angle) * reach * 0.55, mz = centre + Math.sin(angle) * reach * 0.55;
                tree.branch(centre, y - 2, centre, mx, y - 0.5, mz);
                tree.branch(mx, y - 0.5, mz, x, y, z);
                tree.blob(x, y + 0.6, z, r * 0.42, 1.6, r * 0.42, 0.62, shape.density);
            }
        }
        tree.blob(centre, top - 1.6, centre, radius * 0.42, 1.6, radius * 0.42, 0.62, shape.density);
        tree.leaf(Math.round(centre), top, Math.round(centre));

    },

    // Drzewo Jozuego (jukka): niski pień rozwidla się kilka razy, każda
    // gałąź kończy się kolczastą rozetą liści; pod rozetami pień okrywają
    // suche liście (kosmata kora).
    joshua_tree(tree, size, shape) {

        const { height, radius, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const shaggy = treeLogType(tree.species, 'shaggy');
        tree.trunk(0, 0, 0, crownBase);
        const tips = [];
        const grow = (x, y, z, angle, depth) => {
            const out = 1.4 + random() * 1.4;
            let nx = x + Math.cos(angle) * out, nz = z + Math.sin(angle) * out;
            const ny = Math.min(top - 2, y + 2 + Math.floor(random() * 2));
            const far = Math.hypot(nx, nz), limit = Math.max(1, radius - 1.4);
            if (far > limit) {
                nx *= limit / far;
                nz *= limit / far;
            }
            tree.branch(x, y, z, nx, ny, nz, shaggy);
            if (depth <= 0 || ny >= top - 2 || random() < 0.2) {
                tips.push([nx, ny, nz]);
                return;
            }
            const forks = random() < 0.35 ? 3 : 2;
            const turn = random() * Math.PI * 2;
            for (let k = 0; k < forks; k++) grow(nx, ny, nz, turn + k * Math.PI * 2 / forks + (random() - 0.5) * 0.6, depth - 1);
        };
        const arms = 2 + Math.floor(random() * 2) + (size > 0.6 ? 1 : 0);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < arms; i++) {
            grow(0, crownBase, 0, phase + i * Math.PI * 2 / arms + (random() - 0.5) * 0.5, 1 + Math.round(size * 1.4));
        }
        // Najwyższa gałąź sięga pełnej wysokości drzewa.
        const highest = tips.reduce((best, tip) => tip[1] > best[1] ? tip : best, tips[0]);
        if (highest[1] < top - 2) {
            tree.branch(highest[0], highest[1], highest[2], highest[0], top - 2, highest[2], shaggy);
            highest[1] = top - 2;
        }
        for (const [x, y, z] of tips) tree.blob(x, y + 1, z, 1.5, 1.4, 1.5, 0.7, shape.density);
        tree.leaf(highest[0], top, highest[2]);

    },

    // Osika: smukły, jasny pień (u starych drzew przy ziemi ciemna,
    // spękana kora), wysoko osadzona, wąska i ażurowa korona.
    aspen(tree, size, shape) {

        const { height, radius, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const baseHeight = size > 0.35 ? 1 + Math.round(size * 2) : 0;
        if (baseHeight > 0) tree.trunk(0, 0, 0, baseHeight - 1, treeLogType(tree.species, 'base'));
        for (let y = baseHeight; y <= top - 2; y++) tree.log(0, y, 0);
        if (baseHeight === 0) tree.roots.push([0, 0, tree.parts.log]);
        const tall = top - crownBase, middle = crownBase + tall * 0.5;
        tree.blob(0, middle, 0, radius * 0.92, tall * 0.52, radius * 0.92, 0.55, shape.density);
        const lobes = 5 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < lobes; i++) {
            const angle = phase + i * Math.PI * 2 / lobes + (random() - 0.5) * 0.5;
            const x = Math.cos(angle) * radius * 0.45, z = Math.sin(angle) * radius * 0.45;
            const y = crownBase + tall * (0.2 + 0.6 * (i + random()) / lobes);
            tree.branch(0, y - 1, 0, x * 0.7, y, z * 0.7);
            tree.blob(x, y, z, radius * 0.6, Math.max(1.6, tall * 0.24), radius * 0.6, 0.5, shape.density);
        }
        tree.blob(0, top - 1.5, 0, Math.max(1.3, radius * 0.45), 1.6, Math.max(1.3, radius * 0.45), 0.55, shape.density);
        tree.leaf(0, top, 0);

    },

    // Araukaria chilijska: prosty jak słup pień, długo goły; na górze
    // parasol z okółków długich konarów - od spodu gołych, na końcach
    // zadartych do góry i okrytych łuskowatym igliwiem jak liny.
    araucaria(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, c = trunkWidth === 2 ? 0.5 : 0;
        tree.trunk(0, 0, 0, top - 1);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.round(height * 0.6));
        }
        const tiers = Math.max(4, Math.round((top - crownBase) / 2.5));
        const phase = random() * Math.PI * 2;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / (tiers - 1);
            const y = Math.round(lerp(crownBase, top - 2, t));
            const r = radius * (t < 0.3 ? 0.8 + t * 0.67 : 1 - (t - 0.3));
            const limbs = 5 + (r > 5 ? 1 : 0);
            for (let i = 0; i < limbs; i++) {
                const angle = phase + tier * 0.63 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.2;
                const length = Math.max(1.5, r * (0.85 + random() * 0.15));
                const steps = Math.ceil(length);
                for (let s = 1; s <= steps; s++) {
                    const u = s / steps, d = length * u;
                    const x = c + Math.cos(angle) * d, z = c + Math.sin(angle) * d;
                    const rise = u > 0.6 ? Math.round((u - 0.6) * 4) : 0;
                    if (u <= 0.5) {
                        tree.log(x, y, z);
                        if (random() < shape.density) tree.leaf(x, y + 1, z);
                    }
                    else {
                        tree.leaf(x, Math.min(top, y + rise), z);
                        if (s === steps) tree.leaf(x, Math.min(top, y + rise + 1), z);
                    }
                }
            }
        }
        tree.blob(c, top - 1, c, 1.6, 1.4, 1.6, 0.7, shape.density);
        tree.leaf(0, top, 0);

    },

    // Figowiec bengalski (banian): pień zrośnięty z kilku, długie poziome
    // konary podparte słupami korzeni, które urosły aż do ziemi, i bardzo
    // szeroka, niska kopuła liści z zasłoną wiszących korzeni powietrznych.
    banyan(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const roots = treeRootsType(tree.species);
        const low = -1, high = trunkWidth === 3 ? 1 : 0;
        for (let x = low; x <= high; x++) for (let z = low; z <= high; z++) {
            const corner = (x === low || x === high) && (z === low || z === high) && !(x === 0 && z === 0);
            tree.trunk(x, z, 0, corner && random() < 0.4 ? Math.max(1, crownBase - 2) : crownBase + 1);
        }
        const limbs = 6 + Math.floor(random() * 3);
        const phase = random() * Math.PI * 2;
        const tall = top - crownBase, cy = crownBase + tall * 0.5;
        for (let i = 0; i < limbs; i++) {
            const angle = phase + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.3;
            const reach = radius * (0.55 + random() * 0.1);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = crownBase + 1 + Math.floor(random() * 2);
            tree.branch(0, crownBase, 0, x * 0.5, y, z * 0.5);
            tree.branch(0, crownBase + 1, 0, x * 0.4, y + 1, z * 0.4);
            tree.branch(x * 0.5, y, z * 0.5, x, y + 1, z);
            tree.blob(x, cy, z, radius * 0.38, tall * 0.4, radius * 0.38, 0.64, shape.density);
            tree.blob(x * 0.55, cy + 0.4, z * 0.55, radius * 0.36, tall * 0.42, radius * 0.36, 0.64, shape.density);
            if (random() < 0.75) {
                const u = 0.55 + random() * 0.35;
                const px = Math.round(x * u), pz = Math.round(z * u);
                tree.trunk(px, pz, 0, Math.round(y + (u - 0.5) * 2));
                if (random() < 0.4) tree.trunk(px + (random() < 0.5 ? 1 : -1), pz, 0, 1 + Math.floor(random() * 3));
            }
        }
        tree.blob(0, cy + tall * 0.08, 0, radius * 0.5, tall * 0.42, radius * 0.5, 0.64, shape.density);
        tree.leaf(0, top, 0);
        hangingRoots(tree, roots, Math.round(10 + size * 14), radius * 0.2, radius * 0.9, crownBase - 1, top, 5, 2);

    },

    // Dracena cynobrowa (smocze drzewo): gładki, gruby pień, z którego jak
    // szprychy rozchodzi się gęsta sieć gałęzi, a na nich płaski od góry
    // i gęsty parasol - odwrócona miska.
    dragon_tree(tree, size) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, c = trunkWidth === 2 ? 0.5 : 0;
        tree.trunk(0, 0, 0, crownBase);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, crownBase - 1);
        }
        const cap = top - 2;
        const limbs = 8 + Math.floor(random() * 4);
        const phase = random() * Math.PI * 2;
        for (let i = 0; i < limbs; i++) {
            const angle = phase + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.3;
            const reach = radius * (0.5 + random() * 0.3);
            tree.branch(c, crownBase, c, c + Math.cos(angle) * reach, cap, c + Math.sin(angle) * reach);
        }
        tree.disk(c, cap, c, radius, 0.25);
        tree.disk(c, cap + 1, c, radius * 0.92, 0.12);
        tree.disk(c, top, c, radius * 0.62, 0.2);
        tree.leaf(0, top, 0);

    },

    // Cedr libański: gruby pień i potężne poziome konary, na których leżą
    // szerokie, płaskie talerze igliwia - piętra z prześwitami, czubek
    // płaski jak stół.
    cedar(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1, c = trunkWidth === 2 ? 0.5 : 0;
        tree.trunk(0, 0, 0, top - 2);
        if (trunkWidth === 2) {
            for (const [x, z] of [[1, 0], [0, 1], [1, 1]]) tree.trunk(x, z, 0, Math.round(height * 0.7));
        }
        const tiers = Math.max(3, Math.round((top - crownBase) / 5));
        const phase = random() * Math.PI * 2;
        for (let tier = 0; tier < tiers; tier++) {
            const t = tier / (tiers - 1);
            const y = Math.round(lerp(crownBase, top - 4, t));
            const r = radius * (1 - 0.45 * t ** 1.3);
            const limbs = 3 + (tier % 2);
            tree.blob(c, y + 0.6, c, Math.max(1.6, r * 0.3), 0.9, Math.max(1.6, r * 0.3), 0.7, shape.density);
            for (let i = 0; i < limbs; i++) {
                const angle = phase + tier * 1.3 + i * Math.PI * 2 / limbs + (random() - 0.5) * 0.4;
                const reach = r * (0.6 + random() * 0.1);
                const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
                tree.branch(c, y - 1, c, c + x * 0.5, y, c + z * 0.5);
                tree.branch(c + x * 0.5, y, c + z * 0.5, c + x, y, c + z);
                tree.blob(c + x, y + 0.7, c + z, r * 0.42, 0.9, r * 0.42, 0.7, shape.density);
                tree.blob(c + x * 0.5, y + 0.7, c + z * 0.5, r * 0.34, 0.9, r * 0.34, 0.7, shape.density);
            }
        }
        tree.disk(c, top - 1, c, Math.max(2.5, radius * 0.5), 0.3);
        tree.disk(c, top, c, Math.max(2, radius * 0.42), 0.3);
        tree.leaf(0, top, 0);

    },

    // Sosna oścista (długowieczna): niska, pokręcona, w większej części
    // martwa - wybielone, gołe drewno z jednym pasem żywej kory, sterczące
    // suche konary i kilka kęp igliwia po zawietrznej stronie.
    bristlecone(tree, size, shape) {

        const { height, radius, trunkWidth, crownBase } = treeVisualDimensions(tree.species, size);
        const random = tree.random, top = height - 1;
        const dead = treeLogType(tree.species, 'dead');
        const lean = random() * Math.PI * 2, lx = Math.cos(lean), lz = Math.sin(lean);
        const side = Math.abs(lx) > Math.abs(lz) ? [Math.sign(lx), 0] : [0, Math.sign(lz)];
        tree.trunk(0, 0, 0, crownBase);
        tree.trunk(-side[0], -side[1], 0, Math.max(1, crownBase - 1), dead);
        if (trunkWidth === 2) {
            tree.trunk(side[1], side[0], 0, Math.max(1, crownBase - 2), dead);
            tree.trunk(side[1] - side[0], side[0] - side[1], 0, 1, dead);
        }
        // Martwy wierzchołek i suche konary.
        tree.branch(-side[0], crownBase - 1, -side[1], -lx * 1.6, top, -lz * 1.6, dead);
        const snags = 1 + Math.floor(random() * 2);
        for (let i = 0; i < snags; i++) {
            const angle = lean + Math.PI + (i ? 1.3 : -1.1) + (random() - 0.5) * 0.6;
            const length = radius * (0.45 + random() * 0.3);
            tree.branch(0, crownBase - i, 0, Math.cos(angle) * length, Math.min(top - 1, crownBase + 1 + Math.floor(random() * 3)), Math.sin(angle) * length, dead);
        }
        // Żywe gałęzie z kępami igliwia.
        const live = 2 + Math.floor(random() * 2);
        for (let i = 0; i < live; i++) {
            const angle = lean + (i - (live - 1) / 2) * 0.9 + (random() - 0.5) * 0.3;
            const reach = radius * (0.5 + random() * 0.25);
            const x = Math.cos(angle) * reach, z = Math.sin(angle) * reach;
            const y = Math.min(top - 2, crownBase + (i % 2) + Math.floor(random() * 2));
            tree.branch(0, crownBase - 1, 0, x * 0.6, y, z * 0.6);
            tree.branch(x * 0.6, y, z * 0.6, x, y, z);
            tree.blob(x, y + 0.8, z, radius * 0.42, 1.3, radius * 0.42, 0.6, shape.density);
            tree.blob(x * 0.55, y + 1, z * 0.55, radius * 0.36, 1.2, radius * 0.36, 0.6, shape.density);
        }
        tree.blob(lx, Math.min(top - 1.5, crownBase + 1.5), lz, Math.max(1.4, radius * 0.38), 1.4, Math.max(1.4, radius * 0.38), 0.6, shape.density);

    },

    // Kula: zaokrąglona korona (jak lipa, jabłoń).
    kula(tree, size, shape) {

        const { trunk, radius, tall, density } = sizes(tree, size, shape);

        const crownY = trunk + tall / 2 - 0.5;

        tree.trunk(0, 0, 0, Math.round(crownY));

        tree.blob(0, crownY, 0, radius, Math.max(0.6, tall / 2), radius, 0.6, density);

    },

    // Stożek: korona od dołu szeroka, do góry coraz węższa (jak świerk).
    stozek(tree, size, shape) {

        const { trunk, radius, density } = sizes(tree, size, shape);

        const tall = Math.round(lerp(shape.crown[0], shape.crown[1], size));

        tree.trunk(0, 0, 0, trunk + tall - 1);

        for (let y = trunk; y < trunk + tall; y++) {

            const t = (y - trunk) / tall;

            tree.disk(0, y, 0, Math.max(0.5, radius * (1 - t) + 0.3), (1 - density) * 0.6);

        }

        tree.leaf(0, trunk + tall, 0);

    },

    // Parasol: wysoki pień, płaska szeroka korona na górze (jak pinia,
    // akacja). Wysokość korony - jej grubość.
    parasol(tree, size, shape) {

        const random = tree.random;

        const { trunk, radius, tall, density } = sizes(tree, size, shape);

        tree.trunk(0, 0, 0, trunk);

        const limbs = 3 + Math.floor(random() * 2);

        const angle0 = random() * Math.PI * 2;

        for (let i = 0; i < limbs; i++) {

            const angle = angle0 + i * Math.PI * 2 / limbs;

            tree.branch(0, trunk - 1, 0, Math.cos(angle) * radius * 0.5, trunk + 0.6, Math.sin(angle) * radius * 0.5);

        }

        tree.blob(0, trunk + 0.4 + tall / 2, 0, radius, Math.max(0.7, tall / 2), radius, 0.55, density);

    },

    // Kolumna: wąska, wysoka korona tej samej szerokości (jak topola).
    kolumna(tree, size, shape) {

        const { trunk, radius, density } = sizes(tree, size, shape);

        const tall = Math.round(lerp(shape.crown[0], shape.crown[1], size));

        tree.trunk(0, 0, 0, trunk + tall - 2);

        for (let y = trunk; y < trunk + tall; y++) {

            const fromTop = trunk + tall - 1 - y;

            const r = fromTop === 0 ? Math.min(radius, 0.6) : fromTop === 1 ? radius * 0.7 : radius;

            tree.disk(0, y, 0, Math.max(0.5, r), (1 - density) * 0.6);

        }

    }

};


// Odmiany liści z "udzial" - taka część liści na wierzchu korony
// (z co najmniej jednym pustym sąsiadem - widać je z zewnątrz).

function applyLeafVariants(tree, definition) {

    const variants = definition.variants.filter((variant) => variant.share > 0);

    if (variants.length === 0) {
        return;
    }

    const random = tree.random;

    for (const cell of tree.cells.values()) {

        const [x, y, z, type] = cell;

        if (type !== tree.parts.leaves) {
            continue;
        }

        const outside =
            !tree.has(x + 1, y, z) || !tree.has(x - 1, y, z) ||
            !tree.has(x, y + 1, z) || !tree.has(x, y - 1, z) ||
            !tree.has(x, y, z + 1) || !tree.has(x, y, z - 1);

        if (!outside) {
            continue;
        }

        for (const variant of variants) {

            if (random() < variant.share) {

                cell[3] = treeVariantType(definition.id, variant.key);

                break;

            }

        }

    }

}


function catalogShape(definition) {

    return (tree, size) => {

        if (definition.shape.kind === 'szablon') {
            templateTree(tree, size, definition);
        }
        else {
            CATALOG_SHAPES[definition.shape.kind](tree, size, definition.shape);
        }

        applyLeafVariants(tree, definition);


        // Opadłe liście pod koroną.

        if (definition.shape.litter > 0) {

            let radius = 2;

            for (const [x, , z, type] of tree.cells.values()) {

                if (type !== tree.parts.log) {
                    radius = Math.max(radius, Math.hypot(x, z));
                }

            }

            tree.fallen(Math.min(6, Math.round(radius)), definition.shape.litter);

        }

    };

}


const SHAPES = { spruce, pine, beech, linden, oak, birch };

for (const species of TREE_NAMES) {

    const definition = TREE_SPECIES[species];

    if (definition.shape) {
        SHAPES[species] = catalogShape(definition);
    }

}


// Drzewo gatunku `species` (TREE_SPECIES): { species, blocks: [[x, y, z,
// typ bloku]], roots: [[x, z, typ]], litter: [[x, z]], top }.

export function buildTree(species, seed, size = 0.5) {

    if (!Object.hasOwn(TREE_SPECIES, species)) {
        throw new Error(`Nieznany gatunek drzewa: ${species}`);
    }

    const tree = new TreeBuilder(species, seededRandom(seed));

    SHAPES[species](tree, Math.max(0, Math.min(1, size)));

    return tree.finish();

}
