"""Trzynaście drzew z paczki Kamila "drzewa_od_jodly" (1.8.0).

python tools/tekstury_drzew_180.py --source FOLDER/drzewa_od_jodly
python tools/tekstury_drzew_180.py             # odtwórz tylko pochodne

Oryginalne PNG 16 x 16 każdego gatunku (bok i góra pnia, deski, liście,
odmiana liści oraz dodatki: korzenie, kora przy ziemi, martwe drewno)
trafiają do drzewa.png piksel w piksel. Z nich powstają pochodne:
okorowany pień, sadzonka, model sadzonki, polana do ogniska i zwój kory.

Kafelki atlasu GPU leżą w wierszach 56-63 (kolumny 16-63); arkusze kory
tych drzew - poniżej (tools/tekstury_kory.py).
"""
from argparse import ArgumentParser
from hashlib import sha256
from pathlib import Path
import json
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, manifest, read_texture, write_texture, sync, check  # noqa: E402
from tekstury_drzew import as_image, opaque, grain, rings, sapling_broadleaf, conifer_sapling, empty, put, line_cells  # noqa: E402
from tekstury_nowych_drzew import campfire_sheet  # noqa: E402
from tekstury_noza_i_kory import bark as bark_scroll  # noqa: E402
from modele_roslin import SHEETS, sheet as model_sheet  # noqa: E402

# gatunek: folder paczki, numer (seed), model sadzonki, rodzaj sadzonki,
# dodatkowe tekstury z paczki, nazwa botaniczna.
SPECIES = {
    'fir': {'folder': '01_fir', 'seed': 1100, 'model': 'jodla', 'sapling': 'conifer',
            'scientific': 'Abies alba'},
    'baobab': {'folder': '02_baobab', 'seed': 1110, 'model': 'baobab', 'sapling': 'broad',
               'scientific': 'Adansonia digitata'},
    'coconut_palm': {'folder': '03_coconut_palm', 'seed': 1120, 'model': 'palma', 'sapling': 'rosette',
                     'scientific': 'Cocos nucifera'},
    'larch': {'folder': '04_larch', 'seed': 1130, 'model': 'modrzew', 'sapling': 'conifer',
              'scientific': 'Larix decidua'},
    'mangrove': {'folder': '05_mangrove', 'seed': 1140, 'model': 'namorzyn', 'sapling': 'broad',
                 'extras': ['roots.png'], 'scientific': 'Rhizophora mangle'},
    'kapok': {'folder': '06_kapok', 'seed': 1150, 'model': 'puchowiec', 'sapling': 'broad',
              'scientific': 'Ceiba pentandra'},
    'joshua_tree': {'folder': '07_joshua_tree', 'seed': 1160, 'model': 'jukka', 'sapling': 'rosette',
                    'extras': ['log_side_shaggy.png'], 'scientific': 'Yucca brevifolia'},
    'aspen': {'folder': '08_aspen', 'seed': 1170, 'model': 'osika', 'sapling': 'round',
              'extras': ['log_side_base.png'], 'scientific': 'Populus tremula'},
    'araucaria': {'folder': '09_araucaria', 'seed': 1180, 'model': 'araukaria', 'sapling': 'conifer',
                  'scientific': 'Araucaria araucana'},
    'banyan': {'folder': '10_banyan', 'seed': 1190, 'model': 'banian', 'sapling': 'broad',
               'extras': ['roots.png'], 'scientific': 'Ficus benghalensis'},
    'dragon_tree': {'folder': '11_dragon_blood_tree', 'seed': 1200, 'model': 'dracena', 'sapling': 'rosette',
                    'scientific': 'Dracaena cinnabari'},
    'cedar': {'folder': '12_cedar_of_lebanon', 'seed': 1210, 'model': 'cedr', 'sapling': 'conifer',
              'scientific': 'Cedrus libani'},
    'bristlecone': {'folder': '13_bristlecone_pine', 'seed': 1220, 'model': 'oscista', 'sapling': 'conifer',
                    'extras': ['log_side_dead.png'], 'scientific': 'Pinus longaeva'},
}
ORIGINALS = ('log_side.png', 'log_top.png', 'planks.png', 'leaves.png', 'leaves_variant.png')
ROW = ('log_side.png', 'log_top.png', 'stripped_side.png', 'stripped_top.png',
       'planks.png', 'leaves.png', 'sapling.png', 'leaves_variant.png')
# Przedmioty rysowane tutaj (nie ma ich w paczce).
ITEMS = {'coconut_palm': ['coconut.png']}
# Kafelki tych drzew: wiersze 56-63 w kolumnach 16-63 (nad nimi arkusze
# kory 1.7.x, w kolumnach 0-15 warianty traw i dawne tekstury).
TILE_ROWS, TILE_COLUMNS = range(56, 64), range(16, 64)
BAND = 32


def originals(species):
    return (*ORIGINALS, *SPECIES[species].get('extras', ()))


def source_data(folder):
    """Sprawdza całą paczkę, zanim cokolwiek zmieni się w atlasie."""
    result = {}
    for species, spec in SPECIES.items():
        images, records = {}, {}
        for name in originals(species):
            raw = (folder / spec['folder'] / 'textures' / name).read_bytes()
            image = Image.open(folder / spec['folder'] / 'textures' / name).convert('RGBA')
            if image.size != (16, 16):
                raise ValueError(f'{species}/{name}: oczekiwano 16 x 16 pikseli')
            images[name] = image
            records[name] = {'sha256': sha256(raw).hexdigest(), 'bytes': len(raw),
                             'rgbaSha256': sha256(image.tobytes()).hexdigest(), 'width': 16, 'height': 16}
        result[species] = {'images': images, 'metadata': {
            'sourceArchive': 'DOC-20261115-WA0023.zip (drzewa_od_jodly)', 'sourceFolder': spec['folder'],
            'suppliedBy': 'Kamil', 'importDate': '2026-11-15',
            'note': 'Oryginalne piksele RGBA skopiowane do drzewa.png bez skalowania i zmian kolorów. '
                    'Paczka zawiera podglądy sylwetek, bez geometrii; drzewa w grze powstają proceduralnie '
                    'w skali 1 blok = 1 metr.',
            'scientificReference': spec['scientific'],
            'originalFiles': records,
            'generator': 'tools/tekstury_drzew_180.py; tools/modele_roslin.py; tools/tekstury_kory.py',
        }}
    return result


def add_regions():
    data = manifest()
    tree_sheet = data['sheets']['drzewa']
    occupied = set()
    for tile in data['tiles'].values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                occupied.add((tile['x'] + dx, tile['y'] + dy))

    def allocate(key, width=1, height=1):
        if key in data['tiles']:
            return
        for y in TILE_ROWS:
            for x in TILE_COLUMNS:
                cells = {(x + dx, y + dy) for dx in range(width) for dy in range(height)}
                if cells & occupied or x + width - 1 not in TILE_COLUMNS or y + height - 1 not in TILE_ROWS:
                    continue
                occupied.update(cells)
                tile = {'x': x, 'y': y, 'region': key}
                if width > 1 or height > 1:
                    tile.update(w=width, h=height, pw=width * 16, ph=height * 16)
                data['tiles'][key] = tile
                return
        raise ValueError('Brak miejsca na kafelki nowych drzew (wiersze 56-63)')

    additions = {}
    bottom = tree_sheet['height']
    # Polana 2 x 2 najpierw - pojedyncze kafelki nie poszatkują miejsca.
    for species in SPECIES:
        allocate(f'campfire_{species}', 2, 2)
    for species, spec in SPECIES.items():
        first = data['regions'].get(f'{species}/log_side.png')
        top = first['y'] if first else bottom
        if not first:
            bottom += BAND
        for column, name in enumerate(ROW):
            key = f'{species}/{name}'
            additions[key] = {'sheet': 'drzewa', 'x': column * 16, 'y': top, 'width': 16, 'height': 16}
            allocate(key)
        additions[f'campfire_{species}'] = {'sheet': 'drzewa', 'x': 128, 'y': top, 'width': 32, 'height': 32}
        model = f'models/rosliny/sadzonka-{spec["model"]}/polrealistyczny'
        additions[model] = {'sheet': 'drzewa', 'x': 0, 'y': top + 16, 'width': 16, 'height': 16}
        data['aliases'].setdefault(f'assets/{model}.png', model)
        allocate(model)
        additions[f'{species}_bark'] = {'sheet': 'drzewa', 'x': 16, 'y': top + 16, 'width': 16, 'height': 16}
        allocate(f'{species}_bark')
        for index, name in enumerate((*spec.get('extras', ()), *ITEMS.get(species, ()))):
            key = f'{species}/{name}'
            additions[key] = {'sheet': 'drzewa', 'x': 32 + index * 16, 'y': top + 16, 'width': 16, 'height': 16}
            allocate(key)
    for key, value in additions.items():
        if key in data['regions'] and data['regions'][key] != value:
            raise ValueError(f'Nie przesuwam istniejącego regionu: {key}')
        data['regions'][key] = value
    data['rows'] = max(data['rows'], max(tile['y'] + tile.get('h', 1) for tile in data['tiles'].values()))
    if bottom > tree_sheet['height']:
        path = ROOT / 'assets/textures' / tree_sheet['file']
        image = Image.new('RGBA', (tree_sheet['width'], bottom))
        with Image.open(path) as old:
            image.paste(old.convert('RGBA'), (0, 0))
        image.save(path, optimize=True)
        tree_sheet['height'] = bottom
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def foliage_color(leaves):
    pixels = np.asarray(leaves)
    solid = pixels[pixels[..., 3] > 0][:, :3]
    return tuple(int(v) for v in np.median(solid, axis=0))


def rosette_sapling(stem, green):
    """Młoda palma, jukka albo dracena: krótki pieniek i pióropusz liści."""
    img = empty()
    for y in range(11, 16):
        put(img, 7, y, stem)
        put(img, 8, y, np.array(stem) * 0.82)
    light = np.clip(np.array(green) * 1.25, 0, 255)
    dark = np.array(green) * 0.72
    for index, (x1, y1) in enumerate([(1, 6), (3, 2), (7, 0), (8, 0), (12, 2), (14, 6), (2, 10), (13, 10)]):
        cells = list(line_cells(7 if x1 < 8 else 8, 10, x1, y1))
        for step, (x, y) in enumerate(cells):
            put(img, x, y, light if step >= len(cells) - 2 else dark if index % 3 == 0 else green)
    return img


def coconut_item():
    rows = [
        '................',
        '................',
        '.....kkkkkk.....',
        '...kkbBBBBbkk...',
        '..kbBBLLBBBBbk..',
        '..kBBLLBBBBBBk..',
        '.kbBBLBBBBBBBbk.',
        '.kBBBBBkBBkBBBk.',
        '.kBBBBBkBBkBBbk.',
        '.kbBBBBBBBBBBbk.',
        '.kbBBBBBkBBBbdk.',
        '..kbBBBBBBBbdk..',
        '..kdbbBBBbbddk..',
        '...kkddbbddkk...',
        '.....kkkkkk.....',
        '................',
    ]
    colors = {'k': (58, 38, 24), 'd': (88, 58, 36), 'b': (116, 78, 46), 'B': (142, 98, 58), 'L': (176, 132, 84)}
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                image.putpixel((x, y), (*colors[key], 255))
    return image


def derived_images(species):
    spec = SPECIES[species]
    bark = read_texture(f'{species}/log_side.png')
    top = read_texture(f'{species}/log_top.png')
    wood = tuple(np.median(np.asarray(top)[3:13, 3:13, :3], axis=(0, 1)).astype(int))
    stem = tuple(np.median(np.asarray(bark)[..., :3], axis=(0, 1)).astype(int))
    green = foliage_color(read_texture(f'{species}/leaves.png'))
    seed = spec['seed']
    model = f'sadzonka-{spec["model"]}'
    rows, palette = SHEETS[model]
    if spec['sapling'] == 'conifer':
        sapling = conifer_sapling(green)
    elif spec['sapling'] == 'rosette':
        sapling = rosette_sapling(stem, green)
    else:
        sapling = sapling_broadleaf(seed + 2, stem, green,
                                    [(7.5, 3.0, -1.2), (3.8, 6.5, -2.4), (11.0, 5.5, -.5), (5.5, 10.0, 2.5)],
                                    round_=spec['sapling'] == 'round')
    images = {
        f'{species}/stripped_side.png': as_image(opaque(grain(seed, wood, streaks=5, contrast=.65))),
        f'{species}/stripped_top.png': as_image(opaque(rings(seed + 1, wood, tuple(int(v * .78) for v in wood)))),
        f'{species}/sapling.png': as_image(sapling),
        f'campfire_{species}': campfire_sheet(bark, top, seed),
        f'models/rosliny/{model}/polrealistyczny': model_sheet(rows, palette),
        f'{species}_bark': bark_scroll(bark),
    }
    if species == 'coconut_palm':
        images['coconut_palm/coconut.png'] = coconut_item()
    return images


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    sources = source_data(args.source) if args.source else None
    if sources:
        add_regions()
        for species, source in sources.items():
            for name, image in source['images'].items():
                write_texture(f'{species}/{name}', image)
    for species in SPECIES:
        original = {name: read_texture(f'{species}/{name}').tobytes() for name in originals(species)}
        derived = derived_images(species)
        for key, image in derived.items():
            write_texture(key, image)
        for name, pixels in original.items():
            assert read_texture(f'{species}/{name}').tobytes() == pixels, f'{species}/{name}'
        if sources:
            data = sources[species]['metadata']
            data['derivedRegions'] = {key: {'rgbaSha256': sha256(image.tobytes()).hexdigest(),
                'width': image.width, 'height': image.height} for key, image in derived.items()}
            folder = ROOT / 'docs/zrodla/drzewa-1.8' / species
            folder.mkdir(parents=True, exist_ok=True)
            (folder / 'source.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{species}: oryginały nietknięte; okorowany pień, sadzonka, model, polana i kora gotowe')
    check()
    sync()


if __name__ == '__main__':
    main()
