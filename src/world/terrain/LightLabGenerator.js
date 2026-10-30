import { CHUNK_SIZE, CHUNK_HEIGHT } from '../../config.js';
import { getBlockId, getBlockTypeById } from '../../blocks/BlockRegistry.js';

export const LIGHT_LAB_FLOOR = 16;

// Jeden, niezmienny układ stanowisk dla wszystkich seedów. Wszystkie
// współrzędne są światowe: chunk, mapa i daleki teren używają tej samej
// kolumny. Kolejność wczytywania chunków nie zmienia budowli.
export class LightLabGenerator {

    constructor(seed) {
        this.type = 'light-lab';
        this.seed = seed;
        this.seaLevel = null;
        this.baseHeight = LIGHT_LAB_FLOOR;
        this.boxes = [];
        const box = (x0, y0, z0, x1, y1, z1, material) => {
            this.boxes.push({ x0, y0, z0, x1, y1, z1, id: material ? getBlockId(material) : 0 });
        };

        // Północ: identyczne wnęki z różnych materiałów.
        for (const [index, material] of ['lime_plaster', 'terracotta', 'ochre_plaster', 'dark_planks'].entries()) {
            const x = -28 + index * 14;
            box(x, 17, -30, x + 8, 23, -30, material);
            box(x, 17, -30, x, 23, -24, material);
            box(x, 16, -30, x + 8, 16, -22, material);
        }

        // Środek: słupy 2, 4, 8 i 12 bloków, zawsze ten sam materiał.
        for (const [index, height] of [2, 4, 8, 12].entries()) {
            const x = -24 + index * 12;
            box(x, 17, -12, x + 1, 16 + height, -11, 'lime_plaster');
        }

        // Zachód: liście przepuszczające światło i pień rzucający cień.
        box(-28, 24, 4, -16, 25, 16, 'oak_leaves');
        box(-23, 17, 9, -22, 23, 10, 'oak_log');

        // Środek-południe: płytki basen; dno, woda i krawędź.
        box(-8, 14, 6, 4, 14, 20, 'sand');
        box(-8, 15, 6, 4, 16, 20, 'water');

        // Wschód: pokój z drzwiami od południa, oknem od zachodu
        // i otworem w dachu. Tylna komora oddziela lampy od dnia.
        box(12, 17, 4, 28, 24, 4, 'lime_plaster');
        box(12, 17, 4, 12, 24, 22, 'lime_plaster');
        box(28, 17, 4, 28, 24, 22, 'lime_plaster');
        box(12, 17, 22, 28, 24, 22, 'lime_plaster');
        box(12, 25, 4, 28, 25, 22, 'lime_plaster');
        box(18, 17, 22, 21, 20, 22, null);
        box(12, 19, 12, 12, 21, 15, null);
        box(19, 25, 12, 21, 25, 14, null);
        box(13, 17, 9, 27, 24, 9, 'dark_planks');
        box(24, 17, 9, 26, 20, 9, null);
        box(16, 19, 5, 16, 19, 5, 'lamp_red');
        box(23, 19, 5, 23, 19, 5, 'lamp_blue');
    }

    floorHeight(x, z) {
        // Trzy tarasy w oddali do testowania przejść LOD i dalekich cieni.
        if (x >= 128 && x < 320 && Math.abs(z) < 96) {
            return 32 + 16 * Math.floor((x - 128) / 64);
        }
        return LIGHT_LAB_FLOOR;
    }

    columnBlocks(x, z, blocks = new Uint16Array(CHUNK_HEIGHT)) {
        x = Math.floor(x);
        z = Math.floor(z);
        const floor = this.floorHeight(x, z);
        blocks.fill(0);
        blocks.fill(getBlockId('stone'), 0, floor);
        const plaza = Math.abs(x) <= 36 && Math.abs(z) <= 36;
        const axis = (x === 0 || z === 0) && plaza;
        blocks[floor] = getBlockId(axis ? 'terracotta' : plaza ? 'lime_plaster' : 'grass');
        for (const b of this.boxes) {
            if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) {
                blocks.fill(b.id, b.y0, b.y1 + 1);
            }
        }
        let height = CHUNK_HEIGHT - 1;
        while (height > 0 && blocks[height] === 0) height--;
        const name = getBlockTypeById(blocks[height]);
        const kind = name === 'water' ? 'water' : name === 'oak_leaves' ? 'oak_leaves' : name === 'grass' ? 'grass' : 'rock';
        return { height, top: height, kind, material: name, blocks };
    }

    getHeight(x, z) { return this.columnBlocks(x, z).height; }

    surfaceBlock(x, z) {
        const column = this.columnBlocks(x, z);
        return getBlockTypeById(column.blocks[column.height]);
    }

    farSurface(x, z) {
        const column = this.columnBlocks(x, z);
        return { top: column.height + 1, kind: column.kind, material: column.material, floor: column.kind === 'water' ? 15 : undefined };
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
