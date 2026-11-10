# ------------------------------------------------------------
# PĘKNIĘCIA KOPANEGO BLOKU
#
# Rysuje 10 etapów pęknięć (od pierwszej rysy do prawie rozbitego
# bloku) do assets/textures/blocks/cracks.png - pasek 160 x 16 pikseli,
# etap 0 z lewej. Gra kładzie je na blok, który kopiesz w trybie
# przygody (src/interaction/BlockCracks.js).
#
# Jak powstają: z kilku punktów blisko środka "rosną" rysy - kręte
# linie, które czasem się rozgałęziają. Każdy piksel rysy pamięta, kiedy
# powstał; etap k pokazuje piksele, które powstały w pierwszych
# (k + 1) / 10 czasu.
#
# Obrazek NIE jest zwykłą przezroczystą teksturą, tylko MNOŻNIKIEM
# (jak w Minecrafcie): gra mnoży kolor bloku przez 2 x kolor piksela.
# Szary 128 - bez zmiany, ciemniej - rysa przyciemnia blok, jaśniej -
# jasny brzeg rysy od światła (lewa góra) rozjaśnia blok. Dzięki temu
# rysy pasują do każdego bloku - na jasnym piasku i na ciemnej korze,
# w dzień i w nocy.
#
# Uruchomienie (w folderze gry, potrzebny Python z numpy i Pillow):
#     python tools/pekniecia.py [podglad.png]
# ------------------------------------------------------------

import os
import sys

import numpy as np
from atlasy import read_texture, write_texture
from PIL import Image

N = 16
STAGES = 10

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'assets', 'textures', 'blocks', 'cracks.png')

SEED = 4242


def grow(r):
    """Czas powstania każdego piksela rysy (inf = brak rysy)."""
    time = np.full((N, N), np.inf)
    # gałęzie: (x, y, kierunek, czas startu, długość)
    branches = []
    for k in range(3):
        # punkty startu rys rozsiane wokół środka, kolejne później
        x0, y0 = 8 + r.uniform(-4, 4), 8 + r.uniform(-4, 4)
        start = k * 2.5
        angle = r.uniform(0, 2 * np.pi)
        branches.append([x0, y0, angle, start, r.uniform(8, 13)])
        branches.append([x0, y0, angle + np.pi + r.uniform(-0.6, 0.6), start, r.uniform(6, 11)])
    step = 0.5
    while branches:
        x, y, angle, t, length = branches.pop()
        travelled = 0.0
        while travelled < length:
            px, py = int(np.floor(x)) % N, int(np.floor(y)) % N
            time[py, px] = min(time[py, px], t)
            angle += r.uniform(-0.3, 0.3)
            x += np.cos(angle) * step
            y += np.sin(angle) * step
            t += step
            travelled += step
            # rozgałęzienie
            if r.random() < 0.04:
                side = 1 if r.random() < 0.5 else -1
                branches.append([x, y, angle + side * r.uniform(0.6, 1.2), t, (length - travelled) * r.uniform(0.4, 0.8)])
    return time


def stages(time):
    """Etapy jako mnożnik: 1 = bez zmiany, < 1 przyciemnia, > 1 rozjaśnia."""
    finite = time[np.isfinite(time)]
    end = finite.max()
    frames = []
    for k in range(STAGES):
        limit = end * (k + 1) / STAGES
        crack = time <= limit
        factor = np.ones((N, N))
        # rysa: im starsza, tym ciemniejsza
        age = np.where(crack, (limit - time) / max(end, 1e-6), 0)
        factor[crack] = 1 - (0.55 + 0.25 * np.clip(age[crack] * 2, 0, 1))
        # pod rysą (prawy dół) - jaśniejszy brzeg od światła (wgłębienie)
        lit = np.roll(np.roll(crack, 1, axis=0), 1, axis=1) & ~crack
        factor[lit] = 1 + 0.18 + 0.02 * k
        # w późnych etapach rysy się poszerzają (sąsiedzi starych pikseli)
        if k >= 8:
            old = time <= end * (k - 4) / STAGES
            wide = np.roll(old, -1, axis=1) & ~crack & ~lit
            factor[wide] = 1 - (0.3 + 0.08 * (k - 7))
        frames.append(factor)
    return frames


def encode(factor):
    """Mnożnik -> piksele (szary 128 = 1, gra liczy blok x 2 x piksel)."""
    value = np.clip(np.round(factor * 128), 0, 255).astype(np.uint8)
    img = np.zeros(factor.shape + (4,), np.uint8)
    img[..., 0] = img[..., 1] = img[..., 2] = value
    img[..., 3] = 255
    return img


def main():
    r = np.random.default_rng(SEED)
    frames = stages(grow(r))
    strip = np.concatenate([encode(f) for f in frames], axis=1)
    write_texture(OUT, Image.fromarray(strip, 'RGBA'))
    print('Gotowe: region pęknięć w assets/textures/efekty.png')
    if len(sys.argv) > 1:
        # podgląd: każdy etap na kamieniu, piasku i korze dębu, powiększony
        atlas = np.asarray(read_texture('assets/textures/blocks/terrain.png').convert('RGB')).astype(float)
        tiles = [(0, 3), (0, 11), (5, 8)]   # (wiersz, kolumna) w atlasie: kamień, piasek, kora dębu
        S = 6
        sheet = Image.new('RGB', (STAGES * (N * S + 6) - 6, len(tiles) * (N * S + 6) - 6), (40, 40, 46))
        for row, (ty, tx) in enumerate(tiles):
            base = atlas[ty * N:(ty + 1) * N, tx * N:(tx + 1) * N]
            for k, frame in enumerate(frames):
                value = np.round(frame * 128) / 255
                tile = np.clip(base * 2 * value[..., None], 0, 255).astype(np.uint8)
                sheet.paste(Image.fromarray(tile).resize((N * S, N * S), Image.NEAREST), (k * (N * S + 6), row * (N * S + 6)))
        sheet.save(sys.argv[1])


if __name__ == '__main__':
    main()
