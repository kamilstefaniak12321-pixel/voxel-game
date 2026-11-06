// Authored brown bark overlays are composed once at atlas load. The world
// reuses ordinary opaque faces, so a smoother trunk needs no extra geometry.
export const PINE_BARK_TEXTURES = [
    { name: 'pine_log_transition_1', overlay: 'pine_bark_overlay_dense' },
    { name: 'pine_log_transition_2', overlay: 'pine_bark_overlay_medium' },
    { name: 'pine_log_transition_3', overlay: 'pine_bark_overlay_sparse' }
];

export function drawPineBarkTextures(context, tiles, size = 16, overrides = new Set()) {
    const base = tiles.pine_log_upper_side;
    context.save();
    context.imageSmoothingEnabled = false;
    context.globalCompositeOperation = 'source-over';
    for (const { name, overlay } of PINE_BARK_TEXTURES) {
        if (overrides.has(name)) continue;
        const target = tiles[name], layer = tiles[overlay];
        const x = target.x * size, y = target.y * size;
        context.clearRect(x, y, size, size);
        for (const source of [base, layer]) {
            context.drawImage(context.canvas, source.x * size, source.y * size,
                size, size, x, y, size, size);
        }
    }
    context.restore();
}
