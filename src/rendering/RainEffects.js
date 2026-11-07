import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { getWaterLevel, isSolidId, isOpaqueId } from '../blocks/BlockRegistry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { waterfallLightingAt } from './WaterfallLighting.js';
import { viewUniforms } from './viewUniforms.js';

export const RAIN_CAPS = Object.freeze({ drops: 96, potatoDrops: 24, radius: 8,
    rate: 36, cellsPerUpdate: 64, msPerUpdate: .2, speed: 14 });

// Minimal opt-in rain, controlled by /pogoda. Drops hit the first real roof,
// ground or water in a loaded column. The sky-to-ground probe is resumable;
// a dense roof never causes an unbounded whole-world scan in one frame.
export class RainEffects {
    constructor(scene, world, impacts, { random = Math.random, now = () => performance.now() } = {}) {
        this.scene = scene; this.world = world; this.impacts = impacts;
        this.random = random; this.now = now;
        this.surfaceReader = { getBlockId: (x, y, z) => {
            this.lastReads++; return this.world.getBlockId(x, y, z);
        } };
        this.intensity = 0; this.amount = 1; this.tokens = 0;
        this.drops = []; this.job = null; this.lastReads = 0; this.lastMs = 0;
        this.waterHits = 0; this.surfaceHits = 0; this.disposed = false;
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_CAPS.drops * 6), 3)
            .setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RAIN_CAPS.drops * 6), 3)
            .setUsage(THREE.DynamicDrawUsage));
        this.geometry.setDrawRange(0, 0);
        this.material = new THREE.LineBasicMaterial({ transparent: true, opacity: .55,
            vertexColors: true, depthWrite: false, color: 0xaac6dc });
        this.material.onBeforeCompile = shader => {
            shader.uniforms.uUnderwater = viewUniforms.uUnderwater;
            shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
                '#include <common>\nuniform float uUnderwater;')
                .replace('#include <clipping_planes_fragment>',
                    '#include <clipping_planes_fragment>\nif (uUnderwater > 0.5) discard;');
        };
        this.material.customProgramCacheKey = () => 'local-rain-v1';
        this.mesh = new THREE.LineSegments(this.geometry, this.material);
        this.mesh.name = 'Local rain'; this.mesh.frustumCulled = false; this.mesh.visible = false;
        scene.add(this.mesh);
    }

    get limit() { return this.amount <= 0 ? 0 : this.amount <= .35 ? RAIN_CAPS.potatoDrops : RAIN_CAPS.drops; }

    setIntensity(value) {
        if (this.disposed) return;
        this.intensity = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
        if (!this.intensity) this.clear();
    }

    setAmount(value) {
        if (this.disposed) return;
        this.amount = Number.isFinite(value) ? Math.max(0, value) : 0;
        if (this.drops.length > this.limit) this.drops.length = this.limit;
        if (this.drops.length >= this.limit) this.job = null;
        if (!this.limit) this.clear();
    }

    clear() {
        this.drops.length = 0; this.job = null; this.tokens = 0;
        this.geometry.setDrawRange(0, 0); this.mesh.visible = false;
    }

    valid(item) {
        const chunk = this.world.getChunk(item.cx, item.cz);
        return chunk === item.chunk && chunk?.blocks === item.blocks &&
            (chunk?.meshRevision ?? 0) === item.revision;
    }

    begin(camera) {
        const angle = this.random() * Math.PI * 2, radius = Math.sqrt(this.random()) * RAIN_CAPS.radius;
        const fx = camera.x + Math.cos(angle) * radius, fz = camera.z + Math.sin(angle) * radius;
        const x = Math.floor(fx), z = Math.floor(fz);
        const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
        const chunk = this.world.getChunk(cx, cz);
        if (!chunk) return;
        this.job = { x, z, fx, fz, cx, cz, chunk, blocks: chunk.blocks,
            revision: chunk.meshRevision ?? 0, y: Math.min(CHUNK_HEIGHT - 1, chunk.maxY ?? CHUNK_HEIGHT - 1) };
    }

    sample(camera, deadline) {
        // Reserve the worst-case 18 local height reads before starting another
        // ray cell, so the hard cap includes the exact triangle lookup too.
        while (this.lastReads < RAIN_CAPS.cellsPerUpdate - 18 && this.now() < deadline) {
            if (this.drops.length >= this.limit) { this.job = null; return; }
            if (!this.job) {
                if (this.tokens < 1 || this.drops.length >= this.limit) return;
                this.tokens--; this.begin(camera);
                if (!this.job) return;
            }
            const job = this.job;
            if (!this.valid(job)) { this.job = null; continue; }
            if (job.y < 0) { this.job = null; continue; }
            const y = job.y--;
            const id = job.blocks[(y * CHUNK_SIZE + job.z - job.cz * CHUNK_SIZE) * CHUNK_SIZE + job.x - job.cx * CHUNK_SIZE];
            this.lastReads++;
            const level = getWaterLevel(id);
            if (level < 0 && !isSolidId(id) && !isOpaqueId(id)) continue;
            const surface = level >= 0 ? y + waterSurfaceHeight(this.surfaceReader, job.x, y, job.z,
                job.fx - job.x, job.fz - job.z) : y + 1;
            this.drops.push({ ...job, cellY: y, surface, water: level >= 0 && level < 8,
                y: Math.max(camera.y + 7, surface + 6), age: 0,
                light: waterfallLightingAt(this.world, job.x, y + 1, job.z) });
            this.job = null;
        }
    }

    update(dt, camera, sky = null) {
        if (this.disposed) return;
        const start = this.now(); this.lastReads = 0; this.lastMs = 0;
        if (!this.intensity || !this.limit || !camera) return;
        const step = Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        const position = camera.position ?? camera;
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            drop.y -= RAIN_CAPS.speed * step; drop.age += step;
            const valid = this.valid(drop) && Math.hypot(drop.fx - position.x, drop.fz - position.z) < RAIN_CAPS.radius + 4;
            if (valid && drop.y > drop.surface && drop.age < 4) continue;
            if (valid && drop.y <= drop.surface) {
                this.surfaceHits++;
                if (drop.water && this.impacts.add(drop.fx, drop.cellY, drop.fz, 'rain', this.intensity)) this.waterHits++;
            }
            this.drops.splice(i, 1);
        }
        this.tokens = Math.min(4, this.tokens + step * RAIN_CAPS.rate * this.intensity * (this.amount <= .35 ? .35 : 1));
        this.sample(position, start + RAIN_CAPS.msPerUpdate);
        const points = this.geometry.attributes.position, colors = this.geometry.attributes.color;
        // Account for the world's current sky light; these thin lines are not
        // emissive and must not remain bright white in a dark night or cave.
        const light = (name, channel) => (sky?.[name + 'Color']?.[channel] ?? 1) * (sky?.[name + 'Intensity'] ?? (name === 'sunLight' ? 1 : 0));
        const sr = Math.min(1, light('sunLight', 'r') + light('moonLight', 'r') + light('ambient', 'r'));
        const sg = Math.min(1, light('sunLight', 'g') + light('moonLight', 'g') + light('ambient', 'g'));
        const sb = Math.min(1, light('sunLight', 'b') + light('moonLight', 'b') + light('ambient', 'b'));
        for (let i = 0; i < this.drops.length; i++) {
            const drop = this.drops[i], a = i * 2, l = drop.light;
            points.setXYZ(a, drop.fx, Math.max(drop.surface, drop.y - .32), drop.fz);
            points.setXYZ(a + 1, drop.fx, drop.y, drop.fz);
            for (let v = a; v <= a + 1; v++) colors.setXYZ(v,
                Math.min(1, sr * l.sky + l.local[0]), Math.min(1, sg * l.sky + l.local[1]), Math.min(1, sb * l.sky + l.local[2]));
        }
        if (this.drops.length) for (const attribute of [points, colors]) {
            attribute.clearUpdateRanges(); attribute.addUpdateRange(0, this.drops.length * 6); attribute.needsUpdate = true;
        }
        this.geometry.setDrawRange(0, this.drops.length * 2);
        this.mesh.visible = this.drops.length > 0;
        this.lastMs = this.now() - start;
    }

    stats() { return { intensity: this.intensity, drops: this.drops.length, limit: this.limit,
        queued: Number(!!this.job), lastReads: this.lastReads, lastMs: this.lastMs,
        surfaceHits: this.surfaceHits, waterHits: this.waterHits, draws: this.mesh.visible ? 1 : 0, caps: RAIN_CAPS }; }

    dispose() {
        if (this.disposed) return;
        this.clear(); this.disposed = true;
        this.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose();
        this.world = this.impacts = null;
    }
}
