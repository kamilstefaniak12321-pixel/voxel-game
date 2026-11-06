// ------------------------------------------------------------
// POMIAR WYDAJNOŚCI
//
// main.js zgłasza tu każdą klatkę: ile czasu minęło od poprzedniej
// i ile trwało liczenie gry (update) oraz rysowanie (render).
// Pamiętamy ostatnie ~20 sekund - z tego licznik FPS w rogu ekranu,
// komenda /wydajnosc i test /wydajnosc test.
//
// Uwaga: "render" to czas wysłania poleceń do karty graficznej,
// nie czas samego rysowania na karcie - ten widać dopiero po tym,
// że spada liczba klatek.
// ------------------------------------------------------------

const HISTORY = 1200;


export class PerfMonitor {

    constructor() {

        // Bufory "w kółko": czas między klatkami, czas update i render (ms)
        // oraz chwila, w której klatka się skończyła.

        this.frameMs = new Float32Array(HISTORY);
        this.updateMs = new Float32Array(HISTORY);
        this.renderMs = new Float32Array(HISTORY);
        this.at = new Float64Array(HISTORY);

        this.count = 0;
        this.next = 0;

        this.lastFrame = 0;

        this.sectionStart = 0;
        this.currentUpdate = 0;
        this.currentRender = 0;
        this.previousUpdate = 0;
        this.previousRender = 0;

    }


    // Początek klatki. now = performance.now()

    beginFrame(now) {

        this.frameStart = now;

        this.currentUpdate = 0;
        this.currentRender = 0;

    }


    begin() {

        this.sectionStart = performance.now();

    }


    endUpdate() {

        this.currentUpdate += performance.now() - this.sectionStart;

    }


    endRender() {

        this.currentRender += performance.now() - this.sectionStart;

    }


    // Koniec klatki - zapisujemy jej czasy.

    endFrame() {

        const now = this.frameStart;

        if (this.lastFrame > 0) {

            const i = this.next;

            this.frameMs[i] = now - this.lastFrame;
            // RAF odstęp zamyka POPRZEDNIĄ klatkę. Aktualny update/render
            // wpływa dopiero na następny odstęp, więc nie przesuwamy kosztu
            // ciężkiej klatki o jeden wiersz względem jej spadku FPS.
            this.updateMs[i] = this.previousUpdate;
            this.renderMs[i] = this.previousRender;
            this.at[i] = now;

            this.next = (i + 1) % HISTORY;
            this.count = Math.min(this.count + 1, HISTORY);

        }

        this.lastFrame = now;
        this.previousUpdate = this.currentUpdate;
        this.previousRender = this.currentRender;

    }


    // Po przerwie (pauza, menu) pierwsza klatka nie liczy się do
    // pomiaru - inaczej wyglądałaby jak ogromne przycięcie.

    reset() {

        this.count = 0;
        this.lastFrame = 0;

    }


    // Klatki z ostatnich `seconds` sekund (najnowsze na końcu).

    recent(seconds) {

        const frames = [];

        if (this.count === 0) {
            return frames;
        }

        const newest = this.at[(this.next - 1 + HISTORY) % HISTORY];

        for (let k = 1; k <= this.count; k++) {

            const i = (this.next - k + HISTORY) % HISTORY;

            if (newest - this.at[i] > seconds * 1000) {
                break;
            }

            frames.push(i);

        }

        return frames.reverse();

    }


    // Podsumowanie ostatnich `seconds` sekund:
    //   fps        - średnio klatek na sekundę
    //   frameMs    - średni czas klatki
    //   worstMs    - najdłuższa klatka (przycięcie)
    //   low1       - "1% low": FPS najwolniejszego 1% klatek
    //   updateMs, renderMs - średni czas liczenia gry i rysowania

    summary(seconds = 1) {

        const frames = this.recent(seconds);

        if (frames.length === 0) {
            return null;
        }


        let total = 0;
        let worst = 0;
        let update = 0;
        let render = 0;

        const times = [];

        for (const i of frames) {

            total += this.frameMs[i];
            update += this.updateMs[i];
            render += this.renderMs[i];

            worst = Math.max(worst, this.frameMs[i]);

            times.push(this.frameMs[i]);

        }


        times.sort((a, b) => b - a);

        const slowest = times.slice(0, Math.max(1, Math.ceil(times.length / 100)));

        const slowAverage = slowest.reduce((a, b) => a + b, 0) / slowest.length;


        return {
            frames: frames.length,
            fps: 1000 * frames.length / total,
            frameMs: total / frames.length,
            worstMs: worst,
            low1: 1000 / slowAverage,
            updateMs: update / frames.length,
            renderMs: render / frames.length
        };

    }

}
