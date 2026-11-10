// ------------------------------------------------------------
// SPRAWDZENIE WYGLĄDU EKWIPUNKU (drewniany / jasny)
//
// - ustawienie inventoryStyle: domyślnie drewniany, zła wartość
//   w zapisie wraca do domyślnej, jest na liście w Ustawieniach i ma napis,
// - src/ui/inventory-wood.css: każda reguła działa tylko przy
//   data-inv-style="wood" (jasny wygląd zostaje bez zmian), każdy
//   obrazek istnieje, a rozmiary w CSS to dokładnie 3 x rozmiar tekstury
//   (ostre piksele), wycinki ramki pasują do obrazków,
// - arkusz jest w index.html po inventory.css, main.js ustawia atrybut.
//
// Uruchomienie: node tools/sprawdz_wyglad_ekwipunku.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readTextureRegion } from './texture_regions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(ROOT, path), 'utf8');
const PIXEL = 3;

// Ustawienia czytają zapis z localStorage - atrapa z podanym zapisem.
function withSaved(saved) {
    globalThis.localStorage = {
        getItem: () => (saved === null ? null : JSON.stringify(saved)),
        setItem() {},
        removeItem() {}
    };
}

withSaved(null);
const { Settings, SETTINGS_DEFAULTS, SETTINGS_CHOICES } = await import('../src/settings/Settings.js');

assert.equal(SETTINGS_DEFAULTS.inventoryStyle, 'wood', 'domyślny wygląd ekwipunku to drewniany');
assert.deepEqual(SETTINGS_CHOICES.inventoryStyle, ['wood', 'light']);
assert.equal(new Settings().get('inventoryStyle'), 'wood');

for (const [value, expected] of [['light', 'light'], ['wood', 'wood'], ['plastik', 'wood'], [3, 'wood'], [null, 'wood']]) {
    withSaved({ revision: 2, inventoryStyle: value });
    assert.equal(new Settings().get('inventoryStyle'), expected, `zapis ${JSON.stringify(value)}`);
}

withSaved({ revision: 2, theme: 'lepidolit' });
assert.equal(new Settings().get('inventoryStyle'), 'wood', 'stary zapis bez ustawienia - drewniany');

const { TEXTS } = await import('../src/ui/texts.js');
assert.match(TEXTS.inventoryStyle('wood'), /Drewniany/);
assert.match(TEXTS.inventoryStyle('light'), /Jasny/);

const { SETTINGS_TABS } = await import('../src/ui/settingsLayout.js');
assert.ok(SETTINGS_TABS.look.includes('inventoryStyle'), 'ustawienie na zakładce Wygląd');
assert.equal(Object.values(SETTINGS_TABS).flat().filter(key => key === 'inventoryStyle').length, 1,
    'wygląd ekwipunku występuje w ustawieniach dokładnie raz');
assert.match(read('src/main.js'), /dataset\.invStyle = settings\.get\('inventoryStyle'\)/);
assert.match(read('src/commands/gameCommands.js'), /settings\.set\('inventoryStyle', value\)/, 'komenda /ekwipunek wyglad');

const html = read('index.html');
const layout = html.indexOf('src/ui/inventory.css');
const wood = html.indexOf('src/ui/inventory-wood.css');
assert.ok(layout > 0 && wood > layout, 'inventory-wood.css po inventory.css w index.html');


// --- CSS ----------------------------------------------------

const cssPath = 'src/ui/inventory-wood.css';
const css = read(cssPath).replace(/\/\*[\s\S]*?\*\//g, '');

// Selektory wszystkich reguł (także w @media) - każdy musi zaczynać się
// od :root[data-inv-style="wood"].
const PREFIX = ':root[data-inv-style="wood"]';
let rules = 0;
for (const match of css.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@media')) {
        continue;
    }
    for (const part of selector.split(',')) {
        rules++;
        assert.ok(part.trim().startsWith(PREFIX), `reguła poza wyglądem drewnianym: ${part.trim()}`);
    }
}
assert.ok(rules > 40, 'za mało reguł - czy plik się wczytał?');

// The real CSS variables point to isolated regions of the shared UI sheet.
// Decode their pixels too, so missing/out-of-bounds regions cannot pass.
const bindings = new Map([...read('src/ui/UiTextureSheets.js').matchAll(/'([^']+)': '([^']+)'/g)]
    .map(match => [match[1], match[2]]));
const images = new Map();
for (const match of css.matchAll(/var\(--texture-([a-z-]+)\)/g)) {
    const file = bindings.get(match[1]);
    assert.ok(file, `brak regionu dla zmiennej ${match[1]}`);
    const image = readTextureRegion(file);
    assert.ok(image.rgba.length === image.width * image.height * 4, `brak pikseli ${file}`);
    images.set(file.split('/').pop(), [image.width, image.height]);
}
for (const name of ['planks.png', 'board.png', 'frame.png', 'frame-compact.png']) {
    assert.ok(images.has(name), `CSS nie używa ${name}`);
}

// background-size = 3 x rozmiar tekstury.
for (const match of css.matchAll(/var\(--texture-wood-(planks|board)\)\s+0 0 \/ (\d+)px (\d+)px/g)) {
    const [w, h] = images.get(`${match[1]}.png`);
    assert.equal(Number(match[2]), w * PIXEL, `${match[1]}.png - szerokość w CSS`);
    assert.equal(Number(match[3]), h * PIXEL, `${match[1]}.png - wysokość w CSS`);
}

// border-image: wycinek x 3 = szerokość; obrazek to 2 wycinki + krawędzie.
let frames = 0;
for (const match of css.matchAll(/var\(--texture-wood-(frame(?:-compact)?)\)\s+(\d+)\s*\/\s*(\d+)px\s*\/\s*(\d+)(?:px)?/g)) {
    frames++;
    const [w, h] = images.get(`${match[1]}.png`);
    const slice = Number(match[2]);
    assert.equal(Number(match[3]), slice * PIXEL, `${match[1]}: szerokość ramki = wycinek x 3`);
    assert.ok(w > slice * 2 && h > slice * 2, `${match[1]}: obrazek większy niż dwa wycinki`);
    if (match[1] === 'frame') {
        // Część na zewnątrz (outset) to 12 pikseli tekstury.
        assert.equal(Number(match[4]), 12 * PIXEL, 'frame: outset = 12 pikseli tekstury');
        const [cw, ch] = images.get('frame-compact.png');
        assert.equal(w - cw, 24, 'frame-compact to frame bez 12 pikseli z każdej strony');
        assert.equal(h - ch, 24);
    }
    else {
        assert.equal(Number(match[4]), 0, 'frame-compact bez outsetu');
    }
}
assert.equal(frames, 2, 'dwie ramki (zwykła i na mały ekran)');

console.log(`OK: wygląd ekwipunku - ustawienie i zapis (6 przypadków), ${rules} selektorów tylko dla drewnianego, ${images.size} tekstur z rozmiarami x${PIXEL}, ramki.`);
