// ------------------------------------------------------------
// UŻYŹNIANIE POLA (1.23.0) - pomysł Kamila
//
// Rozgrzebaną ziemię da się posypać nawozem (PPM z nawozem w ręce):
// pole zamienia się w użyźnione pole - osobny blok dla każdego nawozu.
// Rośliny na takim polu mają lepsze statystyki:
//   growth - ile razy szybciej rosną (game/PlantGrowth.js),
//   rich   - sad liczy je jak czarnoziem: krzew chętniej się rozwija
//            i rozsiewa (game/Orchard.js).
// Sadzi się na nim tak samo jak na zwykłym polu. Puste pole zarasta
// z powrotem w ziemię - i nawóz przepada.
//
// Na razie jest jeden nawóz: kompost. Kolejne rodzaje kompostu to
// nowy wpis tutaj i nowy blok pola (BlockRegistry.js - pole `field`).
// ------------------------------------------------------------

export const FERTILIZERS = {

    compost: {
        // Blok użyźnionego pola.
        field: 'tilled_compost',
        label: 'kompost',
        growth: 1.5,
        rich: true
    }

};

// Przedmioty, którymi też się nawozi (kompost w misce - zostaje miska).
export const FERTILIZER_ITEMS = {
    compost: { fertilizer: 'compost' },
    compost_bowl: { fertilizer: 'compost', returns: 'clay_bowl' }
};

export function fertilizerOf(item) {
    return Object.hasOwn(FERTILIZER_ITEMS, item ?? '') ? FERTILIZER_ITEMS[item] : null;
}

// Zwykłe pole i wszystkie użyźnione.
export const FIELD_BLOCKS = ['tilled_dirt', ...Object.values(FERTILIZERS).map((entry) => entry.field)];

export const isFieldBlock = (type) => FIELD_BLOCKS.includes(type);

// Statystyki pola: { growth, rich } (zwykłe pole i nie-pole: 1, false).
export function fieldStats(type) {
    const entry = Object.values(FERTILIZERS).find((value) => value.field === type);
    return { growth: entry?.growth ?? 1, rich: Boolean(entry?.rich) };
}
