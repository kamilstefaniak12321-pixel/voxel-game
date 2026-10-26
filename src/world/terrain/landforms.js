// ------------------------------------------------------------
// FORMY TERENU - nazwy, grupy i kolory na mapie (/mapa formy)
//
// Generator realistyczny (RealisticGenerator.describe) mówi, jaka
// forma terenu jest w danym miejscu. Tu jest tylko ich lista.
// ------------------------------------------------------------

export const LANDFORMS = {

    // Woda i brzeg
    sea: { name: 'morze', group: 'woda', color: '#2f5fb0' },
    river: { name: 'rzeka', group: 'woda', color: '#3fa9f5' },
    lake: { name: 'jezioro', group: 'woda', color: '#2f80d8' },
    coast: { name: 'wybrzeże (plaża)', group: 'woda', color: '#e8d9a0' },

    // Formy wypukłe
    mountains: { name: 'zbocze gór', group: 'wypukłe', color: '#8a7055' },
    ridge: { name: 'grzbiet', group: 'wypukłe', color: '#5e4632' },
    crag: { name: 'turnia', group: 'wypukłe', color: '#2b2b2b' },
    hill: { name: 'wzgórze', group: 'wypukłe', color: '#b7a25b' },
    hillock: { name: 'pagórek', group: 'wypukłe', color: '#c9c27a' },

    // Formy wklęsłe
    valley: { name: 'dolina', group: 'wklęsłe', color: '#5f9a4c' },
    basin: { name: 'kotlina', group: 'wklęsłe', color: '#9fd06a' },
    ravine: { name: 'wąwóz', group: 'wklęsłe', color: '#c0392b' },
    gully: { name: 'żleb', group: 'wklęsłe', color: '#e67e22' },
    depression: { name: 'depresja', group: 'wklęsłe', color: '#16a085' },

    // Formy płaskie
    plain: { name: 'równina', group: 'płaskie', color: '#a6d96a' },
    flat: { name: 'równia (płaskie miejsce w górach)', group: 'płaskie', color: '#d9ef8b' },
    plateau: { name: 'płaskowyż', group: 'płaskie', color: '#f4a582' },

    // Pozostałe: teren falisty bez wyraźnej formy
    lowland: { name: 'nizina falista', group: 'inne', color: '#7fbf5f' },
    upland: { name: 'wyżyna falista', group: 'inne', color: '#d8c87a' }

};


// Pasy wysokości (bloki nad poziomem morza) - jak na mapach
// fizycznych: niziny, wyżyny, góry.

export const RELIEFS = {
    sea: 'morze',
    depression: 'depresja (poniżej poziomu morza)',
    lowland: 'nizina',
    upland: 'wyżyna',
    mountains: 'góry'
};
