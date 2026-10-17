import { ACHIEVEMENTS, TIERS, TIER_ORDER } from './list.js';

import { playUi } from '../audio/ui.js';

// ------------------------------------------------------------
// KSIĘGA OSIĄGNIĘĆ
//
// Jedna na gracza (na tę przeglądarkę albo aplikację), wspólna dla
// wszystkich światów - zapisuje się w localStorage. Przy każdym
// zdobytym osiągnięciu zapamiętuje, kiedy i w którym świecie.
//
// Gra zgłasza zdarzenia (game.achieve('blockBroken', { type })),
// a księga sprawdza, czy któreś osiągnięcie z listy (list.js) właśnie
// się spełniło. Część osiągnięć sprawdza się sama co pół sekundy
// (pole check). Zdobyte - powiadomienie na ekranie (z żartobliwym
// komentarzem), dźwięk zależny od rangi i wpis w księdze (ekran
// w menu: Menu.showAchievements, klawisz L).
// ------------------------------------------------------------

const STORAGE_KEY = 'voxel-game-achievements';

// Co ile sekund sprawdzamy osiągnięcia z polem check.
const CHECK_INTERVAL = 0.5;

// Jak długo widać powiadomienie (sekundy) - legendarne dłużej.
const TOAST_SECONDS = { common: 4.5, rare: 5.5, epic: 6.5, legendary: 9 };


export class AchievementBook {

    // toastRoot - element, do którego trafiają powiadomienia
    // (null = bez powiadomień, np. w testach).

    constructor(toastRoot = null) {

        this.toastRoot = toastRoot;

        // Ikonki bloków i przedmiotów (main.js: setIcons).
        this.icons = new Map();

        // Zapis: { unlocked: { id: { at, world, mode, command } }, progress: {...} }
        this.data = this.load();

        // Obecna gra (attach/detach) i jej świat.
        this.game = null;
        this.worldName = '';

        this.checkTimer = 0;

        // Powiadomienia czekające w kolejce (jedno naraz).
        this.queue = [];
        this.showing = null;

        // Ktoś słucha zmian (otwarta księga w menu).
        this.listeners = new Set();

    }

    // --------------------------------------------------------
    // Zapis (localStorage może być niedostępne - wtedy księga
    // działa do zamknięcia strony)
    // --------------------------------------------------------

    load() {

        try {

            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');

            if (parsed && typeof parsed === 'object') {

                return {
                    unlocked: typeof parsed.unlocked === 'object' && parsed.unlocked ? parsed.unlocked : {},
                    progress: typeof parsed.progress === 'object' && parsed.progress ? parsed.progress : {}
                };

            }

        }

        catch (error) {

            console.warn('Nie udało się wczytać osiągnięć:', error);

        }

        return { unlocked: {}, progress: {} };

    }


    save() {

        try {

            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));

        }

        catch (error) {

            console.warn('Nie udało się zapisać osiągnięć:', error);

        }

    }

    // --------------------------------------------------------
    // Gra
    // --------------------------------------------------------

    setIcons(icons) {

        this.icons = icons ?? new Map();

    }


    // Świat wczytany / zamknięty (main.js).

    attach(game, worldInfo) {

        this.game = game;
        this.worldName = worldInfo?.name ?? '';
        this.checkTimer = 0;

    }

    detach() {

        this.game = null;

    }


    // Co klatkę w trakcie gry (Game.update): osiągnięcia z polem check.

    update(dt) {

        const game = this.game;

        if (!game) {
            return;
        }

        this.checkTimer -= dt;

        if (this.checkTimer > 0) {
            return;
        }

        this.checkTimer = CHECK_INTERVAL;

        for (const achievement of ACHIEVEMENTS) {

            if (!achievement.check || this.has(achievement.id)) {
                continue;
            }

            let done = false;

            try {
                done = achievement.check(game, this);
            }
            catch (error) {
                console.warn(`Osiągnięcie ${achievement.id}:`, error);
            }

            if (done) {
                this.unlock(achievement.id);
            }

        }

    }


    // Zdarzenie z gry, np. event('blockBroken', { type: 'stone' }).

    event(name, data = {}) {

        for (const achievement of ACHIEVEMENTS) {

            if (achievement.on !== name || this.has(achievement.id)) {
                continue;
            }

            let done = false;

            try {
                done = achievement.when ? achievement.when(data, this) : true;
            }
            catch (error) {
                console.warn(`Osiągnięcie ${achievement.id}:`, error);
            }

            if (done) {
                this.unlock(achievement.id);
            }

        }

    }

    // --------------------------------------------------------
    // Postęp (dla osiągnięć typu "zrób coś 500 razy")
    // --------------------------------------------------------

    // Dodaje `amount` do licznika `key` i zwraca nową wartość.

    count(key, amount = 1) {

        const progress = this.data.progress;

        progress[key] = (Number(progress[key]) || 0) + amount;

        this.scheduleSave();

        return progress[key];

    }


    // Dopisuje wartość do zbioru `key` i zwraca, ile różnych wartości
    // w nim jest (np. rodzaje zebranych owoców).

    collect(key, value) {

        const progress = this.data.progress;

        const list = Array.isArray(progress[key]) ? progress[key] : [];

        if (value !== undefined && !list.includes(value)) {

            list.push(value);

            progress[key] = list;

            this.save();

        }

        return list.length;

    }


    // Ile postępu jest w kluczu (liczba albo liczba różnych wartości).

    progressOf(key) {

        const value = this.data.progress[key];

        return Array.isArray(value) ? value.length : Number(value) || 0;

    }


    // Liczniki zmieniają się często (każdy postawiony blok) - zapis
    // najwyżej raz na kilka sekund.

    scheduleSave() {

        if (this.saveTimeout) {
            return;
        }

        this.saveTimeout = setTimeout(() => {

            this.saveTimeout = null;

            this.save();

        }, 3000);

    }

    // --------------------------------------------------------
    // Zdobywanie
    // --------------------------------------------------------

    has(id) {

        return Boolean(this.data.unlocked[id]);

    }


    // Zdobywa osiągnięcie (zwraca false, jeśli już było albo nie ma
    // takiego). command = przyznane komendą (/osiagniecia daj).

    unlock(id, { command = false } = {}) {

        const achievement = findAchievement(id);

        if (!achievement || this.has(id)) {
            return false;
        }

        this.data.unlocked[id] = {
            at: Date.now(),
            world: this.worldName,
            mode: this.game?.mode ?? '',
            command
        };

        this.save();

        this.notify(achievement);

        // Na telefonie nie ma klawisza L - jest przycisk z książką.

        const where = this.game?.touchMode ? 'przycisk z książką u góry' : 'L';

        this.game?.onMessage?.(
            `Osiągnięcie zdobyte: ${achievement.title} (${TIERS[achievement.tier].name.toLowerCase()}). Księga osiągnięć: ${where}`
        );

        for (const listener of this.listeners) {
            listener();
        }

        return true;

    }


    // Zabiera osiągnięcie (do testów: /osiagniecia zabierz).

    revoke(id) {

        if (!this.has(id)) {
            return false;
        }

        delete this.data.unlocked[id];

        this.save();

        return true;

    }


    // Wszystko od nowa (także postęp).

    reset() {

        this.data = { unlocked: {}, progress: {} };

        this.save();

    }


    // Podsumowanie: ile zdobytych, ile punktów, ile w każdej randze.

    summary() {

        const result = {
            unlocked: 0,
            total: ACHIEVEMENTS.length,
            points: 0,
            maxPoints: 0,
            tiers: {}
        };

        for (const tier of TIER_ORDER) {
            result.tiers[tier] = { unlocked: 0, total: 0 };
        }

        for (const achievement of ACHIEVEMENTS) {

            const points = TIERS[achievement.tier].points;

            result.maxPoints += points;
            result.tiers[achievement.tier].total++;

            if (this.has(achievement.id)) {

                result.unlocked++;
                result.points += points;
                result.tiers[achievement.tier].unlocked++;

            }

        }

        return result;

    }

    // --------------------------------------------------------
    // Powiadomienie na ekranie (wygląd: src/ui/achievements.css)
    // --------------------------------------------------------

    // Kolejka powiadomień (komenda /osiagniecia pokaz wywołuje to
    // samo bez zdobywania).

    notify(achievement) {

        this.queue.push(achievement);

        if (!this.showing) {
            this.showNext();
        }

    }


    showNext() {

        const achievement = this.queue.shift();

        this.showing = achievement ?? null;

        if (!achievement || !this.toastRoot) {

            this.showing = null;

            return;

        }

        const tier = TIERS[achievement.tier];


        const toast = document.createElement('div');

        toast.className = `achievement-toast tier-${achievement.tier}`;

        const icon = document.createElement('div');
        icon.className = 'achievement-icon';
        this.fillIcon(icon, achievement);

        const text = document.createElement('div');
        text.className = 'achievement-text';

        const label = document.createElement('div');
        label.className = 'achievement-label';
        label.textContent = `Osiągnięcie · ${tier.name} · +${tier.points}`;

        const title = document.createElement('div');
        title.className = 'achievement-title';
        title.textContent = achievement.title;

        const comment = document.createElement('div');
        comment.className = 'achievement-comment';
        comment.textContent = achievement.comment;

        text.append(label, title, comment);
        toast.append(icon, text);

        this.toastRoot.appendChild(toast);


        // Wjazd (odczyt rozmiaru wymusza ułożenie strony - dzięki temu
        // przejście startuje od pozycji "schowany"), a po chwili zjazd
        // i następne z kolejki.

        toast.getBoundingClientRect();

        toast.classList.add('visible');

        playUi(tier.sound);

        const seconds = TOAST_SECONDS[achievement.tier] ?? 5;

        setTimeout(() => {

            toast.classList.remove('visible');

            setTimeout(() => {

                toast.remove();

                this.showNext();

            }, 450);

        }, seconds * 1000);

    }


    // Ikonka osiągnięcia (obrazek bloku albo przedmiotu).

    fillIcon(element, achievement) {

        const url = this.icons.get(achievement.icon);

        if (url) {

            const image = document.createElement('img');

            image.src = url;
            image.alt = '';

            element.appendChild(image);

        }

    }

}


export function findAchievement(id) {

    return ACHIEVEMENTS.find((achievement) => achievement.id === id) ?? null;

}
