// ------------------------------------------------------------
// SKAŁY I INNE BLOKI TERENU - polskie nazwy i kolory na mapie
//
// Używane przez mapę (/mapa skaly, /mapa przekroj), komendę /skaly
// i opis terenu. Klucz = nazwa bloku z BlockRegistry.js,
// word = słowo do wpisania w komendach (bez polskich znaków).
// ------------------------------------------------------------

export const ROCK_INFO = {
    granite: { name: 'granit', word: 'granit', color: '#c4958c' },
    limestone: { name: 'wapień', word: 'wapien', color: '#e8e0c4' },
    sandstone: { name: 'piaskowiec', word: 'piaskowiec', color: '#dc9f55' },
    slate: { name: 'łupek', word: 'lupek', color: '#56606f' },
    basalt: { name: 'bazalt', word: 'bazalt', color: '#2c2c33' },
    stone: { name: 'kamień', word: 'kamien', color: '#998477' },
    lepidolite: { name: 'lepidolit', word: 'lepidolit', color: '#c050ff' }
};

// Pozostałe bloki terenu (przekrój, opis kolumny).

export const SOIL_INFO = {
    grass: { name: 'trawa', word: 'trawa', color: '#5aa83c' },
    dirt: { name: 'ziemia', word: 'ziemia', color: '#8a4a14' },
    sand: { name: 'piasek', word: 'piasek', color: '#e3d29c' },
    // Wierzch ziemi w biomach (Biomes.js).
    forest_floor: { name: 'ściółka', word: 'sciolka', color: '#7a5a2e' },
    moss: { name: 'mech', word: 'mech', color: '#56803a' },
    mud: { name: 'błoto', word: 'bloto', color: '#5a3d28' },
    clay: { name: 'glina', word: 'glina', color: '#ac8e68' },
    gravel: { name: 'żwir', word: 'zwir', color: '#7a726a' },
    coarse_dirt: { name: 'ziemia kamienista', word: 'kamienista', color: '#aa8d6a' },
    snow: { name: 'śnieg', word: 'snieg', color: '#eef3fa' },
    water: { name: 'woda', word: 'woda', color: '#2f62c0' }
};


// Polska nazwa bloku (albo jego zwykła nazwa, gdy nie ma polskiej).

export function blockNamePl(type) {

    return ROCK_INFO[type]?.name ?? SOIL_INFO[type]?.name ?? type;

}


// Słowo z komendy (np. "granit", "lupek") -> nazwa bloku albo null.

export function blockFromWord(word) {

    for (const table of [ROCK_INFO, SOIL_INFO]) {

        for (const [type, info] of Object.entries(table)) {

            if (info.word === word) {
                return type;
            }

        }

    }

    return null;

}
