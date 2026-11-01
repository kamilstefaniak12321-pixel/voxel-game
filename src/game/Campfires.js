import { newCampfire, restoreCampfire, updateCampfire, addFirewood, addTinder,
    fuelWood, isTinder, campfireDrops } from './CampfireState.js';
import { getBlockId, isLiquidId, isSolidId } from '../blocks/BlockRegistry.js';
import { CampfireRenderer } from '../rendering/CampfireRenderer.js';

const keyOf = ({x, y, z}) => `${x},${y},${z}`;

export class Campfires {
    constructor(game, saved = []) {
        this.game = game;
        this.fires = new Map();
        this.version = 0;
        this.clock = 0;
        this.noticeAt = -10;
        for (const value of Array.isArray(saved) ? saved : []) {
            const fire = restoreCampfire(value);
            if (fire) this.fires.set(keyOf(fire), fire);
        }
        this.renderer = new CampfireRenderer(game);
    }

    get(position) { return position ? this.fires.get(keyOf(position)) : null; }
    getState() { return [...this.fires.values()].map(fire => structuredClone(fire)); }
    drops(position) { return campfireDrops(this.get(position)); }
    notice(text) {
        if (this.clock - this.noticeAt > .8) { this.game.onNotice?.(text); this.noticeAt = this.clock; }
    }
    consume() {
        if (this.game.mode === 'adventure') this.game.inventory.take(this.game.inventory.selected, 1);
        this.version++;
    }

    interact(hit, type) {
        const game = this.game, world = game.world, wood = fuelWood(type);
        if (!hit?.hit) return false;
        let fire = this.get(hit.block);
        if (hit.block.type === 'campfire') {
            // Recover a harmless empty structure if an old/modded save has no metadata.
            if (!fire) { fire = newCampfire(hit.block.x, hit.block.y, hit.block.z); this.fires.set(keyOf(fire), fire); }
            if (wood) {
                if (addFirewood(fire, wood)) { this.consume(); game.playBlockSound('place', 'oak_log', fire); }
                else this.notice(fire.phase === 'unlit' ? 'Jest już 6 polan. Dodaj trawę na podpałkę.' : 'Poczekaj, aż polana opadną w żar.');
            } else if (isTinder(type)) {
                if (addTinder(fire, type)) { this.consume(); game.playBlockSound('place', type, fire); }
                else this.notice(fire.logs.length < 6 ? `Najpierw opał: ${fire.logs.length}/6` : 'Podpałka jest już gotowa lub ognisko płonie.');
            } else if (type === 'fire_starter') {
                if (fire.phase === 'unlit' && (fire.logs.length < 6 || !fire.tinder)) this.notice(`Potrzeba 6 polan i trawy (${fire.logs.length}/6).`);
            } else this.notice(this.description(fire));
            return true;
        }
        if (!wood) return false;
        const target = game.placer.targetOf(hit, 'campfire');
        if (!target || isLiquidId(world.getBlockId(target.x, target.y, target.z)) ||
            !isSolidId(world.getBlockId(target.x, target.y - 1, target.z))) {
            this.notice('Ułóż opał na suchym, stałym podłożu.'); return true;
        }
        if (game.placer.placeBlock(hit, 'campfire')) {
            fire = newCampfire(target.x, target.y, target.z);
            addFirewood(fire, wood); this.fires.set(keyOf(fire), fire); this.consume();
            game.playBlockSound('place', 'oak_log', fire);
            this.notice('Opał 1/6. Dokładaj polana PPM.');
        }
        return true;
    }

    description(fire) {
        if (fire.phase === 'burning') return 'Ognisko płonie';
        if (fire.phase === 'collapsing') return 'Polana opadają w żar';
        if (fire.ignition > 0) return `Rozpalanie: ${Math.round(fire.ignition * 100)}% — trzymaj PPM`;
        if (fire.logs.length < 6) return `Opał ${fire.logs.length}/6 — dokładaj PPM`;
        return fire.tinder ? 'Przytrzymaj PPM starterem ognia' : 'Dodaj trawę na podpałkę';
    }

    update(dt, holding) {
        this.clock += dt;
        const game = this.game, hit = game.currentHit;
        for (const [key, fire] of this.fires) {
            const chunk = game.world.getChunk(game.world.toChunkCoord(fire.x), game.world.toChunkCoord(fire.z));
            if (chunk && game.world.getBlockId(fire.x, fire.y, fire.z) !== getBlockId('campfire')) {
                this.fires.delete(key); this.version++; continue;
            }
            const active = holding && hit?.hit && keyOf(hit.block) === key && game.selectedBlock === 'fire_starter';
            const phase = fire.phase;
            updateCampfire(fire, dt, active);
            if (phase !== fire.phase) {
                this.version++;
                if (active && fire.phase === 'burning') {
                    this.noticeAt = -10;
                    this.notice('Ognisko rozpalone');
                }
            }
            if (active && fire.ignition > 0 && fire.phase === 'unlit') {
                this.notice(this.description(fire));
                if (Math.floor(this.clock * 5) !== Math.floor((this.clock - dt) * 5)) game.swingArm();
            }
        }
        this.renderer.update(dt, this.fires, this.clock);
    }

    dispose() { this.renderer.dispose(); this.fires.clear(); }
}
