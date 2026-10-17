import {
    SEA_LEVEL,
    GLOBE_RADIUS,
    SPACE_START,
    SPACE_FULL,
    SPACE_CURVE_START,
    SPACE_CURVE_FULL
} from '../config.js';

import { viewUniforms } from '../rendering/viewUniforms.js';

import { Globe } from './Globe.js';

// ------------------------------------------------------------
// KOSMOS - SEKRET
//
// Kto poleci bardzo wysoko (w locie Spacja przyspiesza z wysokością -
// FLY_BOOST_... w config.js), ten wylatuje w kosmos:
//   - od SPACE_CURVE_START świat zaczyna się zaginać, a od
//     SPACE_CURVE_FULL jest kulą (Globe.js) z kontynentami, morzami,
//     chmurami, czapami lodowymi i granicą dnia i nocy,
//   - od SPACE_START niebo ciemnieje, od SPACE_FULL jest czarne:
//     gwiazdy i Droga Mleczna także w dzień, planety
//     (src/sky/layers/Planets.js), białe słońce.
// Powrót: wyłączenie latania - gracz spada jak meteoryt (Skyfall.js).
//
// Ta klasa co klatkę liczy z wysokości kamery, jak bardzo jesteśmy
// w kosmosie, i ustawia to niebu, dalekiemu terenowi i kuli Ziemi.
// Wszystkie wysokości są w config.js (sekcja KOSMOS).
// ------------------------------------------------------------

// Od jakiej wysokości liczymy mapę kuli (trochę przed zakrzywieniem,
// żeby była gotowa, zanim będzie potrzebna).

const MAP_START = SPACE_CURVE_START - 120;

// Chmury na kuli pojawiają się między tymi wysokościami (niżej
// byłyby "namalowane" na terenie pod graczem).

const CLOUDS_START = 1900;
const CLOUDS_FULL = 3000;


function smoothstep(edge0, edge1, x) {

    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));

    return t * t * (3 - 2 * t);

}


export class SpaceView {

    constructor(game) {

        this.game = game;

        this.globe = new Globe(game);

        // 0-1: jak bardzo jesteśmy w kosmosie (niebo) i jak bardzo
        // świat jest kulą.

        this.space = 0;
        this.curve = 0;

        // Wysokość oczu nad poziomem morza.

        this.altitude = 0;

        // Komunikat "jesteś w kosmosie" - raz na wejście do świata.

        this.welcomed = false;

        // Gdzie z tej wysokości widać horyzont kuli (y kierunku, 0 =
        // poziomo, 0 bez kuli) - dla nieba (Sky.horizonDip).

        this.horizonDip = 0;

        // Cichy pomruk kosmosu (pętla).

        this.ambientLoop = null;

    }


    // Co klatkę, przed niebem (Sky.update). eye - pozycja oczu gracza.

    update(dt, eye) {

        const y = eye.y;

        this.altitude = y - SEA_LEVEL;

        this.space = smoothstep(SPACE_START, SPACE_FULL, y);
        this.curve = smoothstep(SPACE_CURVE_START, SPACE_CURVE_FULL, y);

        const game = this.game;

        game.sky.space = this.space;


        // Kula: promień GLOBE_RADIUS w pełni, a zanim świat się całkiem
        // zagnie - coraz mniejsza kula z ogromnej (prawie płaskiej).

        viewUniforms.uCurvature.value = this.curve > 0.0005 ? this.curve / GLOBE_RADIUS : 0;

        const globe = this.globe;

        globe.visibility = this.curve > 0.0005 ? 1 : 0;
        globe.spaceGlow = this.space;
        globe.cloudAmount = smoothstep(CLOUDS_START, CLOUDS_FULL, y);

        globe.update(dt, eye, y > MAP_START);

        viewUniforms.uGlobe.value = globe.drawable ? 1 : 0;

        this.horizonDip = globe.drawable ? this.globeHorizon(y - (SEA_LEVEL + 1)) : 0;


        this.updateSound();


        // Pierwszy raz w kosmosie - podpowiedź, jak wrócić.

        if (this.space > 0.98 && !this.welcomed && game.player.flying) {

            this.welcomed = true;

            game.onMessage?.(
                game.player.canFly
                    ? 'Witaj w kosmosie! Żeby wrócić jak meteoryt, wyłącz latanie (dwa razy Spacja) i spadaj.'
                    : 'Witaj w kosmosie! Żeby wrócić jak meteoryt, wyłącz latanie (/latanie) i spadaj.'
            );

        }

    }


    // Pomruk kosmosu: tym głośniej, im wyżej.

    updateSound() {

        const sounds = this.game.sounds;

        if (!sounds) {
            return;
        }

        const volume = smoothstep(0.5, 1, this.space) * 0.8;

        if (volume > 0.01 && !this.ambientLoop) {
            this.ambientLoop = sounds.loop('space_ambient', { volume: 0 });
        }
        else if (volume <= 0.01 && this.ambientLoop) {

            this.ambientLoop.stop(0.5);

            this.ambientLoop = null;

        }

        this.ambientLoop?.setVolume(volume, 0.3);

    }


    // Horyzont kuli widziany z wysokości h nad morzem: tam, gdzie
    // promień z oka jest styczny do kuli - albo bliżej, jeśli kula
    // jest tak wielka (prawie płaska), że horyzont byłby za końcem
    // mapy (Globe.mapReach).

    globeHorizon(h) {

        if (h <= 0) {
            return 0;
        }

        const R = GLOBE_RADIUS / this.curve;

        const angle = Math.min(Math.acos(R / (R + h)), this.globe.mapReach / R);

        // Kierunek do punktu kuli pod tym kątem od miejsca pod okiem.

        const x = R * Math.sin(angle);
        const y = R * Math.cos(angle) - (R + h);

        return y / Math.hypot(x, y);

    }


    // Tryb ziemniaka: mniejsza mapa kuli, bez chmur.

    setLowDetail(on) {

        this.globe.setLowDetail(on);

    }


    // Rysowanie (Game.render): powierzchnia kuli przed dalekim terenem,
    // chmury po nim.

    renderBehind(renderer, camera) {

        this.globe.renderSurface(renderer, camera);

    }

    renderFront(renderer, camera) {

        this.globe.renderClouds(renderer, camera);

    }


    dispose() {

        this.ambientLoop?.stop(0.1);

        this.ambientLoop = null;

        this.globe.dispose();

        viewUniforms.uCurvature.value = 0;
        viewUniforms.uGlobe.value = 0;

        this.game.sky.space = 0;

    }

}
