import { WATER_WAVE_HEIGHT } from '../config.js';

// The colour pass and every shadow caster use the same deformation. Shadow
// passes own their time sample so a multi-frame map never mixes wind poses.
export const plantWindUniforms = {
    uTime: { value: 0 },
    uWaveHeight: { value: WATER_WAVE_HEIGHT },
    // Fale sztormowe na morzu (WaterWave.js - seaSwell): x wysokość
    // (bloki), yz kierunek wiatru, w zasięg od kamery. Ustawia Game.
    // (Zwykła tablica - ten plik nie zależy od three.js.)
    uSeaWave: { value: [0, 1, 0, 64] },
    // Kołysanie roślin na wietrze: 1 - wł., 0 - wył. (Ustawienia -> Modele).
    // Liście na wodzie dalej falują razem z wodą.
    uPlantSway: { value: 1 },
    // Kołysanie drzew (1.40.0, blocks/treeSway.js): xy - kierunek wiatru
    // (x, z świata), z - siła 0-1 (0 - wyłączone), w - wolne. Ustawia Game.
    uTreeWind: { value: [1, 0, 0.12, 0] }
};

// Wygięcie drzewa: wierzchołek pnia albo liści niesie w plantMotion.x
// wysokość nad ziemią × pierwiastek z giętkości gatunku (bajt, ćwierć
// bloku na krok). Przy ziemi zero, wyżej rośnie z kwadratem. Faza zależy
// tylko od miejsca w świecie (wolno zmienna), więc całe drzewo idzie razem.
// Stałe: blocks/treeSway.js (SWAY_STEPS, SWAY_BEND, SWAY_MAX).
export const TREE_SWAY_GLSL = /* glsl */ `
    uniform vec4 uTreeWind;
    vec3 treeSwayOffset(vec3 worldPosition, float code, float time) {
        if (code <= 0.0 || uTreeWind.z <= 0.0) return vec3(0.0);
        float height = code * 63.75;
        float bend = min(0.45, height * height * 0.0016) * uTreeWind.z;
        float phase = worldPosition.x * 0.06 + worldPosition.z * 0.045;
        // Wiatr przygina drzewo i puszcza: stałe wychylenie plus powolne podmuchy.
        float gust = 0.5 + 0.34 * sin(time * 0.8 + phase) + 0.16 * sin(time * 1.9 + phase * 1.7);
        float side = 0.22 * sin(time * 1.1 + phase * 1.3);
        vec2 push = (uTreeWind.xy * gust + vec2(-uTreeWind.y, uTreeWind.x) * side) * bend;
        return vec3(push.x, 0.0, push.y);
    }
`;

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
