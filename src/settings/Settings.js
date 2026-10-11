import {
    UI_THEME,
    UI_THEMES,
    DEFAULT_MOUSE_SENSITIVITY,
    DEFAULT_FOV,
    DEFAULT_VIEW_DISTANCE,
    DEFAULT_FAR_TERRAIN,
    AMBIENT_OCCLUSION,
    CHUNK_LOAD_BUDGET_MS,
    THIRD_PERSON_DISTANCE
} from '../config.js';

// ------------------------------------------------------------
// USTAWIENIA GRACZA
//
// Zapisywane w przeglądarce (localStorage), więc zostają po
// odświeżeniu strony. Każde ustawienie ma wartość domyślną
// i (dla liczb) dozwolony zakres.
//
// Użycie:
//   settings.get('fov')
//   settings.set('fov', 90)
//   settings.onChange((key, value) => { ... })
// ------------------------------------------------------------

const STORAGE_KEY = 'voxel-game-settings';


export const SETTINGS_DEFAULTS = {

    // Obraz
    potato: false,                                 // tryb ziemniaka (config.js: POTATO_...)
    viewDistance: DEFAULT_VIEW_DISTANCE,           // bloki (prawdziwe chunki)
    farTerrain: DEFAULT_FAR_TERRAIN,               // bloki (0 = bez dalekiego terenu)
    fov: DEFAULT_FOV,                              // stopnie
    brightness: 0,                                 // procent (0 = nastrojowo, 100 = jasno)
    renderScale: 100,                              // procent rozdzielczości ekranu
    fpsLimit: 0,                                   // klatki na sekundę (0 = bez limitu)
    ambientOcclusion: Math.round(AMBIENT_OCCLUSION * 100),   // cienie w kątach, procent
    dynamicLight: true,                            // lampa w ręce, meteoryty...
    loadBudget: CHUNK_LOAD_BUDGET_MS,              // ms na klatkę na wczytywanie chunków

    // Sterowanie
    mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,   // procent
    invertMouse: false,                            // odwrócona oś Y myszy

    // Gracz
    skinOverlay: true,                             // druga (wierzchnia) warstwa skórki
    jointStyle: 'smooth',                          // zgięcia modelu: 'smooth' albo 'blocks'
    cameraDistance: THIRD_PERSON_DISTANCE,         // kamera z trzeciej osoby (F5), bloki

    // Inne
    theme: UI_THEME,                               // motyw menu
    hudScale: 100,                                 // rozmiar paska, czatu i napisów w grze (procent)
    showDebug: true,                               // informacje F3
    showFps: false,                                // licznik klatek w rogu ekranu
    meteorites: true                               // meteoryty spadające na ziemię

};


// Zakresy suwaków: min, max i krok.

export const SETTINGS_RANGES = {

    viewDistance: { min: 24, max: 384, step: 8 },
    farTerrain: { min: 0, max: 4096, step: 256 },
    fov: { min: 50, max: 110, step: 1 },
    brightness: { min: 0, max: 100, step: 5 },
    renderScale: { min: 25, max: 100, step: 5 },
    ambientOcclusion: { min: 0, max: 100, step: 5 },
    loadBudget: { min: 1, max: 16, step: 1 },
    mouseSensitivity: { min: 10, max: 200, step: 5 },
    hudScale: { min: 50, max: 200, step: 10 },
    cameraDistance: { min: 2, max: 8, step: 1 }

};


// Ustawienia z kilkoma wartościami do wyboru (przycisk przełącza
// na następną).

export const SETTINGS_CHOICES = {

    fpsLimit: [0, 30, 60, 120, 144],
    jointStyle: ['smooth', 'blocks']

};

// ------------------------------------------------------------

export class Settings {

    constructor() {

        this.values = { ...SETTINGS_DEFAULTS };

        this.listeners = new Set();


        // Wczytujemy zapisane wartości - każdą osobno sprawdzamy,
        // więc uszkodzony albo stary zapis niczego nie zepsuje.

        const saved = this.load();

        for (const key of Object.keys(SETTINGS_DEFAULTS)) {

            if (
                saved &&
                typeof saved === 'object' &&
                key in saved
            ) {
                this.values[key] = this.validate(key, saved[key]);
            }

        }

    }


    get(key) {

        return this.values[key];

    }


    set(key, value) {

        if (!(key in SETTINGS_DEFAULTS)) {
            return;
        }


        const valid = this.validate(key, value);

        if (this.values[key] === valid) {
            return;
        }


        this.values[key] = valid;

        this.save();


        for (const listener of this.listeners) {
            listener(key, valid);
        }

    }


    // Przywraca wszystkie wartości domyślne.

    reset() {

        for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
            this.set(key, value);
        }

    }


    // listener(key, value) - wywoływany po każdej zmianie.

    onChange(listener) {

        this.listeners.add(listener);

    }

    // --------------------------------------------------------
    // Sprawdzanie wartości
    // --------------------------------------------------------

    // Zwraca poprawną wartość: liczby przycięte do zakresu,
    // nieznany motyw zamieniony na domyślny itd.

    validate(key, value) {

        const fallback = SETTINGS_DEFAULTS[key];


        if (key in SETTINGS_RANGES) {

            const { min, max, step } = SETTINGS_RANGES[key];

            const number = Number(value);

            if (!Number.isFinite(number)) {
                return fallback;
            }

            const stepped = Math.round((number - min) / step) * step + min;

            return Math.min(max, Math.max(min, stepped));

        }


        if (key === 'theme') {

            return value in UI_THEMES ? value : fallback;

        }


        if (key in SETTINGS_CHOICES) {

            return SETTINGS_CHOICES[key].includes(value) ? value : fallback;

        }


        if (typeof fallback === 'boolean') {

            return typeof value === 'boolean' ? value : fallback;

        }


        return value;

    }

    // --------------------------------------------------------
    // localStorage (może być niedostępne - wtedy działamy
    // na wartościach domyślnych, bez zapamiętywania)
    // --------------------------------------------------------

    load() {

        try {

            const text = localStorage.getItem(STORAGE_KEY);

            return text ? JSON.parse(text) : null;

        }

        catch (error) {

            console.warn('Nie udało się wczytać ustawień:', error);

            return null;

        }

    }


    save() {

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(this.values)
            );

        }

        catch (error) {

            console.warn('Nie udało się zapisać ustawień:', error);

        }

    }

}
