import { LIGHTING_DIAGNOSTICS_GLSL } from './LightingDiagnosticsGLSL.js';

// Wspólny kontrakt powierzchni: kolory atlasu i albedo są liniowe.
// natural zawiera już odpowiedź Lamberta (albedo, NdotL i 1/PI) z Three.
// local/bounce/emission są liniowymi mnożnikami albedo, w dotychczasowej
// względnej skali pól voxelowych. To nie jednostki SI ani pełny model PBR.
// Statyczne i dynamiczne pole lamp mogą opisywać to samo źródło: najpierw
// łączymy je maksimum kanałów, dopiero potem dodajemy do światła naturalnego.
export const SURFACE_LIGHTING_GLSL = `
    ${LIGHTING_DIAGNOSTICS_GLSL}
    uniform float uAtmosphericLight;

    float surfaceDecodeLight(float encoded) {
        return pow(max(encoded, 0.0), 2.2);
    }

    vec3 surfaceDecodeLight(vec3 encoded) {
        return pow(max(encoded, vec3(0.0)), vec3(2.2));
    }

    float surfaceFaceShade(vec3 normal) {
        vec3 n = abs(normal);
        return (n.x * 0.8 + n.z * 0.9 + n.y * (normal.y > 0.0 ? 1.0 : 0.65)) * 0.75;
    }

    vec3 surfaceNightRadiance(vec3 radiance, float amount, vec3 tint) {
        float luminance = dot(radiance, vec3(0.2126, 0.7152, 0.0722));
        return mix(radiance, luminance * tint, amount);
    }

    vec3 surfaceRadiance(vec3 albedo, vec3 naturalRadiance, vec3 localLinear,
        vec3 bounceLinear, vec3 emissionLinear, float nightAmount, vec3 nightTint,
        float atmosphere) {
        diagnosticBounce = albedo * bounceLinear * uLightingComponents.w;
        vec3 natural = surfaceNightRadiance(naturalRadiance + diagnosticBounce, nightAmount, nightTint);
        vec3 local = albedo * localLinear * uLightingLocal.x;
        vec3 emission = albedo * emissionLinear * uLightingLocal.y;
        diagnosticLocal = local;
        diagnosticEmission = emission;
        vec3 classic = max(max(natural, local), emission);
        return mix(classic, natural + local + emission, atmosphere);
    }
`;

// Referencja CPU do sprawdzania kontraktu i narzędzi diagnostycznych.
// Nie zastępuje testów prawdziwych shaderów w przeglądarce.
export function composeSurfaceRadiance({ albedo, natural, local = [0, 0, 0],
    bounce = [0, 0, 0], emission = [0, 0, 0], nightDesaturation = 0,
    nightTint = [1, 1, 1], atmosphere = true }) {
    const reflected = natural.map((v, i) => v + albedo[i] * bounce[i]);
    const luminance = reflected[0] * 0.2126 + reflected[1] * 0.7152 + reflected[2] * 0.0722;
    return reflected.map((v, i) => {
        const night = v * (1 - nightDesaturation) + luminance * nightTint[i] * nightDesaturation;
        const lamp = albedo[i] * local[i], own = albedo[i] * emission[i];
        return atmosphere ? night + lamp + own : Math.max(night, lamp, own);
    });
}
