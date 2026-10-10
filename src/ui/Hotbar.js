import {
    getBlockDefinition
} from '../blocks/BlockRegistry.js';

import {
    HOTBAR_SIZE
} from '../config.js';

// ------------------------------------------------------------
// PASEK BLOKÓW (na dole ekranu)
//
// Tylko wyświetlanie: co jest w miejscach paska i które jest
// wybrane. Same zasady (wybór klawiszami, kółkiem, branie bloku)
// są w game/Game.js. Wygląd: src/ui/hud.css i motyw.
// ------------------------------------------------------------

// Jak długo nad paskiem widać nazwę wybranego bloku (ms).

const NAME_DURATION = 2000;


export class Hotbar {

    // root  - element <div id="hotbar">
    // icons - Map: nazwa bloku -> obrazek (z BlockIcons.js)

    constructor(root, icons) {

        this.root = root;
        this.icons = icons;


        this.nameElement = document.createElement('div');

        this.nameElement.className = 'hotbar-name';


        this.slotsElement = document.createElement('div');

        this.slotsElement.className = 'hotbar-slots';


        this.slotElements = [];

        for (let i = 0; i < HOTBAR_SIZE; i++) {

            const slot = document.createElement('div');

            slot.className = 'hotbar-slot';


            const image = document.createElement('img');

            image.alt = '';
            image.draggable = false;

            slot.appendChild(image);


            this.slotsElement.appendChild(slot);

            this.slotElements.push(slot);

        }


        this.root.replaceChildren(this.nameElement, this.slotsElement);


        // Ostatnio pokazany stan - odświeżamy tylko po zmianie.

        this.shownSlots = null;
        this.shownSelected = -1;

        this.nameTimer = 0;

    }


    // Wywoływane co klatkę: slots = tablica nazw bloków (null =
    // puste miejsce), selected = numer wybranego miejsca.

    update(slots, selected) {

        const slotsKey = slots.join(',');

        const slotsChanged = slotsKey !== this.shownSlots;
        const selectionChanged = selected !== this.shownSelected;


        if (!slotsChanged && !selectionChanged) {
            return;
        }


        // Przy pierwszym pokazaniu (wejście do świata) nie
        // wyświetlamy nazwy bloku.

        const firstShow = this.shownSlots === null;

        const selectedBefore =
            this.shownSlots === null
                ? undefined
                : this.shownSlots.split(',')[this.shownSelected];


        if (slotsChanged) {

            slots.forEach((type, i) => {

                const slot = this.slotElements[i];
                const image = slot.firstChild;

                const icon = type ? this.icons.get(type) : null;


                if (icon) {
                    image.src = icon;
                    image.hidden = false;
                }
                else {
                    image.removeAttribute('src');
                    image.hidden = true;
                }


                slot.title = type ? (getBlockDefinition(type)?.name ?? type) : '';

            });

        }


        this.slotElements.forEach(
            (slot, i) => slot.classList.toggle('selected', i === selected)
        );


        this.shownSlots = slotsKey;
        this.shownSelected = selected;


        const type = slots[selected];

        if (!firstShow && (type ?? '') !== (selectedBefore ?? '')) {
            this.showName(type ? (getBlockDefinition(type)?.name ?? type) : '');
        }

    }


    // Nazwa bloku nad paskiem, znika po chwili.

    showName(text) {

        clearTimeout(this.nameTimer);

        this.nameElement.textContent = text;

        this.nameElement.classList.toggle('visible', text !== '');


        this.nameTimer = setTimeout(
            () => this.nameElement.classList.remove('visible'),
            NAME_DURATION
        );

    }


    // Przy wyjściu ze świata - następny świat pokaże się od nowa.

    reset() {

        this.shownSlots = null;
        this.shownSelected = -1;

        clearTimeout(this.nameTimer);

        this.nameElement.classList.remove('visible');

    }

}
