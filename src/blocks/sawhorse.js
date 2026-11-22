// ------------------------------------------------------------
// KOZIOŁ - BLOK (1.38.0, pomysł Kamila - docs/kozly.md)
//
// Kozioł do cięcia drewna: belka na czterech rozstawionych nogach.
// Stawia się po jednym na obu końcach leżącego pnia - pień między nimi
// "leży na kozłach" (game/Sawhorses.js).
//
// Numery (zakres stanowisk pracy 15500-15599): 15510 - belka wzdłuż X
// (przedmiot "sawhorse"), 15511 - belka wzdłuż Z.
// ------------------------------------------------------------

import { registerShape } from './woodShapes.js';

export const SAWHORSE = 'sawhorse';
export const SAWHORSE_Z = 'sawhorse_z';
export const SAWHORSE_FIRST_ID = 15510;

// Kozioł z belką wzdłuż osi 'x' albo 'z'.
export const sawhorseType = (axis) => (axis === 'z' ? SAWHORSE_Z : SAWHORSE);

function variants() {
    return [[SAWHORSE, 'north'], [SAWHORSE_Z, 'east']].map(([type, facing], index) => {
        const id = SAWHORSE_FIRST_ID + index;
        registerShape(id, { type, kind: 'sawhorse', facing });
        return [type, {
            id,
            name: 'Sawhorse',
            label: 'Kozioł',
            category: 'ozdoby',
            sound: 'wood',
            hardness: 0.5,
            solid: true,
            opaque: false,
            model: 'shape',
            textures: { all: 'oak_log_side' },
            pick: SAWHORSE,
            drops: SAWHORSE,
            ...(type === SAWHORSE ? {} : { inventory: false, creative: false })
        }];
    });
}

export const SAWHORSE_BLOCKS = Object.fromEntries(variants());

export const isSawhorse = (type) => type === SAWHORSE || type === SAWHORSE_Z;
