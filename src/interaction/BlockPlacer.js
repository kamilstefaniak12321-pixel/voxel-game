import {
    isLiquidId,
    isPlantId,
    isSoilId,
    isSolidId,
    isReplaceableId,
    getBlockId,
    getBlockDefinition,
    getAttach,
    ATTACH_OFFSETS
} from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// STAWIANIE BLOKÓW
//
// Blok staje obok wskazanej ściany. Wyjątki:
//   - wskazany blok jest "do zastąpienia" (np. trawa) - nowy blok
//     staje w jego miejscu,
//   - roślina staje tylko na ziemi (blok z soil: true pod spodem),
//   - płaska dekoracja (model 'flat') potrzebuje pełnego bloku, do
//     którego przylega (opadłe liście - pod spodem, wieniec - za
//     sobą); wieniec wisi tylko na bokach bloków, w wersji zwróconej
//     od klikniętej ściany (pole wall),
//   - ciecz (woda) jest zastępowana.
// ------------------------------------------------------------

// Kliknięta ściana (normalna) -> strona, po której jest oparcie.

function wallSide(normal) {

    if (normal.z === 1) return 'north';
    if (normal.z === -1) return 'south';
    if (normal.x === 1) return 'west';
    if (normal.x === -1) return 'east';

    return null;

}

export class BlockPlacer {

    constructor(world, player) {

        this.world = world;
        this.player = player;

    }


    // Gdzie stanie blok po kliknięciu we wskazany blok (albo null).

    targetOf(hit) {

        if (!hit || !hit.hit) {
            return null;
        }

        const block = hit.block;

        if (isReplaceableId(this.world.getBlockId(block.x, block.y, block.z))) {
            return { x: block.x, y: block.y, z: block.z };
        }

        return {
            x: block.x + hit.normal.x,
            y: block.y + hit.normal.y,
            z: block.z + hit.normal.z
        };

    }


    // Postawiony blok (nazwa - np. wieniec w wersji na tę ścianę)
    // albo false.

    placeBlock(hit, blockType) {

        const target = this.targetOf(hit);

        if (!target) {
            return false;
        }

        const { x, y, z } = target;


        // Wieniec: wersja zwrócona od klikniętej ściany (nie na górze
        // ani na spodzie bloku).

        const wall = getBlockDefinition(blockType)?.wall;

        if (wall) {

            const side = wallSide(hit.normal);

            if (!side) {
                return false;
            }

            blockType = wall[side];

        }

        const id = this.world.getBlockId(x, y, z);


        // Zajęte miejsce - chyba że to ciecz albo coś do zastąpienia.

        if (
            this.world.getBlock(x, y, z) !== null &&
            !isLiquidId(id) &&
            !isReplaceableId(id)
        ) {
            return false;
        }


        // Roślina rośnie tylko na ziemi.

        if (
            isPlantId(getBlockId(blockType)) &&
            !isSoilId(this.world.getBlockId(x, y - 1, z))
        ) {
            return false;
        }


        // Dekoracja musi się o coś opierać.

        const attach = getAttach(getBlockId(blockType));

        if (attach) {

            const [dx, dy, dz] = ATTACH_OFFSETS[attach];

            if (!isSolidId(this.world.getBlockId(x + dx, y + dy, z + dz))) {
                return false;
            }

        }


        // Gracz nie może zastawić sam siebie (rośliny i dekoracje go
        // nie blokują).

        if (
            !isPlantId(getBlockId(blockType)) &&
            !attach &&
            this.player.intersectsBlock(x, y, z)
        ) {
            return false;
        }


        // Tylko wtedy, gdy świat naprawdę się zmienił
        // (np. ponad limitem wysokości blok się nie postawi).

        return this.world.setBlock(x, y, z, blockType) ? blockType : false;

    }

}
