// ------------------------------------------------------------
// SPRAWDZENIE POROSTÓW I HUB (paczki roślin przyczepionych do ścian:
// liście "nalot" i "huba" - TuftGeometry.js coating, bracket)
//
// - porost: plama na każdej ścianie z maski (lity blok obok, także dół
//   i góra), tuż przy ścianie; trzy wzory; bez maski (ikonka) - na dole,
// - huba: półki przy jednej ścianie (bok), od ściany w głąb komórki,
// - prawdziwy ChunkMesher daje maskę litych sąsiadów,
// - oparcie: porost i huba nie potrzebują ziemi pod sobą (canPlantStay),
//   świat sprawdza ściany (World.attachedPlantSupported),
// - teren realistyczny: porosty na wierzchu skał, porosty i huby na
//   pniach drzew (w swoich biomach), powtarzalnie.
//
// Uruchomienie: node tools/sprawdz_porosty.mjs
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
const P = await import('../src/blocks/plantPacks.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const lichens = ['porostoliwkowy', 'porostiglasty', 'ochra'];
const plane = (face, axis, value) => face.vertices.every((v) => Math.abs(v[axis] - value) < 1e-6);

for (const name of lichens) {
    const definition = R.BLOCK_TYPES[`${name}_etap3`];
    const { kind, tuft } = definition.riverPlant;
    check(tuft.coating && R.getAttachedPlant(definition.id) === 'coating', `${name}: porost przylega do ścian`);
    check(R.canPlantStay(definition.id, 0) && R.canPlantStay(definition.id, R.getBlockId('stone')), `${name}: nie potrzebuje ziemi pod sobą`);
    for (let variant = 0; variant < 8; variant++) {
        const floor = getRiverPlantFaces(kind, variant, false, tuft, 16);
        const wall = getRiverPlantFaces(kind, variant, false, tuft, 1);
        check(floor.length > 0 && floor.every((face) => face.vertices.every((v) => v[1] > 0 && v[1] <= 1.01 / 16)), `${name} ${variant}: na dole - płasko tuż nad ziemią`);
        check(wall.length > 0 && wall.every((face) => face.vertices.every((v) => v[0] >= 0.5 - 1.01 / 16 && v[0] < 0.5)), `${name} ${variant}: na ścianie +x - tuż przy niej`);
        check(getRiverPlantFaces(kind, variant, false, tuft, 0).length === floor.length, `${name} ${variant}: bez maski (ikonka) - na dole`);
        const all = getRiverPlantFaces(kind, variant, false, tuft, 63);
        check(all.length > floor.length && all.length <= 520, `${name} ${variant}: sześć ścian - ${all.length} ścian (najwyżej 520)`);
    }
    check(getRiverPlantFaces(R.BLOCK_TYPES[`${name}_etap1`].riverPlant.kind, 0, false, R.BLOCK_TYPES[`${name}_etap1`].riverPlant.tuft, 16).length <
        getRiverPlantFaces(kind, 0, false, tuft, 16).length, `${name}: młody - mniejsza plama`);
}

{
    const definition = R.BLOCK_TYPES.huba_etap3;
    const { kind, tuft } = definition.riverPlant;
    check(tuft.bracket && R.getAttachedPlant(definition.id) === 'bracket', 'huba przylega do boku');
    for (let variant = 0; variant < 8; variant++) {
        const east = getRiverPlantFaces(kind, variant, false, tuft, 1);
        const xs = east.flatMap((face) => face.vertices.map((v) => v[0]));
        check(Math.max(...xs) <= 0.5 + 1e-6 && Math.max(...xs) > 0.45, `huba ${variant}: półki od ściany +x`);
        check(Math.min(...xs) > -0.2, `huba ${variant}: półki nie przechodzą przez całą komórkę`);
        check(getRiverPlantFaces(kind, variant, false, tuft, 16).length === getRiverPlantFaces(kind, variant, false, tuft, 8).length, `huba ${variant}: bez ściany z boku - jak przy -z (ikonka)`);
    }
}

check(plantTransform(3, 4, 5, R.BLOCK_TYPES.ochra_etap1.riverPlant.tuft).cos === 1, 'porost bez obrotu');


// Prawdziwy ChunkMesher: porost przy kamieniu ma ściany od strony kamienia.

{
    const stone = R.getBlockId('stone');
    const chunk = new Chunk(0, 0);
    chunk.skyLight.fill(15);
    const lichen = R.BLOCK_TYPES.porostoliwkowy_etap3;
    chunk.setId(5, 5, 5, lichen.id);
    chunk.setId(5, 4, 5, stone);
    chunk.setId(6, 5, 5, stone);
    const world = { getChunk: (cx, cz) => (cx === 0 && cz === 0 ? chunk : null) };
    const geometry = buildChunkGeometry(chunk, world);
    const group = geometry.groups.find((entry) => entry.materialIndex === 1);
    const variant = plantTransform(5, 5, 5, lichen.riverPlant.tuft).variant;
    check(group.count / 6 === getRiverPlantFaces(lichen.riverPlant.kind, variant, false, lichen.riverPlant.tuft, 1 | 16).length, 'ChunkMesher: porost na dole i na ścianie +x (kamienie obok)');
    geometry.dispose();
}


// Teren realistyczny: porosty na skałach, porosty i huby na pniach.

const generator = new RealisticGenerator('lepidolit');
const ids = (name) => new Set([0, 1, 2].map((i) => R.getBlockId(`${name}_etap${i + 1}`)));
const counts = Object.fromEntries([...lichens, 'huba'].map((name) => [name, 0]));
const kinds = Object.fromEntries([...lichens, 'huba'].map((name) => [name, ids(name)]));

for (let x = -600; x <= 600; x += 5) {
    for (let z = -600; z <= 600; z += 5) {
        const top = Array.from(generator.columnBlocks(x, z).blocks).filter(Boolean).pop();
        for (const name of lichens) if (kinds[name].has(top)) counts[name]++;
    }
}

for (const name of ['porostoliwkowy', 'ochra']) {
    check(counts[name] > 5, `${name}: rośnie na skałach (${counts[name]})`);
}

const trunks = Object.fromEntries([...lichens, 'huba'].map((name) => [name, 0]));
let logs = 0;
for (let cx = -24; cx <= 24; cx += 3) {
    for (let cz = -24; cz <= 24; cz += 3) {
        const chunk = new Chunk(cx, cz);
        generator.generateChunk(chunk);
        for (let i = 0; i < chunk.blocks.length; i++) {
            const id = chunk.blocks[i];
            if (id === 0) continue;
            if (R.getBlockTypeById(id)?.endsWith('_log')) logs++;
            for (const name of [...lichens, 'huba']) {
                if (kinds[name].has(id)) {
                    trunks[name]++;
                    // Na pniu albo na skale - ma o co się oprzeć (lity blok obok).
                    const lx = i % 16, lz = Math.floor(i / 16) % 16, y = Math.floor(i / 256);
                    const solid = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].some(([dx, dy, dz]) =>
                        lx + dx >= 0 && lx + dx < 16 && lz + dz >= 0 && lz + dz < 16 && R.isSolidId(chunk.getId(lx + dx, y + dy, lz + dz)));
                    if (!solid && lx > 0 && lx < 15 && lz > 0 && lz < 15) assert.fail(`${name} bez oparcia w (${cx}, ${cz}) ${lx} ${y} ${lz}`);
                }
            }
        }
    }
}

check(logs > 100, `są drzewa w próbce (${logs} pni)`);
check(trunks.huba > 3, `huba rośnie na pniach (${trunks.huba})`);
check(trunks.porostoliwkowy + trunks.porostiglasty > 3, `porosty na pniach (${trunks.porostoliwkowy + trunks.porostiglasty})`);

console.log(`OK: porosty i huby - ${checks} sprawdzeń (plamy na ścianach z maski, półki huby, ChunkMesher, oparcie, skały: ${counts.porostoliwkowy + counts.ochra + counts.porostiglasty}, pnie: huba ${trunks.huba}, porosty ${trunks.porostoliwkowy + trunks.porostiglasty}).`);
