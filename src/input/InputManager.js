export class InputManager {

    constructor(element) {

        this.element = element;

        this.keys = {};

        this.mouseDeltaX = 0;
        this.mouseDeltaY = 0;

        this.mousePressed = new Set();

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

        window.addEventListener(
    'keydown',
    event => {

        if (!this.enabled) {
            return;
        }

        if (!this.keys[event.code]) {

            this.keyPressed.add(
                event.code
            );

        }

        this.keys[event.code] = true;

    }
);


        window.addEventListener('keyup', event => {
            this.keys[event.code] = false;
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

            this.mousePressed.add(
                event.button
            );

        });

    }


    // Zapomina wszystkie wciśnięte klawisze i przyciski myszy.

    reset() {

        this.keys = {};

        this.keyPressed.clear();
        this.mousePressed.clear();

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
