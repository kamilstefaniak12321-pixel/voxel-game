// ------------------------------------------------------------
// POŻAR: KTÓRE DRZEWO JAK PŁONIE (1.43.0, część E projektu drewna -
// docs/pozar.md, plan: docs/drewno.md rozdział 7)
//
// Ogień nie chodzi po pojedynczych blokach, tylko po DRZEWACH: drzewo
// się zajmuje, przez 20-60 sekund płonie mu korona, potem zostaje po nim
// jedno z trzech:
//
//   'ash'     - popiół: drzewo znika (cienki pień, żywica, młode drzewka),
//   'char'    - zwęglony kikut: liście spalone, stoi czarny pień,
//   'survive' - przeżywa: ogień przeszedł dołem, drzewo traci dolne
//               liście (gruba kora, pień 2 × 2 i grubszy).
//
// Tu są same zasady i liczby; stan pożaru trzyma game/Wildfire.js,
// obraz - rendering/WildfireRenderer.js.
// ------------------------------------------------------------

import { seasonAt } from '../sky/Seasons.js';

// ease - jak łatwo drzewo się zajmuje (1 - zwykłe; iglaste i eukaliptus
// łatwo, drzewa mokradeł i lasu deszczowego trudno; 0 - wcale),
// fate - co po nim zostaje, gdy pień jest cienki (1 × 1).
export const FIRE_TRAITS = {
    // Popiół: cienkie, żywiczne.
    mugo: { ease: 1.6, fate: 'ash' },
    joshua_tree: { ease: 1.1, fate: 'ash' },
    birch: { ease: 1, fate: 'ash' },
    aspen: { ease: 1, fate: 'ash' },
    wierzba: { ease: 0.5, fate: 'ash' },
    // Zwęglony kikut: średnie drzewa.
    spruce: { ease: 1.5, fate: 'char' },
    fir: { ease: 1.4, fate: 'char' },
    bristlecone: { ease: 1.3, fate: 'char' },
    beech: { ease: 0.8, fate: 'char' },
    linden: { ease: 0.9, fate: 'char' },
    maple: { ease: 0.8, fate: 'char' },
    jablon: { ease: 0.8, fate: 'char' },
    cherry: { ease: 0.8, fate: 'char' },
    olcha: { ease: 0.5, fate: 'char' },
    jacaranda: { ease: 0.9, fate: 'char' },
    // Przeżywają: gruba kora.
    pine: { ease: 1.5, fate: 'survive' },
    larch: { ease: 1.3, fate: 'survive' },
    cedar: { ease: 1.3, fate: 'survive' },
    araucaria: { ease: 1.2, fate: 'survive' },
    rainbow_eucalyptus: { ease: 1.8, fate: 'survive' },
    oak: { ease: 0.7, fate: 'survive' },
    acacia: { ease: 1, fate: 'survive' },
    olive: { ease: 0.9, fate: 'survive' },
    coconut_palm: { ease: 0.9, fate: 'survive' },
    ginkgo: { ease: 0.4, fate: 'survive' },
    dragon_tree: { ease: 0.7, fate: 'survive' },
    sequoia: { ease: 0.6, fate: 'survive' },
    // Mokradła i las deszczowy: prawie się nie zajmują.
    bald_cypress: { ease: 0.3, fate: 'survive' },
    mangrove: { ease: 0.25, fate: 'survive' },
    kapok: { ease: 0.35, fate: 'survive' },
    banyan: { ease: 0.35, fate: 'survive' },
    // Nasiąknięty wodą - nie pali się wcale.
    baobab: { ease: 0, fate: 'survive' }
};

const DEFAULT_TRAITS = { ease: 1, fate: 'char' };
export function fireTraits(species) {
    return Object.hasOwn(FIRE_TRAITS, species ?? '') ? FIRE_TRAITS[species] : DEFAULT_TRAITS;
}

// Młode drzewko (tak mało kłód) zawsze idzie z dymem.
export const YOUNG_LOGS = 5;
// Od tej grubości pnia drzewo przeżywa pożar.
export const THICK_WIDTH = 2;

// Co zostanie po drzewie: gatunek, grubość pnia, liczba kłód.
export function fateOf(species, width = 1, logs = 99) {
    const traits = fireTraits(species);
    if (traits.fate === 'survive') return 'survive';
    if (logs <= YOUNG_LOGS) return 'ash';
    if (width >= THICK_WIDTH) return 'survive';
    return traits.fate;
}

// Jak długo płonie korona (sekundy): 20-60, im więcej liści, tym dłużej.
export const BURN_MIN = 20, BURN_MAX = 60;
export function burnSeconds(leaves) {
    return Math.max(BURN_MIN, Math.min(BURN_MAX, BURN_MIN + (leaves ?? 0) / 10));
}
// Jaką część liści traci drzewo, które przeżywa (ogień idzie dołem).
export const SURVIVOR_LOSS = 0.35;

// Pora roku: [wiosna, lato, jesień, zima].
export const SEASON_FIRE = [0.9, 1.3, 1, 0.4];
export function seasonFire(days) {
    return SEASON_FIRE[seasonAt(days).index] ?? 1;
}

// Mokro: deszcz gasi, mokra ziemia po deszczu hamuje (wetness 0-1).
// Od takiego deszczu nic się nie zajmuje, a płonące drzewa gasną.
export const RAIN_STOPS = 0.25;
export function dampness(rain = 0, wetness = 0) {
    if (rain >= RAIN_STOPS) return 0;
    const dry = 1 - Math.max(0, Math.min(1, wetness));
    return dry * dry * (1 - Math.max(0, rain) / RAIN_STOPS);
}

// Wiatr: ogień idzie tam, gdzie wieje. dx, dz - kierunek od płonącego
// drzewa do sąsiada; wind - { x, z, speed } (bloki/s).
// Z wiatrem do 2,5 raza łatwiej, pod mocny wiatr - prawie wcale.
export const FULL_WIND = 8;
export function windFactor(dx, dz, wind) {
    const speed = wind?.speed ?? 0, length = Math.hypot(dx, dz);
    if (!(speed > 0.2) || length === 0) return 1;
    const along = (dx * wind.x + dz * wind.z) / (length * speed);
    const strength = Math.min(1, speed / FULL_WIND);
    return Math.max(0.1, 1 + 1.5 * along * strength);
}

// Jak daleko przeskakuje ogień: tyle bloków od pnia do pnia plus promień
// płonącej korony (najwyżej CROWN_REACH), z wiatrem jeszcze dalej.
export const SPREAD_RADIUS = 5;
export const CROWN_REACH = 5;
export const WIND_REACH = 3;
// Szansa na sekundę, że płonące drzewo zapali sąsiada tuż obok, gdy
// wszystko sprzyja (sucho, bez wiatru, zwykłe drzewo, wiosna/jesień).
export const SPREAD_BASE = 0.04;

// Szansa na sekundę zapalenia sąsiada `species` w odległości `distance`
// (dx, dz - kierunek do niego; crown - promień płonącej korony).
export function spreadChance({ species, dx, dz, distance, crown = 0, days = 0, rain = 0, wetness = 0, wind = null }) {
    const reach = SPREAD_RADIUS + Math.max(0, Math.min(CROWN_REACH, crown)) + WIND_REACH * Math.max(0, windFactor(dx, dz, wind) - 1) / 1.5;
    if (!(distance < reach)) return 0;
    return SPREAD_BASE * fireTraits(species).ease * seasonFire(days) * dampness(rain, wetness) * windFactor(dx, dz, wind) * (1 - distance / reach);
}

// Czy da się teraz podpalić to drzewo (gracz ze starterem). Zwraca
// null (da się) albo powód słowami.
export function ignitionProblem(species, days = 0, rain = 0, wetness = 0) {
    const traits = fireTraits(species);
    if (traits.ease <= 0) return 'To drzewo jest nasiąknięte wodą - nie zapali się';
    if (rain >= RAIN_STOPS) return 'W deszczu nic się nie zajmie';
    if (traits.ease * seasonFire(days) * dampness(rain, wetness) < 0.12) return 'Za mokro - drzewo nie chce się zająć';
    return null;
}

// Ustawienie świata.
export const FIRE_MODES = { off: 'wyłączone', player: 'tylko od gracza', full: 'pełne' };
export const DEFAULT_FIRE_MODE = 'player';
// Najwyżej tyle drzew płonie naraz.
export const MAX_BURNING = 40;
// Spalone drzewo nie zajmie się ponownie przez tyle dób.
export const REBURN_DAYS = 3;
