import * as THREE from 'three';

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { shapeBoxes, connectMask } from '../world/ShapeBoxes.js';

import { atlasReady, loadPackImage, getAtlasAverage } from '../rendering/TextureAtlas.js';
import { loadTextureRegion } from '../rendering/TextureSheets.js';
import { hingedPlate } from '../rendering/DoorRenderer.js';

// ------------------------------------------------------------
// PĘKNIĘCIA KOPANEGO BLOKU (tryb przygody; nowy wygląd 1.16.0)
//
// Na kopany blok kładziemy odrobinę większą kopię jego kształtu z rysunkiem
// pęknięć Kamila: 8 etapów w siatce 4 x 2 (etap 0 z lewej u góry) -
//   cracks.png       klatki 16 x 16 - bloki, półbloki, schody, płoty, klapy,
//   cracks_tall.png  klatki 16 x 32 - modele na dwa bloki (drzwi).
// Rysunek jest szary i półprzezroczysty: nie maluje pikseli, tylko
// PRZYCIEMNIA to, co pod nim (obraz x kolor rysy, tym mocniej, im mniej
// przezroczysty piksel) - rysy pasują więc do każdego bloku i do światła.
// Na bardzo ciemnych blokach przyciemnienia nie byłoby widać, więc tam
// rysy ROZJAŚNIAJĄ (obraz + obraz x rysa); o tym decyduje średni kolor
// tekstury bloku.
//
// Drzwi i klapy: nakładka jest przypięta do ruchomej płyty modelu
// (DoorRenderer.js), więc pęknięcia idą razem z animacją otwierania.
// Roślin (znikają od razu), pochodni, skrzyń i ognisk nie pękamy.
//
// Paczka tekstur ze starym pekniecia.png (10 etapów w pasku, szary 128 =
// "bez zmian") działa po staremu - tym samym mnożeniem co do 1.15.0.
// ------------------------------------------------------------

export const CRACK_STAGES = 8;
const COLUMNS = 4, ROWS = 2;
const LEGACY_STAGES = 10;

// Średnia jasność tekstury (liniowa), poniżej której rysy rozjaśniają.
export const CRACK_DARK_LUMINANCE = 0.07;

// O ile większa od bloku jest nakładka (bloki).
const GROW = 0.002;

function crackTexture() {
    const texture = new THREE.Texture();
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    // Surowe liczby: kolor rysy to mnożnik, nie barwa do pokazania.
    texture.colorSpace = THREE.NoColorSpace;
    return texture;
}

const textures = { square: crackTexture(), tall: crackTexture() };

// Stary format z paczki tekstur (pasek 10 etapów) albo null.
const legacyTexture = new THREE.Texture();
legacyTexture.magFilter = THREE.NearestFilter;
legacyTexture.minFilter = THREE.NearestFilter;
legacyTexture.generateMipmaps = false;
legacyTexture.colorSpace = THREE.SRGBColorSpace;
legacyTexture.repeat.set(1 / LEGACY_STAGES, 1);
let legacy = false;

function setImage(texture, image) {
    texture.image = image;
    texture.needsUpdate = true;
}

const baseReady = Promise.all([
    loadTextureRegion('assets/textures/blocks/cracks.png').then((image) => setImage(textures.square, image)),
    loadTextureRegion('assets/textures/blocks/cracks_tall.png').then((image) => setImage(textures.tall, image))
]).catch((error) => console.warn('Tekstura pęknięć:', error));

// Czy obrazek pęknięć jest w starym formacie (pasek 10 etapów).
export const isLegacyCracks = (width, height) => width === height * LEGACY_STAGES;

// Pęknięcia z paczki tekstur (TexturePacks.js: pekniecia.png
// i pekniecia_wysokie.png) - zamiast oryginalnych, gdy paczka je ma.

atlasReady.then(async ({ extras }) => {

    await baseReady;

    try {
        if (extras?.cracks) {
            const image = await loadPackImage(extras.cracks);
            if (isLegacyCracks(image.width, image.height)) {
                setImage(legacyTexture, image);
                legacy = true;
            }
            else {
                setImage(textures.square, image);
            }
        }
        if (extras?.cracksTall) setImage(textures.tall, await loadPackImage(extras.cracksTall));
    }
    catch (error) {
        console.warn('Paczka tekstur - pęknięcia:', error);
    }

}, () => {});


// Kopia kształtu: pudełka [x0, y0, z0, x1, y1, z1] (w komórce) powiększone
// o GROW, przesunięte o -offset. UV z położenia w komórce (jak tekstura
// bloku); tall - rysunek na dwa bloki wysokości.
export function crackGeometry(boxes, tall = false, offset = [0, 0, 0]) {
    const positions = [], uvs = [], indices = [];
    const height = tall ? 2 : 1;
    const clamp = (value) => Math.min(1, Math.max(0, value));
    const face = (corners, uv) => {
        const base = positions.length / 3;
        for (const corner of corners) {
            positions.push(corner[0] - offset[0], corner[1] - offset[1], corner[2] - offset[2]);
            const [u, v] = uv(corner);
            uvs.push(clamp(u), clamp(v));
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    for (const box of boxes) {
        const x0 = box[0] - GROW, y0 = box[1] - GROW, z0 = box[2] - GROW;
        const x1 = box[3] + GROW, y1 = box[4] + GROW, z1 = box[5] + GROW;
        const side = (flipU, axis) => (c) => [flipU ? 1 - c[axis] : c[axis], c[1] / height];
        face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], side(false, 0));    // +z
        face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], side(true, 0));     // -z
        face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], side(true, 2));     // +x
        face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], side(false, 2));    // -x
        face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], (c) => [c[0], 1 - c[2]]);   // +y
        face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], (c) => [c[0], c[2]]);       // -y
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

const FULL_BOX = [[0, 0, 0, 1, 1, 1]];

// Jak mocno rozjaśniają rysy na ciemnym bloku (1 = dwa razy jaśniej).
const LIGHTEN = 1.1;

const VERTEX = /* glsl */`
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT = /* glsl */`
    uniform sampler2D uMap;
    uniform vec4 uFrame;
    uniform float uLighten;
    varying vec2 vUv;
    void main() {
        vec4 crack = texture2D(uMap, uFrame.xy + vUv * uFrame.zw);
        if (crack.a < 0.004) discard;
        // Obraz gry jest liniowy; mnożnik liczony tak, jak wyglądałby na
        // ekranie (stąd potęga).
        vec3 darken = pow(mix(vec3(1.0), crack.rgb, crack.a), vec3(2.2));
        gl_FragColor = vec4(mix(darken, vec3(crack.a * uLighten), step(0.5, uLighten)), 1.0);
    }
`;


export class BlockCracks {

    // game - do świata (maska płotu) i modeli drzwi (game.doors); może
    // go nie być (wtedy pękają tylko pełne bloki).

    constructor(scene, game = null) {

        this.scene = scene;
        this.game = game;

        this.uniforms = {
            uMap: { value: textures.square },
            uFrame: { value: new THREE.Vector4(0, 0, 1 / COLUMNS, 1 / ROWS) },
            uLighten: { value: 0 }
        };

        // Przyciemnianie: wynik = obraz x rysa. Rozjaśnianie: wynik =
        // obraz + obraz x rysa (czynniki mieszania zmienia setMode).
        // Bez mgły - nakładka tylko mnoży to, co już narysowane.

        this.material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: VERTEX,
            fragmentShader: FRAGMENT,
            transparent: true,
            depthWrite: false,
            fog: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.ZeroFactor,
            blendDst: THREE.SrcColorFactor,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        // Stare pęknięcia z paczki: wynik = tekstura x obraz + obraz x
        // tekstura (2 x mnożenie).

        this.legacyMaterial = new THREE.MeshBasicMaterial({
            map: legacyTexture,
            transparent: true,
            depthWrite: false,
            fog: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.AddEquation,
            blendSrc: THREE.DstColorFactor,
            blendDst: THREE.SrcColorFactor,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });

        this.geometries = new Map();

        this.mesh = new THREE.Mesh(this.geometry('cube', () => crackGeometry(FULL_BOX)), this.material);

        this.mesh.visible = false;

        // Po zwykłych blokach (przezroczystość).
        this.mesh.renderOrder = 2;

        scene.add(this.mesh);

        this.stage = -1;
        this.target = null;
        this.view = null;
        this.tall = false;
        this.dark = false;

    }


    geometry(key, build) {
        if (!this.geometries.has(key)) {
            // (Płoty mają 16 masek na drewno - pamięć nie rośnie bez końca.)
            if (this.geometries.size > 64) {
                for (const [name, geometry] of this.geometries) {
                    if (name !== 'cube' && geometry !== this.mesh?.geometry) {
                        geometry.dispose();
                        this.geometries.delete(name);
                    }
                }
            }
            this.geometries.set(key, build());
        }
        return this.geometries.get(key);
    }


    // Czy tekstura bloku jest tak ciemna, że rysy mają rozjaśniać.

    isDark(texture) {
        const color = texture ? getAtlasAverage(texture) : null;
        if (!color) return false;
        return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b < CRACK_DARK_LUMINANCE;
    }


    // Co i gdzie rysować dla bloku: { key, parent, position, geometry,
    // tall, texture, view } albo null (tego bloku nie pękamy).

    describe(block) {

        const definition = getBlockDefinition(block.type);
        const model = definition?.model ?? 'cube';
        const textureOf = (textures) => textures?.all ?? textures?.side ?? textures?.top ?? null;

        if (model === 'cube' || model === 'leaves') {
            return { key: 'cube', geometry: this.geometry('cube', () => crackGeometry(FULL_BOX)), tall: false,
                texture: textureOf(definition?.textures), view: null };
        }

        const world = this.game?.world;

        if (model === 'shape' && world) {
            const id = world.getBlockId(block.x, block.y, block.z);
            const info = shapeInfo(id);
            if (!info) return null;
            const mask = info.kind === 'fence' ? connectMask((x, y, z) => world.getBlockId(x, y, z), block.x, block.y, block.z) : 0;
            const boxes = shapeBoxes(id, 'render', mask);
            if (!boxes?.length) return null;
            const key = `shape:${id}:${mask}`;
            return { key, geometry: this.geometry(key, () => crackGeometry(boxes)), tall: false,
                texture: textureOf(definition?.textures), view: null };
        }

        if (model === 'door') {
            const view = this.game?.doors?.viewAt(block.x, block.y, block.z);
            if (!view) return null;
            const plate = hingedPlate(view);
            const key = `hinged:${view.kind}:${view.variant}`;
            return { key, geometry: this.geometry(key, () => crackGeometry([plate.box], plate.tall, plate.offset)), tall: plate.tall,
                texture: textureOf(definition?.textures), view };
        }

        return null;

    }


    hide() {
        if (this.view) {
            this.scene.add(this.mesh);
            this.view = null;
        }
        this.mesh.visible = false;
        this.stage = -1;
        this.target = null;
    }


    // block - { x, y, z, type } albo null (nic nie kopiemy),
    // progress - 0-1.

    update(block, progress) {

        if (!block || progress <= 0) {
            this.hide();
            return;
        }

        const target = `${block.x},${block.y},${block.z},${block.type}`;

        // Model drzwi mógł zniknąć (chunk, zmiana kształtu) - szukamy od nowa.
        if (target !== this.target || (this.view && this.game?.doors?.viewAt(block.x, block.y, block.z) !== this.view)) {

            const shape = this.describe(block);

            if (!shape) {
                this.hide();
                return;
            }

            this.target = target;
            this.mesh.geometry = shape.geometry;
            this.tall = shape.tall;
            this.dark = this.isDark(shape.texture);
            this.stage = -1;

            if (shape.view) {
                shape.view.pivot.add(this.mesh);
                this.mesh.position.set(0, 0, 0);
                if (this.game.doors) this.game.doors.onRemove = (view) => { if (view === this.view) this.hide(); };
            }
            else {
                if (this.view) this.scene.add(this.mesh);
                this.mesh.position.set(block.x, block.y, block.z);
            }

            this.view = shape.view;

        }

        this.mesh.material = legacy ? this.legacyMaterial : this.material;

        const stages = legacy ? LEGACY_STAGES : CRACK_STAGES;
        const stage = Math.min(stages - 1, Math.floor(progress * stages));

        if (stage !== this.stage || this.drawnLegacy !== legacy) {

            this.stage = stage;
            this.drawnLegacy = legacy;

            if (legacy) {
                legacyTexture.offset.set(stage / LEGACY_STAGES, 0);
            }
            else {
                const column = stage % COLUMNS, row = Math.floor(stage / COLUMNS);
                // (v tekstury rośnie w górę, etapy idą od górnego wiersza.)
                this.uniforms.uFrame.value.set(column / COLUMNS, 1 - (row + 1) / ROWS, 1 / COLUMNS, 1 / ROWS);
                this.uniforms.uMap.value = this.tall ? textures.tall : textures.square;
                this.uniforms.uLighten.value = this.dark ? LIGHTEN : 0;
                this.material.blendSrc = this.dark ? THREE.DstColorFactor : THREE.ZeroFactor;
                this.material.blendDst = this.dark ? THREE.OneFactor : THREE.SrcColorFactor;
            }

        }

        this.mesh.visible = true;

    }


    dispose() {

        this.mesh.removeFromParent();

        for (const geometry of this.geometries.values()) geometry.dispose();
        this.geometries.clear();

        this.material.dispose();
        this.legacyMaterial.dispose();

    }

}
