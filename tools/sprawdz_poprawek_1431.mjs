// ------------------------------------------------------------
// POPRAWKI 1.43.1 - pięć błędów znalezionych przy opisie systemów gry
//
// 1. Maliny nie zamieniają się w truskawki (stara tabela nazw z 0.4.0).
// 2. Garnek na ognisku jest w podpisie ogniska (gra ze znajomymi).
// 3. Nowy gość dostaje drewutnie, pochodnie, nacięcia i płomienie pożaru.
// 4. Pożar: pogoda przy drzewie, drzewo poza wczytanym terenem czeka
//    (szczegóły w sprawdz_pozaru.mjs).
// 5. Jedna reguła dachu dla deszczu (world/rain.js): ognisko, pochodnia,
//    drewno i krople na ekranie; ile pada - tam, gdzie stoi ta rzecz.
//
// Uruchomienie: node tools/sprawdz_poprawek_1431.mjs
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
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null, atlasImage = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false }), atlasAveragesReady = Promise.resolve();
                export const getTileColors = () => [], getAtlasAverage = () => new Color(.4, .5, .6), getTileMask = () => null, loadPackImage = async () => null;
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 16, ATLAS_TILES = { water: { x: 0, y: 0 } }, ATLAS_TILE_SIZE = 16, atlasTileSize = 16, atlasUploadedAt = 0, ATLAS_UV_INSET = 0, PLANT_ATLAS_ROW = 0;` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE } = await import('../src/config.js');
const { Chunk } = await import('../src/world/Chunk.js');
const RAIN = await import('../src/world/rain.js');
const { RainShelter, SHELTER_SIZE } = await import('../src/rendering/RainStreaks.js');
const { currentType, itemExists } = await import('../src/items/ItemRegistry.js');
const { potSign, stateSystems, JOIN_STATE } = await import('../src/net/StateSync.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

// --- 1. Maliny ------------------------------------------------------------------------

check(itemExists('raspberry') && currentType('raspberry') === 'raspberry', 'Maliny (od 1.17.0) zostają malinami');
check(currentType('yellow_raspberry') === 'yellow_raspberry', 'Żółte maliny też');
check(currentType('currants') === 'chili_pepper' && currentType('raspberry_bush_full') === 'strawberry_bush_full', 'Stare nazwy, których nie ma w grze, nadal się zamieniają');
check(currentType('oak_log') === 'oak_log' && currentType(undefined) === undefined, 'Zwykłe nazwy bez zmian');

// --- 2. Garnek w podpisie ogniska ----------------------------------------------------

{
    const systems = stateSystems({ campfires: { fires: new Map() } });
    const fire = { logs: [], tinder: null, kindling: 0, phase: 'unlit', ash: false, ignition: 0, embers: 0, pot: null };
    const sign = (pot) => systems.fires.sign({ ...fire, pot });
    const pot = { items: ['raspberry'], progress: 0, dish: null, portions: 0, empty: false };
    check(sign(null) !== sign(pot), 'Postawiony garnek zmienia podpis');
    check(sign(pot) !== sign({ ...pot, items: ['raspberry', 'hazelnut'] }), 'Składnik zmienia podpis');
    check(sign(pot) === sign({ ...pot, progress: 0.7 }), 'Postęp gotowania nie zmienia podpisu');
    check(sign({ ...pot, items: [], dish: 'compote', portions: 3 }) !== sign({ ...pot, items: [], dish: 'compote', portions: 2 }), 'Nabrana porcja zmienia podpis');
    equal(potSign(null), null, 'Bez garnka - null');
}

// --- 3. Powitanie gościa -------------------------------------------------------------

{
    const systems = stateSystems({});
    equal(JOIN_STATE, ['woodpiles', 'torches', 'taps', 'wildfire'], 'Po powitaniu: drewutnie, pochodnie, nacięcia, płomienie');
    for (const name of JOIN_STATE) check(Object.hasOwn(systems, name), `${name}: jest w StateSync`);
    const host = read('src/net/NetHost.js');
    check(/for \(const sys of JOIN_STATE\)/.test(host) && host.indexOf('JOIN_STATE)') > host.indexOf('t: MSG.WELCOME'), 'Gospodarz wysyła je zaraz po powitaniu');
    // Wszystko, co StateSync synchronizuje, gość dostaje na wejściu: w powitaniu albo zaraz po nim.
    const welcome = host.match(/state: \{([^}]*)\}/)[1];
    for (const name of Object.keys(systems)) check(welcome.includes(`'${name}'`) || JOIN_STATE.includes(name), `${name}: gość dostaje przy wejściu`);
}

// --- 5. Reguła dachu ------------------------------------------------------------------

check(RAIN.stopsRain(getBlockId('stone')) && RAIN.stopsRain(getBlockId('oak_leaves')) && RAIN.stopsRain(getBlockId('water')) && RAIN.stopsRain(getBlockId('oak_planks')), 'Dach: pełny blok, liście, woda, deski');
check(!RAIN.stopsRain(0) && !RAIN.stopsRain(getBlockId('torch')), 'Powietrze i pochodnia nie zatrzymują deszczu');

{
    const chunks = new Map();
    const world = {
        getChunk: (cx, cz) => chunks.get(`${cx},${cz}`) ?? null,
        getBlockId(x, y, z) {
            const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), chunk = world.getChunk(cx, cz);
            return chunk ? chunk.getId(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE) : 0;
        }
    };
    const set = (x, y, z, type) => {
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), key = `${cx},${cz}`;
        if (!chunks.has(key)) chunks.set(key, new Chunk(cx, cz));
        chunks.get(key).setId(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE, getBlockId(type));
    };
    for (let x = -20; x < 40; x++) for (let z = -20; z < 40; z++) set(x, 10, z, 'grass');
    // Daszek nad (4..6, 4..6) na wysokości 14, korona nad (20, 0), woda w (-5, -5), wysoki słup w (30, 30).
    for (let x = 4; x <= 6; x++) for (let z = 4; z <= 6; z++) set(x, 14, z, 'oak_planks');
    set(20, 16, 0, 'oak_leaves');
    set(-5, 12, -5, 'water');
    set(30, 90, 30, 'stone');
    set(0, 11, 0, 'campfire');

    check(RAIN.rainReaches(world, 0, 11, 0), 'Ognisko pod gołym niebem: pada');
    check(!RAIN.rainReaches(world, 5, 11, 5) && !RAIN.rainReaches(world, 4, 11, 6), 'Pod daszkiem: nie pada (także przy krawędzi)');
    check(RAIN.rainReaches(world, 7, 11, 5) && RAIN.rainReaches(world, 3, 11, 5), 'Blok obok daszka: pada');
    check(RAIN.rainReaches(world, 5, 14, 5), 'Na samym daszku: pada');
    check(!RAIN.rainReaches(world, 20, 11, 0) && !RAIN.rainReaches(world, -5, 11, -5), 'Pod koroną i pod wodą: nie pada');
    check(!RAIN.rainReaches(world, 30, 11, 30) && RAIN.rainReaches(world, 30, 90, 30), 'Wysoki blok też jest dachem');
    check(!RAIN.rainReaches(world, 500, 11, 500), 'Niewczytany teren: nie wiadomo - nie pada');
    equal(RAIN.roofAbove(world, 5, 11, 5), { y: 14, id: getBlockId('oak_planks') }, 'Dach nad daszkiem: deski na wysokości 14');
    equal(RAIN.roofAbove(world, 0, 11, 0), null, 'Nad ogniskiem nic');
    // Komenda /pogoda dach.
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const game = { rainNow: 0.6, rainOverride: null, weather: {}, time: { days: 5 }, currentHit: { hit: true, block: { x: 5, y: 11, z: 5 } } };
    const run = (...args) => command.run(args, { game, player: { pos: { x: 0.5, y: 12, z: 0.5 } }, world });
    if (process.env.POKAZ) console.log(run('dach'));
    check(/^Blok \(5, 11, 5\): pod dachem \(.+ na wysokości 14\) - deszcz tu nie dociera \(obok pada teraz 60%\)\.$/.test(run('dach')), `/pogoda dach pod daszkiem: ${run('dach')}`);
    game.currentHit = null;
    if (process.env.POKAZ) console.log(run('dach'));
    check(/^Tu, gdzie stoisz \(0, 12, 0\): pod gołym niebem.*pada tu teraz 60%/.test(run('dach')), `/pogoda dach pod niebem: ${run('dach')}`);
    check(command.complete(['']).includes('dach') && command.usage.includes('dach'), 'Podpowiedź i opis: dach');
    // Te same kolumny co krople na ekranie (RainShelter).
    const shelter = new RainShelter(world);
    let same = 0;
    for (let x = -10; x < 35; x++) for (let z = -10; z < 35; z++) {
        shelter.scan(x, z);
        const k = ((((z % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE) * SHELTER_SIZE + (((x % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE)) * 2;
        const roof = shelter.data[k];
        for (const y of [10, 11, 12, 13, 14, 16, 40]) {
            assert.equal(RAIN.rainReaches(world, x, y, z), y + 1 >= roof, `(${x}, ${y}, ${z}): ta sama reguła co krople`);
            same++;
        }
    }
    checks++;
    check(same > 10000, 'Krople i rzeczy w świecie: ta sama reguła dachu w każdej kolumnie');
}

// --- Ile pada: tam, gdzie stoi rzecz -------------------------------------------------

{
    let samples = 0;
    const field = { sample(x, z, days, out = {}) { samples++; out.rain = x > 1000 ? 0.9 : x > 500 ? 0.02 : 0; return out; } };
    const game = { camera: { position: { x: 0, y: 70, z: 0 } }, weather: { field, snowShare: 0 }, rainNow: 0.5, rainOverride: null, time: { days: 10 } };
    const rain = new RAIN.LocalRain(game);
    equal(rain.at(10, 10), 0.5, 'Blisko gracza: to, co widać');
    equal(samples, 0, 'Blisko gracza bez próbki pola');
    equal(rain.at(2000, 0), 0.9, 'Daleko: deszcz z pola pogody w tamtym miejscu');
    equal(rain.at(200, 0), 0, 'Gdzie indziej nie pada, choć pada nad graczem');
    equal(rain.at(700, 0), 0, 'Ślad opadu to jeszcze nie deszcz');
    const before = samples;
    rain.at(2001, 3); rain.at(2010, 20);
    equal(samples, before, 'Ta sama kratka - bez nowej próbki');
    game.time.days += 0.01;
    rain.at(2001, 3);
    equal(samples, before + 1, 'Po chwili - świeża próbka');
    game.weather.snowShare = 1;
    game.time.days += 0.01;
    equal(rain.at(2000, 0), 0, 'Śnieg nie moczy');
    game.weather.snowShare = 0;
    game.rainOverride = 0.7;
    equal(rain.at(200, 0), 0.7, 'Deszcz z komendy pada wszędzie');
    equal(RAIN.rainAt({ rainNow: 0.3 }, 999, 999), 0.3, 'Gra bez rainAt (atrapa) - deszcz nad graczem');
    equal(RAIN.rainAt({ rainAt: () => 2 }, 0, 0), 1, 'Najwyżej 1');
}

// --- Podłączenie ----------------------------------------------------------------------

{
    const game = read('src/game/Game.js');
    check(/rainAt\(x, z\) \{\s*return \(this\.localRain \?\?= new LocalRain\(this\)\)\.at\(x, z\);/.test(game), 'Game.rainAt liczy LocalRain');
    for (const path of ['src/game/Campfires.js', 'src/game/TorchBurn.js', 'src/game/WoodDrying.js']) {
        const source = read(path);
        check(source.includes("from '../world/rain.js'") && source.includes('rainReaches(') && source.includes('rainAt('), `${path}: deszcz z world/rain.js`);
        check(!/rainNow/.test(source), `${path}: bez deszczu nad graczem`);
    }
    check(!/OPEN_SKY/.test(read('src/game/Campfires.js')) && !/OPEN_SKY/.test(read('src/game/TorchBurn.js')), 'Ognisko i pochodnia: bez progu jasności nieba');
    check(read('src/rendering/RainStreaks.js').includes('stopsRain(id)'), 'Krople na ekranie: ta sama reguła');
    const wildfire = read('src/game/Wildfire.js');
    check(/if \(!this\.treeLoaded\(burn\)\) continue;/.test(wildfire) && /this\.weather\(burn\.x \+ 0\.5, burn\.z \+ 0\.5\)/.test(wildfire), 'Pożar: drzewo poza terenem czeka, pogoda przy drzewie');
}

console.log(`OK: poprawki 1.43.1 - ${checks} sprawdzeń (maliny, garnek w sieci, powitanie gościa, reguła dachu, deszcz w miejscu, podłączenie).`);
