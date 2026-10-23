import { blockExists } from '../blocks/BlockRegistry.js';
import { itemExists, getItemLabel } from '../items/ItemRegistry.js';
import { getCategory, CATEGORY_ORDER } from '../items/categories.js';
import { STACK_SIZE } from '../game/Inventory.js';
import { GROUPS, RECIPES } from './recipes.js';

// ------------------------------------------------------------
// WYTWARZANIE (crafting) - siatka 2 x 2 w ekwipunku
//
// Siatka to 4 miejsca (inventory.craft): 0 1 / 2 3 - lewy górny, prawy
// górny, lewy dolny, prawy dolny. Każde: stos { type, count } albo null.
// Wynik liczy się na bieżąco z tego, co leży w siatce (findRecipe);
// wzięcie wyniku zabiera po jednej sztuce z każdego zajętego miejsca.
//
// Przepisy i grupy składników: src/crafting/recipes.js. Okno:
// src/ui/InventoryScreen.js (siatka, wynik, księga przepisów).
// ------------------------------------------------------------

export const GRID_SIZE = 2;

export const GRID_CELLS = GRID_SIZE * GRID_SIZE;


const EMPTY = new Set(['.', ' ']);


// Składnik: nazwa bloku / przedmiotu albo "#grupa".

function isGroup(spec) {

    return spec.startsWith('#');

}


export function ingredientTypes(spec) {

    return isGroup(spec) ? GROUPS[spec.slice(1)]?.types ?? [] : [spec];

}


export function matchesIngredient(spec, type) {

    return type !== null && ingredientTypes(spec).includes(type);

}


export function ingredientLabel(spec) {

    return isGroup(spec) ? GROUPS[spec.slice(1)].label : getItemLabel(spec);

}


// Obrazek składnika (dla grupy - jej ikonka).

export function ingredientIcon(spec) {

    return isGroup(spec) ? GROUPS[spec.slice(1)].icon ?? GROUPS[spec.slice(1)].types[0] : spec;

}


// Kształt przepisu: komórki { row, col, spec } bez pustych, przycięte
// do najmniejszego prostokąta (wtedy kształt można przesuwać po siatce).

function shapeOf(recipe) {

    const cells = [];

    recipe.pattern.forEach((line, row) => {

        [...line].forEach((char, col) => {

            if (!EMPTY.has(char)) {
                cells.push({ row, col, spec: recipe.key[char] });
            }

        });

    });

    const top = Math.min(...cells.map((cell) => cell.row));
    const left = Math.min(...cells.map((cell) => cell.col));

    for (const cell of cells) {
        cell.row -= top;
        cell.col -= left;
    }

    const height = Math.max(...cells.map((cell) => cell.row)) + 1;
    const width = Math.max(...cells.map((cell) => cell.col)) + 1;

    return { cells, width, height };

}


// ------------------------------------------------------------
// Sprawdzenie przepisów przy starcie (literówka = błąd od razu).
// ------------------------------------------------------------

for (const [name, group] of Object.entries(GROUPS)) {

    if (group.types.length === 0) {
        throw new Error(`Grupa składników "#${name}" jest pusta`);
    }

    for (const type of group.types) {
        if (!itemExists(type)) {
            throw new Error(`Grupa "#${name}": nie ma bloku ani przedmiotu "${type}"`);
        }
    }

}


const ids = new Set();

for (const recipe of RECIPES) {

    const where = `Przepis "${recipe.id}"`;

    if (ids.has(recipe.id)) {
        throw new Error(`${where} jest dwa razy`);
    }

    ids.add(recipe.id);

    if (!itemExists(recipe.result?.[0]) || !(recipe.result[1] >= 1 && recipe.result[1] <= STACK_SIZE)) {
        throw new Error(`${where}: zły wynik ${JSON.stringify(recipe.result)}`);
    }

    if (Boolean(recipe.pattern) === Boolean(recipe.ingredients)) {
        throw new Error(`${where}: potrzebny albo kształt (pattern + key), albo lista (ingredients)`);
    }

    const specs = recipe.pattern
        ? recipe.pattern.join('').split('').filter((char) => !EMPTY.has(char)).map((char) => recipe.key?.[char])
        : recipe.ingredients;

    if (specs.length === 0 || specs.length > GRID_CELLS) {
        throw new Error(`${where}: od 1 do ${GRID_CELLS} składników`);
    }

    if (recipe.pattern && (recipe.pattern.length > GRID_SIZE || recipe.pattern.some((line) => line.length > GRID_SIZE))) {
        throw new Error(`${where}: kształt większy niż siatka ${GRID_SIZE} x ${GRID_SIZE}`);
    }

    for (const spec of specs) {

        const known = typeof spec === 'string' && (isGroup(spec) ? Object.hasOwn(GROUPS, spec.slice(1)) : itemExists(spec));

        if (!known) {
            throw new Error(`${where}: nieznany składnik "${spec}"`);
        }

    }

    if (recipe.pattern) {
        recipe.shape = shapeOf(recipe);
    }

}


// Kolejność w księdze: według kategorii wyniku, w kategorii - jak
// w recipes.js.

export const RECIPE_LIST = RECIPES
    .map((recipe, index) => ({ recipe, index }))
    .sort((a, b) =>
        CATEGORY_ORDER.indexOf(getCategory(a.recipe.result[0])) - CATEGORY_ORDER.indexOf(getCategory(b.recipe.result[0])) ||
        a.index - b.index
    )
    .map(({ recipe }) => recipe);


export function getRecipe(id) {

    return RECIPES.find((recipe) => recipe.id === id) ?? null;

}


export function recipeCategory(recipe) {

    return getCategory(recipe.result[0]);

}

// ------------------------------------------------------------
// Dopasowanie siatki do przepisu
// ------------------------------------------------------------

// types - 4 nazwy (albo null) z siatki.

function matchShaped(recipe, types) {

    const filled = [];

    types.forEach((type, index) => {
        if (type) {
            filled.push({ row: Math.floor(index / GRID_SIZE), col: index % GRID_SIZE, type });
        }
    });

    const { cells, width, height } = recipe.shape;

    if (filled.length !== cells.length) {
        return false;
    }

    const top = Math.min(...filled.map((cell) => cell.row));
    const left = Math.min(...filled.map((cell) => cell.col));

    const gridHeight = Math.max(...filled.map((cell) => cell.row)) - top + 1;
    const gridWidth = Math.max(...filled.map((cell) => cell.col)) - left + 1;

    if (gridWidth !== width || gridHeight !== height) {
        return false;
    }

    // Prosto albo odbity w poziomie.

    for (const mirror of [false, true]) {

        const ok = cells.every(({ row, col, spec }) => {

            const gridCol = left + (mirror ? width - 1 - col : col);

            return matchesIngredient(spec, types[(top + row) * GRID_SIZE + gridCol]);

        });

        if (ok) {
            return true;
        }

    }

    return false;

}


function matchShapeless(recipe, types) {

    const items = types.filter(Boolean);

    if (items.length !== recipe.ingredients.length) {
        return false;
    }

    // Każdy składnik - inna rzecz z siatki (przy grupach trzeba
    // sprawdzić przydziały).

    const used = new Array(items.length).fill(false);

    const assign = (k) => {

        if (k === recipe.ingredients.length) {
            return true;
        }

        for (let i = 0; i < items.length; i++) {

            if (!used[i] && matchesIngredient(recipe.ingredients[k], items[i])) {

                used[i] = true;

                if (assign(k + 1)) {
                    return true;
                }

                used[i] = false;

            }

        }

        return false;

    };

    return assign(0);

}


// Przepis pasujący do siatki (tablica 4 nazw albo stosów) albo null.

export function findRecipe(grid) {

    const types = grid.map((cell) => (typeof cell === 'string' ? cell : cell?.type) ?? null);

    if (types.every((type) => type === null)) {
        return null;
    }

    return RECIPES.find((recipe) =>
        recipe.pattern ? matchShaped(recipe, types) : matchShapeless(recipe, types)
    ) ?? null;

}


// Wynik siatki: { recipe, type, count } albo null.

export function gridResult(grid) {

    const recipe = findRecipe(grid);

    return recipe ? { recipe, type: recipe.result[0], count: recipe.result[1] } : null;

}

// ------------------------------------------------------------
// Opis przepisu (księga, /przepisy, wiki)
// ------------------------------------------------------------

// Układ w siatce (do pokazania i do automatycznego układania): 4
// składniki albo null - kształt w lewym górnym rogu, lista po kolei.

export function recipeCells(recipe) {

    const cells = new Array(GRID_CELLS).fill(null);

    if (recipe.shape) {

        for (const { row, col, spec } of recipe.shape.cells) {
            cells[row * GRID_SIZE + col] = spec;
        }

    }
    else {

        recipe.ingredients.forEach((spec, index) => {
            cells[index] = spec;
        });

    }

    return cells;

}


// Składniki zliczone: [{ spec, count }].

export function recipeIngredients(recipe) {

    const counts = new Map();

    for (const spec of recipeCells(recipe).filter(Boolean)) {
        counts.set(spec, (counts.get(spec) ?? 0) + 1);
    }

    return [...counts].map(([spec, count]) => ({ spec, count }));

}


export function recipeText(recipe) {

    const [type, count] = recipe.result;

    const ingredients = recipeIngredients(recipe)
        .map(({ spec, count: n }) => `${n} x ${ingredientLabel(spec)}`)
        .join(' + ');

    const shape = recipe.shape
        ? ` (ułożenie: ${recipe.pattern.map((line) => line.replace(/[. ]/g, '_')).join(' / ')}; ` +
          Object.entries(recipe.key).map(([char, spec]) => `${char} = ${ingredientLabel(spec)}`).join(', ') + ')'
        : ' (obojętne gdzie)';

    return `${getItemLabel(type)}${count > 1 ? ` x${count}` : ''}: ${ingredients}${shape}`;

}


// Przepisy, z których powstaje / do których potrzeba tej rzeczy.

export function recipesFor(type) {

    return RECIPE_LIST.filter((recipe) => recipe.result[0] === type);

}


export function recipesUsing(type) {

    return RECIPE_LIST.filter((recipe) => recipeCells(recipe).some((spec) => spec && matchesIngredient(spec, type)));

}

// ------------------------------------------------------------
// Zapasy: ile razy da się zrobić przepis i co położyć w siatce
// ------------------------------------------------------------

// counts - Map: nazwa -> ile sztuk. Każde miejsce siatki dostaje jedną
// rzecz w `times` sztukach (jeden stos), więc składnik z grupy to jeden
// wybrany rodzaj (najliczniejszy). Zwraca 4 nazwy (albo null) albo null,
// gdy nie starczy.

function assignCells(recipe, counts, times) {

    const left = new Map(counts);

    const cells = recipeCells(recipe);

    const result = new Array(GRID_CELLS).fill(null);

    // Najpierw konkretne rzeczy, potem grupy (mniej wyboru najpierw).

    const order = cells
        .map((spec, index) => ({ spec, index }))
        .filter(({ spec }) => spec)
        .sort((a, b) => ingredientTypes(a.spec).length - ingredientTypes(b.spec).length);

    for (const { spec, index } of order) {

        let best = null;

        for (const type of ingredientTypes(spec)) {

            if ((left.get(type) ?? 0) >= times && (best === null || left.get(type) > left.get(best))) {
                best = type;
            }

        }

        if (best === null) {
            return null;
        }

        left.set(best, left.get(best) - times);

        result[index] = best;

    }

    return result;

}


// Ile razy (najwyżej `limit`) da się zrobić przepis z zapasów.

export function maxCrafts(recipe, counts, limit = STACK_SIZE) {

    let low = 0;
    let high = limit;

    // assignCells jest monotoniczne w `times` - wyszukiwanie połówkowe.

    while (low < high) {

        const middle = Math.ceil((low + high) / 2);

        if (assignCells(recipe, counts, middle)) {
            low = middle;
        }
        else {
            high = middle - 1;
        }

    }

    return low;

}


// Zapasy gracza: ekwipunek + to, co leży w siatce.

export function stockOf(inventory) {

    const counts = new Map();

    for (const item of [...inventory.slots, ...inventory.craft]) {
        if (item) {
            counts.set(item.type, (counts.get(item.type) ?? 0) + item.count);
        }
    }

    return counts;

}


// Siatka wraca do ekwipunku (co się nie zmieści - zostaje w siatce).
// Zwraca true, gdy siatka jest pusta.

export function returnGrid(inventory) {

    const grid = inventory.craft;

    for (let i = 0; i < GRID_CELLS; i++) {

        const item = grid[i];

        if (!item) {
            continue;
        }

        const left = inventory.add(item.type, item.count);

        grid[i] = left > 0 ? { type: item.type, count: left } : null;

    }

    return grid.every((item) => item === null);

}


// Księga przepisów: układa składniki w siatce (z ekwipunku) na `times`
// wytworzeń (mniej, gdy nie starczy). Zwraca, na ile wytworzeń ułożyło
// (0 - nic, siatka bez zmian albo pusta).

export function fillGrid(inventory, recipe, times = 1) {

    if (!returnGrid(inventory)) {
        return 0;
    }

    const counts = stockOf(inventory);

    const possible = Math.min(times, maxCrafts(recipe, counts));

    if (possible === 0) {
        return 0;
    }

    const cells = assignCells(recipe, counts, possible);

    cells.forEach((type, index) => {

        if (type) {

            inventory.remove(type, possible);

            inventory.craft[index] = { type, count: possible };

        }

    });

    return possible;

}


// Zabiera po jednej sztuce z każdego zajętego miejsca siatki
// (wytworzenie). Zwraca wynik { recipe, type, count } albo null.

export function craftFromGrid(inventory) {

    const grid = inventory.craft;

    const result = gridResult(grid);

    if (!result) {
        return null;
    }

    for (let i = 0; i < GRID_CELLS; i++) {

        const item = grid[i];

        if (item) {

            item.count--;

            if (item.count <= 0) {
                grid[i] = null;
            }

        }

    }

    return result;

}


// Shift + klik na wyniku: wytwarza, ile się da (póki siatka daje ten
// sam wynik i jest miejsce w ekwipunku). Zwraca [wynik, ile razy].

export function craftAll(inventory, limit = STACK_SIZE) {

    let first = null;
    let times = 0;

    while (times < limit) {

        const result = gridResult(inventory.craft);

        if (!result || (first && result.recipe !== first.recipe) || !inventory.canAdd(result.type, result.count)) {
            break;
        }

        craftFromGrid(inventory);

        inventory.add(result.type, result.count);

        first ??= result;

        times++;

    }

    return [first, times];

}


// Wytworzenie wprost z ekwipunku (komenda /wytworz): składniki z całego
// ekwipunku, wynik do ekwipunku. Zwraca, ile razy się udało.

export function craftFromInventory(inventory, recipe, times = 1) {

    const placed = fillGrid(inventory, recipe, times);

    if (placed === 0) {
        return 0;
    }

    const [, crafted] = craftAll(inventory, placed);

    returnGrid(inventory);

    return crafted;

}


// Czy rzecz istnieje jako blok (do wiki - bloki i przedmioty osobno).

export function isBlockResult(recipe) {

    return blockExists(recipe.result[0]);

}
