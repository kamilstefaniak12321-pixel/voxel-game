import { CHUNK_SIZE } from '../config.js';

import {
    getBlockId,
    getBlockTypeById,
    getGrowth,
    isLiquidId,
    isPassableId,
    isReplaceableId,
    isSolidId
} from '../blocks/BlockRegistry.js';
import { isPumpkinType } from '../blocks/lowPlants.js';

import { plantTree } from '../world/trees/plantTree.js';
import { plantShrub } from '../world/shrubs/Shrubs.js';
import { plantGrowthFactor } from '../blocks/plantSeasons.js';
import { FERTILIZERS } from '../blocks/fertilizers.js';

// ------------------------------------------------------------
// WZROST ROŚLIN
//
// Krzaki owocowe rosną etapami (pole "grows" w BlockRegistry.js):
// sadzonka -> krzak -> kilka owoców -> pełen owoców. Sadzonka drzewa
// (grows.tree) wyrasta od razu w całe drzewo (src/world/trees/
// plantTree.js) - jeśli ma nad sobą miejsce; jeśli nie, czeka dalej.
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

// Najwięcej kroków przy nadrabianiu przespanego czasu (advance) - doba
// gry to 1200 sekund.
const MAX_ADVANCE_STEPS = 2400;


export class PlantGrowth {

    constructor(world) {

        this.world = world;

        this.timer = 0;

        // Mnożnik szybkości wzrostu (/krzaki tempo) - nie zapisuje się.
        this.speed = 1;

        // Ile razy coś urosło (od wejścia do świata).
        this.grown = 0;

        // Wywoływane, gdy z sadzonki wyrosło drzewo: (gatunek, x, y, z).
        this.onTreeGrown = null;

        // Czas gry w dobach do pór roku (Game podaje co klatkę; null -
        // bez pór roku).
        this.days = null;

    }


    update(dt) {

        this.timer = Math.min(this.timer + dt * this.speed, TICK * MAX_STEPS);

        while (this.timer >= TICK) {

            this.timer -= TICK;

            this.tick();

        }

    }


    // Świat nadrabia przespany czas (sen, utrata przytomności -
    // Game.advanceWorld): rośliny rosną tak, jakby minęło tyle sekund.
    // Te same losowania co zwykle, tylko wiele naraz i tylko w chunkach,
    // w których coś rośnie.

    advance(seconds) {

        const steps = Math.min(MAX_ADVANCE_STEPS, Math.floor(seconds * this.speed / TICK));

        for (let step = 0; step < steps; step++) {

            const chunks = [...this.world.chunks.values()].filter((chunk) => chunk.growing.size > 0 && chunk.modified);

            if (chunks.length === 0) {
                return;
            }

            // (W grze ze znajomymi noc przesuwa gospodarz - za wszystkich,
            // więc bez pytania, kto jest najbliżej chunka.)

            this.tick(chunks, true);

        }

    }


    // Jeden krok: każda rosnąca roślina losuje, czy urośnie.

    tick(chunks = [...this.world.chunks.values()], everyChunk = false) {

        for (const chunk of chunks) {

            if (chunk.growing.size === 0 || !chunk.modified) {
                continue;
            }

            // Gra wieloosobowa: chunk rośnie u gracza, który jest najbliżej
            // (src/net/) - każdy wzrost tylko raz.

            if (!everyChunk && this.shouldTick && !this.shouldTick(chunk)) {
                continue;
            }

            for (const index of [...chunk.growing]) {

                const growth = getGrowth(getBlockTypeById(chunk.blocks[index]));

                if (!growth) {

                    chunk.growing.delete(index);

                    continue;

                }

                // Kwiaty z porami roku: w swojej porze rosną szybciej,
                // poza nią odpoczywają (src/blocks/plantSeasons.js).
                const season = this.days === null ? 1 : plantGrowthFactor(chunk.blocks[index], this.days);

                // Pole z nawozem pod rośliną (blocks/fertilizers.js): szybciej.
                const soil = index >= LAYER ? (FIELD_GROWTH.get(chunk.blocks[index - LAYER]) ?? 1) : 1;

                if (season > 0 && Math.random() < TICK / growth.seconds * season * soil) {
                    this.grow(chunk, index, growth);
                }

            }

        }

    }


    // Roślina w komórce `index` chunka rośnie (growth - pole grows):
    // przechodzi do etapu growth.into albo wyrasta z niej drzewo.

    grow(chunk, index, growth) {

        const { x, y, z } = cellPosition(chunk, index);


        if (growth.tree) {

            const seed = (Math.random() * 4294967296) >>> 0;

            const size = 0.2 + Math.random() * 0.8;

            if (!plantTree(this.world, x, y, z, growth.tree, seed, size)) {
                return false;
            }

            this.grown++;

            this.onTreeGrown?.(growth.tree, x, y, z);

            return true;

        }


        // Sadzonka krzewu jagodowego (grows.shrub, 1.17.0) wyrasta w cały
        // krzew swojej odmiany - mały albo dojrzały.

        if (growth.shrub) {

            const seed = (Math.random() * 4294967296) >>> 0;

            const size = 0.25 + Math.random() * 0.6;

            if (!plantShrub(this.world, x, y, z, growth.shrub, growth.variety ?? 0, seed, size)) {
                return false;
            }

            this.grown++;

            this.onShrubGrown?.(growth.shrub, x, y, z);

            return true;

        }


        // Rozgrzebana ziemia (grows.empty) zarasta tylko, gdy nic na
        // niej nie rośnie ani nie stoi.

        if (growth.empty && this.world.getBlockId(x, y + 1, z) !== 0) {
            return false;
        }


        // Roślina wyższa niż blok (paczki roślin - grows.room) rośnie
        // dalej tylko, gdy nad nią jest wolne miejsce; jeśli nie, czeka.

        for (let k = 1; k < (growth.room ?? 1); k++) {

            if (this.world.getBlockId(x, y + k, z) !== 0) {
                return false;
            }

        }


        // Kwitnące pnącze dyni (grows.fruit, 1.19.0) zawiązuje owoc
        // w wolnej komórce obok siebie; bez miejsca - czeka. Obok już
        // rosnącej dyni drugiej nie zawiązuje.

        if (growth.fruit && !this.setFruit(x, y, z, growth.fruit)) {
            return false;
        }


        if (this.world.setBlock(x, y, z, growth.into)) {

            this.grown++;

            return true;

        }

        return false;

    }


    // Stawia owoc `fruit` obok rośliny (x, y, z): w losowej z wolnych
    // komórek na tym samym poziomie, które mają pod sobą stały grunt.
    // Zwraca false, gdy nie ma miejsca albo obok już leży dynia.

    setFruit(x, y, z, fruit) {

        const world = this.world;
        const free = [];

        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {

            const here = world.getBlockId(x + dx, y, z + dz);

            if (isPumpkinType(getBlockTypeById(here))) {
                return false;
            }

            if ((here === 0 || isReplaceableId(here)) && !isLiquidId(here) &&
                isSolidId(world.getBlockId(x + dx, y - 1, z + dz)) && !isPassableId(world.getBlockId(x + dx, y - 1, z + dz))) {
                free.push([dx, dz]);
            }

        }

        if (free.length === 0) {
            return false;
        }

        const [dx, dz] = free[Math.floor(Math.random() * free.length)];

        return Boolean(world.setBlock(x + dx, y, z + dz, fruit));

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

                    // /krzaki rosnij przyspiesza rośliny, nie zarastanie pól.

                    if (getGrowth(getBlockTypeById(chunk.blocks[index]))?.empty) {
                        continue;
                    }

                    const growth = getGrowth(getBlockTypeById(chunk.blocks[index]));

                    if (growth && this.grow(chunk, index, growth)) {
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

// Jedna warstwa chunka (komórka niżej to index - LAYER).
const LAYER = CHUNK_SIZE * CHUNK_SIZE;

// Numer bloku pola -> mnożnik wzrostu rośliny, która na nim stoi.
const FIELD_GROWTH = new Map(Object.values(FERTILIZERS).map((entry) => [getBlockId(entry.field), entry.growth]));

function cellPosition(chunk, index) {

    const layer = CHUNK_SIZE * CHUNK_SIZE;

    return {
        x: chunk.cx * CHUNK_SIZE + (index % CHUNK_SIZE),
        y: Math.floor(index / layer),
        z: chunk.cz * CHUNK_SIZE + Math.floor((index % layer) / CHUNK_SIZE)
    };

}
