"""Tekstura skrzyni (0.81.0): obszar "chest" (32 x 32) w arkuszu drzewa.png.

Deski w stylu atlasu Kamila (cztery pasy 4 px, przesunięte łączenia,
paleta dębowych desek - obszar "oak_planks" arkuszy tekstur), ciemniejsza
rama na rogach i krawędziach, zamek z żelaza. Układ (piksele):

  (0,0)-(16,10)   boki skrzyni (na zewnątrz),
  (16,0)-(32,16)  środek: ścianki, dno, spód wieka (ciemniejsze deski),
  (0,16)-(16,32)  wieko z góry,
  (16,16)-(32,20) boki wieka,
  (16,20)-(20,24) zamek.

Uruchomienie: python3 tools/skrzynia_tekstura.py
"""
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import read_texture, write_texture  # noqa: E402

planks = read_texture('oak_planks')


def shade(color, k):
    r, g, b, a = color
    return (max(0, min(255, round(r * k))), max(0, min(255, round(g * k))), max(0, min(255, round(b * k))), 255)


def plank(x, y, k=1.0):
    return shade(planks.getpixel((x % 16, y % 16)), k)


FRAME = shade((165, 122, 74, 255), 0.62)
FRAME_DARK = shade((165, 122, 74, 255), 0.5)
FRAME_LIGHT = shade((165, 122, 74, 255), 0.78)
IRON = [(214, 214, 206, 255), (168, 168, 162, 255), (120, 120, 118, 255), (78, 78, 80, 255)]

image = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
put = image.putpixel

# Boki: deski, rama na rogach i u dołu, jasna listwa u góry.
for y in range(10):
    for x in range(16):
        color = plank(x, y + 2)
        if x in (0, 15) or y == 9:
            color = FRAME if (x + y) % 3 else FRAME_DARK
        elif y == 0:
            color = FRAME_LIGHT
        put((x, y), color)

# Środek: ciemniejsze deski.
for y in range(16):
    for x in range(16):
        put((16 + x, y), plank(x + 5, y, 0.74))

# Wieko z góry: deski wzdłuż, rama dookoła.
for y in range(16):
    for x in range(16):
        color = plank(x, y)
        if x in (0, 15) or y in (0, 15):
            color = FRAME if (x + y) % 3 else FRAME_DARK
        put((x, 16 + y), color)

# Boki wieka: deski, jasna krawędź u góry, ciemna u dołu, rogi.
for y in range(4):
    for x in range(16):
        color = plank(x + 3, y + 8)
        if x in (0, 15) or y == 3:
            color = FRAME_DARK if y == 3 else FRAME
        elif y == 0:
            color = FRAME_LIGHT
        put((16 + x, 16 + y), color)

# Zamek: żelazo z jasną krawędzią i otworem.
latch = ['0001', '0112', '1232', '1223']
for y, row in enumerate(latch):
    for x, c in enumerate(row):
        put((16 + x, 20 + y), IRON[int(c)])
put((17, 22), IRON[3])

write_texture('chest', image)
print('chest -> drzewa.png')
