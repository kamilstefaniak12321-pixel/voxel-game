// ------------------------------------------------------------
// SPRAWDZENIE DRZWI I KLAP (1.16.0)
//
// - tekstury: każde z 33 rodzajów drewna ma przód, tył i krawędzie drzwi
//   oraz wierzch, spód i krawędzie klapy; wiśnia jest co do piksela
//   rysunkiem Kamila (tools/wzorce/), reszta - ten sam rysunek w swoich
//   kolorach (te same miejsca tych samych tonów),
// - modele: ściany drzwi i klapy patrzą na zewnątrz, biorą właściwe
//   tekstury, zawias prawy i klapa górna to lustra,
// - animacja klapy z modelu Kamila; klapa ma ruchomy model (nie mesher),
// - światło: płyta zasłania tę ścianę komórki, przy której stoi - w każdym
//   kierunku i stanie; pokój za zamkniętymi drzwiami jest ciemny, za
//   otwartymi jasny; klapa w dachu zasłania niebo; przytrzymanie światła
//   na czas zamykania,
// - pęknięcia: 8 etapów 4 x 2 (coraz więcej rys), wariant na dwa bloki,
//   kopia kształtu z UV w kafelku, rozpoznanie starego paska z paczki,
// - dźwięk: każde drewno ma gęstość, cięższe gra niżej i głośniej, pliki
//   istnieją.
//
// Uruchomienie: node tools/sprawdz_drzwi.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { textureManifest, readTextureRegion, decodeTexturePng } from './texture_regions.mjs';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = new Promise(() => {}), atlasAveragesReady = Promise.resolve();
                export const averages = new Map();
                export const getAtlasAverage = (name) => averages.get(name) ?? null, getTileColors = () => [], getTileMask = () => null;
                export const loadPackImage = async () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 36, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer {}; export const TABLE_ROTATION = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

// (Arkusze tekstur w Node się nie wczytują - obrazki zostają "w drodze".)
globalThis.Image = class {};

const THREE = await import('three');
const { WOODS } = await import('../src/blocks/woods.js');
const W = await import('../src/blocks/woodShapes.js');
const { shapeBoxes, lightFaceMask, FACE_BITS, rotateBox } = await import('../src/world/ShapeBoxes.js');
const { getBlockId, getBlockDefinition, getBlockTypeById, AIR_ID } = await import('../src/blocks/BlockRegistry.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { World } = await import('../src/world/World.js');
const { LightEngine, FACE_BLOCK, SKY, RED, MAX_LIGHT } = await import('../src/world/Light.js');
const { doorFaces, trapdoorFaces, itemShapeFaces, DOOR_BOX, TRAPDOOR_BOX } = await import('../src/rendering/ShapeGeometry.js');
const { DoorRenderer, doorOpening, trapdoorOpening, DOOR_KEYFRAMES, TRAPDOOR_KEYFRAMES, DOOR_ANIMATION_SECONDS, hingedPlate } = await import('../src/rendering/DoorRenderer.js');
const { BlockCracks, crackGeometry, isLegacyCracks, CRACK_STAGES, CRACK_DARK_LUMINANCE } = await import('../src/interaction/BlockCracks.js');
const { averages } = await import('../src/rendering/TextureAtlas.js');
const { doorSound, WOOD_DENSITY, WOODS_WITHOUT_DENSITY, DOOR_PITCH } = await import('../src/audio/doorSounds.js');
const { SOUNDS } = await import('../src/audio/sounds.js');
const { CarpenterTables, DOOR_SWING_SECONDS } = await import('../src/game/CarpenterTables.js');
const { CHUNK_SIZE } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const near = (a, b, message, tolerance = 1e-6) => check(Math.abs(a - b) < tolerance, `${message} (${a} ≈ ${b})`);
const root = new URL('../', import.meta.url);


// --- Tekstury ---------------------------------------------------------------

const manifest = textureManifest();
const png = (name) => decodeTexturePng(readFileSync(new URL(`tools/wzorce/${name}.png`, root)));
const crop = (image, x, y, width, height) => {
    const rgba = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) {
        image.rgba.copy(rgba, row * width * 4, ((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4);
    }
    return { width, height, rgba };
};
const pixel = (image, x, y) => image.rgba.readUInt32BE((y * image.width + x) * 4);
const colors = (image) => new Set(Array.from({ length: image.width * image.height }, (_, i) => image.rgba.readUInt32BE(i * 4)));
// Rysunek bez kolorów: numer tonu każdego piksela (od najciemniejszego).
const luminance = (color) => 0.299 * (color >>> 24) + 0.587 * (color >>> 16 & 255) + 0.114 * (color >>> 8 & 255);
const SUFFIXES = { door: [16, 32], door_back: [16, 32], door_edge: [16, 16], trapdoor: [16, 16], trapdoor_bottom: [16, 16], trapdoor_edge: [16, 16] };
const keyOf = (wood, part) => part.startsWith('door') ? `door_${wood}${part.slice(4)}` : `trapdoor_${wood}${part.slice(8)}`;

{
    const door = png('drzwi'), trap = png('zapadnia');
    const template = {
        door: crop(door, 0, 0, 16, 32), door_back: crop(door, 17, 0, 16, 32),
        trapdoor: crop(trap, 0, 0, 16, 16), trapdoor_bottom: crop(trap, 0, 17, 16, 16)
    };
    for (const [part, image] of Object.entries(template)) {
        check(readTextureRegion(keyOf('cherry', part)).rgba.equals(image.rgba), `Wiśnia: ${part} co do piksela jak rysunek Kamila`);
    }
    // Krawędzie wiśni: paski z pliku Kamila (góra drzwi i bok klapy).
    const edge = readTextureRegion('door_cherry_edge'), trapEdge = readTextureRegion('trapdoor_cherry_edge');
    check(crop(edge, 0, 0, 16, 2).rgba.equals(crop(door, 6, 33, 16, 2).rgba) && crop(edge, 0, 2, 16, 2).rgba.equals(crop(door, 23, 33, 16, 2).rgba), 'Krawędzie drzwi: góra i dół z pliku');
    let sideOk = true;
    for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) {
        sideOk &&= pixel(edge, i % 16, 4 + (i >> 4) * 2 + j) === pixel(door, j, 33 + i) && pixel(edge, i % 16, 8 + (i >> 4) * 2 + j) === pixel(door, 3 + j, 33 + i);
    }
    check(sideOk, 'Krawędzie drzwi: oba boki 2 x 32 położone w dwóch połowach');
    check([0, 3, 6, 9].every((y, i) => crop(trapEdge, 0, i * 2, 16, 2).rgba.equals(crop(trap, 17, y, 16, 2).rgba)), 'Krawędzie klapy: cztery paski z pliku');

    const cherryOrder = {};
    for (const part of Object.keys(SUFFIXES)) {
        const image = readTextureRegion(keyOf('cherry', part));
        const palette = [...colors(readTextureRegion('door_cherry')), ...colors(readTextureRegion('door_cherry_back'))];
        const sorted = [...new Set(palette)].sort((a, b) => luminance(a) - luminance(b));
        cherryOrder[part] = Array.from({ length: image.width * image.height }, (_, i) => sorted.indexOf(image.rgba.readUInt32BE(i * 4)));
        check(sorted.length === 7, 'Wzorzec ma siedem tonów');
    }

    for (const { wood } of WOODS) {
        for (const [part, [width, height]] of Object.entries(SUFFIXES)) {
            const key = keyOf(wood, part);
            const region = manifest.regions[key], tile = manifest.tiles[key];
            check(region?.sheet === 'drzewa' && region.width === width && region.height === height, `${key}: obszar ${width} x ${height}`);
            check(tile && (tile.h ?? 1) === height / 16, `${key}: kafelek atlasu`);
            const image = readTextureRegion(key);
            let opaque = true;
            for (let i = 3; i < image.rgba.length; i += 4) opaque &&= image.rgba[i] === 255;
            check(opaque, `${key}: bez przezroczystych pikseli`);
        }
        const front = readTextureRegion(`door_${wood}`), back = readTextureRegion(`door_${wood}_back`);
        const palette = [...new Set([...colors(front), ...colors(back)])].sort((a, b) => luminance(a) - luminance(b));
        check(palette.length <= 7 && palette.length >= 5, `${wood}: drzwi z najwyżej siedmiu tonów (${palette.length})`);
        check(!front.rgba.equals(back.rgba), `${wood}: tył drzwi to osobny rysunek`);
        // Ten sam rysunek: gdzie wzorzec ma ciemniejszy ton, tam to drewno
        // nie ma jaśniejszego (kolejność tonów zachowana).
        if (palette.length === 7) {
            const order = Array.from({ length: 16 * 32 }, (_, i) => palette.indexOf(front.rgba.readUInt32BE(i * 4)));
            check(order.every((tone, i) => tone === cherryOrder.door[i]), `${wood}: przód drzwi to rysunek Kamila w swoich kolorach`);
        }
        // Klamka jest najciemniejsza i leży tam, gdzie we wzorcu.
        check(pixel(front, 11, 16) === palette[0] && pixel(front, 12, 18) === palette[1], `${wood}: klamka z dwóch najciemniejszych tonów`);
    }
    const taken = new Map();
    for (const [key, tile] of Object.entries(manifest.tiles)) {
        for (let dy = 0; dy < (tile.h ?? 1); dy++) for (let dx = 0; dx < (tile.w ?? 1); dx++) {
            const cell = `${tile.x + dx},${tile.y + dy}`;
            check(!taken.has(cell), `Kafelek ${cell}: ${key} i ${taken.get(cell)}`);
            taken.set(cell, key);
        }
    }
}


// --- Modele -----------------------------------------------------------------

function outward(face) {
    // Rogi TL, TR, BL, BR widziane z zewnątrz: (TR - TL) x (BL - TL) = -normalna... sprawdzamy trójkąty z buildFacesGeometry.
    const [a, , c] = [face.vertices[0], face.vertices[2], face.vertices[1]];
    const b = face.vertices[2];
    const u = b.map((v, i) => v - a[i]), w = c.map((v, i) => v - a[i]);
    const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    return cross[0] * face.normal[0] + cross[1] * face.normal[1] + cross[2] * face.normal[2] > 0;
}

{
    const left = doorFaces('door_oak', 'left'), right = doorFaces('door_oak', 'right');
    check(left.length === 8 && right.length === 8, 'Drzwi: przód, tył, góra, dół i dwa boki po dwie połowy');
    for (const face of [...left, ...right, ...trapdoorFaces('trapdoor_oak'), ...trapdoorFaces('trapdoor_oak', 'top')]) {
        check(outward(face), `Ściana ${face.texture} ${face.normal} patrzy na zewnątrz`);
        check(face.uv.flat().every((value) => value >= 0 && value <= 1), 'UV w kafelku');
    }
    const byNormal = (faces, normal) => faces.filter((face) => face.normal.join() === normal.join());
    check(byNormal(left, [0, 0, 1])[0].texture === 'door_oak' && byNormal(left, [0, 0, -1])[0].texture === 'door_oak_back', 'Przód drzwi patrzy do środka komórki (+z), tył na zewnątrz');
    check(byNormal(left, [1, 0, 0]).length === 2 && byNormal(left, [1, 0, 0]).every((face) => face.texture === 'door_oak_edge'), 'Boki drzwi z kafelka krawędzi');
    // Przód: lewy górny róg obrazka w lewym górnym rogu płyty (patrząc od +z).
    const front = byNormal(left, [0, 0, 1])[0];
    const corner = front.vertices.findIndex(([x, y]) => x === 0 && y === 2);
    check(front.uv[corner].join() === '0,0', 'Przód: róg (0, 0) obrazka przy zawiasie u góry');
    const mirrored = byNormal(right, [0, 0, 1])[0];
    const mirroredCorner = mirrored.vertices.findIndex(([x, y]) => x === 1 && y === 2);
    check(mirrored.uv[mirroredCorner].join() === '0,0', 'Zawias prawy: obrazek odbity (klamka po drugiej stronie)');
    // Bok przy klamce: górna połowa to wiersze 4-5 kafelka krawędzi.
    const side = byNormal(left, [1, 0, 0]).find((face) => face.vertices.every(([, y]) => y >= 1));
    const vs = side.uv.map(([, v]) => v * 16);
    check(Math.min(...vs) === 4 && Math.max(...vs) === 6, 'Bok drzwi: pasek 2 px z właściwych wierszy');

    const bottom = trapdoorFaces('trapdoor_oak'), top = trapdoorFaces('trapdoor_oak', 'top');
    check(bottom.length === 6 && byNormal(bottom, [0, 1, 0])[0].texture === 'trapdoor_oak' && byNormal(bottom, [0, -1, 0])[0].texture === 'trapdoor_oak_bottom', 'Klapa: wierzch i spód');
    check(byNormal(top, [0, -1, 0])[0].texture === 'trapdoor_oak' && Math.min(...top.flatMap((face) => face.vertices.map(([, y]) => y))) === 14 / 16, 'Klapa górna: lustro (rysunek z uchwytem od spodu), 2 px pod sufitem');
    check(TRAPDOOR_BOX[4] === 2 / 16 && DOOR_BOX[5] === 2 / 16, 'Płyty mają 2 px grubości');
    // Uchwyt (ciemne piksele wierzchu, wiersze 1-2) leży przy wolnym brzegu (z = 1).
    const up = byNormal(bottom, [0, 1, 0])[0];
    const freeEdge = up.vertices.findIndex(([, , z]) => z === 1);
    check(up.uv[freeEdge][1] === 0, 'Uchwyt klapy naprzeciw zawiasu');
    check(itemShapeFaces('oak_trapdoor').length === 6 && itemShapeFaces('oak_door').length === 8, 'Ikonki z tych samych modeli');
    check(itemShapeFaces('oak_door').find((face) => face.normal[2] === 1).texture === 'door_oak', 'Ikonka drzwi pokazuje przód');
}


// --- Animacja i bloki --------------------------------------------------------

near(trapdoorOpening(0), 0, 'Klapa: start');
near(trapdoorOpening(0.125), 0.5, 'Klapa: połowa drogi');
near(trapdoorOpening(0.25), 1, 'Klapa: 90 stopni w 0,25 s');
near(trapdoorOpening(0.29167), 92.5 / 90, 'Klapa: odbicie do 92,5 stopnia');
near(trapdoorOpening(0.375), 87.5 / 90, 'Klapa: 87,5 stopnia');
near(trapdoorOpening(DOOR_ANIMATION_SECONDS), 1, 'Klapa: koniec na 90 stopniach');
near(doorOpening(0.29167), 95 / 90, 'Drzwi: odbicie do 95 stopni (bez zmian)');
check(TRAPDOOR_KEYFRAMES.length === DOOR_KEYFRAMES.length && TRAPDOOR_KEYFRAMES.every(([t], i) => t === DOOR_KEYFRAMES[i][0]), 'Te same czasy klatek co drzwi');
near(DOOR_SWING_SECONDS, DOOR_KEYFRAMES[1][0], 'Światło przełącza się, gdy płyta dojdzie na miejsce');

for (const { wood } of WOODS) {
    const trap = W.shapeId(wood, 'trapdoor', { facing: 'east', half: 'top', open: true });
    check(getBlockDefinition(getBlockTypeById(trap)).model === 'door' && W.isHingedId(trap) && !W.isDoorId(trap), `${wood}: klapa ma ruchomy model`);
    check(W.isHingedId(W.shapeId(wood, 'door', { part: 'upper' })) && !W.isHingedId(W.shapeId(wood, 'stairs')), `${wood}: drzwi na zawiasie, schody nie`);
}
{
    const chunk = new Chunk(0, 0);
    chunk.setId(3, 5, 3, W.shapeId('oak', 'trapdoor'));
    chunk.setId(4, 5, 3, W.shapeId('oak', 'door'));
    chunk.setId(5, 5, 3, W.shapeId('oak', 'slab'));
    check(chunk.torches.size === 2, 'Chunk indeksuje drzwi i klapy (modele), półbloku nie');
}


// --- Model w świecie: położenie płyty po animacji = pudełko kolizji ---------

{
    const scene = new THREE.Scene();
    const game = { scene, settings: { get: () => false }, world: { modelShadowScene: new THREE.Scene(), getLight: () => ({ sky: 15, red: 0, green: 0, blue: 0 }), chunks: new Map(), version: 0 },
        shadows: { marked: 0, markModel() { this.marked++; } } };
    const doors = new DoorRenderer(game);
    const boxOf = (view) => {
        view.group.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromBufferAttribute(view.mesh.geometry.getAttribute('position')).applyMatrix4(view.mesh.matrixWorld);
        return [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    };
    let index = 0;
    for (const facing of W.SHAPE_FACINGS) {
        const cases = [
            ...['left', 'right'].flatMap((hinge) => [false, true].map((open) => ({ kind: 'door', options: { facing, part: 'lower', hinge, open }, height: 2 }))),
            ...['bottom', 'top'].flatMap((half) => [false, true].map((open) => ({ kind: 'trapdoor', options: { facing, half, open }, height: 1 })))
        ];
        for (const { kind, options, height } of cases) {
            const id = W.shapeId('oak', kind, options);
            const info = W.shapeInfo(id);
            const view = doors.createView(`k${index++}`, 10, 20, 30, info);
            const expected = shapeBoxes(id)[0].slice(0, 6);
            if (kind === 'door') expected[4] = height;
            const actual = boxOf(view).map((value, i) => value - [10, 20, 30][i % 3]);
            check(actual.every((value, i) => Math.abs(value - expected[i]) < 1e-6), `${kind} ${JSON.stringify(options)}: model stoi w pudełku kolizji (${actual.map((v) => v.toFixed(3))} / ${expected})`);
            check(view.shadow.matrixWorld.equals(view.mesh.matrixWorld) && game.world.modelShadowScene.children.includes(view.shadow), 'Kopia do mapy cieni stoi tam, gdzie model');
            check(doors.viewAt(10, 20, 30) === view && (kind === 'door') === (doors.viewAt(10, 21, 30) === view), 'Model znajdowany po komórce (drzwi - po obu)');
            const plate = hingedPlate(view);
            check(plate.tall === (kind === 'door'), 'Płyta pod pęknięcia: drzwi na dwa bloki');
            doors.removeView(view.key);
            check(!game.world.modelShadowScene.children.includes(view.shadow) && doors.viewAt(10, 20, 30) === undefined, 'Po usunięciu znika też cień');
        }
    }

    // Animacja: w połowie drogi cień idzie z płytą, po końcu mapa cieni
    // przestaje być przerysowywana.
    const view = doors.createView('ruch', 0, 0, 0, W.shapeInfo(W.shapeId('oak', 'trapdoor')));
    view.open = true; view.from = 0; view.started = doors.time;
    doors.time += 0.125;
    doors.pose(view);
    near(view.pivot.rotation.x, -Math.PI / 4, 'Dolna klapa w połowie otwierania: 45 stopni w górę');
    check(view.shadow.matrixWorld.equals(view.mesh.matrixWorld), 'Cień w połowie ruchu razem z płytą');
    const high = new THREE.Box3().setFromBufferAttribute(view.mesh.geometry.getAttribute('position')).applyMatrix4(view.mesh.matrixWorld).max.y;
    check(high > 0.5 && high < 0.9, `Wolny brzeg klapy w górze (${high.toFixed(2)})`);
    doors.time += 1;
    doors.pose(view);
    const marked = game.shadows.marked;
    doors.pose(view); doors.pose(view);
    check(game.shadows.marked === marked, 'Stojący model nie przerysowuje mapy cieni');
    check(doors.moving(view) === false, 'Po animacji model stoi');

    // Światło płyty: z własnej komórki, a oglądanej zza zasłoniętej ściany -
    // z komórki po tamtej stronie (drzwi z ciemnego pokoju są ciemne).
    {
        const lit = doors.createView('swiatlo', 4, 10, 4, W.shapeInfo(W.shapeId('oak', 'door', { facing: 'south' })));
        game.world.getBlockId = () => W.shapeId('oak', 'door', { facing: 'south' });
        game.camera = { position: new THREE.Vector3(4.5, 11, 0) };
        check(doors.lightCell(lit, [0, 0, 0]).join() === '4,10,4', 'Kamera przed drzwiami: światło z komórki drzwi');
        game.camera.position.set(4.5, 11, 9);
        check(doors.lightCell(lit, [0, 0, 0]).join() === '4,10,5', 'Kamera za płytą (południe): światło z komórki za drzwiami');
        game.world.getBlockId = () => W.shapeId('oak', 'trapdoor', { half: 'top' });
        game.camera.position.set(4.5, 14, 4.5);
        check(doors.lightCell(lit, [0, 0, 0]).join() === '4,11,4', 'Górna klapa oglądana z góry: światło znad klapy');
        game.world.getBlockId = () => W.shapeId('oak', 'trapdoor', { facing: 'west', open: true });
        game.camera.position.set(-3, 10.5, 4.5);
        check(doors.lightCell(lit, [0, 0, 0]).join() === '3,10,4', 'Otwarta klapa przy zachodniej ścianie oglądana z zachodu');
        // Za płytą mur - zostaje własna komórka (otwarte drzwi przy ścianie).
        const trapId = W.shapeId('oak', 'trapdoor', { facing: 'west', open: true });
        game.world.getBlockId = (x) => (x === 3 ? getBlockId('stone') : trapId);
        check(doors.lightCell(lit, [0, 0, 0]).join() === '4,10,4', 'Płyta przy murze oglądana "przez mur": światło z własnej komórki');
        doors.removeView('swiatlo');
        delete game.camera;
    }

    // Pęknięcia przypięte do płyty.
    game.doors = doors;
    game.world.getBlockId = () => W.shapeId('oak', 'trapdoor');
    const cracks = new BlockCracks(scene, game);
    cracks.update({ x: 0, y: 0, z: 0, type: 'oak_trapdoor' }, 0.5);
    check(cracks.mesh.visible && cracks.mesh.parent === view.pivot && cracks.stage === 4, 'Pęknięcia klapy przypięte do ruchomej płyty (etap 4 z 8)');
    check(cracks.uniforms.uFrame.value.x === 0 && cracks.uniforms.uFrame.value.y === 0, 'Etap 4: pierwsza klatka dolnego wiersza');
    doors.removeView('ruch');
    check(!cracks.mesh.visible && cracks.mesh.parent === scene, 'Model znika - pęknięcia wracają do sceny');
    const door = doors.createView('drzwi', 2, 0, 0, W.shapeInfo(W.shapeId('oak', 'door')));
    cracks.update({ x: 2, y: 1, z: 0, type: 'oak_door' }, 0.99);
    check(cracks.mesh.parent === door.pivot && cracks.tall && cracks.stage === 7, 'Drzwi: wysoki rysunek na całej płycie, kopane z górnej części');
    const size = new THREE.Box3().setFromBufferAttribute(cracks.mesh.geometry.getAttribute('position')).getSize(new THREE.Vector3());
    check(Math.abs(size.y - 2) < 0.01 && Math.abs(size.z - 2 / 16) < 0.01, 'Nakładka ma rozmiar płyty drzwi');
    cracks.update({ x: 5, y: 0, z: 0, type: 'stone' }, 0.1);
    check(cracks.mesh.parent === scene && !cracks.tall && cracks.mesh.position.x === 5 && cracks.stage === 0, 'Zwykły blok: sześcian w scenie');
    check(cracks.material.blendDst === THREE.SrcColorFactor && cracks.uniforms.uLighten.value === 0, 'Jasny blok: rysy przyciemniają');
    averages.set('obsidian_test', new THREE.Color(0.02, 0.02, 0.03));
    check(cracks.isDark('obsidian_test') && !cracks.isDark('missing'), 'Ciemna tekstura - rysy rozjaśniają');
    near(CRACK_DARK_LUMINANCE, 0.07, 'Próg ciemnego bloku');
    game.world.getBlockId = () => W.shapeId('oak', 'stairs');
    cracks.update({ x: 7, y: 0, z: 0, type: 'oak_stairs' }, 0.3);
    check(cracks.mesh.visible && cracks.mesh.geometry.getAttribute('position').count === 2 * 24, 'Schody: pęknięcia na obu pudełkach kształtu');
    cracks.update({ x: 7, y: 0, z: 0, type: 'torch' }, 0.3);
    check(!cracks.mesh.visible, 'Pochodni nie pękamy');
    cracks.update(null, 0);
    check(!cracks.mesh.visible, 'Koniec kopania - nakładka znika');
    cracks.dispose();
    doors.dispose();
}


// --- Pęknięcia: rysunki -------------------------------------------------------

{
    check(CRACK_STAGES === 8, 'Osiem etapów');
    for (const [key, name, frameHeight] of [['assets/textures/blocks/cracks.png', 'pekniecia', 16], ['assets/textures/blocks/cracks_tall.png', 'pekniecia_wysokie', 32]]) {
        const image = readTextureRegion(key);
        check(image.width === 64 && image.height === frameHeight * 2, `${key}: siatka 4 x 2 klatek 16 x ${frameHeight}`);
        check(image.rgba.equals(png(name).rgba), `${key}: rysunek Kamila co do piksela`);
        let previous = 0;
        for (let stage = 0; stage < 8; stage++) {
            const frame = crop(image, (stage % 4) * 16, Math.floor(stage / 4) * frameHeight, 16, frameHeight);
            let drawn = 0, grey = true;
            for (let i = 0; i < frame.rgba.length; i += 4) {
                if (frame.rgba[i + 3] === 0) continue;
                drawn++;
                grey &&= frame.rgba[i] === frame.rgba[i + 1] && frame.rgba[i + 1] === frame.rgba[i + 2] && frame.rgba[i + 3] < 255;
            }
            check(drawn > previous && grey, `${key}: etap ${stage} ma więcej rys niż poprzedni (${drawn}), szarych i półprzezroczystych`);
            previous = drawn;
        }
    }
    check(isLegacyCracks(160, 16) && isLegacyCracks(320, 32) && !isLegacyCracks(64, 32) && !isLegacyCracks(128, 64), 'Stary pasek 10 etapów z paczki rozpoznany');
    const cube = crackGeometry([[0, 0, 0, 1, 1, 1]]);
    const position = cube.getAttribute('position'), uv = cube.getAttribute('uv');
    check(position.count === 24 && cube.index.count === 36, 'Sześcian: 6 ścian');
    let inside = true, bigger = false;
    for (let i = 0; i < uv.count; i++) inside &&= uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1;
    for (let i = 0; i < position.count; i++) bigger ||= position.getX(i) > 1;
    check(inside && bigger, 'UV w klatce, kopia odrobinę większa od bloku');
    const tall = crackGeometry([[0, 0, 0, 1, 2, 2 / 16]], true, [1 / 16, 0, 1 / 16]);
    let top = 0;
    for (let i = 0; i < tall.getAttribute('uv').count; i++) top = Math.max(top, tall.getAttribute('uv').getY(i));
    check(top === 1, 'Wysoki rysunek rozciąga się na dwa bloki');
    // Ściany patrzą na zewnątrz.
    const index = cube.index.array;
    let facesOut = true;
    for (let i = 0; i < index.length; i += 3) {
        const p = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(position, index[i + k]));
        const normal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
        const center = p[0].clone().add(p[1]).add(p[2]).divideScalar(3).subScalar(0.5);
        facesOut &&= normal.dot(center) > 0;
    }
    check(facesOut, 'Ściany nakładki patrzą na zewnątrz');
}


// --- Światło: która ściana komórki jest zasłonięta --------------------------

{
    const SIDE = { west: FACE_BITS.west, east: FACE_BITS.east, north: FACE_BITS.north, south: FACE_BITS.south };
    const LEFT_OF = { north: 'west', east: 'north', south: 'east', west: 'south' };
    const RIGHT_OF = { north: 'east', east: 'south', south: 'west', west: 'north' };
    for (const { wood } of [WOODS[0], WOODS[4], WOODS[32]]) {
        for (const facing of W.SHAPE_FACINGS) {
            for (const part of ['lower', 'upper']) {
                const mask = (options) => FACE_BLOCK[W.shapeId(wood, 'door', { facing, part, ...options })];
                check(mask({}) === SIDE[facing] && mask({ hinge: 'right' }) === SIDE[facing], `${wood} drzwi ${facing} ${part}: zamknięte zasłaniają ścianę "${facing}"`);
                check(mask({ open: true }) === SIDE[LEFT_OF[facing]], `${wood} drzwi ${facing}: otwarte (zawias lewy) zasłaniają bok ${LEFT_OF[facing]}`);
                check(mask({ open: true, hinge: 'right' }) === SIDE[RIGHT_OF[facing]], `${wood} drzwi ${facing}: otwarte (zawias prawy) zasłaniają bok ${RIGHT_OF[facing]}`);
            }
            const trap = (options) => FACE_BLOCK[W.shapeId(wood, 'trapdoor', { facing, ...options })];
            check(trap({}) === FACE_BITS.down && trap({ half: 'top' }) === FACE_BITS.up, `${wood} klapa ${facing}: zamknięta zasłania dół albo górę`);
            check(trap({ open: true }) === SIDE[facing] && trap({ open: true, half: 'top' }) === SIDE[facing], `${wood} klapa ${facing}: otwarta zasłania ścianę przy zawiasie`);
        }
    }
    check(lightFaceMask(getBlockId('stone')) === 0 && lightFaceMask(W.shapeId('oak', 'slab')) === 0 && lightFaceMask(W.shapeId('oak', 'gate')) === 0 && lightFaceMask(AIR_ID) === 0, 'Inne bloki bez masek');
    check(FACE_BITS.west === 1 && FACE_BITS.east === 2 && FACE_BITS.north === 4 && FACE_BITS.south === 8 && FACE_BITS.up === 16 && FACE_BITS.down === 32, 'Bity w kolejności sąsiadów Light.js');
}


// --- Światło w świecie ------------------------------------------------------

function lightWorld() {
    const chunk = new Chunk(0, 0);
    const world = { getChunk: (cx, cz) => (cx === 0 && cz === 0 ? chunk : null), applied: 0 };
    world.light = new LightEngine(world);
    world.applyLightChanges = () => { world.applied++; world.light.takeChangedChunks(() => {}); };
    world.holdDoorLight = World.prototype.holdDoorLight;
    world.updateLightHolds = World.prototype.updateLightHolds;
    const set = (x, y, z, id, relight = true) => {
        chunk.setId(x, y, z, typeof id === 'string' ? getBlockId(id) : id);
        if (relight) world.light.blockChanged(chunk, chunk.index(x, y, z));
    };
    const level = (channel, x, y, z) => chunk.lightChannels[channel][chunk.index(x, y, z)];
    return { chunk, world, set, level };
}

// Kamienny tunel wzdłuż z (x = 8, y = 10-11) z zamkniętym końcem: wylot
// przy z = 2 (otwarte niebo dalej nie sięga - strop), drzwi w z = 6.
function tunnel(doorOptions, { lamp = false } = {}) {
    const lab = lightWorld();
    const { set } = lab;
    for (let z = 1; z <= 12; z++) for (let x = 6; x <= 10; x++) for (let y = 8; y <= 13; y++) {
        const inside = x === 8 && (y === 10 || y === 11) && z >= 2 && z <= 11;
        if (!inside) set(x, y, z, 'stone', false);
    }
    // Wylot tunelu na zewnątrz (z = 1 otwarte).
    set(8, 10, 1, AIR_ID, false); set(8, 11, 1, AIR_ID, false);
    for (const part of ['lower', 'upper']) {
        set(8, part === 'lower' ? 10 : 11, 6, W.shapeId('oak', 'door', { part, ...doorOptions }), false);
    }
    lab.world.light.initChunk(lab.chunk);
    lab.world.light.takeChangedChunks(() => {});
    if (lamp) set(8, 10, 3, lamp);
    return lab;
}

{
    // Drzwi "north" stoją przy północnej ścianie komórki z = 6 (od strony wylotu).
    const closed = tunnel({ facing: 'north' });
    const before = closed.level(SKY, 8, 10, 5), behind = closed.level(SKY, 8, 10, 7), inDoor = closed.level(SKY, 8, 10, 6);
    check(before > 0, `Przed drzwiami dochodzi światło nieba (${before})`);
    check(inDoor === 0 && behind === 0, `Za zamkniętymi drzwiami ciemno (komórka drzwi ${inDoor}, dalej ${behind})`);

    const open = tunnel({ facing: 'north', open: true });
    check(open.level(SKY, 8, 10, 5) === before && open.level(SKY, 8, 10, 6) === before - 1 && open.level(SKY, 8, 10, 7) === before - 2, 'Przez otwarte drzwi światło idzie jak przez powietrze');

    // Te same drzwi obrócone bokiem ("west"): płyta wzdłuż tunelu - choć
    // "zamknięte", nie zasłaniają przejścia. Otwarte - stają w poprzek.
    const sideways = tunnel({ facing: 'west' });
    check(sideways.level(SKY, 8, 10, 7) === before - 2, 'Drzwi ustawione bokiem: "zamknięte" przepuszczają światło wzdłuż tunelu');
    const acrossOpen = tunnel({ facing: 'west', open: true });
    check(FACE_BLOCK[W.shapeId('oak', 'door', { facing: 'west', open: true })] === FACE_BITS.south, 'Drzwi west otwarte stoją przy południowej ścianie');
    check(acrossOpen.level(SKY, 8, 10, 6) === before - 1 && acrossOpen.level(SKY, 8, 10, 7) === 0, 'Drzwi bokiem, "otwarte": płyta w poprzek tunelu zasłania - liczy się model, nie stan');

    // Zamknięcie i otwarcie w grze (zmiana bloku).
    const lab = tunnel({ facing: 'north', open: true });
    const swap = (isOpen) => {
        for (const part of ['lower', 'upper']) lab.set(8, part === 'lower' ? 10 : 11, 6, W.shapeId('oak', 'door', { facing: 'north', part, open: isOpen }));
    };
    swap(false);
    check(lab.level(SKY, 8, 10, 7) === 0 && lab.level(SKY, 8, 11, 8) === 0 && lab.level(SKY, 8, 10, 5) === before, 'Zamknięcie drzwi gasi pokój, przedsionek zostaje jasny');
    swap(true);
    check(lab.level(SKY, 8, 10, 7) === before - 2 && lab.level(SKY, 8, 11, 9) === before - 4, 'Otwarcie wpuszcza światło z powrotem');

    // Lampa (kolorowe światło) tak samo.
    const torch = getBlockId('torch');
    const lamp = tunnel({ facing: 'north' }, { lamp: torch });
    check(lamp.level(RED, 8, 10, 5) > 0 && lamp.level(RED, 8, 10, 7) === 0 && lamp.level(RED, 8, 11, 7) === 0, 'Światło pochodni nie przechodzi przez zamknięte drzwi');
    for (const part of ['lower', 'upper']) lamp.set(8, part === 'lower' ? 10 : 11, 6, W.shapeId('oak', 'door', { facing: 'north', part, open: true }));
    check(lamp.level(RED, 8, 10, 7) > 0 && lamp.level(RED, 8, 10, 7) < lamp.level(RED, 8, 10, 5), 'Po otwarciu światło pochodni wpada do pokoju');
    // Światło z pokoju też nie wychodzi (płyta działa w obie strony).
    const inner = tunnel({ facing: 'north' });
    inner.set(8, 10, 9, torch);
    check(inner.level(RED, 8, 10, 6) > 0 && inner.level(RED, 8, 10, 5) === 0, 'Od środka: światło dochodzi do drzwi i nie wychodzi');

    // Przytrzymanie na czas zamykania (jak CarpenterTables.toggleDoor).
    const held = tunnel({ facing: 'north', open: true });
    for (const y of [10, 11]) held.world.holdDoorLight(8, y, 6, DOOR_SWING_SECONDS);
    for (const part of ['lower', 'upper']) held.set(8, part === 'lower' ? 10 : 11, 6, W.shapeId('oak', 'door', { facing: 'north', part }));
    check(held.level(SKY, 8, 10, 7) === before - 2, 'Zamykanie: dopóki płyta jedzie, światło stoi po staremu');
    held.world.updateLightHolds(0.1);
    check(held.level(SKY, 8, 10, 7) === before - 2 && held.world.applied === 0, 'W połowie animacji dalej jasno');
    held.world.updateLightHolds(0.2);
    check(held.level(SKY, 8, 10, 7) === 0 && held.world.applied === 1 && !held.chunk.faceHold && held.world.lightHolds.length === 0, 'Płyta doszła - światło przełącza się raz');
    // Blok rozbity w trakcie - przytrzymanie niczego nie psuje.
    const broken = tunnel({ facing: 'north', open: true });
    for (const y of [10, 11]) broken.world.holdDoorLight(8, y, 6, DOOR_SWING_SECONDS);
    for (const y of [10, 11]) broken.set(8, y, 6, AIR_ID);
    broken.world.updateLightHolds(1);
    check(broken.level(SKY, 8, 10, 7) === before - 2, 'Drzwi rozbite w trakcie zamykania: przejście jasne');
    held.world.holdDoorLight(8, 10, 2, 1);
    check(!held.chunk.faceHold, 'Zwykłej komórki nie da się przytrzymać');
}

{
    // Klapa w dachu: kamienna studnia 1 x 1 pod gołym niebem.
    const well = (trapOptions) => {
        const lab = lightWorld();
        for (let x = 6; x <= 10; x++) for (let z = 6; z <= 10; z++) for (let y = 0; y <= 12; y++) {
            if (!(x === 8 && z === 8 && y >= 4)) lab.set(x, y, z, 'stone', false);
        }
        if (trapOptions) lab.set(8, 12, 8, W.shapeId('oak', 'trapdoor', trapOptions), false);
        lab.world.light.initChunk(lab.chunk);
        lab.world.light.takeChangedChunks(() => {});
        return lab;
    };
    check(well(null).level(SKY, 8, 5, 8) === MAX_LIGHT, 'Otwarta studnia: pełne niebo na dnie');
    const bottom = well({ half: 'bottom' });
    check(bottom.level(SKY, 8, 12, 8) === MAX_LIGHT && bottom.level(SKY, 8, 11, 8) === 0 && bottom.level(SKY, 8, 5, 8) === 0, 'Dolna klapa: jej komórka jasna (płyta na dnie), pod nią ciemno');
    const top = well({ half: 'top' });
    check(top.level(SKY, 8, 12, 8) === 0 && top.level(SKY, 8, 5, 8) === 0, 'Górna klapa: już jej komórka jest pod płytą');
    const opened = well({ half: 'bottom', open: true });
    check(opened.level(SKY, 8, 5, 8) === MAX_LIGHT, 'Otwarta klapa stoi z boku - niebo wpada do studni');
    // Zamknięcie i otwarcie w grze.
    opened.set(8, 12, 8, W.shapeId('oak', 'trapdoor', { half: 'bottom' }));
    check(opened.level(SKY, 8, 11, 8) === 0 && opened.level(SKY, 8, 5, 8) === 0, 'Zamknięcie klapy gasi studnię');
    opened.set(8, 12, 8, W.shapeId('oak', 'trapdoor', { half: 'bottom', open: true }));
    check(opened.level(SKY, 8, 5, 8) === MAX_LIGHT, 'Otwarcie klapy wpuszcza niebo');
    top.set(8, 12, 8, W.shapeId('oak', 'trapdoor', { half: 'top', open: true }));
    check(top.level(SKY, 8, 12, 8) === MAX_LIGHT && top.level(SKY, 8, 5, 8) === MAX_LIGHT, 'Górna klapa otwarta - też');
    top.set(8, 12, 8, AIR_ID);
    check(top.level(SKY, 8, 5, 8) === MAX_LIGHT, 'Klapa rozbita - studnia otwarta');
}


// --- Stół: zamykanie przytrzymuje światło i gra dźwięk drewna ---------------

{
    const calls = { hold: [], sound: [] };
    const blocks = new Map();
    const world = {
        getBlockId: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? AIR_ID,
        setBlock(x, y, z, type) { blocks.set(`${x},${y},${z}`, type ? getBlockId(type) : AIR_ID); return true; },
        holdDoorLight: (x, y, z, seconds) => calls.hold.push([x, y, z, seconds])
    };
    const game = { world, playDoorSound: (...args) => calls.sound.push(args) };
    const tables = Object.create(CarpenterTables.prototype);
    tables.game = game;
    blocks.set('0,0,0', W.shapeId('olive', 'door', { part: 'lower' }));
    blocks.set('0,1,0', W.shapeId('olive', 'door', { part: 'upper' }));
    tables.toggleDoor({ x: 0, y: 1, z: 0 }, W.shapeInfo(world.getBlockId(0, 1, 0)));
    check(W.shapeInfo(world.getBlockId(0, 0, 0)).open && calls.hold.length === 0, 'Otwieranie: blok zmienia się od razu, światła nic nie trzyma');
    check(calls.sound.length === 1 && calls.sound[0].slice(0, 3).join() === 'door,true,olive' && calls.sound[0][3].y === 0, 'Otwieranie: dźwięk drzwi z oliwki');
    tables.toggleDoor({ x: 0, y: 0, z: 0 }, W.shapeInfo(world.getBlockId(0, 0, 0)));
    check(!W.shapeInfo(world.getBlockId(0, 1, 0)).open && calls.hold.length === 2 && calls.hold[0][3] === DOOR_SWING_SECONDS, 'Zamykanie: obie komórki przytrzymują światło do końca ruchu');
    check(calls.sound[1].slice(0, 3).join() === 'door,false,olive', 'Zamykanie: dźwięk zamknięcia');
    blocks.set('3,0,0', W.shapeId('baobab', 'trapdoor', { open: true }));
    tables.toggleTrapdoor({ x: 3, y: 0, z: 0 }, W.shapeInfo(world.getBlockId(3, 0, 0)));
    check(calls.hold.length === 3 && calls.sound[2].slice(0, 3).join() === 'trapdoor,false,baobab', 'Klapa: zamknięcie trzyma światło i gra swój dźwięk');
}


// --- Dźwięk -------------------------------------------------------------------

{
    check(WOODS_WITHOUT_DENSITY.length === 0 && Object.keys(WOOD_DENSITY).length === WOODS.length, 'Każde drewno ma gęstość');
    const sorted = [...WOODS].sort((a, b) => WOOD_DENSITY[a.wood] - WOOD_DENSITY[b.wood]);
    for (let i = 1; i < sorted.length; i++) {
        const light = doorSound(sorted[i - 1].wood), heavy = doorSound(sorted[i].wood);
        check(heavy.pitch <= light.pitch && heavy.volume >= light.volume, `${sorted[i].wood} (cięższe) gra nie wyżej niż ${sorted[i - 1].wood}`);
    }
    const baobab = doorSound('baobab'), mangrove = doorSound('mangrove'), oak = doorSound('oak'), spruce = doorSound('spruce');
    near(baobab.pitch, DOOR_PITCH[0], 'Najlżejsze drewno - najwyżej');
    near(mangrove.pitch, DOOR_PITCH[1], 'Najcięższe - najniżej');
    check(oak.pitch < spruce.pitch && spruce.pitch - oak.pitch > 0.1, `Dąb słychać niżej niż świerk (${oak.pitch.toFixed(2)} / ${spruce.pitch.toFixed(2)})`);
    check(new Set(WOODS.map(({ wood }) => doorSound(wood).pitch.toFixed(3))).size >= 20, 'Co najmniej 20 różnych wysokości na 33 rodzaje drewna');
    check(doorSound('oak', 'trapdoor', false).name === 'trapdoor_close' && doorSound('oak', 'door', true).name === 'door_open', 'Nazwy dźwięków');
    check(doorSound('oak', 'trapdoor').pitch > oak.pitch, 'Klapa gra wyżej niż drzwi z tego samego drewna');
    check(doorSound('unknown').pitch > 0.8 && doorSound('unknown').pitch < 1.22, 'Nieznane drewno - środek zakresu');
    for (const name of ['door_open', 'door_close', 'trapdoor_open', 'trapdoor_close']) {
        check(SOUNDS[name]?.category === 'blocks' && SOUNDS[name].distance && SOUNDS[name].files.length === 2, `${name}: dźwięk w świecie, dwie wersje`);
        for (const file of SOUNDS[name].files) {
            const url = new URL(`assets/sounds/${file}`, root);
            check(existsSync(url) && readFileSync(url).subarray(0, 4).toString() === 'OggS', `${file} istnieje`);
        }
    }
}

console.log(`OK: drzwi i klapy - ${checks} sprawdzeń (tekstury 33 rodzajów drewna, modele, animacja klapy, światło przez płyty, pęknięcia, dźwięk).`);
