import {
    DAY_LENGTH_MINUTES,
    START_TIME_OF_DAY
} from '../config.js';

// ------------------------------------------------------------
// CZAS ŚWIATA
//
// Czas to jedna liczba: ile dni minęło od powstania świata.
//   część całkowita   - numer dnia (0, 1, 2...)
//   część ułamkowa    - pora dnia: 0 = północ, 0.25 = 6:00,
//                       0.5 = południe, 0.75 = 18:00
//
// Np. 3.5 = czwarty dzień, południe.
//
// Wszystko na niebie (słońce, księżyc, gwiazdy, kolory) liczy się
// z tej jednej liczby, więc po wczytaniu świata niebo jest
// dokładnie takie, jak przy wyjściu. Czas zapisuje się razem
// ze światem (worldInfo.time).
// ------------------------------------------------------------

export class WorldTime {

    // saved - zapisany czas (liczba dni) albo undefined dla nowego świata

    constructor(saved) {

        this.days =
            Number.isFinite(saved) && saved >= 0
                ? saved
                : START_TIME_OF_DAY;


        // Ile razy szybciej niż normalnie płynie czas
        // (0 = czas stoi; przyda się np. przy spaniu w łóżku).

        this.speed = 1;

    }


    // Wywoływane co klatkę (dt w sekundach).

    update(dt) {

        this.days += dt * this.speed / (DAY_LENGTH_MINUTES * 60);

    }


    // Numer dnia, licząc od 1 (do wyświetlania).

    get dayNumber() {

        return Math.floor(this.days) + 1;

    }


    // Pora dnia: 0 - 1 (0 = północ, 0.5 = południe).

    get timeOfDay() {

        return this.days - Math.floor(this.days);

    }


    // Przesuwa czas o podaną liczbę godzin (może być ujemna).

    addHours(hours) {

        this.days = Math.max(0, this.days + hours / 24);

    }


    // Godzina jako tekst, np. "07:12".

    formatClock() {

        const minutes = Math.floor(this.timeOfDay * 24 * 60);

        const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
        const mm = String(minutes % 60).padStart(2, '0');

        return `${hh}:${mm}`;

    }


    // Do zapisu.

    getState() {

        return this.days;

    }

}
