import { MOON_CYCLE_DAYS, MOON_START_PHASE, SEASON_MOONS, FIRST_SEASON } from '../config.js';

// ------------------------------------------------------------
// PORY ROKU (1.4.0) - kalendarz gry. Opis zasad: docs/pory-roku.md.
//
// Wszystko wynika z jednej liczby - czasu gry w dobach (game.time.days,
// ta sama, z której liczy się słońce i księżyc):
//
//   miesiąc    = jeden cykl księżyca (MOON_CYCLE_DAYS dób, nów -> nów),
//   pora roku  = SEASON_MOONS miesięcy; zaczyna się w nowiu, a pełnia
//                wypada w jej środku,
//   rok        = cztery pory: wiosna, lato, jesień, zima.
//
// Nowy świat zaczyna się tuż przed pełnią (MOON_START_PHASE), więc
// w środku pierwszej pory (FIRST_SEASON - wiosna).
//
// Ten plik niczego nie rysuje ani nie zmienia - tylko odpowiada na
// pytanie "jaka jest pora". Co od pory zależy (kwiaty, a w przyszłości
// kolory liści, śnieg, pogoda), pyta tutaj:
//   seasonAt(days)       - która pora, który dzień, jaki postęp,
//   seasonWeights(days)  - płynne udziały czterech pór (do mieszania
//                          kolorów bez skoku na granicy pór),
//   yearPosition(days)   - miejsce w roku w dobach (0 = początek wiosny).
// Bez stanu i bez zapisu: istniejące światy mają porę od razu.
// ------------------------------------------------------------

export const SEASONS = ['wiosna', 'lato', 'jesien', 'zima'];

export const SEASON_NAMES = { wiosna: 'wiosna', lato: 'lato', jesien: 'jesień', zima: 'zima' };

// Ile dób trwa pora roku i cały rok.
export const SEASON_DAYS = MOON_CYCLE_DAYS * SEASON_MOONS;
export const YEAR_DAYS = SEASON_DAYS * SEASONS.length;

// Czas gry (doby) pierwszego nowiu roku zerowego: początek pory
// FIRST_SEASON przesunięty tak, żeby rok zaczynał się wiosną.
const ORIGIN = -MOON_CYCLE_DAYS * MOON_START_PHASE - FIRST_SEASON * SEASON_DAYS;

const mod = (value, size) => ((value % size) + size) % size;


// Miejsce w roku w dobach: 0 = początek wiosny, YEAR_DAYS = koniec zimy.

export function yearPosition(days) {
    return mod(days - ORIGIN, YEAR_DAYS);
}


// Pora w chwili `days`:
//   index 0-3, key ('wiosna'...), name (z polskimi znakami),
//   progress 0..1 (postęp pory), day (dzień pory od 1), days (ile dób
//   trwa pora), year (rok od 1; rok zaczyna się wiosną),
//   start, end - czas gry początku i końca tej pory (doby).

export function seasonAt(days) {

    const position = yearPosition(days);
    const index = Math.min(SEASONS.length - 1, Math.floor(position / SEASON_DAYS));
    const inside = position - index * SEASON_DAYS;
    const start = days - inside;

    return {
        index,
        key: SEASONS[index],
        name: SEASON_NAMES[SEASONS[index]],
        progress: inside / SEASON_DAYS,
        day: Math.floor(inside) + 1,
        days: SEASON_DAYS,
        year: Math.floor((days - ORIGIN) / YEAR_DAYS) + 1,
        start,
        end: start + SEASON_DAYS
    };

}


// Numer pory ze słowa ('wiosna', 'jesień', 'jesien'...) albo -1.

export function seasonIndex(word) {

    const text = String(word ?? '').trim().toLowerCase().replace('ń', 'n');

    return SEASONS.indexOf(text);

}


// Czas gry najbliższego początku pory `index` nie wcześniej niż `days`.

export function nextSeasonStart(index, days) {

    const position = yearPosition(days);

    return days + mod(index * SEASON_DAYS - position, YEAR_DAYS);

}


// Płynne udziały czterech pór (suma 1) - do rzeczy, które mają
// przechodzić łagodnie (kolory liści, trawy, światła). W środku pory
// liczy się tylko ona; przez `blendDays` dób wokół granicy pory mieszają
// się dwie sąsiednie.

export function seasonWeights(days, blendDays = 2, out = [0, 0, 0, 0]) {

    const position = yearPosition(days);
    const index = Math.min(SEASONS.length - 1, Math.floor(position / SEASON_DAYS));
    const inside = position - index * SEASON_DAYS;
    const half = Math.min(blendDays, SEASON_DAYS) / 2;

    out[0] = out[1] = out[2] = out[3] = 0;
    out[index] = 1;

    if (half > 0 && inside < half) {
        const share = 0.5 - inside / (2 * half);
        out[index] = 1 - share;
        out[(index + 3) % 4] = share;
    }
    else if (half > 0 && inside > SEASON_DAYS - half) {
        const share = 0.5 - (SEASON_DAYS - inside) / (2 * half);
        out[index] = 1 - share;
        out[(index + 1) % 4] = share;
    }

    return out;

}
