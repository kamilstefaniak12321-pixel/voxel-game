"""Skrzynie, drzwi i klapy z desek trzynastu drzew z 1.8.0 (wersja 1.9.0).

python3 tools/tekstury_wyrobow_190.py

Te same rysunki co dla dawnych rodzajów drewna (tools/skrzynia_tekstura.py,
tools/drzwi_tekstury.py), tylko własne miejsca: obszary na dole arkusza
drzewa.png i kafelki atlasu w wierszach 61-62 (wiersz 60 i kolumny między
grupami zostają puste - ikonki bloków łapią brzeg sąsiedniego kafelka).
Powtórne uruchomienie niczego nie dubluje - tylko rysuje od nowa.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture, check, sync  # noqa: E402
from skrzynia_tekstura import chest_image, frame_color  # noqa: E402
from drzwi_tekstury import door_image, trapdoor_image  # noqa: E402

WOODS = ['fir', 'baobab', 'coconut_palm', 'larch', 'mangrove', 'kapok', 'joshua_tree',
         'aspen', 'araucaria', 'banyan', 'dragon_tree', 'cedar', 'bristlecone']
ROW = 61            # wiersz atlasu: skrzynie 2 x 2 i drzwi 1 x 2 zajmują 61-62
CHEST_COLUMN, DOOR_COLUMN, TRAPDOOR_COLUMN = 0, 28, 43


def add_regions():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if all(f'trapdoor_{wood}' in data['regions'] for wood in WOODS):
        return
    sheet = data['sheets']['drzewa']
    top = sheet['height']
    # Arkusz: dwa rzędy skrzyń (po 8, 32 px), rząd drzwi (32 px), rząd klap (16 px).
    height = 64 + 32 + 16
    path = ROOT / 'assets/textures' / sheet['file']
    grown = Image.new('RGBA', (sheet['width'], top + height))
    with Image.open(path) as old:
        grown.paste(old.convert('RGBA'), (0, 0))
    grown.save(path, optimize=True)
    sheet['height'] = top + height
    taken = set()
    for tile in data['tiles'].values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                taken.add((tile['x'] + dx, tile['y'] + dy))

    def place(key, region, x, y, w=1, h=1):
        cells = {(x + dx, y + dy) for dx in range(w) for dy in range(h)}
        assert not cells & taken, f'{key}: kafelek zajęty'
        taken.update(cells)
        data['regions'][key] = {'sheet': 'drzewa', **region}
        tile = {'x': x, 'y': y, 'region': key}
        if w > 1 or h > 1:
            tile.update(w=w, h=h, pw=w * 16, ph=h * 16)
        data['tiles'][key] = tile

    for index, wood in enumerate(WOODS):
        place(f'chest_{wood}', {'x': (index % 8) * 32, 'y': top + (index // 8) * 32, 'width': 32, 'height': 32},
              CHEST_COLUMN + index * 2, ROW, 2, 2)
        place(f'door_{wood}', {'x': index * 16, 'y': top + 64, 'width': 16, 'height': 32}, DOOR_COLUMN + index, ROW, 1, 2)
        place(f'trapdoor_{wood}', {'x': index * 16, 'y': top + 96, 'width': 16, 'height': 16}, TRAPDOOR_COLUMN + index, ROW)
    data['rows'] = max(tile['y'] + tile.get('h', 1) for tile in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    add_regions()
    for wood in WOODS:
        planks = read_texture(f'{wood}/planks.png')
        write_texture(f'chest_{wood}', chest_image(planks, frame_color(planks)))
        write_texture(f'door_{wood}', door_image(planks))
        write_texture(f'trapdoor_{wood}', trapdoor_image(planks))
    check()
    sync()
    print(f'{len(WOODS)} skrzyń, drzwi i klap -> drzewa.png')


if __name__ == '__main__':
    main()
