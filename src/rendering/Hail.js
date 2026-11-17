import * as THREE from 'three';

import { RAIN_COMMON_GLSL, RAIN_STREAKS } from './RainStreaks.js';

// ------------------------------------------------------------
// GRAD (1.13.0)
//
// W samym środku najsilniejszych burz przez minutę, dwie zamiast samego
// deszczu lecą też białe kulki lodu. Jak krople deszczu (RainStreaks.js)
// liczy je karta graficzna - każda kulka ma stałe miejsce w pudełku
// wokół kamery i spada, a po uderzeniu w ziemię odbija się i znika:
//   - kulki w locie: białe kwadraty, szybsze i bardziej pionowe niż
//     deszcz (wiatr znosi je słabiej),
//   - odbicia: krótki podskok nad ziemią albo dachem.
// Korzysta z mapy schronienia deszczu (RainShelter): pod dachem gradu
// nie ma. Biały nalot na ziemi rysuje shader bloków (cloudShader.js -
// hailAt), stukot - audio/WeatherAudio.js.
// ------------------------------------------------------------

export const HAIL = Object.freeze({
    // Ile kulek w locie i odbić najwyżej (zwykle / tryb ziemniaka).
    stones: 1400, potatoStones: 400,
    bounces: 520, potatoBounces: 150,
    // Prędkość spadania (bloki/s) i bok kulki (bloki).
    fall: 23, size: 0.06
});

const WHITE = new THREE.Color(1, 1, 1);
const mod = (value, size) => ((value % size) + size) % size;
const clamp01 = (x) => Math.max(0, Math.min(1, x));


export class Hail {

    // scene - scena świata, rain - krople deszczu (RainStreaks): wspólne
    // pudełko wokół kamery, mapa schronienia i zegar.

    constructor(scene, rain) {

        this.scene = scene;
        this.rain = rain;
        this.intensity = 0;
        this.disposed = false;

        this.offset = new THREE.Vector3();
        this.velocity = new THREE.Vector3(0, -HAIL.fall, 0);

        this.uniforms = {
            uRainCamera: rain.uniforms.uRainCamera,
            uRainBox: rain.uniforms.uRainBox,
            uRainShelter: rain.uniforms.uRainShelter,
            uRainTime: rain.uniforms.uRainTime,
            uUnderwater: rain.uniforms.uUnderwater,
            uHailOffset: { value: this.offset },
            uHailFall: { value: this.velocity },
            // x bok kulki, y krycie, z promień pudełka.
            uHailShape: { value: new THREE.Vector3(HAIL.size, 1, RAIN_STREAKS.radius) },
            uHailColor: { value: new THREE.Color(0.95, 0.97, 1) }
        };

        const quad = (count, salt) => {

            const data = new Float32Array(count * 4);

            // Zawsze te same kulki (prosty generator).
            let state = salt;

            for (let i = 0; i < data.length; i++) {
                state = (Math.imul(state, 1664525) + 1013904223) | 0;
                data[i] = (state >>> 0) / 4294967296;
            }

            const geometry = new THREE.InstancedBufferGeometry();

            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
            geometry.setIndex([0, 1, 2, 0, 2, 3]);
            geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(data, 4));
            geometry.instanceCount = 0;

            return geometry;

        };

        const fragment = /* glsl */ `
            uniform vec3 uHailColor;
            uniform float uUnderwater;
            varying float vAlpha;

            void main() {

                if (uUnderwater > 0.5 || vAlpha <= 0.004) discard;

                gl_FragColor = vec4(uHailColor, vAlpha);

                #include <tonemapping_fragment>
                #include <colorspace_fragment>

            }
        `;

        // --- Kulki w locie ------------------------------------------

        this.stoneGeometry = quad(HAIL.stones, 0x7f4a7c15);

        this.stoneMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform vec3 uHailOffset;
                uniform vec3 uHailFall;
                uniform vec3 uHailShape;
                varying float vAlpha;

                void main() {

                    // Cztery prędkości - większe kulki spadają szybciej.
                    float speed = 0.85 + 0.1 * floor(aSeed.w * 4.0);
                    vec3 p = rainWrap(aSeed.xyz * uRainBox + uHailOffset * speed);

                    // Kwadrat zwrócony do kamery, lekko rozciągnięty wzdłuż lotu.
                    vec3 dir = normalize(uHailFall);
                    vec3 toCamera = uRainCamera - p;
                    vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                    float size = uHailShape.x * (0.75 + 0.5 * aSeed.w);
                    vec3 world = p - dir * (size * 1.7 * (position.y - 0.5)) + side * (position.x * size);

                    float roof = rainShelter(p.xz).r;
                    float edge = 1.0 - smoothstep(uHailShape.z * 0.72, uHailShape.z, length(toCamera.xz));

                    vAlpha = uHailShape.y * edge * step(roof, p.y) * smoothstep(1.4, 3.6, length(toCamera));

                    gl_Position = vAlpha > 0.004
                        ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                        : vec4(2.0, 2.0, 2.0, 1.0);

                }
            `,
            fragmentShader: fragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.stones = new THREE.Mesh(this.stoneGeometry, this.stoneMaterial);
        this.stones.name = 'Hail stones';
        this.stones.frustumCulled = false;
        this.stones.renderOrder = 4;
        this.stones.visible = false;

        // --- Odbicia od ziemi ---------------------------------------

        this.bounceGeometry = quad(HAIL.bounces, 0x3a2b1c0d);

        this.bounceMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform float uRainTime;
                uniform vec3 uHailShape;
                varying float vAlpha;

                void main() {

                    // Każde odbicie trwa ułamek sekundy, potem pojawia się
                    // w nowym miejscu.
                    float clock = uRainTime * (2.4 + 1.4 * aSeed.w) + aSeed.z * 29.0;
                    float life = fract(clock);
                    float turn = floor(clock);
                    vec2 spot = fract(aSeed.xy + turn * vec2(0.7548776, 0.5698403));
                    vec3 p = rainWrap(vec3(spot.x * uRainBox.x, 0.0, spot.y * uRainBox.z));
                    vec2 shelter = rainShelter(p.xz);

                    // Podskok: w górę i z powrotem, trochę w bok.
                    float angle = 6.2831853 * fract(aSeed.w * 7.31 + turn * 0.37);
                    float hop = (0.22 + 0.4 * aSeed.z) * 4.0 * life * (1.0 - life);

                    p.xz += vec2(cos(angle), sin(angle)) * 0.45 * life;
                    p.y = shelter.r + 0.05 + hop;

                    vec3 toCamera = uRainCamera - p;
                    vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), toCamera) + vec3(1e-5));
                    float size = uHailShape.x * (0.8 + 0.4 * aSeed.w);
                    vec3 world = p + vec3(0.0, (position.y - 0.5) * size, 0.0) + side * (position.x * size);
                    float edge = 1.0 - smoothstep(uHailShape.z * 0.6, uHailShape.z * 0.95, length(toCamera.xz));

                    // Nie na wodzie, nie tam, gdzie nic nie wiadomo, nie
                    // daleko nad albo pod graczem.
                    vAlpha = uHailShape.y * edge * step(0.5, shelter.r) * step(shelter.g, 0.5)
                        * step(abs(p.y - uRainCamera.y), 20.0) * (1.0 - life * life);

                    gl_Position = vAlpha > 0.004
                        ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                        : vec4(2.0, 2.0, 2.0, 1.0);

                }
            `,
            fragmentShader: fragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.bounces = new THREE.Mesh(this.bounceGeometry, this.bounceMaterial);
        this.bounces.name = 'Hail bounces';
        this.bounces.frustumCulled = false;
        this.bounces.renderOrder = 4;
        this.bounces.visible = false;

        scene.add(this.stones, this.bounces);

    }


    // Po rain.update (wspólne pudełko i mapa schronienia są już świeże).
    // dt - czas klatki, intensity - natężenie gradu 0-1, wind - wiatr
    // { x, z }, sky - stan nieba (jasność kulek), small - 0-1: krupa
    // śnieżna zamiast gradu (od 1.14.0) - drobniejsze kulki, które
    // spadają wolniej.

    update(dt, intensity, wind, sky = null, small = 0) {

        if (this.disposed) return;

        const potato = this.rain.amount <= 0.35;
        const off = this.rain.amount <= 0;
        const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        const box = this.uniforms.uRainBox.value;

        this.intensity = off ? 0 : clamp01(intensity);

        // Grad leci prawie pionowo - wiatr znosi go słabiej niż deszcz.
        const graupel = clamp01(small);

        this.velocity.set((wind?.x ?? 0) * 0.45, -HAIL.fall * (1 - 0.55 * graupel), (wind?.z ?? 0) * 0.45);
        this.uniforms.uHailShape.value.x = HAIL.size * (1 - 0.4 * graupel);

        this.offset.x = mod(this.offset.x + this.velocity.x * step, box.x * 20);
        this.offset.y = mod(this.offset.y + this.velocity.y * step, box.y * 20);
        this.offset.z = mod(this.offset.z + this.velocity.z * step, box.z * 20);

        // Kulki nie świecą: nocą ciemnieją razem z niebem.
        const light = sky ? 0.25 + 0.75 * (sky.daylight ?? 1) : 1;

        if (sky?.horizon) {
            this.uniforms.uHailColor.value.copy(sky.horizon).lerp(WHITE, 0.8).multiplyScalar(light);
        }

        const active = this.intensity > 0.02;
        const amount = clamp01(0.2 + 0.8 * this.intensity);

        this.stoneGeometry.instanceCount = active ? Math.round((potato ? HAIL.potatoStones : HAIL.stones) * amount) : 0;
        this.bounceGeometry.instanceCount = active ? Math.round((potato ? HAIL.potatoBounces : HAIL.bounces) * amount) : 0;
        this.stones.visible = this.stoneGeometry.instanceCount > 0;
        this.bounces.visible = this.bounceGeometry.instanceCount > 0;

    }


    stats() {

        return {
            intensity: this.intensity,
            stones: this.stoneGeometry.instanceCount,
            bounces: this.bounceGeometry.instanceCount,
            draws: Number(this.stones.visible) + Number(this.bounces.visible)
        };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.stones, this.bounces);
        this.stoneGeometry.dispose();
        this.bounceGeometry.dispose();
        this.stoneMaterial.dispose();
        this.bounceMaterial.dispose();
        this.rain = null;

    }

}
