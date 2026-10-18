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
    achievements: 'Osiągnięcia',

    // Księga osiągnięć (src/achievements/)
    achievementsTitle: 'Księga osiągnięć',
    achievementsSummary: (unlocked, total) => `Zdobyte: ${unlocked} z ${total}`,
    achievementsPoints: (points, max) => `Punkty: ${points} z ${max}`,
    achievementSecret: 'Sekretne osiągnięcie',
    achievementSecretTask: 'Zdobędziesz je, gdy zrobisz coś... nieoczywistego.',
    achievementUnlockedAt: (date, world) => `Zdobyte ${date}${world ? ` · świat „${world}”` : ''}`,
    achievementByCommand: ' · przyznane komendą',
    achievementProgress: (now, goal) => `Postęp: ${now} z ${goal}`,
    achievementsHint: 'W grze: klawisz L',
    achievementsHintTouch: 'W grze: przycisk z książką u góry ekranu',

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
    gameMode: (name) => `Tryb gry: ${name}`,
    gameModes: {
        adventure: 'Przygoda',
        creative: 'Kreatywny'
    },
    gameModeNotes: {
        adventure: 'Zniszczone bloki trafiają do ekwipunku, a stawianie je zużywa. Zaczynasz z pustymi rękami.',
        creative: 'Wszystkie bloki bez końca (E - ekwipunek), latanie: dwa razy Spacja.'
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

    // Aplikacja na komputer (desktop/): wersja i aktualizacje
    appVersion: (version) => `Wersja ${version}`,
    updateDownloading: (version, percent) => `Pobieranie aktualizacji ${version}... ${percent ?? 0}%`,
    updateReady: (version) => `Nowa wersja ${version} gotowa - zainstaluje się po zamknięciu gry.`,
    installUpdate: 'Zainstaluj teraz',
    updateError: 'Nie udało się pobrać aktualizacji (spróbuje przy następnym uruchomieniu).',
    updateReadyInGame: (version) => `Pobrano nową wersję gry (${version}) - zainstaluje się po zamknięciu gry (albo od razu: ekran tytułowy - Zainstaluj teraz).`,

    // Czat (pokazywane po wejściu do świata)
    chatHint: 'E - ekwipunek, T - czat, /pomoc - lista komend do testowania gry, F5 - widok z trzeciej osoby',

    // To samo na telefonie (sterowanie dotykowe - src/input/TouchControls.js).
    touchHint: 'Lewa strona ekranu - chodzenie (do samego brzegu w przód - bieg), prawa - rozglądanie. ' +
        'Stuknij - postaw blok, przytrzymaj - kop. Skok 2 razy - latanie (tryb kreatywny).',

    // Ustawienia
    settingsTitle: 'Ustawienia',
    settingsTabs: {
        video: 'Obraz',
        controls: 'Sterowanie',
        player: 'Gracz',
        sound: 'Dźwięk',
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
    fancyLeaves: (on) => `Liście drzew: ${on ? 'Ładne' : 'Szybkie'}`,
    theme: (name) => `Motyw: ${name}`,
    hudScale: (value) => `Interfejs w grze: ${value}%`,
    showDebug: (on) => `Debug (F3): ${on ? 'Wł.' : 'Wył.'}`,
    showFps: (on) => `Licznik FPS: ${on ? 'Wł.' : 'Wył.'}`,
    dynamicLight: (on) => `Dynamiczne światło: ${on ? 'Wł.' : 'Wył.'}`,
    loadBudget: (value) => `Wczytywanie: ${value} ms/klatkę`,
    meteorites: (on) => `Spadające meteoryty: ${on ? 'Wł.' : 'Wył.'}`,
    volumeMaster: (value) => `Głośność: ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeBlocks: (value) => `Bloki i kroki: ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeWorld: (value) => `Otoczenie (woda, meteoryt): ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeUi: (value) => `Menu, ekwipunek, osiągnięcia: ${value > 0 ? `${value}%` : 'Wył.'}`,
    skin: 'Wczytaj skórkę...',
    skinReset: 'Skórka domyślna',
    skinNote: (custom) =>
        `Teraz: ${custom ? 'własna' : 'domyślna'} skórka. Skórka to obrazek PNG 64 x 64 ` +
        '(układ jak w Minecrafcie) - szablon w docs/gracz.md.',
    skinOverlay: (on) => `Druga warstwa skórki: ${on ? 'Wł.' : 'Wył.'}`,
    showHand: (on) => `Ręka w widoku z oczu: ${on ? 'Wł.' : 'Wył.'}`,
    viewBobbing: (on) => `Kołysanie przy chodzeniu: ${on ? 'Wł.' : 'Wył.'}`,
    jointStyle: (value) => `Zgięcia rąk i nóg: ${value === 'blocks' ? 'Klocki' : 'Gładkie'}`,
    cameraDistance: (value) => `Kamera z tyłu (F5): ${value} ${value < 5 ? 'bloki' : 'bloków'}`,
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
