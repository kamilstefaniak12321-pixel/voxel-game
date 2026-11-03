// Pure metadata shared by geometry builders; no registry/Three dependency.
// Attribute layout: two UNNORMALIZED bytes [kind, thinness 0..255].
export const SURFACE_KIND = Object.freeze({ MATTE: 0, LEAF: 1, BRANCH: 2,
    BARK: 3, WOOD: 4, FRUIT: 5, STONE: 6, EMISSIVE: 7 });
const profile = (kind, thinness = 0) => Object.freeze([kind, thinness]);
export const SURFACE_PROFILES = Object.freeze({
    matte: profile(0), leaf: profile(1, 180), leafVoxel: profile(1, 120),
    leafBlock: profile(1, 64), branch: profile(2), bark: profile(3), wood: profile(4),
    fruit: profile(5), stone: profile(6), emissive: profile(7)
});

export function blockSurfaceProfile(definition, faceName = 'front') {
    if (definition.surfaceProfile && SURFACE_PROFILES[definition.surfaceProfile]) return SURFACE_PROFILES[definition.surfaceProfile];
    if (definition.light > 0) return SURFACE_PROFILES.emissive;
    if (definition.model === 'leaves') return SURFACE_PROFILES.leafBlock;
    if (definition.part === 'log') return faceName === 'top' || faceName === 'bottom'
        ? SURFACE_PROFILES.wood : SURFACE_PROFILES.bark;
    if (definition.part === 'log_stripped' || definition.part === 'planks' || definition.sound === 'wood') return SURFACE_PROFILES.wood;
    if (definition.sound === 'stone') return SURFACE_PROFILES.stone;
    // Mixed sprites can contain stems, petals and wood in one card. They need
    // authored masks before being treated as thin leaves; colour is not a mask.
    return SURFACE_PROFILES.matte;
}

export function pixelSurfaceProfile(role, sheet, roles = null) {
    const named = roles?.[role] ?? (/^leaf(?:Light|Dark)?$/.test(role) ? 'leaf' : role === 'stem' ? 'branch' : 'matte');
    if (named === 'leaf') return sheet ? SURFACE_PROFILES.leaf : SURFACE_PROFILES.leafVoxel;
    return SURFACE_PROFILES[named] ?? SURFACE_PROFILES.matte;
}
