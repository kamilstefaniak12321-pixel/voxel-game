import * as THREE from 'three';

import { skyUniforms } from '../sky/skyShader.js';

import { viewUniforms, VIEW_GLSL } from './viewUniforms.js';

import { meteorLightUniforms, METEOR_LIGHT_GLSL } from './meteorLight.js';

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

const STRIDE = 32;

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

function createSolidMaterial() {

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

                outgoingLight += diffuseColor.rgb * meteorLight(vParticleWorld, vParticleNormal);

                outgoingLight = applyBrightness(outgoingLight, diffuseColor.rgb);

                #include <opaque_fragment>`
            );

    };

    return material;

}

// ------------------------------------------------------------

export class CubeParticles {

    // capacity - najwięcej cząsteczek naraz (nowe ponad limit są pomijane)

    constructor(scene, { capacity = 2000, glowing = false } = {}) {

        this.capacity = capacity;

        this.data = new Float32Array(capacity * STRIDE);

        this.count = 0;


        const geometry = createCubeGeometry(glowing ? GLOW_SHADE : SOLID_SHADE);

        const material = glowing
            ? new THREE.MeshBasicMaterial({ vertexColors: true, fog: false })
            : createSolidMaterial();

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
        collide = false
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

                d[o + RX] += d[o + SX] * dt;
                d[o + RY] += d[o + SY] * dt;
                d[o + RZ] += d[o + SZ] * dt;


                if (d[o + COLLIDE] && world && d[o + VY] < 0) {
                    this.collide(o, world);
                }

            }

            i++;

        }


        this.write();

    }


    // Spadająca cząsteczka trafiła w blok: odbija się słabiej i słabiej,
    // aż leży na nim.

    collide(o, world) {

        const d = this.data;

        const half = this.currentSize(o) / 2;

        const bottom = d[o + PY] - half;

        const bx = Math.floor(d[o + PX]);
        const by = Math.floor(bottom);
        const bz = Math.floor(d[o + PZ]);

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

            d[o + RESTING] = 1;

            d[o + VX] = d[o + VY] = d[o + VZ] = 0;

            // Leży płasko (obrót tylko wokół osi pionowej).
            d[o + RX] = 0;
            d[o + RZ] = 0;

        }

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

            this.scale.setScalar(size);

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

        }


        mesh.count = this.count;

        if (this.count > 0) {
            mesh.instanceMatrix.needsUpdate = true;
            mesh.instanceColor.needsUpdate = true;
        }

    }


    clear() {

        this.count = 0;

        this.mesh.count = 0;

    }


    dispose() {

        this.mesh.removeFromParent();

        this.mesh.geometry.dispose();
        this.mesh.material.dispose();

    }

}
