// ------------------------------------------------------------
// UŻYŹNIANIE POLA (1.24.0) - pomysł Kamila
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
    compost_bowl: { fertilizer: 'compost', returns: 'clay_bowl' },
    // Próchno z powalonego pnia (1.37.0, items/prochno.js) nawozi jak kompost.
    prochno: { fertilizer: 'compost' }
};

export function fertilizerOf(item) {
    return Object.hasOwn(FERTILIZER_ITEMS, item ?? '') ? FERTILIZER_ITEMS[item] : null;
}

// Pola bez nawozu (1.25.0): zwykłe i z innej ziemi. Rozgrzebany
// czarnoziem jest żyzny sam z siebie, ziemia kamienista - jałowa.
//   growth - mnożnik wzrostu, rich - sad liczy pole jak czarnoziem,
//   fertilize - czy da się je posypać nawozem.
export const FIELDS = {
    tilled_dirt: { growth: 1, rich: false, fertilize: true },
    tilled_humus: { growth: 1.3, rich: true, fertilize: false },
    tilled_coarse: { growth: 0.7, rich: false, fertilize: true },
    ...Object.fromEntries(Object.values(FERTILIZERS).map((entry) => [entry.field, { growth: entry.growth, rich: entry.rich, fertilize: false }]))
};

// Wszystkie pola: na każdym da się sadzić.
export const FIELD_BLOCKS = Object.keys(FIELDS);

export const isFieldBlock = (type) => Object.hasOwn(FIELDS, type ?? '');

// Czy to pole da się posypać nawozem.
export const canFertilize = (type) => isFieldBlock(type) && FIELDS[type].fertilize;

// Statystyki pola: { growth, rich } (nie-pole: 1, false).
export function fieldStats(type) {
    const entry = isFieldBlock(type) ? FIELDS[type] : null;
    return { growth: entry?.growth ?? 1, rich: Boolean(entry?.rich) };
}
