// ------------------------------------------------------------
// SPRAWDZENIE POPRAWEK 1.10.2 (osiem błędów z przeglądu kodu)
//
// 1. Pauza w aplikacji na Androida (bez gry ze znajomymi) nie czyta roli
//    sieciowej z null.
// 2. Gra wieloosobowa: zmiana wpisu w czasie "dzierżawy" po cudzej zmianie
//    czeka i wychodzi po jej upływie, zamiast przepaść.
// 3. Stolarstwo: partia wyrobu w całości albo wcale.
// 4. Mapa lasów: kolor dla każdego gatunku z biomów (i zapas na nieznany).
// 5. Miejsce startu: sąsiednie kolumny naprawdę w zasięgu 1 bloku.
// 6. Podpowiedzi /ustaw dla ustawień bez zakresu.
// 7. /ustaw przyjmuje wszystkie słowne wartości z list wyboru.
// 8. "Komplet narzędzi": siekiera, kilof i łopata.
//
// Uruchomienie: node tools/sprawdz_poprawki_1102.mjs
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
                export const blockAtlasTexture=null, atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false});
                export const atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[], getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
                export const ATLAS_TILE_SIZE=16, atlasTileSize=16, atlasUploadedAt=null, ATLAS_UV_INSET=1/16, PLANT_ATLAS_ROW=2;
                export const atlasImage=Promise.resolve(null), getTileMask=()=>null, loadPackImage=async()=>null;
            `
        };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

// Ustawienia zapisują się do localStorage - w teście wystarczy pamięć.
globalThis.localStorage = { data: new Map(), getItem(key) { return this.data.get(key) ?? null; }, setItem(key, value) { this.data.set(key, String(value)); }, removeItem(key) { this.data.delete(key); } };

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');


// --- 1. Pauza bez gry ze znajomymi -------------------------------------------------

{
    const menu = source('src/ui/Menu.js');
    const pause = menu.slice(menu.indexOf('    showPause(hint'), menu.indexOf('    showPause(hint') + 4000)
        .split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    check(!/[^?]\bnet\.role\b/.test(pause.replaceAll('net?.role', '')), 'Pauza nie czyta net.role bez sprawdzenia, czy sesja istnieje');
    check(pause.includes("else if (net?.role === 'host')") && pause.includes('else if (net) {'), 'Gałęzie gospodarza i gościa tylko przy istniejącej sesji');
    check(source('src/main.js').includes("openToFriends: nativeApp === 'android' ? null : openToFriends"), 'Android: bez otwierania świata dla znajomych (stąd przypadek bez sesji i bez przycisku)');
}


// --- 2. Gra wieloosobowa: zmiana w czasie dzierżawy ----------------------------------

{
    const { StateSync } = await import('../src/net/StateSync.js');
    const tables = new Map();
    const game = { chests: { chests: new Map(), changed() {} }, carpenterTables: { tables, version: 0 },
        campfires: { fires: new Map(), version: 0 }, drops: { drops: new Map(), changed() {} } };
    const out = [];
    const sync = new StateSync(game, (name, key, value) => out.push([name, key, value && { ...value }]));
    const tick = (seconds) => { for (let t = 0; t < seconds - 1e-9; t += 0.1) sync.update(0.1); };
    const key = '4,60,-2';

    // Ktoś inny kładzie deski; chwilę później (w ciągu 1,2 s) my dokładamy.
    check(sync.apply('tables', key, { x: 4, y: 60, z: -2, planks: 'oak_planks', count: 3 }), 'Cudza zmiana przyjęta');
    tick(0.3);
    equal(out, [], 'Cudzej zmiany nie odsyłamy');
    tables.get(key).count = 7;
    tick(0.4);
    equal(out, [], 'W czasie dzierżawy nasza zmiana czeka');
    tick(1.2);
    equal(out, [['tables', key, { x: 4, y: 60, z: -2, planks: 'oak_planks', count: 7 }]], 'Po dzierżawie zmiana wychodzi (do 1.10.1 przepadała)');
    tick(1);
    equal(out.length, 1, 'I tylko raz');

    // To samo z usunięciem wpisu.
    out.length = 0;
    sync.apply('tables', key, { x: 4, y: 60, z: -2, planks: 'oak_planks', count: 9 });
    tick(0.2);
    tables.delete(key);
    tick(0.4);
    equal(out, [], 'Usunięcie w czasie dzierżawy czeka');
    tick(1.2);
    equal(out, [['tables', key, null]], 'Po dzierżawie usunięcie wychodzi');

    // Zmiana, którą w czasie dzierżawy nadpisała kolejna cudza - nie ma czego wysyłać.
    out.length = 0;
    sync.apply('tables', key, { x: 4, y: 60, z: -2, planks: 'oak_planks', count: 2 });
    tables.get(key).count = 5;
    tick(0.4);
    sync.apply('tables', key, { x: 4, y: 60, z: -2, planks: 'oak_planks', count: 6 });
    tick(2);
    equal(out, [], 'Stan zgodny z ostatnią cudzą zmianą nie jest odsyłany');

    // Zwykła własna zmiana bez dzierżawy - od razu.
    tables.set('1,1,1', { x: 1, y: 1, z: 1, planks: 'birch_planks', count: 1 });
    tick(0.3);
    equal(out.length, 1, 'Własny nowy wpis wychodzi przy najbliższym sprawdzeniu');
}


// --- 3. Stolarstwo: cała partia albo nic ----------------------------------------------

{
    const { CarpenterTables } = await import('../src/game/CarpenterTables.js');
    const { Inventory, SLOT_COUNT } = await import('../src/game/Inventory.js');
    const { TABLE_PRODUCTS } = await import('../src/crafting/carpentry.js');
    const { shapeBaseType } = await import('../src/blocks/woodShapes.js');
    const slab = TABLE_PRODUCTS.find((product) => product.kind === 'slab');
    check(slab && slab.count === 2 && slab.planks === 1, 'Półbloki: dwa z jednej deski');
    const type = shapeBaseType('oak', 'slab');
    const setup = (room) => {
        // Wszystko zajęte kamieniem, jedno miejsce z prawie pełnym stosem półbloków.
        const slots = Array.from({ length: SLOT_COUNT }, () => ({ type: 'stone', count: 64 }));
        slots[5] = { type, count: 64 - room };
        const inventory = new Inventory({ slots, selected: 0, craft: [null, null, null, null], cursor: null });
        const notices = [];
        const game = { inventory, world: null, onNotice: (text) => notices.push(text) };
        const tables = new CarpenterTables(game);
        const table = { x: 0, y: 0, z: 0, planks: 'oak_planks', count: 10 };
        return { inventory, tables, table, notices };
    };
    {
        const { inventory, tables, table, notices } = setup(1);
        tables.make(table, slab, false, { x: 0, y: 0, z: 0 });
        equal([table.count, inventory.slots[5].count], [10, 63], 'Miejsce na jeden półblok: deska zostaje na stole, nic nie przepada');
        equal(notices, ['Ekwipunek pełny'], 'Gracz dostaje wyjaśnienie');
    }
    {
        const { inventory, tables, table } = setup(2);
        tables.make(table, slab, false, { x: 0, y: 0, z: 0 });
        equal([table.count, inventory.slots[5].count], [9, 64], 'Miejsce na dwa: jedna deska, dwa półbloki');
    }
    {
        const { inventory, tables, table } = setup(5);
        tables.make(table, slab, true, { x: 0, y: 0, z: 0 });
        equal([table.count, inventory.slots[5].count], [8, 63], 'Z kucaniem: tyle pełnych partii, ile się mieści (2 deski -> 4 półbloki)');
    }
}


// --- 4. Mapa lasów -----------------------------------------------------------------------

{
    const { FOREST_COLORS, forestColor } = await import('../src/ui/TerrainMap.js');
    const { BIOMES } = await import('../src/world/terrain/Biomes.js');
    const species = new Set(Object.values(BIOMES).flatMap((biome) => Object.keys(biome.trees ?? {})));
    check(species.size >= 18, `Gatunki w biomach: ${species.size}`);
    for (const name of species) {
        check(FOREST_COLORS[name], `${name}: ma kolor na mapie lasów`);
        check(/^#[0-9a-f]{6}$/.test(forestColor(name)[0]) && forestColor(name)[1].length > 2, `${name}: kolor i nazwa`);
    }
    for (const name of ['maple', 'sequoia', 'rainbow_eucalyptus', 'olive', 'mugo']) check(species.has(name) && FOREST_COLORS[name], `${name}: gatunek z listy błędów`);
    equal(new Set(Object.values(FOREST_COLORS).map(([color]) => color)).size, Object.keys(FOREST_COLORS).length, 'Kolory gatunków się nie powtarzają');
    equal(forestColor('nowe_drzewo'), ['#5f8f5a', 'nowe drzewo'], 'Nieznany gatunek nie wywraca mapy');
    const map = source('src/ui/TerrainMap.js');
    check(!/FOREST_COLORS\[[a-z.]*species\]\[/.test(map), 'Mapa nie sięga do tabeli kolorów bez zapasu');
}


// --- 5. Miejsce startu ----------------------------------------------------------------------

{
    const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
    const { WORLD_SPAWN_X, WORLD_SPAWN_Z } = await import('../src/config.js');
    let moved = 0;
    for (const seed of [1, 7, 42, 2024, 99991, 644734948, 123456789, 31337, 5, 777]) {
        const generator = new RealisticGenerator(seed);
        const spawn = generator.findSpawn(WORLD_SPAWN_X, WORLD_SPAWN_Z);
        const height = generator.compute(spawn.x, spawn.z).height;
        const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => Math.abs(generator.compute(spawn.x + dx, spawn.z + dz).height - height));
        check(Math.max(...steps) <= 1, `Ziarno ${seed}: sąsiednie kolumny miejsca startu w zasięgu 1 bloku (${steps.map((v) => v.toFixed(2))})`);
        // Miejsce, które przepuściłby dawny warunek (zawsze "płaskie").
        if (spawn.x !== WORLD_SPAWN_X || spawn.z !== WORLD_SPAWN_Z) moved++;
    }
    check(moved >= 1, 'Szukanie naprawdę przesuwa start, gdy trzeba');
    check(/const height = sample\.height;[\s\S]{0,200}- height\) <= 1/.test(source('src/world/terrain/RealisticGenerator.js')), 'Wysokość środka zapamiętana przed pytaniem o sąsiadów');
}


// --- 6 i 7. Komenda /ustaw ----------------------------------------------------------------------

{
    const { SETTINGS_COMMANDS, SETTING_WORDS } = await import('../src/commands/settingsCommands.js');
    const { Settings, SETTINGS_CHOICES, SETTINGS_DEFAULTS } = await import('../src/settings/Settings.js');
    const command = SETTINGS_COMMANDS.find((entry) => entry.name === 'ustaw');
    for (const word of Object.keys(SETTING_WORDS)) {
        let result;
        assert.doesNotThrow(() => { result = command.complete([word, '']); }, `Podpowiedź /ustaw ${word} nie rzuca wyjątku`);
        check(Array.isArray(result) && result.every((entry) => typeof entry === 'string'), `/ustaw ${word}: podpowiedzi to lista słów`);
    }
    equal(command.complete(['imie', '']), [], '/ustaw imie: nic do podpowiedzenia');
    equal(command.complete(['serwer', '']), [], '/ustaw serwer: nic do podpowiedzenia');
    equal(command.complete(['klawisze', '']), ['domyslne'], '/ustaw klawisze: tylko powrót do domyślnych');

    const settings = new Settings();
    const game = { settings };
    const wordOf = (key) => Object.keys(SETTING_WORDS).find((word) => SETTING_WORDS[word] === key);
    let texts = 0;
    for (const [key, choices] of Object.entries(SETTINGS_CHOICES)) {
        if (!choices.some((choice) => typeof choice === 'string') || !wordOf(key)) continue;
        for (const choice of choices) {
            command.run([wordOf(key), choice], { game });
            equal(settings.get(key), choice, `/ustaw ${wordOf(key)} ${choice}`);
            texts++;
        }
        settings.set(key, SETTINGS_DEFAULTS[key]);
        assert.throws(() => command.run([wordOf(key), 'bzdura'], { game }), /Do wyboru|Wpisz/, `/ustaw ${wordOf(key)} bzdura - czytelny błąd`);
        checks++;
    }
    check(texts >= 12, `Słowne wartości ustawień: ${texts}`);
    command.run(['atmosfera', 'baseline'], { game });
    equal(settings.get(SETTING_WORDS.atmosfera), 'baseline', '/ustaw atmosfera baseline (z listy błędów)');
    command.run(['model-swiatla', 'classic'], { game });
    equal(settings.get(SETTING_WORDS['model-swiatla']), 'classic', '/ustaw model-swiatla classic (z listy błędów)');
    // Liczbowe wybory działają jak dotąd.
    command.run(['fps', '60'], { game });
    equal(settings.get(SETTING_WORDS.fps), 60, '/ustaw fps 60');
    command.run(['fps', 'bez-limitu'], { game });
    equal(settings.get(SETTING_WORDS.fps), 0, '/ustaw fps bez-limitu');
}


// --- 8. Komplet narzędzi ---------------------------------------------------------------------------

{
    const { ACHIEVEMENTS, TOOL_SET } = await import('../src/achievements/list.js');
    const { ITEM_TYPES, getTool } = await import('../src/items/ItemRegistry.js');
    const achievement = ACHIEVEMENTS.find((entry) => entry.id === 'tool_set');
    equal(TOOL_SET, ['axe', 'pickaxe', 'shovel'], 'Komplet: siekiera, kilof, łopata');
    check(/siekierę, kilof i łopatę/.test(achievement.task), 'Opis zgadza się z warunkiem');
    const itemOf = (kind) => Object.keys(ITEM_TYPES).find((type) => getTool(type) === kind);
    const book = () => { const progress = {}; return { progress, collect(key, value) { const list = progress[key] ??= []; if (value !== undefined && !list.includes(value)) list.push(value); return list.length; } }; };
    {
        const b = book();
        const got = ['axe', 'pickaxe', 'knife'].map((kind) => achievement.when({ type: itemOf(kind) }, b));
        equal(got, [false, false, false], 'Siekiera, kilof i nóż to nie komplet (błąd do 1.10.1)');
        equal(achievement.when({ type: itemOf('shovel') }, b), true, 'Dopiero łopata domyka komplet');
    }
    {
        const b = book();
        b.progress.tools = ['axe', 'knife'];           // postęp sprzed poprawki
        equal(achievement.when({ type: itemOf('pickaxe') }, b), false, 'Stary postęp z nożem nie zalicza kompletu');
    }
    equal(achievement.goal, { key: 'tool_set', count: 3 }, 'Postęp w księdze: trzy narzędzia');
    equal(achievement.when({ type: 'stone' }, book()), false, 'Zwykły przedmiot się nie liczy');
}

console.log(`OK: poprawki 1.10.2 - ${checks} sprawdzeń (pauza na Androidzie, dzierżawa w grze wieloosobowej, stolarstwo, mapa lasów, miejsce startu, /ustaw, komplet narzędzi).`);
