// ------------------------------------------------------------
// DRZEWO JAKO JEDEN BYT - ROZPOZNANIE (1.36.0, docs/scinanie.md)
//
// Świat nie pamięta, które bloki są jednym drzewem. Gra ustala to
// dopiero przy ciosie siekiery, z samych bloków:
//
//   1. KŁODY: wszystkie pnie tego gatunku połączone z uderzonym
//      (także rogami).
//   2. KORZENIE: kłody stojące na gruncie. Od nich liczy się droga do
//      każdej kłody - każda "wisi" na tej, przez którą droga jest
//      najkrótsza. Tak powstaje drzewo zależności: pień, konary, gałęzie.
//   3. CIĘCIE: przekrój pnia na wysokości ciosu (albo jedna kłoda
//      konara). SPADA to, co na nim wisiało.
//   4. LIŚCIE: te, którym bliżej do spadających kłód niż do jakiejkolwiek
//      innej kłody tego gatunku (pniak, sąsiednie drzewo).
//
// Żywe drzewo od ściany z pni odróżnia korona: przy kłodach muszą być
// liście gatunku. Słup z pni postawiony ręką kopie się jak dotąd.
//
// Czyste funkcje - świat to cokolwiek z getBlockId(x, y, z)
// (tools/sprawdz_scinania.mjs).
// ------------------------------------------------------------

import {
    getBlockDefinition,
    getBlockTypeById,
    getBlockId,
    isLeavesId,
    isSolidId,
    isPlantId,
    isReplaceableId,
    isLiquidId,
    getAttach
} from '../blocks/BlockRegistry.js';
import { lyingLogType } from '../blocks/lyingLogs.js';

// Najwięcej kłód jednego drzewa i najdalej od ciosu (w poziomie).
export const MAX_LOGS = 12000;
export const MAX_REACH = 40;
// Liść należy do drzewa najdalej tyle bloków od jego kłody.
export const LEAF_REACH = 14;
// Żywe drzewo: przynajmniej tyle liści przy kłodach.
export const LIVING_LEAVES = 3;
// Koszty drogi po kłodach: przez ścianę, krawędź, róg.
const COST = [0, 2, 3, 4];

// Drzewa, które nie padają: kosodrzewina (krzew - rąbie się na gałęzie)
// i baobab (za gruby na jakąkolwiek siekierę).
export const NO_FELLING = { mugo: 'krzew', baobab: 'olbrzym' };

// Rodzaj bloku: 1 - kłoda gatunku, 2 - liście / korzenie gatunku, 0 - reszta.
const kinds = new Map();
function kindOf(id) {
    let kind = kinds.get(id);
    if (kind === undefined) {
        const definition = getBlockDefinition(getBlockTypeById(id));
        kind = !definition?.tree ? null
            : definition.part === 'log' ? { tree: definition.tree, log: true }
            : definition.part === 'leaves' || definition.part === 'roots' ? { tree: definition.tree, log: false }
            : null;
        kinds.set(id, kind);
    }
    return kind;
}

// Gatunek kłody żywego drzewa pod numerem bloku albo null.
export function logSpecies(id) {
    const kind = kindOf(id);
    return kind?.log ? kind.tree : null;
}

const keyOf = (x, y, z) => `${x},${y},${z}`;

// Grunt pod kłodą: coś stałego, co nie jest liśćmi ani kłodą.
function isGround(id) {
    return id !== 0 && isSolidId(id) && !isLeavesId(id) && !kindOf(id)?.log;
}

const NEIGHBOURS = [];
for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
    const rank = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
    if (rank > 0) NEIGHBOURS.push([dx, dy, dz, COST[rank]]);
}
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];


// Drzewo, do którego należy kłoda (x, y, z), przecięte w tym miejscu.
// null - to nie kłoda żywego drzewa. Inaczej:
//   species, living (ma koronę), prop (podpora - nie główny pień),
//   blocked (powód z NO_FELLING), trunk (cięcie pnia, nie konara),
//   cut [{x, y, z}] - przekrój, width - grubość pnia w blokach,
//   falling [{x, y, z, id}] - kłody, które spadną,
//   stump [{x, y, z}] - kłody, które zostaną po ścięciu pnia (pniak),
//   key - stała nazwa miejsca cięcia, top - wysokość spadającej części.
export function scanTree(world, x, y, z) {

    const species = logSpecies(world.getBlockId(x, y, z));
    if (!species) return null;

    // 1. Kłody.
    const cells = new Map();
    const list = [];
    const add = (cx, cy, cz, id) => { const cell = { x: cx, y: cy, z: cz, id, cost: Infinity, parent: null, root: null }; cells.set(keyOf(cx, cy, cz), cell); list.push(cell); return cell; };
    add(x, y, z, world.getBlockId(x, y, z));
    let leaves = 0;
    for (let i = 0; i < list.length && list.length < MAX_LOGS; i++) {
        const cell = list[i];
        for (const [dx, dy, dz] of NEIGHBOURS) {
            const nx = cell.x + dx, ny = cell.y + dy, nz = cell.z + dz;
            if (Math.abs(nx - x) > MAX_REACH || Math.abs(nz - z) > MAX_REACH || cells.has(keyOf(nx, ny, nz))) continue;
            const id = world.getBlockId(nx, ny, nz);
            const kind = id === 0 ? null : kindOf(id);
            if (kind?.tree !== species) continue;
            if (kind.log) add(nx, ny, nz, id);
            else if (leaves < LIVING_LEAVES) leaves++;
        }
    }
    const result = { species, living: leaves >= LIVING_LEAVES, prop: false, blocked: NO_FELLING[species] ?? null,
        trunk: false, cut: [], width: 1, falling: [], stump: [], key: keyOf(x, y, z), top: 0 };
    if (!result.living || result.blocked) return result;

    // 2. Korzenie i drogi od nich.
    const roots = list.filter((cell) => !cells.has(keyOf(cell.x, cell.y - 1, cell.z)) && isGround(world.getBlockId(cell.x, cell.y - 1, cell.z)));
    if (roots.length === 0) { result.living = false; return result; }
    // Kolejka kubełkowa: koszty to małe liczby całkowite.
    const buckets = [roots.slice()];
    for (const root of roots) { root.cost = 0; root.root = root; }
    for (let cost = 0; cost < buckets.length; cost++) {
        const bucket = buckets[cost];
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) {
            const cell = bucket[i];
            if (cell.cost !== cost) continue;
            for (const [dx, dy, dz, step] of NEIGHBOURS) {
                const next = cells.get(keyOf(cell.x + dx, cell.y + dy, cell.z + dz));
                if (!next || next.cost <= cost + step) continue;
                next.cost = cost + step; next.parent = cell; next.root = cell.root;
                (buckets[next.cost] ??= []).push(next);
            }
        }
    }

    // Grupy korzeni (sąsiadujące w poziomie); główny pień to największa.
    const groupOf = new Map();
    const groups = [];
    for (const root of roots) {
        if (groupOf.has(root)) continue;
        const group = [root]; groupOf.set(root, group); groups.push(group);
        for (let i = 0; i < group.length; i++) {
            for (const other of roots) {
                if (!groupOf.has(other) && Math.abs(other.x - group[i].x) <= 1 && Math.abs(other.z - group[i].z) <= 1) { groupOf.set(other, group); group.push(other); }
            }
        }
    }
    const hit = cells.get(keyOf(x, y, z));
    if (!hit.root) { result.living = false; return result; }
    const own = groupOf.get(hit.root);
    if (groups.some((group) => group !== own && group.length > own.length)) { result.prop = true; return result; }

    // 3. Cięcie: przekrój pnia (kłody z kłodą nad albo pod sobą, obok
    // siebie na tej wysokości) albo jedna kłoda konara.
    const vertical = (cell) => cells.has(keyOf(cell.x, cell.y + 1, cell.z)) || cells.has(keyOf(cell.x, cell.y - 1, cell.z));
    const cut = [hit];
    if (vertical(hit)) {
        const seen = new Set([hit]);
        for (let i = 0; i < cut.length; i++) {
            for (const [dx, dz] of SIDES) {
                const next = cells.get(keyOf(cut[i].x + dx, y, cut[i].z + dz));
                if (next && !seen.has(next) && vertical(next)) { seen.add(next); cut.push(next); }
            }
        }
    }
    const cutSet = new Set(cut);
    // Co wisi na cięciu: kłody, których droga do korzenia idzie przez cięcie.
    const hangs = new Map();
    const hanging = (cell) => {
        const path = [];
        let at = cell, answer;
        while (true) {
            if (hangs.has(at)) { answer = hangs.get(at); break; }
            if (cutSet.has(at)) { answer = true; break; }
            if (!at.parent) { answer = false; break; }
            path.push(at); at = at.parent;
        }
        for (const passed of path) hangs.set(passed, answer);
        return answer;
    };
    // Cięcie głównego pnia kładzie całość: razem z tym, co stało na
    // podporach (banian) - podpory łamią się pod ciężarem korony.
    const mainCut = vertical(hit);
    let falling = list.filter((cell) => !cutSet.has(cell) && cell.root && (hanging(cell) || (mainCut && groupOf.get(cell.root) !== own)));
    // Pień: przekrój zostaje jako pniak. Konar (albo sam czubek) spada cały.
    result.trunk = mainCut && falling.length > 0;
    if (!result.trunk) falling = [...cut, ...falling];
    result.cut = cut.map(({ x: cx, y: cy, z: cz }) => ({ x: cx, y: cy, z: cz }));
    result.width = Math.max(1, Math.round(Math.sqrt(cut.length)));
    result.falling = falling.map((cell) => ({ x: cell.x, y: cell.y, z: cell.z, id: cell.id }));
    // Pniak (to, co zostaje z drzewa po ścięciu pnia) nie zatrzymuje liści.
    if (result.trunk) {
        const gone = new Set(falling);
        result.stump = list.filter((cell) => !gone.has(cell)).map((cell) => ({ x: cell.x, y: cell.y, z: cell.z }));
    }
    // Nazwa miejsca cięcia nie zależy od tego, w którą kłodę przekroju się bije.
    const first = cut.reduce((best, cell) => (cell.x < best.x || (cell.x === best.x && cell.z < best.z) ? cell : best), cut[0]);
    result.key = keyOf(first.x, y, first.z);
    result.top = falling.reduce((top, cell) => Math.max(top, cell.y - y), 0);
    return result;

}


// Liście (i korzenie powietrzne) spadające razem z kłodami `falling`:
// bliżej im do spadającej kłody niż do innej kłody gatunku. ignore -
// kłody, które się nie liczą (pniak ściętego drzewa: nic na nim nie
// zostaje). Zwraca [{x, y, z, id}].
export function fallingLeaves(world, species, falling, ignore = []) {

    if (falling.length === 0) return [];
    const fallKeys = new Set(falling.map((cell) => keyOf(cell.x, cell.y, cell.z)));
    for (const cell of ignore) fallKeys.add(keyOf(cell.x, cell.y, cell.z));
    const reach = LEAF_REACH;
    // Fala po liściach od podanych kłód: odległość każdego liścia.
    const spread = (seeds, limitTo = null) => {
        const distance = new Map();
        let wave = seeds;
        for (let d = 1; d <= reach && wave.length > 0; d++) {
            const next = [];
            for (const cell of wave) {
                for (const [dx, dy, dz] of NEIGHBOURS) {
                    const nx = cell.x + dx, ny = cell.y + dy, nz = cell.z + dz;
                    const key = keyOf(nx, ny, nz);
                    if (distance.has(key) || (limitTo && !limitTo.has(key))) continue;
                    const id = world.getBlockId(nx, ny, nz);
                    const kind = id === 0 ? null : kindOf(id);
                    if (kind?.tree !== species || kind.log) continue;
                    const leaf = { x: nx, y: ny, z: nz, id, d };
                    distance.set(key, leaf);
                    next.push(leaf);
                }
            }
            wave = next;
        }
        return distance;
    };
    const mine = spread(falling);
    if (mine.size === 0) return [];
    // Inne kłody gatunku przy tych liściach (pniak, sąsiednie drzewa).
    const others = [], seen = new Set();
    for (const leaf of mine.values()) {
        for (const [dx, dy, dz] of NEIGHBOURS) {
            const x = leaf.x + dx, y = leaf.y + dy, z = leaf.z + dz, key = keyOf(x, y, z);
            if (seen.has(key) || fallKeys.has(key)) continue;
            seen.add(key);
            const id = world.getBlockId(x, y, z);
            if (id !== 0 && kindOf(id)?.log && kindOf(id).tree === species) others.push({ x, y, z });
        }
    }
    const theirs = others.length > 0 ? spread(others, mine) : new Map();
    const result = [];
    for (const [key, leaf] of mine) {
        const other = theirs.get(key);
        if (!other || leaf.d < other.d) result.push({ x: leaf.x, y: leaf.y, z: leaf.z, id: leaf.id });
    }
    return result;

}


// Czy leżący pień może zająć to miejsce (łamie rośliny i liście,
// o budowle i skały się opiera).
export function trunkCanReplace(id) {
    return !isLiquidId(id) && (id === 0 || isPlantId(id) || isReplaceableId(id) || isLeavesId(id) || getAttach(id) !== 0);
}

// Kierunki upadku: [dx, dz] i oś leżącego pnia.
export const FALL_DIRECTIONS = {
    east: { dx: 1, dz: 0, axis: 'x' },
    west: { dx: -1, dz: 0, axis: 'x' },
    south: { dx: 0, dz: 1, axis: 'z' },
    north: { dx: 0, dz: -1, axis: 'z' }
};

// Strona świata najbliższa kierunkowi (x, z).
export function fallDirection(x, z) {
    return Math.abs(x) >= Math.abs(z) ? (x >= 0 ? 'east' : 'west') : (z >= 0 ? 'south' : 'north');
}

// Najwyżej tyle w dół i w górę leżący pień dopasowuje się do terenu
// między sąsiednimi metrami; dalej pęka (reszta spada jako kłody).
const STEP_UP = 1, STEP_DOWN = 3;

// Jak ułoży się ścięte drzewo.
//   scan - wynik scanTree (cięcie pnia), direction - nazwa z FALL_DIRECTIONS.
// Zwraca:
//   stem [poziomy] - ile kłód pnia na kolejnych metrach nad cięciem,
//   branches - ile kłód poza pniem (konary),
//   blocks [{x, y, z, type}] - leżący pień do postawienia,
//   loose [{x, y, z, count}] - kłody, które się nie zmieściły (przedmioty),
//   length - długość pnia w blokach, pieces - na ile odcinków pękł,
//   end {x, y, z} - gdzie upadł czubek (środek korony).
export function fellPlan(world, scan, direction) {

    const { dx, dz, axis } = FALL_DIRECTIONS[direction];
    const cutY = scan.cut[0].y;
    const byLevel = new Map();
    for (const cell of scan.falling) {
        if (!byLevel.has(cell.y)) byLevel.set(cell.y, []);
        byLevel.get(cell.y).push(cell);
    }
    // Pień: poziom po poziomie w górę, kłody tuż nad poprzednim poziomem
    // (krzywy pień może przesunąć się o blok).
    const stem = [];
    let previous = scan.cut, used = 0;
    for (let level = cutY + 1; byLevel.has(level); level++) {
        const here = byLevel.get(level).filter((cell) => previous.some((below) => Math.abs(below.x - cell.x) <= 1 && Math.abs(below.z - cell.z) <= 1));
        if (here.length === 0) break;
        // Nie grubszy niż przekrój cięcia (konar tuż przy pniu to nie pień).
        const count = Math.min(here.length, scan.cut.length);
        stem.push(count); used += count; previous = here;
    }
    const branches = scan.falling.length - used;

    // Oś pnia: środek przekroju. Leżący pień ma przekrój w × w.
    const width = scan.width;
    const minX = Math.min(...scan.cut.map((cell) => cell.x)), minZ = Math.min(...scan.cut.map((cell) => cell.z));
    const type = lyingLogType(scan.species, axis);
    const blocks = [], loose = [];
    let ground = cutY, pieces = 0, broken = true, length = 0;
    let end = { x: minX + 0.5, y: cutY, z: minZ + 0.5 };
    for (let i = 0; i < stem.length; i++) {
        // Grubość na tym metrze (pień cienieje ku górze).
        const thick = Math.max(1, Math.min(width, Math.round(Math.sqrt(stem[i]))));
        // Metr i od pniaka: zaraz za przekrojem po stronie upadku.
        const along = i + 1;
        const ax = (dx > 0 ? minX + width - 1 : minX) + dx * along;
        const az = (dz > 0 ? minZ + width - 1 : minZ) + dz * along;
        // Kolumny w poprzek pnia.
        const columns = [];
        for (let side = 0; side < thick; side++) columns.push({ x: ax + (dx === 0 ? side : 0), z: az + (dz === 0 ? side : 0) });
        // Poziom gruntu: najwyższy pod kolumnami tego metra.
        let level = null;
        for (let y = ground + STEP_UP; y >= ground - STEP_DOWN && y >= 1; y--) {
            const free = columns.every((c) => { for (let h = 0; h < thick; h++) if (!trunkCanReplace(world.getBlockId(c.x, y + h, c.z))) return false; return true; });
            const rests = columns.some((c) => !trunkCanReplace(world.getBlockId(c.x, y - 1, c.z)));
            if (free && rests) { level = y; break; }
            if (!free && y <= ground) break;
        }
        if (level === null) {
            // Przeszkoda albo urwisko: ten metr spada jako kłody.
            loose.push({ x: ax + 0.5, y: ground + 0.5, z: az + 0.5, count: stem[i] });
            broken = true;
            continue;
        }
        if (broken || level !== ground) pieces++;
        broken = false; ground = level; length++;
        for (const c of columns) for (let h = 0; h < thick; h++) blocks.push({ x: c.x, y: level + h, z: c.z, type });
        // Kłody ponad kwadrat w × w (nierówny przekrój) - luzem.
        if (stem[i] > thick * thick) loose.push({ x: ax + 0.5, y: level + thick + 0.5, z: az + 0.5, count: stem[i] - thick * thick });
        end = { x: ax + 0.5, y: level, z: az + 0.5 };
    }
    // Czubek korony: za końcem pnia.
    if (stem.length > 0) {
        const tipX = (dx > 0 ? minX + width - 1 : minX) + dx * stem.length + 0.5;
        const tipZ = (dz > 0 ? minZ + width - 1 : minZ) + dz * stem.length + 0.5;
        end = { x: tipX, y: end.y, z: tipZ };
    }
    return { stem, branches, blocks, loose, length, pieces, end, type, axis };

}

// Numer bloku leżącego pnia (dla testów i świata).
export function lyingLogId(species, axis) {
    return getBlockId(lyingLogType(species, axis));
}


// Ile ciosów kamienną siekierą trzeba, żeby przeciąć pień o twardości
// drewna `hardness` i grubości `width` bloków.
const WIDTH_FACTOR = [0, 1, 1.9, 3.4, 5];
export function chopsNeeded(hardness, width = 1) {
    const factor = WIDTH_FACTOR[Math.min(width, 4)] * (width > 4 ? width / 4 : 1);
    return Math.max(2, Math.round((1.6 * hardness - 0.2) * factor));
}

// Z ilu stron trzeba ciąć: cienki pień - z jednej, 2 × 2 - z dwóch,
// grubsze - z czterech. Jedna strona daje najwyżej tyle ciosów:
export function sidesNeeded(width) {
    return width <= 1 ? 1 : width === 2 ? 2 : 4;
}
export function sideLimit(hardness, width = 1) {
    return Math.ceil(chopsNeeded(hardness, width) / sidesNeeded(width));
}
