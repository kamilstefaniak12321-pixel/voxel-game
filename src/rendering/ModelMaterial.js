import * as THREE from 'three';
import { campfireLightUniforms, CAMPFIRE_LIGHT_GLSL } from './CampfireLight.js';
import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { installLightingDiagnostics } from './LightingDiagnostics.js';
import { installSurfaceProfiles } from './LeafLighting.js';

import {
    skyUniforms,
    SKY_COLOR_GLSL
} from '../sky/skyShader.js';

import {
    dynamicLightUniforms
} from '../world/DynamicLight.js';

import {
    viewUniforms,
    VIEW_GLSL
} from './viewUniforms.js';

import {
    meteorLightUniforms,
    METEOR_LIGHT_GLSL
} from './meteorLight.js';

import {
    shadowUniforms,
    shadowLightsChunk,
    DISTANT_SHADOW_GLSL
} from './Shadows.js';

// ------------------------------------------------------------
// MATERIAŁ MODELI (gracz, blok w ręce)
//
// Model oświetla się tak samo jak bloki (BlockRenderData.js): światło
// nieba przechodzi przez słońce i otoczenie sceny, światło lamp świeci
// samo (liczy się jaśniejsze z nich), w nocy kolory bledną, działa
// dynamiczne światło, jasność z ustawień i mgła w kolorze nieba.
//
// Różnica: bloki mają światło zapisane w rogach ścian, a model bierze
// je z jednego miejsca - tam, gdzie stoi gracz (modelLight, ustawia
// Game). Jasność "na oko" 0-1, jak w rogach ścian bloków.
// ------------------------------------------------------------

export const modelLight = {

    // Światło nieba (0-1).
    uModelSky: { value: 1 },

    // Światło lamp w kolorze (0-1 na kanał).
    uModelBlock: { value: new THREE.Vector3() },

    // Cienie słońca (Shadows.js): 1 = włączone - wtedy światło nieba
    // przyciemnia tylko światło otoczenia, a światło słońca mnoży się
    // przez uModelSun (0-1, liniowo: czy słońce dochodzi do gracza).
    uModelShadows: { value: 0 },
    uModelSun: { value: 1 },
    // Dalekie góry zasłaniają również model i przedmiot w ręce.
    // Bliski promień CPU zachowuje prześwity liści; mapy uzupełniają
    // przeszkody poza wczytanymi chunkami, bez cienia własnego gracza.
    uModelDistantShadows: { value: 0 },

    // Światło otoczenia z cieniami (liniowo) - w ciemnym miejscu słabsze
    // (SHADOW_INDOOR_DARKNESS w config.js).
    uModelAmbient: { value: 1 },

    // Światło odbite w miejscu gracza (liniowe, RGB) - BounceLight.js.
    uModelBounce: { value: new THREE.Vector3() }

};

// Podgląd ekwipunku ma oddzielny kontekst WebGL i własne światło.
// Nie przenosimy do niego tekstur głębi z renderera świata.
const previewRenderers = new WeakSet();
export function setModelPreviewRenderer(renderer) {
    previewRenderers.add(renderer);
}


// map       - tekstura (skórka albo atlas bloków),
// alphaTest - przezroczyste piksele (wierzchnia warstwa skórki),
// glow      - ile blok sam świeci (0-1, lampa w ręce).

export function createModelMaterial({ map = null, alphaTest = 0, glow = 0, vertexColors = false,
    lighting = null, baselineLambert = false }) {

    const material = new THREE.MeshLambertMaterial({ map, alphaTest, vertexColors });
    material.defaultAttributeValues = { ...material.defaultAttributeValues, surfaceProfile: [0, 0] };

    const own = { uModelGlow: { value: glow } };

    material.userData.uniforms = own;
    material.customProgramCacheKey = () => `model-lighting-v4-${baselineLambert ? 'legacy-lambert' : 'model'}`;


    material.onBeforeCompile = (shader, renderer) => {
        installSurfaceProfiles(shader);

        Object.assign(shader.uniforms, skyUniforms, viewUniforms, modelLight, meteorLightUniforms, own);
        if (lighting) Object.assign(shader.uniforms, lighting);

        shader.uniforms.uSunShadowLight = shadowUniforms.uSunShadowLight;


        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vSkyDirection;
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;

                #ifdef POTATO
                    varying vec3 vFogSky;
                    uniform float uFogBrightness;
                    ${SKY_COLOR_GLSL}
                #endif`
            )
            .replace(
                '#include <fog_vertex>',
                `#include <fog_vertex>
                vWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vWorldNormal = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
                vSkyDirection = vWorldPosition - cameraPosition;

                #ifdef POTATO
                    vFogSky = skyColor(normalize(vSkyDirection)) * uFogBrightness;
                #endif`
            );


        const dynamic = renderer.capabilities.isWebGL2;
        const sceneShadows = dynamic && !previewRenderers.has(renderer);

        if (sceneShadows) Object.assign(shader.uniforms, shadowUniforms, campfireLightUniforms);

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `${dynamic ? '#define USE_DYNAMIC_LIGHT' : ''}
                #include <common>
                varying vec3 vSkyDirection;
                varying vec3 vWorldPosition;
                varying vec3 vWorldNormal;
                uniform float uFogBrightness;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                uniform float uModelSky;
                uniform vec3 uModelBlock;
                uniform float uModelGlow;
                uniform float uModelShadows;
                uniform float uModelSun;
                uniform float uModelDistantShadows;
                uniform float uModelAmbient;
                uniform vec3 uModelBounce;
                ${sceneShadows ? `#define USE_FAR_SHADOWS\n${DISTANT_SHADOW_GLSL}` : 'uniform int uSunShadowLight;'}
                ${SKY_COLOR_GLSL}
                ${VIEW_GLSL}
                ${SURFACE_LIGHTING_GLSL}
                ${METEOR_LIGHT_GLSL}
                ${sceneShadows ? CAMPFIRE_LIGHT_GLSL : 'vec3 campfireLight(vec3 p, vec3 n) { return vec3(0.0); }'}

                #ifdef USE_DYNAMIC_LIGHT
                    uniform highp sampler3D uDynamicLight;
                    uniform vec3 uDynamicOrigin;
                    uniform float uDynamicSize;
                    uniform float uDynamicEnabled;
                #endif

                #ifdef POTATO
                    varying vec3 vFogSky;
                    #define FOG_SKY vFogSky
                #else
                    #define FOG_SKY (skyColor(normalize(vSkyDirection)) * uFogBrightness)
                #endif`
            )
            .replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                vec3 modelTexel = diffuseColor.rgb;
                // Wcześniej gołe materiały Lamberta (popiół/podpałka)
                // zachowują bazę A/B; nowy profil stosuje lokalne dane.
                float modelBaselineLambert = ${baselineLambert ? '(1.0 - uLightingNatural)' : '0.0'};
                float modelSky = surfaceDecodeLight(uModelSky);
                float modelSun = uModelSun;
                ${sceneShadows ? `if (uModelDistantShadows > 0.5 && modelBaselineLambert < 0.5) {
                    modelSun = environmentShadowVisibility(vWorldPosition, normalize(vWorldNormal), modelSun);
                }` : ''}
                if (uModelShadows < 0.5 && uAtmosphericLight < 0.5 && modelBaselineLambert < 0.5) {
                    diffuseColor.rgb *= modelSky;
                }`
            )
            .replace(
                '#include <lights_fragment_begin>',
                shadowLightsChunk('(uModelShadows > 0.5 ? modelSun : modelSky)', 'modelSky',
                    'mix(uModelAmbient, modelSky, uAtmosphericLight)',
                    '(uModelShadows > 0.5 || uAtmosphericLight > 0.5) && modelBaselineLambert < 0.5')
            )
            .replace(
                '#include <opaque_fragment>',
                `
                // Światło lamp - ściany cieniowane jak u bloków (góra
                // najjaśniejsza, spód najciemniejszy).

                float faceShade = surfaceFaceShade(vWorldNormal);
                vec3 modelLocal = surfaceDecodeLight(uModelBlock * faceShade);

                #ifdef USE_DYNAMIC_LIGHT

                    if (uDynamicEnabled > 0.5) {

                        vec3 cell = (vWorldPosition + vWorldNormal * 0.5 - uDynamicOrigin) / uDynamicSize;

                        if (all(greaterThanEqual(cell, vec3(0.0))) && all(lessThanEqual(cell, vec3(1.0)))) {

                            vec3 dynamicLight = texture(uDynamicLight, cell.xzy).rgb * faceShade;
                            modelLocal = max(modelLocal, surfaceDecodeLight(dynamicLight));

                        }

                    }

                #endif

                // Standardowa emisja Lamberta już jest w outgoingLight.
                // Wyjmujemy ją przed nocą/kompozycją i dokładamy raz,
                // niezależnie od albedo, AO i dostępu do nieba.
                vec3 modelNatural = outgoingLight - totalEmissiveRadiance;
                if (modelBaselineLambert > 0.5) {
                    outgoingLight = modelNatural + surfaceEmissionRadiance(totalEmissiveRadiance);
                } else {
                outgoingLight = surfaceRadiance(modelTexel, modelNatural, modelLocal, uModelBounce,
                    vec3(uModelGlow * uAtmosphericLight), uNightDesaturation, uNightTint, uAtmosphericLight);
                outgoingLight += surfaceEmissionRadiance(totalEmissiveRadiance);

                // Kula ognia meteorytu (rendering/meteorLight.js).

                outgoingLight += surfaceLocalRadiance(modelTexel, meteorLight(vWorldPosition, vWorldNormal) + campfireLight(vWorldPosition, vWorldNormal));

                // Świecący blok w ręce (lampa) jest jasny sam z siebie.

                if (uAtmosphericLight < 0.5) {
                    vec3 ownGlow = surfaceEmissionRadiance(modelTexel * uModelGlow);
                    outgoingLight = max(outgoingLight, ownGlow);
                }

                outgoingLight = applyBrightness(outgoingLight, modelTexel);
                }

                #include <opaque_fragment>`
            )
            .replace(
                '#include <fog_fragment>',
                `#ifdef USE_FOG
                    if (modelBaselineLambert > 0.5) {
                        #include <fog_fragment>
                    } else {
                    if (uFarEnabled > 0.5) {

                        float haze = farHaze(vSkyDirection);
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(FOG_SKY, 1.0)).rgb, haze);

                    }
                    else {

                        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
                        if (fogFactor > 0.0) {
                            gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(FOG_SKY, 1.0)).rgb, fogFactor);
                        }

                    }
                    }
                #endif`
            );


        if (dynamic) {
            Object.assign(shader.uniforms, dynamicLightUniforms);
        }

        installLightingDiagnostics(shader, { albedo: 'modelTexel', normal: 'vWorldNormal',
            sky: 'modelSky', visibility: 'modelSun', preview: previewRenderers.has(renderer) });

    };


    return material;

}
