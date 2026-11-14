// ------------------------------------------------------------
// WYROBY STOLARSKIE - LISTA (0.98.0)
//
// Co da się zrobić z desek na stole stolarskim: ile desek idzie na
// partię i ile sztuk z niej wychodzi. Same dane, bez zależności -
// korzystają z nich stół (game/CarpenterTables.js), rysowanie blatu
// (rendering/CarpenterTableRenderer.js) i wiki (tools/wiki_dane.mjs).
//
// kind - rodzaj wyrobu z blocks/woodShapes.js (SHAPE_KINDS); przedmiot
// to shapeBaseType(drewno, kind). Nowy wyrób: wpis tutaj i miejsce na
// blacie w CarpenterTables.js (bench) oraz CarpenterTableRenderer.js.
// ------------------------------------------------------------

// Ile desek mieści się na blacie.
export const TABLE_CAPACITY = 64;

// Jeden stół: wyroby w czterech ćwiartkach prawej części blatu.
export const TABLE_PRODUCTS = [
    { kind: 'stairs', planks: 3, count: 2 },
    { kind: 'slab', planks: 1, count: 2 },
    { kind: 'fence', planks: 3, count: 2 },
    { kind: 'gate', planks: 4, count: 1 }
];

// Podwójny warsztat (dwa stoły): drzwi i klapa zamiast zwykłych wyrobów.
// Potrójny warsztat (trzy stoły, tables: 3) dodaje stelaż łóżka.
export const BENCH_PRODUCTS = {
    door: { kind: 'door', planks: 6, count: 3, tables: 2 },
    trapdoor: { kind: 'trapdoor', planks: 3, count: 1, tables: 2 },
    bed: { kind: 'bed', planks: 8, count: 1, tables: 3 }
};

// Nazwa miejsca pracy po liczbie stołów (do opisów).
export const WORKSHOP_LABELS = { 1: 'stół stolarski', 2: 'podwójny warsztat', 3: 'potrójny warsztat' };
