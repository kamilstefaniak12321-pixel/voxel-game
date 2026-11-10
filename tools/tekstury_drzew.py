# ------------------------------------------------------------
# TEKSTURY DRZEW
#
# Rysuje tekstury sześciu gatunków drzew (świerk, sosna, buk, lipa,
# dąb, brzoza) i ich dodatków i wkleja je do atlasu
# assets/textures/drzewa.png (miejsca regionów: assets/textures/atlas.json,
# układ roboczy kafelków zachowany, bloki: src/blocks/trees.js).
#
# Ten sam styl co tools/tekstury.py (z niego są narzędzia: szum,
# komórki, światło z lewej góry, palety):
#   - kora: płytki, łuski albo bruzdy (mapa wysokości) oświetlone
#     z lewej góry, szczeliny ciemne,
#   - słoje: pierścienie od środka pnia, kora dookoła,
#   - deski: autorski wzorzec z terrain.png (od 0.70.0), cztery
#     spokojne pasy i przesunięte łączenia; zmienia się paleta gatunku,
#   - liście: pojedyncze listki / igły z cieniem, prześwity są
#     przezroczyste (w grze widać przez nie głąb korony),
#   - sadzonki i przedmioty: obrazki z przezroczystym tłem, przedmioty
#     z ciemnym obrysem (jak owoce w wierszu 4).
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/tekstury_drzew.py               do drzewa.png
#     python tools/tekstury_drzew.py podglad.png   do tego podgląd
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image
from atlasy import read_texture, write_texture

# ATLAS jest roboczą kompozycją kafelków; zapis trafia do arkuszy tematycznych.

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tekstury import (  # noqa: E402
    N, ATLAS, ROOT, XX, YY, rng, noise, fbm, cells, scatter, shift, blur,
    light, cavity, paint, normalize, mix, shades, match, wrap_delta
)


TREES = ['spruce', 'pine', 'beech', 'linden', 'oak', 'birch']

# Gdzie w atlasie (kolumna, wiersz) - jak ATLAS_TILES w TextureAtlas.js.
TILES = {}
for i, s in enumerate(TREES):
    TILES[f'{s}_log_side'] = (i * 2, 5)
    TILES[f'{s}_log_top'] = (i * 2 + 1, 5)
    TILES[f'{s}_stripped_side'] = (i * 2, 6)
    TILES[f'{s}_stripped_top'] = (i * 2 + 1, 6)
    TILES[f'{s}_planks'] = (i, 7)
    TILES[f'{s}_leaves'] = (6 + i, 7)
    TILES[f'{s}_sapling'] = (i, 8)
TILES.update({
    'pine_log_upper_side': (12, 5), 'pine_log_resin_side': (13, 5),
    'linden_leaves_flowering': (12, 7), 'beech_leaf_litter': (13, 7),
    'oak_leaf_litter': (14, 7), 'spruce_wreath': (15, 7),
    'spruce_cone': (6, 8), 'pine_cone': (7, 8), 'resin': (8, 8),
    'beechnuts': (9, 8), 'linden_flower': (10, 8), 'acorn': (11, 8),
    'birch_bark': (12, 8), 'axe': (13, 8),
})


# ------------------------------------------------------------
# Narzędzia: obraz z przezroczystością (RGBA jako float)
# ------------------------------------------------------------

def rgba(rgb, alpha=None):
    out = np.zeros((N, N, 4))
    out[..., :3] = rgb
    out[..., 3] = 255 if alpha is None else alpha
    return out


def empty():
    return np.zeros((N, N, 4))


def put(img, x, y, color, a=255):
    if 0 <= x < N and 0 <= y < N:
        img[y, x, :3] = color
        img[y, x, 3] = a


def neighbors4(mask, wrap=False):
    if wrap:
        return [shift(mask, 1, 0), shift(mask, -1, 0), shift(mask, 0, 1), shift(mask, 0, -1)]
    pad = np.pad(mask, 1)
    return [pad[1:-1, :-2], pad[1:-1, 2:], pad[:-2, 1:-1], pad[2:, 1:-1]]


def depth_map(mask):
    """Jak głęboko w kształcie (0 na brzegu, rośnie do środka) - do
    wypukłości przedmiotów."""
    depth = np.zeros((N, N))
    current = mask.copy()
    k = 0
    while current.any() and k < 10:
        depth[current] += 1
        n = neighbors4(current)
        current = current & n[0] & n[1] & n[2] & n[3]
        k += 1
    return depth


def outline(img, factor=0.42, color=None):
    """Ciemny obrys dookoła kształtu (przedmioty, jak owoce w atlasie)."""
    solid = img[..., 3] > 0
    out = img.copy()
    pad = np.pad(img, ((1, 1), (1, 1), (0, 0)))
    for dy, dx in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
        neighbor = pad[1 + dy:N + 1 + dy, 1 + dx:N + 1 + dx]
        edge = (~solid) & (neighbor[..., 3] > 0) & (out[..., 3] == 0)
        out[edge, :3] = neighbor[edge, :3] * factor if color is None else color
        out[edge, 3] = 255
    return out


def shade_shape(mask, palette, height=None, strength=1.4, base=0.55, extra=None, smooth=1):
    """Kształt (maska) pomalowany paletą, wypukły (jaśniejszy z lewej
    góry, ciemniejszy z prawej i od dołu)."""
    if height is None:
        height = np.sqrt(depth_map(mask))
    lit = np.zeros((N, N))
    gx = np.zeros((N, N))
    gy = np.zeros((N, N))
    hp = np.pad(height, 1, mode='edge')
    gx = (hp[1:-1, 2:] - hp[1:-1, :-2]) / 2
    gy = (hp[2:, 1:-1] - hp[:-2, 1:-1]) / 2
    lit = -(gx * 0.7 + gy * 0.85) * strength
    t = base + lit + (0 if extra is None else extra)
    rgb = paint(palette, np.clip(t, 0, 1), smooth)
    img = empty()
    img[mask, :3] = rgb[mask]
    img[mask, 3] = 255
    return img


def ellipse(cx, cy, rx, ry, angle=0.0):
    ca, sa = np.cos(angle), np.sin(angle)
    px = XX + 0.5 - cx
    py = YY + 0.5 - cy
    u = px * ca + py * sa
    v = -px * sa + py * ca
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1


def line_cells(x0, y0, x1, y1):
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
    return [(int(round(x0 + (x1 - x0) * t / max(1, steps - 1))), int(round(y0 + (y1 - y0) * t / max(1, steps - 1))))
            for t in range(steps)]


def as_image(img):
    data = np.clip(np.round(img), 0, 255).astype(np.uint8)
    return Image.fromarray(data, 'RGBA')


def opaque(rgb):
    return rgba(rgb)


# ------------------------------------------------------------
# Kolory gatunków
# ------------------------------------------------------------

BARK = {
    'spruce': (104, 72, 52),
    'pine': (92, 70, 58),
    'beech': (150, 148, 138),
    'linden': (94, 86, 76),
    'oak': (90, 66, 46),
    'birch': (226, 222, 208),
}

WOOD = {
    'spruce': (206, 172, 120),
    'pine': (214, 170, 108),
    'beech': (204, 152, 116),
    'linden': (222, 202, 160),
    'oak': (178, 132, 80),
    'birch': (230, 212, 172),
}

# Środek pnia (twardziel) - ciemniejszy u sosny i dębu.
HEART = {
    'spruce': (196, 160, 108),
    'pine': (186, 124, 72),
    'beech': (192, 138, 104),
    'linden': (212, 188, 146),
    'oak': (146, 102, 58),
    'birch': (220, 200, 160),
}

PLANKS = {
    'spruce': (150, 108, 68),
    'pine': (204, 158, 98),
    'beech': (196, 140, 104),
    'linden': (214, 192, 148),
    'oak': (164, 118, 70),
    'birch': (220, 198, 150),
}

LEAVES = {
    'spruce': (44, 86, 58),
    'pine': (58, 98, 48),
    'beech': (82, 142, 50),
    'linden': (92, 150, 56),
    'oak': (70, 124, 42),
    'birch': (128, 176, 70),
}


# ------------------------------------------------------------
# Kora (bok pnia)
# ------------------------------------------------------------

def stretched_cells(r, count, gap, stretch):
    """Komórki wydłużone w pionie (płytki kory): punkty rozrzucone
    w ściśniętej przestrzeni."""
    points = scatter(r, count, gap)
    px = XX + 0.5
    py = (YY + 0.5) / stretch
    dist = np.stack([np.hypot(wrap_delta(px, x), np.minimum(np.abs(py - y / stretch) % (N / stretch),
                                                             N / stretch - np.abs(py - y / stretch) % (N / stretch)))
                     for x, y in points])
    order = np.argsort(dist, axis=0)
    d1 = np.take_along_axis(dist, order[:1], 0)[0]
    d2 = np.take_along_axis(dist, order[1:2], 0)[0]
    return d1, d2, order[0], len(points)


def plates_bark(seed, base, count=10, gap=3.4, stretch=2.0, crack=0.55, crack_color=None, variation=0.1,
                steps=7, contrast=1.0):
    """Kora z płytek (sosna, świerk): wypukłe płytki, ciemne szczeliny."""
    r = rng(seed)
    d1, d2, cell, n = stretched_cells(r, count, gap, stretch)
    edge = d2 - d1
    height = np.clip(edge / 1.4, 0, 1) ** 0.6 + fbm(r, ((4, 0.5), (8, 0.5))) * 0.25
    tone = 0.55 + r.uniform(-variation, variation, n)[cell] + light(height, 1.6 * contrast) + cavity(height) * 0.6
    palette = shades(base, steps, 0.58, 1.25, (0.95, 0.95, 1.08))
    rgb = paint(palette, np.clip(normalize(tone) * 0.86 + 0.07, 0, 1))
    gaps = edge < crack
    rgb[gaps] = np.array(crack_color if crack_color else np.array(base) * 0.5)
    return rgb


def furrow_bark(seed, base, ridges=4, depth=1.0, steps=7, variation=0.08, wobble=1.4, cross=0.0):
    """Kora z pionowymi bruzdami (dąb, lipa): grzbiety i głębokie rowki,
    rowki się rozgałęziają."""
    r = rng(seed)
    wave = (noise(r, 4) - 0.5) * wobble * 2 + (noise(r, 8) - 0.5) * wobble * 0.6
    x = (XX + wave) / N * ridges
    ridge = 1 - np.abs(np.sin(np.pi * x)) ** 0.7
    # rowki czasem się łączą (poprzeczne mostki)
    bridges = np.clip(np.sin((YY + noise(r, 2) * 6) / N * 2 * np.pi * 3) * 1.4 - 0.9, 0, 1) * cross
    height = np.clip(1 - ridge + bridges, 0, 1) * depth + fbm(r, ((4, 0.5), (8, 0.5))) * 0.3
    tone = 0.5 + light(height, 1.5) + cavity(height, 1) * 0.8 + (height - 0.5) * 0.3
    tone += (fbm(r, ((2, 1.0),)) - 0.5) * variation * 2
    palette = shades(base, steps, 0.55, 1.22, (0.95, 0.95, 1.06))
    return paint(palette, np.clip(normalize(tone) * 0.88 + 0.06, 0, 1))


def spruce_log_side():
    # drobne, zaokrąglone łuski, szarobrązowe
    rgb = plates_bark(501, BARK['spruce'], count=16, gap=2.8, stretch=1.3, crack=0.45, variation=0.12)
    return match(rgb, (100, 72, 54))


def pine_log_side():
    # dół pnia sosny: grube, ciemne płyty, w szczelinach rudawo
    rgb = plates_bark(511, BARK['pine'], count=8, gap=4.0, stretch=2.2, crack=0.7, crack_color=(70, 40, 30),
                      variation=0.1, contrast=1.1)
    return match(rgb, (90, 68, 56))


def pine_log_upper_side():
    # góra pnia sosny: cienka, łuszcząca się, rudopomarańczowa kora
    r = rng(521)
    base = (196, 112, 62)
    rows = (YY + noise(r, 4) * 3) / N * 7
    flake = np.abs(np.sin(np.pi * rows + noise(r, 8) * 2.0))
    height = flake * 0.7 + fbm(r, ((4, 0.5), (8, 0.5))) * 0.5
    tone = 0.55 + light(height, 1.2) + (fbm(r, ((2, 1.0),)) - 0.5) * 0.2
    palette = shades(base, 6, 0.7, 1.2, (1.0, 0.92, 0.9))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    # brzegi płatków - jaśniejsze, odstające; ciemne krótkie rysy
    for x, y in scatter(r, 6, 4.5):
        x, y = int(x), int(y)
        for k in range(3):
            rgb[y, (x + k) % N] = (226, 156, 104)
        rgb[(y + 1) % N, x] = (150, 76, 44)
        rgb[(y + 1) % N, (x + 1) % N] = (150, 76, 44)
    return match(rgb, (192, 112, 64))


def pine_log_resin_side():
    # dół pnia sosny z wyciekającą żywicą (bursztynowe krople i zacieki)
    rgb = pine_log_side()
    r = rng(531)
    for x0, y0, length in [(4, 3, 5), (11, 8, 4)]:
        for k in range(length):
            y = y0 + k
            w = 2 if k < length - 1 else 1
            for dx in range(w):
                c = (232, 160, 40) if dx == 0 else (196, 112, 24)
                if k == 0:
                    c = (250, 204, 96) if dx == 0 else (220, 140, 30)
                rgb[y % N, (x0 + dx) % N] = c
        # kropla na dole zacieku
        rgb[(y0 + length) % N, x0] = (176, 92, 20)
        rgb[(y0 + 1) % N, x0] = (255, 232, 150)
    return rgb


def beech_log_side():
    # gładka, szara kora z jasnymi i ciemnymi plamkami (porosty)
    r = rng(541)
    base = BARK['beech']
    mottle = fbm(r, ((2, 0.5), (4, 0.5)))
    height = fbm(r, ((4, 0.4), (8, 0.6))) * 0.5
    tone = 0.55 + (mottle - 0.5) * 0.35 + light(height, 0.6)
    palette = shades(base, 6, 0.8, 1.12, (0.96, 0.98, 1.04))
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    # porosty: zielonkawe i jasne plamki
    for x, y in scatter(r, 4, 5):
        x, y = int(x), int(y)
        for dx, dy in [(0, 0), (1, 0), (0, 1)]:
            rgb[(y + dy) % N, (x + dx) % N] = mix(rgb[(y + dy) % N, (x + dx) % N], (150, 168, 120), 0.45)
    # poziome, ledwo widoczne kreski
    for x, y in scatter(r, 5, 5):
        x, y = int(x), int(y)
        rgb[y, x] *= 0.9
        rgb[y, (x + 1) % N] *= 0.9
    return match(rgb, (148, 146, 136))


def linden_log_side():
    # ciemna kora z płytkimi, pionowymi bruzdami (siateczka)
    rgb = furrow_bark(551, BARK['linden'], ridges=5, depth=0.8, wobble=1.0, cross=0.6)
    return match(rgb, (92, 84, 74))


def oak_log_side():
    # gruba, głęboko pobrużdżona kora dębu
    rgb = furrow_bark(561, BARK['oak'], ridges=3, depth=1.2, wobble=1.8, cross=0.9)
    return match(rgb, (86, 64, 46))


def birch_log_side():
    # biała kora z czarnymi poziomymi kreskami (przetchlinki)
    # i ciemnymi, spękanymi plamami
    r = rng(571)
    base = BARK['birch']
    height = fbm(r, ((4, 0.5), (8, 0.5))) * 0.4
    tone = 0.62 + light(height, 0.5) + (fbm(r, ((2, 1.0),)) - 0.5) * 0.12
    palette = shades(base, 5, 0.86, 1.06, (0.98, 0.98, 1.02))
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    # przetchlinki: krótkie poziome kreski
    for x, y in scatter(r, 9, 3.4):
        x, y = int(x), int(y)
        length = int(r.integers(2, 5))
        for k in range(length):
            rgb[y, (x + k) % N] = (52, 48, 46)
        rgb[(y + 1) % N, x] = rgb[(y + 1) % N, x] * 0.92
    # ciemna plama (stara, spękana kora)
    blob = ellipse(4.5, 11.0, 3.2, 1.6) | ellipse(12.5, 3.5, 2.0, 1.2)
    patch = paint(shades((60, 56, 54), 4, 0.8, 1.2), np.clip(0.5 + light(fbm(r), 1.0), 0, 1))
    rgb[blob] = patch[blob]
    return rgb


# ------------------------------------------------------------
# Słoje (góra pnia) i okorowany pień
# ------------------------------------------------------------

def rings(seed, wood, heart, bark=None, spacing=1.7):
    """Góra pnia: słoje od środka (zaokrąglony kwadrat), ciemny rdzeń,
    jasne i ciemne przyrosty, z boku kora (1 piksel) albo ciemniejszy
    brzeg (okorowany)."""
    r = rng(seed)
    dx = XX + 0.5 - 8.0
    dy = YY + 0.5 - 8.0
    d = np.maximum(np.abs(dx), np.abs(dy)) * 0.55 + np.hypot(dx, dy) * 0.45
    d = d + (noise(r, 4) - 0.5) * 1.1
    ring = (d / spacing) % 1.0
    late = ring > 0.62                       # ciemny przyrost (późne drewno)
    t = np.clip(d / 7.5, 0, 1)
    color = mix(heart, wood, np.clip(t * 1.4 - 0.15, 0, 1)[..., None])
    k = np.where(late, 0.84, 1.0) + (fbm(r, ((4, 0.5), (8, 0.5))) - 0.5) * 0.08
    k = np.round(k * 14) / 14
    rgb = color * k[..., None]
    # rdzeń
    for x, y in [(7, 7), (8, 7), (7, 8), (8, 8)]:
        rgb[y, x] = np.array(heart) * 0.72
    rgb[7, 7] = np.array(heart) * 0.8
    edge = (XX == 0) | (XX == N - 1) | (YY == 0) | (YY == N - 1)
    if bark is not None:
        rgb[edge] = bark[edge]
        inner = ((XX == 1) | (XX == N - 2) | (YY == 1) | (YY == N - 2)) & ~edge
        rgb[inner] = rgb[inner] * 0.86
    else:
        rgb[edge] = rgb[edge] * 0.86
    # pęknięcie promieniste (czasem)
    if r.random() < 0.6:
        angle = r.uniform(0, 2 * np.pi)
        for k in range(2, 7):
            x = int(round(8 + np.cos(angle) * k - 0.5))
            y = int(round(8 + np.sin(angle) * k - 0.5))
            rgb[y % N, x % N] = rgb[y % N, x % N] * 0.72
    return rgb


def grain(seed, wood, heart_mix=0.0, streaks=6, contrast=1.0):
    """Okorowany pień z boku: gładkie drewno, pionowe usłojenie
    (jasne i ciemne pasma z lekkim falowaniem)."""
    r = rng(seed)
    wave = (noise(r, 4) - 0.5) * 2.0
    x = (XX + wave) / N * streaks
    band = np.sin(2 * np.pi * x + noise(r, 2) * 3)
    fine = (noise(r, 8) - 0.5)
    tone = 0.55 + band * 0.16 * contrast + fine * 0.12
    # lekko wypukły pień: jaśniej po lewej
    tone += (0.5 - (XX + 0.5) / N) * 0.08
    palette = shades(wood, 6, 0.8, 1.12, (1.0, 0.97, 0.94))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    # sęk
    if r.random() < 0.7:
        x0, y0 = r.integers(3, 13), r.integers(3, 13)
        knot = ellipse(x0 + 0.5, y0 + 0.5, 1.3, 1.9)
        rgb[knot] = np.array(wood) * 0.62
        rgb[y0, x0] = np.array(wood) * 0.5
    return rgb


def planks(seed, wood, contrast=1.0):
    """Nowy gatunek korzysta z autorskiego układu desek świerkowych.

    Kafelek (0, 7) jest wzorcem kształtu i względnej jasności z atlasu,
    a wood wybiera paletę nowego gatunku. Nie losujemy czarnych szpar,
    kropek ani sęków. seed pozostaje argumentem dla zgodności wywołań;
    contrast może tylko złagodzić wzorzec, nigdy go przerysować.
    Funkcja nie zapisuje żadnego arkusza.
    """
    with read_texture(ATLAS) as atlas:
        tile = np.asarray(atlas.convert('RGBA').crop((0, 7 * N, N, 8 * N)), dtype=float)
    if tile.shape != (N, N, 4) or not np.all(tile[..., 3] == 255):
        raise ValueError('Wzorzec desek (0, 7) musi być pełnym kafelkiem 16 x 16.')
    color = np.asarray(wood, dtype=float)
    if color.shape != (3,) or not np.all(np.isfinite(color)):
        raise ValueError('Kolor drewna musi zawierać trzy skończone wartości RGB.')
    luminance = tile[..., :3] @ np.array([0.2126, 0.7152, 0.0722])
    mean = float(luminance.mean())
    if mean <= 0:
        raise ValueError('Wzorzec desek nie może być całkowicie czarny.')
    strength = float(np.clip(contrast, 0.0, 1.0))
    tone = 1.0 + (luminance / mean - 1.0) * strength
    return np.clip(tone[..., None] * color, 0, 255)


# ------------------------------------------------------------
# Liście i igliwie (z prześwitami)
# ------------------------------------------------------------

def leaf_cells(seed, base, count, gap, holes, steps=6, variation=0.12, vein=True, round_=False):
    """Liście: każda komórka to listek (wypukły, jasny z lewej góry,
    z cieniem na brzegu), listki "z tyłu" ciemniejsze. Prześwity
    (przezroczyste) - małe, w cieniu między listkami."""
    r = rng(seed)
    points = scatter(r, count, gap)
    d1, d2, cell = cells(points)
    edge = d2 - d1
    n = len(points)
    dome = np.clip(edge / (1.6 if round_ else 1.25), 0, 1) ** 0.6
    depth = r.uniform(0, 1, n)
    tone = 0.56 + r.uniform(-variation, variation, n)[cell] + light(dome, 1.3) + (dome - 0.5) * 0.25
    tone -= (depth[cell] < 0.35) * 0.2
    palette = shades(base, steps, 0.5, 1.3, (0.9, 1.0, 1.05))
    rgb = paint(palette, np.clip(tone, 0, 1), 1)
    gaps = edge < 0.5
    rgb[gaps] = np.array(base) * 0.42
    # prześwity: drobne, tam gdzie cień (szczeliny i listki z tyłu)
    shadow = gaps | (depth[cell] < 0.35)
    pick = fbm(r, ((8, 0.7), (16, 0.3))) + np.where(shadow, 0, 1.0)
    hole = pick <= np.quantile(pick, holes)
    alpha = np.where(hole, 0, 255.0)
    if vein:
        for i, (x, y) in enumerate(points):
            if depth[i] < 0.35:
                continue
            xi, yi = int(x) % N, int(y) % N
            if not hole[yi, xi]:
                rgb[yi, xi] = mix(rgb[yi, xi], (210, 236, 160), 0.22)
    return rgb, alpha


def needles(seed, base, density, length=(3, 4), holes=0.12, angles=None, steps=6):
    """Igliwie: krótkie igły (kreski) w różne strony, jasne na końcu
    od światła, ciemny środek gałązki; prześwity przezroczyste."""
    r = rng(seed)
    palette = shades(base, steps, 0.5, 1.35, (0.88, 1.0, 1.08))
    tone = np.full((N, N), -1.0)
    angles = angles or [np.pi / 4, 3 * np.pi / 4, np.pi / 3, 2 * np.pi / 3, np.pi / 6, 5 * np.pi / 6]
    # gałązki: ciemne pędy, igły od nich na boki
    for _ in range(density):
        x0, y0 = r.uniform(0, N, 2)
        a = angles[r.integers(len(angles))] + r.uniform(-0.2, 0.2)
        if r.random() < 0.5:
            a += np.pi
        L = r.integers(*[length[0], length[1] + 1])
        t0 = r.uniform(0.35, 0.75)
        for k in range(L):
            x = int(round(x0 + np.cos(a) * k)) % N
            y = int(round(y0 + np.sin(a) * k)) % N
            v = t0 + 0.4 * (k / max(1, L - 1)) * (0.6 if np.sin(a) > 0 else 1.0)
            tone[y, x] = max(tone[y, x], v)
    filled = tone >= 0
    # puste miejsca między igłami: głębia korony (ciemno), część z nich
    # to drobne prześwity
    pick = fbm(r, ((8, 0.6), (16, 0.4))) + np.where(filled, 1.0, 0)
    hole = pick <= np.quantile(pick, holes)
    tone[~filled] = 0.12
    rgb = paint(palette, np.clip(tone, 0, 1), 0)
    alpha = np.where(hole, 0, 255.0)
    return rgb, alpha


def leaves_tile(rgb, alpha):
    img = rgba(rgb, alpha)
    return img


def spruce_leaves():
    rgb, alpha = needles(601, LEAVES['spruce'], 64, (3, 4), holes=0.12)
    return leaves_tile(rgb, alpha)


def pine_leaves():
    # dłuższe igły w pęczkach, jaśniejsze
    rgb, alpha = needles(611, LEAVES['pine'], 46, (4, 5), holes=0.16,
                         angles=[np.pi / 5, 4 * np.pi / 5, np.pi / 2.6, np.pi - np.pi / 2.6])
    return leaves_tile(rgb, alpha)


def beech_leaves():
    rgb, alpha = leaf_cells(621, LEAVES['beech'], 34, 2.3, holes=0.13)
    return leaves_tile(rgb, alpha)


def linden_leaves():
    rgb, alpha = leaf_cells(631, LEAVES['linden'], 28, 2.6, holes=0.11, round_=True)
    return leaves_tile(rgb, alpha)


def oak_leaves():
    rgb, alpha = leaf_cells(641, LEAVES['oak'], 32, 2.4, holes=0.13, variation=0.15)
    return leaves_tile(rgb, alpha)


def birch_leaves():
    # drobne, jasne listki, dużo prześwitów (ażurowa korona)
    rgb, alpha = leaf_cells(651, LEAVES['birch'], 40, 2.0, holes=0.22, variation=0.14)
    return leaves_tile(rgb, alpha)


def linden_leaves_flowering():
    img = linden_leaves()
    r = rng(661)
    # baldachy żółtawych kwiatków (po kilka kropek) na jasnej przysadce
    for x, y in scatter(r, 5, 5.5):
        x, y = int(x), int(y)
        for dx, dy in [(0, 0), (1, 0), (0, 1), (-1, 1), (1, 1)]:
            if r.random() < 0.85:
                c = (246, 230, 128) if (dx + dy) % 2 == 0 else (226, 200, 96)
                put(img, (x + dx) % N, (y + dy) % N, c)
        put(img, (x + 1) % N, (y - 1) % N, (198, 214, 120))
        put(img, x % N, (y + 2) % N, (172, 150, 62))
    return img


# ------------------------------------------------------------
# Sadzonki
# ------------------------------------------------------------

def stem(img, x, y0, y1, color, light_color=None):
    for y in range(y0, y1 + 1):
        put(img, x, y, color)
        if light_color is not None:
            put(img, x - 1, y, light_color) if False else None


def leaf_sprite(img, cx, cy, rx, ry, angle, base, vein=True):
    mask = ellipse(cx, cy, rx, ry, angle)
    shape = shade_shape(mask, shades(base, 5, 0.6, 1.25, (0.9, 1.0, 1.05)), strength=1.2)
    img[mask] = shape[mask]
    if vein:
        x = int(cx)
        y = int(cy)
        put(img, x, y, np.array(base) * 0.7)


def sapling_spruce():
    img = empty()
    trunk = (96, 66, 46)
    for y in range(11, 16):
        put(img, 7, y, trunk)
        put(img, 8, y, np.array(trunk) * 0.8)
    green = LEAVES['spruce']
    tiers = [(3, 2), (5, 3), (8, 4), (11, 5)]
    palette = shades(green, 5, 0.6, 1.3, (0.9, 1.0, 1.05))
    for top, half in tiers:
        for row in range(3):
            y = top + row
            w = max(1, half - (2 - row))
            for x in range(8 - w, 8 + w):
                t = 0.75 - (x - 8 + w) / (2 * w) * 0.5 - row * 0.08
                c = palette[int(np.clip(round(t * 4), 0, 4))]
                put(img, x, y, c)
    put(img, 7, 1, palette[3])
    put(img, 8, 2, palette[2])
    put(img, 7, 2, palette[4])
    return img


def sapling_pine():
    img = empty()
    trunk = (150, 92, 54)
    for y in range(8, 16):
        put(img, 7, y, trunk if y > 9 else (182, 112, 64))
        put(img, 8, y, np.array(trunk) * 0.8)
    # pęczki długich igieł na górze i z boku
    green = shades(LEAVES['pine'], 5, 0.6, 1.3)
    tufts = [(8, 4, 6), (5, 7, 4), (11, 8, 4)]
    r = rng(701)
    for cx, cy, n in tufts:
        for k in range(n):
            a = -np.pi / 2 + (k - (n - 1) / 2) * 0.5 + r.uniform(-0.1, 0.1)
            for j in range(1, 4):
                x = int(round(cx + np.cos(a) * j))
                y = int(round(cy + np.sin(a) * j))
                put(img, x, y, green[min(4, 1 + j)])
        put(img, cx, cy, green[1])
    for x, y in line_cells(7, 9, 5, 7) + line_cells(8, 10, 11, 8):
        put(img, x, y, (120, 80, 50))
    return img


def sapling_broadleaf(seed, stem_color, base, leaves, round_=False, lobed=False):
    img = empty()
    for y in range(6, 16):
        put(img, 7, y, stem_color)
    for x, y in line_cells(7, 10, 4, 7):
        put(img, x, y, stem_color)
    for x, y in line_cells(8, 9, 11, 6):
        put(img, x, y, stem_color)
    r = rng(seed)
    for cx, cy, angle in leaves:
        rx, ry = (2.6, 2.4) if round_ else (2.6, 1.5)
        leaf_sprite(img, cx, cy, rx, ry, angle, base)
        if lobed:
            # wcięcia liścia dębu
            for k in (-1, 1):
                x = int(round(cx + np.cos(angle + np.pi / 2) * 1.6 * k))
                y = int(round(cy + np.sin(angle + np.pi / 2) * 1.6 * k))
                if 0 <= x < N and 0 <= y < N:
                    img[y, x, 3] = 0
    del r
    return img


def sapling_beech():
    # buk: wąskie, błyszczące, ciemniejsze listki, czerwonawa łodyżka
    return sapling_broadleaf(711, (122, 84, 64), (72, 134, 46),
                             [(8.5, 3.5, -0.9), (3.5, 6.5, -2.4), (12.0, 5.5, -0.6), (5.0, 10.0, 2.6), (10.8, 9.6, 0.5)])


def sapling_linden():
    # lipa: duże, okrągłe (sercowate), jasne liście
    return sapling_broadleaf(721, (96, 84, 70), (124, 172, 66),
                             [(8.0, 3.5, 0.0), (3.5, 6.5, 0.0), (11.8, 5.5, 0.0)], round_=True)


def sapling_oak():
    # dąb: ciemne, klapowane liście (wcięcia na brzegach)
    return sapling_broadleaf(731, (98, 72, 48), (58, 108, 36),
                             [(8.0, 3.2, -1.2), (3.6, 6.4, -2.6), (11.6, 5.4, -0.5), (4.8, 10.6, 2.4)], lobed=True)


def sapling_birch():
    img = empty()
    for y in range(4, 16):
        put(img, 7, y, (232, 228, 216))
        put(img, 8, y, (196, 192, 180))
    for y in (6, 9, 12):
        put(img, 7, y, (50, 46, 44))
    for x, y in line_cells(7, 8, 4, 5) + line_cells(8, 6, 12, 4):
        put(img, x, y, (120, 88, 66))
    r = rng(741)
    for cx, cy in [(3.5, 4.0), (5.0, 6.5), (12.0, 3.5), (13.0, 6.0), (10.5, 2.0), (8.0, 1.5), (2.5, 7.5), (11.0, 7.5)]:
        leaf_sprite(img, cx + r.uniform(-0.3, 0.3), cy, 1.5, 1.1, r.uniform(0, 3), LEAVES['birch'], vein=False)
    return img


# ------------------------------------------------------------
# Opadłe liście (na ziemi) i wieniec
# ------------------------------------------------------------

def litter(seed, colors, count):
    r = rng(seed)
    img = empty()
    points = scatter(r, count, 3.3)
    for x, y in points:
        angle = r.uniform(0, np.pi)
        color = np.array(colors[r.integers(len(colors))], float)
        mask = np.zeros((N, N), bool)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                mask |= ellipse(x + ox, y + oy, 2.0, 1.25, angle)
        shape = shade_shape(mask, shades(color, 5, 0.65, 1.22), strength=0.9, base=0.6)
        img[mask] = shape[mask]
        # ogonek liścia
        tx = int(round(x + np.cos(angle) * 2.4)) % N
        ty = int(round(y + np.sin(angle) * 2.4)) % N
        put(img, tx, ty, color * 0.6)
    return img


def wreath():
    img = empty()
    r = rng(801)
    d = np.hypot(XX + 0.5 - 8, YY + 0.5 - 8)
    ring = (d <= 7.0) & (d >= 3.6)
    palette = shades(LEAVES['spruce'], 6, 0.55, 1.35, (0.9, 1.0, 1.05))
    height = np.clip(1 - np.abs(d - 5.1) / 2.0, 0, 1)
    shape = shade_shape(ring, palette, height=height + fbm(r, ((8, 1.0),)) * 0.4, strength=1.3)
    img[ring] = shape[ring]
    # igiełki na brzegach (postrzępiony obrys)
    for k in range(28):
        a = k / 28 * 2 * np.pi + r.uniform(-0.05, 0.05)
        for rad in (7.4,):
            if r.random() < 0.6:
                put(img, int(8 + np.cos(a) * rad), int(8 + np.sin(a) * rad), palette[2])
    # szyszki
    for a in (0.3, 2.4, 4.2):
        cx, cy = 8 + np.cos(a) * 5.2, 8 + np.sin(a) * 5.2
        mask = ellipse(cx, cy, 1.2, 1.9, a)
        cone = shade_shape(mask, shades((130, 84, 50), 4, 0.6, 1.25), strength=1.2)
        img[mask] = cone[mask]
    # czerwona kokarda na dole
    for x, y, c in [(7, 13, (200, 40, 40)), (8, 13, (200, 40, 40)), (6, 12, (226, 64, 56)), (9, 12, (226, 64, 56)),
                    (7, 14, (160, 28, 30)), (8, 14, (160, 28, 30)), (6, 14, (180, 30, 32)), (9, 14, (180, 30, 32))]:
        put(img, x, y, c)
    img = outline(img, 0.4)
    # w środku (dziurka wieńca) bez obrysu - tylko cień przy brzegu
    inner = d < 3.6
    img[inner] = 0
    return img


# ------------------------------------------------------------
# Przedmioty
# ------------------------------------------------------------

def scales_pattern(mask, base, cx, cy, sx, sy, seed):
    """Łuski szyszki: rzędy wypukłych łusek (wzór w karo)."""
    r = rng(seed)
    u = (XX + 0.5 - cx) / sx
    v = (YY + 0.5 - cy) / sy
    a = np.sin((u + v) * np.pi) * np.sin((u - v) * np.pi)
    height = np.abs(a) ** 0.5 + np.sqrt(depth_map(mask)) * 0.3
    img = shade_shape(mask, shades(base, 6, 0.55, 1.3, (0.95, 0.92, 0.9)), height=height, strength=1.4,
                      extra=(fbm(r, ((8, 1.0),)) - 0.5) * 0.1)
    return img


def spruce_cone():
    mask = ellipse(8.0, 9.0, 2.6, 5.6)
    img = scales_pattern(mask, (142, 90, 54), 8.0, 9.0, 1.6, 1.4, 811)
    # szypułka
    for y in (1, 2):
        put(img, 8, y, (96, 70, 46))
    put(img, 9, 1, (76, 112, 60))
    return outline(img, 0.42)


def pine_cone():
    mask = ellipse(8.0, 8.8, 4.4, 5.4)
    img = scales_pattern(mask, (128, 86, 52), 8.0, 8.8, 1.8, 1.6, 821)
    for y in (1, 2):
        put(img, 8, y, (90, 66, 44))
    return outline(img, 0.42)


def resin():
    # bursztynowa kropla żywicy (u góry spiczasta) z blaskiem
    drop = (np.hypot(XX + 0.5 - 8.0, YY + 0.5 - 10.0) <= 4.3) | \
        ((YY + 0.5 >= 2.0) & (YY + 0.5 <= 10.0) & (np.abs(XX + 0.5 - 8.0) <= (YY + 0.5 - 2.0) * 0.62))
    img = shade_shape(drop, shades((226, 146, 34), 6, 0.62, 1.25, (1.0, 0.85, 0.7)), strength=1.5)
    for x, y, c in [(6, 8, (255, 236, 170)), (6, 9, (255, 222, 140)), (7, 6, (252, 214, 128)), (10, 12, (176, 92, 20))]:
        put(img, x, y, c)
    return outline(img, 0.42)


def beechnuts():
    # dwa trójkątne, błyszczące orzeszki w otwartej, kolczastej
    # okrywie (miseczka z klapkami pod spodem)
    img = empty()
    cup = ellipse(8.0, 11.2, 6.0, 3.4) & ~ellipse(8.0, 9.4, 4.6, 2.6)
    cup &= YY >= 8
    shape = shade_shape(cup, shades((150, 118, 70), 5, 0.6, 1.2), strength=1.0)
    img[cup] = shape[cup]
    # kolce: krótkie kreski na zewnątrz miseczki
    for k in range(9):
        a = np.pi * (0.08 + 0.84 * k / 8)
        x = int(round(8 + np.cos(a) * 6.8 - 0.5))
        y = int(round(11.2 + np.sin(a) * 4.1 - 0.5))
        put(img, x, y, (172, 140, 88))
    for side in (-1, 1):
        put(img, 8 + side * 6, 9, (172, 140, 88))
        put(img, 7 + side * 6 + (1 if side < 0 else 0), 8, (150, 118, 70))
    for cx in (6.2, 9.8):
        tri = (YY + 0.5 >= 2.5) & (YY + 0.5 <= 10.5) & (np.abs(XX + 0.5 - cx) <= (YY + 0.5 - 2.5) * 0.3 + 0.35)
        nut = shade_shape(tri, shades((128, 74, 42), 5, 0.6, 1.3), strength=1.6)
        img[tri] = nut[tri]
        put(img, int(cx) - 1, 6, (196, 136, 90))
        put(img, int(cx) - 1, 7, (176, 116, 72))
    return outline(img, 0.42)


def linden_flower():
    # jasnozielona przysadka (podłużny listek) i zwisający baldach
    # żółtawych kwiatków z szypułką
    img = empty()
    bract = ellipse(9.5, 5.0, 5.0, 1.8, 0.55)
    shape = shade_shape(bract, shades((178, 200, 104), 5, 0.65, 1.2), strength=1.1)
    img[bract] = shape[bract]
    for x, y in line_cells(8, 6, 6, 10):
        put(img, x, y, (140, 150, 70))
    for cx, cy in [(5.5, 11.5), (7.5, 12.0), (4.0, 13.2), (6.5, 14.0), (8.6, 13.8), (3.8, 10.8)]:
        mask = ellipse(cx, cy, 1.25, 1.2)
        flower = shade_shape(mask, shades((242, 222, 120), 4, 0.7, 1.15), strength=1.0)
        img[mask] = flower[mask]
        put(img, int(cx), int(cy), (208, 170, 70))
    return outline(img, 0.42)


def acorn():
    # żołądź: błyszczący orzech i chropowata czapeczka z ogonkiem
    img = empty()
    angle = 0.3
    nut = ellipse(8.4, 9.8, 3.3, 4.6, angle)
    shape = shade_shape(nut, shades((176, 128, 56), 6, 0.6, 1.3), strength=1.5)
    img[nut] = shape[nut]
    put(img, 10, 14, (120, 86, 40))
    cap = ellipse(7.1, 5.6, 4.0, 2.3, angle) & ~ellipse(8.0, 8.2, 3.2, 2.0, angle)
    capimg = shade_shape(cap, shades((116, 88, 56), 5, 0.6, 1.25), strength=1.0,
                         extra=((XX + YY) % 2) * 0.1 - 0.05)
    img[cap] = capimg[cap]
    for x, y in [(6, 2), (5, 1), (5, 2)]:
        put(img, x, y, (92, 70, 44))
    put(img, 7, 9, (226, 184, 110))
    put(img, 7, 10, (210, 166, 92))
    return outline(img, 0.42)


def birch_bark():
    # zwinięty kawałek białej kory z czarnymi kreskami
    img = empty()
    roll = ellipse(8.0, 8.0, 6.2, 3.6, -0.5)
    height = np.sqrt(depth_map(roll))
    shape = shade_shape(roll, shades((228, 224, 210), 5, 0.75, 1.08), height=height, strength=1.0)
    img[roll] = shape[roll]
    for x, y in [(4, 8), (5, 8), (8, 6), (9, 6), (10, 6), (7, 10), (8, 10), (11, 9)]:
        put(img, x, y, (50, 46, 44))
    # zwinięty koniec - spirala od środka (brązowawy spód kory)
    for x, y, c in [(12, 4, (196, 150, 110)), (13, 5, (176, 126, 88)), (12, 5, (150, 104, 72)), (13, 4, (226, 200, 170))]:
        put(img, x, y, c)
    return outline(img, 0.45)


def axe():
    img = empty()
    # trzonek: od lewego dołu do prawej góry
    for x, y in line_cells(2, 14, 11, 5):
        put(img, x, y, (150, 104, 60))
        put(img, x + 1, y, (112, 76, 44))
    # ostrze: szare, jasna krawędź tnąca
    blade = np.zeros((N, N), bool)
    for x, y in [(9, 1), (10, 1), (8, 2), (9, 2), (10, 2), (11, 2), (8, 3), (9, 3), (10, 3), (11, 3), (12, 3),
                 (9, 4), (10, 4), (11, 4), (12, 4), (13, 4), (11, 5), (12, 5), (13, 5), (12, 6), (13, 6), (14, 6), (13, 7)]:
        blade[y, x] = True
    shape = shade_shape(blade, shades((150, 156, 164), 5, 0.65, 1.3), strength=1.2)
    img[blade] = shape[blade]
    for x, y in [(8, 2), (8, 3), (9, 1), (14, 6), (13, 7)]:
        put(img, x, y, (232, 236, 240))
    return outline(img, 0.38)


# ------------------------------------------------------------

def generate():
    out = {}
    side = {
        'spruce': spruce_log_side(), 'pine': pine_log_side(), 'beech': beech_log_side(),
        'linden': linden_log_side(), 'oak': oak_log_side(), 'birch': birch_log_side(),
    }
    for i, s in enumerate(TREES):
        out[f'{s}_log_side'] = opaque(side[s])
        out[f'{s}_log_top'] = opaque(rings(900 + i, WOOD[s], HEART[s], bark=side[s]))
        out[f'{s}_stripped_side'] = opaque(grain(910 + i, WOOD[s], streaks=5 if s != 'oak' else 7,
                                                 contrast=1.3 if s in ('oak', 'pine') else 1.0))
        out[f'{s}_stripped_top'] = opaque(rings(920 + i, WOOD[s], HEART[s]))
        out[f'{s}_planks'] = opaque(planks(930 + i, PLANKS[s], contrast=1.5 if s in ('oak', 'pine') else 1.0))
    out['pine_log_upper_side'] = opaque(pine_log_upper_side())
    out['pine_log_resin_side'] = opaque(pine_log_resin_side())
    out['spruce_leaves'] = spruce_leaves()
    out['pine_leaves'] = pine_leaves()
    out['beech_leaves'] = beech_leaves()
    out['linden_leaves'] = linden_leaves()
    out['oak_leaves'] = oak_leaves()
    out['birch_leaves'] = birch_leaves()
    out['linden_leaves_flowering'] = linden_leaves_flowering()
    out['beech_leaf_litter'] = litter(841, [(206, 128, 52), (184, 102, 40), (222, 156, 74), (170, 92, 44)], 11)
    out['oak_leaf_litter'] = litter(851, [(146, 100, 52), (124, 86, 46), (164, 118, 62), (110, 92, 50)], 11)
    out['spruce_wreath'] = wreath()
    out['spruce_sapling'] = sapling_spruce()
    out['pine_sapling'] = sapling_pine()
    out['beech_sapling'] = sapling_beech()
    out['linden_sapling'] = sapling_linden()
    out['oak_sapling'] = sapling_oak()
    out['birch_sapling'] = sapling_birch()
    out['spruce_cone'] = spruce_cone()
    out['pine_cone'] = pine_cone()
    out['resin'] = resin()
    out['beechnuts'] = beechnuts()
    out['linden_flower'] = linden_flower()
    out['acorn'] = acorn()
    out['birch_bark'] = birch_bark()
    out['axe'] = axe()
    return out


# Narzędzia tekstur nowych gatunków; bez tworzenia paczek ani konfiguracji.
def conifer_sapling(green):
    img = empty()
    trunk = (96, 66, 46)
    for y in range(11, 16):
        put(img, 7, y, trunk)
        put(img, 8, y, np.array(trunk) * 0.8)
    palette = shades(green, 5, 0.6, 1.3, (0.9, 1.0, 1.05))
    for top, half in [(3, 2), (5, 3), (8, 4), (11, 5)]:
        for row in range(3):
            y = top + row
            w = max(1, half - (2 - row))
            for x in range(8 - w, 8 + w):
                t = 0.75 - (x - 8 + w) / (2 * w) * 0.5 - row * 0.08
                put(img, x, y, palette[int(np.clip(round(t * 4), 0, 4))])
    put(img, 7, 1, palette[3])
    put(img, 7, 2, palette[4])
    put(img, 8, 2, palette[2])
    return img


def fruit_on_leaves(leaves, fruit, seed):
    """Liście z owocami: na liściach kilka okrągłych owoców 2 x 2
    z jasnym bokiem i ogonkiem."""
    img = leaves.copy()
    r = rng(seed)
    light = np.clip(np.array(fruit) * 1.3 + 20, 0, 255)
    dark = np.array(fruit) * 0.68
    for x, y in scatter(r, 5, 4.6):
        x, y = int(x) % (N - 1), int(y) % (N - 1)
        put(img, x, y, light)
        put(img, x + 1, y, fruit)
        put(img, x, y + 1, fruit)
        put(img, x + 1, y + 1, dark)
        put(img, x + 1, (y - 1) % N, (92, 70, 40))
    return img


def fruit_item(fruit, leaf):
    """Owoc (przedmiot): okrągły, z ogonkiem i listkiem."""
    img = empty()
    body = ellipse(8.0, 9.6, 5.2, 5.0)
    shape = shade_shape(body, shades(fruit, 6, 0.6, 1.3, (1.0, 0.95, 0.92)), strength=1.5)
    img[body] = shape[body]
    for x, y in line_cells(8, 5, 9, 2):
        put(img, x, y, (98, 70, 42))
    leaf_mask = ellipse(11.6, 3.2, 2.4, 1.2, -0.5)
    leaf_img = shade_shape(leaf_mask, shades(leaf, 5, 0.65, 1.25), strength=1.0)
    img[leaf_mask] = leaf_img[leaf_mask]
    put(img, 5, 7, np.clip(np.array(fruit) * 1.4 + 40, 0, 255))
    put(img, 6, 6, np.clip(np.array(fruit) * 1.25 + 30, 0, 255))
    return outline(img, 0.42)


def tree_texture_set(seed, colors, conifer, fruit):
    bark, wood, leaf = colors['kora'], colors['drewno'], colors['liscie']
    heart = tuple(np.array(wood) * 0.86)
    board = tuple(np.array(wood) * 0.92)
    out = {}
    if conifer:
        side = plates_bark(seed, bark, count=12, gap=3.0, stretch=1.8, crack=0.55, variation=0.12)
    else:
        side = furrow_bark(seed, bark, ridges=4, depth=1.0, cross=0.3)
    out['pien_bok'] = opaque(side)
    out['pien_gora'] = opaque(rings(seed + 1, wood, heart, bark=side))
    out['okorowany_bok'] = opaque(grain(seed + 2, wood))
    out['okorowany_gora'] = opaque(rings(seed + 3, wood, heart))
    # Wspólny autorski układ 16 x 16 z atlasu, własny odcień gatunku.
    # Zasady rozwoju wzorca: docs/styl-tekstur.md.
    out['deski'] = opaque(planks(seed + 4, board))
    if conifer:
        rgb, alpha = needles(seed + 5, leaf, 60, (3, 4), holes=0.12)
    else:
        rgb, alpha = leaf_cells(seed + 5, leaf, 30, 2.4, holes=0.12)
    out['liscie'] = leaves_tile(rgb, alpha)
    if conifer:
        out['sadzonka'] = conifer_sapling(leaf)
    else:
        out['sadzonka'] = sapling_broadleaf(seed + 6, (110, 82, 60), leaf,
                                            [(8.0, 3.5, -0.9), (3.6, 6.5, -2.4), (11.8, 5.5, -0.6), (5.0, 10.0, 2.6)])
    autumn = [tuple(mix(leaf, c, 0.85)) for c in [(206, 128, 52), (184, 102, 40), (222, 170, 74), (150, 96, 46)]]
    out['opadle_liscie'] = litter(seed + 7, autumn, 11)
    if fruit:
        out['liscie_owoce'] = fruit_on_leaves(out['liscie'], colors['owoc'], seed + 8)
        out['owoc'] = fruit_item(colors['owoc'], leaf)
    return out



def main():
    atlas = read_texture(ATLAS)
    tiles = generate()
    for name, img in tiles.items():
        x, y = TILES[name]
        # kafelek czyścimy (przezroczyste piksele mają być przezroczyste)
        atlas.paste(Image.new('RGBA', (N, N), (0, 0, 0, 0)), (x * N, y * N))
        atlas.paste(as_image(img), (x * N, y * N))
    write_texture(ATLAS, atlas)
    print('Gotowe:', len(tiles), 'tekstur drzew w', 'assets/textures/*.png')
    if len(sys.argv) > 1:
        preview(tiles, sys.argv[1])


def preview(tiles, path):
    scale = 6
    names = list(tiles)
    columns = 8
    rows = (len(names) + columns - 1) // columns
    cell = N * scale
    sheet = Image.new('RGB', (columns * (cell * 2 + 12), rows * (cell + 12)), (70, 110, 150))
    for i, name in enumerate(names):
        tile = as_image(tiles[name])
        big = tile.resize((cell, cell), Image.NEAREST)
        tiled = Image.new('RGBA', (N * 3, N * 3))
        for a in range(3):
            for b in range(3):
                tiled.paste(tile, (a * N, b * N))
        tiled = tiled.resize((cell, cell), Image.NEAREST)
        x = (i % columns) * (cell * 2 + 12)
        y = (i // columns) * (cell + 12)
        sheet.paste(big, (x, y), big)
        sheet.paste(tiled, (x + cell + 4, y), tiled)
    sheet.save(path)


if __name__ == '__main__':
    main()
