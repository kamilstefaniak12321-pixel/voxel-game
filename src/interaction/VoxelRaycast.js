import * as THREE from 'three';
import { isLiquidId, getRiverPlant, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { riverPlantBounds } from './RiverPlantBounds.js';
import { spritePlantBounds, SPRITE_PLANT_REACH } from './PlantBounds.js';

function intersectBounds(origin, direction, x, y, z, bounds, start, end) {
    let near = -Infinity, far = Infinity;
    const normal = { x: 0, y: 0, z: 0 };
    const position = { x, y, z };
    for (const [index, axis] of ['x', 'y', 'z'].entries()) {
        const min = position[axis] + bounds.min[index], max = position[axis] + bounds.max[index];
        const value = origin[axis], velocity = direction[axis];
        if (Math.abs(velocity) < 1e-12) {
            if (value < min || value > max) return null;
            continue;
        }
        const a = (min - value) / velocity, b = (max - value) / velocity;
        const entry = Math.min(a, b), exit = Math.max(a, b);
        if (entry > near) {
            near = entry;
            normal.x = normal.y = normal.z = 0;
            normal[axis] = velocity > 0 ? -1 : 1;
        }
        far = Math.min(far, exit);
        if (near > far) return null;
    }
    const distance = Math.max(0, start, near);
    return far >= distance && distance <= end ? { distance, normal } : null;
}


export class VoxelRaycast {

    constructor(world, maxDistance) {

        this.world = world;
        this.maxDistance = maxDistance;

        this.origin = new THREE.Vector3();
        this.direction = new THREE.Vector3();

    }


    castFromCamera(camera, includeWater = false) {

        camera.getWorldPosition(this.origin);
        camera.getWorldDirection(this.direction);

        return this.cast(
            this.origin,
            this.direction,
            includeWater
        );

    }


    cast(origin, direction, includeWater = false) {

        const dir = direction.clone().normalize();

        if (dir.lengthSq() === 0) return { hit: false };


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

        // Model może wejść do pustej komórki obok lub nad korzeniami.
        // Sprawdzamy tylko krótki odcinek bieżącej komórki DDA, dlatego
        // roślina za ścianą ani poza zasięgiem nie przechwytuje celu.
        const plantHit = (start, end) => {
            let closest = null;
            for (let px = x - 1; px <= x + 1; px++) {
                for (let pz = z - 1; pz <= z + 1; pz++) {
                    for (let py = y - SPRITE_PLANT_REACH; py <= y; py++) {
                        const id = this.world.getBlockId(px, py, pz);
                        if (!id) continue;
                        const river = getRiverPlant(id);
                        // Duże rośliny z paczek roślin też wystają nad komórkę.
                        const bounds = river
                            ? (py >= y - 1 ? riverPlantBounds(river, px, py, pz) : null)
                            : spritePlantBounds(id, px, py, pz);
                        if (!bounds) continue;
                        const intersection = intersectBounds(origin, dir, px, py, pz,
                            bounds, start, end);
                        if (intersection && (!closest || intersection.distance < closest.distance)) {
                            closest = { hit: true, block: {x:px,y:py,z:pz,type:getBlockTypeById(id)}, ...intersection };
                        }
                    }
                }
            }
            return closest;
        };

        const initialPlant = plantHit(0, Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance));
        if (initialPlant) return initialPlant;


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


            // Zwykła woda przepuszcza celownik, wodną roślinę można
            // zebrać. Taflę wskazujemy osobno tylko podczas sadzenia.
            const id = this.world.getBlockId(x, y, z);

            if (getBlockTypeById(id) === 'campfire') {
                const intersection = intersectBounds(origin, dir, x, y, z, { min: [0, 0, 0], max: [1, .5, 1] }, distance, this.maxDistance);
                if (intersection) return { hit: true, block: { x, y, z, type: 'campfire' }, ...intersection };
                continue;
            }

            if (id && ((!getRiverPlant(id) && !isLiquidId(id)) || (includeWater && isLiquidId(id)))) {

                return {

                    hit: true,

                    block: {
                        x,
                        y,
                        z,
                        type: getBlockTypeById(id)
                    },

                    normal: {
                        x: normalX,
                        y: normalY,
                        z: normalZ
                    },

                    distance

                };

            }

            const plant = plantHit(distance, Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance));
            if (plant) return plant;

        }


        return {
            hit: false
        };

    }

}
