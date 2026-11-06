import { blockRenderData } from './BlockRenderData.js';
import { getAtlasUV } from './TextureAtlas.js';
import { registerPlaneModel } from './PlaneModelGeometry.js';
import { clearTuftInfo } from './TuftAnimation.js';
import { getBlockId } from '../blocks/BlockRegistry.js';
import { PLANT_MODELS, PLANT_MODEL_LEVELS, resolvePlantModel } from '../blocks/plantModels.js';

// ------------------------------------------------------------
// PRZEŁĄCZANIE POZIOMU MODELI ROŚLIN (Ustawienia -> Modele)
//
// Zmienia tylko dane rysowania (blockRenderData - "cross" albo
// "riverPlant") roślin z assets/models/rosliny/ - bloki, zapisy,
// celownik, ikonki i przedmiot w dłoni zostają. Po zmianie chunki
// przebudowują się stopniowo (World.remeshAll - Game.applySettings).
//
//   simple   -> cross (obrazek: własny 16 x 16 albo z atlasu bloku),
//   semi     -> riverPlant "plane:..." (PlaneModelGeometry.js),
//   detailed -> riverPlant z kępką (TuftGeometry.js; z paczki - jej model).
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

            const chosen = resolvePlantModel(stage, level, Boolean(original.cross));

            const before = data.riverPlant?.kind ?? data.cross?.uv;

            if (chosen === 'simple') {

                data.riverPlant = null;
                data.cross = stage.simple
                    ? { uv: getAtlasUV(stage.simple.texture), planes: 2, height: 1, width: 0.45, sprite: null }
                    : original.cross;

            }

            else if (chosen === 'semi') {

                const kind = `plane:${model.id}:${index}`;

                registerPlaneModel(kind, stage.semi.spec, stage.semi.texture, index * 31 + model.id.length);

                data.cross = null;
                data.riverPlant = { kind, waterlogged: false, uv: getAtlasUV(stage.semi.texture) };

            }

            else {

                data.cross = null;
                data.riverPlant = stage.detailed.fromPack
                    ? original.riverPlant
                    : {
                        kind: `kepka:model:${model.id}:${index}`, waterlogged: false, tuft: stage.detailed.tuft,
                        carpet: 0, uv: getAtlasUV('snow'), animatePack: `model:${model.id}`
                    };

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
