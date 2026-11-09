import { TREE_SPECIES } from '../blocks/trees.js';
import { surfaceMaterialId } from '../rendering/SurfaceMaterials.js';
import { seededRandom, treeShapeLimits, treeVisualDimensions } from './trees/TreeShapes.js';
import { kindIndex, KINDS } from './farSamples.js';

// Fixed world positions, not camera-facing cards. The same tree seed/species
// becomes a trunk and a small stepped crown; each successive tile spacing
// removes crown lobes, never the whole tree. These are visual proxies only.
export const FAR_VEGETATION_MAX_SPACING = 8;
export const VEGETATION_STRIDE = 12;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (pair, size, fallback) => pair ? lerp(pair[0], pair[1], size) : fallback;
const hash = (x, z, salt = 0) => {
    let n = Math.imul(x ^ salt, 374761393) ^ Math.imul(z, 668265263);
    n = Math.imul(n ^ n >>> 13, 1274126177);
    return (n ^ n >>> 16) >>> 0;
};

export function treeSilhouette(tree, spacing) {
    const random = seededRandom(tree.seed), size = tree.size;
    const definition = TREE_SPECIES[tree.species];
    const species = definition?.similar ?? tree.species;
    if (definition?.shape?.templates?.length) return templateSilhouette(tree, spacing, definition, random);
    const dimensions = treeVisualDimensions(tree.species, size);
    if (dimensions) return matureTreeSilhouette(tree, spacing, definition, dimensions);
    let height, radius, tall, crownBase, crownX = 0, crownZ = 0;
    if (species === 'spruce') {
        height = Math.round(lerp(10, 17, size) + random() * 2);
        radius = 1.4 + height * .13; crownBase = 2 + Math.floor(random() * 2); tall = height + 3 - crownBase;
    } else if (species === 'pine') {
        height = Math.round(lerp(13, 19, size) + random() * 2);
        radius = lerp(4.2, 5.8, size); tall = 5; crownBase = height - 3;
    } else if (species === 'birch') {
        height = Math.round(lerp(8, 12, size) + random() * 2);
        const lean = random() < .5 ? Math.round(height * lerp(.45, .7, random())) : height + 1;
        if (lean <= height) {
            const direction = Math.floor(random() * 4);
            crownX = [1,-1,0,0][direction]; crownZ = [0,0,1,-1][direction];
        }
        radius = lerp(1.8, 2.4, size);
        const half = lerp(2.8, 3.6, size);
        crownBase = height - .5 - half; tall = half * 2 + 1;
    } else if (species === 'linden') {
        height = Math.round(lerp(4, 7, size) + random());
        radius = lerp(3, 3.9, size);
        const half = lerp(3.8, 4.8, size), center = height + half * .75;
        crownBase = center - half; tall = half * 2 + 1;
    } else if (species === 'beech') {
        height = Math.round(lerp(5, 8, size) + random()); radius = lerp(3.4, 4.6, size);
        const center = height + lerp(1.2, 2.2, size), half = lerp(2.8, 3.4, size);
        crownBase = center - half; tall = half + Math.max(half, 3.1) + 1;
    } else {
        height = Math.round(lerp(4, 6, size) + random());
        radius = size > .45 ? lerp(5, 6, size) : lerp(3.8, 4.8, size);
        tall = 7; crownBase = height + .5; crownX = crownZ = size > .45 ? .5 : 0;
    }
    if (definition?.shape) {
        const shape = definition.shape;
        height = mix(shape.trunk, size, height);
        radius = mix(shape.radius, size, radius);
        tall = mix(shape.crown, size, tall);
        crownBase = height;
    }
    const boxes = [], leaf = surfaceMaterialId(`${tree.species}_leaves`), log = surfaceMaterialId(`${tree.species}_log`);
    const leafKind = kindIndex(`${species}_leaves`);
    const push = (x0, y0, z0, x1, y1, z1, material, kind, shade = 1) => {
        boxes.push(Math.round(tree.x + x0), Math.round(tree.y + y0), Math.round(tree.z + z0),
            Math.round(tree.x + x1), Math.round(tree.y + y1), Math.round(tree.z + z1),
            material, kind, tree.x, tree.z, treeShapeLimits(tree.species).reach, shade);
    };
    const trunkWidth = species === 'oak' && size > .45 ? 2 : 1;
    push(0, -1, 0, trunkWidth, Math.max(height, crownBase + 1), trunkWidth, log, kindIndex('rock'));
    const layers = spacing <= 2 ? 3 : spacing <= 4 ? 2 : 1;
    for (let i = 0; i < layers; i++) {
        const t = (i + .5) / layers;
        const width = species === 'spruce' ? radius * (1 - t * .75)
            : radius * (layers === 1 ? .88 : i === 0 ? .8 : i === layers - 1 ? .65 : 1);
        const r = Math.max(1, Math.round(width));
        const y0 = crownBase + i * tall / layers;
        const y1 = crownBase + (i + 1) * tall / layers;
        push(crownX-r, y0, crownZ-r, crownX+r+1, Math.max(y0+1,y1), crownZ+r+1, leaf, leafKind, .92+.04*t);
    }
    return boxes;
}

// Mature species keep their actual height and crown diameter at each LOD.
// Shared scale values cost a few arithmetic operations; distant tiles never
// construct the thousands of individual blocks in a full tree.
function matureTreeSilhouette(tree, spacing, definition, { height, radius, trunkWidth, crownBase }) {
    const result = [], kind = definition.shape.kind;
    const leaf = surfaceMaterialId(`${tree.species}_leaves`), log = surfaceMaterialId(`${tree.species}_log`);
    const leafKind = kindIndex(`${definition.similar}_leaves`), reach = treeShapeLimits(tree.species).reach;
    const append = (x0, y0, z0, x1, y1, z1, material, surfaceKind, shade = .95) => result.push(
        tree.x + Math.round(x0), tree.y + Math.round(y0), tree.z + Math.round(z0),
        tree.x + Math.round(x1), tree.y + Math.round(y1), tree.z + Math.round(z1),
        material, surfaceKind, tree.x, tree.z, reach, shade);
    const top = kind === 'bald_cypress' ? height - 1 : crownBase + 1;
    append(0, 0, 0, trunkWidth, top, trunkWidth, log, kindIndex('rock'));
    if (kind === 'bald_cypress') {
        append(-1, 0, -1, trunkWidth + 1, Math.max(2, Math.round(height * .1)) + 1, trunkWidth + 1, log, kindIndex('rock'));
        const layers = spacing <= 2 ? 6 : spacing <= 4 ? 4 : 2;
        const bottom = crownBase - 1, tall = height - bottom;
        for (let i = 0; i < layers; i++) {
            const t = i / (layers - 1), r = Math.max(1, radius * (1 - .7 * t));
            const y0 = bottom + t * (tall - 3);
            // Layer gaps retain the characteristic light between branches.
            const thickness = i === layers - 1 ? 3 : Math.max(2, tall / layers * .65);
            append(-r, y0, -r, r + 1, Math.min(height, y0 + thickness), r + 1, leaf, leafKind, .92 + t * .06);
        }
    } else if (kind === 'acacia') {
        const bottom = Math.max(2, height - 5);
        if (spacing > 4) append(-radius, bottom + 1, -radius, radius + 1, height, radius + 1, leaf, leafKind);
        else {
            const r = radius * .55;
            append(-r, bottom + 1, -r, r + 1, height, r + 1, leaf, leafKind);
            const lobes = spacing <= 2 ? 4 : 2;
            const phase = seededRandom(tree.seed)() * Math.PI * 2;
            for (let i = 0; i < lobes; i++) {
                const angle = phase + i * Math.PI * 2 / lobes;
                const x = Math.cos(angle) * radius * .48, z = Math.sin(angle) * radius * .48;
                append(x - r, bottom, z - r, x + r + 1, height - 1, z + r + 1, leaf, leafKind);
            }
        }
    } else {
        const layers = spacing <= 2 ? 3 : spacing <= 4 ? 2 : 1;
        const bottom = Math.max(1, crownBase - 1), tall = height - bottom;
        for (let i = 0; i < layers; i++) {
            const r = radius * (layers === 1 ? .9 : i === 0 ? .85 : i === layers - 1 ? .7 : 1);
            append(-r, bottom + i * tall / layers, -r, r + 1, bottom + (i + 1) * tall / layers, r + 1, leaf, leafKind);
        }
    }
    return result;
}

function templateSilhouette(tree, spacing, definition, random) {
    const templates=definition.shape.templates;
    const source=templates[Math.min(templates.length-1,Math.floor(tree.size*templates.length))];
    const turn=Math.floor(random()*4),mirror=random()<.5;
    const leaves=[],logs=[];
    for(const [cx,y,cz,char] of source) {
        let x=mirror?-cx:cx,z=cz;
        for(let i=0;i<turn;i++) [x,z]=[-z,x];
        (char==='P'||char==='@'?logs:leaves).push([x,y,z]);
    }
    const result=[],layers=spacing<=2?3:spacing<=4?2:1;
    const bounds=cells=>[Math.min(...cells.map(c=>c[0])),Math.min(...cells.map(c=>c[1])),Math.min(...cells.map(c=>c[2])),
        Math.max(...cells.map(c=>c[0]))+1,Math.max(...cells.map(c=>c[1]))+1,Math.max(...cells.map(c=>c[2]))+1];
    const append=(b,material,kind)=>result.push(b[0]+tree.x,b[1]+tree.y,b[2]+tree.z,b[3]+tree.x,b[4]+tree.y,b[5]+tree.z,
        material,kind,tree.x,tree.z,treeShapeLimits(tree.species).reach,.95);
    if(logs.length) {
        const bottom=leaves.length?Math.min(...leaves.map(c=>c[1])):Infinity;
        append(bounds(logs.filter(c=>c[1]<=bottom)),surfaceMaterialId(`${tree.species}_log`),kindIndex('rock'));
    }
    if(leaves.length) {
        const range=bounds(leaves),height=range[4]-range[1];
        for(let i=0;i<layers;i++) {
            const cells=leaves.filter(c=>c[1]>=range[1]+i*height/layers&&c[1]<range[1]+(i+1)*height/layers);
            if(cells.length)append(bounds(cells),surfaceMaterialId(`${tree.species}_leaves`),kindIndex(`${definition.similar}_leaves`));
        }
    }
    return result;
}

// Cooperative fallback for environments without workers. Worker completes the
// same iterator with an infinite deadline; descriptor cache is separately bounded.
export function createFarVegetationJob(generator, x0, z0, size, spacing, heights, kinds, cells) {
    const data = [], forest = generator.forests;
    const grid = forest?.grid ?? 4;
    let row = Math.floor(z0 / grid), phase = 0, plantRow = 0;
    const finalRow = Math.ceil((z0 + size) / grid);
    return {
        step(deadline = Infinity) {
            if (spacing > FAR_VEGETATION_MAX_SPACING || !forest?.descriptorAt) return { done: true, data: new Float32Array() };
            while (phase === 0 && row < finalRow) {
                for (let gx = Math.floor(x0 / grid); gx < Math.ceil((x0 + size) / grid); gx++) {
                    const tree = forest.descriptorAt(gx, row);
                    if (tree && tree.x >= x0 && tree.x < x0 + size && tree.z >= z0 && tree.z < z0 + size) {
                        data.push(...treeSilhouette(tree, spacing));
                    }
                }
                row++;
                if (performance.now() >= deadline) return { done: false };
            }
            phase = 1;
            // A sparse representative ground layer persists beyond the full
            // models. Stable cells make coarse levels a subset of finer levels.
            const plantGrid = spacing <= 2 ? 8 : spacing <= 4 ? 16 : 32;
            while (plantRow < size / plantGrid) {
                const z = z0 + plantRow * plantGrid + 2;
                for (let x = x0 + 2; x < x0 + size; x += plantGrid) {
                    const col = Math.min(cells - 1, Math.floor((x - x0) / spacing));
                    const rz = Math.min(cells - 1, Math.floor((z - z0) / spacing));
                    const at = (rz + 1) * (cells + 2) + col + 1, kind = kinds[at];
                    if (!KINDS[kind]?.startsWith('grass') || hash(x, z, generator.plantSeed) % 5 === 0) continue;
                    const y = heights[at], bush = hash(x, z, 17) % 11 === 0;
                    const radius = bush ? 1 : 0;
                    data.push(x - radius, y, z - radius, x + radius + 1, y + (bush ? 2 : 1), z + radius + 1,
                        surfaceMaterialId(KINDS[kind]), kind, x, z, 0, bush ? .75 : -.93);
                }
                plantRow++;
                if (performance.now() >= deadline) return { done: false };
            }
            phase = 2;
            return { done: true, data: Float32Array.from(data) };
        }
    };
}

// Merge into the terrain batch: no per-tree meshes/materials/draw calls. Keep
// packed normals and face albedo consistent with farSamples and its shaders.
export function appendFarVegetation(base, data, x0, z0, palette, albedoPalette, modified = null) {
    if (!data?.length) return base;
    const boxes = [];
    let trees = 0, plants = 0, lastTreeX = NaN, lastTreeZ = NaN;
    for (let at = 0; at < data.length; at += VEGETATION_STRIDE) {
        if (modified?.size) {
            const x = data[at + 8], z = data[at + 9], r = data[at + 10];
            let edited = false;
            for (let cz = Math.floor((z - r) / 16); cz <= Math.floor((z + r) / 16) && !edited; cz++) {
                for (let cx = Math.floor((x - r) / 16); cx <= Math.floor((x + r) / 16); cx++) {
                    if (modified.has(`${cx},${cz}`)) { edited = true; break; }
                }
            }
            if (edited) continue;
        }
        if (data[at + 3] <= data[at] || data[at + 4] <= data[at + 1] || data[at + 5] <= data[at + 2]) continue;
        boxes.push(at);
        if (data[at + 10] === 0) plants++;
        else if (data[at + 8] !== lastTreeX || data[at + 9] !== lastTreeZ) {
            trees++; lastTreeX = data[at + 8]; lastTreeZ = data[at + 9];
        }
    }
    const faceCount = boxes.reduce((sum, at) => sum + (data[at + 11] < 0 ? 4 : 6), 0);
    const startVertex = base.positions.length / 4, vertices = startVertex + faceCount * 4;
    const positions = new Int16Array(vertices * 4), normals = new Int8Array(vertices * 4);
    const colors = new Uint8Array(vertices * 4), surfaceAlbedo = new Uint8Array(vertices * 4);
    positions.set(base.positions); normals.set(base.normals); colors.set(base.colors); surfaceAlbedo.set(base.surfaceAlbedo);
    const Index = vertices > 65535 ? Uint32Array : Uint16Array;
    const indices = new Index(base.indices.length + faceCount * 6), shadowIndices = new Index(base.shadowIndices.length + faceCount * 6);
    indices.set(base.indices); shadowIndices.set(base.shadowIndices);
    let vertex = startVertex, index = base.indices.length, shadow = base.shadowIndices.length;
    const faces = [
        [1, 0, 0, [1,0,0, 1,1,0, 1,1,1, 1,0,1]], [-1,0,0,[0,0,1, 0,1,1, 0,1,0, 0,0,0]],
        [0,1,0,[0,1,0, 0,1,1, 1,1,1, 1,1,0]], [0,-1,0,[0,0,1, 0,0,0, 1,0,0, 1,0,1]],
        [0,0,1,[0,0,1, 1,0,1, 1,1,1, 0,1,1]], [0,0,-1,[1,0,0, 0,0,0, 0,1,0, 1,1,0]]
    ];
    const grassFaces = [
        [1,0,0,[0,0,0, 0,1,0, 0,1,1, 0,0,1]],[-1,0,0,[0,0,1, 0,1,1, 0,1,0, 0,0,0]],
        [0,0,1,[0,0,0, 1,0,0, 1,1,0, 0,1,0]],[0,0,-1,[1,0,0, 0,0,0, 0,1,0, 1,1,0]]
    ];
    for (const at of boxes) {
        const min = [data[at] - x0, data[at + 1], data[at + 2] - z0];
        const max = [data[at + 3] - x0, data[at + 4], data[at + 5] - z0];
        const material = data[at + 6], kind = data[at + 7], shade = Math.sqrt(Math.abs(data[at + 11]));
        const selectedFaces = data[at + 11] < 0 ? grassFaces : faces;
        for (let f = 0; f < selectedFaces.length; f++) {
            const [nx, ny, nz, corners] = selectedFaces[f], first = vertex;
            const legacy = kind * 9 + (ny > 0 ? 0 : ny < 0 ? 6 : 3);
            for (let v = 0; v < 4; v++, vertex++) {
                const p = vertex * 4;
                positions[p] = corners[v * 3] ? max[0] : min[0];
                positions[p + 1] = corners[v * 3 + 1] ? max[1] : min[1];
                positions[p + 2] = corners[v * 3 + 2] ? max[2] : min[2];
                positions[p + 3] = min[1];
                normals[p] = nx * 127; normals[p + 1] = ny * 127; normals[p + 2] = nz * 127;
                for (let c = 0; c < 3; c++) {
                    const albedo = albedoPalette?.[material * 18 + (data[at + 11] < 0 ? 2 : f) * 3 + c] ?? palette[legacy + c];
                    colors[p + c] = Math.round((albedoPalette ? albedo : palette[legacy + c]) * shade);
                    surfaceAlbedo[p + c] = albedo;
                }
                colors[p + 3] = surfaceAlbedo[p + 3] = 255;
            }
            for (const offset of [0,1,2,0,2,3]) {
                indices[index++] = first + offset; shadowIndices[shadow++] = first + offset;
            }
        }
    }
    return { positions, normals, colors, surfaceAlbedo, indices, shadowIndices,
        vegetationStats: { trees, plants, boxes: boxes.length, triangles: faceCount * 2 } };
}
