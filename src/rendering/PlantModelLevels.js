import { blockRenderData } from './BlockRenderData.js';
import { getAtlasUV } from './TextureAtlas.js';
import { registerPlaneModel } from './PlaneModelGeometry.js';
import { clearTuftInfo } from './TuftAnimation.js';
import { getBlockId, getBlockDefinition } from '../blocks/BlockRegistry.js';
import { PLANT_MODELS, PLANT_MODEL_LEVELS, resolvePlantModel } from '../blocks/plantModels.js';

// ------------------------------------------------------------
// PRZEŁĄCZANIE POZIOMU MODELI ROŚLIN (Ustawienia -> Modele)
//
// Zmienia tylko dane rysowania (blockRenderData - "cross" albo
// "riverPlant") roślin z assets/models/rosliny/ - bloki, zapisy,
// celownik, ikonki i przedmiot w dłoni zostają. Po zmianie chunki
// przebudowują się stopniowo (World.remeshAll - main.js).
//
//   simple   -> cross (obrazek: własny 16 x 16 albo z atlasu bloku);
//               blok z własnym modelem (krzaki, rośliny nad wodą) - dwie
//               skrzyżowane karty tą samą drogą co model (woda w komórce
//               zostaje),
//   semi     -> riverPlant "plane:..." (PlaneModelGeometry.js),
//   detailed -> riverPlant z kępką (TuftGeometry.js) albo dotychczasowy
//               model bloku (paczki, krzaki owocowe, rośliny nad wodą).
// Trawa i inne rośliny z kolorem klimatu (tint) - także w modelach.
// ------------------------------------------------------------

const ORIGINAL = new Map();

let current = null;


// Zwraca liczbę roślin (etapów), które zmieniły wygląd.

export function applyPlantModelLevel(level) {

    if (!PLANT_MODEL_LEVELS.includes(level)) {
        level = 'semi';
    }

    if (level === current) {
        return 0;
    }

    current = level;

    let changed = 0;

    for (const model of PLANT_MODELS) {

        model.stages.forEach((stage, index) => {

            const id = getBlockId(stage.type);

            const data = id ? blockRenderData[id] : null;

            if (!data) return;

            if (!ORIGINAL.has(id)) {
                ORIGINAL.set(id, { cross: data.cross, riverPlant: data.riverPlant });
            }

            const original = ORIGINAL.get(id);

            const tint = getBlockDefinition(stage.type)?.tint === true;

            const waterlogged = original.riverPlant?.waterlogged ?? false;

            const chosen = resolvePlantModel(stage, level, { sprite: Boolean(original.cross), model: Boolean(original.riverPlant) });

            const before = data.riverPlant?.kind ?? data.cross?.uv;

            if (chosen === 'simple') {

                const size = (stage.simple?.size ?? 16) / 16;

                if (original.riverPlant) {

                    const kind = `plane:${model.id}:${index}:simple`;

                    registerPlaneModel(kind, { krzyz: { rozmiar: size * 16 } }, stage.simple.texture, index);

                    data.cross = null;
                    data.riverPlant = { kind, waterlogged, tint, uv: getAtlasUV(stage.simple.texture) };

                }
                else {

                    data.riverPlant = null;
                    data.cross = stage.simple
                        ? { uv: getAtlasUV(stage.simple.texture), planes: 2, height: size, width: 0.45 * size, sprite: null }
                        : original.cross;

                }

            }

            else if (chosen === 'semi') {

                const kind = `plane:${model.id}:${index}`;

                registerPlaneModel(kind, stage.semi.spec, stage.semi.texture, index * 31 + model.id.length);

                data.cross = null;
                data.riverPlant = { kind, waterlogged, tint, uv: getAtlasUV(stage.semi.texture) };

            }

            else {

                data.cross = null;
                data.riverPlant = stage.detailed
                    ? {
                        kind: `kepka:model:${model.id}:${index}`, waterlogged, tuft: stage.detailed.tuft,
                        carpet: 0, uv: getAtlasUV('snow'), animatePack: `model:${model.id}`
                    }
                    : original.riverPlant;

            }

            if ((data.riverPlant?.kind ?? data.cross?.uv) !== before) changed++;

        });

    }

    clearTuftInfo();

    return changed;

}


export function plantModelLevel() {
    return current;
}
