"""Tekstury pnączy (1.30.0) z paczki Kamila "food_pack_all".

Wzorce (16 x 16) leżą w tools/wzorce/pnacza/<roślina>/ - rysunki Kamila
bez zmian. Narzędzie wkleja je do arkusza rosliny.png (wolne miejsca -
tools/niskie_tekstury.py: install).

Nazwy w grze:
  - podpory: vine_trellis (kratka), garden_pole / garden_pole_top (tyczka),
    pergola_slats (daszek pergoli),
  - pnącza: vine_<gatunek>_<etap> (young - łodyga, leaves, flower, unripe,
    ripe) i vine_<gatunek>_hang (owoce wiszące pod pergolą),
  - ikonki owoców: item_grapes, item_hop_cone, item_kiwi,
    item_passion_fruit - tylko gdy ich jeszcze nie ma: ikonki owoców
    rysuje tools/owoce_ikony.py (1.28.0).

Uruchomienie: python3 tools/pnacza_tekstury.py
Powtórne uruchomienie niczego nie dubluje - tylko wkleja od nowa.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import MANIFEST  # noqa: E402
from niskie_tekstury import install  # noqa: E402

SOURCE = Path(__file__).resolve().parent / 'wzorce' / 'pnacza'

# nazwa w grze -> (folder paczki, plik)
TEXTURES = {
    'vine_trellis': ('grape_vine', 'trellis'),
    'garden_pole': ('hop', 'pole'),
    'garden_pole_top': ('hop', 'pole_top'),
    'pergola_slats': ('kiwi', 'pergola_slats'),

    'vine_grape_young': ('grape_vine', 'vine_trunk'),
    'vine_grape_leaves': ('grape_vine', 'vine'),
    'vine_grape_unripe': ('grape_vine', 'vine_fruit_green'),
    'vine_grape_ripe': ('grape_vine', 'vine_fruit'),

    'vine_hop_young': ('hop', 'bine'),
    'vine_hop_leaves': ('hop', 'vine'),
    'vine_hop_unripe': ('hop', 'vine_cones'),
    'vine_hop_ripe': ('hop', 'vine_cones_golden'),

    'vine_kiwi_young': ('kiwi', 'vine_trunk'),
    'vine_kiwi_leaves': ('kiwi', 'vine'),
    'vine_kiwi_flower': ('kiwi', 'vine_flower'),
    'vine_kiwi_ripe': ('kiwi', 'vine_fruit'),
    'vine_kiwi_hang': ('kiwi', 'hang'),

    'vine_passion_fruit_young': ('passion_fruit', 'vine_trunk'),
    'vine_passion_fruit_leaves': ('passion_fruit', 'vine'),
    'vine_passion_fruit_flower': ('passion_fruit', 'vine_flower'),
    'vine_passion_fruit_unripe': ('passion_fruit', 'vine_fruit_green'),
    'vine_passion_fruit_ripe': ('passion_fruit', 'vine_fruit'),
    'vine_passion_fruit_hang': ('passion_fruit', 'hang'),
}

# Ikonki z paczki - zastępcze, dopóki owoce_ikony.py nie narysuje swoich.
ICONS = {
    'item_grapes': ('grape_vine', 'item_grapes'),
    'item_hop_cone': ('hop', 'item_hop_cone'),
    'item_kiwi': ('kiwi', 'item_kiwi'),
    'item_passion_fruit': ('passion_fruit', 'item_passion_fruit'),
}


def source(folder, name):
    with Image.open(SOURCE / folder / f'{name}.png') as image:
        return image.convert('RGBA')


def textures():
    return {key: source(*where) for key, where in TEXTURES.items()}


def main():
    images = textures()
    regions = json.loads(MANIFEST.read_text(encoding='utf-8'))['regions']
    images.update({key: source(*where) for key, where in ICONS.items() if key not in regions})
    install(images)
    print(f'{len(images)} tekstur pnączy -> rosliny.png')


if __name__ == '__main__':
    main()
