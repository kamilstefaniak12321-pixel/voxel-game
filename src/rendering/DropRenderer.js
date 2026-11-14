import * as THREE from 'three';
import { SHADOW_INDOOR_DARKNESS } from '../config.js';
import { COLOR_LEVEL, lightToBrightness } from '../world/Light.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture } from './TextureAtlas.js';
import { setPotatoDefine } from './BlockRenderData.js';
import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { isItemType } from '../items/ItemRegistry.js';
import { buildBlockGeometry } from '../player/PlayerModel.js';
import { warmupObject, COLORED_MODEL_ATTRIBUTES } from './ShaderWarmup.js';

// ------------------------------------------------------------
// WYRZUCONE PRZEDMIOTY - RYSOWANIE (0.100.0)
//
// Każdy leżący przedmiot (game/Drops.js) to pomniejszony model: blok -
// mała kostka, przedmiot - ten sam gruby obrazek co w ręce. Powoli się
// obraca i lekko unosi, żeby było go widać w trawie. Większy stos -
// kilka modeli obok siebie.
//
// Geometria jest ta sama co w dłoni gracza (PlayerModel.buildBlockGeometry),
// więc nowy przedmiot albo blok dostaje model sam.
// ------------------------------------------------------------

// Jak daleko od gracza rysujemy przedmioty (bloki).
const VIEW_DISTANCE = 48;
// Rozmiar: blok i płaski przedmiot (część bloku).
const BLOCK_SCALE = 0.26;
const ITEM_SCALE = 0.4;
const SPIN = 1.1;          // radiany na sekundę
const BOB = 0.045;         // unoszenie (bloki)
const LIGHT_SECONDS = 0.4;

// Ile modeli pokazuje stos: 1 sztuka - 1, kilka - 2, dużo - 3.
const copiesOf = (count) => (count >= 16 ? 3 : count >= 2 ? 2 : 1);
const COPY_OFFSETS = [[0, 0, 0], [0.09, 0.05, 0.06], [-0.08, 0.1, -0.05]];

export class DropRenderer {

    constructor(game) {
        this.game = game;
        this.views = new Map();
        this.geometries = new Map();
        this.clock = 0;
        this.lowDetail = Boolean(game.settings?.get('potato'));
    }

    setLowDetail(on) {
        this.lowDetail = Boolean(on);
        for (const view of this.views.values()) setPotatoDefine([view.material], this.lowDetail);
        if (this.prototypes) setPotatoDefine(this.prototypes.map((object) => object.material), this.lowDetail);
    }

    // Model przedmiotu: wyśrodkowany, dołem na wysokości 0.
    geometry(type) {
        if (!this.geometries.has(type)) {
            const geometry = buildBlockGeometry(type);
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            if (box && Number.isFinite(box.min.x)) {
                geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
            }
            this.geometries.set(type, geometry);
        }
        return this.geometries.get(type);
    }

    createView(drop) {
        const lighting = {
            uModelSky: { value: 1 },
            uModelBlock: { value: new THREE.Vector3() },
            uModelSun: { value: 1 },
            uModelAmbient: { value: 1 },
            uModelDistantShadows: { value: 1 },
            uModelBounce: { value: new THREE.Vector3() }
        };
        const block = isItemType(drop.type) ? null : getBlockDefinition(drop.type);
        const cube = block && (block.model ?? 'cube') === 'cube';
        // Rośliny i przedmioty mają przezroczyste tło tekstury.
        const material = cube
            ? createModelMaterial({ map: blockAtlasTexture, lighting })
            : createModelMaterial({ map: blockAtlasTexture, alphaTest: 0.5, vertexColors: true, lighting });
        material.side = THREE.DoubleSide;
        setPotatoDefine([material], this.lowDetail);
        const group = new THREE.Group();
        const geometry = this.geometry(drop.type);
        const flat = Boolean(geometry.userData.extruded) || block?.model === 'flat';
        group.scale.setScalar(flat ? ITEM_SCALE : BLOCK_SCALE);
        this.game.scene.add(group);
        const view = { group, material, lighting, geometry, type: drop.type, copies: 0, phase: Math.random() * Math.PI * 2, lightIn: 0 };
        this.views.set(drop.id, view);
        return view;
    }

    removeView(id) {
        const view = this.views.get(id);
        if (!view) return;
        view.group.removeFromParent();
        view.material.dispose();
        this.views.delete(id);
    }

    updateLight(view, drop) {
        const game = this.game;
        const light = game.world.getLight(Math.floor(drop.x), Math.floor(drop.y + 0.3), Math.floor(drop.z));
        const brightness = game.sky?.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = brightness(light.sky);
        const strongest = Math.max(light.red, light.green, light.blue);
        const lamp = strongest > 0 ? brightness(COLOR_LEVEL[strongest]) / strongest : 0;
        view.lighting.uModelSky.value = sky;
        view.lighting.uModelBlock.value.set(light.red * lamp, light.green * lamp, light.blue * lamp);
        const ambientStrength = game.shadows?.active ? (game.shadows.ambientStrength ?? 0) : 0;
        view.lighting.uModelSun.value = sky ** 2.2;
        view.lighting.uModelAmbient.value = sky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);
    }

    // Co klatkę: drops - Map z game/Drops.js.
    update(dt, drops) {
        this.clock += dt;
        const player = this.game.player.pos;
        const keep = new Set();

        for (const drop of drops.values()) {
            if (Math.abs(drop.x - player.x) > VIEW_DISTANCE || Math.abs(drop.z - player.z) > VIEW_DISTANCE) continue;
            keep.add(drop.id);
            let view = this.views.get(drop.id);
            if (view && view.type !== drop.type) { this.removeView(drop.id); view = null; }
            view ??= this.createView(drop);

            // Stos urósł albo zmalał - tyle modeli, ile trzeba.
            const copies = copiesOf(drop.count);
            if (copies !== view.copies) {
                view.group.clear();
                for (let i = 0; i < copies; i++) {
                    const mesh = new THREE.Mesh(view.geometry, view.material);
                    const scale = 1 / view.group.scale.x;
                    mesh.position.set(COPY_OFFSETS[i][0] * scale, COPY_OFFSETS[i][1] * scale, COPY_OFFSETS[i][2] * scale);
                    mesh.rotation.y = i * 1.3;
                    view.group.add(mesh);
                }
                view.copies = copies;
            }

            const bob = drop.rest ? (Math.sin(this.clock * 2.2 + view.phase) + 1) * BOB : 0;
            view.group.position.set(drop.x, drop.y + 0.06 + bob, drop.z);
            view.group.rotation.y = this.clock * SPIN + view.phase;

            view.lightIn -= dt;
            if (view.lightIn <= 0) {
                view.lightIn = LIGHT_SECONDS;
                this.updateLight(view, drop);
            }
        }

        for (const id of [...this.views.keys()]) if (!keep.has(id)) this.removeView(id);
    }

    // Wzory dla programów cieniujących (rendering/ShaderWarmup.js): blok
    // i przedmiot. Każdy wyrzucony przedmiot ma własny materiał, a Three
    // kasuje program, gdy zniknie ostatni - bez wzorów pierwszy przedmiot
    // po przerwie kompilowałby go od nowa.
    shaderPrototypes() {
        if (!this.prototypes) {
            const lighting = () => ({
                uModelSky: { value: 1 }, uModelBlock: { value: new THREE.Vector3() }, uModelSun: { value: 1 },
                uModelAmbient: { value: 1 }, uModelDistantShadows: { value: 1 }, uModelBounce: { value: new THREE.Vector3() }
            });
            const materials = [
                createModelMaterial({ map: blockAtlasTexture, lighting: lighting() }),
                createModelMaterial({ map: blockAtlasTexture, alphaTest: 0.5, vertexColors: true, lighting: lighting() })
            ];
            for (const material of materials) material.side = THREE.DoubleSide;
            setPotatoDefine(materials, this.lowDetail);
            this.prototypes = materials.map((material) => warmupObject(material, COLORED_MODEL_ATTRIBUTES));
        }
        return this.prototypes;
    }

    dispose() {
        for (const object of this.prototypes ?? []) { object.geometry.dispose(); object.material.dispose(); }
        this.prototypes = null;
        for (const id of [...this.views.keys()]) this.removeView(id);
        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();
    }
}
