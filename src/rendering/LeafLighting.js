// Extra directional responses, added after source visibility has been applied.
// All vectors use view space. No light source means exactly zero contribution.
// Profiles contain raw byte values; only this helper normalizes thinness.
export const LEAF_LIGHTING_GLSL = /* glsl */ `
    vec3 thinLeafTransmission(vec3 albedo, vec3 normalView, vec3 viewDirection,
        vec3 lightDirection, vec3 visibleLightColor, vec2 profile) {
        if (abs(profile.x - 1.0) > 0.25 || profile.y <= 0.0) return vec3(0.0);
        float thinness = clamp(profile.y / 255.0, 0.0, 1.0);
        float backlit = max(dot(-viewDirection, lightDirection), 0.0);
        backlit *= backlit;
        // A two-sided isotropic thin-leaf approximation. Some existing tufts
        // have deliberately upward-bent diffuse normals on both sides, so
        // using NdotL here would introduce a jump when the visible side flips.
        vec3 leafColor = max(albedo, vec3(0.0)) * vec3(1.06, 1.0, 0.82);
        return leafColor * visibleLightColor * (0.22 * thinness * backlit);
    }

    vec3 fruitSpecular(vec3 albedo, vec3 normalView, vec3 viewDirection,
        vec3 lightDirection, vec3 visibleLightColor, vec2 profile) {
        if (abs(profile.x - 5.0) > 0.25) return vec3(0.0);
        vec3 halfVector = lightDirection + viewDirection;
        float lengthSquared = dot(halfVector, halfVector);
        if (lengthSquared < 0.00001) return vec3(0.0);
        halfVector *= inversesqrt(lengthSquared);
        float nh = max(dot(normalView, halfVector), 0.0);
        float nl = max(dot(normalView, lightDirection), 0.0);
        // Broad, low-energy dielectric highlight. No albedo recolouring,
        // normal maps or extra texture fetches; keep the voxel face readable.
        float lobe = nh * nh; lobe *= lobe; lobe *= lobe; lobe *= lobe;
        return visibleLightColor * (0.035 * nl * lobe);
    }
`;

export function installSurfaceProfiles(shader) {
    const declarations = `#ifndef POTATO\n#define USE_SURFACE_PROFILES\nvarying vec2 vSurfaceProfile;\n#endif`;
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${declarations}\n#ifndef POTATO\nattribute vec2 surfaceProfile;\n#endif`)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifndef POTATO\nvSurfaceProfile = surfaceProfile;\n#endif');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
        `#include <common>\n${declarations}\n#ifndef POTATO\n${LEAF_LIGHTING_GLSL}\n#endif`);
}
