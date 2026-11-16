// ------------------------------------------------------------
// SKRZYNIA - BLOK (0.81.0, od 0.89.0 z każdego rodzaju desek)
//
// Cztery numery - przód skrzyni zwrócony na północ, wschód, południe
// albo zachód (w stronę gracza, który ją postawił). W ekwipunku jest
// jedna "Skrzynia" (chest - przodem na północ); BlockPlacer wybiera
// wersję po kierunku patrzenia (pole facings).
// Model rysuje ChestRenderer.js (ChestGeometry.js - ten sam model co
// ikonka i widok w ekwipunku); mesher chunków go pomija (model 'chest').
// Zawartość - ChestState.js / Chests.js.
// ------------------------------------------------------------

import { WOODS } from './woods.js';
import { WOODS_IN_FIRST_RANGES, WOOD_BLOCK_FIRST_ID, WOOD_BLOCK_IDS, WOOD_BLOCK_CHEST } from './woodShapes.js';

export const CHEST_FACINGS = ['north', 'east', 'south', 'west'];
export const CHEST_FIRST_ID = 10095;

// Skrzynie z każdego rodzaju desek (0.89.0): numery 10200-10299, po cztery
// (kierunki) na drewno. Kolejność = numery w zapisie świata - tylko
// dopisywać na końcu. Tekstury: chest_<drewno> (tools/skrzynia_tekstura.py).
export const WOOD_CHEST_FIRST_ID = 10200;
export const WOOD_CHESTS = [
    { wood: 'spruce', planks: 'spruce_planks', planksTexture: 'spruce_planks', label: 'Skrzynia świerkowa' },
    { wood: 'pine', planks: 'pine_planks', planksTexture: 'pine_planks', label: 'Skrzynia sosnowa' },
    { wood: 'beech', planks: 'beech_planks', planksTexture: 'beech_planks', label: 'Skrzynia bukowa' },
    { wood: 'linden', planks: 'linden_planks', planksTexture: 'linden_planks', label: 'Skrzynia lipowa' },
    { wood: 'birch', planks: 'birch_planks', planksTexture: 'birch_planks', label: 'Skrzynia brzozowa' },
    { wood: 'dark', planks: 'dark_planks', planksTexture: 'dark_planks', label: 'Ciemna skrzynia' },
    { wood: 'jablon', planks: 'jablon_planks', planksTexture: 'jablon/deski.png', label: 'Skrzynia jabłoniowa' },
    { wood: 'olcha', planks: 'olcha_planks', planksTexture: 'olcha/deski.png', label: 'Skrzynia olchowa' },
    { wood: 'wierzba', planks: 'wierzba_planks', planksTexture: 'wierzba/deski.png', label: 'Skrzynia wierzbowa' },
    { wood: 'acacia', planks: 'acacia_planks', planksTexture: 'acacia/planks.png', label: 'Skrzynia z akacji' },
    { wood: 'bald_cypress', planks: 'bald_cypress_planks', planksTexture: 'bald_cypress/planks.png', label: 'Skrzynia z cypryśnika' },
    { wood: 'cherry', planks: 'cherry_planks', planksTexture: 'cherry/planks.png', label: 'Skrzynia wiśniowa' },
    { wood: 'maple', planks: 'maple_planks', planksTexture: 'maple/planks.png', label: 'Skrzynia klonowa' },
    { wood: 'mugo', planks: 'mugo_planks', planksTexture: 'mugo/planks.png', label: 'Skrzynia z kosodrzewiny' },
    { wood: 'olive', planks: 'olive_planks', planksTexture: 'olive/planks.png', label: 'Skrzynia oliwkowa' },
    { wood: 'rainbow_eucalyptus', planks: 'rainbow_eucalyptus_planks', planksTexture: 'rainbow_eucalyptus/planks.png', label: 'Skrzynia eukaliptusowa' },
    { wood: 'sequoia', planks: 'sequoia_planks', planksTexture: 'sequoia/planks.png', label: 'Skrzynia sekwojowa' },
    { wood: 'ginkgo', planks: 'ginkgo_planks', planksTexture: 'ginkgo/planks.png', label: 'Skrzynia miłorzębowa' },
    { wood: 'jacaranda', planks: 'jacaranda_planks', planksTexture: 'jacaranda/planks.png', label: 'Skrzynia jakarandowa' },
    // 1.9.0 - trzynaście drzew z 1.8.0. Numery: wspólny blok drewna od 12544
    // (woodShapes.js), miejsce 108-111.
    { wood: 'fir', planks: 'fir_planks', planksTexture: 'fir/planks.png', label: 'Skrzynia jodłowa' },
    { wood: 'baobab', planks: 'baobab_planks', planksTexture: 'baobab/planks.png', label: 'Skrzynia baobabowa' },
    { wood: 'coconut_palm', planks: 'coconut_palm_planks', planksTexture: 'coconut_palm/planks.png', label: 'Skrzynia palmowa' },
    { wood: 'larch', planks: 'larch_planks', planksTexture: 'larch/planks.png', label: 'Skrzynia modrzewiowa' },
    { wood: 'mangrove', planks: 'mangrove_planks', planksTexture: 'mangrove/planks.png', label: 'Skrzynia namorzynowa' },
    { wood: 'kapok', planks: 'kapok_planks', planksTexture: 'kapok/planks.png', label: 'Skrzynia z puchowca' },
    { wood: 'joshua_tree', planks: 'joshua_tree_planks', planksTexture: 'joshua_tree/planks.png', label: 'Skrzynia z jukki' },
    { wood: 'aspen', planks: 'aspen_planks', planksTexture: 'aspen/planks.png', label: 'Skrzynia osikowa' },
    { wood: 'araucaria', planks: 'araucaria_planks', planksTexture: 'araucaria/planks.png', label: 'Skrzynia araukariowa' },
    { wood: 'banyan', planks: 'banyan_planks', planksTexture: 'banyan/planks.png', label: 'Skrzynia figowcowa' },
    { wood: 'dragon_tree', planks: 'dragon_tree_planks', planksTexture: 'dragon_tree/planks.png', label: 'Skrzynia z draceny' },
    { wood: 'cedar', planks: 'cedar_planks', planksTexture: 'cedar/planks.png', label: 'Skrzynia cedrowa' },
    { wood: 'bristlecone', planks: 'bristlecone_planks', planksTexture: 'bristlecone/planks.png', label: 'Skrzynia z sosny ościstej' }
];

// Pierwszy numer skrzyni: dawne 19 rodzajów w zakresie 10200-10299, nowe
// (1.9.0) - we wspólnym bloku swojego drewna.
const OLD_WOOD_CHESTS = 19;

function woodChestFirstId(wood, index) {
    if (index < OLD_WOOD_CHESTS) return WOOD_CHEST_FIRST_ID + index * CHEST_FACINGS.length;
    const woodIndex = WOODS.findIndex((entry) => entry.wood === wood);
    return WOOD_BLOCK_FIRST_ID + (woodIndex - WOODS_IN_FIRST_RANGES) * WOOD_BLOCK_IDS + WOOD_BLOCK_CHEST;
}

// Dębowa skrzynia z 0.81.0 zostaje pod starymi numerami i nazwą "chest".
const KINDS = [
    { base: 'chest', firstId: CHEST_FIRST_ID, planks: 'oak_planks', planksTexture: 'oak_planks', texture: 'chest', label: 'Skrzynia dębowa', name: 'Oak Chest' },
    ...WOOD_CHESTS.map(({ wood, planks, planksTexture, label }, index) => ({
        base: `${wood}_chest`, firstId: woodChestFirstId(wood, index),
        planks, planksTexture, texture: `chest_${wood}`, label, name: `${wood} chest`
    }))
];

const typeOf = (base, facing) => facing === 'north' ? base : `${base}_${facing}`;

function kindBlocks({ base, firstId, planks, planksTexture, texture, label, name }) {
    const facings = Object.fromEntries(CHEST_FACINGS.map((facing) => [facing, typeOf(base, facing)]));
    return CHEST_FACINGS.map((facing, index) => [typeOf(base, facing), {
        id: firstId + index,
        name,
        label,
        solid: true,
        opaque: false,
        model: 'chest',
        chest: { facing, texture, planks, kind: base },
        facings,
        ...(facing === 'north' ? {} : { inventory: false, creative: false }),
        category: 'ozdoby',
        sound: 'wood',
        hardness: 1.2,
        pick: base,
        drops: base,
        textures: { all: planksTexture }
    }]);
}

export const CHEST_BLOCKS = Object.fromEntries(KINDS.flatMap(kindBlocks));

// Skrzynie w ekwipunku (przodem na północ): chest, spruce_chest, ...
export const CHEST_KINDS = KINDS.map(({ base, planks, texture, label }) => ({ type: base, planks, texture, label }));

const CHEST_IDS = new Set(Object.values(CHEST_BLOCKS).map((block) => block.id));

export function isChestId(id) {
    return CHEST_IDS.has(id);
}

export function isChestType(type) {
    return typeof type === 'string' && Object.hasOwn(CHEST_BLOCKS, type);
}

export function chestFacing(type) {
    return CHEST_BLOCKS[type]?.chest.facing ?? null;
}

// Tekstura (kafelek 32 x 32) i deski skrzyni danego rodzaju.
export function chestTexture(type) {
    return CHEST_BLOCKS[type]?.chest.texture ?? 'chest';
}

export function chestPlanks(type) {
    return CHEST_BLOCKS[type]?.chest.planks ?? 'oak_planks';
}

// Przód skrzyni w stronę gracza: yaw - obrót gracza (patrzy w stronę
// (-sin yaw, -cos yaw)).
export function chestFacingForYaw(yaw) {
    const x = Math.sin(yaw), z = Math.cos(yaw);
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 'east' : 'west';
    return z > 0 ? 'south' : 'north';
}

// Obrót modelu (przód na -z, czyli północ) wokół osi Y.
export const CHEST_ROTATION = { north: 0, west: Math.PI / 2, south: Math.PI, east: -Math.PI / 2 };
