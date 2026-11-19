// ------------------------------------------------------------
// PSUCIE SIĘ JEDZENIA (1.23.0) - zasady i liczby
//
// Świeże jedzenie się psuje - tym szybciej, im cieplej. Nie ma "daty
// ważności" każdej sztuki: co godzinę gry każda sztuka psującego się
// jedzenia ma małą szansę, że się zepsuje. Stos topnieje więc powoli,
// a dwa stosy tego samego jedzenia łączą się bez żadnych rachunków.
//
// HALF_LIFE - po ilu dobach gry z danego jedzenia zostaje połowa
// (w plecaku, przy 15°C). Czego tu nie ma, to się nie psuje: suszone
// owoce, orzechy, żołędzie, pestki, cała dynia, napary.
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
// Zepsute jedzenie zamienia się w kompost (COMPOST) - nie da się go
// zjeść, ale użyźnia ziemię: PPM na ziemi albo trawie robi z niej
// czarnoziem. Zepsuta potrawa oddaje miskę.
//
// Kto i kiedy to liczy: game/Spoilage.js.
// ------------------------------------------------------------

import { FOODS } from './foods.js';
import { ingredientKind } from './cooking.js';

export const COMPOST = 'compost';

// Połowa znika po tylu dobach gry (plecak, 15°C).
const HALF_LIFE_DAYS = {
    // Miękkie owoce i jadalne kwiaty.
    soft: 3,
    // Twarde owoce i warzywa.
    firm: 7,
    // Pieczone.
    roasted: 4,
    // Potrawy z garnka.
    dish: 2
};

// Twarde owoce i warzywa (reszta surowych owoców jest miękka).
const FIRM = new Set(['jablon_jablko', 'coconut_palm_kokos', 'baobab_fruit', 'olive_oliwki', 'chili_pepper', 'pumpkin_slice', 'zucchini']);

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

// Po ilu dobach gry zostaje połowa (plecak, 15°C); Infinity - nigdy.
export function halfLifeDays(type) {
    const kind = spoilKind(type);
    return kind ? HALF_LIFE_DAYS[kind] : Infinity;
}

// Mnożnik tempa psucia dla temperatury (°C).
export function temperatureFactor(temperature) {
    if (!Number.isFinite(temperature)) return 1;
    if (temperature <= 0) return FROZEN;
    return Math.min(4, Math.max(FROZEN, 2 ** ((temperature - 15) / 10)));
}

// Szansa, że jedna sztuka zepsuje się w ciągu `days` dób gry.
// place: 'pack' (plecak), 'chest', 'cellar'.
export function spoilChance(type, days, temperature = 15, place = 'pack') {
    const half = halfLifeDays(type);
    if (!Number.isFinite(half) || !(days > 0)) return 0;
    const cellar = place === 'cellar';
    const factor = temperatureFactor(cellar ? Math.min(temperature, CELLAR_TEMPERATURE) : temperature) *
        (place === 'pack' ? 1 : CHEST) * (cellar ? CELLAR : 1);
    return 1 - 0.5 ** (days * factor / half);
}

// Ile sztuk z `count` się zepsuje przy szansie `chance` na sztukę.
export function spoiledCount(count, chance, random = Math.random) {
    if (!(chance > 0) || count <= 0) return 0;
    let spoiled = 0;
    for (let i = 0; i < count; i++) if (random() < chance) spoiled++;
    return spoiled;
}

// Opis słowami do okna statusu i komend.
export function spoilText(type) {
    const kind = spoilKind(type);
    if (!kind) return Object.hasOwn(FOODS, type ?? '') ? 'nie psuje się' : '';
    return { soft: 'psuje się szybko', firm: 'psuje się powoli', roasted: 'psuje się dość szybko', dish: 'psuje się bardzo szybko - zjedz w dzień lub dwa' }[kind];
}
