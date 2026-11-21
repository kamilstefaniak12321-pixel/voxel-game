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
//
// Od 1.33.0 pole `fresh` mają też polana: znaczy u nich SUCHOŚĆ (1 -
// suche, mniej - mokre; items/moisture.js). Suche polano pola nie ma,
// więc wygląda w zapisie jak dotąd. Łączenie stosów działa tak samo.
// ------------------------------------------------------------

import { isPerishable } from './spoilage.js';
import { isGarment, cleanLook, sameLook } from './clothing.js';
import { isSeasonable, wetBar } from './moisture.js';
import { isTorchItem, fuelBar } from './torchFuel.js';

// Czy stos tej rzeczy niesie pole `fresh` (świeżość jedzenia, suchość
// drewna albo - od 1.35.0 - paliwo pochodni, items/torchFuel.js).
export const hasFresh = (type) => isPerishable(type) || isSeasonable(type) || isTorchItem(type);

// Rzeczy, których stos w pełnym stanie (1) nie ma pola: suche polano,
// nowa pochodnia.
const bareWhenFull = (type) => isSeasonable(type) || isTorchItem(type);

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

// Świeżość stosu (1 - świeże; dla polan: 1 - suche) albo undefined,
// gdy rzecz jej nie ma.
export function freshOf(item) {
    if (!item || !hasFresh(item.type)) return undefined;
    return Number.isFinite(item.fresh) ? clamp(item.fresh) : 1;
}

// Pasek świeżości na ikonce stosu (1.29.0 - ekwipunek, pasek, kursor):
// null - bez paska (nie psuje się albo prosto z krzaka), inaczej
// { fresh, color } - kolor od zielonego (świeże) przez żółty do
// czerwonego (zaraz się zepsuje).
export const FRESH_BAR_FROM = 0.97;

// Polano (1.33.0): niebieski pasek - ile ma wody; suche bez paska.
// spoiling - czy jedzenie w tym świecie się psuje (tryb przygody);
// wilgotność drewna widać zawsze.
export function freshBar(item, spoiling = true) {
    if (item && isSeasonable(item.type)) return wetBar(item);
    // Pochodnia (1.35.0): pomarańczowy pasek - ile paliwa; nowa bez paska.
    if (item && isTorchItem(item.type)) return fuelBar(item);
    if (!spoiling) return null;
    const fresh = freshOf(item);
    if (fresh === undefined || fresh >= FRESH_BAR_FROM) return null;
    return { fresh, color: `hsl(${Math.round(fresh * 120)}, 80%, 45%)` };
}

// Pole `fresh` nowego stosu: suche polano go nie ma.
function freshField(type, fresh) {
    const value = Number.isFinite(fresh) ? clamp(fresh) : 1;
    return bareWhenFull(type) && value >= 1 ? {} : { fresh: value };
}

// Nowy stos. fresh pomijane - świeże (dla psujących się); look -
// wygląd ubrania (pominięty - gładkie, niebarwione).
export function makeItem(type, count, fresh, look) {
    if (isGarment(type)) return { type, count, look: cleanLook(look) };
    if (!hasFresh(type)) return { type, count };
    return { type, count, ...freshField(type, fresh) };
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
    if (!hasFresh(type)) return true;
    return Math.abs(freshOf(item) - (Number.isFinite(fresh) ? clamp(fresh) : 1)) <= SAME_FRESH;
}

// Dokłada `count` sztuk o świeżości `fresh` do stosu `item` (w miejscu):
// świeżość to średnia ważona liczbą sztuk.
export function blend(item, count, fresh) {
    if (hasFresh(item.type) && count > 0) {
        const added = Number.isFinite(fresh) ? clamp(fresh) : 1;
        const mixed = clamp((freshOf(item) * item.count + added * count) / (item.count + count));
        if (bareWhenFull(item.type) && mixed >= 1) delete item.fresh;
        else item.fresh = mixed;
    }
    item.count += count;
    return item;
}
