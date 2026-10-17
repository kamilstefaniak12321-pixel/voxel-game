import * as THREE from 'three';

// ------------------------------------------------------------
// WARSTWA: DROGA MLECZNA I ODLEGŁE GALAKTYKI
//
// Widoczne tylko w ciemne noce - najlepiej w nowiu; w pełni
// księżyc je zagłusza (state.galaxyVisibility, SkyColors.js).
// Obracają się razem z gwiazdami.
//
// Wszystko jest liczone w shaderze na kuli wokół kamery:
//   - pas Drogi Mlecznej: jasny pas po wielkim okręgu nieba,
//     grubszy i cieplejszy przy jądrze galaktyki, z obłokami
//     i ciemnymi pasmami pyłu (szum),
//   - kilka małych, rozmytych galaktyk (jak Andromeda).
// ------------------------------------------------------------

const DISTANCE = 97;


// Wektor jako tekst GLSL.

function glsl(vector) {

    const v = vector.clone().normalize();

    return `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;

}


// Oś pasa Drogi Mlecznej (prostopadła do pasa) i kierunek do jądra
// (leży w pasie). Kierunki są w układzie gwiazd (obracanym).

const BAND_AXIS = new THREE.Vector3(0.35, 0.55, -0.76).normalize();

const CORE = new THREE.Vector3(1, 0, 0)
    .addScaledVector(BAND_AXIS, -BAND_AXIS.x)
    .normalize();


// Odległe galaktyki: kierunek, rozmiar (długość, szerokość)
// i jasność.

const GALAXIES = [
    { direction: new THREE.Vector3(-0.4, 0.75, 0.52), size: [0.05, 0.016], brightness: 1.0 },
    { direction: new THREE.Vector3(0.62, 0.55, 0.56), size: [0.026, 0.02], brightness: 0.6 },
    { direction: new THREE.Vector3(-0.8, 0.3, -0.52), size: [0.03, 0.009], brightness: 0.5 }
];


function galaxyCode() {

    return GALAXIES.map((galaxy) => {

        const center = galaxy.direction.clone().normalize();

        // Dłuższa oś elipsy - dowolny kierunek prostopadły do środka.

        const major = new THREE.Vector3(0.3, 1, 0.2)
            .addScaledVector(center, -new THREE.Vector3(0.3, 1, 0.2).dot(center))
            .normalize();

        const minor = new THREE.Vector3().crossVectors(center, major);

        return `color += galaxy(direction, ${glsl(center)}, ${glsl(major)}, ${glsl(minor)}, ` +
            `vec2(${galaxy.size[0]}, ${galaxy.size[1]})) * ${galaxy.brightness.toFixed(2)};`;

    }).join('\n');

}


export class Galaxies {

    constructor() {

        this.material = new THREE.ShaderMaterial({

            uniforms: {
                uVisibility: { value: 0 },
                uSpace: { value: 0 }
            },

            vertexShader: /* glsl */ `
                varying vec3 vLocal;
                varying vec3 vWorld;

                void main() {
                    vLocal = position;
                    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,

            fragmentShader: /* glsl */ `
                uniform float uVisibility;
                uniform float uSpace;

                varying vec3 vLocal;
                varying vec3 vWorld;

                // Szum wartości 3D i jego kilka warstw (fbm).

                float hash(vec3 p) {
                    p = fract(p * 0.3183099 + 0.1);
                    p *= 17.0;
                    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
                }

                float noise(vec3 x) {
                    vec3 i = floor(x);
                    vec3 f = fract(x);
                    f = f * f * (3.0 - 2.0 * f);
                    return mix(
                        mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x),
                            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
                        f.z);
                }

                float fbm(vec3 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for (int i = 0; i < 5; i++) {
                        value += amplitude * noise(p);
                        p *= 2.03;
                        amplitude *= 0.5;
                    }
                    return value;
                }

                // Mała galaktyka: jasne jądro i rozmyta elipsa.

                vec3 galaxy(vec3 direction, vec3 center, vec3 major, vec3 minor, vec2 size) {

                    if (dot(direction, center) < 0.9) return vec3(0.0);

                    vec3 offset = direction - center;

                    vec2 p = vec2(dot(offset, major) / size.x, dot(offset, minor) / size.y);

                    float r2 = dot(p, p);

                    float glow = exp(-r2 * 3.0) * 0.5 + exp(-r2 * 40.0) * 1.2;

                    return vec3(0.95, 0.9, 1.0) * glow;

                }

                void main() {

                    vec3 direction = normalize(vLocal);

                    // Odległość od środka pasa i bliskość jądra.

                    float latitude = dot(direction, ${glsl(BAND_AXIS)});

                    float core = max(dot(direction, ${glsl(CORE)}), 0.0);

                    float width = 0.15 + 0.12 * core * core;

                    float band = exp(-latitude * latitude / (width * width));


                    // Obłoki gwiazd i drobne ziarno.

                    float clouds = fbm(direction * 4.0);
                    float grain = fbm(direction * 16.0);

                    float brightness =
                        band * (0.3 + 0.7 * clouds) * (0.65 + 0.35 * grain) *
                        (0.55 + 1.1 * pow(core, 3.0));


                    // Ciemne pasma pyłu wzdłuż środka pasa.

                    float wobble = (fbm(direction * 6.0) - 0.5) * 0.05;

                    float laneWidth = 0.03 + 0.03 * core;

                    float lane = exp(-pow((latitude + wobble) / laneWidth, 2.0));

                    float dust = lane * smoothstep(0.35, 0.65, fbm(direction * 9.0 + 3.0));

                    brightness *= 1.0 - 0.8 * dust;


                    // Kolor: chłodny pas, cieplejsze jądro.

                    vec3 color = mix(vec3(0.55, 0.62, 0.9), vec3(1.0, 0.85, 0.66), core * core) * brightness;

                    ${galaxyCode()}


                    // Przy horyzoncie gaśnie (gruba warstwa powietrza).

                    float aboveHorizon = mix(smoothstep(0.0, 0.4, normalize(vWorld).y), 1.0, uSpace);

                    gl_FragColor = vec4(color * uVisibility * aboveHorizon * 0.14, 1.0);

                    #include <colorspace_fragment>

                }
            `,

            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false

        });


        this.object = new THREE.Mesh(
            new THREE.SphereGeometry(DISTANCE, 64, 32),
            this.material
        );

        this.object.renderOrder = 2.5;
        this.object.frustumCulled = false;

        this.enabled = true;

    }


    update(state, celestial) {

        this.object.quaternion.copy(celestial.starRotation);

        this.material.uniforms.uVisibility.value = state.galaxyVisibility;
        this.material.uniforms.uSpace.value = state.space;

        // W trybie ziemniaka (enabled = false) Drogi Mlecznej nie ma -
        // jej shader jest najdroższą częścią nocnego nieba.

        this.object.visible = this.enabled && state.galaxyVisibility > 0.002;

    }


    dispose() {

        this.object.geometry.dispose();
        this.material.dispose();

    }

}
