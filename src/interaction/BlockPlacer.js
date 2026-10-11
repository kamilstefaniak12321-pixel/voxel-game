import {
    isLiquidId,
    isPlantId,
    isSoilId,
    isReplaceableId,
    getBlockId
} from '../blocks/BlockRegistry.js';

// ------------------------------------------------------------
// STAWIANIE BLOKÓW
//
// Blok staje obok wskazanej ściany. Wyjątki:
//   - wskazany blok jest "do zastąpienia" (np. trawa) - nowy blok
//     staje w jego miejscu,
//   - roślina staje tylko na ziemi (blok z soil: true pod spodem),
//   - ciecz (woda) jest zastępowana.
// ------------------------------------------------------------

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


    placeBlock(hit, blockType) {

        const target = this.targetOf(hit);

        if (!target) {
            return false;
        }

        const { x, y, z } = target;

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


        // Gracz nie może zastawić sam siebie (rośliny go nie blokują).

        if (
            !isPlantId(getBlockId(blockType)) &&
            this.player.intersectsBlock(x, y, z)
        ) {
            return false;
        }


        // true tylko wtedy, gdy świat naprawdę się zmienił
        // (np. ponad limitem wysokości blok się nie postawi).

        return this.world.setBlock(x, y, z, blockType);

    }

}
