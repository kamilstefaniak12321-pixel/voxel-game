import * as THREE from 'three';
import { isLiquidId, getRiverPlant, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { riverPlantBounds } from './RiverPlantBounds.js';
import { spritePlantBounds, SPRITE_PLANT_REACH } from './PlantBounds.js';
import { getTorchInfo } from '../blocks/torches.js';
import { getTorchBounds } from '../rendering/TorchGeometry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { shapeInfo } from '../blocks/woodShapes.js';
import { shapeBoxes, connectMask } from '../world/ShapeBoxes.js';

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

// W obrębie komórki DDA tafla ma dwa płaskie trójkąty, rozdzielone
// przekątną fx + fz = 1. Odcinek promienia przecinamy w tym samym
// miejscu, więc nie trafia w powietrze nad płytką lub pochyłą strugą.
function intersectWater(world, origin, direction, x, y, z, start, end, normal) {
    const gapAt = distance => {
        const fx = Math.max(0, Math.min(1, origin.x + direction.x * distance - x));
        const fz = Math.max(0, Math.min(1, origin.z + direction.z * distance - z));
        return origin.y + direction.y * distance - y - waterSurfaceHeight(world, x, y, z, fx, fz);
    };
    let distance = start, gap = gapAt(start);
    if (gap <= 1e-10) return { distance, normal };

    const diagonalSpeed = direction.x + direction.z;
    const diagonal = Math.abs(diagonalSpeed) > 1e-12
        ? (1 - (origin.x - x) - (origin.z - z)) / diagonalSpeed : Infinity;
    const boundaries = diagonal > start && diagonal < end ? [diagonal, end] : [end];
    for (const next of boundaries) {
        const nextGap = gapAt(next);
        if (nextGap <= 1e-10) {
            return {
                distance: distance + (next - distance) * gap / (gap - nextGap),
                // Stawianie bloków korzysta z całkowitej normalnej ściany.
                normal: { x: 0, y: 1, z: 0 }
            };
        }
        distance = next;
        gap = nextGap;
    }
    return null;
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
        // Dotyczy to również płomienia pochylonej pochodni ściennej.
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
                        const torch = getTorchInfo(id);
                        // Duże rośliny z paczek roślin też wystają nad komórkę.
                        const bounds = torch ? getTorchBounds(torch.attach) : river
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

        const waterHit = (start, end, normal) => {
            if (!includeWater) return null;
            const id = this.world.getBlockId(x, y, z);
            if (!isLiquidId(id)) return null;
            const intersection = intersectWater(this.world, origin, dir, x, y, z, start, end, normal);
            return intersection ? { hit: true, block: { x, y, z, type: getBlockTypeById(id) }, ...intersection } : null;
        };

        const initialEnd = Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance);
        const initialPlant = plantHit(0, initialEnd);
        const initialWater = waterHit(0, initialEnd, { x: 0, y: 1, z: 0 });
        if (initialPlant && (!initialWater || initialPlant.distance <= initialWater.distance)) return initialPlant;
        if (initialWater) return initialWater;


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

            // Schody, półbloki, płoty, furtki, stół (0.90.0): celownik trafia
            // tylko w ich pudełka - obok (np. nad półblokiem) leci dalej.
            const shape = shapeInfo(id);
            if (shape) {
                const boxes = shapeBoxes(id, 'outline', shape.kind === 'fence'
                    ? connectMask((a, b, c) => this.world.getBlockId(a, b, c), x, y, z) : 0) ?? [];
                let best = null;
                for (const box of boxes) {
                    const hit = intersectBounds(origin, dir, x, y, z, { min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] }, distance, this.maxDistance);
                    if (hit && (!best || hit.distance < best.distance)) best = hit;
                }
                if (best) {
                    const point = { x: origin.x + dir.x * best.distance, y: origin.y + dir.y * best.distance, z: origin.z + dir.z * best.distance };
                    return { hit: true, block: { x, y, z, type: getBlockTypeById(id) }, normal: best.normal, distance: best.distance, point };
                }
                continue;
            }

            if (getBlockTypeById(id) === 'campfire') {
                const intersection = intersectBounds(origin, dir, x, y, z, { min: [0, 0, 0], max: [1, .5, 1] }, distance, this.maxDistance);
                if (intersection) return { hit: true, block: { x, y, z, type: 'campfire' }, ...intersection };
                continue;
            }

            if (id && !getTorchInfo(id) && !getRiverPlant(id) && !isLiquidId(id)) {

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

                    distance,

                    // Punkt trafienia (0.90.0: górna/dolna połowa ściany -
                    // schody do góry nogami, górny półblok).
                    point: { x: origin.x + dir.x * distance, y: origin.y + dir.y * distance, z: origin.z + dir.z * distance }

                };

            }

            const end = Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance);
            const plant = plantHit(distance, end);
            const water = waterHit(distance, end, { x: normalX, y: normalY, z: normalZ });
            if (plant && (!water || plant.distance <= water.distance)) return plant;
            if (water) return water;

        }


        return {
            hit: false
        };

    }

}
