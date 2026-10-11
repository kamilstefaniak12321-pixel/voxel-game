// ------------------------------------------------------------
// NAPISY W MENU
//
// Wszystkie teksty interfejsu są w jednym miejscu, żeby łatwo
// było je zmienić albo kiedyś przetłumaczyć na inny język.
// ------------------------------------------------------------

export const TEXTS = {

    // Ekran tytułowy
    play: 'Graj',
    settings: 'Ustawienia',

    // Lista światów
    selectWorld: 'Wybierz świat',
    newWorld: 'Nowy świat',
    playSelected: 'Graj',
    deleteWorld: 'Usuń',
    back: 'Wróć',
    noWorlds: 'Nie masz jeszcze żadnego świata.',
    storageUnavailable: 'Zapis niedostępny - światy nie zostaną zapisane.',
    seed: 'Seed',
    lastPlayed: 'Ostatnio',

    // Tworzenie świata
    createWorldTitle: 'Nowy świat',
    worldName: 'Nazwa świata',
    worldSeed: 'Seed',
    seedPlaceholder: 'puste = losowy',
    terrain: 'Teren',
    terrainType: (name) => `Teren: ${name}`,
    terrainNotes: {
        realistic: 'Morza, niziny, wyżyny i góry. W budowie - kolejne aktualizacje zmienią ten teren (Twoje budowle zostaną).',
        classic: 'Pierwszy generator gry: wzgórza i góry, bez morza. Nie będzie się już zmieniał.'
    },
    createWorld: 'Utwórz świat',
    cancel: 'Anuluj',
    defaultWorldName: (number) => `Świat ${number}`,

    // Usuwanie świata
    deleteQuestion: (name) => `Usunąć świat „${name}”?`,
    deleteWarning: 'Tego nie da się cofnąć.',
    confirmDelete: 'Usuń',

    // Wczytywanie
    loadingWorld: 'Wczytywanie świata...',
    savingWorld: 'Zapisywanie świata...',

    // Pauza
    paused: 'Pauza',
    resume: 'Wróć do gry',
    saveAndQuit: 'Zapisz i wyjdź do menu',
    pointerLockFailed: 'Nie udało się przechwycić myszy - kliknij jeszcze raz.',

    // Czat (pokazywane po wejściu do świata)
    chatHint: 'T - czat, /pomoc - lista komend do testowania gry',

    // Ustawienia
    settingsTitle: 'Ustawienia',
    settingsTabs: {
        video: 'Obraz',
        controls: 'Sterowanie',
        other: 'Inne'
    },
    potato: (on) => `Tryb ziemniaka: ${on ? 'Wł.' : 'Wył.'}`,
    potatoReloadNote: 'Wygładzanie krawędzi zmieni się po odświeżeniu strony (F5).',
    mouseSensitivity: (value) => `Czułość myszy: ${value}%`,
    invertMouse: (on) => `Odwrócona mysz: ${on ? 'Wł.' : 'Wył.'}`,
    fov: (value) => `Pole widzenia: ${value}°`,
    viewDistance: (value) => `Zasięg widzenia: ${value} bloków`,
    farTerrain: (value) => value > 0 ? `Daleki teren: ${value} bloków` : 'Daleki teren: Wył.',
    brightness: (value) =>
        `Jasność: ${value === 0 ? 'Nastrojowa' : value === 100 ? 'Jasna' : `+${value}%`}`,
    renderScale: (value) => `Rozdzielczość: ${value}%`,
    fpsLimit: (value) => `Limit FPS: ${value > 0 ? value : 'Bez limitu'}`,
    ambientOcclusion: (value) => `Cienie w kątach: ${value > 0 ? `${value}%` : 'Wył.'}`,
    theme: (name) => `Motyw: ${name}`,
    hudScale: (value) => `Interfejs w grze: ${value}%`,
    showDebug: (on) => `Debug (F3): ${on ? 'Wł.' : 'Wył.'}`,
    showFps: (on) => `Licznik FPS: ${on ? 'Wł.' : 'Wył.'}`,
    dynamicLight: (on) => `Dynamiczne światło: ${on ? 'Wł.' : 'Wył.'}`,
    loadBudget: (value) => `Wczytywanie: ${value} ms/klatkę`,
    meteorites: (on) => `Spadające meteoryty: ${on ? 'Wł.' : 'Wył.'}`,
    resetSettings: 'Przywróć domyślne',
    done: 'Gotowe',

    // Błąd zapisu przy wyjściu
    saveFailed: 'Nie udało się zapisać świata',
    saveFailedNote: 'Ostatnie zmiany nie są jeszcze zapisane. Spróbuj jeszcze raz albo wyjdź bez zapisywania - wtedy te zmiany przepadną.',
    retrySave: 'Spróbuj ponownie',
    quitWithoutSaving: 'Wyjdź bez zapisywania',

    // Błędy
    worldLoadError: 'Nie udało się wczytać świata.'

};
