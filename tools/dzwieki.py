# ------------------------------------------------------------
# GENERATOR DŹWIĘKÓW GRY
#
# Wszystkie dźwięki gry (kroki, niszczenie i stawianie bloków,
# zbieranie owoców, meteoryt, menu i ekwipunek, woda) są
# "syntetyczne" - policzone z szumu i drgań, bez nagrań. Ten skrypt
# zapisuje je do assets/sounds/ jako pliki .ogg.
#
# Uruchomienie (potrzebny Python 3 z numpy i scipy oraz ffmpeg):
#
#     python tools/dzwieki.py                  wszystkie
#     python tools/dzwieki.py assets/sounds woda   tylko jedna grupa:
#                                  bloki, meteoryt, owoce, menu, woda
#
# (pliki .ogg za każdym razem wychodzą trochę inne w bajtach, więc
# lepiej przeliczać tylko grupę, która się zmieniła)
#
# Każdy plik można też podmienić własnym nagraniem (.ogg, ta sama
# nazwa) - gra niczego tu nie sprawdza. Lista dźwięków i ich
# głośności: src/audio/sounds.js.
# ------------------------------------------------------------

import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sounds')


# ------------------------------------------------------------
# Narzędzia
# ------------------------------------------------------------

class Synth:

    def __init__(self, seed):
        self.rng = np.random.default_rng(seed)

    def noise(self, seconds):
        return self.rng.standard_normal(samples(seconds))

    def brown(self, seconds):
        x = np.cumsum(self.noise(seconds))
        x -= np.convolve(x, np.ones(2048) / 2048, mode='same')
        return x / (np.abs(x).max() + 1e-9)

    def uniform(self, a, b):
        return self.rng.uniform(a, b)


def samples(seconds):
    return int(round(seconds * SR))


def time_axis(n):
    return np.arange(n) / SR


def envelope(n, attack, decay, hold=0.0):
    t = time_axis(n)
    rise = np.clip(t / max(attack, 1e-4), 0, 1)
    fall = np.exp(-np.maximum(t - attack - hold, 0) / decay)
    return rise * fall


def band(x, low, high, order=2):
    high = min(high, SR / 2 - 100)
    sos = butter(order, [low, high], 'bandpass', fs=SR, output='sos')
    return sosfilt(sos, x)


def lowpass(x, cutoff, order=2):
    sos = butter(order, cutoff, 'lowpass', fs=SR, output='sos')
    return sosfilt(sos, x)


def highpass(x, cutoff, order=2):
    sos = butter(order, cutoff, 'highpass', fs=SR, output='sos')
    return sosfilt(sos, x)


def place(out, sound, at):
    """Dodaje dźwięk do bufora out od sekundy at."""
    start = samples(at)
    if start >= len(out):
        return
    end = min(len(out), start + len(sound))
    out[start:end] += sound[:end - start]


def fade(x, fade_in=0.002, fade_out=0.02):
    n_in = max(1, samples(fade_in))
    n_out = max(1, samples(fade_out))
    x = x.copy()
    x[:n_in] *= np.linspace(0, 1, n_in)
    x[-n_out:] *= np.linspace(1, 0, n_out)
    return x


def normalize(x, peak):
    return x / (np.abs(x).max() + 1e-9) * peak


def loudness(x, target_db, window=0.05):
    """Głośność "na ucho": najgłośniejsze 50 ms ustawione na target_db,
    a szczyty łagodnie przycięte (bez trzasków)."""
    w = max(1, samples(window))
    power = np.convolve(x ** 2, np.ones(w) / w, mode='valid')
    level = np.sqrt(power.max() + 1e-12)
    x = x * (10 ** (target_db / 20) / level)
    return np.tanh(x / 0.95) * 0.95


def damped_sine(freq, seconds, decay, phase=0.0):
    t = time_axis(samples(seconds))
    return np.sin(2 * np.pi * freq * t + phase) * np.exp(-t / decay)


def sweep(f0, f1, seconds, decay):
    """Sinus z opadającą częstotliwością (huk)."""
    t = time_axis(samples(seconds))
    freq = f1 + (f0 - f1) * np.exp(-t / (seconds * 0.25))
    phase = 2 * np.pi * np.cumsum(freq) / SR
    return np.sin(phase) * np.exp(-t / decay)


def grains(s, seconds, count, low, high, length=(0.002, 0.008), density_decay=None, loudness=(0.3, 1.0)):
    """Chrzęst: dużo krótkich, cichych trzasków (ziarenka, kamyki)."""
    out = np.zeros(samples(seconds))
    for _ in range(count):
        if density_decay:
            at = min(seconds * 0.95, s.rng.exponential(density_decay))
        else:
            at = s.uniform(0, seconds * 0.9)
        n = int(s.uniform(*length) * SR)
        lo = s.uniform(low, (low + high) / 2)
        hi = min(high, lo * s.uniform(1.6, 3.5))
        g = band(s.noise(n / SR + 0.002)[:n], lo, hi) * envelope(n, 0.0005, n / SR / 3)
        place(out, g * s.uniform(*loudness), at)
    return out


def loopable(x, crossfade):
    """Pętla bez trzasku: koniec płynnie przechodzi w początek."""
    n = samples(crossfade)
    head = x[:n].copy()
    body = x[n:].copy()
    ramp = np.linspace(0, 1, n)
    body[-n:] = body[-n:] * (1 - ramp) + head * ramp
    return body


# ------------------------------------------------------------
# Materiały: kroki, niszczenie, stawianie
#
# heavy: 0 = krok, 1 = postawienie (więcej dołu), 2 = zniszczenie
# (dłużej, głośniej, z okruchami).
# ------------------------------------------------------------

def mat_grass(s, heavy):
    length = [0.2, 0.2, 0.36][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    body = band(s.noise(length), 400, 4200) * envelope(n, 0.003, [0.045, 0.04, 0.09][heavy])
    out += body * 0.5
    out += grains(s, length, [35, 25, 90][heavy], 1200, 6000, density_decay=[0.05, 0.04, 0.09][heavy])
    out += lowpass(s.noise(length), 350) * envelope(n, 0.002, 0.03) * [0.3, 0.6, 0.5][heavy]
    if heavy == 2:
        out += lowpass(band(s.noise(length), 150, 1500) * envelope(n, 0.004, 0.08), 1500) * 0.6
    return out


def mat_dirt(s, heavy):
    length = [0.18, 0.18, 0.34][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    out += band(s.noise(length), 120, 1800) * envelope(n, 0.003, [0.04, 0.045, 0.1][heavy]) * 0.9
    out += grains(s, length, [18, 14, 60][heavy], 400, 3500, density_decay=[0.04, 0.035, 0.08][heavy])
    out += damped_sine(s.uniform(65, 85), length, 0.04) * [0.25, 0.6, 0.45][heavy]
    return out


def mat_stone(s, heavy):
    length = [0.13, 0.14, 0.42][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    click = band(s.noise(length), 1500, 6000) * envelope(n, 0.0005, [0.006, 0.006, 0.012][heavy])
    out += click * [0.6, 0.5, 1.0][heavy]
    out += band(s.noise(length), 300, 2500) * envelope(n, 0.001, [0.025, 0.03, 0.06][heavy]) * 0.8
    for base in (s.uniform(700, 1000), s.uniform(1400, 1900), s.uniform(2500, 3200)):
        out += damped_sine(base, length, s.uniform(0.012, 0.03), s.uniform(0, 6)) * s.uniform(0.08, 0.22)
    out += damped_sine(s.uniform(150, 200), length, 0.025) * [0.3, 0.6, 0.5][heavy]
    if heavy == 2:
        # okruchy skały spadające po pęknięciu
        debris = np.zeros(n)
        for _ in range(16):
            piece = band(s.noise(0.02), 1200, 4500)[: samples(0.02)] * envelope(samples(0.02), 0.0005, 0.004)
            for f in (s.uniform(1800, 4200),):
                piece += damped_sine(f, 0.02, 0.006)[: len(piece)] * 0.3
            place(debris, piece * s.uniform(0.15, 0.5), 0.04 + s.rng.exponential(0.09))
        out += debris
    return out


def mat_sand(s, heavy):
    length = [0.22, 0.2, 0.42][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    hiss = band(s.noise(length), 900, 5000) * envelope(n, [0.012, 0.008, 0.02][heavy], [0.06, 0.05, 0.14][heavy])
    out += hiss * 0.5
    out += grains(s, length, [70, 50, 180][heavy], 1500, 7000, length=(0.001, 0.003), density_decay=[0.06, 0.05, 0.12][heavy])
    out += lowpass(s.noise(length), 400) * envelope(n, 0.004, 0.04) * [0.15, 0.35, 0.3][heavy]
    return out


def mat_gravel(s, heavy):
    length = [0.22, 0.2, 0.42][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    out += grains(s, length, [55, 40, 150][heavy], 500, 4500, length=(0.002, 0.007), density_decay=[0.05, 0.04, 0.11][heavy], loudness=(0.4, 1.0))
    out += band(s.noise(length), 200, 1500) * envelope(n, 0.003, 0.04) * 0.4
    out += damped_sine(s.uniform(80, 110), length, 0.03) * [0.2, 0.5, 0.4][heavy]
    return out


def mat_mud(s, heavy):
    length = [0.24, 0.22, 0.4][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    t = time_axis(n)
    wet = lowpass(s.noise(length), 900) * envelope(n, 0.006, [0.07, 0.06, 0.13][heavy])
    squelch = np.sin(2 * np.pi * np.cumsum(260 - 140 * np.clip(t / 0.12, 0, 1)) / SR) * envelope(n, 0.01, 0.05)
    out += wet * 0.8 + squelch * 0.35
    out += grains(s, length, [10, 8, 30][heavy], 300, 1500, length=(0.004, 0.012))
    return out


def mat_plant(s, heavy):
    length = [0.28, 0.25, 0.32][heavy]
    out = np.zeros(samples(length))
    for _ in range([3, 2, 4][heavy]):
        n = int(s.uniform(0.09, 0.2) * SR)
        swish = band(s.noise(n / SR), 1500, 7000) * envelope(n, s.uniform(0.015, 0.04), s.uniform(0.03, 0.06))
        place(out, swish * s.uniform(0.4, 1.0), s.uniform(0, length * 0.35))
    out += grains(s, length, [12, 8, 30][heavy], 2000, 7000, length=(0.001, 0.003), loudness=(0.1, 0.4))
    if heavy == 2:
        snap = band(s.noise(0.02), 900, 3500)[: samples(0.02)] * envelope(samples(0.02), 0.0005, 0.005)
        place(out, snap * 1.2, 0.0)
    return out


def mat_glass(s, heavy):
    length = [0.16, 0.22, 0.6][heavy]
    out = np.zeros(samples(length))
    n = len(out)
    out += band(s.noise(length), 2500, 9000) * envelope(n, 0.0005, 0.006) * 0.6
    count = [3, 3, 14][heavy]
    for i in range(count):
        at = 0 if i < 3 else s.rng.exponential(0.08)
        tone = damped_sine(s.uniform(2400, 6800), length, s.uniform(0.04, 0.12) * (1.0 if heavy else 0.5), s.uniform(0, 6))
        place(out, tone * s.uniform(0.15, 0.4), at)
    out += damped_sine(s.uniform(180, 240), length, 0.02) * [0.25, 0.5, 0.3][heavy]
    return out


MATERIALS = {
    'grass': mat_grass,
    'dirt': mat_dirt,
    'stone': mat_stone,
    'sand': mat_sand,
    'gravel': mat_gravel,
    'mud': mat_mud,
    'plant': mat_plant,
    'glass': mat_glass
}

# ile wersji każdego rodzaju (gra losuje jedną)
KINDS = {'step': (0, 4), 'place': (1, 3), 'break': (2, 3)}

# głośność (najgłośniejsze 50 ms, dB)
LOUDNESS = {'step': -16, 'place': -14, 'break': -12}


# ------------------------------------------------------------
# Meteoryt
# ------------------------------------------------------------

def meteor_flight(s):
    """Huk lecącej kuli ognia (pętla): głęboki pomruk, szum i trzaski."""
    length = 6.5
    n = samples(length)
    t = time_axis(n)
    lfo = (0.6 + 0.25 * np.sin(2 * np.pi * 0.37 * t) + 0.15 * np.sin(2 * np.pi * 1.3 * t + 1)
           + 0.1 * np.sin(2 * np.pi * 2.9 * t + 2))
    rumble = lowpass(s.brown(length), 260, order=4) * 1.2
    roar = band(s.noise(length), 180, 1600, order=2) * 0.25
    hiss = band(s.noise(length), 2500, 8000) * 0.05 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.8 * t))
    crackle = np.zeros(n)
    for _ in range(int(length * 22)):
        k = int(s.uniform(0.0015, 0.006) * SR)
        pop = band(s.noise(k / SR + 0.001)[:k], 900, 5000) * envelope(k, 0.0003, k / SR / 4)
        place(crackle, pop * s.rng.exponential(0.25), s.uniform(0, length - 0.01))
    out = (rumble * 1.4 + roar * 1.3) * lfo + hiss * 0.6 + crackle * 0.35
    out = loopable(out, 0.5)
    return normalize(out, 0.8)


def meteor_impact(s):
    """Uderzenie: trzask, głęboki huk, grzmot i spadające okruchy."""
    length = 6.0
    n = samples(length)
    t = time_axis(n)
    out = np.zeros(n)
    crack = s.noise(length) * envelope(n, 0.0005, 0.018)
    out += lowpass(crack, 4500) * 1.4
    out += sweep(110, 32, length, 1.1) * 1.6
    out += damped_sine(38, length, 1.6) * 0.9
    cutoff_noise = s.noise(length) * envelope(n, 0.002, 0.9)
    early = lowpass(cutoff_noise, 2500, order=2) * np.exp(-t / 0.25)
    late = lowpass(cutoff_noise, 400, order=2)
    out += (early * 0.9 + late * 1.6)
    out += lowpass(s.brown(length), 140, order=4) * envelope(n, 0.05, 2.0) * 1.4
    out += grains(s, length, 160, 700, 6000, length=(0.002, 0.01), density_decay=0.7, loudness=(0.05, 0.35))
    return fade(normalize(out, 0.95), 0.0005, 0.6)


def meteor_debris(s):
    """Grad odłamków: kamyki i grudki ziemi spadające dookoła."""
    length = 3.0
    n = samples(length)
    out = np.zeros(n)
    for _ in range(140):
        at = 0.05 + s.rng.exponential(0.6)
        if at > length - 0.1:
            continue
        if s.uniform(0, 1) < 0.5:
            piece = mat_stone(s, 0)[: samples(0.06)]
        else:
            piece = mat_dirt(s, 0)[: samples(0.08)]
        place(out, fade(piece, 0.0005, 0.01) * s.uniform(0.1, 0.7) * np.exp(-at / 1.4), at)
    return fade(normalize(out, 0.85), 0.001, 0.3)


def fire_crackle(s):
    """Trzaskający żar (pętla)."""
    length = 5.0
    n = samples(length)
    t = time_axis(n)
    out = np.zeros(n)
    for _ in range(int(length * 28)):
        k = int(s.uniform(0.001, 0.007) * SR)
        lo = s.uniform(700, 3000)
        pop = band(s.noise(k / SR + 0.001)[:k], lo, lo * 3) * envelope(k, 0.0002, k / SR / 4)
        place(out, pop * s.rng.exponential(0.3), s.uniform(0, length - 0.01))
    out += band(s.noise(length), 1500, 6000) * 0.04 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.5 * t))
    out += lowpass(s.brown(length), 180) * 0.35 * (0.7 + 0.3 * np.sin(2 * np.pi * 0.23 * t + 1))
    return normalize(loopable(out, 0.4), 0.7)


METEOR = {
    'meteor_flight': meteor_flight,
    'meteor_impact': meteor_impact,
    'meteor_debris': meteor_debris,
    'fire_crackle': fire_crackle
}


# ------------------------------------------------------------
# Zbieranie owoców z krzaka
# ------------------------------------------------------------

def harvest(s):
    """Szelest liści i kilka miękkich "pyknięć" zrywanych owoców."""
    length = 0.45
    out = lowpass(mat_plant(s, 0), 4500)
    out = np.concatenate([out, np.zeros(samples(length) - len(out))]) * 0.45
    at = s.uniform(0.04, 0.08)
    for _ in range(int(s.uniform(2, 4))):
        freq = s.uniform(520, 820)
        pop = sweep(freq * 1.5, freq, 0.06, 0.012) + band(s.noise(0.06), 1200, 4000) * envelope(samples(0.06), 0.0005, 0.004) * 0.4
        place(out, pop * s.uniform(0.8, 1.3), at)
        at += s.uniform(0.06, 0.11)
    return out


# ------------------------------------------------------------
# Menu i ekwipunek - krótkie, miękkie, ciche dźwięki
# ------------------------------------------------------------

def soft_tone(freq, seconds, decay, harmonics=(1.0, 0.25, 0.08), attack=0.002):
    """Ton z kilkoma alikwotami (cieplejszy niż czysty sinus)."""
    n = samples(seconds)
    t = time_axis(n)
    out = sum(a * np.sin(2 * np.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
    return out * envelope(n, attack, decay)


def ui_click(s):
    """Przycisk: krótki, drewniano-plastikowy stuk."""
    length = 0.09
    n = samples(length)
    out = band(s.noise(length), 2500, 7000) * envelope(n, 0.0003, 0.0025) * 0.5
    out += damped_sine(1850, length, 0.007) * 0.55
    out += damped_sine(620, length, 0.018) * 0.8
    out += damped_sine(240, length, 0.012) * 0.3
    return out


def ui_slider(s):
    """Suwak: malutkie "tyk" przy każdym kroku."""
    length = 0.04
    n = samples(length)
    out = band(s.noise(length), 3000, 9000) * envelope(n, 0.0002, 0.0015) * 0.6
    out += damped_sine(2600, length, 0.004) * 0.5
    out += damped_sine(900, length, 0.006) * 0.25
    return out


def ui_open(s):
    """Otwarcie ekwipunku: szelest torby i miękkie stuknięcie."""
    length = 0.32
    n = samples(length)
    swish = band(s.noise(length), 500, 3200) * envelope(n, 0.05, 0.07)
    out = lowpass(swish, 2600) * 0.9
    out += grains(s, length, 18, 1500, 5000, length=(0.001, 0.004), loudness=(0.05, 0.25)) * envelope(n, 0.04, 0.1)
    thump = damped_sine(130, length, 0.05) * 0.7 + damped_sine(260, length, 0.03) * 0.25
    place(out, thump[: samples(0.25)], 0.055)
    return out


def ui_close(s):
    """Zamknięcie ekwipunku: stuknięcie i krótszy szelest."""
    length = 0.26
    n = samples(length)
    out = damped_sine(115, length, 0.045) * 0.75 + damped_sine(230, length, 0.025) * 0.2
    swish = band(s.noise(length), 400, 2400) * envelope(n, 0.012, 0.06)
    out += lowpass(swish, 2000) * 0.7
    return out


def item_pick(s):
    """Wzięcie stosu w ekwipunku: lekkie "pyk" w górę."""
    length = 0.1
    n = samples(length)
    t = time_axis(n)
    freq = 620 + 380 * (1 - np.exp(-t / 0.02))
    out = np.sin(2 * np.pi * np.cumsum(freq) / SR) * envelope(n, 0.002, 0.025)
    out += band(s.noise(length), 1500, 5000) * envelope(n, 0.0005, 0.004) * 0.35
    return out


def item_place(s):
    """Odłożenie stosu: miękki stuk w dół."""
    length = 0.11
    n = samples(length)
    t = time_axis(n)
    freq = 420 + 300 * np.exp(-t / 0.015)
    out = np.sin(2 * np.pi * np.cumsum(freq) / SR) * envelope(n, 0.001, 0.03)
    out += band(s.noise(length), 900, 3500) * envelope(n, 0.0005, 0.005) * 0.45
    out += damped_sine(160, length, 0.02) * 0.35
    return out


def item_trash(s):
    """Kosz: "puf" - zgnieciony papier i opadający ton."""
    length = 0.35
    n = samples(length)
    out = band(s.noise(length), 700, 4500) * envelope(n, 0.01, 0.07) * 0.6
    out += grains(s, length, 40, 1200, 6000, length=(0.001, 0.005), density_decay=0.08, loudness=(0.1, 0.5))
    out += sweep(520, 140, length, 0.09) * 0.45
    return out


def ui_error(s):
    """Błąd (np. zła komenda): dwa niskie, łagodne "bum"."""
    length = 0.3
    out = np.zeros(samples(length))
    place(out, soft_tone(233, 0.12, 0.035, (1.0, 0.45, 0.2, 0.08)), 0.0)
    place(out, soft_tone(185, 0.16, 0.05, (1.0, 0.45, 0.2, 0.08)), 0.1)
    return lowpass(out, 2200)


UI = {
    'ui_click': ui_click,
    'ui_slider': ui_slider,
    'ui_open': ui_open,
    'ui_close': ui_close,
    'item_pick': item_pick,
    'item_place': item_place,
    'item_trash': item_trash,
    'ui_error': ui_error
}

# głośność (najgłośniejsze 50 ms, dB) - menu ciszej niż świat
UI_LOUDNESS = {
    'ui_click': -19,
    'ui_slider': -28,
    'ui_open': -19,
    'ui_close': -20,
    'item_pick': -21,
    'item_place': -20,
    'item_trash': -19,
    'ui_error': -18
}


# ------------------------------------------------------------
# Woda
# ------------------------------------------------------------

def bubble(s, freq, decay, rise=None):
    """Bąbelek: krótki ton, który rośnie w górę (pękający pęcherzyk)."""
    length = decay * 6
    n = samples(length)
    t = time_axis(n)
    rise = s.uniform(1.5, 4.0) if rise is None else rise
    f = freq * (1 + rise * t / length)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * envelope(n, 0.0008, decay)


def bubbles(s, length, count, low, high, spread=None, loud=(0.2, 1.0), decay=(0.008, 0.03)):
    """Dużo bąbelków: rozrzucone w czasie (spread - rozkład wykładniczy)."""
    out = np.zeros(samples(length))
    for _ in range(count):
        at = min(length * 0.95, s.rng.exponential(spread)) if spread else s.uniform(0, length * 0.95)
        b = bubble(s, s.uniform(low, high), s.uniform(*decay))
        place(out, b * s.uniform(*loud), at)
    return out


def water_splash(s):
    """Wpadnięcie do wody: chlust, głuche uderzenie i bąbelki."""
    length = 1.1
    n = samples(length)
    out = lowpass(s.noise(length), 3800) * envelope(n, 0.004, 0.09) * 0.9
    out += band(s.noise(length), 250, 900) * envelope(n, 0.01, 0.16) * 0.8
    out += damped_sine(s.uniform(70, 95), length, 0.07) * 0.6
    out += bubbles(s, length, 70, 250, 1400, spread=0.25, loud=(0.1, 0.6))
    return out


def water_swim(s):
    """Ruch ramion w wodzie: miękki szum przepływu i kilka bąbelków."""
    length = 0.6
    n = samples(length)
    swirl = band(s.noise(length), 250, 1600) * envelope(n, s.uniform(0.08, 0.14), 0.12)
    out = lowpass(swirl, 1800) * 0.9
    out += bubbles(s, length, 10, 300, 1000, spread=0.18, loud=(0.1, 0.45))
    return out


def water_wade(s):
    """Krok w płytkiej wodzie: chlupnięcie."""
    length = 0.35
    n = samples(length)
    out = lowpass(s.noise(length), 2600) * envelope(n, 0.006, 0.05) * 0.8
    out += band(s.noise(length), 300, 1200) * envelope(n, 0.01, 0.08) * 0.6
    out += bubbles(s, length, 8, 400, 1300, spread=0.07, loud=(0.15, 0.5))
    return out


def water_exit(s):
    """Wyjście z wody: spływająca woda i krople."""
    length = 1.0
    n = samples(length)
    out = band(s.noise(length), 400, 2500) * envelope(n, 0.02, 0.18) * 0.55
    for _ in range(9):
        drop = bubble(s, s.uniform(900, 2200), s.uniform(0.006, 0.015), rise=s.uniform(0.5, 1.5))
        place(out, drop * s.uniform(0.15, 0.5), s.uniform(0.15, 0.9))
    return out


def water_underwater(s):
    """Pod wodą (pętla): głuchy szum i od czasu do czasu bąbelki."""
    length = 8.0
    n = samples(length)
    t = time_axis(n)
    out = lowpass(s.brown(length), 320, order=4) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.13 * t))
    out += lowpass(s.noise(length), 600) * 0.05
    for _ in range(5):
        at = s.uniform(0.3, length - 1.2)
        place(out, bubbles(s, 0.8, int(s.uniform(4, 10)), 220, 650, spread=0.2, loud=(0.1, 0.35), decay=(0.015, 0.04)), at)
    return normalize(loopable(out, 0.8), 0.7)


def water_waves(s):
    """Fale przy brzegu (pętla): spokojne nabiegające fale."""
    length = 12.0
    n = samples(length)
    t = time_axis(n)
    swell = np.zeros(n)
    at = 0.2
    while at < length:
        rise, fall = s.uniform(0.9, 1.4), s.uniform(1.6, 2.4)
        k = (t - at)
        env = np.where(k < 0, 0, np.where(k < rise, (k / rise) ** 2, np.exp(-(k - rise) / (fall / 3))))
        swell = np.maximum(swell, env * s.uniform(0.6, 1.0))
        at += s.uniform(2.6, 4.0)
    body = band(s.noise(length), 180, 1400) * swell
    fizz = band(s.noise(length), 2200, 5000) * np.roll(swell, samples(0.35)) * 0.1
    low = lowpass(s.brown(length), 200) * 0.3
    out = body + fizz + low + bubbles(s, length, 40, 500, 1600, loud=(0.03, 0.12))
    return normalize(loopable(out, 1.2), 0.7)


WATER = {
    'water_splash': (water_splash, 3, -12),
    'water_swim': (water_swim, 4, -19),
    'water_wade': (water_wade, 4, -18),
    'water_exit': (water_exit, 2, -20)
}

WATER_LOOPS = {
    'water_underwater': water_underwater,
    'water_waves': water_waves
}


# ------------------------------------------------------------
# Zapis
# ------------------------------------------------------------

def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'x.wav')
        wavfile.write(wav, SR, (np.clip(data, -1, 1) * 32767).astype(np.int16))
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', path],
            check=True
        )


GROUPS = ['bloki', 'meteoryt', 'owoce', 'menu', 'woda']


def generate(root=ROOT, only=None):
    # Ziarna liczą się zawsze po kolei (także dla pomijanych grup), więc
    # dźwięk wychodzi taki sam bez względu na to, co się przelicza.
    want = lambda group: only is None or only == group
    seed = 1
    for material, make in MATERIALS.items():
        for kind, (heavy, variants) in KINDS.items():
            for v in range(1, variants + 1):
                seed += 1
                if want('bloki'):
                    sound = fade(loudness(make(Synth(seed), heavy), LOUDNESS[kind]), 0.0005, 0.03)
                    save(os.path.join(root, 'blocks', f'{kind}_{material}_{v}.ogg'), sound)
    for name, make in METEOR.items():
        seed += 101
        if want('meteoryt'):
            save(os.path.join(root, 'meteor', f'{name}.ogg'), make(Synth(seed)))
    for v in range(1, 4):
        seed += 1
        if want('owoce'):
            sound = fade(loudness(harvest(Synth(seed)), -15), 0.0005, 0.04)
            save(os.path.join(root, 'blocks', f'harvest_{v}.ogg'), sound)
    for name, make in UI.items():
        seed += 1
        if want('menu'):
            sound = fade(loudness(make(Synth(seed)), UI_LOUDNESS[name]), 0.0003, 0.015)
            save(os.path.join(root, 'ui', f'{name}.ogg'), sound)
    for name, (make, variants, level) in WATER.items():
        for v in range(1, variants + 1):
            seed += 1
            if want('woda'):
                sound = fade(loudness(make(Synth(seed)), level), 0.0005, 0.05)
                save(os.path.join(root, 'water', f'{name}_{v}.ogg'), sound)
    for name, make in WATER_LOOPS.items():
        seed += 1
        if want('woda'):
            save(os.path.join(root, 'water', f'{name}.ogg'), make(Synth(seed)))


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else ROOT
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if only is not None and only not in GROUPS:
        sys.exit(f'Nieznana grupa "{only}" - do wyboru: {", ".join(GROUPS)}')
    generate(root, only)
    print('Gotowe:', os.path.abspath(root), f'(grupa: {only})' if only else '')
