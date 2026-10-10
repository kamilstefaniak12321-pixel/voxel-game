// ------------------------------------------------------------
// NAPISY W MENU
//
// Wszystkie teksty interfejsu są w jednym miejscu, żeby łatwo
// było je zmienić albo kiedyś przetłumaczyć na inny język.
// ------------------------------------------------------------

export const TEXTS = {

    // Ekran tytułowy
    play: 'Graj',

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

    // Błędy
    worldLoadError: 'Nie udało się wczytać świata.'

};
