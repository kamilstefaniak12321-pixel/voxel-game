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
    getBlockDefinition,
    getAttach,
    getAttachedPlant,
    ATTACH_OFFSETS
} from '../blocks/BlockRegistry.js';
import { getTorchInfo, torchType } from '../blocks/torches.js';

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

}
