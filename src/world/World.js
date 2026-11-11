import * as THREE from 'three';
import { shapeInfo } from '../blocks/woodShapes.js';
import { shapeBoxes, connectMask } from './ShapeBoxes.js';

import { normalizeWorldExperiments, grassDetailAtDistance } from './WorldExperiments.js';
import { ChunkGeneration } from './ChunkGeneration.js';
import { WaterSimulation } from './WaterSimulation.js';
import { MeshWorkQueue } from './MeshWorkQueue.js';
import { detailAtDistance, DISTANCE_PLANT_PREFETCH, DISTANCE_PLANT_RETAIN } from './DistanceLod.js';
import { BIOME_KEYS } from './terrain/Biomes.js';
import { disposeTreeShowcase } from './trees/TreeShowcase.js';
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
    isOpaqueId,
    isLeavesId,
    getLightEmission,
    getWaterLevel,
    getWaterBaseHeight,
    canPlantStay,
    isWaterloggedPlantId,
    getLiquidKindId,
    isPlantId,
    isTreeId,
    getAttach,
    getAttachedPlant,
    ATTACH_OFFSETS
} from '../blocks/BlockRegistry.js';
// ------------------------------------------------------------
import {
    blockMaterial,
    plantMaterial,
    waterMaterial,
    leafMaterial
} from '../rendering/BlockRenderData.js';
// ------------------------------------------------------------
import {
    buildChunkGeometry,
    createChunkGeometryJob
} from '../rendering/ChunkMesher.js';
// ------------------------------------------------------------
import {
    SHADOW_CASTER_MATERIALS
} from '../rendering/Shadows.js';
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

// Pełny blok - jedno pudełko kolizji (collisionBoxes).
const FULL_COLLISION = Object.freeze([Object.freeze([0, 0, 0, 1, 1, 1])]);
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
const CURRENT_SIDES = [[-1,0],[1,0],[0,-1],[0,1]];
const currentCanEnter = id => id >= AIR_ID && !isSolidId(id);
function inRiverChannel(chunk, x, y, z) {
    if (!chunk?.flowBounds) return false;
    const column = (z - chunk.cz * CHUNK_SIZE) * CHUNK_SIZE + x - chunk.cx * CHUNK_SIZE;
    return chunk.flowBounds[column] > 0 && y >= chunk.flowBounds[column] - 1 &&
        y < chunk.flowBounds[CHUNK_SIZE * CHUNK_SIZE + column];
}
function currentCellHeight(fluids, id, x, y, z) {
    const base = getWaterBaseHeight(id);
    if (base === 1) return 1;
    const above = fluids.read(x, y + 1, z);
    return getWaterLevel(above) >= 0 || isOpaqueId(above) ? 1 : base;
}
// Build ahead of the existing visible ring; retain a wider ring to avoid churn
// when walking back across a boundary. These do not change drawing distance.
export const PLANT_PREFETCH_DISTANCE = PLANT_VIEW_DISTANCE + 48;
export const PLANT_RETAIN_DISTANCE = PLANT_VIEW_DISTANCE + 64;

export class World {

    // seed        - seed tego świata (liczba albo tekst).
    //               Ten sam seed zawsze daje ten sam teren.
    // savedChunks - chunki wczytane z zapisu:
    //               Map "cx,cz" -> Uint16Array albo Uint8Array (stary
    //               zapis / chunk bez numerów ponad 255; pusta dla nowego
    //               świata)
    // terrain     - typ terenu ('realistic', 'classic' - patrz
    //               terrain/generators.js)

    constructor(scene, seed, savedChunks = new Map(), terrain = 'classic', experiments) {

        this.scene = scene;

        this.seed = seed;
        this.experiments = normalizeWorldExperiments(experiments);

        // Klucz "cx,cz" -> Chunk.

        this.chunks = new Map();

        // Chunki, których mesh trzeba przebudować.

        this.dirtyChunks = new MeshWorkQueue(chunk => this.meshPriority(chunk));
        this.dirtyPlants = new MeshWorkQueue(chunk => this.distanceToCenter(chunk));
        this.missingTerrain = new MeshWorkQueue(chunk => this.distanceToCenter(chunk));
        this.meshJobs = { terrain: null, plants: null };
        this.meshTurn = 'terrain';

        // Chunki zmienione przez gracza, wczytane z zapisu.

        this.savedChunks = savedChunks;

        // Chunki zmienione od ostatniego zapisu świata.

        this.unsavedChunks = new Set();
        this.fluidDirty = new Map();
        this.fluids = new WaterSimulation(this);


        // Rośnie przy każdej zmianie bloku - po tym np. dynamiczne
        // światło poznaje, że musi od nowa sprawdzić, gdzie są ściany.

        this.version = 0;

        // Wywoływane, gdy chunk zmieniony przez gracza znika z pamięci
        // (np. daleki teren pokaże wtedy jego nowy kształt).

        this.onModifiedChunkUnloaded = null;

        // Wywoływane po każdej zmianie mesha chunka (nowy, przebudowany,
        // usunięty) - np. cienie słońca przerysowują wtedy swoją mapę.

        this.onMeshChanged = null;

        // Druga, osobna scena z tymi samymi meshami chunków (ta sama
        // geometria, inne materiały) - z niej rysuje się mapa cieni
        // słońca i głębia dla promieni światła (src/rendering/Shadows.js).
        // Położenie chunków się nie zmienia, więc macierze liczymy raz.

        this.shadowScene = new THREE.Scene();

        this.shadowScene.matrixWorldAutoUpdate = false;

        // Generator terenu dla tego świata (typ zapisany w świecie).

        this.terrain = terrain;

        this.generator = createGenerator(terrain, seed);
        this.generation = new ChunkGeneration(terrain, seed);


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

        // Gra wieloosobowa (0.92.0, src/net/): onBlockSet(x, y, z, id,
        // previousId, fluidUpdate) po każdej zmianie bloku; chunkGate(cx,
        // cz) - false, gdy chunk zmieniony u gospodarza jeszcze nie przyszedł
        // (gość czeka z jego wczytaniem); onChunkReady(chunk) - po wczytaniu.

        this.onBlockSet = null;
        this.chunkGate = null;
        this.onChunkReady = null;

    }

    chunkAllowed(cx, cz) {
        return !this.chunkGate || this.chunkGate(cx, cz);
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

    biomeAt(x, z) {
        x = Math.floor(x);
        z = Math.floor(z);
        const cx = this.toChunkCoord(x), cz = this.toChunkCoord(z);
        const chunk = this.getChunk(cx, cz);
        if (!chunk?.biomes) return null;
        return BIOME_KEYS[chunk.biomes[(z - cz * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE]] ?? null;
    }


    createChunk(cx, cz) {

        const chunk = new Chunk(cx, cz);
        chunk.leafDetail = this.getLeafDetail(chunk);
        chunk.plantDetail = this.getPlantDetail(chunk);

        this.chunks.set(
            this.chunkKey(cx, cz),
            chunk
        );
        this.missingTerrain?.add(chunk);


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
            chunk.meshRevision = (chunk.meshRevision ?? 0) + 1;
            this.dirtyChunks.add(chunk);
            this.markPlantsDirty(chunk);
        }

    }

    markPlantsDirty(chunk) {
        if (!chunk) return;
        chunk.plantRevision = (chunk.plantRevision ?? 0) + 1;
        chunk.plantsReady = false;
        if (this.wantsPlants(chunk)) this.dirtyPlants.add(chunk);
    }

    wantsPlants(chunk) {
        const radius = this.distanceLod ? DISTANCE_PLANT_PREFETCH : PLANT_PREFETCH_DISTANCE;
        return this.distanceToCenter(chunk) <= (radius / CHUNK_SIZE) ** 2;
    }

    setDistanceLod(enabled) {
        if (!!this.distanceLod === !!enabled) return;
        this.distanceLod = !!enabled;
        for (const chunk of this.chunks.values()) this.updateDistanceDetail(chunk);
    }

    getLeafDetail(chunk) {
        return this.distanceLod ? detailAtDistance(Math.sqrt(this.distanceToCenter(chunk)) * CHUNK_SIZE,
            chunk.leafDetail, [64, 112]) : 0;
    }

    getPlantDetail(chunk) {
        return this.distanceLod ? detailAtDistance(Math.sqrt(this.distanceToCenter(chunk)) * CHUNK_SIZE,
            chunk.plantDetail, [48, 80], 12) : 0;
    }

    updateDistanceDetail(chunk) {
        const leaf = this.getLeafDetail(chunk), plant = this.getPlantDetail(chunk);
        if (leaf !== (chunk.leafDetail ?? 0)) {
            chunk.meshRevision = (chunk.meshRevision ?? 0) + 1;
            this.dirtyChunks.add(chunk);
        }
        if (plant !== (chunk.plantDetail ?? 0)) this.markPlantsDirty(chunk);
        chunk.leafDetail = leaf;
        chunk.plantDetail = plant;
    }

    meshPriority(chunk) {
        const distance = this.distanceToCenter(chunk);
        // Edits at the player's feet, then missing terrain, then cosmetic work.
        return distance + (distance <= 4 ? 0 : !chunk.mesh ? 1e6 : 2e6);
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
    // NURT RZEK
    // --------------------------------------------------------

    // Nurt rzeki w kolumnie (x, z): [x, z] w blokach na sekundę albo
    // null (bez nurtu - nie rzeka, chunk niewczytany). Kolumna, nie
    // blok - nurt działa tylko na tego, kto jest w wodzie.

    getFlow(x, z) {

        const chunk = this.getChunk(this.toChunkCoord(x), this.toChunkCoord(z));

        if (!chunk || !chunk.flow) {
            return null;
        }

        const lx = x - chunk.cx * CHUNK_SIZE;
        const lz = z - chunk.cz * CHUNK_SIZE;

        const n = (lz * CHUNK_SIZE + lx) * 2;

        const fx = chunk.flow[n];
        const fz = chunk.flow[n + 1];

        return fx === 0 && fz === 0 ? null : [fx / 32, fz / 32];

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


    // Pudełka kolizji bloku [x0, y0, z0, x1, y1, z1] (0-1 w komórce, płot
    // do 1,5) albo null - bez kolizji. Pełny blok - jedno pudełko.

    collisionBoxes(x, y, z) {

        const id = this.getBlockId(x, y, z);

        if (!isSolidId(id)) return null;

        const info = shapeInfo(id);

        if (!info) return FULL_COLLISION;

        const boxes = shapeBoxes(id, 'collision',
            info.kind === 'fence' ? connectMask((a, b, c) => this.getBlockId(a, b, c), x, y, z) : 0);

        return boxes?.length ? boxes : null;

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


    // Jak getSurfaceY, ale drzewa (pnie, liście) się nie liczą - wysokość
    // ziemi pod nimi (start gracza, meteoryty).

    getGroundY(x, z) {

        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {

            const id = this.getBlockId(x, y, z);

            if (isSolidId(id) && !isTreeId(id)) {
                return y + 1;
            }

        }

        return 0;

    }


    // Stawia blok (type = nazwa) albo zbiera go (type = null).
    // Zbieranie rośliny zachowuje wodę; clearBlock opróżnia całą komórkę.
    // Zwraca true, jeśli świat faktycznie się zmienił.

    setBlock(x, y, z, type, preserveWater = true, fluidUpdate = false) {

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

        const chunk = fluidUpdate ? this.getChunk(cx, cz) : this.generateChunk(cx, cz);

        if (!chunk) {
            return false;
        }


        const lx = x - cx * CHUNK_SIZE;
        const lz = z - cz * CHUNK_SIZE;


        // Zbieramy roślinę, nie wodę, w której rosła. Postawienie
        // konkretnego bloku nadal zastępuje całą komórkę normalnie.
        const previousId = chunk.getId(lx, y, lz);
        if (preserveWater && id === AIR_ID && isWaterloggedPlantId(previousId)) {
            id = getLiquidKindId(previousId);
        }

        if (!chunk.setId(lx, y, lz, id)) {
            return false;
        }


        // Chunk zmieniony przez gracza trafi do zapisu.

        chunk.modified = true;
        chunk.savedSnapshotRevision = undefined;

        this.unsavedChunks.add(chunk);

        this.version++;

        this.onBlockSet?.(x, y, z, id, previousId, fluidUpdate);


        // Światło wokół zmienionego bloku liczy się od nowa.

        // Air and unlit transparent water/plants have identical propagation.
        // Removing and flooding four light channels for each flowing level
        // would dominate the bounded water queue. Other edits keep relighting.
        const sameLight = fluidUpdate && !isOpaqueId(previousId) && !isOpaqueId(id) &&
            !isLeavesId(previousId) && !isLeavesId(id) &&
            getLightEmission(previousId) === 0 && getLightEmission(id) === 0;
        if (!sameLight) this.light.blockChanged(chunk, chunk.index(lx, y, lz));


        // Blok na krawędzi chunka zmienia też ściany (i cienie)
        // w sąsiednim chunku, więc sąsiada też trzeba przebudować.

        if (fluidUpdate) {
            this.fluidDirty.set(chunk, (this.fluidDirty.get(chunk) ?? 0) | edgesAt(lx, lz));
            if (isPlantId(previousId) || isPlantId(id)) this.markPlantsDirty(chunk);
        } else this.markDirtyAround(chunk, edgesAt(lx, lz));
        if (!sameLight) this.applyLightChanges();
        this.fluids?.blockChanged(x, y, z, previousId);

        if (fluidUpdate && getWaterLevel(previousId) >= 0 && getWaterLevel(id) >= 0) return true;


        this.plantAnimations?.blockChanged(chunk, chunk.index(lx, y, lz), previousId, id);

        // Zmienione podłoże lub przykryta tafla mogą usunąć roślinę.
        // Wodna odmiana oddaje wówczas swoją komórkę zwykłej wodzie.
        for (const py of [y - 1, y + 1]) {
            if (py < 0 || py >= CHUNK_HEIGHT) continue;
            const plantId = this.getBlockId(x, py, z);
            if (isPlantId(plantId) && !canPlantStay(
                plantId,
                this.getBlockId(x, py - 1, z),
                this.getBlockId(x, py + 1, z)
            )) {
                this.setBlock(x, py, z, null);
            }
        }


        // Płaskie dekoracje oparte o ten blok (opadłe liście na nim,
        // wieniec na jego ścianie) bez oparcia też znikają. Porost i huba
        // obok - gdy nie mają już żadnej ściany.

        if (!isSolidId(id) && (!fluidUpdate || isSolidId(previousId))) {
            this.removeUnsupported(x, y, z);
            for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]]) {
                const ny = y + dy;
                if (ny < 0 || ny >= CHUNK_HEIGHT) continue;
                if (getAttachedPlant(this.getBlockId(x + dx, ny, z + dz)) && !this.attachedPlantSupported(x + dx, ny, z + dz)) {
                    this.setBlock(x + dx, ny, z + dz, null);
                }
            }
        }


        return true;

    }


    setFluidBlock(x, y, z, id) {
        if (id !== AIR_ID && getWaterLevel(id) < 0) return false;
        return this.setBlock(x, y, z, id === AIR_ID ? null : getBlockTypeById(id), false, true);
    }

    // One terrain invalidation per affected chunk and frame. Water levels do
    // not rebuild every plant model; actual washed-away plants do so above.
    flushFluidChanges() {
        if (!this.fluidDirty.size) return;
        const dirty = new Set();
        for (const [chunk, edges] of this.fluidDirty) {
            dirty.add(chunk);
            const west = edges & EDGE_WEST, east = edges & EDGE_EAST;
            const north = edges & EDGE_NORTH, south = edges & EDGE_SOUTH;
            if (west) dirty.add(chunk.west);
            if (east) dirty.add(chunk.east);
            if (north) dirty.add(chunk.north);
            if (south) dirty.add(chunk.south);
            if (west && north) dirty.add(this.getChunk(chunk.cx - 1, chunk.cz - 1));
            if (west && south) dirty.add(this.getChunk(chunk.cx - 1, chunk.cz + 1));
            if (east && north) dirty.add(this.getChunk(chunk.cx + 1, chunk.cz - 1));
            if (east && south) dirty.add(this.getChunk(chunk.cx + 1, chunk.cz + 1));
        }
        this.fluidDirty.clear();
        for (const chunk of dirty) if (chunk) {
            chunk.meshRevision = (chunk.meshRevision ?? 0) + 1;
            this.dirtyChunks.add(chunk);
        }
    }

    getWaterFlow(x, y, z) {
        x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
        const id = this.getBlockId(x, y, z), level = getWaterLevel(id);
        if (level < 0) return null;
        const chunk = this.getChunk(this.toChunkCoord(x), this.toChunkCoord(z));
        const west = this.fluids.read(x - 1, y, z), east = this.fluids.read(x + 1, y, z);
        const north = this.fluids.read(x, y, z - 1), south = this.fluids.read(x, y, z + 1);
        let river = inRiverChannel(chunk, x, y, z) ? this.getFlow(x, z) : null;
        if (!river && level > 0 && chunk?.flowBounds) {
            // The first spill/falling column can sit above the lower river's
            // natural surface. Preserve speed while it directly touches the
            // upstream channel; detached pools cannot satisfy this condition.
            const candidate = this.getFlow(x, z);
            if (candidate) for (let side = 0; side < 4; side++) {
                const neighbor = side === 0 ? west : side === 1 ? east : side === 2 ? north : south;
                if (getWaterLevel(neighbor) < 0) continue;
                const nx = x + CURRENT_SIDES[side][0], nz = z + CURRENT_SIDES[side][1];
                if (inRiverChannel(this.getChunk(this.toChunkCoord(nx), this.toChunkCoord(nz)), nx, y, nz)) {
                    river = candidate; break;
                }
            }
        }
        if (river) {
            // River direction and speed remain authoritative inside its natural
            // channel. Local level noise must not reverse a swimmer at a drop.
            // A real dam/bank still removes the component facing its solid wall.
            const rx = currentCanEnter(river[0] < 0 ? west : east) ? river[0] : 0;
            const rz = currentCanEnter(river[1] < 0 ? north : south) ? river[1] : 0;
            if (rx || rz) return [rx, rz];
        }
        // Covered source water is full height, just like an adjacent falling
        // cell. Comparing their raw .875/1 shapes creates a fictitious uphill.
        const center = currentCellHeight(this.fluids, id, x, y, z);
        let vx = 0, vz = 0;
        for (let side = 0; side < 4; side++) {
            const [dx, dz] = CURRENT_SIDES[side];
            const neighbor = side === 0 ? west : side === 1 ? east : side === 2 ? north : south;
            let difference = 0;
            if (getWaterLevel(neighbor) >= 0) difference = center - currentCellHeight(this.fluids, neighbor, x + dx, y, z + dz);
            else if (neighbor === AIR_ID && getWaterLevel(this.fluids.read(x + dx, y - 1, z + dz)) >= 0) difference = center;
            vx += dx * difference; vz += dz * difference;
        }
        if (river) {
            // A completely blocked river may escape sideways down a real local
            // slope, but never acquires an opposing current from that slope.
            const opposing = Math.min(0, (vx * river[0] + vz * river[1]) / (river[0] ** 2 + river[1] ** 2));
            vx -= opposing * river[0]; vz -= opposing * river[1];
        }
        if (!currentCanEnter(vx < 0 ? west : east)) vx = 0;
        if (!currentCanEnter(vz < 0 ? north : south)) vz = 0;
        const length = Math.hypot(vx, vz);
        if (length > .001) {
            const speed = river ? Math.hypot(river[0], river[1]) : 1;
            return [vx / length * speed, vz / length * speed];
        }
        return level === 8 ? [0, 0] : null;
    }


    // Jawne usunięcie całej komórki (komendy budowania i czyszczenia),
    // łącznie z wodą rośliny. Sąsiednie rośliny nadal tracą tylko oparcie.
    clearBlock(x, y, z) {

        return this.setBlock(x, y, z, null, false);

    }


    // Porost (każda ściana, także dół i góra) albo huba (bok) w (x, y, z)
    // ma lity blok obok, o który się opiera.

    attachedPlantSupported(x, y, z, kind = getAttachedPlant(this.getBlockId(x, y, z))) {

        const sides = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];

        if (kind === 'coating') {
            sides.push([0, -1, 0], [0, 1, 0]);
        }

        return sides.some(([dx, dy, dz]) => isSolidId(this.getBlockId(x + dx, y + dy, z + dz)));

    }


    // Usuwa dekoracje (model 'flat'), które przylegały do bloku (x, y, z).

    removeUnsupported(x, y, z) {

        for (let attach = 1; attach < ATTACH_OFFSETS.length; attach++) {

            const [dx, dy, dz] = ATTACH_OFFSETS[attach];

            // Dekoracja leży po przeciwnej stronie niż jej oparcie.

            const nx = x - dx;
            const ny = y - dy;
            const nz = z - dz;

            if (ny >= 0 && ny < CHUNK_HEIGHT && getAttach(this.getBlockId(nx, ny, nz)) === attach) {
                this.setBlock(nx, ny, nz, null);
            }

        }

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
    // Kosztowne modele roślin przygotowujemy porcjami. Stara geometria
    // zostaje widoczna aż gotowa jest cała nowa siatka.

    updateMeshes(deadline = Infinity) {
        // Separate cursors let nearby plants/animations advance even while a
        // large terrain mesh is being built. Each slice restores mesher scratch.
        while (performance.now() < deadline) {
            let kind = this.meshTurn;
            this.meshTurn = kind === 'terrain' ? 'plants' : 'terrain';
            if (!this.meshJobs[kind] && !(kind === 'terrain' ? this.dirtyChunks : this.dirtyPlants).size) {
                kind = this.meshTurn;
                if (!this.meshJobs[kind] && !(kind === 'terrain' ? this.dirtyChunks : this.dirtyPlants).size) break;
            }
            const queue = kind === 'terrain' ? this.dirtyChunks : this.dirtyPlants;
            const revisionKey = kind === 'terrain' ? 'meshRevision' : 'plantRevision';
            let pending = this.meshJobs[kind];
            const first = queue.peek();
            const urgent = first && pending && first !== pending.chunk &&
                this.distanceToCenter(first) <= 16 && this.distanceToCenter(pending.chunk) > 16;
            if (pending && (this.getChunk(pending.chunk.cx, pending.chunk.cz) !== pending.chunk ||
                pending.revision !== (pending.chunk[revisionKey] ?? 0) ||
                !this.hasAllNeighbors(pending.chunk) || urgent ||
                (kind === 'plants' && !this.wantsPlants(pending.chunk)))) {
                pending.job.cancel();
                this.meshJobs[kind] = pending = null;
            }
            if (!pending) {
                const chunk = queue.peek();
                if (!chunk) continue;
                if (this.getChunk(chunk.cx, chunk.cz) !== chunk || !this.hasAllNeighbors(chunk) ||
                    (kind === 'plants' && (!this.wantsPlants(chunk) || (!chunk.mesh && !chunk.terrainReady)))) {
                    queue.delete(chunk); continue;
                }
                // A missing neighbour will enqueue this again on arrival.
                pending = this.meshJobs[kind] = {
                    chunk, revision: chunk[revisionKey] ?? 0,
                    job: createChunkGeometryJob(chunk, this, { terrain: kind === 'terrain', plants: kind === 'plants',
                        leafDetail: this.getLeafDetail(chunk), plantDetail: this.getPlantDetail(chunk) })
                };
            }
            // A dense mesh cannot use the entire frame repeatedly. Alternating
            // short slices also prevents terrain loading from starving plants.
            const slice = Number.isFinite(deadline) ? Math.min(deadline, performance.now() + 1) : Infinity;
            const result = pending.job.step(slice);
            if (result.done) {
                this.meshJobs[kind] = null;
                if (this.getChunk(pending.chunk.cx, pending.chunk.cz) === pending.chunk &&
                    pending.revision === (pending.chunk[revisionKey] ?? 0) && this.hasAllNeighbors(pending.chunk)) {
                    queue.delete(pending.chunk);
                    this.installChunkGeometry(pending.chunk, result.geometry, kind);
                } else {
                    result.geometry?.dispose();
                }
            }
            // A test clock or genuinely expired slice may yield without work.
            if (Number.isFinite(deadline) && performance.now() >= deadline) break;
        }
    }

    cancelMeshJobs(chunk = null) {
        for (const kind of ['terrain', 'plants']) {
            const pending = this.meshJobs?.[kind];
            if (pending && (!chunk || pending.chunk === chunk)) {
                pending.job.cancel(); this.meshJobs[kind] = null;
            }
        }
    }


    // Do jakiej odległości od gracza (w blokach) wszystkie chunki są
    // już wczytane i mogą mieć meshe. Gdy kolejka jest pusta - cały
    // promień wczytywania. Daleki teren zaczyna się najdalej tu, żeby
    // w czasie wczytywania nie było dziury między nim a chunkami.

    completeRadius() {
        const unmeshed = this.missingTerrain?.peek();
        if (this.loadQueue.length === 0 && !unmeshed) {
            return Infinity;
        }
        // Data can arrive faster than incremental geometry. Keep the horizon
        // over chunks that have data but still lack their first terrain mesh.
        const dataDistance = this.loadQueue.length ? this.loadQueue[this.loadQueue.length - 1][2] : Infinity;
        const meshDistance = unmeshed ? this.distanceToCenter(unmeshed) : Infinity;
        const nearest = Math.sqrt(Math.min(dataDistance, meshDistance));

        // Mesh powstaje dopiero z kompletem sąsiadów - stąd zapas.

        return Math.max(0, (nearest - 2) * CHUNK_SIZE);

    }


    // Oznacza do przebudowy meshe wszystkich chunków (np. po zmianie
    // ustawienia cieni w kątach). Przebudowują się stopniowo,
    // najbliższe najpierw.

    remeshAll() {

        for (const chunk of this.chunks.values()) {
            this.markDirty(chunk);
        }

    }

    remeshPlants() {
        for (const chunk of this.chunks.values()) this.markPlantsDirty(chunk);
    }

    setExperiments(value) {
        const next = normalizeWorldExperiments(value);
        if (next.bushyGrass === this.experiments.bushyGrass) return;
        this.experiments = next;
        // This changes rendering only. Block IDs and saved chunks stay intact.
        this.remeshPlants();
    }

    getGrassDetail(chunk) {
        return grassDetailAtDistance(Math.sqrt(this.distanceToCenter(chunk)) * CHUNK_SIZE,
            (chunk.plantMesh ?? chunk.mesh)?.geometry.userData.bushyGrassDetail);
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
        // Synchronous combined helper retained for model tools. Runtime uses
        // separately budgeted terrain and plant jobs below.
        chunk.combinedGeometry = true;
        chunk.terrainReady = true;
        this.missingTerrain.delete(chunk);


        // Stara geometria nie jest już potrzebna -
        // zwalniamy jej pamięć na karcie graficznej.

        if (chunk.mesh) {
            chunk.mesh.geometry.dispose();
        }


        // Chunk bez widocznych ścian nie potrzebuje mesha.

        if (!geometry) {

            if (chunk.mesh) {

                this.removeChunkMesh(chunk);

                this.onMeshChanged?.(chunk);

            }

            return;

        }


        if (chunk.mesh) {

            chunk.mesh.geometry = geometry;

            chunk.shadowMesh.geometry = geometry;

            this.updatePlantVisibility(chunk);

            this.onMeshChanged?.(chunk);

            return;

        }


        // Materiały grup geometrii (ChunkMesher.js): 0 - zwykłe bloki,
        // 1 - rośliny, 2 - woda, 3 - liście i płaskie dekoracje.

        const mesh =
            new THREE.Mesh(
                geometry,
                [blockMaterial, plantMaterial, waterMaterial, leafMaterial]
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

        // Licznik zmian zestawu chunków z meshem (FarTerrain - maska).

        this.meshVersion = (this.meshVersion ?? 0) + 1;


        // Kopia do mapy cieni (World.shadowScene).

        const shadowMesh = new THREE.Mesh(geometry, SHADOW_CASTER_MATERIALS);

        shadowMesh.position.copy(mesh.position);

        shadowMesh.frustumCulled = false;

        shadowMesh.userData.chunk = chunk;

        this.shadowScene.add(shadowMesh);

        shadowMesh.updateMatrixWorld();

        chunk.shadowMesh = shadowMesh;


        this.updatePlantVisibility(chunk);

        this.onMeshChanged?.(chunk);

    }


    installChunkGeometry(chunk, geometry, kind) {
        const plants = kind === 'plants';
        const meshKey = plants ? 'plantMesh' : 'mesh';
        const shadowKey = plants ? 'plantShadowMesh' : 'shadowMesh';
        const old = chunk[meshKey];
        if (!plants) {
            chunk.combinedGeometry = false; chunk.terrainReady = true;
            this.missingTerrain.delete(chunk);
        }
        if (plants) chunk.plantsReady = true; // Also remember an empty plant layer.
        if (!geometry) {
            if (old) {
                if (plants) this.removePlantMesh(chunk);
                else { old.geometry.dispose(); this.removeChunkMesh(chunk); }
                this.onMeshChanged?.(chunk);
            }
            if (!plants) this.updatePlantVisibility(chunk);
            return;
        }
        if (old) {
            old.geometry.dispose();
            old.geometry = geometry;
            chunk[shadowKey].geometry = geometry;
        } else {
            const mesh = new THREE.Mesh(geometry, [blockMaterial, plantMaterial, waterMaterial, leafMaterial]);
            mesh.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
            this.scene.add(mesh);
            chunk[meshKey] = mesh;
            const shadow = new THREE.Mesh(geometry, SHADOW_CASTER_MATERIALS);
            shadow.position.copy(mesh.position);
            shadow.frustumCulled = false;
            shadow.userData.chunk = chunk;
            this.shadowScene.add(shadow);
            shadow.updateMatrixWorld();
            chunk[shadowKey] = shadow;
            if (!plants) this.meshVersion = (this.meshVersion ?? 0) + 1;
        }
        if (plants) {
            geometry.userData.plantGroups = geometry.groups;
            const ranges = geometry.userData.plantAnimationRanges;
            if (ranges) {
                this.plantAnimations?.bindGeometry(geometry, ranges);
                delete geometry.userData.plantAnimationRanges;
            }
        }
        this.updatePlantVisibility(chunk);
        this.onMeshChanged?.(chunk);
    }

    removePlantMesh(chunk) {
        if (chunk.plantMesh) {
            this.scene.remove(chunk.plantMesh);
            chunk.plantMesh.geometry.dispose();
            chunk.plantMesh = null;
        }
        if (chunk.plantShadowMesh) {
            this.shadowScene.remove(chunk.plantShadowMesh);
            chunk.plantShadowMesh = null;
        }
    }


    // Usuwa mesh chunka (i jego kopię do cieni) ze sceny.

    removeChunkMesh(chunk) {

        this.scene.remove(chunk.mesh);

        chunk.mesh = null;

        this.meshVersion = (this.meshVersion ?? 0) + 1;

        if (chunk.shadowMesh) {

            this.shadowScene.remove(chunk.shadowMesh);

            chunk.shadowMesh = null;

        }

    }


    // Separate plant buffers are prefetched, hidden outside the original
    // drawing radius, and released only outside the wider retention ring.

    updatePlantVisibility(chunk) {
        // Let the shader hand retained plants to ready far geometry. Hiding
        // whole chunks at 192 would bypass its readiness gate during streaming.
        const radius = (this.distanceLod ? DISTANCE_PLANT_RETAIN : PLANT_VIEW_DISTANCE) / CHUNK_SIZE;
        const distance = this.distanceToCenter(chunk);
        const visible = distance <= radius * radius;
        const geometry = (chunk.plantMesh ?? chunk.mesh)?.geometry;
        if (chunk.plantMesh) {
            chunk.plantMesh.visible = visible;
            chunk.plantShadowMesh.visible = visible;
            // Shadow passes select their own casters and override .visible.
            // Removing groups also skips prefetched vegetation in those passes
            // without issuing the former empty gl.drawElements(..., 0, ...).
            geometry.groups = visible ? geometry.userData.plantGroups : [];
            geometry.setDrawRange(0, visible ? geometry.index.count : 0);
        } else if (chunk.combinedGeometry || geometry?.groups[1]?.materialIndex === 1) {
            // Combined synchronous model-preview helper, not streaming meshes.
            const group = geometry?.groups.find(group => group.materialIndex === 1);
            if (group) {
                geometry.userData.plantCount ??= group.count;
                group.count = visible ? geometry.userData.plantCount : 0;
            }
        }
        const retain = this.distanceLod ? DISTANCE_PLANT_RETAIN : PLANT_RETAIN_DISTANCE;
        if (distance > (retain / CHUNK_SIZE) ** 2) {
            const hadPlants = !!chunk.plantMesh;
            this.removePlantMesh(chunk);
            chunk.plantsReady = false;
            this.dirtyPlants.delete(chunk);
            if (hadPlants) this.onMeshChanged?.(chunk);
            return;
        }
        if (this.wantsPlants(chunk) && !chunk.plantsReady && !chunk.combinedGeometry) {
            this.dirtyPlants.add(chunk);
        }
        if (!geometry) return;
        if (this.experiments.bushyGrass && geometry.userData.bushyGrassCount > 0 &&
            Math.max(this.getPlantDetail(chunk), this.getGrassDetail(chunk)) !== geometry.userData.bushyGrassDetail) {
            if (chunk.combinedGeometry || !chunk.plantMesh) this.markDirty(chunk);
            else this.markPlantsDirty(chunk);
        }

    }

    // Usuwa meshe wszystkich chunków ze sceny i zwalnia ich
    // pamięć na karcie graficznej (przy wyjściu ze świata).

    dispose() {

        disposeTreeShowcase(this);

        this.fluids?.dispose();
        this.fluidDirty?.clear();
        this.generation?.dispose();
        this.cancelMeshJobs();

        for (const chunk of this.chunks.values()) {
            this.removePlantMesh(chunk);

            if (chunk.mesh) {

                chunk.mesh.geometry.dispose();

                this.removeChunkMesh(chunk);

            }

        }


        this.chunks.clear();
        this.dirtyChunks.clear();
        this.dirtyPlants.clear();
        this.missingTerrain.clear();
        this.unsavedChunks.clear();
        this.savedChunks.dispose?.();

        this.loadQueue = [];

    }

    // --------------------------------------------------------
    // GENEROWANIE
    // --------------------------------------------------------

    // Testy mogą wstrzyknąć ten sam protokół przez worker_threads.
    // Zwykła gra uruchamia jeden modułowy Worker dopiero przy streamingu.
    enableChunkStreaming(options) {
        this.generation?.dispose();
        this.generation = new ChunkGeneration(this.terrain, this.seed, options);
    }

    applyGeneratedChunk(data) {
        const existing = this.getChunk(data.cx, data.cz);
        if (existing) return existing; // Nie zastępuj bloku postawionego w międzyczasie.
        if (!this.chunkInsideBorder(data.cx, data.cz)) return null;
        const started = performance.now();
        const chunk = this.createChunk(data.cx, data.cz);
        chunk.blocks = data.blocks;
        chunk.flow = data.flow;
        chunk.flowBounds = data.flowBounds;
        chunk.tint = data.tint;
        chunk.biomes = data.biomes;
        chunk.waterBounds = data.waterBounds;
        chunk.blockCount = data.blockCount;
        chunk.maxY = data.maxY;
        chunk.solidBelow = data.solidBelow;
        chunk.growing = new Set(data.growing);
        chunk.torches = new Set(data.torches ?? []);
        chunk.torchRevision++;
        chunk.modified = data.modified;
        chunk.savedSnapshotRevision = data.savedSnapshotRevision;
        if (data.invalidSaved) {
            console.warn(`Zapisany chunk ${data.cx}, ${data.cz} ma zły rozmiar - generuję go od nowa.`);
        }
        this.light.initChunk(chunk);
        this.markDirtyAround(chunk, ALL_EDGES);
        this.applyLightChanges();
        this.fluids?.chunkLoaded(chunk);
        this.generation.applied(performance.now() - started);
        this.onChunkReady?.(chunk);
        return chunk;
    }

    // Kolizje nie mogą traktować oczekującego terenu jak powietrza.
    // Przy bardzo szybkim ruchu czekamy na wątek, zamiast wykonywać
    // zimne przygotowanie rzek synchronicznie w Game.update.
    ensurePlayerColumn(x, z) {
        const cx = this.toChunkCoord(Math.floor(x));
        const cz = this.toChunkCoord(Math.floor(z));
        // Ruch gracza sam obsługuje granicę świata; brak terenu poza nią
        // nie jest zadaniem, na które można czekać w nieskończoność.
        if (!this.chunkInsideBorder(cx, cz)) return true;
        const existing = this.getChunk(cx, cz);
        if (existing) return existing;
        if (!this.chunkAllowed(cx, cz)) return null;
        if (!this.generation?.checkHealth()) return this.generateChunk(cx, cz);
        const data = this.takeGeneratedChunk(cx, cz);
        if (data) return this.applyGeneratedChunk(data);
        this.requestGeneratedChunk(cx, cz);
        return this.generation.enabled ? null : this.generateChunk(cx, cz);
    }

    takeGeneratedChunk(cx, cz) {
        const key = this.chunkKey(cx, cz);
        // Checking a completed job must not decode the save again. Map-backed
        // worlds retain the original reference check for tools and old ports.
        if (this.savedChunks.revision) {
            const revision = this.savedChunks.revision(key);
            const data = this.generation.take(cx, cz, undefined, revision);
            if (data) data.savedSnapshotRevision = revision;
            return data;
        }
        return this.generation.take(cx, cz, this.savedChunks.get(key));
    }

    requestGeneratedChunk(cx, cz) {
        if (this.generation.find?.(cx, cz)) return true;
        if (!this.chunkAllowed(cx, cz)) return false;
        const key = this.chunkKey(cx, cz);
        const saved = this.savedChunks.get(key);
        const accepted = this.generation.request(cx, cz, saved,
            this.savedChunks.revision ? this.savedChunks.revision(key) : saved);
        if (accepted) this.savedChunks.releaseDecoded?.(key);
        return accepted;
    }

    streamChunks(deadline, maxApply = Infinity, forceOne = false) {
        // Przyjęcie wyników jest osobną, budżetowaną pracą. Sama
        // odpowiedź workera nie zmienia świata ani świateł między klatkami.
        while (this.loadQueue.length && this.getChunk(...this.loadQueue[this.loadQueue.length - 1])) {
            this.loadQueue.pop();
        }
        const ready = this.generation.readyChunks().sort((a, b) =>
            this.distanceToCenter(a) - this.distanceToCenter(b));
        let applied = 0;
        for (const { cx, cz } of ready) {
            if (applied >= maxApply || (performance.now() >= deadline && !(forceOne && applied === 0))) break;
            const data = this.takeGeneratedChunk(cx, cz);
            if (!data) continue;
            // Środek kolejki mógł zmienić się podczas pracy wątku.
            // Przyjmujemy także gotowy nadal potrzebny wynik spoza jej
            // początku, aby oba miejsca workera nie utknęły na zawsze.
            const index = this.loadQueue.findIndex(([qx, qz]) => qx === cx && qz === cz);
            if (index < 0) continue;
            this.loadQueue.splice(index, 1);
            this.applyGeneratedChunk(data);
            applied++;
        }
        // Nie usuwamy oczekujących wpisów: completeRadius nie może
        // pokazać pustego pierścienia między chunkami i dalekim terenem.
        // Chunk czekający na dane od gospodarza (gra wieloosobowa) nie
        // blokuje kolejki - prosimy o dwa najbliższe dostępne.
        for (let n = this.loadQueue.length - 1, asked = 0; n >= 0 && asked < 2; n--) {
            const [cx, cz] = this.loadQueue[n];
            if (!this.chunkAllowed(cx, cz)) continue;
            this.requestGeneratedChunk(cx, cz);
            asked++;
        }
    }

    // Tworzy chunk i wypełnia go terenem z generatora.
    // Jeśli chunk już istnieje, zostaje bez zmian.

    // Za granicą świata zwraca null.

    generateChunk(cx, cz) {

        let chunk = this.getChunk(cx, cz);

        if (chunk) {
            return chunk;
        }


        if (!this.chunkInsideBorder(cx, cz) || !this.chunkAllowed(cx, cz)) {
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

        chunk.savedSnapshotRevision = loaded ? this.savedChunks.revision?.(this.chunkKey(cx, cz)) : undefined;
        this.savedChunks.releaseDecoded?.(this.chunkKey(cx, cz));


        if (saved !== undefined && !loaded) {

            console.warn(
                `Zapisany chunk ${cx}, ${cz} ma zły rozmiar - ` +
                `generuję go od nowa.`
            );

        }


        if (loaded) {

            chunk.modified = true;

            // Nurt rzek nie jest zapisany - liczy go generator.

            this.generator.fillFlow?.(chunk);

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


        this.generation?.retain((qx, qz) => qx !== cx || qz !== cz);
        this.fluids?.chunkLoaded(chunk);
        this.onChunkReady?.(chunk);

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

    update(x, z, radius, budgetMs, dt = 0) {

        // Czas liczymy od samego początku - układanie kolejki
        // i usuwanie dalekich chunków też się w nim mieści.

        const deadline = performance.now() + budgetMs;


        this.setCenter(x, z, radius);

        // Water shares the existing streaming deadline instead of adding an
        // unbounded simulation phase. Rendering retains the remaining budget.
        this.perfDiagnostics?.beginStage('water');
        this.fluids?.update(dt, Math.min(.6, Math.max(0, deadline - performance.now()) * .2));
        this.perfDiagnostics?.endStage('water');


        this.perfDiagnostics?.beginStage('generation');
        if (this.generation?.checkHealth()) {
            // Reserve one reception before meshing. Even when thousands of
            // chunks await cosmetic rebuilds, the two worker slots keep moving.
            // Zero budget deliberately requests work without adopting results.
            const receptionDeadline = budgetMs > 0 ? Math.min(deadline, performance.now() + Math.max(.5, budgetMs * .25)) : deadline;
            this.streamChunks(receptionDeadline, budgetMs > 0 ? 1 : 0, budgetMs > 0);
            this.perfDiagnostics?.endStage('generation');
            this.perfDiagnostics?.beginStage('mesh');
            this.updateMeshes(deadline);
            this.perfDiagnostics?.endStage('mesh');
            return;
        }
        // Worker fallback alternates its first task with meshing. A slow
        // synchronous generator must not permanently starve either queue.
        this.fallbackGenerationTurn = !this.fallbackGenerationTurn;
        if (this.fallbackGenerationTurn && budgetMs > 0 && this.loadQueue.length) {
            const [cx, cz] = this.loadQueue.pop();
            this.generateChunk(cx, cz);
        }
        this.perfDiagnostics?.endStage('generation');
        this.perfDiagnostics?.beginStage('mesh');
        this.updateMeshes(deadline);
        this.perfDiagnostics?.endStage('mesh');
        this.perfDiagnostics?.beginStage('generation');
        while (this.loadQueue.length > 0 && performance.now() < deadline) {
            const [cx, cz] = this.loadQueue.pop();
            this.generateChunk(cx, cz);
        }
        this.perfDiagnostics?.endStage('generation');

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
            this.updateDistanceDetail(chunk);
            this.updatePlantVisibility(chunk);
        }
        this.dirtyChunks.reprioritize();
        this.dirtyPlants.reprioritize();
        this.missingTerrain.reprioritize();


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

        const wanted = new Set(queue.map(([qx, qz]) => this.chunkKey(qx, qz)));
        this.generation?.retain((qx, qz) => wanted.has(this.chunkKey(qx, qz)));


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
        this.fluids?.chunkUnloaded(chunk);
        this.fluidDirty?.delete(chunk);
        this.cancelMeshJobs(chunk);
        const hadPlants = !!chunk.plantMesh;
        this.removePlantMesh(chunk);
        this.dirtyPlants?.delete(chunk);
        this.missingTerrain?.delete(chunk);
        if (hadPlants && !chunk.mesh) this.onMeshChanged?.(chunk);


        // Chunk zmieniony przez gracza zachowujemy w pamięci, żeby
        // po powrocie wczytać go takim, jakim był. Do bazy trafi
        // przy najbliższym zapisie (zostaje na liście niezapisanych).

        if (chunk.modified) {

            // Merely visiting an old build must not recompress it when the
            // player leaves. Actual edits clear the marker in setBlock().
            if (!chunk.savedSnapshotRevision ||
                chunk.savedSnapshotRevision !== this.savedChunks.revision?.(key)) {
                this.savedChunks.set(key, chunk.blocks);
            }
            this.savedChunks.releaseDecoded?.(key);

            this.onModifiedChunkUnloaded?.(chunk);

        }


        if (chunk.mesh) {

            chunk.mesh.geometry.dispose();

            this.removeChunkMesh(chunk);

            this.onMeshChanged?.(chunk);

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
