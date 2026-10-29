// Siedliska, zachowanie wody i powtarzalność roślinności rzecznej.
// Uruchomienie: node tools/sprawdz_roslinnosc_rzek.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const { RiverVegetation } = await import('../src/world/terrain/RiverVegetation.js');
const { RealisticGenerator, DETAIL_FULL } = await import('../src/world/terrain/RealisticGenerator.js');
const { BIOME_KEYS } = await import('../src/world/terrain/Biomes.js');
const { SEA_LEVEL, CHUNK_HEIGHT } = await import('../src/config.js');
const { getBlockId, getBlockTypeById, isLiquidId, getLiquidKindId, canPlantStay } =
    await import('../src/blocks/BlockRegistry.js');
const water = getBlockId('water');
const sand = getBlockId('sand');
const shoreNames = ['river_sedge', 'cattail', 'purple_loosestrife', 'reed'];
const aquaticNames = ['water_milfoil', 'water_lily', 'duckweed', 'cattail_water'];
const plantNames = [...shoreNames, ...aquaticNames];
for (const name of plantNames) assert.notEqual(getBlockId(name), 0, `Zarejestrowany gatunek ${name}`);
const vegetation = new RiverVegetation(2138286349);
const shore = Object.freeze({ height: SEA_LEVEL + 1, water: 0, river: 2, riverGap: 1, lakeGap: Infinity, mountains: 0 });
const shallows = Object.freeze({ height: SEA_LEVEL - 1, water: SEA_LEVEL, river: 1, riverGap: -0.5,
    lakeGap: Infinity, mountains: 0, flowX: 0.75, flowZ: 0 });
const counts = Object.fromEntries(plantNames.map(name => [name, 0]));
const bankPatches = new Uint16Array(32 * 16);

function blocksFor(sample) {
    const blocks = new Uint8Array(CHUNK_HEIGHT);
    blocks.fill(sand, 0, sample.height + 1);
    blocks.fill(water, sample.height + 1, sample.water + 1);
    return blocks;
}

function checkWater(sample, blocks) {
    assert.equal(blocks[sample.height], sand, 'Roślina nie zastępuje dna');
    assert.equal(blocks[sample.water + 1], 0, 'Roślina nie dodaje komórki ponad taflą');
    for (let y = sample.height + 1; y <= sample.water; y++) {
        assert.ok(isLiquidId(blocks[y]), 'Roślina nie usuwa wody');
        assert.equal(getLiquidKindId(blocks[y]), water, 'Roślina zachowuje rodzaj wody');
        if (blocks[y] === water) continue;
        const name = getBlockTypeById(blocks[y]);
        assert.ok(aquaticNames.includes(name), `Do wody nie trafia roślina lądowa ${name}`);
        assert.ok(canPlantStay(blocks[y], blocks[y - 1], blocks[y + 1]), `Podpora ${name}`);
        if (name === 'water_milfoil') assert.equal(y, sample.height + 1, 'Wywłócznik zakorzeniony w dnie');
        else assert.equal(y, sample.water, 'Liście i pałki przy powierzchni');
        if (name === 'cattail_water') assert.equal(sample.water - sample.height, 1, 'Pałka tylko na płyciźnie');
    }
}

// Kilka ekologicznych stref, bez zależności od konkretnych losowych punktów.
let floating = 0;
for (let x = -128; x < 128; x++) {
    for (let z = -64; z < 64; z++) {
        const shoreId = vegetation.shoreAt(x, z, shore, 'wetland', 'grass');
        if (shoreId) {
            counts[getBlockTypeById(shoreId)]++;
            bankPatches[Math.floor((z + 64) / 8) * 32 + Math.floor((x + 128) / 8)]++;
        }
        const sample = Object.freeze({ ...shallows, height: shallows.water - (1 + ((x + z + 192) % 3)) });
        const blocks = blocksFor(sample);
        vegetation.fillWater(x, z, sample, 'river', blocks);
        checkWater(sample, blocks);
        for (let y = sample.height + 1; y <= sample.water; y++) {
            if (blocks[y] !== water) counts[getBlockTypeById(blocks[y])]++;
        }
        if (['water_lily', 'duckweed'].includes(getBlockTypeById(blocks[sample.water]))) floating++;
    }
}
for (const [name, count] of Object.entries(counts)) assert.ok(count > 50, `Gatunek ${name} występuje w swoim siedlisku`);
assert.ok(floating / (256 * 128) < 0.2, 'Co najmniej 80% spokojnej tafli pozostaje otwarte');
const shoreCount = shoreNames.reduce((sum, name) => sum + counts[name], 0);
assert.ok(shoreCount / (256 * 128) < 0.6, 'Brzeg zachowuje przejścia między kępami');

// Sąsiednie odcinki mają podobniejszą gęstość niż odległe: to kępy,
// a nie równomierny rozsiew pojedynczych roślin ani siatka chunków.
let nearDifference = 0, farDifference = 0;
for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 24; x++) {
        const index = z * 32 + x;
        nearDifference += Math.abs(bankPatches[index] - bankPatches[index + 1]);
        farDifference += Math.abs(bankPatches[index] - bankPatches[index + 8]);
    }
}
assert.ok(nearDifference < farDifference, 'Roślinność tworzy przestrzennie spójne kępy');

// Niedozwolone siedliska nie mają nawet rzadkich losowych wyjątków.
for (let x = -48; x < 48; x++) {
    for (let z = -48; z < 48; z++) {
        for (const [change, biome] of [
            [{ ocean: true }, 'sea'], [{ mountains: 0.8 }, 'river'], [{}, 'snowy'], [{}, 'alpine'],
            [{ water: shallows.height + 4 }, 'lake'], [{ flowX: 2 }, 'river'], [{ riverGap: -3 }, 'river'],
            [{ height: SEA_LEVEL + 40, water: SEA_LEVEL + 41 }, 'river']
        ]) {
            const sample = { ...shallows, ...change };
            const blocks = blocksFor(sample);
            const before = blocks.slice();
            vegetation.fillWater(x, z, sample, biome, blocks);
            assert.deepEqual(blocks, before, `Puste siedlisko ${biome} ${JSON.stringify(change)}`);
        }
        for (const [change, biome, kind] of [
            [{ riverGap: 8 }, 'wetland', 'grass'], [{ ocean: true }, 'beach', 'sand'],
            [{}, 'snowy', 'grass'], [{}, 'alpine', 'grass'], [{}, 'rocky', 'rock'],
            [{ water: shore.height + 1 }, 'river', 'grass']
        ]) assert.equal(vegetation.shoreAt(x, z, { ...shore, ...change }, biome, kind), 0);
    }
}

// Rzeczywisty seed użytkownika oraz istniejące stanowiska światła/ujść.
const fixtures = [
    { seed: 2138286349, x: 188, z: -252, radius: 96, step: 2 },
    { seed: 'lighting-rtx3050-0231', x: 968, z: -216, radius: 64, step: 4 },
    { seed: 'lighting-rtx3050-0231', x: -1768, z: -1848, radius: 64, step: 4 }
];
for (const fixture of fixtures) {
    const generator = new RealisticGenerator(fixture.seed);
    const actualCounts = Object.fromEntries(plantNames.map(name => [name, 0]));
    const examples = new Map();
    const points = [];
    for (let x = fixture.x - fixture.radius; x <= fixture.x + fixture.radius; x += fixture.step) {
        for (let z = fixture.z - fixture.radius; z <= fixture.z + fixture.radius; z += fixture.step) {
            const sample = generator.compute(x, z, DETAIL_FULL, {});
            const biome = generator.biomeIndexAt(x, z, sample);
            const kind = generator.surfaceKind(x, z, sample, 0);
            const before = { ...sample };
            let id = generator.riverVegetation.shoreAt(x, z, sample, BIOME_KEYS[biome], kind);
            if (id) {
                const name = getBlockTypeById(id);
                actualCounts[name]++;
                if (!examples.has(name)) examples.set(name, [x, sample.height + 1, z]);
            }
            if (sample.water > sample.height) {
                const blocks = blocksFor(sample);
                generator.riverVegetation.fillWater(x, z, sample, BIOME_KEYS[biome], blocks);
                checkWater(sample, blocks);
                for (let y = sample.height + 1; y <= sample.water; y++) {
                    id = blocks[y];
                    if (id === water) continue;
                    const name = getBlockTypeById(id);
                    actualCounts[name]++;
                    if (!examples.has(name)) examples.set(name, [x, y, z]);
                }
            }
            assert.deepEqual(sample, before, 'Roślinność nie zmienia próbki terenu ani nurtu');
            if (examples.size && points.length < 100 && ((x + z) % 16 === 0)) points.push([x, z]);
        }
    }
    for (const point of examples.values()) points.push([point[0], point[2]]);
    if (typeof fixture.seed === 'number') {
        // Sąsiednie kolumny po obu stronach dodatnich i ujemnych granic.
        for (const x of [159, 160, 175, 176, 191, 192]) {
            for (const z of [-257, -256, -241, -240]) points.push([x, z]);
        }
    }
    const columns = points.map(([x, z]) => generator.columnBlocks(x, z).blocks);
    const reverse = new RealisticGenerator(fixture.seed);
    for (let i = points.length - 1; i >= 0; i--) {
        const [x, z] = points[i];
        assert.deepEqual(reverse.columnBlocks(x, z).blocks, columns[i], `Kolejność kolumn ${x},${z}`);
        const sample = generator.compute(x, z, DETAIL_FULL, {});
        for (let y = sample.height + 1; y <= sample.water; y++) {
            assert.equal(getLiquidKindId(columns[i][y]), water, `Pełna kolumna zachowuje wodę ${x},${y},${z}`);
            if (columns[i][y] !== water) {
                assert.ok(canPlantStay(columns[i][y], columns[i][y - 1], columns[i][y + 1]),
                    `Pełna kolumna zachowuje podporę ${x},${y},${z}`);
            }
        }
    }
    const total = Object.values(actualCounts).reduce((sum, value) => sum + value, 0);
    assert.ok(total > 0, 'Rzeczywista rzeka/jezioro ma nową roślinność');
    if (typeof fixture.seed === 'number') {
        for (const name of plantNames) assert.ok(actualCounts[name] > 0, `Seed użytkownika zawiera ${name}`);
    }
    console.log(JSON.stringify({ seed: fixture.seed, anchor: [fixture.x, fixture.z], counts: actualCounts,
        examples: Object.fromEntries(examples) }));
}

console.log('OK: 8 gatunków, siedliska, otwarty nurt, zachowana woda i powtarzalne kolumny.');
