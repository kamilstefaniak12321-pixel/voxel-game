import * as THREE from 'three';

import { skyUniforms } from '../sky/skyShader.js';

import { viewUniforms, VIEW_GLSL } from './viewUniforms.js';

import { meteorLightUniforms, METEOR_LIGHT_GLSL } from './meteorLight.js';

import { SURFACE_LIGHTING_GLSL } from './SurfaceLighting.js';
import { installLightingDiagnostics, installEmissionDiagnostics } from './LightingDiagnostics.js';

// ------------------------------------------------------------
// KANCIASTE CZĄSTECZKI
//
// Małe sześciany - iskry, żar, odłamki, dym. Wszystkie cząsteczki
// jednego rodzaju to jeden InstancedMesh (jedno rysowanie, nawet przy
// kilku tysiącach sześcianów).
//
//   glowing: true  - świecą same (iskry, żar): zawsze jasne, ściany
//                    tylko lekko cieniowane, żeby było widać sześcian,
//   glowing: false - zwykłe (odłamki ziemi i skał, dym): oświetlone
//                    jak teren - słońce, księżyc, nocna szarość
//                    i światło meteorytu (meteorLight.js).
//
// Każda cząsteczka ma czas życia, w którym zmienia rozmiar (size ->
// sizeEnd, a na końcu - część "fade" - maleje do zera) i kolor (trzy
// kolory: start -> middle w 35% życia -> end). Leci z prędkością,
// opada (gravity), unosi się (lift, np. dym), zwalnia w powietrzu
// (drag) i się obraca. Z collide: true odbija się od bloków świata
// i w końcu na nich leży.
// ------------------------------------------------------------

// Pola jednej cząsteczki w tablicy (STRIDE liczb na cząsteczkę).

const PX = 0, PY = 1, PZ = 2;
const VX = 3, VY = 4, VZ = 5;
const AGE = 6, LIFE = 7;
const SIZE = 8, SIZE_END = 9, FADE = 10;
const C0 = 11, C1 = 14, C2 = 17;
const RX = 20, RY = 21, RZ = 22;
const SX = 23, SY = 24, SZ = 25;
const GRAVITY = 26, DRAG = 27, COLLIDE = 28, RESTING = 29, LIFT = 30;
const LIGHT_RED = 31, LIGHT_GREEN = 32, LIGHT_BLUE = 33, LIGHT_SKY = 34;
const EMISSION = 35, CLASSIC_SHADE = 36;

// Liście (0.82.0): kołysanie na boki w locie i niesienie przez wiatr.
const FLUTTER = 37, PHASE = 38, CARRY = 39;

// Obrazek (0.84.0): który kształt z paska obrazków (sprites).
const SPRITE = 40;

// Pływanie po wodzie (0.88.0, FloatingLeaves.js): czy może pływać, w którym
// bloku wody leży, nurt pod nim i za ile sprawdzić nurt ponownie.
const FLOATS = 41, WATER_Y = 42, FLOW_X = 43, FLOW_Z = 44, FLOW_T = 45;

const STRIDE = 46;

// RESTING: 0 - leci, 1 - leży na bloku, 2 - pływa po wodzie.
const ON_GROUND = 1, ON_WATER = 2;

// Dla testów: układ pól jednej cząsteczki.
export const PARTICLE_LAYOUT = Object.freeze({ STRIDE, SPRITE, RESTING, PX, PY, PZ, VX, VZ, AGE, LIFE });

// Kiedy w życiu cząsteczki jest kolor "middle".
const MIDDLE = 0.35;


// Cieniowanie ścian sześcianu (kolejność ścian w BoxGeometry:
// +x, -x, +y, -y, +z, -z).

const SOLID_SHADE = [0.8, 0.8, 1.0, 0.6, 0.9, 0.9];
const GLOW_SHADE = [0.85, 0.85, 1.0, 0.75, 0.92, 0.92];


function createCubeGeometry(shades) {

    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const colors = new Float32Array(24 * 3);

    for (let face = 0; face < 6; face++) {

        for (let v = 0; v < 4; v++) {
            colors.fill(shades[face], (face * 4 + v) * 3, (face * 4 + v) * 3 + 3);
        }

    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return geometry;

}


// Materiał zwykłych cząsteczek: Lambert (słońce, księżyc, otoczenie
// sceny) + nocna szarość jak na blokach + światło meteorytu.

function createSolidMaterial(surfaceLighting) {

    const material = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });

    material.onBeforeCompile = (shader) => {

        Object.assign(shader.uniforms, skyUniforms, viewUniforms, meteorLightUniforms);

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vParticleWorld;
                varying vec3 vParticleNormal;`
            )
            .replace(
                '#include <project_vertex>',
                `#include <project_vertex>
                vec4 particleWorld = vec4(transformed, 1.0);
                vec3 particleNormal = objectNormal;
                #ifdef USE_INSTANCING
                    particleWorld = instanceMatrix * particleWorld;
                    particleNormal = mat3(instanceMatrix) * particleNormal;
                #endif
                vParticleWorld = (modelMatrix * particleWorld).xyz;
                vParticleNormal = normalize(mat3(modelMatrix) * particleNormal);`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                `#include <common>
                varying vec3 vParticleWorld;
                varying vec3 vParticleNormal;
                uniform float uNightDesaturation;
                uniform vec3 uNightTint;
                ${VIEW_GLSL}
                ${METEOR_LIGHT_GLSL}`
            )
            .replace(
                '#include <opaque_fragment>',
                `float particleLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));

                outgoingLight = mix(outgoingLight, particleLuminance * uNightTint, uNightDesaturation);

                outgoingLight += surfaceLocalRadiance(diffuseColor.rgb, meteorLight(vParticleWorld, vParticleNormal));

                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);

                #include <opaque_fragment>`
            );

        if (surfaceLighting) {

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    uniform float uAtmosphericLight;
                    attribute vec4 particleLight;
                    attribute vec2 particleEmission;
                    varying vec4 vParticleLight;
                    varying float vParticleEmission;`
                )
                .replace(
                    '#include <color_vertex>',
                    `#include <color_vertex>
                    // Classic zachowuje dawne cieniowanie koloru. Atmosfera
                    // dostaje samo albedo; światło jest składane we fragmencie.
                    vColor = mix(vColor * particleEmission.y, instanceColor, uAtmosphericLight);
                    vParticleLight = particleLight;
                    vParticleEmission = particleEmission.x;`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                    varying vec4 vParticleLight;
                    varying float vParticleEmission;
                    ${SURFACE_LIGHTING_GLSL}`
                )
                .replace(
                    `float particleLuminance = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));

                outgoingLight = mix(outgoingLight, particleLuminance * uNightTint, uNightDesaturation);`,
                    `float particleSky = mix(1.0, vParticleLight.a, uAtmosphericLight);
                    // Pole odłamka ogranicza naturalne źródła już po
                    // Lambert; diagnostyka musi pokazać tę samą energię.
                    diagnosticSun *= particleSky;
                    diagnosticMoon *= particleSky;
                    diagnosticSky *= particleSky;
                    vec3 particleLocal = vParticleLight.rgb * surfaceDecodeLight(surfaceFaceShade(vParticleNormal));
                    outgoingLight = surfaceRadiance(diffuseColor.rgb,
                        outgoingLight * particleSky,
                        particleLocal * uAtmosphericLight, vec3(0.0),
                        vec3(vParticleEmission * uAtmosphericLight),
                        uNightDesaturation, uNightTint, uAtmosphericLight);`
                );

        }

    };

    const compile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        compile(shader, renderer);
        installLightingDiagnostics(shader, { normal: 'vParticleNormal', sky: surfaceLighting ? 'vParticleLight.a' : '1.0' });
    };
    material.customProgramCacheKey = () => `cube-particles-surface-${surfaceLighting ? 1 : 0}`;

    return material;

}


// ------------------------------------------------------------
// OBRAZKI ZAMIAST SZEŚCIANÓW (0.84.0, pomysł Kamila)
//
// Płaski kwadrat z małym obrazkiem 6 x 6 "minipikseli" (liść, gałązka
// igieł, płatek). Obrazek jest szary - jasność; kolor daje cząsteczka
// (np. kolor liści gatunku). Wszystkie kształty w jednym pasku tekstury,
// cząsteczka wybiera swój (sprite przy emit).
//
// Znaki: . - przezroczysty, h - jasny, o - zwykły, d - żyłka / cień,
// s - ogonek.
// ------------------------------------------------------------

export const SPRITE_PIXELS = 6;
const SPRITE_SHADES = { h: 1, o: 0.84, d: 0.62, s: 0.48 };

export function spriteTexture(shapes) {

    const N = SPRITE_PIXELS, width = N * shapes.length;
    const data = new Uint8Array(width * N * 4);

    shapes.forEach((rows, index) => {
        if (rows.length !== N || rows.some((row) => row.length !== N)) throw new Error('Obrazek cząsteczki musi mieć 6 x 6');
        rows.forEach((row, y) => {
            for (let x = 0; x < N; x++) {
                const shade = SPRITE_SHADES[row[x]];
                // Wiersz 0 tekstury to dół obrazka.
                const i = ((N - 1 - y) * width + index * N + x) * 4;
                if (shade === undefined) continue;
                data.fill(Math.round(shade * 255), i, i + 3);
                data[i + 3] = 255;
            }
        });
    });

    const texture = new THREE.DataTexture(data, width, N, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;

}


function createSpriteGeometry() {

    // Poziomy kwadrat (leży jak liść); obie strony widoczne.
    const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(4 * 3).fill(1), 3));
    return geometry;

}

// ------------------------------------------------------------

export class CubeParticles {

    // capacity - najwięcej cząsteczek naraz (nowe ponad limit są pomijane)

    // flat - grubość względem rozmiaru (1 - sześcian, 0.2 - płatek liścia).

    // sprites - kształty 6 x 6 (spriteTexture): płaskie obrazki zamiast
    // sześcianów.

    constructor(scene, { capacity = 2000, glowing = false, surfaceLighting = false, flat = 1, sprites = null, water = null } = {}) {

        this.flat = flat;

        this.sprites = sprites?.length ? sprites.length : 0;

        // Wiatr niosący cząsteczki z carry > 0 (bloki/s, x i z).
        this.wind = { x: 0, z: 0 };

        // Liście na wodzie: obiekt z FloatingLeaves.js (null - bez pływania).
        this.water = water;
        this.probe = { top: 0, deeper: false, underFall: false };

        this.capacity = capacity;
        this.surfaceLighting = surfaceLighting && !glowing;

        this.data = new Float32Array(capacity * STRIDE);

        this.count = 0;


        const geometry = this.sprites ? createSpriteGeometry() : createCubeGeometry(glowing ? GLOW_SHADE : SOLID_SHADE);

        if (this.sprites) {
            const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
            attribute.setUsage(THREE.DynamicDrawUsage);
            geometry.setAttribute('particleSprite', attribute);
        }

        if (this.surfaceLighting) {
            for (const [name, size] of [['particleLight', 4], ['particleEmission', 2]]) {
                const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
                attribute.setUsage(THREE.DynamicDrawUsage);
                geometry.setAttribute(name, attribute);
            }
        }

        const material = glowing
            ? new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
            : createSolidMaterial(this.surfaceLighting);
        if (glowing) {
            material.onBeforeCompile = installEmissionDiagnostics;
            material.customProgramCacheKey = () => 'cube-particles-emission-v1';
        }

        if (this.sprites) {
            material.map = spriteTexture(sprites);
            material.alphaTest = 0.5;
            material.side = THREE.DoubleSide;
            const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
            const count = this.sprites.toFixed(1);
            material.onBeforeCompile = (shader, renderer) => {
                compile(shader, renderer);
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', '#include <common>\nattribute float particleSprite;')
                    .replace('#include <uv_vertex>', `#include <uv_vertex>
                    #ifdef USE_MAP
                        vMapUv = vec2((uv.x + particleSprite) / ${count}, uv.y);
                    #endif`);
            };
            material.customProgramCacheKey = () => `${key()}-sprites-${this.sprites}`;
        }

        this.mesh = new THREE.InstancedMesh(geometry, material, capacity);

        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

        this.mesh.count = 0;
        this.mesh.frustumCulled = false;

        scene.add(this.mesh);


        // Obiekty pomocnicze (bez tworzenia nowych co klatkę).

        this.matrix = new THREE.Matrix4();
        this.position = new THREE.Vector3();
        this.quaternion = new THREE.Quaternion();
        this.euler = new THREE.Euler();
        this.scale = new THREE.Vector3();
        this.color = new THREE.Color();

    }


    // Nowa cząsteczka. position, velocity - THREE.Vector3 (kopiowane),
    // colors - [start, middle, end] (THREE.Color, liniowe) albo jeden
    // kolor. Zwraca false, gdy nie ma miejsca.

    emit({
        position,
        velocity = null,
        life = 1,
        size = 0.2,
        sizeEnd = size,
        fade = 0.3,
        colors,
        gravity = 0,
        drag = 0,
        lift = 0,
        spin = 6,
        collide = false,
        // Kołysanie na boki w locie (bloki/s) i ile niesie wiatr (0-1).
        flutter = 0,
        carry = 0,
        // Liniowe mnożniki światła oddzielone od colors (albedo).
        // classicShade pozwala odtworzyć dawny wygląd bez wypalania go w albedo.
        lighting = null,
        // Numer kształtu (gdy cząsteczki są obrazkami).
        sprite = 0,
        // Pływa po wodzie (z opcją water w konstruktorze).
        floats = false
    }) {

        if (this.count >= this.capacity) {
            return false;
        }

        const d = this.data;

        const o = this.count * STRIDE;

        this.count++;


        d[o + PX] = position.x;
        d[o + PY] = position.y;
        d[o + PZ] = position.z;

        d[o + VX] = velocity ? velocity.x : 0;
        d[o + VY] = velocity ? velocity.y : 0;
        d[o + VZ] = velocity ? velocity.z : 0;

        d[o + AGE] = 0;
        d[o + LIFE] = Math.max(0.01, life);

        d[o + SIZE] = size;
        d[o + SIZE_END] = sizeEnd;
        d[o + FADE] = fade;


        const list = Array.isArray(colors) ? colors : [colors, colors, colors];

        for (let k = 0; k < 3; k++) {

            const c = list[Math.min(k, list.length - 1)];

            d[o + C0 + k * 3] = c.r;
            d[o + C0 + k * 3 + 1] = c.g;
            d[o + C0 + k * 3 + 2] = c.b;

        }


        d[o + RX] = Math.random() * Math.PI * 2;
        d[o + RY] = Math.random() * Math.PI * 2;
        d[o + RZ] = Math.random() * Math.PI * 2;

        d[o + SX] = (Math.random() * 2 - 1) * spin;
        d[o + SY] = (Math.random() * 2 - 1) * spin;
        d[o + SZ] = (Math.random() * 2 - 1) * spin;

        d[o + GRAVITY] = gravity;
        d[o + DRAG] = drag;
        d[o + LIFT] = lift;
        d[o + COLLIDE] = collide ? 1 : 0;
        d[o + RESTING] = 0;
        d[o + LIGHT_RED] = lighting?.local?.[0] ?? 0;
        d[o + LIGHT_GREEN] = lighting?.local?.[1] ?? 0;
        d[o + LIGHT_BLUE] = lighting?.local?.[2] ?? 0;
        d[o + LIGHT_SKY] = lighting?.sky ?? 1;
        d[o + EMISSION] = lighting?.emission ?? 0;
        d[o + CLASSIC_SHADE] = lighting?.classicShade ?? 1;
        d[o + FLUTTER] = flutter;
        d[o + PHASE] = Math.random() * Math.PI * 2;
        d[o + CARRY] = carry;

        d[o + SPRITE] = this.sprites ? Math.max(0, Math.min(this.sprites - 1, Math.floor(sprite))) : 0;

        d[o + FLOATS] = floats && this.water ? 1 : 0;
        d[o + WATER_Y] = 0;
        d[o + FLOW_X] = d[o + FLOW_Z] = d[o + FLOW_T] = 0;

        return true;

    }


    // Ruch, kolizje i przepisanie do InstancedMesh. world - do odbijania
    // się od bloków (może być null).

    update(dt, world) {

        const d = this.data;

        let i = 0;


        while (i < this.count) {

            const o = i * STRIDE;

            d[o + AGE] += dt;


            // Koniec życia: na to miejsce ostatnia cząsteczka.

            if (d[o + AGE] >= d[o + LIFE]) {

                this.count--;

                if (i < this.count) {
                    d.copyWithin(o, this.count * STRIDE, (this.count + 1) * STRIDE);
                }

                continue;

            }


            if (!d[o + RESTING]) {

                d[o + VY] += (d[o + LIFT] - d[o + GRAVITY]) * dt;

                const slow = Math.exp(-d[o + DRAG] * dt);

                d[o + VX] *= slow;
                d[o + VY] *= slow;
                d[o + VZ] *= slow;

                d[o + PX] += d[o + VX] * dt;
                d[o + PY] += d[o + VY] * dt;
                d[o + PZ] += d[o + VZ] * dt;

                // Liść: kołysze się na boki i płynie z wiatrem.

                if (d[o + FLUTTER] > 0 || d[o + CARRY] > 0) {

                    const age = d[o + AGE], phase = d[o + PHASE], flutter = d[o + FLUTTER];

                    d[o + PX] += (Math.cos(age * 2.3 + phase) * flutter + this.wind.x * d[o + CARRY]) * dt;
                    d[o + PZ] += (Math.sin(age * 1.7 + phase * 1.3) * flutter + this.wind.z * d[o + CARRY]) * dt;
                    // Na przemian trochę wolniej i szybciej - jak płatek.
                    d[o + PY] += Math.sin(age * 4.6 + phase) * flutter * 0.25 * dt;

                }

                d[o + RX] += d[o + SX] * dt;
                d[o + RY] += d[o + SY] * dt;
                d[o + RZ] += d[o + SZ] * dt;


                if (d[o + COLLIDE] && world && d[o + VY] < 0) {
                    this.collide(o, world);
                }

            }
            else if (d[o + RESTING] === ON_WATER) {

                this.drift(o, dt, world);

            }

            i++;

        }


        this.write();

    }


    // Spadająca cząsteczka trafiła w blok: odbija się słabiej i słabiej,
    // aż leży na nim.

    collide(o, world) {

        const d = this.data;

        const half = this.currentSize(o) * this.flat / 2;

        const bottom = d[o + PY] - half;

        const bx = Math.floor(d[o + PX]);
        const by = Math.floor(bottom);
        const bz = Math.floor(d[o + PZ]);

        // Liść trafił w wodę: kładzie się na tafli i pływa (FloatingLeaves.js).
        // W spadającej wodzie (wodospad) leci w dół razem z nią.

        if (d[o + FLOATS]) {

            const kind = this.water.probe(world, d[o + PX], d[o + PZ], by, this.probe);

            if (kind === 1 && bottom <= this.probe.top) {
                this.startFloating(o, by);
                return;
            }

            if (kind === 2) {
                this.intoWaterfall(o);
                return;
            }

        }

        if (!world.isSolid(bx, by, bz)) {
            return;
        }

        d[o + PY] = by + 1 + half;

        d[o + VY] *= -0.3;
        d[o + VX] *= 0.5;
        d[o + VZ] *= 0.5;

        d[o + SX] *= 0.4;
        d[o + SY] *= 0.4;
        d[o + SZ] *= 0.4;


        if (Math.abs(d[o + VY]) < 1.2) {

            d[o + RESTING] = ON_GROUND;

            d[o + VX] = d[o + VY] = d[o + VZ] = 0;

            // Leży płasko (obrót tylko wokół osi pionowej).
            d[o + RX] = 0;
            d[o + RZ] = 0;

        }

    }


    // Liść kładzie się płasko na tafli w bloku wody "by" i od tej chwili
    // pływa jeszcze przez chwilę (czas życia liczony od nowa).

    startFloating(o, by) {

        const d = this.data;

        d[o + RESTING] = ON_WATER;
        d[o + WATER_Y] = by;
        d[o + PY] = this.probe.top;

        d[o + VY] = 0;
        d[o + VX] *= 0.3;
        d[o + VZ] *= 0.3;

        d[o + RX] = 0;
        d[o + RZ] = 0;
        d[o + SX] = 0;
        d[o + SZ] = 0;
        d[o + SY] = (Math.random() * 2 - 1) * 0.5;

        d[o + FLOW_T] = 0;
        d[o + LIFE] = d[o + AGE] + this.water.floatSeconds();

    }


    // Z tafli w spadającą wodę: leci w dół szybko, jak woda (bez kołysania).

    intoWaterfall(o) {

        const d = this.data;

        d[o + RESTING] = 0;
        d[o + GRAVITY] = Math.max(d[o + GRAVITY], 9);
        d[o + DRAG] = Math.min(d[o + DRAG], 0.6);
        d[o + FLUTTER] = 0;
        d[o + CARRY] = 0;
        d[o + VY] = Math.min(d[o + VY], -0.5);
        d[o + SX] = (Math.random() * 2 - 1) * 4;
        d[o + SZ] = (Math.random() * 2 - 1) * 4;

    }


    // Pływanie: z nurtem (albo powoli krąży na stojącej wodzie), unosi się
    // z falami, zatrzymuje przy brzegu, z krawędzi spada wodospadem.

    drift(o, dt, world) {

        const d = this.data;
        const water = this.water;
        const by = d[o + WATER_Y];

        // Nurt co ok. 0,3 s (getWaterFlow czyta kilka bloków).

        d[o + FLOW_T] -= dt;

        if (d[o + FLOW_T] <= 0) {

            const flow = water.flow(world, d[o + PX], by, d[o + PZ]);

            d[o + FLOW_X] = flow ? flow[0] : 0;
            d[o + FLOW_Z] = flow ? flow[1] : 0;
            d[o + FLOW_T] = 0.25 + Math.random() * 0.1;

        }

        const age = d[o + AGE], phase = d[o + PHASE];
        const still = Math.hypot(d[o + FLOW_X], d[o + FLOW_Z]) < 0.05;
        const wander = still ? water.wander : water.wander / 3;

        let tx = d[o + FLOW_X] * water.drift + this.wind.x * water.wind + Math.cos(age * 0.37 + phase) * wander;
        let tz = d[o + FLOW_Z] * water.drift + this.wind.z * water.wind + Math.sin(age * 0.29 + phase * 1.7) * wander;

        // Pod spadającą wodą: woda odpycha liść od środka kolumny.
        if (this.probe.underFall) {
            const ox = d[o + PX] - Math.floor(d[o + PX]) - 0.5, oz = d[o + PZ] - Math.floor(d[o + PZ]) - 0.5;
            const length = Math.hypot(ox, oz) || 1;
            tx += ox / length * water.push;
            tz += oz / length * water.push;
        }

        // Na stojącej wodzie liść długo niesie rozpęd (np. spod wodospadu).
        const follow = Math.min(1, dt * (still && !this.probe.underFall ? 0.5 : 1.5));

        d[o + VX] += (tx - d[o + VX]) * follow;
        d[o + VZ] += (tz - d[o + VZ]) * follow;


        // Ruch osobno w x i z: na brzegu (blok albo sucho) liść staje,
        // a gdy dalej jest spadająca woda albo pusto pod spodem - spada.

        for (let axis = 0; axis < 2; axis++) {

            const P = axis ? PZ : PX, V = axis ? VZ : VX;
            const next = d[o + P] + d[o + V] * dt;

            if (Math.floor(next) !== Math.floor(d[o + P])) {

                const x = axis ? d[o + PX] : next, z = axis ? next : d[o + PZ];
                const kind = water.probe(world, x, z, by, this.probe);

                if (kind === 0) {

                    // Pusto (krawędź bez wody) - spada; blok albo brzeg - staje.
                    const bx = Math.floor(x), bz = Math.floor(z);

                    if (world.isSolid(bx, by, bz) || world.isSolid(bx, by - 1, bz) || !world.getBlockId) {
                        d[o + V] = 0;
                        continue;
                    }

                    d[o + P] = next;
                    this.intoWaterfall(o);
                    return;

                }

                if (kind === 2) {
                    d[o + P] = next;
                    this.intoWaterfall(o);
                    return;
                }

            }

            d[o + P] = next;

        }


        // Wysokość tafli (z falą); woda zniknęła - liść opada dalej.

        const kind = water.probe(world, d[o + PX], d[o + PZ], by, this.probe);

        if (kind !== 1) {
            d[o + RESTING] = 0;
            d[o + VY] = -0.2;
            return;
        }

        if (this.probe.deeper) {
            d[o + WATER_Y] = by + 1;
        }

        // Pod koniec liść nasiąka i powoli schodzi pod wodę.
        const left = d[o + LIFE] - age;
        const sink = left < 2 ? (2 - left) * 0.03 : 0;

        d[o + PY] = this.probe.top - sink;

        // Kręci się powoli i kiwa z falami.
        d[o + RY] += d[o + SY] * dt;
        d[o + RX] = Math.sin(age * 1.3 + phase) * 0.06;
        d[o + RZ] = Math.cos(age * 1.1 + phase) * 0.06;

    }


    currentSize(o) {

        const d = this.data;

        const t = d[o + AGE] / d[o + LIFE];

        let size = d[o + SIZE] + (d[o + SIZE_END] - d[o + SIZE]) * t;

        const fade = d[o + FADE];

        if (fade > 0 && t > 1 - fade) {
            size *= (1 - t) / fade;
        }

        return size;

    }


    write() {

        const d = this.data;
        const mesh = this.mesh;


        for (let i = 0; i < this.count; i++) {

            const o = i * STRIDE;

            const t = d[o + AGE] / d[o + LIFE];

            const size = Math.max(0.0001, this.currentSize(o));


            this.position.set(d[o + PX], d[o + PY], d[o + PZ]);

            this.euler.set(d[o + RX], d[o + RY], d[o + RZ]);

            this.quaternion.setFromEuler(this.euler);

            this.scale.set(size, size * this.flat, size);

            this.matrix.compose(this.position, this.quaternion, this.scale);

            mesh.setMatrixAt(i, this.matrix);


            // Kolor: start -> middle -> end.

            let a, b, k;

            if (t < MIDDLE) {
                a = C0; b = C1; k = t / MIDDLE;
            }
            else {
                a = C1; b = C2; k = (t - MIDDLE) / (1 - MIDDLE);
            }

            this.color.setRGB(
                d[o + a] + (d[o + b] - d[o + a]) * k,
                d[o + a + 1] + (d[o + b + 1] - d[o + a + 1]) * k,
                d[o + a + 2] + (d[o + b + 2] - d[o + a + 2]) * k
            );

            mesh.setColorAt(i, this.color);

            if (this.sprites) mesh.geometry.getAttribute('particleSprite').setX(i, d[o + SPRITE]);

            if (this.surfaceLighting) {
                mesh.geometry.getAttribute('particleLight').setXYZW(i,
                    d[o + LIGHT_RED], d[o + LIGHT_GREEN], d[o + LIGHT_BLUE], d[o + LIGHT_SKY]);
                mesh.geometry.getAttribute('particleEmission').setXY(i, d[o + EMISSION], d[o + CLASSIC_SHADE]);
            }

        }


        mesh.count = this.count;

        if (this.count > 0) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
            if (this.sprites) mesh.geometry.getAttribute('particleSprite').needsUpdate = true;
            if (this.surfaceLighting) {
                mesh.geometry.getAttribute('particleLight').needsUpdate = true;
                mesh.geometry.getAttribute('particleEmission').needsUpdate = true;
            }
        }

    }


    clear() {

        this.count = 0;

        this.mesh.count = 0;

    }


    dispose() {

        this.mesh.removeFromParent();

        this.mesh.geometry.dispose();
        this.mesh.material.map?.dispose();
        this.mesh.material.dispose();

    }

}
