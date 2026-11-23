// ------------------------------------------------------------
// PO POŻARZE (1.43.0, docs/pozar.md)
//
//   zwęglony pień (16303) - stoi po spalonym drzewie średniej grubości;
//     kruchy, wyłamany daje węgiel drzewny,
//   popiół (16304)        - płaska warstwa na ziemi po drzewie, które
//     spłonęło całe; zebrany jest nawozem jak kompost.
//
// Numery raz nadane zostają (docs/numery-blokow.md).
// ------------------------------------------------------------

export const CHARRED_LOG_ID = 16303;
export const ASH_LAYER_ID = 16304;
export const CHARRED_LOG = 'charred_log';
export const ASH_LAYER = 'ash_layer';
export const CHARCOAL = 'charcoal';
export const ASH = 'ash';

export function burntBlocks() {
    return {
        [CHARRED_LOG]: {
            id: CHARRED_LOG_ID,
            name: 'Charred Log',
            label: 'Zwęglony pień',
            // Nie 'log': to nie pień żywego drzewa ani kłoda do przepisów.
            part: 'charred',
            sound: 'wood',
            solid: true,
            hardness: 1.1,
            textures: { top: 'charred_log_top', bottom: 'charred_log_top', side: 'charred_log_side' },
            drops: CHARCOAL,
            pick: CHARCOAL,
            inventory: false,
            creative: false
        },
        [ASH_LAYER]: {
            id: ASH_LAYER_ID,
            name: 'Ash',
            label: 'Popiół',
            sound: 'sand',
            solid: false,
            replaceable: true,
            model: 'flat',
            flat: { attach: 'down' },
            hardness: 0.2,
            textures: { all: 'ash_layer' },
            randomRotation: ['top'],
            drops: ASH,
            pick: ASH,
            inventory: false,
            creative: false
        }
    };
}
