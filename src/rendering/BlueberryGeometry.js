import { BLUEBERRY_MODELS } from '../../assets/models/blueberry/model-data.js';

// Same four-vertex templates as the other chunk plants. Only leaf sheets
// need a back face; berries are closed cubes. No meshes/materials per bush.
const cache = new Map();
export function getBlueberryFaces(stage) {
    if (cache.has(stage)) return cache.get(stage);
    const parts = BLUEBERRY_MODELS[stage];
    if (!parts) throw new Error(`Nieznany etap borówki: ${stage}`);
    const faces = [];
    for (const part of parts) {
        // One displacement per berry keeps each little cube rigid in wind.
        const points = part.faces.flatMap(face => face.v);
        const berryY = points.reduce((sum, p) => sum + p[1], 0) / points.length;
        for (const source of part.faces) {
            const [a, b, , d] = source.v;
            const ab = b.map((n, i) => n - a[i]), ad = d.map((n, i) => n - a[i]);
            const cross = [ab[1]*ad[2]-ab[2]*ad[1], ab[2]*ad[0]-ab[0]*ad[2], ab[0]*ad[1]-ab[1]*ad[0]];
            const length = Math.hypot(...cross);
            const normal = cross.map(n => n / length);
            // Source: perimeter order. Chunk indices: 0,2,1 / 2,3,1.
            for (const order of part.berry ? [[0,3,1,2]] : [[0,3,1,2],[3,0,2,1]]) {
                const vertices = order.map(i => source.v[i]);
                const center = [0,1].map(axis => source.uv.reduce((sum, uv) => sum + uv[axis], 0) / 4);
                // Keep both 16px leaf tiles and 1px berry swatches off seams.
                const uv = order.map(i => source.uv[i].map((n, axis) => n + Math.sign(center[axis] - n) * .02 / 64));
                faces.push({ vertices, uv, normal: order[0] === 0 ? normal : normal.map(n => -n),
                    color: [255,255,255], movement: 0,
                    weights: vertices.map(p => Math.round(102 * Math.min(1, (part.berry ? berryY : p[1]) / .75) ** 2)) });
            }
        }
    }
    cache.set(stage, faces);
    return faces;
}
