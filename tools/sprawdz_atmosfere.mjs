// Niezależne kryteria E08: całka porównana z kwadraturą, nie z kopią
// wzoru GLSL. Koszt renderowania i piksele sprawdza osobny test WebGL.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { sampleAerialProfile, meanAirDensity, sampleAerialHaze } from '../src/sky/AerialPerspective.js';
import { SEA_LEVEL, GLOBE_RADIUS } from '../src/config.js';
import { Settings, SETTINGS_CHOICES } from '../src/settings/Settings.js';

const ground = SEA_LEVEL + 40;
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (actual, expected, epsilon, label) => check(
    Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    `${label}: ${actual} != ${expected} (±${epsilon})`);
const quadrature = (a, b, height) => {
    // Midpoint rule on 8192 independent spatial samples, with density
    // bounded below the reference height instead of extrapolated upward.
    let sum = 0;
    const count = 8192;
    for (let i = 0; i < count; i++) {
        const y = a + (b - a) * ((i + .5) / count);
        sum += Math.exp(-Math.max(y - ground, 0) / height);
    }
    return sum / count;
};

for (const height of [40, 180, 250, 600]) {
    for (const a of [ground - 800, ground - 1, ground, ground + 1, ground + 250, ground + 1600]) {
        for (const b of [ground - 800, ground, ground + 1e-8, ground + 130, ground + 800]) {
            const value = meanAirDensity(a, b, height);
            near(value, quadrature(a, b, height), 2e-6, `Całka ${a}→${b}, H=${height}`);
            near(value, meanAirDensity(b, a, height), 1e-10, 'Odwrócenie tego samego odcinka');
            check(value >= 0 && value <= 1, 'Gęstość nie może wytworzyć ujemnej lub nadmiernej energii');
        }
    }
    for (const y of [ground - 100, ground, ground + 20, ground + 1000]) {
        near(meanAirDensity(y, y, height), Math.exp(-Math.max(y - ground, 0) / height),
            1e-12, 'Pozioma droga nie dzieli przez zero');
        near(meanAirDensity(y, y + 1e-7, height), meanAirDensity(y, y, height),
            1e-8, 'Prawie pozioma droga jest ciągła');
    }
    near(meanAirDensity(ground - .01, ground + .01, height),
        quadrature(ground - .01, ground + .01, height), 2e-6,
        'Krótki odcinek przecinający początek warstwy');
}

for (const value of [NaN, Infinity, -Infinity]) {
    const badProfile = sampleAerialProfile(value, { cloudCover: value });
    check(Object.values(badProfile).every(v => Number.isFinite(v) && v > 0),
        'Uszkodzony stan doby nie wytwarza NaN w uniformach');
    const mean = meanAirDensity(value, value, value);
    check(Number.isFinite(mean) && mean >= 0 && mean <= 1, 'Uszkodzona wysokość ma skończony fallback');
    const haze = sampleAerialHaze([value, value, value], {
        cameraY: value, cameraSky: value, surfaceSky: value, density: value,
        scaleHeight: value, hazeDistance: value, hazeMax: value, farOuter: value, globe: value
    });
    check(Number.isFinite(haze) && haze >= 0 && haze <= 1, 'Uszkodzona próbka nie zanieczyszcza całego obrazu');
}

const profile = sampleAerialProfile(.6, { cloudCover: 0 });
for (const cloudCover of [0, .5, 1]) {
    let previous = sampleAerialProfile(-1, { cloudCover });
    for (let i = 1; i <= 3600; i++) {
        const height = Math.sin((-90 + i * .05) * Math.PI / 180);
        const current = sampleAerialProfile(height, { cloudCover });
        for (const key of ['density', 'scaleHeight']) {
            check(Number.isFinite(current[key]) && current[key] > 0, `Skończony dodatni profil ${key}`);
            check(Math.abs(current[key] - previous[key]) < (key === 'density' ? .01 : 2),
                `Skok profilu ${key} w ciągu doby`);
        }
        previous = current;
    }
}
for (const sunHeight of [-1, -.1, 0, .1, 1]) {
    let previous = sampleAerialProfile(sunHeight, { cloudCover: 0 });
    for (let i = 1; i <= 1000; i++) {
        const current = sampleAerialProfile(sunHeight, { cloudCover: i / 1000 });
        check(Math.abs(current.density - previous.density) < .01, 'Ciągłe zachmurzenie, gęstość');
        check(Math.abs(current.scaleHeight - previous.scaleHeight) < 2, 'Ciągłe zachmurzenie, wysokość');
        previous = current;
    }
}

const options = { cameraY: ground, cameraSky: 1, surfaceSky: 1, ...profile, farOuter: 4096 };
for (const d of [0, .1, 1, 8, 16]) {
    near(sampleAerialHaze([0, 0, -d], options), 0, 1e-12, 'Bliskie tekstury bez zasłony atmosferycznej');
}
let previousHaze = 0;
for (let d = 0; d <= 4096; d += 4) {
    const haze = sampleAerialHaze([0, 0, -d], options);
    check(Number.isFinite(haze) && haze >= 0 && haze <= 1, 'Ograniczona waga mieszania');
    check(haze >= previousHaze - 1e-12, 'Atmosfera narasta z odległością');
    previousHaze = haze;
}
const outdoor = sampleAerialHaze([0, 0, -800], options);
check(outdoor > .15 && outdoor < .8, '800 bloków ma atmosferę, lecz daleki teren zachowuje kontrast');
check(sampleAerialHaze([0, 0, -800], { ...options, cameraY: ground + 1000 }) < outdoor / 2,
    'Wysoka droga biegnie przez rzadsze powietrze');
near(sampleAerialHaze({ x: 0, y: 0, z: -800 }, options), outdoor, 1e-12, 'Wektor i tablica opisują tę samą drogę');
near(sampleAerialHaze([0, 0, -800], { ...options, cameraSky: 0, surfaceSky: 0 }), 0, 1e-12,
    'Zamknięta komora bez nieba nie otrzymuje zewnętrznej mgły');
near(sampleAerialHaze([0, 0, -800], { ...options, cameraSky: 0 }), outdoor, 1e-12,
    'Kamera w pomieszczeniu nie przyciemnia odsłoniętego krajobrazu za oknem');
near(sampleAerialHaze([0, 0, -800], { ...options, surfaceSky: 0 }), outdoor, 1e-12,
    'Odsłonięta kamera zachowuje powietrze przed zacienioną powierzchnią');
near(sampleAerialHaze([0, 0, -800], { ...options, hazeMax: 0 }), 0, 1e-12, 'Zerowy pułap wyłącza mgłę przed krawędzią');
near(sampleAerialHaze([0, 0, -800], { ...options, farEnabled: false, density: 0 }), 0, 1e-12,
    'Bez powietrza i bez maskowania krawędzi nie ma rozproszenia');
for (const d of [16, 48, options.farOuter * .8, options.farOuter]) {
    near(sampleAerialHaze([0, 0, -d - 1e-5], options),
        sampleAerialHaze([0, 0, -d + 1e-5], options), 1e-6, 'Brak skoku na granicy profilu');
}
const original = JSON.stringify(options);
sampleAerialHaze([0, 50, -800], options);
check(JSON.stringify(options) === original, 'Referencja nie modyfikuje wejść ani nie kumuluje mgły');

// Weryfikacja rzeczywistego zapisu opcji i zgodności starego formatu:
// nowy klucz dostaje domyślną wartość bez kasowania innych preferencji.
let saved = JSON.stringify({ revision: 2, brightness: 25, cloudCover: 35, lightingLook: 'natural' });
globalThis.localStorage = { getItem: () => saved, setItem(_key, value) { saved = value; } };
const settings = new Settings();
check(settings.get('atmosphereLook') === 'natural', 'Nowy profil jest domyślny dla starego zapisu');
check(settings.get('brightness') === 25 && settings.get('cloudCover') === 35, 'Migracja nie resetuje preferencji');
check(SETTINGS_CHOICES.atmosphereLook.includes('baseline'), 'Poprzedni wygląd pozostaje dostępny');
settings.set('atmosphereLook', 'baseline');
check(new Settings().get('atmosphereLook') === 'baseline', 'Porównanie bazowe przetrwa zapis/wczytanie');
settings.set('atmosphereLook', 'natural');
check(new Settings().get('atmosphereLook') === 'natural', 'Nowa atmosfera przetrwa zapis/wczytanie');
settings.set('atmosphereLook', 'unsupported');
check(SETTINGS_CHOICES.atmosphereLook.includes(settings.get('atmosphereLook')), 'Uszkodzona opcja nie trafia do renderera');

// Prawdziwy wspólny właściciel uniformów gry/menu. Tylko atlas, który
// wymaga obrazów DOM, jest pominięty; stan i Three pozostają produkcyjne.
registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'three') return next(new URL('../lib/three/three.module.js', import.meta.url).href, context);
    if (specifier.endsWith('/TextureAtlas.js')) return {
        url: 'data:text/javascript,export const atlasAverageTexture = null;', shortCircuit: true
    };
    return next(specifier, context);
} });
const { updateAerialPerspective } = await import('../src/rendering/AtmosphereState.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const skyState = { lightingLook: 'natural', space: 0, cloudCover: .4,
    celestial: { sunHeight: .2 }, source: { direct: [.5, .4, .3], sky: [.1, .2, .3] } };
const oldSkyState = JSON.stringify(skyState);
const untouched = ['uBrightness', 'uFarEnabled', 'uFarInner', 'uFarOuter', 'uHazeDistance',
    'uHazeMax', 'uUnderwater', 'uUnderwaterDensity', 'uTime', 'uCurvature', 'uGlobe'];
const oldUniforms = untouched.map(key => viewUniforms[key].value);
settings.set('atmosphereLook', 'natural');
updateAerialPerspective(settings, skyState, .25);
near(viewUniforms.uAerialPerspective.value, 1, 0, 'Pełny profil przy powierzchni');
near(viewUniforms.uAerialCameraSky.value, .25, 0, 'Liniowy dostęp kamery nie jest ponownie kodowany');
const expectedProfile = sampleAerialProfile(.2, { cloudCover: .4 });
near(viewUniforms.uAerialDensity.value, expectedProfile.density, 0, 'Profil bieżącego słońca/chmur');
near(viewUniforms.uAerialHeight.value, expectedProfile.scaleHeight, 0, 'Wspólny profil wysokości');
check(JSON.stringify(skyState) === oldSkyState, 'Atmosfera nie zmienia źródeł, palety ani stanu nieba');
check(untouched.every((key, i) => viewUniforms[key].value === oldUniforms[i]),
    'Aktualizacja atmosfery nie zmienia zasięgu, wodnej mgły, wiatru ani jasności');
for (const [raw, expected] of [[-1, 0], [2, 1], [NaN, 0], [Infinity, 0]]) {
    updateAerialPerspective(settings, skyState, raw);
    near(viewUniforms.uAerialCameraSky.value, expected, 0, 'Ograniczony bezpieczny dostęp kamery');
}
settings.set('atmosphereLook', 'baseline'); updateAerialPerspective(settings, skyState, 1);
near(viewUniforms.uAerialPerspective.value, 0, 0, 'Bazowy profil zachowuje stary tor');
settings.set('atmosphereLook', 'natural'); skyState.lightingLook = 'baseline';
updateAerialPerspective(settings, skyState, 1);
near(viewUniforms.uAerialPerspective.value, 0, 0, 'Dawna paleta nie otrzymuje nowego efektu');
skyState.lightingLook = 'natural';
let previousBlend = 1;
for (let i = 0; i <= 1000; i++) {
    skyState.space = i / 1000;
    updateAerialPerspective(settings, skyState, 1);
    const value = viewUniforms.uAerialPerspective.value;
    check(value >= 0 && value <= previousBlend && previousBlend - value < .01,
        'Wyjście w kosmos stopniowo przywraca model atmosfery planety');
    previousBlend = value;
}
near(previousBlend, 0, 0, 'W kosmosie pozostaje profil planety');
skyState.space = 0;
for (const [fraction, expected] of [[0, 1], [.075, .5], [.15, 0], [1, 0]]) {
    const curvature = fraction / GLOBE_RADIUS;
    viewUniforms.uCurvature.value = curvature;
    updateAerialPerspective(settings, skyState, 1);
    near(viewUniforms.uAerialPerspective.value, expected, 1e-12,
        'Krzywizna wygasza lokalny profil przed wejściem w kosmos');
    near(viewUniforms.uCurvature.value, curvature, 0, 'Profil nie zmienia krzywizny planety');
}
viewUniforms.uCurvature.value = 0;
updateAerialPerspective(settings, skyState, 1);
near(viewUniforms.uAerialPerspective.value, 1, 0, 'Powrót do płaskiego terenu przywraca atmosferę');

console.log(`OK: atmosfera — ${checks} sprawdzeń całki, ciągłości, dystansu, wysokości, wnętrz i ustawień.`);
