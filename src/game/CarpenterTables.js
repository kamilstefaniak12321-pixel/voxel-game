import { getBlockTypeById, getBlockId, isReplaceableId, AIR_ID } from '../blocks/BlockRegistry.js';
import { shapeInfo, shapeId, shapeBaseType, FACING_VECTOR, oppositeFacing, lookFacing, rightOf } from '../blocks/woodShapes.js';
import { woodOfPlanks } from '../blocks/woods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { CarpenterTableRenderer } from '../rendering/CarpenterTableRenderer.js';

// ------------------------------------------------------------
// STÓŁ STOLARSKI (0.90.0)
//
// Długi na dwa bloki. Praca na blacie, w świecie (bez okna):
// - PPM deskami w lewą część stołu (A) - deski kładą się na blat (cały
//   stos z ręki, do 64; jeden rodzaj naraz),
// - na prawej części (B) pojawiają się wyroby z tego drewna: schody,
//   półblok, płot i furtka (te, na które starczy desek). PPM w wyrób -
//   zabiera partię do ekwipunku (Shift - tyle, ile się da),
// - PPM pustą ręką (albo czymś innym) w deski - zabiera je z powrotem,
// - stół z deskami na blacie najpierw trzeba opróżnić, żeby go rozbić.
// Deski na stołach zapisują się ze światem (worldInfo.carpenterTables).
// Furtka: PPM otwiera i zamyka (od gracza).
//
// 0.91.0 - podwójny warsztat: dwa stoły jeden za drugim (razem 2 x 2
// bloki - 4 x 4 miejsca na blacie). Gdy na jednym leżą deski, a drugi jest
// pusty, na prawej części drugiego pojawiają się dodatkowe wyroby z tych
// desek: drzwi i klapa (BENCH_PRODUCTS). Drzwi (dwa bloki) i klapy -
// PPM otwiera i zamyka; drzwi z animacją (DoorRenderer.js).
// ------------------------------------------------------------

export const TABLE_CAPACITY = 64;

// Wyroby: ile desek idzie na partię i ile sztuk z niej wychodzi.
export const TABLE_PRODUCTS = [
    { kind: 'stairs', planks: 3, count: 2 },
    { kind: 'slab', planks: 1, count: 2 },
    { kind: 'fence', planks: 3, count: 2 },
    { kind: 'gate', planks: 4, count: 1 }
];

// Dodatkowe wyroby podwójnego warsztatu (na drugim stole, w tych samych
// ćwiartkach co zwykłe: przód lewa, przód prawa, ...).
export const BENCH_PRODUCTS = [
    { kind: 'door', planks: 6, count: 3 },
    { kind: 'trapdoor', planks: 3, count: 1 }
];

// Ćwiartki części B (w układzie stołu przodem na północ, -z): numer
// wyrobu po (kolumna od lewej patrzącego, rząd: 0 - przód, 1 - tył).
export function productAt(column, row) {
    return row * 2 + column;
}

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;

export function restoreTable(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isInteger)) return null;
    const wood = woodOfPlanks(value.planks);
    const count = Math.max(0, Math.min(TABLE_CAPACITY, Math.floor(Number(value.count) || 0)));
    return { x: value.x, y: value.y, z: value.z, planks: wood && count > 0 ? value.planks : null, count: wood ? count : 0 };
}

export class CarpenterTables {

    constructor(game, saved = []) {
        this.game = game;
        this.tables = new Map();
        this.version = 0;
        for (const value of Array.isArray(saved) ? saved : []) {
            const table = restoreTable(value);
            if (table && table.count > 0) this.tables.set(keyOf(table), table);
        }
        this.renderer = game.scene ? new CarpenterTableRenderer(game, this) : null;
    }

    get world() { return this.game.world; }

    getState() {
        return [...this.tables.values()].filter((table) => table.count > 0)
            .map(({ x, y, z, planks, count }) => ({ x, y, z, planks, count }));
    }

    // Część A stołu dla dowolnej części (albo null, gdy to nie stół).
    tableAt({ x, y, z }) {
        const info = shapeInfo(this.world.getBlockId(x, y, z));
        if (info?.kind !== 'table') return null;
        if (info.part === 'a') return { x, y, z, facing: info.facing, wood: info.wood };
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(info.facing))];
        return { x: x - dx, y, z: z - dz, facing: info.facing, wood: info.wood };
    }

    // Druga część stołu (B) dla części A.
    partB(a) {
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(a.facing))];
        return { x: a.x + dx, y: a.y, z: a.z + dz };
    }

    state(a, create = false) {
        const key = keyOf(a);
        let table = this.tables.get(key);
        if (!table && create) {
            table = { x: a.x, y: a.y, z: a.z, planks: null, count: 0 };
            this.tables.set(key, table);
        }
        return table ?? null;
    }

    // Stawianie stołu: obie części albo nic. Zwraca typ części A albo false.
    place(target, wood, yaw, player) {
        const look = lookFacing(yaw);
        const facing = oppositeFacing(look);
        const [dx, dz] = FACING_VECTOR[rightOf(look)];
        const b = { x: target.x + dx, y: target.y, z: target.z + dz };
        for (const cell of [target, b]) {
            if (!this.cellFree(cell)) return false;
            if (player?.intersectsBlock(cell.x, cell.y, cell.z)) return false;
        }
        const typeA = getBlockTypeById(shapeId(wood, 'table', { facing, part: 'a' }));
        const typeB = getBlockTypeById(shapeId(wood, 'table', { facing, part: 'b' }));
        if (!this.world.setBlock(target.x, target.y, target.z, typeA)) return false;
        if (!this.world.setBlock(b.x, b.y, b.z, typeB)) {
            this.world.setBlock(target.x, target.y, target.z, null);
            return false;
        }
        this.version++;
        return typeA;
    }

    cellFree({ x, y, z }) {
        const id = this.world.getBlockId(x, y, z);
        return id === AIR_ID || isReplaceableId(id);
    }

    // Drugi stół podwójnego warsztatu (część A) albo null: stół, którego
    // obie części leżą tuż przed albo tuż za obiema częściami tego stołu.
    partnerOf(a) {
        const b = this.partB(a);
        const [fx, fz] = FACING_VECTOR[a.facing];
        for (const sign of [1, -1]) {
            const one = this.tableAt({ x: a.x + fx * sign, y: a.y, z: a.z + fz * sign });
            const two = this.tableAt({ x: b.x + fx * sign, y: b.y, z: b.z + fz * sign });
            if (one && two && one.x === two.x && one.z === two.z) return one;
        }
        return null;
    }

    // Stół z deskami, który podaje dodatkowe wyroby na stół "a" (pusty).
    supplierOf(a) {
        if (this.state(a)?.count > 0) return null;
        const partner = this.partnerOf(a);
        return partner && this.state(partner)?.count > 0 ? partner : null;
    }

    // --- Drzwi -----------------------------------------------------------

    // Stawianie drzwi: dolna i górna część, na czymś stałym. Zawias po
    // lewej patrzącego, a gdy po lewej stoją już drzwi z lewym zawiasem
    // (w tę samą stronę) - po prawej (drzwi dwuskrzydłowe).
    placeDoor(target, wood, yaw, player) {
        const facing = lookFacing(yaw);
        const up = { x: target.x, y: target.y + 1, z: target.z };
        if (!this.cellFree(target) || !this.cellFree(up)) return false;
        if (!this.world.isSolid(target.x, target.y - 1, target.z)) return false;
        if (player?.intersectsBlock(target.x, target.y, target.z) || player?.intersectsBlock(up.x, up.y, up.z)) return false;
        const [lx, lz] = FACING_VECTOR[oppositeFacing(rightOf(facing))];
        const left = shapeInfo(this.world.getBlockId(target.x + lx, target.y, target.z + lz));
        const hinge = left?.kind === 'door' && left.facing === facing && left.hinge === 'left' ? 'right' : 'left';
        const lower = getBlockTypeById(shapeId(wood, 'door', { facing, part: 'lower', hinge }));
        const upper = getBlockTypeById(shapeId(wood, 'door', { facing, part: 'upper', hinge }));
        if (!this.world.setBlock(target.x, target.y, target.z, lower)) return false;
        if (!this.world.setBlock(up.x, up.y, up.z, upper)) {
            this.world.setBlock(target.x, target.y, target.z, null);
            return false;
        }
        return lower;
    }

    toggleDoor({ x, y, z }, info) {
        const lowerY = info.part === 'lower' ? y : y - 1;
        const open = !info.open;
        for (const part of ['lower', 'upper']) {
            const cy = part === 'lower' ? lowerY : lowerY + 1;
            const here = shapeInfo(this.world.getBlockId(x, cy, z));
            if (here?.kind !== 'door') continue;
            this.world.setBlock(x, cy, z, getBlockTypeById(shapeId(info.wood, 'door', { facing: here.facing, part, hinge: here.hinge, open })));
        }
        this.game.playBlockSound?.(open ? 'place' : 'step', info.planks, { x, y: lowerY, z });
        return true;
    }

    toggleTrapdoor({ x, y, z }, info) {
        this.world.setBlock(x, y, z, getBlockTypeById(shapeId(info.wood, 'trapdoor', { facing: info.facing, half: info.half, open: !info.open })));
        this.game.playBlockSound?.(info.open ? 'step' : 'place', info.planks, { x, y, z });
        return true;
    }

    canBreak(position) {
        const a = this.tableAt(position);
        return !a || !(this.state(a)?.count > 0);
    }

    // Po rozbiciu jednej części - znika druga (stół daje się raz).
    broken(position, info) {
        if (info?.kind === 'door') {
            // Druga część drzwi znika (drzwi dają się raz).
            const y = info.part === 'lower' ? position.y + 1 : position.y - 1;
            const other = shapeInfo(this.world.getBlockId(position.x, y, position.z));
            if (other?.kind === 'door' && other.part !== info.part) this.world.setBlock(position.x, y, position.z, null);
            return;
        }
        if (info?.kind !== 'table') return;
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(info.facing))];
        const sign = info.part === 'a' ? 1 : -1;
        const other = { x: position.x + dx * sign, y: position.y, z: position.z + dz * sign };
        const otherInfo = shapeInfo(this.world.getBlockId(other.x, other.y, other.z));
        if (otherInfo?.kind === 'table' && otherInfo.part !== info.part) this.world.setBlock(other.x, other.y, other.z, null);
        const a = info.part === 'a' ? position : other;
        if (this.tables.delete(keyOf(a))) this.version++;
    }

    // PPM: furtka (otwórz/zamknij) albo stół. true - obsłużone.
    interact(hit, selected, sneaking = false) {
        if (!hit?.hit) return false;
        const { x, y, z } = hit.block;
        const id = this.world.getBlockId(x, y, z);
        const info = shapeInfo(id);
        if (info?.kind === 'gate') return this.toggleGate(hit.block, info);
        if (info?.kind === 'door') return this.toggleDoor(hit.block, info);
        if (info?.kind === 'trapdoor') return this.toggleTrapdoor(hit.block, info);
        if (info?.kind !== 'table') return false;
        const a = this.tableAt(hit.block);
        if (info.part === 'a') return this.usePlanks(a, selected);
        return this.takeProduct(a, hit, sneaking);
    }

    toggleGate({ x, y, z }, info) {
        const look = lookFacing(this.game.player?.yaw ?? 0);
        let facing = info.facing;
        // Otwiera się od gracza (na tę stronę, w którą patrzy).
        if (!info.open && (look === facing || look === oppositeFacing(facing))) facing = look;
        const next = shapeId(info.wood, 'gate', { facing, open: !info.open });
        this.world.setBlock(x, y, z, getBlockTypeById(next));
        this.game.playBlockSound?.(info.open ? 'step' : 'place', info.planks, { x, y, z });
        return true;
    }

    // Deski na blat albo z powrotem do ekwipunku.
    usePlanks(a, selected) {
        const inventory = this.game.inventory;
        const table = this.state(a, true);
        const wood = woodOfPlanks(selected);
        if (wood) {
            if (table.count > 0 && table.planks !== selected) {
                this.game.onNotice?.(`Na stole leżą już ${getItemLabel(table.planks).toLowerCase()} - najpierw je zabierz`);
                return true;
            }
            const room = TABLE_CAPACITY - table.count;
            const slot = inventory.selected;
            const held = inventory.get(slot)?.count ?? 0;
            const moved = this.game.mode === 'adventure' ? Math.min(room, held) : room;
            if (moved <= 0) {
                this.game.onNotice?.('Stół jest pełny (64 deski)');
                return true;
            }
            if (this.game.mode === 'adventure') inventory.take(slot, moved);
            table.planks = selected;
            table.count += moved;
            this.version++;
            this.game.playBlockSound?.('place', selected, a);
            return true;
        }
        if (table.count > 0) {
            const added = this.give(table.planks, table.count);
            if (added === 0) {
                this.game.onNotice?.('Ekwipunek pełny');
                return true;
            }
            table.count -= added;
            if (table.count === 0) table.planks = null;
            this.version++;
            this.game.playBlockSound?.('step', 'oak_planks', a);
            return true;
        }
        this.game.onNotice?.('Połóż deski na lewej części stołu (PPM deskami)');
        return true;
    }

    // Ile sztuk naprawdę trafiło do ekwipunku (w kreatywnym też do niego).
    give(type, count) {
        const inventory = this.game.inventory;
        let added = 0;
        while (added < count && inventory.canAdd(type)) {
            const batch = Math.min(count - added, 64);
            const left = inventory.add(type, batch);
            const put = batch - (typeof left === 'number' ? left : 0);
            if (put <= 0) break;
            added += put;
        }
        return added;
    }

    // Wyrób pod punktem trafienia w część B (numer z TABLE_PRODUCTS) albo -1.
    productUnder(a, hit) {
        const point = hit.point;
        if (!point || hit.normal?.y !== 1) return -1;
        const b = this.partB(a);
        let fx = point.x - b.x, fz = point.z - b.z;
        // Do układu stołu przodem na północ.
        const toNorth = { north: (u, v) => [u, v], east: (u, v) => [v, 1 - u], south: (u, v) => [1 - u, 1 - v], west: (u, v) => [1 - v, u] }[a.facing];
        [fx, fz] = toNorth(fx, fz);
        if (fx < 0 || fx > 1 || fz < 0 || fz > 1) return -1;
        // Patrzący od przodu (z -z) ma po lewej +x.
        const column = fx > 0.5 ? 0 : 1;
        const row = fz < 0.5 ? 0 : 1;
        return productAt(column, row);
    }

    takeProduct(a, hit, sneaking) {
        // Pusty stół podwójnego warsztatu - dodatkowe wyroby z desek drugiego.
        const supplier = this.supplierOf(a);
        const table = supplier ? this.state(supplier) : this.state(a);
        if (!table?.count) {
            this.game.onNotice?.('Połóż deski na lewej części stołu (PPM deskami)');
            return true;
        }
        const index = this.productUnder(a, hit);
        const product = (supplier ? BENCH_PRODUCTS : TABLE_PRODUCTS)[index];
        if (!product) {
            this.game.onNotice?.(supplier ? 'Kliknij drzwi albo klapę na blacie' : 'Kliknij wyrób na blacie (schody, półblok, płot, furtka)');
            return true;
        }
        const wood = woodOfPlanks(table.planks).wood;
        const type = shapeBaseType(wood, product.kind);
        if (table.count < product.planks) {
            this.game.onNotice?.(`${getItemLabel(type)}: potrzeba ${product.planks} desek (na stole ${table.count})`);
            return true;
        }
        const batches = sneaking ? Math.floor(table.count / product.planks) : 1;
        let made = 0;
        for (let i = 0; i < batches; i++) {
            if (!this.game.inventory.canAdd(type)) break;
            const added = this.give(type, product.count);
            if (added === 0) break;
            table.count -= product.planks;
            made += added;
        }
        if (made === 0) {
            this.game.onNotice?.('Ekwipunek pełny');
            return true;
        }
        if (table.count === 0) table.planks = null;
        this.version++;
        this.game.playBlockSound?.('place', table.planks ?? 'oak_planks', this.partB(a));
        this.game.achieve?.('carpentry', { type, count: made, kind: product.kind });
        this.game.onNotice?.(`${getItemLabel(type)} × ${made}`);
        return true;
    }

    update(dt) {
        // Deski na stołach, których już nie ma (np. wybuch, komenda).
        for (const [key, table] of this.tables) {
            const world = this.world;
            if (!world.getChunk(world.toChunkCoord(table.x), world.toChunkCoord(table.z))) continue;
            if (shapeInfo(world.getBlockId(table.x, table.y, table.z))?.part !== 'a') {
                this.tables.delete(key);
                this.version++;
            }
        }
        this.renderer?.update(dt);
    }

    dispose() { this.renderer?.dispose(); }
}

