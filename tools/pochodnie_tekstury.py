"""Ikonki do wypalających się pochodni (1.35.0).

Rysowane tutaj, piksel po pikselu (16 x 16), na wzór ikonki patyka:
  - luczywo    - szczapa żywicznego drewna: jaśniejsza, szersza u góry,
                 z bursztynowymi kroplami żywicy,
  - torch_stub - ogarek: krótki patyk ze zwęglonym końcem.

Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py).

Uruchomienie: python3 tools/pochodnie_tekstury.py [podglad.png]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

COLORS = {
    # łuczywo: kontur, drewno, jasne drewno, żywica, błysk żywicy
    'o': (128, 84, 36), 'w': (196, 142, 70), 'l': (232, 190, 110), 'r': (224, 138, 30), 'g': (255, 214, 110),
    # ogarek: kontur patyka, patyk, zwęglone, popiół, żar
    'k': (112, 76, 44), 's': (150, 104, 60), 'c': (38, 32, 30), 'a': (96, 90, 86), 'e': (214, 84, 30)
}

LUCZYWO = [
    '................',
    '.............o..',
    '...........oolo.',
    '..........owlgo.',
    '.........owlwo..',
    '........owrwo...',
    '.......owlwo....',
    '......owlwo.....',
    '.....owlgo......',
    '....owrwo.......',
    '...owlwo........',
    '..owlwo.........',
    '..owwo..........',
    '..ooo...........',
    '................',
    '................',
]

STUB = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.........a......',
    '........ccc.....',
    '.......cec......',
    '......kcc.......',
    '.....ksk........',
    '....ksk.........',
    '...ksk..........',
    '..ksk...........',
    '..sk............',
    '................',
    '................',
]


def draw(rows):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), COLORS[key] + (255,))
    return image


def textures():
    return {'luczywo': draw(LUCZYWO), 'torch_stub': draw(STUB)}


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (16 * len(images) * 8, 16 * 8), (60, 80, 60, 255))
        for index, image in enumerate(images.values()):
            sheet.paste(image.resize((128, 128), Image.NEAREST), (index * 128, 0), image.resize((128, 128), Image.NEAREST))
        sheet.save(sys.argv[1])
    print(f'Zapisano {len(images)} kafelki.')


if __name__ == '__main__':
    main()
