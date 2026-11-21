// ------------------------------------------------------------
// PRÓCHNO (1.37.0, pomysł Kamila - docs/powalone-drzewa.md)
//
// Spróchniałe drewno z powalonego pnia kruszy się w dłoniach na próchno:
//   - podpałka, która się tli (puszczone rozpalanie stygnie wolno),
//   - nawóz jak kompost (blocks/fertilizers.js),
//   - NIESIE ŻAR: PPM próchnem na płonącym ognisku albo żarze daje
//     tlące się próchno. Położone na ułożonym stosie zamiast podpałki
//     rozpala go samo - bez startera ognia. Tli się EMBER_CARRY_SECONDS
//     (w ekwipunku gracza), potem gaśnie.
//
// Tlące się próchno trzyma czas w polu `fresh` stosu (1 - świeżo
// zajęte, 0 - zgasło), jak świeżość jedzenia (items/freshness.js).
// ------------------------------------------------------------

export const PROCHNO = 'prochno';
export const PROCHNO_EMBER = 'prochno_zar';

// Ile sekund tli się próchno niesione w ekwipunku.
export const EMBER_CARRY_SECONDS = 240;

export const isEmber = (type) => type === PROCHNO_EMBER;

// Ile żaru zostało w stosie, 0-1.
export function emberLeft(item) {
    if (!item || !isEmber(item.type)) return 0;
    return Number.isFinite(item.fresh) ? Math.max(0, Math.min(1, item.fresh)) : 1;
}

// Pasek na ikonce: czerwono-pomarańczowy, ile jeszcze się tli.
export function emberBar(item) {
    if (!item || !isEmber(item.type)) return null;
    const left = emberLeft(item);
    return { fresh: Math.max(0.04, left), color: `hsl(${Math.round(8 + 24 * left)}, 95%, 52%)` };
}

// Opis do podpowiedzi w ekwipunku.
export function emberNotes(type, item = null) {
    if (type === PROCHNO) return ['Na płonącym ognisku albo żarze zajmuje się i niesie ogień dalej', 'Podpałka, która długo się tli; w ziemi - nawóz'];
    if (isEmber(type)) {
        const seconds = Math.round(emberLeft(item?.type === type ? item : null) * EMBER_CARRY_SECONDS);
        const time = seconds >= 90 ? `${Math.round(seconds / 60)} min` : `${Math.max(1, seconds)} s`;
        return [`Tli się jeszcze ok. ${time}`, 'Połóż na ułożonym stosie (6 polan) - rozpali go bez startera'];
    }
    return [];
}

// Mija `seconds` sekund: tlące się próchno w ekwipunku przygasa.
// Zwraca liczbę stosów, które zgasły (i zniknęły).
export function burnEmbers(inventory, seconds) {
    let out = 0;
    const slots = inventory?.slots ?? [];
    for (let index = 0; index < slots.length; index++) {
        const item = slots[index];
        if (!item || !isEmber(item.type)) continue;
        const left = emberLeft(item) - seconds / EMBER_CARRY_SECONDS;
        if (left <= 0) { inventory.set(index, null); out++; }
        else item.fresh = left;
    }
    return out;
}
