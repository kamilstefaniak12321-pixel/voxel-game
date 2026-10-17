import * as THREE from 'three';

import { HOTBAR_SIZE } from '../config.js';
import { CREATIVE_ITEMS, getItemLabel } from '../items/ItemRegistry.js';
import { STACK_SIZE, SLOT_COUNT } from '../game/Inventory.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { playUi } from '../audio/ui.js';
import { skyUniforms } from '../sky/skyShader.js';

// ------------------------------------------------------------
// EKWIPUNEK (klawisz E)
//
// Tryb kreatywny: zakładki - "Wszystkie bloki" (każdy blok gry
// i przedmiot, np. owoce - z wyszukiwaniem) i "Ekwipunek". Tryb
// przygody: sam ekwipunek.
// Na dole zawsze pasek bloków (9 miejsc), w kreatywnym także kosz.
//
// Obsługa jak w Minecrafcie:
//   klik             - weź stos / połóż / zamień / dołóż do takiego samego,
//   prawy przycisk   - weź połowę / połóż jedną sztukę,
//   Shift + klik     - szybko: pasek <-> reszta ekwipunku (blok
//                      z zakładki kreatywnej - prosto na pasek),
//   1-9 nad miejscem - zamiana z miejscem paska,
//   E                - zamknij (ESC - pauza).
// Trzymany blok (pod kursorem) po zamknięciu wraca do ekwipunku.
//
// W zakładce ekwipunku widać postać gracza (patrzy za myszką).
// Dźwięki (src/audio/ui.js): otwarcie, zamknięcie, wzięcie
// i odłożenie stosu, kosz.
// ------------------------------------------------------------

const TABS = {
    blocks: 'Wszystkie bloki',
    inventory: 'Ekwipunek'
};

const HELP = {
    blocks: 'Klik - weź stos | PPM - jedna sztuka | Shift + klik - na pasek | 1-9 - na to miejsce paska | kosz - usuń | E - zamknij',
    inventory: 'Klik - weź / połóż | PPM - połowa / jedna sztuka | Shift + klik - pasek ↔ ekwipunek | 1-9 - zamiana z paskiem | E - zamknij'
};


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

        // Blok trzymany pod kursorem: { type, count } albo null.
        this.cursor = null;

        // Miejsce pod myszką: { kind: 'slot', index } / { kind: 'creative', type }.
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

    }


    get isOpen() {

        return !this.root.hidden;

    }


    open(game) {

        this.game = game;

        this.cursor = null;

        if (game.mode !== 'creative') {
            this.tab = 'inventory';
        }

        this.root.hidden = false;

        this.build();

        playUi('ui_open');

    }


    // Zamyka ekwipunek. Trzymany blok wraca do ekwipunku.

    close() {

        if (!this.isOpen) {
            return;
        }

        if (this.cursor && this.game) {
            this.game.inventory.add(this.cursor.type, this.cursor.count);
        }

        this.cursor = null;
        this.hover = null;

        this.root.hidden = true;
        this.cursorElement.hidden = true;
        this.tooltip.hidden = true;

        playUi('ui_close');

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

            this.creativeGrid = el('div', 'inv-grid');

            const scroll = el('div', 'inv-scroll');

            scroll.append(this.creativeGrid);

            panel.append(search, scroll);

            this.fillCreative();

        }
        else {

            this.searchInput = null;

            const row = el('div', 'inv-row');

            const main = el('div', 'inv-grid');

            for (let i = HOTBAR_SIZE; i < SLOT_COUNT; i++) {
                main.append(this.slotElement(i));
            }

            row.append(this.previewCanvas, main);

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

        panel.append(bottom, el('p', 'inv-help', HELP[this.tab]));


        this.root.replaceChildren(panel);

        this.refresh();

    }


    slotElement(index) {

        const slot = el('div', `inv-slot${index < HOTBAR_SIZE && index === this.game.inventory.selected ? ' selected' : ''}`);

        slot.dataset.kind = 'slot';
        slot.dataset.index = index;

        slot.append(el('img'), el('span', 'inv-count'));

        return slot;

    }


    // Bloki w zakładce kreatywnej (po wyszukiwaniu).

    fillCreative() {

        const query = simplify(this.search.trim());

        const items = CREATIVE_ITEMS.filter((type) =>
            !query ||
            simplify(getItemLabel(type)).includes(query) ||
            type.includes(query)
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


    // Odświeża obrazki i liczby w miejscach ekwipunku i bloku pod kursorem.

    refresh() {

        const inventory = this.game.inventory;

        for (const slot of this.root.querySelectorAll('.inv-slot[data-kind="slot"]')) {

            const index = Number(slot.dataset.index);

            this.showItem(slot, inventory.get(index));

            slot.classList.toggle('selected', index === inventory.selected);

        }

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


        const slot = event.target.closest('.inv-slot');

        const right = event.button === 2;


        if (!slot) {

            // Klik obok okna z blokiem pod kursorem: w kreatywnym blok
            // znika, w przygodzie wraca do ekwipunku.

            if (!event.target.closest('.inv-panel') && this.cursor) {

                if (this.game.mode !== 'creative') {
                    this.game.inventory.add(this.cursor.type, this.cursor.count);
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
        else {
            this.clickSlot(Number(slot.dataset.index), right, event.shiftKey);
        }

        if (kind !== 'trash') {
            this.playClickSound(before, this.snapshot(slot), event.shiftKey);
        }

        this.refresh();

    }


    // Kursor i miejsce (tekst do porównania przed / po kliknięciu).

    snapshot(slot) {

        const index = slot.dataset.kind === 'slot' ? Number(slot.dataset.index) : -1;

        const item = index >= 0 ? this.game.inventory.get(index) : null;

        return {
            cursor: this.cursor ? `${this.cursor.type}:${this.cursor.count}` : '',
            slot: item ? `${item.type}:${item.count}` : '',
            hotbar: JSON.stringify(this.game.inventory.slots)
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


    // Miejsce ekwipunku (0-8 pasek, 9-35 reszta).

    clickSlot(index, right, shift) {

        const inventory = this.game.inventory;

        const item = inventory.get(index);


        if (shift && !this.cursor) {

            // W kreatywnej zakładce bloków nie widać reszty ekwipunku -
            // Shift + klik na pasku po prostu go czyści.

            if (this.tab === 'blocks' && index < HOTBAR_SIZE) {
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

                inventory.take(index, half);

            }
            else if (held && (!item || (item.type === held.type && item.count < STACK_SIZE))) {

                // Jedna sztuka do miejsca.

                inventory.set(index, { type: held.type, count: (item?.count ?? 0) + 1 });

                held.count--;

                if (held.count <= 0) {
                    this.cursor = null;
                }

            }
            else if (held && item) {

                inventory.set(index, held);

                this.cursor = item;

            }

            return;

        }


        if (!held) {

            this.cursor = item;

            inventory.set(index, null);

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

        inventory.set(index, held);

        this.cursor = item;

    }


    onMouseMove(event) {

        this.mouse.x = event.clientX;
        this.mouse.y = event.clientY;

        this.positionCursor();


        const slot = event.target.closest('.inv-slot');

        this.hover = null;

        let label = '';

        if (slot?.dataset.kind === 'creative') {

            this.hover = { kind: 'creative', type: slot.dataset.type };

            label = slot.dataset.type;

        }
        else if (slot?.dataset.kind === 'slot') {

            this.hover = { kind: 'slot', index: Number(slot.dataset.index) };

            label = this.game.inventory.get(this.hover.index)?.type ?? '';

        }


        // Podpowiedź: polska nazwa i nazwa bloku w komendach.

        this.tooltip.hidden = !label || Boolean(this.cursor);

        if (label) {

            this.tooltip.replaceChildren(getItemLabel(label), el('span', 'inv-tooltip-id', label));

            this.tooltip.style.left = `${event.clientX + 14}px`;
            this.tooltip.style.top = `${event.clientY - 30}px`;

        }

    }


    positionCursor() {

        this.cursorElement.style.left = `${this.mouse.x}px`;
        this.cursorElement.style.top = `${this.mouse.y}px`;

    }


    onKeyDown(event) {

        if (!this.isOpen) {
            return;
        }


        const typing = event.target === this.searchInput;

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

        if (!digit || !this.hover) {
            return;
        }

        const target = Number(digit[1]) - 1;

        const inventory = this.game.inventory;


        if (this.hover.kind === 'creative') {
            inventory.set(target, { type: this.hover.type, count: STACK_SIZE });
        }
        else if (this.hover.index !== target) {

            const item = inventory.get(this.hover.index);

            inventory.set(this.hover.index, inventory.get(target));
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
