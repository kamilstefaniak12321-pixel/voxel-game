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


        // Ile bloków innych niż powietrze jest w chunku.

        this.blockCount = 0;


        // Mesh chunka w scenie (null, gdy chunk jest pusty
        // albo jeszcze nie został zbudowany).

        this.mesh = null;

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

        return true;

    }

}
