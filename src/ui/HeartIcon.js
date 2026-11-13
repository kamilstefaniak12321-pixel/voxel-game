// ------------------------------------------------------------
// SERCE - WSKAŹNIK SAMOPOCZUCIA (0.95.0)
//
// Małe pixel-artowe serce w lewym górnym rogu ekranu (pomysł Kamila).
// Kolor mówi, jak czuje się gracz (stany - src/game/Wellbeing.js):
//
//   świetnie   - turkusowe, z błyskiem
//   dobrze     - czerwone
//   głodny     - żółte
//   zmęczony   - pomarańczowe, przygaszone
//   wyczerpany - szare, pęknięte
//
// Serce rysujemy na małym <canvas> (15 x 13 pikseli) powiększonym bez
// wygładzania. Bicie i drganie robi CSS (src/ui/hud.css - .heart),
// migotanie przy zmianie stanu - ten plik (naprzemiennie stary i nowy
// kolor, potem iskierki).
// ------------------------------------------------------------

// Kształt: # - serce, reszta pusta.
const SHAPE = [
    '..###...###..',
    '.#####.#####.',
    '#############',
    '#############',
    '#############',
    '.###########.',
    '..#########..',
    '...#######...',
    '....#####....',
    '.....###.....',
    '......#......'
];

// Piksele połysku (jasne) i pęknięcia (wyczerpany) - [x, y] w kształcie.
const SHINE = [[2, 1], [3, 1], [1, 2], [2, 2], [1, 3]];
const CRACK = [[6, 2], [7, 3], [6, 4], [5, 5], [6, 6], [7, 7], [6, 8]];

export const HEART_WIDTH = SHAPE[0].length + 2;
export const HEART_HEIGHT = SHAPE.length + 2;

// Kolory: wypełnienie, cień (prawy dół), połysk, obrys.
export const HEART_COLORS = {
    great: { fill: '#3fd6e0', shade: '#1f9bb5', shine: '#e6ffff', outline: '#0c3d4d' },
    good: { fill: '#e2413c', shade: '#a82230', shine: '#ffb3a8', outline: '#4a0d18' },
    hungry: { fill: '#e8c33a', shade: '#b98a1e', shine: '#fff3b0', outline: '#4d3608' },
    tired: { fill: '#cf7a2c', shade: '#96501b', shine: '#f2bd86', outline: '#40200a' },
    exhausted: { fill: '#8a8a90', shade: '#5f5f66', shine: '#b4b4ba', outline: '#26262b', crack: '#2c2c31' }
};

const inside = (x, y) => SHAPE[y]?.[x] === '#';

// Rysuje serce w danym stanie. white - całe na biało (błysk).
export function drawHeart(canvas, state, white = false) {
    const colors = HEART_COLORS[state] ?? HEART_COLORS.good;
    canvas.width = HEART_WIDTH;
    canvas.height = HEART_HEIGHT;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, HEART_WIDTH, HEART_HEIGHT);
    const dot = (x, y, color) => { context.fillStyle = color; context.fillRect(x + 1, y + 1, 1, 1); };

    // Obrys: puste piksele stykające się z sercem.
    for (let y = -1; y <= SHAPE.length; y++) {
        for (let x = -1; x <= SHAPE[0].length; x++) {
            if (inside(x, y)) continue;
            if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) dot(x, y, colors.outline);
        }
    }
    for (let y = 0; y < SHAPE.length; y++) {
        for (let x = 0; x < SHAPE[0].length; x++) {
            if (!inside(x, y)) continue;
            // Cień: piksele przy prawej i dolnej krawędzi.
            const edge = !inside(x + 1, y) || !inside(x, y + 1) || !inside(x + 1, y + 1);
            dot(x, y, white ? '#ffffff' : edge ? colors.shade : colors.fill);
        }
    }
    if (white) return;
    for (const [x, y] of SHINE) dot(x, y, colors.shine);
    if (colors.crack) for (const [x, y] of CRACK) dot(x, y, colors.crack);
}

// Kolejność stanów od najlepszego (do porównań: lepiej / gorzej).
const ORDER = ['great', 'good', 'hungry', 'tired', 'exhausted'];

// Migotanie przy zmianie: ile trwa i co ile zmienia się klatka.
const FLICKER_SECONDS = 0.7;
const FLICKER_STEP = 0.1;
const SPARKS = 6;

export class HeartIcon {

    // root - element, w którym serce ma stanąć.
    constructor(root) {
        this.root = root;
        this.root.classList.add('heart');
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'heart-pixels';
        this.root.replaceChildren(this.canvas);
        this.state = null;
        this.previous = null;
        this.flicker = 0;
        this.effect = null;
        this.effectLeft = 0;
    }

    // Stan z gry. Zmiana uruchamia migotanie (poza pierwszym razem).
    set(state) {
        if (state === this.state) return;
        const first = this.state === null;
        this.previous = this.state;
        this.state = state;
        this.root.dataset.state = state;
        if (first) {
            drawHeart(this.canvas, state);
            return;
        }
        const better = ORDER.indexOf(state) < ORDER.indexOf(this.previous);
        this.flicker = FLICKER_SECONDS;
        this.play(better ? 'up' : 'down', FLICKER_SECONDS + 0.5);
        if (better) this.sparkle();
    }

    // Krótka animacja: 'up', 'down', 'meal' (zaliczony posiłek),
    // 'rumble' (burczenie w brzuchu).
    play(effect, seconds = 0.6) {
        this.root.classList.remove(`heart-${this.effect}`);
        // Wymuszenie przeliczenia stylu - ta sama animacja rusza od nowa.
        void this.root.offsetWidth;
        this.effect = effect;
        this.effectLeft = seconds;
        this.root.classList.add(`heart-${effect}`);
    }

    // Iskierki: małe kwadraty rozlatujące się od serca.
    sparkle() {
        for (let i = 0; i < SPARKS; i++) {
            const spark = document.createElement('span');
            spark.className = 'heart-spark';
            const angle = (i / SPARKS) * Math.PI * 2 + 0.4;
            spark.style.setProperty('--dx', `${Math.round(Math.cos(angle) * 30)}px`);
            spark.style.setProperty('--dy', `${Math.round(Math.sin(angle) * 26)}px`);
            spark.style.background = HEART_COLORS[this.state].shine;
            this.root.append(spark);
            setTimeout(() => spark.remove(), 900);
        }
    }

    update(dt) {
        if (this.effectLeft > 0) {
            this.effectLeft -= dt;
            if (this.effectLeft <= 0) {
                this.root.classList.remove(`heart-${this.effect}`);
                this.effect = null;
            }
        }
        if (this.flicker <= 0) return;
        this.flicker -= dt;
        if (this.flicker <= 0) {
            drawHeart(this.canvas, this.state);
            return;
        }
        // Klatki: nowy kolor, biały błysk, stary kolor... coraz bliżej nowego.
        const frame = Math.floor((FLICKER_SECONDS - this.flicker) / FLICKER_STEP);
        if (frame % 3 === 1) drawHeart(this.canvas, this.state, true);
        else drawHeart(this.canvas, frame % 3 === 0 ? this.state : this.previous);
    }
}
