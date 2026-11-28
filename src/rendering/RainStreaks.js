import * as THREE from 'three';

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { getWaterLevel } from '../blocks/BlockRegistry.js';
import { stopsRain } from '../world/rain.js';
import { viewUniforms } from './viewUniforms.js';

// ------------------------------------------------------------
// DESZCZ: KROPLE, ROZPRYSKI I SCHRONIENIE (1.12.0)
//
// Krople wokół gracza liczy karta graficzna: każda ma stałe miejsce
// w pudełku wokół kamery i spada z prędkością deszczu (w dół i z
// wiatrem - stąd ukos). Po wyjściu z pudełka wraca z drugiej strony,
// więc procesor nie rusza pojedynczych kropel - przesuwa tylko jedno
// wspólne przesunięcie. Od mżawki (drobne, wolne, gęste) po ulewę
// (długie, szybkie smugi).
//
// SCHRONIENIE (RainShelter): mała mapa "jak wysoko jest dach" w każdej
// kolumnie wokół gracza - pierwszy od góry blok, który zatrzymuje deszcz
// (pełny blok, liście, woda). Kropla poniżej tej wysokości znika, więc
// pod dachem, w jaskini i pod koroną drzewa nie pada, a przez okno widać
// deszcz na zewnątrz. Z tej samej mapy biorą się rozpryski na ziemi
// i to, jak bardzo gracz jest osłonięty (dźwięk deszczu). Regułę "co
// zatrzymuje deszcz" ma world/rain.js - ta sama dla ognisk i pochodni.
// ------------------------------------------------------------

export const RAIN_STREAKS = Object.freeze({
    // Ile kropel i rozprysków najwyżej (zwykle / tryb ziemniaka).
    streaks: 6000, potatoStreaks: 1600,
    splashes: 700, potatoSplashes: 180,
    // Pudełko z kroplami wokół kamery: promień w poziomie i wysokość.
    radius: 18, height: 26
});

// Bok mapy schronienia w blokach (kolumnach) i ile jej wierszy odświeża
// się co klatkę (cała w pół sekundy - łapie postawione i zniszczone bloki).
export const SHELTER_SIZE = 64;
const SHELTER_ROWS = 2;

const mod = (value, size) => ((value % size) + size) % size;
const clamp01 = (x) => Math.max(0, Math.min(1, x));


export class RainShelter {

    constructor(world) {

        const N = SHELTER_SIZE;

        this.world = world;

        // R - wysokość dachu (y nad blokiem, który zatrzymuje deszcz),
        // G - 255, gdy to woda (bez rozprysku - kręgi robi WaterImpactRipples).
        this.data = new Uint8Array(N * N * 2);
        this.texture = new THREE.DataTexture(this.data, N, N, THREE.RGFormat);
        this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
        this.texture.generateMipmaps = false;

        this.originX = null;
        this.originZ = null;
        this.row = 0;

    }


    // Kolumna (x, z): od góry do pierwszego bloku, który zatrzymuje deszcz.

    scan(x, z) {

        const k = (mod(z, SHELTER_SIZE) * SHELTER_SIZE + mod(x, SHELTER_SIZE)) * 2;
        const cx = Math.floor(x / CHUNK_SIZE);
        const cz = Math.floor(z / CHUNK_SIZE);
        const chunk = this.world.getChunk(cx, cz);

        let top = 0;
        let water = 0;

        if (chunk?.blocks) {

            const blocks = chunk.blocks;
            const column = (z - cz * CHUNK_SIZE) * CHUNK_SIZE + (x - cx * CHUNK_SIZE);
            const layer = CHUNK_SIZE * CHUNK_SIZE;

            for (let y = Math.min(CHUNK_HEIGHT, chunk.maxY ?? CHUNK_HEIGHT) - 1; y >= 0; y--) {

                const id = blocks[y * layer + column];

                // (Ta sama reguła dachu co dla ognisk, pochodni i drewna.)
                if (stopsRain(id)) {
                    top = y + 1;
                    water = getWaterLevel(id) >= 0 ? 255 : 0;
                    break;
                }

            }

        }

        this.data[k] = top;
        this.data[k + 1] = water;

    }


    // Co klatkę: okno idzie za graczem (nowe paski od razu), a dwa
    // wiersze dostają świeży odczyt.

    update(x, z) {

        const N = SHELTER_SIZE;
        const originX = Math.floor(x) - N / 2;
        const originZ = Math.floor(z) - N / 2;
        const shiftX = this.originX === null ? N : originX - this.originX;
        const shiftZ = this.originZ === null ? N : originZ - this.originZ;

        if (Math.abs(shiftX) >= N || Math.abs(shiftZ) >= N) {

            for (let iz = originZ; iz < originZ + N; iz++) {
                for (let ix = originX; ix < originX + N; ix++) this.scan(ix, iz);
            }

        }
        else {

            const fromX = shiftX > 0 ? originX + N - shiftX : originX;
            const toX = shiftX > 0 ? originX + N : originX - shiftX;

            for (let ix = fromX; ix < toX; ix++) {
                for (let iz = originZ; iz < originZ + N; iz++) this.scan(ix, iz);
            }

            const fromZ = shiftZ > 0 ? originZ + N - shiftZ : originZ;
            const toZ = shiftZ > 0 ? originZ + N : originZ - shiftZ;

            for (let iz = fromZ; iz < toZ; iz++) {
                for (let ix = originX; ix < originX + N; ix++) this.scan(ix, iz);
            }

            for (let k = 0; k < SHELTER_ROWS; k++) {

                const iz = originZ + this.row;

                for (let ix = originX; ix < originX + N; ix++) this.scan(ix, iz);

                this.row = (this.row + 1) % N;

            }

        }

        this.originX = originX;
        this.originZ = originZ;
        this.texture.needsUpdate = true;

    }


    // Wysokość dachu nad kolumną (x, z) - z mapy (0, gdy nic nie wiadomo).

    roof(x, z) {

        const ix = Math.floor(x);
        const iz = Math.floor(z);

        if (this.originX === null || ix < this.originX || iz < this.originZ ||
            ix >= this.originX + SHELTER_SIZE || iz >= this.originZ + SHELTER_SIZE) {
            return 0;
        }

        return this.data[(mod(iz, SHELTER_SIZE) * SHELTER_SIZE + mod(ix, SHELTER_SIZE)) * 2];

    }


    // Jak bardzo punkt (x, y, z) jest osłonięty od deszczu, 0-1: udział
    // kolumn w promieniu 3 bloków, które mają dach nad tą wysokością.
    // Pod gołym niebem 0, w głębi domu albo jaskini 1, w drzwiach pośrodku.

    cover(x, y, z) {

        if (this.originX === null) {
            return 0;
        }

        let covered = 0;
        let count = 0;

        for (let dz = -3; dz <= 3; dz++) {
            for (let dx = -3; dx <= 3; dx++) {

                if (dx * dx + dz * dz > 10) continue;

                count++;

                if (this.roof(x + dx, z + dz) > y + 0.5) covered++;

            }
        }

        return covered / count;

    }


    dispose() {

        this.texture.dispose();
        this.world = null;

    }

}


// Wspólne dla kropel i rozprysków.

export const RAIN_COMMON_GLSL = /* glsl */ `
    attribute vec4 aSeed;
    uniform vec3 uRainCamera;
    uniform vec3 uRainBox;
    uniform sampler2D uRainShelter;

    // Miejsce w pudełku, które wędruje razem z kamerą: punkt stoi
    // w świecie, a gdy pudełko go minie, wraca z drugiej strony.
    vec3 rainWrap(vec3 p) {
        return mod(p - uRainCamera + uRainBox * 0.5, uRainBox) - uRainBox * 0.5 + uRainCamera;
    }

    vec2 rainShelter(vec2 xz) {
        return texture2D(uRainShelter, (floor(xz) + 0.5) / ${SHELTER_SIZE.toFixed(1)}).rg * 255.0;
    }
`;


export class RainStreaks {

    constructor(scene, world) {

        this.scene = scene;
        this.shelter = new RainShelter(world);

        this.amount = 1;
        this.intensity = 0;
        this.disposed = false;

        // Wspólne przesunięcie wszystkich kropel (rośnie z prędkością
        // deszczu; trzymane w zakresie, w którym zawinięcie nie przesuwa
        // kropel - 10 pudełek, bo krople mają prędkości co 0,1).
        this.offset = new THREE.Vector3();
        this.velocity = new THREE.Vector3(0, -12, 0);
        this.clock = 0;

        const box = new THREE.Vector3(RAIN_STREAKS.radius * 2, RAIN_STREAKS.height, RAIN_STREAKS.radius * 2);

        this.uniforms = {
            uRainCamera: { value: new THREE.Vector3() },
            uRainBox: { value: box },
            uRainOffset: { value: this.offset },
            uRainFall: { value: this.velocity },
            // x długość, y szerokość, z krycie, w promień pudełka.
            uRainShape: { value: new THREE.Vector4(0.6, 0.02, 0.4, RAIN_STREAKS.radius) },
            uRainColor: { value: new THREE.Color(0.75, 0.82, 0.9) },
            uRainTime: { value: 0 },
            uRainShelter: { value: this.shelter.texture },
            uUnderwater: viewUniforms.uUnderwater
        };

        const seeds = (count) => {

            const data = new Float32Array(count * 4);

            // Zawsze te same krople (prosty generator), żeby obraz dało
            // się porównywać między uruchomieniami.
            let state = 0x2545f491;

            for (let i = 0; i < data.length; i++) {
                state = (Math.imul(state, 1664525) + 1013904223) | 0;
                data[i] = (state >>> 0) / 4294967296;
            }

            return new THREE.InstancedBufferAttribute(data, 4);

        };

        const quad = (count) => {

            const geometry = new THREE.InstancedBufferGeometry();

            geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
            geometry.setIndex([0, 1, 2, 0, 2, 3]);
            geometry.setAttribute('aSeed', seeds(count));
            geometry.instanceCount = 0;

            return geometry;

        };

        // --- Krople -------------------------------------------------

        this.streakGeometry = quad(RAIN_STREAKS.streaks);

        this.streakMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform vec3 uRainOffset;
                uniform vec3 uRainFall;
                uniform vec4 uRainShape;
                varying float vAlpha;
                varying float vAlong;

                void main() {

                    // Pięć prędkości - sąsiednie krople się mijają.
                    float speed = 0.8 + 0.1 * floor(aSeed.w * 5.0);
                    vec3 p = rainWrap(aSeed.xyz * uRainBox + uRainOffset * speed);

                    // Smuga leży wzdłuż lotu kropli i jest zwrócona do kamery.
                    vec3 dir = normalize(uRainFall);
                    vec3 toCamera = uRainCamera - p;
                    vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5));
                    float distanceToEye = length(toCamera);
                    float nearDownpour = (1.0 - smoothstep(3.0, 13.0, distanceToEye))
                        * smoothstep(0.28, 0.85, uRainShape.x);
                    float streakLength = uRainShape.x * speed * (1.0 - 0.52 * nearDownpour);
                    vec3 world = p - dir * (streakLength * position.y) + side * (position.x * uRainShape.y);

                    // Pod dachem kropli nie ma; przy brzegu pudełka i tuż
                    // przed twarzą znika łagodnie.
                    float roof = rainShelter(p.xz).r;
                    float edge = 1.0 - smoothstep(uRainShape.w * 0.72, uRainShape.w, length(toCamera.xz));

                    vAlpha = uRainShape.z * edge * step(roof, p.y) * smoothstep(1.2, 4.0, distanceToEye)
                        * (1.0 - 0.32 * nearDownpour);
                    vAlong = position.y;

                    gl_Position = vAlpha > 0.002
                        ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                        : vec4(2.0, 2.0, 2.0, 1.0);

                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uRainColor;
                uniform float uUnderwater;
                varying float vAlpha;
                varying float vAlong;

                void main() {

                    if (uUnderwater > 0.5) discard;

                    // Jasny dół kropli, ogon gaśnie ku górze.
                    gl_FragColor = vec4(uRainColor, vAlpha * (1.0 - vAlong * vAlong));

                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>

                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.streaks = new THREE.Mesh(this.streakGeometry, this.streakMaterial);
        this.streaks.name = 'Rain streaks';
        this.streaks.frustumCulled = false;
        this.streaks.renderOrder = 4;
        this.streaks.visible = false;

        // --- Rozpryski na ziemi ---------------------------------------

        this.splashGeometry = quad(RAIN_STREAKS.splashes);

        this.splashMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: /* glsl */ `
                ${RAIN_COMMON_GLSL}
                uniform float uRainTime;
                uniform vec4 uRainShape;
                varying float vAlpha;
                varying vec2 vSpot;

                void main() {

                    // Każdy rozprysk żyje ułamek sekundy, po czym pojawia
                    // się w nowym miejscu.
                    float clock = uRainTime * (2.6 + 1.8 * aSeed.w) + aSeed.z * 31.0;
                    float life = fract(clock);
                    float turn = floor(clock);
                    vec2 spot = fract(aSeed.xy + turn * vec2(0.6180339, 0.7548776));
                    vec3 p = rainWrap(vec3(spot.x * uRainBox.x, 0.0, spot.y * uRainBox.z));
                    vec2 shelter = rainShelter(p.xz);

                    p.y = shelter.r + 0.02;

                    float size = mix(0.05, 0.26, life);
                    vec3 world = p + vec3((position.x) * size, 0.0, (position.y - 0.5) * size);
                    float edge = 1.0 - smoothstep(uRainShape.w * 0.6, uRainShape.w * 0.95, length(p.xz - uRainCamera.xz));

                    // Nie na wodzie (tam są kręgi), nie tam, gdzie nic nie
                    // wiadomo, i nie daleko nad albo pod graczem.
                    vAlpha = (1.0 - life) * edge * step(0.5, shelter.r) * step(shelter.g, 0.5)
                        * step(abs(p.y - uRainCamera.y), 20.0) * min(1.0, uRainShape.z * 1.6);
                    vSpot = vec2(position.x, position.y - 0.5) * 2.0;

                    gl_Position = vAlpha > 0.002
                        ? projectionMatrix * viewMatrix * vec4(world, 1.0)
                        : vec4(2.0, 2.0, 2.0, 1.0);

                }
            `,
            fragmentShader: /* glsl */ `
                uniform vec3 uRainColor;
                uniform float uUnderwater;
                varying float vAlpha;
                varying vec2 vSpot;

                void main() {

                    if (uUnderwater > 0.5) discard;

                    // Pierścień z grubych pikseli.
                    vec2 q = (floor(vSpot * 4.0) + 0.5) / 4.0;
                    float r = length(q);
                    float ring = step(0.45, r) * step(r, 0.95);

                    if (ring < 0.5) discard;

                    gl_FragColor = vec4(uRainColor, vAlpha * 0.8);

                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>

                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        this.splashes = new THREE.Mesh(this.splashGeometry, this.splashMaterial);
        this.splashes.name = 'Rain splashes';
        this.splashes.frustumCulled = false;
        this.splashes.renderOrder = 4;
        this.splashes.visible = false;

        scene.add(this.streaks, this.splashes);

    }


    get limit() {

        return this.amount <= 0 ? 0 : this.amount <= 0.35 ? RAIN_STREAKS.potatoStreaks : RAIN_STREAKS.streaks;

    }


    setAmount(value) {

        this.amount = Number.isFinite(value) ? Math.max(0, value) : 0;

    }


    // Kształt deszczu z natężenia (0-1) i tego, czy to mżawka (niska,
    // cienka chmura) - długość i szerokość kropli, prędkość, gęstość.

    static shape(intensity, drizzle) {

        const r = clamp01(intensity);
        const heavy = 1 - drizzle;

        return {
            length: 0.14 * drizzle + heavy * (0.4 + 0.6 * r),
            width: 0.01 * drizzle + heavy * (0.009 + 0.006 * r),
            fall: 5 * drizzle + heavy * (11 + 10 * r),
            alpha: 0.4 * drizzle + heavy * (0.3 + 0.2 * r),
            density: clamp01(0.55 * drizzle + heavy * (0.12 + 0.88 * r ** 0.8))
        };

    }


    // dt - czas klatki, camera - kamera gracza, intensity - natężenie
    // deszczu 0-1, drizzle - 0-1 (mżawka), wind - wiatr { x, z },
    // sky - stan nieba (jasność kropel).

    update(dt, camera, intensity, drizzle, wind, sky = null) {

        if (this.disposed) return;

        const position = camera.position;
        const step = Math.min(0.1, Math.max(0, Number.isFinite(dt) ? dt : 0));

        this.intensity = clamp01(intensity) * (this.limit > 0 ? 1 : 0);

        // Mapa schronienia żyje zawsze - potrzebuje jej też dźwięk
        // (czy gracz stoi pod dachem), a deszcz może zacząć padać w każdej
        // chwili.
        this.shelter.update(position.x, position.z);

        const shape = RainStreaks.shape(this.intensity, clamp01(drizzle));

        // Krople lecą w dół i z wiatrem.
        this.velocity.set((wind?.x ?? 0) * 0.9, -shape.fall, (wind?.z ?? 0) * 0.9);

        const box = this.uniforms.uRainBox.value;

        this.offset.x = mod(this.offset.x + this.velocity.x * step, box.x * 10);
        this.offset.y = mod(this.offset.y + this.velocity.y * step, box.y * 10);
        this.offset.z = mod(this.offset.z + this.velocity.z * step, box.z * 10);

        this.clock = (this.clock + step) % 1000;

        this.uniforms.uRainTime.value = this.clock;
        this.uniforms.uRainCamera.value.copy(position);
        this.uniforms.uRainShape.value.set(shape.length, shape.width, shape.alpha, RAIN_STREAKS.radius);

        // Krople nie świecą: nocą i pod ciemną chmurą ciemnieją razem
        // z niebem.
        const light = sky ? 0.2 + 0.8 * (sky.daylight ?? 1) : 1;

        if (sky?.horizon) {
            this.uniforms.uRainColor.value.copy(sky.horizon).lerp(WHITE, 0.35).multiplyScalar(light * 0.9);
        }

        const active = this.intensity > 0.01;
        const splashLimit = this.amount <= 0.35 ? RAIN_STREAKS.potatoSplashes : RAIN_STREAKS.splashes;

        this.streakGeometry.instanceCount = active ? Math.round(this.limit * shape.density) : 0;
        this.splashGeometry.instanceCount = active ? Math.round(splashLimit * clamp01(0.25 + this.intensity) * (1 - 0.6 * clamp01(drizzle))) : 0;
        this.streaks.visible = this.streakGeometry.instanceCount > 0;
        this.splashes.visible = this.splashGeometry.instanceCount > 0;

    }


    stats() {

        return {
            intensity: this.intensity,
            streaks: this.streakGeometry.instanceCount,
            splashes: this.splashGeometry.instanceCount,
            draws: Number(this.streaks.visible) + Number(this.splashes.visible)
        };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.streaks, this.splashes);
        this.streakGeometry.dispose();
        this.splashGeometry.dispose();
        this.streakMaterial.dispose();
        this.splashMaterial.dispose();
        this.shelter.dispose();

    }

}

const WHITE = new THREE.Color(1, 1, 1);
