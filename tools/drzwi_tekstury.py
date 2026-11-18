"""Tekstury drzwi i klap z każdego rodzaju desek (0.91.0, nowy wygląd 1.16.0).

Od 1.16.0 wzorcem są rysunki Kamila (tools/wzorce/drzwi.png i zapadnia.png
z modelu "drzwi i zapadnia.bbmodel", narysowane na deskach wiśni): poziome
deski co 4 px z ciemną klamką. Każde drewno dostaje TEN SAM rysunek
w kolorach własnych desek:

door_<drewno>            16 x 32 - przód drzwi (strona z klamką),
door_<drewno>_back       16 x 32 - tył drzwi,
door_<drewno>_edge       16 x 16 - krawędzie drzwi: wiersze 0-1 góra,
                         2-3 dół, 4-7 bok przy klamce (górna i dolna
                         połowa, położone), 8-11 bok przy zawiasie,
trapdoor_<drewno>        16 x 16 - wierzch klapy,
trapdoor_<drewno>_bottom 16 x 16 - spód klapy,
trapdoor_<drewno>_edge   16 x 16 - krawędzie klapy: wiersze 0-1, 2-3
                         boki, 4-5 przy zawiasie, 6-7 naprzeciw zawiasu.

Kolory: deski każdego drewna mają cztery tony (szpara, cień, deska,
połysk) - bierzemy je z desek gatunku w tych samych miejscach rozkładu
jasności co w deskach wiśni; drugi kolor szpary i dwa kolory klamki
liczą się z nich tak jak we wzorcu (wiśnia wychodzi co do piksela jak
rysunek Kamila).

Uruchomienie: python3 tools/drzwi_tekstury.py
Brakujące obszary i kafelki dopisuje do assets/textures/atlas.json
(arkusz drzewa.png rośnie w dół); potem: python3 tools/atlasy.py sync
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture, check, sync  # noqa: E402

# Ta sama kolejność co src/blocks/woods.js.
WOODS = [
    ('spruce', 'spruce_planks'), ('pine', 'pine_planks'), ('beech', 'beech_planks'), ('linden', 'linden_planks'),
    ('oak', 'oak_planks'), ('birch', 'birch_planks'), ('dark', 'dark_planks'), ('jablon', 'jablon/deski.png'),
    ('olcha', 'olcha/deski.png'), ('wierzba', 'wierzba/deski.png'), ('acacia', 'acacia/planks.png'),
    ('bald_cypress', 'bald_cypress/planks.png'), ('cherry', 'cherry/planks.png'), ('maple', 'maple/planks.png'),
    ('mugo', 'mugo/planks.png'), ('olive', 'olive/planks.png'), ('rainbow_eucalyptus', 'rainbow_eucalyptus/planks.png'),
    ('sequoia', 'sequoia/planks.png'), ('ginkgo', 'ginkgo/planks.png'), ('jacaranda', 'jacaranda/planks.png'),    # 1.9.0: miejsca w atlasie przydziela tools/tekstury_wyrobow_190.py.
    *[(wood, f'{wood}/planks.png') for wood in (
        'fir', 'baobab', 'coconut_palm', 'larch', 'mangrove', 'kapok', 'joshua_tree',
        'aspen', 'araucaria', 'banyan', 'dragon_tree', 'cedar', 'bristlecone')],
]

TEMPLATES = Path(__file__).resolve().parent / 'wzorce'

# Paleta wzorca od najciemniejszego: dwa kolory klamki, dwa kolory szpar,
# cień deski, deska, połysk.
TEMPLATE = [(113, 69, 41), (125, 79, 49), (142, 94, 63), (150, 102, 71), (182, 134, 101), (190, 140, 106), (192, 144, 112)]

# W deskach wiśni (256 pikseli od najciemniejszego) tony zajmują miejsca
# 0-75, 76-143, 144-214, 215-255 - bierzemy środki tych przedziałów.
RANKS = (38, 110, 179, 235)


def luminance(color):
    return 0.299 * color[0] + 0.587 * color[1] + 0.114 * color[2]


def palette(planks):
    """Siedem kolorów wzorca w barwach desek `planks` (obraz 16 x 16)."""
    pixels = sorted(planks.convert('RGB').get_flattened_data(), key=lambda c: (luminance(c), c))
    distinct = sorted(set(pixels), key=lambda c: (luminance(c), c))
    if len(distinct) == 4:
        # Deski z czterech tonów: wprost, niezależnie od tego, ile ich jest.
        gap, shade_, board, shine = distinct
    else:
        gap, shade_, board, shine = (pixels[rank] for rank in RANKS)
    base = TEMPLATE[2]

    def like(index):
        # Ten sam stosunek do koloru szpary co we wzorcu (klamka).
        return tuple(max(0, min(255, round(gap[k] * TEMPLATE[index][k] / base[k]))) for k in range(3))

    step = [(TEMPLATE[3][k] - TEMPLATE[2][k]) / (TEMPLATE[4][k] - TEMPLATE[2][k]) for k in range(3)]
    gap2 = tuple(round(gap[k] + (shade_[k] - gap[k]) * step[k]) for k in range(3))
    return [like(0), like(1), gap, gap2, shade_, board, shine]


def recolor(image, colors):
    out = Image.new('RGBA', image.size)
    index = {color: i for i, color in enumerate(TEMPLATE)}
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = image.getpixel((x, y))
            if a != 255 or (r, g, b) not in index:
                raise ValueError(f'Wzorzec: nieznany kolor {(r, g, b, a)} w ({x}, {y})')
            out.putpixel((x, y), (*colors[index[(r, g, b)]], 255))
    return out


def rows(strips, fill):
    """Kafelek 16 x 16 z pasków 16 x 2 jeden pod drugim; reszta - kolor fill."""
    tile = Image.new('RGBA', (16, 16), fill)
    for i, strip in enumerate(strips):
        tile.paste(strip, (0, i * 2))
    return tile


def template_parts():
    with Image.open(TEMPLATES / 'drzwi.png') as source:
        door = source.convert('RGBA')
    with Image.open(TEMPLATES / 'zapadnia.png') as source:
        trap = source.convert('RGBA')
    fill = (*TEMPLATE[2], 255)

    def side(x):
        # Pasek 2 x 32 położony: dwie połowy 16 x 2 (góra drzwi z lewej).
        strip = door.crop((x, 33, x + 2, 65)).transpose(Image.Transpose.ROTATE_90).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        return [strip.crop((0, 0, 16, 2)), strip.crop((16, 0, 32, 2))]

    return {
        'door': door.crop((0, 0, 16, 32)),
        'door_back': door.crop((17, 0, 33, 32)),
        'door_edge': rows([door.crop((6, 33, 22, 35)), door.crop((23, 33, 39, 35)), *side(0), *side(3)], fill),
        'trapdoor': trap.crop((0, 0, 16, 16)),
        'trapdoor_bottom': trap.crop((0, 17, 16, 33)),
        'trapdoor_edge': rows([trap.crop((17, y, 33, y + 2)) for y in (0, 3, 6, 9)], fill)
    }


PARTS = None


def images(planks):
    """Wszystkie obrazki drzwi i klapy z desek `planks`: {przyrostek: obraz}."""
    global PARTS
    PARTS = PARTS or template_parts()
    colors = palette(planks)
    return {name: recolor(part, colors) for name, part in PARTS.items()}


def door_image(planks):
    return images(planks)['door']


def trapdoor_image(planks):
    return images(planks)['trapdoor']


def texture_keys(wood):
    return {'door': f'door_{wood}', 'door_back': f'door_{wood}_back', 'door_edge': f'door_{wood}_edge',
            'trapdoor': f'trapdoor_{wood}', 'trapdoor_bottom': f'trapdoor_{wood}_bottom', 'trapdoor_edge': f'trapdoor_{wood}_edge'}


def add_regions():
    """Przód drzwi i wierzch klapy dwudziestu dawnych rodzajów drewna (0.91.0)."""
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if all(f'door_{wood}' in data['regions'] for wood, _ in WOODS[:20]):
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


# 1.16.0: tył i krawędzie drzwi, spód i krawędzie klapy - wolne miejsce
# atlasu pod arkuszami kory (wiersz 88 i kolumna 16 zostają puste, bo
# ikonki bloków łapią brzeg sąsiedniego kafelka).
EXTRA_COLUMN, EXTRA_ROW = 17, 89


def add_extra_regions():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if all(f'trapdoor_{wood}_edge' in data['regions'] for wood, _ in WOODS):
        return
    sheet = data['sheets']['drzewa']
    top = sheet['height']
    per_row = sheet['width'] // 16
    lines = -(-len(WOODS) // per_row)
    # Arkusz: rzędy tyłów drzwi (32 px), spodów klap, krawędzi drzwi i krawędzi klap.
    height = lines * (32 + 16 * 3)
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
    groups = [('door_{}_back', 32, 0), ('trapdoor_{}_bottom', 16, 2), ('door_{}_edge', 16, 3), ('trapdoor_{}_edge', 16, 4)]
    y_px = top
    for pattern, size, row in groups:
        for index, (wood, _) in enumerate(WOODS):
            key = pattern.format(wood)
            h = size // 16
            x, y = EXTRA_COLUMN + index, EXTRA_ROW + row
            cells = {(x, y + dy) for dy in range(h)}
            assert not cells & taken, f'{key}: kafelek zajęty'
            taken |= cells
            data['regions'][key] = {'sheet': 'drzewa', 'x': (index % per_row) * 16, 'y': y_px + (index // per_row) * size,
                                    'width': 16, 'height': size}
            tile = {'x': x, 'y': y, 'region': key}
            if h > 1:
                tile.update(w=1, h=h, pw=16, ph=size)
            data['tiles'][key] = tile
        y_px += lines * size
    data['rows'] = max(t['y'] + t.get('h', 1) for t in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    add_regions()
    add_extra_regions()
    for wood, planks_key in WOODS:
        pictures = images(read_texture(planks_key))
        for name, key in texture_keys(wood).items():
            write_texture(key, pictures[name])
    check()
    sync()
    print(f'{len(WOODS)} drzwi i {len(WOODS)} klap -> drzewa.png')


if __name__ == '__main__':
    main()
