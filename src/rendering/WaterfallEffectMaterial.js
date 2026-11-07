import * as THREE from 'three';
import { plantWindUniforms } from './PlantWind.js';
import { viewUniforms, VIEW_GLSL } from './viewUniforms.js';
import { skyUniforms } from '../sky/skyShader.js';
import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { waterEffectLightUniforms, WATER_EFFECT_DYNAMIC_LIGHT_GLSL } from './WaterEffectDynamicLight.js';
import { installLightingDiagnostics } from './LightingDiagnostics.js';
import { shadowUniforms, SHADOW_GLSL, shadowLightsChunk } from './Shadows.js';

// Foam and mist are lit surfaces, never additive/emissive particles. Keep the
// same shadow, RGB light and night-colour contract as the receiving water.
export function createWaterfallEffectMaterial({ name, key, color, uniforms,
    vertexDeclarations = '', vertexTransform = '', fragmentDeclarations = '',
    fragmentColor = '', surface = false }) {
    const material = new THREE.MeshLambertMaterial({ color, transparent: true,
        depthWrite: false, side: THREE.FrontSide, polygonOffset: surface,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    material.name = name;
    material.uniforms = { uEffectAmount: { value: 1 }, ...uniforms };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, material.uniforms, plantWindUniforms, viewUniforms, skyUniforms, shadowUniforms, waterEffectLightUniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                attribute vec4 effectLight;
                attribute float effectShade;
                varying vec3 vEffectWorld;
                varying vec3 vEffectNormal;
                varying vec4 vEffectLight;
                varying float vEffectShade;
                ${vertexDeclarations}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                ${vertexTransform}
                vEffectWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vEffectNormal = normalize(mat3(modelMatrix) * objectNormal);
                vEffectLight = effectLight;
                vEffectShade = effectShade;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform float uEffectAmount;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                varying vec3 vEffectWorld;
                varying vec3 vEffectNormal;
                varying vec4 vEffectLight;
                varying float vEffectShade;
                ${VIEW_GLSL}
                ${SURFACE_LIGHTING_GLSL}
                ${WATER_EFFECT_DYNAMIC_LIGHT_GLSL}
                ${SHADOW_GLSL}
                #ifndef USE_SUN_SHADOWS
                    uniform int uSunShadowLight;
                #endif
                ${fragmentDeclarations}`)
            .replace('#include <map_fragment>', `
                if (uUnderwater > 0.5 || uEffectAmount <= 0.0) discard;
                ${fragmentColor}
                diffuseColor.a *= uEffectAmount;
                if (diffuseColor.a < 0.003) discard;
                float effectSky = mix(vEffectShade, vEffectLight.a, uAtmosphericLight);
                float effectSun = effectSky;
                float effectAmbient = effectSky;
                #ifdef USE_SUN_SHADOWS
                    effectSun = sunShadowLight(vEffectWorld, normalize(vEffectNormal), effectSky);
                    effectAmbient = pow(max(0.0, effectSky), 1.0 + uSunShadowAmbient / 2.2);
                #endif`)
            .replace('#include <lights_fragment_begin>', shadowLightsChunk('effectSun', 'effectSky', 'effectAmbient'))
            .replace('#include <opaque_fragment>', `
                outgoingLight = surfaceRadiance(diffuseColor.rgb, outgoingLight,
                    waterEffectLocalLight(vEffectLight.rgb, vEffectWorld, normalize(vEffectNormal), 1.0), vec3(0.0), vec3(0.0),
                    uNightDesaturation, uNightTint, uAtmosphericLight);
                outgoingLight += waterEffectAnalyticRadiance(diffuseColor.rgb, vEffectWorld, normalize(vEffectNormal));
                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);
                #include <opaque_fragment>`);
        installLightingDiagnostics(shader, { sky: 'vEffectLight.a', normal: 'normalize(vEffectNormal)', visibility: 'effectSun' });
    };
    material.customProgramCacheKey = () => key;
    return material;
}

export function effectAmount(value) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function advanceEffectTime(uniform, dt) {
    if (Number.isFinite(dt) && dt > 0) uniform.value += dt;
}

export function setEffectTime(uniform, seconds) {
    uniform.value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
}
