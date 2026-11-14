import { bindings, mouseButton, mouseCode } from './bindings.js';

// ------------------------------------------------------------
// KLAWIATURA I MYSZ
//
// Gra pyta o domyślne kody klawiszy i przycisków (isKeyDown('KeyW'),
// isMouseDown(0)). Gracz może je przypisać inaczej (input/bindings.js):
// każdy wciśnięty klawisz albo przycisk myszy jest tu najpierw
// tłumaczony na kod czynności (press / release). Klawisz może przez to
// działać jak przycisk myszy i odwrotnie.
// ------------------------------------------------------------

// Klawisze, którymi przeglądarka coś robi (przewijanie, szukanie,
// zmiana pola) - w grze, gdy są do czegoś przypisane, blokujemy to.
const BROWSER_KEYS = /^(Tab|Space|Backspace|Quote|Slash|Alt(Left|Right)|Arrow(Up|Down|Left|Right)|Page(Up|Down)|Home|End|F[1-7]|F9|F10)$/;

export class InputManager {

    constructor(element) {

        this.element = element;

        this.keys = {};

        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        this.mousePressed = new Set();

        // Przyciski myszy trzymane teraz (kopanie trzymanym LPM).
        this.mouseDown = new Set();

        // Obroty kółka myszy od ostatniego odczytu
        // (+1 = w dół / do siebie, -1 = w górę).

        this.wheelSteps = 0;

        this.keyPressed = new Set();

        // enabled = false (np. przy otwartym ekwipunku): klawisze nie
        // trafiają do gry (puszczenie klawisza działa zawsze).

        this.enabled = true;

        // false = sterowanie dotykowe (src/input/TouchControls.js):
        // bez przechwytywania myszy - "klawisze" i "mysz" ustawia
        // wtedy TouchControls.

        this.pointerLock = true;

        // Fizyczne klawisze i przyciski trzymane teraz (żeby powtarzanie
        // klawisza nie liczyło się jako nowe wciśnięcie).

        this.held = new Set();

        // (code) => ... - przycisk myszy zadziałał jak klawisz (app/keys.js).

        this.onMouseKey = null;

        // Zmiana przypisań w trakcie gry: zapominamy, co było wciśnięte.

        bindings.listeners.add(() => this.reset());

        window.addEventListener('keydown', event => {

            if (!this.enabled) {
                return;
            }

            if (document.pointerLockElement === this.element && BROWSER_KEYS.test(event.code) &&
                bindings.logical(event.code) !== event.code) {
                event.preventDefault();
            }

            this.press(event.code);

        });


        window.addEventListener('keyup', event => {
            this.release(event.code);
        });


        // Kliknięcie w grę przechwytuje mysz - ale tylko wtedy, gdy
        // nie jest już przechwycona. Ponowna prośba przy każdym
        // kliknięciu (np. przy niszczeniu bloków) sprawiała, że
        // przeglądarka zgłaszała "mysz przechwycona" od nowa, a gra
        // czyściła wtedy wciśnięte klawisze i postać stawała.

        this.element.addEventListener('click', () => {

            if (this.pointerLock && document.pointerLockElement !== this.element) {
                this.element.requestPointerLock();
            }

        });

this.element.addEventListener(
    'contextmenu',
    event => {

        event.preventDefault();

    }
);

        document.addEventListener('mousemove', event => {

            if (document.pointerLockElement !== this.element) {
                return;
            }

            this.mouseDeltaX += event.movementX;
            this.mouseDeltaY += event.movementY;

        });


        // Po utracie okna (Alt+Tab, inna karta) przeglądarka nie
        // wysyła keyup, więc klawisze "zacinały się" jako wciśnięte.

        window.addEventListener('blur', () => {
            this.reset();
        });


        // To samo po wyjściu z trybu przechwyconej myszy (ESC).

        document.addEventListener('pointerlockchange', () => {

            if (document.pointerLockElement !== this.element) {
                this.reset();
            }

        });


        document.addEventListener('wheel', event => {

            if (
                document.pointerLockElement !== this.element ||
                event.deltaY === 0
            ) {
                return;
            }

            this.wheelSteps += Math.sign(event.deltaY);

        }, { passive: true });


        document.addEventListener('mousedown', event => {

            if (
                document.pointerLockElement !== this.element
            ) {
                return;
            }

            // Boczne przyciski myszy cofają stronę w przeglądarce - w grze
            // są zwykłymi przyciskami do przypisania.

            if (event.button >= 3) {
                event.preventDefault();
            }

            const code = mouseCode(event.button);

            const fresh = !this.held.has(code);

            this.press(code);

            // Przycisk myszy przypisany do czynności z klawiatury (np.
            // ekwipunek): okna nasłuchują klawiszy, więc zgłaszamy im
            // to osobno (app/keys.js).

            const logical = bindings.logical(code);

            if (fresh && logical !== null && mouseButton(logical) === null) {
                this.onMouseKey?.(logical);
            }

        });


        document.addEventListener('mouseup', event => {

            if (event.button >= 3 && document.pointerLockElement === this.element) {
                event.preventDefault();
            }

            this.release(mouseCode(event.button));

        });

    }


    // Wciśnięcie fizycznego klawisza albo przycisku myszy ('KeyW',
    // 'Mouse0'): trafia do gry pod kodem czynności, do której gracz go
    // przypisał (bindings.logical).

    press(code) {

        if (this.held.has(code)) {
            return;
        }

        this.held.add(code);

        const logical = bindings.logical(code);

        if (logical === null) {
            return;
        }

        const button = mouseButton(logical);

        if (button !== null) {
            this.mousePressed.add(button);
            this.mouseDown.add(button);
            return;
        }

        if (!this.keys[logical]) {
            this.keyPressed.add(logical);
        }

        this.keys[logical] = true;

    }


    release(code) {

        this.held.delete(code);

        const logical = bindings.logical(code);

        if (logical === null) {
            return;
        }

        // Dwa klawisze jednej czynności (lewy i prawy Shift): puszczenie
        // jednego nie puszcza czynności, dopóki trzymany jest drugi.

        for (const other of this.held) {
            if (bindings.logical(other) === logical) {
                return;
            }
        }

        const button = mouseButton(logical);

        if (button !== null) {
            this.mouseDown.delete(button);
        }
        else {
            this.keys[logical] = false;
        }

    }


    // Zapomina wszystkie wciśnięte klawisze i przyciski myszy.

    reset() {

        this.keys = {};

        this.held.clear();

        this.keyPressed.clear();
        this.mousePressed.clear();
        this.mouseDown.clear();

        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        this.wheelSteps = 0;

    }


    // Zwraca obroty kółka od ostatniego odczytu i je zeruje.

    consumeWheel() {

        const steps = this.wheelSteps;

        this.wheelSteps = 0;

        return steps;

    }


    isKeyDown(code) {

        return this.keys[code] === true;

    }


    consumeMouseDelta() {

        const delta = {
            x: this.mouseDeltaX,
            y: this.mouseDeltaY
        };

        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        return delta;

    }


    // Czy przycisk myszy jest teraz trzymany.

    isMouseDown(button) {

        return this.mouseDown.has(button);

    }


    consumeMousePress(button) {

        if (
            !this.mousePressed.has(button)
        ) {
            return false;
        }

        this.mousePressed.delete(button);

        return true;

    }
    
    consumeKeyPress(code) {

    if (
        !this.keyPressed.has(code)
    ) {
        return false;
    }


    this.keyPressed.delete(code);


    return true;

}

}
