// ------------------------------------------------------------
// DŹWIĘKI MENU I EKWIPUNKU
//
// Menu, ekwipunek i czat grają dźwięki przez playUi() - nie muszą
// znać menedżera dźwięku (main.js podaje go raz: setUiSounds).
// Dźwięki 'ui' (sounds.js) grają też w menu i w pauzie, mają własny
// suwak głośności ("Menu i interfejs").
//
//   playUi('ui_click')
//   playUi('ui_click', { pitch: 0.85 })   // niżej - np. "Wróć"
//   playSlider(0.4)                       // krok suwaka (0-1 = gdzie)
// ------------------------------------------------------------

let manager = null;

// Kiedy ostatnio zagrał suwak (żeby przeciąganie nie terkotało).
let lastSlider = 0;

const SLIDER_GAP_MS = 45;


export function setUiSounds(sounds) {

    manager = sounds;

}


export function playUi(name, options = {}) {

    return manager?.play(name, options) ?? null;

}


// Krok suwaka: im dalej w prawo, tym wyżej.

export function playSlider(fraction) {

    const now = performance.now();

    if (now - lastSlider < SLIDER_GAP_MS) {
        return null;
    }

    lastSlider = now;

    return playUi('ui_slider', { pitch: 0.8 + 0.5 * Math.max(0, Math.min(1, fraction)) });

}
