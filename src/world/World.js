import * as THREE from 'three';
// ------------------------------------------------------------
import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_BORDER,
    WORLD_SPAWN_X,
    WORLD_SPAWN_Z,
    PLANT_VIEW_DISTANCE
} from '../config.js';
// ------------------------------------------------------------
import {
    AIR_ID,
    blockExists,
    getBlockId,
    getBlockTypeById,
    isSolidId,
    isSoilId,
    isPlantId
} from '../blocks/BlockRegistry.js';
// ------------------------------------------------------------
import {
    blockMaterial,
    plantMaterial,
    waterMaterial
} from '../rendering/BlockRenderData.js';
// ------------------------------------------------------------
import {
    buildChunkGeometry
} from '../rendering/ChunkMesher.js';
// ------------------------------------------------------------
import {
    Chunk
} from './Chunk.js';
// ------------------------------------------------------------
import {
    createGenerator
} from './terrain/generators.js';
// ------------------------------------------------------------
import {
    LightEngine,
    edgesAt,
    ALL_EDGES,
    EDGE_WEST,
    EDGE_EAST,
    EDGE_NORTH,
    EDGE_SOUTH,
    EDGE_SELF
} from './Light.js';
// ------------------------------------------------------------
// Świat = mapa chunków.
//
// Z zewnątrz działa tak samo jak wcześniej:
//   setBlock(x, y, z, 'stone')   - postaw blok
//   setBlock(x, y, z, null)      - usuń blok
//   getBlock(x, y, z)            - nazwa bloku albo null
//   isSolid(x, y, z)             - czy blok ma kolizję
//
// Zmiana bloku nie przebudowuje mesha od razu. Chunk jest tylko
// oznaczany jako "brudny", a update() (wywoływane raz na klatkę)
// przebudowuje brudne chunki.
//
// Mesh chunka powstaje dopiero wtedy, gdy wczytani są wszyscy
// jego sąsiedzi (także po skosie) - bez nich nie dałoby się
// poprawnie policzyć światła i cieni na jego krawędziach.
// Dlatego najdalszy pierścień wczytanych chunków jest niewidoczny.
//
// Świat nie ma stałego rozmiaru: update() wczytuje chunki wokół
// gracza (najbliższe najpierw) i usuwa z pamięci te za daleko.
// Żeby gra nie przycinała, na jedną klatkę przypada tylko
// ograniczony czas pracy - reszta czeka na kolejne klatki.
// ------------------------------------------------------------

// Chunki dalej niż (promień wczytywania + UNLOAD_MARGIN) są
// usuwane z pamięci. Zapas zapobiega ciągłemu wczytywaniu
// i usuwaniu tego samego chunka, gdy gracz chodzi po granicy.

const UNLOAD_MARGIN = 2;

export class World {

    // seed        - seed tego świata (liczba albo tekst).
    //               Ten sam seed zawsze daje ten sam teren.
    // savedChunks - chunki wczytane z zapisu:
    //               Map "cx,cz" -> Uint8Array (pusta dla nowego świata)
    // terrain     - typ terenu ('realistic', 'classic' - patrz
    //               terrain/generators.js)

    constructor(scene, seed, savedChunks = new Map(), terrain = 'classic') {

        this.scene = scene;

        this.seed = seed;

        // Klucz "cx,cz" -> Chunk.

        this.chunks = new Map();

        // Chunki, których mesh trzeba przebudować.

        this.dirtyChunks = new Set();

        // Chunki zmienione przez gracza, wczytane z zapisu.

        this.savedChunks = savedChunks;

        // Chunki zmienione od ostatniego zapisu świata.

        this.unsavedChunks = new Set();


        // Rośnie przy każdej zmianie bloku - po tym np. dynamiczne
        // światło poznaje, że musi od nowa sprawdzić, gdzie są ściany.

        this.version = 0;

        // Wywoływane, gdy chunk zmieniony przez gracza znika z pamięci
        // (np. daleki teren pokaże wtedy jego nowy kształt).

        this.onModifiedChunkUnloaded = null;

        // Generator terenu dla tego świata (typ zapisany w świecie).

        this.terrain = terrain;

        this.generator = createGenerator(terrain, seed);


        // Miejsce startu: w terenie realistycznym najbliższy ląd przy
        // WORLD_SPAWN_X / Z (żeby nie zaczynać na dnie morza).

        const spawn = this.generator.findSpawn(WORLD_SPAWN_X, WORLD_SPAWN_Z);

        this.spawnPoint = { x: spawn.x + 0.5, z: spawn.z + 0.5 };


        // Światło nieba i lamp (src/world/Light.js).

        this.light = new LightEngine(this);


        // Chunk, w którym stoi gracz, i promień wczytywania.

        this.centerCx = 0;
        this.centerCz = 0;
        this.loadRadius = -1;

        // Chunki do wczytania - najdalsze na początku listy,
        // więc pop() zawsze zwraca najbliższy.

        this.loadQueue = [];

    }

    // --------------------------------------------------------
    // CHUNKI
    // --------------------------------------------------------

    chunkKey(cx, cz) {
        return `${cx},${cz}`;
    }


    // Zamiana pozycji bloku na pozycję chunka.
    // Math.floor działa poprawnie także dla ujemnych współrzędnych.

    toChunkCoord(blockCoord) {
        return Math.floor(blockCoord / CHUNK_SIZE);
    }


    getChunk(cx, cz) {

        return this.chunks.get(
            this.chunkKey(cx, cz)
        ) || null;

    }


    createChunk(cx, cz) {

        const chunk = new Chunk(cx, cz);

        this.chunks.set(
            this.chunkKey(cx, cz),
            chunk
        );


        // Łączymy chunk z wczytanymi sąsiadami (w obie strony).

        chunk.west = this.getChunk(cx - 1, cz);
        chunk.east = this.getChunk(cx + 1, cz);
        chunk.north = this.getChunk(cx, cz - 1);
        chunk.south = this.getChunk(cx, cz + 1);

        if (chunk.west) chunk.west.east = chunk;
        if (chunk.east) chunk.east.west = chunk;
        if (chunk.north) chunk.north.south = chunk;
        if (chunk.south) chunk.south.north = chunk;


        return chunk;

    }


    markDirty(chunk) {

        if (chunk) {
            this.dirtyChunks.add(chunk);
        }

    }


    // Oznacza do przebudowy chunk i tych sąsiadów, których
    // krawędzi dotyczyła zmiana (edges - patrz edgesAt w Light.js).
    // Na rogu chunka zmiana dotyczy też sąsiada po skosie.

    markDirtyAround(chunk, edges) {

        const west = edges & EDGE_WEST;
        const east = edges & EDGE_EAST;
        const north = edges & EDGE_NORTH;
        const south = edges & EDGE_SOUTH;


        if (edges & EDGE_SELF) this.markDirty(chunk);

        if (west) this.markDirty(chunk.west);
        if (east) this.markDirty(chunk.east);
        if (north) this.markDirty(chunk.north);
        if (south) this.markDirty(chunk.south);


        const cx = chunk.cx;
        const cz = chunk.cz;

        if (west && north) this.markDirty(this.getChunk(cx - 1, cz - 1));
        if (east && north) this.markDirty(this.getChunk(cx + 1, cz - 1));
        if (west && south) this.markDirty(this.getChunk(cx - 1, cz + 1));
        if (east && south) this.markDirty(this.getChunk(cx + 1, cz + 1));

    }


    // Przebudowa meshy wszędzie tam, gdzie zmieniło się światło.

    applyLightChanges() {

        this.light.takeChangedChunks(
            (chunk, edges) => this.markDirtyAround(chunk, edges)
        );

    }


    // Czy wszyscy sąsiedzi chunka (także po skosie) są wczytani.
    // Sąsiad za granicą świata nigdy nie powstanie - nie czekamy na niego.

    hasAllNeighbors(chunk) {

        for (let dz = -1; dz <= 1; dz++) {

            for (let dx = -1; dx <= 1; dx++) {

                const cx = chunk.cx + dx;
                const cz = chunk.cz + dz;

                if (
                    !this.getChunk(cx, cz) &&
                    this.chunkInsideBorder(cx, cz)
                ) {
                    return false;
                }

            }

        }

        return true;

    }


    // Czy chunk leży (choćby częściowo) wewnątrz granicy świata.

    chunkInsideBorder(cx, cz) {

        const minX = cx * CHUNK_SIZE;
        const minZ = cz * CHUNK_SIZE;

        return (
            minX + CHUNK_SIZE > -WORLD_BORDER &&
            minX < WORLD_BORDER &&
            minZ + CHUNK_SIZE > -WORLD_BORDER &&
            minZ < WORLD_BORDER
        );

    }

    // --------------------------------------------------------
    // BLOKI
    // --------------------------------------------------------

    // Szybki odczyt: zwraca ID bloku (AIR_ID = powietrze).
    // Poza światem i w nieistniejących chunkach jest powietrze.

    getBlockId(x, y, z) {

        if (y < 0 || y >= CHUNK_HEIGHT) {
            return AIR_ID;
        }


        const cx = this.toChunkCoord(x);
        const cz = this.toChunkCoord(z);

        const chunk = this.getChunk(cx, cz);

        if (!chunk) {
            return AIR_ID;
        }


        return chunk.getId(
            x - cx * CHUNK_SIZE,
            y,
            z - cz * CHUNK_SIZE
        );

    }


    // Zwraca nazwę bloku ('stone', 'grass'...) albo null.

    getBlock(x, y, z) {

        return getBlockTypeById(
            this.getBlockId(x, y, z)
        );

    }


    isSolid(x, y, z) {

        return isSolidId(
            this.getBlockId(x, y, z)
        );

    }


    // Światło w miejscu (x, y, z): { sky, block }, oba 0-15.

    getLight(x, y, z) {

        return this.light.getLight(x, y, z);

    }


    // Wysokość powierzchni w kolumnie (x, z): współrzędna Y,
    // na której stoi się na najwyższym bloku z kolizją.
    // Zwraca 0, jeśli w kolumnie nie ma żadnego takiego bloku.

    getSurfaceY(x, z) {

        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {

            if (this.isSolid(x, y, z)) {
                return y + 1;
            }

        }

        return 0;

    }


    // Stawia blok (type = nazwa) albo usuwa go (type = null).
    // Zwraca true, jeśli świat faktycznie się zmienił.

    setBlock(x, y, z, type) {

        let id = AIR_ID;


        // Najpierw sprawdzamy nowy typ,
        // jeżeli nie próbujemy usuwać bloku.

        if (
            type !== null &&
            type !== undefined
        ) {

            if (!blockExists(type)) {

                console.warn(
                    `Nieznany typ bloku: ${type}`
                );

                return false;

            }

            id = getBlockId(type);

        }


        // Poza limitem wysokości i za granicą świata nie da się budować.

        if (y < 0 || y >= CHUNK_HEIGHT) {
            return false;
        }

        if (
            x < -WORLD_BORDER || x >= WORLD_BORDER ||
            z < -WORLD_BORDER || z >= WORLD_BORDER
        ) {
            return false;
        }


        const cx = this.toChunkCoord(x);
        const cz = this.toChunkCoord(z);


        // Chunk jeszcze niewczytany powstaje na żądanie.

        const chunk = this.generateChunk(cx, cz);

        if (!chunk) {
            return false;
        }


        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;


        if (!chunk.setId(lx, y, lz, id)) {
            return false;
        }


        // Chunk zmieniony przez gracza trafi do zapisu.

        chunk.modified = true;

        this.unsavedChunks.add(chunk);

        this.version++;


        // Światło wokół zmienionego bloku liczy się od nowa.

        this.light.blockChanged(
            chunk,
            chunk.index(lx, y, lz)
        );


        // Blok na krawędzi chunka zmienia też ściany (i cienie)
        // w sąsiednim chunku, więc sąsiada też trzeba przebudować.

        this.markDirtyAround(chunk, edgesAt(lx, lz));

        this.applyLightChanges();


        // Roślina nad blokiem, który przestał być ziemią (zniszczony,
        // zamieniony na kamień...), nie ma na czym rosnąć - znika.

        if (!isSoilId(id) && y + 1 < CHUNK_HEIGHT && isPlantId(this.getBlockId(x, y + 1, z))) {
            this.setBlock(x, y + 1, z, null);
        }


        return true;

    }

    // --------------------------------------------------------
    // ZAPIS
    // --------------------------------------------------------

    // Czy coś zmieniło się od ostatniego zapisu.

    hasUnsavedChanges() {

        return this.unsavedChunks.size > 0;

    }


    // Zwraca chunki zmienione od ostatniego zapisu
    // i zaczyna liczyć zmiany od nowa.

    takeUnsavedChunks() {

        const chunks = [...this.unsavedChunks];

        this.unsavedChunks.clear();

        return chunks;

    }


    // Oddaje chunki z powrotem do zapisu (gdy zapis się nie udał).

    markUnsaved(chunks) {

        for (const chunk of chunks) {
            this.unsavedChunks.add(chunk);
        }

    }

    // --------------------------------------------------------
    // MESHE
    // --------------------------------------------------------

    // Przebudowuje meshe zmienionych chunków, najbliższe graczowi
    // najpierw. deadline = performance.now(), po którym przerywamy
    // (przynajmniej jeden chunk zawsze się przebuduje, więc
    // postawiony blok pojawia się od razu).

    updateMeshes(deadline = Infinity) {

        if (this.dirtyChunks.size === 0) {
            return;
        }


        // Chunk bez kompletu sąsiadów jeszcze czeka - wróci na listę,
        // gdy wczyta się któryś z nich (generateChunk oznacza
        // wtedy wszystkich sąsiadów do przebudowy).

        const chunks = [];

        for (const chunk of this.dirtyChunks) {

            if (this.hasAllNeighbors(chunk)) {
                chunks.push(chunk);
            }
            else {
                this.dirtyChunks.delete(chunk);
            }

        }


        chunks.sort(
            (a, b) => this.distanceToCenter(a) - this.distanceToCenter(b)
        );


        for (const chunk of chunks) {

            this.rebuildChunkMesh(chunk);

            this.dirtyChunks.delete(chunk);


            if (performance.now() >= deadline) {
                break;
            }

        }

    }


    // Do jakiej odległości od gracza (w blokach) wszystkie chunki są
    // już wczytane i mogą mieć meshe. Gdy kolejka jest pusta - cały
    // promień wczytywania. Daleki teren zaczyna się najdalej tu, żeby
    // w czasie wczytywania nie było dziury między nim a chunkami.

    completeRadius() {

        if (this.loadQueue.length === 0) {
            return Infinity;
        }

        // Kolejka jest posortowana - na końcu najbliższy brakujący chunk.

        const nearest = Math.sqrt(this.loadQueue[this.loadQueue.length - 1][2]);

        // Mesh powstaje dopiero z kompletem sąsiadów - stąd zapas.

        return Math.max(0, (nearest - 2) * CHUNK_SIZE);

    }


    // Oznacza do przebudowy meshe wszystkich chunków (np. po zmianie
    // ustawienia cieni w kątach). Przebudowują się stopniowo,
    // najbliższe najpierw.

    remeshAll() {

        for (const chunk of this.chunks.values()) {
            this.dirtyChunks.add(chunk);
        }

    }


    // Kwadrat odległości chunka od chunka gracza (w chunkach).

    distanceToCenter(chunk) {

        const dx = chunk.cx - this.centerCx;
        const dz = chunk.cz - this.centerCz;

        return dx * dx + dz * dz;

    }


    rebuildChunkMesh(chunk) {

        const geometry =
            buildChunkGeometry(chunk, this);


        // Stara geometria nie jest już potrzebna -
        // zwalniamy jej pamięć na karcie graficznej.

        if (chunk.mesh) {
            chunk.mesh.geometry.dispose();
        }


        // Chunk bez widocznych ścian nie potrzebuje mesha.

        if (!geometry) {

            if (chunk.mesh) {

                this.scene.remove(chunk.mesh);

                chunk.mesh = null;

            }

            return;

        }


        if (chunk.mesh) {

            chunk.mesh.geometry = geometry;

            this.updatePlantVisibility(chunk);

            return;

        }


        // Grupa 0 - zwykłe bloki, grupa 1 - rośliny, grupa 2 - woda
        // (ChunkMesher.js).

        const mesh =
            new THREE.Mesh(
                geometry,
                [blockMaterial, plantMaterial, waterMaterial]
            );


        // Geometria jest w współrzędnych lokalnych chunka,
        // więc mesh przesuwamy na jego miejsce w świecie.

        mesh.position.set(
            chunk.cx * CHUNK_SIZE,
            0,
            chunk.cz * CHUNK_SIZE
        );


        this.scene.add(mesh);

        chunk.mesh = mesh;

        this.updatePlantVisibility(chunk);

    }


    // Rośliny dalej niż PLANT_VIEW_DISTANCE nie są rysowane: grupa
    // roślin w geometrii dostaje 0 trójkątów (pełna liczba zostaje
    // w userData, więc po podejściu bliżej wracają bez przebudowy).

    updatePlantVisibility(chunk) {

        const geometry = chunk.mesh?.geometry;

        const group = geometry?.groups[1];

        if (!group) {
            return;
        }

        geometry.userData.plantCount ??= group.count;

        const radius = PLANT_VIEW_DISTANCE / CHUNK_SIZE;

        group.count = this.distanceToCenter(chunk) <= radius * radius ? geometry.userData.plantCount : 0;

    }

    // Usuwa meshe wszystkich chunków ze sceny i zwalnia ich
    // pamięć na karcie graficznej (przy wyjściu ze świata).

    dispose() {

        for (const chunk of this.chunks.values()) {

            if (chunk.mesh) {

                this.scene.remove(chunk.mesh);

                chunk.mesh.geometry.dispose();

                chunk.mesh = null;

            }

        }


        this.chunks.clear();
        this.dirtyChunks.clear();
        this.unsavedChunks.clear();

        this.loadQueue = [];

    }

    // --------------------------------------------------------
    // GENEROWANIE
    // --------------------------------------------------------

    // Tworzy chunk i wypełnia go terenem z generatora.
    // Jeśli chunk już istnieje, zostaje bez zmian.

    // Za granicą świata zwraca null.

    generateChunk(cx, cz) {

        let chunk = this.getChunk(cx, cz);

        if (chunk) {
            return chunk;
        }


        if (!this.chunkInsideBorder(cx, cz)) {
            return null;
        }


        chunk = this.createChunk(cx, cz);


        // Chunk zmieniony kiedyś przez gracza wczytujemy z zapisu,
        // każdy inny powstaje z generatora.

        const saved =
            this.savedChunks.get(
                this.chunkKey(cx, cz)
            );

        const loaded =
            saved !== undefined &&
            chunk.loadBlocks(saved);


        if (saved !== undefined && !loaded) {

            console.warn(
                `Zapisany chunk ${cx}, ${cz} ma zły rozmiar - ` +
                `generuję go od nowa.`
            );

        }


        if (loaded) {
            chunk.modified = true;
        }
        else {

            this.generator.generateChunk(chunk);

            chunk.updateSolidBelow();

        }


        // Światło nowego chunka (może też wpłynąć do sąsiadów).

        this.light.initChunk(chunk);


        // Nowy chunk zmienia ściany, światło i cienie sąsiadów,
        // a niektórzy z nich mogą mieć teraz komplet sąsiadów -
        // wszystkich oznaczamy do przebudowy.

        this.markDirtyAround(chunk, ALL_EDGES);

        this.applyLightChanges();


        return chunk;

    }


    // Upewnia się, że chunk z kolumną (x, z) istnieje.

    ensureColumnLoaded(x, z) {

        return this.generateChunk(
            this.toChunkCoord(Math.floor(x)),
            this.toChunkCoord(Math.floor(z))
        );

    }

    // --------------------------------------------------------
    // WCZYTYWANIE CHUNKÓW WOKÓŁ GRACZA
    // --------------------------------------------------------

    // Wywoływane co klatkę z pozycją gracza (w blokach).
    // radius   - promień wczytywania w chunkach
    // budgetMs - ile milisekund może zająć ta klatka

    update(x, z, radius, budgetMs) {

        // Czas liczymy od samego początku - układanie kolejki
        // i usuwanie dalekich chunków też się w nim mieści.

        const deadline = performance.now() + budgetMs;


        this.setCenter(x, z, radius);


        // Najpierw meshe (postawione bloki i świeżo
        // wygenerowane chunki stają się widoczne)...

        this.updateMeshes(deadline);


        // ...potem nowe chunki, najbliższe najpierw - tylko jeśli
        // w tej klatce zostało jeszcze trochę czasu.

        while (
            this.loadQueue.length > 0 &&
            performance.now() < deadline
        ) {

            const [cx, cz] = this.loadQueue.pop();

            this.generateChunk(cx, cz);

        }

    }


    // Wczytuje od razu wszystko w promieniu (przy wejściu do świata,
    // pod ekranem wczytywania) i buduje meshe.

    loadAround(x, z, radius) {

        this.setCenter(x, z, radius);


        while (this.loadQueue.length > 0) {

            const [cx, cz] = this.loadQueue.pop();

            this.generateChunk(cx, cz);

        }


        this.updateMeshes();

    }


    // Ustawia środek wczytywania. Gdy gracz przejdzie do innego
    // chunka (albo zmieni się zasięg), układa nową kolejkę
    // i usuwa z pamięci chunki za daleko.

    setCenter(x, z, radius) {

        const cx = this.toChunkCoord(Math.floor(x));
        const cz = this.toChunkCoord(Math.floor(z));


        if (
            cx === this.centerCx &&
            cz === this.centerCz &&
            radius === this.loadRadius
        ) {
            return;
        }


        this.centerCx = cx;
        this.centerCz = cz;
        this.loadRadius = radius;


        for (const chunk of this.chunks.values()) {
            this.updatePlantVisibility(chunk);
        }


        // Brakujące chunki w kole o promieniu radius.

        const queue = [];

        for (let dz = -radius; dz <= radius; dz++) {

            for (let dx = -radius; dx <= radius; dx++) {

                const distance = dx * dx + dz * dz;

                if (distance > radius * radius) {
                    continue;
                }


                const qx = cx + dx;
                const qz = cz + dz;

                if (
                    !this.getChunk(qx, qz) &&
                    this.chunkInsideBorder(qx, qz)
                ) {
                    queue.push([qx, qz, distance]);
                }

            }

        }


        // Najdalsze na początek - pop() bierze najbliższy.

        queue.sort((a, b) => b[2] - a[2]);

        this.loadQueue = queue;


        // Usuwanie dalekich chunków.

        const maxDistance = radius + UNLOAD_MARGIN;

        for (const chunk of [...this.chunks.values()]) {

            if (this.distanceToCenter(chunk) > maxDistance * maxDistance) {
                this.unloadChunk(chunk);
            }

        }

    }


    // Usuwa chunk z pamięci i ze sceny.

    unloadChunk(chunk) {

        const key = this.chunkKey(chunk.cx, chunk.cz);


        // Chunk zmieniony przez gracza zachowujemy w pamięci, żeby
        // po powrocie wczytać go takim, jakim był. Do bazy trafi
        // przy najbliższym zapisie (zostaje na liście niezapisanych).

        if (chunk.modified) {

            this.savedChunks.set(key, chunk.blocks);

            this.onModifiedChunkUnloaded?.(chunk);

        }


        if (chunk.mesh) {

            this.scene.remove(chunk.mesh);

            chunk.mesh.geometry.dispose();

            chunk.mesh = null;

        }


        this.chunks.delete(key);

        this.dirtyChunks.delete(chunk);


        // Odłączamy chunk od sąsiadów.

        if (chunk.west) chunk.west.east = null;
        if (chunk.east) chunk.east.west = null;
        if (chunk.north) chunk.north.south = null;
        if (chunk.south) chunk.south.north = null;

        chunk.west = chunk.east = chunk.north = chunk.south = null;

    }

}
