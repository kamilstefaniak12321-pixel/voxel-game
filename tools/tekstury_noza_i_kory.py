# ------------------------------------------------------------
# TEKSTURY NOŻA I KORY (0.100.0)
#
# - nóż (ikona 16 x 16 w stylu pozostałych narzędzi: trzonek od lewego
#   dołu, kamienne ostrze w prawą górę) + pięć pustych miejsc na
#   warianty z innych skał (piksele wpisuje potem
#   tools/tekstury_noza_skaly.mjs - tą samą funkcją, której używa gra),
# - kora każdego drzewa: kształt zwoju kory brzozowej, kolory z boku
#   pnia danego gatunku.
#
# Skrypt sam dopisuje nowe regiony i kafelki do assets/textures/atlas.json
# (wolne miejsca w arkuszach przedmioty.png i drzewa.png) i odświeża
# src/rendering/TextureSheetData.js. Powtórne uruchomienie niczego nie
# dubluje - tylko rysuje od nowa.
#
#     python3 tools/tekstury_noza_i_kory.py [podglad.png]
# ------------------------------------------------------------
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import MANIFEST, ROOT, read_texture, write_texture, check, sync  # noqa: E402

STONES = ['granite', 'limestone', 'sandstone', 'slate', 'basalt']

# Drzewa: gatunek -> tekstura boku pnia (jak w src/blocks/treeCatalog.js).
TREES = {
    'spruce': 'spruce_log_side', 'pine': 'pine_log_side', 'beech': 'beech_log_side',
    'linden': 'linden_log_side', 'oak': 'oak_log_side',
    'jablon': 'jablon/pien_bok.png', 'olcha': 'olcha/pien_bok.png', 'wierzba': 'wierzba/pien_bok.png',
    'acacia': 'acacia/log_side.png', 'bald_cypress': 'bald_cypress/log_side.png', 'cherry': 'cherry/log_side.png',
    'maple': 'maple/log_side.png', 'mugo': 'mugo/log_side.png', 'olive': 'olive/log_side.png',
    'rainbow_eucalyptus': 'rainbow_eucalyptus/log_side.png', 'sequoia': 'sequoia/log_side.png',
    'ginkgo': 'ginkgo/log_side.png', 'jacaranda': 'jacaranda/log_side.png',
}

# Wolne kafelki wspólnego atlasu (kolumna, wiersz) - same pojedyncze,
# z dala od modeli zajmujących kilka kafelków.
FREE_TILES = [(x, 35) for x in range(2, 16)] + [(x, 10) for x in (2, 3, 4, 5, 13, 14, 15)] + [(7, 14), (8, 14), (9, 14)]


def load():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


def save(data):
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def free_cell(data, sheet):
    """Pierwsza wolna kratka 16 x 16 w arkuszu (wierszami od góry)."""
    spec = data['sheets'][sheet]
    used = set()
    for region in data['regions'].values():
        if region['sheet'] != sheet:
            continue
        for y in range(region['y'] // 16, (region['y'] + region['height'] + 15) // 16):
            for x in range(region['x'] // 16, (region['x'] + region['width'] + 15) // 16):
                used.add((x, y))
    for y in range(spec['height'] // 16):
        for x in range(spec['width'] // 16):
            if (x, y) not in used:
                return x * 16, y * 16
    raise ValueError(f'Brak wolnego miejsca w arkuszu {sheet}')


def free_tile(data):
    used = set()
    for tile in data['tiles'].values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                used.add((tile['x'] + dx, tile['y'] + dy))
    for cell in FREE_TILES:
        if cell not in used:
            return cell
    raise ValueError('Brak wolnego kafelka atlasu - dopisz miejsca do FREE_TILES')


def register(name, sheet, alias=None):
    """Region + kafelek dla nowej tekstury (gdy jeszcze ich nie ma)."""
    data = load()
    if name not in data['regions']:
        x, y = free_cell(data, sheet)
        data['regions'][name] = {'sheet': sheet, 'x': x, 'y': y, 'width': 16, 'height': 16}
    if name not in data['tiles']:
        x, y = free_tile(data)
        data['tiles'][name] = {'x': x, 'y': y, 'region': name}
    if alias:
        data['aliases'][alias] = name
    save(data)


# --- Nóż ----------------------------------------------------------------

WOOD, WOOD_DARK = (150, 104, 60), (112, 76, 44)
BIND = (92, 62, 36)
# Kamień w chłodnych szarościach - po nich gra poznaje głowicę i barwi
# ją skałą (src/rendering/StoneToolTextures.js).
EDGE, LIGHT, MID, DARK, LINE = (214, 218, 224), (176, 180, 186), (140, 144, 150), (98, 102, 108), (58, 61, 66)

KNIFE = [
    '................',
    '.............k..',
    '............kek.',
    '...........kelk.',
    '..........kelmk.',
    '.........kelmdk.',
    '........kelmdk..',
    '.......kelmdk...',
    '......kblmdk....',
    '.....wWbbdk.....',
    '....wWDbk.......',
    '...wWD..........',
    '..wWD...........',
    '..WD............',
    '................',
    '................',
]
KNIFE_COLORS = {'k': LINE, 'e': EDGE, 'l': LIGHT, 'm': MID, 'd': DARK, 'w': (176, 128, 78), 'W': WOOD, 'D': WOOD_DARK, 'b': BIND}


def knife():
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(KNIFE):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), (*KNIFE_COLORS[key], 255))
    return image


# --- Kora ---------------------------------------------------------------

def luminance(color):
    return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722


def bark(log_side):
    """Zwój kory: kształt kory brzozowej, kolory z boku pnia gatunku."""
    shape = read_texture('birch_bark')
    colors = sorted({log_side.getpixel((x, y))[:3] for y in range(16) for x in range(16)}, key=luminance)
    pick = lambda q: colors[min(len(colors) - 1, round(q * (len(colors) - 1)))]
    darkest = tuple(round(c * 0.55) for c in pick(0.0))
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y in range(16):
        for x in range(16):
            r, g, b, a = shape.getpixel((x, y))
            if a == 0:
                continue
            if r > b + 24:
                # Jasny spód zwoju (łyko) zostaje jak w brzozie.
                color = (r, g, b)
            else:
                level = luminance((r, g, b))
                # Brzoza: 46 - ciemne znaki, 76-110 - obrys, 168-242 - biała kora.
                if level < 60:
                    color = tuple(round(c * 0.8) for c in pick(0.05))
                elif level < 120:
                    color = darkest
                else:
                    color = pick(0.25 + 0.7 * min(1.0, (level - 165) / 78))
            image.putpixel((x, y), (*color, 255))
    return image


def main():
    preview = []

    register('knife', 'przedmioty')
    write_texture('knife', knife())
    preview.append(knife())
    for stone in STONES:
        name = f'knife_{stone}'
        register(name, 'przedmioty', alias=f'assets/textures/derived/{name}.png')

    for tree, side in TREES.items():
        name = f'{tree}_bark'
        register(name, 'drzewa')
        image = bark(read_texture(side))
        write_texture(name, image)
        preview.append(image)

    check()
    sync()

    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (len(preview) * 17 * 8, 16 * 8), (60, 60, 60, 255))
        for index, image in enumerate(preview):
            big = image.resize((128, 128), Image.NEAREST)
            sheet.paste(big, (index * 17 * 8, 0), big)
        sheet.save(sys.argv[1])
    print(f'OK: nóż, {len(STONES)} miejsc na warianty skał, {len(TREES)} rodzajów kory.')


if __name__ == '__main__':
    main()
