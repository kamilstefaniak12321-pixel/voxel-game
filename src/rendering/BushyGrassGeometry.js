import { createPixelPlant } from './PixelPlantBuilder.js';
import { plantRandom } from './RiverPlantGeometry.js';

const linear = hex => [16, 8, 0].map(shift => {
    const c = ((hex >> shift) & 255) / 255;
    return Math.round((c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * 255);
});
const PALETTE = {
    green: linear(0x88ad46), light: linear(0xa3bc59), dark: linear(0x668d3d),
    dry: linear(0xa28c51), root: linear(0x7c713f), seed: linear(0xc1a76c)
};
const cache = new Map();

// Several offset fans make a tuft with volume instead of one central cross.
// Each distant model keeps a subset of the same blades, colour and seed heads.
export function getBushyGrassFaces(tall, variant, detail = 0) {
    variant &= 7;
    detail = Math.max(0, Math.min(2, detail | 0));
    const key = `${!!tall}:${variant}:${detail}`;
    if (cache.has(key)) return cache.get(key);
    const model = createPixelPlant(PALETTE, false, 0, tall ? 1 : .75);
    const fans = [[2, -2], [0, 2], [2, 2], [0, -2]];
    for (let fan = 0; fan < (detail === 0 ? 4 : 2); fan++) {
        const [axis, plane] = fans[fan];
        const rand = salt => plantRandom(variant, fan, tall ? 1 : 0, 401 + salt);
        model.sheet(axis, plane, ({leaf, rect}) => {
            const centerHeight = (tall ? 10 : 7) + Math.floor(rand(1) * 3);
            leaf(-1, 0, fan & 1 ? 1 : -1, centerHeight, 'green');
            leaf(-2, 0, -3, (tall ? 7 : 5) + Math.floor(rand(2) * 3), 'dark');
            if (detail < 2) leaf(1, 0, 3, (tall ? 8 : 5) + Math.floor(rand(3) * 3), 'light');
            // A restrained straw-coloured base, one model pixel high.
            rect(-2, 0, detail < 2 ? 5 : 3, 1, 'root');
            if (tall && variant % 3 === 0 && fan < 2) {
                const top = 14 + (variant & 1);
                rect(1, 0, 1, top, 'dry');
                rect(0, top - 3, 3, 2, 'seed');
            }
        });
    }
    const faces = model.finish();
    cache.set(key, faces);
    return faces;
}
