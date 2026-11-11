import {
    isLiquidId,
    isPlantId,
    canPlantStay,
    getRiverPlant,
    isWaterloggedPlantId,
    isWaterSourceId,
    isSolidId,
    isReplaceableId,
    getBlockId,
    getBlockTypeById,
    getBlockDefinition,
    getAttach,
    getAttachedPlant,
    ATTACH_OFFSETS
} from '../blocks/BlockRegistry.js';
import { getTorchInfo, torchType } from '../blocks/torches.js';
import { chestFacingForYaw } from '../blocks/chest.js';
import { shapeItem, shapeId, shapeInfo, lookFacing, oppositeFacing } from '../blocks/woodShapes.js';

// ------------------------------------------------------------
// STAWIANIE BLOKÓW
//
// Blok staje obok wskazanej ściany. Wyjątki:
//   - wskazany blok jest "do zastąpienia" (np. trawa) - nowy blok
//     staje w jego miejscu,
//   - roślina staje tylko na ziemi (blok z soil: true pod spodem),
//   - płaska dekoracja (model 'flat') potrzebuje pełnego bloku, do
//     którego przylega (opadłe liście - pod spodem, wieniec - za
//     sobą); wieniec wisi tylko na bokach bloków, w wersji zwróconej
//     od klikniętej ściany (pole wall),
//   - ciecz (woda) jest zastępowana.
// ------------------------------------------------------------

// Kliknięta ściana (normalna) -> strona, po której jest oparcie.

function wallSide(normal) {

    if (normal.z === 1) return 'north';
    if (normal.z === -1) return 'south';
    if (normal.x === 1) return 'west';
    if (normal.x === -1) return 'east';

    return null;

}

export class BlockPlacer {

    constructor(world, player) {

        this.world = world;
        this.player = player;

    }


    // Gdzie stanie blok po kliknięciu we wskazany blok (albo null).

    targetOf(hit, blockType = null) {

        if (!hit || !hit.hit) {
            return null;
        }

        const block = hit.block;

        const hitId = this.world.getBlockId(block.x, block.y, block.z);
        const river = getRiverPlant(getBlockId(blockType));

        if (isReplaceableId(hitId) || (river && isLiquidId(hitId) && !isWaterloggedPlantId(hitId))) {
            return { x: block.x, y: block.y, z: block.z };
        }

        return {
            x: block.x + hit.normal.x,
            y: block.y + hit.normal.y,
            z: block.z + hit.normal.z
        };

    }


    // Postawiony blok (nazwa - np. wieniec w wersji na tę ścianę)
    // albo false.

    placeBlock(hit, blockType) {

        // Schody, półbloki, płoty, furtki (0.90.0) - kierunek i połowa.
        const item = shapeItem(blockType);
        if (item?.kind === 'door') return false; // drzwi - CarpenterTables.placeDoor (dwa bloki)
        if (item && item.kind !== 'table') {
            const shaped = this.shapeVariant(hit, item);
            if (!shaped) return false;
            if (shaped.merge) {
                if (this.player?.intersectsBlock(shaped.merge.x, shaped.merge.y, shaped.merge.z)) return false;
                return this.world.setBlock(shaped.merge.x, shaped.merge.y, shaped.merge.z, shaped.type) ? shaped.type : false;
            }
            blockType = shaped.type;
        }

        const target = this.targetOf(hit, blockType);

        if (!target) {
            return false;
        }

        const { x, y, z } = target;


        // Wieniec: wersja zwrócona od klikniętej ściany (nie na górze
        // ani na spodzie bloku).

        const torch = getTorchInfo(blockType);
        const wall = getBlockDefinition(blockType)?.wall;

        if (torch) {
            // Pochodnia stoi na podłożu albo na ścianie. Zastępowana
            // roślina ma podparcie na dole, niezależnie od jej trafionej strony.
            const replacing = isReplaceableId(this.world.getBlockId(hit.block.x, hit.block.y, hit.block.z));
            const attach = replacing || hit.normal.y === 1 ? 'down' : wallSide(hit.normal);
            if (!attach) return false;
            blockType = torchType(torch.colorKey, attach);
        }
        else if (wall) {

            const side = wallSide(hit.normal);

            if (!side) {
                return false;
            }

            blockType = wall[side];

        }

        // Skrzynia: przodem do gracza.

        const facings = getBlockDefinition(blockType)?.facings;

        if (facings) {
            blockType = facings[chestFacingForYaw(this.player?.yaw ?? 0)];
        }

        const id = this.world.getBlockId(x, y, z);
        // Płomień nie wypiera wody ani wodnej rośliny.
        if (torch && (isLiquidId(id) || isWaterloggedPlantId(id))) return false;

        // Jedna sadzonka pałki ma suchą i płytkowodną postać.
        if (blockType === 'cattail' && isWaterSourceId(id)) {
            blockType = 'cattail_water';
        }

        const plantId = getBlockId(blockType);
        const river = getRiverPlant(plantId);

        if (river) {
            // Nigdy nie tworzymy wody przez postawienie wodnej rośliny
            // w powietrzu ani nie nadpisujemy innej posadzonej rośliny.
            if (isWaterloggedPlantId(id)) return false;
            if (river.waterlogged) {
                // Roślina przechowuje pełne źródło. Posadzenie jej w
                // strudze nie może zamieniać przepływu w nową wodę.
                if (!isWaterSourceId(id)) return false;
            }
            else if (isLiquidId(id)) return false;
        }


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
            isPlantId(plantId) &&
            !canPlantStay(plantId, this.world.getBlockId(x, y - 1, z), this.world.getBlockId(x, y + 1, z))
        ) {
            return false;
        }

        // Porost i huba - przy ścianie (porost także na ziemi i pod
        // sufitem), nie w pustym powietrzu.

        const attached = getAttachedPlant(plantId);

        if (attached && !this.world.attachedPlantSupported(x, y, z, attached)) {
            return false;
        }


        // Dekoracja musi się o coś opierać.

        const attach = getAttach(getBlockId(blockType));

        if (attach) {

            const [dx, dy, dz] = ATTACH_OFFSETS[attach];

            if (!isSolidId(this.world.getBlockId(x + dx, y + dy, z + dz))) {
                return false;
            }

        }


        // Gracz nie może zastawić sam siebie (rośliny i dekoracje go
        // nie blokują).

        if (
            !isPlantId(getBlockId(blockType)) &&
            !attach &&
            this.player.intersectsBlock(x, y, z)
        ) {
            return false;
        }


        // Tylko wtedy, gdy świat naprawdę się zmienił
        // (np. ponad limitem wysokości blok się nie postawi).

        return this.world.setBlock(x, y, z, blockType) ? blockType : false;

    }


    // Wariant wyrobu stolarskiego: { type } albo { type, merge } - drugi
    // półblok tego samego drewna dopełnia pierwszy do pełnego bloku.
    shapeVariant(hit, { wood, kind }) {

        if (!hit?.hit) return null;

        const yaw = this.player?.yaw ?? 0;
        const look = lookFacing(yaw);
        const normal = hit.normal ?? { x: 0, y: 0, z: 0 };
        const fraction = hit.point ? hit.point.y - Math.floor(hit.point.y) : 0;
        // Górna połowa: klik w spód bloku albo w górną połowę ściany.
        const upper = normal.y === -1 || (normal.y === 0 && fraction > 0.5);

        if (kind === 'slab') {
            // Klik w półblok tego drewna od strony jego pustej połowy.
            const hitInfo = shapeInfo(this.world.getBlockId(hit.block.x, hit.block.y, hit.block.z));
            if (hitInfo?.kind === 'slab' && hitInfo.wood === wood &&
                ((hitInfo.half === 'bottom' && normal.y === 1) || (hitInfo.half === 'top' && normal.y === -1))) {
                return { type: getBlockTypeById(shapeId(wood, 'slab', { half: 'double' })), merge: hit.block };
            }
            // Albo w miejsce, gdzie już leży półblok tego drewna (druga połowa).
            const target = this.targetOf(hit);
            const there = target ? shapeInfo(this.world.getBlockId(target.x, target.y, target.z)) : null;
            if (there?.kind === 'slab' && there.wood === wood && there.half !== 'double') {
                return { type: getBlockTypeById(shapeId(wood, 'slab', { half: 'double' })), merge: target };
            }
            return { type: getBlockTypeById(shapeId(wood, 'slab', { half: upper ? 'top' : 'bottom' })) };
        }

        if (kind === 'stairs') {
            return { type: getBlockTypeById(shapeId(wood, 'stairs', { facing: look, half: upper ? 'top' : 'bottom' })) };
        }

        if (kind === 'gate') {
            return { type: getBlockTypeById(shapeId(wood, 'gate', { facing: look })) };
        }

        if (kind === 'trapdoor') {
            // Zawias przy klikniętej ścianie; na podłodze i suficie - od
            // strony gracza.
            const wall = normal.x > 0 ? 'west' : normal.x < 0 ? 'east' : normal.z > 0 ? 'north' : normal.z < 0 ? 'south' : null;
            return { type: getBlockTypeById(shapeId(wood, 'trapdoor', { facing: wall ?? oppositeFacing(look), half: upper ? 'top' : 'bottom' })) };
        }

        return { type: getBlockTypeById(shapeId(wood, kind)) };

    }

}
