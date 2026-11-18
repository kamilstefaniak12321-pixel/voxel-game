"""Jeżyk (1.18.0): model i tekstury z plików Kamila.

Wzorce: tools/wzorce/jezyk/jezyk.bbmodel (sześć siatek: korpus, pyszczek,
cztery łapki) i jezyk.png (tekstura 16 x 16).

Narzędzie:
- zapisuje src/rendering/HedgehogModelData.js - części modelu (wierzchołki
  w blokach, UV w kafelku, punkty obrotu kości z pliku),
- wkleja teksturę i jej warianty kolorystyczne do arkusza efekty.png
  (kafelki mob_hedgehog_<wariant>):
    brown   - rysunek Kamila bez zmian,
    dark    - ciemny (prawie czarne kolce, szary pyszczek),
    sandy   - jasny, piaskowy,
    albino  - kremowobiały z czerwonymi oczami (rzadki).
  Warianty to ten sam rysunek: każdy piksel dostaje kolor z rampy wariantu
  według swojej jasności; oczy i nos zostają ciemne.

Uruchomienie: python3 tools/jezyk_model.py
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, check, sync  # noqa: E402

SOURCE = Path(__file__).resolve().parent / 'wzorce' / 'jezyk'
OUTPUT = ROOT / 'src' / 'rendering' / 'HedgehogModelData.js'

# Nazwa części w grze <- (siatka w pliku, kość).
PARTS = {
    'body': ('Korpus', 'body'),
    'nose': ('Pyszczek', 'nose'),
    'legFrontRight': ('leg_front_right', 'leg_front_right'),
    'legBackRight': ('leg_back_right', 'leg_back_right'),
    'legBackLeft': ('leg_back_left', 'leg_back_left'),
    'legFrontLeft': ('leg_front_left', 'leg_front_left'),
}

# Rampy wariantów: kolor najciemniejszego i najjaśniejszego piksela futra
# oraz kolor oczu / nosa (None - jak w rysunku).
VARIANTS = {
    'brown': None,
    'dark': {'low': (26, 20, 18), 'high': (158, 140, 122), 'eye': None},
    'sandy': {'low': (128, 96, 58), 'high': (240, 218, 172), 'eye': None},
    'albino': {'low': (188, 176, 160), 'high': (252, 248, 240), 'eye': (150, 44, 52)},
}

# Piksel ciemniejszy niż to (najjaśniejszy kanał) to oko albo nos.
EYE_LEVEL = 60

FIRST_COLUMN, LAST_COLUMN, ROWS = 17, 63, (94, 95)
SHEET_X, SHEET_Y = 192, 336


def luminance(pixel):
    return 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2]


def recolor(image, ramp):
    if ramp is None:
        return image.copy()
    fur = [luminance(p) for p in image.get_flattened_data() if p[3] == 255 and max(p[:3]) >= EYE_LEVEL]
    low, high = min(fur), max(fur)
    out = image.copy()
    for y in range(image.height):
        for x in range(image.width):
            pixel = image.getpixel((x, y))
            if pixel[3] == 0:
                continue
            if max(pixel[:3]) < EYE_LEVEL:
                if ramp['eye']:
                    out.putpixel((x, y), (*ramp['eye'], pixel[3]))
                continue
            t = (luminance(pixel) - low) / (high - low)
            out.putpixel((x, y), (*(round(ramp['low'][k] + (ramp['high'][k] - ramp['low'][k]) * t) for k in range(3)), pixel[3]))
    return out


def model_parts():
    with open(SOURCE / 'jezyk.bbmodel', encoding='utf-8') as file:
        model = json.load(file)
    size = model['resolution']['width']
    bones = {group['name']: group['origin'] for group in model['groups']}
    parts = {}
    for name, (mesh_name, bone) in PARTS.items():
        mesh = next(element for element in model['elements'] if element['name'] == mesh_name)
        origin = mesh['origin']
        points = {key: [value[k] + origin[k] for k in range(3)] for key, value in mesh['vertices'].items()}
        center = [sum(point[k] for point in points.values()) / len(points) for k in range(3)]
        positions, uvs, indices = [], [], []
        for face in mesh['faces'].values():
            keys = face['vertices']
            if len(keys) != 4:
                raise ValueError(f'{mesh_name}: ściana nie jest czworokątem')
            # Kolejność rogów po obwodzie (plik trzyma je w kolejności "Z").
            corners = [points[key] for key in keys]
            middle = [sum(c[k] for c in corners) / 4 for k in range(3)]
            a, b = [corners[0][k] - middle[k] for k in range(3)], None
            normal = None
            for other in corners[1:]:
                v = [other[k] - middle[k] for k in range(3)]
                cross = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]]
                if sum(c * c for c in cross) > 1e-9:
                    normal = cross
                    break
            outward = [middle[k] - center[k] for k in range(3)]
            if sum(normal[k] * outward[k] for k in range(3)) < 0:
                normal = [-n for n in normal]
            import math
            axis_u = a
            axis_v = [normal[1] * axis_u[2] - normal[2] * axis_u[1], normal[2] * axis_u[0] - normal[0] * axis_u[2],
                      normal[0] * axis_u[1] - normal[1] * axis_u[0]]
            order = sorted(range(4), key=lambda i: math.atan2(
                sum((corners[i][k] - middle[k]) * axis_v[k] for k in range(3)),
                sum((corners[i][k] - middle[k]) * axis_u[k] for k in range(3))))
            base = len(positions) // 3
            for i in order:
                # Blockbench: przód modelu to -z; w grze jeż patrzy w +z.
                positions += [round(-corners[i][0] / 16, 5), round(corners[i][1] / 16, 5), round(-corners[i][2] / 16, 5)]
                u, v = face['uv'][keys[i]]
                uvs += [round(u / size, 5), round(v / size, 5)]
            indices += [base, base + 1, base + 2, base, base + 2, base + 3]
        pivot = bones[bone]
        parts[name] = {'pivot': [round(-pivot[0] / 16, 5), round(pivot[1] / 16, 5), round(-pivot[2] / 16, 5)],
                       'positions': positions, 'uvs': uvs, 'indices': indices}
    return parts


def write_model():
    parts = model_parts()
    lines = ['// Wygenerowane przez tools/jezyk_model.py z tools/wzorce/jezyk/jezyk.bbmodel - nie edytować ręcznie.',
             '// Części modelu jeżyka: wierzchołki w blokach (jeż patrzy w +z, stoi na y = 0),',
             '// UV w kafelku 0-1 (v od góry), pivot - punkt obrotu kości.',
             f'export const HEDGEHOG_VARIANTS = {json.dumps(list(VARIANTS))};',
             'export const HEDGEHOG_PARTS = {']
    for name, part in parts.items():
        lines.append(f'    {name}: {json.dumps(part, separators=(",", ":"))},')
    lines.append('};')
    OUTPUT.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return parts


def write_textures():
    with Image.open(SOURCE / 'jezyk.png') as file:
        texture = file.convert('RGBA')
    if texture.size != (16, 16):
        raise ValueError('Tekstura jeżyka musi mieć 16 x 16')
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    sheet = data['sheets']['efekty']
    path = ROOT / 'assets/textures' / sheet['file']
    with Image.open(path) as file:
        page = file.convert('RGBA')
    taken = set()
    for tile in data['tiles'].values():
        for dy in range(tile.get('h', 1)):
            for dx in range(tile.get('w', 1)):
                taken.add((tile['x'] + dx, tile['y'] + dy))
    cells = [(x, y) for y in ROWS for x in range(FIRST_COLUMN, LAST_COLUMN + 1) if (x, y) not in taken]
    for index, (variant, ramp) in enumerate(VARIANTS.items()):
        key = f'mob_hedgehog_{variant}'
        if key not in data['regions']:
            data['regions'][key] = {'sheet': 'efekty', 'x': SHEET_X + index * 16, 'y': SHEET_Y, 'width': 16, 'height': 16}
            x, y = cells.pop(0)
            data['tiles'][key] = {'x': x, 'y': y, 'region': key}
        region = data['regions'][key]
        page.paste(recolor(texture, ramp), (region['x'], region['y']))
    page.save(path, optimize=True)
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    check()
    sync()


def main():
    parts = write_model()
    write_textures()
    print(f'Jeżyk: {len(parts)} części, {len(VARIANTS)} warianty -> HedgehogModelData.js, efekty.png')


if __name__ == '__main__':
    main()
