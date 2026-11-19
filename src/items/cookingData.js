// ------------------------------------------------------------
// GOTOWANIE W GARNKU - DANE (1.20.0)
//
// Nazwy przedmiotów, potrawy i ich wartości. Osobno od items/cooking.js,
// żeby items/foods.js mógł stąd wziąć potrawy bez zapętlenia importów.
// Opis zasad: items/cooking.js.
// ------------------------------------------------------------

export const POT = 'clay_pot';
export const POT_WATER = 'clay_pot_water';
export const WET_POT = 'wet_clay_pot';
export const BOWL = 'clay_bowl';
export const WET_BOWL = 'wet_clay_bowl';

// Ile składników mieści garnek i od ilu zaczyna się gotować.
export const POT_CAPACITY = 3;
export const POT_MINIMUM = 2;

// Ile sekund nad płonącym ogniem gotuje się potrawa.
export const COOK_SECONDS = 45;

export const dishItem = (dish) => `dish_${dish}`;

// Potrawy po kolei od najbardziej wymagającej. match dostaje liczniki:
// { vegetable, nut, savory, fruit, total } i licznik sztuk `of(typ)`.
// color - kolor potrawy w garnku (rendering/CampfireRenderer.js).
export const DISHES = {
    vegetable_stew: {
        label: 'Gulasz warzywny', energy: 38, fullness: 290, color: 0xb9742c,
        hint: 'dynia i cukinia',
        match: (c, of) => of('pumpkin_slice') >= 1 && of('zucchini') >= 1
    },
    pumpkin_soup: {
        label: 'Zupa dyniowa', energy: 34, fullness: 260, color: 0xe08a1e,
        hint: 'dwa kawałki dyni',
        match: (c, of) => of('pumpkin_slice') >= 2
    },
    zucchini_stew: {
        label: 'Duszona cukinia', energy: 32, fullness: 250, color: 0x8fa24a,
        hint: 'dwie cukinie',
        match: (c, of) => of('zucchini') >= 2
    },
    nut_soup: {
        label: 'Polewka orzechowa', energy: 34, fullness: 270, color: 0xa98a5c,
        hint: 'dwie porcje orzechów, żołędzi albo pestek',
        match: (c) => c.nut >= 2
    },
    compote: {
        label: 'Kompot owocowy', energy: 26, fullness: 190, color: 0xa8324a,
        hint: 'same owoce',
        match: (c) => c.fruit === c.total
    },
    mixed_stew: {
        label: 'Polewka', energy: 28, fullness: 210, color: 0x9a7a4e,
        hint: 'cokolwiek jadalnego',
        match: () => true
    }
};

export const DISH_NAMES = Object.keys(DISHES);

// Potrawy jako jedzenie (do FOODS w foods.js): porządny posiłek z miski.
export const DISH_FOODS = Object.fromEntries(DISH_NAMES.map((dish) =>
    [dishItem(dish), { energy: DISHES[dish].energy, fullness: DISHES[dish].fullness, kind: 'meal', effects: [], returns: BOWL }]));

// Przedmioty do ItemRegistry.js.
export const COOKING_ITEMS = {
    [WET_POT]: { name: 'Wet clay pot', label: 'Mokry garnek z gliny', icon: WET_POT, category: 'narzedzia' },
    [POT]: { name: 'Clay pot', label: 'Gliniany garnek', icon: POT, category: 'narzedzia' },
    [POT_WATER]: { name: 'Clay pot of water', label: 'Garnek z wodą', icon: POT_WATER, category: 'narzedzia' },
    [WET_BOWL]: { name: 'Wet clay bowl', label: 'Mokra miska z gliny', icon: WET_BOWL, category: 'narzedzia' },
    [BOWL]: { name: 'Clay bowl', label: 'Gliniana miska', icon: BOWL, category: 'narzedzia' },
    ...Object.fromEntries(DISH_NAMES.map((dish) =>
        [dishItem(dish), { name: `Bowl of ${dish}`, label: DISHES[dish].label, icon: dishItem(dish), category: 'owoce' }]))
};
