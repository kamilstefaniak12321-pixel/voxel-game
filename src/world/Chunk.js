import {
    CHUNK_SIZE,
    CHUNK_HEIGHT
} from '../config.js';

import {
    AIR_ID
} from '../blocks/BlockRegistry.js';

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


        // Uint8Array startuje wypełniona zerami, czyli powietrzem.

        this.blocks = new Uint8Array(
            CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE
        );


        // Światło w każdej komórce chunka, w tym samym układzie
        // co bloki. Liczy je LightEngine (src/world/Light.js).
        //   skyLight              - światło nieba (0-15)
        //   lightR, lightG, lightB - kolorowe światło lamp (0-255)

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


        // Mesh chunka w scenie (null, gdy chunk jest pusty
        // albo jeszcze nie został zbudowany).

        this.mesh = null;


        // Czy gracz kiedyś zmienił ten chunk. Taki chunk przy
        // usuwaniu z pamięci zostaje zachowany, zamiast znowu
        // powstawać z generatora.

        this.modified = false;

    }


    // Wczytuje bloki z zapisu. Zwraca false, jeśli dane mają
    // zły rozmiar (np. po zmianie CHUNK_HEIGHT w config.js).

    loadBlocks(data) {

        if (
            !data ||
            data.length !== this.blocks.length
        ) {
            return false;
        }


        this.blocks.set(data);


        let count = 0;

        for (let i = 0; i < this.blocks.length; i++) {

            if (this.blocks[i] !== AIR_ID) {
                count++;
            }

        }

        this.blockCount = count;


        // Najwyższy niepusty blok.

        this.maxY = 0;

        for (let i = this.blocks.length - 1; i >= 0; i--) {

            if (this.blocks[i] !== AIR_ID) {

                this.maxY = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE)) + 1;

                break;

            }

        }


        return true;

    }


    index(lx, y, lz) {

        return (y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

    }


    getId(lx, y, lz) {

        return this.blocks[
            this.index(lx, y, lz)
        ];

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


        if (id !== AIR_ID && y >= this.maxY) {
            this.maxY = y + 1;
        }

        return true;

    }

}
