import * as THREE from 'three';

import {
    WATER_SURFACE,
    UNDERWATER_FOG_COLOR,
    UNDERWATER_FOG_DENSITY
} from '../config.js';

import {
    isLiquidId,
    isOpaqueId
} from '../blocks/BlockRegistry.js';

import { viewUniforms } from '../rendering/viewUniforms.js';

// ------------------------------------------------------------
// WODA WOKÓŁ GRACZA - obraz i dźwięk
//
// Co klatkę (Game.update, po ustawieniu kamery):
//   - czy kamera jest pod wodą: wtedy zamiast nieba i zwykłej mgły
//     gęsta, niebieska mgła (nocą ciemna), dźwięki gry są przytłumione
//     i gra pętla "pod wodą", a main.js pokazuje niebieską nakładkę,
//   - plusk przy wpadnięciu do wody (tym głośniejszy, im szybciej)
//     i krople przy wychodzeniu,
//   - fale: pętla z miejsca, gdzie jest woda, tym głośniej, im więcej
//     wody w okolicy (sprawdzane dwa razy na sekundę).
// Ruch w wodzie (pływanie) - src/player/Player.js, wygląd wody -
// src/rendering/BlockRenderData.js (waterMaterial).
// ------------------------------------------------------------

// Jak daleko (w blokach) szukamy wody dla dźwięku fal.
const WAVES_RADIUS = 10;

// Ile kolumn z powierzchnią wody to "pełna" głośność fal.
const WAVES_FULL = 70;

// Co ile sekund liczymy wodę dookoła.
const WAVES_INTERVAL = 0.5;


const baseFogColor = new THREE.Color(UNDERWATER_FOG_COLOR);


export class WaterEffects {

    constructor(game) {

        this.game = game;

        // Czy kamera jest pod wodą.
        this.underwater = false;

        this.underwaterLoop = null;

        this.wavesLoop = null;
        this.wavesVolume = 0;
        this.wavesTarget = 0;
        this.wavesPosition = new THREE.Vector3();
        this.wavesTimer = 0;
        this.wavesQuiet = 0;

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


    // Czy punkt jest pod powierzchnią wody (górny blok wody jest
    // niższy - WATER_SURFACE).

    isUnderwater(point) {

        const world = this.game.world;

        const x = Math.floor(point.x);
        const y = Math.floor(point.y);
        const z = Math.floor(point.z);

        if (!isLiquidId(world.getBlockId(x, y, z))) {
            return false;
        }

        const above = world.getBlockId(x, y + 1, z);

        const surface = isLiquidId(above) || isOpaqueId(above) ? 1 : WATER_SURFACE;

        return point.y - y < surface;

    }


    // Jak głęboko pod powierzchnią wody jest punkt (szukamy w górę
    // ostatniego bloku wody, najwyżej 64 bloki).

    depthBelowSurface(point) {

        const world = this.game.world;

        const x = Math.floor(point.x);
        const z = Math.floor(point.z);

        let y = Math.floor(point.y);

        const limit = y + 64;

        while (y < limit && isLiquidId(world.getBlockId(x, y + 1, z))) {
            y++;
        }

        return Math.max(0, y + WATER_SURFACE - point.y);

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


        // Fale: co chwilę liczymy wodę dookoła, głośność zmienia się płynnie.

        this.wavesTimer -= dt;

        if (this.wavesTimer <= 0) {

            this.wavesTimer = WAVES_INTERVAL;

            this.measureWaves();

        }

        const target = this.underwater ? 0 : this.wavesTarget;

        this.wavesVolume += (target - this.wavesVolume) * Math.min(1, dt * 1.5);

        if (this.wavesVolume > 0.02 && !this.wavesLoop) {
            this.wavesLoop = sounds.loop('water_waves', { position: this.wavesPosition, volume: this.wavesVolume });
        }

        if (this.wavesLoop) {

            this.wavesLoop.setVolume(this.wavesVolume, 0.2);
            this.wavesLoop.setPosition(this.wavesPosition);

            // Długo cicho - pętla się kończy (zwalnia miejsce na dźwięki).

            this.wavesQuiet = this.wavesVolume < 0.01 ? this.wavesQuiet + dt : 0;

            if (this.wavesQuiet > 3) {

                this.wavesLoop.stop(0.2);

                this.wavesLoop = null;

            }

        }

    }


    // Kolumny z powierzchnią wody wokół gracza: ile ich jest i gdzie
    // jest ich środek (stamtąd słychać fale).

    measureWaves() {

        const game = this.game;
        const world = game.world;
        const center = game.camera.position;

        const cx = Math.floor(center.x);
        const cy = Math.floor(center.y);
        const cz = Math.floor(center.z);

        let count = 0;
        let sx = 0;
        let sy = 0;
        let sz = 0;

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

                        count++;

                        sx += cx + dx + 0.5;
                        sy += y + WATER_SURFACE;
                        sz += cz + dz + 0.5;

                        break;

                    }

                }

            }

        }

        this.nearbyWater = count;

        this.wavesTarget = Math.min(1, count / WAVES_FULL);

        if (count > 0) {
            this.wavesPosition.set(sx / count, sy / count, sz / count);
        }

    }


    // Przy wyjściu ze świata.

    dispose() {

        this.underwaterLoop?.stop(0.1);
        this.wavesLoop?.stop(0.1);

        this.underwaterLoop = null;
        this.wavesLoop = null;

        this.setUnderwater(false);

    }

}
