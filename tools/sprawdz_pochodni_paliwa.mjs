// ------------------------------------------------------------
// WYPALAJĄCE SIĘ POCHODNIE I DESZCZ (1.35.0, docs/drewno.md)
//
// - etapy pochodni jako bloki: płonie, przygasa, ogarek,
// - paliwo na stosie pochodni (pole fresh), łuczywo, ogarek, przepisy,
// - game/TorchBurn.js: ubywanie paliwa, etapy, dolewanie, deszcz,
//   rozbiórka, dalekie pochodnie, zapis, gość,
// - deszcz a ognisko: chłodzi, słabe gasi (CampfireState, Campfires),
// - komenda, osiągnięcia, poradnik, podłączenie do gry.
//
// Uruchomienie: node tools/sprawdz_pochodni_paliwa.mjs
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
        if (url.endsWith('/src/rendering/CampfireRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class CampfireRenderer { constructor() {} update() {} dispose() {} }'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const R = await import('../src/blocks/BlockRegistry.js');
const T = await import('../src/blocks/torches.js');
const { TORCH_VARIANTS, TORCH_BLOCKS, TORCH_ATTACHMENTS, torchType, torchStageType, torchStage, getTorchInfo, isTorchId, TORCH_DIM_LIGHT } = T;
const F = await import('../src/items/torchFuel.js');
const { TORCH_BURN_SECONDS, TORCH_DIM_PART, LUCZYWO, LUCZYWO_PART, TORCH_STUB, TORCH_REFILLS, isTorchItem, fuelOf, fuelBar, fuelNotes, fuelMinutes } = F;
const B = await import('../src/game/TorchBurn.js');
const { TorchBurn, newTorch, restoreTorch, stageFor, torchSign, RAIN_OUT_SECONDS, RAIN_MIN, TORCH_STEP_SECONDS } = B;
const { makeItem, sameBatch, blend, freshBar, hasFresh } = await import('../src/items/freshness.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { itemExists, getItemLabel, getPlacedBlock } = await import('../src/items/ItemRegistry.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { gridResult, findRecipe, craftAll, fillGrid } = await import('../src/crafting/Crafting.js');
const { dyeTorch } = await import('../src/game/TorchInteraction.js');
const { blockHeat, TORCH_HEAT } = await import('../src/game/Warmth.js');
const S = await import('../src/game/CampfireState.js');
const { newCampfire, addFirewood, addTinder, updateCampfire, canIgnite, rainHeat, logHeat, tinderTemp, TINDERS,
    RAIN_COOL, RAIN_OUT_TEMP, RAIN_OUT_MIN, EMBER_MAX_SECONDS } = S;
const { Campfires } = await import('../src/game/Campfires.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { itemUses } = await import('../src/items/uses.js');

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, tolerance = 1e-6) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual}, miało być ${expected})`);


// --- Etapy pochodni jako bloki --------------------------------------------------------------

{
    check(Object.keys(TORCH_BLOCKS).length === 175 && new Set(Object.values(TORCH_BLOCKS).map((block) => block.id)).size === 175, '85 płonących, 85 przygasających, 5 ogarków - numery bez powtórzeń');
    TORCH_VARIANTS.forEach((variant, colorIndex) => TORCH_ATTACHMENTS.forEach((attach, side) => {
        const lit = torchType(variant.key, attach), dim = torchStageType(variant.key, attach, 'dim');
        const id = R.getBlockId(dim), info = getTorchInfo(dim);
        check(id === 16000 + colorIndex * 5 + side, `${dim}: stabilny numer`);
        check(torchStageType(variant.key, attach, 'lit') === lit && torchStage(lit) === 'lit' && torchStage(dim) === 'dim' && torchStage(id) === 'dim', `${dim}: etapy po nazwie i numerze`);
        check(isTorchId(id) && info.colorKey === variant.key && info.attach === attach && info.standingType === variant.type, `${dim}: ta sama barwa i mocowanie`);
        check(R.getLightEmission(id) === TORCH_DIM_LIGHT && TORCH_DIM_LIGHT < R.getLightEmission(R.getBlockId(lit)), `${dim}: świeci słabiej`);
        check(!R.isSolidId(id) && !R.isOpaqueId(id) && !R.CREATIVE_BLOCKS.includes(dim) && R.getDropType(dim) === variant.type, `${dim}: nie ma jej w ekwipunku, łup to zwykła pochodnia`);
    }));
    TORCH_ATTACHMENTS.forEach((attach, side) => {
        const out = torchStageType('red', attach, 'out'), id = R.getBlockId(out);
        check(id === 16085 + side && out === (attach === 'down' ? 'torch_out' : `torch_out_${attach}`), `${out}: numer ogarka`);
        check(isTorchId(id) && torchStage(id) === 'out' && getTorchInfo(id).colorKey === 'plain' && getTorchInfo(id).attach === attach, `${out}: ogarek nie ma koloru`);
        check(R.getLightEmission(id) === 0 && !R.CREATIVE_BLOCKS.includes(out) && R.getDropType(out) === TORCH_STUB && R.getBlockDefinition(out).label === 'Ogarek pochodni', `${out}: nie świeci, łup to ogarek`);
    });
    check(!isTorchId(15999) && !isTorchId(16090) && torchStage('stone') === null && torchStageType('nic', 'down', 'dim') === null && torchStageType('plain', 'sufit', 'out') === null, 'Zwykłe bloki nie mają etapów');
    check(/\| 16000-16089 \|[^\n]*pochod/.test(read('docs/numery-blokow.md')), 'Numery w docs/numery-blokow.md');
    equal([blockHeat(R.getBlockId('torch')), blockHeat(R.getBlockId('torch_dim')), blockHeat(R.getBlockId('torch_out'))], [TORCH_HEAT, TORCH_HEAT / 2, 0], 'Ciepło: przygasająca grzeje o połowę słabiej, ogarek wcale');
}


// --- Paliwo na stosie, łuczywo, ogarek -------------------------------------------------------

{
    check(TORCH_BURN_SECONDS === 3600 && TORCH_DIM_PART === 0.2 && LUCZYWO_PART === 0.1 && fuelMinutes(1) === 60 && fuelMinutes(TORCH_DIM_PART) === 12 && fuelMinutes(LUCZYWO_PART) === 6, 'Pochodnia: godzina, ostatnie 12 minut przygasa; łuczywo: 6 minut');
    check(TORCH_VARIANTS.every((variant) => isTorchItem(variant.type) && hasFresh(variant.type)) && !isTorchItem('torch_north') && !isTorchItem('torch_dim') && !isTorchItem(LUCZYWO) && !isTorchItem(TORCH_STUB) && !isTorchItem('lamp'), 'Paliwo niosą pochodnie (17 barw), nie lampy');
    equal(makeItem('torch', 4), { type: 'torch', count: 4 }, 'Nowa pochodnia: stos bez pola');
    equal(makeItem('torch_red', 2, 0.4), { type: 'torch_red', count: 2, fresh: 0.4 }, 'Nadpalona pochodnia niesie paliwo');
    check(fuelOf(makeItem('torch', 1)) === 1 && fuelOf(makeItem('torch', 1, 0.4)) === 0.4 && fuelOf(makeItem('stone', 1)) === 1 && fuelOf(null) === 1, 'Paliwo stosu');
    check(sameBatch(makeItem('torch', 1), 'torch') && !sameBatch(makeItem('torch', 1), 'torch', 0.4) && sameBatch(makeItem('torch', 1, 0.4), 'torch', 0.45), 'Nowe i nadpalone pochodnie leżą osobno');
    equal(blend(makeItem('torch', 2, 0.4), 2, 1), { type: 'torch', count: 4, fresh: 0.7 }, 'Ręczne łączenie: średnie paliwo');
    check(fuelBar(makeItem('torch', 1)) === null && freshBar(makeItem('torch', 1), false) === null, 'Nowa pochodnia bez paska');
    const bar = freshBar(makeItem('torch', 1, 0.4), false);
    check(bar && bar.fresh === 0.4 && /^hsl\(/.test(bar.color) && fuelBar(makeItem('torch', 1, 0.01)).fresh >= 0.04, 'Nadpalona: pomarańczowy pasek paliwa (także w trybie twórczym)');
    equal(fuelNotes('torch', makeItem('torch', 1)), ['Pali się ok. 60 min, pod koniec przygasa'], 'Opis nowej pochodni');
    equal(fuelNotes('torch', makeItem('torch', 1, 0.25)), ['Nadpalona - paliwa na ok. 15 min'], 'Opis nadpalonej');
    equal(fuelNotes(LUCZYWO), ['Postawione świeci jak pochodnia przez ok. 6 min'], 'Opis łuczywa');
    equal(fuelNotes(TORCH_STUB), ['Z żywicą albo oliwkami - znów pochodnia'], 'Opis ogarka');
    equal(fuelNotes('stone'), [], 'Reszta bez opisu');

    check(itemExists(LUCZYWO) && getItemLabel(LUCZYWO) === 'Łuczywo' && itemExists(TORCH_STUB) && getItemLabel(TORCH_STUB) === 'Ogarek pochodni' && getPlacedBlock(LUCZYWO) === null && getPlacedBlock(TORCH_STUB) === null, 'Łuczywo i ogarek to przedmioty');
    check(TINDERS[LUCZYWO] === 1.5 && tinderTemp(LUCZYWO) === 350, 'Łuczywo: najlepsza podpałka, 350°');
    const oak = newCampfire(0, 60, 0); for (let i = 0; i < 6; i++) addFirewood(oak, 'oak');
    addTinder(oak, LUCZYWO);
    check(canIgnite(oak), 'Łuczywo zapala dąb bez patyków');
    const wetOak = newCampfire(0, 60, 0); for (let i = 0; i < 6; i++) addFirewood(wetOak, 'oak', 0.6);
    addTinder(wetOak, LUCZYWO);
    check(!canIgnite(wetOak), 'Świeżego dębu samo łuczywo nie zapali');
    check(itemUses(LUCZYWO).some((text) => text.startsWith('podpałka 350°')) && itemUses(LUCZYWO).includes('postawione świeci jak pochodnia przez kilka minut') && itemUses(TORCH_STUB).length > 0, 'Zastosowania łuczywa i ogarka');

    // Przepisy.
    const luczywo = RECIPES.find((recipe) => recipe.id === 'luczywo'), stub = RECIPES.find((recipe) => recipe.id === 'torch_from_stub');
    check(luczywo.result[0] === LUCZYWO && luczywo.result[1] === 4 && stub.result[0] === 'torch' && stub.result[1] === 1, 'Przepisy: łuczywo x4, pochodnia z ogarka');
    for (const wood of ['pine', 'mugo', 'spruce', 'larch', 'bristlecone']) {
        const bag = Inventory.load({}, 'adventure');
        for (let i = 0; i < bag.slots.length; i++) bag.set(i, null);
        bag.add(`${wood}_firewood`, 2); bag.add('axe', 1);
        check(fillGrid(bag, luczywo, 2) === 2 && craftAll(bag)[1] === 2 && bag.count(LUCZYWO) === 8 && bag.craft.some((item) => item?.type === 'axe'), `${wood}: z dwóch polan 8 łuczyw, siekiera zostaje`);
    }
    const plain = Inventory.load({}, 'adventure');
    plain.craft[0] = { type: 'oak_firewood', count: 1 }; plain.craft[1] = { type: 'axe', count: 1 };
    check(findRecipe(plain.craft) === null, 'Z dębu łuczywa nie będzie');
    for (const refill of TORCH_REFILLS) {
        const grid = Inventory.load({}, 'adventure');
        grid.craft[0] = { type: TORCH_STUB, count: 1 }; grid.craft[1] = { type: refill, count: 1 };
        const result = gridResult(grid.craft);
        check(result?.type === 'torch' && result.count === 1 && result.fresh === undefined && itemExists(refill), `Ogarek i ${refill}: nowa pochodnia`);
    }
    // Barwienie nie dolewa paliwa.
    const dye = Inventory.load({}, 'adventure');
    dye.craft[0] = makeItem('torch', 1, 0.3); dye.craft[1] = { type: 'dye_red', count: 1 };
    const dyed = gridResult(dye.craft);
    check(dyed?.type === 'torch_red' && dyed.fresh === 0.3, 'Zabarwiona nadpalona pochodnia ma tyle paliwa, ile miała');
    dye.craft[0] = makeItem('torch', 1);
    check(gridResult(dye.craft).fresh === undefined, 'Zabarwiona nowa pochodnia jest nowa');
}


// --- TorchBurn ------------------------------------------------------------------------------

const world = ({ sky = () => 15, loaded = () => true } = {}) => {
    const blocks = new Map();
    const key = (x, y, z) => `${x},${y},${z}`;
    return { blocks, writes: 0,
        getChunk: (cx, cz) => (loaded(cx, cz) ? {} : null), toChunkCoord: (v) => Math.floor(v / 16),
        getBlockId: (x, y, z) => blocks.get(key(x, y, z)) ?? 0,
        getBlock(x, y, z) { const id = this.getBlockId(x, y, z); return id ? R.getBlockTypeById(id) : null; },
        setBlock(x, y, z, type) { this.writes++; if (type) blocks.set(key(x, y, z), R.getBlockId(type)); else blocks.delete(key(x, y, z)); return true; },
        getLight: (x, y, z) => ({ sky: sky(x, y, z) }) };
};
const make = (options = {}) => {
    const notices = [], achieved = [];
    const inventory = Inventory.load({}, options.mode ?? 'adventure');
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    const game = { mode: options.mode ?? 'adventure', inventory, world: world(options), rainNow: options.rain ?? 0, player: { pos: { x: 0.5, y: 60, z: 0.5 } },
        net: options.client ? { isClient: true } : null,
        onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]), playBlockSound() {} };
    const burn = new TorchBurn(game, options.saved);
    const place = (x, type = 'torch', fuel = 1) => { game.world.setBlock(x, 60, 0, type); return burn.placed({ x, y: 60, z: 0 }, fuel, getTorchInfo(type).colorKey); };
    const at = (x) => game.world.getBlock(x, 60, 0);
    const hit = (x) => ({ hit: true, block: { x, y: 60, z: 0, type: at(x) } });
    return { game, burn, notices, achieved, inventory, place, at, hit };
};

{
    equal(newTorch(1, 60, 2), { x: 1, y: 60, z: 2, left: 3600, color: 'plain', out: false, rain: 0 }, 'Nowy wpis: pełne paliwo');
    check(newTorch(0, 60, 0, 99999, 'tęcza').left === 3600 && newTorch(0, 60, 0, -5).left === 0 && newTorch(0, 60, 0, 10, 'tęcza').color === 'plain', 'Wpis w granicach');
    equal([stageFor(newTorch(0, 0, 0, 3600)), stageFor(newTorch(0, 0, 0, 721)), stageFor(newTorch(0, 0, 0, 720)), stageFor(newTorch(0, 0, 0, 1)), stageFor(newTorch(0, 0, 0, 0))], ['lit', 'lit', 'dim', 'dim', 'out'], 'Etap z paliwa: ostatnie 20% przygasa');
    const rained = newTorch(0, 0, 0, 2000); rained.out = true;
    check(stageFor(rained) === 'out', 'Zgaszona przez deszcz - ogarek mimo paliwa');
    check(restoreTorch({ x: 1, y: 60, z: 2, left: 500, color: 'red', out: true }).out === true && restoreTorch({ x: 1, y: 60, z: 2, left: 0, out: true }).out === false && restoreTorch(null) === null && restoreTorch({ x: 0, y: -1, z: 0 }) === null, 'Wpis z zapisu: tylko poprawne wartości');
    check(torchSign(newTorch(0, 0, 0, 3600)) !== torchSign(newTorch(0, 0, 0, 3000)) && torchSign(newTorch(0, 0, 0, 3600)) === torchSign(newTorch(0, 0, 0, 3590)), 'Podpis: paliwo co 5%');

    // Postawiona pochodnia: płonie godzinę, przygasa, zostaje ogarek. Kolor wraca po dolaniu.
    const t = make();
    t.place(1, 'torch_red_north');
    t.burn.step(2000);
    check(t.at(1) === 'torch_red_north' && t.game.world.writes === 1, 'Po pół godzinie płonie dalej');
    t.burn.step(900);
    check(t.at(1) === 'torch_red_north_dim' && t.burn.get({ x: 1, y: 60, z: 0 }).left === 700, 'Ostatnie 12 minut: przygasa (ta sama barwa i mocowanie)');
    t.burn.step(699);
    check(t.at(1) === 'torch_red_north_dim', 'Jeszcze sekunda');
    t.burn.step(2);
    check(t.at(1) === 'torch_out_north' && t.burn.burnt === 1 && t.achieved.some(([name, data]) => name === 'torchOut' && data.rain === false), 'Paliwo się skończyło: ogarek');
    equal(t.burn.drops('torch_out_north', { x: 1, y: 60, z: 0 }), [{ type: TORCH_STUB, count: 1 }], 'Rozbity ogarek daje ogarek');
    // Opis i starter na ogarku bez paliwa.
    t.burn.interact(t.hit(1), null);
    check(/^Ogarek - dolej żywicy albo oliwek/.test(t.notices.at(-1)), 'Pusta ręka: co zrobić z ogarkiem');
    check(t.burn.interact(t.hit(1), 'fire_starter') === true && t.at(1) === 'torch_out_north', 'Starter nie rozpali ogarka bez paliwa');
    // Dolanie żywicy: znów płonie, w dawnym kolorze.
    t.inventory.set(0, makeItem('resin', 2)); t.inventory.selected = 0;
    check(t.burn.interact(t.hit(1), 'resin') === true && t.at(1) === 'torch_red_north' && t.inventory.count('resin') === 1 && t.burn.get({ x: 1, y: 60, z: 0 }).left === 3600, 'Żywica na ogarek: pochodnia płonie w dawnym kolorze');
    check(t.achieved.some(([name, data]) => name === 'torchRefilled' && data.stub === true) && /Dolano paliwa/.test(t.notices.at(-1)), 'Zdarzenie i napis');
    check(t.burn.interact(t.hit(1), 'resin') === true && t.inventory.count('resin') === 1 && /pełno paliwa/.test(t.notices.at(-1)), 'Do pełnej się nie dolewa');
    t.burn.step(3000);
    check(t.at(1) === 'torch_red_north_dim' && t.burn.interact(t.hit(1), 'olive_oliwki') === true && t.at(1) === 'torch_red_north', 'Oliwki dolewają paliwa przygasającej');
    t.burn.interact(t.hit(1), null);
    check(/^Pochodnia - paliwa na ok. 60 min$/.test(t.notices.at(-1)), 'Pusta ręka: na ile starczy');
    check(t.burn.interact(t.hit(1), 'stone') === false && t.burn.interact(t.hit(1), 'fire_starter') === false && t.burn.interact({ hit: true, block: { x: 9, y: 60, z: 9 } }, null) === false, 'Inne rzeczy i inne bloki - nie nasza sprawa');

    // Rozbiórka: reszta paliwa wraca ze stosem; postawiona z nadpalonego stosu pali się krócej.
    t.burn.step(1800);
    equal(t.burn.drops('torch_red_north', { x: 1, y: 60, z: 0 }), [{ type: 'torch_red', count: 1, fresh: 0.5 }], 'Zdjęta pochodnia ma resztę paliwa');
    equal(t.burn.drops('torch', { x: 50, y: 60, z: 0 }), [{ type: 'torch', count: 1 }], 'Pochodnia bez wpisu - nowa');
    equal(t.burn.drops('stone', { x: 1, y: 60, z: 0 }), [], 'To nie pochodnia');
    t.game.world.setBlock(2, 60, 0, 'torch');
    t.burn.placedItem({ x: 2, y: 60, z: 0 }, makeItem('torch', 3, 0.25));
    check(t.burn.get({ x: 2, y: 60, z: 0 }).left === 900, 'Postawiona z nadpalonego stosu: ćwierć paliwa');
    t.game.world.setBlock(3, 60, 0, 'torch');
    t.burn.placedItem({ x: 3, y: 60, z: 0 }, makeItem(LUCZYWO, 3));
    check(t.burn.get({ x: 3, y: 60, z: 0 }).left === 360, 'Łuczywo: sześć minut');
    t.burn.step(1);
    check(t.at(3) === 'torch_dim', 'Łuczywo od razu świeci słabiej (ma mniej niż 20% paliwa)');
    t.burn.step(360);
    check(t.at(3) === 'torch_out', 'i szybko gaśnie');
    // Blok zniknął - wpis też.
    t.game.world.setBlock(2, 60, 0, null);
    t.burn.step(1);
    check(t.burn.get({ x: 2, y: 60, z: 0 }) === undefined, 'Po usunięciu pochodni wpis znika');

    // Pochodnia bez wpisu (stary świat): pełna, gdy gra ją zobaczy.
    const old = make();
    old.game.world.setBlock(1, 60, 0, 'torch_blue');
    old.game.world.setBlock(2, 60, 0, 'torch_dim');
    old.game.world.setBlock(3, 60, 0, 'torch_out');
    equal([old.burn.ensure(1, 60, 0, getTorchInfo('torch_blue')).left, old.burn.ensure(2, 60, 0, getTorchInfo('torch_dim')).left, old.burn.ensure(3, 60, 0, getTorchInfo('torch_out')).left], [3600, 720, 0], 'Stara pochodnia dostaje pełne paliwo, przygasająca - końcówkę, ogarek - nic');
    check(old.burn.ensure(1, 60, 0, getTorchInfo('torch_blue')) === old.burn.get({ x: 1, y: 60, z: 0 }) && old.burn.torches.size === 3, 'Drugi raz nie tworzy wpisu');
    // Ktoś rozpalił ogarek (gość, komenda): wpis nadąża.
    old.game.world.setBlock(3, 60, 0, 'torch');
    old.burn.step(1);
    check(old.burn.get({ x: 3, y: 60, z: 0 }).left === 3599 && old.at(3) === 'torch', 'Płonący blok z pustym wpisem: pełne paliwo');

    // Zapis.
    const state = old.burn.getState();
    const again = new TorchBurn(old.game, state);
    equal(again.getState(), state, 'Zapis i odczyt');
    check(state.every((entry) => Object.keys(entry).every((key) => ['x', 'y', 'z', 'left', 'color', 'out'].includes(key))), 'W zapisie tylko potrzebne pola');
    check(new TorchBurn(old.game, [null, { x: 1 }, { x: 0, y: 60, z: 0, left: 'dużo' }]).torches.size === 1, 'Zły zapis: pominięty albo naprawiony');

    // Zegar: krok co sekundę; przespany czas.
    const clock = make();
    clock.place(1);
    clock.burn.update(0.4); clock.burn.update(0.4);
    check(clock.burn.get({ x: 1, y: 60, z: 0 }).left === 3600 && TORCH_STEP_SECONDS === 1, 'Przed sekundą nic');
    clock.burn.update(0.4);
    near(clock.burn.get({ x: 1, y: 60, z: 0 }).left, 3598.8, 'Po sekundzie ubywa');
    clock.burn.advance(3000);
    clock.burn.step(1);
    check(clock.at(1) === 'torch_dim', 'Przespany czas też spala paliwo');
}

// Deszcz gasi pochodnie pod gołym niebem.
{
    // (1.43.1) Dach to blok nad pochodnią, nie jasność nieba: nad drugą
    // pochodnią są deski, a światło nieba i tak wpada z boku (15).
    const t = make({ rain: 1 });
    t.place(1, 'torch_green'); t.place(2, 'torch');
    t.game.world.setBlock(2, 63, 0, 'oak_planks');
    t.burn.step(RAIN_OUT_SECONDS - 1);
    check(t.at(1) === 'torch_green' && t.notices.length === 0, 'Chwilę wytrzyma');
    t.burn.step(2);
    check(t.at(1) === 'torch_out' && t.at(2) === 'torch', 'Ulewa gasi pochodnię pod gołym niebem, pod dachem nie');
    equal(t.notices, ['Deszcz gasi pochodnie pod gołym niebem'], 'Napis dla gracza obok');
    check(t.achieved.some(([name, data]) => name === 'torchOut' && data.rain === true), 'Zdarzenie');
    const torch = t.burn.get({ x: 1, y: 60, z: 0 });
    check(torch.out === true && torch.left > 3500 && torch.color === 'green', 'Paliwo zostało, kolor zapamiętany');
    t.burn.step(600);
    check(torch.left > 3500, 'Zgaszona pochodnia nie traci paliwa');
    t.burn.interact(t.hit(1), null);
    check(/zgasił deszcz - rozpal ją starterem ognia/.test(t.notices.at(-1)), 'Pusta ręka: co zrobić');
    equal(t.burn.drops('torch_out', { x: 1, y: 60, z: 0 }).map((item) => [item.type, item.fresh > 0.97 || item.fresh === undefined]), [['torch_green', true]], 'Zdjęta zgaszona pochodnia wraca jako pochodnia w swoim kolorze');
    t.game.rainNow = 0;
    check(t.burn.interact(t.hit(1), 'fire_starter') === true && t.at(1) === 'torch_green' && torch.out === false && /znów płonie/.test(t.notices.at(-1)), 'Starter ognia rozpala ją w dawnym kolorze');

    // Mżawka nie gasi; słabszy deszcz gasi wolniej; przerwa w deszczu cofa licznik.
    const drizzle = make({ rain: RAIN_MIN - 0.01 });
    drizzle.place(1);
    drizzle.burn.step(600);
    check(drizzle.at(1) === 'torch', 'Mżawka nie gasi pochodni');
    const half = make({ rain: 0.5 });
    half.place(1);
    half.burn.step(RAIN_OUT_SECONDS * 1.5);
    check(half.at(1) === 'torch', 'Słabszy deszcz potrzebuje więcej czasu');
    half.burn.step(RAIN_OUT_SECONDS);
    check(half.at(1) === 'torch_out', 'ale w końcu gasi');
    const pause = make({ rain: 1 });
    pause.place(1);
    pause.burn.step(15); pause.game.rainNow = 0; pause.burn.step(30); pause.game.rainNow = 1; pause.burn.step(15);
    check(pause.at(1) === 'torch', 'Przerwa w deszczu: pochodnia przesycha');

    // Wiele pochodni gaśnie po kilka na krok; przespany deszcz się nie liczy.
    const many = make({ rain: 1 });
    for (let x = 1; x <= 10; x++) many.place(x);
    many.burn.step(RAIN_OUT_SECONDS + 1);
    const out = () => Array.from({ length: 10 }, (_, i) => many.at(i + 1)).filter((type) => type === 'torch_out').length;
    check(out() === 4, 'W jednym kroku gasną najwyżej cztery');
    many.burn.step(1); many.burn.step(1);
    check(out() === 10, 'Reszta w następnych');
    const asleep = make({ rain: 1 });
    asleep.place(1);
    asleep.burn.advance(600);
    asleep.game.rainNow = 0; asleep.burn.step(1);
    check(asleep.at(1) === 'torch', 'Przespany deszcz nie gasi pochodni');
}

// Dalekie pochodnie i gość.
{
    let near = true;
    const far = make({ loaded: () => near });
    far.place(1);
    near = false;
    far.burn.step(3000);
    check(far.at(1) === 'torch' && far.burn.get({ x: 1, y: 60, z: 0 }).left === 600 && far.game.world.writes === 1, 'Daleka pochodnia: paliwa ubywa, blok czeka');
    far.burn.step(1000);
    near = true;
    far.burn.step(1);
    check(far.at(1) === 'torch_out', 'Po wczytaniu terenu blok nadrabia');

    const guest = make({ client: true });
    guest.place(1);
    guest.burn.step(3000);
    check(guest.at(1) === 'torch' && guest.burn.get({ x: 1, y: 60, z: 0 }).left === 600, 'Gość liczy paliwo, bloki zmienia gospodarz');
}

// Barwienie: przygasająca zostaje przygasająca, ogarka się nie barwi.
{
    const t = make();
    t.place(1, 'torch_dim');
    t.inventory.set(0, makeItem('dye_red', 2)); t.inventory.selected = 0;
    check(dyeTorch(t.game, t.hit(1), 'dye_red') === true && t.at(1) === 'torch_red_dim' && t.inventory.count('dye_red') === 1, 'Barwnik na przygasającą: zostaje przygasająca');
    t.game.world.setBlock(2, 60, 0, 'torch_out');
    check(dyeTorch(t.game, t.hit(2), 'dye_red') === false && t.at(2) === 'torch_out' && t.inventory.count('dye_red') === 1, 'Ogarka się nie barwi');
}


// --- Deszcz a ognisko -----------------------------------------------------------------------

{
    check(RAIN_COOL === 0.35 && RAIN_OUT_TEMP === 560 && RAIN_OUT_MIN === 0.3, 'Liczby deszczu');
    const fire = (wood, rain, wet = 0) => { const f = newCampfire(0, 60, 0); for (let i = 0; i < 6; i++) addFirewood(f, wood, wet); f.phase = 'burning'; f.temp = S.woodHeat(wood); f.rain = rain; return f; };
    near(rainHeat({ wood: 'oak' }, 1), 920 * 0.65, 'Dąb w ulewie: żar o 35% niższy');
    check(rainHeat({ wood: 'oak' }, 0) === 920 && rainHeat({ wood: 'oak' }, 9) === rainHeat({ wood: 'oak' }, 1), 'Bez deszczu bez zmian; natężenie w granicach');

    // Dąb przetrwa ulewę (chłodniejszy), lipa zgaśnie.
    const oak = fire('oak', 1);
    updateCampfire(oak, 90);
    check(oak.phase === 'burning' && Math.abs(oak.temp - 598) < 3 && !oak.doused, `Dąb w ulewie pali się dalej, chłodniejszy (${oak.temp.toFixed(0)}°)`);
    const linden = fire('linden', 1);
    for (let i = 0; i < 110; i++) updateCampfire(linden, 0.1);
    check(linden.phase === 'burning', 'Lipa jeszcze chwilę wytrzyma');
    for (let i = 0; i < 20; i++) updateCampfire(linden, 0.1);
    check(linden.phase === 'unlit' && linden.doused === true && linden.logs.length === 6 && linden.logs.at(-1).burn > 0.2 && linden.temp === 0 && linden.embers <= 15, 'Potem deszcz ją gasi: stos zostaje, wierzchnie polano nadpalone');
    check(S.catchesFromEmbers(linden) === false && !canIgnite(linden), 'Zgaszone ognisko samo się nie rozpali');
    // Jeden długi krok daje to samo.
    const skip = fire('linden', 1);
    updateCampfire(skip, 60);
    check(skip.phase === 'unlit' && Math.abs(skip.logs.at(-1).burn - linden.logs.at(-1).burn) < 0.12, 'Długi krok: też zgaszone');

    // Kto przetrwa ulewę: gorące, twarde drewno.
    const survives = (wood, rain, wet = 0) => { const f = fire(wood, rain, wet); updateCampfire(f, 40); return f.phase === 'burning'; };
    check(['oak', 'beech', 'maple', 'acacia', 'olive', 'mangrove'].every((wood) => survives(wood, 1)), 'Ulewę przetrwa dąb, buk, klon, akacja, oliwka, namorzyn');
    check(['spruce', 'pine', 'linden', 'wierzba', 'kapok', 'birch'].every((wood) => !survives(wood, 1)), 'Świerk, sosna, lipa, wierzba, puchowiec i brzoza w ulewie gasną');
    check(survives('pine', 0.5) && survives('birch', 0.5) && !survives('linden', 0.5) && !survives('kapok', 0.3) && survives('linden', 0.29), 'Zwykły deszcz gasi tylko najsłabsze, mżawka żadnego');
    check(!survives('oak', 1, 0.6), 'Mokry dąb w ulewie też zgaśnie');
    // Przerwa w deszczu: ogień przesycha.
    const gap = fire('linden', 1);
    for (let i = 0; i < 80; i++) updateCampfire(gap, 0.1);
    gap.rain = 0;
    for (let i = 0; i < 100; i++) updateCampfire(gap, 0.1);
    gap.rain = 1;
    for (let i = 0; i < 80; i++) updateCampfire(gap, 0.1);
    check(gap.phase === 'burning', 'Przelotny deszcz: ogień zdąży przeschnąć');

    // Żar w deszczu gaśnie pięć razy szybciej.
    const embers = S.restoreCampfire({ x: 0, y: 60, z: 0, ash: true, embers: 300 });
    embers.rain = 1; updateCampfire(embers, 10);
    near(embers.embers, 250, 'Żar w ulewie');
    const dry = S.restoreCampfire({ x: 0, y: 60, z: 0, ash: true, embers: 300 });
    updateCampfire(dry, 10);
    near(dry.embers, 290, 'Żar pod dachem');
    check(EMBER_MAX_SECONDS === 600, 'Żaru najwyżej na 10 minut');
}

// Prawdziwe Campfires: deszcz tylko pod gołym niebem, napis, zdarzenie, przespany czas.
{
    const campfire = R.getBlockId('campfire');
    // (1.43.1) Dach to blok nad ogniskiem (roof), nie jasność nieba (sky).
    const planks = R.getBlockId('oak_planks');
    const setup = ({ rain = 1, sky = 15, roof = false } = {}) => {
        const notices = [], sounds = [], achieved = [];
        const inventory = Inventory.load({}, 'adventure');
        const game = { mode: 'adventure', inventory, rainNow: rain, sounds: { play: (name) => sounds.push(name) }, swingArm() {},
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]), playBlockSound() {},
            player: { pos: { x: 2, y: 60, z: 2 } }, currentHit: null,
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getLight: () => ({ sky }),
                getBlockId: (x, y) => (y === 60 ? campfire : roof && y === 63 ? planks : 0) },
            get selectedBlock() { return null; } };
        const fires = new Campfires(game, []);
        const fire = newCampfire(0, 60, 0); for (let i = 0; i < 6; i++) addFirewood(fire, 'linden');
        fire.phase = 'burning'; fire.temp = 650;
        fires.fires.set('0,60,0', fire);
        const run = (seconds) => { for (let t = 0; t < seconds; t += 0.1) fires.update(0.1, false); };
        return { game, fires, fire, notices, sounds, achieved, run };
    };
    const open = setup();
    open.run(5);
    check(open.fire.rain === 1 && /pada na nie deszcz/.test(open.fires.description(open.fire)), 'Pod gołym niebem pada na ognisko (widać w opisie)');
    open.run(12);
    check(open.fire.phase === 'unlit' && open.notices.includes('Deszcz zgasił ognisko') && open.sounds.includes('sizzle') && open.fire.doused === undefined, 'Deszcz zgasił ognisko: napis i syk');
    equal(open.achieved.filter(([name]) => name === 'fireDoused'), [['fireDoused', { wood: 'linden' }]], 'Zdarzenie dla osiągnięć');
    const roofed = setup({ roof: true });
    roofed.run(30);
    check(roofed.fire.phase === 'burning' && roofed.fire.rain === 0 && roofed.notices.length === 0, 'Pod dachem deszcz ognisku nie szkodzi');
    // Do 1.43.0 decydowała jasność nieba: pod wąskim daszkiem (światło
    // z boku) ognisko gasło, a w ciemnym kącie bez dachu - nie.
    const eaves = setup({ roof: true, sky: 14 });
    eaves.run(30);
    check(eaves.fire.phase === 'burning' && eaves.fire.rain === 0, 'Pod wąskim daszkiem (jasne niebo z boku) ognisko płonie');
    const dark = setup({ sky: 4 });
    dark.run(5);
    check(dark.fire.rain === 1, 'Bez dachu pada, choćby niebo było ciemne');
    const fair = setup({ rain: 0 });
    fair.run(30);
    check(fair.fire.phase === 'burning' && fair.fire.rain === 0, 'Bez deszczu bez zmian');
    const asleep = setup();
    asleep.run(2);
    asleep.fires.advance(100);
    check(asleep.fire.phase === 'burning' && asleep.fire.rain === 0 && asleep.fire.logs.length === 4, 'Przespany czas: deszcz się nie liczy, ognisko dopala się jak zwykle');
}


// --- Podłączenie do gry, komenda, osiągnięcia, poradnik ---------------------------------------

{
    const game = read('src/game/Game.js'), saver = read('src/storage/WorldSaver.js'), sync = read('src/net/StateSync.js'), interaction = read('src/game/GameInteraction.js'), renderer = read('src/rendering/TorchRenderer.js');
    check(/this\.torchBurn = new TorchBurn\(this, worldInfo\.torchBurn\);\s+this\.torches = new TorchRenderer/.test(game) && /this\.torchBurn\.update\(dt\)/.test(game) && /this\.torchBurn\.advance\(seconds\)/.test(game) && /this\.saver\.torchBurn = this\.torchBurn/.test(game) && /this\.torchBurn\.dispose\(\)/.test(game), 'Gra: paliwo pochodni liczone, zapisywane, nadrabiane przy śnie');
    check(/this\.worldInfo\.torchBurn = this\.torchBurn\.getState\(\)/.test(saver) && /savedTorchVersion !== \(this\.torchBurn\.version/.test(saver), 'Zapis świata');
    check(/torches: \{[\s\S]*?restore: restoreTorch,[\s\S]*?sign: torchSign/.test(sync), 'Gra ze znajomymi');
    check(/this\.torchBurn\?\.interact\(this\.currentHit, this\.selectedBlock\) \|\| dyeTorch/.test(interaction) && /this\.torchBurn\?\.placedItem\(target, this\.inventory\.selectedItem, torch\.colorKey\)/.test(interaction) &&
        /getBlockDefinition\(type\)\?\.torch\) return this\.torchBurn\.drops\(type, position\)/.test(interaction) && /type === LUCZYWO \? 'torch'/.test(interaction), 'Stawianie, rozbiórka, dolewanie i łuczywo podłączone');
    check(/this\.game\.torchBurn\?\.ensure\(x, y, z, info\)/.test(renderer) && /own\.flame\.visible = false/.test(renderer) && /DIM_FLAME/.test(renderer) && /view\.stage !== 'out'/.test(renderer), 'Obraz: mniejszy płomień, ogarek bez płomienia, bez dymu');
    const screen = read('src/ui/InventoryScreen.js');
    check(/\.\.\.fuelNotes\(type, item\)/.test(screen), 'Ekwipunek: opis paliwa');

    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.torch_refilled?.on === 'torchRefilled' && byId.torch_refilled.when({ stub: true }) && !byId.torch_refilled.when({ stub: false }) && itemExists(byId.torch_refilled.icon), 'Osiągnięcie: ogarek dostał paliwo');
    check(byId.rain_doused?.on === 'fireDoused' && itemExists(byId.rain_doused.icon), 'Osiągnięcie: deszcz zgasił ognisko');
    const commands = read('src/commands/worldCommands.js'), commandsDoc = read('docs/komendy.md');
    check(/name: 'pochodnia'/.test(commands) && ['/pochodnia daj', '/pochodnia paliwo', '/pochodnia czas'].every((text) => commands.includes(text) && commandsDoc.includes(text)), 'Komenda /pochodnia w grze i w opisie');
    const chapter = GUIDE.find((entry) => entry.id === 'torches');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(/pali się godzinę, czyli trzy doby gry/.test(text) && /Lampy z lepidolitu nie gasną/.test(text) && /Deszcz gasi pochodnie pod gołym niebem/.test(text) && /Łuczywo/.test(text) && /350°/.test(text) && /słabe gasi/.test(text), 'Poradnik: pochodnie i deszcz');
    const docs = read('docs/pochodnie.md'), fires = read('docs/ogniska.md');
    check(/## Wypalanie \(1\.35\.0\)/.test(docs) && /ogarek/.test(docs) && /łuczywo/i.test(docs) && /## Deszcz a ognisko \(1\.35\.0\)/.test(fires), 'Opis w docs/pochodnie.md i docs/ogniska.md');
    const atlas = JSON.parse(read('assets/textures/atlas.json'));
    check(atlas.tiles.luczywo && atlas.tiles.torch_stub, 'Ikonki łuczywa i ogarka w atlasie');
}

console.log(`OK: wypalające się pochodnie i deszcz - ${checks} sprawdzeń (etapy bloków, paliwo stosu, łuczywo i ogarek, wypalanie, dolewanie, deszcz, dalekie pochodnie, ognisko w deszczu, podłączenie do gry).`);
