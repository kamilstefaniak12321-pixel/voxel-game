// ------------------------------------------------------------
// JEDZENIE (0.94.0)
//
// Które przedmioty da się zjeść (klawisz F - game/Game.js: eat) i co
// dają. Zasady energii i samopoczucia: src/game/Wellbeing.js.
//
// Pola:
//   energy   - ile energii dodaje jedna sztuka (pełny zapas zdrowego
//              gracza to 100),
//   fullness - na ile sekund syci (najedzony gracz zużywa mniej
//              energii i nie burczy mu w brzuchu),
//   kind     - 'snack' (lekka przekąska), 'meal' (porządny posiłek:
//              jedna sztuka zalicza posiłek - od 0.97.0 pieczone nad
//              ogniskiem, ROASTS) albo 'drink' (napój: da się wypić
//              także z pełnym żołądkiem),
//   effects  - dodatkowe działanie (od 0.98.1): lista nazw efektów
//              z items/effects.js, np. ['calm']; puste - bez działania,
//   returns  - co zostaje w ręce po zjedzeniu albo wypiciu (kubek).
//
// Napary (0.98.1, docs/ziola.md): gliniany kubek + dwa zioła z jednej
// grupy (crafting/recipes.js) dają kubek ziół; podgrzany nad płonącym
// ogniskiem (ROASTS) zamienia się w napar. Wypity napar oddaje kubek.
// ------------------------------------------------------------

// Rodzaje naparów: nazwa efektu -> przedmioty (kubek ziół, napar).
export const TEAS = {
    calm: { brew: 'brew_calm', tea: 'tea_calm', herbs: 'herbs_calm' },
    heal: { brew: 'brew_heal', tea: 'tea_heal', herbs: 'herbs_heal' },
    vigor: { brew: 'brew_vigor', tea: 'tea_vigor', herbs: 'herbs_vigor' }
};

export const CUP = 'clay_cup';

export const FOODS = {
    strawberry: { energy: 7, fullness: 50, kind: 'snack', effects: [] },
    blackberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    blueberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    jablon_jablko: { energy: 12, fullness: 90, kind: 'snack', effects: [] },
    olive_oliwki: { energy: 8, fullness: 80, kind: 'snack', effects: [] },
    coconut_palm_kokos: { energy: 14, fullness: 110, kind: 'snack', effects: [] },
    // 1.10.0: owoce drzew z 1.8.0.
    banyan_fig: { energy: 9, fullness: 70, kind: 'snack', effects: [] },
    baobab_fruit: { energy: 13, fullness: 100, kind: 'snack', effects: [] },
    dragon_tree_berries: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    joshua_tree_flowers: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    araucaria_nuts: { energy: 11, fullness: 120, kind: 'snack', effects: [] },
    hazelnut: { energy: 10, fullness: 120, kind: 'snack', effects: [] },
    beechnuts: { energy: 7, fullness: 90, kind: 'snack', effects: [] },
    acorn: { energy: 4, fullness: 60, kind: 'snack', effects: [] },
    chili_pepper: { energy: 3, fullness: 20, kind: 'snack', effects: [] },
    // 1.17.0: owoce krzewów jagodowych (blocks/shrubs.js).
    aronia: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    redcurrant: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    blackcurrant: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    gooseberry: { energy: 6, fullness: 50, kind: 'snack', effects: [] },
    red_gooseberry: { energy: 6, fullness: 50, kind: 'snack', effects: [] },
    raspberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    yellow_raspberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    rose_hip: { energy: 5, fullness: 45, kind: 'snack', effects: [] },
    rose_petals: { energy: 2, fullness: 15, kind: 'snack', effects: [] },
    elderberry: { energy: 4, fullness: 35, kind: 'snack', effects: [] },
    elderflower: { energy: 2, fullness: 15, kind: 'snack', effects: [] },
    sea_buckthorn_berry: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    // 1.19.0: rośliny niskie (blocks/lowPlants.js).
    cranberry: { energy: 4, fullness: 35, kind: 'snack', effects: [] },
    lingonberry: { energy: 5, fullness: 40, kind: 'snack', effects: [] },
    wild_strawberry: { energy: 6, fullness: 40, kind: 'snack', effects: [] },
    pumpkin_slice: { energy: 8, fullness: 80, kind: 'snack', effects: [] },
    pumpkin_seeds: { energy: 6, fullness: 60, kind: 'snack', effects: [] },
    zucchini: { energy: 6, fullness: 70, kind: 'snack', effects: [] },

    roasted_apple: { energy: 22, fullness: 150, kind: 'meal', effects: [] },
    roasted_hazelnut: { energy: 20, fullness: 180, kind: 'meal', effects: [] },
    roasted_beechnuts: { energy: 18, fullness: 160, kind: 'meal', effects: [] },
    roasted_acorn: { energy: 18, fullness: 150, kind: 'meal', effects: [] },
    roasted_pumpkin_slice: { energy: 20, fullness: 170, kind: 'meal', effects: [] },
    roasted_zucchini: { energy: 18, fullness: 150, kind: 'meal', effects: [] },

    ...Object.fromEntries(Object.entries(TEAS).map(([effect, { tea }]) =>
        [tea, { energy: 3, fullness: 30, kind: 'drink', effects: [effect], returns: CUP }]))
};

// Pieczenie nad ogniskiem: surowe -> pieczone. Trzeba trzymać PPM przez
// ROAST_SECONDS na płonącym ognisku (game/Campfires.js).
export const ROASTS = {
    jablon_jablko: 'roasted_apple',
    hazelnut: 'roasted_hazelnut',
    beechnuts: 'roasted_beechnuts',
    acorn: 'roasted_acorn',
    pumpkin_slice: 'roasted_pumpkin_slice',
    zucchini: 'roasted_zucchini',
    // Kubek ziół -> napar.
    ...Object.fromEntries(Object.values(TEAS).map(({ brew, tea }) => [brew, tea]))
};

export const ROAST_SECONDS = 4;

export function getRoast(type) {
    return Object.hasOwn(ROASTS, type) ? ROASTS[type] : null;
}

export const KIND_LABELS = {
    snack: 'lekka przekąska',
    meal: 'porządny posiłek',
    drink: 'napar'
};

// Czy to, co powstaje nad ogniskiem, jest napojem (parzenie, nie pieczenie).
export function isDrink(type) {
    return getFood(type)?.kind === 'drink';
}

export function getFood(type) {
    return Object.hasOwn(FOODS, type) ? FOODS[type] : null;
}
