// ------------------------------------------------------------
// KOŁYSANIE DRZEW (1.40.0, pomysł Kamila - docs/drewno.md rozdział 3,
// opis tego, co działa: docs/kolysanie.md)
//
// Całe drzewo - pień z koroną - lekko wygina się z wiatrem: przy ziemi
// wcale, im wyżej, tym bardziej. Jak mocno, zależy od gatunku
// (TREE_SWAY, 0-1) i od wiatru (pogoda).
//
// To sam wygląd: liczy go karta graficzna (rendering/PlantWind.js -
// treeSwayOffset), bloki i kolizje zostają na miejscu.
//
// W siatce chunka każdy wierzchołek pnia i liści niesie jedną liczbę
// (bajt): wysokość nad ziemią × pierwiastek z giętkości gatunku ×
// SWAY_STEPS. Wygięcie rośnie z kwadratem tej liczby.
// ------------------------------------------------------------

// Giętkość gatunku: 1 - mocno, 0,55 - średnio, 0,25 - ledwo, 0 - tylko
// liście (olbrzymy stoją).
const STRONG = 1, MEDIUM = 0.55, SLIGHT = 0.25, NONE = 0;

export const TREE_SWAY = {
    // mocno: palma, brzoza, osika, eukaliptus, wysoki świerk i jodła, modrzew
    coconut_palm: STRONG, birch: STRONG, aspen: STRONG, rainbow_eucalyptus: STRONG, spruce: STRONG, fir: STRONG, larch: STRONG,
    // średnio: sosna, lipa, olcha, wierzba, klon, wiśnia, jakaranda, miłorząb
    pine: MEDIUM, linden: MEDIUM, olcha: MEDIUM, wierzba: MEDIUM, maple: MEDIUM, cherry: MEDIUM, jacaranda: MEDIUM, ginkgo: MEDIUM,
    // (spoza tabeli projektu - średnio)
    jablon: MEDIUM, bald_cypress: MEDIUM, mangrove: MEDIUM, joshua_tree: MEDIUM, dragon_tree: MEDIUM,
    // ledwo: dąb, buk, oliwka, akacja, cedr, araukaria
    oak: SLIGHT, beech: SLIGHT, olive: SLIGHT, acacia: SLIGHT, cedar: SLIGHT, araucaria: SLIGHT,
    // (stare, sękate sosny ościste i kosodrzewina - ledwo)
    bristlecone: SLIGHT, mugo: SLIGHT,
    // tylko liście: baobab, sekwoja, puchowiec, banian
    baobab: NONE, sequoia: NONE, kapok: NONE, banyan: NONE
};

// Ile kroków bajtu na blok wysokości (ćwierć bloku; 255 kroków to 63,75 m).
export const SWAY_STEPS = 4;
// Wygięcie w blokach przy pełnym wietrze: SWAY_BEND × (wysokość ×
// pierwiastek z giętkości)², najwyżej SWAY_MAX.
export const SWAY_BEND = 0.0016;
export const SWAY_MAX = 0.45;

// Giętkość gatunku (nieznany - średnio).
export function treeSway(species) {
    return TREE_SWAY[species] ?? MEDIUM;
}

// Mnożnik wysokości dla siatki chunka (bajt = wysokość × ten mnożnik).
export function swayScale(species) {
    return SWAY_STEPS * Math.sqrt(treeSway(species));
}

// Bajt wierzchołka na wysokości `height` bloków nad ziemią.
export function swayCode(height, scale) {
    return Math.max(0, Math.min(255, Math.round(height * scale)));
}

// Wygięcie (bloki) wierzchołka o bajcie `code` przy wietrze `wind` (0-1)
// - to samo liczy program cieniujący.
export function swayBend(code, wind = 1) {
    const height = code / SWAY_STEPS;
    return Math.min(SWAY_MAX, height * height * SWAY_BEND) * wind;
}

// Siła wiatru dla drzew z prędkości wiatru pogody (0 - cisza, ok. 8 -
// wichura): w ciszy drzewa ledwo oddychają.
export const CALM_SWAY = 0.12, FULL_WIND = 9;
export function treeWindStrength(speed) {
    return Math.max(CALM_SWAY, Math.min(1, CALM_SWAY + (speed ?? 0) / FULL_WIND));
}
