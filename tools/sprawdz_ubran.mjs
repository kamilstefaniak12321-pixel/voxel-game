// ------------------------------------------------------------
// SPRAWDZENIE WŁÓKIEN I UBRAŃ (1.27.0)
//
// - moczenie w wodzie (leżące przedmioty), włókna, sznur, stół krawiecki
//   (dwa bloki jak stół stolarski, przepis, tekstury),
// - płótna, kroje, wzory, kolory,
// - stół w świecie (SewingTables): materiał na blat, tkanie, wykroje,
//   zmiana kroju i wzoru, barwienie płótna i gotowego ubrania, zapis,
//   rozbijanie, gra ze znajomymi,
// - stosy z wyglądem: ubrania się nie układają, wygląd przeżywa
//   kopiowanie, zapis, skrzynię i wyrzucenie,
// - noszenie: miejsca, zapis, ciepło, kod dla innych graczy,
// - ubrania na skórce (player/clothes.js) i ikonki barwionych ubrań,
// - stare krzaki owocowe nie rosną już w nowych światach,
// - opisy, osiągnięcia, komenda, poradnik, dokumenty.
//
// Uruchomienie: node tools/sprawdz_ubran.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        // Modele na blatach (WebGL) - poza tym sprawdzeniem.
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer {}; export const TABLE_ROTATION = {};' };
        }
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: 'export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });' };
        }
        if (url.endsWith('/src/rendering/SewingTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class SewingTableRenderer {}' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.Image = class {};

const C = await import('../src/items/clothing.js');
const F = await import('../src/items/freshness.js');
const R = await import('../src/blocks/BlockRegistry.js');
const { ITEM_TYPES, itemExists, getItemLabel } = await import('../src/items/ItemRegistry.js');
const { findRecipe } = await import('../src/crafting/Crafting.js');
const { Inventory, cleanItem, EQUIP_COUNT } = await import('../src/game/Inventory.js');
const CS = await import('../src/game/ChestState.js');
const { Drops, restoreDrop, dropState } = await import('../src/game/Drops.js');
const { paintClothes, BOXES, CUTS, SKIN } = await import('../src/player/clothes.js');
const { recolor, iconPattern, clothColors, clothPixels } = await import('../src/ui/garmentIcons.js');
const { SewingTables, sewingProducts, restoreSewingTable, sewingTableState, SEWING_CAPACITY } = await import('../src/game/SewingTables.js');
const { shapeInfo, shapeId } = await import('../src/blocks/woodShapes.js');
const { sewingTableId, SEWING_TABLE_BLOCKS } = await import('../src/blocks/sewingTable.js');
const { shapeBoxes } = await import('../src/world/ShapeBoxes.js');
const { stateSystems } = await import('../src/net/StateSync.js');
const P = await import('../src/net/protocol.js');
const { itemUses } = await import('../src/items/uses.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { BIOMES } = await import('../src/world/terrain/Biomes.js');
const { DYE_ITEMS } = await import('../src/items/dyes.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = textureManifest();


// --- Moczenie, włókna, sznur, stół ---------------------------------------------------

{
    check(C.retsInto('len_wiazka') === 'flax_retted' && C.retsInto('nettle') === 'nettle_retted' && C.retsInto('linden_bark') === 'bast' &&
        C.retsInto('oak_bark') === 'tannin' && C.retsInto('birch_bark') === null && C.retsInto(null) === null && C.retsInto('toString') === null, 'Co się moczy');
    for (const [from, into] of Object.entries(C.RETTING)) check(itemExists(from) && itemExists(into), `${from} -> ${into}: przedmioty istnieją`);
    check(C.RET_SECONDS >= 60 && C.RET_SECONDS <= 180, 'Moczenie trwa półtorej minuty');
    check(findRecipe(['flax_retted'])?.result.join() === 'flax_fiber,2' && findRecipe(['nettle_retted'])?.result.join() === 'nettle_fiber,1', 'Włókno z moczonego lnu i pokrzywy');
    check(findRecipe(['flax_fiber', 'nettle_fiber', 'bast'])?.result.join() === 'rope,1' && findRecipe(['bast', 'bast', 'bast'])?.result.join() === 'rope,1' &&
        findRecipe(['flax_fiber', 'flax_fiber'])?.result[0] !== 'rope', 'Trzy dowolne włókna - sznur');
    check(findRecipe(['oak_planks', 'oak_planks', 'rope', 'rope'])?.result.join() === 'sewing_table,1' && findRecipe(['oak_planks', 'oak_planks', 'stick', 'stick'])?.result[0] === 'oak_carpenter_table', 'Stół krawiecki: deski na sznurach (stolarski dalej na patykach)');
    check(findRecipe(['len_wiazka', 'len_wiazka', 'len_wiazka', 'len_wiazka'])?.result[0] === 'linen_bedding', 'Lniana pościel bez zmian');
    const table = R.getBlockDefinition('sewing_table');
    check(table.id === 15500 && table.model === 'shape' && table.solid && table.category === 'ozdoby' && manifest.tiles.sewing_table_top && manifest.tiles.sewing_table_top_b &&
        table.textures.side === 'birch_planks' && !manifest.tiles.sewing_table_side, 'Blok stołu krawieckiego: blat z miarką, boki z desek');
    const variants = Object.values(SEWING_TABLE_BLOCKS);
    check(variants.length === 8 && variants.every((block) => block.id >= 15500 && block.id <= 15507 && block.drops === 'sewing_table' && block.pick === 'sewing_table' &&
        shapeInfo(block.id)?.kind === 'sewing') && variants.filter((block) => block.inventory !== false).length === 1, 'Osiem odmian (4 kierunki x 2 części), w ekwipunku jedna');
    check(sewingTableId('north', 'a') === 15500 && sewingTableId('east', 'b') === 15500 + 1 * 2 + 1 && R.getBlockDefinition(R.getBlockTypeById(sewingTableId('west', 'b'))).textures.top === 'sewing_table_top_b', 'Numery i tekstury części');
    const { itemShapeFaces } = await import('../src/rendering/ShapeGeometry.js');
    const { SEWING_TOP_TURN } = await import('../src/blocks/sewingTable.js');
    const iconFaces = itemShapeFaces('sewing_table');
    check(iconFaces.filter((face) => face.texture === 'sewing_table_top').length === 1 && iconFaces.filter((face) => face.texture === 'sewing_table_top_b').length === 1 &&
        iconFaces.filter((face) => face.texture === 'birch_planks').length > 20, 'Ikonka i model w ręce: stół z blatem z miarką');
    check(new Set(Object.values(SEWING_TOP_TURN)).size === 4 && shapeInfo(sewingTableId('west', 'a')).topTurn === SEWING_TOP_TURN.west &&
        read('src/rendering/ChunkMesher.js').includes('info.topTurn'), 'Miarka zawsze przy przednim brzegu (obrót wierzchu)');
    for (const [facing, part] of [['south', 'a'], ['east', 'b']]) {
        check(JSON.stringify(shapeBoxes(sewingTableId(facing, part), 'render')) === JSON.stringify(shapeBoxes(shapeId('oak', 'table', { facing, part }), 'render')) &&
            shapeBoxes(sewingTableId(facing, part), 'render').length > 1, `Kształt jak stół stolarski (${facing}, ${part})`);
    }
    for (const type of Object.keys(C.CLOTHING_ITEMS)) check(itemExists(type) && manifest.tiles[ITEM_TYPES[type].icon] && ITEM_TYPES[type].category === 'narzedzia', `${type}: przedmiot z ikonką`);

    // Leżące w wodzie - moczą się; poza wodą - od nowa.
    const water = R.getBlockId('water');
    const world = { wet: true, isSolid: (x, y) => y < 5, getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId(x, y) { return this.wet && y === 5 ? water : 0; } };
    const achieved = [];
    const inventory = Inventory.load({}, 'adventure');
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, { type: 'stone', count: 64 });
    const drops = new Drops({ world, inventory, player: { pos: { x: 100, y: 5, z: 100 }, yaw: 0, pitch: 0 }, time: { days: 0.5 }, achieve: (name, data) => achieved.push([name, data]) });
    const flax = drops.spawn('len_wiazka', 5, { x: 0.5, y: 5, z: 0.5 }, null, 99);
    flax.rest = true;
    for (let t = 0; t < C.RET_SECONDS - 1; t += 0.5) drops.update(0.5);
    check(flax.type === 'len_wiazka' && flax.ret > 80, 'Jeszcze się moczy');
    world.wet = false;
    drops.update(0.5);
    check(flax.ret === 0, 'Wyjęty z wody - od nowa');
    world.wet = true;
    for (let t = 0; t <= C.RET_SECONDS + 1; t += 0.5) drops.update(0.5);
    check(flax.type === 'flax_retted' && flax.count === 5 && achieved.some(([name, data]) => name === 'retted' && data.type === 'flax_retted'), 'Po półtorej minuty w wodzie - moczony len (cały stos)');
    check(restoreDrop({ type: 'len_wiazka', count: 2, x: 0, y: 5, z: 0, ret: 40 }).ret === 40 && dropState({ ...flax, ret: 12 }).ret === 12, 'Postęp moczenia w zapisie');
}


// --- Płótna, kroje, szycie, barwienie --------------------------------------------------

{
    check(Object.keys(C.CLOTHS).join() === 'linen,nettle,bast' && C.CLOTHS.nettle.factor > C.CLOTHS.linen.factor, 'Trzy płótna; pokrzywowe grzeje lepiej');
    check(C.FIBERS_PER_CLOTH === 2 && C.clothFromFiber('flax_fiber') === 'linen' && C.clothFromFiber('nettle_fiber') === 'nettle' && C.clothFromFiber('bast') === 'bast' &&
        C.clothFromFiber('stone') === null && C.clothOf('bast_weave') === 'bast', 'Tkanie: dwa włókna - jedno płótno, zależnie od włókna');
    check(Object.keys(C.GARMENT_TYPES).length === 20 && C.kindsFor('bast').join() === 'vest,lapcie' && C.kindsFor('linen').length === 9, 'Kroje i z czego');
    for (const [type, info] of Object.entries(C.GARMENT_TYPES)) {
        check(C.SLOTS.includes(info.slot) && info.warmth > 0 && info.cost >= 1 && getItemLabel(type) === info.label && F.stackSize(type) === 1, `${type}: ${info.label}`);
        check(CUTS[info.kind]?.length > 0, `${type}: krój na skórce`);
    }
    check(getItemLabel('shirt_linen') === 'Koszula lniana' && getItemLabel('trousers_nettle') === 'Spodnie pokrzywowe' && getItemLabel('lapcie_bast') === 'Łapcie z łyka', 'Polskie nazwy');
    check(C.garmentInfo('tunic_nettle').warmth > C.garmentInfo('tunic_linen').warmth && C.garmentInfo('tunic_linen').warmth > C.garmentInfo('shirt_linen').warmth, 'Tunika grzeje bardziej niż koszula, pokrzywa bardziej niż len');

    // Wykroje na stole: po jednym miejscu na ciele, kroje w kółko.
    check(C.PRODUCT_SLOTS.join() === 'legs,feet,head,body' && C.kindsForSlot('linen', 'head').join() === 'cap,scarf,headband' && C.kindsForSlot('bast', 'feet').join() === 'lapcie' &&
        C.kindsForSlot('bast', 'legs').length === 0 && C.kindsForSlot('linen', 'body').join() === 'shirt,vest,tunic', 'Kroje na każde miejsce');
    check(C.nextOf(['a', 'b', 'c'], 'c') === 'a' && C.nextOf(['a', 'b'], 'x') === 'a' && C.nextOf([], 'a') === null && C.nextOf(C.PATTERN_ORDER, 'plain') === 'stripes', 'Następny krój / wzór w kółko');
    check(C.isTableMaterial('flax_fiber') && C.isTableMaterial('nettle_cloth') && C.isTableMaterial('vest_bast') && !C.isTableMaterial('dye_red') && !C.isTableMaterial('stone') && !C.isTableMaterial(null), 'Co można położyć na stole');

    check(JSON.stringify(C.cleanLook({ pattern: 'x', main: 'nope', accent: 'red' })) === '{"pattern":"plain","main":null,"accent":"red"}' && C.cleanLook(null).pattern === 'plain', 'Wygląd: poprawiany');
    const colors = C.lookColors('shirt_nettle', null);
    check(colors.main === C.CLOTHS.nettle.color && colors.accent === C.CLOTHS.nettle.shade && C.lookColors('shirt_linen', { main: 'red' }).accent !== DYE_ITEMS.dye_red.color, 'Naturalne kolory płótna; wzór bez barwnika - ciemniejszy kolor');
    check(C.lookText('shirt_linen', { pattern: 'stripes', main: 'red', accent: 'white' }) === 'kolor: czerwony, wzór: paski (biały)' && C.lookText('cap_linen', null) === 'kolor: niebarwiony, wzór: gładki', 'Opis wyglądu');
}


// --- Stół krawiecki w świecie (SewingTables) --------------------------------------------------

function sewingGame(mode = 'adventure') {
    const blocks = new Map();
    const world = {
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0,
        setBlock(x, y, z, type) { blocks.set(`${x},${y},${z}`, type ? R.getBlockId(type) : 0); return true; },
        getChunk: () => ({}),
        toChunkCoord: (v) => Math.floor(v / 16)
    };
    const notices = [], achieved = [];
    const inventory = Inventory.load({}, mode);
    const game = { world, inventory, mode, notices, achieved, onNotice: (text) => notices.push(text), playBlockSound() {},
        achieve: (name, data) => achieved.push([name, data]) };
    game.sewingTables = new SewingTables(game, []);
    return game;
}

{
    const game = sewingGame();
    const { sewingTables: tables, world, inventory, notices, achieved } = game;
    const free = { intersectsBlock: () => false };
    // Gracz patrzy na +z: przód stołu na północ, część B po prawej (-x).
    check(tables.place({ x: 0, y: 0, z: 0 }, Math.PI, free) === 'sewing_table' && shapeInfo(world.getBlockId(-1, 0, 0))?.part === 'b' &&
        shapeInfo(world.getBlockId(0, 0, 0))?.facing === 'north', 'Stawianie: dwie części, przodem do gracza');
    check(tables.place({ x: -1, y: 0, z: 0 }, Math.PI, free) === false && tables.place({ x: 5, y: 0, z: 0 }, Math.PI, { intersectsBlock: () => true }) === false, 'Zajęte miejsce albo gracz - nie stoi');
    const a = { x: 0, y: 0, z: 0 };
    const hitA = { hit: true, block: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 1, z: .5 } };
    // Ćwiartki części B (przód stołu na północ: lewa kolumna to większe x).
    const hitB = (index) => {
        const fx = index % 2 === 0 ? .75 : .25, fz = index < 2 ? .25 : .75;
        return { hit: true, block: { x: -1, y: 0, z: 0 }, normal: { x: 0, y: 1, z: 0 }, point: { x: -1 + fx, y: 1, z: fz } };
    };
    const hold = (slot, item) => { inventory.set(slot, item); inventory.selected = slot; return item?.type ?? null; };
    const table = () => tables.state(a);

    check(tables.interact(hitA, null) && /Połóż/.test(notices.at(-1)), 'Pusta ręka na pustym stole - podpowiedź');
    check(tables.interact(hitB(0), null) && /lewej/.test(notices.at(-1)), 'Część B bez materiału - podpowiedź');

    // Włókno -> płótno.
    let held = hold(0, { type: 'flax_fiber', count: 9 });
    check(tables.interact(hitA, held) && table().material.type === 'flax_fiber' && table().material.count === 1 && inventory.get(0).count === 8, 'PPM włóknem - jedno włókno na blat');
    check(/tkanie/.test(notices.at(-1)), 'Po położeniu - podpowiedź, co dalej');
    check(tables.interact(hitA, held, true) && table().material.count === 9 && !inventory.get(0), 'Z kucaniem - cały stos');
    check(!tables.canBreak(a) && !tables.canBreak({ x: -1, y: 0, z: 0 }), 'Z materiałem na blacie stołu nie da się rozbić');
    check(tables.interact(hitB(3), null) && inventory.count('linen_cloth') === 1 && table().material.count === 7, 'PPM w część B - jedno płótno z dwóch włókien');
    check(tables.interact(hitB(0), null, true) && inventory.count('linen_cloth') === 4 && table().material.count === 1, 'Z kucaniem - ile się da');
    check(tables.interact(hitB(0), null) && /potrzeba 2/.test(notices.at(-1)) && inventory.count('linen_cloth') === 4, 'Jedno włókno - za mało');
    check(achieved.filter(([name]) => name === 'woven').length === 2, 'Osiągnięcie za tkanie');
    check(tables.interact(hitA, null) && inventory.count('flax_fiber') === 1 && table().material === null && tables.canBreak(a), 'Pusta ręka - włókno wraca, stół do rozbicia');

    // Płótno: wykroje, kroje, wzór, barwniki.
    inventory.add('linen_cloth', 6);
    const clothSlot = inventory.slots.findIndex((item) => item?.type === 'linen_cloth');
    check(clothSlot < 9, 'Płótno na pasku');
    held = hold(clothSlot, inventory.get(clothSlot));
    tables.interact(hitA, held, true);
    check(table().material.type === 'linen_cloth' && table().material.count === 10 && inventory.count('linen_cloth') === 0, 'Płótno na blat (cały stos)');
    let products = sewingProducts(table());
    check(products.map((product) => product.kind).join() === 'trousers,boots,cap,shirt' && products.every((product) => product.enough && product.item.look.pattern === 'plain'), 'Cztery wykroje: spodnie, buty, czapka, koszula');
    check(tables.interact(hitB(3), null, true) && table().cuts.body === 'vest' && tables.interact(hitB(3), null, true) && table().cuts.body === 'tunic' && /tunika/.test(notices.at(-1)), 'Kucanie i PPM w wykrój - następny krój');
    check(tables.interact(hitB(2), null, true) && table().cuts.head === 'scarf', 'Krój czapki -> chusta');

    held = hold(2, { type: 'dye_red', count: 2 });
    check(tables.interact(hitA, held) && table().main === 'red' && inventory.get(2).count === 1 && /Kolor/.test(notices.at(-1)), 'Barwnik na płótno - kolor, jeden barwnik zużyty');
    check(tables.interact(hitA, held) && inventory.get(2).count === 1, 'Ten sam kolor drugi raz - barwnik zostaje');
    held = hold(3, { type: 'dye_white', count: 1 });
    check(tables.interact(hitA, held, true) && table().accent === 'white' && table().pattern === 'stripes' && !inventory.get(3), 'Z kucaniem - kolor wzoru (gładkie płótno dostaje paski)');
    held = hold(3, null);
    check(tables.interact(hitA, null, true) && table().pattern === 'check' && /krata/.test(notices.at(-1)), 'Kucanie pustą ręką - następny wzór');
    products = sewingProducts(table());
    check(products.every((product) => product.item.look.main === 'red' && product.item.look.accent === 'white' && product.item.look.pattern === 'check'), 'Wykroje od razu w kolorach i we wzorze');

    check(tables.interact(hitB(3), null) && inventory.count('tunic_linen') === 1 && table().material.count === 6, 'PPM w wykrój - uszyta tunika (4 płótna)');
    const tunic = inventory.slots.find((item) => item?.type === 'tunic_linen');
    check(tunic.look.main === 'red' && tunic.look.accent === 'white' && tunic.look.pattern === 'check' && tunic.count === 1, 'Uszyte ubranie ma kolor i wzór ze stołu');
    check(achieved.some(([name, data]) => name === 'sewn' && data.mode === 'sew' && data.type === 'tunic_linen'), 'Osiągnięcie za szycie');
    tables.interact(hitB(3), null);
    check(tables.interact(hitB(3), null) && /potrzeba 4/.test(notices.at(-1)) && inventory.count('tunic_linen') === 2 && table().material.count === 2 &&
        sewingProducts(table())[3].enough === false, 'Za mało płótna - nic, napis ile trzeba (wykrój w cieniu)');
    tables.interact(hitB(0), null);
    check(inventory.count('trousers_linen') === 0, 'Spodnie (3) z dwóch płócien - nie');
    tables.interact(hitB(1), null);
    check(inventory.count('boots_linen') === 1 && table().material === null && table().main === null && table().pattern === 'check', 'Płótno się skończyło - barwy znikają (wzór i kroje zostają)');

    // Inny materiał nie miesza się z leżącym.
    held = hold(6, { type: 'nettle_cloth', count: 3 });
    tables.interact(hitA, held, true);
    held = hold(7, { type: 'linen_cloth', count: 2 });
    check(tables.interact(hitA, held) && table().material.type === 'nettle_cloth' && /zabierz/.test(notices.at(-1)) && inventory.get(7).count === 2, 'Jeden rodzaj materiału naraz');
    check(tables.interact(hitA, null) && inventory.count('nettle_cloth') === 3 && table().material === null, 'Pusta ręka - płótno wraca');

    // Plecionka z łyka: tylko kamizelka i łapcie.
    held = hold(6, { type: 'bast_weave', count: 4 });
    tables.interact(hitA, held, true);
    products = sewingProducts(table());
    check(products[0] === null && products[2] === null && products[1].kind === 'lapcie' && products[3].kind === 'vest', 'Łyko: łapcie i kamizelka, reszta pusta');
    check(tables.interact(hitB(0), null) && /nie uszyjesz/.test(notices.at(-1)), 'Pusty wykrój - napis');
    check(tables.interact(hitB(3), null, true) && /tylko/.test(notices.at(-1)), 'Jeden krój - nie ma czego zmieniać');
    tables.interact(hitA, null);

    // Barwienie gotowego ubrania.
    const bootsSlot = inventory.slots.findIndex((item) => item?.type === 'boots_linen');
    const boots = inventory.get(bootsSlot);
    inventory.set(bootsSlot, null);
    held = hold(8, boots);
    check(tables.interact(hitA, held, true) && table().material.type === 'boots_linen' && table().material.count === 1 && !inventory.get(8), 'Ubranie na blat (zawsze jedno)');
    held = hold(7, { type: 'dye_blue', count: 1 });
    check(tables.interact(hitA, held) && table().material.look.main === 'blue' && table().material.look.accent === 'white' && !inventory.get(7), 'Barwnik na ubranie - nowy kolor, wzór zostaje');
    check(achieved.some(([name, data]) => name === 'sewn' && data.mode === 'dye' && data.look.main === 'blue'), 'Barwienie liczy się do osiągnięć');
    check(tables.interact(hitA, null, true) && table().material.look.pattern === 'embroidery', 'Kucanie pustą ręką - inny wzór ubrania');
    check(tables.interact(hitB(0), null) && /lewej/.test(notices.at(-1)), 'Ubranie barwi się na lewej części');
    held = hold(7, { type: 'dye_black', count: 1 });
    tables.interact(hitA, held, true);
    check(table().material.look.accent === 'black', 'Z kucaniem - kolor wzoru ubrania');

    // Zapis, gra ze znajomymi, rozbijanie.
    const saved = JSON.parse(JSON.stringify(tables.getState()));
    check(saved.length === 1 && saved[0].material.look.main === 'blue', 'Stół z ubraniem w zapisie');
    const again = new SewingTables(game, saved);
    check(again.state(a).material.look.pattern === 'embroidery' && again.state(a).cuts.body === 'tunic', 'Po wczytaniu - ubranie, wzór, kroje');
    check(restoreSewingTable({ x: 1, y: 2, z: 3, material: { type: 'stone', count: 3 }, pattern: 'zła', main: 'nope', cuts: { head: 'shirt', legs: 'shorts' } }).material === null &&
        restoreSewingTable({ x: 1, y: 2, z: 3, material: { type: 'linen_cloth', count: 999 }, cuts: { head: 'shirt', legs: 'shorts' } }).material.count === SEWING_CAPACITY &&
        restoreSewingTable({ x: 1, y: 2, z: 3, cuts: { head: 'shirt', legs: 'shorts' } }).cuts.head === 'cap' && restoreSewingTable({ x: 1, y: 2, z: 3, cuts: { legs: 'shorts' } }).cuts.legs === 'shorts' &&
        restoreSewingTable({ x: 'a' }) === null && restoreSewingTable({ x: 1, y: 2, z: 3, pattern: 'zła', main: 'nope' }).pattern === 'plain', 'Zły zapis - poprawiany');
    const systems = stateSystems(game);
    const signBefore = systems.sewing.sign(table());
    tables.interact(hitA, null, true);
    check(systems.sewing.map() === tables.tables && systems.sewing.sign(table()) !== signBefore && systems.sewing.restore(systems.sewing.save(table())).material.look.pattern === sewingTableState(table()).material.look.pattern,
        'Gra ze znajomymi: zmiana na stole się wysyła');
    check(stateSystems({}).sewing.map().size === 0, 'Gra bez stołów krawieckich (stare testy) - pusto');
    tables.interact(hitA, null);
    check(inventory.count('boots_linen') === 1 && tables.canBreak(a), 'Ubranie wraca do ekwipunku');
    const info = shapeInfo(world.getBlockId(-1, 0, 0));
    world.setBlock(-1, 0, 0, null);
    tables.broken({ x: -1, y: 0, z: 0 }, info);
    check(world.getBlockId(0, 0, 0) === 0 && !tables.state(a), 'Rozbita część B - znika i część A');

    // Tryb twórczy: materiał z ręki nie ubywa.
    const creative = sewingGame('creative');
    creative.sewingTables.place({ x: 0, y: 0, z: 0 }, Math.PI, free);
    creative.inventory.set(0, { type: 'linen_cloth', count: 3 });
    creative.inventory.selected = 0;
    creative.sewingTables.interact(hitA, 'linen_cloth', true);
    check(creative.inventory.get(0).count === 3 && creative.sewingTables.state(a).material.count === 3, 'Tryb twórczy - z ręki nie ubywa');

    // Płótno na blacie (rendering): kolory i piksele.
    const natural = clothColors('nettle_cloth', { pattern: 'plain', main: null, accent: null });
    check(natural.main === C.CLOTHS.nettle.color && natural.accent === C.CLOTHS.nettle.shade, 'Płótno bez barwnika - kolor tkaniny');
    const dyedCloth = clothColors('linen_cloth', { pattern: 'stripes', main: 'red', accent: 'white' });
    check(dyedCloth.main === DYE_ITEMS.dye_red.color && dyedCloth.accent === DYE_ITEMS.dye_white.color && clothColors('linen_cloth', { pattern: 'plain', main: 'red', accent: 'white' }).accent !== DYE_ITEMS.dye_white.color, 'Płótno barwione; gładkie bez koloru wzoru');
    const pixels = clothPixels(dyedCloth);
    check(pixels.length === 1024 && pixels[3] === 255 && pixels[0] > 200 && pixels[1] > 200 && Math.abs(pixels[16 * 4] - parseInt(DYE_ITEMS.dye_red.color.slice(1, 3), 16)) < 30, 'Piksele płótna: wiersz wzoru i wiersz koloru');
    check(read('src/rendering/SewingTableRenderer.js').includes('sewingProducts(table)') && read('src/rendering/SewingTableRenderer.js').includes('SHORT_SHADE'), 'Wykroje na blacie, w cieniu gdy brak płótna');
}


// --- Stosy z wyglądem ---------------------------------------------------------------------

{
    const look = C.cleanLook({ pattern: 'check', main: 'red', accent: 'black' });
    const shirt = F.makeItem('shirt_linen', 1, undefined, look);
    check(shirt.look.pattern === 'check' && F.withCount(shirt, 1).look.main === 'red' && !('look' in F.makeItem('stone', 3, undefined, look)), 'Wygląd tylko dla ubrań, przeżywa kopiowanie');
    check(cleanItem({ type: 'shirt_linen', count: 5, look }).count === 1 && cleanItem({ type: 'shirt_linen', count: 1, look }).look.accent === 'black' &&
        cleanItem({ type: 'shirt_linen', count: 1 }).look.pattern === 'plain', 'Zapis: jedno ubranie w stosie, wygląd zostaje');
    const inventory = Inventory.load({}, 'adventure');
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    check(inventory.add('shirt_linen', 3, 0, inventory.slots.length, undefined, look) === 0 && inventory.get(0).count === 1 && inventory.get(1).count === 1 && inventory.get(2).look.main === 'red', 'Ubrania się nie układają w stosy');
    check(inventory.room('shirt_linen') === inventory.slots.length - 3, 'Jedno ubranie na miejsce');
    const chest = CS.newChest(0, 10, 0);
    check(CS.insertIntoChest(chest, 'shirt_linen', 1, undefined, look) === 0 && chest.layers[0][0].look.main === 'red' && CS.restoreChest(JSON.parse(JSON.stringify(CS.chestState(chest)))).layers[0][0].look.pattern === 'check', 'Skrzynia trzyma wygląd');
    const held = F.makeItem('shirt_linen', 1, undefined, C.cleanLook({ main: 'blue' }));
    const back = CS.putIntoCell(chest, 0, held);
    check(back === null && chest.layers[1][0].look.main === 'blue' && chest.layers[0][0].look.main === 'red', 'Dwa ubrania w przegródce się nie mieszają');
    const drop = restoreDrop({ type: 'shirt_linen', count: 1, x: 0, y: 5, z: 0, look });
    check(drop.look.main === 'red' && dropState(drop).look.pattern === 'check' && !('look' in restoreDrop({ type: 'stone', count: 1, x: 0, y: 5, z: 0, look })), 'Wyrzucone ubranie zachowuje wygląd');
}


// --- Noszenie, ciepło, sieć ---------------------------------------------------------------------

{
    const look = C.cleanLook({ pattern: 'stripes', main: 'red', accent: 'white' });
    const saved = { equip: [{ type: 'cap_linen', count: 1, look }, { type: 'trousers_linen', count: 1 }, { type: 'trousers_linen', count: 1 }, { type: 'stone', count: 1 }] };
    const inventory = Inventory.load({ inventory: saved }, 'adventure');
    check(EQUIP_COUNT === 4 && inventory.equip[0].look.main === 'red' && inventory.equip[1] === null && inventory.equip[2].type === 'trousers_linen' && inventory.equip[3] === null, 'Zapis: ubranie tylko na swoim miejscu');
    check(Inventory.load({}, 'adventure').equip.every((item) => item === null) && !('sew' in Inventory.load({}, 'adventure').data), 'Nowy świat: nic na sobie (stół nie ma pól w ekwipunku)');
    check(C.fitsSlot({ type: 'cap_nettle' }, 0) && !C.fitsSlot({ type: 'cap_nettle' }, 1) && C.fitsSlot({ type: 'lapcie_bast' }, 3) && !C.fitsSlot(null, 0), 'Co gdzie pasuje');
    const full = [{ type: 'cap_nettle' }, { type: 'tunic_nettle' }, { type: 'trousers_nettle' }, { type: 'boots_nettle' }];
    const warmth = C.wornWarmth(full);
    check(warmth > 10 && warmth < 16 && C.wornWarmth([]) === 0 && C.wornWarmth([{ type: 'stone' }]) === 0 && C.wornWarmth([{ type: 'cap_linen' }]) === C.garmentInfo('cap_linen').warmth, `Cały pokrzywowy strój grzeje o ${warmth}°C`);

    // Ciepło ubrań w odczuwalnej temperaturze (1.26.0 Warmth.js).
    const W = await import('../src/game/Warmth.js');
    const dressed = W.feltTemperature({ air: -2, sky: 15, clothes: warmth });
    const naked = W.feltTemperature({ air: -2, sky: 15 });
    check(Math.abs(dressed.felt - naked.felt - warmth) < 1e-9 && dressed.clothes === warmth && naked.clothes === 0, 'Ubrania podnoszą odczuwalną temperaturę');
    check(Math.abs(W.feltTemperature({ air: 10, water: true, clothes: 10 }).clothes - 10 * W.WET_CLOTHES) < 1e-9, 'Mokre ubrania (w wodzie) grzeją słabiej');
    const warmthGame = { player: { pos: { x: 0, y: 70, z: 0 } }, world: { getLight: () => ({ sky: 15 }), getBlockId: () => 0 }, weather: { temperature: -4, wind: { speed: 0 } },
        inventory: { equip: full }, campfires: { fires: [] } };
    const meter = new W.Warmth(warmthGame);
    check(Math.abs(meter.update(0, true).clothes - warmth) < 1e-9, 'Warmth bierze ubrania z miejsc na postaci');
    check(read('src/game/Freeze.js').includes('(parts.clothes ?? 0)') && read('src/commands/worldCommands.js').includes('ubrania ${n(p.clothes ?? 0)}'), 'Odwilż i /zimno liczą ubrania');

    const code = C.clothesCode([{ type: 'cap_linen', count: 1, look }, null, { type: 'trousers_linen', count: 1 }, null]);
    check(code === 'cap_linen.stripes.red.white|-|trousers_linen.plain..|-', `Kod ubrań (${code})`);
    const parsed = C.parseClothes(code);
    check(parsed[0].look.main === 'red' && parsed[1] === null && parsed[2].type === 'trousers_linen' && parsed[3] === null && C.parseClothes('x'.repeat(500)).length === 0 &&
        C.parseClothes('shirt_linen|-|-|-')[0] === null && C.parseClothes(null).length === 0, 'Kod ubrań: odczyt, złe kody odrzucone');
    const player = { pos: { x: 1, y: 2, z: 3 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0 };
    check(P.unpackPlayer(P.packPlayer(player, null, 0, false, false, code)).clothes === code && P.unpackPlayer(P.packPlayer(player, null, 0)).clothes === '' &&
        P.unpackPlayer([0, 0, 0, 0, 0, 0, 0, 0, 0, null, 0]).clothes === '', 'Inni gracze dostają kod ubrań (starsza wersja - bez ubrań)');
    check(read('src/net/NetSession.js').includes("game.clothes ?? ''") && read('src/net/RemotePlayers.js').includes('entry.texture.userData.dress?.(entry.clothes)'), 'Sieć: wysyłanie i malowanie u innych');
    const game = read('src/game/Game.js');
    check(game.includes('this.clothes = clothesCode(equip);') && game.includes('this.onClothes?.(equip);') && read('src/main.js').includes('game.onClothes = (equip) => setWornClothes(equip);'), 'Gra: ubrania na skórce');
    const interaction = read('src/game/GameInteraction.js');
    check(game.includes('new SewingTables(this, worldInfo.sewingTables)') && game.includes('this.sewingTables.update(dt)') && game.includes('this.sewingTables.dispose()') &&
        interaction.includes('this.sewingTables.interact(this.currentHit') && interaction.includes('this.sewingTables.place(target') && interaction.includes('this.sewingTables.canBreak(hit.block)') &&
        interaction.includes('this.sewingTables?.broken(hit.block') && read('src/storage/WorldSaver.js').includes('this.worldInfo.sewingTables = this.sewingTables.getState()') &&
        read('src/net/NetHost.js').includes("sewing: this.state.snapshot('sewing')") && !read('src/main.js').includes('onOpenStation'), 'Gra: stół w świecie (stawianie, PPM, rozbijanie, zapis, sieć)');
}


// --- Ubrania na skórce i ikonki -------------------------------------------------------------------

{
    const pixels = () => { const data = new Uint8ClampedArray(SKIN * SKIN * 4); for (let i = 3; i < data.length; i += 4) data[i] = 255; return data; };
    const at = (data, x, y) => Array.from(data.slice((y * SKIN + x) * 4, (y * SKIN + x) * 4 + 4));
    const red = [0xe4, 0x32, 0x28];
    const near = (a, b) => b.every((value, i) => Math.abs(a[i] - value) < 30);

    const data = pixels();
    check(paintClothes(data, [null, { type: 'shirt_linen', look: C.cleanLook({ main: 'red' }) }, null, null]) === 1, 'Jedno ubranie namalowane');
    const [bu, bv, , , bd] = BOXES.body.base;
    check(near(at(data, bu + bd + 2, bv + bd + 5), red), 'Koszula: czerwony przód tułowia');
    const [ou, ov, , , od] = BOXES.body.over;
    check(at(data, ou + od + 2, ov + od + 5)[3] === 0, 'Pod koszulą znika wierzchnia warstwa skórki (kurtka nie zasłania)');
    const [au, av, , , ad] = BOXES.armL.base;
    check(near(at(data, au + ad + 1, av + ad + 10), red), 'Długie rękawy');
    const [hu, hv] = BOXES.head.base;
    check(at(data, hu + 8 + 3, hv + 8 + 4)[0] === 0, 'Głowa nietknięta');

    const striped = pixels();
    paintClothes(striped, [null, { type: 'shirt_linen', look: C.cleanLook({ pattern: 'stripes', main: 'red', accent: 'white' }) }, null, null]);
    check(near(at(striped, bu + bd + 2, bv + bd + 4), [0xe8, 0xec, 0xf4]) && near(at(striped, bu + bd + 2, bv + bd + 5), red), 'Paski co cztery wiersze');

    const outfit = pixels();
    check(paintClothes(outfit, [{ type: 'cap_linen' }, { type: 'vest_bast' }, { type: 'shorts_linen' }, { type: 'lapcie_bast' }]) === 4, 'Cały strój');
    const [lu, lv, , , ld] = BOXES.legR.base;
    check(at(outfit, lu + ld + 1, lv + ld + 9)[0] === 0 && at(outfit, lu + ld + 1, lv + ld + 2)[0] > 100, 'Krótkie spodenki - tylko u góry nóg');
    const [hou, hov, , , hod] = BOXES.head.over;
    check(at(outfit, hou + hod + 3, hov + 2)[3] === 255 && at(outfit, hou + hod + 3, hov + hod + 6)[0] === 0, 'Czapka na wierzchniej warstwie głowy - tylko u góry');
    check(paintClothes(pixels(), [{ type: 'shirt_linen' }, null, null, null]) === 0, 'Ubranie nie na swoim miejscu - nic');

    // Ikonki: jasność zostaje, kolor z barwnika, wzór na pikselach materiału.
    const icon = new Uint8ClampedArray(16 * 16 * 4);
    const natural = C.lookColors('shirt_linen', null);
    const base = [1, 3, 5].map((i) => parseInt(natural.main.slice(i, i + 2), 16));
    for (let i = 0; i < 256; i++) { icon.set(base, i * 4); icon[i * 4 + 3] = 255; }
    recolor(icon, 16, natural, C.lookColors('shirt_linen', { pattern: 'stripes', main: 'blue', accent: 'white' }));
    check(icon[0] > 200 && near(Array.from(icon.slice(16 * 4, 16 * 4 + 3)), [0x44, 0x62, 0xf6]), 'Ikonka: niebieska w białe paski');
    check(iconPattern('stripes', 0, 3) === 'accent' && iconPattern('stripes', 0, 1) === 'main' && iconPattern('plain', 0, 0) === 'main', 'Wzór ikonki');
    check(read('src/ui/InventoryScreen.js').includes('garmentIcon(this.icons, item') && read('src/ui/Hotbar.js').includes('garmentIcon(this.icons, items[i]'), 'Barwione ikonki w ekwipunku i na pasku');
    check(read('src/player/skin.js').includes('return base.toDataURL') && read('src/player/skin.js').includes('composeSkin(context, base, worn)'), 'Skórka: inni gracze dostają samą skórkę, ubrania nakłada gra');
}


// --- Stare krzaki, opisy, osiągnięcia, komenda, poradnik --------------------------------------------

{
    for (const [name, biome] of Object.entries(BIOMES)) {
        const species = biome.plants?.bushes?.species ?? [];
        check(species.every((key) => key === 'chili'), `${name}: stare krzaki truskawki, jeżyny, leszczyny i borówki już nie rosną`);
    }
    for (const species of ['strawberry', 'blackberry', 'hazel', 'blueberry']) check(R.bushStages(species).every((type) => R.getBlockDefinition(type)), `${species}: stare bloki zostają (stare światy)`);

    check(itemUses('len_wiazka').some((text) => text.startsWith('moczenie w wodzie')) && itemUses('flax_fiber').some((text) => text.includes('tkanie')) &&
        itemUses('linen_cloth').some((text) => text.includes('szycie')) && itemUses('shirt_linen').some((text) => text.includes('grzeje')) &&
        itemUses('dye_red').some((text) => text.includes('barwienie ubrań')), 'Opisy zastosowań');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    check(byId.retted.on === 'retted' && byId.woven.on === 'woven' && byId.tailor.when({ mode: 'sew' }) && !byId.tailor.when({ mode: 'dye' }) &&
        byId.colorful.when({ look: { main: 'red' } }) && !byId.colorful.when({ look: { main: null, accent: null } }) && byId.head_to_toe.when({ count: 4 }) && !byId.head_to_toe.when({ count: 3 }), 'Osiągnięcia');
    for (const id of ['retted', 'woven', 'tailor', 'colorful', 'head_to_toe']) check(itemExists(byId[id].icon), `${id}: ikonka`);
    const commands = read('src/commands/worldCommands.js');
    check(/name: 'ubrania'/.test(commands) && commands.includes("word === 'zestaw'") && read('docs/komendy.md').includes('`/ubrania`'), 'Komenda /ubrania z opisem');
    const chapter = GUIDE.find((entry) => entry.id === 'clothes');
    const text = chapter.lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(text.includes('do wody') && text.includes('stół krawiecki') && text.includes('krój') && text.includes('Barwnik') && text.includes('wykroje'), 'Poradnik: włókna i ubrania');
    check(read('docs/ubrania.md').includes('Stół krawiecki') && read('CHANGELOG.md').includes('## 1.27.0'), 'Dokumenty');
}

console.log(`OK: włókna i ubrania - ${checks} sprawdzeń (moczenie, tkanie, szycie, barwienie, stół w świecie, stosy z wyglądem, noszenie, sieć, skórka, ikonki, stare krzaki).`);
