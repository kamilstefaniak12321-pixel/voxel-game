import * as THREE from 'three';
import { isLiquidId, getRiverPlant, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { riverPlantBounds } from './RiverPlantBounds.js';
import { spritePlantBounds, SPRITE_PLANT_REACH } from './PlantBounds.js';
import { getTorchInfo } from '../blocks/torches.js';
import { getTorchBounds } from '../rendering/TorchGeometry.js';
import { waterSurfaceHeight } from '../world/WaterSurface.js';
import { boundsOf } from '../world/ShapeBoxes.js';
import { cellBoxes, FULL_CELL } from './BlockBounds.js';

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


    // Numer bloku, który gracz widzi: kwiat poza swoją porą roku to
    // niższy etap (World.shownBlockId - src/blocks/plantSeasons.js).
    idAt(x, y, z) {
        const world = this.world;
        return world.shownBlockId ? world.shownBlockId(x, y, z) : world.getBlockId(x, y, z);
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
                        const id = this.idAt(px, py, pz);
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
            const id = this.idAt(x, y, z);
            if (!isLiquidId(id)) return null;
            const intersection = intersectWater(this.world, origin, dir, x, y, z, start, end, normal);
            return intersection ? { hit: true, block: { x, y, z, type: getBlockTypeById(id) }, ...intersection } : null;
        };

        // Blok w bieżącej komórce: trafiamy tylko w jego prawdziwy kształt
        // (interaction/BlockBounds.js) - obok płaskiego mchu, kępki trawy
        // czy półbloku promień leci dalej.
        const blockHit = (id, start, normal) => {
            const boxes = cellBoxes(this.world, id, x, y, z);
            if (!boxes.length) return null;
            let best = null;
            if (boxes === FULL_CELL) {
                // Pełny blok: ściana, przez którą promień wszedł do komórki.
                best = { distance: start, normal };
            }
            else {
                for (const box of boxes) {
                    const hit = intersectBounds(origin, dir, x, y, z,
                        { min: [box[0], box[1], box[2]], max: [box[3], box[4], box[5]] }, start, this.maxDistance);
                    if (hit && (!best || hit.distance < best.distance)) best = hit;
                }
                if (!best) return null;
            }
            return {
                hit: true, block: { x, y, z, type: getBlockTypeById(id) }, normal: best.normal, distance: best.distance,
                // Zasięg trafionego kształtu w komórce - dla ramki.
                bounds: boxes === FULL_CELL ? null : boundsOf(boxes)
            };
        };

        // Najbliższe z: blok komórki, roślina wystająca z sąsiedniej
        // komórki, tafla wody. Punkt trafienia - m.in. górna/dolna połowa
        // ściany przy stawianiu schodów i półbloków (0.90.0).
        const nearest = (...hits) => {
            let best = null;
            for (const hit of hits) if (hit && (!best || hit.distance < best.distance)) best = hit;
            if (best) best.point = { x: origin.x + dir.x * best.distance, y: origin.y + dir.y * best.distance, z: origin.z + dir.z * best.distance };
            return best;
        };

        // Komórka, w której jest oko: pełnego bloku tu nie trafiamy
        // (kamera w bloku), ale mniejszy kształt - tak.
        const initialEnd = Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance);
        const initialId = this.idAt(x, y, z);
        const inside = cellBoxes(this.world, initialId, x, y, z) === FULL_CELL ? null : blockHit(initialId, 0, { x: 0, y: 1, z: 0 });
        const initial = nearest(
            // Oko w samym kształcie (np. w kępce trawy): nie zasłania celu.
            inside && inside.distance > 1e-6 ? inside : null,
            plantHit(0, initialEnd),
            waterHit(0, initialEnd, { x: 0, y: 1, z: 0 }));
        if (initial) return initial;


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
            const id = this.idAt(x, y, z);
            const normal = { x: normalX, y: normalY, z: normalZ };
            const end = Math.min(tMaxX, tMaxY, tMaxZ, this.maxDistance);

            const found = nearest(blockHit(id, distance, normal), plantHit(distance, end), waterHit(distance, end, normal));
            if (found) return found;

        }


        return {
            hit: false
        };

    }

}
