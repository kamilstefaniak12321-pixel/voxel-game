import * as THREE from 'three';

import { atlasAverageTexture } from './TextureAtlas.js';

import {
    FAR_HAZE_DISTANCE,
    FAR_HAZE_MAX
} from '../config.js';

// ------------------------------------------------------------
// WSPÓLNE WARTOŚCI WIDOKU
//
// Ustawienia obrazu, których używają shadery bloków
// (BlockRenderData.js) i dalekiego terenu (FarTerrain.js):
//   jasność (ustawienie "Jasność"),
//   mgła pod wodą,
//   daleki teren - gdzie kończą się prawdziwe chunki, gdzie kończy
//   się daleki teren i jak gęsta jest mgiełka w oddali.
// Wartości ustawia Game.applySettings().
// ------------------------------------------------------------

export const viewUniforms = {

    // 0 = zwykła jasność ("nastrojowa"), 1 = półmrok mocno rozjaśniony.

    uBrightness: { value: 0 },

    // 1 = daleki teren włączony: bliskie chunki nie znikają we mgle,
    // tylko z odległością zlewają się w średni kolor tekstur
    // i przechodzą w daleki teren.

    uFarEnabled: { value: 0 },

    // Promień prawdziwych chunków (zasięg widzenia) i dalekiego terenu.

    uFarInner: { value: 48 },
    uFarOuter: { value: 1024 },

    // Mgiełka w oddali (config.js).

    uHazeDistance: { value: FAR_HAZE_DISTANCE },
    uHazeMax: { value: FAR_HAZE_MAX },

    // Średni kolor każdego kafelka atlasu (TextureAtlas.js).

    uAtlasAverage: { value: atlasAverageTexture },

    // Czas w sekundach (kołysanie roślin na wietrze, płynąca woda) -
    // ustawia Game.

    uTime: { value: 0 },

    // Kamera pod wodą: 1 = zamiast zwykłej mgły gęsta mgła w kolorze
    // wody (kolor liniowy i gęstość - Game.updateWater).

    uUnderwater: { value: 0 },
    uUnderwaterColor: { value: new THREE.Color() },
    uUnderwaterDensity: { value: 0.08 }

};


export const VIEW_GLSL = /* glsl */ `

    uniform float uBrightness;
    uniform float uFarEnabled;
    uniform float uFarInner;
    uniform float uFarOuter;
    uniform float uHazeDistance;
    uniform float uHazeMax;
    uniform float uUnderwater;
    uniform vec3 uUnderwaterColor;
    uniform float uUnderwaterDensity;

    const vec3 VIEW_LUMINANCE = vec3(0.2126, 0.7152, 0.0722);


    // Ile mgiełki jest w odległości d (w poziomie): rośnie z
    // odległością, a przy samym końcu dalekiego terenu trochę
    // szybciej, żeby jego brzeg łagodnie przechodził w niebo.

    float farHaze(float d) {

        float haze = uHazeMax * (1.0 - exp(-d / uHazeDistance));

        float edge = smoothstep(uFarOuter * 0.8, uFarOuter, d);

        return mix(haze, 1.0, edge * 0.45);

    }


    // Ustawienie "Jasność": rozjaśnia półmrok i ciemność (jak suwak
    // jasności w Minecrafcie), pełnego światła nie zmienia.
    // light  - policzone światło odbite od powierzchni,
    // albedo - kolor samej powierzchni (tekstury).

    vec3 applyBrightness(vec3 light, vec3 albedo) {

        if (uBrightness <= 0.0) {
            return light;
        }

        float albedoLuminance = max(dot(albedo, VIEW_LUMINANCE), 0.0001);

        float amount = clamp(dot(light, VIEW_LUMINANCE) / albedoLuminance, 0.0, 1.0);

        float perceived = pow(amount, 1.0 / 2.2);

        float lifted = 1.0 - pow(1.0 - perceived, 4.0);

        float target = pow(mix(perceived, lifted, uBrightness), 2.2);

        return light * (target / max(amount, 0.0001));

    }

`;
