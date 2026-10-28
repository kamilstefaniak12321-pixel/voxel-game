// Pole widocznej tarczy i kierunek jej światła, bez renderera i kamery.
import assert from 'node:assert/strict';
import { sampleSolarDisc } from '../src/sky/SolarDisc.js';
import { sampleSolarAtmosphere } from '../src/sky/SolarAtmosphere.js';
import { SUN_DIAMETER } from '../src/config.js';

const radians = degrees => degrees * Math.PI / 180;
const at = degrees => sampleSolarDisc(Math.sin(radians(degrees)));
const near = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const radius = SUN_DIAMETER / 2;

near(at(0).visibility, 0.5);
near(at(radius).visibility, 1);
near(at(-radius).visibility, 0);
near(at(10).lightHeight, Math.sin(radians(10)));
assert.ok(at(-radius / 2).visibility > 0);
assert.ok(at(-radius / 2).lightHeight > 0);

// Niezależne odniesienie: próbki pola koła na tej samej płaszczyźnie
// co sprite Słońca. Nie używa wzoru na wycinek ani jego środek ciężkości.
function numericalDisc(degrees) {
    const resolution = 500;
    const angle = radians(degrees);
    const scale = Math.tan(radians(radius));
    let all = 0, visible = 0, vertical = 0;
    for (let yi = 0; yi < resolution; yi++) {
        const y = 2 * (yi + 0.5) / resolution - 1;
        for (let xi = 0; xi < resolution; xi++) {
            const x = 2 * (xi + 0.5) / resolution - 1;
            if (x * x + y * y > 1) continue;
            all++;
            if (Math.sin(angle) + Math.cos(angle) * y * scale <= 0) continue;
            visible++;
            vertical += y;
        }
    }
    return {
        visibility: visible / all,
        lightHeight: Math.sin(angle + Math.atan(vertical / visible * scale))
    };
}

for (const degrees of [-3, -2, -1, 0, 1, 2, 3]) {
    const actual = at(degrees), reference = numericalDisc(degrees);
    near(actual.visibility, reference.visibility, 0.002);
    near(actual.lightHeight, reference.lightHeight, 0.0001);
    near(actual.visibility + at(-degrees).visibility, 1);
}

let previous = 0;
for (let i = 0; i <= 2000; i++) {
    const degrees = -radius - 1 + (2 * radius + 2) * i / 2000;
    const height = Math.sin(radians(degrees));
    const disc = sampleSolarDisc(height);
    const atmosphere = sampleSolarAtmosphere(height);
    assert.ok(Number.isFinite(disc.visibility) && Number.isFinite(disc.lightHeight));
    assert.ok(disc.visibility >= previous && disc.visibility <= 1);
    previous = disc.visibility;
    if (degrees > -radius) {
        assert.ok(disc.lightHeight > 0, 'Widoczny wycinek świeci znad horyzontu');
        assert.ok(atmosphere.direct.every(c => c > 0), 'Widoczna tarcza ma dodatnią energię');
    } else {
        assert.deepEqual(atmosphere.direct, [0, 0, 0]);
    }
    near(atmosphere.discVisibility, disc.visibility);
    near(atmosphere.lightHeight, disc.lightHeight);
}

// Brak skoku energii przy pierwszym/ostatnim fragmencie tarczy oraz
// przy przejściu środka przez horyzont; zaćmienie nadal wygasza źródło.
for (const degrees of [-radius, 0, radius]) {
    const before = sampleSolarAtmosphere(Math.sin(radians(degrees - 1e-6)));
    const after = sampleSolarAtmosphere(Math.sin(radians(degrees + 1e-6)));
    before.direct.forEach((value, i) => near(value, after.direct[i], 1e-5));
}
assert.deepEqual(sampleSolarAtmosphere(0, 1).direct, [0, 0, 0]);
for (const bad of [NaN, Infinity, -Infinity]) {
    assert.deepEqual(sampleSolarDisc(bad), { visibility: 0, lightHeight: 0 });
}

console.log('OK: pole tarczy względem próbek geometrycznych, widoczny wycinek, kierunek nad horyzontem, ciągły wschód/zachód i zaćmienie.');
