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
//   kind     - 'snack' (lekka przekąska) albo 'meal' (porządny
//              posiłek: jedna sztuka zalicza posiłek - od 0.97.0
//              pieczone nad ogniskiem, ROASTS),
//   effects  - dodatkowe działanie potrawy (np. lepszy wzrok, siła).
//              Na razie puste - miejsce na przyszłe wersje.
// ------------------------------------------------------------

export const FOODS = {
    strawberry: { energy: 7, fullness: 50, kind: 'snack', effects: [] },
    blackberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    blueberry: { energy: 6, fullness: 45, kind: 'snack', effects: [] },
    jablon_jablko: { energy: 12, fullness: 90, kind: 'snack', effects: [] },
    olive_oliwki: { energy: 8, fullness: 80, kind: 'snack', effects: [] },
    hazelnut: { energy: 10, fullness: 120, kind: 'snack', effects: [] },
    beechnuts: { energy: 7, fullness: 90, kind: 'snack', effects: [] },
    acorn: { energy: 4, fullness: 60, kind: 'snack', effects: [] },
    chili_pepper: { energy: 3, fullness: 20, kind: 'snack', effects: [] },

    roasted_apple: { energy: 22, fullness: 150, kind: 'meal', effects: [] },
    roasted_hazelnut: { energy: 20, fullness: 180, kind: 'meal', effects: [] },
    roasted_beechnuts: { energy: 18, fullness: 160, kind: 'meal', effects: [] },
    roasted_acorn: { energy: 18, fullness: 150, kind: 'meal', effects: [] }
};

// Pieczenie nad ogniskiem: surowe -> pieczone. Trzeba trzymać PPM przez
// ROAST_SECONDS na płonącym ognisku (game/Campfires.js).
export const ROASTS = {
    jablon_jablko: 'roasted_apple',
    hazelnut: 'roasted_hazelnut',
    beechnuts: 'roasted_beechnuts',
    acorn: 'roasted_acorn'
};

export const ROAST_SECONDS = 4;

export function getRoast(type) {
    return Object.hasOwn(ROASTS, type) ? ROASTS[type] : null;
}

export const KIND_LABELS = {
    snack: 'lekka przekąska',
    meal: 'porządny posiłek'
};

export function getFood(type) {
    return Object.hasOwn(FOODS, type) ? FOODS[type] : null;
}
