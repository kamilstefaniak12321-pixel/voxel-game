// ------------------------------------------------------------
// SPRAWDZENIE DYWANU (barwinek - model "kepka", liście "dywan")
//
// - kępka bez sąsiadów: okrągła, nie wypełnia krawędzi komórki,
// - w stronę sąsiada kobierzec sięga do samej krawędzi, pęd przechodzi
//   przez nią w stałym miejscu - u sąsiada w tym samym (łączą się),
// - prawdziwy ChunkMesher liczy sąsiadów (bity +x, +z, -x, -z), także
//   przez granicę chunka, i bierze model z tą maską,
// - dywan leży na całej komórce bez obrotu, celownik - cała komórka,
// - wszystkie etapy barwinka łączą się ze sobą (jeden numer dywanu).
//
// Uruchomienie: node tools/sprawdz_dywan.mjs
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
                export const getAtlasAverage = () => null;
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16, ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});

const { getRiverPlantFaces, plantTransform } = await import('../src/rendering/RiverPlantGeometry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { Chunk } = await import('../src/world/Chunk.js');
const R = await import('../src/blocks/BlockRegistry.js');
const { riverPlantBounds } = await import('../src/interaction/RiverPlantBounds.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const stages = ['barwinek_etap1', 'barwinek_etap2', 'barwinek_etap3'].map((type) => R.BLOCK_TYPES[type]);
check(stages.every((definition) => definition?.riverPlant?.tuft?.carpet), 'barwinek - dywan we wszystkich etapach');
check(new Set(stages.map((definition) => definition.riverPlant.carpet)).size === 1 && stages[0].riverPlant.carpet > 0, 'jeden numer dywanu dla wszystkich etapów');

const { kind, tuft } = stages[2].riverPlant;
const faces = (mask, variant = 0) => getRiverPlantFaces(kind, variant, false, tuft, mask);
const STEM = tuft.colors.stem;
const same = (a, b) => a.every((value, i) => value === b[i]);

// Ściany leżące na krawędzi komórki od strony +x (x = 0.5) / -x.
const atEdge = (list, sign) => list.filter((face) => face.vertices.some((v) => Math.abs(v[0] - sign * 0.5) < 1e-6) && face.normal[1] > 0.99);
const edgeLength = (list, sign) => atEdge(list, sign).reduce((sum, face) => {
    const zs = face.vertices.map((v) => v[2]);
    return sum + (Math.max(...zs) - Math.min(...zs)) * 16;
}, 0);

for (let variant = 0; variant < 8; variant++) {
    const alone = edgeLength(faces(0, variant), 1);
    const joined = edgeLength(faces(1, variant), 1);
    check(joined >= 10, `odmiana ${variant}: w stronę sąsiada kobierzec do krawędzi (${joined} z 16 px)`);
    check(alone < joined, `odmiana ${variant}: bez sąsiada krawędź mniej wypełniona (${alone} < ${joined})`);

    // Pęd przechodzi przez krawędź +x i -x w tym samym miejscu (rząd
    // z = 1/16 - 2/16), więc pędy sąsiadów się spotykają.
    const crossing = (list, sign) => atEdge(list, sign).some((face) => same(face.color, STEM) &&
        Math.min(...face.vertices.map((v) => v[2])) <= 1 / 16 + 1e-6 && Math.max(...face.vertices.map((v) => v[2])) >= 2 / 16 - 1e-6);
    check(crossing(faces(1, variant), 1) && crossing(faces(4, (variant + 3) % 8), -1), `odmiana ${variant}: pędy sąsiadów spotykają się na krawędzi`);

    for (const list of [faces(0, variant), faces(15, variant)]) {
        check(list.every((face) => face.vertices.every((v) => Math.abs(v[0]) <= 0.5 + 1e-6 && Math.abs(v[2]) <= 0.5 + 1e-6 && v[1] >= 0 && v[1] <= tuft.height / 16 + 1e-6)), `odmiana ${variant}: w komórce, nisko`);
    }
    check(faces(15, variant).length <= 320, `odmiana ${variant}: dywan z 4 sąsiadami - najwyżej 320 ścian`);
}

const transform = plantTransform(10, 5, 7, tuft);
check(transform.cos === 1 && transform.sin === 0 && transform.x === 0.5 && transform.z === 0.5, 'dywan bez obrotu i przesunięcia');
const bounds = riverPlantBounds(stages[2].riverPlant, 10, 5, 7);
check(same(bounds.min, [0, 0, 0]) && bounds.max[0] === 1 && bounds.max[2] === 1 && bounds.max[1] < 0.25, 'celownik: cała komórka, nisko');


// Prawdziwy ChunkMesher: sąsiad w tym samym chunku i za granicą chunka.

function plantQuads(geometry) {
    const group = geometry.groups.find((entry) => entry.materialIndex === 1);
    return group ? group.count / 6 : 0;
}

const id = R.getBlockId('barwinek_etap3');
const young = R.getBlockId('barwinek_etap1');

function chunkWith(cells, neighborCells = []) {
    const chunk = new Chunk(0, 0);
    const neighbor = new Chunk(1, 0);
    chunk.skyLight.fill(15);
    neighbor.skyLight.fill(15);
    for (const [x, z, block] of cells) chunk.setId(x, 5, z, block ?? id);
    for (const [x, z, block] of neighborCells) neighbor.setId(x, 5, z, block ?? id);
    const world = { getChunk: (cx, cz) => (cz === 0 ? (cx === 0 ? chunk : cx === 1 ? neighbor : null) : null) };
    return buildChunkGeometry(chunk, world);
}

const variantAt = (x, z) => plantTransform(x, 5, z, tuft).variant;

{
    const geometry = chunkWith([[4, 4], [5, 4]]);
    const expected = faces(1, variantAt(4, 4)).length + faces(4, variantAt(5, 4)).length;
    check(plantQuads(geometry) === expected, `dwa barwinki obok siebie: modele z maską (+x i -x) - ${plantQuads(geometry)} = ${expected}`);
    geometry.dispose();
}

{
    const geometry = chunkWith([[4, 4], [4, 5], [4, 3], [3, 4], [5, 4]]);
    const expected = faces(15, variantAt(4, 4)).length + faces(4, variantAt(5, 4)).length + faces(1, variantAt(3, 4)).length +
        faces(8, variantAt(4, 5)).length + faces(2, variantAt(4, 3)).length;
    check(plantQuads(geometry) === expected, 'krzyż z 5 barwinków: środek łączy się z 4 stronami');
    geometry.dispose();
}

{
    const geometry = chunkWith([[15, 6]], [[0, 6]]);
    check(plantQuads(geometry) === faces(1, variantAt(15, 6)).length, 'sąsiad za granicą chunka (+x) - też łączy');
    geometry.dispose();
    const alone = chunkWith([[15, 6]]);
    check(plantQuads(alone) === faces(0, variantAt(15, 6)).length, 'bez sąsiada za granicą - okrągła kępka');
    alone.dispose();
}

{
    const geometry = chunkWith([[7, 7], [8, 7, young]]);
    const youngFaces = getRiverPlantFaces(stages[0].riverPlant.kind, variantAt(8, 7), false, stages[0].riverPlant.tuft, 4).length;
    check(plantQuads(geometry) === faces(1, variantAt(7, 7)).length + youngFaces, 'kwitnący barwinek łączy się z młodym');
    geometry.dispose();
}

{
    const geometry = chunkWith([[7, 7], [8, 7, R.getBlockId('short_grass')]]);
    const quads = plantQuads(geometry);
    check(quads > faces(0, variantAt(7, 7)).length - 1, 'inna roślina obok - bez łączenia (maska 0)');
    geometry.dispose();
}

console.log(`OK: dywan barwinka - ${checks} sprawdzeń (krawędzie i pędy sąsiadów, maski w ChunkMesher także przez granicę chunka, etapy razem, bez obrotu, celownik).`);
