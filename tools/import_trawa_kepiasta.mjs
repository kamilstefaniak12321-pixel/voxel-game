// The supplied Blockbench file is a reference lawn, not one plant. Extract
// the two crossing four-card groups at its origin and bake their transforms.
// Usage: node tools/import_trawa_kepiasta.mjs "path/to/model.bbmodel"
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decodeTexturePng, writeTextureRegion } from './texture_regions.mjs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error('Podaj ścieżkę do konceptu trawy .bbmodel.');
const sourceBytes = readFileSync(sourcePath);
const model = JSON.parse(sourceBytes.toString('utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const selectedGroups = [
    '1c79e02f-9ae1-c1b0-8349-4b0acd311606',
    '2787d858-cfed-b4a9-2add-b6315a900c94'
];
const textureUuid = '2c5e1186-34b6-639a-8ae8-f9ba0100ec73';
const groups = new Map(model.groups.map(group => [group.uuid, group]));
const elements = new Map(model.elements.map(element => [element.uuid, element]));
const textureIndex = model.textures.findIndex(texture => texture.uuid === textureUuid);
const texture = model.textures[textureIndex];
if (!texture || texture.width !== 16 || texture.height !== 16 ||
    texture.uv_width !== 16 || texture.uv_height !== 16 ||
    !texture.source?.startsWith('data:image/png;base64,')) {
    throw new Error('Oczekiwano osadzonej tekstury trawy 16 × 16.');
}
const textureBytes = Buffer.from(texture.source.split(',')[1], 'base64');
if (textureBytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' ||
    textureBytes.readUInt32BE(16) !== 16 || textureBytes.readUInt32BE(20) !== 16) {
    throw new Error('Nieprawidłowa tekstura PNG.');
}
const finiteVector = (value, size) => Array.isArray(value) && value.length === size && value.every(Number.isFinite);
const clean = n => Math.abs(n) < 1e-10 ? 0 : Math.round(n * 1e10) / 1e10;
function rotate(point, angles = [0, 0, 0]) {
    if (!finiteVector(angles, 3) || angles.filter(angle => angle !== 0).length > 1) {
        throw new Error('Importer tej kępy oczekuje obrotów wokół pojedynczych osi.');
    }
    let [x, y, z] = point;
    for (let axis = 0; axis < 3; axis++) {
        const angle = angles[axis] * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        if (axis === 0) [y, z] = [y * c - z * s, y * s + z * c];
        if (axis === 1) [x, z] = [x * c + z * s, -x * s + z * c];
        if (axis === 2) [x, y] = [x * c - y * s, x * s + y * c];
    }
    return [x, y, z];
}
const cards = [], found = new Set();
function visit(node, ancestors = [], selected = false) {
    if (typeof node === 'string') {
        if (!selected) return;
        const element = elements.get(node);
        if (!element || element.type !== 'mesh' || element.visibility === false || element.export === false ||
            !finiteVector(element.origin, 3) || Object.keys(element.faces).length !== 1) {
            throw new Error('Wybrana kępa musi zawierać widoczne, pojedyncze karty.');
        }
        const face = Object.values(element.faces)[0];
        if (face.texture !== textureIndex || face.vertices.length !== 4) throw new Error('Niewłaściwa karta trawy.');
        const vertices = face.vertices.map(key => {
            if (!finiteVector(element.vertices[key], 3)) throw new Error('Nieprawidłowy wierzchołek.');
            let point = rotate(element.vertices[key], element.rotation).map((n, i) => n + element.origin[i]);
            // Group pivots use absolute model coordinates. Apply the nearest
            // ancestor first, without adding the group origin a second time.
            for (const group of [...ancestors].reverse()) {
                point = rotate(point.map((n, i) => n - group.origin[i]), group.rotation)
                    .map((n, i) => n + group.origin[i]);
            }
            return point.map(n => clean(n / 16));
        });
        const uv = face.vertices.map(key => {
            if (!finiteVector(face.uv[key], 2) || face.uv[key].some(n => n < 0 || n > 16)) {
                throw new Error('Nieprawidłowe UV trawy.');
            }
            return face.uv[key].map(n => n / 16);
        });
        cards.push({ vertices, uv });
        return;
    }
    const group = groups.get(node.uuid);
    if (!group || group.visibility === false || group.export === false) return;
    if (!finiteVector(group.origin, 3)) throw new Error('Nieprawidłowy punkt obrotu grupy.');
    if (selectedGroups.includes(group.uuid)) { found.add(group.uuid); selected = true; }
    for (const child of node.children ?? []) visit(child, [...ancestors, group], selected);
}
for (const node of model.outliner) visit(node);
if (found.size !== 2 || cards.length !== 8) throw new Error('Nie znaleziono dwóch oryginalnych grup po cztery karty.');
const bounds = [0, 1, 2].map(axis => {
    const values = cards.flatMap(card => card.vertices.map(point => point[axis]));
    return [Math.min(...values), Math.max(...values)];
});
if (JSON.stringify(bounds) !== JSON.stringify([[-.5, .5], [0, 1], [-.5, .5]])) {
    throw new Error(`Zmieniony rozmiar kępy: ${JSON.stringify(bounds)}.`);
}
const metadata = {
    source: basename(sourcePath), sourceSha256: hash(sourceBytes), textureSha256: hash(textureBytes),
    sourceElements: model.elements.length, selectedGroups, cards: cards.length,
    textureSize: [16, 16], bounds
};
const output = new URL('../assets/models/bushy-grass/', import.meta.url);
mkdirSync(output, { recursive: true });
writeTextureRegion(new URL('texture.png', output), decodeTexturePng(textureBytes));
writeFileSync(new URL('model-data.js', output),
    '// Generated by tools/import_trawa_kepiasta.mjs. One block = 16 source pixels.\n' +
    '// The original card positions and UVs are preserved; reference ground/copies and animators are omitted.\n' +
    `export const BUSHY_GRASS_SOURCE = ${JSON.stringify(metadata, null, 2)};\n` +
    `export const BUSHY_GRASS_CARDS = ${JSON.stringify(cards)};\n`);
console.log(`Zaimportowano ${cards.length} kart z ${model.elements.length} elementów sceny; tekstura 16 × 16, ${textureBytes.length} bajtów.`);
