// ------------------------------------------------------------
// STEROWANIE DOTYKOWE (telefon, tablet)
//
// Na ekranie dotykowym nie ma klawiatury ani myszy, więc ta klasa
// udaje je dla reszty gry (InputManager):
//   - lewa część ekranu: JOYSTICK - pojawia się tam, gdzie dotkniesz,
//     wychylenie = W/A/S/D, do samego brzegu (do przodu) = bieg,
//   - reszta ekranu: przesuwanie palcem = rozglądanie się (jak mysz),
//     krótkie stuknięcie = postaw blok / zbierz owoce (PPM),
//     przytrzymanie = niszczenie (LPM, co chwilę następny blok),
//   - przyciski z prawej: skok (2x = latanie), w dół / kucanie,
//     kop, postaw,
//   - przyciski u góry: pauza, ekwipunek, czat, księga osiągnięć,
//     widok (F5), mapa, pełny ekran,
//   - pasek bloków: stuknięcie w miejsce = wybór,
//   - przy otwartym czacie i ekwipunku: przycisk "Zamknij".
// Kop i postaw działają tam, gdzie jest celownik (środek ekranu).
//
// Włączane samo na urządzeniach z ekranem dotykowym bez myszy
// (main.js), albo adresem: index.html?dotyk (wyłączenie: ?dotyk=0).
// Wygląd: src/ui/touch.css.
// ------------------------------------------------------------

// Rozglądanie: ile razy szybciej niż mysz (piksel palca = piksel myszy
// razy tyle, razy czułość z ustawień).
const LOOK_SCALE = 2.4;

// Joystick: promień (px) i od jakiego wychylenia (0-1) liczy się kierunek
// oraz bieg (wychylenie do przodu do samego brzegu).
const STICK_RADIUS = 56;
const STICK_DEAD = 0.3;
const STICK_SPRINT = 0.92;

// Stuknięcie: najwyżej tyle ms i tyle px ruchu. Przytrzymanie: po tylu ms
// zaczyna kopać - jak trzymany LPM (tak samo trzymany "Kop"): w trybie
// przygody blok pęka i znika po czasie kopania, w kreatywnym kolejne
// bloki co chwilę (Game.js).
const TAP_MS = 320;
const TAP_MOVE = 14;
const HOLD_MS = 400;


// Ikonki przycisków (proste rysunki SVG, kolor = kolor tekstu).

const ICONS = {
    jump: '<path d="M4 15 L12 7 L20 15" />',
    down: '<path d="M4 9 L12 17 L20 9" />',
    break: '<path d="M5 19 L14 10" /><path d="M9 5 C13 3 18 5 20 10 C17 8 14 8 12 9" />',
    place: '<path d="M12 3 L20 7.5 L20 16.5 L12 21 L4 16.5 L4 7.5 Z" /><path d="M4 7.5 L12 12 L20 7.5 M12 12 L12 21" />',
    pause: '<path d="M5 6 H19 M5 12 H19 M5 18 H19" />',
    inventory: '<rect x="4" y="7" width="16" height="13" rx="1" /><path d="M9 7 V4 H15 V7" />',
    chat: '<path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z" />',
    book: '<path d="M5 4 H17 a2 2 0 0 1 2 2 V20 H7 a2 2 0 0 1 -2 -2 Z" /><path d="M5 18 a2 2 0 0 1 2 -2 H19" />',
    camera: '<circle cx="12" cy="12" r="3" /><path d="M2 12 C5 6 19 6 22 12 C19 18 5 18 2 12 Z" />',
    map: '<path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20" />',
    fullscreen: '<path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15" />',
    close: '<path d="M6 6 L18 18 M18 6 L6 18" />'
};


// Wszystkie ruchy tego palca trafiają do elementu, na którym się
// zaczęły (nawet gdy palec z niego zjedzie).

function capture(element, event) {

    try {
        element.setPointerCapture(event.pointerId);
    }
    catch (error) {
        // Np. palec już podniesiony - nic nie szkodzi.
    }

}


// Kiedy palec naprawdę dotknął / puścił (czas zdarzenia, a nie chwila,
// w której gra je obsłużyła - przy przyciętej klatce to co innego).
// Gdyby przeglądarka podała dziwny czas - po prostu "teraz".

function stamp(event) {

    const now = performance.now();
    const time = event.timeStamp;

    return time > 0 && time <= now + 50 && now - time < 5000 ? time : now;

}


function icon(name) {

    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;

}


export class TouchControls {

    // input    - InputManager (do niego trafiają "klawisze" i "mysz")
    // handlers - funkcje z main.js: pause, inventory, chat, achievements,
    //            map, fullscreen, close (zamyka czat / ekwipunek)
    // hotbar   - element paska bloków (#hotbar)

    constructor(input, handlers, hotbar) {

        this.input = input;
        this.handlers = handlers;

        // Stan aplikacji z main.js ('playing', 'chat', 'inventory'...).
        this.state = 'menu';

        this.root = document.createElement('div');
        this.root.id = 'touch';
        this.root.hidden = true;

        document.body.appendChild(this.root);
        document.body.classList.add('touch');


        // Strefy: rozglądanie (cały ekran pod przyciskami) i joystick (lewo).

        this.lookZone = this.element('div', 'touch-look');
        this.moveZone = this.element('div', 'touch-move');

        this.stick = this.element('div', 'touch-stick');
        this.knob = document.createElement('div');
        this.knob.className = 'touch-knob';
        this.stick.appendChild(this.knob);

        // Kółko przy przytrzymaniu (niszczenie).
        this.holdRing = this.element('div', 'touch-hold');


        // Przyciski akcji (prawo) i menu (góra).

        const actions = this.element('div', 'touch-actions');

        this.button(actions, 'jump', 'Skok', { key: 'Space' });
        this.button(actions, 'down', 'W dół', { key: 'ShiftLeft' });
        this.button(actions, 'break', 'Kop', { mouse: 0, hold: true });
        this.button(actions, 'place', 'Postaw', { mouse: 2 });

        const top = this.element('div', 'touch-top');

        this.button(top, 'pause', 'Pauza', { action: () => handlers.pause?.() });
        this.button(top, 'inventory', 'Ekwipunek', { action: () => handlers.inventory?.() });
        this.button(top, 'chat', 'Czat', { action: () => handlers.chat?.() });
        this.button(top, 'book', 'Osiągnięcia', { action: () => handlers.achievements?.() });
        this.button(top, 'camera', 'Widok', { press: 'F5' });
        this.button(top, 'map', 'Mapa', { action: () => handlers.map?.() });

        // iPhone nie ma pełnego ekranu dla stron, a aplikacja na telefon
        // jest na nim od początku - wtedy bez przycisku.

        if (handlers.fullscreen && document.documentElement.requestFullscreen) {
            this.button(top, 'fullscreen', 'Pełny ekran', { action: () => handlers.fullscreen?.() });
        }


        // Czat i ekwipunek nie mają na telefonie klawisza ESC / E -
        // zamyka je ten przycisk (widać tylko wtedy).

        const close = this.element('div', 'touch-close');

        this.button(close, 'close', 'Zamknij', { action: () => handlers.close?.() });


        // Ekran pionowo: podpowiedź, że poziomo gra się wygodniej.

        this.element('div', 'touch-rotate').textContent = 'Obróć telefon poziomo - tak gra się wygodniej';


        // Stan dotyków (każdy palec osobno - pointerId).

        this.stickPointer = null;
        this.stickCenter = { x: 0, y: 0 };

        this.lookPointer = null;
        this.look = null;

        // Klawisze z przycisków (keyDown / keyUp).
        this.heldFrames = new Map();
        this.pendingUp = new Set();

        this.bindStick();
        this.bindLook();
        this.bindHotbar(hotbar);

        // Długie przytrzymanie nie otwiera menu przeglądarki.

        this.root.addEventListener('contextmenu', (event) => event.preventDefault());

    }


    element(tag, className) {

        const element = document.createElement(tag);

        element.className = className;

        this.root.appendChild(element);

        return element;

    }


    // Przycisk. what: { key } - trzymany klawisz, { press } - jedno
    // wciśnięcie klawisza, { mouse, hold } - przycisk myszy (hold -
    // trzymany działa jak trzymany przycisk myszy), { action } - funkcja.

    button(parent, name, label, what) {

        const element = document.createElement('button');

        element.type = 'button';
        element.className = `touch-button touch-${name}`;
        element.innerHTML = icon(name);
        element.setAttribute('aria-label', label);

        parent.appendChild(element);

        const down = (event) => {

            event.preventDefault();
            event.stopPropagation();

            capture(element, event);

            element.classList.add('pressed');

            if (what.key) {
                this.keyDown(what.key);
            }

            if (what.press) {
                this.input.keyPressed.add(what.press);
            }

            if (what.mouse !== undefined) {

                this.input.mousePressed.add(what.mouse);

                // Trzymany jak przycisk myszy (kopanie).
                if (what.hold) {
                    this.input.mouseDown.add(what.mouse);
                }

            }

            what.action?.();

        };

        const up = (event) => {

            event.preventDefault();

            element.classList.remove('pressed');

            if (what.key) {
                this.keyUp(what.key);
            }

            if (what.hold) {
                this.input.mouseDown.delete(what.mouse);
            }

        };

        element.addEventListener('pointerdown', down);
        element.addEventListener('pointerup', up);
        element.addEventListener('pointercancel', up);

        // Przyciski chowają się (np. otwarty czat) z palcem na nich -
        // wtedy nie przychodzi pointerup, tylko utrata "przechwycenia".
        element.addEventListener('lostpointercapture', up);

    }


    // Klawisz z przycisku jest wciśnięty co najmniej przez jedną klatkę
    // gry - nawet bardzo szybkie stuknięcie (albo przycięta klatka)
    // nie zgubi skoku. heldFrames: ile klatek już trzymany.

    keyDown(code) {

        if (!this.input.keys[code]) {
            this.input.keyPressed.add(code);
        }

        this.input.keys[code] = true;

        this.heldFrames.set(code, 0);

        this.pendingUp.delete(code);

    }

    keyUp(code) {

        if ((this.heldFrames.get(code) ?? 1) < 1) {

            // Gra jeszcze go nie widziała - puścimy po następnej klatce.
            this.pendingUp.add(code);

            return;

        }

        this.input.keys[code] = false;

        this.heldFrames.delete(code);

    }

    // --------------------------------------------------------
    // Joystick
    // --------------------------------------------------------

    bindStick() {

        const zone = this.moveZone;

        zone.addEventListener('pointerdown', (event) => {

            if (this.stickPointer !== null) {
                return;
            }

            event.preventDefault();

            capture(zone, event);

            this.stickPointer = event.pointerId;
            this.stickCenter = { x: event.clientX, y: event.clientY };

            this.stick.style.left = `${event.clientX}px`;
            this.stick.style.top = `${event.clientY}px`;
            this.stick.classList.add('active');

            this.moveStick(event.clientX, event.clientY);

        });

        zone.addEventListener('pointermove', (event) => {

            if (event.pointerId === this.stickPointer) {
                this.moveStick(event.clientX, event.clientY);
            }

        });

        const end = (event) => {

            if (event.pointerId !== this.stickPointer) {
                return;
            }

            this.stickPointer = null;

            this.stick.classList.remove('active');
            this.stick.style.left = '';
            this.stick.style.top = '';
            this.knob.style.transform = '';

            this.setMove(0, 0);

        };

        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
        zone.addEventListener('lostpointercapture', end);

    }


    moveStick(clientX, clientY) {

        let dx = (clientX - this.stickCenter.x) / STICK_RADIUS;
        let dy = (clientY - this.stickCenter.y) / STICK_RADIUS;

        const length = Math.hypot(dx, dy);

        if (length > 1) {
            dx /= length;
            dy /= length;
        }

        this.knob.style.transform = `translate(${dx * STICK_RADIUS}px, ${dy * STICK_RADIUS}px)`;

        this.setMove(dx, dy);

    }


    // Wychylenie joysticka -> W/A/S/D (i bieg - R).

    setMove(x, y) {

        const keys = this.input.keys;

        keys.KeyW = y < -STICK_DEAD;
        keys.KeyS = y > STICK_DEAD;
        keys.KeyA = x < -STICK_DEAD;
        keys.KeyD = x > STICK_DEAD;

        keys.KeyR = Math.hypot(x, y) >= STICK_SPRINT && y < -0.7;

    }

    // --------------------------------------------------------
    // Rozglądanie, stuknięcie (postaw) i przytrzymanie (kop)
    // --------------------------------------------------------

    bindLook() {

        const zone = this.lookZone;

        zone.addEventListener('pointerdown', (event) => {

            if (this.lookPointer !== null) {
                return;
            }

            event.preventDefault();

            capture(zone, event);

            this.lookPointer = event.pointerId;

            this.look = {
                x: event.clientX,
                y: event.clientY,
                startX: event.clientX,
                startY: event.clientY,
                time: stamp(event),
                // Ile klatek gry minęło od dotknięcia (update).
                frames: 0,
                moved: false,
                broke: false
            };

            this.holdRing.style.left = `${event.clientX}px`;
            this.holdRing.style.top = `${event.clientY}px`;

        });

        zone.addEventListener('pointermove', (event) => {

            if (event.pointerId !== this.lookPointer || !this.look) {
                return;
            }

            const look = this.look;

            const scale = LOOK_SCALE;

            this.input.mouseDeltaX += (event.clientX - look.x) * scale;
            this.input.mouseDeltaY += (event.clientY - look.y) * scale;

            look.x = event.clientX;
            look.y = event.clientY;

            if (!look.moved && Math.hypot(look.x - look.startX, look.y - look.startY) > TAP_MOVE) {

                look.moved = true;

                this.stopHold();

            }

        });

        const end = (event) => {

            if (event.pointerId !== this.lookPointer) {
                return;
            }

            const look = this.look;

            this.lookPointer = null;
            this.look = null;

            this.stopHold();

            // Krótkie stuknięcie bez przesuwania - postaw blok.

            if (event.type === 'pointerup' && look && !look.moved && !look.broke && stamp(event) - look.time <= TAP_MS) {
                this.input.mousePressed.add(2);
            }

        };

        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
        zone.addEventListener('lostpointercapture', end);

    }


    // Co klatkę (main.js, przed Game.update): przytrzymanie palca bez
    // ruchu niszczy blok, a potem co chwilę następny; trzymany "Kop"
    // też powtarza. Sprawdzane tu, a nie zegarem (setTimeout) - zegar
    // przy przyciętej klatce potrafił wybić, zanim gra dostała już
    // czekające "puść palec", i stuknięcie robiło się przytrzymaniem.

    update() {

        if (this.state !== 'playing') {
            return;
        }

        // Klawisze puszczone, zanim gra je zobaczyła - teraz już widziała.

        for (const code of this.pendingUp) {

            if ((this.heldFrames.get(code) ?? 1) >= 1) {

                this.pendingUp.delete(code);

                this.input.keys[code] = false;

                this.heldFrames.delete(code);

            }

        }

        for (const [code, frames] of this.heldFrames) {
            this.heldFrames.set(code, frames + 1);
        }

        const now = performance.now();

        const look = this.look;

        if (look && !look.moved) {

            look.frames++;

            // Co najmniej jedna pełna klatka od dotknięcia - wtedy na
            // pewno doszłoby już ewentualne puszczenie palca.

            if (!look.broke && look.frames > 1 && now - look.time >= HOLD_MS) {

                look.broke = true;

                this.input.mousePressed.add(0);

                this.input.mouseDown.add(0);

                this.holdRing.classList.add('active');

            }

        }

    }


    stopHold() {

        this.holdRing.classList.remove('active');

        this.input.mouseDown.delete(0);

    }

    // --------------------------------------------------------
    // Pasek bloków: stuknięcie w miejsce = klawisz 1-9
    // --------------------------------------------------------

    bindHotbar(hotbar) {

        if (!hotbar) {
            return;
        }

        hotbar.addEventListener('pointerdown', (event) => {

            const slot = event.target.closest?.('.hotbar-slot');

            if (!slot || this.state !== 'playing') {
                return;
            }

            event.preventDefault();

            const index = [...slot.parentElement.children].indexOf(slot);

            if (index >= 0 && index < 9) {
                this.input.keyPressed.add(`Digit${index + 1}`);
            }

        });

    }

    // --------------------------------------------------------

    // Stan aplikacji (main.js co klatkę). Przyciski widać w trakcie
    // gry, przy czacie i ekwipunku tylko "Zamknij", w menu i pauzie
    // nic. Po zmianie wszystko jest puszczone (żeby postać nie szła
    // sama, gdy palec został na joysticku).

    setState(state) {

        if (state === this.state) {
            return;
        }

        this.state = state;

        this.root.dataset.state = state;

        this.root.hidden = !['playing', 'chat', 'inventory'].includes(state);

        this.releaseAll();

    }


    releaseAll() {

        this.stickPointer = null;
        this.lookPointer = null;
        this.look = null;

        this.stick.classList.remove('active');

        // Joystick wraca na swoje miejsce (touch.css), gdzie czeka
        // przygaszony - żeby było widać, gdzie dotknąć.
        this.stick.style.left = '';
        this.stick.style.top = '';
        this.knob.style.transform = '';

        this.stopHold();

        this.setMove(0, 0);

        this.heldFrames.clear();
        this.pendingUp.clear();

        this.input.keys.Space = false;
        this.input.keys.ShiftLeft = false;

        for (const button of this.root.querySelectorAll('.touch-button.pressed')) {
            button.classList.remove('pressed');
        }

    }

}
