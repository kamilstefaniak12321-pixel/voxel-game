import * as THREE from 'three';


export class VoxelRaycast {

    constructor(world, maxDistance) {

        this.world = world;
        this.maxDistance = maxDistance;

        this.origin = new THREE.Vector3();
        this.direction = new THREE.Vector3();

    }


    castFromCamera(camera) {

        camera.getWorldPosition(this.origin);
        camera.getWorldDirection(this.direction);

        return this.cast(
            this.origin,
            this.direction
        );

    }


    cast(origin, direction) {

        const dir = direction.clone().normalize();


        let x = Math.floor(origin.x);
        let y = Math.floor(origin.y);
        let z = Math.floor(origin.z);


        const stepX =
            dir.x > 0 ? 1 :
            dir.x < 0 ? -1 : 0;

        const stepY =
            dir.y > 0 ? 1 :
            dir.y < 0 ? -1 : 0;

        const stepZ =
            dir.z > 0 ? 1 :
            dir.z < 0 ? -1 : 0;


        const tDeltaX =
            stepX !== 0
                ? Math.abs(1 / dir.x)
                : Infinity;

        const tDeltaY =
            stepY !== 0
                ? Math.abs(1 / dir.y)
                : Infinity;

        const tDeltaZ =
            stepZ !== 0
                ? Math.abs(1 / dir.z)
                : Infinity;


        const nextBoundaryX =
            stepX > 0 ? x + 1 : x;

        const nextBoundaryY =
            stepY > 0 ? y + 1 : y;

        const nextBoundaryZ =
            stepZ > 0 ? z + 1 : z;


        let tMaxX =
            stepX !== 0
                ? (nextBoundaryX - origin.x) / dir.x
                : Infinity;

        let tMaxY =
            stepY !== 0
                ? (nextBoundaryY - origin.y) / dir.y
                : Infinity;

        let tMaxZ =
            stepZ !== 0
                ? (nextBoundaryZ - origin.z) / dir.z
                : Infinity;


        let distance = 0;


        while (distance <= this.maxDistance) {

            let normalX = 0;
            let normalY = 0;
            let normalZ = 0;


            if (
                tMaxX < tMaxY &&
                tMaxX < tMaxZ
            ) {

                x += stepX;

                distance = tMaxX;

                tMaxX += tDeltaX;

                normalX = -stepX;

            }

            else if (tMaxY < tMaxZ) {

                y += stepY;

                distance = tMaxY;

                tMaxY += tDeltaY;

                normalY = -stepY;

            }

            else {

                z += stepZ;

                distance = tMaxZ;

                tMaxZ += tDeltaZ;

                normalZ = -stepZ;

            }


            if (distance > this.maxDistance) {
                break;
            }


            const blockType =
                this.world.getBlock(x, y, z);


            if (blockType !== null) {

                return {

                    hit: true,

                    block: {
                        x,
                        y,
                        z,
                        type: blockType
                    },

                    normal: {
                        x: normalX,
                        y: normalY,
                        z: normalZ
                    },

                    distance

                };

            }

        }


        return {
            hit: false
        };

    }

}