// ------------------------------------------------------------
// SPRAWDZENIE PUSTYNI I MORZA (1.15.0) - pogoda, część 5
//
// - suchość miejsca (pustynia, sawanna) z klimatu; pył w polu pogody:
//   pyłowa mgiełka gorącego popołudnia, pył podnoszony wiatrem, ŚCIANA
//   pyłu przed frontem chłodnym i wokół burzy (z silnym podmuchem),
//   deszcz zmywa pył, poza suchą ziemią pyłu nie ma,
// - mapa pogody (kanał A drugiej tekstury), pył nad graczem, mokra
//   ziemia, komendy; niebo i światło w pyle; gęstsze powietrze,
// - shadery: ściana pyłu na niebie, zasłona na dalekim terenie,
// - piasek niesiony wiatrem (ziarna, strugi), bryzgi z morza,
// - wiry pyłowe: losowanie z czasu gry, warunki, ruch, rysowanie,
// - sztorm: stan morza, fale z wiatrem (gra i shader liczą to samo),
//   piana, tratwa na fali, daleka piana,
// - opisy słowne, komendy, dźwięk, osiągnięcia, ustawienie, mapa,
//   wpięcie w grę.
//
// Uruchomienie: node tools/sprawdz_pustynie.mjs
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
const FIELD = await import('../src/weather/WeatherField.js');
const { WeatherField, DAY_SECONDS, DUST, SEA_WIND, aridity, seaState, emptySample } = FIELD;
const { Weather, WEATHER_MAP_SIZE, WEATHER_MAP_TEXEL } = await import('../src/weather/Weather.js');
const { cloudUniforms, CLOUD_FIELD_GLSL, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL, DUST_TOP, DUST_REACH, CLOUD_LEVELS } = await import('../src/weather/cloudShader.js');
const TEXT = await import('../src/weather/weatherText.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');
const { RainStreaks } = await import('../src/rendering/RainStreaks.js');
const { SandStorm, SAND } = await import('../src/rendering/SandStorm.js');
const { DustDevils, DEVILS, devilWeather } = await import('../src/weather/DustDevils.js');
const { DustDevilRenderer, DEVIL_PARTICLES } = await import('../src/rendering/DustDevilRenderer.js');
const WAVE = await import('../src/rendering/WaterWave.js');
const { plantWindUniforms } = await import('../src/rendering/PlantWind.js');
const { weatherAudioLevels, WEATHER_AUDIO } = await import('../src/audio/WeatherAudio.js');
const { updateAerialPerspective, AERIAL_DUST } = await import('../src/rendering/AtmosphereState.js');
const { viewUniforms } = await import('../src/rendering/viewUniforms.js');
const { Sky, DUST_LIGHT } = await import('../src/sky/Sky.js');
const { SEA_LEVEL, WATER_SURFACE, CHUNK_HEIGHT, FAR_HAZE_MAX } = await import('../src/config.js');
const { YEAR_DAYS, SEASON_DAYS, nextSeasonStart } = await import('../src/sky/Seasons.js');
const { SETTINGS_DEFAULTS } = await import('../src/settings/Settings.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, tolerance, message) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual} zamiast ${expected})`);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Początek wiosny wyrównany do północy (pora dnia = część ułamkowa).
const spring = Math.ceil(nextSeasonStart(0, 0) + YEAR_DAYS);
const middle = (season) => Math.floor(spring + (season + 0.5) * SEASON_DAYS);
const WINTER = middle(3);
const SUMMER = middle(1);

// Pustynia (sucho i gorąco) i zwykła, umiarkowana okolica.
const DESERT = { climate: () => -0.8, warmth: () => 0.7 };
const desert = (seed = 'lepidolit') => new WeatherField(seed, DESERT);


// --- 1. Suchość i pył w polu pogody ------------------------------------------------

{
    equal([aridity(-0.8, 0.7), aridity(0, 0), aridity(0.5, 0.8), aridity(-0.8, -0.2)], [1, 0, 0, 0], 'Suchość: pustynia 1; umiarkowanie, wilgotno albo zimno - 0');
    near(aridity(-0.25, 0.6), DUST.savanna * (FIELD_ramp(-0.05, -0.3, -0.25)), 1e-9, 'Sawanna daje część pyłu pustyni');
    check(aridity(-0.4, 0.45) > 0.05 && aridity(-0.4, 0.45) < 1 && aridity(-0.6, 0.3) > 0 && aridity(-0.6, 0.3) < 1, 'Na skraju pustyni suchość przechodzi płynnie');

    for (let k = 0; k < 400; k++) {
        const a = aridity((k % 20) / 10 - 1, Math.floor(k / 20) / 10 - 1);
        check(a >= 0 && a <= 1, 'Suchość w zakresie 0-1');
    }

    // Wyż nad pustynią latem: w dzień pyłowa mgiełka, nocą czysto.
    const calm = desert();
    const sample = emptySample();

    calm.force('wyz', 0, 0, SUMMER + 0.5, { stay: true });

    const noon = calm.sample(0, 0, SUMMER + 0.62, emptySample());
    const night = calm.sample(0, 0, SUMMER + 0.05, emptySample());

    equal([noon.arid, noon.wall], [1, 0], 'Pustynia: suchość 1, bez ściany pyłu');
    check(noon.dust > 0.1 && noon.dust <= DUST.haze + 1e-9, `Upalne popołudnie na pustyni: pyłowa mgiełka (${noon.dust.toFixed(3)})`);
    equal(night.dust, 0, 'Nocą pył opada');
    check(noon.temp > 30, `Latem na pustyni upał (${noon.temp.toFixed(1)})`);

    const winter = desert();

    winter.force('wyz', 0, 0, WINTER + 0.5, { stay: true });
    check(winter.sample(0, 0, WINTER + 0.62, emptySample()).dust < 0.03, 'Zimą mgiełki z upału nie ma');

    // To samo miejsce i czas bez suchego klimatu: zero pyłu.
    for (const options of [{}, { climate: () => 0.3, warmth: () => 0.7 }, { climate: () => -0.8, warmth: () => -0.3 }, { climate: () => -0.8 }]) {

        const other = new WeatherField('lepidolit', options);

        other.force('front_chlodny', 0, 0, SUMMER + 0.55, { stay: true });

        const flow = other.flow.angle;
        let most = 0;

        for (let d = -3000; d <= 3000; d += 150) {
            most = Math.max(most, other.sample(Math.cos(flow) * d, Math.sin(flow) * d, SUMMER + 0.55, sample).dust, sample.wall, sample.arid);
        }

        equal(most, 0, 'Poza suchą, gorącą ziemią pyłu nie ma');

    }

    // Front chłodny nad pustynią: przed linią deszczu idzie ściana pyłu.
    const front = desert();
    const plain = new WeatherField('lepidolit');
    const t = SUMMER + 0.55;

    front.force('front_chlodny', 0, 0, t, { stay: true });
    plain.force('front_chlodny', 0, 0, t, { stay: true });

    const flow = front.flow.angle;
    const at = (field, d, out = emptySample()) => field.sample(Math.cos(flow) * d, Math.sin(flow) * d, t, out);
    const far = at(front, 2600);
    const wall = at(front, 900);
    const rain = at(front, 0);

    check(far.wall === 0 && far.dust <= DUST.haze + 1e-9, 'Daleko przed frontem tylko mgiełka');
    check(wall.wall > 0.95 && wall.dust > 0.95, `W ścianie pyłu: pełny pył (${wall.dust.toFixed(2)})`);
    check(wall.rain < 0.02, 'Ściana pyłu idzie przed deszczem');
    check(rain.rain > 0.3 && rain.dust === 0 && rain.wall === 0, 'W deszczu pyłu nie ma - deszcz go zmywa');

    // Ostre czoło: z zera do pełnej ściany na kilkuset blokach.
    let edgeFrom = null;
    let edgeTo = null;

    for (let d = 2400; d >= 600; d -= 10) {
        const w = at(front, d, sample).wall;
        if (edgeFrom === null && w > 0.05) edgeFrom = d;
        if (edgeTo === null && w > 0.95) edgeTo = d;
    }

    check(edgeFrom !== null && edgeTo !== null && edgeFrom - edgeTo > 60 && edgeFrom - edgeTo < 400, `Czoło ściany pyłu jest ostre (${edgeFrom} -> ${edgeTo})`);
    check(edgeFrom > 900 && edgeFrom < 2200, 'Czoło ściany ponad kilometr przed linią frontu');

    // Podmuch: w ścianie pyłu wieje dużo mocniej niż w tym samym miejscu
    // frontu nad wilgotną ziemią.
    const gust = at(front, 900).speed - at(plain, 900).speed;

    check(gust > DUST.gust * 0.9 && gust <= DUST.gust + 1e-9, `W ścianie pyłu silny podmuch (+${gust.toFixed(1)} bl./s)`);
    check(at(front, 900).speed <= 11 && at(front, 500).speed <= 11, 'Wiatr ma górną granicę');
    near(at(front, 2600).speed, at(plain, 2600).speed, 1e-9, 'Poza ścianą pyłu wiatr ten sam co nad wilgotną ziemią');

    // Burza: pierścień pyłu wokół komórki, w środku deszcz.
    const storm = desert();

    storm.force('burze', 0, 0, SUMMER + 0.6, { stay: true });

    const ring = [];

    for (let d = 0; d <= 3000; d += 50) {
        const s = storm.sample(Math.cos(flow) * d, Math.sin(flow) * d, SUMMER + 0.6, emptySample());
        ring.push([d, s.wall, s.rain, s.storm]);
    }

    const peak = ring.reduce((best, row) => row[1] > best[1] ? row : best);

    check(peak[1] > 0.9 && peak[0] > 300 && peak[0] < 2200, `Wokół burzy idzie pierścień pyłu (najwięcej ${peak[0]} bloków od środka)`);
    check(ring[0][1] === 0 && ring[0][2] > 0.2, 'W środku burzy pada i pyłu nie ma');
    check(ring[ring.length - 1][1] === 0, 'Daleko od burzy ściany pyłu nie ma');

    // Zwykły silny wiatr też podnosi pył (bez ściany).
    const lifted = [];

    for (let d = -3000; d <= 3000; d += 100) {
        const s = at(front, d, emptySample());
        if (s.wall === 0 && s.rain < 0.02 && s.speed > 6) lifted.push(s.dust);
    }

    // (Za frontem wieje mocno i jest już sucho.)
    check(lifted.every((dust) => dust > 0.2), 'Silny wiatr nad suchą ziemią podnosi pył');

    // Komenda: suchość wszędzie.
    plain.aridOverride = 1;
    check(at(plain, 900).wall > 0.95, 'Suchość z komendy: ściana pyłu także poza pustynią');
    plain.aridOverride = null;
    equal(at(plain, 900).wall, 0, 'Bez komendy znów brak');

    // Powtarzalność i zakresy.
    const again = desert();

    again.force('front_chlodny', 0, 0, t, { stay: true });

    for (let k = 0; k < 300; k++) {

        const x = (k * 7919) % 9000 - 4500;
        const z = (k * 104729) % 9000 - 4500;
        const a = front.sample(x, z, t, emptySample());
        const b = again.sample(x, z, t, emptySample());

        equal([a.dust, a.wall, a.arid, a.speed], [b.dust, b.wall, b.arid, b.speed], 'Pył liczy się zawsze tak samo');
        check(a.dust >= 0 && a.dust <= 1 && a.wall >= 0 && a.wall <= a.dust + 1e-9, 'Pył w zakresie; ściana to część pyłu');

    }

    // Stan morza z wiatru.
    equal([seaState(0), seaState(SEA_WIND[0]), seaState(SEA_WIND[1]), seaState(30)], [0, 0, 1, 1], 'Stan morza: cisza i wichura');
    check(seaState(4) > 0.1 && seaState(4) < seaState(6) && seaState(6) < 1, 'Stan morza rośnie z wiatrem');
    check(seaState(2.2) === 0 && seaState(5) > 0.4 && seaState(5) < 0.7 && seaState(9) === 1, 'Zwykły wiatr morza nie rusza, front chłodny je wzburza, burza daje sztorm');
}


// --- 2. Mapa pogody i pył nad graczem ---------------------------------------------

{
    const weather = new Weather('lepidolit', DESERT);
    const N = WEATHER_MAP_SIZE;
    const map = weather.map;
    const t = SUMMER + 0.55;
    const flow = weather.field.flow.angle;

    weather.field.force('front_chlodny', 0, 0, t, { stay: true });
    weather.update(t, 0.016, 0, 0);

    check(cloudUniforms.uWeatherRain.value === map.rainTexture, 'Pył jedzie drugą mapą pogody (bez nowej tekstury)');
    check(!('dustTexture' in map), 'Mapa nie ma osobnej tekstury pyłu');

    const sample = emptySample();
    let dusty = 0;

    for (let k = 0; k < 300; k++) {

        const ix = (k * 37) % N;
        const iz = (k * 91) % N;
        const x = (map.originX + ix + 0.5) * WEATHER_MAP_TEXEL;
        const z = (map.originZ + iz + 0.5) * WEATHER_MAP_TEXEL;
        const cell = (((map.originZ + iz) % N + N) % N) * N + (((map.originX + ix) % N + N) % N);

        weather.field.sample(x, z, t, sample);

        equal(map.rain[cell * 4 + 3], Math.round(sample.dust * (1 - map.wet[cell]) * 255), 'Kanał A drugiej mapy: pył nad suchą ziemią');
        near(map.read(x, z, 3), sample.dust * (1 - map.wet[cell]), 1 / 255, 'Odczyt pyłu z mapy po stronie gry');

        if (map.rain[cell * 4 + 3] > 200) dusty++;

    }

    check(dusty > 3, 'Na mapie jest ściana pyłu');
    check(map.maxDust > 0.95, 'Mapa wie, że w okolicy jest pył');
    equal([cloudUniforms.uDust.value.x, cloudUniforms.uDust.value.y], [1, DUST_TOP], 'Shadery dostają pył i wysokość ściany');

    // Gracz przed frontem (mgiełka), w ścianie pyłu, w deszczu.
    const stand = (d) => {
        weather.reset();
        weather.update(t, 0.016, Math.cos(flow) * d, Math.sin(flow) * d);
        return weather;
    };

    stand(2700);
    check(weather.dust <= DUST.haze + 1e-9 && weather.dustWall === 0 && weather.arid === 1, 'Przed ścianą pyłu: tylko mgiełka');

    stand(900);
    check(weather.dust > 0.9 && weather.dustWall > 0.9, `W ścianie pyłu: pełny pył nad graczem (${weather.dust.toFixed(2)})`);
    near(cloudUniforms.uDust.value.z, weather.dust, 1e-6, 'Shader zna pył przy kamerze');
    check(weather.wind.speed > 6, 'W ścianie pyłu mocno wieje');

    stand(0);
    check(weather.dust < 0.05 && weather.local.rain > 0.3, 'W deszczu pyłu nie ma');

    // Mokra ziemia: po deszczu pył się nie podnosi, choć pole go daje.
    stand(900);
    map.wet.fill(1);
    weather.update(t, 0.016, Math.cos(flow) * 900, Math.sin(flow) * 900);
    check(weather.local.dust > 0.9 && weather.dust < 0.02 && weather.dustWall < 0.02, 'Nad mokrą ziemią pyłu nie ma');
    map.wet.fill(0);

    // Komenda: pył przy graczu.
    weather.dustOverride = 0.5;
    stand(2700);
    equal([weather.dust, weather.dustWall], [0.5, 0], 'Pył z komendy: tyle, ile ustawiono, bez ściany');
    near(cloudUniforms.uDust.value.z, 0.5, 1e-6, 'Pył z komendy widzi też shader nieba');
    weather.dustOverride = null;

    weather.dispose();
    equal([cloudUniforms.uDust.value.x, cloudUniforms.uDust.value.z], [0, 0], 'Po wyjściu ze świata shadery nie rysują pyłu');

    // Świat bez suchych stron: shadery pyłu nie liczą.
    const wet = new Weather('lepidolit');

    wet.field.force('front_chlodny', 0, 0, t, { stay: true });
    wet.update(t, 0.016, 0, 0);
    equal([wet.map.maxDust, cloudUniforms.uDust.value.x, wet.dust, wet.arid], [0, 0, 0, 0], 'Bez pustyni: zero pyłu, shadery go nie liczą');

    // Komenda działa i tam.
    wet.dustOverride = 0.8;
    wet.update(t, 0.016, 0, 0);
    equal([wet.dust, cloudUniforms.uDust.value.x], [0.8, 1], 'Pył z komendy włącza shadery także poza pustynią');
    wet.dispose();

    // Stan morza: wiatr nad otwartym morzem; na lądzie zero.
    const sea = new Weather('lepidolit', { sea: (x) => (x > 0 ? 1 : 0) });

    sea.field.force('front_chlodny', 0, 0, t, { stay: true });
    sea.update(t, 0.016, 300, 0);
    check(sea.seaMask === 1 && sea.local.speed > SEA_WIND[0], 'Nad morzem, wieje');
    near(sea.sea, seaState(sea.local.speed), 1e-9, 'Stan morza z wiatru (bez chwilowych porywów)');
    check(sea.sea > 0.05, `Front chłodny nad morzem robi fale (${sea.sea.toFixed(2)})`);

    sea.reset();
    sea.update(t, 0.016, -300, 0);
    equal([sea.seaMask, sea.sea], [0, 0], 'Na lądzie (jeziora, rzeki) sztormu nie ma');

    // Fale rosną i opadają powoli: po wyjściu na morze stan dochodzi
    // do swojego w kilkanaście sekund.
    sea.update(t, 1, 300, 0);
    check(sea.sea > 0 && sea.sea < 0.2 * seaState(sea.raw.speed), 'Morze nie nadąża od razu za wiatrem');

    for (let k = 0; k < 90; k++) sea.update(t, 1, 300, 0);

    near(sea.sea, seaState(sea.local.speed), 0.01, 'Po kilkudziesięciu sekundach fale są takie, jak wiatr');

    sea.seaOverride = 0.9;
    sea.update(t, 0.016, -300, 0);
    equal(sea.sea, 0.9, 'Stan morza z komendy (od razu)');
    sea.dispose();

    const none = new Weather('lepidolit');

    none.update(t, 0.016, 0, 0);
    equal([none.seaMask, none.sea], [0, 0], 'Generator bez morza: stan morza zero');
    none.dispose();
}


// --- 3. Niebo, światło i powietrze w pyle ------------------------------------------

{
    const sky = new Sky(new THREE.Scene());
    const days = SUMMER + 0.5;
    const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const warm = (c) => c.r / Math.max(c.b, 1e-6);
    const same = (a, b) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-9;

    for (const look of ['natural', 'baseline']) {

        sky.lightingLook = look;
        sky.dust = 0;
        sky.refresh(days);

        const clear = { zenith: sky.state.zenith.clone(), horizon: sky.state.horizon.clone(), sun: sky.state.sunLightIntensity, tint: sky.state.sunLightColor.clone(), dust: sky.state.dustColor.clone() };

        equal(sky.state.dust, 0, `Bez pyłu (${look})`);
        check(warm(clear.dust) > 2 && clear.dust.r > clear.dust.g && clear.dust.g > clear.dust.b, 'Kolor pyłu to barwa piasku');
        near(lum(clear.dust), lum(clear.horizon) * DUST_LIGHT.glow * (0.2126 * DUST_LIGHT.sand[0] + 0.7152 * DUST_LIGHT.sand[1] + 0.0722 * DUST_LIGHT.sand[2]), 1e-6, 'Pył ma jasność tej pory dnia');
        check(warm(clear.horizon) < 1.2, 'Czyste niebo nie jest płowe');

        sky.dust = 0.2;
        sky.refresh(days);

        const haze = { zenith: sky.state.zenith.clone(), horizon: sky.state.horizon.clone() };

        check(warm(haze.horizon) > warm(clear.horizon) && warm(haze.zenith) < warm(haze.horizon), 'Pyłowa mgiełka żółci horyzont, zenit zostaje niebieskawy');

        sky.dust = 1;
        sky.refresh(days);

        check(sky.state.dust === 1 && same(sky.state.horizon, sky.state.dustColor), 'Burza piaskowa: horyzont w kolorze pyłu');
        check(warm(sky.state.zenith) > 2, 'Burza piaskowa zamyka całe niebo');
        near(lum(sky.state.dustColor), lum(clear.dust), 1e-6, 'Kolor pyłu nie zależy od tego, ile pyłu jest (bez sprzężenia)');

        if (look === 'natural') {
            near(sky.state.sunLightIntensity / clear.sun, 1 - DUST_LIGHT.dim, 0.02, 'Burza piaskowa przygasza słońce');
            check(warm(sky.state.sunLightColor) > warm(clear.tint), 'Światło w pyle żółknie');
        }

        // Powrót: bez pyłu niebo jak przedtem.
        sky.dust = 0;
        sky.refresh(days);
        check(same(sky.state.zenith, clear.zenith) && same(sky.state.horizon, clear.horizon) && sky.state.sunLightIntensity === clear.sun, 'Po burzy niebo wraca do poprzedniego');

    }

    // W kosmosie pył z ziemi nie barwi nieba.
    sky.lightingLook = 'natural';
    sky.dust = 1;
    sky.space = 1;
    sky.refresh(days);
    equal(sky.state.dust, 0, 'W kosmosie pyłu nie widać');
    sky.space = 0;

    // Powietrze: pył zagęszcza je mocniej niż mgła.
    const settings = { get: (key) => ({ atmosphereLook: 'natural' })[key] };
    const air = { lightingLook: 'natural', space: 0, cloudCover: 0, celestial: { sunHeight: 0.8 } };

    updateAerialPerspective(settings, air, 1);

    const clear = { density: viewUniforms.uAerialDensity.value, height: viewUniforms.uAerialHeight.value, max: viewUniforms.uHazeMax.value };

    updateAerialPerspective(settings, air, 1, { fog: 0, rain: 0, dust: 1 });
    near(viewUniforms.uAerialDensity.value / clear.density, 1 + AERIAL_DUST, 1e-6, 'Burza piaskowa: powietrze kilkadziesiąt razy gęstsze');
    check(viewUniforms.uHazeMax.value > 0.95, 'W burzy piaskowej daleki teren znika');
    near(viewUniforms.uAerialHeight.value, clear.height, 1e-9, 'Pył sięga wysoko (wysokość warstwy bez zmian)');

    updateAerialPerspective(settings, air, 1, { fog: 0, rain: 0, dust: DUST.haze });
    check(viewUniforms.uAerialDensity.value < clear.density * 2, 'Pyłowa mgiełka jest lekka');

    updateAerialPerspective(settings, air, 1, { fog: 0, rain: 0, dust: 0.5 });
    check(viewUniforms.uAerialDensity.value > clear.density * 5 && viewUniforms.uAerialDensity.value < clear.density * 12, 'Pył w powietrzu: wyraźnie gorsza widoczność');

    updateAerialPerspective(settings, air, 1);
    equal([viewUniforms.uAerialDensity.value, viewUniforms.uHazeMax.value], [clear.density, clear.max], 'Bez pyłu powietrze jak dotąd');
    equal(clear.max, FAR_HAZE_MAX, 'Mgiełka bez pogody bez zmian');
}


// --- 4. Shadery pyłu ---------------------------------------------------------------

{
    check(CLOUD_LAYERS_GLSL.includes('vec4 dustWall(vec3 ro, vec3 rd, vec3 sky)') && CLOUD_LAYERS_GLSL.includes('vec4 dust = dustWall(ro, rd, sky);'), 'Niebo rysuje ścianę pyłu');
    check(CLOUD_LAYERS_GLSL.indexOf('vec4 dust = dustWall(ro, rd, sky);') < CLOUD_LAYERS_GLSL.indexOf('vec4 optics = skyOptics(rd);') &&
        CLOUD_LAYERS_GLSL.indexOf('vec4 optics = skyOptics(rd);') < CLOUD_LAYERS_GLSL.indexOf('vec4 veil = rainVeil(ro, rd, sky);'), 'Pył jest najbliżej kamery: zasłania tęczę, halo, deszcz i chmury');
    check(CLOUD_LAYERS_GLSL.includes('if (uDust.x > 0.5) {'), 'Bez pyłu w okolicy niebo go nie liczy');
    check(CLOUD_LAYERS_GLSL.includes('textureLod(uWeatherRain, p * uWeatherScale, 0.0).a') && CLOUD_LAYERS_GLSL.includes('uDust.z * (1.0 - smoothstep(150.0, 700.0, d))'), 'Ściana z mapy pogody, blisko kamery także pył wokół niej');
    check(CLOUD_LAYERS_GLSL.includes(`${DUST_REACH.toFixed(1)}`) && CLOUD_LAYERS_GLSL.includes('for (int i = 0; i < 12; i++)'), 'Stała liczba próbek ściany pyłu');
    check(DUST_TOP > CHUNK_HEIGHT * 2 && DUST_TOP > CLOUD_LEVELS.low && DUST_TOP < CLOUD_LEVELS.mid, 'Ściana pyłu sięga ponad góry i podstawę chmur niskich, ale nie do chmur średnich');
    check(CLOUD_FIELD_GLSL.includes('float dustDensity(float dust)') && CLOUD_LAYERS_GLSL.includes('dustDensity(dust)'), 'Wspólna gęstość pyłu dla nieba i dalekiego terenu');
    check(CLOUD_SHADOW_GLSL.includes('float dustAt(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('texture2D(uWeatherRain, worldPosition.xz * uWeatherScale).a'), 'Teren czyta pył z mapy');

    // Gęstość: lekki pył rzadki, ściana gęsta, czoło ostre.
    const density = (dust) => Math.max(dust * dust * 0.6, FIELD_ramp(0.22, 0.7, dust));

    check(density(DUST.haze) < 0.02 && density(0.35) > 0.15 && density(0.7) === 1 && density(1) === 1, 'Mgiełka prawie przezroczysta, od jednej trzeciej pył gęstnieje szybko');
    check(CLOUD_FIELD_GLSL.includes('max(dust * dust * 0.6, smoothstep(0.22, 0.7, dust))'), 'Shader liczy gęstość tak samo jak test');

    const far = source('src/world/FarTerrain.js');

    check(far.includes('max(dustAt(vFarWorld), dustAt(vec3(cameraPosition.xz + farDirection.xz * 0.5, 0.0).xzy))') && far.includes('farDust = dustDensity(farDust)'), 'Daleki teren tonie w pyle (tam, gdzie leży, i w połowie drogi)');
    check(far.includes('if (uDust.x > 0.5) {') && far.includes('mix(uDustShade, uDustColor, 0.3)'), 'Daleki teren: zasłona w kolorze podstawy ściany, tylko gdy jest pył');
    check(far.includes('if (uSea.x > 0.01 && abs(vFarWorld.y -') && far.includes('uSea.yz * uSea.w'), 'Dalekie morze: piana sztormu płynie z wiatrem');

    for (const name of ['uDust', 'uDustColor', 'uDustShade', 'uSea']) {
        check(cloudUniforms[name] && CLOUD_SHADOW_GLSL.includes(`${name};`), `Uniform ${name}`);
    }

    // Kolory ściany z nieba.
    const clouds = source('src/sky/layers/Clouds.js');

    check(clouds.includes('cloudUniforms.uDustColor.value.copy(state.dustColor)') && clouds.includes('cloudUniforms.uDustShade.value.copy(state.dustColor)'), 'Kolor ściany pyłu z nieba (ten sam co mgiełki)');

    for (const glsl of [CLOUD_FIELD_GLSL, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL]) {
        check(!glsl.includes('undefined') && !glsl.includes('NaN') && !glsl.includes('`'), 'Shader bez śmieci z szablonu');
    }
}


// --- 5. Piasek niesiony wiatrem i bryzgi -------------------------------------------

{
    const scene = new THREE.Scene();
    const rain = new RainStreaks(scene, { getChunk: () => null });
    const sand = new SandStorm(scene, rain);
    const camera = { position: new THREE.Vector3(10, 70, -5) };
    const sky = { dustColor: new THREE.Color(0.7, 0.5, 0.3), horizon: new THREE.Color(0.6, 0.7, 0.9), daylight: 1 };

    for (const object of [sand.grains, sand.streams, sand.spray]) check(scene.children.includes(object), 'Piasek i bryzgi są w scenie');

    check(sand.uniforms.uRainShelter === rain.uniforms.uRainShelter && sand.uniforms.uRainBox === rain.uniforms.uRainBox, 'Piasek korzysta z pudełka i mapy schronienia deszczu');

    equal([SandStorm.grainAmount(0), SandStorm.grainAmount(SAND.grainsFrom), SandStorm.grainAmount(1)], [0, 0, 1], 'Ziarna lecą dopiero w gęstszym pyle');
    check(SandStorm.grainAmount(0.6) > 0.3 && SandStorm.grainAmount(0.6) < SandStorm.grainAmount(0.8), 'Im więcej pyłu, tym więcej ziaren');
    equal([SandStorm.streamAmount(0.05, 10), SandStorm.streamAmount(0.3, 1)], [0, 0], 'Bez pyłu albo bez wiatru strugi nie suną');
    check(SandStorm.streamAmount(0.3, 8) > 0.4 && SandStorm.streamAmount(0.15, 8) > 0 && SandStorm.streamAmount(0.15, 8) < SandStorm.streamAmount(0.3, 8), 'Lekki pył i silny wiatr: strugi przy ziemi');
    equal(SandStorm.streamAmount(1, 0), 1, 'W burzy piaskowej strugi suną zawsze');
    equal([SandStorm.sprayAmount(0), SandStorm.sprayAmount(SAND.sprayFrom), SandStorm.sprayAmount(1)], [0, 0, 1], 'Bryzgi dopiero na wzburzonym morzu');

    rain.update(0.016, camera, 0, 0, { x: 0, z: 0 });

    sand.update(0.016, 0, 0, { x: 2, z: 0, speed: 2 }, sky);
    equal(sand.stats().draws, 0, 'Bez pyłu i sztormu nic się nie rysuje');
    check(!sand.grains.visible && !sand.streams.visible && !sand.spray.visible, 'Wszystko ukryte');

    // Pyłowa mgiełka: jeszcze nic nie leci.
    sand.update(0.016, DUST.haze, 0, { x: 1, z: 0, speed: 1 }, sky);
    equal(sand.stats().draws, 0, 'Pyłowa mgiełka nie sypie piaskiem');

    // Burza piaskowa.
    sand.update(0.016, 1, 0, { x: 9, z: 0, speed: 9 }, sky);
    equal([sand.stats().grains, sand.stats().streams, sand.stats().spray, sand.stats().draws], [SAND.grains, SAND.streams, 0, 2], 'Burza piaskowa: wszystkie ziarna i strugi, dwa polecenia rysowania');
    check(sand.velocity.x > 9 && sand.velocity.y === 0, 'Piasek leci poziomo, szybciej niż wiatr przy ziemi');
    check(sand.level === 1 && sand.uniforms.uSandShape.value.y > 0.6, 'Gęsty piasek dobrze widać');
    near(sand.uniforms.uSandColor.value.r / sand.uniforms.uSandColor.value.b, 0.7 / 0.3, 1e-6, 'Piasek ma barwę pyłu z nieba');

    sand.update(0.016, 0.5, 0, { x: 6, z: 0, speed: 6 }, sky);
    check(sand.stats().grains > 0 && sand.stats().grains < SAND.grains * 0.7, 'Słabszy pył - mniej ziaren');

    // Cisza z komendy: piasek dalej leci (powoli), a nie stoi w powietrzu.
    sand.update(0.016, 1, 0, { x: 0.4, z: 0, speed: 0.4 }, sky);
    check(Math.hypot(sand.velocity.x, sand.velocity.z) >= 3.5 - 1e-9, 'Piasek nigdy nie wisi nieruchomo');

    const box = rain.uniforms.uRainBox.value;

    for (let i = 0; i < 400; i++) sand.update(0.1, 1, 1, { x: 9, z: -7, speed: 11.4 }, sky);

    check(sand.offset.x >= 0 && sand.offset.x < box.x * 10 && sand.offset.z >= 0 && sand.offset.z < box.z * 10, 'Przesunięcia trzymają się w zakresie');

    // Sztorm: same bryzgi.
    sand.update(0.016, 0, 1, { x: 9, z: 0, speed: 9 }, sky);
    equal([sand.stats().grains, sand.stats().streams, sand.stats().spray, sand.stats().draws], [0, 0, SAND.spray, 1], 'Sztorm: same bryzgi, jedno polecenie rysowania');
    check(sand.uniforms.uSprayColor.value.r > 0.85 && sand.uniforms.uSprayColor.value.b > 0.9, 'Bryzgi są białe');

    sand.update(0.016, 0, 1, { x: 9, z: 0, speed: 9 }, { ...sky, daylight: 0 });
    check(sand.uniforms.uSprayColor.value.r < 0.4, 'Nocą bryzgi ciemnieją');

    // Tryb ziemniaka i wyłączone efekty.
    rain.setAmount(0.35);
    sand.update(0.016, 1, 1, { x: 9, z: 0, speed: 9 }, sky);
    equal([sand.stats().grains, sand.stats().streams, sand.stats().spray], [SAND.potatoGrains, SAND.potatoStreams, SAND.potatoSpray], 'Tryb ziemniaka: mniej ziaren');

    rain.setAmount(0);
    sand.update(0.016, 1, 1, { x: 9, z: 0, speed: 9 }, sky);
    equal([sand.stats().draws, sand.level], [0, 0], 'Efekty wyłączone - bez piasku');
    rain.setAmount(1);

    for (const object of [sand.grains, sand.streams, sand.spray]) {

        const material = object.material;

        check(material.vertexShader.includes('rainShelter(') && material.vertexShader.includes('rainWrap('), 'Piasek znika pod dachem i wędruje z kamerą');
        check(!material.depthWrite && material.transparent && !material.vertexShader.includes('undefined') && !material.fragmentShader.includes('undefined'), 'Piasek nie zapisuje głębi');

        // (Ten sam błąd co zamieć w 1.14.0: krycie z wierzchołków nie może
        // zależeć od rogu kwadratu.)
        const alpha = material.vertexShader.match(/vAlpha = [^;]*;/g) ?? [];

        check(alpha.length === 1 && !alpha[0].includes('position.'), 'Krycie smugi nie zależy od rogu kwadratu');
        check(material.fragmentShader.includes('vAlpha * (1.0 - abs(vAlong * 2.0 - 1.0))') && material.vertexShader.includes('vAlong = position.y;'), 'Końce smugi gasną w shaderze pikseli');

    }

    check(sand.grains.material.vertexShader.includes('step(roof, p.y)'), 'Ziarna nie lecą pod dachem');
    check(sand.streams.material.vertexShader.includes('step(shelter.g, 0.5)') && sand.spray.material.vertexShader.includes('step(0.5, shelter.g)'), 'Strugi suną po lądzie, bryzgi tylko nad wodą');

    sand.dispose();
    check(!scene.children.includes(sand.grains) && !scene.children.includes(sand.spray), 'Sprzątanie');
    sand.update(0.016, 1, 1, { x: 1, z: 0, speed: 1 }, sky);
    rain.dispose();
}


// --- 6. Wiry pyłowe ----------------------------------------------------------------

{
    const good = { ...emptySample(), arid: 1, temp: 34, speed: 1, low: 0, rain: 0, wall: 0 };

    equal(devilWeather(good, 0.55), 1, 'Upalne, słoneczne, ciche popołudnie na pustyni: pełne warunki');
    equal([devilWeather({ ...good, arid: 0 }, 0.55), devilWeather({ ...good, temp: 15 }, 0.55), devilWeather({ ...good, speed: 6 }, 0.55),
        devilWeather({ ...good, low: 0.9 }, 0.55), devilWeather({ ...good, rain: 0.2 }, 0.55), devilWeather({ ...good, wall: 0.8 }, 0.55),
        devilWeather(good, 0.1), devilWeather(good, 0.9)], [0, 0, 0, 0, 0, 0, 0, 0], 'Bez suchej ziemi, upału, ciszy, słońca albo dnia wirów nie ma');
    check(devilWeather({ ...good, arid: DUST.savanna }, 0.55) > 0 && devilWeather({ ...good, arid: DUST.savanna }, 0.55) < 0.5, 'Na sawannie wiry są rzadsze');
    check(devilWeather({ ...good, temp: 26 }, 0.55) > 0 && devilWeather({ ...good, temp: 26 }, 0.55) < 1, 'Im goręcej, tym łatwiej');

    const field = desert();

    field.force('wyz', 0, 0, SUMMER + 0.5, { stay: true });

    const devils = new DustDevils(field);
    const twin = new DustDevils(desert());

    twin.field.force('wyz', 0, 0, SUMMER + 0.5, { stay: true });

    // Dwie godziny gry w środku dnia, co pół sekundy.
    const seen = new Map();
    let frames = 0;
    let withDevil = 0;
    let most = 0;
    let moved = 0;

    for (let k = 0; k < 1200; k++) {

        const days = SUMMER + 0.5 + k * 0.5 / DAY_SECONDS;
        const list = devils.update(days, 0, 0);
        const other = twin.update(days, 0, 0);

        frames++;
        most = Math.max(most, list.length);
        if (list.length) withDevil++;

        equal(list.map((d) => [d.key, d.x, d.z, d.power]), other.map((d) => [d.key, d.x, d.z, d.power]), 'Wszyscy gracze widzą te same wiry');
        check(list.length <= DEVILS.max, 'Najwyżej kilka wirów naraz');
        check(list.every((d) => d.distance <= DEVILS.range && d.power >= 0 && d.power <= 1 && d.age >= 0), 'Wiry w zasięgu, siła 0-1');
        check(list.every((d, i) => i === 0 || d.distance >= list[i - 1].distance), 'Najbliższy pierwszy');
        equal(devils.nearest, list.length ? list[0].distance : Infinity, 'Odległość od najbliższego wiru');

        for (const d of list) {

            const first = seen.get(d.key);

            if (!first) {
                seen.set(d.key, { x: d.x, z: d.z, from: days, to: days, height: d.height, radius: d.radius });
            }
            else {
                moved = Math.max(moved, Math.hypot(d.x - first.x, d.z - first.z));
                first.to = days;
            }

        }

    }

    check(seen.size >= 3 && seen.size <= 40, `W dobrych warunkach wiry wstają co jakiś czas (${seen.size} w 10 minut gry)`);
    check(withDevil > frames * 0.15 && withDevil < frames, `Wir widać często, ale nie zawsze (${withDevil} z ${frames})`);
    check(moved > 3, 'Wiry wędrują');

    for (const devil of seen.values()) {
        check(devil.height >= DEVILS.height[0] && devil.height <= DEVILS.height[1] && devil.radius >= DEVILS.radius[0] && devil.radius <= DEVILS.radius[1], 'Wielkość wiru w zakresie');
        check((devil.to - devil.from) * DAY_SECONDS <= DEVILS.life[1] + 1, 'Wir żyje niecałą minutę');
    }

    // Wstawanie i zanikanie.
    const one = devils.spawn(0, 0, 0) ?? { key: 1, x: 0, z: 0, start: 100, life: 40, height: 12, radius: 1, phase: 0, windX: 1, windZ: 0, forced: false };
    const out = {};

    equal([devils.place(one, one.start - 1, out), devils.place(one, one.start + one.life + 1, out)], [null, null], 'Przed wstaniem i po zniknięciu wiru nie ma');
    check(devils.place(one, one.start + 0.5, out).power < 0.2 && devils.place(one, one.start + one.life / 2, out).power === 1 && devils.place(one, one.start + one.life - 0.5, out).power < 0.2, 'Wir wstaje i zanika płynnie');

    // Złe warunki: noc, zima, deszcz, zwykła okolica - zero wirów.
    const count = (target, from, steps = 300) => {

        let total = 0;

        for (let k = 0; k < steps; k++) total += target.update(from + k * 2 / DAY_SECONDS, 0, 0).length;

        return total;

    };

    // (Doba gry to 1200 s: 150 kroków po 2 s to ćwierć doby - do 6 rano.)
    equal(count(devils, SUMMER + 0.02, 150), 0, 'Nocą wirów nie ma');

    const winter = new DustDevils(desert());

    winter.field.force('wyz', 0, 0, WINTER + 0.5, { stay: true });
    equal(count(winter, WINTER + 0.5), 0, 'Zimą wirów nie ma');

    const rainy = new DustDevils(desert());

    rainy.field.force('niz', 0, 0, SUMMER + 0.5, { stay: true });
    equal(count(rainy, SUMMER + 0.5), 0, 'Pod zamkniętym niebem wirów nie ma');

    equal(count(new DustDevils(new WeatherField('lepidolit')), SUMMER + 0.5), 0, 'Poza pustynią wirów nie ma');

    // Inny świat - inne wiry.
    const elsewhere = new DustDevils(desert('ametyst'));

    elsewhere.field.force('wyz', 0, 0, SUMMER + 0.5, { stay: true });

    const keys = (target) => {

        const found = new Set();

        for (let k = 0; k < 600; k++) for (const d of target.update(SUMMER + 0.5 + k / DAY_SECONDS, 0, 0)) found.add(`${Math.round(d.x)},${Math.round(d.z)}`);

        return [...found].sort().join(' ');

    };

    check(keys(elsewhere) !== keys(devils), 'Każdy świat ma swoje wiry');

    // Koszt: zapamiętana pogoda oczek, bez liczenia pola co klatkę.
    const started = performance.now();

    for (let k = 0; k < 4000; k++) devils.update(SUMMER + 0.5 + k * 0.02 / DAY_SECONDS, 0, 0);

    const perFrame = (performance.now() - started) / 4000;

    check(perFrame < 0.5, `Losowanie wirów jest tanie (${perFrame.toFixed(3)} ms na klatkę)`);
    check(devils.cache.size <= 601, 'Pamięć pogody oczek ma granicę');

    // Wir z komendy.
    const forced = devils.force(8, 3, SUMMER + 0.02, 1);

    equal([forced.forced, forced.height, forced.radius], [true, DEVILS.height[1], DEVILS.radius[1]], 'Wir z komendy: największy');

    const list = devils.update(SUMMER + 0.02 + 10 / DAY_SECONDS, 0, 0);

    check(list.length === 1 && list[0].forced && devils.nearestForced && Math.abs(devils.nearest - Math.hypot(list[0].x, list[0].z)) < 1e-9, 'Wir z komendy wstaje także nocą');
    check(devils.update(SUMMER + 0.02 + 200 / DAY_SECONDS, 0, 0).length === 0 && devils.forced === null, 'Wir z komendy znika po niecałej minucie');

    // Rysowanie.
    const scene = new THREE.Scene();
    const renderer = new DustDevilRenderer(scene);
    const sky = { dustColor: new THREE.Color(0.7, 0.5, 0.3) };
    const ground = (x, z) => 60 + x * 0 + z * 0;

    check(scene.children.includes(renderer.mesh) && !renderer.mesh.visible, 'Wiry są w scenie, schowane');
    renderer.update([], ground, { x: 1, z: 0 }, 100, sky);
    equal(renderer.stats(), { devils: 0, particles: 0, draws: 0 }, 'Bez wirów nic się nie rysuje');

    const shown = [
        { x: 5, z: 6, power: 1, height: 20, radius: 1.5, phase: 1 },
        { x: -40, z: 9, power: 0.5, height: 10, radius: 1, phase: 2 }
    ];

    renderer.update(shown, ground, { x: 3, z: -1 }, 100, sky);
    equal(renderer.stats(), { devils: 2, particles: DEVIL_PARTICLES.each * DEVILS.max, draws: 1 }, 'Wszystkie wiry jednym poleceniem rysowania');
    equal(renderer.uniforms.uDevil.value[0].toArray(), [5, 60, 6, 1], 'Wir stoi na ziemi');
    equal([renderer.uniforms.uDevil.value[1].w, renderer.uniforms.uDevil.value[2].w], [0.5, 0], 'Wolne miejsca mają siłę zero');
    check(renderer.uniforms.uDevilShape.value[1].x < 10 && renderer.uniforms.uDevilShape.value[0].x === 20, 'Wstający wir jest niższy');
    check(Math.abs(renderer.uniforms.uDevilWind.value.x) <= 0.3 && renderer.uniforms.uDevilWind.value.x > 0 && renderer.uniforms.uDevilWind.value.y < 0, 'Słup pochyla się z wiatrem (z umiarem)');
    near(renderer.uniforms.uDevilColor.value.r / renderer.uniforms.uDevilColor.value.b, 0.7 / 0.3, 1e-6, 'Wir ma barwę pyłu');

    renderer.update(shown, ground, { x: 3, z: -1 }, 100, sky, true);
    equal(renderer.stats().particles, DEVIL_PARTICLES.potatoEach * DEVILS.max, 'Tryb ziemniaka: mniej drobin');

    renderer.update([{ ...shown[0], power: 0 }], ground, { x: 0, z: 0 }, 100, sky);
    equal(renderer.stats().draws, 0, 'Wir bez siły się nie rysuje');

    check(renderer.material.vertexShader.includes(`uniform vec4 uDevil[${DEVILS.max}];`) && !renderer.material.depthWrite && renderer.material.transparent, 'Shader wirów: tyle wirów, ile najwyżej się rysuje');

    const alpha = renderer.material.vertexShader.match(/vAlpha = [^;]*;/g) ?? [];

    check(alpha.length === 1 && !alpha[0].includes('position.'), 'Krycie drobiny nie zależy od rogu kwadratu');
    check(renderer.geometry.getAttribute('aDevil').array.every((value, i) => value === i % DEVILS.max), 'Drobiny rozdzielone równo między wiry');

    renderer.dispose();
    check(!scene.children.includes(renderer.mesh), 'Sprzątanie wirów');
}


// --- 7. Sztorm: fale, piana, tratwa ------------------------------------------------

{
    const { SEA_SURFACE, SEA_WAVE, seaWave, seaCrest, seaSwell, WATER_WAVE_GLSL } = WAVE;

    near(SEA_SURFACE, SEA_LEVEL + WATER_SURFACE, 1e-12, 'Tafla morza: poziom morza i wysokość wody w bloku');

    // Kształt fali: -1..1, biegnie z wiatrem.
    let low = 9;
    let high = -9;

    for (let k = 0; k < 4000; k++) {
        const crest = seaCrest((k * 0.37) % 200 - 100, (k * 0.73) % 200 - 100, k * 0.11, 0.8, 0.6);
        low = Math.min(low, crest);
        high = Math.max(high, crest);
    }

    check(low >= -1 - 1e-9 && high <= 1 + 1e-9 && low < -0.85 && high > 0.85, `Fala mieści się w -1..1 i wypełnia zakres (${low.toFixed(2)}..${high.toFixed(2)})`);

    // Grzbiet przesuwa się z wiatrem (kierunek +x): po chwili ten sam
    // kształt jest dalej z wiatrem.
    const speed = SEA_WAVE.w1 / SEA_WAVE.k1;

    near(0.6 * Math.sin(10 * SEA_WAVE.k1 - 3 * SEA_WAVE.w1), 0.6 * Math.sin((10 + speed * 2) * SEA_WAVE.k1 - 5 * SEA_WAVE.w1), 1e-9, 'Długa fala biegnie z wiatrem');
    check(speed > 3 && speed < 7, `Fale biegną kilka bloków na sekundę (${speed.toFixed(1)})`);
    check(2 * Math.PI / SEA_WAVE.k1 > 10 && 2 * Math.PI / SEA_WAVE.k2 > 5, 'Fale są długie na wiele bloków (siatka wody ma wierzchołek co blok)');

    // Wysokość fali po stronie gry.
    Object.assign(seaWave, { amp: 0, dx: 1, dz: 0, radius: 64, cx: 0, cz: 0 });
    equal(seaSwell(3, SEA_SURFACE, 4, 10), 0, 'Spokojne morze: bez fal sztormowych');

    seaWave.amp = SEA_WAVE.height;
    near(seaSwell(3, SEA_SURFACE, 4, 10), SEA_WAVE.height * seaCrest(3, 4, 10, 1, 0), 1e-12, 'Sztorm: fala o pełnej wysokości przy kamerze');
    equal([seaSwell(3, SEA_SURFACE + 3, 4, 10), seaSwell(3, SEA_SURFACE - 2, 4, 10)], [0, 0], 'Jeziora i rzeki na innej wysokości zostają spokojne');
    equal(seaSwell(200, SEA_SURFACE, 4, 10), 0, 'Daleko od kamery tafla jest płaska (łączy się z dalekim terenem)');
    check(Math.abs(seaSwell(50, SEA_SURFACE, 0, 10)) < Math.abs(SEA_WAVE.height * seaCrest(50, 0, 10, 1, 0)) + 1e-12, 'Przy brzegu zasięgu fale gasną');

    let tallest = 0;

    for (let k = 0; k < 2000; k++) tallest = Math.max(tallest, Math.abs(seaSwell(k % 40 - 20, SEA_SURFACE, (k * 7) % 40 - 20, k * 0.05)));

    check(tallest <= SEA_WAVE.height + 1e-9 && tallest > SEA_WAVE.height * 0.8 && SEA_WAVE.height < 1 - WATER_SURFACE + 0.25, `Fale mają do ${SEA_WAVE.height} bloku`);
    seaWave.amp = 0;

    // Shader liczy to samo.
    for (const number of [SEA_WAVE.k1, SEA_WAVE.w1, SEA_WAVE.k2, SEA_WAVE.w2, SEA_WAVE.bend, SEA_WAVE.skew]) {
        check(WATER_WAVE_GLSL.includes(number.toFixed(3)), `Shader fal używa tej samej liczby co gra (${number})`);
    }

    check(WATER_WAVE_GLSL.includes(`abs(world.y - ${SEA_SURFACE.toFixed(3)}) > ${SEA_WAVE.level.toFixed(2)}`) && WATER_WAVE_GLSL.includes('uSeaWave.w * 0.6, uSeaWave.w * 0.92'), 'Shader: tylko tafla morza, fale gasną przy brzegu zasięgu');
    check(WATER_WAVE_GLSL.includes('0.6 * sin(along *') && WATER_WAVE_GLSL.includes('0.4 * sin(along *') && !WATER_WAVE_GLSL.includes('undefined'), 'Shader: te same dwie fale');
    equal(plantWindUniforms.uSeaWave.value, [0, 1, 0, 64], 'Wspólny uniform fal (zwykła tablica - PlantWind nie zależy od three.js)');
    check(!source('src/rendering/PlantWind.js').includes("from 'three'"), 'PlantWind.js dalej bez three.js');

    const block = source('src/rendering/BlockRenderData.js');

    check(block.includes('float wave = waterWave(waterWorld.xz, uTime) * uWaveHeight + seaSwell(waterWorld, uTime);'), 'Tafla wody: zwykłe fale i fala sztormowa');
    check(block.includes('uSeaWave: plantWindUniforms.uSeaWave,') && block.includes('uSeaFoam: { value: 0 }'), 'Woda dostaje fale i pianę');
    check(block.includes('if (uSeaFoam > 0.01 && vWaterFace > 0.5 && abs(vWaterWorld.y -') && block.includes('float seaLift = seaCrest(vWaterWorld.xz, uTime);'), 'Piana na grzbietach fal morza (tylko wierzch wody na poziomie morza)');
    check(block.includes('waterColor.rgb *= 1.0 + 0.16 * uSeaFoam * seaLift;'), 'Grzbiety fal jaśniejsze, doliny ciemniejsze');
    check(block.includes('diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 0.97), seaWhite * 0.9);') && block.indexOf('diffuseColor *= waterColor;') < block.indexOf('seaWhite * 0.9') &&
        block.indexOf('WATER_EDGE_SHADE))}, waterEdge);') < block.indexOf('seaWhite * 0.9'), 'Piana ma własną biel (po kolorze wody i po zabarwieniu przy granicy dalekiego terenu)');
    check(block.includes('float seaNoise(vec2 p)') && block.includes('seaNoise(seaPlace / 2.2)'), 'Piana rwie się w nieregularne płaty');
    check(source('src/rendering/WaterfallFoam.js').includes('seaSwell(foamWorld, uTime)') && source('src/rendering/WaterfallRipples.js').includes('seaSwell(rippleWorld, uTime)'), 'Piana wodospadów i kręgi na wodzie unoszą się z falą');
    check(source('src/rendering/FloatingLeaves.js').includes('+ seaSwell(x, by + height, z, plantWindUniforms.uTime.value);'), 'Liście na wodzie unoszą się z falą');
    check(source('src/game/RaftPhysics.js').includes('this.world.waveOffset?.(this.pos.x,w.surface,this.pos.z)??0'), 'Tratwa unosi się na fali (bez haka - jak dotąd)');
}


// --- 8. Opisy słowne, komendy, dźwięk ----------------------------------------------

{
    const base = { ...emptySample(), temp: 30, speed: 3 };

    equal(TEXT.skyKey({ ...base, dust: 0.9, wall: 0.9 }), 'haboob', 'Opis: ściana pyłu');
    equal(TEXT.skyKey({ ...base, dust: 0.9, wall: 0.1 }), 'burza_piaskowa', 'Opis: burza piaskowa');
    equal(TEXT.skyKey({ ...base, dust: 0.4 }), 'pyl', 'Opis: pył w powietrzu');
    equal(TEXT.skyKey({ ...base, dust: DUST.haze }), 'mgielka_pylowa', 'Opis: pyłowa mgiełka');
    equal(TEXT.skyKey({ ...base, dust: 0.04 }), 'pogodnie', 'Odrobina pyłu to dalej pogodnie');
    equal(TEXT.skyKey({ ...base, dust: DUST.haze, low: 0.6 }), 'duze', 'Mgiełka nie przesłania opisu chmur');
    equal(TEXT.skyKey({ ...base, dust: 0.9, storm: 0.8, rain: 0.5 }), 'burza', 'Burza zostaje burzą');
    equal(TEXT.skyKey({ ...base, dust: 0.9, rain: 0.6 }), 'ulewa', 'Deszcz przed pyłem');

    for (const key of ['haboob', 'burza_piaskowa', 'pyl', 'mgielka_pylowa']) check(typeof TEXT.SKY_NAMES[key] === 'string', `Nazwa nieba: ${key}`);

    check(TEXT.DUST_NAMES.haze < DUST.haze && TEXT.DUST_NAMES.haze < TEXT.DUST_NAMES.dust && TEXT.DUST_NAMES.dust < TEXT.DUST_NAMES.storm, 'Progi nazw pyłu: mgiełka upalnego popołudnia ma swoją nazwę');
    equal([TEXT.seaName(0), TEXT.seaName(0.3), TEXT.seaName(0.55), TEXT.seaName(0.9)], ['spokojne', 'lekka fala', 'wzburzone', 'sztorm'], 'Stan morza słowami');
    check(TEXT.sampleText({ ...base, dust: 0.9, wall: 0.9 }).startsWith('ściana pyłu (haboob), 30°C'), 'Opis próbki w ścianie pyłu');

    // Prognoza zapowiada ścianę pyłu przed frontem.
    const field = desert();
    const t = SUMMER + 0.4;

    field.force('front_chlodny', 0, 0, t, { ahead: 2700 });

    const lines = TEXT.forecastLines(field, 0, 0, t, 0.5);

    check(lines.some((line) => line.includes('ściana pyłu (haboob)')), `Prognoza zapowiada ścianę pyłu (${lines.join(' | ')})`);
    check(lines.findIndex((line) => line.includes('ściana pyłu')) < lines.findIndex((line) => /deszcz|ulewa|burza:|burza,/.test(line)) || !lines.some((line) => /deszcz|ulewa/.test(line)), 'Najpierw pył, potem deszcz');

    // Komendy.
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const weather = new Weather('lepidolit', { sea: () => 1 });
    const player = { pos: new THREE.Vector3(0, SEA_LEVEL + 20, 0), vel: new THREE.Vector3(), yaw: 0, updateCamera() {} };
    const camera = { position: new THREE.Vector3(0, 70, 0), getWorldDirection: (target) => target.set(0, 0, -1) };
    const game = { weather, time: { days: SUMMER + 0.5 }, rainOverride: null, camera, dustDevils: new DustDevils(weather.field) };
    const run = (...args) => command.run(args, { game, player, world: {} });

    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    check(/Morze: (spokojne|lekka fala|wzburzone|sztorm)\./.test(run()), '/pogoda nad morzem podaje stan morza');

    check(run('pyl').includes('100%') && run('pyl').includes('burza piaskowa') && weather.dustOverride === 1, '/pogoda pyl');
    check(run('pyl', '15').includes('pyłowa mgiełka') && weather.dustOverride === 0.15, '/pogoda pyl 15');
    check(run('pyl', '40').includes('40%') && weather.dustOverride === 0.4, '/pogoda pyl 40');

    const said = run('haboob');

    check(said.startsWith('Nadciąga ściana pyłu (haboob)') && /za ok\. \d+ min/.test(said), '/pogoda haboob');
    equal([weather.field.aridOverride, weather.dustOverride, weather.field.forced.length, weather.field.forced[0].type], [1, null, 1, 'front_chlodny'], '/pogoda haboob: front nad suchą ziemią');

    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    check(weather.dustWall < 0.05 && weather.map.maxDust > 0.9, 'Ściana pyłu z komendy najpierw jest na horyzoncie');

    // Po kilku minutach gry dochodzi do gracza.
    let arrived = null;

    for (let minutes = 0.5; minutes <= 9 && arrived === null; minutes += 0.5) {

        weather.reset();
        weather.update(SUMMER + 0.5 + minutes * 60 / DAY_SECONDS, 0.016, 0, 0, player.pos.y);

        if (weather.dustWall > 0.6) arrived = minutes;

    }

    check(arrived !== null && arrived >= 1.5 && arrived <= 7, `Ściana pyłu z komendy dochodzi po kilku minutach (${arrived})`);

    check(run('haboob', 'teraz').startsWith('Jesteś w ścianie pyłu'), '/pogoda haboob teraz');
    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    check(weather.dustWall > 0.6, 'Po /pogoda haboob teraz gracz jest w ścianie pyłu');

    check(run('wir').startsWith('Wir pyłowy wstaje') && game.dustDevils.forced && game.dustDevils.forced.z === -14 && game.dustDevils.forced.x === 0, '/pogoda wir: kilkanaście bloków przed graczem');
    run('wir', '100');
    equal(game.dustDevils.forced.height, DEVILS.height[1], '/pogoda wir 100: największy');

    check(run('sztorm').includes('100% (sztorm)') && weather.seaOverride === 1, '/pogoda sztorm');
    check(run('sztorm', '50').includes('wzburzone') && weather.seaOverride === 0.5, '/pogoda sztorm 50');
    check(run().includes('Morze: wzburzone.'), '/pogoda podaje stan morza z komendy');

    run('auto');
    equal([weather.field.aridOverride, weather.dustOverride, weather.seaOverride, game.dustDevils.forced, weather.field.forced.length], [null, null, null, null, 0], '/pogoda auto zdejmuje pył, ścianę, wir i sztorm');

    for (const bad of [['pyl', '150'], ['pyl', 'x'], ['haboob', 'jutro'], ['wir', '-5'], ['sztorm', '101'], ['sztorm', 'x']]) {
        assert.throws(() => run(...bad), `Błędna komenda: /pogoda ${bad.join(' ')}`);
        checks++;
    }

    for (const word of ['pyl', 'haboob', 'wir', 'sztorm']) check(command.complete(['']).includes(word) && command.usage.includes(word), `Podpowiedź i opis: ${word}`);

    equal(command.complete(['haboob', '']), ['teraz'], 'Podpowiedź: /pogoda haboob teraz');
    weather.dispose();

    // Dźwięk: syk piasku i huk sztormu.
    equal([weatherAudioLevels({ speed: 9 }).sand, weatherAudioLevels({ speed: 9 }).surf], [0, 0], 'Bez piasku i sztormu cicho');
    check(weatherAudioLevels({ sand: 1, gust: 1 }).sand > weatherAudioLevels({ sand: 0.4, gust: 1 }).sand && weatherAudioLevels({ sand: 0.4, gust: 1 }).sand > 0, 'Im więcej piasku, tym głośniejszy syk');
    check(weatherAudioLevels({ sand: 1, gust: 1 }).sand <= WEATHER_AUDIO.sand + 1e-9 && weatherAudioLevels({ sea: 1, gust: 1 }).surf <= WEATHER_AUDIO.surf + 1e-9, 'Syk i huk mają górną granicę');
    check(weatherAudioLevels({ sand: 1, gust: 1, cover: 1 }).sand < weatherAudioLevels({ sand: 1, gust: 1 }).sand * 0.3, 'Pod dachem piasku prawie nie słychać');
    check(weatherAudioLevels({ sand: 1, gust: 1 }).sandTone > weatherAudioLevels({ sand: 1, gust: 0 }).sandTone, 'Syk piasku faluje z porywami');
    check(weatherAudioLevels({ sea: 1 }).surf > weatherAudioLevels({ sea: 0.5 }).surf && weatherAudioLevels({ sea: 0.5 }).surf > 0, 'Im większe fale, tym głośniejszy huk');
    check(weatherAudioLevels({ sea: 1 }).surfTone < weatherAudioLevels({ sea: 0.3 }).surfTone, 'Sztorm huczy niżej niż lekka fala');

    const audio = source('src/audio/WeatherAudio.js');

    check(audio.includes("sandBand: filter('highpass', 2100, 0.8)") && audio.includes("surfBand: filter('lowpass', 520, 0.6)"), 'Syk piasku z wysokich tonów szumu, huk fal z niskich');
    check(audio.includes("for (const name of ['rain', 'rumble', 'wind', 'hail', 'howl', 'sand', 'surf'])"), 'Sprzątanie nowych dźwięków');
}


// --- 9. Osiągnięcia, ustawienie, mapa, wpięcie w grę -------------------------------

{
    const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const stub = (extra = {}) => ({
        weather: { ready: true, field: { forced: [], tempOverride: null, aridOverride: null }, local: emptySample(), wind: { speed: 2 },
            dust: 0, dustWall: 0, dustOverride: null, sea: 0, seaOverride: null, ...extra.weather },
        rainOverride: null, shelterCover: 0, dustDevils: { nearest: Infinity, nearestForced: false }, rafts: { mounted: null }, player: { swimming: false }, ...extra.game
    });

    for (const id of ['sandstorm', 'haboob', 'dust_devil', 'sea_storm']) {
        check(byId[id] && byId[id].title && byId[id].task && byId[id].comment && typeof byId[id].check === 'function', `Osiągnięcie ${id}`);
        check(!byId[id].check(stub()), `Osiągnięcie ${id} nie wpada samo`);
    }

    check(byId.sandstorm.check(stub({ weather: { dust: 0.8 } })) && !byId.sandstorm.check(stub({ weather: { dust: 0.4 } })), 'Piasek w zębach: burza piaskowa');
    check(!byId.sandstorm.check(stub({ weather: { dust: 0.8, dustOverride: 0.8 } })) && !byId.sandstorm.check(stub({ weather: { dust: 0.8, field: { forced: [], tempOverride: null, aridOverride: 1 } } })) &&
        !byId.sandstorm.check(stub({ weather: { dust: 0.8 }, game: { shelterCover: 1 } })), 'Piasek w zębach: nie z komendy i nie spod dachu');
    check(byId.haboob.check(stub({ weather: { dust: 0.9, dustWall: 0.8 } })) && !byId.haboob.check(stub({ weather: { dust: 0.9, dustWall: 0.2 } })) &&
        !byId.haboob.check(stub({ weather: { dust: 0.9, dustWall: 0.8, field: { forced: [{}], tempOverride: null, aridOverride: null } } })), 'Ściana: w ścianie pyłu, która przyszła sama');
    check(byId.dust_devil.check(stub({ game: { dustDevils: { nearest: 1.5, nearestForced: false } } })) && !byId.dust_devil.check(stub({ game: { dustDevils: { nearest: 12, nearestForced: false } } })) &&
        !byId.dust_devil.check(stub({ game: { dustDevils: { nearest: 1.5, nearestForced: true } } })), 'Diabełek: w wirze, który wstał sam');
    check(byId.sea_storm.check(stub({ weather: { sea: 0.9 }, game: { rafts: { mounted: {} } } })) && byId.sea_storm.check(stub({ weather: { sea: 0.9 }, game: { player: { swimming: true } } })) &&
        !byId.sea_storm.check(stub({ weather: { sea: 0.9 } })) && !byId.sea_storm.check(stub({ weather: { sea: 0.4 }, game: { rafts: { mounted: {} } } })) &&
        !byId.sea_storm.check(stub({ weather: { sea: 0.9, seaOverride: 0.9 }, game: { rafts: { mounted: {} } } })), 'Wilk morski: sztorm na tratwie albo wpław, nie z komendy');

    // Ustawienie.
    equal(SETTINGS_DEFAULTS.seaWaves, true, 'Ustawienie: fale i piana sztormu włączone');
    check(source('src/ui/settingsLayout.js').includes("'seaWaves',") && source('src/ui/texts.js').includes('seaWaves: (on)') && source('src/commands/settingsCommands.js').includes("'fale-sztormu': 'seaWaves'"), 'Fale sztormu: ekran ustawień, tekst i /ustaw fale-sztormu');

    // Mapa pogody.
    const map = source('src/ui/TerrainMap.js');

    check(map.includes('if (sample.dust > 0.06) blend(C.dust') && map.includes("'pył, burza piaskowa'"), 'Mapa pogody: pył i legenda');

    // Gra.
    const gameSource = source('src/game/Game.js');
    const generator = source('src/world/terrain/RealisticGenerator.js');

    check(gameSource.includes('sea: weatherSea(this.world.generator)') && generator.includes('seaAt(x, z) {') && generator.includes('this.compute(x, z, DETAIL_MACRO, this.seaSample ??= {})'), 'Stan morza bierze morze z generatora terenu (sama makrorzeźba)');
    check(gameSource.includes('return nodeField((x, z) => generator.seaAt(x, z));') && gameSource.includes('return nodeField((x, z) => generator.temperatureAt(x, z));'), 'Morze i ciepło klimatu wygładzone między węzłami');
    check(gameSource.includes('this.sky.dust = active ? this.weather.dust : 0;'), 'Pył barwi niebo (gdy chmury są włączone)');
    check(gameSource.includes('dust: this.sky.dust }'), 'Pył zagęszcza powietrze');
    check(gameSource.includes('this.sandStorm.update(dt, active ? weather.dust : 0, sea, this.weather.wind, this.sky.state);'), 'Piasek i bryzgi dostają pył, stan morza, wiatr i barwę');
    check(gameSource.includes("const sea = active && this.settings.get('seaWaves') !== false ? weather.sea : 0;"), 'Ustawienie wyłącza fale, pianę i bryzgi');
    check(gameSource.includes('seaWave.amp = SEA_WAVE.height * sea;') && gameSource.includes('waterUniforms.uSeaFoam.value = foam;') && gameSource.includes('cloudUniforms.uSea.value.set(foam, seaWave.dx, seaWave.dz'), 'Sztorm: fale, piana z bliska i z daleka');
    check(gameSource.includes('this.world.waveOffset = (x, y, z) => seaSwell(x, y, z, plantWindUniforms.uTime.value);'), 'Tratwa dostaje falę');
    check(gameSource.includes('const devils = active && weather.wetness < 0.3') && gameSource.includes('this.devilRenderer.update(devils, this.groundAt'), 'Wiry pyłowe: tylko nad suchą ziemią, stoją na terenie');
    check(gameSource.includes('sand: this.sandStorm.level, sea });'), 'Dźwięk dostaje piasek i stan morza');
    check(gameSource.includes('| Pył: ${Math.round(this.weather.dust * 100)}%') && gameSource.includes('| Morze: ${seaName(this.weather.sea)}'), 'Ekran F3 pokazuje pył i stan morza');
    check(gameSource.includes('this.sandStorm.dispose();') && gameSource.includes('this.devilRenderer.dispose();') && gameSource.includes('this.updateSea(0);'), 'Sprzątanie przy wyjściu ze świata');

    check(source('tools/fixtures/calm-weather.js').includes('pyłu, piasku, wirów pyłowych ani sztormu'), 'Testy bez pogody: bez chmur nie ma też pustyni i sztormu');
    check(source('tools/render_check_weather.js').includes('cloudUniforms.uDust.value.x = 0;') && source('tools/render_check_weather.js').includes('cloudUniforms.uSea.value.x = 0;'), 'Testy materiałów wyłączają pył i pianę na swój czas');

    const sky = source('src/sky/Sky.js');

    check(sky.includes('this.dust = 0;') && sky.includes('state.horizon.lerp(state.dustColor') && sky.includes('sample.direct = sample.direct.map((c, i) => c * dim *'), 'Niebo: pył barwi i przygasza');
}

function FIELD_ramp(a, b, x) {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

console.log(`OK: pustynia i morze - ${checks} sprawdzeń (suchość i pył, ściana pyłu, mapa, niebo i powietrze, shadery, piasek i bryzgi, wiry pyłowe, sztorm, opisy, komendy, dźwięk, osiągnięcia, ustawienie, mapa).`);
