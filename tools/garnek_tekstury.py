"""Ikonki gotowania (1.20.0): garnek, miska i potrawy.

Rysowane tutaj, piksel po pikselu (16 x 16), w kolorach zwykłej gliny
z tools/tekstury_gliny.py:
  - wet_clay_pot, clay_pot, clay_pot_water - garnek mokry, suchy, z wodą,
  - wet_clay_bowl, clay_bowl               - miska mokra i sucha,
  - dish_<potrawa>                         - miska z potrawą (kolor potrawy
                                             jak w items/cookingData.js),
  - dried_fruit                            - suszone owoce (1.21.0).

Kafelki trafiają do arkusza rosliny.png w wolne miejsca atlasu (te same
co rośliny niskie - tools/niskie_tekstury.py).

Uruchomienie: python3 tools/garnek_tekstury.py [podglad.png]
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from niskie_tekstury import install  # noqa: E402

# Glina: cień, środek, światło (jak sucha glina w tekstury_gliny.py).
DARK, MID, LIGHT = (104, 60, 44), (150, 88, 62), (214, 150, 110)
INSIDE = (58, 34, 28)
WATER = ((52, 96, 150), (86, 138, 190), (160, 200, 230))

# Potrawy: (cień, kolor, światło, dodatek) - kolor jak DISHES[...].color.
DISHES = {
    'vegetable_stew': ((140, 84, 30), (185, 116, 44), (226, 160, 78), (122, 150, 62)),
    'pumpkin_soup': ((176, 100, 20), (224, 138, 30), (246, 184, 84), (250, 226, 170)),
    'zucchini_stew': ((98, 118, 50), (143, 162, 74), (188, 204, 120), (226, 214, 150)),
    'nut_soup': ((126, 100, 62), (169, 138, 92), (206, 180, 134), (110, 74, 44)),
    'compote': ((116, 30, 52), (168, 50, 74), (212, 96, 112), (90, 20, 60)),
    'mixed_stew': ((112, 86, 52), (154, 122, 78), (192, 162, 116), (204, 92, 52))
}


def shade(x, left, right):
    """Glina: światło z lewej, cień z prawej."""
    span = max(1, right - left)
    t = (x - left) / span
    return LIGHT if t < 0.22 else MID if t < 0.7 else DARK


def pot(content=None):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    put = lambda x, y, c: image.putpixel((x, y), (*c, 255))
    # Brzuch garnka: wiersz -> (lewy, prawy).
    body = {5: (4, 11), 6: (3, 12), 7: (2, 13), 8: (2, 13), 9: (2, 13), 10: (2, 13), 11: (2, 13), 12: (3, 12), 13: (4, 11), 14: (5, 10)}
    for y, (left, right) in body.items():
        for x in range(left, right + 1):
            put(x, y, shade(x, left, right))
    # Uszy.
    for x, c in ((1, LIGHT), (14, DARK)):
        put(x, 7, c)
        put(x, 8, c)
    # Wylew: obręcz i wnętrze.
    for x in range(3, 13):
        put(x, 3, LIGHT if x < 6 else MID)
        put(x, 4, MID if x < 10 else DARK)
    for x in range(4, 12):
        put(x, 3, INSIDE if content is None else content[1])
    if content is not None:
        put(5, 3, content[2])
        put(6, 3, content[2])
        put(10, 3, content[0])
    # Cień pod dnem.
    for x in range(6, 10):
        put(x, 15, (40, 28, 24))
        image.putpixel((x, 15), (40, 28, 24, 110))
    return image


def bowl(content=None):
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    put = lambda x, y, c: image.putpixel((x, y), (*c, 255))
    body = {8: (1, 14), 9: (2, 13), 10: (2, 13), 11: (3, 12), 12: (4, 11), 13: (5, 10)}
    for y, (left, right) in body.items():
        for x in range(left, right + 1):
            put(x, y, shade(x, left, right))
    # Wnętrze (elipsa nad obręczą).
    inside = {6: (4, 11), 7: (2, 13)}
    for y, (left, right) in inside.items():
        for x in range(left, right + 1):
            put(x, y, INSIDE if content is None else content[1])
    for x in (2, 3):
        put(x, 7, MID)
    put(13, 7, DARK)
    put(12, 7, DARK)
    if content is not None:
        dark, _, light, extra = content
        for x in (5, 6):
            put(x, 6, light)
        put(10, 7, dark)
        put(9, 6, dark)
        # Dodatek: dwa kawałki na wierzchu.
        put(7, 7, extra)
        put(8, 6, extra)
        # Para.
        image.putpixel((6, 3), (235, 235, 235, 120))
        image.putpixel((7, 2), (235, 235, 235, 90))
        image.putpixel((10, 4), (235, 235, 235, 120))
        image.putpixel((10, 3), (235, 235, 235, 80))
    for x in range(6, 10):
        image.putpixel((x, 14), (40, 28, 24, 110))
    return image


def wet(image):
    """Mokra glina: ciemniejsza, z dwoma błyskami."""
    out = image.copy()
    for y in range(16):
        for x in range(16):
            r, g, b, a = image.getpixel((x, y))
            if a == 255:
                out.putpixel((x, y), (round(r * 0.72), round(g * 0.68), round(b * 0.7), a))
    for x, y in ((4, 8), (5, 7)):
        if out.getpixel((x, y))[3] == 255:
            out.putpixel((x, y), (236, 214, 196, 255))
    return out


def dried_fruit():
    """Suszone owoce (1.21.0): garść pomarszczonych kawałków - ciemna
    czerwień, fiolet i brąz."""
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    pieces = [
        # (x, y, szerokość, wysokość, cień, kolor, światło)
        (2, 8, 5, 4, (74, 22, 30), (128, 40, 48), (176, 78, 76)),
        (8, 9, 5, 4, (60, 28, 62), (104, 52, 104), (150, 92, 142)),
        (5, 4, 5, 4, (96, 50, 22), (150, 86, 40), (198, 136, 78)),
        (10, 5, 4, 3, (84, 26, 26), (146, 50, 40), (192, 96, 74))
    ]
    for x0, y0, w, h, dark, mid, light in pieces:
        for y in range(h):
            for x in range(w):
                # Ścięte rogi.
                if (x in (0, w - 1)) and (y in (0, h - 1)):
                    continue
                color = light if (x <= 1 and y <= 1) else dark if (y == h - 1 or x == w - 1) else mid
                image.putpixel((x0 + x, y0 + y), (*color, 255))
        # Zmarszczka.
        image.putpixel((x0 + w // 2, y0 + h // 2), (*dark, 255))
    return image


def compost():
    """Kompost (1.23.0): ciemna grudka z resztkami - brąz, czerń i parę
    jasnych okruchów."""
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    rows = {6: (6, 9), 7: (4, 11), 8: (3, 12), 9: (2, 13), 10: (2, 13), 11: (2, 13), 12: (3, 12), 13: (5, 10)}
    dark, mid, light = (38, 26, 18), (66, 46, 30), (98, 72, 46)
    for y, (left, right) in rows.items():
        for x in range(left, right + 1):
            t = (x - left) / max(1, right - left)
            color = light if (t < 0.25 and y < 10) else dark if (t > 0.7 or y > 11) else mid
            image.putpixel((x, y), (*color, 255))
    # Resztki: okruch skorupki, pestka, zgniły liść.
    for (x, y), color in {(5, 8): (176, 160, 130), (9, 7): (120, 60, 44), (10, 10): (70, 84, 40), (6, 11): (150, 120, 70), (11, 9): (30, 20, 14), (7, 9): (30, 20, 14)}.items():
        image.putpixel((x, y), (*color, 255))
    for x in range(5, 11):
        image.putpixel((x, 14), (40, 28, 24, 110))
    return image


def textures():
    out = {
        'clay_pot': pot(),
        'clay_pot_water': pot(WATER),
        'wet_clay_pot': wet(pot()),
        'clay_bowl': bowl(),
        'wet_clay_bowl': wet(bowl())
    }
    out['dried_fruit'] = dried_fruit()
    out['compost'] = compost()
    for name, colors in DISHES.items():
        out[f'dish_{name}'] = bowl(colors)
    return out


def main():
    images = textures()
    install(images)
    if len(sys.argv) > 1:
        sheet = Image.new('RGBA', (len(images) * 68 + 4, 72), (120, 150, 120, 255))
        for index, image in enumerate(images.values()):
            sheet.alpha_composite(image.resize((64, 64), Image.NEAREST), (4 + index * 68, 4))
        sheet.save(sys.argv[1])
    print(f'{len(images)} ikonek gotowania -> rosliny.png')


if __name__ == '__main__':
    main()
