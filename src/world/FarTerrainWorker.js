import { TerrainGenerationCache } from './terrain/GenerationCache.js';

import { sampleFarTile, meshFarTile, createMeshScratch } from './farSamples.js';
import { createFarVegetationJob, appendFarVegetation } from './farVegetation.js';

// ------------------------------------------------------------
// WĄTEK DALEKIEGO TERENU
//
// Liczy kafelki dalekiego terenu (farSamples.js) obok gry, w osobnym
// wątku przeglądarki - tysiące wywołań generatora terenu i składanie
// siatek nie zabierają czasu klatkom. Ma własną kopię generatora (ten
// sam typ terenu i seed - ten sam teren).
//
// Wiadomości:
//   { type: 'init', terrain, seed }               - nowy świat
//   { type: 'palette', colors, albedo }           - kolory i albedo kratek
//   { type: 'tile', id, x0, z0, spacing, cells }  - policz kafelek
// Odpowiedzi:
//   { type: 'ready' }                    - wątek wczytany (wiadomości
//                                          wysłane wcześniej mogłyby
//                                          przepaść - gra czeka na to)
//   { type: 'tile', id, heights, kinds, materialIds, mesh }
//                                        - wysokości, rodzaje, materiały
//                                          kratek i gotowa siatka (bez
//                                          kolorów - null); tablice
//                                          przekazane bez kopiowania.
// ------------------------------------------------------------

let generatorCache = null;

let palette = null;
let albedoPalette = null;

let scratch = createMeshScratch(32);


self.onmessage = (event) => {

    const message = event.data;


    if (message.type === 'init') {

        generatorCache = new TerrainGenerationCache(message.terrain, message.seed);

        return;

    }


    if (message.type === 'palette') {

        palette = message.colors;
        albedoPalette = message.albedo;

        return;

    }


    if (message.type === 'tile' && generatorCache) {

        const generator = generatorCache.prepare();

        const { id, x0, z0, spacing, cells, vegetation: withVegetation = false } = message;

        const W = cells + 2;

        const heights = new Int16Array(W * W);
        const kinds = new Uint8Array(W * W);
        const materialIds = new Uint16Array(W * W);

        sampleFarTile(generator, x0, z0, spacing, cells, heights, kinds, 0, W, materialIds, withVegetation);

        const vegetation = withVegetation
            ? createFarVegetationJob(generator, x0, z0, cells * spacing, spacing, heights, kinds, cells).step().data
            : null;

        const transfer = [heights.buffer, kinds.buffer, materialIds.buffer];
        if (vegetation) transfer.push(vegetation.buffer);

        let mesh = null;

        if (palette) {

            if (scratch.cells < cells) {
                scratch = createMeshScratch(cells);
            }

            mesh = meshFarTile(heights, kinds, cells, spacing, palette, scratch, materialIds, albedoPalette);
            mesh = appendFarVegetation(mesh, vegetation, x0, z0, palette, albedoPalette);

            transfer.push(mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.surfaceAlbedo.buffer, mesh.indices.buffer, mesh.shadowIndices.buffer);

        }

        self.postMessage({ type: 'tile', id, heights, kinds, materialIds, vegetation, mesh }, transfer);

    }

};


self.postMessage({ type: 'ready' });
