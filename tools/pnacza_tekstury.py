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
    rysuje tools/owoce_ikony.py (1.28.0),
  - 1.31.0, fasola i groch: pea_net (siatka), pea_brush (chrust),
    vine_bean_<etap>, vine_pea_<etap> i wigwam z tyczek - obrazki 32 x 48
    bean_wigwam, bean_wigwam_<etap> złożone tutaj z tyczki i liści paczki.

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

    # Fasola i groch (1.31.0): podpory grochu i etapy obu roślin.
    'pea_net': ('bean_pea', 'pea_net'),
    'pea_brush': ('bean_pea', 'pea_brush'),

    'vine_bean_young': ('bean_pea', 'bean_seedling'),
    'vine_bean_leaves': ('bean_pea', 'bean_vine'),
    'vine_bean_flower': ('bean_pea', 'bean_vine_red'),
    'vine_bean_ripe': ('bean_pea', 'bean_vine_pods'),
    'vine_bean_dry': ('bean_pea', 'bean_vine_dry'),

    'vine_pea_young': ('bean_pea', 'pea_vine_top'),
    'vine_pea_leaves': ('bean_pea', 'pea_vine'),
    'vine_pea_flower': ('bean_pea', 'pea_vine_flower'),
    'vine_pea_ripe': ('bean_pea', 'pea_vine_pods'),
}

# Ikonki z paczki - zastępcze, dopóki owoce_ikony.py nie narysuje swoich.
ICONS = {
    'item_grapes': ('grape_vine', 'item_grapes'),
    'item_hop_cone': ('hop', 'item_hop_cone'),
    'item_kiwi': ('kiwi', 'item_kiwi'),
    'item_passion_fruit': ('passion_fruit', 'item_passion_fruit'),
    'item_bean_pod': ('bean_pea', 'item_bean_pod'),
    'item_beans': ('bean_pea', 'item_beans'),
    'item_pea_pod': ('bean_pea', 'item_pea_pod'),
    'item_peas': ('bean_pea', 'item_peas'),
}

# --- Wigwam z tyczek (1.31.0) -------------------------------------------------
# Jeden obrazek 32 x 48 (2 x 3 bloki): dwie tyczki oparte o siebie
# i związane u góry. W grze to dwie skrzyżowane płaszczyzny (model rośliny),
# więc widać cztery tyczki - wigwam. Na tyczkach fasola: liście z kafelków
# paczki, przycięte do pasów wzdłuż tyczek.
WIGWAM_SIZE = (32, 48)
WIGWAM_STAGES = {'young': None, 'leaves': 'bean_vine', 'flower': 'bean_vine_red', 'ripe': 'bean_vine_pods', 'dry': 'bean_vine_dry'}
WIGWAM_KEYS = ['bean_wigwam', *[f'bean_wigwam_{stage}' for stage in WIGWAM_STAGES]]
# Tyczka: od stopy (3, 47) przez wiązanie (15,5; 7) po czubek.
POLE_FOOT, TIE_Y = 3.0, 7


def pole_x(y, right=False):
    x = POLE_FOOT + (47 - y) * (15.5 - POLE_FOOT) / (47 - TIE_Y)
    return 31 - x if right else x


def wigwam(stage=None):
    """Obrazek wigwamu: sam (stage None) albo z fasolą w danym etapie."""
    pole = source('bean_pea', 'pole')
    wood = sorted({pole.getpixel((x, y)) for x in range(16) for y in range(16) if pole.getpixel((x, y))[3] > 0},
                  key=lambda c: c[0] + c[1] + c[2])
    dark, light = wood[0], wood[-1]
    tie = source('bean_pea', 'pole_tie').getpixel((7, 7))
    image = Image.new('RGBA', WIGWAM_SIZE)

    def poles():
        for y in range(48):
            for right in (False, True):
                x = int(round(pole_x(y, right)))
                for dx, color in ((0, light), (1, dark)):
                    if 0 <= x + dx < 32:
                        image.putpixel((x + dx, y), color)

    poles()
    texture = WIGWAM_STAGES.get(stage)
    if stage == 'young':
        seedling = source('bean_pea', 'bean_seedling')
        for tile_x in (0, 16):
            image.alpha_composite(seedling, (tile_x, 32))
    elif texture:
        leaves = source('bean_pea', texture)
        for y in range(TIE_Y + 3, 48):
            for x in range(32):
                reach = 4.6 if y < 40 else 3.6
                if min(abs(x - pole_x(y)), abs(x - pole_x(y, True))) > reach:
                    continue
                pixel = leaves.getpixel((x % 16, y % 16))
                if pixel[3] > 0:
                    image.putpixel((x, y), pixel)
    # Czubki tyczek i wiązanie zawsze na wierzchu.
    for y in range(0, TIE_Y + 3):
        for right in (False, True):
            x = int(round(pole_x(y, right)))
            for dx, color in ((0, light), (1, dark)):
                if 0 <= x + dx < 32:
                    image.putpixel((x + dx, y), color)
    for y in (TIE_Y - 1, TIE_Y, TIE_Y + 1):
        for x in range(13, 19):
            image.putpixel((x, y), tie)
    return image


def wigwam_icon():
    """Ikonka wigwamu 16 x 16: trzy tyczki związane u góry."""
    pole = source('bean_pea', 'pole')
    wood = sorted({pole.getpixel((x, y)) for x in range(16) for y in range(16) if pole.getpixel((x, y))[3] > 0},
                  key=lambda c: c[0] + c[1] + c[2])
    dark, light = wood[0], wood[-1]
    tie = source('bean_pea', 'pole_tie').getpixel((7, 7))
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        left = int(round(1 + (15 - y) * 6.5 / 13))
        for x, color in ((left, light), (left + 1, dark), (15 - left - 1, light), (15 - left, dark)):
            if 0 <= x < 16:
                image.putpixel((x, y), color)
        # Środkowa tyczka (z przodu).
        if y >= 3:
            image.putpixel((7, y), light)
            image.putpixel((8, y), dark)
    for x in range(5, 11):
        image.putpixel((x, 2), tie)
        image.putpixel((x, 3), tie)
    return image


def install_big(images):
    """Obrazki większe niż kafelek (wszystkie tego samego rozmiaru): własny
    pas na dole rosliny.png i własne wiersze atlasu, z pustym wierszem
    odstępu. Powtórne uruchomienie tylko wkleja od nowa."""
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sheet = data['sheets']['rosliny']
    path = SOURCE.parent.parent.parent / 'assets/textures' / sheet['file']
    width, height = next(iter(images.values())).size
    missing = [key for key in images if key not in data['regions']]
    if missing:
        per_row = sheet['width'] // width
        lines = -(-len(missing) // per_row)
        top = sheet['height']
        grown = Image.new('RGBA', (sheet['width'], top + lines * height))
        with Image.open(path) as old:
            grown.paste(old.convert('RGBA'), (0, 0))
        grown.save(path, optimize=True)
        sheet['height'] = top + lines * height
        # (Wiersze 96-97 atlasu są zapasem małych kafelków - niskie_tekstury.py.)
        first = max(data['rows'], 98) + 1
        tiles_w, tiles_h = width // 16, height // 16
        for index, key in enumerate(missing):
            data['regions'][key] = {'sheet': 'rosliny', 'x': (index % per_row) * width, 'y': top + (index // per_row) * height,
                                    'width': width, 'height': height}
            data['tiles'][key] = {'x': (index % per_row) * tiles_w, 'y': first + (index // per_row) * tiles_h,
                                  'w': tiles_w, 'h': tiles_h, 'pw': width, 'ph': height, 'region': key}
        data['rows'] = max(t['y'] + t.get('h', 1) for t in data['tiles'].values())
        MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with Image.open(path) as source_sheet:
        page = source_sheet.convert('RGBA')
    for key, image in images.items():
        region = data['regions'][key]
        page.paste(image, (region['x'], region['y']))
    page.save(path, optimize=True)


def source(folder, name):
    with Image.open(SOURCE / folder / f'{name}.png') as image:
        return image.convert('RGBA')


def textures():
    return {key: source(*where) for key, where in TEXTURES.items()}


def main():
    images = textures()
    regions = json.loads(MANIFEST.read_text(encoding='utf-8'))['regions']
    images.update({key: source(*where) for key, where in ICONS.items() if key not in regions})
    big = {'bean_wigwam': wigwam(), **{f'bean_wigwam_{stage}': wigwam(stage) for stage in WIGWAM_STAGES}}
    install_big(big)
    images['item_bean_wigwam'] = wigwam_icon()
    install(images)
    print(f'{len(images)} tekstur pnączy i {len(big)} obrazków wigwamu -> rosliny.png')


if __name__ == '__main__':
    main()
