import { TORCH_VARIANTS } from '../blocks/torches.js';

// Barwnik jest surowcem, nie blokiem. Cała paleta wynika z jednego
// katalogu pochodni; nazwa przedmiotu pozostaje stabilna w zapisie.
export const DYE_ITEMS = Object.fromEntries(TORCH_VARIANTS.filter(variant => variant.key !== 'plain')
    .map(variant => [`dye_${variant.key}`, {
        name: `${variant.key} dye`, label: variant.dyeLabel,
        icon: `dye_${variant.key}`, category: 'narzedzia', dye: variant.key,
        color: variant.dyeColor
    }]));

export function getDyeColor(type) {
    return typeof type === 'string' && Object.hasOwn(DYE_ITEMS, type) ? DYE_ITEMS[type].dye : null;
}

// Piksele oryginalnej ikonki proszku; rysowanie raz podczas składania
// atlasu, bez plików z cudzej gry i bez aktualizacji co klatkę.
export function drawDyeIcon(context, color, x = 0, y = 0, scale = 1) {
    const rgb = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16));
    const shade = factor => `rgb(${rgb.map(value => Math.min(255, Math.round(value * factor))).join(',')})`;
    const pixel = (px, py, width, height, fill) => {
        context.fillStyle = fill;
        context.fillRect(x + px * scale, y + py * scale, width * scale, height * scale);
    };
    pixel(3, 11, 10, 3, '#332c29');
    pixel(2, 10, 12, 2, '#332c29');
    pixel(4, 8, 8, 4, shade(.68));
    pixel(6, 6, 4, 5, color);
    pixel(4, 9, 8, 3, color);
    pixel(3, 11, 10, 1, color);
    pixel(6, 7, 2, 2, shade(1.35));
    pixel(4, 10, 2, 1, shade(1.2));
    pixel(8, 11, 3, 1, shade(.68));
    pixel(4, 4, 1, 1, color);
    pixel(10, 3, 2, 1, shade(1.2));
    pixel(12, 7, 1, 1, color);
}
