import { CHUNK_SIZE, CHUNK_HEIGHT, WATER_SURFACE } from '../config.js';
import { getWaterLevel, getWaterBaseHeight, isSolidId, isOpaqueId } from '../blocks/BlockRegistry.js';
import { getWaterCornerHeight } from '../world/WaterSurface.js';

export const RIPPLE_SURFACE_CAPS = Object.freeze({
    emitters: 12, potatoEmitters: 4, candidates: 64,
    cellsPerEmitter: 169, cellsPerUpdate: 48, msPerUpdate: 0.35
});
const S = CHUNK_SIZE;
const EMPTY = Object.freeze([]);

function readChunk(chunk, x, y, z, cx, cz) {
    return y < 0 || y >= CHUNK_HEIGHT ? 0
        : chunk.blocks[(y * S + z - cz * S) * S + x - cx * S] ?? 0;
}

function sameLighting(a, b) {
    return a === b || a?.sky === b?.sky && a?.classicShade === b?.classicShade && a?.emission === b?.emission &&
        a?.local?.[0] === b?.local?.[0] && a?.local?.[1] === b?.local?.[1] && a?.local?.[2] === b?.local?.[2];
}

/** Bounded, CPU-only discovery of connected receiving water.
 * Entry x/z are impact centers; y is the receiving cell layer. Patch x/y/z
 * are integer world cells, heights are LOCAL [h00,h10,h01,h11], waves are the
 * exact mesher bytes [0..255]. Use the (1,0)--(0,1) diagonal for both triangles.
 * revision publishes complete geometry/attribute changes or immediate removal,
 * never partially discovered cells. setLandings is normally called every .3s.
 */
export class WaterfallRippleSurface {
    constructor(world, { now = () => performance.now(), lightingAt = null, transient = false } = {}) {
        this.world = world;
        this.now = now;
        this.lightingAt = lightingAt;
        this.transient = transient;
        this.entries = [];
        this.jobs = [];
        this.revision = 0;
        this.nextId = 1;
        this.cursor = 0;
        this.limit = RIPPLE_SURFACE_CAPS.emitters;
        this.lastProcessed = 0;
        this.lastMs = 0;
    }

    candidate(landing) {
        if (![landing?.x, landing?.y, landing?.z, landing?.fall].every(Number.isFinite)) return null;
        if (this.transient && ![landing.radius ?? 1, landing.opacity ?? .35,
            landing.birth ?? 0, landing.lifetime ?? 1.5].every(Number.isFinite)) return null;
        const x = Math.floor(landing.x), y = Math.floor(landing.y), z = Math.floor(landing.z);
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        const chunk = this.world.getChunk(cx, cz);
        if (!chunk || y < 0 || y >= CHUNK_HEIGHT) return null;
        const below = readChunk(chunk, x, y - 1, z, cx, cz);
        const receivingY = this.transient ? y : getWaterLevel(below) >= 0 ? y - 1 : y;
        if (getWaterLevel(readChunk(chunk, x, receivingY, z, cx, cz)) < 0) return null;
        return { key: this.transient ? String(landing.key) : `${x},${receivingY},${z}`, x, y: receivingY, z,
            fall: Math.max(1, Math.min(16, landing.fall)), distance: landing.distance ?? 0,
            lighting: landing.lighting,
            ...(this.transient ? { centerX: landing.x, centerZ: landing.z,
                radius: Math.max(.35, Math.min(6, landing.radius ?? 1)),
                opacity: Math.max(0, Math.min(1, landing.opacity ?? .35)),
                birth: landing.birth ?? 0, lifetime: Math.max(.1, landing.lifetime ?? 1.5) } : {}) };
    }

    setLandings(landings, amount = 1) {
        if (!this.world) return;
        this.limit = amount <= 0 ? 0 : amount <= 0.35 ? RIPPLE_SURFACE_CAPS.potatoEmitters : RIPPLE_SURFACE_CAPS.emitters;
        const candidates = [];
        if (this.limit) for (let i = 0; i < Math.min(landings.length, RIPPLE_SURFACE_CAPS.candidates); i++) {
            const candidate = this.candidate(landings[i]);
            if (candidate) candidates.push(candidate);
        }
        // Strongest impact represents its immediate neighbors. Stable tie
        // breaking prevents flickering identities when a caller reorders input.
        candidates.sort((a, b) => b.fall - a.fall || a.distance - b.distance || a.x - b.x || a.z - b.z || a.y - b.y);
        const selected = [];
        for (const candidate of candidates) {
            if (this.transient || !selected.some(other => other.y === candidate.y &&
                (other.x - candidate.x) ** 2 + (other.z - candidate.z) ** 2 <= 4)) selected.push(candidate);
        }
        selected.sort((a, b) => a.distance - b.distance || b.fall - a.fall || a.x - b.x || a.z - b.z || a.y - b.y);
        selected.length = Math.min(selected.length, this.limit);

        const previous = new Map(this.entries.map(entry => [entry.key, entry]));
        const next = [];
        for (const candidate of selected) {
            let entry = previous.get(candidate.key);
            previous.delete(candidate.key);
            if (!entry) {
                entry = { id: this.nextId++, key: candidate.key, x: candidate.centerX ?? candidate.x + .5,
                    y: candidate.y, z: candidate.centerZ ?? candidate.z + .5,
                    fall: candidate.fall, radius: candidate.radius ?? 2 + .25 * candidate.fall,
                    opacity: candidate.opacity ?? .12 + .02 * candidate.fall,
                    birth: candidate.birth ?? 0, lifetime: candidate.lifetime ?? 0,
                    lighting: candidate.lighting, patches: EMPTY, revision: 0, dependencies: EMPTY, job: null };
                this.restart(entry);
            } else {
                const resized = entry.fall !== candidate.fall || entry.radius !== (candidate.radius ?? 2 + .25 * candidate.fall);
                const relit = !sameLighting(entry.lighting, candidate.lighting);
                entry.fall = candidate.fall;
                entry.radius = candidate.radius ?? 2 + .25 * candidate.fall;
                entry.opacity = candidate.opacity ?? .12 + .02 * candidate.fall;
                entry.lighting = candidate.lighting;
                if (relit && !this.lightingAt) {
                    for (const patch of entry.patches) patch.lighting = candidate.lighting;
                    for (const patch of entry.job?.patches ?? EMPTY) patch.lighting = candidate.lighting;
                }
                if (resized || !this.valid(entry.dependencies)) this.restart(entry);
                else if (relit && entry.patches.length) this.changed(entry);
            }
            next.push(entry);
        }
        for (const entry of previous.values()) {
            this.cancel(entry);
            if (entry.patches.length) this.changed(entry);
        }
        this.entries = next;
    }

    changed(entry) {
        entry.revision++;
        this.revision++;
    }

    cancel(entry) {
        if (!entry.job) return;
        const index = this.jobs.indexOf(entry.job);
        if (index >= 0) this.jobs.splice(index, 1);
        entry.job = null;
    }

    restart(entry) {
        this.cancel(entry);
        if (entry.patches.length) {
            entry.patches = EMPTY;
            this.changed(entry);
        }
        const extent = Math.ceil(entry.radius), width = extent * 2 + 1;
        const job = { entry, x: Math.floor(entry.x), z: Math.floor(entry.z), extent, width,
            seen: new Uint8Array(RIPPLE_SURFACE_CAPS.cellsPerEmitter),
            queue: new Uint16Array(RIPPLE_SURFACE_CAPS.cellsPerEmitter), head: 0, tail: 0,
            patches: [], dependencies: [] };
        entry.dependencies = job.dependencies;
        entry.job = job;
        this.enqueue(job, 0, 0);
        this.jobs.push(job);
    }

    valid(dependencies) {
        for (const dep of dependencies) {
            const chunk = this.world.getChunk(dep.cx, dep.cz) ?? null;
            if (chunk !== dep.chunk || chunk?.blocks !== dep.blocks ||
                (chunk?.meshRevision ?? 0) !== dep.meshRevision || (chunk?.version ?? 0) !== dep.version) return false;
        }
        return true;
    }

    read(job, x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return 0;
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        let dep;
        for (const candidate of job.dependencies) if (candidate.cx === cx && candidate.cz === cz) {
            dep = candidate;
            break;
        }
        if (!dep) {
            const chunk = this.world.getChunk(cx, cz) ?? null;
            dep = { cx, cz, chunk, blocks: chunk?.blocks,
                meshRevision: chunk?.meshRevision ?? 0, version: chunk?.version ?? 0 };
            job.dependencies.push(dep);
        }
        return dep.chunk ? readChunk(dep.chunk, x, y, z, cx, cz) : -1;
    }

    height(job, x, y, z) {
        const id = this.read(job, x, y, z), height = getWaterBaseHeight(id);
        if (!height || height === 1) return height;
        const above = this.read(job, x, y + 1, z);
        return getWaterLevel(above) >= 0 || isOpaqueId(above) ? 1 : height;
    }

    patch(job, x, z) {
        const y = job.entry.y;
        const center = this.height(job, x, y, z);
        const west = this.height(job, x - 1, y, z), east = this.height(job, x + 1, y, z);
        const north = this.height(job, x, y, z - 1), south = this.height(job, x, y, z + 1);
        const heights = [
            getWaterCornerHeight(this.height(job, x - 1, y, z - 1), north, west, center),
            getWaterCornerHeight(north, this.height(job, x + 1, y, z - 1), center, east),
            getWaterCornerHeight(west, center, this.height(job, x - 1, y, z + 1), south),
            getWaterCornerHeight(center, east, south, this.height(job, x + 1, y, z + 1))
        ];
        return { x, y, z, heights, waves: heights.map(height => height < 1 ? Math.round(height / WATER_SURFACE * 255) : 0),
            lighting: this.lightingAt?.(x, y + 1, z) ?? job.entry.lighting };
    }

    enqueue(job, dx, dz) {
        const x = job.x + dx, z = job.z + dz;
        const gapX = job.entry.x - Math.max(x, Math.min(job.entry.x, x + 1));
        const gapZ = job.entry.z - Math.max(z, Math.min(job.entry.z, z + 1));
        if (Math.abs(dx) > job.extent || Math.abs(dz) > job.extent ||
            gapX * gapX + gapZ * gapZ > job.entry.radius ** 2) return;
        const index = (dz + job.extent) * job.width + dx + job.extent;
        if (job.seen[index]) return;
        job.seen[index] = 1;
        job.queue[job.tail++] = index;
    }

    inspect(job) {
        const index = job.queue[job.head++];
        const dx = index % job.width - job.extent, dz = Math.floor(index / job.width) - job.extent;
        const x = job.x + dx, z = job.z + dz, y = job.entry.y;
        const id = this.read(job, x, y, z), level = getWaterLevel(id);
        if (level < 0 || isSolidId(id)) return;
        const above = this.read(job, x, y + 1, z), covered = getWaterLevel(above) >= 0;
        if (above < 0 || isSolidId(above) || isOpaqueId(above)) return;
        const impact = dx === 0 && dz === 0;
        if (!covered && level < 8) job.patches.push(this.patch(job, x, z));
        else if (!impact) return;
        this.enqueue(job, dx - 1, dz);
        this.enqueue(job, dx + 1, dz);
        this.enqueue(job, dx, dz - 1);
        this.enqueue(job, dx, dz + 1);
    }

    update(cellBudget = RIPPLE_SURFACE_CAPS.cellsPerUpdate) {
        this.lastProcessed = 0;
        this.lastMs = 0;
        if (!this.world || !this.entries.length) return;
        const start = this.now(), deadline = start + RIPPLE_SURFACE_CAPS.msPerUpdate;
        const maxCells = Math.max(0, Math.min(RIPPLE_SURFACE_CAPS.cellsPerUpdate, Math.floor(cellBudget) || 0));
        // Metadata only: at most four chunk dependencies per emitter. No
        // settled water cells are revisited on normal frames, yet edits and
        // unloads remove stale geometry before another frame can draw it.
        for (const entry of this.entries) if (!this.valid(entry.dependencies)) this.restart(entry);
        while (this.jobs.length && this.lastProcessed < maxCells && this.now() < deadline) {
            this.cursor %= this.jobs.length;
            const job = this.jobs[this.cursor];
            this.inspect(job);
            this.lastProcessed++;
            if (job.head === job.tail) {
                const entry = job.entry;
                this.jobs.splice(this.cursor, 1);
                entry.job = null;
                if (!this.valid(job.dependencies)) this.restart(entry);
                else if (job.patches.length) {
                    entry.patches = job.patches;
                    this.changed(entry);
                }
            } else this.cursor++;
        }
        this.lastMs = this.now() - start;
    }

    stats() {
        return { cells: this.entries.reduce((total, entry) => total + entry.patches.length, 0),
            emitters: this.entries.length, queued: this.jobs.length,
            lastProcessed: this.lastProcessed, lastMs: this.lastMs,
            caps: { emitters: this.limit, cellsPerEmitter: RIPPLE_SURFACE_CAPS.cellsPerEmitter,
                cellsPerUpdate: RIPPLE_SURFACE_CAPS.cellsPerUpdate, msPerUpdate: RIPPLE_SURFACE_CAPS.msPerUpdate } };
    }

    dispose() {
        if (this.entries.some(entry => entry.patches.length)) this.revision++;
        this.entries.length = 0;
        this.jobs.length = 0;
        this.world = null;
        this.lightingAt = null;
        this.lastProcessed = 0;
        this.lastMs = 0;
    }
}
