import {
    CHUNK_SIZE,
    CHUNK_HEIGHT,
    TERRAIN_BASE_HEIGHT,
    TERRAIN_HILL_HEIGHT,
    TERRAIN_HILL_SCALE,
    TERRAIN_MOUNTAIN_HEIGHT,
    TERRAIN_MOUNTAIN_SCALE,
    TERRAIN_ROCK_LEVEL,
    TERRAIN_DIRT_DEPTH,
    LEPIDOLITE_VEIN_SCALE,
    LEPIDOLITE_VEIN_THRESHOLD
} from '../config.js';

import {
    getBlockId
} from '../blocks/BlockRegistry.js';

import {
    Noise,
    seedToNumber
} from './Noise.js';

// ------------------------------------------------------------
// GENERATOR TERENU "KLASYCZNY" (pierwszy generator gry)
//
// Światy utworzone z tym typem terenu zawsze wyglądają tak samo -
// tego pliku nie zmieniamy (inaczej stare światy dostałyby szwy
// między zapisanymi a nowymi chunkami). Nowy teren powstaje
// w src/world/terrain/ (patrz docs/generator-terenu.md).
//
// Dla każdej kolumny (x, z) wylicza wysokość terenu z szumu,
// a potem wypełnia kolumnę blokami od dołu:
//
//   kamień -> ziemia -> trawa      (niziny i wzgórza)
//   sam kamień                     (szczyty gór)
//
// W kamieniu rozsiane są żyły lepidolitu.
//
// Wynik zależy tylko od seeda i pozycji, więc każdy chunk można
// wygenerować osobno i zawsze będzie pasował do sąsiadów.
// ------------------------------------------------------------

// Szum z kilku warstw rzadko dochodzi do -1 i 1 (zwykle mieści
// się między -0.4 a 0.4), więc rozciągamy go tym mnożnikiem,
// żeby wysokości z config.js odpowiadały prawdziwym blokom.

const NOISE_GAIN = 2.5;

// Ile warstw szczegółów (oktaw) mają wzgórza i góry.

export const HILL_OCTAVES = 4;
export const MOUNTAIN_OCTAVES = 2;


// Płynne przejście 0 -> 1 między wartościami edge0 i edge1.

function smoothstep(edge0, edge1, value) {

    const t = Math.min(
        1,
        Math.max(
            0,
            (value - edge0) / (edge1 - edge0)
        )
    );

    return t * t * (3 - 2 * t);

}

// ------------------------------------------------------------

export class TerrainGenerator {

    constructor(seed) {

        // Wspólne pola wszystkich generatorów (patrz terrain/generators.js).

        this.type = 'classic';

        // Bez morza; typowa wysokość nizin (np. horyzont dalekiego terenu).

        this.seaLevel = null;
        this.baseHeight = TERRAIN_BASE_HEIGHT;


        const baseSeed = seedToNumber(seed);

        // Osobny szum do każdej cechy terenu, żeby np. góry
        // nie pokrywały się z układem wzgórz.

        this.hillNoise = new Noise(baseSeed);
        this.mountainNoise = new Noise(baseSeed + 1);
        this.rockNoise = new Noise(baseSeed + 2);
        this.veinNoise = new Noise(baseSeed + 3);


        // ID bloków pobrane raz, żeby nie szukać ich po nazwie
        // przy każdym bloku.

        this.stoneId = getBlockId('stone');
        this.dirtId = getBlockId('dirt');
        this.grassId = getBlockId('grass');
        this.lepidoliteId = getBlockId('lepidolite');

    }


    // Wysokość terenu w kolumnie (x, z):
    // współrzędna Y najwyższego bloku.

    getHeight(x, z) {

        return this.getHeightLod(x, z, HILL_OCTAVES, MOUNTAIN_OCTAVES);

    }


    // To samo, ale z mniejszą liczbą szczegółów (oktaw szumu) -
    // dla dalekiego terenu (FarTerrain.js). Z daleka drobnych
    // pagórków i tak nie widać, a policzenie ich w punktach co
    // kilkanaście bloków dałoby przypadkowe "kolce".

    getHeightLod(x, z, hillOctaves, mountainOctaves) {

        // Wzgórza: mniej więcej -1..1

        const hills =
            this.hillNoise.fractal2D(
                x / TERRAIN_HILL_SCALE,
                z / TERRAIN_HILL_SCALE,
                HILL_OCTAVES,
                hillOctaves
            ) * NOISE_GAIN;


        // Góry: 0 na nizinach, 1 w środku pasma górskiego.
        // Liczby 0.1 i 0.8 ustalają, jak dużą część świata
        // zajmują góry (niżej = więcej gór).

        const mountains =
            smoothstep(
                0.1,
                0.8,
                this.mountainNoise.fractal2D(
                    x / TERRAIN_MOUNTAIN_SCALE,
                    z / TERRAIN_MOUNTAIN_SCALE,
                    MOUNTAIN_OCTAVES,
                    mountainOctaves
                ) * NOISE_GAIN
            );


        // W górach teren jest bardziej poszarpany niż na nizinach.

        const height =
            TERRAIN_BASE_HEIGHT +
            hills * TERRAIN_HILL_HEIGHT * (1 + mountains) +
            mountains * TERRAIN_MOUNTAIN_HEIGHT;


        // Zawsze zostaje dno świata i miejsce na budowanie u góry.

        return Math.max(
            1,
            Math.min(
                CHUNK_HEIGHT - 8,
                Math.floor(height)
            )
        );

    }


    // Czy szczyt kolumny to goła skała (bez ziemi i trawy).
    // Szum przesuwa granicę o parę bloków, żeby nie była
    // równa jak od linijki.

    isBareRock(x, z, height) {

        const offset =
            this.rockNoise.noise2D(
                x / 9,
                z / 9
            ) * 3;

        return height + offset > TERRAIN_ROCK_LEVEL;

    }


    // Czy kamień w tym miejscu jest lepidolitem.

    isLepidolite(x, y, z) {

        return this.veinNoise.noise3D(
            x / LEPIDOLITE_VEIN_SCALE,
            y / LEPIDOLITE_VEIN_SCALE,
            z / LEPIDOLITE_VEIN_SCALE
        ) > LEPIDOLITE_VEIN_THRESHOLD;

    }


    // Wypełnia chunk terenem.

    generateChunk(chunk) {

        const baseX = chunk.cx * CHUNK_SIZE;
        const baseZ = chunk.cz * CHUNK_SIZE;


        for (let lz = 0; lz < CHUNK_SIZE; lz++) {

            for (let lx = 0; lx < CHUNK_SIZE; lx++) {

                const x = baseX + lx;
                const z = baseZ + lz;

                const height = this.getHeight(x, z);

                const bareRock =
                    this.isBareRock(x, z, height);


                for (let y = 0; y <= height; y++) {

                    let id = this.stoneId;


                    if (!bareRock) {

                        if (y === height) {

                            id = this.grassId;

                        }

                        else if (y >= height - TERRAIN_DIRT_DEPTH) {

                            id = this.dirtId;

                        }

                    }


                    if (
                        id === this.stoneId &&
                        this.isLepidolite(x, y, z)
                    ) {

                        id = this.lepidoliteId;

                    }


                    chunk.setId(lx, y, lz, id);

                }

            }

        }

    }


    // --------------------------------------------------------
    // Wspólny interfejs generatorów (terrain/generators.js)
    // --------------------------------------------------------

    // Powierzchnia dla dalekiego terenu: wierzch i rodzaj
    // (spacing = co ile bloków są próbki - mniej szczegółów z daleka).

    farSurface(x, z, spacing) {

        const hillOctaves =
            spacing <= 4 ? HILL_OCTAVES :
            spacing <= 8 ? 2 :
            spacing <= 16 ? 1 : 0;

        const mountainOctaves = spacing <= 16 ? MOUNTAIN_OCTAVES : 1;

        const height = this.getHeightLod(x, z, hillOctaves, mountainOctaves);

        return {
            top: height + 1,
            kind: height > TERRAIN_ROCK_LEVEL + 1 ? 'rock' : 'grass'
        };

    }


    // Opis miejsca (komenda /teren, mapa terenu).

    describe(x, z, slopeHint = null) {

        const height = this.getHeight(x, z);

        return {
            height,
            landform: height > TERRAIN_ROCK_LEVEL ? 'mountains' : 'plain',
            relief: height > TERRAIN_ROCK_LEVEL ? 'mountains' : 'lowland',
            surface: this.isBareRock(x, z, height) ? 'rock' : 'grass',
            rock: 'stone',
            fields: {}
        };

    }


    // Blok na wierzchu kolumny (/skaly znajdz).

    surfaceBlock(x, z) {

        const height = this.getHeight(x, z);

        if (!this.isBareRock(x, z, height)) {
            return 'grass';
        }

        return this.isLepidolite(x, height, z) ? 'lepidolite' : 'stone';

    }


    // Bloki jednej kolumny - tak jak w generateChunk (mapa przekroju,
    // komenda /skaly). Teren się przez to nie zmienia.

    columnBlocks(x, z, blocks = new Uint8Array(CHUNK_HEIGHT)) {

        const height = this.getHeight(x, z);

        const bareRock = this.isBareRock(x, z, height);

        blocks.fill(0);

        for (let y = 0; y <= height; y++) {

            let id = this.stoneId;

            if (!bareRock) {

                if (y === height) {
                    id = this.grassId;
                }
                else if (y >= height - TERRAIN_DIRT_DEPTH) {
                    id = this.dirtId;
                }

            }

            if (id === this.stoneId && this.isLepidolite(x, y, z)) {
                id = this.lepidoliteId;
            }

            blocks[y] = id;

        }

        return { height, kind: bareRock ? 'rock' : 'grass', top: height, blocks };

    }


    // Miejsce startu nowego świata - tu zawsze tam, gdzie poproszono.

    findSpawn(x, z) {

        return { x, z };

    }

}
