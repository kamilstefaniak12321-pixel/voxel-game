import * as THREE from 'three';

import { SUN_DIAMETER } from '../../config.js';

// ------------------------------------------------------------
// WARSTWA: SŁOŃCE
//
// Kwadrat zawsze zwrócony do kamery, na nim okrągła tarcza
// z poświatą. Kolor tarczy zmienia się z wysokością słońca
// (biała w dzień, pomarańczowa przy horyzoncie - SkyColors.js).
// Pod horyzontem tarcza jest ucinana, więc słońce "zachodzi".
// ------------------------------------------------------------

// Średnica tarczy słońca: SUN_DIAMETER w config.js.
//
// W czasie zaćmienia poświata słabnie razem z zasłoniętą częścią
// tarczy, a przy pełnym zaćmieniu pojawia się KORONA - perłowa
// poświata z promieniami wokół czarnej tarczy księżyca.

const CORONA_COLOR = new THREE.Color('#dfe8ff');

// Ile razy większy od tarczy jest kwadrat z poświatą.

const GLOW_SCALE = 4;

// Odległość od kamery (za księżycem, przed gwiazdami - więc księżyc
// może zasłonić słońce).

const DISTANCE = 94;


export class Sun {

    constructor() {

        this.material = new THREE.ShaderMaterial({

            uniforms: {
                uColor: { value: new THREE.Color() },
                uGlow: { value: 1 },
                uCorona: { value: 0 },
                uCoronaColor: { value: CORONA_COLOR },
                uHorizonDip: { value: 0 }
            },

            vertexShader: /* glsl */ `
                varying vec2 vUv;
                varying vec3 vWorld;

                void main() {
                    vUv = uv;
                    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,

            fragmentShader: /* glsl */ `
                uniform vec3 uColor;
                uniform float uGlow;
                uniform float uCorona;
                uniform vec3 uCoronaColor;
                uniform float uHorizonDip;

                varying vec2 vUv;
                varying vec3 vWorld;

                void main() {

                    // r = 1 na brzegu tarczy.

                    vec2 p = vUv * 2.0 - 1.0;

                    float r = length(p) * ${GLOW_SCALE.toFixed(1)};

                    float disc = 1.0 - smoothstep(0.92, 1.0, r);

                    float outside = 1.0 - smoothstep(1.0, ${GLOW_SCALE.toFixed(1)}, r);

                    float glow = exp(-max(r - 1.0, 0.0) * 1.8) * 0.45 * outside * uGlow;


                    // Korona: im dalej od tarczy, tym słabsza, a wzdłuż
                    // kilku "promieni" sięga dalej.

                    float angle = atan(p.y, p.x);

                    float rays = 0.5 + 0.5 * sin(angle * 5.0 + 0.7) * sin(angle * 3.0 + 2.1);

                    float corona = uCorona * exp(-max(r - 1.0, 0.0) * (3.2 - 2.0 * rays)) * outside;


                    // Część pod horyzontem jest schowana (z dalekim terenem
                    // i z wysoka - pod jego brzegiem, patrz Sky.horizonDip).

                    float aboveHorizon = smoothstep(uHorizonDip - 0.003, uHorizonDip + 0.003, normalize(vWorld).y);

                    vec3 color = uColor * (disc * 1.6 + glow) + uCoronaColor * corona * 0.9;

                    gl_FragColor = vec4(color * aboveHorizon, 1.0);

                    #include <colorspace_fragment>

                }
            `,

            blending: THREE.AdditiveBlending,
            depthWrite: false

        });


        this.object = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            this.material
        );

        const size =
            2 * DISTANCE * Math.tan(SUN_DIAMETER / 2 * Math.PI / 180) * GLOW_SCALE;

        this.object.scale.setScalar(size);

        this.object.renderOrder = 2;
        this.object.frustumCulled = false;

    }


    update(state, celestial) {

        this.object.position
            .copy(celestial.sunDirection)
            .multiplyScalar(DISTANCE);

        this.object.lookAt(0, 0, 0);


        this.material.uniforms.uColor.value.copy(state.sunDiscColor);

        this.material.uniforms.uGlow.value = 1 - state.eclipse;

        this.material.uniforms.uHorizonDip.value = state.horizonDip;
        this.material.uniforms.uCorona.value = state.corona;


        // Głęboko pod horyzontem nie ma czego rysować.

        this.object.visible = celestial.sunHeight > -0.1 || state.space > 0.001;

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}
