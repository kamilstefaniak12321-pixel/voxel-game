// ------------------------------------------------------------
// SPRAWDZENIE NUMERÓW BLOKÓW 2-BAJTOWYCH (0.30.0)
//
// - chunk trzyma numery do 65535 (Uint16Array), zapis/odczyt komórki,
// - zapis chunka: 1 bajt na blok, gdy wszystkie numery <= 255 (jak
//   dawniej), 2 bajty, gdy jest większy - wartości bez zmian,
// - stary zapis (Uint8Array) i nowy (Uint16Array) wczytują się do chunka,
//   także przez prawdziwe WorldStorage (port bazy w pamięci),
// - nieznany wysoki numer nie psuje zapytań o blok (null / false),
// - zakresy numerów paczek drzew i roślin, odcienie dalekiego terenu
//   poniżej 65536 (Uint16 bez zawijania),
// - generatory dają kolumny Uint16Array.
//
// Uruchomienie: node tools/sprawdz_numery_blokow.mjs
// ------------------------------------------------------------

import assert from 'node:assert/strict';
import { memoryDatabase } from './fixtures/memory-database.mjs';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/') ? { ...context, format: 'module' } : context);
    }
});

const { Chunk } = await import('../src/world/Chunk.js');
const R = await import('../src/blocks/BlockRegistry.js');
const { WorldStorage, createWorldInfo, packChunkBlocks } = await import('../src/storage/WorldStorage.js');
const { TREE_ID_RANGES, idsInRanges, TREE_PACKS, PACK_ID_SLOTS } = await import('../src/blocks/treePacks.js');
const { PLANT_ID_RANGES, PLANT_PACKS } = await import('../src/blocks/plantPacks.js');
const { SURFACE_MATERIAL_COUNT, surfaceMaterialId } = await import('../src/rendering/SurfaceMaterials.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { TerrainGenerator } = await import('../src/world/TerrainGenerator.js');
const { CHUNK_SIZE } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Chunk ----------------------------------------------------

const chunk = new Chunk(0, 0);
check(chunk.blocks instanceof Uint16Array, 'chunk trzyma numery w Uint16Array');

const stone = R.getBlockId('stone');
chunk.setId(3, 10, 4, stone);
chunk.setId(5, 20, 6, 60000);
check(chunk.getId(3, 10, 4) === stone, 'zwykły numer');
check(chunk.getId(5, 20, 6) === 60000, 'numer ponad 255 zostaje w komórce');


// --- Zapis: 1 albo 2 bajty -------------------------------------

const small = new Chunk(0, 0);
small.setId(1, 1, 1, stone);
small.setId(2, 2, 2, 255);
const packedSmall = packChunkBlocks(small.blocks);
check(packedSmall instanceof Uint8Array, 'numery do 255 - 1 bajt na blok');
check(packedSmall !== small.blocks && packedSmall.length === small.blocks.length, 'kopia tej samej długości');
check(packedSmall[small.index(2, 2, 2)] === 255 && packedSmall[small.index(1, 1, 1)] === stone, 'wartości bez zmian');

const packedBig = packChunkBlocks(chunk.blocks);
check(packedBig instanceof Uint16Array, 'numer ponad 255 - 2 bajty na blok');
check(packedBig !== chunk.blocks, 'kopia, nie ta sama tablica');
assert.deepEqual(packedBig, chunk.blocks, 'wartości bez zmian (2 bajty)');


// --- Odczyt: stary i nowy zapis --------------------------------

const old = new Uint8Array(small.blocks.length);
old[small.index(7, 7, 7)] = stone;
const fromOld = new Chunk(0, 0);
check(fromOld.loadBlocks(old), 'stary zapis (Uint8Array) się wczytuje');
check(fromOld.getId(7, 7, 7) === stone, 'stary zapis - te same numery');

const fromNew = new Chunk(0, 0);
check(fromNew.loadBlocks(packedBig), 'nowy zapis (Uint16Array) się wczytuje');
check(fromNew.getId(5, 20, 6) === 60000, 'nowy zapis - numer ponad 255');


// Prawdziwe WorldStorage z bazą w pamięci (kopie jak w IndexedDB).

const storage = new WorldStorage(memoryDatabase());
const info = createWorldInfo('Numery bloków', 'numery', 'classic', 'creative');
const second = new Chunk(1, 0);
second.setId(0, 5, 0, stone);
await storage.saveWorldAndChunks(info, [chunk, second]);
const saved = await storage.loadChunks(info.id);
check(saved.get('0,0') instanceof Uint16Array, 'baza: chunk z numerem 60000 - 2 bajty');
check(saved.get('1,0') instanceof Uint8Array, 'baza: zwykły chunk - 1 bajt');
const reloaded = new Chunk(0, 0);
check(reloaded.loadBlocks(saved.get('0,0')) && reloaded.getId(5, 20, 6) === 60000, 'baza: numer ponad 255 po wczytaniu');
const reloadedSmall = new Chunk(1, 0);
check(reloadedSmall.loadBlocks(saved.get('1,0')) && reloadedSmall.getId(0, 5, 0) === stone, 'baza: zwykły chunk po wczytaniu');


// --- Nieznany wysoki numer -------------------------------------

check(R.MAX_BLOCK_ID === 65279, 'bloki do 65279 (ostatnie 256 numerów dla gry)');
check(R.getBlockTypeById(60000) === null, 'nieznany numer - brak bloku');
check(!R.isSolidId(60000) && !R.isOpaqueId(60000) && !R.isPlantId(60000), 'nieznany numer - nie blokuje, nie jest rośliną');
check(R.getBlockTypeById(R.MAX_BLOCK_ID) === null, 'najwyższy numer bez bloku');


// --- Zakresy paczek i materiały dalekiego terenu ----------------

check(idsInRanges(100, PACK_ID_SLOTS, TREE_ID_RANGES) && idsInRanges(1000, PACK_ID_SLOTS, TREE_ID_RANGES), 'drzewa: 100 i 1000');
check(!idsInRanges(235, PACK_ID_SLOTS, TREE_ID_RANGES) && !idsInRanges(4995, PACK_ID_SLOTS, TREE_ID_RANGES), 'drzewo nie wychodzi poza zakres');
check(!idsInRanges(5000, PACK_ID_SLOTS, TREE_ID_RANGES), '5000 - nie dla drzew');
check(idsInRanges(5000, 3, PLANT_ID_RANGES) && idsInRanges(237, 3, PLANT_ID_RANGES), 'rośliny: 5000 i 237');
check(!idsInRanges(1000, 3, PLANT_ID_RANGES) && !idsInRanges(9998, 3, PLANT_ID_RANGES), 'roślina nie w zakresie drzew ani poza nim');

for (const pack of TREE_PACKS) {
    check(idsInRanges(pack.firstId, PACK_ID_SLOTS, TREE_ID_RANGES), `drzewo ${pack.id} w zakresie`);
}

for (const pack of PLANT_PACKS) {
    check(idsInRanges(pack.firstId, pack.stages.length, PLANT_ID_RANGES), `roślina ${pack.id} w zakresie`);
}

check(SURFACE_MATERIAL_COUNT <= 65536, 'materiały dalekiego terenu mieszczą się w Uint16');
check(surfaceMaterialId('grass_high') === R.MAX_BLOCK_ID + 3 && new Uint16Array([surfaceMaterialId('grass_high')])[0] === R.MAX_BLOCK_ID + 3, 'odcień trawy bez zawijania');

for (const [type, definition] of Object.entries(R.BLOCK_TYPES)) {
    check(definition.id >= 1 && definition.id <= R.MAX_BLOCK_ID, `${type}: numer w zakresie`);
}


// --- Generatory ------------------------------------------------

check(new RealisticGenerator('numery').columnBlocks(10, 10).blocks instanceof Uint16Array, 'teren realistyczny: kolumna Uint16Array');
check(new RealisticGenerator('numery').columnBuffer instanceof Uint16Array, 'teren realistyczny: kolumna chunka Uint16Array (0.40.1)');

// Prawdziwy chunk terenu realistycznego: roślina z paczki (numer 5000+)
// ma pełny numer, nie obcięty do 1 bajtu (błąd 0.31.0-0.40.0).
{
    const generator = new RealisticGenerator('lepidolit');
    const plantIds = new Set(PLANT_PACKS.flatMap((pack) => pack.stages.map((_, i) => pack.firstId + i)));
    let spot = null;
    for (let x = -400; x <= 400 && !spot; x += 4) {
        for (let z = -400; z <= 400 && !spot; z += 4) {
            const id = Array.from(generator.columnBlocks(x, z).blocks).find((block) => plantIds.has(block) && block > 255);
            if (id) spot = [x, z, id];
        }
    }
    check(spot !== null, 'jest roślina z paczki w terenie');
    const [x, z] = spot;
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    const generated = new Chunk(cx, cz);
    generator.generateChunk(generated);
    const lx = x - cx * CHUNK_SIZE, lz = z - cz * CHUNK_SIZE;
    const column = [];
    for (let y = 0; y < generated.blocks.length / (CHUNK_SIZE * CHUNK_SIZE); y++) column.push(generated.getId(lx, y, lz));
    check(column.some((id) => plantIds.has(id) && id > 255), `chunk terenu realistycznego: roślina ${spot[2]} z pełnym numerem`);
    check(!column.some((id) => R.TRUNCATED_PLANT_IDS[id]), 'bez obciętych numerów w chunku');
}

// Naprawa zapisów 0.31.0-0.40.0: obcięty numer rośliny wraca przy
// wczytaniu (tylko nieznane numery pasujące do jednej rośliny).
{
    const kocanka = R.getBlockId('kocanka_etap1');
    check(R.TRUNCATED_PLANT_IDS[kocanka & 255] === kocanka, 'obcięty numer kocanki -> kocanka');
    check(R.TRUNCATED_PLANT_IDS[stone] === 0 && R.TRUNCATED_PLANT_IDS[0] === 0, 'znane numery bez zmian');
    const broken = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * 8);
    const repaired = new Chunk(0, 0);
    broken[repaired.index(3, 2, 3)] = kocanka & 255;
    broken[repaired.index(3, 1, 3)] = stone;
    check(repaired.loadBlocks(broken) && repaired.getId(3, 2, 3) === kocanka && repaired.getId(3, 1, 3) === stone, 'stary zapis z obciętą kocanką - naprawiony');
    const fresh = new Chunk(0, 0);
    check(fresh.loadBlocks(Uint16Array.from(broken)) && fresh.getId(3, 2, 3) === (kocanka & 255), 'zapis 2-bajtowy bez naprawy (numery pełne)');
}
check(new TerrainGenerator('numery').columnBlocks(10, 10).blocks instanceof Uint16Array, 'teren klasyczny: kolumna Uint16Array');
check(CHUNK_SIZE === 16, 'chunk 16 x 16');

console.log(`OK: numery bloków 2-bajtowe - ${checks} sprawdzeń (chunk do 65535, zapis 1/2 bajty, stary i nowy zapis, baza, nieznane numery, zakresy paczek, materiały dalekiego terenu, generatory).`);
