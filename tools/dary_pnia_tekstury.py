"""Ikony darów pnia (1.41.0, docs/dary-pnia.md).

Rysowane tutaj (16 x 16), kubek jak w tools/tekstury_ziol.py:
  - birch_sap, maple_sap, palm_sap - kubek soku i listek drzewa,
  - baobab_water                   - kubek wody i kropla,
  - maple_syrup                    - kubek gęstego syropu z zaciekiem.

Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py).

Uruchomienie: python3 tools/dary_pnia_tekstury.py [podglad.png]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

CLAY = {'d': (104, 60, 44), 'm': (150, 88, 62), 'l': (186, 116, 82), 'h': (214, 150, 110)}

# d - cień, m - glina, l - jasna, h - połysk, q - płyn, . - nic.
CUP = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '...dddddddd.....',
    '..dqqqqqqqqd....',
    '..mllllllllmdd..',
    '..mhlllllllm.md.',
    '..mhllllllmm.md.',
    '..mllllllmmmdd..',
    '...mlllllmmd....',
    '...mllllmmmd....',
    '....mmmmmmd.....',
    '....dddddd......',
    '................',
]


def shade(color, k):
    return tuple(max(0, min(255, round(c * k))) for c in color)


def cup(liquid, extra=()):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(CUP):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), (liquid if key == 'q' else CLAY[key]) + (255,))
    # Połysk i cień na płynie.
    for x, k in [(3, 1.12), (4, 1.12), (9, 0.86), (10, 0.86)]:
        image.putpixel((x, 6), shade(liquid, k) + (255,))
    for x, y, color in extra:
        image.putpixel((x, y), color + (255,))
    return image


def leaf(points, color):
    dark = shade(color, 0.72)
    return [(x, y, dark if index % 3 == 2 else color) for index, (x, y) in enumerate(points)]


BIRCH = leaf([(11, 2), (12, 1), (12, 2), (13, 2), (12, 3), (11, 4)], (120, 178, 74))
MAPLE = leaf([(12, 0), (11, 1), (12, 1), (13, 1), (10, 2), (11, 2), (12, 2), (13, 2), (14, 2), (12, 3), (12, 4)], (214, 96, 40))
PALM = leaf([(10, 3), (11, 2), (12, 1), (13, 1), (14, 2), (12, 2), (13, 3), (11, 1), (10, 1)], (74, 150, 66))
WATER = (150, 196, 224)
DROP = [(12, 0, shade(WATER, 1.15)), (12, 1, WATER), (11, 2, WATER), (12, 2, shade(WATER, 1.2)), (13, 2, shade(WATER, 0.85)),
        (11, 3, shade(WATER, 0.9)), (12, 3, WATER), (13, 3, shade(WATER, 0.8))]
SYRUP = (176, 98, 26)
# Zaciek syropu po ściance kubka.
DRIP = [(5, 7, SYRUP), (5, 8, SYRUP), (5, 9, shade(SYRUP, 1.15)), (8, 7, SYRUP), (8, 8, shade(SYRUP, 0.85))]


def textures():
    return {
        'birch_sap': cup((226, 234, 208), BIRCH),
        'maple_sap': cup((232, 214, 160), MAPLE),
        'palm_sap': cup((240, 232, 204), PALM),
        'baobab_water': cup(WATER, DROP),
        'maple_syrup': cup(SYRUP, DRIP + MAPLE[:4]),
    }


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (16 * len(images) * 8, 16 * 8), (60, 80, 60, 255))
        for index, image in enumerate(images.values()):
            big = image.resize((128, 128), Image.NEAREST)
            sheet.paste(big, (index * 128, 0), big)
        sheet.save(sys.argv[1])
    print(f'Zapisano {len(images)} kafelków.')


if __name__ == '__main__':
    main()
