// ------------------------------------------------------------
// SPRAWDZENIE ARKUSZY KORY (1.7.0)
//
// - arkusz 128 x 128 w atlasie (jeden kafelek 8 x 8 kratek); lista
//   rodzajów kafelków w grze = lista w generatorze tekstur,
// - zasada krawędzi: górna i dolna krawędź każdego kafelka ma bruzdy
//   w tych samych kolumnach (dowolny kafelek pasuje nad dowolnym), lewa
//   i prawa krawędź to grzbiet kory; dodatki nie dotykają krawędzi,
// - losowanie z wagami: zwykła kora to zdecydowana większość, dziupla
//   najrzadsza; ten sam bok tego samego bloku - zawsze ten sam kafelek,
//   różne boki - różne,
// - mesher: boki pnia dębu biorą różne kafelki, wierzch i spód oraz inne
//   bloki bez zmian; ta sama liczba ścian (zero kosztu rysowania).
//
// Uruchomienie: node tools/sprawdz_kore.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getTileColors=()=>[],getAtlasAverage=()=>null,getTileMask=()=>null;
                // Każda tekstura w innym pasku U; arkusz kory zajmuje pasek 8 razy szerszy.
                const seen=new Map();
                export const getAtlasUV=(name,inset=1/16)=>{ if(!seen.has(name)) seen.set(name,seen.size); const i=seen.get(name), w=name.endsWith('_bark')?8:1, e=inset/4096;
                    return {uMin:i/64+e,uMax:i/64+w/4096-e,vMin:e,vMax:w/4096-e,name}; };
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILE_SIZE=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

console.warn = () => {};

const { readTextureRegion } = await import('./texture_regions.mjs');
const B = await import('../src/rendering/BarkSheets.js');
const { WORLD_ATLAS_TILES, TEXTURE_REGIONS } = await import('../src/rendering/TextureSheetData.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

const GRID = B.BARK_GRID;
check(GRID === 8, 'Arkusz to 8 x 8 kafelków');

for (const [block, sheet] of Object.entries(B.BARK_SHEETS)) {

    check(getBlockId(block) > 0, `${block}: jest taki blok`);
    check(sheet.tiles.length === GRID * GRID && sheet.tiles.every((kind) => B.BARK_WEIGHTS[kind] > 0), `${block}: 64 kafelki, każdy ze znanym rodzajem`);

    const tile = WORLD_ATLAS_TILES[sheet.texture], region = TEXTURE_REGIONS[sheet.texture];
    check(tile && tile.w === GRID && tile.h === GRID && region.width === 16 * GRID && region.height === 16 * GRID, `${sheet.texture}: w atlasie jako jeden kafelek 8 x 8 kratek (128 x 128 pikseli)`);

    const { rgba } = readTextureRegion(sheet.texture);
    const pixel = (x, y) => (rgba[(y * 128 + x) * 4] << 16) | (rgba[(y * 128 + x) * 4 + 1] << 8) | rgba[(y * 128 + x) * 4 + 2];
    const light = (x, y) => rgba[(y * 128 + x) * 4] + rgba[(y * 128 + x) * 4 + 1] + rgba[(y * 128 + x) * 4 + 2];

    let opaque = true;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) opaque = false;
    check(opaque, `${sheet.texture}: bez przezroczystych pikseli`);

    // Zasada krawędzi. Bruzda = najciemniejszy ton zwykłej kory - na górnej i dolnej krawędzi w tych samych kolumnach
    // każdego kafelka.
    const tones = [...new Set(Array.from({ length: 16 * 16 * 6 }, (_, i) => light(i % 128, Math.floor(i / 128))))].sort((a, b) => a - b);
    const dark = (x, y) => light(x, y) <= tones[0];
    const edge = (tx, ty, y) => Array.from({ length: 16 }, (_, x) => dark(tx * 16 + x, ty * 16 + y) ? '#' : '.').join('');
    const top = edge(0, 0, 0);
    check((top.match(/#/g) ?? []).length >= 2, `${sheet.texture}: na krawędzi są bruzdy (${top})`);
    for (let ty = 0; ty < GRID; ty++) for (let tx = 0; tx < GRID; tx++) {
        check(edge(tx, ty, 0) === top && edge(tx, ty, 15) === top, `${sheet.texture} kafelek ${tx},${ty}: bruzdy na górze i dole w tych samych kolumnach (${edge(tx, ty, 0)} / ${edge(tx, ty, 15)})`);
        let side = 0;
        for (let y = 0; y < 16; y++) { if (dark(tx * 16, ty * 16 + y)) side++; if (dark(tx * 16 + 15, ty * 16 + y)) side++; }
        check(side <= 6, `${sheet.texture} kafelek ${tx},${ty}: lewa i prawa krawędź to grzbiet kory (${side} ciemnych pikseli)`);
    }

    // Kafelki naprawdę się różnią, a dodatki mają kolory spoza zwykłej kory.
    const plainColors = new Set();
    const hashes = new Set();
    sheet.tiles.forEach((kind, index) => {
        const tx = index % GRID, ty = Math.floor(index / GRID);
        let text = '';
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = pixel(tx * 16 + x, ty * 16 + y); text += c.toString(36); if (kind === 'zwykla') plainColors.add(c); }
        hashes.add(text);
    });
    check(hashes.size === 64, `${sheet.texture}: 64 różne kafelki`);
    check(plainColors.size <= 6, `${sheet.texture}: zwykła kora z kilku tonów (${plainColors.size})`);
    sheet.tiles.forEach((kind, index) => {
        if (!['okorowany', 'dziupla', 'porosty'].includes(kind)) return;
        const tx = index % GRID, ty = Math.floor(index / GRID);
        let extra = 0;
        for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) if (!plainColors.has(pixel(tx * 16 + x, ty * 16 + y))) extra++;
        check(extra >= (kind === 'porosty' ? 4 : 12), `${sheet.texture} ${kind} (${tx},${ty}): widać dodatek (${extra} pikseli w innych kolorach)`);
    });

    // Lista w grze = lista w generatorze tekstur (gdy jest Python z Pillow;
    // w CI go nie ma - wtedy pilnuje tego tylko liczba i kolory wyżej).
    try {
        const out = execFileSync('python3', ['-c', `import sys, json; sys.path.insert(0, 'tools'); import tekstury_kory as K; print(json.dumps([n for n, _ in K.SHEETS['${sheet.texture}']()]))`],
            { cwd: new URL('..', import.meta.url), stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        assert.deepEqual(JSON.parse(out), sheet.tiles, `${block}: rodzaje kafelków jak w tools/tekstury_kory.py`);
        checks++;
    }
    catch (error) {
        if (error instanceof assert.AssertionError) throw error;
    }

    // Losowanie.
    const lookup = B.barkLookup(sheet.tiles);
    const counts = {};
    const N = 400000;
    for (let i = 0; i < N; i++) {
        const kind = sheet.tiles[B.barkTile(lookup, (i * 7919) % 1000 - 500, 60 + (i % 37), Math.floor(i / 1000) - 200, [0, 1, 4, 5][i % 4])];
        counts[kind] = (counts[kind] ?? 0) + 1;
    }
    const total = sheet.tiles.reduce((sum, kind) => sum + B.BARK_WEIGHTS[kind], 0);
    for (const kind of Object.keys(B.BARK_WEIGHTS)) {
        const expected = sheet.tiles.filter((item) => item === kind).length * B.BARK_WEIGHTS[kind] / total;
        check(Math.abs((counts[kind] ?? 0) / N - expected) < 0.004 + expected * 0.05, `${block}: ${kind} trafia się tak często, jak mówi waga (${((counts[kind] ?? 0) / N * 100).toFixed(2)}% wobec ${(expected * 100).toFixed(2)}%)`);
    }
    check(counts.zwykla / N > 0.9, `${block}: zwykła kora to ponad 90% boków (${(counts.zwykla / N * 100).toFixed(1)}%)`);
    check(counts.dziupla / N < 0.006 && counts.dziupla < counts.sek && counts.dziupla < counts.okorowany, `${block}: dziupla najrzadsza (${(counts.dziupla / N * 100).toFixed(2)}%)`);

    check(B.barkTile(lookup, 5, 70, -9, 0) === B.barkTile(lookup, 5, 70, -9, 0), 'Ten sam bok - ten sam kafelek');
    let differ = 0;
    for (let i = 0; i < 500; i++) if (new Set([0, 1, 4, 5].map((face) => B.barkTile(lookup, i, 70, i * 3, face))).size >= 3) differ++;
    check(differ > 440, `Boki jednego bloku mają różne kafelki (${differ} z 500 bloków)`);
    let stacked = 0;
    for (let y = 0; y < 500; y++) if (B.barkTile(lookup, 3, y, 3, 0) !== B.barkTile(lookup, 3, y + 1, 3, 0)) stacked++;
    check(stacked > 470, `Kolejne bloki pnia mają różne kafelki (${stacked} z 500)`);

}


// --- Mesher ---------------------------------------------------------------------------------

const worldFor = (chunk) => ({ getChunk: (x, z) => x === chunk.cx && z === chunk.cz ? chunk : null,
    experiments: { bushyGrass: false }, getGrassDetail: () => 0, markPlantsDirty() {} });

function trunk(type) {
    const chunk = new Chunk(0, 0);
    for (let y = 4; y < 14; y++) chunk.setId(8, y, 8, getBlockId(type));
    chunk.skyLight.fill(15);
    return buildChunkGeometry(chunk, worldFor(chunk), { terrain: true, plants: true });
}

const oak = trunk('oak_log'), birch = trunk('birch_log');
// Ile różnych obrazków jest na ścianach (każda ściana = 4 rogi UV).
const us = (geometry) => { const uv = geometry.attributes.uv.array, seen = new Set(); for (let face = 0; face < uv.length / 8; face++) { let u = Infinity, v = Infinity; for (let i = 0; i < 4; i++) { u = Math.min(u, uv[face * 8 + i * 2]); v = Math.min(v, uv[face * 8 + i * 2 + 1]); } seen.add(`${u.toFixed(6)},${v.toFixed(6)}`); } return seen; };

check(blockRenderData[getBlockId('oak_log')].bark?.uv.length === 64 && blockRenderData[getBlockId('birch_log')].bark === null, 'Arkusz ma pień dębu, brzoza jeszcze nie');
check(oak.attributes.position.count === birch.attributes.position.count && oak.index.count === birch.index.count && oak.groups.length === birch.groups.length,
    'Pień dębu: tyle samo ścian i grup co pień bez arkusza');
check(us(birch).size === 2 && us(oak).size >= 20, `Boki pnia dębu z wielu kafelków (${us(oak).size} obrazków wobec ${us(birch).size} u brzozy)`);

// Każda ściana boczna mieści się w jednym kafelku arkusza, a wierzch i spód
// to dalej zwykły obrazek przekroju pnia.
{
    const uv = oak.attributes.uv.array, normal = oak.attributes.normal.array;
    const sheet = blockRenderData[getBlockId('oak_log')].bark.uv;
    const cell = (sheet[1][0][0] - sheet[0][0][0]) || 1;
    let sides = 0, caps = 0, inside = true;
    const capU = new Set();
    for (let face = 0; face < uv.length / 8; face++) {
        const u = [0, 1, 2, 3].map((i) => uv[face * 8 + i * 2]);
        if (normal[face * 12 + 1] !== 0) { caps++; u.forEach((value) => capU.add(value.toFixed(6))); continue; }
        sides++;
        if (Math.max(...u) - Math.min(...u) > Math.abs(cell) * 1.001) inside = false;
    }
    check(sides === 40 && caps === 2, `Pień 10 bloków: 40 boków i 2 czoła (jest ${sides} i ${caps})`);
    check(inside, 'Każdy bok to dokładnie jeden kafelek arkusza');
    check(capU.size <= 2, 'Czoła pnia bez zmian (jeden obrazek)');
}

check(JSON.stringify([...trunk('oak_log').attributes.uv.array]) === JSON.stringify([...oak.attributes.uv.array]), 'Ten sam pień - ta sama kora');

console.log(`OK: arkusze kory - ${checks} sprawdzeń.`);
