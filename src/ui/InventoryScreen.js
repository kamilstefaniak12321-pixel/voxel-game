import * as THREE from 'three';

import { HOTBAR_SIZE, isCreative } from '../config.js';
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
import { modelLight, setModelPreviewRenderer } from '../rendering/ModelMaterial.js';
import { playUi } from '../audio/ui.js';
import { ChestView, CHEST_VIEW_WIDTH, CHEST_VIEW_HEIGHT } from './ChestView.js';
import { coveredItem, insertIntoChest, putIntoCell, takeFromCell, visibleItem } from '../game/ChestState.js';
import { skyUniforms } from '../sky/skyShader.js';
import { SETTINGS_DEFAULTS } from '../settings/Settings.js';
import { bindings, formatKeys, mouseCode } from '../input/bindings.js';
import { makeItem, withCount, sameBatch, blend, stackSize, freshBar } from '../items/freshness.js';
import { freshText } from '../items/spoilage.js';
import { fireNotes } from '../items/woodNotes.js';
import { wetNotes } from '../items/moisture.js';
import { fuelNotes } from '../items/torchFuel.js';
import { garmentInfo, fitsSlot, lookText, SLOTS as CLOTHING_SLOTS, SLOT_LABELS, GARMENTS } from '../items/clothing.js';
import { garmentIcon } from './garmentIcons.js';

// ------------------------------------------------------------
// EKWIPUNEK (klawisz E)
//
// Układ (0.77.0, projekt Kamila): nad ramą mały pasek (tytuł albo
// wyszukiwanie, przejście Bloki / Ekwipunek, Przepisy, kosz, zamknięcie),
// pod ramą krótka pomoc.
// Ekwipunek: postać gracza (2 kolumny) | 3 miejsca na przyszłe ubrania,
// plecaki i paski na narzędzia | STREFA RZEMIEŚLNICZA (siatka 2 x 2
// i wynik - src/crafting/; później tu będzie też widok otwartej
// skrzyni); pod spodem 27 miejsc i pasek - razem 4 x 9. Przycisk KSIĘGI
// PRZEPISÓW otwiera panel z lewej (przepisy według kategorii, klik
// układa składniki w siatce).
// Kreatywny ("Bloki"): 9 łukowatych zakładek kategorii (ponowny klik -
// wszystko), 5 przewijanych rzędów bloków, pod nimi pasek; wyszukiwanie
// szuka we wszystkich kategoriach.
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
    blocks: 'Bloki',
    inventory: 'Ekwipunek'
};

// Trzy miejsca obok postaci - na przyszłe ubrania, plecaki i paski na
// narzędzia (na razie nic się w nich nie kładzie).
// Miejsca na sobie: cztery na ubrania (1.27.0 - items/clothing.js),
// plecak i pas na narzędzia - wkrótce.
export const EQUIPMENT_SLOTS = ['Głowa', 'Tułów', 'Nogi', 'Stopy', 'Plecak', 'Pas na narzędzia'];
export const CLOTHING_SLOT_COUNT = CLOTHING_SLOTS.length;

const HELP = {
    blocks: 'Klik - weź stos | PPM - jedna sztuka | Shift + klik - na pasek | 1-9 - na to miejsce paska | kosz - usuń | [inventory] - zamknij',
    inventory: 'Klik - weź / połóż | PPM - połowa / jedna sztuka | Shift + klik - pasek ↔ ekwipunek | wynik: klik - weź, Shift + klik - ile się da | 1-9 - zamiana z paskiem | [drop] albo klik obok okna - wyrzuć | [inventory] - zamknij'
};

// Na telefonie (stuknięcia zamiast myszy i klawiszy).
const HELP_TOUCH = {
    blocks: 'Stuknięcie w blok - weź stos, potem stuknięcie w miejsce paska - połóż | kosz - usuń',
    inventory: 'Stuknięcie - weź / połóż stos | przytrzymanie - opis | stuknięcie obok okna - wyrzuć | wynik - wyrób prosto do ekwipunku | 📖 Przepisy - stuknięcie układa składniki w siatce'
};

// Ile trzeba przytrzymać palec na stosie, żeby zobaczyć opis (ms, 1.29.0).
export const LONG_PRESS_MS = 450;

// Księga przepisów otwarta / zamknięta - pamiętane w przeglądarce.
const BOOK_KEY = 'voxel-game-recipe-book';


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
        this.cursorElement.append(el('img'), el('span', 'inv-count'), el('span', 'inv-fresh'));
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

        // Miejsce pod myszką: { kind: 'slot' | 'craft', index } /
        // { kind: 'creative', type } / { kind: 'result' }.
        this.hover = null;

        this.mouse = { x: 0, y: 0 };

        // Podgląd postaci: jedno płótno i jeden renderer na całą grę
        // (każdy nowy renderer to nowy kontekst WebGL, a przeglądarka
        // pozwala tylko na kilka naraz).

        // Renderer rysuje do płótna poza stroną: postać (160 x 224 z lewej)
        // i skrzynię (obok) - stamtąd kopie trafiają na płótna w oknie.

        this.glCanvas = document.createElement('canvas');
        this.glCanvas.width = 160 + CHEST_VIEW_WIDTH;
        this.glCanvas.height = Math.max(224, CHEST_VIEW_HEIGHT);

        this.previewCanvas = el('canvas', 'inv-preview');
        this.previewCanvas.width = 160;
        this.previewCanvas.height = 224;

        this.preview = null;

        // Otwarta skrzynia (ChestState.js) i jej okno w strefie
        // rzemieślniczej (ChestView.js) - albo null.

        this.chest = null;
        this.chestView = null;


        this.root.addEventListener('mousedown', (event) => this.onMouseDown(event));
        this.root.addEventListener('contextmenu', (event) => event.preventDefault());
        this.root.addEventListener('mousemove', (event) => this.onMouseMove(event));

        // Telefon (1.29.0): przytrzymanie palca na stosie pokazuje opis
        // (nazwa, świeżość, ubranie) - zwykłe stuknięcie dalej bierze
        // i kładzie stos.
        this.root.addEventListener('touchstart', (event) => this.onTouchStart(event), { passive: true });
        this.root.addEventListener('touchmove', () => clearTimeout(this.pressTimer), { passive: true });
        this.root.addEventListener('touchcancel', () => clearTimeout(this.pressTimer), { passive: true });
        this.root.addEventListener('touchend', (event) => this.onTouchEnd(event), { passive: false });

        // Klawiatura uruchamia przycisk przez click, bez mousedown.
        this.root.addEventListener('click', (event) => {
            if (event.detail === 0 && event.target.closest('.inv-close')) {
                this.handlers.close(true);
            }
        });

        const clearHover = () => {
            this.hover = null;
            this.tooltip.hidden = true;
        };

        this.root.addEventListener('scroll', clearHover, true);
        window.addEventListener('resize', () => { clearHover(); this.queueLayout(); });
        document.fonts?.ready.then(() => this.queueLayout());
        document.fonts?.addEventListener('loadingdone', () => this.queueLayout());
        document.getElementById('theme-css')?.addEventListener('load', () => this.queueLayout());

        window.addEventListener('keydown', (event) => this.onKeyDown(event));

    }


    get isOpen() {

        return !this.root.hidden;

    }


    // Trzymany stos jest częścią ekwipunku, także podczas zapisu przy
    // ukryciu / zamknięciu karty. Okno jedynie pokazuje ten sam stan.

    get cursor() {

        return this.game?.inventory.cursor ?? null;

    }


    set cursor(item) {

        if (this.game) {
            this.game.inventory.cursor = item;
        }

    }


    // chest - skrzynia otwarta PPM (jej wnętrze w strefie
    // rzemieślniczej) albo null.

    open(game, chest = null) {

        this.unwatchSettings?.();
        this.game = game;
        this.unwatchSettings = game.settings?.onChange?.(key => {
            if (['inventoryScale', 'inventoryStyle', 'theme'].includes(key)) this.queueLayout();
        });

        this.ghost = null;

        this.chest = chest;

        if (!isCreative(game.mode) || chest) {
            this.tab = 'inventory';
        }

        if (chest) {
            this.chestView ??= new ChestView(this.icons);
            this.chestView.show(chest, game.chests?.textureOf?.(chest) ?? 'chest');
            game.chests?.setOpen(chest);
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

        this.returnCursor();

        if (this.game) {
            returnGrid(this.game.inventory);
        }

        this.hover = null;
        this.ghost = null;

        if (this.chest) {
            this.game?.chests?.setOpen(null);
            this.chest = null;
        }

        this.root.hidden = true;
        this.cursorElement.hidden = true;
        this.tooltip.hidden = true;
        clearTimeout(this.pressTimer);
        this.pressShown = false;
        this.pressed = false;

        this.unwatchSettings?.();
        this.unwatchSettings = null;

        playUi('ui_close');

    }


    // Odkłada trzymany stos. Gdy pełne są ekwipunek i siatka, reszta
    // zostaje pod kursorem (również w zapisie i po ponownym otwarciu).

    returnCursor() {

        const item = this.cursor;

        if (!item) {
            return;
        }

        let left = this.game.inventory.addItem(item);

        if (left > 0) {
            left = this.storeInGrid(withCount(item, left));
        }

        this.cursor = left > 0 ? withCount(item, left) : null;

    }


    // Stos, którego nie ma gdzie odłożyć: pierwsze wolne (albo takie
    // samo) miejsce siatki. Zwraca, ile sztuk nadal się nie zmieściło.

    storeInGrid(item) {

        const grid = this.game.inventory.craft;

        for (let i = 0; i < GRID_CELLS && item.count > 0; i++) {

            if (!grid[i]) {
                grid[i] = { ...item };
                return 0;
            }

            if (grid[i].count < stackSize(item.type) && sameBatch(grid[i], item.type, item.fresh, item.look)) {
                const moved = Math.min(item.count, stackSize(item.type) - grid[i].count);
                blend(grid[i], moved, item.fresh);
                item.count -= moved;
            }

        }

        return item.count;

    }

    // --------------------------------------------------------
    // Budowa ekranu
    // --------------------------------------------------------

    build() {

        const game = this.game;

        const creative = isCreative(game.mode);

        // Wskazanie nie może odwoływać się do slotu ze starego układu
        // (np. po zmianie zakładki i naciśnięciu klawisza 1-9).
        this.hover = null;
        this.tooltip.hidden = true;
        this.bookGrid = null;
        this.searchInput = null;

        // Okno: mały pasek nad ramą (przyciski, w kreatywnym wyszukiwanie
        // i kosz), rama z miejscami i krótka pomoc pod ramą.

        const frame = el('div', 'inv-window');
        frame.setAttribute('role', 'dialog');
        frame.setAttribute('aria-modal', 'true');
        frame.setAttribute('aria-label', 'Ekwipunek');

        const panel = el('div', 'inv-panel');

        const workspace = el('div', 'inv-workspace');
        const main = el('div', 'inv-main');
        const storageScroll = el('div', 'inv-storage-scroll');
        const storage = el('div', 'inv-storage');

        storageScroll.append(storage);

        if (this.tab === 'blocks') {

            // Kreatywny: 9 zakładek kategorii nad siatką bloków
            // (5 rzędów, przewijana), pod nią pasek.

            panel.classList.add('inv-creative');

            this.creativeChips = this.categoryTabs();

            this.creativeGrid = el('div', 'inv-grid inv-creative-grid');

            const scroll = el('div', 'inv-scroll inv-creative-scroll');

            scroll.append(this.creativeGrid);

            storage.append(this.creativeChips, scroll);

            this.fillCreative();

        }
        else {

            // Ekwipunek: postać, 3 miejsca na przyszłe ubrania, plecaki
            // i paski, strefa rzemieślnicza; pod spodem 3 rzędy
            // przedmiotów i pasek.

            panel.classList.add('inv-crafting');

            const top = el('div', 'inv-top');

            const preview = el('div', 'inv-character');
            preview.append(this.previewCanvas);

            const equipment = el('div', 'inv-equipment');

            const clothes = el('div', 'inv-equipment-column');
            const later = el('div', 'inv-equipment-column');

            EQUIPMENT_SLOTS.forEach((label, index) => {
                const soon = index >= CLOTHING_SLOT_COUNT;
                const slot = this.slotElement(index, soon ? 'soon' : 'equip');
                slot.dataset.label = label;
                slot.setAttribute('aria-label', soon ? `${label} (wkrótce)` : label);
                (soon ? later : clothes).append(slot);
            });

            equipment.append(clothes, later);

            top.append(preview, equipment, this.chest ? this.chestElement() : this.craftElement());

            const slots = el('div', 'inv-grid inv-items');
            for (let i = HOTBAR_SIZE; i < SLOT_COUNT; i++) {
                slots.append(this.slotElement(i));
            }
            storage.append(top, slots);

            if (this.book.open) {
                panel.classList.add('has-book');
                workspace.append(this.bookPanel());
            }

        }


        // Pasek bloków - ostatni rząd.

        const bottom = el('div', 'inv-bottom');

        const hotbar = el('div', 'inv-grid inv-hotbar');

        for (let i = 0; i < HOTBAR_SIZE; i++) {
            hotbar.append(this.slotElement(i));
        }

        bottom.append(hotbar);

        storage.append(bottom);
        main.append(storageScroll);
        workspace.append(main);
        panel.append(workspace);

        frame.append(this.barElement(creative), panel, el('p', 'inv-help inv-footer', game.touchMode ? HELP_TOUCH[this.tab] : formatKeys(HELP[this.tab])));

        this.root.replaceChildren(frame);

        this.refresh();
        this.fitLayout();
        this.queueLayout();

    }

    // CSS zoom changes the layout as well as the pixels: native hit testing,
    // scrolling and ChestView's getBoundingClientRect stay in screen space.
    // Measure only on open/rebuild, resize, font or setting changes, not per frame.
    queueLayout() {
        if (!this.isOpen || this.layoutQueued) return;
        this.layoutQueued = true;
        requestAnimationFrame(() => {
            this.layoutQueued = false;
            if (this.isOpen) this.fitLayout();
        });
    }

    fitLayout() {
        const frame = this.root.querySelector('.inv-window');
        const panel = frame?.querySelector('.inv-panel');
        if (!frame || !panel) return;
        const style = getComputedStyle(this.root);
        const availableWidth = this.root.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        const availableHeight = this.root.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const compact = this.game?.touchMode || innerWidth <= 820 || innerHeight <= 520;
        const preference = this.game?.settings?.get('inventoryScale') ?? SETTINGS_DEFAULTS.inventoryScale;
        const requested = Math.max(.75, Math.min(2, preference / 100));

        frame.style.zoom = '1';
        frame.style.maxWidth = `${availableWidth}px`;
        frame.style.maxHeight = 'none';
        panel.style.maxHeight = 'none';
        const natural = frame.getBoundingClientRect();
        const roomHeight = compact ? availableHeight : Math.min(availableHeight, innerHeight * .88);
        // Small/touch screens retain the original full-size controls and
        // internal scrolling. A deliberately smaller preference still works.
        const scale = compact ? Math.min(1, requested) : Math.max(.75, Math.min(requested,
            availableWidth / Math.max(1, natural.width), roomHeight / Math.max(1, natural.height)));
        frame.style.zoom = String(scale);
        frame.style.maxWidth = `${availableWidth / scale}px`;
        frame.style.maxHeight = `${roomHeight / scale}px`;
        panel.style.maxHeight = '';
        this.root.dataset.scale = String(scale);

        // These two elements live outside the zoomed dialog. Keep their
        // positions in client pixels while matching the held item's size.
        const slot = frame.querySelector('.inv-hotbar .inv-slot')?.getBoundingClientRect();
        if (slot) this.cursorElement.style.setProperty('--inv-pointer-size', `${slot.width}px`);
        this.tooltip.style.fontSize = `${14 * Math.max(1, Math.min(scale, 1.4))}px`;
        this.tooltip.hidden = true;
        this.hover = null;
    }


    // Mały pasek nad ramą: w kreatywnym wyszukiwanie, przejście między
    // blokami a ekwipunkiem i kosz; księga przepisów i zamknięcie.

    barElement(creative) {

        const bar = el('div', 'inv-bar');

        if (this.tab === 'blocks') {

            const search = el('input', 'inv-search');

            search.type = 'text';
            search.placeholder = 'Szukaj bloku...';
            search.setAttribute('aria-label', 'Szukaj bloku');
            search.value = this.search;

            search.addEventListener('input', () => {

                this.search = search.value;

                this.fillCreative();

            });

            this.searchInput = search;

            bar.append(search);

        }
        else {

            bar.append(el('h2', 'inv-title', 'Ekwipunek'));

        }

        const actions = el('div', 'inv-header-actions');

        if (creative) {

            const other = this.tab === 'blocks' ? 'inventory' : 'blocks';

            const tab = el('button', 'inv-tab', TABS[other]);

            tab.type = 'button';
            tab.dataset.tab = other;
            tab.title = other === 'blocks' ? 'Wszystkie bloki gry' : 'Ekwipunek i wytwarzanie';

            actions.append(tab);

        }

        if (this.tab === 'inventory') {
            const toggle = el('button', `inv-book-toggle${this.book.open ? ' selected' : ''}`, 'Przepisy');
            toggle.type = 'button';
            toggle.title = 'Pokaż lub schowaj księgę przepisów';
            toggle.setAttribute('aria-pressed', String(this.book.open));
            actions.append(toggle);
        }

        if (creative) {

            const trash = el('div', 'inv-slot inv-trash', '🗑');

            trash.dataset.kind = 'trash';
            trash.title = 'Kosz - upuść tu blok, żeby go usunąć';

            actions.append(trash);

        }

        const close = el('button', 'inv-close', '✕');
        close.type = 'button';
        close.title = 'Zamknij ekwipunek';
        close.setAttribute('aria-label', 'Zamknij ekwipunek');
        actions.append(close);

        bar.append(actions);

        return bar;

    }


    // Zakładki kategorii trybu kreatywnego - po jednej na kolumnę
    // siatki. Kliknięcie wybranej pokazuje znowu wszystkie bloki.

    categoryTabs() {

        const row = el('div', 'inv-cat-tabs');

        for (const category of CATEGORY_ORDER) {

            const tab = el('button', `inv-chip inv-cat-tab${this.category === category ? ' selected' : ''}`);

            tab.type = 'button';
            tab.dataset.where = 'creative';
            tab.dataset.category = category;
            tab.title = CATEGORIES[category].label;
            tab.setAttribute('aria-pressed', String(this.category === category));

            const image = el('img');

            image.src = this.icons.get(CATEGORIES[category].icon) ?? '';
            image.draggable = false;

            tab.append(image);

            row.append(tab);

        }

        return row;

    }


    slotElement(index, kind = 'slot') {

        const selected = kind === 'slot' && index < HOTBAR_SIZE && index === this.game.inventory.selected;

        const slot = el('div', `inv-slot${selected ? ' selected' : ''}`);

        slot.dataset.kind = kind;
        slot.dataset.index = index;

        // Pasek świeżości (1.29.0) - tylko na stosach, które się psują.
        slot.append(el('img'), el('span', 'inv-count'), el('span', 'inv-fresh'));

        return slot;

    }


    // Strefa rzemieślnicza z otwartą skrzynią: jej wnętrze (ChestView.js).

    chestElement() {

        const box = el('div', 'inv-zone inv-chest');

        box.title = '';
        box.setAttribute('aria-label', 'Skrzynia - 4 x 3 przegródki, dwie warstwy');
        box.append(this.chestView.canvas);

        return box;

    }


    // Strefa rzemieślnicza (prawe górne okno): siatka 2 x 2 -> wynik.
    // Później w tym miejscu będzie też widok otwartej skrzyni.

    craftElement() {

        const box = el('div', 'inv-craft inv-zone');

        box.title = 'Strefa rzemieślnicza - wytwarzanie';

        const area = el('div', 'inv-craft-area');

        const grid = el('div', 'inv-craft-grid');

        for (let i = 0; i < GRID_CELLS; i++) {
            grid.append(this.slotElement(i, 'craft'));
        }

        const result = el('div', 'inv-slot inv-result');

        result.dataset.kind = 'result';
        // (inv-fresh: pasek wilgotności świeżo porąbanych polan, 1.33.0.)
        result.append(el('img'), el('span', 'inv-count'), el('span', 'inv-fresh'));

        area.append(grid, el('span', 'inv-craft-arrow', '➜'), result);

        box.append(area);

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
            (this.category === null || query || getCategory(type) === this.category) &&
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

    // Księga jest regionem wspólnego panelu. Na małym ekranie CSS
    // przenosi ją pod ekwipunek, zachowując wyszukiwanie i wszystkie pola.

    bookPanel() {

        const book = el('div', 'inv-book');

        const head = el('div', 'inv-book-head');

        const close = el('button', 'inv-book-close', '✕');

        close.type = 'button';
        close.title = 'Zamknij księgę';
        close.setAttribute('aria-label', 'Zamknij księgę przepisów');

        head.append(el('span', 'inv-title', 'Przepisy'), close);


        const search = el('input', 'inv-search');

        search.type = 'text';
        search.placeholder = 'Szukaj przepisu...';
        search.setAttribute('aria-label', 'Szukaj przepisu');
        search.value = this.book.search;

        search.addEventListener('input', () => {

            this.book.search = search.value;

            this.fillBook();

        });


        const filter = el('button', `inv-chip inv-book-filter${this.book.craftable ? ' selected' : ''}`, 'Tylko możliwe');

        filter.type = 'button';
        filter.title = 'Pokaż tylko przepisy, na które masz składniki';
        filter.setAttribute('aria-pressed', String(this.book.craftable));


        this.bookGrid = el('div', 'inv-book-grid');

        const scroll = el('div', 'inv-scroll inv-book-scroll');

        scroll.append(this.bookGrid);


        book.append(
            head,
            search,
            this.chipRow('book', this.book.category),
            filter,
            scroll,
            el('p', 'inv-help', 'Klik - ułóż w siatce | Shift + klik - ile się da | szare - brak składników')
        );

        this.fillBook();

        return book;

    }


    bookRecipes(stock) {

        const query = simplify(this.book.search.trim());

        return RECIPE_LIST.filter((recipe) => {

            const type = recipe.result[0];

            return (this.book.category === null || recipeCategory(recipe) === this.book.category) &&
                (!query || simplify(getItemLabel(type)).includes(query) || type.includes(query) || recipe.id.includes(query)) &&
                (!this.book.craftable || maxCrafts(recipe, stock, 1) > 0);

        });

    }


    fillBook(stock = stockOf(this.game.inventory)) {

        if (!this.bookGrid) {
            return;
        }

        const recipes = this.bookRecipes(stock);


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


    // Przepisy, na które brakuje składników - szare. Z filtrem
    // "Tylko możliwe" przebudowujemy listę dopiero, gdy zmienił się
    // zestaw widocznych przepisów (np. po zrobieniu pierwszych desek).

    refreshBook(stock = stockOf(this.game.inventory)) {

        if (!this.bookGrid?.isConnected) {
            return;
        }

        const entries = [...this.bookGrid.querySelectorAll('.inv-recipe')];

        if (this.book.craftable) {

            const recipes = this.bookRecipes(stock);

            if (recipes.length !== entries.length || recipes.some((recipe, i) => recipe.id !== entries[i].dataset.recipe)) {

                const scroll = this.bookGrid.parentElement;
                const scrollTop = scroll.scrollTop;

                this.fillBook(stock);

                scroll.scrollTop = scrollTop;

                return;

            }

        }

        for (const entry of entries) {
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

            const left = inventory.addItem(this.cursor);

            this.cursor = left > 0 ? withCount(this.cursor, left) : null;

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

            // (fresh: polano prosto spod siekiery jest mokre - widać pasek.)
            this.showItem(resultSlot, result
                ? { type: result.type, count: result.count, fresh: result.fresh }
                : this.ghost ? { type: this.ghost.result[0], count: this.ghost.result[1] } : null);

            resultSlot.classList.toggle('ready', Boolean(result));
            resultSlot.classList.toggle('ghost', !result && Boolean(this.ghost));

        }

        // Ubrania na sobie (1.27.0).

        for (const slot of this.root.querySelectorAll('.inv-slot[data-kind="equip"]')) {
            this.showItem(slot, inventory.equip[Number(slot.dataset.index)] ?? null);
        }

        this.refreshBook();

        this.chestView?.sync();


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

            // Ubranie (1.27.0): ikonka w jego kolorach i wzorze.
            image.src = (item.look ? garmentIcon(this.icons, item, () => this.isOpen && this.refresh()) : this.icons.get(item.type)) ?? '';
            image.hidden = false;

        }
        else {

            image.removeAttribute('src');
            image.hidden = true;

        }

        count.textContent = item && item.count > 1 ? String(item.count) : '';

        // Pasek świeżości (1.29.0): od zielonego do czerwonego; w trybie
        // twórczym nic się nie psuje, więc i paska nie ma.
        const fresh = element.querySelector('.inv-fresh');

        if (fresh) {

            const bar = freshBar(item, Boolean(this.game?.spoilage?.active));

            fresh.hidden = !bar;

            if (bar) {
                fresh.style.setProperty('--fresh', bar.fresh.toFixed(3));
                fresh.style.setProperty('--fresh-color', bar.color);
            }

        }

    }

    // --------------------------------------------------------
    // Telefon: przytrzymanie - opis stosu (1.29.0)
    // --------------------------------------------------------

    onTouchStart(event) {

        clearTimeout(this.pressTimer);

        // Opis z poprzedniego przytrzymania znika przy następnym dotknięciu.
        if (this.pressShown) {
            this.pressShown = false;
            this.tooltip.hidden = true;
        }

        if (event.touches.length !== 1) {
            return;
        }

        const { clientX, clientY } = event.touches[0];
        const target = event.target;

        this.pressTimer = setTimeout(() => {
            this.updateTooltip({ target, clientX, clientY });
            this.pressShown = !this.tooltip.hidden;
            this.pressed = this.pressShown;
        }, LONG_PRESS_MS);

    }


    onTouchEnd(event) {

        clearTimeout(this.pressTimer);

        // Po przytrzymaniu stos zostaje na miejscu (bez "kliknięcia").
        if (this.pressed) {
            event.preventDefault();
            this.pressed = false;
        }

    }


    // --------------------------------------------------------
    // Myszka i klawisze
    // --------------------------------------------------------

    onMouseDown(event) {

        // Ekwipunek przypisany do środkowego albo bocznego przycisku myszy
        // (input/bindings.js) zamyka się tym samym przyciskiem. Lewy
        // i prawy zostają do przenoszenia rzeczy.

        if (event.button !== 0 && event.button !== 2 && bindings.logical(mouseCode(event.button)) === 'KeyE') {

            event.preventDefault();

            this.handlers.close(true);

            return;

        }

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


        const right = event.button === 2;

        // Wnętrze skrzyni.

        if (this.chest && event.target === this.chestView?.canvas) {

            const cell = this.chestView.cellAtEvent(event);

            if (cell >= 0) {
                this.clickChest(cell, right, event.shiftKey);
                this.refresh();
                this.updateTooltip(event);
            }

            return;

        }

        const slot = event.target.closest('.inv-slot');


        if (!slot) {

            // Klik obok okna z blokiem pod kursorem: w kreatywnym blok
            // znika, w przygodzie leci na ziemię (od 0.100.0 - game/Drops.js;
            // prawy przycisk - jedna sztuka).

            if (!event.target.closest('.inv-panel, .inv-book, .inv-bar') && this.cursor) {

                if (!isCreative(this.game.mode)) {
                    // (Bez świata, np. w testach okna - stos wraca do ekwipunku.)
                    if (!this.throwCursor(right ? 1 : this.cursor.count)) this.returnCursor();
                }
                else {
                    this.cursor = null;
                }

                playUi(isCreative(this.game.mode) ? 'item_trash' : 'item_place', isCreative(this.game.mode) ? {} : { pitch: 0.8 });

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
        else if (kind === 'soon') {
            // Plecak i pas - na razie nic się tu nie kładzie.
            if (this.cursor) {
                playUi('ui_error');
            }
        }
        else if (kind === 'equip') {
            this.clickEquip(Number(slot.dataset.index), event.shiftKey);
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

        if (target.closest('.inv-close')) {
            this.handlers.close(true);
            return true;
        }

        const chip = target.closest('.inv-chip[data-where]');

        if (chip) {

            let category = chip.dataset.category || null;

            playUi('ui_click');

            if (chip.dataset.where === 'creative') {

                // Wybrana zakładka jeszcze raz - znowu wszystkie bloki.
                if (category === this.category) {
                    category = null;
                }

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
            target.closest('.inv-book-filter').setAttribute('aria-pressed', String(this.book.craftable));

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
            if (chip.hasAttribute('aria-pressed')) chip.setAttribute('aria-pressed', String((chip.dataset.category || null) === category));
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

            inventory.set(empty !== -1 ? empty : inventory.selected, makeItem(type, stackSize(type)));

            return;

        }


        if (right) {

            if (this.cursor?.type === type) {
                this.cursor.count = Math.min(stackSize(type), this.cursor.count + 1);
            }
            else {
                this.cursor = makeItem(type, 1);
            }

            return;

        }

        this.cursor = makeItem(type, stackSize(type));

    }


    // Miejsca: ekwipunek (kind 'slot': 0-8 pasek, 9-35 reszta) albo
    // siatka wytwarzania ('craft': 0-3).

    // Wyrzucenie na ziemię tego, co jest pod kursorem (count sztuk).

    throwCursor(count) {

        const item = this.cursor;

        if (!item || !this.game.drops) {
            return false;
        }

        const thrown = Math.min(count, item.count);

        if (!this.game.drops.throwFromPlayer(item.type, thrown, item.fresh, item.look)) {
            return false;
        }

        this.cursor = item.count > thrown ? withCount(item, item.count - thrown) : null;

        return true;

    }


    // Klawisz wyrzucania nad miejscem ekwipunku (albo z kursora).

    dropHovered(all) {

        if (this.cursor) {

            if (this.throwCursor(all ? this.cursor.count : 1)) {
                playUi('item_place', { pitch: 0.8 });
                this.refresh();
            }

            return;

        }

        this.updateTooltip({
            target: document.elementFromPoint(this.mouse.x, this.mouse.y) ?? this.root,
            clientX: this.mouse.x,
            clientY: this.mouse.y
        });

        if (!this.hover || !['slot', 'craft'].includes(this.hover.kind) || !this.game.drops) {
            return;
        }

        const slots = this.container(this.hover.kind);
        const item = slots.get(this.hover.index);

        if (!item) {
            return;
        }

        const count = all ? item.count : 1;

        if (!this.game.drops.throwFromPlayer(item.type, count, item.fresh, item.look)) {
            return;
        }

        slots.set(this.hover.index, item.count > count ? withCount(item, item.count - count) : null);

        playUi('item_place', { pitch: 0.8 });

        this.refresh();

    }


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


    // Klik w przegródkę skrzyni. Bierze się z wierzchu; inny przedmiot
    // kładzie się na wierzch tego, co leży na spodzie (ChestState.js).

    clickChest(cell, right, shift) {

        const chest = this.chest;

        const before = JSON.stringify([chest.layers, this.cursor]);
        const held = Boolean(this.cursor);

        if (shift && !this.cursor) {

            // Ze skrzyni do ekwipunku (co się nie zmieści - zostaje).

            const item = visibleItem(chest, cell);

            if (item) {
                const left = this.game.inventory.addItem(item);
                const moved = item.count - left;
                if (moved > 0) takeFromCell(chest, cell, moved);
            }

        }
        else if (!this.cursor) {

            const item = visibleItem(chest, cell);

            if (item) {
                this.cursor = takeFromCell(chest, cell, right ? Math.ceil(item.count / 2) : item.count);
            }

        }
        else {

            this.cursor = putIntoCell(chest, cell, this.cursor, right ? 1 : Infinity);

        }

        if (JSON.stringify([chest.layers, this.cursor]) !== before) {
            this.game.chests?.changed();
            playUi(!held && this.cursor ? 'item_pick' : 'item_place');
        }
        else if (this.cursor) {
            playUi('ui_error');
        }

    }


    clickSlot(kind, index, right, shift) {

        const inventory = this.game.inventory;

        const slots = this.container(kind);

        const item = slots.get(index);


        if (shift && !this.cursor) {

            // Ubranie z ekwipunku na siebie (zamiana z tym, co już noszone).
            if (kind === 'slot' && item && garmentInfo(item.type) && !this.chest) {
                const place = CLOTHING_SLOTS.indexOf(garmentInfo(item.type).slot);
                slots.set(index, inventory.equip[place] ?? null);
                inventory.equip[place] = item;
                this.game.clothesChanged?.();
                return;
            }

            if (kind === 'craft') {

                // Z siatki do ekwipunku (co się nie zmieści - zostaje).

                if (item) {

                    const left = inventory.addItem(item);

                    slots.set(index, left > 0 ? withCount(item, left) : null);

                }

            }

            // W kreatywnej zakładce bloków nie widać reszty ekwipunku -
            // Shift + klik na pasku po prostu go czyści.

            else if (this.tab === 'blocks' && index < HOTBAR_SIZE) {
                inventory.set(index, null);
            }
            else if (this.chest && item) {

                // Otwarta skrzynia: z ekwipunku do skrzyni.

                const left = insertIntoChest(this.chest, item.type, item.count, item.fresh, item.look);

                slots.set(index, left > 0 ? withCount(item, left) : null);

                if (left < item.count) {
                    this.game.chests?.changed();
                    playUi('item_place');
                }

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

                this.cursor = withCount(item, half);

                slots.set(index, item.count - half > 0 ? withCount(item, item.count - half) : null);

            }
            else if (held && (!item || (item.type === held.type && item.count < stackSize(held.type)))) {

                // Jedna sztuka do miejsca.

                // (Ręczne dokładanie: świeżość ze średniej - items/freshness.js.)

                slots.set(index, item ? blend(item, 1, held.fresh) : withCount(held, 1));

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


        if (item && item.type === held.type && stackSize(held.type) > 1) {

            // Dokładamy do takiego samego stosu (reszta zostaje pod kursorem).

            const moved = Math.min(held.count, STACK_SIZE - item.count);

            blend(item, moved, held.fresh);
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

        this.cursor = held ? blend(held, result.count, result.fresh) : makeItem(result.type, result.count, result.fresh);

        this.crafted(result, 1);

    }


    // Miejsce na ubranie (1.27.0): klik ubraniem pasującym do miejsca -
    // zakłada (zamiana z noszonym), pustą ręką - zdejmuje pod kursor,
    // Shift + klik - zdejmuje do ekwipunku.

    clickEquip(index, shift) {

        const inventory = this.game.inventory;
        const worn = inventory.equip[index] ?? null;
        const held = this.cursor;

        if (shift && !held) {
            if (worn && inventory.addItem(worn) === 0) {
                inventory.equip[index] = null;
                playUi('item_place');
            }
            else playUi('ui_error');
        }
        else if (held) {
            if (!fitsSlot(held, index) || held.count !== 1) {
                playUi('ui_error');
                return;
            }
            inventory.equip[index] = held;
            this.cursor = worn;
            playUi('item_place');
        }
        else if (worn) {
            this.cursor = worn;
            inventory.equip[index] = null;
            playUi('item_place');
        }
        else return;

        this.game.clothesChanged?.();

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


    // Opis świeżości stosu (1.24.0): ile jeszcze poleży tu, gdzie leży
    // (place: 'pack', 'chest', 'cellar'). Lista elementów do podpowiedzi.

    freshNote(item, place = 'pack') {

        const spoilage = this.game.spoilage;

        if (!item || !spoilage?.active) {
            return [];
        }

        const text = freshText(item, spoilage.temperature(), place);

        return text ? [el('div', 'inv-tooltip-note', text[0].toUpperCase() + text.slice(1))] : [];

    }


    // Charakter drewna (1.32.0): polano - zapłon, żar i czas palenia,
    // podpałka - temperatura (items/woodNotes.js).

    // Od 1.33.0 także wilgotność stosu polan (items/moisture.js).

    fireNote(type, item = null) {

        // (Od 1.35.0 także paliwo pochodni - items/torchFuel.js.)
        return [...fireNotes(type), ...wetNotes(item?.type === type ? item : null), ...fuelNotes(type, item)].map((text) => el('div', 'inv-tooltip-note', text));

    }


    // Podpowiedź: polska nazwa i nazwa bloku w komendach; na przepisie -
    // składniki (✔ masz, ✖ brakuje).

    updateTooltip(event) {

        const slot = event.target.closest?.('.inv-slot');

        this.hover = null;

        // Wnętrze skrzyni: co leży na wierzchu (i co pod spodem).

        if (this.chest && this.chestView) {

            const cell = event.target === this.chestView.canvas ? this.chestView.cellAtEvent(event) : -1;

            this.chestView.setHover(cell);

            if (cell >= 0) {

                const item = visibleItem(this.chest, cell);
                const covered = coveredItem(this.chest, cell);

                this.tooltip.hidden = !item || Boolean(this.cursor);

                if (!this.tooltip.hidden) {
                    this.tooltip.replaceChildren(
                        el('div', 'inv-tooltip-title', `${getItemLabel(item.type)}${item.count > 1 ? ` x${item.count}` : ''}`),
                        ...this.freshNote(item, this.game.spoilage?.placeOf(this.chest)),
                        ...(covered ? [el('div', 'inv-tooltip-note', `Pod spodem: ${getItemLabel(covered.type)}${covered.count > 1 ? ` x${covered.count}` : ''}`)] : [])
                    );
                    this.placeTooltip(event);
                }

                return;

            }

        }

        let label = '';

        let recipe = null;

        // Stos pod kursorem myszy (do opisu świeżości).

        let hovered = null;

        const kind = slot?.dataset.kind;

        if (kind === 'creative') {

            this.hover = { kind, type: slot.dataset.type };

            label = slot.dataset.type;

        }
        else if (kind === 'slot' || kind === 'craft') {

            const index = Number(slot.dataset.index);

            this.hover = { kind, index };

            hovered = this.container(kind).get(index);

            label = hovered?.type ?? '';

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
        else if (kind === 'soon') {

            this.tooltip.hidden = false;

            this.tooltip.replaceChildren(
                el('div', 'inv-tooltip-title', slot.dataset.label),
                el('div', 'inv-tooltip-note', 'Wkrótce.')
            );

            this.placeTooltip(event);

            return;

        }
        else if (kind === 'equip') {

            // Ubrania na sobie (1.27.0).
            const index = Number(slot.dataset.index);
            const item = this.game.inventory.equip[index];

            this.hover = null;
            this.tooltip.hidden = false;

            const where = `${slot.dataset.label}: ${Object.values(GARMENTS).filter((garment) => garment.slot === CLOTHING_SLOTS[index]).map((garment) => garment.label.toLowerCase()).join(', ')}`;

            this.tooltip.replaceChildren(...(item ? this.itemTooltip(item) : [el('div', 'inv-tooltip-title', slot.dataset.label ?? '')]),
                el('div', 'inv-tooltip-note', where));

            this.placeTooltip(event);

            return;

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
        else if (hovered?.look) {
            this.tooltip.replaceChildren(...this.itemTooltip(hovered));
        }
        else {
            this.tooltip.replaceChildren(getItemLabel(label), el('span', 'inv-tooltip-id', label), ...this.fireNote(label, hovered), ...this.freshNote(hovered));
        }

        this.placeTooltip(event);

    }


    // Opis przedmiotu (ubranie: krój, kolory, wzór, ile grzeje).

    itemTooltip(item) {

        const info = garmentInfo(item.type);

        if (!info) {
            return [getItemLabel(item.type), el('span', 'inv-tooltip-id', item.type), ...this.fireNote(item.type, item), ...this.freshNote(item)];
        }

        return [
            el('div', 'inv-tooltip-title', getItemLabel(item.type)),
            el('div', 'inv-tooltip-note', `${lookText(item.type, item.look)}`),
            el('div', 'inv-tooltip-note', `${SLOT_LABELS[info.slot]} - grzeje o ${String(info.warmth).replace('.', ',')}°C`)
        ];

    }


    // Przy prawej / dolnej krawędzi ekranu - z drugiej strony kursora.

    placeTooltip(event) {

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

        // (Klawisze według przypisań gracza - input/bindings.js.)

        const code = bindings.logical(event.code);

        if (code === 'KeyE') {

            event.preventDefault();

            if (!event.repeat) {
                this.handlers.close(true);
            }

            return;

        }


        // Klawisz wyrzucania (Q) nad miejscem: jedna sztuka na ziemię,
        // z Shiftem - cały stos; z przedmiotem pod kursorem - z kursora.

        if (code === 'KeyQ') {

            event.preventDefault();

            if (!event.repeat) {
                this.dropHovered(event.shiftKey);
            }

            return;

        }


        // 1-9 nad miejscem / blokiem: zamiana z tym miejscem paska.

        const digit = /^Digit([1-9])$/.exec(code ?? '');

        if (!digit) {
            return;
        }

        // Przewinięcie lub zmiana szerokości przesuwa sloty bez ruchu
        // myszy. Skrót działa na miejscu aktualnie pod wskaźnikiem.
        this.updateTooltip({
            target: document.elementFromPoint(this.mouse.x, this.mouse.y) ?? this.root,
            clientX: this.mouse.x,
            clientY: this.mouse.y
        });

        if (!this.hover || this.hover.kind === 'result') {
            return;
        }

        const target = Number(digit[1]) - 1;

        const inventory = this.game.inventory;


        if (this.hover.kind === 'creative') {
            inventory.set(target, makeItem(this.hover.type, stackSize(this.hover.type)));
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

        const canvas = this.glCanvas;

        const model = this.game.model;


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

            const camera = new THREE.PerspectiveCamera(30, 160 / 224, 0.1, 20);

            camera.position.set(0, 1.05, -4.4);
            camera.lookAt(0, 0.92, 0);

            setModelPreviewRenderer(renderer);
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
        const shadows = modelLight.uModelShadows.value;
        const distantShadows = modelLight.uModelDistantShadows.value;

        modelLight.uModelSky.value = 1;
        modelLight.uModelBlock.value.set(0, 0, 0);
        skyUniforms.uNightDesaturation.value = 0;
        modelLight.uModelShadows.value = 0;
        modelLight.uModelDistantShadows.value = 0;

        scene.add(object);

        object.position.set(0, 0, 0);
        object.rotation.set(0, 0.35, 0);
        object.visible = true;


        // Głowa za myszką.

        const rect = this.previewCanvas.getBoundingClientRect();

        const dx = (this.mouse.x - (rect.left + rect.width / 2)) / 300;
        const dy = (this.mouse.y - (rect.top + rect.height * 0.2)) / 300;

        // Kamera patrzy na postać od przodu (od -z), więc myszka w prawo
        // na ekranie to głowa obrócona w lewo postaci (dodatni obrót) -
        // do 0.83.0 znak był odwrotny i postać patrzyła w drugą stronę.
        model.bones.neck.rotation.set(
            Math.max(-0.7, Math.min(0.7, -dy)),
            Math.max(-1, Math.min(1, dx)) - 0.35,
            0,
            'YXZ'
        );

        // Postać - lewy fragment płótna renderera, kopia na płótno okna.

        const glY = canvas.height - 224;

        renderer.setViewport(0, glY, 160, 224);
        renderer.setScissor(0, glY, 160, 224);
        renderer.setScissorTest(true);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);

        const preview = this.previewCanvas.getContext('2d');
        preview.clearRect(0, 0, 160, 224);
        preview.drawImage(canvas, 0, 0, 160, 224, 0, 0, 160, 224);

        // Skrzynia - obok (w tym samym pełnym świetle).

        if (this.chest && this.chestView) {
            this.chestView.render(renderer, 160, 0, Boolean(this.game?.spoilage?.active));
        }


        parent?.add(object);

        object.position.copy(position);
        object.rotation.set(0, rotation, 0);
        object.visible = visible;

        modelLight.uModelSky.value = sky;
        modelLight.uModelBlock.value.copy(block);
        skyUniforms.uNightDesaturation.value = night;
        modelLight.uModelShadows.value = shadows;
        modelLight.uModelDistantShadows.value = distantShadows;

    }

}
