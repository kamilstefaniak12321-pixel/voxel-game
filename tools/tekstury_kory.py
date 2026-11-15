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
from atlasy import ROOT, MANIFEST, write_texture, check, sync  # noqa: E402

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


SHEETS = {'oak_log_bark': oak_tiles, 'oak_stripped_sheet': oak_wood_tiles}

# Miejsce w atlasie świata: kafelek 8 x 8 kratek od tego wiersza.
ATLAS_ROW = {'oak_log_bark': 59, 'oak_stripped_sheet': 67}


def register(name):
    data = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if name not in data['regions']:
        spec = data['sheets']['drzewa']
        path = ROOT / 'assets/textures' / spec['file']
        old = Image.open(path).convert('RGBA')
        grown = Image.new('RGBA', (spec['width'], spec['height'] + N * GRID), (0, 0, 0, 0))
        grown.paste(old, (0, 0))
        grown.save(path, optimize=True)
        data['regions'][name] = {'sheet': 'drzewa', 'x': 0, 'y': spec['height'], 'width': N * GRID, 'height': N * GRID}
        spec['height'] += N * GRID
    if name not in data['tiles']:
        row = ATLAS_ROW[name]
        data['tiles'][name] = {'x': 0, 'y': row, 'w': GRID, 'h': GRID, 'pw': N * GRID, 'ph': N * GRID, 'region': name}
        data['rows'] = max(data.get('rows', 0), row + GRID)
    MANIFEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    for name, make in SHEETS.items():
        tiles = make()
        assert len(tiles) == GRID * GRID, len(tiles)
        sheet = Image.new('RGBA', (N * GRID, N * GRID))
        for index, (_, image) in enumerate(tiles):
            sheet.paste(image, ((index % GRID) * N, (index // GRID) * N))
        register(name)
        write_texture(name, sheet)
        if len(sys.argv) > 1:
            sheet.save(sys.argv[1])
        print(name, json.dumps([tile_name for tile_name, _ in tiles]))
    check()
    sync()


if __name__ == '__main__':
    main()
