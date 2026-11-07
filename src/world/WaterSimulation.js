import { CHUNK_SIZE as S, CHUNK_HEIGHT as H, WORLD_BORDER } from '../config.js';
import { AIR_ID, WATER_SOURCE_ID, getWaterLevel, waterIdForLevel, fallingWaterId, waterFallDistance,
    isSolidId, isPlantId, isReplaceableId, isWaterSourceId } from '../blocks/BlockRegistry.js';

const LAYER = S * S;
const UNKNOWN = -1, WALL = -2;
const SIDES = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const chunkAt = (world, x, z) => world.getChunk(Math.floor(x / S), Math.floor(z / S));
const cellIndex = (x, y, z) => y * LAYER + (z - Math.floor(z / S) * S) * S + x - Math.floor(x / S) * S;
const ADJACENT = [[0,0,0], [-1,0,0], [1,0,0], [0,0,-1], [0,0,1], [0,1,0], [0,-1,0]];
export const WATER_STEP_SECONDS = .12;
export const WATER_BUDGET_MS = .6;
export const WATER_MAX_UPDATES = 64;
export const WATER_MAX_CHANGES = 24;
export const WATER_MAX_SCAN_CELLS = 1024;

// Event-driven relaxation of local water levels. Two deduplicated waves keep
// a newly reached cell from flooding the whole map in the same simulation tick.
// All reads/writes are restricted to loaded chunks; unknown terrain is never air.
export class WaterSimulation {
    constructor(world, { now = () => performance.now() } = {}) {
        this.world = world;
        this.now = now;
        this.ready = new Map();
        this.next = new Map();
        this.scans = new Map();
        this.boundaries = new Map();
        // Doły wodospadów w wczytanych chunkach: chunk -> Map(indeks, ID).
        this.landings = new Map();
        this.elapsed = 0;
        this.pending = 0;
        this.processed = 0;
        this.changes = 0;
        this.lastProcessed = this.lastChanges = this.lastScanCells = this.lastMs = 0;
        this.disposed = false;
    }

    read(x, y, z) {
        if (y < 0 || x < -WORLD_BORDER || z < -WORLD_BORDER || x >= WORLD_BORDER || z >= WORLD_BORDER) return WALL;
        if (y >= H) return AIR_ID;
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = this.world.getChunk(cx, cz);
        return chunk ? chunk.blocks[y * LAYER + (z - cz * S) * S + x - cx * S] : UNKNOWN;
    }

    enterable(id) {
        return id === AIR_ID || getWaterLevel(id) > 0 ||
            (id > 0 && !isSolidId(id) && !isWaterSourceId(id) && (isPlantId(id) || isReplaceableId(id)));
    }

    supported(id) { return id === WALL || isSolidId(id) || isWaterSourceId(id); }

    enqueue(x, y, z) {
        if (y < 0 || y >= H || x < -WORLD_BORDER || z < -WORLD_BORDER || x >= WORLD_BORDER || z >= WORLD_BORDER) return;
        const cx = Math.floor(x / S), cz = Math.floor(z / S), chunk = this.world.getChunk(cx, cz);
        if (!chunk) return;
        const index = y * LAYER + (z - cz * S) * S + x - cx * S;
        if (this.ready.get(chunk)?.has(index)) return;
        let queue = this.next.get(chunk);
        if (!queue) this.next.set(chunk, queue = new Set());
        if (!queue.has(index)) { queue.add(index); this.pending++; }
    }

    blockChanged(x, y, z, previousId) {
        let nearby = getWaterLevel(previousId) >= 0;
        if (!nearby) for (const [dx, dy, dz] of ADJACENT) {
            if (getWaterLevel(this.read(x + dx, y + dy, z + dz)) >= 0) { nearby = true; break; }
        }
        if (!nearby) return;
        for (const [dx, dy, dz] of ADJACENT) this.enqueue(x + dx, y + dy, z + dz);
    }

    chunkLoaded(chunk) {
        // Hooks are O(1). Restored flow and natural exposed banks are found in
        // small scan slices later, never a full-height scan during streaming.
        if (chunk.waterBounds !== null) this.scans.set(chunk, { cursor: 0,
            bounds: Boolean(chunk.waterBounds), waterY: -1,
            end: chunk.waterBounds ? LAYER : Math.min(H, chunk.maxY) * LAYER });
        const neighbors = [chunk.west, chunk.east, chunk.north, chunk.south];
        const opposite = [1, 0, 3, 2];
        for (let side = 0; side < 4; side++) if (neighbors[side] && neighbors[side].waterBounds !== null) {
            const neighbor = neighbors[side], old = this.boundaries.get(neighbor);
            this.boundaries.set(neighbor, { cursor: 0, edges: (old?.edges ?? 0) | (1 << opposite[side]),
                bounds: Boolean(neighbor.waterBounds), waterY: -1,
                end: neighbor.waterBounds ? LAYER : Math.min(H, neighbor.maxY) * S });
        }
    }

    chunkUnloaded(chunk) {
        for (const queues of [this.ready, this.next]) {
            this.pending -= queues.get(chunk)?.size ?? 0;
            queues.delete(chunk);
        }
        this.scans.delete(chunk);
        this.boundaries.delete(chunk);
        this.landings.delete(chunk);
    }

    landing(x, y, z, id) {
        const chunk = chunkAt(this.world, x, z);
        if (!chunk) return;
        let cells = this.landings.get(chunk);
        if (!cells) this.landings.set(chunk, cells = new Map());
        cells.set(cellIndex(x, y, z), id);
    }

    // Doły wodospadów bliżej niż radius (w poziomie) od (x, z): wywołuje
    // visit(x, y, z, spadek). Nieaktualne (już nie spadająca woda albo
    // pod nią znów jest miejsce) - usuwa.
    forEachLanding(x, z, radius, visit) {
        for (const [chunk, cells] of this.landings) {
            const x0 = chunk.cx * S, z0 = chunk.cz * S;
            if (x0 + S < x - radius || x0 > x + radius || z0 + S < z - radius || z0 > z + radius) continue;
            for (const [index, id] of cells) {
                const ly = Math.floor(index / LAYER), column = index % LAYER;
                const lx = x0 + column % S, lz = z0 + Math.floor(column / S);
                const current = chunk.blocks[index];
                const distance = waterFallDistance(current);
                if (!distance || this.enterable(this.read(lx, ly - 1, lz))) { cells.delete(index); continue; }
                if (current !== id) cells.set(index, current);
                if (Math.abs(lx + .5 - x) <= radius && Math.abs(lz + .5 - z) <= radius) visit(lx, ly, lz, distance);
            }
            if (!cells.size) this.landings.delete(chunk);
        }
    }

    inspect(chunk, index) {
        const id = chunk.blocks[index], level = getWaterLevel(id);
        if (level < 0) return;
        const y = Math.floor(index / LAYER), column = index % LAYER;
        const x = chunk.cx * S + column % S, z = chunk.cz * S + Math.floor(column / S);
        // Flow must revalidate its upstream after reload. A settled source
        // volume only wakes at a reachable opening; interior oceans stay asleep.
        if (level > 0 || this.enterable(this.read(x, y - 1, z))) {
            this.enqueue(x, y, z);
            return;
        }
        for (const [dx, dz] of SIDES) if (this.enterable(this.read(x + dx, y, z + dz))) {
            this.enqueue(x, y, z);
            return;
        }
    }

    scan(deadline) {
        while (this.lastScanCells <= WATER_MAX_SCAN_CELLS - 16 && this.now() < deadline) {
            const boundary = this.boundaries.size > 0;
            const jobs = boundary ? this.boundaries : this.scans;
            const entry = jobs.entries().next().value;
            if (!entry) break;
            const [chunk, job] = entry;
            // At most 16 cells between clock checks; round-robin chunk slices.
            if (job.bounds) {
                const bounds = chunk.waterBounds;
                for (let unit = 0; unit < 16 && job.cursor < job.end; unit++) {
                    const column = job.cursor, lx = column % S, lz = Math.floor(column / S);
                    this.lastScanCells++;
                    if (boundary && !((lx === 0 && (job.edges & 1)) || (lx === S - 1 && (job.edges & 2)) ||
                        (lz === 0 && (job.edges & 4)) || (lz === S - 1 && (job.edges & 8)))) {
                        job.cursor++; continue;
                    }
                    if (!bounds[column]) { job.cursor++; continue; }
                    if (job.waterY < 0) job.waterY = bounds[column] - 1;
                    this.inspect(chunk, job.waterY * LAYER + column);
                    if (++job.waterY >= bounds[LAYER + column]) { job.waterY = -1; job.cursor++; }
                }
            } else {
              const end = Math.min(job.end, job.cursor + (boundary ? 4 : 16));
              for (; job.cursor < end; job.cursor++) {
                if (boundary) {
                    const y = Math.floor(job.cursor / S), along = job.cursor % S;
                    for (let side = 0; side < 4; side++) if (job.edges & (1 << side)) {
                        const x = side === 0 ? 0 : side === 1 ? S - 1 : along;
                        const z = side === 2 ? 0 : side === 3 ? S - 1 : along;
                        this.inspect(chunk, y * LAYER + z * S + x);
                        this.lastScanCells++;
                    }
                } else { this.inspect(chunk, job.cursor); this.lastScanCells++; }
              }
            }
            jobs.delete(chunk);
            if (job.cursor < job.end) jobs.set(chunk, job);
        }
    }

    cell(x, y, z) {
        const id = this.read(x, y, z), level = getWaterLevel(id);
        if (level < 0 && !this.enterable(id)) return;
        let desired = id;
        if (level !== 0) {
            let sources = 0, best = 8, unknown = false;
            for (const [dx, dz] of SIDES) {
                const neighbor = this.read(x + dx, y, z + dz), n = getWaterLevel(neighbor);
                if (neighbor === UNKNOWN) unknown = true;
                if (n === 0) sources++;
                if (n < 0) continue;
                const bottom = this.read(x + dx, y - 1, z + dz);
                // Prioritize a downward channel. Falling columns only fan out
                // once they reach a floor or a source pool.
                if (bottom === UNKNOWN || this.enterable(bottom)) continue;
                best = Math.min(best, (n === 8 ? 0 : n) + 1);
            }
            // A missing upstream chunk must never drain a persisted stream.
            if (unknown && level > 0) return;
            if (sources >= 2 && this.supported(this.read(x, y - 1, z))) desired = WATER_SOURCE_ID;
            // Spadająca woda: o blok dłuższy spadek niż woda nad nią
            // (pod źródłem albo nurtem - 1).
            else if (getWaterLevel(this.read(x, y + 1, z)) >= 0) desired = fallingWaterId(waterFallDistance(this.read(x, y + 1, z)) + 1);
            else desired = best < 8 ? waterIdForLevel(best) : level > 0 ? AIR_ID : id;
        }

        if (desired !== id) {
            if (!this.world.setFluidBlock(x, y, z, desired)) return;
            this.lastChanges++; this.changes++;
        }

        const current = getWaterLevel(desired);
        if (current < 0) return;
        const below = this.read(x, y - 1, z);
        if (this.enterable(below)) {
            // Niżej nie ta liczba spadku (albo jeszcze nie woda) - do poprawy.
            if (below !== fallingWaterId(waterFallDistance(desired) + 1)) this.enqueue(x, y - 1, z);
            this.landings.get(chunkAt(this.world, x, z))?.delete(cellIndex(x, y, z));
            return;
        }
        if (below === UNKNOWN) return;
        // Dół wodospadu: spadająca woda na dnie albo na tafli. Efekty
        // (WaterfallEffects.js) biorą stąd miejsca rozbryzgu.
        if (current === 8) this.landing(x, y, z, desired);
        const incoming = (current === 8 ? 0 : current) + 1;
        if (incoming > 7) return;
        for (const [dx, dz] of SIDES) {
            const neighbor = this.read(x + dx, y, z + dz), n = getWaterLevel(neighbor);
            if (this.enterable(neighbor) && (n < 0 || n > incoming)) this.enqueue(x + dx, y, z + dz);
        }
    }

    update(dt, budgetMs = WATER_BUDGET_MS, maxUpdates = WATER_MAX_UPDATES) {
        this.lastProcessed = this.lastChanges = this.lastScanCells = this.lastMs = 0;
        if (this.disposed || !(budgetMs > 0)) return;
        const started = this.now(), deadline = started + Math.min(budgetMs, WATER_BUDGET_MS);
        const cap = Math.min(WATER_MAX_UPDATES, Math.max(0, Math.floor(maxUpdates)));
        this.elapsed = Math.min(WATER_STEP_SECONDS, this.elapsed + Math.max(0, Math.min(dt || 0, .25)));
        this.scan(Math.min(deadline, started + Math.min(.2, budgetMs * .35)));
        if (this.ready.size === 0 && this.elapsed >= WATER_STEP_SECONDS) {
            [this.ready, this.next] = [this.next, this.ready];
            this.elapsed = 0;
        }
        try {
            while (this.ready.size && this.lastProcessed < cap && this.lastChanges < WATER_MAX_CHANGES && this.now() < deadline) {
                const [chunk, queue] = this.ready.entries().next().value;
                const index = queue.values().next().value;
                queue.delete(index); this.pending--;
                this.ready.delete(chunk);
                if (queue.size) this.ready.set(chunk, queue);
                const y = Math.floor(index / LAYER), column = index % LAYER;
                this.cell(chunk.cx * S + column % S, y, chunk.cz * S + Math.floor(column / S));
                this.lastProcessed++; this.processed++;
            }
        } finally { this.world.flushFluidChanges?.(); }
        this.lastMs = this.now() - started;
    }

    stats() {
        return { pending: this.pending, scans: this.scans.size + this.boundaries.size,
            lastProcessed: this.lastProcessed, lastChanges: this.lastChanges, lastScanCells: this.lastScanCells,
            lastMs: this.lastMs, processed: this.processed, changes: this.changes,
            maxUpdates: WATER_MAX_UPDATES, maxChanges: WATER_MAX_CHANGES,
            maxScanCells: WATER_MAX_SCAN_CELLS, budgetMs: WATER_BUDGET_MS, stepSeconds: WATER_STEP_SECONDS };
    }

    dispose() {
        this.ready.clear(); this.next.clear(); this.scans.clear(); this.boundaries.clear(); this.landings.clear();
        this.pending = 0; this.disposed = true;
    }
}
