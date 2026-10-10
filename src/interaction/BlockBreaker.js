export class BlockBreaker {

    constructor(world) {

        this.world = world;

    }


    breakBlock(hit) {

        if (
            !hit ||
            !hit.hit
        ) {
            return false;
        }


        const block = hit.block;


        this.world.setBlock(
            block.x,
            block.y,
            block.z,
            null
        );


        return true;

    }

}