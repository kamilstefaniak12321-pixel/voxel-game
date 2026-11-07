import * as THREE from 'three';

import {
    UNDERWATER_FOG_COLOR,
    UNDERWATER_FOG_DENSITY
} from '../config.js';

import {
    isLiquidId,
    isFlowingWaterId
} from '../blocks/BlockRegistry.js';

import { viewUniforms } from '../rendering/viewUniforms.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { WaterfallAudio } from '../audio/WaterfallAudio.js';

// ------------------------------------------------------------
// WODA WOKÓŁ GRACZA - obraz i dźwięk
//
// Co klatkę (Game.update, po ustawieniu kamery):
//   - czy kamera jest pod wodą: wtedy zamiast nieba i zwykłej mgły
//     gęsta, niebieska mgła (nocą ciemna), dźwięki gry są przytłumione
//     i gra pętla "pod wodą", a main.js pokazuje niebieską nakładkę,
//   - plusk przy wpadnięciu do wody (tym głośniejszy, im szybciej)
//     i krople przy wychodzeniu,
//   - szum wody: dwie pętle - strumień (płynąca woda rzek, kolumny
//     z nurtem) i fale (stojąca woda jezior i morza) - z miejsca, gdzie
//     jest woda, tym głośniej, im więcej wody w okolicy (sprawdzane dwa
//     razy na sekundę). Punkt dźwięku jest zawsze co najmniej
//     AMBIENT_MIN_DISTANCE bloków od gracza, na wysokości uszu, i przesuwa
//     się płynnie - szum nie "skacze" i nie przechodzi tuż pod głową
//     (dawniej przestrzenny filtr HRTF dawał wtedy pisk i jęk).
// Ruch w wodzie (pływanie) - src/player/Player.js, wygląd wody -
// src/rendering/BlockRenderData.js (waterMaterial).
// ------------------------------------------------------------

// Jak daleko (w blokach) szukamy wody dla dźwięku fal.
const WAVES_RADIUS = 10;

// Ile kolumn z powierzchnią wody to "pełna" głośność fal.
const WAVES_FULL = 70;

// Co ile sekund liczymy wodę dookoła.
const WAVES_INTERVAL = 0.5;

// Najbliżej (bloki, w poziomie) punktu, z którego słychać szum wody.
const AMBIENT_MIN_DISTANCE = 4;

// Pętle szumu wody: płynąca (kolumny z nurtem rzeki) i stojąca woda.
const WATER_AMBIENCE = [
    { sound: 'water_stream', flowing: true },
    { sound: 'water_waves', flowing: false }
];


const baseFogColor = new THREE.Color(UNDERWATER_FOG_COLOR);


// Punkt dźwięku szumu wody (out): w stronę środka wody (center) od uszu
// (ear), w poziomie co najmniej AMBIENT_MIN_DISTANCE bloków, na wysokości
// uszu. Gdy woda jest dookoła (środek tuż przy graczu) - przed graczem,
// więc szum słychać równo z obu stron. Tak dźwięk nie przechodzi pod
// głową ani przez nią (przestrzenny filtr dawał tam pisk i jęk).

const forward = new THREE.Vector3();

function ambientPosition(out, center, ear, camera) {

    let dx = center.x - ear.x;
    let dz = center.z - ear.z;
    let length = Math.hypot(dx, dz);

    if (length < 1.5) {

        // Woda dookoła: kierunek mieszamy z kierunkiem patrzenia (blisko
        // środka - prawie tylko patrzenie), bez nagłego przeskoku.
        camera.getWorldDirection(forward);
        const look = Math.hypot(forward.x, forward.z) || 1;
        const k = length / 1.5;
        dx = dx * k + forward.x / look * (1 - k) * 1.5;
        dz = dz * k + forward.z / look * (1 - k) * 1.5;
        length = Math.hypot(dx, dz) || 1;

    }

    const reach = Math.max(AMBIENT_MIN_DISTANCE, length);

    out.set(ear.x + dx / length * reach, ear.y, ear.z + dz / length * reach);

}


export class WaterEffects {

    constructor(game) {

        this.game = game;

        // Czy kamera jest pod wodą.
        this.underwater = false;

        this.underwaterLoop = null;
        this.waterfallAudio = new WaterfallAudio(game);

        // Szum wody: strumień i fale (WATER_AMBIENCE) - każdy ze swoją
        // pętlą, głośnością i środkiem wody.
        this.ambience = WATER_AMBIENCE.map(({ sound, flowing }) => ({
            sound,
            flowing,
            loop: null,
            volume: 0,
            target: 0,
            center: new THREE.Vector3(),
            position: new THREE.Vector3(),
            quiet: 0
        }));
        this.wavesTimer = 0;

        // Ile kolumn z wodą jest teraz dookoła (/woda).
        this.nearbyWater = 0;

        // Jak głęboko pod powierzchnią są oczy (bloki, 0 = nad wodą) -
        // osiągnięcie "Głębinowiec".
        this.depth = 0;

    }


    update(dt) {

        const game = this.game;

        const eye = game.view?.position ?? game.camera.position;

        this.setUnderwater(this.isUnderwater(eye));

        if (this.underwater) {
            this.updateFogColor();
        }

        this.depth = this.underwater ? this.depthBelowSurface(eye) : 0;

        this.updateSounds(dt);

    }


    // Czy punkt jest pod dokładną powierzchnią widoczną w siatce wody.

    isUnderwater(point) {

        const world = this.game.world;

        const x = Math.floor(point.x);
        const y = Math.floor(point.y);
        const z = Math.floor(point.z);

        if (!isLiquidId(world.getBlockId(x, y, z))) {
            return false;
        }

        const surface = waterSurfaceHeight(world, x, y, z, point.x - x, point.z - z);

        return point.y - y < surface;

    }


    // Jak głęboko pod powierzchnią wody jest punkt (szukamy w górę
    // ostatniego bloku wody, najwyżej 64 bloki).

    depthBelowSurface(point) {

        const world = this.game.world;

        const x = Math.floor(point.x);
        const z = Math.floor(point.z);

        let y = Math.floor(point.y);

        if (!isLiquidId(world.getBlockId(x, y, z))) return 0;

        const limit = y + 64;

        while (y < limit && isLiquidId(world.getBlockId(x, y + 1, z))) {
            y++;
        }

        return Math.max(0, y + waterSurfaceHeight(world, x, y, z, point.x - x, point.z - z) - point.y);

    }


    setUnderwater(underwater) {

        viewUniforms.uUnderwater.value = underwater ? 1 : 0;

        if (underwater === this.underwater) {
            return;
        }

        this.underwater = underwater;

        this.game.sounds?.setUnderwater(underwater);

    }


    // Kolor mgły pod wodą: w dzień niebieski, nocą (i przy zachodzie)
    // ciemnieje razem z niebem.

    updateFogColor() {

        const horizon = this.game.sky.state.horizon;

        const luminance = 0.2126 * horizon.r + 0.7152 * horizon.g + 0.0722 * horizon.b;

        const daylight = Math.min(1, luminance / 0.45);

        viewUniforms.uUnderwaterColor.value
            .copy(baseFogColor)
            .multiplyScalar(0.06 + 0.94 * daylight);

        viewUniforms.uUnderwaterDensity.value = UNDERWATER_FOG_DENSITY;

    }

    // --------------------------------------------------------
    // Dźwięki
    // --------------------------------------------------------

    updateSounds(dt) {

        const game = this.game;
        const sounds = game.sounds;
        const player = game.player;

        if (!sounds) {
            return;
        }

        this.waterfallAudio.update(dt, this.underwater);


        // Plusk przy wpadnięciu do wody: szybciej = głośniej i niżej.

        if (player.splash > 0) {

            const strength = Math.min(1, player.splash / 16);

            sounds.play('water_splash', {
                position: new THREE.Vector3(player.pos.x, player.pos.y + 0.5, player.pos.z),
                volume: 0.25 + 0.75 * strength,
                pitch: 1.1 - 0.3 * strength
            });

        }

        if (player.leftWater) {
            sounds.play('water_exit', { volume: 0.8 });
        }


        // Pętla "pod wodą".

        if (this.underwater && !this.underwaterLoop) {
            this.underwaterLoop = sounds.loop('water_underwater', { volume: 1 });
        }
        else if (!this.underwater && this.underwaterLoop) {

            this.underwaterLoop.stop(0.4);

            this.underwaterLoop = null;

        }


        // Szum wody: co chwilę liczymy wodę dookoła, głośność zmienia się
        // płynnie.

        this.wavesTimer -= dt;

        if (this.wavesTimer <= 0) {

            this.wavesTimer = WAVES_INTERVAL;

            this.measureWaves();

        }

        const ear = game.camera.position;

        for (const a of this.ambience) {

            const target = this.underwater ? 0 : a.target;

            a.volume += (target - a.volume) * Math.min(1, dt * 1.5);

            ambientPosition(a.position, a.center, ear, game.camera);

            if (a.volume > 0.02 && !a.loop) {
                a.loop = sounds.loop(a.sound, { position: a.position, volume: a.volume });
            }

            if (a.loop) {

                a.loop.setVolume(a.volume, 0.2);
                a.loop.setPosition(a.position);

                // Długo cicho - pętla się kończy (zwalnia miejsce na dźwięki).

                a.quiet = a.volume < 0.01 ? a.quiet + dt : 0;

                if (a.quiet > 3) {

                    a.loop.stop(0.2);

                    a.loop = null;

                }

            }

        }

    }


    // Kolumny z powierzchnią wody wokół gracza: ile ich jest i gdzie
    // jest ich środek - osobno płynąca woda (nurt rzeki) i stojąca.

    measureWaves() {

        const game = this.game;
        const world = game.world;
        const center = game.camera.position;

        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);

        // [płynąca, stojąca]: liczba kolumn i suma ich środków.
        const sums = [[0, 0, 0, 0], [0, 0, 0, 0]];

        const r = WAVES_RADIUS;

        for (let dz = -r; dz <= r; dz++) {

            for (let dx = -r; dx <= r; dx++) {

                if (dx * dx + dz * dz > r * r) {
                    continue;
                }

                // Powierzchnia wody w kolumnie: woda, nad nią powietrze.

                for (let y = cy + 3; y >= cy - 10; y--) {

                    if (
                        isLiquidId(world.getBlockId(cx + dx, y, cz + dz)) &&
                        !isLiquidId(world.getBlockId(cx + dx, y + 1, cz + dz))
                    ) {

                        const x = cx + dx, z = cz + dz;
                        const flow = world.getWaterFlow ? world.getWaterFlow(x, y, z) : world.getFlow?.(x, z);
                        const flowing = isFlowingWaterId(world.getBlockId(x, y, z)) || !!flow;
                        const sum = sums[flowing ? 0 : 1];

                        sum[0]++;
                        sum[1] += cx + dx + 0.5;
                        sum[2] += y + waterSurfaceHeight(world, x, y, z);
                        sum[3] += cz + dz + 0.5;

                        break;

                    }

                }

            }

        }

        this.nearbyWater = sums[0][0] + sums[1][0];

        this.flowingWater = sums[0][0];

        for (const a of this.ambience) {

            const [count, sx, sy, sz] = sums[a.flowing ? 0 : 1];

            a.target = Math.min(1, count / WAVES_FULL);

            if (count > 0) {
                a.center.set(sx / count, sy / count, sz / count);
            }

        }

    }


    // Przy wyjściu ze świata.

    dispose() {

        this.waterfallAudio.dispose();

        this.underwaterLoop?.stop(0.1);

        this.underwaterLoop = null;

        for (const a of this.ambience) {
            a.loop?.stop(0.1);
            a.loop = null;
            a.volume = 0;
        }

        this.setUnderwater(false);

    }

}
