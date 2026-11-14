# ------------------------------------------------------------
# TEKSTURY ZIÓŁ I NAPARÓW (0.98.1)
#
# Rysuje ikony 16 x 16: gliniany kubek, trzy kubki z ziołami (do
# zaparzenia), trzy napary i wianek z kwiatów. Zapisuje PNG do folderu
# podanego jako argument; do arkuszy trafiają przez tools/atlasy.py
# (replace NAZWA plik.png), opis: docs/ziola.md.
#
#     python3 tools/tekstury_ziol.py /tmp/ziola
# ------------------------------------------------------------
import sys, os
from PIL import Image

OUT = sys.argv[1] if len(sys.argv) > 1 else 'ziola'
os.makedirs(OUT, exist_ok=True)

CLAY = {'d': (104, 60, 44), 'm': (150, 88, 62), 'l': (186, 116, 82), 'h': (214, 150, 110), 'i': (62, 36, 28)}

# Kubek: d - cień, m - glina, l - jasna, h - połysk, i - wnętrze,
# q - płyn / zioła (kolor zależny od rodzaju), . - nic.
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

def cup(fill, top=None):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(CUP):
        for x, key in enumerate(row):
            if key == '.': continue
            color = fill if key == 'q' else CLAY[key]
            image.putpixel((x, y), (*color, 255))
    for (x, y, color) in top or []:
        image.putpixel((x, y), (*color, 255))
    return image

def shade(color, k):
    return tuple(max(0, min(255, round(c * k))) for c in color)

# Zioła wystające z kubka: łodyżki i kwiaty.
def herbs(leaf, flower, flower2):
    dark = shade(leaf, 0.7)
    return [
        (4, 5, dark), (4, 4, leaf), (3, 3, leaf), (4, 3, flower), (3, 2, flower),
        (6, 5, leaf), (6, 4, leaf), (6, 3, dark), (6, 2, leaf), (5, 2, flower2), (6, 1, flower2), (7, 2, flower2),
        (8, 5, dark), (8, 4, leaf), (9, 3, leaf), (9, 2, flower), (10, 2, flower), (9, 1, flower),
        (10, 5, leaf), (11, 4, leaf), (11, 3, flower2),
        (5, 6, leaf), (7, 6, dark), (9, 6, leaf)
    ]

# Para nad naparem i jaśniejsza plama na płynie.
def tea(liquid):
    steam = (236, 240, 244)
    top = [(4, 6, shade(liquid, 1.25)), (5, 6, shade(liquid, 1.25)), (9, 6, shade(liquid, 0.8))]
    for (x, y, a) in [(5, 4, 150), (5, 3, 190), (6, 2, 150), (6, 1, 110), (9, 4, 130), (8, 3, 180), (8, 2, 140), (9, 1, 100)]:
        top.append((x, y, steam + (a,)))
    image = cup(liquid)
    for (x, y, color) in top:
        image.putpixel((x, y), color if len(color) == 4 else (*color, 255))
    return image

KINDS = {
    # rodzaj: (liść, kwiat, drugi kwiat, płyn)
    'calm': ((98, 132, 70), (150, 118, 196), (236, 220, 150), (196, 164, 92)),
    'heal': ((112, 140, 96), (240, 150, 46), (244, 244, 236), (176, 120, 48)),
    'vigor': ((62, 126, 52), (224, 200, 60), (118, 170, 70), (110, 150, 58)),
}

cup(CLAY['i']).save(f'{OUT}/clay_cup.png')
for kind, (leaf, flower, flower2, liquid) in KINDS.items():
    cup(shade(leaf, 0.75), herbs(leaf, flower, flower2)).save(f'{OUT}/brew_{kind}.png')
    tea(liquid).save(f'{OUT}/tea_{kind}.png')

# Wianek z kwiatów: pierścień z liści (jak wieniec świerkowy) i kwiaty.
RING = [
    '....########....', '...##########...', '..############..', '.##############.',
    '#######..#######', '#####......#####', '#####......#####', '####........####',
    '####........####', '#####......#####', '#####......#####', '#######..#######',
    '.##############.', '..############..', '...##########...', '....########....',
]
GREENS = [(74, 130, 62), (58, 108, 52), (96, 152, 74), (46, 88, 44)]
FLOWERS = [
    # środek (x, y), płatki, środek kwiatu
    ((3, 3), (232, 120, 150), (250, 220, 120)), ((8, 1), (244, 208, 70), (190, 120, 40)),
    ((12, 3), (120, 150, 226), (236, 236, 250)), ((14, 8), (240, 140, 60), (120, 70, 30)),
    ((12, 12), (236, 236, 228), (240, 200, 70)), ((7, 14), (170, 120, 210), (250, 230, 150)),
    ((3, 12), (220, 80, 70), (60, 40, 40)), ((1, 7), (244, 208, 70), (190, 120, 40)),
]
wreath = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
for y, row in enumerate(RING):
    for x, key in enumerate(row):
        if key == '#':
            wreath.putpixel((x, y), (*GREENS[(x * 7 + y * 13 + (x * y) % 5) % len(GREENS)], 255))
for (cx, cy), petal, heart in FLOWERS:
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        x, y = cx + dx, cy + dy
        if 0 <= x < 16 and 0 <= y < 16: wreath.putpixel((x, y), (*petal, 255))
    wreath.putpixel((cx, cy), (*heart, 255))
wreath.save(f'{OUT}/flower_wreath.png')
print('OK:', ', '.join(sorted(os.listdir(OUT))))
