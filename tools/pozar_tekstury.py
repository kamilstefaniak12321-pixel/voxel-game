"""Tekstury pożaru (1.43.0, docs/pozar.md).

Rysowane tutaj (16 x 16):
  - charred_log_side, charred_log_top - zwęglony pień: spękany węgiel,
  - ash_layer  - płaska warstwa popiołu na ziemi (z przezroczystością),
  - charcoal, ash - ikony przedmiotów.

Kafelki trafiają do arkusza w wolne miejsca atlasu
(tools/niskie_tekstury.py).

Uruchomienie: python3 tools/pozar_tekstury.py [podglad.png]
"""
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

COAL = [(22, 20, 21), (30, 28, 29), (40, 37, 38), (52, 49, 50)]
CRACK = (10, 9, 10)
GLINT = (78, 76, 82)
ASHES = [(150, 148, 144), (170, 168, 163), (128, 126, 123), (192, 190, 186), (104, 102, 100)]


def charred_side():
    rng = random.Random(4301)
    image = Image.new('RGBA', (16, 16))
    # Pionowe łuski węgla: kolumny o różnej jasności.
    columns = [rng.choice([0, 1, 1, 2]) for _ in range(16)]
    for x in range(16):
        for y in range(16):
            tone = columns[x] + (1 if rng.random() < 0.18 else 0) - (1 if rng.random() < 0.15 else 0)
            image.putpixel((x, y), COAL[max(0, min(3, tone))] + (255,))
    # Poprzeczne i podłużne spękania (kostka węgla).
    for y in (3, 8, 12):
        shift = rng.randrange(16)
        for x in range(16):
            if (x + shift) % 16 not in (5, 11) and rng.random() < 0.82:
                image.putpixel((x, (y + (1 if (x + shift) % 7 == 0 else 0)) % 16), CRACK + (255,))
    for x in (2, 6, 10, 14):
        for y in range(16):
            if rng.random() < 0.5:
                image.putpixel((x, y), CRACK + (255,))
    for _ in range(7):
        image.putpixel((rng.randrange(16), rng.randrange(16)), GLINT + (255,))
    return image


def charred_top():
    rng = random.Random(4302)
    image = Image.new('RGBA', (16, 16))
    for x in range(16):
        for y in range(16):
            ring = max(abs(x - 7.5), abs(y - 7.5))
            tone = 1 + (1 if int(ring) % 3 == 0 else 0) - (1 if ring > 7 else 0) + (1 if rng.random() < 0.12 else 0)
            image.putpixel((x, y), COAL[max(0, min(3, tone))] + (255,))
    # Promieniste pęknięcia od środka.
    for dx, dy in [(1, 0), (0, 1), (-1, 0), (0, -1), (1, 1), (-1, 1)]:
        for step in range(1, 7):
            if rng.random() < 0.75:
                image.putpixel((int(7.5 + dx * step) % 16, int(7.5 + dy * step) % 16), CRACK + (255,))
    return image


def ash_layer():
    rng = random.Random(4303)
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for x in range(16):
        for y in range(16):
            edge = min(x, y, 15 - x, 15 - y)
            if rng.random() < (0.25 if edge == 0 else 0.6 if edge == 1 else 0.9):
                image.putpixel((x, y), rng.choice(ASHES) + (255,))
    # Kilka niedopalonych węgielków.
    for _ in range(6):
        image.putpixel((rng.randrange(2, 14), rng.randrange(2, 14)), COAL[rng.randrange(1, 3)] + (255,))
    return image


def shape(rows, tones):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key in tones:
                image.putpixel((x, y), tones[key] + (255,))
    return image


CHARCOAL = [
    '................',
    '................',
    '......oooo......',
    '.....ommldo.....',
    '....omlhmdoo....',
    '...omlmmcddmo...',
    '...ommcmmdddo...',
    '..ommmmcdddmdo..',
    '..omdmmddcdddo..',
    '..oddmdddddcdo..',
    '...oddcddddoo...',
    '....oodddoo.....',
    '......ooo.......',
    '................',
    '................',
    '................',
]
PILE = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......ll.......',
    '......lhml......',
    '.....lmhmml.....',
    '....lmmmdmml....',
    '...lmmdmmmmdl...',
    '..lmmmmmdmmmdl..',
    '.ommdmmmmmdmmdo.',
    '.oddddddddddddo.',
    '..oooooooooooo..',
    '................',
    '................',
]


def textures():
    return {
        'charred_log_side': charred_side(),
        'charred_log_top': charred_top(),
        'ash_layer': ash_layer(),
        'charcoal': shape(CHARCOAL, {'o': (10, 9, 10), 'd': COAL[0], 'm': COAL[2], 'l': COAL[3], 'h': GLINT, 'c': CRACK}),
        'ash': shape(PILE, {'o': (84, 82, 80), 'd': ASHES[4], 'm': ASHES[0], 'l': ASHES[1], 'h': ASHES[3]}),
    }


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (16 * len(images) * 8, 16 * 8), (96, 130, 80, 255))
        for index, image in enumerate(images.values()):
            big = image.resize((128, 128), Image.NEAREST)
            sheet.paste(big, (index * 128, 0), big)
        sheet.save(sys.argv[1])
    print(f'Zapisano {len(images)} kafelków.')


if __name__ == '__main__':
    main()
