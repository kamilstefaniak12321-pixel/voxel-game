// Prawdziwy helper, materiał wody i bufory Three. Atrapa renderera pozwala
// opóźnić osobno obie strony materiału, bez uruchamiania GPU ani świata.
// Uruchomienie: node tools/sprawdz_warmup_wody.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false });
                export const atlasAveragesReady = Promise.resolve();
                export const getTileColors = name => { const color = getAtlasAverage(name); return color ? [color] : []; };
                export const getAtlasAverage = () => null;
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { waterMaterial, setShadowDefine, setPotatoDefine } = await import('../src/rendering/BlockRenderData.js');
const { prewarmWaterMaterial, waterShaderVariantKey } = await import('../src/rendering/WaterMaterialWarmup.js');

const world = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
world.fog = new THREE.Fog(0x87ceeb, 20, 64);
world.add(new THREE.AmbientLight(), new THREE.DirectionalLight(), new THREE.DirectionalLight());
const existing = new THREE.Object3D(); existing.position.set(4, 5, 6); world.add(existing);
const originalChildren = world.children.slice(), originalFog = world.fog;
let materialDisposals = 0, checked = 0;
waterMaterial.addEventListener('dispose', () => materialDisposals++);
const microtasks = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

function fixture({ asynchronous = true, compilationError = null, initializationError = null } = {}) {
    let finish, fail;
    const compilation = new Promise((resolve, reject) => { finish = resolve; fail = reject; });
    const state = { calls: [], geometry: null, disposals: 0, backReady: false, initialized: [], compiledTargets: [] };
    const materialBefore = { side: waterMaterial.side, version: waterMaterial.version,
        defines: waterMaterial.defines && { ...waterMaterial.defines }, map: waterMaterial.map,
        transparent: waterMaterial.transparent, forceSinglePass: waterMaterial.forceSinglePass,
        onBeforeCompile: waterMaterial.onBeforeCompile };
    const back = { isReady: () => state.backReady, getUniforms() {
        if (initializationError) throw initializationError;
        state.initialized.push('back');
    } };
    const front = { isReady: () => true, getUniforms() { state.initialized.push('front'); } };
    const properties = { currentProgram: front, programs: new Map([['back', back], ['front', front]]) };
    const capture = (method, preparation, passedCamera, targetScene) => {
        state.calls.push(method);
        state.compiledTargets.push(renderer.target);
        assert.notEqual(preparation, world, 'Pomocniczy mesh nie trafia do żywego świata');
        assert.equal(targetScene, world, 'Kompilacja musi używać świateł i mgły właściwej sceny');
        assert.equal(passedCamera, camera);
        assert.equal(preparation.children.length, 1);
        const mesh = preparation.children[0];
        assert.equal(mesh.material, waterMaterial, 'Przygotuj oryginalny materiał, nie klon z osobnym cache');
        state.geometry = mesh.geometry;
        state.geometry.addEventListener('dispose', () => state.disposals++);
        assert.equal(state.geometry.getAttribute('position').itemSize, 3);
        assert.equal(state.geometry.getAttribute('normal').itemSize, 3);
        assert.equal(state.geometry.getAttribute('uv').itemSize, 2);
        const color = state.geometry.getAttribute('color');
        assert.equal(color.itemSize, 4, 'RGB wybrałoby inny program niż rzeczywiste RGBA chunków');
        assert.equal(color.normalized, true);
        assert.ok(color.array instanceof Uint8Array);
        if (compilationError) throw compilationError;
    };
    const renderer = {
        target: { name: 'previous target' }, face: 2, level: 1,
        viewport: new THREE.Vector4(3, 4, 64, 64), scissor: new THREE.Vector4(5, 6, 32, 32), scissorTest: true,
        getRenderTarget() { return this.target; },
        getActiveCubeFace() { return this.face; },
        getActiveMipmapLevel() { return this.level; },
        getViewport(out) { return out.copy(this.viewport); },
        getScissor(out) { return out.copy(this.scissor); },
        getScissorTest() { return this.scissorTest; },
        setRenderTarget(target, face = 0, level = 0) {
            this.target = target; this.face = face; this.level = level;
            this.viewport.set(0, 0, 256, 256); this.scissor.set(0, 0, 256, 256); this.scissorTest = false;
        },
        setViewport(value) { this.viewport.copy(value); },
        setScissor(value) { this.scissor.copy(value); },
        setScissorTest(value) { this.scissorTest = value; },
        properties: { get(material) { assert.equal(material, waterMaterial); return properties; } },
        compile(...args) { capture('compile', ...args); }
    };
    if (asynchronous) renderer.compileAsync = (...args) => { capture('compileAsync', ...args); return compilation; };
    const verify = () => {
        assert.equal(state.disposals, 1, 'Pomocnicza geometria zwolniona dokładnie raz');
        assert.equal(materialDisposals, 0, 'Nie wolno zwalniać materiału używanego przez świat');
        assert.deepEqual(world.children, originalChildren); assert.equal(world.fog, originalFog);
        assert.deepEqual(existing.position.toArray(), [4, 5, 6]); assert.equal(existing.parent, world);
        for (const [key, value] of Object.entries(materialBefore)) assert.deepEqual(waterMaterial[key], value, `Zmieniono materiał: ${key}`);
        checked++;
    };
    return { renderer, state, finish, fail, verify };
}

// compileAsync Three może skończyć po gotowej stronie front. Dopóki back
// jest niegotowy, helper musi pozostać pending i utrzymać swoją geometrię.
{
    const f = fixture(), timers = [], originalSetTimeout = globalThis.setTimeout;
    let completed = false;
    try {
        globalThis.setTimeout = callback => { timers.push(callback); return timers.length; };
        const pending = prewarmWaterMaterial(f.renderer, world, camera, true);
        pending.then(() => { completed = true; });
        assert.deepEqual(f.state.calls, ['compileAsync']);
        f.finish(); await microtasks();
        assert.equal(completed, false); assert.equal(f.state.disposals, 0);
        assert.deepEqual(f.state.initialized, []);
        assert.equal(timers.length, 1, 'Oczekiwanie na niegotowy BackSide');
        timers.shift()(); await microtasks();
        assert.equal(completed, false, 'Gotowy FrontSide nie wystarcza');
        assert.equal(f.state.disposals, 0); assert.equal(timers.length, 1);
        f.state.backReady = true; timers.shift()(); await pending;
        assert.deepEqual(f.state.initialized, ['back', 'front']);
        f.verify();
    } finally { globalThis.setTimeout = originalSetTimeout; }
}

// Odrzucenie kompilacji albo inicjalizacji nie zostawia geometrii i nie
// niszczy wspólnego materiału; błąd musi trafić do Game.start.
{
    const f = fixture(), error = new Error('compile rejected');
    const pending = prewarmWaterMaterial(f.renderer, world, camera, true);
    const rejected = assert.rejects(pending, error); f.fail(error); await rejected;
    assert.deepEqual(f.state.initialized, []); f.verify();
}
{
    const error = new Error('uniform initialization failed'), f = fixture({ initializationError: error });
    f.state.backReady = true;
    const pending = prewarmWaterMaterial(f.renderer, world, camera, true);
    const rejected = assert.rejects(pending, error); f.finish(); await rejected; f.verify();
}
for (const asynchronous of [false, true]) {
    const error = new Error('compile threw'), f = fixture({ asynchronous, compilationError: error });
    assert.throws(() => prewarmWaterMaterial(f.renderer, world, camera, asynchronous), error); f.verify();
}

// Starszy renderer bez compileAsync oraz celowa zmiana ustawień używają
// compile i kończą inicjalizację obu programów przed powrotem do gry.
for (const asynchronous of [false, true]) {
    const f = fixture({ asynchronous: false });
    assert.equal(prewarmWaterMaterial(f.renderer, world, camera, asynchronous), undefined);
    assert.deepEqual(f.state.calls, ['compile']); assert.deepEqual(f.state.initialized, ['back', 'front']); f.verify();
}

// HDR i ekran wymagają różnych programów. Wiązanie celu trwa tylko przez
// synchroniczny początek compileAsync, również w ścieżce wyjątków.
for (const asynchronous of [false, true]) {
    const f = fixture({ asynchronous }), target = { name: 'linear HDR' };
    const before = { target: f.renderer.target, face: f.renderer.face, level: f.renderer.level,
        viewport: f.renderer.viewport.clone(), scissor: f.renderer.scissor.clone(), scissorTest: f.renderer.scissorTest };
    f.state.backReady = true;
    const pending = prewarmWaterMaterial(f.renderer, world, camera, asynchronous, target);
    assert.deepEqual(f.state.compiledTargets, [target]);
    for (const [key, value] of Object.entries(before)) assert.deepEqual(f.renderer[key], value, `Warmup zmienił renderer: ${key}`);
    if (asynchronous) {
        // Inna klatka może użyć renderera przed ukończeniem kompilacji.
        const newerTarget = { name: 'next frame target' };
        f.renderer.setRenderTarget(newerTarget);
        f.finish(); await pending;
        assert.equal(f.renderer.target, newerTarget, 'Zakończenie Promise nie przywraca starego render target');
    }
    f.verify();
}
{
    const error = new Error('HDR compile threw'), f = fixture({ compilationError: error });
    const previous = f.renderer.target;
    assert.throws(() => prewarmWaterMaterial(f.renderer, world, camera, true, { name: 'HDR' }), error);
    assert.equal(f.renderer.target, previous);
    assert.deepEqual(f.renderer.viewport.toArray(), [3, 4, 64, 64]);
    assert.deepEqual(f.renderer.scissor.toArray(), [5, 6, 32, 32]);
    assert.equal(f.renderer.scissorTest, true); f.verify();
}

// Klucz opisuje kod shadera, nie kolejność wpisów ani bieżące uniformy.
const originalDefines = waterMaterial.defines;
try {
    waterMaterial.defines = { SECOND: 2, FIRST: '' }; const key = waterShaderVariantKey();
    assert.notEqual(waterShaderVariantKey({ width: 100 }), key, 'Liniowy target wymaga odrębnego warmup');
    assert.equal(waterShaderVariantKey({ width: 100 }), waterShaderVariantKey({ width: 200 }),
        'Rozdzielczość render target nie zmienia wariantu programu');
    waterMaterial.defines = { FIRST: '', SECOND: 2 }; assert.equal(waterShaderVariantKey(), key);
    waterMaterial.needsUpdate = true; assert.equal(waterShaderVariantKey(), key);
    setShadowDefine([waterMaterial], true, false); const nearKey = waterShaderVariantKey(); assert.notEqual(nearKey, key);
    setShadowDefine([waterMaterial], true, false); assert.equal(waterShaderVariantKey(), nearKey);
    setShadowDefine([waterMaterial], true, true); const distantKey = waterShaderVariantKey(); assert.notEqual(distantKey, nearKey);
    setPotatoDefine([waterMaterial], true); assert.notEqual(waterShaderVariantKey(), distantKey);
    setPotatoDefine([waterMaterial], false); assert.equal(waterShaderVariantKey(), distantKey);
} finally { waterMaterial.defines = originalDefines; }

console.log(`OK: warmup wody: ${checked} ścieżek, oczekiwanie na obie strony, cleanup sukcesu/błędów, RGBA, właściwa scena i stabilny klucz wariantu.`);
