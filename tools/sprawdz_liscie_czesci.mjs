// ------------------------------------------------------------
// SPRAWDZENIE LIŚCI Z 8 CZĘŚCI (koncept Kamila - assets/models/leaves)
//
// - model z pliku: 8 części 8 x 8 x 8 pikseli, różne ćwiartki tekstury,
// - mesher: pojedynczy blok - ściany zewnętrzne części we wszystkich
//   6 kierunkach (bez ścian zakrytych sąsiednią częścią), wnętrze korony
//   bez ścian, szybkie liście - tylko wierzch,
//   ściana przy kamieniu ukryta, części mają kołysanie (plantMotion),
// - ustawienie (telefon - bloki) i kołysanie w shaderze liści.
//
// Uruchomienie: node tools/sprawdz_liscie_czesci.mjs
// ------------------------------------------------------------
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
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});


const { buildChunkGeometry, setLeafParts, setFastLeaves } = await import('../src/rendering/ChunkMesher.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { LEAF_PARTS, LEAF_PARTS_SOURCE } = await import('../assets/models/leaves/model-data.js');
const { leafMaterial } = await import('../src/rendering/BlockRenderData.js');
const { SETTINGS_DEFAULTS, SETTINGS_CHOICES } = await import('../src/settings/Settings.js');
const { TOUCH_SETTINGS } = await import('../src/config.js');
const { readFileSync } = await import('node:fs');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// --- Model z pliku Kamila -------------------------------------------------

check(LEAF_PARTS.length === 8 && LEAF_PARTS.every((part) => part.faces.length === 6), '8 części po 6 ścian');
for (const part of LEAF_PARTS) {
    const size = part.max.map((n, i) => n - part.min[i]);
    check(size.every((n) => Math.abs(n - 0.5) < 1e-9), 'Część 8 x 8 x 8 pikseli');
    check(part.min.every((n) => n >= -1 / 16) && part.max.every((n) => n <= 1 + 1 / 16 + 1e-9), 'Część najwyżej piksel poza blokiem');
    for (const face of part.faces) check(face.uv.flat().every((n) => n >= 0 && n <= 1), 'UV w teksturze');
}
const texture = readFileSync(new URL('../assets/models/leaves/texture.png', import.meta.url));
check(texture.readUInt32BE(16) === 16 && texture.readUInt32BE(20) === 16, 'Tekstura 16 x 16');
check(/^[0-9a-f]{64}$/.test(LEAF_PARTS_SOURCE.sourceSha256), 'Źródło zapisane');

// Każda część pokazuje na zewnątrz różne ćwiartki tekstury.
const quarters = new Set(LEAF_PARTS.flatMap((part) => part.faces.map((face) => face.uv.map((uv) => uv.map((n) => Math.floor(n * 2 - 1e-9)).join()).sort().join('|'))));
check(quarters.size >= 4, `Różne ćwiartki tekstury (${quarters.size})`);


// --- Mesher ------------------------------------------------------------

const world = { getChunk: () => null };
const leaves = getBlockId('oak_leaves');
const single = () => {
    const chunk = new Chunk(0, 0);
    chunk.setId(8, 8, 8, leaves);
    chunk.skyLight.fill(15);
    return chunk;
};
const faces = (chunk) => buildChunkGeometry(chunk, world).getAttribute('position').count / 4;
const motion = (chunk) => Array.from(buildChunkGeometry(chunk, world).getAttribute('plantMotion').array);

setLeafParts(false);
const cube = faces(single());
check(cube === 6, `Blok liści - 6 ścian (${cube})`);
check(motion(single()).every((n) => n === 0), 'Zwykłe liście stoją');

check(setLeafParts(true) === true && setLeafParts(true) === false, 'Zmiana zgłasza przebudowę raz');
const parts = faces(single());
// Ściany na kierunek (z normalnych) - części są przesunięte jak w modelu,
// więc część ścian jest cofnięta w głąb bloku.
const perDirection = (chunk) => {
    const normal = buildChunkGeometry(chunk, world).getAttribute('normal');
    const counts = new Map();
    for (let i = 0; i < normal.count; i += 4) {
        const key = [normal.getX(i), normal.getY(i), normal.getZ(i)].map((n) => Math.round(n)).join();
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
};
const directions = perDirection(single());
check(parts > 24 && parts < 48, `Liście z części - ściany zewnętrzne bez zakrytych (${parts})`);
check(directions.size === 6 && [...directions.values()].every((n) => n >= 3), 'Części widać z każdej strony');
const sway = motion(single());
check(sway.some((n) => n > 0), 'Części się kołyszą');

// Wnętrze korony: blok otoczony liśćmi - bez ścian (jak zwykłe liście głęboko w koronie).
const crown = new Chunk(0, 0);
for (let x = 5; x <= 11; x++) for (let y = 5; y <= 11; y++) for (let z = 5; z <= 11; z++) crown.setId(x, y, z, leaves);
crown.skyLight.fill(15);
setLeafParts(false);
const crownCube = faces(crown);
setLeafParts(true);
const crownParts = faces(crown);
check(crownParts <= crownCube * 6, `Korona: najwyżej 6 razy więcej ścian (${crownCube} -> ${crownParts})`);
setFastLeaves(true);
const crownFast = faces(crown);
check(crownFast === parts * 49, `Szybkie liście z części - tylko ściany na zewnątrz korony (${crownFast})`);
setFastLeaves(false);

// Przy kamieniu ściany części od jego strony znikają jak ściana bloku.
const wall = () => {
    const chunk = single();
    chunk.setId(9, 8, 8, getBlockId('stone'));
    return chunk;
};
setLeafParts(false);
const stoneFaces = faces(wall()) - 5;
setLeafParts(true);
check(faces(wall()) === parts - directions.get('1,0,0') + stoneFaces, 'Ściany przy kamieniu ukryte');
setLeafParts(false);


// --- Ustawienie i shader -----------------------------------------------------

check(SETTINGS_DEFAULTS.leafModel === 'parts' && SETTINGS_CHOICES.leafModel.join() === 'cube,parts', 'Ustawienie modelu liści');
check(TOUCH_SETTINGS.leafModel === 'cube', 'Telefon - bloki');
const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>', fragmentShader: '#include <color_fragment>' };
try { leafMaterial.onBeforeCompile(shader, { capabilities: { isWebGL2: true } }); } catch { /* shader bloków potrzebuje przeglądarki */ }
check(shader.vertexShader.includes('plantMotion.x > 0.0') && shader.uniforms.uPlantSway, 'Kołysanie części w shaderze liści');

console.log(`OK: liście z 8 części - ${checks} sprawdzeń (blok: ${cube} -> ${parts} ścian, korona 7x7x7: ${crownCube} -> ${crownParts}).`);
