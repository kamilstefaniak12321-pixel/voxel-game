import { WATER_WAVE_HEIGHT } from '../config.js';

// The colour pass and every shadow caster use the same deformation. Shadow
// passes own their time sample so a multi-frame map never mixes wind poses.
export const plantWindUniforms = {
    uTime: { value: 0 },
    uWaveHeight: { value: WATER_WAVE_HEIGHT },
    // Kołysanie roślin na wietrze: 1 - wł., 0 - wył. (Ustawienia -> Modele).
    // Liście na wodzie dalej falują razem z wodą.
    uPlantSway: { value: 1 }
};

export const plantShadowState = { natural: false };

export const PLANT_WIND_GLSL = /* glsl */ `
    uniform float uPlantSway;
    vec3 plantWindOffset(vec3 worldPosition, vec2 motion, float time, float waveHeight) {
        vec3 offset = vec3(0.0);
        float phase = worldPosition.x * 0.45 + worldPosition.z * 0.35;
        float gust = 0.75 + 0.25 * sin(time * 0.37 + worldPosition.x * 0.05);
        if (motion.y > 0.75) {
            float wave = sin(worldPosition.x * 0.9 + time * 1.3) * 0.5
                + sin(worldPosition.z * 1.3 - time * 1.05) * 0.35
                + sin((worldPosition.x + worldPosition.z) * 0.45 + time * 0.7) * 0.15;
            offset.y = wave * waveHeight;
        } else if (motion.y > 0.25) {
            offset.x = motion.x * sin(time * 0.65 + phase) * 0.018;
            offset.z = motion.x * cos(time * 0.5 + phase) * 0.012;
        } else {
            offset.x = motion.x * gust * (sin(time * 1.8 + phase) * 0.07
                + sin(time * 3.3 + phase * 2.1) * 0.02);
            offset.z = motion.x * gust * cos(time * 1.45 + phase * 1.3) * 0.055;
        }
        if (motion.y <= 0.75) offset *= uPlantSway;
        return offset;
    }
`;
