// ------------------------------------------------------------
// SPRAWDZENIE BURZ (1.13.0) - pogoda, część 3
//
// - losowanie wyładowań: tylko tam, gdzie pole pogody ma burzę; to samo
//   wyładowanie bez względu na to, kto i skąd pyta; częściej w środku
//   burzy; część w ziemię, reszta w chmurze; rzadziej zimą,
// - grad w polu pogody: tylko w samym środku najsilniejszych burz,
// - błysk: najwyżej trzy impulsy, nie częściej niż co 0,11 s; tryb
//   łagodny bez migotania; tryb wyłączony nie oświetla terenu ani nieba,
// - burza w grze (Thunderstorm): każde wyładowanie zaczyna się raz,
//   światło najsilniejszego błysku, poświata w chmurach, przeskok czasu,
//   wyładowanie z komendy, znaczniki na mapę,
// - kanał pioruna (LightningBolts): łamana od chmury do ziemi, odnogi,
//   bufor odcinków, dwa przebiegi rysowania,
// - grzmot: opóźnienie z odległości, z bliska trzask, z daleka niski
//   pomruk, schronienie tłumi; kolejka głosów na atrapie Web Audio,
// - grad: kulki i odbicia, tryb ziemniaka, stukot, nalot na ziemi,
// - shadery, komendy, ustawienie błysków, osiągnięcia, wpięcie w grę.
//
// Uruchomienie: node tools/sprawdz_burze.mjs
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
const { Weather } = await import('../src/weather/Weather.js');
const { Thunderstorm, THUNDER, strikesInSlot, strikePulses, strikeDuration, flashLevel } = await import('../src/weather/Thunderstorm.js');
const { cloudUniforms, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL } = await import('../src/weather/cloudShader.js');
const TEXT = await import('../src/weather/weatherText.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');
const { LightningBolts, LIGHTNING, buildBolt, boltTop } = await import('../src/rendering/LightningBolts.js');
const { RainStreaks } = await import('../src/rendering/RainStreaks.js');
const { Hail, HAIL } = await import('../src/rendering/Hail.js');
const { ThunderAudio, THUNDER_AUDIO, thunderShape, thunderCurve } = await import('../src/audio/ThunderAudio.js');
const { weatherAudioLevels, WEATHER_AUDIO } = await import('../src/audio/WeatherAudio.js');
const { meteorLightUniforms, METEOR_LIGHT_GLSL } = await import('../src/rendering/meteorLight.js');
const { skyUniforms, SKY_COLOR_GLSL } = await import('../src/sky/skyShader.js');
const { SEA_LEVEL } = await import('../src/config.js');
const { YEAR_DAYS, SEASON_DAYS, nextSeasonStart } = await import('../src/sky/Seasons.js');
const { SETTINGS_DEFAULTS, SETTINGS_CHOICES } = await import('../src/settings/Settings.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const near = (actual, expected, tolerance, message) => check(Math.abs(actual - expected) <= tolerance, `${message} (${actual} zamiast ${expected})`);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Początek wiosny wyrównany do północy (pora dnia = część ułamkowa).
const spring = Math.ceil(nextSeasonStart(0, 0) + YEAR_DAYS);
const seasonStart = (index) => spring + index * SEASON_DAYS;

// Letnie popołudnie - pora burz.
const afternoon = seasonStart(1) + 3.62;
const slotOf = (days) => Math.floor(days * DAY_SECONDS / THUNDER.slot);


// --- 1. Losowanie wyładowań ------------------------------------------------------

{
    const field = new WeatherField('lepidolit');
    const sample = emptySample();

    field.force('wyz', 0, 0, afternoon, { stay: true });

    let clear = 0;

    for (let s = 0; s < 60; s++) clear += strikesInSlot(field, slotOf(afternoon) + s, 0, 0, 3000).length;

    equal(clear, 0, 'Pod wyżem nie błyska');

    field.clearForced();
    field.force('burze', 0, 0, afternoon, { stay: true });

    check(field.sample(0, 0, afternoon, sample).storm > THUNDER.full, 'Burza z komendy ma główną komórkę nad środkiem');
    check(sample.hail === 0, 'Burza z komendy sama nie sypie gradem bez przerwy');

    const all = [];
    const perSlot = [];

    for (let s = 0; s < 240; s++) {
        const found = strikesInSlot(field, slotOf(afternoon) + s, 0, 0);
        perSlot.push(found);
        all.push(...found);
    }

    check(all.length >= 40 && all.length <= 200, `Burza błyska co kilka sekund (${all.length} wyładowań w 4 minuty)`);

    const inner = all.filter((strike) => Math.hypot(strike.x, strike.z) < 500).length;

    check(inner >= 8 && inner <= 60, `W środku burzy błyska kilka razy na minutę (${inner})`);

    for (const strike of all) {

        const slot = Number(strike.key.split(',')[2]);
        const storm = field.sample(strike.x, strike.z, slot * THUNDER.slot / DAY_SECONDS, sample).storm;

        check(storm > THUNDER.from, 'Wyładowanie leży tam, gdzie pole pogody ma burzę');
        near(strike.storm, storm, 1e-9, 'Wyładowanie pamięta siłę burzy w swoim miejscu');
        check(strike.time >= slot * THUNDER.slot && strike.time < (slot + 1) * THUNDER.slot, 'Wyładowanie zaczyna się w swoim odcinku czasu');
        check(strike.power >= 0.55 && strike.power <= 1, 'Siła wyładowania w zakresie');
        check(Math.hypot(strike.x, strike.z) <= THUNDER.range, 'Wyładowanie w zasięgu pytania');
        check(Number.isInteger(strike.seed) && strike.seed >= 0, 'Ziarno kształtu to liczba całkowita');

    }

    const ground = all.filter((strike) => strike.ground).length / all.length;

    check(ground > 0.2 && ground < 0.6, `Co trzecie-czwarte wyładowanie bije w ziemię (${ground.toFixed(2)})`);

    // To samo wyładowanie bez względu na to, skąd i jak szeroko się pyta.
    let compared = 0;

    for (let s = 0; s < 240; s += 7) {

        const here = perSlot[s];
        const again = strikesInSlot(field, slotOf(afternoon) + s, 0, 0);
        const moved = strikesInSlot(field, slotOf(afternoon) + s, 900, -700, 5000);

        equal(again.map((strike) => [strike.key, strike.x, strike.z, strike.time, strike.ground, strike.seed]),
            here.map((strike) => [strike.key, strike.x, strike.z, strike.time, strike.ground, strike.seed]), 'Losowanie jest powtarzalne');

        for (const strike of here) {

            if (Math.hypot(strike.x - 900, strike.z + 700) > 5000) continue;

            const twin = moved.find((other) => other.key === strike.key);

            check(Boolean(twin) && twin.x === strike.x && twin.z === strike.z && twin.time === strike.time &&
                twin.ground === strike.ground && twin.seed === strike.seed && twin.power === strike.power,
            'Inny gracz widzi to samo wyładowanie w tym samym miejscu');
            compared++;

        }

    }

    check(compared >= 3, 'Porównano wyładowania widziane z dwóch miejsc');

    // Inny świat - inne wyładowania.
    const other = new WeatherField('ametyst');

    other.force('burze', 0, 0, afternoon, { stay: true });

    const elsewhere = [];

    for (let s = 0; s < 240; s++) elsewhere.push(...strikesInSlot(other, slotOf(afternoon) + s, 0, 0));

    check(elsewhere.length > 20 && elsewhere[0].key !== all[0].key, 'W innym świecie błyska gdzie indziej i kiedy indziej');

    // Pory roku: burze są sprawą wiosny i lata (środek każdej pory,
    // trzy światy, po kilka dób).
    const counts = [0, 0, 0, 0];

    for (const seed of ['lepidolit', 'ametyst', 'burza']) {

        const natural = new WeatherField(seed);

        for (let season = 0; season < 4; season++) {
            for (let s = 0; s < 0.3 * SEASON_DAYS * DAY_SECONDS; s += 3) {
                counts[season] += strikesInSlot(natural, slotOf(seasonStart(season + 0.35)) + s, 0, 0, 2000).length;
            }
        }

    }

    check(counts[1] > 0 && counts[0] > 0 && counts[1] + counts[0] > 3 * (counts[3] + counts[2] + 1), `Wiosną i latem błyska dużo częściej niż jesienią i zimą (${counts.join(', ')})`);
}


// --- 2. Grad w polu pogody --------------------------------------------------------

{
    const field = new WeatherField('lepidolit');
    const sample = emptySample();

    let hail = 0;
    let storms = 0;

    for (let k = 0; k < 6000; k++) {

        const x = (k * 7919) % 60000 - 30000;
        const z = (k * 104729) % 60000 - 30000;

        field.sample(x, z, seasonStart(1) + 2 + (k % 400) / 100, sample);

        check(sample.hail >= 0 && sample.hail <= 1, 'Grad w zakresie 0-1');

        if (sample.hail > 0) {
            check(sample.storm > 0.86, 'Grad tylko w samym środku silnej burzy');
            hail++;
        }

        if (sample.storm > 0.3) storms++;

    }

    check(storms > 0 && hail < storms * 0.5, `Grad jest dużo rzadszy niż burza (${hail} z ${storms})`);

    equal(TEXT.skyKey({ ...emptySample(), storm: 1, rain: 1, hail: 0.6 }), 'grad', 'Opis: burza z gradem');
    equal(TEXT.skyKey({ ...emptySample(), storm: 1, rain: 1, hail: 0.1 }), 'burza', 'Opis: burza bez gradu');
    equal(TEXT.SKY_NAMES.grad, 'burza z gradem', 'Nazwa nieba z gradem');
}


// --- 3. Błysk ---------------------------------------------------------------------

{
    let ground = 0;
    let cloud = 0;

    for (let seed = 1; seed < 400; seed++) {

        for (const toGround of [true, false]) {

            const shape = strikePulses(seed * 7907, toGround);
            const strike = { ...shape, power: 1 };

            check(shape.pulses.length >= 1 && shape.pulses.length <= 3, 'Najwyżej trzy błyski w jednym wyładowaniu');
            check(shape.pulses[0].at === 0, 'Pierwszy błysk od razu');

            for (let k = 1; k < shape.pulses.length; k++) {
                check(shape.pulses[k].at - shape.pulses[k - 1].at >= 0.11 - 1e-9, 'Błyski nie częściej niż co 0,11 s');
            }

            check(shape.duration > shape.pulses.at(-1).at && shape.duration < 1.6, 'Wyładowanie trwa ułamek sekundy');

            let peak = 0;
            let softPeak = 0;
            let softStep = 0;
            let previous = 0;

            for (let age = -0.05; age < shape.duration + 1; age += 0.004) {

                const level = flashLevel(strike, age);
                const soft = flashLevel(strike, age, 'lagodne');

                check(level >= 0 && level <= 1 && soft >= 0 && soft <= 0.5 + 1e-9, 'Poziom błysku w zakresie');

                if (age < 0) check(level === 0 && soft === 0, 'Przed wyładowaniem ciemno');

                peak = Math.max(peak, level);
                softPeak = Math.max(softPeak, soft);
                softStep = Math.max(softStep, Math.abs(soft - previous));
                previous = soft;

            }

            check(peak > 0.4, 'Błysk jest wyraźny');
            check(softPeak > 0.3 && softStep < 0.03, 'Tryb łagodny: jedno powolne rozjaśnienie, bez migotania');
            equal(flashLevel(strike, shape.duration + 0.01), 0, 'Po wyładowaniu ciemno');
            equal(flashLevel(strike, strikeDuration(strike, 'lagodne') + 0.01, 'lagodne'), 0, 'Tryb łagodny też gaśnie');
            check(strikeDuration(strike, 'lagodne') > strikeDuration(strike, 'pelne'), 'Łagodny błysk gaśnie dłużej');

            if (toGround) ground += shape.pulses.length; else cloud += shape.pulses.length;

        }

    }

    check(ground > 400 && cloud > 800, 'Bywa po kilka błysków w jednym wyładowaniu');

    const sharp = strikePulses(12345, true);
    const dull = strikePulses(12345, false);

    check(sharp.pulses[0].decay < dull.pulses[0].decay, 'Piorun do ziemi błyska ostrzej niż wyładowanie w chmurze');
}


// --- 4. Burza w grze --------------------------------------------------------------

{
    const weather = new Weather('lepidolit');

    weather.field.force('burze', 0, 0, afternoon, { stay: true });
    weather.reset();
    weather.update(afternoon, 0.016, 0, 0);

    check(weather.map.maxStorm > 0.7, 'Mapa pogody zna największą burzę w okolicy');
    equal(cloudUniforms.uStorm.value.x, 1, 'Burza w okolicy: chmury ciemnieją');

    const grounds = [];
    const thunder = new Thunderstorm(weather, { groundAt: (x, z) => { grounds.push([x, z]); return 70; } });
    const eye = new THREE.Vector3(0, 72, 0);

    equal(thunder.mode, 'pelne', 'Domyślnie pełne błyski');

    const begun = new Map();

    let lit = 0;
    let glowing = 0;
    let skyLit = 0;
    let maxPending = 0;

    for (let frame = 0; frame < 60 * 90; frame++) {

        const days = afternoon + frame / 60 / DAY_SECONDS;

        thunder.update(days, eye);

        for (const strike of thunder.started) {

            check(!begun.has(strike.key), 'Każde wyładowanie zaczyna się raz');
            begun.set(strike.key, strike);
            check(thunder.now >= strike.time && thunder.now - strike.time < 0.05, 'Wyładowanie zaczyna się w swojej chwili');
            check(Number.isFinite(strike.distance) && strike.distance >= 0, 'Wyładowanie zna odległość od gracza');

            if (strike.ground) {
                near(strike.distance, Math.hypot(strike.x, strike.z), 1e-6, 'Piorun do ziemi: odległość w poziomie');
                equal(strike.groundY, 70, 'Piorun bije w ziemię na jej wysokości');
                near(strike.topY, weather.base + 12, 1e-9, 'Kanał zaczyna się w podstawie chmur');
            }
            else {
                check(strike.distance >= weather.base + 40 - eye.y - 1e-6, 'Błysk w chmurze: odległość liczy wysokość chmur');
            }

        }

        maxPending = Math.max(maxPending, thunder.pending.length);

        const flashes = cloudUniforms.uCloudFlash.value;

        if (thunder.light.level > 0.002) {
            lit++;
            check(thunder.light.range === (thunder.light.ground ? 420 : 700), 'Zasięg światła błysku');
            check(thunder.order.length > 0 && flashes[0].w > 0 && cloudUniforms.uStorm.value.y === 1, 'Gdy teren błyska, chmury też');
        }

        if (flashes[0].w > 0) {
            glowing++;
            check(flashes[0].w >= flashes[1].w && flashes[1].w >= flashes[2].w, 'Błyski w chmurach od najjaśniejszego');
            check(flashes[0].z > 100, 'Poświata ma promień');
        }
        else {
            equal(cloudUniforms.uStorm.value.y, 0, 'Bez błysku shader chmur nic nie liczy');
        }

        if (thunder.sky > 0) skyLit++;

        check(thunder.sky >= 0 && thunder.sky <= 1, 'Rozjaśnienie nieba w zakresie');

    }

    check(begun.size >= 15, `W półtorej minuty burzy zaczęło się kilkanaście wyładowań (${begun.size})`);
    check(lit > 20 && glowing >= lit && skyLit > 20, 'Błyski oświetlały teren, chmury i niebo');
    check(maxPending < 12, 'Skończone wyładowania są sprzątane');
    check(grounds.length === [...begun.values()].filter((strike) => strike.ground).length, 'Wysokość ziemi liczona tylko dla piorunów do ziemi, raz');
    check(thunder.lastGround && thunder.lastGround.natural, 'Ostatni piorun do ziemi zapamiętany');
    check(thunder.recent.length > 0 && thunder.recent.every((mark) => thunder.now - mark.time <= 60), 'Znaczniki na mapę: ostatnia minuta');

    // Te same wyładowania, które daje samo losowanie.
    const expected = new Set();

    for (let s = 1; s <= 88; s++) {
        for (const strike of strikesInSlot(weather.field, slotOf(afternoon) + s, 0, 0)) expected.add(strike.key);
    }

    check([...expected].every((key) => begun.has(key)), 'Gra pokazuje dokładnie te wyładowania, które wynikają z losowania');

    // Tryby błysków.
    const forcedAt = (mode, ground = true) => {

        thunder.mode = mode;
        thunder.pending.length = 0;
        thunder.update(afternoon + 0.2, eye);

        const strike = thunder.force(100, 0, { ground, delay: 0 });

        thunder.update(afternoon + 0.2 + 0.03 / DAY_SECONDS, eye);

        return strike;

    };

    weather.field.clearForced();
    weather.field.force('wyz', 0, 0, afternoon, { stay: true });
    weather.reset();
    weather.update(afternoon + 0.2, 0.016, 0, 0);
    equal(weather.field.sample(0, 0, afternoon + 0.2).storm, 0, 'Pod wyżem nad graczem nie ma burzy');

    const full = forcedAt('pelne');
    const fullLight = thunder.light.level;

    check(full.forced && full.begun && thunder.started.includes(full), 'Piorun z komendy zaczyna się mimo czystego nieba');
    check(fullLight > 0.3 && thunder.light.ground && thunder.sky > 0.2, 'Pełny błysk oświetla teren i niebo');
    near(thunder.light.x, 100, 1e-9, 'Światło stoi w miejscu pioruna');
    check(thunder.light.y > 70 && thunder.light.y < weather.base + 12, 'Światło pioruna - w połowie kanału');
    check(thunder.lastGround.natural === false && thunder.lastGround.distance === 100, 'Piorun z komendy nie liczy się jako naturalny');

    const flashFull = cloudUniforms.uCloudFlash.value[0].w;

    forcedAt('lagodne');
    check(thunder.light.level > 0 && thunder.light.level < fullLight, 'Łagodny błysk jest słabszy');

    forcedAt('brak');
    equal([thunder.light.level, thunder.sky], [0, 0], 'Błyski wyłączone: teren i niebo nie błyskają');
    check(cloudUniforms.uCloudFlash.value[0].w > 0 && cloudUniforms.uCloudFlash.value[0].w < flashFull, 'Błyski wyłączone: zostaje łagodna poświata w chmurze');
    check(thunder.order.length === 1 && thunder.order[0].level > 0, 'Błyski wyłączone: kanał pioruna zostaje');

    const inCloud = forcedAt('pelne', false);

    check(!inCloud.ground && !thunder.light.ground && thunder.light.y === weather.base + 40, 'Błysk w chmurze świeci z jej wysokości');
    check(inCloud.glow >= 340 && inCloud.glow <= 660 && full.glow === 300, 'Wyładowanie w chmurze rozświetla ją szerzej niż piorun');

    // Przeskok czasu (sen, /czas): stare wyładowania znikają.
    weather.field.clearForced();
    weather.field.force('burze', 0, 0, afternoon, { stay: true });
    weather.reset();
    weather.update(afternoon, 0.016, 0, 0);

    thunder.pending.length = 0;

    for (let frame = 0; frame < 600; frame++) thunder.update(afternoon + frame / 60 / DAY_SECONDS, eye);

    thunder.update(afternoon + 0.5, eye);
    check(thunder.pending.every((strike) => Math.abs(strike.time - thunder.now) < 3), 'Po przeskoku czasu nie zostają stare wyładowania');

    thunder.update(afternoon + 0.1, eye);
    check(thunder.pending.every((strike) => Math.abs(strike.time - thunder.now) < 3), 'Po cofnięciu czasu też');

    // Wyłączona (testy porównujące kolory): nic nie błyska.
    thunder.force(50, 0, { delay: 0 });
    thunder.enabled = false;
    thunder.update(afternoon + 0.1 + 1 / DAY_SECONDS, eye);
    check(thunder.pending.length === 0 && thunder.order.length === 0 && thunder.light.level === 0 && thunder.sky === 0 && thunder.started.length === 0, 'Wyłączona burza nie błyska');
    check(source('tools/fixtures/calm-weather.js').includes('game.thunder.enabled = false'), 'Testy bez pogody wyłączają też burzę');
    thunder.enabled = true;

    // Bez burzy w okolicy losowanie nie pracuje.
    weather.map.maxStorm = 0;
    thunder.pending.length = 0;

    for (let frame = 0; frame < 300; frame++) thunder.update(afternoon + 0.1 + frame / 60 / DAY_SECONDS, eye);

    equal(thunder.pending.length, 0, 'Bez burzy na mapie nic się nie losuje');

    thunder.force(0, 0, {});
    thunder.dispose();
    check(thunder.pending.length === 0 && cloudUniforms.uCloudFlash.value.every((flash) => flash.w === 0) && cloudUniforms.uStorm.value.y === 0, 'Sprzątanie gasi błyski');

    weather.dispose();
    equal(cloudUniforms.uStorm.value.x, 0, 'Po wyjściu ze świata chmury nie są burzowe');
}


// --- 5. Kanał pioruna -------------------------------------------------------------

{
    const top = { x: 30, y: 230, z: -20 };
    const ground = { x: 0, y: 64, z: 0 };

    for (let seed = 1; seed < 300; seed++) {

        const segments = [];
        const count = buildBolt(seed * 104729, top, ground, (...values) => segments.push(values));

        equal(count, segments.length, 'Liczba odcinków zgodna');
        check(count >= 10 && count <= LIGHTNING.segments, `Piorun ma kilkanaście-kilkadziesiąt odcinków (${count})`);

        const main = segments.filter((segment) => segment[6] === 1);

        equal(main[0].slice(0, 3), [top.x, top.y, top.z], 'Kanał zaczyna się w chmurze');
        equal(main.at(-1).slice(3, 6), [ground.x, ground.y, ground.z], 'Kanał kończy się dokładnie w miejscu uderzenia');

        for (let k = 1; k < main.length; k++) {
            equal(main[k].slice(0, 3), main[k - 1].slice(3, 6), 'Kanał jest ciągły');
            check(main[k][4] < main[k][1], 'Kanał biegnie w dół');
        }

        for (const segment of segments) {

            check(segment.every(Number.isFinite), 'Odcinki są liczbami');
            check(segment[1] <= top.y + 1e-9 && segment[4] >= ground.y - 1e-9, 'Odcinki między chmurą a ziemią');
            check(Math.hypot(segment[3] - ground.x, segment[5] - ground.z) < 260, 'Piorun nie rozbiega się na boki bez końca');

        }

        const branches = segments.filter((segment) => segment[6] < 1);

        check(branches.length >= 6 && branches.every((segment) => segment[7] < 1 && segment[4] >= ground.y + 2 - 1e-9), 'Odnogi są cieńsze, ciemniejsze i gasną w powietrzu');

    }

    const collect = (seed) => { const list = []; buildBolt(seed, top, ground, (...values) => list.push(values)); return list; };

    equal(collect(777), collect(777), 'Ten sam piorun ma zawsze ten sam kształt');
    assert.notDeepEqual(collect(777), collect(778));
    checks++;

    equal(buildBolt(5, top, ground, () => {}, 7), 7, 'Limit odcinków');

    const strike = { x: 10, z: 20, topY: 222, groundY: 70, seed: 4242 };
    const start = boltTop(strike);

    check(start.y === 222 && Math.abs(start.x - 10) <= LIGHTNING.spread && Math.abs(start.z - 20) <= LIGHTNING.spread && (start.x !== 10 || start.z !== 20), 'Kanał wychodzi z chmury trochę obok miejsca uderzenia');

    // Siatka.
    const scene = new THREE.Scene();
    const bolts = new LightningBolts(scene);
    const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 500);

    check(scene.children.includes(bolts.near) && !bolts.near.visible && bolts.geometry.instanceCount === 0, 'Bez burzy nic się nie rysuje');

    const rendered = [];
    const renderer = { render: (drawn, with_) => rendered.push([drawn, with_]) };

    bolts.renderFar(renderer, camera, null);
    equal(rendered.length, 0, 'Daleki przebieg bez pioruna nie rysuje');

    const one = { key: 'a', ground: true, level: 0.8, ...strike };
    const cloudOnly = { key: 'c', ground: false, level: 1, x: 0, z: 0, seed: 1 };

    bolts.update([cloudOnly, one], camera, 0.003);

    check(bolts.near.visible && bolts.active === 1 && bolts.slots[0] === 'a', 'Piorun do ziemi zajmuje miejsce; błysk w chmurze nie ma kanału');
    equal(bolts.geometry.instanceCount, LIGHTNING.segments, 'Rysuje się jedno miejsce bufora');
    equal(bolts.levels[0], 0.8, 'Jasność kanału z poziomu błysku');
    check(bolts.stats().segments >= 10 && bolts.stats().draws === 2, 'Dwa polecenia rysowania na czas błysku');
    near(bolts.uniforms.uBoltSize.value.y, 0.003 * LIGHTNING.pixels, 1e-12, 'Najmniejsza szerokość w pikselach');
    equal(bolts.farMaterial.uniforms.uBoltClip.value.x, 500 * 0.98, 'Daleki przebieg zaczyna się tam, gdzie kończy się bliski świat');
    check(bolts.nearMaterial.uniforms.uBoltFar.value === 0 && bolts.farMaterial.uniforms.uBoltFar.value === 1, 'Dwa materiały: bliski i daleki');

    const buffer = bolts.start.array.slice(0, 3);
    const expectedTop = boltTop(one);

    near(buffer[0], expectedTop.x, 1e-3, 'Pierwszy odcinek w buforze zaczyna się w chmurze');
    equal(bolts.shape.array[2], 0, 'Odcinki pamiętają numer pioruna');

    bolts.renderFar(renderer, camera, null);
    check(rendered.length === 1 && rendered[0][0] === bolts.farScene && rendered[0][1] === bolts.farCamera, 'Bez dalekiego terenu - własna kamera');
    check(bolts.farCamera.near >= 250 && bolts.farCamera.far >= 10000, 'Własna kamera sięga daleko');

    const farTerrain = { active: true, shown: new Set([1]), camera: new THREE.PerspectiveCamera() };

    bolts.renderFar(renderer, camera, farTerrain);
    check(rendered[1][1] === farTerrain.camera, 'Z dalekim terenem - jego kamera (góry zasłaniają piorun)');

    // Drugi piorun, potem pierwszy gaśnie.
    const two = { key: 'b', ground: true, level: 0.5, x: 300, z: 0, topY: 222, groundY: 60, seed: 99 };

    bolts.update([one, two], camera, 0.003);
    check(bolts.active === 2 && bolts.slots[1] === 'b' && bolts.geometry.instanceCount === 2 * LIGHTNING.segments, 'Dwa pioruny naraz');
    equal(bolts.shape.array[LIGHTNING.segments * 3 + 2], 1, 'Drugi piorun ma swój numer');

    bolts.update([two], camera, 0.003);
    check(bolts.slots[0] === null && bolts.slots[1] === 'b' && bolts.levels[0] === 0 && bolts.active === 1, 'Zgasły piorun zwalnia miejsce');

    bolts.update([], camera, 0.003);
    check(!bolts.near.visible && bolts.active === 0 && bolts.geometry.instanceCount === 0, 'Po burzy znów nic się nie rysuje');

    // Więcej piorunów niż miejsc.
    bolts.update(Array.from({ length: 7 }, (_, k) => ({ ...two, key: `k${k}`, seed: k })), camera, 0.003);
    equal(bolts.active, LIGHTNING.bolts, 'Najwyżej tyle piorunów naraz, ile jest miejsc');

    bolts.dispose();
    check(!scene.children.includes(bolts.near) && bolts.disposed, 'Sprzątanie zdejmuje siatkę');
    bolts.update([one], camera, 0.003);
    bolts.renderFar(renderer, camera, null);
    equal(rendered.length, 2, 'Po sprzątnięciu nic się nie rysuje');
}


// --- 6. Grzmot ---------------------------------------------------------------------

{
    const close = thunderShape({ distance: 60 });
    const mid = thunderShape({ distance: 1000 });
    const far = thunderShape({ distance: 4000 });

    near(mid.delay, 1000 / 343, 1e-9, 'Kilometr - niecałe trzy sekundy');
    near(far.delay, 4000 / 343, 1e-9, 'Cztery kilometry - prawie dwanaście sekund');
    check(close.delay < 0.2, 'Bliski piorun słychać prawie od razu');
    check(close.gain > mid.gain && mid.gain > far.gain && far.gain > 0, 'Im dalej, tym ciszej');
    check(close.gain <= THUNDER_AUDIO.peak, 'Głośność ma górną granicę');
    check(close.crack > 0.5 && mid.crack === 0 && far.crack === 0, 'Trzask słychać tylko z bliska');
    check(close.cutoff > 2500 && mid.cutoff < 1200 && far.cutoff < 200, 'Z daleka zostaje sam niski pomruk');
    check(far.duration > mid.duration && mid.duration > close.duration && far.attack > close.attack, 'Daleki grzmot narasta wolniej i trwa dłużej');
    equal(thunderShape({ distance: THUNDER.audible }), null, 'Za daleko - cisza');
    equal(thunderShape({ distance: 9000 }), null, 'Dużo za daleko - cisza');
    check(thunderShape({ distance: THUNDER.audible - 50 }).gain < 0.01, 'Na granicy słyszalności grzmot zanika łagodnie');

    const roofed = thunderShape({ distance: 60, cover: 1 });

    check(roofed.gain < close.gain && roofed.crack < close.crack * 0.5 && roofed.cutoff < close.cutoff * 0.6 && roofed.delay === close.delay, 'W schronieniu grzmot jest przytłumiony');
    check(thunderShape({ distance: 500, ground: false }).gain < thunderShape({ distance: 500 }).gain, 'Wyładowanie w chmurze grzmi ciszej');
    check(thunderShape({ distance: 500, power: 0.6 }).gain < thunderShape({ distance: 500, power: 1 }).gain, 'Słabsze wyładowanie - cichszy grzmot');

    let previous = Infinity;

    for (let d = 0; d < THUNDER.audible; d += 50) {
        const shape = thunderShape({ distance: d });
        check(shape.gain <= previous + 1e-12 && shape.gain >= 0 && shape.cutoff > 80, 'Głośność maleje z odległością bez skoków w górę');
        previous = shape.gain;
    }

    for (const shape of [close, mid, far]) {

        const curve = thunderCurve(shape, 4242);

        equal(curve.length, THUNDER_AUDIO.points, 'Przebieg ma stałą liczbę punktów');
        check(curve[0] === 0 && curve.at(-1) === 0, 'Grzmot zaczyna i kończy ciszą');
        check(curve.every((value) => Number.isFinite(value) && value >= 0 && value <= shape.gain + 1e-6), 'Przebieg w zakresie');
        check(Math.max(...curve) > shape.gain * 0.3, 'Grzmot ma swój szczyt');
        assert.notDeepEqual([...curve], [...thunderCurve(shape, 4243)]);
        checks++;

    }

    const peakAt = (shape) => { const curve = thunderCurve(shape, 4242); return curve.indexOf(Math.max(...curve)) / curve.length * shape.duration; };

    check(peakAt(close) < 0.6 && peakAt(far) > peakAt(close), 'Bliski grzmot uderza od razu, daleki się przetacza');

    // Atrapa Web Audio.
    const log = { sources: 0, started: [], stopped: [], curves: [], ramps: 0, disconnected: 0 };
    const param = () => ({ value: 0,
        setValueCurveAtTime(curve, when, duration) { log.curves.push({ when, duration, max: Math.max(...curve) }); },
        setValueAtTime() {}, linearRampToValueAtTime() { log.ramps++; }, exponentialRampToValueAtTime() { log.ramps++; } });
    const node = () => ({ gain: param(), frequency: param(), Q: param(), playbackRate: param(), onended: null,
        connect(next) { return next; }, disconnect() { log.disconnected++; },
        start(when, offset) { log.started.push({ when, offset }); }, stop(when) { log.stopped.push(when); } });
    const context = (time) => ({ sampleRate: 8000, currentTime: time,
        createBuffer: (channels, length) => ({ data: new Float32Array(length), getChannelData() { return this.data; } }),
        createBufferSource: () => { log.sources++; const made = node(); context.last = made; return made; },
        createBiquadFilter: node, createGain: node });

    const game = { sounds: null };
    const audio = new ThunderAudio(game);
    const strike = (distance, extra = {}) => ({ distance, power: 1, ground: true, seed: 31337 + distance, ...extra });

    check(audio.play(strike(300)) !== null && audio.voices.length === 0, 'Bez dźwięku w przeglądarce nic się nie psuje');

    game.sounds = { context: context(10), categories: { world: node() } };

    const shape = audio.play(strike(686));

    near(log.started[0].when, 10 + 2, 1e-9, 'Grzmot zaplanowany po czasie lotu dźwięku (686 bloków - 2 s)');
    check(log.started[0].offset >= 0 && log.started[0].offset < 3, 'Każdy grzmot zaczyna w innym miejscu szumu');
    near(log.curves[0].when, 12, 1e-9, 'Głośność rusza razem z grzmotem');
    near(log.curves[0].duration, shape.duration, 1e-9, 'Przebieg trwa tyle co grzmot');
    near(log.stopped[0], 12 + shape.duration + 0.1, 1e-9, 'Szum zatrzymuje się po grzmocie');
    equal([audio.voices.length, audio.played, log.ramps], [1, 1, 0], 'Daleki grzmot: sam pomruk, bez trzasku');

    audio.play(strike(40));
    check(log.ramps === 2 && audio.voices.length === 2, 'Bliski grzmot ma trzask');

    equal(audio.play(strike(8000)), null, 'Za daleko - nic się nie planuje');
    equal(log.sources, 2, 'Niesłyszalny grzmot nie tworzy dźwięku');

    // Skończony grzmot zwalnia miejsce.
    const first = audio.voices[0];

    first.nodes[0].onended();
    check(audio.voices.length === 1 && log.disconnected >= 3, 'Skończony grzmot sprząta po sobie');

    // Kolejka: gdy brak miejsc, cichszy od wszystkich odpada, głośniejszy wchodzi.
    for (let k = 0; k < 12; k++) audio.play(strike(900 + k));

    equal(audio.voices.length, THUNDER_AUDIO.voices, 'Najwyżej tyle grzmotów naraz, ile jest głosów');

    const before = log.sources;

    audio.play(strike(4500));
    equal(log.sources, before, 'Przy pełnej kolejce bardzo daleki grzmot odpada');
    audio.play(strike(100));
    equal(log.sources, before + 1, 'Bliski grzmot gra zawsze');

    // Czas płynie: stare głosy się kończą.
    game.sounds.context.currentTime = 500;
    audio.play(strike(300));
    equal(audio.voices.length, 1, 'Dawno skończone grzmoty nie zajmują miejsc');

    audio.dispose();
    check(audio.voices.length === 0 && audio.disposed, 'Sprzątanie zatrzymuje grzmoty');
    check(audio.play(strike(300)) === null || audio.voices.length === 0, 'Po sprzątnięciu nic nie gra');
}


// --- 7. Grad -----------------------------------------------------------------------

{
    const scene = new THREE.Scene();
    const rain = new RainStreaks(scene, { getChunk: () => null });
    const hail = new Hail(scene, rain);
    const camera = { position: new THREE.Vector3(10, 70, -5) };
    const wind = { x: 6, z: 0 };

    check(scene.children.includes(hail.stones) && scene.children.includes(hail.bounces), 'Grad jest w scenie');
    check(hail.uniforms.uRainShelter === rain.uniforms.uRainShelter && hail.uniforms.uRainBox === rain.uniforms.uRainBox, 'Grad korzysta z mapy schronienia i pudełka deszczu');

    rain.update(0.016, camera, 1, 0, wind);
    hail.update(0.016, 0, wind);
    check(!hail.stones.visible && !hail.bounces.visible && hail.stats().draws === 0, 'Bez gradu nic się nie rysuje');

    hail.update(0.016, 1, wind);
    equal([hail.stats().stones, hail.stats().bounces, hail.stats().draws], [HAIL.stones, HAIL.bounces, 2], 'Pełny grad: wszystkie kulki i odbicia, dwa polecenia rysowania');

    hail.update(0.016, 0.3, wind);
    check(hail.stats().stones < HAIL.stones && hail.stats().stones > HAIL.stones * 0.2, 'Słabszy grad - mniej kulek');

    near(hail.velocity.y, -HAIL.fall, 1e-9, 'Kulki spadają szybko');
    check(Math.abs(hail.velocity.x) < Math.abs(rain.velocity.x) && hail.velocity.x > 0, 'Wiatr znosi grad słabiej niż deszcz');
    check(HAIL.fall > RainStreaks.shape(1, 0).fall, 'Grad spada szybciej niż ulewa');

    const before = hail.offset.clone();

    hail.update(0.05, 1, wind);
    check(hail.offset.y !== before.y && hail.offset.x !== before.x, 'Kulki lecą');

    for (let k = 0; k < 2000; k++) hail.update(0.1, 1, wind);

    const box = rain.uniforms.uRainBox.value;

    check(hail.offset.x >= 0 && hail.offset.x < box.x * 20 && hail.offset.y >= 0 && hail.offset.y < box.y * 20, 'Przesunięcie kulek trzyma się w zakresie');

    rain.setAmount(0.35);
    hail.update(0.016, 1, wind);
    equal([hail.stats().stones, hail.stats().bounces], [HAIL.potatoStones, HAIL.potatoBounces], 'Tryb ziemniaka: mniej kulek');

    rain.setAmount(0);
    hail.update(0.016, 1, wind);
    equal(hail.stats().draws, 0, 'Efekty wyłączone - bez gradu');

    for (const material of [hail.stoneMaterial, hail.bounceMaterial]) {
        check(material.vertexShader.includes('rainShelter(p.xz)') && material.vertexShader.includes('rainWrap('), 'Kulki znikają pod dachem i wędrują z kamerą');
        check(!material.depthWrite && material.transparent, 'Grad nie zapisuje głębi');
    }

    hail.dispose();
    rain.dispose();
    check(!scene.children.includes(hail.stones) && hail.disposed, 'Sprzątanie zdejmuje grad');

    // Stukot.
    const quiet = weatherAudioLevels({ rain: 1 });
    const loud = weatherAudioLevels({ rain: 1, hail: 1 });
    const roofed = weatherAudioLevels({ rain: 1, hail: 1, cover: 1 });

    check(quiet.hail === 0 && loud.hail > 0.3 && loud.hail <= WEATHER_AUDIO.hail, 'Stukot gradu tylko, gdy pada grad');
    check(weatherAudioLevels({ hail: 0.3 }).hail < loud.hail, 'Im gęstszy grad, tym głośniej');
    check(roofed.hail > loud.hail * 0.5 && roofed.hailTone < loud.hailTone, 'Pod dachem grad bębni głucho, ale słychać go');
    equal(loud.rain, quiet.rain, 'Grad nie zmienia szumu deszczu');

    // Nalot na ziemi.
    const weather = new Weather('lepidolit');
    const t = afternoon;

    weather.update(t, 0.016, 100, 200);
    equal([weather.hail, weather.hailCover, cloudUniforms.uHailGround.value.z], [0, 0, 0], 'Bez gradu ziemia czysta');

    weather.hailOverride = 1;

    for (let k = 0; k < 60 * 20; k++) weather.update(t, 1 / 60, 100, 200);

    check(weather.hail === 1 && weather.hailCover === 1, 'Grad zabiela ziemię w kilkanaście sekund');
    equal([cloudUniforms.uHailGround.value.x, cloudUniforms.uHailGround.value.y, cloudUniforms.uHailGround.value.z], [100, 200, 1], 'Shader wie, gdzie leży grad');

    weather.hailOverride = 0;

    for (let k = 0; k < 60 * 30; k++) weather.update(t, 1 / 60, 400, 200);

    check(weather.hailCover < 0.7 && weather.hailCover > 0.4, 'Nalot topnieje ponad minutę');
    equal([cloudUniforms.uHailGround.value.x, cloudUniforms.uHailGround.value.y], [100, 200], 'Nalot zostaje tam, gdzie spadł grad');

    for (let k = 0; k < 60 * 80; k++) weather.update(t, 1 / 60, 400, 200);

    equal(weather.hailCover, 0, 'Po dwóch minutach gradu już nie ma');

    weather.hailOverride = 1;
    weather.wetSurfaces = false;
    weather.update(t, 1, 0, 0);
    check(weather.hailCover > 0 && cloudUniforms.uHailGround.value.z === 0, 'Bez mokrej ziemi (tryb ziemniaka) nie ma też nalotu');

    weather.dispose();
    equal(cloudUniforms.uHailGround.value.z, 0, 'Po wyjściu ze świata nalot znika');
}


// --- 8. Shadery --------------------------------------------------------------------

{
    for (const [name, glsl] of [['chmur', CLOUD_LAYERS_GLSL], ['cieni chmur', CLOUD_SHADOW_GLSL], ['światła', METEOR_LIGHT_GLSL], ['nieba', SKY_COLOR_GLSL]]) {
        check(!glsl.includes('`') && !glsl.includes('undefined') && !glsl.includes('NaN'), `Shader ${name} bez śmieci z szablonu`);
        equal((glsl.match(/{/g) ?? []).length, (glsl.match(/}/g) ?? []).length, `Shader ${name}: nawiasy`);
    }

    check(CLOUD_LAYERS_GLSL.includes('uniform vec4 uCloudFlash[3];') && cloudUniforms.uCloudFlash.value.length === 3 && THUNDER.cloudFlashes === 3, 'Trzy błyski w chmurach - tyle samo w shaderze i w grze');
    check(CLOUD_LAYERS_GLSL.includes('float cloudFlash(vec2 p)') && (CLOUD_LAYERS_GLSL.match(/uStorm\.y > 0\.5/g) ?? []).length === 4, 'Poświata liczy się tylko, gdy coś błyska (chmury niskie, średnie, wysokie, zasłona deszczu)');
    check(CLOUD_LAYERS_GLSL.includes('if (uStorm.x > 0.5)') && CLOUD_LAYERS_GLSL.includes('textureLod(uWeatherRain, p.xz * uWeatherScale, 0.0).g'), 'Chmury burzowe ciemnieją według siły burzy');
    check(CLOUD_LAYERS_GLSL.indexOf('float cloudFlash(vec2 p)') < CLOUD_LAYERS_GLSL.indexOf('vec4 lowClouds('), 'Poświata zdefiniowana przed użyciem');
    check(CLOUD_LAYERS_GLSL.includes('smoothstep(220.0, 800.0, reach)'), 'Zasłona deszczu zanika łagodnie nad głową');

    check(CLOUD_SHADOW_GLSL.includes('float hailAt(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('if (uHailGround.z <= 0.0)'), 'Nalot gradu: bez gradu shader nic nie liczy');

    const blocks = source('src/rendering/BlockRenderData.js');

    check(blocks.includes('hailAt(vWorldPosition) > 0.5') && blocks.indexOf('hailAt(vWorldPosition)') < blocks.indexOf('#endif`', blocks.indexOf('hailAt(vWorldPosition)')), 'Bloki rysują nalot gradu (nie rośliny i woda)');
    check(blocks.includes('meteorLight(vWorldPosition, vWorldNormal) * meteorSky(blockSky)'), 'Błysk oświetla bloki tylko tam, dokąd dochodzi światło nieba');
    check(source('src/rendering/ModelMaterial.js').includes('meteorLight(vWorldPosition, vWorldNormal) * meteorSky(modelSky)'), 'Błysk oświetla modele według ich światła nieba');
    check(METEOR_LIGHT_GLSL.includes('uniform float uMeteorSky;') && METEOR_LIGHT_GLSL.includes('wrap = mix(wrap, 0.42 + 0.58 * wrap, uMeteorSky);'), 'Światło błysku jest miękkie (odbite od chmur)');
    equal(meteorLightUniforms.uMeteorSky.value, 0, 'Meteoryt świeci po staremu');
    check(SKY_COLOR_GLSL.includes('color += uSkyFlash + uStormFlash;') && skyUniforms.uStormFlash.value.r === 0, 'Niebo ma osobny błysk burzy');

    const bolt = source('src/rendering/LightningBolts.js');

    check(bolt.includes('gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);') && bolt.includes('vDepth < uBoltClip.x'), 'Kanał pioruna: przebieg daleki i bliski dzielą się odległością');
}


// --- 9. Komendy, ustawienie, osiągnięcia, mapa, wpięcie w grę ----------------------

{
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const weather = new Weather('lepidolit');
    const thunder = new Thunderstorm(weather);
    const player = { pos: new THREE.Vector3(50, 70, -30), vel: new THREE.Vector3(), yaw: 0, updateCamera() {} };
    const camera = new THREE.PerspectiveCamera();

    camera.position.set(50, 71.6, -30);
    camera.lookAt(150, 71.6, -30);
    camera.updateMatrixWorld();

    const game = { weather, thunder, camera, time: { days: afternoon }, rainOverride: null };
    const run = (...args) => command.run(args, { game, player, world: {} });

    weather.update(afternoon, 0.016, 50, -30);
    thunder.update(afternoon, camera.position);

    const said = run('piorun');

    check(said.startsWith('Piorun uderzy w ziemię 150 bloków przed tobą') && said.includes('niecałej sekundzie'), '/pogoda piorun');

    let strike = thunder.pending.at(-1);

    check(strike.forced && strike.ground, 'Piorun z komendy jest w kolejce');
    near(strike.x, 200, 1e-6, 'Piorun z komendy - tam, gdzie patrzy gracz (x)');
    near(strike.z, -30, 1e-6, 'Piorun z komendy - tam, gdzie patrzy gracz (z)');

    check(run('piorun', '1372').includes('ok. 4 s'), '/pogoda piorun 1372 - grzmot po czterech sekundach');
    near(thunder.pending.at(-1).x, 1422, 1e-6, 'Odległość z komendy');

    check(run('piorun', '400', 'chmura').startsWith('Błyśnie w chmurze 400 bloków'), '/pogoda piorun 400 chmura');
    strike = thunder.pending.at(-1);
    check(!strike.ground && Math.abs(strike.x - 450) < 1e-6, 'Błysk w chmurze z komendy');
    check(run('piorun', 'chmura').startsWith('Błyśnie w chmurze 150 bloków'), '/pogoda piorun chmura');
    check(run('piorun', '5800').includes('nie słychać'), 'Bardzo daleki piorun - bez grzmotu');

    check(run('grad').includes('100%') && weather.hailOverride === 1, '/pogoda grad');
    check(run('grad', '35').includes('35%') && weather.hailOverride === 0.35, '/pogoda grad 35');

    run('auto');
    equal(weather.hailOverride, null, '/pogoda auto zdejmuje grad z komendy');

    for (const bad of [['piorun', '-5'], ['piorun', '7000'], ['piorun', 'x'], ['piorun', '1', '2', '3'], ['grad', '150'], ['grad', 'x']]) {
        assert.throws(() => run(...bad), `Błędna komenda: /pogoda ${bad.join(' ')}`);
        checks++;
    }

    check(command.complete(['']).includes('piorun') && command.complete(['']).includes('grad'), 'Podpowiedzi: piorun, grad');
    equal(command.complete(['piorun', '']), ['chmura'], 'Podpowiedzi: piorun chmura');
    check(command.usage.includes('piorun [odległość] [chmura]') && command.usage.includes('grad [0-100]'), 'Opis komendy');

    thunder.dispose();
    weather.dispose();

    // Ustawienie.
    equal(SETTINGS_DEFAULTS.stormFlashes, 'pelne', 'Ustawienie: błyski burzy pełne');
    equal(SETTINGS_CHOICES.stormFlashes, ['pelne', 'lagodne', 'brak'], 'Błyski burzy: pełne, łagodne, wyłączone');

    const layout = await import('../src/ui/settingsLayout.js');

    check(layout.SETTINGS_TABS.game.includes('stormFlashes') && !layout.ADVANCED_VIDEO.includes('stormFlashes'), 'Błyski burzy są w zakładce Gra, nie w zaawansowanych');
    check(source('src/ui/texts.js').includes('stormFlashes: (value)') && source('src/ui/texts.js').includes('stormFlashesNote:') && source('src/ui/Menu.js').includes('TEXTS.stormFlashesNote'), 'Błyski burzy opisane w menu');
    check(source('src/commands/settingsCommands.js').includes("blyski: 'stormFlashes'"), '/ustaw blyski');

    // Osiągnięcia.
    const { ACHIEVEMENTS } = await import('../src/achievements/list.js');
    const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
    const stub = (last, extra = {}) => ({
        weather: { ready: true, field: { forced: [] }, local: { ...emptySample(), ...extra.local }, hailOverride: null, ...extra.weather },
        thunder: { now: 1000, lastGround: last },
        rainOverride: null, shelterCover: 0, ...extra.game
    });
    const hit = (distance, more = {}) => ({ distance, time: 999, natural: true, ...more });

    for (const id of ['lightning_seen', 'close_strike', 'hailstorm']) {
        check(byId[id] && byId[id].title && byId[id].task && byId[id].comment && typeof byId[id].check === 'function', `Osiągnięcie ${id}`);
    }

    check(byId.lightning_seen.check(stub(hit(800))) && !byId.lightning_seen.check(stub(hit(1500))) && !byId.lightning_seen.check(stub(null)), 'Raz, dwa, trzy: piorun do kilometra');
    check(!byId.lightning_seen.check(stub(hit(800, { natural: false }))) && !byId.lightning_seen.check(stub(hit(800, { time: 990 }))), 'Raz, dwa, trzy: świeży piorun, nie z komendy');
    check(!byId.lightning_seen.check(stub(hit(800), { weather: { field: { forced: [1] } } })), 'Raz, dwa, trzy: nie pod burzą z komendy');
    check(byId.close_strike.check(stub(hit(30))) && !byId.close_strike.check(stub(hit(80))), 'O włos: piorun bliżej niż 50 bloków');
    check(byId.hailstorm.check(stub(null, { local: { hail: 0.6 } })) && !byId.hailstorm.check(stub(null, { local: { hail: 0.6 }, game: { shelterCover: 1 } })) &&
        !byId.hailstorm.check(stub(null, { local: { hail: 0.6 }, weather: { hailOverride: 1 } })) && !byId.hailstorm.check(stub(null, { local: { hail: 0.1 } })), 'Kulki lodu: grad pod gołym niebem, nie z komendy');

    // Mapa.
    const map = source('src/ui/TerrainMap.js');

    check(map.includes('this.thunder?.recent') && map.includes("strike: '#ffe45c'") && source('src/main.js').includes('terrainMap.thunder = game.thunder;'), 'Mapa pogody pokazuje świeże wyładowania');

    // Gra.
    const gameSource = source('src/game/Game.js');

    check(gameSource.includes('this.thunder = new Thunderstorm(this.weather, { groundAt: (x, z) => this.stormGround(x, z) })') &&
        gameSource.includes('this.lightning = new LightningBolts(this.scene)') && gameSource.includes('this.thunderAudio = new ThunderAudio(this)') &&
        gameSource.includes('this.hail = new Hail(this.scene, this.rainStreaks)'), 'Gra tworzy burzę, pioruny, grzmot i grad');
    check(gameSource.indexOf('this.meteorites.update(dt);') < gameSource.indexOf('this.updateStorm(dt);') && gameSource.indexOf('this.updateStorm(dt);') > 0, 'Burza liczy się po meteorytach (wspólne światło)');
    check(gameSource.includes("thunder.mode = this.settings.get('stormFlashes')"), 'Ustawienie błysków trafia do burzy');
    check(gameSource.includes('this.thunderAudio.play(strike, this.shelterCover)'), 'Każde nowe wyładowanie dostaje grzmot');
    check(gameSource.includes('meteor.x + meteor.y + meteor.z <= 0') && gameSource.includes('meteorLightUniforms.uMeteorSky.value = this.stormLight ? 1 : 0'), 'Meteoryt ma pierwszeństwo przed błyskiem');
    check(gameSource.includes('this.lightning?.renderFar(renderer, camera, this.farTerrain)') &&
        gameSource.indexOf('this.farTerrain.render(renderer, camera);') < gameSource.indexOf('this.lightning?.renderFar('), 'Dalekie pioruny rysują się po dalekim terenie');
    check(gameSource.includes('this.hail.update(dt, this.hailNow, this.weather.wind, this.sky.state)') && gameSource.includes('hail: this.hailNow'), 'Grad dostaje natężenie i wiatr, dźwięk - grad');
    check(gameSource.includes('this.clearStormLight();') && gameSource.includes('this.thunder.dispose();') && gameSource.includes('this.lightning.dispose();') &&
        gameSource.includes('this.thunderAudio.dispose();') && gameSource.includes('this.hail.dispose();'), 'Sprzątanie przy wyjściu ze świata i wczytywaniu terenu');

    equal(SEA_LEVEL, 48, 'Poziom morza (piorun nie bije niżej)');
}

console.log(`OK: burze - ${checks} sprawdzeń (losowanie wyładowań, grad, błysk, burza w grze, kanał pioruna, grzmot, stukot i nalot gradu, shadery, komendy, ustawienie, osiągnięcia).`);
