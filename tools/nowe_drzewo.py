# ------------------------------------------------------------
# NOWE DRZEWO - zakłada paczkę drzewa w assets/drzewa/<nazwa>/
#
# Tworzy gotową do gry paczkę: drzewo.json (wszystkie pola wypełnione),
# dwa szablony kształtu (małe i duże drzewo, pliki .txt) i tekstury
# zastępcze 16 x 16 narysowane w stylu gry (kora, słoje, deski, liście,
# sadzonka, opadłe liście, a z owocem - liście z owocami i owoc).
# Dopisuje drzewo do assets/drzewa/lista.json i nadaje mu wolne numery
# bloków. Potem wystarczy podmienić tekstury i poprawić kształt - opis
# krok po kroku: docs/drzewa-paczki.md.
#
# Uruchomienie (w folderze gry, Python z numpy i Pillow):
#     python tools/nowe_drzewo.py grusza
#         pyta o polską nazwę, dopełniacz ("pień czego?") i owoc
#     python tools/nowe_drzewo.py grusza --nazwa grusza --dopelniacz gruszy --owoc gruszka
#         to samo bez pytań
#
# Inne opcje:
#     --iglaste                  igły zamiast liści, kora z łusek, kształt stożka
#     --kolor-lisci 90,150,60    kolor liści (R,G,B)
#     --kolor-kory 104,88,74     kolor kory
#     --kolor-drewna 216,186,138 kolor drewna (słoje, okorowany pień, deski)
#     --kolor-owocu 200,46,40    kolor owocu
#     --nadpisz                  zastąp istniejący folder
# ------------------------------------------------------------

import argparse
import json
import os
import re
import sys
import unicodedata

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tekstury import N, ROOT, XX, YY, rng, scatter, shades, mix  # noqa: E402
from tekstury_drzew import (  # noqa: E402
    empty, put, outline, shade_shape, ellipse, line_cells, as_image, opaque,
    plates_bark, furrow_bark, rings, grain, planks, leaf_cells, needles, leaves_tile,
    sapling_broadleaf, litter
)


DIR = os.path.join(ROOT, 'assets', 'drzewa')
LIST = os.path.join(DIR, 'lista.json')

FIRST_ID = 100
LAST_ID = 255
SLOTS = 10

RESERVED = {
    'swierk', 'spruce', 'sosna', 'pine', 'buk', 'beech', 'lipa', 'linden', 'dab', 'oak', 'brzoza', 'birch',
    'lamp', 'short', 'tall', 'strawberry', 'blackberry', 'chili', 'hazel', 'hazelnut',
    'coarse', 'forest', 'water', 'grass', 'dirt', 'stone', 'sand', 'gravel', 'mud', 'clay',
    'humus', 'granite', 'limestone', 'sandstone', 'slate', 'basalt', 'meteorite', 'lepidolite',
    'axe', 'pickaxe', 'shovel', 'stick', 'resin', 'acorn', 'beechnuts', 'bush', 'tree', 'leaves',
    'fern', 'clover', 'nettle', 'plantain', 'poppy', 'cornflower', 'chamomile', 'dandelion'
}


def slug(text):
    """'Gruszka' -> 'gruszka', 'jabłoń' -> 'jablon' (bez polskich liter)."""
    text = text.replace('ł', 'l').replace('Ł', 'L')
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-z0-9]', '', text.lower())


def color(text):
    parts = [int(p) for p in text.split(',')]
    if len(parts) != 3 or not all(0 <= p <= 255 for p in parts):
        raise argparse.ArgumentTypeError('kolor: trzy liczby 0-255 po przecinku, np. 90,150,60')
    return tuple(parts)


def seed_of(name):
    h = 2166136261
    for ch in name:
        h = ((h ^ ord(ch)) * 16777619) & 0xffffffff
    return h % 100000


# ------------------------------------------------------------
# Tekstury zastępcze
# ------------------------------------------------------------

def conifer_sapling(green):
    img = empty()
    trunk = (96, 66, 46)
    for y in range(11, 16):
        put(img, 7, y, trunk)
        put(img, 8, y, np.array(trunk) * 0.8)
    palette = shades(green, 5, 0.6, 1.3, (0.9, 1.0, 1.05))
    for top, half in [(3, 2), (5, 3), (8, 4), (11, 5)]:
        for row in range(3):
            y = top + row
            w = max(1, half - (2 - row))
            for x in range(8 - w, 8 + w):
                t = 0.75 - (x - 8 + w) / (2 * w) * 0.5 - row * 0.08
                put(img, x, y, palette[int(np.clip(round(t * 4), 0, 4))])
    put(img, 7, 1, palette[3])
    put(img, 7, 2, palette[4])
    put(img, 8, 2, palette[2])
    return img


def fruit_on_leaves(leaves, fruit, seed):
    """Liście z owocami: na liściach kilka okrągłych owoców 2 x 2
    z jasnym bokiem i ogonkiem."""
    img = leaves.copy()
    r = rng(seed)
    light = np.clip(np.array(fruit) * 1.3 + 20, 0, 255)
    dark = np.array(fruit) * 0.68
    for x, y in scatter(r, 5, 4.6):
        x, y = int(x) % (N - 1), int(y) % (N - 1)
        put(img, x, y, light)
        put(img, x + 1, y, fruit)
        put(img, x, y + 1, fruit)
        put(img, x + 1, y + 1, dark)
        put(img, x + 1, (y - 1) % N, (92, 70, 40))
    return img


def fruit_item(fruit, leaf):
    """Owoc (przedmiot): okrągły, z ogonkiem i listkiem."""
    img = empty()
    body = ellipse(8.0, 9.6, 5.2, 5.0)
    shape = shade_shape(body, shades(fruit, 6, 0.6, 1.3, (1.0, 0.95, 0.92)), strength=1.5)
    img[body] = shape[body]
    for x, y in line_cells(8, 5, 9, 2):
        put(img, x, y, (98, 70, 42))
    leaf_mask = ellipse(11.6, 3.2, 2.4, 1.2, -0.5)
    leaf_img = shade_shape(leaf_mask, shades(leaf, 5, 0.65, 1.25), strength=1.0)
    img[leaf_mask] = leaf_img[leaf_mask]
    put(img, 5, 7, np.clip(np.array(fruit) * 1.4 + 40, 0, 255))
    put(img, 6, 6, np.clip(np.array(fruit) * 1.25 + 30, 0, 255))
    return outline(img, 0.42)


def textures(seed, colors, conifer, fruit):
    bark, wood, leaf = colors['kora'], colors['drewno'], colors['liscie']
    heart = tuple(np.array(wood) * 0.86)
    board = tuple(np.array(wood) * 0.92)
    out = {}
    if conifer:
        side = plates_bark(seed, bark, count=12, gap=3.0, stretch=1.8, crack=0.55, variation=0.12)
    else:
        side = furrow_bark(seed, bark, ridges=4, depth=1.0, cross=0.3)
    out['pien_bok'] = opaque(side)
    out['pien_gora'] = opaque(rings(seed + 1, wood, heart, bark=side))
    out['okorowany_bok'] = opaque(grain(seed + 2, wood))
    out['okorowany_gora'] = opaque(rings(seed + 3, wood, heart))
    out['deski'] = opaque(planks(seed + 4, board))
    if conifer:
        rgb, alpha = needles(seed + 5, leaf, 60, (3, 4), holes=0.12)
    else:
        rgb, alpha = leaf_cells(seed + 5, leaf, 30, 2.4, holes=0.12)
    out['liscie'] = leaves_tile(rgb, alpha)
    if conifer:
        out['sadzonka'] = conifer_sapling(leaf)
    else:
        out['sadzonka'] = sapling_broadleaf(seed + 6, (110, 82, 60), leaf,
                                            [(8.0, 3.5, -0.9), (3.6, 6.5, -2.4), (11.8, 5.5, -0.6), (5.0, 10.0, 2.6)])
    autumn = [tuple(mix(leaf, c, 0.85)) for c in [(206, 128, 52), (184, 102, 40), (222, 170, 74), (150, 96, 46)]]
    out['opadle_liscie'] = litter(seed + 7, autumn, 11)
    if fruit:
        out['liscie_owoce'] = fruit_on_leaves(out['liscie'], colors['owoc'], seed + 8)
        out['owoc'] = fruit_item(colors['owoc'], leaf)
    return out


# ------------------------------------------------------------
# Szablony kształtu
# ------------------------------------------------------------

HEADER = """# Kształt drzewa: {name} ({size})
#
# Warstwy od DOŁU do GÓRY - każda warstwa to widok z góry na jedną
# wysokość drzewa, warstwy oddziela pusta linia. Linie z # na początku
# to komentarze (gra je pomija).
#
#   @  podstawa pnia - tylko w pierwszej warstwie, tu stała sadzonka
#   P  pień (i gałęzie)
#   L  liście
#   l  liście, ale nie zawsze (70%) - postrzępiony brzeg korony
{fruit_line}#   .  puste
#
# Najwyżej 7 kratek od @ w każdą stronę i 29 warstw. Drzewo w grze jest
# losowo obracane i odbijane. Podgląd: node tools/drzewa.mjs pokaz {id}
"""


def template(trunk, radius, crown, fruit_char, seed, cone=False):
    """Szablon: pień i korona - zaokrąglona (elipsoida) albo stożek
    (iglaste: od dołu szeroka, do góry coraz węższa)."""
    reach = int(np.ceil(radius))
    cy = trunk + crown / 2 - 0.5
    ry = crown / 2
    top = trunk + crown - 1
    layers = []
    for y in range(top + 1):
        rows = []
        for z in range(-reach, reach + 1):
            row = ''
            for x in range(-reach, reach + 1):
                h = (x * 73856093 ^ y * 19349663 ^ z * 83492791 ^ seed) & 0xffff
                if cone:
                    level = (y - trunk + 1) / crown
                    r = max(0.6, radius * (1 - level) + 0.4)
                    d = 2 if level < 0 or y > top else (x * x + z * z) / (r * r)
                else:
                    d = (x / radius) ** 2 + ((y - cy) / ry) ** 2 + (z / radius) ** 2
                if x == 0 and z == 0 and y == 0:
                    c = '@'
                elif x == 0 and z == 0 and (y <= cy or (cone and y < top)):
                    c = 'P'
                elif d <= 1 and y >= trunk - 1:
                    edge = d > 0.55
                    if edge and fruit_char and h % 6 == 0:
                        c = fruit_char
                    elif edge and h % 3 == 0:
                        c = 'l'
                    else:
                        c = 'L'
                else:
                    c = '.'
                row += c
            rows.append(row)
        layers.append(rows)
    return layers


def write_template(path, name, size, folder, layers, fruit):
    fruit_line = '#   O  liście z owocami (odmiana z "znak": "O" w drzewo.json)\n' if fruit else ''
    text = HEADER.format(name=name, size=size, fruit_line=fruit_line, id=folder)
    for i, rows in enumerate(layers):
        text += f'\n# warstwa {i + 1}\n' + '\n'.join(rows) + '\n'
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


# ------------------------------------------------------------
# Numery bloków i lista
# ------------------------------------------------------------

def read_json(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def free_id():
    used = []
    if os.path.isdir(DIR):
        for name in os.listdir(DIR):
            data = read_json(os.path.join(DIR, name, 'drzewo.json'))
            if isinstance(data, dict) and isinstance(data.get('pierwszeId'), int):
                used.append(data['pierwszeId'])
    first = FIRST_ID
    while first <= LAST_ID - SLOTS + 1 and any(abs(first - other) < SLOTS for other in used):
        first += SLOTS
    if first > LAST_ID - SLOTS + 1:
        sys.exit(f'Brak wolnych numerów bloków ({FIRST_ID}-{LAST_ID}) - usuń albo wyłącz któreś drzewo.')
    return first


def add_to_list(folder):
    data = read_json(LIST)
    names = data if isinstance(data, list) else []
    if folder not in names:
        names.append(folder)
    with open(LIST, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(names, indent=4, ensure_ascii=False) + '\n')


# ------------------------------------------------------------

def dumps(value, indent=0):
    """JSON jak w przykładach z instrukcji: krótkie listy w jednej linii."""
    pad = '    '
    flat = json.dumps(value, ensure_ascii=False)
    if isinstance(value, dict):
        if not value:
            return '{}'
        simple = all(not isinstance(v, dict) and not (isinstance(v, list) and any(isinstance(w, (dict, list)) for w in v))
                     for v in value.values())
        inline = '{ ' + ', '.join(f'{json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}' for k, v in value.items()) + ' }'
        if simple and len(inline) + indent * 4 <= 110:
            return inline
        items = [f'{pad * (indent + 1)}{json.dumps(k, ensure_ascii=False)}: {dumps(v, indent + 1)}' for k, v in value.items()]
        return '{\n' + ',\n'.join(items) + '\n' + pad * indent + '}'
    if isinstance(value, list):
        simple = all(not isinstance(v, (dict, list)) or (isinstance(v, list) and all(not isinstance(w, (dict, list)) for w in v))
                     for v in value)
        if simple and len(flat) <= 80:
            return flat
        return '[\n' + ',\n'.join(pad * (indent + 1) + dumps(v, indent + 1) for v in value) + '\n' + pad * indent + ']'
    return flat


def ask(question, default=None):
    if not sys.stdin.isatty():
        return default
    answer = input(question).strip()
    return answer or default


def main():
    parser = argparse.ArgumentParser(description='Nowa paczka drzewa w assets/drzewa/ (opis: docs/drzewa-paczki.md)')
    parser.add_argument('folder', help='nazwa folderu: małe litery bez polskich znaków, np. grusza')
    parser.add_argument('--nazwa', help='polska nazwa drzewa, np. grusza')
    parser.add_argument('--dopelniacz', help='nazwa w dopełniaczu ("pień czego?"), np. gruszy')
    parser.add_argument('--owoc', help='owoc, np. gruszka (bez - drzewo bez owoców)')
    parser.add_argument('--iglaste', action='store_true', help='drzewo iglaste (igły, stożek)')
    parser.add_argument('--kolor-lisci', type=color)
    parser.add_argument('--kolor-kory', type=color, default=(104, 88, 74))
    parser.add_argument('--kolor-drewna', type=color, default=(216, 186, 138))
    parser.add_argument('--kolor-owocu', type=color, default=(200, 46, 40))
    parser.add_argument('--nadpisz', action='store_true', help='zastąp istniejący folder')
    a = parser.parse_args()

    folder = a.folder
    if not re.fullmatch(r'[a-z][a-z0-9]{1,23}', folder):
        sys.exit('Nazwa folderu: same małe litery (bez polskich) i cyfry, bez spacji i _, np. grusza.')
    if folder in RESERVED:
        sys.exit(f'Nazwa "{folder}" jest zajęta przez gatunek albo blok gry - wybierz inną.')
    path = os.path.join(DIR, folder)
    if os.path.exists(os.path.join(path, 'drzewo.json')) and not a.nadpisz:
        sys.exit(f'Drzewo {folder} już jest (assets/drzewa/{folder}) - inna nazwa albo --nadpisz.')

    name = a.nazwa or ask(f'Polska nazwa drzewa (Enter = {folder}): ', folder)
    genitive = a.dopelniacz or ask(f'Pień czego? - nazwa w dopełniaczu, np. "gruszy" (Enter = {name}): ', name)
    fruit = a.owoc if a.owoc is not None else ask('Owoc, np. "gruszka" (Enter = bez owoców): ', None)
    conifer = a.iglaste

    fruit_key = slug(fruit) if fruit else None
    if fruit and (not fruit_key or not re.fullmatch(r'[a-z][a-z0-9]*', fruit_key)):
        fruit_key = 'owoc'

    leaf_color = a.kolor_lisci or ((50, 92, 56) if conifer else (86, 146, 52))
    colors = {'kora': a.kolor_kory, 'drewno': a.kolor_drewna, 'liscie': leaf_color, 'owoc': a.kolor_owocu}

    os.makedirs(path, exist_ok=True)

    seed = seed_of(folder)
    tiles = textures(seed, colors, conifer, bool(fruit))
    for key, img in tiles.items():
        as_image(img).save(os.path.join(path, f'{key}.png'))

    if conifer:
        small = template(2, 2.2, 6, None, seed, cone=True)
        big = template(3, 3.4, 10, None, seed + 1, cone=True)
    else:
        small = template(3, 2.2, 4, 'O' if fruit else None, seed)
        big = template(4, 3.2, 5, 'O' if fruit else None, seed + 1)
    write_template(os.path.join(path, 'ksztalt_maly.txt'), name, 'małe drzewo', folder, small, bool(fruit))
    write_template(os.path.join(path, 'ksztalt_duzy.txt'), name, 'duże drzewo', folder, big, bool(fruit))

    existing = read_json(os.path.join(path, 'drzewo.json')) if a.nadpisz else None
    first_id = existing['pierwszeId'] if isinstance(existing, dict) and isinstance(existing.get('pierwszeId'), int) else free_id()

    data = {
        'pierwszeId': first_id,
        'gatunek': name[0].upper() + name[1:],
        'gatunekDopelniacz': genitive,
        'krotko': name.lower(),
        'nazwaAngielska': folder[0].upper() + folder[1:],
        'podobnyDo': 'swierk' if conifer else 'lipa',
        'bloki': {
            'pien': {'nazwa': f'Pień {genitive}', 'bok': 'pien_bok.png', 'gora': 'pien_gora.png'},
            'okorowany': {'nazwa': f'Okorowany pień {genitive}', 'bok': 'okorowany_bok.png', 'gora': 'okorowany_gora.png'},
            'deski': {'nazwa': f'Deski z {genitive}', 'tekstura': 'deski.png'},
            'liscie': {'nazwa': f'{"Igliwie" if conifer else "Liście"} {genitive}', 'tekstura': 'liscie.png'},
            'sadzonka': {'nazwa': f'Sadzonka {genitive}', 'tekstura': 'sadzonka.png'},
            'opadleLiscie': {'nazwa': f'Opadłe {"igły" if conifer else "liście"} {genitive}', 'tekstura': 'opadle_liscie.png'}
        }
    }
    if fruit:
        data['odmianyLisci'] = [{
            'id': 'owoce',
            'nazwa': f'Liście {genitive} z owocami',
            'tekstura': 'liscie_owoce.png',
            'znak': 'O',
            'udzial': 0.08,
            'zbior': {'przedmiot': fruit_key, 'ile': [1, 2]},
            'odrasta': 600
        }]
        data['przedmioty'] = {
            fruit_key: {'nazwa': fruit[0].upper() + fruit[1:], 'tekstura': 'owoc.png', 'sadzi': True}
        }
        data['lupy'] = [['sadzonka', 0.05], [fruit_key, 0.04]]
    else:
        data['lupy'] = [['sadzonka', 0.06]]
    data['czasWzrostu'] = 300
    data['ksztalt'] = {'rodzaj': 'szablon', 'pliki': ['ksztalt_maly.txt', 'ksztalt_duzy.txt'], 'opadleLiscie': 0.15}
    data['gdzieRosnie'] = {
        'czestosc': 0.05,
        'temperatura': [-1.0, 0.0] if conifer else [-0.3, 1.0],
        'wilgotnosc': [-0.6, 1.0],
        'wysokosc': [0, 60] if conifer else [0, 30]
    }
    data['przepisy'] = []

    with open(os.path.join(path, 'drzewo.json'), 'w', encoding='utf-8', newline='\n') as f:
        f.write(dumps(data) + '\n')

    add_to_list(folder)

    print(f'Gotowe: assets/drzewa/{folder}/ - {data["gatunek"]}, bloki {first_id}-{first_id + SLOTS - 1}, '
          f'{len(tiles)} tekstur zastępczych, 2 szablony kształtu.')
    print('Dalej:')
    print(f'  1. podmień tekstury (pliki .png 16 x 16 w assets/drzewa/{folder}/) i popraw nazwy w drzewo.json,')
    print(f'  2. popraw kształt w ksztalt_maly.txt i ksztalt_duzy.txt (podgląd: node tools/drzewa.mjs pokaz {folder}),')
    print('  3. sprawdź: node tools/drzewa.mjs, w grze: /drzewa posadz ' + folder + ' (opis: docs/drzewa-paczki.md).')


if __name__ == '__main__':
    main()
