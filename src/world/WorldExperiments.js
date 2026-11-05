// Runtime world options come from global Settings (they are not saved in worlds).
// Missing or malformed values keep the ordinary grass appearance.
export function normalizeWorldExperiments(value) {
    return { bushyGrass: value?.bushyGrass === true };
}

// Hysteresis prevents repeated remeshing while walking along a detail boundary.
export function grassDetailAtDistance(distance, previous = -1) {
    if (previous === 0 && distance <= 56) return 0;
    if (previous === 1 && distance >= 40 && distance <= 104) return 1;
    if (previous === 2 && distance >= 88) return 2;
    return distance < 48 ? 0 : distance < 96 ? 1 : 2;
}
