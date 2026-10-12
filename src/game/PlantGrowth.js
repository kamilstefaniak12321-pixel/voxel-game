import { CHUNK_SIZE } from '../config.js';

import {
    getBlockTypeById,
    getGrowth
} from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// WZROST ROŚLIN
//
// Krzaki owocowe rosną etapami (pole "grows" w BlockRegistry.js):
// sadzonka -> krzak -> kilka owoców -> pełen owoców.
//
// Co sekundę gry każda rosnąca roślina we wczytanych chunkach ma
// szansę 1 / seconds, że przejdzie do następnego etapu - czyli
// średnio po `seconds` sekundach, ale każda w swoim czasie (krzaki
// posadzone razem nie owocują w tej samej chwili).
//
// Rosną rośliny w chunkach zmienionych przez gracza (posadzone krzaki
// i te, z których zbierał owoce). Dzikie krzaki w nietkniętym terenie
// zostają w etapie, w jakim wygenerował je świat - inaczej każdy
// chunk z rosnącym krzakiem trzeba by zapisywać, a meteoryty
// omijałyby całą okolicę (spadają tylko w nietknięte chunki).
//
// Każdy chunk trzyma listę swoich rosnących roślin (Chunk.growing),
// więc nie trzeba co sekundę przeglądać wszystkich bloków.
// ------------------------------------------------------------

// Co ile sekund rośliny "losują" wzrost.
const TICK = 1;

// Najwięcej kroków naraz (po długiej przerwie, np. karta w tle).
const MAX_STEPS = 5;


export class PlantGrowth {

    constructor(world) {

        this.world = world;

        this.timer = 0;

        // Mnożnik szybkości wzrostu (/krzaki tempo) - nie zapisuje się.
        this.speed = 1;

        // Ile razy coś urosło (od wejścia do świata).
        this.grown = 0;

    }


    update(dt) {

        this.timer = Math.min(this.timer + dt * this.speed, TICK * MAX_STEPS);

        while (this.timer >= TICK) {

            this.timer -= TICK;

            this.tick();

        }

    }


    // Jeden krok: każda rosnąca roślina losuje, czy urośnie.

    tick() {

        for (const chunk of [...this.world.chunks.values()]) {

            if (chunk.growing.size === 0 || !chunk.modified) {
                continue;
            }

            for (const index of [...chunk.growing]) {

                const growth = getGrowth(getBlockTypeById(chunk.blocks[index]));

                if (!growth) {

                    chunk.growing.delete(index);

                    continue;

                }

                if (Math.random() < TICK / growth.seconds) {
                    this.grow(chunk, index, growth.into);
                }

            }

        }

    }


    // Roślina w komórce `index` chunka przechodzi do etapu `into`.

    grow(chunk, index, into) {

        const { x, y, z } = cellPosition(chunk, index);

        if (this.world.setBlock(x, y, z, into)) {

            this.grown++;

            return true;

        }

        return false;

    }


    // Wszystkie rosnące rośliny w promieniu `radius` bloków od (x, z)
    // rosną o `stages` etapów (/krzaki rosnij) - także dzikie. Zwraca,
    // ile urosło.

    growAround(x, z, radius, stages = 1) {

        let count = 0;

        for (let step = 0; step < stages; step++) {

            for (const chunk of [...this.world.chunks.values()]) {

                for (const index of [...chunk.growing]) {

                    const cell = cellPosition(chunk, index);

                    if (Math.hypot(cell.x + 0.5 - x, cell.z + 0.5 - z) > radius) {
                        continue;
                    }

                    const growth = getGrowth(getBlockTypeById(chunk.blocks[index]));

                    if (growth && this.grow(chunk, index, growth.into)) {
                        count++;
                    }

                }

            }

        }

        return count;

    }


    // Ile rosnących roślin jest we wczytanych chunkach (active - tylko
    // te, które teraz rosną: w chunkach zmienionych przez gracza).

    countGrowing(active = false) {

        let count = 0;

        for (const chunk of this.world.chunks.values()) {

            if (!active || chunk.modified) {
                count += chunk.growing.size;
            }

        }

        return count;

    }

}


// Pozycja w świecie komórki `index` chunka.

function cellPosition(chunk, index) {

    const layer = CHUNK_SIZE * CHUNK_SIZE;

    return {
        x: chunk.cx * CHUNK_SIZE + (index % CHUNK_SIZE),
        y: Math.floor(index / layer),
        z: chunk.cz * CHUNK_SIZE + Math.floor((index % layer) / CHUNK_SIZE)
    };

}
