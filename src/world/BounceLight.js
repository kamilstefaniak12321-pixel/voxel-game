import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT, BOUNCE_SIZE, BOUNCE_HEIGHT, LIGHT_CURVE } from '../config.js';
import { BLOCK_TYPES, getBlockTypeById, isOpaqueId, isLeavesId } from '../blocks/BlockRegistry.js';
import { atlasAveragesReady, getAtlasAverage, getTileColors } from '../rendering/TextureAtlas.js';

// Jedno odbicie: sonda zbiera tylko pierwszą widoczną powierzchnię.
// Ściana odbija źródła i niebo, nigdy poprzedni wynik tego bufora.
const NX = BOUNCE_SIZE + 2, NZ = NX, NY = BOUNCE_HEIGHT + 2;
const NXZ = NX * NZ, CELLS = NXZ * NY, LAYER_BYTES = CELLS * 4;
const REACH = 6, SOURCE_REACH = 96, MOVE_STEP = 8, ANGLE_STEP = 0.025;
const NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const DIRECTIONS = [...NORMALS], diagonal = 1 / Math.sqrt(3);
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    DIRECTIONS.push([x * diagonal, y * diagonal, z * diagonal]);
}
const STANDARD_RAYS = DIRECTIONS.length;
for (let zero = 0; zero < 3; zero++) for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const direction = [0, 0, 0];
    direction[(zero + 1) % 3] = a / Math.sqrt(2);
    direction[(zero + 2) % 3] = b / Math.sqrt(2);
    DIRECTIONS.push(direction);
}
const LUMA = [0.2126, 0.7152, 0.0722];
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const finite = (x, fallback) => Number.isFinite(x) ? x : fallback;
const rgbArray = color => color?.isColor ? [color.r, color.g, color.b] : color ?? [0, 0, 0];
const dirArray = value => value?.isVector3 ? [value.x, value.y, value.z] : value ?? [0, -1, 0];
const take = set => { const value = set.values().next().value; set.delete(value); return value; };

export const BOUNCE_RANGE = 1;
export const bounceUniforms = {
    uBounceLight: { value: null },
    uBounceOrigin: { value: new THREE.Vector3() },
    uBounceSize: { value: new THREE.Vector3(NX, NY, NZ) },
    uBounceSun: { value: new THREE.Color(0, 0, 0) },
    uBounceMoon: { value: new THREE.Color(0, 0, 0) },
    uBounceSky: { value: new THREE.Color(0, 0, 0) },
    uBounceGround: { value: new THREE.Color(0, 0, 0) },
    uBounceSaturation: { value: 0.65 },
    // Kompatybilny master: strength albo 0. Wynik jest już radiancją.
    uBounceColor: { value: new THREE.Color(0, 0, 0) },
    uBounceOutdoor: { value: 0 }
};

export const BOUNCE_GLSL = /* glsl */ `
    uniform highp sampler3D uBounceLight;
    uniform vec3 uBounceOrigin;
    uniform vec3 uBounceSize;
    uniform vec3 uBounceColor;
    uniform vec3 uBounceSun;
    uniform vec3 uBounceMoon;
    uniform vec3 uBounceSky;
    uniform vec3 uBounceGround;
    uniform float uBounceSaturation;
    uniform float uBounceOutdoor;
    vec3 bounceTransfer(vec3 cell, float layer) {
        vec3 encoded = texture(uBounceLight, vec3(cell.x, cell.z, (cell.y + layer) * 0.25)).rgb;
        vec3 transfer = encoded * encoded;
        float luma = dot(transfer, vec3(0.2126, 0.7152, 0.0722));
        return mix(vec3(luma), transfer, uBounceSaturation);
    }
    vec3 bounceLight(vec3 worldPosition, vec3 worldNormal, float skyLight) {
        if (uBounceColor.r + uBounceColor.g + uBounceColor.b <= 0.0) return vec3(0.0);
        vec3 cell = (worldPosition + worldNormal * 0.5 - uBounceOrigin) / uBounceSize;
        if (any(lessThan(cell, vec3(0.0))) || any(greaterThan(cell, vec3(1.0)))) return vec3(0.0);
        vec3 edge = min(cell, 1.0 - cell) * uBounceSize;
        float fade = smoothstep(1.0, 6.0, min(min(edge.x, edge.y), edge.z));
        vec3 light = vec3(0.0);
        if (dot(uBounceSun, vec3(1.0)) > 0.0) light += bounceTransfer(cell, 0.0) * uBounceSun;
        if (dot(uBounceMoon, vec3(1.0)) > 0.0) light += bounceTransfer(cell, 1.0) * uBounceMoon;
        if (dot(uBounceSky, vec3(1.0)) > 0.0) light += bounceTransfer(cell, 2.0) * uBounceSky;
        if (dot(uBounceGround, vec3(1.0)) > 0.0) light += bounceTransfer(cell, 3.0) * uBounceGround;
        return light * uBounceColor * fade;
    }
`;

// Liniowe albedo z atlasu. Maska identyczna z BlockRenderData zachowuje
// brąz ziemi na grass_side podczas nakładania koloru biomu.
const materials = new Map();
let materialRevision = 0;
function textureReflectance(tile) {
    const pixels = getTileColors(tile), base = [0, 0, 0], tinted = [0, 0, 0];
    const average = getAtlasAverage(tile);
    const samples = pixels.length ? pixels : [average ?? { r: 0.35, g: 0.35, b: 0.35 }];
    for (const color of samples) {
        const mask = smooth(0.01, 0.07, color.g - Math.max(color.r, color.b));
        for (const [c, value] of [color.r, color.g, color.b].entries()) {
            base[c] += value * (1 - mask) / samples.length;
            tinted[c] += value * mask / samples.length;
        }
    }
    return { base, tinted };
}
function material(id) {
    if (!materials.has(id)) {
        const definition = BLOCK_TYPES[getBlockTypeById(id)], textures = definition?.textures ?? {};
        const side = textures.side ?? textures.all;
        materials.set(id, {
            tint: definition?.tint === true, reflect: definition?.reflect ?? 1,
            side: textureReflectance(side), top: textureReflectance(textures.top ?? side),
            bottom: textureReflectance(textures.bottom ?? side)
        });
    }
    return materials.get(id);
}
function reflectance(id, face, tint = [1, 1, 1]) {
    const m = material(id), t = face === 2 ? m.top : face === 3 ? m.bottom : m.side;
    return t.base.map((value, c) => clamp((value + t.tinted[c] * (m.tint ? tint[c] : 1)) * m.reflect, 0, 0.9));
}
atlasAveragesReady.then(() => { materials.clear(); materialRevision++; });
export function getReflect(id) { return reflectance(id, 0); }

// Jedna kolejka przestrzenna współdzielona przez sceny; blisko gracza
// wynik pojawia się najpierw. Przy ruchu nie sortujemy komórek ponownie.
const ORDER = Array.from({ length: CELLS }, (_, i) => i).filter(i => {
    const x = i % NX, z = Math.floor(i / NX) % NZ, y = Math.floor(i / NXZ);
    return x > 0 && z > 0 && y > 0 && x < NX - 1 && z < NZ - 1 && y < NY - 1;
});
const centerDistance = i => Math.abs(i % NX - NX / 2) + Math.abs(Math.floor(i / NX) % NZ - NZ / 2)
    + Math.abs(Math.floor(i / NXZ) - NY / 2);
ORDER.sort((a, b) => centerDistance(a) - centerDistance(b));

export class BounceLight {
    constructor({ budgetMs = 0.6, maxWork = 256, now = () => performance.now(), reflectance: sampler = reflectance } = {}) {
        this.budgetMs = budgetMs; this.maxWork = maxWork; this.now = now; this.reflectance = sampler;
        this.origin = new THREE.Vector3(Infinity, 0, 0);
        this.rays = STANDARD_RAYS;
        this.hitKeys = new Int32Array(CELLS * this.rays).fill(-1);
        this.hitWeights = new Uint8Array(CELLS * this.rays);
        this.data = new Uint8Array(LAYER_BYTES * 4);
        this.texture = new THREE.Data3DTexture(this.data, NX, NZ, NY * 4);
        this.texture.format = THREE.RGBAFormat; this.texture.type = THREE.UnsignedByteType;
        this.texture.minFilter = THREE.LinearFilter; this.texture.magFilter = THREE.LinearFilter;
        this.texture.unpackAlignment = 1; this.texture.needsUpdate = true;
        this.surfaces = new Map();
        this.geometryQueue = new Set(); this.sourceQueue = new Set(); this.probeQueue = new Set();
        this.initialCursor = ORDER.length; this.built = new Uint8Array(CELLS);
        this.sourceInvalidation = false; this.dirtyRect = null; this.invalidationJob = null;
        this.valid = true;
        this.markStats = { calls: 0, milliseconds: 0, maxMilliseconds: 0 };
        this.colors = Array.from({ length: 4 }, () => [0, 0, 0]);
        this.directions = [[0, -1, 0], [0, -1, 0]]; this.activeSources = [false, false];
        this.enabled = false; this.strength = 0.18; this.saturation = 0.65;
        this.updates = 0; this.invalidations = 0; this.lastWrite = -Infinity;
        this.lastFrame = { milliseconds: 0, work: 0 };
        this.materialRevision = materialRevision; this.changed = false;
    }

    bind() {
        bounceUniforms.uBounceLight.value = this.texture;
        bounceUniforms.uBounceOrigin.value.copy(this.origin);
        for (const [i, name] of ['uBounceSun','uBounceMoon','uBounceSky','uBounceGround'].entries()) {
            bounceUniforms[name].value.setRGB(...this.colors[i]);
        }
        bounceUniforms.uBounceSaturation.value = this.saturation;
        const power = this.enabled && this.valid ? this.strength : 0;
        bounceUniforms.uBounceColor.value.setRGB(power, power, power);
        return this;
    }

    update(world, center, options = {}) {
        const start = this.now();
        this.enabled = options.enabled === true;
        this.strength = clamp(finite(options.strength, 0.18));
        this.saturation = clamp(finite(options.saturation, 0.65));
        const budget = options.budgetMs === undefined ? this.budgetMs : Math.max(0, finite(options.budgetMs, this.budgetMs));
        this.activeBudget = budget;
        for (const [i, name] of ['sun','moon','sky','ground'].entries()) {
            const rgb = rgbArray(options[name]);
            for (let c = 0; c < 3; c++) this.colors[i][c] = Math.max(0, finite(rgb[c], 0));
        }
        this.bind(); // także wyłączenie źródła podczas wieloklatkowego zadania
        this.lastFrame = { milliseconds: 0, work: 0 };
        if (!this.enabled || this.strength === 0 || !world || !center) return;
        const rays = options.quality === 'high' ? DIRECTIONS.length : STANDARD_RAYS;
        if (rays !== this.rays) {
            this.rays = rays;
            this.hitKeys = new Int32Array(CELLS * rays).fill(-1);
            this.hitWeights = new Uint8Array(CELLS * rays);
            this.resetGeometry();
        }
        const ox = Math.floor(center.x) - (NX >> 1);
        const oy = Math.max(-1, Math.min(CHUNK_HEIGHT - NY + 1, Math.floor(center.y) - (NY >> 1)));
        const oz = Math.floor(center.z) - (NZ >> 1);
        if (!Number.isFinite(this.origin.x) || Math.abs(ox - this.origin.x) >= MOVE_STEP
            || Math.abs(oy - this.origin.y) >= MOVE_STEP || Math.abs(oz - this.origin.z) >= MOVE_STEP) {
            this.moveTo(ox, oy, oz);
        }
        if (this.materialRevision !== materialRevision) {
            this.materialRevision = materialRevision;
            this.resetGeometry();
        }
        let directionChanged = false;
        for (let i = 0; i < 2; i++) {
            const raw = dirArray(options[i === 0 ? 'sunDirection' : 'moonDirection']);
            const length = Math.hypot(...raw) || 1, next = raw.map(value => finite(value / length, 0));
            const dot = next.reduce((sum, value, axis) => sum + value * this.directions[i][axis], 0);
            const active = next[1] > 0 && this.colors[i].some(value => value > 0);
            if (dot < Math.cos(ANGLE_STEP) || active !== this.activeSources[i]) {
                this.directions[i] = next; this.activeSources[i] = active; directionChanged = true;
            }
        }
        if (directionChanged) this.invalidateSources();
        let work = 0;
        while (work < this.maxWork && this.now() - start < budget) {
            if (this.invalidationJob || this.sourceInvalidation || this.dirtyRect) this.continueInvalidation();
            else if (this.sourceQueue.size) {
                const surface = this.surfaces.get(take(this.sourceQueue));
                if (surface) this.updateSurface(world, surface);
            } else if (this.probeQueue.size) this.composeProbe(take(this.probeQueue));
            else if (this.geometryQueue.size) this.gatherProbe(world, take(this.geometryQueue));
            else if (this.initialCursor < ORDER.length) {
                const i = ORDER[this.initialCursor++];
                if (!this.built[i]) this.gatherProbe(world, i);
            }
            else break;
            work++;
        }
        if (this.changed && (this.ready || start - this.lastWrite >= 125)) this.upload(start);
        this.lastFrame = { milliseconds: Math.max(0, this.now() - start), work };
        this.bind();
    }

    get ready() { return this.initialCursor === ORDER.length && !this.invalidationJob && !this.sourceInvalidation && !this.dirtyRect
        && this.geometryQueue.size + this.sourceQueue.size + this.probeQueue.size === 0; }
    moveTo(x, y, z) { this.origin.set(x, y, z); this.resetGeometry(); }
    resetGeometry() {
        this.surfaces.clear(); this.sourceQueue.clear(); this.probeQueue.clear();
        this.geometryQueue.clear(); this.initialCursor = 0; this.built.fill(0);
        this.sourceInvalidation = false; this.dirtyRect = null; this.invalidationJob = null; this.valid = true;
        this.hitKeys.fill(-1); this.hitWeights.fill(0); this.data.fill(0);
        this.upload(this.now()); this.invalidations++;
    }
    invalidateSources() {
        if (!this.surfaces.size) return;
        this.sourceInvalidation = true;
    }

    markChunk(chunk) {
        const start = this.now();
        if (!Number.isFinite(this.origin.x)) return;
        const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;
        const intersects = radius => x0 < this.origin.x + NX + radius && x0 + CHUNK_SIZE > this.origin.x - radius
            && z0 < this.origin.z + NZ + radius && z0 + CHUNK_SIZE > this.origin.z - radius;
        if (!intersects(SOURCE_REACH)) return;
        // Tylko zebranie obszaru O(1). Skan i czyszczenie cache odbywają
        // się raz dla paczki zmian, porcjami w budżecie update(). Master
        // wygasa od razu, więc nowa ściana nie pokazuje starego światła.
        this.valid = false; this.sourceInvalidation = true;
        if (bounceUniforms.uBounceLight.value === this.texture) bounceUniforms.uBounceColor.value.setRGB(0, 0, 0);
        if (intersects(REACH)) {
            const r = this.dirtyRect;
            this.dirtyRect = r ? { minX: Math.min(r.minX, x0 - 1), maxX: Math.max(r.maxX, x0 + CHUNK_SIZE),
                minZ: Math.min(r.minZ, z0 - 1), maxZ: Math.max(r.maxZ, z0 + CHUNK_SIZE) }
                : { minX: x0 - 1, maxX: x0 + CHUNK_SIZE, minZ: z0 - 1, maxZ: z0 + CHUNK_SIZE };
        }
        const elapsed = Math.max(0, this.now() - start);
        this.markStats.calls++; this.markStats.milliseconds += elapsed;
        this.markStats.maxMilliseconds = Math.max(this.markStats.maxMilliseconds, elapsed);
    }

    continueInvalidation() {
        if (!this.invalidationJob) {
            this.invalidationJob = { rect: this.dirtyRect, surfaces: this.surfaces.entries(), cursor: 0, sourcesDone: false };
            this.dirtyRect = null; this.sourceInvalidation = false; this.valid = false;
            this.data.fill(0, 0, LAYER_BYTES * 2);
            this.changed = true; this.invalidations++;
        }
        const job = this.invalidationJob, rect = job.rect;
        if (!job.sourcesDone) {
            for (let work = 0; work < 16; work++) {
                const next = job.surfaces.next();
                if (next.done) { job.sourcesDone = true; break; }
                const [key, surface] = next.value;
                if (rect && surface.x >= rect.minX && surface.x <= rect.maxX && surface.z >= rect.minZ && surface.z <= rect.maxZ) {
                    this.surfaces.delete(key); this.sourceQueue.delete(key);
                } else this.sourceQueue.add(key);
            }
            return;
        }
        const end = Math.min(ORDER.length, job.cursor + 32);
        while (job.cursor < end) {
            const i = ORDER[job.cursor++], x = this.origin.x + i % NX, z = this.origin.z + Math.floor(i / NX) % NZ;
            if (rect && x >= rect.minX - REACH && x <= rect.maxX + REACH && z >= rect.minZ - REACH && z <= rect.maxZ + REACH) {
                if (this.built[i]) { this.geometryQueue.add(i); this.built[i] = 0; }
                this.probeQueue.delete(i);
                this.hitKeys.fill(-1, i * this.rays, (i + 1) * this.rays);
                this.hitWeights.fill(0, i * this.rays, (i + 1) * this.rays);
                for (let layer = 0; layer < 4; layer++) this.data.fill(0, layer * LAYER_BYTES + i * 4, layer * LAYER_BYTES + i * 4 + 4);
            } else if (this.built[i]) {
                for (let k = i * this.rays; k < (i + 1) * this.rays; k++) {
                    if (this.hitWeights[k]) { this.probeQueue.add(i); break; }
                }
            }
        }
        if (job.cursor === ORDER.length) {
            this.invalidationJob = null;
            this.valid = !this.dirtyRect && !this.sourceInvalidation;
            // GPU nie może zobaczyć starych danych po przywróceniu mastera.
            this.upload(this.now());
        }
    }

    // -1 oznacza nieznany/nieprzepuszczalny obszar, a nie otwarte niebo.
    // ID pozostaje liczbą 16-bitową; stary Uint8 gubił paczki >255.
    blockId(world, x, y, z) {
        if (y < 0) return -1;
        if (y >= CHUNK_HEIGHT) return 0;
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const chunk = world.getChunk(cx, cz);
        return chunk ? chunk.blocks[(y * CHUNK_SIZE + z - cz * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE] : -1;
    }

    // Supercover: wszystkie komórki dotykane na krawędzi/narożniku.
    // Zapobiega przeciekowi ukośnego promienia przez zamknięte ściany.
    trace(world, origin, direction, reach, gather) {
        const p = origin.map(Math.floor), steps = direction.map(Math.sign);
        const delta = direction.map(value => value ? Math.abs(1 / value) : Infinity);
        const next = direction.map((value, axis) => value > 0 ? (p[axis] + 1 - origin[axis]) * delta[axis]
            : value < 0 ? (origin[axis] - p[axis]) * delta[axis] : Infinity);
        let visibility = 1;
        while (true) {
            const distance = Math.min(...next);
            if (distance > reach || !Number.isFinite(distance)) return gather ? null : visibility;
            let axes = 0;
            for (let axis = 0; axis < 3; axis++) if (Math.abs(next[axis] - distance) <= 1e-8) axes |= 1 << axis;
            for (let subset = 1; subset <= 7; subset++) {
                if ((subset & axes) !== subset) continue;
                const x = p[0] + ((subset & 1) ? steps[0] : 0);
                const y = p[1] + ((subset & 2) ? steps[1] : 0);
                const z = p[2] + ((subset & 4) ? steps[2] : 0);
                const id = this.blockId(world, x, y, z);
                if (id < 0) return gather ? null : 0;
                if (isOpaqueId(id)) {
                    const axis = subset & 1 ? 0 : subset & 2 ? 1 : 2;
                    return gather ? { id, x, y, z, face: axis * 2 + (steps[axis] > 0 ? 1 : 0), distance } : 0;
                }
                if (!gather && isLeavesId(id)) { visibility *= 0.55; if (visibility < 0.05) return 0; }
            }
            for (let axis = 0; axis < 3; axis++) if (axes & (1 << axis)) { p[axis] += steps[axis]; next[axis] += delta[axis]; }
            if (!gather && p[1] >= CHUNK_HEIGHT) return visibility;
        }
    }

    gatherProbe(world, i) {
        this.built[i] = 1;
        const x = i % NX, z = Math.floor(i / NX) % NZ, y = Math.floor(i / NXZ);
        const position = [this.origin.x + x + 0.5, this.origin.y + y + 0.5, this.origin.z + z + 0.5];
        const current = this.blockId(world, ...position.map(Math.floor));
        if (current < 0 || isOpaqueId(current)) { this.composeProbe(i); return; }
        for (let ray = 0; ray < this.rays; ray++) {
            const hit = this.trace(world, position, DIRECTIONS[ray], REACH, true);
            if (!hit) continue;
            const hx = hit.x - this.origin.x, hy = hit.y - this.origin.y, hz = hit.z - this.origin.z;
            if (hx < 0 || hy < 0 || hz < 0 || hx >= NX || hy >= NY || hz >= NZ) continue;
            const key = ((hy * NZ + hz) * NX + hx) * 6 + hit.face;
            if (!this.surfaces.has(key)) {
                const tint = [1, 1, 1], cx = Math.floor(hit.x / CHUNK_SIZE), cz = Math.floor(hit.z / CHUNK_SIZE);
                const chunk = world.getChunk(cx, cz), grid = chunk?.tint;
                if (grid) for (let c = 0; c < 3; c++) {
                    const at = ((hit.z - cz * CHUNK_SIZE) * (CHUNK_SIZE + 1) + hit.x - cx * CHUNK_SIZE) * 3 + c;
                    tint[c] = (grid[at] + grid[at + 3] + grid[at + (CHUNK_SIZE + 1) * 3]
                        + grid[at + (CHUNK_SIZE + 2) * 3]) / (4 * 127.5);
                }
                this.surfaces.set(key, { x: hit.x, y: hit.y, z: hit.z, face: hit.face,
                    reflect: this.reflectance(hit.id, hit.face, tint).map(value => clamp(finite(value, 0), 0, 0.9)), factors: [0, 0, 0, 0] });
                this.sourceQueue.add(key);
            }
            this.hitKeys[i * this.rays + ray] = key;
            // Suma wag <=1, niezależnie od jakości: bez wzrostu energii.
            this.hitWeights[i * this.rays + ray] = Math.floor(255 / (1 + hit.distance * hit.distance));
        }
        this.probeQueue.add(i);
    }

    updateSurface(world, surface) {
        const normal = NORMALS[surface.face];
        const position = [surface.x, surface.y, surface.z].map((value, axis) => value + 0.5 + normal[axis] * 0.501);
        const blockPosition = position.map(Math.floor), air = this.blockId(world, ...blockPosition);
        for (let light = 0; light < 2; light++) {
            const direction = this.directions[light];
            const cosine = Math.max(0, normal.reduce((sum, value, axis) => sum + value * direction[axis], 0));
            surface.factors[light] = this.activeSources[light] && cosine > 0 && air >= 0 && !isOpaqueId(air)
                ? cosine * this.trace(world, position, direction, SOURCE_REACH, false) : 0;
        }
        const [x, y, z] = blockPosition, cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const chunk = world.getChunk(cx, cz);
        const skyLevel = y >= CHUNK_HEIGHT ? 15 : chunk?.skyLight?.[(y * CHUNK_SIZE + z - cz * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE] ?? 0;
        const sky = air >= 0 && !isOpaqueId(air) ? clamp(skyLevel / 15) ** (LIGHT_CURVE * 2.2) : 0;
        surface.factors[2] = sky * (normal[1] + 1) * 0.5;
        surface.factors[3] = sky * (1 - normal[1]) * 0.5;
    }

    composeProbe(i) {
        const values = new Float64Array(12);
        for (let ray = 0; ray < this.rays; ray++) {
            const at = i * this.rays + ray, weight = this.hitWeights[at] / (255 * this.rays);
            if (!weight) continue;
            const surface = this.surfaces.get(this.hitKeys[at]);
            if (!surface) continue;
            for (let layer = 0; layer < 4; layer++) for (let c = 0; c < 3; c++) {
                values[layer * 3 + c] += surface.reflect[c] * surface.factors[layer] * weight;
            }
        }
        for (let layer = 0; layer < 4; layer++) {
            const at = layer * LAYER_BYTES + i * 4;
            for (let c = 0; c < 3; c++) this.data[at + c] = Math.round(Math.sqrt(clamp(values[layer * 3 + c])) * 255);
            this.data[at + 3] = 255;
        }
        this.changed = true;
    }
    upload(time) { this.texture.needsUpdate = true; this.lastWrite = time; this.changed = false; this.updates++; }

    sample(x, y, z) {
        if (!this.enabled || !this.valid || this.strength === 0 || !Number.isFinite(this.origin.x)) return [0, 0, 0];
        const p = [x - this.origin.x, y - this.origin.y, z - this.origin.z], size = [NX, NY, NZ];
        const edge = Math.min(...p.map((value, axis) => Math.min(value, size[axis] - value)));
        const fade = smooth(1, 6, edge);
        if (fade === 0) return [0, 0, 0];
        const base = p.map((value, axis) => clamp(Math.floor(value - 0.5), 0, size[axis] - 1));
        const fraction = p.map(value => value - 0.5 - Math.floor(value - 0.5));
        const result = [0, 0, 0];
        for (let layer = 0; layer < 4; layer++) {
            const encoded = [0, 0, 0];
            for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
                const i = ((Math.min(NY - 1, base[1] + dy) * NZ + Math.min(NZ - 1, base[2] + dz)) * NX + Math.min(NX - 1, base[0] + dx)) * 4;
                const weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
                for (let c = 0; c < 3; c++) encoded[c] += this.data[layer * LAYER_BYTES + i + c] / 255 * weight;
            }
            const transfer = encoded.map(value => value * value);
            const luma = transfer.reduce((sum, value, c) => sum + value * LUMA[c], 0);
            for (let c = 0; c < 3; c++) result[c] += (luma + (transfer[c] - luma) * this.saturation) * this.colors[layer][c];
        }
        return result.map(value => value * fade * this.strength);
    }

    stats() {
        const pending = { geometry: this.geometryQueue.size + ORDER.length - this.initialCursor,
            sources: this.sourceQueue.size, probes: this.probeQueue.size,
            invalidation: !!(this.invalidationJob || this.sourceInvalidation || this.dirtyRect) };
        const typedArrayBytes = this.hitKeys.byteLength + this.hitWeights.byteLength + this.data.byteLength + this.built.byteLength;
        const estimatedCacheBytes = this.surfaces.size * 160 + (pending.geometry + pending.sources + pending.probes) * 32;
        return { enabled: this.enabled, ready: this.ready, pending, cache: { surfaces: this.surfaces.size, hitCapacity: this.hitKeys.length },
            lastFrame: { ...this.lastFrame }, markChunk: { ...this.markStats }, updates: this.updates, invalidations: this.invalidations,
            typedArrayBytes, estimatedCacheBytes, memoryBytes: typedArrayBytes + estimatedCacheBytes,
            radius: REACH, sourceReach: SOURCE_REACH, rays: this.rays, budgetMs: this.activeBudget ?? this.budgetMs };
    }
    dispose() {
        this.enabled = false;
        if (bounceUniforms.uBounceLight.value === this.texture) {
            bounceUniforms.uBounceColor.value.setRGB(0, 0, 0); bounceUniforms.uBounceLight.value = null;
        }
        this.texture.dispose(); this.surfaces.clear();
        this.geometryQueue.clear(); this.sourceQueue.clear(); this.probeQueue.clear();
        this.initialCursor = ORDER.length; this.invalidationJob = null; this.sourceInvalidation = false; this.dirtyRect = null;
    }
}
