import * as THREE from 'three';
import { WaterfallRippleSurface } from './WaterfallRippleSurface.js';
import { plantWindUniforms } from './PlantWind.js';
import { WATER_WAVE_GLSL } from './WaterWave.js';
import { viewUniforms, VIEW_GLSL } from './viewUniforms.js';
import { skyUniforms } from '../sky/skyShader.js';
import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { installLightingDiagnostics } from './LightingDiagnostics.js';
import { shadowUniforms, SHADOW_GLSL, shadowLightsChunk } from './Shadows.js';
import { waterfallLightingAt } from './WaterfallLighting.js';
import { waterEffectLightUniforms, WATER_EFFECT_DYNAMIC_LIGHT_GLSL } from './WaterEffectDynamicLight.js';

export const RIPPLE_PERIOD = 2.4;
export const RIPPLE_MAX_EMITTERS = 12;
export const RIPPLE_PATCHES_PER_EMITTER = 169;
export const RIPPLE_MAX_TILES = RIPPLE_MAX_EMITTERS * RIPPLE_PATCHES_PER_EMITTER;
const CORNERS = [[0, 0], [1, 0], [0, 1], [1, 1]];
const INDICES = [0, 2, 1, 1, 2, 3];

// One reusable 128x1 texture: a bright crest and its dimmer trailing trough.
// The GPU samples it radially at world coordinates, so rings cross block and
// chunk borders. No new bitmap, particles or geometry are created per pulse.
export function createRippleProfile() {
    const pixels = new Uint8Array(128 * 4);
    for (let i = 0; i < 128; i++) {
        const phase = (i + .5) / 128;
        pixels[i * 4] = Math.round(255 * Math.exp(-(((phase - .53) / .052) ** 2)));
        pixels[i * 4 + 1] = Math.round(255 * Math.exp(-(((phase - .42) / .075) ** 2)));
        pixels[i * 4 + 3] = 255;
    }
    const texture = new THREE.DataTexture(pixels, 128, 1, THREE.RGBAFormat);
    texture.name = 'Waterfall ripple crest profile';
    texture.wrapS = THREE.RepeatWrapping;
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function createMaterial(profile) {
    const material = new THREE.MeshLambertMaterial({ color: 0xd9f0f7,
        transparent: true, depthWrite: false, side: THREE.FrontSide,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    material.name = 'Waterfall surface ripples';
    material.uniforms = { uRippleTime: { value: 0 }, uRippleClock: { value: 0 }, uRippleAmount: { value: 1 },
        uRippleProfile: { value: profile } };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, material.uniforms, plantWindUniforms, viewUniforms, skyUniforms, shadowUniforms, waterEffectLightUniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                uniform float uTime;
                uniform float uWaveHeight;
                attribute vec4 rippleParams;
                attribute vec3 rippleMeta;
                attribute vec4 rippleLight;
                attribute vec2 rippleLife;
                varying vec2 vRippleWorld;
                varying vec3 vRipplePosition;
                varying vec3 vRippleNormal;
                varying vec4 vRippleParams;
                varying vec3 vRippleMeta;
                varying vec4 vRippleLight;
                varying vec2 vRippleLife;
                ${WATER_WAVE_GLSL}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vec3 rippleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
                float rippleWave = waterWave(rippleWorld.xz, uTime) * uWaveHeight * rippleMeta.x;
                transformed.y += rippleWave;
                rippleWorld.y += rippleWave;
                vRippleWorld = rippleWorld.xz;
                vRipplePosition = rippleWorld;
                vRippleNormal = normalize(mat3(modelMatrix) * objectNormal);
                vRippleParams = rippleParams;
                vRippleMeta = rippleMeta;
                vRippleLight = rippleLight;
                vRippleLife = rippleLife;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                uniform float uRippleTime;
                uniform float uRippleClock;
                uniform float uRippleAmount;
                uniform sampler2D uRippleProfile;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                varying vec2 vRippleWorld;
                varying vec3 vRipplePosition;
                varying vec3 vRippleNormal;
                varying vec4 vRippleParams;
                varying vec3 vRippleMeta;
                varying vec4 vRippleLight;
                varying vec2 vRippleLife;
                ${VIEW_GLSL}
                ${SURFACE_LIGHTING_GLSL}
                ${WATER_EFFECT_DYNAMIC_LIGHT_GLSL}
                ${SHADOW_GLSL}
                #ifndef USE_SUN_SHADOWS
                    uniform int uSunShadowLight;
                #endif`)
            .replace('#include <map_fragment>', `
                if (uUnderwater > 0.5) discard;
                // A world-aligned 16px/block pattern keeps the game's pixel
                // scale while the shared phase moves outwards continuously.
                vec2 pixel = (floor(vRippleWorld * 16.0) + 0.5) / 16.0;
                float radial = length(pixel - vRippleParams.xy) / vRippleParams.z;
                if (radial >= 1.0) discard;
                float phase = fract(radial * 3.0 - uRippleTime * ${(3 / RIPPLE_PERIOD).toFixed(6)} + vRippleMeta.y);
                float impulseFade = 1.0;
                if (vRippleLife.y > 0.0) {
                    float age = (uRippleClock - vRippleLife.x) / vRippleLife.y;
                    if (age < 0.0 || age >= 1.0) discard;
                    // One expanding crest, never a repeating train of rings.
                    // Clamp the profile coordinate so its RepeatWrapping cannot
                    // introduce a second crest on a short-lived impact.
                    phase = clamp(0.53 + (radial - age) * 1.8, 0.0, 0.99999);
                    impulseFade = pow(1.0 - age, 1.1) * smoothstep(0.0, 0.08, age);
                }
                vec2 crest = texture2D(uRippleProfile, vec2(phase, 0.5)).rg;
                float innerFade = vRippleLife.y > 0.0
                    ? smoothstep(0.025, 0.12, radial * vRippleParams.z)
                    : smoothstep(0.22, 0.75, radial * vRippleParams.z);
                float fade = pow(max(0.0, 1.0 - radial), 1.35) * innerFade;
                diffuseColor.a *= (crest.r + crest.g * 0.45) * fade * impulseFade * vRippleParams.w * uRippleAmount;
                if (diffuseColor.a < 0.003) discard;
                diffuseColor.rgb *= mix(vec3(0.36, 0.58, 0.68), vec3(1.0),
                    crest.r / max(0.0001, crest.r + crest.g));
                float rippleSky = mix(vRippleMeta.z, vRippleLight.a, uAtmosphericLight);
                float rippleSun = rippleSky;
                float rippleAmbient = rippleSky;
                #ifdef USE_SUN_SHADOWS
                    rippleSun = sunShadowLight(vRipplePosition, normalize(vRippleNormal), rippleSky);
                    rippleAmbient = pow(max(0.0, rippleSky), 1.0 + uSunShadowAmbient / 2.2);
                #endif`)
            .replace('#include <lights_fragment_begin>', shadowLightsChunk('rippleSun', 'rippleSky', 'rippleAmbient'))
            .replace('#include <opaque_fragment>', `
                outgoingLight = surfaceRadiance(diffuseColor.rgb, outgoingLight,
                    waterEffectLocalLight(vRippleLight.rgb, vRipplePosition, normalize(vRippleNormal), 1.0),
                    vec3(0.0), vec3(0.0),
                    uNightDesaturation, uNightTint, uAtmosphericLight);
                outgoingLight += waterEffectAnalyticRadiance(diffuseColor.rgb, vRipplePosition, normalize(vRippleNormal));
                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);
                #include <opaque_fragment>`);
        installLightingDiagnostics(shader, { sky: 'vRippleLight.a', normal: 'normalize(vRippleNormal)', visibility: 'rippleSun' });
    };
    material.customProgramCacheKey = () => 'waterfall-ripples-v2';
    return material;
}

export class WaterfallRipples {
    constructor(scene, world, options) {
        this.scene = scene;
        this.surface = new WaterfallRippleSurface(world, { ...options,
            lightingAt: (x, y, z) => waterfallLightingAt(world, x, y, z) });
        this.texture = createRippleProfile();
        this.material = createMaterial(this.texture);
        this.geometry = new THREE.BufferGeometry();
        const vertices = RIPPLE_MAX_TILES * 4;
        for (const [name, size] of [['position', 3], ['normal', 3], ['rippleParams', 4],
            ['rippleMeta', 3], ['rippleLight', 4], ['rippleLife', 2]]) {
            this.geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertices * size), size)
                .setUsage(THREE.DynamicDrawUsage));
        }
        this.geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(RIPPLE_MAX_TILES * 6), 1)
            .setUsage(THREE.DynamicDrawUsage));
        this.geometry.setDrawRange(0, 0);
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Waterfall ripple surfaces';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 2;
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.slots = new Map();
        this.used = new Uint8Array(RIPPLE_MAX_EMITTERS);
        this.surfaceRevision = -1;
        this.geometryRevision = this.tiles = this.lastMs = 0;
        this.disposed = false;
    }

    setLandings(landings, amount = 1) {
        if (this.disposed) return;
        this.surface.setLandings(landings, amount);
        // Low detail limits emitter count as well as slightly reducing opacity.
        this.material.uniforms.uRippleAmount.value = amount > 0 ? (amount <= .35 ? .75 : 1) : 0;
    }

    update(dt, cellBudget) {
        if (this.disposed) return;
        const start = performance.now();
        const time = this.material.uniforms.uRippleTime;
        time.value = (time.value + Math.max(0, Number.isFinite(dt) ? dt : 0)) % RIPPLE_PERIOD;
        this.material.uniforms.uRippleClock.value += Math.max(0, Number.isFinite(dt) ? dt : 0);
        this.surface.update(cellBudget);
        if (this.surfaceRevision !== this.surface.revision) this.syncGeometry();
        this.lastMs = performance.now() - start;
    }

    syncGeometry() {
        const entries = this.surface.entries;
        for (const [id, slot] of this.slots) if (!entries.some(entry => entry.id === id)) {
            this.used[slot.index] = 0;
            this.slots.delete(id);
        }
        let count = 0;
        const indices = this.geometry.index.array;
        for (const entry of entries) {
            let slot = this.slots.get(entry.id);
            if (!slot) {
                const index = this.used.indexOf(0);
                if (index < 0) break;
                this.used[index] = 1;
                this.slots.set(entry.id, slot = { index, revision: -1 });
            }
            if (entry.revision !== slot.revision) {
                this.writeEntry(entry, slot.index);
                slot.revision = entry.revision;
            }
            const length = Math.min(entry.patches.length, RIPPLE_PATCHES_PER_EMITTER);
            for (let patch = 0; patch < length; patch++) {
                const vertex = (slot.index * RIPPLE_PATCHES_PER_EMITTER + patch) * 4;
                for (const i of INDICES) indices[count++] = vertex + i;
            }
        }
        if (count) {
            this.geometry.index.addUpdateRange(0, count);
            this.geometry.index.needsUpdate = true;
        }
        this.geometry.setDrawRange(0, count);
        this.tiles = count / 6;
        this.mesh.visible = count > 0;
        this.surfaceRevision = this.surface.revision;
        this.geometryRevision++;
    }

    writeEntry(entry, slot) {
        const { position, normal, rippleParams, rippleMeta, rippleLight, rippleLife } = this.geometry.attributes;
        const first = slot * RIPPLE_PATCHES_PER_EMITTER * 4;
        const length = Math.min(entry.patches.length, RIPPLE_PATCHES_PER_EMITTER);
        // Stable phase: refreshing or rebuilding a patch never restarts rings.
        const phase = ((Math.floor(entry.x) * 13 + Math.floor(entry.z) * 7) % 17 + 17) % 17 / 17;
        for (let p = 0; p < length; p++) {
            const patch = entry.patches[p];
            const light = patch.lighting ?? entry.lighting ?? { sky: 1, local: [0, 0, 0], classicShade: 1 };
            const [h00, h10, h01, h11] = patch.heights;
            const ax = h00 - h10, az = h00 - h01, bx = h01 - h11, bz = h10 - h11;
            for (let c = 0; c < 4; c++) {
                const at = first + p * 4 + c;
                position.setXYZ(at, patch.x + CORNERS[c][0], patch.y + patch.heights[c] + .008, patch.z + CORNERS[c][1]);
                const nx = c === 0 ? ax : c === 3 ? bx : (ax + bx) * .5;
                const nz = c === 0 ? az : c === 3 ? bz : (az + bz) * .5;
                const norm = Math.hypot(nx, 1, nz);
                normal.setXYZ(at, nx / norm, 1 / norm, nz / norm);
                rippleParams.setXYZW(at, entry.x, entry.z, entry.radius, entry.opacity);
                rippleMeta.setXYZ(at, patch.waves[c] / 255, phase, light.classicShade);
                rippleLight.setXYZW(at, light.local[0], light.local[1], light.local[2], light.sky);
                rippleLife.setXY(at, entry.birth ?? 0, entry.lifetime ?? 0);
            }
        }
        if (length) for (const attribute of Object.values(this.geometry.attributes)) {
            attribute.addUpdateRange(first * attribute.itemSize, length * 4 * attribute.itemSize);
            attribute.needsUpdate = true;
        }
    }

    stats() {
        return { ...this.surface.stats(), tiles: this.tiles, triangles: this.tiles * 2,
            draws: this.mesh.visible ? 1 : 0, lastMs: this.lastMs,
            surfaceRevision: this.surfaceRevision, geometryRevision: this.geometryRevision,
            maxTiles: RIPPLE_MAX_TILES, textureBytes: 512 };
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.scene.remove(this.mesh);
        this.surface.dispose();
        this.geometry.dispose();
        this.material.dispose();
        this.texture.dispose();
        this.slots.clear();
        this.mesh.visible = false;
    }
}
