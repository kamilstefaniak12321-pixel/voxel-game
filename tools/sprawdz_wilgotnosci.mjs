// ------------------------------------------------------------
// WILGOTNOŚĆ DREWNA (1.33.0, docs/drewno.md)
//
// - polana prosto spod siekiery są mokre (items/moisture.js): wyższy
//   zapłon, słabszy żar; wilgotność niesie stos (pole fresh - suchość),
// - stos wędruje przez ekwipunek, skrzynie i wytwarzanie jak świeżość
//   jedzenia; suche polano wygląda w zapisie jak dotąd,
// - w ognisku: mokre polano trudniej zapalić, schnie, paląc się,
//   a polana pod nim schną od ciepła,
// - schnięcie (game/WoodDrying.js): plecak, skrzynia, piwniczka, ziemia,
//   słońce, ogień; deszcz i woda moczą,
// - prawdziwe Campfires, opisy, komendy, osiągnięcia, poradnik.
//
// Uruchomienie: node tools/sprawdz_wilgotnosci.mjs
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
const { WOOD_TRAITS } = await import('../src/blocks/woodTraits.js');
const M = await import('../src/items/moisture.js');
const { seasonedWood, isSeasonable, freshWet, choppedFresh, wetOf, setWet, wetFactor, isWet, wetWord, wetIgnite, wetHeat, wetBar, wetNotes,
    DRY_WET, WET_FULL, WET_IGNITE, WET_HEAT, RAIN_WET, SOAKED } = M;
const { makeItem, withCount, sameBatch, blend, freshOf, freshBar, hasFresh } = await import('../src/items/freshness.js');
const S = await import('../src/game/CampfireState.js');
const { FIRE_WOODS, newCampfire, addFirewood, addTinder, addKindling, updateCampfire, restoreCampfire, campfireDrops, canIgnite,
    catchesFromEmbers, logIgnite, logHeat, woodHeat, woodIgnite, logSeconds, fuelType, setLogWet, STACK_DRY_SECONDS, EMBER_TEMP } = S;
const D = await import('../src/game/WoodDrying.js');
const { WoodDrying, dryingRate, driedWet, rainedWet, dryDaysLeft, temperatureDrying, DRY_PER_DAY, PLACE, FIRE_DRY_PER_DAY, RAIN_PER_DAY, DRY_STEP_DAYS } = D;
const { Inventory } = await import('../src/game/Inventory.js');
const { RECIPES } = await import('../src/crafting/recipes.js');
const { gridResult, craftAll, fillGrid } = await import('../src/crafting/Crafting.js');
const { newChest, restoreChest, insertIntoChest } = await import('../src/game/ChestState.js');
const { Campfires } = await import('../src/game/Campfires.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { itemExists } = await import('../src/items/ItemRegistry.js');
const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
const { FIRE_HEAT } = await import('../src/game/Warmth.js');
const { DAY_LENGTH_MINUTES } = await import('../src/config.js');
const { GUIDE } = await import('../src/ui/guide.js');
const { SEASON_TEMPERATURE } = await import('../src/game/Spoilage.js');
const { seasonAt } = await import('../src/sky/Seasons.js');
const { TUTORIAL_STEPS } = await import('../src/game/Tutorial.js');

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, message, tolerance = 1e-6) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual}, miało być ${expected})`);

const WOODS = Object.keys(FIRE_WOODS);
const DAY_SECONDS = DAY_LENGTH_MINUTES * 60;


// --- Zasady wilgotności ------------------------------------------------------------------

{
    check(DRY_WET === 0.15 && WET_FULL === 0.8 && WET_IGNITE === 100 && WET_HEAT === 0.3 && RAIN_WET === 0.6 && SOAKED === 0.95, 'Liczby wilgotności');
    check(seasonedWood('oak_firewood') === 'oak' && seasonedWood('rainbow_eucalyptus_firewood') === 'rainbow_eucalyptus' && seasonedWood('oak_log') === null && seasonedWood('stick') === null && seasonedWood('nic_firewood') === null && seasonedWood(null) === null, 'Wilgotność mają tylko polana');
    for (const wood of WOODS) {
        check(isSeasonable(fuelType(wood)) && hasFresh(fuelType(wood)) && !isSeasonable(`${wood}_log`) && !isSeasonable(`${wood}_planks`), `${wood}: polano niesie wilgotność, pień i deski nie`);
        near(choppedFresh(fuelType(wood)), 1 - WOOD_TRAITS[wood].fresh, `${wood}: świeże polano`, 1e-12);
        check(freshWet(wood) === WOOD_TRAITS[wood].fresh, `${wood}: wilgotność świeżego z cech`);
    }
    check(choppedFresh('stick') === undefined && choppedFresh('oak_log') === undefined, 'Inne rzeczy nie mają wilgotności');

    equal([0, 0.15, 0.475, 0.8, 1].map((wet) => Math.round(wetFactor(wet) * 1e9) / 1e9), [0, 0, 0.5, 1, 1], 'Kara: od 15% wody rośnie, przy 80% pełna');
    equal([0, 0.15, 0.3, 0.6, 0.9].map(wetWord), ['suche', 'suche', 'wilgotne', 'mokre', 'bardzo mokre'], 'Słowami');
    check(!isWet(0) && !isWet(0.15) && isWet(0.16), 'Suche do 15% wody');
    // Świeże: dąb, sosna, brzoza, oliwka, baobab.
    equal([wetIgnite('oak', 0.6), wetHeat('oak', 0.6)], [389, 729], 'Świeży dąb: zapłon 389°, żar 729°');
    equal([wetIgnite('pine', 0.4), wetHeat('pine', 0.4)], [258, 655], 'Świeża sosna: prawie jak sucha');
    equal([wetIgnite('birch', 0.8), wetHeat('birch', 0.8)], [370, 602], 'Świeża brzoza: bardzo mokra');
    equal([wetIgnite('olive', 0.15), wetHeat('olive', 0.15)], [290, 960], 'Oliwka pali się nawet świeża');
    equal([wetIgnite('baobab', 0.95), wetHeat('baobab', 0.95)], [480, 364], 'Świeży baobab prawie się nie pali');
    equal([wetIgnite('oak', 0), wetHeat('oak', 0)], [woodIgnite('oak'), woodHeat('oak')], 'Suche: liczby z cech');

    // Sosna jest wilgotna, ale i tak zajmuje się od trawy; brzoza - nie od samej kory.
    check(wetIgnite('pine', freshWet('pine')) <= 260 && wetIgnite('birch', freshWet('birch')) > 330, 'Świeża sosna od trawy, świeża brzoza nawet nie od kory brzozowej');
    // Nikt nie utknie: zwykła kora (280°) i dwa patyki (400°) zapalą świeże
    // drewno każdego gatunku poza namorzynem i baobabem.
    const stuck = WOODS.filter((wood) => wetIgnite(wood, freshWet(wood)) > 400);
    equal(stuck.sort(), ['baobab', 'mangrove'], 'Świeże drewno: kora i dwa patyki wystarczą wszędzie poza namorzynem i baobabem');
    const dryFresh = WOODS.filter((wood) => !isWet(freshWet(wood)));
    equal(dryFresh.sort(), ['acacia', 'bristlecone', 'joshua_tree', 'olive'], 'Suche od razu: akacja, sosna oścista, jukka, oliwka');
}


// --- Stos polan: pole fresh, pasek, opis --------------------------------------------------

{
    equal(makeItem('oak_firewood', 4), { type: 'oak_firewood', count: 4 }, 'Suche polana: stos bez pola (jak w dawnych zapisach)');
    equal(makeItem('oak_firewood', 4, 1), { type: 'oak_firewood', count: 4 }, 'Suchość 1 - też bez pola');
    equal(makeItem('oak_firewood', 4, 0.4), { type: 'oak_firewood', count: 4, fresh: 0.4 }, 'Mokre polana niosą suchość');
    equal(makeItem('oak_log', 4, 0.4), { type: 'oak_log', count: 4 }, 'Pień nie niesie wilgotności');
    const wet = makeItem('oak_firewood', 4, 0.4), dry = makeItem('oak_firewood', 4);
    near(wetOf(wet), 0.6, 'Wilgotność stosu', 1e-12);
    check(wetOf(dry) === 0 && wetOf(makeItem('oak_log', 1)) === 0 && wetOf(null) === 0 && freshOf(dry) === 1 && freshOf(wet) === 0.4, 'Suchy stos: 0');
    equal(withCount(wet, 2), { type: 'oak_firewood', count: 2, fresh: 0.4 }, 'Dzielenie stosu zachowuje wilgotność');
    check(sameBatch(dry, 'oak_firewood') && sameBatch(dry, 'oak_firewood', 0.95) && !sameBatch(dry, 'oak_firewood', 0.4) && sameBatch(wet, 'oak_firewood', 0.45) && !sameBatch(wet, 'oak_firewood'), 'Same dokładają się tylko polana o podobnej wilgotności');
    const mixed = blend(makeItem('oak_firewood', 4, 0.4), 4, 1);
    equal(mixed, { type: 'oak_firewood', count: 8, fresh: 0.7 }, 'Ręczne łączenie: średnia wilgotność');
    equal(blend(makeItem('oak_firewood', 4), 4), { type: 'oak_firewood', count: 8 }, 'Suche z suchym: dalej bez pola');
    equal(setWet({ type: 'oak_firewood', count: 1 }, 0.25), { type: 'oak_firewood', count: 1, fresh: 0.75 }, 'setWet: suchość w polu');
    equal(setWet({ type: 'oak_firewood', count: 1, fresh: 0.3 }, 0), { type: 'oak_firewood', count: 1 }, 'setWet: suche - pole znika');

    // Pasek: niebieski, tym dłuższy, im więcej wody; suche bez paska; nie
    // zależy od tego, czy jedzenie się psuje.
    check(freshBar(dry) === null && freshBar(dry, false) === null && freshBar(makeItem('oak_firewood', 1, 0.9)) === null, 'Suche polano bez paska');
    const bar = freshBar(wet, false);
    check(bar && Math.abs(bar.fresh - 0.6) < 1e-12 && /^hsl\(205,/.test(bar.color) && wetBar(wet).color === bar.color, 'Mokre polano: niebieski pasek także w trybie twórczym');
    check(freshBar(makeItem('oak_firewood', 1, 0.1)).fresh > bar.fresh, 'Im więcej wody, tym dłuższy pasek');
    check(freshBar(makeItem('raspberry', 1, 0.5), false) === null && freshBar(makeItem('raspberry', 1, 0.5), true).color !== bar.color, 'Jedzenie: pasek jak dotąd');

    equal(wetNotes(dry), ['Suche'], 'Opis suchego stosu');
    equal(wetNotes(wet), ['Mokre (60% wody) - teraz zapłon 389°, żar 729°', 'Schnie: przy ognisku albo na stosie (kucnij i kliknij ziemię polanem)'], 'Opis mokrego stosu (od 1.34.0 z podpowiedzią suszenia)');
    equal(wetNotes(makeItem('stick', 1)), [], 'Inne rzeczy bez opisu');
    equal(wetNotes(null), [], 'Bez stosu - bez opisu');
}


// --- Ekwipunek, skrzynia, wytwarzanie -----------------------------------------------------

{
    const inventory = Inventory.load({}, 'adventure');
    for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
    inventory.add('oak_firewood', 4);
    inventory.add('oak_firewood', 4, 0, undefined, 0.4);
    inventory.add('oak_firewood', 2, 0, undefined, 0.45);
    inventory.add('oak_firewood', 3);
    const stacks = inventory.slots.filter(Boolean);
    equal(stacks.map((item) => [item.count, item.fresh === undefined ? 'suche' : Math.round(item.fresh * 1000) / 1000]), [[7, 'suche'], [6, 0.417]], 'Suche i mokre polana leżą w osobnych stosach');
    check(inventory.count('oak_firewood') === 13 && inventory.canAdd('oak_firewood', 64, 0.4), 'Liczą się razem');
    const reloaded = Inventory.load({ inventory: JSON.parse(JSON.stringify({ slots: inventory.slots, selected: 0 })) }, 'adventure');
    equal(reloaded.slots.filter(Boolean), stacks, 'Zapis i odczyt ekwipunku zachowują wilgotność');
    const old = Inventory.load({ inventory: { slots: [{ type: 'oak_firewood', count: 5 }], selected: 0 } }, 'adventure');
    equal(old.slots[0], { type: 'oak_firewood', count: 5 }, 'Polana z dawnego zapisu są suche');

    // Skrzynia.
    const chest = newChest(0, 60, 0);
    insertIntoChest(chest, 'birch_firewood', 5, 0.2);
    insertIntoChest(chest, 'birch_firewood', 5);
    const kept = restoreChest(JSON.parse(JSON.stringify(chest))).layers.flat().filter(Boolean);
    equal(kept, [{ type: 'birch_firewood', count: 5, fresh: 0.2 }, { type: 'birch_firewood', count: 5 }], 'Skrzynia trzyma mokre i suche osobno, także po zapisie');

    // Rąbanie: polano prosto spod siekiery jest mokre.
    for (const wood of ['oak', 'birch', 'pine', 'olive']) {
        const bag = Inventory.load({}, 'adventure');
        for (let i = 0; i < bag.slots.length; i++) bag.set(i, null);
        bag.add(`${wood}_log`, 2); bag.add('axe', 1);
        const recipe = RECIPES.find((entry) => entry.id === fuelType(wood));
        check(fillGrid(bag, recipe, 2) === 2, `${wood}: pnie i siekiera w siatce`);
        const result = gridResult(bag.craft);
        near(result.fresh, 1 - WOOD_TRAITS[wood].fresh, `${wood}: wynik rąbania ma wilgotność gatunku`, 1e-12);
        check(craftAll(bag)[1] === 2, `${wood}: dwa razy`);
        const made = bag.slots.filter((item) => item?.type === fuelType(wood));
        check(made.length === 1 && made[0].count === 8 && Math.abs(wetOf(made[0]) - WOOD_TRAITS[wood].fresh) < 1e-9, `${wood}: 8 świeżych polan w ekwipunku (${Math.round(wetOf(made[0]) * 100)}% wody)`);
    }
    const planks = Inventory.load({}, 'adventure');
    planks.craft[0] = { type: 'oak_log', count: 1 };
    check(gridResult(planks.craft)?.type === 'oak_planks' && gridResult(planks.craft).fresh === undefined, 'Deski nie mają wilgotności');
    const screen = read('src/ui/InventoryScreen.js');
    check(screen.includes('blend(held, result.count, result.fresh) : makeItem(result.type, result.count, result.fresh)') && screen.includes('{ type: result.type, count: result.count, fresh: result.fresh }'), 'Okno wytwarzania: wynik i stos pod kursorem niosą wilgotność');
    check(screen.includes('...wetNotes(item?.type === type ? item : null)') && screen.includes('freshBar(item, Boolean(this.game?.spoilage?.active))'), 'Okno: opis i pasek wilgotności');
    check(read('src/ui/Hotbar.js').includes('freshBar(item, spoiling)') && read('src/ui/ChestView.js').includes('freshBar(item, spoiling)'), 'Pasek i skrzynia: pasek wilgotności');
    check(read('src/game/GameInteraction.js').includes('this.inventory.addItem(drop);'), 'Rozebrane ognisko oddaje stos z jego stanem');
}


// --- Mokre polana w ognisku ---------------------------------------------------------------

const stack = (top, rest = top, wet = 0) => {
    const fire = newCampfire(0, 60, 0);
    for (let i = 0; i < 5; i++) addFirewood(fire, rest, wet);
    addFirewood(fire, top, wet);
    return fire;
};
const hold = (fire, seconds = 20) => {
    for (let t = 0; t < seconds; t += 0.05) { updateCampfire(fire, 0.05, true); if (fire.phase === 'burning') return t + 0.05; }
    return null;
};

{
    const fire = newCampfire(0, 60, 0);
    check(addFirewood(fire, 'oak') && addFirewood(fire, 'oak', 0.6) && addFirewood(fire, 'oak', 5), 'Polana z wilgotnością');
    equal(fire.logs, [{ wood: 'oak', burn: 0 }, { wood: 'oak', burn: 0, wet: 0.6 }, { wood: 'oak', burn: 0, wet: 1 }], 'Suche polano bez pola, mokre z polem (w granicach)');
    near(logIgnite(fire.logs[1]), 320 + 100 * (0.45 / 0.65), 'Zapłon mokrego polana', 1e-9);
    near(logHeat(fire.logs[1]), 920 * (1 - 0.3 * (0.45 / 0.65)), 'Żar mokrego polana', 1e-9);
    check(logIgnite(fire.logs[0]) === 320 && logHeat(fire.logs[0]) === 920 && logIgnite(fire.logs[2]) === 420, 'Suche i całkiem mokre');
    setLogWet(fire.logs[1], 0); setLogWet(fire.logs[2], 0.3);
    equal(fire.logs.slice(1), [{ wood: 'oak', burn: 0 }, { wood: 'oak', burn: 0, wet: 0.3 }], 'setLogWet');

    // Zapłon: świeży dąb potrzebuje kory i dwóch patyków.
    const oak = stack('oak', 'oak', 0.6); addTinder(oak, 'oak_bark');
    check(!canIgnite(oak) && addKindling(oak) && !canIgnite(oak) && addKindling(oak) && canIgnite(oak), 'Świeży dąb: kora i dwa patyki');
    check(hold(oak) !== null, 'i się zajmuje');
    const birch = stack('birch', 'birch', 0.8); addTinder(birch, 'birch_bark');
    check(!canIgnite(birch) && addKindling(birch) && canIgnite(birch), 'Świeża brzoza: kora brzozowa i patyk');
    const mixed = stack('spruce', 'oak', 0.6); mixed.logs.at(-1).wet = 0; addTinder(mixed, 'short_grass');
    check(canIgnite(mixed), 'Suchy świerk na wierzchu mokrego dębowego stosu zajmuje się od trawy');
    const baobab = stack('baobab', 'baobab', 0.95); addTinder(baobab, 'birch_bark'); addKindling(baobab); addKindling(baobab);
    check(!canIgnite(baobab) && hold(baobab, 8) === null && baobab.tinder === 'birch_bark', 'Świeżego baobabu nie rozpali nic - trzeba go wysuszyć');

    // Ogień: mokre polano grzeje słabiej, ale schnie, paląc się.
    const wet = stack('oak', 'oak', 0.6), dry = stack('oak');
    for (const f of [wet, dry]) { f.phase = 'burning'; f.temp = 400; }
    updateCampfire(wet, 30); updateCampfire(dry, 30);
    check(wet.temp < dry.temp - 80 && wet.temp > 600, `Po pół minucie mokry dąb jest chłodniejszy (${wet.temp.toFixed(0)}° i ${dry.temp.toFixed(0)}°)`);
    const top = wet.logs.at(-1);
    check(top.wet < 0.6 && top.wet > 0.4, `Polano z wierzchu schnie, paląc się (${top.wet.toFixed(2)})`);
    near(wet.logs[0].wet, 0.6 - 30 / STACK_DRY_SECONDS, 'Polana pod spodem schną powoli od ciepła', 1e-9);
    updateCampfire(wet, logSeconds('oak') / 2 - 30);
    near(top.wet, DRY_WET + 0.45 * 0.25, 'W połowie palenia zostaje ćwierć nadmiaru wody', 1e-9);
    updateCampfire(wet, logSeconds('oak') / 2 + 1);
    check(wet.logs.length === 5 && !isWet(wet.logs.at(-1).wet ?? 0), 'Zanim przyjdzie kolej na następne polano, jest już suche');
    updateCampfire(wet, 60);
    check(Math.abs(wet.temp - 920) < 8, `Dalej dąb pali się pełnym żarem (${wet.temp.toFixed(0)}°)`);
    check(wet.logs.every((log) => !isWet(log.wet ?? 0)) && wet.logs.slice(0, -1).every((log) => log.wet === undefined), 'Cały stos wysechł w ogniu');

    // Skok czasu i klatki: to samo.
    const a = stack('birch', 'oak', 0.8), b = stack('birch', 'oak', 0.8);
    for (const f of [a, b]) { f.phase = 'burning'; f.temp = 330; }
    updateCampfire(a, 170);
    for (let i = 0; i < 1700; i++) updateCampfire(b, 0.1);
    check(a.logs.length === b.logs.length && a.logs.every((log, i) => Math.abs((log.wet ?? 0) - (b.logs[i].wet ?? 0)) < 1e-6) && Math.abs(a.temp - b.temp) < 1, 'Skok czasu i klatki: ta sama wilgotność i temperatura');

    // Mokre polano dołożone do płonącego ogniska zawsze się zajmie.
    const fed = stack('oak'); fed.phase = 'burning'; fed.temp = 920; updateCampfire(fed, logSeconds('oak') * 5.5);
    check(fed.logs.length === 1 && addFirewood(fed, 'baobab', 0.95), 'Mokry baobab dołożony do ognia');
    updateCampfire(fed, 20);
    check(fed.phase === 'burning' && fed.logs.at(-1).wood === 'baobab' && fed.logs.at(-1).burn > 0 && fed.temp < 700, `Pali się, ale studzi ognisko (${fed.temp.toFixed(0)}°)`);

    // Żar: mokre polano zajmuje się trudniej.
    const embers = restoreCampfire({ x: 0, y: 60, z: 0, ash: true, embers: 300 });
    addFirewood(embers, 'oak', 0.6);
    check(catchesFromEmbers(embers) && logIgnite(embers.logs[0]) < EMBER_TEMP, 'Na gorącym żarze zajmie się i świeży dąb');
    const weak = restoreCampfire({ x: 0, y: 60, z: 0, ash: true, embers: 60 });
    addFirewood(weak, 'oak', 0.6);
    const weakDry = restoreCampfire({ x: 0, y: 60, z: 0, ash: true, embers: 60 });
    addFirewood(weakDry, 'oak');
    check(!catchesFromEmbers(weak) && catchesFromEmbers(weakDry), 'Na stygnącym żarze suchy dąb się zajmie, mokry nie');

    // Zapis i rozbiórka.
    const saved = restoreCampfire(JSON.parse(JSON.stringify(stack('oak', 'oak', 0.6))));
    check(saved.logs.every((log) => log.wet === 0.6), 'Wilgotność polan wraca z zapisu');
    equal(restoreCampfire({ x: 0, y: 60, z: 0, logs: [{ wood: 'oak', burn: 0 }, { wood: 'oak', burn: 0, wet: 'bardzo' }, { wood: 'oak', burn: 0, wet: 7 }] }).logs,
        [{ wood: 'oak', burn: 0 }, { wood: 'oak', burn: 0 }, { wood: 'oak', burn: 0, wet: 1 }], 'Zły zapis wilgotności: w granicach');
    const pile = newCampfire(0, 60, 0);
    addFirewood(pile, 'oak', 0.6); addFirewood(pile, 'oak', 0.2); addFirewood(pile, 'birch'); addFirewood(pile, 'pine', 0.4);
    equal(campfireDrops(pile), [{ type: 'oak_firewood', count: 2, fresh: 0.6 }, { type: 'birch_firewood', count: 1 }, { type: 'pine_firewood', count: 1, fresh: 0.6 }], 'Rozebrany stos oddaje polana ze średnią wilgotnością');
}


// --- Schnięcie ---------------------------------------------------------------------------

{
    equal([15, 35, 100, 0, -20, NaN].map(temperatureDrying), [1, 2, 2, 0.25, 0.2, 1], 'Temperatura: 15° - zwykłe tempo, upał dwa razy szybciej, mróz prawie wcale');
    equal([PLACE.pack, PLACE.chest, PLACE.cellar, PLACE.air, PLACE.sun], [0.3, 0.3, 0.15, 1, 1.5], 'Miejsca');
    near(dryingRate(), DRY_PER_DAY, 'Na powietrzu przy 15°C');
    near(dryingRate({ place: 'pack' }), DRY_PER_DAY * 0.3, 'W plecaku trzy razy wolniej z okładem');
    near(dryingRate({ place: 'sun', temperature: 25 }), DRY_PER_DAY * 1.5 * 1.5, 'Latem w słońcu');
    near(dryingRate({ place: 'air', heat: FIRE_HEAT }), DRY_PER_DAY + FIRE_DRY_PER_DAY, 'Przy ognisku');
    near(dryingRate({ place: 'pack', heat: FIRE_HEAT }), (DRY_PER_DAY + FIRE_DRY_PER_DAY) * 0.3, 'W plecaku przy ognisku');
    check(dryingRate({ place: 'cellar' }) < dryingRate({ place: 'chest' }) && dryingRate({ temperature: -5 }) < dryingRate({ temperature: 5 }), 'Piwniczka i mróz: najwolniej');

    near(driedWet(0.6, 1, {}), 0.25, 'Dąb po dobie na powietrzu');
    check(driedWet(0.6, 1.3, {}) === 0 && driedWet(0.16, 0.05, {}) === 0 && driedWet(0, 1, {}) === 0, 'Poniżej 15% wody polano jest suche');
    near(dryDaysLeft(0.6, {}), 0.45 / 0.35, 'Ile jeszcze poschnie');
    check(dryDaysLeft(0.1, {}) === 0 && dryDaysLeft(0.6, { place: 'pack' }) > 4 && dryDaysLeft(0.6, { heat: FIRE_HEAT }) < 0.12, 'Dąb: w plecaku ponad 4 doby, przy ognisku parę minut');
    near(rainedWet(0, 0.1, 1), 0.3, 'Ulewa moczy');
    check(rainedWet(0, 1, 1) === RAIN_WET && rainedWet(0.8, 1, 1) === 0.8 && rainedWet(0.2, 1, 0) === 0.2 && Math.abs(rainedWet(0, 0.1, 0.5) - 0.15) < 1e-12, 'Deszcz moczy do 60%, mokrzejszego nie rusza');

    // Świat do prób: plecak, skrzynie, leżące polana, ogniska.
    const water = getBlockId('water');
    // (1.43.1) Deszcz zatrzymuje dach - blok nad polanem (roof); słońce
    // dalej liczy się z jasności nieba (sky).
    const planks = getBlockId('oak_planks');
    const make = ({ hour = 12, temperature = 15, rain = 0, sky = () => 15, roof = () => false, liquid = () => false, client = false } = {}) => {
        const notices = [], achieved = [];
        const inventory = Inventory.load({}, 'adventure');
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        const game = { inventory, time: { days: 100 + hour / 24 }, weather: { temperature }, rainNow: rain, player: { pos: { x: 0.5, y: 60, z: 0.5 } },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
            net: client ? { isClient: true } : null,
            world: { getChunk: (cx, cz) => (Math.abs(cx) < 4 && Math.abs(cz) < 4 ? {} : null), toChunkCoord: (v) => Math.floor(v / 16),
                getLight: (x, y, z) => ({ sky: sky(x, y, z) }), getBlockId: (x, y, z) => (liquid(x, y, z) ? water : roof(x, z) && y === 64 ? planks : 0) },
            campfires: { fires: new Map(), version: 0 }, chests: { chests: new Map(), version: 0 }, drops: { drops: new Map(), version: 0 } };
        return { game, drying: new WoodDrying(game), inventory, notices, achieved };
    };
    const drop = (t, x, z, wet, type = 'oak_firewood') => { const entry = setWet({ id: `${x},${z}`, type, count: 4, x, y: 60, z, rest: true }, wet); t.game.drops.drops.set(entry.id, entry); return entry; };

    // Plecak.
    const t = make();
    t.inventory.add('oak_firewood', 8, 0, undefined, 0.4);
    t.inventory.add('raspberry', 4, 0, undefined, 0.5);
    t.inventory.add('oak_firewood', 3);
    t.drying.step(1);
    near(wetOf(t.inventory.slots[0]), 0.6 - 0.105, 'Plecak: doba schnięcia', 1e-9);
    check(t.inventory.slots[1].fresh === 0.5 && t.inventory.slots[2].fresh === undefined && t.notices.length === 0, 'Jedzenia i suchych polan schnięcie nie rusza');
    t.drying.step(3.3);
    check(wetOf(t.inventory.slots[0]) === 0 && t.inventory.slots[0].fresh === undefined, 'Po ponad czterech dobach dąb w plecaku jest suchy');
    equal(t.notices, ['Drewno wyschło: 8 × Opał — dąb'], 'Napis, gdy drewno wyschnie');
    equal(t.achieved, [['woodDried', { count: 8 }]], 'Zdarzenie dla osiągnięć');
    check(t.drying.dried === 8, 'Licznik');
    // Siatka wytwarzania i stos pod kursorem też schną.
    const grid = make();
    grid.inventory.craft[0] = makeItem('birch_firewood', 2, 0.2); grid.inventory.cursor = makeItem('birch_firewood', 2, 0.2);
    grid.drying.step(1);
    check(wetOf(grid.inventory.craft[0]) < 0.8 && wetOf(grid.inventory.cursor) < 0.8, 'Siatka i kursor');

    // Przy ognisku plecak schnie szybko.
    const byFire = make();
    byFire.inventory.add('oak_firewood', 8, 0, undefined, 0.4);
    const burning = newCampfire(1, 60, 0); for (let i = 0; i < 6; i++) addFirewood(burning, 'birch'); burning.phase = 'burning'; burning.temp = 850;
    byFire.game.campfires.fires.set('1,60,0', burning);
    byFire.drying.step(0.3);
    check(wetOf(byFire.inventory.slots[0]) < 0.25 && wetOf(byFire.inventory.slots[0]) > 0, `Przy ognisku plecak schnie szybko (${wetOf(byFire.inventory.slots[0]).toFixed(2)})`);
    byFire.drying.step(0.1);
    check(wetOf(byFire.inventory.slots[0]) === 0, 'i wysycha w kilka minut');

    // Mróz: prawie nie schnie.
    const frost = make({ temperature: -5 });
    frost.inventory.add('oak_firewood', 8, 0, undefined, 0.4);
    frost.drying.step(4);
    check(wetOf(frost.inventory.slots[0]) > 0.5, 'Zimą drewno w plecaku prawie nie schnie');

    // Leżące polana: słońce, cień, noc, deszcz, dach, woda.
    const field = make({ sky: (x) => (x >= 20 ? 0 : 15), liquid: (x) => x === 30 });
    const sunny = drop(field, 5, 5, 0.6), shaded = drop(field, 20, 5, 0.6), soaked = drop(field, 30, 5, 0.2), far = drop(field, 500, 5, 0.6), stick = { id: 's', type: 'stick', count: 1, x: 6, y: 60, z: 6, rest: true };
    field.game.drops.drops.set('s', stick);
    field.drying.step(0.5);
    near(wetOf(sunny), 0.6 - 0.35 * 1.5 * 0.5, 'Na słońcu półtora raza szybciej', 1e-9);
    near(wetOf(shaded), 0.6 - 0.35 * 0.5, 'Pod dachem zwykłe tempo', 1e-9);
    check(wetOf(soaked) === SOAKED, 'W wodzie polano nasiąka');
    near(wetOf(far), 0.6 - 0.35 * temperatureDrying(SEASON_TEMPERATURE[seasonAt(field.game.time.days).index]) * 0.5, 'Poza wczytanym terenem: powietrze i temperatura pory roku', 1e-9);
    check(stick.fresh === undefined, 'Patyk nie ma wilgotności');
    const night = make({ hour: 23 });
    const dark = drop(night, 5, 5, 0.6);
    night.drying.step(0.5);
    near(wetOf(dark), 0.6 - 0.35 * 0.5, 'Nocą słońce nie pomaga', 1e-9);
    const rainy = make({ rain: 0.8, sky: (x) => (x >= 20 ? 0 : 15), roof: (x) => x >= 20 });
    const open = drop(rainy, 5, 5, 0), roofed = drop(rainy, 20, 5, 0.6), wetter = drop(rainy, 6, 9, 0.8);
    rainy.inventory.add('oak_firewood', 4);
    rainy.drying.step(0.1);
    near(wetOf(open), RAIN_PER_DAY * 0.8 * 0.1, 'Deszcz moczy polana pod gołym niebem', 1e-9);
    check(wetOf(roofed) < 0.6 && wetOf(wetter) === 0.8 && rainy.inventory.slots[0].fresh === undefined, 'Pod dachem schną dalej, plecak chroni, mokrzejszych deszcz nie rusza');
    rainy.drying.step(1);
    check(wetOf(open) === RAIN_WET && rainy.game.drops.version > 0, 'Deszcz moczy najwyżej do 60%');
    const drizzle = make({ rain: 0.03 });
    const barely = drop(drizzle, 5, 5, 0.6);
    drizzle.drying.step(0.2);
    check(wetOf(barely) < 0.6, 'Ślad opadu nie przeszkadza w schnięciu');

    // Przy ognisku leżące polana schną w kilka minut; gracz obok dostaje napis.
    const camp = make({ hour: 23 });
    camp.game.campfires.fires.set('1,60,0', burning);
    const close = drop(camp, 3.5, 0.5, 0.6), away = drop(camp, 30.5, 0.5, 0.6);
    camp.drying.step(0.08);
    check(wetOf(close) < 0.35 && wetOf(away) > 0.55, `Dwa bloki od ognia schnie szybko (${wetOf(close).toFixed(2)}), daleko wolno`);
    camp.drying.step(0.08);
    check(wetOf(close) === 0 && close.fresh === undefined && camp.notices.length === 1 && /Drewno wyschło: 4 × Opał — dąb/.test(camp.notices[0]), 'Wyschło przy ogniu - napis dla gracza obok');

    // Skrzynia i piwniczka.
    const store = make({ sky: (x) => (x === 40 ? 0 : 15) });
    const chest = newChest(8, 60, 8), cellar = newChest(40, 59, 8);
    insertIntoChest(chest, 'oak_firewood', 8, 0.4); insertIntoChest(cellar, 'oak_firewood', 8, 0.4);
    store.game.chests.chests.set('a', chest); store.game.chests.chests.set('b', cellar);
    store.drying.step(2);
    near(wetOf(chest.layers[0][0]), 0.6 - 0.35 * 0.3 * 2, 'Skrzynia: wolno', 1e-9);
    near(wetOf(cellar.layers[0][0]), 0.6 - 0.35 * 0.15 * 2, 'Piwniczka: jeszcze wolniej', 1e-9);
    store.drying.step(3);
    check(wetOf(chest.layers[0][0]) === 0 && store.game.chests.version === 1 && wetOf(cellar.layers[0][0]) > 0, 'Skrzynia wysycha pierwsza (zapis)');

    // Zimny stos ogniska: schnie na słońcu, moknie w deszczu; płonącego nie rusza.
    const yard = make();
    const pile = newCampfire(4, 60, 4); for (let i = 0; i < 6; i++) addFirewood(pile, 'oak', 0.6);
    const lit = newCampfire(40, 60, 4); for (let i = 0; i < 6; i++) addFirewood(lit, 'oak', 0.6); lit.phase = 'burning'; lit.temp = 700;
    yard.game.campfires.fires.set('a', pile); yard.game.campfires.fires.set('b', lit);
    yard.drying.step(0.5);
    check(pile.logs.every((log) => Math.abs(log.wet - (0.6 - 0.35 * 1.5 * 0.5)) < 1e-9) && lit.logs.every((log) => log.wet === 0.6), 'Zimny stos schnie na słońcu; płonący liczy ognisko');
    yard.drying.step(0.5);
    check(pile.logs.every((log) => log.wet === undefined) && yard.game.campfires.version === 1, 'Stos wysechł (zapis)');
    yard.game.rainNow = 1;
    yard.drying.step(0.1);
    check(pile.logs.every((log) => Math.abs(log.wet - 0.3) < 1e-9), 'Deszcz moczy stos pod gołym niebem');

    // Gość w grze ze znajomymi liczy tylko swój plecak.
    const guest = make({ client: true });
    guest.inventory.add('oak_firewood', 8, 0, undefined, 0.4);
    const theirs = drop(guest, 5, 5, 0.6);
    guest.drying.step(1);
    check(wetOf(guest.inventory.slots[0]) < 0.6 && wetOf(theirs) === 0.6, 'Gość: swój plecak tak, leżące polana liczy gospodarz');

    // Zegar: krok co kwadrans gry, tempo, przespany czas.
    const clock = make();
    clock.inventory.add('oak_firewood', 8, 0, undefined, 0.4);
    clock.drying.update(DRY_STEP_DAYS * DAY_SECONDS * 0.5);
    check(wetOf(clock.inventory.slots[0]) === 0.6, 'Przed czasem nic się nie liczy');
    clock.drying.update(DRY_STEP_DAYS * DAY_SECONDS * 0.6);
    near(wetOf(clock.inventory.slots[0]), 0.6 - 0.105 * DRY_STEP_DAYS * 1.1, 'Krok po kwadransie gry', 1e-3);
    clock.drying.speed = 100;
    clock.drying.advance(DAY_SECONDS * 0.05);
    check(wetOf(clock.inventory.slots[0]) === 0, 'Tempo i przespany czas');
    const game = read('src/game/Game.js');
    check(/this\.woodDrying = new WoodDrying\(this\)/.test(game) && /this\.woodDrying\.update\(dt\)/.test(game) && /this\.spoilage\.advance\(seconds\);\s+this\.woodDrying\.advance\(seconds\);/.test(game), 'Gra liczy schnięcie co klatkę i przy śnie');
}


// --- Prawdziwe Campfires ------------------------------------------------------------------

{
    const campfire = getBlockId('campfire');
    const setup = (items, fire) => {
        const notices = [], sounds = [], achieved = [];
        const inventory = Inventory.load({}, 'adventure');
        for (let i = 0; i < inventory.slots.length; i++) inventory.set(i, null);
        items.forEach((item, i) => inventory.set(i, item));
        inventory.selected = 0;
        const game = { mode: 'adventure', inventory, sounds: { play: (name) => sounds.push(name) }, swings: 0, swingArm() { this.swings++; },
            onNotice: (text) => notices.push(text), achieve: (name, data) => achieved.push([name, data]),
            playBlockSound: (kind, type) => sounds.push(`${kind}:${type}`), player: { pos: { x: 5, y: 60, z: 5 } },
            world: { getChunk: () => ({}), toChunkCoord: (v) => Math.floor(v / 16), getBlockId: () => campfire },
            get selectedBlock() { return inventory.selectedItem?.type ?? null; },
            currentHit: { hit: true, block: { x: 0, y: 60, z: 0, type: 'campfire' } } };
        const fires = new Campfires(game, []);
        fires.fires.set('0,60,0', fire);
        const click = (slot) => { inventory.selected = slot; fires.noticeAt = -10; return fires.interact(game.currentHit, game.selectedBlock); };
        const run = (seconds, holding = false) => { for (let t = 0; t < seconds; t += 0.1) fires.update(0.1, holding); };
        return { game, fires, fire, inventory, notices, sounds, achieved, click, run, count: (type) => inventory.count(type) };
    };

    const pile = newCampfire(0, 60, 0);
    for (let i = 0; i < 5; i++) addFirewood(pile, 'oak');
    const t = setup([makeItem('oak_firewood', 4, 0.4), makeItem('oak_bark', 2), makeItem('stick', 4), makeItem('fire_starter', 1), null, makeItem('birch_firewood', 4, 0.2)], pile);
    check(t.click(0) && t.fire.logs.length === 6 && Math.abs(t.fire.logs.at(-1).wet - 0.6) < 1e-9 && t.count('oak_firewood') === 3, 'Mokre polano z ręki trafia na stos z wilgotnością');
    t.click(1);
    check(/^Dąb \(mokre drewno\) zajmuje się od 389°, a podpałka daje 280°\. Dołóż patyk jako rozpałkę \(\+60°\) albo zacznij od suchego drewna na wierzchu\.$/.test(t.notices.at(-1)), `Mokre drewno: gra mówi, czego brakuje (${t.notices.at(-1)})`);
    t.click(2);
    check(/Rozpałka z patyków 1\/2\. Dąb \(mokre drewno\) zajmuje się od 389°, a podpałka daje 340°/.test(t.notices.at(-1)), 'Jeden patyk to za mało');
    t.click(2);
    check(/Rozpałka z patyków 2\/2: 400° - wystarczy/.test(t.notices.at(-1)), 'Dwa wystarczą');
    t.inventory.selected = 3; t.run(5.3, true);
    check(t.fire.phase === 'burning', 'Mokry dąb się zajął');
    const lit = t.achieved.find(([name]) => name === 'fireLit')[1];
    check(lit.wood === 'oak' && lit.embers === false && lit.wet > 0.55, 'Zdarzenie niesie wilgotność polana');
    t.run(12);
    t.click(4);
    check(/^Ognisko płonie \(\d+0°, mokre drewno\) - opał 6\/6/.test(t.notices.at(-1)), `Opis: mokre drewno (${t.notices.at(-1)})`);
    check(t.sounds.includes('sizzle'), 'Mokre polano syczy');
    t.run(logSeconds('oak'));
    check(t.fire.logs.length === 5, 'Mokre polano się wypaliło');
    const before = t.sounds.filter((name) => name === 'sizzle').length;
    t.run(10);
    check(t.sounds.filter((name) => name === 'sizzle').length === before, 'Suche drewno nie syczy');
    check(t.click(5) && /Dołożono opał: 6\/6 \(mokre - syczy i dymi, póki nie przeschnie\)/.test(t.notices.at(-1)) && Math.abs(t.fire.logs.at(-1).wet - 0.8) < 1e-9, 'Mokre polano dołożone do ognia');

    // Stos zakładany mokrym polanem; rozbiórka oddaje mokre polana.
    const fresh = setup([makeItem('birch_firewood', 4, 0.2)], newCampfire(9, 60, 9));
    const made = newCampfire(0, 60, 0);
    fresh.fires.fires.set('0,60,0', made);
    fresh.click(0); fresh.click(0);
    check(made.logs.length === 2 && made.logs.every((log) => Math.abs(log.wet - 0.8) < 1e-9), 'Kolejne mokre polana');
    equal(fresh.fires.drops({ x: 0, y: 60, z: 0 }), [{ type: 'birch_firewood', count: 2, fresh: 0.2 }], 'Rozebrany stos oddaje mokre polana');
    check(/addFirewood\(fire, wood, wet\); this\.fires\.set/.test(read('src/game/Campfires.js')), 'Nowe ognisko: pierwsze polano z wilgotnością');
}


// --- Osiągnięcia, komendy, poradnik, obraz -------------------------------------------------

{
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const seasoned = byId.seasoned_wood, hiss = byId.wet_wood_fire;
    check(seasoned && hiss && [seasoned, hiss].every((entry) => itemExists(entry.icon) && entry.task.length > 20 && entry.comment.length > 10), 'Dwa osiągnięcia: suszenie i mokry ogień');
    check(seasoned.on === 'woodDried' && seasoned.when === undefined, 'Sezonowane: za wysuszenie');
    check(hiss.on === 'fireLit' && hiss.when({ wood: 'oak', embers: false, wet: 0.6 }) && !hiss.when({ wood: 'oak', embers: false, wet: 0.1 }) && !hiss.when({ wood: 'oak', embers: true, wet: 0.6 }) && !hiss.when({ wood: 'oak', embers: false }), 'Syczy, ale płonie: mokre polano, nie od żaru');

    const commands = read('src/commands/worldCommands.js'), commandsDoc = read('docs/komendy.md');
    check(['/drewno swieze', '/drewno mokre', '/drewno schniecie', '/drewno tempo'].every((text) => commands.includes(text) && commandsDoc.includes(text)) && commandsDoc.includes('zimne\\|mokre\\|zar'), 'Komendy wilgotności są w grze i w opisie');
    const renderer = read('src/rendering/CampfireRenderer.js');
    check(/wetFactor\(top\.wet \?\? 0\)/.test(renderer) && /2\.5\*damp/.test(renderer), 'Obraz: mokre polano dymi gęsto i biało');
    check(/log\.wood \+ Math\.round\(\(log\.wet \?\? 0\) \* 4\)/.test(read('src/net/StateSync.js')), 'Gra ze znajomymi: wilgotność polan w podpisie ogniska');

    const chapter = GUIDE.find((entry) => entry.id === 'fire').lines.map((line) => (typeof line === 'string' ? line : line.text)).join(' ');
    check(/prosto spod siekiery są mokre \(niebieski pasek/.test(chapter) && /przy płonącym ognisku w kilka minut/.test(chapter) && /Deszcz moczy polana/.test(chapter) && /syczy i dymi na biało/.test(chapter), 'Poradnik: mokre drewno, schnięcie, deszcz');
    const step = (id) => TUTORIAL_STEPS.find((entry) => entry.id === id);
    check(/Mokre albo twarde drewno potrzebuje jeszcze rozpałki - dołóż patyk albo dwa/.test(step('fire').text) && /Mokre albo twarde drewno/.test(step('fire').touch) && /Świeże polana są mokre \(niebieski pasek\)/.test(step('campfire').hint), 'Samouczek: mokre drewno');
    const docs = read('docs/ogniska.md');
    check(/## Wilgotność drewna \(1\.33\.0\)/.test(docs) && /niebieski pasek/.test(docs) && /\/drewno schniecie/.test(docs), 'docs/ogniska.md opisuje wilgotność');
}

console.log(`OK: wilgotność drewna - ${checks} sprawdzeń (zasady, stos polan, ekwipunek i wytwarzanie, mokre polana w ognisku, schnięcie, prawdziwe ognisko, osiągnięcia, komendy, poradnik).`);
