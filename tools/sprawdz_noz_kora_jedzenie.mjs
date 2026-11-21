// ------------------------------------------------------------
// SPRAWDZENIE: NÓŻ, KORA, JEDZENIE, ŚWIAT NADRABIA CZAS (0.100.0)
//
// - nóż z każdej skały (przedmioty, przepis, ikony w atlasie),
// - trawa i kwiaty tylko nożem: zniszczone gołą ręką nic nie dają,
//   zbiór kwiatów i ziół wymaga noża, roślina zostaje i odrasta,
// - kora z każdego drzewa, które da się okorować; wszystkie są podpałką,
//   lepiej palące się rozpalają szybciej,
// - jedzenie trwa: zaczyna się, kończy po czasie, da się je przerwać,
// - sen i utrata przytomności: świat nadrabia czas (rośliny, ogniska).
//
// Uruchomienie: node tools/sprawdz_noz_kora_jedzenie.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer { update() {} dispose() {} } export const TABLE_ROTATION = {}; export function productSpot() { return { x: 0, z: 0 }; }' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const R = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES, getTool, getItemLabel, itemExists } = await import('../src/items/ItemRegistry.js');
const { STONE_TOOL_MATERIALS, STONE_TOOL_KINDS, stoneToolType } = await import('../src/items/stoneTools.js');
const { findRecipe, gridResult } = await import('../src/crafting/Crafting.js');
const { GameInteraction } = await import('../src/game/GameInteraction.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { Wellbeing, FULLNESS_LIMIT } = await import('../src/game/Wellbeing.js');
const { PLANT_PACKS } = await import('../src/blocks/plantPacks.js');
const { TINDERS, FIRE_WOODS, newCampfire, addFirewood, addTinder, updateCampfire } = await import('../src/game/CampfireState.js');
const { BARK_TINDER, barkType } = await import('../src/items/bark.js');
const { getCategory } = await import('../src/items/categories.js');
const { itemUses } = await import('../src/items/uses.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { Sleep, nextWake } = await import('../src/game/Sleep.js');
const { EAT_SECONDS, TOOL_MATERIALS, DAY_LENGTH_MINUTES, CHUNK_SIZE } = await import('../src/config.js');
const { getFood } = await import('../src/items/foods.js');
const { packPlayer, unpackPlayer } = await import('../src/net/protocol.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const atlas = JSON.parse(source('assets/textures/atlas.json'));
const G = GameInteraction.prototype;

// Kafelek atlasu istnieje i nie nachodzi na żaden inny.
function tileFree(name) {
    const tile = atlas.tiles[name];
    if (!tile || !atlas.regions[name]) return false;
    return !Object.entries(atlas.tiles).some(([other, t]) => other !== name &&
        t.x <= tile.x && tile.x < t.x + (t.w ?? 1) && t.y <= tile.y && tile.y < t.y + (t.h ?? 1));
}


// --- Nóż -----------------------------------------------------------------------

{
    check(STONE_TOOL_KINDS.includes('knife') && Object.hasOwn(TOOL_MATERIALS, 'knife'), 'Nóż jest czwartym kamiennym narzędziem');
    for (const material of STONE_TOOL_MATERIALS) {
        const type = stoneToolType('knife', material.stone);
        check(itemExists(type) && getTool(type) === 'knife' && /^Nóż/.test(getItemLabel(type)), `${type}: przedmiot i narzędzie`);
        check(findRecipe([null, material.stone, 'stick', null])?.id === 'knife' &&
            gridResult([null, { type: material.stone, count: 1 }, { type: 'stick', count: 1 }, null])?.type === type, `${type}: skała i patyk na ukos`);
        check(tileFree(type), `${type}: ikona w atlasie`);
        check(itemUses(type).includes('narzędzie'), `${type}: zastosowanie`);
    }
    check(getItemLabel('knife_granite') === 'Nóż granitowy' && getItemLabel('knife_basalt') === 'Nóż bazaltowy', 'Nazwy w rodzaju męskim');
    check(findRecipe(['stone', null, 'stick', null])?.result[0] === 'shovel' && findRecipe(['stone', 'stone', null, 'stick'])?.result[0] === 'pickaxe', 'Łopata i kilof bez zmian');
    check(findRecipe(['stone', 'stick', null, null]) === null || findRecipe(['stone', 'stick', null, null]).result[0] !== 'knife', 'Skała obok patyka to nie nóż');
    check(atlas.aliases['assets/textures/derived/knife_granite.png'] === 'knife_granite', 'Wariant noża ma kopię dla wiki i paczek tekstur');
}


// --- Trawa i kwiaty tylko nożem -------------------------------------------------

{
    const drops = (type, tool) => G.breakDrops.call({ campfires: { drops: () => [] } }, type, null, tool);
    const cut = ['short_grass', 'tall_grass', 'dune_grass', 'reed', 'fern', 'clover', 'nettle', 'plantain', 'poppy', 'cornflower', 'chamomile', 'dandelion', 'heather', 'crocus'];
    for (const type of cut) {
        check(R.needsKnife(type), `${type}: roślina do ścinania`);
        check(drops(type, null).length === 0 && drops(type, 'axe').length === 0 && drops(type, 'shovel').length === 0, `${type}: bez noża nic nie zostaje`);
        check(JSON.stringify(drops(type, 'knife')) === JSON.stringify([{ type, count: 1 }]), `${type}: ścięta nożem trafia do ekwipunku`);
    }
    for (const type of ['oak_log', 'stone', 'dirt', 'moss_carpet', 'water_lily', 'strawberry_sapling', 'huba_etap1']) {
        check(!R.needsKnife(type) && drops(type, null).some((drop) => drop.count >= 1), `${type}: bez zmian, wypada jak dotąd`);
    }
    // Trawa i kwiaty dalej są podpałką, barwnikiem, słomą...
    check(TINDERS.short_grass === 1 && findRecipe(['short_grass', 'tall_grass'])?.result[0] === 'straw', 'Ścięta trawa służy do tego samego co dotąd');

    // Rośliny etapowe: kwiaty i zioła zbiera się nożem.
    const knifePacks = PLANT_PACKS.filter((pack) => pack.harvest?.tool === 'knife').map((pack) => pack.id);
    for (const pack of PLANT_PACKS) {
        const groups = pack.item?.groups ?? [];
        if (groups.includes('flowers')) check(pack.harvest?.tool === 'knife', `${pack.id}: kwiat - zbiór nożem`);
    }
    check(knifePacks.length === 14 && ['nagietek', 'lawenda', 'szalwia', 'len', 'gorczyca', 'indygowiec'].every((id) => knifePacks.includes(id)), `Zbiór nożem: ${knifePacks.length} roślin`);
    check(['huba', 'ochra', 'marzanna', 'porostiglasty', 'porostoliwkowy'].every((id) => !knifePacks.includes(id)), 'Huba, porosty, ochra i korzeń marzanny - dalej ręką');
    check(R.getHarvest('nagietek_etap3').tool === 'knife' && R.getHarvest('huba_etap3').tool === undefined && R.getHarvest('strawberry_bush_full').tool === undefined, 'Pole tool w zbiorze');

    const mature = drops('nagietek_etap3', null);
    check(mature.length === 1 && mature[0].type === 'nagietek_etap1', 'Zerwany ręką kwitnący nagietek: zostaje sama sadzonka');
    const withKnife = drops('nagietek_etap3', 'knife');
    check(withKnife.length === 2 && withKnife[1].type === 'nagietek_kwiat' && withKnife[1].count >= 1, 'Wycięty nożem: sadzonka i kwiaty');
    check(drops('huba_etap3', null).some((drop) => drop.type === 'huba_huba'), 'Huba zerwana ręką dalej daje hubę');

    // Zbiór PPM: bez noża odmowa, z nożem kwiat, a roślina zostaje.
    const world = { block: 'nagietek_etap3', setBlock(x, y, z, type) { this.block = type; return true; } };
    const notices = [], achieved = [];
    const game = {
        world, inventory: Inventory.load({}, 'adventure'), selectedBlock: null, rejected: 0,
        plantAnimations: { reject() { game.rejected++; } }, onNotice: (text) => notices.push(text),
        achieve: (name, data) => achieved.push([name, data]), addHarvest: G.addHarvest
    };
    const hit = () => ({ hit: true, block: { x: 0, y: 5, z: 0, type: world.block } });
    check(G.harvestTarget.call(game, hit()) === false && world.block === 'nagietek_etap3' && /nożem/.test(notices.at(-1)) && game.rejected === 1, 'Zbiór kwiatów bez noża: odmowa i podpowiedź');
    game.selectedBlock = 'axe';
    check(G.harvestTarget.call(game, hit()) === false, 'Siekiera to nie nóż');
    game.selectedBlock = 'knife_slate';
    check(G.harvestTarget.call(game, hit()) === true && world.block === 'nagietek_etap2' && game.inventory.count('nagietek_kwiat') >= 1, 'Nożem: kwiaty w ekwipunku, łodyga zostaje');
    check(R.getBlockDefinition('nagietek_etap2').grows?.into === 'nagietek_etap3' && achieved.at(-1)[0] === 'harvested', 'Roślina zakwitnie od nowa');
    world.block = 'strawberry_bush_full'; game.selectedBlock = null;
    check(G.harvestTarget.call(game, hit()) === true && game.inventory.count('strawberry') >= 1, 'Owoce z krzaka dalej zbiera się ręką');
    world.block = 'huba_etap3';
    check(G.harvestTarget.call(game, hit()) === true, 'Hubę też');

    const pack = JSON.parse(source('assets/rosliny/nagietek/roslina.json'));
    check(pack.zbior.narzedzie === 'noz', 'Paczka rośliny: "zbior": { "narzedzie": "noz" }');
}


// --- Kora ------------------------------------------------------------------------

{
    const logs = Object.entries(R.BLOCK_TYPES).filter(([, definition]) => definition.part === 'log' && definition.strip);
    check(logs.length >= 19, `Pni do okorowania: ${logs.length}`);
    const barks = new Set();
    for (const [type, definition] of logs) {
        const strip = R.getStrip(type);
        check(strip.item === barkType(definition.tree) && itemExists(strip.item), `${type}: okorowanie daje korę (${strip.item})`);
        check(/^Kora /.test(getItemLabel(strip.item)) && getCategory(strip.item) === 'drewno', `${strip.item}: nazwa i kategoria`);
        check(TINDERS[strip.item] >= 1 && itemUses(strip.item).some((use) => use.startsWith('podpałka')), `${strip.item}: podpałka`);
        check(tileFree(ITEM_TYPES[strip.item].icon), `${strip.item}: ikona w atlasie`);
        barks.add(strip.item);
    }
    check(barks.size === Object.keys(FIRE_WOODS).length && barks.size === 32, `Kora każdego gatunku (${barks.size})`);
    check(getItemLabel('oak_bark') === 'Kora dębu' && getItemLabel('pine_bark') === 'Kora sosny' && getItemLabel('birch_bark') === 'Kora brzozowa', 'Nazwy kory');
    check(R.getStrip('pine_log_resin').item === 'pine_bark' && R.getStrip('pine_log_upper').item === 'pine_bark', 'Każdy pień sosny daje korę sosny');
    check(R.getStrip('oak_log_stripped') === null && R.getStrip('stone') === null, 'Okorowany pień i kamień - nic');
    // Lepiej palące się kory.
    check(TINDERS.birch_bark === 1.5 && TINDERS.pine_bark === 1.25 && TINDERS.spruce_bark === 1.25 && TINDERS.oak_bark === 1 && TINDERS.beech_bark === 1, 'Brzoza najlepsza, iglaste lepsze, reszta jak trawa');
    for (const wood of Object.keys(BARK_TINDER)) check(Object.hasOwn(FIRE_WOODS, wood), `Lepsza kora: znane drzewo ${wood}`);
    const time = (tinder) => {
        const fire = newCampfire(0, 60, 0);
        for (let i = 0; i < 6; i++) addFirewood(fire, 'oak');
        addTinder(fire, tinder);
        let seconds = 0;
        while (fire.phase === 'unlit' && seconds < 20) { updateCampfire(fire, 0.05, true); seconds += 0.05; }
        return seconds;
    };
    check(time('birch_bark') < time('pine_bark') && time('pine_bark') < time('oak_bark') && Math.abs(time('oak_bark') - 5) < 0.11, 'Kora brzozy rozpala najszybciej, dębu - w 5 sekund');

    // Okorowanie siekierą daje korę do ekwipunku.
    const world = { block: 'oak_log', setBlock(x, y, z, type) { this.block = type; return true; } };
    const achieved = [];
    const game = { world, inventory: Inventory.load({}, 'adventure'), playBlockSound() {}, achieve: (name, data) => achieved.push([name, data]), onNotice() {} };
    check(G.stripTarget.call(game, { hit: true, block: { x: 0, y: 5, z: 0, type: 'oak_log' } }) === true && world.block === 'oak_log_stripped' && game.inventory.count('oak_bark') === 1, 'Okorowany dąb: kora w ekwipunku');
    check(achieved.at(-1)[0] === 'stripped' && achieved.at(-1)[1].item === 'oak_bark', 'Zdarzenie okorowania z korą');
}


// --- Jedzenie trwa -------------------------------------------------------------------

function eater(items = [['jablon_jablko', 3]]) {
    const notices = [], achieved = [], heard = [];
    const game = {
        inventory: Inventory.load({}, 'adventure'),
        wellbeing: Wellbeing.load({ energy: 50 }, 0.4, () => 0.5),
        time: { days: 0.4 }, eatDelay: 0, eating: null,
        sleep: { active: false }, blackout: { active: false },
        sounds: { play: (name) => heard.push(name) },
        onNotice: (text) => notices.push(text), onWellbeing() {},
        achieve: (name, data) => achieved.push([name, data]),
        notices, achieved, heard
    };
    for (const name of ['eat', 'updateEating', 'finishEating']) game[name] = G[name];
    for (const [type, count] of items) game.inventory.add(type, count);
    return game;
}
function chew(game, seconds, dt = 0.05) {
    for (let t = 0; t < seconds - 1e-9; t += dt) { game.eatDelay = Math.max(0, game.eatDelay - dt); game.updateEating(dt); }
}

{
    check(EAT_SECONDS.snack >= 1 && EAT_SECONDS.snack < EAT_SECONDS.meal && EAT_SECONDS.meal <= 3 && EAT_SECONDS.drink >= 1, 'Jedzenie trwa od sekundy do trzech; posiłek dłużej niż przekąska');
    const game = eater();
    const energy = game.wellbeing.data.energy;
    check(game.eat() === true && game.eating?.type === 'jablon_jablko' && game.eating.seconds === EAT_SECONDS.snack, 'F zaczyna jedzenie');
    check(game.inventory.selectedItem.count === 3 && game.wellbeing.data.energy === energy, 'Na początku nic nie ubywa i nic nie przybywa');
    check(game.eat() === false, 'W trakcie jedzenia nie zaczyna się drugiego');
    chew(game, EAT_SECONDS.snack - 0.2);
    check(game.eating !== null && game.inventory.selectedItem.count === 3 && game.heard.length >= 2, 'W połowie: dalej je, słychać kęsy');
    chew(game, 0.3);
    check(game.eating === null && game.inventory.selectedItem.count === 2 && game.wellbeing.data.energy > energy, 'Po czasie: sztuka zjedzona, energia rośnie');
    check(game.achieved.at(-1)[0] === 'ate' && game.achieved.at(-1)[1].type === 'jablon_jablko', 'Zdarzenie "zjadł" dopiero na końcu');

    // Przerwanie: zmiana miejsca na pasku, kopanie, sen.
    for (const [name, interrupt] of [
        ['zmiana miejsca na pasku', (g) => { g.inventory.selected = 3; }],
        ['kopanie', (g) => { g.updateEating(0.05, true); }],
        ['sen', (g) => { g.sleep.active = true; }],
        ['utrata przytomności', (g) => { g.blackout.active = true; }],
        ['wyrzucenie jedzenia', (g) => { g.inventory.set(0, null); }]
    ]) {
        const stopped = eater();
        chew(stopped, 0.5); stopped.eatDelay = 0;
        stopped.eat();
        chew(stopped, 0.5);
        const before = stopped.wellbeing.data.energy, eaten = stopped.achieved.length;
        interrupt(stopped);
        chew(stopped, 3);
        check(stopped.eating === null && stopped.achieved.length === eaten && stopped.wellbeing.data.energy === before, `Przerwane (${name}): nic nie zjedzono`);
        if (name !== 'wyrzucenie jedzenia') check(stopped.inventory.get(0).count === 3, `Przerwane (${name}): jedzenie zostaje`);
    }

    // Posiłek trwa dłużej, napar oddaje kubek.
    const meal = eater([['roasted_apple', 1]]);
    meal.eat();
    check(meal.eating.seconds === EAT_SECONDS.meal, 'Pieczone jabłko je się dłużej');
    chew(meal, EAT_SECONDS.meal + 0.1);
    check(meal.inventory.selectedItem === null && meal.achieved.at(-1)[1].kind === 'meal', 'Posiłek zjedzony');
    const tea = eater([['tea_calm', 1]]);
    tea.eat();
    check(tea.eating.seconds === EAT_SECONDS.drink && getFood('tea_calm').returns === 'clay_cup', 'Napar pije się chwilę');
    chew(tea, EAT_SECONDS.drink + 0.1);
    check(tea.inventory.count('clay_cup') === 1 && tea.inventory.count('tea_calm') === 0, 'Po wypiciu wraca kubek');

    // Odmowy od razu, bez zaczynania.
    const none = eater([['stone', 1]]);
    check(none.eat() === false && none.eating === null, 'Kamienia się nie je');
    const stuffed = eater();
    stuffed.wellbeing.data.fullness = FULLNESS_LIMIT;
    check(stuffed.eat() === false && stuffed.eating === null && /zmieścisz/.test(stuffed.notices.at(-1)), 'Pełny żołądek: odmowa od razu');
    const creative = eater();
    creative.wellbeing.active = false;
    check(creative.eat() === false && creative.eating === null, 'W trybie kreatywnym nie trzeba jeść');

    // Animacja: znacznik "je" leci do innych graczy.
    const player = { pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, onGround: true };
    check(unpackPlayer(packPlayer(player, 'jablon_jablko', 0, false, true)).eating === true && unpackPlayer(packPlayer(player, null, 0, true, false)).eating === false, 'Inni gracze widzą, że ktoś je');
    check(unpackPlayer(packPlayer(player, null, 0, true, true)).sleeping === true, 'Znacznik snu bez zmian');
    check(/eating: Boolean\(this\.eating\)/.test(source('src/game/Game.js')) && /this\.hand\.setEating\(Boolean\(this\.eating\)\)/.test(source('src/game/Game.js')), 'Ręka i postać dostają stan jedzenia');
    check(/A\.eat/.test(source('src/player/PlayerAnimator.js')) && /setEating\(on\)/.test(source('src/player/FirstPersonHand.js')), 'Animacja jedzenia w obu widokach');
}


// --- Świat nadrabia czas -----------------------------------------------------------------

{
    // Rośliny: advance robi tyle losowań, ile minęło sekund.
    const blocks = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    const index = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
    const chunk = {
        cx: 0, cz: 0, modified: true, growing: new Set(),
        get blocks() { return new Proxy({}, { get: (_, i) => blocks.get(Number(i)) ?? 0 }); }
    };
    const world = {
        chunks: new Map([['0,0', chunk]]),
        getBlockId: (x, y, z) => blocks.get(index(x, y, z)) ?? 0,
        getBlock: (x, y, z) => R.getBlockTypeById(blocks.get(index(x, y, z)) ?? 0),
        setBlock(x, y, z, type) {
            const id = type === null ? 0 : R.getBlockId(type);
            blocks.set(index(x, y, z), id);
            if (R.getGrowth(type)) chunk.growing.add(index(x, y, z)); else chunk.growing.delete(index(x, y, z));
            return true;
        }
    };
    const plant = () => {
        blocks.clear(); chunk.growing.clear();
        for (let x = 0; x < 8; x++) { world.setBlock(x, 4, 2, 'dirt'); world.setBlock(x, 5, 2, 'nagietek_etap1'); }
    };
    const stages = () => Array.from({ length: 8 }, (_, x) => world.getBlock(x, 5, 2));
    const growth = new PlantGrowth(world);
    // Wzrost jest losowy: przy prawdziwym losowaniu "wszystkie dorosły po
    // 2000 s" nie udawało się raz na kilkadziesiąt uruchomień (dwa etapy
    // po średnio 240 s). Stały ciąg liczb - test daje zawsze ten sam wynik.
    const realRandom = Math.random;
    let randomState = 20261121;
    Math.random = () => (randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296;
    plant();
    growth.advance(1);
    check(stages().filter((type) => type !== 'nagietek_etap1').length <= 1, 'Sekunda: prawie nic nie urosło');
    plant();
    growth.advance(11 * 50);
    const night = stages().filter((type) => type !== 'nagietek_etap1').length;
    check(night >= 3, `Przespana noc (550 s): rośliny urosły (${night} z 8)`);
    plant();
    growth.advance(40 * 50);
    check(stages().every((type) => type === 'nagietek_etap3'), 'Długi czas: wszystkie dorosły do końca');
    // Nietknięty chunk nie rośnie (jak zwykle) i nic nie kosztuje.
    plant(); chunk.modified = false;
    growth.advance(2000);
    check(stages().every((type) => type === 'nagietek_etap1'), 'Dzikie rośliny w nietkniętym terenie nie rosną');
    chunk.modified = true;
    // W grze ze znajomymi noc przesuwa gospodarz - za wszystkie chunki.
    growth.shouldTick = () => false;
    growth.advance(2000);
    check(stages().every((type) => type === 'nagietek_etap3'), 'Nadrabianie nie pyta, kto jest najbliżej chunka');
    Math.random = realRandom;

    // Sen: przeskok nocy woła advanceWorld z przespanymi sekundami.
    const advanced = [];
    const vector = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    const game = {
        time: { days: 0.9 }, net: null,
        player: { pos: vector(), vel: vector(), yaw: 0, pitch: 0, swimming: false, flying: false },
        wellbeing: Wellbeing.load({ energy: 80, rest: 20 }, 0.9, () => 0.5),
        blackout: { active: false }, onNotice() {}, onMessage() {}, onWellbeing() {}, achieve() {}, stopMining() {},
        advanceWorld: (seconds) => advanced.push(seconds)
    };
    game.sleep = new Sleep(game);
    const quiet = { isKeyDown: () => false, consumeMousePress: () => false };
    check(game.sleep.start({ place: 'ground', comfort: 0 }), 'Gracz kładzie się spać');
    for (let t = 0; t < 12 && advanced.length === 0; t += 0.1) { game.time.days += 0.1 / (DAY_LENGTH_MINUTES * 60); game.sleep.update(0.1, quiet); }
    const expected = (nextWake(0.9) - 0.9) * DAY_LENGTH_MINUTES * 60;
    check(advanced.length === 1 && Math.abs(advanced[0] - expected) < 15 && advanced[0] > 400, `Noc przespana: świat nadrabia ${Math.round(advanced[0])} s`);
    check(Math.abs(game.time.days - nextWake(0.9)) < 1e-9, 'Zegar na 6:00 rano');

    const gameSource = source('src/game/Game.js');
    check(/advanceWorld\(seconds\) \{[\s\S]*?this\.campfires\.advance\(seconds\);[\s\S]*?this\.plantGrowth\.advance\(seconds\);/.test(gameSource), 'advanceWorld: ogniska i rośliny');
    check(/game\.advanceWorld\?\.\(HOURS_LOST \/ 24 \* DAY_LENGTH_MINUTES \* 60\)/.test(source('src/game/Blackout.js')), 'Utrata przytomności też przesuwa świat');
    check(/advance\(seconds\) \{\s*for \(const fire of this\.fires\.values\(\)\) updateCampfire\(fire, seconds\);/.test(source('src/game/Campfires.js')), 'Ogniska dopalają się przez przespany czas');
}

console.log(`OK: nóż, kora, jedzenie i nadrabianie czasu - ${checks} sprawdzeń.`);
