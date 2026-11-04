"""Tekstury motywu „Szare drewno”, rysowane bezpośrednio na siatce pikseli.

Uruchomienie z dowolnego katalogu: python tools/szare_drewno.py
Wymagania jak w ekwipunek_drewno.py: numpy, Pillow.

planks.png: 160 x 90, okresowe tło z trzema szerokimi deskami.
board.png: 48 x 12, spokojna deseczka pod napisy i przyciski.
frame.png: 64 x 64, 9-slice 8, przezroczysty środek, bez outset.
Rozmiary odpowiadają całkowitemu powiększeniu x3 (x2 dla ramy menu
i małego ekranu). Źródłem jest kod, a nie przeskalowany obraz koncepcyjny.
Stałe ziarno zapewnia identyczne PNG przy ponownym uruchomieniu.
"""

from pathlib import Path

import numpy as np
from PIL import Image

from ekwipunek_drewno import canvas, grain_line, hex_rgb, put


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'ui' / 'themes' / 'grey-wood'
SEED = 5900
SLICE = 8

# Małe różnice jasności utrzymują słoje w tle, za ikonami i tekstem.
WOOD = [hex_rgb(c) for c in (
    '#66625d', '#716c66', '#7b766f', '#827d77',
    '#8d8780', '#999289', '#a39c92', '#aaa399',
)]
GAP = hex_rgb('#484641')
NAIL_DARK = hex_rgb('#3c3d3a')
NAIL_MID = hex_rgb('#62645f')
NAIL_LIGHT = hex_rgb('#92958c')


def grain(width, height, rng, base=4.0):
    """Spokojne, poziome słoje, okresowe w poziomie."""
    tones = np.empty((height, width), dtype=float)
    common = grain_line(rng, width, 0.25)
    for y in range(height):
        tones[y] = base + common + grain_line(rng, width, 0.35)
    return tones


def paint(tones):
    indexes = np.clip(np.rint(tones), 0, len(WOOD) - 1).astype(int)
    img = canvas(tones.shape[1], tones.shape[0])
    img[..., :3] = np.asarray(WOOD)[indexes]
    img[..., 3] = 255
    return img


def knot(tones, cx, cy):
    """Mały sęk z krótkimi, poziomymi słojami wokół."""
    height, width = tones.shape
    for dy in range(-3, 4):
        y = cy + dy
        if not 1 <= y < height - 1:
            continue
        for dx in range(-7, 8):
            x = (cx + dx) % width
            radius = (dx / 4.5) ** 2 + (dy / 2.0) ** 2
            if radius < 0.18:
                tones[y, x] = 0
            elif radius < 0.7:
                tones[y, x] -= 1.1
            elif radius < 1.3:
                tones[y, x] += 0.7
            elif radius < 2.0:
                tones[y, x] -= 0.35


def planks():
    rng = np.random.default_rng(SEED)
    result = canvas(160, 90)
    for row, base in enumerate((3.8, 4.15, 3.65)):
        tones = grain(160, 30, rng, base)
        knot(tones, (39, 117, 76)[row], (17, 12, 19)[row])
        # Jedna krótka rysa na desce; bez losowego szumu pojedynczych pikseli.
        x, y = (91, 8) if row == 0 else ((58, 22) if row == 1 else (134, 10))
        tones[y, x:x + 8] -= 1.2
        tones[y + 1, x + 3:x + 7] -= 0.5
        board = paint(tones)
        board[0, :, :3] = WOOD[5]
        board[-1, :, :3] = GAP
        # Koniec jednej deski nie tworzy powtarzalnej pionowej kraty.
        seam = (17, 103, 62)[row]
        board[1:-1, seam, :3] = WOOD[1]
        result[row * 30:(row + 1) * 30] = board
    return result


def board():
    # Jasna powierzchnia pod ciemny tekst, bez sęków w jego środku.
    tones = grain(48, 12, np.random.default_rng(SEED + 1), base=4.55)
    return paint(tones)


def nail(img, cx, cy):
    for dy in range(-1, 2):
        for dx in range(-1, 2):
            put(img, cx + dx, cy + dy, NAIL_DARK)
    put(img, cx, cy, NAIL_MID)
    put(img, cx, cy - 1, NAIL_LIGHT)


def frame():
    rng = np.random.default_rng(SEED + 2)
    result = canvas(64, 64)
    # Cztery proste deski: górna i dolna zachodzą na pionowe boki.
    for x in (0, 64 - SLICE):
        side = paint(grain(48, SLICE, rng, base=3.9))
        result[SLICE:-SLICE, x:x + SLICE] = np.transpose(side, (1, 0, 2))
    for y in (0, 64 - SLICE):
        result[y:y + SLICE] = paint(grain(64, SLICE, rng, base=4.4))

    # Tylko pojedyncza jasna/ciemna krawędź, bez ozdobnych okuć.
    result[0, :, :3] = WOOD[6]
    result[-1, :, :3] = GAP
    result[SLICE - 1, :, :3] = GAP
    result[-SLICE, :, :3] = WOOD[5]
    result[SLICE:-SLICE, 0, :3] = WOOD[5]
    result[SLICE:-SLICE, -1, :3] = GAP
    result[SLICE:-SLICE, SLICE - 1, :3] = GAP
    result[SLICE:-SLICE, -SLICE, :3] = WOOD[5]

    # Gwoździe pozostają w rogach 9-slice — nie powtarzają się na krawędzi.
    for x in (4, 59):
        for y in (3, 59):
            nail(result, x, y)
    # Dyskretne ślady piły w narożach; środek krawędzi pozostaje okresowy.
    result[0, 0:2, 3] = 0
    result[-1, -2:, 3] = 0
    return result


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in (('planks.png', planks), ('board.png', board), ('frame.png', frame)):
        image = Image.fromarray(make())
        path = OUT / name
        image.save(path, optimize=True)
        print(f'{path.relative_to(ROOT)}: {image.width} x {image.height}')


if __name__ == '__main__':
    main()
