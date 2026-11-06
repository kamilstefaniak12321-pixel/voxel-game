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
        classic: 'Pierwszy generator gry: wzgórza i góry, bez morza. Nie będzie się już zmieniał.',
        flat: 'Płaski plac do testów: jasna posadzka przy starcie, trawa dookoła i trzy tarasy daleko na wschodzie (daleki teren). Sceny testowe stawiają się tu zawsze w tym samym miejscu.'
    },
    gameMode: (name) => `Tryb gry: ${name}`,
    gameModes: {
        adventure: 'Przygoda',
        creative: 'Kreatywny',
        developer: 'Programista'
    },
    gameModeNotes: {
        adventure: 'Zniszczone bloki trafiają do ekwipunku, a stawianie je zużywa. Zaczynasz z pustymi rękami.',
        creative: 'Wszystkie bloki bez końca (E - ekwipunek), latanie: dwa razy Spacja.',
        developer: 'Do testowania gry: jak kreatywny, a do tego sceny testowe (pauza - Sceny testowe albo /scena), stała pora dnia jednym kliknięciem i plac testowy.'
    },
    createWorld: 'Utwórz świat',
    cancel: 'Anuluj',
    defaultWorldName: (number) => `Świat ${number}`,

    // Tryb programisty - sceny testowe (src/dev/scenes.js)
    scenes: 'Sceny testowe',
    scenesNote: 'Scena stawia się na placu testowym zawsze w tym samym miejscu (w innym terenie - przed tobą) i przenosi cię do niej.',
    sceneTime: 'Pora dnia',
    sceneTimes: { dawn: 'Świt', noon: 'Południe', dusk: 'Zachód', night: 'Noc' },
    sceneFreeze: (on) => on ? 'Czas stoi' : 'Czas płynie',
    sceneBuilt: (name) => `Scena „${name}” gotowa.`,
    developerHint: 'Tryb programisty: Esc - Sceny testowe (albo /scena lista), /scena czas poludnie, /scena czas stop. Lista komend: /pomoc.',

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

    // Aplikacja na telefon (src/app/AndroidUpdates.js): nowe pliki gry
    // (web) albo nowa aplikacja (apk).
    updateDownloadingApk: (version, percent) => `Pobieranie aplikacji ${version}... ${percent ?? 0}%`,
    updateReadyWeb: (version) => `Nowa wersja ${version} gotowa - włączy się przy następnym uruchomieniu gry.`,
    restartUpdate: 'Uruchom ponownie teraz',
    updateReadyApk: (version) => `Pobrana nowa aplikacja ${version} - zainstaluj ją (Android zapyta o zgodę, światy zostają).`,
    installApk: 'Zainstaluj',
    updatePermission: 'Zezwól grze na instalowanie aplikacji (otworzyły się ustawienia), wróć i stuknij Zainstaluj jeszcze raz.',
    updateAvailableApk: (version, size, reason) => `Nowa wersja ${version} wymaga nowej aplikacji (${size > 0 ? (size / 1048576).toFixed(1).replace('.', ',') : '?'} MB) - ${reason === 'manual' ? 'aktualizacje automatyczne są wyłączone' : 'na danych komórkowych nie pobiera się sama'}.`,
    updateAvailableWeb: (version, size) => `Nowa wersja ${version} (${size > 0 ? (size / 1048576).toFixed(1).replace('.', ',') : '?'} MB) - aktualizacje automatyczne są wyłączone.`,
    updateAvailableDesktop: (version) => `Nowa wersja ${version} - aktualizacje automatyczne są wyłączone.`,
    downloadUpdate: 'Pobierz',
    updateErrorPhone: 'Nie udało się pobrać aktualizacji (spróbuje później).',
    updateReadyInGameWeb: (version) => `Pobrano nową wersję gry (${version}) - włączy się przy następnym uruchomieniu (albo od razu: ekran tytułowy - Uruchom ponownie teraz).`,
    updateReadyInGameApk: (version) => `Pobrano nową aplikację (${version}) - zainstaluj ją: ekran tytułowy - Zainstaluj.`,

    // Czat (pokazywane po wejściu do świata)
    chatHint: 'E - ekwipunek, T - czat, /pomoc - lista komend do testowania gry, F5 - widok z trzeciej osoby',

    // To samo na telefonie (sterowanie dotykowe - src/input/TouchControls.js).
    touchHint: 'Lewa strona ekranu - chodzenie (do samego brzegu w przód - bieg), prawa - rozglądanie. ' +
        'Stuknij - postaw blok, przytrzymaj - kop. Skok 2 razy - latanie (tryb kreatywny).',

    // Ustawienia
    settingsTitle: 'Ustawienia',
    performanceLogs: (on) => `Logi wydajności: ${on ? 'Wł.' : 'Wył.'}`,
    settingsTabs: {
        video: 'Obraz',
        sound: 'Dźwięk',
        player: 'Gracz',
        look: 'Wygląd',
        game: 'Gra',
        models: 'Modele',
        experiments: 'Eksperymenty'
    },
    // Modele (src/blocks/plantModels.js)
    modelsIntro: 'Wygląd wszystkich roślin i ich ruch. Zmienia tylko obraz - świat i zapisy zostają takie same. Rośliny leżące jedną warstwą (lilie wodne, rzęsa, porosty, huby, barwinek) wyglądają tak samo w każdej wersji.',
    plantModelsTitle: 'Modele roślin',
    plantModelNames: { simple: 'Proste', semi: 'Półrealistyczne', detailed: 'Szczegółowe' },
    plantModels: (value) => `Modele roślin: ${{ simple: 'Proste', semi: 'Półrealistyczne', detailed: 'Szczegółowe' }[value] ?? 'Półrealistyczne'}`,
    plantWind: (on) => `Kołysanie na wietrze: ${on ? 'Wł.' : 'Wył.'}`,
    leafModel: (value) => `Model liści: ${value === 'cube' ? 'Bloki' : 'Z 8 części'}`,
    plantAnimations: (on) => `Animacje roślin: ${on ? 'Wł.' : 'Wył.'}`,
    modelNotes: {
        plantModels: (value) => ({
            simple: 'Proste: obrazek 16 × 16 na skrzyżowanych płaszczyznach - najszybsze, jak dawne kwiaty.',
            semi: 'Półrealistyczne: liście, płatki i kwiaty z małych płaskich kart ustawionych pod różnymi kątami.',
            detailed: 'Szczegółowe: model z pikseli - każdy listek i płatek osobno (najwięcej do narysowania).'
        }[value] ?? ''),
        leafModel: (value) => value === 'cube'
            ? 'Bloki: liście drzew to zwykłe sześciany - najmniej do narysowania.'
            : 'Z 8 części: każdy blok liści to 8 mniejszych sześcianów z różnymi kawałkami tekstury, każdy lekko kołysze się na wietrze.',
        plantWind: 'Trawa, kwiaty, krzaki i części liści poruszają się na wietrze. Liście na wodzie dalej falują z wodą.',
        plantAnimations: 'Sprężyste reakcje roślin: postawienie, wzrost, zbiór owoców i kwiatów, zniszczenie.'
    },
    graphicsPreset: (name) => `Jakość grafiki: ${{ low: 'Niska', medium: 'Średnia', high: 'Wysoka', ultra: 'Najwyższa' }[name] ?? 'Własna'}`,
    advancedShow: 'Zaawansowane ▾',
    advancedHide: 'Zaawansowane ▴',
    advancedNote: 'Odległy teren, drzewa i rośliny mają stopniowo mniej szczegółów. Cienie słońca „Dalekie” sięgają ok. 800 bloków. Zmiana któregoś z tych ustawień ustawia jakość grafiki na „Własna”.',
    experimentsIntro: 'Funkcje, których nie jesteśmy jeszcze pewni - mogą się zmienić albo zniknąć w następnych wersjach. Działają we wszystkich światach i można je wyłączyć w każdej chwili.',
    experimentNotes: {
        bushyGrass: 'Gęste kępki z pikselową teksturą i delikatnym wiatrem. Zastępują zwykłą trawę; dalsze kępki mają mniej warstw.',
        bounceLight: 'Odbicie dla poprzedniej palety. W palecie Naturalnej użyj Obraz → Zaawansowane → Odbicia otoczenia.',
        lightingModel: 'Dotyczy palety „Poprzednia (0.56.1)” w Obraz → Zaawansowane. Atmosferyczne: kolor i siła słońca zależą od drogi przez powietrze. Klasyczne: dawne, prostsze światło. Paleta Naturalna korzysta z nowego systemu.'
    },
    bushyGrass: (on) => `Trawa kępiasta: ${on ? 'Wł.' : 'Wył.'}`,
    potato: (on) => `Tryb ziemniaka: ${on ? 'Wł.' : 'Wył.'}`,
    potatoReloadNote: 'Wygładzanie krawędzi zmieni się po odświeżeniu strony (F5).',
    mouseSensitivity: (value) => `Czułość myszy: ${value}%`,
    invertMouse: (on) => `Odwrócona mysz: ${on ? 'Wł.' : 'Wył.'}`,
    fov: (value) => `Pole widzenia: ${value}°`,
    viewDistance: (value) => `Zasięg widzenia: ${value} bloków`,
    farTerrain: (value) => value > 0 ? `Daleki teren: ${value} bloków` : 'Daleki teren: Wył.',
    farDetail: (value) => `Detale w oddali: ${['', 'Niskie', 'Średnie', 'Wysokie'][value] ?? 'Średnie'}`,
    brightness: (value) =>
        `Jasność: ${value === 0 ? 'Nastrojowa' : value === 100 ? 'Jasna' : `+${value}%`}`,
    renderScale: (value) => `Rozdzielczość: ${value}%`,
    fpsLimit: (value) => `Limit FPS: ${value > 0 ? value : 'Bez limitu'}`,
    ambientOcclusion: (value) => `Cienie w kątach: ${value > 0 ? `${value}%` : 'Wył.'}`,
    shadows: (value) => `Cienie słońca: ${['Wył.', 'Zwykłe', 'Dokładne', 'Dalekie'][value] ?? 'Wył.'}`,
    lightingModel: (value) => `Światło: ${value === 'classic' ? 'Klasyczne' : 'Atmosferyczne'}`,
    lightingLook: (value) => `Paleta światła: ${value === 'baseline' ? 'Poprzednia (0.56.1)' : 'Naturalna'}`,
    atmosphereLook: (value) => `Atmosfera: ${value === 'baseline' ? 'Poprzednia (0.62.0)' : 'Naturalna'}`,
    lightingMaterials: (value) => `Światło materiałów: ${{ basic: 'Podstawowe', standard: 'Standardowe', high: 'Dokładne' }[value] ?? 'Standardowe'}`,
    surfaceBounce: (on) => `Odbicia otoczenia: ${on ? 'Wł.' : 'Wył.'}`,
    leafTransmission: (on) => `Przeświecanie liści: ${on ? 'Wł.' : 'Wył.'}`,
    materialSpecular: (on) => `Refleksy owoców: ${on ? 'Wł.' : 'Wył.'}`,
    bounceStrength: (value) => `Siła odbicia: ${value}%`,
    bounceSaturation: (value) => `Nasycenie odbicia: ${value}%`,
    cloudCover: (value) => `Zachmurzenie światła: ${value}%`,
    lightShafts: (on) => `Promienie światła: ${on ? 'Wł.' : 'Wył.'}`,
    bounceLight: (on) => `Światło odbite: ${on ? 'Wł.' : 'Wył.'}`,
    fancyLeaves: (on) => `Liście drzew: ${on ? 'Ładne' : 'Szybkie'}`,
    theme: (name) => `Motyw: ${name}`,
    menuMotion: (value) => `Ruch menu: ${{ auto: 'System', full: 'Płynny', off: 'Wył.' }[value] ?? 'System'}`,
    menuMotionNote: 'System dostosowuje ruch kamery menu do ustawień urządzenia. Wył. pokazuje nieruchome kadry.',
    inventoryStyle: (value) => `Ekwipunek: ${value === 'light' ? 'Jasny' : 'Drewniany'}`,
    hudScale: (value) => `Interfejs w grze: ${value}%`,
    showDebug: (on) => `Debug (F3): ${on ? 'Wł.' : 'Wył.'}`,
    showFps: (on) => `Licznik FPS: ${on ? 'Wł.' : 'Wył.'}`,
    dynamicLight: (on) => `Dynamiczne światło: ${on ? 'Wł.' : 'Wył.'}`,
    loadBudget: (value) => `Wczytywanie: ${value} ms/klatkę`,
    meteorites: (on) => `Spadające meteoryty: ${on ? 'Wł.' : 'Wył.'}`,
    autoUpdates: (on) => `Aktualizacje automatyczne: ${on ? 'Wł.' : 'Wył. (po kliknięciu Pobierz)'}`,
    volumeMaster: (value) => `Głośność: ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeMusic: (value) => `Muzyka: ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeBlocks: (value) => `Bloki i kroki: ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeWorld: (value) => `Otoczenie (woda, meteoryt): ${value > 0 ? `${value}%` : 'Wył.'}`,
    volumeUi: (value) => `Menu, ekwipunek, osiągnięcia: ${value > 0 ? `${value}%` : 'Wył.'}`,
    // Tekstury (paczka tekstur - src/app/textures.js)
    texturePackLoad: 'Wczytaj paczkę (.zip)...',
    textureResolution: (value) => `Rozdzielczość: ${value > 0 ? `${value} px` : 'auto'}`,
    textureResolutionPending: (name) => `Rozdzielczość tekstur: ${name} - zmiana za chwilę (kliknij jeszcze raz, żeby wybrać inną).`,
    texturePackRemove: 'Oryginalne tekstury',
    texturePackTemplate: 'Szablon paczki (pobierz)',
    texturePackChecking: 'Sprawdzam paczkę tekstur...',
    texturePackTemplateNote: (url) => `Szablon (oryginalne tekstury, opis w środku) pobiera się w przeglądarce: ${url}`,
    skin: 'Wczytaj skórkę...',
    skinReset: 'Skórka domyślna',
    skinNote: (custom) =>
        `Teraz: ${custom ? 'własna' : 'domyślna'} skórka. Skórka to obrazek PNG 64 x 64 ` +
        '(układ jak w Minecrafcie) - szablon w docs/gracz.md.',
    skinOverlay: (on) => `Druga warstwa skórki: ${on ? 'Wł.' : 'Wył.'}`,
    showHand: (on) => `Ręka w widoku z oczu: ${on ? 'Wł.' : 'Wył.'}`,
    viewBobbing: (on) => `Kołysanie widoku: ${on ? 'Wł.' : 'Wył.'}`,
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
