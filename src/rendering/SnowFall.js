import * as THREE from 'three';

import { RAIN_COMMON_GLSL, RAIN_STREAKS } from './RainStreaks.js';

// ------------------------------------------------------------
// ŚNIEG: PŁATKI I ZAMIEĆ (1.14.0)
//
// Gdy jest dość zimno, opad pada jako śnieg. Jak krople deszczu
// (RainStreaks.js) płatki liczy karta graficzna - każdy ma stałe miejsce
// w pudełku wokół kamery, opada powoli i płynie z wiatrem, kołysząc się
// na boki. Rodzaj śniegu zależy od temperatury:
//   - około zera: duże, mokre płaty - ciężkie, lecą prawie prosto,
//   - kilka stopni mrozu: zwykły śnieg,
//   - duży mróz: drobny, suchy puch, który wiatr niesie daleko.
// W silnym wietrze płatki lecą prawie poziomo i rozciągają się w smugi -
// śnieżyca.
//
// ZAMIEĆ PRZY ZIEMI: gdy leży śnieg i mocno wieje, wiatr porywa go
// z ziemi - nisko nad nią suną białe smugi, nawet gdy z nieba nic nie
// pada.
//
// Korzysta z mapy schronienia deszczu (RainShelter): pod dachem i w
// jaskini nie pada. Krupę śnieżną (drobne kulki z przelotnych opadów)
// rysuje grad (Hail.js), pokrywę na ziemi - shader bloków
// (weather/cloudShader.js - snowCoverAt).
// ------------------------------------------------------------

export const SNOW = Object.freeze({
    // Ile płatków i smug zamieci najwyżej (zwykle / tryb ziemniaka).
    flakes: 5200, potatoFlakes: 1400,
    drift: 1500, potatoDrift: 400,
    // Od jakiego wiatru (bloki/s) wiatr porywa śnieg z ziemi i przy jakim
    // zamieć jest najgęstsza.
    driftFrom: 4.5, driftFull: 9
});

const WHITE = new THREE.Color(1, 1, 1);
const mod = (value, size) => ((value % size) + size) % size;
const clamp01 = (x) => Math.max(0, Math.min(1, x));


export class SnowFall {

    // scene - scena świata, rain - krople deszczu (RainStreaks): wspólne
    // pudełko wokół kamery, mapa schronienia i zegar.

    constructor(scene, rain) {

        this.scene = scene;
        this.rain = rain;
        this.intensity = 0;
        this.driftLevel = 0;
        this.disposed = false;

        this.offset = new THREE.Vector3();
        this.velocity = new THREE.Vector3(0, -1.6, 0);
        this.driftOffset = new THREE.Vector3();
        this.driftVelocity = new THREE.Vector3(1, 0, 0);

        this.uniforms = {
            uRainCamera: rain.uniforms.uRainCamera,
            uRainBox: rain.uniforms.uRainBox,
            uRainShelter: rain.uniforms.uRainShelter,
            uRainTime: rain.uniforms.uRainTime,
            uUnderwater: rain.uniforms.uUnderwater,
            uSnowOffset: { value: this.offset },
            uSnowFall: { value: this.velocity },
            // x bok płatka, y krycie, z promień pudełka, w kołysanie (bloki).
            uSnowShape: { value: new THREE.Vector4(0.08, 0.9, RAIN_STREAKS.radius, 0.25) },
            // Rozciągnięcie płatka w smugę wzdłuż lotu (śnieżyca).
            uSnowStretch: { value: 0 },
            uSnowFlakeColor: { value: new THREE.Color(0.95, 0.97, 1) },
            uDriftOffset: { value: this.driftOffset },
            uDriftWind: { value: this.driftVelocity },
            // x długość smugi, y krycie, z promień pudełka.
            uDriftShape: { value: new THREE.Vector3(0.8, 0, RAIN_STREAKS.radius) }
        };

        const quad = (count, salt) => {

            const data = new Float32Array(count * 4);

            // Zawsze te same płatki (prosty generator).
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
            uniform vec3 uSnowFlakeColor;
            uniform float uUnderwater;
            varying float vAlpha;
            // x - miejsce wzdłuż smugi (0-1), y - czy końce mają gasnąć
            // (zamieć: 1, płatki: 0). Wygaszenie liczy się tutaj, na
            // piksel: w wierzchołkach (oba końce smugi) byłoby zerem
            // i smugi nie byłoby widać wcale (błąd 1.14.0).
            varying vec2 vStreak;

            void main() {

                float alpha = vAlpha * (1.0 - vStreak.y * abs(vStreak.x * 2.0 - 1.0));

                if (uUnderwater > 0.5 || alpha <= 0.004) discard;

                gl_FragColor = vec4(uSnowFlakeColor, alpha);

                #include <tonemapping_fragment>
                #include <colorspace_fragment>

            }
        `;

        // --- Płatki -----------------------------------------------------

        this.flakeGeometry = quad(SNOW.flakes, 0x1c69b3f7);

        this.flakeMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform vec3 uSnowOffset;
                uniform vec3 uSnowFall;
                uniform vec4 uSnowShape;
                uniform float uSnowStretch;
                uniform float uRainTime;
                varying float vAlpha;
                varying vec2 vStreak;

                void main() {

                    vStreak = vec2(position.y, 0.0);

                    // Pięć prędkości - większe płatki opadają szybciej.
                    float speed = 0.8 + 0.1 * floor(aSeed.w * 5.0);
                    vec3 p = rainWrap(aSeed.xyz * uRainBox + uSnowOffset * speed);

                    // Kołysanie: każdy płatek krąży po swojemu.
                    float phase = aSeed.w * 41.0 + uRainTime * (0.7 + 0.9 * aSeed.x);

                    p.xz += uSnowShape.w * vec2(sin(phase), cos(phase * 0.83 + aSeed.z * 6.0));

                    // Kwadrat zwrócony do kamery; w śnieżycy rozciągnięty
                    // w smugę wzdłuż lotu.
                    vec3 dir = normalize(uSnowFall);
                    vec3 toCamera = uRainCamera - p;
                    vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                    float size = uSnowShape.x * (0.6 + 0.8 * aSeed.w);
                    vec3 world = p - dir * (size * (1.0 + uSnowStretch) * (position.y - 0.5)) + side * (position.x * size);

                    float roof = rainShelter(p.xz).r;
                    float edge = 1.0 - smoothstep(uSnowShape.z * 0.72, uSnowShape.z, length(toCamera.xz));

                    vAlpha = uSnowShape.y * edge * step(roof, p.y) * smoothstep(1.8, 4.2, length(toCamera));

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

        this.flakes = new THREE.Mesh(this.flakeGeometry, this.flakeMaterial);
        this.flakes.name = 'Snow flakes';
        this.flakes.frustumCulled = false;
        this.flakes.renderOrder = 4;
        this.flakes.visible = false;

        // --- Zamieć przy ziemi -----------------------------------------

        this.driftGeometry = quad(SNOW.drift, 0x6d2b79f5);

        this.driftMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform vec3 uDriftOffset;
                uniform vec3 uDriftWind;
                uniform vec3 uDriftShape;
                uniform float uRainTime;
                varying float vAlpha;
                varying vec2 vStreak;

                void main() {

                    // Końce smugi gasną (liczone w shaderze pikseli).
                    vStreak = vec2(position.y, 1.0);

                    // Smuga sunie z wiatrem tuż nad ziemią (albo dachem).
                    float speed = 0.8 + 0.1 * floor(aSeed.w * 5.0);
                    vec3 p = rainWrap(vec3(aSeed.x * uRainBox.x, 0.0, aSeed.z * uRainBox.z) + uDriftOffset * speed);
                    vec2 shelter = rainShelter(p.xz);

                    // Wysokość: większość przy samej ziemi, faluje.
                    float lift = aSeed.y * aSeed.y;

                    p.y = shelter.r + 0.06 + 1.1 * lift + 0.08 * sin(uRainTime * 3.0 + aSeed.w * 40.0);

                    vec3 dir = normalize(uDriftWind);
                    vec3 toCamera = uRainCamera - p;
                    vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                    float len = uDriftShape.x * (0.5 + aSeed.w);
                    vec3 world = p - dir * (len * (position.y - 0.5)) + side * (position.x * 0.07);
                    float edge = 1.0 - smoothstep(uDriftShape.z * 0.6, uDriftShape.z * 0.95, length(toCamera.xz));

                    // Nie na wodzie, nie tam, gdzie nic nie wiadomo, nie
                    // daleko nad albo pod graczem; wyżej - rzadsza.
                    vAlpha = uDriftShape.y * edge * step(0.5, shelter.r) * step(shelter.g, 0.5)
                        * step(abs(p.y - uRainCamera.y), 20.0) * (1.0 - 0.75 * lift)
                        * smoothstep(1.5, 4.0, length(toCamera));

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

        this.drift = new THREE.Mesh(this.driftGeometry, this.driftMaterial);
        this.drift.name = 'Snow drift';
        this.drift.frustumCulled = false;
        this.drift.renderOrder = 4;
        this.drift.visible = false;

        scene.add(this.flakes, this.drift);

    }


    // Kształt śniegu z natężenia (0-1) i tego, jak mokry jest śnieg
    // (1 - około zera, mokre płaty; 0 - duży mróz, suchy puch): bok
    // płatka, prędkość opadania, kołysanie, gęstość.

    static shape(intensity, wet) {

        const r = clamp01(intensity);
        const w = clamp01(wet);

        return {
            size: 0.045 + 0.065 * w,
            fall: 1.3 + 1.3 * w + 0.5 * r,
            sway: 0.14 + 0.2 * w,
            // Suchy puch wiatr niesie w całości, mokre płaty słabiej.
            carry: 1 - 0.35 * w,
            alpha: 0.82 + 0.14 * w,
            density: clamp01(0.1 + 0.9 * r ** 0.75)
        };

    }


    // Zamieć przy ziemi 0-1: z wiatru (bloki/s) i z tego, ile leży śniegu.

    static driftAmount(speed, cover) {

        return clamp01((speed - SNOW.driftFrom) / (SNOW.driftFull - SNOW.driftFrom)) * clamp01(cover * 1.5);

    }


    // Po rain.update (wspólne pudełko i mapa schronienia są już świeże).
    // dt - czas klatki, intensity - natężenie śniegu 0-1, wet - jak mokry
    // jest śnieg 0-1, wind - wiatr { x, z, speed }, cover - ile śniegu
    // leży pod graczem 0-1 (zamieć), sky - stan nieba (jasność płatków).

    update(dt, intensity, wet, wind, cover = 0, sky = null) {

        if (this.disposed) return;

        const potato = this.rain.amount <= 0.35;
        const off = this.rain.amount <= 0;
        const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));
        const box = this.uniforms.uRainBox.value;
        const speed = wind?.speed ?? Math.hypot(wind?.x ?? 0, wind?.z ?? 0);

        this.intensity = off ? 0 : clamp01(intensity);

        const shape = SnowFall.shape(this.intensity, wet);

        this.velocity.set((wind?.x ?? 0) * shape.carry, -shape.fall, (wind?.z ?? 0) * shape.carry);

        // (Prędkości płatków są wielokrotnościami 0,1 - po 10 pudełkach
        // zawinięcie ich nie przesuwa.)
        this.offset.x = mod(this.offset.x + this.velocity.x * step, box.x * 10);
        this.offset.y = mod(this.offset.y + this.velocity.y * step, box.y * 10);
        this.offset.z = mod(this.offset.z + this.velocity.z * step, box.z * 10);

        // Śnieżyca: im szybciej niesie wiatr, tym dłuższa smuga.
        const flight = Math.hypot(this.velocity.x, this.velocity.z);

        this.uniforms.uSnowShape.value.set(shape.size, shape.alpha, RAIN_STREAKS.radius, shape.sway);
        this.uniforms.uSnowStretch.value = Math.min(5, Math.max(0, flight - 3) * 0.6);

        // Zamieć przy ziemi.
        this.driftLevel = off ? 0 : SnowFall.driftAmount(speed, cover);

        const wx = wind?.x ?? 0;
        const wz = wind?.z ?? 0;

        if (speed > 0.01) {
            this.driftVelocity.set(wx * 1.25, 0, wz * 1.25);
        }

        this.driftOffset.x = mod(this.driftOffset.x + this.driftVelocity.x * step, box.x * 10);
        this.driftOffset.z = mod(this.driftOffset.z + this.driftVelocity.z * step, box.z * 10);

        this.uniforms.uDriftShape.value.set(0.4 + 0.07 * speed, 0.16 + 0.4 * this.driftLevel, RAIN_STREAKS.radius);

        // Śnieg nie świeci: nocą ciemnieje razem z niebem.
        const light = sky ? 0.3 + 0.7 * (sky.daylight ?? 1) : 1;

        if (sky?.horizon) {
            this.uniforms.uSnowFlakeColor.value.copy(sky.horizon).lerp(WHITE, 0.82).multiplyScalar(light);
        }

        const flakes = this.intensity > 0.01 ? Math.round((potato ? SNOW.potatoFlakes : SNOW.flakes) * shape.density) : 0;
        const drift = this.driftLevel > 0.03 ? Math.round((potato ? SNOW.potatoDrift : SNOW.drift) * clamp01(0.25 + 0.75 * this.driftLevel)) : 0;

        this.flakeGeometry.instanceCount = flakes;
        this.driftGeometry.instanceCount = drift;
        this.flakes.visible = flakes > 0;
        this.drift.visible = drift > 0;

    }


    stats() {

        return {
            intensity: this.intensity,
            flakes: this.flakeGeometry.instanceCount,
            drift: this.driftGeometry.instanceCount,
            draws: Number(this.flakes.visible) + Number(this.drift.visible)
        };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.flakes, this.drift);
        this.flakeGeometry.dispose();
        this.driftGeometry.dispose();
        this.flakeMaterial.dispose();
        this.driftMaterial.dispose();
        this.rain = null;

    }

}
