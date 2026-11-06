// ------------------------------------------------------------
// PROSTE OBRAZKI ROŚLIN Z ICH MODELI (poziom "Proste" - plantModels.js)
//
// Roślina, która ma tylko model z pikseli (paczki roślin z modelem
// "kepka", turzyca, pałka, krwawnica), dostaje obrazek 16 x 16 do
// skrzyżowanych płaszczyzn: widok z przodu (a gdzie z przodu pusto -
// z boku) tego samego modelu, kolory jak w grze, trochę ciemniej
// u dołu. Większa roślina - pomniejszona do 16 x 16 ("rozmiar" w
// model.json - ile pikseli rośliny mieści obrazek).
//
//   node tools/modele_roslin_proste.mjs            (wszystkie)
//   node tools/modele_roslin_proste.mjs piwonia    (jedna)
//
// Zapisuje assets/models/rosliny/<roślina>/prosty-<etap>.png i wypisuje
// rozmiary. Obrazki można potem poprawiać ręcznie.
// ------------------------------------------------------------

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Moduły przeglądarki (pliki, tekstury, mapa) - zaślepki z tymi samymi
// nazwami eksportów (funkcje nic nie robią). Komendy i świat - prawdziwe.
const STUBBED = ['src/rendering/TextureAtlas.js', 'src/app/textures.js', 'src/app/AndroidUpdates.js',
    'src/rendering/TexturePacks.js', 'src/player/skin.js', 'src/ui/TerrainMap.js'];

function stubSource(url) {
    const source = readFileSync(new URL(url), 'utf8');
    const names = new Set();
    for (const [, name] of source.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(name);
    for (const [, list] of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
        for (const part of list.split(',')) { const name = part.trim().split(/\s+as\s+/).pop(); if (name) names.add(name); }
    }
    const special = {
        atlasReady: 'Promise.resolve({ tileSize: 16, mipmaps: false })', atlasAveragesReady: 'Promise.resolve()',
        getTileColors: '() => []',
        getAtlasUV: '(name) => ({ uMin: 0, uMax: 1, vMin: 0, vMax: 1, name })', ATLAS_TILES: '{ water: { x: 0, y: 0 } }',
        ATLAS_COLUMNS: '16', ATLAS_ROWS: '16', MAP_LAYERS: '{}', MAP_SCALES: '[]'
    };
    return [...names].map((name) => `export const ${name} = ${special[name] ?? (/^[A-Z_0-9]+$/.test(name) ? 'null' : '() => null')};`).join('\n');
}

registerHooks({
    resolve(specifier, context, next) {
        return next(specifier === 'three' ? new URL('../lib/three/three.module.js', import.meta.url).href : specifier, context);
    },
    load(url, context, next) {
        if (STUBBED.some((path) => url.endsWith('/' + path))) {
            return { format: 'module', shortCircuit: true, source: stubSource(url) };
        }
        return next(url, url.endsWith('.js') && (url.includes('/src/') || url.includes('/lib/three/') || url.includes('/assets/'))
            ? { ...context, format: 'module' } : context);
    }
});



console.warn = () => {};

const { blockRenderData } = await import('../src/rendering/BlockRenderData.js');
const { getBlockId } = await import('../src/blocks/BlockRegistry.js');
const { getRiverPlantFaces } = await import('../src/rendering/RiverPlantGeometry.js');
const { PLANT_PACKS, plantStageType } = await import('../src/blocks/plantPacks.js');

// Folder -> bloki kolejnych etapów (tylko rośliny bez własnego obrazka).
export const SIMPLE_FROM_MODEL = {
    turzyca: ['river_sedge'],
    palka: ['cattail'],
    krwawnica: ['purple_loosestrife']
};

for (const pack of PLANT_PACKS) {
    if (pack.stages.every((stage) => stage.tuft && !stage.tuft.carpet && !stage.tuft.coating && !stage.tuft.bracket)) {
        SIMPLE_FROM_MODEL[pack.id] = pack.stages.map((_, index) => plantStageType(pack, index));
    }
}
delete SIMPLE_FROM_MODEL.lawenda;   // lawenda - obrazki rysowane ręcznie (modele_roslin.py)

const srgb = (v) => {
    const x = v / 255;
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
};

function render(type) {

    const data = blockRenderData[getBlockId(type)].riverPlant;
    const faces = getRiverPlantFaces(data.kind, 0, data.waterlogged, data.tuft, 0);

    const views = [[2, 0], [0, 2]];   // [oś głębi, oś pozioma]: z przodu, z boku
    let minX = Infinity, maxX = -Infinity, maxY = 0;

    for (const face of faces) for (const v of face.vertices) {
        minX = Math.min(minX, v[0], v[2]); maxX = Math.max(maxX, v[0], v[2]); maxY = Math.max(maxY, v[1]);
    }

    const half = Math.ceil(Math.max(-minX, maxX) * 16);
    const W = Math.max(1, 2 * half), H = Math.max(1, Math.ceil(maxY * 16));
    const grids = views.map(() => ({ depth: new Float64Array(W * H).fill(-Infinity), color: new Array(W * H).fill(null) }));

    views.forEach(([depthAxis, across], view) => {
        const grid = grids[view];
        for (const face of faces) {
            // Ściany boczne modeli z pikseli mają normalne lekko w górę.
            if (Math.abs(face.normal[depthAxis]) < 0.25 || Math.abs(face.normal[depthAxis]) < Math.abs(face.normal[across])) continue;
            const xs = face.vertices.map((v) => v[across] * 16 + half), ys = face.vertices.map((v) => v[1] * 16);
            const depth = Math.max(...face.vertices.map((v) => v[depthAxis]));
            const x0 = Math.round(Math.min(...xs)), x1 = Math.round(Math.max(...xs));
            const y0 = Math.round(Math.min(...ys)), y1 = Math.round(Math.max(...ys));
            for (let y = y0; y < Math.max(y1, y0 + 1); y++) for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const i = (H - 1 - y) * W + x;
                if (depth > grid.depth[i]) { grid.depth[i] = depth; grid.color[i] = { color: face.color, y }; }
            }
        }
    });

    const size = Math.max(16, W, H);
    const pixels = new Uint8Array(16 * 16 * 4);
    const scale = size / 16;
    const offsetX = (size - W) / 2, offsetY = size - H;

    for (let ty = 0; ty < 16; ty++) for (let tx = 0; tx < 16; tx++) {
        const counts = new Map();
        let covered = 0, total = 0;
        for (let sy = Math.floor(ty * scale); sy < Math.floor((ty + 1) * scale); sy++) {
            for (let sx = Math.floor(tx * scale); sx < Math.floor((tx + 1) * scale); sx++) {
                total++;
                const x = Math.floor(sx - offsetX), y = Math.floor(sy - offsetY);
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const cell = grids[0].color[y * W + x] ?? grids[1].color[y * W + x];
                if (!cell) continue;
                covered++;
                const key = cell.color.join();
                counts.set(key, { cell, n: (counts.get(key)?.n ?? 0) + 1 });
            }
        }
        if (!covered || covered < total * 0.34) continue;
        const { cell } = [...counts.values()].sort((a, b) => b.n - a.n)[0];
        const shade = 0.82 + 0.18 * Math.min(1, cell.y / Math.max(8, H * 0.6));
        const o = (ty * 16 + tx) * 4;
        cell.color.forEach((c, k) => { pixels[o + k] = Math.min(255, srgb(Math.min(255, c * shade))); });
        pixels[o + 3] = 255;
    }

    return { pixels, size };

}

function png(pixels) {
    const crcTable = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buffer) => {
        let c = 0xffffffff;
        for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const out = Buffer.alloc(12 + data.length);
        out.writeUInt32BE(data.length, 0);
        out.write(type, 4, 'latin1');
        data.copy(out, 8);
        out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
        return out;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4);
    header[8] = 8; header[9] = 6;
    const raw = Buffer.alloc(16 * (16 * 4 + 1));
    for (let y = 0; y < 16; y++) Buffer.from(pixels.subarray(y * 64, y * 64 + 64)).copy(raw, y * 65 + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const only = process.argv[2];
const sizes = {};

for (const [folder, types] of Object.entries(SIMPLE_FROM_MODEL)) {
    if (only && folder !== only) continue;
    const dir = new URL(`../assets/models/rosliny/${folder}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });
    sizes[folder] = types.map((type, index) => {
        const { pixels, size } = render(type);
        writeFileSync(new URL(`prosty-${index + 1}.png`, dir), png(pixels));
        return size;
    });
}

console.log(JSON.stringify(sizes));
