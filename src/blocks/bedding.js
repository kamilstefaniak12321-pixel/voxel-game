// ------------------------------------------------------------
// POŚCIEL I POSŁANIA (0.98.0)
//
// Pościel to przedmiot z dwoma zastosowaniami:
//   - PPM na stelażu łóżka (woodShapes.js, kind 'bed') - ścieli łóżko,
//   - PPM na ziemi - kładzie posłanie (dwa bloki długości, bez stelaża).
//
// BEDDINGS - rodzaje pościeli. Nową pościel dopisz tutaj i do
// BED_BEDDINGS w woodShapes.js (tam jest kolejność numerów bloków);
// potrzebuje jeszcze tekstury bedding_<nazwa> i przepisu.
//
//   label    - nazwa przedmiotu,
//   comfort  - wygoda (1 - zwykła, 2 - najlepsza): premia po nocy
//              w pościelonym łóżku (game/Sleep.js, Wellbeing.sleep),
//   texture  - kafelek atlasu.
//
// Posłania: numery 12460-12491 - pościel (4 miejsca) x kierunek (4) x
// część (nogi, wezgłowie). Przedmiotem jest posłanie "north, nogi".
// ------------------------------------------------------------

import { registerShape, bedVariant, BED_BEDDINGS, BED_PARTS, SHAPE_FACINGS } from './woodShapes.js';

export const BEDDINGS = {
    straw: { label: 'Słomiana pościel', comfort: 1, texture: 'bedding_straw', sound: 'grass' },
    linen: { label: 'Lniana pościel', comfort: 2, texture: 'bedding_linen', sound: 'grass' }
};

export const MAT_FIRST_ID = 12460;
export const MATS_PER_BEDDING = 8;

export const beddingItem = (bedding) => `${bedding}_bedding`;

// Przedmiot -> rodzaj pościeli albo null.
export function beddingOf(type) {
    const name = typeof type === 'string' && type.endsWith('_bedding') ? type.slice(0, -'_bedding'.length) : null;
    return name && Object.hasOwn(BEDDINGS, name) ? name : null;
}

export function matId(bedding, facing = 'north', part = 'foot') {
    const slot = BED_BEDDINGS.indexOf(bedding);
    if (slot < 1) return 0;
    // bedVariant liczy miejsce pościeli w ostatnich dwóch bitach - tu
    // pościel wybiera cały zakres, więc bierzemy odmianę bez pościeli.
    return MAT_FIRST_ID + (slot - 1) * MATS_PER_BEDDING + bedVariant(facing, part, null) / 4;
}

function mats(bedding) {
    const data = BEDDINGS[bedding];
    const base = beddingItem(bedding);
    const out = [];
    for (const facing of SHAPE_FACINGS) for (const part of BED_PARTS) {
        const first = facing === 'north' && part === 'foot';
        const type = first ? base : `${base}_${facing}_${part}`;
        const id = matId(bedding, facing, part);
        out.push([type, {
            id,
            name: `${bedding} bedding`,
            label: data.label,
            category: 'ozdoby',
            sound: data.sound,
            hardness: 0.3,
            solid: true,
            opaque: false,
            model: 'shape',
            textures: { all: data.texture },
            pick: base,
            drops: base,
            ...(first ? {} : { inventory: false, creative: false })
        }]);
        registerShape(id, { type, kind: 'mat', facing, part, bedding });
    }
    return out;
}

export const BEDDING_BLOCKS = Object.fromEntries(Object.keys(BEDDINGS).flatMap(mats));
