// ------------------------------------------------------------
// TWARDOŚĆ I ZUŻYCIE NARZĘDZI (1.39.0, docs/drewno.md rozdział 5,
// opis tego, co działa: docs/narzedzia.md)
//
// Do 1.38.0 skała, z której jest narzędzie, była tylko wyglądem.
// Teraz liczy się jej TWARDOŚĆ - na początek dla siekiery:
//
//   1. Siekiera tnie drewno najwyżej PÓŁTORA RAZA twardsze od siebie
//      (twardość drewna: blocks/woodTraits.js).
//   2. Zużywa się tym szybciej, im twardsze drewno względem niej:
//      kamienna wystarcza na dwa dęby albo sześć brzóz.
//   3. Gdy jest CO NAJMNIEJ DWA RAZY twardsza od drewna, nie zużywa się
//      wcale (kamienna na świerku, granitowa na sośnie).
//
// Stan siekiery trzyma pole `fresh` stosu (1 - cała, 0 - pęka), jak
// świeżość jedzenia (items/freshness.js). Nowa siekiera pola nie ma,
// więc stare zapisy wyglądają jak dotąd. Gdy pęknie, zostaje patyk.
// ------------------------------------------------------------

import { stoneToolInfo } from './stoneTools.js';

// Twardość skały, z której jest głowica.
export const ROCK_HARDNESS = { sandstone: 2, limestone: 3, slate: 4, stone: 5, basalt: 6, granite: 7 };

// Siekiera tnie drewno najwyżej tyle razy twardsze od siebie...
export const CUT_RATIO = 1.5;
// ...a gdy jest co najmniej tyle razy twardsza od drewna, nie zużywa się.
export const NO_WEAR_RATIO = 2;
// Zużycie jednego ciosu: WEAR_SCALE × (twardość drewna / twardość
// siekiery − 1 / NO_WEAR_RATIO) ^ WEAR_POWER. Dobrane tak, żeby kamienna
// siekiera (5) wystarczała na 2 dęby (11 ciosów w twardość 7) albo
// 6 brzóz (8 ciosów w twardość 5).
export const WEAR_SCALE = 0.0515, WEAR_POWER = 1.3;
// Wygląd słowami: od ilu procent stanu siekiera jest wyszczerbiona / pęknięta.
export const CHIPPED_FROM = 0.5, CRACKED_FROM = 0.2;

// Które narzędzia się zużywają (na razie siekiery).
export function isWearing(type) {
    return stoneToolInfo(type)?.tool === 'axe';
}

// Twardość narzędzia albo null, gdy to nie narzędzie ze skały.
export function toolHardness(type) {
    const info = stoneToolInfo(type);
    return info ? ROCK_HARDNESS[info.stone] ?? ROCK_HARDNESS.stone : null;
}

// Najtwardsze drewno, jakie bierze narzędzie o tej twardości.
export function maxWoodHardness(hardness) {
    return Math.floor(hardness * CUT_RATIO);
}

// Czy siekiera `type` przetnie drewno o twardości `wood`.
export function canCut(type, wood) {
    const hardness = toolHardness(type);
    return hardness === null || wood <= maxWoodHardness(hardness);
}

// Ile stanu (0-1) zabiera siekierze o twardości `tool` jeden cios
// w drewno o twardości `wood`.
export function wearPerChop(tool, wood) {
    if (!(tool > 0) || tool >= wood * NO_WEAR_RATIO) return 0;
    return WEAR_SCALE * (wood / tool - 1 / NO_WEAR_RATIO) ** WEAR_POWER;
}

// Na ile ciosów w takie drewno wystarcza nowa siekiera (Infinity - nie
// zużywa się).
export function chopsUntilBroken(tool, wood) {
    const wear = wearPerChop(tool, wood);
    return wear > 0 ? Math.ceil(1 / wear - 1e-9) : Infinity;
}

// Naprawa smołą klejącą (1.42.0, docs/dary-pnia.md): siekiera i smoła
// w siatce wytwarzania. Odzyskuje REPAIR_GAIN stanu, ale klejona nigdy
// nie jest jak nowa - najwyżej REPAIR_MAX.
export const REPAIR_GAIN = 0.4, REPAIR_MAX = 0.8;
export const REPAIR_ITEM = 'pitch_glue';

// Stan po naprawie albo null, gdy nie ma czego naprawiać (to nie
// siekiera albo jest w lepszym stanie, niż da klejenie).
export function repairedCondition(item) {
    if (!item || !isWearing(item.type)) return null;
    const now = Number.isFinite(item.fresh) ? Math.max(0, Math.min(1, item.fresh)) : 1;
    if (now >= REPAIR_MAX - 1e-9) return null;
    return Math.round(Math.min(REPAIR_MAX, now + REPAIR_GAIN) * 1000) / 1000;
}

// Stan siekiery w stosie, 0-1 (1 - cała).
export function conditionOf(item) {
    if (!item || !isWearing(item.type)) return 1;
    return Number.isFinite(item.fresh) ? Math.max(0, Math.min(1, item.fresh)) : 1;
}

// 'whole' - cała, 'chipped' - wyszczerbiona, 'cracked' - pęknięta.
export function wearStage(condition) {
    return condition >= CHIPPED_FROM ? 'whole' : condition >= CRACKED_FROM ? 'chipped' : 'cracked';
}
export const STAGE_WORDS = { whole: 'cała', chipped: 'wyszczerbiona', cracked: 'pęknięta' };

// Pasek pod ikonką: szary (cała) → pomarańczowy → czerwony; nowa bez paska.
export function wearBar(item) {
    if (!item || !isWearing(item.type)) return null;
    const condition = conditionOf(item);
    if (condition >= 0.995) return null;
    const stage = wearStage(condition);
    return { fresh: Math.max(0.04, condition), color: stage === 'whole' ? '#b9bcc2' : stage === 'chipped' ? '#e39a2d' : '#d8452e' };
}

const ROCK_WORDS = { sandstone: 'piaskowca', limestone: 'wapienia', slate: 'łupka', stone: 'kamienia', basalt: 'bazaltu', granite: 'granitu' };
// "z granitu" - do komunikatów.
export function rockWord(type) {
    const info = stoneToolInfo(type);
    return info ? ROCK_WORDS[info.stone] ?? ROCK_WORDS.stone : '';
}

// Skały, z których siekiera weźmie drewno o twardości `wood` ("kamienia,
// bazaltu albo granitu").
export function rocksFor(wood) {
    const names = Object.keys(ROCK_HARDNESS).filter((stone) => wood <= maxWoodHardness(ROCK_HARDNESS[stone]))
        .sort((a, b) => ROCK_HARDNESS[a] - ROCK_HARDNESS[b]).map((stone) => ROCK_WORDS[stone]);
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} albo ${names.at(-1)}`;
}

// Opis do podpowiedzi w ekwipunku.
export function wearNotes(type, item = null) {
    if (!isWearing(type)) return [];
    const hardness = toolHardness(type), condition = conditionOf(item?.type === type ? item : null);
    const notes = [`Twardość ${hardness}: tnie drewno do twardości ${maxWoodHardness(hardness)}, bez zużycia do ${Math.floor(hardness / NO_WEAR_RATIO)}`];
    notes.push(condition >= 0.995 ? 'Stan: nowa' : `Stan: ${Math.max(1, Math.round(condition * 100))}% - ${STAGE_WORDS[wearStage(condition)]}`);
    return notes;
}
