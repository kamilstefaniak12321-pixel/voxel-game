import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';

// Gameplay state is independent of meshes, distance, FPS and wall-clock time.
export const CAMPFIRE_CAPACITY = 6;
export const CAMPFIRE_BURN_SECONDS = 8 * 60;
export const CAMPFIRE_IGNITE_SECONDS = 5;
export const CAMPFIRE_COLLAPSE_SECONDS = 2.4;
export const CAMPFIRE_EMBER_SECONDS = 90;
export const FIRE_WOODS = {
    oak: ['dąb', 'dab'], birch: ['brzoza', 'brzoza'], spruce: ['świerk', 'swierk'],
    pine: ['sosna', 'sosna'], beech: ['buk', 'buk'], linden: ['lipa', 'lipa'],
    olcha: ['olcha', 'olcha'], wierzba: ['wierzba', 'wierzba'], jablon: ['jabłoń', 'jablon'],
    acacia: ['akacja', 'akacja'], bald_cypress: ['cypryśnik', 'cyprysnik'], cherry: ['wiśnia', 'wisnia'],
    maple: ['klon', 'klon'], mugo: ['kosodrzewina', 'kosodrzewina'], olive: ['oliwka', 'oliwka'],
    rainbow_eucalyptus: ['eukaliptus', 'eukaliptus'], sequoia: ['sekwoja', 'sekwoja'],
    ginkgo: ['miłorząb', 'milorzab'], jacaranda: ['jakaranda', 'jakaranda']
};
export const fuelType = wood => `${wood}_firewood`;
export const fuelWood = type => Object.keys(FIRE_WOODS).find(wood => fuelType(wood) === type) ?? null;
export const isTinder = type => type === 'tall_grass' || type === 'short_grass';
const clamp = (value, max = 1) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

export function newCampfire(x, y, z) {
    return { x, y, z, logs: [], tinder: null, phase: 'unlit', ignition: 0,
        collapse: 0, embers: 0, ash: false };
}

export function restoreCampfire(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const fire = newCampfire(value.x, value.y, value.z);
    fire.logs = (Array.isArray(value.logs) ? value.logs : []).slice(0, 6)
        .filter(log => log && Object.hasOwn(FIRE_WOODS, log.wood))
        .map(log => ({ wood: log.wood, burn: clamp(log.burn) }));
    fire.tinder = isTinder(value.tinder) ? value.tinder : null;
    fire.ash = value.ash === true;
    fire.embers = clamp(value.embers, CAMPFIRE_EMBER_SECONDS);
    fire.collapse = clamp(value.collapse);
    // Holding the button is never restored as unattended ignition.
    if (['burning', 'collapsing'].includes(value.phase) && fire.logs.length === 6) fire.phase = value.phase;
    if (fire.phase !== 'collapsing') fire.collapse = 0;
    return fire;
}

export function addFirewood(fire, wood) {
    if (!Object.hasOwn(FIRE_WOODS, wood) || fire.phase !== 'unlit' || fire.logs.length >= 6) return false;
    fire.logs.push({ wood, burn: 0 });
    return true;
}

export function addTinder(fire, type) {
    if (!isTinder(type) || fire.phase !== 'unlit' || fire.logs.length !== 6 || fire.tinder) return false;
    fire.tinder = type;
    return true;
}

export function updateCampfire(fire, dt, holdingStarter = false) {
    dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    fire.embers = Math.max(0, fire.embers - dt);
    if (fire.phase === 'unlit') {
        const ready = fire.logs.length === 6 && fire.tinder;
        fire.ignition = ready && holdingStarter ? Math.min(1, fire.ignition + dt / CAMPFIRE_IGNITE_SECONDS)
            : Math.max(0, fire.ignition - dt * .7);
        if (fire.ignition >= 1) {
            fire.phase = 'burning'; fire.tinder = null;
        }
        return;
    }
    if (fire.phase === 'burning') {
        const remaining = Math.max(...fire.logs.map(log => (1 - log.burn) * CAMPFIRE_BURN_SECONDS));
        for (const log of fire.logs) log.burn = Math.min(1, log.burn + dt / CAMPFIRE_BURN_SECONDS);
        if (fire.logs.every(log => log.burn >= 1)) {
            fire.phase = 'collapsing'; fire.collapse = 0;
            updateCampfire(fire, Math.max(0, dt - remaining));
        }
        return;
    }
    if (fire.phase === 'collapsing') {
        const remaining = (1 - fire.collapse) * CAMPFIRE_COLLAPSE_SECONDS;
        fire.collapse = Math.min(1, fire.collapse + dt / CAMPFIRE_COLLAPSE_SECONDS);
        if (fire.collapse >= 1) {
            fire.phase = 'unlit'; fire.logs = []; fire.ignition = 0; fire.collapse = 0; fire.ash = true;
            fire.embers = Math.max(0, CAMPFIRE_EMBER_SECONDS - Math.max(0, dt - remaining));
        }
    }
}

export function fireIntensity(fire) {
    if (fire.phase === 'burning') {
        const burn = Math.max(...fire.logs.map(log => log.burn));
        return Math.min(1, .32 + burn * 60) * (1 - .65 * Math.max(0, (burn - .88) / .12));
    }
    if (fire.phase === 'collapsing') return .35 * (1 - fire.collapse);
    return Math.pow(fire.ignition, 2) * .32;
}

export function campfireDrops(fire) {
    if (!fire) return [];
    const counts = new Map();
    for (const log of fire.logs) if (log.burn === 0 && fire.phase === 'unlit') {
        const type = fuelType(log.wood); counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    if (fire.tinder) counts.set(fire.tinder, 1);
    return [...counts].map(([type, count]) => ({ type, count }));
}
