import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

const localUrl = path => new URL(`../${path}`, import.meta.url).href;
const gameUrl = localUrl('src/game/Game.js'), commandUrl = localUrl('src/commands/gameCommands.js');
// Use actual Game.render and commands; their unrelated world/audio/UI
// dependencies are not constructed by these narrow lifecycle regressions.
const allowedImports = new Map([
    [gameUrl, new Set(['three', '../rendering/WorldOutput.js', '../rendering/LightingDiagnostics.js', '../config.js'])],
    [commandUrl, new Set(['./CommandRegistry.js', '../rendering/LightingDiagnostics.js', '../settings/Settings.js',
        '../ui/texts.js', '../blocks/BlockRegistry.js', '../items/ItemRegistry.js', '../blocks/trees.js',
        '../blocks/treePacks.js', '../audio/sounds.js', '../world/terrain/rocks.js', '../config.js'])]
]);
const stubNames = new Map();
for (const [parent, allowed] of allowedImports) {
    for (const [, bindings, specifier] of readFileSync(new URL(parent), 'utf8').matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];$/gm)) {
        if (allowed.has(specifier)) continue;
        const names = bindings.trim().startsWith('{') ? bindings.slice(bindings.indexOf('{') + 1, bindings.lastIndexOf('}'))
            .split(',').map(name => name.trim().split(/\s+as\s+/)[0]).filter(Boolean) : [];
        const key = `${parent}|${specifier}`;
        const exports = stubNames.get(key) || new Set();
        names.forEach(name => exports.add(name));
        stubNames.set(key, exports);
    }
}
const stubs = new Map([...stubNames].map(([key, names]) => [key,
    `data:text/javascript,${encodeURIComponent([...names].map(name => `export const ${name}=undefined;`).join('\n'))}`]));

registerHooks({
    resolve(specifier, context, next) {
        const stub = stubs.get(`${context.parentURL}|${specifier}`);
        if (stub) return { url: stub, shortCircuit: true };
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});
const { WorldOutput, neutralToneMap, sampleWorldOutput } = await import('../src/rendering/WorldOutput.js');
const { lightingUniforms } = await import('../src/rendering/LightingDiagnostics.js');
const { Game } = await import(gameUrl);
const { GAME_COMMANDS } = await import(commandUrl);
const { Settings } = await import('../src/settings/Settings.js');
const THREE = await import('../lib/three/three.module.js');
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

// Szarości i albedo poniżej progu pozostają neutralne. Ekspozycja
// działa w liniowej energii, a końcowa konwersja jest dokładnym sRGB.
assert.deepEqual(neutralToneMap([0, 0, 0]), [0, 0, 0]);
assert.deepEqual(neutralToneMap([0.18, 0.18, 0.18]), [0.18, 0.18, 0.18]);
assert.deepEqual(neutralToneMap([0.02, 0.2, 0.6]), [0.02, 0.2, 0.6]);
near(sampleWorldOutput([0.18, 0.18, 0.18])[0], 0.46135612950044164);
near(sampleWorldOutput([0.001, 0.001, 0.001])[0], 0.01292);
assert.deepEqual(sampleWorldOutput([0, 0, 0]), [0, 0, 0]);
assert.deepEqual(neutralToneMap([0.2, 0.1, 0.05], 2), [0.4, 0.2, 0.1]);

// Neutralny operator nie obcina osobno R/G/B: blask lampy zachowuje
// odcień, a jasna biała kostka wciąż odcina się od szarej.
for (const rgb of [[1, 0.5, 0.1], [8, 2, 1], [0.1, 9, 0.3], [40, 40, 40]]) {
    const mapped = neutralToneMap(rgb);
    assert.ok(mapped.every(channel => channel >= 0 && channel < 1));
    near(mapped[0] / mapped[1], rgb[0] / rgb[1]);
    near(mapped[1] / mapped[2], rgb[1] / rgb[2]);
}
const gray = sampleWorldOutput([0.18, 0.18, 0.18])[0];
const white = sampleWorldOutput([1, 1, 1])[0];
assert.ok(white > gray && white < 1);
let previous = 0;
for (let i = 0; i <= 10000; i++) {
    const current = neutralToneMap(Array(3).fill(i / 100))[0];
    assert.ok(current >= previous && current < 1);
    previous = current;
}
near(neutralToneMap([0.6 + 1e-7, 0, 0])[0], 0.6 + 1e-7, 1e-12);
const grayOutput = sampleWorldOutput([0.8, 0.3, 0.1], { grayscale: true });
near(grayOutput[0], grayOutput[1]);
near(grayOutput[1], grayOutput[2]);
// Dane diagnostyczne omijają również ekspozycję; 0/1 pozostają 0/1.
sampleWorldOutput([0, 1, 0], { exposure: 0.1, bypassTone: true }).forEach((value, i) => near(value, i === 1 ? 1 : 0));
assert.deepEqual(sampleWorldOutput([0.1, 0.2, 0.3], { exposure: 0, bypassTone: true }),
    sampleWorldOutput([0.1, 0.2, 0.3], { exposure: 5, bypassTone: true }));

// Kontrakt renderera: baza nie alokuje celu, natural składa się raz,
// po zmianie rozmiaru nie namnaża tekstur i przywraca poprzedni cel.
function rendererWith(hdr = true, antialias = true, maxSamples = 4) {
    return {
        capabilities: { isWebGL2: true, maxSamples }, extensions: { has: name => hdr && name === 'EXT_color_buffer_float' },
        getContext() { return { getContextAttributes: () => ({ antialias }) }; },
        autoClear: true, target: null, draws: 0, clears: 0, width: 800, height: 600,
        getRenderTarget() { return this.target; }, getActiveCubeFace() { return 0; }, getActiveMipmapLevel() { return 0; },
        getDrawingBufferSize(out) { return out.set(this.width, this.height); },
        setRenderTarget(target) { this.target = target; }, clear() { this.clears++; },
        render() { this.draws++; }
    };
}
for (const hdr of [true, false]) {
    const renderer = rendererWith(hdr), output = new WorldOutput(renderer);
    assert.equal(output.begin(false), false);
    output.end();
    assert.equal(output.target, null);
    assert.equal(renderer.draws, 0);
    assert.equal(renderer.autoClear, true);
    const prepared = output.prepareTarget();
    assert.equal(renderer.target, null, 'Warmup nie może pozostawić zbindowanego celu');
    assert.equal(renderer.clears, 0, 'Warmup nie czyści obrazu');
    assert.equal(renderer.draws, 0, 'Warmup nie prezentuje klatki');
    assert.equal(prepared.width, 800);
    output.begin(true);
    const target = output.target;
    assert.equal(target, prepared, 'Warmup i klatka korzystają z tego samego celu');
    assert.equal(target.texture.type, hdr ? THREE.HalfFloatType : THREE.UnsignedByteType);
    assert.equal(target.texture.colorSpace, THREE.LinearSRGBColorSpace);
    assert.equal(target.samples, 4, 'HDR musi zachować wygładzanie krawędzi głównego kontekstu');
    assert.equal(renderer.target, target);
    assert.equal(renderer.autoClear, false);
    assert.equal(renderer.clears, 1);
    output.end();
    assert.equal(renderer.target, null);
    assert.equal(renderer.autoClear, true);
    assert.equal(renderer.draws, 1);
    output.end();
    assert.equal(renderer.draws, 1, 'Jedna klatka nie może dostać drugiego wyjścia');
    renderer.width = 1600;
    output.begin(true, { debugView: 5 });
    assert.equal(output.target, target);
    assert.equal(target.width, 1600);
    assert.equal(output.material.uniforms.uBypassTone.value, 1);
    output.end();
    lightingUniforms.uLightingDebug.value = 12;
    output.begin(true);
    assert.equal(output.material.uniforms.uGrayscale.value, 1);
    assert.equal(output.material.uniforms.uBypassTone.value, 0);
    output.end();
    lightingUniforms.uLightingDebug.value = 0;
    const parentTarget = new THREE.WebGLRenderTarget(64, 32);
    renderer.target = parentTarget;
    output.begin(true);
    assert.equal(target.width, 64);
    assert.equal(target.height, 32);
    renderer.render = () => { throw new Error('Próba błędu renderera'); };
    assert.throws(() => output.end(), /Próba błędu/);
    assert.equal(renderer.target, parentTarget);
    assert.equal(renderer.autoClear, true);
    assert.equal(output.active, false);
    assert.equal(output.stats().mode, hdr ? 'hdr16f' : 'ldr8');
    assert.equal(output.stats().estimatedBytes, 64 * 32 * (hdr ? 12 : 8) * 5);
    output.dispose();
    parentTarget.dispose();
}
for (const [antialias, maximum, expected] of [[false, 8, 0], [true, 2, 2], [true, 8, 4], [true, 0, 0]]) {
    const output = new WorldOutput(rendererWith(true, antialias, maximum));
    assert.equal(output.prepareTarget().samples, expected);
    assert.equal(output.stats().samples, expected);
    output.dispose();
}

// Both A/B modes must offer grayscale. The old full-colour path bypasses
// the new target/operator; its grayscale view uses only linear luma + sRGB.
for (const look of ['baseline', 'natural']) for (const debug of [0, 12]) {
    const renderer = rendererWith(true, false);
    renderer.info = { reset() {} }; renderer.clearDepth = () => {};
    const output = new WorldOutput(renderer);
    const game = Object.assign(Object.create(Game.prototype), {
        renderer, worldOutput: output, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
        shadows: { render() {} }, campfires: { renderer: { renderShadows() {} } },
        sky: { lightingLook: look, render() {} }, meteorites: { shake: 0 }, skyfall: { shake: 0 },
        settings: { get: () => false }, landDip: 0, water: { underwater: false },
        spaceView: { renderBehind() {}, renderFront() {} }, farTerrain: { render() {} }, renderLightShafts() {}
    });
    lightingUniforms.uLightingDebug.value = debug;
    game.render();
    const composed = look === 'natural' || debug === 12;
    assert.equal(renderer.draws, composed ? 2 : 1, `${look}/${debug}: world + exactly one optional output`);
    assert.equal(output.target !== null, composed);
    assert.equal(output.active, false);
    assert.equal(renderer.target, null);
    if (composed) {
        assert.equal(output.material.uniforms.uGrayscale.value, debug === 12 ? 1 : 0);
        assert.equal(output.material.uniforms.uBypassTone.value, look === 'baseline' ? 1 : 0);
    }
    output.dispose();
}
lightingUniforms.uLightingDebug.value = 0;

// Commands use real Settings and diagnostics. A request for a legacy model
// must activate it, while camel-case views must remain distinct from sky light.
{
    const previousStorage = globalThis.localStorage;
    const savedSettings = new Map();
    globalThis.localStorage = {
        getItem: key => savedSettings.get(key) ?? null,
        setItem: (key, value) => savedSettings.set(key, String(value))
    };
    const settings = new Settings(), command = GAME_COMMANDS.find(entry => entry.name === 'swiatlo');
    const run = args => command.run(args, { game: { settings } });
    settings.set('lightingLook', 'natural');
    assert.match(run(['model', 'klasyczne']), /Poprzednia/);
    assert.equal(settings.get('lightingLook'), 'baseline');
    assert.equal(settings.get('lightingModel'), 'classic');
    run(['paleta', 'naturalna']);
    assert.equal(settings.get('lightingLook'), 'natural');
    run(['model', 'atmosfera']);
    assert.equal(settings.get('lightingLook'), 'baseline');
    assert.equal(settings.get('lightingModel'), 'world');
    run(['paleta', 'naturalna']);
    assert.throws(() => run(['model', 'niepoprawny']));
    assert.equal(settings.get('lightingLook'), 'natural');
    for (const [name, index] of [['skyAccess', 4], ['sunVisibility', 3], ['sky', 8]]) {
        run(['widok', name]); assert.equal(lightingUniforms.uLightingDebug.value, index);
    }
    run(['zrodlo', 'sky', 'wyl']); assert.equal(lightingUniforms.uLightingComponents.value.z, 0);
    run(['reset']);
    assert.equal(lightingUniforms.uLightingDebug.value, 0);
    assert.deepEqual(lightingUniforms.uLightingComponents.value.toArray(), [1, 1, 1, 1]);
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
}
console.log('OK: pojedyncze wyjście, sRGB, HDR/LDR, lifecycle Game, szarości obu palet i rzeczywiste komendy diagnostyczne.');
