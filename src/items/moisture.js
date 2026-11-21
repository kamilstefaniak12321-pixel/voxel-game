// ------------------------------------------------------------
// WILGOTNOŚĆ DREWNA (1.33.0, pomysł Kamila - docs/drewno.md)
//
// Świeżo porąbane drewno jest mokre - tym bardziej, im więcej soku ma
// gatunek (blocks/woodTraits.js: fresh). Mokre polano trudniej zapalić
// i słabiej grzeje; schnie z czasem (game/WoodDrying.js).
//
// Wilgotność niesie stos polan - to samo pole `fresh`, którego używa
// psujące się jedzenie (items/freshness.js), tylko znaczy co innego:
// SUCHOŚĆ, od 1 (suche) w dół. Stos bez pola jest suchy, więc stare
// zapisy i polana z trybu kreatywnego są suche. Dzięki temu wilgotność
// sama wędruje przez ekwipunek, skrzynie i leżące przedmioty, a stosy
// o różnej wilgotności uśredniają się przy ręcznym łączeniu.
//
// Wilgotność mają tylko POLANA (<drewno>_firewood). Pnie jej nie niosą:
// drewno schnie dopiero porąbane, a polano prosto spod siekiery jest
// świeże.
//
//   wilgotność (wet) 0-1:  do DRY_WET       - suche, bez kar,
//                          od WET_FULL       - w pełni mokre,
//   kara rośnie liniowo między nimi (wetFactor 0-1):
//     zapłon wyższy o WET_IGNITE °C, żar niższy o WET_HEAT (część).
// ------------------------------------------------------------

import { WOOD_TRAITS } from '../blocks/woodTraits.js';

// Do tej wilgotności drewno liczy się jako suche.
export const DRY_WET = 0.15;
// Od tej - w pełni mokre.
export const WET_FULL = 0.8;
// O tyle stopni wyższy zapłon ma w pełni mokre polano.
export const WET_IGNITE = 100;
// Taką część żaru traci w pełni mokre polano.
export const WET_HEAT = 0.3;
// Deszcz moczy drewno najwyżej do tej wilgotności; w wodzie - do SOAKED.
export const RAIN_WET = 0.6;
export const SOAKED = 0.95;

const SUFFIX = '_firewood';
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// Gatunek drewna, jeśli ta rzecz niesie wilgotność (polano), albo null.
export function seasonedWood(type) {
    if (typeof type !== 'string' || !type.endsWith(SUFFIX)) return null;
    const wood = type.slice(0, -SUFFIX.length);
    return Object.hasOwn(WOOD_TRAITS, wood) ? wood : null;
}

export const isSeasonable = (type) => seasonedWood(type) !== null;

// Wilgotność polana prosto spod siekiery.
export const freshWet = (wood) => WOOD_TRAITS[wood]?.fresh ?? 0;

// Pole `fresh` (suchość) dla świeżo porąbanego polana tego rodzaju;
// undefined - to nie polano.
export function choppedFresh(type) {
    const wood = seasonedWood(type);
    return wood ? 1 - freshWet(wood) : undefined;
}

// Wilgotność stosu 0-1 (0 - suche albo nie drewno).
export function wetOf(item) {
    if (!item || !isSeasonable(item.type)) return 0;
    return Number.isFinite(item.fresh) ? clamp01(1 - item.fresh) : 0;
}

// Jak mocno wilgotność przeszkadza, 0-1.
export function wetFactor(wet) {
    return clamp01((clamp01(wet) - DRY_WET) / (WET_FULL - DRY_WET));
}

export const isWet = (wet) => clamp01(wet) > DRY_WET;

// Słowami: "suche", "wilgotne", "mokre", "bardzo mokre".
export function wetWord(wet) {
    const value = clamp01(wet);
    return value <= DRY_WET ? 'suche' : value <= 0.4 ? 'wilgotne' : value <= 0.65 ? 'mokre' : 'bardzo mokre';
}

// Zapłon i żar polana o tej wilgotności.
export function wetIgnite(wood, wet = 0) {
    return Math.round((WOOD_TRAITS[wood]?.ignite ?? 0) + WET_IGNITE * wetFactor(wet));
}

export function wetHeat(wood, wet = 0) {
    return Math.round((WOOD_TRAITS[wood]?.heat ?? 0) * (1 - WET_HEAT * wetFactor(wet)));
}

// Pasek na ikonce stosu: ile wody (null - suche).
export function wetBar(item) {
    const wet = wetOf(item);
    if (!isWet(wet)) return null;
    return { fresh: wet, color: `hsl(205, 85%, ${Math.round(72 - wet * 26)}%)` };
}

// Opis stosu do podpowiedzi: ['Mokre (60%) - zapłon 389°, żar 729°'] albo [].
export function wetNotes(item) {
    const wood = seasonedWood(item?.type);
    if (!wood) return [];
    const wet = wetOf(item);
    if (!isWet(wet)) return ['Suche'];
    const word = wetWord(wet);
    return [`${word[0].toUpperCase() + word.slice(1)} (${Math.round(wet * 100)}% wody) - teraz zapłon ${wetIgnite(wood, wet)}°, żar ${wetHeat(wood, wet)}°`];
}

// Ustawia wilgotność stosu polan (pole fresh to suchość; suchy stos
// pola nie ma).
export function setWet(item, wet) {
    const value = clamp01(wet);
    if (value <= 0) delete item.fresh;
    // (Bez zaokrąglania: schnięcie w plecaku to drobne kroki.)
    else item.fresh = Math.max(0.001, 1 - value);
    return item;
}
