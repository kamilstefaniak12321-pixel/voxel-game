// ------------------------------------------------------------
// SPRAWDZENIE WYRZUCANIA PRZEDMIOTÓW (0.100.0)
//
// - wyrzucenie z ręki (jedna sztuka, cały stos), lot, lądowanie, ściana,
//   woda, niewczytany teren, blok wykopany spod leżącego przedmiotu,
// - podnoszenie: nie od razu po wyrzuceniu, tyle, ile się zmieści,
//   nie we śnie,
// - łączenie leżących stosów, limit liczby przedmiotów,
// - zapis i odczyt, uszkodzone wpisy,
// - gra ze znajomymi: wpisy po nazwie w StateSync,
// - klawisz do przypisania i połączenie z grą.
//
// Uruchomienie: node tools/sprawdz_wyrzucanie.mjs
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

const { Drops, restoreDrop, dropState, DROP_PICKUP_RADIUS, DROP_THROW_WAIT, DROP_WAIT, DROP_LIMIT, DROP_MERGE_RADIUS } = await import('../src/game/Drops.js');
const { Inventory, STACK_SIZE, SLOT_COUNT } = await import('../src/game/Inventory.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { StateSync, entryKey, stateSystems } = await import('../src/net/StateSync.js');
const { WorldSaver } = await import('../src/storage/WorldSaver.js');
const { ACTIONS, Bindings } = await import('../src/input/bindings.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Płaski świat: ziemia do wysokości 10 (wierzch na y = 11), reszta - powietrze.
function makeGame({ walls = [], water = [], loaded = true } = {}) {
    const removed = new Set();
    const key = (x, y, z) => `${x},${y},${z}`;
    const achieved = [];
    const game = {
        world: {
            isSolid: (x, y, z) => !removed.has(key(x, y, z)) && (y <= 10 || walls.some((w) => w[0] === x && w[1] === y && w[2] === z)),
            getBlockId: (x, y, z) => (water.some((w) => w[0] === x && w[1] === y && w[2] === z) ? getBlockId('water') : 0),
            getChunk: () => (game.loaded ? {} : null),
            toChunkCoord: (value) => Math.floor(value / 16)
        },
        loaded,
        remove: (x, y, z) => removed.add(key(x, y, z)),
        player: { pos: { x: 0.5, y: 11, z: 0.5 }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, eyeHeight: 1.6 },
        inventory: Inventory.load({}, 'adventure'),
        sleep: { active: false },
        blackout: { active: false },
        achieve: (name, data) => achieved.push([name, data]),
        achieved
    };
    game.drops = new Drops(game);
    return game;
}
function run(game, seconds, dt = 0.05) {
    for (let t = 0; t < seconds - 1e-9; t += dt) game.drops.update(dt);
}
const only = (game) => [...game.drops.drops.values()];


// --- Wyrzucenie z ręki ------------------------------------------------------------

{
    const game = makeGame();
    check(game.drops.throwSelected() === false && game.drops.drops.size === 0, 'Pusta ręka - nie ma czego wyrzucić');
    game.inventory.add('stone', 20);
    const version = game.drops.version;
    check(game.drops.throwSelected() === true, 'Wyrzucenie jednej sztuki');
    check(game.inventory.selectedItem.count === 19 && game.drops.drops.size === 1 && only(game)[0].count === 1 && only(game)[0].type === 'stone', 'Jedna sztuka z ręki jest w świecie');
    check(game.drops.version > version && game.achieved.at(-1)[0] === 'dropped', 'Zmiana do zapisu i zdarzenie');
    const drop = only(game)[0];
    check(drop.vz < -3 && drop.vy > 1 && Math.abs(drop.vx) < 1e-6 && drop.y > 12 && drop.wait === DROP_THROW_WAIT, 'Leci przed siebie (yaw 0: na -z), z wysokości oczu');
    run(game, 3);
    check(drop.rest && drop.y === 11 && drop.vx === 0 && drop.vy === 0 && drop.vz === 0, 'Ląduje na wierzchu bloku i leży');
    check(drop.z < -1.5 && drop.z > -6, `Upada parę kroków dalej (${drop.z.toFixed(2)})`);
    check(game.drops.drops.size === 1 && game.inventory.selectedItem.count === 19, 'Sam z siebie nie wraca do ekwipunku');

    // Cały stos (kucanie + klawisz).
    check(game.drops.throwSelected(true) && game.inventory.selectedItem === null, 'Cały stos naraz');
    run(game, 3);
    check(game.drops.drops.size === 1 && only(game)[0].count === 20, 'Takie same przedmioty obok siebie łączą się w jeden stos');

    // Patrząc w górę i w bok.
    const up = makeGame();
    up.inventory.add('stick', 1);
    up.player.yaw = Math.PI / 2; up.player.pitch = 0.6;
    up.drops.throwSelected();
    const flying = only(up)[0];
    check(flying.vx < -3 && Math.abs(flying.vz) < 1e-6 && flying.vy > 4, 'Kierunek rzutu idzie za wzrokiem');
}


// --- Podnoszenie ------------------------------------------------------------------

{
    const game = makeGame();
    const drop = game.drops.spawn('oak_log', 5, { x: 0.5, y: 11, z: 0.5 }, null, DROP_THROW_WAIT);
    run(game, DROP_THROW_WAIT - 0.2);
    check(game.drops.drops.has(drop.id) && game.inventory.count('oak_log') === 0, 'Wyrzucony przedmiot nie wraca od razu do ręki');
    run(game, 0.5);
    check(!game.drops.drops.has(drop.id) && game.inventory.count('oak_log') === 5 && game.achieved.at(-1)[0] === 'pickedUp', 'Po chwili gracz go podnosi');

    // Zasięg.
    const far = game.drops.spawn('stone', 1, { x: 0.5 + DROP_PICKUP_RADIUS + 0.6, y: 11, z: 0.5 });
    run(game, 1.5);
    check(game.drops.drops.has(far.id), 'Za daleko - leży');
    game.player.pos.x += 0.8;
    run(game, 0.2);
    check(!game.drops.drops.has(far.id) && game.inventory.count('stone') === 1, 'Wejście na przedmiot go podnosi');

    // Pełny ekwipunek: tyle, ile się zmieści; reszta zostaje.
    const full = makeGame();
    for (let i = 0; i < SLOT_COUNT; i++) full.inventory.set(i, { type: 'dirt', count: STACK_SIZE });
    const stays = full.drops.spawn('stone', 3, { x: 0.5, y: 11, z: 0.5 });
    run(full, 1.5);
    check(full.drops.drops.has(stays.id) && stays.count === 3, 'Pełny ekwipunek - przedmiot zostaje na ziemi');
    full.inventory.set(4, { type: 'stone', count: STACK_SIZE - 2 });
    run(full, 0.2);
    check(stays.count === 1 && full.inventory.get(4).count === STACK_SIZE, 'Mieści się część - reszta zostaje');

    // Śpiący i nieprzytomny niczego nie podnosi.
    const asleep = makeGame();
    asleep.sleep.active = true;
    const near = asleep.drops.spawn('stone', 1, { x: 0.5, y: 11, z: 0.5 });
    run(asleep, 1.5);
    check(asleep.drops.drops.has(near.id), 'We śnie nic się nie podnosi');
    asleep.sleep.active = false;
    run(asleep, 0.2);
    check(!asleep.drops.drops.has(near.id), 'Po pobudce - tak');
}


// --- Lot: ściana, woda, niewczytany teren, wykopany blok --------------------------

{
    // Ściana dwa bloki przed graczem (z = -3), wysoka.
    const walls = [];
    for (let y = 11; y < 16; y++) for (let x = -2; x <= 2; x++) walls.push([x, y, -3]);
    const game = makeGame({ walls });
    game.inventory.add('stone', 1);
    game.drops.throwSelected();
    run(game, 3);
    const drop = only(game)[0];
    check(drop.rest && drop.z > -2 && drop.z < 0.5 && drop.y === 11, `Ściana zatrzymuje rzut (${drop.z.toFixed(2)})`);

    // Nos przy samej ścianie: przedmiot nie utyka w bloku.
    const close = makeGame({ walls });
    close.player.pos.z = -1.9;
    close.inventory.add('stone', 1);
    close.drops.throwSelected();
    const stuck = only(close)[0];
    check(!close.drops.solid(stuck.x, stuck.y, stuck.z), 'Rzut twarzą przy ścianie zaczyna się poza blokiem');
    run(close, 3);
    check(stuck.rest && stuck.y === 11 && stuck.z > -2, 'I ląduje przed ścianą');

    // Niewczytany teren: przedmiot czeka, nie spada przez ziemię.
    const waiting = makeGame({ loaded: false });
    const held = waiting.drops.spawn('stone', 1, { x: 40.5, y: 30, z: 0.5 });
    run(waiting, 2);
    check(held.y === 30 && !held.rest, 'W niewczytanym terenie przedmiot czeka w miejscu');
    waiting.loaded = true;
    run(waiting, 3);
    check(held.rest && held.y === 11, 'Po wczytaniu spada na ziemię');

    // Wykopany blok pod leżącym przedmiotem: spada niżej.
    const dug = makeGame();
    const lying = dug.drops.spawn('stone', 1, { x: 5.5, y: 11, z: 5.5 });
    run(dug, 1);
    check(lying.rest, 'Leży');
    dug.remove(5, 10, 5);
    run(dug, 2);
    check(lying.rest && lying.y === 10, 'Po wykopaniu bloku spada o jeden niżej');

    // Woda hamuje.
    const water = [];
    for (let y = 11; y < 20; y++) water.push([8, y, 8]);
    const pond = makeGame({ water });
    const wet = pond.drops.spawn('stone', 1, { x: 8.5, y: 19, z: 8.5 });
    const dry = pond.drops.spawn('oak_log', 1, { x: 3.5, y: 19, z: 8.5 });
    run(pond, 1);
    check(dry.rest && !wet.rest && wet.y > 15 && wet.vy >= -1.2 - 1e-9, 'W wodzie przedmiot opada powoli');
    run(pond, 12);
    check(wet.rest && wet.y === 11, 'I w końcu leży na dnie');
}


// --- Łączenie i limit ----------------------------------------------------------------

{
    const game = makeGame();
    game.player.pos.x = 100;
    const a = game.drops.spawn('stone', 10, { x: 5.5, y: 11, z: 5.5 });
    const b = game.drops.spawn('stone', 7, { x: 5.5 + DROP_MERGE_RADIUS * 0.8, y: 11, z: 5.5 });
    const c = game.drops.spawn('oak_log', 2, { x: 5.6, y: 11, z: 5.6 });
    const d = game.drops.spawn('stone', 4, { x: 5.5 + DROP_MERGE_RADIUS * 3, y: 11, z: 5.5 });
    run(game, 2);
    check(game.drops.drops.size === 3 && a.count === 17 && !game.drops.drops.has(b.id), 'Dwa stosy tego samego obok siebie - jeden');
    check(game.drops.drops.has(c.id) && c.count === 2 && game.drops.drops.has(d.id), 'Inny przedmiot i daleki stos zostają osobno');
    const big = game.drops.spawn('stone', STACK_SIZE - 5, { x: 5.5, y: 11, z: 5.5 });
    run(game, 2);
    check(game.drops.drops.has(big.id) && a.count === 17, 'Stosy nie łączą się ponad pełny stos');

    const many = makeGame();
    many.player.pos.x = 1000;
    const first = many.drops.spawn('stone', 1, { x: 0.5, y: 11, z: 0.5 });
    for (let i = 0; i < DROP_LIMIT + 4; i++) many.drops.spawn(i % 2 ? 'dirt' : 'sand', 1, { x: 0.5 + i * 2, y: 11, z: 20.5 });
    check(many.drops.drops.size === DROP_LIMIT && !many.drops.drops.has(first.id), `Najwyżej ${DROP_LIMIT} przedmiotów - znikają najstarsze`);
    check(many.drops.spawn('nie_ma_takiego', 1, { x: 0, y: 11, z: 0 }) === null && many.drops.spawn('stone', 0, { x: 0, y: 11, z: 0 }) === null, 'Nieznany przedmiot albo zero sztuk - nic');
}


// --- Zapis i odczyt ---------------------------------------------------------------------

{
    const game = makeGame();
    game.player.pos.x = 100;
    game.drops.spawn('stone', 12, { x: 5.5, y: 11, z: 5.5 });
    game.drops.spawn('knife_granite', 1, { x: -3.25, y: 14.5, z: 2.75 }, { x: 1, y: 2, z: 3 });
    run(game, 0.05);
    const state = JSON.parse(JSON.stringify(game.drops.getState()));
    check(state.length === 2 && state[0].type === 'stone' && state[0].count === 12 && typeof state[0].id === 'string', 'Stan do zapisu');
    const loaded = makeGame();
    loaded.player.pos.x = 100;
    loaded.drops = new Drops(loaded, state);
    check(loaded.drops.drops.size === 2 && [...loaded.drops.drops.keys()].join() === state.map((entry) => entry.id).join(), 'Wczytane wpisy mają te same nazwy');
    run(loaded, 3);
    check([...loaded.drops.drops.values()].every((drop) => drop.rest && drop.y === 11), 'Wczytany przedmiot w locie ląduje');

    for (const broken of [null, 5, 'stone', {}, { type: 'stone' }, { type: 'stone', count: 0, x: 0, y: 11, z: 0 }, { type: 'nic', count: 1, x: 0, y: 11, z: 0 },
        { type: 'stone', count: 1, x: NaN, y: 11, z: 0 }, { type: 'stone', count: 1, x: 0, y: 99999, z: 0 }, { type: 'stone', count: 1, x: 9e9, y: 11, z: 0 }]) {
        check(restoreDrop(broken) === null, `Uszkodzony wpis odrzucony: ${JSON.stringify(broken)}`);
    }
    const fixed = restoreDrop({ type: 'stone', count: 99999, x: 1, y: 11, z: 1, id: '<zła nazwa>', vx: 'x' });
    check(fixed.count === STACK_SIZE * 4 && /^[a-z0-9]{4,32}$/.test(fixed.id) && fixed.vx === 0 && fixed.wait === DROP_WAIT, 'Za duży stos, zła nazwa i prędkość - naprawione');
    check(new Drops(makeGame(), 'śmieci').drops.size === 0 && new Drops(makeGame(), [null, { type: 'stone', count: 2, x: 0, y: 11, z: 0 }]).drops.size === 1, 'Uszkodzona lista w zapisie niczego nie psuje');
    check(restoreDrop({ type: 'raspberry', count: 1, x: 0, y: 11, z: 0 })?.type === 'strawberry', 'Stara nazwa przedmiotu z dawnego zapisu');
    let savedDrops;
    const saver = new WorldSaver({
        async saveWorldAndChunks(info) { savedDrops = structuredClone(info.drops); }
    }, {}, { takeUnsavedChunks: () => [] }, { getState: () => ({}) });
    saver.drops = game.drops;
    check(await saver.flush() && !saver.hasUnsavedChanges(), 'Zapis świata obejmuje wyrzucone przedmioty');
    assert.deepEqual(savedDrops, game.drops.getState());
    game.drops.spawn('stone', 1, { x: 8, y: 12, z: 2 });
    check(saver.hasUnsavedChanges(), 'Wyrzucenie kolejnego przedmiotu wymaga nowego zapisu');
}


// --- Gra ze znajomymi ----------------------------------------------------------------------

{
    const host = makeGame(), guest = makeGame();
    for (const game of [host, guest]) {
        game.player.pos.x = 100;
        game.chests = { chests: new Map(), version: 0, changed() { this.version++; } };
        game.carpenterTables = { tables: new Map(), version: 0 };
        game.campfires = { fires: new Map(), version: 0 };
    }
    const toGuest = [], toHost = [];
    const hostSync = new StateSync(host, (sys, key, value) => toGuest.push([sys, key, value]));
    const guestSync = new StateSync(guest, (sys, key, value) => toHost.push([sys, key, value]));
    const drop = host.drops.spawn('stone', 3, { x: 5.5, y: 11, z: 5.5 });
    hostSync.update(0.3);
    check(toGuest.length === 1 && toGuest[0][0] === 'drops' && toGuest[0][1] === drop.id && toGuest[0][2].count === 3, 'Nowy przedmiot wysłany pod swoją nazwą');
    check(entryKey(stateSystems(host).drops, drop) === drop.id && entryKey(stateSystems(host).fires, { x: 1, y: 2, z: 3 }) === '1,2,3', 'Nazwa wpisu: własna albo pozycja bloku');
    check(guestSync.apply(...toGuest[0]) && guest.drops.drops.get(drop.id)?.count === 3, 'Gość widzi ten sam przedmiot');
    guestSync.update(0.3);
    check(toHost.length === 0, 'Odebrany wpis nie wraca do nadawcy');
    run(host, 1); hostSync.update(0.3);
    check(toGuest.length === 1, 'Samo leżenie niczego nie wysyła');
    // Gość podnosi: wpis znika u obu.
    guest.clockSkip = true;
    guestSync.clock += 5;
    guest.player.pos.x = 5.5; guest.player.pos.z = 5.5;
    run(guest, 1);
    check(!guest.drops.drops.has(drop.id) && guest.inventory.count('stone') === 3, 'Gość podniósł');
    guestSync.update(0.3);
    check(toHost.length === 1 && toHost[0][1] === drop.id && toHost[0][2] === null, 'Usunięcie wysłane');
    check(hostSync.apply(...toHost[0]) && !host.drops.drops.has(drop.id), 'U gospodarza przedmiot też znika');
    check(guestSync.apply('drops', 'abcd1234', { id: 'inna0000', type: 'stone', count: 1, x: 0, y: 11, z: 0 }) === false, 'Wpis z inną nazwą niż klucz - odrzucony');
    check(/drops: this\.state\.snapshot\('drops'\)/.test(source('src/net/NetHost.js')), 'Gość dostaje leżące przedmioty przy wejściu');
}


// --- Klawisz i połączenie z grą -------------------------------------------------------------

{
    const action = ACTIONS.find((entry) => entry.id === 'drop');
    check(action?.code === 'KeyQ' && action.group === 'hands' && new Bindings().format('[drop]') === 'Q', 'Wyrzucanie: klawisz Q, do przypisania');
    const game = source('src/game/Game.js');
    check(/consumeKeyPress\('KeyQ'\)/.test(game) && /this\.drops\.throwSelected\(this\.player\.crouching\)/.test(game), 'Q wyrzuca sztukę, z kucaniem - stos');
    check(/this\.drops\.update\(dt\)/.test(game) && /this\.drops\.dispose\(\)/.test(game) && /this\.saver\.drops = this\.drops/.test(game), 'Gra aktualizuje, zapisuje i sprząta przedmioty');
    const inventory = source('src/ui/InventoryScreen.js');
    check(/code === 'KeyQ'/.test(inventory) && /this\.throwCursor\(right \? 1 : this\.cursor\.count\)/.test(inventory), 'Ekwipunek: Q nad miejscem i klik obok okna');
    const renderer = source('src/rendering/DropRenderer.js');
    check(/buildBlockGeometry\(type\)/.test(renderer), 'Model leżącego przedmiotu - ten sam co w dłoni');
    check(typeof dropState({ id: 'abcd', type: 'stone', count: 1, x: 1.23456, y: 2, z: 3, vx: 0, vy: 0, vz: 0, rest: true }).x === 'number', 'Stan wpisu');
}

console.log(`OK: wyrzucanie przedmiotów - ${checks} sprawdzeń (rzut, lądowanie, podnoszenie, łączenie, zapis, gra ze znajomymi).`);
