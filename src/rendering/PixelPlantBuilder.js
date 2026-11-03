// Model pixels are exactly 1/16 block. Greedy rectangles preserve the stepped
// silhouette while avoiding one draw face per pixel; solids omit internal faces.
import { pixelSurfaceProfile } from './SurfaceProfiles.js';
export const PLANT_PIXEL = 1 / 16;

// Klucze liczbowe zamiast tekstu "x,y,z" - duże modele (krzew indygowca,
// kilkaset kostek) budują się kilka razy szybciej. Współrzędne pikseli
// w zakresie -512..511.
const SPAN = 1024, HALF = 512;
const cellKey = (u, v) => (u + HALF) * SPAN + (v + HALF);
const voxelKey = (x, y, z) => ((x + HALF) * SPAN + (y + HALF)) * SPAN + (z + HALF);

// Prostokąty z pikseli (cells: Map klucz "u,v" -> kolor) - jak niżej, dla
// map z kluczami tekstowymi (tools/sprawdz_modele_roslin_rzecznych.mjs).
export function pixelRectangles(source) {
    const numeric = new Map();
    for (const [key, color] of source) {
        const [u, v] = key.split(',').map(Number);
        numeric.set(cellKey(u, v), color);
    }
    return cellRectangles(numeric);
}

// Kolejność jak dawniej: wiersz po wierszu (v), w wierszu od lewej (u);
// z każdego piksela najszerszy, potem najwyższy prostokąt jednego koloru.
function cellRectangles(cells) {
    const result = [];
    const ordered = [...cells.keys()].sort((a, b) => (a % SPAN) - (b % SPAN) || a - b);
    for (const key of ordered) {
        const color = cells.get(key);
        if (color === undefined) continue;
        const u = Math.floor(key / SPAN) - HALF, v = (key % SPAN) - HALF;
        let width = 1, height = 1;
        while (cells.get(cellKey(u + width, v)) === color) width++;
        rows: while (true) {
            for (let i = 0; i < width; i++) {
                if (cells.get(cellKey(u + i, v + height)) !== color) break rows;
            }
            height++;
        }
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) cells.delete(cellKey(u + i, v + j));
        result.push({ u, v, width, height, color });
    }
    return result;
}

export function createPixelPlant(palette, floating, movement, motionHeight, roles = null) {
    const faces = [], voxels = new Map();
    function face(vertices, axis, sign, color, sheet) {
        // Initial winding: XY +Z, ZY -X, XZ -Y. Reverse for the other side.
        if (sign !== (axis === 2 ? 1 : -1)) vertices = [vertices[0], vertices[2], vertices[1], vertices[3]];
        const normal = [0, 0, 0]; normal[axis] = sign;
        const weights = vertices.map(p => floating ? 255 : Math.round(Math.min(1, p[1] / motionHeight) * 255));
        faces.push({ vertices, normal, color: palette[color], weights, movement,
            surfaceProfile: pixelSurfaceProfile(color, sheet, roles) });
    }
    function surface(axis, plane, rectangle, sign = 0, sheet = false) {
        const { u, v, width: w, height: h, color } = rectangle;
        const point = (a, b) => (axis === 0 ? [plane, b, a] : axis === 1 ? [a, plane, b] : [a, b, plane])
            .map(value => value * PLANT_PIXEL);
        const vertices = [point(u, v+h), point(u+w, v+h), point(u, v), point(u+w, v)];
        if (sign) face(vertices, axis, sign, color, sheet);
        else { face(vertices, axis, 1, color, true); face(vertices, axis, -1, color, true); }
    }
    // sign: 0 - widać z obu stron, 1 / -1 - tylko z jednej (np. dywan
    // liści na ziemi - od spodu nikt nie patrzy).
    function sheet(axis, plane, draw, sign = 0) {
        const cells = new Map();
        const pixel = (u, v, color) => {
            // Ten sam piksel narysowany jeszcze raz - nowy kolor, ale na
            // starym miejscu w kolejności (jak w mapie z kluczami "u,v").
            cells.set(cellKey(u, v), color);
        };
        const rect = (u, v, w, h, color) => {
            for (let j=0; j<h; j++) for (let i=0; i<w; i++) pixel(u+i, v+j, color);
        };
        // One-pixel tips and two-pixel bases; each edge follows the pixel grid.
        const leaf = (root, bottom, spread, height, color) => {
            for (let y=0; y<height; y++) {
                const t = y / Math.max(1, height-1);
                const x = root + Math.round(spread * t * t);
                rect(x, bottom+y, t < .55 ? 2 : 1, 1, color);
            }
        };
        draw({ pixel, rect, leaf });
        for (const rectangle of cellRectangles(cells)) surface(axis, plane, rectangle, sign, true);
    }
    function box(x, y, z, width, height, depth, color, cap = color) {
        for (let j=0; j<height; j++) for (let k=0; k<depth; k++) for (let i=0; i<width; i++) {
            voxels.set(voxelKey(x+i, y+j, z+k), j === height-1 ? cap : color);
        }
    }
    function finish() {
        const planes = new Map();
        const steps = [SPAN * SPAN, SPAN, 1];
        for (const [key, color] of voxels) {
            const p = [Math.floor(key / (SPAN * SPAN)) - HALF, Math.floor(key / SPAN) % SPAN - HALF, key % SPAN - HALF];
            for (let axis=0; axis<3; axis++) for (const sign of [-1, 1]) {
                if (voxels.has(key + sign * steps[axis])) continue;
                const plane = p[axis] + (sign > 0 ? 1 : 0);
                const planeKey = `${axis},${sign},${plane}`;
                if (!planes.has(planeKey)) planes.set(planeKey, new Map());
                const u = axis === 0 ? p[2] : p[0], v = axis === 1 ? p[2] : p[1];
                planes.get(planeKey).set(cellKey(u, v), color);
            }
        }
        for (const [key, cells] of planes) {
            const [axis, sign, plane] = key.split(',').map(Number);
            for (const rectangle of cellRectangles(cells)) surface(axis, plane, rectangle, sign);
        }
        return faces;
    }
    return { sheet, box, finish };
}
