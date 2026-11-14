// ------------------------------------------------------------
// SAMOUCZEK (0.99.0)
//
// Pierwsze minuty w świecie w trybie przygody: krótka lista kroków,
// po jednym naraz. Krok sam się zalicza, gdy gracz zrobi to, o co
// prosi (samouczek patrzy na zdarzenia gry i na ekwipunek) - nic nie
// trzeba klikać. Krok można pominąć, cały samouczek wyłączyć,
// a w ustawieniach (zakładka Poradnik) zacząć od nowa.
//
// Sama logika, bez ekranu: okienko rysuje ui/TutorialPanel.js,
// pytanie na początku świata i przyciski w pauzie - ui/Menu.js.
//
// Stan zapisuje się ze światem (worldInfo.tutorial):
//   { step, done, skipped }  - numer kroku, czy skończony, czy pominięty,
//   null                     - świat sprzed 0.99.0 albo jeszcze nie pytano.
//
// Nowy krok: wpis w TUTORIAL_STEPS. Pola:
//   id     - nazwa (do testów),
//   title  - nagłówek,
//   text   - co zrobić: komputer; touch - to samo na telefonie
//            (bez touch - ten sam tekst). Klawisze pisz nazwą
//            czynności z input/bindings.js: [eat] -> 'F', {break} ->
//            'lewy przycisk myszy' - gracz mógł je przypisać inaczej,
//   hint   - dodatkowa rada małym drukiem (opcjonalnie),
//   done   - (tutorial) => czy krok zaliczony; do dyspozycji:
//            tutorial.saw(nazwa)  - czy zaszło zdarzenie,
//            tutorial.has(test)   - czy w ekwipunku jest rzecz, dla
//                                   której test(type) jest prawdą,
//            tutorial.walked      - ile bloków gracz przeszedł,
//            tutorial.game        - cała gra.
// ------------------------------------------------------------

import { BLOCK_TYPES } from '../blocks/BlockRegistry.js';
import { getTool } from '../items/ItemRegistry.js';
import { SLOT_COUNT } from './Inventory.js';
import { isNight } from './Wellbeing.js';
import { formatKeys } from '../input/bindings.js';

// Ile sekund na ekranie zostaje "Zrobione!", zanim pojawi się następny krok.
export const TUTORIAL_DONE_SECONDS = 2.2;
// Krok zaliczony wcześniej (np. gracz już coś zjadł) miga krócej.
export const TUTORIAL_QUICK_SECONDS = 1.1;
// Co ile sekund samouczek sprawdza ekwipunek i ogniska.
const CHECK_SECONDS = 0.25;
// Ile bloków trzeba przejść w pierwszym kroku.
export const TUTORIAL_WALK_BLOCKS = 8;

const isLog = (type) => ['log', 'stripped'].includes(BLOCK_TYPES[type]?.part);
const isPlanks = (type) => BLOCK_TYPES[type]?.part === 'planks' || type === 'dark_planks';
const isAxe = (type) => getTool(type) === 'axe';
// Pełna godzina w świecie gry: 'Jest po 14:00 - ' (bez zegara - nic).
const hourText = (time) => (time?.formatClock ? `Jest po ${Number(time.formatClock().split(':')[0])}:00 - poczekaj` : 'Poczekaj');
const anyFire = (game, test) => [...(game.campfires?.fires?.values() ?? [])].some(test);

export const TUTORIAL_STEPS = [
    {
        id: 'move',
        title: 'Rozejrzyj się',
        text: 'Ruszaj myszą, żeby się rozglądać. Chodzisz klawiszami [forward], [left], [back], [right], skok to [jump]. Przejdź kilka kroków.',
        touch: 'Przesuwaj palcem po prawej stronie ekranu, żeby się rozglądać. Lewa strona to joystick - przejdź kilka kroków. Przycisk ▲ to skok.',
        done: (t) => t.walked >= TUTORIAL_WALK_BLOCKS
    },
    {
        id: 'wood',
        title: 'Zdobądź drewno',
        text: 'Podejdź do drzewa, wyceluj w pień i przytrzymaj {break}, aż pień pęknie. Trafi do paska na dole ekranu.',
        touch: 'Podejdź do drzewa, wyceluj w pień i przytrzymaj na nim palec, aż pęknie. Trafi do paska na dole ekranu.',
        hint: 'Gołą ręką idzie to powoli - za chwilę zrobisz siekierę.',
        done: (t) => t.saw('log') || t.has(isLog) || t.has(isPlanks)
    },
    {
        id: 'planks',
        title: 'Zrób deski',
        text: 'Otwórz ekwipunek ([inventory]). Po prawej jest siatka wytwarzania 2 × 2: połóż w niej pień i zabierz deski z pola wyniku.',
        touch: 'Otwórz ekwipunek (skrzynka u góry ekranu). Jest w nim siatka wytwarzania 2 × 2: połóż w niej pień i zabierz deski z pola wyniku.',
        hint: 'Przycisk Przepisy w ekwipunku pokazuje wszystko, co da się zrobić - kliknięcie przepisu samo układa składniki.',
        done: (t) => t.saw('crafted:planks') || t.has(isPlanks) || t.has((type) => type === 'stick') || t.has(isAxe)
    },
    {
        id: 'sticks',
        title: 'Zrób patyki',
        text: 'W siatce wytwarzania połóż dwie deski jedna nad drugą - wyjdą cztery patyki. Przydadzą się do narzędzi i ogniska.',
        done: (t) => t.saw('crafted:stick') || t.has((type) => type === 'stick') || t.has(isAxe)
    },
    {
        id: 'axe',
        title: 'Zrób siekierę',
        text: 'Potrzebujesz trzech skał i patyka. Skałę wykopiesz spod ziemi albo znajdziesz na zboczach i brzegach. W siatce ułóż: u góry dwie skały, pod nimi skała i patyk.',
        hint: 'Siekiera ścina drzewa trzy razy szybciej. Kilof (2 skały + patyk) tak samo przyspiesza kopanie skał, łopata (skała + patyk) - ziemi.',
        done: (t) => t.saw('crafted:axe') || t.has(isAxe)
    },
    {
        id: 'eat',
        title: 'Zjedz coś',
        text: 'Poszukaj jedzenia: owoce z krzaków i jabłka z jabłoni zbierasz kliknięciem ([use]), a z rozbitych liści dębu i buka wypadają żołędzie i orzeszki. Weź jedzenie do ręki i naciśnij [eat].',
        touch: 'Poszukaj jedzenia: owoce z krzaków i jabłka z jabłoni zbierasz stuknięciem, a z rozbitych liści dębu i buka wypadają żołędzie i orzeszki. Weź jedzenie do ręki i stuknij serce u góry ekranu - w oknie jest przycisk Zjedz.',
        hint: 'Bez jedzenia ubywa energii: wolniej biegasz i kopiesz.',
        done: (t) => t.saw('ate')
    },
    {
        id: 'status',
        title: 'Sprawdź samopoczucie',
        text: 'Serce w rogu ekranu pokazuje, jak się czujesz. Naciśnij [status], żeby zobaczyć szczegóły: energię, żołądek, kondycję i sen.',
        touch: 'Serce u góry ekranu pokazuje, jak się czujesz. Stuknij je, żeby zobaczyć szczegóły: energię, żołądek, kondycję i sen.',
        hint: 'Trzy porządne posiłki dziennie poprawiają kondycję na kolejne dni.',
        done: (t) => t.saw('statusOpened')
    },
    {
        id: 'campfire',
        title: 'Ułóż ognisko',
        text: 'Zrób opał: w siatce wytwarzania połóż pień obok siekiery (siekiera zostaje). Z opałem w ręce kliknij ziemię ([use]) i dokładaj, aż będzie 6 polan.',
        touch: 'Zrób opał: w siatce wytwarzania połóż pień obok siekiery (siekiera zostaje). Z opałem w ręce stuknij ziemię i dokładaj, aż będzie 6 polan.',
        hint: 'Z jednego pnia wychodzą 4 polana - potrzebujesz dwóch pni.',
        done: (t) => t.saw('fireLit') || anyFire(t.game, (fire) => fire.logs.length >= 6)
    },
    {
        id: 'fire',
        title: 'Rozpal ognisko',
        text: 'Dołóż do ogniska podpałkę - trawę ([use]). Z dwóch patyków zrób starter ognia, wyceluj nim w ognisko i przytrzymaj [use] przez 5 sekund.',
        touch: 'Dołóż do ogniska podpałkę - trawę (stuknij ognisko). Z dwóch patyków zrób starter ognia, wyceluj nim w ognisko i przytrzymaj przycisk z kostką przez 5 sekund.',
        hint: 'Nad ogniem upieczesz jabłka, orzechy i żołędzie: trzymaj je nad płomieniem. Pieczone to porządny posiłek.',
        done: (t) => t.saw('fireLit')
    },
    {
        id: 'sleep',
        title: 'Prześpij noc',
        text: 'Po 19:00 można spać. Na początek wystarczy ziemia: kucnij ([crouch]) i kliknij ziemię pustą ręką ([use]). Rano budzisz się sam.',
        touch: 'Po 19:00 można spać. Na początek wystarczy ziemia: trzymaj ▼ i stuknij ziemię pustą ręką. Rano budzisz się sam.',
        hint: 'Lepiej się wyśpisz na posłaniu (2 trawy → słoma, 4 słomy → pościel), a najlepiej w łóżku.',
        // Do wieczora krok czeka - widać, która jest godzina (pełna:
        // karta nie przerysowuje się co chwilę).
        wait: (t) => (isNight(t.game.time?.days ?? 0) ? null
            : `${hourText(t.game.time)} do wieczora. Możesz w tym czasie zbierać jedzenie i trawę.`),
        done: (t) => t.saw('slept')
    }
];

// Zdarzenia gry (game.achieve) -> znaczniki samouczka.
const EVENT_FLAGS = {
    blockBroken: (data) => (isLog(data.type) ? ['log'] : []),
    crafted: (data) => [isPlanks(data.type) ? 'crafted:planks' : isAxe(data.type) ? 'crafted:axe' : `crafted:${data.type}`],
    ate: () => ['ate'],
    slept: (data) => (data.early && !(data.hours >= 1) ? [] : ['slept'])
};

export class Tutorial {

    // saved - worldInfo.tutorial (albo null); samouczek działa tylko
    // w trybie przygody i nie u gościa w grze ze znajomymi.
    constructor(game, saved = null) {
        this.game = game;
        this.flags = new Set();
        this.walked = 0;
        this.lastPosition = null;
        this.checkIn = 0;
        // Odliczanie "Zrobione!" przed następnym krokiem (0 - nie trwa).
        this.celebrate = 0;
        this.quick = false;
        // Od ilu sekund widać bieżący krok.
        this.shownFor = 0;
        this.onChange = null;
        this.state = Tutorial.clean(saved);
    }

    static clean(saved) {
        if (!saved || typeof saved !== 'object') return null;
        const step = Number.isInteger(saved.step) ? Math.max(0, Math.min(TUTORIAL_STEPS.length, saved.step)) : 0;
        const done = Boolean(saved.done) || step >= TUTORIAL_STEPS.length;
        return { step, done, skipped: Boolean(saved.skipped) };
    }

    // Czy samouczek może działać w tej grze (tryb przygody, własny świat).
    get allowed() {
        const game = this.game;
        return game.mode === 'adventure' && !(game.net && game.net.isHost === false);
    }

    // Czy na początku świata zapytać gracza: nowy świat, o który jeszcze
    // nie pytano. enabled - ustawienie "Samouczek w nowych światach".
    shouldOffer(enabled, newWorld) {
        return Boolean(enabled) && newWorld && this.allowed && this.state === null;
    }

    get active() { return this.allowed && this.state !== null && !this.state.done; }

    get finished() { return this.state?.done === true && !this.state.skipped; }

    get step() { return this.active ? TUTORIAL_STEPS[this.state.step] : null; }

    save() {
        if (this.game.worldInfo) this.game.worldInfo.tutorial = this.state;
        this.onChange?.();
    }

    // Start od pierwszego kroku (pytanie na początku świata albo
    // "Powtórz samouczek" w ustawieniach). Zdarzenia sprzed startu się
    // nie liczą - powtórka uczy od nowa - ale rzeczy w ekwipunku tak.
    start() {
        if (!this.allowed) return false;
        this.state = { step: 0, done: false, skipped: false };
        this.flags.clear();
        this.walked = 0;
        this.lastPosition = null;
        this.celebrate = 0;
        this.shownFor = 0;
        this.save();
        return true;
    }

    // "Pomiń - znam grę" albo "Wyłącz samouczek" w pauzie.
    stop() {
        this.state = { step: this.state?.step ?? 0, done: true, skipped: true };
        this.celebrate = 0;
        this.save();
    }

    // "Pomiń ten krok".
    skipStep() {
        if (!this.active) return false;
        this.celebrate = 0;
        this.advance();
        return true;
    }

    advance() {
        const state = this.state;
        state.step++;
        this.shownFor = 0;
        if (state.step >= TUTORIAL_STEPS.length) {
            state.done = true;
            state.skipped = false;
            this.save();
            this.game.onMessage?.('Samouczek ukończony. Resztę podpowie Poradnik: Ustawienia → Poradnik.');
            this.game.achieve?.('tutorialDone', {});
            return;
        }
        this.save();
    }

    saw(flag) { return this.flags.has(flag); }

    has(test) {
        const inventory = this.game.inventory;
        if (!inventory) return false;
        for (let index = 0; index < SLOT_COUNT; index++) {
            const item = inventory.get(index);
            if (item && test(item.type)) return true;
        }
        return false;
    }

    // Zdarzenie z gry (Game.achieve) albo z okien (main.js:
    // 'statusOpened'). Zapamiętywane także przed swoim krokiem - krok
    // zrobiony wcześniej zalicza się od razu, gdy przyjdzie jego kolej.
    event(name, data = {}) {
        if (!this.active) return;
        const flags = EVENT_FLAGS[name] ? EVENT_FLAGS[name](data) : [name];
        for (const flag of flags) this.flags.add(flag);
    }

    update(dt) {
        if (!this.active || !(dt > 0)) return;
        const game = this.game;

        // Przebyta droga (po ziemi, bez teleportów).
        const position = game.player?.pos;
        if (position) {
            if (this.lastPosition) {
                const distance = Math.hypot(position.x - this.lastPosition.x, position.z - this.lastPosition.z);
                if (distance < 2) this.walked += distance;
            }
            this.lastPosition = { x: position.x, z: position.z };
        }

        if (this.celebrate > 0) {
            this.celebrate -= dt;
            if (this.celebrate <= 0) {
                this.celebrate = 0;
                this.advance();
            }
            return;
        }

        this.checkIn -= dt;
        if (this.checkIn > 0) return;
        this.checkIn = CHECK_SECONDS;

        if (anyFire(game, (fire) => fire.phase === 'burning')) this.flags.add('fireLit');

        if (this.step.done(this)) {
            // Krok, który dopiero co się pojawił i już jest zrobiony, miga krócej.
            this.quick = this.shownFor < 1;
            this.celebrate = this.quick ? TUTORIAL_QUICK_SECONDS : TUTORIAL_DONE_SECONDS;
            game.sounds?.play?.('ui_open');
            this.onChange?.();
        }
        else {
            this.shownFor += CHECK_SECONDS;
        }
    }

    // Co pokazać w okienku (ui/TutorialPanel.js); null - nic.
    view() {
        const step = this.step;
        if (!step) return null;
        const touch = Boolean(this.game.touchMode);
        return {
            id: step.id,
            index: this.state.step + 1,
            total: TUTORIAL_STEPS.length,
            title: step.title,
            // Telefon: własny tekst kroku (klawiszy tam nie ma).
            text: touch && step.touch ? step.touch : formatKeys(step.text),
            hint: step.hint ?? null,
            wait: this.celebrate > 0 ? null : step.wait?.(this) ?? null,
            completed: this.celebrate > 0
        };
    }
}
