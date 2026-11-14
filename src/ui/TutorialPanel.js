// ------------------------------------------------------------
// OKIENKO SAMOUCZKA (0.99.0)
//
// Mała karta w prawym górnym rogu: który krok, co zrobić, rada.
// Po zaliczeniu kroku na chwilę zmienia się w "Zrobione!". Logika
// i teksty kroków: game/Tutorial.js. Na telefonie karta ma przyciski
// "Pomiń krok" i "Wyłącz" (na komputerze mysz jest zajęta
// rozglądaniem - te same przyciski są w menu pauzy).
// ------------------------------------------------------------

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

export class TutorialPanel {

    // onSkipStep, onStop - przyciski na telefonie.
    constructor({ onSkipStep = null, onStop = null } = {}) {
        this.root = document.getElementById('tutorial');
        this.onSkipStep = onSkipStep;
        this.onStop = onStop;
        this.signature = null;
    }

    // Co klatkę: przerysowuje kartę tylko wtedy, gdy coś się zmieniło.
    update(game) {
        if (!this.root) return;
        const view = game?.tutorial?.view() ?? null;
        const touch = Boolean(game?.touchMode);
        const signature = view ? `${view.id}|${view.completed}|${view.wait ?? ''}|${touch}` : '';
        if (signature === this.signature) return;
        this.signature = signature;
        this.root.hidden = !view;
        this.root.replaceChildren();
        if (!view) return;
        this.root.classList.toggle('done', view.completed);

        const head = element('div', 'tutorial-head');
        head.append(element('span', 'tutorial-label', 'Samouczek'), element('span', 'tutorial-count', `${view.index} / ${view.total}`));
        const bar = element('div', 'tutorial-bar');
        const fill = element('div', 'tutorial-bar-fill');
        fill.style.width = `${Math.round((view.index - (view.completed ? 0 : 1)) / view.total * 100)}%`;
        bar.append(fill);
        this.root.append(head, bar);

        if (view.completed) {
            this.root.append(element('div', 'tutorial-title', `✓ ${view.title}`), element('div', 'tutorial-text', 'Zrobione!'));
            return;
        }

        this.root.append(element('div', 'tutorial-title', view.title), element('div', 'tutorial-text', view.text));
        if (view.wait) this.root.append(element('div', 'tutorial-wait', view.wait));
        if (view.hint) this.root.append(element('div', 'tutorial-hint', view.hint));

        if (touch) {
            const buttons = element('div', 'tutorial-buttons');
            const skip = element('button', '', 'Pomiń krok');
            const stop = element('button', '', 'Wyłącz');
            skip.type = stop.type = 'button';
            skip.addEventListener('click', () => this.onSkipStep?.());
            stop.addEventListener('click', () => this.onStop?.());
            buttons.append(skip, stop);
            this.root.append(buttons);
        }
        else {
            this.root.append(element('div', 'tutorial-foot', 'Esc - pauza: pomiń krok albo wyłącz samouczek'));
        }
    }

    hide() {
        if (this.root) this.root.hidden = true;
        this.signature = null;
    }
}
