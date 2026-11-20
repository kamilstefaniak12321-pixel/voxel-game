// ------------------------------------------------------------
// ŚWIEŻOŚĆ STOSU (1.24.0) - pomysł Kamila
//
// Stos psującego się jedzenia ma pole `fresh`: ile mu jeszcze zostało,
// od 1 (świeże) do 0 (zepsute). Cały stos ma jedną świeżość i psuje się
// naraz (game/Spoilage.js). Rzeczy, które się nie psują, pola nie mają.
//
// Łączenie stosów:
//   - samo z siebie (zbiór, podnoszenie, Shift + klik) jedzenie dokłada
//     się tylko do stosu o TAKIEJ SAMEJ świeżości (różnica najwyżej
//     SAME_FRESH - wtedy też liczy się średnia); inne trafia na puste
//     miejsce,
//   - ręcznie (stos na stos w ekwipunku albo skrzyni) łączy się zawsze,
//     a świeżość wychodzi ze średniej obu stosów (ważonej liczbą sztuk).
//
// Wszystkie miejsca, które kopiują albo dzielą stos, robią to przez
// withCount - inaczej świeżość by ginęła.
//
// Od 1.27.0 to samo dotyczy wyglądu ubrania (look - items/clothing.js):
// stos ubrania niesie swój krój i kolory, a ubrania się nie układają
// w stosy (stackSize - 1).
// ------------------------------------------------------------

import { isPerishable } from './spoilage.js';
import { isGarment, cleanLook, sameLook } from './clothing.js';

// Najwięcej sztuk w stosie (Inventory.js - STACK_SIZE).
export const MAX_STACK = 64;

// Ile sztuk tej rzeczy mieści się w jednym stosie.
export function stackSize(type) {
    return isGarment(type) ? 1 : MAX_STACK;
}

// Stosy różniące się świeżością najwyżej o tyle łączą się same. Jedna
// dziesiąta to pół doby dla malin i ponad doba dla jabłek: zbiory
// z jednego dnia trafiają do jednego stosu, wczorajsze leżą osobno.
export const SAME_FRESH = 0.1;

const clamp = (value) => Math.max(0.001, Math.min(1, value));

// Świeżość stosu (1 - świeże) albo undefined, gdy rzecz się nie psuje.
export function freshOf(item) {
    if (!item || !isPerishable(item.type)) return undefined;
    return Number.isFinite(item.fresh) ? clamp(item.fresh) : 1;
}

// Nowy stos. fresh pomijane - świeże (dla psujących się); look -
// wygląd ubrania (pominięty - gładkie, niebarwione).
export function makeItem(type, count, fresh, look) {
    if (isGarment(type)) return { type, count, look: cleanLook(look) };
    if (!isPerishable(type)) return { type, count };
    return { type, count, fresh: Number.isFinite(fresh) ? clamp(fresh) : 1 };
}

// Kopia stosu z inną liczbą sztuk (ta sama świeżość i ten sam wygląd).
export function withCount(item, count) {
    return makeItem(item.type, count, item.fresh, item.look);
}

// Czy do stosu `item` samo dołoży się jedzenie `type` o świeżości `fresh`
// (ubranie - tylko takie samo; i tak się nie zmieści, bo stos to 1).
export function sameBatch(item, type, fresh, look) {
    if (!item || item.type !== type) return false;
    if (isGarment(type)) return sameLook(item.look, look);
    if (!isPerishable(type)) return true;
    return Math.abs(freshOf(item) - (Number.isFinite(fresh) ? clamp(fresh) : 1)) <= SAME_FRESH;
}

// Dokłada `count` sztuk o świeżości `fresh` do stosu `item` (w miejscu):
// świeżość to średnia ważona liczbą sztuk.
export function blend(item, count, fresh) {
    if (isPerishable(item.type) && count > 0) {
        const added = Number.isFinite(fresh) ? clamp(fresh) : 1;
        item.fresh = clamp((freshOf(item) * item.count + added * count) / (item.count + count));
    }
    item.count += count;
    return item;
}
