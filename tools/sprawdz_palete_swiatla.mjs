// Testy zależności źródeł i ciągłości krzywych, bez WebGL/meshera.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { LIGHTING_PRESETS, sampleLightingPalette } from '../src/sky/LightingPalette.js';
import { sampleSolarDisc } from '../src/sky/SolarDisc.js';
import { sampleSolarAtmosphere } from '../src/sky/SolarAtmosphere.js';
import { SUN_DIAMETER, MOON_DIAMETER } from '../src/config.js';

const height = degrees => Math.sin(degrees * Math.PI / 180);
const at = (degrees, options = {}) => sampleLightingPalette(height(degrees), options);
const near = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon,
    `${actual} != ${expected} (tolerancja ${epsilon})`);
const luminance = rgb => rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
const energy = sample => ['direct', 'sky', 'ground', 'moon'].flatMap(key => sample[key]);
const fullMoon = { moonHeight: 0.8, moonIllumination: 1 };
const rgbFromHex = hex => [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});

// Zatwierdzone kolory są danymi źródeł, nie zamianą koloru cienia.
const expected = {
    noon: ['#FFF4E0', '#B9D2F0', '#86745E'],
    golden: ['#FFE2A6', '#8EAFCE', '#9B7B54'],
    sunset: ['#FFB66E', '#7D92B5', '#846451'],
    overcast: ['#EEF1F2', '#CBD5DB', '#857F6E'],
    blueHour: [null, '#697FAD', '#565966'],
    moonlit: [null, '#38465D', '#34383A']
};
for (const [key, values] of Object.entries(expected)) {
    const preset = LIGHTING_PRESETS[key];
    assert.deepEqual([preset.sun, preset.sky, preset.ground], values);
    const sample = at(preset.altitude ?? 35, { cloudCover: key === 'overcast' ? 1 : 0 });
    for (const [field, hex] of [['sunColor', values[0]], ['skyColor', values[1]], ['groundColor', values[2]]]) {
        if (hex) sample[field].forEach((channel, index) => near(channel, rgbFromHex(hex)[index]));
    }
}
assert.equal(LIGHTING_PRESETS.moonlit.moon, '#C1CEDF');
at(-30, fullMoon).moonColor.forEach((channel, i) => near(channel, rgbFromHex('#C1CEDF')[i]));

// Pół tarczy na horyzoncie i to samo wygaszenie co widoczna tarcza.
near(at(0).discVisibility, 0.5);
for (const degrees of [-90, -30, -12, -SUN_DIAMETER / 2, -1, 0, 1, 30, 90]) {
    const sample = at(degrees), disc = sampleSolarDisc(height(degrees));
    near(sample.discVisibility, disc.visibility);
    near(sample.lightHeight, disc.lightHeight);
    if (degrees <= -SUN_DIAMETER / 2) assert.deepEqual(sample.direct, [0, 0, 0]);
    if (degrees > -SUN_DIAMETER / 2) assert.ok(sample.direct.every(v => v > 0));
}
assert.deepEqual(at(35, { eclipse: 1 }).direct, [0, 0, 0]);
assert.ok(luminance(at(-6).sky) > 0, 'Zmierzch nie znika razem ze słońcem');

// Księżyc nie jest ogólnym podbiciem nocnego obrazu. Faza, położenie
// i chmury zmieniają jego osobny składnik; słońce nadal pozostaje zerem.
const moon = at(-30, fullMoon), noMoon = at(-30);
assert.deepEqual(noMoon.moon, [0, 0, 0]);
assert.deepEqual(at(-30, { ...fullMoon, moonHeight: height(-MOON_DIAMETER / 2 - 1) }).moon, [0, 0, 0]);
assert.deepEqual(at(35, fullMoon).moon, [0, 0, 0]);
near(luminance(at(-30, { ...fullMoon, moonIllumination: 0.5 }).moon), luminance(moon.moon) * 0.5);
assert.ok(luminance(moon.sky) > luminance(noMoon.sky));
assert.ok(luminance(moon.moon) < luminance(at(35).direct) * 0.1);
for (const sample of [moon, noMoon]) {
    assert.equal(sample.nightDesaturation, 0);
    assert.deepEqual(sample.direct, [0, 0, 0]);
}

// Chmury zmniejszają kontrast źródła, szarość nie rozjaśnia nocy.
const clear = at(35), cloudy = at(35, { cloudCover: 1 });
const coolBias = rgb => (rgb[2] - rgb[0]) / luminance(rgb);
assert.ok(coolBias(clear.sky) > coolBias(cloudy.sky));
assert.ok(luminance(cloudy.direct) < luminance(clear.direct) * 0.1);
assert.ok(luminance(cloudy.sky) > luminance(clear.sky));
assert.ok(luminance(at(-30, { cloudCover: 1 }).sky) < luminance(noMoon.sky));
assert.ok(luminance(at(-30, { ...fullMoon, cloudCover: 1 }).moon) < luminance(moon.moon) * 0.1);

// Przejście całej doby, granic presetów oraz pogody: skończone,
// nieujemne źródła i brak skoku nawet tuż przy początku/końcu tarczy.
for (const clouds of [0, 0.5, 1]) {
    let previous = at(-90, { ...fullMoon, cloudCover: clouds });
    for (let i = 1; i <= 3600; i++) {
        const sample = at(-90 + i * 0.05, { ...fullMoon, cloudCover: clouds });
        const values = energy(sample), oldValues = energy(previous);
        values.forEach((value, index) => {
            assert.ok(Number.isFinite(value) && value >= 0);
            assert.ok(Math.abs(value - oldValues[index]) < 0.025, `Skok źródła przy ${sample.altitude}°`);
        });
        previous = sample;
    }
}
for (const degrees of [-30, -18, -12, -6, -SUN_DIAMETER / 2, 0, SUN_DIAMETER / 2, 10, 35]) {
    const before = energy(at(degrees - 1e-6, fullMoon));
    energy(at(degrees + 1e-6, fullMoon)).forEach((value, i) => near(value, before[i], 2e-6));
    let previous = at(degrees, { ...fullMoon, cloudCover: 0 });
    for (let i = 1; i <= 100; i++) {
        const next = at(degrees, { ...fullMoon, cloudCover: i / 100 });
        energy(next).forEach((value, j) => assert.ok(Math.abs(value - energy(previous)[j]) < 0.05));
        previous = next;
    }
}
for (const input of [NaN, Infinity, -Infinity, -4, 4]) {
    const sample = sampleLightingPalette(input, { cloudCover: input, eclipse: input, moonHeight: input, moonIllumination: input });
    assert.ok(energy(sample).every(value => Number.isFinite(value) && value >= 0));
}
assert.deepEqual(at(10, { cloudCover: 0.37 }), at(10, { cloudCover: 0.37 }), 'Profil musi być deterministyczny');

// Integracja Sky: atrapy wyłącznie warstw graficznych. Testujemy realny
// SkyState, Celestial i dobór źródeł bez ładowania tekstur w przeglądarce.
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.includes('/src/sky/layers/')) {
            const name = url.split('/').at(-1).replace('.js', '');
            return { format: 'module', shortCircuit: true, source: `
                import { Object3D } from 'three';
                export class ${name} { constructor(){ this.object = new Object3D(); } update(){} dispose(){} }
            ` };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/'))
            ? { ...context, format: 'module' } : context);
    }
});
const { Sky } = await import('../src/sky/Sky.js');
const { Scene } = await import('../lib/three/three.module.js');
const sky = new Sky(new Scene());
assert.equal(sky.lightingLook, 'baseline');
sky.solarAtmosphere = true;
sky.update(1.3, 0);
const original = sampleSolarAtmosphere(sky.celestial.sunHeight, sky.state.eclipse);
sky.atmosphere.direct.forEach((value, i) => near(value, original.direct[i]));
const baselineColors = sky.lightSets[0].sun.color.toArray();
const baselinePower = sky.lightSets[0].sun.intensity;

sky.lightingLook = 'natural';
sky.cloudCover = 0.6;
sky.update(1.3, 0);
assert.equal(sky.state.nightDesaturation, 0);
assert.equal(sky.lightSets[0].ambient.intensity, 0);
assert.equal(sky.lightSets[0].diffuse.intensity, 1);
const naturalPower = sky.lightSets[0].sun.intensity;
sky.applyShadowContrast(1);
assert.equal(sky.lightSets[0].sun.intensity, naturalPower, 'Cienie nie dodają drugiego mnożnika źródła');

sky.lightingLook = 'baseline';
sky.update(1.3, 0);
assert.deepEqual(sky.lightSets[0].sun.color.toArray(), baselineColors);
assert.equal(sky.lightSets[0].sun.intensity, baselinePower, 'Powrót A/B odtwarza bazowe źródła');
sky.dispose();
console.log('OK: palety sRGB → linear, ciągła doba/chmury, osobny księżyc, horyzont i powrót do bazy.');
