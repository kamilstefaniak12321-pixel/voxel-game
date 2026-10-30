# ------------------------------------------------------------
# DREWNIANY EKWIPUNEK - tekstury
#
# Rysuje tekstury wyglądu "Drewniany" ekwipunku (src/ui/inventory-wood.css):
#   assets/ui/inventory/wood/planks.png - deski (tło okna, kafelek bez szwów),
#   assets/ui/inventory/wood/frame.png  - rama okna (9 części: rogi z liśćmi,
#                                         mech na górnej krawędzi, listki
#                                         na bokach),
#   assets/ui/inventory/wood/frame-compact.png - to samo bez części
#                                         na zewnątrz okna (mały ekran),
#   assets/ui/inventory/wood/board.png  - jasna deseczka (przyciski).
#
# Piksel tekstury = 3 piksele na ekranie (WOOD_PIXEL w CSS). Wszystko
# jest losowane z tego samego ziarna, więc kolejne uruchomienie daje
# te same obrazki.
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/ekwipunek_drewno.py               tekstury
#     python tools/ekwipunek_drewno.py podglad.png   do tego podgląd (x3)
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'ui', 'inventory', 'wood')

SEED = 2611


def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


# Paleta (ciemne -> jasne). Te same kolory są w inventory-wood.css.
OUTLINE = hex_rgb('#22150d')
WOOD = [hex_rgb(c) for c in ('#3e2817', '#553620', '#6a4428', '#7c5030', '#8e5d37', '#a26c40', '#b97f4c', '#cf9a5f')]
MOSS = [hex_rgb(c) for c in ('#1f3517', '#2d4c1e', '#3e6826', '#548a30', '#6fa93a', '#94c851')]
LEAF = [hex_rgb(c) for c in ('#1c3313', '#2b4d1b', '#3d6c24', '#55902f', '#73b03c', '#9bd257')]
VINE = hex_rgb('#2a4a1a')


def canvas(w, h):
    return np.zeros((h, w, 4), dtype=np.uint8)


def put(img, x, y, color, alpha=255):
    h, w = img.shape[:2]
    if 0 <= x < w and 0 <= y < h:
        img[y, x, :3] = color
        img[y, x, 3] = alpha


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(img, 'RGBA').save(os.path.join(OUT, name), optimize=True)
    return img


# ------------------------------------------------------------
# Deski
# ------------------------------------------------------------

# Słoje: wolno zmienny szum wzdłuż deski (całkowite częstotliwości -
# kafelek łączy się bez szwu w poziomie), osobny dla każdego wiersza
# pikseli - wychodzą długie, poziome smugi.

def grain_line(rng, width, strength=1.0):
    x = np.arange(width)
    value = np.zeros(width)
    for k in range(1, 9):
        value += rng.normal(0, 1.0 / k ** 0.8) * np.sin(2 * np.pi * k * x / width + rng.uniform(0, 2 * np.pi))
    return value * strength


def plank_rows(rng, width, heights, base_shift=0):
    height = sum(heights)
    tone = np.zeros((height, width), dtype=float)
    kind = np.zeros((height, width), dtype=np.int8)   # 0 drewno, 1 szpara, 2 brzeg deski (światło)
    y0 = 0
    for row, h in enumerate(heights):
        # Szwy (końce desek) - 1-2 na wiersz, w różnych miejscach.
        count = rng.integers(1, 3)
        seams = sorted(rng.choice(np.arange(6, width - 6), size=count, replace=False))
        if count == 2 and seams[1] - seams[0] < 24:
            seams = seams[:1]
        # Odcień każdej deski (między szwami; ostatnia łączy się z pierwszą).
        pieces = len(seams)
        piece_tone = rng.choice([2.7, 3.1, 3.5, 3.9, 4.3, 4.7], size=pieces, replace=pieces > 6) + base_shift
        lines = [grain_line(rng, width, 0.9) for _ in range(h)]
        for y in range(h):
            for x in range(width):
                piece = sum(1 for s in seams if x >= s) % pieces
                g = lines[y][x]
                # Jasne i ciemne smugi słojów.
                t = piece_tone[piece] + g * 0.45 + (0.9 if g > 1.0 else 0) - (0.8 if g < -1.0 else 0)
                # Końce desek trochę ciemniejsze (cień przy szparze).
                for s in seams:
                    d = (x - s) % width
                    if d in (1, 2) or d in (width - 1, width - 2):
                        t -= 0.5
                tone[y0 + y, x] = t
        # Krawędzie: góra jaśniejsza, dół - szpara między deskami.
        kind[y0, :] = 2
        kind[y0 + h - 1, :] = 1
        for s in seams:
            kind[y0:y0 + h - 1, s] = 1
            kind[y0 + 1:y0 + h - 1, (s + 1) % width] = 2
        # Sęk (nie na każdej desce).
        for _ in range(int(rng.integers(0, 3)) if width > 60 else 1):
            cx = int(rng.integers(5, width - 5))
            cy = y0 + int(rng.integers(4, max(5, h - 4)))
            rx, ry = rng.uniform(2.6, 4.2), rng.uniform(1.6, 2.2)
            for dy in range(-3, 4):
                for dx in range(-6, 7):
                    r = (dx / rx) ** 2 + (dy / ry) ** 2
                    x = (cx + dx) % width
                    yy = cy + dy
                    if y0 < yy < y0 + h - 1 and kind[yy, x] == 0:
                        # Sęk: ciemny środek, ciemniejsze słoje dookoła,
                        # dalej jaśniejsza smuga (słoje omijają sęk).
                        if r < 0.4:
                            tone[yy, x] = 0.8
                        elif r < 1.0:
                            tone[yy, x] = min(tone[yy, x] - 1.2, 2.2)
                        elif r < 1.6:
                            tone[yy, x] -= 0.6
                        elif r < 2.6 and abs(dy) <= 2:
                            tone[yy, x] += 0.6
        # Pęknięcia: krótkie, ciemne kreski wzdłuż deski.
        for _ in range(int(rng.integers(0, 3)) if width > 60 else 0):
            cx = int(rng.integers(0, width))
            cy = y0 + int(rng.integers(2, h - 2))
            for dx in range(int(rng.integers(4, 10))):
                x = (cx + dx) % width
                if kind[cy, x] == 0:
                    tone[cy, x] = 1.0
                    if kind[cy + 1, x] == 0:
                        tone[cy + 1, x] += 0.9
        y0 += h
    return tone, kind


def paint_planks(tone, kind):
    h, w = tone.shape
    img = canvas(w, h)
    for y in range(h):
        for x in range(w):
            if kind[y, x] == 1:
                color = OUTLINE
            elif kind[y, x] == 2:
                color = WOOD[min(7, int(round(tone[y, x])) + 2)]
            else:
                color = WOOD[int(np.clip(round(tone[y, x]), 0, 7))]
            put(img, x, y, color)
    return img


def planks():
    rng = np.random.default_rng(SEED)
    heights = [11, 12, 10, 12, 11, 12, 10, 12]
    tone, kind = plank_rows(rng, 160, heights)
    return save(paint_planks(tone, kind), 'planks.png')


def board():
    # Jasna deseczka na przyciski i napisy: 48 x 12, słoje i sęczek.
    rng = np.random.default_rng(SEED + 7)
    tone, kind = plank_rows(rng, 48, [12], base_shift=1.4)
    kind[:] = 0
    tone = np.clip(tone, 3, 6.4)
    return save(paint_planks(tone, kind), 'board.png')


# ------------------------------------------------------------
# Rama (border-image: 9 części)
# ------------------------------------------------------------

# S - wycinek (border-image-slice), O - część na zewnątrz okna
# (border-image-outset), reszta S - O leży na deskach.
S = 28
O = 12
EDGE_H = 200   # długość powtarzanego kawałka górnej i dolnej krawędzi
EDGE_V = 160   # i bocznych


# Listki rysowane ręcznie: o - obrys, d - ciemny, m - średni, l - jasny,
# h - błysk. Ogonek w lewym dolnym rogu; obracane i odbijane.
LEAVES = [
    [
        "...ooo",
        "..olho",
        ".olmlo",
        "odmmo.",
        "odmo..",
        ".oo...",
    ],
    [
        "....oooo",
        "...ollho",
        "..olmmlo",
        ".olmmmo.",
        "odmmmo..",
        "odmmo...",
        "oddo....",
        ".oo.....",
    ],
    [
        "..oo...",
        ".olho..",
        "odmlo..",
        "odmmlo.",
        ".odmmlo",
        "..odmmo",
        "...ooo.",
    ],
]
LEAF_KEYS = {'o': LEAF[0], 'd': LEAF[2], 'm': LEAF[3], 'l': LEAF[4], 'h': LEAF[5]}


def leaf(img, x, y, rng, kind=None, flip_x=None, flip_y=False):
    rows = LEAVES[int(rng.integers(0, len(LEAVES))) if kind is None else kind]
    if flip_x is None:
        flip_x = bool(rng.random() < 0.5)
    h = len(rows)
    w = len(rows[0])
    for dy in range(h):
        for dx in range(w):
            ch = rows[dy][dx]
            if ch == '.':
                continue
            tx = w - 1 - dx if flip_x else dx
            ty = h - 1 - dy if flip_y else dy
            put(img, x + tx, y + ty, LEAF_KEYS[ch])
    return w, h


def cluster(img, cx, cy, rng, count, spread):
    # Kępa liści dookoła punktu (najpierw ciemniejsze, z tyłu).
    for i in range(count):
        a = rng.uniform(0, 2 * np.pi)
        r = rng.uniform(0, spread)
        kind = int(rng.integers(0, len(LEAVES)))
        size = len(LEAVES[kind])
        leaf(img, int(cx + np.cos(a) * r - size / 2), int(cy + np.sin(a) * r - size / 2), rng, kind,
             flip_x=bool(np.cos(a) < 0), flip_y=bool(np.sin(a) > 0.6))


def moss_band(img, x0, x1, y_edge, rng, depth_in=4, depth_out=2, wrap=None):
    # Mech na górnej krawędzi: nierówny pas z kępkami wystającymi
    # w górę (na zewnątrz okna) i zwisającymi w dół (na deski).
    width = x1 - x0
    xs = np.arange(width)
    down = np.zeros(width)
    up = np.zeros(width)
    for k in range(1, 7):
        down += rng.normal(0, 1.0 / k) * np.sin(2 * np.pi * k * xs / width + rng.uniform(0, 6.3))
        up += rng.normal(0, 1.0 / k) * np.sin(2 * np.pi * k * xs / width + rng.uniform(0, 6.3))
    down = np.clip(np.round(1.6 + down * 1.6), 0, depth_in)
    up = np.clip(np.round(0.6 + up * 1.3), 0, depth_out)
    # Krople mchu zwisające niżej.
    for _ in range(width // 22):
        c = int(rng.integers(0, width))
        for dx in range(-1, 2):
            down[(c + dx) % width] = min(depth_in + 2, down[(c + dx) % width] + (3 if dx == 0 else 1))
    for i in range(width):
        x = x0 + i
        top = y_edge - int(up[i])
        bottom = y_edge + int(down[i])
        for y in range(top, bottom + 1):
            depth = (y - top) / max(1, bottom - top)
            shade = 4 - depth * 2.4 + rng.normal(0, 0.45)
            if y == top:
                shade += 0.6
            put(img, x, y, MOSS[int(np.clip(round(shade), 1, 5))])
        put(img, x, bottom + 1, MOSS[0], 200)


def moss_tuft(img, x0, x1, y_edge, rng):
    # Mała kępka mchu na dolnej krawędzi (wystaje w dół, na zewnątrz).
    for x in range(x0, x1):
        t = (x - x0) / max(1, x1 - x0 - 1)
        depth = int(round(np.sin(np.pi * t) * 2.6 + rng.normal(0, 0.5)))
        for k in range(-1, max(0, depth) + 1):
            shade = 4 - k * 0.9 + rng.normal(0, 0.4)
            put(img, x, y_edge + k, MOSS[int(np.clip(round(shade), 1, 5))])


def vine(img, x, y, length, rng, limit):
    # Pnącze zwisające w dół, z listkami na przemian po obu stronach.
    px = x
    for i in range(length):
        yy = y + i
        if rng.random() < 0.3:
            px = int(np.clip(px + int(rng.choice([-1, 1])), limit[0], limit[1]))
        put(img, px, yy, VINE)
        put(img, px + 1, yy, LEAF[0], 120)
        if i % 6 == 3 and i < length - 2:
            right = (i // 6) % 2 == 0
            kind = int(rng.integers(0, 2))
            size = len(LEAVES[kind])
            leaf(img, px + 1 if right else px - size, yy - size + 2, rng, kind, flip_x=not right)


def frame():
    rng = np.random.default_rng(SEED + 1)
    w = 2 * S + EDGE_H
    h = 2 * S + EDGE_V
    img = canvas(w, h)
    # Krawędź okna (ciemny obrys i ciemniejszy rant desek po wewnętrznej
    # stronie) - od O do O + 4.
    for y in range(O, h - O):
        for x in range(O, w - O):
            d = min(x - O, y - O, w - O - 1 - x, h - O - 1 - y)
            if d == 0:
                put(img, x, y, OUTLINE)
            elif d == 1:
                put(img, x, y, WOOD[1])
            elif d == 2:
                put(img, x, y, WOOD[2], 150)
            elif d == 3:
                put(img, x, y, OUTLINE, 45)
    # Twardy cień pod oknem (na zewnątrz, z prawej i u dołu).
    for y in range(O + 2, h - O + 2):
        for x in range(w - O, w - O + 2):
            put(img, x, y, (0, 0, 0), 90)
    for x in range(O + 2, w - O + 2):
        for y in range(h - O, h - O + 2):
            put(img, x, y, (0, 0, 0), 90)
    # Mech na górze - cała szerokość (rogi + powtarzany kawałek).
    moss_band(img, O - 1, w - O + 1, O, rng, depth_in=5, depth_out=3)
    # Mniejsze plamy mchu na dole i na bokach.
    for (x0, x1) in [(S + 10, S + 40), (w - S - 70, w - S - 36)]:
        moss_tuft(img, x0, x1, h - O - 1, rng)
    # Pnącza po bokach (w powtarzanym kawałku - rzadko, raz na 160 px).
    vine(img, O + 1, S + 18, 34, rng, (O - 1, O + 2))
    vine(img, w - O - 2, S + 70, 40, rng, (w - O - 3, w - O))
    vine(img, S + 120, O + 2, 12, rng, (S + 119, S + 121))
    # Rogi: kępy liści.
    cluster(img, O + 1, O + 1, rng, 14, 7)
    cluster(img, w - O - 2, O + 1, rng, 14, 7)
    cluster(img, O + 1, h - O - 2, rng, 8, 5)
    cluster(img, w - O - 2, h - O - 2, rng, 8, 5)
    # Pnącza z górnych rogów w dół, po zewnętrznej stronie.
    vine(img, O - 3, O + 6, S - 8, rng, (O - 5, O - 2))
    vine(img, w - O + 2, O + 6, S - 8, rng, (w - O + 1, w - O + 4))
    # Pojedyncze listki nad górną krawędzią.
    for x in (S + 34, S + 92, S + 160):
        leaf(img, x, O - 7, rng, 0)
    save(img, 'frame.png')
    # Wersja na mały ekran: bez części na zewnątrz okna (liście przy
    # rogach zostają przycięte do krawędzi).
    save(np.ascontiguousarray(img[O:h - O, O:w - O]), 'frame-compact.png')
    return img


# ------------------------------------------------------------

def preview(path, parts):
    # Podgląd: rama na deskach, wszystko x3.
    planks_img, frame_img, board_img = parts
    w, h = 320, 240
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[..., :3] = (40, 34, 38)
    out[..., 3] = 255
    ph, pw = planks_img.shape[:2]
    for y in range(O, h - O):
        for x in range(O, w - O):
            out[y, x] = planks_img[(y - O) % ph, (x - O) % pw]
    base = Image.fromarray(out, 'RGBA')
    fh, fw = frame_img.shape[:2]
    frame_full = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    src = Image.fromarray(frame_img, 'RGBA')
    # Prosty 9-slice: rogi + powtarzane krawędzie.
    for (sx, sy, dx, dy) in [(0, 0, 0, 0), (fw - S, 0, w - S, 0), (0, fh - S, 0, h - S), (fw - S, fh - S, w - S, h - S)]:
        frame_full.paste(src.crop((sx, sy, sx + S, sy + S)), (dx, dy))
    for x in range(S, w - S, EDGE_H):
        span = min(EDGE_H, w - S - x)
        frame_full.paste(src.crop((S, 0, S + span, S)), (x, 0))
        frame_full.paste(src.crop((S, fh - S, S + span, fh)), (x, h - S))
    for y in range(S, h - S, EDGE_V):
        span = min(EDGE_V, h - S - y)
        frame_full.paste(src.crop((0, S, S, S + span)), (0, y))
        frame_full.paste(src.crop((fw - S, S, fw, S + span)), (w - S, y))
    base.alpha_composite(frame_full)
    base.alpha_composite(Image.fromarray(board_img, 'RGBA'), (40, 40))
    base.resize((w * 3, h * 3), Image.NEAREST).save(path)


def main():
    parts = (planks(), frame(), board())
    print('Zapisano:', ', '.join(os.path.relpath(os.path.join(OUT, n), ROOT) for n in ('planks.png', 'frame.png', 'frame-compact.png', 'board.png')))
    if len(sys.argv) > 1:
        preview(sys.argv[1], parts)
        print('Podgląd:', sys.argv[1])


if __name__ == '__main__':
    main()
