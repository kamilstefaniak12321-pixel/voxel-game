// ------------------------------------------------------------
// CZAT
//
// Okienko w lewym dolnym rogu: lista wiadomości i pole do pisania.
//   T albo /     - otwiera czat (main.js)
//   Enter        - wysyła (tekst zaczynający się od / to komenda)
//   ESC          - zamyka bez wysyłania
//   strzałki ↑ ↓ - poprzednie wpisy (albo wybór podpowiedzi)
//   Tab          - wstawia wybraną podpowiedź
//
// W trakcie pisania komendy nad polem pojawia się lista pasujących
// komend albo opcji (z opisem), a w polu szary dopisek pierwszej
// z nich - Tab go wstawia. Nad listą jest sposób użycia komendy.
//
// Gdy czat jest zamknięty, nowe wiadomości są widoczne przez
// kilka sekund i znikają. Wygląd: src/ui/hud.css i zmienne
// --chat-... w motywie (assets/ui/themes/<motyw>/theme.css).
// ------------------------------------------------------------

// Jak długo widać wiadomość przy zamkniętym czacie (milisekundy).

const MESSAGE_VISIBLE_MS = 10000;

// Ile wiadomości pamiętamy.

const MAX_LINES = 100;

// Ile podpowiedzi widać naraz.

const MAX_SUGGESTIONS = 8;

const MAX_HISTORY = 50;


export class Chat {

    // root     - element <div id="chat">
    // handlers - {
    //     submit(text), cancel(),
    //     complete(text) -> lista pełnych linii (bez ukośnika),
    //     describe(text) -> { usage, description } komendy z tekstu albo null
    // }

    constructor(root, handlers) {

        this.root = root;
        this.handlers = handlers;

        this.log = root.querySelector('.chat-log');
        this.input = root.querySelector('.chat-input');

        this.isOpen = false;


        // Poprzednie wpisy (strzałki ↑ ↓). browsingHistory = ostatnio
        // strzałki przewijały historię (wtedy dalej ją przewijają).

        this.history = [];
        this.historyIndex = 0;
        this.browsingHistory = false;


        // Podpowiedzi: lista nad polem, sposób użycia komendy i szary
        // dopisek w samym polu (warstwa pod przezroczystym tłem pola).

        this.suggestions = [];
        this.selected = 0;

        this.usageElement = document.createElement('div');
        this.usageElement.className = 'chat-usage';

        this.suggestionList = document.createElement('div');
        this.suggestionList.className = 'chat-suggestions';

        const row = document.createElement('div');
        row.className = 'chat-input-row';

        this.ghost = document.createElement('div');
        this.ghost.className = 'chat-ghost';

        this.ghostTyped = document.createElement('span');
        this.ghostTyped.className = 'chat-ghost-typed';

        this.ghostRest = document.createElement('span');
        this.ghostRest.className = 'chat-ghost-rest';

        this.ghost.append(this.ghostTyped, this.ghostRest);

        this.input.replaceWith(row);
        row.append(this.ghost, this.input);

        row.before(this.usageElement, this.suggestionList);


        this.input.addEventListener('keydown', (event) => this.onKeyDown(event));

        this.input.addEventListener('input', () => {
            this.browsingHistory = false;
            this.updateSuggestions();
        });

        this.input.addEventListener('scroll', () => this.updateGhost());

    }


    open(prefix = '') {

        this.isOpen = true;

        this.root.classList.add('open');

        this.input.value = prefix;

        this.historyIndex = this.history.length;

        this.browsingHistory = false;

        this.updateSuggestions();

        this.input.focus();

        this.log.scrollTop = this.log.scrollHeight;

    }


    close() {

        this.isOpen = false;

        this.root.classList.remove('open');

        this.input.blur();

        this.setSuggestions([]);

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

                const step = event.key === 'ArrowUp' ? -1 : 1;


                // Lista podpowiedzi (gdy coś już wpisano, a nie
                // przewijamy właśnie historii) - wybór podpowiedzi.

                if (
                    this.suggestions.length > 1 &&
                    this.input.value.length > 1 &&
                    !this.browsingHistory
                ) {

                    const count = this.suggestions.length;

                    this.selected = (this.selected + step + count) % count;

                    this.renderSuggestions();

                    break;

                }


                if (this.history.length === 0) {
                    break;
                }

                this.browsingHistory = true;

                this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + step));

                this.input.value = this.history[this.historyIndex] ?? '';

                this.updateSuggestions();

                break;

            }

            case 'Tab': {

                event.preventDefault();

                this.acceptSuggestion();

                break;

            }

        }

    }

    // --------------------------------------------------------
    // PODPOWIEDZI
    // --------------------------------------------------------

    // Liczy podpowiedzi dla tego, co jest wpisane w polu.

    updateSuggestions() {

        const value = this.input.value;

        if (!value.startsWith('/')) {

            this.setSuggestions([]);
            this.showUsage(null);

            return;

        }


        const line = value.slice(1);

        const options = this.handlers.complete(line)

            // Podpowiedź identyczna z wpisanym tekstem niczego nie dopisze.

            .filter((option) => option.toLowerCase() !== line.toLowerCase().trimEnd() || line.endsWith(' '));


        this.setSuggestions(options);


        // Sposób użycia: gdy wpisana jest już nazwa komendy.

        this.showUsage(line.includes(' ') ? this.handlers.describe?.(line) : null);

    }


    setSuggestions(options) {

        this.suggestions = options;

        this.selected = 0;

        this.renderSuggestions();

    }


    showUsage(info) {

        this.usageElement.textContent = info ? info.usage : '';

        this.usageElement.hidden = !info;

    }


    // Rysuje listę (najwyżej MAX_SUGGESTIONS wokół wybranej) i dopisek.

    renderSuggestions() {

        const list = this.suggestionList;

        list.replaceChildren();


        const count = this.suggestions.length;

        list.hidden = count === 0;


        const first = Math.max(0, Math.min(this.selected - 3, count - MAX_SUGGESTIONS));

        const value = this.input.value.slice(1);

        const naming = !value.includes(' ');


        for (let i = first; i < Math.min(count, first + MAX_SUGGESTIONS); i++) {

            const option = this.suggestions[i];

            const item = document.createElement('div');

            item.className = 'chat-suggestion' + (i === this.selected ? ' selected' : '');

            item.textContent = naming ? `/${option}` : option.split(' ').pop();


            // Przy nazwach komend - krótki opis obok.

            const info = naming ? this.handlers.describe?.(option) : null;

            if (info) {

                const description = document.createElement('span');

                description.className = 'chat-suggestion-description';
                description.textContent = info.description;

                item.append(description);

            }


            item.addEventListener('mousedown', (event) => {

                event.preventDefault();

                this.selected = i;

                this.acceptSuggestion();

            });

            list.append(item);

        }


        if (count > MAX_SUGGESTIONS) {

            const more = document.createElement('div');

            more.className = 'chat-suggestion more';
            more.textContent = `${this.selected + 1} / ${count}  (↑ ↓)`;

            list.append(more);

        }


        this.updateGhost();

    }


    // Szary dopisek w polu: reszta wybranej podpowiedzi.

    updateGhost() {

        const value = this.input.value;

        const option = this.suggestions[this.selected];

        let rest = '';

        if (option !== undefined && `/${option}`.toLowerCase().startsWith(value.toLowerCase())) {
            rest = `/${option}`.slice(value.length);
        }


        // Gdy tekst nie mieści się w polu (przewinięty), dopisek by
        // się rozjechał - wtedy go nie pokazujemy.

        if (this.input.scrollLeft > 0) {
            rest = '';
        }

        this.ghostTyped.textContent = value;
        this.ghostRest.textContent = rest;

    }


    // Tab: wstawia wybraną podpowiedź (i spację - od razu widać
    // podpowiedzi kolejnego słowa).

    acceptSuggestion() {

        const option = this.suggestions[this.selected];

        if (option === undefined) {
            return;
        }

        this.input.value = `/${option} `;

        this.input.setSelectionRange(this.input.value.length, this.input.value.length);

        this.browsingHistory = false;

        this.updateSuggestions();

    }

}
