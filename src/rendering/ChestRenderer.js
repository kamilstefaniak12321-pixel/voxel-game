import * as THREE from 'three';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture, getAtlasUV } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { CHEST_FACES, CHEST_HINGE, CHEST_TEXTURE } from './ChestGeometry.js';
import { CHEST_ROTATION } from '../blocks/chest.js';

// ------------------------------------------------------------
// SKRZYNIE W ŚWIECIE (0.81.0)
//
// Każda skrzynia w wczytanych chunkach to mały model (korpus i wieko na
// zawiasie), oświetlony światłem swojego bloku - jak pochodnie
// (TorchRenderer.js). Otwarta skrzynia (Chests.open) unosi wieko, po
// zamknięciu ekwipunku opuszcza je. Geometria jest wspólna, każda
// skrzynia ma tylko własne światło.
// ------------------------------------------------------------

const SYNC_SECONDS = 0.2;
export const CHEST_OPEN_SECONDS = 0.35;
export const CHEST_OPEN_ANGLE = 1.85;

// Otwarcie wieka 0-1 -> kąt (z lekkim odbiciem na końcu).
export function chestLidAngle(progress) {
    const t = Math.max(0, Math.min(1, progress));
    const ease = 1 - (1 - t) ** 3;
    return CHEST_OPEN_ANGLE * ease + Math.sin(t * Math.PI) * 0.06 * t;
}

const shared = new Map();

// Geometria w atlasie: korpus i wieko (wieko względem zawiasu) - jedna
// na teksturę (skrzynie z różnych desek, 0.89.0).
export function chestGeometries(texture = CHEST_TEXTURE) {
    if (shared.has(texture)) return shared.get(texture);
    const uv = getAtlasUV(texture, 0);
    const build = (part, offset) => {
        const positions = [], normals = [], uvs = [], indices = [];
        for (const face of CHEST_FACES.filter((candidate) => candidate.part === part)) {
            const base = positions.length / 3;
            face.vertices.forEach(([x, y, z], i) => {
                positions.push(x, y - offset.y, z - offset.z);
                normals.push(...face.normal);
                uvs.push(uv.uMin + face.uv[i][0] * (uv.uMax - uv.uMin), uv.vMax - face.uv[i][1] * (uv.vMax - uv.vMin));
            });
            indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);
        geometry.computeBoundingSphere();
        return geometry;
    };
    const geometries = { body: build('body', { y: 0, z: 0 }), lid: build('lid', CHEST_HINGE) };
    shared.set(texture, geometries);
    return geometries;
}

// Model skrzyni: { group, lid } - lid obraca się wokół zawiasu (x).
export function createChestModel(material, texture = CHEST_TEXTURE) {
    const { body, lid } = chestGeometries(texture);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(body, material));
    const pivot = new THREE.Group();
    pivot.position.set(0, CHEST_HINGE.y, CHEST_HINGE.z);
    pivot.add(new THREE.Mesh(lid, material));
    group.add(pivot);
    return { group, lid: pivot };
}

export class ChestRenderer {

    constructor(game, chests) {
        this.game = game;
        this.chests = chests;
        this.views = new Map();
        this.syncWait = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
    }

    createView(key, chest) {
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
        const texture = this.chests.textureOf(chest);
        const { group, lid } = createChestModel(material, texture);
        group.position.set(chest.x + 0.5, chest.y, chest.z + 0.5);
        group.rotation.y = CHEST_ROTATION[this.chests.facingOf(chest)] ?? 0;
        this.game.scene.add(group);
        const view = { key, chest, group, lid, material, lighting, open: 0, texture };
        this.views.set(key, view);
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

    updateLight(view) {
        const { x, y, z } = view.chest;
        const light = this.game.world.getLight(x, y, z);
        const brightness = this.game.sky?.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky);
        const strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        view.lighting.uModelSky.value = sky;
        view.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        const ambientStrength = this.game.shadows?.active ? (this.game.shadows.ambientStrength ?? 0) : 0;
        view.lighting.uModelSun.value = sky ** 2.2;
        view.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);
        if (this.game.bounce?.enabled) {
            const c = this.game.bounce.sample(x + 0.5, y + 0.4, z + 0.5);
            view.lighting.uModelBounce.value.set(c[0], c[1], c[2]);
        }
        else view.lighting.uModelBounce.value.set(0, 0, 0);
    }

    // Modele dla skrzyń w wczytanych chunkach (i światło) co chwilę;
    // wieko - co klatkę.
    update(dt) {
        this.syncWait -= dt;
        if (this.syncWait <= 0) {
            this.syncWait = SYNC_SECONDS;
            const world = this.game.world;
            const keep = new Set();
            for (const [key, chest] of this.chests.chests) {
                if (!world.getChunk(world.toChunkCoord(chest.x), world.toChunkCoord(chest.z))) continue;
                keep.add(key);
                // Inna skrzynia (drewno) w tym samym miejscu - nowy model.
                if (this.views.get(key)?.texture !== undefined && this.views.get(key).texture !== this.chests.textureOf(chest)) this.removeView(key);
                const view = this.views.get(key) ?? this.createView(key, chest);
                view.chest = chest;
                view.group.rotation.y = CHEST_ROTATION[this.chests.facingOf(chest)] ?? 0;
                this.updateLight(view);
            }
            for (const key of [...this.views.keys()]) if (!keep.has(key)) this.removeView(key);
        }
        for (const view of this.views.values()) {
            const target = this.chests.open === view.chest ? 1 : 0;
            const step = dt / CHEST_OPEN_SECONDS;
            view.open = target > view.open ? Math.min(target, view.open + step) : Math.max(target, view.open - step * 1.4);
            view.lid.rotation.x = chestLidAngle(view.open);
        }
    }

    setLowDetail(on) {
        this.lowDetail = Boolean(on);
        for (const view of this.views.values()) setPotatoDefine([view.material], this.lowDetail);
    }

    dispose() {
        for (const key of [...this.views.keys()]) this.removeView(key);
    }
}
