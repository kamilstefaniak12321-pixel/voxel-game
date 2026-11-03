import assert from 'node:assert/strict';
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
console.log('OK: wspólny stan materiałów, wygaszanie źródeł, maski, jakość i stabilne bufory.');
