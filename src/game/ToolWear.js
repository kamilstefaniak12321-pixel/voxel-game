// ------------------------------------------------------------
// ZUŻYCIE SIEKIERY W GRZE (1.39.0, items/toolWear.js, docs/narzedzia.md)
//
//   - cios w drzewo (Felling) i wykopany pień / leżący pień zużywają
//     siekierę - tym bardziej, im twardsze drewno względem skały,
//   - leżący pień cięty BEZ KOZŁÓW zużywa ją dwa razy szybciej
//     (siekiera bije w ziemię - Sawhorses.js),
//   - za miękka siekiera nie zetnie twardego drzewa: gra mówi, jakiej
//     skały trzeba,
//   - gdy siekiera pęknie, w ręce zostaje patyk.
//
// Tylko tryb przygody. Stan trzyma stos (pole `fresh`).
// ------------------------------------------------------------

import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { woodTraits } from '../blocks/woodTraits.js';
import { fuelName } from './CampfireState.js';
import { isWearing, toolHardness, canCut, wearPerChop, conditionOf, wearStage, maxWoodHardness, rockWord, rocksFor } from '../items/toolWear.js';
import { onSawhorses } from './Sawhorses.js';

// Bez kozłów leżący pień zużywa siekierę tyle razy szybciej.
export const NO_SAWHORSE_WEAR = 2;
// Części drzewa, których cięcie zużywa siekierę (pień, okorowany, leżący).
const WOOD_PARTS = new Set(['log', 'stripped', 'lying']);

export class ToolWear {

    constructor(game) {
        this.game = game;
        this.noticeAt = -Infinity;
    }

    get active() { return this.game.mode === 'adventure'; }

    // Czy siekierą w ręce da się ściąć drzewo tego gatunku. Zwraca
    // podpowiedź dla gracza albo null (da się).
    cutCheck(species) {
        const type = this.game.selectedBlock;
        if (!this.active || !isWearing(type)) return null;
        const wood = woodTraits(species).hardness;
        if (canCut(type, wood)) return null;
        const hardness = toolHardness(type);
        return `Siekiera z ${rockWord(type)} jest za miękka na to drzewo (${fuelName(species)}, twardość ${wood}) - bierze drewno do twardości ` +
            `${maxWoodHardness(hardness)}. Potrzeba siekiery z ${rocksFor(wood)}.`;
    }

    // Zużycie za jeden cios w drzewo gatunku `species`.
    forChop(species) {
        const type = this.game.selectedBlock;
        if (!this.active || !isWearing(type)) return 0;
        return wearPerChop(toolHardness(type), woodTraits(species).hardness);
    }

    // Zużycie za wykopanie bloku `type` w miejscu `block` narzędziem
    // `tool` (liczone PRZED usunięciem bloku).
    forBlock(type, block, tool) {
        if (!this.active || tool !== 'axe' || !isWearing(this.game.selectedBlock)) return 0;
        const definition = getBlockDefinition(type);
        if (!definition?.tree || !WOOD_PARTS.has(definition.part)) return 0;
        const wear = wearPerChop(toolHardness(this.game.selectedBlock), woodTraits(definition.tree).hardness);
        const onGround = definition.lying && block && !onSawhorses(this.game.world, block.x, block.y, block.z);
        return wear * (onGround ? NO_SAWHORSE_WEAR : 1);
    }

    // Zabiera siekierze w ręce `amount` stanu. Zwraca 'broke', gdy pękła.
    apply(amount) {
        const game = this.game, inventory = game.inventory;
        if (!(amount > 0) || !this.active || !inventory) return null;
        const index = inventory.selected, item = inventory.slots[index];
        if (!item || !isWearing(item.type)) return null;
        const before = conditionOf(item), count = Math.max(1, item.count);
        // Stos kilku siekier zużywa się wspólnie (jak paliwo w stosie pochodni).
        const after = before - amount / count;
        if (after > 0) {
            item.fresh = after;
            const stage = wearStage(after);
            if (stage !== wearStage(before)) {
                game.onNotice?.(stage === 'chipped' ? 'Siekiera się wyszczerbiła - zostało jej pół życia.' : 'Siekiera pęka - wytrzyma jeszcze kilka ciosów.');
                game.achieve?.('toolWorn', { type: item.type, stage });
            }
            return stage;
        }
        // Pękła: jedna siekiera mniej, reszta stosu jest nowa. Zostaje patyk.
        const type = item.type;
        inventory.take(index, 1);
        const rest = inventory.slots[index];
        if (rest && rest.type === type) delete rest.fresh;
        if (inventory.addItem({ type: 'stick', count: 1 }) > 0) {
            game.drops?.spawn('stick', 1, { x: game.player.pos.x, y: game.player.pos.y + 1, z: game.player.pos.z }, { x: 0, y: 1, z: 0 });
        }
        game.sounds?.play('break_wood', { volume: 0.9, pitch: 1.5 });
        game.onNotice?.('Siekiera pękła - w ręce został patyk.');
        game.achieve?.('toolBroke', { type });
        return 'broke';
    }

}
