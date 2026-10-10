import * as THREE from 'three';

// ------------------------------------------------------------
// WARSTWA: SŁOŃCE
//
// Kwadrat zawsze zwrócony do kamery, na nim okrągła tarcza
// z poświatą. Kolor tarczy zmienia się z wysokością słońca
// (biała w dzień, pomarańczowa przy horyzoncie - SkyColors.js).
// Pod horyzontem tarcza jest ucinana, więc słońce "zachodzi".
// ------------------------------------------------------------

// Średnica tarczy słońca w stopniach (prawdziwe słońce ma ~0.5°,
// w grze jest większe, żeby dobrze je było widać).

const SUN_DIAMETER = 7;

// Ile razy większy od tarczy jest kwadrat z poświatą.

const GLOW_SCALE = 4;

// Odległość od kamery (za księżycem, przed gwiazdami - więc księżyc
// może zasłonić słońce).

const DISTANCE = 94;


export class Sun {

    constructor() {

        this.material = new THREE.ShaderMaterial({

            uniforms: {
                uColor: { value: new THREE.Color() }
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

                varying vec2 vUv;
                varying vec3 vWorld;

                void main() {

                    // r = 1 na brzegu tarczy.

                    float r = length(vUv * 2.0 - 1.0) * ${GLOW_SCALE.toFixed(1)};

                    float disc = 1.0 - smoothstep(0.92, 1.0, r);

                    float glow = exp(-max(r - 1.0, 0.0) * 1.8) * 0.45 * (1.0 - smoothstep(1.0, ${GLOW_SCALE.toFixed(1)}, r));

                    // Część pod horyzontem jest schowana.

                    float aboveHorizon = smoothstep(-0.003, 0.003, normalize(vWorld).y);

                    gl_FragColor = vec4(uColor * (disc * 1.6 + glow) * aboveHorizon, 1.0);

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


        // Głęboko pod horyzontem nie ma czego rysować.

        this.object.visible = celestial.sunHeight > -0.1;

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}
