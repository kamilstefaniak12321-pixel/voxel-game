import * as THREE from 'three';
import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';

// Four nearby hearths, one shared atlas. Static terrain shadows are cached;
// flickering changes four floats, never chunk meshes or shadow cameras.
export const FIRE_LIGHT_LIMIT = 4;
const SIZE = 256, RANGE = 16;
export const campfireLightUniforms = {
    uFireShadowMap: { value: null },
    uFireMatrices: { value: Array.from({length: 24}, () => new THREE.Matrix4()) },
    uFirePositions: { value: Array.from({length: 4}, () => new THREE.Vector3()) },
    uFirePowers: { value: [0, 0, 0, 0] }
};
export const CAMPFIRE_LIGHT_GLSL = /* glsl */ `
    uniform highp sampler2D uFireShadowMap;
    uniform mat4 uFireMatrices[24];
    uniform vec3 uFirePositions[4];
    uniform float uFirePowers[4];
    vec3 campfireLight(vec3 p, vec3 normal) {
        vec3 result = vec3(0.0);
        for (int i = 0; i < 4; i++) {
            if (uFirePowers[i] <= 0.0) continue;
            vec3 delta = p - uFirePositions[i];
            float d = length(delta);
            if (d >= 16.0) continue;
            vec3 a = abs(delta);
            int face = a.x >= a.y && a.x >= a.z ? (delta.x > 0.0 ? 0 : 1)
                : a.y >= a.z ? (delta.y > 0.0 ? 2 : 3) : (delta.z > 0.0 ? 4 : 5);
            vec4 clip = uFireMatrices[i * 6 + face] * vec4(p + normal * .035, 1.0);
            vec3 s = clip.xyz / clip.w * .5 + .5;
            vec2 cell = vec2(float(face), float(i));
            float visibility = 0.0;
            for (int t = 0; t < 4; t++) {
                vec2 offset = vec2(float(t - (t / 2) * 2), float(t / 2)) - .5;
                vec2 uv = clamp(s.xy + offset / 256.0, vec2(.5 / 256.0), vec2(1.0 - .5 / 256.0));
                visibility += step(s.z - .00012, texture2D(uFireShadowMap, (cell + uv) / vec2(6.0, 4.0)).r) * .25;
            }
            float facing = max(0.0, dot(normalize(normal), -delta / max(d, .001)));
            float falloff = pow(1.0 - d / 16.0, 2.0) / (1.0 + d * d * .09);
            result += vec3(1.0, .36, .085) * (3.5 * uFirePowers[i] * falloff * facing * visibility);
        }
        return result;
    }
`;

const directions = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const up = [[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]];

export class CampfireLight {
    constructor(renderer) {
        this.renderer = renderer;
        this.target = new THREE.WebGLRenderTarget(SIZE * 6, SIZE * 4, {
            format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
            generateMipmaps: false, depthBuffer: true });
        this.target.depthTexture = new THREE.DepthTexture(SIZE * 6, SIZE * 4, THREE.UnsignedIntType);
        this.target.depthTexture.minFilter = this.target.depthTexture.magFilter = THREE.NearestFilter;
        campfireLightUniforms.uFireShadowMap.value = this.target.depthTexture;
        this.slots = Array.from({length: 4}, () => ({key:null, stamp:-1}));
        this.camera = new THREE.PerspectiveCamera(90, 1, .05, RANGE);
        this.frustum = new THREE.Frustum(); this.matrix = new THREE.Matrix4(); this.box = new THREE.Box3();
        this.meshVersion = 0; this.cursor = 0; this.nextDraw = 0; this.draws = 0;
    }

    update(sources, clock) {
        this.sources = sources.slice(0, FIRE_LIGHT_LIMIT);
        for (let i = 0; i < 4; i++) {
            const source = this.sources[i], slot = this.slots[i];
            const key = source?.key ?? null;
            if (slot.key !== key) { slot.key = key; slot.stamp = -1; }
            if (source) campfireLightUniforms.uFirePositions.value[i].copy(source.position);
            campfireLightUniforms.uFirePowers.value[i] = source && slot.stamp >= 0
                ? source.power * (1 + .035 * Math.sin(clock * 9 + i) + .025 * Math.sin(clock * 17.3 + i)) : 0;
        }
    }

    markChunk(chunk) {
        // Distant streaming and wind do not invalidate a stationary hearth.
        this.box.min.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
        this.box.max.set((chunk.cx + 1) * CHUNK_SIZE, CHUNK_HEIGHT, (chunk.cz + 1) * CHUNK_SIZE);
        if (this.sources?.some(source => this.box.distanceToPoint(source.position) < RANGE)) this.meshVersion++;
    }

    render(world, clock) {
        if (!this.renderer.capabilities.isWebGL2 || clock < this.nextDraw) return;
        let index = -1;
        for (let step = 0; step < 4; step++) {
            const i = (this.cursor + step) % 4, slot = this.slots[i];
            if (slot.key && slot.stamp !== this.meshVersion) { index = i; break; }
        }
        if (index < 0) return;
        const renderer = this.renderer, camera = this.camera;
        const position = this.sources[index].position;
        const previous = renderer.getRenderTarget();
        const viewport = renderer.getViewport(new THREE.Vector4());
        const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
        const auto = renderer.autoClear;
        const casters = world.shadowScene.children;
        const visibility = casters.map(mesh => mesh.visible);
        const near = casters.map(mesh => {
            const c = mesh.userData.chunk;
            if (!c) return false;
            this.box.min.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
            this.box.max.set((c.cx + 1) * CHUNK_SIZE, CHUNK_HEIGHT, (c.cz + 1) * CHUNK_SIZE);
            return this.box.distanceToPoint(position) < RANGE;
        });
        try {
            renderer.autoClear = false; renderer.setRenderTarget(this.target); renderer.setScissorTest(true);
            camera.position.copy(position);
            for (let face = 0; face < 6; face++) {
                camera.up.set(...up[face]);
                camera.lookAt(position.clone().add(new THREE.Vector3(...directions[face])));
                camera.updateMatrixWorld();
                this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
                campfireLightUniforms.uFireMatrices.value[index * 6 + face].copy(this.matrix);
                this.frustum.setFromProjectionMatrix(this.matrix);
                casters.forEach((mesh, j) => {
                    if (!near[j]) { mesh.visible = false; return; }
                    const c = mesh.userData.chunk;
                    this.box.min.set(c.cx * CHUNK_SIZE, 0, c.cz * CHUNK_SIZE);
                    this.box.max.set((c.cx + 1) * CHUNK_SIZE, CHUNK_HEIGHT, (c.cz + 1) * CHUNK_SIZE);
                    mesh.visible = this.frustum.intersectsBox(this.box);
                });
                renderer.setViewport(face * SIZE, index * SIZE, SIZE, SIZE);
                renderer.setScissor(face * SIZE, index * SIZE, SIZE, SIZE);
                renderer.clear(false, true, false);
                renderer.render(world.shadowScene, camera); this.draws++;
            }
            this.slots[index].stamp = this.meshVersion;
            this.cursor = (index + 1) % 4;
            // Never refresh more than one complete light per frame. Scene changes
            // share a 10 Hz budget; each completed six-face set becomes visible together.
            this.nextDraw = clock + .1;
        } finally {
            casters.forEach((mesh, i) => { mesh.visible = visibility[i]; });
            renderer.setRenderTarget(previous); renderer.setViewport(viewport);
            renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); renderer.autoClear = auto;
        }
    }

    dispose() {
        campfireLightUniforms.uFirePowers.value.fill(0);
        campfireLightUniforms.uFireShadowMap.value = null;
        this.target.depthTexture.dispose(); this.target.dispose();
    }
}
