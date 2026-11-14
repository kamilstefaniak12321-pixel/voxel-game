// ------------------------------------------------------------
// OZDOBY NA ŚCIANĘ (0.98.1)
//
// Płaska ozdoba (model 'flat') wisi na ścianie, do której się ją
// przyłożyło - jak wieniec świerkowy (blocks/trees.js). Każda ma cztery
// bloki, po jednym na stronę ściany; w ekwipunku jest tylko pierwszy.
//
// Nowa ozdoba: wpis w WALL_DECORATIONS (cztery wolne numery z zakresu
// bloków gry 256-999, tekstura w atlasie) i przepis w crafting/recipes.js.
// ------------------------------------------------------------

const SIDES = ['north', 'south', 'east', 'west'];

export const WALL_DECORATIONS = {
    // Wianek z czterech dowolnych kwiatów (grupa #flowers).
    flower_wreath: { firstId: 257, name: 'Flower Wreath', label: 'Wianek z kwiatów', texture: 'flower_wreath', sound: 'plant' }
};

function wallBlocks(base, { firstId, name, label, texture, sound }) {
    const types = Object.fromEntries(SIDES.map((side) => [side, side === 'north' ? base : `${base}_${side}`]));
    return SIDES.map((side, index) => [types[side], {
        id: firstId + index,
        name,
        label,
        sound,
        solid: false,
        model: 'flat',
        flat: { attach: side },
        wall: types,
        textures: { all: texture },
        category: 'ozdoby',
        creative: side === 'north',
        drops: base,
        pick: base
    }]);
}

export const DECORATION_BLOCKS = Object.fromEntries(
    Object.entries(WALL_DECORATIONS).flatMap(([base, definition]) => wallBlocks(base, definition)));
