import { BUSHY_GRASS_CARDS } from '../../assets/models/bushy-grass/model-data.js';
import { BUSHY_GRASS_TEXTURE } from '../blocks/bushyGrass.js';
import { SURFACE_PROFILES } from './SurfaceProfiles.js';

const cache = new Map();
const orders = [[0, 3, 1, 2], [3, 0, 2, 1]];
const inset = .02 / 16;
const orientation = card => card.vertices.every(point => point[0] === card.vertices[0][0]) ? 0 : 2;
const families = [0, 2].map(axis => BUSHY_GRASS_CARDS.filter(card => orientation(card) === axis)
    .sort((a, b) => a.vertices[0][axis] - b.vertices[0][axis]));
// Four outer cards retain equal coverage on both sides of each axis. At the
// last LOD, move one original card per axis to the centre rather than letting
// the tuft's silhouette drift towards one side. The texture/height stay equal.
const models = [BUSHY_GRASS_CARDS, families.flatMap(cards => [cards[0], cards.at(-1)]),
    families.map(cards => {
        const card = cards[0], axis = orientation(card);
        return { ...card, vertices: card.vertices.map(point => point.map((n, i) => i === axis ? 0 : n)) };
    })];

export function getBushyGrassFaces(tall, variant, detail = 0) {
    detail = Math.max(0, Math.min(2, detail | 0));
    // Existing chunk placement already rotates/jitters each tuft. Reuse one
    // immutable template per size/LOD instead of duplicating it for variants.
    const key = `${!!tall}:${detail}`;
    if (cache.has(key)) return cache.get(key);
    const height = tall ? 1 : .75, faces = [];
    for (const card of models[detail]) {
        const [a, b, , d] = card.vertices;
        const ab = b.map((n, i) => n - a[i]), ad = d.map((n, i) => n - a[i]);
        const cross = [ab[1] * ad[2] - ab[2] * ad[1], ab[2] * ad[0] - ab[0] * ad[2], ab[0] * ad[1] - ab[1] * ad[0]];
        const length = Math.hypot(...cross), normal = cross.map(n => n / length);
        const center = [0, 1].map(axis => card.uv.reduce((sum, uv) => sum + uv[axis], 0) / 4);
        for (const order of orders) {
            const vertices = order.map(index => card.vertices[index].map((n, axis) => axis === 1 ? n * height : n));
            faces.push({
                vertices,
                uv: order.map(index => card.uv[index].map((n, axis) => n + Math.sign(center[axis] - n) * inset)),
                normal: order[0] === 0 ? normal : normal.map(n => -n),
                texture: BUSHY_GRASS_TEXTURE, color: [255, 255, 255],
                surfaceProfile: SURFACE_PROFILES.leaf, movement: 0,
                // The existing shared wind shader bends only the upper part.
                // Source position bobbing is intentionally absent: roots stay put.
                weights: vertices.map(point => Math.round(Math.min(1, point[1] / height) * 255))
            });
        }
    }
    cache.set(key, faces);
    return faces;
}
