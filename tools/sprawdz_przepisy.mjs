// ------------------------------------------------------------
// SPRAWDZENIE PRZEPISÓW (src/crafting/recipes.js)
//
// Dla każdego przepisu układa jego składniki w siatce 2 x 2 na wszystkie
// sposoby, na które gracz może je położyć (przesunięcie i odbicie
// kształtu, każda kolejność składników bez kształtu, każdy blok z grupy)
// i sprawdza, że wychodzi właśnie ten przepis - a nie inny, który
// "przejmuje" ten sam układ. Uruchomienie po dodaniu przepisu:
//     node tools/sprawdz_przepisy.mjs
// ------------------------------------------------------------

const C = await import(new URL('../src/crafting/Crafting.js', import.meta.url).href);

let errors = 0;
let checked = 0;

function expect(recipe, grid, what) {

    checked++;

    const found = C.findRecipe(grid);

    if (found !== recipe) {
        errors++;
        console.log(`BŁĄD: ${recipe.id} - ${what}: wychodzi ${found ? found.id : 'nic'} (siatka: ${grid.map((t) => t ?? '-').join(' ')})`);
    }

}


function permutations(list) {

    if (list.length <= 1) {
        return [list];
    }

    return list.flatMap((item, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [item, ...rest]));

}


for (const recipe of C.RECIPE_LIST) {

    const cells = C.recipeCells(recipe);

    // Każdy rodzaj z każdej grupy w każdym miejscu.

    for (let i = 0; i < cells.length; i++) {

        if (!cells[i]) {
            continue;
        }

        for (const type of C.ingredientTypes(cells[i])) {
            const grid = cells.map((spec) => spec && C.ingredientTypes(spec)[0]);
            grid[i] = type;
            expect(recipe, grid, `wariant ${type}`);
        }

    }

    if (recipe.shape) {

        const { cells: shape, width, height } = recipe.shape;

        for (let row = 0; row <= 2 - height; row++) {
            for (let col = 0; col <= 2 - width; col++) {
                for (const mirror of [false, true]) {
                    const grid = [null, null, null, null];
                    for (const cell of shape) {
                        const c = mirror ? width - 1 - cell.col : cell.col;
                        grid[(cell.row + row) * 2 + c + col] = C.ingredientTypes(cell.spec)[0];
                    }
                    expect(recipe, grid, `przesunięcie ${row},${col}${mirror ? ', odbicie' : ''}`);
                }
            }
        }

    }
    else {

        const items = recipe.ingredients.map((spec) => C.ingredientTypes(spec)[0]);

        for (const places of permutations([0, 1, 2, 3])) {
            const grid = [null, null, null, null];
            items.forEach((type, k) => {
                grid[places[k]] = type;
            });
            expect(recipe, grid, `kolejność ${places.join('')}`);
        }

    }

}

console.log(`Przepisów: ${C.RECIPE_LIST.length}, sprawdzonych układów: ${checked}, błędów: ${errors}.`);

process.exit(errors > 0 ? 1 : 0);
