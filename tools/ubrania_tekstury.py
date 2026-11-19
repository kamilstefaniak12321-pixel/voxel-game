"""Tekstury włókien, płócien, ubrań i stołu krawieckiego (1.27.0).

Rysowane tutaj, piksel po pikselu (16 x 16):
  - flax_retted, nettle_retted - moczony len i moczona pokrzywa
                                 (ciemniejsze, mokre wiązki),
  - flax_fiber, nettle_fiber   - pęk włókna (jasny lniany, szarozielony),
  - bast                       - paski łyka,
  - rope                       - zwinięty sznur,
  - linen_cloth, nettle_cloth  - złożone płótno, bast_weave - plecionka,
  - <krój>_<płótno>            - ubrania w naturalnym kolorze płótna
                                 (items/clothing.js - GARMENT_TYPES);
                                 barwione ubrania przemalowuje gra
                                 (ui/garmentIcons.js) - jasność pikseli
                                 względem koloru płótna zostaje,
  - sewing_table_top, sewing_table_top_b - blat stołu krawieckiego
                                 (brzozowe deski z atlasu): część A z miarką
                                 krawiecką, część B z kredowymi liniami.
                                 Nogi i boki to zwykłe brzozowe deski.

Kolory płócien muszą być takie jak w items/clothing.js (CLOTHS).
Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py - install).

Uruchomienie: python3 tools/ubrania_tekstury.py [podglad.png]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

# Jak CLOTHS w items/clothing.js: kolor i kolor wzoru (cień).
CLOTHS = {
    'linen': ((220, 207, 174), (155, 138, 98)),
    'nettle': ((168, 173, 140), (107, 113, 85)),
    'bast': ((180, 139, 87), (122, 90, 51)),
}

GARMENTS = {
    'cap': ['linen', 'nettle'], 'scarf': ['linen', 'nettle'], 'headband': ['linen', 'nettle'],
    'shirt': ['linen', 'nettle'], 'vest': ['linen', 'nettle', 'bast'], 'tunic': ['linen', 'nettle'],
    'trousers': ['linen', 'nettle'], 'shorts': ['linen', 'nettle'],
    'boots': ['linen', 'nettle'], 'lapcie': ['bast'],
}


def scale(color, k):
    return tuple(max(0, min(255, int(c * k))) for c in color)


def blank():
    return Image.new('RGBA', (16, 16), (0, 0, 0, 0))


def put(image, x, y, color, alpha=255):
    if 0 <= x < 16 and 0 <= y < 16:
        image.putpixel((x, y), (*color, alpha))


def shape(rows):
    """Maska z listy napisów (16 wierszy, '#' - materiał)."""
    return {(x, y) for y, row in enumerate(rows) for x, ch in enumerate(row) if ch == '#'}


def paint(mask, color, outline=True, light=1.12, dark=0.8):
    """Wypełnia maskę kolorem: światło z lewej-góry, cień z prawej-dołu,
    ciemny obrys (jasność względem koloru zostaje przy przemalowaniu)."""
    image = blank()
    for x, y in mask:
        edge = any((x + dx, y + dy) not in mask for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
        if edge and outline:
            put(image, x, y, scale(color, 0.55))
            continue
        k = 1.0
        if (x - 1, y) not in mask or (x, y - 1) not in mask:
            k = light
        elif (x + 1, y) not in mask or (x, y + 1) not in mask:
            k = dark
        # Splot: co drugi piksel odrobinę ciemniej.
        if (x + y) % 2 == 0:
            k *= 0.96
        put(image, x, y, scale(color, k))
    return image


SHAPES = {
    'cap': shape([
        '................', '................', '................', '................',
        '......####......', '....########....', '...##########...', '..############..',
        '..############..', '..############..', '.##############.', '.##############.',
        '................', '................', '................', '................']),
    'scarf': shape([
        '................', '................', '................', '.##############.',
        '..############..', '...##########...', '....########....', '.....######.....',
        '......####......', '.......##.......', '......#..#......', '.....#....#.....',
        '................', '................', '................', '................']),
    'headband': shape([
        '................', '................', '................', '................',
        '................', '....########....', '..############..', '.###........###.',
        '.###........###.', '..############..', '....########....', '................',
        '................', '................', '................', '................']),
    'shirt': shape([
        '................', '.....##..##.....', '..############..', '.##############.',
        '################', '###.########.###', '###.########.###', '###.########.###',
        '##..########..##', '....########....', '....########....', '....########....',
        '....########....', '....########....', '................', '................']),
    'vest': shape([
        '................', '....###..###....', '...####..####...', '...####..####...',
        '...####..####...', '...####..####...', '...####..####...', '...#####.####...',
        '...##########...', '...##########...', '...##########...', '...##########...',
        '...##########...', '................', '................', '................']),
    'tunic': shape([
        '.....##..##.....', '..############..', '.##############.', '################',
        '###.########.###', '###.########.###', '##..########..##', '....########....',
        '....########....', '....########....', '...##########...', '...##########...',
        '...##########...', '...##########...', '..############..', '................']),
    'trousers': shape([
        '................', '....########....', '....########....', '....########....',
        '....###..###....', '....###..###....', '....###..###....', '....###..###....',
        '....###..###....', '....###..###....', '....###..###....', '....###..###....',
        '...####..####...', '...####..####...', '................', '................']),
    'shorts': shape([
        '................', '................', '................', '................',
        '....########....', '....########....', '....########....', '....###..###....',
        '....###..###....', '...####..####...', '...####..####...', '................',
        '................', '................', '................', '................']),
    'boots': shape([
        '................', '................', '................', '................',
        '..###.....###...', '..###.....###...', '..###.....###...', '..###.....###...',
        '..###.....###...', '..#####...#####.', '..#####...#####.', '..#####...#####.',
        '................', '................', '................', '................']),
    'lapcie': shape([
        '................', '................', '................', '................',
        '................', '................', '................', '..##......##....',
        '.####....####...', '######..######..', '######..######..', '.#####...#####..',
        '................', '................', '................', '................']),
}


def garment(kind, cloth):
    color, shade = CLOTHS[cloth]
    image = paint(SHAPES[kind], color)
    # Szwy i detale w kolorze wzoru (cień płótna).
    if kind in ('shirt', 'tunic'):
        for y in range(4, 8 if kind == 'shirt' else 7):
            put(image, 7, y, shade)
    if kind == 'lapcie' or cloth == 'bast':
        # Splot łyka: ukośne pasma.
        for x, y in SHAPES[kind]:
            if (x + y) % 3 == 0 and image.getpixel((x, y))[:3] != scale(color, 0.55):
                put(image, x, y, scale(color, 0.82))
    if kind == 'lapcie':
        # Sznurek wokół kostki.
        for x in (3, 4, 11, 12):
            put(image, x, 6, (226, 214, 180))
    if kind == 'cap':
        for x in range(2, 14):
            put(image, x, 10, shade)
    return image


def hank(color, wet=False):
    """Pęk włókna albo wiązka łodyg: pionowe pasma przewiązane w pasie."""
    image = blank()
    for x in range(4, 12):
        top = 2 + abs(x - 8) // 2
        for y in range(top, 15 - abs(x - 8) // 3):
            k = 1.08 if x % 2 == 0 else 0.92
            if wet:
                k *= 0.82
            put(image, x, y, scale(color, k))
    for x in range(4, 12):
        put(image, x, 8, scale(color, 0.55 if not wet else 0.45))
    if wet:
        for x, y in ((5, 4), (9, 11), (7, 13)):
            put(image, x, y, (150, 190, 215), 200)
    return image


def bast():
    image = blank()
    color = (196, 160, 104)
    for i, x0 in enumerate((3, 6, 9, 12)):
        for y in range(2, 15):
            x = x0 + (1 if (y + i) % 6 < 3 else 0)
            put(image, x, y, scale(color, 1.05 if y % 3 else 0.9))
            put(image, x - 1, y, scale(color, 0.78))
    return image


def rope():
    image = blank()
    color = (205, 186, 140)
    import math
    for t in range(0, 360 * 3, 6):
        r = 2 + t / 360 * 1.8
        x = 8 + r * math.cos(math.radians(t))
        y = 8 + r * math.sin(math.radians(t)) * 0.8
        put(image, int(round(x)), int(round(y)), scale(color, 1.1 if (t // 30) % 2 else 0.8))
    for x in range(10, 15):
        put(image, x, 12, scale(color, 0.9))
    put(image, 14, 13, scale(color, 0.7))
    return image


def cloth(key):
    color, shade = CLOTHS[key]
    image = blank()
    for y in range(4, 13):
        for x in range(2, 14):
            k = 1.1 if y < 6 else 0.96 if y < 10 else 0.86
            if (x + y) % 2 == 0:
                k *= 0.95
            put(image, x, y, scale(color, k))
    # Zagięcie i brzegi.
    for x in range(2, 14):
        put(image, x, 4, scale(color, 1.2))
        put(image, x, 9, shade)
        put(image, x, 12, scale(shade, 0.85))
    for y in range(4, 13):
        put(image, 2, y, scale(color, 0.7))
        put(image, 13, y, scale(color, 0.7))
    if key == 'bast':
        for y in range(4, 13):
            for x in range(2, 14):
                if (x // 2 + y // 2) % 2 == 0:
                    put(image, x, y, scale(color, 0.8))
    return image


def planks(name='birch_planks'):
    """Kafelek desek z atlasu (blat stołu ma być z tego samego drewna co nogi)."""
    import json
    root = Path(__file__).resolve().parent.parent
    data = json.loads((root / 'assets/textures/atlas.json').read_text(encoding='utf-8'))
    region = data['regions'][name]
    with Image.open(root / 'assets/textures' / data['sheets'][region['sheet']]['file']) as sheet:
        return sheet.convert('RGBA').crop((region['x'], region['y'], region['x'] + 16, region['y'] + 16))


def table_top():
    """Część A blatu (tu leży materiał): brzozowe deski, wzdłuż przedniego
    brzegu żółta miarka krawiecka z kreskami."""
    image = planks()
    for x in range(16):
        put(image, x, 14, (226, 196, 76))
        put(image, x, 15, (196, 164, 58))
        if x % 2 == 0:
            put(image, x, 14, (70, 60, 40))
    for x in (0, 5, 10, 15):
        put(image, x, 13, (70, 60, 40))
    return image


def table_top_b():
    """Część B blatu (tu leżą wyroby): deski z kredowymi liniami wykroju."""
    image = planks()
    chalk = (238, 238, 232)
    for i in range(16):
        if i % 2 == 0:
            put(image, 8, i, chalk)
            put(image, i, 8, chalk)
    for x, y in ((3, 3), (12, 3), (3, 12), (12, 12)):
        put(image, x, y, chalk)
    return image


def textures():
    out = {
        'flax_retted': hank((196, 168, 112), wet=True),
        'nettle_retted': hank((110, 132, 82), wet=True),
        'flax_fiber': hank((226, 214, 178)),
        'nettle_fiber': hank((176, 180, 150)),
        'bast': bast(),
        'rope': rope(),
        'linen_cloth': cloth('linen'),
        'nettle_cloth': cloth('nettle'),
        'bast_weave': cloth('bast'),
        'sewing_table_top': table_top(),
        'sewing_table_top_b': table_top_b(),
    }
    for kind, cloths in GARMENTS.items():
        for key in cloths:
            out[f'{kind}_{key}'] = garment(kind, key)
    return out


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        names = list(images)
        sheet = Image.new('RGBA', (8 * 34, ((len(names) + 7) // 8) * 34), (60, 60, 60, 255))
        for i, name in enumerate(names):
            sheet.paste(images[name].resize((32, 32), Image.NEAREST), ((i % 8) * 34 + 1, (i // 8) * 34 + 1), images[name].resize((32, 32), Image.NEAREST))
        sheet.resize((sheet.width * 2, sheet.height * 2), Image.NEAREST).save(sys.argv[1])
    print(f'{len(images)} tekstur ubrań -> rosliny.png')


if __name__ == '__main__':
    main()
