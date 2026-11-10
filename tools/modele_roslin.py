# ------------------------------------------------------------
# TEKSTURY POZIOMÓW MODELI ROŚLIN (src/blocks/plantModels.js)
#
# Rysuje regiony 16 x 16 w assets/textures/rosliny.png:
#   klucze logiczne: assets/models/rosliny/<roślina>/...
#   polrealistyczny.png - arkusz części dla modelu z płaszczyzn
#                         (kwiat z boku, z góry, liść, łodyga, płatek -
#                         układ: src/rendering/PlaneModelGeometry.js),
#   prosty-<etap>.png   - zwykły obrazek na skrzyżowanych płaszczyznach
#                         (tylko roślinom, które go nie mają w atlasie).
#
# Piksele są tu narysowane literami (paleta niżej) - łatwo poprawić
# jeden piksel. Po zmianie: python3 tools/modele_roslin.py
# Regiony PNG można też malować ręcznie - skrypt nadpisze je tylko po
# uruchomieniu. Opcjonalny katalog poza assets eksportuje luźne podglądy.
# ------------------------------------------------------------

import os
import sys
from pathlib import Path

from PIL import Image
from atlasy import region, write_texture

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'models', 'rosliny')

# Zieleń wspólna z teksturami roślin w atlasie (terrain.png, wiersz 2).
GREEN = {
    'g': (50, 124, 32),     # liść / łodyga
    'G': (70, 150, 38),     # jaśniejszy
    'l': (92, 176, 46),     # światło na liściu
    'n': (36, 96, 26),      # cień
}


def sheet(rows, palette):
    """16 wierszy po 16 znaków; '.' - przezroczysty."""
    assert len(rows) == 16, len(rows)
    image = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    colors = {**GREEN, **palette}
    for y, row in enumerate(rows):
        assert len(row) == 16, (y, row)
        for x, char in enumerate(row):
            if char != '.':
                image.putpixel((x, y), (*colors[char], 255))
    return image


def join(top_left, top_right, bottom_left, stem, petal):
    """Składa arkusz z części: 8x8, 8x8, 8x8, 2x8, 6x8 (listy napisów)."""
    rows = []
    for y in range(8):
        rows.append(top_left[y] + top_right[y])
    for y in range(8):
        rows.append(bottom_left[y] + stem[y] + petal[y])
    return rows


# --- Mak: kielich czerwonych płatków z ciemnym środkiem ----------------

POPPY = {
    'r': (188, 34, 30), 'R': (215, 43, 33), 'L': (236, 84, 62), 'd': (138, 22, 20),
    'k': (40, 28, 30), 'y': (96, 92, 40),
}

POPPY_SHEET = join(
    [  # kwiat z boku
        '........',
        '.r.RR.r.',
        'rRLRRLRr',
        'rRRRRRRr',
        '.rRRRRr.',
        '.drRRrd.',
        '..dkkd..',
        '...gg...',
    ],
    [  # kwiat z góry
        '..rRRr..',
        '.rRLLRr.',
        'rRRddRRr',
        'RLdkykdR',
        'RLdkykdR',
        'rRRddRRr',
        '.rRRRRr.',
        '..rRRr..',
    ],
    [  # liść (pierzasto wcinany)
        '...l....',
        '..gGl...',
        '.g.Gl.g.',
        '..gGlGg.',
        '.ggGlg..',
        'gGgGlgg.',
        '.ngGgn..',
        '...gn...',
    ],
    ['gG', 'gG', 'nG', 'gG', 'gl', 'gG', 'nG', 'gG'],
    [  # płatek
        '.rRRr.',
        'rRLLRr',
        'rRLRRr',
        'RRRRRr',
        'rRRRRr',
        'drRRrd',
        '.drrd.',
        '..dd..',
    ],
)


# --- Chaber: postrzępiona, niebieska główka ----------------------------

CORNFLOWER = {
    'b': (54, 86, 194), 'B': (74, 112, 222), 'L': (118, 156, 244), 'D': (40, 62, 150),
    'k': (66, 44, 116), 'm': (98, 120, 92),
}

CORNFLOWER_SHEET = join(
    [
        'b..b..b.',
        '.bBLBLb.',
        'bBLBBLBb',
        '.BBkkBB.',
        '.DBkkBD.',
        '..mggm..',
        '...gg...',
        '...gg...',
    ],
    [
        'b..b..b.',
        '.bBLBBb.',
        '.BLBBLBb',
        'bBBkkBB.',
        '.BBkkBBb',
        'bBLBBLB.',
        '.bBBLBb.',
        '.b..b..b',
    ],
    [  # wąski, lancetowaty liść
        '....l...',
        '...gl...',
        '...Gl...',
        '..gGl...',
        '..gGlg..',
        '..nGlg..',
        '...gGn..',
        '....g...',
    ],
    ['gG', 'gG', 'gl', 'gG', 'nG', 'gG', 'gl', 'nG'],
    [  # pąk
        '......',
        '..bB..',
        '.bBLb.',
        '.mBBm.',
        '.gmmg.',
        '..gg..',
        '..gG..',
        '..gG..',
    ],
)


# --- Mniszek: puszysta, żółta główka, liście z ząbkami -------------------

DANDELION = {
    'y': (233, 177, 25), 'Y': (246, 204, 32), 'L': (255, 228, 92), 'o': (196, 140, 18),
}

DANDELION_SHEET = join(
    [
        '........',
        '..yYYy..',
        '.yYLLYy.',
        'yYYLLYYy',
        'yYYYYYYy',
        '.oyYYyo.',
        '..gGGg..',
        '...gg...',
    ],
    [
        '..yYYy..',
        '.yYLLYy.',
        'yYLYYLYy',
        'YLYooYLY',
        'YLYooYLY',
        'yYLYYLYy',
        '.yYLLYy.',
        '..yYYy..',
    ],
    [  # długi liść z ząbkami
        '....l...',
        '...gGl..',
        '..ggGl..',
        '...gGlg.',
        '..ggGl..',
        '...gGlgg',
        '.ggnGl..',
        '...ngg..',
    ],
    ['GG', 'gG', 'gl', 'GG', 'gG', 'gl', 'gG', 'nG'],
    [  # zamknięty pąk
        '......',
        '..yy..',
        '.yYLy.',
        '.oYYo.',
        '.gooG.',
        '..gG..',
        '..gG..',
        '..gG..',
    ],
)


# --- Rumianek: białe języczki, żółty, wypukły środek --------------------

CHAMOMILE = {
    'w': (217, 217, 207), 'W': (236, 236, 228), 'L': (250, 250, 244), 's': (186, 186, 176),
    'y': (226, 178, 30), 'Y': (246, 210, 58),
}

CHAMOMILE_SHEET = join(
    [
        '........',
        '........',
        '...YY...',
        '..yYYy..',
        'wWLyyLWw',
        's.wWWw.s',
        '...gg...',
        '...g....',
    ],
    [
        '...W....',
        '.w.L..w.',
        '..wLwW..',
        'WLwYYwLW',
        '.WwyYwW.',
        '..WwLw..',
        '.w..L.w.',
        '....w...',
    ],
    [  # pierzasty, drobny liść
        '.l...l..',
        '..g.g...',
        '.l.G.l..',
        '..gGg...',
        '.g.G.g..',
        '..nGg...',
        '...G....',
        '...g....',
    ],
    ['gG', 'gl', 'gG', 'gG', 'nG', 'gG', 'gl', 'gG'],
    [  # pąk (żółty guziczek)
        '......',
        '......',
        '..YY..',
        '.yYYy.',
        '.swws.',
        '..gg..',
        '..gG..',
        '..gG..',
    ],
)


# --- Lawenda: fioletowe kłosy, szarozielone liście ---------------------

LAVENDER = {
    'p': (94, 57, 138), 'P': (144, 100, 192), 'L': (173, 132, 214), 'q': (116, 74, 163),
    'v': (118, 150, 92), 'V': (150, 178, 116), 'u': (84, 112, 66),
}

LAVENDER_SHEET = join(
    [  # kłos z boku
        '...P....',
        '..qLq...',
        '..PLP...',
        '..qPq...',
        '..pPp...',
        '..qLq...',
        '..pPp...',
        '...v....',
    ],
    [  # kłos z góry
        '........',
        '...q....',
        '..qPq...',
        '.qPLPq..',
        '..qPq...',
        '...q....',
        '........',
        '........',
    ],
    [  # wąski, srebrzysty liść
        '...V....',
        '...vV...',
        '..uvV...',
        '...vV...',
        '..uvV...',
        '...vV...',
        '..uvV...',
        '...uv...',
    ],
    ['vV', 'vV', 'uV', 'vV', 'vV', 'uV', 'vV', 'vV'],
    [  # długi kłos (6 x 8)
        '..L...',
        '.qLq..',
        '.PLPq.',
        '.qPP..',
        '.PLPq.',
        '.qPq..',
        '.pPp..',
        '..v...',
    ],
)

LAVENDER_SIMPLE = [
    [  # 1: młoda - kępka liści
        '................',
        '................',
        '................',
        '................',
        '................',
        '................',
        '.......V........',
        '..V....vV...V...',
        '..vV..uvV..Vv...',
        '...vV.uv..Vv....',
        '...uv.uvV.vu.V..',
        '.V..vVuvVvu.Vv..',
        '.vV.uvuvvuvVv...',
        '..vVuvvuvvVvu...',
        '...uvvuvvuvu....',
        '.....uuvuu......',
    ],
    [  # 2: pąki na łodygach
        '................',
        '................',
        '.....q....q.....',
        '....qp...qPq....',
        '.....q.q..p.....',
        '.....v.qPqv..q..',
        '......v.p.v.qp..',
        '..q...v.v.v..v..',
        '..pq..vV.vV.v...',
        '...vV.uvVvV.v...',
        '...uv.uvvvVvu...',
        '.V..vVuvVvuVv...',
        '.vV.uvuvvuvVv...',
        '..vVuvvuvvVvu...',
        '...uvvuvvuvu....',
        '.....uuvuu......',
    ],
    [  # 3: kwitnie - fioletowe kłosy
        '....L......L....',
        '...qLq....qLq...',
        '...PLP.L..PLP...',
        '...qPqqLq.qPq...',
        '...PLPPLP.PLP.L.',
        '.L.qPqqPq.qPqqLq',
        'qLq.v.pPp..v.PLP',
        'PLP.v..v...v.qPq',
        'qPq.vV.v..Vv..v.',
        '.v...vVvV.v..v..',
        '..v..uvvVvV.v...',
        '.V.v.uvvvVvuv...',
        '.vVvuvuvvuvVv...',
        '..vVuvvuvvVvu...',
        '...uvvuvvuvu....',
        '.....uuvuu......',
    ],
]



# ============================================================
# SZABLONY - pozostałe rośliny (0.65.0)
#
# Części arkusza narysowane literami ogólnymi; kolory bierze roślina
# (paleta z kolorów paczki albo podana niżej):
#   g liść  G liść jaśniejszy  l światło na liściu  n cień liścia
#   s łodyga  F kwiat  H kwiat jasny  D kwiat ciemny  C środek  K środek
#   ciemny  B pąk  R owoc  P owoc jasny  Q owoc ciemny  w odblask
# ============================================================

LEAVES = {
    'klapowany': [row[:8] for row in POPPY_SHEET[8:16]],
    'lancetowaty': [row[:8] for row in CORNFLOWER_SHEET[8:16]],
    'zabkowany': [row[:8] for row in DANDELION_SHEET[8:16]],
    'pierzasty': [row[:8] for row in CHAMOMILE_SHEET[8:16]],
    'zdzblo': [
        '...l..g.',
        '...G..g.',
        '..gG.gl.',
        '..gl.gG.',
        '.ngG.Gg.',
        '.gGlgGn.',
        '.nGgGgn.',
        '..ngGn..',
    ],
    'owalny': [
        '...ll...',
        '..gGlg..',
        '.gGGlGg.',
        '.gGGlGg.',
        '.ngGlGn.',
        '..ngGn..',
        '...gs...',
        '...s....',
    ],
    'trojlistek': [
        '.ll..ll.',
        'gGlggGlg',
        'gGGggGGn',
        '.ngllgn.',
        '..gGGg..',
        '..nGGn..',
        '...ss...',
        '...s....',
    ],
    'paproc': [
        '...l....',
        '..lgl...',
        '.lgGgl..',
        '..gGg...',
        'lgGgGgl.',
        '.ngGgn..',
        'ngGsGgn.',
        '...s....',
    ],
    'pokrzywa': [
        '...l....',
        '..gGl...',
        '.gGGlg..',
        'ngGGlGg.',
        '.gGlGGn.',
        'ngGlGgn.',
        '.nggGn..',
        '...s....',
    ],
    'igly': [
        'l..l..l.',
        '.lgGgl..',
        'g.gGg.g.',
        '.ngGgn..',
        'n.gGg.n.',
        '.ngGgn..',
        '..nsn...',
        '...s....',
    ],
    'drzewny': [
        '..lll...',
        '.lGGGl..',
        'gGGlGGg.',
        'gGlGGGg.',
        'ngGGGgn.',
        '.ngGgn..',
        '..nsn...',
        '...s....',
    ],
    'kepka': [
        '.l..ll..',
        'lGllGGl.',
        'gGGgGlg.',
        'ngGGlGgn',
        'gGlGGGgn',
        'ngGgGgn.',
        '.nggnn..',
        '........',
    ],
    'waski': [row[:8].translate(str.maketrans('Vvu', 'lGn')) for row in LAVENDER_SHEET[8:16]],
}

STEM = ['ss', 'sG', 'ss', 'ns', 'ss', 'sG', 'ss', 'ns']

# Kwiaty: (z boku 8x8, z góry 8x8, płatek/owoc 6x8).
FLOWERS = {
    'kielich': (
        ['........', '.F.HH.F.', 'FHHHHHHF', 'FHHFFHHF', '.FHFFHF.', '.DFFFFD.', '..DKKD..', '...ss...'],
        ['..FHHF..', '.FHHHHF.', 'FHFDDFHF', 'HFDKKDFH', 'HFDKKDFH', 'FHFDDFHF', '.FHHHHF.', '..FHHF..'],
        ['.FHHF.', 'FHHHHF', 'FHHFHF', 'FHFFHF', 'FHFFFF', 'DFFFFD', '.DFFD.', '..DD..'],
    ),
    'gwiazda': (
        ['F..F..F.', '.FHHHF..', 'FHHFHHF.', '.HFKKFH.', '.DFKKFD.', '..sGGs..', '...ss...', '...ss...'],
        ['F..F..F.', '.FHFHF.F', '.HFHHFHF', 'FHHKKHH.', '.HHKKHHF', 'FHFHHFH.', '.FHHFHF.', '.F..F..F'],
        ['......', '..FH..', '.FHHF.', '.BFFB.', '.sBBs.', '..ss..', '..sG..', '..sG..'],
    ),
    'pompon': (
        ['........', '..FHHF..', '.FHHHHF.', 'FHHHHHHF', 'FHFHHFHF', '.DFFFFD.', '..sGGs..', '...ss...'],
        ['..FHHF..', '.FHHHHF.', 'FHHFFHHF', 'HHFCCFHH', 'HHFCCFHH', 'FHHFFHHF', '.FHHHHF.', '..FHHF..'],
        ['......', '..FF..', '.FHHF.', '.DFFD.', '.sDDs.', '..sG..', '..sG..', '..sG..'],
    ),
    'koszyczek': (
        ['........', '........', '...CC...', '..KCCK..', 'FHFKKFHF', 'D.FHHF.D', '...ss...', '...s....'],
        ['...H....', '.F.H..F.', '..FHFH..', 'HHFCCFHH', '.HFKCFH.', '..HFHF..', '.F..H.F.', '....F...'],
        ['......', '......', '..CC..', '.KCCK.', '.DFFD.', '..ss..', '..sG..', '..sG..'],
    ),
    'klos': (
        ['...H....', '..FHF...', '..HHH...', '..FHF...', '..DHD...', '..FHF...', '..DFD...', '...s....'],
        ['........', '...F....', '..FHF...', '.FHHHF..', '..FHF...', '...F....', '........', '........'],
        ['..H...', '.FHF..', '.HHHF.', '.FHF..', '.HHHF.', '.FHF..', '.DFD..', '..s...'],
    ),
    'dzwonek': (
        ['...ss...', '...ss...', '..FHHF..', '.FHHHHF.', '.FHHHHF.', 'FHHFFHHF', 'F.DCCD.F', '...C....'],
        ['..FHHF..', '.FHHHHF.', 'FHHDDHHF', 'HHDCCDHH', 'HHDCCDHH', 'FHHDDHHF', '.FHHHHF.', '..FHHF..'],
        ['......', '..FH..', '.FHHF.', '.FHHF.', 'FHHHHF', 'F.DD.F', '..ss..', '..sG..'],
    ),
    'baldach': (
        ['........', '........', 'H.F.H.F.', 'FHFHFHFH', '.s.s.s..', '..sss...', '...s....', '...s....'],
        ['.H..F.H.', 'F.HF.HF.', '.HFHHFH.', 'H.FCHF.H', '.FHHCFH.', 'HF.HF.FH', '.HF.HF..', '..H..F..'],
        ['......', '.H.F..', 'FHFHF.', '.s.s..', '..ss..', '..s...', '..sG..', '..sG..'],
    ),
    'grono': (
        ['...s....', '..FsF...', '.FHFHF..', '..HFH...', '.FHFHF..', '..FHF...', '...D....', '........'],
        ['........', '..F.F...', '.FHFHF..', '..HFH...', '.FHFHF..', '..F.F...', '........', '........'],
        ['..s...', '.FsF..', 'FHFHF.', '.HFH..', 'FHFHF.', '.FHF..', '.DFD..', '..D...'],
    ),
    'straczki': (
        ['...B....', '..BsB...', '.B.s.B..', '.B.s.B..', 'BB.s.BB.', '.B.s.B..', '...s....', '...s....'],
        ['........', '...B....', '..BsB...', '.B.s.B..', '..BsB...', '...B....', '........', '........'],
        ['.B..B.', '.B..B.', 'BB.sBB', 'BBssBB', '.Bs.B.', '.BssB.', '..ss..', '..s...'],
    ),
    'jagody': (
        ['........', '..RP....', '.RRPQ.R.', '.QRQ.RPQ', '..Q..QR.', '...s....', '...s....', '...s....'],
        ['........', '..RP.R..', '.RPRQRP.', '.QRwRRQ.', '..QRPQ..', '...Q....', '........', '........'],
        ['......', '.RP...', 'RPRQ..', 'QRwRP.', '.QRPRQ', '..QRQ.', '...Q..', '......'],
    ),
    'papryczki': (
        ['...s....', '..sGs...', '..RPR...', '..RPR...', '..RRQ...', '...RQ...', '...Q....', '........'],
        ['........', '...s....', '..RPR...', '.RPRRQ..', '..RRQ...', '...Q....', '........', '........'],
        ['..s...', '.sGs..', '.RPR..', '.RPR..', '.RRQ..', '..RQ..', '..RQ..', '..Q...'],
    ),
}

FRUIT = {
    'strawberry': ((214, 40, 40), (240, 96, 80), (150, 24, 28)),
    'blackberry': ((52, 34, 74), (96, 72, 128), (28, 18, 44)),
    'chili': ((206, 36, 24), (238, 84, 52), (140, 20, 18)),
    'hazel': ((150, 104, 52), (190, 146, 84), (104, 70, 34)),
    'blueberry': ((58, 76, 150), (98, 122, 196), (34, 44, 98)),
}


def hexrgb(value):
    return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, t=0.5):
    return tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))


def palette(colors, fruit=None):
    c = {k: hexrgb(v) if isinstance(v, str) else v for k, v in colors.items()}
    leaf = c.get('lisc', (80, 128, 50))
    light = c.get('liscJasny', mix(leaf, (255, 255, 200), 0.3))
    dark = c.get('liscCiemny', mix(leaf, (0, 0, 0), 0.35))
    flower = c.get('kwiat', (220, 200, 120))
    flight = c.get('kwiatJasny', mix(flower, (255, 255, 255), 0.35))
    fdark = c.get('kwiatCiemny', mix(flower, (0, 0, 0), 0.3))
    center = c.get('srodek', mix(flower, (240, 200, 60), 0.6))
    out = {
        'g': leaf, 'G': mix(leaf, light), 'l': light, 'n': dark, 's': c.get('lodyga', mix(leaf, dark)),
        'F': flower, 'H': flight, 'D': fdark, 'C': center, 'K': mix(center, (0, 0, 0), 0.35),
        'B': c.get('pak', mix(flower, leaf, 0.4)), 'w': (250, 245, 235),
    }
    if fruit:
        out.update({'R': fruit[0], 'P': fruit[1], 'Q': fruit[2]})
    return out


def templated(leaf, flower):
    side, top, petal = FLOWERS[flower]
    return join(side, top, LEAVES[leaf], STEM, petal)


# Rośliny: nazwa folderu -> (liść, kwiat, kolory, owoc).
# Kolory paczek - z assets/rosliny/<paczka>/roslina.json ("kolory").

VANILLA = {
    'krotka-trawa': ('zdzblo', 'klos', {'lisc': '#5a9e34', 'liscJasny': '#7cbf48', 'liscCiemny': '#3c7a26', 'lodyga': '#4c8a2c', 'kwiat': '#8aa858'}),
    'wysoka-trawa': ('zdzblo', 'klos', {'lisc': '#5a9e34', 'liscJasny': '#86c650', 'liscCiemny': '#3c7a26', 'lodyga': '#4c8a2c', 'kwiat': '#a0ac6a', 'kwiatJasny': '#c2c88a', 'kwiatCiemny': '#7a8648'}),
    'paproc': ('paproc', 'klos', {'lisc': '#4a8a2a', 'liscJasny': '#6eae3c', 'liscCiemny': '#2e6420', 'lodyga': '#3c7024'}),
    'koniczyna': ('trojlistek', 'pompon', {'lisc': '#4c9a30', 'liscJasny': '#70ba48', 'liscCiemny': '#317022', 'lodyga': '#43852a', 'kwiat': '#e8a2c4', 'kwiatJasny': '#f8cce0', 'kwiatCiemny': '#b86a94', 'srodek': '#f0b8d2'}),
    'pokrzywa': ('pokrzywa', 'grono', {'lisc': '#3e7a28', 'liscJasny': '#5c9c38', 'liscCiemny': '#24561a', 'lodyga': '#3a6a22', 'kwiat': '#9aaa6a', 'kwiatJasny': '#bcc888', 'kwiatCiemny': '#6e7a44'}),
    'babka': ('owalny', 'klos', {'lisc': '#4a8a30', 'liscJasny': '#6aa848', 'liscCiemny': '#2e6420', 'lodyga': '#5a7a3a', 'kwiat': '#8a7a52', 'kwiatJasny': '#b8a878', 'kwiatCiemny': '#5e5034'}),
    'trzcina': ('zdzblo', 'klos', {'lisc': '#7a9a4a', 'liscJasny': '#9ab868', 'liscCiemny': '#56702e', 'lodyga': '#86964c', 'kwiat': '#8a6a4a', 'kwiatJasny': '#b08e6a', 'kwiatCiemny': '#5e4430'}),
    'wrzos': ('igly', 'grono', {'lisc': '#4a6a3a', 'liscJasny': '#6a8a52', 'liscCiemny': '#2e4a26', 'lodyga': '#5a4a34', 'kwiat': '#c46aa8', 'kwiatJasny': '#e090c8', 'kwiatCiemny': '#8e4478'}),
    'krokus': ('waski', 'kielich', {'lisc': '#5a8a3a', 'liscJasny': '#7aaa52', 'liscCiemny': '#3a6428', 'lodyga': '#c8d0a0', 'kwiat': '#9a6ad0', 'kwiatJasny': '#bc96e8', 'kwiatCiemny': '#6a42a0', 'srodek': '#f0a830'}),
    'trawa-wydmowa': ('zdzblo', 'klos', {'lisc': '#9aaa7a', 'liscJasny': '#bcc89a', 'liscCiemny': '#6e7c54', 'lodyga': '#a8b080', 'kwiat': '#c8c098', 'kwiatJasny': '#e0dab8', 'kwiatCiemny': '#9a9070'}),
    # Sadzonki drzew
    'sadzonka-swierk': ('igly', 'klos', {'lisc': '#2e5e3a', 'liscJasny': '#4a7e52', 'liscCiemny': '#1c3e26', 'lodyga': '#6a4a30'}),
    'sadzonka-sosna': ('igly', 'klos', {'lisc': '#4a7a3a', 'liscJasny': '#6a9a52', 'liscCiemny': '#2e5226', 'lodyga': '#7a5638'}),
    'sadzonka-buk': ('drzewny', 'klos', {'lisc': '#5a9a34', 'liscJasny': '#7cba4a', 'liscCiemny': '#3a7024', 'lodyga': '#7a6a5a'}),
    'sadzonka-lipa': ('drzewny', 'klos', {'lisc': '#5aa03a', 'liscJasny': '#80c054', 'liscCiemny': '#3a7428', 'lodyga': '#6a5040'}),
    'sadzonka-dab': ('klapowany', 'klos', {'lisc': '#4e8a2a', 'liscJasny': '#70aa3e', 'liscCiemny': '#32621e', 'lodyga': '#6a4a30'}),
    'sadzonka-brzoza': ('drzewny', 'klos', {'lisc': '#78b040', 'liscJasny': '#9ccc5a', 'liscCiemny': '#4e8228', 'lodyga': '#e0dcd0'}),
    'sadzonka-jablon': ('drzewny', 'klos', {'lisc': '#4e9a32', 'liscJasny': '#72ba4a', 'liscCiemny': '#317022', 'lodyga': '#6a4e3a'}),
    'sadzonka-olcha': ('drzewny', 'klos', {'lisc': '#3e7e2e', 'liscJasny': '#5e9e40', 'liscCiemny': '#265a1e', 'lodyga': '#5a4a40'}),
    'sadzonka-wierzba': ('waski', 'klos', {'lisc': '#7aa04a', 'liscJasny': '#9cbe66', 'liscCiemny': '#527430', 'lodyga': '#8a7a4a'}),
    # Nowe gatunki zachowują paletę sadzonek z paczek drzew.
    'sadzonka-akacja': ('pierzasty', 'klos', {'lisc': '#71913e', 'liscJasny': '#91ab5a', 'liscCiemny': '#526e2d', 'lodyga': '#75604b'}),
    'sadzonka-cyprysnik': ('igly', 'klos', {'lisc': '#4b7e34', 'liscJasny': '#6b984c', 'liscCiemny': '#315726', 'lodyga': '#80674e'}),
    'sadzonka-wisnia': ('drzewny', 'klos', {'lisc': '#da88a9', 'liscJasny': '#f2b4cf', 'liscCiemny': '#ac6086', 'lodyga': '#6e4e4b'}),
    # 0.83.0 - kolory z liści paczek Kamila.
    'sadzonka-klon': ('klapowany', 'klos', {'lisc': '#d6542a', 'liscJasny': '#f08a32', 'liscCiemny': '#a8361e', 'lodyga': '#5a4232'}),
    'sadzonka-kosodrzewina': ('igly', 'klos', {'lisc': '#2c5c34', 'liscJasny': '#467a46', 'liscCiemny': '#1a3e22', 'lodyga': '#5a4a40'}),
    'sadzonka-oliwka': ('waski', 'klos', {'lisc': '#7c8a60', 'liscJasny': '#9ca87e', 'liscCiemny': '#5a6644', 'lodyga': '#6a5640'}),
    'sadzonka-eukaliptus': ('lancetowaty', 'klos', {'lisc': '#3a8048', 'liscJasny': '#58a064', 'liscCiemny': '#245a30', 'lodyga': '#a8b060'}),
    'sadzonka-sekwoja': ('igly', 'klos', {'lisc': '#608846', 'liscJasny': '#80a660', 'liscCiemny': '#40622e', 'lodyga': '#8a4a30'}),
    # Rośliny nad wodą
    'turzyca': ('zdzblo', 'klos', {'lisc': '#668943', 'liscJasny': '#83a452', 'liscCiemny': '#456c37', 'lodyga': '#6a8142', 'kwiat': '#80914c'}),
    'palka': ('zdzblo', 'klos', {'lisc': '#668943', 'liscJasny': '#83a452', 'liscCiemny': '#456c37', 'lodyga': '#6a8142', 'kwiat': '#765037', 'kwiatJasny': '#9b7951', 'kwiatCiemny': '#4e3424'}),
    'krwawnica': ('lancetowaty', 'klos', {'lisc': '#668943', 'liscJasny': '#83a452', 'liscCiemny': '#456c37', 'lodyga': '#456c37', 'kwiat': '#ad659b', 'kwiatJasny': '#cb85ad', 'kwiatCiemny': '#7e4470'}),
}

BUSHES = {
    'truskawka': ('kepka', 'jagody', {'lisc': '#3e8a2e', 'liscJasny': '#62aa42', 'liscCiemny': '#265e1e', 'lodyga': '#4a7a2a'}, 'strawberry'),
    'jezyna': ('kepka', 'jagody', {'lisc': '#3a7a2a', 'liscJasny': '#5a9a3c', 'liscCiemny': '#22521a', 'lodyga': '#5a4a2a'}, 'blackberry'),
    'chili': ('kepka', 'papryczki', {'lisc': '#3e8a2e', 'liscJasny': '#62aa42', 'liscCiemny': '#265e1e', 'lodyga': '#4a7a2a'}, 'chili'),
    'leszczyna': ('drzewny', 'jagody', {'lisc': '#4a8a2e', 'liscJasny': '#6eaa44', 'liscCiemny': '#2e601e', 'lodyga': '#6a5038'}, 'hazel'),
    'borowka': ('kepka', 'jagody', {'lisc': '#3a7a3a', 'liscJasny': '#5a9a4e', 'liscCiemny': '#22522a', 'lodyga': '#5a6a3a'}, 'blueberry'),
}

# Paczki roślin: paczka -> (liść, kwiat). Kolory z roslina.json.
PACKS = {
    'amarantus': ('lancetowaty', 'grono'),
    'kocanka': ('waski', 'baldach'),
    'piwonia': ('klapowany', 'pompon'),
    'zawilec': ('pierzasty', 'koszyczek'),
    'dzwonek': ('lancetowaty', 'dzwonek'),
    'szalwia': ('owalny', 'klos'),
    'nagietek': ('lancetowaty', 'koszyczek'),
    'cynia': ('owalny', 'pompon'),
    'mikolajek': ('zabkowany', 'gwiazda'),
    'len': ('waski', 'gwiazda'),
    'gorczyca': ('zabkowany', 'straczki'),
    'indygowiec': ('drzewny', 'grono'),
    'marzanna': ('igly', 'baldach'),
}

AMARANTUS_COLORS = {'lisc': '#4a7a2a', 'liscJasny': '#6e9a3e', 'liscCiemny': '#2e5a1c', 'lodyga': '#7a3a3a',
                    'kwiat': '#9a1e3e', 'kwiatJasny': '#c43a5a', 'kwiatCiemny': '#6a1028'}


def pack_colors(pack):
    import json
    path = os.path.join(ROOT, '..', '..', 'rosliny', pack, 'roslina.json')
    with open(path, encoding='utf-8') as f:
        colors = json.load(f).get('kolory') or {}
    return colors or AMARANTUS_COLORS


SHEETS = {
    'mak': (POPPY_SHEET, POPPY),
    'chaber': (CORNFLOWER_SHEET, CORNFLOWER),
    'mniszek': (DANDELION_SHEET, DANDELION),
    'rumianek': (CHAMOMILE_SHEET, CHAMOMILE),
    'lawenda': (LAVENDER_SHEET, LAVENDER),
}

for name, (leaf, flower, colors) in VANILLA.items():
    SHEETS[name] = (templated(leaf, flower), palette(colors))

for name, (leaf, flower, colors, fruit) in BUSHES.items():
    SHEETS[name] = (templated(leaf, flower), palette(colors, FRUIT[fruit]))

for name, (leaf, flower) in PACKS.items():
    SHEETS[name] = (templated(leaf, flower), palette(pack_colors(name)))


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT).resolve()
    in_assets = root.is_relative_to(Path(__file__).resolve().parent.parent / 'assets')
    outputs = []
    for name, (rows, palette) in SHEETS.items():
        outputs.append((root / name / 'polrealistyczny.png', sheet(rows, palette)))
    for index, rows in enumerate(LAVENDER_SIMPLE, 1):
        outputs.append((root / 'lawenda' / f'prosty-{index}.png', sheet(rows, LAVENDER)))
    # Validate every existing region before changing any of the shared sheets.
    if in_assets:
        for path, image in outputs:
            spec = region(path)
            if image.size != (spec['width'], spec['height']):
                raise ValueError(f'{path}: size does not match atlas.json')
    for path, image in outputs:
        if in_assets:
            write_texture(path, image)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            image.save(path)
    print(f'Arkusze: {len(SHEETS)}')
    print('Gotowe:', 'assets/textures/rosliny.png' if in_assets else root)


if __name__ == '__main__':
    main()
