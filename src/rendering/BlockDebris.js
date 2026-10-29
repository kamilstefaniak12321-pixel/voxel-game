import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';

import { getTileColors } from './TextureAtlas.js';

import { getFaceTexture } from './BlockRenderData.js';

import { CubeParticles } from './CubeParticles.js';

import { lightToBrightness, COLOR_LEVEL } from '../world/Light.js';

import { atmosphericLightToBrightness } from './LightPolicy.js';

// ------------------------------------------------------------
// ODŁAMKI NISZCZONEGO BLOKU
//
// Małe sześciany w kolorach pikseli tekstury bloku (każdy odłamek ma
// kolor jednego, losowego piksela), które rozpryskują się, spadają,
// odbijają od ziemi, leżą chwilę i znikają (CubeParticles.js):
//   burst - zniszczony blok: garść odłamków z całego bloku,
//   chips - kopanie (co uderzenie): kilka małych odłamków ze ściany,
//           w którą trafia celownik.
// Albedo i próbka światła w miejscu bloku są osobne. Atmosfera używa
// koloru lamp i prawdziwego zera w ciemności; classic zachowuje dawny wygląd.
// ------------------------------------------------------------

const BURST = 16;
const BURST_PLANT = 7;
const CHIPS = 3;


function random(min, max) {

    return min + Math.random() * (max - min);

}


export class BlockDebris {

    constructor(scene, world) {

        this.world = world;

        this.particles = new CubeParticles(scene, { capacity: 900, surfaceLighting: true });

        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

    }


    // Piksele są liniowym albedo. Krzywe poziomów lamp/nieba dekodujemy
    // tutaj raz; shader nie wykonuje już gamma na tych danych.

    colorsOf(type, x, y, z) {

        const definition = getBlockDefinition(type);

        if (!definition) {
            return null;
        }

        const tile = getFaceTexture(definition.textures, definition.model === 'flat' ? 'top' : 'front');

        const colors = getTileColors(tile);

        if (colors.length === 0) {
            return null;
        }

        const light = this.world.getLight(x, y, z);

        const strongest = Math.max(light.red, light.green, light.blue);

        const sky = lightToBrightness(light.sky) ** 2.2;

        const lamp = strongest > 0 ? (lightToBrightness(COLOR_LEVEL[strongest]) ** 2.2) * 0.75 : 0;

        // Świecący blok (lampa) - odłamki jasne.

        const glow = (definition.light ?? 0) / 15;

        const atmosphereLamp = strongest > 0 ? atmosphericLightToBrightness(COLOR_LEVEL[strongest]) : 0;
        const local = strongest > 0
            ? [light.red, light.green, light.blue].map(channel => (atmosphereLamp * channel / strongest) ** 2.2)
            : [0, 0, 0];

        return {
            colors,
            lighting: {
                sky: atmosphericLightToBrightness(light.sky) ** 2.2,
                local,
                emission: glow,
                classicShade: Math.max(sky, lamp, glow)
            },
            plant: definition.model === 'cross' || definition.model === 'flat' || definition.model === 'riverPlant'
        };

    }


    emitOne(colors, lighting, position, velocity, size) {

        const base = colors[Math.floor(Math.random() * colors.length)];

        this.particles.emit({
            position,
            velocity,
            life: random(0.55, 1.0),
            size,
            fade: 0.35,
            colors: base,
            lighting,
            gravity: 16,
            drag: 1.2,
            spin: 8,
            collide: true
        });

    }


    // Zniszczony blok (x, y, z) typu `type` - odłamki z całego bloku.

    burst(type, x, y, z) {

        const found = this.colorsOf(type, x, y, z);

        if (!found) {
            return;
        }

        const { colors, lighting, plant } = found;

        const count = plant ? BURST_PLANT : BURST;

        for (let i = 0; i < count; i++) {

            const ox = random(0.15, 0.85);
            const oy = plant ? random(0.05, 0.6) : random(0.15, 0.85);
            const oz = random(0.15, 0.85);

            this.position.set(x + ox, y + oy, z + oz);

            this.velocity.set(
                (ox - 0.5) * 3 + random(-0.6, 0.6),
                random(1.2, 3.2),
                (oz - 0.5) * 3 + random(-0.6, 0.6)
            );

            this.emitOne(colors, lighting, this.position, this.velocity, random(0.07, plant ? 0.1 : 0.14));

        }

    }


    // Uderzenie przy kopaniu: kilka odłamków ze ściany o normalnej
    // `normal` ({ x, y, z }; bez niej - z wierzchu) bloku (x, y, z).

    chips(type, x, y, z, normal = { x: 0, y: 1, z: 0 }) {

        const found = this.colorsOf(type, x + normal.x, y + normal.y, z + normal.z);

        if (!found) {
            return;
        }

        for (let i = 0; i < CHIPS; i++) {

            // Punkt na ścianie: środek ściany + losowo wzdłuż niej.

            const point = [random(0.2, 0.8), random(0.2, 0.8), random(0.2, 0.8)];

            if (normal.x !== 0) point[0] = normal.x > 0 ? 1.03 : -0.03;
            if (normal.y !== 0) point[1] = normal.y > 0 ? 1.03 : -0.03;
            if (normal.z !== 0) point[2] = normal.z > 0 ? 1.03 : -0.03;

            this.position.set(x + point[0], y + point[1], z + point[2]);

            this.velocity.set(
                normal.x * 1.8 + random(-0.8, 0.8),
                normal.y * 1.8 + random(0.6, 1.8),
                normal.z * 1.8 + random(-0.8, 0.8)
            );

            this.emitOne(found.colors, found.lighting, this.position, this.velocity, random(0.05, 0.08));

        }

    }


    update(dt) {

        this.particles.update(dt, this.world);

    }


    get count() {

        return this.particles.count;

    }


    dispose() {

        this.particles.dispose();

    }

}
