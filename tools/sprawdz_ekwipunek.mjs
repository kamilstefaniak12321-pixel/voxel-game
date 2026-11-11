// Regresje ekwipunku i stosu pod kursorem. Uruchomienie:
//     node tools/sprawdz_ekwipunek.mjs
// Używa rzeczywistych Inventory i InventoryScreen. Atrapy dotyczą tylko
// DOM oraz grafiki; nie tworzymy WebGL, zapisu gry ani plików.

import assert from 'node:assert/strict';
import { register } from 'node:module';

const screenUrl = new URL('../src/ui/InventoryScreen.js', import.meta.url).href;

// Podgląd postaci nie jest potrzebny do testów przenoszenia stosów.
// Reszta importów (w tym crafting i rejestry przedmiotów) jest prawdziwa.
register(`data:text/javascript,${encodeURIComponent(`
    let screenUrl;
    export function initialize(data) { screenUrl = data.screenUrl; }
    export function resolve(specifier, context, nextResolve) {
        if (context.parentURL === screenUrl) {
            const sources = {
                'three': 'export {};',
                '../rendering/ModelMaterial.js': 'export const modelLight = {}; export function setModelPreviewRenderer() {}',
                '../sky/skyShader.js': 'export const skyUniforms = {};',
                './ChestView.js': 'export const CHEST_VIEW_WIDTH = 320, CHEST_VIEW_HEIGHT = 160; export class ChestView {}'
            };
            if (Object.hasOwn(sources, specifier)) {
                return { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true };
            }
        }
        return nextResolve(specifier, context);
    }
`)}`, { parentURL: import.meta.url, data: { screenUrl } });

const { Inventory } = await import('../src/game/Inventory.js');
const { InventoryScreen } = await import(screenUrl);

class Element {
    constructor() {
        this.hidden = false;
        this.style = {};
        this.children = [];
    }
    append(...children) { this.children.push(...children); }
    addEventListener() {}
}

globalThis.document = { createElement: () => new Element(), getElementById: () => null, body: new Element() };
globalThis.window = { addEventListener() {} };
globalThis.localStorage = { getItem: () => null };

function empty() {
    return Inventory.load({}, 'adventure');
}

function screen(inventory, { mode = 'adventure', touchMode = false } = {}) {
    const ui = new InventoryScreen(new Map(), {});
    // Pomijamy tylko budowę i malowanie okna, nie jego obsługę.
    ui.build = () => {};
    ui.refresh = () => {};
    ui.open({ inventory, mode, touchMode });
    return ui;
}

function reload(inventory) {
    return Inventory.load({ inventory: JSON.parse(JSON.stringify(inventory.data)) }, 'adventure');
}

function total(inventory, type) {
    return [...inventory.slots, ...inventory.craft, inventory.cursor]
        .reduce((sum, item) => sum + (item?.type === type ? item.count : 0), 0);
}

function full() {
    const inventory = empty();
    inventory.add('stone', 36 * 64);
    inventory.craft.fill(null);
    return inventory;
}

function clickOutside(ui) {
    ui.onMouseDown({ target: { closest: () => null }, preventDefault() {}, button: 0 });
}

let passed = 0;
function test(name, run) {
    run();
    passed++;
    console.log(`OK: ${name}`);
}

test('podniesiony stos trafia do zapisu i wraca do ekwipunku po wczytaniu', () => {
    const inventory = empty();
    inventory.add('oak_log', 17);
    const ui = screen(inventory);
    ui.clickSlot('slot', 0, false, false);
    assert.equal(inventory.count('oak_log'), 0);
    assert.deepEqual(ui.cursor, { type: 'oak_log', count: 17 });
    assert.deepEqual(inventory.data.cursor, ui.cursor);
    const loaded = reload(inventory);
    assert.equal(loaded.count('oak_log'), 17);
    assert.equal(loaded.cursor, null);
    assert.equal(total(reload(loaded), 'oak_log'), 17);
});

test('zamknięcie i ponowne otwarcie odkłada stos bez duplikacji', () => {
    const inventory = empty();
    inventory.add('oak_log', 17);
    const ui = screen(inventory);
    ui.clickSlot('slot', 0, false, false);
    ui.close();
    ui.close();
    ui.open(ui.game);
    assert.equal(ui.cursor, null);
    assert.equal(total(inventory, 'oak_log'), 17);
});

test('wynik craftingu nie ginie przy pełnym ekwipunku i siatce', () => {
    const inventory = full();
    inventory.craft.splice(0, 4, ...Array.from({ length: 4 }, () => ({ type: 'clay', count: 64 })));
    const ui = screen(inventory);
    ui.clickResult(false);
    assert.deepEqual(ui.cursor, { type: 'terracotta', count: 4 });
    assert.equal(total(inventory, 'clay'), 252);
    ui.close();
    ui.open(ui.game);
    assert.deepEqual(ui.cursor, { type: 'terracotta', count: 4 });
    const loaded = reload(inventory);
    const restoredUi = screen(loaded);
    assert.deepEqual(restoredUi.cursor, { type: 'terracotta', count: 4 });
    clickOutside(restoredUi);
    restoredUi.close();
    assert.equal(total(loaded, 'terracotta'), 4);
    assert.equal(total(loaded, 'clay'), 252);
    assert.equal(loaded.count('stone'), 36 * 64);
    loaded.set(0, null);
    restoredUi.open(restoredUi.game);
    restoredUi.close();
    assert.equal(loaded.cursor, null);
    assert.equal(loaded.count('terracotta'), 4);
    assert.equal(total(loaded, 'clay'), 252);
    assert.equal(total(reload(loaded), 'terracotta'), 4);
});

test('wolna siatka przechowuje kursor, gdy ekwipunek jest pełny', () => {
    const inventory = full();
    inventory.cursor = { type: 'oak_log', count: 12 };
    const ui = screen(inventory);
    ui.close();
    assert.equal(inventory.cursor, null);
    assert.deepEqual(inventory.craft[0], { type: 'oak_log', count: 12 });
    assert.equal(total(reload(inventory), 'oak_log'), 12);
});

test('dotyk nie zużywa składników, kiedy wynik nie mieści się w ekwipunku', () => {
    const inventory = full();
    inventory.craft.splice(0, 4, ...Array.from({ length: 4 }, () => ({ type: 'clay', count: 64 })));
    const ui = screen(inventory, { touchMode: true });
    ui.clickResult(false);
    assert.equal(total(inventory, 'clay'), 256);
    assert.equal(total(inventory, 'terracotta'), 0);
    assert.equal(ui.cursor, null);
});

test('częściowe odłożenie do stosów i siatki zachowuje nadmiar', () => {
    const inventory = full();
    inventory.set(0, { type: 'oak_log', count: 60 });
    inventory.craft.splice(0, 4,
        { type: 'oak_log', count: 63 }, { type: 'sand', count: 64 },
        { type: 'dirt', count: 64 }, { type: 'grass', count: 64 });
    inventory.cursor = { type: 'oak_log', count: 10 };
    const ui = screen(inventory);
    ui.close();
    assert.equal(inventory.get(0).count, 64);
    assert.equal(inventory.craft[0].count, 64);
    assert.deepEqual(inventory.cursor, { type: 'oak_log', count: 5 });
    assert.equal(total(inventory, 'oak_log'), 133);
    const loaded = reload(inventory);
    assert.equal(total(loaded, 'oak_log'), 133);
    assert.equal(loaded.cursor.count, 5);
    const restoredUi = screen(loaded);
    restoredUi.close();
    restoredUi.open(restoredUi.game);
    clickOutside(restoredUi);
    assert.equal(total(loaded, 'oak_log'), 133);
    assert.equal(restoredUi.cursor.count, 5);
});

test('klik poza oknem w przygodzie odkłada stos, a w kreatywnym go usuwa', () => {
    const inventory = empty();
    inventory.cursor = { type: 'oak_log', count: 9 };
    const ui = screen(inventory);
    clickOutside(ui);
    assert.equal(inventory.count('oak_log'), 9);
    assert.equal(inventory.cursor, null);
    ui.game.mode = 'creative';
    ui.clickSlot('slot', 0, false, false);
    clickOutside(ui);
    assert.equal(total(inventory, 'oak_log'), 0);
});

test('wczytanie wykorzystuje wolne miejsce i zachowuje resztę kursora', () => {
    const inventory = full();
    inventory.set(0, { type: 'oak_log', count: 60 });
    inventory.cursor = { type: 'oak_log', count: 10 };
    const loaded = reload(inventory);
    assert.equal(loaded.count('oak_log'), 64);
    assert.deepEqual(loaded.cursor, { type: 'oak_log', count: 6 });
    assert.equal(total(loaded, 'oak_log'), 70);
});

test('stare zapisy i stare nazwy przedmiotów nadal się wczytują', () => {
    const old = Inventory.load({ hotbar: { slots: ['oak_log'], selected: 0 } }, 'adventure');
    assert.equal(old.count('oak_log'), 1);
    assert.equal(old.cursor, null);
    const loaded = Inventory.load({ inventory: { slots: [], cursor: { type: 'raspberry', count: 3 } } }, 'adventure');
    assert.equal(loaded.count('strawberry'), 3);
    assert.equal(loaded.cursor, null);
    assert.equal(Inventory.load({ inventory: { slots: [], cursor: { type: 'unknown', count: 5 } } }, 'adventure').cursor, null);
});

test('wyczyszczenie ekwipunku obejmuje kursor', () => {
    const inventory = empty();
    inventory.cursor = { type: 'oak_log', count: 4 };
    inventory.clear();
    assert.equal(inventory.cursor, null);
    assert.equal(reload(inventory).count('oak_log'), 0);
});

test('przełączenie świata nie przenosi ani nie usuwa jego kursora', () => {
    const first = full();
    first.cursor = { type: 'oak_log', count: 5 };
    const second = full();
    second.cursor = { type: 'dirt', count: 3 };
    const ui = screen(first);
    ui.open({ inventory: second, mode: 'adventure' });
    assert.equal(ui.cursor.type, 'dirt');
    assert.equal(total(first, 'oak_log'), 5);
    assert.equal(total(second, 'dirt'), 3);
});

console.log(`Sprawdzonych scenariuszy: ${passed}, błędów: 0.`);
