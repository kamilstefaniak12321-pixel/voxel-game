// ------------------------------------------------------------
// DARY PNIA (1.41.0, docs/dary-pnia.md)
//
// - zasady (blocks/treeGifts.js): które drzewo co daje, pory roku,
//   pora doby, grubość pnia, dzielenie soku między nacięcia,
// - prawdziwe TreeTaps na drzewach z generatora: nacinanie nożem
//   (żywe drzewo, bok pnia, limit nacięć), żywica, kubek pod sok,
//   zbiór, zdejmowanie kubka, zabliźnianie, ścięcie drzewa, zapis,
//   gra ze znajomymi (podpis), dalekie drzewa,
// - soki jako napoje, syrop klonowy nad ogniskiem, efekt orzeźwienia,
// - obraz (geometria nacięcia, kubka, kropli), komenda, osiągnięcia,
//   poradnik, podpięcie w grze.
//
// Uruchomienie: node tools/sprawdz_darow_pnia.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null,getTileMask=()=>null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('/src/rendering/ModelMaterial.js')) return {
            format: 'module', shortCircuit: true, source: 'export const createModelMaterial = (options) => ({ options, dispose() {} });'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId, getBlockTypeById } = await import('../src/blocks/BlockRegistry.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const G = await import('../src/blocks/treeGifts.js');
const T = await import('../src/game/TreeTaps.js');
const { scanTree } = await import('../src/game/TreeScan.js');
const { nextSeasonStart, SEASON_DAYS } = await import('../src/sky/Seasons.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { getFood, getRoast, roastSeconds, roastWord, kindLabel, ROAST_SECONDS, CUP } = await import('../src/items/foods.js');
const { getEffect } = await import('../src/items/effects.js');
const { spoilKind } = await import('../src/items/spoilage.js');
const { itemUses } = await import('../src/items/uses.js');
const { CUPS } = await import('../src/items/clay.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { stateSystems } = await import('../src/net/StateSync.js');
const R = await import('../src/rendering/TapRenderer.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, eps = 1e-6) => { assert.ok(Math.abs(actual - expected) <= eps, `${message}: ${actual} zamiast ${expected}`); checks++; };

// Doby gry w środku pór roku (0 wiosna ... 3 zima) w południe.
const mid = (season, part = 0.5) => Math.floor(nextSeasonStart(season, 1000) + SEASON_DAYS * part) + 0.5;
const SPRING = mid(0), SUMMER = mid(1), AUTUMN = mid(2), EARLY_WINTER = mid(3, 0.2), LATE_WINTER = mid(3, 0.8);

// ------------------------------------------------------------
// 1. Zasady.
// ------------------------------------------------------------
for (const [species, key] of Object.entries(G.TREE_GIFTS)) {
    check(TREE_NAMES.includes(species), `${species}: jest takie drzewo`);
    check(G.GIFTS[key], `${species}: dar ${key} istnieje`);
}
for (const [key, gift] of Object.entries(G.GIFTS)) {
    check(itemExists(gift.item), `${key}: przedmiot ${gift.item} istnieje`);
    check(gift.seasons.length === 4 && gift.seasons.every((flow) => flow >= 0), `${key}: cztery pory roku`);
    check(gift.max >= 1 && gift.perDay > 0 && gift.openDays > 0, `${key}: liczby`);
    check(gift.vessel === (gift.max === 1), `${key}: sok to jeden kubek, żywica - krople`);
    check(!gift.solid || gift.vessel, `${key}: bryłka ścina się w kubku`);
    check(G.flowSeasonsText(gift).length > 3, `${key}: opis pory`);
}
const conifers = ['pine', 'spruce', 'fir', 'larch', 'mugo', 'bristlecone', 'cedar', 'araucaria'];
equal(conifers.map(G.giftKey), conifers.map(() => 'resin'), 'Osiem iglastych daje żywicę');
equal(['birch', 'maple', 'coconut_palm', 'baobab'].map(G.giftKey), ['birch_sap', 'maple_sap', 'palm_sap', 'baobab_water'], 'Soki');
equal(['cherry', 'acacia', 'banyan', 'dragon_tree', 'rainbow_eucalyptus'].map(G.giftKey), ['tree_gum', 'tree_gum', 'latex', 'dragon_blood', 'kino'], 'Guma, lateks, smocza krew, kino (1.42.0)');
equal(Object.keys(G.GIFTS).length, 9, 'Dziewięć darów');
equal(Object.keys(G.TREE_GIFTS).length, 17, 'Siedemnaście drzew z darem');
for (const species of ['beech', 'olcha', 'aspen', 'jablon', 'olive', 'oak', 'linden', 'wierzba', 'sequoia', 'kapok']) equal(G.giftOf(species), null, `${species}: bez daru w tej wersji`);

const { resin, birch_sap: birch, maple_sap: maple, palm_sap: palm, baobab_water: water } = G.GIFTS;
equal([SPRING, SUMMER, AUTUMN, EARLY_WINTER].map((days) => G.seasonFlow(birch, days) > 0), [true, false, false, false], 'Brzoza: tylko wiosna');
equal([SPRING, SUMMER, AUTUMN, EARLY_WINTER, LATE_WINTER].map((days) => G.seasonFlow(maple, days) > 0), [true, false, false, false, true], 'Klon: od połowy zimy do końca wiosny');
check([SPRING, SUMMER, AUTUMN, LATE_WINTER].every((days) => G.seasonFlow(resin, days) > 0), 'Żywica: cały rok');
check(G.seasonFlow(resin, SUMMER) > G.seasonFlow(resin, SPRING) && G.seasonFlow(resin, SPRING) > G.seasonFlow(resin, LATE_WINTER), 'Żywica: latem najszybciej, zimą ledwo');
check([SPRING, SUMMER, AUTUMN, LATE_WINTER].every((days) => G.seasonFlow(palm, days) === 1 && G.seasonFlow(water, days) === 1), 'Palma i baobab: cały rok');
equal(G.flowSeasonsText(birch), 'wiosną', 'Opis: brzoza');
equal(G.flowSeasonsText(maple), 'od połowy zimy i wiosną', 'Opis: klon');
equal(G.flowSeasonsText(palm), 'cały rok', 'Opis: palma');
equal(G.flowSeasonsText(resin), 'cały rok, latem najszybciej', 'Opis: żywica');

// Pora doby: soki płyną za dnia; żywica i woda z baobabu - bez różnicy.
const noon = Math.floor(SPRING) + 0.5, midnight = Math.floor(SPRING) + 0.02;
check(G.dayFlow(birch, noon) === G.DAY_FLOW && G.dayFlow(birch, midnight) === G.NIGHT_FLOW, 'Sok: dzień i noc');
equal([G.dayFlow(resin, midnight), G.dayFlow(water, midnight), G.dayFlow(birch, midnight, true)], [1, 1, 1], 'Bez pory doby: żywica, woda, uśrednienie');
near((G.DAY_FLOW * 12 + G.NIGHT_FLOW * 12) / 24, 0.9, 'Średnio w dobie blisko 1', 0.11);
// Grubość i liczba nacięć.
const one = G.flowPerSecond(birch, noon, 1, 1);
near(one * G.DAY_SECONDS, birch.perDay * G.DAY_FLOW, 'Tempo: kubki na dobę');
near(G.flowPerSecond(birch, noon, 2, 1), one * 2, 'Gruby pień daje więcej');
near(G.flowPerSecond(birch, noon, 9, 1), one * G.MAX_WIDTH, 'Olbrzym nie leje strumieniem');
near(G.flowPerSecond(birch, noon, 1, 2) * 2, one, 'Dwa nacięcia dzielą sok');
equal(G.flowPerSecond(birch, SUMMER, 1, 1), 0, 'Latem brzoza nie daje');
equal([1, 2, 3, 6].map(G.tapsAllowed), [2, 4, 6, 6], 'Ile nacięć na pień');

// ------------------------------------------------------------
// 2. Świat do prób i prawdziwe TreeTaps.
// ------------------------------------------------------------
const GROUND = 10, BASE = GROUND + 1;
const DIRT = getBlockId('dirt');
function makeGame(days = SPRING) {
    const blocks = new Map();
    const world = {
        blocks, loaded: true,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? DIRT : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        setBlock(x, y, z, type) { blocks.set(`${x},${y},${z}`, getBlockId(type)); return true; },
        clearBlock(x, y, z) { blocks.set(`${x},${y},${z}`, 0); return true; },
        toChunkCoord: (value) => Math.floor(value / 16),
        getChunk: () => (world.loaded ? {} : null),
        getLight: () => ({ sky: 15, red: 0, green: 0, blue: 0 })
    };
    const items = new Map();
    const game = {
        world, mode: 'adventure', time: { days }, notices: [], events: [], spawned: [],
        onNotice: (text) => game.notices.push(text),
        achieve: (name, data) => game.events.push([name, data]),
        playBlockSound() {}, sounds: { play() {} },
        drops: { spawn: (type, count) => game.spawned.push([type, count]) },
        inventory: {
            items, selected: 0, full: false,
            canAdd: () => !game.inventory.full,
            add(type, count = 1) { items.set(type, (items.get(type) ?? 0) + count); return count; },
            take(_slot, count = 1) { game.inventory.taken = (game.inventory.taken ?? 0) + count; }
        }
    };
    game.taps = new T.TreeTaps(game);
    return game;
}
function plant(world, species, x, z, seed = 7) {
    const shape = buildTree(species, seed);
    for (const [dx, dy, dz, type] of shape.blocks ?? shape) world.blocks.set(`${x + dx},${BASE + dy},${z + dz}`, getBlockId(type));
    return shape;
}
const hitAt = (x, y, z, normal = { x: 1, y: 0, z: 0 }, world = null) => ({ hit: true, block: { x, y, z, type: world?.getBlock(x, y, z) }, normal });
const last = (game) => game.notices[game.notices.length - 1] ?? '';
// Czas małymi krokami (krótki krok liczy porę doby).
const tick = (taps, seconds) => { for (let left = seconds; left > 0; left -= 60) taps.step(Math.min(60, left)); };

equal([{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, null].map(T.faceOfNormal), [0, 1, 2, 3, -1, -1], 'Ściany');
equal([T.treeOf('birch'), T.treeOf('coconut_palm')], ['brzozy', 'palmy kokosowej'], 'Nazwy drzew w dopełniaczu');

// Każde drzewo z darem da się naciąć w pień metr nad ziemią.
for (const species of Object.keys(G.TREE_GIFTS)) {
    const game = makeGame();
    plant(game.world, species, 0, 0);
    // Pierwsza kłoda pnia nad ziemią (olbrzym: narożnik).
    // Kłoda pnia nisko nad ziemią (olbrzym: narożnik; banian: nie korzeń podporowy).
    let spot = null;
    for (let y = BASE; y <= BASE + 3 && !spot; y++) for (let x = -4; x <= 4 && !spot; x++) for (let z = -4; z <= 4 && !spot; z++) {
        if (game.taps.check(x, y, z).ok) spot = { x, y, z };
    }
    check(spot, `${species}: pień przy ziemi`);
    const result = game.taps.check(spot.x, spot.y, spot.z);
    check(result.ok && result.species === species && result.width >= 1, `${species}: można naciąć (${result.reason ?? ''})`);
}

// Sosna: nóż, żywica.
{
    const game = makeGame(SUMMER), { taps, world } = game;
    plant(world, 'pine', 0, 0);
    check(!taps.interact(hitAt(0, BASE, 0), null), 'Pusta ręka na zwykłym pniu - nie nasza sprawa');
    check(!taps.interact(hitAt(0, BASE, 0), 'axe'), 'Siekiera na pniu - nie nasza sprawa');
    check(!taps.interact(hitAt(0, BASE, 0), 'clay_cup'), 'Kubek na pniu bez nacięcia - nie nasza sprawa');
    check(taps.interact(hitAt(0, BASE, 0, { x: 0, y: 1, z: 0 }), 'knife') && taps.taps.size === 0 && last(game).includes('bok pnia'), 'Nóż w przekrój - nic');
    check(taps.interact(hitAt(0, BASE, 0, { x: 0, y: 0, z: -1 }), 'knife'), 'Nóż w bok pnia');
    const tap = taps.get({ x: 0, y: BASE, z: 0 });
    check(tap && tap.face === 3 && tap.species === 'pine' && tap.amount === 0 && tap.cup === null, 'Jest nacięcie');
    check(last(game).includes('żywica'), 'Napis o żywicy');
    equal(game.events[0][0], 'treeTapped', 'Zdarzenie');
    check(game.events[0][1].flowing === true && game.events[0][1].gift === 'resin' && game.events[0][1].full === false, 'Dane zdarzenia');
    check(taps.interact(hitAt(0, BASE, 0), null) && last(game).includes('dopiero się zbiera'), 'Jeszcze nic do zebrania');
    check(taps.interact(hitAt(0, BASE, 0), 'clay_cup') && tap.cup === null, 'Żywicy nie zbiera się do kubka');
    // Latem: 2 × 1.5 = 3 krople na dobę; po 1/3 doby jedna.
    taps.step(G.DAY_SECONDS / 3 + 1);
    equal(T.readyCount(tap), 1, 'Po jednej trzeciej doby - kropla');
    const version = taps.version;
    check(taps.interact(hitAt(0, BASE, 0), 'knife'), 'Zbiór także z nożem w ręce');
    equal(game.inventory.items.get('resin'), 1, 'Żywica w ekwipunku');
    check(tap.amount < 1 && taps.version > version, 'Kropla zdjęta, wersja rośnie');
    equal(game.events.at(-1), ['giftCollected', { species: 'pine', gift: 'resin', item: 'resin', count: 1 }], 'Zdarzenie zbioru');
    // Najwyżej trzy krople.
    taps.step(G.DAY_SECONDS * 3);
    equal(T.readyCount(tap), 3, 'Najwyżej trzy krople czekają');
    // Pełny ekwipunek.
    game.inventory.full = true;
    check(taps.interact(hitAt(0, BASE, 0), null) && last(game).includes('miejsca') && T.readyCount(tap) === 3, 'Pełny ekwipunek - żywica zostaje');
    game.inventory.full = false;
    // Zabliźnienie po 5 dobach: zostaje, póki jest żywica; po zbiorze znika.
    taps.step(G.DAY_SECONDS * 2);
    check(T.isHealed(tap) && taps.get(tap), 'Zabliźnione, ale z żywicą - zostaje');
    taps.interact(hitAt(0, BASE, 0), null);
    equal(taps.taps.size, 0, 'Po zbiorze zabliźnione nacięcie znika');
    equal(game.inventory.items.get('resin'), 4, 'Razem cztery krople');
}

// Drugie nacięcie w tym samym drzewie i limit.
{
    const game = makeGame(SUMMER), { taps, world } = game;
    plant(world, 'pine', 0, 0);
    taps.interact(hitAt(0, BASE, 0), 'knife');
    taps.interact(hitAt(0, BASE + 1, 0), 'knife');
    equal(taps.taps.size, 2, 'Dwa nacięcia w cienkim pniu');
    check(game.events.at(-1)[1].full === true && game.events.at(-1)[1].taps === 2, 'Drugie to już komplet');
    check(taps.interact(hitAt(0, BASE + 2, 0), 'knife') && taps.taps.size === 2 && last(game).includes('dość nacięć'), 'Trzeciego się nie da');
    const [first, second] = [...taps.taps.values()];
    equal(first.tree, second.tree, 'To samo drzewo');
    taps.step(G.DAY_SECONDS / 3);
    near(first.amount + second.amount, 1, 'Dwa nacięcia razem dają tyle, co jedno', 0.01);
}

// Brzoza: kubek, sok, pory.
{
    const game = makeGame(Math.floor(SPRING) + 0.5), { taps, world } = game;
    plant(world, 'birch', 4, 4);
    const hit = hitAt(4, BASE + 1, 4, { x: -1, y: 0, z: 0 });
    taps.interact(hit, 'knife');
    const tap = taps.get(hit.block);
    check(tap && last(game).includes('kubek'), 'Nacięcie w brzozie: podpowiedź o kubku');
    taps.step(G.DAY_SECONDS);
    equal(tap.amount, 0, 'Bez kubka sok kapie na ziemię');
    check(taps.interact(hit, null) && last(game).includes('powieś'), 'Pusta ręka: podpowiedź');
    check(taps.interact(hit, 'red_clay_cup') && tap.cup === 'red_clay_cup' && game.inventory.taken === 1, 'Kubek powieszony (z ekwipunku ubywa)');
    equal(game.events.at(-1)[0], 'cupHung', 'Zdarzenie kubka');
    check(taps.interact(hit, 'clay_cup') && tap.cup === 'red_clay_cup', 'Drugi kubek się nie mieści');
    // W południe: 2.5 × 1.4 kubka na dobę.
    const seconds = G.DAY_SECONDS / (birch.perDay * G.DAY_FLOW) / 2;
    tick(taps, seconds);
    near(tap.amount, 0.5, 'Po połowie czasu - pół kubka', 0.01);
    check(taps.interact(hit, null) && last(game).includes('w połowie') && last(game).includes('min'), 'Opis: w połowie pełny');
    equal(T.readyCount(tap), 0, 'Niepełnego się nie zbiera');
    tick(taps, seconds + 1);
    equal(T.readyCount(tap), 1, 'Kubek pełny');
    taps.step(G.DAY_SECONDS / 2);
    equal(tap.amount, 1, 'Nie przelewa się');
    check(taps.interact(hit, null), 'Zdjęcie pełnego kubka');
    equal(game.inventory.items.get('birch_sap'), 1, 'Sok brzozowy w ekwipunku');
    check(tap.cup === null && tap.amount === 0 && taps.get(tap), 'Kubek zdjęty, nacięcie zostaje');
    // Niepełny kubek: kucnięcie + pusta ręka.
    taps.interact(hit, 'clay_cup');
    taps.step(60);
    check(taps.interact(hit, null, true) && tap.cup === null && tap.amount === 0, 'Kucnięcie zdejmuje niepełny kubek');
    equal(game.inventory.items.get('clay_cup'), 1, 'Kubek wraca');
    check(last(game).includes('wylało'), 'Sok się wylał');
    // Zabliźnienie: nóż otwiera na nowo.
    taps.interact(hit, 'clay_cup');
    taps.step(G.DAY_SECONDS * 3);
    check(T.isHealed(tap) && tap.cup && tap.amount === 1, 'Zabliźnione z pełnym kubkiem');
    taps.interact(hit, null);
    equal(taps.taps.size, 0, 'Po zdjęciu kubka zabliźnione nacięcie znika');
    taps.interact(hit, 'knife');
    const again = taps.get(hit.block);
    again.age = birch.openDays * G.DAY_SECONDS; again.cup = 'clay_cup';
    check(taps.interact(hit, null) && last(game).includes('zabliźniło'), 'Opis zabliźnionego');
    check(taps.interact(hit, 'knife') && again.age === 0 && last(game).includes('na nowo'), 'Nóż otwiera nacięcie');
}

// Zła pora roku i noc.
{
    const game = makeGame(SUMMER), { taps, world } = game;
    plant(world, 'birch', 0, 0);
    const hit = hitAt(0, BASE, 0);
    taps.interact(hit, 'knife');
    check(last(game).includes('suche') && last(game).includes('wiosną'), 'Latem brzoza: nacięcie suche');
    check(game.events.at(-1)[1].flowing === false, 'Zdarzenie: nie płynie');
    taps.interact(hit, 'clay_cup');
    taps.step(G.DAY_SECONDS);
    equal(taps.get(hit.block).amount, 0, 'Latem nic nie nakapie');
    check(taps.interact(hit, null) && last(game).includes('suche'), 'Opis: suche');

    const night = makeGame(Math.floor(SPRING) + 0.02), day = makeGame(Math.floor(SPRING) + 0.5), long = makeGame(Math.floor(SPRING) + 0.02);
    for (const g of [night, day, long]) { plant(g.world, 'birch', 0, 0); g.taps.interact(hit, 'knife'); g.taps.interact(hit, 'clay_cup'); }
    night.taps.step(100); day.taps.step(100); long.taps.step(300);
    near(day.taps.get(hit.block).amount / night.taps.get(hit.block).amount, G.DAY_FLOW / G.NIGHT_FLOW, 'Za dnia płynie szybciej niż nocą', 0.01);
    near(long.taps.get(hit.block).amount, birch.perDay * 300 / G.DAY_SECONDS, 'Długi krok liczy się bez pory doby', 1e-6);
}

// Klon, palma, baobab; gruby pień.
{
    const game = makeGame(LATE_WINTER), { taps, world } = game;
    plant(world, 'maple', 0, 0);
    taps.interact(hitAt(0, BASE, 0), 'knife');
    check(game.events.at(-1)[1].flowing === true && game.events.at(-1)[1].gift === 'maple_sap', 'Klon na przedwiośniu płynie');
    const early = makeGame(EARLY_WINTER);
    plant(early.world, 'maple', 0, 0);
    early.taps.interact(hitAt(0, BASE, 0), 'knife');
    check(early.events.at(-1)[1].flowing === false, 'Klon na początku zimy - nie');

    const savanna = makeGame(AUTUMN);
    plant(savanna.world, 'baobab', 0, 0);
    let spot = null;
    for (let x = -4; x <= 4 && !spot; x++) for (let z = -4; z <= 4 && !spot; z++) if (savanna.taps.check(x, BASE + 1, z).ok) spot = { x, z };
    check(spot, 'Baobab (nie do ścięcia) da się naciąć');
    const hit = hitAt(spot.x, BASE + 1, spot.z);
    savanna.taps.interact(hit, 'knife'); savanna.taps.interact(hit, 'clay_cup');
    savanna.taps.step(G.DAY_SECONDS);
    savanna.taps.interact(hit, null);
    equal(savanna.inventory.items.get('baobab_water'), 1, 'Woda z baobabu');
}

// Druga połowa (1.42.0): guma latem, lateks z kubkiem wraca jako bryłka + kubek.
{
    const { tree_gum: gum, latex, dragon_blood: blood, kino } = G.GIFTS;
    equal([SPRING, SUMMER, AUTUMN, LATE_WINTER].map((days) => G.seasonFlow(gum, days) > 0), [false, true, false, false], 'Guma: tylko lato');
    equal([SPRING, SUMMER, AUTUMN, LATE_WINTER].map((days) => G.seasonFlow(kino, days) > 0), [false, true, false, false], 'Kino: tylko lato');
    check([SPRING, SUMMER, AUTUMN, LATE_WINTER].every((days) => G.seasonFlow(latex, days) === 1 && G.seasonFlow(blood, days) === 1), 'Lateks i smocza krew: cały rok');
    check(blood.perDay < gum.perDay, 'Smocza krew płynie powoli');
    check(latex.solid && !latex.byDay, 'Lateks ścina się w kubku');

    const game = makeGame(SUMMER), { taps, world } = game;
    plant(world, 'cherry', 0, 0);
    taps.interact(hitAt(0, BASE, 0), 'knife');
    check(last(game).includes('guma drzewna'), 'Wiśnia: guma');
    taps.step(G.DAY_SECONDS);
    taps.interact(hitAt(0, BASE, 0), null);
    equal(game.inventory.items.get('tree_gum'), 2, 'Dwie łzy gumy na dobę');

    const jungle = makeGame(AUTUMN);
    jungle.inventory.canAddAll = (items) => !jungle.inventory.full && items.length === 2;
    plant(jungle.world, 'banyan', 0, 0);
    let spot = null;
    for (let x = -4; x <= 4 && !spot; x++) for (let z = -4; z <= 4 && !spot; z++) for (let y = BASE; y <= BASE + 3 && !spot; y++) if (jungle.taps.check(x, y, z).ok) spot = { x, y, z };
    check(spot, 'Banian da się naciąć');
    const hit = hitAt(spot.x, spot.y, spot.z);
    jungle.taps.interact(hit, 'knife'); jungle.taps.interact(hit, 'white_clay_cup');
    jungle.taps.step(G.DAY_SECONDS);
    jungle.inventory.full = true;
    check(jungle.taps.interact(hit, null) && jungle.taps.get(hit.block).cup === 'white_clay_cup', 'Pełny ekwipunek: lateks zostaje');
    jungle.inventory.full = false;
    check(jungle.taps.interact(hit, null) && last(jungle).includes('kubek wraca'), 'Zbiór lateksu');
    equal([jungle.inventory.items.get('latex'), jungle.inventory.items.get('white_clay_cup')], [1, 1], 'Bryłka i ten sam kubek w ekwipunku');
    equal(jungle.taps.get(hit.block).cup, null, 'Kubka pod nacięciem już nie ma');

    for (const [species, item] of [['dragon_tree', 'dragon_blood'], ['rainbow_eucalyptus', 'kino'], ['acacia', 'tree_gum']]) {
        const g = makeGame(SUMMER);
        plant(g.world, species, 0, 0);
        let at = null;
        for (let x = -3; x <= 3 && !at; x++) for (let z = -3; z <= 3 && !at; z++) for (let y = BASE; y <= BASE + 3 && !at; y++) if (g.taps.check(x, y, z).ok) at = { x, y, z };
        check(at, `${species}: da się naciąć`);
        g.taps.interact(hitAt(at.x, at.y, at.z), 'knife');
        g.taps.step(G.DAY_SECONDS * 2);
        g.taps.interact(hitAt(at.x, at.y, at.z), null);
        check(g.inventory.items.get(item) >= 2, `${species}: ${item}`);
    }
}

// Nie da się: pień postawiony ręką, drzewo bez daru, okorowany pień.
{
    const game = makeGame(), { taps, world } = game;
    for (let y = 0; y < 4; y++) world.setBlock(0, BASE + y, 0, 'pine_log');
    check(taps.interact(hitAt(0, BASE + 1, 0), 'knife') && taps.taps.size === 0 && last(game).includes('żywego'), 'Słup pni bez korony');
    plant(world, 'beech', 20, 0);
    check(taps.interact(hitAt(20, BASE, 0), 'knife') && taps.taps.size === 0 && last(game).includes('buka') && last(game).includes('nic nie pocieknie'), 'Buk nic nie daje');
    world.setBlock(40, BASE, 0, 'birch_log_stripped');
    check(!taps.interact(hitAt(40, BASE, 0), 'knife'), 'Okorowany pień - nie nasza sprawa');
    world.setBlock(42, BASE, 0, 'birch_log_x');
    check(!taps.interact(hitAt(42, BASE, 0), 'knife'), 'Leżący pień - nie nasza sprawa');
    equal(game.events.length, 0, 'Bez zdarzeń');
}

// Pień znika: kubek i żywica spadają. Ścięcie: nacięcie w pniaku.
{
    const game = makeGame(SPRING), { taps, world } = game;
    plant(world, 'birch', 0, 0); plant(world, 'pine', 30, 0);
    const a = hitAt(0, BASE, 0), b = hitAt(30, BASE, 0);
    taps.interact(a, 'knife'); taps.interact(a, 'clay_cup'); taps.interact(b, 'knife');
    taps.step(G.DAY_SECONDS);
    world.loaded = false;
    world.clearBlock(0, BASE, 0);
    taps.step(1);
    equal(taps.taps.size, 2, 'Teren niewczytany - nacięcie czeka');
    world.loaded = true;
    taps.step(1);
    equal(taps.taps.size, 1, 'Pień wykopany - nacięcie znika');
    equal(game.spawned, [['clay_cup', 1]], 'Kubek spada na ziemię');
    world.setBlock(30, BASE, 0, 'pine_log_stripped');
    taps.step(1);
    equal(taps.taps.size, 0, 'Pień okorowany - nacięcie znika');
    equal(game.spawned[1], ['resin', 2], 'Zastygła żywica spada');

    plant(world, 'birch', 60, 0);
    const c = hitAt(60, BASE, 0);
    taps.interact(c, 'knife'); taps.interact(c, 'clay_cup');
    const scan = scanTree(world, 60, BASE + 1, 0);
    check(scan.trunk && scan.stump.some((cell) => cell.y === BASE), 'Cięcie metr wyżej: nacięcie jest w pniaku');
    taps.felled([...scan.cut, ...scan.stump]);
    equal(taps.taps.size, 0, 'Ścięte drzewo: nacięcie w pniaku znika');
    equal(game.spawned.at(-1), ['clay_cup', 1], 'Kubek z pniaka spada');
    // Gość w grze ze znajomymi niczego nie zrzuca (robi to gospodarz).
    plant(world, 'birch', 90, 0);
    taps.interact(hitAt(90, BASE, 0), 'knife'); taps.interact(hitAt(90, BASE, 0), 'clay_cup');
    game.net = { isClient: true };
    const before = game.spawned.length;
    world.clearBlock(90, BASE, 0);
    taps.step(1);
    check(taps.taps.size === 0 && game.spawned.length === before, 'Gość: nacięcie znika bez zrzutu');
}

// Tryb twórczy: kubek nie ubywa.
{
    const game = makeGame(SPRING);
    game.mode = 'creative';
    plant(game.world, 'birch', 0, 0);
    game.taps.interact(hitAt(0, BASE, 0), 'knife'); game.taps.interact(hitAt(0, BASE, 0), 'clay_cup');
    check(game.taps.get({ x: 0, y: BASE, z: 0 }).cup && !game.inventory.taken, 'Tryb twórczy: kubek zostaje w ręce');
}

// Zapis, odczyt, śmieci w zapisie, podpis.
{
    const game = makeGame(SPRING), { taps, world } = game;
    plant(world, 'birch', 0, 0); plant(world, 'pine', 30, 0);
    taps.interact(hitAt(0, BASE, 0), 'knife'); taps.interact(hitAt(0, BASE, 0), 'white_clay_cup'); taps.interact(hitAt(30, BASE, 0, { x: 0, y: 0, z: 1 }), 'knife');
    taps.step(500);
    const saved = JSON.parse(JSON.stringify(taps.getState()));
    equal(saved.length, 2, 'Dwa wpisy w zapisie');
    const loaded = new T.TreeTaps(game, saved);
    equal(loaded.getState(), saved, 'Zapis i odczyt dają to samo');
    check(loaded.get({ x: 0, y: BASE, z: 0 }).cup === 'white_clay_cup' && loaded.get({ x: 30, y: BASE, z: 0 }).face === 2, 'Kubek i ściana wracają');
    const junk = [null, 7, {}, { x: 0, y: -1, z: 0, face: 0, species: 'pine' }, { x: 0, y: 5, z: 0, face: 9, species: 'pine' }, { x: 0, y: 5, z: 0, face: 0, species: 'beech' },
        { x: 1.5, y: 5, z: 0, face: 0, species: 'pine' }, { x: 0, y: 5, z: 0, face: 0, species: 'pine', amount: 99, age: -5, cup: 'clay_cup', width: 100, tree: 5 },
        { x: 2, y: 5, z: 0, face: 1, species: 'birch', amount: NaN, cup: 'bomb' }];
    const cleaned = new T.TreeTaps(game, junk);
    equal(cleaned.taps.size, 2, 'Śmieci w zapisie odpadają');
    const fixed = cleaned.get({ x: 0, y: 5, z: 0 });
    check(fixed.amount === 3 && fixed.age === 0 && fixed.cup === null && fixed.width === 9 && typeof fixed.tree === 'string', 'Wartości przycięte (żywica bez kubka)');
    check(cleaned.get({ x: 2, y: 5, z: 0 }).amount === 0 && cleaned.get({ x: 2, y: 5, z: 0 }).cup === null, 'NaN i obcy kubek odpadają');
    equal(new T.TreeTaps(game, 'x').taps.size, 0, 'Zapis nie będący listą');
    // Podpis zmienia się z ilością co ćwierć, kubkiem i zabliźnieniem.
    const tap = T.newTap(0, 5, 0, 0, 'birch', 't', 1);
    const signs = new Set([T.tapSign(tap)]);
    tap.cup = 'clay_cup'; signs.add(T.tapSign(tap));
    tap.amount = 0.5; signs.add(T.tapSign(tap));
    tap.age = 3 * G.DAY_SECONDS; signs.add(T.tapSign(tap));
    equal(signs.size, 4, 'Podpis rozróżnia stany');
    tap.amount = 0.52;
    check(signs.has(T.tapSign(tap)), 'Drobna zmiana nie zmienia podpisu');
    // Gra ze znajomymi: system "taps".
    const systems = stateSystems({ treeTaps: taps });
    check(systems.taps && systems.taps.map() === taps.taps && systems.taps.restore === T.restoreTap && systems.taps.sign === T.tapSign, 'StateSync zna nacięcia');
    const version = taps.version; systems.taps.changed();
    equal(taps.version, version + 1, 'Zmiana z sieci podbija wersję');
    // Limit wpisów.
    const many = makeGame();
    for (let i = 0; i < T.TAP_LIMIT + 5; i++) many.taps.cut(i, 20, 0, 0, 'pine');
    check(many.taps.taps.size === T.TAP_LIMIT && !many.taps.get({ x: 0, y: 20, z: 0 }) && many.spawned.length === 0, 'Limit: znikają najstarsze, bez zrzutu');
    // update zbiera czas do kroku.
    const slow = makeGame(SUMMER);
    slow.taps.cut(0, 20, 0, 0, 'pine'); slow.world.setBlock(0, 20, 0, 'pine_log');
    slow.taps.update(0.4); slow.taps.update(0.4);
    equal(slow.taps.get({ x: 0, y: 20, z: 0 }).age, 0, 'Poniżej sekundy - bez kroku');
    slow.taps.update(0.4);
    near(slow.taps.get({ x: 0, y: 20, z: 0 }).age, 1.2, 'Krok po sekundzie');
    slow.taps.advance(1000);
    near(slow.taps.get({ x: 0, y: 20, z: 0 }).age, 1001.2, 'Przespany czas');
}

// ------------------------------------------------------------
// 3. Napoje i syrop.
// ------------------------------------------------------------
for (const type of ['birch_sap', 'maple_sap', 'palm_sap', 'baobab_water', 'maple_syrup']) {
    const food = getFood(type);
    check(food && food.kind === 'drink' && food.returns === CUP, `${type}: napój, oddaje kubek`);
    check(food.effects.every((effect) => getEffect(effect)), `${type}: efekty istnieją`);
    check(['sok', 'woda', 'syrop'].includes(kindLabel(type)), `${type}: nazwa rodzaju`);
    equal(spoilKind(type), null, `${type}: nie psuje się`);
    check(itemUses(type).some((line) => line.startsWith(`do picia: ${food.word}`)), `${type}: opis zastosowania`);
    check(getItemLabel(type).length > 3, `${type}: nazwa`);
}
equal(kindLabel('tea_calm'), 'napar', 'Napar zostaje naparem');
equal(kindLabel('strawberry'), 'lekka przekąska', 'Przekąska zostaje przekąską');
check(getEffect('refresh').drain < 1 && getFood('baobab_water').effects.includes('refresh'), 'Orzeźwienie');
equal(getRoast('maple_sap'), 'maple_syrup', 'Sok klonowy -> syrop');
check(roastSeconds('maple_sap') > ROAST_SECONDS * 2 && roastSeconds('jablon_jablko') === ROAST_SECONDS && roastSeconds('brew_calm') === ROAST_SECONDS, 'Syrop odparowuje się długo');
equal([roastWord('maple_sap'), roastWord('brew_calm'), roastWord('jablon_jablko')], ['odparowywanie', 'parzenie', 'pieczenie'], 'Słowa nad ogniskiem');
check(getFood('maple_syrup').energy > getFood('maple_sap').energy * 3, 'Syrop syci dużo bardziej niż sok');
check(itemUses('maple_sap').some((line) => line.includes('odparowywanie') && line.includes('Syrop klonowy')), 'Opis soku: syrop');
check(CUPS.length === 3 && CUPS.includes(CUP), 'Trzy kubki');
const campfires = read('src/game/Campfires.js');
check(campfires.includes('roastSeconds(type)') && campfires.includes('roastWord(type)'), 'Ognisko liczy czas i słowo z foods.js');

// ------------------------------------------------------------
// 3b. Druga połowa: klej, naprawa siekiery, lateks na ubraniu, barwniki,
//     garbnik, napar z kory wierzby (1.42.0).
// ------------------------------------------------------------
{
    const { GROUPS, RECIPES } = await import('../src/crafting/recipes.js');
    const { gridResult } = await import('../src/crafting/Crafting.js');
    const W = await import('../src/items/toolWear.js');
    const C = await import('../src/items/clothing.js');
    const { feltTemperature, WET_CLOTHES } = await import('../src/game/Warmth.js');
    const recipe = (id) => RECIPES.find((entry) => entry.id === id);
    const grid = (...items) => [...items.map((item) => (typeof item === 'string' ? { type: item, count: 1 } : item)), null, null, null, null].slice(0, 4);

    for (const type of ['tree_gum', 'latex', 'dragon_blood', 'kino', 'pitch_glue', 'tannin', 'brew_willow', 'tea_willow']) {
        check(itemExists(type) && getItemLabel(type).length > 3, `${type}: przedmiot`);
        check(itemUses(type).length > 0, `${type}: ma zastosowanie`);
    }
    // Klej jako spoiwo.
    equal(GROUPS.glue.types, ['tree_gum', 'latex'], 'Grupa kleju');
    check(['resin', 'tree_gum', 'latex'].every((type) => GROUPS.oil.types.includes(type)) && GROUPS.oil.label.includes('guma'), 'Guma i lateks zastępują żywicę');
    equal(gridResult(grid('stick', 'tree_gum'))?.type, 'torch', 'Pochodnia na gumie');
    equal(gridResult(grid('stick', 'latex'))?.type, 'torch', 'Pochodnia na lateksie');
    // Smoła klejąca.
    equal([gridResult(grid('tree_gum', 'resin'))?.type, gridResult(grid('latex', 'resin'))?.count], ['pitch_glue', 2], 'Smoła: klej + żywica');
    equal(gridResult(grid('tree_gum', 'tree_gum')), null, 'Sama guma to nie smoła');
    // Naprawa siekiery.
    check(recipe('axe_repair').repair === true, 'Przepis naprawy');
    equal(gridResult(grid('axe', 'pitch_glue')), null, 'Całej siekiery się nie klei');
    const worn = gridResult(grid({ type: 'axe_granite', count: 1, fresh: 0.15 }, 'pitch_glue'));
    check(worn.type === 'axe_granite' && worn.count === 1 && Math.abs(worn.fresh - 0.55) < 1e-9, 'Naprawa: ta sama siekiera, stan +0,4');
    near(gridResult(grid('pitch_glue', { type: 'axe', count: 1, fresh: 0.6 })).fresh, W.REPAIR_MAX, 'Naprawa: najwyżej cztery piąte');
    equal(gridResult(grid({ type: 'axe', count: 1, fresh: 0.8 }, 'pitch_glue')), null, 'Sklejonej do pełna już się nie poprawi');
    equal(gridResult(grid({ type: 'axe', count: 1, fresh: 0.79 }, 'pitch_glue')).fresh, 0.8, 'Tuż pod progiem - do progu');
    equal(gridResult(grid('knife', 'pitch_glue')), null, 'Nóż się nie zużywa - nie ma czego kleić');
    equal([W.repairedCondition(null), W.repairedCondition({ type: 'stick' }), W.repairedCondition({ type: 'axe' }), W.repairedCondition({ type: 'axe', fresh: 0 })], [null, null, null, 0.4], 'repairedCondition');
    check(W.REPAIR_MAX < 1 && W.REPAIR_GAIN > 0 && W.wearStage(W.REPAIR_MAX) === 'whole', 'Klejona nie jest jak nowa, ale jest cała');
    // Naprawa na prawdziwym ekwipunku (księga przepisów, /wytworz): stan
    // siekiery nie ginie w siatce - także przy zwykłych przepisach.
    {
        const { Inventory } = await import('../src/game/Inventory.js');
        const { craftFromInventory } = await import('../src/crafting/Crafting.js');
        const inventory = new Inventory({ slots: new Array(36).fill(null) });
        inventory.add('axe_granite', 1, 0, 36, 0.15); inventory.add('pitch_glue', 3); inventory.add('oak_log', 1); inventory.add('shirt_linen', 1, 0, 36, undefined, { proof: true, main: 'red' });
        const state = () => Object.fromEntries(inventory.slots.filter(Boolean).map((item) => [item.type, item.fresh ?? item.look ?? item.count]));
        equal(craftFromInventory(inventory, recipe('axe_repair'), 1), 1, 'Naprawa z ekwipunku');
        equal([state().axe_granite, state().pitch_glue], [0.55, 2], 'Siekiera 15% -> 55%, smoły ubyło');
        craftFromInventory(inventory, recipe('axe_repair'), 1);
        equal(craftFromInventory(inventory, recipe('axe_repair'), 1), 0, 'Trzeci raz się nie da');
        equal([state().axe_granite, state().pitch_glue], [0.8, 1], 'Siekiera 80%, smoła została');
        const firewood = RECIPES.find((entry) => entry.id === 'oak_firewood');
        equal(craftFromInventory(inventory, firewood, 1), 1, 'Polana siekierą z księgi przepisów');
        equal(state().axe_granite, 0.8, 'Siekiera wraca z siatki w tym samym stanie (nie jak nowa)');
        const taken = inventory.removeStack('shirt_linen', 1);
        check(taken.look.proof === true && taken.look.main === 'red' && inventory.removeStack('shirt_linen', 1) === null, 'removeStack oddaje wygląd ubrania');
        inventory.add('strawberry', 2, 0, 36, 0.5); inventory.add('strawberry', 2, 0, 36, 1);
        const berries = inventory.removeStack('strawberry', 4);
        check(berries.count === 4 && Math.abs(berries.fresh - 0.75) < 1e-9, 'removeStack: średnia świeżość zabranych');
        equal(inventory.remove('pitch_glue', 5), 1, 'remove dalej zwraca, ile zabrało');
    }
    // Barwniki.
    equal([gridResult(grid('dragon_blood'))?.type, gridResult(grid('dragon_blood'))?.count], ['dye_red', 2], 'Smocza krew: czerwony');
    equal([gridResult(grid('kino'))?.type, gridResult(grid('kino'))?.count], ['dye_brown', 2], 'Kino: brązowy');
    equal(gridResult(grid('tannin'))?.type, 'dye_black', 'Garbnik: czarny');
    // Garbnik z moczenia.
    equal(['oak_bark', 'mangrove_bark', 'sequoia_bark', 'linden_bark', 'birch_bark'].map(C.retsInto), ['tannin', 'tannin', 'tannin', 'bast', null], 'Moczenie kory');
    check(GROUPS.tannin_bark.types.every((type) => itemExists(type) && C.retsInto(type) === 'tannin'), 'Grupa kory z garbnikiem');
    // Napar z kory wierzby.
    equal(gridResult(grid('clay_cup', 'wierzba_bark', 'wierzba_bark'))?.type, 'brew_willow', 'Kubek kory wierzbowej');
    equal(gridResult(grid('clay_cup', 'wierzba_bark')), null, 'Jedna kora to za mało');
    equal(getRoast('brew_willow'), 'tea_willow', 'Nad ogniskiem - napar');
    equal(roastWord('brew_willow'), 'parzenie', 'Parzenie');
    const willow = getFood('tea_willow');
    check(willow.kind === 'drink' && willow.returns === CUP && ['mend', 'calm', 'warmth'].every((effect) => willow.effects.includes(effect)), 'Napar: goi, uspokaja, grzeje');
    equal(kindLabel('tea_willow'), 'napar', 'To napar');
    check(getFood('tree_gum').kind === 'snack', 'Guma jest jadalna');
    const { ingredientKind } = await import('../src/items/cooking.js'), { driesInto } = await import('../src/items/drying.js');
    equal([ingredientKind('tree_gum'), driesInto('tree_gum'), spoilKind('tree_gum')], [null, null, null], 'Guma: nie do garnka, nie do suszenia, nie psuje się');
    equal(ingredientKind('strawberry'), 'fruit', 'Owoce dalej idą do garnka');
    // Lateks na ubraniu.
    equal(C.cleanLook({ pattern: 'plain', proof: true }), { pattern: 'plain', main: null, accent: null, proof: true }, 'Wygląd pamięta lateks');
    equal(C.cleanLook({ proof: 'yes' }), { pattern: 'plain', main: null, accent: null }, 'Tylko prawdziwe true');
    equal(C.cleanLook({}), { pattern: 'plain', main: null, accent: null }, 'Zwykłe ubranie bez pola');
    check(!C.sameLook({ proof: true }, {}) && C.sameLook({ proof: true }, { proof: true }), 'Natarte i zwykłe to różne stosy');
    check(C.lookText('shirt_linen', { proof: true }).includes('lateksem') && !C.lookText('shirt_linen', {}).includes('lateksem'), 'Opis w ekwipunku');
    const plain = { type: 'shirt_nettle', count: 1, look: C.cleanLook({}) }, proofed = { type: 'trousers_nettle', count: 1, look: C.cleanLook({ proof: true }) };
    const total = C.wornWarmth([plain, proofed, null, null]), dry = C.proofWarmth([plain, proofed, null, null]);
    check(dry > 0 && dry < total && C.proofWarmth([plain]) === 0 && C.isProof(proofed) && !C.isProof(plain) && !C.isProof({ type: 'stick', look: { proof: true } }), 'Ciepło natartych ubrań');
    near(feltTemperature({ water: true, clothes: total, proof: dry }).clothes, dry + (total - dry) * WET_CLOTHES, 'W wodzie: natarte grzeją całe, reszta w części');
    near(feltTemperature({ water: true, clothes: total }).clothes, total * WET_CLOTHES, 'W wodzie bez lateksu - jak dotąd');
    equal(feltTemperature({ water: false, clothes: total, proof: dry }).clothes, total, 'Na sucho bez zmian');
    near(feltTemperature({ water: true, clothes: 2, proof: 99 }).clothes, 2, 'Nie więcej niż grzeją ubrania');
    // Stół krawiecki: prawdziwa metoda proof.
    const { SewingTables } = await import('../src/game/SewingTables.js');
    const notes = [], events = [];
    const fake = { game: { mode: 'adventure', onNotice: (text) => notes.push(text), achieve: (name, data) => events.push([name, data]), playBlockSound() {},
        inventory: { selected: 3, take(slot, count) { fake.taken = [slot, count]; } } }, version: 0 };
    const table = { material: null };
    check(SewingTables.prototype.proof.call(fake, {}, table) && notes.at(-1).includes('gotowe ubranie') && !fake.taken, 'Lateks bez ubrania na stole');
    table.material = { type: 'linen_cloth', count: 1 };
    check(SewingTables.prototype.proof.call(fake, {}, table) && !fake.taken, 'Lateks na płótno - nie');
    table.material = { type: 'shirt_linen', count: 1, look: { pattern: 'stripes', main: 'red', accent: 'white' } };
    check(SewingTables.prototype.proof.call(fake, {}, table), 'Lateks na ubranie');
    equal(table.material.look, { pattern: 'stripes', main: 'red', accent: 'white', proof: true }, 'Kolory zostają, dochodzi lateks');
    equal([fake.taken, fake.version, events.at(-1)[0]], [[3, 1], 1, 'garmentProofed'], 'Bryłka zużyta, wersja, zdarzenie');
    check(SewingTables.prototype.proof.call(fake, {}, table) && fake.version === 1 && notes.at(-1).includes('już'), 'Drugi raz - nic');
    check(read('src/game/SewingTables.js').includes('if (selected === PROOF_ITEM) return this.proof(a, table);'), 'Stół rozpoznaje lateks w ręce');
}

// ------------------------------------------------------------
// 4. Obraz.
// ------------------------------------------------------------
{
    const count = (geometry) => geometry.getIndex().count / 6;
    const box = (geometry) => { geometry.computeBoundingBox(); return geometry.boundingBox; };
    const tap = T.newTap(3, 20, 7, 0, 'pine', 't', 1);
    const empty = R.tapGeometry(tap, SUMMER);
    equal(count(empty), 5, 'Świeże nacięcie: V (4 czworokąty) i zaciek');
    check(box(empty).min.x >= 4 && box(empty).max.x < 4.05 && box(empty).min.y > 20.3 && box(empty).max.y < 20.9, 'Na ścianie +X, tuż przed nią');
    tap.amount = 2.4;
    const resinGeometry = R.tapGeometry(tap, SUMMER);
    equal(count(resinGeometry), 7, 'Żywica: zaciek, kropla i błysk');
    check(box(resinGeometry).min.y < box(empty).min.y, 'Więcej żywicy - dłuższy zaciek');
    tap.age = 99 * G.DAY_SECONDS; tap.amount = 0;
    equal(count(R.tapGeometry(tap, SUMMER)), 4, 'Zabliźnione: sama blizna');
    // Wszystkie ściany: geometria po właściwej stronie bloku i zwrócona na zewnątrz.
    for (let face = 0; face < 4; face++) {
        const [dx, dz] = T.TAP_FACES[face];
        const side = T.newTap(0, 0, 0, face, 'birch', 't', 1);
        side.cup = 'clay_cup'; side.amount = 0.5;
        const geometry = R.tapGeometry(side, SPRING);
        const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex();
        let outside = true, facing = true;
        for (let i = 0; i < position.count; i++) {
            const out = (position.getX(i) - 0.5) * dx + (position.getZ(i) - 0.5) * dz;
            if (out < 0.5) outside = false;
        }
        // Kolejność rogów zgodna z normalną (inaczej ściana byłaby niewidoczna).
        for (let i = 0; i < index.count; i += 3) {
            const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
            const p = (n) => [position.getX(n), position.getY(n), position.getZ(n)];
            const [pa, pb, pc] = [p(a), p(b), p(c)];
            const u = pb.map((v, k) => v - pa[k]), w = pc.map((v, k) => v - pa[k]);
            const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
            const dot = cross[0] * normal.getX(a) + cross[1] * normal.getY(a) + cross[2] * normal.getZ(a);
            if (!(dot > 0)) facing = false;
        }
        check(outside, `Ściana ${face}: wszystko przed pniem`);
        check(facing, `Ściana ${face}: czworokąty zwrócone na zewnątrz`);
        equal(count(geometry), 4 + 1 + 7, `Ściana ${face}: V, strużka, kubek z sokiem`);
    }
    const sap = T.newTap(0, 0, 0, 0, 'birch', 't', 1);
    equal(count(R.tapGeometry(sap, SPRING)), 5, 'Sok bez kubka: V i strużka');
    equal(count(R.tapGeometry(sap, SUMMER)), 4, 'Sucha pora: samo V');
    equal(count(R.tapGeometry(sap, null)), 5, 'Bez doby: jak w porze');
    const free = R.dropPath(sap);
    sap.cup = 'clay_cup';
    const caught = R.dropPath(sap);
    check(free.to < 0 && caught.to > 0.3 && caught.from > caught.to, 'Kropla leci do kubka albo na ziemię');
    check(R.TAP_DROP_RANGE < R.TAP_VIEW_RANGE, 'Krople tylko z bliska');

    // Prawdziwy TapRenderer: widoki tylko w pobliżu, znikają z nacięciem.
    const game = makeGame(SPRING);
    game.scene = new (await import('three')).Scene();
    game.player = { pos: { x: 0, y: BASE, z: 0 } };
    game.taps.cut(1, BASE, 0, 0, 'birch'); game.taps.cut(500, BASE, 0, 0, 'birch');
    game.taps.get({ x: 1, y: BASE, z: 0 }).cup = 'clay_cup';
    const renderer = new R.TapRenderer(game, game.taps);
    renderer.update(0.1);
    equal(renderer.views.size, 1, 'Widok tylko bliskiego nacięcia');
    const view = [...renderer.views.values()][0];
    check(view.dropping && view.mesh.geometry.getIndex().count > 0, 'Kropla kapie, geometria jest');
    const y0 = view.drop.position.y;
    renderer.update(0.5);
    check(view.drop.position.y !== y0, 'Kropla się rusza');
    game.taps.get({ x: 1, y: BASE, z: 0 }).amount = 1;
    renderer.wait = 0; renderer.update(0.01);
    check(!view.dropping && !view.drop.visible, 'Pełny kubek - kropla nie leci');
    game.taps.taps.clear();
    renderer.wait = 0; renderer.update(0.01);
    equal(renderer.views.size, 0, 'Bez nacięć - bez widoków');
    equal(game.scene.children.length, 0, 'Scena posprzątana');
    renderer.dispose();
}

// ------------------------------------------------------------
// 5. Osiągnięcia, poradnik, komenda, podpięcie.
// ------------------------------------------------------------
{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    for (const id of ['first_tap', 'dry_tap', 'sap_cup', 'tapped_resin', 'maple_syrup', 'forest_cellar', 'greedy_tap', 'axe_glued', 'garment_proofed', 'dragon_blood', 'willow_tea', 'all_tree_gifts']) {
        check(byId[id] && itemExists(byId[id].icon), `Osiągnięcie ${id} z ikoną`);
    }
    const book = () => { const sets = new Map(), counts = new Map(); return {
        collect: (key, value) => { const set = sets.get(key) ?? new Set(); set.add(value); sets.set(key, set); return set.size; },
        count: (key, amount = 1) => { counts.set(key, (counts.get(key) ?? 0) + amount); return counts.get(key); } }; };
    check(byId.dry_tap.when({ flowing: false }) && !byId.dry_tap.when({ flowing: true }), 'Nie ta pora');
    check(byId.sap_cup.when({ item: 'birch_sap' }) && !byId.sap_cup.when({ item: 'resin' }), 'Kubek soku');
    const resinBook = book();
    check(!byId.tapped_resin.when({ item: 'resin', count: 3 }, resinBook) && !byId.tapped_resin.when({ item: 'birch_sap', count: 20 }, resinBook) &&
        !byId.tapped_resin.when({ item: 'resin', count: 3 }, resinBook) && byId.tapped_resin.when({ item: 'resin', count: 4 }, resinBook), 'Dziesięć kropli żywicy');
    check(byId.maple_syrup.when({ into: 'maple_syrup' }) && !byId.maple_syrup.when({ into: 'tea_calm' }), 'Syrop');
    const drinks = book();
    check(!byId.forest_cellar.when({ type: 'birch_sap' }, drinks) && !byId.forest_cellar.when({ type: 'tea_calm' }, drinks) && !byId.forest_cellar.when({ type: 'maple_sap' }, drinks) &&
        !byId.forest_cellar.when({ type: 'palm_sap' }, drinks) && !byId.forest_cellar.when({ type: 'palm_sap' }, drinks) && byId.forest_cellar.when({ type: 'baobab_water' }, drinks), 'Cztery napoje');
    check(byId.greedy_tap.when({ full: true }) && !byId.greedy_tap.when({ full: false }), 'Komplet nacięć');
    check(byId.axe_glued.when({ recipe: 'axe_repair' }) && !byId.axe_glued.when({ recipe: 'pitch_glue' }), 'Naprawa siekiery');
    check(byId.dragon_blood.when({ item: 'dragon_blood' }) && !byId.dragon_blood.when({ item: 'resin' }), 'Smocza krew');
    check(byId.willow_tea.when({ type: 'tea_willow' }) && !byId.willow_tea.when({ type: 'tea_calm' }), 'Napar z wierzby');
    const gifts = book(), keys = Object.keys(G.GIFTS);
    check(keys.slice(0, -1).every((gift) => !byId.all_tree_gifts.when({ gift }, gifts)) && !byId.all_tree_gifts.when({ gift: keys[0] }, gifts) && byId.all_tree_gifts.when({ gift: keys.at(-1) }, gifts), 'Wszystkie dary');
    // Zielarz liczy tylko napary z ziół (w 1.41.0 łapał też soki).
    const herbalist = byId.herbalist ?? ACHIEVEMENTS.find((entry) => entry.title === 'Zielarz'), teas = book();
    check(!herbalist.when({ kind: 'drink', type: 'birch_sap' }, teas) && !herbalist.when({ kind: 'drink', type: 'maple_sap' }, teas) && !herbalist.when({ kind: 'drink', type: 'palm_sap' }, teas) &&
        !herbalist.when({ kind: 'drink', type: 'tea_willow' }, teas) && !herbalist.when({ kind: 'drink', type: 'tea_calm' }, teas) && !herbalist.when({ kind: 'drink', type: 'tea_heal' }, teas) &&
        herbalist.when({ kind: 'drink', type: 'tea_vigor' }, teas), 'Zielarz: trzy napary z ziół, soki się nie liczą');
    equal(new Set(ACHIEVEMENTS.map((entry) => entry.title)).size, ACHIEVEMENTS.length, 'Tytuły osiągnięć bez powtórek');

    const chapter = GUIDE.find((entry) => entry.id === 'tree-gifts');
    check(chapter && chapter.lines.length >= 6, 'Rozdział poradnika');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : `${line.text} ${line.touch}`)).join(' ');
    for (const word of ['Nożem', 'żywic', 'kubek', 'wiosną', 'zabliźnia', 'syrop', 'gumę', 'lateks', 'smoła klejąca', 'garbnik', 'wierzby']) check(text.includes(word), `Poradnik: ${word}`);

    const commands = read('src/commands/worldCommands.js');
    check(commands.includes("name: 'naciecie'") && read('docs/komendy.md').includes('/naciecie napelnij'), 'Komenda i jej opis');
    const gameSource = read('src/game/Game.js');
    for (const piece of ['new TreeTaps(this, worldInfo.treeTaps)', 'new TapRenderer(this, this.treeTaps)', 'this.treeTaps.update(dt)', 'this.tapRenderer.update(dt)',
        'this.treeTaps.advance(seconds)', 'this.saver.treeTaps = this.treeTaps', 'this.tapRenderer.dispose()']) check(gameSource.includes(piece), `Game.js: ${piece}`);
    const saver = read('src/storage/WorldSaver.js');
    check(saver.includes('this.worldInfo.treeTaps = this.treeTaps.getState()') && saver.includes('this.savedTapVersion !== (this.treeTaps.version ?? 0)'), 'Zapis świata');
    check(read('src/game/GameInteraction.js').includes('this.treeTaps?.interact(this.currentHit, this.selectedBlock, this.player.crouching)'), 'PPM w grze');
    check(read('src/game/Felling.js').includes('game.treeTaps?.felled('), 'Ścinanie zgłasza pniak');
    check(read('docs/dary-pnia.md').includes('## Luki'), 'Opis z lukami');
}

console.log(`OK: dary pnia - ${checks} sprawdzeń.`);
