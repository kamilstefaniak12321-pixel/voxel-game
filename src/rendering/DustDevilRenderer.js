import * as THREE from 'three';

import { DEVILS } from '../weather/DustDevils.js';

// ------------------------------------------------------------
// WIRY PYŁOWE - RYSOWANIE (1.15.0)
//
// Losowanie i ruch wirów: weather/DustDevils.js. Tu każdy wir to kilkaset
// płowych kwadracików zwróconych do kamery, które kręcą się wokół osi
// i wznoszą po spirali: wąsko przy ziemi, szerzej u góry, z rozwianą
// "spódnicą" pyłu u podstawy. Słup pochyla się z wiatrem i lekko wije.
// Wszystko liczy karta graficzna (jedno polecenie rysowania na wszystkie
// wiry), procesor podaje tylko miejsce, wielkość i siłę każdego wiru.
// ------------------------------------------------------------

export const DEVIL_PARTICLES = Object.freeze({ each: 520, potatoEach: 170 });

export class DustDevilRenderer {

    constructor(scene) {

        this.scene = scene;
        this.disposed = false;
        this.count = 0;

        const max = DEVILS.max;
        const total = DEVIL_PARTICLES.each * max;
        const seeds = new Float32Array(total * 4);
        const index = new Float32Array(total);

        // Zawsze te same drobiny (prosty generator). Kolejność: drobina
        // k wiru 0, 1, 2, potem drobina k + 1 - mniejsza liczba drobin
        // (tryb ziemniaka, mniej wirów) to po prostu krótszy rysunek.
        let state = 0x4b1d7e33;

        for (let i = 0; i < seeds.length; i++) {
            state = (Math.imul(state, 1664525) + 1013904223) | 0;
            seeds[i] = (state >>> 0) / 4294967296;
        }

        for (let i = 0; i < total; i++) {
            index[i] = i % max;
        }

        this.geometry = new THREE.InstancedBufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
        this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
        this.geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
        this.geometry.setAttribute('aDevil', new THREE.InstancedBufferAttribute(index, 1));
        this.geometry.instanceCount = 0;

        this.uniforms = {
            // Miejsce podstawy (x, y, z) i siła (0-1; 0 - nie ma wiru).
            uDevil: { value: Array.from({ length: max }, () => new THREE.Vector4(0, 0, 0, 0)) },
            // x wysokość, y promień u podstawy, z faza, w - wolne.
            uDevilShape: { value: Array.from({ length: max }, () => new THREE.Vector4(12, 1, 0, 0)) },
            // xy - pochylenie z wiatrem (bloki w bok na blok wysokości), z - czas.
            uDevilWind: { value: new THREE.Vector3(0, 0, 0) },
            uDevilColor: { value: new THREE.Color(0.8, 0.62, 0.4) }
        };

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                attribute vec4 aSeed;
                attribute float aDevil;
                uniform vec4 uDevil[${max}];
                uniform vec4 uDevilShape[${max}];
                uniform vec3 uDevilWind;
                varying float vAlpha;

                void main() {

                    vec4 devil = uDevil[int(aDevil + 0.5)];
                    vec4 shape = uDevilShape[int(aDevil + 0.5)];
                    float time = uDevilWind.z;

                    // Co szósta drobina zostaje nisko - spódnica pyłu
                    // rozwiewana przy ziemi; reszta wznosi się po spirali:
                    // wąski lej przy ziemi, u góry szeroki i rozproszony.
                    // Co ósma to duży, blady kłąb - z daleka słup nie jest
                    // garścią kropek.
                    float low = step(aSeed.w, 0.16);
                    float puff = step(0.875, aSeed.z);
                    float rise = fract(aSeed.y + time * (0.1 + 0.16 * aSeed.w));
                    float up = mix(rise, rise * 0.1, low);
                    float radius = shape.y * mix(
                        (0.22 + 0.3 * rise + 0.95 * rise * rise * rise) * (0.8 + 0.4 * aSeed.z),
                        1.0 + 1.6 * rise, low);
                    float angle = aSeed.x * 6.2832 + shape.z + time * mix(6.5 - 3.4 * rise, 2.4, low) * (0.8 + 0.4 * aSeed.z);

                    vec3 p = devil.xyz + vec3(cos(angle) * radius, up * shape.x, sin(angle) * radius);

                    // Słup pochyla się z wiatrem i wije.
                    p.xz += uDevilWind.xy * up * shape.x
                        + vec2(sin(time * 0.9 + up * 4.0 + shape.z), cos(time * 0.7 + up * 3.0)) * 0.35 * shape.y * up;

                    // Kwadracik zwrócony do kamery.
                    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
                    vec3 upward = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
                    float size = mix(0.06 + 0.12 * aSeed.z, 0.5 + 0.5 * aSeed.x, puff) * (0.75 + 0.7 * rise) * (0.6 + 0.4 * shape.y);

                    p += (right * position.x + upward * position.y) * size;

                    vAlpha = devil.w * mix(0.5 + 0.35 * aSeed.x, 0.13, puff) * smoothstep(0.0, 0.05, rise) * (1.0 - smoothstep(0.72, 1.0, rise));

                    gl_Position = vAlpha > 0.004
                        ? projectionMatrix * viewMatrix * vec4(p, 1.0)
                        : vec4(2.0, 2.0, 2.0, 1.0);

                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uDevilColor;
                varying float vAlpha;

                void main() {

                    if (vAlpha <= 0.004) discard;

                    gl_FragColor = vec4(uDevilColor, vAlpha);

                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>

                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.name = 'Dust devils';
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 4;
        this.mesh.visible = false;

        scene.add(this.mesh);

    }


    // devils - wiry w zasięgu (DustDevils.list), groundAt(x, z) - wysokość
    // ziemi, wind - wiatr { x, z }, seconds - czas (s), sky - stan nieba
    // (barwa pyłu), potato - tryb ziemniaka (mniej drobin).

    update(devils, groundAt, wind, seconds, sky = null, potato = false) {

        if (this.disposed) return;

        const max = DEVILS.max;
        const place = this.uniforms.uDevil.value;
        const shape = this.uniforms.uDevilShape.value;

        let shown = 0;

        for (let i = 0; i < max; i++) {

            const devil = devils[i];

            if (!devil || devil.power <= 0.01) {
                place[i].w = 0;
                continue;
            }

            place[i].set(devil.x, groundAt(devil.x, devil.z), devil.z, devil.power);
            shape[i].set(devil.height * (0.55 + 0.45 * devil.power), devil.radius, devil.phase, 0);
            shown++;

        }

        this.count = shown;
        this.mesh.visible = shown > 0;

        if (!shown) {
            this.geometry.instanceCount = 0;
            return;
        }

        // Pochylenie: silniejszy wiatr mocniej kładzie słup (z umiarem).
        const lean = 0.035;

        this.uniforms.uDevilWind.value.set(
            Math.max(-0.3, Math.min(0.3, (wind?.x ?? 0) * lean)),
            Math.max(-0.3, Math.min(0.3, (wind?.z ?? 0) * lean)),
            seconds % 3600);

        if (sky?.dustColor) {
            this.uniforms.uDevilColor.value.copy(sky.dustColor).multiplyScalar(1.05);
        }

        this.geometry.instanceCount = (potato ? DEVIL_PARTICLES.potatoEach : DEVIL_PARTICLES.each) * max;

    }


    stats() {

        return { devils: this.count, particles: this.mesh.visible ? this.geometry.instanceCount : 0, draws: Number(this.mesh.visible) };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();

    }

}
