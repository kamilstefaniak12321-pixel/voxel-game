// Rzeczywisty mesher, materiały, rejestr bloków i krzywe światła;
// pominięte jest wyłącznie pobieranie bitmap atlasu przez przeglądarkę.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { buildChunkGeometry, setAmbientOcclusion } = await import('../src/rendering/ChunkMesher.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, getLightEmission } = await import('../src/blocks/BlockRegistry.js');
const { atmosphericLightToBrightness } = await import('../src/rendering/LightPolicy.js');
const { lightToBrightness, MAX_LIGHT } = await import('../src/world/Light.js');
const { AMBIENT_OCCLUSION, WATER_DEPTH_LIGHT } = await import('../src/config.js');

const world = { getChunk: () => null };
const fixture = (type, sky = 0, red = 0) => {
    const chunk = new Chunk(0, 0);
    const id = getBlockId(type);
    assert.notEqual(id, 0, `Brak bloku ${type}`);
    chunk.setId(8, 8, 8, id);
    chunk.skyLight.fill(sky);
    chunk.lightR.fill(red);
    return chunk;
};
const geometryOf = chunk => {
    const geometry = buildChunkGeometry(chunk, world);
    assert.ok(geometry);
    const classic = geometry.getAttribute('color');
    const atmosphere = geometry.getAttribute('atmosphereLight');
    assert.equal(atmosphere.count, classic.count);
    assert.equal(atmosphere.itemSize, 4);
    assert.equal(atmosphere.normalized, true);
    assert.ok(atmosphere.array instanceof Uint8Array);
    const scalar = name => {
        const attribute = geometry.getAttribute(name);
        assert.ok(attribute, `Brak ${name}`);
        assert.equal(attribute.count, classic.count, `${name}: zła liczba wierzchołków`);
        assert.equal(attribute.itemSize, 1, `${name}: atrybut nie jest skalarem`);
        assert.equal(attribute.normalized, true, `${name}: wymagany zakres 0–1 na GPU`);
        assert.ok(attribute.array instanceof Uint8Array, `${name}: wymagany jeden bajt`);
        return attribute.array;
    };
    return { geometry, classic: classic.array, atmosphere: atmosphere.array,
        occlusion: scalar('surfaceOcclusion'), emission: scalar('surfaceEmission') };
};

const skyValues = sample => sample.atmosphere.filter((_, i) => i % 4 === 3);
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const cornerIndex = sample => {
    const p = sample.geometry.getAttribute('position'), n = sample.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
        if (p.getX(i) === 8 && p.getY(i) === 9 && p.getZ(i) === 8 && n.getY(i) === 1) return i;
    }
    assert.fail('Brak badanego rogu górnej ściany');
};
const addCorner = chunk => {
    chunk.setId(7, 9, 8, getBlockId('stone'));
    chunk.setId(8, 9, 7, getBlockId('stone'));
    return chunk;
};

assert.equal(atmosphericLightToBrightness(0), 0);
assert.equal(atmosphericLightToBrightness(MAX_LIGHT), 1);
assert.ok(lightToBrightness(0) > 0, 'Klasyczny model zachowuje minimum');

// Każda ścieżka meshera: sześcian, roślina, płaska dekoracja,
// liście i półprzezroczysta woda mają zerowe światło bez źródła.
for (const type of ['stone', 'tall_grass', 'oak_leaf_litter', 'oak_leaves', 'water']) {
    const dark = geometryOf(fixture(type));
    assert.ok(dark.classic.some(v => v > 0), `${type}: klasyczny model utracił jasność`);
    assert.ok(dark.atmosphere.every(v => v === 0), `${type}: sztuczne światło bez źródła`);
    assert.ok(dark.emission.every(v => v === 0), `${type}: nieemisyjny materiał świeci sam`);
    if (type === 'tall_grass') {
        assert.deepEqual([...new Set(dark.occlusion)].sort(), [173, 255], 'Cień dołu kępki musi być osobnym AO');
    } else {
        assert.ok(dark.occlusion.every(v => v === 255), `${type}: wolna powierzchnia ma AO`);
    }
    dark.geometry.dispose();

    const red = geometryOf(fixture(type, 0, 255));
    assert.ok(red.atmosphere.some((v, i) => i % 4 === 0 && v > 0), `${type}: brak czerwonej lampy`);
    assert.ok(red.atmosphere.every((v, i) => i % 4 === 0 || v === 0), `${type}: lampa dodaje obce kanały lub niebo`);
    red.geometry.dispose();

    const day = geometryOf(fixture(type, MAX_LIGHT));
    assert.ok(skyValues(day).every(v => v === 255), `${type}: AO zmniejszyło pełny dostęp do nieba`);
    assert.ok(day.atmosphere.every((v, i) => i % 4 === 3 || v === 0), `${type}: niebo dodało lampę`);
    for (let i = 0; i < day.occlusion.length; i++) {
        assert.equal(day.classic[i * 4 + 3], day.occlusion[i], `${type}: klasyczny cień powierzchni się zmienił`);
    }
    day.geometry.dispose();
}

// Emisja jest liniowa, niezależna od AO i nie udaje dostępu do nieba.
for (const type of ['lamp_red', 'meteorite']) {
    const emitting = geometryOf(fixture(type));
    assert.ok(emitting.atmosphere.every(v => v === 0), `${type}: emisja udaje oświetlenie otoczenia`);
    const expected = getLightEmission(getBlockId(type)) / MAX_LIGHT;
    assert.ok(emitting.emission.every(v => v === Math.round(expected * 255)));
    near(emitting.emission[0] / 255, expected);
    assert.ok(emitting.classic.every(v => v > 0), `${type}: klasyczna emisja zniknęła`);
    emitting.geometry.dispose();

    const chunk = addCorner(fixture(type));
    setAmbientOcclusion(1);
    const shaded = geometryOf(chunk), i = cornerIndex(shaded);
    assert.equal(shaded.occlusion[i], 0, `${type}: fixture nie zasłania badanego rogu`);
    assert.equal(shaded.emission[i], Math.round(expected * 255), `${type}: AO zgasiło emisję`);
    assert.equal(shaded.atmosphere[i * 4 + 3], 0, `${type}: lampie dopisano pełne niebo`);
    shaded.geometry.dispose();
    setAmbientOcclusion(AMBIENT_OCCLUSION);
}

// AO nie zmienia wejścia dla bezpośredniego światła. Rozproszone lampy
// nadal są przyciemniane, a klasyczne RGBA i podział ścian pozostają stare.
const corner = addCorner(fixture('stone', 7, 80));
const before = geometryOf(corner);
setAmbientOcclusion(1);
const occluded = geometryOf(corner);
assert.deepEqual(skyValues(occluded), skyValues(before), 'AO wpłynęło na dostęp do nieba/direct');
const ci = cornerIndex(occluded);
assert.equal(occluded.occlusion[ci], 0);
assert.equal(occluded.atmosphere[ci * 4], 0, 'Rozproszona lampa zignorowała AO');
assert.ok(before.atmosphere[ci * 4] > 0);
assert.equal(occluded.atmosphere[ci * 4 + 3], 102, 'Poziom 7 ma pozostać kodowaną jasnością, nie energią liniową');
near((occluded.atmosphere[ci * 4 + 3] / 255) ** 2.2, 0.1332085131842997);
setAmbientOcclusion(AMBIENT_OCCLUSION);
const restored = geometryOf(corner);
assert.deepEqual(restored.classic, before.classic);
assert.deepEqual(restored.atmosphere, before.atmosphere);
assert.deepEqual(restored.occlusion, before.occlusion);
for (const sample of [before, occluded, restored]) sample.geometry.dispose();

// Różne kierunki lamp pozostają w przestrzeni kodowanej do jednokrotnego
// pow(..., 2.2) w shaderze. Kanały zachowują proporcje przed tym dekodowaniem.
const colored = fixture('stone', 0, 255);
colored.lightG.fill(128);
const lamps = geometryOf(colored), normals = lamps.geometry.getAttribute('normal');
for (let i = 0; i < normals.count; i++) {
    const expectedRed = normals.getX(i) !== 0 ? 153 : normals.getZ(i) !== 0 ? 172 : normals.getY(i) > 0 ? 191 : 124;
    assert.equal(lamps.atmosphere[i * 4], expectedRed);
    near(lamps.atmosphere[i * 4 + 1] / lamps.atmosphere[i * 4], 128 / 255, 1 / expectedRed);
    assert.equal(lamps.atmosphere[i * 4 + 2], 0);
    assert.equal(lamps.atmosphere[i * 4 + 3], 0);
}
lamps.geometry.dispose();

// Tłumienie pod wodą pozostaje w alpha, nie w AO: bezpośrednie światło
// musi nadal tracić energię wraz z głębokością.
const underwater = fixture('stone', MAX_LIGHT);
for (let y = 9; y <= 12; y++) underwater.setId(8, y, 8, getBlockId('water'));
const bottom = geometryOf(underwater), bi = cornerIndex(bottom);
assert.equal(bottom.occlusion[bi], 255);
assert.equal(bottom.atmosphere[bi * 4 + 3], Math.round(WATER_DEPTH_LIGHT ** 4 * 255));
bottom.geometry.dispose();

// Zapisane przed zmianą, na e05f0e0: klasyczne bajty RGBA + indeksy mesha.
// Chronią też przekątną emisyjnych ścian i cień podstawy roślin.
const legacy = {
    stone: 'bca88198e438e8c2506137736fc52506870f199f4254e4dc625a67b4c9f3609f',
    tall_grass: 'ad28ea8ee6bff48a0a569985c17ef813eb475e1fcde54cf5d50699e703d1dd86',
    oak_leaf_litter: '445721f047928107122623afd6f3539a4f61a8056a50fb2f9f68c8c0ca36fb55',
    oak_leaves: 'bca88198e438e8c2506137736fc52506870f199f4254e4dc625a67b4c9f3609f',
    water: 'bca88198e438e8c2506137736fc52506870f199f4254e4dc625a67b4c9f3609f',
    lamp_red: 'd350d07c0f5fb9d93069562606e110c2728def7f74e4c08a7f779fcbb91b809d'
};
const signature = sample => createHash('sha256').update(sample.classic)
    .update(new Uint8Array(sample.geometry.index.array.buffer)).digest('hex');
for (const [type, expected] of Object.entries(legacy)) {
    const chunk = fixture(type, 7, 80);
    chunk.lightG.fill(40); chunk.lightB.fill(20);
    const sample = geometryOf(chunk);
    assert.equal(signature(sample), expected, `${type}: zmieniono klasyczny mesh`);
    sample.geometry.dispose();
}
for (const [chunk, expected] of [
    [corner, '696d0ce1f23d308636fce467199179a7389c15cdb4e549b7950ce45da66ec6d6'],
    [addCorner(fixture('lamp_red', 7, 80)), '1ea86333b2e723320563483a1f4c20cf17eec8b9974aca550f5d8f4fec24ee02']
]) {
    const sample = geometryOf(chunk);
    assert.equal(signature(sample), expected, 'Zmieniono klasyczny narożnik');
    sample.geometry.dispose();
}

console.log('OK: ciemność, 5 ścieżek meshera, oddzielne AO/sky/emisja, kolor i kodowanie lamp, głębokość wody oraz zgodność klasycznych meshy.');
