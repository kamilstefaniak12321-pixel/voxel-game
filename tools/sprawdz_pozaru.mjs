// ------------------------------------------------------------
// POŻAR (1.43.0, docs/pozar.md)
//
// - zasady (blocks/fireTraits.js): każde drzewo ma wpis, co po nim
//   zostaje, pora roku, deszcz i mokra ziemia, wiatr, szansa przeskoku,
// - prawdziwe Wildfire na drzewach z generatora: podpalenie, liście
//   znikają od dołu, popiół / zwęglony kikut / przeżycie, przeskok na
//   sąsiada, deszcz gasi, limit, ustawienie świata, starter ognia,
//   budowle nie płoną, gość w grze ze znajomymi, zapis,
// - bloki i przedmioty po pożarze, nawóz z popiołu, barwnik z węgla,
// - obraz (cząsteczki), komenda, osiągnięcia, poradnik, podpięcie.
//
// Uruchomienie: node tools/sprawdz_pozaru.mjs
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
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId, getBlockTypeById, getBlockDefinition, isSolidId } = await import('../src/blocks/BlockRegistry.js');
const { TREE_NAMES } = await import('../src/blocks/trees.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const F = await import('../src/blocks/fireTraits.js');
const W = await import('../src/game/Wildfire.js');
const B = await import('../src/blocks/burnt.js');
const { treeKind } = await import('../src/game/TreeScan.js');
const { nextSeasonStart, SEASON_DAYS } = await import('../src/sky/Seasons.js');
const { itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { itemUses } = await import('../src/items/uses.js');
const { fertilizerOf } = await import('../src/blocks/fertilizers.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { stateSystems } = await import('../src/net/StateSync.js');
const R = await import('../src/rendering/WildfireRenderer.js');
const THREE = await import('three');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, eps = 1e-6) => { assert.ok(Math.abs(actual - expected) <= eps, `${message}: ${actual} zamiast ${expected}`); checks++; };

const mid = (season) => Math.floor(nextSeasonStart(season, 1000) + SEASON_DAYS * 0.5) + 0.5;
const SPRING = mid(0), SUMMER = mid(1), AUTUMN = mid(2), WINTER = mid(3);

// ------------------------------------------------------------
// 1. Zasady.
// ------------------------------------------------------------
for (const species of TREE_NAMES) {
    check(Object.hasOwn(F.FIRE_TRAITS, species), `${species}: ma wpis w FIRE_TRAITS`);
    const traits = F.fireTraits(species);
    check(traits.ease >= 0 && traits.ease <= 2 && ['ash', 'char', 'survive'].includes(traits.fate), `${species}: poprawne cechy`);
}
for (const species of Object.keys(F.FIRE_TRAITS)) check(TREE_NAMES.includes(species), `${species}: jest takie drzewo`);
equal(F.fireTraits('nie_ma'), { ease: 1, fate: 'char' }, 'Nieznane drzewo: zwykłe');
// Z planu (docs/drewno.md, rozdział 7).
for (const species of ['mugo', 'joshua_tree', 'birch', 'aspen', 'wierzba']) equal(F.fateOf(species, 1, 30), 'ash', `${species}: popiół`);
for (const species of ['spruce', 'fir', 'beech', 'linden', 'maple', 'jablon', 'cherry', 'olcha', 'jacaranda', 'bristlecone']) equal(F.fateOf(species, 1, 30), 'char', `${species}: zwęglony kikut`);
for (const species of ['sequoia', 'baobab', 'pine', 'oak', 'larch', 'araucaria', 'cedar', 'coconut_palm', 'acacia', 'rainbow_eucalyptus', 'olive', 'ginkgo']) equal(F.fateOf(species, 1, 30), 'survive', `${species}: przeżywa`);
equal([F.fateOf('spruce', 1, 5), F.fateOf('beech', 1, 3)], ['ash', 'ash'], 'Młode drzewko zawsze idzie na popiół');
equal([F.fateOf('spruce', 2, 60), F.fateOf('birch', 2, 60)], ['survive', 'survive'], 'Gruby pień przeżywa');
equal(F.fateOf('pine', 1, 3), 'survive', 'Gruba kora ratuje nawet młode');
check(['pine', 'spruce', 'fir', 'larch', 'mugo', 'cedar', 'rainbow_eucalyptus'].every((species) => F.fireTraits(species).ease > 1.2), 'Iglaste i eukaliptus: łatwo');
check(['mangrove', 'bald_cypress', 'kapok', 'banyan', 'olcha', 'wierzba'].every((species) => F.fireTraits(species).ease <= 0.5), 'Mokradła i las deszczowy: trudno');
equal(F.fireTraits('baobab').ease, 0, 'Baobab nie pali się wcale');
equal([F.burnSeconds(0), F.burnSeconds(100), F.burnSeconds(5000)], [20, 30, 60], 'Korona płonie 20-60 sekund');
// Pora roku.
check(F.seasonFire(SUMMER) > F.seasonFire(AUTUMN) && F.seasonFire(AUTUMN) > F.seasonFire(SPRING) && F.seasonFire(SPRING) > F.seasonFire(WINTER), 'Lato > jesień > wiosna > zima');
// Mokro.
equal([F.dampness(0, 0), F.dampness(F.RAIN_STOPS, 0), F.dampness(1, 0), F.dampness(0, 1)], [1, 0, 0, 0], 'Sucho, deszcz, ulewa, mokra ziemia');
check(F.dampness(0, 0.5) > 0.2 && F.dampness(0, 0.5) < 0.3 && F.dampness(0.1, 0) < 1 && F.dampness(0.1, 0) > 0, 'Po deszczu trudniej');
// Wiatr.
const east = { x: 8, z: 0, speed: 8 };
equal([F.windFactor(1, 0, null), F.windFactor(1, 0, { x: 0.1, z: 0, speed: 0.1 }), F.windFactor(0, 0, east)], [1, 1, 1], 'Bez wiatru bez zmian');
near(F.windFactor(3, 0, east), 2.5, 'Z wiatrem 2,5 raza łatwiej');
near(F.windFactor(-3, 0, east), 0.1, 'Pod mocny wiatr - prawie wcale');
near(F.windFactor(0, 5, east), 1, 'W poprzek - bez zmian');
check(F.windFactor(1, 0, { x: 2, z: 0, speed: 2 }) < F.windFactor(1, 0, east), 'Im mocniej wieje, tym szybciej');
// Szansa przeskoku.
const chance = (extra = {}) => F.spreadChance({ species: 'beech', dx: 3, dz: 0, distance: 3, days: SPRING, ...extra });
check(chance() > 0 && chance() < F.SPREAD_BASE, 'Jest szansa, mniejsza niż tuż obok');
check(chance({ species: 'spruce' }) > chance() && chance({ species: 'mangrove' }) < chance(), 'Gatunek sąsiada');
equal([chance({ species: 'baobab' }), chance({ rain: 0.5 }), chance({ wetness: 1 }), chance({ distance: F.SPREAD_RADIUS })], [0, 0, 0, 0], 'Baobab, deszcz, mokro, za daleko - nic');
check(chance({ days: SUMMER }) > chance() && chance({ days: WINTER }) < chance(), 'Pora roku');
check(chance({ wind: east }) > chance() && chance({ wind: { x: -8, z: 0, speed: 8 } }) < chance() / 5, 'Wiatr niesie ogień');
check(F.spreadChance({ species: 'beech', dx: 7, dz: 0, distance: 7, days: SPRING, wind: east }) > 0 && chance({ distance: 7 }) === 0, 'Z wiatrem sięga dalej');
check(chance({ distance: 7, crown: 4 }) > 0 && chance({ distance: 3, crown: 4 }) > chance() && chance({ distance: 10.5, crown: 99 }) === 0, 'Szeroka korona sięga dalej (ale nie bez końca)');
check(chance({ distance: 1 }) > chance({ distance: 5 }), 'Bliżej - łatwiej');
// Czy da się podpalić.
equal(F.ignitionProblem('spruce', SUMMER, 0, 0), null, 'Sucho, lato: da się');
check(F.ignitionProblem('baobab', SUMMER, 0, 0).includes('nasiąknięte') && F.ignitionProblem('spruce', SUMMER, 0.6, 0).includes('deszczu') &&
    F.ignitionProblem('spruce', SUMMER, 0, 0.95).includes('mokro') && F.ignitionProblem('mangrove', WINTER, 0, 0).includes('mokro'), 'Powody odmowy');
equal(Object.keys(F.FIRE_MODES), ['off', 'player', 'full'], 'Trzy ustawienia świata');
check(F.MAX_BURNING >= 20 && F.MAX_BURNING <= 60 && F.DEFAULT_FIRE_MODE === 'player', 'Limit i ustawienie domyślne');

// ------------------------------------------------------------
// 2. Bloki i przedmioty.
// ------------------------------------------------------------
{
    const charred = getBlockDefinition(B.CHARRED_LOG), ash = getBlockDefinition(B.ASH_LAYER);
    equal([getBlockId(B.CHARRED_LOG), getBlockId(B.ASH_LAYER)], [16303, 16304], 'Numery bloków');
    check(charred.solid && charred.drops === 'charcoal' && charred.part === 'charred' && isSolidId(16303), 'Zwęglony pień: pełny, daje węgiel');
    check(!ash.solid && ash.replaceable && ash.model === 'flat' && ash.drops === 'ash', 'Popiół: płaski, daje popiół');
    equal(treeKind(16303), null, 'Zwęglony pień to już nie drzewo (nie płonie drugi raz, nie da soku)');
    for (const type of ['charcoal', 'ash']) check(itemExists(type) && getItemLabel(type).length > 3 && itemUses(type).length > 0, `${type}: przedmiot z zastosowaniem`);
    equal(fertilizerOf('ash')?.fertilizer, 'compost', 'Popiół nawozi jak kompost');
    const { gridResult } = await import('../src/crafting/Crafting.js');
    const result = gridResult([{ type: 'charcoal', count: 1 }, null, null, null]);
    equal([result?.type, result?.count], ['dye_black', 2], 'Węgiel: czarny barwnik');
    check(read('docs/numery-blokow.md').includes('16303-16304'), 'Numery zapisane w docs/numery-blokow.md');
    const manifest = JSON.parse(read('assets/textures/atlas.json'));
    const tiles = manifest.tiles ?? manifest;
    for (const tile of ['charred_log_side', 'charred_log_top', 'ash_layer', 'charcoal', 'ash']) check(tiles[tile], `Tekstura ${tile}`);
}

// ------------------------------------------------------------
// 3. Prawdziwe Wildfire.
// ------------------------------------------------------------
const GROUND = 10, BASE = GROUND + 1;
const DIRT = getBlockId('dirt');
function makeGame(days = SUMMER) {
    const blocks = new Map();
    const world = {
        blocks,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? DIRT : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        setBlock(x, y, z, type) { blocks.set(`${x},${y},${z}`, getBlockId(type)); return true; },
        clearBlock(x, y, z) { blocks.set(`${x},${y},${z}`, 0); return true; },
        toChunkCoord: (value) => Math.floor(value / 16), getChunk: () => ({})
    };
    const game = {
        world, mode: 'adventure', time: { days }, rainNow: 0, weather: { wetness: 0, wind: { x: 0, z: 0, speed: 0 } },
        notices: [], events: [], onNotice: (text) => game.notices.push(text), achieve: (name, data) => game.events.push([name, data]),
        sounds: { play() {} }, selectedBlock: null, currentHit: null
    };
    game.fire = new W.Wildfire(game);
    // Stały los: bez przypadku w testach.
    let seed = 12345;
    game.fire.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    return game;
}
function plant(world, species, x, z, seed = 7) {
    const shape = buildTree(species, seed);
    for (const [dx, dy, dz, type] of shape.blocks ?? shape) {
        // Jak generator: liście sąsiada nie zastępują czyjejś kłody.
        const key = `${x + dx},${BASE + dy},${z + dz}`, id = getBlockId(type);
        if (treeKind(world.blocks.get(key) ?? 0)?.log && !treeKind(id)?.log) continue;
        world.blocks.set(key, id);
    }
}
// Policz bloki drzewa gatunku w świecie.
function census(world, species) {
    let logs = 0, leaves = 0, charred = 0, ash = 0;
    for (const id of world.blocks.values()) {
        const kind = treeKind(id);
        if (kind?.tree === species) kind.log ? logs++ : leaves++;
        else if (id === 16303) charred++;
        else if (id === 16304) ash++;
    }
    return { logs, leaves, charred, ash };
}
const run = (fire, seconds) => { for (let t = 0; t < seconds; t += W.FIRE_STEP_SECONDS) fire.step(W.FIRE_STEP_SECONDS); };
const last = (game) => game.notices[game.notices.length - 1] ?? '';
const events = (game, name) => game.events.filter(([event]) => event === name).map(([, data]) => data);

// Brzoza: popiół.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'birch', 0, 0);
    const before = census(world, 'birch');
    check(before.logs > 5 && before.leaves > 20, 'Brzoza stoi');
    const result = fire.ignite(0, BASE + 1, 0);
    check(result.ok && result.tree.fate === 'ash' && result.tree.species === 'birch', 'Brzoza się zajęła');
    equal([result.tree.logs.length, result.tree.leaves.length], [before.logs, before.leaves], 'Całe drzewo: wszystkie kłody i liście');
    equal([fire.trees.size, fire.flames.size], [1, 1], 'Jedno płonące drzewo, jedne płomienie');
    check(result.tree.duration >= 20 && result.tree.duration <= 60, 'Czas płonięcia');
    equal(events(game, 'treeIgnited')[0], { species: 'birch', fate: 'ash', source: 'player', burning: 1 }, 'Zdarzenie');
    check(!fire.ignite(0, BASE + 2, 0).ok, 'To samo drzewo nie zapali się drugi raz');
    // Liście znikają od dołu.
    const lowest = Math.min(...result.tree.leaves.map((leaf) => leaf.y)), highest = Math.max(...result.tree.leaves.map((leaf) => leaf.y));
    run(fire, result.tree.duration / 2);
    const half = census(world, 'birch');
    check(half.leaves < before.leaves * 0.7 && half.leaves > before.leaves * 0.3 && half.logs === before.logs, 'W połowie: część liści, pień cały');
    const leftLow = result.tree.leaves.filter((leaf) => leaf.y <= lowest + 1 && treeKind(world.getBlockId(leaf.x, leaf.y, leaf.z))).length;
    const leftHigh = result.tree.leaves.filter((leaf) => leaf.y >= highest - 1 && treeKind(world.getBlockId(leaf.x, leaf.y, leaf.z))).length;
    check(leftLow === 0 && leftHigh > 0, 'Ogień idzie od dołu: dolne liście znikają pierwsze');
    check(fire.heatAt(1, BASE + 1, 0) > 5 && fire.heatAt(60, BASE, 0) === 0, 'Przy ogniu gorąco, daleko - nie');
    run(fire, result.tree.duration / 2 + 3);
    const after = census(world, 'birch');
    equal([after.logs, after.leaves, after.charred], [0, 0, 0], 'Po pożarze: drzewa nie ma');
    check(after.ash >= 1 && world.getBlockId(0, BASE, 0) === 16304, 'Na ziemi popiół tam, gdzie stał pień');
    equal([fire.trees.size, fire.flames.size], [0, 0], 'Ogień zgasł');
    equal(events(game, 'treeBurnt')[0], { species: 'birch', fate: 'ash', source: 'player' }, 'Zdarzenie końca');
}

// Świerk: zwęglony kikut. Podpalenie przez liść.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'spruce', 0, 0);
    const before = census(world, 'spruce');
    const leaf = [...world.blocks.entries()].find(([, id]) => treeKind(id) && !treeKind(id).log)[0].split(',').map(Number);
    const result = fire.ignite(...leaf);
    check(result.ok && result.tree.fate === 'char', 'Świerk zajął się od liścia');
    run(fire, result.tree.duration + 5);
    const after = census(world, 'spruce');
    equal([after.logs, after.leaves, after.charred, after.ash], [0, 0, before.logs, 0], 'Zostaje czarny kikut: każda kłoda zwęglona, liści brak');
    check(!fire.ignite(0, BASE + 1, 0).ok, 'Kikut się nie zapali');
}

// Sosna: przeżywa, traci dolne liście.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'pine', 0, 0);
    const before = census(world, 'pine');
    const result = fire.ignite(0, BASE + 1, 0);
    check(result.ok && result.tree.fate === 'survive', 'Sosna płonie, ale przeżyje');
    run(fire, result.tree.duration + 5);
    const after = census(world, 'pine');
    equal([after.logs, after.charred, after.ash], [before.logs, 0, 0], 'Pień stoi cały');
    near(after.leaves / before.leaves, 1 - F.SURVIVOR_LOSS, 'Straciła około jednej trzeciej liści', 0.03);
    const again = fire.ignite(0, BASE + 1, 0);
    check(!again.ok && again.reason.includes('dopiero co'), 'Nie zapali się zaraz znowu');
    game.time.days += F.REBURN_DAYS + 0.1;
    check(fire.ignite(0, BASE + 1, 0).ok, 'Po kilku dobach - może');
}

// Kępa liści trzymająca się korony tylko na ukos nie zostaje w powietrzu;
// kępa przy sąsiednim drzewie - zostaje.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'spruce', 0, 0);
    const tree = W.wholeTree(world, 0, BASE, 0);
    const tip = tree.leaves.reduce((best, leaf) => (leaf.y > best.y ? leaf : best), tree.leaves[0]);
    // Trzy liście na ukos od czubka korony (bez wspólnej ściany z koroną).
    const loose = [[1, 1, 1], [2, 2, 2], [2, 2, 3]].map(([dx, dy, dz]) => ({ x: tip.x + dx, y: tip.y + dy, z: tip.z + dz }));
    for (const cell of loose) world.setBlock(cell.x, cell.y, cell.z, 'spruce_leaves');
    equal(W.wholeTree(world, 0, BASE, 0).leaves.length, tree.leaves.length + 3, 'Liście na ukos należą do korony');
    // Sąsiad z własną kępą na ukos - ta ma zostać.
    for (let y = 0; y < 6; y++) world.setBlock(30, BASE + y, 0, 'spruce_log');
    for (const [dx, dy] of [[1, 5], [-1, 5], [0, 6]]) world.setBlock(30 + dx, BASE + dy, 0, 'spruce_leaves');
    world.setBlock(32, BASE + 6, 1, 'spruce_leaves');
    const result = fire.ignite(0, BASE + 1, 0);
    run(fire, result.tree.duration + 6);
    check(loose.every((cell) => world.getBlockId(cell.x, cell.y, cell.z) === 0), 'Kępa na ukos spłonęła razem z drzewem');
    check(world.getBlockId(32, BASE + 6, 1) !== 0 && world.getBlockId(31, BASE + 5, 0) !== 0, 'Liście dalekiego sąsiada zostały');
    let floating = 0;
    for (const [key, id] of world.blocks) { const [x] = key.split(',').map(Number); if (x < 20 && treeKind(id) && !treeKind(id).log) floating++; }
    equal(floating, 0, 'Po spalonym świerku nic nie wisi w powietrzu');
}

// Kosodrzewina (krzew) i baobab.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'mugo', 0, 0);
    const before = census(world, 'mugo');
    const log = [...world.blocks.entries()].find(([, id]) => treeKind(id)?.log)[0].split(',').map(Number);
    const result = fire.ignite(...log);
    check(result.ok && result.tree.fate === 'ash' && result.tree.logs.length === before.logs, 'Kosodrzewina płonie cała');
    run(fire, result.tree.duration + 5);
    equal([census(world, 'mugo').logs, census(world, 'mugo').leaves], [0, 0], 'Po krzewie nic nie zostaje');
    plant(world, 'baobab', 40, 0);
    const trunk = [...world.blocks.entries()].find(([key, id]) => treeKind(id)?.log && treeKind(id).tree === 'baobab')[0].split(',').map(Number);
    const no = fire.ignite(...trunk);
    check(!no.ok && no.reason.includes('nasiąknięte') && !fire.ignite(...trunk, 'command', true).ok, 'Baobab się nie zapali - nawet komendą');
}

// Budowle nie płoną; nie-drzewo.
{
    const game = makeGame(), { fire, world } = game;
    for (let y = 0; y < 4; y++) world.setBlock(0, BASE + y, 0, 'spruce_log');
    world.setBlock(3, BASE, 0, 'spruce_planks'); world.setBlock(5, BASE, 0, 'spruce_log_x'); world.setBlock(7, BASE, 0, 'charred_log');
    check(!fire.ignite(0, BASE + 1, 0).ok && fire.ignite(0, BASE + 1, 0).reason.includes('nie żywe'), 'Słup pni bez korony');
    for (const x of [3, 5, 7, 20]) equal(fire.ignite(x, BASE, 0), { ok: false, reason: null }, `Blok ${x}: nie nasza sprawa`);
    equal(fire.trees.size, 0, 'Nic nie płonie');
}

// Przeskok na sąsiada: z wiatrem tak, pod wiatr nie; deszcz; pas bez drzew.
{
    const spread = (wind, days = SUMMER, far = 4, extra = (game) => {}) => {
        const game = makeGame(days), { fire, world } = game;
        plant(world, 'spruce', 0, 0); plant(world, 'spruce', far, 0, 9); plant(world, 'spruce', -far, 0, 11);
        game.weather.wind = wind;
        // Stały rzut 0,02: zajmuje się to, co ma szansę większą niż 2% na sekundę.
        fire.random = () => 0.02;
        extra(game);
        fire.ignite(0, BASE + 1, 0);
        run(fire, 200);
        const ignited = events(game, 'treeIgnited').filter((data) => data.source === 'spread').length;
        return { game, ignited, spreadEvents: events(game, 'fireSpread').length };
    };
    const calm = spread({ x: 0, z: 0, speed: 0 });
    equal(calm.ignited, 2, 'Latem, bez wiatru: ogień bierze oba sąsiednie świerki');
    equal(calm.spreadEvents, 2, 'Zdarzenia przeskoku');
    equal(census(calm.game.world, 'spruce').leaves, 0, 'Wszystkie trzy spłonęły');
    // Mocny wiatr na wschód: zajmuje się tylko to po zawietrznej.
    const windy = spread({ x: 8, z: 0, speed: 8 });
    const burnt = (game, x) => game.world.getBlockId(x, BASE + 1, 0) === 16303;
    check(burnt(windy.game, 4) && !burnt(windy.game, -4), 'Z wiatrem: zajął się świerk po zawietrznej, ten pod wiatr stoi');
    equal(spread({ x: 0, z: 0, speed: 0 }, SUMMER, 4, (game) => { game.weather.wetness = 1; }).ignited, 0, 'Na mokrej ziemi ogień nie przeskakuje');
    equal(spread({ x: 0, z: 0, speed: 0 }, SUMMER, 14).ignited, 0, 'Pas bez drzew zatrzymuje ogień');
    // Deszcz gasi w połowie: drzewo zostaje, jakie było.
    const game = makeGame(), { fire, world } = game;
    plant(world, 'spruce', 0, 0);
    const before = census(world, 'spruce');
    const result = fire.ignite(0, BASE + 1, 0);
    run(fire, result.tree.duration / 2);
    game.rainNow = 0.6;
    run(fire, 1);
    const after = census(world, 'spruce');
    equal([fire.trees.size, fire.flames.size, after.logs, after.charred], [0, 0, before.logs, 0], 'Deszcz zgasił: pień cały, nie zwęglony');
    check(after.leaves > 0 && after.leaves < before.leaves, 'Zostało to, czego ogień nie zdążył');
    equal(events(game, 'fireRainedOut').length, 1, 'Zdarzenie deszczu');
    check(!fire.ignite(0, BASE + 1, 0).ok, 'W deszczu się nie zapali');
}

// 1.43.1: deszcz liczy się przy drzewie, nie przy graczu.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'spruce', 0, 0);
    plant(world, 'spruce', 200, 0, 9);
    // Pada tylko daleko na wschodzie (x > 100) - tam, gdzie gracz nie stoi.
    game.rainAt = (x) => (x > 100 ? 0.8 : 0);
    check(fire.ignite(0, BASE + 1, 0).ok, 'Tu nie pada - drzewo się zajmuje');
    check(!fire.ignite(200, BASE + 1, 0).ok, 'Tam pada - tamto drzewo się nie zajmie');
    run(fire, 2);
    equal(fire.trees.size, 1, 'Deszcz daleko nie gasi drzewa, przy którym nie pada');
    game.rainAt = () => 0;
    check(fire.ignite(200, BASE + 1, 0).ok, 'Przestało padać - zajmuje się i tamto');
    game.rainAt = (x) => (x > 100 ? 0.8 : 0);
    run(fire, 1);
    check(fire.trees.size === 1 && [...fire.trees.values()][0].x < 100, 'Gaśnie tylko drzewo w deszczu');
}

// 1.43.1: drzewo poza wczytanym terenem czeka, nie płonie "na niby".
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'birch', 0, 0);
    const before = census(world, 'birch');
    const result = fire.ignite(0, BASE + 1, 0);
    check(result.ok, 'Brzoza się zajęła');
    run(fire, 4);
    const early = census(world, 'birch');
    // Gracz odchodzi daleko - chunki z drzewem znikają z pamięci.
    world.getChunk = () => null;
    run(fire, result.tree.duration + 20);
    equal([fire.trees.size, result.tree.time], [1, 4], 'Poza wczytanym terenem drzewo czeka');
    equal(census(world, 'birch'), early, 'Bloki nietknięte');
    equal(events(game, 'treeBurnt').length, 0, 'Nie trafia na listę spalonych');
    // Gracz wraca.
    world.getChunk = () => ({});
    run(fire, result.tree.duration + 20);
    const after = census(world, 'birch');
    equal([fire.trees.size, after.logs, after.leaves], [0, 0, 0], 'Po powrocie dopala się naprawdę');
    check(after.ash > 0 && before.logs > 0, 'Zostaje popiół');
    // Sąsiad przy granicy wczytanego terenu jeszcze się nie zajmuje
    // (los zawsze sprzyja ogniowi - bez tej granicy zająłby się od razu).
    plant(world, 'spruce', 40, 0, 3);
    plant(world, 'spruce', 46, 0, 4);
    fire.random = () => 0;
    fire.ignite(40, BASE + 1, 0, 'command', true);
    world.getChunk = (cx) => (cx >= 3 ? null : {});
    run(fire, 3);
    check(fire.trees.size === 1 && !events(game, 'treeIgnited').some((data) => data.source === 'spread'), 'Sąsiad za granicą wczytanego terenu czeka');
    world.getChunk = () => ({});
    run(fire, 3);
    check(events(game, 'treeIgnited').some((data) => data.source === 'spread'), 'Teren wczytany - ogień przeskakuje');
}

// Limit płonących drzew, ustawienie świata, gość.
{
    const game = makeGame(), { fire, world } = game;
    for (let i = 0; i < F.MAX_BURNING + 2; i++) plant(world, 'aspen', i * 30, 500, i + 1);
    let lit = 0;
    for (let i = 0; i < F.MAX_BURNING + 2; i++) if (fire.ignite(i * 30, BASE + 1, 500).ok) lit++;
    equal([lit, fire.trees.size], [F.MAX_BURNING, F.MAX_BURNING], 'Najwyżej tyle drzew naraz');
    check(fire.setMode('off') && fire.trees.size === 0 && fire.flames.size === 0 && fire.settingsVersion === 1, 'Wyłączenie gasi wszystko');
    plant(world, 'birch', 0, 0);
    check(!fire.ignite(0, BASE + 1, 0).ok && fire.ignite(0, BASE + 1, 0).reason.includes('wyłączone'), 'Wyłączone: nic nie płonie');
    check(fire.ignite(0, BASE + 1, 0, 'command', true).ok, 'Komenda podpala mimo ustawienia');
    fire.putOutAll();
    check(!fire.setMode('off') && !fire.setMode('bzdura') && fire.setMode('full') && fire.mode === 'full', 'Zmiana ustawienia');
    equal(fire.getState(), { mode: 'full' }, 'Zapis: samo ustawienie');
    equal([new W.Wildfire(game, { mode: 'full' }).mode, new W.Wildfire(game, { mode: 'x' }).mode, new W.Wildfire(game, null).mode, new W.Wildfire(game, { mode: 'toString' }).mode],
        ['full', 'player', 'player', 'player'], 'Odczyt ustawienia');
    const guest = makeGame();
    guest.net = { isClient: true };
    plant(guest.world, 'birch', 0, 0);
    check(!guest.fire.ignite(0, BASE + 1, 0).ok, 'Gość nie podpala - pożarem rządzi gospodarz');
    guest.fire.flames.set('a', { x: 0, y: BASE, z: 0, radius: 3, height: 6, left: 20 });
    const before = census(guest.world, 'birch');
    guest.fire.step(1);
    equal(census(guest.world, 'birch'), before, 'U gościa krok niczego nie zmienia w świecie');
}

// Starter ognia w ręce.
{
    const game = makeGame(), { fire, world } = game;
    plant(world, 'birch', 0, 0);
    game.currentHit = { hit: true, block: { x: 0, y: BASE + 1, z: 0 } };
    game.selectedBlock = 'stick';
    for (let i = 0; i < 80; i++) fire.updateHold(0.1, true);
    equal(fire.trees.size, 0, 'Patyk nie podpala');
    game.selectedBlock = 'fire_starter';
    for (let i = 0; i < 30; i++) fire.updateHold(0.1, true);
    check(fire.trees.size === 0 && last(game).includes('Podpalanie pnia brzozy') && last(game).includes('%'), 'Postęp podpalania');
    fire.updateHold(0.1, false);
    for (let i = 0; i < 30; i++) fire.updateHold(0.1, true);
    equal(fire.trees.size, 0, 'Puszczenie przycisku zeruje postęp');
    for (let i = 0; i < 25; i++) fire.updateHold(0.1, true);
    check(fire.trees.size === 1 && last(game).includes('zajęło'), 'Po pięciu sekundach drzewo płonie');
    for (let i = 0; i < 80; i++) fire.updateHold(0.1, true);
    equal(events(game, 'treeIgnited').length, 1, 'Dalsze trzymanie nie podpala od nowa');
    // W deszczu - odmowa od razu, bez czekania.
    const wet = makeGame();
    plant(wet.world, 'birch', 0, 0);
    wet.rainNow = 0.8; wet.selectedBlock = 'fire_starter'; wet.currentHit = { hit: true, block: { x: 0, y: BASE + 1, z: 0 } };
    wet.fire.updateHold(0.1, true);
    check(last(wet).includes('deszczu') && wet.notices.length === 1, 'W deszczu: odmowa od razu');
    for (let i = 0; i < 80; i++) wet.fire.updateHold(0.1, true);
    check(wet.fire.trees.size === 0 && wet.notices.length === 1, 'I bez powtarzania napisu');
    // Ogniska starter dalej nie dotyczy pożaru.
    const camp = makeGame();
    camp.world.setBlock(0, BASE, 0, 'campfire');
    camp.selectedBlock = 'fire_starter'; camp.currentHit = { hit: true, block: { x: 0, y: BASE, z: 0 } };
    for (let i = 0; i < 80; i++) camp.fire.updateHold(0.1, true);
    equal([camp.fire.trees.size, camp.notices.length], [0, 0], 'Starter na ognisku: pożar się nie wtrąca');
}

// Krok nie przekracza budżetu bloków; update po zacięciu nie nadrabia hurtem.
{
    const game = makeGame(), { fire, world } = game;
    for (let i = 0; i < 12; i++) plant(world, 'spruce', i * 40, 900, i + 3);
    for (let i = 0; i < 12; i++) fire.ignite(i * 40, BASE + 1, 900);
    let changes = 0;
    const clear = world.clearBlock, set = world.setBlock;
    world.clearBlock = (...a) => { changes++; return clear(...a); };
    world.setBlock = (...a) => { changes++; return set.call(world, ...a); };
    let worst = 0;
    for (let i = 0; i < 400; i++) { changes = 0; fire.step(W.FIRE_STEP_SECONDS); worst = Math.max(worst, changes); }
    check(worst > 0 && worst <= W.BLOCKS_PER_STEP + 8, `Najwyżej ${W.BLOCKS_PER_STEP} bloków na krok (było ${worst})`);
    equal([fire.trees.size, census(world, 'spruce').logs], [0, 0], 'Mimo budżetu wszystko się dopaliło');
    const slow = makeGame();
    plant(slow.world, 'birch', 0, 0);
    slow.fire.ignite(0, BASE + 1, 0);
    let steps = 0;
    const step = slow.fire.step.bind(slow.fire);
    slow.fire.step = (seconds) => { steps++; step(seconds); };
    slow.fire.update(5, false);
    check(steps <= 2, 'Po zacięciu najwyżej dwa kroki naraz');
}

// Gra ze znajomymi: płomienie w StateSync.
{
    const game = makeGame();
    plant(game.world, 'birch', 0, 0);
    game.fire.ignite(0, BASE + 1, 0);
    const systems = stateSystems({ wildfire: game.fire });
    check(systems.wildfire && systems.wildfire.map() === game.fire.flames && systems.wildfire.restore === W.restoreFlames && systems.wildfire.sign === W.flamesSign, 'StateSync zna płomienie');
    const flame = [...game.fire.flames.values()][0];
    equal(W.restoreFlames(JSON.parse(JSON.stringify(flame))), flame, 'Płomienie przechodzą przez sieć');
    equal([W.restoreFlames(null), W.restoreFlames({ x: 1.5, y: 2, z: 3 }), W.restoreFlames({ x: 1, y: -2, z: 3 })], [null, null, null], 'Śmieci odpadają');
    equal(W.restoreFlames({ x: 1, y: 2, z: 3, radius: 999, height: NaN, left: -5 }), { x: 1, y: 2, z: 3, radius: 12, height: 2, left: 0 }, 'Wartości przycięte');
    const version = game.fire.version; systems.wildfire.changed();
    equal(game.fire.version, version + 1, 'Zmiana z sieci podbija wersję');
}

// ------------------------------------------------------------
// 4. Obraz.
// ------------------------------------------------------------
{
    const start = R.flameColor(0), middle = R.flameColor(0.4), end = R.flameColor(1);
    check(start[2] > middle[2] && middle[1] > end[1] && end[0] < 1 && [start, middle, end].flat().every((value) => value >= 0 && value <= 1.3), 'Płomień: od białego żaru do czerwieni');
    const game = makeGame();
    game.scene = new THREE.Scene();
    game.camera = { position: { x: 0, y: BASE + 4, z: 12 } };
    const renderer = new R.WildfireRenderer(game, game.fire);
    renderer.update(0.05);
    check(!renderer.points.visible && renderer.alive === 0, 'Bez pożaru nic się nie rysuje');
    plant(game.world, 'spruce', 0, 0);
    game.fire.ignite(0, BASE + 1, 0);
    for (let i = 0; i < 40; i++) renderer.update(0.05);
    check(renderer.points.visible && renderer.alive > 60 && renderer.alive <= R.PARTICLES, `Płonące drzewo daje cząsteczki (${renderer.alive})`);
    const flame = [...game.fire.flames.values()][0];
    const inside = [...Array(renderer.alive).keys()].every((i) => Math.hypot(renderer.position[i * 3] - 0.5, renderer.position[i * 3 + 2] - 0.5) < flame.radius + 12 && renderer.position[i * 3 + 1] >= flame.y);
    check(inside, 'Cząsteczki są przy drzewie i nad ziemią');
    check([...renderer.emission.slice(0, renderer.alive)].some((value) => value === 1) && [...renderer.emission.slice(0, renderer.alive)].some((value) => value === 0), 'Są płomienie (świecą) i dym (nie świeci)');
    // Dużo drzew: liczba cząsteczek ma sufit.
    for (let i = 0; i < 30; i++) game.fire.flames.set(`t${i}`, { x: i * 3, y: BASE, z: 0, radius: 4, height: 12, left: 30 });
    for (let i = 0; i < 100; i++) renderer.update(0.05);
    check(renderer.alive <= R.PARTICLES, 'Sufit cząsteczek');
    // Daleki pożar nie daje cząsteczek.
    game.fire.flames.clear();
    game.fire.flames.set('far', { x: 5000, y: BASE, z: 0, radius: 4, height: 12, left: 30 });
    for (let i = 0; i < 200; i++) renderer.update(0.05);
    check(renderer.alive === 0 && !renderer.points.visible, 'Daleki pożar: zero cząsteczek, stare wygasły');
    renderer.dispose();
    equal(game.scene.children.length, 0, 'Scena posprzątana');
}

// ------------------------------------------------------------
// 5. Osiągnięcia, poradnik, komenda, podpięcie.
// ------------------------------------------------------------
{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    for (const id of ['tree_ignited', 'fire_spread', 'fire_rained_out', 'charcoal_found', 'ash_field']) check(byId[id] && itemExists(byId[id].icon), `Osiągnięcie ${id} z ikoną`);
    check(byId.tree_ignited.when({ source: 'player' }) && !byId.tree_ignited.when({ source: 'spread' }) && !byId.tree_ignited.when({ source: 'command' }), 'Podpalenie tylko własną ręką');
    check(byId.fire_spread.when({ burning: 5 }) && !byId.fire_spread.when({ burning: 4 }), 'Pięć naraz');
    check(byId.charcoal_found.when({ type: 'charred_log' }) && !byId.charcoal_found.when({ type: 'oak_log' }), 'Węgiel');
    check(byId.ash_field.when({ from: 'ash' }) && !byId.ash_field.when({ from: 'compost' }), 'Popiół na polu');
    equal(new Set(ACHIEVEMENTS.map((entry) => entry.title)).size, ACHIEVEMENTS.length, 'Tytuły osiągnięć bez powtórek');

    const chapter = GUIDE.find((entry) => entry.id === 'wildfire');
    check(chapter && chapter.lines.length >= 6, 'Rozdział poradnika');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : `${line.text} ${line.touch}`)).join(' ');
    for (const word of ['Starter ognia', 'popiół', 'zwęglony kikut', 'przeżywają', 'wiatrem', 'Deszcz', 'Budowle nie płoną', 'węgiel drzewny']) check(text.includes(word), `Poradnik: ${word}`);

    // Nazwy i aliasy komend bez powtórek po uproszczeniu (ą -> a...): powtórka
    // zatrzymuje start gry ("Komenda już istnieje") - tak było z aliasem "pożar".
    {
        const { readdirSync } = await import('node:fs');
        const simple = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').toLowerCase();
        const names = new Map();
        let commands = 0;
        for (const file of readdirSync(new URL('../src/commands/', import.meta.url)).filter((name) => name.endsWith('Commands.js'))) {
            const source = read(`src/commands/${file}`);
            for (const match of source.matchAll(/\n {4}\{\n {8}name: '([^']+)',(?:\n {8}aliases: \[([^\]]*)\],)?/g)) {
                commands++;
                const all = [match[1], ...(match[2] ? [...match[2].matchAll(/'([^']+)'/g)].map((alias) => alias[1]) : [])];
                for (const name of all) {
                    const key = simple(name);
                    assert.ok(!names.has(key), `Komenda "${name}" (${file}) powtarza "${names.get(key)}"`);
                    names.set(key, `${match[1]} (${file})`);
                }
            }
        }
        check(commands > 60 && names.has('pozar') && names.has('naciecie'), `Nazwy komend bez powtórek (${commands} komend, ${names.size} nazw)`);
    }
    check(read('src/commands/worldCommands.js').includes("name: 'pozar'") && read('docs/komendy.md').includes('/pozar podpal'), 'Komenda i jej opis');
    const gameSource = read('src/game/Game.js');
    for (const piece of ['new Wildfire(this, worldInfo.wildfire)', 'new WildfireRenderer(this, this.wildfire)', 'this.wildfire.update(dt, input.isMouseDown(2) && !breakHeld && !breakPressed)',
        'this.wildfireRenderer.update(dt)', 'this.saver.wildfire = this.wildfire', 'this.wildfireRenderer.dispose()']) check(gameSource.includes(piece), `Game.js: ${piece}`);
    const saver = read('src/storage/WorldSaver.js');
    check(saver.includes('this.worldInfo.wildfire = this.wildfire.getState()') && saver.includes('this.savedWildfireVersion !== (this.wildfire.settingsVersion ?? 0)'), 'Zapis ustawienia');
    check(read('src/game/Warmth.js').includes('game.wildfire?.heatAt?.(x, y, z)'), 'Płonące drzewa grzeją');
    check(read('docs/pozar.md').includes('## Luki'), 'Opis z lukami');
}

console.log(`OK: pożar - ${checks} sprawdzeń.`);
