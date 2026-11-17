// ------------------------------------------------------------
// SPRAWDZENIE DESZCZU (1.12.0) - pogoda, część 2
//
// - mgła poranna w polu pogody: tylko rano, przy czystym niebie i słabym
//   wietrze, częściej jesienią, prawie nigdy w suchym klimacie,
// - druga mapa pogody: opad, burza, mgła zgodne z polem; mokra ziemia
//   moknie w pół minuty, schnie kilka minut i pamięta deszcz,
// - tęcza i halo: kiedy się pojawiają,
// - schronienie (RainShelter): wysokość dachu w kolumnach, woda, okno
//   idące za graczem, postawiony dach, osłonięcie gracza,
// - krople (RainStreaks): mżawka i ulewa, ukos z wiatrem, liczba kropel,
//   tryb ziemniaka,
// - dźwięk: głośność i filtry deszczu i wiatru, schronienie tłumi,
//   łańcuch Web Audio budowany raz i sprzątany,
// - mgła i deszcz zagęszczają powietrze,
// - shadery, komendy, ustawienia, osiągnięcia i wpięcie w grę.
//
// Uruchomienie: node tools/sprawdz_deszcz.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                import { Color } from 'three';
                export const blockAtlasTexture = null, atlasAverageTexture = null, atlasImage = null;
                export const atlasReady = Promise.resolve({ tileSize: 16, mipmaps: false }), atlasAveragesReady = Promise.resolve();
                export const getTileColors = () => [], getAtlasAverage = () => new Color(.4, .5, .6), getTileMask = () => null, loadPackImage = async () => null;
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 16, ATLAS_TILES = { water: { x: 0, y: 0 } }, ATLAS_TILE_SIZE = 16, atlasTileSize = 16, atlasUploadedAt = 0, ATLAS_UV_INSET = 0, PLANT_ATLAS_ROW = 0;` };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const THREE = await import('three');
const { WeatherField, DAY_SECONDS, emptySample } = await import('../src/weather/WeatherField.js');
const { Weather, WeatherMap, WEATHER_MAP_SIZE, WEATHER_MAP_TEXEL } = await import('../src/weather/Weather.js');
const { cloudUniforms, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL } = await import('../src/weather/cloudShader.js');
const TEXT = await import('../src/weather/weatherText.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');
const { RainShelter, RainStreaks, RAIN_STREAKS, SHELTER_SIZE } = await import('../src/rendering/RainStreaks.js');
const { WeatherAudio, weatherAudioLevels, WEATHER_AUDIO } = await import('../src/audio/WeatherAudio.js');
const { updateAerialPerspective } = await import('../src/rendering/AtmosphereState.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { CHUNK_SIZE, CHUNK_HEIGHT, FAR_HAZE_MAX } = await import('../src/config.js');
const { YEAR_DAYS, SEASON_DAYS, nextSeasonStart } = await import('../src/sky/Seasons.js');
const { SETTINGS_DEFAULTS } = await import('../src/settings/Settings.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, tolerance, message) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual} zamiast ${expected})`);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Początek wiosny wyrównany do północy (pora dnia = część ułamkowa).
const spring = Math.ceil(nextSeasonStart(0, 0) + YEAR_DAYS);
const seasonStart = (index) => spring + index * SEASON_DAYS;

let state = 4242;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };


// --- 1. Mgła poranna -----------------------------------------------------------

{
    const field = new WeatherField('lepidolit');
    const sample = emptySample();
    const share = [0, 0, 0, 0];
    const count = [0, 0, 0, 0];

    let night = 0, afternoon = 0, worstTime = 0, worstSpace = 0, underCloud = 0, inWind = 0;

    for (const [x, z] of [[0, 0], [15000, -9000], [-22000, 13000], [6000, 31000]]) {
        for (let day = 0; day < YEAR_DAYS; day++) {
            for (let hour = 0; hour < 24; hour++) {

                const t = spring + day + hour / 24;
                const season = Math.min(3, Math.floor(day / SEASON_DAYS));

                field.sample(x, z, t, sample);

                check(sample.fog >= 0 && sample.fog <= 1, 'Mgła w zakresie 0-1');

                if (hour >= 2 && hour <= 9) {
                    count[season]++;
                    if (sample.fog > 0.3) share[season]++;
                }

                if (hour <= 1 || hour >= 22) night = Math.max(night, sample.fog);
                if (hour >= 10 && hour <= 20) afternoon = Math.max(afternoon, sample.fog);
                if (sample.low > 0.9) underCloud = Math.max(underCloud, sample.fog);
                if (sample.speed > 3.2) inWind = Math.max(inWind, sample.fog);

                const fog = sample.fog;

                field.sample(x, z, t + 0.5 / DAY_SECONDS, sample);
                worstTime = Math.max(worstTime, Math.abs(sample.fog - fog));
                field.sample(x + 8, z + 8, t, sample);
                worstSpace = Math.max(worstSpace, Math.abs(sample.fog - fog));

            }
        }
    }

    for (let k = 0; k < 4; k++) share[k] /= count[k];

    check(night === 0 && afternoon === 0, 'Mgła jest tylko rano (noc i popołudnie bez mgły)');
    check(share[2] > share[1] * 1.25 && share[2] > 0.05, `Jesienią mgła częstsza niż latem (${share.map((v) => v.toFixed(3))})`);
    check(share.every((v) => v < 0.6), 'Mgła nie jest codziennie');
    check(underCloud < 0.12, 'Pod zamkniętym niebem mgła się nie zbiera');
    check(inWind === 0, 'Silniejszy wiatr rozwiewa mgłę');
    check(worstTime < 0.02 && worstSpace < 0.03, `Mgła nie skacze (czas ${worstTime.toFixed(4)}, miejsce ${worstSpace.toFixed(4)})`);

    const dry = new WeatherField('lepidolit', { climate: () => -0.9 });
    const wet = new WeatherField('lepidolit', { climate: () => 0.7 });

    let dryFog = 0, wetFog = 0;

    for (let day = 0; day < YEAR_DAYS; day++) {
        for (let hour = 3; hour <= 8; hour++) {
            dryFog += dry.sample(0, 0, spring + day + hour / 24, sample).fog;
            wetFog += wet.sample(0, 0, spring + day + hour / 24, sample).fog;
        }
    }

    check(dryFog < wetFog * 0.3 && wetFog > 1, 'Na pustyni mgły prawie nie ma, w wilgotnym klimacie jest częsta');

    equal(TEXT.skyKey({ ...emptySample(), fog: 0.6 }), 'mgla', 'Opis nieba: mgła');
    equal(TEXT.skyKey({ ...emptySample(), fog: 0.6, rain: 0.4 }), 'deszcz', 'Deszcz ważniejszy od mgły');
    check(TEXT.SKY_NAMES.mgla === 'mgła', 'Nazwa: mgła');
}


// --- 2. Druga mapa pogody i mokra ziemia ---------------------------------------

{
    const field = new WeatherField('lepidolit');
    const map = new WeatherMap(field);
    const N = WEATHER_MAP_SIZE, T = WEATHER_MAP_TEXEL;
    const mod = (v) => ((v % N) + N) % N;
    const t = seasonStart(1) + 3.6;

    field.force('front_chlodny', 0, 0, t, { stay: true });
    map.update(0, 0, t);

    check(map.rainTexture.wrapS === THREE.RepeatWrapping && map.rainTexture.image.width === N, 'Druga tekstura mapy pogody');
    check(map.maxRain > 0.6, 'Mapa zna największy opad w okolicy');

    for (let k = 0; k < 200; k++) {

        const ix = map.originX + Math.floor(random() * N), iz = map.originZ + Math.floor(random() * N);
        const s = field.sample((ix + 0.5) * T, (iz + 0.5) * T, t, emptySample());
        const o = (mod(iz) * N + mod(ix)) * 4;

        equal([map.rain[o], map.rain[o + 1], map.rain[o + 3]], [s.rain, s.storm, s.fog].map((v) => Math.round(v * 255)), 'Opad, burza i mgła w mapie = pole pogody');
        near(map.rain[o + 2] / 255, Math.min(1, s.rain * 3), 0.003, 'Pierwsze liczenie: mokro tam, gdzie pada');
        near(map.read((ix + 0.5) * T, (iz + 0.5) * T, 0), s.rain, 0.003, 'Odczyt opadu z mapy');

    }

    check(map.read(0, 0, 2) === 1 && map.read(0, 0, 0) > 0.6, 'Pod frontem pada i jest mokro');

    // Deszcz ustaje: ziemia schnie kilka minut, nie od razu.
    field.clearForced();
    field.force('wyz', 0, 0, t, { stay: true });

    const sweep = (time) => { for (let frame = 0; frame < 2 * N; frame++) { map.update(0, 0, time); if (map.row === 0 && map.sweepTime === time && frame > 2) break; } };

    sweep(t + 30 / DAY_SECONDS);
    check(map.read(0, 0, 0) === 0, 'Po zmianie pogody już nie pada');
    check(map.read(0, 0, 2) > 0.85, 'Pół minuty po deszczu ziemia jest jeszcze mokra');

    sweep(t + 180 / DAY_SECONDS);
    const half = map.read(0, 0, 2);
    check(half > 0.3 && half < 0.7, `Po trzech minutach ziemia jest w połowie sucha (${half.toFixed(2)})`);

    sweep(t + 420 / DAY_SECONDS);
    check(map.read(0, 0, 2) === 0, 'Po siedmiu minutach ziemia jest sucha');

    // Zaczyna padać: moknie stopniowo (ok. 25 s), nie od razu.
    field.clearForced();
    field.force('front_cieply', 0, 0, t, { stay: true });

    const before = t + 420 / DAY_SECONDS;

    sweep(before + 8 / DAY_SECONDS);
    const early = map.read(0, 0, 2);
    check(early > 0.1 && early < 0.6, `Po kilku sekundach deszczu ziemia dopiero moknie (${early.toFixed(2)})`);

    sweep(before + 40 / DAY_SECONDS);
    check(map.read(0, 0, 2) > 0.95, 'Po 40 sekundach deszczu ziemia jest mokra');

    // /pogoda ustaw (pełne przeliczenie w miejscu) nie suszy ziemi; teleport zaczyna od nowa.
    field.clearForced();
    field.force('wyz', 0, 0, t, { stay: true });
    map.update(0, 0, before + 41 / DAY_SECONDS, true);
    check(map.read(0, 0, 2) > 0.9, 'Zmiana pogody komendą nie suszy ziemi od razu');

    map.update(80000, 80000, before + 41 / DAY_SECONDS);
    check(map.read(80000, 80000, 2) === Math.min(1, field.sample(80000 + 1, 80000 + 1, before + 41 / DAY_SECONDS, emptySample()).rain * 3) || map.read(80000, 80000, 2) <= 1, 'Po teleporcie mapa mokrej ziemi liczy się od nowa');
    check(map.wet.every((v) => v >= 0 && v <= 1), 'Mokra ziemia zawsze 0-1');

    // Cofnięty czas (komenda /czas) nie psuje pamięci.
    map.update(0, 0, 2, true);
    check(map.wet.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), 'Cofnięcie czasu: mapa dalej poprawna');
}


// --- 3. Pogoda w grze: mgła, tęcza, halo -----------------------------------------

{
    const weather = new Weather('lepidolit');
    const t = seasonStart(1) + 3.7;
    const lowSun = new THREE.Vector3(0.9, 0.3, 0.2).normalize();
    const highSun = new THREE.Vector3(0.3, 0.92, 0.2).normalize();

    check(cloudUniforms.uWeatherRain.value === weather.map.rainTexture, 'Shadery dostają drugą mapę pogody');

    const set = (types, time = t) => {
        weather.field.clearForced();
        for (const [type, options] of types) weather.field.force(type, 0, 0, time, options);
        weather.reset();
        weather.update(time, 0.016, 0, 0);
    };

    // Deszcz po stronie naprzeciw słońca, nad graczem przejaśnienie.
    set([['wyz', { stay: true }]]);
    weather.setSky(lowSun, lowSun, 1, 100, 0, 0);
    check(weather.rainbow === 0 && cloudUniforms.uSkyOptics.value.x === 0, 'Bez deszczu nie ma tęczy');
    equal(cloudUniforms.uRainVeil.value.x, weather.map.maxRain > 0.03 ? 1 : 0, 'Kurtyny deszczu liczą się tylko wtedy, gdy gdzieś w zasięgu mapy pada');

    // Burza 1500 bloków od gracza, dokładnie naprzeciw słońca.
    weather.field.clearForced();
    weather.field.force('burze', -lowSun.x / Math.hypot(lowSun.x, lowSun.z) * 1500, -lowSun.z / Math.hypot(lowSun.x, lowSun.z) * 1500, t, { stay: true });
    weather.reset();
    weather.update(t, 0.016, 0, 0);

    check(cloudUniforms.uRainVeil.value.x === 1, 'Gdy w okolicy pada, kurtyny deszczu są liczone');

    weather.setSky(lowSun, lowSun, 1, 100, 0, 0);

    const rainAhead = Math.max(...[300, 900, 1800, 3000].map((d) => weather.map.read(-lowSun.x / Math.hypot(lowSun.x, lowSun.z) * d, -lowSun.z / Math.hypot(lowSun.x, lowSun.z) * d, 0)));

    if (rainAhead > 0.2 && weather.overcast < 0.5) {
        check(weather.rainbow > 0.3, `Niskie słońce i deszcz naprzeciw niego: tęcza (${weather.rainbow.toFixed(2)})`);
    }

    weather.setSky(highSun, highSun, 1, 100, 0, 0);
    check(weather.rainbow < 0.02, 'Słońce wysoko - bez tęczy');

    weather.setSky(lowSun, lowSun, 0, 100, 0, 0);
    check(weather.rainbow < 0.02, 'Nocą bez tęczy');

    set([['niz', { stay: true }]]);
    weather.setSky(lowSun, lowSun, 1, 100, 0, 0);
    check(weather.rainbow < 0.02, 'Pod zamkniętym niebem bez tęczy');

    weather.rainbowOverride = 1;
    weather.setSky(highSun, highSun, 1, 0.016, 0, 0);
    check(weather.rainbow === 1 && cloudUniforms.uSkyOptics.value.x === 1, '/pogoda tecza włącza tęczę od razu');
    weather.rainbowOverride = null;

    // Halo: cienkie chmury wysokie przed słońcem.
    set([['pierzaste', { stay: true }]]);
    weather.setSky(highSun, highSun, 1, 100, 0, 0);
    check(weather.local.high > 0.6 && weather.halo > 0.3 && cloudUniforms.uSkyOptics.value.y === weather.halo, `Chmury pierzaste przed słońcem dają halo (${weather.halo.toFixed(2)})`);

    weather.setSky(highSun, new THREE.Vector3(0.5, -0.2, 0.5), 1, 100, 0, 0);
    check(weather.halo < 0.02, 'Światło pod horyzontem - bez halo');

    set([['niz', { stay: true }]]);
    weather.setSky(highSun, highSun, 1, 100, 0, 0);
    check(weather.halo < 0.02, 'Pod niskimi chmurami bez halo');

    // Mgła z komendy i mgiełka po deszczu.
    set([['wyz', { stay: true }]]);
    check(weather.fog === 0, 'Wyż w południe: bez mgły');

    weather.fogOverride = 0.8;
    weather.update(t, 0.016, 0, 0);
    check(weather.fog === 0.8 && weather.overcast >= 0.6, 'Mgła z komendy; mgła zasłania niebo');
    weather.fogOverride = null;

    set([['front_cieply', { stay: true }]]);
    check(weather.local.rain > 0.2 && weather.wetness < 0.5, 'Deszcz dopiero zaczął padać - ziemia jeszcze nie zmokła');

    // 40 sekund deszczu (mapa odświeża się wiersz po wierszu).
    for (let frame = 0; frame < 3 * WEATHER_MAP_SIZE; frame++) weather.update(t + 40 / DAY_SECONDS, 0.016, 0, 0);
    check(weather.wetness > 0.95, 'Po 40 sekundach deszczu ziemia pod graczem jest mokra');

    weather.field.clearForced();
    weather.field.force('wyz', 0, 0, t, { stay: true });
    weather.reset();
    weather.update(t + 45 / DAY_SECONDS, 0.016, 0, 0);
    check(weather.wetness > 0.9 && weather.fog > 0.1 && weather.fog < 0.3, `Po deszczu nad mokrą ziemią unosi się lekka mgiełka (${weather.fog.toFixed(2)})`);

    weather.wetSurfaces = false;
    weather.update(t + 45 / DAY_SECONDS, 0.016, 0, 0);
    check(cloudUniforms.uWetness.value === 0, 'Mokrą ziemię da się wyłączyć');
    weather.wetSurfaces = true;
    weather.update(t + 45 / DAY_SECONDS, 0.016, 0, 0);
    check(cloudUniforms.uWetness.value === 1, 'Mokra ziemia włączona');

    weather.dispose();
    check(cloudUniforms.uWeatherRain.value === null && cloudUniforms.uWetness.value === 0 && cloudUniforms.uRainVeil.value.x === 0 && cloudUniforms.uSkyOptics.value.x === 0, 'Po wyjściu ze świata deszcz znika z shaderów');
}


// --- 4. Schronienie -------------------------------------------------------------

function worldFixture() {

    const chunks = new Map();
    const world = { getChunk: (x, z) => chunks.get(`${x},${z}`) };
    const set = (x, y, z, type) => {

        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), key = `${cx},${cz}`;

        let chunk = chunks.get(key);

        if (!chunk) {
            chunk = new Chunk(cx, cz);
            chunks.set(key, chunk);
        }

        chunk.setId(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE, type ? getBlockId(type) : 0);

    };

    // Płaska ziemia na wysokości 10 w promieniu 48 bloków.
    for (let x = -48; x < 48; x++) for (let z = -48; z < 48; z++) set(x, 9, z, 'stone');

    return { world, set };

}

{
    const { world, set } = worldFixture();
    const shelter = new RainShelter(world);

    // Dach 9 x 9 na wysokości 14 nad (8..16, 8..16), woda w (-5, -5), drzewo: liście nad (24, 0).
    for (let x = 8; x <= 16; x++) for (let z = 8; z <= 16; z++) set(x, 14, z, 'stone');
    set(-5, 10, -5, 'water');
    set(24, 16, 0, 'oak_leaves');

    shelter.update(0.5, 0.5);

    check(shelter.texture.format === THREE.RGFormat && shelter.texture.magFilter === THREE.NearestFilter, 'Mapa schronienia: dwa kanały, bez wygładzania');
    equal(shelter.roof(0, 0), 10, 'Otwarta ziemia: deszcz dolatuje do ziemi');
    equal(shelter.roof(12, 12), 15, 'Pod dachem: deszcz zatrzymuje się na dachu');
    equal(shelter.roof(7, 12), 10, 'Tuż obok dachu pada do ziemi');
    equal(shelter.roof(24, 0), 17, 'Liście zatrzymują deszcz');
    equal(shelter.roof(-5, -5), 11, 'Woda zatrzymuje deszcz');
    equal(shelter.data[((((-5 % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE) * SHELTER_SIZE + (((-5 % SHELTER_SIZE) + SHELTER_SIZE) % SHELTER_SIZE)) * 2 + 1], 255, 'Kolumna z wodą jest oznaczona (bez rozprysku)');
    equal(shelter.roof(200, 200), 0, 'Poza wczytanym terenem: nic nie wiadomo');

    equal(shelter.cover(0.5, 11.6, 0.5), 0, 'Pod gołym niebem: bez osłony');
    equal(shelter.cover(12.5, 11.6, 12.5), 1, 'Pod środkiem dachu: pełna osłona');

    const edge = shelter.cover(8.5, 11.6, 12.5);

    check(edge > 0.3 && edge < 0.9, `Na skraju dachu osłona częściowa (${edge.toFixed(2)})`);
    equal(shelter.cover(12.5, 20, 12.5), 0, 'Nad dachem: bez osłony');

    // Gracz stawia dach nad sobą - mapa łapie to w jednym obiegu odświeżania.
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) set(x, 13, z, 'stone');
    for (let frame = 0; frame < SHELTER_SIZE / 2 + 1; frame++) shelter.update(0.5, 0.5);
    equal(shelter.roof(0, 0), 14, 'Postawiony dach trafia do mapy schronienia');
    check(shelter.cover(0.5, 11.6, 0.5) > 0.6, 'Pod nowym dachem gracz jest osłonięty');

    // Okno idzie za graczem: nowe kolumny od razu.
    set(40, 20, 0, 'stone');
    shelter.update(30.5, 0.5);
    equal(shelter.roof(40, 0), 21, 'Po przejściu nowe kolumny są policzone od razu');
    equal(shelter.roof(12, 12), 15, 'Stare kolumny zostają');

    shelter.update(5000.5, 0.5);
    equal(shelter.roof(5000, 0), 0, 'Po teleporcie mapa liczy się od nowa');

    shelter.dispose();
}


// --- 5. Krople ---------------------------------------------------------------------

{
    const drizzle = RainStreaks.shape(0.15, 1);
    const rain = RainStreaks.shape(0.45, 0);
    const downpour = RainStreaks.shape(1, 0);

    check(drizzle.length < rain.length && rain.length < downpour.length, 'Mżawka: krótkie krople, ulewa: długie smugi');
    check(drizzle.fall < rain.fall && rain.fall < downpour.fall, 'Mżawka opada wolno, ulewa leci szybko');
    check(rain.density < downpour.density && downpour.density === 1, 'Im mocniej pada, tym gęściej');
    check(drizzle.density > 0.4, 'Mżawka jest gęsta (drobne krople)');
    check(RainStreaks.shape(0.7, 0.5).length > drizzle.length && RainStreaks.shape(0.7, 0.5).length < RainStreaks.shape(0.7, 0).length, 'Między mżawką a deszczem przejście jest płynne');

    const { world } = worldFixture();
    const scene = new THREE.Scene();
    const streaks = new RainStreaks(scene, world);
    const camera = { position: new THREE.Vector3(0.5, 12, 0.5) };
    const sky = { daylight: 1, horizon: new THREE.Color(0.7, 0.8, 0.9) };

    check(scene.children.length === 2 && !streaks.streaks.visible && !streaks.splashes.visible, 'Bez deszczu nic się nie rysuje');

    streaks.update(0.016, camera, 0, 0, { x: 0, z: 0 }, sky);
    equal(streaks.stats().draws, 0, 'Natężenie 0: zero poleceń rysowania');
    equal(streaks.shelter.roof(0, 0), 10, 'Mapa schronienia żyje także bez deszczu (dźwięk, start deszczu)');

    streaks.update(0.016, camera, 1, 0, { x: 6, z: 0 }, sky);

    equal(streaks.stats().streaks, RAIN_STREAKS.streaks, 'Ulewa: wszystkie krople');
    check(streaks.stats().splashes > 0 && streaks.stats().draws === 2, 'Ulewa: krople i rozpryski, dwa polecenia rysowania');
    check(streaks.velocity.y < -15 && streaks.velocity.x > 4, 'Krople lecą w dół i z wiatrem (ukośnie)');
    check(streaks.uniforms.uRainCamera.value.equals(camera.position), 'Pudełko kropel jest wokół kamery');

    const lean = Math.atan2(streaks.velocity.x, -streaks.velocity.y) * 180 / Math.PI;

    check(lean > 10 && lean < 35, `Silny wiatr pochyla ulewę o kilkanaście-kilkadziesiąt stopni (${lean.toFixed(0)}°)`);

    streaks.update(0.016, camera, 0.15, 1, { x: 6, z: 0 }, sky);

    const drizzleLean = Math.atan2(streaks.velocity.x, -streaks.velocity.y) * 180 / Math.PI;

    check(drizzleLean > lean, 'Wolna mżawka pochyla się z wiatrem mocniej niż ulewa');
    check(streaks.stats().streaks < RAIN_STREAKS.streaks && streaks.stats().streaks > 1000, 'Mżawka: mniej kropel niż w ulewie, ale gęsto');

    // Przesunięcie kropel zostaje w zakresie - po godzinach deszczu też.
    const box = streaks.uniforms.uRainBox.value;

    for (let frame = 0; frame < 5000; frame++) streaks.update(0.1, camera, 1, 0, { x: 7, z: -3 }, sky);

    check(streaks.offset.x >= 0 && streaks.offset.x < box.x * 10 && streaks.offset.y >= 0 && streaks.offset.y < box.y * 10 && streaks.offset.z >= 0 && streaks.offset.z < box.z * 10, 'Przesunięcie kropel zawinięte (dokładność po długim deszczu)');
    check(streaks.uniforms.uRainTime.value < 1000, 'Zegar rozprysków zawinięty');

    // Nocą krople ciemnieją.
    streaks.update(0.016, camera, 1, 0, { x: 0, z: 0 }, { daylight: 1, horizon: new THREE.Color(0.7, 0.8, 0.9) });
    const day = streaks.uniforms.uRainColor.value.r;
    streaks.update(0.016, camera, 1, 0, { x: 0, z: 0 }, { daylight: 0, horizon: new THREE.Color(0.02, 0.03, 0.05) });
    check(streaks.uniforms.uRainColor.value.r < day * 0.25, 'Nocą krople są ciemne');

    // Tryb ziemniaka.
    streaks.setAmount(0.35);
    streaks.update(0.016, camera, 1, 0, { x: 0, z: 0 }, sky);
    equal(streaks.stats().streaks, RAIN_STREAKS.potatoStreaks, 'Tryb ziemniaka: mniej kropel');
    check(streaks.stats().splashes <= RAIN_STREAKS.potatoSplashes, 'Tryb ziemniaka: mniej rozprysków');

    streaks.setAmount(0);
    streaks.update(0.016, camera, 1, 0, { x: 0, z: 0 }, sky);
    equal(streaks.stats().draws, 0, 'Ilość 0: bez kropel');

    streaks.dispose();
    streaks.dispose();
    equal(scene.children.length, 0, 'Sprzątanie usuwa krople ze sceny');

    const shader = source('src/rendering/RainStreaks.js');

    check(shader.includes('step(roof, p.y)') && shader.includes('rainShelter(p.xz)'), 'Kropla pod dachem znika');
    check(shader.includes('step(shelter.g, 0.5)') && shader.includes('uUnderwater > 0.5'), 'Rozprysków nie ma na wodzie; pod wodą deszczu nie widać');
}


// --- 6. Dźwięk ---------------------------------------------------------------------

{
    const quiet = weatherAudioLevels({});

    check(quiet.rain === 0 && quiet.rumble === 0 && quiet.wind === 0, 'Bez deszczu i wiatru cisza');

    const light = weatherAudioLevels({ rain: 0.3 });
    const heavy = weatherAudioLevels({ rain: 1 });
    const mist = weatherAudioLevels({ rain: 0.15, drizzle: 1 });
    const roof = weatherAudioLevels({ rain: 1, cover: 1 });

    check(light.rain > 0 && heavy.rain > light.rain && heavy.rain <= WEATHER_AUDIO.rain, 'Im mocniej pada, tym głośniej');
    check(light.rumble === 0 && heavy.rumble > 0.2, 'Pomruk ulewy dopiero przy mocnym deszczu');
    check(mist.rain < weatherAudioLevels({ rain: 0.15 }).rain && mist.rainLow > light.rainLow, 'Mżawka cichsza i wyższa');
    check(roof.rain < heavy.rain * 0.5 && roof.rainHigh === WEATHER_AUDIO.sheltered && heavy.rainHigh === WEATHER_AUDIO.open, 'Pod dachem deszcz cichnie i traci wysokie tony');
    check(roof.rumble > heavy.rumble * 0.6, 'Bębnienie ulewy słychać także pod dachem');

    const half = weatherAudioLevels({ rain: 1, cover: 0.5 });

    check(half.rainHigh < heavy.rainHigh && half.rainHigh > roof.rainHigh, 'W drzwiach - pośrodku');

    check(weatherAudioLevels({ speed: 1.2 }).wind === 0, 'Słabego wiatru nie słychać');
    check(weatherAudioLevels({ speed: 9 }).wind > weatherAudioLevels({ speed: 4 }).wind && weatherAudioLevels({ speed: 4 }).wind > 0, 'Wiatr rośnie z prędkością');
    check(weatherAudioLevels({ speed: 6, gust: 1 }).wind > weatherAudioLevels({ speed: 6, gust: 0 }).wind, 'Poryw słychać');
    check(weatherAudioLevels({ speed: 9, cover: 1 }).wind < weatherAudioLevels({ speed: 9 }).wind * 0.5, 'W schronieniu wiatr cichnie');
    check(weatherAudioLevels({ speed: 50, gust: 5, rain: 9 }).wind <= WEATHER_AUDIO.wind * 1.4 && weatherAudioLevels({ rain: 9 }).rain <= WEATHER_AUDIO.rain, 'Głośność ma górną granicę');

    // Atrapa Web Audio.
    const log = { created: 0, started: 0, stopped: 0, targets: 0, connected: 0, disconnected: 0 };
    const param = () => ({ value: 0, setTargetAtTime(value) { this.value = value; log.targets++; } });
    const node = () => ({ gain: param(), frequency: param(), Q: param(), playbackRate: param(),
        connect(next) { log.connected++; return next; }, disconnect() { log.disconnected++; },
        start() { log.started++; }, stop() { log.stopped++; } });
    const context = () => ({ sampleRate: 8000, currentTime: 1,
        createBuffer: (channels, length) => ({ data: new Float32Array(length), getChannelData() { return this.data; } }),
        createBufferSource: () => { log.created++; return node(); }, createBiquadFilter: node, createGain: node });

    const game = { sounds: null };
    const audio = new WeatherAudio(game);

    audio.update({ rain: 1 });
    check(audio.nodes === null && audio.levels.rain > 0, 'Bez dźwięku w przeglądarce nic się nie psuje');

    game.sounds = { context: context(), categories: { world: node() } };
    audio.update({ rain: 1, speed: 8, gust: 0.5 });

    check(log.created === 4 && log.started === 4, 'Łańcuch dźwięku: trzy pętle szumu i stukot gradu');
    check(audio.nodes.rain.gain.value === audio.levels.rain && audio.nodes.wind.gain.value === audio.levels.wind, 'Głośności ustawione z pogody');

    const buffer = game.sounds.context.createBuffer(1, 10);

    audio.update({ rain: 0.2 });
    equal(log.created, 4, 'Łańcuch budowany raz');
    check(audio.nodes.sources.length === 4 && buffer.data.length === 10, 'Te same pętle szumu grają dalej');

    // Nowy kontekst dźwięku (np. po powrocie do gry) - łańcuch od nowa.
    game.sounds = { context: context(), categories: { world: node() } };
    audio.update({ rain: 0.2 });
    check(log.created === 8 && log.stopped === 4, 'Po zmianie kontekstu stary łańcuch zatrzymany, nowy zbudowany');

    audio.dispose();
    check(log.stopped === 8 && audio.nodes === null, 'Sprzątanie zatrzymuje szum');
    audio.update({ rain: 1 });
    check(audio.nodes === null, 'Po sprzątnięciu nic nie gra');
}


// --- 7. Mgła i deszcz w powietrzu ------------------------------------------------

{
    const settings = { get: (key) => ({ atmosphereLook: 'natural' })[key] };
    const sky = { lightingLook: 'natural', space: 0, cloudCover: 0, celestial: { sunHeight: 0.8 } };

    updateAerialPerspective(settings, sky, 1);

    const clear = { density: viewUniforms.uAerialDensity.value, height: viewUniforms.uAerialHeight.value, max: viewUniforms.uHazeMax.value };

    equal(clear.max, FAR_HAZE_MAX, 'Bez pogody mgiełka jak dotąd');

    updateAerialPerspective(settings, sky, 1, { fog: 1, rain: 0 });
    check(viewUniforms.uAerialDensity.value > clear.density * 10, 'Gęsta mgła: powietrze kilkanaście razy gęstsze');
    check(viewUniforms.uAerialHeight.value < 60, 'Mgła leży nisko - doliny toną, szczyty wystają');
    check(viewUniforms.uHazeMax.value > 0.95, 'W gęstej mgle daleki teren znika');

    updateAerialPerspective(settings, sky, 1, { fog: 0, rain: 1 });
    check(viewUniforms.uAerialDensity.value > clear.density * 3 && viewUniforms.uAerialDensity.value < clear.density * 5, 'Ulewa zasnuwa krajobraz, ale słabiej niż mgła');
    near(viewUniforms.uAerialHeight.value, clear.height, 1e-9, 'Deszcz nie zmienia wysokości warstwy');

    updateAerialPerspective(settings, sky, 1, { fog: 0.3, rain: 0 });
    check(viewUniforms.uAerialDensity.value < clear.density * 3, 'Lekka mgiełka jest lekka');

    updateAerialPerspective(settings, sky, 1);
    equal([viewUniforms.uAerialDensity.value, viewUniforms.uAerialHeight.value, viewUniforms.uHazeMax.value], [clear.density, clear.height, clear.max], 'Menu i świat bez pogody: wartości wracają');

    updateAerialPerspective(settings, { ...sky, space: 1 }, 1, { fog: 1, rain: 1 });
    equal(viewUniforms.uHazeMax.value, FAR_HAZE_MAX, 'W kosmosie mgła z ziemi nie działa');
    updateAerialPerspective(settings, sky, 1);
}


// --- 8. Shadery ------------------------------------------------------------------

{
    for (const [name, glsl] of [['cienie i mokra ziemia', CLOUD_SHADOW_GLSL], ['niebo', CLOUD_LAYERS_GLSL]]) {

        const open = (glsl.match(/\{/g) ?? []).length, close = (glsl.match(/\}/g) ?? []).length;

        check(open === close, `Shader (${name}): nawiasy się zgadzają`);
        check(!glsl.includes('undefined') && !glsl.includes('${'), `Shader (${name}): wstawione liczby`);

    }

    check(CLOUD_SHADOW_GLSL.includes('float groundWetness(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('if (uWetness <= 0.0)'), 'Mokra ziemia: bez pracy, gdy wyłączona');
    check(CLOUD_SHADOW_GLSL.includes('float puddleAt(') && CLOUD_SHADOW_GLSL.includes('floor(worldPosition.xz * 16.0)'), 'Kałuże z pikseli wielkości pikseli tekstur');
    check(CLOUD_SHADOW_GLSL.includes('float rainAt(') && CLOUD_SHADOW_GLSL.includes('if (uRainVeil.x < 0.5)'), 'Deszcz nad dalekim terenem: bez pracy, gdy nie pada');
    check(CLOUD_LAYERS_GLSL.includes('vec4 rainVeil(') && CLOUD_LAYERS_GLSL.includes('uRainVeil.x > 0.5') && CLOUD_LAYERS_GLSL.includes('vec4 skyOptics('), 'Kurtyny deszczu, tęcza i halo na niebie');
    check(CLOUD_LAYERS_GLSL.includes('2.5464790'), 'Smugi kurtyny zamykają się dookoła nieba bez szwu (16 powtórzeń)');
    near(2.5464790, 16 / (2 * Math.PI), 1e-6, 'Stała smug = 16 / 2π');
    check((CLOUD_SHADOW_GLSL.match(/uniform sampler2D uWeatherRain/g) ?? []).length === 1 && (CLOUD_LAYERS_GLSL.match(/uniform sampler2D uWeatherRain/g) ?? []).length === 1, 'Druga mapa zadeklarowana raz w każdym shaderze');

    const blocks = source('src/rendering/BlockRenderData.js');
    const far = source('src/world/FarTerrain.js');

    check(blocks.includes('#ifndef NO_WET_GROUND') && blocks.includes('groundWetness(vWorldPosition) * smoothstep(0.45, 0.95, blockSky)') && blocks.includes('puddleAt(vWorldPosition, blockWet)'), 'Bloki: mokra ziemia tylko pod gołym niebem, kałuże na wierzchu');
    equal((blocks.match(/#define NO_WET_GROUND/g) ?? []).length, 3, 'Rośliny, liście i woda bez mokrych plam');
    check(far.includes('groundWetness(vFarWorld)') && far.includes('rainAt(vFarWorld)'), 'Daleki teren: ciemnieje od deszczu i tonie w zasłonie');
}


// --- 9. Komenda, ustawienia, osiągnięcia, wpięcie w grę ------------------------

{
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const weather = new Weather('lepidolit');
    const player = { pos: new THREE.Vector3(0, 70, 0), vel: new THREE.Vector3(), yaw: 0, updateCamera() {} };
    const game = { weather, time: { days: 5.5 }, rainOverride: null };
    const run = (...args) => command.run(args, { game, player, world: {} });

    check(run('mgla').includes('100%') && weather.fogOverride === 1, '/pogoda mgla');
    check(run('mgla', '40').includes('40%') && weather.fogOverride === 0.4, '/pogoda mgla 40');
    check(run('tecza').startsWith('Tęcza włączona') && weather.rainbowOverride === 1, '/pogoda tecza');
    check(run('tecza', 'wyl').startsWith('Tęcza wyłączona') && weather.rainbowOverride === 0, '/pogoda tecza wyl');

    run('auto');
    check(weather.fogOverride === null && weather.rainbowOverride === null, '/pogoda auto zdejmuje mgłę i tęczę z komendy');

    for (const bad of [['mgla', '150'], ['mgla', 'x'], ['tecza', 'moze']]) {
        assert.throws(() => run(...bad), `Błędna komenda: /pogoda ${bad.join(' ')}`);
        checks++;
    }

    check(command.complete(['']).includes('mgla') && command.complete(['']).includes('tecza'), 'Podpowiedzi: mgla, tecza');
    equal(command.complete(['tecza', '']), ['wl', 'wyl'], 'Podpowiedzi: tecza wl/wyl');

    weather.dispose();

    equal(SETTINGS_DEFAULTS.wetGround, true, 'Ustawienie: mokra ziemia włączona');
    check(source('src/ui/settingsLayout.js').includes("'wetGround',") && source('src/ui/texts.js').includes('wetGround: (on)') && source('src/commands/settingsCommands.js').includes("'mokra-ziemia': 'wetGround'"), 'Mokra ziemia w menu i w /ustaw');

    const gameSource = source('src/game/Game.js');

    check(gameSource.includes('this.rainStreaks = new RainStreaks(this.scene, this.world)') && gameSource.includes('this.weatherAudio = new WeatherAudio(this)'), 'Gra tworzy krople i dźwięk pogody');
    check(gameSource.includes('this.rain.mesh.visible = false;'), 'Kreski dawnego deszczu są ukryte');
    check(gameSource.includes('this.rainStreaks.update(dt, this.camera, rain, drizzle, this.weather.wind, this.sky.state)'), 'Krople dostają natężenie, mżawkę i wiatr');
    check(gameSource.includes('this.shelterCover = this.rainStreaks.shelter.cover(eye.x, eye.y, eye.z)') && gameSource.includes('cover: this.shelterCover'), 'Dźwięk wie, czy gracz stoi pod dachem');
    check(gameSource.includes('this.weather.setSky(this.sky.celestial.sunDirection'), 'Tęcza i halo liczone co klatkę');
    check(gameSource.includes('{ fog: this.weather.fog, rain: this.rainNow ?? 0 }'), 'Mgła i deszcz zagęszczają powietrze');
    check(gameSource.includes("this.weather.wetSurfaces = !potato && settings.get('wetGround')") && gameSource.includes('this.rainStreaks?.setAmount(potato ? .35 : 1)'), 'Tryb ziemniaka: bez mokrej ziemi, mniej kropel');
    check(gameSource.includes('this.rainStreaks.dispose();') && gameSource.includes('this.weatherAudio.dispose();'), 'Sprzątanie przy wyjściu ze świata');

    const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const stub = (local, extra = {}) => ({
        weather: { ready: true, field: { forced: [] }, local: { ...emptySample(), ...local }, wind: { speed: 2 }, rainbow: 0, rainbowOverride: null, fogOverride: null, ...extra.weather },
        rainOverride: null, shelterCover: 0, ...extra.game
    });

    check(byId.under_a_roof.check(stub({ rain: 0.5 }, { game: { shelterCover: 1 } })) && !byId.under_a_roof.check(stub({ rain: 0.5 })) && !byId.under_a_roof.check(stub({}, { game: { shelterCover: 1 } })), 'Niech sobie pada: deszcz i dach nad głową');
    check(byId.rainbow.check(stub({}, { weather: { rainbow: 0.7 } })) && !byId.rainbow.check(stub({}, { weather: { rainbow: 0.7, rainbowOverride: 1 } })), 'Siedem kolorów: prawdziwa tęcza, nie z komendy');
    check(byId.morning_fog.check(stub({ fog: 0.8 })) && !byId.morning_fog.check(stub({ fog: 0.8 }, { weather: { fogOverride: 1 } })) && !byId.morning_fog.check(stub({ fog: 0.2 })), 'Mleko: gęsta mgła, nie z komendy');
}

console.log(`OK: deszcz - ${checks} sprawdzeń (mgła, mokra ziemia, tęcza i halo, schronienie, krople, dźwięk, powietrze, shadery, komenda, ustawienia, osiągnięcia).`);
