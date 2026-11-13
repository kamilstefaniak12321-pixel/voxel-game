// ------------------------------------------------------------
// KOMENDY GRY - WSPÓLNE POMOCNIKI
//
// Czytanie argumentów (liczby, współrzędne, kolory, godziny, nazwy
// bloków) i rzeczy używane przez komendy z kilku plików. Komendy są
// w plikach *Commands.js obok, lista wszystkich - gameCommands.js.
// ------------------------------------------------------------

import * as THREE from 'three';
import { CommandError, simplify } from './CommandRegistry.js';
import { BLOCK_TYPES, getBlockLabel, blockExists } from '../blocks/BlockRegistry.js';
import { ITEM_TYPES, getItemLabel, itemExists } from '../items/ItemRegistry.js';
import { blockFromWord } from '../world/terrain/rocks.js';
import { TREE_SPECIES } from '../blocks/trees.js';

// ------------------------------------------------------------
// KOMENDY GRY
//
// Każda nowa rzecz w grze powinna dostać tu komendę, którą da
// się ją szybko sprawdzić (patrz docs/komendy.md). Opis budowy
// komendy jest w CommandRegistry.js.
// ------------------------------------------------------------

// --- Pomocnicze ---------------------------------------------

export function usageError(command) {

    return new CommandError(`Użycie: ${command.usage}`);

}


export function parseNumber(text, what = 'liczba') {

    const value = Number(String(text ?? '').replace(',', '.'));

    if (text === undefined || !Number.isFinite(value)) {
        throw new CommandError(`To nie jest ${what}: "${text ?? ''}"`);
    }

    return value;

}


// Współrzędna: liczba albo ~ / ~5 / ~-3 (względem gracza).

export function parseCoordinate(text, current) {

    if (text === undefined) {
        throw new CommandError('Brakuje współrzędnej');
    }

    if (text.startsWith('~')) {
        return current + (text.length > 1 ? parseNumber(text.slice(1), 'współrzędna') : 0);
    }

    return parseNumber(text, 'współrzędna');

}


// Kolory do wpisania nazwą (albo #rrggbb).

export const COLOR_NAMES = {
    czerwony: '#ff3020',
    krwawy: '#c41a10',
    pomaranczowy: '#ff8a20',
    zloty: '#ffc040',
    zolty: '#ffe040',
    zielony: '#40ff60',
    turkusowy: '#30e0d0',
    niebieski: '#3a70ff',
    fioletowy: '#a050ff',
    rozowy: '#ff70c0',
    bialy: '#ffffff'
};

export const DEFAULT_WORDS = ['domyslny', 'default', 'zwykly'];


// Zwraca THREE.Color albo null (= domyślny kolor).

export function parseColor(text) {

    if (text === undefined) {
        throw new CommandError('Podaj kolor, np. czerwony albo #ff3020');
    }

    const name = simplify(text);

    if (DEFAULT_WORDS.includes(name)) {
        return null;
    }

    const hex = COLOR_NAMES[name] ?? text;

    if (!/^#?[0-9a-f]{6}$/i.test(hex)) {

        throw new CommandError(
            `Nieznany kolor "${text}". Wpisz #rrggbb albo: ` +
            `${Object.keys(COLOR_NAMES).join(', ')}, domyslny`
        );

    }

    return new THREE.Color(hex.startsWith('#') ? hex : `#${hex}`);

}


// Polskie nazwy bloków (label) bez ogonków, spacje -> _:
// mak, chaber, paproc, czarnoziem, krotka_trawa, sciolka_lesna...

export const LABEL_WORDS = new Map(
    Object.keys(BLOCK_TYPES).map((type) => [simplify(getBlockLabel(type)).replace(/\s+/g, '_'), type])
);


// Przedmioty (owoce) po polsku: truskawki / truskawka, jezyny / jezyna,
// papryczki_chili / chili / papryczka, orzech_laskowy / orzech / orzechy.

export const ITEM_WORDS = new Map([
    ...Object.keys(ITEM_TYPES).map((type) => [simplify(getItemLabel(type)).replace(/\s+/g, '_'), type]),
    ['truskawka', 'strawberry'],
    ['jezyna', 'blackberry'],
    ['chili', 'chili_pepper'],
    ['papryczka', 'chili_pepper'],
    ['papryczki', 'chili_pepper'],
    ['orzech', 'hazelnut'],
    ['orzechy', 'hazelnut']
]);


export function blockArgument(text) {

    const word = simplify(text ?? '');

    if (['powietrze', 'air', 'nic'].includes(word)) {
        return null;
    }

    // Polskie nazwy też działają: granit, wapien, piaskowiec, trawa,
    // mak, paproc...

    const name = blockFromWord(word) ?? LABEL_WORDS.get(word) ?? word;

    if (!blockExists(name)) {
        throw new CommandError(`Nie ma bloku "${text ?? ''}". Lista: /bloki`);
    }

    return name;

}


export const BLOCK_NAMES = Object.keys(BLOCK_TYPES);


// KOPANIE (/kopanie): czas w sekundach po polsku ("2,2 s").

export function seconds(time) {

    return `${String(Math.round(time * 100) / 100).replace('.', ',')} s`;

}


// Blok albo przedmiot (do ekwipunku: /daj).

export function itemArgument(text) {

    const word = simplify(text ?? '');

    const item = ITEM_WORDS.get(word) ?? word;

    if (itemExists(item)) {
        return item;
    }

    if (!word) {
        return null;
    }

    try {
        return blockArgument(text);
    }
    catch {
        throw new CommandError(`Nie ma bloku ani przedmiotu "${text}". Lista: /bloki`);
    }

}


export const ON_WORDS = ['wl', 'on', 'tak', '1', 'true'];
export const OFF_WORDS = ['wyl', 'off', 'nie', '0', 'false'];


// Liczba z jednym miejscem po przecinku (po polsku: 1,5).

export function decimal(value) {

    return value.toFixed(1).replace('.', ',');

}


export function treeName(species) {

    return TREE_SPECIES[species].short;

}


export function durationText(seconds) {

    if (!Number.isFinite(seconds)) {
        return 'czas stoi';
    }

    if (seconds < 90) {
        return `${Math.round(seconds)} s`;
    }

    if (seconds < 90 * 60) {
        return `${Math.round(seconds / 60)} min`;
    }

    return `${decimal(seconds / 3600)} h`;

}


// Suche miejsce przy wodzie (x, z) - do teleportu nad rzekę albo
// jezioro: najbliższa kolumna bez wody (szukamy coraz dalej).

export function riverBank(generator, x, z) {

    for (let radius = 0; radius <= 96; radius += 2) {

        const count = radius === 0 ? 1 : Math.ceil(2 * Math.PI * radius / 2);

        for (let k = 0; k < count; k++) {

            const angle = 2 * Math.PI * k / count;

            const bx = Math.round(x + Math.cos(angle) * radius);
            const bz = Math.round(z + Math.sin(angle) * radius);

            const sample = generator.compute(bx, bz, 0, {});

            if (sample.water <= sample.height && !sample.ocean) {
                return { x: bx, z: bz };
            }

        }

    }

    return { x, z };

}


export const SHADOW_WORDS = {
    wyl: 0,
    off: 0,
    nie: 0,
    zwykle: 1,
    dokladne: 2,
    dalekie: 3,
    daleko: 3,
    wl: 3,
    on: 3,
    tak: 3
};
