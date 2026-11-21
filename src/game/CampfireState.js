import { CHUNK_HEIGHT, WORLD_BORDER } from '../config.js';
import { PLANT_PACKS } from '../blocks/plantPacks.js';
import { TREE_DEFINITIONS } from '../blocks/treeCatalog.js';
import { BARK_TINDER, barkType } from '../items/bark.js';
import { woodTraits } from '../blocks/woodTraits.js';
import { wetFactor, WET_IGNITE, WET_HEAT, DRY_WET } from '../items/moisture.js';
import { restorePot, cookPot, potDrops } from './CookingState.js';

// Gameplay state is independent of meshes, distance, FPS and wall-clock time.
//
// Od 0.100.0 polana spalają się PO KOLEI, od wierzchu stosu: ognisko
// przygasa sześcioma etapami (tyle, ile zostało polan), a do płonącego
// można dokładać opał.
//
// Od 1.32.0 OGNISKO MA TEMPERATURĘ (pomysł Kamila, docs/drewno.md):
//   - każde drewno ma zapłon, żar i czas palenia (blocks/woodTraits.js),
//   - podpałka daje temperaturę na start (TINDER_TEMPS), patyki jako
//     rozpałka ją podnoszą (KINDLING_TEMP za patyk),
//   - polano z wierzchu zajmuje się, gdy ogień jest gorętszy niż jego
//     zapłon; potem temperatura dochodzi do żaru palącego się polana,
//   - od temperatury zależy ciepło przy ognisku (fireWarmth) i szybkość
//     gotowania (cookSpeed),
//   - po twardym drewnie żar trzyma długo (emberSeconds), a polano
//     dołożone na gorący żar zajmuje się samo.
//
// Od 1.33.0 polano ma WILGOTNOŚĆ (log.wet 0-1, items/moisture.js):
// mokre ma wyższy zapłon i słabszy żar (logIgnite, logHeat). W płonącym
// ognisku polana schną: to, które się pali - przez cały czas palenia,
// te pod nim - powoli od ciepła (STACK_DRY_SECONDS).
export const CAMPFIRE_CAPACITY = 6;
// Tyle sekund po rozpaleniu płomień rośnie do pełnej wielkości.
const CAMPFIRE_FLARE_SECONDS = 5;
export const CAMPFIRE_IGNITE_SECONDS = 5;
export const CAMPFIRE_COLLAPSE_SECONDS = 2.4;
// Żar po ognisku: najwyżej tyle sekund (zbiera się z wypalonych polan).
export const EMBER_MAX_SECONDS = 600;
// Żar jest gorący (EMBER_TEMP), póki zostało go na tyle sekund; potem
// stygnie do EMBER_COLD_TEMP i gaśnie.
export const EMBER_HOT_SECONDS = 120;
export const EMBER_TEMP = 500;
export const EMBER_COLD_TEMP = 250;
// Po tylu sekundach polano dołożone na gorący żar zajmuje się samo.
export const EMBER_CATCH_SECONDS = 4;
// Ciepło samego żaru tuż przy ognisku (°C).
export const EMBER_WARMTH = 5;
// Jak szybko temperatura ognia dochodzi do żaru palącego się polana
// (po tylu sekundach zostaje 37% różnicy).
export const TEMP_SECONDS = 12;
// Krok liczenia temperatury i gotowania - długi skok czasu (sen) daje
// to samo, co wiele klatek.
const BURN_STEP = 5;
// Ciepło przy ognisku: (temperatura - WARMTH_FROM) / WARMTH_DEGREES °C.
export const WARMTH_FROM = 300;
export const WARMTH_DEGREES = 25;
// Zapadające się ognisko grzeje słabiej.
export const COLLAPSE_WARMTH = 0.5;
// W płonącym ognisku w pełni mokre polano pod spodem wysycha w tyle
// sekund (polano z wierzchu schnie, paląc się).
export const STACK_DRY_SECONDS = 300;
// Rozpałka: patyki dołożone do podpałki. Każdy podnosi temperaturę.
export const KINDLING = 'stick';
export const KINDLING_MAX = 2;
export const KINDLING_TEMP = 60;
export const FIRE_WOODS = {
    oak: ['dąb', 'dab'], birch: ['brzoza', 'brzoza'], spruce: ['świerk', 'swierk'],
    pine: ['sosna', 'sosna'], beech: ['buk', 'buk'], linden: ['lipa', 'lipa'],
    olcha: ['olcha', 'olcha'], wierzba: ['wierzba', 'wierzba'], jablon: ['jabłoń', 'jablon'],
    acacia: ['akacja', 'akacja'], bald_cypress: ['cypryśnik', 'cyprysnik'], cherry: ['wiśnia', 'wisnia'],
    maple: ['klon', 'klon'], mugo: ['kosodrzewina', 'kosodrzewina'], olive: ['oliwka', 'oliwka'],
    rainbow_eucalyptus: ['eukaliptus', 'eukaliptus'], sequoia: ['sekwoja', 'sekwoja'],
    ginkgo: ['miłorząb', 'milorzab'], jacaranda: ['jakaranda', 'jakaranda'],
    // 1.8.0
    fir: ['jodła', 'jodla'], baobab: ['baobab', 'baobab'], coconut_palm: ['palma kokosowa', 'palma'],
    larch: ['modrzew', 'modrzew'], mangrove: ['namorzyn', 'namorzyn'], kapok: ['puchowiec', 'puchowiec'],
    joshua_tree: ['jukka', 'jukka'], aspen: ['osika', 'osika'], araucaria: ['araukaria', 'araukaria'],
    banyan: ['figowiec', 'figowiec'], dragon_tree: ['dracena', 'dracena'], cedar: ['cedr', 'cedr'],
    bristlecone: ['sosna oścista', 'oscista']
};
export const fuelType = wood => `${wood}_firewood`;
export const fuelWood = type => Object.keys(FIRE_WOODS).find(wood => fuelType(wood) === type) ?? null;
// Cechy polana (suche drewno).
export const logSeconds = wood => woodTraits(wood).burn;
export const woodIgnite = wood => woodTraits(wood).ignite;
export const woodHeat = wood => woodTraits(wood).heat;
// Zapłon i żar konkretnego polana - z jego wilgotnością (1.33.0).
export const logIgnite = log => woodIgnite(log.wood) + WET_IGNITE * wetFactor(log.wet ?? 0);
export const logHeat = log => woodHeat(log.wood) * (1 - WET_HEAT * wetFactor(log.wet ?? 0));
// Pełny stos jednego gatunku pali się tyle sekund.
export const stackSeconds = wood => CAMPFIRE_CAPACITY * logSeconds(wood);
// Ile sekund żaru zostawia jedno wypalone polano: miękkie drewno kilka
// sekund, twarde ponad minutę (dąb 75 s, świerk 10 s).
export const emberSeconds = wood => Math.round((logSeconds(wood) / 10) ** 2 / 3);
// Ile razy szybciej gotuje się i piecze nad ogniem o tej temperaturze
// (800° - zwykła szybkość).
export const cookSpeed = temp => Math.max(0.4, Math.min(1.25, (Number.isFinite(temp) ? temp : 0) / 800));
// Podpałka: czym da się rozpalić ognisko i ile razy szybciej niż trawą
// (1 - 5 sekund trzymania startera, 2 - dwa i pół). Plony roślin dopisują
// się same polem "podpalka" w roslina.json (huba, porost iglasty).
export const TINDERS = {
    short_grass: 1, tall_grass: 1, dune_grass: 1, reed: 1, straw: 1.25,
    // Kora każdego drzewa (items/bark.js): brzozowa i żywiczne palą się lepiej.
    ...Object.fromEntries(Object.keys(FIRE_WOODS).map(wood => [barkType(wood), BARK_TINDER[wood] ?? 1])),
    ...Object.fromEntries(PLANT_PACKS.filter(pack => pack.item?.tinder).map(pack => [pack.item.type, pack.item.tinder])),
    // Plony drzew z polem "tinder" (1.10.0): szyszki i puch puchowca.
    ...Object.fromEntries(TREE_DEFINITIONS.flatMap(tree => Object.values(tree.items))
        .filter(item => item.tinder).map(item => [item.type, item.tinder]))
};
export const isTinder = type => Object.hasOwn(TINDERS, type);
// Temperatura, jaką podpałka daje na start (°C). Trawa i słoma - 260,
// kora i reszta - 280, żywiczne (kora sosny, szyszki) - 300, kora
// brzozowa - 330.
const GRASS_TEMP = 260, TINDER_TEMP = 280, RESIN_TEMP = 300, BIRCH_TEMP = 330;
export const TINDER_TEMPS = {
    ...Object.fromEntries(Object.keys(TINDERS).map(type => [type, TINDER_TEMP])),
    ...Object.fromEntries(['short_grass', 'tall_grass', 'dune_grass', 'reed', 'straw'].map(type => [type, GRASS_TEMP])),
    ...Object.fromEntries(Object.keys(FIRE_WOODS).map(wood => [barkType(wood),
        (BARK_TINDER[wood] ?? 1) >= 1.5 ? BIRCH_TEMP : (BARK_TINDER[wood] ?? 1) > 1 ? RESIN_TEMP : TINDER_TEMP])),
    // Szyszki są żywiczne.
    ...Object.fromEntries(Object.keys(TINDERS).filter(type => type.endsWith('_cone')).map(type => [type, RESIN_TEMP]))
};
export const tinderTemp = type => TINDER_TEMPS[type] ?? 0;
// Huba tli się długo: puszczone rozpalanie stygnie tyle razy wolniej.
const TINDER_SMOLDER = { huba_huba: 3 };
const clamp = (value, max = 1) => Math.max(0, Math.min(max, Number.isFinite(value) ? value : 0));

export function newCampfire(x, y, z) {
    // lit - ile sekund temu ognisko się rozpaliło (płomień rośnie chwilę).
    // pot - garnek na ognisku (1.20.0, game/CookingState.js) albo null.
    // temp - temperatura ognia (°C), kindling - patyki rozpałki (1.32.0).
    return { x, y, z, logs: [], tinder: null, kindling: 0, phase: 'unlit', ignition: 0,
        collapse: 0, embers: 0, ash: false, lit: 0, temp: 0, pot: null };
}

export function restoreCampfire(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT ||
        value.x < -WORLD_BORDER || value.x >= WORLD_BORDER || value.z < -WORLD_BORDER || value.z >= WORLD_BORDER) return null;
    const fire = newCampfire(value.x, value.y, value.z);
    fire.logs = (Array.isArray(value.logs) ? value.logs : []).slice(0, 6)
        .filter(log => log && Object.hasOwn(FIRE_WOODS, log.wood))
        .map(log => ({ wood: log.wood, burn: clamp(log.burn), ...wetField(clamp(log.wet)) }));
    fire.tinder = isTinder(value.tinder) ? value.tinder : null;
    fire.ash = value.ash === true;
    fire.embers = clamp(value.embers, EMBER_MAX_SECONDS);
    fire.collapse = clamp(value.collapse);
    // Holding the button is never restored as unattended ignition.
    // (Płonące ognisko może mieć mniej niż 6 polan - reszta już się spaliła.)
    if (['burning', 'collapsing'].includes(value.phase) && fire.logs.length >= 1) fire.phase = value.phase;
    if (fire.phase !== 'collapsing') fire.collapse = 0;
    fire.lit = fire.phase === 'unlit' ? 0 : clamp(value.lit ?? CAMPFIRE_FLARE_SECONDS, CAMPFIRE_FLARE_SECONDS);
    fire.kindling = fire.phase === 'unlit' && Number.isInteger(value.kindling) ? Math.max(0, Math.min(KINDLING_MAX, value.kindling)) : 0;
    // Zapis sprzed 1.32.0 nie ma temperatury: ogień jest od razu gorący.
    fire.temp = fire.phase === 'unlit' ? 0 : Number.isFinite(value.temp) ? clamp(value.temp, 1400) : logHeat(fire.logs.at(-1));
    fire.pot = restorePot(value.pot);
    return fire;
}

// Polano na stos: przed rozpaleniem i do płonącego ogniska (nie wtedy,
// gdy ostatnie polana już opadają w żar).
// wet - wilgotność polana (0 - suche; 1.33.0).
export function addFirewood(fire, wood, wet = 0) {
    if (!Object.hasOwn(FIRE_WOODS, wood) || !['unlit', 'burning'].includes(fire.phase) || fire.logs.length >= 6) return false;
    fire.logs.push({ wood, burn: 0, ...wetField(clamp(wet)) });
    return true;
}

// Suche polano nie nosi pola wet (zapis wygląda jak dotąd).
function wetField(wet) {
    return wet > 0 ? { wet } : {};
}

// Zmienia wilgotność polana (schnięcie, deszcz) - w granicach 0-1.
export function setLogWet(log, wet) {
    const value = clamp(wet);
    if (value > 0) log.wet = value;
    else delete log.wet;
}

// Ile sekund ognisko będzie jeszcze płonąć (0 - nie płonie).
export function burnSecondsLeft(fire) {
    if (fire.phase !== 'burning') return 0;
    return fire.logs.reduce((sum, log) => sum + (1 - log.burn) * logSeconds(log.wood), 0);
}

export function addTinder(fire, type) {
    if (!isTinder(type) || fire.phase !== 'unlit' || fire.logs.length !== 6 || fire.tinder) return false;
    fire.tinder = type;
    return true;
}

// Patyk jako rozpałka (najwyżej KINDLING_MAX): do ułożonego stosu.
export function addKindling(fire) {
    if (fire.phase !== 'unlit' || fire.logs.length !== 6 || (fire.kindling ?? 0) >= KINDLING_MAX) return false;
    fire.kindling = (fire.kindling ?? 0) + 1;
    return true;
}

// Temperatura, od której zacznie się ogień: podpałka i rozpałka
// (0 - nie ma podpałki).
export function startTemp(fire) {
    return fire.tinder ? tinderTemp(fire.tinder) + (fire.kindling ?? 0) * KINDLING_TEMP : 0;
}

// Temperatura samego żaru (0 - żaru nie ma).
export function emberTemp(fire) {
    if (!(fire.embers > 0)) return 0;
    return EMBER_COLD_TEMP + (EMBER_TEMP - EMBER_COLD_TEMP) * Math.min(1, fire.embers / EMBER_HOT_SECONDS);
}

// Polano z wierzchu stosu - to ono zajmuje się pierwsze.
export const topLog = fire => fire.logs.at(-1) ?? null;

// Czy podpałka z rozpałką zapali polano z wierzchu.
export function canIgnite(fire) {
    return fire.phase === 'unlit' && fire.logs.length === 6 && Boolean(fire.tinder) &&
        startTemp(fire) >= logIgnite(topLog(fire));
}

// Czy polano z wierzchu zajmie się samo od żaru.
export function catchesFromEmbers(fire) {
    return fire.phase === 'unlit' && fire.logs.length >= 1 && topLog(fire).burn === 0 &&
        emberTemp(fire) >= logIgnite(topLog(fire));
}

// Temperatura ogniska teraz (°C): ogień, zapadający się stos albo żar.
export function campfireTemp(fire) {
    if (fire.phase === 'unlit') return emberTemp(fire);
    const temp = Number.isFinite(fire.temp) && fire.temp > 0 ? fire.temp : fire.logs?.length ? logHeat(topLog(fire)) : EMBER_TEMP;
    return fire.phase === 'collapsing' ? temp + (EMBER_TEMP - temp) * clamp(fire.collapse) : temp;
}

// Ile stopni ciepła daje ognisko tuż obok (game/Warmth.js): dąb ok. +25,
// brzoza +22, sosna +18, lipa +14. Żar po ognisku grzeje trochę.
export function fireWarmth(fire) {
    if (fire.phase === 'unlit') return EMBER_WARMTH * Math.min(1, Math.max(0, fire.embers ?? 0) / EMBER_HOT_SECONDS);
    const warmth = Math.max(0, (campfireTemp(fire) - WARMTH_FROM) / WARMTH_DEGREES);
    return fire.phase === 'collapsing' ? warmth * COLLAPSE_WARMTH : warmth;
}

// Ognisko i garnek na nim. Zwraca nazwę potrawy, gdy właśnie się
// ugotowała (inaczej null). Gotuje się tylko nad płonącym ogniem, tym
// szybciej, im jest gorętszy.
export function updateCampfire(fire, dt, holdingStarter = false) {
    dt = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const result = { cooked: null };
    burnCampfire(fire, dt, holdingStarter, result);
    return result.cooked;
}

function ignite(fire, temp) {
    fire.phase = 'burning'; fire.tinder = null; fire.kindling = 0; fire.lit = 0; fire.ignition = 0;
    fire.temp = temp;
}

function burnCampfire(fire, dt, holdingStarter, result) {
    if (fire.phase === 'unlit') {
        // Polano na gorącym żarze zajmuje się samo; inaczej potrzeba
        // podpałki, która da radę polanu z wierzchu, i startera.
        const embers = catchesFromEmbers(fire);
        const ready = canIgnite(fire) && holdingStarter;
        const hot = embers ? emberTemp(fire) : 0;
        if (embers) fire.ignition = Math.min(1, fire.ignition + dt / EMBER_CATCH_SECONDS);
        else if (ready) fire.ignition = Math.min(1, fire.ignition + dt * (TINDERS[fire.tinder] ?? 1) / CAMPFIRE_IGNITE_SECONDS);
        else fire.ignition = Math.max(0, fire.ignition - dt * .7 / (TINDER_SMOLDER[fire.tinder] ?? 1));
        fire.embers = Math.max(0, fire.embers - dt);
        if (fire.ignition >= 1) ignite(fire, embers ? hot : startTemp(fire));
        return;
    }
    if (fire.phase === 'burning') {
        fire.lit = Math.min(CAMPFIRE_FLARE_SECONDS, fire.lit + dt);
        if (!(fire.temp > 0)) fire.temp = logHeat(topLog(fire));
        // Pali się polano z wierzchu stosu; gdy się wypali, znika, a ogień
        // przechodzi na następne. Ostatnie zostaje, żeby opaść w żar.
        let left = dt;
        while (left > 0) {
            const log = fire.logs.at(-1), seconds = logSeconds(log.wood);
            const need = (1 - log.burn) * seconds;
            // Tyle sekund z tego wywołania pali się to polano.
            const span = Math.min(left, need);
            // Temperatura dochodzi do żaru tego polana; garnek gotuje się
            // tym szybciej, im goręcej (krokami - jak przy zwykłych klatkach).
            // Mokre polano schnie, paląc się (nadmiar wody maleje z kwadratem
            // tego, ile polana zostało), a te pod nim - powoli od ciepła.
            const excess = Math.max(0, (log.wet ?? 0) - DRY_WET);
            const wetAfter = (seconds) => (excess > 0 ? DRY_WET + excess * Math.max(0, (need - seconds) / need) ** 2 : log.wet ?? 0);
            for (let done = 0; done < span;) {
                const step = Math.min(BURN_STEP, span - done), before = fire.temp;
                // (Żar z wilgotnością w połowie kroku - długi skok czasu
                // daje wtedy to samo, co wiele klatek.)
                const target = logHeat({ wood: log.wood, wet: wetAfter(done + step / 2) });
                fire.temp = target + (before - target) * Math.exp(-step / TEMP_SECONDS);
                if (fire.pot) result.cooked = cookPot(fire.pot, step * cookSpeed((before + fire.temp) / 2)) ?? result.cooked;
                done += step;
                if (excess > 0) setLogWet(log, wetAfter(done));
                for (let i = 0; i < fire.logs.length - 1; i++) {
                    if (fire.logs[i].wet > 0) setLogWet(fire.logs[i], fire.logs[i].wet - step / STACK_DRY_SECONDS);
                }
            }
            left -= span;
            if (span < need) { log.burn += span / seconds; break; }
            // Wypalone polano zostawia żar.
            fire.embers = Math.min(EMBER_MAX_SECONDS, fire.embers + emberSeconds(log.wood));
            if (fire.logs.length === 1) {
                log.burn = 1; fire.phase = 'collapsing'; fire.collapse = 0;
                burnCampfire(fire, left, false, result);
                return;
            }
            fire.logs.pop(); fire.ash = true;
        }
        return;
    }
    if (fire.phase === 'collapsing') {
        const remaining = (1 - fire.collapse) * CAMPFIRE_COLLAPSE_SECONDS;
        fire.collapse = Math.min(1, fire.collapse + dt / CAMPFIRE_COLLAPSE_SECONDS);
        if (fire.collapse >= 1) {
            fire.phase = 'unlit'; fire.logs = []; fire.ignition = 0; fire.collapse = 0; fire.ash = true; fire.lit = 0; fire.temp = 0;
            fire.embers = Math.max(0, fire.embers - Math.max(0, dt - remaining));
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

// Jak mocno żarzą się węgle po ognisku, 0-1 (gasną przez ostatnie
// półtorej minuty).
export function emberGlow(fire) {
    return Math.min(1, Math.max(0, fire.embers ?? 0) / 90);
}

export function campfireDrops(fire) {
    if (!fire) return [];
    const counts = new Map();
    // Polana jednego gatunku wracają jednym stosem; wilgotność - średnia
    // (pole fresh to suchość stosu, items/moisture.js).
    const wetness = new Map();
    for (const log of fire.logs) if (log.burn === 0 && fire.phase === 'unlit') {
        const type = fuelType(log.wood); counts.set(type, (counts.get(type) ?? 0) + 1);
        wetness.set(type, (wetness.get(type) ?? 0) + (log.wet ?? 0));
    }
    if (fire.tinder) counts.set(fire.tinder, 1);
    if (fire.phase === 'unlit' && fire.kindling > 0) counts.set(KINDLING, fire.kindling);
    // Garnek i surowe składniki (gotowa potrawa bez misek przepada).
    for (const drop of potDrops(fire.pot)) counts.set(drop.type, (counts.get(drop.type) ?? 0) + drop.count);
    return [...counts].map(([type, count]) => {
        const wet = (wetness.get(type) ?? 0) / count;
        return wet > 0 ? { type, count, fresh: Math.round((1 - wet) * 1000) / 1000 } : { type, count };
    });
}
