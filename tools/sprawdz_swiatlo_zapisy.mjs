// Regresja światła po edycji i ponownym wczytaniu. Prawdziwe World,
// LightEngine, WorldSaver i WorldStorage; port IndexedDB tylko w pamięci.
// Bitmapy są pominięte, bo próba nie buduje meshy ani nie uruchamia GPU.
// Nie otwiera bazy przeglądarki i nie dotyka zapisów użytkownika.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { memoryDatabase } from './fixtures/memory-database.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize:16, mipmaps:false });
                export const atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => new Color(.4,.5,.6);
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { Scene } = await import('three');
const { World } = await import('../src/world/World.js');
const { WorldStorage, createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { WorldSaver } = await import('../src/storage/WorldSaver.js');
const { WorldTime } = await import('../src/sky/WorldTime.js');

const storage = new WorldStorage(memoryDatabase());
let info = createWorldInfo('Światło po wczytaniu', 42, 'flat', 'developer');
let world = new World(new Scene(), info.seed, new Map(), info.terrain, {});
const time = new WorldTime(0.5);
const player = { getState: () => ({ x: 16.5, y: 34, z: 16.5, yaw: 0, pitch: 0, flying: true }) };
const roof = [16, 40, 16], lamp = [15, 36, 15];
const chunkOrders = [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[1, 1], [0, 1], [1, 0], [0, 0]],
    [[1, 0], [0, 0], [1, 1], [0, 1]]
];
for (const point of chunkOrders[0]) world.generateChunk(...point);

// Zamknięty pokój na przecięciu x=16,z=16. Podłoże ponad terenem
// oddziela test nieba od danych generatora. 7×7×7 komórek wnętrza.
for (let y = 32; y <= 40; y++) for (let x = 12; x <= 20; x++) for (let z = 12; z <= 20; z++) {
    const boundary = y === 32 || y === 40 || x === 12 || x === 20 || z === 12 || z === 20;
    if (boundary) world.setBlock(x, y, z, 'lime_plaster');
}
world.setBlock(...lamp, 'lamp_red');

const samples = [];
for (let y = 33; y < 40; y++) for (let x = 13; x < 20; x++) for (let z = 13; z < 20; z++) samples.push([x, y, z]);
const lightSnapshot = () => samples.map(point => world.getLight(...point));
const isBlack = sample => sample.sky === 0 && sample.red === 0 && sample.green === 0 && sample.blue === 0;
const records = [];
let iteration = 0;
async function roundTrip(label) {
    const before = lightSnapshot();
    const expectedRoof = world.getBlock(...roof), expectedLamp = world.getBlock(...lamp);
    const saver = new WorldSaver(storage, info, world, player, time);
    assert.equal(await saver.flush(), true, `${label}: zapis musi dojść do WorldStorage`);
    saver.stop();
    assert.equal(world.hasUnsavedChanges(), false, `${label}: zapis opróżnia listę zmian`);
    const savedInfo = (await storage.listWorlds()).find(value => value.id === info.id);
    assert.ok(savedInfo, `${label}: zapisane metadane świata`);
    assert.equal(savedInfo.time, time.days, `${label}: pora jest częścią zapisu`);
    const saved = await storage.loadChunks(info.id);
    assert.equal(saved.size, 4, `${label}: zapis zawiera wszystkie cztery zmienione chunki`);
    world.dispose();
    info = savedInfo;
    world = new World(new Scene(), info.seed, saved, info.terrain, {});
    const order = chunkOrders[++iteration % chunkOrders.length];
    for (const point of order) world.generateChunk(...point);
    assert.equal(world.getBlock(...roof), expectedRoof, `${label}: dach odtworzony bez regeneracji`);
    assert.equal(world.getBlock(...lamp), expectedLamp, `${label}: stan źródła odtworzony bez regeneracji`);
    const after = lightSnapshot();
    assert.deepEqual(after, before, `${label}: wszystkie kanały światła po nowym World i kolejności ${JSON.stringify(order)}`);
    assert.equal(world.hasUnsavedChanges(), false, `${label}: odtworzenie światła nie staje się edycją świata`);
    records.push({ label, samples: after.length, skyMax: Math.max(...after.map(value => value.sky)),
        redMax: Math.max(...after.map(value => value.red)), order });
}

try {
    let light = lightSnapshot();
    assert.ok(light.every(value => value.sky === 0), 'Dodatnia kontrola: zamknięty dach odcina niebo');
    assert.ok(light.some(value => value.red > 0), 'Dodatnia kontrola: zapisujemy rzeczywiście świecące źródło');
    await roundTrip('zamknięty dach, lampa świeci');

    world.clearBlock(...roof);
    light = lightSnapshot();
    assert.ok(light.some(value => value.sky > 0) && light.some(value => value.red > 0),
        'Otwór dodaje dostęp nieba bez usunięcia światła lampy');
    await roundTrip('otwarty dach, lampa świeci');

    world.setBlock(...roof, 'lime_plaster');
    world.clearBlock(...lamp);
    assert.ok(lightSnapshot().every(isBlack), 'Usunięcie źródła i zamknięcie dachu naprawdę usuwa oba rodzaje światła');
    await roundTrip('dach zamknięty ponownie, źródło usunięte');
    assert.ok(lightSnapshot().every(isBlack), 'Po wczytaniu nie wraca światło usuniętego emitera ani starego otworu');

    world.clearBlock(...roof);
    light = lightSnapshot();
    assert.ok(light.some(value => value.sky > 0) && light.every(value => value.red === 0 && value.green === 0 && value.blue === 0),
        'Dalsza edycja po wczytaniu dodaje tylko niebo, nie przywraca źródła');
    await roundTrip('otwarty dach po wczytaniu, brak źródła');
    console.log('OK: prawdziwe World/LightEngine/WorldSaver/WorldStorage, cztery cykle zapis→odczyt, 343 próbki × 4 kanały na cykl.');
    console.log(JSON.stringify(records));
} finally { world.dispose(); }
