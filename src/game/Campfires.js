import { newCampfire, restoreCampfire, updateCampfire, addFirewood, addTinder,
    fuelWood, isTinder, campfireDrops } from './CampfireState.js';
import { getBlockId, isLiquidId, isSolidId } from '../blocks/BlockRegistry.js';
import { CampfireRenderer } from '../rendering/CampfireRenderer.js';
import { getRoast, ROAST_SECONDS } from '../items/foods.js';
import { getItemLabel } from '../items/ItemRegistry.js';

// Ognisko, nad którym da się piec: płonie albo żarzy się.
const canRoastOn = (fire) => fire.phase === 'burning' || fire.phase === 'collapsing';

const keyOf = ({x, y, z}) => `${x},${y},${z}`;

export class Campfires {
    constructor(game, saved = []) {
        this.game = game;
        this.fires = new Map();
        this.version = 0;
        this.clock = 0;
        this.noticeAt = -10;
        // Pieczenie (trzymany PPM z surowym jedzeniem): { key, type, time }.
        this.roast = null;
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
            } else if (getRoast(type)) {
                // Samo pieczenie liczy update (trzeba trzymać PPM).
                if (!canRoastOn(fire)) this.notice('Żeby coś upiec, ognisko musi płonąć.');
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
        this.updateRoast(dt, holding, hit);
        this.renderer.update(dt, this.fires, this.clock);
    }

    // Pieczenie: trzymany PPM z surowym jedzeniem na płonącym ognisku.
    // Po ROAST_SECONDS jedna sztuka zamienia się w pieczoną.
    updateRoast(dt, holding, hit) {
        const game = this.game, type = game.selectedBlock, roasted = getRoast(type);
        const fire = holding && roasted && hit?.hit && hit.block.type === 'campfire' ? this.get(hit.block) : null;
        if (!fire || !canRoastOn(fire)) { this.roast = null; return; }
        const key = keyOf(fire);
        if (!this.roast || this.roast.key !== key || this.roast.type !== type) {
            this.roast = { key, type, time: 0 };
            game.sounds?.play('sizzle');
        }
        const before = this.roast.time;
        this.roast.time += dt;
        if (Math.floor(this.roast.time * 2.5) !== Math.floor(before * 2.5)) game.swingArm();
        if (Math.floor(this.roast.time / 0.9) !== Math.floor(before / 0.9)) game.sounds?.play('sizzle');
        if (this.roast.time < ROAST_SECONDS) {
            this.notice(`Pieczenie: ${Math.round(this.roast.time / ROAST_SECONDS * 100)}% — trzymaj PPM`);
            return;
        }
        this.roast = null;
        const inventory = game.inventory;
        if (game.mode === 'adventure') inventory.take(inventory.selected, 1);
        this.noticeAt = -10;
        if (inventory.canAdd(roasted)) {
            inventory.add(roasted);
            this.notice(`Gotowe: ${getItemLabel(roasted)}`);
            game.achieve('roasted', { type, into: roasted });
        } else {
            // Nie ma miejsca: surowe wraca do ręki.
            if (game.mode === 'adventure') inventory.add(type);
            this.notice('Ekwipunek pełny');
        }
    }

    dispose() { this.renderer.dispose(); this.fires.clear(); }
}
