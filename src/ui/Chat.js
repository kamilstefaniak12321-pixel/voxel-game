// ------------------------------------------------------------
// CZAT
//
// Okienko w lewym dolnym rogu: lista wiadomości i pole do pisania.
//   T albo /     - otwiera czat (main.js)
//   Enter        - wysyła (tekst zaczynający się od / to komenda)
//   ESC          - zamyka bez wysyłania
//   strzałki ↑ ↓ - poprzednie wpisy
//   Tab          - podpowiada nazwę komendy i jej opcje
//
// Gdy czat jest zamknięty, nowe wiadomości są widoczne przez
// kilka sekund i znikają. Wygląd: src/ui/hud.css i zmienne
// --chat-... w motywie (assets/ui/themes/<motyw>/theme.css).
// ------------------------------------------------------------

// Jak długo widać wiadomość przy zamkniętym czacie (milisekundy).

const MESSAGE_VISIBLE_MS = 10000;

// Ile wiadomości pamiętamy.

const MAX_LINES = 100;

const MAX_HISTORY = 50;


export class Chat {

    // root     - element <div id="chat">
    // handlers - { submit(text), cancel(), complete(text) -> lista }

    constructor(root, handlers) {

        this.root = root;
        this.handlers = handlers;

        this.log = root.querySelector('.chat-log');
        this.input = root.querySelector('.chat-input');

        this.isOpen = false;


        // Poprzednie wpisy (strzałki ↑ ↓).

        this.history = [];
        this.historyIndex = 0;


        this.input.addEventListener('keydown', (event) => this.onKeyDown(event));

    }


    open(prefix = '') {

        this.isOpen = true;

        this.root.classList.add('open');

        this.input.value = prefix;

        this.historyIndex = this.history.length;

        this.input.focus();

        this.log.scrollTop = this.log.scrollHeight;

    }


    close() {

        this.isOpen = false;

        this.root.classList.remove('open');

        this.input.blur();

    }


    // Dodaje wiadomość. type: 'info', 'success', 'error', 'hint',
    // 'command' (wpisana komenda) albo 'player' (zwykły tekst).
    // Tekst może mieć kilka linii (\n).

    print(text, type = 'info') {

        const now = performance.now();

        for (const lineText of String(text).split('\n')) {

            const line = document.createElement('div');

            line.className = `chat-line ${type}`;

            // textContent - tekst nigdy nie jest traktowany jak HTML.

            line.textContent = lineText;

            line.dataset.time = String(now);

            this.log.appendChild(line);

        }


        while (this.log.children.length > MAX_LINES) {
            this.log.firstChild.remove();
        }


        this.log.scrollTop = this.log.scrollHeight;

    }


    clear() {

        this.log.replaceChildren();

    }


    // Co klatkę: stare wiadomości chowają się (gdy czat zamknięty).

    update() {

        const now = performance.now();

        for (const line of this.log.children) {

            const old = now - Number(line.dataset.time) > MESSAGE_VISIBLE_MS;

            if (old !== line.classList.contains('faded')) {
                line.classList.toggle('faded', old);
            }

        }

    }

    // --------------------------------------------------------

    onKeyDown(event) {

        // Klawisze w polu czatu nie sterują grą.

        event.stopPropagation();


        switch (event.key) {

            case 'Enter': {

                event.preventDefault();

                const text = this.input.value.trim();

                if (text && this.history[this.history.length - 1] !== text) {

                    this.history.push(text);

                    if (this.history.length > MAX_HISTORY) {
                        this.history.shift();
                    }

                }

                this.handlers.submit(text);

                break;

            }

            case 'Escape': {

                event.preventDefault();

                this.handlers.cancel();

                break;

            }

            case 'ArrowUp':
            case 'ArrowDown': {

                event.preventDefault();

                if (this.history.length === 0) {
                    break;
                }

                const step = event.key === 'ArrowUp' ? -1 : 1;

                this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + step));

                this.input.value = this.history[this.historyIndex] ?? '';

                break;

            }

            case 'Tab': {

                event.preventDefault();

                this.completeInput();

                break;

            }

        }

    }


    // Tab: jedna pasująca podpowiedź - wstawiamy ją; kilka -
    // uzupełniamy wspólny początek i pokazujemy listę.

    completeInput() {

        const value = this.input.value;

        if (!value.startsWith('/')) {
            return;
        }


        const options = this.handlers.complete(value.slice(1));

        if (options.length === 0) {
            return;
        }


        if (options.length === 1) {

            this.input.value = `/${options[0]} `;

            return;

        }


        let common = options[0];

        for (const option of options) {

            while (!option.startsWith(common)) {
                common = common.slice(0, -1);
            }

        }

        if (common.length > value.length - 1) {
            this.input.value = `/${common}`;
        }


        const words = options.map((option) => option.split(' ').pop());

        this.print(words.join('  '), 'hint');

    }

}
