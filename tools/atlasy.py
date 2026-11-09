"""Read and edit the authoritative themed PNG sheets without loose copies.

python tools/atlasy.py list [group]
python tools/atlasy.py export TEXTURE output.png
python tools/atlasy.py replace TEXTURE input.png
python tools/atlasy.py check
python tools/atlasy.py sync
"""
from pathlib import Path
import argparse
import json
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / 'assets/textures/atlas.json'


def manifest():
    return json.loads(MANIFEST.read_text(encoding='utf-8'))


def normalize(key):
    text = str(key).replace('\\', '/')
    start = text.find('/assets/')
    return text[start + 1:] if start >= 0 else text


def region(key, data=None):
    data = data or manifest()
    key = normalize(key)
    seen = set()
    while key in data['aliases'] and data['aliases'][key] != key:
        if key in seen:
            raise ValueError(f'Cyclic texture alias: {key}')
        seen.add(key)
        key = data['aliases'][key]
    if key not in data['regions']:
        raise KeyError(f'Unknown texture: {key}')
    return data['regions'][key]


def read_texture(key):
    if normalize(key) == 'assets/textures/blocks/terrain.png':
        # Compatibility for older art generators: only the authored base
        # rows, never the appended runtime tiles belonging to other sheets.
        return world_atlas(base_only=True)
    data = manifest()
    r = region(key, data)
    with Image.open(ROOT / 'assets/textures' / data['sheets'][r['sheet']]['file']) as image:
        return image.convert('RGBA').crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']))


def world_atlas(base_only=False):
    data = manifest()
    result = Image.new('RGBA', (data['columns'] * 16, 256 if base_only else data['rows'] * 16))
    sheets = {}
    for name, tile in data['tiles'].items():
        if base_only and tile['y'] >= 11:
            continue
        r = region(tile['region'], data)
        if r['sheet'] not in sheets:
            sheets[r['sheet']] = Image.open(ROOT / 'assets/textures' / data['sheets'][r['sheet']]['file']).convert('RGBA')
        image = sheets[r['sheet']].crop((r['x'], r['y'], r['x'] + r['width'], r['y'] + r['height']))
        result.paste(image, (tile['x'] * 16, tile['y'] * 16))
    return result


def write_texture(key, image):
    data = manifest()
    image = image.convert('RGBA')
    if normalize(key) == 'assets/textures/blocks/terrain.png':
        if image.size != (256, 256):
            raise ValueError('Legacy working atlas must be 256 × 256')
        sheets = {}
        for name, tile in data['tiles'].items():
            if tile['y'] >= 11:
                continue
            r = region(tile['region'], data)
            if r['sheet'] not in sheets:
                sheets[r['sheet']] = Image.open(ROOT / 'assets/textures' / data['sheets'][r['sheet']]['file']).convert('RGBA')
            x, y = tile['x'] * 16, tile['y'] * 16
            sheets[r['sheet']].paste(image.crop((x, y, x + 16, y + 16)), (r['x'], r['y']))
        for sheet, output in sheets.items():
            output.save(ROOT / 'assets/textures' / data['sheets'][sheet]['file'], optimize=True)
        return
    r = region(key, data)
    if image.size != (r['width'], r['height']):
        raise ValueError(f'{key}: expected {r["width"]} × {r["height"]}, got {image.size}')
    path = ROOT / 'assets/textures' / data['sheets'][r['sheet']]['file']
    sheet = Image.open(path).convert('RGBA')
    sheet.paste(image, (r['x'], r['y']))
    sheet.save(path, optimize=True)


def sync():
    data = manifest()
    text = '// Generated from assets/textures/atlas.json by tools/atlasy.py. Edit the manifest, then run sync.\n'
    for export, field in [('TEXTURE_SHEETS', 'sheets'), ('TEXTURE_REGIONS', 'regions'),
                          ('TEXTURE_ALIASES', 'aliases'), ('WORLD_ATLAS_TILES', 'tiles')]:
        text += f'export const {export} = ' + json.dumps(data[field], ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'src/rendering/TextureSheetData.js').write_text(text, encoding='utf-8')


def check():
    data = manifest()
    for name, spec in data['sheets'].items():
        path = ROOT / 'assets/textures' / spec['file']
        if path.parent != ROOT / 'assets/textures':
            raise ValueError(f'Invalid sheet path: {spec["file"]}')
        with Image.open(path) as image:
            if image.size != (spec['width'], spec['height']) or image.mode != 'RGBA':
                raise ValueError(f'Invalid sheet dimensions or mode: {name}')
    for name in [*data['regions'], *data['aliases']]:
        r = region(name, data)
        sheet = data['sheets'][r['sheet']]
        if not (r['width'] > 0 and r['height'] > 0 and r['x'] >= 0 and r['y'] >= 0 and
                r['x'] + r['width'] <= sheet['width'] and r['y'] + r['height'] <= sheet['height']):
            raise ValueError(f'Region outside sheet: {name}')
    print(f'OK: {len(data["sheets"])} sheets, {len(data["tiles"])} world textures')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('action', choices=['list', 'export', 'replace', 'check', 'sync'])
    parser.add_argument('key', nargs='?')
    parser.add_argument('path', nargs='?')
    args = parser.parse_args()
    if args.action == 'check':
        check()
    elif args.action == 'sync':
        check(); sync()
    elif args.action == 'list':
        for key, r in manifest()['regions'].items():
            if args.key is None or r['sheet'] == args.key:
                print(f'{key}: {r["sheet"]}.png [{r["x"]}, {r["y"]}, {r["width"]}, {r["height"]}]')
    elif not args.key or not args.path:
        parser.error('Texture name and PNG path are required')
    elif args.action == 'export':
        read_texture(args.key).save(args.path)
    elif args.action == 'replace':
        with Image.open(args.path) as image:
            write_texture(args.key, image)
        check()
