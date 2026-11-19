// ------------------------------------------------------------
// STÓŁ KRAWIECKI (1.27.0, pomysł Kamila - "na zasadzie stołu
// stolarskiego")
//
// Długi na dwa bloki. Praca na blacie, w świecie (bez okna), jak przy
// stole stolarskim (CarpenterTables.js):
//
// Lewa część (A) - materiał:
//   - PPM włóknem, płótnem albo ubraniem - kładzie jedną sztukę, z kucaniem
//     cały stos (jeden rodzaj naraz; ubranie - zawsze jedno),
//   - PPM barwnikiem - barwi to, co leży: płótno (kolor wszystkich ubrań,
//     które się z niego uszyje) albo gotowe ubranie; z kucaniem - kolor
//     wzoru. Jeden barwnik na raz,
//   - PPM czymś innym albo pustą ręką - zabiera materiał z powrotem,
//     z kucaniem - zmienia wzór (gładki, paski, krata, haft).
//
// Prawa część (B) - wyroby:
//   - na włóknie: płótno; PPM tka jedno płótno z dwóch włókien (kucanie -
//     ile się da),
//   - na płótnie: cztery wykroje - z tyłu głowa i tułów, z przodu nogi
//     i stopy (clothing.js - PRODUCT_SLOTS), od razu w kolorach i we
//     wzorze. PPM w wykrój - szyje; z kucaniem - zmienia krój na tym
//     miejscu (np. czapka -> chusta -> opaska).
//
// Barwy i wzór płótna należą do stołu: znikają, gdy płótna zabraknie albo
// gracz je zabierze. Stół z czymś na blacie najpierw trzeba opróżnić,
// żeby go rozbić. Stan stołów zapisuje się ze światem
// (worldInfo.sewingTables), w grze ze znajomymi - net/StateSync.js.
// Co leży na blacie, rysuje rendering/SewingTableRenderer.js.
// ------------------------------------------------------------

import { AIR_ID, isReplaceableId, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { shapeInfo, FACING_VECTOR, oppositeFacing, lookFacing, rightOf } from '../blocks/woodShapes.js';
import { sewingTableId } from '../blocks/sewingTable.js';
import { getItemLabel } from '../items/ItemRegistry.js';
import {
    GARMENTS, CLOTHS, PRODUCT_SLOTS, PATTERNS, PATTERN_ORDER, FIBERS_PER_CLOTH,
    clothOf, clothFromFiber, garmentType, isGarment, isTableMaterial,
    kindsForSlot, nextOf, cleanLook, dyeOfItem, DYE_COLORS
} from '../items/clothing.js';
import { cleanItem } from './Inventory.js';
import { productAt } from './CarpenterTables.js';
import { SewingTableRenderer } from '../rendering/SewingTableRenderer.js';

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;

// Dźwięk materiału na blacie (miękki - jak posłanie, blocks/bedding.js).
const CLOTH_SOUND = 'grass';

// Najwięcej materiału na blacie (jak desek na stole stolarskim).
export const SEWING_CAPACITY = 64;

const color = (key) => (typeof key === 'string' && Object.hasOwn(DYE_COLORS, key) ? key : null);

// Kroje na start (pierwsze z listy dla płótna).
function defaultCuts() {
    return { head: 'cap', body: 'shirt', legs: 'trousers', feet: 'boots' };
}

export function restoreSewingTable(value) {
    if (!value || ![value.x, value.y, value.z].every(Number.isInteger)) return null;
    const material = cleanItem(value.material);
    const cuts = defaultCuts();
    for (const slot of Object.keys(cuts)) {
        if (Object.hasOwn(GARMENTS, value.cuts?.[slot] ?? '') && GARMENTS[value.cuts[slot]].slot === slot) cuts[slot] = value.cuts[slot];
    }
    return {
        x: value.x, y: value.y, z: value.z,
        material: material && isTableMaterial(material.type) ? { ...material, count: Math.min(SEWING_CAPACITY, material.count) } : null,
        main: color(value.main), accent: color(value.accent),
        pattern: Object.hasOwn(PATTERNS, value.pattern ?? '') ? value.pattern : 'plain',
        cuts
    };
}

export function sewingTableState(table) {
    const { x, y, z, material, main, accent, pattern, cuts } = table;
    return { x, y, z, material: material ? { ...material } : null, main, accent, pattern, cuts: { ...cuts } };
}

// Krój na miejscu `slot` dla tego płótna (zapamiętany albo pierwszy).
export function cutFor(table, cloth, slot) {
    const kinds = kindsForSlot(cloth, slot);
    return kinds.includes(table.cuts?.[slot]) ? table.cuts[slot] : kinds[0] ?? null;
}

// Wyroby na części B: dla każdej ćwiartki (PRODUCT_SLOTS) - przedmiot,
// który powstanie (z kolorami), ile płótna potrzeba i czy starczy.
export function sewingProducts(table) {
    const material = table.material;
    const cloth = clothOf(material?.type);
    if (!cloth) return [];
    const look = cleanLook({ pattern: table.pattern, main: table.main, accent: table.pattern === 'plain' ? null : table.accent });
    return PRODUCT_SLOTS.map((slot) => {
        const kind = cutFor(table, cloth, slot);
        if (!kind) return null;
        return { slot, kind, cost: GARMENTS[kind].cost, enough: material.count >= GARMENTS[kind].cost,
            item: { type: garmentType(kind, cloth), count: 1, look } };
    });
}

export class SewingTables {

    constructor(game, saved = []) {
        this.game = game;
        this.tables = new Map();
        this.version = 0;
        for (const value of Array.isArray(saved) ? saved : []) {
            const table = restoreSewingTable(value);
            if (table?.material) this.tables.set(keyOf(table), table);
        }
        this.renderer = game.scene ? new SewingTableRenderer(game, this) : null;
    }

    get world() { return this.game.world; }

    getState() {
        return [...this.tables.values()].filter((table) => table.material).map(sewingTableState);
    }

    // Część A stołu dla dowolnej części (z kierunkiem) albo null.
    tableAt({ x, y, z }) {
        const info = shapeInfo(this.world.getBlockId(x, y, z));
        if (info?.kind !== 'sewing') return null;
        if (info.part === 'a') return { x, y, z, facing: info.facing };
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(info.facing))];
        return { x: x - dx, y, z: z - dz, facing: info.facing };
    }

    partB(a) {
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(a.facing))];
        return { x: a.x + dx, y: a.y, z: a.z + dz };
    }

    state(a, create = false) {
        const key = keyOf(a);
        let table = this.tables.get(key);
        if (!table && create) {
            table = { x: a.x, y: a.y, z: a.z, material: null, main: null, accent: null, pattern: 'plain', cuts: defaultCuts() };
            this.tables.set(key, table);
        }
        return table ?? null;
    }

    cellFree({ x, y, z }) {
        const id = this.world.getBlockId(x, y, z);
        return id === AIR_ID || isReplaceableId(id);
    }

    // Stawianie: obie części albo nic (jak stół stolarski). Zwraca typ
    // części A albo false.
    place(target, yaw, player) {
        const look = lookFacing(yaw);
        const facing = oppositeFacing(look);
        const [dx, dz] = FACING_VECTOR[rightOf(look)];
        const b = { x: target.x + dx, y: target.y, z: target.z + dz };
        for (const cell of [target, b]) {
            if (!this.cellFree(cell)) return false;
            if (player?.intersectsBlock(cell.x, cell.y, cell.z)) return false;
        }
        const typeA = getBlockTypeById(sewingTableId(facing, 'a'));
        const typeB = getBlockTypeById(sewingTableId(facing, 'b'));
        if (!this.world.setBlock(target.x, target.y, target.z, typeA)) return false;
        if (!this.world.setBlock(b.x, b.y, b.z, typeB)) {
            this.world.setBlock(target.x, target.y, target.z, null);
            return false;
        }
        this.version++;
        return typeA;
    }

    canBreak(position) {
        const a = this.tableAt(position);
        return !a || !this.state(a)?.material;
    }

    // Po rozbiciu jednej części znika druga (stół daje się raz).
    broken(position, info) {
        if (info?.kind !== 'sewing') return;
        const [dx, dz] = FACING_VECTOR[rightOf(oppositeFacing(info.facing))];
        const sign = info.part === 'a' ? 1 : -1;
        const other = { x: position.x + dx * sign, y: position.y, z: position.z + dz * sign };
        const otherInfo = shapeInfo(this.world.getBlockId(other.x, other.y, other.z));
        if (otherInfo?.kind === 'sewing' && otherInfo.part !== info.part) this.world.setBlock(other.x, other.y, other.z, null);
        const a = info.part === 'a' ? position : other;
        if (this.tables.delete(keyOf(a))) this.version++;
    }

    // PPM w stół. true - obsłużone.
    interact(hit, selected, sneaking = false) {
        if (!hit?.hit) return false;
        const info = shapeInfo(this.world.getBlockId(hit.block.x, hit.block.y, hit.block.z));
        if (info?.kind !== 'sewing') return false;
        const a = this.tableAt(hit.block);
        const table = this.state(a, true);
        if (info.part === 'a') return this.useMaterial(a, table, selected, sneaking);
        return this.useProducts(a, table, hit, sneaking);
    }

    // --- Część A: materiał --------------------------------------------

    useMaterial(a, table, selected, sneaking) {
        const game = this.game;
        if (dyeOfItem(selected)) return this.dye(a, table, selected, sneaking);
        if (isTableMaterial(selected)) return this.putMaterial(a, table, sneaking);
        if (sneaking && table.material) return this.nextPattern(a, table);
        if (table.material) return this.takeMaterial(a, table);
        game.onNotice?.('Połóż na lewej części stołu włókno, płótno albo ubranie (PPM)');
        return true;
    }

    putMaterial(a, table, sneaking) {
        const game = this.game, inventory = game.inventory;
        const slot = inventory.selected;
        const held = inventory.get(slot);
        if (!held) return true;
        const material = table.material;
        if (material && (material.type !== held.type || isGarment(held.type))) {
            game.onNotice?.(`Na stole leży już ${getItemLabel(material.type).toLowerCase()} - najpierw je zabierz`);
            return true;
        }
        const room = SEWING_CAPACITY - (material?.count ?? 0);
        const moved = Math.min(room, isGarment(held.type) ? 1 : sneaking ? held.count : 1);
        if (moved <= 0) {
            game.onNotice?.('Na stole nie zmieści się więcej');
            return true;
        }
        if (material) material.count += moved;
        else {
            table.material = { ...held, count: moved };
            // Nowe płótno - bez barw poprzedniego.
            table.main = null;
            table.accent = null;
        }
        if (game.mode === 'adventure') inventory.take(slot, moved);
        this.version++;
        game.playBlockSound?.('place', CLOTH_SOUND, a);
        if (!material) game.onNotice?.(this.hint(table));
        return true;
    }

    // Podpowiedź po położeniu materiału.
    hint(table) {
        const type = table.material?.type;
        if (clothFromFiber(type)) return 'PPM w prawą część stołu - tkanie płótna (z kucaniem - ile się da)';
        if (clothOf(type)) return 'PPM w wykrój - szycie, z kucaniem - inny krój. Barwnik na płótno - kolor, z kucaniem - kolor wzoru';
        if (isGarment(type)) return 'Barwnik w rękę i PPM na ubranie - kolor (z kucaniem - kolor wzoru); kucanie i PPM pustą ręką - inny wzór';
        return '';
    }

    takeMaterial(a, table) {
        const game = this.game, material = table.material;
        const left = game.inventory.addItem(material);
        if (left === material.count) {
            game.onNotice?.('Ekwipunek pełny');
            return true;
        }
        material.count = left;
        if (left <= 0) this.clear(table);
        this.version++;
        game.playBlockSound?.('step', CLOTH_SOUND, a);
        return true;
    }

    clear(table) {
        table.material = null;
        table.main = null;
        table.accent = null;
    }

    // Barwnik: kolor płótna na stole albo gotowego ubrania (kucanie - wzoru).
    dye(a, table, selected, sneaking) {
        const game = this.game, material = table.material;
        const key = dyeOfItem(selected);
        if (!material || clothFromFiber(material.type)) {
            game.onNotice?.('Barwnik kładzie się na płótno albo na gotowe ubranie');
            return true;
        }
        if (isGarment(material.type)) {
            const look = cleanLook(material.look);
            if ((sneaking ? look.accent : look.main) === key) return true;
            if (sneaking && look.pattern === 'plain') look.pattern = 'stripes';
            material.look = cleanLook({ ...look, [sneaking ? 'accent' : 'main']: key });
            game.achieve?.('sewn', { type: material.type, look: material.look, mode: 'dye' });
        }
        else {
            if ((sneaking ? table.accent : table.main) === key) return true;
            if (sneaking) {
                table.accent = key;
                if (table.pattern === 'plain') table.pattern = 'stripes';
            }
            else table.main = key;
        }
        if (game.mode === 'adventure') game.inventory.take(game.inventory.selected, 1);
        this.version++;
        game.playBlockSound?.('place', CLOTH_SOUND, a);
        game.onNotice?.(`${sneaking ? 'Kolor wzoru' : 'Kolor'}: ${getItemLabel(selected).replace(/^Barwnik /, '')}`);
        return true;
    }

    nextPattern(a, table) {
        const game = this.game, material = table.material;
        if (clothFromFiber(material.type)) return this.takeMaterial(a, table);
        const garment = isGarment(material.type);
        const current = garment ? cleanLook(material.look).pattern : table.pattern;
        const pattern = nextOf(PATTERN_ORDER, current);
        if (garment) material.look = cleanLook({ ...cleanLook(material.look), pattern });
        else table.pattern = pattern;
        this.version++;
        game.playBlockSound?.('step', CLOTH_SOUND, a);
        game.onNotice?.(`Wzór: ${PATTERNS[pattern].label}`);
        return true;
    }

    // --- Część B: wyroby ------------------------------------------------

    useProducts(a, table, hit, sneaking) {
        const game = this.game, type = table.material?.type;
        if (!type) {
            game.onNotice?.('Najpierw połóż materiał na lewej części stołu');
            return true;
        }
        if (clothFromFiber(type)) return this.weave(a, table, sneaking);
        if (isGarment(type)) {
            game.onNotice?.('Ubranie barwisz na lewej części stołu: barwnik w rękę i PPM na ubranie');
            return true;
        }
        const index = this.productUnder(a, hit);
        const product = sewingProducts(table)[index];
        if (index < 0 || product === undefined) {
            game.onNotice?.('Kliknij wykrój na blacie');
            return true;
        }
        const slot = PRODUCT_SLOTS[index];
        if (sneaking) return this.nextCut(a, table, slot);
        if (!product) {
            game.onNotice?.(`Z tego materiału nie uszyjesz nic na ${{ head: 'głowę', body: 'tułów', legs: 'nogi', feet: 'stopy' }[slot]}`);
            return true;
        }
        return this.sew(a, table, product);
    }

    // Ćwiartka pod punktem trafienia w część B (jak w stole stolarskim).
    productUnder(a, hit) {
        const point = hit.point;
        if (!point || hit.normal?.y !== 1) return -1;
        const b = this.partB(a);
        let fx = point.x - b.x, fz = point.z - b.z;
        const toNorth = { north: (u, v) => [u, v], east: (u, v) => [v, 1 - u], south: (u, v) => [1 - u, 1 - v], west: (u, v) => [1 - v, u] }[a.facing];
        [fx, fz] = toNorth(fx, fz);
        if (fx < 0 || fx > 1 || fz < 0 || fz > 1) return -1;
        return productAt(fx > 0.5 ? 0 : 1, fz < 0.5 ? 0 : 1);
    }

    weave(a, table, sneaking) {
        const game = this.game, material = table.material;
        const cloth = CLOTHS[clothFromFiber(material.type)].item;
        let woven = 0;
        while (material.count >= FIBERS_PER_CLOTH && game.inventory.canAdd(cloth, 1)) {
            game.inventory.add(cloth, 1);
            material.count -= FIBERS_PER_CLOTH;
            woven++;
            if (!sneaking) break;
        }
        if (woven === 0) {
            game.onNotice?.(material.count < FIBERS_PER_CLOTH ? `Na płótno potrzeba ${FIBERS_PER_CLOTH} włókien` : 'Ekwipunek pełny');
            return true;
        }
        if (material.count <= 0) this.clear(table);
        this.version++;
        game.playBlockSound?.('place', CLOTH_SOUND, this.partB(a));
        game.achieve?.('woven', { count: woven, cloth });
        game.onNotice?.(`${getItemLabel(cloth)} × ${woven}`);
        return true;
    }

    nextCut(a, table, slot) {
        const game = this.game, cloth = clothOf(table.material.type);
        const kinds = kindsForSlot(cloth, slot);
        if (kinds.length < 2) {
            game.onNotice?.(kinds.length ? `Z tego płótna na to miejsce jest tylko ${GARMENTS[kinds[0]].label.toLowerCase()}` : 'Z tego materiału nic tu nie uszyjesz');
            return true;
        }
        table.cuts[slot] = nextOf(kinds, cutFor(table, cloth, slot));
        this.version++;
        game.playBlockSound?.('step', CLOTH_SOUND, this.partB(a));
        game.onNotice?.(`Krój: ${GARMENTS[table.cuts[slot]].label.toLowerCase()} (${GARMENTS[table.cuts[slot]].cost} płót.)`);
        return true;
    }

    sew(a, table, product) {
        const game = this.game, material = table.material;
        if (!product.enough) {
            game.onNotice?.(`${getItemLabel(product.item.type)}: potrzeba ${product.cost} płócien (na stole ${material.count})`);
            return true;
        }
        const { type, look } = product.item;
        if (!game.inventory.canAdd(type, 1, undefined, look)) {
            game.onNotice?.('Ekwipunek pełny');
            return true;
        }
        game.inventory.add(type, 1, undefined, undefined, undefined, look);
        material.count -= product.cost;
        if (material.count <= 0) this.clear(table);
        this.version++;
        game.playBlockSound?.('place', CLOTH_SOUND, this.partB(a));
        game.achieve?.('sewn', { type, look, mode: 'sew' });
        game.onNotice?.(`${getItemLabel(type)} - uszyte`);
        return true;
    }

    update(dt) {
        // Stoły, których już nie ma (wybuch, komenda) - zapominamy.
        const world = this.world;
        for (const [key, table] of this.tables) {
            if (!world.getChunk(world.toChunkCoord(table.x), world.toChunkCoord(table.z))) continue;
            if (shapeInfo(world.getBlockId(table.x, table.y, table.z))?.kind !== 'sewing') {
                this.tables.delete(key);
                this.version++;
            }
        }
        this.renderer?.update(dt);
    }

    dispose() { this.renderer?.dispose(); }
}

