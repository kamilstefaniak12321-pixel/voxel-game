// ------------------------------------------------------------
// KLAWISZE W GRZE (0.96.0, wydzielone z main.js)
//
// Klawisze, które otwierają okna i ekrany. Ruch, skok, pasek bloków
// i jedzenie (F) czyta sama gra z InputManager - tutaj są tylko te,
// które zmieniają stan aplikacji:
//
//   E - ekwipunek            L - księga osiągnięć
//   C - okno statusu         M - mapa terenu
//   T, / - czat              Esc - pauza (tylko telefon z klawiaturą)
//   F8 - zaznacz problem w diagnostyce
//   F3, F5 - blokada skrótów przeglądarki (szukanie, odświeżanie)
//
// Od 0.99.0 gracz może przypisać czynności inne klawisze albo przyciski
// myszy (input/bindings.js): wciśnięcie jest tu najpierw tłumaczone na
// domyślny kod czynności (bindings.logical), a czynność przypisana do
// przycisku myszy przychodzi przez onMouseKey (InputManager).
//
// Nowy klawisz dopisz do tabeli KEYS, do ACTIONS w input/bindings.js
// i do README (sterowanie).
// Wywołaj installGameKeys przed utworzeniem ekranu ekwipunku - on też
// nasłuchuje klawisza E (zamyka nim), a to samo wciśnięcie nie może
// go od razu zamknąć.
// ------------------------------------------------------------

import { bindings } from '../input/bindings.js';

// Klawisz -> akcja (nazwa z actions). stop: to wciśnięcie nie idzie
// dalej; prevent: bez domyślnego działania przeglądarki.
const KEYS = {
    KeyE: { action: 'inventory', prevent: true, stop: true },
    KeyL: { action: 'achievements', prevent: true },
    KeyC: { action: 'status' },
    KeyM: { action: 'map' }
};

// Otwierają czat; T zaczyna pusty tekst, / - komendę.
const CHAT_KEYS = ['KeyT', 'Slash'];

export function installGameKeys({ getState, getGame, isTouch, actions, input = null }) {

    // Czynność okna przypisana do przycisku myszy (np. boczny przycisk
    // otwiera ekwipunek).

    if (input) {

        input.onMouseKey = (code) => {

            if (getState() !== 'playing') return;

            if (KEYS[code]) actions[KEYS[code].action]();
            else if (CHAT_KEYS.includes(code)) actions.chat(code === 'KeyT' ? '' : '/');

        };

    }

    window.addEventListener('keydown', (event) => {

        const playing = getState() === 'playing';
        const code = bindings.logical(event.code);
        const key = KEYS[code];

        if (playing && !event.repeat && key) {

            if (key.prevent) event.preventDefault();
            if (key.stop) event.stopImmediatePropagation();

            actions[key.action]();

            return;

        }


        // Telefon z klawiaturą (np. na Bluetooth): ESC - pauza (bez
        // przechwyconej myszy nie zrobi jej przeglądarka).

        if (isTouch() && playing && event.code === 'Escape') {

            actions.pause();

            return;

        }


        if (playing && !event.repeat && CHAT_KEYS.includes(code)) {

            // Bez tego litera "t" trafiłaby do pola czatu.

            event.preventDefault();

            actions.chat(code === 'KeyT' ? '' : '/');

        }

    });


    // F3 w przeglądarce otwiera wyszukiwanie - w grze go blokujemy.
    // F5 w grze zmienia widok kamery (zamiast odświeżać stronę).

    window.addEventListener('keydown', (event) => {

        if ((event.code === 'F8' || event.key === 'F8') && !event.repeat && getGame()) {
            event.preventDefault();
            actions.markProblem();
        }

        // (Także wtedy, gdy gracz przypisał te czynności innym klawiszom -
        // samo F3 i F5 dalej nie może szukać ani odświeżać strony.)

        const code = bindings.logical(event.code);

        if (event.code === 'F3' || code === 'F3') {
            event.preventDefault();
        }

        if ((event.code === 'F5' || code === 'F5') && getState() === 'playing') {
            event.preventDefault();
        }

    });

}
