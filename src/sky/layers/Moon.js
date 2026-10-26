import * as THREE from 'three';

import { MOON_DIAMETER } from '../../config.js';

import { atlasReady, loadPackImage } from '../../rendering/TextureAtlas.js';

// ------------------------------------------------------------
// WARSTWA: KSIĘŻYC
//
// Tekstura assets/textures/sky/moon.png (można ją podmienić - ważne,
// żeby poza tarczą była przezroczysta) oświetlona z kierunku słońca
// jak kula. Dzięki temu fazy (sierp, kwadra, pełnia) i to, z której
// strony świeci tarcza, wychodzą same z położenia słońca i księżyca.
// Granica światła i cienia idzie po pikselach tekstury, żeby pasowała
// do pikselowego stylu gry.
//
// Księżyc jest rysowany przed słońcem i gwiazdami i zasłania to,
// co jest za nim (np. gwiazdy - także ciemną częścią tarczy).
// ------------------------------------------------------------

// Średnica tarczy: MOON_DIAMETER w config.js.

const DISTANCE = 90;

// Słaba poświata ciemnej części tarczy w nocy (światło odbite od
// Ziemi). W dzień ciemnej części nie widać wcale.

const EARTHSHINE = 0.04;



const _axisX = new THREE.Vector3();
const _axisY = new THREE.Vector3();
const _axisZ = new THREE.Vector3();


export class Moon {

    constructor() {

        const texture =
            new THREE.TextureLoader().load('./assets/textures/sky/moon.png');

        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;


        // Księżyc z paczki tekstur (niebo/ksiezyc.png) - zamiast
        // oryginalnego; uTextureSize - jego rozdzielczość (piksele tarczy).

        atlasReady.then(async ({ extras }) => {

            if (!extras?.moon) {
                return;
            }

            try {

                const image = await loadPackImage(extras.moon);

                texture.image = image;
                texture.needsUpdate = true;

                this.material.uniforms.uTextureSize.value = image.width;

            }
            catch (error) {
                console.warn('Paczka tekstur - księżyc:', error);
            }

        }, () => {});


        this.material = new THREE.ShaderMaterial({

            uniforms: {
                uMap: { value: texture },
                uTextureSize: { value: 32 },
                uLight: { value: new THREE.Vector3() },
                uColor: { value: new THREE.Color() },
                uBrightness: { value: 1 },
                uEarthshine: { value: EARTHSHINE },
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
                uniform sampler2D uMap;
                uniform float uTextureSize;
                uniform vec3 uLight;
                uniform vec3 uColor;
                uniform float uBrightness;
                uniform float uEarthshine;
                uniform float uHorizonDip;

                varying vec2 vUv;
                varying vec3 vWorld;

                void main() {

                    vec4 texel = texture2D(uMap, vUv);

                    if (texel.a < 0.5) discard;


                    // Środek piksela tekstury -> punkt na półkuli
                    // zwróconej do nas -> czy oświetla go słońce.

                    vec2 cell = (floor(vUv * uTextureSize) + 0.5) / uTextureSize;

                    vec2 p = cell * 2.0 - 1.0;

                    vec3 normal = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));

                    float lit = step(0.0, dot(normal, uLight));


                    float aboveHorizon = smoothstep(uHorizonDip - 0.003, uHorizonDip + 0.003, normalize(vWorld).y);

                    vec3 color = texel.rgb * uColor * (lit + uEarthshine) * uBrightness * aboveHorizon;

                    gl_FragColor = vec4(color, 1.0);

                    #include <colorspace_fragment>

                }
            `,

            blending: THREE.AdditiveBlending

        });


        this.object = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            this.material
        );

        this.object.scale.setScalar(
            2 * DISTANCE * Math.tan(MOON_DIAMETER / 2 * Math.PI / 180)
        );

        this.object.renderOrder = 1;
        this.object.frustumCulled = false;

    }


    update(state, celestial) {

        const moon = this.object;

        moon.position
            .copy(celestial.moonDirection)
            .multiplyScalar(DISTANCE);

        moon.lookAt(0, 0, 0);

        moon.updateMatrixWorld();


        // Kierunek do słońca w układzie tarczy
        // (x - w prawo, y - w górę, z - do nas).

        moon.matrixWorld.extractBasis(_axisX, _axisY, _axisZ);

        const sun = celestial.sunDirection;

        this.material.uniforms.uLight.value.set(
            sun.dot(_axisX.normalize()),
            sun.dot(_axisY.normalize()),
            sun.dot(_axisZ.normalize())
        );


        this.material.uniforms.uBrightness.value = state.moonBrightness;

        this.material.uniforms.uHorizonDip.value = state.horizonDip;

        // Kolor księżyca (SkyColors.js, może go zmienić wariant nieba).

        this.material.uniforms.uColor.value.copy(state.moonColor);

        // Światło odbite od Ziemi widać nocą - i w czasie zaćmienia,
        // gdy przed słońcem jest ciemna strona księżyca.

        this.material.uniforms.uEarthshine.value =
            EARTHSHINE * Math.max(1 - state.daylight, state.eclipseDarkness);

        moon.visible = celestial.moonHeight > -0.1 || state.space > 0.001;

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.uniforms.uMap.value.dispose();
        this.material.dispose();

    }

}
