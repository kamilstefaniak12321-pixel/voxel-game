import * as THREE from 'three';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { boxFaces, buildFacesGeometry, itemShapeFaces } from './ShapeGeometry.js';
import { shapeBaseType } from '../blocks/woodShapes.js';
import { woodOfPlanks } from '../blocks/woods.js';
import { TABLE_PRODUCTS, TABLE_CAPACITY, BENCH_PRODUCTS } from '../game/CarpenterTables.js';

// ------------------------------------------------------------
// STÓŁ STOLARSKI - CO LEŻY NA BLACIE (0.90.0)
//
// Na lewej części (A) - stos desek (im więcej, tym wyższy), na prawej (B)
// - małe modele wyrobów z tego drewna w czterech ćwiartkach (schody,
// półblok z przodu, płot, furtka z tyłu), tylko te, na które starczy
// desek. Klik w ćwiartkę - CarpenterTables.takeProduct. Model stołu
// rysuje ChunkMesher (pudełka z ShapeBoxes.js), tu - tylko blat.
//
// Podwójny warsztat (układ z 0.93.0, CarpenterTables.bench): zamiast
// zwykłych wyrobów - drzwi i klapa w prawdziwym rozmiarze. Drzwi leżą na
// dwóch blokach blatu, klapa na jednym; obie lekko przekręcone, żeby nie
// zlewały się z blatem.
// ------------------------------------------------------------

const SYNC_SECONDS = 0.2;
const P = 1 / 16;
export const TABLE_ROTATION = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };

// Środek ćwiartki wyrobu (układ stołu przodem na północ, względem środka
// części A; część B leży na -x).
export function productSpot(index) {
    const column = index % 2, row = Math.floor(index / 2);
    return { x: (column === 0 ? 0.75 : 0.25) - 1.5, z: (row === 0 ? 0.25 : 0.75) - 0.5 };
}

const MINI_SCALE = 0.36;

// Przekręcenie drzwi i klapy na blacie (radiany) i uniesienie jednego końca.
const DOOR_SKEW = 0.07, TRAPDOOR_SKEW = 0.09, LEAN = 0.035;

export class CarpenterTableRenderer {

    constructor(game, tables) {
        this.game = game;
        this.tables = tables;
        this.views = new Map();
        this.geometries = new Map();
        this.syncWait = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
    }

    geometry(key, build) {
        if (!this.geometries.has(key)) this.geometries.set(key, build());
        return this.geometries.get(key);
    }

    // Stos desek: deski 14 x 4 px, warstwy po 3, do 8 warstw.
    pileGeometry(texture, boards) {
        return this.geometry(`pile:${texture}:${boards}`, () => {
            const boxes = [];
            for (let i = 0; i < boards; i++) {
                const layer = Math.floor(i / 3), slot = i % 3;
                const across = layer % 2 === 1;
                const a = 2 + slot * 4, b = a + 4;
                boxes.push(across
                    ? [a * P - .5, layer * P, 1 * P - .5, b * P - .5, (layer + 1) * P, 15 * P - .5]
                    : [1 * P - .5, layer * P, a * P - .5, 15 * P - .5, (layer + 1) * P, b * P - .5]);
            }
            return buildFacesGeometry(boxFaces(boxes, texture));
        });
    }

    miniGeometry(type) {
        return this.geometry(`mini:${type}`, () => {
            const geometry = buildFacesGeometry(itemShapeFaces(type));
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
            geometry.scale(MINI_SCALE, MINI_SCALE, MINI_SCALE);
            // Schody stopniami do gracza (przód stołu).
            geometry.rotateY(Math.PI);
            return geometry;
        });
    }

    // Wyrób w prawdziwym rozmiarze, leżący na blacie (środek na dole).
    realGeometry(type, door) {
        return this.geometry(`real:${type}`, () => {
            const geometry = buildFacesGeometry(itemShapeFaces(type));
            if (door) geometry.rotateX(-Math.PI / 2);
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
            return geometry;
        });
    }

    createView(key, table) {
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
        this.game.scene.add(group);
        const view = { key, table, group, material, lighting, signature: '' };
        this.views.set(key, view);
        return view;
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        view.group.removeFromParent();
        view.material.dispose();
        this.views.delete(key);
    }

    // Podwójny warsztat: drzwi na dwóch blokach i klapa na jednym (układ
    // świata, względem bloku z deskami).
    rebuildBench(view, bench) {
        const { table } = view;
        const wood = woodOfPlanks(table.planks);
        const { planks, trapdoor, door } = bench;
        const signature = `bench:${table.planks}:${table.count >= BENCH_PRODUCTS.door.planks}:${table.count >= BENCH_PRODUCTS.trapdoor.planks}:${planks.x},${planks.z}:${trapdoor.x},${trapdoor.z}:${door[1].x},${door[1].z}`;
        if (signature === view.signature) return;
        view.signature = signature;
        view.group.clear();
        view.group.position.set(planks.x + .5, planks.y + 1, planks.z + .5);
        view.group.rotation.y = 0;
        if (!wood || table.count <= 0) return;
        if (table.count >= BENCH_PRODUCTS.door.planks) {
            const mesh = new THREE.Mesh(this.realGeometry(shapeBaseType(wood.wood, 'door'), true), view.material);
            mesh.position.set((door[0].x + door[1].x) / 2 - planks.x, LEAN * 0.5, (door[0].z + door[1].z) / 2 - planks.z);
            // Długość drzwi wzdłuż obu bloków.
            mesh.rotation.order = 'YXZ';
            mesh.rotation.y = (door[0].x !== door[1].x ? Math.PI / 2 : 0) + DOOR_SKEW;
            mesh.rotation.x = LEAN;
            view.group.add(mesh);
        }
        if (table.count >= BENCH_PRODUCTS.trapdoor.planks) {
            const mesh = new THREE.Mesh(this.realGeometry(shapeBaseType(wood.wood, 'trapdoor'), false), view.material);
            mesh.position.set(trapdoor.x - planks.x, LEAN * 0.5, trapdoor.z - planks.z);
            mesh.rotation.order = 'YXZ';
            mesh.rotation.y = TRAPDOOR_SKEW;
            mesh.rotation.x = -LEAN;
            view.group.add(mesh);
        }
    }

    // Zawartość blatu po zmianie (deski, ich liczba, kierunek stołu).
    // products: false - same deski (podwójny warsztat).
    rebuild(view, a, products = true) {
        const { table } = view;
        const wood = woodOfPlanks(table.planks);
        const signature = `${table.planks}:${table.count}:${a.x},${a.z}:${a.facing}:${products}`;
        if (signature === view.signature) return;
        view.signature = signature;
        view.group.clear();
        view.group.position.set(a.x + .5, a.y + 1, a.z + .5);
        view.group.rotation.y = TABLE_ROTATION[a.facing] ?? 0;
        if (!wood || table.count <= 0) return;
        const boards = Math.max(1, Math.min(24, Math.ceil(table.count / TABLE_CAPACITY * 24)));
        view.group.add(new THREE.Mesh(this.pileGeometry(wood.texture, boards), view.material));
        if (!products) return;
        TABLE_PRODUCTS.forEach((product, index) => {
            if (table.count < product.planks) return;
            const mesh = new THREE.Mesh(this.miniGeometry(shapeBaseType(wood.wood, product.kind)), view.material);
            const spot = productSpot(index);
            mesh.position.set(spot.x, 0, spot.z);
            view.group.add(mesh);
        });
    }

    updateLight(view, a) {
        const light = this.game.world.getLight(a.x, a.y + 1, a.z);
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

    update(dt) {
        this.syncWait -= dt;
        const changed = this.tables.version !== this.version;
        if (this.syncWait > 0 && !changed) return;
        this.syncWait = SYNC_SECONDS;
        this.version = this.tables.version;
        const world = this.game.world, keep = new Set();
        for (const [key, table] of this.tables.tables) {
            if (!world.getChunk(world.toChunkCoord(table.x), world.toChunkCoord(table.z))) continue;
            const a = this.tables.tableAt(table);
            if (!a || table.count <= 0) continue;
            keep.add(key);
            const view = this.views.get(key) ?? this.createView(key, table);
            view.table = table;
            // Podwójny warsztat: same deski, a na reszcie blatu drzwi i klapa.
            const bench = this.tables.bench?.(a);
            this.rebuild(view, a, !bench);
            this.updateLight(view, a);
            if (bench) {
                const benchKey = `bench:${key}`;
                keep.add(benchKey);
                const benchView = this.views.get(benchKey) ?? this.createView(benchKey, table);
                benchView.table = table;
                this.rebuildBench(benchView, bench);
                this.updateLight(benchView, bench.door[1]);
            }
        }
        for (const key of [...this.views.keys()]) if (!keep.has(key)) this.removeView(key);
    }

    dispose() {
        for (const key of [...this.views.keys()]) this.removeView(key);
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
    }
}
