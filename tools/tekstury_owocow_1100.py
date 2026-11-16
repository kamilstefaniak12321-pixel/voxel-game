"""Owoce, szyszki i opadłe liście trzynastu drzew z 1.8.0 (wersja 1.10.0).

python3 tools/tekstury_owocow_1100.py

Ikonki 16 x 16 przedmiotów (szyszki jodły, modrzewia, cedru i sosny
ościstej, orzeszki araukarii, owoc baobabu, siewka namorzynu, puch
puchowca, kwiaty jukki, figa, jagody draceny), igliwie modrzewia
z szyszkami, liście baobabu z owocami i opadłe liście osiki, baobabu, figowca, puchowca i modrzewia.
Obszary: nowy pas na dole drzewa.png; kafelki atlasu: wiersz 63 i wolne
kratki wiersza 61 (kolumny 57-63). Powtórne uruchomienie tylko rysuje
od nowa.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture, check, sync  # noqa: E402


def art(rows, colors):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), (*colors[key], 255))
    return image


def cone(profile, top, palette, stem=None, bristles=False):
    """Szyszka: profile - połowy szerokości kolejnych wierszy od góry."""
    outline, dark, base, light = palette
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for index, half in enumerate(profile):
        y = top + index
        left, right = 8 - half, 7 + half
        for x in range(left, right + 1):
            edge = x in (left, right) or index in (0, len(profile) - 1)
            scale = (x + index * 2) % 4
            row = index % 2
            color = outline if edge else light if (scale == 0 and row == 0) else dark if (scale == 2 and row == 1) or (row == 1 and scale == 0) else base
            image.putpixel((x, y), (*color, 255))
        if bristles and index % 2 == 1 and 0 < index < len(profile) - 1:
            for x in (left - 1, right + 1):
                if 0 <= x < 16:
                    image.putpixel((x, y), (*outline, 255))
    if stem:
        for y in range(max(0, top - 2), top):
            image.putpixel((7, y), (*stem, 255))
    return image


BROWN = ((52, 34, 22), (96, 62, 36), (134, 92, 54), (176, 132, 84))
ICONS = {
    # Jodła: długa, stojąca szyszka, zielonkawobrązowa.
    'fir/cone.png': lambda: cone([1, 2, 2, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1], 1, ((44, 40, 24), (92, 88, 48), (128, 120, 66), (170, 160, 96)), stem=(70, 50, 30)),
    # Modrzew: mała, jajowata, z odstającymi łuskami.
    'larch/cone.png': lambda: cone([1, 2, 3, 3, 4, 4, 3, 3, 2], 4, BROWN, stem=(70, 50, 30), bristles=True),
    # Cedr: beczułkowata, gładka.
    'cedar/cone.png': lambda: cone([2, 3, 4, 4, 4, 4, 4, 4, 4, 3, 2], 3, ((40, 38, 30), (88, 84, 58), (120, 112, 76), (158, 148, 104)), stem=(70, 50, 30)),
    # Sosna oścista: ciemna, fioletowobrązowa, z ościami na łuskach.
    'bristlecone/cone.png': lambda: cone([1, 2, 3, 3, 4, 4, 4, 3, 3, 2, 1], 3, ((44, 28, 40), (88, 56, 72), (120, 80, 88), (160, 116, 112)), stem=(70, 50, 30), bristles=True),
    'araucaria/nuts.png': lambda: art([
        '................',
        '................',
        '......kk........',
        '.....kLBk..kk...',
        '.....kLBk.kLBk..',
        '....kLBBk.kLBk..',
        '....kLBbkkLBBk..',
        '..kkkBBbkkLBbk..',
        '.kLBkkbbkkBBbk..',
        '.kLBBkkkkkkbbk..',
        '.kLBBbkkLBkkk...',
        '.kLBBbkLBBbk....',
        '..kBbbkLBBbk....',
        '...kkkkkBbbk....',
        '........kkk.....',
        '................',
    ], {'k': (60, 40, 24), 'b': (150, 104, 60), 'B': (190, 142, 86), 'L': (224, 186, 128)}),
    'baobab/fruit.png': lambda: art([
        '................',
        '.......ss.......',
        '.......ss.......',
        '......kkkk......',
        '.....kLLBBk.....',
        '....kLLBBBBk....',
        '....kLBBBBbk....',
        '...kLLBBBBbbk...',
        '...kLBBBBBbbk...',
        '...kLBBBBBbbk...',
        '...kLBBBBbbbk...',
        '....kBBBBbbk....',
        '....kBBbbbbk....',
        '.....kbbbbk.....',
        '......kkkk......',
        '................',
    ], {'k': (50, 52, 30), 's': (88, 64, 40), 'b': (104, 110, 60), 'B': (140, 146, 84), 'L': (178, 182, 116)}),
    'mangrove/propagule.png': lambda: art([
        '................',
        '..........kkk...',
        '.........kbBLk..',
        '.........kbBBk..',
        '..........kkk...',
        '.........kGk....',
        '........kGgk....',
        '........kGgk....',
        '.......kGgk.....',
        '.......kGgk.....',
        '......kGgk......',
        '......kGgk......',
        '.....kGrk.......',
        '.....krrk.......',
        '......kk........',
        '................',
    ], {'k': (36, 48, 26), 'b': (110, 72, 44), 'B': (146, 98, 60), 'L': (180, 132, 88), 'G': (120, 160, 70), 'g': (84, 124, 52), 'r': (136, 84, 52)}),
    'kapok/fluff.png': lambda: art([
        '................',
        '.....ww..ww.....',
        '...wwWWwwWWww...',
        '..wWWWWWWWWWWw..',
        '..wWWWsWWWWWWw..',
        '.wWWWWWWWWsWWWw.',
        '.wWsWWWWWWWWWWw.',
        '..wWWWWWWWWWWw..',
        '..wwWWWWWWWWww..',
        '...kwwWWWWwwk...',
        '...kbkwwwwkbk...',
        '....kbbkkbbk....',
        '....kbBbbBbk....',
        '.....kbBBbk.....',
        '......kkkk......',
        '................',
    ], {'k': (56, 40, 26), 'b': (120, 84, 50), 'B': (156, 114, 70), 'w': (196, 198, 190), 'W': (240, 240, 232), 's': (150, 130, 100)}),
    'joshua_tree/flowers.png': lambda: art([
        '................',
        '.......kk.......',
        '......kWWk......',
        '.....kWwWWk.....',
        '....kWWWwWk.....',
        '....kwWWWWWk....',
        '...kWWwWWwWk....',
        '...kWWWWWWWWk...',
        '...kwWWwWWWwk...',
        '....kWWWWwWk....',
        '....kkWwWWkk....',
        '......kGGk......',
        '.....kGgGgk.....',
        '....kGg.kgGk....',
        '....kk...kk.....',
        '................',
    ], {'k': (70, 76, 50), 'W': (240, 236, 204), 'w': (204, 200, 150), 'G': (120, 168, 140), 'g': (84, 128, 108)}),
    'banyan/fig.png': lambda: art([
        '................',
        '................',
        '........gg......',
        '.......kgk......',
        '......kkkkk.....',
        '.....kLRRRrk....',
        '....kLRRRRRrk...',
        '....kLRRRRRrk...',
        '...kLRRRRRRrrk..',
        '...kRRRRRRRrrk..',
        '...kRRRRRRrrrk..',
        '....kRRRRrrrk...',
        '....kRRrrrrrk...',
        '.....krrrrrk....',
        '......kkkkk.....',
        '................',
    ], {'k': (60, 22, 30), 'g': (96, 140, 60), 'r': (130, 40, 56), 'R': (176, 60, 70), 'L': (220, 110, 110)}),
    'dragon_tree/berries.png': lambda: art([
        '................',
        '................',
        '......gg........',
        '.....kkgk.......',
        '....kLOkgkk.....',
        '....kOOkkLOk....',
        '....kOokkOOk....',
        '..kkkkkkkOok....',
        '.kLOkkLOkkkkk...',
        '.kOOkkOOkkLOk...',
        '.kOokkOokkOOk...',
        '..kkkLOkkkOok...',
        '....kOOk.kkk....',
        '....kOok........',
        '.....kk.........',
        '................',
    ], {'k': (90, 36, 20), 'g': (86, 116, 70), 'o': (188, 84, 30), 'O': (232, 128, 44), 'L': (252, 190, 100)}),
}

# Opadłe liście: wzór z opadłych liści klonu / buka (obrócony), kolor
# gatunku jesienią - w grze i tak barwi je pora roku (LeafSeasons.js).
LITTER = {
    'aspen': ('maple/leaf_litter.png', 1, (226, 186, 60)),
    'baobab': ('beech_leaf_litter', 2, (176, 150, 84)),
    'banyan': ('maple/leaf_litter.png', 3, (150, 120, 60)),
    'kapok': ('beech_leaf_litter', 1, (160, 132, 66)),
    'larch': ('oak_leaf_litter', 2, (214, 160, 54)),
}


def litter(pattern, turns, color):
    source = np.asarray(read_texture(pattern).convert('RGBA')).astype(float)
    source = np.rot90(source, turns).copy()
    solid = source[..., 3] > 0
    lum = source[..., :3].mean(axis=2)
    lum = np.where(solid, lum / max(1.0, lum[solid].mean()), 0)
    out = np.zeros((16, 16, 4), dtype=np.uint8)
    for k in range(3):
        out[..., k] = np.clip(color[k] * lum, 0, 255)
    out[..., 3] = np.where(solid, 255, 0)
    return Image.fromarray(out, 'RGBA')


def larch_cones():
    """Igliwie modrzewia z wyraźnymi szyszkami: liście paczki + kilka szyszek."""
    image = read_texture('larch/leaves.png').convert('RGBA').copy()
    for x, y in ((2, 3), (11, 2), (6, 8), (13, 10), (3, 12), (9, 13)):
        for dx, dy, color in ((0, 0, (150, 104, 62)), (1, 0, (120, 80, 48)), (0, 1, (120, 80, 48)), (1, 1, (88, 58, 36))):
            image.putpixel(((x + dx) % 16, (y + dy) % 16), (*color, 255))
    return image


def baobab_fruit():
    """Liście baobabu z owocami: liście paczki + trzy wiszące, oliwkowe owoce."""
    image = read_texture('baobab/leaves.png').convert('RGBA').copy()
    colors = {'k': (60, 62, 36), 'b': (112, 118, 66), 'B': (146, 152, 90), 'L': (182, 186, 122), 's': (96, 70, 44)}
    shape = ['.s.', 'kLk', 'LBb', 'kbk']
    for x, y in ((2, 2), (10, 6), (5, 11)):
        for dy, row in enumerate(shape):
            for dx, key in enumerate(row):
                if key != '.':
                    image.putpixel(((x + dx) % 16, (y + dy) % 16), (*colors[key], 255))
    return image


def images():
    result = {key: make() for key, make in ICONS.items()}
    result['larch/leaves_cones.png'] = larch_cones()
    result['baobab/leaves_fruit.png'] = baobab_fruit()
    for species, (pattern, turns, color) in LITTER.items():
        result[f'{species}/leaf_litter.png'] = litter(pattern, turns, color)
    return result


def add_regions(keys):
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    missing = [key for key in keys if key not in data['regions']]
    if not missing:
        return
    assert missing == list(keys), 'Obszary dodane tylko w części'
    sheet = data['sheets']['drzewa']
    top = sheet['height']
    rows = (len(keys) + 15) // 16
    path = ROOT / 'assets/textures' / sheet['file']
    grown = Image.new('RGBA', (sheet['width'], top + rows * 16))
    with Image.open(path) as old:
        grown.paste(old.convert('RGBA'), (0, 0))
    grown.save(path, optimize=True)
    sheet['height'] = top + rows * 16
    taken = set()
    for tile in data['tiles'].values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                taken.add((tile['x'] + dx, tile['y'] + dy))
    # Co drugi kafelek wiersza 63 (ikonki łapią brzeg sąsiada), potem wolne
    # kratki wiersza 61.
    cells = [(x, 63) for x in range(0, 64, 2)] + [(x, 61) for x in range(57, 64, 2)]
    cells = [cell for cell in cells if cell not in taken]
    for index, key in enumerate(keys):
        data['regions'][key] = {'sheet': 'drzewa', 'x': (index % 16) * 16, 'y': top + (index // 16) * 16, 'width': 16, 'height': 16}
        x, y = cells[index]
        data['tiles'][key] = {'x': x, 'y': y, 'region': key}
    data['rows'] = max(tile['y'] + tile.get('h', 1) for tile in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    made = images()
    add_regions(list(made))
    for key, image in made.items():
        write_texture(key, image)
    check()
    sync()
    print(f'{len(made)} tekstur -> drzewa.png')


if __name__ == '__main__':
    main()
