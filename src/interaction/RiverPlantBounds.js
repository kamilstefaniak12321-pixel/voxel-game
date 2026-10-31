import { WATER_WAVE_HEIGHT } from '../config.js';
import { getRiverPlantFaces, riverPlantTransform } from '../rendering/RiverPlantGeometry.js';

// Ograniczony cache celu i ramki. Bierzemy rzeczywisty model i jego
// transformację, więc pałka jest trafiana także ponad komórką korzeni,
// a niski liść nie zajmuje dla celownika całej kolumny wody.
const cache = new Map();

export function riverPlantBounds(river, x, y, z) {
    // Dywan (barwinek): płaski kobierzec na całą komórkę (łączy się
    // z sąsiadami, więc model zależy od nich - celownik bierze komórkę).
    if (river.tuft?.carpet || river.tuft?.coating || river.tuft?.bracket) {
        return { min: [0, 0, 0], max: [1, river.tuft.height / 16 + 0.005, 1] };
    }
    const key = `${river.kind}:${river.waterlogged}:${x},${y},${z}`;
    if (cache.has(key)) return cache.get(key);
    const transform = riverPlantTransform(x, y, z);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const face of getRiverPlantFaces(river.kind, transform.variant, river.waterlogged, river.tuft)) {
        for (const vertex of face.vertices) {
            const point = [
                transform.x + transform.cos * vertex[0] - transform.sin * vertex[2],
                vertex[1],
                transform.z + transform.sin * vertex[0] + transform.cos * vertex[2]
            ];
            for (let axis = 0; axis < 3; axis++) {
                min[axis] = Math.min(min[axis], point[axis]);
                max[axis] = Math.max(max[axis], point[axis]);
            }
        }
    }
    const floating = river.kind === 'lily' || river.kind === 'duckweed';
    const sway = floating ? 0.01 : river.kind === 'milfoil' ? 0.02 : 0.1;
    for (const axis of [0, 2]) { min[axis] -= sway; max[axis] += sway; }
    // /woda fale accepts 0..3. Cover the full supported wave envelope so
    // cached bounds remain valid when the player changes wave height.
    const waveMargin = floating ? 3 * WATER_WAVE_HEIGHT : 0;
    min[1] -= waveMargin;
    max[1] += floating ? waveMargin : 0.005;
    const bounds = { min, max };
    if (cache.size >= 128) cache.delete(cache.keys().next().value);
    cache.set(key, bounds);
    return bounds;
}
