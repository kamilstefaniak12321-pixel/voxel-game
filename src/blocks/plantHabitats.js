// ------------------------------------------------------------
// SIEDLISKA ROŚLIN (1.3.0) - pomysł Kamila
//
// Trawa (krótka i wysoka) wygląda inaczej zależnie od miejsca: na
// szerokiej łące rośnie inny zestaw kępek niż nad rzeką, w lesie, w borze,
// na suchym piasku i w górach. Blok jest ten sam - zmienia się tylko
// rysunek (warianty w assets/models/rosliny/<roślina>/model.json:
// "siedliska" i "warianty"; wybór - src/rendering/PlantRegionalVariants.js).
//
// Generator zapisuje siedlisko każdej kolumny chunka (chunk.habitats,
// 16 x 16 bajtów - numer z PLANT_HABITATS). Świat bez tej siatki (płaski,
// testowy) to wszędzie łąka.
// ------------------------------------------------------------

export const PLANT_HABITATS = ['laka', 'brzeg', 'las', 'bor', 'sucha', 'gory'];

export const PLANT_HABITAT_NAMES = {
    laka: 'łąka',
    brzeg: 'brzeg wody i mokradła',
    las: 'las liściasty',
    bor: 'bór iglasty',
    sucha: 'suche miejsca (wydmy, gaj oliwny)',
    gory: 'góry'
};

const INDEX = Object.fromEntries(PLANT_HABITATS.map((name, index) => [name, index]));

// Biom (klucz z BIOMES - src/world/terrain/Biomes.js) -> siedlisko.
// Biomu spoza listy (nowy biom) - łąka.
export const BIOME_HABITATS = {
    sea: 'brzeg', lake: 'brzeg', river: 'brzeg', wetland: 'brzeg',
    beach: 'sucha', olive_grove: 'sucha',
    meadow: 'laka',
    deciduous: 'las', beech: 'las', birch: 'las', maple_forest: 'las',
    eucalyptus_forest: 'las', sequoia_forest: 'las',
    pine: 'bor', spruce: 'bor',
    alpine: 'gory', rocky: 'gory', snowy: 'gory', mugo_scrub: 'gory'
};

// Jak daleko od wody sięga brzeg: do SHORE_NEAR bloków zawsze, dalej
// (do SHORE_FAR) coraz rzadziej - granica jest postrzępiona, nie równa.
export const SHORE_NEAR = 3;
export const SHORE_FAR = 7;

function hash(x, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ 0x51ed270b;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Numer siedliska kolumny (x, z): biome - klucz biomu, water - odległość
// do brzegu rzeki albo jeziora w blokach (Infinity - daleko).
export function plantHabitat(biome, water, x, z) {

    if (water < SHORE_FAR && biome !== 'beach' &&
        (water < SHORE_NEAR || water < SHORE_NEAR + (SHORE_FAR - SHORE_NEAR) * hash(x, z))) {
        return INDEX.brzeg;
    }

    return INDEX[BIOME_HABITATS[biome]] ?? 0;

}
