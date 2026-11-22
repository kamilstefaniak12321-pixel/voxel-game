// ------------------------------------------------------------
// ŚCINANIE DRZEW (1.36.0, pomysł Kamila - docs/drewno.md rozdział 3,
// opis tego, co działa: docs/scinanie.md)
//
// LPM siekierą w pień żywego drzewa (tryb przygody) to CIOS, nie
// kopanie bloku:
//
//   - zamach trwa CHOP_SECONDS i kosztuje energię,
//   - w pniu rośnie karb - po tej stronie, w którą się bije,
//   - ile ciosów: twardość drewna × grubość pnia (TreeScan.chopsNeeded),
//   - pień 2 × 2 trzeba ciąć z dwóch stron, grubszy z czterech,
//   - po ostatnim ciosie drzewo pada OD GRACZA: wszystko, co wisiało na
//     ciętym miejscu, znika ze świata i przez kilka sekund obraca się
//     jako jedna bryła (FallingTreeRenderer.js),
//   - po upadku: leżący pień z bloków (blocks/lyingLogs.js), konary
//     i patyki z korony, to, co było w liściach (sadzonki, szyszki,
//     owoce) - jako przedmioty na ziemi,
//   - cios w konar odcina sam konar - spada pionowo,
//   - gracz pod padającym pniem traci przytomność: widok nagle skupia
//     się na drzewie i od razu ciemność (Blackout.js).
//
// Co jest jednym drzewem, ustala TreeScan.js - z samych bloków, przy
// każdym ciosie od nowa. Karby nie są zapisywane (znikają po kilku
// minutach bez ciosu i po wyjściu z gry).
//
// Gołą ręką pień kopie się na razie jak dotąd - to zmieni się razem
// z powalonymi drzewami na start (kolejna wersja).
// ------------------------------------------------------------

import { getBlockDefinition, getBlockTypeById, getLoot, getHarvest, getDropType } from '../blocks/BlockRegistry.js';
import { getTool } from '../items/ItemRegistry.js';
import { woodTraits } from '../blocks/woodTraits.js';
import { FallingTreeRenderer } from '../rendering/FallingTreeRenderer.js';
import {
    scanTree, fallingLeaves, fellPlan, logSpecies, chopsNeeded, sidesNeeded, sideLimit,
    fallDirection, FALL_DIRECTIONS, trunkCanReplace
} from './TreeScan.js';

// Jeden zamach siekierą (sekundy) i jego koszt (energia - półtora skoku).
export const CHOP_SECONDS = 0.6;
export const CHOP_ENERGY = 0.15;
// Karb bez ciosu znika po tylu sekundach.
export const NOTCH_SECONDS = 600;
// Upadek: najpierw drzewo trzeszczy i przechyla się (LEAN), potem pada.
export const LEAN_SECONDS = 1;
export const LEAN_ANGLE = 0.09;
const FALL_MIN = 2, FALL_MAX = 4;
// Konar spada pionowo z przyspieszeniem (bloki/s²).
const DROP_GRAVITY = 18;
// Tyle przed uderzeniem gracz pod pniem "skupia się" na drzewie.
export const FOCUS_SECONDS = 0.3;
// Wstrząs obrazu po upadku (jak daleko go czuć, jak szybko gaśnie).
const SHAKE_RANGE = 40, SHAKE_FADE = 2.2;
// Konary i patyki z korony: z ilu kłód gałęzi jeden konar / patyk,
// z ilu bloków liści jeden patyk.
export const LOGS_PER_KONAR = 3, LOGS_PER_STICK = 2, LEAVES_PER_STICK = 24;
const MAX_STICKS = 24;
// Ze ściętej korony zostaje część tego, co dałoby zrywanie liści po jednym.
export const LOOT_PART = 0.35;

// Czas padania drzewa o wysokości `top` bloków.
export function fallSeconds(top) {
    return Math.min(FALL_MAX, Math.max(FALL_MIN, 1.4 + top * 0.07));
}

// Co zostaje z korony: { konar, stick }.
export function crownDrops(branches, leaves) {
    return {
        konar: Math.ceil(branches / LOGS_PER_KONAR),
        stick: Math.min(MAX_STICKS, Math.ceil(branches / LOGS_PER_STICK) + Math.floor(leaves / LEAVES_PER_STICK))
    };
}

const SIDE_OF_NORMAL = (normal) => normal?.x > 0 ? 'east' : normal?.x < 0 ? 'west' : normal?.z > 0 ? 'south' : normal?.z < 0 ? 'north' : null;
const OPPOSITE = { east: 'west', west: 'east', south: 'north', north: 'south' };


export class Felling {

    constructor(game) {
        this.game = game;
        this.renderer = new FallingTreeRenderer(game);
        // Karby: klucz miejsca cięcia -> { species, y, cells, width, hits, total, needed, limit, age, version, lastSide }.
        this.notches = new Map();
        // Padające drzewa.
        this.falls = [];
        this.cooldown = 0;
        this.shake = 0;
        this.nextId = 1;
        this.noticeAt = -Infinity;
        this.focus = null;
        // Ile milisekund w klatce wolno usuwać bloki ściętego drzewa.
        this.removeBudgetMs = 6;
    }

    notice(text) {
        if (performance.now() - this.noticeAt < 2500) return;
        this.noticeAt = performance.now();
        this.game.onNotice?.(text);
    }

    // Kierunek, w który patrzy gracz (poziomo) - tam pada drzewo.
    lookDirection() {
        const yaw = this.game.player.yaw;
        return fallDirection(-Math.sin(yaw), -Math.cos(yaw));
    }

    // LPM siekierą. Zwraca true, gdy kliknięcie obsłużono (zwykłe kopanie
    // ma wtedy nic nie robić).
    chop(hit, pressed, held) {
        const game = this.game;
        if (game.mode !== 'adventure' || !hit?.hit || getTool(game.selectedBlock) !== 'axe') return false;
        const { x, y, z } = hit.block;
        const id = game.world.getBlockId(x, y, z);
        if (!logSpecies(id) || !(pressed || held)) return false;
        // Drzewo, które właśnie znika ze świata (olbrzym): chwila przerwy.
        if (this.falls.some((fall) => fall.pending.length > 0)) return true;
        // Czy to żywe drzewo, sprawdzamy raz na cel (i przy każdym ciosie).
        const key = `${x},${y},${z},${id}`;
        if (this.target?.key !== key) this.target = { key, scan: scanTree(game.world, x, y, z) };
        let scan = this.target.scan;
        if (!scan || !scan.living || scan.blocked || scan.prop) return false;
        if (this.cooldown > 0) return true;

        scan = this.target.scan = scanTree(game.world, x, y, z);
        if (!scan || !scan.living || scan.blocked || scan.prop) return false;

        // Za miękka siekiera na to drewno (1.39.0, ToolWear.js).
        const tooSoft = game.toolWear?.cutCheck(scan.species);
        if (tooSoft) {
            if (pressed) { this.noticeAt = -Infinity; this.notice(tooSoft); }
            return true;
        }

        // Zamach.
        const work = game.wellbeing?.effects?.work ?? 1;
        this.cooldown = CHOP_SECONDS / work;
        game.swingArm?.(CHOP_SECONDS);
        game.wellbeing?.spend?.(CHOP_ENERGY);
        game.playBlockSound?.('break', hit.block.type, hit.block, 0.75);
        game.debris?.chips(hit.block.type, x, y, z, hit.normal);
        game.debris?.chips(hit.block.type, x, y, z, hit.normal);

        const traits = woodTraits(scan.species);
        const direction = this.lookDirection();
        const side = SIDE_OF_NORMAL(hit.normal) ?? OPPOSITE[direction];
        let notch = this.notches.get(scan.key);
        if (!notch) {
            // Konar: połowa ciosów cienkiego pnia, z jednej strony.
            const needed = scan.trunk ? chopsNeeded(traits.hardness, scan.width) : Math.max(1, Math.round(chopsNeeded(traits.hardness, 1) / 2));
            notch = { species: scan.species, y, cells: scan.cut.map((cell) => ({ x: cell.x, z: cell.z })), width: scan.width,
                hits: { east: 0, west: 0, south: 0, north: 0 }, total: 0, needed,
                limit: scan.trunk ? sideLimit(traits.hardness, scan.width) : needed, sidesNeeded: scan.trunk ? sidesNeeded(scan.width) : 1,
                age: 0, version: 0, lastSide: side, sides: {} };
            this.notches.set(scan.key, notch);
        }
        notch.age = 0;
        notch.lastSide = side;
        if (notch.hits[side] >= notch.limit) {
            // Karb z tej strony doszedł do środka.
            this.notice(notch.sidesNeeded === 2 ? 'Z tej strony karb doszedł do połowy - obejdź drzewo i tnij z drugiej'
                : 'Z tej strony karb jest już głęboki - tnij z następnej');
            return true;
        }
        notch.hits[side]++;
        notch.total++;
        // Cios zużywa siekierę (liczone przed nim - po ciosie może jej nie być).
        const wear = game.toolWear?.forChop(scan.species) ?? 0;
        notch.version++;
        for (const name of Object.keys(notch.hits)) notch.sides[name] = notch.hits[name] / notch.limit;
        game.achieve?.('treeChopped', { species: scan.species, width: scan.width, total: notch.total, needed: notch.needed });

        if (notch.total >= notch.needed) {
            this.notches.delete(scan.key);
            this.target = null;
            this.fell(scan, direction);
        }
        if (wear > 0) game.toolWear.apply(wear);
        return true;
    }

    // Czy tego bloku nie da się wykopać bez siekiery (1.37.0): żywe
    // drzewo i zdrowy leżący pień. Zwraca podpowiedź dla gracza albo null.
    needsAxe(hit) {
        const game = this.game;
        if (game.mode !== 'adventure' || !hit?.hit || getTool(game.selectedBlock) === 'axe') return null;
        const { x, y, z, type } = hit.block;
        const definition = getBlockDefinition(type);
        if (definition?.lying) return definition.rotten ? null : 'Zdrowy pień tnie się siekierą. Gołą ręką wyłamiesz spróchniałe kawałki i zedrzesz korę (PPM).';
        const id = game.world.getBlockId(x, y, z);
        if (!logSpecies(id)) return null;
        const key = `${x},${y},${z},${id}`;
        if (this.target?.key !== key) this.target = { key, scan: scanTree(game.world, x, y, z) };
        const scan = this.target.scan;
        // Krzew, olbrzym, podpora i pień postawiony ręką - po staremu.
        if (!scan || !scan.living || scan.blocked || scan.prop) return null;
        return 'Żywe drzewo ścina się siekierą. Pierwsze drewno weź z powalonego pnia w lesie.';
    }

    // Opis karbu pod celownikiem (komenda /scinanie) albo null.
    describe(x, y, z) {
        const scan = scanTree(this.game.world, x, y, z);
        if (!scan) return null;
        const traits = woodTraits(scan.species);
        const notch = this.notches.get(scan.key);
        return { scan, notch, needed: scan.trunk ? chopsNeeded(traits.hardness, scan.width) : Math.max(1, Math.round(chopsNeeded(traits.hardness, 1) / 2)),
            sides: scan.trunk ? sidesNeeded(scan.width) : 1 };
    }

    // To, co było w liściach: sadzonki, szyszki, owoce (jak przy
    // zrywaniu liści ręką, ale bez samych liści).
    leafLoot(leaves) {
        const loot = new Map();
        const add = (type, count) => loot.set(type, (loot.get(type) ?? 0) + count);
        for (const leaf of leaves) {
            const type = getBlockTypeById(leaf.id);
            const harvest = getHarvest(type);
            if (harvest && !harvest.tool) add(harvest.item, harvest.count[0]);
            for (const [item, chance] of getLoot(type)) if (Math.random() < chance * LOOT_PART) add(item, 1);
        }
        return loot;
    }

    // Drzewo (albo konar) znika ze świata i zaczyna spadać.
    // direction - nazwa z FALL_DIRECTIONS. Zwraca wpis spadającej bryły.
    fell(scan, direction) {
        const game = this.game, world = game.world;
        const leaves = fallingLeaves(world, scan.species, scan.falling, scan.stump);
        const cutY = scan.cut[0].y;
        const { dx, dz } = FALL_DIRECTIONS[direction];
        const minX = Math.min(...scan.cut.map((cell) => cell.x)), minZ = Math.min(...scan.cut.map((cell) => cell.z));
        const fall = { id: this.nextId++, scan, direction, trunk: scan.trunk, time: 0, leaves: leaves.length,
            loot: this.leafLoot(leaves), sample: leaves.filter((_, index) => index % Math.max(1, Math.floor(leaves.length / 36)) === 0) };

        if (scan.trunk) {
            // Plan ułożenia liczymy PRZED usunięciem bloków: korona własnego
            // drzewa nie jest przeszkodą (liście się łamią).
            fall.plan = fellPlan(world, scan, direction);
            fall.seconds = fallSeconds(scan.top);
            // Oś obrotu: krawędź pniaka po stronie upadku.
            const half = scan.width / 2;
            fall.origin = { x: minX + half + dx * half, y: cutY + 1, z: minZ + half + dz * half };
            // Na tej wysokości bryła kończy (poziom pierwszego metra leżącego pnia).
            fall.restY = fall.plan.blocks.length > 0 ? fall.plan.blocks[0].y : cutY;
        }
        else {
            // Konar: spada pionowo do gruntu pod sobą.
            const low = scan.falling.reduce((best, cell) => (cell.y < best.y ? cell : best), scan.falling[0]);
            let ground = low.y;
            while (ground > 1 && trunkCanReplace(world.getBlockId(low.x, ground - 1, low.z))) ground--;
            fall.drop = low.y - ground;
            fall.seconds = Math.sqrt(2 * Math.max(0.2, fall.drop) / DROP_GRAVITY);
            fall.origin = { x: low.x + 0.5, y: low.y, z: low.z + 0.5 };
            fall.land = { x: low.x + 0.5, y: ground, z: low.z + 0.5 };
        }

        // Bloki znikają ze świata: najpierw liście, potem kłody (od góry).
        // Bryła stoi już na ich miejscu, więc zwykłe drzewo znika w jednej
        // klatce, a olbrzym przez kilka (removeSome) - dopiero potem pada.
        fall.pending = [...[...scan.falling].sort((a, b) => a.y - b.y), ...leaves];
        this.renderer.add(fall.id, scan.falling, leaves, fall.origin);
        this.falls.push(fall);
        this.removeSome(fall);
        if (scan.trunk) {
            // Trzask pękającego pnia.
            const position = { x: fall.origin.x, y: fall.origin.y, z: fall.origin.z };
            game.sounds?.play('break_wood', { position, volume: 1, pitch: 0.55 });
            game.sounds?.play('break_wood', { position, volume: 0.8, pitch: 0.4, delay: 0.35 });
        }
        return fall;
    }

    // Usuwa ze świata kolejne bloki spadającego drzewa - tyle, ile zmieści
    // się w budżecie czasu klatki. Zwraca true, gdy nie zostało nic.
    removeSome(fall, budgetMs = this.removeBudgetMs) {
        const world = this.game.world, pending = fall.pending;
        const start = performance.now();
        let done = 0;
        while (pending.length > 0) {
            const cell = pending.pop();
            world.clearBlock(cell.x, cell.y, cell.z);
            if (++done % 16 === 0 && performance.now() - start > budgetMs) break;
        }
        return pending.length === 0;
    }

    // Czy gracz stoi tam, gdzie zaraz uderzy pień.
    playerUnder(fall) {
        if (!fall.trunk || this.game.mode !== 'adventure') return false;
        const player = this.game.player.pos, { dx, dz } = FALL_DIRECTIONS[fall.direction];
        const rx = player.x - fall.origin.x, rz = player.z - fall.origin.z;
        const along = rx * dx + rz * dz, across = Math.abs(rx * dz - rz * dx);
        return along > 0.2 && along < fall.plan.stem.length + 0.5 && across < fall.scan.width / 2 + 0.55 &&
            player.y > fall.restY - 2.5 && player.y < fall.restY + fall.scan.width + 0.5;
    }

    // Miejsce obok leżącego pnia, w którym gracz się obudzi.
    wakeSpot(fall) {
        const world = this.game.world, player = this.game.player.pos, { dx, dz } = FALL_DIRECTIONS[fall.direction];
        const rx = player.x - fall.origin.x, rz = player.z - fall.origin.z;
        const sideSign = rx * dz - rz * dx >= 0 ? 1 : -1;
        const free = (x, y, z) => trunkCanReplace(world.getBlockId(Math.floor(x), y, Math.floor(z))) &&
            trunkCanReplace(world.getBlockId(Math.floor(x), y + 1, Math.floor(z)));
        for (const sign of [sideSign, -sideSign]) {
            for (let far = fall.scan.width / 2 + 1.2; far < fall.scan.width / 2 + 5; far++) {
                const x = player.x + dz * sign * far, z = player.z - dx * sign * far;
                for (let y = Math.floor(player.y) + 2; y >= Math.floor(player.y) - 3; y--) {
                    if (free(x, y, z) && !trunkCanReplace(world.getBlockId(Math.floor(x), y - 1, Math.floor(z)))) {
                        return { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 };
                    }
                }
            }
        }
        // Nie ma gdzie - na pniu.
        return { x: player.x, y: fall.restY + fall.scan.width, z: player.z };
    }

    // Upadek: leżący pień, przedmioty, huk.
    // Zwraca true, gdy leżący pień jeszcze się układa (olbrzym - placeSome).
    land(fall) {
        const game = this.game, world = game.world, scan = fall.scan;
        const species = scan.species;
        const spawn = (type, count, x, y, z, spread = 0.6) => {
            if (!(count > 0)) return;
            game.drops?.spawn(type, count, { x: x + (Math.random() - 0.5) * spread, y: y + 0.3, z: z + (Math.random() - 0.5) * spread },
                { x: (Math.random() - 0.5) * 1.5, y: 2 + Math.random(), z: (Math.random() - 0.5) * 1.5 });
        };
        const logItem = getDropType(`${species}_log`) ?? `${species}_log`;

        if (!fall.trunk) {
            // Konar: kłody jako konary i patyki.
            const { x, y, z } = fall.land;
            const crown = crownDrops(scan.falling.length, fall.leaves);
            spawn('konar', Math.max(1, crown.konar), x, y, z);
            spawn('stick', crown.stick, x, y, z);
            for (const [type, count] of fall.loot) spawn(type, count, x, y, z, 1.5);
            game.sounds?.play('break_wood', { position: fall.land, volume: 0.8, pitch: 0.8 });
            for (const leaf of fall.sample.slice(0, 8)) game.debris?.burst(getBlockTypeById(leaf.id), Math.floor(x), Math.floor(y), Math.floor(z));
            game.achieve?.('branchCut', { species, logs: scan.falling.length });
            this.renderer.remove(fall.id);
            return false;
        }

        const plan = fall.plan, { dx, dz } = FALL_DIRECTIONS[fall.direction];
        const crushed = this.playerUnder(fall);
        const wake = crushed ? this.wakeSpot(fall) : null;
        // Leżący pień układa się z bloków (placeSome); bryła leży, dopóki
        // nie ma wszystkich.
        fall.placing = [...plan.blocks].reverse();
        fall.lost = 0;
        fall.logItem = logItem;
        for (const piece of plan.loose) spawn(logItem, piece.count, piece.x, piece.y, piece.z);
        // Korona: konary, patyki i to, co było w liściach - tam, gdzie upadła.
        const crown = crownDrops(plan.branches, fall.leaves);
        const reach = Math.max(1, plan.stem.length * 0.75);
        const cx = fall.origin.x + dx * reach, cz = fall.origin.z + dz * reach, cy = plan.end.y + 1;
        spawn('konar', crown.konar, cx, cy, cz, 3);
        spawn('stick', crown.stick, cx, cy, cz, 3);
        for (const [type, count] of fall.loot) spawn(type, count, cx, cy, cz, 4);

        // Huk, wstrząs, chmura liści.
        const position = { x: cx, y: cy, z: cz };
        game.sounds?.play('break_wood', { position, volume: 1, pitch: 0.45 });
        game.sounds?.play('break_wood', { position, volume: 1, pitch: 0.3, delay: 0.08 });
        game.sounds?.play('break_plant', { position, volume: 1, pitch: 0.7 });
        const distance = Math.hypot(game.player.pos.x - cx, game.player.pos.z - cz);
        this.shake = Math.max(this.shake, Math.min(1, 0.25 + scan.top * 0.02 + scan.width * 0.1) * Math.max(0, 1 - distance / SHAKE_RANGE));
        for (const leaf of fall.sample) {
            // Liść tam, gdzie znalazł się po obrocie o ćwierć koła.
            const up = leaf.y - fall.origin.y, rx = leaf.x + 0.5 - fall.origin.x, rz = leaf.z + 0.5 - fall.origin.z;
            const along = rx * dx + rz * dz, across = rx * dz - rz * dx;
            const lx = fall.origin.x + dx * (up + 0.5) + dz * across, lz = fall.origin.z + dz * (up + 0.5) - dx * across;
            game.debris?.burst(getBlockTypeById(leaf.id), Math.floor(lx), Math.floor(fall.restY + Math.max(0, -along) + 0.5), Math.floor(lz));
        }

        game.achieve?.('treeFelled', { species, width: scan.width, height: scan.top, logs: scan.falling.length, length: plan.length,
            pieces: plan.pieces, crushed, hardness: woodTraits(species).hardness });
        if (crushed) game.blackout?.start(wake);
        return !this.placeSome(fall);
    }

    // Stawia kolejne bloki leżącego pnia - tyle, ile zmieści się
    // w budżecie czasu klatki. Zwraca true, gdy pień leży cały.
    placeSome(fall, budgetMs = this.removeBudgetMs) {
        const world = this.game.world, placing = fall.placing;
        const start = performance.now();
        let done = 0;
        while (placing.length > 0) {
            const block = placing.pop();
            // Miejsce mogło się zmienić od ciosu (ktoś coś postawił) -
            // zajęty blok spada jako kłoda.
            if (!(trunkCanReplace(world.getBlockId(block.x, block.y, block.z)) && world.setBlock(block.x, block.y, block.z, block.type))) fall.lost++;
            if (++done % 16 === 0 && performance.now() - start > budgetMs) break;
        }
        if (placing.length > 0) return false;
        if (fall.done) return true;
        fall.done = true;
        this.renderer.remove(fall.id);
        if (fall.lost > 0) {
            const end = fall.plan.end;
            this.game.drops?.spawn(fall.logItem, fall.lost, { x: end.x, y: end.y + 1.3, z: end.z }, { x: 0, y: 2, z: 0 });
        }
        return true;
    }

    // Wszystkie spadające drzewa lądują od razu (wyjście z gry, zapis).
    finishAll() {
        for (const fall of this.falls.splice(0)) {
            this.removeSome(fall, Infinity);
            if (!fall.placing) this.land(fall);
            if (fall.placing) this.placeSome(fall, Infinity);
        }
        this.focus = null;
    }

    update(dt) {
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.shake = Math.max(0, this.shake - dt * SHAKE_FADE * Math.max(0.15, this.shake));
        if (this.shake < 0.004) this.shake = 0;

        for (const [key, notch] of this.notches) {
            notch.age += dt;
            if (notch.age > NOTCH_SECONDS) this.notches.delete(key);
        }
        if (this.notches.size > 0 || this.renderer.notches.size > 0) this.renderer.syncNotches(this.notches);

        this.focus = null;
        for (let i = this.falls.length - 1; i >= 0; i--) {
            const fall = this.falls[i];
            // Po upadku: leżący pień układa się z bloków.
            if (fall.placing) { if (this.placeSome(fall)) this.falls.splice(i, 1); continue; }
            // Olbrzym: bryła stoi, dopóki jego bloki znikają ze świata.
            if (fall.pending.length > 0 && !this.removeSome(fall)) continue;
            fall.time += dt;
            if (!fall.trunk) {
                // Konar: w dół z przyspieszeniem.
                const fallen = Math.min(fall.drop, DROP_GRAVITY * fall.time * fall.time / 2);
                this.renderer.setPose(fall.id, { x: fall.origin.x, y: fall.origin.y - fallen, z: fall.origin.z }, 0, 0);
                if (fall.time >= fall.seconds) { this.falls.splice(i, 1); this.land(fall); }
                continue;
            }
            const total = LEAN_SECONDS + fall.seconds;
            // Przechył (trzeszczy), potem coraz szybszy upadek.
            let angle;
            if (fall.time < LEAN_SECONDS) {
                const p = fall.time / LEAN_SECONDS;
                angle = LEAN_ANGLE * p * p;
            }
            else {
                const p = Math.min(1, (fall.time - LEAN_SECONDS) / fall.seconds);
                angle = LEAN_ANGLE + (Math.PI / 2 - LEAN_ANGLE) * p ** 2.4;
            }
            // Pod koniec bryła osiada z wysokości pniaka na ziemię.
            const settle = Math.min(1, Math.max(0, (angle - 0.9) / (Math.PI / 2 - 0.9)));
            const y = fall.origin.y + (fall.restY - fall.origin.y) * settle * settle;
            const { dx, dz } = FALL_DIRECTIONS[fall.direction];
            this.renderer.setPose(fall.id, { x: fall.origin.x, y, z: fall.origin.z }, dz * angle, -dx * angle);
            // Gracz pod pniem: tuż przed uderzeniem widok skupia się na drzewie.
            if (total - fall.time <= FOCUS_SECONDS && this.playerUnder(fall)) {
                const reach = fall.plan.stem.length * 0.6;
                this.focus = { x: fall.origin.x + dx * reach * Math.sin(angle), y: y + reach * Math.cos(angle), z: fall.origin.z + dz * reach * Math.sin(angle) };
            }
            if (fall.time >= total && !this.land(fall)) this.falls.splice(i, 1);
        }
    }

    // Czy gracz ma w tej klatce zablokowane sterowanie (skupienie na drzewie).
    get focusing() { return this.focus !== null; }

    dispose() {
        // Drzewo w locie nie może przepaść: ląduje przed zapisem świata.
        this.finishAll();
        this.renderer.dispose();
    }

}
