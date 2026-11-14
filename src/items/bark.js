// ------------------------------------------------------------
// KORA (0.100.0)
//
// Okorowanie pnia siekierą (PPM) daje zwój kory tego drzewa:
// <gatunek>_bark (dawna kora brzozowa to birch_bark - ta sama zasada).
// Każda kora jest podpałką do ogniska (game/CampfireState.js - TINDERS);
// te, które w naturze palą się najlepiej, rozpalają szybciej.
//
// Nowe drzewo dostaje korę samo (ItemRegistry.js robi przedmiot dla
// każdego pnia, który da się okorować); tu dopisz je tylko wtedy, gdy
// jego kora ma palić się lepiej. Ikona: tools/tekstury_noza_i_kory.py.
// ------------------------------------------------------------

export function barkType(tree) {
    return `${tree}_bark`;
}

// Ile razy szybciej niż trawą rozpala się ognisko (bez wpisu - 1).
//   brzoza - olejki w korze, pali się nawet mokra,
//   sosna, świerk, kosodrzewina - żywica,
//   eukaliptus - olejki eteryczne.
export const BARK_TINDER = {
    birch: 1.5,
    pine: 1.25,
    spruce: 1.25,
    mugo: 1.25,
    rainbow_eucalyptus: 1.25
};
