import { TEXTS } from './texts.js';
import { TERRAIN_TYPES, terrainName } from '../world/terrain/generators.js';
import { DEFAULT_TERRAIN, DEFAULT_GAME_MODE } from '../config.js';
import { SETTINGS_RANGES, SETTINGS_CHOICES } from '../settings/Settings.js';
import { hasCustomSkin, chooseSkinFile, resetSkin } from '../player/skin.js';

// ------------------------------------------------------------
// MENU
//
// Ekrany menu to zwykły HTML wstawiany do <div id="menu">.
// Ten plik decyduje tylko CO jest na ekranach i co robią
// przyciski. Wygląd jest w CSS:
//   src/ui/menu.css                        - układ (rozmieszczenie)
//   assets/ui/themes/<motyw>/theme.css     - kolory, czcionka, tło
//
// Co ma się stać po kliknięciu, decyduje main.js przez
// "handlers" (np. handlers.playWorld(świat)).
// ------------------------------------------------------------

// Pomocnik: tworzy element HTML z klasą i tekstem.
// Tekst wstawiamy przez textContent, więc nazwa świata wpisana
// przez gracza nigdy nie zostanie potraktowana jak kod HTML.

function el(tag, className = '', text = '') {

    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text) {
        element.textContent = text;
    }

    return element;

}


function button(text, onClick, extraClass = '') {

    const element = el('button', `menu-button ${extraClass}`.trim(), text);

    element.type = 'button';

    element.addEventListener('click', onClick);

    return element;

}


// Co jest na której zakładce ustawień (kolejność = kolejność na ekranie).

const SETTINGS_TABS = {

    video: [
        'potato',
        'viewDistance',
        'farTerrain',
        'fov',
        'brightness',
        'renderScale',
        'fpsLimit',
        'ambientOcclusion',
        'dynamicLight',
        'loadBudget'
    ],

    controls: [
        'mouseSensitivity',
        'invertMouse'
    ],

    player: [
        'skin',
        'skinOverlay',
        'jointStyle',
        'cameraDistance'
    ],

    other: [
        'theme',
        'hudScale',
        'showDebug',
        'showFps',
        'meteorites'
    ]

};


function formatDate(timestamp) {

    return new Date(timestamp).toLocaleString('pl-PL', {
        dateStyle: 'short',
        timeStyle: 'short'
    });

}

// ------------------------------------------------------------

export class Menu {

    // root     - element <div id="menu">
    // title    - nazwa gry na ekranie tytułowym
    // handlers - funkcje z main.js wywoływane przez przyciski
    // settings - ustawienia gracza (Settings)
    // themes   - motywy do wyboru: { folder: 'nazwa w grze' }

    constructor(root, title, handlers, settings, themes) {

        this.root = root;
        this.title = title;
        this.handlers = handlers;
        this.settings = settings;
        this.themes = themes;


        // Czy przy starcie strony był włączony tryb ziemniaka (od tego
        // zależy wygładzanie krawędzi - zmienia się dopiero po
        // odświeżeniu strony). Ustawia main.js.

        this.startupPotato = settings.get('potato');


        // Co robi ESC na danym ekranie (np. "Wróć").

        this.onEscape = null;

        document.addEventListener('keydown', (event) => {

            if (
                event.code === 'Escape' &&
                this.onEscape &&
                !this.root.hidden
            ) {
                this.onEscape();
            }

        });

    }

    // --------------------------------------------------------
    // Wspólne
    // --------------------------------------------------------

    // Czyści menu i tworzy nowy ekran.
    // textured = tło z tekstury motywu (false = przyciemniona gra).

    newScreen(name, textured = true) {

        this.root.replaceChildren();
        this.root.hidden = false;

        this.onEscape = null;


        const screen = el(
            'div',
            `menu-screen screen-${name}${textured ? ' textured' : ' overlay'}`
        );

        this.root.appendChild(screen);


        document.body.dataset.screen = textured ? 'menu' : 'pause';

        return screen;

    }


    hide() {

        this.root.hidden = true;
        this.root.replaceChildren();

        this.onEscape = null;

        document.body.dataset.screen = 'game';

    }

    // --------------------------------------------------------
    // Ekran tytułowy
    // --------------------------------------------------------

    showTitle() {

        const screen = this.newScreen('title');

        screen.append(
            el('h1', 'menu-title', this.title),
            el('div', 'menu-buttons')
        );

        screen.querySelector('.menu-buttons').append(
            button(TEXTS.play, () => this.handlers.openWorldList()),
            button(TEXTS.settings, () => this.showSettings('title'))
        );

    }

    // --------------------------------------------------------
    // Lista światów
    // --------------------------------------------------------

    // worlds        - lista światów z bazy (od ostatnio granego)
    // storageMissing - true, gdy zapis jest niedostępny

    showWorlds(worlds, storageMissing = false) {

        const screen = this.newScreen('worlds');

        this.onEscape = () => this.showTitle();


        screen.append(el('h2', 'menu-heading', TEXTS.selectWorld));


        if (storageMissing) {
            screen.append(el('p', 'menu-note menu-danger', TEXTS.storageUnavailable));
        }


        const list = el('div', 'world-list');

        screen.append(list);


        let selected = worlds[0] ?? null;


        // Przyciski zależne od zaznaczenia.

        const playButton = button(TEXTS.playSelected, () => {
            if (selected) this.handlers.playWorld(selected);
        });

        const deleteButton = button(TEXTS.deleteWorld, () => {
            if (selected) this.showConfirmDelete(selected);
        });


        const refreshButtons = () => {

            playButton.disabled = !selected;
            deleteButton.disabled = !selected || storageMissing;

        };


        if (worlds.length === 0) {

            list.append(el('p', 'world-list-empty', TEXTS.noWorlds));

        }


        for (const world of worlds) {

            const item = el('div', 'world-item');

            item.tabIndex = 0;

            item.append(
                el('div', 'world-name', world.name),
                el(
                    'div',
                    'world-details',
                    `${TEXTS.seed}: ${world.seed}  ·  ` +
                    `${TEXTS.terrain}: ${terrainName(world.terrain)}  ·  ` +
                    `${TEXTS.gameModes[world.gameMode ?? 'creative']}  ·  ` +
                    `${TEXTS.lastPlayed}: ${formatDate(world.lastPlayed)}`
                )
            );


            if (world === selected) {
                item.classList.add('selected');
            }


            // Klik = zaznacz, podwójny klik albo Enter = graj.

            item.addEventListener('click', () => {

                selected = world;

                list.querySelectorAll('.world-item').forEach(
                    (other) => other.classList.toggle('selected', other === item)
                );

                refreshButtons();

            });

            item.addEventListener('dblclick', () => this.handlers.playWorld(world));

            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') this.handlers.playWorld(world);
            });


            list.append(item);

        }


        const buttons = el('div', 'menu-grid');

        buttons.append(
            playButton,
            button(TEXTS.newWorld, () => this.showCreateWorld(worlds)),
            deleteButton,
            button(TEXTS.back, () => this.showTitle())
        );

        screen.append(buttons);


        refreshButtons();

    }

    // --------------------------------------------------------
    // Tworzenie świata
    // --------------------------------------------------------

    showCreateWorld(worlds) {

        const screen = this.newScreen('create');

        this.onEscape = () => this.handlers.openWorldList();


        // Domyślna nazwa: pierwszy wolny "Świat N".

        const names = new Set(worlds.map((world) => world.name));

        let number = worlds.length + 1;

        while (names.has(TEXTS.defaultWorldName(number))) {
            number++;
        }


        const form = el('form', 'menu-form');

        form.noValidate = true;


        const nameInput = el('input', 'menu-input');

        nameInput.value = TEXTS.defaultWorldName(number);
        nameInput.maxLength = 32;


        const seedInput = el('input', 'menu-input');

        seedInput.placeholder = TEXTS.seedPlaceholder;
        seedInput.maxLength = 64;


        const nameLabel = el('label', 'menu-label', TEXTS.worldName);
        const seedLabel = el('label', 'menu-label', TEXTS.worldSeed);

        nameLabel.append(nameInput);
        seedLabel.append(seedInput);


        // Typ terenu: każde kliknięcie = następny (terrain/generators.js).

        const terrainTypes = Object.keys(TERRAIN_TYPES);

        let terrain = terrainTypes.includes(DEFAULT_TERRAIN) ? DEFAULT_TERRAIN : terrainTypes[0];

        const terrainNote = el('p', 'menu-note');

        const terrainButton = button(TEXTS.terrainType(terrainName(terrain)), () => {

            terrain = terrainTypes[(terrainTypes.indexOf(terrain) + 1) % terrainTypes.length];

            terrainButton.textContent = TEXTS.terrainType(terrainName(terrain));

            terrainNote.textContent = TEXTS.terrainNotes[terrain] ?? '';

        });

        terrainNote.textContent = TEXTS.terrainNotes[terrain] ?? '';


        // Tryb gry: przygoda / kreatywny.

        const modes = Object.keys(TEXTS.gameModes);

        let gameMode = modes.includes(DEFAULT_GAME_MODE) ? DEFAULT_GAME_MODE : modes[0];

        const modeNote = el('p', 'menu-note', TEXTS.gameModeNotes[gameMode]);

        const modeButton = button(TEXTS.gameMode(TEXTS.gameModes[gameMode]), () => {

            gameMode = modes[(modes.indexOf(gameMode) + 1) % modes.length];

            modeButton.textContent = TEXTS.gameMode(TEXTS.gameModes[gameMode]);

            modeNote.textContent = TEXTS.gameModeNotes[gameMode];

        });


        const buttons = el('div', 'menu-row');

        const createButton = button(TEXTS.createWorld, () => {});

        createButton.type = 'submit';

        buttons.append(
            createButton,
            button(TEXTS.cancel, () => this.handlers.openWorldList())
        );


        form.append(nameLabel, seedLabel, terrainButton, terrainNote, modeButton, modeNote, buttons);


        // Enter w polu tekstowym też tworzy świat.

        form.addEventListener('submit', (event) => {

            event.preventDefault();

            const name =
                nameInput.value.trim() ||
                TEXTS.defaultWorldName(number);

            this.handlers.createWorld(name, seedInput.value, terrain, gameMode);

        });


        screen.append(
            el('h2', 'menu-heading', TEXTS.createWorldTitle),
            form
        );


        nameInput.focus();
        nameInput.select();

    }

    // --------------------------------------------------------
    // Potwierdzenie usunięcia
    // --------------------------------------------------------

    showConfirmDelete(world) {

        const screen = this.newScreen('confirm');

        this.onEscape = () => this.handlers.openWorldList();


        const buttons = el('div', 'menu-row');

        buttons.append(
            button(TEXTS.confirmDelete, () => this.handlers.deleteWorld(world), 'danger'),
            button(TEXTS.cancel, () => this.handlers.openWorldList())
        );


        screen.append(
            el('h2', 'menu-heading', TEXTS.deleteQuestion(world.name)),
            el('p', 'menu-note', TEXTS.deleteWarning),
            buttons
        );

    }

    // --------------------------------------------------------
    // Wczytywanie
    // --------------------------------------------------------

    showLoading(text) {

        const screen = this.newScreen('loading');

        screen.append(el('h2', 'menu-heading', text));

    }


    showError(text) {

        const screen = this.newScreen('error');

        screen.append(
            el('h2', 'menu-heading menu-danger', text),
            el('div', 'menu-buttons')
        );

        screen.querySelector('.menu-buttons').append(
            button(TEXTS.back, () => this.showTitle())
        );

    }

    // --------------------------------------------------------
    // Pauza (na tle zatrzymanej gry)
    // --------------------------------------------------------

    showPause(hint = '') {

        const screen = this.newScreen('pause', false);


        const buttons = el('div', 'menu-buttons');

        buttons.append(
            button(TEXTS.resume, () => this.handlers.resume()),
            button(TEXTS.settings, () => this.showSettings('pause')),
            button(TEXTS.saveAndQuit, () => this.handlers.quitToMenu())
        );


        screen.append(
            el('h2', 'menu-heading', TEXTS.paused),
            buttons
        );


        if (hint) {
            screen.append(el('p', 'menu-note', hint));
        }

    }

    // Zapis przy wyjściu się nie udał (na tle zatrzymanej gry).

    showSaveError() {

        const screen = this.newScreen('save-error', false);

        this.onEscape = () => this.showPause();


        const buttons = el('div', 'menu-buttons');

        buttons.append(
            button(TEXTS.retrySave, () => this.handlers.quitToMenu()),
            button(TEXTS.resume, () => this.handlers.resume()),
            button(TEXTS.quitWithoutSaving, () => this.handlers.quitWithoutSaving(), 'danger')
        );


        screen.append(
            el('h2', 'menu-heading menu-danger', TEXTS.saveFailed),
            el('p', 'menu-note', TEXTS.saveFailedNote),
            buttons
        );

    }

    // --------------------------------------------------------
    // Ustawienia
    //
    // returnTo = 'title' albo 'pause' - dokąd wraca "Gotowe".
    // tab      - która zakładka jest otwarta (patrz SETTINGS_TABS).
    // Każda zmiana działa od razu (także w grze pod pauzą).
    // --------------------------------------------------------

    showSettings(returnTo = 'title', tab = 'video') {

        const fromPause = returnTo === 'pause';

        const screen = this.newScreen('settings', !fromPause);

        const settings = this.settings;


        const goBack = () => {

            if (fromPause) {
                this.showPause();
            }
            else {
                this.showTitle();
            }

        };

        this.onEscape = goBack;


        // Zakładki: przycisk wybranej jest wciśnięty (nieaktywny).

        const tabs = el('div', 'settings-tabs');

        for (const name of Object.keys(SETTINGS_TABS)) {

            const tabButton = button(
                TEXTS.settingsTabs[name],
                () => this.showSettings(returnTo, name),
                name === tab ? 'selected' : ''
            );

            tabButton.disabled = name === tab;

            tabs.append(tabButton);

        }


        const grid = el('div', 'settings-grid');

        for (const key of SETTINGS_TABS[tab] ?? SETTINGS_TABS.video) {
            grid.append(this.settingControl(key));
        }


        // Uwaga o wygładzaniu krawędzi (gdy tryb ziemniaka zmieniono
        // od uruchomienia strony).

        const note = el('p', 'menu-note', TEXTS.potatoReloadNote);

        const refreshNote = () => {
            note.hidden = tab !== 'video' || settings.get('potato') === this.startupPotato;
        };

        refreshNote();

        grid.addEventListener('click', refreshNote);


        const buttons = el('div', 'menu-row settings-buttons');

        buttons.append(
            button(TEXTS.resetSettings, () => {

                settings.reset();

                // Odświeżamy ekran, żeby suwaki pokazały nowe wartości.
                this.showSettings(returnTo, tab);

            }),
            button(TEXTS.done, goBack)
        );


        screen.append(
            el('h2', 'menu-heading', TEXTS.settingsTitle),
            tabs,
            grid,
            note,
            buttons
        );

    }


    // Jeden element ustawień - rodzaj zależy od ustawienia:
    //   liczba z zakresem (SETTINGS_RANGES)  -> suwak,
    //   kilka wartości (SETTINGS_CHOICES)    -> przycisk "następna",
    //   motyw                                -> przycisk "następny motyw",
    //   tak/nie                              -> przycisk Wł./Wył.
    // Napis bierze się z TEXTS[klucz] (texts.js).

    settingControl(key) {

        const settings = this.settings;

        const label = TEXTS[key];


        if (key === 'skin') {
            return this.skinControl();
        }


        if (key in SETTINGS_RANGES) {

            // Suwak: pasek w stylu przycisku z napisem na środku.

            const wrapper = el('label', 'menu-slider');

            const range = el('input');

            const text = el('span', 'menu-slider-label', label(settings.get(key)));

            const { min, max, step } = SETTINGS_RANGES[key];


            range.type = 'range';
            range.min = min;
            range.max = max;
            range.step = step;
            range.value = settings.get(key);


            range.addEventListener('input', () => {

                settings.set(key, Number(range.value));

                text.textContent = label(settings.get(key));

            });


            wrapper.append(range, text);

            return wrapper;

        }


        if (key === 'theme') {

            // Każde kliknięcie = następny motyw.

            const themeButton = button(
                label(this.themes[settings.get('theme')]),
                () => {

                    const keys = Object.keys(this.themes);

                    const next =
                        keys[(keys.indexOf(settings.get('theme')) + 1) % keys.length];

                    settings.set('theme', next);

                    themeButton.textContent = label(this.themes[next]);

                }
            );

            return themeButton;

        }


        if (key in SETTINGS_CHOICES) {

            const choices = SETTINGS_CHOICES[key];

            const choiceButton = button(
                label(settings.get(key)),
                () => {

                    const next =
                        choices[(choices.indexOf(settings.get(key)) + 1) % choices.length];

                    settings.set(key, next);

                    choiceButton.textContent = label(next);

                }
            );

            return choiceButton;

        }


        const toggle = button(
            label(settings.get(key)),
            () => {

                settings.set(key, !settings.get(key));

                toggle.textContent = label(settings.get(key));

            }
        );

        return toggle;

    }


    // Skórka gracza: wczytanie pliku PNG i powrót do domyślnej
    // (src/player/skin.js). Pod przyciskami - wynik albo podpowiedź.

    skinControl() {

        const box = el('div', 'settings-skin');

        const note = el('p', 'menu-note', TEXTS.skinNote(hasCustomSkin()));

        const choose = button(TEXTS.skin, () => {

            chooseSkinFile((message) => {

                note.textContent = message;

            });

        });

        const reset = button(TEXTS.skinReset, async () => {

            await resetSkin();

            note.textContent = TEXTS.skinNote(false);

        });

        box.append(choose, reset, note);

        return box;

    }

}
