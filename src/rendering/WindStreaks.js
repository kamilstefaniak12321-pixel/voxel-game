import * as THREE from 'three';

import { viewUniforms } from './viewUniforms.js';

// ------------------------------------------------------------
// SMUGI WIATRU (0.82.0, pomysł Kamila)
//
// Delikatne, półprzezroczyste białe kreski płynące z wiatrem
// (AmbientWind.js) wokół gracza - tylko na otwartym powietrzu (pełne
// światło nieba), nie pod wodą. Każda smuga to kilka odcinków lekko
// falującej linii: pojawia się, przelatuje i znika (przezroczystość
// rośnie od ogona do głowy). Więcej przy porywach, w nocy ciemniejsze.
// Jedno rysowanie (LineSegments), bez tworzenia obiektów co klatkę.
// ------------------------------------------------------------

export const WIND_STREAKS = Object.freeze({ max: 24, segments: 6, radius: [5, 18], height: [0.6, 7] });

// Ile smug na sekundę (bez porywu i w porywie).
const RATE = [0.8, 4.5];
const random = (min, max) => min + Math.random() * (max - min);


export class WindStreaks {

    constructor(scene, world) {

        this.world = world;
        this.streaks = [];
        this.budget = 0;
        this.amount = 1;
        this.enabled = true;

        const vertices = WIND_STREAKS.max * WIND_STREAKS.segments * 2;

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3)
            .setUsage(THREE.DynamicDrawUsage));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertices * 4), 4)
            .setUsage(THREE.DynamicDrawUsage));
        this.geometry.setDrawRange(0, 0);

        this.material = new THREE.LineBasicMaterial({ transparent: true, vertexColors: true, depthWrite: false, fog: true });
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uUnderwater = viewUniforms.uUnderwater;
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform float uUnderwater;')
                .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (uUnderwater > 0.5) discard;');
        };
        this.material.customProgramCacheKey = () => 'wind-streaks-v1';

        this.mesh = new THREE.LineSegments(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 3;
        scene.add(this.mesh);

    }


    setEnabled(on) {
        this.enabled = Boolean(on);
        if (!this.enabled) this.streaks.length = 0;
    }

    setAmount(amount) {
        this.amount = Math.max(0, amount);
    }


    // Nowa smuga gdzieś wokół gracza, na otwartym powietrzu.

    spawn(player, wind) {

        const angle = Math.random() * Math.PI * 2;
        const distance = random(...WIND_STREAKS.radius);

        // Startuje trochę "pod wiatr", żeby przeleciała przed graczem.
        const x = player.pos.x + Math.cos(angle) * distance - wind.x * 1.5;
        const z = player.pos.z + Math.sin(angle) * distance - wind.z * 1.5;
        const ground = this.world.getSurfaceY?.(Math.floor(x), Math.floor(z));
        const base = Number.isFinite(ground) ? Math.max(ground + 1, player.pos.y - 3) : player.pos.y;
        const y = base + random(...WIND_STREAKS.height);

        // Tylko pod gołym niebem (nie w jaskini i nie w lesie pod koroną).
        if (this.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z)).sky < 14) return;

        this.streaks.push({
            x, y, z,
            age: 0,
            life: random(1.4, 2.6),
            length: random(1.6, 3.2),
            speed: random(1.4, 2.2),
            wave: random(0.05, 0.16),
            phase: Math.random() * Math.PI * 2,
            alpha: random(0.25, 0.42)
        });

    }


    update(dt, player, wind, daylight = 1) {

        if (this.enabled && this.amount > 0 && player && wind) {

            this.budget += (RATE[0] + (RATE[1] - RATE[0]) * wind.gust) * this.amount * Math.min(dt, 0.1);

            for (; this.budget >= 1; this.budget--) {
                if (this.streaks.length < WIND_STREAKS.max) this.spawn(player, wind);
            }

        }

        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;
        const segments = WIND_STREAKS.segments;
        const speed = wind ? Math.max(0.3, wind.speed) : 1;
        const dirX = wind ? wind.x / speed : 1, dirZ = wind ? wind.z / speed : 0;
        // W nocy smugi ciemne (prawie niewidoczne), w dzień jasne.
        const shade = 0.25 + 0.75 * Math.max(0, Math.min(1, daylight));
        let v = 0;

        for (let i = this.streaks.length - 1; i >= 0; i--) {

            const s = this.streaks[i];

            s.age += dt;

            if (s.age >= s.life) {
                this.streaks.splice(i, 1);
                continue;
            }

            s.x += dirX * speed * s.speed * dt;
            s.z += dirZ * speed * s.speed * dt;

            const t = s.age / s.life;
            // Pojawia się i znika; w środku życia najdłuższa.
            const envelope = Math.sin(Math.PI * t);
            const length = s.length * (0.4 + 0.6 * envelope);

            for (let k = 0; k < segments; k++) {
                for (const end of [k, k + 1]) {
                    const along = end / segments;
                    const back = (1 - along) * length;
                    const wave = Math.sin(along * 5 + s.phase + s.age * 3) * s.wave;
                    positions[v * 3] = s.x - dirX * back - dirZ * wave;
                    positions[v * 3 + 1] = s.y + Math.sin(along * 3.3 + s.phase) * s.wave * 0.6;
                    positions[v * 3 + 2] = s.z - dirZ * back + dirX * wave;
                    colors[v * 4] = shade;
                    colors[v * 4 + 1] = shade;
                    colors[v * 4 + 2] = shade;
                    // Ogon przezroczysty, głowa najmocniejsza.
                    colors[v * 4 + 3] = s.alpha * envelope * along ** 1.5;
                    v++;
                }
            }

        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.setDrawRange(0, v);

    }


    get count() {
        return this.streaks.length;
    }


    dispose() {
        this.mesh.removeFromParent();
        this.geometry.dispose();
        this.material.dispose();
    }

}
