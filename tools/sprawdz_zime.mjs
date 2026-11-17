// ------------------------------------------------------------
// SPRAWDZENIE ZIMY (1.14.0) - pogoda, część 4
//
// - temperatura w polu pogody: pory roku, klimat, pora doby (pod chmurami
//   mniejsza różnica), układy (za frontem chłodnym zimno), wysokość,
//   zakres i gładkość; jaka część opadu jest śniegiem,
// - szron: tylko w mroźne, pogodne, ciche noce i ranki,
// - trzecia mapa pogody: temperatury w bajtach, świeży opad przybywa,
//   póki pada, na mrozie leży, w cieple topnieje; mokro robi się od
//   deszczu, nie od śniegu,
// - pokrywa śnieżna: zimowa (z powolnej temperatury) i świeża; ten sam
//   rachunek w grze i w shaderze; w górach więcej; ustawienie i komendy,
// - płatki (SnowFall): mokre płaty i suchy puch, śnieżyca, zamieć przy
//   ziemi, tryb ziemniaka; krupa śnieżna (drobniejszy grad),
// - opisy słowne, komendy, wycie wiatru, shadery, ustawienie,
//   osiągnięcia, mapa i wpięcie w grę.
//
// Uruchomienie: node tools/sprawdz_zime.mjs
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
const { WeatherField, DAY_SECONDS, SEASON_TEMP, CLIMATE_TEMP, CLIMATE_HEAT, TEMP_LAPSE, climateTemp, emptySample, snowShare, tempAtHeight } = FIELD;
const { Weather, snowCover, SNOW_COVER, TEMP_MIN, TEMP_SPAN, WEATHER_MAP_SIZE, WEATHER_MAP_TEXEL } = await import('../src/weather/Weather.js');
const { cloudUniforms, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL } = await import('../src/weather/cloudShader.js');
const TEXT = await import('../src/weather/weatherText.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');
const { RainStreaks } = await import('../src/rendering/RainStreaks.js');
const { SnowFall, SNOW } = await import('../src/rendering/SnowFall.js');
const { Hail, HAIL } = await import('../src/rendering/Hail.js');
const { weatherAudioLevels, WEATHER_AUDIO } = await import('../src/audio/WeatherAudio.js');
const { SEA_LEVEL } = await import('../src/config.js');
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


// --- 1. Temperatura w polu pogody --------------------------------------------------

{
    const field = new WeatherField('lepidolit');
    const sample = emptySample();

    // Średnia dobowa w środku każdej pory, w wielu miejscach.
    const means = [0, 1, 2, 3].map((season) => {

        let sum = 0;
        let count = 0;

        for (let k = 0; k < 240; k++) {
            sum += field.sample((k * 7919) % 40000 - 20000, (k * 104729) % 40000 - 20000, middle(season) + (k % 24) / 24, sample).temp;
            count++;
        }

        return sum / count;

    });

    check(means[1] > means[0] + 5 && means[1] > means[2] + 5 && means[0] > means[3] + 8 && means[2] > means[3] + 8, `Lato najcieplejsze, zima najzimniejsza (${means.map((m) => m.toFixed(1)).join(', ')})`);
    check(means[3] < 0 && means[1] > 15, 'Zimą mróz, latem ciepło');

    for (let season = 0; season < 4; season++) {
        near(means[season], SEASON_TEMP[season], 3.5, `Średnia pory roku ${season} blisko założonej`);
    }

    // Zakres, gładkość, powolna temperatura.
    let last = null;

    for (let k = 0; k < 4000; k++) {

        const t = spring + k * 0.008;

        field.sample(300, -700, t, sample);

        check(Number.isFinite(sample.temp) && sample.temp > -40 && sample.temp < 40, 'Temperatura w rozsądnym zakresie');
        check(Number.isFinite(sample.tempSlow) && Math.abs(sample.temp - sample.tempSlow) < 16, 'Temperatura chwili nie odbiega bez końca od średniej');
        check(sample.frost >= 0 && sample.frost <= 1, 'Szron w zakresie 0-1');

        if (last !== null) check(Math.abs(sample.temp - last) < 2.5, 'Temperatura zmienia się płynnie w czasie');

        last = sample.temp;

    }

    last = null;

    for (let x = -6000; x <= 6000; x += 40) {

        field.sample(x, 900, WINTER + 0.4, sample);

        if (last !== null) check(Math.abs(sample.temp - last) < 1.5, 'Temperatura zmienia się płynnie w przestrzeni');

        last = sample.temp;

    }

    // Pora doby: pod czystym niebem duża różnica, pod chmurami mała.
    const swing = (type) => {

        const forced = new WeatherField('lepidolit');

        forced.force(type, 0, 0, SUMMER, { stay: true });

        return forced.sample(0, 0, SUMMER + 0.62, emptySample()).temp - forced.sample(0, 0, SUMMER + 0.12, emptySample()).temp;

    };

    const clearSwing = swing('wyz');
    const cloudySwing = swing('niz');

    check(clearSwing > 8 && clearSwing < 13, `Pogodny dzień: po południu dużo cieplej niż przed świtem (${clearSwing.toFixed(1)})`);
    check(cloudySwing > 1 && cloudySwing < clearSwing * 0.6, `Pod chmurami różnica dnia i nocy jest mała (${cloudySwing.toFixed(1)})`);

    // Klimat: gorące i zimne strony świata.
    const hot = new WeatherField('lepidolit', { warmth: () => 1 });
    const cool = new WeatherField('lepidolit', { warmth: () => -1 });
    const t = SUMMER + 0.5;

    near(hot.sample(0, 0, t, emptySample()).tempSlow - field.sample(0, 0, t, emptySample()).tempSlow, CLIMATE_HEAT, 1e-9, 'W gorącym klimacie cieplej');
    near(field.sample(0, 0, t, emptySample()).tempSlow - cool.sample(0, 0, t, emptySample()).tempSlow, CLIMATE_TEMP, 1e-9, 'W zimnym klimacie chłodniej');
    check(cool.sample(0, 0, WINTER + 0.5, emptySample()).tempSlow < -12 && hot.sample(0, 0, WINTER + 0.5, emptySample()).tempSlow > 3, 'Zimą w gorących stronach nie ma mrozu, w zimnych jest siarczysty');

    // Układy: za frontem chłodnym zimniej niż przed nim; pod burzą chłodny podmuch.
    const front = new WeatherField('lepidolit');

    front.force('front_chlodny', 0, 0, SUMMER + 0.5, { stay: true });

    const flow = front.flow.angle;
    const ahead = front.sample(Math.cos(flow) * 1200, Math.sin(flow) * 1200, SUMMER + 0.5, emptySample()).temp;
    const behind = front.sample(-Math.cos(flow) * 2500, -Math.sin(flow) * 2500, SUMMER + 0.5, emptySample()).temp;

    check(ahead - behind > 5, `Za frontem chłodnym jest wyraźnie zimniej (${ahead.toFixed(1)} i ${behind.toFixed(1)})`);

    const storm = new WeatherField('lepidolit');
    const calm = new WeatherField('lepidolit');

    storm.force('burze', 0, 0, SUMMER + 0.62, { stay: true });
    calm.force('wyz', 0, 0, SUMMER + 0.62, { stay: true });
    check(calm.sample(0, 0, SUMMER + 0.62, emptySample()).temp - storm.sample(0, 0, SUMMER + 0.62, emptySample()).temp > 6, 'Pod burzą jest dużo chłodniej niż w wyżu');

    const high = new WeatherField('lepidolit');

    high.force('wyz', 0, 0, WINTER + 0.12, { stay: true });
    check(high.sample(0, 0, WINTER + 0.12, emptySample()).temp < SEASON_TEMP[3] - 6, 'Zimowy wyż: mroźna noc');

    // Temperatura z komendy.
    field.tempOverride = -7;
    equal([field.sample(0, 0, SUMMER + 0.6, sample).temp, sample.tempSlow], [-7, -7], 'Temperatura z komendy zastępuje policzoną');
    field.tempOverride = null;

    // Deszcz czy śnieg, wysokość.
    equal([snowShare(-10), snowShare(0), snowShare(2), snowShare(15)], [1, 1, 0, 0], 'Poniżej zera śnieg, powyżej dwóch stopni deszcz');
    check(snowShare(1) > 0.3 && snowShare(1) < 0.7, 'Około jednego stopnia - deszcz ze śniegiem');

    for (let temp = -5; temp < 5; temp += 0.1) check(snowShare(temp) >= snowShare(temp + 0.1), 'Im cieplej, tym mniej śniegu w opadzie');

    near(tempAtHeight(5, SEA_LEVEL + 50, SEA_LEVEL), 5 - 50 * TEMP_LAPSE, 1e-9, 'W górach chłodniej');
    equal(tempAtHeight(5, SEA_LEVEL - 20, SEA_LEVEL), 5, 'Poniżej poziomu morza bez zmiany');
    check(snowShare(tempAtHeight(4, SEA_LEVEL + 70, SEA_LEVEL)) === 1 && snowShare(4) === 0, 'Gdy w dolinie pada deszcz, w górach pada śnieg');
}


// --- 2. Szron --------------------------------------------------------------------

{
    const make = (type, t, temp = null) => {

        const field = new WeatherField('lepidolit');

        field.force(type, 0, 0, t, { stay: true });
        field.tempOverride = temp;

        return field.sample(0, 0, t, emptySample());

    };

    check(make('wyz', WINTER + 0.2, -4).frost > 0.6, 'Mroźny, pogodny ranek: szron');
    check(make('wyz', WINTER + 0.99, -4).frost > 0.5, 'Szron osiada już wieczorem');
    equal(make('wyz', WINTER + 0.5, -4).frost, 0, 'W południe szronu nie ma');
    equal(make('wyz', WINTER + 0.2, 5).frost, 0, 'Bez mrozu nie ma szronu');
    check(make('niz', WINTER + 0.2, -4).frost < make('wyz', WINTER + 0.2, -4).frost * 0.45, 'Pod chmurami szron jest dużo słabszy');
    equal(make('front_chlodny', WINTER + 0.2, -4).frost, 0, 'W opadzie i wichurze szronu nie ma');

    const dry = new WeatherField('lepidolit', { climate: () => -1 });

    dry.force('wyz', 0, 0, WINTER + 0.2, { stay: true });
    dry.tempOverride = -4;
    check(dry.sample(0, 0, WINTER + 0.2, emptySample()).frost < make('wyz', WINTER + 0.2, -4).frost, 'W suchym klimacie szron jest słabszy');

    // Rano znika stopniowo.
    let previous = 1;

    for (let tod = 0.27; tod <= 0.38; tod += 0.01) {
        const frost = make('wyz', WINTER + tod, -4).frost;
        check(frost <= previous + 1e-9, 'Rano szron znika stopniowo');
        previous = frost;
    }

    equal(previous, 0, 'Przed południem szronu już nie ma');
}


// --- 3. Mapa pogody: temperatury i świeży opad -------------------------------------

{
    // Klimat musi dojść do pola pogody także przez klasę używaną w grze
    // (w 1.14.0 Weather gubiło ciepło klimatu - poprawka 1.14.1).
    const hot = new Weather('lepidolit', { climate: () => -0.6, warmth: () => 1 });
    const cold = new Weather('lepidolit', { climate: () => 0.4, warmth: () => -1 });

    for (const weather of [hot, cold]) {
        weather.field.force('wyz', 0, 0, WINTER + 0.5, { stay: true });
        weather.update(WINTER + 0.5, 0.016, 0, 0);
    }

    check(hot.field.warmth?.(0, 0) === 1 && hot.field.climate?.(0, 0) === -0.6, 'Gra przekazuje polu pogody wilgotność i ciepło klimatu');
    near(hot.local.tempSlow - cold.local.tempSlow, CLIMATE_HEAT + CLIMATE_TEMP, 1e-6, 'Ciepło klimatu zmienia temperaturę w grze');

    // Pustynia zaczyna się przy cieple klimatu ok. 0,3 (Biomes.js): tam
    // środek zimy jest już na plusie i zimowa pokrywa nie leży.
    check(SEASON_TEMP[3] + climateTemp(0.3) > 0 && snowCover(0, 0, SEASON_TEMP[3] + climateTemp(0.3)) < 0.15, 'Na skraju pustyni zimą śnieg prawie nie leży');
    check(snowCover(0, 0, SEASON_TEMP[3] + climateTemp(0.45)) === 0, 'W głębi pustyni zimą nie ma śniegu');
    equal([climateTemp(-1), climateTemp(0), climateTemp(1)], [-CLIMATE_TEMP, 0, CLIMATE_HEAT], 'Klimat: zimne strony o 11 stopni chłodniejsze, gorące o 18 cieplejsze');
    check(hot.snowCover === 0 && cold.snowCover === 1, `Zimą w gorących stronach śnieg nie leży, w zimnych leży (${hot.snowCover} i ${cold.snowCover})`);
}

{
    const weather = new Weather('lepidolit');
    const N = WEATHER_MAP_SIZE;
    const map = weather.map;

    check(cloudUniforms.uWeatherSnow.value === map.snowTexture, 'Shadery dostają trzecią mapę pogody');
    equal([TEMP_MIN, TEMP_SPAN], [-40, 80], 'Zakres temperatur w teksturze');
    check(CLOUD_SHADOW_GLSL.includes('snow.g * 80.0 - 40.0') && CLOUD_SHADOW_GLSL.includes('snow.b * 80.0 - 40.0'), 'Shader odczytuje temperatury w tym samym zakresie');

    const t = WINTER + 0.5;

    weather.update(t, 0.016, 0, 0);

    const sample = emptySample();

    for (let k = 0; k < 60; k++) {

        const ix = (k * 37) % N;
        const iz = (k * 91) % N;
        const x = (map.originX + ix + 0.5) * WEATHER_MAP_TEXEL;
        const z = (map.originZ + iz + 0.5) * WEATHER_MAP_TEXEL;
        const cell = (((map.originZ + iz) % N + N) % N) * N + (((map.originX + ix) % N + N) % N);

        weather.field.sample(x, z, t, sample);

        near(map.snow[cell * 4 + 1] / 255 * TEMP_SPAN + TEMP_MIN, sample.temp, 0.17, 'Temperatura chwili w teksturze');
        near(map.snow[cell * 4 + 2] / 255 * TEMP_SPAN + TEMP_MIN, sample.tempSlow, 0.17, 'Temperatura powolna w teksturze');
        near(map.snow[cell * 4 + 3] / 255, sample.frost, 0.003, 'Szron w teksturze');
        near(map.temp[cell], sample.temp, 1e-4, 'Temperatura po stronie gry');

    }

    check(map.minSlow < 0 && map.minTemp <= map.minSlow + 12, 'Mapa zna najniższe temperatury w oknie');

    // Świeży opad: mróz i opad frontu ciepłego.
    const setup = (type, temp) => {
        weather.field.clearForced();
        weather.field.force(type, 0, 0, weather.days, { stay: true });
        weather.field.tempOverride = temp;
    };
    const run = (seconds, from) => {

        let time = from;

        for (let k = 0; k < seconds * 4; k++) {
            time += 0.25 / DAY_SECONDS;
            weather.update(time, 0.25, 0, 0);
        }

        return time;

    };

    // Burza z komendy: pod główną komórką pada bez przerwy.
    setup('burze', -4);
    weather.reset();
    weather.update(t, 0.016, 0, 0);

    const mod = (value) => ((value % N) + N) % N;
    const spot = mod(Math.floor(0 / WEATHER_MAP_TEXEL)) * N + mod(Math.floor(0 / WEATHER_MAP_TEXEL));

    check(map.rain[spot * 4] / 255 > 0.4, 'Pod burzą z komendy pada');
    map.fillFresh(0);

    let time = run(25, t);
    const early = map.fresh[spot];

    time = run(95, time);

    check(early < 0.8 && map.fresh[spot] > early && map.fresh[spot] > 0.9, `Póki pada, świeżego opadu przybywa (${early.toFixed(2)} -> ${map.fresh[spot].toFixed(2)})`);
    check(map.maxFresh >= map.fresh[spot], 'Mapa zna największy świeży opad');
    equal(map.snow[spot * 4], Math.round(map.fresh[spot] * 255), 'Świeży opad trafia do tekstury');
    equal(map.wet[spot], 0, 'Śnieg nie moczy ziemi');
    near(map.freshAt(0, 0), map.fresh[spot], 1e-9, 'Odczyt świeżego opadu w miejscu');

    // Przestaje padać, mróz trzyma: śnieg leży.
    setup('wyz', -4);
    weather.reset();

    const lying = map.fresh[spot];

    time = run(240, time);
    check(map.fresh[spot] > lying - 0.1, `Na mrozie świeży śnieg leży (${lying.toFixed(2)} -> ${map.fresh[spot].toFixed(2)})`);

    // Odwilż: topnieje w kilka minut.
    setup('wyz', 6);
    weather.reset();
    time = run(40, time);

    const melting = map.fresh[spot];

    check(melting < lying - 0.15 && melting > 0, `W cieple śnieg topnieje (${lying.toFixed(2)} -> ${melting.toFixed(2)})`);
    time = run(170, time);
    equal(map.fresh[spot], 0, 'Po kilku minutach odwilży śniegu nie ma');

    // Deszcz w cieple moczy ziemię.
    setup('burze', 9);
    weather.reset();
    time = run(40, time);
    check(map.wet[spot] > 0.5, 'Deszcz moczy ziemię');

    // Opad z komendy zasypuje tylko okolicę gracza.
    setup('wyz', -4);
    weather.reset();
    weather.update(time, 0.016, 0, 0);
    map.fillFresh(0);
    weather.addPrecipitation(10, 10, 1, 0.01);

    const here = map.freshAt(10, 10);

    near(here, 0.01 / 0.03, 1e-6, 'Opad z komendy: tyle, ile spadło');
    check(map.freshAt(10 + 2 * WEATHER_MAP_TEXEL, 10) > 0 && map.freshAt(10 + 4 * WEATHER_MAP_TEXEL, 10) === 0, 'Opad z komendy zasypuje tylko okolicę gracza');
    check(map.maxFresh >= here - 1e-6, 'Shader dowiaduje się o opadzie z komendy');

    map.fillFresh(1);
    check(map.fresh.every((value) => value === 1) && map.snow[0] === 255, 'Zasypanie całego okna');

    weather.dispose();
    check(cloudUniforms.uWeatherSnow.value === null && cloudUniforms.uSnow.value.x === 0 && cloudUniforms.uFrost.value === -2, 'Po wyjściu ze świata śnieg i szron są wyłączone');
}


// --- 4. Pokrywa śnieżna -------------------------------------------------------------

{
    equal(snowCover(0, 20, 20), 0, 'Latem bez śniegu');
    equal(snowCover(0, -10, -10), 1, 'W środku zimy leży pełna pokrywa');
    equal(snowCover(0, -10, SNOW_COVER.lying[1]), 0, 'Zimowa pokrywa znika przy średniej powyżej zera');
    equal(snowCover(0, 10, SNOW_COVER.lying[0]), 1, 'Zimowa pokrywa nie zależy od chwilowej odwilży');
    equal(snowCover(1, -5, 8), 1, 'Świeży śnieg leży, gdy jest mróz - także poza zimą');
    equal(snowCover(1, 5, 8), 0, 'Świeży opad w cieple to deszcz');
    near(snowCover(0.4, -5, 8), 0.4, 1e-9, 'Świeżego śniegu jest tyle, ile napadało');

    for (let slow = -6; slow < 4; slow += 0.25) check(snowCover(0, 0, slow) >= snowCover(0, 0, slow + 0.25), 'Im cieplejsza pora, tym mniej zimowej pokrywy');

    check(CLOUD_SHADOW_GLSL.includes(`smoothstep(${SNOW_COVER.lying[0].toFixed(1)}, ${SNOW_COVER.lying[1].toFixed(1)}, slow)`) &&
        CLOUD_SHADOW_GLSL.includes(`smoothstep(${SNOW_COVER.fresh[0].toFixed(1)}, ${SNOW_COVER.fresh[1].toFixed(1)}, now)`), 'Shader liczy pokrywę tak samo jak gra');

    // W grze: zima i lato, góry i doliny.
    const weather = new Weather('lepidolit');

    weather.field.force('wyz', 0, 0, WINTER + 0.5, { stay: true });
    weather.update(WINTER + 0.5, 0.016, 0, 0, SEA_LEVEL + 10);

    check(weather.temperature < 0 && weather.snowShare === 1, 'Zimą jest mróz i pada śnieg');
    check(weather.snowCover > 0.9, 'Zimą leży śnieg');
    equal(cloudUniforms.uSnow.value.toArray(), [1, TEMP_LAPSE, SEA_LEVEL, -1], 'Zimą shadery liczą śnieg');

    const low = weather.temperature;

    weather.update(WINTER + 0.5, 0.016, 0, 0, SEA_LEVEL + 70);
    near(low - weather.temperature, 60 * TEMP_LAPSE, 0.01, 'Wyżej jest chłodniej');

    weather.update(WINTER + 0.5, 0.016, 0, 0, 5000);
    near(low - weather.temperature, (128 - SEA_LEVEL - 10) * TEMP_LAPSE, 0.01, 'Lot ponad chmury nie ochładza bez końca');

    weather.snowSurfaces = false;
    weather.update(WINTER + 0.5, 0.016, 0, 0);
    equal(cloudUniforms.uSnow.value.x, 0, 'Ustawienie wyłącza pokrywę śnieżną');
    equal(cloudUniforms.uFrost.value, -2, 'Ustawienie wyłącza też szron');
    weather.snowSurfaces = true;

    const summer = new Weather('lepidolit');

    summer.field.force('wyz', 0, 0, SUMMER + 0.5, { stay: true });
    summer.update(SUMMER + 0.5, 0.016, 0, 0);
    check(summer.temperature > 15 && summer.snowShare === 0 && summer.snowCover === 0, 'Latem ciepło, deszcz i ani śladu śniegu');
    equal(cloudUniforms.uSnow.value.x, 0, 'Latem shadery nie liczą śniegu wcale');
    equal(cloudUniforms.uFrost.value, -2, 'Latem nie ma szronu');

    // Jesienią w dolinie zielono, ale w górach może już leżeć.
    summer.field.tempOverride = 4;
    summer.reset();
    summer.update(SUMMER + 0.5, 0.016, 0, 0, SEA_LEVEL);
    equal(summer.snowCover, 0, 'Przy czterech stopniach w dolinie nie ma śniegu');
    equal(cloudUniforms.uSnow.value.x, 1, 'Ale shadery liczą śnieg - w górach jest poniżej zera');
    summer.update(SUMMER + 0.5, 0.016, 0, 0, SEA_LEVEL + 75);
    check(summer.temperature < -1.5 && summer.snowCover > 0.7, 'Wysoko w górach przy tej samej pogodzie leży śnieg');

    // Komendy: pokrywa i szron.
    summer.field.tempOverride = null;
    summer.coverOverride = 0.6;
    summer.frostOverride = 1;
    summer.reset();
    summer.update(SUMMER + 0.5, 0.016, 0, 0);
    equal([summer.snowCover, cloudUniforms.uSnow.value.x, cloudUniforms.uSnow.value.w], [0.6, 1, 0.6], 'Pokrywa z komendy');
    near(summer.frost, 0.4, 1e-9, 'Szron widać tam, gdzie nie leży śnieg');
    equal(cloudUniforms.uFrost.value, 1, 'Szron z komendy');

    summer.coverOverride = null;
    summer.frostOverride = null;
    summer.update(SUMMER + 0.5, 0.016, 0, 0);
    equal([cloudUniforms.uSnow.value.x, cloudUniforms.uSnow.value.w, cloudUniforms.uFrost.value], [0, -1, -2], 'Po odwołaniu komend lato wraca');

    weather.dispose();
    summer.dispose();
}


// --- 5. Płatki, śnieżyca, zamieć, krupa ---------------------------------------------

{
    const wet = SnowFall.shape(0.5, 1);
    const dry = SnowFall.shape(0.5, 0);

    check(wet.size > dry.size * 1.8, 'Mokre płaty są dużo większe od suchego puchu');
    check(wet.fall > dry.fall && wet.fall < 4.5, 'Mokre płaty opadają szybciej, ale wciąż powoli');
    check(dry.carry === 1 && wet.carry < 1, 'Suchy puch wiatr niesie w całości');
    check(SnowFall.shape(1, 0.5).density > SnowFall.shape(0.2, 0.5).density && SnowFall.shape(1, 0.5).density === 1, 'Im mocniej pada, tym gęściej');

    equal(SnowFall.driftAmount(3, 1), 0, 'Przy słabym wietrze śnieg leży spokojnie');
    equal(SnowFall.driftAmount(12, 0), 0, 'Bez śniegu na ziemi nie ma zamieci');
    equal(SnowFall.driftAmount(SNOW.driftFull, 1), 1, 'Wichura nad śniegiem: pełna zamieć');
    check(SnowFall.driftAmount(6.5, 1) > 0.2 && SnowFall.driftAmount(6.5, 1) < SnowFall.driftAmount(8, 1), 'Zamieć rośnie z wiatrem');

    const scene = new THREE.Scene();
    const rain = new RainStreaks(scene, { getChunk: () => null });
    const snow = new SnowFall(scene, rain);
    const camera = { position: new THREE.Vector3(10, 70, -5) };

    check(scene.children.includes(snow.flakes) && scene.children.includes(snow.drift), 'Śnieg jest w scenie');
    check(snow.uniforms.uRainShelter === rain.uniforms.uRainShelter, 'Śnieg korzysta z mapy schronienia deszczu');

    rain.update(0.016, camera, 0, 0, { x: 0, z: 0 });
    snow.update(0.016, 0, 0.5, { x: 1, z: 0, speed: 1 }, 0);
    equal(snow.stats().draws, 0, 'Bez śniegu nic się nie rysuje');

    snow.update(0.016, 1, 0.5, { x: 1, z: 0, speed: 1 }, 0);
    equal([snow.stats().flakes, snow.stats().drift, snow.stats().draws], [SNOW.flakes, 0, 1], 'Gęsty śnieg: wszystkie płatki, jedno polecenie rysowania');
    equal(snow.uniforms.uSnowStretch.value, 0, 'W spokojnym powietrzu płatki są kwadratowe');
    check(snow.velocity.y < -1 && snow.velocity.y > -4.5, 'Śnieg opada powoli');

    snow.update(0.016, 0.3, 0.5, { x: 1, z: 0, speed: 1 }, 0);
    check(snow.stats().flakes < SNOW.flakes && snow.stats().flakes > SNOW.flakes * 0.2, 'Słabszy śnieg - mniej płatków');

    // Śnieżyca: wiatr niesie płatki prawie poziomo i rozciąga w smugi.
    snow.update(0.016, 1, 0, { x: 9, z: 0, speed: 9 }, 1);
    check(snow.velocity.x > Math.abs(snow.velocity.y) * 3, 'W śnieżycy płatki lecą prawie poziomo');
    check(snow.uniforms.uSnowStretch.value > 2, 'W śnieżycy płatki rozciągają się w smugi');
    equal([snow.stats().drift, snow.stats().draws], [SNOW.drift, 2], 'Wichura nad śniegiem: zamieć przy ziemi');
    check(snow.driftLevel === 1 && snow.driftVelocity.x > 9, 'Zamieć sunie szybciej niż wiatr');

    // Zamieć bez opadu.
    snow.update(0.016, 0, 0, { x: 8, z: 0, speed: 8 }, 1);
    check(!snow.flakes.visible && snow.drift.visible, 'Zamieć przy ziemi jest także wtedy, gdy z nieba nie pada');

    const before = snow.offset.clone();

    snow.update(0.05, 1, 0.5, { x: 2, z: 1, speed: 2.2 }, 0);
    check(snow.offset.x !== before.x && snow.offset.y !== before.y && snow.offset.z !== before.z, 'Płatki lecą');

    for (let k = 0; k < 3000; k++) snow.update(0.1, 1, 0.5, { x: 7, z: -5, speed: 8.6 }, 1);

    const box = rain.uniforms.uRainBox.value;

    check(snow.offset.x >= 0 && snow.offset.x < box.x * 10 && snow.offset.y >= 0 && snow.offset.y < box.y * 10 &&
        snow.driftOffset.z >= 0 && snow.driftOffset.z < box.z * 10, 'Przesunięcia trzymają się w zakresie');

    rain.setAmount(0.35);
    snow.update(0.016, 1, 0.5, { x: 9, z: 0, speed: 9 }, 1);
    equal([snow.stats().flakes, snow.stats().drift], [SNOW.potatoFlakes, SNOW.potatoDrift], 'Tryb ziemniaka: mniej płatków');

    rain.setAmount(0);
    snow.update(0.016, 1, 0.5, { x: 9, z: 0, speed: 9 }, 1);
    equal(snow.stats().draws, 0, 'Efekty wyłączone - bez śniegu');

    for (const material of [snow.flakeMaterial, snow.driftMaterial]) {
        check(material.vertexShader.includes('rainShelter(p.xz)') && material.vertexShader.includes('rainWrap('), 'Płatki znikają pod dachem i wędrują z kamerą');
        check(!material.depthWrite && material.transparent && !material.vertexShader.includes('undefined'), 'Śnieg nie zapisuje głębi');

        // Krycie liczone w wierzchołkach nie może zależeć od tego, który
        // to róg kwadratu: wygaszenie końców smugi daje w obu końcach zero,
        // więc zerowałoby całą smugę (zamieć w 1.14.0 była przez to
        // niewidoczna). Końce gasną w shaderze pikseli.
        const alpha = material.vertexShader.match(/vAlpha = [^;]*;/g) ?? [];

        check(alpha.length === 1 && !alpha[0].includes('position.'), 'Krycie płatka i smugi nie zależy od rogu kwadratu');
        check(material.fragmentShader.includes('vAlpha * (1.0 - vStreak.y * abs(vStreak.x * 2.0 - 1.0))'), 'Końce smugi gasną w shaderze pikseli');
    }

    check(snow.flakeMaterial.vertexShader.includes('vStreak = vec2(position.y, 0.0);') && snow.driftMaterial.vertexShader.includes('vStreak = vec2(position.y, 1.0);'), 'Płatki są pełne, smugi zamieci gasną na końcach');

    // Krupa śnieżna: drobniejszy, wolniejszy grad.
    rain.setAmount(1);

    const hail = new Hail(scene, rain);

    hail.update(0.016, 1, { x: 0, z: 0 }, null, 0);

    const hailFall = hail.velocity.y;
    const hailSize = hail.uniforms.uHailShape.value.x;

    hail.update(0.016, 1, { x: 0, z: 0 }, null, 1);
    check(hail.velocity.y > hailFall * 0.6 && hail.velocity.y < 0 && hail.uniforms.uHailShape.value.x < hailSize * 0.7, 'Krupa śnieżna: kulki mniejsze i wolniejsze niż grad');
    equal([hailFall, hailSize], [-HAIL.fall, HAIL.size], 'Grad bez zmian');

    hail.dispose();
    snow.dispose();
    rain.dispose();
    check(!scene.children.includes(snow.flakes) && snow.disposed, 'Sprzątanie zdejmuje śnieg');
}


// --- 6. Opisy, komendy, dźwięk ------------------------------------------------------

{
    const base = { ...emptySample(), rain: 0.2, speed: 2, low: 1 };

    equal(TEXT.skyKey({ ...base, temp: -3 }), 'snieg', 'Opis: śnieg');
    equal(TEXT.skyKey({ ...base, rain: 0.5, temp: -3 }), 'snieg_gesty', 'Opis: gęsty śnieg');
    equal(TEXT.skyKey({ ...base, rain: 0.6, speed: 8, temp: -6 }), 'sniezyca', 'Opis: śnieżyca');
    equal(TEXT.skyKey({ ...base, temp: 1 }), 'deszcz_snieg', 'Opis: deszcz ze śniegiem');
    equal(TEXT.skyKey({ ...base, rain: 0.3, temp: 8 }), 'deszcz', 'Opis: deszcz w cieple');
    equal(TEXT.skyKey({ ...base, rain: 0.3, temp: 6 }, -1), 'snieg', 'Opis w górach: śnieg, choć w dolinie deszcz');
    equal(TEXT.skyKey({ ...emptySample(), frost: 0.8, temp: -3 }), 'szron', 'Opis: szron');
    equal(TEXT.skyKey({ ...emptySample(), storm: 0.8, rain: 0.9, temp: -3 }), 'burza', 'Burza zostaje burzą');

    for (const key of ['sniezyca', 'snieg_gesty', 'snieg', 'deszcz_snieg', 'szron']) check(typeof TEXT.SKY_NAMES[key] === 'string', `Nazwa nieba: ${key}`);

    equal([TEXT.tempText(-3.4), TEXT.tempText(-0.2), TEXT.tempText(12.6)], ['-3°C', '0°C', '13°C'], 'Temperatura słowami');
    check(TEXT.sampleText({ ...base, temp: -3 }).startsWith('śnieg, -3°C | chmury'), 'Opis próbki z temperaturą');
    check(TEXT.sampleText({ ...base, temp: 5 }, SEA_LEVEL + 75).startsWith('śnieg, -1°C'), 'Opis próbki na wysokości');

    const field = new WeatherField('lepidolit');
    const lines = TEXT.forecastLines(field, 0, 0, WINTER, 1.5);

    check(lines.length >= 1 && lines.every((line) => /-?\d+°C/.test(line)), 'Prognoza podaje temperaturę');

    // Komendy.
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const weather = new Weather('lepidolit');
    const player = { pos: new THREE.Vector3(0, SEA_LEVEL + 20, 0), vel: new THREE.Vector3(), yaw: 0, updateCamera() {} };
    const game = { weather, time: { days: SUMMER + 0.5 }, rainOverride: null };
    const run = (...args) => command.run(args, { game, player, world: {} });

    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    check(/°C \| chmury/.test(run()), '/pogoda podaje temperaturę');

    check(run('temperatura', '-6').includes('-6°C') && weather.field.tempOverride === -6, '/pogoda temperatura -6');
    check(run('temp', '1').includes('deszczem ze śniegiem') && weather.field.tempOverride === 1, '/pogoda temp 1');
    check(run('temperatura', '12').includes('deszczem.'), '/pogoda temperatura 12');

    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);

    const said = run('snieg');

    check(said.startsWith('Śnieg: 60%') && game.rainOverride === 0.6 && weather.field.tempOverride === -3 && said.includes('-3°C'), '/pogoda snieg ustawia też mróz, gdy jest za ciepło');

    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    weather.field.tempOverride = -9;
    weather.reset();
    weather.update(SUMMER + 0.5, 0.016, 0, 0, player.pos.y);
    run('snieg', '30');
    equal([game.rainOverride, weather.field.tempOverride], [0.3, -9], '/pogoda snieg nie rusza temperatury, gdy już jest mróz');

    check(run('pokrywa').includes('100%') && weather.coverOverride === 1, '/pogoda pokrywa');
    check(run('pokrywa', '40').includes('40%') && weather.coverOverride === 0.4, '/pogoda pokrywa 40');
    check(run('szron').includes('100%') && weather.frostOverride === 1, '/pogoda szron');
    check(run('szron', '0').includes('0%') && weather.frostOverride === 0, '/pogoda szron 0');

    run('auto');
    equal([weather.field.tempOverride, weather.coverOverride, weather.frostOverride, game.rainOverride], [null, null, null, null], '/pogoda auto zdejmuje zimę z komendy');

    for (const bad of [['temperatura'], ['temperatura', 'x'], ['temperatura', '90'], ['snieg', '150'], ['pokrywa', '-1'], ['szron', 'x']]) {
        assert.throws(() => run(...bad), `Błędna komenda: /pogoda ${bad.join(' ')}`);
        checks++;
    }

    for (const word of ['temperatura', 'snieg', 'pokrywa', 'szron']) check(command.complete(['']).includes(word) && command.usage.includes(word), `Podpowiedź i opis: ${word}`);

    weather.dispose();

    // Wycie wichury.
    equal(weatherAudioLevels({ speed: 5 }).howl, 0, 'Zwykły wiatr nie wyje');
    check(weatherAudioLevels({ speed: 9, gust: 1 }).howl > weatherAudioLevels({ speed: 7.5, gust: 1 }).howl && weatherAudioLevels({ speed: 7.5, gust: 1 }).howl > 0, 'Wichura wyje tym głośniej, im mocniej wieje');
    check(weatherAudioLevels({ speed: 20, gust: 1 }).howl <= WEATHER_AUDIO.howl, 'Wycie ma górną granicę');
    check(weatherAudioLevels({ speed: 10, gust: 1, cover: 1 }).howl < weatherAudioLevels({ speed: 10, gust: 1 }).howl * 0.5, 'W schronieniu wycie cichnie');
    check(weatherAudioLevels({ speed: 10, gust: 1 }).howlTone > weatherAudioLevels({ speed: 10, gust: 0 }).howlTone, 'Wycie faluje z porywami');
    check(source('src/audio/WeatherAudio.js').includes("howlBand: filter('bandpass', 430, 7)"), 'Wycie: wąski filtr na szumie wiatru');
}


// --- 7. Shadery -----------------------------------------------------------------------

{
    for (const [name, glsl] of [['chmur', CLOUD_LAYERS_GLSL], ['cieni chmur', CLOUD_SHADOW_GLSL]]) {
        check(!glsl.includes('`') && !glsl.includes('undefined') && !glsl.includes('NaN'), `Shader ${name} bez śmieci z szablonu`);
        equal((glsl.match(/{/g) ?? []).length, (glsl.match(/}/g) ?? []).length, `Shader ${name}: nawiasy`);
    }

    check(CLOUD_SHADOW_GLSL.includes('float snowCoverAt(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('if (uSnow.x <= 0.0)'), 'Bez śniegu shader nic nie liczy');
    check(CLOUD_SHADOW_GLSL.includes('if (uSnow.w >= 0.0)') && CLOUD_SHADOW_GLSL.includes('uSnow.y * max(0.0, worldPosition.y - uSnow.z)'), 'Pokrywa: komenda i spadek temperatury z wysokością');
    check(CLOUD_SHADOW_GLSL.includes('float snowPixel(vec3 worldPosition, float cover)') && CLOUD_SHADOW_GLSL.includes('float frostAt(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('if (uFrost < -1.5)'), 'Płaty śniegu i szron');

    const blocks = source('src/rendering/BlockRenderData.js');

    check(blocks.includes('if (uSnow.x > 0.0 && vWorldNormal.y > 0.9)') && blocks.includes('snowCoverAt(vWorldPosition) * smoothstep(0.45, 0.9, blockSky)'), 'Śnieg leży na płaskich wierzchach pod gołym niebem');
    check(blocks.includes('float blockWet = (1.0 - blockSnow) * groundWetness(vWorldPosition)'), 'Śnieg zakrywa mokrą ziemię i kałuże');
    check(blocks.indexOf('float blockSnow = 0.0;') > blocks.indexOf('#ifndef NO_WET_GROUND') && blocks.indexOf('float blockSnow = 0.0;') < blocks.indexOf('float blockWet ='), 'Śnieg liczy się przed mokrą ziemią i nie dotyczy wody');
    check(blocks.includes('float grassFace = step(0.002, abs(vTint.r - 1.0) + abs(vTint.g - 1.0) + abs(vTint.b - 1.0))') &&
        blocks.includes('step(abs(vWorldNormal.y), 0.5) * step(0.5, tintMask) * step(0.4, fract(vWorldPosition.y - 0.001))') &&
        blocks.includes('if (uSnow.x > 0.0 && grassFace > 0.5)') && blocks.includes('uFrost > -1.5 && grassFace > 0.5') &&
        blocks.includes('vec3 snowEdge = vec3(vWorldPosition.x - vWorldNormal.x * 0.03, ceil(vWorldPosition.y - 0.001), vWorldPosition.z - vWorldNormal.z * 0.03)') &&
        blocks.includes('snowPixel(snowEdge, sideCover) > 0.5'), 'Boki bloków trawy: zielony pasek bieleje tym samym płatem co wierzch nad nim');
    check(source('src/world/FarTerrain.js').includes('farSnow * mix(0.25, 0.94, farUp)'), 'Daleki teren: ściany stopni też trochę bieleją');
    check(blocks.includes('#ifdef SNOW_ON_PLANT') && blocks.includes('#define NO_WET_GROUND\\n#define SNOW_ON_PLANT'), 'Rośliny bieleją pod śniegiem i szronem');
    check((blocks.match(/#define SNOW_ON_PLANT/g) ?? []).length === 1, 'Tylko rośliny (nie liście i woda) mają własny śnieg');
    check(blocks.includes('frostAt(vWorldPosition) * smoothstep(0.45, 0.9, blockSky)'), 'Szron na wierzchach bloków');

    const far = source('src/world/FarTerrain.js');

    check(far.includes('float farSnow = snowCoverAt(vFarWorld);') && far.includes('normalize(vNormal)') && far.includes('float farWater = step('), 'Daleki teren: śnieg bez stromych ścian i wody');
    check(far.indexOf('snowCoverAt(vFarWorld)') > far.indexOf("'#include <color_fragment>'"), 'Daleki śnieg zmienia kolor terenu przed oświetleniem');

    check(source('src/sky/layers/Clouds.js').includes('this.weather?.snowShare'), 'Zasłona opadu jest jasna, gdy pada śnieg');
}


// --- 8. Ustawienie, osiągnięcia, mapa, wpięcie w grę -----------------------------------

{
    equal(SETTINGS_DEFAULTS.snowCover, true, 'Ustawienie: pokrywa śnieżna włączona');
    check(source('src/ui/settingsLayout.js').includes("'snowCover',") && source('src/ui/texts.js').includes('snowCover: (on)') && source('src/commands/settingsCommands.js').includes("snieg: 'snowCover'"), 'Pokrywa śnieżna w menu i w /ustaw');

    const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const stub = (extra = {}) => ({
        weather: { ready: true, field: { forced: [], tempOverride: null }, local: emptySample(), wind: { speed: 2 }, snowCover: 0, frost: 0, coverOverride: null, frostOverride: null, ...extra.weather },
        rainOverride: null, shelterCover: 0, snowNow: 0, ...extra.game
    });

    for (const id of ['first_snow', 'blizzard', 'white_world', 'hoarfrost']) {
        check(byId[id] && byId[id].title && byId[id].task && byId[id].comment && typeof byId[id].check === 'function', `Osiągnięcie ${id}`);
    }

    check(byId.first_snow.check(stub({ game: { snowNow: 0.3 } })) && !byId.first_snow.check(stub()), 'Pierwszy śnieg: pada śnieg');
    check(!byId.first_snow.check(stub({ game: { snowNow: 0.3, rainOverride: 0.5 } })) && !byId.first_snow.check(stub({ game: { snowNow: 0.3 }, weather: { field: { forced: [], tempOverride: -3 } } })), 'Pierwszy śnieg: nie z komendy');
    check(byId.blizzard.check(stub({ game: { snowNow: 0.6 }, weather: { wind: { speed: 7 } } })) && !byId.blizzard.check(stub({ game: { snowNow: 0.6 } })) && !byId.blizzard.check(stub({ weather: { wind: { speed: 9 } } })), 'Zadymka: gęsty śnieg i silny wiatr');
    check(byId.white_world.check(stub({ weather: { snowCover: 1 } })) && !byId.white_world.check(stub({ weather: { snowCover: 1, coverOverride: 1 } })) &&
        !byId.white_world.check(stub({ weather: { snowCover: 1 }, game: { shelterCover: 1 } })) && !byId.white_world.check(stub({ weather: { snowCover: 0.4 } })), 'Biało, bielutko: pełna pokrywa pod gołym niebem, nie z komendy');
    check(byId.hoarfrost.check(stub({ weather: { frost: 0.8 } })) && !byId.hoarfrost.check(stub({ weather: { frost: 0.8, frostOverride: 1 } })) && !byId.hoarfrost.check(stub({ weather: { frost: 0.2 } })), 'Srebrny poranek: szron, nie z komendy');

    const map = source('src/ui/TerrainMap.js');

    check(map.includes('snowCover(0, sample.temp, sample.tempSlow)') && map.includes('snowShare(sample.temp) > 0.5 ? C.snowfall : C.rain') && map.includes("'pokrywa śnieżna'"), 'Mapa pogody: pokrywa śnieżna i opad śniegu');

    const gameSource = source('src/game/Game.js');

    check(gameSource.includes('warmth: weatherWarmth(this.world.generator)') && source('src/world/terrain/RealisticGenerator.js').includes('temperatureAt(x, z) {'), 'Temperatura bierze klimat z generatora terenu');
    check(gameSource.includes('return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;'), 'Ciepło klimatu zmienia się płynnie między węzłami (bez schodków na śniegu)');
    check(gameSource.includes('this.weather.update(this.time.days, dt, this.camera.position.x, this.camera.position.z, this.camera.position.y)'), 'Pogoda zna wysokość gracza');
    check(gameSource.includes('const rain = fall * (1 - weather.snowShare);') && gameSource.includes('this.rainStreaks.update(dt, this.camera, rain, drizzle'), 'Krople deszczu tylko dla ciekłej części opadu');
    check(gameSource.includes('this.snowFall.update(dt, snow, smoothstep(-7, 0.5, cold), this.weather.wind, weather.snowCover, this.sky.state)'), 'Płatki dostają natężenie, rodzaj śniegu, wiatr i pokrywę');
    check(gameSource.includes('weather.addPrecipitation(this.camera.position.x, this.camera.position.z, fall, dt / DAY_SECONDS)'), 'Opad z komendy zasypuje ziemię');
    check(gameSource.includes('leafSeasonUniforms.uLeafSnow.value = this.weather.snowSurfaces ? this.weather.snowCover : 0'), 'Śnieg na liściach leży wtedy, gdy leży na ziemi');
    check(gameSource.includes("this.sounds.play('step_snow', { volume })") && gameSource.includes('this.rainStreaks.shelter.roof(feet.x, feet.z) <= feet.y + 0.6'), 'Kroki po śniegu skrzypią (pod gołym niebem)');
    check(gameSource.includes("this.weather.snowSurfaces = settings.get('snowCover')"), 'Ustawienie trafia do pogody');
    check(gameSource.includes('2.2 * (this.snowNow ?? 0) + 0.7 * (this.snowFall?.driftLevel ?? 0)'), 'Śnieg i zamieć ograniczają widoczność');
    check(gameSource.includes('Temperatura: ${Math.round(this.weather.temperature)}°C'), 'Ekran F3 pokazuje temperaturę');
    check(gameSource.includes('this.snowFall.dispose();'), 'Sprzątanie przy wyjściu ze świata');

    check(source('tools/fixtures/calm-weather.js').includes('snowCover: false'), 'Testy bez pogody wyłączają też śnieg');
    check(source('tools/render_check_weather.js').includes('cloudUniforms.uSnow.value.x'), 'Testy materiałów wyłączają śnieg na swój czas');
}

console.log(`OK: zima - ${checks} sprawdzeń (temperatura, szron, świeży opad, pokrywa śnieżna, płatki i zamieć, krupa, opisy, komendy, wycie wiatru, shadery, ustawienie, osiągnięcia, mapa).`);
