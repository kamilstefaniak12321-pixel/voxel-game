// ------------------------------------------------------------
// SPRAWDZENIE PRZEDMIOTÓW W DŁONI (0.84.0)
//
// - przedmioty i narzędzia w ręce mają grubość (1/16 obrazka, czyli
//   jeden piksel tekstury), a nie płaski obrazek,
// - ścianki boczne tylko na brzegach widocznych pikseli, w kolorze
//   tego piksela (UV w środku teksela), ścianki zwrócone na zewnątrz,
// - narzędzia trzyma się za koniec trzonka, resztę - za środek;
//   barwniki i tratwa (też kategoria 'narzedzia') nie są trzonkami,
// - siekiera w dłoni postaci: głowica do przodu i w górę, ostrze w dół
//   (do 0.83.0 była obrócona w drugą stronę).
//
// Uruchomienie: node tools/sprawdz_modele_przedmiotow.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';

// Prawdziwe UV atlasu, maska kształtu - ukośny trzonek 2 px i głowica
// 4 x 5 px w prawym górnym rogu (jak siekiera; wiersz 0 to góra).
const atlasSource = await readFile(new URL('../src/rendering/TextureAtlas.js', import.meta.url), 'utf8');
const layout = atlasSource.slice(0, atlasSource.indexOf('export const blockAtlasTexture ='))
    .replace(/^import \* as THREE from 'three';\r?\n/m, '')
    .replace(/^import \{[^\n]+\} from '.\/TexturePacks.js';\r?\n/m, '');
const uvFunction = atlasSource.match(/export function getAtlasUV\([\s\S]+?\r?\n\}/)?.[0];
assert.ok(uvFunction, 'Funkcja UV atlasu znaleziona');
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return { format: 'module', shortCircuit: true,
            source: `${layout}\n${uvFunction}\n
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getAtlasAverage=()=>null,getTileColors=()=>[];
                export const getTileMask = (name) => {
                    if (globalThis.bezMaski) return null;
                    const mask = new Uint8Array(256);
                    for (let i = 2; i < 13; i++) { mask[(15 - i) * 16 + i] = 1; mask[(15 - i) * 16 + i + 1] = 1; }
                    for (let y = 1; y <= 5; y++) for (let x = 9; x <= 12; x++) mask[y * 16 + x] = 1;
                    return mask;
                };` };
        return next(url, context);
    }
});

const THREE = await import('three');
const { buildExtrudedItemGeometry, buildBlockGeometry, itemGrip, ITEM_THICKNESS, PlayerModel, createPose } = await import('../src/player/PlayerModel.js');
const { getAtlasUV } = await import('../src/rendering/TextureAtlas.js');
const { ITEM_TYPES } = await import('../src/items/ItemRegistry.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };


// --- Grubość i ścianki -----------------------------------------------------------

const texture = ITEM_TYPES.axe.icon;
const geometry = buildExtrudedItemGeometry(texture);
const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv');
geometry.computeBoundingBox();
const box = geometry.boundingBox;
check(geometry.userData.extruded === true, 'Model gruby (extruded)');
check(Math.abs(box.max.z - box.min.z - ITEM_THICKNESS) < 1e-6, `Grubość ${ITEM_THICKNESS} obrazka`);
check(ITEM_THICKNESS >= 1 / 16, 'Co najmniej jeden piksel tekstury grubości');
check(Math.abs(box.max.x - box.min.x - 1) < 1e-6 && Math.abs(box.max.y - box.min.y - 1) < 1e-6, 'Przód i tył - cały obrazek');

// Brzegi maski (te same co w stubie atlasu).
const mask = new Uint8Array(256);
for (let i = 2; i < 13; i++) { mask[(15 - i) * 16 + i] = 1; mask[(15 - i) * 16 + i + 1] = 1; }
for (let y = 1; y <= 5; y++) for (let x = 9; x <= 12; x++) mask[y * 16 + x] = 1;
const at = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && mask[y * 16 + x] === 1;
let edges = 0;
for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (at(x, y)) edges += !at(x - 1, y) + !at(x + 1, y) + !at(x, y - 1) + !at(x, y + 1);
}
check(position.count === (2 + edges) * 4, `Ścianki tylko na brzegach pikseli (${edges} + przód i tył)`);

// Każdy trójkąt zwrócony zgodnie z normalną (widoczny z zewnątrz).
const index = geometry.getIndex();
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
let outward = true;
for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    n.fromBufferAttribute(normal, index.getX(i));
    if (b.clone().sub(a).cross(c.clone().sub(a)).dot(n) <= 0) outward = false;
}
check(outward, 'Ścianki zwrócone na zewnątrz');

// Boki w kolorze piksela: UV w kafelku, a cała ścianka w jednym tekselu.
const tile = getAtlasUV(texture);
let inside = true, single = true;
for (let i = 8; i < uv.count; i += 4) {
    for (let k = 0; k < 4; k++) {
        const u = uv.getX(i + k), v = uv.getY(i + k);
        if (u < tile.uMin || u > tile.uMax || v < tile.vMin || v > tile.vMax) inside = false;
        if (u !== uv.getX(i) || v !== uv.getY(i)) single = false;
    }
}
check(inside, 'UV boków w kafelku przedmiotu');
check(single, 'Bok w kolorze jednego piksela');
globalThis.bezMaski = true;
check(buildExtrudedItemGeometry(texture).getAttribute('position').count === 8, 'Bez maski (atlas jeszcze się wczytuje) - sam przód i tył');
globalThis.bezMaski = false;
geometry.dispose();


// --- Chwyt ---------------------------------------------------------------------

const tools = Object.keys(ITEM_TYPES).filter((type) => ITEM_TYPES[type].tool);
check(tools.length >= 18, `Narzędzia z polem tool (${tools.length})`);
for (const type of [...tools, 'stick']) {
    const [gx, gy] = itemGrip(type);
    check(gx < -0.25 && gy < -0.25, `${type}: za koniec trzonka`);
    check(buildBlockGeometry(type).userData.extruded, `${type}: gruby model w dłoni`);
}
for (const type of ['dye_white', 'raft', 'olive_oliwki']) {
    const [gx, gy] = itemGrip(type);
    check(!(gx < -0.25 && gy < -0.25), `${type}: za środek, nie za trzonek`);
}


// --- Siekiera w dłoni postaci ------------------------------------------------------

const model = new PlayerModel();
model.setPose(createPose());
model.setHeldBlock('axe');
model.object.updateMatrixWorld(true);
const held = model.held;
check(held.visible && held.geometry.userData.extruded, 'Siekiera w dłoni');
const toModel = (x, y) => model.object.worldToLocal(held.localToWorld(new THREE.Vector3(x, y, 0)));
const grip = toModel(...itemGrip('axe')), head = toModel(0.4, 0.4);
const top = toModel(0.2, 0.45), bottom = toModel(0.45, 0.2);
// Model patrzy w stronę -z.
check(head.z < grip.z - 0.2, `Głowica przed postacią (z ${head.z.toFixed(2)} < ${grip.z.toFixed(2)})`);
check(head.y > grip.y, 'Głowica wyżej niż dłoń');
check(Math.abs(head.x - grip.x) < 0.05, 'Siekiera w płaszczyźnie ruchu ręki');
check(top.y > bottom.y, 'Obrazek nie odwrócony do góry nogami');
const sideNormal = new THREE.Vector3(0, 0, 1).transformDirection(held.matrixWorld);
check(Math.abs(sideNormal.x) > 0.9, 'Obrazek bokiem do kamery z boku (przód w bok postaci)');

// A torch has a fixed anchor in the character's hand regardless of the
// previous extruded grip. Check complete selection transitions on PlayerModel.
const torchAnchor = new THREE.Vector3(0, -6.5 * 1.8 / 32, -2.2 * 1.8 / 32);
for (const previous of ['axe', 'stick', 'pickaxe', 'stone', null]) {
    model.setHeldBlock(previous);
    model.setHeldBlock('torch');
    check(model.heldTorch.position.distanceTo(torchAnchor) < 1e-12, `Pochodnia po ${previous}: stałe miejsce w dłoni`);
    check(!model.held.visible && model.heldTorch.parent === model.bones.elbowR, 'Pochodnia jest jedynym widocznym przedmiotem przy dłoni');
    check(Math.abs(model.heldTorch.rotation.x + .3) < 1e-12 && model.heldTorch.scale.x === .72, 'Orientacja i skala pochodni zachowane');
}
model.setHeldBlock('axe');
check(model.heldTorch === null && model.held.visible && model.held.geometry.userData.extruded, 'Powrót z pochodni do siekiery przywraca jej chwyt');
model.dispose();

console.log(`OK: przedmioty w dłoni - ${checks} sprawdzeń (grubość 1 px, ścianki brzegów, chwyt za trzonek, siekiera głowicą do przodu).`);
