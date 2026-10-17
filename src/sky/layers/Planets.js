import * as THREE from 'three';

import { EAST, SUN_NOON, SKY_AXIS } from '../Celestial.js';

// ------------------------------------------------------------
// WARSTWA: PLANETY (tylko w kosmosie - patrz src/space/)
//
// Z ziemi ich nie widać - pojawiają się dopiero wysoko nad światem,
// gdy niebo robi się czarne (state.space). Każda planeta to kwadrat
// zwrócony do kamery, a na nim kula rysowana w shaderze, w pikselach
// tej samej wielkości co piksele księżyca:
//   - oświetlona prawie w pełni, z cieniem po stronie przeciwnej
//     słońcu (planety są dalej od słońca niż my),
//   - wzór powierzchni (pasy, plamy, czapa lodowa) liczony z punktu
//     na kuli, a Saturn ma pierścienie.
//
// Planety stoją wśród gwiazd blisko drogi słońca (ekliptyki) i obracają
// się razem z niebem. Nowa planeta = nowy wpis w PLANETS i nowy
// "kind" w shaderze (funkcja surface()).
// ------------------------------------------------------------

// Odległość od kamery: przed gwiazdami i słońcem, za księżycem
// (planeta może zasłonić słońce, księżyc - planetę).

const DISTANCE = 92;

// Wielkość piksela w stopniach (jak w teksturze księżyca: 8° / 32 px).

const PIXEL_DEGREES = 0.25;


// angle    - miejsce na drodze słońca (radiany; słońce "dogania"
//            planetę razem z obrotem nieba co kilkadziesiąt dni),
// latitude - ile stopni na północ/południe od tej drogi,
// size     - średnica kuli w stopniach,
// rings    - pierścienie (ile razy szersze niż kula),
// phase    - jak bardzo widać cień (0 = zawsze w pełni),
// kind     - wzór powierzchni w shaderze.

const PLANETS = [
    { name: 'Mars', angle: 2.3, latitude: 3, size: 2.5, rings: 0, phase: 0.8, kind: 0 },
    { name: 'Jowisz', angle: 3.45, latitude: -2, size: 4.5, rings: 0, phase: 0.5, kind: 1 },
    { name: 'Saturn', angle: 4.35, latitude: 1.5, size: 3.5, rings: 2.35, phase: 0.45, kind: 2 },
    { name: 'Neptun', angle: 5.45, latitude: -3.5, size: 2, rings: 0, phase: 0.4, kind: 3 }
];


const _axisX = new THREE.Vector3();
const _axisY = new THREE.Vector3();
const _axisZ = new THREE.Vector3();


const vertexShader = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;


const fragmentShader = /* glsl */ `
    uniform vec3 uLight;
    uniform float uVisibility;
    uniform float uExtent;
    uniform float uPixels;
    uniform float uRings;
    uniform int uKind;

    varying vec2 vUv;


    float hash(vec3 p) {

        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;

        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));

    }

    float valueNoise(vec3 p) {

        vec3 i = floor(p);
        vec3 f = fract(p);

        f = f * f * (3.0 - 2.0 * f);

        return mix(
            mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
            f.z
        );

    }


    // Kolor powierzchni w punkcie n kuli (n.y = oś planety).

    vec3 surface(vec3 n) {

        float lat = n.y;

        // Mars: rdzawy, ciemniejsze plamy, biała czapa na biegunie.

        if (uKind == 0) {

            float spots = valueNoise(n * 3.5) * 0.65 + valueNoise(n * 8.0) * 0.35;

            vec3 color = mix(vec3(0.78, 0.33, 0.14), vec3(0.45, 0.17, 0.08), smoothstep(0.45, 0.7, spots));

            return mix(color, vec3(0.95, 0.93, 0.9), smoothstep(0.8, 0.86, abs(lat + 0.08 * valueNoise(n * 6.0))));

        }

        // Jowisz: jasne i ciemne pasy, wielka czerwona plama.

        if (uKind == 1) {

            float wobble = valueNoise(n * vec3(2.0, 9.0, 2.0)) * 0.12;

            float band = sin((lat + wobble) * 16.0);

            vec3 cream = vec3(0.92, 0.86, 0.74);
            vec3 tanColor = vec3(0.78, 0.6, 0.42);
            vec3 brown = vec3(0.58, 0.4, 0.28);

            vec3 color = mix(cream, tanColor, smoothstep(-0.2, 0.4, band));

            color = mix(color, brown, smoothstep(0.75, 0.95, band) * 0.6);

            vec2 spot = (vec2(n.x, lat) - vec2(0.32, -0.36)) / vec2(0.2, 0.1);

            return mix(color, vec3(0.75, 0.33, 0.2), 1.0 - smoothstep(0.7, 1.0, length(spot)));

        }

        // Saturn: jasnożółty, delikatne pasy.

        if (uKind == 2) {

            float band = sin(lat * 13.0 + valueNoise(n * 4.0) * 0.8);

            return mix(vec3(0.93, 0.84, 0.6), vec3(0.8, 0.68, 0.45), smoothstep(0.2, 0.9, band) * 0.7);

        }

        // Neptun: głęboki błękit, jaśniejsze smugi, ciemna plama.

        float band = sin(lat * 10.0 + valueNoise(n * 5.0) * 1.5);

        vec3 color = mix(vec3(0.2, 0.36, 0.85), vec3(0.36, 0.55, 0.95), smoothstep(0.6, 1.0, band) * 0.6);

        vec2 spot = (vec2(n.x, lat) - vec2(-0.25, 0.3)) / vec2(0.16, 0.09);

        return mix(color, vec3(0.1, 0.17, 0.5), 1.0 - smoothstep(0.7, 1.0, length(spot)));

    }


    // Oświetlenie: miękki brzeg cienia, ciemna strona prawie czarna.

    float lighting(vec3 n) {

        return 0.03 + 0.97 * clamp(dot(n, uLight) * 2.5 + 0.15, 0.0, 1.0);

    }


    void main() {

        // Punkt na kwadracie w promieniach kuli, zaokrąglony do pikseli.

        vec2 p = (vUv * 2.0 - 1.0) * uExtent;

        p = (floor(p * uPixels) + 0.5) / uPixels;

        float r2 = dot(p, p);

        bool onBody = r2 < 1.0;


        // Pierścienie: płaska tarcza widziana z ukosa (spłaszczona w pionie).
        // Dolna połowa jest przed kulą, górna za nią.
        // Pasy pierścieni: ciemniejszy wewnętrzny, jasny środkowy, szary brzeg.

        vec4 ring = vec4(0.0);

        if (uRings > 0.0) {

            float rr = length(vec2(p.x, p.y / 0.3));

            float inside = step(1.3, rr) * step(rr, uRings);

            // Jaśniejszy pas w środku, ciemniejszy brzeg.

            vec3 ringColor = rr < 1.55
                ? vec3(0.6, 0.53, 0.42)
                : rr < 2.0 ? vec3(0.88, 0.8, 0.62) : vec3(0.7, 0.63, 0.5);

            ring = vec4(ringColor * (0.3 + 0.7 * clamp(uLight.z * 1.2, 0.0, 1.0)), inside);

        }


        vec3 color;
        float alpha = 0.0;

        if (onBody && !(ring.a > 0.5 && p.y < 0.0)) {

            vec3 n = vec3(p, sqrt(1.0 - r2));

            color = surface(n) * lighting(n);

            alpha = 1.0;

        }
        else if (ring.a > 0.5) {

            color = ring.rgb;

            alpha = 1.0;

        }

        if (alpha < 0.5) discard;

        gl_FragColor = vec4(color * uVisibility, 1.0);

        #include <colorspace_fragment>

    }
`;


export class Planets {

    constructor() {

        this.object = new THREE.Group();

        this.object.renderOrder = 1.5;

        this.planets = PLANETS.map((planet) => {

            const extent = Math.max(1, planet.rings);

            const material = new THREE.ShaderMaterial({

                uniforms: {
                    uLight: { value: new THREE.Vector3() },
                    uVisibility: { value: 0 },
                    uExtent: { value: extent },
                    uPixels: { value: planet.size / 2 / PIXEL_DEGREES },
                    uRings: { value: planet.rings },
                    uKind: { value: planet.kind }
                },

                vertexShader,
                fragmentShader,

                // Ciemna strona zasłania gwiazdy (zapisuje głębię).

                blending: THREE.AdditiveBlending

            });

            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);

            mesh.scale.setScalar(2 * DISTANCE * Math.tan(planet.size / 2 * extent * Math.PI / 180));

            mesh.renderOrder = 1.5;
            mesh.frustumCulled = false;

            this.object.add(mesh);


            // Kierunek wśród gwiazd (przed obrotem nieba).

            const latitude = planet.latitude * Math.PI / 180;

            const direction = new THREE.Vector3()
                .copy(EAST).multiplyScalar(Math.cos(planet.angle))
                .addScaledVector(SUN_NOON, Math.sin(planet.angle))
                .multiplyScalar(Math.cos(latitude))
                .addScaledVector(SKY_AXIS, Math.sin(latitude))
                .normalize();

            return { ...planet, mesh, material, direction };

        });

        this.visibility = 0;

    }


    update(state, celestial) {

        // Tylko w kosmosie (gdy niebo jest już prawie czarne).

        const visibility = Math.min(1, Math.max(0, (state.space - 0.6) / 0.35));

        this.visibility = visibility;

        this.object.visible = visibility > 0.001;

        if (!this.object.visible) {
            return;
        }


        const sun = celestial.sunDirection;

        for (const planet of this.planets) {

            const mesh = planet.mesh;

            mesh.position
                .copy(planet.direction)
                .applyQuaternion(celestial.starRotation)
                .multiplyScalar(DISTANCE);

            mesh.lookAt(0, 0, 0);

            mesh.updateMatrixWorld();


            // Światło: planety są dużo dalej od słońca niż my, więc widać
            // je prawie w pełni - światło pada głównie "od nas", trochę
            // od strony słońca (z = do kamery).

            mesh.matrixWorld.extractBasis(_axisX, _axisY, _axisZ);

            planet.material.uniforms.uLight.value.set(
                sun.dot(_axisX.normalize()) * planet.phase,
                sun.dot(_axisY.normalize()) * planet.phase,
                1
            ).normalize();

            planet.material.uniforms.uVisibility.value = visibility;

        }

    }


    // Kierunek do planety (do testów i /kosmos).

    directionOf(name, celestial, out = new THREE.Vector3()) {

        const planet = this.planets.find((p) => p.name.toLowerCase() === name.toLowerCase());

        return planet ? out.copy(planet.direction).applyQuaternion(celestial.starRotation) : null;

    }


    dispose() {

        for (const planet of this.planets) {

            planet.mesh.geometry.dispose();
            planet.material.dispose();

        }

    }

}
