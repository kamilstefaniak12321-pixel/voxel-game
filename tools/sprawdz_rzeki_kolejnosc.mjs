// Kolejność streamingu nie może zmieniać rzek, jezior ani granic chunków.
// Kilka rzeczywistych stanowisk, bez skanowania całego świata.
// Uruchomienie: node tools/sprawdz_rzeki_kolejnosc.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const { RealisticGenerator, DETAIL_FULL } = await import('../src/world/terrain/RealisticGenerator.js');
const { Chunk } = await import('../src/world/Chunk.js');
const seed = 'lighting-rtx3050-0231';
const anchors = [
    [-1768, -1848], [-1096, -2952], // jeziora
    [968, -216], [-136, -568], [520, 360] // ujścia
];
const forward = new RealisticGenerator(seed);
const reverse = new RealisticGenerator(seed);

// Odwiedzamy najpierw przeciwległe końce trasy, jak różne workery LOD
// i gracz rozpoczynający podróż z dwóch stron tego samego świata.
for (const [x, z] of anchors) forward.compute(x, z, DETAIL_FULL, {});
for (const [x, z] of [...anchors].reverse()) reverse.compute(x, z, DETAIL_FULL, {});

const fields = ['height', 'water', 'river', 'lake', 'flowX', 'flowZ'];
const sample = (generator, x, z) => {
    const value = generator.compute(x, z, DETAIL_FULL, {});
    return fields.map(field => value[field]);
};
const points = [];
for (const [x0, z0] of anchors) {
    // Z obu stron granic 16 i 256, również dla ujemnych współrzędnych.
    // Gęstsze pary 15/16 i 255/256 zapobiegają pominięciu szwu siatki.
    for (let x = x0 - 48; x <= x0 + 48; x += 4) {
        for (let z = z0 - 48; z <= z0 + 48; z += 4) points.push([x, z]);
    }
    for (const step of [16, 256]) {
        const x = Math.floor(x0 / step) * step, z = Math.floor(z0 / step) * step;
        for (let offset = -32; offset <= 32; offset += 2) {
            points.push([x - 1, z0 + offset], [x, z0 + offset]);
            points.push([x0 + offset, z - 1], [x0 + offset, z]);
        }
    }
}

const first = points.map(([x, z]) => sample(forward, x, z));
let wet = 0, lakes = 0, rivers = 0;
for (let i = points.length - 1; i >= 0; i--) {
    const [x, z] = points[i];
    assert.deepEqual(sample(reverse, x, z), first[i], `Kolejność odwiedzin zmieniła teren (${x},${z})`);
    if (first[i][1] > first[i][0]) wet++;
    if (first[i][3]) lakes++;
    if (first[i][2] === 1) rivers++;
}
assert.ok(wet > 0 && lakes > 0 && rivers > 0, 'Stanowiska muszą obejmować wodę jezior i koryt');

// Dogenerowanie źródeł i zagłębień dalej nie może zmieniać już
// przygotowanego terenu przez wspólne maps levels/counts/pitLakes/lakes.
for (const [x, z] of [[2048, -4096], [-4096, 1024]]) forward.compute(x, z, DETAIL_FULL, {});
for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    assert.deepEqual(sample(forward, x, z), first[i], `Nowe źródła zmieniły istniejące miejsce (${x},${z})`);
}

// Pełne sąsiadujące chunki po obu stronach zgłoszonej granicy jeziora:
// woda, rośliny i materiały też muszą być jednakowe, nie tylko height.
for (const [cx, cz] of [[-120, -121], [-119, -121], [60, -14], [61, -14]]) {
    const a = new Chunk(cx, cz), b = new Chunk(cx, cz);
    forward.generateChunk(a);
    reverse.generateChunk(b);
    assert.deepEqual(a.blocks, b.blocks, `Kolejność zmieniła bloki chunka ${cx},${cz}`);
    assert.deepEqual(a.flow, b.flow, `Kolejność zmieniła nurt chunka ${cx},${cz}`);
    assert.deepEqual(a.tint, b.tint, `Kolejność zmieniła kolory chunka ${cx},${cz}`);
}

// Te same punkty na niezależnych kopiach generatora używanych przez LOD.
for (const [x0, z0] of anchors) {
    for (const spacing of [4, 16, 32]) {
        for (const delta of [-17, -1, 0, 15, 16, 31]) {
            const x = x0 + delta, z = z0 - delta;
            assert.deepEqual(forward.farSurface(x, z, spacing), reverse.farSurface(x, z, spacing),
                `Daleki teren zależy od kolejności: (${x},${z}), krok ${spacing}`);
        }
    }
}

console.log(`OK: ${points.length} próbek, powrót po nowych źródłach, 4 chunki i 90 próbek LOD; kolejność bez wpływu.`);
