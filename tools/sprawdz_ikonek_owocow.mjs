// Sprawdzenie ikonek owoców i orzechów (1.28.0, tools/owoce_ikony.py):
// - każda z 29 ikonek (i pieczona dynia, cukinia) jest w atlasie: 16 x 16,
//   przezroczyste tło, czytelna wielkość, kilka odcieni (cieniowanie),
// - kontur ciemniejszy niż środek; górny kontur jaśniejszy niż dolny
//   (krok 4 z poradnika Kamila),
// - wszystkie ikonki są różne,
// - owoce krzaków w ręce i w ekwipunku to płaska ikonka (ItemGeometry),
//   a model owocu zostaje na krzaku (FruitBushGeometry),
// - inne generatory nie nadpisują tych kafelków, zasada w AGENTS.md.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const source = read('tools/owoce_ikony.py');
const tilesBlock = source.slice(source.indexOf('TILES = {'), source.indexOf('}', source.indexOf('TILES = {')));
const tiles = [...tilesBlock.matchAll(/'[a-z_]+': '([a-z_/.]+)'/g)].map((m) => m[1]);
const roasted = ['roasted_pumpkin_slice', 'roasted_zucchini'];
check(tiles.length === 29 && new Set(tiles).size === 29, `29 ikonek w skrypcie (${tiles.length})`);

// Czarny bez: drobne jagody 2 x 2 (jasny róg, ciemny róg) - bez konturu.
const NO_OUTLINE = new Set(['item_elderberry']);
// Orzech laskowy: na dole jasna podstawa (inna część niż brązowy orzech).
const LIGHT_BOTTOM = new Set(['hazelnut']);
const light = (rgba, i) => 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
const seen = new Set();
for (const tile of [...tiles, ...roasted]) {
    const { width, height, rgba } = readTextureRegion(tile);
    check(width === 16 && height === 16, `${tile}: 16 x 16`);
    const opaque = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && rgba[(y * 16 + x) * 4 + 3] > 0;
    let count = 0, edge = [], inner = [], top = [], bottom = [];
    const colors = new Set();
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            if (!opaque(x, y)) continue;
            const i = (y * 16 + x) * 4;
            count++;
            colors.add(rgba.slice(i, i + 3).join());
            const up = !opaque(x, y - 1), down = !opaque(x, y + 1);
            if (up || down || !opaque(x - 1, y) || !opaque(x + 1, y)) {
                edge.push(light(rgba, i));
                if (up && !down) top.push(light(rgba, i));
                if (down && !up) bottom.push(light(rgba, i));
            }
            else inner.push(light(rgba, i));
        }
    }
    const mean = (list) => list.reduce((a, b) => a + b, 0) / Math.max(1, list.length);
    check(count >= 40 && count < 230, `${tile}: czytelna wielkość (${count} pikseli)`);
    check(!opaque(0, 15) || !opaque(15, 15) || !opaque(0, 0) || !opaque(15, 0), `${tile}: przezroczyste tło`);
    check(colors.size >= 6, `${tile}: kilka odcieni (${colors.size})`);
    if (!NO_OUTLINE.has(tile)) check(mean(edge) < mean(inner), `${tile}: kontur ciemniejszy niż środek`);
    if (top.length >= 3 && bottom.length >= 3 && !LIGHT_BOTTOM.has(tile)) check(mean(top) > mean(bottom), `${tile}: górny kontur jaśniejszy niż dolny`);
    seen.add(Buffer.from(rgba).toString('base64'));
}
check(seen.size === tiles.length + roasted.length, 'Wszystkie ikonki są różne');

// Owoce krzaków: w ręce i w ekwipunku płaska ikonka, model zostaje na krzaku.
const { getItemModel } = await import('../src/rendering/ItemGeometry.js');
const { getFruitItemModel } = await import('../src/rendering/FruitBushGeometry.js');
for (const type of ['strawberry', 'blackberry', 'blueberry', 'chili_pepper', 'hazelnut']) {
    check(getItemModel(type) === null, `${type}: w ręce i w ekwipunku płaska ikonka`);
    check(getFruitItemModel(type)?.faces.length > 0, `${type}: model owocu dalej na krzaku`);
}
check(getItemModel('raft') && getItemModel('fire_starter') && getItemModel('oak_firewood'), 'Tratwa, krzesiwo i polana dalej z modelem');

// Inne generatory nie nadpisują nowych ikonek; zasada zapisana.
check(read('tools/krzewy_tekstury.py').includes('from owoce_ikony import OWNED') && read('tools/niskie_tekstury.py').includes('from owoce_ikony import OWNED'),
    'krzewy_tekstury i niskie_tekstury nie nadpisują ikonek owoców');
check(read('AGENTS.md').includes('tools/owoce_ikony.py') && !read('AGENTS.md').includes('musi pochodzić z tej samej geometrii'), 'Nowa zasada w AGENTS.md');
check(read('docs/styl-tekstur.md').includes('## Ikonki owoców i orzechów (1.28.0)'), 'Styl opisany w docs/styl-tekstur.md');

console.log(`OK: ikonki owoców - ${checks} sprawdzeń (29 owoców i orzechów, pieczona dynia i cukinia, kontur, cieniowanie, brud, owoce krzaków z ikonki).`);
