import {
    CHUNK_SIZE,
    CHUNK_HEIGHT
} from '../config.js';

import {
    AIR_ID,
    isOpaqueId,
    isLiquidId,
    isGrowingId,
    TRUNCATED_PLANT_IDS
} from '../blocks/BlockRegistry.js';
import { isTorchId } from '../blocks/torches.js';

// ------------------------------------------------------------
// Chunk = kolumna CHUNK_SIZE x CHUNK_HEIGHT x CHUNK_SIZE bloków.
//
// Bloki są zapisane w jednej płaskiej tablicy jako liczby (ID).
// Współrzędne lx, y, lz są LOKALNE, czyli liczone od rogu chunka:
//   lx, lz: 0 .. CHUNK_SIZE - 1
//   y:      0 .. CHUNK_HEIGHT - 1
// ------------------------------------------------------------

export class Chunk {

    constructor(cx, cz) {

        // Pozycja chunka w siatce chunków (nie w blokach).

        this.cx = cx;
        this.cz = cz;


        // Numery bloków (Uint16Array - do 65535, BlockRegistry.js).
        // Startuje wypełniona zerami, czyli powietrzem.

        this.blocks = new Uint16Array(
            CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE
        );


        // Światło w każdej komórce chunka, w tym samym układzie
        // co bloki. Liczy je LightEngine (src/world/Light.js).
        //   skyLight              - światło nieba (0-15)
        //   lightR, lightG, lightB - kolorowe światło lamp (0-255)

        // Nurt rzeki w kolumnach (x, z na przemian, bloki/s razy 32;
        // Int8Array 16 x 16 x 2) albo null - bez rzeki (RealisticGenerator).

        this.flow = null;

        // Lazy 512-byte column bounds for water bootstrap. Dry chunks allocate
        // nothing; edits only widen bounds, so removal needs no column rescan.
        this.waterBounds = null;

        // Kolor trawy w rogach kolumn (Uint8Array 17 x 17 x 3, r g b -
        // 128 = bez zmiany) albo null (RealisticGenerator - biomy,
        // ChunkMesher.js).

        this.tint = null;

        // Dokładny biom każdej kolumny. Worker oblicza go wraz z terenem;
        // osiągnięcia nie muszą ponownie przygotowywać rzek w klatce gry.
        this.biomes = null;

        this.skyLight = new Uint8Array(this.blocks.length);
        this.lightR = new Uint8Array(this.blocks.length);
        this.lightG = new Uint8Array(this.blocks.length);
        this.lightB = new Uint8Array(this.blocks.length);

        // Te same tablice pod numerami kanałów z Light.js
        // (SKY = 0, RED = 1, GREEN = 2, BLUE = 3).

        this.lightChannels = [
            this.skyLight,
            this.lightR,
            this.lightG,
            this.lightB
        ];


        // Sąsiednie wczytane chunki (null = niewczytany).
        // Ustawia je World przy wczytywaniu i usuwaniu chunków.
        //   west = cx - 1, east = cx + 1, north = cz - 1, south = cz + 1

        this.west = null;
        this.east = null;
        this.north = null;
        this.south = null;


        // Które części chunka zmieniły światło od ostatniego
        // sprawdzenia (używa tego LightEngine).

        this.lightChanged = 0;


        // Ile bloków innych niż powietrze jest w chunku.

        this.blockCount = 0;


        // Wysokość nad najwyższym blokiem - mesher nie musi
        // przeglądać pustego powietrza nad terenem.

        this.maxY = 0;


        // Wysokość, poniżej której WSZYSTKIE komórki chunka są
        // zasłaniającymi blokami (np. lity kamień pod terenem).
        // Takich bloków nie widać, więc mesher je pomija. Liczy ją
        // updateSolidBelow() po wygenerowaniu; przy zmianie bloku
        // może tylko zmaleć (setId).

        this.solidBelow = 0;


        // Mesh chunka w scenie (null, gdy chunk jest pusty
        // albo jeszcze nie został zbudowany).

        this.mesh = null;
        this.plantMesh = null;
        this.plantShadowMesh = null;
        this.meshRevision = 0;
        this.plantRevision = 0;
        this.terrainReady = false;
        this.plantsReady = false;


        // Czy gracz kiedyś zmienił ten chunk. Taki chunk przy
        // usuwaniu z pamięci zostaje zachowany, zamiast znowu
        // powstawać z generatora.

        this.modified = false;


        // Rosnące rośliny (np. krzaki owocowe przed owocowaniem):
        // indeksy komórek w `blocks`. Wzrost - src/game/PlantGrowth.js.

        this.growing = new Set();

        // Indeks pochodni: renderer odwiedza tylko te komórki, nie całą
        // tablicę terenu. Zmiana klatki płomienia nie dotyka tego indeksu.
        this.torches = new Set();
        this.torchRevision = 0;

    }


    // Wczytuje bloki z zapisu (Uint8Array - stary zapis albo chunk bez
    // numerów ponad 255, Uint16Array - z nimi). Zapis z niższego świata (np. sprzed
    // podniesienia CHUNK_HEIGHT z 64 do 128) jest dopełniany powietrzem
    // od góry - warstwy idą od dołu, więc dane pasują 1:1.
    // Zwraca false, jeśli dane mają zły rozmiar (np. większy świat).

    loadBlocks(data) {

        const layer = CHUNK_SIZE * CHUNK_SIZE;

        if (
            !data ||
            data.length > this.blocks.length ||
            data.length % layer !== 0
        ) {
            return false;
        }


        this.blocks.fill(AIR_ID);

        this.blocks.set(data);


        // Zapis 1-bajtowy z 0.31.0-0.40.0 mógł mieć roślinę z paczki
        // z obciętym numerem (BlockRegistry.js - TRUNCATED_PLANT_IDS).

        if (data instanceof Uint8Array) {
            for (let i = 0; i < data.length; i++) {
                const plant = TRUNCATED_PLANT_IDS[data[i]];
                if (plant) {
                    this.blocks[i] = plant;
                }
            }
        }


        let count = 0;
        this.torches.clear();
        this.waterBounds = null;

        for (let i = 0; i < this.blocks.length; i++) {

            if (this.blocks[i] !== AIR_ID) {
                count++;
            }
            if (isTorchId(this.blocks[i])) this.torches.add(i);
            if (isLiquidId(this.blocks[i])) this.includeWater(i);

        }

        this.blockCount = count;
        this.torchRevision++;


        // Najwyższy niepusty blok.

        this.maxY = 0;

        for (let i = this.blocks.length - 1; i >= 0; i--) {

            if (this.blocks[i] !== AIR_ID) {

                this.maxY = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE)) + 1;

                break;

            }

        }


        this.updateSolidBelow();

        this.scanGrowing();


        return true;

    }


    // Szuka rosnących roślin w całym chunku wczytanym z zapisu.
    // Generator stawia bloki przez setId, a ten sam pilnuje listy.

    scanGrowing() {

        this.growing.clear();

        const layer = CHUNK_SIZE * CHUNK_SIZE;

        const blocks = this.blocks;

        for (let i = this.solidBelow * layer; i < this.maxY * layer; i++) {

            if (isGrowingId(blocks[i])) {
                this.growing.add(i);
            }

        }

    }


    // Liczy solidBelow od nowa: idzie od dołu, aż trafi na warstwę,
    // w której jest coś niezasłaniającego (powietrze, woda...).

    updateSolidBelow() {

        const layer = CHUNK_SIZE * CHUNK_SIZE;

        const blocks = this.blocks;

        let y = 0;

        for (; y < this.maxY; y++) {

            const start = y * layer;

            let full = true;

            for (let i = start; i < start + layer; i++) {

                if (!isOpaqueId(blocks[i])) {
                    full = false;
                    break;
                }

            }

            if (!full) {
                break;
            }

        }

        this.solidBelow = y;

    }


    index(lx, y, lz) {

        return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

    }


    getId(lx, y, lz) {

        return this.blocks[
            this.index(lx, y, lz)
        ];

    }

    includeWater(index) {
        const layer = CHUNK_SIZE * CHUNK_SIZE;
        const bounds = this.waterBounds ??= new Uint8Array(layer * 2);
        const column = index % layer, height = Math.floor(index / layer) + 1;
        if (!bounds[column] || height < bounds[column]) bounds[column] = height;
        if (height > bounds[layer + column]) bounds[layer + column] = height;
    }


    // Zwraca true, jeśli blok faktycznie się zmienił.

    setId(lx, y, lz, id) {

        const i = this.index(lx, y, lz);

        const oldId = this.blocks[i];


        if (oldId === id) {
            return false;
        }


        if (oldId === AIR_ID) {
            this.blockCount++;
        }

        if (id === AIR_ID) {
            this.blockCount--;
        }


        this.blocks[i] = id;
        if (isLiquidId(id)) this.includeWater(i);

        if (isTorchId(oldId) || isTorchId(id)) {
            if (isTorchId(id)) this.torches.add(i);
            else this.torches.delete(i);
            this.torchRevision++;
        }


        if (isGrowingId(id)) {
            this.growing.add(i);
        }
        else {
            this.growing.delete(i);
        }


        if (id !== AIR_ID && y >= this.maxY) {
            this.maxY = y + 1;
        }

        if (y < this.solidBelow && !isOpaqueId(id)) {
            this.solidBelow = y;
        }

        return true;

    }

}
