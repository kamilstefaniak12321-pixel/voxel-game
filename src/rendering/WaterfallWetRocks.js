import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { getBlockId, getWaterLevel, waterFallDistance, isSolidId, isOpaqueId } from '../blocks/BlockRegistry.js';
import { viewUniforms, VIEW_GLSL } from './viewUniforms.js';
import { skyUniforms } from '../sky/skyShader.js';
import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { waterEffectLightUniforms, WATER_EFFECT_DYNAMIC_LIGHT_GLSL } from './WaterEffectDynamicLight.js';
import { installLightingDiagnostics } from './LightingDiagnostics.js';
import { shadowUniforms, SHADOW_GLSL, shadowLightsChunk } from './Shadows.js';
import { waterfallLightingAt } from './WaterfallLighting.js';

export const WET_ROCK_CAPS = Object.freeze({ fields: 4, potatoFields: 2, candidates: 64,
    faces: 256, facesPerField: 64, cellsPerField: 343, cellsPerUpdate: 32, msPerUpdate: .2 });
const S = CHUNK_SIZE, WIDTH = 7, EXTENT = 3;
const ROCK_IDS = new Set(['stone', 'lepidolite', 'granite', 'limestone', 'sandstone', 'slate', 'basalt',
    'polished_stone'].map(getBlockId));
const EMPTY = Object.freeze([]);
// Each pair has opposite normals. Corners use the same outward winding.
const FACES = [
    { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 0], [0, 1, 1]] },
    { normal: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 1], [1, 1, 0]] },
    { normal: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 1], [1, 0, 0]] },
    { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 0], [1, 1, 1]] },
    { normal: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]] },
    { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]] }
];
const INDICES = [0, 1, 2, 2, 1, 3];
const openAir = id => id >= 0 && !isSolidId(id) && !isOpaqueId(id) && getWaterLevel(id) < 0;

function createMaterial() {
    // A thin translucent coat leaves the existing 16px rock texture visible.
    // Both its dark tint and sheen pass through the ordinary lighting path.
    const material = new THREE.MeshLambertMaterial({ color: 0x71868f, transparent: true,
        depthWrite: false, side: THREE.FrontSide, polygonOffset: true,
        polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    material.name = 'Waterfall wet rock surfaces';
    material.uniforms = { uWetTime: { value: 0 }, uWetAmount: { value: 1 } };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, material.uniforms, viewUniforms, skyUniforms, shadowUniforms, waterEffectLightUniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                attribute vec4 wetParams;
                attribute vec2 wetMeta;
                attribute vec4 wetLight;
                varying vec3 vWetPosition;
                varying vec3 vWetNormal;
                varying vec4 vWetParams;
                varying vec2 vWetMeta;
                varying vec4 vWetLight;`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vWetPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vWetNormal = normalize(mat3(modelMatrix) * objectNormal);
                vWetParams = wetParams;
                vWetMeta = wetMeta;
                vWetLight = wetLight;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform float uWetTime;
                uniform float uWetAmount;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                varying vec3 vWetPosition;
                varying vec3 vWetNormal;
                varying vec4 vWetParams;
                varying vec2 vWetMeta;
                varying vec4 vWetLight;
                ${VIEW_GLSL}
                ${SURFACE_LIGHTING_GLSL}
                ${WATER_EFFECT_DYNAMIC_LIGHT_GLSL}
                ${SHADOW_GLSL}
                #ifndef USE_SUN_SHADOWS
                    uniform int uSunShadowLight;
                #endif`)
            .replace('#include <map_fragment>', `
                if (uUnderwater > 0.5) discard;
                vec3 offset = vWetPosition - vWetParams.xyz;
                float radial = length(offset * vec3(1.0, 1.1, 1.0)) / vWetParams.w;
                float wetFade = 1.0 - smoothstep(0.45, 1.0, radial);
                vec3 pixel = floor(vWetPosition * 16.0) / 16.0;
                float grain = fract(sin(dot(pixel, vec3(37.1, 17.7, 53.3))) * 43758.5453);
                vec3 toEye = normalize(cameraPosition - vWetPosition);
                float grazing = pow(1.0 - abs(dot(normalize(vWetNormal), toEye)), 3.0);
                float trickle = 0.5 + 0.5 * sin(pixel.y * 3.0 + pixel.x * 9.0 + pixel.z * 11.0 + uWetTime);
                float sheen = grazing * (0.5 + 0.5 * grain) * (0.85 + 0.15 * trickle);
                diffuseColor.rgb *= mix(vec3(0.18, 0.22, 0.24), vec3(1.7), sheen * 0.65);
                diffuseColor.a *= 0.32 * vWetMeta.x * wetFade * uWetAmount;
                if (diffuseColor.a < 0.003) discard;
                float wetSky = mix(vWetMeta.y, vWetLight.a, uAtmosphericLight);
                float wetSun = wetSky;
                float wetAmbient = wetSky;
                #ifdef USE_SUN_SHADOWS
                    wetSun = sunShadowLight(vWetPosition, normalize(vWetNormal), wetSky);
                    wetAmbient = pow(max(0.0, wetSky), 1.0 + uSunShadowAmbient / 2.2);
                #endif`)
            .replace('#include <lights_fragment_begin>', shadowLightsChunk('wetSun', 'wetSky', 'wetAmbient'))
            .replace('#include <opaque_fragment>', `
                outgoingLight = surfaceRadiance(diffuseColor.rgb, outgoingLight,
                    waterEffectLocalLight(vWetLight.rgb, vWetPosition, normalize(vWetNormal), 1.0), vec3(0.0), vec3(0.0),
                    uNightDesaturation, uNightTint, uAtmosphericLight);
                outgoingLight += waterEffectAnalyticRadiance(diffuseColor.rgb, vWetPosition, normalize(vWetNormal));
                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);
                #include <opaque_fragment>`);
        installLightingDiagnostics(shader, { sky: 'vWetLight.a', normal: 'normalize(vWetNormal)', visibility: 'wetSun' });
    };
    material.customProgramCacheKey = () => 'waterfall-wet-rocks-v2';
    return material;
}

/** Local spray discovers reachable air, never whole chunks. Water-covered
 * rock and the far side of a sealed wall cannot receive a wet overlay.
 * A field publishes only complete, revision-checked results. Stable frames
 * inspect a few chunk identities/revisions, with no voxel or light reads.
 */
export class WaterfallWetRocks {
    constructor(scene, world, { now = () => performance.now() } = {}) {
        this.scene = scene;
        this.world = world;
        this.now = now;
        this.material = createMaterial();
        this.materials = [this.material];
        this.geometry = new THREE.BufferGeometry();
        for (const [name, size] of [['position', 3], ['normal', 3], ['wetParams', 4], ['wetMeta', 2], ['wetLight', 4]]) {
            this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(WET_ROCK_CAPS.faces * 4 * size), size)
                .setUsage(THREE.DynamicDrawUsage));
        }
        const indices = new Uint16Array(WET_ROCK_CAPS.faces * 6);
        for (let i = 0; i < WET_ROCK_CAPS.faces; i++) for (let c = 0; c < 6; c++) indices[i * 6 + c] = i * 4 + INDICES[c];
        this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        this.geometry.setDrawRange(0, 0);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Wet rocks beside waterfalls';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.entries = [];
        this.landings = [];
        this.jobs = [];
        this.amount = 1;
        this.cursor = this.faces = this.geometryRevision = this.lastProcessed = this.lastBlockReads = this.lastMs = 0;
        this.changed = false;
        this.disposed = false;
    }

    setAmount(amount) {
        if (this.disposed) return;
        amount = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
        if (amount === this.amount) return;
        this.amount = amount;
        this.material.uniforms.uWetAmount.value = amount > 0 ? (amount <= .35 ? .75 : 1) : 0;
        this.setLandings(this.landings);
        if (!amount) this.syncGeometry();
    }

    setLandings(landings) {
        if (this.disposed) return;
        this.landings = landings.slice(0, WET_ROCK_CAPS.candidates).map(landing => ({ ...landing }));
        const limit = this.amount <= 0 ? 0 : this.amount <= .35 ? WET_ROCK_CAPS.potatoFields : WET_ROCK_CAPS.fields;
        const candidates = [];
        if (limit) for (const landing of this.landings) {
            if (![landing?.x, landing?.y, landing?.z, landing?.fall].every(Number.isFinite)) continue;
            const x = Math.floor(landing.x), y = Math.floor(landing.y), z = Math.floor(landing.z);
            if (y <= 0 || y >= CHUNK_HEIGHT) continue;
            candidates.push({ x, y, z, key: `${x},${y},${z}`, fall: Math.max(1, Math.min(16, landing.fall)),
                distance: Number.isFinite(landing.distance) ? landing.distance : 0 });
        }
        candidates.sort((a, b) => b.fall - a.fall || a.distance - b.distance || a.x - b.x || a.z - b.z || a.y - b.y);
        const selected = [];
        for (const candidate of candidates) if (!selected.some(other => other.y === candidate.y &&
            (other.x - candidate.x) ** 2 + (other.z - candidate.z) ** 2 <= 4)) selected.push(candidate);
        selected.sort((a, b) => a.distance - b.distance || b.fall - a.fall || a.x - b.x || a.z - b.z || a.y - b.y);
        selected.length = Math.min(selected.length, limit);
        const previous = new Map(this.entries.map(entry => [entry.key, entry]));
        this.entries = selected.map(candidate => {
            let entry = previous.get(candidate.key);
            previous.delete(candidate.key);
            if (!entry) {
                entry = { ...candidate, radius: 2 + candidate.fall / 16, patches: EMPTY, dependencies: EMPTY, job: null };
                this.restart(entry);
            } else if (entry.fall !== candidate.fall) {
                entry.fall = candidate.fall;
                entry.radius = 2 + candidate.fall / 16;
                this.restart(entry);
            }
            return entry;
        });
        for (const entry of previous.values()) {
            this.cancel(entry);
            if (entry.patches.length) this.changed = true;
        }
    }

    cancel(entry) {
        if (!entry.job) return;
        const index = this.jobs.indexOf(entry.job);
        if (index >= 0) this.jobs.splice(index, 1);
        entry.job = null;
    }

    restart(entry) {
        this.cancel(entry);
        if (entry.patches.length) this.changed = true;
        entry.patches = EMPTY;
        const job = { entry, seen: new Uint8Array(WET_ROCK_CAPS.cellsPerField),
            queue: new Uint16Array(WET_ROCK_CAPS.cellsPerField), head: 0, tail: 0,
            patches: [], dependencies: [], started: false };
        entry.job = job;
        entry.dependencies = job.dependencies;
        this.enqueue(job, 0, 0, 0);
        this.jobs.push(job);
    }

    valid(dependencies) {
        for (const dep of dependencies) {
            const chunk = this.world.getChunk(dep.cx, dep.cz) ?? null;
            if (chunk !== dep.chunk || chunk?.blocks !== dep.blocks ||
                (chunk?.meshRevision ?? 0) !== dep.revision || (chunk?.version ?? 0) !== dep.version) return false;
        }
        return true;
    }

    read(job, x, y, z) {
        if (y < 0 || y >= CHUNK_HEIGHT) return -1;
        const cx = Math.floor(x / S), cz = Math.floor(z / S);
        let dep = job.dependencies.find(candidate => candidate.cx === cx && candidate.cz === cz);
        if (!dep) {
            const chunk = this.world.getChunk(cx, cz) ?? null;
            dep = { cx, cz, chunk, blocks: chunk?.blocks, revision: chunk?.meshRevision ?? 0, version: chunk?.version ?? 0 };
            job.dependencies.push(dep);
        }
        if (!dep.chunk) return -1;
        this.lastBlockReads++;
        return dep.blocks[(y * S + z - cz * S) * S + x - cx * S] ?? 0;
    }

    enqueue(job, dx, dy, dz) {
        if (Math.abs(dx) > EXTENT || Math.abs(dz) > EXTENT || dy < -1 || dy > EXTENT ||
            dx * dx + ((dy + .25) * 1.1) ** 2 + dz * dz > job.entry.radius ** 2) return;
        const index = ((dy + EXTENT) * WIDTH + dz + EXTENT) * WIDTH + dx + EXTENT;
        if (job.seen[index]) return;
        job.seen[index] = 1;
        job.queue[job.tail++] = index;
    }

    inspect(job) {
        const entry = job.entry;
        if (!job.started) {
            job.started = true;
            const id = this.read(job, entry.x, entry.y, entry.z), below = this.read(job, entry.x, entry.y - 1, entry.z);
            if (!waterFallDistance(id) || below < 0 || !(isSolidId(below) || getWaterLevel(below) === 0)) {
                job.head = job.tail;
                return;
            }
        }
        const index = job.queue[job.head++];
        const dx = index % WIDTH - EXTENT, dz = Math.floor(index / WIDTH) % WIDTH - EXTENT;
        const dy = Math.floor(index / (WIDTH * WIDTH)) - EXTENT;
        const x = entry.x + dx, y = entry.y + dy, z = entry.z + dz;
        const id = this.read(job, x, y, z);
        const impactColumn = dx === 0 && dz === 0 && dy >= 0 && waterFallDistance(id) > 0;
        if (!openAir(id) && !impactColumn) return;
        for (let side = 0; side < FACES.length; side++) {
            const [nx, ny, nz] = FACES[side].normal;
            const neighbor = this.read(job, x + nx, y + ny, z + nz);
            // The initial falling column seeds the surrounding spray but
            // cannot make underwater/contact faces count as exposed rock.
            if (!impactColumn && ROCK_IDS.has(neighbor)) {
                job.patches.push({ x: x + nx, y: y + ny, z: z + nz, side: side ^ 1,
                    lighting: waterfallLightingAt(this.world, x, y, z) });
                if (job.patches.length === WET_ROCK_CAPS.facesPerField) {
                    job.head = job.tail;
                    return;
                }
            } else if (openAir(neighbor) || nx === 0 && nz === 0 && dx === 0 && dz === 0 && dy + ny >= 0 && waterFallDistance(neighbor)) {
                this.enqueue(job, dx + nx, dy + ny, dz + nz);
            }
        }
    }

    update(dt) {
        this.lastProcessed = this.lastBlockReads = this.lastMs = 0;
        if (this.disposed || !this.amount) return;
        const start = this.now(), deadline = start + WET_ROCK_CAPS.msPerUpdate;
        this.material.uniforms.uWetTime.value = (this.material.uniforms.uWetTime.value +
            Math.max(0, Number.isFinite(dt) ? dt : 0)) % (Math.PI * 2);
        for (const entry of this.entries) if (!this.valid(entry.dependencies)) this.restart(entry);
        while (this.jobs.length && this.lastProcessed < WET_ROCK_CAPS.cellsPerUpdate && this.now() < deadline) {
            this.cursor %= this.jobs.length;
            const job = this.jobs[this.cursor];
            this.inspect(job);
            this.lastProcessed++;
            if (job.head === job.tail) {
                this.jobs.splice(this.cursor, 1);
                job.entry.job = null;
                if (!this.valid(job.dependencies)) this.restart(job.entry);
                else if (job.patches.length) {
                    job.entry.patches = job.patches;
                    this.changed = true;
                }
            } else this.cursor++;
        }
        if (this.changed) this.syncGeometry();
        this.lastMs = this.now() - start;
    }

    syncGeometry() {
        const unique = new Map();
        for (const entry of this.entries) for (const patch of entry.patches) {
            const key = `${patch.x},${patch.y},${patch.z},${patch.side}`;
            const previous = unique.get(key);
            if (!previous || entry.fall > previous.entry.fall) unique.set(key, { entry, patch });
        }
        const { position, normal, wetParams, wetMeta, wetLight } = this.geometry.attributes;
        let count = 0;
        for (const { entry, patch } of unique.values()) {
            if (count === WET_ROCK_CAPS.faces) break;
            const face = FACES[patch.side], [nx, ny, nz] = face.normal, light = patch.lighting;
            for (let c = 0; c < 4; c++) {
                const at = count * 4 + c, corner = face.corners[c];
                position.setXYZ(at, patch.x + corner[0] + nx * .003, patch.y + corner[1] + ny * .003,
                    patch.z + corner[2] + nz * .003);
                normal.setXYZ(at, nx, ny, nz);
                wetParams.setXYZW(at, entry.x + .5, entry.y + .25, entry.z + .5, entry.radius + .35);
                wetMeta.setXY(at, .35 + entry.fall / 16 * .65, light.classicShade);
                wetLight.setXYZW(at, light.local[0], light.local[1], light.local[2], light.sky);
            }
            count++;
        }
        if (count) for (const attribute of Object.values(this.geometry.attributes)) {
            attribute.clearUpdateRanges();
            attribute.addUpdateRange(0, count * 4 * attribute.itemSize);
            attribute.needsUpdate = true;
        }
        this.faces = count;
        this.geometry.setDrawRange(0, count * 6);
        this.mesh.visible = this.amount > 0 && count > 0;
        this.geometryRevision++;
        this.changed = false;
    }

    stats() {
        return { fields: this.entries.length, faces: this.faces, triangles: this.faces * 2,
            draws: this.mesh.visible ? 1 : 0, queued: this.jobs.length, amount: this.amount,
            lastProcessed: this.lastProcessed, lastBlockReads: this.lastBlockReads, lastMs: this.lastMs,
            geometryRevision: this.geometryRevision, caps: WET_ROCK_CAPS };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
        this.entries.length = this.jobs.length = this.landings.length = 0;
        this.world = null;
        this.faces = 0;
        this.geometry.setDrawRange(0, 0);
        this.mesh.visible = false;
    }
}
