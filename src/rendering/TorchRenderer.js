import * as THREE from 'three';
import { CHUNK_SIZE, SHADOW_INDOOR_DARKNESS } from '../config.js';
import { getTorchInfo } from '../blocks/torches.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createTorchModel, disposeTorchModel, updateTorchTime } from './TorchMaterial.js';
import { getTorchFlamePosition } from './TorchGeometry.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { lightingUniforms } from './LightingDiagnostics.js';

const PARTICLE_CAPACITY = 96;
const PARTICLE_RANGE = 28;
const MAX_EMITTERS = 24;
const SYNC_SECONDS = 0.15;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

const rgb = hex => {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
};

function modelMaterials(group) {
    const materials = [];
    group.traverse(object => {
        if (object.isMesh) materials.push(...(Array.isArray(object.material) ? object.material : [object.material]));
    });
    return materials;
}

// The block IDs own placement, saves and steady RGB light. This renderer only
// advances the sprite clock and a bounded particle pool: it never edits blocks
// or starts light propagation. Indexed chunks avoid scanning terrain each frame.
export class TorchRenderer {
    constructor(game) {
        this.game = game;
        this.views = new Map();
        this.chunks = new Map();
        this.emitters = [];
        this.time = 0;
        this.syncWait = 0;
        this.lastWorldVersion = -1;
        this.lastChunkCount = -1;
        this.lastBounceTime = -Infinity;
        this.lastBounceEnabled = null;
        this.lowDetail = Boolean(game.settings?.get('potato'));
        this.disposed = false;
        this.createParticles();
    }

    createView(key, chunk, index, info) {
        const y = Math.floor(index / LAYER);
        const z = chunk.cz * CHUNK_SIZE + Math.floor(index % LAYER / CHUNK_SIZE);
        const x = chunk.cx * CHUNK_SIZE + index % CHUNK_SIZE;
        const lighting = {
            uModelSky: { value: 1 },
            uModelBlock: { value: new THREE.Vector3() },
            uModelSun: { value: 1 },
            uModelAmbient: { value: 1 },
            uModelDistantShadows: { value: 1 },
            uModelBounce: { value: new THREE.Vector3() }
        };
        const group = createTorchModel(info.colorKey, info.attach, { lighting });
        group.position.set(x + 0.5, y, z + 0.5);
        setPotatoDefine(modelMaterials(group), this.lowDetail);
        this.game.scene.add(group);
        const flamePosition = new THREE.Vector3(...getTorchFlamePosition(info.attach)).add(group.position);
        const view = { key, id: info.id, group, lighting, x, y, z, flamePosition,
            color: rgb(info.variant.particleColor ?? info.variant.color), smoke: 0, spark: 0 };
        this.views.set(key, view);
        this.updateViewLight(view);
        return view;
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        disposeTorchModel(view.group);
        this.views.delete(key);
    }

    sync(refreshLighting = true) {
        const world = this.game.world;
        const loaded = new Set(world.chunks.values());
        for (const [chunk, record] of this.chunks) {
            if (loaded.has(chunk)) continue;
            for (const key of record.keys) this.removeView(key);
            this.chunks.delete(chunk);
        }
        for (const chunk of loaded) {
            const revision = chunk.torchRevision ?? 0;
            let record = this.chunks.get(chunk);
            if (record?.revision === revision) continue;
            const keys = new Set();
            for (const index of chunk.torches ?? []) {
                const info = getTorchInfo(chunk.blocks[index]);
                if (!info) continue;
                const key = `${chunk.cx},${chunk.cz}:${index}`;
                keys.add(key);
                if (this.views.get(key)?.id === info.id) continue;
                this.removeView(key);
                this.createView(key, chunk, index, info);
            }
            for (const key of record?.keys ?? []) if (!keys.has(key)) this.removeView(key);
            this.chunks.set(chunk, { revision, keys });
        }
        this.lastWorldVersion = world.version;
        this.lastChunkCount = world.chunks.size;
        if (!refreshLighting) return;
        // Geometry has no visibility cap. Only decorative particles choose
        // nearby emitters and share a fixed budget independent of torch count.
        const camera = this.game.camera.position;
        this.emitters = [...this.views.values()]
            .map(view => ({ view, distance: view.flamePosition.distanceToSquared(camera) }))
            .filter(entry => entry.distance < PARTICLE_RANGE ** 2)
            .sort((a, b) => a.distance - b.distance)
            .slice(0, MAX_EMITTERS).map(entry => entry.view);
        for (const view of this.views.values()) this.updateViewLight(view);
        this.updateBounce();
    }

    updateViewLight(view) {
        const light = this.game.world.getLight(view.x, view.y, view.z);
        const atmospheric = this.game.sky?.atmosphere;
        const brightness = atmospheric ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky);
        const strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        view.lighting.uModelSky.value = sky;
        view.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        // ModelMaterial expects linear sunlight/ambient. Shadow maps replace
        // this local skylight fallback where they cover the torch's position.
        const ambientStrength = this.game.shadows?.active ? (this.game.shadows.ambientStrength ?? 0) : 0;
        view.lighting.uModelSun.value = sky ** 2.2;
        view.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);
    }

    updateBounce() {
        const enabled = Boolean(this.game.bounce?.enabled);
        const elapsed = this.time - this.lastBounceTime;
        // Game also calls this after its bounce update on every frame. Sampling
        // every torch is throttled, but switching the effect off clears it now.
        if (enabled === this.lastBounceEnabled && elapsed >= 0 && elapsed < SYNC_SECONDS) return;
        this.lastBounceTime = this.time;
        this.lastBounceEnabled = enabled;
        for (const view of this.views.values()) {
            if (!enabled) {
                view.lighting.uModelBounce.value.set(0, 0, 0);
                continue;
            }
            const c = this.game.bounce.sample(view.x + 0.5, view.y + 0.4, view.z + 0.5);
            view.lighting.uModelBounce.value.set(c[0], c[1], c[2]);
        }
    }

    setLowDetail(on) {
        this.lowDetail = Boolean(on);
        for (const view of this.views.values()) setPotatoDefine(modelMaterials(view.group), this.lowDetail);
    }

    createParticles() {
        this.particles = Array.from({ length: PARTICLE_CAPACITY }, () => ({ life: 0 }));
        this.particlePosition = new Float32Array(PARTICLE_CAPACITY * 3);
        this.particleColor = new Float32Array(PARTICLE_CAPACITY * 4);
        this.particleSize = new Float32Array(PARTICLE_CAPACITY);
        this.particleEmission = new Float32Array(PARTICLE_CAPACITY);
        const geometry = this.particleGeometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.particlePosition, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.particleColor, 4).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleSize', new THREE.BufferAttribute(this.particleSize, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleEmission', new THREE.BufferAttribute(this.particleEmission, 1).setUsage(THREE.DynamicDrawUsage));
        const material = this.particleMaterial = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { uPixelScale: { value: 700 },
                uLightingNatural: lightingUniforms.uLightingNatural,
                uLightingDebug: lightingUniforms.uLightingDebug,
                uLightingLocal: lightingUniforms.uLightingLocal },
            vertexShader: `
                attribute vec4 particleColor; attribute float particleSize;
                attribute float particleEmission; uniform float uPixelScale;
                varying vec4 vColor; varying float vEmission;
                void main() {
                    vColor = particleColor; vEmission = particleEmission;
                    vec4 p = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * p;
                    gl_PointSize = clamp(particleSize * uPixelScale / max(.1, -p.z), 1.0, 36.0);
                }`,
            fragmentShader: `
                varying vec4 vColor; varying float vEmission;
                uniform float uLightingNatural; uniform int uLightingDebug; uniform vec2 uLightingLocal;
                void main() {
                    vec2 p = abs(gl_PointCoord - .5);
                    if (max(p.x,p.y) > .48 || (p.x > .34 && p.y > .34)) discard;
                    vec3 source = vColor.rgb;
                    if (uLightingNatural > .5) source = mix(source / 12.92,
                        pow((source + .055) / 1.055, vec3(2.4)), step(vec3(.04045), source));
                    bool spark = vEmission > .5;
                    vec3 value = source * (spark ? uLightingLocal.y : uLightingLocal.x);
                    if (uLightingDebug > 0 && uLightingDebug != 12) {
                        if (uLightingDebug == 1) value = source;
                        else if (!((uLightingDebug == 11 && spark) || (uLightingDebug == 10 && !spark))) value = vec3(0.0);
                    }
                    gl_FragColor = vec4(value, vColor.a);
                    if (uLightingNatural > .5) {
                        #include <colorspace_fragment>
                    }
                }`
        });
        this.points = new THREE.Points(geometry, material);
        this.points.name = 'torch-particles';
        this.points.frustumCulled = false;
        this.points.visible = false;
        this.game.scene.add(this.points);
    }

    emit(view, spark) {
        const particle = this.particles.find(p => p.life <= 0);
        if (!particle) return;
        const p = view.flamePosition;
        Object.assign(particle, { x: p.x + (Math.random() - .5) * .06, y: p.y,
            z: p.z + (Math.random() - .5) * .06, vx: (Math.random() - .5) * .12,
            vz: (Math.random() - .5) * .12, vy: spark ? .3 : .18,
            life: spark ? .8 : 1.5, max: spark ? .8 : 1.5,
            spark, color: view.color, phase: Math.random() * Math.PI * 2 });
    }

    update(dt) {
        if (this.disposed) return;
        const elapsed = Math.max(0, Number(dt) || 0);
        const step = Math.min(elapsed, .1);
        this.time = (this.time + elapsed) % 3600;
        updateTorchTime(this.time);
        this.syncWait -= elapsed;
        const world = this.game.world;
        const refreshLighting = this.syncWait <= 0;
        if (refreshLighting || this.lastWorldVersion !== world.version || this.lastChunkCount !== world.chunks.size) {
            this.sync(refreshLighting);
            if (refreshLighting) this.syncWait = SYNC_SECONDS;
        }
        if (!this.lowDetail) for (const view of this.emitters) {
            if (this.views.get(view.key) !== view) continue;
            view.smoke += step * .65;
            view.spark += step * .27;
            if (view.smoke >= 1) { view.smoke %= 1; this.emit(view, false); }
            if (view.spark >= 1) { view.spark %= 1; this.emit(view, true); }
        }
        let active = 0;
        for (let i = 0; i < PARTICLE_CAPACITY; i++) {
            const p = this.particles[i];
            p.life -= elapsed;
            if (p.life <= 0) {
                this.particleColor[i * 4 + 3] = this.particleSize[i] = 0;
                continue;
            }
            active++;
            const age = 1 - p.life / p.max;
            p.x += (p.vx + Math.sin(this.time + p.phase) * .025) * step;
            p.z += p.vz * step; p.y += p.vy * step;
            this.particlePosition.set([p.x, p.y, p.z], i * 3);
            this.particleSize[i] = p.spark ? .018 : .04 + age * .08;
            this.particleEmission[i] = p.spark ? 1 : 0;
            const color = p.spark ? p.color : [.35, .34, .32];
            this.particleColor.set([color[0], color[1], color[2], Math.sin(age * Math.PI) * (p.spark ? .75 : .16)], i * 4);
        }
        this.points.visible = active > 0;
        this.particleMaterial.uniforms.uPixelScale.value = this.game.renderer.domElement.height;
        if (active > 0) for (const attribute of Object.values(this.particleGeometry.attributes)) attribute.needsUpdate = true;
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const key of [...this.views.keys()]) this.removeView(key);
        this.chunks.clear(); this.emitters.length = 0;
        this.points.removeFromParent();
        this.particleGeometry.dispose(); this.particleMaterial.dispose();
    }
}
