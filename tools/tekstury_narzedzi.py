# ------------------------------------------------------------
# IKONKI NARZĘDZI I SUROWCÓW (wiersz 9 atlasu)
#
# Patyk, kilof i łopata - w tym samym stylu co siekiera i inne
# przedmioty drzew (tools/tekstury_drzew.py): kształt z ciemnym
# obrysem, wypukły (jaśniejszy z lewej góry). Trzonek zawsze idzie
# od lewego dołu do prawej góry - jak w Minecrafcie, więc w ręce
# (src/player/FirstPersonHand.js) głowica jest w głębi ekranu.
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/tekstury_narzedzi.py [podglad.png]
# Kafelki: TILES niżej - te same, co w ATLAS_TILES
# (src/rendering/TextureAtlas.js).
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image
from atlasy import read_texture, write_texture

# ATLAS jest roboczą kompozycją kafelków; zapis trafia do arkuszy tematycznych.

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tekstury import N, ATLAS, ROOT, XX, YY, shades  # noqa: E402
from tekstury_drzew import (  # noqa: E402
    empty, put, outline, shade_shape, line_cells, as_image, preview
)


TILES = {
    'stick': (0, 9),
    'pickaxe': (1, 9),
    'shovel': (2, 9),
}

WOOD = (150, 104, 60)
WOOD_DARK = (112, 76, 44)
STONE = (146, 150, 156)


def handle(img, x0, y0, x1, y1):
    """Drewniany trzonek: jasny wierzch, ciemniejszy spód."""
    for x, y in line_cells(x0, y0, x1, y1):
        put(img, x, y, WOOD)
        put(img, x + 1, y, WOOD_DARK)


def stick():
    img = empty()
    for i, (x, y) in enumerate(line_cells(3, 13, 12, 4)):
        # sęk w połowie i lekko jaśniejszy koniec
        light = (176, 128, 78) if i in (0, 1) else WOOD
        put(img, x, y, light)
        put(img, x + 1, y, WOOD_DARK)
    put(img, 8, 9, (96, 64, 36))
    put(img, 7, 8, (126, 88, 50))
    return outline(img, 0.4)


def pickaxe():
    img = empty()
    handle(img, 2, 14, 10, 6)
    # głowica: łuk w poprzek trzonka (od lewej góry do prawego dołu),
    # wygięty na zewnątrz, grubszy w środku, ostre końce
    px = XX + 0.5
    py = YY + 0.5
    ax, ay, bx, by = 2.8, 2.4, 13.6, 13.2
    dx, dy = bx - ax, by - ay
    length = np.hypot(dx, dy)
    t = ((px - ax) * dx + (py - ay) * dy) / length ** 2
    # odległość od cięciwy (dodatnia na zewnątrz - w prawo do góry)
    side = ((px - ax) * dy - (py - ay) * dx) / length
    bulge = 4.4 * 4 * t * (1 - t)
    thick = 0.5 + 1.0 * np.sin(np.clip(t, 0, 1) * np.pi)
    head = (t >= 0) & (t <= 1) & (np.abs(side - bulge) <= thick)
    shape = shade_shape(head, shades(STONE, 5, 0.62, 1.32), strength=1.2)
    img[head] = shape[head]
    # jasna krawędź od góry i ciemne gniazdo na trzonek
    for x, y in [(4, 2), (5, 1), (6, 1), (7, 1), (8, 1)]:
        if head[y, x]:
            put(img, x, y, (228, 232, 238))
    put(img, 10, 6, (92, 94, 100))
    return outline(img, 0.38)


def shovel():
    img = empty()
    handle(img, 2, 14, 9, 7)
    # pióro łopaty: zaokrąglony prostokąt wzdłuż przekątnej
    px = XX + 0.5
    py = YY + 0.5
    cx, cy = 11.4, 4.6
    u = ((px - cx) + (py - cy) * -1) / np.sqrt(2)     # wzdłuż trzonka (do prawej góry +)
    v = ((px - cx) + (py - cy)) / np.sqrt(2)          # w poprzek
    blade = (np.abs(v) <= 2.35) & (u >= -2.6) & (u <= 2.9) & ((u <= 1.4) | (np.abs(v) <= 2.35 - (u - 1.4) * 1.1))
    shape = shade_shape(blade, shades(STONE, 5, 0.62, 1.32), strength=1.25)
    img[blade] = shape[blade]
    # tulejka (ciemniejsza) przy trzonku i błysk na krawędzi
    for x, y in [(9, 6), (10, 6), (9, 7)]:
        put(img, x, y, (98, 100, 108))
    for x, y in [(12, 1), (13, 2)]:
        if blade[y, x]:
            put(img, x, y, (230, 234, 240))
    return outline(img, 0.38)


def generate():
    return {'stick': stick(), 'pickaxe': pickaxe(), 'shovel': shovel()}


def main():
    atlas = read_texture(ATLAS)
    tiles = generate()
    for name, img in tiles.items():
        x, y = TILES[name]
        atlas.paste(Image.new('RGBA', (N, N), (0, 0, 0, 0)), (x * N, y * N))
        atlas.paste(as_image(img), (x * N, y * N))
    write_texture(ATLAS, atlas)
    print('Gotowe:', len(tiles), 'ikonki narzędzi w', 'assets/textures/*.png')
    if len(sys.argv) > 1:
        preview(tiles, sys.argv[1])


if __name__ == '__main__':
    main()
