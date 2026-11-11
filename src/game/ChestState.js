import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { STACK_SIZE, cleanItem } from './Inventory.js';

// ------------------------------------------------------------
// SKRZYNIA - ZAWARTOŚĆ (0.81.0, pomysł Kamila)
//
// Dno skrzyni ma 4 x 3 przegródki (CHEST_COLUMNS x CHEST_ROWS), a w każdej
// mieszczą się dwie warstwy: spód i wierzch. Widać (i da się wziąć) tylko
// to, co leży na wierzchu - żeby wyjąć coś ze spodu, najpierw trzeba
// zdjąć to, co na nim leży. Kto układa porządnie, ten szybciej znajduje.
//
// Kładzenie stosu na przegródkę:
//   - pusta przegródka         - na spód,
//   - ten sam przedmiot        - dokłada do widocznego stosu,
//   - inny przedmiot na spodzie - na wierzch,
//   - inny przedmiot na wierzchu - zamiana z wierzchem.
// Sama logika, bez rysowania i myszy - InventoryScreen.js i testy.
// ------------------------------------------------------------

export const CHEST_COLUMNS = 4;
export const CHEST_ROWS = 3;
export const CHEST_CELLS = CHEST_COLUMNS * CHEST_ROWS;
export const CHEST_LAYERS = 2;

const empty = () => Array(CHEST_CELLS).fill(null);

export function newChest(x, y, z) {
    return { x, y, z, layers: [empty(), empty()] };
}

export function restoreChest(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const chest = newChest(value.x, value.y, value.z);
    const layers = Array.isArray(value.layers) ? value.layers : [];
    for (let layer = 0; layer < CHEST_LAYERS; layer++) {
        const cells = Array.isArray(layers[layer]) ? layers[layer] : [];
        for (let cell = 0; cell < CHEST_CELLS; cell++) chest.layers[layer][cell] = cleanItem(cells[cell]);
    }
    // Wierzch bez spodu (uszkodzony zapis) - opada na spód.
    for (let cell = 0; cell < CHEST_CELLS; cell++) {
        if (!chest.layers[0][cell] && chest.layers[1][cell]) {
            chest.layers[0][cell] = chest.layers[1][cell];
            chest.layers[1][cell] = null;
        }
    }
    return chest;
}

export function chestState(chest) {
    return { x: chest.x, y: chest.y, z: chest.z,
        layers: chest.layers.map((cells) => cells.map((item) => item ? { type: item.type, count: item.count } : null)) };
}

// Warstwa, która leży na wierzchu przegródki (1, 0) albo -1 - pusta.
export function topLayer(chest, cell) {
    return chest.layers[1][cell] ? 1 : chest.layers[0][cell] ? 0 : -1;
}

// Widoczny (do wzięcia) stos przegródki.
export function visibleItem(chest, cell) {
    const layer = topLayer(chest, cell);
    return layer < 0 ? null : chest.layers[layer][cell];
}

// Stos pod spodem, przykryty wierzchem (do opisu) albo null.
export function coveredItem(chest, cell) {
    return chest.layers[1][cell] ? chest.layers[0][cell] : null;
}

export function isChestEmpty(chest) {
    return !chest || chest.layers.every((cells) => cells.every((item) => !item));
}

export function chestItemCount(chest) {
    return chest.layers.reduce((sum, cells) => sum + cells.filter(Boolean).length, 0);
}

// Bierze z wierzchu przegródki: count sztuk (domyślnie cały stos).
// Zwraca wzięty stos albo null.
export function takeFromCell(chest, cell, count = Infinity) {
    const layer = topLayer(chest, cell);
    if (layer < 0) return null;
    const item = chest.layers[layer][cell];
    const taken = Math.min(item.count, Math.floor(count));
    // A full destination accepts zero items. Never remove anything for a
    // zero/negative amount (or an invalid count such as NaN).
    if (!(taken > 0)) return null;
    if (taken >= item.count) chest.layers[layer][cell] = null;
    else item.count -= taken;
    return { type: item.type, count: taken };
}

// Kładzie held (stos, zmieniany w miejscu) na przegródkę - count sztuk
// (domyślnie wszystkie). Zwraca, co zostaje w ręce: ten sam stos,
// zamieniony stos z wierzchu albo null.
export function putIntoCell(chest, cell, held, count = Infinity) {
    if (!held || held.count <= 0) return held;
    const amount = Math.min(held.count, Math.max(1, Math.floor(count)));
    const layer = topLayer(chest, cell);
    const visible = layer < 0 ? null : chest.layers[layer][cell];

    const place = (target) => {
        chest.layers[target][cell] = { type: held.type, count: amount };
        held.count -= amount;
        return held.count > 0 ? held : null;
    };

    if (!visible) return place(0);

    if (visible.type === held.type) {
        const moved = Math.min(amount, STACK_SIZE - visible.count);
        visible.count += moved;
        held.count -= moved;
        return held.count > 0 ? held : null;
    }

    if (layer === 0) return place(1);

    // Inny przedmiot na wierzchu: cały stos - zamiana, jedna sztuka - nic.
    if (amount < held.count) return held;
    chest.layers[1][cell] = { type: held.type, count: held.count };
    return { type: visible.type, count: visible.count };
}

// Szybkie wkładanie (Shift + klik w ekwipunku): najpierw dokłada do
// widocznych takich samych stosów, potem na puste przegródki (spód),
// na końcu na wierzch innych. Zwraca, ile sztuk się nie zmieściło.
export function insertIntoChest(chest, type, count) {
    let left = count;
    for (let cell = 0; cell < CHEST_CELLS && left > 0; cell++) {
        const visible = visibleItem(chest, cell);
        if (visible?.type === type && visible.count < STACK_SIZE) {
            const moved = Math.min(left, STACK_SIZE - visible.count);
            visible.count += moved;
            left -= moved;
        }
    }
    for (const layer of [0, 1]) {
        for (let cell = 0; cell < CHEST_CELLS && left > 0; cell++) {
            if (chest.layers[layer][cell] || (layer === 1 && !chest.layers[0][cell])) continue;
            const moved = Math.min(left, STACK_SIZE);
            chest.layers[layer][cell] = { type, count: moved };
            left -= moved;
        }
    }
    return left;
}
