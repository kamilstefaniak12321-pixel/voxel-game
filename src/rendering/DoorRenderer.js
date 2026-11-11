import * as THREE from 'three';
import { CHUNK_SIZE, SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { buildFacesGeometry, doorFaces } from './ShapeGeometry.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { TABLE_ROTATION } from './CarpenterTableRenderer.js';

// ------------------------------------------------------------
// DRZWI W ŚWIECIE (0.91.0)
//
// Model i animacja z pliku Kamila (drzwi.bbmodel): płyta 16 x 32 x 2 px na
// zawiasie, "otwieranie" - 0,42 s: do 90 stopni w 0,25 s, odbicie do 95,
// powrót, lekkie 87,5 i spokój na 90. Zamykanie - ta sama krzywa wstecz
// (bez odbicia przez framugę). Bloki drzwi chunk indeksuje (Chunk.torches
// - te same komórki z modelami), mesher ich nie rysuje.
// ------------------------------------------------------------

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const SYNC_SECONDS = 0.25;

// Klatki kluczowe animacji (czas w s, kąt w stopniach).
export const DOOR_KEYFRAMES = [[0, 0], [0.25, -90], [0.29167, -95], [0.33333, -90], [0.375, -87.5], [0.41667, -90]];
export const DOOR_ANIMATION_SECONDS = DOOR_KEYFRAMES.at(-1)[0];

// Otwarcie 0-1 (z odbiciem ponad 1) po czasie t od początku otwierania.
export function doorOpening(t) {
    if (t <= 0) return 0;
    for (let i = 1; i < DOOR_KEYFRAMES.length; i++) {
        const [t1, a1] = DOOR_KEYFRAMES[i];
        if (t <= t1) {
            const [t0, a0] = DOOR_KEYFRAMES[i - 1];
            return (a0 + (a1 - a0) * (t - t0) / (t1 - t0)) / -90;
        }
    }
    return 1;
}

// Zawias w układzie "north" (komórka 0-1): lewy - 1/16 od zachodu,
// prawy - 1/16 od wschodu; środek grubości płyty.
const PIVOT = { left: [1 / 16, 1 / 16], right: [15 / 16, 1 / 16] };

export class DoorRenderer {

    constructor(game) {
        this.game = game;
        this.views = new Map();
        this.chunks = new Map();
        this.geometries = new Map();
        this.syncWait = 0;
        this.time = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
    }

    geometry(texture, hinge) {
        const key = `${texture}:${hinge}`;
        if (!this.geometries.has(key)) {
            const [px, pz] = PIVOT[hinge];
            const geometry = buildFacesGeometry(doorFaces(texture, hinge));
            geometry.translate(-px, 0, -pz);
            this.geometries.set(key, geometry);
        }
        return this.geometries.get(key);
    }

    createView(key, x, y, z, info) {
        const lighting = {
            uModelSky: { value: 1 },
            uModelBlock: { value: new THREE.Vector3() },
            uModelSun: { value: 1 },
            uModelAmbient: { value: 1 },
            uModelDistantShadows: { value: 1 },
            uModelBounce: { value: new THREE.Vector3() }
        };
        const material = createModelMaterial({ map: blockAtlasTexture, lighting });
        setPotatoDefine([material], this.lowDetail);
        const group = new THREE.Group();
        group.position.set(x + 0.5, y, z + 0.5);
        group.rotation.y = TABLE_ROTATION[info.facing] ?? 0;
        const pivot = new THREE.Group();
        const [px, pz] = PIVOT[info.hinge];
        pivot.position.set(px - 0.5, 0, pz - 0.5);
        pivot.add(new THREE.Mesh(this.geometry(info.texture, info.hinge), material));
        group.add(pivot);
        this.game.scene.add(group);
        const view = { key, x, y, z, group, pivot, material, lighting, shape: `${info.texture}:${info.hinge}:${info.facing}`,
            open: info.open, from: info.open ? 1 : 0, started: -Infinity };
        this.views.set(key, view);
        this.pose(view);
        this.updateLight(view);
        return view;
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        view.group.removeFromParent();
        view.material.dispose();
        this.views.delete(key);
    }

    // Otwarcie teraz (0-1 z odbiciem) - animacja od zmiany stanu.
    opening(view) {
        const t = this.time - view.started;
        const curve = doorOpening(Math.min(t, DOOR_ANIMATION_SECONDS));
        return view.open ? view.from + (1 - view.from) * curve : Math.max(0, view.from * (1 - curve));
    }

    pose(view) {
        const sign = view.shape.includes(':right:') ? -1 : 1;
        view.pivot.rotation.y = -Math.PI / 2 * this.opening(view) * sign;
    }

    updateLight(view) {
        const light = this.game.world.getLight(view.x, view.y, view.z);
        const brightness = this.game.sky?.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky);
        const strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        view.lighting.uModelSky.value = sky;
        view.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        const ambientStrength = this.game.shadows?.active ? (this.game.shadows.ambientStrength ?? 0) : 0;
        view.lighting.uModelSun.value = sky ** 2.2;
        view.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);
        view.lighting.uModelBounce.value.set(0, 0, 0);
    }

    sync() {
        const world = this.game.world;
        const loaded = new Set(world.chunks.values());
        for (const [chunk, record] of this.chunks) {
            if (loaded.has(chunk)) continue;
            for (const key of record.keys) this.removeView(key);
            this.chunks.delete(chunk);
        }
        for (const chunk of loaded) {
            const revision = chunk.torchRevision ?? 0;
            const record = this.chunks.get(chunk);
            if (record?.revision === revision) continue;
            const keys = new Set();
            for (const index of chunk.torches ?? []) {
                const info = shapeInfo(chunk.blocks[index]);
                if (info?.kind !== 'door' || info.part !== 'lower') continue;
                const key = `${chunk.cx},${chunk.cz}:${index}`;
                keys.add(key);
                const shape = `${info.texture}:${info.hinge}:${info.facing}`;
                let view = this.views.get(key);
                if (view && view.shape !== shape) {
                    this.removeView(key);
                    view = null;
                }
                if (!view) {
                    const y = Math.floor(index / LAYER);
                    const z = chunk.cz * CHUNK_SIZE + Math.floor(index % LAYER / CHUNK_SIZE);
                    const x = chunk.cx * CHUNK_SIZE + index % CHUNK_SIZE;
                    this.createView(key, x, y, z, info);
                }
                else if (view.open !== info.open) {
                    // Zmiana stanu - animacja od obecnego położenia.
                    view.from = Math.min(1, this.opening(view));
                    view.open = info.open;
                    view.started = this.time;
                }
            }
            for (const key of record?.keys ?? []) if (!keys.has(key)) this.removeView(key);
            this.chunks.set(chunk, { revision, keys });
        }
    }

    update(dt) {
        this.time += dt;
        this.syncWait -= dt;
        // Zmiana bloków (World.version) albo wczytanych chunków - przegląd
        // indeksów chunków; światło rzadziej.
        const world = this.game.world;
        if (world.version !== this.worldVersion || world.chunks.size !== this.chunkCount) {
            this.worldVersion = world.version;
            this.chunkCount = world.chunks.size;
            this.sync();
        }
        for (const view of this.views.values()) this.pose(view);
        if (this.syncWait <= 0) {
            this.syncWait = SYNC_SECONDS;
            for (const view of this.views.values()) this.updateLight(view);
        }
    }

    setLowDetail(on) {
        this.lowDetail = on;
        for (const view of this.views.values()) setPotatoDefine([view.material], on);
    }

    dispose() {
        for (const key of [...this.views.keys()]) this.removeView(key);
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
        this.chunks.clear();
    }
}
