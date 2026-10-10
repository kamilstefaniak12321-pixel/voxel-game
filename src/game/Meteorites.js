import * as THREE from 'three';

import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    DAY_LENGTH_MINUTES,
    METEORITES_PER_NIGHT
} from '../config.js';

import {
    createGlowSprite,
    getGlowTexture
} from '../rendering/Glow.js';

// ------------------------------------------------------------
// METEORYTY SPADAJĄCE NA ZIEMIĘ
//
// W ciemną noc co jakiś czas (METEORITES_PER_NIGHT w config.js)
// z nieba spada meteoryt:
//   1. kula ognia z warkoczem przelatuje przez niebo i oświetla
//      teren pod sobą (dynamiczne światło),
//   2. uderza 18-40 bloków od gracza i robi mały krater,
//   3. błysk przy uderzeniu, a na dnie krateru zostaje żarzący się
//      blok meteorytu. Na czacie pojawia się, gdzie spadł.
//
// Meteoryt nigdy nie spada w chunki zmieniane przez gracza (żeby
// nie zniszczyć budowli). Komenda /meteor zrzuca go od razu.
// ------------------------------------------------------------

const FLIGHT_SECONDS = 3.2;

// Skąd przylatuje (odległość od miejsca upadku).

const START_DISTANCE = 140;

const TRAIL_POINTS = 48;

const CRATER_RADIUS = 3.2;

const FLASH_SECONDS = 2.2;


// Ile sekund trwa ciemna część nocy (do przeliczenia "na noc"
// na "na sekundę").

const DARK_NIGHT_SECONDS = DAY_LENGTH_MINUTES * 60 * 0.35;


const FIRE_COLOR = [1, 0.55, 0.2];
const FLASH_COLOR = [1, 0.82, 0.6];

const TRAIL_HOT = new THREE.Color('#ffd27a');
const TRAIL_COLD = new THREE.Color('#5a1a08');


export class Meteorites {

    // game - Game (świat, scena, gracz, niebo, komunikaty)

    constructor(game) {

        this.game = game;

        // Lecące meteoryty i błyski po uderzeniu.

        this.flying = [];
        this.flashes = [];

    }

    // --------------------------------------------------------
    // NOWY METEORYT
    // --------------------------------------------------------

    // Zrzuca meteoryt. landing - miejsce upadku (blok na powierzchni)
    // albo null = wybierz samemu w pobliżu gracza.
    // Zwraca meteoryt albo null, jeśli nie ma dobrego miejsca.

    spawn(landing = null) {

        const target = landing ?? this.findLandingSpot();

        if (!target) {
            return null;
        }


        // Nadlatuje z góry, pod kątem, z losowej strony.

        const angle = Math.random() * Math.PI * 2;

        const from = new THREE.Vector3(
            Math.cos(angle) * 0.75,
            0.66,
            Math.sin(angle) * 0.75
        ).normalize();

        const end = target.clone().add(new THREE.Vector3(0.5, 0.5, 0.5));

        const start = end.clone().addScaledVector(from, START_DISTANCE);


        // Kula ognia: jasny środek i większa pomarańczowa poświata.

        const core = createGlowSprite(new THREE.Color('#fff2c0'), 3);
        const halo = createGlowSprite(new THREE.Color('#ff7a20'), 10);

        halo.material.opacity = 0.6;


        // Warkocz: świecące punkty w miejscach, gdzie kula była przed chwilą.

        const trailGeometry = new THREE.BufferGeometry();

        trailGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));
        trailGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL_POINTS * 3), 3));

        const trail = new THREE.Points(
            trailGeometry,
            new THREE.PointsMaterial({
                map: getGlowTexture(),
                size: 4,
                vertexColors: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                transparent: true,
                fog: false
            })
        );

        trail.frustumCulled = false;


        const group = new THREE.Group();

        group.add(core, halo);

        this.game.scene.add(group, trail);


        const meteor = {
            start,
            end,
            landing: target,
            age: 0,
            group,
            trail,
            history: [],
            light: {
                position: start.clone(),
                color: FIRE_COLOR,
                strength: 15
            }
        };

        this.flying.push(meteor);

        return meteor;

    }


    // Miejsce na powierzchni 18-40 bloków od gracza, w chunkach,
    // których gracz nie zmieniał.

    findLandingSpot() {

        const world = this.game.world;
        const player = this.game.player.pos;


        for (let attempt = 0; attempt < 16; attempt++) {

            const angle = Math.random() * Math.PI * 2;
            const distance = 18 + Math.random() * 22;

            const x = Math.floor(player.x + Math.cos(angle) * distance);
            const z = Math.floor(player.z + Math.sin(angle) * distance);

            if (!this.areaUntouched(x, z)) {
                continue;
            }


            const y = world.getSurfaceY(x, z);

            if (y < 4 || y > CHUNK_HEIGHT - 6) {
                continue;
            }

            return new THREE.Vector3(x, y, z);

        }

        return null;

    }


    // Czy wszystkie chunki wokół krateru są wczytane i niezmienione.

    areaUntouched(x, z) {

        const world = this.game.world;

        const reach = Math.ceil(CRATER_RADIUS) + 2;

        for (const dx of [-reach, reach]) {

            for (const dz of [-reach, reach]) {

                const chunk = world.getChunk(
                    Math.floor((x + dx) / CHUNK_SIZE),
                    Math.floor((z + dz) / CHUNK_SIZE)
                );

                if (!chunk || chunk.modified) {
                    return false;
                }

            }

        }

        return true;

    }

    // --------------------------------------------------------
    // CO KLATKĘ
    // --------------------------------------------------------

    update(dt) {

        // Ciemną nocą czasem spada sam (chyba że gracz wyłączył
        // meteoryty w ustawieniach - komenda /meteor działa zawsze).

        const state = this.game.sky.state;

        if (
            METEORITES_PER_NIGHT > 0 &&
            this.game.settings.get('meteorites') &&
            state.night > 0.7 &&
            Math.random() < METEORITES_PER_NIGHT / DARK_NIGHT_SECONDS * dt
        ) {
            this.spawn();
        }


        for (const meteor of this.flying) {
            this.updateMeteor(meteor, dt);
        }

        this.flying = this.flying.filter((meteor) => !meteor.done);


        for (const flash of this.flashes) {

            flash.age += dt;

            const left = Math.max(0, 1 - flash.age / FLASH_SECONDS);

            flash.strength = 15 * left ** 1.5;

        }

        this.flashes = this.flashes.filter((flash) => flash.age < FLASH_SECONDS);

    }


    updateMeteor(meteor, dt) {

        meteor.age += dt;

        const t = Math.min(1, meteor.age / FLIGHT_SECONDS);

        // Przyspiesza w trakcie lotu.

        const position = meteor.light.position;

        position.lerpVectors(meteor.start, meteor.end, t * t);

        meteor.group.position.copy(position);


        // Warkocz: ostatnie pozycje, od gorącego do ciemnego.

        meteor.history.unshift(position.clone());

        if (meteor.history.length > TRAIL_POINTS) {
            meteor.history.pop();
        }

        const positions = meteor.trail.geometry.attributes.position.array;
        const colors = meteor.trail.geometry.attributes.color.array;

        const color = new THREE.Color();

        meteor.history.forEach((point, i) => {

            const k = i / TRAIL_POINTS;

            color.lerpColors(TRAIL_HOT, TRAIL_COLD, k).multiplyScalar(1 - k);

            point.toArray(positions, i * 3);
            color.toArray(colors, i * 3);

        });

        meteor.trail.geometry.setDrawRange(0, meteor.history.length);
        meteor.trail.geometry.attributes.position.needsUpdate = true;
        meteor.trail.geometry.attributes.color.needsUpdate = true;


        if (t >= 1) {
            this.impact(meteor);
        }

    }

    // --------------------------------------------------------
    // UDERZENIE
    // --------------------------------------------------------

    impact(meteor) {

        meteor.done = true;

        this.removeObjects(meteor);


        const world = this.game.world;

        const { x, y, z } = meteor.landing;


        // Krater: misa wycięta w terenie (środek pół bloku pod
        // powierzchnią, w pionie spłaszczona) - ok. 3 bloki w głąb.

        const reach = Math.ceil(CRATER_RADIUS);

        for (let dy = reach; dy >= -reach; dy--) {

            for (let dx = -reach; dx <= reach; dx++) {

                for (let dz = -reach; dz <= reach; dz++) {

                    const distance = dx * dx + dz * dz + (dy + 0.5) * (dy + 0.5) * 1.6;

                    if (distance <= CRATER_RADIUS * CRATER_RADIUS && y + dy >= 1) {
                        world.setBlock(x + dx, y + dy, z + dz, null);
                    }

                }

            }

        }


        // Na dnie zostaje żarzący się meteoryt (czasem z odłamkiem obok).

        const bottom = world.getSurfaceY(x, z);

        world.setBlock(x, bottom, z, 'meteorite');

        if (Math.random() < 0.5) {

            const side = Math.random() < 0.5 ? 1 : -1;

            world.setBlock(x + side, world.getSurfaceY(x + side, z), z, 'meteorite');

        }


        // Błysk nad krawędzią krateru, żeby oświetlił okolicę.

        this.flashes.push({
            position: new THREE.Vector3(x + 0.5, y + 2.5, z + 0.5),
            color: FLASH_COLOR,
            strength: 15,
            age: 0
        });


        const player = this.game.player.pos;

        const distance = Math.round(Math.hypot(player.x - x, player.z - z));

        this.game.onMessage?.(
            `Meteoryt spadł na ${x}, ${bottom}, ${z} (${distance} bloków od ciebie).`
        );

    }

    // --------------------------------------------------------

    // Źródła dynamicznego światła: lecące meteoryty i błyski.

    getLightSources() {

        return [
            ...this.flying.map((meteor) => meteor.light),
            ...this.flashes
        ];

    }


    removeObjects(meteor) {

        meteor.group.removeFromParent();
        meteor.trail.removeFromParent();

        for (const sprite of meteor.group.children) {
            sprite.material.dispose();
        }

        meteor.trail.geometry.dispose();
        meteor.trail.material.dispose();

    }


    dispose() {

        for (const meteor of this.flying) {
            this.removeObjects(meteor);
        }

        this.flying = [];
        this.flashes = [];

    }

}
