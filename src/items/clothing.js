// ------------------------------------------------------------
// WŁÓKNA I UBRANIA (1.27.0, pomysł Kamila)
//
// Droga od rośliny do ubrania:
//
//   1. Moczenie (RETTING): wiązka lnu, pokrzywa albo kora lipowa
//      wrzucona do wody (leży w wodzie RET_SECONDS) zamienia się w len
//      moczony, pokrzywę moczoną albo łyko (game/Drops.js).
//   2. Włókno: moczony len i moczona pokrzywa w siatce wytwarzania dają
//      włókno (crafting/recipes.js). Łyko jest włóknem od razu.
//      Trzy włókna - sznur.
//   3. Tkanie (CLOTHS): na stole krawieckim dwa włókna to jedno płótno -
//      jakie, zależy od włókna: lniane, pokrzywowe albo plecionka z łyka.
//   4. Szycie (GARMENTS): płótno na stole, wybór kroju (czapka, koszula,
//      spodnie...) i wzoru (PATTERNS) - powstaje ubranie. Krój zużywa
//      `cost` płócien.
//   5. Barwienie: barwnik główny (kolor ubrania) i barwnik wzoru - przy
//      szyciu albo później, na gotowym ubraniu.
//
// Ubranie to przedmiot `${krój}_${płótno}` (np. shirt_linen) z wyglądem
// `look` = { pattern, main, accent } (main, accent - klucz barwnika z
// blocks/torches.js albo null - naturalny kolor płótna). Ubrania się
// nie układają w stosy (STACK - 1), więc każde ma swój wygląd.
//
// Noszone (Inventory: data.equip - głowa, tułów, nogi, stopy) grzeją
// (warmth x factor płótna - game/Warmth.js) i widać je na postaci
// (player/clothes.js).
// ------------------------------------------------------------

import { DYE_ITEMS } from './dyes.js';

// --- Moczenie ---------------------------------------------------------------

// Ile sekund przedmiot musi leżeć w wodzie.
export const RET_SECONDS = 90;

export const RETTING = {
    len_wiazka: 'flax_retted',
    nettle: 'nettle_retted',
    linden_bark: 'bast'
};

export function retsInto(type) {
    return Object.hasOwn(RETTING, type ?? '') ? RETTING[type] : null;
}

// --- Włókna i płótna --------------------------------------------------------

// Włókno -> płótno (dwa włókna na jedno płótno).
export const FIBERS_PER_CLOTH = 2;

//   fiber  - z czego się tka,
//   color  - naturalny kolor (niebarwione), shade - kolor wzoru bez barwnika,
//   factor - ile grzeje (mnożnik ciepła kroju),
//   adj    - przymiotnik w nazwie ubrania: [rodzaj żeński, mnogi].
export const CLOTHS = {
    linen: { item: 'linen_cloth', fiber: 'flax_fiber', label: 'Płótno lniane', color: '#dccfae', shade: '#9b8a62', factor: 0.8, adj: ['lniana', 'lniane'] },
    nettle: { item: 'nettle_cloth', fiber: 'nettle_fiber', label: 'Płótno pokrzywowe', color: '#a8ad8c', shade: '#6b7155', factor: 1.1, adj: ['pokrzywowa', 'pokrzywowe'] },
    bast: { item: 'bast_weave', fiber: 'bast', label: 'Plecionka z łyka', color: '#b48b57', shade: '#7a5a33', factor: 0.8, adj: ['z łyka', 'z łyka'] }
};

export const CLOTH_ITEMS = Object.fromEntries(Object.entries(CLOTHS).map(([key, cloth]) => [cloth.item, key]));

export function clothOf(type) {
    return Object.hasOwn(CLOTH_ITEMS, type ?? '') ? CLOTH_ITEMS[type] : null;
}

// Płótno, które powstaje z tego włókna (klucz CLOTHS) albo null.
export function clothFromFiber(type) {
    return Object.keys(CLOTHS).find((key) => CLOTHS[key].fiber === type) ?? null;
}

// --- Kroje --------------------------------------------------------------------

export const SLOTS = ['head', 'body', 'legs', 'feet'];
export const SLOT_LABELS = { head: 'Głowa', body: 'Tułów', legs: 'Nogi', feet: 'Stopy' };

//   slot   - gdzie się nosi, cost - ile płócien, warmth - ile °C grzeje
//            (razy factor płótna), cloths - z czego da się uszyć,
//   label  - nazwa, plural - rodzaj mnogi (przymiotnik płótna).
export const GARMENTS = {
    cap: { slot: 'head', cost: 1, warmth: 1.5, cloths: ['linen', 'nettle'], label: 'Czapka' },
    scarf: { slot: 'head', cost: 1, warmth: 1, cloths: ['linen', 'nettle'], label: 'Chusta' },
    headband: { slot: 'head', cost: 1, warmth: 0.5, cloths: ['linen', 'nettle'], label: 'Opaska' },
    shirt: { slot: 'body', cost: 3, warmth: 3, cloths: ['linen', 'nettle'], label: 'Koszula' },
    vest: { slot: 'body', cost: 2, warmth: 1.5, cloths: ['linen', 'nettle', 'bast'], label: 'Kamizelka' },
    tunic: { slot: 'body', cost: 4, warmth: 4, cloths: ['linen', 'nettle'], label: 'Tunika' },
    trousers: { slot: 'legs', cost: 3, warmth: 2.5, cloths: ['linen', 'nettle'], label: 'Spodnie', plural: true },
    shorts: { slot: 'legs', cost: 2, warmth: 1, cloths: ['linen', 'nettle'], label: 'Krótkie spodnie', plural: true },
    boots: { slot: 'feet', cost: 2, warmth: 1.5, cloths: ['linen', 'nettle'], label: 'Buty', plural: true },
    lapcie: { slot: 'feet', cost: 2, warmth: 1, cloths: ['bast'], label: 'Łapcie', plural: true }
};

export const garmentType = (kind, cloth) => `${kind}_${cloth}`;

// Wszystkie ubrania: typ -> { kind, cloth, slot, ... }.
export const GARMENT_TYPES = {};
for (const [kind, garment] of Object.entries(GARMENTS)) {
    for (const cloth of garment.cloths) {
        const adj = CLOTHS[cloth].adj[garment.plural ? 1 : 0];
        GARMENT_TYPES[garmentType(kind, cloth)] = { kind, cloth, slot: garment.slot, cost: garment.cost,
            warmth: Math.round(garment.warmth * CLOTHS[cloth].factor * 10) / 10, label: `${garment.label} ${adj}` };
    }
}

export function garmentInfo(type) {
    return Object.hasOwn(GARMENT_TYPES, type ?? '') ? GARMENT_TYPES[type] : null;
}

export const isGarment = (type) => garmentInfo(type) !== null;

// Kroje, które da się uszyć z tego płótna.
export function kindsFor(cloth) {
    return Object.keys(GARMENTS).filter((kind) => GARMENTS[kind].cloths.includes(cloth));
}

// --- Wzory i kolory -------------------------------------------------------------

export const PATTERNS = {
    plain: { label: 'gładki' },
    stripes: { label: 'paski' },
    check: { label: 'krata' },
    embroidery: { label: 'haft' }
};

export const DYE_COLORS = Object.fromEntries(Object.values(DYE_ITEMS).map((dye) => [dye.dye, dye.color]));

const DYE_ADJECTIVES = Object.fromEntries(Object.values(DYE_ITEMS).map((dye) => [dye.dye, dye.label.replace(/^Barwnik /, '')]));

export function dyeOfItem(type) {
    return Object.hasOwn(DYE_ITEMS, type ?? '') ? DYE_ITEMS[type].dye : null;
}

// Poprawny wygląd (z zapisu, z sieci) - zawsze pełny obiekt.
export function cleanLook(look) {
    const pattern = Object.hasOwn(PATTERNS, look?.pattern ?? '') ? look.pattern : 'plain';
    const color = (key) => (typeof key === 'string' && Object.hasOwn(DYE_COLORS, key) ? key : null);
    return { pattern, main: color(look?.main), accent: color(look?.accent) };
}

export const sameLook = (a, b) => {
    const x = cleanLook(a), y = cleanLook(b);
    return x.pattern === y.pattern && x.main === y.main && x.accent === y.accent;
};

// Kolory ubrania (hex): główny i wzoru - z barwników albo naturalne.
export function lookColors(type, look) {
    const info = garmentInfo(type), clean = cleanLook(look);
    const cloth = CLOTHS[info?.cloth ?? 'linen'];
    return {
        pattern: clean.pattern,
        main: clean.main ? DYE_COLORS[clean.main] : cloth.color,
        accent: clean.accent ? DYE_COLORS[clean.accent] : clean.main ? darker(DYE_COLORS[clean.main]) : cloth.shade
    };
}

function darker(hex) {
    return '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.62).toString(16).padStart(2, '0')).join('');
}

// Opis wyglądu słowami: "czerwona, w paski (biały)".
export function lookText(type, look) {
    const clean = cleanLook(look);
    const main = clean.main ? DYE_ADJECTIVES[clean.main] : 'niebarwiony';
    const pattern = clean.pattern === 'plain' ? 'gładki' : `${PATTERNS[clean.pattern].label}${clean.accent ? ` (${DYE_ADJECTIVES[clean.accent]})` : ''}`;
    return `kolor: ${main}, wzór: ${pattern}`;
}

// --- Stół krawiecki: tkanie, szycie, barwienie ------------------------------------

// Tkanie: z `count` włókien - ile płócien i jakich. null - to nie włókno.
export function weave(fiber, count = FIBERS_PER_CLOTH) {
    const cloth = clothFromFiber(fiber);
    if (!cloth || count < FIBERS_PER_CLOTH) return null;
    return { type: CLOTHS[cloth].item, count: Math.floor(count / FIBERS_PER_CLOTH), uses: Math.floor(count / FIBERS_PER_CLOTH) * FIBERS_PER_CLOTH };
}

// Szycie albo barwienie. material - stos w polu materiału (płótno albo
// ubranie), choice - { kind, pattern }, dyes - [główny, wzoru] (stosy
// albo null). Zwraca { item, material, dyes: [ile, ile], mode } albo
// null (nic z tego nie będzie) - material: ile płócien zużyje.
export function sewResult(material, choice = {}, dyes = []) {
    if (!material) return null;
    const main = dyeOfItem(dyes[0]?.type), accent = dyeOfItem(dyes[1]?.type);
    const pattern = Object.hasOwn(PATTERNS, choice.pattern ?? '') ? choice.pattern : 'plain';
    const usesAccent = pattern !== 'plain' && accent;

    const garment = garmentInfo(material.type);
    if (garment) {
        // Barwienie gotowego ubrania: potrzebny choć jeden barwnik.
        if (!main && !usesAccent) return null;
        const old = cleanLook(material.look);
        const look = cleanLook({ pattern, main: main ?? old.main, accent: usesAccent ? accent : pattern === old.pattern ? old.accent : null });
        if (sameLook(look, old)) return null;
        return { mode: 'dye', item: { type: material.type, count: 1, look }, material: 1, dyes: [main ? 1 : 0, usesAccent ? 1 : 0] };
    }

    const cloth = clothOf(material.type);
    const kind = choice.kind;
    if (!cloth || !Object.hasOwn(GARMENTS, kind ?? '') || !GARMENTS[kind].cloths.includes(cloth)) return null;
    if (material.count < GARMENTS[kind].cost) return null;
    const look = cleanLook({ pattern, main, accent: usesAccent ? accent : null });
    return { mode: 'sew', item: { type: garmentType(kind, cloth), count: 1, look }, material: GARMENTS[kind].cost, dyes: [main ? 1 : 0, usesAccent ? 1 : 0] };
}

// --- Noszenie -------------------------------------------------------------------

// Ile stopni grzeje to, co gracz ma na sobie (equip - 4 stosy albo null).
export function wornWarmth(equip = []) {
    let sum = 0;
    for (const item of equip) sum += garmentInfo(item?.type)?.warmth ?? 0;
    return Math.round(sum * 10) / 10;
}

// Czy ten stos pasuje do miejsca `slot` (indeks w SLOTS).
export function fitsSlot(item, slot) {
    return garmentInfo(item?.type)?.slot === SLOTS[slot];
}

// Krótki zapis noszonych ubrań (sieć, przebudowa skórki):
// "shirt_linen.stripes.red.white|..." - puste miejsca to "-".
export function clothesCode(equip = []) {
    return SLOTS.map((_, i) => {
        const item = equip[i];
        if (!isGarment(item?.type)) return '-';
        const look = cleanLook(item.look);
        return [item.type, look.pattern, look.main ?? '', look.accent ?? ''].join('.');
    }).join('|');
}

export function parseClothes(code) {
    if (typeof code !== 'string' || code.length > 400) return [];
    return code.split('|').slice(0, SLOTS.length).map((part, slot) => {
        const [type, pattern, main, accent] = part.split('.');
        if (!fitsSlot({ type }, slot)) return null;
        return { type, count: 1, look: cleanLook({ pattern, main: main || null, accent: accent || null }) };
    });
}

// --- Przedmioty (ItemRegistry.js) --------------------------------------------------

export const CLOTHING_ITEMS = {
    flax_retted: { name: 'Retted Flax', label: 'Moczony len', icon: 'flax_retted', category: 'narzedzia' },
    nettle_retted: { name: 'Retted Nettle', label: 'Moczona pokrzywa', icon: 'nettle_retted', category: 'narzedzia' },
    flax_fiber: { name: 'Flax Fiber', label: 'Włókno lniane', icon: 'flax_fiber', category: 'narzedzia' },
    nettle_fiber: { name: 'Nettle Fiber', label: 'Włókno pokrzywowe', icon: 'nettle_fiber', category: 'narzedzia' },
    bast: { name: 'Bast', label: 'Łyko', icon: 'bast', category: 'narzedzia' },
    rope: { name: 'Rope', label: 'Sznur', icon: 'rope', category: 'narzedzia' },
    ...Object.fromEntries(Object.values(CLOTHS).map((cloth) => [cloth.item, { name: cloth.item, label: cloth.label, icon: cloth.item, category: 'narzedzia' }])),
    ...Object.fromEntries(Object.entries(GARMENT_TYPES).map(([type, info]) => [type, { name: type, label: info.label, icon: type, category: 'narzedzia', stack: 1 }]))
};
