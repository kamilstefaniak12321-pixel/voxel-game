// ------------------------------------------------------------
// SPRAWDZENIE WODOSPADÓW (0.73.0)
//
// - spadająca woda liczy bloki spadku (1-16) i jest zwykłą pełną wodą,
// - bok spadającej wody niesie w UV spadek (shader przyspiesza teksturę),
// - rozbryzg kropli rośnie ze spadkiem (piana i mgiełka od 0.75 mają
//   osobny test rzeczywistej siatki: sprawdz_piane_mgielke.mjs),
// - rzeki w terenie realistycznym: przy spadku od RIVERS.waterfall bloków
//   jest wodospad - woda nad nim i pod nim płaska, pod nim sadzawka
//   głębsza i szersza niż koryto, woda nigdzie nie ucieka na boki,
// - scena "wodospady" w trybie programisty.
//
// Uruchomienie: node tools/sprawdz_wodospady.mjs
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
                export const getTileColors = () => [];
                export const getAtlasAverage = () => null;
                export const getAtlasUV = () => ({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16, ATLAS_ROWS=16;
                export const ATLAS_TILES={water:{x:0,y:0}};
            ` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url)
            ? { ...context, format: 'module' } : context);
    }
});

const { getBlockId, getWaterLevel, isFlowingWaterId, isFallingWaterId, waterFallDistance, fallingWaterId,
    WATER_FALLING_ID, WATER_FALL_MAX, getBlockDefinition, getBlockTypeById } = await import('../src/blocks/BlockRegistry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { WATER_FLOW_UV, WATER_FALL_MARK } = await import('../src/rendering/BlockRenderData.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { waterfallStrength } = await import('../src/rendering/WaterfallEffects.js');
const { RealisticGenerator, DETAIL_FULL } = await import('../src/world/terrain/RealisticGenerator.js');
const { RIVERS } = await import('../src/world/terrain/TerrainShape.js');
const { SCENES } = await import('../src/dev/scenes.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Licznik spadku -----------------------------------------------------

check(WATER_FALL_MAX === 16, 'Spadek liczony do 16 bloków');
for (let fall = 1; fall <= WATER_FALL_MAX; fall++) {
    const id = fallingWaterId(fall);
    check(isFallingWaterId(id) && waterFallDistance(id) === fall, `Spadek ${fall}`);
    check(getWaterLevel(id) === 8 && isFlowingWaterId(id), `Spadek ${fall} - pełna płynąca woda`);
    const definition = getBlockDefinition(getBlockTypeById(id));
    check(definition && definition.liquid && !definition.inventory && definition.pick === 'water', `Spadek ${fall} - blok wody bez przedmiotu`);
}
check(fallingWaterId(1) === WATER_FALLING_ID, 'Pierwszy blok spadku - dawny numer (stare zapisy)');
check(fallingWaterId(40) === fallingWaterId(16), 'Dłuższy spadek zostaje na 16');
check(waterFallDistance(getBlockId('water')) === 0 && !isFallingWaterId(getBlockId('water')), 'Źródło nie spada');


// --- Bok spadającej wody: spadek w UV ----------------------------------------

const world = { getChunk: () => null };
for (const fall of [1, 8, 16]) {
    const chunk = new Chunk(0, 0);
    chunk.setId(8, 20, 8, fallingWaterId(fall));
    chunk.skyLight.fill(15);
    const geometry = buildChunkGeometry(chunk, world);
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    let sides = 0;
    for (let i = 0; i < normal.count; i += 4) {
        if (normal.getY(i) !== 0) continue;
        sides++;
        const u = (uv.getX(i) - 0.5) / WATER_FLOW_UV * WATER_FALL_MAX;
        const v = (uv.getY(i) - 0.5) / WATER_FLOW_UV;
        check(Math.abs(u - fall) < 1e-3 && Math.abs(v - WATER_FALL_MARK) < 1e-3, `Bok wody spadającej ${fall} bloków niesie spadek`);
    }
    check(sides === 4, 'Cztery boki spadającej wody');
}


// --- Rozbryzg rośnie ze spadkiem -----------------------------------------------

let previous = null;
for (let fall = 1; fall <= 16; fall++) {
    const strength = waterfallStrength(fall);
    if (previous) {
        check(strength.splash > previous.splash, 'Więcej kropli');
        check(strength.rise >= previous.rise, 'Krople wyżej');
    }
    previous = strength;
}


// --- Wodospady w rzekach ---------------------------------------------------------

const generator = new RealisticGenerator(42);
const falls = generator.rivers.waterfalls(-200, -636, 64);
check(falls.length === 2, `Dwa piętra wodospadu w seedzie 42 (${falls.length})`);
check(falls.every((fall) => fall.top - fall.bottom >= RIVERS.waterfall), 'Wodospad od 5 bloków');
const tiers = [...falls].sort((a, b) => b.top - a.top);
check(tiers[0].bottom === tiers[1].top, 'Piętra: dół wyższego wodospadu to góra niższego');

const samples = new Map();
const at = (x, z) => {
    const key = `${x},${z}`;
    let sample = samples.get(key);
    if (!sample) {
        const out = generator.compute(x, z, DETAIL_FULL, {});
        sample = { height: out.height, water: out.water > out.height ? out.water : -1, pool: out.waterfallPool };
        samples.set(key, sample);
    }
    return sample;
};

let lips = 0;
let poolColumns = 0;
let deepest = Infinity;

for (const fall of falls) {

    const R = 12;

    for (let x = Math.floor(fall.x) - R; x <= Math.floor(fall.x) + R; x++) {

        for (let z = Math.floor(fall.z) - R; z <= Math.floor(fall.z) + R; z++) {

            const column = at(x, z);

            if (column.water < 0) continue;

            const distance = Math.hypot(x + 0.5 - fall.x, z + 0.5 - fall.z);

            // Przy wodospadzie woda jest albo na górze, albo na dole -
            // bez schodków pomiędzy.
            if (distance < 6) {
                check(column.water <= fall.bottom || column.water >= fall.top, 'Bez schodków przy wodospadzie');
            }

            if (column.pool === fall.top - fall.bottom) {
                poolColumns++;
                check(column.water === fall.bottom, 'Sadzawka na poziomie rzeki poniżej');
                deepest = Math.min(deepest, column.height - fall.bottom);
            }

            // Woda nie ucieka na boki: obok jest woda co najmniej tak
            // wysoka, teren co najmniej tak wysoki - albo niższa woda
            // (krawędź wodospadu).
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const neighbor = at(x + dx, z + dz);
                if (neighbor.water >= column.water) continue;
                if (neighbor.water >= 0) {
                    if (column.water - neighbor.water >= RIVERS.waterfall) lips++;
                    continue;
                }
                check(neighbor.height >= column.water, `Woda nie wylewa się z koryta przy wodospadzie (${x}, ${z})`);
            }

        }

    }

}

check(lips >= 4, `Krawędź wodospadu - woda wylewa się w dół koryta (${lips})`);
check(poolColumns >= 20, `Sadzawki pod wodospadami (${poolColumns} kolumn)`);
check(deepest <= -(RIVERS.depth + 3), `Sadzawka głębsza niż koryto (dno ${deepest} pod wodą)`);


// --- Scena ---------------------------------------------------------------------

const scene = SCENES.find((candidate) => candidate.id === 'wodospady');
check(scene && typeof scene.build === 'function' && scene.slot, 'Scena wodospadów w trybie programisty');

console.log(`OK: wodospady - ${checks} sprawdzeń (spadek 1-16, boki wody, rozbryzg, ${falls.length} piętra w seedzie 42: ` +
    `${tiers.map((fall) => `${fall.top}->${fall.bottom}`).join(', ')}, sadzawki ${poolColumns} kolumn, dno ${deepest}).`);
