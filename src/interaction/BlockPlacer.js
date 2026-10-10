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


        if (
            this.world.getBlock(
                x,
                y,
                z
            ) !== null
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


        this.world.setBlock(
            x,
            y,
            z,
            blockType
        );


        return true;

    }

}