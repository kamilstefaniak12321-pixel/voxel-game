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
//   3. Tkanie (CLOTHS): na stole krawieckim (game/SewingTables.js - stoi
//      w świecie, jak stolarski) dwa włókna to jedno płótno - jakie,
//      zależy od włókna: lniane, pokrzywowe albo plecionka z łyka.
//   4. Szycie (GARMENTS): płótno na blacie, na drugiej części stołu
//      wykroje na głowę, tułów, nogi i stopy; krój (czapka, koszula,
//      spodnie...) i wzór (PATTERNS) się zmienia - powstaje ubranie.
//      Krój zużywa `cost` płócien.
//   5. Barwienie: barwnik na płótno (kolor) albo z kucaniem (kolor wzoru)
//      - przed szyciem albo później, na gotowym ubraniu.
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
    linden_bark: 'bast',
    // Garbnik (1.42.0, dary pnia): kora z garbnikiem wymoczona w wodzie.
    oak_bark: 'tannin',
    mangrove_bark: 'tannin',
    sequoia_bark: 'tannin'
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

export const PATTERN_ORDER = Object.keys(PATTERNS);

export const DYE_COLORS = Object.fromEntries(Object.values(DYE_ITEMS).map((dye) => [dye.dye, dye.color]));

const DYE_ADJECTIVES = Object.fromEntries(Object.values(DYE_ITEMS).map((dye) => [dye.dye, dye.label.replace(/^Barwnik /, '')]));

export function dyeOfItem(type) {
    return Object.hasOwn(DYE_ITEMS, type ?? '') ? DYE_ITEMS[type].dye : null;
}

// Poprawny wygląd (z zapisu, z sieci) - zawsze pełny obiekt.
export function cleanLook(look) {
    const pattern = Object.hasOwn(PATTERNS, look?.pattern ?? '') ? look.pattern : 'plain';
    const color = (key) => (typeof key === 'string' && Object.hasOwn(DYE_COLORS, key) ? key : null);
    // proof (1.42.0) - ubranie natarte lateksem: mokre grzeje jak suche.
    return { pattern, main: color(look?.main), accent: color(look?.accent), ...(look?.proof === true ? { proof: true } : {}) };
}

export const sameLook = (a, b) => {
    const x = cleanLook(a), y = cleanLook(b);
    return x.pattern === y.pattern && x.main === y.main && x.accent === y.accent && Boolean(x.proof) === Boolean(y.proof);
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
    return `kolor: ${main}, wzór: ${pattern}${clean.proof ? ', natarte lateksem (nie boi się wody)' : ''}`;
}

// --- Stół krawiecki: tkanie, szycie, barwienie ------------------------------------
//
// Stół stoi w świecie (game/SewingTables.js): materiał na lewej części,
// wyroby na prawej - w czterech ćwiartkach, po jednej na każde miejsce
// na ciele (PRODUCT_SLOTS).

// Ćwiartki części B (numer wyrobu jak w stole stolarskim: rząd 0 - przód,
// 1 - tył; kolumna 0 - lewa): z tyłu głowa i tułów, z przodu nogi i stopy.
export const PRODUCT_SLOTS = ['legs', 'feet', 'head', 'body'];

// Kroje na dane miejsce na ciele z tego płótna.
export function kindsForSlot(cloth, slot) {
    return kindsFor(cloth).filter((kind) => GARMENTS[kind].slot === slot);
}

// Następny element listy po `current` (w kółko); pierwszy, gdy go nie ma.
export function nextOf(list, current) {
    if (!list.length) return null;
    const index = list.indexOf(current);
    return list[(index + 1) % list.length];
}

// Czy to da się położyć na stole jako materiał.
export function isTableMaterial(type) {
    return Boolean(clothFromFiber(type) || clothOf(type) || isGarment(type));
}

// --- Noszenie -------------------------------------------------------------------

// Ile stopni grzeje to, co gracz ma na sobie (equip - 4 stosy albo null).
export function wornWarmth(equip = []) {
    let sum = 0;
    for (const item of equip) sum += garmentInfo(item?.type)?.warmth ?? 0;
    return Math.round(sum * 10) / 10;
}

// Impregnacja lateksem (1.42.0, dary pnia): bryłka lateksu wtarta
// w gotowe ubranie na stole krawieckim. Takie ubranie w wodzie grzeje
// jak suche (zwykłe - tylko w części, game/Warmth.js: WET_CLOTHES).
export const PROOF_ITEM = 'latex';
export const isProof = (item) => isGarment(item?.type) && item?.look?.proof === true;

// Ile z ciepła noszonych ubrań dają te natarte lateksem.
export function proofWarmth(equip = []) {
    let sum = 0;
    for (const item of equip) if (isProof(item)) sum += garmentInfo(item.type)?.warmth ?? 0;
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
