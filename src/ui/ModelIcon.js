// Orthographic preview of the real chunk/item faces. No DOM or WebGL context:
// one depth buffer handles intersecting leaf cards and compound fruit models.
// sampleTexture(name, u, v, rgba) samples the shared atlas with top-left UVs.
const YAW = 35 * Math.PI / 180, PITCH = 25 * Math.PI / 180;
const SA = Math.sin(YAW), CA = Math.cos(YAW), SP = Math.sin(PITCH), CP = Math.cos(PITCH);
const VIEW = [SA * CP, SP, CA * CP];
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => {
    const n = i / 255;
    return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
});
const srgb = n => Math.round(Math.min(1, n <= .0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - .055) * 255);
const edge = (a, b, x, y) => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);

export function modelIconPixels(faces, size, sampleTexture, defaultTexture = 'snow') {
    const pixels = new Uint8ClampedArray(size * size * 4);
    if (!faces.length) return pixels;
    const depth = new Float64Array(size * size).fill(-Infinity);
    const shapes = faces.map(face => ({ face, points: face.vertices.map(([x, y, z]) =>
        [x * CA - z * SA, -x * SA * SP + y * CP - z * CA * SP, x * SA * CP + y * SP + z * CA * CP]) }));
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const { points } of shapes) for (const [u, v] of points) {
        u0 = Math.min(u0, u); u1 = Math.max(u1, u);
        v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    const scale = size * .84 / Math.max(u1 - u0, v1 - v0, 1e-8);
    const left = (size - (u1 - u0) * scale) / 2;
    const bottom = (size + (v1 - v0) * scale) / 2;
    const rgba = new Uint8ClampedArray(4);
    for (const { face, points } of shapes) {
        if (face.normal.reduce((sum, n, i) => sum + n * VIEW[i], 0) <= 1e-8) continue;
        const projected = points.map(([u, v, z]) => [left + (u - u0) * scale, bottom - (v - v0) * scale, z]);
        const shade = .6 + .4 * Math.max(0, -.35 * face.normal[0] + .85 * face.normal[1] + .4 * face.normal[2]);
        const tint = face.color.map(c => c / 255 * shade);
        for (const triangle of [[0, 2, 1], [2, 3, 1]]) {
            const [a, b, c] = triangle.map(i => projected[i]);
            const uv = face.uv && triangle.map(i => face.uv[i]);
            const area = edge(a, b, c[0], c[1]);
            if (Math.abs(area) < 1e-10) continue;
            const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
            const maxX = Math.min(size - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
            const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
            const maxY = Math.min(size - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
            for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
                const wa = edge(b, c, x + .5, y + .5) / area;
                const wb = edge(c, a, x + .5, y + .5) / area;
                const wc = 1 - wa - wb;
                if (wa < -1e-8 || wb < -1e-8 || wc < -1e-8) continue;
                const z = a[2] * wa + b[2] * wb + c[2] * wc, index = y * size + x;
                if (z <= depth[index]) continue;
                let u = .5, v = .5;
                if (uv) {
                    const [ta, tb, tc] = uv;
                    u = ta[0] * wa + tb[0] * wb + tc[0] * wc;
                    v = ta[1] * wa + tb[1] * wb + tc[1] * wc;
                }
                sampleTexture(face.texture ?? defaultTexture, u, v, rgba);
                if (rgba[3] < 90) continue;
                depth[index] = z;
                const p = index * 4;
                for (let channel = 0; channel < 3; channel++) pixels[p + channel] = srgb(LINEAR[rgba[channel]] * tint[channel]);
                pixels[p + 3] = 255;
            }
        }
    }
    return pixels;
}
