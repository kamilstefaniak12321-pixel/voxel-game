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
//             Taki efekt kończy się po przespanej nocy.
//
// Nowy efekt: wpis tutaj i nazwa w polu effects jedzenia. Mnożniki,
// których efekt nie podaje, to 1.
// ------------------------------------------------------------

export const EFFECTS = {
    calm: { label: 'spokój', text: 'Najbliższy sen będzie głębszy', hours: 14, sleep: { rate: 1.3, cap: 10 } },
    heal: { label: 'gojenie', text: 'Stłuczona noga goi się szybciej', hours: 4, heal: 3 },
    vigor: { label: 'wigor', text: 'Mniej się męczysz i sprawniej pracujesz', hours: 5, drain: 0.8, work: 1.08 }
};

export function getEffect(type) {
    return Object.hasOwn(EFFECTS, type) ? EFFECTS[type] : null;
}
