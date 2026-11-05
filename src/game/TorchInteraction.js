import { getTorchInfo, torchType } from '../blocks/torches.js';
import { getDyeColor } from '../items/dyes.js';

// PPM barwnikiem. Zwraca true, gdy kliknięcie dotyczy pochodni,
// również dla tego samego koloru (wtedy niczego nie zużywamy).
export function dyeTorch(game, hit, selectedType) {
    const colorKey = getDyeColor(selectedType);
    if (!colorKey || !hit?.hit) return false;
    const { x, y, z } = hit.block;
    const current = getTorchInfo(game.world.getBlock(x, y, z));
    if (!current) return false;
    if (current.colorKey === colorKey) return true;

    if (game.mode === 'adventure') {
        const item = game.inventory.selectedItem;
        if (item?.type !== selectedType || !(item.count > 0)) return true;
    }

    const next = torchType(colorKey, current.attach);
    if (game.world.setBlock(x, y, z, next)) {
        if (game.mode === 'adventure') game.inventory.take(game.inventory.selected, 1);
        game.playBlockSound?.('place', next, hit.block);
    }
    return true;
}
