import { blockRenderData } from './BlockRenderData.js';
import { getAtlasUV } from './TextureAtlas.js';
import { registerPlaneModel } from './PlaneModelGeometry.js';
import { originalPlantRenderData, plantModelLevel } from './PlantModelLevels.js';
import { getBlockId, getBlockDefinition } from '../blocks/BlockRegistry.js';
import { PLANT_MODELS, PLANT_MODEL_LEVELS, resolvePlantModel } from '../blocks/plantModels.js';

const models = new Map();
for (const model of PLANT_MODELS) model.stages.forEach((stage, index) => {
    const id = getBlockId(stage.type);
    if (id) models.set(id, { model, stage, index });
});

const variants = new Map();

// Each job captures the selected quality once. Models are only simplified:
// a player using simple plants never receives semi/detailed plants at distance.
// The registry, UI models, collision blocks and growth stages are untouched.
export function createPlantDetailLookup(detail) {
    const selected = plantModelLevel() ?? 'detailed';
    const level = PLANT_MODEL_LEVELS[Math.min(PLANT_MODEL_LEVELS.indexOf(selected), 2 - detail)];
    const data = new Map();
    return id => {
        if (data.has(id)) return data.get(id);
        const current = blockRenderData[id], entry = models.get(id);
        if (!current || !entry) return current;
        const original = originalPlantRenderData(id);
        const { model, stage, index } = entry;
        const available = { sprite: Boolean(original.cross), model: Boolean(original.riverPlant) };
        const chosen = resolvePlantModel(stage, level, available);
        const selectedModel = resolvePlantModel(stage, selected, available);
        if (PLANT_MODEL_LEVELS.indexOf(chosen) >= PLANT_MODEL_LEVELS.indexOf(selectedModel)) {
            const snapshot = { ...current };
            data.set(id, snapshot);
            return snapshot;
        }
        const key = `${id}:${chosen}`;
        let variant = variants.get(key);
        if (!variant) {
            const tint = getBlockDefinition(stage.type)?.tint === true;
            const waterlogged = original.riverPlant?.waterlogged ?? false;
            if (chosen === 'semi') {
                const kind = `plane:distance:${model.id}:${index}:semi`;
                registerPlaneModel(kind, stage.semi.spec, stage.semi.texture, index * 31 + model.id.length);
                variant = { cross: null, riverPlant: { kind, waterlogged, tint, uv: getAtlasUV(stage.semi.texture) } };
            } else if (original.riverPlant) {
                const kind = `plane:distance:${model.id}:${index}:simple`;
                registerPlaneModel(kind, { krzyz: { rozmiar: stage.simple.size ?? 16 } }, stage.simple.texture, index);
                variant = { cross: null, riverPlant: { kind, waterlogged, tint, uv: getAtlasUV(stage.simple.texture) } };
            } else {
                const size = (stage.simple?.size ?? 16) / 16;
                variant = { riverPlant: null, cross: stage.simple
                    ? { uv: getAtlasUV(stage.simple.texture), planes: 2, height: size, width: .45 * size, sprite: null }
                    : original.cross };
            }
            variants.set(key, variant);
        }
        const snapshot = { ...current, ...variant };
        data.set(id, snapshot);
        return snapshot;
    };
}
