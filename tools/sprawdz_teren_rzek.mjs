// Rzeczywisty generator: usunięcie dawnych suchych szczelin bez
// spłaszczania pozostałych form terenu. Bez atrapy hydrologii i zapisu.
// Uruchomienie: node tools/sprawdz_teren_rzek.mjs (Node 22.15+).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
    load(url, context, next) {
        return next(url, url.endsWith('.js') && url.includes('/src/')
            ? { ...context, format: 'module' } : context);
    }
});

const { RealisticGenerator, DETAIL_FULL, DETAIL_MEDIUM, DETAIL_MACRO } =
    await import('../src/world/terrain/RealisticGenerator.js');
const { LANDFORMS } = await import('../src/world/terrain/landforms.js');

const generator = new RealisticGenerator('lighting-rtx3050-0231');

// 0.25.0: (0,0) miało wysokość 69, ravine=5.529793571943829.
// Ta sucha szczelina przecinała łagodne zbocze 73..76, choć nie było
// tutaj żadnej rzeki ani jeziora. Sprawdzamy profil, nie sam brak pola.
const profile = [];
for (let x = -8; x <= 8; x++) {
    const sample = generator.compute(x, 0, DETAIL_FULL, {});
    profile.push(sample.height);
    assert.equal(sample.water, 0, `Suchy teren w (${x},0)`);
    assert.equal(sample.river, 0, `Brak sztucznej rzeki w (${x},0)`);
    assert.equal(sample.lake, false);
}
assert.equal(profile[8], 74, 'Zasypana szczelina przy (0,0)');
assert.equal(profile[0], 73, 'Zachowany zachodni brzeg zbocza');
assert.equal(profile.at(-1), 76, 'Zachowany wschodni brzeg zbocza');
for (let i = 1; i < profile.length; i++) {
    assert.ok(Math.abs(profile[i] - profile[i - 1]) <= 1, 'Brak ostrego suchego rozcięcia');
}
assert.equal(generator.compute(0, 0, DETAIL_MEDIUM, {}).height, 74,
    'Daleki teren również nie ma starego koryta');
assert.ok(Math.abs(generator.compute(0, 0, DETAIL_MACRO, {}).macro - 74.67411239389287) < 1e-10,
    'Usunięcie szczeliny nie zmienia makrorzeźby, po której płyną rzeki');
assert.equal(LANDFORMS.ravine, undefined, 'Mapa nie oferuje usuniętej formy');

// Realne punkty tego samego seeda, które przed poprawką nie miały
// szczeliny. Pozostają góry, grzbiet, dolina i żleb górski; numery
// ziaren ich pól nie mogą przesunąć się po usunięciu starego szumu.
const fixtures = [
    { form: 'gully', x: -2048, z: 376, height: 89, macro: 93.54523810660908 },
    { form: 'ridge', x: -2048, z: 344, height: 103, macro: 110.75889731252852 },
    { form: 'valley', x: -2048, z: -1440, height: 67, macro: 70.03288573526527 },
    { form: 'mountains', x: -2048, z: 312, height: 81, macro: 84.78717972031463 }
];
for (const fixture of fixtures) {
    const sample = generator.compute(fixture.x, fixture.z, DETAIL_FULL, {});
    assert.equal(sample.height, fixture.height, `Zachowana wysokość: ${fixture.form}`);
    assert.ok(Math.abs(sample.macro - fixture.macro) < 1e-10, `Zachowana makrorzeźba: ${fixture.form}`);
    assert.equal(generator.classify(sample, 1), fixture.form, `Zachowana forma: ${fixture.form}`);
    if (fixture.form === 'gully') {
        assert.ok(sample.gully > 2, 'Żleb wciąż wcina się w zbocze góry');
    }
}

// Dokładny świat ze zgłoszenia: seed jest liczbą (tekst o tych samych
// cyfrach oznacza inny świat), gracz był w (188,132,-252). W 0.25.0
// odpływ jeziora zmieniał się tutaj w łańcuch basenów 32 x 16 bloków.
const reported = new RealisticGenerator(2138286349);
let channelColumns = 0;
for (let z = -224; z < -160; z++) {
    for (let x = 208; x < 320; x++) {
        const sample = reported.compute(x, z, DETAIL_FULL, {});
        assert.equal(sample.lake, false, 'Odpływ nie zawiera prostokątnych fragmentów jeziora');
        if (sample.water > sample.height) {
            channelColumns++;
            assert.equal(sample.river, 1, 'Woda pozostaje w korycie rzeki');
        }
    }
}
assert.ok(channelColumns > 300 && channelColumns < 1000,
    `Wąskie, zachowane koryto zamiast rozlanych basenów (${channelColumns} kolumn)`);

// Nie wystarczy usunąć basenów: odpływ musi łączyć się z właściwym
// jeziorem. Szukamy ciągłej drogi w RZECZYWISTYCH blokach wody, bez
// skoków przez suchy teren, pod górę lub po ścianie wysokiej wody.
const x0 = 176, z0 = -272, width = 521, height = 401;
const levels = new Uint8Array(width * height);
for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
        const sample = reported.compute(x0 + x, z0 + z, DETAIL_FULL, {});
        if (sample.water > sample.height) levels[z * width + x] = sample.water;
    }
}
const index = (x, z) => (z - z0) * width + x - x0;
const start = index(648, 88), end = index(210, -224);
assert.equal(levels[start], 54, 'Właściwe jezioro nadal ma swoją taflę');
assert.equal(levels[end], 50, 'Rzeka odpływa na niższy poziom');
const seen = new Uint8Array(levels.length);
const queue = [start];
seen[start] = 1;
for (let head = 0; head < queue.length && !seen[end]; head++) {
    const position = queue[head];
    const x = position % width, z = Math.floor(position / width);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= height) continue;
        const next = position + dx + dz * width;
        if (!seen[next] && levels[next] > 0 && levels[next] <= levels[position] &&
            levels[position] - levels[next] <= 1) {
            seen[next] = 1;
            queue.push(next);
        }
    }
}
assert.equal(seen[end], 1, 'Ciągły odpływ jeziora bez suchych przerw i ścian wody');

// Pierwsza wizyta i odczyt z pamięci muszą mieć tę samą precyzję.
// Inaczej próg zalewania bywał minimalnie inny zależnie od kolejności.
const fresh = new RealisticGenerator(2138286349);
for (const [i, j] of [[40, 5], [-120, -120], [0, 0]]) {
    const first = fresh.rivers.height(i, j);
    assert.equal(fresh.rivers.height(i, j), first, 'Stała precyzja makrorzeźby');
}

console.log('OK: suche szczeliny i prostokątne baseny znikają; pozostałe formy terenu oraz ciągły odpływ jeziora są zachowane.');

// 0.47.1: płaskie brzegi. Na płaskim terenie brzeg przy wodzie rzeki jest
// zwykle na poziomie wody (bez okopów i wałów), a woda nigdzie nie stoi
// ścianą (kolumna obok wody rzeki: woda albo ziemia co najmniej do jej
// poziomu).
{
    const banks = new RealisticGenerator('mapa');
    const at = new Map();
    const column = (x, z) => {
        const key = x + ',' + z;
        if (!at.has(key)) {
            const sample = banks.compute(x, z, DETAIL_FULL, {});
            at.set(key, { h: sample.height, w: sample.water, r: sample.river, m: sample.mountains ?? 0, lake: sample.lake });
        }
        return at.get(key);
    };
    let flat = 0, flush = 0, walls = 0, edges = 0;
    for (let x = -260; x <= 260; x++) {
        for (let z = -260; z <= 260; z++) {
            const c = column(x, z);
            if (c.r !== 1 || !(c.w > c.h) || c.lake) continue;
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const b = column(x + dx, z + dz);
                if (b.w > b.h) continue;
                edges++;
                if (b.h < c.w) walls++;
                if (b.m < 0.2) {
                    flat++;
                    if (b.h === c.w) flush++;
                }
            }
        }
    }
    assert.ok(edges > 1000, `Próbka brzegów rzek (${edges})`);
    assert.equal(walls, 0, 'Woda rzeki nigdzie nie stoi ścianą');
    assert.ok(flush / flat > 0.75, `Na płaskim brzeg zwykle na poziomie wody (${flush}/${flat})`);
    console.log(`OK: płaskie brzegi - ${flush}/${flat} na poziomie wody, ${edges} brzegów bez ściany wody.`);
}
