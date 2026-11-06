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
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            // Kontroler cieni działa naprawdę; tylko ładowanie obrazu
            // atlasu wymaga przeglądarki (sprawdzanej osobno w WebGL).
            return { format: 'module', shortCircuit: true, source: 'export const blockAtlasTexture = null, atlasAverageTexture = null;' };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { sampleSolarAtmosphere, relativeAirMass, usesSolarAtmosphere } = await import('../src/sky/SolarAtmosphere.js');
const { sampleNightIllumination } = await import('../src/sky/NightIllumination.js');
const { skyUniforms } = await import('../src/sky/skyShader.js');
const { createGenerator, TERRAIN_TYPES } = await import('../src/world/terrain/generators.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, isSolidId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_HEIGHT, CHUNK_SIZE } = await import('../src/config.js');
const { createWorldInfo } = await import('../src/storage/WorldStorage.js');
const { Settings } = await import('../src/settings/Settings.js');
const { Sky } = await import('../src/sky/Sky.js');
const { SkyState } = await import('../src/sky/SkyColors.js');
const { Celestial } = await import('../src/sky/Celestial.js');
const { SunShadows, shadowUniforms } = await import('../src/rendering/Shadows.js');
const THREE = await import('three');

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

near(relativeAirMass(1), 1);
assert.ok(relativeAirMass(0) > 30 && relativeAirMass(0) < 50);
const noon = sampleSolarAtmosphere(1);
const low = sampleSolarAtmosphere(Math.sin(3 * Math.PI / 180));
assert.ok(noon.direct.every((c, i) => c > low.direct[i]));
assert.ok(low.direct[0] / low.direct[2] > noon.direct[0] / noon.direct[2]);
assert.deepEqual(sampleSolarAtmosphere(-0.08).direct, [0, 0, 0]);
assert.ok(sampleSolarAtmosphere(-0.04).direct[0] > 0, 'Widoczny fragment tarczy nadal świeci');
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
for (const altitude of [-12, -6, -3.5, 0, 2, 3.5, 25]) {
    const a = sampleSolarAtmosphere(Math.sin((altitude - 1e-5) * Math.PI / 180));
    const b = sampleSolarAtmosphere(Math.sin((altitude + 1e-5) * Math.PI / 180));
    a.sky.forEach((v, i) => near(v, b.sky[i], 1e-5));
    a.direct.forEach((v, i) => near(v, b.direct[i], 1e-5));
    const na = sampleNightIllumination(Math.sin((altitude - 1e-5) * Math.PI / 180));
    const nb = sampleNightIllumination(Math.sin((altitude + 1e-5) * Math.PI / 180));
    na.sky.forEach((v, i) => near(v, nb.sky[i], 1e-5));
}

// Stare światy i nieznany typ pozostają klasyczne przy domyślnych ustawieniach.
for (const terrain of [undefined, 'classic', 'realistic', 'unknown']) {
    assert.equal(usesSolarAtmosphere('world', terrain), true);
}
assert.equal(usesSolarAtmosphere('world', 'flat'), true);
assert.equal(usesSolarAtmosphere('classic', 'flat'), false);
assert.equal(usesSolarAtmosphere('atmosphere', 'classic'), true);

const savedSettings = new Map();
globalThis.localStorage = { getItem: key => savedSettings.get(key), setItem: (key, value) => savedSettings.set(key, value) };
const settings = new Settings();
assert.equal(settings.get('lightingModel'), 'world');
settings.set('lightingModel', 'classic');
assert.equal(new Settings().get('lightingModel'), 'classic');
// Dawny wybór "Atmosferyczny" (zapis sprzed 0.55.0) to dziś domyślny model.
settings.set('lightingModel', 'atmosphere');
assert.equal(new Settings().get('lightingModel'), 'world');
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
    assert.equal(skyUniforms.uAtmosphericLight.value, 1);
    const direct = lights.sun.intensity;
    sky.applyShadowContrast(1);
    assert.equal(lights.sun.intensity, direct);
    sky.solarAtmosphere = false;
    sky.update(time, 0);
    sky.applyShadowContrast(1);
    assert.deepEqual(snapshot(), before);
    assert.equal(lights.diffuse.intensity, 0);
    assert.equal(skyUniforms.uAtmosphericLight.value, 0);
}

// Rzeczywisty adapter Sky przy kontrolowanym położeniu Słońca/Księżyca.
// Klasyczna tabela zmierzchu nie może dokładać drugiej energii nieba.
const realCelestial = sky.celestial;
const fixtureSky = (degrees, moonHeight = -1, illumination = 1) => {
    const angle = degrees * Math.PI / 180;
    sky.celestial = {
        update() {}, eclipse: 0, sunHeight: Math.sin(angle), moonHeight,
        moonIllumination: illumination,
        sunDirection: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0),
        moonDirection: new THREE.Vector3(Math.sqrt(1 - moonHeight ** 2), moonHeight, 0)
    };
    sky.solarAtmosphere = true;
    sky.update(0, 0);
    return sky.atmosphere;
};
for (const degrees of [2, 0, -3, -5, -6]) {
    const actual = fixtureSky(degrees);
    const solar = sampleSolarAtmosphere(sky.celestial.sunHeight);
    assert.deepEqual(actual.sky, solar.sky);
    assert.deepEqual(actual.ground, solar.ground);
    const before = [...actual.sky];
    sky.variant.sunsetColor = new THREE.Color('#ff0000');
    sky.update(0, 0);
    assert.deepEqual(sky.atmosphere.sky, before, 'Artystyczna łuna nie zmienia energii zmierzchu');
    sky.variant.sunsetColor = null;
    sky.update(0, 0);
    assert.deepEqual(sky.atmosphere.sky, before, 'Kolejne klatki nie akumulują światła');
}
const moonless = [...fixtureSky(-15).sky];
const moonlit = fixtureSky(-15, 1);
moonlit.sky.forEach((v, i) => near(v - moonless[i], sky.state.moonAmbientLight.toArray()[i]));
assert.ok(moonlit.sky.some((v, i) => v > moonless[i]));
assert.deepEqual(fixtureSky(-15, 1, 0).sky, moonless, 'Nów nie dodaje poświaty');
fixtureSky(-2);
assert.ok(sky.celestial.sunDirection.y < 0 && sky.sunLightDirection.y > 0);
near(sky.sunLightDirection.length(), 1);
near(lights.sun.position.clone().normalize().y, sky.sunLightDirection.y);
const direction = sky.sunLightDirection.toArray();
const energy = [...sky.atmosphere.direct];
sky.horizonDip = -0.1;
sky.update(0, 0);
assert.deepEqual(sky.sunLightDirection.toArray(), direction);
assert.deepEqual(sky.atmosphere.direct, energy, 'Horyzont kamery nie steruje energią powierzchni');
sky.solarAtmosphere = false;
sky.update(0, 0);
assert.deepEqual(sky.sunLightDirection.toArray(), sky.celestial.sunDirection.toArray());
sky.celestial = realCelestial;
sky.dispose();
assert.equal(lights.diffuse.parent, null);

// Regresja zachodu: zasłonięty promień pozostaje zasłonięty, kiedy
// model atmosfery sam zmniejsza energię słońca. Sprawdzamy prawdziwy
// kontroler i uniformy, bez renderera GPU; gotowość mapy ustawiamy jawnie.
const shadows = new SunShadows({ capabilities: { isWebGL2: true } });
const focus = new THREE.Vector3(0, 20, 0);
const shadowSky = (degrees, atmospheric = true, eclipse = 0) => {
    const angle = degrees * Math.PI / 180;
    const atmosphere = sampleSolarAtmosphere(Math.sin(angle), eclipse);
    return {
        atmosphere: atmospheric ? atmosphere : null,
        sunLightDirection: new THREE.Vector3(Math.sqrt(1 - atmosphere.lightHeight ** 2), atmosphere.lightHeight, 0),
        state: { sunLightIntensity: Math.max(...atmosphere.direct), moonLightIntensity: 0 },
        celestial: {
            sunDirection: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0),
            moonDirection: new THREE.Vector3(0, -1, 0)
        },
        space: 0
    };
};
const shadowAt = (degrees, atmospheric = true, eclipse = 0) => {
    shadows.update(0, shadowSky(degrees, atmospheric, eclipse), focus);
    return { direct: shadowUniforms.uSunShadowInfo.value.y, ambient: shadowUniforms.uSunShadowAmbient.value };
};
shadows.setQuality(1);
shadows.valid = true;
for (const degrees of [10, 5, 3, 2, 1, 0.5, 0.05]) {
    const classic = shadowAt(degrees, false);
    const atmospheric = shadowAt(degrees);
    near(atmospheric.direct, 1);
    // Zmiana zasłonięcia promienia nie podbija światła otoczenia
    // ani nie wprowadza skoku jasności wnętrz na horyzoncie.
    near(atmospheric.ambient, classic.ambient);
}
const classicLow = shadowAt(3, false);
assert.ok(classicLow.direct > 0.49 && classicLow.direct < 0.5);
near(shadowAt(0.5, false).direct, 0);
for (const degrees of [-0.01, 0, 0.01]) near(shadowAt(degrees).ambient, 0);
for (const degrees of [-0.01, -2, -3]) near(shadowAt(degrees).direct, 1);
for (const degrees of [-5, -3.5]) {
    near(shadowAt(degrees).direct, 0);
    assert.equal(shadows.needsDraw, false);
}
near(shadowAt(3, true, 1).direct, 0); // Brak wiązki podczas pełnego zaćmienia.

// Księżyc zachowuje dotychczasowe wygaszanie także w trybie atmosfery.
const moonSky = shadowSky(-3);
moonSky.state.moonLightIntensity = 1;
moonSky.celestial.moonDirection.copy(shadowSky(3).celestial.sunDirection);
shadows.update(0, moonSky, focus);
assert.equal(shadows.light, 'moon');
near(shadowUniforms.uSunShadowInfo.value.y, classicLow.direct);
near(shadowUniforms.uSunShadowAmbient.value, classicLow.ambient);

const spaceSky = shadowSky(3);
spaceSky.space = 0.4;
shadows.update(0, spaceSky, focus);
near(shadowUniforms.uSunShadowInfo.value.y, 0.5);
spaceSky.space = 1;
shadows.update(0, spaceSky, focus);
near(shadowUniforms.uSunShadowInfo.value.y, 0);
assert.equal(shadows.needsDraw, false);

shadows.setQuality(3);
shadows.valid = true;
shadows.farValid = true;
near(shadowAt(0.5).direct, 1);
assert.equal(shadowUniforms.uFarShadowInfo.value.z, 1);
shadows.valid = false;
near(shadowAt(3).direct, 0); // Nie używaj mapy przed pierwszym rysowaniem.
shadows.setQuality(0);
near(shadowAt(3).direct, 0);
near(shadowUniforms.uSunShadowAmbient.value, 0);
assert.equal(shadowUniforms.uFarShadowInfo.value.z, 0);
assert.equal(shadows.needsDraw, false);
shadows.dispose();

// Plac testowy (tryb programisty); dawne światy "Laboratorium światła"
// dostają ten sam plac (stanowiska stawia scena - sprawdz_sceny.mjs).
assert.ok(TERRAIN_TYPES.flat?.developer);
assert.ok(TERRAIN_TYPES['light-lab']?.hidden);
const generator = createGenerator('flat', 123);
const saved = JSON.parse(JSON.stringify(createWorldInfo('Lab', 123, 'light-lab', 'creative')));
assert.equal(createGenerator(saved.terrain, saved.seed).type, 'flat');
assert.equal(createGenerator(undefined, 123).type, 'classic');

const positions = [[-2, -2], [-1, -2], [0, -2], [1, -2], [-2, 0], [-1, 0], [0, 0], [1, 0], [0, 1], [1, 1], [8, 0], [12, 0], [16, 0]];
for (const [cx, cz] of positions) {
    const chunk = new Chunk(cx, cz);
    generator.generateChunk(chunk);
    const repeated = new Chunk(cx, cz);
    createGenerator('flat', 'different seed').generateChunk(repeated);
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
assert.equal(at(0, 16, 5), getBlockId('terracotta'), 'oś placu');
assert.equal(at(5, 16, 5), getBlockId('lime_plaster'), 'posadzka placu');
assert.equal(at(60, 16, 5), getBlockId('grass'), 'trawa poza placem');
assert.equal(generator.getHeight(200, 0), 48, 'taras dalekiego terenu');
console.log('OK: atmosfera RGB, zmierzch, zaćmienie, cienie przy horyzoncie, powrót A/B, ustawienia, zapis typu świata, spójne chunki/mapa/LOD i plac testowy.');
