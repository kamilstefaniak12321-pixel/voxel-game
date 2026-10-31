// ------------------------------------------------------------
// IKONKA MAŁEJ ROŚLINY Z PIKSELI (kępka z paczki roślin -
// src/rendering/TuftGeometry.js)
//
// Model widziany z ukosa i z góry, jak bloki w ekwipunku: rozeta,
// łodygi i kwiaty jako małe kostki. Ściany od najdalszej (malarz), każdy
// piksel ikonki bez wygładzania - ostre krawędzie pikseli modelu.
// Kierunek ściany z jej wierzchołków (płaska wzdłuż jednej osi) -
// normalne kępki są odchylone w górę dla światła.
//
// Bez DOM - zwraca piksele RGBA, więc to samo rysuje gra
// (src/ui/BlockIcons.js) i wiki (tools/wiki_dane.mjs).
// ------------------------------------------------------------

const VIEW_YAW = 35 * Math.PI / 180;
const VIEW_PITCH = 30 * Math.PI / 180;

// Cień ścian: patrzące w bok (x), z góry (y), do przodu (z).
const FACE_SHADE = [0.72, 1, 0.86];

function srgbByte(linear) {

    const value = linear / 255;

    return Math.round((value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255);

}

function flatAxis(face) {

    for (let axis = 0; axis < 3; axis++) {
        const values = face.vertices.map((v) => v[axis]);
        if (Math.max(...values) - Math.min(...values) < 1e-6) return axis;
    }

    return 1;

}

// faces - ściany modelu (vertices w blokach, color - liniowe RGB 0-255);
// zwraca Uint8ClampedArray size x size x 4.

export function pixelPlantIconPixels(faces, size) {

    const pixels = new Uint8ClampedArray(size * size * 4);

    const sa = Math.sin(VIEW_YAW), ca = Math.cos(VIEW_YAW);
    const sp = Math.sin(VIEW_PITCH), cp = Math.cos(VIEW_PITCH);

    // Ekran: w prawo, w górę, odległość do oka.
    const project = ([x, y, z]) => [x * ca - z * sa, -x * sa * sp + y * cp - z * ca * sp, x * sa * cp + y * sp + z * ca * cp];

    const shapes = faces.map((face) => {
        const points = face.vertices.map(project);
        const shade = FACE_SHADE[flatAxis(face)];
        return {
            points,
            depth: points.reduce((sum, p) => sum + p[2], 0) / points.length,
            color: face.color.map((c) => srgbByte(c * shade))
        };
    }).sort((a, b) => a.depth - b.depth);

    const all = shapes.flatMap((shape) => shape.points);

    if (all.length === 0) {
        return pixels;
    }

    const minU = Math.min(...all.map((p) => p[0])), maxU = Math.max(...all.map((p) => p[0]));
    const minV = Math.min(...all.map((p) => p[1])), maxV = Math.max(...all.map((p) => p[1]));
    const scale = size * 0.86 / Math.max(maxU - minU, maxV - minV, 1e-6);
    const left = (size - (maxU - minU) * scale) / 2;
    const bottom = size - (size - (maxV - minV) * scale) / 2;

    for (const shape of shapes) {

        const points = shape.points.map(([u, v]) => [left + (u - minU) * scale, bottom - (v - minV) * scale]);
        const x0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p[0]))));
        const x1 = Math.min(size - 1, Math.ceil(Math.max(...points.map((p) => p[0]))));
        const y0 = Math.max(0, Math.floor(Math.min(...points.map((p) => p[1]))));
        const y1 = Math.min(size - 1, Math.ceil(Math.max(...points.map((p) => p[1]))));

        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {

                const px = x + 0.5, py = y + 0.5;
                let inside = false;

                for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                    const [ax, ay] = points[i], [bx, by] = points[j];
                    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
                }

                if (inside) {
                    const k = (y * size + x) * 4;
                    pixels[k] = shape.color[0];
                    pixels[k + 1] = shape.color[1];
                    pixels[k + 2] = shape.color[2];
                    pixels[k + 3] = 255;
                }

            }
        }

    }

    return pixels;

}
