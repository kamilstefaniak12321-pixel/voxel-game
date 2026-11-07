import { dynamicLightUniforms } from '../world/DynamicLight.js';
import { meteorLightUniforms, METEOR_LIGHT_GLSL } from './meteorLight.js';
import { campfireLightUniforms, CAMPFIRE_LIGHT_GLSL } from './CampfireLight.js';

// Share the live engine uniforms by identity. Importing this helper never
// creates a light volume, shadow target, scan, update loop or draw call.
export const waterEffectLightUniforms = {
    ...dynamicLightUniforms, ...meteorLightUniforms, ...campfireLightUniforms
};

// Insert after SURFACE_LIGHTING_GLSL. staticLinear is already decoded by
// waterfallLightingAt; worldNormal is normalized, occlusion is encoded AO
// (use 1.0 for effects without AO). WebGL1 keeps static light, as terrain does.
// Three emits GLSL 300 for WebGL2, so no separate material define is needed.
export const WATER_EFFECT_DYNAMIC_LIGHT_GLSL = /* glsl */ `
    #if __VERSION__ >= 300
        uniform highp sampler3D uDynamicLight;
        uniform vec3 uDynamicOrigin;
        uniform float uDynamicSize;
        uniform float uDynamicEnabled;
        ${METEOR_LIGHT_GLSL}
        ${CAMPFIRE_LIGHT_GLSL}
    #endif

    vec3 waterEffectLocalLight(vec3 staticLinear, vec3 worldPosition,
        vec3 worldNormal, float occlusion) {
        #if __VERSION__ >= 300
            if (uDynamicEnabled > 0.5) {
                vec3 cell = (worldPosition + worldNormal * 0.5 - uDynamicOrigin) / uDynamicSize;
                if (all(greaterThanEqual(cell, vec3(0.0))) && all(lessThanEqual(cell, vec3(1.0)))) {
                    vec3 dynamicLight = texture(uDynamicLight, cell.xzy).rgb * surfaceFaceShade(worldNormal);
                    dynamicLight *= mix(1.0, occlusion, uAtmosphericLight);
                    return max(staticLinear, surfaceDecodeLight(dynamicLight));
                }
            }
        #endif
        return staticLinear;
    }

    // Add after surfaceRadiance and before applyBrightness, matching blocks.
    // This also keeps local-light diagnostic toggles and RGB colours intact.
    vec3 waterEffectAnalyticRadiance(vec3 albedo, vec3 worldPosition, vec3 worldNormal) {
        #if __VERSION__ >= 300
            return surfaceLocalRadiance(albedo,
                meteorLight(worldPosition, worldNormal) + campfireLight(worldPosition, worldNormal));
        #else
            return vec3(0.0);
        #endif
    }
`;
