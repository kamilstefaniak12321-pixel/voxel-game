// Actual Three buffers/materials and real voxel chunks; no DOM or GPU.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true, source: `
            import {Color} from 'three';
            export const blockAtlasTexture=null,atlasAverageTexture=null;
            export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
            export const getTileColors=()=>[],getAtlasAverage=()=>new Color(.4,.5,.6);
            export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
            export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};` };
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});
const THREE = await import('three');
const { WaterfallWetRocks, WET_ROCK_CAPS: CAPS } = await import('../src/rendering/WaterfallWetRocks.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { getBlockId, getWaterLevel, fallingWaterId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE: S, CHUNK_HEIGHT: H } = await import('../src/config.js');
const { setShadowDefine } = await import('../src/rendering/BlockRenderData.js');
const { shadowUniforms } = await import('../src/rendering/Shadows.js');
const { skyUniforms } = await import('../src/sky/skyShader.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const { lightingUniforms } = await import('../src/rendering/LightingDiagnostics.js');
const { composeSurfaceRadiance } = await import('../src/rendering/SurfaceLighting.js');
const { waterEffectLightUniforms, WATER_EFFECT_DYNAMIC_LIGHT_GLSL } = await import('../src/rendering/WaterEffectDynamicLight.js');
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const near = (a, b, label) => ok(Math.abs(a - b) < .00001, `${label}: ${a} != ${b}`);
const STONE = getBlockId('stone'), SOURCE = getBlockId('water');
const ROCK_TYPES = ['stone', 'lepidolite', 'granite', 'limestone', 'sandstone', 'slate', 'basalt', 'polished_stone'];
const ROCK_IDS = new Set(ROCK_TYPES.map(getBlockId));
const NORMALS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];

function fixture() {
    const chunks = new Map(), counters = { blocks: 0, chunks: 0, lights: 0, generated: 0 };
    const world = { chunks,
        getChunk(cx, cz) { counters.chunks++; return chunks.get(`${cx},${cz}`) ?? null; },
        getLight(x) { counters.lights++; return x < 0 ? { sky: 0, red: 0, green: 0, blue: 0 }
            : { sky: 0, red: 255, green: 128, blue: 0 }; },
        getBlockId(x, y, z) {
            if (y < 0 || y >= H) return 0;
            const cx = Math.floor(x / S), cz = Math.floor(z / S);
            return chunks.get(`${cx},${cz}`)?.getId(x - cx * S, y, z - cz * S) ?? -1;
        },
        generateChunk() { counters.generated++; throw new Error('Wet rocks must not generate terrain'); }
    };
    const f = { world, chunks, counters,
        reset() { counters.blocks = counters.chunks = counters.lights = counters.generated = 0; },
        ensure(cx, cz) {
            const key = `${cx},${cz}`;
            let chunk = chunks.get(key);
            if (!chunk) {
                chunk = new Chunk(cx, cz);
                chunk.blocks = new Proxy(chunk.blocks, { get(target, property) {
                    if (typeof property === 'string' && /^\d+$/.test(property)) counters.blocks++;
                    return Reflect.get(target, property, target);
                } });
                chunks.set(key, chunk);
            }
            return chunk;
        },
        set(x, y, z, id) {
            const cx = Math.floor(x / S), cz = Math.floor(z / S), chunk = f.ensure(cx, cz);
            if (chunk.setId(x - cx * S, y, z - cz * S, typeof id === 'string' ? getBlockId(id) : id)) chunk.meshRevision++;
            return chunk;
        },
        impact(x = 0, z = 0, fall = 16, pool = true) {
            for (let cz = Math.floor((z - 4) / S); cz <= Math.floor((z + 4) / S); cz++) {
                for (let cx = Math.floor((x - 4) / S); cx <= Math.floor((x + 4) / S); cx++) f.ensure(cx, cz);
            }
            for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
                f.set(x + dx, 19, z + dz, STONE);
                if (pool) f.set(x + dx, 20, z + dz, SOURCE);
            }
            if (!pool) f.set(x, 20, z, STONE);
            for (let y = 21; y <= 24; y++) f.set(x, y, z, fallingWaterId(Math.max(1, fall - y + 21)));
            return { x, y: 21, z, fall, distance: Math.hypot(x, z) };
        }
    };
    return f;
}

function create(f, options = { now: () => 0 }) {
    return new WaterfallWetRocks(new THREE.Scene(), f.world, options);
}
function finish(wet) {
    for (let n = 0; n < 300 && wet.stats().queued; n++) {
        wet.update(1 / 60);
        ok(wet.stats().lastProcessed <= CAPS.cellsPerUpdate, 'Discovery never exceeds 32 cells per update');
        ok(wet.stats().lastBlockReads <= CAPS.cellsPerUpdate * 7 + CAPS.fields * 2, 'Per-frame reads are bounded by inspected cells');
    }
    eq(wet.stats().queued, 0, 'Bounded discovery finishes');
}
function patches(wet) { return wet.entries.flatMap(entry => entry.patches); }
function checkPatches(wet, f) {
    for (const entry of wet.entries) {
        ok(entry.patches.length <= 64 && entry.dependencies.length <= 4, 'Each field has bounded faces and chunk dependencies');
        const seen = new Set();
        for (const patch of entry.patches) {
            const key = `${patch.x},${patch.y},${patch.z},${patch.side}`;
            ok(!seen.has(key), 'Each exposed face appears once within a field'); seen.add(key);
            ok(ROCK_IDS.has(f.world.getBlockId(patch.x, patch.y, patch.z)), 'Every face belongs to an eligible stone');
            const normal = NORMALS[patch.side];
            const adjacent = f.world.getBlockId(patch.x + normal[0], patch.y + normal[1], patch.z + normal[2]);
            eq(adjacent, 0, 'Every test face is exposed to known air');
            ok(Math.abs(patch.x - entry.x) <= 4 && Math.abs(patch.z - entry.z) <= 4 && Math.abs(patch.y - entry.y) <= 4,
                'Discovery remains local to the waterfall');
        }
    }
}
function shaderOf(material) {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader);
    return shader;
}
function expand(source) {
    return source.replace(/#include <(\w+)>/g, (_, name) => {
        assert.equal(typeof THREE.ShaderChunk[name], 'string', `Three shader chunk ${name} exists`);
        return expand(THREE.ShaderChunk[name]);
    });
}

// An above-water stone is wet, underwater pool floor stays untouched. A bank
// block at pool height receives only its exposed top, never submerged sides.
{
    const f = fixture(), landing = f.impact(-1, -1);
    f.set(1, 21, -1, STONE); f.set(-3, 21, -1, STONE); f.set(-1, 20, 1, STONE);
    const wet = create(f); wet.setLandings([landing]); finish(wet);
    ok(wet.faces > 0 && wet.mesh.visible, 'Waterfall creates visible wet stone surfaces');
    ok(patches(wet).some(p => p.x >= 0) && patches(wet).some(p => p.x < 0), 'Wet rocks cross negative chunk boundaries');
    ok(!patches(wet).some(p => p.y === 19), 'Submerged pool floor is not painted');
    const bank = patches(wet).filter(p => p.x === -1 && p.y === 20 && p.z === 1);
    eq(bank.map(p => p.side), [3], 'Only the exposed top of a partly submerged bank block is wet');
    checkPatches(wet, f);
    eq(wet.mesh.geometry, wet.geometry, 'One mesh owns the reusable geometry');
    eq(wet.mesh.material, wet.material, 'One mesh uses one material');
    eq(wet.materials, [wet.material], 'Material list supports shared shadow settings');
    eq(wet.stats().draws, 1, 'All wet faces draw in one batch');
    eq(wet.geometry.drawRange.count, wet.faces * 6, 'Draw range excludes unused capacity');
    for (let face = 0; face < wet.faces; face++) {
        const first = face * 4, pos = wet.geometry.attributes.position, normal = wet.geometry.attributes.normal;
        const a = new THREE.Vector3().fromBufferAttribute(pos, first);
        const b = new THREE.Vector3().fromBufferAttribute(pos, first + 1);
        const c = new THREE.Vector3().fromBufferAttribute(pos, first + 2);
        const n = new THREE.Vector3().fromBufferAttribute(normal, first);
        near(b.sub(a).cross(c.sub(a)).dot(n), 1, 'All face triangles have outward unit winding');
    }
    const lights = wet.geometry.attributes.wetLight;
    let dark = 0, lamp = 0;
    for (let i = 0; i < wet.faces * 4; i++) {
        eq(lights.getW(i), 0, 'No fake skylight in a cave');
        if (!lights.getX(i)) {
            eq([lights.getX(i), lights.getY(i), lights.getZ(i)], [0, 0, 0], 'Unlit stone retains zero local light'); dark++;
        } else {
            near(lights.getX(i), 1, 'Red lamp is decoded once');
            near(lights.getY(i), (128 / 255) ** 2.2, 'Colored lamp keeps its green proportion');
            eq(lights.getZ(i), 0, 'Colored lamp does not introduce blue'); lamp++;
        }
    }
    ok(dark > 0 && lamp > 0, 'Lighting is sampled at each exposed face, not borrowed from the impact');
    eq(composeSurfaceRadiance({ albedo: [.1, .2, .3], natural: [0, 0, 0] }), [0, 0, 0], 'Wet coat has no emission in complete darkness');
    eq(composeSurfaceRadiance({ albedo: [.1, .2, .3], natural: [0, 0, 0], local: [1, 0, 0], atmosphere: false }),
        [.1, 0, 0], 'Classic lighting preserves a red lamp on otherwise unlit wet rock');

    const before = { revision: wet.geometryRevision, patches: wet.entries[0].patches,
        version: wet.geometry.attributes.position.version, geometry: wet.geometry, material: wet.material };
    f.reset();
    for (let i = 0; i < 120; i++) wet.update(1 / 60);
    eq([f.counters.blocks, f.counters.lights, wet.lastProcessed], [0, 0, 0], 'Settled frames scan zero voxels and sample zero lights');
    ok(f.counters.chunks <= 120 * 4, 'Settled field only checks at most four chunk stamps');
    eq([wet.geometryRevision, wet.entries[0].patches, wet.geometry.attributes.position.version],
        [before.revision, before.patches, before.version], 'Animation does not rebuild or upload geometry');
    eq([wet.geometry, wet.material], [before.geometry, before.material], 'Animation reuses GPU resources');
    wet.setLandings([{ ...landing }]); wet.update(0);
    eq(wet.geometryRevision, before.revision, 'Equivalent refreshed landing list does not rebuild');
    f.set(100, 21, 100, STONE); wet.update(0);
    eq(wet.geometryRevision, before.revision, 'Unrelated chunk edit does not rebuild local rocks');

    const shader = shaderOf(wet.material);
    for (const [name, uniform] of Object.entries(shadowUniforms)) eq(shader.uniforms[name], uniform, `${name}: shared terrain shadow uniform`);
    for (const [name, uniform] of Object.entries(waterEffectLightUniforms)) eq(shader.uniforms[name], uniform,
        `${name}: held light, campfires and meteors share live engine uniforms`);
    eq(shader.uniforms.uAtmosphericLight, skyUniforms.uAtmosphericLight, 'Wet rocks share atmosphere mode');
    eq(shader.uniforms.uBrightness, viewUniforms.uBrightness, 'Wet rocks share brightness controls');
    eq(shader.uniforms.uUnderwater, viewUniforms.uUnderwater, 'Wet rocks share the camera underwater state');
    eq(shader.uniforms.uLightingDebug, lightingUniforms.uLightingDebug, 'Wet rocks share lighting diagnostics');
    eq(shader.uniforms.uWetTime, wet.material.uniforms.uWetTime, 'Animation updates the compiled shader by reference');
    ok(shader.fragmentShader.includes('surfaceRadiance(') && shader.fragmentShader.includes('applyBrightness('), 'Shared surface lighting is preserved');
    ok(shader.fragmentShader.includes('waterEffectLocalLight(vWetLight.rgb, vWetPosition, normalize(vWetNormal), 1.0)') &&
        !shader.fragmentShader.includes('vWetLight.rgb * uAtmosphericLight'), 'Raw local light reaches both classic and atmospheric surface composition');
    ok(shader.fragmentShader.includes(WATER_EFFECT_DYNAMIC_LIGHT_GLSL), 'Shared dynamic light helper is assembled into the actual wet material');
    const compositionAt = shader.fragmentShader.indexOf('outgoingLight = surfaceRadiance(');
    const analyticAt = shader.fragmentShader.indexOf('outgoingLight += waterEffectAnalyticRadiance(diffuseColor.rgb, vWetPosition, normalize(vWetNormal));');
    const brightnessAt = shader.fragmentShader.indexOf('outgoingLight = applyBrightness(');
    ok(compositionAt < analyticAt && analyticAt < brightnessAt, 'Analytic campfire/meteor light is composed after local light and before brightness');
    eq((shader.fragmentShader.match(/uniform highp sampler3D uDynamicLight;/g) ?? []).length, 1,
        'The wet material samples the one existing dynamic light volume');
    ok(shader.fragmentShader.includes('sunShadowLight(vWetPosition, normalize(vWetNormal), wetSky)'), 'Sun/moon shadow lookup uses actual stone world position and normal');
    ok(shader.fragmentShader.includes('vec3(0.0), vec3(0.0)'), 'No emission or invented bounce term is added');
    ok(shader.fragmentShader.includes('if (uUnderwater > 0.5) discard;'),
        'Underwater camera hides the coat and leaves the actual rock with its underwater fog');
    ok(!shader.vertexShader.includes('waterWave('), 'Rock geometry never moves with water waves');
    ok(!/uLandings|uImpacts|uWetPositions\[/.test(shader.fragmentShader), 'No per-fragment loop over waterfall emitters');
    for (const [enabled, far] of [[true, false], [true, true], [false, false]]) {
        setShadowDefine(wet.materials, enabled, far);
        eq(Object.hasOwn(wet.material.defines, 'USE_SUN_SHADOWS'), enabled, 'Shadow settings reach the wet material');
        eq(Object.hasOwn(wet.material.defines, 'USE_FAR_SHADOWS'), enabled && far, 'Far shadows follow the same setting');
        const variant = shaderOf(wet.material);
        for (const source of [variant.vertexShader, variant.fragmentShader]) {
            const assembled = expand(source);
            ok(!assembled.includes('#include <') && !/\bundefined\b|\bNaN\b/.test(assembled), 'All real Three includes expand without invalid tokens');
        }
    }
    eq([wet.material.transparent, wet.material.depthWrite, wet.material.side, wet.mesh.castShadow],
        [true, false, THREE.FrontSide, false], 'Coat blends over terrain and does not cast its own shadow');
    wet.dispose();
}

// Deliberate material eligibility: stone varieties and stone masonry, not
// wood, soil, leaves, glass, luminous meteorites, plaster or clay products.
for (const type of [...ROCK_TYPES, 'dirt', 'grass', 'dark_planks', 'lime_plaster', 'terracotta', 'meteorite']) {
    const f = fixture(), landing = f.impact();
    const id = getBlockId(type); ok(id > 0, `${type}: fixture material exists`);
    f.set(2, 21, 0, id);
    const wet = create(f); wet.setLandings([landing]); finish(wet);
    eq(patches(wet).some(p => p.x === 2 && p.y === 21 && p.z === 0), ROCK_TYPES.includes(type), `${type}: wet material eligibility`);
    wet.dispose();
}

// Spray cannot traverse a wall to paint the reverse side or a sealed pocket.
{
    const f = fixture(), landing = f.impact();
    for (let y = 18; y <= 25; y++) for (let z = -4; z <= 4; z++) f.set(1, y, z, STONE);
    f.set(3, 21, 0, STONE);
    const wet = create(f); wet.setLandings([landing]); finish(wet);
    ok(patches(wet).some(p => p.x === 1 && p.side === 0), 'Spray wets the facing wall');
    ok(!patches(wet).some(p => p.x === 1 && p.side === 1 || p.x > 1), 'Sealed reverse side receives no wet coat');
    wet.dispose();
}

// Edits invalidate complete and partial jobs; unloaded or replaced chunks
// cannot keep old floating decals. Restoring the chunk resumes discovery.
{
    const f = fixture(), landing = f.impact(); f.set(2, 21, 0, STONE);
    const wet = create(f); wet.setLandings([landing]); wet.update(0);
    ok(wet.jobs.length > 0, 'Fixture has a partially discovered field');
    f.set(2, 21, 0, 0); finish(wet);
    eq(wet.faces, 0, 'Edit during discovery cannot publish removed rock');
    f.set(2, 21, 0, STONE); wet.update(0); finish(wet);
    ok(wet.faces > 0, 'Adding rock locally rebuilds the cached field');
    const chunk = f.chunks.get('0,0'); f.chunks.delete('0,0'); wet.update(0);
    eq([wet.faces, wet.mesh.visible], [0, false], 'Unloading an impact chunk removes stale decals before drawing');
    f.chunks.set('0,0', chunk); wet.update(0); finish(wet);
    ok(wet.faces > 0, 'Same chunk reloading restarts discovery');
    const replacement = new Chunk(0, 0); replacement.meshRevision = chunk.meshRevision;
    f.chunks.set('0,0', replacement); wet.update(0); finish(wet);
    eq(wet.faces, 0, 'Same numeric revision with a new chunk identity never preserves old geometry');
    f.chunks.set('0,0', chunk); wet.update(0); finish(wet);
    chunk.blocks = new Uint16Array(S * S * H); wet.update(0); finish(wet);
    eq(wet.faces, 0, 'Replacing a block snapshot invalidates even without a revision increment');
    wet.dispose();
}
{
    const f = fixture(), landing = f.impact(); f.set(2, 21, 0, STONE);
    const wet = create(f); wet.setLandings([landing]); finish(wet);
    f.set(0, 21, 0, 0); wet.update(0); finish(wet);
    eq(wet.faces, 0, 'A stale landing cannot wet rocks after its waterfall disappeared');
    f.set(0, 21, 0, fallingWaterId(16)); f.set(0, 20, 0, 0); wet.update(0); finish(wet);
    eq(wet.faces, 0, 'A falling stream with no receiving support is not an impact');
    f.set(0, 20, 0, STONE); wet.update(0); finish(wet);
    ok(wet.faces > 0, 'Solid-floor impact still wets neighboring exposed rock');
    wet.setLandings([]); wet.update(0);
    eq([wet.faces, wet.entries.length, wet.jobs.length], [0, 0, 0], 'Removed landing clears all field data');
    wet.dispose();
}

// Global caps, fair slices, duplicate candidates, quality/off/re-enable and
// a fixed-size GPU allocation independent of how many landings are supplied.
{
    const f = fixture(), landings = [];
    for (let i = 0; i < 12; i++) {
        const x = i * 12, landing = f.impact(x, 0, 16, false);
        for (let z = -2; z <= 2; z++) for (let dx = -2; dx <= 2; dx++) {
            if ((dx || z) && (dx + z) % 2 === 0) f.set(x + dx, 21, z, STONE);
        }
        landings.push(landing);
    }
    const wet = create(f);
    wet.setLandings([...landings, ...landings]);
    eq(wet.entries.length, 4, 'Only four nearby independent spray fields survive selection');
    wet.update(0);
    eq(wet.lastProcessed, 32, 'Busy update consumes at most exactly one cell budget');
    ok(wet.jobs.every(job => job.head > 0), 'Round-robin discovery advances every active field');
    finish(wet);
    ok(wet.faces > 100 && wet.faces <= 256, 'Dense scene exercises many faces while respecting total cap');
    ok(wet.entries.every(entry => entry.patches.length <= 64), 'No single field monopolizes the face budget');
    eq(wet.geometry.attributes.position.count, 256 * 4, 'GPU vertex capacity is allocated once');
    eq(wet.geometry.index.count, 256 * 6, 'GPU index capacity is fixed');
    const count = wet.faces;
    wet.setAmount(.35); wet.update(0); finish(wet);
    eq(wet.entries.length, 2, 'Potato quality reduces active fields to two');
    ok(wet.faces < count && wet.faces <= 128, 'Potato quality also reduces geometry');
    wet.setAmount(0);
    eq([wet.faces, wet.entries.length, wet.jobs.length, wet.mesh.visible], [0, 0, 0, false], 'Off immediately releases discoveries and hides the mesh');
    f.reset(); for (let i = 0; i < 60; i++) wet.update(1 / 60);
    eq([f.counters.blocks, f.counters.chunks, f.counters.lights], [0, 0, 0], 'Disabled effect performs no world reads');
    wet.setAmount(1); finish(wet);
    eq(wet.entries.length, 4, 'Re-enabling recovers the retained landing candidates');
    ok(wet.faces > 0, 'Re-enabling recreates visible surfaces');
    eq(f.counters.generated, 0, 'All cap/quality tests generated zero chunks');
    wet.dispose();
}

// Missing neighbor chunks remain unknown, then become eligible on load.
{
    const f = fixture(), landing = f.impact(15, 0); f.set(17, 21, 0, STONE);
    const east = f.chunks.get('1,0'); f.chunks.delete('1,0');
    const wet = create(f); wet.setLandings([landing]); finish(wet);
    ok(!patches(wet).some(p => p.x >= 16), 'Unknown adjacent terrain is never treated as exposed rock');
    f.chunks.set('1,0', east); wet.update(0); finish(wet);
    ok(patches(wet).some(p => p.x === 17), 'Loading a previously unknown neighbor refreshes the local field');
    f.chunks.delete('1,0'); wet.update(0);
    ok(!patches(wet).some(p => p.x >= 16), 'Neighbor unload removes its decals immediately');
    wet.dispose();
}

// The wall-clock cutoff is independent of the deterministic cell cap.
{
    const f = fixture(), landing = f.impact(); f.set(2, 21, 0, STONE);
    let clock = 0;
    const wet = create(f, { now: () => clock += .06 }); wet.setLandings([landing]); wet.update(0);
    ok(wet.lastProcessed > 0 && wet.lastProcessed <= 3, '0.2ms deadline stops discovery before the cell cap');
    wet.dispose();
}

// Real World hooks: setBlock marks terrain revisions, and the effect reads
// its actual light arrays without calling chunk generation or changing saves.
{
    const world = new World(new THREE.Scene(), 'wet-rock-regression', new Map(), 'flat');
    world.generateChunk = () => { throw new Error('Effects may not generate chunks'); };
    for (let cz = -1; cz <= 0; cz++) for (let cx = -1; cx <= 0; cx++) world.createChunk(cx, cz);
    const put = (x, y, z, id) => {
        const cx = Math.floor(x / S), cz = Math.floor(z / S), chunk = world.getChunk(cx, cz);
        chunk.setId(x - cx * S, y, z - cz * S, id); world.markDirty(chunk);
    };
    put(0, 20, 0, SOURCE); put(0, 21, 0, fallingWaterId(8)); put(2, 21, 0, STONE);
    const wet = new WaterfallWetRocks(new THREE.Scene(), world, { now: () => 0 });
    wet.setLandings([{ x: 0, y: 21, z: 0, fall: 8 }]); finish(wet);
    ok(wet.faces > 0, 'Actual World/Chunk surfaces are discovered');
    eq(world.unsavedChunks.size, 0, 'Pure visual discovery changes no saved chunks');
    // A player edit enters generateChunk even for an already loaded chunk;
    // only that explicit edit may use the existing chunk through this port.
    world.generateChunk = (cx, cz) => world.getChunk(cx, cz);
    world.setBlock(2, 21, 0, null);
    world.generateChunk = () => { throw new Error('Effects may not generate chunks'); };
    wet.update(0); finish(wet);
    eq(wet.faces, 0, 'Actual World.setBlock invalidates and removes wet rock geometry');
    wet.dispose(); world.dispose();
}

// Invalid input remains finite; lifecycle methods are safe after disposal.
{
    const f = fixture(), wet = create(f);
    wet.setLandings([{ x: NaN, y: 21, z: 0, fall: 8 }, { x: 0, y: Infinity, z: 0, fall: 8 },
        { x: 0, y: -1, z: 0, fall: 8 }, { x: 0, y: H, z: 0, fall: 8 }, { x: 0, y: 20, z: 0, fall: NaN }]);
    eq(wet.entries.length, 0, 'Non-finite and out-of-world candidates are ignored');
    wet.update(NaN); wet.update(-1); wet.update(Infinity);
    ok(Number.isFinite(wet.material.uniforms.uWetTime.value), 'Invalid time steps cannot poison shader time');
    let geometryDisposed = 0, materialDisposed = 0;
    wet.geometry.addEventListener('dispose', () => geometryDisposed++);
    wet.material.addEventListener('dispose', () => materialDisposed++);
    wet.dispose(); wet.dispose(); wet.setLandings([]); wet.setAmount(1); wet.update(1);
    eq([geometryDisposed, materialDisposed], [1, 1], 'Every GPU resource is disposed exactly once');
    eq([wet.scene.children.length, wet.entries.length, wet.jobs.length, wet.landings.length, wet.faces], [0, 0, 0, 0, 0],
        'Disposal removes scene and world-facing state');
    eq(wet.world, null, 'Disposed effect releases its world reference');
}
console.log(`PASS: mokre skały — ${checks} sprawdzeń; 1 mesh, 4/2 pola, 256 ścian, 32 komórki i 0,2 ms na odkrywanie, 0 odczytów bloków w spoczynku.`);
