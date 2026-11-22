// ------------------------------------------------------------
// DREWUTNIA - STOS POLAN (1.34.0, docs/drewno.md) - sam stan
//
// Stos to blok `woodpile` i wpis:
//    { x, y, z, axis: 'x' | 'z', logs: [{ wood, wet? }, ...] }
// logs - od spodu do wierzchu, najwyżej WOODPILE_CAPACITY (4 warstwy po
// 4 polana); wet - wilgotność polana 0-1 (items/moisture.js), suche
// polano pola nie ma. axis - w którą stronę leżą polana.
//
// Polana na stosie schną jak na powietrzu (game/WoodDrying.js) i nie
// zajmują ekwipunku. Pod dachem nie mokną.
// ------------------------------------------------------------

import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { isFuelWood, fuelType } from './CampfireState.js';

export const WOODPILE = 'woodpile';
export const WOODPILE_ROW = 4;
export const WOODPILE_CAPACITY = 16;

const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const wetField = (wet) => (wet > 0 ? { wet } : {});

export function newWoodpile(x, y, z, axis = 'z') {
    return { x, y, z, axis: axis === 'x' ? 'x' : 'z', logs: [] };
}

// Stos z zapisu albo od innego gracza: tylko poprawne wartości.
export function restoreWoodpile(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const pile = newWoodpile(value.x, value.y, value.z, value.axis);
    pile.logs = (Array.isArray(value.logs) ? value.logs : []).slice(0, WOODPILE_CAPACITY)
        .filter((log) => log && isFuelWood(log.wood))
        .map((log) => ({ wood: log.wood, ...wetField(clamp01(log.wet)) }));
    return pile;
}

export const pileRoom = (pile) => WOODPILE_CAPACITY - pile.logs.length;

// Dokłada do `count` polan; zwraca, ile się zmieściło.
export function addLogs(pile, wood, count = 1, wet = 0) {
    if (!isFuelWood(wood)) return 0;
    const added = Math.max(0, Math.min(Math.floor(count), pileRoom(pile)));
    for (let i = 0; i < added; i++) pile.logs.push({ wood, ...wetField(clamp01(wet)) });
    return added;
}

// Zdejmuje z wierzchu polana tego samego gatunku co wierzchnie (najwyżej
// `count`). Zwraca stos { type, count, fresh? } albo null - wilgotność
// to średnia zdjętych (pole fresh to suchość, items/moisture.js).
export function takeLogs(pile, count = 1) {
    const top = pile.logs.at(-1);
    if (!top || !(count >= 1)) return null;
    let taken = 0, wet = 0;
    while (taken < count && pile.logs.length > 0 && pile.logs.at(-1).wood === top.wood) {
        wet += pile.logs.pop().wet ?? 0;
        taken++;
    }
    return stackOf(top.wood, taken, wet / taken);
}

// Ile polan tego gatunku co wierzchnie leży na wierzchu pod rząd.
export function topRun(pile) {
    const top = pile.logs.at(-1);
    if (!top) return 0;
    let run = 0;
    for (let i = pile.logs.length - 1; i >= 0 && pile.logs[i].wood === top.wood; i--) run++;
    return run;
}

function stackOf(wood, count, wet) {
    return wet > 0 ? { type: fuelType(wood), count, fresh: Math.round((1 - wet) * 1000) / 1000 } : { type: fuelType(wood), count };
}

// Co wypada z rozebranego stosu: polana gatunkami, wilgotność - średnia.
export function woodpileDrops(pile) {
    if (!pile) return [];
    const groups = new Map();
    for (const log of pile.logs) {
        const group = groups.get(log.wood) ?? { count: 0, wet: 0 };
        group.count++; group.wet += log.wet ?? 0;
        groups.set(log.wood, group);
    }
    return [...groups].map(([wood, group]) => stackOf(wood, group.count, group.wet / group.count));
}

// Średnia wilgotność stosu (0 - pusty albo suchy).
export function pileWet(pile) {
    return pile.logs.length ? pile.logs.reduce((sum, log) => sum + (log.wet ?? 0), 0) / pile.logs.length : 0;
}

// Podpis zawartości (obraz, gra ze znajomymi): gatunki i wilgotność co ćwierć.
export function pileSign(pile) {
    return `${pile.axis}:${pile.logs.map((log) => `${log.wood}${Math.round((log.wet ?? 0) * 4)}`).join(',')}`;
}
