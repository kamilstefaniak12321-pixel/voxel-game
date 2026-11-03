import * as THREE from 'three';
import { lightingUniforms } from './LightingDiagnostics.js';

// Jeden stan dla Game i MenuWorld. Kolory źródeł pozostają liniowe;
// aktualizacja palety zmienia wyłącznie uniformy, bez przebudowy terenu.
export function applyMaterialLightingSettings(settings) {
    const enabled = !settings.get('potato') && settings.get('lightingMaterials') !== 'basic';
    lightingUniforms.uSurfaceMaterials.value = enabled ? 1 : 0;
    lightingUniforms.uLeafTransmission.value = settings.get('leafTransmission') ? 1 : 0;
    lightingUniforms.uMaterialSpecular.value = settings.get('materialSpecular') ? 1 : 0;
    return enabled;
}

export function createBounceLightingState() {
    return { enabled: false, sunDirection: new THREE.Vector3(), moonDirection: new THREE.Vector3(),
        sun: [0, 0, 0], moon: [0, 0, 0], sky: [0, 0, 0], ground: [0, 0, 0],
        strength: 0.18, saturation: 0.65, quality: 'standard', budgetMs: 0.6 };
}

export function updateBounceLightingState(options, settings, sky, webgl2 = true) {
    const natural = sky.lightingLook === 'natural';
    options.quality = settings.get('lightingMaterials');
    options.budgetMs = options.quality === 'high' ? 0.9 : 0.6;
    options.enabled = webgl2 && !settings.get('potato')
        && (natural ? options.quality !== 'basic' && settings.get('surfaceBounce') : settings.get('bounceLight'));
    options.strength = settings.get('bounceStrength') / 100;
    options.saturation = settings.get('bounceSaturation') / 100;
    options.enabled &&= options.strength > 0;
    options.sunDirection.copy(sky.sunLightDirection);
    options.moonDirection.copy(sky.celestial.moonDirection);
    const state = sky.state, masks = lightingUniforms.uLightingComponents.value;
    const sunlight = state.sunLightIntensity * masks.x;
    const moonlight = state.moonLightIntensity * masks.y;
    const sun = state.sunLightColor, moon = state.moonLightColor;
    options.sun[0] = sun.r * sunlight; options.sun[1] = sun.g * sunlight; options.sun[2] = sun.b * sunlight;
    options.moon[0] = moon.r * moonlight; options.moon[1] = moon.g * moonlight; options.moon[2] = moon.b * moonlight;
    const atmosphere = sky.atmosphere;
    for (let i = 0; i < 3; i++) {
        // Starsza paleta bez atmosfery ma izotropowe otoczenie.
        const ambient = (i === 0 ? state.ambientColor.r : i === 1 ? state.ambientColor.g : state.ambientColor.b)
            * state.ambientIntensity;
        options.sky[i] = (atmosphere ? atmosphere.sky[i] : ambient) * masks.z;
        options.ground[i] = (atmosphere ? atmosphere.ground[i] : ambient) * masks.z;
    }
    return options;
}
