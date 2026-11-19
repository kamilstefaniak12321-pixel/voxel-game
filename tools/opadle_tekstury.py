"""Tekstury opadłych owoców (1.22.0): fallen_<owoc>.

Płaska warstwa na ziemi (jak kępki mchu): kilkanaście drobnych owoców
w kolorach ikonki owocu i parę brązowych, nadgniłych - rozrzuconych
zawsze tak samo (losowanie z nazwy owocu). Tło przezroczyste.

Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py - install).

Uruchomienie: python3 tools/opadle_tekstury.py [podglad.png]
"""
import random
import sys
import zlib
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import read_texture  # noqa: E402
from niskie_tekstury import install  # noqa: E402

# owoc -> kafelek ikonki albo trzy kolory (cień, kolor, światło).
FRUITS = {
    'strawberry': 'strawberry', 'blackberry': 'blackberry', 'chili_pepper': 'chili_pepper', 'hazelnut': 'hazelnut',
    'blueberry': 'blueberry', 'aronia': 'item_aronia', 'redcurrant': 'item_redcurrant', 'blackcurrant': 'item_blackcurrant',
    'gooseberry': 'item_gooseberry', 'red_gooseberry': 'item_red_gooseberry', 'raspberry': 'item_raspberry',
    'yellow_raspberry': 'item_yellow_raspberry', 'rose_hip': 'item_rose_hip', 'elderberry': 'item_elderberry',
    'sea_buckthorn_berry': 'item_sea_buckthorn', 'cranberry': 'item_cranberry', 'lingonberry': 'item_lingonberry',
    'wild_strawberry': 'item_wild_strawberry',
    # Cukinia jest zielona - kolory podane wprost.
    'zucchini': ((40, 66, 34), (72, 108, 52), (130, 160, 84)),
    'jablon_jablko': ((132, 30, 30), (196, 52, 44), (232, 150, 80)),
    'olive_oliwki': ((40, 44, 30), (74, 80, 48), (120, 128, 76))
}

ROT = ((70, 48, 30), (98, 70, 42))


def is_green(color):
    r, g, b = color
    return g > r * 1.08 and g > b * 1.08


def palette(source):
    """Trzy kolory owocu z ikonki: najczęstsze niezielone piksele."""
    if not isinstance(source, str):
        return source
    image = read_texture(source).convert('RGBA')
    counts = {}
    for r, g, b, a in image.get_flattened_data():
        if a < 200 or is_green((r, g, b)):
            continue
        counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    if not counts:
        raise ValueError(f'{source}: brak koloru owocu')
    common = sorted(counts, key=counts.get, reverse=True)[:6]
    ordered = sorted(common, key=sum)
    return ordered[0], ordered[len(ordered) // 2], ordered[-1]


def fallen(name, source):
    dark, mid, light = palette(source)
    rng = random.Random(zlib.crc32(name.encode()))
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    taken = set()
    placed = 0
    for attempt in range(200):
        if placed >= 13:
            break
        x, y = rng.randrange(0, 15), rng.randrange(0, 15)
        cells = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
        # Owoce nie stykają się bokami.
        if any((cx + dx, cy + dy) in taken for cx, cy in cells for dx in (-1, 0, 1) for dy in (-1, 0, 1)):
            continue
        rotten = placed % 5 == 4
        colors = (ROT[0], ROT[1], ROT[1]) if rotten else (dark, mid, light)
        small = rng.random() < 0.35
        image.putpixel((x, y), (*colors[2], 255))
        taken.add((x, y))
        if not small:
            image.putpixel((x + 1, y), (*colors[1], 255))
            image.putpixel((x, y + 1), (*colors[1], 255))
            image.putpixel((x + 1, y + 1), (*colors[0], 255))
            taken.update(cells)
        placed += 1
    return image


def textures():
    return {f'fallen_{name}': fallen(name, source) for name, source in FRUITS.items()}


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (len(images) * 68 + 4, 72), (96, 128, 70, 255))
        for index, image in enumerate(images.values()):
            sheet.alpha_composite(image.resize((64, 64), Image.NEAREST), (4 + index * 68, 4))
        sheet.save(sys.argv[1])
    print(f'{len(images)} tekstur opadłych owoców -> rosliny.png')


if __name__ == '__main__':
    main()
