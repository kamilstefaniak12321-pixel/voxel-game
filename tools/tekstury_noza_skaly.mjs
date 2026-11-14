// ------------------------------------------------------------
// NÓŻ Z KAŻDEJ SKAŁY - kopie tekstur dla wiki i paczki tekstur (0.100.0)
//
// Gra sama barwi ostrze noża skałą przy wczytywaniu atlasu
// (src/rendering/StoneToolTextures.js). Ten skrypt tą samą funkcją
// liczy te obrazki i wpisuje je do arkusza przedmioty.png (regiony
// assets/textures/derived/knife_<skała>.png), żeby wiki i szablon paczki
// tekstur pokazywały to samo co gra.
//
// Najpierw: python3 tools/tekstury_noza_i_kory.py (robi miejsce w arkuszu)
// Potem:    node tools/tekstury_noza_skaly.mjs
// ------------------------------------------------------------
import { STONE_TOOL_TEXTURES, stoneToolPixels } from '../src/rendering/StoneToolTextures.js';
import { readTextureRegion, writeTextureRegion } from './texture_regions.mjs';

let done = 0;

for (const spec of STONE_TOOL_TEXTURES.filter((entry) => entry.tool === 'knife')) {
    const source = readTextureRegion(spec.sourceTexture);
    const material = readTextureRegion(spec.materialTexture);
    if (source.width !== 16 || material.width !== 16) throw new Error(`Oczekiwano kafelków 16 x 16: ${spec.name}`);
    writeTextureRegion(`assets/textures/derived/${spec.name}.png`, {
        width: 16, height: 16, rgba: stoneToolPixels(source.rgba, material.rgba, 16)
    });
    done++;
}

console.log(`OK: ${done} wariantów noża wpisanych do arkusza.`);
