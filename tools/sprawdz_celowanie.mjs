// ------------------------------------------------------------
// SPRAWDZENIE CELOWANIA W BLOKI (1.1.1)
//
// Celownik ma trafiać w blok tylko tam, gdzie blok naprawdę jest
// (interaction/BlockBounds.js), a ramka ma pokazywać dokładnie to samo.
// Sprawdzamy KAŻDY blok z rejestru: siatka promieni z góry i z boku
// przez jego komórkę - trafienie wtedy i tylko wtedy, gdy promień
// przechodzi przez kształt bloku; inaczej leci dalej, do kamienia za nim.
//
// Uruchomienie: node tools/sprawdz_celowanie.mjs
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
const R = await import('../src/blocks/BlockRegistry.js');
const { VoxelRaycast } = await import('../src/interaction/VoxelRaycast.js');
const { BlockHighlight } = await import('../src/interaction/BlockHighlight.js');
const { cellBoxes, FULL_CELL, FLAT_THICKNESS } = await import('../src/interaction/BlockBounds.js');
const { getTorchInfo } = await import('../src/blocks/torches.js');
const { getTorchBounds } = await import('../src/rendering/TorchGeometry.js');
const { riverPlantBounds } = await import('../src/interaction/RiverPlantBounds.js');
const { spritePlantBounds } = await import('../src/interaction/PlantBounds.js');
const { BlockPlacer } = await import('../src/interaction/BlockPlacer.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };

// Świat: kamienna podłoga (y = 0), kamienna ściana za blokiem (z = -2)
// i badany blok w (0, 1, 0).
const STONE = R.getBlockId('stone');
function makeWorld(blocks = {}) {
    const map = new Map(Object.entries(blocks));
    return {
        map,
        getBlockId: (x, y, z) => map.get(`${x},${y},${z}`) ?? (y === 0 || z === -2 ? STONE : 0),
        getBlock: (x, y, z) => R.getBlockTypeById(map.get(`${x},${y},${z}`) ?? (y === 0 || z === -2 ? STONE : 0)) ?? null
    };
}
const vec = (x, y, z) => new THREE.Vector3(x, y, z);

// Kształt bloku policzony niezależnie od celownika: pudełka w komórce
// albo (pochodnia, roślina z modelem) jedno pudełko modelu.
function shapeOf(world, id, x, y, z) {
    const boxes = cellBoxes(world, id, x, y, z);
    if (boxes.length) return boxes;
    const type = R.getBlockTypeById(id), definition = R.getBlockDefinition(type);
    const torch = getTorchInfo(id), river = R.getRiverPlant(id);
    const bounds = torch ? getTorchBounds(torch.attach) : river ? riverPlantBounds(river, x, y, z)
        : definition?.plant?.sprite ? spritePlantBounds(id, x, y, z) : null;
    return bounds ? [[...bounds.min, ...bounds.max]] : [];
}
// Czy prosta równoległa do osi (axis) w punkcie (u, v) przechodzi przez
// któreś pudełko - z marginesem: punkty tuż przy krawędzi pomijamy.
function through(boxes, axis, u, v, margin = 0.012) {
    const [a, b] = axis === 1 ? [0, 2] : [0, 1];
    let state = false;
    for (const box of boxes) {
        const du = Math.min(u - box[a], box[a + 3] - u), dv = Math.min(v - box[b], box[b + 3] - v);
        if (Math.abs(du) < margin || Math.abs(dv) < margin) { if (du > -margin && dv > -margin) return null; continue; }
        if (du > 0 && dv > 0) state = true;
    }
    return state;
}

const scene = { add() {} };
const highlight = new BlockHighlight(scene);
const kinds = { full: 0, shaped: 0, model: 0 };
const liquid = (id) => R.isLiquidId(id);
let rays = 0, shapedHits = 0, passes = 0;
const GRID = [0.03, 0.11, 0.2, 0.31, 0.42, 0.5, 0.58, 0.69, 0.8, 0.89, 0.97];

for (const [type, definition] of Object.entries(R.BLOCK_TYPES)) {
    const id = definition.id;
    if (!id || liquid(id)) continue;
    const world = makeWorld({ '0,1,0': id });
    const ray = new VoxelRaycast(world, 8);
    const boxes = shapeOf(world, id, 0, 1, 0);
    check(boxes.length > 0, `${type}: ma kształt dla celownika`);
    const full = cellBoxes(world, id, 0, 1, 0) === FULL_CELL;
    kinds[full ? 'full' : cellBoxes(world, id, 0, 1, 0).length ? 'shaped' : 'model']++;
    for (const box of boxes) {
        check(box.every(Number.isFinite) && box[0] < box[3] && box[1] < box[4] && box[2] < box[5], `${type}: poprawne pudełko`);
    }
    // Pełny blok musi być naprawdę pełnym sześcianem w grze.
    if (full) {
        check(!['flat', 'cross', 'chest', 'structure', 'shape', 'door', 'riverPlant'].includes(definition.model), `${type}: model ${definition.model} nie jest pełną komórką`);
    }
    else if (cellBoxes(world, id, 0, 1, 0).length) {
        check(boxes.every((box) => box.every((value) => value >= -1e-9 && value <= 1 + 1e-9)), `${type}: kształt mieści się w komórce`);
    }

    let hits = 0;
    for (const u of GRID) for (const v of GRID) {
        // Z góry (wzdłuż -y) i z boku (wzdłuż -z).
        for (const axis of [1, 2]) {
            const expected = through(boxes, axis, u, v + (axis === 2 ? 0 : 0));
            if (expected === null) continue;
            const origin = axis === 1 ? vec(u, 3.5, v) : vec(u, 1 + v, 3.5);
            const hit = ray.cast(origin, axis === 1 ? vec(0, -1, 0) : vec(0, 0, -1));
            rays++;
            const onBlock = hit.hit && hit.block.x === 0 && hit.block.y === 1 && hit.block.z === 0;
            if (expected) {
                hits++;
                if (!onBlock) check(false, `${type}: promień ${axis === 1 ? 'z góry' : 'z boku'} (${u}, ${v}) powinien trafić w blok, a trafił w ${hit.block?.type ?? 'nic'}`);
            }
            else {
                passes++;
                if (onBlock) check(false, `${type}: promień ${axis === 1 ? 'z góry' : 'z boku'} (${u}, ${v}) mija kształt bloku, a mimo to w niego trafił`);
                else if (!(hit.hit && hit.block.type === 'stone')) check(false, `${type}: promień obok bloku powinien dolecieć do kamienia za nim`);
            }
        }
    }
    check(hits > 0, `${type}: da się w niego trafić`);
    if (!full) shapedHits++;

    // Ramka = trafiony kształt.
    const extent = [0, 1, 2].map((axis) => [Math.min(...boxes.map((box) => box[axis])), Math.max(...boxes.map((box) => box[axis + 3]))]);
    const aim = boxes[0], cx = (aim[0] + aim[3]) / 2, cz = (aim[2] + aim[5]) / 2;
    const hit = ray.cast(vec(cx, 3.5, cz), vec(0, -1, 0));
    check(hit.hit && hit.block.type === type && hit.point && hit.point.y >= 1 + extent[1][0] - 1e-6 && hit.point.y <= 1 + extent[1][1] + 1e-6, `${type}: punkt trafienia leży na kształcie`);
    highlight.update(hit);
    for (let axis = 0; axis < 3; axis++) {
        const size = full ? 1 : extent[axis][1] - extent[axis][0], center = full ? 0.5 : (extent[axis][0] + extent[axis][1]) / 2;
        const scale = highlight.mesh.scale.getComponent(axis), position = highlight.mesh.position.getComponent(axis) - [0, 1, 0][axis];
        check(Math.abs(scale - Math.max(0.01, size)) < 1e-6 && Math.abs(position - center) < 1e-6, `${type}: ramka pokazuje trafiany kształt (oś ${axis}: ${scale.toFixed(3)} / ${size.toFixed(3)})`);
    }
}
check(kinds.shaped > 1500 && kinds.full > 100 && kinds.model > 100, `Rodzaje: ${JSON.stringify(kinds)}`);
check(passes > 50000, `Promienie obok kształtu lecą dalej (${passes})`);


// --- Przypadek Kamila: płaski mech nie zasłania bloku za nim -----------------------

const id = R.getBlockId;
for (const flat of ['moss_carpet', 'snow_layer', 'oak_leaf_litter', 'beech_leaf_litter', 'maple_leaf_litter']) {
    // Mech leży przed kamieniem; celujemy z góry, pod kątem, w przednią
    // ścianę kamienia - promień przechodzi nad mchem przez jego komórkę.
    const world = makeWorld({ '0,1,0': id(flat), '0,1,-1': STONE });
    const ray = new VoxelRaycast(world, 8);
    const origin = vec(0.5, 2.6, 2.5), target = vec(0.5, 1.45, 0);
    const hit = ray.cast(origin, target.clone().sub(origin));
    check(hit.block?.type === 'stone' && hit.block.z === -1 && hit.normal.z === 1, `${flat}: celując nad nim w ścianę za nim, trafiam w ścianę`);
    // Niżej - w sam mech.
    const low = ray.cast(origin, vec(0.5, 1.02, 0.5).sub(origin));
    check(low.block?.type === flat && low.normal.y === 1 && Math.abs(low.point.y - (1 + FLAT_THICKNESS)) < 1e-6, `${flat}: celując w niego, trafiam w niego (od góry)`);
    // Poziomo tuż nad ziemią - w jego bok; poziomo wyżej - mijam.
    check(ray.cast(vec(0.5, 1.04, 2.5), vec(0, 0, -1)).block?.type === flat, `${flat}: da się trafić z boku`);
    check(ray.cast(vec(0.5, 1.5, 2.5), vec(0, 0, -1)).block?.z === -1, `${flat}: poziomy promień nad nim leci dalej`);
    // Blok stawiany na mchu zastępuje go albo staje na nim - nie w powietrzu obok.
    const placer = new BlockPlacer(world, { intersectsBlock: () => false, yaw: 0 });
    const spot = placer.targetOf(low, 'stone');
    check(spot.x === 0 && spot.z === 0 && (spot.y === 1 || spot.y === 2), `${flat}: blok stawia się w jego miejscu albo na nim`);
}
// Wieniec na ścianie: cienki przy ścianie, reszta komórki wolna.
{
    const world = makeWorld({ '0,1,-1': id('spruce_wreath'), '1,1,-1': STONE });
    const ray = new VoxelRaycast(world, 8);
    check(ray.cast(vec(0.5, 1.5, 3), vec(0, 0, -1)).block?.type === 'spruce_wreath', 'Wieniec: trafiam, celując w ścianę z wieńcem');
    // Z ukosa przez komórkę wieńca w bok sąsiedniego bloku.
    const origin = vec(-0.6, 1.5, -0.1), hit = ray.cast(origin, vec(1, 1.5, -0.5).sub(origin));
    check(hit.block?.x === 1 && hit.block.type === 'stone', 'Wieniec: przez pustą część jego komórki trafiam w blok obok');
}
// Trawa i kwiaty: przez brzeg komórki widać ziemię pod spodem i blok za nimi.
for (const plant of ['short_grass', 'tall_grass', 'poppy', 'dandelion', 'fern', 'oak_sapling', 'reed']) {
    const world = makeWorld({ '0,1,0': id(plant), '0,1,-1': STONE });
    const ray = new VoxelRaycast(world, 8);
    const box = cellBoxes(world, id(plant), 0, 1, 0)[0];
    check(box[3] - box[0] < 0.8 && box[5] - box[2] < 0.8, `${plant}: węższa niż komórka (${(box[3] - box[0]).toFixed(2)})`);
    const edge = box[0] > 0.06 ? box[0] / 2 : (box[3] + 1) / 2;
    check(ray.cast(vec(edge, 3, 0.5), vec(0, -1, 0)).block?.y === 0, `${plant}: obok kępki trafiam w ziemię pod nią`);
    check(ray.cast(vec(edge, 1.5, 3), vec(0, 0, -1)).block?.z === -1, `${plant}: obok kępki trafiam w blok za nią`);
    check(ray.cast(vec((box[0] + box[3]) / 2, 1.2, 3), vec(0, 0, -1)).block?.type === plant, `${plant}: w środek kępki trafiam`);
}
// Skrzynia: narożnik komórki jest pusty.
{
    const world = makeWorld({ '0,1,0': id('chest') });
    const ray = new VoxelRaycast(world, 8);
    check(ray.cast(vec(0.03, 3, 0.03), vec(0, -1, 0)).block?.y === 0 && ray.cast(vec(0.5, 3, 0.5), vec(0, -1, 0)).block?.type === 'chest', 'Skrzynia: obok niej trafiam w podłogę');
    check(ray.cast(vec(0.5, 1.95, 3), vec(0, 0, -1)).block?.type === 'stone', 'Skrzynia: nad nią promień leci dalej');
}
// Roślina z paczki (większa niż blok) w swojej komórce nie jest pełnym sześcianem.
{
    const type = Object.keys(R.BLOCK_TYPES).find((name) => R.BLOCK_TYPES[name].plant?.sprite);
    const world = makeWorld({ '0,1,0': id(type) });
    const ray = new VoxelRaycast(world, 8);
    const bounds = spritePlantBounds(id(type), 0, 1, 0);
    check(ray.cast(vec((bounds.min[0] + bounds.max[0]) / 2, 1.2, 3), vec(0, 0, -1)).block?.type === type, `${type}: trafiam w środek`);
    if (bounds.min[0] > 0.05) check(ray.cast(vec(bounds.min[0] / 2, 1.2, 3), vec(0, 0, -1)).block?.type === 'stone', `${type}: obok rośliny promień leci dalej`);
}
// Oko w kępce trawy (gracz stoi w trawie): trawa nie zasłania celu.
{
    const world = makeWorld({ '0,1,0': id('tall_grass'), '0,1,-1': STONE });
    const ray = new VoxelRaycast(world, 8);
    const box = cellBoxes(world, id('tall_grass'), 0, 1, 0)[0];
    const hit = ray.cast(vec((box[0] + box[3]) / 2, 1.3, (box[2] + box[5]) / 2), vec(0, 0, -1));
    check(hit.block?.type === 'stone', 'Z wnętrza kępki trawy trafiam w blok przed sobą');
}
// Pełne bloki bez zmian: ściana wejścia, odległość, punkt.
{
    const world = makeWorld({ '0,1,0': STONE });
    const ray = new VoxelRaycast(world, 8);
    const hit = ray.cast(vec(0.5, 1.5, 3), vec(0, 0, -1));
    check(hit.block.type === 'stone' && hit.normal.z === 1 && Math.abs(hit.distance - 2) < 1e-9 && Math.abs(hit.point.z - 1) < 1e-9 && hit.bounds === null, 'Pełny blok: ściana, odległość i punkt jak dotąd');
    check(ray.cast(vec(0.5, 5.5, 30), vec(0, 0, -1)).hit === false, 'Poza zasięgiem nie ma trafienia');
}

console.log(`OK: celowanie - ${checks} sprawdzeń, ${rays} promieni, bloki: ${kinds.full} pełnych, ${kinds.shaped} z własnym kształtem w komórce, ${kinds.model} z modelem`);
