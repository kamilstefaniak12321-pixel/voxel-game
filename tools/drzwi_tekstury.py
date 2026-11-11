"""Tekstury drzwi i klap z każdego rodzaju desek (0.91.0).

door_<drewno>      16 x 32 - drzwi (model Kamila drzwi.bbmodel: przód
                   i tył to cały obrazek, boki - skrajne kolumny),
trapdoor_<drewno>  16 x 16 - klapa (wierzch i spód).

Deski i kolory z desek danego gatunku (src/blocks/woods.js), rama
ciemniejsza, dwa płyciny, żelazna klamka po stronie przeciwnej do zawiasu
(zawias lewy - klamka z prawej; zawias prawy - ten sam obrazek odbity
w modelu). Klapa: rama, deski w poprzek, ukośna listwa i żelazne zawiasy.

Uruchomienie: python3 tools/drzwi_tekstury.py
Pierwsze uruchomienie dopisuje obszary i kafelki do assets/textures/atlas.json
(arkusz drzewa.png rośnie w dół, kafelki w nowych wierszach atlasu
z pustym wierszem odstępu); potem: python3 tools/atlasy.py sync
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture  # noqa: E402

# Ta sama kolejność co src/blocks/woods.js.
WOODS = [
    ('spruce', 'spruce_planks'), ('pine', 'pine_planks'), ('beech', 'beech_planks'), ('linden', 'linden_planks'),
    ('oak', 'oak_planks'), ('birch', 'birch_planks'), ('dark', 'dark_planks'), ('jablon', 'jablon/deski.png'),
    ('olcha', 'olcha/deski.png'), ('wierzba', 'wierzba/deski.png'), ('acacia', 'acacia/planks.png'),
    ('bald_cypress', 'bald_cypress/planks.png'), ('cherry', 'cherry/planks.png'), ('maple', 'maple/planks.png'),
    ('mugo', 'mugo/planks.png'), ('olive', 'olive/planks.png'), ('rainbow_eucalyptus', 'rainbow_eucalyptus/planks.png'),
    ('sequoia', 'sequoia/planks.png'), ('ginkgo', 'ginkgo/planks.png'), ('jacaranda', 'jacaranda/planks.png'),
]

IRON = [(206, 206, 198, 255), (150, 150, 146, 255), (96, 96, 98, 255), (58, 58, 62, 255)]


def shade(color, k):
    r, g, b = color[:3]
    return (max(0, min(255, round(r * k))), max(0, min(255, round(g * k))), max(0, min(255, round(b * k))), 255)


def base_color(planks):
    pixels = np.asarray(planks.convert('RGB')).reshape(-1, 3)
    return tuple(int(v) for v in np.median(pixels, axis=0))


def vertical_board(planks, x, y, k=1.0):
    # Deski pionowo: obraz desek obrócony o 90 stopni.
    return shade(planks.getpixel((y % 16, (15 - x) % 16)), k)


def door_image(planks):
    base = base_color(planks)
    frame, frame_dark, frame_light = shade(base, 0.66), shade(base, 0.52), shade(base, 0.82)
    image = Image.new('RGBA', (16, 32))
    put = image.putpixel
    for y in range(32):
        for x in range(16):
            color = vertical_board(planks, x, y)
            edge = x in (0, 15) or y in (0, 31)
            rail = y in (14, 15, 16) or x in (1, 14) or y in (1, 30)
            if edge:
                color = frame_dark if (x + y) % 4 == 0 else frame
            elif rail:
                color = vertical_board(planks, x + 3, y, 0.82)
                if y == 14 or x == 1 or y == 1:
                    color = frame_light
            else:
                # Płyciny: lekko zagłębione (cień u góry i z lewej).
                inner_top = y in (2, 17)
                inner_left = x == 2
                if inner_top or inner_left:
                    color = vertical_board(planks, x, y, 0.72)
            put((x, y), color)
    # Klamka (z prawej - zawias lewy) i szyld.
    for y, row in enumerate(['011', '122', '233', '023']):
        for x, c in enumerate(row):
            put((11 + x, 15 + y), IRON[int(c)])
    put((12, 19), IRON[3])
    return image


def trapdoor_image(planks):
    base = base_color(planks)
    frame, frame_dark = shade(base, 0.66), shade(base, 0.52)
    image = Image.new('RGBA', (16, 16))
    put = image.putpixel
    for y in range(16):
        for x in range(16):
            color = shade(planks.getpixel((x, (y + 4) % 16)), 1.0)
            if x in (0, 15) or y in (0, 15):
                color = frame_dark if (x + y) % 4 == 0 else frame
            elif x + y in (15, 16):
                color = shade(planks.getpixel((x, y)), 0.8)   # ukośna listwa
            put((x, y), color)
    # Żelazne zawiasy przy górnej krawędzi (strona zawiasu).
    for x0 in (2, 11):
        for x in range(x0, x0 + 3):
            put((x, 1), IRON[1])
            put((x, 2), IRON[2])
        put((x0 + 1, 1), IRON[0])
    return image


def add_regions():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if all(f'door_{wood}' in data['regions'] for wood, _ in WOODS):
        return
    sheet = data['sheets']['drzewa']
    top = sheet['height']
    # Arkusz: rząd 32 px drzwi (16 na rząd), potem rząd 16 px klap.
    rows_px = 32 * 2 + 16 * 2
    path = ROOT / 'assets/textures' / sheet['file']
    old = Image.open(path).convert('RGBA')
    grown = Image.new('RGBA', (sheet['width'], top + rows_px))
    grown.paste(old, (0, 0))
    grown.save(path, optimize=True)
    sheet['height'] = top + rows_px
    first = data['rows'] + 1  # pusty wiersz odstępu od dawnych kafelków
    cells = [(x, y) for y in range(first, first + 4) for x in range(16)]
    taken = set()
    for index, (wood, _) in enumerate(WOODS):
        key = f'door_{wood}'
        data['regions'][key] = {'sheet': 'drzewa', 'x': (index % 16) * 16, 'y': top + (index // 16) * 32, 'width': 16, 'height': 32}
        x, y = (index % 16), first + (index // 16) * 2
        taken |= {(x, y), (x, y + 1)}
        data['tiles'][key] = {'x': x, 'y': y, 'w': 1, 'h': 2, 'pw': 16, 'ph': 32, 'region': key}
    free = [cell for cell in cells if cell not in taken]
    for index, (wood, _) in enumerate(WOODS):
        key = f'trapdoor_{wood}'
        data['regions'][key] = {'sheet': 'drzewa', 'x': (index % 16) * 16, 'y': top + 64 + (index // 16) * 16, 'width': 16, 'height': 16}
        x, y = free.pop(0)
        data['tiles'][key] = {'x': x, 'y': y, 'region': key}
    data['rows'] = max(t['y'] + t.get('h', 1) for t in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    add_regions()
    for wood, planks_key in WOODS:
        planks = read_texture(planks_key)
        write_texture(f'door_{wood}', door_image(planks))
        write_texture(f'trapdoor_{wood}', trapdoor_image(planks))
    print(f'{len(WOODS)} drzwi i {len(WOODS)} klap -> drzewa.png')


if __name__ == '__main__':
    main()
