// ------------------------------------------------------------
// PALIWO POCHODNI (1.35.0, decyzja Kamila - docs/drewno.md)
//
// Pochodnie się wypalają. Postawiona pali się TORCH_BURN_SECONDS,
// pod koniec (ostatnie TORCH_DIM_PART) przygasa, a potem zostaje
// ogarek (game/TorchBurn.js). Lampy nie gasną.
//
// Ile paliwa zostało, niesie stos pochodni - to samo pole `fresh`,
// którego używa świeżość jedzenia i wilgotność polan
// (items/freshness.js): 1 - nowa, mniej - nadpalona. Nowa pochodnia pola
// nie ma. Dzięki temu pochodnia zdjęta ze ściany nie odzyskuje paliwa.
//
//   łuczywo (LUCZYWO)   - szczapa żywicznego drewna: podpałka 350°
//                         i krótka pochodnia (LUCZYWO_PART paliwa),
//   ogarek (TORCH_STUB) - wypalona pochodnia; żywica albo oliwki robią
//                         z niego nową (przepis albo PPM na postawionym).
// ------------------------------------------------------------

import { TORCH_VARIANTS } from '../blocks/torches.js';

// Tyle sekund pali się nowa pochodnia (trzy doby gry - godzina).
export const TORCH_BURN_SECONDS = 3600;
// Ostatnia taka część paliwa: pochodnia przygasa (słabsze światło).
export const TORCH_DIM_PART = 0.2;
// Tyle paliwa ma postawione łuczywo (sześć minut).
export const LUCZYWO_PART = 0.1;
export const LUCZYWO = 'luczywo';
export const TORCH_STUB = 'torch_stub';
// Czym dolewa się paliwa (grupa #oil w crafting/recipes.js): żywica i oliwki.
export const TORCH_REFILLS = ['resin', 'olive_oliwki'];

const TORCH_ITEMS = new Set(TORCH_VARIANTS.map((variant) => variant.type));
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));

// Czy stos tej rzeczy niesie paliwo (pochodnia dowolnego koloru).
export const isTorchItem = (type) => TORCH_ITEMS.has(type);

// Ile paliwa ma stos pochodni, 0-1 (1 - nowa albo to nie pochodnia).
export function fuelOf(item) {
    if (!item || !isTorchItem(item.type)) return 1;
    return Number.isFinite(item.fresh) ? clamp01(item.fresh) : 1;
}

// Ile minut (prawdziwych) pali się jeszcze pochodnia o tym paliwie.
export const fuelMinutes = (fuel) => Math.max(0, Math.round(clamp01(fuel) * TORCH_BURN_SECONDS / 60));

// Pasek na ikonce stosu: ile paliwa (null - nowa).
export function fuelBar(item) {
    if (!item || !isTorchItem(item.type)) return null;
    const fuel = fuelOf(item);
    return fuel >= 0.97 ? null : { fresh: Math.max(0.04, fuel), color: `hsl(${Math.round(18 + 22 * fuel)}, 92%, 54%)` };
}

// Opis do podpowiedzi w ekwipunku.
export function fuelNotes(type, item = null) {
    if (isTorchItem(type)) {
        const fuel = fuelOf(item?.type === type ? item : null);
        return fuel >= 0.97 ? [`Pali się ok. ${fuelMinutes(1)} min, pod koniec przygasa`]
            : [`Nadpalona - paliwa na ok. ${Math.max(1, fuelMinutes(fuel))} min`];
    }
    if (type === LUCZYWO) return [`Postawione świeci jak pochodnia przez ok. ${fuelMinutes(LUCZYWO_PART)} min`];
    if (type === TORCH_STUB) return ['Z żywicą albo oliwkami - znów pochodnia'];
    return [];
}
