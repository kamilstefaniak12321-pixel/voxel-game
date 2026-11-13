// ------------------------------------------------------------
// OKNO STATUSU (0.94.0)
//
// Samopoczucie gracza słowami (bez pasków): stan, zapas energii,
// kondycja, posiłki. Dane liczy src/game/Wellbeing.js.
//
//   #wellbeing - pixel-artowe serce w lewym górnym rogu (HeartIcon.js;
//                zawsze w trybie przygody): kolor to stan, przy zmianie
//                migocze. Na telefonie stuknięcie otwiera okno,
//   #status    - okno (klawisz C albo stuknięcie w serce); gra
//                działa dalej,
//   #weary     - przyciemnienie brzegów obrazu u wyczerpanego.
//
// W trybie kreatywnym energia jest wyłączona - serca nie widać,
// a okno mówi, że nie trzeba jeść.
// ------------------------------------------------------------

import { STATES, MEALS_PER_DAY } from '../game/Wellbeing.js';
import { getFood, KIND_LABELS } from '../items/foods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { HeartIcon, drawHeart } from './HeartIcon.js';

function element(tag, className, text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
}

// Dane okna z gry (osobno - łatwo sprawdzić w testach).
export function statusView(game) {
    const wellbeing = game.wellbeing;
    const held = game.inventory.selectedItem?.type ?? null;
    const food = held ? getFood(held) : null;
    if (!wellbeing.active) return { active: false, held: null };
    const info = wellbeing.describe();
    const state = STATES[info.state];
    return {
        active: true,
        state: info.state,
        label: state.label,
        text: state.text,
        rows: [
            ['Energia', info.energy],
            ['Kondycja', info.condition],
            ['Posiłki dzisiaj', `${Math.min(info.mealsToday, MEALS_PER_DAY)} z ${MEALS_PER_DAY}`],
            ['Żołądek', info.full ? 'najedzony' : 'pusty']
        ],
        history: info.history,
        held: food ? { type: held, label: getItemLabel(held), kind: KIND_LABELS[food.kind], can: wellbeing.canEat(held) } : null
    };
}

export class StatusPanel {

    // onEat - przycisk "Zjedz" (telefon).
    constructor({ onEat } = {}) {
        this.chip = document.getElementById('wellbeing');
        this.heart = new HeartIcon(this.chip);
        // Telefon: stuknięcie w serce otwiera okno (na komputerze mysz
        // jest w grze "złapana" - tam klawisz C).
        this.chip.addEventListener('click', () => this.toggle());
        this.panel = document.getElementById('status');
        this.weary = document.getElementById('weary');
        this.onEat = onEat;
        this.signature = null;
        this.wait = 0;
        this.panel.hidden = true;
    }

    get isOpen() { return !this.panel.hidden; }

    open() { this.panel.hidden = false; this.signature = null; this.wait = 0; }
    close() { this.panel.hidden = true; }
    toggle() { if (this.isOpen) this.close(); else this.open(); }

    // Zdarzenie z gry (Game.onWellbeing): serce reaguje.
    signal(event) {
        if (event.type === 'rumble') this.heart.play('rumble', 0.7);
        else if (event.type === 'meal') this.heart.play('meal', 0.6);
        else if (event.type === 'day' && event.change !== 0) {
            this.heart.play(event.change > 0 ? 'up' : 'down', 1.2);
            if (event.change > 0) this.heart.sparkle();
        }
    }

    // Co klatkę (DOM zmienia się tylko, gdy zmieniły się dane).
    update(dt, game) {
        if (!game) {
            this.chip.hidden = true;
            document.body.classList.remove('has-heart');
            this.weary.style.opacity = '0';
            return;
        }
        const wellbeing = game.wellbeing;
        const state = wellbeing.active ? wellbeing.state : null;
        this.chip.hidden = !state;
        document.body.classList.toggle('has-heart', Boolean(state));
        if (state) {
            this.heart.set(state);
            this.heart.update(dt);
            this.chip.title = STATES[state].label;
        }
        this.weary.style.opacity = String(wellbeing.effects.dim);

        if (!this.isOpen) return;
        this.wait -= dt;
        if (this.wait > 0) return;
        this.wait = 0.25;
        const view = statusView(game);
        const signature = JSON.stringify(view);
        if (signature === this.signature) return;
        this.signature = signature;
        this.render(view);
    }

    render(view) {
        const panel = this.panel;
        panel.replaceChildren(element('div', 'status-title', 'Samopoczucie'));
        if (!view.active) {
            panel.append(element('p', 'status-text', 'W tym trybie gry energia nie ubywa i nie trzeba jeść.'));
        } else {
            const state = element('div', 'status-state');
            const icon = document.createElement('canvas');
            icon.className = 'heart-pixels';
            drawHeart(icon, view.state);
            state.append(icon, element('span', '', view.label));
            panel.append(state, element('p', 'status-text', view.text));
            const list = element('dl', 'status-rows');
            for (const [name, value] of view.rows) list.append(element('dt', '', name), element('dd', '', value));
            panel.append(list);
            if (view.history.length) {
                panel.append(element('p', 'status-note', `Posiłki w poprzednich dniach: ${view.history.join(', ')}`));
            }
            const held = element('div', 'status-held');
            if (view.held) {
                held.append(element('div', '', `W ręce: ${view.held.label} (${view.held.kind})`));
                if (view.held.can.ok) {
                    const button = element('button', 'status-eat', 'Zjedz');
                    button.type = 'button';
                    button.addEventListener('click', () => { this.onEat?.(); this.wait = 0; });
                    held.append(element('div', 'status-key', 'F - zjedz'), button);
                } else held.append(element('div', 'status-note', view.held.can.reason));
            } else held.append(element('div', 'status-note', 'Weź do ręki coś do jedzenia (owoce, orzechy) i naciśnij F.'));
            panel.append(held);
        }
        panel.append(element('div', 'status-close', 'C - zamknij'));
    }
}
