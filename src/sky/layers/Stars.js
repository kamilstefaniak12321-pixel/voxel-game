import * as THREE from 'three';

import {
    STAR_COUNT
} from '../../config.js';

// ------------------------------------------------------------
// WARSTWA: GWIAZDY
//
// Punkty rozsiane po kuli wokół kamery. Każda gwiazda ma własną
// jasność, kolor (od niebieskawych po pomarańczowe) i rytm
// migotania. Cała kula obraca się razem z niebem (Celestial.js),
// więc gwiazdy wschodzą i zachodzą jak słońce.
//
// Gwiazdy są zawsze te same (stały seed), niezależnie od świata.
// ------------------------------------------------------------

const DISTANCE = 96;

const STAR_SEED = 20261010;

// Kolory gwiazd i jak często występują.

const STAR_COLORS = [
    { color: new THREE.Color('#ffffff'), weight: 5 },
    { color: new THREE.Color('#cad8ff'), weight: 3 },
    { color: new THREE.Color('#fff1d0'), weight: 3 },
    { color: new THREE.Color('#ffd2a8'), weight: 1 }
];


// Prosty generator liczb losowych z seedem.

function createRandom(seed) {

    let state = seed >>> 0;

    return () => {

        state = (state + 0x6D2B79F5) >>> 0;

        let t = state;

        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;

    };

}


export class Stars {

    constructor() {

        const random = createRandom(STAR_SEED);

        const positions = new Float32Array(STAR_COUNT * 3);
        const colors = new Float32Array(STAR_COUNT * 3);
        const sizes = new Float32Array(STAR_COUNT);
        const phases = new Float32Array(STAR_COUNT);

        const totalWeight = STAR_COLORS.reduce((sum, c) => sum + c.weight, 0);


        for (let i = 0; i < STAR_COUNT; i++) {

            // Równomiernie po kuli.

            const z = random() * 2 - 1;
            const angle = random() * Math.PI * 2;
            const r = Math.sqrt(1 - z * z);

            positions[i * 3] = r * Math.cos(angle) * DISTANCE;
            positions[i * 3 + 1] = r * Math.sin(angle) * DISTANCE;
            positions[i * 3 + 2] = z * DISTANCE;


            // Dużo słabych gwiazd, mało jasnych.

            const brightness = random() ** 4;

            sizes[i] = 1.2 + brightness * 2.6;


            let pick = random() * totalWeight;

            let starColor = STAR_COLORS[0].color;

            for (const entry of STAR_COLORS) {

                pick -= entry.weight;

                if (pick <= 0) {
                    starColor = entry.color;
                    break;
                }

            }

            const light = 0.35 + 0.65 * brightness;

            colors[i * 3] = starColor.r * light;
            colors[i * 3 + 1] = starColor.g * light;
            colors[i * 3 + 2] = starColor.b * light;


            phases[i] = random() * 10;

        }


        const geometry = new THREE.BufferGeometry();

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));


        this.material = new THREE.ShaderMaterial({

            uniforms: {
                uVisibility: { value: 0 },
                uTime: { value: 0 },
                uPixelRatio: { value: 1 }
            },

            vertexShader: /* glsl */ `
                attribute vec3 aColor;
                attribute float aSize;
                attribute float aPhase;

                uniform float uVisibility;
                uniform float uTime;
                uniform float uPixelRatio;

                varying vec3 vColor;

                void main() {

                    vec4 world = modelMatrix * vec4(position, 1.0);

                    // Przy horyzoncie gwiazdy gasną (gruba warstwa powietrza).

                    float height = normalize(world.xyz).y;

                    float aboveHorizon = smoothstep(-0.02, 0.2, height);

                    float twinkle = 0.75 + 0.25 * sin(uTime * (1.3 + aPhase * 0.3) + aPhase * 40.0);

                    vColor = aColor * uVisibility * aboveHorizon * twinkle;

                    gl_PointSize = aSize * uPixelRatio;

                    gl_Position = projectionMatrix * viewMatrix * world;

                }
            `,

            fragmentShader: /* glsl */ `
                varying vec3 vColor;

                void main() {

                    float d = length(gl_PointCoord - 0.5) * 2.0;

                    float shape = 1.0 - smoothstep(0.35, 1.0, d);

                    gl_FragColor = vec4(vColor * shape, 1.0);

                    #include <colorspace_fragment>

                }
            `,

            blending: THREE.AdditiveBlending,
            depthWrite: false

        });


        this.object = new THREE.Points(geometry, this.material);

        this.object.renderOrder = 3;
        this.object.frustumCulled = false;

        this.time = 0;

    }


    update(state, celestial, dt, pixelRatio) {

        this.time += dt;

        this.object.quaternion.copy(celestial.starRotation);


        const uniforms = this.material.uniforms;

        uniforms.uVisibility.value = state.starVisibility;
        uniforms.uTime.value = this.time;
        uniforms.uPixelRatio.value = pixelRatio;


        this.object.visible = state.starVisibility > 0.001;

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}
