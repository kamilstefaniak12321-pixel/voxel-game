import { TEXTS } from './texts.js';
import { loadTextureRegionURL } from '../rendering/TextureSheets.js';
import { diagnosticsPanel } from './DiagnosticsPanel.js';
import { TERRAIN_TYPES, terrainName } from '../world/terrain/generators.js';
import { DEFAULT_TERRAIN, DEFAULT_GAME_MODE } from '../config.js';
import { SETTINGS_RANGES, SETTINGS_CHOICES, graphicsPreset, nextGraphicsPreset } from '../settings/Settings.js';
import { SETTINGS_TABS, ADVANCED_VIDEO } from './settingsLayout.js';
import { SCENES, SCENE_TIMES } from '../dev/scenes.js';
import { hasCustomSkin, chooseSkinFile, resetSkin } from '../player/skin.js';
import {
    resolutionChoices,
    resolutionName,
    chooseTexturePack,
    setTextureResolution,
    resetTexturePack,
    openTemplate,
    describeTextures
} from '../app/textures.js';
import { playUi, playSlider } from '../audio/ui.js';
import { ACHIEVEMENTS, TIERS, TIER_ORDER } from '../achievements/list.js';

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


// Każdy przycisk "klika" (src/audio/ui.js). Przyciski powrotu
// (Wróć, Anuluj, Gotowe...) - niższym dźwiękiem: back = true.

const BACK_PITCH = 0.82;

function button(text, onClick, extraClass = '', back = false) {

    const element = el('button', `menu-button ${extraClass}`.trim(), text);

    element.type = 'button';

    element.addEventListener('click', (event) => {

        playUi('ui_click', { pitch: back ? BACK_PITCH : 1 });

        onClick(event);

    });

    return element;

}


// Ustawienia tylko w aplikacji (komputer, telefon) - w przeglądarce ich nie
// ma na liście.
const APP_ONLY_SETTINGS = new Set(['autoUpdates']);

// Rozdzielczość tekstur zmienia się tyle ms po ostatnim kliknięciu.
const RESOLUTION_APPLY_MS = 2000;

// Ekrany należące do żywego menu. Pauza i jej podstrony korzystają
// z zatrzymanego świata gracza, dlatego nigdy nie zmieniają tej kamery.
const MENU_SCENE_VIEWS = {
    title: 'home',
    worlds: 'river',
    create: 'river',
    confirm: 'river',
    achievements: 'mountains',
    settings: 'forest',
    diagnostics: 'forest',
    error: 'home'
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
    // handlers - funkcje z main.js wywoływane przez przyciski;
    //            onSceneView(view) wybiera ujęcie tła menu (opcjonalne)
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


        // Aplikacja na komputer: { version, update, install } albo null
        // (w przeglądarce). Pokazywane na ekranie tytułowym.

        this.appInfo = null;


        // Księga osiągnięć (AchievementBook) - ustawia main.js.

        this.achievements = null;


        // Co robi ESC na danym ekranie (np. "Wróć").

        this.onEscape = null;

        document.addEventListener('keydown', (event) => {

            if (
                event.code === 'Escape' &&
                this.onEscape &&
                !this.root.hidden
            ) {

                playUi('ui_click', { pitch: BACK_PITCH });

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

        this.screenCleanup?.();
        this.screenCleanup = null;
        this.handlers.diagnostics?.breadcrumb('ui.screen', 'Otwarto ekran menu.', { screen: name, overlay: !textured });

        this.root.replaceChildren();
        this.root.hidden = false;

        this.onEscape = null;


        const screen = el(
            'div',
            `menu-screen screen-${name}${textured ? ' textured' : ' overlay'}`
        );

        this.root.appendChild(screen);


        document.body.dataset.screen = textured ? 'menu' : 'pause';

        const view = textured ? MENU_SCENE_VIEWS[name] : null;

        if (view) {
            screen.classList.add('scene-menu');
            screen.dataset.sceneView = view;

            const panel = el('div', 'menu-scene-panel');
            screen.append(panel);

            this.handlers.onSceneView?.(view);
            return panel;
        }

        return screen;

    }


    hide() {

        this.screenCleanup?.();
        this.screenCleanup = null;

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
            el('p', 'menu-scene-eyebrow', 'Świat czeka'),
            el('h1', 'menu-title', this.title),
            el('div', 'menu-buttons')
        );

        screen.querySelector('.menu-buttons').append(
            button(TEXTS.play, () => this.handlers.openWorldList()),
            button(TEXTS.achievements, () => this.showAchievements('title')),
            button(TEXTS.settings, () => this.showSettings('title'))
        );

        screen.append(this.appInfoElement());

    }

    // --------------------------------------------------------
    // Aplikacja na komputer: wersja i aktualizacje
    // --------------------------------------------------------

    // info - { version, install(), download() } (main.js, tylko
    // w aplikacji; download - telefon: pobranie aplikacji .apk)

    setAppInfo(info) {

        this.appInfo = { update: null, ...info };

        this.refreshAppInfo();

    }


    // status - { state: 'downloading' | 'ready' | 'available' | 'error',
    // version, percent, kind, size, message } - kind (tylko telefon):
    // 'web' (pliki gry) albo 'apk' (aplikacja); bez kind - komputer.

    setUpdateStatus(status) {

        if (!this.appInfo) {
            return;
        }

        this.appInfo.update = status;

        this.refreshAppInfo();

    }


    refreshAppInfo() {

        this.root.querySelector('.menu-app-info')?.replaceWith(this.appInfoElement());

    }


    // Lewy dolny róg ekranu tytułowego (w przeglądarce pusty).

    appInfoElement() {

        const box = el('div', 'menu-app-info');

        const info = this.appInfo;

        if (!info) {
            return box;
        }


        box.append(el('span', 'menu-version', TEXTS.appVersion(info.version)));

        const update = info.update;

        const kind = update?.kind;

        if (update?.state === 'downloading') {

            box.append(el('span', 'menu-update', kind === 'apk'
                ? TEXTS.updateDownloadingApk(update.version, update.percent)
                : TEXTS.updateDownloading(update.version, update.percent)));

        }
        else if (update?.state === 'ready' && kind === 'web') {

            box.append(
                el('span', 'menu-update', TEXTS.updateReadyWeb(update.version)),
                button(TEXTS.restartUpdate, () => info.install())
            );

        }
        else if (update?.state === 'ready' && kind === 'apk') {

            box.append(
                el('span', 'menu-update', TEXTS.updateReadyApk(update.version)),
                button(TEXTS.installApk, () => info.install())
            );

            if (update.message === 'permission') {
                box.append(el('span', 'menu-update', TEXTS.updatePermission));
            }

        }
        else if (update?.state === 'available') {

            const text =
                kind === 'web' ? TEXTS.updateAvailableWeb(update.version, update.size) :
                kind === 'apk' ? TEXTS.updateAvailableApk(update.version, update.size, update.reason) :
                TEXTS.updateAvailableDesktop(update.version);

            box.append(
                el('span', 'menu-update', text),
                button(TEXTS.downloadUpdate, () => info.download())
            );

        }
        else if (update?.state === 'ready') {

            box.append(
                el('span', 'menu-update', TEXTS.updateReady(update.version)),
                button(TEXTS.installUpdate, () => info.install())
            );

        }
        else if (update?.state === 'error') {
            box.append(el('span', 'menu-update menu-danger', kind ? TEXTS.updateErrorPhone : TEXTS.updateError));
        }

        return box;

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

                if (selected !== world) {
                    playUi('ui_click', { pitch: 1.12, volume: 0.7 });
                }

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
            button(TEXTS.back, () => this.showTitle(), '', true)
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


        // Tryb gry: przygoda / kreatywny / programista.

        const modes = Object.keys(TEXTS.gameModes);

        let gameMode = modes.includes(DEFAULT_GAME_MODE) ? DEFAULT_GAME_MODE : modes[0];

        const modeNote = el('p', 'menu-note', TEXTS.gameModeNotes[gameMode]);


        // Typ terenu: każde kliknięcie = następny (terrain/generators.js).
        // Plac testowy (developer: true) - tylko w trybie programisty,
        // który zaczyna od niego.

        const terrainTypes = () => Object.keys(TERRAIN_TYPES).filter((type) =>
            !TERRAIN_TYPES[type].hidden && (gameMode === 'developer' || !TERRAIN_TYPES[type].developer));

        let terrain = terrainTypes().includes(DEFAULT_TERRAIN) ? DEFAULT_TERRAIN : terrainTypes()[0];

        const terrainNote = el('p', 'menu-note');

        const terrainButton = button('', () => {

            const types = terrainTypes();

            terrain = types[(types.indexOf(terrain) + 1) % types.length];

            showTerrain();

        });

        const showTerrain = () => {

            terrainButton.textContent = TEXTS.terrainType(terrainName(terrain));

            terrainNote.textContent = TEXTS.terrainNotes[terrain] ?? '';

        };

        showTerrain();


        const modeButton = button(TEXTS.gameMode(TEXTS.gameModes[gameMode]), () => {

            gameMode = modes[(modes.indexOf(gameMode) + 1) % modes.length];

            modeButton.textContent = TEXTS.gameMode(TEXTS.gameModes[gameMode]);

            modeNote.textContent = TEXTS.gameModeNotes[gameMode];

            if (gameMode === 'developer') {
                terrain = 'flat';
            }
            else if (!terrainTypes().includes(terrain)) {
                terrain = DEFAULT_TERRAIN;
            }

            showTerrain();

        });


        const buttons = el('div', 'menu-row');

        const createButton = button(TEXTS.createWorld, () => {});

        createButton.type = 'submit';

        buttons.append(
            createButton,
            button(TEXTS.cancel, () => this.handlers.openWorldList(), '', true)
        );


        form.append(nameLabel, seedLabel, modeButton, modeNote, terrainButton, terrainNote, buttons);


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
            button(TEXTS.cancel, () => this.handlers.openWorldList(), '', true)
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
            ...(this.handlers.diagnostics ? [button('Diagnostyka i logi', () => this.showDiagnostics('title'))] : []),
            button(TEXTS.back, () => this.showTitle(), '', true)
        );

    }

    // --------------------------------------------------------
    // Pauza (na tle zatrzymanej gry)
    // --------------------------------------------------------

    showPause(hint = '') {

        const screen = this.newScreen('pause', false);


        const buttons = el('div', 'menu-buttons');

        buttons.append(
            button(TEXTS.resume, () => this.handlers.resume(), '', true),
            button(TEXTS.achievements, () => this.showAchievements('pause')),
            button(TEXTS.settings, () => this.showSettings('pause'))
        );

        // Tryb programisty: sceny testowe i pora dnia.

        if (this.handlers.gameMode?.() === 'developer') {
            buttons.append(button(TEXTS.scenes, () => this.showScenes()));
        }

        buttons.append(button(TEXTS.saveAndQuit, () => this.handlers.quitToMenu()));
        if (this.handlers.diagnostics) buttons.append(button('Diagnostyka i logi', () => this.showDiagnostics('pause')));


        screen.append(
            el('h2', 'menu-heading', TEXTS.paused),
            buttons
        );


        if (hint) {
            screen.append(el('p', 'menu-note', hint));
        }

    }

    // --------------------------------------------------------
    // Sceny testowe (tryb programisty - src/dev/scenes.js)
    //
    // Kliknięcie sceny stawia ją (handlers.buildScene) i wraca do gry.
    // Pora dnia i zatrzymanie czasu działają od razu, bez wychodzenia.
    // --------------------------------------------------------

    showScenes() {

        const screen = this.newScreen('scenes', false);

        this.onEscape = () => this.showPause();


        const list = el('div', 'scene-list');

        for (const scene of SCENES) {

            const item = button('', () => this.handlers.buildScene(scene.id), 'scene-item');

            item.append(el('span', 'scene-name', scene.name), el('span', 'scene-note', scene.description));

            list.append(item);

        }


        const times = el('div', 'menu-row scene-times');

        times.append(el('span', 'scene-label', TEXTS.sceneTime));

        for (const name of Object.keys(SCENE_TIMES)) {
            times.append(button(TEXTS.sceneTimes[name], () => this.handlers.setSceneTime(name)));
        }

        const freeze = button(TEXTS.sceneFreeze(this.handlers.timeFrozen()), () => {
            freeze.textContent = TEXTS.sceneFreeze(this.handlers.toggleTimeFreeze());
        });

        times.append(freeze);


        const buttons = el('div', 'menu-buttons');

        buttons.append(button(TEXTS.back, () => this.showPause(), '', true));


        screen.append(
            el('h2', 'menu-heading', TEXTS.scenes),
            el('p', 'menu-note', TEXTS.scenesNote),
            list,
            times,
            buttons
        );

    }

    // Księga osiągnięć (z ekranu tytułowego albo z pauzy - returnTo).
    showAchievements(returnTo = 'title') {

        const book = this.achievements;

        const fromPause = returnTo === 'pause';

        const screen = this.newScreen('achievements', !fromPause);

        const goBack = () => (fromPause ? this.showPause() : this.showTitle());

        this.onEscape = goBack;


        screen.append(el('h2', 'menu-heading', TEXTS.achievementsTitle));


        // Podsumowanie: zdobyte, punkty, ile w każdej randze, pasek.

        const summary = book?.summary() ?? { unlocked: 0, total: ACHIEVEMENTS.length, points: 0, maxPoints: 0, tiers: {} };

        const line = el('div', 'achievements-summary');

        line.append(
            el('span', '', TEXTS.achievementsSummary(summary.unlocked, summary.total)),
            el('span', '', TEXTS.achievementsPoints(summary.points, summary.maxPoints))
        );

        for (const tier of TIER_ORDER) {

            const count = summary.tiers[tier] ?? { unlocked: 0, total: 0 };

            line.append(el('span', `tier-count tier-${tier}`, `${TIERS[tier].name}: ${count.unlocked}/${count.total}`));

        }

        const bar = el('div', 'achievements-progress');

        const fill = el('div');

        fill.style.width = `${summary.maxPoints ? (100 * summary.points / summary.maxPoints) : 0}%`;

        bar.append(fill);

        screen.append(line, bar);


        // Lista: rangami, od zwykłych do legendarnych.

        const list = el('div', 'achievements-list');

        for (const tier of TIER_ORDER) {

            const entries = ACHIEVEMENTS.filter((achievement) => achievement.tier === tier);

            if (entries.length === 0) {
                continue;
            }

            list.append(el('div', `achievements-tier tier-${tier}`, `${TIERS[tier].name} · ${TIERS[tier].points} pkt`));

            for (const achievement of entries) {
                list.append(this.achievementEntry(achievement));
            }

        }

        screen.append(list);


        const buttons = el('div', 'menu-buttons');

        buttons.append(button(TEXTS.done, goBack, '', true));

        // Na telefonie (sterowanie dotykowe) nie ma klawisza L.

        const hint = document.body.classList.contains('touch')
            ? TEXTS.achievementsHintTouch
            : TEXTS.achievementsHint;

        screen.append(buttons, el('p', 'menu-note', hint));

    }


    achievementEntry(achievement) {

        const book = this.achievements;

        const record = book?.data.unlocked[achievement.id] ?? null;

        const hidden = !record && achievement.secret;

        const entry = el(
            'div',
            `achievement-entry tier-${achievement.tier} ${record ? 'unlocked' : 'locked'}${hidden ? ' secret' : ''}`
        );

        const icon = el('div', 'achievement-icon');

        if (!hidden) {
            book?.fillIcon(icon, achievement);
        }

        const text = el('div', 'achievement-text');

        text.append(el('div', 'achievement-title', hidden ? TEXTS.achievementSecret : achievement.title));

        text.append(el('div', 'achievement-task', hidden ? TEXTS.achievementSecretTask : achievement.task));

        if (record) {

            text.append(el('div', 'achievement-comment', achievement.comment));

            text.append(el(
                'div',
                'achievement-meta',
                TEXTS.achievementUnlockedAt(formatDate(record.at), record.world) +
                (record.command ? TEXTS.achievementByCommand : '')
            ));

        }

        else if (achievement.goal && book) {

            const now = Math.min(achievement.goal.count, book.progressOf(achievement.goal.key));

            text.append(el('div', 'achievement-meta', TEXTS.achievementProgress(now, achievement.goal.count)));

        }

        entry.append(icon, text);

        return entry;

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

        const keys = SETTINGS_TABS[tab] ?? SETTINGS_TABS.video;

        // Eksperymenty i Modele: każde ustawienie z opisem pod spodem
        // (opis może zależeć od wybranej wartości).

        const notes = tab === 'experiments' ? TEXTS.experimentNotes : tab === 'models' ? TEXTS.modelNotes : null;

        if (notes) {
            grid.classList.add('settings-experiments');
        }

        for (const key of keys) {

            if (APP_ONLY_SETTINGS.has(key) && !this.appInfo) {
                continue;
            }

            const control = this.settingControl(key);

            // Eksperyment: przycisk i pod nim krótki opis.

            if (notes) {

                const card = el('div', 'settings-experiment');

                const note = el('p', 'menu-note');

                const describe = () => {
                    const text = notes[key];
                    note.textContent = typeof text === 'function' ? text(settings.get(key)) : text ?? '';
                };

                describe();

                card.addEventListener('click', describe);

                card.append(control, note);

                grid.append(card);

            }
            else {
                grid.append(control);
            }

        }


        // Obraz: "Zaawansowane" - pozostałe ustawienia obrazu, zwinięte.
        // Rozwinięcie pamiętamy do końca sesji (this.showAdvanced).

        const parts = [grid];
        if (tab === 'game' && this.handlers.diagnostics) {
            parts.push(button('Diagnostyka i logi', () => this.showDiagnostics(returnTo)));
        }

        if (tab === 'video') {

            const advanced = el('div', 'settings-grid settings-advanced');

            for (const key of ADVANCED_VIDEO) {
                advanced.append(this.settingControl(key));
            }

            const advancedNote = el('p', 'menu-note', TEXTS.advancedNote);

            const toggle = button(TEXTS.advancedShow, () => {
                this.showAdvanced = !this.showAdvanced;
                refreshAdvanced();
            }, 'settings-advanced-toggle');

            const refreshAdvanced = () => {
                advanced.hidden = advancedNote.hidden = !this.showAdvanced;
                toggle.textContent = this.showAdvanced ? TEXTS.advancedHide : TEXTS.advancedShow;
                toggle.setAttribute('aria-expanded', String(Boolean(this.showAdvanced)));
            };

            refreshAdvanced();

            // Zmiana w zaawansowanych odświeża napis jakości (np. "Własna"),
            // a wybór jakości - przyciski zaawansowanych.

            advanced.addEventListener('click', () => this.refreshPreset(grid));
            advanced.addEventListener('input', () => this.refreshPreset(grid));

            parts.push(toggle, advancedNote, advanced);

        }

        if (tab === 'models') {
            parts.unshift(el('p', 'menu-note settings-intro', TEXTS.modelsIntro));
        }

        if (tab === 'experiments') {
            parts.unshift(el('p', 'menu-note settings-intro', TEXTS.experimentsIntro));
        }

        if (tab === 'look') {
            parts.push(el('p', 'menu-note', TEXTS.menuMotionNote));
        }


        // Uwaga o wygładzaniu krawędzi (gdy tryb ziemniaka zmieniono
        // od uruchomienia strony).

        const note = el('p', 'menu-note', TEXTS.potatoReloadNote);

        const refreshNote = () => {
            note.hidden = tab !== 'video' || settings.get('potato') === this.startupPotato;
        };

        refreshNote();

        screen.addEventListener('click', refreshNote);


        const buttons = el('div', 'menu-row settings-buttons');

        buttons.append(
            button(TEXTS.resetSettings, () => {

                settings.reset();

                // Odświeżamy ekran, żeby suwaki pokazały nowe wartości.
                this.showSettings(returnTo, tab);

            }),
            button(TEXTS.done, goBack, '', true)
        );


        screen.append(
            el('h2', 'menu-heading', TEXTS.settingsTitle),
            tabs,
            ...parts,
            note,
            buttons
        );

    }


    showDiagnostics(returnTo = 'title') {
        if (!this.handlers.diagnostics) return;
        const screen = this.newScreen('diagnostics', returnTo !== 'pause');
        const back = () => returnTo === 'pause' ? this.showPause() : this.showSettings('title', 'game');
        this.onEscape = back;
        const panel = diagnosticsPanel(this.handlers.diagnostics, button, this.handlers.markProblem);
        this.screenCleanup = panel.dispose;
        screen.append(el('h2', 'menu-heading', 'Diagnostyka i logi'), panel.element,
            button(TEXTS.back, back, '', true));
    }

    // Jeden element ustawień - rodzaj zależy od ustawienia:
    //   liczba z zakresem (SETTINGS_RANGES)  -> suwak,
    //   kilka wartości (SETTINGS_CHOICES)    -> przycisk "następna",
    //   motyw                                -> przycisk "następny motyw",
    //   tak/nie                              -> przycisk Wł./Wył.
    // Napis bierze się z TEXTS[klucz] (texts.js).

    settingControl(key) {

        const control = this.createSettingControl(key);

        if (key === 'inventoryStyle') {
            const wrapper = el('div', 'settings-inventory-style');
            wrapper.append(control, el('p', 'menu-note inventory-theme-note',
                'Ekwipunek: Szare drewno — z motywu. Poprzedni wygląd pozostaje zapamiętany.'));
            return wrapper;
        }

        if (key === 'inventoryScale') {
            const wrapper = el('div', 'settings-inventory-scale');
            wrapper.append(control, el('p', 'menu-note',
                '100% to podstawowy rozmiar. Okno dopasowuje się do ekranu. Rozmiar paska ustawisz osobno.'));
            return wrapper;
        }

        if (ADVANCED_VIDEO.includes(key)) {
            control.dataset.setting = key;
        }

        return control;

    }


    createSettingControl(key) {

        const settings = this.settings;

        const label = TEXTS[key];


        if (key === 'skin') {
            return this.skinControl();
        }

        if (key === 'plantModels') {
            return this.plantModelPicker();
        }

        if (key === 'graphicsPreset') {

            // Jakość grafiki: każde kliknięcie = następna (Niska ... Najwyższa).
            // Przyciski w "Zaawansowane" pokazują nowe wartości od razu.

            const presetButton = button(TEXTS.graphicsPreset(graphicsPreset(settings)), () => {

                nextGraphicsPreset(settings);

                presetButton.textContent = TEXTS.graphicsPreset(graphicsPreset(settings));

                this.refreshControls(presetButton.closest('.menu-screen'));

            }, 'settings-preset');

            return presetButton;

        }

        if (key === 'texturePack') {
            return this.texturePackControl();
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

                // "Tyk" przy każdym kroku - po ustawieniu, więc suwak
                // głośności od razu brzmi nową głośnością.

                playSlider((Number(range.value) - min) / (max - min));

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


    // Modele roślin: trzy obrazki (ten sam mak w każdej wersji) - kliknięcie
    // wybiera wersję (Settings.plantModels, main.js applyPlantSettings).

    plantModelPicker() {

        const picker = el('div', 'settings-model-picker');

        picker.setAttribute('role', 'radiogroup');

        picker.setAttribute('aria-label', TEXTS.plantModelsTitle);

        const options = SETTINGS_CHOICES.plantModels.map((level) => {

            const option = button('', () => {
                this.settings.set('plantModels', level);
                refresh();
            }, 'settings-model-option');

            const image = el('img');
            loadTextureRegionURL(`assets/models/rosliny/podglad/${level}.png`)
                .then(url => { image.src = url; })
                .catch(error => console.warn('Podgląd modelu rośliny:', error));
            image.alt = '';
            image.draggable = false;

            option.append(image, el('span', 'settings-model-label', TEXTS.plantModelNames[level]));
            option.setAttribute('role', 'radio');
            option.dataset.level = level;

            return option;

        });

        const refresh = () => {
            for (const option of options) {
                const on = option.dataset.level === this.settings.get('plantModels');
                option.classList.toggle('selected', on);
                option.setAttribute('aria-checked', String(on));
            }
        };

        refresh();

        picker.append(...options);

        return picker;

    }


    // Napis przycisku jakości grafiki po zmianie w "Zaawansowane".

    refreshPreset(root) {

        const preset = root.querySelector('.settings-preset');

        if (preset) {
            preset.textContent = TEXTS.graphicsPreset(graphicsPreset(this.settings));
        }

    }


    // Przyciski i suwaki zaawansowanych ustawień obrazu po wyborze
    // jakości (każdy element ma data-setting z kluczem ustawienia).

    refreshControls(root) {

        for (const control of root?.querySelectorAll('[data-setting]') ?? []) {

            const key = control.dataset.setting;

            const value = this.settings.get(key);

            const range = control.querySelector('input[type=range]');

            if (range) {
                range.value = value;
                control.querySelector('.menu-slider-label').textContent = TEXTS[key](value);
            }
            else {
                control.textContent = TEXTS[key](value);
            }

        }

    }


    // Paczka tekstur (src/app/textures.js): wczytanie pliku .zip,
    // rozdzielczość w grze, oryginalne tekstury, szablon paczki. Pod
    // przyciskami - opis paczki, postęp albo wynik. Zmiany działają po
    // ponownym uruchomieniu gry (handlers.reloadGame - z zapisem świata).

    texturePackControl() {

        const settings = this.settings;

        const box = el('div', 'settings-textures');

        const note = el('p', 'menu-note', TEXTS.texturePackChecking);

        const reload = () => this.handlers.reloadGame?.();

        const status = (text, error = false) => {
            note.textContent = text;
            note.classList.toggle('menu-danger', error);
        };

        const refresh = () => describeTextures(settings).then((text) => status(text));


        const choose = button(TEXTS.texturePackLoad, () => chooseTexturePack(settings, status, reload));


        // Rozdzielczość: każde kliknięcie - następna z dostępnych na tym
        // urządzeniu. Zmiana działa dopiero chwilę po ostatnim kliknięciu
        // (przeskalowanie i ponowne uruchomienie gry), żeby dało się
        // przeklikać do wybranej.

        const choices = resolutionChoices();

        let chosen = settings.get('textureResolution');

        let applyTimer = null;

        const resolution = button(
            TEXTS.textureResolution(chosen),
            () => {

                chosen = choices[(choices.indexOf(chosen) + 1) % choices.length];

                resolution.textContent = TEXTS.textureResolution(chosen);

                status(TEXTS.textureResolutionPending(resolutionName(chosen)));

                clearTimeout(applyTimer);

                applyTimer = setTimeout(() => setTextureResolution(settings, chosen, status, reload), RESOLUTION_APPLY_MS);

            }
        );


        const reset = button(TEXTS.texturePackRemove, () => resetTexturePack(status, reload));

        const template = button(TEXTS.texturePackTemplate, () => {

            const url = openTemplate();

            status(TEXTS.texturePackTemplateNote(url));

        });


        box.append(choose, resolution, reset, template, note);

        refresh();

        return box;

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
