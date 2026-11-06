import { STONE_TOOL_KINDS, STONE_TOOL_MATERIALS, stoneToolType } from '../items/stoneTools.js';

export const STONE_TOOL_TEXTURES = Object.freeze(STONE_TOOL_KINDS.flatMap(tool =>
    STONE_TOOL_MATERIALS.slice(1).map(material => ({
        name: stoneToolType(tool, material.stone), tool, stone: material.stone,
        sourceTexture: tool, materialTexture: material.texture
    }))
));

// Keep the author's silhouette, highlights and wooden handle. The authored
// stone head uses neutral/cool colours; warm brown wood is never recoloured.
// Source and material are one RGBA tile. High-resolution texture packs use the
// same rules without rescaling the user's shapes back down to sixteen pixels.
export function stoneToolPixels(source, material, size = 16) {
    if (!Number.isInteger(size) || size < 1 || source.length !== size * size * 4 || material.length !== source.length) {
        throw new Error('Stone tool textures require equally sized square RGBA tiles');
    }
    const result = new Uint8ClampedArray(source);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const r = source[i], g = source[i + 1], b = source[i + 2], a = source[i + 3];
        if (!a || r > g + 3 || g > b + 3 || Math.max(r, g, b) - Math.min(r, g, b) > 18) continue;
        const luminance = (r * .2126 + g * .7152 + b * .0722) / 255;
        const shade = .24 + luminance * 1.18;
        // Sampling the actual rock preserves its grain and palette while the
        // source head controls the silhouette, bevels and outline shading.
        const sample = (((y * 3 + x) % size) * size + ((x * 3 + y) % size)) * 4;
        for (let c = 0; c < 3; c++) result[i + c] = Math.round(material[sample + c] * shade);
    }
    return result;
}

// Called once after base-atlas assets have loaded. Each output is an ordinary
// atlas tile: inventory, held items and texture packs share the same geometry.
export function drawStoneToolTextures(context, tiles, tileSize = 16, explicitOverrides = new Set()) {
    for (const spec of STONE_TOOL_TEXTURES) {
        if (explicitOverrides.has(spec.name)) continue;
        const source = tiles[spec.sourceTexture], material = tiles[spec.materialTexture], target = tiles[spec.name];
        if (!source || !material || !target) throw new Error(`Missing atlas tile for ${spec.name}`);
        const head = context.getImageData(source.x * tileSize, source.y * tileSize, tileSize, tileSize);
        const rock = context.getImageData(material.x * tileSize, material.y * tileSize, tileSize, tileSize);
        const output = context.createImageData(tileSize, tileSize);
        output.data.set(stoneToolPixels(head.data, rock.data, tileSize));
        context.putImageData(output, target.x * tileSize, target.y * tileSize);
    }
}
