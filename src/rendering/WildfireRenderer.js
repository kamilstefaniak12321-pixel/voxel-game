// ------------------------------------------------------------
// OBRAZ POŻARU (1.43.0, docs/pozar.md)
//
// Stan: game/Wildfire.js (flames: klucz -> { x, y, z, radius, height,
// left } - to samo dostają goście w grze ze znajomymi).
//
// Płonąca korona to cząsteczki - kwadratowe piksele jak iskry ogniska:
//   - płomienie: jasne, świecące, lecą w górę i gasną (żółty -> czerwony),
//   - iskry: drobne, niesie je wiatr,
//   - dym: szare kłęby nad koroną, rosną i znoszą się z wiatrem.
// Jedna siatka punktów na cały pożar (PARTICLES sztuk), bez świateł
// i bez zmian w chunkach. Im dalej od gracza i im więcej drzew płonie,
// tym mniej cząsteczek na drzewo - koszt jest stały.
// ------------------------------------------------------------

import * as THREE from 'three';
import { lightingUniforms } from './LightingDiagnostics.js';

export const PARTICLES = 1400;
// Z jak daleka widać pożar (bloki) i ile cząsteczek na sekundę daje
// jedno drzewo tuż obok.
export const FIRE_VIEW_RANGE = 160;
const FLAME_RATE = 90, SMOKE_RATE = 9, SPARK_RATE = 6;
// Najwyżej tyle cząsteczek na sekundę ze wszystkich drzew razem.
const TOTAL_RATE = 900;

const FLAME = 0, SPARK = 1, SMOKE = 2;

// Kolor płomienia z wiekiem (0-1): biały żar -> żółty -> pomarańcz -> czerwień.
export function flameColor(age) {
    if (age < 0.25) return [1, 0.95, 0.62 + (0.25 - age) * 1.2];
    if (age < 0.6) return [1, 0.9 - (age - 0.25) * 1.3, 0.25 - (age - 0.25) * 0.5];
    return [1 - (age - 0.6) * 0.9, 0.44 - (age - 0.6) * 0.8, 0.08];
}

export class WildfireRenderer {

    constructor(game, fire) {
        this.game = game;
        this.fire = fire;
        this.particles = Array.from({ length: PARTICLES }, () => ({ life: 0 }));
        this.next = 0;
        this.alive = 0;
        this.debt = new Map();
        this.random = Math.random;
        const geometry = this.geometry = new THREE.BufferGeometry();
        this.position = new Float32Array(PARTICLES * 3);
        this.color = new Float32Array(PARTICLES * 4);
        this.size = new Float32Array(PARTICLES);
        this.emission = new Float32Array(PARTICLES);
        geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('particleEmission', new THREE.BufferAttribute(this.emission, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setDrawRange(0, 0);
        this.material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { uPixelScale: { value: 700 }, uLightingNatural: lightingUniforms.uLightingNatural, uLightingLocal: lightingUniforms.uLightingLocal },
            vertexShader: `attribute vec4 particleColor; attribute float particleSize; attribute float particleEmission;
                varying vec4 vColor; varying float vEmission; uniform float uPixelScale;
                void main() { vColor = particleColor; vEmission = particleEmission; vec4 p = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * p; gl_PointSize = clamp(particleSize * uPixelScale / max(.1, -p.z), 1.0, 220.0); }`,
            fragmentShader: `varying vec4 vColor; varying float vEmission;
                uniform float uLightingNatural; uniform vec2 uLightingLocal;
                void main() {
                vec2 p = abs(gl_PointCoord - .5); if (max(p.x, p.y) > .48 || (p.x > .31 && p.y > .31)) discard;
                vec3 source = vColor.rgb;
                if (uLightingNatural > .5) source = mix(source / 12.92, pow((source + .055) / 1.055, vec3(2.4)), step(vec3(.04045), source));
                // Płomienie i iskry świecą same; dym bierze światło otoczenia.
                vec3 value = source * (vEmission > .5 ? uLightingLocal.y : uLightingLocal.x);
                gl_FragColor = vec4(value, vColor.a);
                if (uLightingNatural > .5) {
                    #include <colorspace_fragment>
                }
            }`
        });
        this.points = new THREE.Points(geometry, this.material);
        this.points.frustumCulled = false;
        this.points.visible = false;
        game.scene.add(this.points);
    }

    emit(kind, flame, wind) {
        // Zajęte miejsce nadpisujemy po kolei: najstarsze znikają pierwsze.
        const particle = this.particles[this.next];
        this.next = (this.next + 1) % PARTICLES;
        const random = this.random;
        const angle = random() * Math.PI * 2, reach = Math.sqrt(random()) * flame.radius;
        const up = random();
        particle.kind = kind;
        particle.x = flame.x + 0.5 + Math.cos(angle) * reach;
        particle.z = flame.z + 0.5 + Math.sin(angle) * reach;
        if (kind === SMOKE) {
            particle.y = flame.y + flame.height * (0.6 + 0.5 * up);
            particle.life = particle.max = 3.5 + random() * 2.5;
            particle.vx = wind.x * 0.55 + (random() - 0.5) * 0.5; particle.vz = wind.z * 0.55 + (random() - 0.5) * 0.5;
            particle.vy = 1.8 + random() * 1.4;
            particle.grow = 1.6 + random() * 1.4;
            particle.shade = 0.22 + random() * 0.2;
        }
        else {
            // Płomienie gęściej na dole korony i wzdłuż pnia.
            particle.y = flame.y + 0.5 + flame.height * up * up * 0.95;
            const spark = kind === SPARK;
            particle.life = particle.max = spark ? 1.2 + random() * 1.6 : 0.45 + random() * 0.6;
            particle.vx = wind.x * (spark ? 0.7 : 0.18) + (random() - 0.5) * (spark ? 1.6 : 0.5);
            particle.vz = wind.z * (spark ? 0.7 : 0.18) + (random() - 0.5) * (spark ? 1.6 : 0.5);
            particle.vy = spark ? 2.5 + random() * 3 : 1.4 + random() * 2.2;
            particle.grow = spark ? 0.07 : 0.55 + random() * 0.75;
        }
    }

    update(dt) {
        const flames = this.fire.flames;
        if (flames.size === 0 && this.alive === 0) { this.points.visible = false; return; }
        const game = this.game, camera = game.camera?.position ?? game.player?.pos ?? { x: 0, y: 0, z: 0 };
        const weatherWind = game.weather?.wind, wind = { x: weatherWind?.x ?? 0, z: weatherWind?.z ?? 0 };
        const step = Math.min(0.1, Math.max(0, dt));

        // Ile cząsteczek chce każde drzewo (bliższe - więcej).
        let wanted = 0;
        const shares = [];
        for (const [key, flame] of flames) {
            const distance = Math.hypot(flame.x - camera.x, flame.y - camera.y, flame.z - camera.z);
            if (distance > FIRE_VIEW_RANGE) continue;
            const near = Math.max(0.12, 1 - distance / FIRE_VIEW_RANGE);
            const volume = Math.min(2.2, 0.5 + flame.radius * flame.height / 40);
            const share = near * near * volume;
            shares.push([key, flame, share]);
            wanted += share * (FLAME_RATE + SMOKE_RATE + SPARK_RATE);
        }
        const scale = wanted > TOTAL_RATE ? TOTAL_RATE / wanted : 1;
        for (const [key, flame, share] of shares) {
            let debt = this.debt.get(key) ?? [0, 0, 0];
            const rates = [FLAME_RATE, SPARK_RATE, SMOKE_RATE];
            for (let kind = 0; kind < 3; kind++) {
                debt[kind] += rates[kind] * share * scale * step;
                while (debt[kind] >= 1) { debt[kind] -= 1; this.emit(kind, flame, wind); }
            }
            this.debt.set(key, debt);
        }
        if (this.debt.size > flames.size + 8) for (const key of [...this.debt.keys()]) if (!flames.has(key)) this.debt.delete(key);

        // Ruch i wygląd.
        let count = 0;
        for (const particle of this.particles) {
            if (particle.life <= 0) continue;
            particle.life -= step;
            if (particle.life <= 0) continue;
            particle.x += particle.vx * step; particle.y += particle.vy * step; particle.z += particle.vz * step;
            const age = 1 - particle.life / particle.max;
            let r, g, b, a, size, glow;
            if (particle.kind === SMOKE) {
                particle.vy *= 1 - 0.25 * step;
                r = g = b = particle.shade + 0.18 * age; a = 0.5 * (1 - age) * Math.min(1, age * 6);
                size = particle.grow * (0.6 + 1.6 * age); glow = 0;
            }
            else if (particle.kind === SPARK) {
                particle.vy -= 2.2 * step;
                [r, g, b] = flameColor(0.2 + age * 0.6); a = 1 - age * age;
                size = particle.grow; glow = 1;
            }
            else {
                [r, g, b] = flameColor(age); a = age < 0.75 ? 0.95 : 0.95 * (1 - (age - 0.75) * 4);
                size = particle.grow * (1 - 0.55 * age); glow = 1;
            }
            this.position.set([particle.x, particle.y, particle.z], count * 3);
            this.color.set([r, g, b, a], count * 4);
            this.size[count] = size;
            this.emission[count] = glow;
            count++;
        }
        this.alive = count;
        this.points.visible = count > 0;
        this.geometry.setDrawRange(0, count);
        if (count > 0) {
            for (const name of ['position', 'particleColor', 'particleSize', 'particleEmission']) this.geometry.getAttribute(name).needsUpdate = true;
            this.material.uniforms.uPixelScale.value = game.renderer?.domElement?.height ?? 700;
        }
    }

    dispose() {
        this.points.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }

}
