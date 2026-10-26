# ------------------------------------------------------------
# TEKSTURY BIOMÓW
#
# Rysuje tekstury bloków i przedmiotów z biomów (src/world/terrain/
# Biomes.js) i wkleja je do atlasu assets/textures/blocks/terrain.png
# (miejsca kafelków: ATLAS_TILES w src/rendering/TextureAtlas.js):
#   - śnieg, mech (blok i kępki mchu na ziemi),
#   - rośliny: trzcina, wrzos, krokus, piaskownica (trawa wydmowa),
#   - borówka: krzak, krzak z kilkoma i z wieloma owocami, owoce,
# oraz tekstury dwóch paczek drzew z mokradeł (assets/drzewa/olcha,
# assets/drzewa/wierzba): kora, słoje, deski, liście, sadzonka, opadłe
# liście i przedmiot (szyszki olchy, bazie).
#
# Ten sam styl co tools/tekstury.py i tools/tekstury_drzew.py (z nich są
# narzędzia: szum, komórki, światło z lewej góry, palety, kora, liście).
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/tekstury_biomow.py               do atlasu i paczek drzew
#     python tools/tekstury_biomow.py podglad.png   do tego podgląd
# ------------------------------------------------------------

import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tekstury import (  # noqa: E402
    N, ATLAS, ROOT, XX, YY, rng, noise, fbm, cells, scatter, shift, blur,
    light, cavity, paint, normalize, mix, shades, match, wrap_delta
)

from tekstury_drzew import (  # noqa: E402
    rgba, empty, put, outline, shade_shape, ellipse, line_cells, as_image,
    plates_bark, furrow_bark, rings, grain, planks, leaf_cells, leaf_sprite,
    sapling_broadleaf, litter, depth_map
)


# Gdzie w atlasie (kolumna, wiersz) - jak ATLAS_TILES w TextureAtlas.js.
TILES = {
    'reed': (10, 2), 'heather': (11, 2), 'crocus': (12, 2), 'dune_grass': (13, 2),
    'blueberry_bush_few': (10, 3), 'blueberry_bush_full': (11, 3), 'blueberry_bush': (12, 3),
    'blueberry': (4, 4),
    'snow': (4, 9), 'moss_top': (5, 9), 'moss_side': (6, 9), 'moss_carpet': (7, 9),
}

DRZEWA = os.path.join(ROOT, 'assets', 'drzewa')


def jitter(r, color, amount=5):
    return np.clip(np.array(color, float) + r.uniform(-amount, amount), 0, 255)


# ------------------------------------------------------------
# Śnieg i mech
# ------------------------------------------------------------

def snow():
    # miękkie zaspy (łagodne fale), chłodne niebieskawe cienie, kilka
    # iskierek
    r = rng(901)
    height = fbm(r, ((2, 0.55), (4, 0.3), (8, 0.15)))
    tone = 0.62 + light(height, 1.1) + (height - 0.5) * 0.2
    palette = [(178, 196, 222), (198, 214, 236), (216, 228, 244), (230, 238, 248), (242, 246, 252), (250, 252, 255)]
    rgb = paint(palette, np.clip(tone, 0, 1), 2)
    for x, y in scatter(r, 5, 4.5):
        rgb[int(y), int(x)] = (255, 255, 255)
        rgb[(int(y) + 1) % N, int(x)] = rgb[(int(y) + 1) % N, int(x)] * 0.96
    return match(rgb, (230, 237, 247))


MOSS = (82, 124, 44)


def moss_cushions(seed, base=MOSS, count=26, gap=2.2):
    # gęste poduszki mchu: wypukłe kępki, jaśniejsze czubki, ciemne
    # zagłębienia między nimi
    r = rng(seed)
    points = scatter(r, count, gap)
    d1, d2, cell = cells(points)
    edge = d2 - d1
    dome = np.clip(edge / 1.5, 0, 1) ** 0.55 + fbm(r, ((8, 0.6), (16, 0.4))) * 0.25
    tone = 0.52 + r.uniform(-0.12, 0.12, len(points))[cell] + light(dome, 1.5) + cavity(dome) * 0.8
    palette = shades(base, 7, 0.5, 1.32, (0.85, 1.0, 1.0))
    rgb = paint(palette, np.clip(normalize(tone) * 0.9 + 0.05, 0, 1), 1)
    # jasne zarodnie / świeże czubki
    for x, y in scatter(r, 7, 3.5):
        rgb[int(y), int(x)] = mix(rgb[int(y), int(x)], (176, 206, 92), 0.6)
    return rgb, edge


def moss_top():
    rgb, _ = moss_cushions(911)
    # mniej kontrastu niż w kępkach - z daleka równy, miękki kobierzec
    rgb = mix(rgb, rgb.reshape(-1, 3).mean(axis=0), 0.3)
    return match(rgb, (98, 138, 54))


def moss_side():
    # ziemia z boku, u góry mech zwisa nierównym brzegiem
    from tekstury import soil
    rgb = soil(915, (150, 72, 18), clod_count=22, pebbles=1)
    moss, _ = moss_cushions(916)
    r = rng(917)
    edge = 4 + (noise(r, 4)[0] * 3.5).astype(int)
    for x in range(N):
        rgb[:edge[x], x] = moss[:edge[x], x]
        rgb[edge[x], x] = rgb[edge[x], x] * 0.7
    # pojedyncze zwisające pasemka
    for x in r.choice(N, 3, replace=False):
        y = edge[x]
        rgb[y, x] = moss[y, x] * 0.9
        if y + 1 < N:
            rgb[y + 1, x] = rgb[y + 1, x] * 0.75
    return rgb


def moss_carpet():
    # kępki mchu leżące na ziemi (płaska dekoracja): kilka poduszek,
    # między nimi przezroczysto
    rgb, _ = moss_cushions(921, count=24)
    r = rng(922)
    blobs = np.zeros((N, N), bool)
    for x, y in scatter(r, 5, 5.0):
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                blobs |= ellipse(x + ox, y + oy, r.uniform(2.3, 3.6), r.uniform(1.8, 3.0), r.uniform(0, 3))
    img = rgba(rgb, np.where(blobs, 255.0, 0))
    # brzeg kępki ciemniejszy (cień przy ziemi)
    solid = blobs
    pad = np.pad(solid, 1, mode='wrap')
    border = solid & ~(pad[1:-1, 2:] & pad[1:-1, :-2] & pad[2:, 1:-1] & pad[:-2, 1:-1])
    img[border, :3] *= 0.78
    return img


# ------------------------------------------------------------
# Rośliny (model 'cross' - przezroczyste tło, kołyszą się na wietrze)
# ------------------------------------------------------------

def stalk(img, r, x0, height, lean, palette, width=1):
    """Źdźbło od dołu (y = 15) w górę: u dołu ciemne, u góry jasne."""
    x = float(x0)
    top = (x0, 15)
    for i in range(height):
        y = 15 - i
        f = i / max(1, height - 1)
        c = palette[min(len(palette) - 1, int(f * (len(palette) - 0.01)))]
        for k in range(width if f < 0.6 else 1):
            put(img, int(round(x)) + k, y, jitter(r, c, 4))
        top = (int(round(x)), y)
        x += lean * (0.3 + f)
    return top


REED_GREEN = [(70, 104, 42), (88, 126, 48), (108, 146, 56), (132, 164, 70), (156, 176, 92)]


def reed():
    # trzcina: wysokie źdźbła z długimi, wąskimi liśćmi i brązowo-
    # fioletowymi wiechami na czubkach
    r = rng(931)
    img = empty()
    tops = []
    for x0, h, lean in [(3, 14, 0.12), (7, 16, -0.05), (10, 15, 0.1), (13, 12, -0.15)]:
        tops.append(stalk(img, r, x0, h, lean, REED_GREEN))
    # liście odchodzące na boki
    for x0, y0, d, length in [(3, 10, -1, 4), (7, 8, 1, 5), (10, 11, -1, 4), (13, 9, 1, 3), (7, 12, -1, 3),
                              (3, 6, 1, 3), (10, 6, 1, 4), (13, 13, -1, 3)]:
        for k in range(1, length + 1):
            put(img, x0 + d * k, y0 - k // 2 + (k * k) // 8, jitter(r, REED_GREEN[2 + (k < 2)], 4))
    # wiechy: zwisające pióropusze
    plume = [(104, 78, 70), (128, 96, 84), (152, 120, 102), (176, 148, 124)]
    for i, (x, y) in enumerate(tops[:3]):
        for k in range(4):
            for dx in (0, 1 if k in (1, 2) else 0):
                put(img, x + dx + (k // 2) * (1 if i % 2 else -1), y + k, plume[(k + dx) % 4])
    return img


def heather():
    # wrzos: niska, gęsta krzewinka - kępa drobnych, igiełkowatych
    # listków, na czubkach gałązek kłosy różowofioletowych kwiatków
    r = rng(941)
    img = empty()
    green = [(46, 66, 38), (60, 84, 44), (76, 102, 52), (92, 120, 60)]
    # kępa: kopuła listków (gęsto u dołu, rzadziej u góry)
    dome = ellipse(8.0, 13.5, 7.2, 6.0)
    for y in range(N):
        for x in range(N):
            if dome[y, x] and r.random() < 0.72 - 0.02 * (13 - y):
                t = 1 - y / N * 0.6 + r.uniform(-0.25, 0.25) - (x - 8) * 0.03
                put(img, x, y, green[int(np.clip(t * 2.2, 0, 3))])
    # zdrewniałe gałązki u samego dołu
    for x in (4, 7, 9, 12):
        put(img, x, 15, (86, 64, 46))
    flowers = [(150, 60, 130), (176, 76, 152), (196, 92, 168), (216, 128, 192)]
    for x0, top, length in [(3, 9, 4), (5, 7, 5), (8, 5, 6), (10, 7, 5), (12, 9, 4), (7, 9, 3)]:
        for k in range(length):
            y = top + k
            c = flowers[min(3, 3 - k // 2 + (r.random() < 0.3))]
            put(img, x0 + (k % 2), y, c)
            if r.random() < 0.55:
                put(img, x0 - 1 + 2 * (k % 2), y, flowers[r.integers(0, 3)])
    return img


def crocus():
    # krokus: fioletowe kielichy z pomarańczowym środkiem, wąskie liście
    # z jasnym paskiem
    r = rng(951)
    img = empty()
    leaf = [(54, 108, 36), (72, 134, 44), (150, 184, 110)]
    for x0, h, lean in [(3, 7, 0.1), (5, 9, -0.05), (9, 8, 0.05), (12, 7, -0.1), (11, 9, 0.1)]:
        stalk(img, r, x0, h, lean, leaf[:2])
        put(img, x0, 15 - h // 2, leaf[2])
    petal = [(112, 64, 170), (136, 86, 196), (162, 116, 218), (190, 156, 232)]
    for cx, top in [(4, 5), (8, 3), (12, 6)]:
        for y in range(top + 4, 16):
            put(img, cx, y, (200, 210, 170) if y > 13 else leaf[0])
        # kielich (3 szerokości, 4 wysokości), ciemniej z prawej
        for dy in range(4):
            for dx in (-1, 0, 1):
                w = 1 if dy in (0, 3) else 1
                if dy == 3 and dx != 0:
                    continue
                c = petal[3 - dy // 2 - (dx > 0)] if dx <= 0 else petal[1]
                put(img, cx + dx, top + dy, c)
        put(img, cx - 1, top - 1, petal[2])
        put(img, cx + 1, top - 1, petal[1])
        put(img, cx, top + 1, (244, 150, 40))
        put(img, cx, top, (250, 196, 70))
    return img


def dune_grass():
    # piaskownica (trawa wydmowa): sztywne, sinozielone, zwinięte liście
    # rozchodzące się kępą od ziemi, kilka kłosów
    r = rng(961)
    img = empty()
    blue = [(92, 120, 96), (112, 142, 110), (134, 162, 126), (158, 182, 144), (184, 200, 164)]
    for x0, h, lean in [(7, 15, -0.05), (8, 15, 0.08), (7, 14, -0.35), (8, 14, 0.35), (6, 13, -0.7), (9, 13, 0.7),
                        (6, 12, -1.05), (9, 12, 1.05), (7, 11, -1.4), (8, 11, 1.45), (6, 9, -1.8), (9, 9, 1.8)]:
        stalk(img, r, x0, h, lean * 0.5, blue)
    spike = [(180, 166, 118), (204, 190, 140), (156, 142, 100)]
    for x, y0 in [(7, 0), (9, 2), (4, 4)]:
        for k in range(4):
            put(img, x + (k > 2) * (1 if x > 7 else -1), y0 + k, spike[k % 3])
    return img


# ------------------------------------------------------------
# Borówka czarna (krzak owocowy: krzak, kilka i dużo owoców, owoce)
# ------------------------------------------------------------

BILBERRY_LEAF = (60, 112, 46)


def blueberry_bush():
    # niska krzewinka: zielone, kanciaste gałązki, gęsto drobne owalne
    # listki (ciemniejsze w głębi kępy)
    r = rng(971)
    img = empty()
    stem_c = (74, 112, 52)
    for x0, h, lean in [(3, 8, -0.15), (6, 10, -0.05), (8, 11, 0.05), (10, 9, 0.12), (13, 7, 0.2)]:
        stalk(img, r, x0, h, lean, [stem_c, (86, 128, 58)])
    leaves = scatter(r, 22, 2.1)
    for cx, cy in leaves:
        cy = 4 + cy * 11 / N
        if abs(cx - 8) > 7 - (15 - cy) * 0.35:
            continue
        shade = 0.82 + 0.25 * (1 - cy / N)
        leaf_sprite(img, cx, cy + 0.5, 1.3, 0.9, r.uniform(-0.7, 0.7), tuple(np.array(BILBERRY_LEAF) * shade), vein=False)
    return img


def berries(img, spots, r):
    dark = (40, 46, 92)
    for x, y in spots:
        put(img, x, y, (62, 74, 146))
        put(img, x + 1, y, (52, 60, 124))
        put(img, x, y + 1, (46, 52, 110))
        put(img, x + 1, y + 1, dark)
        put(img, x, y, (118, 132, 196))       # nalot (jasny błysk)
    return img


def blueberry_bush_few():
    r = rng(972)
    img = blueberry_bush()
    return berries(img, [(4, 10), (9, 8), (11, 11)], r)


def blueberry_bush_full():
    r = rng(973)
    img = blueberry_bush()
    return berries(img, [(3, 8), (6, 11), (8, 6), (10, 9), (12, 12), (5, 5), (12, 7), (2, 12)], r)


def blueberry_item():
    # przedmiot: kilka granatowych jagód z jasnym nalotem i koronką,
    # ciemny obrys (jak inne owoce)
    img = empty()
    palette = [(30, 34, 72), (44, 50, 106), (60, 70, 138), (84, 98, 170), (128, 144, 204)]
    for cx, cy, rr in [(5.5, 9.5, 3.4), (10.5, 9.0, 3.2), (8.0, 4.5, 3.0)]:
        mask = ellipse(cx, cy, rr, rr * 0.95)
        shape = shade_shape(mask, palette, strength=1.5, base=0.5)
        img[mask] = shape[mask]
        # koronka (ciemny kwiatek na czubku)
        put(img, int(cx), int(cy - rr + 1.2), (24, 26, 50))
        put(img, int(cx) + 1, int(cy - rr + 1.2), (36, 40, 72))
    img = outline(img, 0.4)
    # listek
    leaf_sprite(img, 12.5, 3.0, 2.0, 1.1, -0.6, (72, 132, 52))
    return img


# ------------------------------------------------------------
# Paczki drzew z mokradeł: olcha czarna i wierzba biała
# ------------------------------------------------------------

def alder_textures():
    bark = (74, 66, 62)
    wood = (204, 124, 82)           # świeże drewno olchy rudzieje
    heart = (178, 98, 62)
    out = {}
    side = plates_bark(1001, bark, count=12, gap=3.0, stretch=1.7, crack=0.55, crack_color=(40, 34, 32), variation=0.1)
    out['pien_bok.png'] = rgba(match(side, (72, 64, 60)))
    out['pien_gora.png'] = rgba(rings(1003, wood, heart, bark=side))
    out['okorowany_bok.png'] = rgba(match(grain(1005, wood, streaks=6), (198, 120, 80)))
    out['okorowany_gora.png'] = rgba(rings(1007, wood, heart))
    out['deski.png'] = rgba(match(planks(1009, (156, 108, 82)), (150, 104, 80)))
    # ciemne, okrągłe, błyszczące liście
    rgb, alpha = leaf_cells(1011, (52, 98, 40), 26, 2.7, holes=0.12, round_=True, variation=0.1)
    out['liscie.png'] = rgba(rgb, alpha)
    out['sadzonka.png'] = sapling_broadleaf(1013, (80, 66, 58), (56, 104, 42),
                                           [(8.0, 3.4, 0.0), (3.6, 6.6, 0.0), (11.8, 5.8, 0.0), (5.0, 10.4, 0.0)], round_=True)
    out['opadle_liscie.png'] = litter(1015, [(70, 92, 44), (92, 84, 46), (60, 70, 40)], 9)
    out['szyszki.png'] = alder_cones()
    return out


def alder_cones():
    # szyszeczki olchy: małe, ciemnobrązowe, zdrewniałe, po kilka na
    # gałązce
    img = empty()
    for x, y in line_cells(3, 13, 12, 3):
        put(img, x, y, (92, 70, 50))
    palette = [(36, 24, 18), (56, 38, 28), (78, 56, 40), (104, 78, 56), (130, 100, 72)]
    for cx, cy in [(5.0, 10.5), (9.0, 7.0), (12.0, 10.0)]:
        mask = ellipse(cx, cy, 1.9, 2.5, 0.3)
        shape = shade_shape(mask, palette, strength=1.4, base=0.45)
        img[mask] = shape[mask]
        for k in (-1, 0, 1):
            put(img, int(cx) + k, int(cy) + (k % 2), (30, 20, 16))
    return outline(img, 0.45)


def willow_textures():
    bark = (112, 104, 94)
    wood = (226, 206, 178)
    heart = (206, 176, 146)
    out = {}
    side = furrow_bark(1101, bark, ridges=4, depth=1.0, wobble=1.2, cross=0.7)
    out['pien_bok.png'] = rgba(match(side, (108, 100, 90)))
    out['pien_gora.png'] = rgba(rings(1103, wood, heart, bark=side))
    out['okorowany_bok.png'] = rgba(match(grain(1105, wood, streaks=7), (222, 202, 172)))
    out['okorowany_gora.png'] = rgba(rings(1107, wood, heart))
    out['deski.png'] = rgba(match(planks(1109, (214, 192, 156)), (212, 190, 154)))
    out['liscie.png'] = rgba(*willow_leaves())
    out['sadzonka.png'] = willow_sapling()
    out['opadle_liscie.png'] = willow_litter()
    out['bazie.png'] = catkins()
    return out


def willow_leaves():
    # długie, wąskie, srebrzystozielone liście zwisające w dół (spód
    # liścia jaśniejszy), dużo prześwitów
    r = rng(1111)
    base = (112, 146, 90)
    palette = shades(base, 6, 0.55, 1.32, (0.9, 1.0, 1.05))
    tone = np.full((N, N), -1.0)
    for _ in range(46):
        x0, y0 = r.uniform(0, N, 2)
        length = int(r.integers(4, 7))
        a = np.pi / 2 + r.uniform(-0.45, 0.45)
        t0 = r.uniform(0.3, 0.7)
        for k in range(length):
            x = int(round(x0 + np.cos(a) * k)) % N
            y = int(round(y0 + np.sin(a) * k)) % N
            v = t0 + (0.25 if k == 0 else 0) - 0.05 * k + (0.3 if r.random() < 0.15 else 0)
            tone[y, x] = max(tone[y, x], v)
    filled = tone >= 0
    pick = fbm(r, ((8, 0.6), (16, 0.4))) + np.where(filled, 1.0, 0)
    hole = pick <= np.quantile(pick, 0.2)
    tone[~filled] = 0.1
    rgb = paint(palette, np.clip(tone, 0, 1), 0)
    # srebrzysty spód liści
    silver = filled & (fbm(r, ((8, 1.0),)) > 0.62)
    rgb[silver] = mix(rgb[silver], (196, 212, 186), 0.45)
    return rgb, np.where(hole, 0, 255.0)


def willow_sapling():
    img = empty()
    stem_c = (150, 118, 70)
    for y in range(5, 16):
        put(img, 7, y, stem_c)
    for x, y in line_cells(7, 9, 3, 5) + line_cells(7, 7, 12, 4):
        put(img, x, y, stem_c)
    r = rng(1113)
    for cx, cy, a in [(3.0, 7.5, 1.7), (5.0, 7.8, 1.5), (11.5, 6.5, 1.6), (12.8, 7.0, 1.4), (8.5, 4.0, 1.5),
                      (6.0, 4.5, 1.7), (9.5, 9.5, 1.5)]:
        leaf_sprite(img, cx, cy + 1.0, 2.2, 0.7, a + r.uniform(-0.1, 0.1), (110, 148, 88), vein=False)
    return img


def willow_litter():
    r = rng(1115)
    img = empty()
    colors = [(206, 186, 82), (176, 168, 74), (146, 152, 80)]
    for x, y in scatter(r, 10, 3.0):
        a = r.uniform(0, np.pi)
        color = np.array(colors[r.integers(len(colors))], float)
        mask = np.zeros((N, N), bool)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                mask |= ellipse(x + ox, y + oy, 2.6, 0.75, a)
        shape = shade_shape(mask, shades(color, 5, 0.65, 1.22), strength=0.9, base=0.6)
        img[mask] = shape[mask]
    return img


def catkins():
    # bazie: puszyste, srebrzyste kotki na brązowej witce
    img = empty()
    for x, y in line_cells(2, 14, 13, 2):
        put(img, x, y, (120, 74, 48))
    palette = [(150, 152, 150), (184, 186, 182), (214, 216, 210), (236, 238, 232), (250, 250, 246)]
    for cx, cy in [(5.0, 9.0), (9.5, 4.5), (10.0, 10.0)]:
        mask = ellipse(cx, cy, 2.4, 1.6, -0.8)
        shape = shade_shape(mask, palette, strength=1.2, base=0.55)
        img[mask] = shape[mask]
        put(img, int(cx) - 1, int(cy) + 1, (128, 110, 60))
    return outline(img, 0.5)


# ------------------------------------------------------------

def generate_atlas():
    tiles = {
        'reed': reed(), 'heather': heather(), 'crocus': crocus(), 'dune_grass': dune_grass(),
        'blueberry_bush': blueberry_bush(), 'blueberry_bush_few': blueberry_bush_few(),
        'blueberry_bush_full': blueberry_bush_full(), 'blueberry': blueberry_item(),
        'snow': rgba(snow()), 'moss_top': rgba(moss_top()), 'moss_side': rgba(moss_side()),
        'moss_carpet': moss_carpet(),
    }
    return tiles


def save_packs():
    packs = {'olcha': alder_textures(), 'wierzba': willow_textures()}
    for folder, textures in packs.items():
        os.makedirs(os.path.join(DRZEWA, folder), exist_ok=True)
        for name, img in textures.items():
            as_image(img).save(os.path.join(DRZEWA, folder, name), optimize=True)
    return packs


def main():
    atlas = Image.open(ATLAS).convert('RGBA')
    tiles = generate_atlas()
    for name, img in tiles.items():
        x, y = TILES[name]
        atlas.paste(Image.new('RGBA', (N, N), (0, 0, 0, 0)), (x * N, y * N))
        atlas.paste(as_image(img), (x * N, y * N))
    atlas.save(ATLAS)
    packs = save_packs()
    print('Gotowe:', len(tiles), 'tekstur w', os.path.relpath(ATLAS, ROOT), '+ paczki drzew:',
          ', '.join(f'{k} ({len(v)})' for k, v in packs.items()))
    if len(sys.argv) > 1:
        preview({**tiles, **{f'olcha/{k}': v for k, v in packs['olcha'].items()},
                 **{f'wierzba/{k}': v for k, v in packs['wierzba'].items()}}, sys.argv[1])


def preview(tiles, path):
    scale = 8
    names = list(tiles)
    columns = 8
    rows = (len(names) + columns - 1) // columns
    cell = N * scale + 10
    sheet = Image.new('RGBA', (columns * cell, rows * cell), (70, 74, 86, 255))
    for i, name in enumerate(names):
        tile = as_image(tiles[name]).resize((N * scale, N * scale), Image.NEAREST)
        sheet.alpha_composite(tile, ((i % columns) * cell, (i // columns) * cell))
    sheet.save(path)


if __name__ == '__main__':
    main()
