# ------------------------------------------------------------
# ARKUSZE KORY (1.7.0) - pomysł Kamila. Opis: docs/kora.md.
#
# Zamiast jednego obrazka 16 x 16 pień ma arkusz 128 x 128: 64 kafelki
# kory (8 x 8). Gra wybiera dla każdego boku każdego bloku pnia jeden
# kafelek - losowo, z wagami (src/rendering/BarkSheets.js) - więc kora się
# nie powtarza, a co jakiś czas trafia się sęk, okorowany płat albo
# dziupla.
#
# Zasada, dzięki której dowolny kafelek pasuje nad i pod dowolnym innym:
# na górnej i dolnej krawędzi KAŻDEGO kafelka bruzdy kory są w tych samych
# kolumnach (ANCHORS), a lewa i prawa krawędź to grzbiet kory. W środku
# kafelka bruzdy mogą się wić, rozdwajać i przerywać. Dodatki (sęk,
# dziupla...) trzymają się środka kafelka.
#
# Arkusz można też namalować ręcznie (trzymając się tej zasady) - gra go
# tylko tnie. Ten skrypt rysuje arkusz dębu od nowa (stałe ziarna), dopisuje
# go do atlasu i odświeża src/rendering/TextureSheetData.js.
#
#     python3 tools/tekstury_kory.py [podglad.png]
# ------------------------------------------------------------
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, MANIFEST, read_texture, write_texture, check, sync  # noqa: E402

N = 16
GRID = 8

# Kolumny bruzd na górnej i dolnej krawędzi każdego kafelka.
ANCHORS = (2, 7, 12)

# Kora dębu: 5 tonów dotychczasowej tekstury oak_log_side (0 - dno bruzdy,
# 2 - zwykła kora, 4 - światło) + głęboki cień i mocne światło do dodatków.
OAK = {
    'tones': [(64, 47, 35), (75, 56, 41), (86, 64, 46), (98, 73, 52), (109, 81, 57)],
    'deep': (53, 39, 29), 'glint': (121, 91, 64),
    'hole': [(28, 20, 16), (38, 27, 21), (48, 35, 26)],
    'wood': [(118, 86, 52), (158, 116, 70), (177, 131, 79), (192, 144, 88)],
    'lichen': [(104, 112, 86), (126, 136, 104), (148, 158, 124)],
}


def plain(seed, calm=False):
    """Zwykły kafelek kory: mapa tonów 16 x 16 (0-4)."""
    rng = random.Random(seed)
    tone = [[2] * N for _ in range(N)]
    paths = []
    for anchor in ANCHORS:
        a1 = rng.uniform(-2.6, 2.6) * (0.45 if calm else 1)
        a2 = rng.uniform(-1.4, 1.4) * (0.45 if calm else 1)
        paths.append([anchor + round(a1 * math.sin(math.pi * y / (N - 1)) + a2 * math.sin(2 * math.pi * y / (N - 1))) for y in range(N)])
    # Bruzdy nie zbliżają się do siebie bardziej niż na 3 piksele i nie
    # wychodzą poza kafelek.
    for y in range(N):
        paths[0][y] = max(1, paths[0][y])
        for i in range(1, len(paths)):
            if paths[i][y] - paths[i - 1][y] < 3:
                paths[i][y] = paths[i - 1][y] + 3
        for i in range(len(paths) - 1, -1, -1):
            limit = N - 2 - 3 * (len(paths) - 1 - i)
            paths[i][y] = min(paths[i][y], limit)
    # Płyty kory: pionowe pasma o lekko innym tonie.
    for x in range(N):
        y = 0
        while y < N:
            run = rng.randint(3, 8)
            shift = rng.choice((0, 0, 0, 0, 1, -1))
            for k in range(y, min(N, y + run)):
                tone[k][x] = 2 + shift
            y += run
    # Jedna z bruzd bywa płytka (wtedy kafelek ma dwie wyraźne bruzdy).
    shallow = rng.randrange(len(paths)) if rng.random() < 0.3 else -1
    for index, path in enumerate(paths):
        # Odcinki: głęboko (0), płytko (1), mostek (kora przerywa bruzdę).
        state = [0] * N
        y = rng.randint(2, 5)
        while y < N - 2:
            kind = rng.choice((1, 1, 2)) if index != shallow else 2
            length = rng.randint(1, 3)
            for k in range(y, min(N - 2, y + length)):
                state[k] = kind
            y += length + rng.randint(3, 7)
        wide_from = rng.randint(2, 10) if rng.random() < 0.5 else N
        for y in range(N):
            x = path[y]
            if state[y] == 2 and 0 < y < N - 1:
                tone[y][x] = 2 if rng.random() < 0.6 else 1
                continue
            # Na samej krawędzi kafelka bruzda jest zawsze głęboka - tak
            # każdy kafelek pasuje do każdego.
            deep = (state[y] == 0 and index != shallow) or y in (0, N - 1)
            tone[y][x] = 0 if deep else 1
            # Szersza bruzda na kawałku.
            if deep and wide_from <= y < wide_from + 4 and x + 1 < N - 1:
                tone[y][x + 1] = 1
            # Światło z lewej góry: prawy brzeg bruzdy jasny, lewy w cieniu.
            if deep and x + 1 < N and tone[y][x + 1] > 1 and rng.random() < 0.65:
                tone[y][x + 1] = 3 if rng.random() < 0.85 else 4
            if deep and x - 1 >= 0 and tone[y][x - 1] > 1 and rng.random() < 0.4:
                tone[y][x - 1] = 1
    # Poprzeczne pęknięcia: płyta kory kończy się między dwiema bruzdami.
    for _ in range(rng.randint(1, 3) if not calm else 1):
        i = rng.randrange(len(paths) + 1)
        y = rng.randint(3, N - 4)
        left = paths[i - 1][y] + 1 if i > 0 else 0
        right = paths[i][y] - 1 if i < len(paths) else N - 1
        if right - left < 1:
            continue
        for x in range(left, right + 1):
            if tone[y][x] > 1:
                tone[y][x] = 1
            if tone[y + 1][x] in (1, 2) and rng.random() < 0.7:
                tone[y + 1][x] = 3
    # Pojedyncze światełka.
    for _ in range(rng.randint(1, 4)):
        y, x = rng.randint(1, N - 2), rng.randint(0, N - 1)
        if tone[y][x] == 3:
            tone[y][x] = 4
    return tone


def to_image(tone, colors):
    image = Image.new('RGBA', (N, N))
    for y in range(N):
        for x in range(N):
            value = tone[y][x]
            image.putpixel((x, y), (*(value if isinstance(value, tuple) else colors['tones'][max(0, min(4, value))]), 255))
    return image


def ellipse(cx, cy, rx, ry, x, y):
    return math.hypot((x - cx) / rx, (y - cy) / ry)


def knot(tone, colors, rng, cx, cy, rx, ry):
    """Zarośnięty ślad po gałęzi: pierścień kalusa z ciemnym środkiem."""
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            d = ellipse(cx, cy, rx, ry, x, y)
            lit = (x - cx) + (y - cy) < 0     # lewa góra - światło
            if d <= 0.34:
                tone[y][x] = colors['deep']
            elif d <= 0.52:
                tone[y][x] = 0 if lit else 1
            elif d <= 0.86:
                tone[y][x] = (colors['glint'] if rng.random() < 0.6 else 4) if lit else 3
            elif d <= 1.12:
                tone[y][x] = colors['deep'] if not lit else 0
            elif d <= 1.5 and abs(x - cx) < rx * 0.95 and rng.random() < 0.8:
                tone[y][x] = 1 if (y < cy) else 3    # zmarszczki nad i pod


def scar(tone, colors, rng, cx, cy, half):
    """Stara, zabliźniona rana: poziome "oko" z zamkniętą szparą."""
    for x in range(cx - half, cx + half + 1):
        if not 0 < x < N - 1:
            continue
        t = abs(x - cx) / half
        h = 2 if t < 0.55 else 1 if t < 0.9 else 0
        for dy in range(-h, h + 1):
            y = cy + dy
            if dy == 0:
                tone[y][x] = colors['deep'] if t < 0.7 else 0
            elif abs(dy) == h and h > 0:
                tone[y][x] = 1 if dy > 0 else 3
            else:
                tone[y][x] = 4 if dy < 0 else 3
    for x in range(cx - half + 1, cx + half):
        if 0 < x < N - 1 and rng.random() < 0.7:
            tone[cy - 3][x] = 1


def stripped(tone, colors, rng, cx, top, widths):
    """Uszczerbek: płat bez kory - widać jasne drewno. widths - połowy
    szerokości kolejnych wierszy od góry (kształt łzy albo soczewki)."""
    inside = set()
    drift = 0
    for row, half in enumerate(widths):
        if rng.random() < 0.3:
            drift += rng.choice((-1, 1))
        drift = max(-1, min(1, drift))
        for x in range(cx + drift - half, cx + drift + half + (rng.random() < 0.5)):
            if 1 < x < N - 2 and 1 < top + row < N - 2:
                inside.add((x, top + row))
    for x, y in inside:
        # Słoje: pionowe pasma, co kilka wierszy przesunięte.
        grain = (x + (y // 5)) % 3
        tone[y][x] = colors['wood'][3 if grain == 0 else 2 if grain == 1 else 1]
    for x, y in inside:
        # Kora jest wyżej niż drewno: u góry i z lewej rzuca na nie cień,
        # a jej dolny i prawy brzeg łapie światło.
        if (x, y - 1) not in inside or (x - 1, y) not in inside:
            tone[y][x] = colors['wood'][0]
        if (x, y - 1) not in inside:
            tone[y - 1][x] = 0
        if (x - 1, y) not in inside:
            tone[y][x - 1] = 0 if rng.random() < 0.7 else 1
        if (x, y + 1) not in inside:
            tone[y + 1][x] = 4
        if (x + 1, y) not in inside:
            tone[y][x + 1] = 4 if rng.random() < 0.5 else 3


def hollow(tone, colors, rng, cx, cy, rx, ry):
    """Dziupla: ciemny otwór w obwódce z kalusa."""
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            d = ellipse(cx, cy, rx, ry, x, y)
            lit = (x - cx) * 0.8 + (y - cy) < 0
            if d <= 1:
                # W środku: u góry najgłębszy cień, na dole trochę światła.
                depth = (y - cy) / ry
                tone[y][x] = colors['hole'][0 if depth < 0.15 else 1 if depth < 0.62 else 2]
                if d > 0.82 and depth < -0.2:
                    tone[y][x] = colors['hole'][0]
            elif d <= 1.36:
                tone[y][x] = (colors['glint'] if rng.random() < 0.45 else 4) if lit else 3
            elif d <= 1.7:
                tone[y][x] = 1 if lit else 0


def crack(tone, colors, rng, x0, y0, length):
    """Głębokie pęknięcie kory."""
    x = x0
    for k in range(length):
        y = y0 + k
        if rng.random() < 0.3:
            x += rng.choice((-1, 1))
        x = max(2, min(N - 3, x))
        tone[y][x] = colors['deep']
        if 2 < k < length - 2:
            tone[y][x - 1] = 0
        tone[y][x + 1] = 4 if rng.random() < 0.6 else 3


def lichen(tone, colors, rng, count):
    """Porosty: jasne, szarozielone plamki."""
    for _ in range(count):
        x, y = rng.randint(1, N - 3), rng.randint(1, N - 3)
        for dx, dy in rng.sample([(0, 0), (1, 0), (0, 1), (1, 1), (-1, 0), (0, -1)], rng.randint(2, 4)):
            if 0 < x + dx < N - 1 and 0 < y + dy < N - 1:
                tone[y + dy][x + dx] = colors['lichen'][rng.choice((0, 1, 1, 2))]


def burl(tone, colors, rng, cx, cy):
    """Mała narośl: wypukły guzek."""
    for dx in range(-1, 3):
        for dy in range(-1, 3):
            x, y = cx + dx, cy + dy
            corner = (dx in (-1, 2)) and (dy in (-1, 2))
            if corner:
                continue
            tone[y][x] = 4 if dx + dy <= 0 else 3 if dx + dy == 1 else 1 if dx == 2 or dy == 2 else 2
    tone[cy - 1][cx] = colors['glint']


# Arkusz dębu, wierszami od góry (nazwy - do wag w BarkSheets.js):
#   wiersze 0-5: zwykła kora (48 odmian; co ósma spokojniejsza),
#   wiersz 6:    drobne dodatki - porosty, pęknięcia, guzki,
#   wiersz 7:    rzadkie - sęki, blizna, okorowane płaty, dziuple.
def oak_tiles():
    c = OAK
    tiles = []
    for index in range(48):
        tiles.append(('zwykla', plain(7000 + index * 13, calm=index % 8 == 7)))
    def special(index, name, draw):
        rng = random.Random(9000 + index * 17)
        tone = plain(8000 + index * 29, calm=True)
        draw(tone, rng)
        tiles.append((name, tone))
    special(0, 'porosty', lambda t, r: lichen(t, c, r, 3))
    special(1, 'porosty', lambda t, r: lichen(t, c, r, 5))
    special(2, 'porosty', lambda t, r: lichen(t, c, r, 2))
    special(3, 'pekniecie', lambda t, r: crack(t, c, r, 6, 2, 11))
    special(4, 'pekniecie', lambda t, r: crack(t, c, r, 10, 3, 9))
    special(5, 'guzek', lambda t, r: (burl(t, c, r, 5, 5), burl(t, c, r, 10, 10)))
    special(6, 'guzek', lambda t, r: burl(t, c, r, 7, 8))
    special(7, 'guzek', lambda t, r: (burl(t, c, r, 10, 4), lichen(t, c, r, 2)))
    special(8, 'sek', lambda t, r: knot(t, c, r, 7.5, 7.5, 4.2, 3.6))
    special(9, 'sek', lambda t, r: knot(t, c, r, 6.5, 8.5, 3.3, 3.0))
    special(10, 'sek', lambda t, r: (knot(t, c, r, 9.5, 5.0, 3.0, 2.6), knot(t, c, r, 5.0, 11.0, 2.4, 2.1)))
    special(11, 'blizna', lambda t, r: scar(t, c, r, 8, 8, 5))
    special(12, 'okorowany', lambda t, r: stripped(t, c, r, 8, 3, (1, 2, 2, 3, 3, 3, 3, 2, 2, 1)))
    special(13, 'okorowany', lambda t, r: stripped(t, c, r, 7, 4, (2, 3, 4, 4, 3, 4, 3, 2)))
    special(14, 'dziupla', lambda t, r: hollow(t, c, r, 7.5, 7.5, 2.9, 3.7))
    special(15, 'dziupla', lambda t, r: hollow(t, c, r, 8.0, 8.0, 1.9, 4.6))
    return [(name, to_image(tone, c)) for name, tone in tiles]


# ============================================================
# OKOROWANY PIEŃ - arkusz drewna pod korą.
#
# Te same 64 miejsca co w arkuszu kory i to samo losowanie
# (BarkSheets.js: "like"), więc po okorowaniu pnia dodatek zostaje na
# swoim miejscu: pod sękiem jest sęk w drewnie, pod dziuplą - dziupla,
# pod pęknięciem kory - pęknięcie drewna, a pod okorowanym płatem widać
# chodniki korników.
#
# Zasada krawędzi: górny i dolny wiersz KAŻDEGO kafelka mają ten sam
# układ tonów (EDGE_ROW) - słoje dowolnego kafelka przechodzą w słoje
# dowolnego innego. Dodatki trzymają się środka.
# ============================================================

OAK_WOOD = {
    # 1-3: tony dotychczasowej tekstury oak_stripped_side; 0 - ciemna
    # linia słoja, 4 - światło.
    'tones': [(150, 109, 66), (165, 122, 74), (177, 131, 79), (188, 139, 84), (198, 150, 94)],
    'knot': [(92, 64, 38), (118, 84, 50), (138, 100, 60)],
    'hole': [(34, 24, 18), (48, 34, 24), (66, 46, 30)],
    'stain': [(146, 116, 82), (158, 126, 88)],
}

# Tony pikseli górnej i dolnej krawędzi kafelka (ciemne linie słojów
# w kolumnach 4 i 11).
EDGE_ROW = [2, 3, 2, 1, 0, 2, 2, 3, 2, 1, 2, 0, 2, 3, 2, 1]


def wood(seed, calm=False):
    """Zwykły kafelek okorowanego drewna: mapa tonów 16 x 16 (0-4)."""
    rng = random.Random(seed)
    tone = [[2] * N for _ in range(N)]
    for x in range(N):
        y = 1
        while y < N - 1:
            run = rng.randint(3, 8)
            value = rng.choice((1, 1, 2, 2, 2, 3))
            for k in range(y, min(N - 1, y + run)):
                tone[k][x] = value
            y += run
    # Linie słojów: od krawędzi do krawędzi, w środku lekko się wiją.
    for anchor in (4, 11):
        a = rng.uniform(-1.6, 1.6) * (0.4 if calm else 1)
        b = rng.uniform(-0.8, 0.8) * (0.4 if calm else 1)
        gap = rng.randint(4, 10) if rng.random() < 0.5 else -9
        for y in range(1, N - 1):
            x = anchor + round(a * math.sin(math.pi * y / (N - 1)) + b * math.sin(2 * math.pi * y / (N - 1)))
            if gap <= y < gap + 2:
                continue
            tone[y][x] = 0
            if rng.random() < 0.5:
                tone[y][x + 1] = 3
    # Krótkie kreski słojów.
    for _ in range(rng.randint(1, 3)):
        x, y0 = rng.choice((1, 2, 6, 7, 8, 13, 14)), rng.randint(2, 9)
        for y in range(y0, min(N - 2, y0 + rng.randint(2, 5))):
            tone[y][x] = 0 if rng.random() < 0.5 else 1
    for _ in range(rng.randint(1, 3)):
        x, y = rng.randint(1, N - 2), rng.randint(2, N - 3)
        if tone[y][x] == 3:
            tone[y][x] = 4
    tone[0] = list(EDGE_ROW)
    tone[N - 1] = list(EDGE_ROW)
    return tone


def wood_knot(tone, colors, rng, cx, cy, rx, ry):
    """Sęk w drewnie: ciemne oko, słoje opływają je łukiem."""
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            d = ellipse(cx, cy, rx, ry, x, y)
            if d <= 0.4:
                tone[y][x] = colors['knot'][0]
            elif d <= 0.75:
                tone[y][x] = colors['knot'][1] if (x + y) % 2 == 0 else colors['knot'][2]
            elif d <= 1.05:
                tone[y][x] = colors['knot'][2] if (x - cx) + (y - cy) > 0 else 0
            elif d <= 1.5 and abs(y - cy) < ry * 1.2:
                tone[y][x] = 0 if rng.random() < 0.55 else 3    # słoje wokół sęka


def wood_crack(tone, colors, rng, x0, y0, length):
    """Pęknięcie z wysychania: wąska, ciemna szczelina wzdłuż słojów."""
    x = x0
    for k in range(length):
        y = y0 + k
        if rng.random() < 0.18:
            x += rng.choice((-1, 1))
        x = max(2, min(N - 3, x))
        tone[y][x] = colors['knot'][0] if 1 < k < length - 2 else colors['knot'][1]
        tone[y][x + 1] = 4 if rng.random() < 0.5 else 3


def wood_stain(tone, colors, rng, count):
    """Przebarwienie: szarawe, zwietrzałe plamy."""
    for _ in range(count):
        cx, cy = rng.randint(3, N - 4), rng.randint(3, N - 4)
        rx, ry = rng.uniform(1.4, 2.4), rng.uniform(2.0, 3.6)
        for y in range(1, N - 1):
            for x in range(1, N - 1):
                if ellipse(cx, cy, rx, ry, x, y) <= 1 and tone[y][x] != 0 and rng.random() < 0.85:
                    tone[y][x] = colors['stain'][0 if isinstance(tone[y][x], int) and tone[y][x] <= 1 else 1]


def wood_galleries(tone, colors, rng, cx, cy):
    """Chodniki korników: pionowy korytarz z bocznymi odnogami."""
    top, bottom = cy - rng.randint(3, 5), cy + rng.randint(3, 5)
    for y in range(max(2, top), min(N - 2, bottom + 1)):
        tone[y][cx] = colors['knot'][0]
        tone[y][cx + 1] = 4 if rng.random() < 0.4 else tone[y][cx + 1]
    for y in range(max(2, top) + 1, min(N - 2, bottom), 2):
        for side in (-1, 1):
            if rng.random() < 0.2:
                continue
            reach = rng.randint(2, 4)
            for k in range(1, reach + 1):
                x = cx + side * k
                yy = y + (k // 2) * rng.choice((0, 1))
                if 1 < x < N - 2 and 1 < yy < N - 2:
                    tone[yy][x] = colors['knot'][1] if k < reach else colors['knot'][2]


def wood_hollow(tone, colors, rng, cx, cy, rx, ry):
    """Dziupla w okorowanym pniu: otwór w głąb drewna, brzeg zaokrąglony."""
    for y in range(1, N - 1):
        for x in range(1, N - 1):
            d = ellipse(cx, cy, rx, ry, x, y)
            lit = (x - cx) * 0.8 + (y - cy) < 0
            if d <= 1:
                depth = (y - cy) / ry
                tone[y][x] = colors['hole'][0 if depth < 0.15 else 1 if depth < 0.62 else 2]
                if d > 0.82 and depth < -0.2:
                    tone[y][x] = colors['hole'][0]
            elif d <= 1.36:
                tone[y][x] = 4 if lit else colors['knot'][2]
            elif d <= 1.7:
                tone[y][x] = 0 if lit else colors['knot'][1]


# Arkusz okorowanego dębu - kafelek po kafelku pod arkuszem kory.
def oak_wood_tiles():
    c = OAK_WOOD
    tiles = []
    for index in range(48):
        tiles.append(('zwykle', wood(17000 + index * 13, calm=index % 8 == 7)))
    def special(index, name, draw):
        rng = random.Random(19000 + index * 17)
        tone = wood(18000 + index * 29, calm=True)
        draw(tone, rng)
        tone[0] = list(EDGE_ROW)
        tone[N - 1] = list(EDGE_ROW)
        tiles.append((name, tone))
    # pod porostami: przebarwienia
    special(0, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 2))
    special(1, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 3))
    special(2, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 1))
    # pod pęknięciami kory: pęknięcia drewna (w tych samych miejscach)
    special(3, 'pekniecie', lambda t, r: wood_crack(t, c, r, 6, 2, 11))
    special(4, 'pekniecie', lambda t, r: wood_crack(t, c, r, 10, 3, 9))
    # pod guzkami: małe sęczki
    special(5, 'seczek', lambda t, r: (wood_knot(t, c, r, 5.5, 5.5, 1.5, 1.4), wood_knot(t, c, r, 10.5, 10.5, 1.5, 1.4)))
    special(6, 'seczek', lambda t, r: wood_knot(t, c, r, 7.5, 8.5, 1.6, 1.5))
    special(7, 'seczek', lambda t, r: wood_knot(t, c, r, 10.5, 4.5, 1.6, 1.4))
    # pod sękami i blizną: sęki
    special(8, 'sek', lambda t, r: wood_knot(t, c, r, 7.5, 7.5, 3.2, 2.8))
    special(9, 'sek', lambda t, r: wood_knot(t, c, r, 6.5, 8.5, 2.6, 2.4))
    special(10, 'sek', lambda t, r: (wood_knot(t, c, r, 9.5, 5.0, 2.4, 2.1), wood_knot(t, c, r, 5.0, 11.0, 1.9, 1.7)))
    special(11, 'sek', lambda t, r: wood_knot(t, c, r, 8.0, 8.0, 3.8, 2.0))
    # pod okorowanymi płatami: chodniki korników
    special(12, 'kornik', lambda t, r: wood_galleries(t, c, r, 8, 8))
    special(13, 'kornik', lambda t, r: wood_galleries(t, c, r, 7, 7))
    # pod dziuplami: dziuple (te same kształty)
    special(14, 'dziupla', lambda t, r: wood_hollow(t, c, r, 7.5, 7.5, 2.9, 3.7))
    special(15, 'dziupla', lambda t, r: wood_hollow(t, c, r, 8.0, 8.0, 1.9, 4.6))
    return [(name, to_image(tone, c)) for name, tone in tiles]


# ============================================================
# ARKUSZ Z ISTNIEJĄCEJ TEKSTURY (1.7.1) - pozostałe drzewa.
#
# Każde drzewo ma już swój obrazek kory 16 x 16 (własny charakter: łuski
# świerka, gładki buk, biała brzoza...). Arkusz powstaje z niego, tymi
# samymi pikselami i kolorami:
#   - górny i dolny wiersz każdego kafelka to wiersze oryginału (oryginał
#     pasuje sam do siebie, więc każdy kafelek pasuje do każdego),
#   - środek kafelka to ten sam obrazek przesunięty (jak na walcu) o inny
#     wektor - wybieramy przesunięcia, przy których szew między brzegiem
#     a środkiem najmniej widać, i prowadzimy go nierówno,
#   - dodatki (sęk, dziupla...) malujemy kolorami wziętymi z obrazka
#     kory i z obrazka okorowanego drewna tego samego drzewa.
# ============================================================

def pixels_of(name):
    image = read_texture(name).convert('RGB')
    return [[image.getpixel((x, y)) for x in range(N)] for y in range(N)]


def difference(a, b):
    return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])


def remix(base, dx, dy, seed):
    """Kafelek: brzegowe wiersze z oryginału, środek z oryginału przesuniętego o (dx, dy)."""
    rng = random.Random(seed)
    shifted = [[base[(y + dy) % N][(x + dx) % N] for x in range(N)] for y in range(N)]
    tile = [row[:] for row in shifted]
    for x in range(N):
        # Szew u góry i u dołu: w każdej kolumnie tam, gdzie oryginał
        # i przesunięty obrazek różnią się najmniej (wiersze 1-3 i 12-14).
        top = min((1, 2, 3), key=lambda y: difference(base[y][x], shifted[y][x]) + rng.random() * 12)
        bottom = min((12, 13, 14), key=lambda y: difference(base[y][x], shifted[y][x]) + rng.random() * 12)
        for y in range(0, top):
            tile[y][x] = base[y][x]
        for y in range(bottom + 1, N):
            tile[y][x] = base[y][x]
    return tile


def seam_cost(base, dx, dy):
    cost = 0
    for x in range(N):
        for rows in ((1, 2, 3), (12, 13, 14)):
            cost += min(difference(base[y][x], base[(y + dy) % N][(x + dx) % N]) for y in rows)
    return cost


def plain_variants(base, count, seed):
    """`count` zwykłych kafelków: oryginał i najlepiej pasujące przesunięcia."""
    offsets = [(dx, dy) for dx in range(N) for dy in range(N) if (dx, dy) != (0, 0)]
    offsets.sort(key=lambda o: seam_cost(base, *o))
    # Z najlepszej połowy bierzemy możliwie różne przesunięcia.
    pool = offsets[:len(offsets) // 2]
    chosen = []
    for offset in pool:
        if all(max(min(abs(offset[0] - o[0]), N - abs(offset[0] - o[0])), min(abs(offset[1] - o[1]), N - abs(offset[1] - o[1]))) >= 2 for o in chosen):
            chosen.append(offset)
        if len(chosen) == count - 1:
            break
    for offset in pool:
        if len(chosen) == count - 1:
            break
        if offset not in chosen:
            chosen.append(offset)
    return [[row[:] for row in base]] + [remix(base, dx, dy, seed + i) for i, (dx, dy) in enumerate(chosen)]


def luminance(c):
    return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]


def scale(c, factor):
    return tuple(max(0, min(255, round(v * factor))) for v in c)


def tones_of(base, count=5):
    """`count` tonów obrazka od najciemniejszego do najjaśniejszego."""
    flat = sorted((p for row in base for p in row), key=luminance)
    return [flat[min(len(flat) - 1, round((i + 0.5) * len(flat) / count))] for i in range(count)]


def palette_of(bark, wood):
    # Tony z przeważającej części obrazka (np. biel brzozy bez czarnych
    # kresek) - nimi malujemy obwódki i światła dodatków.
    flat = sorted((p for row in bark for p in row), key=luminance)
    median = luminance(flat[len(flat) // 2])
    main = [p for p in flat if abs(luminance(p) - median) <= 45] or flat
    tones = [main[min(len(main) - 1, round((i + 0.5) * len(main) / 5))] for i in range(5)]
    wood_tones = tones_of(wood, 4)
    darkest = flat[len(flat) // 50]
    # Kora z wyraźnie ciemniejszym rysunkiem (kreski brzozy): cień dodatków
    # w kolorze tego rysunku; inaczej - przyciemniony najciemniejszy ton.
    contrast = luminance(darkest) < 0.6 * luminance(tones[0])
    deep = darkest if contrast else scale(tones[0], 0.78)
    pale = median > 150
    return {
        'tones': tones, 'deep': deep, 'glint': scale(tones[4], 1.1 if not pale else 1.03),
        'hole': [scale(deep, 0.5), scale(deep, 0.68), scale(deep, 0.86)] if luminance(deep) < 110 else [(30, 24, 20), (42, 33, 27), (56, 44, 35)],
        'wood': [scale(wood_tones[0], 0.74), wood_tones[0], wood_tones[1], wood_tones[3]],
        # Porosty: szarozielone, ale zawsze odcinające się od kory.
        'lichen': [(96, 108, 78), (118, 130, 94), (138, 150, 110)] if pale else [(104, 112, 86), (126, 136, 104), (148, 158, 124)],
    }


def wood_palette_of(wood):
    tones = tones_of(wood)
    base = tones[1]
    return {
        'tones': [scale(tones[0], 0.92), tones[0], tones[2], tones[3], scale(tones[4], 1.05)],
        'knot': [scale(base, 0.56), scale(base, 0.72), scale(base, 0.84)],
        'hole': [scale(base, 0.2), scale(base, 0.29), scale(base, 0.4)],
        'stain': [scale((base[0] * 0.9, base[1] * 0.95, base[2] * 1.1), 0.9), scale((base[0] * 0.93, base[1] * 0.97, base[2] * 1.08), 0.96)],
    }


def restore_edges(tile, base):
    tile[0] = base[0][:]
    tile[N - 1] = base[N - 1][:]


def derived_bark(bark_name, wood_name, seed):
    """Arkusz kory z obrazka `bark_name` (dodatki także z kolorów `wood_name`)."""
    def make():
        base = pixels_of(bark_name)
        c = palette_of(base, pixels_of(wood_name))
        variants = plain_variants(base, 48 + 16, seed)
        tiles = [('zwykla', tile) for tile in variants[:48]]
        def special(index, name, draw):
            rng = random.Random(seed + 500 + index * 17)
            tile = [row[:] for row in variants[48 + index]]
            draw(tile, rng)
            restore_edges(tile, base)
            tiles.append((name, tile))
        special(0, 'porosty', lambda t, r: lichen(t, c, r, 3))
        special(1, 'porosty', lambda t, r: lichen(t, c, r, 5))
        special(2, 'porosty', lambda t, r: lichen(t, c, r, 2))
        special(3, 'pekniecie', lambda t, r: crack(t, c, r, 6, 2, 11))
        special(4, 'pekniecie', lambda t, r: crack(t, c, r, 10, 3, 9))
        special(5, 'guzek', lambda t, r: (burl(t, c, r, 5, 5), burl(t, c, r, 10, 10)))
        special(6, 'guzek', lambda t, r: burl(t, c, r, 7, 8))
        special(7, 'guzek', lambda t, r: (burl(t, c, r, 10, 4), lichen(t, c, r, 2)))
        special(8, 'sek', lambda t, r: knot(t, c, r, 7.5, 7.5, 4.2, 3.6))
        special(9, 'sek', lambda t, r: knot(t, c, r, 6.5, 8.5, 3.3, 3.0))
        special(10, 'sek', lambda t, r: (knot(t, c, r, 9.5, 5.0, 3.0, 2.6), knot(t, c, r, 5.0, 11.0, 2.4, 2.1)))
        special(11, 'blizna', lambda t, r: scar(t, c, r, 8, 8, 5))
        special(12, 'okorowany', lambda t, r: stripped(t, c, r, 8, 3, (1, 2, 2, 3, 3, 3, 3, 2, 2, 1)))
        special(13, 'okorowany', lambda t, r: stripped(t, c, r, 7, 4, (2, 3, 4, 4, 3, 4, 3, 2)))
        special(14, 'dziupla', lambda t, r: hollow(t, c, r, 7.5, 7.5, 2.9, 3.7))
        special(15, 'dziupla', lambda t, r: hollow(t, c, r, 8.0, 8.0, 1.9, 4.6))
        return [(name, to_image(tile, c)) for name, tile in tiles]
    return make


def without_specks(tile, base):
    """Kafelek bez ciemnych plamek (sęczków) - zamalowanych sąsiednim drewnem."""
    flat = sorted(luminance(p) for row in base for p in row)
    limit = flat[len(flat) // 2] - 26
    out = [row[:] for row in tile]
    for y in range(1, N - 1):
        for x in range(N):
            if luminance(out[y][x]) >= limit:
                continue
            for step in range(1, N):
                for yy in (y - step, y + step):
                    if 0 <= yy < N and luminance(tile[yy][x]) >= limit:
                        out[y][x] = tile[yy][x]
                        break
                else:
                    continue
                break
    return out


def derived_wood(wood_name, seed):
    """Arkusz okorowanego pnia z obrazka `wood_name` - pod arkuszem kory."""
    def make():
        base = pixels_of(wood_name)
        c = wood_palette_of(base)
        variants = plain_variants(base, 48 + 16, seed)
        # Obrazki okorowanych pni z paczek mają mały, ciemny sęczek. Na
        # każdym kafelku dawałby kropki na każdym bloku - zostaje na co
        # czwartym zwykłym kafelku (i na osobnych kafelkach z sękami).
        variants = [tile if index % 4 == 0 and index < 48 else without_specks(tile, base) for index, tile in enumerate(variants)]
        tiles = [('zwykle', tile) for tile in variants[:48]]
        def special(index, name, draw):
            rng = random.Random(seed + 500 + index * 17)
            tile = [row[:] for row in variants[48 + index]]
            draw(tile, rng)
            restore_edges(tile, base)
            tiles.append((name, tile))
        special(0, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 2))
        special(1, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 3))
        special(2, 'przebarwienie', lambda t, r: wood_stain(t, c, r, 1))
        special(3, 'pekniecie', lambda t, r: wood_crack(t, c, r, 6, 2, 11))
        special(4, 'pekniecie', lambda t, r: wood_crack(t, c, r, 10, 3, 9))
        special(5, 'seczek', lambda t, r: (wood_knot(t, c, r, 5.5, 5.5, 1.5, 1.4), wood_knot(t, c, r, 10.5, 10.5, 1.5, 1.4)))
        special(6, 'seczek', lambda t, r: wood_knot(t, c, r, 7.5, 8.5, 1.6, 1.5))
        special(7, 'seczek', lambda t, r: wood_knot(t, c, r, 10.5, 4.5, 1.6, 1.4))
        special(8, 'sek', lambda t, r: wood_knot(t, c, r, 7.5, 7.5, 3.2, 2.8))
        special(9, 'sek', lambda t, r: wood_knot(t, c, r, 6.5, 8.5, 2.6, 2.4))
        special(10, 'sek', lambda t, r: (wood_knot(t, c, r, 9.5, 5.0, 2.4, 2.1), wood_knot(t, c, r, 5.0, 11.0, 1.9, 1.7)))
        special(11, 'sek', lambda t, r: wood_knot(t, c, r, 8.0, 8.0, 3.8, 2.0))
        special(12, 'kornik', lambda t, r: wood_galleries(t, c, r, 8, 8))
        special(13, 'kornik', lambda t, r: wood_galleries(t, c, r, 7, 7))
        special(14, 'dziupla', lambda t, r: wood_hollow(t, c, r, 7.5, 7.5, 2.9, 3.7))
        special(15, 'dziupla', lambda t, r: wood_hollow(t, c, r, 8.0, 8.0, 1.9, 4.6))
        return [(name, to_image(tile, c)) for name, tile in tiles]
    return make


# Arkusze: nazwa -> funkcja rysująca 64 kafelki. Kolejność = miejsce
# w atlasie (SLOTS_PER_ROW arkuszy obok siebie, na prawo od kolumny
# ATLAS_BASE_COLUMNS) - nowe arkusze dopisuj NA KOŃCU.
SHEETS = {
    'oak_log_bark': oak_tiles, 'oak_stripped_sheet': oak_wood_tiles,
    'spruce_log_bark': derived_bark('spruce_log_side', 'spruce_stripped_side', 21000),
    'spruce_stripped_sheet': derived_wood('spruce_stripped_side', 22000),
    'pine_log_bark': derived_bark('pine_log_side', 'pine_stripped_side', 23000),
    'pine_stripped_sheet': derived_wood('pine_stripped_side', 24000),
    'beech_log_bark': derived_bark('beech_log_side', 'beech_stripped_side', 25000),
    'beech_stripped_sheet': derived_wood('beech_stripped_side', 26000),
    'linden_log_bark': derived_bark('linden_log_side', 'linden_stripped_side', 27000),
    'linden_stripped_sheet': derived_wood('linden_stripped_side', 28000),
    'birch_log_bark': derived_bark('birch_log_side', 'birch_stripped_side', 29000),
    'birch_stripped_sheet': derived_wood('birch_stripped_side', 30000),
    # 1.7.2: górna kora sosny i drzewa z paczek.
    'pine_log_upper_bark': derived_bark('pine_log_upper_side', 'pine_stripped_side', 31000),
    'jablon_log_bark': derived_bark('jablon/pien_bok.png', 'jablon/okorowany_bok.png', 32000),
    'jablon_stripped_sheet': derived_wood('jablon/okorowany_bok.png', 33000),
    'olcha_log_bark': derived_bark('olcha/pien_bok.png', 'olcha/okorowany_bok.png', 34000),
    'olcha_stripped_sheet': derived_wood('olcha/okorowany_bok.png', 35000),
    'wierzba_log_bark': derived_bark('wierzba/pien_bok.png', 'wierzba/okorowany_bok.png', 36000),
    'wierzba_stripped_sheet': derived_wood('wierzba/okorowany_bok.png', 37000),
    'acacia_log_bark': derived_bark('acacia/log_side.png', 'acacia/stripped_side.png', 38000),
    'acacia_stripped_sheet': derived_wood('acacia/stripped_side.png', 39000),
    'bald_cypress_log_bark': derived_bark('bald_cypress/log_side.png', 'bald_cypress/stripped_side.png', 40000),
    'bald_cypress_stripped_sheet': derived_wood('bald_cypress/stripped_side.png', 41000),
    'cherry_log_bark': derived_bark('cherry/log_side.png', 'cherry/stripped_side.png', 42000),
    'cherry_stripped_sheet': derived_wood('cherry/stripped_side.png', 43000),
    'maple_log_bark': derived_bark('maple/log_side.png', 'maple/stripped_side.png', 44000),
    'maple_stripped_sheet': derived_wood('maple/stripped_side.png', 45000),
    'mugo_log_bark': derived_bark('mugo/log_side.png', 'mugo/stripped_side.png', 46000),
    'mugo_stripped_sheet': derived_wood('mugo/stripped_side.png', 47000),
    'olive_log_bark': derived_bark('olive/log_side.png', 'olive/stripped_side.png', 48000),
    'olive_stripped_sheet': derived_wood('olive/stripped_side.png', 49000),
    'rainbow_eucalyptus_log_bark': derived_bark('rainbow_eucalyptus/log_side.png', 'rainbow_eucalyptus/stripped_side.png', 50000),
    'rainbow_eucalyptus_stripped_sheet': derived_wood('rainbow_eucalyptus/stripped_side.png', 51000),
    'sequoia_log_bark': derived_bark('sequoia/log_side.png', 'sequoia/stripped_side.png', 52000),
    'sequoia_stripped_sheet': derived_wood('sequoia/stripped_side.png', 53000),
    'ginkgo_log_bark': derived_bark('ginkgo/log_side.png', 'ginkgo/stripped_side.png', 54000),
    'ginkgo_stripped_sheet': derived_wood('ginkgo/stripped_side.png', 55000),
    'jacaranda_log_bark': derived_bark('jacaranda/log_side.png', 'jacaranda/stripped_side.png', 56000),
    'jacaranda_stripped_sheet': derived_wood('jacaranda/stripped_side.png', 57000),
}

# Miejsce w atlasie świata: arkusze leżą na prawo od zwykłych kafelków
# (od kolumny ATLAS_BASE_COLUMNS), po SLOTS_PER_ROW obok siebie - atlas
# robi się szerszy, a nie wyższy (wysoki, wąski atlas przekroczyłby
# najwyższą teksturę starszych kart graficznych).
ATLAS_BASE_COLUMNS = 16
SLOTS_PER_ROW = 6
ATLAS_COLUMNS = ATLAS_BASE_COLUMNS + SLOTS_PER_ROW * GRID


def register(name, slot):
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    data['columns'] = max(data.get('columns', 0), ATLAS_COLUMNS)
    if name not in data['regions']:
        spec = data['sheets']['drzewa']
        path = ROOT / 'assets/textures' / spec['file']
        used = [(r['x'], r['y'], r['width'], r['height']) for r in data['regions'].values() if r['sheet'] == 'drzewa']
        # Pierwsze wolne miejsce 128 x 128 w arkuszu drzew (dwa obok siebie),
        # w razie potrzeby arkusz rośnie w dół.
        spot = None
        y = 0
        while spot is None:
            for x in (0, N * GRID):
                box = (x, y, N * GRID, N * GRID)
                if all(box[0] >= u[0] + u[2] or u[0] >= box[0] + box[2] or box[1] >= u[1] + u[3] or u[1] >= box[1] + box[3] for u in used):
                    spot = (x, y)
                    break
            y += N
        if spot[1] + N * GRID > spec['height']:
            old = Image.open(path).convert('RGBA')
            grown = Image.new('RGBA', (spec['width'], spot[1] + N * GRID), (0, 0, 0, 0))
            grown.paste(old, (0, 0))
            grown.save(path, optimize=True)
            spec['height'] = spot[1] + N * GRID
        data['regions'][name] = {'sheet': 'drzewa', 'x': spot[0], 'y': spot[1], 'width': N * GRID, 'height': N * GRID}
    data['tiles'][name] = {'x': ATLAS_BASE_COLUMNS + (slot % SLOTS_PER_ROW) * GRID, 'y': (slot // SLOTS_PER_ROW) * GRID,
                           'w': GRID, 'h': GRID, 'pw': N * GRID, 'ph': N * GRID, 'region': name}
    # Wysokość atlasu: tyle, ile zajmują kafelki (arkusze kory z 1.7.0
    # leżały pod spodem i zostawiły puste wiersze).
    data['rows'] = max(tile['y'] + tile.get('h', 1) for tile in data['tiles'].values())
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    preview = []
    for slot, (name, make) in enumerate(SHEETS.items()):
        tiles = make()
        assert len(tiles) == GRID * GRID, len(tiles)
        sheet = Image.new('RGBA', (N * GRID, N * GRID))
        for index, (_, image) in enumerate(tiles):
            sheet.paste(image, ((index % GRID) * N, (index // GRID) * N))
        register(name, slot)
        write_texture(name, sheet)
        preview.append(sheet)
        print(name, len(tiles))
    if len(sys.argv) > 1:
        board = Image.new('RGBA', (len(preview) * (N * GRID + 4), N * GRID), (40, 42, 46, 255))
        for index, sheet in enumerate(preview):
            board.paste(sheet, (index * (N * GRID + 4), 0))
        board.save(sys.argv[1])
    check()
    sync()


if __name__ == '__main__':
    main()
