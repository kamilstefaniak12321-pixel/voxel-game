import { THUNDER } from '../weather/Thunderstorm.js';
import { weatherHash } from '../weather/WeatherField.js';

import { weatherNoiseBuffer } from './WeatherAudio.js';

// ------------------------------------------------------------
// GRZMOT (1.13.0)
//
// Bez nagrań - z tego samego szumu co deszcz (WeatherAudio.js). Każde
// wyładowanie w zasięgu słuchu dostaje własny grzmot:
//   - SPÓŹNIONY O ODLEGŁOŚĆ: dźwięk leci 343 bloki na sekundę (blok to
//     metr), więc piorun kilometr dalej słychać po trzech sekundach -
//     można liczyć, jak daleko jest burza,
//   - z bliska - ostry trzask i krótki, głośny huk,
//   - z daleka - sam niski, długi pomruk, który się przetacza (wysokie
//     tony giną po drodze),
//   - w schronieniu przytłumiony.
// Głośność idzie przez suwak "Otoczenie" i kanał gry (SoundManager).
// ------------------------------------------------------------

export const THUNDER_AUDIO = Object.freeze({
    // Największa głośność huku i trzasku (przed suwakami).
    peak: 0.95, crack: 0.8,
    // Ile grzmotów naraz (dalsze i cichsze odpadają).
    voices: 8,
    // Punktów w przebiegu głośności jednego grzmotu.
    points: 48
});

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const SALT = 0x243f6a88;


// Kształt grzmotu z odległości (bloki), siły wyładowania (0-1), rodzaju
// (ground - piorun do ziemi) i osłonięcia gracza (0-1). null - za daleko.
// Osobno od Web Audio, żeby dało się to sprawdzić w teście.

export function thunderShape({ distance = 0, power = 1, ground = true, cover = 0 } = {}) {

    const d = Math.max(0, distance);

    if (!(d < THUNDER.audible)) {
        return null;
    }

    const roof = clamp01(cover);
    const near = clamp01(1 - d / 700);
    const far = clamp01(d / 3200);
    const edge = clamp01((THUNDER.audible - d) / (THUNDER.audible * 0.25));

    return {
        // Po ilu sekundach od błysku.
        delay: d / THUNDER.soundSpeed,
        gain: THUNDER_AUDIO.peak * clamp01(power) * (ground ? 1 : 0.7) * edge * (1 - 0.3 * roof) / (1 + (d / 950) ** 1.5),
        // Trzask - tylko blisko.
        crack: THUNDER_AUDIO.crack * clamp01(power) * (ground ? 1 : 0.35) * near * near * (1 - 0.6 * roof),
        // Im dalej, tym niższy (i w schronieniu).
        cutoff: (110 + 3600 * Math.exp(-d / 650)) * (1 - 0.5 * roof),
        // Z daleka narasta powoli i trwa dłużej.
        attack: 0.03 + 0.7 * far,
        duration: 2.4 + 4.6 * far + 0.8 * clamp01(power)
    };

}


// Przebieg głośności: narasta, potem gaśnie, przetaczając się (kilka
// nierównych fal - z ziarna wyładowania, więc każdy grzmot inny).

export function thunderCurve(shape, seed, points = THUNDER_AUDIO.points) {

    const curve = new Float32Array(points);
    const attack = shape.attack / shape.duration;

    for (let i = 0; i < points; i++) {

        const u = i / (points - 1);
        const body = Math.min(1, u / Math.max(attack, 1e-3)) * (1 - u) ** 1.7;

        // Fale: co kilka punktów inna wysokość, wygładzone.
        const k = u * 9;
        const a = weatherHash(seed, Math.floor(k), 1, SALT);
        const b = weatherHash(seed, Math.floor(k) + 1, 1, SALT);
        const f = k - Math.floor(k);
        const roll = a + (b - a) * f * f * (3 - 2 * f);

        curve[i] = shape.gain * body * (0.45 + 0.55 * (u < attack ? 1 : roll));

    }

    curve[0] = 0;
    curve[points - 1] = 0;

    return curve;

}


export class ThunderAudio {

    // game - gra (game.sounds: SoundManager - pojawia się po pierwszym
    // kliknięciu gracza).

    constructor(game) {

        this.game = game;
        this.voices = [];
        this.disposed = false;

        // Ostatni zaplanowany grzmot (test, /pogoda piorun).
        this.last = null;
        this.played = 0;

    }


    // Planuje grzmot wyładowania `strike` (weather/Thunderstorm.js -
    // distance, power, ground, seed). cover - osłonięcie gracza 0-1.
    // Zwraca kształt grzmotu albo null, gdy go nie słychać.

    play(strike, cover = 0) {

        const shape = thunderShape({ distance: strike.distance, power: strike.power, ground: strike.ground, cover });

        this.last = shape;

        if (!shape || shape.gain < 0.004 || this.disposed) {
            return null;
        }

        const sounds = this.game?.sounds;
        const context = sounds?.context;
        const output = sounds?.categories?.world;

        if (!context || !output) {
            return shape;
        }

        // Skończone grzmoty zwalniają miejsce; gdy brak miejsca, cichszy
        // od wszystkich grających odpada.

        const now = context.currentTime;

        this.voices = this.voices.filter((voice) => voice.context === context && voice.end > now);

        if (this.voices.length >= THUNDER_AUDIO.voices && this.voices.every((voice) => voice.gain >= shape.gain)) {
            return shape;
        }

        const when = now + shape.delay;
        const buffer = weatherNoiseBuffer(context);
        const source = context.createBufferSource();

        source.buffer = buffer;
        source.loop = true;
        // Każdy grzmot niższy albo wyższy i z innego miejsca szumu.
        source.playbackRate.value = 0.5 + 0.3 * weatherHash(strike.seed, 2, 2, SALT);

        const low = context.createBiquadFilter();

        low.type = 'lowpass';
        low.frequency.value = shape.cutoff;
        low.Q.value = 0.6;

        const body = context.createGain();

        body.gain.value = 0;
        body.gain.setValueCurveAtTime(thunderCurve(shape, strike.seed), when, shape.duration);

        source.connect(low).connect(body).connect(output);

        const nodes = [source, low, body];

        if (shape.crack > 0.01) {

            // Trzask: krótki, ostry, tuż przed hukiem.

            const high = context.createBiquadFilter();

            high.type = 'highpass';
            high.frequency.value = 900;
            high.Q.value = 0.7;

            const crack = context.createGain();

            crack.gain.value = 0;
            crack.gain.setValueAtTime(0, when);
            crack.gain.linearRampToValueAtTime(shape.crack, when + 0.006);
            crack.gain.exponentialRampToValueAtTime(0.0008, when + 0.28);
            crack.gain.setValueAtTime(0, when + 0.3);

            source.connect(high).connect(crack).connect(output);
            nodes.push(high, crack);

        }

        const offset = 2.9 * weatherHash(strike.seed, 3, 2, SALT);
        const end = when + shape.duration + 0.1;

        source.start(when, offset);
        source.stop(end);

        const voice = { context, nodes, end, gain: shape.gain };

        source.onended = () => this.release(voice);

        this.voices.push(voice);
        this.played++;

        return shape;

    }


    release(voice) {

        for (const node of voice.nodes) {
            try { node.disconnect(); } catch { /* już odłączony */ }
        }

        const index = this.voices.indexOf(voice);

        if (index >= 0) this.voices.splice(index, 1);

    }


    dispose() {

        for (const voice of [...this.voices]) {

            try { voice.nodes[0].stop(); } catch { /* jeszcze nie zaczął albo już skończył */ }

            this.release(voice);

        }

        this.disposed = true;
        this.game = null;

    }

}
