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

// Wersja zapisu ustawień. Gdy nowa wersja gry zmienia wartość domyślną
// i chce, żeby dostali ją wszyscy (także ci, którzy mają ją zapisaną),
// zwiększamy wersję i dopisujemy klucze do RESET_AT_REVISION - zapis
// starszy niż ta wersja wraca dla nich do wartości domyślnej (raz).
const SETTINGS_REVISION = 2;

const RESET_AT_REVISION = {
    2: ['bounceLight', 'farTerrain']   // 0.17.0: światło odbite eksperymentalne, dalszy daleki teren
};


export const SETTINGS_DEFAULTS = {

    // Obraz
    potato: false,                                 // tryb ziemniaka (config.js: POTATO_...)
    viewDistance: DEFAULT_VIEW_DISTANCE,           // bloki (prawdziwe chunki)
    farTerrain: DEFAULT_FAR_TERRAIN,               // bloki (0 = bez dalekiego terenu)
    farDetail: 2,                                  // szczegóły dalekiego terenu: 1 - niskie, 2 - średnie, 3 - wysokie
    fov: DEFAULT_FOV,                              // stopnie
    brightness: 0,                                 // procent (0 = nastrojowo, 100 = jasno)
    lightingLook: 'natural',                       // wspólna paleta 0.57 / porównanie z 0.56.1
    atmosphereLook: 'natural',                     // perspektywa powietrzna / mgła z 0.62.0
    lightingMaterials: 'standard',                 // podstawowe / pojedyncze odbicie / dokładniejsze sondy
    surfaceBounce: true,                           // odbicia otoczenia w naturalnej palecie
    leafTransmission: true,                        // światło przez cienkie liście
    materialSpecular: true,                        // drobne refleksy owoców
    bounceStrength: 18,                            // siła pojedynczego odbicia, procent
    bounceSaturation: 65,                          // barwa odbijającej powierzchni, procent
    cloudCover: 0,                                // profil światła zachmurzonego (diagnostyka, bez pogody)
    renderScale: 100,                              // procent rozdzielczości ekranu
    fpsLimit: 0,                                   // klatki na sekundę (0 = bez limitu)
    ambientOcclusion: Math.round(AMBIENT_OCCLUSION * 100),   // cienie w kątach, procent
    shadows: 3,                                    // cienie słońca: 0 - wył., 1 - zwykłe, 2 - dokładne, 3 - dalekie
    lightShafts: true,                             // promienie światła w powietrzu
    fancyLeaves: true,                             // liście z prześwitami (false = szybkie, pełne)
    dynamicLight: true,                            // lampa w ręce, meteoryty...
    loadBudget: CHUNK_LOAD_BUDGET_MS,              // ms na klatkę na wczytywanie chunków

    // Sterowanie
    mouseSensitivity: DEFAULT_MOUSE_SENSITIVITY,   // procent
    invertMouse: false,                            // odwrócona oś Y myszy

    // Gracz
    skinOverlay: true,                             // druga (wierzchnia) warstwa skórki
    showHand: true,                                // ręka i przedmiot w ręce w widoku z oczu
    viewBobbing: true,                             // kołysanie widoku przy chodzeniu
    jointStyle: 'smooth',                          // zgięcia modelu: 'smooth' albo 'blocks'
    cameraDistance: THIRD_PERSON_DISTANCE,         // kamera z trzeciej osoby (F5), bloki

    // Dźwięk (procent; na ucho - suwak 50% to mniej więcej "o połowę ciszej")
    volumeMaster: 80,                              // głośność gry
    volumeMusic: 60,                               // muzyka w menu i podczas gry
    volumeBlocks: 100,                             // kroki, stawianie i niszczenie bloków
    volumeWorld: 100,                              // otoczenie: woda, meteoryty
    volumeUi: 80,                                  // menu i ekwipunek

    // Inne
    theme: UI_THEME,                               // motyw menu
    menuMotion: 'auto',                            // ruch kamery menu: ustawienie systemu / pełny / nieruchome kadry
    inventoryStyle: 'wood',                        // wygląd ekwipunku: wood - drewniany, light - jasny
    hudScale: 100,                                 // rozmiar paska, czatu i napisów w grze (procent)
    showDebug: true,                               // informacje F3
    showFps: false,                                // licznik klatek w rogu ekranu
    meteorites: true,                              // meteoryty spadające na ziemię
    autoUpdates: true,                             // aplikacje: nowa wersja pobiera się sama (Wył. - po kliknięciu Pobierz)

    // Tekstury (paczka tekstur - src/rendering/TexturePacks.js)
    textureResolution: 0,                          // piksele na blok w grze (0 = automatyczna, z paczki)

    // Modele (zakładka "Modele" - src/blocks/plantModels.js)
    plantModels: 'semi',                           // wygląd roślin: 'simple' | 'semi' | 'detailed'
    plantWind: true,                               // kołysanie roślin na wietrze
    plantAnimations: true,                         // animacje roślin: stawianie, wzrost, zbiór, zniszczenie
    leafModel: 'parts',                            // liście drzew: 'parts' - z 8 części (kołyszą się), 'cube' - bloki

    // Eksperymenty (zakładka "Eksperymenty" - funkcje, których nie
    // jesteśmy pewni: mogą się zmienić albo zniknąć; EXPERIMENTS niżej)
    bushyGrass: false,                             // trawa kępiasta (przestrzenne kępki zamiast zwykłej trawy)
    bounceLight: false,                            // światło odbite od ścian
    lightingModel: 'world'                         // 'world' - atmosferyczny (domyślny), 'classic' - dawny

};


// Zakresy suwaków: min, max i krok.

export const SETTINGS_RANGES = {

    viewDistance: { min: 24, max: 800, step: 8 },
    farTerrain: { min: 0, max: 16384, step: 256 },
    fov: { min: 50, max: 110, step: 1 },
    brightness: { min: 0, max: 100, step: 5 },
    cloudCover: { min: 0, max: 100, step: 5 },
    bounceStrength: { min: 0, max: 100, step: 1 },
    bounceSaturation: { min: 0, max: 100, step: 5 },
    renderScale: { min: 25, max: 100, step: 5 },
    ambientOcclusion: { min: 0, max: 100, step: 5 },
    loadBudget: { min: 1, max: 16, step: 1 },
    mouseSensitivity: { min: 10, max: 200, step: 5 },
    hudScale: { min: 50, max: 200, step: 10 },
    volumeMaster: { min: 0, max: 100, step: 5 },
    volumeMusic: { min: 0, max: 100, step: 5 },
    volumeBlocks: { min: 0, max: 100, step: 5 },
    volumeWorld: { min: 0, max: 100, step: 5 },
    volumeUi: { min: 0, max: 100, step: 5 },
    cameraDistance: { min: 2, max: 8, step: 1 }

};


// Ustawienia z kilkoma wartościami do wyboru (przycisk przełącza
// na następną).

export const SETTINGS_CHOICES = {

    fpsLimit: [0, 30, 60, 120, 144],
    shadows: [0, 1, 2, 3],
    lightingModel: ['world', 'classic'],
    plantModels: ['simple', 'semi', 'detailed'],
    leafModel: ['cube', 'parts'],
    lightingLook: ['natural', 'baseline'],
    atmosphereLook: ['natural', 'baseline'],
    lightingMaterials: ['basic', 'standard', 'high'],
    farDetail: [1, 2, 3],
    jointStyle: ['smooth', 'blocks'],
    inventoryStyle: ['wood', 'light'],
    menuMotion: ['auto', 'full', 'off']

};

// Ustawienia z zakładki "Eksperymenty" (kolejność = na ekranie).
export const EXPERIMENTS = ['bushyGrass', 'bounceLight', 'lightingModel'];


// ------------------------------------------------------------
// JAKOŚĆ GRAFIKI
//
// Jeden przycisk "Jakość grafiki" ustawia naraz kilka ustawień obrazu
// (reszta - "Zaawansowane" w zakładce Obraz). Gdy gracz sam zmieni
// któreś z nich, jakość to "Własna". Najwyższa = domyślna na komputerze,
// średnia = domyślna na telefonie (config.js: TOUCH_SETTINGS).
// ------------------------------------------------------------

export const GRAPHICS_PRESETS = {
    low: { potato: true, shadows: 0, ambientOcclusion: 0, lightShafts: false, fancyLeaves: false, lightingMaterials: 'basic' },
    medium: { potato: false, shadows: 0, ambientOcclusion: Math.round(AMBIENT_OCCLUSION * 100), lightShafts: false, fancyLeaves: false, lightingMaterials: 'basic' },
    high: { potato: false, shadows: 1, ambientOcclusion: Math.round(AMBIENT_OCCLUSION * 100), lightShafts: true, fancyLeaves: true, lightingMaterials: 'standard' },
    ultra: { potato: false, shadows: 3, ambientOcclusion: Math.round(AMBIENT_OCCLUSION * 100), lightShafts: true, fancyLeaves: true, lightingMaterials: 'standard' }
};

export const GRAPHICS_PRESET_ORDER = Object.keys(GRAPHICS_PRESETS);


// Nazwa jakości pasującej do obecnych ustawień albo 'custom'.

export function graphicsPreset(settings) {

    for (const [name, values] of Object.entries(GRAPHICS_PRESETS)) {

        if (Object.entries(values).every(([key, value]) => settings.get(key) === value)) {
            return name;
        }

    }

    return 'custom';

}


// Następna jakość po kliknięciu (z "Własnej" - najwyższa).

export function nextGraphicsPreset(settings) {

    const now = GRAPHICS_PRESET_ORDER.indexOf(graphicsPreset(settings));

    const name = GRAPHICS_PRESET_ORDER[(now + 1) % GRAPHICS_PRESET_ORDER.length];

    for (const [key, value] of Object.entries(GRAPHICS_PRESETS[name])) {
        settings.set(key, value);
    }

    return name;

}

// ------------------------------------------------------------

export class Settings {

    // overrides - inne wartości domyślne (np. na telefonie mniejszy
    // zasięg widzenia - main.js, TOUCH_SETTINGS w config.js). Działają
    // tylko dla ustawień, których gracz jeszcze nie zmieniał, i dla
    // "Przywróć domyślne".

    constructor(overrides = {}) {

        this.defaults = { ...SETTINGS_DEFAULTS };

        for (const [key, value] of Object.entries(overrides)) {

            if (key in SETTINGS_DEFAULTS) {
                this.defaults[key] = value;
            }

        }

        this.values = { ...this.defaults };

        this.listeners = new Set();


        // Wczytujemy zapisane wartości - każdą osobno sprawdzamy,
        // więc uszkodzony albo stary zapis niczego nie zepsuje.

        const saved = this.load();

        const reset = new Set();

        if (saved && typeof saved === 'object') {

            const revision = Number(saved.revision) || 1;

            for (const [at, keys] of Object.entries(RESET_AT_REVISION)) {

                if (revision < Number(at)) {
                    keys.forEach((key) => reset.add(key));
                }

            }

        }

        for (const key of Object.keys(SETTINGS_DEFAULTS)) {

            if (
                saved &&
                typeof saved === 'object' &&
                key in saved &&
                !reset.has(key)
            ) {
                this.values[key] = this.validate(key, saved[key]);
            }

        }

        // Stary zapis - od razu zapisujemy nową wersję (reset tylko raz).

        if (reset.size > 0) {
            this.save();
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


    // Nowe wartości domyślne w trakcie działania (np. telefon wykryty
    // dopiero po dotknięciu ekranu - main.js). Ustawienia, których
    // gracz nie zmieniał (mają starą wartość domyślną), dostają nową.

    useDefaults(overrides) {

        for (const [key, value] of Object.entries(overrides)) {

            if (!(key in SETTINGS_DEFAULTS)) {
                continue;
            }

            const unchanged = this.values[key] === this.defaults[key];

            this.defaults[key] = value;

            if (unchanged) {
                this.set(key, value);
            }

        }

    }


    // Przywraca wszystkie wartości domyślne.

    reset() {

        for (const [key, value] of Object.entries(this.defaults)) {
            this.set(key, value);
        }

    }


    // listener(key, value) - wywoływany po każdej zmianie.

    onChange(listener) {

        this.listeners.add(listener);

        return () => this.listeners.delete(listener);

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

            // Dawny wybór "Atmosferyczny" to dziś domyślny model.
            if (key === 'lightingModel' && value === 'atmosphere') {
                return 'world';
            }

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
                JSON.stringify({ ...this.values, revision: SETTINGS_REVISION })
            );

        }

        catch (error) {

            console.warn('Nie udało się zapisać ustawień:', error);

        }

    }

}
