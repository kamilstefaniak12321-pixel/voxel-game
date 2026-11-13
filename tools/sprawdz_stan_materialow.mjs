import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, next) {
    return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
} });
const THREE = await import('../lib/three/three.module.js');
const { Settings } = await import('../src/settings/Settings.js');
const { lightingUniforms, setLightingComponent, resetLightingDiagnostics } = await import('../src/rendering/LightingDiagnostics.js');
const { applyMaterialLightingSettings, createBounceLightingState, updateBounceLightingState } = await import('../src/rendering/MaterialLighting.js');
globalThis.localStorage = { getItem: () => null, setItem() {} };
const settings = new Settings();
const sky = { lightingLook: 'natural', sunLightDirection: new THREE.Vector3(0, 1, 0),
    celestial: { moonDirection: new THREE.Vector3(0, -1, 0) },
    state: { sunLightColor: new THREE.Color().setRGB(1, .6, .3), sunLightIntensity: 2,
        moonLightColor: new THREE.Color().setRGB(.5, .6, 1), moonLightIntensity: .1,
        ambientColor: new THREE.Color().setRGB(.2, .3, .4), ambientIntensity: .5 },
    atmosphere: { sky: [.4, .5, .6], ground: [.3, .2, .1] } };
const options = createBounceLightingState();
const buffers = ['sun', 'moon', 'sky', 'ground'].map(key => options[key]);
const update = () => updateBounceLightingState(options, settings, sky);
update();
assert.equal(options.enabled, true);
assert.deepEqual(options.sun, [2, 1.2, .6]);
assert.deepEqual(options.sky, [.4, .5, .6]);
// Źródło znika również z odbicia w tej samej aktualizacji. Pozostałe
// transfery nie zmieniają się, a stare RGB nie zostaje w obiekcie.
for (const source of ['sun', 'moon', 'sky']) {
    resetLightingDiagnostics(); update();
    const old = Object.fromEntries(['sun', 'moon', 'sky', 'ground'].map(key => [key, [...options[key]]]));
    setLightingComponent(source, false); update();
    for (const key of Object.keys(old)) assert.deepEqual(options[key],
        key === source || (key === 'ground' && source === 'sky') ? [0, 0, 0] : old[key]);
}
resetLightingDiagnostics(); update();
sky.state.sunLightIntensity = 0; sky.state.moonLightIntensity = 0;
sky.atmosphere.sky.fill(0); sky.atmosphere.ground.fill(0); update();
for (const key of ['sun', 'moon', 'sky', 'ground']) assert.deepEqual(options[key], [0, 0, 0]);
buffers.forEach((buffer, i) => assert.equal(options[['sun', 'moon', 'sky', 'ground'][i]], buffer));
settings.set('surfaceBounce', false); update(); assert.equal(options.enabled, false);
settings.set('surfaceBounce', true); settings.set('lightingMaterials', 'basic'); update();
assert.equal(options.enabled, false); assert.equal(applyMaterialLightingSettings(settings), false);
settings.set('lightingMaterials', 'standard'); settings.set('potato', true); update();
assert.equal(options.enabled, false); assert.equal(applyMaterialLightingSettings(settings), false);
settings.set('potato', false); settings.set('bounceStrength', 0); update(); assert.equal(options.enabled, false);
settings.set('bounceStrength', 18); updateBounceLightingState(options, settings, sky, false);
assert.equal(options.enabled, false, 'Brak sampler3D nie może uruchomić solvera');
settings.set('leafTransmission', false); settings.set('materialSpecular', false);
assert.equal(applyMaterialLightingSettings(settings), true);
assert.equal(lightingUniforms.uLeafTransmission.value, 0); assert.equal(lightingUniforms.uMaterialSpecular.value, 0);
settings.set('leafTransmission', true); settings.set('materialSpecular', true); applyMaterialLightingSettings(settings);
assert.equal(lightingUniforms.uLeafTransmission.value, 1); assert.equal(lightingUniforms.uMaterialSpecular.value, 1);
setLightingComponent('transmission', false); setLightingComponent('specular', false);
assert.deepEqual(lightingUniforms.uLightingMaterial.value.toArray(), [0, 0]);
resetLightingDiagnostics(); assert.deepEqual(lightingUniforms.uLightingMaterial.value.toArray(), [1, 1]);
assert.deepEqual(lightingUniforms.uLightingComponents.value.toArray(), [1, 1, 1, 1]);

// Prawdziwe applySettings działa również w pauzie, gdy main nie wywołuje
// Game.update. Pomijamy wyłącznie konstrukcję niezwiązanych systemów gry;
// stan, cache BounceLight i próbki ogniska pozostają kodem produkcyjnym.
const gameUrl = new URL('../src/game/Game.js', import.meta.url).href;
const fireUrl = new URL('../src/rendering/CampfireRenderer.js', import.meta.url).href;
const modelLight = { uModelBounce: { value: new THREE.Vector3() },
    uModelShadows: { value: 0 }, uModelDistantShadows: { value: 0 } };
globalThis.materialSettingsFixture = {
    modelLight, viewUniforms: { uBrightness: { value: 1 } },
    setPotatoDefine() {}, setShadowDefine() {}, setFarTerrainShadows() {},
    setAmbientOcclusion() {}, setFastLeaves() {}, setLeafMaterialFast() {},
    updateAerialPerspective() {} // Osobny kontrakt stanu atmosfery: sprawdz_atmosfere.mjs.
};
const interactionUrl = new URL('../src/game/GameInteraction.js', import.meta.url).href;
const retained = new Set(['three', './GameInteraction.js', '../config.js', '../world/DistanceLod.js', '../rendering/MaterialLighting.js',
    '../rendering/LightingDiagnostics.js', '../sky/SolarAtmosphere.js']);
const stubNames = new Map();
for (const parent of [gameUrl, interactionUrl, fireUrl]) {
    for (const [, bindings, specifier] of readFileSync(new URL(parent), 'utf8')
        .matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
        if (retained.has(specifier)) continue;
        const names = bindings.trim().startsWith('{')
            ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}')).split(',')
                .map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [];
        const key = `${parent}|${specifier}`, exports = stubNames.get(key) ?? new Set();
        names.forEach(name => exports.add(name));
        stubNames.set(key, exports);
    }
}
const stubs = new Map([...stubNames].map(([key, names]) => [key, `data:text/javascript,${encodeURIComponent([...names]
    .map(name => `export const ${name}=globalThis.materialSettingsFixture[${JSON.stringify(name)}];`).join('\n'))}`]));
const atlas = `data:text/javascript,${encodeURIComponent(`
    export const atlasAveragesReady=Promise.resolve();
    export const getAtlasAverage=()=>({r:.3,g:.3,b:.3});
    export const getTileColors=()=>[];`)}`;
const hook = registerHooks({ resolve(specifier, context, next) {
    const stub = stubs.get(`${context.parentURL}|${specifier}`);
    if (stub) return { url: stub, shortCircuit: true };
    if (specifier.endsWith('/TextureAtlas.js')) return { url: atlas, shortCircuit: true };
    return next(specifier, context);
} });
const { Game } = await import(gameUrl);
const { CampfireRenderer } = await import(fireUrl);
const { BounceLight, bounceUniforms } = await import('../src/world/BounceLight.js');
const pausedSettings = new Settings(), bounce = new BounceLight();
// Zapisany transfer niejednakowego RGB, bez budowania świata ani raycastów.
bounce.origin.set(-20, 0, -20);
for (let i = 0; i < bounce.data.length; i += 4) bounce.data.set([96, 48, 24, 255], i);
const transferBefore = bounce.data.slice(), cursorBefore = bounce.initialCursor;
const pausedSky = { ...sky, setLowDetail() {},
    state: { ...sky.state, sunLightIntensity: 1, moonLightIntensity: 0 },
    atmosphere: { sky: [.4, .5, .6], ground: [.3, .2, .1] } };
const game = Object.assign(Object.create(Game.prototype), {
    settings: pausedSettings, sky: pausedSky, bounce, bounceLighting: createBounceLightingState(),
    renderer: { capabilities: { isWebGL2: true } }, worldInfo: { terrain: 'natural' },
    world: { setExperiments() {}, setDistanceLod(on) { this.distanceLod=on; }, remeshAll() {}, getChunk() { assert.fail('Solver ruszył w pauzie'); } },
    scene: { fog: {} }, camera: new THREE.PerspectiveCamera(),
    player: { pos: new THREE.Vector3(0, 11, 0) },
    shadows: { setNaturalLighting() {}, setQuality() {}, enabled: true, hasFar: true },
    farTerrain: { setDetail() {} }, spaceView: { setLowDetail() {} },
    updateCameraRange() {}, updateFarRange() {}
});
// Pierwsze applySettings w konstruktorze poprzedza utworzenie Campfires.
game.applySettings();
const fire = { group: { position: new THREE.Vector3(1, 12, 0) },
    lighting: { uModelBounce: { value: new THREE.Vector3() } } };
const fires = Object.assign(Object.create(CampfireRenderer.prototype), { game, views: new Map([['fire', fire]]) });
game.campfires = { renderer: fires };
pausedSettings.onChange(key => game.applySettings(key));
game.applySettings();
const sampleHand = () => modelLight.uModelBounce.value.toArray();
const sampleFire = () => fire.lighting.uModelBounce.value.toArray();
const assertSamples = () => {
    assert.deepEqual(sampleHand(), bounce.sample(0, 12.2, 0));
    assert.deepEqual(sampleFire(), bounce.sample(1, 12.25, 0));
    assert.equal(bounce.lastFrame.work, 0, 'Sama zmiana ustawień nie wykonuje pracy solvera');
};
assert.ok(sampleHand()[0] > 0); assertSamples();
const original = sampleHand();
pausedSettings.set('bounceStrength', 36); assertSamples();
sampleHand().forEach((value, c) => assert.ok(Math.abs(value - original[c] * 2) < 1e-12));
pausedSettings.set('bounceSaturation', 0); assertSamples();
assert.notDeepEqual(sampleHand(), original.map(value => value * 2));
for (const [key, disabled, enabled] of [['surfaceBounce', false, true], ['bounceStrength', 0, 18],
    ['lightingMaterials', 'basic', 'standard'], ['potato', true, false], ['lightingLook', 'baseline', 'natural']]) {
    pausedSettings.set(key, disabled); assertSamples();
    assert.equal(bounce.enabled, false, `${key}: odbicie wyłączone bez Game.update`);
    assert.deepEqual(bounceUniforms.uBounceColor.value.toArray(), [0, 0, 0]);
    assert.deepEqual(sampleHand(), [0, 0, 0]); assert.deepEqual(sampleFire(), [0, 0, 0]);
    pausedSettings.set(key, enabled); assertSamples();
    assert.ok(sampleHand()[0] > 0 && sampleFire()[0] > 0, `${key}: odtworzenie z cache bez wznowienia gry`);
}
game.renderer.capabilities.isWebGL2 = false; game.applySettings(); assertSamples();
assert.deepEqual(sampleHand(), [0, 0, 0]); assert.equal(bounce.enabled, false);
assert.deepEqual(bounce.data, transferBefore); assert.equal(bounce.initialCursor, cursorBefore);
assert.equal(bounce.updates, 0); assert.equal(bounce.invalidations, 0);
assert.equal(game.world.distanceLod,true,'Ustawienia konfigurują odległe modele również w pauzie');

// Real updateFarRange uses Player.pos, just like the production player. A
// nonexistent player.position used to abort Game.start before the first frame.
const rangeUniforms=globalThis.materialSettingsFixture.viewUniforms;
for(const key of ['uFarEnabled','uFarTextureBlend','uFarInner','uFarOuter',
    'uDistanceLodEnabled','uDistanceLodStart','uDistanceLodEnd']) rangeUniforms[key]={value:0};
rangeUniforms.uDistanceLodCenter={value:new THREE.Vector2()};
const range=Object.assign(Object.create(Game.prototype),{
    settings:{get:key=>({viewDistance:800,farTerrain:0,potato:false})[key]},
    world:{completeRadius:()=>Infinity},camera:{position:new THREE.Vector3(-66,80,-99)},
    player:{pos:new THREE.Vector3(-66,80,-99)},
    farTerrain:{active:true,setRange(inner,outer){this.range=[inner,outer];}}
});
range.updateFarRange();
assert.deepEqual(rangeUniforms.uDistanceLodCenter.value.toArray(),[-66,-99],'Przejście LOD korzysta z rzeczywistej pozycji gracza');
assert.deepEqual(range.farTerrain.range,[144,800],'Wybrany zasięg800 pozostaje pokryty także przy horyzoncie0');
assert.equal(range.getLoadRadius(),14,'Daleki widok nie wymaga pełnych chunków do800');
bounce.dispose(); hook.deregister(); delete globalThis.materialSettingsFixture;
console.log('OK: wspólny stan materiałów, źródła, maski oraz rzeczywiste ustawienia w pauzie: teren, dłoń i ognisko bez solvera.');
