# ------------------------------------------------------------
# ROŚLINY Z ATLASU - z dużego obrazka "pixel art" tekstury do gry
#
# Wejście: atlas rośliny (np. 1254 x 1254) z czterema obrazkami na
# przezroczystym tle - zwykle trzy etapy wzrostu i przedmiot (bukiet,
# wiązka, owoce). Takie obrazki są narysowane jak pixel art, ale
# "piksel" ma kilkanaście pikseli obrazka, nie leży w równej siatce,
# a brzegi mają rozmyte, czasem kolorowe obwódki.
#
# Co robi:
#   1. rozdziela obrazki (spójne plamy nieprzezroczystych pikseli -
#      nie zwykłe ćwiartki, bo duża roślina wchodzi na sąsiednią),
#   2. znajduje siatkę pikseli rysunku (krok z widma krawędzi, każda
#      granica dosunięta do najbliższej krawędzi) i odczytuje każdy
#      piksel ze środka komórki (mediana - bez obwódek),
#   3. zmniejsza do skali gry: 16 pikseli na blok. Wszystkie etapy
#      w tej samej skali (najwyższy etap = --wysokosc pikseli), więc
#      piksel ma ten sam rozmiar we wszystkich etapach. Zmniejszanie
#      "pikselowe": każdy nowy piksel dostaje kolor z palety rośliny,
#      który zajmuje w jego polu najwięcej miejsca (ciemne - łodygi,
#      cienie - liczą się trochę mocniej, żeby cienkie łodygi nie
#      znikały), bez mieszania kolorów,
#   4. sprząta: pojedyncze odstające piksele i dziurki,
#   5. przedmiot mieści w 16 x 16 (jak wszystkie przedmioty gry).
#
# Uruchomienie (w folderze gry, Python z numpy, scipy i Pillow):
#   python tools/rosliny_z_atlasu.py ATLAS.png assets/rosliny/amarantus --wysokosc 32
#   ... --nazwy etap1,etap2,etap3,wiecha    nazwy plików (kolejność:
#                                           lewy górny, prawy górny,
#                                           lewy dolny, prawy dolny)
#   ... --podglad podglad.png               porównanie: atlas | piksele
#                                           rysunku | wynik (powiększone)
#
# Ile pikseli (--wysokosc)? Prawdziwa wysokość rośliny w metrach x 16
# (blok = 1 m, gracz = 1.8 m): amarantus ~2 m -> 32. Opis i rozmiary
# wszystkich roślin: docs/rosliny.md.
# ------------------------------------------------------------

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA = 100          # od tej przezroczystości piksel obrazka należy do rysunku
COLORS = 24          # kolorów w palecie jednej rośliny
ITEM = 16            # przedmiot: najwyżej 16 x 16


# ------------------------------------------------------------
# Siatka pikseli rysunku
# ------------------------------------------------------------

def edge_signals(rgb, opaque):
    # Siła krawędzi w każdej kolumnie i w każdym wierszu (tylko wewnątrz
    # rysunku - brzeg z tłem dawałby fałszywe granice).
    dx = np.abs(np.diff(rgb, axis=1)).sum(2) * (opaque[:, 1:] & opaque[:, :-1])
    dy = np.abs(np.diff(rgb, axis=0)).sum(2) * (opaque[1:] & opaque[:-1])
    return dx.sum(0), dy.sum(1)


def grid_step(signal, low=6, high=48):
    # Krok siatki: najsilniejsza częstotliwość widma krawędzi (po odjęciu
    # wolnych zmian).
    s = signal - np.convolve(signal, np.ones(41) / 41, 'same')
    n = len(s)
    spectrum = np.abs(np.fft.rfft(s * np.hanning(n), n=16 * n))
    freq = np.fft.rfftfreq(16 * n)
    mask = (freq > 1 / high) & (freq < 1 / low)
    return 1 / freq[np.argmax(spectrum * mask)]


def grid_lines(signal, step, start, end):
    # Granice pikseli od start do end: najpierw równa siatka z najlepszym
    # przesunięciem, potem każda granica dosunięta do najsilniejszej
    # krawędzi w promieniu ćwierci kroku (rysunek nie jest idealnie równy).
    start, end = max(0, start), min(len(signal), end)
    best, phase = -1.0, 0.0
    for offset in np.arange(0, step, 0.25):
        at = np.round(np.arange(start + offset, end, step)).astype(int)
        at = at[(at >= 0) & (at < len(signal))]
        value = signal[at].sum()
        if value > best:
            best, phase = value, offset
    lines = []
    radius = max(1, int(step / 4))
    for guess in np.arange(start + phase, end + step, step):
        c = int(round(guess))
        lo, hi = max(0, c - radius), min(len(signal) - 1, c + radius)
        if hi > lo and signal[lo:hi + 1].max() > 0:
            c = lo + int(np.argmax(signal[lo:hi + 1]))
        if not lines or c + 1 - lines[-1] >= step * 0.5:
            lines.append(c + 1)
    return np.array(lines)


# ------------------------------------------------------------
# Rozdzielenie obrazków
# ------------------------------------------------------------

def split_sprites(opaque, step, count=4):
    # Spójne plamy (po lekkim pogrubieniu - liść oderwany o piksel od
    # łodygi należy do tej samej rośliny). Plamy łączymy w `count`
    # obrazków według ćwiartki, w której leży ich środek ciężkości;
    # największa plama ćwiartki wyznacza obrazek.
    h, w = opaque.shape
    grown = ndimage.binary_dilation(opaque, iterations=max(1, int(step * 0.8)))
    labels, n = ndimage.label(grown)
    sizes = ndimage.sum(opaque, labels, range(1, n + 1))
    centers = ndimage.center_of_mass(opaque, labels, range(1, n + 1))
    groups = [[] for _ in range(count)]
    for i in range(n):
        if sizes[i] < (step * step) * 2:
            continue                      # okruchy
        cy, cx = centers[i]
        q = (1 if cy >= h / 2 else 0) * 2 + (1 if cx >= w / 2 else 0)
        groups[q].append(i + 1)
    masks = []
    for q in range(count):
        mask = np.isin(labels, groups[q]) & opaque if groups[q] else None
        masks.append(mask)
    return masks


def native_sprite(rgb, mask, lines_x, lines_y):
    # Piksele rysunku: dla każdej komórki siatki - czy jest rysunkiem
    # (ponad połowa pokryta) i jej kolor (mediana środka komórki).
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    lx = lines_x[(lines_x >= x0 - 64) & (lines_x <= x1 + 64)]
    ly = lines_y[(lines_y >= y0 - 64) & (lines_y <= y1 + 64)]
    out = np.zeros((len(ly) - 1, len(lx) - 1, 4), np.uint8)
    for j in range(len(ly) - 1):
        for i in range(len(lx) - 1):
            ya, yb, xa, xb = ly[j], ly[j + 1], lx[i], lx[i + 1]
            if yb - ya < 3 or xb - xa < 3:
                continue
            if mask[ya:yb, xa:xb].mean() < 0.5:
                continue
            iy, ix = (yb - ya) // 4, (xb - xa) // 4
            inner = rgb[ya + iy:yb - iy, xa + ix:xb - ix]
            inside = mask[ya + iy:yb - iy, xa + ix:xb - ix]
            if not inside.any():
                continue
            out[j, i, :3] = np.median(inner[inside], axis=0)
            out[j, i, 3] = 255
    return crop(out)


def crop(sprite):
    ys, xs = np.nonzero(sprite[..., 3])
    return sprite[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


# ------------------------------------------------------------
# Paleta i zmniejszanie
# ------------------------------------------------------------

def kmeans(colors, k, iterations=30):
    rng = np.random.default_rng(7)
    k = min(k, len(colors))
    centers = colors[rng.choice(len(colors), size=k, replace=False)].astype(float)
    for _ in range(iterations):
        nearest = ((colors[:, None, :] - centers[None]) ** 2).sum(2).argmin(1)
        for i in range(k):
            members = colors[nearest == i]
            if len(members):
                centers[i] = members.mean(0)
    return centers


def luminance(c):
    return c[..., 0] * 0.299 + c[..., 1] * 0.587 + c[..., 2] * 0.114


def pixel_downscale(sprite, factor, palette):
    # Każdy nowy piksel: kolor palety, który zajmuje najwięcej jego pola
    # (z wagą: ciemne kolory - łodygi, obrysy - ważą do 1.5 raza więcej).
    # Przezroczysty, gdy rysunek pokrywa mniej niż 45% pola.
    h, w = sprite.shape[:2]
    th, tw = max(1, round(h * factor)), max(1, round(w * factor))
    fy, fx = h / th, w / tw
    opaque = sprite[..., 3] > 0
    index = ((sprite[..., :3].astype(float)[:, :, None, :] - palette[None, None]) ** 2).sum(3).argmin(2)
    lum = luminance(palette)
    middle = np.median(lum[index[opaque]])
    weight = 1 + 0.5 * np.clip((middle - lum) / 60, 0, 1)
    out = np.zeros((th, tw, 4), np.uint8)
    for j in range(th):
        for i in range(tw):
            ya, yb, xa, xb = j * fy, (j + 1) * fy, i * fx, (i + 1) * fx
            votes, area, covered = {}, 0.0, 0.0
            for y in range(int(ya), min(h, int(np.ceil(yb - 1e-9)))):
                wy = min(yb, y + 1) - max(ya, y)
                for x in range(int(xa), min(w, int(np.ceil(xb - 1e-9)))):
                    wx = min(xb, x + 1) - max(xa, x)
                    if wy <= 0 or wx <= 0:
                        continue
                    part = wx * wy
                    area += part
                    if opaque[y, x]:
                        covered += part
                        p = index[y, x]
                        votes[p] = votes.get(p, 0) + part * weight[p]
            if area and covered / area >= 0.45:
                p = max(votes, key=votes.get)
                out[j, i, :3] = np.round(palette[p]).astype(np.uint8)
                out[j, i, 3] = 255
    return out


def snap_to_palette(sprite, palette):
    opaque = sprite[..., 3] > 0
    index = ((sprite[..., :3].astype(float)[:, :, None, :] - palette[None, None]) ** 2).sum(3).argmin(2)
    out = sprite.copy()
    out[opaque, :3] = np.round(palette[index[opaque]]).astype(np.uint8)
    return out


def tidy(sprite):
    # Pojedyncze piksele bez żadnego sąsiada (po bokach i na ukos) znikają,
    # pojedyncze dziurki otoczone rysunkiem z czterech stron - zapełnione
    # kolorem najczęstszego sąsiada.
    out = sprite.copy()
    a = sprite[..., 3] > 0
    h, w = a.shape
    for y in range(h):
        for x in range(w):
            near = [(y + dy, x + dx) for dy in (-1, 0, 1) for dx in (-1, 0, 1)
                    if (dy or dx) and 0 <= y + dy < h and 0 <= x + dx < w]
            if a[y, x] and not any(a[p] for p in near):
                out[y, x, 3] = 0
            sides = [(y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)]
            if not a[y, x] and all(0 <= p[0] < h and 0 <= p[1] < w and a[p] for p in sides):
                colors = [tuple(sprite[p][:3]) for p in sides]
                out[y, x, :3] = max(set(colors), key=colors.count)
                out[y, x, 3] = 255
    return crop(out)


def pad_item(sprite):
    # Przedmiot zawsze 16 x 16 (jak wszystkie przedmioty gry), rysunek
    # na środku.
    h, w = sprite.shape[:2]
    out = np.zeros((ITEM, ITEM, 4), np.uint8)
    y, x = (ITEM - h) // 2, (ITEM - w) // 2
    out[y:y + h, x:x + w] = sprite
    return out


# ------------------------------------------------------------

def convert(path, height, names):
    image = np.asarray(Image.open(path).convert('RGBA')).astype(float)
    rgb, opaque = image[..., :3], image[..., 3] > ALPHA
    sx, sy = edge_signals(rgb, opaque)
    step_x, step_y = grid_step(sx), grid_step(sy)
    lines_x = grid_lines(sx, step_x, 0, image.shape[1])
    lines_y = grid_lines(sy, step_y, 0, image.shape[0])
    masks = split_sprites(opaque, (step_x + step_y) / 2, len(names))
    natives = []
    for name, mask in zip(names, masks):
        if mask is None:
            sys.exit(f'Nie ma obrazka "{name}" (ćwiartka bez rysunku).')
        natives.append(native_sprite(rgb, mask, lines_x, lines_y))
    colors = np.concatenate([n[n[..., 3] > 0][:, :3] for n in natives]).astype(float)
    palette = kmeans(colors, COLORS)
    stages, item = natives[:-1], natives[-1]
    factor = min(1.0, height / max(s.shape[0] for s in stages))
    results = [tidy(pixel_downscale(s, factor, palette)) if factor < 1 else tidy(snap_to_palette(s, palette)) for s in stages]
    item_factor = min(1.0, ITEM / max(item.shape[:2]))
    results.append(pad_item(tidy(pixel_downscale(item, item_factor, palette))))
    return {
        'step': (step_x, step_y),
        'factor': factor,
        'natives': natives,
        'results': results
    }


def preview(path, atlas_path, data, names):
    scale = 8
    atlas = Image.open(atlas_path).convert('RGBA')
    thumb = atlas.resize((420, 420), Image.LANCZOS)
    blocks = []
    for row in (data['natives'], data['results']):
        blocks.append([Image.fromarray(s).resize((s.shape[1] * scale, s.shape[0] * scale), Image.NEAREST) for s in row])
    width = 440 + sum(max(a.width, b.width) + 24 for a, b in zip(*blocks))
    height = max(420, max(i.height for i in blocks[0]) + max(i.height for i in blocks[1]) + 60)
    out = Image.new('RGBA', (width, height), (186, 198, 210, 255))
    out.alpha_composite(thumb, (10, 10))
    x = 440
    top = max(i.height for i in blocks[0])
    for a, b in zip(*blocks):
        out.alpha_composite(a, (x, 10 + top - a.height))
        out.alpha_composite(b, (x, top + 40 + max(i.height for i in blocks[1]) - b.height))
        x += max(a.width, b.width) + 24
    out.save(path)


def main():
    parser = argparse.ArgumentParser(description='Tekstury rośliny z atlasu pixel art (docs/rosliny.md).')
    parser.add_argument('atlas')
    parser.add_argument('folder')
    parser.add_argument('--wysokosc', type=int, required=True,
                        help='wysokość najwyższego etapu w pikselach gry (16 = 1 blok)')
    parser.add_argument('--nazwy', default='etap1,etap2,etap3,przedmiot')
    parser.add_argument('--podglad')
    args = parser.parse_args()
    names = args.nazwy.split(',')
    data = convert(args.atlas, args.wysokosc, names)
    from pathlib import Path
    from atlasy import region, write_texture
    folder = Path(args.folder).resolve()
    in_assets = folder.is_relative_to(Path(__file__).resolve().parent.parent / 'assets')
    outputs = [(folder / f'{name}.png', Image.fromarray(result))
               for name, result in zip(names, data['results'])]
    # Imports into the game update existing regions; a new region must first
    # be explicitly allocated in atlas.json. External folders remain exports.
    if in_assets:
        for path, image in outputs:
            spec = region(path)
            if image.size != (spec['width'], spec['height']):
                raise ValueError(f'{path}: size does not match atlas.json')
    else:
        folder.mkdir(parents=True, exist_ok=True)
    print(f'Siatka rysunku: {data["step"][0]:.2f} x {data["step"][1]:.2f} px, skala {data["factor"]:.3f}')
    for name, native, result, (path, image) in zip(names, data['natives'], data['results'], outputs):
        if in_assets:
            write_texture(path, image)
        else:
            image.save(path, optimize=True)
        print(f'  {name}.png: {result.shape[1]} x {result.shape[0]} (rysunek {native.shape[1]} x {native.shape[0]})')
    if args.podglad:
        preview(args.podglad, args.atlas, data, names)
        print('Podgląd:', args.podglad)


if __name__ == '__main__':
    main()
