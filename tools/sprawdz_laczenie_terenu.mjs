// ------------------------------------------------------------
// SPRAWDZENIE ŁĄCZENIA TERENU (1.1.5) - rendering/RegionBatches.js
//
// Sklejona geometria regionu musi dawać dokładnie te same trójkąty
// w świecie co chunki rysowane osobno - w każdej chwili, także gdy
// chunk właśnie się zmienił albo zniknął:
//   - po sklejeniu: trójkąty regionu = trójkąty jego chunków (każdy
//     materiał osobno), chunki nie rysują się drugi raz,
//   - zmiana chunka: od razu rysuje się sam, a z regionu znika,
//   - usunięcie chunka: znika od razu, bez "ducha" w regionie,
//   - sklejanie czeka na spokój i idzie po trochu, najbliższe najpierw,
//   - wyłączenie: wszystko jak przed 1.1.5.
//
// Uruchomienie: node tools/sprawdz_laczenie_terenu.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/rendering/TextureAtlas.js')) {
            return { format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture = null, atlasAverageTexture = null;
                export const atlasReady = Promise.resolve({ tileSize: 16 }), atlasAveragesReady = Promise.resolve();
                export const getAtlasAverage = () => null, getTileColors = () => [], getTileMask = () => null;
                export const ATLAS_COLUMNS = 16, ATLAS_ROWS = 48, ATLAS_TILE_SIZE = 16, ATLAS_TILES = { water: { x: 0, y: 0 } };
                export const getAtlasUV = () => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1 });
            ` };
        }
        if (url.endsWith('/src/rendering/CarpenterTableRenderer.js')) {
            return { format: 'module', shortCircuit: true, source: 'export class CarpenterTableRenderer { update() {} dispose() {} } export const TABLE_ROTATION = {}; export function productSpot() { return { x: 0, z: 0 }; }' };
        }
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { RegionBatches, REGION_SIZE, FOLD_DELAY, FOLDS_PER_FRAME } = await import('../src/rendering/RegionBatches.js');
const { CHUNK_SIZE } = await import('../src/config.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Geometria chunka jak z ChunkMesher.js: czworokąty w grupach materiałów
// (0 bloki, 3 liście, 2 woda), atrybuty różnych typów.
let seed = 1;
const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
function chunkGeometry({ quads = { 0: 6, 3: 4, 2: 2 }, canopy = false } = {}) {
    const order = [0, 1, 3, 2].filter((m) => quads[m] > 0);
    const total = order.reduce((sum, m) => sum + quads[m], 0);
    const position = new Float32Array(total * 12), normal = new Float32Array(total * 12), uv = new Float32Array(total * 8);
    const color = new Uint8Array(total * 16), tint = new Uint8Array(total * 16), occlusion = new Uint8Array(total * 4);
    const index = new Uint32Array(total * 6);
    for (let q = 0; q < total; q++) {
        const x = Math.floor(random() * 15), y = Math.floor(random() * 60), z = Math.floor(random() * 15);
        const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0]];
        corners.forEach(([a, b, c], k) => { position.set([x + a, y + b, z + c + Math.round(random() * 8) / 16], (q * 4 + k) * 3); normal.set([0, 0, 1], (q * 4 + k) * 3); uv.set([a, b], (q * 4 + k) * 2); });
        for (let k = 0; k < 16; k++) { color[q * 16 + k] = Math.floor(random() * 256); tint[q * 16 + k] = Math.floor(random() * 256); }
        for (let k = 0; k < 4; k++) occlusion[q * 4 + k] = Math.floor(random() * 256);
        index.set([0, 2, 1, 2, 3, 1].map((v) => q * 4 + v), q * 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 4, true));
    geometry.setAttribute('tint', new THREE.BufferAttribute(tint, 4, true));
    geometry.setAttribute('surfaceOcclusion', new THREE.BufferAttribute(occlusion, 1, true));
    if (canopy) geometry.setAttribute('canopyTint', new THREE.BufferAttribute(new Uint8Array(total * 12).map(() => Math.floor(random() * 200)), 3, true));
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
    let start = 0;
    for (const m of order) { geometry.addGroup(start, quads[m] * 6, m); start += quads[m] * 6; }
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, 32, 8), Math.sqrt(64 + 64 + 32 * 32) + 1.2);
    return geometry;
}
const MATERIALS = [0, 1, 2, 3].map((i) => Object.assign(new THREE.MeshBasicMaterial(), { name: `m${i}` }));
function makeWorld() {
    const scene = new THREE.Scene();
    const batches = new RegionBatches(scene, MATERIALS);
    const chunks = new Map();
    const world = {
        scene, batches, chunks,
        set(cx, cz, options) {
            const key = `${cx},${cz}`;
            let chunk = chunks.get(key);
            if (!chunk) { chunk = { cx, cz, mesh: null }; chunks.set(key, chunk); }
            const geometry = chunkGeometry(options);
            if (chunk.mesh) chunk.mesh.geometry = geometry;
            else { chunk.mesh = new THREE.Mesh(geometry, MATERIALS); chunk.mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE); scene.add(chunk.mesh); }
            batches.changed(chunk);
            return chunk;
        },
        remove(cx, cz) { const chunk = chunks.get(`${cx},${cz}`); scene.remove(chunk.mesh); chunk.mesh = null; batches.changed(chunk); chunks.delete(`${cx},${cz}`); return chunk; },
        settle(frames = 400, cx = 0, cz = 0) { for (let i = 0; i < frames; i++) batches.update(0.05, cx, cz); }
    };
    return world;
}

// Trójkąty, które NAPRAWDĘ by się narysowały: dla każdego widocznego
// mesha sceny jego grupy -> napisy "materiał|wierzchołki w świecie + dane".
function drawn(scene) {
    const out = [];
    let draws = 0;
    for (const mesh of scene.children) {
        if (!mesh.visible) continue;
        const geometry = mesh.geometry, at = geometry.attributes, index = geometry.index.array;
        for (const group of geometry.groups) {
            if (group.count <= 0) continue;
            draws++;
            for (let i = group.start; i < group.start + group.count; i += 3) {
                const parts = [group.materialIndex];
                for (let k = 0; k < 3; k++) {
                    const v = index[i + k];
                    parts.push((at.position.array[v * 3] + mesh.position.x).toFixed(3), at.position.array[v * 3 + 1].toFixed(3), (at.position.array[v * 3 + 2] + mesh.position.z).toFixed(3));
                    parts.push(at.color.array[v * 4], at.tint.array[v * 4 + 1], at.surfaceOcclusion.array[v], at.uv.array[v * 2], at.normal.array[v * 3 + 2]);
                    parts.push(at.canopyTint ? at.canopyTint.array[v * 3] : 255);
                }
                out.push(parts.join('|'));
            }
        }
    }
    return { triangles: out.sort(), draws };
}
// To samo bez łączenia: wszystkie chunki osobno.
function expected(world) {
    const scene = new THREE.Scene();
    for (const chunk of world.chunks.values()) {
        if (!chunk.mesh) continue;
        const mesh = new THREE.Mesh(chunk.mesh.geometry, MATERIALS); mesh.position.copy(chunk.mesh.position); scene.children.push(mesh);
    }
    return drawn(scene);
}
const same = (world, message) => {
    const a = drawn(world.scene), b = expected(world);
    check(a.triangles.length === b.triangles.length && a.triangles.every((t, i) => t === b.triangles[i]), `${message}: te same trójkąty co bez łączenia (${a.triangles.length})`);
    check(new Set(a.triangles).size === new Set(b.triangles).size, `${message}: nic nie rysuje się dwa razy`);
    return a;
};
const regionMeshes = (world) => world.scene.children.filter((mesh) => mesh.name === 'region-terenu');

check(REGION_SIZE === 2 && FOLD_DELAY > 0.2 && FOLD_DELAY <= 2 && FOLDS_PER_FRAME >= 1, 'Stałe: region 2x2, sklejanie po krótkiej ciszy');


// --- Sklejenie jednego regionu -----------------------------------------------------------

{
    const world = makeWorld();
    for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) world.set(cx, cz, { canopy: cx === 1 });
    let now = same(world, 'Przed sklejeniem');
    check(regionMeshes(world).length === 0 && now.draws === 12, 'Nowe chunki rysują się osobno (4 chunki x 3 materiały)');
    world.batches.update(FOLD_DELAY * 0.5, 0, 0);
    check(regionMeshes(world).length === 0, 'Za wcześnie na sklejanie');
    world.settle();
    now = same(world, 'Po sklejeniu');
    const [region] = regionMeshes(world);
    check(regionMeshes(world).length === 1 && now.draws === 3, 'Jeden region: 3 polecenia rysowania zamiast 12');
    check([...world.chunks.values()].every((chunk) => chunk.mesh.visible === false), 'Sklejone chunki nie rysują się osobno');
    const geometry = region.geometry;
    check(geometry.attributes.position.count === [...world.chunks.values()].reduce((sum, chunk) => sum + chunk.mesh.geometry.attributes.position.count, 0), 'Wierzchołki: suma chunków');
    check(geometry.groups.length === 3 && geometry.groups.map((group) => group.materialIndex).join() === '0,3,2', 'Grupy: bloki, liście, woda - po jednej');
    check(geometry.index.array instanceof Uint16Array && Math.max(...geometry.index.array) < geometry.attributes.position.count, 'Indeksy w zakresie (16 bitów przy małej geometrii)');
    check(geometry.attributes.color.normalized && geometry.attributes.color.array instanceof Uint8Array && geometry.attributes.position.array instanceof Float32Array, 'Typy atrybutów jak w chunkach');
    check(geometry.attributes.canopyTint && geometry.attributes.canopyTint.itemSize === 3, 'Atrybut, który ma tylko część chunków, jest w regionie (brak = biały)');
    const sphere = geometry.boundingSphere;
    const position = geometry.attributes.position.array;
    let inside = true;
    for (let i = 0; i < position.length; i += 3) if (Math.hypot(position[i] - sphere.center.x, position[i + 1] - sphere.center.y, position[i + 2] - sphere.center.z) > sphere.radius + 1e-6) inside = false;
    check(inside, 'Kula regionu obejmuje wszystkie wierzchołki');
    check(sphere.radius < 45 && Math.abs(sphere.center.x - 16) < 1e-6 && Math.abs(sphere.center.z - 16) < 1e-6 && Math.abs(sphere.center.y - 32) < 1e-6, `Kula regionu jest ciasna (promień ${sphere.radius.toFixed(1)}: pudełko 2x2 chunki z zapasem na rośliny)`);
    check(region.position.x === 0 && region.position.z === 0 && region.matrixWorld.elements[12] === 0, 'Region stoi w swoim rogu świata');
    // Po wysłaniu na kartę kopia w pamięci gry jest zwalniana.
    const before = geometry.attributes.position.array.length;
    geometry.attributes.position.onUploadCallback.call(geometry.attributes.position);
    geometry.index.onUploadCallback.call(geometry.index);
    check(before > 0 && geometry.attributes.position.array === null && geometry.index.array === null && geometry.attributes.position.count > 0, 'Dane regionu zwalniane z pamięci po wysłaniu na kartę');
    const stats = world.batches.getStats();
    check(stats.merged === 1 && stats.members === 4 && stats.solo === 0 && stats.waiting === 0 && stats.folds === 1, 'Statystyki: 4 chunki w 1 regionie');
}


// --- Zmiana i usunięcie chunka: bez opóźnienia, bez ducha --------------------------------

{
    const world = makeWorld();
    for (const [cx, cz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) world.set(cx, cz);
    world.settle();
    const folded = regionMeshes(world)[0];
    // Gracz wykopał blok: chunk (1,0) ma nową geometrię.
    const edited = world.set(1, 0, { quads: { 0: 9, 3: 1 } });
    let now = same(world, 'Zaraz po zmianie chunka');
    check(edited.mesh.visible === true && regionMeshes(world)[0] === folded, 'Zmieniony chunk rysuje się sam; region zostaje (bez wysyłania danych)');
    check(now.draws === 6 + 2, 'Region dzieli się na zakresy wokół zmienionego chunka (na chwilę więcej poleceń, zero wysyłania danych)');
    world.batches.update(FOLD_DELAY * 0.4, 0, 0);
    world.set(1, 0, { quads: { 0: 5 } });
    world.batches.update(FOLD_DELAY * 0.8, 0, 0);
    check(regionMeshes(world)[0] === folded, 'Kolejna zmiana odsuwa sklejanie (liczy się cisza od ostatniej)');
    world.settle();
    now = same(world, 'Po ponownym sklejeniu');
    check(regionMeshes(world).length === 1 && regionMeshes(world)[0] !== folded && now.draws === 3 && edited.mesh.visible === false, 'Po ciszy region sklejony od nowa');

    // Chunk znika (gracz odszedł): od razu, bez ducha w regionie.
    world.remove(0, 1);
    now = same(world, 'Zaraz po usunięciu chunka');
    world.settle();
    now = same(world, 'Po sklejeniu trzech');
    check(world.batches.getStats().members === 3, 'Region z trzech chunków');
    world.remove(0, 0); world.remove(1, 0);
    same(world, 'Zostaje jeden chunk');
    world.settle();
    check(regionMeshes(world).length === 0 && world.chunks.get('1,1').mesh.visible === true, 'Jeden chunk w regionie rysuje się sam (nie ma czego sklejać)');
    world.remove(1, 1);
    check(world.batches.regions.size === 0 && world.batches.byChunk.size === 0 && world.scene.children.length === 0, 'Pusty region znika bez śladu');
}


// --- Wiele regionów, ujemne współrzędne, kolejność --------------------------------------

{
    const world = makeWorld();
    for (let cz = -4; cz < 4; cz++) for (let cx = -4; cx < 4; cx++) world.set(cx, cz);
    world.batches.update(FOLD_DELAY + 0.01, 3, 3);
    const first = regionMeshes(world);
    check(first.length === FOLDS_PER_FRAME, `Najwyżej ${FOLDS_PER_FRAME} region na klatkę`);
    check(first[0].position.x === 2 * CHUNK_SIZE && first[0].position.z === 2 * CHUNK_SIZE, 'Najpierw region gracza');
    same(world, 'W trakcie sklejania');
    world.settle(60, 3, 3);
    const now = same(world, 'Po sklejeniu 16 regionów');
    check(regionMeshes(world).length === 16 && now.draws === 48, '64 chunki: 48 poleceń zamiast 192');
    check(regionMeshes(world).some((mesh) => mesh.position.x === -4 * CHUNK_SIZE && mesh.position.z === -2 * CHUNK_SIZE), 'Regiony po ujemnej stronie świata na swoich miejscach');
    // Chunk bez geometrii terenu (sam nie ma mesha) nie psuje regionu.
    world.remove(-1, -1);
    same(world, 'Dziura w regionie');
    world.settle(60);
    same(world, 'Region z dziurą sklejony');

    // Wyłączenie i ponowne włączenie.
    world.batches.setEnabled(false);
    let off = same(world, 'Łączenie wyłączone');
    check(regionMeshes(world).length === 0 && [...world.chunks.values()].every((chunk) => chunk.mesh.visible) && off.draws === 63 * 3, 'Wyłączone: każdy chunk osobno, jak dawniej');
    world.set(0, 0);
    world.settle(60);
    check(regionMeshes(world).length === 0, 'Wyłączone: nic się nie skleja');
    world.batches.setEnabled(true);
    world.settle(60);
    off = same(world, 'Łączenie włączone ponownie');
    check(regionMeshes(world).length === 16, 'Włączone ponownie: regiony wracają');

    world.batches.dispose();
    check(regionMeshes(world).length === 0 && [...world.chunks.values()].every((chunk) => chunk.mesh.visible) && world.batches.regions.size === 0, 'Po zamknięciu świata: bez regionów, chunki widoczne');
}


// --- Przypadki brzegowe ------------------------------------------------------------------

{
    // Duży region: indeksy 32-bitowe.
    const world = makeWorld();
    world.set(0, 0, { quads: { 0: 9000 } }); world.set(1, 0, { quads: { 0: 9000 } });
    world.settle(20);
    const region = regionMeshes(world)[0];
    check(region.geometry.index.array instanceof Uint32Array && region.geometry.attributes.position.count === 72000, 'Ponad 65 535 wierzchołków: indeksy 32-bitowe');
    same(world, 'Duży region');
}
{
    // Chunk z geometrią "wszystko w jednym" (narzędzia podglądu) zostaje sam.
    const world = makeWorld();
    world.set(0, 0); const combined = world.set(1, 0); combined.combinedGeometry = true; world.set(0, 1);
    world.settle(20);
    same(world, 'Chunk podglądu');
    check(combined.mesh.visible === true && world.batches.getStats().members === 2, 'Chunk podglądu (rośliny w tej samej geometrii) nie jest sklejany');
}
{
    // Chunk tylko z wodą i chunk tylko z blokami.
    const world = makeWorld();
    world.set(0, 0, { quads: { 2: 5 } }); world.set(1, 1, { quads: { 0: 5 } });
    world.settle(20);
    const now = same(world, 'Różne materiały');
    check(now.draws === 2 && regionMeshes(world)[0].geometry.groups.map((group) => group.materialIndex).join() === '0,2', 'Region ma tylko te materiały, które mają jego chunki');
}


// --- Podpięcie do gry ---------------------------------------------------------------------

{
    const world = source('src/world/World.js');
    check((world.match(/this\.regionBatches\?\.changed\(chunk\)/g) ?? []).length === 4, 'World: cztery miejsca zmiany mesha terenu zgłaszają ją do łączenia');
    check(/chunk\.mesh = null;\s*this\.regionBatches\?\.changed\(chunk\);/.test(world), 'World: usunięty mesh znika z regionu od razu');
    check(/if \(!plants\) this\.regionBatches\?\.changed\(chunk\);/.test(world), 'World: rośliny nie ruszają sklejonego terenu');
    check((world.match(/this\.regionBatches\?\.update\(dt, this\.centerCx, this\.centerCz\)/g) ?? []).length === 2, 'World: sklejanie w obu ścieżkach aktualizacji');
    check(/this\.regionBatches\?\.dispose\(\);/.test(world), 'World: sprzątanie przy wyjściu ze świata');
    const game = source('src/game/Game.js');
    check(/this\.world\.setRegionBatching\?\.\(settings\.get\('terrainBatching'\)\)/.test(game), 'Gra włącza łączenie według ustawienia');
    check(!/setRegionBatching/.test(source('src/menu/MenuWorld.js')), 'Żywe tło menu rysuje po staremu');
    check(/terrainBatching: true/.test(source('src/settings/Settings.js')) && /'laczenie-terenu': 'terrainBatching'/.test(source('src/commands/settingsCommands.js')), 'Ustawienie i komenda /ustaw laczenie-terenu');
}

console.log(`OK: łączenie terenu - ${checks} sprawdzeń`);
