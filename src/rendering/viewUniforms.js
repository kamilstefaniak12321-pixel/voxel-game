import * as THREE from 'three';

import { atlasAverageTexture } from './TextureAtlas.js';

import {
    CHUNK_SIZE,
    FAR_HAZE_DISTANCE,
    FAR_HAZE_MAX,
    SEA_LEVEL
} from '../config.js';


// Powietrze rzednie z wysokością (mgiełka z wysoka): powyżej
// HAZE_GROUND gęstość maleje e razy co HAZE_HEIGHT bloków.

const HAZE_GROUND = SEA_LEVEL + 40;
const HAZE_HEIGHT = 250;

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
    uUnderwaterDensity: { value: 0.08 },

    // Kosmos (src/space/): wysoko nad ziemią daleki teren wygina się
    // w kulę o promieniu 1 / uCurvature (0 = płasko), a za jego końcem
    // jest kula Ziemi (uGlobe 0-1) - wtedy brzeg dalekiego terenu nie
    // znika w niebie, tylko przechodzi w kulę.

    uCurvature: { value: 0 },
    uGlobe: { value: 0 }

};


// MASKA CHUNKÓW: które chunki wokół gracza mają mesh (prawdziwe bloki
// są narysowane) - CHUNK_MASK_SIZE x CHUNK_MASK_SIZE chunków od
// uChunkMaskOrigin (ustawia FarTerrain.updateMask). Daleki teren jest
// tam wycięty co do chunka (zwykłe wycięcie koła nie wystarcza: chunki
// wystają za koło, a przez ich półprzezroczystą wodę widać by daleki
// teren pod spodem), a woda przy granicy wie, że pod nią dalej nie ma
// już dna (BlockRenderData.js).

export const CHUNK_MASK_SIZE = 128;

export const chunkMaskData = new Uint8Array(CHUNK_MASK_SIZE * CHUNK_MASK_SIZE);

const chunkMaskTexture = new THREE.DataTexture(chunkMaskData, CHUNK_MASK_SIZE, CHUNK_MASK_SIZE, THREE.RedFormat, THREE.UnsignedByteType);

chunkMaskTexture.magFilter = THREE.NearestFilter;
chunkMaskTexture.minFilter = THREE.NearestFilter;
chunkMaskTexture.needsUpdate = true;

export const chunkMaskUniforms = {
    uChunkMask: { value: chunkMaskTexture },
    uChunkMaskOrigin: { value: new THREE.Vector2(1e6, 1e6) }
};

export const CHUNK_MASK_GLSL = /* glsl */ `

    uniform sampler2D uChunkMask;
    uniform vec2 uChunkMaskOrigin;

    // Czy chunk w punkcie xz świata ma mesh.

    bool chunkMeshed(vec2 xz) {

        vec2 chunk = floor(xz / ${CHUNK_SIZE.toFixed(1)}) - uChunkMaskOrigin;

        return chunk.x >= 0.0 && chunk.y >= 0.0 &&
            chunk.x < ${CHUNK_MASK_SIZE.toFixed(1)} && chunk.y < ${CHUNK_MASK_SIZE.toFixed(1)} &&
            texture2D(uChunkMask, (chunk + 0.5) / ${CHUNK_MASK_SIZE.toFixed(1)}).r > 0.5;

    }
`;


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
    uniform float uCurvature;
    uniform float uGlobe;

    const vec3 VIEW_LUMINANCE = vec3(0.2126, 0.7152, 0.0722);


    // Ile mgiełki jest na drodze długości d od kamery: rośnie
    // z odległością. Z wysoka (patrząc w dół przez coraz rzadsze
    // powietrze) jest jej mniej.

    float hazeAlong(float d) {

        float height = max(cameraPosition.y - ${HAZE_GROUND.toFixed(1)}, 0.0);

        float thin = height < 1.0
            ? 1.0
            : ${HAZE_HEIGHT.toFixed(1)} * (1.0 - exp(-height / ${HAZE_HEIGHT.toFixed(1)})) / height;

        return uHazeMax * (1.0 - exp(-d * thin / uHazeDistance));

    }


    // Mgiełka w punkcie odległym od kamery o offset. Przy samym końcu
    // dalekiego terenu rośnie szybciej, żeby jego brzeg łagodnie
    // przechodził w niebo (chyba że za nim jest kula Ziemi).

    float farHaze(vec3 offset) {

        float haze = hazeAlong(length(offset));

        float edge = smoothstep(uFarOuter * 0.8, uFarOuter, length(offset.xz)) * (1.0 - uGlobe);

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


// Kula Ziemi z kosmosu (daleki teren wygięty w kulę i src/space/Globe.js):
// światło dnia w miejscu kuli, gdzie słońce stoi na wysokości mu
// (1 = w zenicie, 0 = na horyzoncie) - mniej więcej jak w tabeli
// w SkyColors.js: otoczenie, słońce, nocne odbarwienie i jasność
// mgiełki. Daleki teren i kula dokładają różnicę między tym miejscem
// a miejscem gracza - dzięki temu na całej kuli widać granicę dnia
// i nocy, a pod graczem wszystko wygląda tak jak na ziemi.
// Wymaga SKY_COLOR_GLSL (uSunDirection) przed sobą.

export const GLOBE_LIGHT_GLSL = /* glsl */ `

    float daylightAmbient(float mu) {
        return 0.04 + 0.66 * smoothstep(-0.16, 0.22, mu);
    }

    float daylightSun(float mu) {
        return 0.9 * smoothstep(-0.02, 0.22, mu);
    }

    float daylightNight(float mu) {
        return 0.6 * (1.0 - smoothstep(-0.16, 0.05, mu));
    }

    float daylightHaze(float mu) {
        return mix(0.06, 1.0, smoothstep(-0.25, 0.15, mu));
    }

    // Jasność mgiełki w tym miejscu względem miejsca gracza.

    float hazeScale(float mu) {
        return clamp(daylightHaze(mu) / daylightHaze(uSunDirection.y), 0.0, 4.0);
    }

`;
