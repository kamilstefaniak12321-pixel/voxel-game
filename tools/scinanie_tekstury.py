"""Ikonka do ścinania drzew (1.36.0).

Rysowana tutaj, piksel po pikselu (16 x 16):
  - konar - gruba gałąź z korą, jasnym przekrojem na końcu i odnogą.

Kafelek trafia do arkusza rosliny.png w wolne miejsce atlasu
(tools/niskie_tekstury.py).

Uruchomienie: python3 tools/scinanie_tekstury.py [podglad.png]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

COLORS = {
    # kontur, kora, jasna kora, przekrój, słój przekroju
    'o': (70, 48, 30), 'b': (116, 82, 50), 'l': (150, 110, 70), 'w': (214, 178, 122), 'r': (176, 136, 84)
}

KONAR = [
    '................',
    '..........oo....',
    '.........owwo...',
    '........owrwo...',
    '...oo..oblwo....',
    '..oblooblbo.....',
    '..obllblbo......',
    '...oblblo.......',
    '...oblbo........',
    '..oblbo.........',
    '..obbo..oo......',
    '.oblbooobo......',
    '.oblbllbo.......',
    '.owrbbbo........',
    '..owwoo.........',
    '...oo...........',
]


def draw(rows):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), COLORS[key] + (255,))
    return image


def textures():
    return {'konar': draw(KONAR)}


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (16 * len(images) * 8, 16 * 8), (60, 80, 60, 255))
        for index, image in enumerate(images.values()):
            big = image.resize((128, 128), Image.NEAREST)
            sheet.paste(big, (index * 128, 0), big)
        sheet.save(sys.argv[1])
    print(f'Zapisano {len(images)} kafelki.')


if __name__ == '__main__':
    main()
