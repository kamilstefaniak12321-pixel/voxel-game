// ------------------------------------------------------------
// ŚCINANIE DRZEW - OBRAZ (1.36.0, game/Felling.js)
//
// Dwie rzeczy:
//
//   1. PADAJĄCE DRZEWO: w chwili ostatniego ciosu bloki drzewa znikają
//      ze świata, a zamiast nich powstaje JEDNA bryła (dwie siatki:
//      kłody i liście) - te same bloki, bez ścian między kłodami. Bryła obraca
//      się wokół krawędzi pniaka. Po upadku znika (zostaje leżący pień
//      z bloków).
//
//   2. KARB: jasny pas odsłoniętego drewna na tej ścianie pnia, w którą
//      bije siekiera. Rośnie z każdym ciosem.
//
// Światło bryły i karbu bierze się z jednego miejsca świata (jak
// przedmiot w ręce) - ModelMaterial.js.
// ------------------------------------------------------------
import * as THREE from 'three';
import { getBlockDefinition, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { TREE_SPECIES } from '../blocks/trees.js';
import { createModelMaterial } from './ModelMaterial.js';
import { blockAtlasTexture, getAtlasUV, getTileColors } from './TextureAtlas.js';
import { getFaceTexture, FACE_NAMES } from './BlockRenderData.js';
import { atmosphericLightToBrightness } from './LightPolicy.js';
import { seasonLeafColor, leafPhase } from './LeafSeasons.js';
import { warmupObject } from './ShaderWarmup.js';

// Ściany bloku: kierunek i cztery rogi (przeciwnie do ruchu wskazówek
// zegara, patrząc z zewnątrz), kolejność jak FACE_NAMES.
const FACES = [
    { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

const newLighting = () => ({ uModelSky: { value: 1 }, uModelBlock: { value: new THREE.Vector3() }, uModelSun: { value: 1 },
    uModelDistantShadows: { value: 1 }, uModelBounce: { value: new THREE.Vector3() } });

function buildGeometry(parts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(parts.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(parts.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(parts.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(parts.colors, 3));
    geometry.setIndex(parts.indices);
    geometry.computeBoundingSphere();
    return geometry;
}

const newParts = () => ({ positions: [], normals: [], uvs: [], colors: [], indices: [] });

// Tekstury ścian bloku o numerze id (kafelki atlasu).
const faceUvs = new Map();
function uvOf(id) {
    let uv = faceUvs.get(id);
    if (!uv) {
        const definition = getBlockDefinition(getBlockTypeById(id));
        uv = FACE_NAMES.map((face) => getAtlasUV(getFaceTexture(definition.textures, face)));
        faceUvs.set(id, uv);
    }
    return uv;
}

// Odcień liści o tej porze roku: przez ile mnożyć kolory tekstury
// (średni kolor liści po zmianie pory / przed zmianą).
const tintColor = new THREE.Color(), tintOut = new THREE.Color();
export function leafTint(id, days) {
    const definition = getBlockDefinition(getBlockTypeById(id));
    const colors = getTileColors(definition?.textures?.all);
    if (!colors.length || !definition?.tree || days === null || days === undefined) return [1, 1, 1];
    tintColor.setRGB(0, 0, 0);
    for (const color of colors) tintColor.add(color);
    tintColor.multiplyScalar(1 / colors.length);
    seasonLeafColor(tintColor, definition.tree, leafPhase(days), tintOut, false, true, definition.autumnLeaves === true);
    const ratio = (after, before) => Math.min(3, Math.max(0.2, before > 0.002 ? after / before : 1));
    return [ratio(tintOut.r, tintColor.r), ratio(tintOut.g, tintColor.g), ratio(tintOut.b, tintColor.b)];
}

// Geometria bryły drzewa.
//   logs, leaves - [{x, y, z, id}], origin - {x, y, z} (oś obrotu),
//   days - doba gry (pora roku liści) albo null.
// Zwraca { logs, leaves } (BufferGeometry).
export function treeGeometry(logs, leaves, origin, days = null) {
    const kind = new Map();
    for (const cell of logs) kind.set(`${cell.x},${cell.y},${cell.z}`, 1);
    for (const cell of leaves) kind.set(`${cell.x},${cell.y},${cell.z}`, 2);
    const tints = new Map();
    const build = (cells, leaf) => {
        const parts = newParts();
        for (const cell of cells) {
            const uvs = uvOf(cell.id);
            let tint = [1, 1, 1];
            if (leaf) {
                if (!tints.has(cell.id)) tints.set(cell.id, leafTint(cell.id, days));
                tint = tints.get(cell.id);
            }
            FACES.forEach((face, index) => {
                const near = kind.get(`${cell.x + face.n[0]},${cell.y + face.n[1]},${cell.z + face.n[2]}`);
                // Ściana zasłonięta kłodą. Liście przy liściach zostają: przez
                // prześwity widać głąb korony (jak w świecie), a nie niebo.
                if (near === 1) return;
                const base = parts.positions.length / 3, uv = uvs[index];
                face.c.forEach((corner, i) => {
                    parts.positions.push(cell.x + corner[0] - origin.x, cell.y + corner[1] - origin.y, cell.z + corner[2] - origin.z);
                    parts.normals.push(...face.n);
                    parts.uvs.push(uv.uMin + CORNER_UV[i][0] * (uv.uMax - uv.uMin), uv.vMin + CORNER_UV[i][1] * (uv.vMax - uv.vMin));
                    parts.colors.push(...tint);
                });
                parts.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            });
        }
        return buildGeometry(parts);
    };
    return { logs: build(logs, false), leaves: build(leaves, true) };
}

// Karb: pas jasnego drewna (z ciemniejszym środkiem) na ścianach pnia.
//   notch - { species, y, cells [{x, z}], sides { east, west, south, north }: 0-1 }.
const NOTCH_GAP = 0.006;
// Środek karbu nad dołem bloku i jego wysokość (od pierwszego ciosu do pełnego).
const NOTCH_CENTER = 0.42, NOTCH_MIN = 0.12, NOTCH_MAX = 0.56;
const NOTCH_SIDES = { east: 0, west: 1, south: 4, north: 5 };
export function notchGeometry(notch) {
    const parts = newParts();
    const tree = TREE_SPECIES[notch.species];
    const uv = getAtlasUV(tree.textures.strippedSide);
    const inCut = new Set(notch.cells.map((cell) => `${cell.x},${cell.z}`));
    for (const [side, depth] of Object.entries(notch.sides)) {
        if (!(depth > 0)) continue;
        const face = FACES[NOTCH_SIDES[side]];
        const height = NOTCH_MIN + (NOTCH_MAX - NOTCH_MIN) * Math.min(1, depth);
        for (const cell of notch.cells) {
            // Tylko ściany na zewnątrz pnia.
            if (inCut.has(`${cell.x + face.n[0]},${cell.z + face.n[2]}`)) continue;
            // Pas drewna i ciemniejsza szczelina w środku (głąb karbu).
            for (const [part, shade, gap] of [[1, 0.8, NOTCH_GAP], [0.62, 1, NOTCH_GAP * 2], [0.24, 0.3, NOTCH_GAP * 3]]) {
                const y0 = NOTCH_CENTER - height * part / 2, y1 = NOTCH_CENTER + height * part / 2;
                const base = parts.positions.length / 3;
                face.c.forEach((corner, i) => {
                    const cy = corner[1] === 0 ? y0 : y1;
                    parts.positions.push(cell.x + corner[0] + face.n[0] * gap, notch.y + cy, cell.z + corner[2] + face.n[2] * gap);
                    parts.normals.push(...face.n);
                    parts.uvs.push(uv.uMin + CORNER_UV[i][0] * (uv.uMax - uv.uMin), uv.vMin + cy * (uv.vMax - uv.vMin));
                    parts.colors.push(shade, shade, shade);
                });
                parts.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
            }
        }
    }
    return buildGeometry(parts);
}


export class FallingTreeRenderer {

    constructor(game) {
        this.game = game;
        this.trees = new Map();
        this.notches = new Map();
    }

    light(lighting, x, y, z) {
        const game = this.game;
        const light = game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
        lighting.uModelSky.value = atmosphericLightToBrightness(light.sky);
        const natural = game.sky.lightingLook === 'natural';
        lighting.uModelSun.value = natural ? lighting.uModelSky.value ** 2.2 : 1;
        lighting.uModelBlock.value.set(natural ? light.red / 255 : 0, natural ? light.green / 255 : 0, natural ? light.blue / 255 : 0);
    }

    // Nowa bryła padającego drzewa. Zwraca uchwyt dla setPose / remove.
    add(id, logs, leaves, origin) {
        const lighting = newLighting();
        const geometry = treeGeometry(logs, leaves, origin, this.game.time?.days ?? null);
        const wood = createModelMaterial({ map: blockAtlasTexture, lighting, vertexColors: true });
        const foliage = createModelMaterial({ map: blockAtlasTexture, lighting, vertexColors: true, alphaTest: 0.5 });
        // Bryła stoi przez chwilę dokładnie na blokach, które znikają ze
        // świata (olbrzymy - przez kilka klatek): rysuje się przed nimi.
        for (const material of [wood, foliage]) { material.polygonOffset = true; material.polygonOffsetFactor = -1; material.polygonOffsetUnits = -2; }
        const group = new THREE.Group();
        group.add(new THREE.Mesh(geometry.logs, wood), new THREE.Mesh(geometry.leaves, foliage));
        // Bryła obraca się daleko poza swoją pierwotną kulę - bez odcinania.
        for (const mesh of group.children) mesh.frustumCulled = false;
        group.position.set(origin.x, origin.y, origin.z);
        this.game.scene.add(group);
        // Światło ze środka korony (gdzie było przed ścięciem).
        const top = logs.reduce((best, cell) => Math.max(best, cell.y), origin.y);
        this.light(lighting, origin.x, (origin.y + top) / 2 + 1, origin.z);
        const view = { group, materials: [wood, foliage], lighting };
        this.trees.set(id, view);
        return view;
    }

    // Położenie osi obrotu i obrót (radiany) wokół osi X i Z.
    setPose(id, origin, rotationX, rotationZ) {
        const view = this.trees.get(id);
        if (!view) return;
        view.group.position.set(origin.x, origin.y, origin.z);
        view.group.rotation.set(rotationX, 0, rotationZ);
    }

    remove(id) {
        const view = this.trees.get(id);
        if (!view) return;
        view.group.removeFromParent();
        for (const mesh of view.group.children) mesh.geometry.dispose();
        for (const material of view.materials) material.dispose();
        this.trees.delete(id);
    }

    // Karby: mapa klucz -> { species, y, cells, sides, version }.
    syncNotches(notches) {
        for (const [key, view] of this.notches) {
            if (!notches.has(key)) { view.mesh.removeFromParent(); view.mesh.geometry.dispose(); view.material.dispose(); this.notches.delete(key); }
        }
        for (const [key, notch] of notches) {
            let view = this.notches.get(key);
            if (!view) {
                const lighting = newLighting();
                const material = createModelMaterial({ map: blockAtlasTexture, lighting, vertexColors: true });
                const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
                this.game.scene.add(mesh);
                view = { mesh, material, lighting, version: -1 };
                this.notches.set(key, view);
            }
            if (view.version !== notch.version) {
                view.mesh.geometry.dispose();
                view.mesh.geometry = notchGeometry(notch);
                view.version = notch.version;
            }
            // Światło z miejsca przed uderzaną ścianą (w pniu jest ciemno).
            const cell = notch.cells[0], side = notch.lastSide;
            const dx = side === 'east' ? 1 : side === 'west' ? -1 : 0, dz = side === 'south' ? 1 : side === 'north' ? -1 : 0;
            this.light(view.lighting, cell.x + 0.5 + dx * notch.width, notch.y + 0.5, cell.z + 0.5 + dz * notch.width);
        }
    }

    // Wzór dla programu cieniującego (rendering/ShaderWarmup.js) -
    // pierwszy cios i pierwszy upadek nie zatrzymują gry.
    shaderPrototypes() {
        if (!this.prototypes) {
            const layout = { position: 3, normal: 3, uv: 2, color: 3 };
            this.prototypes = [
                warmupObject(createModelMaterial({ map: blockAtlasTexture, lighting: newLighting(), vertexColors: true }), layout),
                warmupObject(createModelMaterial({ map: blockAtlasTexture, lighting: newLighting(), vertexColors: true, alphaTest: 0.5 }), layout)
            ];
        }
        return this.prototypes;
    }

    dispose() {
        if (this.prototypes) { for (const object of this.prototypes) { object.material.dispose(); object.geometry.dispose(); } this.prototypes = null; }
        for (const id of [...this.trees.keys()]) this.remove(id);
        this.syncNotches(new Map());
    }

}
