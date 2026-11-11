"""Miłorząb i jakaranda: import paczek Kamila do wspólnego arkusza.

python tools/tekstury_drzew_085.py --archives FOLDER_Z_ZIP
python tools/tekstury_drzew_085.py             # odtwórz tylko pochodne

Pięć oryginalnych PNG każdego gatunku zachowuje wszystkie piksele RGBA.
Nie tworzymy katalogów PNG drzew: jedynym źródłem gry jest drzewa.png.
Stare prostokąty atlasu zostają na miejscu; brak bezpiecznego pola dokłada
wiersz GPU, zamiast wypełniać ochronny margines dawnych desek i opału.
"""
from argparse import ArgumentParser
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json

import numpy as np
from PIL import Image

from atlasy import ROOT, MANIFEST, manifest, read_texture, write_texture, sync, check
from tekstury_drzew import as_image, opaque, grain, rings, sapling_broadleaf
from tekstury_nowych_drzew import campfire_sheet
from modele_roslin import SHEETS, sheet as model_sheet

SPECIES = {
    'ginkgo': {'seed': 1080, 'model': 'milorzab', 'foliage': (240, 208, 48),
               'scientificReference': 'Ginkgo biloba',
               'botanicalSource': 'https://trees.umn.edu/nursery-tour/species/gi'},
    'jacaranda': {'seed': 1090, 'model': 'jakaranda', 'foliage': (128, 72, 184),
                  'scientificReference': 'Jacaranda mimosifolia',
                  'botanicalSource': 'https://ask.ifas.ufl.edu/publication/ST317'},
}
ORIGINALS = ('log_side.png', 'log_top.png', 'planks.png', 'leaves.png', 'leaves_variant.png')
ROW = ('log_side.png', 'log_top.png', 'stripped_side.png', 'stripped_top.png',
       'planks.png', 'leaves.png', 'sapling.png', 'leaves_variant.png')


def source_data(folder):
    """Validate both complete archives before changing any atlas file."""
    result = {}
    for species, spec in SPECIES.items():
        path = folder / f'{species}.zip'
        with ZipFile(path) as archive:
            images, records = {}, {}
            for name in (*ORIGINALS, 'render_info.json', 'preview.png'):
                raw = archive.read(f'{species}/{name}')
                record = {'sha256': sha256(raw).hexdigest(), 'bytes': len(raw)}
                if name in ORIGINALS:
                    image = Image.open(BytesIO(raw)).convert('RGBA')
                    if image.size != (16, 16):
                        raise ValueError(f'{species}/{name}: expected 16 x 16 pixels')
                    images[name] = image
                    record.update(rgbaSha256=sha256(image.tobytes()).hexdigest(), width=16, height=16)
                records[name] = record
            render_raw = archive.read(f'{species}/render_info.json')
        render = json.loads(render_raw)
        result[species] = {'images': images, 'renderRaw': render_raw, 'metadata': {
            'sourceArchive': path.name, 'sourceArchiveSha256': sha256(path.read_bytes()).hexdigest(),
            'suppliedBy': 'Kamil', 'importDate': '2026-11-11',
            'note': 'Original PNG RGBA pixels are copied into drzewa.png without resampling or recolouring. '
                    'The archive contains a reference preview and dimensions, but no geometry. '
                    'Procedural trees use approximately one metre per block.',
            'scientificReference': spec['scientificReference'], 'botanicalSource': spec['botanicalSource'],
            'referenceDimensionsMetres': {name: render[name] for name in ('height', 'crown')},
            'originalFiles': {name: records[name] for name in (*ORIGINALS, 'render_info.json')},
            'referencePreview': {'archivePath': f'{species}/preview.png', **records['preview.png']},
            'generator': 'tools/tekstury_drzew_085.py; tools/modele_roslin.py',
        }}
    return result


def add_regions():
    data = manifest()
    tree_sheet = data['sheets']['drzewa']
    additions = {}
    bottom = tree_sheet['height']
    occupied = set()
    for name, tile in data['tiles'].items():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                occupied.add((tile['x'] + dx, tile['y'] + dy))
        # Slanted Canvas icons can sample outside a tile at its very edge.
        # Keep padding around ALL earlier planks and firewood, including 0.83.
        if name.split('/')[0] in SPECIES or name.removeprefix('campfire_') in SPECIES:
            continue
        if name.endswith(('planks', 'planks.png', 'deski.png')) or name.startswith('campfire_'):
            for y in range(tile['y'] - 1, tile['y'] + tile.get('h', 1) + 1):
                for x in range(tile['x'] - 1, tile['x'] + tile.get('w', 1) + 1):
                    occupied.add((x, y))

    def allocate(key, width=1, height=1):
        if key in data['tiles']:
            return
        while True:
            for y in range(data['rows'] - height + 1):
                for x in range(data['columns'] - width + 1):
                    cells = {(x + dx, y + dy) for dx in range(width) for dy in range(height)}
                    if cells & occupied:
                        continue
                    occupied.update(cells)
                    tile = {'x': x, 'y': y, 'region': key}
                    if width > 1 or height > 1:
                        tile.update(w=width, h=height, pw=width * 16, ph=height * 16)
                    data['tiles'][key] = tile
                    return
            data['rows'] += 1

    # Reserve 2x2 regions before single tiles, preventing fragmentation.
    for species in SPECIES:
        allocate(f'campfire_{species}', 2, 2)
    for species, spec in SPECIES.items():
        first = data['regions'].get(f'{species}/log_side.png')
        top = first['y'] if first else bottom
        if not first:
            bottom += 32
        for column, name in enumerate(ROW):
            key = f'{species}/{name}'
            additions[key] = {'sheet': 'drzewa', 'x': column * 16, 'y': top, 'width': 16, 'height': 16}
            allocate(key)
        model = f'models/rosliny/sadzonka-{spec["model"]}/polrealistyczny'
        additions[model] = {'sheet': 'drzewa', 'x': 0, 'y': top + 16, 'width': 16, 'height': 16}
        data['aliases'].setdefault(f'assets/{model}.png', model)
        allocate(model)
        additions[f'campfire_{species}'] = {'sheet': 'drzewa', 'x': 128, 'y': top, 'width': 32, 'height': 32}
    for key, value in additions.items():
        if key in data['regions'] and data['regions'][key] != value:
            raise ValueError(f'Refusing to move an existing texture region: {key}')
        data['regions'][key] = value
    if bottom > tree_sheet['height']:
        path = ROOT / 'assets/textures' / tree_sheet['file']
        image = Image.new('RGBA', (tree_sheet['width'], bottom))
        with Image.open(path) as old:
            image.paste(old.convert('RGBA'), (0, 0))
        image.save(path, optimize=True)
        tree_sheet['height'] = bottom
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def derived_images(species):
    spec = SPECIES[species]
    bark = read_texture(f'{species}/log_side.png')
    top = read_texture(f'{species}/log_top.png')
    wood = tuple(np.median(np.asarray(top)[3:13, 3:13, :3], axis=(0, 1)).astype(int))
    stem = tuple(np.median(np.asarray(bark)[..., :3], axis=(0, 1)).astype(int))
    seed = spec['seed']
    model = f'sadzonka-{spec["model"]}'
    rows, palette = SHEETS[model]
    leaves = ([(7.5, 3.0, -1.2), (3.8, 6.5, -2.4), (11.0, 5.5, -.5), (5.5, 10.0, 2.5)]
              if species == 'ginkgo' else
              [(4.5, 4.5, -2.2), (10.7, 3.8, -.7), (3.2, 8.0, -2.6), (12.0, 7.5, -.3)])
    return {
        f'{species}/stripped_side.png': as_image(opaque(grain(seed, wood, streaks=5, contrast=.65))),
        f'{species}/stripped_top.png': as_image(opaque(rings(seed + 1, wood, tuple(int(v * .78) for v in wood)))),
        f'{species}/sapling.png': as_image(sapling_broadleaf(seed + 2, stem, spec['foliage'], leaves,
                                                          round_=species == 'ginkgo')),
        f'campfire_{species}': campfire_sheet(bark, top, seed),
        f'models/rosliny/{model}/polrealistyczny': model_sheet(rows, palette),
    }


def main():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--archives', type=Path)
    args = parser.parse_args()
    sources = source_data(args.archives) if args.archives else None
    if sources:
        add_regions()
        for species, source in sources.items():
            for name, image in source['images'].items():
                write_texture(f'{species}/{name}', image)
    for species in SPECIES:
        original = {name: read_texture(f'{species}/{name}').tobytes() for name in ORIGINALS}
        derived = derived_images(species)
        for key, image in derived.items():
            write_texture(key, image)
        for name, pixels in original.items():
            assert read_texture(f'{species}/{name}').tobytes() == pixels, f'{species}/{name}'
        if sources:
            source = sources[species]
            data = source['metadata']
            data['derivedRegions'] = {key: {'rgbaSha256': sha256(image.tobytes()).hexdigest(),
                'width': image.width, 'height': image.height} for key, image in derived.items()}
            folder = ROOT / 'docs/zrodla/drzewa-0.85' / species
            folder.mkdir(parents=True, exist_ok=True)
            (folder / 'render_info.json').write_bytes(source['renderRaw'])
            (folder / 'source.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'{species}: original pixels intact; stripped wood, sapling, plane model and firewood ready')
    check()
    sync()


if __name__ == '__main__':
    main()
