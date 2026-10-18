# ------------------------------------------------------------
# GENERATOR TEKSTUR BLOKÓW
#
# Rysuje tekstury bloków (16 x 16 pikseli) i wkleja je do atlasu
# assets/textures/blocks/terrain.png (miejsca kafelków - ATLAS_TILES
# w src/rendering/TextureAtlas.js).
#
# Jak powstaje tekstura:
#   1. "mapa wysokości" - wypukłości i wgłębienia faktury (grudki
#      ziemi, kamyki, warstwy skały, kryształy...),
#   2. światło z lewej góry: to, co wystaje, jest jaśniejsze z lewej
#      i od góry, a ciemniejsze z prawej i od dołu, szczeliny są
#      ciemne (cieniowanie),
#   3. kolor z krótkiej palety danego bloku (od cienia do światła) -
#      dzięki temu tekstura zostaje "pikselowa", ale bez przypadkowego
#      szumu: kolory przechodzą płynnie, pojedyncze piksele są
#      wygładzane.
# Wszystko jest liczone "w kółko" (prawa krawędź łączy się z lewą,
# dolna z górną), więc bloki obok siebie łączą się bez szwów.
#
# Bez zmian zostają: trawa z wierzchu, woda, rośliny, krzaki
# i przedmioty. Bok trawy dostaje nową ziemię pod tą samą trawą.
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/tekstury.py               wszystko do terrain.png
#     python tools/tekstury.py podglad.png   do tego podgląd (powiększony)
# Ten sam numer (SEED w każdej funkcji) = zawsze ta sama tekstura.
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image

N = 16

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ATLAS = os.path.join(ROOT, 'assets', 'textures', 'blocks', 'terrain.png')

# Gdzie w atlasie (kolumna, wiersz) - jak ATLAS_TILES w TextureAtlas.js.
TILES = {
    'grass_side': (1, 0), 'dirt': (2, 0), 'stone': (3, 0), 'lamp': (4, 0),
    'lepidolite': (5, 0), 'lamp_red': (6, 0), 'lamp_green': (7, 0),
    'lamp_blue': (8, 0), 'lamp_purple': (9, 0), 'meteorite': (10, 0),
    'sand': (11, 0), 'granite': (13, 0), 'limestone': (14, 0),
    'sandstone_side': (15, 0), 'sandstone_top': (0, 1), 'slate_side': (1, 1),
    'slate_top': (2, 1), 'basalt_side': (3, 1), 'basalt_top': (4, 1),
    'humus': (5, 1), 'coarse_dirt': (6, 1), 'forest_floor_top': (7, 1),
    'forest_floor_side': (8, 1), 'mud': (9, 1), 'clay': (10, 1), 'gravel': (11, 1)
}


# ------------------------------------------------------------
# Narzędzia: szum, komórki, światło, kolory
# ------------------------------------------------------------

YY, XX = np.mgrid[0:N, 0:N].astype(float)


def rng(seed):
    return np.random.default_rng(seed)


def noise(r, cells):
    """Gładki szum (powtarza się co 16 pikseli): cells x cells węzłów."""
    grid = r.random((cells, cells))
    pos = (np.arange(N) + 0.5) * cells / N - 0.5
    i0 = np.floor(pos).astype(int)
    f = pos - i0
    f = f * f * (3 - 2 * f)
    i0 %= cells
    i1 = (i0 + 1) % cells
    a = grid[np.ix_(i0, i0)]
    b = grid[np.ix_(i0, i1)]
    c = grid[np.ix_(i1, i0)]
    d = grid[np.ix_(i1, i1)]
    fy = f[:, None]
    fx = f[None, :]
    top = a * (1 - fx) + b * fx
    bottom = c * (1 - fx) + d * fx
    return top * (1 - fy) + bottom * fy


def fbm(r, octaves=((2, 0.5), (4, 0.3), (8, 0.2))):
    out = sum(noise(r, cells) * weight for cells, weight in octaves)
    return (out - out.min()) / (out.max() - out.min() + 1e-9)


def wrap_delta(a, b):
    d = np.abs(a - b) % N
    return np.minimum(d, N - d)


def cells(points):
    """Komórki (jak kamyki, kryształy): dla każdego piksela odległość do
    najbliższego punktu (d1), drugiego najbliższego (d2) i numer komórki."""
    px = XX + 0.5
    py = YY + 0.5
    dist = np.stack([np.hypot(wrap_delta(px, x), wrap_delta(py, y)) for x, y in points])
    order = np.argsort(dist, axis=0)
    d1 = np.take_along_axis(dist, order[:1], 0)[0]
    d2 = np.take_along_axis(dist, order[1:2], 0)[0]
    return d1, d2, order[0]


def scatter(r, count, min_gap):
    """Punkty rozrzucone w miarę równo (nie zbite w kupki)."""
    points = []
    tries = 0
    while len(points) < count and tries < 5000:
        tries += 1
        x, y = r.uniform(0, N, 2)
        if all(np.hypot(wrap_delta(x, a), wrap_delta(y, b)) >= min_gap for a, b in points):
            points.append((x, y))
    return points


def shift(a, dx, dy):
    return np.roll(np.roll(a, dy, axis=0), dx, axis=1)


def blur(a, passes=1):
    for _ in range(passes):
        a = (a * 4 + shift(a, 1, 0) + shift(a, -1, 0) + shift(a, 0, 1) + shift(a, 0, -1)) / 8
    return a


def light(height, strength=1.0):
    """Cieniowanie z mapy wysokości: światło z lewej góry. 0 = płasko,
    + jaśniej (zbocze do światła), - ciemniej."""
    gx = (shift(height, -1, 0) - shift(height, 1, 0)) / 2
    gy = (shift(height, 0, -1) - shift(height, 0, 1)) / 2
    # zbocze opadające w prawo / w dół = zwrócone do lewej góry
    return (-(gx * 0.7 + gy * 0.85)) * strength


def cavity(height, passes=2):
    """Wgłębienia (szczeliny) - ujemne, wypukłości - dodatnie."""
    return height - blur(height, passes)


def ramp(colors, t):
    """Kolor z palety (od ciemnego do jasnego), t = 0..1 - najbliższy
    stopień palety (bez mieszania - piksele zostają czyste)."""
    colors = np.array(colors, dtype=float)
    index = np.clip(np.round(np.clip(t, 0, 1) * (len(colors) - 1)), 0, len(colors) - 1).astype(int)
    return colors[index]


def smooth_index(index, passes=1):
    """Wygładzanie: pojedynczy piksel inny niż wszyscy sąsiedzi dostaje
    kolor sąsiadów (bez "pieprzu i soli")."""
    for _ in range(passes):
        n = [shift(index, 1, 0), shift(index, -1, 0), shift(index, 0, 1), shift(index, 0, -1)]
        same = n[0] == n[1]
        alone = (index != n[0]) & (index != n[1]) & (index != n[2]) & (index != n[3])
        mean = np.round((n[0] + n[1] + n[2] + n[3]) / 4).astype(int)
        index = np.where(alone & same & (n[2] == n[0]), n[0], np.where(alone, mean, index))
    return index


def paint(palette, t, smooth=1):
    """t (0..1) -> stopnie palety, wygładzone -> obraz RGB."""
    palette = np.array(palette, dtype=float)
    index = np.clip(np.round(np.clip(t, 0, 1) * (len(palette) - 1)), 0, len(palette) - 1).astype(int)
    index = smooth_index(index, smooth)
    return palette[index]


def normalize(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def mix(a, b, t):
    return np.array(a, float) * (1 - t) + np.array(b, float) * t


def shades(base, steps, dark=0.62, bright=1.22, warm=(1.0, 1.0, 1.0)):
    """Paleta od cienia do światła wokół koloru base (cienie lekko
    chłodniejsze / cieplejsze - warm = mnożnik koloru w cieniu)."""
    base = np.array(base, float)
    out = []
    for i in range(steps):
        k = dark + (bright - dark) * i / (steps - 1)
        c = base * k
        if k < 1:
            c = c * (np.array(warm) * (1 - k) + k) / 1
        out.append(np.clip(c, 0, 255))
    return out


def match(rgb, target):
    """Średni kolor tekstury = target (żeby z daleka blok wyglądał jak
    dawniej - daleki teren i mapa liczą kolory ze średniej)."""
    mean = rgb.reshape(-1, 3).mean(axis=0)
    return np.clip(rgb * (np.array(target, float) / np.maximum(mean, 1)), 0, 255)


def as_image(rgb):
    return Image.fromarray(np.clip(np.round(rgb), 0, 255).astype(np.uint8), 'RGB').convert('RGBA')


# ------------------------------------------------------------
# Ziemie
# ------------------------------------------------------------

DIRT = (150, 72, 18)


def soil(seed, base, clod_count=22, clod_gap=2.6, pebbles=4, pebble_color=(128, 116, 104),
         variation=0.18, steps=7, contrast=1.0, fibres=0, fibre_color=None):
    """Ziemia: grudki (zaokrąglone, oświetlone z lewej góry), szczeliny
    między nimi, trochę kamyczków."""
    r = rng(seed)
    points = scatter(r, clod_count, clod_gap)
    d1, d2, cell = cells(points)
    edge = d2 - d1
    height = np.clip(edge / 1.6, 0, 1) ** 0.6
    height += fbm(r) * 0.35
    tone_per_cell = r.uniform(-variation, variation, len(points))
    tone = 0.52 + tone_per_cell[cell] + light(height, 1.9 * contrast) + cavity(height) * 0.9 * contrast
    tone += (fbm(r, ((4, 0.6), (8, 0.4))) - 0.5) * 0.12
    palette = shades(base, steps, 0.6, 1.22, (0.9, 0.95, 1.12))
    rgb = paint(palette, normalize(tone) * 0.86 + 0.07)

    # kamyczki: 2-3 piksele, jasne od góry, ciemne pod spodem
    for _ in range(pebbles):
        x, y = r.integers(0, N, 2)
        shape = [(0, 0), (1, 0)] if r.random() < 0.6 else [(0, 0), (1, 0), (0, 1)]
        for dx, dy in shape:
            rgb[(y + dy) % N, (x + dx) % N] = np.array(pebble_color) * (1.12 if dy == 0 else 0.95)
        rgb[(y + 1 + (len(shape) == 3)) % N, x % N] = np.array(base) * 0.62
        rgb[y % N, (x + 2) % N] = rgb[y % N, (x + 2) % N] * 0.85

    for _ in range(fibres):
        x, y = r.integers(0, N, 2)
        length = r.integers(2, 4)
        dx = 1 if r.random() < 0.5 else -1
        for k in range(length):
            rgb[(y - k // 2) % N, (x + dx * k) % N] = fibre_color

    return rgb


def dirt():
    return soil(201, DIRT, pebbles=0)


def coarse_dirt():
    rgb = match(soil(203, (146, 74, 24), clod_count=20, pebbles=0, variation=0.2), (150, 72, 18))
    r = rng(2031)
    # kamyki: małe, zaokrąglone, w kolorze ziemi z szarością; jasne
    # z lewej góry, cień pod spodem
    shapes = [
        [(0, 0), (1, 0), (0, 1), (1, 1)],
        [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)],
        [(0, 0), (1, 0), (1, 1)],
        [(0, 0), (1, 0)],
    ]
    colors = [(132, 102, 80), (118, 94, 76), (140, 112, 90), (124, 104, 88)]
    for x, y in scatter(r, 7, 4.8):
        shape = shapes[r.integers(len(shapes))]
        color = np.array(colors[r.integers(len(colors))], float)
        cells_ = set(shape)
        for dx, dy in shape:
            lit = (dx - 1, dy) not in cells_ or (dx, dy - 1) not in cells_
            dark = (dx + 1, dy) not in cells_ or (dx, dy + 1) not in cells_
            k = 1.1 if lit and not dark else (0.86 if dark and not lit else 0.98)
            rgb[int(y + dy) % N, int(x + dx) % N] = color * k
        for dx, dy in shape:
            if (dx, dy + 1) not in cells_:
                py, px = int(y + dy + 1) % N, int(x + dx) % N
                rgb[py, px] = rgb[py, px] * 0.8
    return rgb


def humus():
    return soil(205, (66, 45, 30), clod_count=26, clod_gap=2.4, pebbles=0, variation=0.14,
                fibres=2, fibre_color=(96, 74, 50))


def mud():
    r = rng(209)
    base = (88, 60, 40)
    height = fbm(r, ((4, 0.6), (8, 0.4)))
    # mokre, gładkie: płytkie wgłębienia (kałuże) ciemniejsze
    puddle = np.clip((0.38 - height) * 3.0, 0, 1)
    tone = 0.55 + light(height, 1.4) - puddle * 0.3 + (fbm(r, ((2, 1.0),)) - 0.5) * 0.15
    palette = shades(base, 6, 0.66, 1.2, (0.9, 0.95, 1.1))
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    # połysk wilgoci: kilka małych refleksów na wypukłościach
    lit = light(height, 1.4) + height * 0.2
    for y, x in np.argwhere(lit > np.quantile(lit, 0.97))[:6]:
        rgb[y, x] = mix(rgb[y, x], (178, 152, 130), 0.5)
    return rgb


def clay():
    r = rng(211)
    base = (170, 141, 106)
    # gładka, lekko smużona (poziomo) - jak wygładzona dłonią
    streak = noise(r, 2) * 0.5 + noise(r, 4) * 0.3
    streak = np.repeat(streak.mean(axis=1, keepdims=True), N, axis=1) * 0.7 + fbm(r) * 0.3
    height = blur(streak, 1)
    tone = 0.5 + (normalize(height) - 0.5) * 0.4 + light(height, 2.2)
    palette = shades(base, 6, 0.8, 1.12, (0.95, 0.97, 1.05))
    return paint(palette, np.clip(tone, 0, 1), 2)


def forest_litter(seed, rgb, top_rows=None):
    """Ściółka: liście (brązowe, rude, oliwkowe), patyczki, mech - każdy
    liść jasny od lewej góry, z cieniem pod spodem."""
    r = rng(seed)
    colors = [(132, 88, 46), (116, 78, 42), (144, 104, 56), (106, 98, 52), (124, 92, 50)]
    shapes = [
        [(1, 0), (2, 0), (0, 1), (1, 1), (2, 1), (3, 1), (1, 2), (2, 2)],
        [(2, 0), (1, 1), (2, 1), (0, 2), (1, 2), (2, 2), (1, 3)],
        [(0, 0), (1, 0), (1, 1), (2, 1), (3, 1), (3, 2)],
    ]
    limit = N if top_rows is None else top_rows
    points = scatter(r, 9 if top_rows is None else 5, 4.4)
    for x0, y0 in points:
        x0 = int(x0)
        y0 = int(y0) if top_rows is None else int(r.integers(0, max(1, limit - 2)))
        shape = shapes[r.integers(len(shapes))]
        if r.random() < 0.5:
            shape = [(3 - x, y) for x, y in shape]
        cells_ = set(shape)
        color = np.array(colors[r.integers(len(colors))], float)
        for x, y in shape:
            if top_rows is not None and y0 + y > limit:
                continue
            lit = (x - 1, y) not in cells_ or (x, y - 1) not in cells_
            dark = (x + 1, y) not in cells_ or (x, y + 1) not in cells_
            k = 1.1 if lit and not dark else (0.86 if dark and not lit else 0.98)
            rgb[(y0 + y) % N, (x0 + x) % N] = color * k
        for x, y in shape:
            if (x, y + 1) not in cells_ and (top_rows is None or y0 + y + 1 <= limit):
                py, px = (y0 + y + 1) % N, (x0 + x) % N
                rgb[py, px] = rgb[py, px] * 0.75
    # patyczki
    for _ in range(2 if top_rows is None else 1):
        x, y = int(r.integers(0, N)), int(r.integers(0, limit))
        for k in range(3):
            rgb[y % N, (x + k) % N] = (96, 66, 40) if k else (112, 80, 50)
    # mech
    for x, y in scatter(r, 3 if top_rows is None else 1, 6):
        x, y = int(x), int(y) % limit
        for dx, dy, c in [(0, 0, (96, 118, 50)), (1, 0, (84, 106, 44)), (0, 1, (78, 98, 42))]:
            rgb[(y + dy) % N, (x + dx) % N] = c
    return rgb


def forest_floor_top():
    base = soil(213, (92, 64, 38), clod_count=24, pebbles=0, variation=0.1)
    return forest_litter(2131, base)


def forest_floor_side():
    rgb = soil(215, (142, 70, 20), clod_count=22, pebbles=2)
    # u góry ciemniejsza warstwa próchnicy i ściółka
    top = soil(2151, (82, 56, 34), clod_count=24, pebbles=0, variation=0.1)
    edge = 4 + (noise(rng(2152), 4)[0] * 3).astype(int)
    for x in range(N):
        rgb[:edge[x], x] = top[:edge[x], x]
        rgb[edge[x], x] = rgb[edge[x], x] * 0.75
    return forest_litter(2153, rgb, top_rows=3)


# ------------------------------------------------------------
# Piasek, żwir
# ------------------------------------------------------------

def sand():
    r = rng(221)
    base = (220, 204, 152)
    # łagodne zmarszczki od wiatru (fale ukośne) + drobne ziarno
    phase = fbm(r, ((2, 0.7), (4, 0.3))) * 2.2
    ripples = np.sin((YY + XX * 0.25) / N * 2 * np.pi * 3 + phase)
    height = ripples * 0.45 + fbm(r, ((4, 0.5), (8, 0.5))) * 0.4
    tone = 0.55 + light(height, 0.55) + (fbm(r, ((8, 0.6), (16, 0.4))) - 0.5) * 0.25
    palette = shades(base, 6, 0.82, 1.08, (0.96, 0.95, 1.02))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    # pojedyncze ciemniejsze i jaśniejsze ziarenka (rzadko)
    for x, y in scatter(r, 7, 4):
        rgb[int(y), int(x)] = np.array(base) * (0.84 if r.random() < 0.6 else 1.07)
    return rgb


def gravel():
    r = rng(225)
    points = scatter(r, 15, 3.2)
    d1, d2, cell = cells(points)
    # kamyki: kopułki, szczeliny między nimi ciemne
    dome = np.clip((d2 - d1) / 2.2, 0, 1) ** 0.5
    stones = [(128, 122, 116), (112, 104, 98), (142, 134, 124), (104, 98, 96), (134, 118, 102), (120, 112, 108)]
    color = np.array([stones[i % len(stones)] for i in r.permutation(len(points))], float)[cell]
    tone = 0.55 + light(dome, 1.6) + (dome - 0.6) * 0.5
    k = np.clip(0.62 + tone * 0.7, 0.5, 1.35)
    k = np.round(k * 6) / 6          # kilka stopni jasności - czyste piksele
    rgb = color * k[..., None]
    gap = (d2 - d1) < 0.55
    rgb[gap] = np.array((70, 64, 60))
    return rgb


# ------------------------------------------------------------
# Kamień i skały
# ------------------------------------------------------------

def stone():
    r = rng(231)
    base = (154, 136, 122)
    # skała: plamy (kolor), drobne guzki (cieniowane) i kilka cienkich rys
    mottle = fbm(r, ((2, 0.4), (4, 0.6)))
    points = scatter(r, 18, 3.0)
    d1, d2, cell = cells(points)
    lumps = np.clip((d2 - d1) / 1.8, 0, 1) ** 0.7 + fbm(r, ((8, 1.0),)) * 0.3
    crack_points = scatter(r, 6, 6.0)
    c1, c2, ccell = cells(crack_points)
    crack = (c2 - c1 < 0.7) & (r.random(len(crack_points)) < 0.6)[ccell]
    height = lumps - crack * 0.6
    tone = 0.5 + (mottle - 0.5) * 0.35 + light(height, 0.75) + cavity(height, 1) * 0.45
    palette = shades(base, 7, 0.7, 1.16, (0.95, 0.97, 1.06))
    return paint(palette, np.clip(tone, 0, 1), 1)


def granite():
    r = rng(241)
    # kryształy: różowy skaleń, jasny kwarc, ciemna mika
    points = scatter(r, 22, 2.6)
    d1, d2, cell = cells(points)
    kinds = r.choice([0, 0, 0, 0, 1, 1, 2], len(points))
    colors = np.array([(180, 150, 142), (192, 182, 174), (140, 126, 124)], float)
    color = colors[kinds][cell]
    facet = np.clip((d2 - d1) / 2.0, 0, 1)
    tone = 0.98 + light(facet, 0.25) + (fbm(r, ((4, 1.0),)) - 0.5) * 0.06
    tone = np.round(tone * 12) / 12
    rgb = color * tone[..., None]
    rgb[(d2 - d1) < 0.3] *= 0.94
    return rgb


def limestone():
    r = rng(251)
    base = (203, 196, 176)
    layers = np.sin((YY + noise(r, 4) * 2.5) / N * 2 * np.pi * 2) * 0.5 + fbm(r) * 0.6
    tone = 0.55 + (normalize(layers) - 0.5) * 0.35 + light(layers, 0.7)
    palette = shades(base, 6, 0.84, 1.08, (0.96, 0.97, 1.04))
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    # drobne jamki: ciemniejszy piksel, jasny brzeg pod nim
    for x, y in scatter(r, 3, 6.5):
        x, y = int(x), int(y)
        rgb[y, x] = np.array(base) * 0.86
        rgb[(y + 1) % N, x] = np.array(base) * 1.04
    # odcisk muszelki (ledwo widoczny)
    for x, y in [(9, 9), (10, 8), (11, 8), (12, 9), (10, 10), (11, 10)]:
        rgb[y, x] = rgb[y, x] * 0.93
    return rgb


def strata(r, bands, wobble=1.2):
    """Warstwy skały osadowej: numer warstwy dla każdego wiersza
    (z falowaniem) i pozycja wewnątrz warstwy (0 = góra, 1 = dół)."""
    edges = np.cumsum(bands)
    edges = edges * N / edges[-1]
    wave = (noise(r, 2) - 0.5) * wobble * 2
    y = (YY + wave) % N
    index = np.searchsorted(edges, y, side='right') % len(bands)
    start = np.concatenate([[0], edges[:-1]])
    inside = (y - start[index]) / (edges[index] - start[index])
    return index, inside


def sandstone_side():
    r = rng(261)
    colors = [(220, 178, 122), (206, 162, 106), (226, 188, 134), (212, 168, 112), (200, 156, 102)]
    index, inside = strata(r, [3, 4, 2, 4, 3])
    color = np.array(colors, float)[index]
    # każda warstwa lekko wystaje: jaśniejsza u góry, ciemniejsza na dole
    k = 1.06 - inside * 0.12 + (fbm(r, ((4, 0.5), (8, 0.5))) - 0.5) * 0.1
    k = np.round(k * 14) / 14
    rgb = color * k[..., None]
    for x, y in scatter(r, 5, 5):
        rgb[int(y), int(x)] *= 0.88
    return rgb


def sandstone_top():
    r = rng(263)
    base = (220, 178, 122)
    height = fbm(r)
    tone = 0.55 + (height - 0.5) * 0.3 + light(height, 0.8) + (fbm(r, ((8, 1.0),)) - 0.5) * 0.15
    palette = shades(base, 5, 0.88, 1.07, (0.97, 0.96, 1.02))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    for x, y in scatter(r, 5, 5):
        rgb[int(y), int(x)] *= 0.9
    return rgb


def slate_side():
    r = rng(271)
    base = (86, 92, 104)
    index, inside = strata(r, [2, 3, 2, 2, 3, 2, 2], wobble=0.6)
    offset = r.uniform(-0.08, 0.08, 7)[index]
    # cienkie płyty: jasna górna krawędź, ciemna szczelina na dole
    k = 1.0 + offset + np.where(inside < 0.3, 0.14, 0) - np.where(inside > 0.72, 0.2, 0)
    # pęknięcia w poprzek płyt
    breaks = r.integers(0, N, 7)[index]
    k = np.where((XX == breaks) & (inside > 0.25), k - 0.18, k)
    k = np.round(k * 10) / 10
    return np.array(base, float) * k[..., None] * np.array([1.0, 1.0, 1.03])


def slate_top():
    r = rng(273)
    base = (90, 96, 108)
    height = fbm(r, ((4, 0.5), (8, 0.5)))
    tone = 0.55 + (fbm(r, ((2, 1.0),)) - 0.5) * 0.3 + light(height, 0.5)
    palette = shades(base, 5, 0.88, 1.1, (1.0, 1.0, 1.05))
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    # delikatne linie łupliwości
    for y0 in (4, 12):
        for x in range(N):
            if r.random() < 0.6:
                rgb[y0, x] *= 0.93
    return rgb


def basalt_side():
    r = rng(281)
    base = (64, 64, 69)
    # słupy bazaltowe: 4 kolumny, każda ścianka oświetlona z lewej
    widths = [4, 4, 4, 4]
    column = np.zeros((N, N), int)
    pos = np.zeros((N, N))
    x = 0
    for i, w in enumerate(widths):
        column[:, x:x + w] = i
        pos[:, x:x + w] = (np.arange(w) + 0.5) / w
        x += w
    tone_col = r.uniform(-0.05, 0.05, len(widths))[column]
    k = 1.0 + tone_col + (0.5 - pos) * 0.22
    k = np.where(pos < 0.2, k + 0.08, k)
    # poziome spękania na różnych wysokościach w każdej kolumnie
    joints = [sorted(r.choice(N, 2, replace=False)) for _ in widths]
    for i, js in enumerate(joints):
        for j in js:
            k[j, i * 4:(i + 1) * 4] -= 0.25
            k[(j + 1) % N, i * 4:(i + 1) * 4] += 0.08
    k[:, [3, 7, 11, 15]] -= 0.2
    k = np.round(k * 10) / 10
    return np.array(base, float) * k[..., None]


def basalt_top():
    r = rng(283)
    base = (62, 62, 67)
    # przekroje słupów: sześciokąty (komórki), ciemne fugi
    points = [((x * 16 / 3 + (2.7 if y % 2 else 0) + r.uniform(-0.9, 0.9)) % N,
               (y * 16 / 3 + r.uniform(-0.9, 0.9)) % N) for y in range(3) for x in range(3)]
    d1, d2, cell = cells(points)
    dome = np.clip((d2 - d1) / 3.0, 0, 1)
    tone_cell = r.uniform(-0.06, 0.06, len(points))[cell]
    k = 0.98 + tone_cell + light(dome, 0.5)
    k = np.where((d2 - d1) < 0.6, 0.66, k)
    k = np.round(k * 10) / 10
    return np.array(base, float) * k[..., None]


def lepidolite():
    r = rng(291)
    base = (180, 160, 210)
    height = fbm(r)
    tone = 0.5 + (height - 0.5) * 0.45 + light(height, 1.2)
    palette = shades(base, 6, 0.74, 1.14, (1.0, 0.95, 1.08))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    # łuski miki: krótkie skośne kreski z błyskiem
    for x, y in scatter(r, 9, 3.6):
        x, y = int(x), int(y)
        rgb[y, x] = (236, 226, 246)
        rgb[y, (x + 1) % N] = (214, 200, 234)
        rgb[(y + 1) % N, (x + 1) % N] = np.array(base) * 0.78
    return rgb


def meteorite():
    r = rng(301)
    base = (58, 46, 44)
    # wgłębienia jak odciski palców (regmaglipty): cień u góry z lewej
    points = scatter(r, 8, 4.6)
    d1, d2, cell = cells(points)
    bowl = -np.clip(1 - d1 / 3.4, 0, 1) ** 1.5
    tone = 0.55 + light(bowl, 1.4) + bowl * 0.15 + (fbm(r, ((8, 1.0),)) - 0.5) * 0.15
    palette = shades(base, 6, 0.7, 1.35, (1.0, 1.0, 1.0))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    # żarzące się żyłki na granicach - środek jasny, brzeg ciemnoczerwony
    vein = (d2 - d1)
    keep = r.random(len(points)) < 0.4
    hot = (vein < 0.45) & keep[cell]
    glow = (vein < 1.1) & ~hot & keep[cell]
    rgb[glow] = mix(rgb[glow], (130, 40, 16), 0.5)
    rgb[hot] = np.where((vein[hot] < 0.25)[:, None], (255, 200, 90), (240, 120, 36))
    return rgb


# ------------------------------------------------------------
# Lampy
# ------------------------------------------------------------

def lamp(color, glass):
    """Lampa: ramka w kolorze światła (wypukła - jasna z lewej góry),
    w środku szkło świecące mocniej w środku."""
    color = np.array(color, float)
    glass = np.array(glass, float)
    rgb = np.zeros((N, N, 3))
    cx = cy = 7.5
    dist = np.hypot(XX - cx, YY - cy) / 7.5
    inner = mix(glass, (255, 255, 248), 0.0)
    k = np.clip(1.12 - dist * 0.16, 0, 2)
    rgb[:] = np.clip(inner * k[..., None], 0, 255)
    # szklany błysk ukośny w lewym górnym rogu
    streak = (np.abs((XX - YY)) < 1.0) & (XX < 7) & (XX > 2)
    rgb[streak] = mix(rgb[streak], (255, 255, 255), 0.45)
    # ramka 2 px
    frame = (XX < 2) | (XX > 13) | (YY < 2) | (YY > 13)
    rgb[frame] = color
    rgb[(XX == 0) | (YY == 0)] = mix(color, (255, 255, 255), 0.32)
    rgb[(XX == 15) | (YY == 15)] = color * 0.8
    rgb[((XX == 1) & (YY > 0) & (YY < 15)) | ((YY == 1) & (XX > 0) & (XX < 15))] = color * 1.0
    rgb[((XX == 14) & (YY > 0) & (YY < 15)) | ((YY == 14) & (XX > 0) & (XX < 15))] = color * 0.86
    # wewnętrzny cień przy ramce (szkło jest w środku, trochę głębiej)
    rgb[(YY == 2) & (XX > 1) & (XX < 14)] *= 0.9
    rgb[(XX == 2) & (YY > 1) & (YY < 14)] *= 0.93
    # nity w rogach
    for x, y in [(0, 0), (15, 0), (0, 15), (15, 15)]:
        rgb[y, x] = color * 0.8
    return rgb


LAMPS = {
    'lamp': ((236, 112, 28), (246, 214, 186)),
    'lamp_red': ((222, 48, 48), (252, 196, 192)),
    'lamp_green': ((50, 186, 64), (196, 246, 198)),
    'lamp_blue': ((52, 104, 226), (196, 214, 252)),
    'lamp_purple': ((150, 76, 216), (228, 200, 252)),
}


# ------------------------------------------------------------
# Bok trawy: ta sama trawa, nowa ziemia pod nią
# ------------------------------------------------------------

def grass_side(atlas, new_dirt):
    x, y = TILES['grass_side']
    old = np.array(atlas.crop((x * N, y * N, x * N + N, y * N + N)).convert('RGB'), float)
    r, g, b = old[..., 0], old[..., 1], old[..., 2]
    green = (g > r * 0.95) & (g > b * 1.3)
    rgb = new_dirt.copy()
    rgb[green] = old[green]
    # cień pod trawą na ziemi
    for xx in range(N):
        column = np.where(green[:, xx])[0]
        if len(column):
            below = column.max() + 1
            if below < N and not green[below, xx]:
                rgb[below, xx] *= 0.78
    return rgb


# ------------------------------------------------------------

# Średni kolor każdej tekstury (jak w starych teksturach - ten sam
# wygląd z daleka; ziemia trochę mniej jaskrawa).
TARGET = {
    'dirt': (150, 70, 16), 'humus': (63, 44, 30), 'mud': (86, 59, 40),
    'clay': (172, 142, 104), 'forest_floor_top': (116, 80, 38), 'forest_floor_side': (140, 70, 18),
    'sand': (220, 205, 152), 'gravel': (111, 103, 95), 'stone': (154, 136, 122), 'granite': (174, 149, 142),
    'limestone': (202, 195, 176), 'sandstone_side': (215, 172, 116), 'sandstone_top': (219, 176, 119),
    'slate_side': (86, 92, 103), 'slate_top': (90, 96, 107), 'basalt_side': (62, 62, 67),
    'basalt_top': (60, 60, 65), 'lepidolite': (190, 175, 220), 'meteorite': (72, 52, 45),
}


def generate():
    out = {
        'dirt': dirt(), 'coarse_dirt': coarse_dirt(), 'humus': humus(), 'mud': mud(), 'clay': clay(),
        'forest_floor_top': forest_floor_top(), 'forest_floor_side': forest_floor_side(),
        'sand': sand(), 'gravel': gravel(), 'stone': stone(), 'granite': granite(),
        'limestone': limestone(), 'sandstone_side': sandstone_side(), 'sandstone_top': sandstone_top(),
        'slate_side': slate_side(), 'slate_top': slate_top(), 'basalt_side': basalt_side(),
        'basalt_top': basalt_top(), 'lepidolite': lepidolite(), 'meteorite': meteorite(),
    }
    for name, rgb in out.items():
        if name in TARGET:
            out[name] = match(rgb, TARGET[name])
    for name, (frame, glass) in LAMPS.items():
        out[name] = lamp(frame, glass)
    return out


def main():
    atlas = Image.open(ATLAS).convert('RGBA')
    tiles = generate()
    tiles['grass_side'] = grass_side(atlas, tiles['dirt'])
    for name, rgb in tiles.items():
        x, y = TILES[name]
        atlas.paste(as_image(rgb), (x * N, y * N))
    atlas.save(ATLAS)
    print('Gotowe:', len(tiles), 'tekstur w', os.path.relpath(ATLAS, ROOT))
    if len(sys.argv) > 1:
        preview(atlas, tiles, sys.argv[1])


def preview(atlas, tiles, path):
    scale = 8
    names = list(tiles)
    columns = 7
    rows = (len(names) + columns - 1) // columns
    sheet = Image.new('RGB', (columns * (N * scale * 2 + 12), rows * (N * scale + 12)), (40, 40, 46))
    for i, name in enumerate(names):
        tile = as_image(tiles[name]).convert('RGB')
        big = tile.resize((N * scale, N * scale), Image.NEAREST)
        tiled = Image.new('RGB', (N * 4, N * 4))
        for a in range(4):
            for b in range(4):
                tiled.paste(tile, (a * N, b * N))
        tiled = tiled.resize((N * scale, N * scale), Image.NEAREST)
        x = (i % columns) * (N * scale * 2 + 12)
        y = (i // columns) * (N * scale + 12)
        sheet.paste(big, (x, y))
        sheet.paste(tiled, (x + N * scale + 4, y))
    sheet.save(path)


if __name__ == '__main__':
    main()
