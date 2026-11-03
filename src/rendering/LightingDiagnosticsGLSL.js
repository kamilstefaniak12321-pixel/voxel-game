// Czysty fragment GLSL: wspólny kontrakt może być czytany również
// przez narzędzia CPU, bez importowania Three ani tworzenia uniformów.
export const LIGHTING_DIAGNOSTICS_GLSL = `
    uniform float uLightingNatural;
    uniform int uLightingDebug;
    uniform vec4 uLightingComponents;
    uniform vec2 uLightingLocal;
    uniform vec2 uLightingMaterial;
    uniform float uSurfaceMaterials;
    uniform float uLeafTransmission;
    uniform float uMaterialSpecular;
    vec3 diagnosticSun = vec3(0.0), diagnosticMoon = vec3(0.0), diagnosticSky = vec3(0.0);
    vec3 diagnosticBounce = vec3(0.0), diagnosticLocal = vec3(0.0), diagnosticEmission = vec3(0.0);
    vec3 diagnosticBeforeDirect = vec3(0.0);
    vec3 diagnosticTransmission = vec3(0.0), diagnosticSpecular = vec3(0.0);
    vec3 surfaceLocalRadiance(vec3 albedo, vec3 radiance) {
        vec3 result = albedo * radiance * uLightingLocal.x;
        diagnosticLocal += result;
        return result;
    }
    vec3 surfaceEmissionRadiance(vec3 radiance) {
        vec3 result = radiance * uLightingLocal.y;
        diagnosticEmission += result;
        return result;
    }
    vec3 lightingDiagnostic(vec3 albedo, vec3 normal, float visibility, float access, float ao) {
        if (uLightingDebug == 1) return albedo;
        if (uLightingDebug == 2) return normalize(normal) * 0.5 + 0.5;
        if (uLightingDebug == 3) return vec3(visibility);
        if (uLightingDebug == 4) return vec3(access);
        if (uLightingDebug == 5) return vec3(ao);
        if (uLightingDebug == 6) return diagnosticSun;
        if (uLightingDebug == 7) return diagnosticMoon;
        if (uLightingDebug == 8) return diagnosticSky;
        if (uLightingDebug == 9) return diagnosticBounce;
        if (uLightingDebug == 10) return diagnosticLocal;
        if (uLightingDebug == 11) return diagnosticEmission;
        if (uLightingDebug == 13) return diagnosticTransmission;
        if (uLightingDebug == 14) return diagnosticSpecular;
        return vec3(0.0);
    }
`;
