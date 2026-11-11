import * as THREE from 'three';

import { CHUNK_SIZE, CHUNK_HEIGHT } from '../config.js';
import { getBlockDefinition, getBlockTypeById, isLeavesId, isSolidId } from '../blocks/BlockRegistry.js';
import { ITEM_TYPES } from '../items/ItemRegistry.js';
import { CubeParticles } from './CubeParticles.js';
import { getTileColors } from './TextureAtlas.js';
import { lightToBrightness, COLOR_LEVEL } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';

// ------------------------------------------------------------
// SPADAJĄCE LIŚCIE I OWOCE (0.82.0, pomysł Kamila)
//
// Z dolnych bloków liści (pod nimi powietrze) przy graczu powoli
// spadają płatki w kolorach liści tego drzewa - kołyszą się na boki,
// płyną z wiatrem (AmbientWind.js) i chwilę leżą na ziemi. Z liści
// z owocami (np. jabłoń) czasem spada owoc - szybciej, odbija się
// i zostaje na trawie. To tylko obraz: blok i owoce do zbioru się nie
// zmieniają.
//
// Doły koron szuka powolne przeglądanie chunków wokół gracza (po
// jednym chunku na klatkę, tylko gdzie są liście - chunk.maxY).
// Każdy dół korony średnio raz na LEAF_SECONDS sekund puszcza liść,
// liść z owocem raz na FRUIT_SECONDS - owoc; razem najwyżej MAX_RATE na
// sekundę. Wszystko w jednym rysowaniu (CubeParticles).
// ------------------------------------------------------------

export const TREE_PARTICLE_RADIUS = 28;
export const LEAF_SECONDS = 40;
export const FRUIT_SECONDS = 75;
export const MAX_RATE = 14;

// Ile chunków dookoła i jak często od nowa (s).
const CHUNK_RADIUS = Math.ceil(TREE_PARTICLE_RADIUS / CHUNK_SIZE);
const RESCAN_SECONDS = 6;
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

const random = (min, max) => min + Math.random() * (max - min);


// Kształty spadających liści (0.84.0): obrazki 6 x 6 "minipikseli"
// (CubeParticles - spriteTexture), w kolorach liści gatunku. Szary
// obrazek: h - jasny, o - zwykły, d - żyłka, s - ogonek.

export const LEAF_SPRITES = {
    owalny: [
        '....hh',
        '..ohhh',
        '.ohdho',
        '.odoo.',
        '.doo..',
        's.....'
    ],
    okragly: [
        '..hh..',
        '.ohhh.',
        '.ohdo.',
        '.odoo.',
        '..do..',
        '..s...'
    ],
    klon: [
        '..h...',
        'h.hh.h',
        'hhdhhh',
        '.hdhh.',
        'hh.d.h',
        '...s..'
    ],
    waski: [
        '....hh',
        '...hho',
        '..hdo.',
        '.odo..',
        '.do...',
        's.....'
    ],
    igly: [
        '.h..h.',
        'h.hh.h',
        '.h.dh.',
        'h.hd.h',
        '.h.d..',
        '...s..'
    ],
    galazka: [
        'h..h..',
        '.h.h.h',
        '..hd..',
        '.hd.h.',
        'hd.h..',
        's.....'
    ],
    wachlarz: [
        '.hh.hh',
        'hhhhhh',
        'ohhdho',
        '.oddo.',
        '..dd..',
        '..s...'
    ],
    platek: [
        '.hhh..',
        'hhhhh.',
        'hhdhh.',
        '.hhho.',
        '..ho..',
        '......'
    ]
};

const SPRITE_NAMES = Object.keys(LEAF_SPRITES);

// Gatunek -> kształty liścia (losowo jeden z listy).
const SPECIES_SPRITES = {
    spruce: ['igly', 'galazka'], pine: ['igly', 'galazka'], bald_cypress: ['galazka', 'igly'],
    mugo: ['igly', 'galazka'], sequoia: ['galazka', 'igly'],
    maple: ['klon'], cherry: ['platek', 'okragly'],
    ginkgo: ['wachlarz'], jacaranda: ['platek', 'waski'],
    olive: ['waski'], wierzba: ['waski'], rainbow_eucalyptus: ['waski', 'owalny'], acacia: ['waski', 'okragly'],
    birch: ['okragly', 'owalny'], linden: ['okragly', 'owalny']
};

export function leafSprites(species) {
    return (SPECIES_SPRITES[species] ?? ['owalny', 'okragly']).map((name) => SPRITE_NAMES.indexOf(name));
}


// Liść z owocem drzewa (zbiór daje owoc z katalogu drzew - ma pole
// tree, np. jabłko; kwiaty lipy nie).

export function fruitOf(definition) {
    const item = definition?.part === 'leaves' ? definition.harvest?.item : null;
    return item && ITEM_TYPES[item]?.tree ? item : null;
}


export class TreeParticles {

    constructor(scene, world) {

        this.world = world;

        // Liście - obrazki 6 x 6 (liść, gałązka igieł, płatek), owoce - sześciany.
        this.leaves = new CubeParticles(scene, { capacity: 700, surfaceLighting: true, flat: 0.05,
            sprites: SPRITE_NAMES.map((name) => LEAF_SPRITES[name]) });
        this.fruits = new CubeParticles(scene, { capacity: 80, surfaceLighting: true });

        // Doły koron w chunkach: chunk -> { revision, scanned, leaves: [x, y, z, id...], fruits: [...] }.
        this.cells = new Map();
        this.queue = [];

        this.amount = 1;
        this.enabled = true;
        this.leafBudget = 0;
        this.fruitBudget = 0;
        this.clock = 0;

        this.palettes = new Map();
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();

    }


    setEnabled(on) {
        this.enabled = Boolean(on);
        if (!this.enabled) {
            this.leaves.count = 0;
            this.fruits.count = 0;
        }
    }

    setAmount(amount) {
        this.amount = Math.max(0, amount);
    }


    // Kolory: liść - z tekstury zwykłych liści gatunku (bez owoców
    // i kwiatów), owoc - czerwone / żółte piksele liści z owocem.

    palette(id, kind) {

        const key = `${kind}:${id}`;

        if (this.palettes.has(key)) return this.palettes.get(key);

        const definition = getBlockDefinition(getBlockTypeById(id));
        const base = definition?.tree ? getBlockDefinition(`${definition.tree}_leaves`) : null;
        const own = getTileColors(definition?.textures?.all);
        let colors;

        if (kind === 'fruit') {
            // Kolory owocu z jego ikonki (np. jablon/jablko.png).
            const icon = ITEM_TYPES[fruitOf(definition)]?.icon;
            colors = getTileColors(icon).filter((c) => c.r + c.g + c.b > 0.03);
            if (colors.length < 3) colors = own.filter((c) => c.r > c.g * 1.3 && c.r > 0.05);
        }
        else {
            colors = getTileColors(base?.textures?.all ?? definition?.textures?.all);
            if (!colors.length) colors = own;
            // Jaśniejsza połowa pikseli (bez cieni między liśćmi) - mały
            // płatek z daleka inaczej wygląda jak czarna kropka.
            const sorted = [...colors].sort((a, b) => (b.r + b.g + b.b) - (a.r + a.g + a.b));
            colors = sorted.slice(0, Math.max(3, Math.ceil(sorted.length / 2))).map((c) => c.clone().multiplyScalar(2.1));
        }

        const result = colors.length ? colors : null;
        // Pusta paleta, dopóki atlas się nie wczytał - spróbujemy później.
        if (result) this.palettes.set(key, result);
        return result;

    }


    lightingAt(x, y, z) {

        // Światło pod koroną i trochę z boku (płatek zaraz wyleci z cienia).
        const below = this.world.getLight(x, y, z), aside = this.world.getLight(x + 1, y - 1, z);
        const light = below.sky >= aside.sky ? below : aside;
        const strongest = Math.max(light.red, light.green, light.blue);
        const sky = lightToBrightness(light.sky) ** 2.2;
        const lamp = strongest > 0 ? (lightToBrightness(COLOR_LEVEL[strongest]) ** 2.2) * 0.75 : 0;
        const atmosphereLamp = strongest > 0 ? atmosphericLightToBrightness(COLOR_LEVEL[strongest]) : 0;

        return {
            sky: atmosphericLightToBrightness(light.sky) ** 2.2,
            local: strongest > 0
                ? [light.red, light.green, light.blue].map((channel) => (atmosphereLamp * channel / strongest) ** 2.2)
                : [0, 0, 0],
            emission: 0,
            classicShade: Math.max(sky, lamp)
        };

    }


    // Doły koron w jednym chunku: blok liści, pod którym nie ma nic
    // stałego (liść ma skąd spaść).

    scanChunk(chunk) {

        const leaves = [], fruits = [];
        const blocks = chunk.blocks;
        const top = Math.min(CHUNK_HEIGHT - 1, chunk.maxY ?? CHUNK_HEIGHT - 1);
        const x0 = chunk.cx * CHUNK_SIZE, z0 = chunk.cz * CHUNK_SIZE;

        for (let y = 1; y <= top; y++) {

            const layer = y * LAYER;

            for (let i = 0; i < LAYER; i++) {

                const id = blocks[layer + i];

                if (!id || !isLeavesId(id)) continue;

                const below = blocks[layer - LAYER + i];

                if (below && (isSolidId(below) || isLeavesId(below))) continue;

                const x = x0 + (i % CHUNK_SIZE), z = z0 + Math.floor(i / CHUNK_SIZE);

                leaves.push(x, y, z, id);

                if (fruitOf(getBlockDefinition(getBlockTypeById(id)))) fruits.push(x, y, z, id);

            }

        }

        return { revision: chunk.meshRevision, scanned: this.clock, leaves, fruits };

    }


    // Jeden chunk na klatkę: nowe, zmienione albo dawno przejrzane.

    scanStep(player) {

        const world = this.world;
        const pcx = Math.floor(player.pos.x / CHUNK_SIZE), pcz = Math.floor(player.pos.z / CHUNK_SIZE);

        if (!this.queue.length) {
            for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
                for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) this.queue.push([pcx + dx, pcz + dz]);
            }
            // Chunki daleko od gracza - zapominamy.
            for (const chunk of this.cells.keys()) {
                if (Math.abs(chunk.cx - pcx) > CHUNK_RADIUS + 1 || Math.abs(chunk.cz - pcz) > CHUNK_RADIUS + 1 ||
                    world.getChunk(chunk.cx, chunk.cz) !== chunk) this.cells.delete(chunk);
            }
        }

        while (this.queue.length) {
            const [cx, cz] = this.queue.pop();
            const chunk = world.getChunk(cx, cz);
            if (!chunk?.blocks) continue;
            const known = this.cells.get(chunk);
            if (known && known.revision === chunk.meshRevision && this.clock - known.scanned < RESCAN_SECONDS) continue;
            this.cells.set(chunk, this.scanChunk(chunk));
            return;
        }

    }


    // Losowy dół korony (z listy leaves albo fruits) bliżej niż promień.

    pick(list, player) {

        let total = 0;
        for (const cells of this.cells.values()) total += cells[list].length / 4;
        if (!total) return null;

        for (let attempt = 0; attempt < 4; attempt++) {
            let index = Math.floor(Math.random() * total);
            for (const cells of this.cells.values()) {
                const count = cells[list].length / 4;
                if (index >= count) { index -= count; continue; }
                const o = index * 4, data = cells[list];
                const x = data[o], y = data[o + 1], z = data[o + 2], id = data[o + 3];
                if (Math.hypot(x + 0.5 - player.pos.x, z + 0.5 - player.pos.z) > TREE_PARTICLE_RADIUS) break;
                // Blok mógł zniknąć od przejrzenia.
                if (this.world.getBlockId(x, y, z) !== id) break;
                return { x, y, z, id };
            }
        }

        return null;

    }


    count(list) {
        let total = 0;
        for (const cells of this.cells.values()) total += cells[list].length / 4;
        return total;
    }


    leaf(cell) {

        const colors = this.palette(cell.id, 'leaf');
        if (!colors) return;

        const pick = () => colors[Math.floor(Math.random() * colors.length)];

        const definition = getBlockDefinition(getBlockTypeById(cell.id));
        const sprites = leafSprites(definition?.tree);

        this.position.set(cell.x + random(0.1, 0.9), cell.y - 0.03, cell.z + random(0.1, 0.9));
        this.velocity.set(random(-0.15, 0.15), random(-0.3, -0.1), random(-0.15, 0.15));

        this.leaves.emit({
            position: this.position,
            velocity: this.velocity,
            life: random(9, 15),
            // 6 x 6 minipikseli na 0,2-0,26 bloku (minipiksel to ok. 2/3
            // piksela bloku) - liść nie wychodzi za duży.
            size: random(0.2, 0.26),
            sprite: sprites[Math.floor(Math.random() * sprites.length)],
            fade: 0.12,
            colors: [pick(), pick(), pick()],
            lighting: this.lightingAt(cell.x, cell.y - 1, cell.z),
            gravity: 0.9,
            drag: 2.2,
            spin: 1.6,
            collide: true,
            flutter: random(0.35, 0.7),
            carry: random(0.35, 0.6)
        });

    }


    fruit(cell) {

        const colors = this.palette(cell.id, 'fruit');
        if (!colors) return;

        const pick = () => colors[Math.floor(Math.random() * colors.length)];

        this.position.set(cell.x + random(0.25, 0.75), cell.y - 0.1, cell.z + random(0.25, 0.75));
        this.velocity.set(random(-0.3, 0.3), 0, random(-0.3, 0.3));

        this.fruits.emit({
            position: this.position,
            velocity: this.velocity,
            life: random(6, 9),
            size: 0.17,
            fade: 0.12,
            colors: [pick(), pick(), pick()],
            lighting: this.lightingAt(cell.x, cell.y - 1, cell.z),
            gravity: 16,
            drag: 0.1,
            spin: 3,
            collide: true
        });

    }


    update(dt, player, wind) {

        this.clock += dt;

        if (wind) {
            this.leaves.wind.x = wind.x;
            this.leaves.wind.z = wind.z;
        }

        if (this.enabled && this.amount > 0 && player) {

            this.scanStep(player);

            const step = Math.min(dt, 0.1);

            // Średnio raz na LEAF_SECONDS z każdego dołu korony; w porywie
            // wiatru trochę częściej.
            const gust = wind ? 0.7 + 0.6 * wind.gust : 1;
            this.leafBudget += Math.min(MAX_RATE, this.count('leaves') / LEAF_SECONDS * gust) * this.amount * step;
            this.fruitBudget += Math.min(2, this.count('fruits') / FRUIT_SECONDS) * this.amount * step;

            for (; this.leafBudget >= 1; this.leafBudget--) {
                const cell = this.pick('leaves', player);
                if (cell) this.leaf(cell);
            }

            for (; this.fruitBudget >= 1; this.fruitBudget--) {
                const cell = this.pick('fruits', player);
                if (cell) this.fruit(cell);
            }

        }

        this.leaves.update(dt, this.world);
        this.fruits.update(dt, this.world);

    }


    dispose() {
        this.leaves.dispose();
        this.fruits.dispose();
    }

}
