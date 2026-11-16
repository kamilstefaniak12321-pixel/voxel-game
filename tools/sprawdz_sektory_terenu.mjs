// ------------------------------------------------------------
// SPRAWDZENIE SEKTORÓW TERENU (1.10.3) - rendering/TerrainSectors.js
//
// - obraz bez zmian: sektory niczego nie dokładają, a odrzucają tylko
//   obiekty, których geometria leży poza kadrem - dla wielu ustawień kamery,
// - macierze położenia liczone raz i niezmieniane przez przeliczanie sceny,
// - puste sektory znikają, usuwanie nie przeszukuje całej sceny,
// - mniej pracy co klatkę: odwiedzin obiektów i czasu (pomiar),
// - gra woła cull() przed rysowaniem świata; świat i sklejone regiony
//   wstawiają meshe przez sektory,
// - wynik testu wydajności pokazuje rysowania według przebiegu i sektory.
//
// Uruchomienie: node tools/sprawdz_sektory_terenu.mjs
// ------------------------------------------------------------
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        return next(url, url.endsWith('.js') && /\/(src|assets|lib)\//.test(url) ? { ...context, format: 'module' } : context);
    }
});

const THREE = await import('three');
const { TerrainSectors, TERRAIN_SECTOR } = await import('../src/rendering/TerrainSectors.js');
const { REGION_SIZE } = await import('../src/rendering/RegionBatches.js');
const { CHUNK_SIZE, CHUNK_HEIGHT } = await import('../src/config.js');
const { benchmarkText } = await import('../src/diagnostics/Benchmark.js');
const { PERF_STAGES } = await import('../src/diagnostics/PerfDiagnostics.js');

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

check(TERRAIN_SECTOR % REGION_SIZE === 0, 'Sklejony region zawsze mieści się w jednym sektorze');

// Geometria jak chunk: kula ograniczająca w środku kolumny.
const chunkGeometry = new THREE.BufferGeometry();
chunkGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK_SIZE / 2, 70, CHUNK_SIZE / 2), 75);
const regionGeometry = new THREE.BufferGeometry();
regionGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(CHUNK_SIZE, 70, CHUNK_SIZE), 82);

// Scena jak w grze przy zasięgu `radius` chunków. sectors = false: po staremu.
function build(radius, sectors) {
    const scene = new THREE.Scene();
    const terrain = sectors ? new TerrainSectors(scene) : null;
    const meshes = [];
    const put = (mesh, cx, cz) => {
        mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
        mesh.userData.id = meshes.length;
        if (terrain) terrain.add(mesh, cx, cz);
        else scene.add(mesh);
        meshes.push(mesh);
    };
    for (let cx = -radius; cx <= radius; cx++) for (let cz = -radius; cz <= radius; cz++) {
        if (cx * cx + cz * cz > radius * radius) continue;
        const mesh = new THREE.Mesh(chunkGeometry);
        mesh.visible = false;                                   // w sklejonym regionie
        put(mesh, cx, cz);
        const plants = new THREE.Mesh(chunkGeometry);
        plants.visible = cx * cx + cz * cz <= 144;              // rośliny tylko blisko
        put(plants, cx, cz);
        if (cx % REGION_SIZE === 0 && cz % REGION_SIZE === 0) {
            const region = new THREE.Mesh(regionGeometry);
            if (!terrain) { region.matrixAutoUpdate = false; }
            put(region, cx, cz);
            if (!terrain) region.updateMatrix();
        }
    }
    return { scene, terrain, meshes };
}

// To samo, co robi WebGLRenderer.projectObject: lista obiektów do narysowania
// i liczba odwiedzin.
const frustum = new THREE.Frustum(), matrix = new THREE.Matrix4();
function project(scene, camera) {
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    const drawn = [];
    let visits = 0;
    const walk = (object) => {
        visits++;
        if (object.visible === false) return;
        if (object.isMesh && object.layers.test(camera.layers) && (!object.frustumCulled || frustum.intersectsObject(object))) drawn.push(object.userData.id);
        for (const child of object.children) walk(child);
    };
    walk(scene);
    return { drawn: drawn.sort((a, b) => a - b), visits };
}

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1600);
const look = (x, y, z, yaw, pitch) => { camera.position.set(x, y, z); camera.rotation.set(pitch, yaw, 0, 'YXZ'); camera.updateMatrixWorld(); };


// --- Obraz bez zmian ---------------------------------------------------------------

{
    const before = build(20, false), after = build(20, true);
    before.scene.updateMatrixWorld();
    let random = 12345;
    const next = () => (random = (random * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    let total = 0, dropped = 0;
    for (let i = 0; i < 300; i++) {
        look((next() - 0.5) * 500, 20 + next() * 400, (next() - 0.5) * 500, next() * Math.PI * 2, (next() - 0.6) * 2.4);
        camera.fov = 40 + next() * 70;
        camera.updateProjectionMatrix();
        const expected = project(before.scene, camera).drawn;
        after.scene.updateMatrixWorld();
        after.terrain.cull(camera);
        const got = new Set(project(after.scene, camera).drawn);
        // Sektor nie dokłada niczego, a odrzuca tylko to, czego geometria
        // (kolumna chunka albo regionu) naprawdę leży poza kadrem - silnik
        // sprawdza obszerniejszą kulę, więc sam część takich obiektów by wysłał.
        assert.ok([...got].every((id) => expected.includes(id)), `Kamera ${i}: sektory niczego nie dokładają`);
        for (const id of expected) {
            if (got.has(id)) continue;
            const mesh = before.meshes[id], side = mesh.geometry === regionGeometry ? CHUNK_SIZE * REGION_SIZE : CHUNK_SIZE;
            const box = new THREE.Box3(new THREE.Vector3(mesh.position.x, 0, mesh.position.z), new THREE.Vector3(mesh.position.x + side, CHUNK_HEIGHT, mesh.position.z + side));
            assert.ok(!frustum.intersectsBox(box), `Kamera ${i}: odrzucony obiekt ${id} leży poza kadrem`);
            dropped++;
        }
        checks++;
        total += expected.length;
    }
    check(total > 20000 && dropped > 0, `Porównano ${total} obiektów w kadrze; ${dropped} wysyłanych dawniej leżało poza kadrem`);
    // Kamera patrząca w niebo: nic z terenu.
    look(0, 300, 0, 0, Math.PI / 2 - 0.01);
    camera.fov = 60; camera.updateProjectionMatrix();
    equal(after.terrain.cull(camera), 0, 'Patrząc w niebo z wysoka, żaden sektor nie jest w kadrze');
    equal(project(after.scene, camera).drawn, [], 'I nic z terenu nie jest wysyłane');
    // Bez cull() wszystko jest widoczne.
    after.terrain.showAll();
    look(0, 80, 0, 1, -0.2);
    equal(project(after.scene, camera).drawn, project(before.scene, camera).drawn, 'Bez cull(): jak dawniej');
}


// --- Macierze -------------------------------------------------------------------------

{
    const { scene, terrain, meshes } = build(6, true);
    const sample = meshes[40];
    const expected = new THREE.Matrix4().makeTranslation(sample.position.x, 0, sample.position.z);
    check(sample.matrixWorld.equals(expected) && sample.matrixAutoUpdate === false, 'Macierz świata policzona przy wstawieniu');
    // Przeliczanie sceny (co klatkę robi je silnik, także z wymuszeniem) nie dotyka terenu.
    let updates = 0;
    const original = THREE.Object3D.prototype.updateMatrixWorld;
    THREE.Object3D.prototype.updateMatrixWorld = function (force) { updates++; return original.call(this, force); };
    scene.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    THREE.Object3D.prototype.updateMatrixWorld = original;
    check(updates <= 4, `Przeliczanie sceny nie wchodzi w teren (${updates} wywołań przy ${meshes.length} obiektach)`);
    check(sample.matrixWorld.equals(expected), 'Macierz terenu bez zmian');
    // Inne obiekty sceny (gracz, cząsteczki) przeliczają się jak zawsze.
    const other = new THREE.Mesh(chunkGeometry);
    scene.add(other);
    other.position.set(5, 6, 7);
    scene.updateMatrixWorld();
    equal([other.matrixWorld.elements[12], other.matrixWorld.elements[13], other.matrixWorld.elements[14]], [5, 6, 7], 'Zwykły obiekt sceny nadal się przelicza');
    equal(terrain.root.parent, scene, 'Korzeń terenu jest w scenie świata');
}


// --- Sektory: tworzenie i usuwanie ---------------------------------------------------------

{
    const scene = new THREE.Scene(), terrain = new TerrainSectors(scene);
    const a = new THREE.Mesh(chunkGeometry), b = new THREE.Mesh(chunkGeometry), c = new THREE.Mesh(chunkGeometry), d = new THREE.Mesh(chunkGeometry);
    terrain.add(a, 0, 0);
    terrain.add(b, TERRAIN_SECTOR - 1, TERRAIN_SECTOR - 1);
    terrain.add(c, TERRAIN_SECTOR, 0);
    terrain.add(d, -1, -1);
    equal(terrain.stats(), { sectors: 3, visible: 3, objects: 4 }, 'Trzy sektory: (0,0), (1,0) i (-1,-1)');
    equal(a.parent, b.parent, 'Chunki tego samego sektora razem');
    check(a.parent !== c.parent && a.parent !== d.parent, 'Sąsiednie sektory osobno (także po ujemnej stronie)');
    const box = d.parent.userData.box;
    check(box.min.x < -TERRAIN_SECTOR * CHUNK_SIZE && box.max.x > 0 && box.min.y < 0 && box.max.y > CHUNK_HEIGHT, 'Zasięg sektora z zapasem');
    terrain.remove(c);
    equal([terrain.stats().sectors, c.parent], [2, null], 'Pusty sektor znika');
    terrain.remove(a);
    equal(terrain.stats(), { sectors: 2, visible: 2, objects: 2 }, 'Sektor z drugim obiektem zostaje');
    terrain.remove(a);
    terrain.remove(null);
    equal(terrain.stats().objects, 2, 'Powtórne usunięcie niczego nie psuje');
    terrain.dispose();
    equal([scene.children.length, terrain.stats().sectors], [0, 0], 'Po zamknięciu świata scena jest czysta');
}


// --- Mniej pracy co klatkę -----------------------------------------------------------------------

{
    const radius = 50;                                          // zasięg 800 bloków
    const before = build(radius, false), after = build(radius, true);
    const frame = (world) => {
        world.scene.updateMatrixWorld();
        world.terrain?.cull(camera);
        const first = project(world.scene, camera);
        // Przebieg cienia postaci rysuje tę samą scenę jeszcze raz.
        return first.visits + project(world.scene, camera).visits;
    };
    const run = (world, frames) => {
        let visits = 0;
        const start = performance.now();
        for (let i = 0; i < frames; i++) { look(0, 80, 0, i * 0.0105, -0.1); visits += frame(world); }
        return { ms: (performance.now() - start) / frames, visits: visits / frames };
    };
    run(before, 80); run(after, 80);                            // rozgrzewka
    const old = run(before, 300), now = run(after, 300);
    check(before.meshes.length > 17000, `Zasięg 800: ${before.meshes.length} obiektów terenu`);
    check(now.visits < old.visits * 0.45, `Odwiedzin obiektów na klatkę: ${Math.round(old.visits)} -> ${Math.round(now.visits)}`);
    check(now.ms < old.ms * 0.6, `Czas przeglądania sceny na klatkę: ${old.ms.toFixed(2)} ms -> ${now.ms.toFixed(2)} ms`);
    console.log(`Pomiar (zasięg 800, ${before.meshes.length} obiektów, ${after.terrain.stats().sectors} sektorów): ` +
        `${old.ms.toFixed(2)} ms -> ${now.ms.toFixed(2)} ms na klatkę, odwiedzin ${Math.round(old.visits)} -> ${Math.round(now.visits)}`);
}


// --- Gra ----------------------------------------------------------------------------------------------

{
    const world = source('src/world/World.js'), game = source('src/game/Game.js'), regions = source('src/rendering/RegionBatches.js');
    check(!/this\.scene\.(add|remove)\((mesh|chunk\.mesh|chunk\.plantMesh)\)/.test(world), 'Świat nie wstawia meshy chunków prosto do sceny');
    check((world.match(/this\.sectors\.add\(mesh, chunk\.cx, chunk\.cz\)/g) ?? []).length === 2 && world.includes('this.sectors.remove(chunk.mesh)') && world.includes('this.sectors.remove(chunk.plantMesh)'), 'Mesh chunka i roślin przez sektory');
    check(world.includes('this.sectors.dispose()') && world.includes('new RegionBatches(this.scene, [blockMaterial, plantMaterial, waterMaterial, leafMaterial], this.sectors)'), 'Zamknięcie świata i sklejone regiony');
    check(regions.includes('this.sectors.add(mesh, region.rx * REGION_SIZE, region.rz * REGION_SIZE)') && regions.includes('this.sectors.remove(region.mesh)'), 'Region trafia do sektora swoich chunków');
    const cull = game.indexOf('this.world?.sectors?.cull(camera)'), render = game.indexOf('renderer.render(this.scene, camera)');
    check(cull > 0 && cull < render && render - cull < 200, 'Gra chowa sektory tuż przed rysowaniem świata tą samą kamerą');
    check(source('src/menu/MenuWorld.js').includes('this.world.sectors?.cull(camera)'), 'Żywe tło menu też');
    check(game.includes("profile?.beginStage('farDraw')") && PERF_STAGES.some(([id, label]) => id === 'farDraw' && label.includes('Wysyłanie dalekiego terenu')) && new Set(PERF_STAGES.map(([id]) => id)).size === PERF_STAGES.length, 'Daleki teren mierzony osobno od nieba');
}

{
    const text = benchmarkText({ mode: 'spin', seconds: 10, fps: 60, low1: 40, worstMs: 30, updateMs: 2, renderMs: 9, calls: 515, triangles: 1235000,
        queue: 0, distance: 0, viewDistance: 800, farTerrain: 7168, potato: false, stages: null,
        draws: { shadows: 60, far: 180, world: 275 }, terrain: { sectors: 534, visible: 141, objects: 17651 } });
    check(text.includes('Rysowania: świat 275, daleki teren 180, cienie 60 | teren: 17651 obiektów w 534 sektorach, w kadrze średnio 141 sektorów'), 'Wynik testu: rysowania według przebiegu i sektory');
    check(!benchmarkText({ mode: 'spin', seconds: 10, fps: 60, low1: 40, worstMs: 30, updateMs: 2, renderMs: 9, calls: 1, triangles: 1, queue: 0, distance: 0, viewDistance: 96, farTerrain: 0, potato: false, stages: null }).includes('Rysowania:'), 'Stary wynik bez tych liczb też się opisuje');
}

console.log(`OK: sektory terenu - ${checks} sprawdzeń (ten sam obraz dla 300 kamer, macierze liczone raz, mniej odwiedzin i czasu na klatkę, gra i test wydajności).`);
