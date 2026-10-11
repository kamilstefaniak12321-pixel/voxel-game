import { HOTBAR_SIZE, HOTBAR_DEFAULT } from '../config.js';

import { blockExists } from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// EKWIPUNEK
//
// 36 miejsc: 0-8 to pasek bloków (klawisze 1-9), 9-35 - reszta
// ekwipunku (3 rzędy po 9). W każdym miejscu nic (null) albo stos
// bloków { type, count } - najwyżej STACK_SIZE sztuk.
//
// Tryb przygody: zniszczone bloki trafiają tutaj, stawianie zużywa
// je ze stosu. Tryb kreatywny: stawianie nic nie zużywa.
//
// Dane (`data`) to zwykły obiekt zapisywany razem ze światem
// (worldInfo.inventory): { slots: [...], selected }.
// ------------------------------------------------------------

export const STACK_SIZE = 64;

export const MAIN_ROWS = 3;

export const SLOT_COUNT = HOTBAR_SIZE + MAIN_ROWS * HOTBAR_SIZE;


// Poprawny stos albo null (zapis mógł być uszkodzony, blok usunięty z gry).

function cleanItem(item) {

    if (!item || !blockExists(item.type)) {
        return null;
    }

    const count = Math.floor(Number(item.count));

    if (!Number.isFinite(count) || count <= 0) {
        return null;
    }

    return { type: item.type, count: Math.min(STACK_SIZE, count) };

}


export class Inventory {

    constructor(data) {

        this.data = data;

    }


    // Ekwipunek świata: zapisany, ze starego zapisu (sam pasek z nazwami
    // bloków - światy sprzed ekwipunku) albo nowy. Nowy świat kreatywny
    // dostaje na pasek bloki z HOTBAR_DEFAULT, przygoda zaczyna z pustym.

    static load(worldInfo, mode) {

        const slots = new Array(SLOT_COUNT).fill(null);

        let selected = 0;


        const saved = worldInfo.inventory;
        const oldHotbar = worldInfo.hotbar;

        if (Array.isArray(saved?.slots)) {

            for (let i = 0; i < SLOT_COUNT; i++) {
                slots[i] = cleanItem(saved.slots[i]);
            }

            selected = saved.selected;

        }
        else if (Array.isArray(oldHotbar?.slots)) {

            for (let i = 0; i < HOTBAR_SIZE; i++) {
                slots[i] = cleanItem({ type: oldHotbar.slots[i], count: 1 });
            }

            selected = oldHotbar.selected;

        }
        else if (mode === 'creative') {

            for (let i = 0; i < HOTBAR_SIZE; i++) {
                slots[i] = cleanItem({ type: HOTBAR_DEFAULT[i], count: 1 });
            }

        }


        if (!Number.isInteger(selected) || selected < 0 || selected >= HOTBAR_SIZE) {
            selected = 0;
        }

        return new Inventory({ slots, selected });

    }


    get slots() {

        return this.data.slots;

    }


    get selected() {

        return this.data.selected;

    }


    set selected(index) {

        this.data.selected = ((index % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;

    }


    // Stos w wybranym miejscu paska (albo null).

    get selectedItem() {

        return this.data.slots[this.data.selected];

    }


    get(index) {

        return this.data.slots[index] ?? null;

    }


    set(index, item) {

        this.data.slots[index] = item && item.count > 0 ? item : null;

    }


    // Pierwsze miejsce z tym blokiem (albo -1). from, to - zakres miejsc.

    find(type, from = 0, to = SLOT_COUNT) {

        for (let i = from; i < to; i++) {

            if (this.data.slots[i]?.type === type) {
                return i;
            }

        }

        return -1;

    }


    // Ile sztuk tego bloku zmieści się w ekwipunku.

    room(type) {

        let room = 0;

        for (const item of this.data.slots) {

            if (!item) {
                room += STACK_SIZE;
            }
            else if (item.type === type) {
                room += STACK_SIZE - item.count;
            }

        }

        return room;

    }


    canAdd(type, count = 1) {

        return this.room(type) >= count;

    }


    // Dodaje bloki: najpierw do niepełnych stosów (pasek, potem reszta),
    // potem do pustych miejsc (też najpierw pasek). Zwraca, ile się nie
    // zmieściło. from, to - tylko te miejsca.

    add(type, count = 1, from = 0, to = SLOT_COUNT) {

        const slots = this.data.slots;

        let left = count;


        for (let i = from; i < to && left > 0; i++) {

            const item = slots[i];

            if (item && item.type === type && item.count < STACK_SIZE) {

                const moved = Math.min(left, STACK_SIZE - item.count);

                item.count += moved;
                left -= moved;

            }

        }


        for (let i = from; i < to && left > 0; i++) {

            if (!slots[i]) {

                const moved = Math.min(left, STACK_SIZE);

                slots[i] = { type, count: moved };
                left -= moved;

            }

        }

        return left;

    }


    // Zabiera `count` sztuk z miejsca (np. postawiony blok).

    take(index, count = 1) {

        const item = this.data.slots[index];

        if (!item) {
            return;
        }

        item.count -= count;

        if (item.count <= 0) {
            this.data.slots[index] = null;
        }

    }


    // Szybkie przeniesienie (Shift + klik): z paska do reszty ekwipunku
    // i odwrotnie. Zwraca true, gdy coś się przeniosło.

    quickMove(index) {

        const item = this.data.slots[index];

        if (!item) {
            return false;
        }

        const toHotbar = index >= HOTBAR_SIZE;

        const [from, to] = toHotbar ? [0, HOTBAR_SIZE] : [HOTBAR_SIZE, SLOT_COUNT];

        const left = this.add(item.type, item.count, from, to);

        this.data.slots[index] = left > 0 ? { type: item.type, count: left } : null;

        return left < item.count;

    }


    clear() {

        this.data.slots.fill(null);

    }


    // Nazwy bloków na pasku (null = puste miejsce).

    hotbarTypes() {

        return this.data.slots.slice(0, HOTBAR_SIZE).map((item) => item?.type ?? null);

    }

}
