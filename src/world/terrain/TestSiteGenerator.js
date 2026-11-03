import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config.js';
import { getBlockId, getBlockTypeById } from '../../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// PLAC TESTOWY (teren 'flat' - tryb programisty)
//
// Płaski, niezmienny teren do testów - taki sam dla każdego seeda:
//   - posadzka z tynku wapiennego 73 x 73 bloki wokół (0, 0), z osiami
//     x = 0 i z = 0 z terakoty (łatwo trafić w środek i strony świata),
//   - dookoła trawa na kamieniu, wierzch na y = TEST_SITE_FLOOR,
//   - trzy tarasy daleko na wschodzie (x 128-320) - przejścia dalekiego
//     terenu (LOD) i dalekie cienie.
// Sceny testowe (src/dev/scenes.js) stawia się na nim zawsze w tym
// samym miejscu. Wszystkie współrzędne są światowe: chunk, mapa
// i daleki teren używają tej samej kolumny.
//
// Dawny teren "Laboratorium światła" ('light-lab') to dziś ten plac
// (generators.js) - jego stanowiska stawia scena "Światło i materiały".
// ------------------------------------------------------------

export const TEST_SITE_FLOOR = 16;

// Pół boku posadzki (bloki od środka).
export const TEST_SITE_PLAZA = 36;

export class TestSiteGenerator {

    constructor(seed) {
        this.type = 'flat';
        this.seed = seed;
        this.seaLevel = null;
        this.baseHeight = TEST_SITE_FLOOR;
    }

    floorHeight(x, z) {
        // Trzy tarasy w oddali do testowania przejść LOD i dalekich cieni.
        if (x >= 128 && x < 320 && Math.abs(z) < 96) {
            return 32 + 16 * Math.floor((x - 128) / 64);
        }
        return TEST_SITE_FLOOR;
    }

    // Bloki wierzchu kolumny (bez kamienia pod spodem).
    floorBlock(x, z) {
        const plaza = Math.abs(x) <= TEST_SITE_PLAZA && Math.abs(z) <= TEST_SITE_PLAZA;
        const axis = (x === 0 || z === 0) && plaza;
        return axis ? 'terracotta' : plaza ? 'lime_plaster' : 'grass';
    }

    columnBlocks(x, z, blocks = new Uint16Array(CHUNK_HEIGHT)) {
        x = Math.floor(x);
        z = Math.floor(z);
        const floor = this.floorHeight(x, z);
        blocks.fill(0);
        blocks.fill(getBlockId('stone'), 0, floor);
        blocks[floor] = getBlockId(this.floorBlock(x, z));
        const name = getBlockTypeById(blocks[floor]);
        const kind = name === 'grass' ? 'grass' : 'rock';
        return { height: floor, top: floor, kind, material: name, blocks };
    }

    getHeight(x, z) { return this.floorHeight(Math.floor(x), Math.floor(z)); }

    surfaceBlock(x, z) {
        return this.floorBlock(Math.floor(x), Math.floor(z));
    }

    farSurface(x, z) {
        const column = this.columnBlocks(x, z);
        return { top: column.height + 1, kind: column.kind, material: column.material };
    }

    describe(x, z) {
        const column = this.columnBlocks(x, z);
        return { height: column.height, landform: 'plain', relief: 'lowland', surface: column.kind, rock: 'stone', fields: {} };
    }

    findSpawn() { return { x: 7, z: 32 }; }

    generateChunk(chunk) {
        const blocks = new Uint16Array(CHUNK_HEIGHT);
        for (let z = 0; z < CHUNK_SIZE; z++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
                const column = this.columnBlocks(chunk.cx * CHUNK_SIZE + x, chunk.cz * CHUNK_SIZE + z, blocks);
                for (let y = 0; y <= column.height; y++) {
                    if (blocks[y]) chunk.setId(x, y, z, blocks[y]);
                }
            }
        }
    }
}
