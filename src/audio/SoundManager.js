import * as THREE from 'three';

import { SOUNDS } from './sounds.js';

// ------------------------------------------------------------
// DŹWIĘK
//
// Jeden menedżer na całą grę (main.js): wczytuje pliki z listy
// (sounds.js), gra je przez Web Audio i pilnuje głośności z ustawień
// (główna, bloki, zjawiska).
//
// Dźwięk z miejscem w świecie (position) brzmi z tamtej strony
// i cichnie z odległością - słuchacz jest w kamerze (updateListener
// co klatkę). Bez position - "w głowie" gracza (np. własne kroki).
//
// Przeglądarka pozwala grać dźwięk dopiero po kliknięciu albo
// klawiszu - unlock() wołamy przy pierwszym takim zdarzeniu.
// W pauzie i w menu dźwięk jest wstrzymany (setActive).
//
//   sounds.play('step_grass', { volume: 0.5 })
//   sounds.play('break_stone', { position: new THREE.Vector3(x, y, z) })
//   const loop = sounds.loop('fire_crackle', { position });
//   loop.setVolume(0.3); loop.stop(1);
// ------------------------------------------------------------

const BASE_URL = new URL('../../assets/sounds/', import.meta.url);

// Najwięcej dźwięków naraz (więcej się nie zagra - np. setki kroków).
const MAX_VOICES = 48;

// Ile ostatnich odtworzeń pamiętamy (/dzwiek, testy).
const HISTORY = 60;


// Głośność z suwaka (0-100) -> mnożnik (na ucho: kwadrat).

function sliderGain(value) {

    return (Math.max(0, value) / 100) ** 2;

}


export class SoundManager {

    constructor(settings) {

        this.settings = settings;

        // nazwa -> [AudioBuffer, ...]
        this.buffers = new Map();

        this.missing = [];
        this.fileCount = 0;

        this.context = null;
        this.master = null;
        this.categories = {};

        this.active = false;
        this.voices = 0;
        this.loops = new Set();

        this.history = [];


        this.ready = this.load();

        settings.onChange((key) => {

            if (key.startsWith('volume')) {
                this.applyVolumes();
            }

        });

    }


    // Wczytuje i dekoduje wszystkie pliki (bez dźwięku - kontekst
    // "offline" nie potrzebuje kliknięcia gracza).

    async load() {

        const decoder = new OfflineAudioContext(1, 1, 44100);

        const tasks = [];


        for (const [name, definition] of Object.entries(SOUNDS)) {

            const list = [];

            this.buffers.set(name, list);

            for (const file of definition.files) {

                this.fileCount++;

                tasks.push(
                    fetch(new URL(file, BASE_URL))
                        .then((response) => {

                            if (!response.ok) {
                                throw new Error(response.status);
                            }

                            return response.arrayBuffer();

                        })
                        .then((data) => decoder.decodeAudioData(data))
                        .then((buffer) => list.push(buffer))
                        .catch(() => this.missing.push(file))
                );

            }

        }


        await Promise.all(tasks);

        if (this.missing.length > 0) {
            console.warn(`Dźwięk: nie udało się wczytać ${this.missing.length} plików:`, this.missing.join(', '));
        }

    }


    get loadedCount() {

        let count = 0;

        for (const list of this.buffers.values()) {
            count += list.length;
        }

        return count;

    }


    // Pierwsze kliknięcie / klawisz: tworzymy (albo wznawiamy) kontekst.

    unlock() {

        if (!this.context) {

            const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;

            if (!AudioContextClass) {
                return;
            }

            this.context = new AudioContextClass({ latencyHint: 'interactive' });


            // Ogranicznik na końcu - kilka głośnych dźwięków naraz
            // (uderzenie meteorytu + odłamki) nie przesteruje.

            const limiter = this.context.createDynamicsCompressor();

            limiter.threshold.value = -8;
            limiter.knee.value = 6;
            limiter.ratio.value = 6;
            limiter.attack.value = 0.003;
            limiter.release.value = 0.25;

            limiter.connect(this.context.destination);


            this.master = this.context.createGain();
            this.master.connect(limiter);

            for (const name of ['blocks', 'world']) {

                this.categories[name] = this.context.createGain();
                this.categories[name].connect(this.master);

            }

            this.applyVolumes();

        }

        if (this.active && this.context.state === 'suspended') {
            this.context.resume().catch(() => {});
        }

    }


    get running() {

        return this.context?.state === 'running';

    }


    // W grze dźwięk gra, w pauzie i w menu jest wstrzymany.

    setActive(active) {

        if (active === this.active) {
            return;
        }

        this.active = active;

        if (!this.context) {
            return;
        }

        if (active) {
            this.context.resume().catch(() => {});
        }
        else {
            this.context.suspend().catch(() => {});
        }

    }


    applyVolumes() {

        if (!this.context) {
            return;
        }

        const s = this.settings;

        this.master.gain.value = sliderGain(s.get('volumeMaster'));
        this.categories.blocks.gain.value = sliderGain(s.get('volumeBlocks'));
        this.categories.world.gain.value = sliderGain(s.get('volumeWorld'));

    }


    // Słuchacz w kamerze (pozycja i kierunek patrzenia).

    updateListener(camera) {

        if (!this.context) {
            return;
        }

        const listener = this.context.listener;

        const p = camera.position;

        const forward = camera.getWorldDirection(this.forward ??= new THREE.Vector3());

        if (listener.positionX) {

            listener.positionX.value = p.x;
            listener.positionY.value = p.y;
            listener.positionZ.value = p.z;

            listener.forwardX.value = forward.x;
            listener.forwardY.value = forward.y;
            listener.forwardZ.value = forward.z;

            listener.upX.value = 0;
            listener.upY.value = 1;
            listener.upZ.value = 0;

        }
        else {

            listener.setPosition(p.x, p.y, p.z);
            listener.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);

        }

    }

    // --------------------------------------------------------
    // Odtwarzanie
    // --------------------------------------------------------

    // Jednorazowy dźwięk. Zwraca { source, gain } albo null, gdy nie
    // da się zagrać (brak pliku, dźwięk jeszcze zablokowany, za dużo
    // dźwięków naraz).
    //
    // position - THREE.Vector3 w świecie (albo null: "w głowie"),
    // volume   - mnożnik głośności,
    // pitch    - mnożnik wysokości (i tempa),
    // delay    - za ile sekund (np. huk dochodzący z daleka).

    play(name, { position = null, volume = 1, pitch = 1, delay = 0 } = {}) {

        const voice = this.createVoice(name, { position, volume, pitch });

        if (!voice) {
            return null;
        }

        voice.source.start(this.context.currentTime + Math.max(0, delay));

        return voice;

    }


    // Dźwięk w pętli. Zwraca sterowanie (albo null):
    //   setPosition(vector), setVolume(v, sekundy), setPitch(p),
    //   stop(sekundy wyciszania).

    loop(name, { position = null, volume = 1, pitch = 1 } = {}) {

        const voice = this.createVoice(name, { position, volume, pitch, loop: true });

        if (!voice) {
            return null;
        }

        const { source, gain, panner } = voice;

        const context = this.context;

        const base = SOUNDS[name].volume ?? 1;

        source.start(context.currentTime, Math.random() * source.buffer.duration);


        const control = {

            setPosition(position) {

                if (panner) {
                    setPannerPosition(panner, position);
                }

            },

            setVolume(value, seconds = 0.1) {

                gain.gain.setTargetAtTime(value * base, context.currentTime, Math.max(0.01, seconds / 3));

            },

            setPitch(value) {

                source.playbackRate.setTargetAtTime(value, context.currentTime, 0.05);

            },

            stop: (seconds = 0.3) => {

                if (control.stopped) {
                    return;
                }

                control.stopped = true;

                this.loops.delete(control);

                gain.gain.setTargetAtTime(0, context.currentTime, Math.max(0.01, seconds / 4));

                source.stop(context.currentTime + seconds + 0.05);

            }

        };

        this.loops.add(control);

        return control;

    }


    // Zatrzymuje wszystkie pętle (np. przy wyjściu ze świata).

    stopLoops() {

        for (const loop of [...this.loops]) {
            loop.stop(0.1);
        }

    }


    createVoice(name, { position, volume, pitch, loop = false }) {

        const definition = SOUNDS[name];

        const list = this.buffers.get(name);

        if (!definition || !list || list.length === 0 || !this.running) {
            return null;
        }

        if (this.voices >= MAX_VOICES) {
            return null;
        }


        const context = this.context;

        const source = context.createBufferSource();

        source.buffer = list[Math.floor(Math.random() * list.length)];

        source.loop = loop;

        const [low, high] = definition.pitch ?? [1, 1];

        source.playbackRate.value = pitch * (low + Math.random() * (high - low));


        const gain = context.createGain();

        gain.gain.value = volume * (definition.volume ?? 1);

        source.connect(gain);


        let output = gain;
        let panner = null;

        if (position) {

            panner = context.createPanner();

            const distance = definition.distance ?? {};

            panner.panningModel = definition.category === 'world' ? 'HRTF' : 'equalpower';
            panner.distanceModel = 'inverse';
            panner.refDistance = distance.ref ?? 4;
            panner.maxDistance = distance.max ?? 64;
            panner.rolloffFactor = distance.rolloff ?? 1;

            setPannerPosition(panner, position);

            gain.connect(panner);

            output = panner;

        }

        output.connect(this.categories[definition.category] ?? this.categories.blocks);


        this.voices++;

        source.onended = () => {

            this.voices--;

            source.disconnect();
            gain.disconnect();
            panner?.disconnect();

        };


        this.history.push({ name, time: context.currentTime, positional: Boolean(position) });

        if (this.history.length > HISTORY) {
            this.history.shift();
        }

        return { source, gain, panner };

    }

}


function setPannerPosition(panner, position) {

    if (panner.positionX) {

        panner.positionX.value = position.x;
        panner.positionY.value = position.y;
        panner.positionZ.value = position.z;

    }
    else {

        panner.setPosition(position.x, position.y, position.z);

    }

}
