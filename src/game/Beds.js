// ------------------------------------------------------------
// ŁÓŻKA I POSŁANIA (0.98.0)
//
// Łóżko to dwa bloki: nogi i wezgłowie (woodShapes.js, kind 'bed').
// Ze stołów stolarskich wychodzi sam stelaż; pościel (bedding.js) wkłada
// się osobno:
//
//   - stelaż w ręce + PPM            - stawia stelaż (nogi przy graczu,
//                                      wezgłowie w stronę patrzenia),
//   - pościel w ręce + PPM na stelażu - ścieli łóżko,
//   - pościel w ręce + PPM na ziemi  - kładzie posłanie (kind 'mat'),
//   - PPM na posłaniu albo pościelonym łóżku - sen (game/Sleep.js).
//
// Rozbite łóżko oddaje stelaż i pościel osobno (łup w definicji bloku).
// Ta klasa nie trzyma stanu - wszystko jest w blokach świata.
// ------------------------------------------------------------

import { getBlockTypeById, isReplaceableId, AIR_ID } from '../blocks/BlockRegistry.js';
import { shapeInfo, shapeId, FACING_VECTOR, oppositeFacing, lookFacing } from '../blocks/woodShapes.js';
import { BEDDINGS, beddingOf, matId } from '../blocks/bedding.js';
import { BED_TOP, MAT_TOP } from '../world/ShapeBoxes.js';

// Jak daleko od środka bloku nóg leżą stopy śpiącego (w stronę nóg).
const FEET_OFFSET = 0.3;

export class Beds {

    constructor(game) {
        this.game = game;
    }

    get world() { return this.game.world; }

    cellFree({ x, y, z }) {
        const id = this.world.getBlockId(x, y, z);
        return id === AIR_ID || isReplaceableId(id);
    }

    // Dwa bloki pod łóżko albo posłanie: nogi w target, wezgłowie dalej
    // w stronę patrzenia. null - nie ma miejsca albo podłoża.
    cells(target, yaw, player) {
        const facing = lookFacing(yaw);
        const [dx, dz] = FACING_VECTOR[facing];
        const head = { x: target.x + dx, y: target.y, z: target.z + dz };
        for (const cell of [target, head]) {
            if (!this.cellFree(cell)) return null;
            if (!this.world.isSolid(cell.x, cell.y - 1, cell.z)) return null;
            if (player?.intersectsBlock(cell.x, cell.y, cell.z)) return null;
        }
        return { facing, foot: target, head };
    }

    // Stawia obie części albo nic. ids(part) - numer bloku części.
    placePair(spot, ids) {
        const foot = getBlockTypeById(ids('foot')), head = getBlockTypeById(ids('head'));
        if (!this.world.setBlock(spot.foot.x, spot.foot.y, spot.foot.z, foot)) return false;
        if (!this.world.setBlock(spot.head.x, spot.head.y, spot.head.z, head)) {
            this.world.setBlock(spot.foot.x, spot.foot.y, spot.foot.z, null);
            return false;
        }
        return foot;
    }

    // Stelaż łóżka z danego drewna. Zwraca typ postawionego bloku albo false.
    placeBed(target, wood, yaw, player) {
        const spot = this.cells(target, yaw, player);
        if (!spot) return false;
        return this.placePair(spot, (part) => shapeId(wood, 'bed', { facing: spot.facing, part }));
    }

    // Posłanie na ziemi.
    placeMat(target, bedding, yaw, player) {
        const spot = this.cells(target, yaw, player);
        if (!spot) return false;
        return this.placePair(spot, (part) => matId(bedding, spot.facing, part));
    }

    // Obie części łóżka albo posłania, do którego należy blok:
    // { info, foot, head } albo null.
    whole({ x, y, z }) {
        const info = shapeInfo(this.world.getBlockId(x, y, z));
        if (info?.kind !== 'bed' && info?.kind !== 'mat') return null;
        const [dx, dz] = FACING_VECTOR[info.facing];
        const foot = info.part === 'foot' ? { x, y, z } : { x: x - dx, y, z: z - dz };
        const head = { x: foot.x + dx, y, z: foot.z + dz };
        return { info, foot, head };
    }

    // Po rozbiciu jednej części znika druga (łup dała rozbita).
    broken(position, info) {
        if (info?.kind !== 'bed' && info?.kind !== 'mat') return;
        const [dx, dz] = FACING_VECTOR[info.facing];
        const sign = info.part === 'foot' ? 1 : -1;
        const other = { x: position.x + dx * sign, y: position.y, z: position.z + dz * sign };
        const there = shapeInfo(this.world.getBlockId(other.x, other.y, other.z));
        if (there?.kind === info.kind && there.part !== info.part && there.facing === info.facing) {
            this.world.setBlock(other.x, other.y, other.z, null);
        }
    }

    // Ścieli stelaż pościelą z ręki.
    make(whole, bedding) {
        const { info, foot, head } = whole;
        const game = this.game;
        for (const [cell, part] of [[foot, 'foot'], [head, 'head']]) {
            this.world.setBlock(cell.x, cell.y, cell.z,
                getBlockTypeById(shapeId(info.wood, 'bed', { facing: info.facing, part, bedding })));
        }
        if (game.mode === 'adventure') game.inventory.take(game.inventory.selected, 1);
        game.playBlockSound?.('place', 'short_grass', foot);
        game.achieve?.('bedMade', { wood: info.wood, bedding });
        game.onNotice?.(`Łóżko pościelone (${BEDDINGS[bedding].label.toLowerCase()})`);
        return true;
    }

    // Miejsce do spania na łóżku albo posłaniu: gdzie leżą stopy, w którą
    // stronę i jak tam wygodnie.
    sleepSpot(whole) {
        const { info, foot } = whole;
        const [dx, dz] = FACING_VECTOR[oppositeFacing(info.facing)];
        const bed = info.kind === 'bed';
        return {
            place: bed ? 'bed' : 'mat',
            comfort: bed ? BEDDINGS[info.bedding]?.comfort ?? 0 : 0,
            x: foot.x + 0.5 + dx * FEET_OFFSET,
            y: foot.y + (bed ? BED_TOP : MAT_TOP),
            z: foot.z + 0.5 + dz * FEET_OFFSET,
            // Gracz patrzy w stronę (-sin yaw, -cos yaw): leżąc, w stronę nóg.
            yaw: Math.atan2(-dx, -dz),
            block: foot
        };
    }

    // PPM na łóżku albo posłaniu. true - obsłużone.
    interact(hit, selected) {
        if (!hit?.hit) return false;
        const whole = this.whole(hit.block);
        if (!whole) return false;
        const { info } = whole;
        if (info.kind === 'bed' && !info.bedding) {
            const bedding = beddingOf(selected);
            if (bedding) return this.make(whole, bedding);
            this.game.onNotice?.('Sam stelaż - pościel go: PPM z pościelą w ręce');
            return true;
        }
        this.game.sleep?.start(this.sleepSpot(whole));
        return true;
    }
}
