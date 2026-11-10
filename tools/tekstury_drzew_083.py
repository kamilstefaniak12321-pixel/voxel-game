"""Tekstury pięciu gatunków z 0.83.0 (paczki Kamila): klon jesienny,
kosodrzewina, oliwka, eukaliptus tęczowy i sekwoja olbrzymia.

Oryginalne log_side / log_top / planks / leaves / leaves_variant zostają
piksel w piksel (paczki nie mają reszty). Ten skrypt dokłada brakujące:
okorowany pień (bok i słoje), sadzonkę, drewno do ogniska (32 x 32, ten
sam układ co w 0.79.0), miejsce na liście sadzonki 3D (rysuje je
tools/modele_roslin.py), a do tego oliwki, szyszki sekwoi i kosodrzewiny
oraz opadłe liście klonu.

    python tools/tekstury_drzew_083.py [folder z rozpakowanymi paczkami]

Z folderem: najpierw dopisuje regiony do assets/textures/atlas.json
(arkusz drzewa.png rośnie w dół o 5 x 32 px, kafelki gry trafiają w wolne
miejsca atlasu - liczba wierszy atlasu się nie zmienia) i kopiuje
oryginały. Bez folderu: tylko odtwarza tekstury pochodne z tego, co już
jest w arkuszu. Potem: python tools/atlasy.py sync
"""
from pathlib import Path
import json
import sys

import numpy as np
from PIL import Image

from atlasy import ROOT, MANIFEST, read_texture, write_texture
from tekstury_drzew import (as_image, opaque, grain, rings, sapling_broadleaf, conifer_sapling, litter,
                            scales_pattern, ellipse, shade_shape, shades, outline, put, empty, line_cells)
from tekstury_nowych_drzew import campfire_sheet

# gatunek: folder paczki, seed, kolor sadzonki, igły?, dodatki
SPECIES = {
    'maple': {'pack': 'maple_autumn', 'seed': 1030, 'file': 'klon', 'foliage': (214, 84, 34), 'conifer': False},
    'mugo': {'pack': 'mugo', 'seed': 1040, 'file': 'kosodrzewina', 'foliage': (40, 92, 52), 'conifer': True},
    'olive': {'pack': 'olive', 'seed': 1050, 'file': 'oliwka', 'foliage': (124, 138, 96), 'conifer': False},
    'rainbow_eucalyptus': {'pack': 'rainbow_eucalyptus', 'seed': 1060, 'file': 'eukaliptus', 'foliage': (58, 128, 72), 'conifer': False},
    'sequoia': {'pack': 'sequoia', 'seed': 1070, 'file': 'sekwoja', 'foliage': (96, 136, 70), 'conifer': True},
}
ORIGINALS = ['log_side.png', 'log_top.png', 'planks.png', 'leaves.png', 'leaves_variant.png']
ROW = ['log_side.png', 'log_top.png', 'stripped_side.png', 'stripped_top.png', 'planks.png', 'leaves.png',
       'sapling.png', 'leaves_variant.png']
EXTRAS = {'maple': ['leaf_litter.png'], 'mugo': ['cone.png'], 'olive': ['olives.png'],
          'rainbow_eucalyptus': [], 'sequoia': ['cone.png']}
SHEET_TOP = 320


def has_variant(species):
    return species != 'rainbow_eucalyptus'


def names(species):
    row = [name for name in ROW if name != 'leaves_variant.png' or has_variant(species)]
    return row + EXTRAS[species]


def free_cells(tiles, rows):
    taken = set()
    for tile in tiles.values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                taken.add((tile['x'] + dx, tile['y'] + dy))
    # Obok desek i drewna ognisk dawnych gatunków nic nowego: ikony
    # bloków w ekwipunku rysowane skośnie łapią brzeg sąsiedniego
    # kafelka (tools/sprawdz_atlasy_webgl.mjs pilnuje ich pikseli).
    near = set()
    for name, tile in tiles.items():
        if name.split('/')[0] in SPECIES or name.removeprefix('campfire_') in SPECIES:
            continue
        if not (name.endswith('planks') or name.endswith('planks.png') or name.endswith('deski.png') or name.startswith('campfire_')):
            continue
        for y in range(tile['y'] - 1, tile['y'] + tile.get('h', 1) + 1):
            for x in range(tile['x'] - 1, tile['x'] + tile.get('w', 1) + 1):
                near.add((x, y))
    return taken | near, [(x, y) for y in range(rows) for x in range(16) if (x, y) not in taken and (x, y) not in near]


def add_regions():
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sheet = data['sheets']['drzewa']
    height = SHEET_TOP + 32 * len(SPECIES)
    if sheet['height'] < height:
        path = ROOT / 'assets/textures' / sheet['file']
        old = Image.open(path).convert('RGBA')
        grown = Image.new('RGBA', (sheet['width'], height))
        grown.paste(old, (0, 0))
        grown.save(path, optimize=True)
        sheet['height'] = height
    taken, free = free_cells(data['tiles'], data['rows'])
    for index, species in enumerate(SPECIES):
        top = SHEET_TOP + index * 32
        for name in names(species):
            key = f'{species}/{name}'
            column = ROW.index(name) if name in ROW else EXTRAS[species].index(name)
            y = top if name in ROW else top + 16
            data['regions'].setdefault(key, {'sheet': 'drzewa', 'x': column * 16, 'y': y, 'width': 16, 'height': 16})
            if key not in data['tiles']:
                x, ty = free.pop(0)
                taken.add((x, ty))
                data['tiles'][key] = {'x': x, 'y': ty, 'region': key}
        # Liście półrealistycznej sadzonki 3D (tools/modele_roslin.py).
        model = f'models/rosliny/sadzonka-{SPECIES[species]["file"]}/polrealistyczny'
        data['regions'].setdefault(model, {'sheet': 'drzewa', 'x': 32, 'y': top + 16, 'width': 16, 'height': 16})
        data['aliases'].setdefault(f'assets/{model}.png', model)
        if model not in data['tiles']:
            x, ty = free.pop(0)
            taken.add((x, ty))
            data['tiles'][model] = {'x': x, 'y': ty, 'region': model}
        fire = f'campfire_{species}'
        data['regions'].setdefault(fire, {'sheet': 'drzewa', 'x': 128, 'y': top, 'width': 32, 'height': 32})
        if fire not in data['tiles']:
            # Ognisko zajmuje 2 x 2 kafelki (jak campfire_cherry).
            spot = next((x, y) for y in range(data['rows'] - 1) for x in range(0, 15, 2)
                        if not {(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)} & taken)
            for dx in (0, 1):
                for dy in (0, 1):
                    taken.add((spot[0] + dx, spot[1] + dy))
            free = [cell for cell in free if cell not in taken]
            data['tiles'][fire] = {'x': spot[0], 'y': spot[1], 'w': 2, 'h': 2, 'pw': 32, 'ph': 32, 'region': fire}
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def olives_item():
    """Garść oliwek: trzy owale (dwie ciemne, jedna zielona) na gałązce z listkiem."""
    img = empty()
    for x, y in line_cells(3, 3, 12, 5):
        put(img, x, y, (104, 84, 56))
    for cx, cy, color in [(5.5, 9.0, (58, 40, 62)), (10.0, 10.5, (74, 52, 78)), (8.0, 6.8, (128, 140, 58))]:
        mask = ellipse(cx, cy, 2.3, 3.0, 0.25)
        body = shade_shape(mask, shades(color, 6, 0.6, 1.35, (1.0, 0.95, 1.0)), strength=1.5)
        img[mask] = body[mask]
        put(img, int(cx) - 1, int(cy) - 2, np.clip(np.array(color) * 1.6 + 50, 0, 255))
    leaf = ellipse(12.2, 3.0, 2.8, 1.0, -0.35)
    green = shade_shape(leaf, shades((122, 138, 92), 5, 0.65, 1.25), strength=1.0)
    img[leaf] = green[leaf]
    return outline(img, 0.42)


def sequoia_cone():
    # Mała, jajowata szyszka (sekwoja ma szyszki wielkości jajka).
    mask = ellipse(8.0, 9.0, 3.4, 4.4)
    img = scales_pattern(mask, (136, 84, 52), 8.0, 9.0, 1.4, 1.2, 1077)
    for y in (2, 3, 4):
        put(img, 8, y, (92, 66, 44))
    return outline(img, 0.42)


def mugo_cone():
    # Krótka, skośnie osadzona szyszka kosodrzewiny z igłami.
    mask = ellipse(8.4, 9.4, 3.0, 4.2, 0.35)
    img = scales_pattern(mask, (118, 90, 60), 8.4, 9.4, 1.5, 1.3, 1047)
    for x, y in [(4, 3), (5, 4), (6, 5), (11, 3), (10, 4), (9, 5), (7, 2), (7, 3), (7, 4)]:
        put(img, x, y, (46, 98, 56))
    return outline(img, 0.42)


def maple_litter():
    return litter(1031, [(206, 72, 30), (232, 118, 34), (178, 46, 30), (238, 160, 52)], 7)


def main():
    if len(sys.argv) > 1:
        folder = Path(sys.argv[1])
        add_regions()
        for species, settings in SPECIES.items():
            pack = next(folder.glob(f'**/{settings["pack"]}/log_side.png')).parent
            for name in ORIGINALS:
                if (pack / name).exists():
                    write_texture(f'{species}/{name}', Image.open(pack / name).convert('RGBA'))
    for species, settings in SPECIES.items():
        prefix = f'{species}/'
        original = {name: read_texture(prefix + name).tobytes() for name in ORIGINALS
                    if name != 'leaves_variant.png' or has_variant(species)}
        bark = read_texture(prefix + 'log_side.png')
        top = read_texture(prefix + 'log_top.png')
        wood = tuple(np.median(np.asarray(top)[3:13, 3:13, :3], axis=(0, 1)).astype(int))
        stem = tuple(np.median(np.asarray(bark)[..., :3], axis=(0, 1)).astype(int))
        seed = settings['seed']
        write_texture(prefix + 'stripped_side.png', as_image(opaque(grain(seed, wood, streaks=5, contrast=.65))))
        write_texture(prefix + 'stripped_top.png', as_image(opaque(rings(seed + 1, wood, tuple(int(v * .78) for v in wood)))))
        if settings['conifer']:
            sapling = conifer_sapling(settings['foliage'])
        else:
            sapling = sapling_broadleaf(seed + 2, stem, settings['foliage'],
                [(7.5, 3.5, -1.2), (3.6, 6.5, -2.4), (11.8, 5.5, -.5), (5.0, 10.0, 2.5)],
                lobed=species == 'maple', round_=species == 'olive')
        write_texture(prefix + 'sapling.png', as_image(sapling))
        write_texture(f'campfire_{species}', campfire_sheet(bark, top, seed))
        if species == 'maple':
            write_texture(prefix + 'leaf_litter.png', as_image(maple_litter()))
        elif species == 'olive':
            write_texture(prefix + 'olives.png', as_image(olives_item()))
        elif species == 'sequoia':
            write_texture(prefix + 'cone.png', as_image(sequoia_cone()))
        elif species == 'mugo':
            write_texture(prefix + 'cone.png', as_image(mugo_cone()))
        for name, pixels in original.items():
            assert read_texture(prefix + name).tobytes() == pixels, name
        print(f'{species}: oryginały nietknięte; okorowany pień, sadzonka, ognisko i dodatki gotowe')


if __name__ == '__main__':
    main()
