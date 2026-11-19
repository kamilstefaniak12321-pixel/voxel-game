// ------------------------------------------------------------
// SPRAWDZENIE WŁÓKIEN I UBRAŃ (1.27.0)
//
// - moczenie w wodzie (leżące przedmioty), włókna, sznur, stół krawiecki
//   (blok, przepis, tekstury),
// - płótna, kroje, wzory, kolory; tkanie, szycie, barwienie,
// - stół w ekwipunku (SewingPanel): tkanie, szycie, barwienie, Shift,
//   zwrot pól po zamknięciu,
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
    load(url, context, next) {
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
const { recolor, iconPattern } = await import('../src/ui/garmentIcons.js');
const { SewingPanel, SEW_FIBER, SEW_MATERIAL, SEW_MAIN, SEW_ACCENT } = await import('../src/ui/SewingPanel.js');
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
        C.retsInto('oak_bark') === null && C.retsInto(null) === null && C.retsInto('toString') === null, 'Co się moczy');
    for (const [from, into] of Object.entries(C.RETTING)) check(itemExists(from) && itemExists(into), `${from} -> ${into}: przedmioty istnieją`);
    check(C.RET_SECONDS >= 60 && C.RET_SECONDS <= 180, 'Moczenie trwa półtorej minuty');
    check(findRecipe(['flax_retted'])?.result.join() === 'flax_fiber,2' && findRecipe(['nettle_retted'])?.result.join() === 'nettle_fiber,1', 'Włókno z moczonego lnu i pokrzywy');
    check(findRecipe(['flax_fiber', 'nettle_fiber', 'bast'])?.result.join() === 'rope,1' && findRecipe(['bast', 'bast', 'bast'])?.result.join() === 'rope,1' &&
        findRecipe(['flax_fiber', 'flax_fiber'])?.result[0] !== 'rope', 'Trzy dowolne włókna - sznur');
    check(findRecipe(['oak_planks', 'oak_planks', 'rope', 'rope'])?.result.join() === 'sewing_table,1' && findRecipe(['oak_planks', 'oak_planks', 'stick', 'stick'])?.result[0] === 'oak_carpenter_table', 'Stół krawiecki: deski na sznurach (stolarski dalej na patykach)');
    check(findRecipe(['len_wiazka', 'len_wiazka', 'len_wiazka', 'len_wiazka'])?.result[0] === 'linen_bedding', 'Lniana pościel bez zmian');
    const table = R.getBlockDefinition('sewing_table');
    check(table.id === 15500 && table.station === 'sewing' && table.solid && table.category === 'ozdoby' && manifest.tiles.sewing_table_top && manifest.tiles.sewing_table_side, 'Blok stołu krawieckiego z teksturami');
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
    check(C.weave('flax_fiber', 5).type === 'linen_cloth' && C.weave('flax_fiber', 5).count === 2 && C.weave('flax_fiber', 5).uses === 4 &&
        C.weave('nettle_fiber', 2).type === 'nettle_cloth' && C.weave('bast', 2).type === 'bast_weave' && C.weave('flax_fiber', 1) === null && C.weave('stone', 8) === null, 'Tkanie: dwa włókna - jedno płótno, zależnie od włókna');
    check(Object.keys(C.GARMENT_TYPES).length === 20 && C.kindsFor('bast').join() === 'vest,lapcie' && C.kindsFor('linen').length === 9, 'Kroje i z czego');
    for (const [type, info] of Object.entries(C.GARMENT_TYPES)) {
        check(C.SLOTS.includes(info.slot) && info.warmth > 0 && info.cost >= 1 && getItemLabel(type) === info.label && F.stackSize(type) === 1, `${type}: ${info.label}`);
        check(CUTS[info.kind]?.length > 0, `${type}: krój na skórce`);
    }
    check(getItemLabel('shirt_linen') === 'Koszula lniana' && getItemLabel('trousers_nettle') === 'Spodnie pokrzywowe' && getItemLabel('lapcie_bast') === 'Łapcie z łyka', 'Polskie nazwy');
    check(C.garmentInfo('tunic_nettle').warmth > C.garmentInfo('tunic_linen').warmth && C.garmentInfo('tunic_linen').warmth > C.garmentInfo('shirt_linen').warmth, 'Tunika grzeje bardziej niż koszula, pokrzywa bardziej niż len');

    const linen = { type: 'linen_cloth', count: 5 };
    const red = { type: 'dye_red', count: 3 }, white = { type: 'dye_white', count: 2 };
    let result = C.sewResult(linen, { kind: 'shirt', pattern: 'stripes' }, [red, white]);
    check(result.mode === 'sew' && result.item.type === 'shirt_linen' && result.material === 3 && result.dyes.join() === '1,1' &&
        result.item.look.pattern === 'stripes' && result.item.look.main === 'red' && result.item.look.accent === 'white', 'Szycie: krój, wzór i dwa barwniki');
    result = C.sewResult(linen, { kind: 'shirt', pattern: 'plain' }, [null, white]);
    check(result.item.look.main === null && result.item.look.accent === null && result.dyes.join() === '0,0', 'Gładki - barwnik wzoru niepotrzebny');
    check(C.sewResult({ type: 'linen_cloth', count: 2 }, { kind: 'shirt' }) === null && C.sewResult(linen, { kind: 'lapcie' }) === null &&
        C.sewResult({ type: 'bast_weave', count: 2 }, { kind: 'lapcie' }).item.type === 'lapcie_bast' && C.sewResult(null, { kind: 'cap' }) === null &&
        C.sewResult({ type: 'stone', count: 9 }, { kind: 'cap' }) === null && C.sewResult(linen, {}) === null, 'Za mało płótna, zły krój, złe płótno - nic');

    // Barwienie gotowego ubrania.
    const shirt = { type: 'shirt_linen', count: 1, look: C.cleanLook({ pattern: 'plain' }) };
    const dyed = C.sewResult(shirt, { pattern: 'check' }, [{ type: 'dye_blue', count: 1 }, white]);
    check(dyed.mode === 'dye' && dyed.item.type === 'shirt_linen' && dyed.material === 1 && dyed.item.look.main === 'blue' && dyed.item.look.pattern === 'check' && dyed.item.look.accent === 'white', 'Barwienie: nowy kolor i wzór');
    check(C.sewResult(shirt, { pattern: 'plain' }, []) === null && C.sewResult(shirt, { pattern: 'check' }, [null, null]) === null, 'Barwienie bez barwnika - nic');
    const blue = { type: 'shirt_linen', count: 1, look: C.cleanLook({ pattern: 'plain', main: 'blue' }) };
    check(C.sewResult(blue, { pattern: 'plain' }, [{ type: 'dye_blue', count: 1 }]) === null, 'Ten sam kolor - nic do zrobienia');

    check(JSON.stringify(C.cleanLook({ pattern: 'x', main: 'nope', accent: 'red' })) === '{"pattern":"plain","main":null,"accent":"red"}' && C.cleanLook(null).pattern === 'plain', 'Wygląd: poprawiany');
    const colors = C.lookColors('shirt_nettle', null);
    check(colors.main === C.CLOTHS.nettle.color && colors.accent === C.CLOTHS.nettle.shade && C.lookColors('shirt_linen', { main: 'red' }).accent !== DYE_ITEMS.dye_red.color, 'Naturalne kolory płótna; wzór bez barwnika - ciemniejszy kolor');
    check(C.lookText('shirt_linen', { pattern: 'stripes', main: 'red', accent: 'white' }) === 'kolor: czerwony, wzór: paski (biały)' && C.lookText('cap_linen', null) === 'kolor: niebarwiony, wzór: gładki', 'Opis wyglądu');
}


// --- Stół w ekwipunku (SewingPanel) -------------------------------------------------------

{
    const inventory = Inventory.load({}, 'adventure');
    const achieved = [];
    const game = { inventory, achieve: (name, data) => achieved.push([name, data]), previewClothes() {} };
    const screen = { game, get cursor() { return inventory.cursor; }, set cursor(item) { inventory.cursor = item; }, icons: new Map() };
    const panel = new SewingPanel(screen);
    const sew = inventory.sew;

    sew[SEW_FIBER] = { type: 'flax_fiber', count: 5 };
    check(panel.clickWeave(false) === 1 && inventory.cursor.type === 'linen_cloth' && inventory.cursor.count === 1 && sew[SEW_FIBER].count === 3, 'Klik w krosno - jedno płótno pod kursor');
    check(panel.clickWeave(false) === 1 && inventory.cursor.count === 2 && sew[SEW_FIBER].count === 1, 'Drugi klik - dokłada do trzymanego');
    check(panel.clickWeave(false) === 0, 'Jedno włókno to za mało');
    inventory.cursor = null;
    sew[SEW_FIBER] = { type: 'nettle_fiber', count: 9 };
    check(panel.clickWeave(true) === 4 && inventory.count('nettle_cloth') === 4 && sew[SEW_FIBER].count === 1, 'Shift - ile się da, prosto do ekwipunku');
    check(achieved.filter(([name]) => name === 'woven').length === 3, 'Osiągnięcie za tkanie');

    sew[SEW_MATERIAL] = { type: 'nettle_cloth', count: 4 };
    sew[SEW_MAIN] = { type: 'dye_green', count: 2 };
    sew[SEW_ACCENT] = { type: 'dye_yellow', count: 1 };
    panel.choice = { kind: 'trousers', pattern: 'embroidery' };
    check(panel.result().item.type === 'trousers_nettle', 'Podgląd wyniku');
    check(panel.clickSew() && inventory.cursor.type === 'trousers_nettle' && inventory.cursor.look.pattern === 'embroidery' && inventory.cursor.look.main === 'green' &&
        sew[SEW_MATERIAL].count === 1 && sew[SEW_MAIN].count === 1 && sew[SEW_ACCENT] === null, 'Szycie: ubranie pod kursor, zużyte płótno i barwniki');
    check(!panel.clickSew(), 'Z ubraniem w ręce nie da się uszyć drugiego');
    check(achieved.some(([name, data]) => name === 'sewn' && data.mode === 'sew'), 'Osiągnięcie za szycie');

    // Barwienie: ubranie na stół, nowy kolor.
    const trousers = inventory.cursor;
    inventory.cursor = null;
    sew[SEW_MATERIAL] = trousers;
    sew[SEW_MAIN] = { type: 'dye_black', count: 1 };
    panel.choice.pattern = 'embroidery';
    check(panel.clickSew() && inventory.cursor.look.main === 'black' && inventory.cursor.look.accent === 'yellow' && sew[SEW_MATERIAL] === null && sew[SEW_MAIN] === null, 'Barwienie gotowego: wzór zostaje, kolor nowy');

    // Shift + klik z ekwipunku na stół, zwrot po zamknięciu.
    inventory.cursor = null;
    const dye = { type: 'dye_red', count: 4 };
    check(panel.quickMove(dye) && sew[SEW_MAIN].type === 'dye_red' && dye.count === 0, 'Shift: barwnik na pole koloru');
    const second = { type: 'dye_white', count: 2 };
    check(panel.quickMove(second) && sew[SEW_ACCENT].type === 'dye_white', 'Drugi inny barwnik - na pole wzoru');
    check(panel.quickMove({ type: 'flax_fiber', count: 2 }) === false || sew[SEW_FIBER].type === 'nettle_fiber', 'Inne włókno nie miesza się z leżącym');
    check(!panel.quickMove({ type: 'stone', count: 3 }), 'Kamień nie idzie na stół');
    panel.close();
    check(sew.every((item) => item === null) && inventory.count('dye_red') === 4 && inventory.count('dye_white') === 2, 'Po zamknięciu wszystko wraca do ekwipunku');
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
    check(Inventory.load({}, 'adventure').equip.every((item) => item === null) && Inventory.load({}, 'adventure').sew.length === 4, 'Nowy świat: nic na sobie, pusty stół');
    check(C.fitsSlot({ type: 'cap_nettle' }, 0) && !C.fitsSlot({ type: 'cap_nettle' }, 1) && C.fitsSlot({ type: 'lapcie_bast' }, 3) && !C.fitsSlot(null, 0), 'Co gdzie pasuje');
    const full = [{ type: 'cap_nettle' }, { type: 'tunic_nettle' }, { type: 'trousers_nettle' }, { type: 'boots_nettle' }];
    const warmth = C.wornWarmth(full);
    check(warmth > 10 && warmth < 16 && C.wornWarmth([]) === 0 && C.wornWarmth([{ type: 'stone' }]) === 0 && C.wornWarmth([{ type: 'cap_linen' }]) === C.garmentInfo('cap_linen').warmth, `Cały pokrzywowy strój grzeje o ${warmth}°C`);

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
    check(game.includes('this.clothes = clothesCode(equip);') && game.includes('this.onClothes?.(equip);') && read('src/main.js').includes('game.onClothes = (equip) => setWornClothes(equip);') &&
        read('src/main.js').includes("game.onOpenStation = (station) => openInventory(null, station);"), 'Gra: ubrania na skórce, stół otwiera ekwipunek');
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
    check(text.includes('do wody') && text.includes('stół krawiecki') && text.includes('krój') && text.includes('Barwniki'), 'Poradnik: włókna i ubrania');
    check(read('docs/ubrania.md').includes('Stół krawiecki') && read('CHANGELOG.md').includes('## 1.27.0'), 'Dokumenty');
}

console.log(`OK: włókna i ubrania - ${checks} sprawdzeń (moczenie, tkanie, szycie, barwienie, stół w ekwipunku, stosy z wyglądem, noszenie, sieć, skórka, ikonki, stare krzaki).`);
