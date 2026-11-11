"""Tekstury skrzyń (0.81.0, od 0.89.0 z każdego rodzaju desek).

Obszar 32 x 32 na skrzynię w arkuszu drzewa.png: "chest" (dębowa, od
0.81.0) i "chest_<drewno>" (0.89.0 - src/blocks/chest.js, WOOD_CHESTS).
Deski w stylu atlasu Kamila (cztery pasy 4 px, przesunięte łączenia,
paleta desek danego gatunku), ciemniejsza rama na rogach i krawędziach
w kolorze tego drewna, zamek z żelaza. Układ (piksele):

  (0,0)-(16,10)   boki skrzyni (na zewnątrz),
  (16,0)-(32,16)  środek: ścianki, dno, spód wieka (ciemniejsze deski),
  (0,16)-(16,32)  wieko z góry,
  (16,16)-(32,20) boki wieka,
  (16,20)-(20,24) zamek.

Uruchomienie: python3 tools/skrzynia_tekstura.py
Pierwsze uruchomienie z nowymi gatunkami dopisuje obszary i kafelki do
assets/textures/atlas.json (arkusz rośnie w dół, kafelki 2 x 2 w nowych
wierszach atlasu - z dala od dawnych kafelków); potem:
python3 tools/atlasy.py sync
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture  # noqa: E402

# Kolejność = numery bloków (src/blocks/chest.js) - tylko dopisywać na końcu.
WOODS = [
    ('spruce', 'spruce_planks'), ('pine', 'pine_planks'), ('beech', 'beech_planks'),
    ('linden', 'linden_planks'), ('birch', 'birch_planks'), ('dark', 'dark_planks'),
    ('jablon', 'jablon/deski.png'), ('olcha', 'olcha/deski.png'), ('wierzba', 'wierzba/deski.png'),
    ('acacia', 'acacia/planks.png'), ('bald_cypress', 'bald_cypress/planks.png'),
    ('cherry', 'cherry/planks.png'), ('maple', 'maple/planks.png'), ('mugo', 'mugo/planks.png'),
    ('olive', 'olive/planks.png'), ('rainbow_eucalyptus', 'rainbow_eucalyptus/planks.png'),
    ('sequoia', 'sequoia/planks.png'), ('ginkgo', 'ginkgo/planks.png'), ('jacaranda', 'jacaranda/planks.png'),
]

# Dębowa skrzynia z 0.81.0 - kolor ramy jak dotąd (piksel w piksel).
OAK_FRAME = (165, 122, 74, 255)
IRON = [(214, 214, 206, 255), (168, 168, 162, 255), (120, 120, 118, 255), (78, 78, 80, 255)]

PER_ROW = 8  # skrzyń w rzędzie arkusza (256 px)


def shade(color, k):
    r, g, b, a = color
    return (max(0, min(255, round(r * k))), max(0, min(255, round(g * k))), max(0, min(255, round(b * k))), 255)


def chest_image(planks, frame_base):
    def plank(x, y, k=1.0):
        return shade(planks.getpixel((x % 16, y % 16)), k)

    frame = shade(frame_base, 0.62)
    frame_dark = shade(frame_base, 0.5)
    frame_light = shade(frame_base, 0.78)

    image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    put = image.putpixel

    # Boki: deski, rama na rogach i u dołu, jasna listwa u góry.
    for y in range(10):
        for x in range(16):
            color = plank(x, y + 2)
            if x in (0, 15) or y == 9:
                color = frame if (x + y) % 3 else frame_dark
            elif y == 0:
                color = frame_light
            put((x, y), color)

    # Środek: ciemniejsze deski.
    for y in range(16):
        for x in range(16):
            put((16 + x, y), plank(x + 5, y, 0.74))

    # Wieko z góry: deski wzdłuż, rama dookoła.
    for y in range(16):
        for x in range(16):
            color = plank(x, y)
            if x in (0, 15) or y in (0, 15):
                color = frame if (x + y) % 3 else frame_dark
            put((x, 16 + y), color)

    # Boki wieka: deski, jasna krawędź u góry, ciemna u dołu, rogi.
    for y in range(4):
        for x in range(16):
            color = plank(x + 3, y + 8)
            if x in (0, 15) or y == 3:
                color = frame_dark if y == 3 else frame
            elif y == 0:
                color = frame_light
            put((16 + x, 16 + y), color)

    # Zamek: żelazo z jasną krawędzią i otworem.
    latch = ['0001', '0112', '1232', '1223']
    for y, row in enumerate(latch):
        for x, c in enumerate(row):
            put((16 + x, 20 + y), IRON[int(c)])
    put((17, 22), IRON[3])
    return image


def frame_color(planks):
    # Jak dąb: rama to trochę przyciemniony środkowy kolor desek.
    pixels = np.asarray(planks.convert('RGB')).reshape(-1, 3)
    r, g, b = (np.median(pixels, axis=0) * 0.93).round().astype(int)
    return (int(r), int(g), int(b), 255)


def add_regions():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    missing = [wood for wood, _ in WOODS if f'chest_{wood}' not in data['regions']]
    if not missing:
        return
    sheet = data['sheets']['drzewa']
    top = sheet['height']
    rows = -(-len(missing) // PER_ROW)
    path = ROOT / 'assets/textures' / sheet['file']
    old = Image.open(path).convert('RGBA')
    grown = Image.new('RGBA', (sheet['width'], top + rows * 32))
    grown.paste(old, (0, 0))
    grown.save(path, optimize=True)
    sheet['height'] = top + rows * 32
    # Kafelki 2 x 2 w nowych wierszach atlasu, jeden pusty wiersz odstępu
    # od dawnych kafelków (ikonki bloków łapią brzeg sąsiada).
    first = data['rows'] + 1
    for index, wood in enumerate(missing):
        key = f'chest_{wood}'
        data['regions'][key] = {'sheet': 'drzewa', 'x': (index % PER_ROW) * 32,
                                'y': top + (index // PER_ROW) * 32, 'width': 32, 'height': 32}
        data['tiles'][key] = {'x': (index % 8) * 2, 'y': first + (index // 8) * 2, 'w': 2, 'h': 2,
                              'pw': 32, 'ph': 32, 'region': key}
    data['rows'] = max(t['y'] + t.get('h', 1) for t in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    add_regions()
    oak = read_texture('oak_planks')
    write_texture('chest', chest_image(oak, OAK_FRAME))
    for wood, planks_key in WOODS:
        planks = read_texture(planks_key)
        write_texture(f'chest_{wood}', chest_image(planks, frame_color(planks)))
    print(f'chest + {len(WOODS)} skrzyń z desek -> drzewa.png')


if __name__ == '__main__':
    main()
