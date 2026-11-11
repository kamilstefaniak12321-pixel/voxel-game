import { LIGHT_CURVE, CHUNK_HEIGHT } from '../config.js';

// A voxel of foliage represents many thin leaves and gaps. Filter the diffuse
// sky once per occupied layer; clear air below it does not consume more light.
// This is transport from the sky, not emission: night/disabled sky still gives 0.
export const CANOPY_FIRST_TRANSMISSION = 0.72;
export const CANOPY_LAYER_TRANSMISSION = 0.90;
export function canopyTransmission(layers) {
    return layers <= 0 ? 1 : CANOPY_FIRST_TRANSMISSION * CANOPY_LAYER_TRANSMISSION ** (layers - 1);
}
export const CANOPY_SKY_LEVELS = Uint8Array.from({ length: CHUNK_HEIGHT + 1 }, (_, layers) =>
    Math.round(15 * canopyTransmission(layers) ** (1 / (LIGHT_CURVE * 2.2))));

// Normalized linear leaf reflectance controls a restrained color filter. Do not
// multiply this hue repeatedly through a thick crown: its density controls energy.
export function canopyTint(color, strength = 0.32) {
    const max = Math.max(...color, 0.0001);
    return color.map(value => 1 - strength + strength * Math.max(0, value) / max);
}
