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


        // true tylko wtedy, gdy świat naprawdę się zmienił.

        return this.world.setBlock(
            block.x,
            block.y,
            block.z,
            null
        );

    }

}
