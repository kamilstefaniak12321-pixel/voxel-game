"""Tekstury krzewów jagodowych (1.17.0) z paczki Kamila "food_pack_all".

Wzorce (16 x 16) leżą w tools/wzorce/krzewy/<roślina>/ - to rysunki Kamila
bez zmian. Narzędzie wkleja je do arkusza rosliny.png i dopisuje kafelki
atlasu (wiersze 94-95, kolumny 17-63 - wolne miejsce pod arkuszami kory;
kolumna 16 zostaje pusta, bo ikonki łapią brzeg sąsiedniego kafelka).

Nazwy w grze: shrub_<gatunek>_<część> (liście, kwiat, owoc, pień...)
i item_<owoc> (ikonki przedmiotów). Sadzonki (shrub_<gatunek>_sapling)
nie ma w paczce - narzędzie rysuje ją z kolorów liści gatunku: krótki pęd
z kilkoma listkami.

Uruchomienie: python3 tools/krzewy_tekstury.py
Powtórne uruchomienie niczego nie dubluje - tylko wkleja od nowa.
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, check, sync  # noqa: E402

SOURCE = Path(__file__).resolve().parent / 'wzorce' / 'krzewy'

# gatunek w grze -> (folder paczki, {część: plik})
SHRUBS = {
    'aronia': ('aronia', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit',
                          'stem': 'stems', 'stem_top': 'stems_top'}),
    'currant': ('currant', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit',
                            'fruit_black': 'bush_leaves_fruit_black'}),
    'gooseberry': ('gooseberry', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit',
                                  'fruit_red': 'bush_leaves_fruit_red', 'stem': 'stem', 'stem_top': 'stem_top'}),
    'raspberry': ('raspberry', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit',
                                'fruit_yellow': 'bush_leaves_fruit_yellow'}),
    'dog_rose': ('dog_rose', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_hips'}),
    'elderberry': ('elderberry', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'flower_top': 'bush_leaves_flower_top',
                                  'unripe': 'bush_leaves_fruit_unripe', 'unripe_top': 'bush_leaves_fruit_unripe_top',
                                  'fruit': 'bush_leaves_fruit', 'fruit_top': 'bush_leaves_fruit_top',
                                  'stem': 'log_side', 'stem_top': 'log_top'}),
    'sea_buckthorn': ('sea_buckthorn', {'leaves': 'bush_leaves', 'unripe': 'bush_leaves_unripe', 'fruit': 'bush_leaves_fruit',
                                        'stem': 'log_side', 'stem_top': 'log_top'}),
    'highbush_blueberry': ('blueberry', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit'}),
    'bramble': ('blackberry', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_flower', 'fruit': 'bush_leaves_fruit',
                               'fruit_alt': 'bush_leaves_fruit_alt'}),
    'hazel': ('hazel', {'leaves': 'bush_leaves', 'flower': 'bush_leaves_catkins', 'unripe': 'bush_leaves_nuts',
                              'fruit': 'bush_leaves_nuts_ripe', 'stem': 'log_side', 'stem_top': 'log_top'}),
}

# ikonka przedmiotu w grze -> (folder paczki, plik)
ITEMS = {
    'item_aronia': ('aronia', 'item_aronia'),
    'item_redcurrant': ('currant', 'item_redcurrants'),
    'item_blackcurrant': ('currant', 'item_blackcurrants'),
    'item_gooseberry': ('gooseberry', 'item_gooseberries'),
    'item_red_gooseberry': ('gooseberry', 'item_gooseberries_red'),
    'item_raspberry': ('raspberry', 'item_raspberries'),
    'item_yellow_raspberry': ('raspberry', 'item_raspberries_yellow'),
    'item_rose_hip': ('dog_rose', 'item_rose_hips'),
    'item_rose_petals': ('dog_rose', 'item_rose_petals'),
    'item_elderberry': ('elderberry', 'item_elderberries'),
    'item_elderflower': ('elderberry', 'item_elderflower'),
    'item_sea_buckthorn': ('sea_buckthorn', 'item_sea_buckthorn'),
}

FIRST_COLUMN, LAST_COLUMN, ROWS = 17, 63, (94, 95)

# Modele sadzonek (Ustawienia -> Modele roślin): folder w assets/models/rosliny,
# kształt liścia na arkuszu półrealistycznym (tools/modele_roslin.py rysuje
# arkusz z kolorów zapisanych tu w model.json).
MODELS = Path(__file__).resolve().parent.parent / 'assets' / 'models' / 'rosliny'
LEAF_LAYOUT = {'aronia': 'owalny', 'currant': 'klapowany', 'gooseberry': 'klapowany', 'raspberry': 'zabkowany',
               'dog_rose': 'pierzasty', 'elderberry': 'pierzasty', 'sea_buckthorn': 'waski',
               'highbush_blueberry': 'owalny', 'bramble': 'zabkowany', 'hazel': 'drzewny'}
SAPLING_NAMES = {'aronia': 'aronii', 'currant': 'porzeczki', 'gooseberry': 'agrestu', 'raspberry': 'maliny',
                 'dog_rose': 'dzikiej róży', 'elderberry': 'bzu czarnego', 'sea_buckthorn': 'rokitnika',
                 'highbush_blueberry': 'borówki wysokiej', 'bramble': 'jeżyny', 'hazel': 'leszczyny (krzew)'}
# Druga odmiana gatunku ma własny blok sadzonki (ten sam wygląd).
SAPLING_BLOCKS = {'currant': ['', '_black'], 'gooseberry': ['', '_red'], 'raspberry': ['', '_yellow']}


def model_id(species):
    return f"sadzonka-krzew-{species.replace('_', '-')}"


def model_key(species):
    return f'models/rosliny/{model_id(species)}/polrealistyczny'


def leaf_tones(leaves):
    colors = sorted({pixel for pixel in leaves.get_flattened_data() if pixel[3] == 255},
                    key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
    return colors[len(colors) // 5], colors[len(colors) // 2], colors[-max(1, len(colors) // 6)]


def write_models(images):
    """model.json każdej sadzonki i wpis w lista.json (kolory z liści)."""
    listing = MODELS / 'lista.json'
    order = json.loads(listing.read_text(encoding='utf-8'))
    hexa = lambda c: '#%02x%02x%02x' % c[:3]
    for species in SHRUBS:
        dark, mid, light = leaf_tones(images[f'shrub_{species}_leaves'])
        folder = MODELS / model_id(species)
        folder.mkdir(exist_ok=True)
        blocks = [f'shrub_{species}_sapling{suffix}' for suffix in SAPLING_BLOCKS.get(species, [''])]
        model = {
            'nazwa': f'Sadzonka {SAPLING_NAMES[species]}',
            'bloki': blocks,
            'kolory': {'lisc': hexa(mid), 'liscJasny': hexa(light), 'liscCiemny': hexa(dark), 'lodyga': hexa(STEM)},
            # (Jeden etap na blok - odmiany wyglądają tak samo.)
            'etapy': [{
                'prosty': None,
                'polrealistyczny': {'liscie': {'uklad': 'kopula', 'ile': 7, 'dlugosc': 5, 'promien': 3, 'kopula': 9,
                                               'nachylenie': 45, 'pien': True}},
                'szczegolowy': {'rodzaj': 'kepka',
                                'liscie': {'uklad': 'krzak', 'ile': [6, 8], 'dlugosc': [2, 3], 'promien': 2},
                                'lodygi': {'ile': [1, 2], 'wysokosc': [6, 8], 'promien': 0,
                                           'liscie': {'co': 1, 'dlugosc': [3, 4], 'naprzeciw': True}}}
            }] * len(blocks)
        }
        (folder / 'model.json').write_text(json.dumps(model, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
        if model_id(species) not in order:
            order.append(model_id(species))
    listing.write_text(json.dumps(order, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')


# Sadzonka: pęd (S) i listki (cyfra - który listek; kolory z tekstury liści).
SAPLING = [
    '................',
    '................',
    '................',
    '................',
    '.......11.......',
    '......1111......',
    '..22...11...33..',
    '.2222..S..3333..',
    '..222..S..333...',
    '....2..S.3......',
    '.....2.S3.......',
    '..44..SS..55....',
    '.4444.S..5555...',
    '..444.S.555.....',
    '....4SS5........',
    '......S.........',
]
STEM = (104, 78, 50, 255)
STEM_DARK = (78, 58, 38, 255)


def source(folder, name):
    with Image.open(SOURCE / folder / f'{name}.png') as image:
        image = image.convert('RGBA')
    if image.size != (16, 16):
        raise ValueError(f'{folder}/{name}: oczekiwano 16 x 16')
    return image


def sapling(leaves):
    """Sadzonka z kolorów liści: jaśniejsze piksele na górze listka."""
    colors = sorted({pixel for pixel in leaves.get_flattened_data() if pixel[3] == 255},
                    key=lambda c: 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2])
    dark, mid, light = colors[len(colors) // 5], colors[len(colors) // 2], colors[-max(1, len(colors) // 6)]
    image = Image.new('RGBA', (16, 16))
    for y, row in enumerate(SAPLING):
        for x, cell in enumerate(row):
            if cell == 'S':
                image.putpixel((x, y), STEM_DARK if (x + y) % 3 == 0 else STEM)
            elif cell != '.':
                above = y > 0 and SAPLING[y - 1][x] == cell
                below = y < 15 and SAPLING[y + 1][x] == cell
                image.putpixel((x, y), light if not above else dark if not below else mid)
    return image


# Najciemniejsze liście z paczki (jeżyna, aronia, dzika róża, bez) były
# w grze prawie czarne obok liści drzew. Zielone piksele liści gatunku
# rozjaśniamy do jasności liści dębu / buka (średnia liniowa LEAF_TARGET),
# najwyżej o LEAF_GAIN_MAX; owoce, kwiaty i pędy zostają jak w paczce.
LEAF_TARGET = 0.13
LEAF_GAIN_MAX = 1.25
CANES_GAIN = 1.5
LEAF_PARTS = ('leaves', 'flower', 'flower_top', 'fruit', 'fruit_top', 'fruit_black', 'fruit_red', 'fruit_yellow',
              'fruit_alt', 'unripe', 'unripe_top')


def is_leaf_green(pixel):
    r, g, b, a = pixel
    return a == 255 and g > r and g > b


def leaf_gain(leaves):
    pixels = [p for p in leaves.get_flattened_data() if p[3] == 255]
    linear = lambda v: (v / 255) ** 2.2
    mean = sum(0.2126 * linear(p[0]) + 0.7152 * linear(p[1]) + 0.0722 * linear(p[2]) for p in pixels) / len(pixels)
    return max(1.0, min(LEAF_GAIN_MAX, (LEAF_TARGET / mean) ** (1 / 2.2)))


def brighten(image, gain):
    if gain <= 1.0:
        return image
    out = image.copy()
    for y in range(16):
        for x in range(16):
            pixel = image.getpixel((x, y))
            if is_leaf_green(pixel):
                out.putpixel((x, y), (*(min(255, round(v * gain)) for v in pixel[:3]), 255))
    return out


def textures():
    """Wszystkie obrazki: {nazwa w grze: obraz}."""
    out = {}
    for species, (folder, parts) in SHRUBS.items():
        gain = leaf_gain(source(folder, parts['leaves']))
        for part, name in parts.items():
            image = source(folder, name)
            out[f'shrub_{species}_{part}'] = brighten(image, gain) if part in LEAF_PARTS else image
        out[f'shrub_{species}_sapling'] = sapling(out[f'shrub_{species}_leaves'])
    # Pędy aronii w paczce są prawie czarne - w cieniu pod liśćmi zlewały
    # się w czarną kratę. Wszystkie piksele jaśniejsze o połowę.
    for key in ('shrub_aronia_stem', 'shrub_aronia_stem_top'):
        canes = out[key]
        out[key] = Image.merge('RGBA', [*(band.point(lambda v: min(255, round(v * CANES_GAIN))) for band in canes.split()[:3]),
                                        canes.split()[3]])
    for key, (folder, name) in ITEMS.items():
        out[key] = source(folder, name)
    return out


def model_sheets():
    """Puste miejsca na arkusze modeli sadzonek (rysuje je modele_roslin.py)."""
    return {model_key(species): Image.new('RGBA', (16, 16)) for species in SHRUBS}


def main():
    images = textures()
    sheets = model_sheets()
    write_models(images)
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    # Ikonki owoców (1.28.0) rysuje tools/owoce_ikony.py - nie nadpisujemy.
    from owoce_ikony import OWNED
    images = {key: image for key, image in images.items() if key not in OWNED or key not in data['regions']}
    sheet = data['sheets']['rosliny']
    path = ROOT / 'assets/textures' / sheet['file']
    missing = [key for key in [*images, *sheets] if key not in data['regions']]
    if missing:
        taken = set()
        for tile in data['tiles'].values():
            for dy in range(tile.get('h', 1)):
                for dx in range(tile.get('w', 1)):
                    taken.add((tile['x'] + dx, tile['y'] + dy))
        cells = [(x, y) for y in ROWS for x in range(FIRST_COLUMN, LAST_COLUMN + 1) if (x, y) not in taken]
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
            if key in sheets:
                data['aliases'].setdefault(f'assets/{key}.png', key)
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
    print(f'{len(images)} tekstur krzewów -> rosliny.png')


if __name__ == '__main__':
    main()
