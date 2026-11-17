// ------------------------------------------------------------
// SPRAWDZENIE POGODY (1.11.0) - src/weather/
//
// - pole pogody liczy się tylko z ziarna świata i czasu gry: te same
//   wejścia dają tę samą pogodę, wartości mieszczą się w zakresach,
//   nic nie skacze w czasie ani w przestrzeni,
// - fronty suną z przepływem i mają przekrój jak prawdziwe: przed
//   frontem ciepłym najpierw chmury wysokie, potem średnie, potem niskie
//   z deszczem; front chłodny to wąski pas ulewy, za nim przejaśnienie
//   i silny, porywisty wiatr,
// - pory roku: latem burze, jesienią i zimą więcej niskich chmur,
// - suchy klimat (pustynia) ma mniej chmur i deszczu,
// - mapa pogody w teksturze zgadza się z polem, także po przesunięciu
//   okna za graczem,
// - zachmurzenie nad graczem, siła cieni chmur, wiatr i kołysanie roślin,
// - szum chmur: wyrównany i bez szwów; "pokrycie 40%" to ok. 40% nieba,
// - opisy słowne, prognoza, komenda /pogoda, mapa, ustawienia,
//   osiągnięcia i wpięcie w grę.
//
// Uruchomienie: node tools/sprawdz_pogode.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const THREE = await import('three');
const { WeatherField, WEATHER_CELL, FLOW_SPEED, DAY_SECONDS, SYSTEM_NAMES, SYSTEM_TYPES, emptySample } = await import('../src/weather/WeatherField.js');
const { Weather, WeatherMap, WEATHER_MAP_SIZE, WEATHER_MAP_TEXEL } = await import('../src/weather/Weather.js');
const { cloudNoiseData, CLOUD_NOISE_SIZE } = await import('../src/weather/CloudNoise.js');
const { cloudUniforms, CLOUD_LEVELS, CLOUD_REACH, CLOUD_TILES, CLOUD_CELL, CLOUD_FIELD_GLSL, CLOUD_SHADOW_GLSL, CLOUD_LAYERS_GLSL } = await import('../src/weather/cloudShader.js');
const TEXT = await import('../src/weather/weatherText.js');
const { WEATHER_COMMANDS } = await import('../src/commands/weatherCommands.js');
const { YEAR_DAYS, SEASON_DAYS, nextSeasonStart } = await import('../src/sky/Seasons.js');
const { CHUNK_HEIGHT } = await import('../src/config.js');
const { SETTINGS_DEFAULTS, SETTINGS_CHOICES } = await import('../src/settings/Settings.js');
const { PERF_STAGES } = await import('../src/diagnostics/PerfDiagnostics.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const KEYS = ['low', 'thick', 'mid', 'high', 'rain', 'storm', 'clear', 'gust'];
const spring = nextSeasonStart(0, 0) + YEAR_DAYS;
const seasonStart = (index) => spring + index * SEASON_DAYS;

// Liczby losowe do wyboru miejsc i chwil (zawsze te same).
let state = 12345;
const random = () => { state = (Math.imul(state, 1664525) + 1013904223) | 0; return (state >>> 0) / 4294967296; };


// --- 1. Powtarzalność i zakresy ---------------------------------------------

{
    const a = new WeatherField('lepidolit');
    const b = new WeatherField('lepidolit');
    const c = new WeatherField('inny świat');

    check(Math.abs(a.flow.angle) < 0.7, 'Pogoda nadciąga przeważnie z zachodu (na wschód ±40°)');
    check(Math.abs(Math.hypot(a.flow.x, a.flow.z) - FLOW_SPEED * DAY_SECONDS) < 1e-6, 'Przepływ ma stałą prędkość');
    check(a.flow.angle !== c.flow.angle, 'Inny świat - inny kierunek przepływu');

    let different = 0;

    for (let k = 0; k < 400; k++) {

        const x = (random() - 0.5) * 60000, z = (random() - 0.5) * 60000, t = random() * 200;
        const one = a.sample(x, z, t, emptySample());
        const two = b.sample(x, z, t, emptySample());
        const other = c.sample(x, z, t, emptySample());

        equal(one, two, 'To samo ziarno, miejsce i czas - ta sama pogoda');

        for (const key of KEYS) {
            check(Number.isFinite(one[key]) && one[key] >= 0 && one[key] <= 1, `${key} w zakresie 0-1`);
        }

        check(one.speed >= 0 && one.speed <= 11 && Math.abs(Math.hypot(one.windX, one.windZ) - one.speed) < 1e-9, 'Wiatr: prędkość zgodna z wektorem, najwyżej 11 bl./s');

        if (Math.abs(one.low - other.low) + Math.abs(one.high - other.high) > 0.05) different++;

    }

    check(different > 100, 'Inne ziarno daje inną pogodę');
}


// --- 2. Nic nie skacze -------------------------------------------------------

{
    const field = new WeatherField(7);
    const a = emptySample(), b = emptySample();

    let worstSpace = 0, worstTime = 0;

    for (let k = 0; k < 3000; k++) {

        const x = (random() - 0.5) * 40000, z = (random() - 0.5) * 40000, t = random() * 120;

        field.sample(x, z, t, a);
        field.sample(x + 8, z + 8, t, b);

        // Piętrzenie ma sens tylko tam, gdzie są chmury.
        const change = (key) => Math.abs(a[key] - b[key]) * (key === 'thick' ? Math.min(a.low, b.low) : 1);

        for (const key of KEYS) worstSpace = Math.max(worstSpace, change(key));

        // Pół sekundy później.
        field.sample(x, z, t + 0.5 / DAY_SECONDS, b);

        for (const key of KEYS) worstTime = Math.max(worstTime, change(key));

        worstTime = Math.max(worstTime, Math.abs(a.speed - b.speed) / 11);

    }

    check(worstSpace < 0.06, `Pogoda jest gładka w przestrzeni (największa zmiana na 11 bloków: ${worstSpace.toFixed(3)})`);
    check(worstTime < 0.03, `Pogoda jest gładka w czasie (największa zmiana w pół sekundy: ${worstTime.toFixed(3)})`);
}


// --- 3. Układy suną z przepływem i nie sięgają za daleko -----------------------

{
    const field = new WeatherField('lepidolit');

    let found = 0;

    for (let t = 2; t < 60 && found < 12; t += 0.37) {

        for (const system of field.systemsNear(0, 0, t, WEATHER_CELL)) {

            const later = field.systemsNear(0, 0, t + 0.01, WEATHER_CELL).find((other) => other.id === system.id);

            if (!later) continue;

            const moved = Math.hypot(later.x - system.x, later.z - system.z) / (0.01 * DAY_SECONDS);

            check(Math.abs(moved - system.speed) < 0.01, 'Układ przesuwa się ze swoją prędkością');
            check(system.speed > FLOW_SPEED * 0.8 && system.speed < FLOW_SPEED * 1.45, `Prędkość układu bliska przepływowi (${system.speed.toFixed(2)})`);
            check((later.x - system.x) * Math.cos(field.flow.angle) + (later.z - system.z) * Math.sin(field.flow.angle) > 0, 'Układ sunie z przepływem');
            check(system.type in SYSTEM_NAMES && system.strength > 0 && system.strength <= 1, 'Układ ma znany rodzaj i siłę 0-1');
            found++;

        }

    }

    check(found >= 12, 'W okolicy stale żyją układy pogodowe');

    // Układ nie wpływa na pogodę dalej niż jedno oczko swojej siatki -
    // inaczej próbka z 3 x 3 oczek gubiłaby go na granicy.
    const lone = new WeatherField(3);

    for (const type of SYSTEM_TYPES) {

        lone.clearForced();
        lone.force(type, 0, 0, 10.6, { stay: true, size: 1.15 });

        const forced = [lone.forcedAt(lone.forced[0], 10.6)];
        const empty = lone.sample(0, 0, 10.6, emptySample(), []);

        for (let k = 0; k < 24; k++) {

            const angle = k / 24 * Math.PI * 2;
            const x = Math.cos(angle) * (WEATHER_CELL + 5), z = Math.sin(angle) * (WEATHER_CELL + 5);
            const far = lone.sample(x, z, 10.6, emptySample(), []);

            lone.acc.low = lone.acc.mid = lone.acc.high = lone.acc.rain = lone.acc.clear = lone.acc.gain = 0;
            lone.apply(forced[0], x, z, 10.6, 0.6, 0, 0.5, 0.9, 1);

            check(lone.acc.low === 0 && lone.acc.mid === 0 && lone.acc.high === 0 && lone.acc.rain === 0 && lone.acc.clear === 0 && lone.acc.gain === 0,
                `${type}: poza oczkiem układ nic nie zmienia`);
            check(Number.isFinite(far.low) && Number.isFinite(empty.low), 'Próbka bez układów też się liczy');

        }

    }
}


// --- 4. Przekrój frontów ---------------------------------------------------------

{
    const field = new WeatherField(11);
    const t = seasonStart(1) + 3.6;           // lato, po południu
    const dx = Math.cos(field.flow.angle), dz = Math.sin(field.flow.angle);

    // Profil wzdłuż drogi frontu: s > 0 - przed frontem.
    const profile = (type, time = t) => {

        field.clearForced();
        field.force(type, 0, 0, time, { stay: true });

        const rows = [];

        for (let s = 5200; s >= -5200; s -= 50) {
            rows.push({ s, ...field.sample(dx * s, dz * s, time, emptySample()) });
        }

        return rows;

    };

    const peak = (rows, key) => rows.reduce((best, row) => row[key] > best[key] ? row : best);
    const span = (rows, test) => { const hit = rows.filter(test); return hit.length ? hit[0].s - hit.at(-1).s : 0; };
    const centre = (rows, key) => { let sum = 0, weight = 0; for (const row of rows) { sum += row.s * row[key]; weight += row[key]; } return sum / weight; };

    const warm = profile('front_cieply');

    check(centre(warm, 'high') > centre(warm, 'mid') + 500 && centre(warm, 'mid') > centre(warm, 'low') + 500,
        'Front ciepły: najpierw chmury wysokie, potem średnie, na końcu niskie');
    check(warm.find((row) => row.s === 3600).high > 0.4 && warm.find((row) => row.s === 3600).low < 0.05, 'Daleko przed frontem ciepłym są same pierzaste');
    check(peak(warm, 'rain').rain > 0.2 && peak(warm, 'rain').rain < 0.75, 'Front ciepły: deszcz jednostajny, nie ulewa');
    check(span(warm, (row) => row.rain > 0.1) >= 1200, 'Front ciepły: szeroki pas deszczu');
    check(warm.every((row) => row.storm === 0), 'Front ciepły nie niesie burz');
    check(peak(warm, 'low').low > 0.95 && peak(warm, 'low').thick > 0.35, 'W deszczu niebo zamknięte grubą chmurą');

    const cold = profile('front_chlodny');
    const line = peak(cold, 'rain');

    check(line.rain > 0.65, 'Front chłodny: ulewa');
    check(span(cold, (row) => row.rain > 0.55) <= 1300 && span(cold, (row) => row.rain > 0.55) >= 300, 'Front chłodny: wąski pas ulewy');
    check(span(cold, (row) => row.rain > 0.55) < span(warm, (row) => row.rain > 0.1), 'Front chłodny jest węższy od ciepłego');
    check(peak(cold, 'storm').storm > 0.4, 'Front chłodny latem niesie burzę');
    check(peak(cold, 'thick').thick > 0.8, 'Front chłodny: chmury piętrzą się wysoko');
    check(peak(cold, 'speed').speed > cold.find((row) => row.s === 5200).speed * 1.8, 'Front chłodny: wiatr dużo silniejszy niż przed nim');
    check(peak(cold, 'gust').gust > 0.8, 'Front chłodny: wiatr porywisty');
    check(cold.some((row) => row.s < -900 && row.s > -1900 && row.low < 0.15 && row.clear > 0.5), 'Zaraz za frontem chłodnym przejaśnienie');

    const ahead = cold.find((row) => row.s === 3000), behind = cold.find((row) => row.s === -3000);
    const turn = Math.atan2(Math.sin(behind.angle - ahead.angle), Math.cos(behind.angle - ahead.angle));

    check(Math.abs(turn) > 0.35, 'Za frontem chłodnym wiatr wieje z innej strony');

    const winter = profile('front_chlodny', seasonStart(3) + 3.6);

    check(peak(winter, 'storm').storm < peak(cold, 'storm').storm * 0.35, 'Zimą front chłodny prawie bez burz');

    // Burze: jądro z ulewą, kowadło szersze od chmury burzowej.
    field.clearForced();
    field.force('burze', 0, 0, t, { stay: true });

    let stormArea = 0, anvilArea = 0, rainArea = 0;

    for (let x = -4000; x <= 4000; x += 100) {
        for (let z = -4000; z <= 4000; z += 100) {

            const sample = field.sample(x, z, t, emptySample());

            if (sample.storm > 0.4) stormArea++;
            if (sample.rain > 0.3) rainArea++;
            if (sample.high > 0.4) anvilArea++;

        }
    }

    check(stormArea > 20 && stormArea < 1500, `Burze to pojedyncze komórki, nie całe niebo (${stormArea})`);
    check(anvilArea > stormArea * 1.5, 'Kowadło z chmur wysokich jest szersze niż sama burza');
    check(rainArea >= stormArea, 'Gdzie burza, tam pada');

    // Wyż czyści niebo, niż je zamyka.
    field.clearForced();
    field.force('wyz', 0, 0, t, { stay: true });

    const high = field.sample(0, 0, t, emptySample());

    check(high.clear > 0.95 && high.low < 0.05 && high.rain === 0 && high.speed < 1.6, 'Wyż: czyste niebo i słaby wiatr');

    field.clearForced();
    field.force('niz', 0, 0, t, { stay: true });

    const low = field.sample(0, 0, t, emptySample());

    check(low.low > 0.95 && low.thick < 0.5 && low.storm === 0, 'Niż: niebo zamknięte cienką warstwą chmur');

    // Układ z komendy nadciąga: najpierw daleko, potem nad graczem.
    field.clearForced();
    field.force('front_chlodny', 0, 0, t, { ahead: 2600 });

    check(field.sample(0, 0, t, emptySample()).rain < 0.05, 'Front ustawiony "nadciąga" jeszcze nie pada');

    let arrived = null;

    for (let seconds = 0; seconds < 900 && arrived === null; seconds += 10) {
        if (field.sample(0, 0, t + seconds / DAY_SECONDS, emptySample()).rain > 0.5) arrived = seconds;
    }

    check(arrived !== null && arrived > 200 && arrived < 520, `Front dociera po kilku minutach (${arrived} s)`);
    check(field.sample(0, 0, t + (arrived + 500) / DAY_SECONDS, emptySample()).rain < 0.3, 'Po przejściu frontu ulewa ustaje');

    field.clearForced();

    check(field.forced.length === 0, '/pogoda auto zdejmuje układy z komendy');
}


// --- 5. Pory roku i klimat -----------------------------------------------------

{
    const stats = [0, 1, 2, 3].map(() => ({ n: 0, rain: 0, storm: 0, overcast: 0, sunny: 0, wind: 0 }));
    const sample = emptySample();

    for (const seed of ['lepidolit', 'drugi', 7]) {

        const field = new WeatherField(seed);

        for (const [x, z] of [[0, 0], [9000, -14000], [-21000, 5000], [3000, 26000]]) {
            for (let day = 0; day < YEAR_DAYS; day += 1 / 48) {

                field.sample(x, z, spring + day, sample);

                const s = stats[Math.min(3, Math.floor(day / SEASON_DAYS))];

                s.n++;
                s.rain += sample.rain > 0.05 ? 1 : 0;
                s.storm += sample.storm > 0.3 ? 1 : 0;
                s.overcast += sample.low > 0.85 ? 1 : 0;
                s.sunny += sample.low < 0.25 && sample.mid < 0.4 ? 1 : 0;
                s.wind += sample.speed;

            }
        }

    }

    for (const s of stats) for (const key of ['rain', 'storm', 'overcast', 'sunny', 'wind']) s[key] /= s.n;
    if (process.env.POGODA_STAT) console.log(stats);

    for (const [index, name] of ['wiosna', 'lato', 'jesień', 'zima'].entries()) {
        check(stats[index].rain > 0.05 && stats[index].rain < 0.35, `${name}: pada przez ${Math.round(stats[index].rain * 100)}% czasu`);
        check(stats[index].sunny > 0.3 && stats[index].sunny < 0.85, `${name}: pogodnie przez ${Math.round(stats[index].sunny * 100)}% czasu`);
    }

    check(stats[1].storm > stats[3].storm * 3 && stats[1].storm > 0.004, 'Burze są latem, zimą prawie wcale');
    check(stats[2].overcast > stats[1].overcast * 1.5 && stats[3].overcast > stats[1].overcast * 1.5, 'Jesienią i zimą niebo częściej zamknięte niż latem');
    check(stats[1].overcast < stats[0].overcast, 'Lato ma mniej zamkniętego nieba niż wiosna');
    check(stats[2].wind > stats[1].wind, 'Jesienią wieje mocniej niż latem');

    // Klimat: pustynia sucha, las deszczowy mokry.
    const dry = new WeatherField('lepidolit', { climate: () => -0.9 });
    const wet = new WeatherField('lepidolit', { climate: () => 0.7 });

    let dryCloud = 0, wetCloud = 0, dryRain = 0, wetRain = 0;

    for (let day = 0; day < YEAR_DAYS; day += 1 / 24) {

        dry.sample(0, 0, spring + day, sample);
        dryCloud += sample.low;
        dryRain += sample.rain;

        wet.sample(0, 0, spring + day, sample);
        wetCloud += sample.low;
        wetRain += sample.rain;

    }

    check(dryCloud < wetCloud * 0.8 && dryRain < wetRain * 0.5, 'W suchym klimacie mniej chmur i dużo mniej deszczu');
}


// --- 6. Mapa pogody w teksturze -------------------------------------------------

{
    const field = new WeatherField('lepidolit');
    const map = new WeatherMap(field);
    const N = WEATHER_MAP_SIZE, T = WEATHER_MAP_TEXEL;
    const mod = (v) => ((v % N) + N) % N;
    const t = 20.4;

    check(map.texture.wrapS === THREE.RepeatWrapping && map.texture.magFilter === THREE.LinearFilter, 'Tekstura mapy: zawijana i wygładzana');
    check(N * T / 2 > CLOUD_REACH, 'Mapa sięga dalej, niż widać chmury');

    map.update(300, -700, t);

    const texel = (ix, iz) => { const k = (mod(iz) * N + mod(ix)) * 4; return [map.data[k], map.data[k + 1], map.data[k + 2], map.data[k + 3]]; };
    const expected = (ix, iz, time) => { const s = field.sample((ix + 0.5) * T, (iz + 0.5) * T, time, emptySample()); return [s.low, s.thick, s.mid, s.high].map((v) => Math.round(v * 255)); };

    for (let k = 0; k < 300; k++) {

        const ix = map.originX + Math.floor(random() * N), iz = map.originZ + Math.floor(random() * N);

        equal(texel(ix, iz), expected(ix, iz, t), 'Punkt mapy = pogoda w środku tego punktu');

    }

    // Gracz przeszedł 3 punkty na wschód i 2 na północ: dochodzą paski
    // na brzegu, środek zostaje.
    const before = Uint8Array.from(map.data);
    const oldX = map.originX, oldZ = map.originZ;

    map.update(300 + 3 * T, -700 - 2 * T, t);

    check(map.originX === oldX + 3 && map.originZ === oldZ - 2, 'Okno mapy idzie za graczem');

    for (let ix = oldX + N; ix < oldX + N + 3; ix++) {
        for (let iz = map.originZ; iz < map.originZ + N; iz += 7) {
            equal(texel(ix, iz), expected(ix, iz, t), 'Nowy pasek na wschodzie policzony');
        }
    }

    for (let iz = map.originZ; iz < oldZ; iz++) {
        for (let ix = map.originX; ix < map.originX + N; ix += 7) {
            equal(texel(ix, iz), expected(ix, iz, t), 'Nowy pasek na północy policzony');
        }
    }

    // Wiersz odświeżany w tej klatce to jedyna inna zmiana.
    let changedRows = new Set();

    for (let iz = oldZ; iz < oldZ + N - 2; iz++) {
        for (let ix = oldX + 3; ix < oldX + N; ix++) {
            const k = (mod(iz) * N + mod(ix)) * 4;
            if (map.data[k] !== before[k] || map.data[k + 3] !== before[k + 3]) changedRows.add(iz);
        }
    }

    check(changedRows.size <= 1, 'Reszta mapy zostaje bez przeliczania');

    // Odświeżanie nadąża za czasem: obieg, który zaczął się po zmianie
    // czasu, liczy całą mapę dla nowej chwili.
    for (let frame = 0; frame < 2 * N; frame++) {
        map.update(300 + 3 * T, -700 - 2 * T, t + 0.05);
        if (map.row === 0 && map.sweepTime === t + 0.05 && frame > N) break;
    }

    let fresh = 0;

    for (let k = 0; k < 200; k++) {

        const ix = map.originX + Math.floor(random() * N), iz = map.originZ + Math.floor(random() * N);

        if (texel(ix, iz).join() === expected(ix, iz, t + 0.05).join()) fresh++;

    }

    check(fresh === 200, 'Po pełnym obiegu cała mapa ma świeżą pogodę');
    check(map.maxThick >= 0 && map.maxThick <= 1, 'Mapa zna największe piętrzenie chmur w okolicy');

    // Daleki skok (teleport): całość od nowa.
    map.update(50000, 50000, t);
    equal(texel(map.originX + 5, map.originZ + 9), expected(map.originX + 5, map.originZ + 9, t), 'Po teleporcie mapa liczy się od nowa');
}


// --- 7. Pogoda w grze: światło, cienie, wiatr -------------------------------------

{
    const weather = new Weather('lepidolit');
    const t = seasonStart(1) + 3.55;
    const up = new THREE.Vector3(0.3, 0.9, 0.2).normalize();

    check(cloudUniforms.uWeatherMap.value === weather.map.texture && cloudUniforms.uCloudNoise.value, 'Shadery dostają mapę pogody i szum');
    check(Math.abs(cloudUniforms.uWeatherScale.value - 1 / (WEATHER_MAP_SIZE * WEATHER_MAP_TEXEL)) < 1e-12, 'Skala mapy pogody dla shaderów');

    const set = (type, options = { stay: true }) => {
        weather.field.clearForced();
        if (type) weather.field.force(type, 0, 0, t, options);
        weather.reset();
        weather.update(t, 0.016, 0, 0);
        weather.setLight(up, true);
    };

    set('wyz');
    check(weather.overcast < 0.1 && weather.depth === 0, 'Wyż: światło jak przy czystym niebie');
    check(cloudUniforms.uCloudShadow.value.x > 0.7, 'Przy przejaśnieniach chmury rzucają wyraźne cienie');
    check(Math.abs(cloudUniforms.uCloudShadow.value.y - up.x / up.y) < 1e-6, 'Cień chmury przesuwa się w stronę przeciwną do słońca');

    const calm = weather.wind.speed, calmSway = weather.sway;

    set('niz');
    check(weather.overcast > 0.9, 'Niż: zachmurzenie pełne - świat szarzeje');
    check(cloudUniforms.uCloudShadow.value.x < 0.3, 'Pod zamkniętym niebem nie ma ostrych cieni chmur');

    set('front_chlodny');
    check(weather.overcast > 0.9 && weather.depth > 0.6, 'Pod chmurą burzową jest ciemniej niż pod zwykłym zachmurzeniem');
    check(weather.wind.speed > calm * 2 && weather.sway > calmSway * 1.5 && weather.sway <= 3, 'Front chłodny: silny wiatr, rośliny kołyszą się mocniej');
    check(cloudUniforms.uCloudLevels.value.y > 400, 'Shader szuka chmur tak wysoko, jak sięga burzowa');

    weather.setLight(new THREE.Vector3(0.6, -0.1, 0.5), true);
    check(cloudUniforms.uCloudShadow.value.x === 0, 'Światło pod horyzontem - bez cieni chmur');

    weather.shadows = false;
    weather.setLight(up, true);
    check(cloudUniforms.uCloudShadow.value.x === 0, 'Cienie chmur da się wyłączyć');
    weather.shadows = true;

    weather.setLight(up, false);
    check(cloudUniforms.uCloudShadow.value.x === 0, 'Bez chmur (ustawienie) nie ma ich cieni');

    // Wygładzanie: po zmianie pogody bez reset() wartości dochodzą płynnie.
    set('wyz');
    weather.field.clearForced();
    weather.field.force('niz', 0, 0, t, { stay: true });
    weather.update(t, 0.1, 0, 0);
    check(weather.local.low > 0.01 && weather.local.low < 0.2, 'Pogoda nad graczem zmienia się płynnie');

    for (let k = 0; k < 200; k++) weather.update(t, 0.1, 0, 0);
    check(weather.local.low > 0.95, 'Po chwili dochodzi do nowej wartości');

    // Przesunięcie wzorów chmur: w zakresie powtarzalności, zgodne z czasem.
    const drift = cloudUniforms.uCloudDrift.value;

    check(drift[0].x >= 0 && drift[0].x < CLOUD_TILES.low && drift[0].z >= 0 && drift[0].z < CLOUD_TILES.group &&
        drift[1].x >= 0 && drift[1].x < CLOUD_TILES.mid && drift[1].z >= 0 && drift[1].z < CLOUD_TILES.high, 'Przesunięcia wzorów zawinięte');

    const x0 = drift[0].x, z0 = drift[0].y;

    weather.update(t + 10 / DAY_SECONDS, 0.1, 0, 0);

    const wrap = (v) => ((v + CLOUD_TILES.low * 1.5) % CLOUD_TILES.low) - CLOUD_TILES.low / 2;
    const moved = Math.hypot(wrap(drift[0].x - x0), wrap(drift[0].y - z0));

    check(Math.abs(moved - FLOW_SPEED * 10) < 0.01, 'Chmury niskie płyną z prędkością przepływu');
    check(CLOUD_TILES.low % CLOUD_CELL === 0, 'Zawinięcie wzoru nie przesuwa siatki klocków');
    check(CLOUD_LEVELS.low > CHUNK_HEIGHT + 40 && CLOUD_LEVELS.mid > CLOUD_LEVELS.low && CLOUD_LEVELS.high > CLOUD_LEVELS.mid, 'Chmury są nad terenem, piętra jedno nad drugim');
    check(weather.base > CLOUD_LEVELS.low, 'Latem podstawa chmur jest wyżej');

    weather.update(seasonStart(3) + 3.5, 0.1, 0, 0);
    check(weather.base < CLOUD_LEVELS.low, 'Zimą podstawa chmur jest niżej');

    weather.dispose();
    check(cloudUniforms.uWeatherMap.value === null && cloudUniforms.uCloudShadow.value.x === 0, 'Po wyjściu ze świata chmury i cienie znikają');
}


// --- 8. Szum chmur ----------------------------------------------------------------

{
    const size = CLOUD_NOISE_SIZE;
    const data = cloudNoiseData();

    equal(data.length, size * size * 4, 'Szum: cztery kanały');

    for (let channel = 0; channel < 4; channel++) {

        let sum = 0, quarter = 0, seam = 0, inner = 0;

        for (let i = 0; i < size * size; i++) {
            sum += data[i * 4 + channel];
            if (data[i * 4 + channel] < 64) quarter++;
        }

        for (let z = 0; z < size; z++) {
            seam += Math.abs(data[(z * size) * 4 + channel] - data[(z * size + size - 1) * 4 + channel]);
            inner += Math.abs(data[(z * size + 100) * 4 + channel] - data[(z * size + 101) * 4 + channel]);
        }

        check(Math.abs(sum / (size * size) - 127.5) < 1, `Kanał ${channel}: średnia w połowie`);
        check(Math.abs(quarter / (size * size) - 0.25) < 0.005, `Kanał ${channel}: każda jasność tak samo częsta`);
        check(seam < inner * 2.5, `Kanał ${channel}: bez szwu na brzegu`);

    }

    // Smugi (kanał B) ciągną się wzdłuż osi x.
    let alongX = 0, alongZ = 0;

    for (let z = 0; z < size - 1; z++) {
        for (let x = 0; x < size - 1; x++) {
            const k = (z * size + x) * 4 + 2;
            alongX += Math.abs(data[k] - data[k + 4]);
            alongZ += Math.abs(data[k] - data[k + size * 4]);
        }
    }

    check(alongZ > alongX * 3, 'Kanał smug zmienia się wolno wzdłuż, szybko w poprzek');

    // Próg jak w shaderze: pokrycie z mapy -> tyle samo nieba w chmurach.
    const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const threshold = (cover) => 0.19 + 0.62 * cover + 0.2 * smoothstep(0.8, 1, cover) - 0.2 * (1 - smoothstep(0, 0.12, cover));

    check(CLOUD_FIELD_GLSL.includes('0.19 + 0.62 * cover') && CLOUD_FIELD_GLSL.includes('0.62 * puffs + 0.38 * groups'), 'Test liczy próg tak samo jak shader');

    for (const cover of [0, 0.2, 0.4, 0.6, 0.8, 1]) {

        let inside = 0;
        const tries = 40000;

        for (let k = 0; k < tries; k++) {

            const puffs = data[Math.floor(random() * size * size) * 4] / 255;
            const groups = data[Math.floor(random() * size * size) * 4 + 1] / 255;

            if (threshold(cover) - (0.62 * puffs + 0.38 * groups) > 0) inside++;

        }

        const share = inside / tries;

        if (cover === 0) check(share === 0, 'Pokrycie 0: ani jednej chmury');
        else if (cover === 1) check(share === 1, 'Pokrycie 1: niebo bez dziur');
        else check(Math.abs(share - cover) < 0.07, `Pokrycie ${cover} daje ${Math.round(share * 100)}% nieba w chmurach`);

    }
}


// --- 9. Shadery ---------------------------------------------------------------------

{
    for (const [name, glsl] of [['pole', CLOUD_FIELD_GLSL], ['cienie', CLOUD_SHADOW_GLSL], ['niebo', CLOUD_LAYERS_GLSL]]) {

        const open = (glsl.match(/\{/g) ?? []).length, close = (glsl.match(/\}/g) ?? []).length;

        check(open === close && open > 0, `Shader (${name}): nawiasy się zgadzają`);
        check(!glsl.includes('undefined') && !glsl.includes('NaN') && !glsl.includes('${'), `Shader (${name}): wstawione liczby`);

    }

    check(CLOUD_SHADOW_GLSL.includes('float cloudShadowAt(vec3 worldPosition)') && CLOUD_SHADOW_GLSL.includes('if (uCloudShadow.x <= 0.0)'), 'Cień chmur: bez pracy, gdy wyłączony');
    check(CLOUD_LAYERS_GLSL.includes('cover < 0.012') && CLOUD_LAYERS_GLSL.includes('lowClouds') && CLOUD_LAYERS_GLSL.includes('midClouds') && CLOUD_LAYERS_GLSL.includes('highClouds'), 'Trzy piętra chmur i szybkie wyjście przy czystym niebie');
    check(!/\b(sample|input|output|filter|half|common)\s*[=;(]/.test(CLOUD_LAYERS_GLSL.replace(/\/\/.*$/gm, '')), 'Shader nie używa słów zastrzeżonych GLSL jako nazw');

    const blocks = source('src/rendering/BlockRenderData.js');
    const far = source('src/world/FarTerrain.js');
    const shadows = source('src/rendering/Shadows.js');

    check(blocks.includes('${CLOUD_SHADOW_GLSL}') && blocks.includes('cloudShadowAt(vWorldPosition)') && blocks.includes("'blockCloud'") && blocks.includes('cloudUniforms'), 'Bloki: cień chmur w świetle słońca');
    check(far.includes('${CLOUD_SHADOW_GLSL}') && far.includes('cloudShadowAt(vFarWorld)') && far.includes('cloudUniforms'), 'Daleki teren: cień chmur');
    check(shadows.includes('cloud = null') && shadows.includes('`(${sun}) * ${cloud}`'), 'Wspólny kawałek światła mnoży słońce przez cień chmur');

    const { Clouds } = await import('../src/sky/layers/Clouds.js');
    const clouds = new Clouds();

    check(!clouds.active, 'Bez pogody chmur nie ma (tło menu)');

    const weather = new Weather(5);

    clouds.weather = weather;
    check(clouds.active, 'Z pogodą chmury są rysowane');
    clouds.quality = 'brak';
    check(!clouds.active, 'Chmury da się wyłączyć');
    clouds.quality = 'pelne';

    // Kolory: dzień, zachód, noc.
    const state = (daylight, sunset, moon) => ({
        daylight, sunset, space: 0, moonLightIntensity: moon,
        sunsetColor: new THREE.Color(1, 0.5, 0.2), zenith: new THREE.Color(0.25, 0.45, 0.8).multiplyScalar(daylight + 0.03),
        horizon: new THREE.Color(0.6, 0.75, 0.9).multiplyScalar(daylight + 0.03), moonLightColor: new THREE.Color(0.6, 0.7, 1)
    });
    const celestial = (sunHeight) => ({ sunHeight, moonHeight: 0.5, sunDirection: new THREE.Vector3(0.5, sunHeight, 0.3).normalize(), moonDirection: new THREE.Vector3(-0.4, 0.5, 0.1).normalize() });
    const luma = (color) => 0.3 * color.r + 0.55 * color.g + 0.15 * color.b;

    clouds.update(state(1, 0, 0), celestial(0.8));

    const dayLit = clouds.uniforms.uCloudLit.value.clone(), dayShade = clouds.uniforms.uCloudShade.value.clone();

    check(luma(dayLit) > 0.9 && luma(dayShade) < luma(dayLit) * 0.75 && luma(dayShade) > 0.3, 'Dzień: chmura biała w słońcu, szara w cieniu');
    equal(clouds.uniforms.uCloudLayerLit.value.toArray(), [1, 1, 1], 'Dzień: słońce oświetla wszystkie piętra');
    check(clouds.uniforms.uCloudGlow.value.r === 0, 'Dzień: bez podświetlenia od spodu');

    clouds.update(state(0.6, 1, 0), celestial(0.0));

    const lit = clouds.uniforms.uCloudLit.value;

    check(lit.r > lit.b * 1.8 && clouds.uniforms.uCloudGlow.value.r > 0.2, 'Zachód: chmury pomarańczowe, spód podświetlony');

    clouds.update(state(0.1, 0.3, 0), celestial(-0.1));

    const layers = clouds.uniforms.uCloudLayerLit.value;

    check(layers.x < 0.05 && layers.z > 0.5 && layers.y > layers.x && layers.z > layers.y, 'Po zachodzie słońce widzi już tylko wysokie chmury');

    clouds.update(state(0, 0, 0.3), celestial(-0.6));
    check(luma(clouds.uniforms.uCloudShade.value) < 0.15 && luma(clouds.uniforms.uCloudShade.value) > 0.02, 'Noc: chmury ciemne, rozjaśnione księżycem');
    check(clouds.uniforms.uCloudLight.value.x < 0, 'Noc: światło chmur od księżyca');
    check(clouds.uniforms.uCloudFlow.value.length() > 0.99, 'Smugi pierzastych ułożone z przepływem');

    clouds.update({ ...state(1, 0, 0), space: 0.8 }, celestial(0.8));
    check(clouds.uniforms.uCloudView.value.w === 0, 'W kosmosie chmury ma kula Ziemi');

    clouds.dispose();
    weather.dispose();
}


// --- 10. Słowa, prognoza, komenda --------------------------------------------------

{
    const sky = (values) => TEXT.skyKey({ ...emptySample(), ...values });

    equal(sky({}), 'pogodnie', 'Puste niebo: pogodnie');
    equal(sky({ high: 0.6 }), 'pierzaste', 'Chmury wysokie');
    equal(sky({ mid: 0.7 }), 'srednie', 'Chmury średnie');
    equal(sky({ low: 0.3 }), 'klebiaste', 'Chmury kłębiaste');
    equal(sky({ low: 0.95, thick: 0.2 }), 'pochmurno', 'Pochmurno');
    equal(sky({ low: 0.95, thick: 0.6 }), 'ciemne', 'Ciemne chmury');
    equal(sky({ low: 1, rain: 0.3 }), 'deszcz', 'Deszcz');
    equal(sky({ low: 1, rain: 0.8 }), 'ulewa', 'Ulewa');
    equal(sky({ low: 1, rain: 0.8, storm: 0.5 }), 'burza', 'Burza wygrywa');

    for (const key of Object.values({ a: 'burza', b: 'pogodnie', c: 'mzawka', d: 'duze' })) check(key in TEXT.SKY_NAMES, `Nazwa nieba: ${key}`);

    equal(TEXT.windFrom(0), 'z zachodu', 'Wiatr lecący na wschód wieje z zachodu');
    equal(TEXT.windFrom(Math.PI / 2), 'z północy', 'Wiatr lecący na południe (+z) wieje z północy');
    equal(TEXT.sideName(Math.PI), 'zachód', 'Kierunek: zachód');
    equal(TEXT.sideName(-Math.PI / 2), 'północ', 'Kierunek: północ to -z');
    equal(TEXT.clockText(3.5), '12:00', 'Godzina: południe');
    equal(TEXT.clockText(7.75), '18:00', 'Godzina: wieczór');
    equal(TEXT.windName(0.2), 'cisza', 'Wiatr: cisza');
    equal(TEXT.windName(9), 'wichura', 'Wiatr: wichura');

    const field = new WeatherField('lepidolit');
    const lines = TEXT.forecastLines(field, 0, 0, 3.4);

    check(lines.length >= 2 && lines.length <= 12 && lines[0].startsWith('teraz: '), 'Prognoza zaczyna się od "teraz"');
    check(lines.slice(1).every((line) => /^(jutro |pojutrze )?\d\d:\d\d \(za \d+ min\): /.test(line)), 'Prognoza: godzina, za ile minut, niebo i wiatr');

    const first = field.forecast(0, 0, 3.4, 1.5, 1 / 48);

    equal(first.length, 73, 'Prognoza: próbka co pół godziny gry przez półtorej doby');
    equal(TEXT.skyKey(first[0]), TEXT.skyKey(field.sample(0, 0, 3.4, emptySample())), 'Prognoza na teraz = obecna pogoda');

    // Komenda /pogoda na atrapie gry.
    const command = WEATHER_COMMANDS.find((entry) => entry.name === 'pogoda');
    const weather = new Weather('lepidolit');
    const player = { pos: new THREE.Vector3(10, 70, -20), vel: new THREE.Vector3(), yaw: 0, updateCamera() { this.cameraUpdated = true; } };
    const world = { ensureColumnLoaded() {}, getSurfaceY: () => 64 };
    const game = { weather, time: { days: seasonStart(1) + 3.6 }, rainOverride: null };
    const run = (...args) => command.run(args, { game, player, world });

    weather.update(game.time.days, 0.016, player.pos.x, player.pos.z);

    check(run().startsWith('Pogoda: ') && run().includes('bl./s'), '/pogoda: stan nieba i wiatr');
    check(run('prognoza').startsWith('Prognoza dla tego miejsca:\nteraz: '), '/pogoda prognoza');

    check(run('ustaw', 'burza').includes('burze') && weather.field.forced.length === 1 && weather.field.forced[0].speed === 0, '/pogoda ustaw burza: układ stoi nad graczem');
    weather.update(game.time.days, 0.016, player.pos.x, player.pos.z);
    check(weather.local.low > 0.3 && run().includes('/pogoda auto'), 'Po /pogoda ustaw pogoda zmienia się od razu');

    check(run('ustaw', 'front-chlodny', 'nadciaga').startsWith('Nadciąga front chłodny') && weather.field.forced.length === 1 && weather.field.forced[0].speed > FLOW_SPEED, '/pogoda ustaw ... nadciaga: układ daleko, w ruchu');
    check(run('ustaw', 'Front-Ciepły').includes('front ciepły'), 'Rodzaj pogody z polskimi znakami i wielkimi literami');

    game.rainOverride = 0.4;
    equal(run('auto'), 'Pogoda znów liczy się sama.', '/pogoda auto');
    check(weather.field.forced.length === 0 && game.rainOverride === null, '/pogoda auto zdejmuje układy i deszcz z komendy');

    check(run('deszcz', '40').includes('40%') && game.rainOverride === 0.4, '/pogoda deszcz 40');
    check(run('deszcz').includes('100%') && game.rainOverride === 1, '/pogoda deszcz');
    check(run('sucho').includes('wyłączony') && game.rainOverride === 0, '/pogoda sucho');

    const found = run('znajdz', 'front-chlodny');

    check(found.startsWith('Najbliżej: front chłodny') || found.startsWith('W promieniu'), '/pogoda znajdz');

    for (const kind of ['pogodnie', 'pochmurno', 'front-cieply', 'front-chlodny', 'burza', 'przelotne', 'pierzaste']) {

        const text = run('znajdz', kind, 'tp');

        if (text.startsWith('Przeniesiono')) {
            check(player.cameraUpdated && player.pos.y === 64, `/pogoda znajdz ${kind} tp przenosi na powierzchnię`);
            break;
        }

    }

    for (const bad of [['ustaw'], ['ustaw', 'grad'], ['ustaw', 'burza', 'teraz'], ['znajdz', 'cos'], ['deszcz', '150'], ['nic']]) {
        assert.throws(() => run(...bad), `Błędna komenda: /pogoda ${bad.join(' ')}`);
        checks++;
    }

    assert.throws(() => command.run([], { game: null, player, world }), 'Poza światem /pogoda nie działa');
    checks++;

    equal(command.complete(['']), ['prognoza', 'ustaw', 'znajdz', 'auto', 'deszcz', 'sucho', 'mgla', 'tecza', 'piorun', 'grad', 'temperatura', 'snieg', 'pokrywa', 'szron', 'pyl', 'haboob', 'wir', 'sztorm'], 'Podpowiedzi: polecenia');
    check(command.complete(['ustaw', '']).includes('front-chlodny') && command.complete(['znajdz', '']).includes('burza'), 'Podpowiedzi: rodzaje pogody');
    equal(command.complete(['ustaw', 'burza', '']), ['nadciaga'], 'Podpowiedzi: nadciaga');
    equal(command.complete(['znajdz', 'burza', '']), ['tp'], 'Podpowiedzi: tp');
    equal(command.complete(['prognoza', '']), [], 'Podpowiedzi: nic po prognozie');

    weather.dispose();
}


// --- 11. Wpięcie w grę ------------------------------------------------------------

{
    const gameSource = source('src/game/Game.js');
    const sky = source('src/sky/Sky.js');

    check(gameSource.indexOf('this.updateWeather(dt);') > 0 && gameSource.indexOf('this.updateWeather(dt);') < gameSource.indexOf('this.sky.update(this.time.days, dt'), 'Pogoda liczy się przed niebem');
    check((gameSource.match(/this\.updateWeather\(dt\);/g) ?? []).length === 2, 'Pogoda płynie także, gdy teren pod graczem się wczytuje');
    check(gameSource.includes('this.sky.cloudCover = Math.max(') && gameSource.includes('this.sky.cloudDepth ='), 'Zachmurzenie zmienia światło świata');
    check(gameSource.includes('this.sky.renderCloudsBelow?.(renderer, camera)'), 'Chmury pod kamerą rysują się po świecie');
    check(gameSource.includes('this.wind = this.weather.wind;') && !gameSource.includes('windAt('), 'Liście i smugi wiatru niesie wiatr z pogody');
    check(gameSource.includes('plantWindUniforms.uPlantSway.value = this.settings.get(\'plantWind\') ? this.weather.sway : 0'), 'Rośliny kołyszą się z siłą wiatru');
    check(gameSource.includes('this.rainOverride ?? (local.rain > 0.04 ? local.rain : 0)'), 'Pada tam, gdzie mówi pogoda');
    check(gameSource.includes('this.weather.dispose();'), 'Pogoda sprzątana przy wyjściu ze świata');
    check(gameSource.includes("profile?.beginStage('weather')") && PERF_STAGES.some(([id]) => id === 'weather'), 'Pogoda ma swój etap w pomiarze wydajności');

    check(sky.includes('this.clouds?.render(renderer, skyCamera, camera, 0)') && sky.includes('renderCloudsBelow(renderer, camera)'), 'Niebo rysuje chmury w dwóch przebiegach');
    check(sky.includes('this.cloudDepth') && sky.includes('sample.direct = sample.direct.map((c) => c * dim)'), 'Gruba chmura przyciemnia światło');

    equal(SETTINGS_DEFAULTS.clouds, 'pelne', 'Ustawienie: chmury pełne');
    equal(SETTINGS_DEFAULTS.cloudShadows, true, 'Ustawienie: cienie chmur włączone');
    equal(SETTINGS_CHOICES.clouds, ['pelne', 'plaskie', 'brak'], 'Ustawienie chmur: trzy poziomy');
    check(source('src/ui/settingsLayout.js').includes("'clouds',") && source('src/ui/texts.js').includes('clouds: (value)') && source('src/commands/settingsCommands.js').includes("chmury: 'clouds'"), 'Chmury w menu ustawień i w /ustaw');
    check(gameSource.includes("potato && clouds === 'pelne' ? 'plaskie' : clouds"), 'Tryb ziemniaka: chmury płaskie');

    // Jakość grafiki: niska i średnia z chmurami płaskimi, telefon też.
    const { GRAPHICS_PRESETS, Settings, graphicsPreset } = await import('../src/settings/Settings.js');
    const { TOUCH_SETTINGS } = await import('../src/config.js');

    equal(Object.values(GRAPHICS_PRESETS).map((preset) => preset.clouds), ['plaskie', 'plaskie', 'pelne', 'pelne'], 'Jakość grafiki ustawia chmury');
    equal(TOUCH_SETTINGS.clouds, 'plaskie', 'Telefon zaczyna z chmurami płaskimi');

    // Zapis sprzed 1.11.0 (bez chmur): jakość zostaje ta sama.
    const stored = (values) => { globalThis.localStorage = { getItem: () => JSON.stringify({ revision: 3, ...values }), setItem() {}, removeItem() {} }; return new Settings(); };
    const { clouds: mediumClouds, ...oldMedium } = GRAPHICS_PRESETS.medium;
    const { clouds: ultraClouds, ...oldUltra } = GRAPHICS_PRESETS.ultra;

    equal(graphicsPreset(stored(oldMedium)), 'medium', 'Stary zapis ze średnią jakością zostaje średnią (chmury płaskie)');
    equal(graphicsPreset(stored(oldUltra)), 'ultra', 'Stary zapis z najwyższą jakością - chmury pełne');
    equal(stored({ ...oldMedium, clouds: 'pelne' }).get('clouds'), 'pelne', 'Wybór gracza zostaje');

    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

    const map = source('src/ui/TerrainMap.js');

    check(map.includes("pogoda: 'pogoda (chmury, opady, fronty, wiatr)'") && map.includes('MAP_SCALES = [1, 2, 4, 8, 16, 32, 64]') && map.includes('updateWeather()'), 'Mapa: warstwa pogody i skala 64');
    check(source('src/main.js').includes('terrainMap.weather = game.weather;'), 'Mapa dostaje pogodę z gry');
    check(source('src/commands/gameCommands.js').includes('...WEATHER_COMMANDS') && !source('src/commands/worldCommands.js').includes("name: 'pogoda'"), 'Jedna komenda /pogoda');

    const { ACHIEVEMENTS } = await import('../src/achievements/list.js').catch(() => ({ ACHIEVEMENTS: null }));

    if (ACHIEVEMENTS) {

        const byId = Object.fromEntries(ACHIEVEMENTS.map((entry) => [entry.id, entry]));
        const stub = (local, extra = {}) => ({
            weather: { ready: true, field: { forced: [] }, local: { ...emptySample(), ...local }, wind: { speed: 2 }, base: 220, ...extra.weather },
            rainOverride: null, sky: { state: { daylight: 1 } }, camera: { position: { y: 70 } }, ...extra.game
        });

        for (const id of ['first_rain', 'strong_wind', 'cloudless', 'head_in_clouds']) check(byId[id]?.check, `Osiągnięcie ${id}`);

        check(byId.first_rain.check(stub({ rain: 0.4 })) && !byId.first_rain.check(stub({ rain: 0.05 })), 'Pierwsze krople: w deszczu');
        check(!byId.first_rain.check(stub({ rain: 0.4 }, { weather: { field: { forced: [{}] } } })), 'Pogoda z komendy nie daje osiągnięć');
        check(!byId.first_rain.check(stub({ rain: 0.4 }, { game: { rainOverride: 1 } })), 'Deszcz z komendy nie daje osiągnięcia');
        check(byId.strong_wind.check(stub({}, { weather: { wind: { speed: 6.5 } } })) && !byId.strong_wind.check(stub({})), 'Wiatr we włosach: silny wiatr');
        check(byId.cloudless.check(stub({ clear: 0.95 })) && !byId.cloudless.check(stub({ clear: 0.95, high: 0.2 })), 'Ani jednej chmurki: środek wyżu');
        check(byId.head_in_clouds.check(stub({ low: 0.8 }, { game: { camera: { position: { y: 232 } } } })) && !byId.head_in_clouds.check(stub({ low: 0.8 })), 'Głowa w chmurach: w chmurze');

    }
    else {
        check(source('src/achievements/list.js').includes("id: 'first_rain'"), 'Osiągnięcia pogody są na liście');
    }
}

console.log(`OK: pogoda - ${checks} sprawdzeń (pole i fronty, pory roku i klimat, mapa pogody, światło i cienie, wiatr, szum chmur, komenda, mapa, ustawienia, osiągnięcia).`);
