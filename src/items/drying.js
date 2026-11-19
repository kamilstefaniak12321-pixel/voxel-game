// ------------------------------------------------------------
// SUSZENIE NA SŁOŃCU (1.21.0) - wszystko, co schnie
//
// Mokra glina (items/clay.js) i - od 1.21.0 - owoce. Zasada ta sama:
// wyrzucone pod gołe niebo w dzień, po DRY_SECONDS leżenia zamieniają
// się w suche (game/Drops.js: updateDrying). Schnie cały stos naraz.
//
// Każdy świeży owoc daje te same SUSZONE OWOCE: syte, lekkie w plecaku
// (jeden stos zamiast dziesięciu) i dobre do garnka także zimą, gdy
// nic nie owocuje. Nie suszy się warzyw, orzechów (i tak leżą długo),
// kwiatów ani ostrej papryki.
// ------------------------------------------------------------

import { DRYING } from './clay.js';
import { ingredientKind } from './cooking.js';
import { FOODS } from './foods.js';

export const DRIED_FRUIT = 'dried_fruit';

// Jadalne kwiaty - nie do suszenia na owoce.
const NOT_FRUIT = new Set(['rose_petals', 'elderflower', 'joshua_tree_flowers', DRIED_FRUIT]);

// Owoce, które da się ususzyć.
export const DRYABLE_FRUITS = Object.keys(FOODS).filter((type) => ingredientKind(type) === 'fruit' && !NOT_FRUIT.has(type));

const FRUIT_SET = new Set(DRYABLE_FRUITS);

// W co wysycha przedmiot: nazwa albo null.
export function driesInto(type) {
    if (Object.hasOwn(DRYING, type ?? '')) return DRYING[type];
    return FRUIT_SET.has(type) ? DRIED_FRUIT : null;
}
