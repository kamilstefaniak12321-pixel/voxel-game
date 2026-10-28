// Bez instalowania zależności: node tools/sprawdz_swiatlo.mjs (Node >= 22.15).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        // Warstwy wizualne wczytują obrazy. Ten test sprawdza prawdziwy
        // adapter świateł Sky; kopułę, tarcze i shadery sprawdzamy w WebGL.
        if (url.includes('/src/sky/layers/')) {
            const name = url.split('/').pop().replace('.js', '');
            return { format: 'module', shortCircuit: true, source: `export class ${name} {}` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { sampleSolarAtmosphere, relativeAirMass, usesSolarAtmosphere } = await import('../src/sky/SolarAtmosphere.js');
const { createGenerator, TERRAIN_TYPES } = await import('../src/world/terrain/generators.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, isSolidId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_HEIGHT, CHUNK_SIZE } = await import('../src/config.js');
const { createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { Settings } = await import('../src/settings/Settings.js');
const { Sky } = await import('../src/sky/Sky.js');
const { SkyState } = await import('../src/sky/SkyColors.js');
const { Celestial } = await import('../src/sky/Celestial.js');
const THREE = await import('three');

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

near(relativeAirMass(1), 1);
assert.ok(relativeAirMass(0) > 30 && relativeAirMass(0) < 50);
const noon = sampleSolarAtmosphere(1);
const low = sampleSolarAtmosphere(Math.sin(3 * Math.PI / 180));
assert.ok(noon.direct.every((c, i) => c > low.direct[i]));
assert.ok(low.direct[0] / low.direct[2] > noon.direct[0] / noon.direct[2]);
assert.deepEqual(sampleSolarAtmosphere(-0.04).direct, [0, 0, 0]);
assert.ok(sampleSolarAtmosphere(-0.04).sky.every(c => c > 0));
assert.deepEqual(sampleSolarAtmosphere(-1).sky, [0, 0, 0]);
assert.deepEqual(sampleSolarAtmosphere(1, 1).direct, [0, 0, 0]);
assert.ok(sampleSolarAtmosphere(1, 1).sky[2] < noon.sky[2]);
for (const h of [-Infinity, NaN, Infinity, ...Array.from({ length: 2001 }, (_, i) => i / 1000 - 1)]) {
    const s = sampleSolarAtmosphere(h);
    assert.ok([s.airMass, s.altitude, ...s.direct, ...s.sky, ...s.ground].every(Number.isFinite));
    assert.ok([...s.direct, ...s.sky, ...s.ground].every(c => c >= 0));
}
// Nie ma skoku energii na horyzoncie ani na końcach krzywej zmierzchu.
for (const altitude of [-12, 0, 2, 25]) {
    const a = sampleSolarAtmosphere(Math.sin((altitude - 1e-5) * Math.PI / 180));
    const b = sampleSolarAtmosphere(Math.sin((altitude + 1e-5) * Math.PI / 180));
    a.sky.forEach((v, i) => near(v, b.sky[i], 1e-5));
    a.direct.forEach((v, i) => near(v, b.direct[i], 1e-5));
}

// Stare światy i nieznany typ pozostają klasyczne przy domyślnych ustawieniach.
for (const terrain of [undefined, 'classic', 'realistic', 'unknown']) {
    assert.equal(usesSolarAtmosphere('world', terrain), false);
}
assert.equal(usesSolarAtmosphere('world', 'light-lab'), true);
assert.equal(usesSolarAtmosphere('classic', 'light-lab'), false);
assert.equal(usesSolarAtmosphere('atmosphere', 'classic'), true);

const savedSettings = new Map();
globalThis.localStorage = { getItem: key => savedSettings.get(key), setItem: (key, value) => savedSettings.set(key, value) };
const settings = new Settings();
assert.equal(settings.get('lightingModel'), 'world');
settings.set('lightingModel', 'atmosphere');
assert.equal(new Settings().get('lightingModel'), 'atmosphere');
settings.set('lightingModel', 'invalid');
assert.equal(settings.get('lightingModel'), 'world');

// Prawdziwy adapter Sky, bez tworzenia warstw graficznych. Powrót A/B
// odtwarza wszystkie stare parametry oraz wyłącza dodatkowe źródło.
const sky = Object.assign(Object.create(Sky.prototype), {
    celestial: new Celestial(), state: new SkyState(), variant: {},
    space: 0, horizonDip: 0, solarAtmosphere: false, lightSets: [], layers: []
});
const lights = sky.attachLights(new THREE.Scene());
const snapshot = () => [lights.sun.intensity, ...lights.sun.color.toArray(), lights.ambient.intensity, ...lights.ambient.color.toArray(), lights.moon.intensity];
for (const time of [0.1, 0.24, 0.26, 0.5, 0.74, 0.76, 0.9]) {
    sky.solarAtmosphere = false;
    sky.update(time, 0);
    sky.applyShadowContrast(1);
    const before = snapshot();
    sky.solarAtmosphere = true;
    sky.update(time, 0);
    assert.equal(lights.ambient.intensity, 0);
    assert.equal(lights.diffuse.intensity, 1);
    const direct = lights.sun.intensity;
    sky.applyShadowContrast(1);
    assert.equal(lights.sun.intensity, direct);
    sky.solarAtmosphere = false;
    sky.update(time, 0);
    sky.applyShadowContrast(1);
    assert.deepEqual(snapshot(), before);
    assert.equal(lights.diffuse.intensity, 0);
}
sky.dispose();
assert.equal(lights.diffuse.parent, null);

assert.ok(TERRAIN_TYPES['light-lab']);
const generator = createGenerator('light-lab', 123);
const saved = JSON.parse(JSON.stringify(createWorldInfo('Lab', 123, 'light-lab', 'creative')));
assert.equal(createGenerator(saved.terrain, saved.seed).type, 'light-lab');
assert.equal(createGenerator(undefined, 123).type, 'classic');

const positions = [[-2, -2], [-1, -2], [0, -2], [1, -2], [-2, 0], [-1, 0], [0, 0], [1, 0], [0, 1], [1, 1], [8, 0], [12, 0], [16, 0]];
for (const [cx, cz] of positions) {
    const chunk = new Chunk(cx, cz);
    generator.generateChunk(chunk);
    const repeated = new Chunk(cx, cz);
    createGenerator('light-lab', 'different seed').generateChunk(repeated);
    assert.deepEqual(chunk.blocks, repeated.blocks);
    for (let z = 0; z < CHUNK_SIZE; z++) for (let x = 0; x < CHUNK_SIZE; x++) {
        const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
        const column = generator.columnBlocks(wx, wz);
        for (let y = 0; y < CHUNK_HEIGHT; y++) assert.equal(chunk.getId(x, y, z), column.blocks[y]);
        assert.equal(generator.getHeight(wx, wz), column.height);
        assert.equal(generator.farSurface(wx, wz, 1).top, column.height + 1);
    }
}
const at = (x, y, z) => generator.columnBlocks(x, z).blocks[y];
const spawn = generator.findSpawn();
assert.ok(isSolidId(at(spawn.x, 16, spawn.z)));
assert.equal(at(spawn.x, 17, spawn.z), 0);
assert.equal(at(spawn.x, 18, spawn.z), 0);
assert.equal(at(20, 25, 13), 0, 'otwór w dachu');
assert.equal(at(17, 25, 13), getBlockId('lime_plaster'), 'nieprzezroczysty dach');
assert.equal(at(-20, 24, 8), getBlockId('oak_leaves'));
assert.notEqual(getBlockId('oak_leaves'), 0);
assert.notEqual(getBlockId('oak_log'), 0);
assert.equal(at(-4, 15, 10), getBlockId('water'));
assert.equal(at(16, 19, 5), getBlockId('lamp_red'));
console.log('OK: atmosfera RGB, zmierzch, zaćmienie, powrót A/B, ustawienia, zapis typu świata, spójne chunki/mapa/LOD i stanowiska laboratorium.');
