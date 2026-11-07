import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { isOpaqueId, isSolidId, waterFallDistance } from '../blocks/BlockRegistry.js';

export const WATERFALL_AUDIO_CAPS = Object.freeze({ voices: 4, potatoVoices: 2, candidates: 64,
    radius: 40, enterRadius: 38, refresh: .3, rayCells: 72, cellsPerUpdate: 96, msPerUpdate: .25 });
const S = CHUNK_SIZE;
const EMPTY = Object.freeze([]);

// Reuse the game's existing recordings: gentle splashing for low drops,
// stronger stream noise for taller falls. One recording per emitter, never a
// pair of overlapping loops. Both gain and pitch vary continuously with height.
export function waterfallAudioProfile(fall) {
    const height = Math.max(1, Math.min(16, Number.isFinite(fall) ? fall : 1));
    return { sound: height < 6 ? 'water_waves' : 'water_stream',
        volume: .14 + .035 * height, pitch: 1.08 - .018 * height };
}

function blockAt(chunk, x, y, z, cx, cz) {
    return y < 0 || y >= CHUNK_HEIGHT ? 0 : chunk.blocks[(y * S + z - cz * S) * S + x - cx * S] ?? 0;
}

// Coordinate IDs have no language semantics. Keep equal-score selection
// deterministic without initializing locale-aware collation on an audio tick.
function compareImpactKeys(a, b) {
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

/** Four positional waterfall voices (two in low detail), including fade tails.
 * Landings come from WaterfallEffects; no second terrain/water search is done.
 * Occlusion is a cached, budgeted voxel ray. The existing SoundManager game
 * bus supplies the underwater lowpass; here submersion only reduces gain.
 */
export class WaterfallAudio {
    constructor(game, { now = () => performance.now() } = {}) {
        this.game = game;
        this.now = now;
        this.amount = game.settings?.get('potato') ? .35 : 1;
        this.limit = this.amount <= .35 ? WATERFALL_AUDIO_CAPS.potatoVoices : WATERFALL_AUDIO_CAPS.voices;
        this.refresh = 0;
        this.selected = EMPTY;
        this.underwater = false;
        this.disposed = false;
        this.rayCursor = 0;
        this.lastProcessed = 0;
        this.lastMs = 0;
        this.rayCells = 0;
        this.refreshes = 0;
        this.slots = Array.from({ length: 4 }, () => ({ key: null, sound: null, loop: null,
            position: new THREE.Vector3(), gain: 0, target: 0, occlusion: 0,
            retiring: false, retry: 0, ray: null, path: null, candidate: null, pitch: 1 }));
    }

    setAmount(amount) {
        if (this.disposed) return;
        this.amount = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
        this.refresh = 0;
        if (!this.amount) {
            this.selected = EMPTY;
            for (const slot of this.slots) this.retire(slot);
        }
    }

    clear(slot) {
        slot.key = slot.sound = slot.loop = slot.ray = slot.path = slot.candidate = null;
        slot.gain = slot.target = slot.occlusion = slot.retry = 0;
        slot.retiring = false;
    }

    retire(slot, seconds = .25) {
        if (!slot.key || slot.retiring) return;
        slot.target = 0;
        slot.ray = null;
        slot.retiring = true;
        if (slot.loop && !slot.loop.ended) slot.loop.stop(seconds);
        else this.clear(slot);
    }

    validImpact(candidate) {
        const world = this.game.world;
        const chunk = world.getChunk?.(candidate.cx, candidate.cz);
        return chunk === candidate.chunk && waterFallDistance(blockAt(chunk,
            candidate.cellX, candidate.cellY, candidate.cellZ, candidate.cx, candidate.cz)) > 0;
    }

    select(eye) {
        const world = this.game.world, candidates = [];
        const landings = this.game.waterfalls?.landings ?? EMPTY;
        if (this.amount) for (let i = 0; i < Math.min(landings.length, WATERFALL_AUDIO_CAPS.candidates); i++) {
            const landing = landings[i];
            if (![landing.x, landing.y, landing.z].every(Number.isFinite)) continue;
            const x = Math.floor(landing.x), y = Math.floor(landing.y), z = Math.floor(landing.z);
            const cx = Math.floor(x / S), cz = Math.floor(z / S), chunk = world.getChunk?.(cx, cz);
            if (!chunk) continue;
            const fall = waterFallDistance(blockAt(chunk, x, y, z, cx, cz));
            if (!fall) continue;
            const key = `${x},${y},${z}`;
            const known = this.slots.some(slot => slot.key === key && !slot.retiring);
            const surface = Number.isFinite(landing.surface) ? landing.surface : y + .25;
            const distance = Math.hypot(x + .5 - eye.x, surface - eye.y, z + .5 - eye.z);
            if (distance > (known ? WATERFALL_AUDIO_CAPS.radius : WATERFALL_AUDIO_CAPS.enterRadius)) continue;
            candidates.push({ key, cellX: x, cellY: y, cellZ: z, cx, cz, chunk,
                x: x + .5, y: surface, z: z + .5, fall, distance,
                priority: distance - (known ? 1.5 : 0), ...waterfallAudioProfile(fall) });
        }
        candidates.sort((a, b) => b.fall - a.fall || a.priority - b.priority || compareImpactKeys(a, b));
        const distinct = [];
        for (const candidate of candidates) if (!distinct.some(other => other.cellY === candidate.cellY &&
            (other.x - candidate.x) ** 2 + (other.z - candidate.z) ** 2 <= 4)) distinct.push(candidate);
        distinct.sort((a, b) => a.priority - b.priority || compareImpactKeys(a, b));
        distinct.length = Math.min(distinct.length, this.limit);
        this.selected = distinct;
        this.refreshes++;
        for (const slot of this.slots) {
            if (!slot.key || slot.retiring) continue;
            const candidate = distinct.find(item => item.key === slot.key);
            if (!candidate || candidate.sound !== slot.sound) this.retire(slot);
            else {
                const moved = !slot.position.equals(candidate);
                slot.candidate = candidate;
                slot.position.set(candidate.x, candidate.y, candidate.z);
                if (moved) slot.loop?.setPosition(slot.position);
                if (slot.pitch !== candidate.pitch) {
                    slot.pitch = candidate.pitch;
                    slot.loop?.setPitch(slot.pitch);
                }
                if (moved || !this.pathValid(slot.path, eye)) this.startRay(slot, eye);
            }
        }
    }

    assign(eye) {
        for (const candidate of this.selected) {
            // A fading owner keeps its reservation until onended, even if its
            // replacement uses the same impact with a different recording.
            if (this.slots.some(slot => slot.key === candidate.key)) continue;
            if (this.slots.filter(slot => slot.key).length >= this.limit) break;
            const slot = this.slots.find(item => !item.key);
            if (!slot || !this.validImpact(candidate)) continue;
            slot.key = candidate.key;
            slot.sound = candidate.sound;
            slot.candidate = candidate;
            slot.position.set(candidate.x, candidate.y, candidate.z);
            slot.pitch = candidate.pitch;
            this.startRay(slot, eye);
        }
    }

    dependenciesValid(dependencies) {
        for (const dep of dependencies) {
            const chunk = this.game.world.getChunk(dep.cx, dep.cz) ?? null;
            if (chunk !== dep.chunk || chunk?.blocks !== dep.blocks ||
                (chunk?.meshRevision ?? 0) !== dep.revision || (chunk?.version ?? 0) !== dep.version) return false;
        }
        return true;
    }

    pathValid(path, eye) {
        return path && (path.eyeX - eye.x) ** 2 + (path.eyeY - eye.y) ** 2 + (path.eyeZ - eye.z) ** 2 < .25 ** 2 &&
            this.dependenciesValid(path.dependencies);
    }

    startRay(slot, eye) {
        const x = Math.floor(eye.x), y = Math.floor(eye.y), z = Math.floor(eye.z);
        const dx = slot.position.x - eye.x, dy = slot.position.y - eye.y, dz = slot.position.z - eye.z;
        const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
        slot.ray = { x, y, z, sx, sy, sz, stepX: dx ? Math.abs(1 / dx) : Infinity,
            stepY: dy ? Math.abs(1 / dy) : Infinity, stepZ: dz ? Math.abs(1 / dz) : Infinity,
            tx: dx ? ((sx > 0 ? x + 1 : x) - eye.x) / dx : Infinity,
            ty: dy ? ((sy > 0 ? y + 1 : y) - eye.y) / dy : Infinity,
            tz: dz ? ((sz > 0 ? z + 1 : z) - eye.z) / dz : Infinity,
            eyeX: eye.x, eyeY: eye.y, eyeZ: eye.z, dependencies: [], cells: 0, gain: 1, done: false };
    }

    rayCell(ray) {
        const cx = Math.floor(ray.x / S), cz = Math.floor(ray.z / S);
        let dep;
        for (const item of ray.dependencies) if (item.cx === cx && item.cz === cz) { dep = item; break; }
        if (!dep) {
            const chunk = this.game.world.getChunk(cx, cz) ?? null;
            dep = { cx, cz, chunk, blocks: chunk?.blocks, revision: chunk?.meshRevision ?? 0, version: chunk?.version ?? 0 };
            ray.dependencies.push(dep);
        }
        if (!dep.chunk) { ray.gain = 0; ray.done = true; return; }
        const id = blockAt(dep.chunk, ray.x, ray.y, ray.z, cx, cz);
        if (isOpaqueId(id)) ray.gain *= .28;
        else if (isSolidId(id)) ray.gain *= .65;
        ray.cells++;
        if (ray.gain < .04) { ray.gain = .04; ray.done = true; return; }
        const next = Math.min(ray.tx, ray.ty, ray.tz);
        if (next > 1) { ray.done = true; return; }
        if (ray.cells >= WATERFALL_AUDIO_CAPS.rayCells) { ray.gain = 0; ray.done = true; return; }
        if (ray.tx <= ray.ty && ray.tx <= ray.tz) { ray.x += ray.sx; ray.tx += ray.stepX; }
        else if (ray.ty <= ray.tz) { ray.y += ray.sy; ray.ty += ray.stepY; }
        else { ray.z += ray.sz; ray.tz += ray.stepZ; }
    }

    trace() {
        if (!this.slots.some(slot => slot.ray)) return;
        const deadline = this.now() + WATERFALL_AUDIO_CAPS.msPerUpdate;
        let misses = 0;
        while (this.lastProcessed < WATERFALL_AUDIO_CAPS.cellsPerUpdate && this.now() < deadline && misses < this.slots.length) {
            const slot = this.slots[this.rayCursor++ % this.slots.length], ray = slot.ray;
            if (!ray) { misses++; continue; }
            misses = 0;
            this.rayCell(ray);
            this.lastProcessed++;
            this.rayCells++;
            if (ray.done) {
                slot.occlusion = this.dependenciesValid(ray.dependencies) ? ray.gain : 0;
                slot.path = ray;
                slot.ray = null;
            }
        }
    }

    update(dt, underwater = false) {
        this.lastProcessed = 0;
        this.lastMs = 0;
        if (this.disposed) return;
        const game = this.game, sounds = game.sounds;
        this.underwater = Boolean(underwater);
        for (const slot of this.slots) if (slot.loop?.ended) this.clear(slot);
        // Never overwrite SoundManager's frozen playbackRate while paused.
        if (!sounds || sounds.active === false) return;
        const start = this.now();
        const step = Math.min(.25, Math.max(0, Number.isFinite(dt) ? dt : 0));
        const eye = game.camera?.position ?? game.view?.position;
        if (!eye) return;
        const limit = !this.amount ? 0 : this.amount <= .35 || game.settings?.get('potato')
            ? WATERFALL_AUDIO_CAPS.potatoVoices : WATERFALL_AUDIO_CAPS.voices;
        if (limit !== this.limit) { this.limit = limit; this.refresh = 0; }
        this.refresh -= step;
        if (this.refresh <= 0) { this.refresh = WATERFALL_AUDIO_CAPS.refresh; this.select(eye); }
        for (const slot of this.slots) if (slot.key && !slot.retiring &&
            (slot.loop?.stopped || !this.validImpact(slot.candidate))) this.retire(slot);
        this.assign(eye);
        this.trace();
        const mix = 1 / Math.sqrt(Math.max(1, this.selected.length));
        for (const slot of this.slots) {
            if (!slot.key || slot.retiring) continue;
            const distance = slot.position.distanceTo(eye);
            const edge = Math.max(0, Math.min(1, (WATERFALL_AUDIO_CAPS.radius - distance) / 6));
            slot.target = slot.candidate.volume * slot.occlusion * edge * mix * this.amount * (this.underwater ? .24 : 1);
            const next = slot.gain + (slot.target - slot.gain) * (1 - Math.exp(-step * 5));
            const changed = Math.abs(next - slot.gain) > .00005;
            slot.gain = Math.abs(next - slot.target) < .0001 ? slot.target : next;
            slot.retry = Math.max(0, slot.retry - step);
            if (!slot.loop && slot.gain > .004 && slot.retry === 0) {
                slot.loop = sounds.loop(slot.sound, { position: slot.position, volume: 0, pitch: slot.pitch });
                slot.retry = .3;
                slot.loop?.setVolume(slot.gain, .2);
            } else if (slot.loop && changed) slot.loop.setVolume(slot.gain, .2);
        }
        this.lastMs = this.now() - start;
    }

    stats() {
        const occupied = this.slots.filter(slot => slot.key);
        return { emitters: this.selected.length, loops: occupied.filter(slot => slot.loop && !slot.loop.stopped).length,
            voices: occupied.filter(slot => slot.loop && !slot.loop.ended).length, reserved: occupied.length,
            fading: occupied.filter(slot => slot.retiring && slot.loop && !slot.loop.ended).length,
            occluded: occupied.filter(slot => !slot.retiring && slot.occlusion < .99).length,
            queued: occupied.filter(slot => slot.ray).length, underwater: this.underwater, limit: this.limit,
            lastProcessed: this.lastProcessed, lastMs: this.lastMs, rayCells: this.rayCells, refreshes: this.refreshes,
            caps: WATERFALL_AUDIO_CAPS, sources: occupied.map(slot => ({ key: slot.key, sound: slot.sound,
                fall: slot.candidate?.fall, gain: slot.gain, target: slot.target, occlusion: slot.occlusion,
                retiring: slot.retiring, position: { x: slot.position.x, y: slot.position.y, z: slot.position.z } })) };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const slot of this.slots) {
            slot.loop?.stop(.1);
            this.clear(slot);
        }
        this.selected = EMPTY;
        this.game = null;
    }
}
