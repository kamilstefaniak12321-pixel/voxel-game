// ------------------------------------------------------------
// SPRAWDZENIE WYGODY (1.29.0)
//
// - pasek świeżości na ikonce stosu: kiedy jest, kolor, ekwipunek, pasek
//   bloków, kursor; w trybie twórczym go nie ma,
// - opis stosu na telefonie: przytrzymanie palca pokazuje opis, nie
//   bierze stosu,
// - ziemia pod celownikiem: kiedy widać napis, co mówi (pole, roślina,
//   ziemia z sadzonką / łopatą / kompostem w ręce, woda),
// - wyraźniejsze kamyki na rozgrzebanej ziemi kamienistej,
// - dokumentacja.
//
// Uruchomienie: node tools/sprawdz_wygody.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { readTextureRegion } from './texture_regions.mjs';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

let checks = 0;
const check = (ok, message) => { assert.ok(ok, message); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const R = await import('../src/blocks/BlockRegistry.js');
const F = await import('../src/items/freshness.js');
const H = await import('../src/ui/SoilHint.js');
const { WATER_GROWTH } = await import('../src/blocks/soil.js');

// --- Pasek świeżości ----------------------------------------------------------

check(F.freshBar({ type: 'stone', count: 3 }) === null, 'Kamień się nie psuje - bez paska');
check(F.freshBar({ type: 'raspberry', count: 3, fresh: 1 }) === null && F.freshBar({ type: 'raspberry', count: 3 }) === null, 'Prosto z krzaka - bez paska');
const half = F.freshBar({ type: 'raspberry', count: 3, fresh: 0.5 });
check(half && Math.abs(half.fresh - 0.5) < 1e-9 && half.color === 'hsl(60, 80%, 45%)', `Pół świeżości - żółty pasek do połowy (${half?.color})`);
check(F.freshBar({ type: 'raspberry', count: 1, fresh: 0.9 }).color === 'hsl(108, 80%, 45%)' && F.freshBar({ type: 'raspberry', count: 1, fresh: 0.05 }).color === 'hsl(6, 80%, 45%)',
    'Świeże - zielony, zaraz się zepsuje - czerwony');
check(F.freshBar(null) === null, 'Puste miejsce - bez paska');

const inventory = read('src/ui/InventoryScreen.js');
const hotbar = read('src/ui/Hotbar.js');
check(inventory.includes("el('span', 'inv-fresh')") && inventory.includes("freshBar(item, Boolean(this.game?.spoilage?.active))"), 'Ekwipunek i kursor: pasek tylko gdy jedzenie się psuje');
check(hotbar.includes("fresh.className = 'hotbar-fresh'") && hotbar.includes('bars[i].fresh.toFixed(2)') && read('src/main.js').includes('game.inventory.selected, Boolean(game.spoilage?.active))'),
    'Pasek bloków: pasek świeżości, odświeżany co setną');
const chest = read('src/ui/ChestView.js');
check(chest.includes('const bar = freshBar(item, spoiling);') && inventory.includes('this.chestView.render(renderer, 160, 0, Boolean(this.game?.spoilage?.active))'),
    'Skrzynia: pasek rysowany na obrazku skrzyni');
check(read('src/ui/inventory.css').includes('.inv-fresh {') && read('src/ui/hud.css').includes('.hotbar-fresh {'), 'Wygląd paska w CSS');

// --- Opis na telefonie ----------------------------------------------------------

check(/export const LONG_PRESS_MS = \d+;/.test(inventory) && inventory.includes("addEventListener('touchstart', (event) => this.onTouchStart(event), { passive: true })") &&
    inventory.includes("addEventListener('touchend', (event) => this.onTouchEnd(event), { passive: false })"), 'Przytrzymanie palca: nasłuch dotyku');
check(inventory.includes('this.updateTooltip({ target, clientX, clientY })') && inventory.includes('event.preventDefault();\n            this.pressed = false;'),
    'Po przytrzymaniu opis, a stos zostaje na miejscu');
check(inventory.includes('przytrzymanie - opis'), 'Podpowiedź na dole okna na telefonie');

// --- Ziemia pod celownikiem -------------------------------------------------------

const plant = Object.keys(R.BLOCK_TYPES).find((type) => R.getGrowth(type) && !R.getBlockDefinition(type).soil && R.getBlockDefinition(type).grows?.tree);
check(Boolean(plant), `Jest sadzonka do sprawdzenia (${plant})`);
function world(blocks) {
    const map = new Map(Object.entries(blocks).map(([key, type]) => [key, R.getBlockId(type)]));
    return { getBlockId: (x, y, z) => map.get(`${x},${y},${z}`) ?? 0 };
}
const at = { x: 0, y: 0, z: 0 };
check(JSON.stringify(H.soilHintTarget(world({ '0,0,0': 'tilled_compost' }), at, null)) === '{"x":0,"y":0,"z":0}', 'Pole - napis zawsze');
check(JSON.stringify(H.soilHintTarget(world({ '0,0,0': plant, '0,-1,0': 'humus' }), at, null)) === '{"x":0,"y":-1,"z":0}', 'Roślina - ziemia pod nią');
check(H.soilHintTarget(world({ '0,0,0': plant, '0,-1,0': 'stone' }), at, null) === null, 'Roślina nie na ziemi - bez napisu');
check(H.soilHintTarget(world({ '0,0,0': 'grass' }), at, null) === null && H.soilHintTarget(world({ '0,0,0': 'grass' }), at, 'stone') === null, 'Trawa z pustą ręką - bez napisu');
for (const held of [plant, 'shovel', 'compost']) {
    check(H.soilHintTarget(world({ '0,0,0': 'coarse_dirt' }), at, held) !== null, `Ziemia kamienista z ${held} w ręce - napis`);
}
check(H.soilHintTarget(world({ '0,0,0': 'stone' }), at, plant) === null && H.soilHintTarget(world({}), null, plant) === null, 'Kamień albo brak celu - bez napisu');

const label = (type) => R.getBlockDefinition(type).label.toLowerCase();
const rich = H.soilHintText({ type: 'tilled_compost', soil: true, growth: 1.5, water: true, total: 1.5 * WATER_GROWTH });
check(rich.text === `Wzrost: ${label('tilled_compost')} ×1,5 · woda ×1,25 = ×1,88` && rich.tone === 'rich', `Pole z kompostem przy wodzie (${rich.text})`);
const poor = H.soilHintText({ type: 'tilled_coarse', soil: true, growth: 0.7, water: false, total: 0.7 });
check(poor.text === `Wzrost: ${label('tilled_coarse')} ×0,7` && poor.tone === 'poor', `Pole kamieniste bez wody (${poor.text})`);
check(H.soilHintText({ type: 'grass', soil: true, growth: 1, water: false, total: 1 }).tone === 'plain', 'Zwykła ziemia - zwykły kolor');
check(H.caresAboutSoil('compost') && H.caresAboutSoil(plant) && !H.caresAboutSoil('stone') && !H.caresAboutSoil(null), 'Co w ręce włącza napis na zwykłej ziemi');
check(read('src/main.js').includes("soilHint.update(game, dt, state === 'playing' && game.cameraMode !== 'front')") && read('src/ui/hud.css').includes('#soil-hint {'),
    'Napis w pętli gry, tylko podczas grania');

// --- Kamyki na polu kamienistym ----------------------------------------------------

const light = (rgba, i) => 0.3 * rgba[i] + 0.59 * rgba[i + 1] + 0.11 * rgba[i + 2];
const sat = (rgba, i) => Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
const coarse = readTextureRegion('tilled_coarse').rgba, plain = readTextureRegion('tilled_dirt').rgba;
let pebbles = 0;
for (let i = 0; i < 16 * 16 * 4; i += 4) if (sat(coarse, i) < 60 && light(coarse, i) > 100) pebbles++;
let plainGrey = 0;
for (let i = 0; i < 16 * 16 * 4; i += 4) if (sat(plain, i) < 60 && light(plain, i) > 100) plainGrey++;
check(pebbles >= 10 && plainGrey === 0, `Na polu kamienistym widać kamyki (${pebbles} jasnych szarych pikseli, na zwykłym ${plainGrey})`);
check(read('tools/pola_tekstury.py').includes('PEBBLES_BIG'), 'Kamyki rysuje tools/pola_tekstury.py');

// --- Dokumentacja ---------------------------------------------------------------

check(read('docs/psucie.md').includes('Pasek świeżości') && !read('docs/psucie.md').includes('Świeżości nie widać na ikonce stosu'), 'docs/psucie.md: pasek świeżości');
check(read('docs/ziemia.md').includes('pod celownikiem') && !read('docs/ziemia.md').includes('Mnożnika nie widać na roślinie ani na polu'), 'docs/ziemia.md: napis pod celownikiem');

console.log(`OK: wygoda - ${checks} sprawdzeń (pasek świeżości, opis na telefonie, ziemia pod celownikiem, kamyki).`);
