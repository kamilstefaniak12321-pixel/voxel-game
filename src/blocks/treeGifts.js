// ------------------------------------------------------------
// DARY PNIA (1.41.0, część D projektu drewna - docs/dary-pnia.md)
//
// Nacięcie nożem w pniu żywego drzewa (PPM) puszcza to, co drzewo ma
// pod korą: żywicę albo sok. Tu są same zasady i liczby; stan nacięć
// trzyma game/TreeTaps.js, obraz - rendering/TapRenderer.js.
//
//   żywica (drzewa iglaste) - zastyga na korze, zbiera się ją ręką,
//   sok (brzoza, klon, palma) i woda z baobabu - ciekną: trzeba pod
//     nacięciem powiesić gliniany kubek, inaczej kapią na ziemię.
//
// Ile płynie, zależy od:
//   - pory roku (SEASONS każdego daru; klon - od połowy zimy),
//   - pory doby (soki płyną za dnia, gdy pień się nagrzeje),
//   - grubości pnia (gruby pień daje więcej),
//   - liczby nacięć w tym samym drzewie (drzewo ma tyle soku, ile ma:
//     dzieli go między nacięcia).
// Nacięcie po kilku dobach samo się zabliźnia.
//
// Nowy dar: wpis w GIFTS i gatunek w TREE_GIFTS (część D2 dopisze gumę,
// lateks, smoczą krew...).
// ------------------------------------------------------------

import { DAY_LENGTH_MINUTES } from '../config.js';
import { seasonAt } from '../sky/Seasons.js';

export const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;

// Pola daru:
//   item    - co się zbiera (żywica: sztuki; sok: kubek soku),
//   vessel  - czy trzeba kubka (bez niego kapie na ziemię),
//   max     - ile najwięcej czeka w nacięciu (żywica: kropli; sok: 1 kubek),
//   perDay  - ile przybywa na dobę w najlepszej porze, w pniu grubości 1,
//   seasons - mnożnik w porach roku [wiosna, lato, jesień, zima],
//   lateWinter - mnożnik od połowy zimy (klon: przedwiośnie),
//   byDay   - płynie głównie za dnia (soki),
//   openDays - po ilu dobach nacięcie się zabliźnia,
//   name    - nazwa w napisach (biernik: "puszcza żywicę"),
//   color   - kolor w nacięciu i w kubku.
export const GIFTS = {
    resin: {
        item: 'resin', vessel: false, max: 3, perDay: 2, seasons: [1, 1.5, 0.8, 0.3], openDays: 5,
        name: 'żywicę', label: 'żywica', color: 0xf0a01c
    },
    birch_sap: {
        item: 'birch_sap', vessel: true, max: 1, perDay: 2.5, seasons: [1, 0, 0, 0], byDay: true, openDays: 3,
        name: 'sok', label: 'sok brzozowy', color: 0xe6ecd6
    },
    maple_sap: {
        item: 'maple_sap', vessel: true, max: 1, perDay: 2.5, seasons: [1, 0, 0, 0], lateWinter: 1, byDay: true, openDays: 3,
        name: 'sok', label: 'sok klonowy', color: 0xe9dcae
    },
    palm_sap: {
        item: 'palm_sap', vessel: true, max: 1, perDay: 1.5, seasons: [1, 1, 1, 1], byDay: true, openDays: 3,
        name: 'sok', label: 'sok palmowy', color: 0xf0ead2
    },
    baobab_water: {
        item: 'baobab_water', vessel: true, max: 1, perDay: 2, seasons: [1, 1, 1, 1], openDays: 3,
        name: 'wodę', label: 'woda z baobabu', color: 0xbfd8e6
    }
};

// Co daje pień gatunku.
export const TREE_GIFTS = {
    pine: 'resin', spruce: 'resin', fir: 'resin', larch: 'resin', mugo: 'resin', bristlecone: 'resin', cedar: 'resin', araucaria: 'resin',
    birch: 'birch_sap',
    maple: 'maple_sap',
    coconut_palm: 'palm_sap',
    baobab: 'baobab_water'
};

// Mnożniki pory doby dla soków (średnio w dobie ok. 1).
export const DAY_FLOW = 1.4, NIGHT_FLOW = 0.4;
const FLOW_FROM_HOUR = 7, FLOW_UNTIL_HOUR = 19;
// Najwięcej liczy się grubość pnia 3 (olbrzymy nie leją strumieniem).
export const MAX_WIDTH = 3;
// Ile nacięć zmieści się na pniu o grubości `width`.
export const tapsAllowed = (width = 1) => 2 * Math.max(1, Math.min(MAX_WIDTH, Math.round(width)));

export function giftOf(species) {
    const key = Object.hasOwn(TREE_GIFTS, species ?? '') ? TREE_GIFTS[species] : null;
    return key ? GIFTS[key] : null;
}
export const giftKey = (species) => (Object.hasOwn(TREE_GIFTS, species ?? '') ? TREE_GIFTS[species] : null);

// Mnożnik pory roku w chwili `days` (0 - nic nie płynie).
export function seasonFlow(gift, days) {
    const season = seasonAt(days);
    let flow = gift.seasons[season.index] ?? 0;
    if (gift.lateWinter && season.index === 3 && season.progress >= 0.5) flow = Math.max(flow, gift.lateWinter);
    return flow;
}

// Mnożnik pory doby (soki): average - bez rozróżniania dnia i nocy
// (przespany czas, dalekie drzewa liczone hurtem).
export function dayFlow(gift, days, average = false) {
    if (!gift.byDay || average) return 1;
    const hour = (days - Math.floor(days)) * 24;
    return hour >= FLOW_FROM_HOUR && hour < FLOW_UNTIL_HOUR ? DAY_FLOW : NIGHT_FLOW;
}

// Ile przybywa w nacięciu na sekundę.
//   width - grubość pnia, taps - ile nacięć ma to drzewo (z tym).
export function flowPerSecond(gift, days, width = 1, taps = 1, average = false) {
    const thick = Math.max(1, Math.min(MAX_WIDTH, width));
    return gift.perDay * seasonFlow(gift, days) * dayFlow(gift, days, average) * thick / Math.max(1, taps) / DAY_SECONDS;
}

// Kiedy ten dar płynie - słowami ("wiosną", "cały rok, latem najszybciej").
export function flowSeasonsText(gift) {
    const words = ['wiosną', 'latem', 'jesienią', 'zimą'];
    const on = gift.seasons.map((flow, index) => (flow > 0 ? index : -1)).filter((index) => index >= 0);
    if (on.length === 4) {
        const best = gift.seasons.indexOf(Math.max(...gift.seasons));
        return gift.seasons.every((flow) => flow === gift.seasons[0]) ? 'cały rok' : `cały rok, ${words[best]} najszybciej`;
    }
    const list = on.map((index) => words[index]).join(' i ');
    return gift.lateWinter ? `od połowy zimy i ${list}` : list;
}
