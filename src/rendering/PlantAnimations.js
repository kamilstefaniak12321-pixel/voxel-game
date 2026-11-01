import { CHUNK_SIZE } from '../config.js';
import { getBlueberryFaces } from './BlueberryGeometry.js';
import { BLUEBERRY_IDS, isAnimatedPlant, animationKind, blueberryPose,
    sampleBlueberryAnimation, transformBlueberryVertex, PLANT_CLIP_SECONDS } from './BlueberryAnimation.js';
import { tuftInfo, isTuftAnimated, tuftAnimationKind, TUFT_CLIP_SECONDS, TUFT_HARVEST_SWITCH,
    tuftPose, sampleTuftAnimation, transformTuftVertex, isFlowerFace } from './TuftAnimation.js';
import { getRiverPlantFaces } from './RiverPlantGeometry.js';
import { blockRenderData } from './BlockRenderData.js';

export const MAX_PLANT_ANIMATIONS = 12;
export const PLANT_ANIMATION_DISTANCE = 48;

// Rodziny animacji: borówka (jeden wspólny model wszystkich etapów,
// BlueberryAnimation.js) i rośliny z paczek - kępki i krzewy (model
// etapu, TuftAnimation.js). Ta sama obsługa przejść, limitu i przebudowy.
const BLUEBERRY = {
    isAnimated: isAnimatedPlant,
    kind: animationKind,
    seconds: PLANT_CLIP_SECONDS,
    begin(event, before, after, previous) {
        const from = previous ? sampleBlueberryAnimation(previous, previous.time) : blueberryPose(before);
        // Placing a young plant grows to its own size, rather than shrinking
        // an invisible adult; interrupted clips retain their current pose.
        if (!previous && event.kind === 'place') from.size = blueberryPose(after).size;
        event.from = from;
        event.to = blueberryPose(after);
        if (event.kind === 'break') event.to.size = from.size;
        event.renderId = BLUEBERRY_IDS.full;
        event.pose = blueberryPose(0);
    },
    sample: sampleBlueberryAnimation,
    faces: () => getBlueberryFaces('full'),
    transform: (face, vertex, index, pose, event, out) => transformBlueberryVertex(face, vertex, pose, out),
    shadeHeight: (vertex, pose) => vertex[1] * pose.size
};

const TUFT = {
    isAnimated: isTuftAnimated,
    kind: tuftAnimationKind,
    seconds: TUFT_CLIP_SECONDS,
    begin(event, before, after, previous) {
        const old = tuftInfo(before), next = tuftInfo(after);
        const shown = previous ? sampleTuftAnimation(previous, previous.time).size * (previous.height ?? 1) : null;
        const kind = event.kind;
        // Model rysowany przez animację: przy zniszczeniu i na początku
        // zbioru - poprzedni etap, poza tym - nowy.
        const drawn = kind === 'break' || kind === 'harvest' ? before : after;
        event.renderId = drawn;
        event.height = tuftInfo(drawn).height;
        event.phase = 0;
        event.from = { size: 1 };
        if (kind === 'place') event.from.size = shown !== null ? Math.min(1, shown / event.height) : .35;
        else if (kind === 'grow') event.from.size = Math.max(.4, Math.min(1, (shown ?? old.height) / next.height));
        else if (kind === 'break') event.from.size = shown !== null ? Math.min(1, shown / event.height) : 1;
        event.afterHeight = next?.height ?? 0;
        event.flowerFaces = kind === 'harvest' ? new WeakSet() : null;
        event.pose = tuftPose();
        // Ugięcie wzdłuż x albo z - różnie dla różnych miejsc.
        event.swayX = ((event.x * 7 + event.z * 13) & 1) === 0;
    },
    // Zbiór: gdy kwiaty zniknęły, rysujemy etap po zbiorze - płynnie od
    // wysokości poprzedniego. Zwraca true, gdy trzeba przebudować chunk.
    advance(event) {
        if (event.kind !== 'harvest' || event.phase !== 0 || event.time < TUFT_HARVEST_SWITCH) return false;
        event.phase = 1;
        event.from = { size: Math.max(1, Math.min(1.6, event.height / Math.max(.05, event.afterHeight))) };
        event.renderId = event.after;
        event.height = event.afterHeight;
        return true;
    },
    sample: sampleTuftAnimation,
    faces(event, range) {
        const river = blockRenderData[event.renderId].riverPlant;
        const faces = getRiverPlantFaces(river.kind, range.transform.variant, river.waterlogged, river.tuft, range.mask);
        if (event.flowerFaces) for (const face of faces) if (isFlowerFace(face, river.tuft)) event.flowerFaces.add(face);
        return faces;
    },
    transform: transformTuftVertex,
    // Kępki: światło i cień jak w modelu bez animacji (bez przeliczania
    // kolorów co klatkę - duże krzewy mają tysiące wierzchołków).
    shadeHeight: null
};

// Atrybuty geometrii zmieniane przez animację (kępki - bez kolorów).
const SHADED = ['position', 'normal', 'plantMotion', 'color', 'atmosphereLight', 'surfaceOcclusion'];
const UNSHADED = ['position', 'normal', 'plantMotion'];

const familyOf = (id) => (BLUEBERRY.isAnimated(id) ? BLUEBERRY : TUFT.isAnimated(id) ? TUFT : null);

// Transient visual overrides, never saved. The normal block-change remesh adds
// canonical topology; then only affected vertex ranges are uploaded. No extra
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
        const family = familyOf(after) ?? familyOf(before);
        if (!family && !this.chunks.get(chunk)?.has(index)) return;
        const kind = family?.kind(before, after);
        if (kind) this.start(chunk, index, before, after, kind, family);
        else this.remove(this.chunks.get(chunk)?.get(index));
    }

    reject(x, y, z) {
        const chunk = this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
        if (!chunk) return false;
        const index = chunk.index(x - chunk.cx * CHUNK_SIZE, y, z - chunk.cz * CHUNK_SIZE);
        const id = chunk.blocks[index];
        const family = familyOf(id);
        return family !== null && this.start(chunk, index, id, id, 'reject', family);
    }

    start(chunk, index, before, after, kind, family = familyOf(after) ?? familyOf(before)) {
        const found = this.chunks.get(chunk)?.get(index);
        const previous = found?.family === family ? found : null;
        if (previous?.kind === 'reject' && kind === 'reject') return false;
        const lx = index % CHUNK_SIZE, y = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        const lz = Math.floor(index / CHUNK_SIZE) % CHUNK_SIZE;
        const x = chunk.cx * CHUNK_SIZE + lx, z = chunk.cz * CHUNK_SIZE + lz;
        const pos = this.camera.position;
        if (Math.hypot(x + .5 - pos.x, y + .4 - pos.y, z + .5 - pos.z) > PLANT_ANIMATION_DISTANCE ||
            (!found && this.active.size >= MAX_PLANT_ANIMATIONS) || !chunk.mesh) {
            this.remove(found);
            return false;
        }
        const event = { chunk, index, lx, y, lz, x, z, family, after, kind,
            duration: family.seconds[kind], time: 0, wait: 0, binding: null };
        family.begin(event, before, after, previous);
        this.remove(found);
        if (!this.chunks.has(chunk)) this.chunks.set(chunk, new Map());
        this.chunks.get(chunk).set(index, event);
        this.active.add(event);
        this.world.markDirty(chunk);
        return true;
    }

    remove(event, remesh = true) {
        if (!event) return;
        this.active.delete(event);
        const entries = this.chunks.get(event.chunk);
        entries?.delete(event.index);
        if (!entries?.size) this.chunks.delete(event.chunk);
        event.binding = null;
        if (remesh && this.world.getChunk(event.chunk.cx, event.chunk.cz) === event.chunk) this.world.markDirty(event.chunk);
    }

    bindGeometry(geometry, ranges) {
        for (const range of ranges) {
            const event = range.event;
            const faces = event.family.faces(event, range);
            const start = range.start * 4, count = faces.length * 4;
            const copy = name => (event.family.shadeHeight ? geometry.attributes[name].array.slice(start * 4, (start + count) * 4) : null);
            event.binding = { geometry, start, count, faces, transform: range.transform,
                color: copy('color'), atmosphereLight: copy('atmosphereLight') };
            this.paint(event);
        }
    }

    paint(event) {
        const pose = event.family.sample(event, event.time, event.pose);
        const binding = event.binding;
        const { geometry, start, count, transform, faces } = binding;
        const { cos, sin } = transform;
        const a = geometry.attributes;
        const family = event.family;
        let vertexIndex = start, localIndex = 0;
        for (const face of faces) {
            for (let i = 0; i < face.vertices.length; i++) {
                const vertex = face.vertices[i];
                const v = family.transform(face, vertex, i, pose, event, this.scratch);
                const p = vertexIndex * 3, c = vertexIndex * 4;
                a.position.array[p] = event.lx + transform.x + cos * v[0] - sin * v[2];
                a.position.array[p + 1] = event.y + v[1];
                a.position.array[p + 2] = event.lz + transform.z + sin * v[0] + cos * v[2];
                a.normal.array[p] = cos * v[3] - sin * v[5];
                a.normal.array[p + 1] = v[4];
                a.normal.array[p + 2] = sin * v[3] + cos * v[5];
                a.plantMotion.array[vertexIndex * 2] = v[6];
                if (family.shadeHeight) {
                    // Match the static young model's shade at the endpoints.
                    const shade = .79 + Math.min(1, Math.max(0, family.shadeHeight(vertex, pose, v)) / .8) * .21;
                    const ratio = shade / (.79 + Math.min(1, vertex[1] / .8) * .21);
                    for (let channel = 0; channel < 4; channel++) {
                        a.color.array[c + channel] = Math.round(binding.color[localIndex * 4 + channel] * ratio);
                        a.atmosphereLight.array[c + channel] = Math.round(binding.atmosphereLight[localIndex * 4 + channel] * (channel === 3 ? 1 : ratio));
                    }
                    a.surfaceOcclusion.array[vertexIndex] = Math.round(shade * 255);
                }
                vertexIndex++; localIndex++;
            }
        }
        for (const name of family.shadeHeight ? SHADED : UNSHADED) {
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
        if (!this.active.size) return;
        const changed = new Set();
        const completed = new Set();
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
            if (event.family.advance?.(event)) {
                // Inny model (np. etap po zbiorze) - zwykła przebudowa chunka.
                event.binding = null;
                event.wait = 0;
                this.world.markDirty(chunk);
                continue;
            }
            this.paint(event);
            changed.add(chunk);
            if (event.time >= event.duration) {
                // The final pose already matches the real block. Collapsed
                // faces are harmless until the next ordinary chunk remesh;
                // rebuilding a whole terrain chunk here causes frame spikes.
                this.remove(event, false);
                completed.add(chunk);
            }
        }
        for (const chunk of changed) this.onFrame?.(chunk);
        for (const chunk of completed) this.world.onMeshChanged?.(chunk);
    }

    dispose() {
        for (const event of this.active) this.remove(event);
        this.chunks.clear();
        if (this.world.plantAnimations === this) this.world.plantAnimations = null;
    }
}
