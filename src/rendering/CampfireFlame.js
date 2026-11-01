// The approved 16 × 20 silhouette becomes a small, shared flipbook once on load.
// Nothing is painted or uploaded per frame; the shader only selects an atlas cell.
export const FLAME_FRAMES = 16;
export const FLAME_FPS = 12;
const WIDTH = 16, HEIGHT = 20;

export function makeFlameAtlas(image) {
    const source = document.createElement('canvas');
    source.width = WIDTH; source.height = HEIGHT;
    const context = source.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, WIDTH, HEIGHT).data;
    const atlas = document.createElement('canvas');
    atlas.width = WIDTH * FLAME_FRAMES; atlas.height = HEIGHT;
    const target = atlas.getContext('2d');
    const frames = target.createImageData(atlas.width, atlas.height);
    for (let frame = 0; frame < FLAME_FRAMES; frame++) {
        const phase = frame / FLAME_FRAMES * Math.PI * 2;
        for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
            const height = (HEIGHT - 1 - y) / (HEIGHT - 1);
            // Rooted base, independently flickering tips and rising colour bands.
            // Integer texels retain the original palette and crisp pixel edges.
            const sway = Math.round(Math.sin(phase + y * .42) * height * 1.5);
            const stretch = 1 + .12 * Math.sin(phase + x * .65);
            const sx = x - sway, sy = Math.round(HEIGHT - 1 - (HEIGHT - 1 - y) / stretch);
            if (sx < 0 || sx >= WIDTH || sy < 0 || sy >= HEIGHT) continue;
            const from = (sy * WIDTH + sx) * 4;
            if (!pixels[from + 3]) continue;
            const to = (y * atlas.width + frame * WIDTH + x) * 4;
            frames.data.set(pixels.subarray(from, from + 4), to);
            const rise = Math.round(1 + Math.sin(phase * 2 + y * .7));
            const colour = (Math.min(HEIGHT - 1, sy + rise) * WIDTH + sx) * 4;
            if (pixels[colour + 3]) frames.data.set(pixels.subarray(colour, colour + 3), to);
        }
    }
    target.putImageData(frames, 0, 0);
    return atlas;
}
