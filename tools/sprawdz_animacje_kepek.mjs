// Duże rośliny z paczek (krzew, łukowate liście) i animacje roślin z paczek
// (kępki i krzewy - TuftAnimation.js, PlantAnimations.js):
//   - indygowiec i marzanna: rozmiary, wystawanie poza blok, ucinanie przy
//     litych blokach (maska sąsiadów), liczba ścian w rozsądnych granicach,
//   - posadzenie, wzrost, zbiór (najpierw kwiaty maleją wokół własnych
//     środków, potem etap po zbiorze), pełny ekwipunek, zniszczenie,
//   - neutralny początek i koniec, koniec = model jak bez animacji,
//   - dywany, porosty i huby bez animacji, zapis bez zmian.
// node tools/sprawdz_animacje_kepek.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (url.endsWith('/src/player/skin.js')) return { format: 'module', shortCircuit: true, source: 'export const skinTexture=null;' };
        if (url.endsWith('/src/rendering/TextureAtlas.js')) return {
            format: 'module', shortCircuit: true, source: `
                export const blockAtlasTexture=null,atlasAverageTexture=null;
                export const atlasReady=Promise.resolve({tileSize:16,mipmaps:false}),atlasAveragesReady=Promise.resolve();
                export const getAtlasAverage=()=>null;
                export const getAtlasUV=()=>({uMin:0,uMax:1,vMin:0,vMax:1});
                export const ATLAS_COLUMNS=16,ATLAS_ROWS=16,ATLAS_TILES={water:{x:0,y:0}};`
        };
        if (url.endsWith('.js') && url.includes('/assets/models/')) return next(url, { ...context, format: 'module' });
        return next(url, context);
    }
});

const { PlantAnimations } = await import('../src/rendering/PlantAnimations.js');
const { sampleTuftAnimation, transformTuftVertex, tuftAnimationKind, isTuftAnimated, TUFT_CLIP_SECONDS, TUFT_HARVEST_SWITCH } = await import('../src/rendering/TuftAnimation.js');
const { getRiverPlantFaces } = await import('../src/rendering/RiverPlantGeometry.js');
const { buildChunkGeometry } = await import('../src/rendering/ChunkMesher.js');
const { World } = await import('../src/world/World.js');
const { Chunk } = await import('../src/world/Chunk.js');
const { PlantGrowth } = await import('../src/game/PlantGrowth.js');
const { Inventory } = await import('../src/game/Inventory.js');
const { BLOCK_TYPES, getGrowth, getBlockId, getHarvest } = await import('../src/blocks/BlockRegistry.js');
const { PLANT_PACK_ERRORS } = await import('../src/blocks/plantPacks.js');
const { Scene, Vector3 } = await import('three');

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const equal = (a, b, message) => { assert.equal(a, b, message); checks++; };
const near = (a, b, message, eps = 1e-6) => { assert.ok(Math.abs(a - b) <= eps, `${message}: ${a} != ${b}`); checks++; };

equal(PLANT_PACK_ERRORS.length, 0, `paczki bez błędów: ${PLANT_PACK_ERRORS.join('; ')}`);

// ------------------------------------------------------------
// Duże rośliny: wymiary, wystawanie, ucinanie, liczba ścian.
// ------------------------------------------------------------

const extent = (faces) => {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const face of faces) for (const v of face.vertices) for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], v[a]); max[a] = Math.max(max[a], v[a]);
    }
    return { min, max };
};

for (const pack of ['indygowiec', 'marzanna']) {
    for (let stage = 1; stage <= 3; stage++) {
        const type = `${pack}_etap${stage}`;
        const river = BLOCK_TYPES[type].riverPlant;
        ok(river?.tuft, `${type}: model z pikseli`);
        let faces = 0, widest = 0, tallest = 0;
        for (let variant = 0; variant < 8; variant++) {
            const model = getRiverPlantFaces(river.kind, variant, false, river.tuft, 0);
            const { min, max } = extent(model);
            faces += model.length;
            widest = Math.max(widest, max[0] - min[0], max[2] - min[2]);
            tallest = Math.max(tallest, max[1]);
            ok(min[1] >= -1e-9, `${type}/${variant}: nic pod ziemią`);
            ok(max[1] <= river.tuft.height / 16 + 1e-9, `${type}/${variant}: wysokość w granicach tuftPixels (${max[1] * 16} > ${river.tuft.height})`);
            ok(Math.max(-min[0], max[0], -min[2], max[2]) <= BLOCK_TYPES[type].plant.width + 1e-9, `${type}/${variant}: szerokość w granicach tuftWidth`);
        }
        ok(faces / 8 < 1100, `${type}: średnio ${Math.round(faces / 8)} ścian (limit 1100)`);
        if (stage === 3) {
            ok(river.tuft.wide, `${type}: duża roślina (wystaje poza blok)`);
            ok(widest > 1.05, `${type}: szersza niż blok (${widest.toFixed(2)})`);
            ok(tallest > 1, `${type}: wyższa niż blok (${tallest.toFixed(2)})`);
            // Ucinanie: lity blok obok - żadna ściana rośliny nie leży w jego
            // komórce (środek ściany w środku komórki sąsiada).
            const cells = [[1, 1, 0], [2, 0, 1], [4, -1, 0], [8, 0, -1], [16, 1, 1], [32, -1, 1], [64, -1, -1], [128, 1, -1]];
            const inside = (face, cx, cz) => {
                const c = [0, 1, 2].map((a) => face.vertices.reduce((sum, v) => sum + v[a], 0) / 4);
                const test = (value, cell) => (cell === 0 ? Math.abs(value) < 0.5 - 1e-9 : cell * value > 0.5 + 1e-9);
                return test(c[0], cx) && test(c[2], cz) && c[1] < 1;
            };
            let unclipped = 0;
            for (const [bit, cx, cz] of cells) {
                for (let variant = 0; variant < 8; variant++) {
                    const model = getRiverPlantFaces(river.kind, variant, false, river.tuft, bit);
                    ok(!model.some((face) => inside(face, cx, cz)), `${type}/${variant}: ucięte przy ścianie (bit ${bit})`);
                    unclipped += getRiverPlantFaces(river.kind, variant, false, river.tuft, 0).some((face) => inside(face, cx, cz)) ? 1 : 0;
                }
            }
            ok(unclipped > 0, `${type}: bez ścian obok wystaje do sąsiednich komórek`);
            const center = (face) => [0, 1, 2].map((a) => face.vertices.reduce((sum, v) => sum + v[a], 0) / 4);
            for (let variant = 0; variant < 8; variant++) {
                const above = getRiverPlantFaces(river.kind, variant, false, river.tuft, 65536).filter((face) => {
                    const [x, y, z] = center(face);
                    return Math.abs(x) < 0.5 - 1e-9 && Math.abs(z) < 0.5 - 1e-9 && y > 1 + 1e-9;
                });
                equal(above.length, 0, `${type}/${variant}: ucięte pod blokiem nad rośliną`);
                const all = extent(getRiverPlantFaces(river.kind, variant, false, river.tuft, 0x1ffff));
                ok(Math.max(all.max[0], all.max[2], -all.min[0], -all.min[2]) <= 0.5 + 1e-9 && all.max[1] <= 1 + 1e-9, `${type}/${variant}: ze wszystkich stron - tylko własna komórka`);
            }
        }
    }
}

// Pozostałe rośliny (bez "wide") - bez zmian: mieszczą się w bloku.
for (const [type, definition] of Object.entries(BLOCK_TYPES)) {
    const tuft = definition.riverPlant?.tuft;
    if (!tuft || type.startsWith('indygowiec') || type.startsWith('marzanna')) continue;
    ok(!tuft.wide, `${type}: mieści się w bloku (bez ucinania)`);
}

// ------------------------------------------------------------
// Rodzaje przejść.
// ------------------------------------------------------------

const id = (type) => getBlockId(type);
equal(tuftAnimationKind(0, id('indygowiec_etap1')), 'place', 'posadzenie');
equal(tuftAnimationKind(id('indygowiec_etap1'), id('indygowiec_etap2')), 'grow', 'wzrost');
equal(tuftAnimationKind(id('indygowiec_etap3'), id('indygowiec_etap2')), 'harvest', 'zbiór indygowca (wraca do 2. etapu)');
equal(tuftAnimationKind(id('marzanna_etap3'), id('marzanna_etap1')), 'harvest', 'zbiór marzanny (wraca do 1. etapu)');
equal(tuftAnimationKind(id('lawenda_etap2'), 0), 'break', 'zniszczenie');
equal(tuftAnimationKind(id('lawenda_etap2'), id('stone')), null, 'zastąpienie blokiem - bez animacji');
equal(tuftAnimationKind(id('lawenda_etap2'), id('marzanna_etap1')), 'place', 'inna roślina - nowa');
for (const type of ['barwinek_etap3', 'porostoliwkowy_etap2', 'huba_etap2']) {
    ok(!isTuftAnimated(id(type)), `${type}: bez animacji (zależy od sąsiadów)`);
}
ok(isTuftAnimated(id('kocanka_etap3')) && isTuftAnimated(id('piwonia_etap3')), 'starsze kępki też animowane');

// Neutralny początek i koniec.
for (const kind of ['place', 'grow', 'harvest', 'reject', 'break']) {
    const event = { kind, duration: TUFT_CLIP_SECONDS[kind], from: { size: kind === 'grow' ? .6 : kind === 'place' ? .35 : 1 }, phase: kind === 'harvest' ? 1 : 0 };
    const start = sampleTuftAnimation(event, 0);
    near(start.bend, 0, `${kind}: bez ugięcia na początku`);
    const end = sampleTuftAnimation(event, event.duration);
    near(end.bend, 0, `${kind}: bez ugięcia na końcu`);
    near(end.squash, 1, `${kind}: bez spłaszczenia na końcu`);
    near(end.size, kind === 'break' ? 0 : 1, `${kind}: końcowy rozmiar`);
    let peak = 0;
    for (let t = 0; t <= event.duration; t += 0.01) peak = Math.max(peak, sampleTuftAnimation(event, t).size);
    ok(peak <= 1.12, `${kind}: przeskok najwyżej 12% (${peak.toFixed(3)})`);
}

// ------------------------------------------------------------
// W świecie: posadzenie, wzrost, zbiór, pełny ekwipunek, zniszczenie.
// ------------------------------------------------------------

const gameSource = await readFile(new URL('../src/game/Game.js', import.meta.url), 'utf8');
const harvestBody = gameSource.split('    harvestTarget(hit) {')[1].split('\n    // --------------------------------------------------------')[0];
const harvestTarget = new Function('getHarvest', 'THREE', `return function(hit) {${harvestBody.trim().slice(0, -1)}}`)(getHarvest, { Vector3 });

const world = new World(new Scene(), 123, new Map(), 'classic');
const chunk = new Chunk(-1, 0); chunk.skyLight.fill(15); world.chunks.set('-1,0', chunk);
for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setId(x, 9, z, getBlockId('dirt'));
world.rebuildChunkMesh(chunk);
const controller = new PlantAnimations(world, { position: new Vector3(-8, 11, 5) });
const at = [-8, 10, 5], local = [8, 10, 5];
const index = chunk.index(...local);
const event = () => controller.overridesFor(chunk)?.get(index);
const rebuild = () => world.rebuildChunkMesh(chunk);
const finish = () => {
    world.dirtyChunks.clear(); controller.update(3);
    equal(world.dirtyChunks.size, 0, 'koniec bez dodatkowej przebudowy');
    rebuild(); equal(controller.active.size, 0, 'po końcu brak aktywnych animacji');
};
const positions = () => Array.from(chunk.mesh.geometry.attributes.position.array);
const staticPositions = () => {
    const geometry = buildChunkGeometry(chunk, world);
    const result = Array.from(geometry.attributes.position.array);
    geometry.dispose();
    return result;
};
const samePositions = (message) => {
    const now = positions(), expected = staticPositions();
    equal(now.length, expected.length, `${message}: tyle samo wierzchołków`);
    let worst = 0;
    for (let i = 0; i < now.length; i++) worst = Math.max(worst, Math.abs(now[i] - expected[i]));
    ok(worst < 1e-5, `${message}: model jak bez animacji (różnica ${worst})`);
};

// Posadzenie.
world.setBlock(...at, 'indygowiec_etap1');
equal(event()?.kind, 'place', 'posadzenie - animacja');
rebuild();
const placing = event();
ok(placing.binding, 'animacja związana z geometrią chunka');
const geometry = chunk.mesh.geometry;
controller.update(.1);
ok(placing.pose.size > .35 && placing.pose.size < 1.1, `posadzenie - rośnie (${placing.pose.size.toFixed(2)})`);
equal(chunk.mesh.geometry, geometry, 'bez przebudowy w każdej klatce');
controller.update(.1);
const saved = chunk.blocks.slice();
controller.update(.1);
assert.deepEqual(chunk.blocks, saved); checks++;
controller.update(1); rebuild();
samePositions('po posadzeniu');

// Wzrost: od wysokości poprzedniego etapu.
const growth = new PlantGrowth(world);
equal(growth.grow(chunk, index, getGrowth('indygowiec_etap1')), true, 'wzrost do 2. etapu');
equal(chunk.blocks[index], getBlockId('indygowiec_etap2'), 'etap zmienia się od razu');
equal(event()?.kind, 'grow', 'wzrost - animacja');
const ratio = BLOCK_TYPES.indygowiec_etap1.riverPlant.tuft.height / BLOCK_TYPES.indygowiec_etap2.riverPlant.tuft.height;
near(event().from.size, Math.max(.4, ratio), 'wzrost zaczyna od wysokości poprzedniego etapu');
rebuild(); controller.update(.5);
ok(event().pose.size > event().from.size && event().pose.size < 1, 'wzrost - w trakcie');
finish();
samePositions('po wzroście');

// Zbiór (pełny krzew -> etap 2): kwiaty maleją, potem etap po zbiorze.
world.setBlock(...at, 'indygowiec_etap3'); rebuild(); finish();
const inventory = Inventory.load({}, 'adventure');
inventory.slots.forEach((_, i) => inventory.set(i, { type: 'stone', count: 64 }));
let awarded = 0;
const game = { world, inventory, plantAnimations: controller, onNotice() {}, achieve() {}, addHarvest() { awarded++; return 3; } };
const hit = { hit: true, block: { x: at[0], y: at[1], z: at[2], type: 'indygowiec_etap3' } };
equal(harvestTarget.call(game, hit), false, 'pełny ekwipunek - bez zbioru');
equal(event()?.kind, 'reject', 'pełny ekwipunek - reakcja');
equal(world.getBlockId(...at), getBlockId('indygowiec_etap3'), 'roślina zostaje');
equal(awarded, 0, 'nic nie trafia do ekwipunku');
const rejected = event();
controller.reject(...at);
equal(event(), rejected, 'kolejne kliknięcia nie restartują reakcji');
rebuild(); finish();

inventory.set(0, null);
equal(harvestTarget.call(game, hit), true, 'zbiór');
equal(world.getBlockId(...at), getBlockId('indygowiec_etap2'), 'po zbiorze - 2. etap od razu');
equal(awarded, 1, 'liście w ekwipunku');
const harvest = event();
equal(harvest.kind, 'harvest', 'zbiór - animacja');
equal(harvest.renderId, getBlockId('indygowiec_etap3'), 'na początku zbioru widać krzew z kwiatami');
rebuild();
const flowers = harvest.binding.faces.filter((face) => harvest.flowerFaces.has(face));
ok(flowers.length > 0, 'kwiaty rozpoznane po kolorach');
controller.update(.1);
const pose = harvest.pose;
ok(pose.bloom > 0 && pose.bloom < 1, `kwiaty maleją (${pose.bloom.toFixed(2)})`);
for (const face of flowers.slice(0, 20)) {
    const moved = face.vertices.map((v, i) => Array.from(transformTuftVertex(face, v, i, { ...pose, size: 1, bend: 0, squash: 1 }, harvest, new Float64Array(7))));
    for (let axis = 0; axis < 3; axis++) {
        const before = face.vertices.reduce((s, v) => s + v[axis], 0) / 4;
        const after = moved.reduce((s, v) => s + v[axis], 0) / 4;
        near(after, before, 'kwiat maleje wokół własnego środka', 1e-9);
    }
}
world.dirtyChunks.clear();
controller.update(TUFT_HARVEST_SWITCH);
equal(harvest.phase, 1, 'po zniknięciu kwiatów - etap po zbiorze');
equal(harvest.renderId, getBlockId('indygowiec_etap2'), 'rysowany 2. etap');
ok(world.dirtyChunks.has(chunk), 'jedna zwykła przebudowa chunka');
ok(harvest.from.size >= 1, 'etap po zbiorze zaczyna od wysokości krzewu');
rebuild(); controller.update(.1);
ok(harvest.binding && harvest.pose.size >= 1, 'płynne zmniejszenie do 2. etapu');
finish();
samePositions('po zbiorze');

// Zniszczenie w trakcie wzrostu: zaczyna od obecnego rozmiaru, zapis = powietrze.
growth.grow(chunk, index, getGrowth('indygowiec_etap2')); rebuild(); controller.update(.3);
const size = event().pose.size;
world.setBlock(...at, null);
equal(event()?.kind, 'break', 'zniszczenie - animacja');
equal(event().renderId, getBlockId('indygowiec_etap3'), 'zanika widoczny krzew');
near(event().from.size, Math.min(1, size), 'zanik od obecnego rozmiaru', 1e-9);
equal(world.getBlockId(...at), 0, 'w świecie od razu powietrze');
rebuild(); controller.update(.2);
ok(event().pose.size < size, 'zanika');
finish();

// Marzanna: posadzenie, zbiór z kwiatkami (wraca do młodej).
world.setBlock(...at, 'marzanna_etap3'); rebuild(); finish();
const madder = { hit: true, block: { x: at[0], y: at[1], z: at[2], type: 'marzanna_etap3' } };
equal(harvestTarget.call(game, madder), true, 'zbiór marzanny');
equal(world.getBlockId(...at), getBlockId('marzanna_etap1'), 'marzanna wraca do młodej');
rebuild(); controller.update(.12); controller.update(.2); rebuild(); finish();
samePositions('po zbiorze marzanny');

// Dywan: bez animacji.
world.setBlock(...at, 'barwinek_etap3');
equal(event(), undefined, 'barwinek - bez animacji');
rebuild();

controller.dispose(); world.dispose();
console.log(`OK: duże rośliny i animacje roślin z paczek — ${checks} sprawdzeń (indygowiec, marzanna, ucinanie przy ścianach, posadzenie, wzrost, zbiór, pełny ekwipunek, zniszczenie).`);
