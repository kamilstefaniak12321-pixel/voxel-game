// ------------------------------------------------------------
// EFEKTY (0.98.1)
//
// Krótkotrwałe działanie na gracza - dziś z naparów (items/foods.js,
// pole effects), w przyszłości także z innych potraw albo miejsc.
// Stan trzyma Wellbeing (data.effects: nazwa -> do kiedy, czas gry
// w dobach); tutaj jest tylko lista: co efekt robi i jak długo trwa.
//
// Pola:
//   label   - nazwa w oknie statusu,
//   text    - co daje (komunikat po wypiciu),
//   hours   - ile godzin gry działa (godzina gry to 50 sekund),
//   drain   - mnożnik zużycia energii,
//   work    - mnożnik szybkości kopania,
//   heal    - mnożnik szybkości gojenia stłuczonej nogi,
//   sleep   - sen: { rate - mnożnik szybkości wysypiania się,
//             cap - o ile punktów wyżej da się wyspać w danym miejscu }.
//             Taki efekt kończy się po przespanej nocy,
//   heat    - o ile stopni cieplej się czuje (1.26.0, game/Warmth.js);
//             ciepło z kilku efektów się dodaje.
//
// Nowy efekt: wpis tutaj i nazwa w polu effects jedzenia. Mnożniki,
// których efekt nie podaje, to 1.
// ------------------------------------------------------------

export const EFFECTS = {
    calm: { label: 'spokój', text: 'Najbliższy sen będzie głębszy', hours: 14, sleep: { rate: 1.3, cap: 10 } },
    heal: { label: 'gojenie', text: 'Stłuczona noga goi się szybciej', hours: 4, heal: 3 },
    vigor: { label: 'wigor', text: 'Mniej się męczysz i sprawniej pracujesz', hours: 5, drain: 0.8, work: 1.08 },

    // Owoce z charakterem (1.25.0, items/foods.js): słabsze i krótsze
    // od naparów - za to prosto z krzaka.
    mend: { label: 'lekkie gojenie', text: 'Stłuczona noga goi się trochę szybciej', hours: 2, heal: 1.5 },
    tonic: { label: 'pokrzepienie', text: 'Przez chwilę mniej się męczysz', hours: 2, drain: 0.9 },
    warm: { label: 'rozgrzanie', text: 'Robi ci się gorąco - praca idzie raźniej', hours: 2, work: 1.06, heat: 4 },

    // Woda z baobabu (1.41.0, dary pnia): chłodna i czysta.
    refresh: { label: 'orzeźwienie', text: 'Zmęczenie przychodzi wolniej', hours: 3, drain: 0.93 },

    // Zimno (1.26.0): ciepła potrawa z garnka albo napar grzeje od środka.
    warmth: { label: 'ciepło w brzuchu', text: 'Ciepłe jedzenie grzeje od środka', hours: 3, heat: 6 }
};

// Słowami: co efekt robi (opisy przedmiotów, komendy).
export function effectText(type) {
    const effect = getEffect(type);
    return effect ? `${effect.label} - ${effect.text[0].toLowerCase()}${effect.text.slice(1)}` : '';
}

export function getEffect(type) {
    return Object.hasOwn(EFFECTS, type) ? EFFECTS[type] : null;
}
