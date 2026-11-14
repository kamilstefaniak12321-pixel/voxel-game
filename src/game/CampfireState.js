import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { PLANT_PACKS } from '../blocks/plantPacks.js';
import { BARK_TINDER, barkType } from '../items/bark.js';

// Gameplay state is independent of meshes, distance, FPS and wall-clock time.
//
// Od 0.100.0 polana spalają się PO KOLEI, od wierzchu stosu: ognisko
// przygasa sześcioma etapami (tyle, ile zostało polan), a do płonącego
// można dokładać opał. Pełny stos pali się tyle samo co dotąd.
export const CAMPFIRE_CAPACITY = 6;
export const CAMPFIRE_BURN_SECONDS = 8 * 60;
// Jedno polano.
export const CAMPFIRE_LOG_SECONDS = CAMPFIRE_BURN_SECONDS / CAMPFIRE_CAPACITY;
// Tyle sekund po rozpaleniu płomień rośnie do pełnej wielkości.
const CAMPFIRE_FLARE_SECONDS = 5;
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
// Podpałka: czym da się rozpalić ognisko i ile razy szybciej niż trawą
// (1 - 5 sekund trzymania startera, 2 - dwa i pół). Plony roślin dopisują
// się same polem "podpalka" w roslina.json (huba, porost iglasty).
export const TINDERS = {
    short_grass: 1, tall_grass: 1, dune_grass: 1, reed: 1, straw: 1.25,
    // Kora każdego drzewa (items/bark.js): brzozowa i żywiczne palą się lepiej.
    ...Object.fromEntries(Object.keys(FIRE_WOODS).map(wood => [barkType(wood), BARK_TINDER[wood] ?? 1])),
    ...Object.fromEntries(PLANT_PACKS.filter(pack => pack.item?.tinder).map(pack => [pack.item.type, pack.item.tinder]))
};
export const isTinder = type => Object.hasOwn(TINDERS, type);
const clamp = (value, max = 1) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

export function newCampfire(x, y, z) {
    // lit - ile sekund temu ognisko się rozpaliło (płomień rośnie chwilę).
    return { x, y, z, logs: [], tinder: null, phase: 'unlit', ignition: 0,
        collapse: 0, embers: 0, ash: false, lit: 0 };
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
    // (Płonące ognisko może mieć mniej niż 6 polan - reszta już się spaliła.)
    if (['burning', 'collapsing'].includes(value.phase) && fire.logs.length >= 1) fire.phase = value.phase;
    if (fire.phase !== 'collapsing') fire.collapse = 0;
    fire.lit = fire.phase === 'unlit' ? 0 : clamp(value.lit ?? CAMPFIRE_FLARE_SECONDS, CAMPFIRE_FLARE_SECONDS);
    return fire;
}

// Polano na stos: przed rozpaleniem i do płonącego ogniska (nie wtedy,
// gdy ostatnie polana już opadają w żar).
export function addFirewood(fire, wood) {
    if (!Object.hasOwn(FIRE_WOODS, wood) || !['unlit', 'burning'].includes(fire.phase) || fire.logs.length >= 6) return false;
    fire.logs.push({ wood, burn: 0 });
    return true;
}

// Ile sekund ognisko będzie jeszcze płonąć (0 - nie płonie).
export function burnSecondsLeft(fire) {
    if (fire.phase !== 'burning') return 0;
    return fire.logs.reduce((sum, log) => sum + (1 - log.burn) * CAMPFIRE_LOG_SECONDS, 0);
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
        fire.ignition = ready && holdingStarter ? Math.min(1, fire.ignition + dt * (TINDERS[fire.tinder] ?? 1) / CAMPFIRE_IGNITE_SECONDS)
            : Math.max(0, fire.ignition - dt * .7);
        if (fire.ignition >= 1) {
            fire.phase = 'burning'; fire.tinder = null; fire.lit = 0;
        }
        return;
    }
    if (fire.phase === 'burning') {
        fire.lit = Math.min(CAMPFIRE_FLARE_SECONDS, fire.lit + dt);
        // Pali się polano z wierzchu stosu; gdy się wypali, znika, a ogień
        // przechodzi na następne. Ostatnie zostaje, żeby opaść w żar.
        let left = dt;
        while (left > 0) {
            const log = fire.logs.at(-1);
            const need = (1 - log.burn) * CAMPFIRE_LOG_SECONDS;
            if (left < need) { log.burn += left / CAMPFIRE_LOG_SECONDS; break; }
            left -= need;
            if (fire.logs.length === 1) {
                log.burn = 1; fire.phase = 'collapsing'; fire.collapse = 0;
                updateCampfire(fire, left);
                return;
            }
            fire.logs.pop(); fire.ash = true;
        }
        // Pod płonącym stosem żarzy się to, co już się spaliło.
        if (fire.ash) fire.embers = CAMPFIRE_EMBER_SECONDS;
        return;
    }
    if (fire.phase === 'collapsing') {
        const remaining = (1 - fire.collapse) * CAMPFIRE_COLLAPSE_SECONDS;
        fire.collapse = Math.min(1, fire.collapse + dt / CAMPFIRE_COLLAPSE_SECONDS);
        if (fire.collapse >= 1) {
            fire.phase = 'unlit'; fire.logs = []; fire.ignition = 0; fire.collapse = 0; fire.ash = true; fire.lit = 0;
            fire.embers = Math.max(0, CAMPFIRE_EMBER_SECONDS - Math.max(0, dt - remaining));
        }
    }
}

// Etap ogniska: ile polan jeszcze zostało (6 - pełny ogień, 1 - ostatnie
// polano, 0 - nie płonie).
export function fireStage(fire) {
    return fire.phase === 'burning' ? fire.logs.length : 0;
}

// Wielkość płomienia i światła, 0-1: zależy od tego, ile opału zostało
// (pełny stos - 1, ostatnie polano - ok. 0,4), tuż po rozpaleniu rośnie,
// a pod sam koniec ostatniego polana przygasa.
export function fireIntensity(fire) {
    if (fire.phase === 'burning') {
        const last = fire.logs.at(-1).burn;
        const fuel = (fire.logs.length - last) / CAMPFIRE_CAPACITY;
        const flare = Math.min(1, .32 + .68 * fire.lit / CAMPFIRE_FLARE_SECONDS);
        const dying = fire.logs.length === 1 ? 1 - .65 * Math.max(0, (last - .88) / .12) : 1;
        return flare * (.3 + .7 * fuel) * dying;
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
