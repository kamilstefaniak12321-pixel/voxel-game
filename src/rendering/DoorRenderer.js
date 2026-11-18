import * as THREE from 'three';
import { CHUNK_SIZE, SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, FACE_BLOCK, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { buildFacesGeometry, doorFaces, trapdoorFaces } from './ShapeGeometry.js';
import { MODEL_CASTER_MATERIAL } from './Shadows.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { isOpaqueId } from '../blocks/BlockRegistry.js';
import { TABLE_ROTATION } from './CarpenterTableRenderer.js';

// ------------------------------------------------------------
// DRZWI I KLAPY W ŚWIECIE (0.91.0, klapy od 1.16.0)
//
// Modele i animacja z pliku Kamila ("drzwi i zapadnia.bbmodel"):
//   drzwi - płyta 16 x 32 x 2 px na pionowym zawiasie,
//   klapa - płyta 16 x 2 x 16 px na poziomym zawiasie przy brzegu
//           "facing" (dolna otwiera się w górę, górna - w dół).
// "Otwieranie" - 0,42 s: do 90 stopni w 0,25 s, odbicie (drzwi do 95,
// klapa do 92,5), powrót, lekkie 87,5 i spokój na 90. Zamykanie - ta sama
// krzywa wstecz (bez odbicia przez framugę). Plik zapętla animację co
// 1,33 s - w grze gra raz.
//
// Kolizja i reguły gry zmieniają się od razu po kliknięciu (blok zmienia
// numer); animacja jest tylko obrazem. Bloki drzwi i klap chunk indeksuje
// (Chunk.torches - komórki z modelami), mesher ich nie rysuje.
//
// Cień słońca: każda płyta ma kopię w World.modelShadowScene (rysowaną do
// bliskiej mapy cieni) - cień idzie razem z animacją.
// ------------------------------------------------------------

const LAYER = CHUNK_SIZE * CHUNK_SIZE;
const SYNC_SECONDS = 0.25;

// Klatki kluczowe animacji (czas w s, kąt w stopniach).
export const DOOR_KEYFRAMES = [[0, 0], [0.25, -90], [0.29167, -95], [0.33333, -90], [0.375, -87.5], [0.41667, -90]];
export const TRAPDOOR_KEYFRAMES = [[0, 0], [0.25, 90], [0.29167, 92.5], [0.33333, 90], [0.375, 87.5], [0.41667, 90]];
export const DOOR_ANIMATION_SECONDS = DOOR_KEYFRAMES.at(-1)[0];

function opening(keyframes, t) {
    if (t <= 0) return 0;
    const full = keyframes.at(-1)[1];
    for (let i = 1; i < keyframes.length; i++) {
        const [t1, a1] = keyframes[i];
        if (t <= t1) {
            const [t0, a0] = keyframes[i - 1];
            return (a0 + (a1 - a0) * (t - t0) / (t1 - t0)) / full;
        }
    }
    return 1;
}

// Otwarcie 0-1 (z odbiciem ponad 1) po czasie t od początku otwierania.
export const doorOpening = (t) => opening(DOOR_KEYFRAMES, t);
export const trapdoorOpening = (t) => opening(TRAPDOOR_KEYFRAMES, t);

// Zawias drzwi w układzie "north" (komórka 0-1): lewy - 1/16 od zachodu,
// prawy - 1/16 od wschodu; środek grubości płyty.
const PIVOT = { left: [1 / 16, 1 / 16], right: [15 / 16, 1 / 16] };

// Zawias klapy: 1/16 od północnego brzegu, w środku grubości płyty.
const TRAPDOOR_PIVOT = { bottom: [1 / 16, 1 / 16], top: [15 / 16, 1 / 16] };

// Płyta modelu w układzie zawiasu (view.pivot): pudełko w komórce i punkt
// zawiasu, który trzeba od niego odjąć. Dla nakładek na model (pęknięcia).
export function hingedPlate(view) {
    if (view.kind === 'trapdoor') {
        const [py, pz] = TRAPDOOR_PIVOT[view.variant];
        return { box: view.variant === 'top' ? [0, 14 / 16, 0, 1, 1, 1] : [0, 0, 0, 1, 2 / 16, 1], offset: [0.5, py, pz], tall: false };
    }
    const [px, pz] = PIVOT[view.variant];
    return { box: [0, 0, 0, 1, 2, 2 / 16], offset: [px, 0, pz], tall: true };
}

export class DoorRenderer {

    constructor(game) {
        this.game = game;
        this.views = new Map();
        // Komórka "x,y,z" -> model (drzwi zajmują dwie).
        this.cells = new Map();
        this.chunks = new Map();
        this.geometries = new Map();
        this.syncWait = 0;
        this.cell = [0, 0, 0];
        this.time = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
    }

    // variant: zawias drzwi ('left', 'right') albo połowa klapy ('bottom', 'top').
    geometry(kind, texture, variant) {
        const key = `${kind}:${texture}:${variant}`;
        if (!this.geometries.has(key)) {
            let geometry;
            if (kind === 'trapdoor') {
                const [py, pz] = TRAPDOOR_PIVOT[variant];
                geometry = buildFacesGeometry(trapdoorFaces(texture, variant));
                geometry.translate(-0.5, -py, -pz);
            }
            else {
                const [px, pz] = PIVOT[variant];
                geometry = buildFacesGeometry(doorFaces(texture, variant));
                geometry.translate(-px, 0, -pz);
            }
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
        const trapdoor = info.kind === 'trapdoor';
        const variant = trapdoor ? info.half : info.hinge;
        const group = new THREE.Group();
        group.position.set(x + 0.5, y, z + 0.5);
        group.rotation.y = TABLE_ROTATION[info.facing] ?? 0;
        const pivot = new THREE.Group();
        if (trapdoor) {
            const [py, pz] = TRAPDOOR_PIVOT[variant];
            pivot.position.set(0, py, pz - 0.5);
        }
        else {
            const [px, pz] = PIVOT[variant];
            pivot.position.set(px - 0.5, 0, pz - 0.5);
        }
        const geometry = this.geometry(info.kind, info.texture, variant);
        const mesh = new THREE.Mesh(geometry, material);
        pivot.add(mesh);
        group.add(pivot);
        this.game.scene.add(group);
        // Kopia do mapy cieni: ta sama geometria, macierz przepisywana
        // z modelu przy każdej zmianie położenia.
        const shadow = new THREE.Mesh(geometry, MODEL_CASTER_MATERIAL);
        shadow.matrixAutoUpdate = false;
        shadow.frustumCulled = false;
        this.game.world.modelShadowScene?.add(shadow);
        const view = { key, x, y, z, kind: info.kind, variant, facing: info.facing, group, pivot, mesh, shadow, material, lighting,
            shape: `${info.kind}:${info.texture}:${variant}:${info.facing}`,
            open: info.open, from: info.open ? 1 : 0, started: -Infinity, posed: NaN };
        this.views.set(key, view);
        this.cells.set(`${x},${y},${z}`, view);
        if (!trapdoor) this.cells.set(`${x},${y + 1},${z}`, view);
        this.pose(view);
        this.updateLight(view);
        return view;
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        this.onRemove?.(view);
        view.group.removeFromParent();
        view.shadow.removeFromParent();
        view.material.dispose();
        this.views.delete(key);
        for (const dy of [0, 1]) {
            const cell = `${view.x},${view.y + dy},${view.z}`;
            if (this.cells.get(cell) === view) this.cells.delete(cell);
        }
        this.game.shadows?.markModel(view.x, view.y, view.z);
    }

    // Model w komórce (x, y, z) - drzwi (obie komórki) albo klapa - albo
    // undefined. Dla pęknięć (BlockCracks.js): view.pivot to płyta w ruchu.
    viewAt(x, y, z) {
        return this.views.size ? this.cells.get(`${x},${y},${z}`) : undefined;
    }

    // Otwarcie teraz (0-1 z odbiciem) - animacja od zmiany stanu.
    opening(view) {
        const t = this.time - view.started;
        const curve = (view.kind === 'trapdoor' ? trapdoorOpening : doorOpening)(Math.min(t, DOOR_ANIMATION_SECONDS));
        return view.open ? view.from + (1 - view.from) * curve : Math.max(0, view.from * (1 - curve));
    }

    // Czy model jeszcze się porusza.
    moving(view) {
        return this.time - view.started < DOOR_ANIMATION_SECONDS;
    }

    pose(view) {
        const amount = this.opening(view);
        if (amount === view.posed) return;
        view.posed = amount;
        if (view.kind === 'trapdoor') {
            // Dolna klapa wstaje (wolny brzeg w górę), górna opada.
            view.pivot.rotation.x = Math.PI / 2 * amount * (view.variant === 'top' ? 1 : -1);
        }
        else {
            view.pivot.rotation.y = -Math.PI / 2 * amount * (view.variant === 'right' ? -1 : 1);
        }
        view.group.updateMatrixWorld(true);
        view.shadow.matrixWorld.copy(view.mesh.matrixWorld);
        this.game.shadows?.markModel(view.x, view.y, view.z);
    }

    // Komórka, z której płyta bierze światło: własna albo - gdy kamera
    // patrzy na płytę od strony ściany, którą ta zasłania - sąsiednia za
    // tą ścianą. Dzięki temu zamknięte drzwi oglądane z ciemnego pokoju
    // są ciemne, a nie oświetlone słońcem z drugiej strony.
    lightCell(view, out) {
        out[0] = view.x; out[1] = view.y; out[2] = view.z;
        const world = this.game.world, camera = this.game.camera?.position;
        const mask = world.getBlockId ? FACE_BLOCK[world.getBlockId(view.x, view.y, view.z)] : 0;
        if (!mask || !camera) return out;
        for (let k = 0; k < 6; k++) {
            if (!(mask & (1 << k))) continue;
            const axis = k >> 1, sign = k & 1 ? 1 : -1;
            // Kierunki 0-5: zachód, wschód, północ, południe, góra, dół.
            const index = axis === 0 ? 0 : axis === 1 ? 2 : 1;
            const direction = axis === 2 ? -sign : sign;
            const plane = out[index] + (direction > 0 ? 1 : 0);
            const position = index === 0 ? camera.x : index === 1 ? camera.y : camera.z;
            if ((position - plane) * direction > 0) {
                out[index] += direction;
                // Za płytą jest ściana (np. otwarte drzwi stojące przy
                // murze) - tam światła nie ma, zostaje własna komórka.
                if (isOpaqueId(world.getBlockId(out[0], out[1], out[2]))) out[index] -= direction;
            }
            break;
        }
        return out;
    }

    updateLight(view) {
        const [lx, ly, lz] = this.lightCell(view, this.cell);
        const light = this.game.world.getLight(lx, ly, lz);
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
                if (info?.kind === 'door' ? info.part !== 'lower' : info?.kind !== 'trapdoor') continue;
                const key = `${chunk.cx},${chunk.cz}:${index}`;
                keys.add(key);
                const shape = `${info.kind}:${info.texture}:${info.kind === 'trapdoor' ? info.half : info.hinge}:${info.facing}`;
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
