// Regresje kształtu ujść i wpływu jezior na teren; prawdziwy Rivers.shape.
// Uruchomienie: node tools/sprawdz_ujscia.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.includes('/src/') && url.endsWith('.js')
            ? { ...context, format: 'module' } : context);
    }
});

const { Rivers } = await import('../src/world/terrain/Rivers.js');
const { RealisticGenerator, DETAIL_FULL, DETAIL_MEDIUM } = await import('../src/world/terrain/RealisticGenerator.js');
const { SEA_LEVEL } = await import('../src/config.js');
const cellKey = (i, j) => (i + 4096) * 8192 + j + 4096;

function fixture({ segment = true, lakes = [] } = {}) {
    const rivers = new Rivers({}, 123);
    rivers.zoneAt = () => ({
        x0: 0, z0: 0,
        segments: Float32Array.from(segment ? [8, 0, 8, 16, 48, 48, 2, 2, 1, 1] : []),
        bins: Array.from({ length: 256 }, () => segment ? [0] : []),
        lakeBins: Array.from({ length: 256 }, () => lakes),
        segmentStartLakes: [null], segmentEndLakes: [null]
    });
    return rivers;
}

// Brzeg i zaokrąglony koniec rzeki w naturalnie zalanej zatoce.
// Dawniej dno 44 podnosiło się do 49, tworząc suchy piaszczysty wał.
const mouth = fixture();
for (const spacing of [1, 4, 8, 16, 32]) {
    for (let x = 3; x <= 13; x++) {
        for (let z = 0; z <= 21; z++) {
            const out = { ocean: true, water: SEA_LEVEL, mountains: 0 };
            const height = mouth.shape(x, z, 46, 44, out, spacing);
            assert.ok(height <= 44, `Ujście podnosi dno: ${x},${z}, odstęp ${spacing}`);
            assert.equal(out.water, SEA_LEVEL, 'Ujście ma taflę odbierającego morza');
            assert.notEqual(out.river, 2, 'Brzeg rzeki nie staje się wyspą w morzu');
        }
    }
}

// Ochrona otwartej wody nie usuwa brzegów rzeki płynącej po lądzie
// ani istniejących wysp należących do profilu wybrzeża.
for (const ocean of [false, true]) {
    const out = { ocean, water: ocean ? SEA_LEVEL : 0, mountains: 0 };
    const height = mouth.shape(10, 8, 52, 52, out);
    assert.equal(out.river, 2);
    assert.ok(height >= SEA_LEVEL + 1);
}

// Wklęsły zarys jeziora: pusta część jego dużej ramki nie jest wodą
// ani obszarem wyrównywania wzgórz do makrorzeźby.
const lake = {
    minX: 0, minZ: 0, maxX: 1024, maxZ: 1024,
    level: 50, cells: new Set([cellKey(0, 0), cellKey(63, 63)])
};
const lakes = fixture({ segment: false, lakes: [lake] });
const lakeMouth = fixture({ lakes: [lake] });
for (const spacing of [1, 4, 8, 16, 32]) {
    const out = { ocean: false, water: 0, mountains: 0 };
    const height = lakeMouth.shape(10, 8, 44, 44, out, spacing);
    assert.equal(height, 44, 'Ujście nie usypuje brzegu wewnątrz jeziora');
    assert.equal(out.water, 50);
    assert.equal(out.lake, true);
    assert.equal(out.river, 0);
    assert.equal(out.flowX, 0);
    assert.equal(out.flowZ, 0);
}
for (const spacing of [1, 4, 8, 16, 32]) {
    const out = { ocean: false, water: 0, mountains: 0 };
    assert.equal(lakes.shape(128, 128, 40, 56, out, spacing), 56,
        'Ramka jeziora nie spłaszcza terenu poza jego sąsiedztwem');
    assert.equal(out.water, 0);
}

// Zniknięcie komórki jeziora z indeksu odległości nie tworzy uskoku.
const beforeEdge = lakes.shape(47, 8, 40, 56, { water: 0 });
const afterEdge = lakes.shape(48, 8, 40, 56, { water: 0 });
assert.ok(Math.abs(afterEdge - beforeEdge) < 0.05, 'Wpływ jeziora wygasa przed granicą indeksu');

// Prawdziwe ujścia w deterministycznym świecie, także na ujemnych
// współrzędnych. Porównanie z tym samym terenem bez obróbki rzekami.
const generator = new RealisticGenerator('lighting-rtx3050-0231');
const terrain = new RealisticGenerator('lighting-rtx3050-0231');
terrain.rivers.shape = (x, z, macro, full) => full;
// Dawniej samo wejście w prostokąt dużego jeziora ścinało te wzgórza
// z 57 do 49, mimo że ani jezioro, ani rzeka nie są obok kolumny.
for (const [x, z] of [[-356, -592], [-360, -580]]) {
    const shaped = generator.compute(x, z, DETAIL_FULL, {});
    const original = terrain.compute(x, z, DETAIL_FULL, {});
    assert.equal(shaped.lakeGap, Infinity);
    assert.equal(shaped.riverGap, Infinity);
    assert.equal(shaped.height, original.height, 'Daleki narożnik ramki jeziora nie ścina wzgórza');
}
let submerged = 0;
for (const [centerX, centerZ] of [[-136, -568], [520, 360], [568, -344], [968, -216]]) {
    for (const spacing of [1, 4, 8]) {
        const detail = spacing === 1 ? DETAIL_FULL : DETAIL_MEDIUM;
        for (let dx = -15; dx <= 15; dx++) {
            for (let dz = -15; dz <= 15; dz++) {
                const x = centerX + dx, z = centerZ + dz;
                const original = terrain.compute(x, z, detail, {}, spacing);
                if (!original.ocean || original.height >= SEA_LEVEL) continue;
                const shaped = generator.compute(x, z, detail, {}, spacing);
                assert.ok(shaped.height <= original.height,
                    `Rzeka usypała ląd w morzu przy ${x},${z}, odstęp ${spacing}`);
                assert.equal(shaped.water, SEA_LEVEL);
                submerged++;
            }
        }
    }
}
assert.ok(submerged > 1000, 'Fixture obejmuje dostatecznie duży obszar ujść');
console.log(`Ujścia i zasięg jezior: OK (${submerged} zanurzonych próbek rzeczywistego świata).`);
