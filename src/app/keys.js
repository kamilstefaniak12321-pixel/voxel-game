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
// Nowy klawisz dopisz do tabeli KEYS i do README (sterowanie).
// Wywołaj installGameKeys przed utworzeniem ekranu ekwipunku - on też
// nasłuchuje klawisza E (zamyka nim), a to samo wciśnięcie nie może
// go od razu zamknąć.
// ------------------------------------------------------------

// Klawisz -> akcja (nazwa z actions). stop: to wciśnięcie nie idzie
// dalej; prevent: bez domyślnego działania przeglądarki.
const KEYS = {
    KeyE: { action: 'inventory', prevent: true, stop: true },
    KeyL: { action: 'achievements', prevent: true },
    KeyC: { action: 'status' },
    KeyM: { action: 'map' }
};

// Otwierają czat; T zaczyna pusty tekst, reszta - komendę.
const CHAT_KEYS = ['KeyT', 'Slash', 'NumpadDivide'];

export function installGameKeys({ getState, getGame, isTouch, actions }) {

    window.addEventListener('keydown', (event) => {

        const playing = getState() === 'playing';
        const key = KEYS[event.code];

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


        if (playing && !event.repeat && CHAT_KEYS.includes(event.code)) {

            // Bez tego litera "t" trafiłaby do pola czatu.

            event.preventDefault();

            actions.chat(event.code === 'KeyT' ? '' : '/');

        }

    });


    // F3 w przeglądarce otwiera wyszukiwanie - w grze go blokujemy.
    // F5 w grze zmienia widok kamery (zamiast odświeżać stronę).

    window.addEventListener('keydown', (event) => {

        if ((event.code === 'F8' || event.key === 'F8') && !event.repeat && getGame()) {
            event.preventDefault();
            actions.markProblem();
        }

        if (event.code === 'F3') {
            event.preventDefault();
        }

        if (event.code === 'F5' && getState() === 'playing') {
            event.preventDefault();
        }

    });

}
