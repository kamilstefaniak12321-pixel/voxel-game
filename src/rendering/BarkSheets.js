// ------------------------------------------------------------
// ARKUSZE KORY (1.7.0) - pomysł Kamila. Opis: docs/kora.md.
//
// Pień drzewa z arkuszem kory nie ma jednego obrazka na boku, tylko
// arkusz 128 x 128 pikseli: 8 x 8 kafelków 16 x 16. Dla każdego boku
// każdego bloku pnia (także okorowanego) gra wybiera jeden kafelek - losowo z miejsca bloku
// i strony świata, z wagami: zwykła kora często, sęk, okorowany płat
// albo dziupla rzadko. To dalej ten sam blok, te same ściany i ten sam
// materiał - zmienia się tylko, który kawałek atlasu jest na ścianie.
//
// Nowy arkusz: namaluj 128 x 128 (zasada krawędzi - tools/tekstury_kory.py),
// dopisz go tu i w tools/tekstury_kory.py. Pilnuje tego
// tools/sprawdz_kore.mjs.
// ------------------------------------------------------------

export const BARK_GRID = 8;

// Jak często trafia się kafelek danego rodzaju (waga jednego kafelka).
export const BARK_WEIGHTS = {
    zwykla: 12,
    porosty: 3,
    pekniecie: 3,
    guzek: 3,
    sek: 2,
    blizna: 2,
    okorowany: 1.5,
    dziupla: 1
};

const PLAIN_ROW = Array(BARK_GRID).fill('zwykla');

// Blok pnia -> arkusz: texture - kafelek atlasu 8 x 8 kratek,
// tiles - rodzaj każdego kafelka, wierszami od góry; like - blok, którego
// losowanie (wagi) arkusz powtarza.
export const BARK_SHEETS = {
    oak_log: {
        texture: 'oak_log_bark',
        tiles: [
            ...PLAIN_ROW, ...PLAIN_ROW, ...PLAIN_ROW, ...PLAIN_ROW, ...PLAIN_ROW, ...PLAIN_ROW,
            'porosty', 'porosty', 'porosty', 'pekniecie', 'pekniecie', 'guzek', 'guzek', 'guzek',
            'sek', 'sek', 'sek', 'blizna', 'okorowany', 'okorowany', 'dziupla', 'dziupla'
        ]
    },

    // Okorowany pień: arkusz drewna kafelek po kafelku pod arkuszem kory
    // i to samo losowanie (like), więc po okorowaniu dodatek zostaje na
    // swoim miejscu - pod sękiem sęk, pod dziuplą dziupla, pod pęknięciem
    // kory pęknięcie drewna, pod okorowanym płatem chodniki korników.
    oak_log_stripped: {
        texture: 'oak_stripped_sheet',
        like: 'oak_log',
        tiles: [
            ...Array(48).fill('zwykle'),
            'przebarwienie', 'przebarwienie', 'przebarwienie', 'pekniecie', 'pekniecie', 'seczek', 'seczek', 'seczek',
            'sek', 'sek', 'sek', 'sek', 'kornik', 'kornik', 'dziupla', 'dziupla'
        ]
    }
};

// Co jest w drewnie pod danym rodzajem kafelka kory (arkusze "like").
export const UNDER_BARK = {
    zwykla: 'zwykle', porosty: 'przebarwienie', pekniecie: 'pekniecie', guzek: 'seczek',
    sek: 'sek', blizna: 'sek', okorowany: 'kornik', dziupla: 'dziupla'
};

// Tabela losowania: SLOTS pól, każdy kafelek zajmuje tyle, ile wynosi
// jego udział (wybór to jedno mnożenie i jeden odczyt).
const SLOTS = 4096;

export function barkLookup(tiles) {

    const weights = tiles.map((kind) => BARK_WEIGHTS[kind]);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    const lookup = new Uint8Array(SLOTS);

    let passed = 0, slot = 0;

    tiles.forEach((_, tile) => {
        passed += weights[tile];
        const end = Math.round(passed / total * SLOTS);
        while (slot < end) lookup[slot++] = tile;
    });

    return lookup;

}

// Który kafelek arkusza jest na ścianie `face` (numer ściany bloku)
// bloku (x, y, z): zawsze ten sam w tym samym miejscu, inny na każdym
// boku.
export function barkTile(lookup, x, y, z, face) {

    let hash = Math.imul(x, 0x2c1b3c6d) ^ Math.imul(y, 0x297a2d39) ^ Math.imul(z, 0x1b873593) ^ Math.imul(face + 1, 0x7feb352d);

    hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
    hash ^= hash >>> 16;

    return lookup[(hash >>> 0) % SLOTS];

}
