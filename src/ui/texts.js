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
    mouseSensitivity: (value) => `Czułość myszy: ${value}%`,
    fov: (value) => `Pole widzenia: ${value}°`,
    viewDistance: (value) => `Zasięg widzenia: ${value} bloków`,
    theme: (name) => `Motyw: ${name}`,
    showDebug: (on) => `Debug (F3): ${on ? 'Wł.' : 'Wył.'}`,
    dynamicLight: (on) => `Dynamiczne światło: ${on ? 'Wł.' : 'Wył.'}`,
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
