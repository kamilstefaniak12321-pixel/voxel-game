// ------------------------------------------------------------
// GOTOWANIE W GARNKU (1.20.0)
//
// Gliniany garnek z wodą stawia się na ognisku, wrzuca do niego dwa
// albo trzy surowe składniki i czeka: nad płonącym ogniem po
// COOK_SECONDS powstaje potrawa - tyle porcji, ile było składników.
// Porcję nabiera się glinianą miską; zjedzona potrawa oddaje miskę.
//
// Co wyjdzie, zależy od składników (DISHES - pierwsza pasująca potrawa
// z listy). Z czegokolwiek jadalnego wychodzi przynajmniej polewka.
//
// Sam stan garnka (co w nim jest, ile się ugotowało) liczy
// game/CookingState.js, klikanie - game/Campfires.js, wygląd -
// rendering/CampfireRenderer.js.
//
// Nowa potrawa: wpis w DISHES (przed potrawami ogólniejszymi), ikonka
// w tools/garnek_tekstury.py. Nowy rodzaj składnika: wpis w KINDS.
// ------------------------------------------------------------

import { FOODS } from './foods.js';
import { DISHES, DISH_NAMES, POT_MINIMUM } from './cookingData.js';

export * from './cookingData.js';

// Rodzaje składników. Czego tu nie ma, a jest surową przekąską - owoc.
const KINDS = {
    vegetable: ['pumpkin_slice', 'zucchini'],
    nut: ['hazelnut', 'beechnuts', 'acorn', 'araucaria_nuts', 'pumpkin_seeds', 'coconut_palm_kokos'],
    savory: ['olive_oliwki', 'chili_pepper']
};

const KIND_OF = new Map(Object.entries(KINDS).flatMap(([kind, types]) => types.map((type) => [type, kind])));

// Rodzaj składnika ('vegetable', 'nut', 'savory', 'fruit') albo null,
// gdy tego się nie gotuje (potrawy, pieczone, napary).
export function ingredientKind(type) {
    const food = Object.hasOwn(FOODS, type ?? '') ? FOODS[type] : null;
    if (!food || food.kind !== 'snack' || food.returns) return null;
    return KIND_OF.get(type) ?? 'fruit';
}

export const isIngredient = (type) => ingredientKind(type) !== null;

// Co wyjdzie z takich składników: nazwa potrawy albo null (za mało).
export function dishFor(items) {
    if (!Array.isArray(items) || items.length < POT_MINIMUM || !items.every(isIngredient)) return null;
    const counts = { vegetable: 0, nut: 0, savory: 0, fruit: 0, total: items.length };
    for (const type of items) counts[ingredientKind(type)]++;
    const of = (type) => items.filter((item) => item === type).length;
    return DISH_NAMES.find((dish) => DISHES[dish].match(counts, of));
}

