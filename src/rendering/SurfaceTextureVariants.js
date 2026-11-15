import { getBlockId } from '../blocks/BlockRegistry.js';

// These are atlas variants only. Existing block IDs, inventory items and saves
// retain the same meaning; the mesher selects a picture when it builds a face.
export const PINE_TRANSITION_TEXTURES = [
    'pine_log_transition_1', 'pine_log_transition_2', 'pine_log_transition_3'
];
export const MOSS_CARPET_TEXTURES = ['moss_carpet', 'moss_carpet_2', 'moss_carpet_3'];

export const PINE_UPPER_ID = getBlockId('pine_log_upper');
const PINE_LOWER_ID = getBlockId('pine_log');
const PINE_RESIN_ID = getBlockId('pine_log_resin');

// Full-height chunks contain the whole vertical column, even at their X/Z
// boundary. Stop at a gap, stripped log or another species: the transition
// belongs to connected bark, not merely to a brown log somewhere below it.
// 0 = plain orange; 1/2/3 = dense/medium/sparse authored bark overlays.
export function pineBarkTransitionStage(blocks, index, y, layerStride) {
    if (blocks[index] !== PINE_UPPER_ID) return 0;
    for (let distance = 1; distance <= 3 && distance <= y; distance++) {
        const below = blocks[index - distance * layerStride];
        if (below === PINE_LOWER_ID || below === PINE_RESIN_ID) return distance;
        if (below !== PINE_UPPER_ID) break;
    }
    return 0;
}

// Independent of mesh order, chunk coordinates and the existing UV rotation.
// Negative coordinates use the same integer hash as positive coordinates.
export function mossCarpetVariant(x, y, z) {
    let hash = Math.imul(x, 1619) ^ Math.imul(y, 31337) ^ Math.imul(z, 6971) ^ 0x5bd1e995;
    hash = Math.imul(hash ^ (hash >>> 15), 0x45d9f3b);
    hash ^= hash >>> 16;
    return (hash >>> 0) % MOSS_CARPET_TEXTURES.length;
}

// WIERZCH BLOKU TRAWY Z DODATKAMI (1.2.0, pomysł Kamila): co dziewiąty
// blok trawy ma na wierzchu płaski dodatek - kępki, koniczynę, mech,
// stokrotki, mlecze, maki... To tylko inny obrazek tej samej ściany:
// ten sam blok, te same trójkąty, ten sam materiał (zero kosztu rysowania).
// Tekstury rysuje tools/tekstury_trawy.py; nazwa -> kafelek
// 'grass_top_<nazwa>'. Liczba przy nazwie to waga: jak często ten wariant
// trafia się wśród wariantów (rzadkie: łan stokrotek 2, maki 2).
export const GRASS_VARIANT_ONE_IN = 9;

export const GRASS_TOP_VARIANTS = [
    ['trawa_kepki', 14], ['trawa_ciemna', 14], ['trawa_zdzbla', 14],
    ['trawa_sucha', 8], ['trawa_sucha2', 5], ['koniczyna', 10],
    ['koniczyna2', 6], ['koniczyna_biala', 5], ['koniczyna_rozowa', 5],
    ['babka', 7], ['rozeta', 7], ['rozety2', 4],
    ['paprotka', 5], ['mech', 7], ['mech2', 7],
    ['mech_duzy', 3], ['stokrotka', 6], ['stokrotki', 5],
    ['stokrotki_duzo', 2], ['mlecz', 6], ['mlecze', 4],
    ['mlecz_duzy', 3], ['dmuchawce', 3], ['mak', 4],
    ['maki', 2], ['chaber', 4], ['chabry', 2],
    ['fiolki', 4], ['fiolki_duzo', 2], ['jaskry', 5],
    ['niezapominajki', 4], ['wrzos', 3], ['krokusy', 3],
    ['platki', 4], ['laka_zolta', 4], ['laka_czerwona', 3],
    ['laka_fiolet', 3], ['laka_drobna', 4], ['laka_pelna', 2],
    ['poziomki', 2], ['rozeta_kwiat', 3], ['koniczyna_mlecz', 3]
];

// Tekstury wierzchu: [zwykły, wariant 1, wariant 2, ...] - numer z
// grassTopVariant() jest indeksem tej listy.
export const GRASS_TOP_TEXTURES = ['grass_top', ...GRASS_TOP_VARIANTS.map(([name]) => `grass_top_${name}`)];

export const GRASS_ID = getBlockId('grass');

// Losowanie z wagami bez pętli: tablica, w której wariant zajmuje tyle
// pól, ile wynosi jego waga.
const GRASS_PICK = new Uint8Array(GRASS_TOP_VARIANTS.reduce((sum, [, weight]) => sum + weight, 0));
{
    let at = 0;
    GRASS_TOP_VARIANTS.forEach(([, weight], index) => {
        GRASS_PICK.fill(index + 1, at, at + weight);
        at += weight;
    });
}

// 0 = zwykła trawa; 1.. = wariant. Zależy tylko od miejsca bloku
// w świecie (to samo po każdym przebudowaniu chunka, w każdym chunku,
// także po ujemnej stronie świata), niezależnie od obrotu wierzchu.
export function grassTopVariant(x, y, z) {
    let hash = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ 0x2c1b3c6d;
    hash = Math.imul(hash ^ (hash >>> 15), 0x85ebca6b);
    hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
    hash = (hash ^ (hash >>> 16)) >>> 0;
    if (hash % GRASS_VARIANT_ONE_IN !== 0) return 0;
    return GRASS_PICK[((hash / GRASS_VARIANT_ONE_IN) >>> 0) % GRASS_PICK.length];
}
