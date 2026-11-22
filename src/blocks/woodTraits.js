// ------------------------------------------------------------
// CHARAKTER DREWNA (1.32.0, pomysł Kamila - docs/drewno.md)
//
// Każdy gatunek drewna ma własne cechy. Liczby są dla SUCHEGO drewna,
// wzięte z prawdziwych cech (twardość, gęstość, żywica) i zaokrąglone
// pod grę.
//
//   hardness - twardość 1-10 (ile ciosów, jak tępi narzędzie -
//              ścinanie i narzędzia, kolejne wersje),
//   fresh    - ile wody ma drewno prosto z drzewa, 0-1 (wilgotność
//              i suszenie, kolejna wersja),
//   ignite   - zapłon (°C): tak gorący musi być ogień, żeby polano
//              się zajęło,
//   heat     - żar (°C): najwyższa temperatura, jaką to drewno daje,
//   burn     - ile sekund pali się jedno polano,
//   sparks   - iskry 0-3 (0 - wcale, 3 - strzela jak modrzew),
//   smoke    - dym 0-3 (0 - prawie bez dymu, 1 - zwykły, 3 - kopci),
//   dark     - ciemny, żywiczny dym,
//   note     - co wyróżnia to drewno (opis przedmiotu, poradnik).
//
// Klucze to nazwy drewna z game/CampfireState.js (FIRE_WOODS) - te
// same, co w <drewno>_log i <drewno>_firewood. Nowe drzewo MUSI dostać
// tu wpis (pilnuje tego tools/sprawdz_drewna.mjs).
// ------------------------------------------------------------

// Wilgotność świeżego drewna słowami -> liczba.
const DRY = 0.15, MEDIUM = 0.4, WET = 0.6, SOAKED = 0.8, WATERLOGGED = 0.95;

export const WOOD_TRAITS = {
    // Iglaste: łatwo się zapalają, palą krótko, strzelają iskrami.
    spruce: { hardness: 2, fresh: MEDIUM, ignite: 240, heat: 700, burn: 55, sparks: 2, smoke: 1, note: 'łatwo się zajmuje, strzela iskrami' },
    pine: { hardness: 3, fresh: MEDIUM, ignite: 220, heat: 740, burn: 60, sparks: 1, smoke: 2, dark: true, note: 'żywiczna: zajmuje się od byle czego, ale kopci' },
    fir: { hardness: 2, fresh: MEDIUM, ignite: 250, heat: 680, burn: 50, sparks: 1, smoke: 1, note: 'pali się krótko' },
    larch: { hardness: 4, fresh: MEDIUM, ignite: 250, heat: 780, burn: 85, sparks: 3, smoke: 1, note: 'najmocniej strzela iskrami' },
    mugo: { hardness: 3, fresh: MEDIUM, ignite: 215, heat: 720, burn: 50, sparks: 1, smoke: 2, dark: true, note: 'żywiczna: najłatwiej się zajmuje' },
    bristlecone: { hardness: 5, fresh: DRY, ignite: 230, heat: 800, burn: 100, sparks: 1, smoke: 1, note: 'suche od razu, pali się długo jak na iglaste' },
    cedar: { hardness: 4, fresh: MEDIUM, ignite: 245, heat: 760, burn: 80, sparks: 1, smoke: 1, note: 'pachnący dym' },
    araucaria: { hardness: 3, fresh: MEDIUM, ignite: 250, heat: 720, burn: 70, sparks: 1, smoke: 1, note: 'zwykłe drewno iglaste' },
    sequoia: { hardness: 2, fresh: WET, ignite: 330, heat: 640, burn: 60, sparks: 1, smoke: 1, note: 'trudno je zapalić i słabo grzeje' },
    bald_cypress: { hardness: 3, fresh: SOAKED, ignite: 280, heat: 700, burn: 70, sparks: 0, smoke: 2, note: 'rośnie w wodzie - dymi' },
    ginkgo: { hardness: 3, fresh: WET, ignite: 300, heat: 680, burn: 65, sparks: 0, smoke: 1, note: 'opiera się ogniowi' },

    // Liściaste: trudniej je rozpalić, ale grzeją mocno i długo.
    beech: { hardness: 7, fresh: WET, ignite: 300, heat: 900, burn: 135, sparks: 0, smoke: 0, note: 'równy żar, prawie bez dymu' },
    oak: { hardness: 7, fresh: WET, ignite: 320, heat: 920, burn: 150, sparks: 0, smoke: 1, note: 'pali się najdłużej, żar trzyma do rana' },
    birch: { hardness: 5, fresh: SOAKED, ignite: 270, heat: 860, burn: 100, sparks: 0, smoke: 1, note: 'jasny płomień bez iskier' },
    linden: { hardness: 2, fresh: WET, ignite: 260, heat: 650, burn: 50, sparks: 0, smoke: 1, note: 'łatwo się zajmuje, słabo grzeje' },
    olcha: { hardness: 3, fresh: SOAKED, ignite: 275, heat: 720, burn: 65, sparks: 0, smoke: 3, note: 'dużo dymu' },
    wierzba: { hardness: 2, fresh: SOAKED, ignite: 280, heat: 620, burn: 45, sparks: 0, smoke: 2, note: 'słabe ciepło, pali się chwilę' },
    aspen: { hardness: 2, fresh: WET, ignite: 270, heat: 640, burn: 45, sparks: 0, smoke: 0, note: 'pali się czysto, prawie bez dymu' },
    jablon: { hardness: 7, fresh: MEDIUM, ignite: 300, heat: 880, burn: 130, sparks: 0, smoke: 1, note: 'gorący żar i pachnący dym' },
    cherry: { hardness: 5, fresh: MEDIUM, ignite: 290, heat: 840, burn: 110, sparks: 0, smoke: 1, note: 'dobry, równy opał' },
    maple: { hardness: 7, fresh: WET, ignite: 300, heat: 890, burn: 130, sparks: 0, smoke: 1, note: 'gorący, długi żar' },

    // Ciepłych krajów.
    acacia: { hardness: 8, fresh: DRY, ignite: 310, heat: 950, burn: 150, sparks: 0, smoke: 1, note: 'gorący, długi żar' },
    olive: { hardness: 9, fresh: DRY, ignite: 290, heat: 960, burn: 165, sparks: 0, smoke: 1, note: 'najgorętsze i pali się najdłużej' },
    rainbow_eucalyptus: { hardness: 4, fresh: MEDIUM, ignite: 225, heat: 880, burn: 80, sparks: 2, smoke: 2, note: 'olejki - płonie gwałtownie' },
    jacaranda: { hardness: 3, fresh: MEDIUM, ignite: 280, heat: 700, burn: 65, sparks: 0, smoke: 1, note: 'zwykłe, lekkie drewno' },
    baobab: { hardness: 1, fresh: WATERLOGGED, ignite: 380, heat: 520, burn: 40, sparks: 0, smoke: 3, note: 'nasiąknięty wodą - prawie się nie pali' },
    coconut_palm: { hardness: 5, fresh: WET, ignite: 300, heat: 720, burn: 90, sparks: 1, smoke: 2, note: 'włókniste, dymi' },
    mangrove: { hardness: 8, fresh: SOAKED, ignite: 320, heat: 940, burn: 155, sparks: 0, smoke: 1, note: 'ciężkie drewno - gorący, długi żar' },
    kapok: { hardness: 1, fresh: MEDIUM, ignite: 250, heat: 600, burn: 35, sparks: 0, smoke: 1, note: 'lekki jak korek - spala się w chwilę' },
    joshua_tree: { hardness: 1, fresh: DRY, ignite: 240, heat: 600, burn: 35, sparks: 1, smoke: 1, note: 'włókniste - pali się chwilę' },
    banyan: { hardness: 3, fresh: WET, ignite: 290, heat: 700, burn: 65, sparks: 0, smoke: 2, note: 'zwykłe drewno, trochę dymi' },
    dragon_tree: { hardness: 2, fresh: WET, ignite: 300, heat: 640, burn: 55, sparks: 0, smoke: 1, note: 'słabo grzeje' }
};

// Spróchniałe drewno z powalonego pnia (1.37.0, blocks/lyingLogs.js) -
// nie gatunek drzewa: zajmuje się od byle czego (zapłon niższy niż
// każde zdrowe drewno), ale grzeje słabo, pali się pół minuty i kopci.
export const ROTTEN_TRAITS = { hardness: 1, fresh: DRY, ignite: 200, heat: 450, burn: 30, sparks: 0, smoke: 3,
    note: 'zajmuje się od byle czego - dobre na wierzch stosu; grzeje słabo i kopci' };

// Cechy gatunku (nieznane drewno - jak świerk, żeby nic się nie wywróciło).
export function woodTraits(wood) {
    return wood === 'rotten' ? ROTTEN_TRAITS : WOOD_TRAITS[wood] ?? WOOD_TRAITS.spruce;
}

// Przedziały do opisów i sprawdzeń.
const all = (field) => Object.values(WOOD_TRAITS).map((traits) => traits[field]);
export const WOOD_RANGE = Object.fromEntries(['hardness', 'ignite', 'heat', 'burn']
    .map((field) => [field, { min: Math.min(...all(field)), max: Math.max(...all(field)) }]));
