"""Tekstury powalonych drzew (1.37.0, docs/powalone-drzewa.md).

Rysowane tutaj (16 x 16), z tekstur dębu jako podkładu:
  - rotten_log_side - kora spróchniałego pnia: ciemna, z mchem i dziurami,
  - rotten_log_end  - czoło: pusty w środku, pokruszony brzeg,
  - campfire_rotten - spróchniałe polano (model polana z ogniska),
  - dead_branch     - sucha gałąź sterczącą z ziemi przy pniu,
  - prochno         - garść próchna,
  - prochno_zar     - tlące się próchno.

Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py).

Uruchomienie: python3 tools/powalone_tekstury.py [podglad.png]
"""
import json
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install, MANIFEST, ROOT  # noqa: E402


def region(name):
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    box = data['regions'][name]
    sheet = data['sheets'][box['sheet']]
    with Image.open(ROOT / 'assets/textures' / sheet['file']) as image:
        return image.convert('RGBA').crop((box['x'], box['y'], box['x'] + box['width'], box['y'] + box['height']))


def rot(color, amount, rng):
    """Zbutwiały kolor: ciemniejszy, bardziej szary, lekko nierówny."""
    r, g, b = color[:3]
    grey = (r + g + b) / 3
    noise = rng.randint(-10, 10)
    mix = lambda c: max(0, min(255, int((c * 0.55 + grey * 0.45) * amount + noise)))
    return (mix(r), mix(g), mix(b), 255)


MOSS = [(74, 96, 46), (92, 116, 54), (60, 80, 40)]
HOLE = [(26, 20, 16), (38, 30, 22)]
CRUMB = [(120, 88, 56), (146, 110, 70), (96, 70, 44), (168, 132, 88)]


def rotten_side():
    rng = random.Random(1370)
    base = region('oak_log_side')
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            image.putpixel((x, y), rot(base.getpixel((x, y)), 0.82, rng))
    # Mech: płaty u góry (pień leży - to jego grzbiet po obrocie kory).
    for cx, cy, size in [(3, 2, 3), (11, 5, 2), (6, 11, 3), (13, 13, 2)]:
        for _ in range(size * 5):
            x, y = (cx + rng.randint(-size, size)) % 16, (cy + rng.randint(-size + 1, size - 1)) % 16
            image.putpixel((x, y), rng.choice(MOSS) + (255,))
    # Dziury po kornikach i wykruszona kora.
    for x, y in [(2, 8), (3, 8), (9, 2), (9, 3), (14, 9), (7, 14), (8, 14), (5, 5), (12, 10)]:
        image.putpixel((x, y), rng.choice(HOLE) + (255,))
    for x, y in [(1, 12), (10, 8), (15, 4), (4, 15)]:
        image.putpixel((x, y), rng.choice(CRUMB) + (255,))
    return image


def rotten_end():
    rng = random.Random(1371)
    base = region('oak_log_top')
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if d < 4.2 + rng.random() * 0.9:
                # Pusty środek: ciemno, przy brzegu trochę jaśniej.
                image.putpixel((x, y), (HOLE[0] if d < 3 else HOLE[1]) + (255,))
            elif d < 5.6:
                image.putpixel((x, y), rng.choice(CRUMB) + (255,))
            else:
                image.putpixel((x, y), rot(base.getpixel((x, y)), 0.85, rng))
    for x, y in [(2, 3), (13, 2), (12, 13), (3, 12)]:
        image.putpixel((x, y), rng.choice(MOSS) + (255,))
    return image


def campfire_rotten():
    rng = random.Random(1372)
    base = region('campfire_oak').resize((16, 16), Image.NEAREST)
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            pixel = base.getpixel((x, y))
            image.putpixel((x, y), rot(pixel, 0.8, rng) if pixel[3] > 0 else (0, 0, 0, 0))
    for _ in range(14):
        x, y = rng.randrange(16), rng.randrange(16)
        if image.getpixel((x, y))[3] > 0:
            image.putpixel((x, y), rng.choice(HOLE + CRUMB[:1]) + (255,))
    return image


COLORS = {
    # gałąź: kontur, kora, jasna kora
    'o': (66, 50, 36), 'b': (110, 86, 60), 'l': (144, 116, 84),
    # próchno: ciemne, średnie, jasne, okruch
    'd': (70, 50, 32), 'm': (112, 82, 52), 'j': (150, 114, 74), 'k': (180, 144, 98),
    # żar: czerwony, pomarańczowy, żółty
    'r': (190, 60, 24), 'p': (236, 120, 30), 'y': (255, 200, 90)
}

DEAD_BRANCH = [
    '................',
    '.....o..........',
    '.....ob.....o...',
    '......bo...ob...',
    '..o...ob..ob....',
    '..bo...bo.b.....',
    '...bo..obob.....',
    '....bo..bb......',
    '.....bobbo......',
    '......bblo..o...',
    '.......blo.ob...',
    '.......bbobb....',
    '......oblbo.....',
    '......obbo......',
    '.....oblbo......',
    '.....obbbo......',
]

PROCHNO = [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......dm........',
    '.....dmjm..k....',
    '....dmjkjm......',
    '...dmjmjjmd.....',
    '..dmjkjmjkmd....',
    '..dmmjmkmjmmd...',
    '.dmjmjmmjmjmd.k.',
    '.dmmdmmdmmdmmd..',
    '..ddddddddddd...',
    '................',
    '................',
]

PROCHNO_ZAR = [
    '................',
    '................',
    '................',
    '.......y........',
    '................',
    '......dm........',
    '.....dmpm..k....',
    '....dmpypm......',
    '...dmrpyprd.....',
    '..dmjrpypjmd....',
    '..dmmjrprjmmd...',
    '.dmjmjmrjmjmd.k.',
    '.dmmdmmdmmdmmd..',
    '..ddddddddddd...',
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
    return {
        'rotten_log_side': rotten_side(), 'rotten_log_end': rotten_end(), 'campfire_rotten': campfire_rotten(),
        'dead_branch': draw(DEAD_BRANCH), 'prochno': draw(PROCHNO), 'prochno_zar': draw(PROCHNO_ZAR)
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
