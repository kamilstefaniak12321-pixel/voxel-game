import { CHUNK_SIZE } from '../config.js';
import { getBlueberryFaces } from './BlueberryGeometry.js';
import { BLUEBERRY_IDS, isAnimatedPlant, animationKind, blueberryPose,
    sampleBlueberryAnimation, transformBlueberryVertex, PLANT_CLIP_SECONDS } from './BlueberryAnimation.js';

export const MAX_PLANT_ANIMATIONS = 24;
export const PLANT_ANIMATION_DISTANCE = 48;

// Transient visual overrides, never saved. A chunk remesh at each end changes
// topology; in between only the affected vertex ranges are uploaded. No extra
// objects, materials, draw calls, or work for the other plants in the world.
export class PlantAnimations {
    constructor(world, camera) {
        this.world = world;
        this.camera = camera;
        this.chunks = new Map();
        this.active = new Set();
        this.onFrame = null;
        this.scratch = new Float64Array(7);
        world.plantAnimations = this;
    }

    overridesFor(chunk) { return this.chunks.get(chunk); }

    blockChanged(chunk, index, before, after) {
        if (!isAnimatedPlant(before) && !isAnimatedPlant(after) && !this.chunks.get(chunk)?.has(index)) return;
        const kind = animationKind(before, after);
        if (kind) this.start(chunk, index, before, after, kind);
        else this.remove(this.chunks.get(chunk)?.get(index));
    }

    reject(x, y, z) {
        const chunk = this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        if (!chunk) return false;
        const index = chunk.index(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE);
        const id = chunk.blocks[index];
        return isAnimatedPlant(id) && this.start(chunk, index, id, id, 'reject');
    }

    start(chunk, index, before, after, kind) {
        const previous = this.chunks.get(chunk)?.get(index);
        if (previous?.kind === 'reject' && kind === 'reject') return false;
        const lx = index % CHUNK_SIZE, y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        const lz = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const x = chunk.cx * CHUNK_SIZE + lx, z = chunk.cz * CHUNK_SIZE + lz;
        const pos = this.camera.position;
        if (Math.hypot(x + .5 - pos.x, y + .4 - pos.y, z + .5 - pos.z) > PLANT_ANIMATION_DISTANCE ||
            (!previous && this.active.size >= MAX_PLANT_ANIMATIONS) || !chunk.mesh) {
            this.remove(previous);
            return false;
        }
        const from = previous ? sampleBlueberryAnimation(previous, previous.time) : blueberryPose(before);
        // Placing a young plant grows to its own size, rather than shrinking
        // an invisible adult; interrupted clips retain their current pose.
        if (!previous && kind === 'place') from.size = blueberryPose(after).size;
        this.remove(previous);
        const event = { chunk, index, lx, y, lz, x, z, from, to: blueberryPose(after),
            after, kind, duration: PLANT_CLIP_SECONDS[kind], time: 0, wait: 0,
            renderId: BLUEBERRY_IDS.full, pose: blueberryPose(0), binding: null };
        if (kind === 'break') event.to.size = from.size;
        if (!this.chunks.has(chunk)) this.chunks.set(chunk, new Map());
        this.chunks.get(chunk).set(index, event);
        this.active.add(event);
        this.world.markDirty(chunk);
        return true;
    }

    remove(event) {
        if (!event) return;
        this.active.delete(event);
        const entries = this.chunks.get(event.chunk);
        entries?.delete(event.index);
        if (!entries?.size) this.chunks.delete(event.chunk);
        event.binding = null;
        if (this.world.getChunk(event.chunk.cx, event.chunk.cz) === event.chunk) this.world.markDirty(event.chunk);
    }

    bindGeometry(geometry, ranges) {
        for (const range of ranges) {
            const event = range.event;
            const start = range.start * 4, count = getBlueberryFaces('full').length * 4;
            const copy = name => geometry.attributes[name].array.slice(start * 4, (start + count) * 4);
            event.binding = { geometry, start, count, transform: range.transform,
                color: copy('color'), atmosphereLight: copy('atmosphereLight') };
            this.paint(event);
        }
    }

    paint(event) {
        const pose = sampleBlueberryAnimation(event, event.time, event.pose);
        const binding = event.binding;
        const { geometry, start, count, transform } = binding;
        const { cos, sin } = transform;
        const a = geometry.attributes;
        let vertexIndex = start, localIndex = 0;
        for (const face of getBlueberryFaces('full')) {
            for (const vertex of face.vertices) {
                const v = transformBlueberryVertex(face, vertex, pose, this.scratch);
                const p = vertexIndex * 3, c = vertexIndex * 4;
                a.position.array[p] = event.lx + transform.x + cos * v[0] - sin * v[2];
                a.position.array[p + 1] = event.y + v[1];
                a.position.array[p + 2] = event.lz + transform.z + sin * v[0] + cos * v[2];
                a.normal.array[p] = cos * v[3] - sin * v[5];
                a.normal.array[p + 1] = v[4];
                a.normal.array[p + 2] = sin * v[3] + cos * v[5];
                a.plantMotion.array[vertexIndex * 2] = v[6];
                // Match the static young model's shade at the endpoints.
                const shade = .79 + Math.min(1, Math.max(0, vertex[1] * pose.size) / .8) * .21;
                const ratio = shade / (.79 + Math.min(1, vertex[1] / .8) * .21);
                for (let channel = 0; channel < 4; channel++) {
                    a.color.array[c + channel] = Math.round(binding.color[localIndex * 4 + channel] * ratio);
                    a.atmosphereLight.array[c + channel] = Math.round(binding.atmosphereLight[localIndex * 4 + channel] * (channel === 3 ? 1 : ratio));
                }
                a.surfaceOcclusion.array[vertexIndex] = Math.round(shade * 255);
                vertexIndex++; localIndex++;
            }
        }
        for (const name of ['position', 'normal', 'plantMotion', 'color', 'atmosphereLight', 'surfaceOcclusion']) {
            const attribute = a[name];
            // Union pending ranges, also when a chunk is outside the frustum:
            // updateRanges must not grow forever while nothing uploads them.
            let lo = start * attribute.itemSize, hi = (start + count) * attribute.itemSize;
            for (const range of attribute.updateRanges) {
                lo = Math.min(lo, range.start); hi = Math.max(hi, range.start + range.count);
            }
            attribute.clearUpdateRanges();
            attribute.addUpdateRange(lo, hi - lo);
            attribute.needsUpdate = true;
        }
    }

    update(dt) {
        const changed = new Set();
        for (const event of this.active) {
            const { chunk } = event;
            if (this.world.getChunk(chunk.cx, chunk.cz) !== chunk || chunk.blocks[event.index] !== event.after) {
                this.remove(event); continue;
            }
            if (!event.binding || event.binding.geometry !== chunk.mesh?.geometry) {
                event.wait += dt;
                if (event.wait > 1) this.remove(event);
                continue;
            }
            event.time = Math.min(event.duration, event.time + Math.max(0, dt));
            this.paint(event);
            changed.add(chunk);
            if (event.time >= event.duration) this.remove(event);
        }
        for (const chunk of changed) this.onFrame?.(chunk);
    }

    dispose() {
        for (const event of this.active) this.remove(event);
        this.chunks.clear();
        if (this.world.plantAnimations === this) this.world.plantAnimations = null;
    }
}
