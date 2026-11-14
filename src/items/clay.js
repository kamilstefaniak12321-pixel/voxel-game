// ------------------------------------------------------------
// GLINA: RODZAJE, KUBKI, CEGŁY I SUSZENIE (1.1.0)
//
// Pomysł Kamila. Trzy gliny, każda leży tam, gdzie w naturze:
//   clay        - zwykła: brzegi rzek i jezior na nizinach, mokradła,
//   red_clay    - czerwona (dużo żelaza): ciepłe, suche biomy - gaje
//                 oliwne i lasy eukaliptusowe,
//   white_clay  - biała (kaolin, zwietrzały granit): skaliste góry, hale,
//                 kosodrzewina.
// (Gdzie dokładnie - world/terrain/RealisticGenerator.js: clayAt.)
//
// Z każdej gliny lepi się MOKRY kubek i MOKRĄ cegłę. Mokra rzecz musi
// wyschnąć na słońcu: wyrzuć ją (Q) pod gołym niebem - po DRY_SECONDS
// leżenia w dzień zamienia się w suchą (game/Drops.js: updateDrying).
// Z suchego kubka da się pić (napary), z czterech suchych cegieł
// powstaje blok cegieł.
//
// Nazwy: mokry kubek - wet_<glina>_cup, suchy - <glina>_cup; mokra
// cegła - wet_<glina>_brick, sucha - <glina>_brick; blok - <glina>_bricks.
//
// Nowa glina: wpis w CLAY_KINDS, blok gliny i cegieł w BlockRegistry.js,
// tekstury w tools/tekstury_gliny.py, miejsce w generatorze (clayAt).
// Nowa rzecz do suszenia: wpis w DRYING.
// ------------------------------------------------------------

export const CLAY_KINDS = {
    clay: { label: 'glina', of: 'z gliny', cup: 'Gliniany kubek', brick: 'Cegła', bricks: 'Cegły' },
    red_clay: { label: 'czerwona glina', of: 'z czerwonej gliny', cup: 'Czerwony gliniany kubek', brick: 'Czerwona cegła', bricks: 'Czerwone cegły' },
    white_clay: { label: 'biała glina', of: 'z białej gliny', cup: 'Biały gliniany kubek', brick: 'Biała cegła', bricks: 'Białe cegły' }
};

export const CLAY_TYPES = Object.keys(CLAY_KINDS);

export const wetCup = (clay) => `wet_${clay}_cup`;
export const dryCup = (clay) => `${clay}_cup`;
export const wetBrick = (clay) => `wet_${clay}_brick`;
export const dryBrick = (clay) => `${clay}_brick`;
export const brickBlock = (clay) => `${clay}_bricks`;

// Kubki, z których da się pić (grupa składników "cup").
export const CUPS = CLAY_TYPES.map(dryCup);

// Ile sekund na słońcu schnie mokra rzecz (ok. 2,5 godziny gry).
export const DRY_SECONDS = 120;

// Schnie tylko w dzień (godziny gry) i pod gołym niebem: jasność nieba
// w miejscu, gdzie leży, co najmniej DRY_SKY_LIGHT (0-15).
export const DRY_FROM_HOUR = 6;
export const DRY_UNTIL_HOUR = 19;
export const DRY_SKY_LIGHT = 13;

// Mokre -> suche.
export const DRYING = Object.fromEntries(CLAY_TYPES.flatMap((clay) => [
    [wetCup(clay), dryCup(clay)],
    [wetBrick(clay), dryBrick(clay)]
]));

export function driesInto(type) {
    return Object.hasOwn(DRYING, type ?? '') ? DRYING[type] : null;
}

// Czy o tej porze świeci słońce (days - czas świata w dniach).
export function sunDries(days) {
    const hour = (days % 1) * 24;
    return hour >= DRY_FROM_HOUR && hour < DRY_UNTIL_HOUR;
}

// Przedmioty z gliny do ItemRegistry.js (kubek zwykłej gliny - clay_cup -
// jest tam od 0.98.1).
export const CLAY_ITEMS = Object.fromEntries(CLAY_TYPES.flatMap((clay) => {
    const kind = CLAY_KINDS[clay];
    const items = [
        [wetCup(clay), { name: `Wet ${clay} cup`, label: `Mokry kubek ${kind.of}`, icon: wetCup(clay), category: 'narzedzia' }],
        [wetBrick(clay), { name: `Wet ${clay} brick`, label: `Mokra cegła ${kind.of}`, icon: wetBrick(clay), category: 'narzedzia' }],
        [dryBrick(clay), { name: `${clay} brick`, label: kind.brick, icon: dryBrick(clay), category: 'narzedzia' }]
    ];
    if (clay !== 'clay') {
        items.push([dryCup(clay), { name: `${clay} cup`, label: kind.cup, icon: dryCup(clay), category: 'narzedzia' }]);
    }
    return items;
}));
