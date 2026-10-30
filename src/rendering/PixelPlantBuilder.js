// Model pixels are exactly 1/16 block. Greedy rectangles preserve the stepped
// silhouette while avoiding one draw face per pixel; solids omit internal faces.
export const PLANT_PIXEL = 1 / 16;

export function pixelRectangles(source) {
    const cells = new Map(source);
    const result = [];
    const ordered = [...cells.keys()].map(key => key.split(',').map(Number))
        .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [u, v] of ordered) {
        const color = cells.get(`${u},${v}`);
        if (color === undefined) continue;
        let width = 1, height = 1;
        while (cells.get(`${u + width},${v}`) === color) width++;
        rows: while (true) {
            for (let i = 0; i < width; i++) {
                if (cells.get(`${u + i},${v + height}`) !== color) break rows;
            }
            height++;
        }
        for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) cells.delete(`${u+i},${v+j}`);
        result.push({ u, v, width, height, color });
    }
    return result;
}

export function createPixelPlant(palette, floating, movement, motionHeight) {
    const faces = [], voxels = new Map();
    function face(vertices, axis, sign, color) {
        // Initial winding: XY +Z, ZY -X, XZ -Y. Reverse for the other side.
        if (sign !== (axis === 2 ? 1 : -1)) vertices = [vertices[0], vertices[2], vertices[1], vertices[3]];
        const normal = [0, 0, 0]; normal[axis] = sign;
        const weights = vertices.map(p => floating ? 255 : Math.round(Math.min(1, p[1] / motionHeight) * 255));
        faces.push({ vertices, normal, color: palette[color], weights, movement });
    }
    function surface(axis, plane, rectangle, sign = 0) {
        const { u, v, width: w, height: h, color } = rectangle;
        const point = (a, b) => (axis === 0 ? [plane, b, a] : axis === 1 ? [a, plane, b] : [a, b, plane])
            .map(value => value * PLANT_PIXEL);
        const vertices = [point(u, v+h), point(u+w, v+h), point(u, v), point(u+w, v)];
        if (sign) face(vertices, axis, sign, color);
        else { face(vertices, axis, 1, color); face(vertices, axis, -1, color); }
    }
    function sheet(axis, plane, draw) {
        const cells = new Map();
        const pixel = (u, v, color) => cells.set(`${u},${v}`, color);
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
        for (const rectangle of pixelRectangles(cells)) surface(axis, plane, rectangle);
    }
    function box(x, y, z, width, height, depth, color, cap = color) {
        for (let j=0; j<height; j++) for (let k=0; k<depth; k++) for (let i=0; i<width; i++) {
            voxels.set(`${x+i},${y+j},${z+k}`, j === height-1 ? cap : color);
        }
    }
    function finish() {
        const planes = new Map();
        for (const [key, color] of voxels) {
            const p = key.split(',').map(Number);
            for (let axis=0; axis<3; axis++) for (const sign of [-1, 1]) {
                const neighbor = [...p]; neighbor[axis] += sign;
                if (voxels.has(neighbor.join(','))) continue;
                const plane = p[axis] + (sign > 0 ? 1 : 0);
                const planeKey = `${axis},${sign},${plane}`;
                if (!planes.has(planeKey)) planes.set(planeKey, new Map());
                const u = axis === 0 ? p[2] : p[0], v = axis === 1 ? p[2] : p[1];
                planes.get(planeKey).set(`${u},${v}`, color);
            }
        }
        for (const [key, cells] of planes) {
            const [axis, sign, plane] = key.split(',').map(Number);
            for (const rectangle of pixelRectangles(cells)) surface(axis, plane, rectangle, sign);
        }
        return faces;
    }
    return { sheet, box, finish };
}
