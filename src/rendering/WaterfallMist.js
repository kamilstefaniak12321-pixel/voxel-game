import * as THREE from 'three';
import { createWaterfallEffectMaterial, effectAmount, advanceEffectTime, setEffectTime } from './WaterfallEffectMaterial.js';

export const MIST_MAX_INSTANCES = 32;
export const MIST_LOW_INSTANCES = 8;
export const MIST_MIN_FALL = 6;
export const MIST_FADE_RANGE = Object.freeze([24, 38]);
const EMPTY_LIGHT = { sky: 0, local: [0, 0, 0], classicShade: 0 };
const ATTRIBUTES = [['mistAnchor', 4], ['mistParams', 4], ['mistDrift', 2], ['effectLight', 4], ['effectShade', 1]];

function seed(x, z, n) {
    let value = Math.imul(x + 17, 374761393) ^ Math.imul(z - 23, 668265263) ^ Math.imul(n + 1, 1274126177);
    value = Math.imul(value ^ value >>> 13, 1274126177);
    return ((value ^ value >>> 16) >>> 0) / 4294967295;
}

// A soft edge and a slightly uneven interior avoid both hard billboard boxes
// and bright, perfectly circular smoke. The texture is created only once.
export function createMistPattern() {
    const size = 32, pixels = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const dx = (x + .5) / size * 2 - 1, dy = (y + .5) / size * 2 - 1;
        const radius = Math.hypot(dx, dy);
        const fade = Math.max(0, 1 - radius * radius);
        const density = .8 + .2 * Math.sin(dx * 6 + Math.cos(dy * 5)) * Math.cos(dy * 4 - dx);
        const at = (y * size + x) * 4;
        pixels[at] = pixels[at + 1] = pixels[at + 2] = 255;
        pixels[at + 3] = x === 0 || y === 0 || x === size - 1 || y === size - 1
            ? 0 : Math.round(255 * fade * fade * density);
    }
    const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
    texture.name = 'Waterfall soft mist';
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function createMaterial(texture) {
    return createWaterfallEffectMaterial({ name: 'Waterfall soft mist', key: 'waterfall-mist-v1', color: 0xdae7e9,
        uniforms: { uMistTime: { value: 0 }, uMistPattern: { value: texture },
            uMistRight: { value: new THREE.Vector3(1, 0, 0) }, uMistUp: { value: new THREE.Vector3(0, 1, 0) } },
        vertexDeclarations: `
            uniform float uMistTime;
            uniform vec3 uMistRight;
            uniform vec3 uMistUp;
            attribute vec2 mistUv;
            attribute vec4 mistAnchor;
            attribute vec4 mistParams;
            attribute vec2 mistDrift;
            varying vec2 vMistUv;
            varying float vMistOpacity;`,
        vertexTransform: `
            float age = fract(uMistTime / mistParams.y + mistParams.x);
            float fade = smoothstep(0.0, 0.16, age) * (1.0 - smoothstep(0.60, 1.0, age));
            vec3 centre = mistAnchor.xyz;
            centre.xz += mistDrift * age;
            centre.xz += vec2(sin(age * 4.0 + mistParams.x * 6.283),
                cos(age * 3.0 + mistParams.x * 6.283)) * 0.09;
            centre.y += age * (0.55 + 0.075 * mistAnchor.w);
            float size = mistParams.z * (0.7 + age * 0.5);
            transformed = centre + (uMistRight * position.x + uMistUp * position.y) * size;
            vMistUv = mistUv;
            vMistOpacity = fade * mistParams.w;`,
        fragmentDeclarations: `
            uniform sampler2D uMistPattern;
            varying vec2 vMistUv;
            varying float vMistOpacity;`,
        fragmentColor: `
            float mistDistance = length(vEffectWorld - cameraPosition);
            float nearFade = smoothstep(0.20, 0.85, mistDistance);
            float farFade = 1.0 - smoothstep(${MIST_FADE_RANGE[0].toFixed(1)}, ${MIST_FADE_RANGE[1].toFixed(1)}, mistDistance);
            diffuseColor.a *= texture2D(uMistPattern, vMistUv).a * vMistOpacity * nearFade * farFade;`
    });
}

/** Fixed-size, GPU-animated billboards. Animation only changes uniforms;
 * landing refreshes are the sole source of instance-buffer uploads. */
export class WaterfallMist {
    constructor(scene) {
        this.scene = scene;
        this.texture = createMistPattern();
        this.material = createMaterial(this.texture);
        this.geometry = new THREE.InstancedBufferGeometry();
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute([-.5,-.5,0, .5,-.5,0, -.5,.5,0, .5,.5,0], 3));
        // A stable upward lighting normal matches the receiving water. Camera
        // rotation must not turn stationary mist from dark to brightly lit.
        this.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 0,1,0, 0,1,0], 3));
        this.geometry.setAttribute('mistUv', new THREE.Float32BufferAttribute([0,0, 1,0, 0,1, 1,1], 2));
        this.geometry.setIndex([0,1,2, 1,3,2]);
        this.geometry.instanceCount = 0;
        for (const [name, size] of ATTRIBUTES) this.geometry.setAttribute(name,
            new THREE.InstancedBufferAttribute(new Float32Array(MIST_MAX_INSTANCES * size), size).setUsage(THREE.DynamicDrawUsage));
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Waterfall soft mist';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 4;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.landings = [];
        this.amount = 1;
        this.bufferRevision = this.lastMs = 0;
        this.disposed = false;
    }

    get limit() { return this.amount <= 0 ? 0 : this.amount <= .35 ? MIST_LOW_INSTANCES : MIST_MAX_INSTANCES; }

    setAmount(amount) {
        if (this.disposed) return;
        const before = this.limit;
        this.amount = effectAmount(amount);
        this.material.uniforms.uEffectAmount.value = this.amount > 0 ? (this.amount <= .35 ? .75 : 1) : 0;
        if (this.limit !== before) this.syncInstances();
        this.mesh.visible = this.amount > 0 && this.geometry.instanceCount > 0;
    }

    setLandings(landings) {
        if (this.disposed) return;
        this.landings = landings.slice(0, 64);
        this.syncInstances();
    }

    syncInstances() {
        const candidates = this.landings.filter(landing => Number.isFinite(landing.fall) && landing.fall >= MIST_MIN_FALL)
            .sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
        const instances = [];
        // Give each nearby waterfall a wisp before giving a tall one extra
        // layers; a single impact cannot exhaust the whole budget.
        for (let layer = 0; layer < 4 && instances.length < this.limit; layer++) for (const landing of candidates) {
            if (instances.length >= this.limit) break;
            if (layer >= Math.min(4, 1 + Math.floor((landing.fall - MIST_MIN_FALL) / 3))) continue;
            instances.push({ landing, layer });
        }
        // Normal alpha blending benefits from drawing distant wisps first.
        instances.sort((a, b) => b.landing.distance - a.landing.distance || a.layer - b.layer
            || a.landing.x - b.landing.x || a.landing.z - b.landing.z);
        const data = Object.fromEntries(ATTRIBUTES.map(([name, size]) => [name, new Float32Array(instances.length * size)]));
        for (let i = 0; i < instances.length; i++) {
            const { landing, layer } = instances[i], { x, z } = landing;
            const fall = Math.max(MIST_MIN_FALL, Math.min(16, landing.fall));
            const light = landing.lighting ?? EMPTY_LIGHT;
            const a = seed(x, z, layer), b = seed(x, z, layer + 9), angle = b * Math.PI * 2;
            const spread = .15 + .35 * a;
            const flowX = Number.isFinite(landing.flowX) ? landing.flowX : 0;
            const flowZ = Number.isFinite(landing.flowZ) ? landing.flowZ : 0;
            const y = Number.isFinite(landing.surface) ? landing.surface : landing.y;
            data.mistAnchor.set([x + .5 + Math.cos(angle) * spread, y + .2, z + .5 + Math.sin(angle) * spread, fall], i * 4);
            data.mistParams.set([a, 2.2 + b * 1.3, .9 + fall * .065 + b * .25, .09 + fall * .004], i * 4);
            data.mistDrift.set([flowX * .35 + Math.cos(angle) * .35, flowZ * .35 + Math.sin(angle) * .35], i * 2);
            data.effectLight.set([light.local[0], light.local[1], light.local[2], light.sky], i * 4);
            data.effectShade[i] = light.classicShade;
        }
        let changed = this.geometry.instanceCount !== instances.length;
        for (const [name] of ATTRIBUTES) {
            const attribute = this.geometry.attributes[name], next = data[name];
            if (!next.some((value, at) => value !== attribute.array[at])) continue;
            attribute.array.set(next);
            attribute.addUpdateRange(0, next.length); attribute.needsUpdate = true;
            changed = true;
        }
        this.geometry.instanceCount = instances.length;
        this.mesh.visible = this.amount > 0 && instances.length > 0;
        if (changed) this.bufferRevision++;
    }

    setTime(seconds) { if (!this.disposed) setEffectTime(this.material.uniforms.uMistTime, seconds); }

    update(dt, camera = null) {
        if (this.disposed) return;
        const start = performance.now();
        advanceEffectTime(this.material.uniforms.uMistTime, dt);
        if (camera?.matrixWorld) {
            camera.updateMatrixWorld?.();
            this.material.uniforms.uMistRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
            this.material.uniforms.uMistUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        }
        this.lastMs = performance.now() - start;
    }

    stats() {
        const instances = this.mesh.visible ? this.geometry.instanceCount : 0;
        return { enabled: this.amount > 0, instances, maxInstances: this.limit, triangles: instances * 2,
            draws: instances > 0 ? 1 : 0, bufferRevision: this.bufferRevision, textureBytes: 32 * 32 * 4,
            lastMs: this.lastMs, time: this.material.uniforms.uMistTime.value };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true; this.mesh.visible = false;
        this.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
        this.landings.length = 0;
    }
}
