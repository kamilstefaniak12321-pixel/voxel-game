import { lightToBrightness, COLOR_LEVEL } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';

// Shared by airborne droplets and the bounded surface discovery. Sampling
// each receiving patch prevents an impact in sunlight lighting a dark bank.
export function waterfallLightingAt(world, x, y, z) {
    const light = world.getLight?.(x, y, z);
    if (!light) return { sky: 1, local: [0, 0, 0], emission: 0, classicShade: 1 };
    const strongest = Math.max(light.red, light.green, light.blue);
    const sky = lightToBrightness(light.sky) ** 2.2;
    const lamp = strongest > 0 ? (lightToBrightness(COLOR_LEVEL[strongest]) ** 2.2) * .75 : 0;
    const atmospheric = strongest > 0 ? atmosphericLightToBrightness(COLOR_LEVEL[strongest]) : 0;
    return { sky: atmosphericLightToBrightness(light.sky) ** 2.2,
        local: strongest > 0 ? [light.red, light.green, light.blue].map(channel => (atmospheric * channel / strongest) ** 2.2) : [0, 0, 0],
        emission: 0, classicShade: Math.max(sky, lamp) };
}
