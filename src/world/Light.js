import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    LIGHT_CURVE,
    LIGHT_MIN_BRIGHTNESS
} from '../config.js';

import {
    MAX_BLOCK_ID,
    isOpaqueId,
    isLeavesId,
    getLightEmission,
    getLightColor
} from '../blocks/BlockRegistry.js';
import { CANOPY_SKY_LEVELS } from './CanopyPolicy.js';

// ------------------------------------------------------------
// ŚWIATŁO
//
// Każda komórka świata ma cztery wartości światła ("kanały"):
//
//   SKY   - światło nieba, poziom 0-15. 15 wszędzie, skąd widać
//           niebo. Pod gołym niebem świeci w dół bez osłabienia,
//           a w bok (pod nawis, do jaskini) słabnie o 1 na blok.
//
//   RED, GREEN, BLUE - kolorowe światło bloków (lamp), każdy
//           kanał 0-255. Słabnie o 25% z każdym blokiem (a nie o
//           stałą wartość), więc proporcje kanałów - czyli KOLOR -
//           zostają takie same aż do końca zasięgu. Lampy różnych
//           kolorów mieszają się: między czerwoną a niebieską jest
//           fioletowo.
//
// Siła świecenia bloku (`light` 0-15 w BlockRegistry.js) mówi,
// na ile bloków sięga jego światło - tak jak poziom 15 światła
// nieba sięga 14 bloków w głąb tunelu.
//
// Światło nie przechodzi przez bloki, które zasłaniają (opaque).
// Liście filtrują pionowe światło nieba warstwa po warstwie. Powietrze
// poniżej korony go nie pochłania; rozchodzenie boczne nadal słabnie
// o 1 na blok. Dach lub skała kończą pionową drogę do nieba.
//
// Liczenie to "rozlewanie": zaczynamy od źródeł i krok po kroku
// oddajemy sąsiadom słabsze światło, dopóki coś się zmienia.
// Przy postawieniu/zniszczeniu bloku poprawiamy tylko okolicę -
// najpierw "zbieramy" światło, które od niego zależało, a potem
// rozlewamy je od nowa z pozostałych źródeł. Każdy kanał liczy
// się osobno, tym samym kodem.
//
// Wartości są zapisane w chunkach (chunk.lightChannels). Nie
// trafiają do zapisu świata - po wczytaniu liczą się od nowa.
// ------------------------------------------------------------

export const MAX_LIGHT = 15;


export const SKY = 0;
export const RED = 1;
export const GREEN = 2;
export const BLUE = 3;

export const CHANNEL_COUNT = 4;

const COLOR_CHANNELS = [RED, GREEN, BLUE];


// Kolorowe światło: najjaśniejsza wartość kanału i ile zostaje
// po każdym bloku.

export const COLOR_MAX = 255;

const COLOR_FALLOFF = 0.75;


// Jak jasno wygląda dany poziom światła 0-15 (może być ułamkowy):
// od LIGHT_MIN_BRIGHTNESS (poziom 0) do 1 (poziom 15).

export function lightToBrightness(level) {

    return (
        LIGHT_MIN_BRIGHTNESS +
        (1 - LIGHT_MIN_BRIGHTNESS) * (level / MAX_LIGHT) ** LIGHT_CURVE
    );

}

// ------------------------------------------------------------
// ZANIK ŚWIATŁA
//
// DECAY[kanał][wartość] = ile światła dostaje sąsiad.
// ------------------------------------------------------------

function buildColorDecay() {

    const decay = new Uint8Array(COLOR_MAX + 1);

    for (let v = 0; v <= COLOR_MAX; v++) {
        decay[v] = Math.floor(v * COLOR_FALLOFF);
    }


    // Wartości kolejno po 0, 1, 2... blokach od najjaśniejszego źródła.
    // Wszystko słabsze niż po (MAX_LIGHT - 1) blokach gaśnie, więc
    // zasięg zgadza się z poziomami 0-15.

    const chain = [COLOR_MAX];

    while (chain.length < MAX_LIGHT) {
        chain.push(decay[chain[chain.length - 1]]);
    }

    const cutoff = chain[MAX_LIGHT - 1];

    for (let v = 0; v <= COLOR_MAX; v++) {

        if (decay[v] < cutoff) {
            decay[v] = 0;
        }

    }

    return { decay, chain };

}


const SKY_DECAY = new Uint8Array(COLOR_MAX + 1);

for (let v = 1; v <= COLOR_MAX; v++) {
    SKY_DECAY[v] = Math.min(v, MAX_LIGHT + 1) - 1;
}


const { decay: COLOR_DECAY, chain: COLOR_CHAIN } = buildColorDecay();

// (Zanik kolorowego światła przydaje się też dynamicznemu światłu.)

export { COLOR_DECAY };

const DECAY = [SKY_DECAY, COLOR_DECAY, COLOR_DECAY, COLOR_DECAY];


// Wartość kanału koloru -> równoważny poziom 0-15 (ułamkowy).
// Przydaje się do liczenia jasności (ChunkMesher) i do debugu.

export const COLOR_LEVEL = new Float32Array(COLOR_MAX + 1);

for (let v = 0; v <= COLOR_MAX; v++) {

    let level = 0;

    for (let d = 0; d < COLOR_CHAIN.length; d++) {

        const upper = COLOR_CHAIN[d];
        const lower = d + 1 < COLOR_CHAIN.length ? COLOR_CHAIN[d + 1] : 0;

        if (v <= upper && v > lower) {

            level = (MAX_LIGHT - d - 1) + (v - lower) / (upper - lower);

            break;

        }

    }

    COLOR_LEVEL[v] = Math.min(MAX_LIGHT, level);

}


// Wartości kanałów R, G, B źródła światła o sile `strength` (0-15)
// i kolorze `color` ([r, g, b], 0-1). Najjaśniejszy kanał ma wartość,
// którą światło ma po (15 - strength) blokach od najmocniejszej lampy,
// więc zasięg zgadza się z siłą.

export function colorEmission(strength, color) {

    const level = Math.max(0, Math.min(MAX_LIGHT, Math.round(strength)));

    if (level === 0) {
        return [0, 0, 0];
    }

    const top = COLOR_CHAIN[MAX_LIGHT - level];

    const brightest = Math.max(color[0], color[1], color[2], 0.0001);

    return color.map((component) => {

        const value = Math.round(top * component / brightest);

        return value >= COLOR_CHAIN[MAX_LIGHT - 1] ? value : 0;

    });

}


// Ile światła daje świecący blok w każdym kanale:
// EMISSION[kanał][id] (dla SKY zawsze 0).

const EMISSION = [];

for (let channel = 0; channel < CHANNEL_COUNT; channel++) {
    EMISSION.push(new Uint8Array(MAX_BLOCK_ID + 1));
}

const EMITS = new Uint8Array(MAX_BLOCK_ID + 1);


// Bloki, przez które pełne światło nieba nie spływa dalej w dół (liście).

const FILTERS = new Uint8Array(MAX_BLOCK_ID + 1);

for (let id = 1; id <= MAX_BLOCK_ID; id++) {
    FILTERS[id] = isLeavesId(id) ? 1 : 0;
}

for (let id = 1; id <= MAX_BLOCK_ID; id++) {

    const strength = getLightEmission(id);

    if (strength === 0) {
        continue;
    }


    const values = colorEmission(strength, getLightColor(id));

    for (let c = 0; c < 3; c++) {
        EMISSION[COLOR_CHANNELS[c]][id] = values[c];
    }

    EMITS[id] = 1;

}


// Opis światła do debugu i komend, np.
// "niebo 15, lampy 12 (#ff8040)".

export function describeLight(light) {

    const strongest = Math.max(light.red, light.green, light.blue);

    if (strongest === 0) {
        return `niebo ${light.sky}, lampy 0`;
    }


    const hex = [light.red, light.green, light.blue]
        .map((value) => Math.round(255 * value / strongest).toString(16).padStart(2, '0'))
        .join('');

    return `niebo ${light.sky}, lampy ${Math.round(COLOR_LEVEL[strongest])} (#${hex})`;

}


function emissionOf(channel, id) {

    return EMISSION[channel][id];

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
        // razem z wartością, którą miały wcześniej.

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


        // Świecące bloki nowego chunka.

        this.emitters = [];

    }

    // --------------------------------------------------------
    // ODCZYT
    // --------------------------------------------------------

    // Światło w miejscu (x, y, z) świata:
    // { sky: 0-15, red, green, blue: 0-255 }

    getLight(x, y, z) {

        const light = { sky: MAX_LIGHT, red: 0, green: 0, blue: 0 };


        if (y < 0) {
            light.sky = 0;
        }

        if (y < 0 || y >= H) {
            return light;
        }


        const cx = Math.floor(x / S);
        const cz = Math.floor(z / S);

        const chunk = this.world.getChunk(cx, cz);

        if (!chunk) {
            return light;
        }


        const index = chunk.index(x - cx * S, y, z - cz * S);

        light.sky = chunk.skyLight[index];
        light.red = chunk.lightR[index];
        light.green = chunk.lightG[index];
        light.blue = chunk.lightB[index];

        return light;

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
        sky.fill(0);
        chunk.skySources.fill(0);


        // 1. Direct vertical sources. Foliage filters the column, while an
        // opaque roof/rock ends it. Clear air below a tall crown stays lit.

        sky.fill(MAX_LIGHT, top * LAYER);
        chunk.skySources.fill(MAX_LIGHT, top * LAYER);

        for (let column = 0; column < LAYER; column++) {

            let y = top - 1;
            let layers = 0;
            let firstFilter = -1;

            while (y >= 0) {

                const i = y * LAYER + column;

                const id = blocks[i];

                if (isOpaqueId(id)) {
                    break;
                }

                sky[i] = chunk.skySources[i] = CANOPY_SKY_LEVELS[layers];

                y--;

                if (FILTERS[id]) {
                    if (firstFilter < 0) firstFilter = y + 1;
                    layers++;
                }

            }

            heights[column] = firstFilter < 0 ? y + 1 : firstFilter;

            // Filtered columns can exchange light with a less dense adjacent
            // crown even when both columns end at the same ground height.
            if (layers) for (let scan = y + 1; scan < top; scan++) {
                const i = scan * LAYER + column;
                if (sky[i] > 0) this.addToSpread(chunk, i);
            }

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

        this.exchangeWithNeighbors(chunk, SKY);

        this.spread(SKY);


        // 4. Świecące bloki - każdy kolor osobno.

        const emitters = this.emitters;

        emitters.length = 0;

        for (let i = 0; i < top * LAYER; i++) {

            if (EMITS[blocks[i]]) {
                emitters.push(i);
            }

        }


        for (const channel of COLOR_CHANNELS) {

            const light = chunk.lightChannels[channel];

            for (const i of emitters) {

                const emission = emissionOf(channel, blocks[i]);

                if (emission > 0) {

                    light[i] = emission;

                    this.addToSpread(chunk, i);

                }

            }


            this.exchangeWithNeighbors(chunk, channel);

            this.spread(channel);

        }

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
    // Gdzie jedna strona może dać drugiej więcej, niż ta ma,
    // światło rozleje się na drugą.

    exchangeWithNeighbors(chunk, channel) {

        if (chunk.west) {
            this.exchange(chunk, chunk.west, 0, S - 1, S, channel);
        }

        if (chunk.east) {
            this.exchange(chunk, chunk.east, S - 1, 0, S, channel);
        }

        if (chunk.north) {
            this.exchange(chunk, chunk.north, 0, (S - 1) * S, 1, channel);
        }

        if (chunk.south) {
            this.exchange(chunk, chunk.south, (S - 1) * S, 0, 1, channel);
        }

    }


    // Jedna ściana styku: komórki chunka a (od indeksu aStart)
    // stykają się z komórkami chunka b (od bStart), kolejne
    // komórki wzdłuż ściany są co `step`.

    exchange(a, b, aStart, bStart, step, channel) {

        const aLight = a.lightChannels[channel];
        const bLight = b.lightChannels[channel];

        const decay = DECAY[channel];


        for (let y = 0; y < H; y++) {

            for (let k = 0; k < S; k++) {

                const ia = y * LAYER + aStart + k * step;
                const ib = y * LAYER + bStart + k * step;

                const la = aLight[ia];
                const lb = bLight[ib];


                if (decay[lb] > la && !isOpaqueId(a.blocks[ia])) {
                    this.addToSpread(b, ib);
                }
                else if (decay[la] > lb && !isOpaqueId(b.blocks[ib])) {
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

        this.relightSkyColumn(chunk, index);
        for (let channel = 1; channel < CHANNEL_COUNT; channel++) {
            this.relight(chunk, index, channel);
        }

    }

    relightSkyColumn(chunk, editedIndex) {
        const column = editedIndex % LAYER;
        let layers = 0, blocked = false;
        for (let y = H - 1; y >= 0; y--) {
            const index = y * LAYER + column, id = chunk.blocks[index];
            blocked ||= isOpaqueId(id);
            const source = blocked ? 0 : CANOPY_SKY_LEVELS[layers];
            const previous = chunk.skySources[index];
            chunk.skySources[index] = source;
            if ((source < previous || index === editedIndex) && chunk.skyLight[index] > 0) {
                const oldLevel = chunk.skyLight[index];
                this.setLevel(chunk, index, 0, SKY);
                this.addToRemove(chunk, index, oldLevel);
            }
            if (FILTERS[id]) layers++;
        }
        this.remove(SKY);
        for (let y = 0; y < H; y++) {
            const index = y * LAYER + column, source = chunk.skySources[index];
            if (source > chunk.skyLight[index]) {
                this.setLevel(chunk, index, source, SKY);
                this.addToSpread(chunk, index);
            }
        }
        if (!isOpaqueId(chunk.blocks[editedIndex])) {
            this.getNeighbors(chunk, editedIndex);
            for (let k = 0; k < 6; k++) {
                const neighbor = this.neighborChunks[k];
                if (neighbor && neighbor.skyLight[this.neighborIndices[k]] > 0)
                    this.addToSpread(neighbor, this.neighborIndices[k]);
            }
        }
        this.spread(SKY);
    }


    relight(chunk, index, channel) {

        const light = chunk.lightChannels[channel];

        const id = chunk.blocks[index];


        // 1. Zbieramy światło, które przechodziło przez tę komórkę
        //    (albo z niej wychodziło - np. z usuniętej lampy).

        const oldLevel = light[index];

        if (oldLevel > 0) {

            this.setLevel(chunk, index, 0, channel);

            this.addToRemove(chunk, index, oldLevel);

            this.remove(channel);

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

                if (neighbor.lightChannels[channel][neighborIndex] > 0) {
                    this.addToSpread(neighbor, neighborIndex);
                }

            }


            if (channel === SKY && index >= (H - 1) * LAYER) {

                this.setLevel(chunk, index, MAX_LIGHT, channel);

                this.addToSpread(chunk, index);

            }

        }


        // 3. Nowy blok sam świeci.

        const emission = emissionOf(channel, id);

        if (emission > light[index]) {

            this.setLevel(chunk, index, emission, channel);

            this.addToSpread(chunk, index);

        }


        this.spread(channel);

    }

    // --------------------------------------------------------
    // ROZLEWANIE I ZBIERANIE
    // --------------------------------------------------------

    // Rozlewa światło od komórek z kolejki rozlewania.

    spread(channel) {

        const chunks = this.spreadChunks;
        const indices = this.spreadIndices;

        const decay = DECAY[channel];
        const isSky = channel === SKY;


        // Kolejka rośnie w trakcie pętli - nowe komórki
        // trafiają na jej koniec.

        for (let q = 0; q < chunks.length; q++) {

            const chunk = chunks[q];
            const index = indices[q];

            const level = chunk.lightChannels[channel][index];

            const weaker = decay[level];

            // Pełne światło nieba idzie w dół bez osłabienia
            // (ale nie dalej niż do pierwszych liści).

            const fullSkyDown = isSky && level === MAX_LIGHT && FILTERS[chunk.blocks[index]] === 0;

            if (weaker === 0 && !fullSkyDown) {
                continue;
            }


            this.getNeighbors(chunk, index);

            for (let k = 0; k < 6; k++) {

                const neighbor = this.neighborChunks[k];

                if (!neighbor) {
                    continue;
                }


                const newLevel =
                    fullSkyDown && k === 5
                        ? MAX_LIGHT
                        : weaker;

                if (newLevel === 0) {
                    continue;
                }

                const neighborIndex = this.neighborIndices[k];


                if (isOpaqueId(neighbor.blocks[neighborIndex])) {
                    continue;
                }

                if (neighbor.lightChannels[channel][neighborIndex] >= newLevel) {
                    continue;
                }


                this.setLevel(neighbor, neighborIndex, newLevel, channel);

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

    remove(channel) {

        const chunks = this.removeChunks;
        const indices = this.removeIndices;
        const levels = this.removeLevels;

        const isSky = channel === SKY;


        for (let q = 0; q < chunks.length; q++) {

            const level = levels[q];

            this.getNeighbors(chunks[q], indices[q]);


            for (let k = 0; k < 6; k++) {

                const neighbor = this.neighborChunks[k];

                if (!neighbor) {
                    continue;
                }


                const neighborIndex = this.neighborIndices[k];

                const neighborLevel = neighbor.lightChannels[channel][neighborIndex];

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


                this.setLevel(neighbor, neighborIndex, 0, channel);

                this.addToRemove(neighbor, neighborIndex, neighborLevel);


                if ((isSky ? neighbor.skySources[neighborIndex] : emissionOf(channel, neighbor.blocks[neighborIndex])) > 0) {
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

            const emission = isSky ? chunk.skySources[index] : emissionOf(channel, chunk.blocks[index]);

            if (emission > chunk.lightChannels[channel][index]) {

                this.setLevel(chunk, index, emission, channel);

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


    // Ustawia wartość światła i zapamiętuje, że chunk się zmienił.

    setLevel(chunk, index, level, channel) {

        chunk.lightChannels[channel][index] = level;


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
