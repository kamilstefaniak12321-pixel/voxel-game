# ------------------------------------------------------------
# TEKSTURY BUDULCA (bloki, które różnie odbijają światło)
#
# Tynk wapienny (biały - odbija dużo światła), tynk ochrowy (ciepły,
# żółty), terakota (czerwone płytki), polerowany kamień (gładki,
# błyszczący - odbija najwięcej) i ciemne deski (pochłaniają światło).
# Jak mocno blok odbija światło: pole "reflect" w BlockRegistry.js
# (razy średni kolor tekstury) - src/world/BounceLight.js.
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/tekstury_budulec.py [podglad.png]
# Kafelki: TILES niżej - te same, co w ATLAS_TILES
# (src/rendering/TextureAtlas.js).
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tekstury import (  # noqa: E402
    N, ATLAS, XX, YY, rng, fbm, noise, blur, light, cavity, paint, shades,
    normalize, as_image, shift, scatter
)


TILES = {
    'lime_plaster': (12, 1),
    'ochre_plaster': (13, 1),
    'terracotta': (14, 1),
    'polished_stone': (15, 1),
    'dark_planks': (3, 9),
}


def plaster(seed, base, steps=6):
    """Tynk: gładki, z lekkimi śladami kielni (poziome smugi), kilka
    drobnych wgłębień."""
    r = rng(seed)
    # smugi kielni: szum rozciągnięty w poziomie
    strokes = noise(r, 2)[:, :1].repeat(N, axis=1) * 0.5 + noise(r, 4) * 0.5
    strokes = blur(np.roll(strokes, r.integers(0, N), axis=0), 1)
    height = fbm(r, ((2, 0.5), (4, 0.35), (8, 0.15))) * 0.6 + strokes * 0.4
    tone = 0.55 + light(height, 0.9) + cavity(height) * 0.5
    tone += (fbm(r, ((8, 0.6), (16, 0.4))) - 0.5) * 0.08
    palette = shades(base, steps, 0.84, 1.07, (0.96, 0.98, 1.04))
    rgb = paint(palette, normalize(tone) * 0.8 + 0.1)
    # drobne wgłębienia (pory w tynku)
    for x, y in scatter(r, 5, 4.5):
        x, y = int(x) % N, int(y) % N
        rgb[y, x] = np.array(base) * 0.8
        rgb[(y + 1) % N, x] = np.array(base) * 0.92
    return rgb


def lime_plaster():
    return plaster(901, (232, 228, 216))


def ochre_plaster():
    return plaster(902, (214, 162, 86))


def terracotta():
    """Cztery płytki 8 x 8 z fugami, każda trochę inna."""
    r = rng(903)
    base = np.array((184, 94, 60), float)
    rgb = np.zeros((N, N, 3))
    tone = fbm(r, ((2, 0.5), (4, 0.3), (8, 0.2)))
    for ty in range(2):
        for tx in range(2):
            k = 1 + r.uniform(-0.07, 0.07)
            for y in range(8):
                for x in range(8):
                    px, py = tx * 8 + x, ty * 8 + y
                    t = tone[py, px] - 0.5
                    # wypukła płytka: jaśniejsza z lewej góry
                    edge = 0.0
                    if x == 1 or y == 1:
                        edge = 0.08
                    if x == 7 or y == 7:
                        edge = -0.1
                    rgb[py, px] = base * k * (1 + t * 0.16 + edge)
    # fugi (lewa i górna krawędź każdej płytki)
    grout = np.array((150, 128, 112), float)
    for i in (0, 8):
        rgb[i, :] = grout * (0.95 + 0.1 * noise(r, 4)[i, :, None])
        rgb[:, i] = grout * (0.95 + 0.1 * noise(r, 4)[:, i, None])
    return rgb


def polished_stone():
    """Gładka, wypolerowana płyta: delikatne żyłki, fazowany brzeg,
    jaśniejszy połysk po skosie."""
    r = rng(904)
    base = np.array((178, 180, 182), float)
    veins = fbm(r, ((2, 0.4), (4, 0.4), (8, 0.2)))
    vein = np.abs(np.sin((veins * 3.2 + XX / N * 0.6) * np.pi))
    tone = 0.62 + (1 - vein) ** 6 * -0.18 + (fbm(r, ((8, 1.0),)) - 0.5) * 0.04
    # połysk: pas po skosie
    gloss = np.exp(-((XX + YY - 10) / 4.5) ** 2) * 0.12
    tone += gloss
    palette = shades(base, 8, 0.74, 1.18, (0.97, 0.99, 1.04))
    rgb = paint(palette, np.clip(tone, 0, 1), smooth=0)
    # fazowany brzeg: góra i lewo jaśniej, dół i prawo ciemniej
    rgb[0, :] = np.clip(base * 1.16, 0, 255)
    rgb[:, 0] = np.clip(base * 1.12, 0, 255)
    rgb[N - 1, :] = base * 0.72
    rgb[:, N - 1] = base * 0.76
    return rgb


def dark_planks(atlas):
    """Ciemne (bejcowane) deski: deski dębowe w ciemnym kolorze."""
    x0, y0 = 4 * N, 7 * N
    oak = np.array(atlas.crop((x0, y0, x0 + N, y0 + N)).convert('RGB'), float)
    lum = oak @ np.array([0.3, 0.55, 0.15])
    t = normalize(lum)
    palette = shades((62, 44, 34), 7, 0.55, 1.35, (0.92, 0.96, 1.1))
    return paint(palette, t * 0.9 + 0.05, smooth=0)


def generate(atlas):
    painted = {
        'lime_plaster': lime_plaster(),
        'ochre_plaster': ochre_plaster(),
        'terracotta': terracotta(),
        'polished_stone': polished_stone(),
        'dark_planks': dark_planks(atlas),
    }
    for name, rgb in painted.items():
        x, y = TILES[name]
        atlas.paste(as_image(rgb), (x * N, y * N))
    return painted


def main():
    atlas = Image.open(ATLAS).convert('RGBA')
    generate(atlas)
    atlas.save(ATLAS)
    print('Zapisano:', ', '.join(TILES))
    if len(sys.argv) > 1:
        tiles = [atlas.crop((x * N, y * N, x * N + N, y * N + N)) for x, y in TILES.values()]
        out = Image.new('RGBA', (N * len(tiles) * 8, N * 8), (0, 0, 0, 0))
        for i, tile in enumerate(tiles):
            out.paste(tile.resize((N * 8, N * 8), Image.NEAREST), (i * N * 8, 0))
        out.save(sys.argv[1])
        print('Podgląd:', sys.argv[1])


if __name__ == '__main__':
    main()
