// ------------------------------------------------------------
// SPRAWDZENIE PÓR ROKU I KWIATÓW (1.4.0)
//
// - kalendarz: pora roku = cykl księżyca (nów -> nów, pełnia w środku),
//   rok = wiosna, lato, jesień, zima; nowy świat zaczyna w środku wiosny,
// - kwiaty z "pory" w roslina.json: w porze widać pąki i kwiaty, poza
//   nią pierwszy etap (liście); blok w świecie się nie zmienia,
// - każda roślina budzi się i zasypia we własnym terminie (nie cała łąka
//   naraz), zawsze tym samym w tym samym miejscu,
// - mesher rysuje widoczny etap i podaje, kiedy chunk trzeba przebudować;
//   świat przebudowuje tylko chunki, w których coś się zmienia,
// - celownik i zbiór widzą to samo co oko; wzrost: w porze szybciej,
//   poza porą odpoczynek,
// - bez czasu pór roku (podglądy, stare testy) wszystko jak dawniej.
//
// Uruchomienie: node tools/sprawdz_pory_roku.mjs
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

const C = await import('../src/config.js');
const S = await import('../src/sky/Seasons.js');
const { Celestial } = await import('../src/sky/Celestial.js');
const { PLANT_PACKS, PLANT_PACK_ERRORS } = await import('../src/blocks/plantPacks.js');
const P = await import('../src/blocks/plantSeasons.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId, getBlockTypeById, getHarvest } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { applyPlantModelLevel } = await import('../src/rendering/PlantModelLevels.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { World } = await import('../src/world/World.js');
const { Vector3 } = await import('three');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

check(PLANT_PACK_ERRORS.length === 0, `Paczki roślin bez błędów: ${PLANT_PACK_ERRORS.join('; ')}`);


// --- Kalendarz ------------------------------------------------------------------------------

check(S.SEASONS.join() === 'wiosna,lato,jesien,zima', 'Cztery pory w kolejności roku');
check(S.SEASON_DAYS === C.MOON_CYCLE_DAYS * C.SEASON_MOONS && S.YEAR_DAYS === 4 * S.SEASON_DAYS, 'Pora = pełne cykle księżyca, rok = cztery pory');

const startDays = C.START_TIME_OF_DAY;
const first = S.seasonAt(startDays);

check(first.key === S.SEASONS[C.FIRST_SEASON] && first.year === 1, 'Nowy świat zaczyna się w pierwszej porze (wiosną), w roku 1');
check(first.progress > 0.3 && first.progress < 0.7, `Nowy świat zaczyna się w środku pory (postęp ${first.progress.toFixed(2)})`);

// Księżyc: początek każdej pory to nów, środek to pełnia.
const sky = new Celestial();
for (let k = 0; k < 9; k++) {
    const start = S.nextSeasonStart(k % 4, startDays + k * S.SEASON_DAYS);
    sky.update(start + 1e-6);
    check(sky.moonPhase < 0.01 || sky.moonPhase > 0.99, `Pora ${k}: zaczyna się w nowiu (faza ${sky.moonPhase.toFixed(3)})`);
    sky.update(start + S.SEASON_DAYS / 2);
    check(near(sky.moonPhase, 0.5, 0.01), `Pora ${k}: pełnia w środku`);
    const season = S.seasonAt(start + 1e-6);
    check(season.index === k % 4 && season.day === 1 && near(season.start, start, 1e-5) && near(season.end, start + S.SEASON_DAYS, 1e-5), `Pora ${k}: początek, dzień 1`);
    check(S.seasonAt(start - 1e-6).index === (k + 3) % 4, `Pora ${k}: chwilę wcześniej trwa poprzednia`);
}

// Kolejność pór i lat w czasie.
let order = '';
for (let d = startDays; d < startDays + 2 * S.YEAR_DAYS; d += S.SEASON_DAYS) order += S.seasonAt(d).index;
check(order === '01230123', `Pory idą po kolei (${order})`);
check(S.seasonAt(startDays + S.YEAR_DAYS).year === 2 && S.seasonAt(startDays + S.YEAR_DAYS).key === first.key, 'Po roku ta sama pora, rok 2');
check(S.seasonAt(-100.25).index >= 0 && S.yearPosition(-100.25) >= 0, 'Ujemny czas też ma porę');
check(S.seasonIndex('Jesień') === 2 && S.seasonIndex('jesien') === 2 && S.seasonIndex('maj') === -1, 'Pora ze słowa');

// Płynne udziały: suma 1, w środku pory tylko ona, na granicy pół na pół.
for (let d = 0; d < S.YEAR_DAYS; d += 0.37) {
    const w = S.seasonWeights(d);
    check(near(w[0] + w[1] + w[2] + w[3], 1) && w.every((v) => v >= 0 && v <= 1), 'Udziały pór: suma 1');
}
const mid = S.seasonWeights(S.nextSeasonStart(1, 0) + S.SEASON_DAYS / 2);
check(mid[1] === 1, 'W środku lata liczy się tylko lato');
const edge = S.seasonWeights(S.nextSeasonStart(2, 0));
check(near(edge[1], 0.5, 1e-6) && near(edge[2], 0.5, 1e-6), 'Na granicy lata i jesieni: pół na pół');
let jump = 0, last = S.seasonWeights(0).slice();
for (let d = 0.01; d < S.YEAR_DAYS + 1; d += 0.01) {
    const w = S.seasonWeights(d);
    jump = Math.max(jump, ...w.map((v, i) => Math.abs(v - last[i])));
    last = w.slice();
}
check(jump < 0.02, `Udziały pór zmieniają się płynnie (największy krok ${jump.toFixed(4)})`);


// --- Rośliny --------------------------------------------------------------------------------

const seasonal = PLANT_PACKS.filter((pack) => pack.seasons);
check(seasonal.length >= 12, `Co najmniej 12 roślin z porami (jest ${seasonal.length})`);
for (let index = 0; index < 3; index++) {
    check(seasonal.filter((pack) => pack.seasons.includes(index)).length >= 3, `${S.SEASONS[index]}: kwitną co najmniej 3 rośliny`);
}
check(seasonal.filter((pack) => pack.seasons.includes(3)).length <= 2, 'Zimą prawie nic nie kwitnie');

const pack = (id) => PLANT_PACKS.find((item) => item.id === id);
check(pack('zawilec').seasons.join() === '0' && pack('zawilec').seasonBoost >= 4, 'Zawilec: wiosna, rośnie znacznie szybciej');
check(pack('nagietek').seasons.join() === '1,2', 'Nagietek: lato i jesień');
check(!pack('huba').seasons && !pack('porostiglasty').seasons, 'Huby i porosty: cały rok');

const springMid = S.nextSeasonStart(0, 100) + S.SEASON_DAYS / 2;
const at = (index, part = 0.5) => S.nextSeasonStart(index, 100) + S.SEASON_DAYS * part;

for (const item of seasonal) {

    const ids = item.stages.map((_, stage) => item.firstId + stage);
    const top = ids.at(-1);

    check(ids.every((id) => P.isSeasonalPlant(id)), `${item.id}: wszystkie etapy na liście`);

    for (let index = 0; index < 4; index++) {
        const inSeason = item.seasons.includes(index);
        const shown = P.shownPlantId(top, 10, 70, -4, at(index));
        check(shown === (inSeason ? top : ids[0]), `${item.id} w środku pory ${S.SEASONS[index]}: ${inSeason ? 'kwitnie' : 'same liście'}`);
        check(P.shownPlantId(ids[0], 10, 70, -4, at(index)) === ids[0], `${item.id}: młoda roślina zawsze wygląda tak samo`);
        check(P.plantGrowthFactor(ids[0], at(index)) === (inSeason ? item.seasonBoost : 0), `${item.id} / ${S.SEASONS[index]}: tempo wzrostu`);
    }

    check(P.nextPlantChange(ids[0], 1, 2, 3, 50) === Infinity, `${item.id}: pierwszy etap nigdy nie zmienia wyglądu`);

}

// Własne terminy: w pierwszych dobach pory część roślin jeszcze śpi,
// część ma pąki, część kwitnie; potem wszystkie; pod koniec zasypiają.
const zawilec = pack('zawilec'), bloom = zawilec.firstId + 2;
const share = (days) => { const n = [0, 0, 0]; for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) n[P.shownPlantId(bloom, x, 70, z, days) - zawilec.firstId]++; return n.map((v) => v / 1600); };
const spring = S.nextSeasonStart(0, 100);
check(share(spring - 0.01)[0] === 1, 'Tuż przed wiosną zawilce to same liście');
const early = share(spring + 0.6);
check(early[0] > 0.2 && early[1] > 0.1 && early[2] > 0.05, `Początek wiosny: liście, pąki i kwiaty naraz (${early.map((v) => v.toFixed(2))})`);
check(share(spring + P.WAKE_DAYS + P.BUD_DAYS + 0.01)[2] === 1, 'Po pobudce kwitną wszystkie');
const late = share(spring + S.SEASON_DAYS - 0.6);
check(late[0] > 0.2 && late[2] > 0.2 && late[1] === 0, `Koniec wiosny: część już zasnęła (${late.map((v) => v.toFixed(2))})`);
check(share(spring + S.SEASON_DAYS + 0.01)[0] === 1, 'Latem zawilce to same liście');
check(P.shownPlantId(bloom, 3, 70, 9, spring + 0.6) === P.shownPlantId(bloom, 3, 70, 9, spring + 0.6 + S.YEAR_DAYS), 'Ten sam termin co roku');

// Roślina na dwie pory nie zasypia w połowie.
const nagietek = pack('nagietek');
check(P.shownPlantId(nagietek.firstId + 2, 5, 70, 5, S.nextSeasonStart(2, 100) + 0.01) === nagietek.firstId + 2, 'Nagietek kwitnie bez przerwy na granicy lata i jesieni');

// nextPlantChange: dokładnie w tej chwili zmienia się wygląd, a wcześniej nie.
for (const [x, z] of [[0, 0], [7, -3], [120, 55], [-9, 14]]) {
    let days = 100, changes = 0;
    while (days < 100 + S.YEAR_DAYS) {
        const next = P.nextPlantChange(bloom, x, 70, z, days);
        check(next > days && next < days + S.YEAR_DAYS, 'Następna zmiana jest w przyszłości, najdalej za rok');
        const before = P.shownPlantId(bloom, x, 70, z, next - 1e-6), after = P.shownPlantId(bloom, x, 70, z, next + 1e-6);
        check(before !== after, 'W chwili zmiany wygląd naprawdę się zmienia');
        check(P.shownPlantId(bloom, x, 70, z, (days + next) / 2) === before, 'Przed zmianą wygląd stoi');
        days = next;
        if (next < 100 + S.YEAR_DAYS) changes++;
    }
    check(changes === 3, `Trzy zmiany w roku: pobudka, kwiat, sen (jest ${changes})`);
}


// --- Mesher, celownik, zbiór ----------------------------------------------------------------

applyPlantModelLevel('semi');

const grass = getBlockId('grass');
function meadow() {
    const chunk = new Chunk(0, 0);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
        chunk.setId(x, 8, z, grass);
        if ((x + z) % 2 === 0) chunk.setId(x, 9, z, x < 8 ? bloom : nagietek.firstId + 2);
    }
    chunk.skyLight.fill(15);
    return chunk;
}
const worldFor = (chunk, seasonDays) => ({ getChunk: (x, z) => x === chunk.cx && z === chunk.cz ? chunk : null,
    experiments: { bushyGrass: false }, getGrassDetail: () => 0, markPlantsDirty: (c) => { c.plantRevision++; }, seasonDays });
const built = (seasonDays) => { const chunk = meadow(); const geometry = buildChunkGeometry(chunk, worldFor(chunk, seasonDays), { terrain: true, plants: true }); return { chunk, geometry, count: geometry.attributes.position.count }; };
const equal = (a, b) => a.count === b.count && a.geometry.attributes.position.array.every((v, i) => v === b.geometry.attributes.position.array[i]);

const plain = built(null), inSpring = built(springMid), inSummer = built(at(1)), inWinter = built(at(3));

check(plain.chunk.seasonNext === Infinity, 'Bez pór roku: chunk nie czeka na żadną zmianę');
check(inWinter.count < inSpring.count && inWinter.count < inSummer.count && inSpring.count < plain.count && inSummer.count < plain.count,
    `Zimą same liście, wiosną zawilce, latem nagietki, bez pór wszystko (${inWinter.count} < ${inSpring.count}, ${inSummer.count} < ${plain.count})`);
check(equal(inSpring, built(springMid)) && !equal(inSpring, inSummer), 'Ta sama chwila - ten sam obraz; inna pora - inny');
check(Buffer.from(inWinter.chunk.blocks).equals(Buffer.from(plain.chunk.blocks)), 'Bloki w chunku się nie zmieniają');
check(inSpring.chunk.seasonNext > springMid && inSpring.chunk.seasonNext < spring + S.SEASON_DAYS, 'Wiosną chunk wie, kiedy zaśnie pierwszy zawilec');
check(inWinter.chunk.seasonNext > at(3) && inWinter.chunk.seasonNext <= spring + S.YEAR_DAYS + P.WAKE_DAYS, 'Zimą chunk czeka na wiosnę');
const justAfter = built(inSpring.chunk.seasonNext + 1e-6), justBefore = built(inSpring.chunk.seasonNext - 1e-6);
check(equal(justBefore, inSpring) && !equal(justAfter, inSpring), 'Obraz zmienia się dokładnie w podanej chwili');

// Prawdziwy świat: przebudowa tylko wtedy, gdy trzeba.
{
    const world = Object.create(World.prototype);
    const chunk = meadow();
    const dirty = [];
    Object.assign(world, { chunks: new Map([['0,0', chunk]]), seasonDays: null, seasonScanAt: 0, markPlantsDirty: (c) => dirty.push(c),
        getChunk: () => chunk, toChunkCoord: (v) => Math.floor(v / 16) });
    world.getBlockId = (x, y, z) => x >= 0 && x < 16 && z >= 0 && z < 16 ? chunk.getId(x, y, z) : 0;
    world.updateSeasons(springMid);
    check(dirty.length === 0, 'Chunk jeszcze nie zbudowany - nic do przebudowy');
    buildChunkGeometry(chunk, world, { terrain: true, plants: true });
    const next = chunk.seasonNext;
    world.updateSeasons(springMid + 0.01);
    world.updateSeasons(next - 0.02);
    check(dirty.length === 0, 'Przed terminem chunk stoi');
    world.updateSeasons(next + 0.001);
    check(dirty.length === 1, 'W terminie chunk przebudowuje rośliny (raz)');
    world.updateSeasons(next + 0.02);
    check(dirty.length === 1, 'Bez nowej budowy - bez kolejnej przebudowy');
    buildChunkGeometry(chunk, world, { terrain: true, plants: true });
    world.updateSeasons(springMid - 3);
    check(dirty.length === 2, 'Skok czasu wstecz: chunk z kwiatami przebudowuje się');

    // Celownik i zbiór: to, co widać.
    world.seasonDays = at(3);
    check(world.shownBlockId(0, 9, 0) === zawilec.firstId && world.getBlockId(0, 9, 0) === bloom, 'Zimą zawilec jest w świecie, ale widać liście');
    const ray = new VoxelRaycast(world, 8);
    const hit = ray.cast(new Vector3(0.5, 12, 0.5), new Vector3(0, -1, 0));
    check(hit?.hit && hit.block.y === 9 && hit.block.type === getBlockTypeById(zawilec.firstId), `Celownik zimą trafia w młodego zawilca (${hit?.block?.type})`);
    check(getHarvest(hit.block.type) === null, 'Zimą nie ma czego zbierać');
    world.seasonDays = springMid;
    const hitSpring = ray.cast(new Vector3(0.5, 12, 0.5), new Vector3(0, -1, 0));
    check(hitSpring.block.type === getBlockTypeById(bloom) && getHarvest(hitSpring.block.type) !== null, 'Wiosną ten sam zawilec kwitnie i daje kwiaty');
    world.seasonDays = null;
    check(world.shownBlockId(0, 9, 0) === bloom, 'Bez pór roku widać prawdziwy blok');
}

// Wzrost: w porze szybciej, poza porą wcale; reszta roślin bez zmian.
{
    const chunk = new Chunk(0, 0);
    const young = zawilec.firstId, bush = getBlockId('strawberry_bush_1') || getBlockId('blueberry_bush_1');
    let grown = 0;
    const world = { chunks: new Map([['0,0', chunk]]), getBlockId: () => 0, setBlock: () => { grown++; return false; } };
    for (let i = 0; i < 200; i++) { chunk.blocks[i] = young; chunk.growing.add(i); }
    chunk.modified = true;
    const growth = new PlantGrowth(world);
    const run = (days, ticks = 300) => { grown = 0; growth.days = days; const random = Math.random; let seed = 7; Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let i = 0; i < ticks; i++) growth.tick(); Math.random = random; return grown; };
    const base = run(null), boosted = run(springMid), resting = run(at(1));
    check(resting === 0, 'Latem zawilec odpoczywa (nie rośnie)');
    check(boosted > base * 3 && boosted < base * 5.5, `Wiosną zawilec rośnie ok. 4 x szybciej (${base} -> ${boosted})`);
}

console.log(`OK: pory roku i kwiaty - ${checks} sprawdzeń; pora ${S.SEASON_DAYS} dób, rok ${S.YEAR_DAYS} dób, rośliny z porami: ${seasonal.length}.`);
