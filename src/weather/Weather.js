import * as THREE from 'three';

import { seasonWeights } from '../sky/Seasons.js';

import { WeatherField, DAY_SECONDS, FLOW_SPEED, emptySample } from './WeatherField.js';
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


    writeRow(iz, x0, x1, t) {

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

            for (let iz = originZ; iz < originZ + N; iz++) {
                this.writeRow(iz, originX, originX + N, t);
            }

            this.maxThick = this.sweepThick;
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
                }

                this.writeRow(originZ + this.row, originX, originX + N, this.sweepTime);
                this.row++;

                if (this.row >= N) {
                    this.row = 0;
                    this.maxThick = this.sweepThick;
                }

            }

        }

        this.originX = originX;
        this.originZ = originZ;
        this.texture.needsUpdate = true;

    }


    dispose() {

        this.texture.dispose();

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

        this.thickness = CLOUD_THICKNESS[0];
        this.base = CLOUD_LEVELS.low;
        this.season = [0, 0, 0, 0];
        this.refresh = false;

        cloudUniforms.uWeatherMap.value = this.map.texture;
        cloudUniforms.uCloudNoise.value = cloudNoiseTexture();
        cloudUniforms.uWeatherScale.value = 1 / (WEATHER_MAP_SIZE * WEATHER_MAP_TEXEL);

    }


    // days - czas gry, dt - czas klatki (s), (x, z) - gdzie jest gracz.

    update(days, dt, x, z) {

        this.days = days;
        this.clock += dt;

        const raw = this.field.sample(x, z, days, this.raw);
        const local = this.local;

        // Wygładzenie w czasie (ok. 1,5 s); pierwsza próbka od razu.
        const k = this.ready ? 1 - Math.exp(-Math.max(0, dt) / 1.5) : 1;

        for (const key of ['low', 'thick', 'mid', 'high', 'rain', 'storm', 'clear', 'windX', 'windZ', 'gust']) {
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

        this.updateUniforms(days);
        this.updateWind();

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


    dispose() {

        this.map.dispose();

        if (cloudUniforms.uWeatherMap.value === this.map.texture) {
            cloudUniforms.uWeatherMap.value = null;
            cloudUniforms.uCloudShadow.value.set(0, 0, 0);
        }

    }

}
