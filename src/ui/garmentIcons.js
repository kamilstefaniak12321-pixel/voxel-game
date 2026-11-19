// ------------------------------------------------------------
// IKONKI BARWIONYCH UBRAŃ (1.27.0)
//
// W atlasie każde ubranie ma ikonkę w naturalnym kolorze płótna
// (tools/ubrania_tekstury.py). Barwione albo wzorzyste ubranie
// przemalowuje się tutaj: każdy piksel zachowuje swoją jasność względem
// koloru płótna (światło, cień, obrys), a kolor bierze z barwnika;
// na pikselach wzoru (paski, krata, haft) - z barwnika wzoru.
// Gotowe ikonki trzymamy w pamięci (klucz: krój i wygląd).
// ------------------------------------------------------------

import { cleanLook, lookColors } from '../items/clothing.js';

const cache = new Map();

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = ([r, g, b]) => 0.3 * r + 0.59 * g + 0.11 * b;

// Kolor piksela ikonki (x, y w pikselach 16 x 16) - 'main' albo 'accent'.
export function iconPattern(pattern, x, y) {
    if (pattern === 'stripes') return y % 3 === 0 ? 'accent' : 'main';
    if (pattern === 'check') return x % 3 === 0 || y % 3 === 0 ? 'accent' : 'main';
    if (pattern === 'embroidery') return y % 5 === 4 && x % 2 === 0 ? 'accent' : 'main';
    return 'main';
}

// Przemalowuje piksele RGBA ikonki (size x size): natural - kolory
// płótna, colors - nowe (lookColors).
export function recolor(data, size, natural, colors) {
    const base = luminance(rgb(natural.main));
    const main = rgb(colors.main), accent = rgb(colors.accent);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            if (data[i + 3] === 0) continue;
            const k = luminance([data[i], data[i + 1], data[i + 2]]) / base;
            const px = Math.floor(x * 16 / size), py = Math.floor(y * 16 / size);
            // Obrys (dużo ciemniejszy od płótna) zostaje w kolorze głównym.
            const target = k > 0.7 && iconPattern(colors.pattern, px, py) === 'accent' ? accent : main;
            data[i] = Math.min(255, Math.round(target[0] * k));
            data[i + 1] = Math.min(255, Math.round(target[1] * k));
            data[i + 2] = Math.min(255, Math.round(target[2] * k));
        }
    }
    return data;
}

// Adres ikonki ubrania w jego wyglądzie. Dopóki się nie przemaluje -
// zwykła ikonka (onReady - gdy gotowa, np. odświeżenie okna).
export function garmentIcon(icons, item, onReady) {
    const plain = icons.get(item.type);
    const look = cleanLook(item.look);
    if (!plain || (!look.main && !look.accent && look.pattern === 'plain')) return plain;
    const key = `${item.type}|${look.pattern}|${look.main}|${look.accent}`;
    const cached = cache.get(key);
    if (typeof cached === 'string') return cached;
    if (cached) return plain;
    cache.set(key, true);
    const image = new Image();
    image.onload = () => {
        const size = image.width;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d');
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, size, size);
        recolor(pixels.data, size, lookColors(item.type, null), lookColors(item.type, look));
        context.putImageData(pixels, 0, 0);
        cache.set(key, canvas.toDataURL());
        onReady?.();
    };
    image.onerror = () => cache.delete(key);
    image.src = plain;
    return plain;
}
