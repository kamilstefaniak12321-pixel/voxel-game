# ------------------------------------------------------------
# TEKSTURY GLINY (1.1.0)
#
# - dwie nowe gliny (czerwona, biała) - ten sam rysunek co zwykła glina,
#   inne kolory,
# - cegły z każdej gliny (blok): cztery rzędy cegieł na przemian,
# - przedmioty: mokry i suchy kubek, mokra i sucha cegła z każdej gliny
#   (mokre są ciemniejsze i błyszczą).
#
# Skrypt sam dopisuje regiony i kafelki do assets/textures/atlas.json
# (dwa nowe wiersze na końcu wspólnego atlasu) i odświeża
# src/rendering/TextureSheetData.js. Powtórne uruchomienie tylko rysuje
# od nowa.
#
#     python3 tools/tekstury_gliny.py [podglad.png]
# ------------------------------------------------------------
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import MANIFEST, ROOT, read_texture, write_texture, check, sync  # noqa: E402
from tekstury_noza_i_kory import free_cell, load, save  # noqa: E402

# Nowe wiersze atlasu (48 i 49) - same pojedyncze kafelki.
ROWS = 50
FREE_TILES = [(x, y) for y in (48, 49) for x in range(16)]

# Glina: (cień, środek, światło) suchej; nazwa przedrostka przedmiotów.
CLAYS = {
    'clay': {'prefix': 'clay', 'dry': ((104, 60, 44), (150, 88, 62), (214, 150, 110)), 'brick': ((132, 96, 62), (176, 136, 92), (204, 168, 122))},
    'red_clay': {'prefix': 'red_clay', 'dry': ((96, 34, 26), (158, 62, 42), (212, 112, 82)), 'brick': ((118, 46, 34), (166, 72, 50), (198, 104, 76))},
    'white_clay': {'prefix': 'white_clay', 'dry': ((136, 128, 116), (204, 196, 182), (240, 234, 222)), 'brick': ((150, 142, 128), (208, 200, 186), (234, 228, 216))},
}
# Kolory surowej gliny w ziemi (mnożniki względem zwykłej).
RAW = {'red_clay': (166, 84, 58), 'white_clay': (214, 208, 196)}


def register(name, sheet):
    data = load()
    data['rows'] = max(data.get('rows', 0), ROWS)
    if name not in data['regions']:
        try:
            x, y = free_cell(data, sheet)
        except ValueError:
            # Arkusz pełny: dokładamy na dole jeden wiersz kafelków.
            spec = data['sheets'][sheet]
            path = ROOT / 'assets/textures' / spec['file']
            old = Image.open(path).convert('RGBA')
            grown = Image.new('RGBA', (spec['width'], spec['height'] + 16), (0, 0, 0, 0))
            grown.paste(old, (0, 0))
            grown.save(path, optimize=True)
            spec['height'] += 16
            x, y = free_cell(data, sheet)
        data['regions'][name] = {'sheet': sheet, 'x': x, 'y': y, 'width': 16, 'height': 16}
    if name not in data['tiles']:
        used = {(t['x'] + dx, t['y'] + dy) for t in data['tiles'].values() for dx in range(t.get('w', 1)) for dy in range(t.get('h', 1))}
        cell = next(c for c in FREE_TILES if c not in used)
        data['tiles'][name] = {'x': cell[0], 'y': cell[1], 'region': name}
    save(data)


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def shade(color, k):
    return tuple(max(0, min(255, round(c * k))) for c in color)


def luminance(c):
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722


def raw_clay(target):
    """Glina w ziemi: rysunek zwykłej gliny w innym kolorze."""
    base = read_texture('clay')
    lums = [luminance(base.getpixel((x, y))) for y in range(16) for x in range(16)]
    mean = sum(lums) / len(lums)
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            k = luminance(base.getpixel((x, y))) / mean
            image.putpixel((x, y), (*shade(target, k), 255))
    return image


def wet(palette):
    """Mokra glina: ciemniejsza i bardziej nasycona."""
    return tuple(shade(mix(c, (70, 46, 34), 0.38), 0.86) for c in palette)


def cup(palette, shiny=False):
    """Kubek: kształt glinianego kubka, kolory tej gliny."""
    shape = read_texture('clay_cup')
    dark, mid, light = palette
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            r, g, b, a = shape.getpixel((x, y))
            if a == 0:
                continue
            level = luminance((r, g, b))
            # Oryginał: 40 - wnętrze, 68 - cień, 99 - glina, 127 - jasna, 160 - połysk.
            color = shade(dark, 0.6) if level < 50 else dark if level < 80 else mid if level < 112 else mix(mid, light, 0.55) if level < 140 else light
            image.putpixel((x, y), (*color, 255))
    if shiny:
        for x, y in ((4, 8), (4, 9), (5, 7)):
            image.putpixel((x, y), (*mix(light, (255, 255, 255), 0.5), 255))
    return image


BRICK = [
    '................',
    '................',
    '................',
    '................',
    '..llllllllllll..',
    '.lmmmmmmmmmmmmd.',
    '.lmmmmmmmmmmmmd.',
    '.lmmmmhmmmmmmmd.',
    '.lmmmmmmmmhmmmd.',
    '.lmmmmmmmmmmmmd.',
    '.mddddddddddddk.',
    '..kkkkkkkkkkkk..',
    '................',
    '................',
    '................',
    '................',
]


def brick(palette, shiny=False):
    dark, mid, light = palette
    colors = {'l': light, 'm': mid, 'd': dark, 'k': shade(dark, 0.62), 'h': mix(mid, dark, 0.45)}
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(BRICK):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), (*colors[key], 255))
    if shiny:
        for x in (3, 4, 5, 9):
            image.putpixel((x, 5), (*mix(light, (255, 255, 255), 0.55), 255))
    return image


def bricks_block(palette):
    """Blok cegieł: 4 rzędy, cegła 8 x 4 px z fugą, co drugi rząd przesunięty."""
    dark, mid, light = palette
    mortar = mix(shade(dark, 0.9), (150, 144, 134), 0.35)
    image = Image.new('RGBA', (16, 16))
    for y in range(16):
        row, inside = divmod(y, 4)
        offset = 4 if row % 2 else 0
        for x in range(16):
            bx = (x + offset) % 8
            if inside == 3 or bx == 7:
                color = mortar
            else:
                # Każda cegła trochę inna; jasna górna krawędź, ciemny dół.
                index = (row * 3 + ((x + offset) // 8) * 5) % 4
                tone = (0.94, 1.0, 1.06, 0.98)[index]
                edge = 1.08 if inside == 0 else 0.92 if inside == 2 else 1.0
                speck = 0.95 if (x * 7 + y * 13) % 11 == 0 else 1.0
                color = shade(mid, tone * edge * speck)
            image.putpixel((x, y), (*color, 255))
    return image


def main():
    preview = []

    def put(name, sheet, image):
        register(name, sheet)
        write_texture(name, image)
        preview.append(image)

    for clay, target in RAW.items():
        put(clay, 'teren', raw_clay(target))
    for clay, spec in CLAYS.items():
        prefix = spec['prefix']
        put(f'{prefix}_bricks', 'teren', bricks_block(spec['brick']))
        put(f'wet_{prefix}_cup', 'przedmioty', cup(wet(spec['dry']), shiny=True))
        if prefix != 'clay':
            put(f'{prefix}_cup', 'przedmioty', cup(spec['dry']))
        put(f'wet_{prefix}_brick', 'przedmioty', brick(wet(spec['brick']), shiny=True))
        put(f'{prefix}_brick', 'przedmioty', brick(spec['brick']))

    check()
    sync()
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (len(preview) * 68, 64), (60, 60, 60, 255))
        for index, image in enumerate(preview):
            big = image.resize((64, 64), Image.NEAREST)
            sheet.paste(big, (index * 68, 0), big)
        sheet.save(sys.argv[1])
    print(f'OK: {len(preview)} tekstur gliny.')


if __name__ == '__main__':
    main()
