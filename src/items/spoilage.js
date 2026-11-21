// ------------------------------------------------------------
// PSUCIE SIĘ JEDZENIA (1.23.0; świeżość stosów od 1.24.0) - zasady i liczby
//
// Świeże jedzenie się psuje - tym szybciej, im cieplej. Każdy stos ma
// swoją świeżość (items/freshness.js): od 1 (świeże) do 0. Gdy spadnie
// do zera, cały stos zamienia się w kompost - w tym samym miejscu, więc
// nic nie ginie. Zepsuta potrawa to "kompost w misce": PPM wysypuje
// kompost i oddaje miskę.
//
// SHELF_DAYS - ile dób gry leży dane jedzenie (w plecaku, przy 15°C).
// Czego tu nie ma, to się nie psuje: suszone owoce, orzechy, żołędzie,
// pestki, cała dynia, napary.
//
// Mnożniki (im mniej, tym wolniej się psuje):
//   temperatura - dwa razy szybciej na każde 10°C powyżej 15°C i dwa
//                 razy wolniej na każde 10°C poniżej; na mrozie jedzenie
//                 prawie się nie psuje (FROZEN),
//   skrzynia    - CHEST,
//   piwniczka   - skrzynia, nad którą nie widać nieba (pod dachem, pod
//                 ziemią): jeszcze CELLAR; w piwniczce jest też chłodniej
//                 latem (nie więcej niż CELLAR_TEMPERATURE).
//
// Kompost użyźnia ziemię: blocks/fertilizers.js.
// Kto i kiedy to liczy: game/Spoilage.js.
// ------------------------------------------------------------

import { FOODS } from './foods.js';
import { ingredientKind } from './cooking.js';

export const COMPOST = 'compost';

// Zepsuta potrawa: kompost w misce (PPM - kompost i miska osobno).
export const COMPOST_BOWL = 'compost_bowl';

// Tyle dób gry leży jedzenie (plecak, 15°C).
const SHELF_DAYS = {
    // Miękkie owoce i jadalne kwiaty.
    soft: 5,
    // Twarde owoce i warzywa.
    firm: 12,
    // Pieczone.
    roasted: 6,
    // Potrawy z garnka.
    dish: 3
};

// Twarde owoce i warzywa (reszta surowych owoców jest miękka).
const FIRM = new Set(['jablon_jablko', 'coconut_palm_kokos', 'baobab_fruit', 'olive_oliwki', 'chili_pepper', 'pumpkin_slice', 'zucchini', 'kiwi']);

// Nie psują się, choć są surowymi przekąskami.
// (Prażone orzechy i żołędzie też leżą długo.)
const KEEPS = new Set(['dried_fruit', 'pumpkin_seeds', 'roasted_hazelnut', 'roasted_beechnuts', 'roasted_acorn']);

export const CHEST = 0.5;
export const CELLAR = 0.5;
export const CELLAR_TEMPERATURE = 10;
export const FROZEN = 0.05;

// Rodzaj psucia się ('soft', 'firm', 'roasted', 'dish') albo null -
// to się nie psuje.
export function spoilKind(type) {
    const food = Object.hasOwn(FOODS, type ?? '') ? FOODS[type] : null;
    if (!food || KEEPS.has(type)) return null;
    if (food.kind === 'drink') return null;
    if (type.startsWith('dish_')) return 'dish';
    if (food.kind === 'meal') return 'roasted';
    const kind = ingredientKind(type);
    if (kind === 'nut' || kind === null) return null;
    return FIRM.has(type) ? 'firm' : 'soft';
}

export const isPerishable = (type) => spoilKind(type) !== null;

// Ile dób gry leży to jedzenie (plecak, 15°C); Infinity - nie psuje się.
export function shelfDays(type) {
    const kind = spoilKind(type);
    return kind ? SHELF_DAYS[kind] : Infinity;
}

// Mnożnik tempa psucia dla temperatury (°C).
export function temperatureFactor(temperature) {
    if (!Number.isFinite(temperature)) return 1;
    if (temperature <= 0) return FROZEN;
    return Math.min(4, Math.max(FROZEN, 2 ** ((temperature - 15) / 10)));
}

// Mnożnik tempa psucia dla miejsca i temperatury.
// place: 'pack' (plecak, ziemia), 'chest', 'cellar'.
export function spoilFactor(temperature = 15, place = 'pack') {
    const cellar = place === 'cellar';
    return temperatureFactor(cellar ? Math.min(temperature, CELLAR_TEMPERATURE) : temperature) *
        (place === 'pack' ? 1 : CHEST) * (cellar ? CELLAR : 1);
}

// Ile świeżości (0-1) ubywa temu jedzeniu przez `days` dób gry.
export function freshLoss(type, days, temperature = 15, place = 'pack') {
    const shelf = shelfDays(type);
    if (!Number.isFinite(shelf) || !(days > 0)) return 0;
    return days * spoilFactor(temperature, place) / shelf;
}

// Ile dób gry poleży jeszcze jedzenie o świeżości `fresh` w tych
// warunkach; Infinity - nie psuje się.
export function daysLeft(type, fresh = 1, temperature = 15, place = 'pack') {
    const shelf = shelfDays(type);
    if (!Number.isFinite(shelf)) return Infinity;
    return Math.max(0, fresh) * shelf / spoilFactor(temperature, place);
}

// W co zamienia się zepsute jedzenie.
export function spoilsInto(type) {
    return spoilKind(type) === 'dish' ? COMPOST_BOWL : COMPOST;
}

// "ok. 3 dni", "ok. 5 godzin" - czas gry słowami.
export function daysText(days) {
    if (!Number.isFinite(days)) return 'bardzo długo';
    if (days >= 20) return 'ponad 20 dni';
    if (days >= 1.5) {
        const n = Math.round(days);
        return `ok. ${n} ${n === 1 ? 'dzień' : 'dni'}`;
    }
    const hours = Math.max(1, Math.round(days * 24));
    if (hours >= 24) return 'ok. 1 dzień';
    const last = hours % 10, teens = hours % 100;
    return `ok. ${hours} ${hours === 1 ? 'godzinę' : last >= 2 && last <= 4 && (teens < 12 || teens > 14) ? 'godziny' : 'godzin'}`;
}

// Opis stosu: ile jeszcze poleży ("świeże jeszcze ok. 3 dni") albo ''.
export function freshText(item, temperature = 15, place = 'pack') {
    if (!item || !isPerishable(item.type)) return '';
    const fresh = Number.isFinite(item.fresh) ? item.fresh : 1;
    const left = daysText(daysLeft(item.type, fresh, temperature, place));
    const state = fresh > 0.66 ? 'świeże' : fresh > 0.33 ? 'nadal dobre' : 'zaraz się zepsuje';
    return `${state} - zepsuje się za ${left}`;
}

// Opis słowami do okna statusu i komend.
export function spoilText(type) {
    const kind = spoilKind(type);
    if (!kind) return Object.hasOwn(FOODS, type ?? '') ? 'nie psuje się' : '';
    return { soft: 'psuje się szybko', firm: 'psuje się powoli', roasted: 'psuje się dość szybko', dish: 'psuje się bardzo szybko - zjedz w dwa, trzy dni' }[kind];
}
