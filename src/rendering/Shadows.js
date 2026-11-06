import * as THREE from 'three';

import { blockAtlasTexture } from './TextureAtlas.js';
import { plantWindUniforms, plantShadowState, PLANT_WIND_GLSL } from './PlantWind.js';
import { viewUniforms, chunkMaskUniforms, CHUNK_MASK_GLSL } from './viewUniforms.js';

import { CHUNK_SIZE, CHUNK_HEIGHT, SHADOW_INDOOR_DARKNESS } from '../config.js';

import { isOpaqueId, isLeavesId } from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// CIENIE SŁOŃCA I KSIĘŻYCA
//
// Jak to działa (shadow mapping):
//   1. Raz na jakiś czas rysujemy świat "oczami słońca" - kamera
//      ortograficzna patrzy z kierunku słońca na teren wokół gracza
//      i zapisuje w teksturze (mapie cieni), jak daleko od słońca jest
//      najbliższy blok w każdym punkcie.
//   2. Rysując blok, sprawdzamy w mapie, czy między nim a słońcem coś
//      jest. Jest - blok jest w cieniu i nie dostaje światła słońca
//      (zostaje mu tylko światło z całego nieba).
//
// Cień jest liczony w rzeczywistym punkcie powierzchni, niezależnie
// od pikseli tekstury bloku. Cztery porównania głębi z wagami biliniowymi
// łagodzą krawędź bez rozmywania całego obrazu. Rozdzielczość bliskiej
// mapy nadal wynosi 16 punktów na blok; siatka kamery stabilizuje ją
// podczas ruchu gracza, lecz nie kwantyzuje odbiorców cienia.
//
// TRZY MAPY w jakości „Dalekie”:
//   - bliska - 32 albo 64 bloki wokół gracza, 16 punktów na blok,
//     przerysowywana, gdy słońce przesunie się o kawałek, gracz odejdzie
//     od środka mapy albo zmienią się chunki w jej zasięgu,
//   - średnia: promień 256, mapa 1024 (pół bloku/teksel),
//   - zewnętrzna: promień 1024, mapa 2048 (blok/teksel). Pełna waga do
//     0.82 promienia, więc teren do około 800 bloków pozostaje w cieniu.
// Promienie opisują osie kamery światła, nie koła na ziemi. Zasięg
// przeszkód w stronę Słońca zależy też od dostępnego dalekiego terenu.
// Obie większe mapy powstają do drugiego bufora, we wspólnym budżecie
// rysowań/trójkątów. Tekstura i jej macierz są publikowane jednocześnie.
//
// Z włączonymi cieniami światło słońca nie słabnie razem ze światłem
// nieba z chunków - liczy się tylko to, czy promień słońca dochodzi.
// Dlatego przez okno do ciemnego pokoju wpada jasna plama słońca,
// a pod drzewem jest wyraźny cień.
//
// Model gracza ma własną, małą mapę rysowaną co klatkę (gracz rzuca
// cień, nawet w widoku z oczu).
//
// Liczby: SHADOW_QUALITY i stałe niżej, ustawienie "Cienie słońca".
// Opis: docs/niebo-i-swiatlo.md.
// ------------------------------------------------------------

// Jakość: rozmiar bliskiej mapy (piksele), jej zasięg od gracza (bloki)
// i czy jest daleka mapa. Bliska mapa ma 16 próbek na blok; jej
// rozdzielczość jest niezależna od filtrowanego brzegu cienia.

export const SHADOW_QUALITY = {
    1: { size: 1024, radius: 32, far: false },
    2: { size: 2048, radius: 64, far: false },
    3: { size: 2048, radius: 64, far: true }
};

// Klasyczne wygaszanie cieni słońca/księżyca przy horyzoncie oraz
// dodatkowego przyciemnienia wnętrz (y kierunku: 0 = horyzont, 1 = zenit).
// Atmosfera tłumi już wiązkę słońca, więc nie wygaszamy drugi raz jej
// przesłonięcia: nieprzezroczysty blok ma nadal zatrzymywać cały promień.

const FADE_LOW = 0.015;
const FADE_HIGH = 0.09;

// Przy niskim słońcu bliska mapa obejmuje bloki od tylu bloków pod do
// tylu nad graczem (dzięki temu jest gęstsza wzdłuż promieni). Wyżej
// i niżej cienie płynnie znikają.

const VERTICAL_RANGE = 32;

// Kiedy przerysować bliską mapę: słońce przesunęło się o tyle (radiany),
// gracz odszedł od środka mapy o taką część zasięgu, zmienił się chunk
// w zasięgu (najwyżej co tyle sekund).

const ANGLE_STEP = 0.0018;
const MOVE_SHARE = 0.25;
const CHUNK_REDRAW_SECONDS = 0.1;

// Większe mapy: rozmiar, zasięg, zakres w pionie, próg ruchu i minimalny
// odstęp aktualizacji. Liczba klatek budowy wynika z budżetu poniżej.

export const DISTANT_SHADOW_CASCADES = [
    { name: 'far', size: 1024, radius: 256, verticalRange: CHUNK_HEIGHT, move: 24, interval: 0.2 },
    { name: 'distant', size: 2048, radius: 1024, verticalRange: CHUNK_HEIGHT, move: 80, interval: 0.5 }
];

// Budżet dotyczy również dalekich kafli; nie ma końcowej, nieograniczonej
// paczki całego horyzontu. milliseconds ogranicza składanie jednej paczki,
// nie czas renderer.render ani jednorazowego zebrania snapshotu. Osobne
// pomiary prepare/submit w stats() ujawniają te koszty; to nie pomiar GPU.
export const SHADOW_BUILD_BUDGET = { draws: 24, triangles: 120000, milliseconds: 1.5 };

// Moving small vegetation has its own map: wind never redraws the terrain.
// Large voxel tree crowns stay in the existing terrain cascades.
export const PLANT_SHADOW_CONFIG = { size: 1024, radius: 32, interval: 0.1 };
export const PLANT_SHADOW_BUILD_BUDGET = { draws: 8, triangles: 40000, milliseconds: 0.5 };

// Cień gracza (mała mapa wokół modelu, rysowana co klatkę).

const MODEL_MAP_SIZE = 256;
const MODEL_MAP_RADIUS = 1.6;

// Kamera cienia gracza stoi tyle bloków od niego (w stronę słońca)
// i widzi do MODEL_MAP_FAR - dalej cień gracza już nie sięga.

const MODEL_MAP_DISTANCE = 8;
const MODEL_MAP_FAR = 72;

// ------------------------------------------------------------
// Wspólne wartości dla shaderów bloków, modeli i dalekiego terenu.
// ------------------------------------------------------------

export const shadowUniforms = {

    // Bliska mapa (głębia widziana od słońca) i przejście świat -> mapa.
    uSunShadowMap: { value: null },
    uSunShadowMatrix: { value: new THREE.Matrix4() },
    uSunShadowMetrics: { value: new THREE.Vector4() },

    // x - 1 / zakres głębi (bloki -> jednostki mapy),
    // y - siła przesłonięcia 0-1 (atmosfera: wiązka słabnie osobno),
    // z - rozmiar piksela mapy w blokach,
    // w - 1 = jest mapa cienia gracza.
    uSunShadowInfo: { value: new THREE.Vector4(1, 0, 1 / 16, 0) },

    // Kierunek DO światła, które rzuca cienie.
    uSunShadowDir: { value: new THREE.Vector3(0, 1, 0) },

    // Maksymalne zaokrąglenie pozycji przez rasteryzator, w tekselu mapy:
    // pół jednostki siatki określonej przez WebGL SUBPIXEL_BITS.
    uShadowRasterPrecision: { value: 1 / 32 },

    // Które światło kierunkowe sceny rzuca cienie: 0 - słońce,
    // 1 - księżyc (kolejność z Sky.attachLights).
    uSunShadowLight: { value: 0 },

    // Mapa cienia modelu gracza.
    uModelShadowMap: { value: null },
    uModelShadowMatrix: { value: new THREE.Matrix4() },
    uModelShadowMetrics: { value: new THREE.Vector4() },

    // O ile mocniej słabnie światło otoczenia tam, gdzie mało światła
    // nieba (SHADOW_INDOOR_DARKNESS razy siła cieni) - wykładnik.
    uSunShadowAmbient: { value: 0 },

    uPlantShadowMap: { value: null },
    uPlantShadowMatrix: { value: new THREE.Matrix4() },
    uPlantShadowMetrics: { value: new THREE.Vector4() },
    // depth scale, world texel, ready, natural lighting enabled.
    uPlantShadowInfo: { value: new THREE.Vector4(1, 1 / 16, 0, 0) },

    // Daleka mapa: x - 1 / zakres głębi, y - rozmiar piksela (bloki),
    // z - 1 = mapa gotowa.
    uFarShadowMap: { value: null },
    uFarShadowMatrix: { value: new THREE.Matrix4() },
    uFarShadowMetrics: { value: new THREE.Vector4() },
    uFarShadowInfo: { value: new THREE.Vector4(1, 0.5, 0, 0) },
    uDistantShadowMap: { value: null },
    uDistantShadowMatrix: { value: new THREE.Matrix4() },
    uDistantShadowMetrics: { value: new THREE.Vector4() },
    uDistantShadowInfo: { value: new THREE.Vector4(1, 1, 0, 0) }

};

// Matrix row lengths and the UV texel are constant for an entire published
// map. Computing them here replaces three dots and a square root per lookup
// per fragment, without changing the receiver-plane filtering or its taps.
export function updateShadowSamplingMetrics(output, matrix, worldTexel) {
    const m = matrix.elements;
    const row2 = row => m[row] * m[row] + m[row + 4] * m[row + 4] + m[row + 8] * m[row + 8];
    const x2 = row2(0), y2 = row2(1), z2 = row2(2);
    return output.set(x2, y2, z2, Math.max(0, worldTexel) * Math.sqrt(x2));
}


// GLSL wspólny: uniformy światła.

const COMMON_GLSL = `
    uniform vec4 uSunShadowInfo;
    uniform vec3 uSunShadowDir;
    uniform float uShadowRasterPrecision;
    uniform int uSunShadowLight;
    uniform highp sampler2D uPlantShadowMap;
    uniform mat4 uPlantShadowMatrix;
    uniform vec4 uPlantShadowMetrics;
    uniform vec4 uPlantShadowInfo;

`;


// GLSL dalekiej mapy (define USE_FAR_SHADOWS): 1 = słońce, 0 = cień;
// coverage - jak bardzo punkt jest w zasięgu mapy (0 - poza nią).

const FAR_GLSL = `
    #ifdef USE_FAR_SHADOWS
        uniform highp sampler2D uFarShadowMap;
        uniform mat4 uFarShadowMatrix;
        uniform vec4 uFarShadowMetrics;
        uniform vec4 uFarShadowInfo;
        uniform highp sampler2D uDistantShadowMap;
        uniform mat4 uDistantShadowMatrix;
        uniform vec4 uDistantShadowMetrics;
        uniform vec4 uDistantShadowInfo;

        // x = ważone przesłonięcie, y = pokrycie. Każda waga występuje
        // raz; maksimum przesłonięć zachowuje cień góry spoza near.
        vec2 distantShadowOcclusion(vec3 p, vec3 worldNormal, float extraBias) {
            float coverage;
            float lit = shadowMapLookup(uDistantShadowMap, uDistantShadowMatrix,
                uDistantShadowInfo, uDistantShadowMetrics, p, worldNormal, extraBias, 0.82, coverage);
            vec2 result = vec2((1.0 - lit) * coverage, coverage);
            lit = shadowMapLookup(uFarShadowMap, uFarShadowMatrix,
                uFarShadowInfo, uFarShadowMetrics, p, worldNormal, extraBias, 0.82, coverage);
            return max(result, vec2((1.0 - lit) * coverage, coverage));
        }
    #endif
`;

const LOOKUP_GLSL = `
    float shadowMapLookup(highp sampler2D depthMap, mat4 worldToMap, vec4 info, vec4 metrics,
        vec3 p, vec3 worldNormal, float extraBias, float fadeStart,
        out float coverage) {
        coverage = 0.0;
        if (info.z < 0.5) return 1.0;
        vec3 s = (worldToMap * vec4(p, 1.0)).xyz;
        float edge = max(abs(s.x - 0.5), abs(s.y - 0.5)) * 2.0;
        if (edge >= 1.0 || s.z <= 0.0 || s.z >= 1.0) return 1.0;

        // Głębia mapy pochodzi ze środka teksela. Każdą z czterech próbek
        // przenieś na ten sam promień, pozostając na płaszczyźnie odbiorcy. Wiersze
        // ortograficznej macierzy są prostopadłe, więc nie potrzeba
        // odwrotnej macierzy ani pochodnych ekranu. To usuwa samocień
        // przy niskim słońcu bez wieloblokowego zapasu głębi.
        vec3 rowX = vec3(worldToMap[0][0], worldToMap[1][0], worldToMap[2][0]);
        vec3 rowY = vec3(worldToMap[0][1], worldToMap[1][1], worldToMap[2][1]);
        vec3 rowZ = vec3(worldToMap[0][2], worldToMap[1][2], worldToMap[2][2]);
        float x2 = metrics.x;
        float y2 = metrics.y;
        float z2 = metrics.z;
        float planeZ = dot(worldNormal, rowZ);
        if (x2 <= 0.0 || y2 <= 0.0 || z2 <= 0.0 ||
            planeZ * planeZ <= 0.0000000001 * dot(worldNormal, worldNormal) * z2) return 1.0;
        float uvTexel = metrics.w;
        vec2 texelPosition = s.xy / uvTexel - 0.5;
        vec2 base = floor(texelPosition);
        vec2 blend = fract(texelPosition);
        vec2 depthGradient = -vec2(dot(worldNormal, rowX) / x2,
            dot(worldNormal, rowY) / y2) * z2 / planeZ;

        // Zapas także przy płaszczyznach near/far, bez twardego cięcia Z.
        coverage = (1.0 - smoothstep(fadeStart, 1.0, edge)) *
            smoothstep(0.0, 0.02, s.z) * (1.0 - smoothstep(0.98, 1.0, s.z));
        // Gradient przelicza pół jednostki zgłoszonej siatki podpikseli
        // na głębię płaszczyzny. SUBPIXEL_BITS=4 oznacza 1/32 teksela;
        // przy promieniach stycznych nawet taki błąd XY mocno zmienia Z.
        // Osobny mały zapas pokrywa precyzję transformacji castera/odbiorcy
        // i ruch roślin. Niezależne źródła błędu sumujemy.
        float rasterBias = uvTexel * (abs(depthGradient.x) + abs(depthGradient.y)) * uShadowRasterPrecision;
        float bias = max((info.y * 0.1 + extraBias) * info.x, 0.0000002) + rasterBias;
        float visibility = 0.0;
        for (int tap = 0; tap < 4; tap++) {
            vec2 corner = vec2(float(tap - (tap / 2) * 2), float(tap / 2));
            vec2 sampleUV = clamp((base + corner + 0.5) * uvTexel,
                vec2(0.5 * uvTexel), vec2(1.0 - 0.5 * uvTexel));
            float planeDepth = s.z + dot(depthGradient, sampleUV - s.xy);
            vec2 weight = mix(vec2(1.0) - blend, blend, corner);
            float lit = planeDepth <= 0.0 || planeDepth >= 1.0 ? 1.0
                : step(planeDepth - bias, texture(depthMap, sampleUV).r);
            visibility += lit * weight.x * weight.y;
        }
        return visibility;
    }
`;

const PLANT_LOOKUP_GLSL = `
    float plantShadowOcclusion(vec3 p, vec3 normal, float bias) {
        if (uPlantShadowInfo.w < 0.5) return 0.0;
        float coverage;
        float lit = shadowMapLookup(uPlantShadowMap, uPlantShadowMatrix,
            uPlantShadowInfo, uPlantShadowMetrics, p, normal, bias, 0.8, coverage);
        return (1.0 - lit) * coverage;
    }
`;

// Modele mają własny test lokalnych bloków. Ten helper dokłada wyłącznie
// większe mapy, bez cienia modelu gracza i bez zmiany naturalnej energii.
export const DISTANT_SHADOW_GLSL = `
    ${COMMON_GLSL}
    ${LOOKUP_GLSL}
    ${FAR_GLSL}
    ${PLANT_LOOKUP_GLSL}
    uniform highp sampler2D uSunShadowMap;
    uniform mat4 uSunShadowMatrix;
    uniform vec4 uSunShadowMetrics;
    float distantShadowVisibility(vec3 p, vec3 normal) {
        if (uSunShadowInfo.y <= 0.0) return 1.0;
        #ifdef USE_FAR_SHADOWS
            return 1.0 - distantShadowOcclusion(p, normal, 0.0).x * uSunShadowInfo.y;
        #else
            return 1.0;
        #endif
    }
    // Models share alpha-cutout terrain/vegetation visibility, but do not
    // sample the player's own map. CPU voxel visibility remains the fallback.
    float environmentShadowVisibility(vec3 p, vec3 normal, float fallback) {
        if (uPlantShadowInfo.w < 0.5) return min(fallback, distantShadowVisibility(p, normal));
        if (uSunShadowInfo.y <= 0.0) return fallback;
        p += normal * (0.5 / 16.0);
        vec2 shadow = vec2(0.0);
        #ifdef USE_FAR_SHADOWS
            shadow = distantShadowOcclusion(p, normal, 0.0);
        #endif
        float coverage;
        float lit = shadowMapLookup(uSunShadowMap, uSunShadowMatrix,
            vec4(uSunShadowInfo.x, uSunShadowInfo.z, 1.0, 0.0), uSunShadowMetrics, p, normal, 0.0, 0.85, coverage);
        shadow = max(shadow, vec2((1.0 - lit) * coverage, coverage));
        shadow.x = max(shadow.x, plantShadowOcclusion(p, normal, 0.0));
        float visible = max(0.0, mix(fallback, 1.0, shadow.y) - shadow.x);
        return mix(fallback, visible, uSunShadowInfo.y);
    }
`;


// GLSL dla bloków: sunShadowLight(pozycja, normalna, światło nieba) -
// ile światła słońca (0-1) dostaje piksel ściany. Poza zasięgiem map -
// tyle, co światła nieba (jak bez cieni). Wymaga define USE_SUN_SHADOWS.
// Rośliny mają większy zapas (SUN_SHADOW_RECEIVER_BIAS, w blokach) -
// kołyszą się, a mapa cieni nie.

export const SHADOW_GLSL = `
#ifdef USE_SUN_SHADOWS

    #ifndef SUN_SHADOW_RECEIVER_BIAS
        #define SUN_SHADOW_RECEIVER_BIAS 0.0
    #endif

    ${COMMON_GLSL}
    ${LOOKUP_GLSL}
    ${FAR_GLSL}
    ${PLANT_LOOKUP_GLSL}

    uniform highp sampler2D uSunShadowMap;
    uniform mat4 uSunShadowMatrix;
    uniform vec4 uSunShadowMetrics;
    uniform highp sampler2D uModelShadowMap;
    uniform mat4 uModelShadowMatrix;
    uniform vec4 uModelShadowMetrics;
    uniform float uSunShadowAmbient;

    float sunShadowLight(vec3 worldPosition, vec3 worldNormal, float skyLight) {

        // Słońce i księżyc pod horyzontem - bez cieni (jak bez nich).

        if (uSunShadowInfo.y <= 0.0) {
            return skyLight;
        }

        // Ciągła pozycja powierzchni. Małe odsunięcie chroni przed
        // samocieniem; nie przyciąga brzegu do siatki tekstury bloku.
        vec3 p = worldPosition + worldNormal * (0.5 / 16.0);

        vec2 shadow = vec2(0.0);

        // Większe mapy, również dla cienia odległej góry wewnątrz near.

        #ifdef USE_FAR_SHADOWS
            shadow = distantShadowOcclusion(p, worldNormal, SUN_SHADOW_RECEIVER_BIAS);
        #endif

        // Bliska mapa.

        float nearWeight;
        float nearLit = shadowMapLookup(uSunShadowMap, uSunShadowMatrix,
            vec4(uSunShadowInfo.x, uSunShadowInfo.z, 1.0, 0.0), uSunShadowMetrics, p, worldNormal,
            SUN_SHADOW_RECEIVER_BIAS, 0.85, nearWeight);
        if (nearWeight > 0.0) {

            // Cień gracza (model) - osobna mała mapa.

            if (uSunShadowInfo.w > 0.5 && nearLit > 0.0) {
                float modelCoverage;
                float modelLit = shadowMapLookup(uModelShadowMap, uModelShadowMatrix,
                    vec4(${1 / (MODEL_MAP_FAR - .1)}, ${2 * MODEL_MAP_RADIUS / MODEL_MAP_SIZE}, 1.0, 0.0),
                    uModelShadowMetrics, p, worldNormal, 0.06, 0.98, modelCoverage);
                // Mapa modelu może tylko dodać przesłonięcie, nigdy
                // rozjaśnić częściowo zacienionej krawędzi terenu.
                nearLit = min(nearLit, mix(1.0, modelLit, modelCoverage));
            }

            shadow = max(shadow, vec2((1.0 - nearLit) * nearWeight, nearWeight));

        }

        // Nie mnożymy ponownie przesłonięcia przez coverage. Pusta bliska
        // mapa nie rozjaśnia cienia dalszej góry; poza wszystkimi mapami
        // zostaje dotychczasowy dostęp do nieba.
        shadow.x = max(shadow.x, plantShadowOcclusion(p, worldNormal, SUN_SHADOW_RECEIVER_BIAS));
        float visible = mix(skyLight, 1.0, shadow.y) - shadow.x;
        return mix(skyLight, max(0.0, visible), uSunShadowInfo.y);

    }

#endif
`;


// GLSL dla dalekiego terenu (FarTerrain.js): ten sam zestaw trzech map.
// farTerrainSun(pozycja, normalna) - ile światła słońca (0-1).

export const FAR_TERRAIN_SHADOW_GLSL = `
#ifdef USE_FAR_SHADOWS

    ${COMMON_GLSL}
    ${LOOKUP_GLSL}
    ${FAR_GLSL}
    ${PLANT_LOOKUP_GLSL}

    uniform highp sampler2D uSunShadowMap;
    uniform mat4 uSunShadowMatrix;
    uniform vec4 uSunShadowMetrics;

    float farTerrainSun(vec3 worldPosition, vec3 worldNormal) {

        if (uSunShadowInfo.y <= 0.0) {
            return 1.0;
        }

        vec3 p = worldPosition + worldNormal * (0.5 / 16.0);
        vec2 shadow = distantShadowOcclusion(p, worldNormal, 0.0);
        float coverage;
        float lit = shadowMapLookup(uSunShadowMap, uSunShadowMatrix,
            vec4(uSunShadowInfo.x, uSunShadowInfo.z, 1.0, 0.0), uSunShadowMetrics, p, worldNormal, 0.0, 0.85, coverage);
        float occlusion = max(shadow.x, (1.0 - lit) * coverage);
        occlusion = max(occlusion, plantShadowOcclusion(p, worldNormal, 0.0));
        return 1.0 - occlusion * uSunShadowInfo.y;

    }

#endif
`;


// Kawałek shadera oświetlenia (lights_fragment_begin): światło, które
// rzuca cienie, mnożymy przez sunLight, drugie światło kierunkowe - przez
// światło nieba (skyLight), światło otoczenia - przez ambientLight.
// Nazwy zmiennych ustawia ten, kto wstawia kod (bloki: blockSun,
// blockSky, blockAmbient).

export function shadowLightsChunk(sunLight, skyLight, ambientLight, condition = null) {

    const sunFactor = condition ? `(${condition} ? ${sunLight} : 1.0)` : sunLight;
    const skyFactor = condition ? `(${condition} ? ${skyLight} : 1.0)` : skyLight;
    const ambientFactor = condition ? `(${condition} ? ${ambientLight} : 1.0)` : ambientLight;

    const chunk = THREE.ShaderChunk.lights_fragment_begin
        .replace(
            'getDirectionalLightInfo( directionalLight, directLight );',
            `getDirectionalLightInfo( directionalLight, directLight );
            directLight.color *= ( UNROLLED_LOOP_INDEX == uSunShadowLight ) ? ${sunFactor} : ${skyFactor};`
        )
        .replace(
            'vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );',
            `vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
            irradiance *= ${ambientFactor};`
        )
        .replace(
            'getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );',
            `getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal ) * ${ambientFactor};`
        );

    return chunk;

}

// ------------------------------------------------------------
// Materiały do rysowania mapy cieni (tylko głębia).
//
// Kolejność jak grupy geometrii chunka (ChunkMesher.js, World.js):
//   0 - zwykłe bloki (pełne),
//   1 - rośliny (przezroczyste piksele przepuszczają światło - trawa
//       i kwiaty rzucają drobne, pikselowe cienie),
//   2 - woda (nie rzuca cienia - widać pod nią dno),
//   3 - liście i płaskie dekoracje (plamki słońca pod drzewem).
// ------------------------------------------------------------

const DEPTH_VERTEX = `
varying vec2 vUv;
varying vec2 vTerrainShadowXZ;

void main() {

    vUv = uv;
    vTerrainShadowXZ = (modelMatrix * vec4(position, 1.0)).xz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

}
`;

const TERRAIN_DEPTH_LOD = `
    ${CHUNK_MASK_GLSL}
    varying vec2 vTerrainShadowXZ;
    void discardTerrainLod() {
        if (uDistanceLodEnabled > 0.5 &&
            distanceLodNoise() >= effectiveNearLodWeight(vTerrainShadowXZ)) discard;
    }
`;
const depthLodUniforms = Object.fromEntries([
    'uDistanceLodEnabled', 'uDistanceLodStart', 'uDistanceLodEnd', 'uDistanceLodCenter'
].map(name => [name, viewUniforms[name]]));
Object.assign(depthLodUniforms, chunkMaskUniforms);

// Shared near casters use exactly the far caster snapshot throughout a
// multi-frame cascade. Restore live values before rendering the main world.
function bindDepthLodSnapshot(snapshot) {
    if (!snapshot) return () => {};
    const saved = [];
    for (const [name, uniform] of Object.entries(depthLodUniforms)) {
        if (!snapshot[name]) continue;
        saved.push([uniform, uniform.value]);
        uniform.value = snapshot[name].value;
    }
    return () => { for (const [uniform, value] of saved) uniform.value = value; };
}

const solidDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: `${TERRAIN_DEPTH_LOD}\nvoid main() { discardTerrainLod(); }`,
    uniforms: { ...depthLodUniforms },
    colorWrite: false
});

const cutoutDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: `
        ${TERRAIN_DEPTH_LOD}
        uniform sampler2D map;
        varying vec2 vUv;

        void main() {
            discardTerrainLod();

            if (texture2D(map, vUv).a < 0.5) {
                discard;
            }

        }
    `,
    uniforms: { map: { value: blockAtlasTexture }, ...depthLodUniforms },
    colorWrite: false,
    side: THREE.DoubleSide
});

const hiddenMaterial = new THREE.MeshBasicMaterial({ visible: false });

export const plantDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: `
        varying vec2 vUv;
        varying vec2 vTerrainShadowXZ;
        attribute vec2 plantMotion;
        uniform float uTime;
        uniform float uWaveHeight;
        ${PLANT_WIND_GLSL}
        void main() {
            vUv = uv;
            vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            vec3 transformed = position + plantWindOffset(worldPosition, plantMotion, uTime, uWaveHeight);
            vTerrainShadowXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }`,
    fragmentShader: cutoutDepthMaterial.fragmentShader,
    uniforms: { map: { value: blockAtlasTexture }, uTime: { value: 0 },
        uWaveHeight: { value: plantWindUniforms.uWaveHeight.value }, uPlantSway: plantWindUniforms.uPlantSway,
        ...depthLodUniforms },
    colorWrite: false,
    side: THREE.DoubleSide
});
plantDepthMaterial.defaultAttributeValues = { uv: [0, 0], plantMotion: [0, 0] };

// Replacement arrays leave live scene geometry/materials untouched. Campfire
// cube faces also use this caster, with one time sample for all six faces.
export function plantCasterMaterials(source, onlyPlants = false) {
    if (!Array.isArray(source.material)) return onlyPlants ? hiddenMaterial : source.material;
    return source.material.map((material, group) => group === 1 ? plantDepthMaterial
        : onlyPlants ? hiddenMaterial : material);
}

function staticCasterMaterials(source) {
    return Array.isArray(source.material)
        ? source.material.map((material, group) => group === 1 ? hiddenMaterial : material)
        : source.material;
}

export const SHADOW_CASTER_MATERIALS = [
    solidDepthMaterial,
    cutoutDepthMaterial,
    hiddenMaterial,
    cutoutDepthMaterial
];


// Szybkie liście (bez prześwitów) rzucają pełny cień.

export function setShadowFastLeaves(on) {

    SHADOW_CASTER_MATERIALS[3] = on ? solidDepthMaterial : cutoutDepthMaterial;

}


// Model gracza - pełne pudełka.

const modelDepthMaterial = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: 'void main() {}',
    colorWrite: false,
    side: THREE.DoubleSide
});

const MODEL_LAYER = 2;


// Z przestrzeni kamery (-1..1) do tekstury (0..1).

const TO_TEXTURE = new THREE.Matrix4().set(
    0.5, 0, 0, 0.5,
    0, 0.5, 0, 0.5,
    0, 0, 0.5, 0.5,
    0, 0, 0, 1
);


function smoothstep(a, b, x) {

    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);

}


function createTarget(size) {

    const target = new THREE.WebGLRenderTarget(size, size, {
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
        depthBuffer: true
    });

    target.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;

    return target;

}


function disposeTarget(target) {

    target?.dispose();
    target?.depthTexture?.dispose();

}

// ------------------------------------------------------------
// Kamera jednej mapy: patrzy z kierunku światła na gracza, przesunięta
// tak, żeby piksele mapy stały w miejscu (bez migotania brzegów cieni,
// gdy gracz chodzi).
// ------------------------------------------------------------

class ShadowView {

    // fitVertical - przy niskim słońcu mapa niższa (gęstsza wzdłuż
    // promieni), ale wtedy wysokie góry daleko w stronę słońca wypadają
    // poza nią - daleka mapa jest zawsze kwadratowa.

    constructor(radius, verticalRange, fitVertical = true) {

        this.radius = radius;
        this.verticalRange = verticalRange;
        this.fitVertical = fitVertical;
        this.size = 1;

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100);

        this.matrix = new THREE.Matrix4();
        this.textureMatrix = new THREE.Matrix4();
        this.frustum = new THREE.Frustum();

        this.depthScale = 1;
        this.texel = 1;

        this.up = new THREE.Vector3();
        this.right = new THREE.Vector3();

    }


    // focus - miejsce gracza, direction - kierunek do światła,
    // reach - jak daleko w stronę światła mogą być bloki rzucające cień.

    place(focus, direction, reach) {

        const camera = this.camera;
        const radius = this.radius;
        const range = this.verticalRange;

        // "Do góry" kamery: pion świata (przy słońcu w zenicie - północ).

        this.up.set(0, 1, 0);

        if (Math.abs(direction.y) > 0.995) {
            this.up.set(0, 0, -1);
        }

        // Wzdłuż promieni (przy niskim słońcu) mapa nie musi być tak
        // wysoka - teren wokół gracza jest płaski względem promieni.

        const height = this.fitVertical ? Math.min(
            radius,
            radius * Math.abs(direction.y) + range * Math.sqrt(Math.max(0, 1 - direction.y * direction.y)) + 4
        ) : radius;

        // Kamera nad najwyższymi blokami (z zapasem), ale nie dalej niż
        // sięga teren (dalej i tak nic nie rzuca cienia).

        const above = (CHUNK_HEIGHT + 8 - (focus.y - range)) / Math.max(0.02, direction.y);

        const distance = Math.max(radius + 16, Math.min(above, reach));

        camera.left = -radius;
        camera.right = radius;
        camera.top = height;
        camera.bottom = -height;
        camera.near = 1;
        camera.far = distance + radius * 2 + range * 2 + 64;

        camera.updateProjectionMatrix();

        camera.up.copy(this.up);
        camera.position.copy(focus).addScaledVector(direction, distance);
        camera.lookAt(focus);
        camera.updateMatrixWorld();


        // Przesunięcie do siatki pikseli mapy (w osiach kamery).

        this.right.setFromMatrixColumn(camera.matrixWorld, 0);
        this.up.setFromMatrixColumn(camera.matrixWorld, 1);

        const texelX = (2 * radius) / this.size;
        const texelY = (2 * height) / this.size;

        const x = camera.position.dot(this.right);
        const y = camera.position.dot(this.up);

        camera.position
            .addScaledVector(this.right, Math.round(x / texelX) * texelX - x)
            .addScaledVector(this.up, Math.round(y / texelY) * texelY - y);

        camera.updateMatrixWorld();


        this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

        this.frustum.setFromProjectionMatrix(this.matrix);

        this.textureMatrix.multiplyMatrices(TO_TEXTURE, this.matrix);

        this.depthScale = 1 / (camera.far - camera.near);

        this.texel = texelX;

    }

}

// ------------------------------------------------------------

export class SunShadows {

    constructor(renderer) {

        this.renderer = renderer;

        // Cienie potrzebują WebGL2 (tekstury głębi, pozycja w świecie
        // w shaderze bloków).

        this.supported = renderer.capabilities.isWebGL2;

        const gl = renderer.getContext?.();
        const subpixelBits = gl?.getParameter?.(gl.SUBPIXEL_BITS);
        // Bez kontekstu (np. kontroler w teście CPU) używamy siatki 1/16;
        // podczas gry dokładność pochodzi zawsze z aktywnego renderera.
        shadowUniforms.uShadowRasterPrecision.value = Number.isFinite(subpixelBits) && subpixelBits >= 0
            ? 0.5 / 2 ** subpixelBits : 1 / 32;

        // 0 = wyłączone, 1 / 2 / 3 - SHADOW_QUALITY.
        this.quality = 0;

        this.near = new ShadowView(64, VERTICAL_RANGE);
        this.naturalLighting = false;
        const plantView = new ShadowView(PLANT_SHADOW_CONFIG.radius, 16, false);
        plantView.size = PLANT_SHADOW_CONFIG.size;
        this.plants = { view: plantView, target: null, backTarget: null, build: null,
            valid: false, needed: false, changed: true, hasCasters: false,
            center: new THREE.Vector3(), direction: new THREE.Vector3(), light: null,
            changeRevision: 0, sinceDraw: 0, draws: 0, time: 0 };
        this.plantScene = new THREE.Scene();
        this.plantScene.matrixWorldAutoUpdate = false;
        this.plantLastFrame = { draws: 0, triangles: 0 };
        this.cascades = DISTANT_SHADOW_CASCADES.map(config => {
            // Pełny kwadrat w przestrzeni światła. Przy niskim Słońcu
            // pionowego zakresu nie ścinamy do wysokości wokół gracza.
            const view = new ShadowView(config.radius, config.verticalRange, false);
            view.size = config.size;
            return { config, view, target: null, backTarget: null,
                valid: false, build: null, center: new THREE.Vector3(),
                direction: new THREE.Vector3(), light: null, changed: false,
                changeRevision: 0, sinceDraw: 0, needed: false, draws: 0,
                terrainRevision: -1 };
        });
        this.far = this.cascades[0].view;
        this.distant = this.cascades[1].view;

        // Dotychczasowi odbiorcy (promienie, komendy, diagnostyka) nadal
        // widzą far*. Nowy kod pracuje na wspólnym stanie każdej kaskady.
        for (const cascade of this.cascades) {
            const prefix = cascade.config.name;
            for (const [suffix, field] of Object.entries({ Target: 'target', BackTarget: 'backTarget',
                Valid: 'valid', Build: 'build', Center: 'center', Direction: 'direction',
                Light: 'light', Changed: 'changed', Needed: 'needed', Draws: 'draws' })) {
                Object.defineProperty(this, prefix + suffix, {
                    get: () => cascade[field], set: value => { cascade[field] = value; }
                });
            }
        }
        Object.defineProperty(this, 'sinceFar', {
            get: () => this.cascades[0].sinceDraw,
            set: value => { this.cascades[0].sinceDraw = value; }
        });
        this.buildScene = new THREE.Scene();
        this.buildScene.matrixWorldAutoUpdate = false;
        this.lastFrame = { draws: 0, triangles: 0, completed: 0, prepareMilliseconds: 0, submitMilliseconds: 0 };

        this.target = null;
        this.modelTarget = null;

        // Daleka mapa: gotowa (w shaderach) i rysowana po kawałku.
        this.farTarget = null;
        this.farBackTarget = null;

        this.modelCamera = new THREE.OrthographicCamera(
            -MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, MODEL_MAP_RADIUS, -MODEL_MAP_RADIUS, 0.1, MODEL_MAP_FAR
        );

        this.modelCamera.layers.set(MODEL_LAYER);

        // Światło, które teraz rzuca cienie.
        //   direction - kierunek DO światła,
        //   light     - 'sun' albo 'moon',
        //   strength  - siła przesłonięcia światła kierunkowego 0-1,
        //   ambientStrength - płynne dodatkowe przyciemnienie wnętrz.

        this.direction = new THREE.Vector3(0, 1, 0);
        this.light = 'sun';
        this.strength = 0;
        this.ambientStrength = 0;

        // Stan bliskiej mapy: kierunek i środek z ostatniego rysowania.

        this.drawnDirection = new THREE.Vector3();
        this.drawnLight = null;
        this.center = new THREE.Vector3();
        this.valid = false;
        this.changed = false;
        this.sinceDraw = 0;

        // Stan dalekiej mapy.

        this.farDirection = new THREE.Vector3();
        this.farLight = null;
        this.farCenter = new THREE.Vector3();
        this.farValid = false;
        this.farChanged = false;
        this.sinceFar = 0;
        this.farNeeded = false;

        // Rysowanie dalekiej mapy w toku: kolejne paczki chunków
        // (null - nie trwa).
        this.farBuild = null;

        // Liczniki przerysowań (debug, /cienie).
        this.draws = 0;
        this.farDraws = 0;

        this.box = new THREE.Box3();
        this.matrix = new THREE.Matrix4();
        this.modelCenter = new THREE.Vector3();

    }


    // Czy cienie są teraz włączone (ustawienie i karta graficzna).

    get enabled() {

        return this.quality > 0;

    }


    // Czy cienie są teraz widoczne (włączone, słońce albo księżyc nad
    // horyzontem, mapa narysowana).

    get active() {

        return this.enabled && this.valid && this.strength > 0;

    }


    // Czy jest daleka mapa (jakość "Dalekie").

    get hasFar() {

        return SHADOW_QUALITY[this.quality]?.far === true;

    }


    get radius() {

        return SHADOW_QUALITY[this.quality]?.radius ?? 0;

    }


    get size() {

        return SHADOW_QUALITY[this.quality]?.size ?? 0;

    }


    get farRadius() {

        return this.hasFar ? DISTANT_SHADOW_CASCADES.at(-1).radius : 0;

    }


    // Zgodność ze starszym kodem: kamera bliskiej mapy.

    get camera() {

        return this.near.camera;

    }


    // quality: 0 (wyłączone), 1, 2, 3.

    setQuality(quality) {

        const wanted = this.supported && SHADOW_QUALITY[quality] ? quality : 0;

        if (wanted === this.quality) {
            return;
        }

        const had = SHADOW_QUALITY[this.quality];

        this.quality = wanted;

        const settings = SHADOW_QUALITY[wanted];


        // Bliska mapa i cień gracza.

        if (!settings || settings.size !== had?.size) {

            disposeTarget(this.target);
            this.target = settings ? createTarget(settings.size) : null;

        }

        if (!settings || !had) {

            disposeTarget(this.modelTarget);
            this.modelTarget = settings ? createTarget(MODEL_MAP_SIZE) : null;

        }

        if (settings) {

            this.near.radius = settings.radius;
            this.near.size = settings.size;

        }


        // Daleka mapa.

        for (const cascade of this.cascades) {
            this.cancelBuild(cascade);
            if (!settings?.far) {
                disposeTarget(cascade.target);
                disposeTarget(cascade.backTarget);
                cascade.target = cascade.backTarget = null;
            }
            else if (!cascade.target) {
                cascade.target = createTarget(cascade.config.size);
                cascade.backTarget = createTarget(cascade.config.size);
            }
            cascade.valid = false;
            cascade.needed = false;
            cascade.terrainRevision = -1;
        }


        // Mapy trafiają do shaderów dopiero po pierwszym narysowaniu
        // (tekstura głębi użyta wcześniej jako zwykła tekstura zostawała
        // w pamięci karty po wyjściu ze świata).

        shadowUniforms.uSunShadowMap.value = null;
        shadowUniforms.uModelShadowMap.value = null;
        shadowUniforms.uFarShadowMap.value = null;
        shadowUniforms.uDistantShadowMap.value = null;

        this.valid = false;
        this.farValid = false;
        this.farBuild = null;

        this.resetPlantMap();

        this.syncUniforms();

    }

    // The comparison mode preserves the former static vegetation shadows.
    setNaturalLighting(enabled) {
        enabled = !!enabled;
        plantShadowState.natural = enabled;
        if (enabled === this.naturalLighting) return;
        this.naturalLighting = enabled;
        this.valid = false;
        for (const cascade of this.cascades) {
            this.cancelBuild(cascade);
            cascade.valid = false;
            cascade.needed = true;
        }
        this.resetPlantMap();
        this.syncUniforms();
    }

    resetPlantMap() {
        const plants = this.plants;
        this.cancelBuild(plants);
        if (!this.enabled || !this.naturalLighting) {
            disposeTarget(plants.target);
            disposeTarget(plants.backTarget);
            plants.target = plants.backTarget = null;
        } else if (!plants.target) {
            plants.target = createTarget(PLANT_SHADOW_CONFIG.size);
            plants.backTarget = createTarget(PLANT_SHADOW_CONFIG.size);
        }
        plants.valid = false;
        plants.needed = this.enabled && this.naturalLighting;
        plants.changed = true;
        plants.hasCasters = false;
        plants.sinceDraw = 0;
        shadowUniforms.uPlantShadowMap.value = null;
        shadowUniforms.uPlantShadowInfo.value.z = 0;
    }


    // Zmienił się mesh chunka (World.onMeshChanged) - jeśli jest
    // w zasięgu mapy, trzeba ją przerysować.

    markChunk(chunk) {

        if (this.valid && this.near.frustum.intersectsBox(chunkBox(this.box, chunk))) {
            this.changed = true;
        }

        for (const cascade of this.cascades) {
            if ((cascade.valid || cascade.build) && cascade.view.frustum.intersectsBox(chunkBox(this.box, chunk))) {
                cascade.changed = true;
                cascade.changeRevision++;
            }
        }

        this.markPlantAnimation(chunk);

    }

    // Tiny moving plants only invalidate the near shadow map. Distant terrain
    // cascades keep their existing update budget and are refreshed at remesh.
    markPlantAnimation(chunk) {
        if (!this.naturalLighting) {
            if (this.valid && this.near.frustum.intersectsBox(chunkBox(this.box, chunk))) this.changed = true;
            return;
        }
        const plants = this.plants;
        if ((plants.valid || plants.build) && plants.view.frustum.intersectsBox(chunkBox(this.box, chunk))) {
            plants.changed = true;
            plants.changeRevision++;
        }
    }


    // Co klatkę (po Sky.update): które światło rzuca cienie, jak mocno,
    // czy trzeba przerysować mapy. focus - miejsce gracza.

    update(dt, sky, focus) {

        this.sinceDraw += dt;
        this.plants.sinceDraw += dt;
        for (const cascade of this.cascades) cascade.sinceDraw += dt;

        const state = sky.state;
        const celestial = sky.celestial;

        // Rzuca cienie mocniejsze z dwóch świateł - w dzień słońce,
        // w księżycową noc księżyc.

        const sun = state.sunLightIntensity >= state.moonLightIntensity;

        this.light = sun ? 'sun' : 'moon';

        this.direction.copy(sun
            ? (sky.atmosphere && sky.sunLightDirection ? sky.sunLightDirection : celestial.sunDirection)
            : celestial.moonDirection).normalize();

        // W kosmosie (nad światem) cieni nie ma.

        const spaceStrength = 1 - smoothstep(0.2, 0.6, sky.space);
        // Doświetlenie wnętrz zachowuje dotychczasową krzywą względem
        // środka Słońca; kierunek promienia może już śledzić jego wycinek.
        const ambientHeight = sun ? celestial.sunDirection.y : this.direction.y;
        this.ambientStrength = smoothstep(FADE_LOW, FADE_HIGH, ambientHeight) * spaceStrength;

        // SolarAtmosphere osłabia energię źródła i wygasza tarczę na
        // horyzoncie. Mieszanie mapy cienia z dostępem do nieba także tutaj
        // wpuszczałoby bezpośrednie światło przez zasłaniające je bloki.
        // Osobne ambientStrength zachowuje płynne doświetlenie wnętrz.
        this.strength = sun && sky.atmosphere
            ? (this.direction.y > 0 && state.sunLightIntensity > 0 ? spaceStrength : 0)
            : this.ambientStrength;


        this.syncUniforms();


        if (!this.enabled || this.strength <= 0) {

            this.needsDraw = false;
            this.plants.needed = false;
            this.cancelBuild(this.plants);
            for (const cascade of this.cascades) {
                cascade.needed = false;
                this.cancelBuild(cascade);
            }

            return false;

        }


        // Czy przerysować bliską mapę.

        const radius = this.radius;

        const moved =
            Math.hypot(focus.x - this.center.x, focus.z - this.center.z) > radius * MOVE_SHARE ||
            Math.abs(focus.y - this.center.y) > VERTICAL_RANGE * MOVE_SHARE;

        const turned =
            this.direction.dot(this.drawnDirection) < Math.cos(ANGLE_STEP) ||
            this.light !== this.drawnLight;

        this.needsDraw =
            !this.valid || moved || turned ||
            (this.changed && this.sinceDraw >= CHUNK_REDRAW_SECONDS);

        if (this.naturalLighting) {
            const plants = this.plants;
            const jump = plants.valid && (plants.light !== this.light ||
                this.direction.dot(plants.direction) < Math.cos(0.08) ||
                focus.distanceTo(plants.center) > PLANT_SHADOW_CONFIG.radius * 0.75);
            const pendingJump = plants.build && (plants.build.light !== this.light ||
                this.direction.dot(plants.build.direction) < Math.cos(0.08) ||
                focus.distanceTo(plants.build.center) > PLANT_SHADOW_CONFIG.radius * 0.75);
            if (jump) plants.valid = false;
            if (pendingJump) this.cancelBuild(plants);
            const moved = focus.distanceTo(plants.center) > PLANT_SHADOW_CONFIG.radius * MOVE_SHARE;
            const turned = this.direction.dot(plants.direction) < Math.cos(ANGLE_STEP);
            plants.needed = !plants.valid || moved || turned ||
                ((plants.hasCasters || plants.changed) && plants.sinceDraw >= PLANT_SHADOW_CONFIG.interval);
        }


        // Czy przerysować daleką mapę.

        if (this.hasFar) {
            for (const cascade of this.cascades) {
                const { config } = cascade;
                const source = cascade.build?.light ?? cascade.light;
                const sourceChanged = source !== null && source !== this.light;
                // Komenda zmiany czasu/teleport nie jest zwykłym opóźnieniem
                // mapy. Nie pokazuj cienia z innego kierunku ani nie kończ
                // pracy skierowanej na miejsce, z którego gracz już odszedł.
                const discontinuity = Math.cos(0.08);
                const publishedJump = cascade.valid && cascade.light !== null &&
                    (this.direction.dot(cascade.direction) < discontinuity ||
                        focus.distanceTo(cascade.center) > config.radius * 0.75);
                const pendingJump = cascade.build &&
                    (this.direction.dot(cascade.build.direction) < discontinuity ||
                        focus.distanceTo(cascade.build.center) > config.radius * 0.75);
                if (publishedJump) cascade.valid = false;
                if (sourceChanged) {
                    cascade.valid = false;
                }
                if (sourceChanged || pendingJump) this.cancelBuild(cascade);
                // Długość cienia ~ h/tan(elewacji): stały próg kątowy
                // dawał duże przeskoki przy horyzoncie. Tam aktualizujemy
                // częściej, nadal pod wspólnym limitem pracy na klatkę.
                const sine = Math.max(0.04, this.direction.y);
                const angle = Math.max(0.00008, Math.min(0.003, sine * sine * config.radius / 32000));
                const moved = focus.distanceTo(cascade.center) > config.move;
                const turned = this.direction.dot(cascade.direction) < Math.cos(angle);
                cascade.needed = !cascade.valid || sourceChanged || moved ||
                    ((turned || cascade.changed) && cascade.sinceDraw >= config.interval);
            }
        }

        this.syncUniforms();
        return this.needsDraw;

    }


    // Wartości dla shaderów (siła cieni dopiero z narysowaną mapą).

    syncUniforms() {

        const u = shadowUniforms;

        const strength = this.active ? this.strength : 0;

        u.uSunShadowLight.value = this.light === 'sun' ? 0 : 1;
        u.uSunShadowDir.value.copy(this.direction);
        u.uSunShadowInfo.value.y = strength;
        u.uSunShadowInfo.value.w = strength > 0 ? 1 : 0;
        u.uSunShadowAmbient.value = SHADOW_INDOOR_DARKNESS * (this.active ? this.ambientStrength : 0);
        u.uFarShadowInfo.value.z = this.hasFar && this.farValid && strength > 0 ? 1 : 0;
        u.uDistantShadowInfo.value.z = this.hasFar && this.distantValid && strength > 0 ? 1 : 0;
        u.uPlantShadowInfo.value.z = this.naturalLighting && this.plants.valid && strength > 0 ? 1 : 0;
        u.uPlantShadowInfo.value.w = this.naturalLighting ? 1 : 0;

    }


    // Rysuje mapy cieni (przed światem, w Game.render).
    //   world        - World (chunki w world.shadowScene),
    //   focus        - miejsce gracza (oczy),
    //   model        - PlayerModel albo null (cień gracza),
    //   scene        - scena świata (z modelem gracza),
    //   loadedRadius - zasięg wczytanych chunków (bloki),
    //   farTerrain   - FarTerrain albo null (daleka mapa).

    render(world, focus, model, scene, loadedRadius, farTerrain = null) {

        this.lastFrame = { draws: 0, triangles: 0, completed: 0, prepareMilliseconds: 0, submitMilliseconds: 0 };
        this.plantLastFrame = { draws: 0, triangles: 0 };
        if (!this.enabled || this.strength <= 0) {
            return;
        }

        const renderer = this.renderer;

        const previous = renderer.getRenderTarget();


        if (this.needsDraw) {

            this.center.copy(focus);
            this.drawnDirection.copy(this.direction);
            this.drawnLight = this.light;

            const near = this.near;

            near.place(focus, this.direction, loadedRadius + near.radius);

            // Tylko chunki w zasięgu kamery słońca.

            const visibility = world.shadowScene.children.map(caster => caster.visible);
            const materials = world.shadowScene.children.map(caster => caster.material);
            for (const caster of world.shadowScene.children) {
                caster.visible = near.frustum.intersectsBox(chunkBox(this.box, caster.userData.chunk));
                if (this.naturalLighting) caster.material = staticCasterMaterials(caster);
            }

            try {
                renderer.setRenderTarget(this.target);
                renderer.clear();
                renderer.render(world.shadowScene, near.camera);
            } finally {
                world.shadowScene.children.forEach((caster, i) => { caster.visible = visibility[i]; });
                world.shadowScene.children.forEach((caster, i) => { caster.material = materials[i]; });
            }

            const u = shadowUniforms;

            u.uSunShadowMatrix.value.copy(near.textureMatrix);
            u.uSunShadowInfo.value.x = near.depthScale;
            u.uSunShadowInfo.value.z = near.texel;
            updateShadowSamplingMetrics(u.uSunShadowMetrics.value, near.textureMatrix, near.texel);
            u.uSunShadowMap.value = this.target.depthTexture;

            this.valid = true;
            this.changed = false;
            this.needsDraw = false;
            this.sinceDraw = 0;
            this.draws++;

            this.syncUniforms();

        }

        if (this.naturalLighting) this.renderPlants(world, focus, loadedRadius);


        // Daleka mapa - kawałek na klatkę.

        if (this.hasFar) {
            const revision = farTerrain?.shadowRevision ?? 0;
            for (const cascade of this.cascades) {
                if (cascade.terrainRevision !== revision) cascade.changed = true;
                if (!cascade.valid || (cascade.changed && cascade.sinceDraw >= cascade.config.interval)) {
                    cascade.needed = true;
                }
            }
            this.buildFar(world, focus, loadedRadius, farTerrain);
        }


        // Cień gracza - co klatkę (model ciągle się rusza).

        if (model) {
            this.renderModel(model, scene);
        }

        renderer.setRenderTarget(previous);

    }


    renderPlants(world, focus, loadedRadius) {
        const plants = this.plants;
        if (!plants.target || (!plants.build && !plants.needed)) return;
        if (!plants.build) {
            plants.view.place(focus, this.direction, Math.min(loadedRadius, 64) + PLANT_SHADOW_CONFIG.radius);
            const jobs = [];
            for (const source of world.shadowScene.children) {
                const chunk = source.userData.chunk;
                if (!chunk || !plants.view.frustum.intersectsBox(chunkBox(this.box, chunk)) ||
                    this.box.distanceToPoint(focus) > PLANT_SHADOW_CONFIG.radius + CHUNK_SIZE) continue;
                appendShadowJobs(jobs, source, true, plantCasterMaterials(source, true), PLANT_SHADOW_BUILD_BUDGET);
            }
            plants.build = { jobs, cursor: 0, cleared: false, time: plantWindUniforms.uTime.value,
                waveHeight: plantWindUniforms.uWaveHeight.value,
                center: focus.clone(), direction: this.direction.clone(), light: this.light,
                worldRevision: plants.changeRevision };
            plants.needed = false;
        }
        const build = plants.build, renderer = this.renderer;
        const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
        const previousTime = plantDepthMaterial.uniforms.uTime.value;
        const previousWaveHeight = plantDepthMaterial.uniforms.uWaveHeight.value;
        const deadline = performance.now() + PLANT_SHADOW_BUILD_BUDGET.milliseconds;
        try {
            renderer.autoClear = false;
            renderer.setRenderTarget(plants.backTarget);
            plantDepthMaterial.uniforms.uTime.value = build.time;
            plantDepthMaterial.uniforms.uWaveHeight.value = build.waveHeight;
            if (!build.cleared) { renderer.clear(); build.cleared = true; }
            this.plantScene.clear();
            while (build.cursor < build.jobs.length) {
                const job = build.jobs[build.cursor];
                if (this.plantLastFrame.draws + job.draws > PLANT_SHADOW_BUILD_BUDGET.draws ||
                    this.plantLastFrame.triangles + job.triangles > PLANT_SHADOW_BUILD_BUDGET.triangles ||
                    (this.plantLastFrame.draws > 0 && performance.now() >= deadline)) break;
                this.plantScene.add(job.mesh);
                this.plantLastFrame.draws += job.draws;
                this.plantLastFrame.triangles += job.triangles;
                build.cursor++;
            }
            if (this.plantScene.children.length) renderer.render(this.plantScene, plants.view.camera);
            this.plantScene.clear();
            if (build.cursor === build.jobs.length) {
                [plants.target, plants.backTarget] = [plants.backTarget, plants.target];
                shadowUniforms.uPlantShadowMap.value = plants.target.depthTexture;
                shadowUniforms.uPlantShadowMatrix.value.copy(plants.view.textureMatrix);
                shadowUniforms.uPlantShadowInfo.value.x = plants.view.depthScale;
                shadowUniforms.uPlantShadowInfo.value.y = plants.view.texel;
                updateShadowSamplingMetrics(shadowUniforms.uPlantShadowMetrics.value,
                    plants.view.textureMatrix, plants.view.texel);
                plants.center.copy(build.center);
                plants.direction.copy(build.direction);
                plants.light = build.light;
                plants.time = build.time;
                plants.hasCasters = build.jobs.length > 0;
                plants.changed = plants.changeRevision !== build.worldRevision;
                plants.valid = true;
                plants.needed = false;
                plants.sinceDraw = 0;
                plants.draws++;
                this.cancelBuild(plants);
                this.syncUniforms();
            }
        } finally {
            this.plantScene.clear();
            plantDepthMaterial.uniforms.uTime.value = previousTime;
            plantDepthMaterial.uniforms.uWaveHeight.value = previousWaveHeight;
            renderer.autoClear = autoClear;
            renderer.setRenderTarget(previous);
        }
    }

    // Jeden krok wspólnego schedulera. Obie kaskady dostają naprzemiennie
    // pracę; również kafle far są zwykłymi zadaniami pod tym samym limitem.
    // Snapshot trzyma geometrię/maskę i kamerę od początku do końca budowy.

    buildFar(world, focus, loadedRadius, farTerrain) {

        this.lastFrame = { draws: 0, triangles: 0, completed: 0, prepareMilliseconds: 0, submitMilliseconds: 0 };
        if (!this.hasFar) return;
        const start = this.nextCascade ?? 0;
        let cascade;
        for (let i = 0; i < this.cascades.length; i++) {
            const index = (start + i) % this.cascades.length;
            const candidate = this.cascades[index];
            if (candidate.build || candidate.needed) {
                cascade = candidate;
                this.nextCascade = (index + 1) % this.cascades.length;
                break;
            }
        }
        if (!cascade) return;
        if (!cascade.build) {
            const preparing = performance.now();
            this.startBuild(cascade, world, focus, loadedRadius, farTerrain);
            this.lastFrame.prepareMilliseconds = performance.now() - preparing;
        }

        const renderer = this.renderer;
        const build = cascade.build;
        const previous = renderer.getRenderTarget();
        const autoClear = renderer.autoClear;
        const deadline = performance.now() + SHADOW_BUILD_BUDGET.milliseconds;
        const restoreLod = bindDepthLodSnapshot(build.terrain?.lodUniforms);
        try {
            renderer.autoClear = false;
            renderer.setRenderTarget(cascade.backTarget);
            if (!build.cleared) {
                renderer.clear();
                build.cleared = true;
            }
            this.buildScene.clear();
            while (build.cursor < build.jobs.length) {
                const job = build.jobs[build.cursor];
                if (this.lastFrame.draws + job.draws > SHADOW_BUILD_BUDGET.draws ||
                    this.lastFrame.triangles + job.triangles > SHADOW_BUILD_BUDGET.triangles ||
                    (this.lastFrame.draws > 0 && performance.now() >= deadline)) break;
                this.buildScene.add(job.mesh);
                this.lastFrame.draws += job.draws;
                this.lastFrame.triangles += job.triangles;
                build.cursor++;
            }
            if (this.buildScene.children.length) {
                const submitting = performance.now();
                renderer.render(this.buildScene, cascade.view.camera);
                this.lastFrame.submitMilliseconds = performance.now() - submitting;
            }
            this.buildScene.clear();
            if (build.cursor === build.jobs.length) this.publishBuild(cascade, farTerrain);
        } finally {
            restoreLod();
            this.buildScene.clear();
            renderer.autoClear = autoClear;
            renderer.setRenderTarget(previous);
        }

    }

    startBuild(cascade, world, focus, loadedRadius, farTerrain) {
        const terrainActive = farTerrain?.active === true;
        const reach = terrainActive ? farTerrain.outer + 64 : loadedRadius + cascade.config.radius;
        cascade.view.place(focus, this.direction, reach);
        const terrain = terrainActive ? farTerrain.collectShadowCasters(cascade.view.frustum) : null;
        const jobs = [];
        for (const source of world.shadowScene.children) {
            if (cascade.view.frustum.intersectsBox(chunkBox(this.box, source.userData.chunk))) {
                appendShadowJobs(jobs, source, true, this.naturalLighting ? staticCasterMaterials(source) : null);
            }
        }
        for (const source of terrain?.casters ?? []) appendShadowJobs(jobs, source, false);
        cascade.build = { jobs, terrain, cursor: 0, cleared: false,
            center: focus.clone(), direction: this.direction.clone(), light: this.light,
            worldRevision: cascade.changeRevision, terrainRevision: terrain?.revision ?? farTerrain?.shadowRevision ?? 0 };
        cascade.needed = false;
    }

    publishBuild(cascade, farTerrain) {
        const build = cascade.build;
        [cascade.target, cascade.backTarget] = [cascade.backTarget, cascade.target];
        const prefix = cascade.config.name === 'far' ? 'uFarShadow' : 'uDistantShadow';
        shadowUniforms[prefix + 'Matrix'].value.copy(cascade.view.textureMatrix);
        shadowUniforms[prefix + 'Info'].value.x = cascade.view.depthScale;
        shadowUniforms[prefix + 'Info'].value.y = cascade.view.texel;
        updateShadowSamplingMetrics(shadowUniforms[prefix + 'Metrics'].value,
            cascade.view.textureMatrix, cascade.view.texel);
        shadowUniforms[prefix + 'Map'].value = cascade.target.depthTexture;
        cascade.center.copy(build.center);
        cascade.direction.copy(build.direction);
        cascade.light = build.light;
        cascade.terrainRevision = build.terrainRevision;
        cascade.changed = cascade.changeRevision !== build.worldRevision ||
            cascade.terrainRevision !== (farTerrain?.shadowRevision ?? 0);
        cascade.valid = true;
        cascade.draws++;
        cascade.sinceDraw = 0;
        cascade.needed = false;
        this.lastFrame.completed++;
        this.cancelBuild(cascade);
        this.syncUniforms();
    }

    cancelBuild(cascade) {
        const build = cascade.build;
        if (!build) return;
        cascade.build = null;
        const released = new Set();
        const retained = new Set();
        for (const other of [...this.cascades, this.plants]) {
            for (const job of other.build?.jobs ?? []) retained.add(job.original);
        }
        for (const job of build.jobs) {
            job.mesh.removeFromParent();
            const retired = job.world && (job.source.geometry !== job.original || !job.source.parent);
            const retainedElsewhere = retired && retained.has(job.original);
            if (job.view) {
                // BufferAttributes są współdzielone z żywym meshem. Zwolnij
                // tylko VAO widoku; nie kasuj jego buforów z pamięci GPU.
                if (!retired || retainedElsewhere || released.has(job.original)) {
                    job.mesh.geometry.attributes = {};
                    job.mesh.geometry.index = null;
                } else released.add(job.original);
                job.mesh.geometry.dispose();
            } else if (retired && !retainedElsewhere && !released.has(job.original)) {
                job.original.dispose();
                released.add(job.original);
            }
        }
        build.terrain?.dispose();
    }

    stats() {
        return { budget: { ...SHADOW_BUILD_BUDGET }, lastFrame: { ...this.lastFrame },
            plants: { enabled: this.naturalLighting, budget: { ...PLANT_SHADOW_BUILD_BUDGET },
                lastFrame: { ...this.plantLastFrame }, radius: PLANT_SHADOW_CONFIG.radius,
                size: PLANT_SHADOW_CONFIG.size, interval: PLANT_SHADOW_CONFIG.interval,
                valid: this.plants.valid, building: !!this.plants.build, draws: this.plants.draws,
                remaining: this.plants.build ? this.plants.build.jobs.length - this.plants.build.cursor : 0,
                sampleTime: this.plants.time, age: this.plants.sinceDraw },
            cascades: this.cascades.map(cascade => ({ name: cascade.config.name,
                radius: cascade.config.radius, size: cascade.config.size, valid: cascade.valid,
                building: !!cascade.build, remaining: cascade.build ? cascade.build.jobs.length - cascade.build.cursor : 0,
                draws: cascade.draws, terrainRevision: cascade.terrainRevision, changed: cascade.changed })) };
    }


    renderModel(model, scene) {

        const renderer = this.renderer;
        const camera = this.modelCamera;
        const object = model.object;

        object.updateMatrixWorld(true);

        const center = this.box.setFromObject(object).getCenter(this.modelCenter);

        camera.quaternion.copy(this.near.camera.quaternion);
        camera.position.copy(center).addScaledVector(this.direction, MODEL_MAP_DISTANCE);
        camera.updateMatrixWorld();

        this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

        shadowUniforms.uModelShadowMatrix.value.multiplyMatrices(TO_TEXTURE, this.matrix);
        updateShadowSamplingMetrics(shadowUniforms.uModelShadowMetrics.value,
            shadowUniforms.uModelShadowMatrix.value, 2 * MODEL_MAP_RADIUS / MODEL_MAP_SIZE);


        // W widoku z oczu modelu nie widać, ale cień rzuca.

        const visible = object.visible;

        object.visible = true;

        object.traverse((child) => child.layers.enable(MODEL_LAYER));

        const override = scene.overrideMaterial;
        const autoUpdate = scene.matrixWorldAutoUpdate;

        scene.overrideMaterial = modelDepthMaterial;
        scene.matrixWorldAutoUpdate = false;

        renderer.setRenderTarget(this.modelTarget);
        renderer.clear();
        renderer.render(scene, camera);

        shadowUniforms.uModelShadowMap.value = this.modelTarget.depthTexture;

        scene.overrideMaterial = override;
        scene.matrixWorldAutoUpdate = autoUpdate;

        object.visible = visible;

    }

    // --------------------------------------------------------
    // Czy słońce dochodzi do punktu (dla modelu gracza, ręki,
    // osiągnięć, światła odbitego) - promień przez bloki w stronę
    // światła: 1 = pełne słońce, 0 = cień. Liście przepuszczają trochę.
    // --------------------------------------------------------

    static sunVisibility(world, x, y, z, direction, maxDistance = 96) {

        if (direction.y <= 0) {
            return 0;
        }

        let ix = Math.floor(x);
        let iy = Math.floor(y);
        let iz = Math.floor(z);

        const stepX = Math.sign(direction.x);
        const stepY = 1;
        const stepZ = Math.sign(direction.z);

        const deltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
        const deltaY = Math.abs(1 / direction.y);
        const deltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;

        let maxX = stepX > 0 ? (ix + 1 - x) * deltaX : stepX < 0 ? (x - ix) * deltaX : Infinity;
        let maxY = (iy + 1 - y) * deltaY;
        let maxZ = stepZ > 0 ? (iz + 1 - z) * deltaZ : stepZ < 0 ? (z - iz) * deltaZ : Infinity;

        let light = 1;

        let travelled = 0;

        while (travelled < maxDistance && iy < CHUNK_HEIGHT) {

            if (maxX < maxY && maxX < maxZ) {
                ix += stepX;
                travelled = maxX;
                maxX += deltaX;
            }
            else if (maxY < maxZ) {
                iy += stepY;
                travelled = maxY;
                maxY += deltaY;
            }
            else {
                iz += stepZ;
                travelled = maxZ;
                maxZ += deltaZ;
            }

            const id = world.getBlockId(ix, iy, iz);

            if (isLeavesId(id)) {

                light *= 0.55;

                if (light < 0.05) {
                    return 0;
                }

            }
            else if (isOpaqueId(id)) {
                return 0;
            }

        }

        return light;

    }


    dispose() {

        this.setQuality(0);

    }

}


// Pudełko chunka: od dołu świata do najwyższego bloku.

function chunkBox(box, chunk) {

    box.min.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    box.max.set(chunk.cx * CHUNK_SIZE + CHUNK_SIZE, Math.min(chunk.maxY, CHUNK_HEIGHT) + 2, chunk.cz * CHUNK_SIZE + CHUNK_SIZE);

    return box;

}

// Niezależne proxy: nigdy nie przepinamy casterów świata/far ani nie
// zmieniamy ich visible/drawRange. Nietypowo duża geometria jest dzielona
// na lekkie widoki tych samych buforów, żeby również ona mieściła się
// w pojedynczym budżecie; zwykłe meshe nie wymagają tych widoków.
function appendShadowJobs(jobs, source, world, materialOverride = null, budget = SHADOW_BUILD_BUDGET) {
    const original = source.geometry;
    const total = original.index?.count ?? original.getAttribute('position').count;
    const start = original.drawRange.start;
    const end = Math.min(total, start + original.drawRange.count);
    const sourceMaterials = materialOverride ?? source.material;
    const materials = Array.isArray(sourceMaterials) ? sourceMaterials.slice() : sourceMaterials;
    const groups = (Array.isArray(materials) ? original.groups : [{ start, count: end - start, materialIndex: 0 }])
        .map(group => ({ start: Math.max(start, group.start), end: Math.min(end, group.start + group.count),
            material: Array.isArray(materials) ? materials[group.materialIndex] : materials }))
        .filter(group => group.end > group.start && group.material?.visible !== false);
    const triangles = groups.reduce((sum, group) => sum + Math.floor((group.end - group.start) / 3), 0);
    if (!triangles) return;
    const add = (geometry, material, draws, count, view) => {
        // Snapshot far już posiada niezależne proxy, które wolno przepinać
        // do sceny budowy. Tylko świat i dzielone widoki wymagają nowego.
        const mesh = !world && !view ? source : new THREE.Mesh(geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrixWorldAutoUpdate = false;
        mesh.matrix.copy(source.matrixWorld);
        mesh.matrixWorld.copy(source.matrixWorld);
        mesh.frustumCulled = false; // lista jest ograniczona frustum światła, nie widza
        jobs.push({ mesh, draws, triangles: count, world, source, original, view });
    };
    if (triangles <= budget.triangles && groups.length <= budget.draws) {
        add(original, materials, groups.length, triangles, false);
        return;
    }
    const page = Math.min(16000, budget.triangles) * 3;
    // Three also needs bounds for render sorting when frustumCulled=false.
    // Each view shares the entire vertex buffer: leaving its bounds empty
    // rescans the full dense garden for every small shadow page. One existing
    // conservative sphere covers all subsets without changing any draw range.
    if (original.boundingSphere === null) original.computeBoundingSphere();
    for (const group of groups) {
        for (let offset = group.start; offset < group.end; offset += page) {
            const count = Math.min(page, group.end - offset);
            const view = new THREE.BufferGeometry();
            view.attributes = { ...original.attributes };
            view.index = original.index;
            view.boundingSphere = original.boundingSphere.clone();
            view.setDrawRange(offset, count);
            add(view, group.material, 1, Math.floor(count / 3), true);
        }
    }
}
