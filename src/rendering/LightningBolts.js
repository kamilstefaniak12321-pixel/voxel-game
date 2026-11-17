import * as THREE from 'three';

import { weatherHash } from '../weather/WeatherField.js';
import { viewUniforms } from './viewUniforms.js';

// ------------------------------------------------------------
// PIORUNY: KANAŁ WYŁADOWANIA (1.13.0)
//
// Piorun bijący w ziemię to łamana z kilkunastu odcinków od podstawy
// chmury do ziemi, z kilkoma odnogami, które gasną w powietrzu. Odcinki
// biegną prosto w dół albo skosem pod stałym kątem - kanciasto, jak
// wszystko w tym świecie. Kształt wynika z ziarna wyładowania
// (weather/Thunderstorm.js), więc wszyscy gracze widzą ten sam piorun.
//
// Rysowanie: jedna siatka z kopiami prostokąta (po jednej na odcinek),
// zawsze zwrócona do kamery. Szerokość kanału jest stała na ekranie
// (niecały stopień, dalej niż kilometr - połowa tego), a nie w świecie:
// piorun widać z kilku kilometrów, a z bliska nie jest grubą rurą.
// Rysuje się w dwóch przebiegach, bo gra też rysuje świat w dwóch:
//   - daleki (renderFar - po dalekim terenie, jego kamerą): to, co dalej
//     niż zasięg bliskiego świata; góry zasłaniają piorun za nimi,
//   - bliski (w scenie świata): to, co bliżej.
// Gdy nie ma pioruna, nie rysuje się nic.
// ------------------------------------------------------------

export const LIGHTNING = Object.freeze({
    // Ile piorunów naraz i ile odcinków na jeden.
    bolts: 4, segments: 44,
    // Szerokość kanału z poświatą: najmniejsza w świecie (bloki) i na
    // ekranie (piksele) oraz kątowa - z bliska i z daleka (radiany).
    width: 0.5, pixels: 2.2, near: 0.0145, far: 0.0062,
    // Jak daleko od środka chmury może zaczynać się kanał (bloki).
    spread: 46
});

const SALT = 0x6a09e667;


// Odcinki pioruna od `top` do `ground` ({ x, y, z }). emit(x0, y0, z0,
// x1, y1, z1, szerokość 0-1, jasność 0-1) dostaje każdy odcinek; zwraca,
// ile ich było. limit - ile najwyżej.

export function buildBolt(seed, top, ground, emit, limit = LIGHTNING.segments) {

    const roll = (a, b) => weatherHash(seed, a, b, SALT);
    const height = Math.max(8, top.y - ground.y);
    const steps = Math.max(8, Math.min(18, Math.round(height / 13)));
    const drop = height / steps;
    const jog = drop * 0.8;

    const points = [];

    let count = 0;
    let x = top.x;
    let y = top.y;
    let z = top.z;

    points.push(x, y, z);

    // Kanał główny: w każdym kroku w dół i - losowo - prosto albo skosem;
    // przy okazji stopniowo trafia w cel.

    for (let k = 0; k < steps && count < limit; k++) {

        const left = steps - k;
        const last = k === steps - 1;
        const nx = last ? ground.x : x + (ground.x - x) / left + (Math.floor(roll(k, 1) * 3) - 1) * jog;
        const nz = last ? ground.z : z + (ground.z - z) / left + (Math.floor(roll(k, 2) * 3) - 1) * jog;
        const ny = last ? ground.y : y - drop;

        emit(x, y, z, nx, ny, nz, 1, 1);
        count++;

        x = nx;
        y = ny;
        z = nz;

        points.push(x, y, z);

    }

    // Odnogi: z górnych dwóch trzecich kanału, w dół i w bok, coraz
    // cieńsze i ciemniejsze.

    const branches = 2 + Math.floor(roll(90, 1) * 3);

    for (let b = 0; b < branches && count < limit; b++) {

        const from = 1 + Math.floor(roll(100 + b, 1) * Math.max(1, steps * 0.66));
        const angle = roll(100 + b, 2) * Math.PI * 2;
        const length = 3 + Math.floor(roll(100 + b, 3) * 4);
        const ax = Math.cos(angle);
        const az = Math.sin(angle);

        let bx = points[from * 3];
        let by = points[from * 3 + 1];
        let bz = points[from * 3 + 2];

        for (let k = 0; k < length && count < limit; k++) {

            const side = (Math.floor(roll(200 + b * 16 + k, 1) * 3) - 1) * jog * 0.6;
            const out = jog * (0.7 + 0.8 * roll(200 + b * 16 + k, 2));
            const nx = bx + ax * out - az * side;
            const nz = bz + az * out + ax * side;
            const ny = Math.max(ground.y + 2, by - drop * (0.45 + 0.5 * roll(200 + b * 16 + k, 3)));
            const fade = 1 - k / length;

            emit(bx, by, bz, nx, ny, nz, 0.42 + 0.2 * fade, 0.3 + 0.4 * fade);
            count++;

            bx = nx;
            by = ny;
            bz = nz;

        }

    }

    return count;

}


// Skąd w chmurze wychodzi kanał pioruna (trochę obok miejsca uderzenia).

export function boltTop(strike) {

    return {
        x: strike.x + (weatherHash(strike.seed, 1, 7, SALT) - 0.5) * 2 * LIGHTNING.spread,
        y: strike.topY,
        z: strike.z + (weatherHash(strike.seed, 2, 7, SALT) - 0.5) * 2 * LIGHTNING.spread
    };

}


const VERTEX = /* glsl */ `
    attribute vec3 aStart;
    attribute vec3 aEnd;
    attribute vec3 aShape;      // x szerokość, y jasność, z numer pioruna

    uniform float uBoltLevel[${LIGHTNING.bolts}];
    uniform vec2 uBoltSize;     // x najmniejsza szerokość (bloki), y kąt najmniejszej szerokości
    uniform float uBoltFar;     // 1 - przebieg daleki

    varying float vAcross;
    varying float vLevel;
    varying float vDepth;

    void main() {

        vec3 dir = aEnd - aStart;
        float len = max(length(dir), 1e-4);

        dir /= len;

        vec3 base = mix(aStart, aEnd, position.y);
        vec3 toCamera = cameraPosition - base;
        float range = length(toCamera);
        vec3 side = normalize(cross(dir, toCamera) + vec3(1e-5, 0.0, 0.0));
        float angular = mix(${LIGHTNING.near}, ${LIGHTNING.far}, smoothstep(400.0, 2200.0, range));
        float width = max(max(uBoltSize.x, range * angular) * (0.4 + 0.6 * aShape.x), range * uBoltSize.y);

        // Końce odcinka trochę dłuższe - łamana bez szpar w załamaniach.
        vec3 world = base + dir * ((position.y - 0.5) * width * 0.5) + side * (position.x * width);

        vAcross = position.x * 2.0;
        vLevel = uBoltLevel[int(aShape.z + 0.5)] * aShape.y;

        vec4 view = viewMatrix * vec4(world, 1.0);

        vDepth = -view.z;

        gl_Position = projectionMatrix * view;

        // Dalej niż koniec zasięgu kamery dalekiego terenu: na samym
        // końcu (zamiast zniknąć).
        if (uBoltFar > 0.5) {
            gl_Position.z = min(gl_Position.z, gl_Position.w * 0.99999);
        }

        if (vLevel <= 0.003) {
            gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }

    }
`;

const FRAGMENT = /* glsl */ `
    uniform vec3 uBoltGlow;
    uniform vec2 uBoltClip;     // rysuj tylko między tymi odległościami od kamery
    uniform float uUnderwater;

    varying float vAcross;
    varying float vLevel;
    varying float vDepth;

    void main() {

        if (uUnderwater > 0.5 || vDepth < uBoltClip.x || vDepth > uBoltClip.y) discard;

        // Biały rdzeń i sina poświata po bokach - z ostrą granicą.
        float across = abs(vAcross);
        float core = step(across, 0.4);

        // Kanał świeci pełnym blaskiem, póki błysk trwa (gaśnie dopiero
        // na samym końcu) - inaczej w dzień nie byłoby go widać.
        float alpha = min(1.0, vLevel * 7.0) * mix(0.5 * (1.0 - across), 1.0, core);

        // Mgiełka: bardzo daleki piorun blednie.
        alpha *= exp(-vDepth / 9000.0);

        if (alpha <= 0.004) discard;

        gl_FragColor = vec4(mix(uBoltGlow, vec3(1.0), core), alpha);

        #include <tonemapping_fragment>
        #include <colorspace_fragment>

    }
`;


export class LightningBolts {

    constructor(scene) {

        this.scene = scene;
        this.disposed = false;

        const capacity = LIGHTNING.bolts * LIGHTNING.segments;

        this.start = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        this.end = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        this.shape = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);

        for (const attribute of [this.start, this.end, this.shape]) {
            attribute.setUsage(THREE.DynamicDrawUsage);
        }

        this.geometry = new THREE.InstancedBufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0]), 3));
        this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
        this.geometry.setAttribute('aStart', this.start);
        this.geometry.setAttribute('aEnd', this.end);
        this.geometry.setAttribute('aShape', this.shape);
        this.geometry.instanceCount = 0;

        this.levels = new Array(LIGHTNING.bolts).fill(0);

        const shared = {
            uBoltLevel: { value: this.levels },
            uBoltSize: { value: new THREE.Vector2(LIGHTNING.width, 0.003) },
            uBoltGlow: { value: new THREE.Color(0.62, 0.7, 1.0) },
            uUnderwater: viewUniforms.uUnderwater
        };

        const material = (far) => new THREE.ShaderMaterial({
            uniforms: {
                ...shared,
                uBoltClip: { value: new THREE.Vector2(0, 1e9) },
                uBoltFar: { value: far ? 1 : 0 }
            },
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        this.uniforms = shared;
        this.nearMaterial = material(false);
        this.farMaterial = material(true);

        this.near = new THREE.Mesh(this.geometry, this.nearMaterial);
        this.near.name = 'Lightning (near)';
        this.near.frustumCulled = false;
        this.near.renderOrder = 5;
        this.near.visible = false;

        this.far = new THREE.Mesh(this.geometry, this.farMaterial);
        this.far.name = 'Lightning (far)';
        this.far.frustumCulled = false;

        this.farScene = new THREE.Scene();
        this.farScene.add(this.far);
        this.farCamera = new THREE.PerspectiveCamera(75, 1, 50, 20000);

        scene.add(this.near);

        // Które wyładowanie jest w którym miejscu bufora (klucz albo null).
        this.slots = new Array(LIGHTNING.bolts).fill(null);
        this.counts = new Array(LIGHTNING.bolts).fill(0);
        this.active = 0;

    }


    // strikes - wyładowania, które teraz błyskają (Thunderstorm.order,
    // od najjaśniejszego; każde ma level), camera - kamera gracza,
    // pixelAngle - kąt jednego piksela ekranu (radiany).

    update(strikes, camera, pixelAngle) {

        if (this.disposed) return;

        const slots = this.slots;
        const levels = this.levels;

        let changed = false;

        // Zgasłe pioruny zwalniają miejsce.

        for (let s = 0; s < slots.length; s++) {

            if (slots[s] !== null && !strikes.some((strike) => strike.ground && strike.key === slots[s])) {
                slots[s] = null;
                this.counts[s] = 0;
                changed = true;
            }

            levels[s] = 0;

        }

        for (const strike of strikes) {

            if (!strike.ground) continue;

            let slot = slots.indexOf(strike.key);

            if (slot < 0) {

                slot = slots.indexOf(null);

                if (slot < 0) continue;

                slots[slot] = strike.key;
                this.write(slot, strike);
                changed = true;

            }

            levels[slot] = strike.level;

        }

        if (changed) {

            // Bufor ma stałe miejsca na każdy piorun; puste odcinki mają
            // zerową jasność, więc rysuje się aż do ostatniego zajętego.

            let last = -1;

            for (let s = 0; s < slots.length; s++) {
                if (slots[s] !== null) last = s;
            }

            this.geometry.instanceCount = (last + 1) * LIGHTNING.segments;
            this.start.needsUpdate = true;
            this.end.needsUpdate = true;
            this.shape.needsUpdate = true;

        }

        this.active = levels.reduce((sum, level) => sum + (level > 0.003 ? 1 : 0), 0);
        this.near.visible = this.active > 0;

        this.uniforms.uBoltSize.value.y = pixelAngle * LIGHTNING.pixels;
        this.nearMaterial.uniforms.uBoltClip.value.set(0, 1e9);
        this.farMaterial.uniforms.uBoltClip.value.set(camera.far * 0.98, 1e9);

    }


    // Odcinki jednego pioruna do jego miejsca w buforze.

    write(slot, strike) {

        const offset = slot * LIGHTNING.segments;
        const start = this.start.array;
        const end = this.end.array;
        const shape = this.shape.array;

        let k = offset;

        const count = buildBolt(strike.seed, boltTop(strike), { x: strike.x, y: strike.groundY, z: strike.z },
            (x0, y0, z0, x1, y1, z1, width, bright) => {

                start[k * 3] = x0;
                start[k * 3 + 1] = y0;
                start[k * 3 + 2] = z0;
                end[k * 3] = x1;
                end[k * 3 + 1] = y1;
                end[k * 3 + 2] = z1;
                shape[k * 3] = width;
                shape[k * 3 + 1] = bright;
                shape[k * 3 + 2] = slot;
                k++;

            });

        for (let i = offset + count; i < offset + LIGHTNING.segments; i++) {
            shape[i * 3 + 1] = 0;
            shape[i * 3 + 2] = slot;
        }

        this.counts[slot] = count;

    }


    // Przebieg daleki - po dalekim terenie (i jego kamerą, żeby góry
    // zasłaniały piorun za nimi), przed bliskim światem.

    renderFar(renderer, camera, farTerrain = null) {

        if (this.disposed || this.active === 0) {
            return;
        }

        let farCamera = farTerrain?.active && farTerrain.shown?.size > 0 ? farTerrain.camera : null;

        if (!farCamera) {

            farCamera = this.farCamera;

            camera.getWorldPosition(farCamera.position);
            camera.getWorldQuaternion(farCamera.quaternion);

            farCamera.fov = camera.fov;
            farCamera.aspect = camera.aspect;
            farCamera.near = Math.max(1, camera.far * 0.5);
            farCamera.updateProjectionMatrix();
            farCamera.updateMatrixWorld();

        }

        renderer.render(this.farScene, farCamera);

    }


    stats() {

        return {
            bolts: this.active,
            segments: this.counts.reduce((sum, count) => sum + count, 0),
            draws: this.active > 0 ? 2 : 0
        };

    }


    dispose() {

        if (this.disposed) return;

        this.disposed = true;
        this.scene.remove(this.near);
        this.geometry.dispose();
        this.nearMaterial.dispose();
        this.farMaterial.dispose();

    }

}
