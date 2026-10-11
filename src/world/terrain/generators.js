import { TerrainGenerator } from '../TerrainGenerator.js';
import { RealisticGenerator } from './RealisticGenerator.js';

// ------------------------------------------------------------
// TYPY TERENU (GENERATORY)
//
// Każdy świat pamięta swój typ terenu (worldInfo.terrain), więc
// zmiana albo dodanie generatora nie psuje starych światów.
//
// Generator to obiekt z polami i metodami:
//   type                 - 'classic', 'realistic'...
//   seaLevel             - poziom morza (null = bez morza)
//   baseHeight           - typowa wysokość nizin (np. horyzont)
//   getHeight(x, z)      - y najwyższego bloku terenu
//   generateChunk(chunk) - wypełnia chunk blokami
//   farSurface(x, z, spacing) -> { top, kind } - dla dalekiego
//                          terenu; kind: 'grass', 'rock', 'sand', 'water'
//   describe(x, z)       - opis miejsca: wysokość, pas wysokości,
//                          forma terenu, pola (/teren, /mapa)
//   findSpawn(x, z)      - miejsce startu nowego świata
//
// Nowy typ terenu = nowa klasa z tymi metodami + wpis niżej.
// ------------------------------------------------------------

export const TERRAIN_TYPES = {

    realistic: {
        name: 'Realistyczny (w budowie)',
        create: (seed) => new RealisticGenerator(seed)
    },

    classic: {
        name: 'Klasyczny',
        create: (seed) => new TerrainGenerator(seed)
    }

};


// Światy bez zapisanego typu (sprzed wprowadzenia typów) są klasyczne.

export function createGenerator(type, seed) {

    return (TERRAIN_TYPES[type] ?? TERRAIN_TYPES.classic).create(seed);

}


export function terrainName(type) {

    return (TERRAIN_TYPES[type] ?? TERRAIN_TYPES.classic).name;

}
