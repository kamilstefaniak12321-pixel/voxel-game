import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    LIGHT_CURVE,
    LIGHT_MIN_BRIGHTNESS
} from '../config.js';

import {
    isOpaqueId,
    getLightEmission
} from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// ŚWIATŁO
//
// Każda komórka świata ma dwa poziomy światła, od 0 (ciemno)
// do 15 (najjaśniej):
//
//   światło nieba - 15 wszędzie, skąd widać niebo. Pod gołym
//                   niebem świeci w dół bez osłabienia, a w bok
//                   (np. pod nawis albo do jaskini) słabnie o 1
//                   z każdym blokiem.
//
//   światło bloków - świecące bloki (np. lampa, `light` w
//                   BlockRegistry.js) dają tyle, ile świecą,
//                   i też słabnie o 1 z każdym blokiem.
//
// Światło nie przechodzi przez bloki, które zasłaniają (opaque).
//
// Liczenie to "rozlewanie": zaczynamy od źródeł i krok po kroku
// oddajemy sąsiadom poziom o 1 mniejszy, dopóki coś się zmienia.
// Przy postawieniu/zniszczeniu bloku poprawiamy tylko okolicę -
// najpierw "zbieramy" światło, które od niego zależało, a potem
// rozlewamy je od nowa z pozostałych źródeł.
//
// Wartości światła są zapisane w chunkach (skyLight, blockLight).
// Nie trafiają do zapisu świata - po wczytaniu liczą się od nowa.
// ------------------------------------------------------------

export const MAX_LIGHT = 15;


// Jak jasno wygląda dany poziom światła (może być ułamkowy):
// od LIGHT_MIN_BRIGHTNESS (poziom 0) do 1 (poziom 15).

export function lightToBrightness(level) {

    return (
        LIGHT_MIN_BRIGHTNESS +
        (1 - LIGHT_MIN_BRIGHTNESS) * (level / MAX_LIGHT) ** LIGHT_CURVE
    );

}


const S = CHUNK_SIZE;
const H = CHUNK_HEIGHT;
const LAYER = S * S;

// ------------------------------------------------------------
// Które krawędzie chunka dotyka kolumna (lx, lz).
//
// Zmiana światła albo bloku przy krawędzi zmienia też wygląd
// sąsiedniego chunka (cienie i światło na jego ścianach), więc
// jego mesh też trzeba przebudować.
// ------------------------------------------------------------

export const EDGE_WEST = 1;     // lx = 0
export const EDGE_EAST = 2;     // lx = CHUNK_SIZE - 1
export const EDGE_NORTH = 4;    // lz = 0
export const EDGE_SOUTH = 8;    // lz = CHUNK_SIZE - 1
export const EDGE_SELF = 16;    // sam chunk

export const ALL_EDGES =
    EDGE_WEST | EDGE_EAST | EDGE_NORTH | EDGE_SOUTH | EDGE_SELF;


export function edgesAt(lx, lz) {

    return (
        EDGE_SELF |
        (lx === 0 ? EDGE_WEST : 0) |
        (lx === S - 1 ? EDGE_EAST : 0) |
        (lz === 0 ? EDGE_NORTH : 0) |
        (lz === S - 1 ? EDGE_SOUTH : 0)
    );

}


// To samo dla każdej kolumny chunka (indeks lz * S + lx).

const COLUMN_EDGES = new Uint8Array(LAYER);

for (let lz = 0; lz < S; lz++) {

    for (let lx = 0; lx < S; lx++) {
        COLUMN_EDGES[lz * S + lx] = edgesAt(lx, lz);
    }

}

// ------------------------------------------------------------

export class LightEngine {

    constructor(world) {

        this.world = world;


        // Kolejka rozlewania: komórki, od których światło ma się
        // rozlać dalej (chunk + indeks komórki w chunku).

        this.spreadChunks = [];
        this.spreadIndices = [];


        // Kolejka zbierania: komórki, których światło zgasło,
        // razem z poziomem, który miały wcześniej.

        this.removeChunks = [];
        this.removeIndices = [];
        this.removeLevels = [];


        // Świecące bloki, których światło zgasło przy zbieraniu
        // (np. lampa obok usuniętej lampy) - zapalamy je z powrotem.

        this.relightChunks = [];
        this.relightIndices = [];


        // Chunki, w których zmieniło się światło
        // (World przebudowuje potem ich meshe).

        this.changedChunks = [];


        // Sąsiedzi jednej komórki (wypełnia getNeighbors):
        // 0 zachód, 1 wschód, 2 północ, 3 południe, 4 góra, 5 dół.
        // null = brak sąsiada (niewczytany chunk albo poza światem).

        this.neighborChunks = new Array(6).fill(null);
        this.neighborIndices = new Int32Array(6);


        // Wysokość, od której kolumna widzi niebo (przy liczeniu
        // światła nowego chunka).

        this.skyHeights = new Int16Array(LAYER);

    }

    // --------------------------------------------------------
    // ODCZYT
    // --------------------------------------------------------

    // Światło w miejscu (x, y, z) świata: { sky, block }.

    getLight(x, y, z) {

        if (y >= H) {
            return { sky: MAX_LIGHT, block: 0 };
        }

        if (y < 0) {
            return { sky: 0, block: 0 };
        }


        const cx = Math.floor(x / S);
        const cz = Math.floor(z / S);

        const chunk = this.world.getChunk(cx, cz);

        if (!chunk) {
            return { sky: MAX_LIGHT, block: 0 };
        }


        const index = chunk.index(x - cx * S, y, z - cz * S);

        return {
            sky: chunk.skyLight[index],
            block: chunk.blockLight[index]
        };

    }

    // --------------------------------------------------------
    // NOWY CHUNK
    // --------------------------------------------------------

    // Liczy światło świeżo wygenerowanego (albo wczytanego) chunka.
    // Wymienia się też światłem z sąsiednimi chunkami - światło
    // może przy tym wpłynąć do nich (np. do tunelu, którego wylot
    // jest w nowym chunku).

    initChunk(chunk) {

        const blocks = chunk.blocks;
        const sky = chunk.skyLight;
        const heights = this.skyHeights;

        const top = chunk.maxY;


        // 1. Niebo świeci z góry w dół, aż do pierwszego bloku,
        //    który zasłania. Nad najwyższym blokiem chunka jest
        //    samo powietrze, więc tę część wypełniamy od razu.

        sky.fill(MAX_LIGHT, top * LAYER);

        for (let column = 0; column < LAYER; column++) {

            let y = top - 1;

            while (y >= 0 && !isOpaqueId(blocks[y * LAYER + column])) {

                sky[y * LAYER + column] = MAX_LIGHT;

                y--;

            }

            heights[column] = y + 1;

        }


        // 2. Światło nieba wpada w bok tam, gdzie obok jasnej
        //    kolumny jest ciemne powietrze (pod nawisem, w tunelu).
        //    Zwykły teren bez jaskiń nie ma takich miejsc.

        for (let lz = 0; lz < S; lz++) {

            for (let lx = 0; lx < S; lx++) {

                const column = lz * S + lx;

                if (lx > 0) this.seedSkyColumn(chunk, column, column - 1);
                if (lx < S - 1) this.seedSkyColumn(chunk, column, column + 1);
                if (lz > 0) this.seedSkyColumn(chunk, column, column - S);
                if (lz < S - 1) this.seedSkyColumn(chunk, column, column + S);

            }

        }


        // 3. Wymiana z sąsiednimi chunkami i rozlewanie.

        this.exchangeWithNeighbors(chunk, true);

        this.spread(true);


        // 4. Świecące bloki.

        const blockLight = chunk.blockLight;

        for (let i = 0; i < top * LAYER; i++) {

            const emission = getLightEmission(blocks[i]);

            if (emission > 0) {

                blockLight[i] = emission;

                this.addToSpread(chunk, i);

            }

        }


        this.exchangeWithNeighbors(chunk, false);

        this.spread(false);

    }


    // Kolumna `column` widzi niebo od wysokości heights[column].
    // Jeśli sąsiednia kolumna jest wyżej zasłonięta, to w tym
    // przedziale jej powietrze dostanie światło z naszej kolumny.

    seedSkyColumn(chunk, column, otherColumn) {

        const from = this.skyHeights[column];
        const to = this.skyHeights[otherColumn];

        for (let y = from; y < to; y++) {

            if (!isOpaqueId(chunk.blocks[y * LAYER + otherColumn])) {
                this.addToSpread(chunk, y * LAYER + column);
            }

        }

    }


    // Porównuje światło na styku z czterema sąsiednimi chunkami.
    // Gdzie jedna strona jest jaśniejsza o więcej niż 1, światło
    // rozleje się na drugą.

    exchangeWithNeighbors(chunk, isSky) {

        if (chunk.west) {
            this.exchange(chunk, chunk.west, 0, S - 1, S, isSky);
        }

        if (chunk.east) {
            this.exchange(chunk, chunk.east, S - 1, 0, S, isSky);
        }

        if (chunk.north) {
            this.exchange(chunk, chunk.north, 0, (S - 1) * S, 1, isSky);
        }

        if (chunk.south) {
            this.exchange(chunk, chunk.south, (S - 1) * S, 0, 1, isSky);
        }

    }


    // Jedna ściana styku: komórki chunka a (od indeksu aStart)
    // stykają się z komórkami chunka b (od bStart), kolejne
    // komórki wzdłuż ściany są co `step`.

    exchange(a, b, aStart, bStart, step, isSky) {

        const aLight = isSky ? a.skyLight : a.blockLight;
        const bLight = isSky ? b.skyLight : b.blockLight;


        for (let y = 0; y < H; y++) {

            for (let k = 0; k < S; k++) {

                const ia = y * LAYER + aStart + k * step;
                const ib = y * LAYER + bStart + k * step;

                const la = aLight[ia];
                const lb = bLight[ib];


                if (lb > la + 1 && !isOpaqueId(a.blocks[ia])) {
                    this.addToSpread(b, ib);
                }
                else if (la > lb + 1 && !isOpaqueId(b.blocks[ib])) {
                    this.addToSpread(a, ia);
                }

            }

        }

    }

    // --------------------------------------------------------
    // ZMIANA BLOKU
    // --------------------------------------------------------

    // Wywoływane po zmianie bloku w komórce `index` chunka.

    blockChanged(chunk, index) {

        this.relight(chunk, index, true);
        this.relight(chunk, index, false);

    }


    relight(chunk, index, isSky) {

        const light = isSky ? chunk.skyLight : chunk.blockLight;

        const id = chunk.blocks[index];


        // 1. Zbieramy światło, które przechodziło przez tę komórkę
        //    (albo z niej wychodziło - np. z usuniętej lampy).

        const oldLevel = light[index];

        if (oldLevel > 0) {

            this.setLevel(chunk, index, 0, isSky);

            this.addToRemove(chunk, index, oldLevel);

            this.remove(isSky);

        }


        // 2. Komórka bez zasłaniającego bloku dostaje światło
        //    od sąsiadów (a na samej górze świata - od nieba).

        if (!isOpaqueId(id)) {

            this.getNeighbors(chunk, index);

            for (let k = 0; k < 6; k++) {

                const neighbor = this.neighborChunks[k];

                if (!neighbor) {
                    continue;
                }

                const neighborIndex = this.neighborIndices[k];

                const neighborLight =
                    isSky ? neighbor.skyLight : neighbor.blockLight;

                if (neighborLight[neighborIndex] > 0) {
                    this.addToSpread(neighbor, neighborIndex);
                }

            }


            if (isSky && index >= (H - 1) * LAYER) {

                this.setLevel(chunk, index, MAX_LIGHT, isSky);

                this.addToSpread(chunk, index);

            }

        }


        // 3. Nowy blok sam świeci.

        if (!isSky) {

            const emission = getLightEmission(id);

            if (emission > light[index]) {

                this.setLevel(chunk, index, emission, isSky);

                this.addToSpread(chunk, index);

            }

        }


        this.spread(isSky);

    }

    // --------------------------------------------------------
    // ROZLEWANIE I ZBIERANIE
    // --------------------------------------------------------

    // Rozlewa światło od komórek z kolejki rozlewania.

    spread(isSky) {

        const chunks = this.spreadChunks;
        const indices = this.spreadIndices;


        // Kolejka rośnie w trakcie pętli - nowe komórki
        // trafiają na jej koniec.

        for (let q = 0; q < chunks.length; q++) {

            const chunk = chunks[q];
            const index = indices[q];

            const level =
                (isSky ? chunk.skyLight : chunk.blockLight)[index];

            if (level <= 1) {
                continue;
            }


            this.getNeighbors(chunk, index);

            for (let k = 0; k < 6; k++) {

                const neighbor = this.neighborChunks[k];

                if (!neighbor) {
                    continue;
                }


                // Pełne światło nieba idzie w dół bez osłabienia.

                const newLevel =
                    isSky && k === 5 && level === MAX_LIGHT
                        ? MAX_LIGHT
                        : level - 1;

                const neighborIndex = this.neighborIndices[k];


                if (isOpaqueId(neighbor.blocks[neighborIndex])) {
                    continue;
                }

                const neighborLight =
                    isSky ? neighbor.skyLight : neighbor.blockLight;

                if (neighborLight[neighborIndex] >= newLevel) {
                    continue;
                }


                this.setLevel(neighbor, neighborIndex, newLevel, isSky);

                this.addToSpread(neighbor, neighborIndex);

            }

        }


        chunks.length = 0;
        indices.length = 0;

    }


    // Gasi światło, które pochodziło od komórek z kolejki zbierania.
    // Sąsiedzi jaśniejsi (mający światło z innego źródła) trafiają
    // do kolejki rozlewania - spread() oświetli potem zgaszone
    // miejsca od nowa, jeśli da się do nich dotrzeć.

    remove(isSky) {

        const chunks = this.removeChunks;
        const indices = this.removeIndices;
        const levels = this.removeLevels;


        for (let q = 0; q < chunks.length; q++) {

            const level = levels[q];

            this.getNeighbors(chunks[q], indices[q]);


            for (let k = 0; k < 6; k++) {

                const neighbor = this.neighborChunks[k];

                if (!neighbor) {
                    continue;
                }


                const neighborIndex = this.neighborIndices[k];

                const neighborLevel =
                    (isSky ? neighbor.skyLight : neighbor.blockLight)[neighborIndex];

                if (neighborLevel === 0) {
                    continue;
                }


                // Słabsze światło przyszło stąd - gaśnie. Pełne
                // światło nieba pod spodem też (spływało w dół).

                const cameFromHere =
                    neighborLevel < level ||
                    (isSky && k === 5 && level === MAX_LIGHT);


                if (!cameFromHere) {

                    this.addToSpread(neighbor, neighborIndex);

                    continue;

                }


                this.setLevel(neighbor, neighborIndex, 0, isSky);

                this.addToRemove(neighbor, neighborIndex, neighborLevel);


                if (
                    !isSky &&
                    getLightEmission(neighbor.blocks[neighborIndex]) > 0
                ) {
                    this.relightChunks.push(neighbor);
                    this.relightIndices.push(neighborIndex);
                }

            }

        }


        chunks.length = 0;
        indices.length = 0;
        levels.length = 0;


        // Świecące bloki zgaszone przy zbieraniu świecą dalej.

        for (let q = 0; q < this.relightChunks.length; q++) {

            const chunk = this.relightChunks[q];
            const index = this.relightIndices[q];

            const emission = getLightEmission(chunk.blocks[index]);

            if (emission > chunk.blockLight[index]) {

                this.setLevel(chunk, index, emission, false);

                this.addToSpread(chunk, index);

            }

        }


        this.relightChunks.length = 0;
        this.relightIndices.length = 0;

    }

    // --------------------------------------------------------
    // POMOCNICZE
    // --------------------------------------------------------

    addToSpread(chunk, index) {

        this.spreadChunks.push(chunk);
        this.spreadIndices.push(index);

    }


    addToRemove(chunk, index, level) {

        this.removeChunks.push(chunk);
        this.removeIndices.push(index);
        this.removeLevels.push(level);

    }


    // Ustawia poziom światła i zapamiętuje, że chunk się zmienił.

    setLevel(chunk, index, level, isSky) {

        (isSky ? chunk.skyLight : chunk.blockLight)[index] = level;


        if (chunk.lightChanged === 0) {
            this.changedChunks.push(chunk);
        }

        chunk.lightChanged |= COLUMN_EDGES[index % LAYER];

    }


    // Oddaje chunki ze zmienionym światłem (z informacją, których
    // krawędzi dotyczyła zmiana) i zaczyna liczyć od nowa.

    takeChangedChunks(callback) {

        for (const chunk of this.changedChunks) {

            callback(chunk, chunk.lightChanged);

            chunk.lightChanged = 0;

        }

        this.changedChunks.length = 0;

    }


    // Wypełnia neighborChunks / neighborIndices sześcioma
    // sąsiadami komórki (także w sąsiednich chunkach).

    getNeighbors(chunk, index) {

        const chunks = this.neighborChunks;
        const indices = this.neighborIndices;

        const lx = index % S;
        const lz = Math.floor(index / S) % S;
        const y = Math.floor(index / LAYER);


        // Zachód (-X) i wschód (+X).

        if (lx > 0) {
            chunks[0] = chunk;
            indices[0] = index - 1;
        }
        else {
            chunks[0] = chunk.west;
            indices[0] = index + S - 1;
        }

        if (lx < S - 1) {
            chunks[1] = chunk;
            indices[1] = index + 1;
        }
        else {
            chunks[1] = chunk.east;
            indices[1] = index - (S - 1);
        }


        // Północ (-Z) i południe (+Z).

        if (lz > 0) {
            chunks[2] = chunk;
            indices[2] = index - S;
        }
        else {
            chunks[2] = chunk.north;
            indices[2] = index + (S - 1) * S;
        }

        if (lz < S - 1) {
            chunks[3] = chunk;
            indices[3] = index + S;
        }
        else {
            chunks[3] = chunk.south;
            indices[3] = index - (S - 1) * S;
        }


        // Góra i dół (poza wysokością świata nie ma sąsiada).

        chunks[4] = y < H - 1 ? chunk : null;
        indices[4] = index + LAYER;

        chunks[5] = y > 0 ? chunk : null;
        indices[5] = index - LAYER;

    }

}
