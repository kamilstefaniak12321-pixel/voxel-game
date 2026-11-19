// ------------------------------------------------------------
// STAN GARNKA NA OGNISKU (1.20.0) - bez grafiki i bez ekwipunku
//
// Garnek to pole `pot` ogniska (game/CampfireState.js):
//    { items: [typ, ...]  - surowe składniki (najwyżej POT_CAPACITY),
//      progress: 0-1      - ile się ugotowało,
//      dish: nazwa | null - gotowa potrawa,
//      portions: liczba } - ile porcji zostało do nabrania.
// Garnek na ognisku zawsze ma wodę (stawia się garnek z wodą); pusty po
// ostatniej porcji ma `empty: true` i trzeba go zdjąć.
//
// Zasady opisuje items/cooking.js.
// ------------------------------------------------------------

import { COOK_SECONDS, POT, POT_CAPACITY, POT_MINIMUM, POT_WATER, DISHES, dishFor, isIngredient } from '../items/cooking.js';

export function newPot() {
    return { items: [], progress: 0, dish: null, portions: 0, empty: false };
}

// Garnek z zapisu albo od innego gracza: tylko poprawne wartości.
export function restorePot(value) {
    if (!value || typeof value !== 'object') return null;
    const pot = newPot();
    pot.items = (Array.isArray(value.items) ? value.items : []).filter(isIngredient).slice(0, POT_CAPACITY);
    if (Object.hasOwn(DISHES, value.dish ?? '') && Number.isInteger(value.portions) && value.portions >= 1) {
        pot.dish = value.dish;
        pot.portions = Math.min(POT_CAPACITY, value.portions);
        pot.items = [];
        pot.progress = 1;
    } else {
        pot.progress = pot.items.length >= POT_MINIMUM ? Math.max(0, Math.min(1, Number(value.progress) || 0)) : 0;
        pot.empty = value.empty === true && pot.items.length === 0;
    }
    return pot;
}

// Czy da się jeszcze coś wrzucić.
export function canAddIngredient(pot, type) {
    return Boolean(pot) && !pot.dish && !pot.empty && isIngredient(type) && pot.items.length < POT_CAPACITY;
}

// Wrzuca składnik; gotowanie zaczyna się od nowa.
export function addIngredient(pot, type) {
    if (!canAddIngredient(pot, type)) return false;
    pot.items.push(type);
    pot.progress = 0;
    return true;
}

// Czy w garnku właśnie się gotuje (gdy ogień płonie).
export function isCooking(pot) {
    return Boolean(pot) && !pot.dish && pot.items.length >= POT_MINIMUM;
}

// Mija `dt` sekund nad płonącym ogniem. Zwraca nazwę potrawy, gdy
// właśnie się ugotowała, inaczej null.
export function cookPot(pot, dt) {
    if (!isCooking(pot) || !(dt > 0)) return null;
    pot.progress = Math.min(1, pot.progress + dt / COOK_SECONDS);
    if (pot.progress < 1) return null;
    pot.dish = dishFor(pot.items);
    pot.portions = pot.items.length;
    pot.items = [];
    return pot.dish;
}

// Nabiera porcję. Zwraca nazwę potrawy albo null.
export function takePortion(pot) {
    if (!pot?.dish || pot.portions < 1) return null;
    const dish = pot.dish;
    pot.portions--;
    if (pot.portions === 0) {
        pot.dish = null;
        pot.progress = 0;
        pot.empty = true;
    }
    return dish;
}

// Co odzyskuje się, zdejmując garnek: sam garnek (z wodą, jeśli nic
// w nim nie gotowano) i surowe składniki. Gotowa potrawa przepada -
// dlatego Campfires nie pozwala zdjąć garnka z porcjami.
export function potDrops(pot) {
    if (!pot) return [];
    const counts = new Map([[pot.empty || pot.dish ? POT : POT_WATER, 1]]);
    for (const type of pot.items) counts.set(type, (counts.get(type) ?? 0) + 1);
    return [...counts].map(([type, count]) => ({ type, count }));
}

// Opis słowami (podpowiedź nad ogniskiem).
export function potDescription(pot, burning, label) {
    if (pot.dish) return `${DISHES[pot.dish].label} - ${pot.portions} ${pot.portions === 1 ? 'porcja' : 'porcje'}. Nabierz glinianą miską (PPM).`;
    if (pot.empty) return 'Garnek jest pusty - zdejmij go pustą ręką (PPM) i nabierz wody.';
    if (pot.items.length === 0) return 'Garnek z wodą. Wrzuć dwa albo trzy składniki (PPM z jedzeniem w ręce).';
    const list = pot.items.map(label).join(', ');
    if (pot.items.length < POT_MINIMUM) return `W garnku: ${list}. Dorzuć jeszcze co najmniej jeden składnik.`;
    const dish = DISHES[dishFor(pot.items)].label;
    if (!burning) return `W garnku: ${list} (będzie: ${dish}). Rozpal ognisko, żeby gotować.`;
    return `Gotuje się: ${dish} - ${Math.round(pot.progress * 100)}%${pot.items.length < POT_CAPACITY ? ' (można dorzucić składnik)' : ''}`;
}
