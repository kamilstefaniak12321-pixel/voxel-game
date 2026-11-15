import { getAtlasUV } from './TextureAtlas.js';
import { registerPlaneModel } from './PlaneModelGeometry.js';

// ------------------------------------------------------------
// WARIANTY ROŚLIN WEDŁUG SIEDLISKA (1.3.0 - trawy)
//
// Roślina z "siedliska" i "warianty" w model.json (plantModels.js) ma
// w danych rysowania tablicę "regional": dla każdego siedliska
// (src/blocks/plantHabitats.js) zestaw wyglądów z udziałami. ChunkMesher
// wybiera wygląd z miejsca rośliny (pickRegionalPlant) - ten sam blok,
// ta sama liczba rysowań, inny model albo obrazek z atlasu.
//
// Poziomy: prosty (obrazek wariant-<nazwa>-prosty) i półrealistyczny
// (model z kart z arkusza wariant-<nazwa>). Szczegółowy - bez wariantów.
// ------------------------------------------------------------

const registered = new Set();

function planeKind(model, variant) {

    const kind = `plane:wariant:${model.id}:${variant.id}`;

    if (!registered.has(kind)) {
        registered.add(kind);
        registerPlaneModel(kind, variant.semi.spec, variant.semi.texture, variant.id.length * 13 + model.id.length);
    }

    return kind;

}

function table(model, base, make) {

    if (!model.habitats) return null;

    const made = model.variants.map(make);

    return model.habitats.map((entries) => {

        if (!entries) return null;

        let sum = 0;

        return {
            // limits[i] - górna granica losu dla options[i] (ostatnia = 1).
            limits: entries.map((entry) => (sum += entry.share)),
            options: entries.map((entry) => entry.variant < 0 ? base : made[entry.variant])
        };

    });

}

// Dane "riverPlant" (model z kart) z wariantami; base - zwykły wygląd.
export function withRegionalPlanes(model, base) {

    const regional = table(model, base, (variant) => ({
        kind: planeKind(model, variant), waterlogged: base.waterlogged, tint: base.tint, uv: getAtlasUV(variant.semi.texture)
    }));

    return regional ? { ...base, regional } : base;

}

// Dane "cross" (obrazek na skrzyżowanych płaszczyznach) z wariantami.
export function withRegionalSprites(model, base) {

    if (!base) return base;

    const regional = table(model, base, (variant) => ({ ...base, uv: getAtlasUV(variant.simple.texture), sprite: null }));

    return regional ? { ...base, regional } : base;

}

// Wygląd rośliny w siedlisku: random - los z miejsca (0..1). Zwraca dane
// tego samego rodzaju co base (albo samo base).
export function pickRegionalPlant(base, habitat, random) {

    const set = base.regional[habitat];

    if (!set) return base;

    const limits = set.limits;

    let index = 0;

    while (index < limits.length - 1 && random >= limits[index]) index++;

    return set.options[index];

}
