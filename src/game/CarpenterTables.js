import { getBlockTypeById, isReplaceableId, AIR_ID } from '../blocks/BlockRegistry.js';
import { shapeInfo, shapeId, shapeBaseType, FACING_VECTOR, oppositeFacing, lookFacing, rightOf } from '../blocks/woodShapes.js';
import { woodOfPlanks } from '../blocks/woods.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import { CarpenterTableRenderer } from '../rendering/CarpenterTableRenderer.js';

// ------------------------------------------------------------
// STÓŁ STOLARSKI (0.90.0)
//
// Długi na dwa bloki. Praca na blacie, w świecie (bez okna):
// - PPM deskami w lewą część stołu (A) - na blat kładzie się jedna deska,
//   a z kucaniem cały stos z ręki (0.93.0; do 64, jeden rodzaj naraz),
// - na prawej części (B) pojawiają się wyroby z tego drewna: schody,
//   półblok, płot i furtka (te, na które starczy desek). PPM w wyrób -
//   zabiera partię do ekwipunku (Shift - tyle, ile się da),
// - PPM pustą ręką (albo czymś innym) w deski - zabiera je z powrotem,
// - stół z deskami na blacie najpierw trzeba opróżnić, żeby go rozbić.
// Deski na stołach zapisują się ze światem (worldInfo.carpenterTables).
// Furtka: PPM otwiera i zamyka (od gracza).
//
// Podwójny warsztat (0.91.0, układ z 0.93.0): dwa stoły jeden za drugim
// (razem 2 x 2 bloki). Gdy na jednym leżą deski, a drugi jest pusty,
// cały blat służy drzwiom i klapom (zwykłych wyrobów wtedy nie ma):
// - blok z deskami zostaje (część A stołu z deskami),
// - obok niego, na drugim stole - klapa w prawdziwym rozmiarze (1 blok),
// - dwa pozostałe bloki - drzwi w prawdziwym rozmiarze (leżą, 1 x 2).
// PPM w drzwi albo klapę zabiera partię (bench()). Drzwi (dwa bloki)
// i klapy w świecie - PPM otwiera i zamyka; drzwi z animacją (DoorRenderer.js).
// ------------------------------------------------------------

export const TABLE_CAPACITY = 64;

// Wyroby: ile desek idzie na partię i ile sztuk z niej wychodzi.
export const TABLE_PRODUCTS = [
    { kind: 'stairs', planks: 3, count: 2 },
    { kind: 'slab', planks: 1, count: 2 },
    { kind: 'fence', planks: 3, count: 2 },
    { kind: 'gate', planks: 4, count: 1 }
];

// Wyroby podwójnego warsztatu (zamiast zwykłych).
export const BENCH_PRODUCTS = {
    door: { kind: 'door', planks: 6, count: 3 },
    trapdoor: { kind: 'trapdoor', planks: 3, count: 1 }
};

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

    // Układ podwójnego warsztatu, do którego należy stół "a", albo null
    // (stół sam, oba puste albo na obu leżą deski - wtedy każdy osobno):
    // { primary - stół z deskami, planks - blok z deskami, trapdoor - blok
    // klapy (drugi stół, obok desek), door - dwa bloki drzwi }.
    bench(a) {
        const partner = this.partnerOf(a);
        if (!partner) return null;
        const mine = this.state(a)?.count > 0, theirs = this.state(partner)?.count > 0;
        if (mine === theirs) return null;
        const primary = mine ? a : partner, other = mine ? partner : a;
        const planks = { x: primary.x, y: primary.y, z: primary.z };
        const cells = [{ x: other.x, y: other.y, z: other.z }, this.partB(other)];
        const beside = (cell) => Math.abs(cell.x - planks.x) + Math.abs(cell.z - planks.z) === 1;
        const trapdoor = cells.find(beside), far = cells.find((cell) => !beside(cell));
        if (!trapdoor || !far) return null;
        return { primary, other, planks, trapdoor, door: [this.partB(primary), far] };
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
        // Podwójny warsztat: deski, klapa albo drzwi - według bloku blatu.
        const bench = this.bench(a);
        if (bench) {
            const at = (cell) => cell.x === x && cell.z === z;
            if (at(bench.planks)) return this.usePlanks(bench.primary, selected, sneaking);
            return this.make(this.state(bench.primary), BENCH_PRODUCTS[at(bench.trapdoor) ? 'trapdoor' : 'door'], sneaking, hit.block);
        }
        if (info.part === 'a') return this.usePlanks(a, selected, sneaking);
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

    // Deski na blat (jedna; z kucaniem - cały stos z ręki) albo z powrotem
    // do ekwipunku.
    usePlanks(a, selected, sneaking = false) {
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
            const stack = this.game.mode === 'adventure' ? held : Math.max(held, 1);
            const moved = Math.min(room, sneaking ? stack : 1);
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
        const table = this.state(a);
        if (!table?.count) {
            this.game.onNotice?.('Połóż deski na lewej części stołu (PPM deskami)');
            return true;
        }
        const product = TABLE_PRODUCTS[this.productUnder(a, hit)];
        if (!product) {
            this.game.onNotice?.('Kliknij wyrób na blacie (schody, półblok, płot, furtka)');
            return true;
        }
        return this.make(table, product, sneaking, this.partB(a));
    }

    // Partia wyrobu z desek stołu do ekwipunku (kucanie - ile się da).
    make(table, product, sneaking, at) {
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
        this.game.playBlockSound?.('place', table.planks ?? 'oak_planks', at);
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

