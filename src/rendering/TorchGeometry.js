// Model Reactive Torch (MIT, assets/models/torch/LICENSE), jednostka = blok.
// Czyste dane: bez Three.js i DOM, również dla raycastu oraz testów Node.
// Wierzchołki i pozycja płomienia mają x/z względem środka bloku, y od podłoża.
// Wyjątek: getTorchBounds zwraca AABB w układzie KOMÓRKI (x/z od 0 do 1).

export const TORCH_FRAME_COUNT = 20;
export const TORCH_FRAME_SECONDS = 0.1;
export const TORCH_ANIMATION_SECONDS = TORCH_FRAME_COUNT * TORCH_FRAME_SECONDS;
export const TORCH_COLORS = Object.freeze(['plain', 'white', 'orange', 'magenta',
    'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan',
    'purple', 'blue', 'brown', 'green', 'red', 'black']);
export const TORCH_ATTACHMENTS = Object.freeze(['down', 'north', 'south', 'west', 'east']);

export function getTorchAnimationFrame(seconds = 0) {
    const time = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const phase = (time % TORCH_ANIMATION_SECONDS) / TORCH_FRAME_SECONDS;
    const frame = Math.floor(phase);
    return { frame, next: (frame + 1) % TORCH_FRAME_COUNT, mix: phase - frame };
}

export function torchTextureName(colorKey = 'plain') {
    const color = TORCH_COLORS.includes(colorKey) ? colorKey : 'plain';
    return color === 'plain' ? 'torch' : `torch_${color}`;
}

const FACE_NORMAL = {
    north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0],
    up: [0, 1, 0], down: [0, -1, 0]
};
const WALL_ROTATION = { west: 0, east: Math.PI, north: -Math.PI / 2, south: Math.PI / 2 };
const faceCache = new Map();
const boundsCache = new Map();

function attachment(value) { return TORCH_ATTACHMENTS.includes(value) ? value : 'down'; }

// Układ wierzchołków zgodny z pozostałymi modelami gry: trójkąty 0,2,1 / 2,3,1.
// UV modeli Minecrafta są mierzone od lewego górnego rogu obrazu.
function faceVertices(from, to, side) {
    const [x0, y0, z0] = from, [x1, y1, z1] = to;
    switch (side) {
        case 'north': return [[x1,y1,z0], [x0,y1,z0], [x1,y0,z0], [x0,y0,z0]];
        case 'south': return [[x0,y1,z1], [x1,y1,z1], [x0,y0,z1], [x1,y0,z1]];
        case 'east': return [[x1,y1,z1], [x1,y1,z0], [x1,y0,z1], [x1,y0,z0]];
        case 'west': return [[x0,y1,z0], [x0,y1,z1], [x0,y0,z0], [x0,y0,z1]];
        case 'up': return [[x0,y1,z0], [x1,y1,z0], [x0,y1,z1], [x1,y1,z1]];
        default: return [[x0,y0,z1], [x1,y0,z1], [x0,y0,z0], [x1,y0,z0]];
    }
}

function rotateWall([x, y, z], attach, vector = false) {
    if (attach === 'down') return vector ? [x,y,z] : [(x - 8)/16, y/16, (z - 8)/16];
    // Oryginalny model ścienny: przesunięcie (-8,+3.5,0), następnie
    // -22.5° wokół Z przy punkcie (0,3.5,8). attach wskazuje PODPORĘ.
    if (!vector) { x -= 8; z -= 8; }
    const tilt = -Math.PI / 8, c = Math.cos(tilt), s = Math.sin(tilt);
    const tx = x*c - y*s - (vector ? 0 : 8), ty = x*s + y*c;
    const angle = WALL_ROTATION[attach], cy = Math.cos(angle), sy = Math.sin(angle);
    const result = [tx*cy + z*sy, ty, -tx*sy + z*cy];
    if (!vector) { result[1] += 3.5; return result.map(n => n/16); }
    return result;
}

function makeFace(from, to, side, rect, part, colorKey, attach) {
    const [u0, v0, u1, v1] = rect;
    return {
        part,
        texture: torchTextureName(colorKey),
        vertices: faceVertices(from, to, side).map(point => rotateWall(point, attach)),
        normal: rotateWall(FACE_NORMAL[side], attach, true),
        uv: [[u0,v0], [u1,v0], [u0,v1], [u1,v1]].map(pair => pair.map(n => n/16)),
        color: [255,255,255],
        surfaceProfile: part === 'shaft' ? [4,0] : [7,0]
    };
}

/** Wszystkie ściany modelu, z .part = shaft/flame oraz UV od góry obrazu.
 * Płomień ma cztery geometryczne ściany; renderuje je materiał DoubleSide,
 * odwzorowując także wewnętrzne ściany oryginalnego JSON bez dublowania. */
export function getTorchFaces(colorKey = 'plain', attach = 'down') {
    attach = attachment(attach);
    const key = `${torchTextureName(colorKey)}:${attach}`;
    if (faceCache.has(key)) return faceCache.get(key);
    const shaftFrom = [7,0,7], shaftTo = [9,10,9];
    const faces = Object.keys(FACE_NORMAL).map(side => makeFace(shaftFrom, shaftTo, side,
        side === 'down' ? [14,13,16,15] : side === 'up' ? [14,6,16,8] : [14,6,16,16],
        'shaft', colorKey, attach));
    for (const [from, to, side, rect] of [
        [[6.5,7.5,6.5], [9.5,15.5,6.5], 'north', [3,0,0,8]],
        [[9.5,7.5,6.5], [9.5,15.5,9.5], 'east', [6,0,3,8]],
        [[6.5,7.5,9.5], [9.5,15.5,9.5], 'south', [9,0,6,8]],
        [[6.5,7.5,6.5], [6.5,15.5,9.5], 'west', [12,0,9,8]]
    ]) faces.push(makeFace(from, to, side, rect, 'flame', colorKey, attach));
    faceCache.set(key, faces);
    return faces;
}

/** AABB w lokalnych współrzędnych KOMÓRKI: stojąca pochodnia jest na x/z=.5. */
export function getTorchBounds(attach = 'down') {
    attach = attachment(attach);
    if (boundsCache.has(attach)) return boundsCache.get(attach);
    const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
    for (const face of getTorchFaces('plain', attach)) for (const p of face.vertices) {
        for (let axis=0; axis<3; axis++) {
            const value = p[axis] + (axis === 1 ? 0 : 0.5);
            min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value);
        }
    }
    const result = {min, max}; boundsCache.set(attach, result); return result;
}

/** Punkt emisji iskier przy czubku płomienia, względem środka bloku (x/z=0). */
export function getTorchFlamePosition(attach = 'down') {
    return rotateWall([8,14,8], attachment(attach));
}
