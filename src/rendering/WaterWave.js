// Shared deformation for water and decals touching its surface. The same
// corner weights and diagonal keep an overlay attached even to shallow flow.
export const WATER_WAVE_GLSL = /* glsl */ `
    float waterWave(vec2 xz, float time) {
        return sin(xz.x * 0.9 + time * 1.3) * 0.5
            + sin(xz.y * 1.3 - time * 1.05) * 0.35
            + sin((xz.x + xz.y) * 0.45 + time * 0.7) * 0.15;
    }
`;
