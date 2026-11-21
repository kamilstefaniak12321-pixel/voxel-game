"""Ikonki owoców i orzechów (1.28.0, prośba Kamila 19.11.2026).

Każda ikonka powstaje w czterech krokach (jak w poradniku pixel artu,
który przysłał Kamil):

1. kształt - sylwetka narysowana piksel po pikselu (mapa znaków: każda
   litera to jedna część - owoc, listek, szypułka),
2. kontur - ciemniejszy i bardziej nasycony niż kolor bazy,
3. cieniowanie - światło z lewej góry; ciemne odcienie są bardziej
   nasycone i chłodniejsze, jasne - mniej nasycone i cieplejsze; do
   tego połysk,
4. brud - na granicach odcieni piksele się przeplatają, górny kontur ma
   dwa jaśniejsze odcienie, a dolny - drugi ciemny.

Ikonki trafiają w miejsca starych w arkuszach atlasu (tools/atlasy.py:
write_texture), razem z pieczoną dynią i cukinią (z nowych ikonek,
tools/niskie_tekstury.py: roasted). tools/krzewy_tekstury.py
i tools/niskie_tekstury.py tych kafelków już nie nadpisują (TILES).

    python3 tools/owoce_ikony.py                 # wstawia do atlasu
    python3 tools/owoce_ikony.py podglad out.png # obecne obok nowych
    python3 tools/owoce_ikony.py kroki out.png   # cztery kroki
Potem: python3 tools/paczka_tekstur.py (szablon paczki tekstur).
"""
import colorsys
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt, gaussian_filter

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))


# --- kolory -----------------------------------------------------------------

def hex_rgb(value):
    value = value.lstrip('#')
    return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))


def _toward(h, target, amount):
    d = (target - h + 0.5) % 1.0 - 0.5
    step = max(-abs(d), min(abs(d), amount)) if d >= 0 else -min(abs(d), amount)
    return (h + step) % 1.0


def _clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def shade(base, dh, dl, ks, min_l=0.0):
    r, g, b = [c / 255 for c in hex_rgb(base)]
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    # dh > 0: ku żółci (światło), dh < 0: ku błękitowi (cień).
    h = _toward(h, 1 / 6, dh) if dh > 0 else _toward(h, 2 / 3, -dh)
    l = _clamp(l + dl, min_l, 0.97)
    s = _clamp(s * ks)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return (round(r * 255), round(g * 255), round(b * 255), 255)


def ramp(base, warm=1.0, contrast=1.0, gloss_tint=None):
    """Paleta jednej części: kontury, cienie, baza, światła."""
    k = contrast
    p = {
        'o2': shade(base, -0.055 * warm, -0.38 * k, 1.25, 0.03),
        'o': shade(base, -0.045 * warm, -0.29 * k, 1.22, 0.05),
        'ot1': shade(base, -0.02 * warm, -0.15 * k, 1.1, 0.08),
        'ot2': shade(base, -0.01 * warm, -0.07 * k, 1.05, 0.1),
        's2': shade(base, -0.035 * warm, -0.19 * k, 1.15, 0.05),
        's1': shade(base, -0.018 * warm, -0.095 * k, 1.07, 0.07),
        'b': hex_rgb(base) + (255,),
        'l1': shade(base, 0.025 * warm, 0.08 * k, 0.96),
        'l2': shade(base, 0.045 * warm, 0.15 * k, 0.86),
        'h': shade(base, 0.06 * warm, 0.28 * k, 0.6),
    }
    if gloss_tint:
        p['h'] = hex_rgb(gloss_tint) + (255,)
    return p


# --- rysowanie (kroki 2-4) ----------------------------------------------------

N = 16
# Udział poziomów (od najciemniejszego): s2, s1, baza, l1, l2.
SHARES = [0.14, 0.22, 0.36, 0.18, 0.10]
LEVELS = ['s2', 's1', 'b', 'l1', 'l2']
LIGHT = np.array([-0.62, -0.78])


# --- szablony ----------------------------------------------------------------

def oval(w, h, cut=1.0):
    rows = []
    for y in range(h):
        row = ''
        for x in range(w):
            dx = (x + 0.5 - w / 2) / (w / 2)
            dy = (y + 0.5 - h / 2) / (h / 2)
            row += '#' if dx * dx + dy * dy <= cut else '.'
        rows.append(row)
    return rows


DOT = {
    2: ['##', '##'],
    3: ['.#.', '###', '.#.'],
    4: ['.##.', '####', '####', '.##.'],
    5: ['.###.', '#####', '#####', '#####', '.###.'],
    6: ['.####.', '######', '######', '######', '######', '.####.'],
    7: ['..###..', '.#####.', '#######', '#######', '#######', '.#####.', '..###..'],
    8: ['..####..', '.######.', '########', '########', '########', '########', '.######.', '..####..'],
}


class Sprite:

    def __init__(self, rows=None):
        self.g = [list(r) for r in (rows or ['.' * N] * N)]
        assert len(self.g) == N and all(len(r) == N for r in self.g), [len(r) for r in self.g]
        self.over = {}

    def blob(self, ch, template, x, y):
        for dy, row in enumerate(template):
            for dx, c in enumerate(row):
                if c == '#' and 0 <= x + dx < N and 0 <= y + dy < N:
                    self.g[y + dy][x + dx] = ch
        return self

    def line(self, ch, pts):
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            dx, dy = abs(x1 - x0), -abs(y1 - y0)
            sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
            err = dx + dy
            while True:
                if 0 <= x0 < N and 0 <= y0 < N:
                    self.g[y0][x0] = ch
                if x0 == x1 and y0 == y1:
                    break
                e2 = 2 * err
                if e2 >= dy:
                    err += dy
                    x0 += sx
                if e2 <= dx:
                    err += dx
                    y0 += sy
        return self

    def dot(self, x, y, key):
        """Szczegół po cieniowaniu: klucz palety części pod spodem
        ('h', 'l2', 'l1', 'b', 's1', 's2', 'o', 'o2') albo kolor '#rrggbb'."""
        self.over[(x, y)] = key
        return self

    def mask(self, ch):
        return np.array([[c == ch for c in row] for row in self.g])


# --- rodzaje części ------------------------------------------------------------

def body(color, gloss=1, contrast=1.0, gloss_tint=None, dirt=0.08, bottom=0.15, warm=1.0):
    return {'kind': 'body', 'pal': ramp(color, warm=warm, contrast=contrast, gloss_tint=gloss_tint),
            'gloss': gloss, 'dirt': dirt, 'bottom': bottom}


def flat(color, contrast=0.8, dirt=0.06):
    """Liść, kielich: kontur i dwa-trzy odcienie, bez połysku."""
    return {'kind': 'body', 'pal': ramp(color, contrast=contrast), 'gloss': 0, 'dirt': dirt, 'bottom': 0.05}


def stroke(color):
    return {'kind': 'stroke', 'pal': ramp(color)}


# --- malowanie -------------------------------------------------------------------

def paint(sprite, parts, order, seed=1, stage=4):
    rng = random.Random(seed)
    px = np.zeros((N, N, 4), dtype=np.uint8)
    rank = {ch: k for k, ch in enumerate(order)}
    owner = np.array([[rank.get(c, -1) for c in row] for row in sprite.g])
    for ch in order:
        spec = parts[ch]
        pal = spec['pal']
        m = sprite.mask(ch)
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        if spec['kind'] == 'stroke':
            for y, x in zip(ys, xs):
                px[y, x] = pal['l1'] if (x + y) % 3 == 0 and stage >= 3 else pal['b']
            continue
        if stage == 1:
            for y, x in zip(ys, xs):
                px[y, x] = pal['b']
            continue
        k = rank[ch]

        def outside(y, x):
            # Kontur tam, gdzie obok jest pusto albo część "z tyłu".
            if not (0 <= y < N and 0 <= x < N):
                return True
            return owner[y, x] < k

        edge = {}
        for y, x in zip(ys, xs):
            sides = (outside(y - 1, x), outside(y + 1, x), outside(y, x - 1), outside(y, x + 1))
            if any(sides):
                edge[(y, x)] = sides
        # Krok 3: wartość światła - kształt (odległość od brzegu) + strona.
        big = np.kron(m, np.ones((8, 8)))
        d = distance_transform_edt(np.pad(big, 8))[8:-8, 8:-8]
        R = max(1.0, d.max())
        height = gaussian_filter(np.sqrt(np.clip(1 - (1 - d / R) ** 2, 0, 1)) * R, 3)
        gy, gx = np.gradient(height)
        shade_map = (-gx * LIGHT[0] - gy * LIGHT[1]).reshape(N, 8, N, 8).mean(axis=(1, 3))
        cx, cy = xs.mean() + 0.5, ys.mean() + 0.5
        radius = max(1.5, np.sqrt(m.sum() / np.pi))
        y0, y1 = ys.min(), ys.max()
        inner = [(y, x) for y, x in zip(ys, xs) if (y, x) not in edge]
        values = {}
        for y, x in inner:
            planar = ((x + 0.5 - cx) * LIGHT[0] + (y + 0.5 - cy) * LIGHT[1]) / radius
            rel = (y - y0) / max(1, y1 - y0)
            noise = rng.uniform(-1, 1) * spec['dirt']
            values[(y, x)] = 0.5 * planar + 0.5 * np.tanh(shade_map[y, x] * 2) - spec['bottom'] * rel + (noise if stage >= 4 else 0)
        if values:
            keys = sorted(values, key=values.get)
            cuts = np.cumsum(SHARES)[:-1]
            for i, (y, x) in enumerate(keys):
                q = i / max(1, len(keys) - 1)
                level = int(np.searchsorted(cuts, q, side='right'))
                # Krok 4: na granicy dwóch poziomów piksele się przeplatają.
                if stage >= 4 and level < len(cuts) and cuts[level] - q < 0.06 and (x + y) % 2 == 0:
                    level += 1
                px[y, x] = pal[LEVELS[level]] if stage >= 3 else pal['b']
            # Połysk: najjaśniejsze piksele środka.
            for y, x in keys[::-1][:spec['gloss'] if stage >= 3 else 0]:
                px[y, x] = pal['h']
        # Krok 2 i 4: kontur; u góry dwa jaśniejsze odcienie, u dołu drugi ciemny.
        for (y, x), (up, down, left, right) in edge.items():
            if stage < 4:
                px[y, x] = pal['o']
                continue
            rel = (y - y0) / max(1, y1 - y0)
            lit = (x + 0.5 - cx) * LIGHT[0] + (y + 0.5 - cy) * LIGHT[1] > 0
            if up and rel < 0.5:
                color = pal['ot2'] if lit and (x // 2) % 2 == 0 else pal['ot1']
            elif left and lit and not down:
                color = pal['ot1']
            elif down or (rel > 0.6 and not lit):
                color = pal['o2'] if (x + y) % 3 else pal['o']
            else:
                color = pal['o']
            px[y, x] = color
    # Szczegóły (od kroku 3 - z cieniowaniem).
    for (x, y), key in (sprite.over.items() if stage >= 3 else []):
        if key.startswith('#'):
            px[y, x] = hex_rgb(key) + (255,)
        else:
            ch = sprite.g[y][x]
            px[y, x] = parts[ch]['pal'][key]
    return px


# --- rysunki (krok 1) ------------------------------------------------------------

LEAF = '#58a032'
LEAF_D = '#3f7d2a'
STEM = '#6b4526'
STEM_G = '#5e8a2c'


def lit(x, y, cx=8, cy=8):
    return (x - cx) + (y - cy) < 0


def aggregate(s, ch, shine='l2'):
    """Owoc zbiorowy: pestkowce 2x2 (jasny lewy górny róg) na ciemnych
    szczelinach; po stronie cienia - ciemniejsze."""
    m = s.mask(ch)
    inner = [(x, y) for y in range(1, 15) for x in range(1, 15)
             if all(m[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1))]
    inner_set = set(inner)
    for x, y in inner:
        s.dot(x, y, 's1' if lit(x, y) else 's2')
    row = 0
    for y in range(1, 15, 2):
        off = row % 2
        for x in range(1 + off, 15, 3):
            cells = [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
            if all(c in inner_set for c in cells):
                light = lit(x, y)
                s.dot(x, y, shine if light and (x + y) % 4 < 2 else 'l1' if light else 'b')
                s.dot(x + 1, y, 'b' if light else 's1')
                s.dot(x, y + 1, 'b' if light else 's1')
                s.dot(x + 1, y + 1, 's1' if light else 's2')
        row += 1


def apple():
    s = Sprite([
        "..........ll....",
        "........tllll...",
        "........tlll....",
        "...AAAA.tAAAA...",
        "..AAAAAAAAAAAA..",
        ".AAAAAAAAAAAAAA.",
        ".AAAAAAAAAAAAAA.",
        ".AAAAAAAAAAAAAA.",
        ".AAAAAAAAAAAAAA.",
        ".AAAAAAAAAAAAAA.",
        "..AAAAAAAAAAAA..",
        "..AAAAAAAAAAAA..",
        "...AAAAAAAAAA...",
        "....AAAAAAAA....",
        ".....AA..AA.....",
        "................"])
    return s, {'A': body('#c4282c', gloss=3), 't': stroke(STEM), 'l': flat(LEAF)}, 'Atl'


def strawberry():
    s = Sprite([
        "........tt......",
        "........t.......",
        "...cc.cccc.cc...",
        "..BBccccccccBB..",
        ".BBBBBccccBBBBB.",
        ".BBBBBBBBBBBBBB.",
        ".BBBBBBBBBBBBBB.",
        ".BBBBBBBBBBBBBB.",
        "..BBBBBBBBBBBB..",
        "..BBBBBBBBBBBB..",
        "...BBBBBBBBBB...",
        "...BBBBBBBBBB...",
        "....BBBBBBBB....",
        ".....BBBBBB.....",
        "......BBBB......",
        ".......BB......."])
    for x, y in [(3, 6), (6, 6), (9, 6), (12, 6), (4, 8), (7, 8), (10, 8), (5, 10), (8, 10), (11, 10), (6, 12), (9, 12)]:
        s.dot(x, y, '#f4d65c').dot(x, y + 1, 's2')
    return s, {'B': body('#d22a2e', gloss=2), 'c': flat(LEAF), 't': stroke(STEM_G)}, 'Bct'


def wild_strawberry():
    s = Sprite([
        "................",
        "........t.......",
        ".......t.t......",
        "......t...t.....",
        ".....t.....t....",
        "....t.......t...",
        "..cccc......t...",
        ".DDccDD....cccc.",
        ".DDDDDD...EEccEE",
        ".DDDDDD...EEEEEE",
        "..DDDD....EEEEEE",
        "..DDDD.....EEEE.",
        "...DD......EEEE.",
        "............EE..",
        "................",
        "................"])
    for x, y in [(3, 9), (4, 11), (12, 10), (13, 12)]:
        s.dot(x, y, '#f4d65c')
    red = body('#d8222e', gloss=1)
    return s, {'D': red, 'E': red, 'c': flat(LEAF), 't': stroke(STEM_G)}, 'tDEc'


def raspberry(color='#cc3060', seed_shine='l2'):
    s = Sprite([
        "........t.......",
        "........t.......",
        "......cccc......",
        "....RRccccRR....",
        "...RRRRRRRRRR...",
        "..RRRRRRRRRRRR..",
        "..RRRRRRRRRRRR..",
        ".RRRRRRRRRRRRRR.",
        ".RRRRRRRRRRRRRR.",
        ".RRRRRRRRRRRRRR.",
        "..RRRRRRRRRRRR..",
        "..RRRRRRRRRRRR..",
        "...RRRRRRRRRR...",
        "....RRRRRRRR....",
        "......RRRR......",
        "................"])
    aggregate(s, 'R', seed_shine)
    return s, {'R': body(color, gloss=0, contrast=1.15), 'c': flat(LEAF_D), 't': stroke(STEM_G)}, 'Rct'


def blackberry():
    s = Sprite([
        "........t.......",
        "........t.......",
        "......cccc......",
        ".....KccccK.....",
        "....KKKKKKKK....",
        "...KKKKKKKKKK...",
        "...KKKKKKKKKK...",
        "..KKKKKKKKKKKK..",
        "..KKKKKKKKKKKK..",
        "..KKKKKKKKKKKK..",
        "..KKKKKKKKKKKK..",
        "...KKKKKKKKKK...",
        "...KKKKKKKKKK...",
        "....KKKKKKKK....",
        "......KKKK......",
        "................"])
    aggregate(s, 'K', 'h')
    return s, {'K': body('#4a3368', gloss=0, contrast=1.35, gloss_tint='#c4bdf0'), 'c': flat(LEAF_D), 't': stroke(STEM_G)}, 'Kct'


def crown(s, x, y):
    s.dot(x - 1, y, 'o').dot(x, y, 'o2').dot(x + 1, y, 'o').dot(x, y + 1, 's2')


def blueberry():
    s = Sprite()
    s.blob('l', oval(7, 3), 9, 0)
    s.blob('a', DOT[7], 1, 2)
    s.blob('b', DOT[7], 8, 4)
    s.blob('c', DOT[8], 3, 7)
    crown(s, 4, 3)
    crown(s, 11, 5)
    crown(s, 7, 8)
    blue = body('#4a60b0', gloss=2, gloss_tint='#cdd7f0', contrast=0.95)
    return s, {'l': flat(LEAF_D), 'a': blue, 'b': blue, 'c': blue}, 'labc'


def lingonberry():
    s = Sprite()
    s.blob('l', oval(7, 3), 0, 1)
    s.blob('m', oval(7, 3), 9, 0)
    s.line('t', [(8, 1), (7, 5)])
    s.line('t', [(8, 1), (11, 6)])
    for ch, (x, y) in zip('abdefg', [(2, 4), (7, 4), (10, 6), (4, 8), (0, 10), (8, 10)]):
        s.blob(ch, DOT[5], x, y)
    red = body('#d12a36', gloss=1)
    return s, {'l': flat(LEAF_D), 'm': flat(LEAF_D), 't': stroke('#8a6a40'), **{c: red for c in 'abdefg'}}, 'lmtabdefg'


def cranberry():
    s = Sprite()
    s.line('t', [(4, 0), (6, 2), (5, 5)])
    s.line('t', [(6, 2), (10, 3), (11, 5)])
    s.blob('a', oval(7, 6), 1, 5)
    s.blob('b', oval(7, 6), 8, 5)
    s.blob('c', oval(7, 6), 4, 9)
    red = body('#a81c38', gloss=2, gloss_tint='#f4c0c4')
    return s, {'t': stroke('#7a5a3a'), 'a': red, 'b': red, 'c': red}, 'tabc'


def currants(color, tint):
    s = Sprite()
    s.blob('l', oval(7, 3), 0, 1)
    s.line('t', [(6, 0), (8, 3), (9, 7), (9, 12)])
    for ch, (x, y) in zip('abcde', [(10, 2), (4, 5), (10, 7), (5, 10), (9, 11)]):
        s.blob(ch, DOT[5], x, y)
    berry = body(color, gloss=1, gloss_tint=tint)
    return s, {'l': flat(LEAF), 't': stroke(STEM_G), **{c: berry for c in 'abcde'}}, 'ltabcde'


def gooseberry(color):
    s = Sprite()
    s.line('t', [(8, 0), (4, 3)])
    s.line('t', [(8, 0), (11, 5)])
    s.blob('a', oval(7, 9), 1, 4)
    s.blob('b', oval(7, 9), 8, 6)
    for cx, top in [(4, 4), (11, 6)]:
        for y in range(top + 2, top + 7):
            s.dot(cx - 1, y, 'l1' if y < top + 4 else 'b')
            s.dot(cx + 1, y, 'b' if y < top + 4 else 's1')
        if top + 9 < 16:
            s.dot(cx, top + 9, '#5a4228')
    berry = body(color, gloss=1, contrast=0.9)
    return s, {'t': stroke('#7a5a3a'), 'a': berry, 'b': berry}, 'tab'


def aronia():
    s = Sprite()
    for pts in [[(8, 0), (5, 4)], [(8, 0), (10, 3)], [(8, 0), (8, 7)]]:
        s.line('t', pts)
    for ch, (x, y) in zip('abcdef', [(2, 4), (9, 3), (6, 7), (1, 9), (11, 8), (6, 11)]):
        s.blob(ch, DOT[5], x, y)
    berry = body('#3a2c48', gloss=1, gloss_tint='#a39cc6', contrast=1.35)
    return s, {'t': stroke('#8c3a3a'), **{c: berry for c in 'abcdef'}}, 'tabcdef'


def elderberry():
    s = Sprite()
    stem = [[(8, 0), (8, 3)], [(8, 3), (3, 7)], [(8, 3), (6, 8)], [(8, 3), (10, 8)], [(8, 3), (13, 7)]]
    for pts in stem:
        s.line('t', pts)
    spots = [(1, 8), (4, 8), (7, 9), (10, 8), (13, 8), (2, 11), (5, 10), (9, 11), (12, 11), (4, 13), (7, 12), (10, 14), (13, 13), (1, 14), (14, 10)]
    rng = random.Random(4)
    for x, y in spots:
        for dx in (0, 1):
            for dy in (0, 1):
                if 0 <= x + dx < 16 and 0 <= y + dy < 16:
                    s.g[y + dy][x + dx] = 'e'
    for x, y in spots:
        s.dot(x, y, 'h' if rng.random() < 0.7 else 'l2')
        if x + 1 < 16:
            s.dot(x + 1, y, 'b')
        if y + 1 < 16:
            s.dot(x, y + 1, 's1')
            if x + 1 < 16:
                s.dot(x + 1, y + 1, 'o2')
    berry = body('#33243f', gloss_tint='#b1a6d6', contrast=1.5)
    return s, {'t': stroke('#b4445f'), 'e': {'kind': 'stroke', 'pal': berry['pal']}}, 'te'


def sea_buckthorn():
    s = Sprite()
    s.line('l', [(0, 3), (2, 1)])
    s.line('l', [(13, 15), (15, 12)])
    s.line('t', [(1, 1), (14, 14)])
    for ch, (x, y) in zip('abcdefg', [(0, 4), (4, 0), (3, 7), (8, 4), (6, 10), (11, 7), (10, 11)]):
        s.blob(ch, DOT[5], x, y)
    berry = body('#f08a1e', gloss=1)
    return s, {'l': stroke('#8fa680'), 't': stroke('#5a4a3a'), **{c: berry for c in 'abcdefg'}}, 'ltabcdefg'


def rose_hip():
    s = Sprite()
    s.line('t', [(8, 0), (4, 3)])
    s.line('t', [(8, 0), (11, 4)])
    s.blob('a', oval(6, 10), 1, 4)
    s.blob('b', oval(6, 10), 9, 5)
    dark = '#3a2818'
    for x, y in [(2, 3), (3, 3), (4, 3), (5, 3), (1, 2), (6, 2), (10, 4), (11, 4), (12, 4), (13, 4), (9, 3), (14, 3)]:
        s.dot(x, y, dark)
    hip = body('#d63e26', gloss=2)
    return s, {'t': stroke(STEM), 'a': hip, 'b': hip}, 'tab'


def fig():
    s = Sprite([
        "........t.......",
        "........t.......",
        ".......FF.......",
        "......FFFF......",
        ".....FFFFFF.....",
        "....FFFFFFFF....",
        "...FFFFFFFFFF...",
        "..FFFFFFFFFFFF..",
        "..FFFFFFFFFFFF..",
        ".FFFFFFFFFFFFFF.",
        ".FFFFFFFFFFFFFF.",
        ".FFFFFFFFFFFFFF.",
        "..FFFFFFFFFFFF..",
        "..FFFFFFFFFFFF..",
        "....FFFFFFFF....",
        "................"])
    return s, {'F': body('#6c2e5e', gloss=2, contrast=1.1), 't': stroke(STEM_G)}, 'Ft'


def olives():
    s = Sprite()
    s.blob('l', oval(8, 3), 0, 0)
    s.blob('m', oval(8, 3), 8, 1)
    s.line('t', [(0, 3), (15, 5)])
    s.line('t', [(4, 3), (4, 5)])
    s.line('t', [(11, 4), (11, 6)])
    s.blob('a', oval(6, 8), 1, 6)
    s.blob('b', oval(6, 8), 8, 7)
    return s, {'l': flat('#7f9a6e'), 'm': flat('#7f9a6e'), 't': stroke('#6a5a40'),
               'a': body('#80952e', gloss=1), 'b': body('#3e2b48', gloss=1, gloss_tint='#aea0c4', contrast=1.3)}, 'lmtab'


def coconut():
    s = Sprite()
    s.blob('C', oval(14, 13), 1, 2)
    rng = random.Random(9)
    for y in range(4, 13):
        for x in range(3, 13):
            if rng.random() < 0.13 and s.g[y][x] == 'C':
                s.dot(x, y, 'l2' if lit(x, y) else 'l1')
    for x, y in [(7, 3), (9, 3), (8, 4)]:
        s.dot(x, y, 'o2')
    return s, {'C': body('#7b4b29', gloss=0, dirt=0.14)}, 'C'


def baobab():
    s = Sprite()
    s.line('t', [(8, 0), (8, 2)])
    s.blob('B', oval(8, 13), 4, 2)
    return s, {'t': stroke(STEM), 'B': body('#8f9258', gloss=0, dirt=0.12, contrast=0.9)}, 'tB'


def dragon_berries():
    s = Sprite()
    for pts in [[(8, 0), (4, 4)], [(8, 0), (12, 4)], [(8, 0), (8, 7)], [(4, 4), (3, 9)], [(12, 4), (13, 9)]]:
        s.line('t', pts)
    for ch, (x, y) in zip('abcdef', [(1, 4), (10, 4), (5, 6), (0, 10), (11, 10), (6, 11)]):
        s.blob(ch, DOT[5], x, y)
    berry = body('#e0562a', gloss=1)
    return s, {'t': stroke('#7a6a3a'), **{c: berry for c in 'abcdef'}}, 'tabcdef'


def chili():
    s = Sprite([
        "...........tt...",
        "..........t.....",
        "........cccc....",
        ".......cCCCCc...",
        ".......CCCCCC...",
        "......CCCCCCC...",
        "......CCCCCCC...",
        ".....CCCCCCC....",
        ".....CCCCCC.....",
        "....CCCCCC......",
        "...CCCCCC.......",
        "..CCCCCC........",
        ".CCCCC..........",
        ".CCCC...........",
        "CCC.............",
        "................"])
    return s, {'C': body('#d6201c', gloss=3), 'c': flat(LEAF), 't': stroke(STEM_G)}, 'Cct'


def hazelnut():
    s = Sprite([
        "................",
        ".......nn.......",
        "......nnnn......",
        ".....nnnnnn.....",
        "...nnnnnnnnnn...",
        "..nnnnnnnnnnnn..",
        ".nnnnnnnnnnnnnn.",
        ".nnnnnnnnnnnnnn.",
        ".nnnnnnnnnnnnnn.",
        ".nnnnnnnnnnnnnn.",
        ".nnnnnnnnnnnnnn.",
        "..nnnnnnnnnnnn..",
        "..pppppppppppp..",
        "....pppppppp....",
        "................",
        "................"])
    for y in range(5, 11):
        if y % 2:
            s.dot(5, y, 's1').dot(10, y, 's2')
    return s, {'n': body('#9a5a28', gloss=2), 'p': body('#d6bd8c', gloss=0, contrast=0.8, dirt=0.12)}, 'np'


def beechnuts():
    s = Sprite([
        "................",
        "......N.........",
        ".....NN.........",
        ".....NNN....M...",
        "....NNNN...MM...",
        "....NNNNN..MMM..",
        "...NNNNNN.MMMM..",
        "...NNNNNNNMMMMM.",
        "..NNNNNNNNMMMMM.",
        "..NNNNNNNMMMMMM.",
        ".NNNNNNNNMMMMMM.",
        ".NNNNNNNNMMMMMM.",
        "..NNNNNNMMMMMMM.",
        "...NNNNN.MMMMM..",
        "................",
        "................"])
    for y in range(3, 12):
        s.dot(5 if y < 8 else 4, y, 'l1' if y < 8 else 'b')
    for y in range(5, 12):
        s.dot(12 if y < 9 else 11, y, 'l1' if y < 8 else 'b')
    nut = body('#8d5533', gloss=1)
    return s, {'N': nut, 'M': nut}, 'NM'


def acorn():
    s = Sprite([
        "........t.......",
        "........t.......",
        "....kkkkkkkk....",
        "...kkkkkkkkkk...",
        "..kkkkkkkkkkkk..",
        "..kkkkkkkkkkkk..",
        "...AAAAAAAAAA...",
        "...AAAAAAAAAA...",
        "...AAAAAAAAAA...",
        "...AAAAAAAAAA...",
        "....AAAAAAAA....",
        "....AAAAAAAA....",
        ".....AAAAAA.....",
        "......AAAA......",
        ".......AA.......",
        "................"])
    for y in range(3, 6):
        for x in range(3, 13):
            if s.g[y][x] == 'k' and s.g[y][x - 1] == 'k' and s.g[y][x + 1] == 'k':
                if (x + 2 * y) % 4 == 0:
                    s.dot(x, y, 's2')
                elif (x + 2 * y) % 4 == 2 and y < 5:
                    s.dot(x, y, 'l1')
    return s, {'k': body('#7a5530', gloss=0, contrast=1.0), 'A': body('#b8823a', gloss=2), 't': stroke('#5a3f22')}, 'Akt'


def araucaria():
    # Kupka orzeszków jak migdały: owalne, rudobrązowe, z jasnym czubkiem.
    s = Sprite()
    places = [(5, 1), (0, 5), (10, 4)]
    for ch, (x, y) in zip('abc', places):
        s.blob(ch, oval(6, 11), x, y)
    for x, y in places:
        s.dot(x + 2, y, '#ecd6aa').dot(x + 3, y, '#e2c596').dot(x + 2, y + 1, '#d9b98a')
    nut = body('#a24e2a', gloss=2)
    return s, {c: nut for c in 'abc'}, 'abc'


def pumpkin_slice():
    # Łódka wycięta z dyni: skórka po zewnętrznym łuku, miąższ, przy
    # wewnętrznym łuku jasne włókna i pestki.
    s = Sprite()
    for y in range(16):
        for x in range(16):
            px, py = x + 0.5, y + 0.5
            outer = ((px - 8.0) ** 2 + (py - 8.6) ** 2) ** 0.5
            inner = ((px - 11.2) ** 2 + (py - 4.6) ** 2) ** 0.5
            if outer <= 7.3 and inner >= 6.2:
                s.g[y][x] = 'r' if outer > 5.7 else 'p' if inner < 7.2 else 'f'
    for x, y in [(4, 5), (6, 9), (9, 11)]:
        if s.g[y][x] == 'p':
            s.dot(x, y, '#f6e7bb')
    return s, {'p': body('#ecc860', gloss=0, contrast=0.8, dirt=0.15), 'f': body('#f2a23a', gloss=1, contrast=0.9),
               'r': body('#c4540f', gloss=0)}, 'fpr'


def zucchini():
    s = Sprite([
        "..............ss",
        ".............ss.",
        "...........zzs..",
        "..........zzzz..",
        ".........zzzzz..",
        "........zzzzz...",
        ".......zzzzz....",
        "......zzzzz.....",
        ".....zzzzz......",
        "....zzzzz.......",
        "...zzzzz........",
        "..zzzzz.........",
        ".zzzzz..........",
        ".zzzz...........",
        "..zz............",
        "................"])
    rng = random.Random(5)
    for y in range(3, 14):
        for x in range(1, 15):
            if s.g[y][x] == 'z' and rng.random() < 0.12:
                s.dot(x, y, 'l2')
    return s, {'z': body('#2f6b2a', gloss=2), 's': body('#a3a35a', gloss=0, contrast=0.8)}, 'zs'



# --- pnącza (1.30.0, blocks/vines.js) ------------------------------------------

def grapes():
    # Kiść: jagody 4 x 4 w zwężających się rzędach, łodyżka i listek.
    s = Sprite()
    s.blob('l', oval(6, 4), 10, 0)
    s.line('t', [(8, 0), (7, 3)])
    berries = [(0, 3), (4, 2), (8, 3), (3, 6), (7, 6), (11, 5), (5, 9), (9, 9), (7, 12)]
    order = 'abcdefghi'
    for ch, (x, y) in zip(order, berries):
        s.blob(ch, DOT[5], x, y)
    # Każda jagoda z własnym błyskiem w lewym górnym rogu.
    for x, y in berries:
        s.dot(x + 1, y + 1, 'h').dot(x + 2, y + 1, 'l2')
    berry = body('#5b3a7c', gloss=0, gloss_tint='#c4aee6', contrast=1.35)
    # Rzędy z tyłu (wyżej) przykryte przez niższe - kontury między jagodami.
    return s, {'l': flat(LEAF), 't': stroke(STEM_G), **{c: berry for c in order}}, 'lt' + order


def hop_cone():
    # Szyszka chmielu: jasnozielone łuski zachodzące na siebie, łodyżka.
    s = Sprite([
        "........t.......",
        "........t.......",
        "......HHHH......",
        ".....HHHHHH.....",
        "....HHHHHHHH....",
        "....HHHHHHHH....",
        "...HHHHHHHHHH...",
        "...HHHHHHHHHH...",
        "...HHHHHHHHHH...",
        "...HHHHHHHHHH...",
        "....HHHHHHHH....",
        "....HHHHHHHH....",
        ".....HHHHHH.....",
        "......HHHH......",
        ".......HH.......",
        "................"])
    # Krawędzie łusek: ciemne łuki co dwa wiersze, na zmianę przesunięte.
    for row, y in enumerate(range(4, 14, 2)):
        for x in range(3 + row % 2, 13, 3):
            for dx in (0, 1):
                if s.g[y][x + dx] == 'H' and s.g[y + 1][x + dx] == 'H':
                    s.dot(x + dx, y + 1, 's1' if lit(x + dx, y + 1) else 's2')
            if s.g[y][x] == 'H':
                s.dot(x, y, 'l1' if lit(x, y) else 'b')
    return s, {'H': body('#a9c85a', gloss=1, contrast=0.9, dirt=0.1), 't': stroke(STEM_G)}, 'tH'


def kiwi():
    # Całe kiwi (brązowe, włochate) z tyłu i połówka z przodu: skórka,
    # zielony miąższ, wianuszek czarnych pestek, jasny środek.
    s = Sprite()
    s.blob('K', oval(10, 12), 0, 1)
    for y in range(16):
        for x in range(16):
            d = ((x + 0.5 - 10.5) ** 2 + (y + 0.5 - 10.0) ** 2) ** 0.5
            if d <= 5.4:
                s.g[y][x] = 'r' if d > 4.4 else 'g' if d > 1.6 else 'c'
    rng = random.Random(11)
    for y in range(16):
        for x in range(16):
            ch = s.g[y][x]
            d = ((x + 0.5 - 10.5) ** 2 + (y + 0.5 - 10.0) ** 2) ** 0.5
            if ch == 'g' and 2.0 < d < 3.0 and (x + y) % 2 == 0:
                s.dot(x, y, '#1c1a14')
            if ch == 'K' and rng.random() < 0.18:
                s.dot(x, y, 'l1' if lit(x, y, 5, 7) else 's1')
    return s, {'K': body('#8a6436', gloss=0, dirt=0.14), 'r': body('#6b4a26', gloss=0),
               'g': body('#7cb63a', gloss=0, contrast=0.8), 'c': body('#e6eab0', gloss=0, contrast=0.6)}, 'Krgc'


def passion_fruit():
    # Marakuja: ciemnofioletowy owoc z połyskiem i przekrojona połówka -
    # biała skórka, żółty miąższ z ciemnymi pestkami.
    s = Sprite()
    s.blob('P', oval(12, 12), 0, 0)
    for y in range(16):
        for x in range(16):
            d = ((x + 0.5 - 10.8) ** 2 + (y + 0.5 - 10.8) ** 2) ** 0.5
            if d <= 5.0:
                s.g[y][x] = 'w' if d > 3.9 else 'y'
    for x, y in [(9, 9), (11, 10), (10, 12), (12, 12), (12, 9), (9, 11)]:
        if s.g[y][x] == 'y':
            s.dot(x, y, '#3a2410')
    s.dot(5, 0, '#5e7a3a').dot(6, 0, '#5e7a3a')
    return s, {'P': body('#5a2448', gloss=2, gloss_tint='#d6a0c8', contrast=1.2), 'w': body('#efe4c6', gloss=0, contrast=0.6),
               'y': body('#f2b21e', gloss=1, contrast=0.9)}, 'Pwy'


ICONS = {
    'strawberry': strawberry, 'wild_strawberry': wild_strawberry, 'raspberry': raspberry,
    'yellow_raspberry': lambda: raspberry('#e6b648'), 'blackberry': blackberry, 'blueberry': blueberry,
    'lingonberry': lingonberry, 'cranberry': cranberry,
    'redcurrant': lambda: currants('#d6263a', '#ffd6d6'), 'blackcurrant': lambda: currants('#2e2440', '#a49cc8'),
    'gooseberry': lambda: gooseberry('#9cc95a'), 'red_gooseberry': lambda: gooseberry('#a8344e'),
    'aronia': aronia, 'elderberry': elderberry, 'sea_buckthorn': sea_buckthorn, 'rose_hip': rose_hip,
    'apple': apple, 'fig': fig, 'olives': olives, 'coconut': coconut, 'baobab': baobab,
    'dragon_berries': dragon_berries, 'chili': chili, 'hazelnut': hazelnut, 'beechnuts': beechnuts,
    'acorn': acorn, 'araucaria': araucaria, 'pumpkin_slice': pumpkin_slice, 'zucchini': zucchini,
    'grapes': grapes, 'hop_cone': hop_cone, 'kiwi': kiwi, 'passion_fruit': passion_fruit,
}


# --- kafelki w atlasie ---------------------------------------------------------

# Nazwa rysunku -> kafelek atlasu (ikonka przedmiotu).
TILES = {
    'strawberry': 'strawberry', 'wild_strawberry': 'item_wild_strawberry',
    'raspberry': 'item_raspberry', 'yellow_raspberry': 'item_yellow_raspberry',
    'blackberry': 'blackberry', 'blueberry': 'blueberry',
    'lingonberry': 'item_lingonberry', 'cranberry': 'item_cranberry',
    'redcurrant': 'item_redcurrant', 'blackcurrant': 'item_blackcurrant',
    'gooseberry': 'item_gooseberry', 'red_gooseberry': 'item_red_gooseberry',
    'aronia': 'item_aronia', 'elderberry': 'item_elderberry',
    'sea_buckthorn': 'item_sea_buckthorn', 'rose_hip': 'item_rose_hip',
    'apple': 'jablon/jablko.png', 'fig': 'banyan/fig.png', 'olives': 'olive/olives.png',
    'coconut': 'coconut_palm/coconut.png', 'baobab': 'baobab/fruit.png',
    'dragon_berries': 'dragon_tree/berries.png', 'chili': 'chili_pepper',
    'hazelnut': 'hazelnut', 'beechnuts': 'beechnuts', 'acorn': 'acorn',
    'araucaria': 'araucaria/nuts.png', 'pumpkin_slice': 'item_pumpkin_slice',
    'zucchini': 'item_zucchini',
    'grapes': 'item_grapes', 'hop_cone': 'item_hop_cone', 'kiwi': 'item_kiwi', 'passion_fruit': 'item_passion_fruit',
}
# Pieczone - z nowych ikonek (niskie_tekstury.roasted).
ROASTED = {'roasted_pumpkin_slice': 'pumpkin_slice', 'roasted_zucchini': 'zucchini'}
# Kafelki, których inne generatory już nie nadpisują.
OWNED = set(TILES.values()) | set(ROASTED)


def render(name, stage=4):
    sprite, parts, order = ICONS[name]()
    px = paint(sprite, parts, order, seed=sum(map(ord, name)), stage=stage)
    return Image.fromarray(px, 'RGBA')


def install():
    import atlasy
    from niskie_tekstury import roasted
    icons = {name: render(name) for name in TILES}
    for name, tile in TILES.items():
        atlasy.write_texture(tile, icons[name])
    for tile, name in ROASTED.items():
        atlasy.write_texture(tile, roasted(icons[name]))
    print(f'{len(TILES)} ikonek owoców i {len(ROASTED)} pieczonych -> atlas')


def preview(path, scale=8):
    """Arkusz: obecna ikonka z atlasu obok nowej."""
    import atlasy
    from PIL import ImageDraw
    cols, cell = 5, 2 * 16 * scale + 36
    rows = (len(TILES) + cols - 1) // cols
    out = Image.new('RGB', (cols * cell, rows * (16 * scale + 30) + 4), (58, 62, 56))
    draw = ImageDraw.Draw(out)
    for k, (name, tile) in enumerate(TILES.items()):
        x, y = (k % cols) * cell + 8, (k // cols) * (16 * scale + 30) + 4
        for i, image in enumerate((atlasy.read_texture(tile), render(name))):
            big = image.resize((16 * scale, 16 * scale), Image.NEAREST)
            out.paste(big, (x + i * (16 * scale + 12), y), big)
        draw.text((x, y + 16 * scale + 6), f'{name}: obecna | nowa', fill=(232, 232, 220))
    out.save(path)


def steps(path, names=('apple', 'strawberry', 'blueberry', 'acorn'), scale=10):
    """Arkusz: cztery kroki dla kilku owoców."""
    cell = 16 * scale + 24
    out = Image.new('RGB', (4 * cell + 16, len(names) * cell + 16), (58, 62, 56))
    for r, name in enumerate(names):
        for k in range(4):
            big = render(name, k + 1).resize((16 * scale, 16 * scale), Image.NEAREST)
            out.paste(big, (8 + k * cell, 8 + r * cell), big)
    out.save(path)


if __name__ == '__main__':
    if len(sys.argv) > 2 and sys.argv[1] == 'podglad':
        preview(sys.argv[2])
    elif len(sys.argv) > 2 and sys.argv[1] == 'kroki':
        steps(sys.argv[2])
    else:
        install()
