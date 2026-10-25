import { BLOCK_TYPES, getBlockDefinition, getBlockSound } from '../blocks/BlockRegistry.js';
import { ITEM_TYPES, isItemType } from './ItemRegistry.js';

// ------------------------------------------------------------
// KATEGORIE BLOKÓW I PRZEDMIOTÓW
//
// Każdy blok i przedmiot należy do jednej kategorii - według niej
// porządkują się zakładka "Wszystkie bloki" w trybie kreatywnym,
// księga przepisów (crafting) i strony wiki (tools/wiki.mjs).
//
// Kategoria dobiera się sama z pól bloku / przedmiotu (categoryOf
// niżej), a blok albo przedmiot może ją podać wprost: pole `category`.
// ------------------------------------------------------------

export const CATEGORIES = {
    teren: { label: 'Ziemia', icon: 'grass' },
    skaly: { label: 'Skały', icon: 'granite' },
    drewno: { label: 'Drewno', icon: 'oak_log' },
    budowa: { label: 'Budulec', icon: 'lime_plaster' },
    rosliny: { label: 'Rośliny', icon: 'poppy' },
    owoce: { label: 'Owoce i nasiona', icon: 'strawberry' },
    swiatlo: { label: 'Światło', icon: 'lamp' },
    ozdoby: { label: 'Ozdoby', icon: 'spruce_wreath' },
    narzedzia: { label: 'Narzędzia i surowce', icon: 'pickaxe' }
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES);


function categoryOf(type) {

    if (isItemType(type)) {

        const item = ITEM_TYPES[type];

        if (item.category) {
            return item.category;
        }

        // Do posadzenia (owoce, orzechy, szyszki) - owoce i nasiona,
        // reszta (narzędzia, patyk, żywica, kora) - surowce.

        return item.plants ? 'owoce' : 'narzedzia';

    }


    const definition = getBlockDefinition(type);

    if (!definition) {
        return null;
    }

    if (definition.category) {
        return definition.category;
    }

    if (definition.liquid) {
        return 'teren';
    }

    if ((definition.light ?? 0) > 0) {
        return 'swiatlo';
    }

    if (['log', 'stripped', 'planks'].includes(definition.part)) {
        return 'drewno';
    }

    if (definition.model === 'flat') {
        return 'ozdoby';
    }

    if (definition.model === 'cross' || definition.model === 'leaves') {
        return 'rosliny';
    }

    return getBlockSound(type) === 'stone' ? 'skaly' : 'teren';

}


const cache = new Map();

for (const type of [...Object.keys(BLOCK_TYPES), ...Object.keys(ITEM_TYPES)]) {

    const category = categoryOf(type);

    if (category !== null && !Object.hasOwn(CATEGORIES, category)) {
        throw new Error(`"${type}": nieznana kategoria "${category}" (CATEGORIES w src/items/categories.js)`);
    }

    cache.set(type, category);

}


// Kategoria bloku albo przedmiotu (klucz z CATEGORIES) albo null.

export function getCategory(type) {

    return cache.get(type) ?? null;

}


// Lista nazw posortowana według kategorii (w kategorii - kolejność
// z listy wejściowej).

export function sortByCategory(types) {

    const order = (type) => {
        const index = CATEGORY_ORDER.indexOf(getCategory(type));
        return index === -1 ? CATEGORY_ORDER.length : index;
    };

    return types
        .map((type, index) => ({ type, index }))
        .sort((a, b) => order(a.type) - order(b.type) || a.index - b.index)
        .map(({ type }) => type);

}
