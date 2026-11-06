// Visual distance is independent of the radius requiring editable voxel data.
// Beyond the overlap, FarTerrain keeps land, trees and vegetation in batches.
export const FULL_TERRAIN_DISTANCE = 192;
export const TERRAIN_TRANSITION_START = 144;
export const DISTANCE_PLANT_VIEW = 192;
export const DISTANCE_PLANT_PREFETCH = 224;
export const DISTANCE_PLANT_RETAIN = 240;

export function fullTerrainDistance(viewDistance) {
    return Math.min(viewDistance, FULL_TERRAIN_DISTANCE);
}

// Hysteresis is applied to the selected level, not elapsed time: changing
// direction at a boundary doesn't continually cancel and rebuild a chunk.
export function detailAtDistance(distance, previous, boundaries, hysteresis = 16) {
    let level = Number.isInteger(previous) ? Math.max(0, Math.min(2, previous)) :
        distance < boundaries[0] ? 0 : distance < boundaries[1] ? 1 : 2;
    while (level < 2 && distance > boundaries[level] + hysteresis) level++;
    while (level > 0 && distance < boundaries[level - 1] - hysteresis) level--;
    return level;
}
