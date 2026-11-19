"""Tekstura bryły lodu (1.26.0): zamarznięty gracz stoi w niej
(player/PlayerModel.js - setIce).

  - ice_block - jasnobłękitny lód z białymi smugami, pęcherzykami
                powietrza i ciemniejszymi pęknięciami. Piksele są
                półprzezroczyste (przez lód widać postać).

Kafelek trafia do rosliny.png w wolne miejsce atlasu
(tools/niskie_tekstury.py - install).

Uruchomienie: python3 tools/lod_tekstury.py [podglad.png]
"""
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402


def ice_block():
    rng = random.Random(126)
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            # Lekki ukośny gradient i szum.
            t = (x + y) / 30
            light = 0.86 - 0.12 * t + rng.uniform(-0.03, 0.03)
            r, g, b = int(170 * light + 40), int(214 * light + 30), int(240 * light + 15)
            image.putpixel((x, y), (min(255, r), min(255, g), min(255, b), 150))
    # Białe smugi (szron na ściankach).
    for x0, y0, length in ((1, 2, 6), (8, 9, 6), (3, 12, 4), (10, 1, 4)):
        for k in range(length):
            x, y = x0 + k, y0 - k // 2
            if 0 <= x < 16 and 0 <= y < 16:
                image.putpixel((x, y), (240, 250, 255, 200))
    # Pęcherzyki powietrza.
    for x, y in ((5, 6), (12, 5), (7, 13), (2, 9), (13, 12)):
        image.putpixel((x, y), (250, 254, 255, 215))
    # Pęknięcia.
    for x, y in ((9, 3), (10, 4), (10, 5), (11, 6), (4, 10), (5, 11), (5, 12), (6, 13), (13, 9), (14, 10)):
        image.putpixel((x, y), (96, 146, 186, 210))
    # Krawędzie bryły: jaśniejsze, mocniejsze.
    for k in range(16):
        for x, y in ((k, 0), (k, 15), (0, k), (15, k)):
            image.putpixel((x, y), (214, 238, 252, 205))
    return image


if __name__ == '__main__':
    images = {'ice_block': ice_block()}
    install(images)
    if len(sys.argv) > 1:
        images['ice_block'].resize((128, 128), Image.NEAREST).save(sys.argv[1])
    print('bryła lodu -> rosliny.png')
