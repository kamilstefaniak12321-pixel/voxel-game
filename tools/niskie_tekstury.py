"""Tekstury roślin niskich (1.19.0) z paczki Kamila "food_pack_all".

Wzorce (16 x 16) leżą w tools/wzorce/niskie/<roślina>/ - rysunki Kamila
bez zmian. Narzędzie wkleja je do arkusza rosliny.png i dopisuje kafelki
atlasu w wolnych miejscach (wiersz 88, kolumny 17-63 i wiersze 89-93,
kolumny 51-63).

Nazwy w grze: low_<roślina>_<etap>_top / _side (wierzch i bok płyty;
bok płyty niższej niż blok to dolne wiersze rysunku), pumpkin*, item_*.

Dorysowane (nie ma ich w paczce):
  - low_zucchini_plant_side - bok krzaka cukinii bez owocu (z boku
    z owocem: owoc znika, łodygi schodzą do ziemi),
  - roasted_pumpkin_slice, roasted_zucchini - upieczone: te same ikonki,
    ciemniejsze i cieplejsze.

Uruchomienie: python3 tools/niskie_tekstury.py
Powtórne uruchomienie niczego nie dubluje - tylko wkleja od nowa.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, check, sync  # noqa: E402

SOURCE = Path(__file__).resolve().parent / 'wzorce' / 'niskie'

# nazwa w grze -> (folder paczki, plik)
TEXTURES = {
    # Żurawina: młoda - niska płyta (3 px), dorosła - wyższa (6 px).
    'low_cranberry_young_top': ('cranberry', 'cranberry_top'),
    'low_cranberry_young_side': ('cranberry', 'cranberry_side_lo'),
    'low_cranberry_plant_top': ('cranberry', 'cranberry_top_hi'),
    'low_cranberry_plant_side': ('cranberry', 'cranberry_side_hi'),
    'low_cranberry_flower_top': ('cranberry', 'cranberry_flower_top_hi'),
    'low_cranberry_flower_side': ('cranberry', 'cranberry_flower_side_hi'),
    'low_cranberry_unripe_top': ('cranberry', 'cranberry_fruit_alt_top_hi'),
    'low_cranberry_unripe_side': ('cranberry', 'cranberry_fruit_alt_side_hi'),
    'low_cranberry_fruit_top': ('cranberry', 'cranberry_fruit_top_hi'),
    'low_cranberry_fruit_side': ('cranberry', 'cranberry_fruit_side_hi'),
    # Torfowiec: niski i kępa.
    'sphagnum_green_top': ('cranberry', 'sphagnum_green_top'),
    'sphagnum_green_side': ('cranberry', 'sphagnum_green_side_lo'),
    'sphagnum_green_tall_top': ('cranberry', 'sphagnum_green_top_hi'),
    'sphagnum_green_tall_side': ('cranberry', 'sphagnum_green_side_hi'),
    'sphagnum_red_top': ('cranberry', 'sphagnum_red_top'),
    'sphagnum_red_side': ('cranberry', 'sphagnum_red_side_lo'),
    'sphagnum_red_tall_top': ('cranberry', 'sphagnum_red_top_hi'),
    'sphagnum_red_tall_side': ('cranberry', 'sphagnum_red_side_hi'),
    # Brusznica i chrobotek.
    'low_lingonberry_plant_top': ('lingonberry', 'lingonberry_leaves_top'),
    'low_lingonberry_plant_side': ('lingonberry', 'lingonberry_leaves'),
    'low_lingonberry_flower_top': ('lingonberry', 'lingonberry_flower_top'),
    'low_lingonberry_flower_side': ('lingonberry', 'lingonberry_flower'),
    'low_lingonberry_unripe_top': ('lingonberry', 'lingonberry_fruit_alt_top'),
    'low_lingonberry_unripe_side': ('lingonberry', 'lingonberry_fruit_alt'),
    'low_lingonberry_fruit_top': ('lingonberry', 'lingonberry_fruit_top'),
    'low_lingonberry_fruit_side': ('lingonberry', 'lingonberry_fruit'),
    'reindeer_lichen': ('lingonberry', 'lichen_heath'),
    # Truskawka i poziomka.
    'low_strawberry_plant_top': ('strawberry', 'strawberry_leaves_top'),
    'low_strawberry_plant_side': ('strawberry', 'strawberry_leaves'),
    'low_strawberry_flower_top': ('strawberry', 'strawberry_flower_top'),
    'low_strawberry_flower_side': ('strawberry', 'strawberry_flower'),
    'low_strawberry_fruit_top': ('strawberry', 'strawberry_fruit_top'),
    'low_strawberry_fruit_side': ('strawberry', 'strawberry_fruit'),
    'low_wild_strawberry_plant_top': ('strawberry', 'wild_strawberry_leaves_top'),
    'low_wild_strawberry_plant_side': ('strawberry', 'wild_strawberry_leaves'),
    'low_wild_strawberry_flower_top': ('strawberry', 'wild_strawberry_flower_top'),
    'low_wild_strawberry_flower_side': ('strawberry', 'wild_strawberry_flower'),
    'low_wild_strawberry_fruit_top': ('strawberry', 'wild_strawberry_fruit_top'),
    'low_wild_strawberry_fruit_side': ('strawberry', 'wild_strawberry_fruit'),
    # Dynia i cukinia.
    'low_pumpkin_plant_top': ('pumpkin_zucchini', 'pvine_top'),
    'low_pumpkin_plant_side': ('pumpkin_zucchini', 'pvine_side'),
    'low_pumpkin_flower_top': ('pumpkin_zucchini', 'pvine_flower_top'),
    'low_pumpkin_spent_top': ('pumpkin_zucchini', 'pvine_yellow_top'),
    'low_pumpkin_spent_side': ('pumpkin_zucchini', 'pvine_yellow_side'),
    'pumpkin_side': ('pumpkin_zucchini', 'pumpkin'),
    'pumpkin_top': ('pumpkin_zucchini', 'pumpkin_top'),
    'pumpkin_young_side': ('pumpkin_zucchini', 'pumpkin_young'),
    'pumpkin_young_top': ('pumpkin_zucchini', 'pumpkin_young_top'),
    'low_zucchini_plant_top': ('pumpkin_zucchini', 'zuc_top'),
    'low_zucchini_flower_top': ('pumpkin_zucchini', 'zuc_flower_top'),
    'low_zucchini_fruit_side': ('pumpkin_zucchini', 'zuc_side'),
    # Ikonki przedmiotów (truskawka już w grze jest).
    'item_cranberry': ('cranberry', 'item_cranberries'),
    'item_lingonberry': ('lingonberry', 'item_lingonberries'),
    'item_wild_strawberry': ('strawberry', 'item_wild_strawberry'),
    'item_pumpkin_slice': ('pumpkin_zucchini', 'item_pumpkin_slice'),
    'item_pumpkin_seeds': ('pumpkin_zucchini', 'item_pumpkin_seeds'),
    'item_zucchini': ('pumpkin_zucchini', 'item_zucchini'),
}

GENERATED = ['low_zucchini_plant_side', 'roasted_pumpkin_slice', 'roasted_zucchini']

# Wolne kafelki atlasu (kolumna, wiersz).
CELLS = [(x, 88) for x in range(17, 64)] + [(x, y) for y in range(89, 94) for x in range(51, 64)]


def source(folder, name):
    with Image.open(SOURCE / folder / f'{name}.png') as image:
        image = image.convert('RGBA')
    if image.size != (16, 16):
        raise ValueError(f'{folder}/{name}: oczekiwano 16 x 16')
    return image


FRUIT_COLORS = {(0x3a, 0x48, 0x35), (0x2a, 0x36, 0x26), (0x56, 0x66, 0x4b), (0xed, 0xb0, 0x37), (0xd5, 0x8b, 0x22)}
STEM_COLORS = {(0x6f, 0x89, 0x49), (0x56, 0x6d, 0x36)}


def zucchini_empty_side(fruit_side):
    """Bok krzaka cukinii bez owocu: owoc i jego kwiat (dolne wiersze)
    znikają, a łodygi nad nimi schodzą do ziemi."""
    out = fruit_side.copy()
    for x in range(16):
        stem = None
        for y in range(16):
            pixel = fruit_side.getpixel((x, y))
            if pixel[3] == 255 and pixel[:3] in STEM_COLORS:
                stem = pixel
            if y >= 9 and pixel[3] == 255 and pixel[:3] in FRUIT_COLORS:
                above = fruit_side.getpixel((x, 8))
                out.putpixel((x, y), stem if stem and above[3] == 255 and above[:3] in STEM_COLORS else (0, 0, 0, 0))
    return out


def roasted(icon):
    """Upieczone: ciemniej i cieplej, najjaśniejsze piksele mocniej."""
    out = icon.copy()
    for y in range(16):
        for x in range(16):
            r, g, b, a = icon.getpixel((x, y))
            if a < 128:
                continue
            light = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            k = 0.78 - 0.16 * light
            out.putpixel((x, y), (min(255, round(r * k + 14)), round(g * k * 0.9 + 4), round(b * k * 0.62), a))
    return out


def textures():
    out = {key: source(folder, name) for key, (folder, name) in TEXTURES.items()}
    out['low_zucchini_plant_side'] = zucchini_empty_side(out['low_zucchini_fruit_side'])
    out['roasted_pumpkin_slice'] = roasted(out['item_pumpkin_slice'])
    out['roasted_zucchini'] = roasted(out['item_zucchini'])
    assert set(GENERATED) <= set(out)
    return out


def main():
    images = textures()
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sheet = data['sheets']['rosliny']
    path = ROOT / 'assets/textures' / sheet['file']
    missing = [key for key in images if key not in data['regions']]
    if missing:
        taken = set()
        for tile in data['tiles'].values():
            for dy in range(tile.get('h', 1)):
                for dx in range(tile.get('w', 1)):
                    taken.add((tile['x'] + dx, tile['y'] + dy))
        cells = [cell for cell in CELLS if cell not in taken]
        if len(cells) < len(missing):
            raise ValueError(f'Za mało wolnych kafelków: {len(cells)} na {len(missing)}')
        per_row = sheet['width'] // 16
        top = sheet['height']
        lines = -(-len(missing) // per_row)
        grown = Image.new('RGBA', (sheet['width'], top + lines * 16))
        with Image.open(path) as old:
            grown.paste(old.convert('RGBA'), (0, 0))
        grown.save(path, optimize=True)
        sheet['height'] = top + lines * 16
        for index, key in enumerate(missing):
            data['regions'][key] = {'sheet': 'rosliny', 'x': (index % per_row) * 16, 'y': top + (index // per_row) * 16,
                                    'width': 16, 'height': 16}
            x, y = cells[index]
            data['tiles'][key] = {'x': x, 'y': y, 'region': key}
        data['rows'] = max(t['y'] + t.get('h', 1) for t in data['tiles'].values())
        MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    with Image.open(path) as source_sheet:
        page = source_sheet.convert('RGBA')
    for key, image in images.items():
        region = data['regions'][key]
        page.paste(image, (region['x'], region['y']))
    page.save(path, optimize=True)
    check()
    sync()
    print(f'{len(images)} tekstur roślin niskich -> rosliny.png')


if __name__ == '__main__':
    main()
