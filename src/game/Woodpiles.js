// ------------------------------------------------------------
// DREWUTNIA - STOSY POLAN W ŚWIECIE (1.34.0, docs/drewno.md)
//
// Stan: WoodpileState.js, obraz: rendering/WoodpileRenderer.js,
// schnięcie: WoodDrying.js.
//
//   kucnięcie + PPM polanem w ziemię - nowy stos (bez kucania polano
//                                      zakłada ognisko, jak dotąd),
//   PPM polanem w stos               - dokłada jedno polano
//                                      (z kucnięciem - ile się zmieści),
//   PPM pustą ręką                   - zdejmuje jedno polano z wierzchu
//                                      (z kucnięciem - wszystkie tego
//                                      gatunku z wierzchu),
//   PPM czymkolwiek innym            - opis: ile polan i jak mokre,
//   rozbicie stosu                   - oddaje wszystkie polana.
// ------------------------------------------------------------

import { WOODPILE, WOODPILE_CAPACITY, newWoodpile, restoreWoodpile, addLogs, takeLogs, topRun, woodpileDrops, pileWet, pileRoom } from './WoodpileState.js';
import { FIRE_WOODS, fuelWood } from './CampfireState.js';
import { getBlockId, isLiquidId, isSolidId } from '../blocks/BlockRegistry.js';
import { wetOf, isWet, wetWord } from '../items/moisture.js';
import { WoodpileRenderer } from '../rendering/WoodpileRenderer.js';

const keyOf = ({ x, y, z }) => `${x},${y},${z}`;

export class Woodpiles {

    constructor(game, saved = []) {
        this.game = game;
        this.piles = new Map();
        this.version = 0;
        this.clock = 0;
        for (const value of Array.isArray(saved) ? saved : []) {
            const pile = restoreWoodpile(value);
            if (pile) this.piles.set(keyOf(pile), pile);
        }
        this.renderer = new WoodpileRenderer(game);
    }

    get(position) { return position ? this.piles.get(keyOf(position)) : null; }
    getState() { return [...this.piles.values()].map((pile) => structuredClone(pile)); }
    drops(position) { return woodpileDrops(this.get(position)); }
    // Zmiana z sieci (StateSync).
    changed() { this.version++; }
    notice(text) { this.game.onNotice?.(text); }

    // Opis stosu słowami.
    description(pile) {
        if (pile.logs.length === 0) return 'Pusty stos drewna - dokładaj polana PPM';
        const woods = new Map();
        for (const log of pile.logs) woods.set(log.wood, (woods.get(log.wood) ?? 0) + 1);
        const list = [...woods].map(([wood, count]) => `${FIRE_WOODS[wood][0]} ${count}`).join(', ');
        const wet = pileWet(pile), damp = pile.logs.filter((log) => isWet(log.wet ?? 0)).length;
        const state = damp === 0 ? 'suche' : damp === pile.logs.length ? `${wetWord(wet)} (${Math.round(wet * 100)}% wody) - schnie` : `mokrych ${damp} z ${pile.logs.length} - schnie`;
        return `Stos drewna ${pile.logs.length}/${WOODPILE_CAPACITY}: ${list} - ${state}`;
    }

    interact(hit, type, crouching = false) {
        const game = this.game, world = game.world, wood = fuelWood(type);
        if (!hit?.hit) return false;
        const inventory = game.inventory, held = inventory?.selectedItem;

        if (hit.block.type === WOODPILE) {
            let pile = this.get(hit.block);
            // Stos bez wpisu (stary albo zmieniony zapis) - pusty.
            if (!pile) { pile = newWoodpile(hit.block.x, hit.block.y, hit.block.z); this.piles.set(keyOf(pile), pile); }

            if (wood) {
                const have = game.mode === 'adventure' ? held?.count ?? 0 : WOODPILE_CAPACITY;
                const added = addLogs(pile, wood, crouching ? have : 1, wetOf(held?.type === type ? held : null));
                if (added === 0) { this.notice('Stos jest pełny - 16 polan. Ułóż następny obok.'); return true; }
                if (game.mode === 'adventure') inventory.take(inventory.selected, added);
                this.version++;
                game.playBlockSound('place', 'oak_log', pile);
                this.notice(this.description(pile));
                game.achieve?.('woodpile', { count: pile.logs.length, full: pileRoom(pile) === 0 });
            }
            else if (!type) {
                if (pile.logs.length === 0) { this.notice(this.description(pile)); return true; }
                const want = crouching ? topRun(pile) : 1;
                // Tyle, ile zmieści się w ekwipunku.
                const top = pile.logs.at(-1), fresh = top.wet > 0 ? 1 - top.wet : undefined;
                const room = inventory.room(`${top.wood}_firewood`, fresh);
                const stack = takeLogs(pile, Math.min(want, Math.max(room, 0)));
                if (!stack) { this.notice('Ekwipunek pełny'); return true; }
                const left = inventory.addItem(stack);
                // (Stos o innej wilgotności mógł się nie zmieścić - reszta wraca.)
                if (left > 0) addLogs(pile, top.wood, left, stack.fresh === undefined ? 0 : 1 - stack.fresh);
                this.version++;
                game.playBlockSound('break', 'oak_log', pile);
                this.notice(pile.logs.length ? this.description(pile) : 'Stos pusty - rozbij go albo dołóż polana');
            }
            // Z kucnięciem i blokiem w ręce - blok staje obok (jak przy skrzyni).
            else if (crouching) return false;
            else this.notice(this.description(pile));
            return true;
        }

        // Nowy stos: kucnięcie i polano w ziemię.
        if (!wood || !crouching) return false;
        const target = game.placer.targetOf(hit, WOODPILE);
        if (!target || isLiquidId(world.getBlockId(target.x, target.y, target.z)) ||
            !isSolidId(world.getBlockId(target.x, target.y - 1, target.z))) {
            this.notice('Stos drewna ułóż na suchym, stałym podłożu.'); return true;
        }
        if (game.placer.placeBlock(hit, WOODPILE)) {
            // Polana leżą wzdłuż spojrzenia - od przodu widać ich czoła.
            const yaw = game.player?.yaw ?? 0;
            const pile = newWoodpile(target.x, target.y, target.z, Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? 'x' : 'z');
            addLogs(pile, wood, 1, wetOf(held?.type === type ? held : null));
            this.piles.set(keyOf(pile), pile);
            if (game.mode === 'adventure') inventory.take(inventory.selected, 1);
            this.version++;
            game.playBlockSound('place', 'oak_log', pile);
            this.notice('Stos drewna 1/16 - dokładaj polana PPM (kucając: wszystkie naraz). Pod dachem nie zmoknie.');
            game.achieve?.('woodpile', { count: 1, full: false });
        }
        return true;
    }

    update(dt) {
        this.clock += dt;
        const game = this.game, id = getBlockId(WOODPILE);
        for (const [key, pile] of this.piles) {
            const chunk = game.world.getChunk(game.world.toChunkCoord(pile.x), game.world.toChunkCoord(pile.z));
            if (chunk && game.world.getBlockId(pile.x, pile.y, pile.z) !== id) { this.piles.delete(key); this.version++; }
        }
        this.renderer.update(dt, this.piles);
    }

    dispose() { this.renderer.dispose(); this.piles.clear(); }

}
