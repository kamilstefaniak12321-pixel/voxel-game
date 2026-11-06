import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Exercise the real render path and its source uniforms without creating a
// GPU context. Shadow textures/atlas are irrelevant to source calibration.
const shadowStub = `data:text/javascript,${encodeURIComponent(`
    export const shadowUniforms = Object.fromEntries([
        'uSunShadowMap', 'uSunShadowMatrix', 'uSunShadowDir',
        'uFarShadowMap', 'uFarShadowMatrix', 'uFarShadowInfo',
        'uDistantShadowMap', 'uDistantShadowMatrix', 'uDistantShadowInfo',
        'uSunShadowInfo'
    ].map(name => [name, {value: {x: 0, y: 0, z: 0}}]));
`)}`;
registerHooks({
    resolve(specifier, context, next) {
        if (specifier === './Shadows.js' && context.parentURL.endsWith('/LightShafts.js')) {
            return { url: shadowStub, shortCircuit: true };
        }
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});
const THREE = await import('../lib/three/three.module.js');
const { LightShafts } = await import('../src/rendering/LightShafts.js');
const renderer = {
    target: null, extensions: { has: () => false },
    getRenderTarget() { return this.target; }, setRenderTarget(target) { this.target = target; },
    getDrawingBufferSize(size) { return size.set(64, 64); }, clear() {},
    draws: [], render(scene) { this.draws.push({scene,target:this.target}); }
};
const shafts = new LightShafts(renderer), camera = new THREE.PerspectiveCamera();
const world = { shadowScene: new THREE.Scene() };
const source = (rgb, linear) => {
    const target = linear ? { isWorldOutputTarget: true } : null;
    renderer.target = target;
    const color = new THREE.Color().fromArray(rgb);
    shafts.render(camera, world, {}, color, 0.0012, 0.12, 128);
    assert.equal(renderer.target, target, 'restore the original output target');
    assert.deepEqual(color.toArray(), rgb, 'do not alter the shared sun/moon source');
    assert.equal(shafts.composite.uniforms.uLinearOutput.value, linear ? 1 : 0);
    return shafts.composite.uniforms.uColor.value.toArray();
};
for (const linear of [false, true]) {
    assert.deepEqual(source([0, 0, 0], linear), [0, 0, 0], 'no light from a black source');
    const a = source([2, 1, 0.5], linear), b = source([4, 2, 1], linear);
    assert.deepEqual(b, a.map(value => value * 2), 'source power stays linear');
    assert.equal(a[0] / a[1], 2, 'source chromaticity stays unchanged');
    assert.deepEqual(a, linear ? [0.2, 0.1, 0.05] : [2, 1, 0.5]);
}
// At a representative weak scattering amount the new linear radiance must
// be near the old display glow, not the original 5x brighter black lift.
const encode = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
const weakGlow = encode(source([0.1, 0.1, 0.1], true)[0]);
assert.ok(Math.abs(weakGlow - (1 - Math.exp(-0.1))) < 0.01);
assert.ok(encode(source([0.05, 0.05, 0.05], true)[0]) < 0.07);

// A real scene-sized depth attachment replaces the geometry pass. Its
// projection is the main camera's, not the shortened fallback camera's.
const shared = new THREE.WebGLRenderTarget(100, 80);
shared.isWorldOutputTarget = true;
shared.depthTexture = new THREE.DepthTexture(100, 80);
let depthDisposals = 0;
shared.depthTexture.addEventListener('dispose', () => depthDisposals++);
camera.far = 14000; camera.near = .1; camera.updateProjectionMatrix();
camera.position.set(10, 20, 30); camera.updateMatrixWorld();
renderer.target = shared; renderer.draws.length = 0;
const sharedShafts = new LightShafts(renderer);
sharedShafts.render(camera, world, {}, new THREE.Color(1, .5, .1), .0012, .12, 128);
assert.equal(sharedShafts.lastDepthSource, 'main');
assert.equal(sharedShafts.avoidedDepthPasses, 1);
assert.equal(sharedShafts.lastDepthDraws, 0);
assert.equal(sharedShafts.depthTarget, null, 'Shared path does not allocate an unused depth target');
assert.equal(renderer.draws.length, 4, 'March, two blurs and composite only');
assert.ok(renderer.draws.every(draw => draw.scene !== world.shadowScene));
assert.equal(sharedShafts.march.uniforms.uDepth.value, shared.depthTexture);
assert.equal(sharedShafts.march.uniforms.uProjectionInverse.value, camera.projectionMatrixInverse);
assert.deepEqual(sharedShafts.march.uniforms.uCameraWorld.value.elements, camera.matrixWorld.elements);
assert.equal(sharedShafts.march.uniforms.uMaxDistance.value, 128);
assert.equal(sharedShafts.width, 50); assert.equal(sharedShafts.height, 40);
assert.equal(renderer.target, shared);
assert.notEqual(renderer.draws[0].target, shared, 'Do not sample depth while rendering into its attachment');

// Switching to legacy output restores the shortened projection and lazy
// fallback allocation. A failed geometry pass must restore caster visibility.
const caster = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
caster.userData.chunk = {cx:0,cz:0,maxY:16}; caster.visible = false; world.shadowScene.add(caster);
renderer.target = null; renderer.draws.length = 0;
sharedShafts.render(camera, world, {}, new THREE.Color(1,1,1), .0012, .12, 128);
assert.equal(sharedShafts.lastDepthSource, 'fallback');
assert.equal(sharedShafts.lastDepthDraws, 1);
assert.equal(renderer.draws.length, 5); assert.equal(renderer.draws[0].scene, world.shadowScene);
assert.equal(sharedShafts.camera.far, 128);
assert.equal(sharedShafts.march.uniforms.uProjectionInverse.value, sharedShafts.camera.projectionMatrixInverse);
assert.equal(caster.visible, false);
const draw = renderer.render;
renderer.render = scene => { if(scene===world.shadowScene) throw new Error('depth failure'); };
assert.throws(() => sharedShafts.render(camera, world, {}, new THREE.Color(), .0012, .12, 128), /depth failure/);
assert.equal(caster.visible, false); assert.equal(renderer.target, null);
renderer.render = draw;
sharedShafts.dispose();
assert.equal(depthDisposals, 0, 'Effect does not own the main scene depth');
caster.geometry.dispose();caster.material.dispose();shared.depthTexture.dispose();shared.dispose();
shafts.dispose();
console.log('OK: promienie — liniowa moc/kolor, głębia głównej klatki bez drugiego rysowania świata, fallback, projekcja, resize i przywracanie stanu.');
