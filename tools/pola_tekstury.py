"""Tekstury pól z żyznej i kamienistej ziemi (1.25.0).

  - tilled_humus  - rozgrzebany czarnoziem: bruzdy pola w kolorach
                    czarnoziemu,
  - tilled_coarse - rozgrzebana ziemia kamienista: bruzdy w jej kolorach
                    i kamyki w kolorach kamyków ziemi kamienistej (od 1.29.0
                    wyraźne, 2 x 2 i małe).

Bruzdy bierze z tekstury tilled_dirt (teren.png), kolory - z humus
i coarse_dirt. Kafelki trafiają do rosliny.png w wolne miejsca atlasu
(tools/niskie_tekstury.py - install).

Uruchomienie: python3 tools/pola_tekstury.py
"""
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent


def tile(data, name):
    region = data['regions'][name]
    with Image.open(ROOT / 'assets/textures' / data['sheets'][region['sheet']]['file']) as sheet:
        return sheet.convert('RGBA').crop((region['x'], region['y'], region['x'] + 16, region['y'] + 16))


def mean(image):
    pixels = [image.getpixel((x, y))[:3] for y in range(16) for x in range(16)]
    return tuple(sum(p[i] for p in pixels) / len(pixels) for i in range(3))


def light(color):
    return 0.3 * color[0] + 0.59 * color[1] + 0.11 * color[2]


def recolor(furrows, soil):
    """Bruzdy (jasność z pola) w barwie podanej ziemi."""
    base, tone = mean(furrows), mean(soil)
    out = Image.new('RGBA', (16, 16))
    for y in range(16):
        for x in range(16):
            ratio = light(furrows.getpixel((x, y))) / light(base)
            out.putpixel((x, y), (*[max(0, min(255, int(c * ratio))) for c in tone], 255))
    return out


def textures():
    data = json.loads((ROOT / 'assets/textures/atlas.json').read_text(encoding='utf-8'))
    furrows, humus, coarse = tile(data, 'tilled_dirt'), tile(data, 'humus'), tile(data, 'coarse_dirt')
    tilled_humus = recolor(furrows, humus)
    tilled_coarse = recolor(furrows, coarse)
    # Kamyki (1.29.0 - wyraźniejsze): w kolorach szarych kamyków ziemi
    # kamienistej, rozsiane po polu; większe 2 x 2 (jasny lewy górny róg,
    # ciemny prawy dolny) i małe (jasny piksel, pod nim cień).
    greys = sorted({coarse.getpixel((x, y))[:3] for y in range(16) for x in range(16)
                    if max(coarse.getpixel((x, y))[:3]) - min(coarse.getpixel((x, y))[:3]) < 60}, key=light)
    bright = tuple(min(255, int(c * 1.12)) for c in greys[-1])
    middle = greys[len(greys) // 2]
    shadow = tuple(int(c * 0.62) for c in greys[0])
    for x, y in PEBBLES_BIG:
        for (dx, dy), color in zip(((0, 0), (1, 0), (0, 1), (1, 1)), (bright, middle, middle, shadow)):
            tilled_coarse.putpixel((x + dx, y + dy), (*color, 255))
    for x, y in PEBBLES_SMALL:
        tilled_coarse.putpixel((x, y), (*bright, 255))
        tilled_coarse.putpixel((x, y + 1), (*shadow, 255))
    return {'tilled_humus': tilled_humus, 'tilled_coarse': tilled_coarse}


# Miejsca kamyków na polu kamienistym (lewy górny róg).
PEBBLES_BIG = [(2, 1), (11, 4), (6, 8), (13, 11), (3, 13)]
PEBBLES_SMALL = [(8, 2), (14, 1), (1, 6), (9, 12), (12, 7)]


if __name__ == '__main__':
    images = textures()
    install(images)
    print(f'{len(images)} tekstury pól -> rosliny.png')
