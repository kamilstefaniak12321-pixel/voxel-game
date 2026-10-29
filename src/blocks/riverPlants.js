// Stałe ID zapisów świata. Rośliny wodne zajmują komórkę istniejącej
// wody: nie tworzą osobnej warstwy ani nowej tafli.
function plant(id, name, label, kind, texture, extra = {}) {
    return {
        id, name, label,
        model: 'riverPlant',
        riverPlant: { kind, waterlogged: false },
        solid: false,
        opaque: false,
        sound: 'plant',
        category: 'rosliny',
        ground: ['sand'],
        textures: { all: texture },
        ...extra
    };
}

function aquatic(id, name, label, kind, texture, extra = {}) {
    return plant(id, name, label, kind, texture, {
        liquid: true,
        riverPlant: { kind, waterlogged: true },
        ground: ['sand', 'gravel'],
        ...extra
    });
}

export const RIVER_PLANT_BLOCKS = {
    river_sedge: plant(246, 'River Sedge', 'Turzyca rzeczna', 'sedge', 'reed'),
    cattail: plant(247, 'Cattail', 'Pałka wodna', 'cattail', 'reed'),
    purple_loosestrife: plant(248, 'Purple Loosestrife', 'Krwawnica pospolita', 'loosestrife', 'cornflower'),
    water_milfoil: aquatic(249, 'Water Milfoil', 'Wywłócznik', 'milfoil', 'fern'),
    water_lily: aquatic(250, 'Water Lily', 'Grzybień biały', 'lily', 'clover'),
    duckweed: aquatic(251, 'Duckweed', 'Rzęsa wodna', 'duckweed', 'clover'),
    cattail_water: aquatic(252, 'Water Cattail', 'Pałka wodna (w wodzie)', 'cattail', 'reed', {
        creative: false,
        drops: 'cattail',
        pick: 'cattail'
    })
};
