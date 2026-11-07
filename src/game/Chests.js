import { getBlockTypeById } from '../blocks/BlockRegistry.js';
import { chestFacing, isChestType } from '../blocks/chest.js';
import { newChest, restoreChest, chestState, isChestEmpty } from './ChestState.js';
import { ChestRenderer } from '../rendering/ChestRenderer.js';

// ------------------------------------------------------------
// SKRZYNIE (0.78.0)
//
// Zawartość każdej skrzyni (ChestState.js) po pozycji bloku - zapisana
// razem ze światem (worldInfo.chests, WorldSaver.js). PPM na skrzyni
// otwiera ekwipunek ze skrzynią w strefie rzemieślniczej (onOpenChest
// - main.js); skrzynię z czymś w środku najpierw trzeba opróżnić, żeby
// ją rozbić (nic nie ginie).
// ------------------------------------------------------------

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;

export class Chests {

    constructor(game, saved = []) {
        this.game = game;
        this.chests = new Map();
        this.version = 0;
        // Skrzynia otwarta w ekwipunku (albo null).
        this.open = null;
        for (const value of Array.isArray(saved) ? saved : []) {
            const chest = restoreChest(value);
            if (chest) this.chests.set(keyOf(chest), chest);
        }
        this.renderer = new ChestRenderer(game, this);
    }

    get(position) { return position ? this.chests.get(keyOf(position)) ?? null : null; }

    // Skrzynia w tym miejscu (pusta, jeśli blok jest, a zapisu nie ma).
    ensure(position) {
        let chest = this.get(position);
        if (!chest && isChestType(this.blockType(position))) {
            chest = newChest(position.x, position.y, position.z);
            this.chests.set(keyOf(chest), chest);
            this.version++;
        }
        return chest;
    }

    blockType({ x, y, z }) {
        return getBlockTypeById(this.game.world.getBlockId(x, y, z));
    }

    facingOf(chest) {
        return chestFacing(this.blockType(chest)) ?? 'north';
    }

    // Wszystkie skrzynie, także puste (bez wpisu model by nie powstał).
    getState() { return [...this.chests.values()].map(chestState); }

    changed() { this.version++; }

    // Czy można rozbić blok (skrzynię - tylko pustą).
    canBreak(position) {
        if (!isChestType(this.blockType(position))) return true;
        return isChestEmpty(this.get(position));
    }

    // PPM na skrzyni - otwiera ją (z Shiftem i blokiem w ręce - stawia obok).
    interact(hit) {
        if (!hit?.hit || !isChestType(hit.block.type)) return false;
        if (this.game.player.crouching && this.game.selectedBlock) return false;
        const chest = this.ensure(hit.block);
        if (!chest) return false;
        if (this.game.onOpenChest) this.game.onOpenChest(chest);
        return true;
    }

    setOpen(chest) {
        if (this.open === chest) return;
        const position = chest ?? this.open;
        this.open = chest;
        if (position) this.game.playBlockSound?.(chest ? 'place' : 'step', 'oak_planks', position);
    }

    update(dt) {
        const world = this.game.world;
        for (const [key, chest] of this.chests) {
            if (!world.getChunk(world.toChunkCoord(chest.x), world.toChunkCoord(chest.z))) continue;
            if (!isChestType(this.blockType(chest))) {
                // Blok zniknął (np. komenda) - pusta skrzynia znika z nim.
                if (this.open === chest) this.open = null;
                this.chests.delete(key);
                this.version++;
            }
        }
        this.renderer.update(dt);
    }

    dispose() { this.renderer.dispose(); }
}
