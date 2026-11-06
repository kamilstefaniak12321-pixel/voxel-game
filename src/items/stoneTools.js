// Appearance only: every stone keeps the same tool speed and interactions.
// Existing item names remain the ordinary-stone variants for old saves.
export const STONE_TOOL_MATERIALS = Object.freeze([
    { stone: 'stone', label: 'kamień', texture: 'stone', adjective: ['kamienna', 'kamienny'] },
    { stone: 'granite', label: 'granit', texture: 'granite', adjective: ['granitowa', 'granitowy'] },
    { stone: 'limestone', label: 'wapień', texture: 'limestone', adjective: ['wapienna', 'wapienny'] },
    { stone: 'sandstone', label: 'piaskowiec', texture: 'sandstone_side', adjective: ['piaskowcowa', 'piaskowcowy'] },
    { stone: 'slate', label: 'łupek', texture: 'slate_side', adjective: ['łupkowa', 'łupkowy'] },
    { stone: 'basalt', label: 'bazalt', texture: 'basalt_side', adjective: ['bazaltowa', 'bazaltowy'] }
]);

export const STONE_TOOL_KINDS = Object.freeze(['axe', 'pickaxe', 'shovel']);
const TOOL_LABELS = { axe: 'Siekiera', pickaxe: 'Kilof', shovel: 'Łopata' };
const ROCKS = new Set(STONE_TOOL_MATERIALS.map(material => material.stone));

export function stoneToolType(tool, stone = 'stone') {
    return stone === 'stone' ? tool : `${tool}_${stone}`;
}

export const STONE_TOOL_ITEMS = Object.freeze(Object.fromEntries(
    STONE_TOOL_KINDS.flatMap(tool => STONE_TOOL_MATERIALS.slice(1).map(material => {
        const type = stoneToolType(tool, material.stone);
        return [type, { name: `${material.stone} ${tool}`,
            label: `${TOOL_LABELS[tool]} ${material.adjective[tool === 'pickaxe' ? 1 : 0]}`,
            icon: type, tool, stone: material.stone, category: 'narzedzia' }];
    }))
));

export function stoneToolInfo(type) {
    if (STONE_TOOL_KINDS.includes(type)) return { tool: type, stone: 'stone' };
    const item = Object.hasOwn(STONE_TOOL_ITEMS, type ?? '') ? STONE_TOOL_ITEMS[type] : null;
    return item ? { tool: item.tool, stone: item.stone } : null;
}

// Preserve the original mixed-rock recipes. A homogeneous head receives the
// matching material appearance; mixed heads keep the original stone icon.
export function stoneToolResult(tool, grid) {
    const rocks = grid.map(cell => typeof cell === 'string' ? cell : cell?.type).filter(type => ROCKS.has(type));
    const material = rocks.length && rocks.every(type => type === rocks[0]) ? rocks[0] : 'stone';
    return stoneToolType(tool, material);
}
