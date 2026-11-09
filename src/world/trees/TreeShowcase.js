import { CHUNK_HEIGHT, CHUNK_SIZE, WORLD_BORDER } from '../../config.js';
import {
    AIR_ID, getBlockId, getBlockTypeById, isLeavesId, isLiquidId,
    isPlantId, isReplaceableId, isSoilId
} from '../../blocks/BlockRegistry.js';
import { TREE_NAMES, TREE_SPECIES, packVariantType } from '../../blocks/trees.js';
import { buildTree, seededRandom, TREE_REACH } from './TreeShapes.js';

// Arboretum uses exactly the same geometry as naturally generated trees.
// Only the explicit state rows change leaves/resin; they keep the same seeds
// and silhouettes so differences can be compared directly.
export const TREE_SHOWCASE_MAX_COUNT = 36;
const SPACING = 18;
const SLICE_MS = 4;
const sessions = new WeakMap();
const disposed = new WeakSet();

export class TreeShowcaseError extends Error {}

const key = (x, y, z) => `${x},${y},${z}`;
const now = () => globalThis.performance?.now() ?? Date.now();
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
const cloneShape = (shape) => ({
    ...shape,
    blocks: shape.blocks.map((block) => [...block]),
    roots: shape.roots.map((root) => [...root]),
    litter: shape.litter.map((cell) => [...cell])
});

function states(species) {
    const result = [{ id: 'ordinary', label: 'zwykłe' }];
    if (species === 'pine') result.push({ id: 'resin', label: 'z żywicą' });
    if (species === 'linden') result.push({ id: 'flowering', label: 'kwitnąca' });
    for (const variant of TREE_SPECIES[species].pack?.variants ?? []) {
        result.push({ id: variant.key, label: variant.label, variant });
        if (variant.regrow) result.push({
            id: `${variant.key}_growing`, label: variant.afterLabel ?? `${variant.label} (po zbiorze)`,
            variant, regrowing: true
        });
    }
    return result;
}

function specimenShape(species, seed, size, state) {
    const shape = cloneShape(buildTree(species, seed, size));
    if (!state) return shape;

    const leaves = `${species}_leaves`;
    const original = shape.blocks.map((block) => block[3]);
    for (const block of shape.blocks) {
        if (isLeavesId(getBlockId(block[3]))) block[3] = leaves;
        if (block[3] === 'pine_log_resin') block[3] = 'pine_log';
    }
    if (state.id === 'resin') {
        const trunk = shape.blocks.find(([x, y, z, type]) => x === 0 && y === 2 && z === 0 && type === 'pine_log');
        if (trunk) trunk[3] = 'pine_log_resin';
    }
    if (state.id === 'flowering' || state.variant) {
        const type = state.id === 'flowering' ? 'linden_leaves_flowering'
            : packVariantType(species, state.variant.key) + (state.regrowing ? '_growing' : '');
        const sourceType = state.id === 'flowering' ? type : packVariantType(species, state.variant.key);
        const random = seededRandom(seed ^ 0x679263ab);
        const cells = new Set(shape.blocks.map(([x, y, z]) => key(x, y, z)));
        const outside = shape.blocks.map(([x, y, z, blockType], index) => {
            if (blockType !== leaves) return -1;
            return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
                .some(([dx, dy, dz]) => !cells.has(key(x + dx, y + dy, z + dz))) ? index : -1;
        }).filter((index) => index >= 0);
        let changed = 0;
        for (const index of outside) {
            if (original[index] === sourceType || random() < (state.variant?.share ?? 0.4)) {
                shape.blocks[index][3] = type;
                changed++;
            }
        }
        // A named state must be visible even on the smallest random crown.
        if (!changed && outside.length) shape.blocks[outside[0]][3] = type;
    }
    return shape;
}

export function createTreeShowcasePlan({ mode, species, count = 16, seed = 0 } = {}) {
    if (!['forest', 'variants', 'comparison'].includes(mode)) throw new TreeShowcaseError('Nieznany rodzaj pokazu drzew.');
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new TreeShowcaseError('Seed musi być liczbą całkowitą od 0 do 4294967295.');
    if (mode !== 'comparison' && !Object.hasOwn(TREE_SPECIES, species)) throw new TreeShowcaseError('Nieznany gatunek drzewa.');
    if (!Number.isInteger(count) || count < 1 || count > TREE_SHOWCASE_MAX_COUNT) throw new TreeShowcaseError(`Liczba drzew: od 1 do ${TREE_SHOWCASE_MAX_COUNT}.`);

    const random = seededRandom(seed);
    const specimens = [];
    const add = (name, size, treeSeed, dx, dz, state, label) => specimens.push({
        species: name, size, seed: treeSeed, dx, dz,
        variant: state?.id ?? 'natural', label,
        shape: specimenShape(name, treeSeed, size, state)
    });

    if (mode === 'forest') {
        const columns = Math.ceil(Math.sqrt(count));
        for (let i = 0; i < count; i++) {
            const dx = Math.round((i % columns - (columns - 1) / 2) * 22) + Math.floor(random() * 7) - 3;
            const dz = Math.floor(i / columns) * 22 + Math.floor(random() * 7) - 3;
            const size = 0.2 + random() * 0.8;
            add(species, size, Math.floor(random() * 4294967296), dx, dz, null,
                `${TREE_SPECIES[species].short} ${i + 1} (${Math.round(size * 100)}%)`);
        }
    } else if (mode === 'comparison') {
        TREE_NAMES.forEach((name, index) => add(name, 0.75, Math.floor(random() * 4294967296),
            (index - (TREE_NAMES.length - 1) / 2) * SPACING, 0, null, TREE_SPECIES[name].species[0]));
    } else {
        const templates = TREE_SPECIES[species].pack?.shape?.templates;
        const sizes = templates?.length ? templates.map((_, i) => templates.length === 1 ? 0.5 : i / (templates.length - 1))
            : [0, 0.25, 0.5, 0.75, 1];
        const seeds = sizes.map(() => Math.floor(random() * 4294967296));
        states(species).forEach((state, row) => sizes.forEach((size, column) => add(species, size, seeds[column],
            (column - (sizes.length - 1) / 2) * SPACING, row * SPACING, state,
            `${TREE_SPECIES[species].short}: ${state.label}, ${templates?.length ? `szablon ${column + 1}/${sizes.length}` : `${Math.round(size * 100)}%`}`)));
    }
    const bounds = {
        minX: Math.min(...specimens.map((tree) => tree.dx)) - TREE_REACH - 1,
        maxX: Math.max(...specimens.map((tree) => tree.dx)) + TREE_REACH + 1,
        minZ: Math.min(...specimens.map((tree) => tree.dz)) - TREE_REACH - 1,
        maxZ: Math.max(...specimens.map((tree) => tree.dz)) + TREE_REACH + 1
    };
    return { mode, species, count: specimens.length, seed, specimens, bounds };
}

function positionOptions({ origin, axes }) {
    if (!origin || !Number.isSafeInteger(origin.x) || !Number.isSafeInteger(origin.z)) {
        throw new TreeShowcaseError('Początek pokazu musi mieć całkowite współrzędne X i Z.');
    }
    const { forwardX, forwardZ, rightX, rightZ } = axes ?? {};
    if (![forwardX, forwardZ, rightX, rightZ].every(Number.isInteger) ||
        Math.abs(forwardX) + Math.abs(forwardZ) !== 1 || Math.abs(rightX) + Math.abs(rightZ) !== 1 ||
        forwardX * rightX + forwardZ * rightZ !== 0) {
        throw new TreeShowcaseError('Pokaz wymaga kierunku jednej z czterech stron świata.');
    }
    return (dx, dz) => ({ x: origin.x + rightX * dx + forwardX * dz, z: origin.z + rightZ * dx + forwardZ * dz });
}

const canReplace = (id) => id === AIR_ID || (!isLiquidId(id) && !isLeavesId(id) && (isPlantId(id) || isReplaceableId(id)));

// World.setBlock may recursively remove unsupported plants. Observe exactly
// those writes in the SAME synchronous turn, then restore the original method
// descriptor. There is no await inside this scope and no permanent world hook.
// Diffing an old area snapshot after yielding would capture the player's work.
function recordEdit(world, cell, type, journal) {
    const descriptor = Object.getOwnPropertyDescriptor(world, 'setBlock');
    const setBlock = world.setBlock;
    world.setBlock = function (x, y, z, ...args) {
        const before = this.getBlockId(x, y, z);
        const changed = setBlock.call(this, x, y, z, ...args);
        const after = this.getBlockId(x, y, z);
        if (after !== before) {
            const cellKey = key(x, y, z);
            const previous = journal.get(cellKey);
            // A player's edit made between slices becomes the new baseline.
            journal.set(cellKey, { x, y, z, before: previous?.after === before ? previous.before : before, after });
        }
        return changed;
    };
    try {
        return type === null ? world.clearBlock(cell.x, cell.y, cell.z) : world.setBlock(cell.x, cell.y, cell.z, type);
    } finally {
        if (descriptor) Object.defineProperty(world, 'setBlock', descriptor);
        else delete world.setBlock;
    }
}

function sessionFor(world) {
    let session = sessions.get(world);
    if (!session) {
        session = { busy: null, last: null };
        sessions.set(world, session);
    }
    return session;
}

function checkpoint(world, isActive) {
    let deadline = now() + SLICE_MS;
    return async (force = false) => {
        if (disposed.has(world) || !isActive()) throw new TreeShowcaseError('Pokaz przerwany: świat został zamknięty.');
        if (force || now() >= deadline) {
            await nextTask();
            if (disposed.has(world) || !isActive()) throw new TreeShowcaseError('Pokaz przerwany: świat został zamknięty.');
            deadline = now() + SLICE_MS;
        }
    };
}

export function getTreeShowcase(world) {
    const session = sessions.get(world);
    return session?.busy ?? session?.last ?? null;
}

export function startTreeShowcase(world, options, callbacks = {}) {
    const session = sessionFor(world);
    if (disposed.has(world)) throw new TreeShowcaseError('Ten świat został już zamknięty.');
    if (session.busy) throw new TreeShowcaseError('Poprzedni pokaz drzew jest jeszcze przygotowywany albo cofany.');
    const plan = createTreeShowcasePlan(options);
    const position = positionOptions(options);
    for (const dx of [plan.bounds.minX, plan.bounds.maxX]) {
        for (const dz of [plan.bounds.minZ, plan.bounds.maxZ]) {
            const { x, z } = position(dx, dz);
            if (x < -WORLD_BORDER || x >= WORLD_BORDER || z < -WORLD_BORDER || z >= WORLD_BORDER) {
                throw new TreeShowcaseError('Pokaz wychodzi za granicę świata. Przesuń się dalej od jego krawędzi.');
            }
        }
    }
    const job = { phase: 'preparing', plan, placed: [], skipped: [], journal: [], origin: { ...options.origin }, axes: { ...options.axes } };
    session.busy = job;
    job.promise = runShowcase(world, job, position, callbacks.isActive ?? (() => true))
        .then(() => {
            job.phase = 'complete';
            session.last = job;
            callbacks.onComplete?.(job);
            return job;
        })
        .catch((error) => {
            job.phase = 'failed';
            job.error = error.message;
            // Keep partial changes undoable; a failed preflight keeps the
            // previous successful journal instead.
            if (job.journal.length) session.last = job;
            callbacks.onError?.(error);
            throw error;
        })
        .finally(() => { if (session.busy === job) session.busy = null; });
    return job;
}

async function runShowcase(world, job, position, isActive) {
    const pause = checkpoint(world, isActive);
    const loaded = new Set();
    const ensureLoaded = (x, z) => {
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const chunkKey = `${cx},${cz}`;
        if (loaded.has(chunkKey) && (!world.getChunk || world.getChunk(cx, cz))) return;
        world.ensureColumnLoaded(x, z);
        loaded.add(chunkKey);
    };
    const load = async (x, z) => {
        ensureLoaded(x, z);
        await pause();
    };
    await pause(true);
    const targets = new Map();
    for (const specimen of job.plan.specimens) {
        const { x, z } = position(specimen.dx, specimen.dz);
        // Include surrounding plants: setBlock can remove a plant obscured
        // by the new crown, even if the plant's cell is not a tree cell.
        for (let dx = -TREE_REACH - 1; dx <= TREE_REACH + 1; dx += CHUNK_SIZE) {
            for (let dz = -TREE_REACH - 1; dz <= TREE_REACH + 1; dz += CHUNK_SIZE) await load(x + dx, z + dz);
        }
        await load(x, z);
        ensureLoaded(x, z);
        const y = world.getGroundY(x, z);
        const tree = { ...specimen, x, y, z };
        let reason = y < 1 || y + specimen.shape.top >= CHUNK_HEIGHT ? 'brak miejsca pod limitem wysokości'
            : !isSoilId(world.getBlockId(x, y - 1, z)) ? 'podłoże nie jest ziemią' : '';
        if (!reason) {
            for (const [dx, dy, dz] of specimen.shape.blocks) {
                ensureLoaded(x + dx, z + dz);
                if (!canReplace(world.getBlockId(x + dx, y + dy, z + dz))) {
                    reason = 'zajęte miejsce (woda, drzewo lub budowla)';
                    break;
                }
                await pause();
            }
        }
        if (reason) {
            job.skipped.push({ ...tree, reason });
            if (job.plan.mode !== 'forest') throw new TreeShowcaseError(
                `Nie ma miejsca na pełny pokaz: ${tree.label}, ${x}, ${y}, ${z} — ${reason}. ` +
                'Wybierz pustą, płaską ziemię, np. trawę obok placu świata programisty. Nic nie zmieniono.'
            );
            continue;
        }

        for (const [dx, dy, dz, type] of specimen.shape.blocks) {
            targets.set(key(x + dx, y + dy, z + dz), { x: x + dx, y: y + dy, z: z + dz, type });
        }
        // Roots follow the natural slope but never replace soil or buildings.
        for (const [dx, dz, type] of specimen.shape.roots) {
            ensureLoaded(x + dx, z + dz);
            for (let yy = y - 1; yy >= Math.max(1, y - 4); yy--) {
                if (!canReplace(world.getBlockId(x + dx, yy, z + dz))) break;
                targets.set(key(x + dx, yy, z + dz), { x: x + dx, y: yy, z: z + dz, type });
            }
        }
        const litterType = `${specimen.species}_leaf_litter`;
        for (const [dx, dz] of specimen.shape.litter) {
            ensureLoaded(x + dx, z + dz);
            for (let yy = Math.min(CHUNK_HEIGHT - 1, y + 2); yy >= Math.max(1, y - 4); yy--) {
                const below = world.getBlockId(x + dx, yy - 1, z + dz);
                if (isLiquidId(below)) break;
                if (below === AIR_ID || isPlantId(below) || isLeavesId(below)) continue;
                const here = world.getBlockId(x + dx, yy, z + dz);
                const cellKey = key(x + dx, yy, z + dz);
                if (isSoilId(below) && canReplace(here) && !targets.has(cellKey)) {
                    targets.set(cellKey, { x: x + dx, y: yy, z: z + dz, type: litterType });
                }
                break;
            }
        }
        job.placed.push(tree);
    }
    if (!job.placed.length) throw new TreeShowcaseError('Brak wolnych miejsc na drzewa. Wybierz pustą ziemię, np. trawę obok placu świata programisty. Nic nie zmieniono.');

    // Bottom-up insertion is much cheaper for skylight. No work reaches the
    // world until every specimen in a comparison/variant gallery has fitted.
    const edits = [...targets.values()].sort((a, b) => a.y - b.y);
    // Recheck targets immediately before construction: preflight yields to
    // the game, and the player may have built something during that time.
    for (const cell of edits) {
        ensureLoaded(cell.x, cell.z);
        if (!canReplace(world.getBlockId(cell.x, cell.y, cell.z))) throw new TreeShowcaseError('Miejsce pokazu zostało zajęte podczas przygotowania. Nic nie zmieniono.');
        await pause();
    }
    job.phase = 'planting';
    const journal = new Map();
    try {
        for (const cell of edits) {
            await pause();
            ensureLoaded(cell.x, cell.z);
            // Preserve new edits made while the background job is running.
            if (!canReplace(world.getBlockId(cell.x, cell.y, cell.z))) throw new TreeShowcaseError('Budowanie pokazu przerwano: miejsce zostało zajęte. /drzewa cofnij usuwa ukończoną część.');
            recordEdit(world, cell, cell.type, journal);
        }
    } finally {
        job.journal = [...journal.values()].filter((cell) => cell.after !== cell.before);
    }
}

export function undoTreeShowcase(world, { isActive = () => true } = {}) {
    const session = sessionFor(world);
    if (session.busy) return Promise.reject(new TreeShowcaseError('Poczekaj na zakończenie przygotowania pokazu drzew.'));
    const previous = session.last;
    if (!previous?.journal.length) return Promise.reject(new TreeShowcaseError('Nie ma pokazu drzew do cofnięcia w tej sesji świata.'));
    const job = { ...previous, phase: 'undoing' };
    session.busy = job;
    job.promise = (async () => {
        const pause = checkpoint(world, isActive);
        const restored = [];
        let skipped = 0;
        await pause(true);
        const loaded = new Set();
        for (const cell of previous.journal) {
            const chunkKey = `${Math.floor(cell.x / CHUNK_SIZE)},${Math.floor(cell.z / CHUNK_SIZE)}`;
            if (!loaded.has(chunkKey)) {
                world.ensureColumnLoaded(cell.x, cell.z);
                loaded.add(chunkKey);
                await pause();
            }
        }
        // Capture matches before clearing: removing support may automatically
        // remove litter, which still belongs to this undo operation.
        const ensureLoaded = (cell) => {
            if (!world.getChunk?.(Math.floor(cell.x / CHUNK_SIZE), Math.floor(cell.z / CHUNK_SIZE))) {
                world.ensureColumnLoaded(cell.x, cell.z);
            }
        };
        const matching = previous.journal.filter((cell) => {
            ensureLoaded(cell);
            const unchanged = world.getBlockId(cell.x, cell.y, cell.z) === cell.after;
            if (!unchanged) skipped++;
            return unchanged;
        });
        const undoEffects = new Map();
        for (const cell of matching.sort((a, b) => b.y - a.y)) {
            await pause();
            ensureLoaded(cell);
            const current = world.getBlockId(cell.x, cell.y, cell.z);
            const effect = undoEffects.get(key(cell.x, cell.y, cell.z));
            if (current !== cell.after && !(effect?.after === current && effect?.before === cell.after)) {
                skipped++;
                continue;
            }
            // Restore each original cell synchronously. In particular, a
            // waterlogged plant must not spend several frames as empty water:
            // fluid simulation could fill it between a clear and a second pass.
            recordEdit(world, cell, getBlockTypeById(cell.before), undoEffects);
            restored.push(cell);
        }
        session.last = null;
        return { restored: restored.length, skipped };
    })().finally(() => { if (session.busy === job) session.busy = null; });
    return job.promise;
}

export async function waitForTreeShowcase(world) {
    try { await sessions.get(world)?.busy?.promise; } catch { /* Already reported by the command. */ }
}

export function disposeTreeShowcase(world) {
    disposed.add(world);
    sessions.delete(world);
}
