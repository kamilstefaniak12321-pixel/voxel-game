// ------------------------------------------------------------
// STÓŁ KRAWIECKI - BLOKI (1.27.0)
//
// Długi na dwa bloki, jak stół stolarski (ten sam kształt - ShapeBoxes:
// 'sewing' rysuje się jak 'table'), ale z jasnym blatem z miarką
// krawiecką. Część A - tu leży materiał (włókno, płótno, ubranie do
// barwienia), część B - wyroby (game/SewingTables.js).
//
// Numery 15500-15507: kierunek (N, E, S, W) x część (A, B). Przedmiotem
// jest "północ, część A" (sewing_table).
// ------------------------------------------------------------

import { registerShape, SHAPE_FACINGS } from './woodShapes.js';

export const SEWING_TABLE = 'sewing_table';
export const SEWING_FIRST_ID = 15500;

export function sewingTableId(facing, part) {
    const f = Math.max(0, SHAPE_FACINGS.indexOf(facing));
    return SEWING_FIRST_ID + f * 2 + (part === 'b' ? 1 : 0);
}

export const sewingTableType = (facing, part) => facing === 'north' && part === 'a' ? SEWING_TABLE : `${SEWING_TABLE}_${facing}_${part}`;

// Obrót wierzchu (ChunkMesher: obrót UV ściany górnej, ćwierćobroty), żeby
// miarka leżała przy przednim brzegu stołu w każdym kierunku (na obrazku
// jest przy dolnym brzegu - w świecie bez obrotu to strona +z).
export const SEWING_TOP_TURN = { north: 2, east: 1, south: 0, west: 3 };

function variants() {
    const out = [];
    for (const facing of SHAPE_FACINGS) for (const part of ['a', 'b']) {
        const type = sewingTableType(facing, part);
        const id = sewingTableId(facing, part);
        out.push([type, {
            id,
            name: 'Sewing Table',
            label: 'Stół krawiecki',
            category: 'ozdoby',
            sound: 'wood',
            hardness: 1.2,
            solid: true,
            opaque: false,
            model: 'shape',
            textures: { top: part === 'a' ? 'sewing_table_top' : 'sewing_table_top_b', side: 'birch_planks', bottom: 'birch_planks' },
            pick: SEWING_TABLE,
            drops: SEWING_TABLE,
            ...(type === SEWING_TABLE ? {} : { inventory: false, creative: false })
        }]);
        registerShape(id, { type, kind: 'sewing', facing, part, topTurn: SEWING_TOP_TURN[facing] });
    }
    return out;
}

export const SEWING_TABLE_BLOCKS = Object.fromEntries(variants());
