// ------------------------------------------------------------
// OPIS DREWNA NA PRZEDMIOCIE (1.32.0, docs/drewno.md)
//
// Krótkie linijki do podpowiedzi w ekwipunku: polano pokazuje zapłon,
// żar i czas palenia swojego gatunku, podpałka - temperaturę, jaką daje
// na start, patyk - że jest rozpałką.
// ------------------------------------------------------------

import { fuelWood, isTinder, tinderTemp, KINDLING, KINDLING_TEMP } from '../game/CampfireState.js';
import { woodTraits } from '../blocks/woodTraits.js';

export function fireNotes(type) {
    const wood = fuelWood(type);
    if (wood) {
        const traits = woodTraits(wood);
        return [`Zapłon ${traits.ignite}° · żar ${traits.heat}° · pali się ${traits.burn} s`, traits.note[0].toUpperCase() + traits.note.slice(1)];
    }
    if (isTinder(type)) return [`Podpałka: ${tinderTemp(type)}°`];
    if (type === KINDLING) return [`Rozpałka: +${KINDLING_TEMP}° do podpałki`];
    return [];
}
