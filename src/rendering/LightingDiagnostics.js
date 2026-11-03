import * as THREE from 'three';
import { LIGHTING_DIAGNOSTICS_GLSL } from './LightingDiagnosticsGLSL.js';
export { LIGHTING_DIAGNOSTICS_GLSL } from './LightingDiagnosticsGLSL.js';

// Wspólny stan: zmiana widoku/źródeł nie przebudowuje chunków ani shaderów.
export const LIGHTING_VIEWS = ['full', 'albedo', 'normals', 'sunVisibility', 'skyAccess',
    'ao', 'sun', 'moon', 'sky', 'bounce', 'local', 'emission', 'grayscale'];
export const lightingUniforms = {
    uLightingNatural: { value: 0 },
    uLightingDebug: { value: 0 },
    uLightingComponents: { value: new THREE.Vector4(1, 1, 1, 1) },
    uLightingLocal: { value: new THREE.Vector2(1, 1) }
};
const previewUniforms = {
    uLightingNatural: { value: 0 }, uLightingDebug: { value: 0 },
    uLightingComponents: { value: new THREE.Vector4(1, 1, 1, 1) },
    uLightingLocal: { value: new THREE.Vector2(1, 1) }
};
export function setLightingView(name = 'full') {
    const index = LIGHTING_VIEWS.indexOf(name);
    if (index < 0) throw new RangeError(`Nieznany widok światła: ${name}`);
    lightingUniforms.uLightingDebug.value = index;
    return name;
}
export function resetLightingDiagnostics() {
    setLightingView();
    lightingUniforms.uLightingComponents.value.set(1, 1, 1, 1);
    lightingUniforms.uLightingLocal.value.set(1, 1);
}
export function setLightingComponent(name, enabled) {
    const names = ['sun', 'moon', 'sky', 'bounce', 'local', 'emission'];
    const index = names.indexOf(name);
    if (index < 0) throw new RangeError(`Nieznane źródło: ${name}`);
    (index < 4 ? lightingUniforms.uLightingComponents : lightingUniforms.uLightingLocal)
        .value.setComponent(index < 4 ? index : index - 4, enabled ? 1 : 0);
}

// Instrumentujemy istniejące obliczenie Lamberta, bez ponownego próbkowania
// map cieni. Kolejność dwóch kierunkowych świateł jest stała: Sun, Moon (Sky).
export function installLightingDiagnostics(shader, { albedo = 'diffuseColor.rgb',
    normal = 'inverseTransformDirection(normal, viewMatrix)', sky = '1.0', ao = '1.0',
    visibility = '1.0', preview = false } = {}) {
    Object.assign(shader.uniforms, preview ? previewUniforms : lightingUniforms);
    let fragment = shader.fragmentShader;
    if (!fragment.includes('uniform int uLightingDebug;')) {
        fragment = fragment.replace('#include <common>', `#include <common>\n${LIGHTING_DIAGNOSTICS_GLSL}`);
    }
    fragment = fragment.replaceAll('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);
    // Wszystkie warianty (#ifdef cieni / bez cieni) dostają identyczny kontrakt.
    fragment = fragment.replace(/getDirectionalLightInfo\( directionalLight, directLight \);([\s\S]*?)(RE_Direct\( directLight,[^;]+;)/g,
        (_, between, direct) => `getDirectionalLightInfo( directionalLight, directLight );${between}
            diagnosticBeforeDirect = reflectedLight.directDiffuse;
            directLight.color *= UNROLLED_LOOP_INDEX == 0 ? uLightingComponents.x : uLightingComponents.y;
            ${direct}
            if (UNROLLED_LOOP_INDEX == 0) diagnosticSun += reflectedLight.directDiffuse - diagnosticBeforeDirect;
            else diagnosticMoon += reflectedLight.directDiffuse - diagnosticBeforeDirect;`);
    fragment = fragment.replace('#include <lights_fragment_end>', `
        #if defined(RE_IndirectDiffuse)
            irradiance *= uLightingComponents.z;
        #endif
        #include <lights_fragment_end>
        diagnosticSky = reflectedLight.indirectDiffuse;`);
    // Nadpisanie po mgle: widok diagnostyczny pokazuje dane powierzchni,
    // a nie zmieszane z nimi niebo. Wyjście RT pozostaje liniowe.
    fragment = fragment.replace(/}\s*$/, `
        if (uLightingDebug > 0 && uLightingDebug < 12) {
            gl_FragColor.rgb = linearToOutputTexel(vec4(lightingDiagnostic(
                ${albedo}, ${normal}, ${visibility}, ${sky}, ${ao}), 1.0)).rgb;
        }
    }`);
    shader.fragmentShader = fragment;
}

// Materiał sam świecący (płomień/iskra) nie ma składników Lamberta.
// Zachowuje dotychczasowy wygląd przy masce1, lecz źródło można wyłączyć
// i zmierzyć oddzielnie. AO ani dostęp do nieba nie ograniczają emisji.
export function installEmissionDiagnostics(shader) {
    Object.assign(shader.uniforms, lightingUniforms);
    shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${LIGHTING_DIAGNOSTICS_GLSL}`)
        .replace('#include <opaque_fragment>', `
            outgoingLight = surfaceEmissionRadiance(outgoingLight);
            #include <opaque_fragment>`)
        .replace(/}\s*$/, `
            if (uLightingDebug > 0 && uLightingDebug < 12) {
                vec3 value = uLightingDebug == 1 ? diffuseColor.rgb
                    : (uLightingDebug == 11 ? diagnosticEmission : vec3(0.0));
                gl_FragColor.rgb = linearToOutputTexel(vec4(value, 1.0)).rgb;
            }
        }`);
}
