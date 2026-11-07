import { WATER_SURFACE } from '../config.js';
import { getWaterBaseHeight, getWaterLevel, isOpaqueId } from '../blocks/BlockRegistry.js';

// All four cells use the same world corner, including at chunk boundaries.
// Dry cells do not pull an isolated source below its plants. A falling column
// or water touching a ceiling fills the corner; sources otherwise stay level.
// Heights are scalars so the padded mesher can share this rule without world
// lookups, temporary arrays or per-vertex callbacks.
export function getWaterCornerHeight(a, b, c, d) {
    if (a === 1 || b === 1 || c === 1 || d === 1) return 1;
    if (a === WATER_SURFACE || b === WATER_SURFACE || c === WATER_SURFACE || d === WATER_SURFACE) {
        return WATER_SURFACE;
    }
    const count = (a > 0) + (b > 0) + (c > 0) + (d > 0);
    return count ? (a + b + c + d) / count : 0;
}

function cellHeight(world, x, y, z, id = world.getBlockId(x, y, z)) {
    const height = getWaterBaseHeight(id);
    if (!height || height === 1) return height;
    const above = world.getBlockId(x, y + 1, z);
    return getWaterLevel(above) >= 0 || isOpaqueId(above) ? 1 : height;
}

// The top quad always uses the (1,0)--(0,1) diagonal. Match its two planes,
// rather than a bilinear surface which would disagree with ray intersections.
export function interpolateWaterHeight(h00, h10, h01, h11, fx, fz) {
    return fx + fz <= 1
        ? h00 + (h10 - h00) * fx + (h01 - h00) * fz
        : h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

/** Local height [0,1], without visual waves; 0 if the central cell is dry.
 * x/y/z are integer cell coordinates, fx/fz are local coordinates in [0,1].
 * Nine cells (at most eighteen block reads), no allocations or chunk loads.
 */
export function waterSurfaceHeight(world, x, y, z, fx = 0.5, fz = 0.5) {
    const id = world.getBlockId(x, y, z);
    if (getWaterLevel(id) < 0) return 0;
    const center = cellHeight(world, x, y, z, id);
    if (center === 1) return 1;
    const west = cellHeight(world, x - 1, y, z);
    const east = cellHeight(world, x + 1, y, z);
    const north = cellHeight(world, x, y, z - 1);
    const south = cellHeight(world, x, y, z + 1);
    const nw = cellHeight(world, x - 1, y, z - 1);
    const ne = cellHeight(world, x + 1, y, z - 1);
    const sw = cellHeight(world, x - 1, y, z + 1);
    const se = cellHeight(world, x + 1, y, z + 1);
    return interpolateWaterHeight(
        getWaterCornerHeight(nw, north, west, center),
        getWaterCornerHeight(north, ne, center, east),
        getWaterCornerHeight(west, center, sw, south),
        getWaterCornerHeight(center, east, south, se), fx, fz);
}
