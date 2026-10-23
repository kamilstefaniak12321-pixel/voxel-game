import * as THREE from 'three';

import { HOTBAR_SIZE } from '../config.js';
import { CREATIVE_ITEMS, getItemLabel } from '../items/ItemRegistry.js';
import { CATEGORIES, CATEGORY_ORDER, getCategory, sortByCategory } from '../items/categories.js';
import { STACK_SIZE, SLOT_COUNT } from '../game/Inventory.js';
import {
    GRID_CELLS,
    RECIPE_LIST,
    craftAll,
    craftFromGrid,
    fillGrid,
    getRecipe,
    gridResult,
    ingredientIcon,
    ingredientLabel,
    maxCrafts,
    matchesIngredient,
    recipeCategory,
    recipeCells,
    recipeIngredients,
    returnGrid,
    stockOf
} from '../crafting/Crafting.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { playUi } from '../audio/ui.js';
import { skyUniforms } from '../sky/skyShader.js';

// ------------------------------------------------------------
// EKWIPUNEK (klawisz E)
//
// Tryb kreatywny: zakładki - "Wszystkie bloki" (każdy blok gry
// i przedmiot - z kategoriami i wyszukiwaniem) i "Ekwipunek". Tryb
// przygody: sam ekwipunek.
// W zakładce ekwipunku: postać gracza, 27 miejsc, WYTWARZANIE (siatka
// 2 x 2 i wynik - src/crafting/) i przycisk KSIĘGI PRZEPISÓW (panel
// z lewej: przepisy według kategorii, klik układa składniki w siatce).
// Na dole zawsze pasek bloków (9 miejsc), w kreatywnym także kosz.
//
// Obsługa jak w Minecrafcie:
//   klik             - weź stos / połóż / zamień / dołóż do takiego samego,
//   prawy przycisk   - weź połowę / połóż jedną sztukę,
//   Shift + klik     - szybko: pasek <-> reszta ekwipunku (blok
//                      z zakładki kreatywnej - prosto na pasek, z siatki
//                      wytwarzania - do ekwipunku),
//   klik na wyniku   - weź wyrób (składniki ubywają po jednej sztuce),
//   Shift + wynik    - wytwórz, ile się da, prosto do ekwipunku,
//   1-9 nad miejscem - zamiana z miejscem paska,
//   E                - zamknij (ESC - pauza).
// Trzymany blok (pod kursorem) i składniki z siatki po zamknięciu wracają
// do ekwipunku (co się nie zmieści - czeka w siatce).
//
// W zakładce ekwipunku widać postać gracza (patrzy za myszką).
// Dźwięki (src/audio/ui.js): otwarcie, zamknięcie, wzięcie
// i odłożenie stosu, kosz, wytworzenie.
// ------------------------------------------------------------

const TABS = {
    blocks: 'Wszystkie bloki',
    inventory: 'Ekwipunek'
};

const HELP = {
    blocks: 'Klik - weź stos | PPM - jedna sztuka | Shift + klik - na pasek | 1-9 - na to miejsce paska | kosz - usuń | E - zamknij',
    inventory: 'Klik - weź / połóż | PPM - połowa / jedna sztuka | Shift + klik - pasek ↔ ekwipunek | wynik: klik - weź, Shift + klik - ile się da | 1-9 - zamiana z paskiem | E - zamknij'
};

// Na telefonie (stuknięcia zamiast myszy i klawiszy).
const HELP_TOUCH = {
    blocks: 'Stuknięcie w blok - weź stos, potem stuknięcie w miejsce paska - połóż | kosz - usuń',
    inventory: 'Stuknięcie - weź / połóż stos | wynik - wyrób prosto do ekwipunku | 📖 Przepisy - stuknięcie układa składniki w siatce'
};

// Księga przepisów otwarta / zamknięta - pamiętane w przeglądarce.
const BOOK_KEY = 'voxel-game-recipe-book';

// Węższy ekran (telefon): księga zamiast 27 miejsc ekwipunku, w tym
// samym oknie (pasek bloków i siatka zostają), bez wyszukiwania.
const COMPACT_WIDTH = 1150;


function el(tag, className, text) {

    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;

}


// Tekst do wyszukiwania: małe litery, bez polskich znaków.

function simplify(text) {

    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l');

}


function loadBookOpen() {

    try {
        return localStorage.getItem(BOOK_KEY) === '1';
    }
    catch {
        return false;
    }

}


function saveBookOpen(open) {

    try {
        localStorage.setItem(BOOK_KEY, open ? '1' : '0');
    }
    catch {
        // Bez zapisu - księga i tak działa.
    }

}

// ------------------------------------------------------------

export class InventoryScreen {

    // icons    - Map: nazwa bloku -> obrazek (BlockIcons.js)
    // handlers - { close(relock) } (main.js)

    constructor(icons, handlers) {

        this.icons = icons;
        this.handlers = handlers;

        this.root = el('div');
        this.root.id = 'inventory';
        this.root.hidden = true;

        // Schowane od początku - inaczej puste miejsce na blok pod
        // kursorem było widać w lewym dolnym rogu ekranu (także w menu).

        this.cursorElement = el('div', 'inv-cursor');
        this.cursorElement.append(el('img'), el('span', 'inv-count'));
        this.cursorElement.hidden = true;

        this.tooltip = el('div', 'inv-tooltip');
        this.tooltip.hidden = true;

        document.body.append(this.root, this.cursorElement, this.tooltip);


        this.game = null;
        this.tab = 'blocks';
        this.search = '';

        // Kategoria w zakładce "Wszystkie bloki" (null = wszystko).
        this.category = null;

        // Księga przepisów: otwarta?, kategoria, wyszukiwanie, tylko
        // możliwe do zrobienia.
        this.book = {
            open: loadBookOpen(),
            category: null,
            search: '',
            craftable: false
        };

        // Przepis, którego nie da się zrobić, kliknięty w księdze -
        // jego składniki widać w pustej siatce na półprzezroczysto.
        this.ghost = null;

        // Blok trzymany pod kursorem: { type, count } albo null.
        this.cursor = null;

        // Miejsce pod myszką: { kind: 'slot' | 'craft', index } /
        // { kind: 'creative', type } / { kind: 'result' }.
        this.hover = null;

        this.mouse = { x: 0, y: 0 };

        // Podgląd postaci: jedno płótno i jeden renderer na całą grę
        // (każdy nowy renderer to nowy kontekst WebGL, a przeglądarka
        // pozwala tylko na kilka naraz).

        this.previewCanvas = el('canvas', 'inv-preview');
        this.previewCanvas.width = 160;
        this.previewCanvas.height = 224;

        this.preview = null;


        this.root.addEventListener('mousedown', (event) => this.onMouseDown(event));
        this.root.addEventListener('contextmenu', (event) => event.preventDefault());
        this.root.addEventListener('mousemove', (event) => this.onMouseMove(event));

        window.addEventListener('keydown', (event) => this.onKeyDown(event));

        // Obrót telefonu / zmiana okna przy otwartej księdze - inny układ.

        window.addEventListener('resize', () => {

            if (this.isOpen && this.tab === 'inventory' && this.book.open && (innerWidth < COMPACT_WIDTH) !== this.compact) {
                this.build();
            }

        });

    }


    get isOpen() {

        return !this.root.hidden;

    }


    open(game) {

        this.game = game;

        this.cursor = null;

        this.ghost = null;

        if (game.mode !== 'creative') {
            this.tab = 'inventory';
        }

        this.root.hidden = false;

        this.build();

        playUi('ui_open');

    }


    // Zamyka ekwipunek. Trzymany blok i składniki z siatki wracają do
    // ekwipunku.

    close() {

        if (!this.isOpen) {
            return;
        }

        if (this.cursor && this.game) {

            const left = this.game.inventory.add(this.cursor.type, this.cursor.count);

            // Nie ma miejsca - do siatki wytwarzania (czeka tam w zapisie).

            if (left > 0) {
                this.storeInGrid({ type: this.cursor.type, count: left });
            }

        }

        if (this.game) {
            returnGrid(this.game.inventory);
        }

        this.cursor = null;
        this.hover = null;
        this.ghost = null;

        this.root.hidden = true;
        this.cursorElement.hidden = true;
        this.tooltip.hidden = true;

        playUi('ui_close');

    }


    // Stos, którego nie ma gdzie odłożyć: pierwsze wolne (albo takie
    // samo) miejsce siatki.

    storeInGrid(item) {

        const grid = this.game.inventory.craft;

        for (let i = 0; i < GRID_CELLS && item.count > 0; i++) {

            if (!grid[i]) {
                grid[i] = { ...item };
                return;
            }

            if (grid[i].type === item.type && grid[i].count < STACK_SIZE) {
                const moved = Math.min(item.count, STACK_SIZE - grid[i].count);
                grid[i].count += moved;
                item.count -= moved;
            }

        }

    }

    // --------------------------------------------------------
    // Budowa ekranu
    // --------------------------------------------------------

    build() {

        const game = this.game;

        const creative = game.mode === 'creative';

        const panel = el('div', 'inv-panel');


        // Nagłówek: zakładki (kreatywny) albo tytuł.

        if (creative) {

            const tabs = el('div', 'inv-tabs');

            for (const [id, name] of Object.entries(TABS)) {

                const tab = el('button', `inv-tab${id === this.tab ? ' selected' : ''}`, name);

                tab.type = 'button';
                tab.dataset.tab = id;

                tabs.append(tab);

            }

            panel.append(tabs);

        }
        else {

            panel.append(el('div', 'inv-title', 'Ekwipunek'));

        }


        this.bookElement = null;

        if (this.tab === 'blocks') {

            const search = el('input', 'inv-search');

            search.type = 'text';
            search.placeholder = 'Szukaj bloku...';
            search.value = this.search;

            search.addEventListener('input', () => {

                this.search = search.value;

                this.fillCreative();

            });

            this.searchInput = search;

            this.creativeChips = this.chipRow('creative', this.category);

            this.creativeGrid = el('div', 'inv-grid');

            const scroll = el('div', 'inv-scroll');

            scroll.append(this.creativeGrid);

            panel.append(this.creativeChips, search, scroll);

            this.fillCreative();

        }
        else {

            this.searchInput = null;

            panel.classList.add('inv-crafting');

            const row = el('div', 'inv-row');

            this.compact = innerWidth < COMPACT_WIDTH;

            if (this.book.open && this.compact) {

                // Telefon: księga w miejscu ekwipunku (zamknięcie księgi -
                // ekwipunek wraca).

                row.append(this.bookPanel(true), this.craftElement());

            }
            else {

                const main = el('div', 'inv-grid');

                for (let i = HOTBAR_SIZE; i < SLOT_COUNT; i++) {
                    main.append(this.slotElement(i));
                }

                row.append(this.previewCanvas, main, this.craftElement());

                if (this.book.open) {
                    this.bookElement = this.bookPanel(false);
                }

            }

            panel.append(row);

        }


        // Pasek bloków (+ kosz w trybie kreatywnym).

        const bottom = el('div', 'inv-bottom');

        const hotbar = el('div', 'inv-grid inv-hotbar');

        for (let i = 0; i < HOTBAR_SIZE; i++) {
            hotbar.append(this.slotElement(i));
        }

        bottom.append(hotbar);

        if (creative) {

            const trash = el('div', 'inv-slot inv-trash', '🗑');

            trash.dataset.kind = 'trash';
            trash.title = 'Kosz - upuść tu blok, żeby go usunąć';

            bottom.append(trash);

        }

        panel.append(bottom, el('p', 'inv-help', (game.touchMode ? HELP_TOUCH : HELP)[this.tab]));


        this.root.replaceChildren(...(this.bookElement ? [this.bookElement] : []), panel);

        this.refresh();

    }


    slotElement(index, kind = 'slot') {

        const selected = kind === 'slot' && index < HOTBAR_SIZE && index === this.game.inventory.selected;

        const slot = el('div', `inv-slot${selected ? ' selected' : ''}`);

        slot.dataset.kind = kind;
        slot.dataset.index = index;

        slot.append(el('img'), el('span', 'inv-count'));

        return slot;

    }


    // Wytwarzanie: siatka 2 x 2 -> wynik, pod spodem przycisk księgi.

    craftElement() {

        const box = el('div', 'inv-craft');

        box.append(el('div', 'inv-craft-title', 'Wytwarzanie'));

        const area = el('div', 'inv-craft-area');

        const grid = el('div', 'inv-craft-grid');

        for (let i = 0; i < GRID_CELLS; i++) {
            grid.append(this.slotElement(i, 'craft'));
        }

        const result = el('div', 'inv-slot inv-result');

        result.dataset.kind = 'result';
        result.append(el('img'), el('span', 'inv-count'));

        area.append(grid, el('span', 'inv-craft-arrow', '➜'), result);

        const toggle = el('button', `inv-book-toggle${this.book.open ? ' selected' : ''}`, '📖 Przepisy');

        toggle.type = 'button';
        toggle.title = 'Księga przepisów';

        box.append(area, toggle);

        return box;

    }


    // Rząd kategorii (kreatywny: bloki, księga: przepisy).
    // where - 'creative' / 'book', current - wybrana (null = wszystko).

    chipRow(where, current) {

        const row = el('div', 'inv-chips');

        const all = el('button', `inv-chip inv-chip-all${current === null ? ' selected' : ''}`, 'Wszystko');

        all.type = 'button';
        all.dataset.where = where;
        all.dataset.category = '';

        row.append(all);

        // W księdze tylko kategorie, w których są przepisy.

        const categories = where === 'book'
            ? CATEGORY_ORDER.filter((category) => RECIPE_LIST.some((recipe) => recipeCategory(recipe) === category))
            : CATEGORY_ORDER;

        for (const category of categories) {

            const chip = el('button', `inv-chip${current === category ? ' selected' : ''}`);

            chip.type = 'button';
            chip.dataset.where = where;
            chip.dataset.category = category;
            chip.title = CATEGORIES[category].label;

            const image = el('img');

            image.src = this.icons.get(CATEGORIES[category].icon) ?? '';
            image.draggable = false;

            chip.append(image);

            row.append(chip);

        }

        return row;

    }


    // Bloki w zakładce kreatywnej (kategoria i wyszukiwanie), ułożone
    // według kategorii.

    fillCreative() {

        const query = simplify(this.search.trim());

        const items = sortByCategory(CREATIVE_ITEMS).filter((type) =>
            (this.category === null || getCategory(type) === this.category) &&
            (!query || simplify(getItemLabel(type)).includes(query) || type.includes(query))
        );


        this.creativeGrid.replaceChildren(
            ...items.map((type) => {

                const slot = el('div', 'inv-slot');

                slot.dataset.kind = 'creative';
                slot.dataset.type = type;

                const image = el('img');

                image.src = this.icons.get(type) ?? '';
                image.draggable = false;

                slot.append(image);

                return slot;

            })
        );

        if (items.length === 0) {
            this.creativeGrid.append(el('p', 'inv-empty', 'Nie ma takiego bloku.'));
        }

    }

    // --------------------------------------------------------
    // Księga przepisów
    // --------------------------------------------------------

    // compact - wąski ekran: wszystko w jednym rzędzie nad przepisami,
    // bez wyszukiwania i opisu.

    bookPanel(compact) {

        const book = el('div', `inv-book${compact ? ' compact' : ''}`);

        const head = el('div', 'inv-book-head');

        const close = el('button', 'inv-book-close', '✕');

        close.type = 'button';
        close.title = 'Zamknij księgę';

        head.append(el('span', 'inv-title', 'Przepisy'), close);


        const search = el('input', 'inv-search');

        search.type = 'text';
        search.placeholder = 'Szukaj przepisu...';
        search.value = this.book.search;

        search.addEventListener('input', () => {

            this.book.search = search.value;

            this.fillBook();

        });


        const filter = el('button', `inv-chip inv-book-filter${this.book.craftable ? ' selected' : ''}`, 'Tylko możliwe');

        filter.type = 'button';
        filter.title = 'Pokaż tylko przepisy, na które masz składniki';


        this.bookGrid = el('div', 'inv-book-grid');

        const scroll = el('div', 'inv-scroll inv-book-scroll');

        scroll.append(this.bookGrid);


        if (compact) {

            const chips = this.chipRow('book', this.book.category);

            chips.append(filter, close);

            book.append(chips, scroll);

        }
        else {

            book.append(
                head,
                this.chipRow('book', this.book.category),
                search,
                filter,
                scroll,
                el('p', 'inv-help', 'Klik - ułóż w siatce (jeszcze raz - więcej) | Shift + klik - ile się da | szare - brak składników')
            );

        }

        this.fillBook();

        return book;

    }


    fillBook() {

        if (!this.bookGrid) {
            return;
        }

        const query = simplify(this.book.search.trim());

        const stock = stockOf(this.game.inventory);

        const recipes = RECIPE_LIST.filter((recipe) => {

            const type = recipe.result[0];

            return (this.book.category === null || recipeCategory(recipe) === this.book.category) &&
                (!query || simplify(getItemLabel(type)).includes(query) || type.includes(query) || recipe.id.includes(query)) &&
                (!this.book.craftable || maxCrafts(recipe, stock, 1) > 0);

        });


        this.bookGrid.replaceChildren(
            ...recipes.map((recipe) => {

                const [type, count] = recipe.result;

                const entry = el('div', 'inv-slot inv-recipe');

                entry.dataset.kind = 'recipe';
                entry.dataset.recipe = recipe.id;

                const image = el('img');

                image.src = this.icons.get(type) ?? '';
                image.draggable = false;

                entry.append(image, el('span', 'inv-count', count > 1 ? String(count) : ''));

                return entry;

            })
        );

        if (recipes.length === 0) {
            this.bookGrid.append(el('p', 'inv-empty', this.book.craftable ? 'Brak składników na żaden przepis.' : 'Nie ma takiego przepisu.'));
        }

        this.refreshBook(stock);

    }


    // Przepisy, na które brakuje składników - szare.

    refreshBook(stock = stockOf(this.game.inventory)) {

        if (!this.bookGrid?.isConnected) {
            return;
        }

        for (const entry of this.bookGrid.querySelectorAll('.inv-recipe')) {
            entry.classList.toggle('missing', maxCrafts(getRecipe(entry.dataset.recipe), stock, 1) === 0);
        }

    }


    // Klik na przepisie w księdze: składniki z ekwipunku do siatki
    // (kolejny klik - jeszcze jeden komplet, Shift - ile się da).
    // Brak składników - podpowiedź w siatce (duch przepisu).

    clickRecipe(id, shift) {

        const recipe = getRecipe(id);

        const inventory = this.game.inventory;

        if (!recipe) {
            return;
        }


        // Cudzy blok pod kursorem wraca najpierw do ekwipunku.

        if (this.cursor) {

            const left = inventory.add(this.cursor.type, this.cursor.count);

            this.cursor = left > 0 ? { type: this.cursor.type, count: left } : null;

        }


        const current = gridResult(inventory.craft);

        const sets = current?.recipe === recipe
            ? Math.min(...inventory.craft.filter(Boolean).map((item) => item.count))
            : 0;

        const placed = fillGrid(inventory, recipe, shift ? STACK_SIZE : sets + 1);

        if (placed > 0) {

            this.ghost = null;

            playUi('item_place', { pitch: 1.1 });

        }
        else {

            this.ghost = recipe;

            playUi('ui_error');

        }

    }

    // --------------------------------------------------------
    // Odświeżanie
    // --------------------------------------------------------

    // Odświeża obrazki i liczby w miejscach ekwipunku, siatki, wyniku
    // i bloku pod kursorem.

    refresh() {

        const inventory = this.game.inventory;

        for (const slot of this.root.querySelectorAll('.inv-slot[data-kind="slot"]')) {

            const index = Number(slot.dataset.index);

            this.showItem(slot, inventory.get(index));

            slot.classList.toggle('selected', index === inventory.selected);

        }


        // Siatka wytwarzania (z duchem przepisu, gdy pusta) i wynik.

        const grid = inventory.craft;

        if (grid.some(Boolean)) {
            this.ghost = null;
        }

        const ghostCells = this.ghost ? recipeCells(this.ghost) : null;

        for (const slot of this.root.querySelectorAll('.inv-slot[data-kind="craft"]')) {

            const index = Number(slot.dataset.index);

            const ghost = ghostCells?.[index] ?? null;

            this.showItem(slot, grid[index] ?? (ghost ? { type: ingredientIcon(ghost), count: 1 } : null));

            slot.classList.toggle('ghost', Boolean(ghost) && !grid[index]);

        }

        const resultSlot = this.root.querySelector('.inv-slot[data-kind="result"]');

        if (resultSlot) {

            const result = gridResult(grid);

            this.showItem(resultSlot, result
                ? { type: result.type, count: result.count }
                : this.ghost ? { type: this.ghost.result[0], count: this.ghost.result[1] } : null);

            resultSlot.classList.toggle('ready', Boolean(result));
            resultSlot.classList.toggle('ghost', !result && Boolean(this.ghost));

        }

        this.refreshBook();


        this.cursorElement.hidden = !this.cursor;

        if (this.cursor) {
            this.showItem(this.cursorElement, this.cursor);
        }

        this.positionCursor();

    }


    showItem(element, item) {

        const image = element.querySelector('img');
        const count = element.querySelector('.inv-count');

        if (item) {

            image.src = this.icons.get(item.type) ?? '';
            image.hidden = false;

        }
        else {

            image.removeAttribute('src');
            image.hidden = true;

        }

        count.textContent = item && item.count > 1 ? String(item.count) : '';

    }

    // --------------------------------------------------------
    // Myszka i klawisze
    // --------------------------------------------------------

    onMouseDown(event) {

        const tab = event.target.closest('.inv-tab');

        if (tab) {

            if (tab.dataset.tab !== this.tab) {
                playUi('ui_click');
            }

            this.tab = tab.dataset.tab;

            this.build();

            return;

        }


        if (event.target.closest('.inv-search')) {
            return;
        }

        event.preventDefault();


        // Przyciski: kategorie, księga przepisów.

        if (this.onButton(event.target)) {
            return;
        }


        const slot = event.target.closest('.inv-slot');

        const right = event.button === 2;


        if (!slot) {

            // Klik obok okna z blokiem pod kursorem: w kreatywnym blok
            // znika, w przygodzie wraca do ekwipunku.

            if (!event.target.closest('.inv-panel, .inv-book') && this.cursor) {

                if (this.game.mode !== 'creative') {

                    const left = this.game.inventory.add(this.cursor.type, this.cursor.count);

                    if (left > 0) {
                        this.storeInGrid({ type: this.cursor.type, count: left });
                    }

                }

                playUi(this.game.mode === 'creative' ? 'item_trash' : 'item_place');

                this.cursor = null;

                this.refresh();

            }

            return;

        }


        const kind = slot.dataset.kind;

        // Stan przed kliknięciem - po nim wiadomo, jaki dźwięk zagrać.

        const before = this.snapshot(slot);

        if (kind === 'trash') {

            if (this.cursor) {
                playUi('item_trash');
            }

            this.cursor = null;

        }
        else if (kind === 'creative') {
            this.clickCreative(slot.dataset.type, right, event.shiftKey);
        }
        else if (kind === 'result') {
            this.clickResult(event.shiftKey);
        }
        else if (kind === 'recipe') {
            this.clickRecipe(slot.dataset.recipe, event.shiftKey);
        }
        else {
            this.clickSlot(kind, Number(slot.dataset.index), right, event.shiftKey);
        }

        if (kind === 'slot' || kind === 'craft' || kind === 'creative') {
            this.playClickSound(before, this.snapshot(slot), event.shiftKey);
        }

        this.refresh();

        this.updateTooltip(event);

    }


    // Kategorie i księga. Zwraca true, gdy kliknięto przycisk.

    onButton(target) {

        const chip = target.closest('.inv-chip[data-where]');

        if (chip) {

            const category = chip.dataset.category || null;

            playUi('ui_click');

            if (chip.dataset.where === 'creative') {

                this.category = category;

                this.updateChips(chip.parentElement, category);

                this.fillCreative();

            }
            else {

                this.book.category = category;

                this.updateChips(chip.parentElement, category);

                this.fillBook();

            }

            return true;

        }


        if (target.closest('.inv-book-filter')) {

            this.book.craftable = !this.book.craftable;

            target.closest('.inv-book-filter').classList.toggle('selected', this.book.craftable);

            playUi('ui_click');

            this.fillBook();

            return true;

        }


        if (target.closest('.inv-book-toggle, .inv-book-close')) {

            this.book.open = !this.book.open;

            saveBookOpen(this.book.open);

            playUi('ui_click', { pitch: this.book.open ? 1.05 : 0.9 });

            this.build();

            return true;

        }

        return false;

    }


    updateChips(row, category) {

        for (const chip of row.querySelectorAll('.inv-chip')) {
            chip.classList.toggle('selected', (chip.dataset.category || null) === category);
        }

    }


    // Kursor i miejsce (tekst do porównania przed / po kliknięciu).

    snapshot(slot) {

        const index = Number(slot.dataset.index);

        const item =
            slot.dataset.kind === 'slot' ? this.game.inventory.get(index) :
            slot.dataset.kind === 'craft' ? this.game.inventory.craft[index] :
            null;

        return {
            cursor: this.cursor ? `${this.cursor.type}:${this.cursor.count}` : '',
            slot: item ? `${item.type}:${item.count}` : '',
            hotbar: JSON.stringify([this.game.inventory.slots, this.game.inventory.craft])
        };

    }


    // Wzięcie (pod kursorem przybyło), odłożenie (ubyło albo zamiana),
    // Shift + klik (przeniesienie) - albo cisza, gdy nic się nie zmieniło.

    playClickSound(before, after, shift) {

        if (shift) {

            if (before.hotbar !== after.hotbar) {
                playUi('item_place', { pitch: 1.15 });
            }

            return;

        }

        if (before.cursor === after.cursor && before.slot === after.slot) {
            return;
        }

        const count = (state) => Number(state.cursor.split(':')[1] ?? 0);

        if (!before.cursor || (before.cursor.split(':')[0] === after.cursor.split(':')[0] && count(after) > count(before))) {
            playUi('item_pick');
        }
        else {
            playUi('item_place');
        }

    }


    // Blok z zakładki "Wszystkie bloki".

    clickCreative(type, right, shift) {

        const inventory = this.game.inventory;


        if (shift) {

            // Prosto na pasek: pierwsze puste miejsce albo wybrane.

            const slots = inventory.slots.slice(0, HOTBAR_SIZE);

            const empty = slots.indexOf(null);

            inventory.set(empty !== -1 ? empty : inventory.selected, { type, count: STACK_SIZE });

            return;

        }


        if (right) {

            if (this.cursor?.type === type) {
                this.cursor.count = Math.min(STACK_SIZE, this.cursor.count + 1);
            }
            else {
                this.cursor = { type, count: 1 };
            }

            return;

        }

        this.cursor = { type, count: STACK_SIZE };

    }


    // Miejsca: ekwipunek (kind 'slot': 0-8 pasek, 9-35 reszta) albo
    // siatka wytwarzania ('craft': 0-3).

    container(kind) {

        const inventory = this.game.inventory;

        if (kind === 'craft') {

            return {
                get: (index) => inventory.craft[index] ?? null,
                set: (index, item) => {
                    inventory.craft[index] = item && item.count > 0 ? item : null;
                }
            };

        }

        return {
            get: (index) => inventory.get(index),
            set: (index, item) => inventory.set(index, item)
        };

    }


    clickSlot(kind, index, right, shift) {

        const inventory = this.game.inventory;

        const slots = this.container(kind);

        const item = slots.get(index);


        if (shift && !this.cursor) {

            if (kind === 'craft') {

                // Z siatki do ekwipunku (co się nie zmieści - zostaje).

                if (item) {

                    const left = inventory.add(item.type, item.count);

                    slots.set(index, left > 0 ? { type: item.type, count: left } : null);

                }

            }

            // W kreatywnej zakładce bloków nie widać reszty ekwipunku -
            // Shift + klik na pasku po prostu go czyści.

            else if (this.tab === 'blocks' && index < HOTBAR_SIZE) {
                inventory.set(index, null);
            }
            else {
                inventory.quickMove(index);
            }

            return;

        }


        const held = this.cursor;


        if (right) {

            if (!held && item) {

                // Połowa stosu (większa połowa) pod kursor.

                const half = Math.ceil(item.count / 2);

                this.cursor = { type: item.type, count: half };

                slots.set(index, item.count - half > 0 ? { type: item.type, count: item.count - half } : null);

            }
            else if (held && (!item || (item.type === held.type && item.count < STACK_SIZE))) {

                // Jedna sztuka do miejsca.

                slots.set(index, { type: held.type, count: (item?.count ?? 0) + 1 });

                held.count--;

                if (held.count <= 0) {
                    this.cursor = null;
                }

            }
            else if (held && item) {

                slots.set(index, held);

                this.cursor = item;

            }

            return;

        }


        if (!held) {

            this.cursor = item;

            slots.set(index, null);

            return;

        }


        if (item && item.type === held.type) {

            // Dokładamy do takiego samego stosu (reszta zostaje pod kursorem).

            const moved = Math.min(held.count, STACK_SIZE - item.count);

            item.count += moved;
            held.count -= moved;

            if (held.count <= 0) {
                this.cursor = null;
            }

            return;

        }


        // Puste miejsce albo inny blok - kładziemy / zamieniamy.

        slots.set(index, held);

        this.cursor = item;

    }


    // Wynik wytwarzania: klik - wyrób pod kursor (albo dołożony do tego
    // samego pod kursorem), Shift + klik - ile się da, do ekwipunku.
    // Na telefonie (bez Shifta i bez przeciągania) stuknięcie z pustym
    // "kursorem" wkłada jeden wyrób prosto do ekwipunku.

    clickResult(shift) {

        const inventory = this.game.inventory;

        if (shift || (this.game.touchMode && !this.cursor)) {

            const [result, times] = craftAll(inventory, shift ? STACK_SIZE : 1);

            if (times > 0) {
                this.crafted(result, times);
            }

            return;

        }


        const result = gridResult(inventory.craft);

        if (!result) {
            return;
        }

        const held = this.cursor;

        if (held && (held.type !== result.type || held.count + result.count > STACK_SIZE)) {
            return;
        }

        craftFromGrid(inventory);

        this.cursor = { type: result.type, count: (held?.count ?? 0) + result.count };

        this.crafted(result, 1);

    }


    crafted(result, times) {

        playUi('item_craft');

        this.ghost = null;

        this.game.achieve?.('crafted', {
            type: result.type,
            count: result.count * times,
            recipe: result.recipe.id
        });

    }


    onMouseMove(event) {

        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;

        this.positionCursor();

        this.updateTooltip(event);

    }


    // Podpowiedź: polska nazwa i nazwa bloku w komendach; na przepisie -
    // składniki (✔ masz, ✖ brakuje).

    updateTooltip(event) {

        const slot = event.target.closest?.('.inv-slot');

        this.hover = null;

        let label = '';

        let recipe = null;

        const kind = slot?.dataset.kind;

        if (kind === 'creative') {

            this.hover = { kind, type: slot.dataset.type };

            label = slot.dataset.type;

        }
        else if (kind === 'slot' || kind === 'craft') {

            const index = Number(slot.dataset.index);

            this.hover = { kind, index };

            label = this.container(kind).get(index)?.type ?? '';

            if (!label && kind === 'craft' && this.ghost) {
                label = recipeCells(this.ghost)[index] ?? '';
            }

        }
        else if (kind === 'result') {

            this.hover = { kind };

            const result = gridResult(this.game.inventory.craft);

            recipe = result?.recipe ?? this.ghost;

        }
        else if (kind === 'recipe') {

            recipe = getRecipe(slot.dataset.recipe);

        }


        const show = Boolean(label || recipe) && !this.cursor;

        this.tooltip.hidden = !show;

        if (!show) {
            return;
        }

        if (recipe) {
            this.tooltip.replaceChildren(...this.recipeTooltip(recipe));
        }
        else if (label.startsWith('#')) {
            this.tooltip.replaceChildren(ingredientLabel(label));
        }
        else {
            this.tooltip.replaceChildren(getItemLabel(label), el('span', 'inv-tooltip-id', label));
        }

        // Przy prawej / dolnej krawędzi ekranu - z drugiej strony kursora.

        const width = this.tooltip.offsetWidth;
        const height = this.tooltip.offsetHeight;

        const left = event.clientX + 14 + width > innerWidth - 4 ? event.clientX - 14 - width : event.clientX + 14;
        const top = Math.max(4, Math.min(innerHeight - height - 4, event.clientY - 30));

        this.tooltip.style.left = `${Math.max(4, left)}px`;
        this.tooltip.style.top = `${top}px`;

    }


    recipeTooltip(recipe) {

        const [type, count] = recipe.result;

        const stock = stockOf(this.game.inventory);

        const lines = [
            el('div', 'inv-tooltip-title', `${getItemLabel(type)}${count > 1 ? ` x${count}` : ''}`)
        ];

        for (const { spec, count: needed } of recipeIngredients(recipe)) {

            let have = 0;

            for (const [stockType, n] of stock) {
                if (matchesIngredient(spec, stockType)) {
                    have += n;
                }
            }

            const ok = have >= needed;

            lines.push(el('div', `inv-tooltip-line${ok ? ' ok' : ' missing'}`, `${ok ? '✔' : '✖'} ${needed} x ${ingredientLabel(spec)}`));

        }

        lines.push(el('div', 'inv-tooltip-line', recipe.shape ? 'Ułożenie ważne (widać w siatce)' : 'Obojętne, gdzie leżą'));

        if (recipe.note) {
            lines.push(el('div', 'inv-tooltip-note', recipe.note));
        }

        return lines;

    }


    positionCursor() {

        this.cursorElement.style.left = `${this.mouse.x}px`;
        this.cursorElement.style.top = `${this.mouse.y}px`;

    }


    onKeyDown(event) {

        if (!this.isOpen) {
            return;
        }


        const typing = event.target?.classList?.contains('inv-search');

        if (event.code === 'Escape') {

            event.preventDefault();

            this.handlers.close(false);

            return;

        }

        if (typing) {
            return;
        }

        // Przytrzymany E (powtarzanie klawisza) nie zamyka okna -
        // dopiero kolejne wciśnięcie.

        if (event.code === 'KeyE') {

            event.preventDefault();

            if (!event.repeat) {
                this.handlers.close(true);
            }

            return;

        }


        // 1-9 nad miejscem / blokiem: zamiana z tym miejscem paska.

        const digit = /^Digit([1-9])$/.exec(event.code);

        if (!digit || !this.hover || this.hover.kind === 'result') {
            return;
        }

        const target = Number(digit[1]) - 1;

        const inventory = this.game.inventory;


        if (this.hover.kind === 'creative') {
            inventory.set(target, { type: this.hover.type, count: STACK_SIZE });
        }
        else if (this.hover.kind === 'craft' || this.hover.index !== target) {

            const slots = this.container(this.hover.kind);

            const item = slots.get(this.hover.index);

            slots.set(this.hover.index, inventory.get(target));
            inventory.set(target, item);

        }

        playUi('item_place', { pitch: 1.15 });

        this.refresh();

    }

    // --------------------------------------------------------
    // Postać gracza w ekwipunku
    // --------------------------------------------------------

    // Co klatkę (gdy ekwipunek jest otwarty): rysuje model gracza
    // na małym płótnie. Głowa patrzy w stronę myszki.

    update() {

        if (!this.isOpen || this.tab !== 'inventory' || !this.previewCanvas?.isConnected) {
            return;
        }

        const model = this.game.model;

        const canvas = this.previewCanvas;


        if (!this.preview) {

            const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });

            renderer.setPixelRatio(1);
            renderer.setSize(canvas.width, canvas.height, false);
            renderer.outputColorSpace = THREE.SRGBColorSpace;

            const scene = new THREE.Scene();

            scene.add(new THREE.AmbientLight(0xffffff, 1.5));

            const sun = new THREE.DirectionalLight(0xffffff, 2);

            sun.position.set(-2, 4, -5);

            scene.add(sun);

            const camera = new THREE.PerspectiveCamera(30, canvas.width / canvas.height, 0.1, 20);

            camera.position.set(0, 1.05, -4.4);
            camera.lookAt(0, 0.92, 0);

            this.preview = { renderer, scene, camera };

        }


        const { renderer, scene, camera } = this.preview;

        const object = model.object;


        // Model na chwilę trafia do sceny podglądu (w pełnym świetle).

        const parent = object.parent;
        const position = object.position.clone();
        const rotation = object.rotation.y;
        const visible = object.visible;

        const sky = modelLight.uModelSky.value;
        const block = modelLight.uModelBlock.value.clone();
        const night = skyUniforms.uNightDesaturation.value;

        modelLight.uModelSky.value = 1;
        modelLight.uModelBlock.value.set(0, 0, 0);
        skyUniforms.uNightDesaturation.value = 0;

        scene.add(object);

        object.position.set(0, 0, 0);
        object.rotation.set(0, 0.35, 0);
        object.visible = true;


        // Głowa za myszką.

        const rect = canvas.getBoundingClientRect();

        const dx = (this.mouse.x - (rect.left + rect.width / 2)) / 300;
        const dy = (this.mouse.y - (rect.top + rect.height * 0.2)) / 300;

        model.bones.neck.rotation.set(
            Math.max(-0.7, Math.min(0.7, -dy)),
            Math.max(-1, Math.min(1, -dx)) - 0.35,
            0,
            'YXZ'
        );

        renderer.render(scene, camera);


        parent?.add(object);

        object.position.copy(position);
        object.rotation.set(0, rotation, 0);
        object.visible = visible;

        modelLight.uModelSky.value = sky;
        modelLight.uModelBlock.value.copy(block);
        skyUniforms.uNightDesaturation.value = night;

    }

}
