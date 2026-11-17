// ------------------------------------------------------------
// DŹWIĘK POGODY (1.12.0): szum deszczu i wiatru
//
// Bez nagrań - oba dźwięki powstają z jednego bufora szumu i kilku
// filtrów, więc płynnie zmieniają się razem z pogodą:
//   deszcz - syk kropel (im mocniej pada, tym głośniej i niżej; mżawka
//            cicha i wysoka) i niski pomruk ulewy,
//   wiatr  - niski szum, który rośnie z siłą wiatru i faluje z porywami.
// Pod dachem i w jaskini oba cichną i tracą wysokie tony (cover 0-1
// z rendering/RainStreaks.js - RainShelter). Dźwięk idzie przez głośność
// "Otoczenie" i kanał gry (SoundManager), więc w pauzie milknie, a pod
// wodą jest przytłumiony razem z resztą.
// ------------------------------------------------------------

export const WEATHER_AUDIO = Object.freeze({
    // Największa głośność deszczu i wiatru (przed suwakami).
    rain: 0.42, rumble: 0.3, wind: 0.34,
    // Filtr deszczu pod gołym niebem i w schronieniu (Hz).
    open: 9000, sheltered: 850,
    // Od jakiej prędkości wiatr słychać i przy jakiej jest najgłośniejszy.
    windFrom: 1.6, windFull: 9
});

const clamp01 = (x) => Math.max(0, Math.min(1, x));


// Głośności i filtry dla danej pogody - osobno od Web Audio, żeby dało
// się je sprawdzić w teście.
//   rain 0-1, drizzle 0-1, cover 0-1 (osłonięcie), speed (bloki/s),
//   gust 0-1 (chwilowy poryw).

export function weatherAudioLevels({ rain = 0, drizzle = 0, cover = 0, speed = 0, gust = 0 } = {}) {

    const r = clamp01(rain);
    const mist = clamp01(drizzle);
    const roof = clamp01(cover);
    const blow = clamp01((speed - WEATHER_AUDIO.windFrom) / (WEATHER_AUDIO.windFull - WEATHER_AUDIO.windFrom));

    return {
        // Syk kropel: mżawka o połowę cichsza.
        rain: r > 0.01 ? WEATHER_AUDIO.rain * r ** 0.6 * (1 - 0.5 * mist) * (1 - 0.6 * roof) : 0,
        // Pomruk ulewy dochodzi dopiero przy mocnym deszczu; pod dachem
        // zostaje (bębnienie o dach).
        rumble: WEATHER_AUDIO.rumble * clamp01((r - 0.35) / 0.65) * (1 - mist) * (1 - 0.25 * roof),
        // Od jakiej częstotliwości słychać syk: mżawka wyżej.
        rainLow: 500 + 1700 * mist - 250 * r * (1 - mist),
        rainHigh: WEATHER_AUDIO.open + (WEATHER_AUDIO.sheltered - WEATHER_AUDIO.open) * roof,
        wind: WEATHER_AUDIO.wind * blow * blow * (0.65 + 0.7 * clamp01(gust)) * (1 - 0.65 * roof),
        windTone: 260 + 520 * blow + 140 * clamp01(gust)
    };

}


export class WeatherAudio {

    // game - gra (game.sounds: SoundManager, pojawia się po wejściu do
    // świata i po pierwszym kliknięciu gracza - wcześniej przeglądarka
    // nie pozwala grać).

    constructor(game) {

        this.game = game;
        this.nodes = null;
        this.levels = weatherAudioLevels();
        this.disposed = false;

    }


    // Buduje łańcuch dźwięku, gdy tylko jest na czym grać.

    ensure() {

        const sounds = this.game?.sounds;
        const context = sounds?.context;
        const output = sounds?.categories?.world;

        if (!context || !output || this.disposed) {
            return null;
        }

        if (this.nodes?.context === context) {
            return this.nodes;
        }

        this.release();

        // Trzy sekundy szumu w pętli (zawsze ten sam - prosty generator).
        const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 3), context.sampleRate);
        const data = buffer.getChannelData(0);

        let state = 0x1f123bb5;

        for (let i = 0; i < data.length; i++) {
            state = (Math.imul(state, 1664525) + 1013904223) | 0;
            data[i] = (state >>> 0) / 2147483648 - 1;
        }

        const source = (rate) => {

            const node = context.createBufferSource();

            node.buffer = buffer;
            node.loop = true;
            node.playbackRate.value = rate;

            return node;

        };

        const filter = (type, frequency, q = 0.7) => {

            const node = context.createBiquadFilter();

            node.type = type;
            node.frequency.value = frequency;
            node.Q.value = q;

            return node;

        };

        const gain = () => {

            const node = context.createGain();

            node.gain.value = 0;

            return node;

        };

        const nodes = {
            context,
            sources: [source(1), source(0.6), source(0.35)],
            rainLow: filter('highpass', 500), rainHigh: filter('lowpass', WEATHER_AUDIO.open), rain: gain(),
            rumbleBand: filter('bandpass', 240, 0.8), rumble: gain(),
            windBand: filter('lowpass', 300, 1.4), wind: gain()
        };

        nodes.sources[0].connect(nodes.rainLow).connect(nodes.rainHigh).connect(nodes.rain).connect(output);
        nodes.sources[1].connect(nodes.rumbleBand).connect(nodes.rumble).connect(output);
        nodes.sources[2].connect(nodes.windBand).connect(nodes.wind).connect(output);

        for (const node of nodes.sources) {
            node.start();
        }

        this.nodes = nodes;

        return nodes;

    }


    // Co klatkę: nowa pogoda -> płynne przejście głośności i filtrów.

    update(weather) {

        this.levels = weatherAudioLevels(weather);

        const nodes = this.ensure();

        if (!nodes) {
            return;
        }

        const now = nodes.context.currentTime;
        const levels = this.levels;

        nodes.rain.gain.setTargetAtTime(levels.rain, now, 0.4);
        nodes.rumble.gain.setTargetAtTime(levels.rumble, now, 0.6);
        nodes.rainLow.frequency.setTargetAtTime(levels.rainLow, now, 0.5);
        nodes.rainHigh.frequency.setTargetAtTime(levels.rainHigh, now, 0.35);
        nodes.wind.gain.setTargetAtTime(levels.wind, now, 0.5);
        nodes.windBand.frequency.setTargetAtTime(levels.windTone, now, 0.5);

    }


    release() {

        if (!this.nodes) {
            return;
        }

        for (const node of this.nodes.sources) {
            try { node.stop(); } catch { /* już zatrzymany */ }
            node.disconnect();
        }

        for (const name of ['rain', 'rumble', 'wind']) {
            this.nodes[name].disconnect();
        }

        this.nodes = null;

    }


    dispose() {

        this.release();
        this.disposed = true;
        this.game = null;

    }

}
