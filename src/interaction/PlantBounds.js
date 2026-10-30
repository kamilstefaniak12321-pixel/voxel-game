import { getBlockDefinition, getBlockTypeById } from '../blocks/BlockRegistry.js';
import { plantRandom } from '../rendering/RiverPlantGeometry.js';

// Zasięg rośliny z paczki roślin (plant.sprite - obrazek większy niż blok,
// src/blocks/plantPacks.js) dla celownika i ramki: pudełko wokół środka
// kępy (to samo przesunięcie co w ChunkMesher.addPlants), do wysokości
// rośliny - także ponad komórką, w której rośnie. Wąskie (3/4 szerokości
// obrazka): liście na brzegach nie zasłaniają bloków obok.
// null - zwykła roślina (wystarczy jej komórka).

export function spritePlantBounds(id, x, y, z) {

    const plant = getBlockDefinition(getBlockTypeById(id))?.plant;

    if (!plant?.sprite) {
        return null;
    }

    const cx = 0.5 + (plantRandom(x, y, z, 2) - 0.5) * 0.3;
    const cz = 0.5 + (plantRandom(x, y, z, 3) - 0.5) * 0.3;

    const r = Math.max(0.3, Math.min(0.8, plant.width * 0.75));

    return { min: [cx - r, 0, cz - r], max: [cx + r, plant.height, cz + r] };

}

// Najwyższa roślina z paczki może sięgać tyle bloków nad swoją komórkę.
export const SPRITE_PLANT_REACH = 3;
