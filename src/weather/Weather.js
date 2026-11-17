import * as THREE from 'three';

import { seasonWeights } from '../sky/Seasons.js';

import { CHUNK_HEIGHT, SEA_LEVEL } from '../config.js';

import { WeatherField, DAY_SECONDS, FLOW_SPEED, TEMP_LAPSE, emptySample, snowShare, tempAtHeight } from './WeatherField.js';
import { cloudNoiseTexture } from './CloudNoise.js';
import { cloudUniforms, CLOUD_LEVELS, CLOUD_THICKNESS, CLOUD_TILES } from './cloudShader.js';

// ------------------------------------------------------------
// POGODA W GRZE (1.11.0)
//
// Łączy pole pogody (WeatherField.js) z resztą gry:
//   - local   - pogoda nad graczem (wygładzona, żeby światło i wiatr
//               nie skakały),
//   - map     - mapa pogody wokół gracza w teksturze: z niej shadery
//               rysują chmury i ich cienie,
//   - wind    - wiatr w miejscu gracza razem z porywami (rośliny,
//               liście, smugi wiatru),
//   - overcast, depth - ile nieba zasłaniają chmury i jak są grube
//               (światło świata: Sky.cloudCover, Sky.cloudDepth).
// Wszystko liczy się z czasu gry - update(days, ...) co klatkę.
// ------------------------------------------------------------

// Mapa pogody: WEATHER_MAP_SIZE punktów na bok, punkt co
// WEATHER_MAP_TEXEL bloków (razem ponad 16 km - tyle widać chmur).
export const WEATHER_MAP_SIZE = 128;
export const WEATHER_MAP_TEXEL = 128;

// Ile wierszy mapy odświeża się w jednej klatce. Front przesuwa się
// o jeden punkt mapy w ponad 20 s, a cała mapa odświeża się w ok. 2 s.
const ROWS_PER_FRAME = 1;

// O ile wyżej albo niżej stoi podstawa chmur w porach roku
// (wiosna, lato, jesień, zima).
const SEASON_BASE = [0, 22, -10, -24];

// Mokra ziemia: po tylu dobach gry deszcz zmoczy ją całkiem (ok. 25 s),
// a po tylu wyschnie (ok. 6 minut).
const WETTING_DAYS = 0.02;
const DRYING_DAYS = 0.3;

// Świeży opad (od 1.14.0 - z niego bierze się świeży śnieg): po tylu
// dobach gry ulewa zasypie ziemię całkiem (ok. 36 s; słabszy opad
// dłużej), przy jednym stopniu ciepła topnieje w tyle dób (im cieplej,
// tym szybciej), a na mrozie leży kilka dób.
const SNOW_FALL_DAYS = 0.03;
const SNOW_MELT_DAYS = 0.25;
const SNOW_COLD_DAYS = 3;

// Temperatury w teksturze: bajt 0-255 to zakres od TEMP_MIN, szeroki na
// TEMP_SPAN stopni.
export const TEMP_MIN = -40;
export const TEMP_SPAN = 80;

// Zimowa pokrywa śnieżna: leży cała, gdy średnia temperatura (pora roku,
// klimat, wysokość) spada do pierwszej liczby, a znika przy drugiej.
// Świeży śnieg trzyma się do trzeciej i znika przy czwartej (temperatura
// chwili).
export const SNOW_COVER = Object.freeze({ lying: [-3, 1], fresh: [-1, 1.5] });

const tempByte = (temp) => Math.max(0, Math.min(255, Math.round((temp - TEMP_MIN) / TEMP_SPAN * 255)));


// Pokrywa śnieżna 0-1 z odczytu mapy - ten sam rachunek co w shaderze
// (cloudShader.js - snowCoverAt): zimowa pokrywa z powolnej temperatury
// albo świeży śnieg z niedawnego opadu, gdy jest dość zimno.

export function snowCover(fresh, tempNow, tempSlow) {

    const lying = 1 - ramp(SNOW_COVER.lying[0], SNOW_COVER.lying[1], tempSlow);
    const recent = fresh * (1 - ramp(SNOW_COVER.fresh[0], SNOW_COVER.fresh[1], tempNow));

    return Math.max(lying, recent);

}

const mod = (value, size) => ((value % size) + size) % size;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function ramp(a, b, x) {

    const t = clamp01((x - a) / (b - a));

    return t * t * (3 - 2 * t);

}


// Mapa pogody w teksturze. Punkt świata (ix, iz) leży zawsze w tym samym
// miejscu tekstury (zawinięcie), więc gdy gracz idzie, dolicza się tylko
// nowy pasek z przodu - reszta zostaje.

export class WeatherMap {

    constructor(field) {

        const N = WEATHER_MAP_SIZE;

        this.field = field;
        this.data = new Uint8Array(N * N * 4);

        this.texture = new THREE.DataTexture(this.data, N, N, THREE.RGBAFormat);
        this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
        this.texture.generateMipmaps = false;

        // Druga tekstura (od 1.12.0): R opad, G burza, B mokra ziemia,
        // A mgła. Mokra ziemia pamięta deszcz: moknie w kilkadziesiąt
        // sekund, schnie kilka minut - dlatego trzyma własny stan (wet)
        // i czas ostatniego liczenia każdego punktu (wetTime).
        this.rain = new Uint8Array(N * N * 4);
        this.rainTexture = new THREE.DataTexture(this.rain, N, N, THREE.RGBAFormat);
        this.rainTexture.wrapS = this.rainTexture.wrapT = THREE.RepeatWrapping;
        this.rainTexture.magFilter = this.rainTexture.minFilter = THREE.LinearFilter;
        this.rainTexture.generateMipmaps = false;

        this.wet = new Float32Array(N * N);
        this.wetTime = new Float64Array(N * N).fill(-1);

        // Trzecia tekstura (od 1.14.0): R świeży opad (pamięta go jak
        // mokra ziemia deszcz), G temperatura teraz, B temperatura powolna
        // (pora roku i klimat) - obie na poziomie morza - A szron.
        this.snow = new Uint8Array(N * N * 4);
        this.snowTexture = new THREE.DataTexture(this.snow, N, N, THREE.RGBAFormat);
        this.snowTexture.wrapS = this.snowTexture.wrapT = THREE.RepeatWrapping;
        this.snowTexture.magFilter = this.snowTexture.minFilter = THREE.LinearFilter;
        this.snowTexture.generateMipmaps = false;

        this.fresh = new Float32Array(N * N);
        this.temp = new Float32Array(N * N);
        this.tempSlow = new Float32Array(N * N);

        // Najniższe temperatury i największy szron w oknie (z ostatniego
        // pełnego obiegu) - czy śnieg i szron są w ogóle możliwe.
        this.minTemp = 20;
        this.minSlow = 20;
        this.maxFrost = 0;
        this.sweepTemp = 99;
        this.sweepSlow = 99;
        this.sweepFrost = 0;
        this.maxFresh = 0;
        this.sweepFresh = 0;

        // Największy opad i burza w oknie (z ostatniego pełnego obiegu).
        this.maxRain = 0;
        this.sweepRain = 0;
        this.maxStorm = 0;
        this.sweepStorm = 0;

        // Lewy górny róg okna (w punktach mapy) albo null przed pierwszym
        // liczeniem.
        this.originX = null;
        this.originZ = null;

        this.row = 0;
        this.systems = [];
        this.sample = emptySample();

        // Największe piętrzenie chmur w oknie (z ostatniego pełnego obiegu).
        this.maxThick = 0;
        this.sweepThick = 0;
        this.sweepTime = 0;

    }


    // keep - punkt był już w oknie: mokra ziemia pamięta poprzedni stan.
    // Nowe paski i liczenie od nowa zaczynają od tego, co pada teraz.

    writeRow(iz, x0, x1, t, keep = false) {

        const N = WEATHER_MAP_SIZE;
        const sample = this.sample;
        const z = (iz + 0.5) * WEATHER_MAP_TEXEL;
        const row = mod(iz, N) * N;

        for (let ix = x0; ix < x1; ix++) {

            this.field.sample((ix + 0.5) * WEATHER_MAP_TEXEL, z, t, sample, this.systems);

            const k = (row + mod(ix, N)) * 4;

            this.data[k] = Math.round(sample.low * 255);
            this.data[k + 1] = Math.round(sample.thick * 255);
            this.data[k + 2] = Math.round(sample.mid * 255);
            this.data[k + 3] = Math.round(sample.high * 255);

            if (sample.low > 0.03 && sample.thick > this.sweepThick) {
                this.sweepThick = sample.thick;
            }

            const cell = k >> 2;
            // (Mokro robi się od deszczu, nie od śniegu.)
            const target = Math.min(1, sample.rain * 3) * (1 - snowShare(sample.temp));
            const elapsed = t - this.wetTime[cell];
            const remembered = keep && this.wetTime[cell] >= 0 && elapsed >= 0;

            let wet = target;

            if (remembered) {

                const before = this.wet[cell];

                wet = target > before
                    ? Math.min(target, before + elapsed / WETTING_DAYS)
                    : Math.max(target, before - elapsed / DRYING_DAYS);

            }

            this.wet[cell] = wet;
            this.wetTime[cell] = t;

            this.rain[k] = Math.round(sample.rain * 255);
            this.rain[k + 1] = Math.round(sample.storm * 255);
            this.rain[k + 2] = Math.round(wet * 255);
            this.rain[k + 3] = Math.round(sample.fog * 255);

            // Świeży opad: przybywa, póki pada (im mocniej, tym szybciej),
            // w cieple topnieje, na mrozie leży.

            let fresh = Math.min(1, sample.rain * 2.5);

            if (remembered) {

                const melt = sample.temp > 0
                    ? (1 + sample.temp / 3) / SNOW_MELT_DAYS
                    : 1 / SNOW_COLD_DAYS;

                fresh = clamp01(this.fresh[cell] + elapsed * (sample.rain / SNOW_FALL_DAYS - melt));

            }

            this.fresh[cell] = fresh;
            this.temp[cell] = sample.temp;
            this.tempSlow[cell] = sample.tempSlow;

            this.snow[k] = Math.round(fresh * 255);
            this.snow[k + 1] = tempByte(sample.temp);
            this.snow[k + 2] = tempByte(sample.tempSlow);
            this.snow[k + 3] = Math.round(sample.frost * 255);

            if (sample.temp < this.sweepTemp) this.sweepTemp = sample.temp;
            if (sample.tempSlow < this.sweepSlow) this.sweepSlow = sample.tempSlow;
            if (sample.frost > this.sweepFrost) this.sweepFrost = sample.frost;

            if (fresh > this.sweepFresh) {
                this.sweepFresh = fresh;
                if (fresh > this.maxFresh) this.maxFresh = fresh;
            }

            if (sample.rain > this.sweepRain) {
                this.sweepRain = sample.rain;
            }

            if (sample.storm > this.sweepStorm) {

                this.sweepStorm = sample.storm;

                // Nadciągająca burza liczy się od razu, nie po obiegu.
                if (sample.storm > this.maxStorm) this.maxStorm = sample.storm;

            }

        }

    }


    // Lista układów na czas jednego obiegu. Cały obieg liczy się dla tej
    // samej chwili (sweepTime) - układy i próbki muszą do siebie pasować.

    gather(x, z, t) {

        this.sweepTime = t;
        this.field.systemsNear(x, z, t, WEATHER_MAP_SIZE * WEATHER_MAP_TEXEL * 0.5, this.systems);

    }


    // Co klatkę: okno podąża za graczem, a jeden wiersz dostaje świeżą
    // pogodę. force - przelicz wszystko od razu (np. po /pogoda ustaw).

    update(x, z, t, force = false) {

        const N = WEATHER_MAP_SIZE;
        const originX = Math.floor(x / WEATHER_MAP_TEXEL) - N / 2;
        const originZ = Math.floor(z / WEATHER_MAP_TEXEL) - N / 2;
        const shiftX = this.originX === null ? N : originX - this.originX;
        const shiftZ = this.originZ === null ? N : originZ - this.originZ;

        if (force || Math.abs(shiftX) >= N || Math.abs(shiftZ) >= N) {

            // Pierwsze liczenie albo daleki skok: całe okno od nowa.

            this.gather(x, z, t);
            this.sweepThick = 0;
            this.sweepRain = 0;
            this.sweepStorm = 0;
            this.sweepTemp = this.sweepSlow = 99;
            this.sweepFrost = this.sweepFresh = 0;

            // (Po /pogoda ustaw - force - okno stoi w miejscu, więc mokra
            // ziemia zostaje; po dalekim skoku zaczyna od nowa.)
            const keep = force && Math.abs(shiftX) < N && Math.abs(shiftZ) < N;

            for (let iz = originZ; iz < originZ + N; iz++) {
                this.writeRow(iz, originX, originX + N, t, keep);
            }

            this.maxThick = this.sweepThick;
            this.maxRain = this.sweepRain;
            this.maxStorm = this.sweepStorm;
            this.minTemp = this.sweepTemp;
            this.minSlow = this.sweepSlow;
            this.maxFrost = this.sweepFrost;
            this.maxFresh = this.sweepFresh;
            this.row = 0;

        }
        else {

            if (shiftX !== 0 || shiftZ !== 0) {

                // Nowe paski na brzegu okna - dla chwili bieżącego obiegu
                // (lista układów sięga z zapasem poza okno).

                t = this.sweepTime;
                this.gather(x, z, t);

                const fromX = shiftX > 0 ? originX + N - shiftX : originX;
                const toX = shiftX > 0 ? originX + N : originX - shiftX;

                if (shiftX !== 0) {
                    for (let iz = originZ; iz < originZ + N; iz++) {
                        this.writeRow(iz, fromX, toX, t);
                    }
                }

                const fromZ = shiftZ > 0 ? originZ + N - shiftZ : originZ;
                const toZ = shiftZ > 0 ? originZ + N : originZ - shiftZ;

                for (let iz = fromZ; iz < toZ; iz++) {
                    this.writeRow(iz, originX, originX + N, t);
                }

            }

            // Obieg odświeżania: na początku obiegu nowa lista układów.

            for (let k = 0; k < ROWS_PER_FRAME; k++) {

                if (this.row === 0) {
                    this.gather(x, z, t);
                    this.sweepThick = 0;
                    this.sweepRain = 0;
                    this.sweepStorm = 0;
                    this.sweepTemp = this.sweepSlow = 99;
                    this.sweepFrost = this.sweepFresh = 0;
                }

                this.writeRow(originZ + this.row, originX, originX + N, this.sweepTime, true);
                this.row++;

                if (this.row >= N) {
                    this.row = 0;
                    this.maxThick = this.sweepThick;
                    this.maxRain = this.sweepRain;
                    this.maxStorm = this.sweepStorm;
                    this.minTemp = this.sweepTemp;
                    this.minSlow = this.sweepSlow;
                    this.maxFrost = this.sweepFrost;
                    this.maxFresh = this.sweepFresh;
                }

            }

        }

        this.originX = originX;
        this.originZ = originZ;
        this.texture.needsUpdate = true;
        this.rainTexture.needsUpdate = true;
        this.snowTexture.needsUpdate = true;

    }


    // Odczyt z mapy po stronie gry (najbliższy punkt): kanał drugiej
    // tekstury w miejscu (x, z): 0 opad, 1 burza, 2 mokra ziemia, 3 mgła.

    read(x, z, channel) {

        const N = WEATHER_MAP_SIZE;
        const ix = mod(Math.floor(x / WEATHER_MAP_TEXEL), N);
        const iz = mod(Math.floor(z / WEATHER_MAP_TEXEL), N);

        return channel === 2 ? this.wet[iz * N + ix] : this.rain[(iz * N + ix) * 4 + channel] / 255;

    }


    // Świeży opad zapamiętany w miejscu (x, z), 0-1 (najbliższy punkt).

    freshAt(x, z) {

        const N = WEATHER_MAP_SIZE;

        return this.fresh[mod(Math.floor(z / WEATHER_MAP_TEXEL), N) * N + mod(Math.floor(x / WEATHER_MAP_TEXEL), N)];

    }


    // Zasypuje albo czyści świeży opad w całym oknie (komenda).

    fillFresh(value) {

        this.fresh.fill(value);
        this.maxFresh = this.sweepFresh = value;

        for (let k = 0; k < this.snow.length; k += 4) {
            this.snow[k] = Math.round(value * 255);
        }

        this.snowTexture.needsUpdate = true;

    }


    dispose() {

        this.texture.dispose();
        this.rainTexture.dispose();
        this.snowTexture.dispose();

    }

}


export class Weather {

    // seed    - ziarno świata,
    // climate - opcjonalnie (x, z) => wilgotność miejsca -1..1.

    constructor(seed, { climate = null } = {}) {

        this.field = new WeatherField(seed, { climate });
        this.map = new WeatherMap(this.field);

        this.raw = emptySample();
        this.local = emptySample();
        this.ready = false;

        this.days = 0;
        this.clock = 0;

        this.overcast = 0;
        this.depth = 0;

        this.wind = { x: 0, z: 0, speed: 0, gust: 0, angle: 0 };

        // Jak mocno kołyszą się rośliny (1 - zwykły wiatr).
        this.sway = 1;

        // Cienie chmur na terenie (ustawienie).
        this.shadows = true;

        // Mokra ziemia i kałuże na terenie (ustawienie).
        this.wetSurfaces = true;

        // Mokra ziemia pod graczem (0-1, z mapy - pamięta niedawny deszcz).
        this.wetness = 0;

        // Mgła nad graczem (0-1): poranna z pola pogody, lekka po deszczu
        // albo ustawiona komendą (fogOverride: 0-1 albo null).
        this.fog = 0;
        this.fogOverride = null;

        // Tęcza i halo (0-1) - setSky. rainbowOverride: komenda /pogoda tecza.
        this.rainbow = 0;
        this.halo = 0;
        this.rainbowOverride = null;

        // Grad (od 1.13.0): ile go teraz pada (0-1; hailOverride - komenda
        // /pogoda grad) i ile leży na ziemi (hailCover) wokół miejsca,
        // w którym spadł (hailSpot).
        this.hail = 0;
        this.hailOverride = null;
        this.hailCover = 0;
        this.hailSpot = { x: 0, z: 0 };

        // Zima (od 1.14.0). temperature - temperatura powietrza tam, gdzie
        // stoi gracz (na jego wysokości), snowShare - jaka część opadu jest
        // śniegiem (0 deszcz, 1 śnieg), snowCover - ile śniegu leży pod
        // graczem (0-1), frost - szron (0-1). snowSurfaces - ustawienie
        // "Pokrywa śnieżna". coverOverride, frostOverride - komendy.
        this.temperature = 10;
        this.snowShare = 0;
        this.snowCover = 0;
        this.frost = 0;
        this.snowSurfaces = true;
        this.coverOverride = null;
        this.frostOverride = null;

        this.thickness = CLOUD_THICKNESS[0];
        this.base = CLOUD_LEVELS.low;
        this.season = [0, 0, 0, 0];
        this.refresh = false;

        cloudUniforms.uWeatherMap.value = this.map.texture;
        cloudUniforms.uWeatherRain.value = this.map.rainTexture;
        cloudUniforms.uWeatherSnow.value = this.map.snowTexture;
        cloudUniforms.uCloudNoise.value = cloudNoiseTexture();
        cloudUniforms.uWeatherScale.value = 1 / (WEATHER_MAP_SIZE * WEATHER_MAP_TEXEL);

    }


    // days - czas gry, dt - czas klatki (s), (x, z) - gdzie jest gracz,
    // y - na jakiej wysokości (temperatura spada z wysokością).

    update(days, dt, x, z, y = SEA_LEVEL) {

        this.days = days;
        this.clock += dt;

        const raw = this.field.sample(x, z, days, this.raw);
        const local = this.local;

        // Wygładzenie w czasie (ok. 1,5 s); pierwsza próbka od razu.
        const k = this.ready ? 1 - Math.exp(-Math.max(0, dt) / 1.5) : 1;

        for (const key of ['low', 'thick', 'mid', 'high', 'rain', 'storm', 'hail', 'clear', 'fog', 'windX', 'windZ', 'gust', 'temp', 'tempSlow', 'frost']) {
            local[key] += (raw[key] - local[key]) * k;
        }

        local.speed = Math.hypot(local.windX, local.windZ);
        local.angle = Math.atan2(local.windZ, local.windX);

        this.ready = true;

        // Ile nieba jest zasłonięte (do światła świata): chmury niskie
        // liczą się dopiero, gdy się zamykają - między kłębami świeci
        // słońce, a ich cienie rysują się osobno.

        this.overcast = clamp01(
            ramp(0.5, 0.95, local.low) +
            0.5 * ramp(0.45, 1, local.mid) * (1 - ramp(0.5, 0.95, local.low)) +
            0.18 * local.high
        );

        // Grube, piętrzące się chmury (deszczowe, burzowe) - ciemniej.
        this.depth = ramp(0.7, 1, local.low) * ramp(0.35, 0.95, local.thick);

        this.map.update(x, z, days, this.refresh);
        this.refresh = false;

        // Mokra ziemia pod graczem i mgła: po deszczu, gdy przestaje
        // padać, nad mokrą ziemią unosi się lekka mgiełka.

        this.wetness = this.map.read(x, z, 2);
        this.fog = clamp01(this.fogOverride ?? Math.max(local.fog, 0.2 * this.wetness * ramp(0.12, 0.02, local.rain)));

        // Mgła zasłania niebo jak chmury.
        this.overcast = Math.max(this.overcast, 0.75 * this.fog);

        this.updateUniforms(days);
        this.updateWind();

        // Kurtyny deszczu na horyzoncie: tylko gdy w okolicy gdzieś pada;
        // smugi pochylają się z wiatrem.

        cloudUniforms.uRainVeil.value.set(
            this.map.maxRain > 0.03 ? 1 : 0, local.angle, Math.min(1.2, local.speed / 9), 0);

        cloudUniforms.uWetness.value = this.wetSurfaces ? 1 : 0;

        // Burza w okolicy: chmury nad nią ciemnieją (shader czyta wtedy
        // jej siłę z mapy).
        cloudUniforms.uStorm.value.x = this.map.maxStorm > 0.03 ? 1 : 0;

        // Grad: nalot rośnie, póki pada (kilkanaście sekund do pełnego),
        // potem topnieje ponad minutę. Leży tam, gdzie spadł.

        this.hail = clamp01(this.hailOverride ?? local.hail);

        const step = Math.max(0, Math.min(0.5, dt));

        if (this.hail > 0.05) {
            this.hailCover = Math.min(1, this.hailCover + step * this.hail / 14);
            this.hailSpot.x = x;
            this.hailSpot.z = z;
        }
        else {
            this.hailCover = Math.max(0, this.hailCover - step / 80);
        }

        cloudUniforms.uHailGround.value.set(this.hailSpot.x, this.hailSpot.z, this.wetSurfaces ? this.hailCover : 0);

        // Zima: temperatura na wysokości gracza decyduje, czy pada deszcz,
        // czy śnieg; pokrywa pod graczem - ten sam rachunek co w shaderze.

        // (Nie wyżej niż najwyższy teren - lot ponad chmury nie robi zimy.)
        const height = Math.min(y, CHUNK_HEIGHT);

        this.temperature = tempAtHeight(local.temp, height, SEA_LEVEL);
        this.snowShare = snowShare(this.temperature);
        this.snowCover = this.coverOverride ?? snowCover(this.map.freshAt(x, z), this.temperature, tempAtHeight(local.tempSlow, height, SEA_LEVEL));
        this.frost = clamp01(this.frostOverride ?? local.frost) * (1 - this.snowCover);

        // Shadery liczą śnieg tylko wtedy, gdy gdzieś w oknie mapy może
        // leżeć: w najwyższych górach jest o kilka stopni chłodniej niż
        // na poziomie morza.

        const peaks = TEMP_LAPSE * (CHUNK_HEIGHT - SEA_LEVEL);
        const possible = this.coverOverride !== null ||
            this.map.minSlow - peaks < SNOW_COVER.lying[1] ||
            (this.map.maxFresh > 0.01 && this.map.minTemp - peaks < SNOW_COVER.fresh[1]);

        cloudUniforms.uSnow.value.set(this.snowSurfaces && possible ? 1 : 0, TEMP_LAPSE, SEA_LEVEL, this.coverOverride ?? -1);
        cloudUniforms.uFrost.value = this.snowSurfaces && (this.frostOverride ?? this.map.maxFrost) > 0.02 ? (this.frostOverride ?? -1) : -2;

    }


    // Opad, którego nie ma w polu pogody (komenda /pogoda deszcz albo
    // snieg): zasypuje świeżym opadem okolicę punktu (x, z). amount -
    // natężenie 0-1, days - ile dób gry trwał.

    addPrecipitation(x, z, amount, days) {

        const map = this.map;
        const N = WEATHER_MAP_SIZE;
        const gain = Math.max(0, amount * days / SNOW_FALL_DAYS);
        const cx = Math.floor(x / WEATHER_MAP_TEXEL);
        const cz = Math.floor(z / WEATHER_MAP_TEXEL);

        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {

                const cell = mod(cz + dz, N) * N + mod(cx + dx, N);
                const fresh = Math.min(1, map.fresh[cell] + gain);

                map.fresh[cell] = fresh;
                map.snow[cell * 4] = Math.round(fresh * 255);

                if (fresh > map.maxFresh) map.maxFresh = fresh;

            }
        }

        map.snowTexture.needsUpdate = true;

    }


    // Po zmianie pogody komendą: mapa od razu, bez wygładzania.

    reset() {

        this.refresh = true;
        this.ready = false;

    }


    updateUniforms(days) {

        const seconds = days * DAY_SECONDS;
        const angle = this.field.flow.angle;
        const drift = cloudUniforms.uCloudDrift.value;

        // Wzór płynie z wiatrem: próbkuje się go w miejscu cofniętym
        // o drogę, którą przebył. Każde piętro ma swoją prędkość i trochę
        // inny kierunek; grupy chmur niskich płyną wolniej niż kłęby,
        // więc chmury powoli zmieniają kształt.

        const set = (vector, first, turn, speed, tile) => {

            const distance = seconds * FLOW_SPEED * speed;
            const x = mod(-Math.cos(angle + turn) * distance, tile);
            const z = mod(-Math.sin(angle + turn) * distance, tile);

            if (first) {
                vector.x = x;
                vector.y = z;
            }
            else {
                vector.z = x;
                vector.w = z;
            }

        };

        set(drift[0], true, 0, 1, CLOUD_TILES.low);
        set(drift[0], false, 0.1, 0.86, CLOUD_TILES.group);
        set(drift[1], true, 0.14, 1.25, CLOUD_TILES.mid);
        set(drift[1], false, -0.26, 1.9, CLOUD_TILES.high);

        // Podstawa chmur: latem wyżej, zimą niżej, w deszczu opada.

        const season = seasonWeights(days, 2, this.season);
        const base = CLOUD_LEVELS.low +
            season[0] * SEASON_BASE[0] + season[1] * SEASON_BASE[1] + season[2] * SEASON_BASE[2] + season[3] * SEASON_BASE[3];

        // Grubość warstwy, w której shader szuka chmur: tyle, ile ma
        // najwyższa chmura w okolicy (rośnie od razu, maleje powoli).

        const needed = (CLOUD_THICKNESS[0] + (CLOUD_THICKNESS[1] - CLOUD_THICKNESS[0]) * this.map.maxThick) * 1.3 + 8;

        this.thickness = needed > this.thickness ? needed : this.thickness + (needed - this.thickness) * 0.02;

        // Wysokość podstawy chmur niskich (y świata).
        this.base = base;

        cloudUniforms.uCloudLevels.value.set(base, this.thickness, CLOUD_LEVELS.mid, CLOUD_LEVELS.high);

    }


    // Wiatr z porywami: siła faluje tym mocniej, im bardziej porywisty
    // jest wiatr (front chłodny, burza).

    updateWind() {

        const local = this.local;
        const clock = this.clock;
        const wave = clamp01(0.45 + 0.35 * Math.sin(clock * 0.07) + 0.25 * Math.sin(clock * 0.43 + 0.6));
        const factor = Math.max(0.3, 1 + local.gust * (1.5 * wave - 0.6));

        this.wind.x = local.windX * factor;
        this.wind.z = local.windZ * factor;
        this.wind.speed = local.speed * factor;
        this.wind.gust = wave;
        this.wind.angle = local.angle;

        this.sway = Math.min(3, 0.55 + 0.3 * this.wind.speed);

    }


    // Cień chmur na terenie: kierunek do światła (słońce albo księżyc)
    // i siła. Pod zamkniętym niebem cienie znikają - światło i tak jest
    // rozproszone.

    setLight(direction, enabled = true) {

        const shadow = cloudUniforms.uCloudShadow.value;
        const height = Math.max(direction.y, 0.16);

        shadow.x = enabled && this.shadows
            ? 0.86 * (1 - 0.8 * this.overcast) * ramp(0.02, 0.14, direction.y)
            : 0;
        shadow.y = direction.x / height;
        shadow.z = direction.z / height;

    }


    // Tęcza i halo. sun - kierunek do słońca, light - do światła, które
    // teraz świeci (słońce albo księżyc), daylight 0-1, dt - czas klatki.
    //   tęcza: słońce nisko (do ok. 40° nad horyzontem) i świeci na gracza,
    //          a po przeciwnej stronie nieba pada (albo pada tuż przy nim),
    //   halo:  cienka zasłona chmur wysokich przed słońcem albo księżycem,
    //          bez niższych chmur - zapowiedź frontu ciepłego.

    setSky(sun, light, daylight, dt, x, z) {

        const local = this.local;
        const flat = Math.hypot(sun.x, sun.z);

        let rainbow = 0;

        if (this.rainbowOverride !== null) {
            rainbow = this.rainbowOverride;
        }
        else if (sun.y > 0.02 && sun.y < 0.66 && flat > 0.01) {

            // Deszcz po stronie nieba naprzeciw słońca (z mapy pogody).
            let rain = local.rain;

            for (const distance of [300, 900, 1800, 3000]) {
                rain = Math.max(rain, this.map.read(x - sun.x / flat * distance, z - sun.z / flat * distance, 0));
            }

            rainbow = ramp(0.02, 0.1, sun.y) * ramp(0.66, 0.5, sun.y) * (1 - this.overcast) * clamp01(rain * 3) * daylight;

        }

        const halo = light.y > 0.1
            ? clamp01((local.high - 0.45) * 2.2) * (1 - ramp(0.25, 0.6, local.low)) * (1 - 0.8 * local.mid)
            : 0;

        const k = 1 - Math.exp(-Math.max(0, dt) / 3);

        this.rainbow += (rainbow - this.rainbow) * (this.rainbowOverride !== null ? 1 : k);
        this.halo += (halo - this.halo) * k;

        cloudUniforms.uSkyOptics.value.set(this.rainbow, this.halo, 0, 0);

    }


    dispose() {

        this.map.dispose();

        if (cloudUniforms.uWeatherMap.value === this.map.texture) {
            cloudUniforms.uWeatherMap.value = null;
            cloudUniforms.uWeatherRain.value = null;
            cloudUniforms.uCloudShadow.value.set(0, 0, 0);
            cloudUniforms.uRainVeil.value.set(0, 0, 0, 0);
            cloudUniforms.uSkyOptics.value.set(0, 0, 0, 0);
            cloudUniforms.uWetness.value = 0;
            cloudUniforms.uStorm.value.set(0, 0, 0, 0);
            cloudUniforms.uHailGround.value.set(0, 0, 0);
            cloudUniforms.uWeatherSnow.value = null;
            cloudUniforms.uSnow.value.set(0, 0, 0, -1);
            cloudUniforms.uFrost.value = -2;
        }

    }

}
