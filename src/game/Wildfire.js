// ------------------------------------------------------------
// POŻAR (1.43.0, część E projektu drewna - docs/pozar.md)
//
// Zasady i liczby: blocks/fireTraits.js. Obraz: rendering/WildfireRenderer.js.
//
// Ogień chodzi po DRZEWACH, nie po blokach. Każde płonące drzewo to
// jeden wpis:
//   { key, x, y, z, species, fate, width, logs, leaves, time, duration,
//     removed, neighbours, cx, cz, radius, low, high }
// Co krok (4 razy na sekundę):
//   - korona płonie: liście znikają od dołu do góry (kilkadziesiąt bloków
//     na krok - bez zacięć),
//   - ogień próbuje przeskoczyć na sąsiednie drzewa (wiatr, pora roku,
//     deszcz, gatunek - fireTraits.spreadChance),
//   - deszcz gasi: drzewo zostaje, jakie było w tej chwili,
//   - na końcu wynik: popiół, zwęglony kikut albo nic (przeżywa).
//
// Skąd ogień: gracz starterem ognia (5 sekund PPM na pniu albo liściach)
// i komenda /pozar. Piorun, iskry z ogniska i sucha trawa - w następnej
// wersji; od tego jest ustawienie świata (mode): 'off' - nic nie płonie,
// 'player' - tylko to, co podpali gracz (i co się od tego zajmie),
// 'full' - także pożary z natury.
//
// Budowle gracza nie płoną: ogień bierze tylko żywe drzewa (to samo
// rozpoznanie, co przy ścinaniu - game/TreeScan.js).
// Zwierzętom nic się nie dzieje. Płonące drzewa nie są w zapisie: po
// wczytaniu świata ogień jest zgaszony (zostaje tylko ustawienie).
// ------------------------------------------------------------

import { CHUNK_HEIGHT } from '../config.js';
import { getBlockId, isSoilId, isSolidId, isLeavesId, isLiquidId } from '../blocks/BlockRegistry.js';
import {
    fireTraits, fateOf, burnSeconds, spreadChance, ignitionProblem, SURVIVOR_LOSS, SPREAD_RADIUS, WIND_REACH,
    RAIN_STOPS, FIRE_MODES, DEFAULT_FIRE_MODE, MAX_BURNING, REBURN_DAYS, CROWN_REACH
} from '../blocks/fireTraits.js';
import { scanTree, fallingLeaves, treeKind } from './TreeScan.js';
import { treeOf } from './TreeTaps.js';

export const FIRE_STEP_SECONDS = 0.25;
// Ile bloków najwyżej zmienia się w jednym kroku (wszystkie drzewa razem).
export const BLOCKS_PER_STEP = 90;
// Starter ognia: tyle sekund trzeba trzymać PPM.
export const LIGHT_SECONDS = 5;
// Krzew (kosodrzewina): tyle bloków najwyżej zbiera własne przeszukanie.
const SHRUB_LIMIT = 260;
// Tylu sąsiadów pamięta płonące drzewo.
const NEIGHBOUR_LIMIT = 16;
// Kępa liści bez drzewa większa niż tyle bloków zostaje (to czyjaś korona).
const ORPHAN_LIMIT = 300;
const CHARRED = 'charred_log', ASH = 'ash_layer';

const keyOf = (x, y, z) => `${x},${y},${z}`;
const NEAR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

// Kłoda gatunku `species` najbliżej (x, y, z) - gdy gracz celuje w liście.
export function nearestLog(world, x, y, z, species, reach = 5) {
    let best = null, bestDistance = Infinity;
    for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance >= bestDistance) continue;
        const kind = treeKind(world.getBlockId(x + dx, y + dy, z + dz));
        if (kind?.log && kind.tree === species) { best = { x: x + dx, y: y + dy, z: z + dz }; bestDistance = distance; }
    }
    return best;
}

// Całe drzewo, do którego należy kłoda (x, y, z): { species, logs,
// leaves, width, base } albo null (to nie żywe drzewo).
export function wholeTree(world, x, y, z) {
    const species = treeKind(world.getBlockId(x, y, z))?.log ? treeKind(world.getBlockId(x, y, z)).tree : null;
    if (!species) return null;
    // Do najniższej kłody tego pnia.
    let by = y;
    while (by > 1 && treeKind(world.getBlockId(x, by - 1, z))?.log && treeKind(world.getBlockId(x, by - 1, z)).tree === species) by--;
    const scan = scanTree(world, x, by, z);
    if (!scan?.living || scan.prop) return null;
    if (scan.blocked) {
        // Krzew, którego się nie ścina: własne, małe przeszukanie.
        const logs = [], leaves = [], seen = new Set([keyOf(x, by, z)]), queue = [{ x, y: by, z }];
        while (queue.length > 0 && seen.size < SHRUB_LIMIT) {
            const cell = queue.pop();
            const id = world.getBlockId(cell.x, cell.y, cell.z), kind = treeKind(id);
            if (kind?.tree !== species) continue;
            (kind.log ? logs : leaves).push({ ...cell, id });
            for (const [dx, dy, dz] of NEAR) {
                const key = keyOf(cell.x + dx, cell.y + dy, cell.z + dz);
                if (!seen.has(key)) { seen.add(key); queue.push({ x: cell.x + dx, y: cell.y + dy, z: cell.z + dz }); }
            }
        }
        return { species, logs, leaves, width: 1, base: { x, y: by, z } };
    }
    if (!scan.trunk) return null;
    // (Te same kłody bywają w kilku częściach przeszukania - bez powtórek.)
    const unique = new Map();
    for (const cell of [...scan.stump, ...scan.cut, ...scan.falling]) unique.set(keyOf(cell.x, cell.y, cell.z), cell);
    const logs = [...unique.values()];
    // Liście w równej odległości od sąsiada płoną z tym drzewem (inaczej
    // po pożarze obu wisiałyby w powietrzu).
    const leaves = fallingLeaves(world, species, logs, [], true);
    const base = scan.cut.reduce((best, cell) => (cell.x < best.x || (cell.x === best.x && cell.z < best.z) ? cell : best), scan.cut[0] ?? { x, y: by, z });
    return { species, logs, leaves, width: scan.width, base: { x: base.x, y: by, z: base.z } };
}

export class Wildfire {

    constructor(game, saved = null) {
        this.game = game;
        this.mode = Object.hasOwn(FIRE_MODES, saved?.mode ?? '') ? saved.mode : DEFAULT_FIRE_MODE;
        // Płonące drzewa: klucz -> wpis.
        this.trees = new Map();
        // To, co widać (także u gości w grze ze znajomymi): klucz -> { x, y, z, radius, height, left }.
        this.flames = new Map();
        // Spalone niedawno: klucz -> doba, od której mogą płonąć znowu.
        this.burnt = new Map();
        this.version = 0;
        this.settingsVersion = 0;
        this.pending = 0;
        this.second = 0;
        this.hold = { key: null, time: 0, noticeAt: 0 };
        this.random = Math.random;
    }

    getState() { return { mode: this.mode }; }
    changed() { this.version++; }

    setMode(mode) {
        if (!Object.hasOwn(FIRE_MODES, mode) || mode === this.mode) return false;
        this.mode = mode;
        this.settingsVersion++;
        if (mode === 'off') this.putOutAll();
        return true;
    }

    weather() {
        const game = this.game;
        return {
            days: game.time?.days ?? 0,
            rain: Number.isFinite(game.rainNow) ? Math.max(0, game.rainNow) : 0,
            wetness: Number.isFinite(game.weather?.wetness) ? game.weather.wetness : 0,
            wind: game.weather?.wind ?? null
        };
    }

    // Podpala drzewo z kłodą albo liściem w (x, y, z).
    //   source - 'player', 'spread', 'command', później 'lightning'...
    // Zwraca { ok: true, tree } albo { ok: false, reason }.
    ignite(x, y, z, source = 'player', force = false) {
        const game = this.game, world = game.world;
        if (game.net?.isClient) return { ok: false, reason: 'Pożarem rządzi gospodarz gry' };
        if (this.mode === 'off' && !force) return { ok: false, reason: 'Pożary są w tym świecie wyłączone' };
        const kind = treeKind(world.getBlockId(x, y, z));
        if (!kind) return { ok: false, reason: null };
        const log = kind.log ? { x, y, z } : nearestLog(world, x, y, z, kind.tree);
        if (!log) return { ok: false, reason: 'Te liście nie należą do żadnego drzewa' };
        const traits = fireTraits(kind.tree), weather = this.weather();
        if (!force) {
            const problem = source === 'spread' ? (traits.ease <= 0 ? 'mokre' : null) : ignitionProblem(kind.tree, weather.days, weather.rain, weather.wetness);
            if (problem) return { ok: false, reason: problem };
        }
        else if (traits.ease <= 0) return { ok: false, reason: 'To drzewo jest nasiąknięte wodą - nie zapali się' };
        if (this.trees.size >= MAX_BURNING) return { ok: false, reason: 'Płonie już tyle drzew, ile ogień udźwignie' };
        const tree = wholeTree(world, log.x, log.y, log.z);
        if (!tree) return { ok: false, reason: 'To nie żywe drzewo - nie zajmie się' };
        const key = keyOf(tree.base.x, tree.base.y, tree.base.z);
        if (this.trees.has(key)) return { ok: false, reason: 'To drzewo już płonie' };
        if ((this.burnt.get(key) ?? -Infinity) > weather.days) return { ok: false, reason: 'To drzewo dopiero co się paliło' };

        // Liście płoną od dołu do góry (z odrobiną bałaganu).
        const leaves = tree.leaves.map((leaf) => ({ x: leaf.x, y: leaf.y, z: leaf.z, order: leaf.y + this.random() * 2.5 })).sort((a, b) => a.order - b.order);
        let low = tree.base.y, high = tree.base.y, radius = 1;
        for (const cell of [...tree.logs, ...leaves]) {
            if (cell.y > high) high = cell.y;
            radius = Math.max(radius, Math.abs(cell.x - tree.base.x), Math.abs(cell.z - tree.base.z));
        }
        const fate = fateOf(tree.species, tree.width, tree.logs.length);
        const burn = {
            key, x: tree.base.x, y: tree.base.y, z: tree.base.z, species: tree.species, fate, width: tree.width,
            logs: tree.logs.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z })), leaves,
            time: 0, duration: burnSeconds(leaves.length), removed: 0, source,
            target: Math.round(leaves.length * (fate === 'survive' ? SURVIVOR_LOSS : 1)),
            radius: Math.min(12, radius + 0.5), low, high, neighbours: null, ending: null
        };
        this.trees.set(key, burn);
        this.showFlames(burn);
        this.version++;
        game.achieve?.('treeIgnited', { species: tree.species, fate, source, burning: this.trees.size });
        return { ok: true, tree: burn };
    }

    showFlames(burn) {
        this.flames.set(burn.key, { x: burn.x, y: burn.y, z: burn.z, radius: burn.radius, height: Math.max(2, burn.high - burn.y + 1),
            left: Math.max(0, Math.round(burn.duration - burn.time)) });
    }

    // Sąsiednie drzewa: najniższe kłody w kolumnach wokół (raz, przy pierwszej próbie).
    findNeighbours(burn) {
        const world = this.game.world, reach = Math.ceil(SPREAD_RADIUS + Math.min(CROWN_REACH, burn.radius) + WIND_REACH);
        const own = new Set(burn.logs.map((cell) => keyOf(cell.x, cell.y, cell.z)));
        const found = new Map();
        const top = Math.min(CHUNK_HEIGHT - 1, burn.high + 4), bottom = Math.max(1, burn.low - 6);
        for (let dx = -reach; dx <= reach; dx++) for (let dz = -reach; dz <= reach; dz++) {
            const distance = Math.hypot(dx, dz);
            if (distance > reach || distance < 1) continue;
            const x = burn.x + dx, z = burn.z + dz;
            for (let y = bottom; y <= top; y++) {
                const kind = treeKind(world.getBlockId(x, y, z));
                if (!kind?.log || own.has(keyOf(x, y, z))) continue;
                // Jedno drzewo - jeden wpis (kłody tego samego gatunku obok siebie).
                const cell = `${kind.tree}:${Math.round(x / 3)}:${Math.round(z / 3)}`;
                const old = found.get(cell);
                if (!old || distance < old.distance) found.set(cell, { x, y, z, species: kind.tree, dx, dz, distance });
                break;
            }
        }
        burn.neighbours = [...found.values()].sort((a, b) => a.distance - b.distance).slice(0, NEIGHBOUR_LIMIT);
    }

    // Gasi drzewo: zostaje, jakie jest.
    putOut(burn, notice = false) {
        if (!this.trees.delete(burn.key)) return;
        this.flames.delete(burn.key);
        this.burnt.set(burn.key, (this.game.time?.days ?? 0) + REBURN_DAYS);
        this.version++;
        if (notice) this.game.sounds?.play('sizzle', { position: { x: burn.x + 0.5, y: burn.y + 2, z: burn.z + 0.5 } });
    }
    putOutAll() {
        for (const burn of [...this.trees.values()]) this.putOut(burn);
    }

    update(dt, holding = false) {
        this.updateHold(dt, holding);
        if (this.trees.size === 0) { this.pending = 0; return; }
        this.pending += Math.max(0, Number.isFinite(dt) ? dt : 0);
        // Najwyżej dwa kroki na klatkę (po zacięciu ogień nie nadrabia hurtem).
        for (let i = 0; i < 2 && this.pending >= FIRE_STEP_SECONDS; i++) {
            this.pending -= FIRE_STEP_SECONDS;
            this.step(FIRE_STEP_SECONDS);
        }
        if (this.pending > FIRE_STEP_SECONDS * 4) this.pending = 0;
    }

    step(seconds) {
        const game = this.game, world = game.world;
        if (game.net?.isClient || this.trees.size === 0) return;
        const weather = this.weather();
        let budget = BLOCKS_PER_STEP;
        this.second += seconds;
        const spreadNow = this.second >= 1;
        if (spreadNow) this.second -= 1;
        const ash = getBlockId(ASH), charred = getBlockId(CHARRED);

        for (const burn of [...this.trees.values()]) {
            // Deszcz gasi płonące drzewa.
            if (weather.rain >= RAIN_STOPS && !burn.ending) { this.putOut(burn, true); game.achieve?.('fireRainedOut', { species: burn.species }); continue; }

            if (!burn.ending) {
                burn.time += seconds;
                // Liście: tyle powinno już zniknąć.
                const due = Math.min(burn.target, Math.ceil(burn.target * Math.min(1, burn.time / burn.duration)));
                while (burn.removed < due && budget > 0) {
                    const leaf = burn.leaves[burn.removed++];
                    const kind = treeKind(world.getBlockId(leaf.x, leaf.y, leaf.z));
                    if (kind && !kind.log && kind.tree === burn.species) { world.clearBlock(leaf.x, leaf.y, leaf.z); budget--; }
                }
                // Ogień przeskakuje na sąsiadów.
                if (spreadNow && this.trees.size < MAX_BURNING) {
                    if (!burn.neighbours) this.findNeighbours(burn);
                    for (const near of burn.neighbours) {
                        if (near.done) continue;
                        const chance = spreadChance({ species: near.species, dx: near.dx, dz: near.dz, distance: near.distance, crown: burn.radius, ...weather });
                        if (chance > 0 && this.random() < chance) {
                            near.done = true;
                            const result = this.ignite(near.x, near.y, near.z, 'spread');
                            if (result.ok) game.achieve?.('fireSpread', { from: burn.species, to: near.species, burning: this.trees.size });
                            break;
                        }
                    }
                }
                if (burn.time >= burn.duration && burn.removed >= burn.target) {
                    // Kępy liści, które zostałyby w powietrzu (łączyły się z koroną
                    // tylko na ukos), płoną na koniec razem z drzewem.
                    burn.ending = { index: 0, leaf: 0, leaves: burn.fate === 'survive' ? [] : this.orphans(burn) };
                    this.flames.delete(burn.key);
                    this.version++;
                }
                else if (spreadNow) { this.showFlames(burn); this.version++; }
            }

            // Wynik - po kawałku.
            if (burn.ending) {
                if (burn.fate !== 'survive') {
                    while (burn.ending.leaf < burn.ending.leaves.length && budget > 0) {
                        const leaf = burn.ending.leaves[burn.ending.leaf++];
                        const kind = treeKind(world.getBlockId(leaf.x, leaf.y, leaf.z));
                        if (kind && !kind.log && kind.tree === burn.species) { world.clearBlock(leaf.x, leaf.y, leaf.z); budget--; }
                    }
                    if (burn.ending.leaf < burn.ending.leaves.length) continue;
                    while (burn.ending.index < burn.logs.length && budget > 0) {
                        const cell = burn.logs[burn.ending.index++];
                        const kind = treeKind(world.getBlockId(cell.x, cell.y, cell.z));
                        if (!kind?.log || kind.tree !== burn.species) continue;
                        if (burn.fate === 'ash') world.clearBlock(cell.x, cell.y, cell.z);
                        else world.setBlock(cell.x, cell.y, cell.z, CHARRED);
                        budget--;
                    }
                    if (burn.ending.index < burn.logs.length) continue;
                    if (burn.fate === 'ash') this.dropAsh(burn, ash, charred);
                }
                this.trees.delete(burn.key);
                this.burnt.set(burn.key, weather.days + REBURN_DAYS);
                this.version++;
                game.achieve?.('treeBurnt', { species: burn.species, fate: burn.fate, source: burn.source });
            }
        }
        // Stare wpisy spalonych.
        if (spreadNow && this.burnt.size > 400) for (const [key, until] of this.burnt) if (until <= weather.days) this.burnt.delete(key);
    }

    // Liście gatunku tuż przy spalonej koronie, które nie trzymają się
    // (nawet na ukos) żadnej innej kłody tego gatunku. Kępa, która dotyka
    // sąsiedniego drzewa, zostaje przy nim.
    orphans(burn) {
        const world = this.game.world, species = burn.species;
        const own = new Set(burn.logs.map((cell) => keyOf(cell.x, cell.y, cell.z)));
        const seen = new Set(), result = [];
        for (const start of burn.leaves) {
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const sx = start.x + dx, sy = start.y + dy, sz = start.z + dz, startKey = keyOf(sx, sy, sz);
                if (seen.has(startKey)) continue;
                const first = treeKind(world.getBlockId(sx, sy, sz));
                if (!first || first.log || first.tree !== species) continue;
                // Kępa: liście połączone bokiem, krawędzią albo rogiem.
                const clump = [], queue = [{ x: sx, y: sy, z: sz }];
                let held = false;
                seen.add(startKey);
                while (queue.length > 0 && clump.length <= ORPHAN_LIMIT) {
                    const cell = queue.pop();
                    clump.push(cell);
                    for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) for (let az = -1; az <= 1; az++) {
                        const x = cell.x + ax, y = cell.y + ay, z = cell.z + az, key = keyOf(x, y, z);
                        if (seen.has(key)) continue;
                        const kind = treeKind(world.getBlockId(x, y, z));
                        if (kind?.tree !== species) continue;
                        if (kind.log) { if (!own.has(key)) held = true; continue; }
                        seen.add(key);
                        queue.push({ x, y, z });
                    }
                }
                // Za duża kępa to czyjaś korona - zostaje.
                if (!held && clump.length <= ORPHAN_LIMIT) result.push(...clump);
            }
        }
        return result;
    }

    // Popiół na ziemi tam, gdzie stało drzewo (i tuż obok).
    dropAsh(burn, ash) {
        const world = this.game.world;
        const spots = new Map();
        for (const cell of burn.logs) if (cell.y <= burn.y + 1) spots.set(`${cell.x},${cell.z}`, { x: cell.x, z: cell.z });
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.random() < 0.6) spots.set(`${burn.x + dx},${burn.z + dz}`, { x: burn.x + dx, z: burn.z + dz });
        for (const { x, z } of spots.values()) {
            for (let y = burn.y + 1; y >= burn.y - 2; y--) {
                const here = world.getBlockId(x, y, z), below = world.getBlockId(x, y - 1, z);
                if (here !== 0 || isLiquidId(below)) continue;
                if ((isSoilId(below) || isSolidId(below)) && !isLeavesId(below) && below !== ash) { world.setBlock(x, y, z, ASH); break; }
            }
        }
    }

    // Starter ognia trzymany na drzewie.
    updateHold(dt, holding) {
        const game = this.game, hit = game.currentHit, hold = this.hold;
        const kind = holding && hit?.hit && game.selectedBlock === 'fire_starter' ? treeKind(game.world.getBlockId(hit.block.x, hit.block.y, hit.block.z)) : null;
        if (!kind) { hold.key = null; hold.time = 0; return; }
        const key = keyOf(hit.block.x, hit.block.y, hit.block.z);
        if (hold.key !== key) { hold.key = key; hold.time = 0; hold.noticeAt = 0; hold.failed = false; }
        if (hold.failed) return;
        // Od razu wiadomo, że się nie da (deszcz, mokro, wyłączone).
        if (hold.time === 0) {
            const weather = this.weather();
            const problem = this.mode === 'off' ? 'Pożary są w tym świecie wyłączone' : game.net?.isClient ? 'Drzewo może podpalić tylko gospodarz gry'
                : ignitionProblem(kind.tree, weather.days, weather.rain, weather.wetness);
            if (problem) { hold.failed = true; game.onNotice?.(problem); return; }
        }
        hold.time += dt;
        if (hold.time < LIGHT_SECONDS) {
            if (hold.time >= hold.noticeAt) {
                hold.noticeAt = hold.time + 0.5;
                game.onNotice?.(`Podpalanie pnia ${treeOf(kind.tree)}: ${Math.round(hold.time / LIGHT_SECONDS * 100)}% — trzymaj PPM`);
            }
            return;
        }
        hold.failed = true;
        const result = this.ignite(hit.block.x, hit.block.y, hit.block.z, 'player');
        if (!result.ok) { if (result.reason) game.onNotice?.(result.reason); return; }
        game.onNotice?.(result.tree.fate === 'survive' ? 'Drzewo się zajęło - ogień idzie dołem' : 'Drzewo się zajęło!');
        game.sounds?.play('sizzle', { position: { x: hit.block.x + 0.5, y: hit.block.y + 0.5, z: hit.block.z + 0.5 }, pitch: 0.7 });
    }

    // Ciepło od płonących drzew przy graczu (°C, game/Warmth.js).
    heatAt(x, y, z) {
        let heat = 0;
        for (const flame of this.flames.values()) {
            const distance = Math.hypot(flame.x + 0.5 - x, Math.max(0, y - (flame.y + flame.height)), flame.z + 0.5 - z) - flame.radius;
            if (distance < 10) heat += 14 * (1 - Math.max(0, distance) / 10);
        }
        return Math.min(25, heat);
    }

    dispose() { this.trees.clear(); this.flames.clear(); }

}

// Wpis płomieni od innego gracza: tylko poprawne wartości.
export function restoreFlames(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger) || value.y < 0 || value.y >= CHUNK_HEIGHT) return null;
    const number = (v, min, max) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
    return { x: value.x, y: value.y, z: value.z, radius: number(value.radius, 1, 12), height: number(value.height, 2, 64), left: number(value.left, 0, 120) };
}
export const flamesSign = (flame) => `${flame.radius}:${flame.height}:${Math.ceil(flame.left / 10)}`;
