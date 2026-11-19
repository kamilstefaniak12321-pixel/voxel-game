// ------------------------------------------------------------
// UBRANIA NA POSTACI (1.27.0)
//
// Noszone ubrania (items/clothing.js) maluje się prosto na skórce
// 64 x 64 (player/skin.js, net/RemotePlayers.js) - model gracza się nie
// zmienia, a ubrania widać wszędzie tam, gdzie widać skórkę (postać
// z trzeciej osoby, podgląd w ekwipunku, inni gracze).
//
// Każda część ciała to klocek w układzie skórki Minecrafta (KLOCKI):
// boki klocka leżą w skórce jeden obok drugiego (prawy, przód, lewy,
// tył), więc pas boku to prostokąt 2 x (szerokość + głębokość) na
// wysokość - wzory (paski, krata) biegną dookoła bez szwu. Wiersz 0 to
// góra części ciała.
//
// Krój mówi, które części i wiersze pokrywa (CUTS) i na której warstwie:
// 'base' - zwykła (koszula, spodnie: pod nią znika wierzchnia warstwa
// skórki, żeby kurtka ze skórki nie zasłaniała koszuli), 'over' -
// wierzchnia, odrobinę większa (czapka, kamizelka, buty, dół tuniki).
// ------------------------------------------------------------

import { lookColors, garmentInfo, SLOTS } from '../items/clothing.js';

export const SKIN = 64;

// Klocki części ciała: [u, v, szerokość, wysokość, głębokość] dla
// warstwy zwykłej i wierzchniej (jak PARTS w PlayerModel.js).
export const BOXES = {
    head: { base: [0, 0, 8, 8, 8], over: [32, 0, 8, 8, 8] },
    body: { base: [16, 16, 8, 12, 4], over: [16, 32, 8, 12, 4] },
    armR: { base: [40, 16, 4, 12, 4], over: [40, 32, 4, 12, 4] },
    armL: { base: [32, 48, 4, 12, 4], over: [48, 48, 4, 12, 4] },
    legR: { base: [0, 16, 4, 12, 4], over: [0, 32, 4, 12, 4] },
    legL: { base: [16, 48, 4, 12, 4], over: [0, 48, 4, 12, 4] }
};

const ARMS = ['armR', 'armL'];
const LEGS = ['legR', 'legL'];

// Kroje: lista pokryć { parts, layer, rows: [od, do), top, bottom,
// open (rozcięcie z przodu - kamizelka), hem (wiersze brzegu do haftu),
// back (dłuższy tył - chusta) }; clear - czyści wierzchnią warstwę skórki.
export const CUTS = {
    cap: [{ parts: ['head'], layer: 'over', rows: [0, 3], top: true, hem: [2] }],
    scarf: [{ parts: ['head'], layer: 'over', rows: [0, 3], top: true, back: 7, hem: [2] }],
    headband: [{ parts: ['head'], layer: 'over', rows: [2, 4], hem: [] }],
    shirt: [
        { parts: ['body'], layer: 'base', rows: [0, 12], top: true, bottom: true, hem: [11], clear: true },
        { parts: ARMS, layer: 'base', rows: [0, 12], top: true, bottom: true, hem: [11], clear: true }
    ],
    vest: [{ parts: ['body'], layer: 'over', rows: [0, 11], top: true, open: true, hem: [10] }],
    tunic: [
        { parts: ['body'], layer: 'base', rows: [0, 12], top: true, bottom: true, hem: [], clear: true },
        { parts: ARMS, layer: 'base', rows: [0, 12], top: true, bottom: true, hem: [11], clear: true },
        { parts: LEGS, layer: 'over', rows: [0, 5], hem: [4] }
    ],
    trousers: [{ parts: LEGS, layer: 'base', rows: [0, 12], top: true, hem: [11], clear: true }],
    shorts: [{ parts: LEGS, layer: 'base', rows: [0, 6], top: true, hem: [5], clear: true }],
    boots: [{ parts: LEGS, layer: 'over', rows: [8, 12], bottom: true, hem: [8] }],
    lapcie: [{ parts: LEGS, layer: 'base', rows: [10, 12], bottom: true, hem: [], straps: true }]
};

// Kolejność malowania: od stóp do głowy (tunika na spodniach).
const ORDER = ['feet', 'legs', 'body', 'head'];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Kolor piksela ubrania. (sx, sy) - miejsce na pasie boku klocka,
// row - wiersz od góry części ciała, cover - pokrycie.
export function patternAt(pattern, sx, sy, row, cover) {
    if (pattern === 'stripes') return sy % 4 === 0 ? 'accent' : 'main';
    if (pattern === 'check') return sx % 4 === 0 || sy % 4 === 0 ? 'accent' : 'main';
    if (pattern === 'embroidery') {
        if (cover.hem.includes(row)) return 'accent';
        if (cover.hem.includes(row + 1) && sx % 2 === 0) return 'accent';
        if (row === cover.rows[0] && cover.top && sx % 3 === 1) return 'accent';
        return 'main';
    }
    return 'main';
}

// Delikatny splot: odrobinę jaśniejsze i ciemniejsze nitki.
const weave = (x, y) => [1, 0.97, 1.03, 0.95, 1][(x * 7 + y * 13) % 5];

function setPixel(data, x, y, color, k = 1) {
    const i = (y * SKIN + x) * 4;
    data[i] = Math.min(255, Math.round(color[0] * k));
    data[i + 1] = Math.min(255, Math.round(color[1] * k));
    data[i + 2] = Math.min(255, Math.round(color[2] * k));
    data[i + 3] = 255;
}

function clearPixel(data, x, y) {
    data[(y * SKIN + x) * 4 + 3] = 0;
}

// Maluje jedno pokrycie na danych pikseli skórki (RGBA, 64 x 64).
function paintCover(data, cover, colors) {
    const main = rgb(colors.main), accent = rgb(colors.accent);
    for (const part of cover.parts) {
        const [u, v, w, h, d] = BOXES[part][cover.layer];
        const width = 2 * (w + d);
        const [from, to] = cover.rows;
        // Boki: wiersze od..do (chusta - dłuższy tył).
        for (let sx = 0; sx < width; sx++) {
            const onBack = sx >= 2 * d + w;
            const onFront = sx >= d && sx < d + w;
            const last = cover.back && onBack ? Math.min(h, cover.back) : to;
            for (let row = from; row < last; row++) {
                // Rozcięcie kamizelki: środek przodu zostaje.
                if (cover.open && onFront && Math.abs(sx - (d + w / 2 - 0.5)) < 1) continue;
                const x = u + sx, y = v + d + row;
                let which = patternAt(colors.pattern, sx, row, row, cover);
                // Łapcie: skrzyżowane sznurki nad stopą.
                if (cover.straps) which = 'main';
                setPixel(data, x, y, which === 'accent' ? accent : main, weave(x, y) * (row === last - 1 ? 0.9 : 1));
            }
        }
        // Łapcie: sznurki oplatające kostkę (wiersze nad łapciem).
        if (cover.straps) {
            for (let sx = 0; sx < width; sx++) {
                for (let row = from - 3; row < from; row++) {
                    if ((sx + row) % 3 === 0) setPixel(data, u + sx, v + d + row, accent, 1.05);
                }
            }
        }
        // Góra i spód klocka.
        if (cover.top) {
            for (let x = u + d; x < u + d + w; x++) for (let y = v; y < v + d; y++) setPixel(data, x, y, main, weave(x, y) * 1.05);
        }
        if (cover.bottom) {
            for (let x = u + d + w; x < u + d + 2 * w; x++) for (let y = v; y < v + d; y++) setPixel(data, x, y, main, 0.8);
        }
    }
}

// Czyści wierzchnią warstwę skórki tam, gdzie leży ubranie (wiersze rows).
function clearOver(data, cover) {
    for (const part of cover.parts) {
        const [u, v, w, h, d] = BOXES[part].over;
        const width = 2 * (w + d);
        for (let sx = 0; sx < width; sx++) {
            for (let row = cover.rows[0]; row < Math.min(h, cover.rows[1]); row++) clearPixel(data, u + sx, v + d + row);
        }
        if (cover.top) for (let x = u + d; x < u + d + w; x++) for (let y = v; y < v + d; y++) clearPixel(data, x, y);
        if (cover.bottom) for (let x = u + d + w; x < u + d + 2 * w; x++) for (let y = v; y < v + d; y++) clearPixel(data, x, y);
    }
}

// Maluje noszone ubrania (equip: 4 stosy albo null - głowa, tułów, nogi,
// stopy) na danych pikseli skórki. Zwraca liczbę namalowanych ubrań.
export function paintClothes(data, equip = []) {
    let painted = 0;
    const bySlot = Object.fromEntries(SLOTS.map((slot, i) => [slot, equip[i] ?? null]));
    for (const slot of ORDER) {
        const item = bySlot[slot];
        const info = garmentInfo(item?.type);
        if (!info || info.slot !== slot) continue;
        const colors = lookColors(item.type, item.look);
        for (const cover of CUTS[info.kind]) {
            if (cover.clear) clearOver(data, cover);
            paintCover(data, cover, colors);
        }
        painted++;
    }
    return painted;
}

// Skórka z ubraniami na płótnie: base - płótno (albo obrazek) z samą
// skórką, target - kontekst 2d płótna tekstury.
export function composeSkin(target, base, equip = []) {
    target.clearRect(0, 0, SKIN, SKIN);
    target.drawImage(base, 0, 0, SKIN, SKIN);
    if (!equip.some(Boolean)) return 0;
    const image = target.getImageData(0, 0, SKIN, SKIN);
    const painted = paintClothes(image.data, equip);
    target.putImageData(image, 0, 0);
    return painted;
}
