# ------------------------------------------------------------
# WARIANTY WIERZCHU BLOKU TRAWY (1.2.0) - pomysł Kamila
#
# Ten sam zielony wierzch co zawsze (grass_top), ale z płaskimi dodatkami
# widzianymi z góry: kępki, koniczyna, rozety liści, mech, stokrotki,
# mlecze, maki, chabry, fiołki... Gra losuje wariant dla co dziewiątego
# bloku trawy (src/rendering/SurfaceTextureVariants.js - lista i wagi).
#
# Zasady rysunku:
#   - baza to prawdziwa tekstura grass_top (inaczej obrócona i przesunięta
#     w każdym wariancie - te same kolory, inne ułożenie),
#   - kolory dodatków z roślin, które już są w grze (rosliny.png),
#   - dodatek trzyma się 1 piksel od brzegu - nic nie jest ucinane na
#     styku bloków, a obrót wierzchu daje cztery ułożenia,
#   - zielone części są "zieleńsze niż czerwone i niebieskie" - shader
#     barwi je kolorem klimatu jak trawę; płatki (żółte, białe, różowe,
#     niebieskie, czerwone) zostają w swoim kolorze (BlockRenderData.js).
#
# Skrypt dopisuje regiony i kafelki do assets/textures/atlas.json (trzy
# nowe wiersze atlasu) i odświeża src/rendering/TextureSheetData.js.
# Powtórne uruchomienie rysuje od nowa to samo (stałe ziarna).
#
#     python3 tools/tekstury_trawy.py [podglad.png]
#
# Nowy wariant: dopisz go w V tutaj ORAZ w GRASS_TOP_VARIANTS
# w SurfaceTextureVariants.js (pilnuje tego tools/sprawdz_warianty_trawy.mjs).
# ------------------------------------------------------------
import json
import random
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from atlasy import ROOT, read_texture, write_texture, check, sync  # noqa: E402
from tekstury_noza_i_kory import free_cell, load, save  # noqa: E402

# Nowe wiersze atlasu (50-52) - same pojedyncze kafelki.
ROWS = 53
FREE_TILES = [(x, y) for y in (50, 51, 52) for x in range(16)]
SHEET = 'teren'


def register(name):
    data = load()
    data['rows'] = max(data.get('rows', 0), ROWS)
    if name not in data['regions']:
        try:
            x, y = free_cell(data, SHEET)
        except ValueError:
            spec = data['sheets'][SHEET]
            path = ROOT / 'assets/textures' / spec['file']
            old = Image.open(path).convert('RGBA')
            grown = Image.new('RGBA', (spec['width'], spec['height'] + 16), (0, 0, 0, 0))
            grown.paste(old, (0, 0))
            grown.save(path, optimize=True)
            spec['height'] += 16
            x, y = free_cell(data, SHEET)
        data['regions'][name] = {'sheet': SHEET, 'x': x, 'y': y, 'width': 16, 'height': 16}
    if name not in data['tiles']:
        used = {(t['x'] + dx, t['y'] + dy) for t in data['tiles'].values() for dx in range(t.get('w', 1)) for dy in range(t.get('h', 1))}
        cell = next(c for c in FREE_TILES if c not in used)
        data['tiles'][name] = {'x': cell[0], 'y': cell[1], 'region': name}
    save(data)


base = read_texture('grass_top').convert('RGBA')

GRASS=[(106,190,48),(96,179,39),(97,185,36),(106,198,43),(102,191,40),(104,191,44)]
P={ # paleta: kolory roślin z gry (assets/textures/rosliny.png) i gruntu
 'd':(78,158,36),'D':(59,133,29),'k':(45,111,25),      # ciemniejsze zielenie (trawa, liście)
 'l':(142,222,74),'L':(176,226,104),                     # jasne źdźbła
 'm':(112,157,61),'M':(89,127,49),'n':(135,169,71),     # mech
 'y':(246,204,32),'Y':(255,224,84),'o':(235,150,27),    # żółcie, pomarańcz
 'r':(213,41,31),'R':(182,28,24),'x':(60,24,20),        # mak
 'b':(74,112,222),'B':(54,86,194),'c':(128,160,240),    # chaber
 'w':(232,232,222),'W':(250,250,244),'g':(196,198,188), # biel
 'p':(216,128,192),'P':(176,76,152),'q':(240,196,224),  # róż
 'v':(162,116,218),'V':(136,86,196),'u':(200,170,236),  # fiolet
 't':(137,64,15),'T':(157,73,17),'e':(119,56,13),       # ziemia, patyk
 's':(144,133,124),'S':(182,172,157),'z':(104,96,90),   # kamyk
 'f':(200,144,76),'F':(153,110,58),'h':(214,96,40),     # opadłe liście
 'a':(176,196,92),'A':(204,188,104),                     # sucha trawa
 'i':(150,206,236),                                      # niezapominajka
}
S={ # pieczątki (widok z góry); '.' = trawa zostaje
 'stokrotka':["  w  "," wyw ","  w  "][0:3] and [".w.","wyw",".w."],
 'stokrotka2':["w.w",".y.","w.w"],
 'mlecz':[".y.","yoy",".y."],
 'mlecz_duzy':[".yy.","yYoy","yoYy",".yy."],
 'dmuchawiec':[".g.","gWg",".g."],
 'mak':[".r.","rxr",".R."],
 'mak_duzy':[".rr.","rxRr","rRxr",".rR."],
 'chaber':["b.b",".c.","b.b"],
 'chaber2':[".b.","bcb",".B."],
 'fiolek':["v.","Vy"],
 'fiolek3':[".v.","vyv",".V."],
 'koniczyna_roz':["pq","Pp"],
 'koniczyna_biala':["wg","gw"],
 'jaskier':["y"],'jaskier2':["yY"],
 'niezap':["i"],'niezap2':["i.",".i"],'niezap3':["iy","wi"],
 'wrzos':["p.P",".p.","P.p"],
 'krokus':["v","u"],'krokus_b':["w","u"],
 'platek_b':["w"],'platek_r':["q"],
 'trojlistek':[".D.","DkD",".D."],
 'trojlistek2':["D.D",".k.",".D."],
 'kepka':["l.l",".l.","d.l"],
 'kepka_c':["k.d",".k.","d.k"],
 'zdzblo':["l",".","l"],'zdzblo2':["L.","l.",".l"],
 'babka':["D...D",".DkD.","..k..",".DkD.","D...D"],
 'rozeta':[".d.d.","d.D.d",".DkD.","d.D.d",".d.d."],
 'paprotka':["d..",".dd","d.d",".d."],
 'mech3':[".mm.","mMnm",".mm."],
 'mech5':[".mmm.","mMnMm","mnMmm",".mMm."],
 'mech2':["mn","Mm"],
 'sucha':["a..",".a.","..A"],'sucha2':["A.a.",".a.A"],
 'lisc_p':["f.","Ff"],'lisc_c':["h","F"],'lisc_z':["Yo"],'lisc_b':["F."," f"][0:1]+[".f"],
 'kamyk':["Ss","sz"],'kamyk1':["S","z"],'kamyk3':[".Ss","Sssz",".zz"],
 'patyk':["e...",".T..","..e.","...T"],'patyk2':["TeT"],'patyk_w':["e",".","T","e"],
 'grzyb_cz':["rw","Rr"],'grzyb_cz1':["r"],'grzyb_br':["F"],'grzyb_br2':["Ff","eF"],'grzyb_b':["w","g"],
 'ziemia':["t"],'ziemia2':["tT"],'ziemia3':[".t.","TeT",".t."],
 'poziomka':["r"],'poziomka_l':["Dr","kD"],
 'jagoda':["B"],
 'nasiono':["e"],
}
def rot(st,k):
    g=[list(r) for r in st]
    for _ in range(k%4): g=[list(r) for r in zip(*g[::-1])]
    return g
def make(seed, items, shuffle=True):
    rnd=random.Random(seed)
    im=base.copy(); px=im.load()
    if shuffle:   # inne ułożenie szumu trawy w każdym wariancie (te same kolory)
        k=rnd.randrange(4); im=im.rotate(90*k)
        if rnd.random()<.5: im=im.transpose(Image.FLIP_LEFT_RIGHT)
        dx,dy=rnd.randrange(16),rnd.randrange(16)
        im=Image.merge('RGBA',[c for c in im.split()]); src=im.copy(); px=im.load(); sp=src.load()
        for y in range(16):
            for x in range(16): px[x,y]=sp[(x+dx)%16,(y+dy)%16]
    used=[[False]*16 for _ in range(16)]
    for name,count in items:
        for _ in range(count):
            st=rot(S[name],rnd.randrange(4)); h=len(st); w=len(st[0])
            for attempt in range(60):
                # margines 1 px od brzegu: dodatek nie jest ucinany na krawędzi bloku
                x0=rnd.randrange(1,16-w); y0=rnd.randrange(1,16-h)
                if all(not used[y][x] for y in range(max(0,y0-1),min(16,y0+h+1)) for x in range(max(0,x0-1),min(16,x0+w+1))): break
            else: continue
            for j in range(h):
                for i in range(w):
                    used[y0+j][x0+i]=True
                    c=st[j][i]
                    if c not in '. ': px[x0+i,y0+j]=P[c]+(255,)
    return im
# (nazwa pliku, opis, dodatki, waga - jak często miałby się trafiać; zwykła trawa = 100)
V=[
 ('trawa_kepki',      'kępki jaśniejszej trawy',        [('kepka',3),('zdzblo',2)], 14),
 ('trawa_ciemna',     'ciemniejsze kępki',              [('kepka_c',3),('zdzblo2',1)], 14),
 ('trawa_zdzbla',     'pojedyncze źdźbła',              [('zdzblo',3),('zdzblo2',2)], 14),
 ('trawa_sucha',      'suche źdźbła',                   [('sucha',2),('sucha2',1)], 8),
 ('trawa_sucha2',     'więcej suchej trawy',            [('sucha2',2),('sucha',2),('kepka',1)], 5),
 ('koniczyna',        'koniczyna',                      [('trojlistek',3)], 10),
 ('koniczyna2',       'gęsta koniczyna',                [('trojlistek',3),('trojlistek2',3)], 6),
 ('koniczyna_biala',  'koniczyna biała',                [('trojlistek',2),('koniczyna_biala',2)], 5),
 ('koniczyna_rozowa', 'koniczyna różowa',               [('trojlistek2',2),('koniczyna_roz',2)], 5),
 ('babka',            'rozeta babki',                   [('babka',1),('zdzblo',1)], 7),
 ('rozeta',           'rozeta liści',                   [('rozeta',1)], 7),
 ('rozety2',          'dwie rozety',                    [('babka',1),('rozeta',1)], 4),
 ('paprotka',         'młode paprotki',                 [('paprotka',2),('kepka_c',1)], 5),
 ('mech',             'plama mchu',                     [('mech5',1),('mech2',1)], 7),
 ('mech2',            'drobny mech',                    [('mech3',2),('mech2',2)], 7),
 ('mech_duzy',        'dużo mchu',                      [('mech5',2),('mech3',1),('mech2',1)], 3),
 ('stokrotka',        'stokrotka',                      [('stokrotka',1)], 6),
 ('stokrotki',        'stokrotki',                      [('stokrotka',2),('stokrotka2',1)], 5),
 ('stokrotki_duzo',   'łan stokrotek',                  [('stokrotka',3),('stokrotka2',2),('platek_b',2)], 2),
 ('mlecz',            'mlecz',                          [('mlecz',1)], 6),
 ('mlecze',           'mlecze',                         [('mlecz',2),('mlecz_duzy',1)], 4),
 ('mlecz_duzy',       'duży mlecz z rozetą',            [('mlecz_duzy',1),('rozeta',1)], 3),
 ('dmuchawce',        'dmuchawce',                      [('dmuchawiec',2),('mlecz',1)], 3),
 ('mak',              'mak',                            [('mak',1)], 4),
 ('maki',             'maki',                           [('mak',2),('mak_duzy',1)], 2),
 ('chaber',           'chaber',                         [('chaber2',1)], 4),
 ('chabry',           'chabry',                         [('chaber',2),('chaber2',1)], 2),
 ('fiolki',           'fiołki',                         [('fiolek',2),('fiolek3',1)], 4),
 ('fiolki_duzo',      'kępa fiołków',                   [('fiolek3',2),('fiolek',3),('trojlistek2',1)], 2),
 ('jaskry',           'jaskry',                         [('jaskier',4),('jaskier2',2)], 5),
 ('niezapominajki',   'niezapominajki',                 [('niezap3',2),('niezap2',2),('niezap',2)], 4),
 ('wrzos',            'wrzos',                          [('wrzos',2)], 3),
 ('krokusy',          'krokusy',                        [('krokus',3),('krokus_b',2)], 3),
 ('platki',           'opadłe płatki',                  [('platek_b',4),('platek_r',3)], 4),
 ('laka_zolta',       'łąka: żółte i białe',            [('mlecz',1),('stokrotka',1),('jaskier',3)], 4),
 ('laka_czerwona',    'łąka: mak i chaber',             [('mak',1),('chaber2',1),('stokrotka2',1)], 3),
 ('laka_fiolet',      'łąka: fiolet i róż',             [('fiolek3',1),('koniczyna_roz',2),('niezap2',1)], 3),
 ('laka_drobna',      'łąka: drobne kwiatki',           [('jaskier',2),('niezap',3),('platek_b',2),('platek_r',2)], 4),
 ('laka_pelna',       'łąka: wszystkiego po trochu',    [('mak',1),('mlecz',1),('chaber',1),('stokrotka',1),('fiolek',1)], 2),
 ('poziomki',         'poziomki',                       [('poziomka_l',2),('poziomka',1),('trojlistek2',1)], 2),
 ('rozeta_kwiat',     'rozeta ze stokrotką',            [('rozeta',1),('stokrotka',1)], 3),
 ('koniczyna_mlecz',  'koniczyna i mlecz',              [('trojlistek',2),('mlecz',1)], 3),
]


def main():
    preview = []
    for index, (name, label, items, weight) in enumerate(V):
        image = make(1000 + index * 7, items)
        register(f'grass_top_{name}')
        write_texture(f'grass_top_{name}', image)
        preview.append(image)
    check()
    sync()
    if len(sys.argv) > 1:
        per = 14
        sheet = Image.new('RGBA', (per * 68 + 4, ((len(preview) + per - 1) // per) * 68 + 4), (40, 42, 46, 255))
        for index, image in enumerate(preview):
            sheet.paste(image.resize((64, 64), Image.NEAREST), (4 + (index % per) * 68, 4 + (index // per) * 68))
        sheet.save(sys.argv[1])
    print(f'OK: {len(preview)} wariantów wierzchu trawy.')
    print(json.dumps([[f'grass_top_{name}', weight] for name, label, items, weight in V]))


if __name__ == '__main__':
    main()
