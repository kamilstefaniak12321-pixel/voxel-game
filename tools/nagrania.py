# ------------------------------------------------------------
# NAGRANIA DŹWIĘKÓW DO GRY (np. z ElevenLabs Sound Effects)
#
# Zamienia pobrane pliki (mp3/wav, stereo, 48 kHz) na pliki gry
# w assets/sounds/ - takie, jak gra lubi:
#   - mono 44,1 kHz, bez stałej składowej,
#   - krótkie dźwięki: przycięta cisza z początku i końca, krótkie wejście
#     i wyciszenie (bez trzasków); początek blisko najgłośniejszego miejsca
#     (krok, cios i klik odpowiadają od razu), krok - tylko pierwszy krok
#     i najwyżej 0,45 s,
#   - pętle (szum wody, ogień, wiatr, kosmos): przejście koniec -> początek
#     przez przenikanie, bez szwu; tło bez "pulsowania" co obieg,
#   - głośność jak dotychczasowego dźwięku o tej samej nazwie (głośności
#     w src/audio/sounds.js były dobrane do nich), szczyt najwyżej -1 dBFS
#     (ostre trzaski - ogranicznik),
#   - .ogg (Vorbis, jakość 4).
#
# Układ wejścia (jak w paczce od Kamila): <folder>/<grupa>/<nazwa>/*.mp3,
# grupa: block (bloki), water, ui, meteor, space; nazwa jak w sounds.js
# (step_grass, ui_click...). Kilka plików w folderze = wersje 1, 2, 3...
# (kolejność alfabetyczna).
#
#   python3 tools/nagrania.py <folder z nagraniami> assets/sounds <wyjście> [raport.json]
#
# Potrzebny Python z numpy i scipy oraz ffmpeg. Wyjście można potem
# skopiować do assets/sounds/ i dopisać pliki do assets/sounds/nagrania.json
# (tools/dzwieki.py ich nie nadpisuje). Opis: docs/opis-gry.md, część "Dźwięki".
# ------------------------------------------------------------

import glob, json, os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
LOOPS = {'water_underwater', 'water_stream', 'water_waves', 'meteor_flight', 'fire_crackle', 'space_ambient', 'skyfall_wind'}
FOLDER = {'block': 'blocks'}

def load(path):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(out, dtype=np.float32).astype(np.float64)

def envelope(x, ms=5):
    n = max(1, int(SR * ms / 1000))
    return np.sqrt(np.convolve(x * x, np.ones(n) / n, mode='same') + 1e-15)

def level(x):
    # Najgłośniejsze 100 ms (RMS) po odcięciu basu poniżej 60 Hz - miara
    # "jak głośno brzmi" także dla krótkich, ostrych dźwięków.
    sos = butter(2, 60, 'highpass', fs=SR, output='sos')
    y = sosfilt(sos, x)
    n = int(SR * 0.1)
    if len(y) <= n:
        return 20 * np.log10(np.sqrt(np.mean(y * y)) + 1e-12)
    win = np.sqrt(np.convolve(y * y, np.ones(n) / n, mode='valid') + 1e-15)
    return 20 * np.log10(win.max())

def loop_level(x):
    sos = butter(2, 60, 'highpass', fs=SR, output='sos')
    y = sosfilt(sos, x)
    return 20 * np.log10(np.sqrt(np.mean(y * y)) + 1e-12)

# Ile przed najgłośniejszym miejscem może zacząć się dźwięk (s).
PRE_ROLL = {'step': 0.08, 'water_wade': 0.08, 'place': 0.1, 'break': 0.12, 'harvest': 0.15,
            'item': 0.12, 'ui': 0.12}

def max_length(name):
    if name.startswith('step_'): return 0.45
    if name.startswith('place_'): return 0.6
    if name.startswith('break_'): return 0.85
    if name == 'harvest': return 0.8
    if name in ('ui_click', 'ui_slider', 'item_pick', 'item_place'): return 0.35
    if name in ('ui_open', 'ui_close', 'item_trash', 'ui_error', 'item_craft'): return 0.6
    if name in ('water_wade',): return 0.6
    if name in ('water_swim',): return 1.0
    return None

def trim(x, name, notes):
    env = envelope(x)
    peak = env.max()
    if peak < 1e-6:
        notes.append('cisza!')
        return x
    start = int(np.argmax(env > peak * 10 ** (-30 / 20)))
    start = max(0, start - int(0.006 * SR))
    above = np.where(env > peak * 10 ** (-48 / 20))[0]
    end = min(len(x), above[-1] + int(0.02 * SR))
    # Dźwięk ma odpowiadać od razu (krok, cios, klik): gdy najgłośniejsze
    # miejsce jest daleko od początku (powolne narastanie), zaczynamy
    # krótko przed nim. Krok kończy się 0,3 s po szczycie (dalej bywa
    # już następny krok).
    pre = PRE_ROLL.get(name.split('_')[0], PRE_ROLL.get(name))
    slow = False
    if pre is not None:
        main = int(np.argmax(envelope(x, 30)))
        if main - start > pre * SR:
            notes.append(f'początek bliżej szczytu (+{(main - int(pre * SR) - start) / SR:.2f} s)')
            start = main - int(pre * SR)
            slow = True
        if name.startswith('step_') or name == 'water_wade':
            end = min(end, main + int(0.3 * SR))
    # Kroki: tylko pierwsze uderzenie (gdy w pliku są dwa kroki).
    if name.startswith('step_') or name == 'water_wade':
        # Drugi krok: po przerwie (poniżej 10% szczytu przez 25 ms)
        # znów ponad połowę szczytu, co najmniej 0,15 s po pierwszym.
        e = envelope(x[start:end], 10)
        top = int(np.argmax(e))
        low = e < e[top] * 0.10
        run, dip = 0, None
        for i in range(top, len(e)):
            run = run + 1 if low[i] else 0
            if run >= int(0.025 * SR):
                dip = i
                break
        if dip is not None:
            again = np.where(e[dip:] > e[top] * 0.5)[0]
            if len(again) and (dip + again[0] - top) / SR >= 0.15:
                cut = start + dip + again[0] - int(0.01 * SR)
                notes.append(f'drugi krok po {(cut - start) / SR:.2f} s - ucięty')
                end = min(end, cut)
    limit = max_length(name)
    if limit and (end - start) / SR > limit:
        notes.append(f'skrócony {(end - start) / SR:.2f} -> {limit:.2f} s')
        end = start + int(limit * SR)
    y = x[start:end].copy()
    fi = min(int((0.012 if slow else 0.003) * SR), len(y) // 4)
    fo = min(int(0.04 * SR), len(y) // 4) if not limit or (end - start) / SR < limit - 1e-3 else min(int(0.08 * SR), len(y) // 3)
    if fi: y[:fi] *= np.linspace(0, 1, fi) ** 2
    if fo: y[-fo:] *= np.linspace(1, 0, fo) ** 2
    return y

def limiter(x, ceiling):
    # Wzmocnienie <= 1 tak, by |x| nie przekroczyło ceiling: szybkie
    # wejście (patrzy 2 ms do przodu), powrót w 60 ms.
    need = np.minimum(1.0, ceiling / (np.abs(x) + 1e-12))
    ahead = int(0.002 * SR)
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * ahead + 1)
    rel = np.exp(-1 / (0.06 * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        cur = g[i] if g[i] < cur else g[i] + (cur - g[i]) * rel
        out[i] = cur
    return np.clip(x * out, -ceiling, ceiling)

# Pętle tła, które nie powinny "pulsować" co obieg: wahania głośności
# (okna 0,6 s) zmniejszone o tyle (0-1). Fale i trzaski ognia - bez zmian.
FLATTEN = {'water_underwater': 0.6, 'meteor_flight': 0.6, 'space_ambient': 0.5}

def flatten(x, amount):
    env = envelope(x, 600)
    ref = np.sqrt(np.mean(x * x))
    gain_db = np.clip(-amount * 20 * np.log10(env / ref), -12, 12)
    return x * 10 ** (gain_db / 20)

def make_loop(x, seconds=1.5):
    c = int(min(seconds, len(x) / SR / 6) * SR)
    t = np.linspace(0, np.pi / 2, c)
    head, tail, mid = x[:c], x[-c:], x[c:-c]
    return np.concatenate([tail * np.cos(t) + head * np.sin(t), mid])

def save(path, y):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'x.wav')
        wavfile.write(wav, SR, (np.clip(y, -1, 1) * 32767).astype(np.int16))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', path], check=True)

def main():
    src, game, out = sys.argv[1:4]
    report = []
    for d in sorted(glob.glob(os.path.join(src, '*', '*'))):
        name = os.path.basename(d)
        folder = FOLDER.get(os.path.basename(os.path.dirname(d)), os.path.basename(os.path.dirname(d)))
        files = sorted(glob.glob(os.path.join(d, '*')))
        olds = sorted(glob.glob(os.path.join(game, folder, name + '_[0-9].ogg'))) or [os.path.join(game, folder, name + '.ogg')]
        olds = [o for o in olds if os.path.exists(o)]
        loop = name in LOOPS
        target = np.mean([(loop_level if loop else level)(load(o)) for o in olds]) if olds else -20
        for i, f in enumerate(files, 1):
            notes = []
            x = load(f)
            x = x - np.mean(x)
            if loop:
                y = make_loop(flatten(x, FLATTEN[name]) if name in FLATTEN else x)
                if name in FLATTEN:
                    notes.append(f'wyrównane wahania głośności ({FLATTEN[name]:.0%})')
            else:
                y = trim(x, name, notes)
            now = (loop_level if loop else level)(y)
            gain = target - now
            peak = 20 * np.log10(np.max(np.abs(y)) + 1e-12)
            over = peak + gain + 1
            if over > 0:
                # Do 6 dB ponad -1 dBFS - ogranicznik (ostre trzaski i stuki
                # tracą tylko szczyt, a nie całą głośność), reszta - ciszej.
                limit = min(over, 6.0)
                if over > limit:
                    notes.append(f'szczyt - ciszej o {over - limit:.1f} dB niż cel')
                    gain -= over - limit
                if limit > 0.05:
                    notes.append(f'ogranicznik {limit:.1f} dB')
                y = limiter(y * 10 ** (gain / 20), 10 ** (-1 / 20))
            else:
                y = y * 10 ** (gain / 20)
            dest = os.path.join(out, folder, f'{name}_{i}.ogg' if len(files) > 1 or len(olds) > 1 else f'{name}.ogg')
            save(dest, y)
            report.append(dict(name=name, source=os.path.basename(f), file=os.path.relpath(dest, out),
                               seconds=round(len(y) / SR, 3), gain_db=round(gain, 1), target_db=round(float(target), 1), notes=notes))
            print(f'{os.path.relpath(dest, out):40} {len(y) / SR:6.2f} s  {gain:+6.1f} dB  {"; ".join(notes)}')
    if len(sys.argv) > 4:
        json.dump(report, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
