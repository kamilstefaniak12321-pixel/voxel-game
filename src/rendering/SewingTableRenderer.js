import * as THREE from 'three';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { atlasReady, getAtlasUV } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { buildExtrudedItemGeometry, ITEM_THICKNESS } from './ExtrudedItemGeometry.js';
import { TABLE_ROTATION, productSpot } from './tableLayout.js';
import { clothFromFiber, isGarment, cleanLook, lookColors } from '../items/clothing.js';
import { recolor, clothColors, clothPixels } from '../ui/garmentIcons.js';
import { ITEM_TYPES } from '../items/ItemRegistry.js';
import { sewingProducts, SEWING_CAPACITY } from '../game/SewingTables.js';

// ------------------------------------------------------------
// STÓŁ KRAWIECKI - CO LEŻY NA BLACIE (1.27.0)
//
// Jak stół stolarski (CarpenterTableRenderer.js): na lewej części (A)
// materiał - pęczki włókna, stos płótna (im więcej, tym wyższy,
// w barwach i we wzorze ze stołu) albo rozłożone ubranie; na prawej (B)
// - cztery wykroje: z tyłu głowa i tułów, z przodu nogi i stopy, od razu
// w kolorach. Na wykrój, na który nie starczy płótna, pada cień.
//
// Ubrania to ikonki z atlasu "wytłoczone" na grubość piksela (jak
// przedmiot w ręce, ExtrudedItemGeometry.js), przemalowane jak ikonki w ekwipunku
// (ui/garmentIcons.js). Tekstury trzymamy w pamięci (klucz: kafelek
// i wygląd), materiały - osobno dla każdego stołu (własne światło).
// ------------------------------------------------------------

const SYNC_SECONDS = 0.2;
const P = 1 / 16;

// Rozmiary na blacie (w blokach).
const PRODUCT_SCALE = 0.44, GARMENT_SCALE = 0.82, FIBER_SCALE = 0.62;

// Cień na wykroju, na który nie starczy płótna.
const SHORT_SHADE = 0.42;

// Kafelek atlasu przedmiotu.
const tileOf = (type) => ITEM_TYPES[type]?.icon ?? type;

export class SewingTableRenderer {

    constructor(game, tables) {
        this.game = game;
        this.tables = tables;
        this.views = new Map();
        this.geometries = new Map();
        this.textures = new Map();
        this.syncWait = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
        this.atlas = null;
        atlasReady.then((atlas) => {
            this.atlas = atlas;
            this.version = -1;
        }).catch(() => {});
    }

    geometry(key, build) {
        if (!this.geometries.has(key)) this.geometries.set(key, build());
        return this.geometries.get(key);
    }

    // Ikonka "wytłoczona", leżąca na blacie: wierzch obrazka do góry,
    // góra obrazka dalej od patrzącego (przód stołu: -z), UV 0-1 (własna
    // tekstura zamiast atlasu).
    flatGeometry(texture) {
        return this.geometry(`flat:${texture}`, () => {
            const geometry = buildExtrudedItemGeometry(texture);
            const tile = getAtlasUV(texture);
            const uv = geometry.getAttribute('uv');
            for (let i = 0; i < uv.count; i++) {
                uv.setXY(i, (uv.getX(i) - tile.uMin) / (tile.uMax - tile.uMin), (uv.getY(i) - tile.vMin) / (tile.vMax - tile.vMin));
            }
            geometry.rotateX(-Math.PI / 2);
            geometry.rotateY(Math.PI);
            geometry.translate(0, ITEM_THICKNESS / 2, 0);
            return geometry;
        });
    }

    // Stos płótna: warstwy po 1 px (do 8), boki - pasek wzoru tej wysokości.
    pileGeometry(layers) {
        return this.geometry(`pile:${layers}`, () => {
            const height = layers * P;
            const geometry = new THREE.BoxGeometry(13 * P, height, 11 * P);
            geometry.translate(0, height / 2, 0);
            const uv = geometry.getAttribute('uv');
            // Ściany: +x, -x, +y, -y, +z, -z (po 4 rogi) - boki bez góry i dołu.
            for (const face of [0, 1, 4, 5]) {
                for (let i = face * 4; i < face * 4 + 4; i++) uv.setY(i, 0.5 + (uv.getY(i) - 0.5) * layers / 16);
            }
            return geometry;
        });
    }

    // Tekstura z kafelka atlasu (przemalowana, gdy ubranie ma wygląd).
    itemTexture(type, look) {
        const clean = cleanLook(look);
        const key = `${type}|${clean.pattern}|${clean.main}|${clean.accent}`;
        if (this.textures.has(key)) return this.textures.get(key);
        const atlas = this.atlas;
        const tile = getAtlasUV(tileOf(type), 0);
        const image = atlas.iconImage, size = atlas.iconTileSize;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.imageSmoothingEnabled = false;
        context.drawImage(image, Math.round(tile.uMin * image.width), Math.round((1 - tile.vMax) * image.height), size, size, 0, 0, size, size);
        if (isGarment(type) && (clean.main || clean.accent || clean.pattern !== 'plain')) {
            const pixels = context.getImageData(0, 0, size, size);
            recolor(pixels.data, size, lookColors(type, null), lookColors(type, clean));
            context.putImageData(pixels, 0, 0);
        }
        return this.keep(key, canvas);
    }

    clothTexture(colors) {
        const key = `cloth|${colors.pattern}|${colors.main}|${colors.accent}`;
        if (this.textures.has(key)) return this.textures.get(key);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        canvas.getContext('2d').putImageData(new ImageData(clothPixels(colors), 16, 16), 0, 0);
        return this.keep(key, canvas);
    }

    keep(key, canvas) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        texture.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(key, texture);
        return texture;
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
        const group = new THREE.Group();
        this.game.scene.add(group);
        const view = { key, table, group, lighting, materials: [], signature: '' };
        this.views.set(key, view);
        return view;
    }

    material(view, texture, shade = 1) {
        const material = createModelMaterial({ map: texture, alphaTest: 0.5, lighting: view.lighting });
        if (shade !== 1) material.color.setScalar(shade);
        setPotatoDefine([material], this.lowDetail);
        view.materials.push(material);
        return material;
    }

    clearView(view) {
        view.group.clear();
        for (const material of view.materials) material.dispose();
        view.materials = [];
    }

    removeView(key) {
        const view = this.views.get(key);
        if (!view) return;
        this.clearView(view);
        view.group.removeFromParent();
        this.views.delete(key);
    }

    add(view, geometry, material, x, z, scale = 1, turn = 0, lift = 0) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, lift, z);
        mesh.scale.setScalar(scale);
        mesh.rotation.y = turn;
        view.group.add(mesh);
        return mesh;
    }

    // Zawartość blatu po zmianie (materiał, barwy, kroje, kierunek stołu).
    rebuild(view, a) {
        const { table } = view;
        const material = table.material;
        const products = sewingProducts(table);
        const signature = JSON.stringify([material, table.main, table.accent, table.pattern, products.map((product) => product && [product.kind, product.enough]), a.x, a.z, a.facing]);
        if (signature === view.signature) return;
        view.signature = signature;
        this.clearView(view);
        view.group.position.set(a.x + .5, a.y + 1, a.z + .5);
        view.group.rotation.y = TABLE_ROTATION[a.facing] ?? 0;
        if (!material) return;
        const type = material.type;

        if (clothFromFiber(type)) {
            // Pęczki włókna: do czterech, lekko przekręcone, jeden na drugim.
            const texture = this.itemTexture(type);
            const bundles = Math.max(1, Math.min(4, Math.ceil(material.count / 16)));
            for (let i = 0; i < bundles; i++) {
                this.add(view, this.flatGeometry(tileOf(type)), this.material(view, texture),
                    (i % 2 ? 0.06 : -0.05), (i > 1 ? 0.07 : -0.04), FIBER_SCALE, (i - 1.5) * 0.35, i * ITEM_THICKNESS * FIBER_SCALE);
            }
        }
        else if (isGarment(type)) {
            const texture = this.itemTexture(type, material.look);
            this.add(view, this.flatGeometry(tileOf(type)), this.material(view, texture), 0, 0, GARMENT_SCALE, 0.05);
        }
        else {
            const layers = Math.max(1, Math.min(8, Math.ceil(material.count / SEWING_CAPACITY * 8)));
            const texture = this.clothTexture(clothColors(type, table));
            this.add(view, this.pileGeometry(layers), this.material(view, texture), 0, 0, 1, 0.04);
        }

        products.forEach((product, index) => {
            if (!product) return;
            const spot = productSpot(index);
            const texture = this.itemTexture(product.item.type, product.item.look);
            this.add(view, this.flatGeometry(tileOf(product.item.type)), this.material(view, texture, product.enough ? 1 : SHORT_SHADE),
                spot.x, spot.z, PRODUCT_SCALE);
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
        if (!this.atlas) return;
        this.syncWait -= dt;
        const changed = this.tables.version !== this.version;
        if (this.syncWait > 0 && !changed) return;
        this.syncWait = SYNC_SECONDS;
        this.version = this.tables.version;
        const world = this.game.world, keep = new Set();
        for (const [key, table] of this.tables.tables) {
            if (!world.getChunk(world.toChunkCoord(table.x), world.toChunkCoord(table.z))) continue;
            const a = this.tables.tableAt(table);
            if (!a || !table.material) continue;
            keep.add(key);
            const view = this.views.get(key) ?? this.createView(key, table);
            view.table = table;
            this.rebuild(view, a);
            this.updateLight(view, a);
        }
        for (const key of [...this.views.keys()]) if (!keep.has(key)) this.removeView(key);
    }

    dispose() {
        for (const key of [...this.views.keys()]) this.removeView(key);
        for (const geometry of this.geometries.values()) geometry.dispose();
        for (const texture of this.textures.values()) texture.dispose();
        this.geometries.clear();
        this.textures.clear();
    }
}
