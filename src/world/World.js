import * as THREE from 'three';
// ------------------------------------------------------------
import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    WORLD_CHUNKS_X,
    WORLD_CHUNKS_Z
} from '../config.js';
// ------------------------------------------------------------
import {
    AIR_ID,
    blockExists,
    getBlockId,
    getBlockTypeById,
    isSolidId
} from '../blocks/BlockRegistry.js';
// ------------------------------------------------------------
import {
    blockMaterial
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
    TerrainGenerator
} from './TerrainGenerator.js';
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
// oznaczany jako "brudny", a updateMeshes() (wywoływane raz na
// klatkę) przebudowuje wszystkie brudne chunki naraz.
// ------------------------------------------------------------
export class World {

    // seed        - seed tego świata (liczba albo tekst).
    //               Ten sam seed zawsze daje ten sam teren.
    // savedChunks - chunki wczytane z zapisu:
    //               Map "cx,cz" -> Uint8Array (pusta dla nowego świata)

    constructor(scene, seed, savedChunks = new Map()) {

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

        // Generator terenu dla tego świata.

        this.generator =
            new TerrainGenerator(seed);

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

        return chunk;

    }


    markDirty(chunk) {

        if (chunk) {
            this.dirtyChunks.add(chunk);
        }

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


        // Poza limitem wysokości nie da się budować.

        if (y < 0 || y >= CHUNK_HEIGHT) {
            return false;
        }


        const cx = this.toChunkCoord(x);
        const cz = this.toChunkCoord(z);

        let chunk = this.getChunk(cx, cz);


        if (!chunk) {

            // Usuwanie bloku z nieistniejącego chunka: nic do zrobienia.

            if (id === AIR_ID) {
                return false;
            }

            // Stawianie bloku poza dotychczasowym światem:
            // chunk powstaje na żądanie.

            chunk = this.createChunk(cx, cz);

        }


        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;


        if (!chunk.setId(lx, y, lz, id)) {
            return false;
        }


        this.markDirty(chunk);

        // Chunk zmieniony przez gracza trafi do zapisu.

        this.unsavedChunks.add(chunk);


        // Blok na krawędzi chunka zmienia też widoczne ściany
        // w sąsiednim chunku, więc sąsiada też trzeba przebudować.

        if (lx === 0) {
            this.markDirty(this.getChunk(cx - 1, cz));
        }

        if (lx === CHUNK_SIZE - 1) {
            this.markDirty(this.getChunk(cx + 1, cz));
        }

        if (lz === 0) {
            this.markDirty(this.getChunk(cx, cz - 1));
        }

        if (lz === CHUNK_SIZE - 1) {
            this.markDirty(this.getChunk(cx, cz + 1));
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

    // Przebudowuje meshe wszystkich zmienionych chunków.
    // Wywoływane raz na klatkę (i po wygenerowaniu świata).

    updateMeshes() {

        if (this.dirtyChunks.size === 0) {
            return;
        }


        for (const chunk of this.dirtyChunks) {
            this.rebuildChunkMesh(chunk);
        }


        this.dirtyChunks.clear();

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

            return;

        }


        const mesh =
            new THREE.Mesh(
                geometry,
                blockMaterial
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

    }

    // --------------------------------------------------------
    // GENEROWANIE
    // --------------------------------------------------------

    // Tworzy chunk i wypełnia go terenem z generatora.
    // Jeśli chunk już istnieje, zostaje bez zmian.

    generateChunk(cx, cz) {

        let chunk = this.getChunk(cx, cz);

        if (chunk) {
            return chunk;
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


        if (!loaded) {
            this.generator.generateChunk(chunk);
        }


        // Nowy chunk zasłania boczne ściany sąsiadów,
        // więc ich meshe też trzeba przebudować.

        this.markDirty(chunk);

        this.markDirty(this.getChunk(cx - 1, cz));
        this.markDirty(this.getChunk(cx + 1, cz));
        this.markDirty(this.getChunk(cx, cz - 1));
        this.markDirty(this.getChunk(cx, cz + 1));


        return chunk;

    }


    generateStartWorld() {

        for (let cx = 0; cx < WORLD_CHUNKS_X; cx++) {

            for (let cz = 0; cz < WORLD_CHUNKS_Z; cz++) {

                this.generateChunk(cx, cz);

            }

        }


        // Chunki, które gracz zbudował poza startowym obszarem.

        for (const key of this.savedChunks.keys()) {

            const [cx, cz] = key.split(',').map(Number);

            this.generateChunk(cx, cz);

        }


        this.updateMeshes();

    }

}
