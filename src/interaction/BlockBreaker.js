import { vineLeftover } from '../game/VineGrowth.js';

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


        // true tylko wtedy, gdy świat naprawdę się zmienił. Pnącze na
        // kratce, tyczce albo pergoli (1.30.0) - zostaje sama podpora.

        return this.world.setBlock(
            block.x,
            block.y,
            block.z,
            vineLeftover(this.world.getBlock(block.x, block.y, block.z))
        );

    }

}
