import { TREE_SPECIES, TREE_NAMES, treeParts, packVariantType } from '../../blocks/trees.js';

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
// Gatunki z paczek drzew (assets/drzewa/) - na dole pliku: kształt
// narysowany w szablonie (pliki .txt) albo jeden z gotowych (kula,
// stożek, parasol, kolumna) z liczbami z drzewo.json.
// ------------------------------------------------------------

// Najdalej od pnia (w poziomie) i najwyżej, gdzie może być blok
// drzewa - generator terenu sprawdza drzewa z tylu bloków wokół chunka.

export const TREE_REACH = 7;

export const TREE_MAX_HEIGHT = 28;


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

        // klucz komórki -> [x, y, z, typ, siła]
        this.cells = new Map();

        // Komórki pnia przy ziemi [x, z, typ] - w terenie pochyłym pień
        // schodzi w dół do gruntu.
        this.roots = [];

        // Kolumny (x, z), w których na ziemi leżą opadłe liście.
        this.litter = [];

    }


    key(x, y, z) {

        return (x + 64) * 16384 + (y + 64) * 128 + (z + 64);

    }


    // Czy w komórce (x, y, z) już coś jest.

    has(x, y, z) {

        return this.cells.has(this.key(x, y, z));

    }


    set(x, y, z, type, strength) {

        x = Math.round(x);
        y = Math.round(y);
        z = Math.round(z);

        if (Math.abs(x) > TREE_REACH || Math.abs(z) > TREE_REACH || y < 0 || y > TREE_MAX_HEIGHT) {
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
// PACZKI DRZEW (src/blocks/treePacks.js, docs/drzewa-paczki.md)
// ------------------------------------------------------------

// Szablon: komórki [x, y, z, znak] narysowane w pliku .txt. Rozmiar
// drzewa wybiera szablon (pierwszy - najmniejsze drzewa, ostatni -
// największe), a każde drzewo jest losowo obrócone i odbite, więc
// w lesie nie stoją takie same.
//   P i @ - pień (@ - podstawa, tam stała sadzonka),
//   L     - liście, l - liście, ale nie zawsze (70%),
//   inny  - odmiana liści z tym "znakiem" (np. J - liście z jabłkami).

function templateTree(tree, size, pack) {

    const random = tree.random;

    const templates = pack.shape.templates;

    const cells = templates[Math.min(templates.length - 1, Math.floor(size * templates.length))];

    const turn = Math.floor(random() * 4);

    const mirror = random() < 0.5;

    const variants = new Map(
        pack.variants.filter((variant) => variant.char).map((variant) => [variant.char, packVariantType(pack.id, variant.key)])
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


const PACK_SHAPES = {

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

function packVariants(tree, pack) {

    const variants = pack.variants.filter((variant) => variant.share > 0);

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

                cell[3] = packVariantType(pack.id, variant.key);

                break;

            }

        }

    }

}


function packShape(pack) {

    return (tree, size) => {

        if (pack.shape.kind === 'szablon') {
            templateTree(tree, size, pack);
        }
        else {
            PACK_SHAPES[pack.shape.kind](tree, size, pack.shape);
        }

        packVariants(tree, pack);


        // Opadłe liście pod koroną.

        if (pack.shape.litter > 0) {

            let radius = 2;

            for (const [x, , z, type] of tree.cells.values()) {

                if (type !== tree.parts.log) {
                    radius = Math.max(radius, Math.hypot(x, z));
                }

            }

            tree.fallen(Math.min(6, Math.round(radius)), pack.shape.litter);

        }

    };

}


const SHAPES = { spruce, pine, beech, linden, oak, birch };

for (const species of TREE_NAMES) {

    const pack = TREE_SPECIES[species].pack;

    if (pack) {
        SHAPES[species] = packShape(pack);
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
