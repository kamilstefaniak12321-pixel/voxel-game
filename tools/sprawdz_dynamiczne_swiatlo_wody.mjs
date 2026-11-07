// CPU checks of live uniform ownership and shader assembly. Actual shader
// compilation and torch on/off pixels belong to the WebGL waterfall fixture.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format:'module', shortCircuit:true,
            source:'export const blockAtlasTexture=null,atlasAverageTexture=null;' };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format:'module' } : context);
    }
});

const { waterEffectLightUniforms: shared, WATER_EFFECT_DYNAMIC_LIGHT_GLSL: glsl } = await import('../src/rendering/WaterEffectDynamicLight.js');
const { DynamicLight, dynamicLightUniforms } = await import('../src/world/DynamicLight.js');
const { meteorLightUniforms, METEOR_LIGHT_GLSL } = await import('../src/rendering/meteorLight.js');
const { campfireLightUniforms, CAMPFIRE_LIGHT_GLSL } = await import('../src/rendering/CampfireLight.js');
const { SURFACE_LIGHTING_GLSL } = await import('../src/rendering/SurfaceLighting.js');
const terrain = await readFile(new URL('../src/rendering/BlockRenderData.js', import.meta.url), 'utf8');
let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };

for (const group of [dynamicLightUniforms, meteorLightUniforms, campfireLightUniforms]) {
    for (const [name, uniform] of Object.entries(group)) {
        ok(shared[name] === uniform, `${name} shares its existing engine uniform by identity`);
    }
}
// A new world replaces the texture while already-compiled effect materials
// retain the same uniform object. Disposal must disable every consumer too.
const first = new DynamicLight(), firstTexture = first.texture;
ok(shared.uDynamicLight.value === firstTexture, 'new volume reaches an existing effect uniform');
dynamicLightUniforms.uDynamicEnabled.value = 1;
eq(shared.uDynamicEnabled.value, 1, 'enabling the engine enables the effect without a refresh');
first.dispose();
eq(shared.uDynamicEnabled.value, 0, 'engine disposal disables the effect without a CPU scan');
const second = new DynamicLight();
ok(second.texture !== firstTexture && shared.uDynamicLight.value === second.texture,
    'recreated world supplies its new texture to the same effect uniform');
second.dispose();
ok(glsl.includes(METEOR_LIGHT_GLSL) && glsl.includes(CAMPFIRE_LIGHT_GLSL),
    'analytic lighting reuses the exact existing implementations and shadow sampling');

const compact = source => source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
const dynamicBody = source => source.match(/if \(uDynamicEnabled > 0\.5\) \{([\s\S]*?)#endif/)[0];
const terrainBody = dynamicBody(terrain)
    .replaceAll('vWorldPosition', 'worldPosition').replaceAll('vWorldNormal', 'worldNormal')
    .replaceAll('vSurfaceOcclusion', 'occlusion')
    .replace('blockLocal = max(blockLocal,', 'return max(staticLinear,');
eq(compact(dynamicBody(glsl)), compact(terrainBody),
    'volume bounds, x/z/y axes, face shade, AO, decode and channel maximum match real terrain GLSL');
eq((glsl.match(/texture\(uDynamicLight,/g) ?? []).length, 1,
    'one volume fetch exists, inside enabled and inside-volume branches');
ok(!glsl.includes('surfaceDecodeLight(staticLinear)'), 'already-linear static light is never decoded twice');
ok(glsl.includes('return staticLinear;'), 'disabled/outside-volume paths preserve all static RGB channels');
ok(glsl.includes('return surfaceLocalRadiance(albedo,') &&
    glsl.includes('meteorLight(worldPosition, worldNormal) + campfireLight(worldPosition, worldNormal)'),
    'analytic contribution retains the existing local-light diagnostics and albedo response');
for (const name of ['surfaceDecodeLight', 'surfaceFaceShade', 'surfaceLocalRadiance']) {
    ok(SURFACE_LIGHTING_GLSL.includes(`vec3 ${name}(`) || SURFACE_LIGHTING_GLSL.includes(`float ${name}(`),
        `${name} is available from the documented preceding surface GLSL`);
}

// Resolve only this helper's version guards, not an alternative GLSL compiler.
// This catches leaking sampler3D/texture calls into the WebGL1 fallback.
function forVersion(version) {
    const stack = [], output = [];
    let active = true;
    for (const line of glsl.split('\n')) {
        if (line.trim() === '#if __VERSION__ >= 300') {
            stack.push({ parent:active, condition:version >= 300 }); active &&= version >= 300;
        } else if (line.trim() === '#else') {
            active = stack.at(-1).parent && !stack.at(-1).condition;
        } else if (line.trim() === '#endif') {
            active = stack.pop().parent;
        } else if (active) output.push(line);
    }
    assert.equal(stack.length, 0, 'balanced version guards');
    return output.join('\n');
}
const legacy = forVersion(100), modern = forVersion(300);
for (const forbidden of ['sampler3D', 'uDynamic', 'uMeteor', 'uFire', 'texture(', 'meteorLight(', 'campfireLight(']) {
    ok(!legacy.includes(forbidden), `WebGL1 fallback excludes ${forbidden}`);
}
ok(legacy.includes('return staticLinear;') && legacy.includes('return vec3(0.0);'),
    'WebGL1 keeps static light and has zero unsupported analytic contribution, like terrain');
for (const name of ['waterEffectLocalLight', 'waterEffectAnalyticRadiance', 'meteorLight', 'campfireLight']) {
    eq((modern.match(new RegExp(`vec3 ${name}\\(`, 'g')) ?? []).length, 1,
        `WebGL2 includes exactly one ${name} definition`);
}
console.log(`PASS dynamiczne światło efektów wody: ${checks} sprawdzeń (uniformy/GLSL; GPU osobno).`);
