// Kafelki ikonek owoców przerysowane w 1.28.0 na prośbę Kamila
// (tools/owoce_ikony.py: TILES i pieczone z ROASTED). Testy pilnujące, żeby
// stare piksele się nie zmieniły (sprawdz_atlasy_tekstur, sprawdz_drzewa_*),
// je pomijają - nowe ikonki sprawdza sprawdz_ikonek_owocow.mjs.
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./owoce_ikony.py', import.meta.url), 'utf8');
const start = source.indexOf('TILES = {');
const block = source.slice(start, source.indexOf('}', start));
export const FRUIT_ICON_TILES = [...block.matchAll(/'[a-z_]+': '([a-z_/.]+)'/g)].map((m) => m[1]);
export const ROASTED_ICON_TILES = ['roasted_pumpkin_slice', 'roasted_zucchini'];
export const REDRAWN_ICONS = new Set([...FRUIT_ICON_TILES, ...ROASTED_ICON_TILES]);
