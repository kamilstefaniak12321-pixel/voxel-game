// ------------------------------------------------------------
// TWARDOŚĆ I ZUŻYCIE SIEKIER (1.39.0, docs/narzedzia.md)
//
// - twardość skał i tabela z projektu (docs/drewno.md, rozdział 5),
// - trzy zasady: półtora raza twardsze drewno, zużycie, dwa razy
//   miększe drewno nie zużywa,
// - stan w stosie (pole fresh), pasek, opis, łączenie stosów,
// - gra: cios w drzewo, za miękka siekiera, wykopany pień, kozły,
//   pęknięcie (zostaje patyk), tryb twórczy,
// - komenda, osiągnięcia, poradnik, dokumentacja.
//
// Uruchomienie: node tools/sprawdz_narzedzi.mjs
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
        if (url.endsWith('/src/rendering/FallingTreeRenderer.js')) return {
            format: 'module', shortCircuit: true,
            source: 'export class FallingTreeRenderer { constructor() { this.trees = new Map(); this.notches = new Map(); } add() {} setPose() {} remove() {} syncNotches() {} dispose() {} }'
        };
        if (url.endsWith('/src/rendering/ModelMaterial.js')) return {
            format: 'module', shortCircuit: true, source: 'export const createModelMaterial = (options) => ({ options, dispose() {} });'
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const W = await import('../src/items/toolWear.js');
const { ToolWear, NO_SAWHORSE_WEAR } = await import('../src/game/ToolWear.js');
const { Felling } = await import('../src/game/Felling.js');
const T = await import('../src/game/TreeScan.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { getBlockId, getBlockTypeById } = await import('../src/blocks/BlockRegistry.js');
const { buildTree } = await import('../src/world/trees/TreeShapes.js');
const { woodTraits, WOOD_TRAITS } = await import('../src/blocks/woodTraits.js');
const { hasFresh, freshBar, makeItem, withCount } = await import('../src/items/freshness.js');
const { STONE_TOOL_MATERIALS, stoneToolType } = await import('../src/items/stoneTools.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, eps = 1e-9) => check(Math.abs(actual - expected) < eps, `${message} (${actual} zamiast ${expected})`);

// ------------------------------------------------------------
// 1. Twardość skał - tabela z projektu
// ------------------------------------------------------------
equal(W.ROCK_HARDNESS, { sandstone: 2, limestone: 3, slate: 4, stone: 5, basalt: 6, granite: 7 }, 'twardość skał');
equal(Object.keys(W.ROCK_HARDNESS).sort(), STONE_TOOL_MATERIALS.map((material) => material.stone).sort(), 'każda skała narzędzi ma twardość');
equal(['sandstone', 'limestone', 'slate', 'stone', 'basalt', 'granite'].map((rock) => W.maxWoodHardness(W.ROCK_HARDNESS[rock])), [3, 4, 6, 7, 9, 10], 'tnie drewno do twardości: 3, 4, 6, 7, 9, 10');
equal([W.toolHardness('axe'), W.toolHardness('axe_granite'), W.toolHardness('axe_sandstone'), W.toolHardness('pickaxe_basalt'), W.toolHardness('stick'), W.toolHardness(null)], [5, 7, 2, 6, null, null], 'twardość narzędzia po nazwie');
for (const material of STONE_TOOL_MATERIALS) {
    const axe = stoneToolType('axe', material.stone);
    check(itemExists(axe) && W.isWearing(axe) && hasFresh(axe), `${axe}: siekiera się zużywa`);
    for (const tool of ['pickaxe', 'shovel', 'knife']) check(!W.isWearing(stoneToolType(tool, material.stone)) && !hasFresh(stoneToolType(tool, material.stone)), `${tool} z ${material.stone}: na razie bez zużycia`);
}
check(!W.isWearing('stick') && !W.isWearing(null) && !W.isWearing('oak_log'), 'inne rzeczy się nie zużywają');

// Zasada 1: kamienna bierze wszystko oprócz akacji, namorzynu i oliwki.
const tooHard = (axe) => Object.keys(WOOD_TRAITS).filter((wood) => !W.canCut(axe, WOOD_TRAITS[wood].hardness)).sort();
equal(tooHard('axe'), ['acacia', 'mangrove', 'olive'], 'kamienna: wszystko oprócz akacji, namorzynu i oliwki');
equal([tooHard('axe_basalt'), tooHard('axe_granite')], [[], []], 'bazaltowa i granitowa: wszystko');
check(tooHard('axe_sandstone').includes('birch') && tooHard('axe_sandstone').includes('oak') && !tooHard('axe_sandstone').includes('spruce') && !tooHard('axe_sandstone').includes('pine') && !tooHard('axe_sandstone').includes('linden'), 'piaskowcowa: tylko miękkie (świerk, sosna, lipa)');
check(W.canCut('stick', 99) && W.canCut(null, 99), 'to, co nie jest siekierą ze skały, nie ma ograniczenia');
equal([W.rocksFor(7), W.rocksFor(9), W.rocksFor(3), W.rocksFor(10)], ['kamienia, bazaltu albo granitu', 'bazaltu albo granitu', 'piaskowca, wapienia, łupka, kamienia, bazaltu albo granitu', 'granitu'], 'jakiej skały trzeba');
equal([W.rockWord('axe'), W.rockWord('axe_sandstone')], ['kamienia', 'piaskowca'], 'nazwa skały do komunikatu');

// Zasady 2 i 3: zużycie.
equal(W.chopsUntilBroken(5, 7), 23, 'kamienna na dębie: 23 ciosy');
check(Math.floor(W.chopsUntilBroken(5, 7) / T.chopsNeeded(7, 1)) === 2, 'kamienna siekiera wystarcza na dwa dęby');
check(Math.floor(W.chopsUntilBroken(5, 5) / T.chopsNeeded(5, 1)) === 6, 'albo na sześć brzóz');
equal([W.wearPerChop(5, 2), W.wearPerChop(7, 3), W.wearPerChop(4, 2), W.wearPerChop(6, 3)], [0, 0, 0, 0], 'dwa razy miększe drewno nie zużywa: kamienna na świerku, granitowa na sośnie');
check(W.wearPerChop(5, 3) > 0 && W.wearPerChop(7, 4) > 0, 'tuż powyżej granicy - już zużywa');
equal(W.chopsUntilBroken(5, 2), Infinity, 'bez zużycia: nieskończenie wiele ciosów');
for (const tool of [2, 3, 4, 5, 6, 7]) {
    let last = 0;
    for (let wood = 1; wood <= 10; wood++) {
        const wear = W.wearPerChop(tool, wood);
        check(wear >= last && wear < 1, `skała ${tool}, drewno ${wood}: twardsze drewno zużywa bardziej (${wear.toFixed(4)})`);
        last = wear;
    }
}
for (const wood of [3, 5, 7, 9]) check(W.wearPerChop(2, wood) > W.wearPerChop(5, wood) && W.wearPerChop(5, wood) >= W.wearPerChop(7, wood), `drewno ${wood}: twardsza skała zużywa się wolniej`);
check(W.wearPerChop(0, 5) === 0 && W.wearPerChop(null, 5) === 0, 'bez twardości - bez zużycia');

// ------------------------------------------------------------
// 2. Stan w stosie
// ------------------------------------------------------------
equal(makeItem('axe', 1), { type: 'axe', count: 1 }, 'nowa siekiera nie ma pola stanu (stare zapisy bez zmian)');
equal(makeItem('axe', 1, 0.4), { type: 'axe', count: 1, fresh: 0.4 }, 'zużyta niesie stan');
equal(withCount(makeItem('axe_granite', 2, 0.4), 1), { type: 'axe_granite', count: 1, fresh: 0.4 }, 'dzielenie stosu zachowuje stan');
equal([W.conditionOf({ type: 'axe', count: 1 }), W.conditionOf({ type: 'axe', count: 1, fresh: 0.3 }), W.conditionOf({ type: 'stick', count: 1, fresh: 0.3 }), W.conditionOf(null)], [1, 0.3, 1, 1], 'stan stosu');
equal([W.wearStage(1), W.wearStage(0.5), W.wearStage(0.49), W.wearStage(0.2), W.wearStage(0.19), W.wearStage(0)], ['whole', 'whole', 'chipped', 'chipped', 'cracked', 'cracked'], 'cała, wyszczerbiona, pęknięta');
check(W.wearBar({ type: 'axe', count: 1 }) === null && freshBar({ type: 'axe', count: 1 }) === null, 'nowa siekiera: bez paska');
const bars = [0.8, 0.4, 0.1].map((fresh) => freshBar({ type: 'axe', count: 1, fresh }));
check(bars.every((bar, index) => bar && Math.abs(bar.fresh - [0.8, 0.4, 0.1][index]) < 1e-9) && new Set(bars.map((bar) => bar.color)).size === 3, 'pasek pod ikonką: trzy kolory na trzy stany');
check(freshBar({ type: 'axe', count: 1, fresh: 0.4 }, false) !== null, 'pasek widać także, gdy jedzenie się nie psuje');
check(W.wearNotes('axe')[0].includes('Twardość 5') && W.wearNotes('axe')[0].includes('do twardości 7') && W.wearNotes('axe')[1] === 'Stan: nowa', 'opis nowej siekiery');
check(W.wearNotes('axe', { type: 'axe', count: 1, fresh: 0.37 })[1] === 'Stan: 37% - wyszczerbiona' && W.wearNotes('stick').length === 0, 'opis zużytej; patyk bez opisu');
{
    const inventory = Inventory.load({}, 'adventure');
    inventory.addItem(makeItem('axe', 1, 0.3));
    inventory.addItem(makeItem('axe', 1));
    equal(inventory.slots.filter((item) => item?.type === 'axe').length, 2, 'zużyta i nowa siekiera nie łączą się same w jeden stos');
}

// ------------------------------------------------------------
// 3. Gra: ToolWear
// ------------------------------------------------------------
const GROUND = 10, BASE = 11;
function makeWorld() {
    const blocks = new Map();
    const world = {
        blocks,
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? (y <= GROUND ? getBlockId('dirt') : 0),
        getBlock: (x, y, z) => getBlockTypeById(world.getBlockId(x, y, z)),
        setBlock(x, y, z, type) { const id = getBlockId(type); if (!(id > 0) || world.getBlockId(x, y, z) === id) return false; blocks.set(`${x},${y},${z}`, id); return true; },
        clearBlock(x, y, z) { blocks.set(`${x},${y},${z}`, 0); return true; },
        getLight: () => ({ sky: 15, red: 0, green: 0, blue: 0 })
    };
    return world;
}
function plant(world, species, x = 0, z = 0, size = 0.2) {
    for (const [dx, dy, dz, type] of buildTree(species, 7, size).blocks) if (world.getBlockId(x + dx, BASE + dy, z + dz) === 0) world.setBlock(x + dx, BASE + dy, z + dz, type);
}
function makeGame(world, axe = 'axe', mode = 'adventure') {
    const inventory = Inventory.load({}, 'adventure');
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    inventory.set(0, makeItem(axe, 1));
    inventory.selected = 0;
    const game = {
        world, mode, inventory, notices: [], events: [], spawned: [],
        get selectedBlock() { return inventory.selectedItem?.type ?? null; },
        player: { pos: { x: -1.5, y: BASE, z: 0.5 }, yaw: -Math.PI / 2, crouching: false },
        wellbeing: { effects: { work: 1 }, spend() {} }, sounds: { play() {} }, debris: { chips() {}, burst() {} },
        drops: { spawn: (type, count) => game.spawned.push([type, count]) }, blackout: { start() {} },
        swingArm() {}, playBlockSound() {}, onNotice: (text) => game.notices.push(text), achieve: (name, data) => game.events.push([name, data]),
        time: { days: 100 }, sky: { lightingLook: 'natural' }, scene: { add() {} }
    };
    game.toolWear = new ToolWear(game);
    game.felling = new Felling(game);
    game.felling.removeBudgetMs = Infinity;
    return game;
}
const hitOf = (world, x, y, z) => ({ hit: true, block: { x, y, z, type: world.getBlock(x, y, z) }, normal: { x: -1, y: 0, z: 0 } });
const chopUntilFall = (game, hit) => { let n = 0; while (game.felling.falls.length === 0 && n < 80) { game.felling.cooldown = 0; if (!game.felling.chop(hit, true, false)) break; n++; } game.felling.finishAll(); return n; };

{
    // Kamienna siekiera: świerk bez śladu, dąb zużywa, trzeci dąb ją łamie.
    const world = makeWorld();
    plant(world, 'spruce', 0, 0);
    const game = makeGame(world);
    equal(chopUntilFall(game, hitOf(world, 0, BASE + 1, 0)), 3, 'świerk: 3 ciosy');
    equal(game.inventory.slots[0], { type: 'axe', count: 1 }, 'kamienna siekiera po świerku: bez śladu');
    let felled = 0;
    for (let i = 0; i < 3 && game.inventory.slots[0]?.type === 'axe'; i++) {
        plant(world, 'oak', 30 + i * 30, 0);
        const before = W.conditionOf(game.inventory.slots[0]);
        const chops = chopUntilFall(game, hitOf(world, 30 + i * 30, BASE + 1, 0));
        if (game.events.filter(([name]) => name === 'treeFelled').length === 2 + i) {
            felled++;
            near(before - W.conditionOf(game.inventory.slots[0]), chops * W.wearPerChop(5, 7), `dąb ${i + 1}: ${chops} ciosów zużycia`, 1e-6);
        }
    }
    equal(felled, 2, 'kamienna siekiera: dwa dęby');
    check(game.notices.some((text) => /wyszczerbiła/.test(text)) && game.notices.some((text) => /pęka/.test(text)), 'gra mówi, gdy siekiera się wyszczerbi i gdy pęka');
    check(game.events.some(([name, data]) => name === 'toolWorn' && data.stage === 'chipped'), 'zdarzenie zużycia');
    equal(game.inventory.slots.filter(Boolean).map((item) => [item.type, item.count]), [['stick', 1]], 'na trzecim dębie siekiera pękła: został patyk');
    check(game.notices.at(-1) === 'Siekiera pękła - w ręce został patyk.' && game.events.some(([name]) => name === 'toolBroke'), 'komunikat i zdarzenie pęknięcia');
    check(!game.felling.chop(hitOf(world, 90, BASE + 1, 0), true, false), 'patykiem drzewa się nie zetnie (zwykłe kopanie odmówi)');
}
{
    // Za miękka siekiera: nic się nie dzieje, gra mówi, czego trzeba.
    const world = makeWorld();
    plant(world, 'oak', 0, 0);
    const game = makeGame(world, 'axe_sandstone');
    check(game.felling.chop(hitOf(world, 0, BASE + 1, 0), true, false) && game.felling.notches.size === 0, 'piaskowcowa na dębie: cios nie wchodzi');
    check(/z piaskowca jest za miękka/.test(game.notices[0]) && /twardość 7/.test(game.notices[0]) && /do twardości 3/.test(game.notices[0]) && /kamienia, bazaltu albo granitu/.test(game.notices[0]), `podpowiedź: ${game.notices[0]}`);
    equal(game.inventory.slots[0], { type: 'axe_sandstone', count: 1 }, 'siekiera nietknięta');
    game.felling.chop(hitOf(world, 0, BASE + 1, 0), false, true);
    equal(game.notices.length, 1, 'trzymany przycisk nie powtarza podpowiedzi');
    plant(world, 'spruce', 30, 0);
    equal(chopUntilFall(game, hitOf(world, 30, BASE + 1, 0)), 3, 'piaskowcowa na świerku: tnie');
    near(W.conditionOf(game.inventory.slots[0]), 1 - 3 * W.wearPerChop(2, 2), 'i zużywa się (świerk nie jest dwa razy miększy od piaskowca)', 1e-6);
    const olive = makeWorld();
    plant(olive, 'olive', 0, 0);
    const stone = makeGame(olive, 'axe');
    stone.felling.chop(hitOf(olive, 0, BASE + 1, 0), true, false);
    check(/bazaltu albo granitu/.test(stone.notices[0]) && stone.felling.notches.size === 0, 'kamienna na oliwce: potrzeba bazaltu albo granitu');
    const granite = makeGame(olive, 'axe_granite');
    check(chopUntilFall(granite, hitOf(olive, 0, BASE + 1, 0)) > 0 && granite.events.some(([name, data]) => name === 'treeFelled' && data.hardness === 9), 'granitowa ścina oliwkę');
    const creative = makeGame(makeWorld(), 'axe_sandstone', 'creative');
    check(creative.toolWear.cutCheck('oak') === null && creative.toolWear.forChop('oak') === 0 && creative.toolWear.apply(0.5) === null, 'tryb twórczy: bez twardości i zużycia');
}
{
    // Wykopany pień: zużycie jak cios; leżący bez kozłów - dwa razy większe.
    const world = makeWorld();
    for (let x = 0; x <= 3; x++) world.setBlock(x, BASE, 0, 'oak_log_x');
    world.setBlock(9, BASE, 9, 'oak_log');
    const game = makeGame(world);
    const wear = W.wearPerChop(5, 7);
    near(game.toolWear.forBlock('oak_log', { x: 9, y: BASE, z: 9 }, 'axe'), wear, 'stojący pień: jeden cios');
    near(game.toolWear.forBlock('oak_log_x', { x: 1, y: BASE, z: 0 }, 'axe'), wear * NO_SAWHORSE_WEAR, 'leżący pień na ziemi: dwa razy szybciej (siekiera bije w ziemię)');
    world.setBlock(-1, BASE, 0, 'sawhorse_z'); world.setBlock(4, BASE, 0, 'sawhorse_z');
    near(game.toolWear.forBlock('oak_log_x', { x: 1, y: BASE, z: 0 }, 'axe'), wear, 'leżący pień na kozłach: zwykłe zużycie');
    equal([game.toolWear.forBlock('oak_planks', { x: 0, y: 0, z: 0 }, 'axe'), game.toolWear.forBlock('stone', { x: 0, y: 0, z: 0 }, 'axe'), game.toolWear.forBlock('rotten_log_x', { x: 0, y: 0, z: 0 }, 'axe'), game.toolWear.forBlock('oak_log', { x: 9, y: BASE, z: 9 }, 'pickaxe'), game.toolWear.forBlock('spruce_log', { x: 0, y: 0, z: 0 }, 'axe')],
        [0, 0, 0, 0, 0], 'deski, skała, próchno, inne narzędzie, miękkie drewno: bez zużycia');
    equal(NO_SAWHORSE_WEAR, 2, 'bez kozłów: dwa razy');
    // Stos dwóch siekier zużywa się wspólnie; pęknięcie zabiera jedną.
    game.inventory.set(0, makeItem('axe', 2));
    game.toolWear.apply(0.4);
    near(W.conditionOf(game.inventory.slots[0]), 0.8, 'stos dwóch siekier: zużycie dzieli się na dwie');
    equal(game.toolWear.apply(5), 'broke', 'duże zużycie: jedna pęka');
    equal(game.inventory.slots[0], { type: 'axe', count: 1 }, 'druga ze stosu jest nowa');
    check(game.inventory.slots.some((item) => item?.type === 'stick'), 'patyk w ekwipunku');
    game.inventory.selected = 1;
    equal(game.toolWear.apply(0.5), null, 'bez siekiery w ręce nic się nie zużywa');
    const interaction = read('src/game/GameInteraction.js');
    check(interaction.includes('this.toolWear?.forBlock(type, hit.block, tool)') && interaction.includes('this.toolWear.apply(toolWear)'), 'kopanie liczy i zabiera zużycie');
}

// ------------------------------------------------------------
// 4. Reszta gry
// ------------------------------------------------------------
const byId = (id) => ACHIEVEMENTS.find((achievement) => achievement.id === id);
check(byId('axe_broke') && byId('hard_wood_felled').when({ hardness: 8 }) && !byId('hard_wood_felled').when({ hardness: 7 }), 'osiągnięcia: pęknięta siekiera, najtwardsze drewno');
check(Object.keys(WOOD_TRAITS).filter((wood) => woodTraits(wood).hardness >= 8).sort().join() === 'acacia,mangrove,olive', 'najtwardsze drewno: akacja, namorzyn, oliwka');
const chapter = GUIDE.find((entry) => entry.id === 'felling');
check(chapter.lines.some((line) => /granit 7/.test(line.text ?? line)) && chapter.lines.some((line) => /zużywa/.test(line.text ?? line)) && chapter.lines.length <= 19, 'poradnik: twardość skał i zużycie');
check(read('src/game/Game.js').includes('new ToolWear(this)') && read('src/ui/InventoryScreen.js').includes('wearNotes(type, item)'), 'Game tworzy zużycie; ekwipunek pokazuje opis');
check(read('src/commands/worldCommands.js').includes("name: 'siekiera'") && read('docs/komendy.md').includes('/siekiera'), 'komenda /siekiera i jej opis');
const docs = read('docs/narzedzia.md');
check(docs.includes('1.39.0') && docs.includes('Luki') && docs.includes('półtora raza'), 'dokumentacja: docs/narzedzia.md');
check(JSON.parse(read('package.json')).scripts.test.includes('sprawdz_narzedzi.mjs'), 'test w npm test');

console.log(`OK: twardość i zużycie siekier - ${checks} sprawdzeń.`);
