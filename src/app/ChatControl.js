// ------------------------------------------------------------
// CZAT I KOMENDY - STEROWANIE (0.96.0, wydzielone z main.js)
//
// T albo / otwiera czat. Tekst zaczynający się od / to komenda
// (src/commands/). Na czas pisania mysz jest zwolniona, a po
// wysłaniu (Enter) gra wraca do przechwyconej myszy.
//
// main.js trzyma stan gry ('playing', 'chat', 'paused'...) i samą
// grę, więc dostajemy je przez funkcje:
//
//   element      - element czatu na stronie,
//   gameCommands - lista komend do zarejestrowania,
//   input        - klawiatura i mysz gry (czyścimy przy otwarciu),
//   getGame, getState, setState - gra i stan z main.js,
//   context()    - to, czym mogą sterować komendy,
//   resume()     - powrót do gry (przechwycenie myszy),
//   showPause()  - menu pauzy,
//   playError()  - dźwięk błędnej komendy.
//
// Zwraca { chat, commands, openChat, closeChat }.
// ------------------------------------------------------------

import { Chat } from '../ui/Chat.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';

export function createChatControl({ element, gameCommands, input, getGame, getState, setState, context,
    resume, showPause, playError }) {

    const commands = new CommandRegistry();

    for (const command of gameCommands) {
        commands.register(command);
    }


    function openChat(prefix) {

        if (!getGame() || getState() !== 'playing') {
            return;
        }


        setState('chat');

        input.reset();

        chat.open(prefix);

        document.exitPointerLock();

    }


    // relock = true: wracamy od razu do gry (przechwytujemy mysz),
    // false: pokazujemy menu pauzy.

    function closeChat(relock = true) {

        if (getState() !== 'chat') {
            return;
        }


        chat.close();

        setState('paused');


        if (relock) {
            resume();
        }
        else {
            showPause();
        }

    }


    function submitChat(text) {

        const game = getGame();

        if (text.startsWith('/')) {

            chat.print(text, 'command');

            const result = commands.execute(text.slice(1), context());

            if (result.text) {
                chat.print(result.text, result.ok ? 'success' : 'error');
            }

            if (!result.ok) {
                playError();
            }

        }
        else if (text && game?.net) {

            // Gra ze znajomymi: wiadomość do wszystkich (wraca przez onChat).

            game.net.chatLine(text);

        }
        else if (text) {

            chat.print(text, 'player');

        }


        closeChat();

    }


    const chat = new Chat(element, {

        submit: submitChat,

        // ESC: przeglądarka nie pozwala po nim od razu przechwycić
        // myszy, więc zamiast tego pokazujemy menu pauzy.
        cancel: () => closeChat(false),

        complete: (text) => (getGame() ? commands.complete(text, context()) : []),

        // Opis komendy z wpisanego tekstu (do podpowiedzi nad polem).

        describe: (text) => {

            const command = commands.find(text.trim().split(/\s+/)[0] ?? '');

            return command
                ? { usage: `Użycie: ${command.usage}`, description: command.description }
                : null;

        }

    });

    return { chat, commands, openChat, closeChat };

}
