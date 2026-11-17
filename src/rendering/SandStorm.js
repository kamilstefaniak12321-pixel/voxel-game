import * as THREE from 'three';

import { RAIN_COMMON_GLSL, RAIN_STREAKS } from './RainStreaks.js';

// ------------------------------------------------------------
// PIASEK NIESIONY WIATREM I BRYZGI Z MORZA (1.15.0)
//
// Jak krople deszczu i płatki śniegu (RainStreaks.js, SnowFall.js)
// wszystko liczy karta graficzna - każde ziarno ma stałe miejsce w pudełku
// wokół kamery i płynie z wiatrem.
//
//   ZIARNA  - piasek w powietrzu w czasie burzy piaskowej: krótkie,
//             płowe smugi lecące prawie poziomo na każdej wysokości.
//   STRUGI  - piasek sunący tuż nad ziemią. Pojawia się wcześniej niż
//             ziarna: przy lekkim pyle i mocniejszym wietrze po wydmach
//             pełzną jasne smugi.
//   BRYZGI  - sztorm na morzu: wiatr zrywa wodę z grzbietów fal - nisko
//             nad wodą lecą białe smugi.
//
// Korzysta z mapy schronienia deszczu (RainShelter): pod dachem i w jaskini
// piasek nie leci, strugi suną po ziemi (nie po wodzie), bryzgi tylko nad
// wodą. Zasłonę pyłu w oddali rysują shadery nieba i dalekiego terenu
// (weather/cloudShader.js - dustWall, dustAt), barwę powietrza - Sky.
// ------------------------------------------------------------

export const SAND = Object.freeze({
    // Ile ziaren, strug i bryzgów najwyżej (zwykle / tryb ziemniaka).
    grains: 4200, potatoGrains: 1100,
    streams: 1800, potatoStreams: 500,
    spray: 1500, potatoSpray: 400,
    // Od jakiego pyłu (0-1) ziarna lecą w powietrzu i od jakiego suną
    // strugi przy ziemi; od jakiego wiatru (bloki/s) strugi w ogóle ruszają.
    grainsFrom: 0.24, streamsFrom: 0.08, streamWind: [3, 6.5],
    // Od jakiego stanu morza (0-1) lecą bryzgi.
    sprayFrom: 0.3
});

const mod = (value, size) => ((value % size) + size) % size;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const WHITE = new THREE.Color(1, 1, 1);


export class SandStorm {

    // scene - scena świata, rain - krople deszczu (RainStreaks): wspólne
    // pudełko wokół kamery, mapa schronienia i zegar.

    constructor(scene, rain) {

        this.scene = scene;
        this.rain = rain;
        this.level = 0;
        this.streamLevel = 0;
        this.sprayLevel = 0;
        this.disposed = false;

        this.offset = new THREE.Vector3();
        this.velocity = new THREE.Vector3(1, 0, 0);

        this.uniforms = {
            uRainCamera: rain.uniforms.uRainCamera,
            uRainBox: rain.uniforms.uRainBox,
            uRainShelter: rain.uniforms.uRainShelter,
            uRainTime: rain.uniforms.uRainTime,
            uUnderwater: rain.uniforms.uUnderwater,
            // Wspólne przesunięcie z wiatrem i kierunek lotu.
            uSandOffset: { value: this.offset },
            uSandWind: { value: this.velocity },
            // Ziarna: x długość smugi, y krycie, z promień pudełka, w falowanie.
            uSandShape: { value: new THREE.Vector4(0.5, 0, RAIN_STREAKS.radius, 0.2) },
            // Strugi: x długość, y krycie. Bryzgi: z długość, w krycie.
            uSandLow: { value: new THREE.Vector4(0.8, 0, 0.7, 0) },
            uSandColor: { value: new THREE.Color(0.85, 0.66, 0.42) },
            uSprayColor: { value: new THREE.Color(0.92, 0.95, 1) }
        };

        const quad = (count, salt) => {

            const data = new Float32Array(count * 4);

            // Zawsze te same ziarna (prosty generator).
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

        const fragment = (color) => /* glsl */ `
            uniform vec3 ${color};
            uniform float uUnderwater;
            varying float vAlpha;
            varying float vShade;

            void main() {

                if (uUnderwater > 0.5 || vAlpha <= 0.004) discard;

                gl_FragColor = vec4(${color} * vShade, vAlpha);

                #include <tonemapping_fragment>
                #include <colorspace_fragment>

            }
        `;

        const mesh = (geometry, vertexShader, color, name) => {

            const material = new THREE.ShaderMaterial({
                uniforms: this.uniforms,
                vertexShader,
                fragmentShader: fragment(color),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide
            });

            const object = new THREE.Mesh(geometry, material);

            object.name = name;
            object.frustumCulled = false;
            object.renderOrder = 4;
            object.visible = false;

            return object;

        };

        // --- Ziarna w powietrzu ----------------------------------------

        this.grainGeometry = quad(SAND.grains, 0x2f6b1d53);

        this.grains = mesh(this.grainGeometry, /* glsl */ `
            ${RAIN_COMMON_GLSL}
            uniform vec3 uSandOffset;
            uniform vec3 uSandWind;
            uniform vec4 uSandShape;
            uniform float uRainTime;
            varying float vAlpha;
            varying float vShade;

            void main() {

                // Jedne ziarna ciemniejsze, drugie jaśniejsze od zapylonego
                // powietrza - inaczej nie byłoby ich na jego tle widać.
                vShade = aSeed.z < 0.5 ? 0.5 + 0.4 * aSeed.x : 1.15 + 0.35 * aSeed.x;

                // Pięć prędkości - sąsiednie ziarna się mijają.
                float speed = 0.8 + 0.1 * floor(aSeed.w * 5.0);
                vec3 p = rainWrap(aSeed.xyz * uRainBox + uSandOffset * speed);

                // Wiatr niesie piasek falami: ziarna unoszą się i opadają.
                float phase = aSeed.w * 37.0 + uRainTime * (1.1 + 1.3 * aSeed.x);

                p.y += uSandShape.w * sin(phase);

                // Smuga wzdłuż lotu, zwrócona do kamery.
                vec3 dir = normalize(uSandWind + vec3(0.0, 0.25 * cos(phase), 0.0));
                vec3 toCamera = uRainCamera - p;
                vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                float len = uSandShape.x * (0.5 + aSeed.w);
                vec3 world = p - dir * (len * (position.y - 0.5)) + side * (position.x * (0.03 + 0.035 * aSeed.z));

                float roof = rainShelter(p.xz).r;
                float edge = 1.0 - smoothstep(uSandShape.z * 0.72, uSandShape.z, length(toCamera.xz));

                // Końce smugi wygaszone; tuż przy kamerze jej nie ma.
                vAlpha = uSandShape.y * edge * step(roof, p.y) * (1.0 - abs(position.y * 2.0 - 1.0))
                    * smoothstep(1.2, 3.5, length(toCamera));

                gl_Position = vAlpha > 0.004
                    ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                    : vec4(2.0, 2.0, 2.0, 1.0);

            }
        `, 'uSandColor', 'Sand grains');

        // --- Strugi przy ziemi i bryzgi nad wodą -------------------------
        // Ten sam shader: strugi suną po lądzie, bryzgi nad wodą.

        const low = (water) => /* glsl */ `
            ${RAIN_COMMON_GLSL}
            uniform vec3 uSandOffset;
            uniform vec3 uSandWind;
            uniform vec4 uSandLow;
            uniform float uRainTime;
            varying float vAlpha;
            varying float vShade;

            void main() {

                vShade = ${water ? '1.0' : '0.75 + 0.6 * aSeed.y'};

                float speed = 0.8 + 0.1 * floor(aSeed.w * 5.0);
                vec3 p = rainWrap(vec3(aSeed.x * uRainBox.x, 0.0, aSeed.z * uRainBox.z) + uSandOffset * speed * ${water ? '1.3' : '1.0'});
                vec2 shelter = rainShelter(p.xz);

                // Wysokość: większość przy samej powierzchni, faluje.
                float lift = aSeed.y * aSeed.y;

                p.y = shelter.r + ${water ? '0.1 + 1.6' : '0.05 + 0.9'} * lift + 0.07 * sin(uRainTime * 3.4 + aSeed.w * 40.0);

                vec3 dir = normalize(uSandWind);
                vec3 toCamera = uRainCamera - p;
                vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                float len = ${water ? 'uSandLow.z' : 'uSandLow.x'} * (0.5 + aSeed.w);
                vec3 world = p - dir * (len * (position.y - 0.5)) + side * (position.x * ${water ? '0.09' : '0.06'});
                float edge = 1.0 - smoothstep(uRainBox.x * 0.3, uRainBox.x * 0.475, length(toCamera.xz));

                // ${water ? 'Tylko nad wodą' : 'Nie na wodzie'}, nie tam, gdzie nic nie wiadomo, nie
                // daleko nad albo pod graczem; wyżej - rzadziej.
                vAlpha = ${water ? 'uSandLow.w' : 'uSandLow.y'} * edge * step(0.5, shelter.r) * ${water ? 'step(0.5, shelter.g)' : 'step(shelter.g, 0.5)'}
                    * step(abs(p.y - uRainCamera.y), 20.0) * (1.0 - 0.75 * lift)
                    * (1.0 - abs(position.y * 2.0 - 1.0)) * smoothstep(1.5, 4.0, length(toCamera));

                gl_Position = vAlpha > 0.004
                    ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                    : vec4(2.0, 2.0, 2.0, 1.0);

            }
        `;

        this.streamGeometry = quad(SAND.streams, 0x51a3c2e9);
        this.streams = mesh(this.streamGeometry, low(false), 'uSandColor', 'Sand streams');

        this.sprayGeometry = quad(SAND.spray, 0x7be4460d);
        this.spray = mesh(this.sprayGeometry, low(true), 'uSprayColor', 'Sea spray');

        scene.add(this.grains, this.streams, this.spray);

    }


    // Ile piasku leci w powietrzu (0-1) przy danym pyle (0-1).

    static grainAmount(dust) {

        return clamp01((dust - SAND.grainsFrom) / (1 - SAND.grainsFrom));

    }


    // Strugi przy ziemi (0-1): z pyłu (0-1) i wiatru (bloki/s). W ścianie
    // pyłu i w burzy piaskowej suną zawsze.

    static streamAmount(dust, speed) {

        const windy = clamp01((speed - SAND.streamWind[0]) / (SAND.streamWind[1] - SAND.streamWind[0]));

        return clamp01((dust - SAND.streamsFrom) / (0.5 - SAND.streamsFrom)) * Math.max(windy, clamp01((dust - 0.45) * 3));

    }


    // Bryzgi (0-1) ze stanu morza (0-1).

    static sprayAmount(sea) {

        return clamp01((sea - SAND.sprayFrom) / (1 - SAND.sprayFrom));

    }


    // Po rain.update (wspólne pudełko i mapa schronienia są już świeże).
    // dt - czas klatki, dust - pył w powietrzu 0-1, sea - stan morza 0-1,
    // wind - wiatr { x, z, speed }, sky - stan nieba (barwa i jasność).

    update(dt, dust, sea, wind, sky = null) {

        if (this.disposed) return;

        const potato = this.rain.amount <= 0.35;
        const off = this.rain.amount <= 0;
        const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        const box = this.uniforms.uRainBox.value;
        const wx = wind?.x ?? 0;
        const wz = wind?.z ?? 0;
        const speed = wind?.speed ?? Math.hypot(wx, wz);

        this.level = off ? 0 : SandStorm.grainAmount(dust);
        this.streamLevel = off ? 0 : SandStorm.streamAmount(dust, speed);
        this.sprayLevel = off ? 0 : SandStorm.sprayAmount(sea);

        // Piasek leci z wiatrem (trochę szybciej niż samo powietrze przy
        // ziemi); w ciszy z komendy - powoli, dawnym kierunkiem.
        if (speed > 0.05) {

            const flight = Math.max(3.5, speed * 1.35) / speed;

            this.velocity.set(wx * flight, 0, wz * flight);

        }

        // (Prędkości ziaren są wielokrotnościami 0,1 - po 10 pudełkach
        // zawinięcie ich nie przesuwa.)
        this.offset.x = mod(this.offset.x + this.velocity.x * step, box.x * 10);
        this.offset.z = mod(this.offset.z + this.velocity.z * step, box.z * 10);

        const flight = Math.hypot(this.velocity.x, this.velocity.z);

        this.uniforms.uSandShape.value.set(0.35 + 0.09 * flight, 0.25 + 0.5 * this.level, RAIN_STREAKS.radius, 0.12 + 0.2 * this.level);
        this.uniforms.uSandLow.value.set(0.5 + 0.11 * flight, 0.18 + 0.5 * this.streamLevel, 0.45 + 0.1 * flight, 0.2 + 0.55 * this.sprayLevel);

        // Piasek i bryzgi nie świecą: barwa pyłu z nieba (Sky.refresh),
        // nocą ciemnieją razem z nim.
        if (sky?.dustColor) {
            this.uniforms.uSandColor.value.copy(sky.dustColor).multiplyScalar(1.18);
        }

        if (sky?.horizon) {
            this.uniforms.uSprayColor.value.copy(sky.horizon).lerp(WHITE, 0.8).multiplyScalar(0.3 + 0.7 * (sky.daylight ?? 1));
        }

        const count = (level, full, low, from = 0.02) => level > from
            ? Math.round((potato ? low : full) * clamp01(0.2 + 0.8 * level))
            : 0;

        this.grainGeometry.instanceCount = count(this.level, SAND.grains, SAND.potatoGrains);
        this.streamGeometry.instanceCount = count(this.streamLevel, SAND.streams, SAND.potatoStreams, 0.03);
        this.sprayGeometry.instanceCount = count(this.sprayLevel, SAND.spray, SAND.potatoSpray);

        this.grains.visible = this.grainGeometry.instanceCount > 0;
        this.streams.visible = this.streamGeometry.instanceCount > 0;
        this.spray.visible = this.sprayGeometry.instanceCount > 0;

    }


    stats() {

        return {
            level: this.level,
            grains: this.grainGeometry.instanceCount,
            streams: this.streamGeometry.instanceCount,
            spray: this.sprayGeometry.instanceCount,
            draws: Number(this.grains.visible) + Number(this.streams.visible) + Number(this.spray.visible)
        };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.grains, this.streams, this.spray);

        for (const object of [this.grains, this.streams, this.spray]) {
            object.geometry.dispose();
            object.material.dispose();
        }

        this.rain = null;

    }

}
