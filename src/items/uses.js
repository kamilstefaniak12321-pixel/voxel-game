// ------------------------------------------------------------
// DO CZEGO SŁUŻY RZECZ (0.98.1)
//
// Jedna odpowiedź na pytanie "po co mi to?" - dla bloku albo przedmiotu
// zbiera wszystkie zastosowania z gry: przepisy (także przez grupy
// składników), jedzenie i napary, pieczenie, podpałkę, opał, narzędzia,
// sadzenie. Korzystają z tego komenda /rosliny i test
// tools/sprawdz_zastosowania.mjs, który nie przepuszcza przedmiotu
// bez zastosowania.
//
// Nowy rodzaj zastosowania (np. karma dla zwierząt) dopisuje się tutaj -
// wtedy od razu widzą go komendy i test.
// ------------------------------------------------------------

import { RECIPES, GROUPS } from '../crafting/recipes.js';
import { ITEM_TYPES, getItemLabel, getTool } from './ItemRegistry.js';
import { getFood, getRoast, isDrink } from './foods.js';
import { EFFECTS } from './effects.js';
import { TINDERS, fuelWood } from '../game/CampfireState.js';

// Przedmioty, które działają same (nie są składnikiem ani jedzeniem).
const OWN_USES = {
    raft: 'pływanie: PPM na wodzie',
    fire_starter: 'rozpalanie ogniska'
};

function specTypes(spec) {
    return spec.startsWith('#') ? GROUPS[spec.slice(1)]?.types ?? [] : [spec];
}

// Co da się z tego zrobić: nazwy wyników przepisów (bez powtórzeń).
export function craftsFrom(type) {
    const results = [];
    for (const recipe of RECIPES) {
        const specs = [...(recipe.ingredients ?? []), ...Object.values(recipe.key ?? {})];
        if (!specs.some((spec) => specTypes(spec).includes(type))) continue;
        const label = getItemLabel(recipe.result[0]);
        if (!results.includes(label)) results.push(label);
    }
    return results;
}

// Lista zastosowań słowami, np. ['barwnik żółty', 'podpałka (2 razy
// szybsza od trawy)']. Pusta lista - rzecz do niczego nie służy.
export function itemUses(type) {
    const uses = [];
    const food = getFood(type);
    if (food) {
        const effects = food.effects.map((effect) => EFFECTS[effect].label).join(', ');
        uses.push(food.kind === 'drink' ? `napar${effects ? ` (${effects})` : ''}` : 'jedzenie');
    }
    const roasted = getRoast(type);
    if (roasted) uses.push(`${isDrink(roasted) ? 'parzenie' : 'pieczenie'} nad ogniskiem: ${getItemLabel(roasted)}`);
    if (Object.hasOwn(TINDERS, type)) {
        const times = TINDERS[type];
        uses.push(times > 1 ? `podpałka (${String(times).replace('.', ',')} ${Number.isInteger(times) ? 'razy' : 'raza'} szybsza od trawy)` : 'podpałka');
    }
    if (fuelWood(type)) uses.push('opał do ogniska');
    if (getTool(type)) uses.push('narzędzie');
    if (ITEM_TYPES[type]?.plants) uses.push('sadzenie na rozgrzebanej ziemi');
    if (OWN_USES[type]) uses.push(OWN_USES[type]);
    const crafts = craftsFrom(type);
    if (crafts.length > 0) {
        const shown = crafts.slice(0, 5).join(', ');
        uses.push(`przepisy: ${shown}${crafts.length > 5 ? ` i ${crafts.length - 5} innych` : ''}`);
    }
    return uses;
}
