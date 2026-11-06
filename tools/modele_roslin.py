# ------------------------------------------------------------
# TEKSTURY POZIOMÓW MODELI ROŚLIN (src/blocks/plantModels.js)
#
# Rysuje tekstury 16 x 16 do assets/models/rosliny/<roślina>/:
#   polrealistyczny.png - arkusz części dla modelu z płaszczyzn
#                         (kwiat z boku, z góry, liść, łodyga, płatek -
#                         układ: src/rendering/PlaneModelGeometry.js),
#   prosty-<etap>.png   - zwykły obrazek na skrzyżowanych płaszczyznach
#                         (tylko roślinom, które go nie mają w atlasie).
#
# Piksele są tu narysowane literami (paleta niżej) - łatwo poprawić
# jeden piksel. Po zmianie: python3 tools/modele_roslin.py
# Pliki PNG można też malować ręcznie - skrypt nadpisze je tylko po
# uruchomieniu.
# ------------------------------------------------------------

import os
import sys

from PIL import Image

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


SHEETS = {
    'mak': (POPPY_SHEET, POPPY),
    'chaber': (CORNFLOWER_SHEET, CORNFLOWER),
    'mniszek': (DANDELION_SHEET, DANDELION),
    'rumianek': (CHAMOMILE_SHEET, CHAMOMILE),
    'lawenda': (LAVENDER_SHEET, LAVENDER),
}


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else ROOT
    for name, (rows, palette) in SHEETS.items():
        folder = os.path.join(root, name)
        os.makedirs(folder, exist_ok=True)
        sheet(rows, palette).save(os.path.join(folder, 'polrealistyczny.png'))
    for index, rows in enumerate(LAVENDER_SIMPLE, 1):
        sheet(rows, LAVENDER).save(os.path.join(root, 'lawenda', f'prosty-{index}.png'))
    print('Gotowe:', os.path.abspath(root))


if __name__ == '__main__':
    main()
