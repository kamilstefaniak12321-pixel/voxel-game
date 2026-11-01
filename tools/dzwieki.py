# ------------------------------------------------------------
# GENERATOR DŹWIĘKÓW GRY
#
# Wszystkie dźwięki gry (kroki, niszczenie i stawianie bloków,
# zbieranie owoców, meteoryt, menu i ekwipunek, woda, kosmos,
# osiągnięcia) są
# "syntetyczne" - policzone z szumu i drgań, bez nagrań. Ten skrypt
# zapisuje je do assets/sounds/ jako pliki .ogg.
#
# Uruchomienie (potrzebny Python 3 z numpy i scipy oraz ffmpeg):
#
#     python tools/dzwieki.py                  wszystkie
#     python tools/dzwieki.py assets/sounds woda   tylko jedna grupa:
#                                  bloki, meteoryt, owoce, menu, woda, kosmos,
#                                  osiagniecia, wytwarzanie, snieg (same
#                                  dźwięki śniegu - nowy materiał)
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
# (dłużej, z okruchami).
#
# Wszystkie są "miękkie": łagodny początek (bez trzasku), mało
# wysokich tonów (szum zamiast syku), raczej cicho - mają być tłem,
# a nie zwracać na siebie uwagę. Trawa szeleści, ziemia głucho
# stuka, kamień puka, piasek szumi, żwir chrzęści, błoto mlaszcze,
# rośliny szeleszczą liśćmi, szkło (lampy) cicho dzwoni, drewno puka.
# ------------------------------------------------------------

def soft_env(n, attack, decay):
    """Obwiednia bez trzasku: płynne narastanie (połowa cosinusa)
    i wykładnicze wygasanie."""
    t = time_axis(n)
    rise = np.where(t < attack, 0.5 - 0.5 * np.cos(np.pi * np.clip(t / max(attack, 1e-4), 0, 1)), 1.0)
    fall = np.exp(-np.maximum(t - attack, 0) / decay)
    return rise * fall


def rustle(s, length, count, low, high, spread, swish=(0.02, 0.05), attack=(0.008, 0.02), loud=(0.3, 1.0)):
    """Szelest: dużo krótkich, nakładających się "przesunięć" źdźbeł
    albo liści - każde z łagodnym początkiem."""
    out = np.zeros(samples(length))
    for _ in range(count):
        n = samples(s.uniform(*swish) * 2.5)
        lo = s.uniform(low, (low + high) / 2)
        hi = min(high, lo * s.uniform(1.8, 3.0))
        piece = band(s.noise(n / SR), lo, hi) * soft_env(n, s.uniform(*attack), s.uniform(*swish) / 2)
        place(out, piece * s.uniform(*loud), s.rng.uniform(0, spread))
    return out


def thump(s, length, cutoff, attack, decay, amount):
    """Głuchy dół (nacisk stopy, położony blok)."""
    n = samples(length)
    return lowpass(s.noise(length), cutoff, 2) * soft_env(n, attack, decay) * amount


def crumble(s, length, count, low, high, spread, grain=(0.004, 0.011), loud=(0.2, 0.7)):
    """Kruszenie: ziarenka z łagodnym początkiem (nie trzaski)."""
    out = np.zeros(samples(length))
    for _ in range(count):
        n = samples(s.uniform(*grain))
        lo = s.uniform(low, (low + high) / 2)
        hi = min(high, lo * s.uniform(1.6, 2.6))
        piece = band(s.noise(n / SR + 0.002)[:n], lo, hi) * soft_env(n, n / SR * 0.3, n / SR / 3)
        place(out, piece * s.uniform(*loud), min(length * 0.9, s.rng.exponential(spread)))
    return out


def mat_grass(s, heavy):
    # miękka trawa lekko szeleszcząca pod stopą
    length = [0.3, 0.26, 0.42][heavy]
    out = rustle(s, length, [9, 7, 16][heavy], 700, 3200, [0.11, 0.08, 0.22][heavy])
    out += thump(s, length, 220, 0.008, [0.05, 0.06, 0.07][heavy], [0.5, 0.9, 0.7][heavy])
    if heavy == 2:
        out += crumble(s, length, 14, 300, 1600, 0.08, loud=(0.15, 0.4))
    return lowpass(out, 3600)


def mat_dirt(s, heavy):
    # głuche stuknięcie i ciche osypywanie się grudek
    length = [0.24, 0.24, 0.4][heavy]
    out = thump(s, length, 320, 0.006, [0.05, 0.06, 0.08][heavy], [1.0, 1.4, 1.1][heavy])
    out += crumble(s, length, [10, 8, 34][heavy], 300, 1700, [0.04, 0.03, 0.09][heavy])
    out += band(s.noise(length), 250, 1100) * soft_env(samples(length), 0.008, 0.04) * 0.35
    return lowpass(out, 2400)


def mat_stone(s, heavy):
    # krótkie, przytłumione puknięcie (bez dzwonienia)
    length = [0.18, 0.2, 0.45][heavy]
    n = samples(length)
    out = band(s.noise(length), 300, 2000) * soft_env(n, 0.003, [0.022, 0.028, 0.04][heavy]) * 0.9
    out += damped_sine(s.uniform(140, 190), length, 0.03) * soft_env(n, 0.003, 1) * [0.25, 0.5, 0.4][heavy]
    out += band(s.noise(length), 1000, 2800) * soft_env(n, 0.005, 0.03) * 0.4
    if heavy == 2:
        out += crumble(s, length, 22, 500, 2600, 0.1, grain=(0.006, 0.016), loud=(0.15, 0.45))
    return lowpass(out, 2800)


def mat_sand(s, heavy):
    # cichy, miękki szum osypującego się piasku
    length = [0.3, 0.26, 0.45][heavy]
    n = samples(length)
    out = band(s.noise(length), 350, 2400) * soft_env(n, [0.025, 0.018, 0.03][heavy], [0.07, 0.06, 0.13][heavy]) * 0.6
    out += crumble(s, length, [20, 14, 50][heavy], 1200, 3000, [0.06, 0.05, 0.12][heavy], grain=(0.002, 0.005), loud=(0.05, 0.2))
    out += thump(s, length, 200, 0.012, 0.05, [0.3, 0.5, 0.4][heavy])
    return lowpass(out, 3000)


def mat_gravel(s, heavy):
    # przytłumiony chrzęst kamyków
    length = [0.28, 0.24, 0.45][heavy]
    out = crumble(s, length, [26, 18, 70][heavy], 400, 2600, [0.05, 0.04, 0.11][heavy], grain=(0.005, 0.012), loud=(0.3, 0.9))
    out += thump(s, length, 260, 0.006, 0.05, [0.6, 1.0, 0.8][heavy])
    return lowpass(out, 3200)


def mat_mud(s, heavy):
    # miękkie mlaśnięcie
    length = [0.28, 0.26, 0.42][heavy]
    n = samples(length)
    t = time_axis(n)
    wet = lowpass(s.noise(length), 700) * soft_env(n, 0.012, [0.07, 0.06, 0.12][heavy])
    pitch = 230 - 110 * np.clip(t / 0.14, 0, 1)
    squelch = np.sin(2 * np.pi * np.cumsum(pitch) / SR) * soft_env(n, 0.02, 0.05)
    out = wet * 0.9 + squelch * 0.25
    out += crumble(s, length, [5, 4, 14][heavy], 250, 900, 0.06, grain=(0.008, 0.02), loud=(0.1, 0.3))
    return lowpass(out, 1500)


def mat_plant(s, heavy):
    # liście: lekki, przewiewny szelest
    length = [0.32, 0.28, 0.36][heavy]
    out = rustle(s, length, [8, 6, 12][heavy], 900, 3600, [0.12, 0.09, 0.16][heavy], swish=(0.025, 0.06), attack=(0.012, 0.03))
    if heavy == 2:
        n = samples(0.03)
        snap = band(s.noise(0.03), 600, 2000)[:n] * soft_env(n, 0.002, 0.008)
        place(out, snap * 0.5, 0.0)
    return lowpass(out, 4000)


def mat_glass(s, heavy):
    # cichy, przytłumiony "dzyń" (lampy)
    length = [0.22, 0.28, 0.6][heavy]
    n = samples(length)
    out = band(s.noise(length), 600, 2400) * soft_env(n, 0.002, 0.012) * 0.3
    for _ in range(2 if heavy < 2 else 3):
        out += damped_sine(s.uniform(1300, 2600), length, s.uniform(0.04, 0.09), s.uniform(0, 6)) * soft_env(n, 0.0015, 1) * s.uniform(0.12, 0.25)
    out += damped_sine(s.uniform(180, 230), length, 0.025) * soft_env(n, 0.003, 1) * [0.3, 0.5, 0.35][heavy]
    if heavy == 2:
        for _ in range(9):
            tone = damped_sine(s.uniform(1500, 3600), 0.08, s.uniform(0.015, 0.035), s.uniform(0, 6))
            place(out, tone * soft_env(len(tone), 0.001, 1) * s.uniform(0.06, 0.18), 0.03 + s.rng.exponential(0.08))
    return lowpass(out, 4500)


def mat_wood(s, heavy):
    # drewno (pnie, deski): ciepłe, głuche puknięcie; przy niszczeniu
    # jeszcze ciche trzaski drzazg
    length = [0.22, 0.24, 0.42][heavy]
    n = samples(length)
    out = band(s.noise(length), 280, 1500) * soft_env(n, 0.003, [0.02, 0.026, 0.035][heavy]) * 0.8
    body = s.uniform(140, 190) if heavy == 1 else s.uniform(170, 240)
    out += damped_sine(body, length, [0.035, 0.045, 0.04][heavy]) * soft_env(n, 0.003, 1) * [0.5, 0.8, 0.6][heavy]
    out += damped_sine(body * s.uniform(2.3, 2.9), length, 0.02) * soft_env(n, 0.002, 1) * 0.18
    if heavy == 2:
        out += crumble(s, length, 18, 700, 3000, 0.07, grain=(0.004, 0.01), loud=(0.15, 0.5))
    return lowpass(out, 3000)


def mat_snow(s, heavy):
    # śnieg: miękkie, gęste skrzypnięcie (drobne chrupnięcia ubijanego
    # śniegu) i ciche, głuche "puf"
    length = [0.3, 0.26, 0.42][heavy]
    n = samples(length)
    out = crumble(s, length, [34, 24, 60][heavy], 900, 3400, [0.07, 0.05, 0.12][heavy], grain=(0.002, 0.006), loud=(0.15, 0.5))
    out += band(s.noise(length), 300, 1600) * soft_env(n, 0.02, [0.06, 0.05, 0.1][heavy]) * 0.35
    out += thump(s, length, 180, 0.01, 0.05, [0.4, 0.6, 0.5][heavy])
    return lowpass(out, 3800)


MATERIALS = {
    'grass': mat_grass,
    'dirt': mat_dirt,
    'stone': mat_stone,
    'sand': mat_sand,
    'gravel': mat_gravel,
    'mud': mat_mud,
    'plant': mat_plant,
    'glass': mat_glass,
    'wood': mat_wood,
    'snow': mat_snow
}

# ile wersji każdego rodzaju (gra losuje jedną - więcej kroków, żeby
# się nie powtarzały; ta sama liczba w src/audio/sounds.js)
KINDS = {'step': (0, 6), 'place': (1, 3), 'break': (2, 3)}

# głośność (najgłośniejsze 50 ms, dB) - kroki najciszej, mają być tłem
LOUDNESS = {'step': -21, 'place': -18.5, 'break': -17}


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


def minnaert(s, f0, amp, rise):
    """Pęcherzyk w strumieniu (model van den Doela): ton f0, tłumiony
    współczynnikiem d (większe pęcherzyki - niżej, dłużej), wysokość
    rośnie w miarę wypływania pęcherzyka (f0 * (1 + rise * d * t))."""
    d = 0.13 * f0 + 0.0072 * f0 ** 1.5
    length = 6.0 / d
    n = samples(length)
    t = time_axis(n)
    f = f0 * (1 + rise * d * t)
    phase = 2 * np.pi * np.cumsum(f) / SR
    attack = np.minimum(1, t / 0.0015) ** 2
    return np.sin(phase) * np.exp(-d * t) * attack * amp


def water_stream(s):
    """Strumień, rzeka (pętla): szemranie płynącej wody - szum przepływu
    i setki pęcherzyków (Minnaert) w skupiskach, jak woda przelewająca się
    przez kamienie. 24 s, bez wyraźnego rytmu."""
    length = 26.0
    n = samples(length)
    t = time_axis(n)

    # Przepływ: szum w paśmie wody, wolno falujący (kilka niezależnych
    # "nurtów").
    sway = 0.72 + 0.12 * np.sin(2 * np.pi * 0.071 * t + s.uniform(0, 6)) \
        + 0.09 * np.sin(2 * np.pi * 0.23 * t + s.uniform(0, 6)) \
        + 0.07 * np.sin(2 * np.pi * 0.53 * t + s.uniform(0, 6))
    rush = band(s.noise(length), 220, 1500, order=2) * sway * 0.22
    rush += band(s.noise(length), 1500, 5000, order=2) * sway * 0.035
    rush += lowpass(s.brown(length), 160) * 0.2

    # Pęcherzyki: tło (pojedyncze) i skupiska (bulgotanie przy kamieniu).
    bubbles_out = np.zeros(n)

    def drop_bubble(at, low, high):
        # Rozkład rozmiarów: więcej małych (wysokich) niż dużych.
        r = np.exp(s.uniform(np.log(3.26 / high), np.log(3.26 / low)))
        f0 = 3.26 / r
        amp = (low / f0) ** 0.6 * np.exp(s.rng.normal(0, 0.45))
        place(bubbles_out, minnaert(s, f0, amp, s.uniform(0.04, 0.16)), at)

    at = 0.0
    while at < length:
        at += s.rng.exponential(1 / 160)
        drop_bubble(at, 450, 2600)

    at = 0.0
    while at < length:
        at += s.rng.exponential(1 / 6)
        size = int(s.uniform(8, 40))
        spread = s.uniform(0.04, 0.22)
        low = s.uniform(220, 600)
        for _ in range(size):
            drop_bubble(at + s.rng.exponential(spread), low, low * s.uniform(2.5, 5))

    bubbles_out = lowpass(bubbles_out, 5000)
    out = rush + bubbles_out * 0.5
    out = loopable(out, 2.0)
    return np.tanh(normalize(out, 0.95) / 0.8) * 0.7


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
# Kosmos (sekret - src/space/)
# ------------------------------------------------------------

def space_ambient(s):
    """Kosmos (pętla): cichy, głęboki pomruk z wolnym "falowaniem"
    i delikatnym, wysokim pobłyskiem."""
    length = 12.0
    n = samples(length)
    t = time_axis(n)
    # Dwa bliskie, niskie tony dają powolne dudnienie.
    drone = (np.sin(2 * np.pi * 55 * t) + 0.8 * np.sin(2 * np.pi * 55.5 * t + 1)
             + 0.35 * np.sin(2 * np.pi * 82.4 * t + 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.07 * t)))
    drone *= 0.5 + 0.2 * np.sin(2 * np.pi * (1 / length) * t)
    air = lowpass(s.brown(length), 160, order=4) * 0.7
    shimmer = band(s.noise(length), 1800, 4200) * 0.025 * (0.5 + 0.5 * np.sin(2 * np.pi * (2 / length) * t + 0.5))
    pad = sum(np.sin(2 * np.pi * f * t + s.uniform(0, 6)) * a for f, a in ((220, 0.05), (329.6, 0.035), (440, 0.02)))
    pad *= 0.5 + 0.5 * np.sin(2 * np.pi * (1 / length) * t + 2)
    out = drone * 0.5 + air + shimmer + pad
    return normalize(loopable(out, 1.5), 0.6)


def skyfall_wind(s):
    """Pęd powietrza przy spadaniu z kosmosu (pętla): ryk wiatru
    i drżący, niski grzmot."""
    length = 7.0
    n = samples(length)
    t = time_axis(n)
    gust = (0.7 + 0.2 * np.sin(2 * np.pi * 0.31 * t) + 0.1 * np.sin(2 * np.pi * 1.7 * t + 1)
            + 0.08 * np.sin(2 * np.pi * 4.3 * t + 2))
    roar = band(s.noise(length), 250, 2400, order=2) * gust
    whistle = band(s.noise(length), 1800, 3200, order=4) * 0.25 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * t + 2))
    rumble = lowpass(s.brown(length), 120, order=4) * 1.6 * (0.8 + 0.2 * np.sin(2 * np.pi * 6.0 * t))
    out = roar + whistle + rumble
    return normalize(loopable(out, 0.6), 0.8)


def skyfall_ignite(s):
    """Zapłon przy wejściu w atmosferę: narastający świst i głuchy wybuch ognia."""
    length = 3.0
    n = samples(length)
    t = time_axis(n)
    out = np.zeros(n)
    # Świst: szum, którego filtr szybko idzie w górę.
    whoosh = s.noise(length)
    pieces = 24
    step = n // pieces
    for i in range(pieces):
        lo = 150 * (1.18 ** i)
        seg = band(whoosh[i * step:(i + 1) * step + 512], lo, lo * 4)[:step]
        out[i * step:i * step + len(seg)] += seg * (i / pieces) ** 1.5
    out *= np.exp(-np.maximum(t - 0.6, 0) / 0.5)
    # Wybuch ognia: głuchy huk i trzaski.
    boom = sweep(90, 35, length, 0.6) * 1.2 + lowpass(s.noise(length), 600) * envelope(n, 0.01, 0.5) * 0.8
    place(out, boom[: samples(2.2)], 0.45)
    out += grains(s, length, 60, 900, 5000, length=(0.002, 0.008), density_decay=1.0, loudness=(0.05, 0.3))
    return fade(normalize(out, 0.9), 0.01, 0.5)


SPACE = {
    'space_ambient': space_ambient,
    'skyfall_wind': skyfall_wind,
    'skyfall_ignite': skyfall_ignite
}


# ------------------------------------------------------------
# Osiągnięcia (src/achievements/) - im rzadsze, tym bogatsza
# melodyjka: zwykłe - dwa dźwięki, legendarne - fanfara.
# ------------------------------------------------------------

def note(name):
    """Częstotliwość nuty, np. 'C5', 'G#4'."""
    names = {'C': -9, 'C#': -8, 'D': -7, 'D#': -6, 'E': -5, 'F': -4, 'F#': -3, 'G': -2, 'G#': -1, 'A': 0, 'A#': 1, 'B': 2}
    return 440.0 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) - 4)) / 12)


def bell(freq, seconds, decay):
    """Dzwoneczek: ton z niecałkowitymi alikwotami (jak metal)."""
    n = samples(seconds)
    t = time_axis(n)
    out = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / (decay * 0.4))
           + 0.18 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / (decay * 0.2)))
    return out * envelope(n, 0.002, decay)


def sparkle(s, seconds, count, low, high, start=0.0):
    """Iskierki: krótkie, wysokie dzwoneczki w losowych chwilach."""
    out = np.zeros(samples(seconds))
    for _ in range(count):
        place(out, bell(s.uniform(low, high), 0.25, s.uniform(0.03, 0.08)) * s.uniform(0.05, 0.18), start + s.uniform(0, seconds - start - 0.3))
    return out


def melody(notes, step, seconds, decay=0.35, harmonics=(1.0, 0.3, 0.1)):
    out = np.zeros(samples(seconds))
    for i, name in enumerate(notes):
        place(out, soft_tone(note(name), min(1.5, seconds - i * step), decay, harmonics) * (0.85 + 0.15 * i / max(1, len(notes) - 1)), i * step)
    return out


def achievement_common(s):
    """Zwykłe: dwa miękkie dźwięki w górę."""
    return melody(['G5', 'C6'], 0.09, 0.9, 0.22)


def achievement_rare(s):
    """Rzadkie: trzy dźwięki i dzwoneczek."""
    length = 1.4
    out = melody(['E5', 'G5', 'C6'], 0.08, length, 0.3)
    place(out, bell(note('G6'), 1.0, 0.35) * 0.35, 0.24)
    return out + sparkle(s, length, 5, 2500, 4500, 0.2)


def achievement_epic(s):
    """Bardzo rzadkie: arpeggio, dzwonki i ciepłe tło."""
    length = 2.0
    out = melody(['C5', 'E5', 'G5', 'C6', 'E6'], 0.075, length, 0.4)
    pad = sum(soft_tone(note(n), length, 0.9, (1.0, 0.2), attack=0.08) for n in ['C4', 'G4', 'E5']) * 0.25
    out += pad
    place(out, bell(note('C7'), 1.2, 0.45) * 0.3, 0.38)
    return out + sparkle(s, length, 10, 2500, 5500, 0.3)


def achievement_legendary(s):
    """Legendarne: fanfara - narastający akord, szybkie arpeggio,
    triumfalny akord z dzwonami i deszcz iskierek."""
    length = 3.4
    n = samples(length)
    t = time_axis(n)
    out = np.zeros(n)
    # Wznoszący się "szum" przed fanfarą.
    rise = band(s.noise(0.5), 400, 3000) * np.linspace(0, 1, samples(0.5)) ** 2 * 0.15
    place(out, rise, 0.0)
    # Szybkie arpeggio w górę.
    place(out, melody(['G4', 'C5', 'E5', 'G5', 'C6'], 0.06, 1.0, 0.25), 0.45)
    # Akord (C-dur) z dzwonami - długo wybrzmiewa.
    chord = np.zeros(n)
    for name in ['C4', 'G4', 'C5', 'E5', 'G5', 'C6']:
        place(chord, soft_tone(note(name), length - 0.8, 1.1, (1.0, 0.35, 0.15, 0.05), attack=0.01), 0.78)
    out += chord * 0.35
    for name, at in [('C7', 0.78), ('G6', 0.95), ('E7', 1.1)]:
        place(out, bell(note(name), 1.8, 0.6) * 0.3, at)
    # Lekkie drżenie akordu (vibrato w głośności) i iskierki.
    out *= 1 + 0.04 * np.sin(2 * np.pi * 5.5 * t) * (t > 0.8)
    out += sparkle(s, length, 26, 2500, 6500, 0.8)
    return out


ACHIEVEMENT_SOUNDS = {
    'achievement_common': (achievement_common, -18),
    'achievement_rare': (achievement_rare, -17),
    'achievement_epic': (achievement_epic, -16),
    'achievement_legendary': (achievement_legendary, -15)
}


# ------------------------------------------------------------
# Wytwarzanie (crafting w ekwipunku - src/ui/InventoryScreen.js)
# ------------------------------------------------------------

def item_craft(s):
    """Wzięcie wyrobu: dwa drewniane stuknięcia (składanie) i krótki,
    jasny dzwoneczek "gotowe"."""
    length = 0.42
    out = np.zeros(samples(length))
    for at, freq in [(0.0, 330), (0.07, 410)]:
        n = samples(0.08)
        knock = damped_sine(freq, 0.08, 0.016) * 0.7 + damped_sine(freq * 2.7, 0.08, 0.006) * 0.25
        knock += band(s.noise(0.08), 1200, 4500) * envelope(n, 0.0004, 0.004) * 0.4
        place(out, knock, at)
    for at, name, loud in [(0.15, 'E6', 0.32), (0.2, 'B6', 0.22)]:
        place(out, soft_tone(note(name), 0.22, 0.07, (1.0, 0.2, 0.05)) * loud, at)
    return out


CRAFT_SOUNDS = {
    'item_craft': (item_craft, -20)
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


GROUPS = ['bloki', 'meteoryt', 'owoce', 'menu', 'woda', 'kosmos', 'osiagniecia', 'wytwarzanie', 'snieg', 'strumien']


def generate(root=ROOT, only=None):
    # Ziarna liczą się zawsze po kolei (także dla pomijanych grup), więc
    # dźwięk wychodzi taki sam bez względu na to, co się przelicza.
    want = lambda group: only is None or only == group
    seed = 1
    for material, make in MATERIALS.items():
        for kind, (heavy, variants) in KINDS.items():
            for v in range(1, variants + 1):
                seed += 1
                if want('bloki') or (material == 'snow' and want('snieg')):
                    sound = fade(loudness(make(Synth(seed), heavy), LOUDNESS[kind]), 0.002, 0.04)
                    save(os.path.join(root, 'blocks', f'{kind}_{material}_{v}.ogg'), sound)
    # Dalsze grupy liczą ziarna od tej samej liczby co dawniej (gdy
    # kroków było po 4 i materiałów 8) - więcej wersji kroków ani nowy
    # materiał (drewno) ich nie zmienia.
    seed = 1 + 8 * 10
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
    for name, make in SPACE.items():
        seed += 1
        if want('kosmos'):
            save(os.path.join(root, 'space', f'{name}.ogg'), make(Synth(seed)))
    for name, (make, level) in ACHIEVEMENT_SOUNDS.items():
        seed += 1
        if want('osiagniecia'):
            sound = fade(loudness(make(Synth(seed)), level), 0.001, 0.25)
            save(os.path.join(root, 'ui', f'{name}.ogg'), sound)
    # Nowe grupy - zawsze na końcu (wcześniejsze ziarna się nie zmieniają).
    for name, (make, level) in CRAFT_SOUNDS.items():
        seed += 1
        if want('wytwarzanie'):
            sound = fade(loudness(make(Synth(seed)), level), 0.0005, 0.05)
            save(os.path.join(root, 'ui', f'{name}.ogg'), sound)


    # Strumień (0.48.0) - własne ziarno, inne dźwięki bez zmian.
    if want('strumien'):
        save(os.path.join(root, 'water', 'water_stream.ogg'), water_stream(Synth(48_000)))


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else ROOT
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if only is not None and only not in GROUPS:
        sys.exit(f'Nieznana grupa "{only}" - do wyboru: {", ".join(GROUPS)}')
    generate(root, only)
    print('Gotowe:', os.path.abspath(root), f'(grupa: {only})' if only else '')
