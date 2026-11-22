"""Ikony darów pnia (1.41.0, docs/dary-pnia.md).

Rysowane tutaj (16 x 16), kubek jak w tools/tekstury_ziol.py:
  - birch_sap, maple_sap, palm_sap - kubek soku i listek drzewa,
  - baobab_water                   - kubek wody i kropla,
  - maple_syrup                    - kubek gęstego syropu z zaciekiem,
  - (1.42.0) tree_gum, dragon_blood - łzy gumy i żywicy; latex - bryłka;
    kino - odłamki; pitch_glue - smoła na patyku; tannin - kopczyk
    proszku na korze; brew_willow, tea_willow - kubek kory i napar.

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


# --- 1.42.0: guma, lateks, żywice-barwniki, smoła, garbnik, napar z kory ---

# Kształty z liter: o - kontur, d - cień, m - baza, l - jasny, h - połysk.
def shape(rows, base, outline=None):
    tones = {'o': outline or shade(base, 0.45), 'd': shade(base, 0.7), 'm': base, 'l': shade(base, 1.22), 'h': shade(base, 1.5)}
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key in tones:
                image.putpixel((x, y), tones[key] + (255,))
            elif key != '.':
                image.putpixel((x, y), EXTRA[key] + (255,))
    return image


STICK = (126, 92, 56)
EXTRA = {'s': STICK, 'S': shade(STICK, 0.7), 'c': (150, 88, 62), 'C': (104, 60, 44), 'b': (120, 96, 66), 'B': (86, 66, 44)}

# Łzy gumy / żywicy: trzy krople różnej wielkości.
TEARS = [
    '................',
    '................',
    '.....oo.........',
    '....olmo........',
    '....ohmo...oo...',
    '...olmmdo.olmo..',
    '...ommmdo.ohmo..',
    '...ommddo.ommdo.',
    '....oddo..omddo.',
    '.....oo....odo..',
    '.......oo...o...',
    '......olmo......',
    '......ohmdo.....',
    '......ommdo.....',
    '.......odo......',
    '................',
]
# Bryłka (lateks, kino): nieregularna gruda.
LUMP = [
    '................',
    '................',
    '................',
    '.....ooooo......',
    '....ollllmoo....',
    '...olhllmmmmo...',
    '..olhllmmmmmdo..',
    '..ollmmmmmmddo..',
    '..ommmmmmmdddo..',
    '..ommmmmddddo...',
    '...odmmddddo....',
    '....oodddoo.....',
    '......ooo.......',
    '................',
    '................',
    '................',
]
# Odłamki kruchej żywicy.
SHARDS = [
    '................',
    '................',
    '......oo........',
    '.....olmo.......',
    '....olhmdo......',
    '....ommmdo..oo..',
    '....omddo..olmo.',
    '.....odo..olhmo.',
    '..oo..o...ommdo.',
    '.olmo.....omddo.',
    '.ohmdo.....odo..',
    '.ommddo.....o...',
    '.omdddo.........',
    '..oddo..........',
    '...oo...........',
    '................',
]
# Smoła klejąca: czarna kula na patyku.
PITCH = [
    '................',
    '.........oooo...',
    '........olllmo..',
    '.......olhlmmdo.',
    '.......ollmmmdo.',
    '.......ommmmddo.',
    '.......ommmdddo.',
    '........odddoo..',
    '.......sSooo....',
    '......sS........',
    '.....sS.........',
    '....sS..........',
    '...sS...........',
    '..sS............',
    '..S.............',
    '................',
]
# Garbnik: kopczyk ciemnego proszku na kawałku kory.
HEAP = [
    '................',
    '................',
    '................',
    '................',
    '.......oo.......',
    '......olmo......',
    '.....olhmdo.....',
    '....olmmmddo....',
    '...olmmmmdddo...',
    '..ommmmmdddddo..',
    '.bbbbbbbbbbbbbb.',
    '.bBbbbBbbbBbbbB.',
    '..BBBBBBBBBBBB..',
    '................',
    '................',
    '................',
]

BARK = (150, 134, 104)
# Paski kory wierzby wystające z kubka.
STRIPS = [(4, 5, BARK), (4, 4, BARK), (5, 3, shade(BARK, 1.15)), (5, 2, BARK), (7, 5, shade(BARK, 0.8)), (7, 4, BARK), (7, 3, BARK),
          (8, 2, shade(BARK, 1.15)), (9, 5, BARK), (10, 4, shade(BARK, 0.8)), (10, 3, BARK), (5, 6, BARK), (7, 6, shade(BARK, 0.8)), (9, 6, BARK)]
STEAM = [(5, 4, (236, 240, 244, 150)), (5, 3, (236, 240, 244, 190)), (6, 2, (236, 240, 244, 150)), (6, 1, (236, 240, 244, 110)),
         (9, 4, (236, 240, 244, 130)), (8, 3, (236, 240, 244, 180)), (8, 2, (236, 240, 244, 140)), (9, 1, (236, 240, 244, 100))]


def steaming(liquid):
    image = cup(liquid)
    for x, y, color in STEAM:
        image.putpixel((x, y), color)
    return image


def textures():
    return {
        'birch_sap': cup((226, 234, 208), BIRCH),
        'maple_sap': cup((232, 214, 160), MAPLE),
        'palm_sap': cup((240, 232, 204), PALM),
        'baobab_water': cup(WATER, DROP),
        'maple_syrup': cup(SYRUP, DRIP + MAPLE[:4]),
        'tree_gum': shape(TEARS, (222, 150, 54)),
        'latex': shape(LUMP, (232, 228, 212), (150, 144, 126)),
        'dragon_blood': shape(TEARS, (168, 26, 32)),
        'kino': shape(SHARDS, (148, 54, 30)),
        'pitch_glue': shape(PITCH, (58, 50, 46), (24, 20, 20)),
        'tannin': shape(HEAP, (96, 62, 36)),
        'brew_willow': cup((112, 122, 92), STRIPS),
        'tea_willow': steaming((168, 132, 74)),
    }


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (16 * len(images) * 8, 16 * 8), (120, 120, 120, 255))
        for index, image in enumerate(images.values()):
            big = image.resize((128, 128), Image.NEAREST)
            sheet.paste(big, (index * 128, 0), big)
        sheet.save(sys.argv[1])
    print(f'Zapisano {len(images)} kafelków.')


if __name__ == '__main__':
    main()
