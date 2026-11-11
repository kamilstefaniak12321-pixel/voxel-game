import * as THREE from 'three';
import { WATER_WAVE_GLSL } from './WaterWave.js';
import { RIPPLE_MAX_EMITTERS, RIPPLE_PATCHES_PER_EMITTER, RIPPLE_MAX_TILES } from './WaterfallRipples.js';
import { createWaterfallEffectMaterial, effectAmount, advanceEffectTime, setEffectTime } from './WaterfallEffectMaterial.js';
import { WATERFALL_PIXEL_GLSL, WATERFALL_POOL_FOAM_GLSL, waterfallColorUniforms } from './WaterfallPixels.js';

const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const INDICES = [0, 2, 1, 1, 2, 3];
const EMPTY_LIGHT = { sky: 0, local: [0, 0, 0], classicShade: 0 };

function noise(x, y, period) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const hash = (a, b) => {
        a = (a % period + period) % period;
        b = (b % period + period) % period;
        let h = Math.imul(a + 31, 374761393) ^ Math.imul(b + 17, 668265263);
        h = Math.imul(h ^ h >>> 13, 1274126177);
        return ((h ^ h >>> 16) >>> 0) / 4294967295;
    };
    const fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v)
        + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}

// Two seamless noise scales in one small, deterministic texture. Its islands
// provide uneven foam rather than round particles or another set of rings.
export function createFoamPattern() {
    const size = 64, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const at = (y * size + x) * 4;
        pixels[at] = Math.round(noise((x + .5) / 16, (y + .5) / 16, 4) * 255);
        pixels[at + 1] = Math.round(noise((x + .5) / 4, (y + .5) / 4, 16) * 255);
        pixels[at + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name = 'Waterfall foam islands';
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function createMaterial(texture) {
    return createWaterfallEffectMaterial({ name: 'Waterfall flat foam', key: 'waterfall-foam-v2',
        color: 0xe4f2ee, surface: true,
        uniforms: { uFoamTime: { value: 0 }, uFoamPattern: { value: texture }, ...waterfallColorUniforms },
        vertexDeclarations: `
            uniform float uTime;
            uniform float uWaveHeight;
            attribute vec4 foamParams;
            attribute vec2 foamFlow;
            attribute float foamPhase;
            attribute float foamWave;
            varying vec4 vFoamParams;
            varying vec2 vFoamFlow;
            varying float vFoamPhase;
            ${WATER_WAVE_GLSL}`,
        vertexTransform: `
            vec3 foamWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
            transformed.y += waterWave(foamWorld.xz, uTime) * uWaveHeight * foamWave;
            vFoamParams = foamParams;
            vFoamFlow = foamFlow;
            vFoamPhase = foamPhase;`,
        fragmentDeclarations: `
            uniform float uFoamTime;
            uniform sampler2D uFoamPattern;
            uniform vec3 uWaterAverage;
            varying vec4 vFoamParams;
            varying vec2 vFoamFlow;
            varying float vFoamPhase;
            ${WATERFALL_PIXEL_GLSL}
            ${WATERFALL_POOL_FOAM_GLSL}`,
        fragmentColor: `
            vec2 pixel = (floor(vEffectWorld.xz * 16.0) + 0.5) / 16.0;
            float radial = length(pixel - vFoamParams.xy) / vFoamParams.z;
            if (radial >= 1.0) discard;
            vec2 drift = vFoamFlow * uFoamTime * 0.12;
            vec2 uv = pixel * 0.42 - drift + vec2(vFoamPhase, vFoamPhase * 0.73);
            float broad = texture2D(uFoamPattern, uv).r;
            float detail = texture2D(uFoamPattern, uv * 1.7 + vec2(0.17, 0.31)).g;
            float islands = smoothstep(0.42, 0.70, broad * 0.78 + detail * 0.22
                + sin(uFoamTime * 0.65 + vFoamPhase * 6.283 + broad * 5.0) * 0.045);
            float spread = 1.0 - smoothstep(0.12, 1.0, radial);
            // 0.87.0: tuż pod wodospadem gęsta, pikselowa plama piany
            // (WaterfallPixels.js), dalej - wyspy piany niesione nurtem.
            vec4 poolFoam = waterfallPoolFoam(vEffectWorld.xz, vFoamParams.xy,
                clamp(0.9 + vFoamParams.z * 0.3, 1.6, 2.6), uFoamTime, uWaterAverage);
            if (poolFoam.a > 0.0) {
                diffuseColor.rgb = poolFoam.rgb;
                diffuseColor.a = poolFoam.a;
            } else {
                diffuseColor.a *= islands * spread * vFoamParams.w;
                diffuseColor.rgb *= 0.84 + 0.16 * detail;
            }`
    });
}

/** Own GPU buffers, borrowed discovery only. Never reads blocks, performs a
 * second BFS, or disposes the ripple surface owned by WaterfallEffects. */
export class WaterfallFoam {
    constructor(scene, surface) {
        this.scene = scene;
        this.surface = surface;
        this.texture = createFoamPattern();
        this.material = createMaterial(this.texture);
        this.geometry = new THREE.BufferGeometry();
        for (const [name, size] of [['position', 3], ['normal', 3], ['effectLight', 4], ['effectShade', 1],
            ['foamParams', 4], ['foamFlow', 2], ['foamPhase', 1], ['foamWave', 1]]) {
            this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(RIPPLE_MAX_TILES * 4 * size), size)
                .setUsage(THREE.DynamicDrawUsage));
        }
        this.geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(RIPPLE_MAX_TILES * 6), 1).setUsage(THREE.DynamicDrawUsage));
        this.geometry.setDrawRange(0, 0);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Waterfall flat foam';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.slots = new Map();
        this.used = new Uint8Array(RIPPLE_MAX_EMITTERS);
        this.flows = new Map();
        this.sourceRevision = -1;
        this.flowRevision = this.syncedFlowRevision = this.geometryRevision = this.tiles = 0;
        this.amount = 1;
        this.geometryLimit = RIPPLE_MAX_EMITTERS;
        this.lastMs = 0;
        this.disposed = false;
    }

    setAmount(amount) {
        if (this.disposed) return;
        this.amount = effectAmount(amount);
        this.material.uniforms.uEffectAmount.value = this.amount > 0 ? (this.amount <= .35 ? .65 : 1) : 0;
        if (this.amount > 0 && this.geometryLimit !== (this.amount <= .35 ? 4 : RIPPLE_MAX_EMITTERS)) this.syncGeometry();
        this.mesh.visible = this.amount > 0 && this.tiles > 0;
    }

    setLandings(landings) {
        if (this.disposed) return;
        const flows = new Map();
        for (const landing of landings.slice(0, 64)) {
            const flow = [Number.isFinite(landing.flowX) ? landing.flowX : 0, Number.isFinite(landing.flowZ) ? landing.flowZ : 0];
            for (const y of [landing.y, landing.y - 1]) flows.set(`${landing.x},${y},${landing.z}`, flow);
        }
        if (flows.size !== this.flows.size || [...flows].some(([key, flow]) => {
            const old = this.flows.get(key); return !old || flow[0] !== old[0] || flow[1] !== old[1];
        })) { this.flows = flows; this.flowRevision++; }
    }

    setTime(seconds) { if (!this.disposed) setEffectTime(this.material.uniforms.uFoamTime, seconds); }

    update(dt) {
        if (this.disposed) return;
        const start = performance.now();
        advanceEffectTime(this.material.uniforms.uFoamTime, dt);
        if (this.amount <= 0) { this.lastMs = performance.now() - start; return; }
        if (this.sourceRevision !== this.surface.revision || this.syncedFlowRevision !== this.flowRevision) this.syncGeometry();
        this.mesh.visible = this.amount > 0 && this.tiles > 0;
        this.lastMs = performance.now() - start;
    }

    syncGeometry() {
        this.geometryLimit = this.amount <= .35 ? 4 : RIPPLE_MAX_EMITTERS;
        const entries = this.surface.entries.slice(0, this.geometryLimit);
        for (const [id, slot] of this.slots) if (!entries.some(entry => entry.id === id)) {
            this.used[slot.index] = 0; this.slots.delete(id);
        }
        let count = 0;
        for (const entry of entries) {
            let slot = this.slots.get(entry.id);
            if (!slot) {
                const index = this.used.indexOf(0);
                if (index < 0) break;
                this.used[index] = 1;
                this.slots.set(entry.id, slot = { index, revision: -1, flowX: NaN, flowZ: NaN });
            }
            const flow = this.flows.get(entry.key) ?? [0, 0];
            if (slot.revision !== entry.revision || slot.flowX !== flow[0] || slot.flowZ !== flow[1]) {
                this.writeEntry(entry, slot.index, flow);
                slot.revision = entry.revision; slot.flowX = flow[0]; slot.flowZ = flow[1];
            }
            for (let p = 0; p < Math.min(entry.patches.length, RIPPLE_PATCHES_PER_EMITTER); p++) {
                const at = (slot.index * RIPPLE_PATCHES_PER_EMITTER + p) * 4;
                for (const i of INDICES) this.geometry.index.array[count++] = at + i;
            }
        }
        if (count) { this.geometry.index.addUpdateRange(0, count); this.geometry.index.needsUpdate = true; }
        this.geometry.setDrawRange(0, count);
        this.tiles = count / 6;
        this.sourceRevision = this.surface.revision;
        this.syncedFlowRevision = this.flowRevision;
        this.geometryRevision++;
    }

    writeEntry(entry, slot, flow) {
        const a = this.geometry.attributes, first = slot * RIPPLE_PATCHES_PER_EMITTER * 4;
        const length = Math.min(entry.patches.length, RIPPLE_PATCHES_PER_EMITTER);
        const phase = ((Math.floor(entry.x) * 13 + Math.floor(entry.z) * 7) % 29 + 29) % 29 / 29;
        for (let p = 0; p < length; p++) {
            const patch = entry.patches[p], light = patch.lighting ?? entry.lighting ?? EMPTY_LIGHT;
            const [h00, h10, h01, h11] = patch.heights;
            const ax = h00 - h10, az = h00 - h01, bx = h01 - h11, bz = h10 - h11;
            for (let c = 0; c < 4; c++) {
                const at = first + p * 4 + c, nx = c === 0 ? ax : c === 3 ? bx : (ax + bx) / 2;
                const nz = c === 0 ? az : c === 3 ? bz : (az + bz) / 2, norm = Math.hypot(nx, 1, nz);
                a.position.setXYZ(at, patch.x + CORNERS[c][0], patch.y + patch.heights[c] + .012, patch.z + CORNERS[c][1]);
                a.normal.setXYZ(at, nx / norm, 1 / norm, nz / norm);
                a.effectLight.setXYZW(at, light.local[0], light.local[1], light.local[2], light.sky);
                a.effectShade.setX(at, light.classicShade);
                a.foamParams.setXYZW(at, entry.x, entry.z, entry.radius * .78, Math.min(.68, entry.opacity * 1.4));
                a.foamFlow.setXY(at, flow[0], flow[1]);
                a.foamPhase.setX(at, phase); a.foamWave.setX(at, patch.waves[c] / 255);
            }
        }
        if (length) for (const attribute of Object.values(a)) {
            attribute.addUpdateRange(first * attribute.itemSize, length * 4 * attribute.itemSize); attribute.needsUpdate = true;
        }
    }

    stats() {
        return { enabled: this.amount > 0, tiles: this.mesh.visible ? this.tiles : 0, cachedTiles: this.tiles,
            draws: this.mesh.visible ? 1 : 0, triangles: this.mesh.visible ? this.tiles * 2 : 0,
            maxTiles: RIPPLE_MAX_TILES, geometryRevision: this.geometryRevision, sourceRevision: this.sourceRevision,
            textureBytes: 64 * 64 * 4, lastMs: this.lastMs, time: this.material.uniforms.uFoamTime.value };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.scene.remove(this.mesh); this.mesh.visible = false;
        this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
        this.slots.clear(); this.flows.clear(); this.surface = null;
    }
}
