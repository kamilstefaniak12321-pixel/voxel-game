import { isLiquidId } from '../blocks/BlockRegistry.js';

export class BlockPlacer {

    constructor(world, player) {

        this.world = world;
        this.player = player;

    }


    placeBlock(hit, blockType) {

        if (
            !hit ||
            !hit.hit
        ) {
            return false;
        }


        const x =
            hit.block.x +
            hit.normal.x;

        const y =
            hit.block.y +
            hit.normal.y;

        const z =
            hit.block.z +
            hit.normal.z;


        // Zajęte miejsce - chyba że to ciecz (blok ją zastępuje).

        if (
            this.world.getBlock(x, y, z) !== null &&
            !isLiquidId(this.world.getBlockId(x, y, z))
        ) {

            return false;

        }


        if (
            this.player.intersectsBlock(
                x,
                y,
                z
            )
        ) {

            return false;

        }


        // true tylko wtedy, gdy świat naprawdę się zmienił
        // (np. ponad limitem wysokości blok się nie postawi).

        return this.world.setBlock(
            x,
            y,
            z,
            blockType
        );

    }

}
