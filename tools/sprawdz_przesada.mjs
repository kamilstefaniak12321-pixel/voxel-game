// ------------------------------------------------------------
// SPRAWDZENIE TRYBU PRZESADY (1.6.0)
//
// - rzadko: miejsce opanowane przez jedną roślinę jest w niewielkiej
//   części kwadratów świata, ale da się je znaleźć,
// - w środku roślina zajmuje ok. 80% trawy, przy brzegu rzednie, poza
//   miejscem świat jest taki jak bez przesady,
// - roślina pasuje do biomu na środku i rośnie tylko w swoich biomach,
// - ten sam świat ma zawsze te same miejsca; chunk nowy = chunk
//   wygenerowany jeszcze raz,
// - koszt: generowanie chunka poza miejscami bez zauważalnej różnicy.
//
// Uruchomienie: node tools/sprawdz_przesada.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
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
                export const getAtlasUV=(name)=>({uMin:0,uMax:1,vMin:0,vMax:1,name});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILE_SIZE=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        return next(url, url.endsWith('.js') && /\/(src|lib\/three|assets\/models)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

console.warn = () => {};

const E = await import('../src/world/terrain/PlantExcess.js');
const { PLANT_PACKS, PLANT_PACK_ERRORS } = await import('../src/blocks/plantPacks.js');
const { RealisticGenerator } = await import('../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../src/world/Chunk.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

check(PLANT_PACK_ERRORS.length === 0, `Paczki roślin bez błędów: ${PLANT_PACK_ERRORS.join('; ')}`);
check(E.EXCESS_COVER === 0.8, 'W środku roślina zajmuje 80% trawy');
check(E.EXCESS_PLANTS.includes('barwinek') && E.EXCESS_PLANTS.length >= 6, `Barwinek i co najmniej 5 innych roślin (${E.EXCESS_PLANTS.join(', ')})`);
check(!E.EXCESS_PLANTS.includes('mikolajek') && !E.EXCESS_PLANTS.includes('huba') && !E.EXCESS_PLANTS.includes('indygowiec'), 'Bez kłujących, nadrzewnych i wielkich roślin');
check(E.EXCESS_RADIUS[1] * 1.2 < E.EXCESS_CELL / 2, 'Miejsce mieści się w zasięgu sąsiednich kwadratów');

const SEED = 644734948;
const generator = new RealisticGenerator(SEED);
const excess = generator.excess;

// Rzadko, ale nie nigdy.
let cells = 0;
const zones = [];
for (let cx = -12; cx < 12; cx++) for (let cz = -12; cz < 12; cz++) { cells++; const zone = excess.zoneOfCell(cx, cz); if (zone) zones.push(zone); }
const share = zones.length / cells;
check(share > 0.03 && share < 0.16, `Miejsce w 3-16% kwadratów ${E.EXCESS_CELL} x ${E.EXCESS_CELL} (jest ${(share * 100).toFixed(1)}%)`);
check(new Set(zones.map((zone) => zone.plant)).size >= 4, 'Różne miejsca - różne rośliny');

for (const zone of zones) {
    check(zone.radius >= E.EXCESS_RADIUS[0] && zone.radius <= E.EXCESS_RADIUS[1], 'Promień w granicach');
    check(zone.pack.where.biomes.includes(zone.biome) && zone.biome === generator.biomeAt(zone.x, zone.z), `${zone.plant}: rośnie w biomie na środku miejsca (${zone.biome})`);
    check(excess.zoneAt(zone.x, zone.z)?.zone === zone && excess.zoneAt(zone.x, zone.z).depth > 0.95, 'Środek jest w miejscu');
    check(excess.zoneAt(zone.x + Math.round(zone.radius * 1.3), zone.z)?.zone !== zone, 'Za brzegiem już nie');
}

// Powtarzalność: nowy generator - te same miejsca.
const again = new RealisticGenerator(SEED).excess;
check(zones.every((zone) => { const other = again.zoneAt(zone.x, zone.z)?.zone; return other && other.plant === zone.plant && other.radius === zone.radius; }), 'Ten sam świat - te same miejsca');
const other = new RealisticGenerator(SEED + 1).excess;
let same = 0;
for (let cx = -12; cx < 12; cx++) for (let cz = -12; cz < 12; cz++) { const a = excess.zoneOfCell(cx, cz), b = other.zoneOfCell(cx, cz); if (a && b && a.x === b.x && a.z === b.z) same++; }
check(same === 0, 'Inne ziarno - inne miejsca');

const found = excess.nearest(0, 0);
check(found && found.distance < 1500, `Od startu do najbliższego miejsca niedaleko (${Math.round(found.distance)} bloków)`);

// Pokrycie: środek ok. 80%, brzeg rzadziej, daleko - nic z przesady.
const zone = found.zone;
const coverAt = (from, to) => {
    let grass = 0, covered = 0;
    for (let x = zone.x - zone.radius; x <= zone.x + zone.radius; x += 1) for (let z = zone.z - zone.radius; z <= zone.z + zone.radius; z += 1) {
        const at = excess.zoneAt(Math.floor(x), Math.floor(z));
        if (!at || at.zone !== zone || at.depth < from || at.depth >= to) continue;
        const biome = generator.biomeAt(Math.floor(x), Math.floor(z));
        if (!zone.pack.where.biomes.includes(biome)) continue;
        grass++;
        if (zone.ids.includes(excess.plantAt(Math.floor(x), Math.floor(z), biome))) covered++;
    }
    return covered / Math.max(1, grass);
};
const core = coverAt(E.EXCESS_EDGE, 1.01), rim = coverAt(0, E.EXCESS_EDGE / 2);
check(Math.abs(core - 0.8) < 0.03, `Środek: ok. 80% (jest ${(core * 100).toFixed(1)}%)`);
check(rim < 0.3 && rim > 0.02, `Brzeg: rzadziej (jest ${(rim * 100).toFixed(1)}%)`);
const foreign = ['rocky', 'snowy', 'beach', 'spruce', 'meadow'].find((key) => !zone.pack.where.biomes.includes(key));
check(excess.plantAt(zone.x, zone.z, 'sea') === 0 && excess.plantAt(zone.x, zone.z, foreign) === 0, 'W cudzym biomie roślina nie rośnie');

// Etapy: jak zwykle u tej rośliny (większość kwitnie).
const stages = new Array(zone.ids.length).fill(0);
for (let x = zone.x - 20; x < zone.x + 20; x++) for (let z = zone.z - 20; z < zone.z + 20; z++) { const id = excess.plantAt(x, z, zone.biome); if (id) stages[zone.ids.indexOf(id)]++; }
const total = stages.reduce((a, b) => a + b, 0);
check(zone.pack.where.stages.every((weight, i) => Math.abs(stages[i] / total - weight) < 0.06), `Etapy w proporcjach rośliny (${stages.map((n) => (n / total).toFixed(2))})`);

// Prawdziwy chunk w środku miejsca: roślina na większości trawy; ten sam
// chunk wygenerowany drugi raz jest identyczny.
const cx = Math.floor(zone.x / 16), cz = Math.floor(zone.z / 16);
const chunk = new Chunk(cx, cz);
generator.generateChunk(chunk);
let grass = 0, covered = 0;
for (let i = 0; i < 256; i++) for (let y = 30; y < 250; y++) if (chunk.blocks[y * 256 + i] === generator.ids.grass) { grass++; if (zone.ids.includes(chunk.blocks[(y + 1) * 256 + i])) covered++; }
check(grass > 60 && covered / grass > 0.6, `Chunk w środku: roślina na większości trawy (${covered} z ${grass})`);
const twin = new Chunk(cx, cz);
new RealisticGenerator(SEED).generateChunk(twin);
check(Buffer.from(twin.blocks.buffer).equals(Buffer.from(chunk.blocks.buffer)), 'Ten sam chunk generuje się tak samo');

// Daleko od miejsc generator daje to samo co bez przesady.
let farX = 0;
while (excess.zoneAt(farX * 16 + 8, 8) || excess.zoneAt(farX * 16 - 120, 8) || excess.zoneAt(farX * 16 + 136, 8)) farX += 9;
const plain = new RealisticGenerator(SEED);
plain.excess = { plantAt: () => 0 };
const a = new Chunk(farX, 0), b = new Chunk(farX, 0);
generator.generateChunk(a);
plain.generateChunk(b);
check(Buffer.from(a.blocks.buffer).equals(Buffer.from(b.blocks.buffer)), 'Poza miejscami świat jest taki sam jak bez przesady');

// Koszt sprawdzenia kolumny.
const started = performance.now();
let hits = 0;
for (let i = 0; i < 200000; i++) if (excess.plantAt(farX * 16 + (i & 15), (i >> 4) & 15, 'meadow')) hits++;
const perColumn = (performance.now() - started) / 200000 * 1e6;
check(hits === 0 && perColumn < 3000, `Kolumna poza miejscem: ${perColumn.toFixed(0)} ns`);

console.log(`OK: tryb przesady - ${checks} sprawdzeń; miejsc ${zones.length} na ${cells} kwadratów (${(share * 100).toFixed(1)}%), środek ${(core * 100).toFixed(0)}%, kolumna ${perColumn.toFixed(0)} ns; najbliższe od startu: ${zone.pack.label.toLowerCase()}, ${Math.round(found.distance)} bloków.`);
