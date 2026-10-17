import * as THREE from 'three';

import { InputManager } from './input/InputManager.js';
import { TouchControls } from './input/TouchControls.js';
import { Game } from './game/Game.js';
import { AchievementBook } from './achievements/AchievementBook.js';
import { Menu } from './ui/Menu.js';
import { TEXTS } from './ui/texts.js';
import { Settings } from './settings/Settings.js';
import { Hotbar } from './ui/Hotbar.js';
import { createBlockIcons } from './ui/BlockIcons.js';
import { Chat } from './ui/Chat.js';
import { CommandRegistry } from './commands/CommandRegistry.js';
import { GAME_COMMANDS } from './commands/gameCommands.js';
import { PerfMonitor } from './game/PerfMonitor.js';
import { TerrainMap } from './ui/TerrainMap.js';
import { InventoryScreen } from './ui/InventoryScreen.js';
import { SoundManager } from './audio/SoundManager.js';
import { setUiSounds, playUi } from './audio/ui.js';
import {
    WorldStorage,
    createWorldInfo,
    seedFromText
} from './storage/WorldStorage.js';

import {
    GAME_TITLE,
    UI_THEMES,
    POTATO_RENDER_SCALE,
    HOTBAR_SIZE,
    TOUCH_SETTINGS,
    TOUCH_MAX_PIXEL_RATIO
} from './config.js';

// ------------------------------------------------------------
// START APLIKACJI
//
// Tu powstaje to, co jest wspólne dla całej aplikacji: renderer
// (rysowanie), klawiatura i mysz, baza z zapisami i menu.
// Sama gra (świat, gracz...) jest w game/Game.js.
//
// Stany aplikacji:
//   'menu'    - ekrany menu, żaden świat nie jest uruchomiony
//   'loading' - świat się wczytuje albo zapisuje
//   'playing' - gra działa, mysz jest przechwycona (na telefonie:
//               widać przyciski dotykowe)
//   'chat'    - otwarty czat (gra działa dalej, mysz jest wolna)
//   'inventory' - otwarty ekwipunek (E; gra działa dalej, mysz wolna)
//   'paused'  - menu pauzy na tle zatrzymanej gry
// ------------------------------------------------------------

document.title = GAME_TITLE;


// Aplikacja na telefon (Android - folder android/, Capacitor): gra
// działa w niej jak strona, a Capacitor dokłada obiekt
// window.Capacitor. null = przeglądarka albo aplikacja na komputer.

const nativeApp = window.Capacitor?.isNativePlatform?.()
    ? window.Capacitor.getPlatform()
    : null;


// STEROWANIE DOTYKOWE (telefon, tablet - src/input/TouchControls.js).
// Włącza się samo:
//   - w aplikacji na telefon - zawsze,
//   - w przeglądarce, gdy głównym "wskaźnikiem" jest palec (telefon,
//     tablet), także gdy telefon zgłasza rysik albo myszkę,
//   - przy pierwszym dotknięciu ekranu palcem, jeśli przeglądarka źle
//     zgłosiła ekran (enableTouchMode niżej).
// Adresem gry można je wymusić: ...index.html?dotyk (np. do testów na
// komputerze - wtedy "dotyka" się myszą), a wyłączyć: ?dotyk=0.

const touchParameter = new URLSearchParams(location.search).get('dotyk');

const touchDetected = Boolean(
    nativeApp ||
    window.matchMedia?.('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia?.('(hover: none)').matches)
);

let touchMode = touchParameter !== null
    ? !['0', 'nie', 'wyl', 'false'].includes(touchParameter)
    : touchDetected;


// Ustawienia gracza (czułość myszy, pole widzenia, motyw...). Na
// telefonie inne wartości na start (TOUCH_SETTINGS w config.js).

const settings = new Settings(touchMode ? TOUCH_SETTINGS : {});


// Tryb ziemniaka można włączyć też adresem gry: ...index.html?ziemniak
// (a wyłączyć: ?ziemniak=0). Zostaje zapamiętany jak zwykłe ustawienie.

const potatoParameter = new URLSearchParams(location.search).get('ziemniak');

if (potatoParameter !== null) {
    settings.set('potato', !['0', 'nie', 'wyl', 'false'].includes(potatoParameter));
}


// Wygładzanie krawędzi (antialiasing) da się wybrać tylko przy
// tworzeniu renderera - w trybie ziemniaka jest wyłączone.

const renderer = new THREE.WebGLRenderer({
    antialias: !settings.get('potato')
});

renderer.setSize(window.innerWidth, window.innerHeight);

document.body.appendChild(renderer.domElement);

// Gra rysuje kilka razy na klatkę (niebo, daleki teren, świat) -
// statystyki rysowania (/wydajnosc) zerujemy sami raz na klatkę.

renderer.info.autoReset = false;


const input = new InputManager(renderer.domElement);

// Na telefonie nie ma czego przechwytywać - "mysz" to palec.
input.pointerLock = !touchMode;

const infoElement = document.getElementById('info');

const fpsElement = document.getElementById('fps');

// Celownik (z kamery z przodu nie ma sensu - wtedy znika).
const crosshairElement = document.getElementById('crosshair');


// Pomiar czasu klatek (licznik FPS, /wydajnosc).

const perf = new PerfMonitor();


// Mapa terenu z góry (/mapa, klawisz M).

const terrainMap = new TerrainMap();


// Dźwięk (kroki, bloki, meteoryty, menu). Przeglądarka pozwala go
// włączyć dopiero po kliknięciu albo klawiszu - stąd unlock przy
// pierwszym takim zdarzeniu (i przy każdym następnym, gdyby się
// wstrzymał). Menu i ekwipunek grają przez src/audio/ui.js.

const sounds = new SoundManager(settings);

setUiSounds(sounds);

for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, () => sounds.unlock(), { capture: true });
}


// Księga osiągnięć - jedna na gracza, wspólna dla wszystkich światów
// (src/achievements/). Powiadomienia trafiają do <div id="achievements">.

const achievements = new AchievementBook(document.getElementById('achievements'));


let state = 'menu';

let game = null;

// ------------------------------------------------------------
// MOTYW MENU
// ------------------------------------------------------------

// Wczytuje theme.css wybranego motywu. Jeśli takiego motywu nie
// ma, wraca do domyślnego.

function loadTheme(name) {

    const link = document.getElementById('theme-css');

    return new Promise((resolve) => {

        link.onload = () => resolve(name);

        link.onerror = () => {

            if (name === 'default') {
                resolve(null);
                return;
            }

            console.warn(`Nie ma motywu "${name}" - używam domyślnego.`);

            loadTheme('default').then(resolve);

        };

        link.href = `./assets/ui/themes/${name}/theme.css`;

    });

}

// ------------------------------------------------------------
// BAZA Z ZAPISAMI
// ------------------------------------------------------------

// null = zapis niedostępny, gra działa bez niego.

let storage = null;

try {

    storage = await WorldStorage.open();

}

catch (error) {

    console.warn(
        'Zapis świata niedostępny - gra działa bez zapisu.',
        error
    );

}

// ------------------------------------------------------------
// CO ROBIĄ PRZYCISKI MENU
// ------------------------------------------------------------

const menu = new Menu(
    document.getElementById('menu'),
    GAME_TITLE,
    {
        openWorldList,
        playWorld,
        createWorld,
        deleteWorld,
        resume,
        quitToMenu,
        quitWithoutSaving
    },
    settings,
    UI_THEMES
);

menu.achievements = achievements;


// Ustawienia, które dotyczą całej aplikacji (nie tylko świata):
// rozdzielczość rysowania, rozmiar interfejsu, licznik FPS.

function applyAppSettings() {

    // Rozdzielczość: część pikseli ekranu (mniej = szybciej, ale
    // mniej ostro - piksele zostają ostre, nie rozmyte). Tryb ziemniaka
    // obniża ją do POTATO_RENDER_SCALE.

    const scale = (
        settings.get('potato')
            ? Math.min(settings.get('renderScale'), POTATO_RENDER_SCALE)
            : settings.get('renderScale')
    ) / 100;

    const maxPixelRatio = touchMode ? TOUCH_MAX_PIXEL_RATIO : 2;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio) * scale);

    renderer.setSize(window.innerWidth, window.innerHeight);

    renderer.domElement.style.imageRendering = scale < 1 ? 'pixelated' : '';


    document.documentElement.style.setProperty(
        '--hud-scale',
        settings.get('hudScale') / 100
    );


    fpsElement.hidden = !settings.get('showFps');

}

applyAppSettings();


// Zmiana w ustawieniach działa od razu: nowy motyw menu,
// a w uruchomionej grze nowe pole widzenia, zasięg, jasność...

settings.onChange((key) => {

    if (key === 'theme') {
        loadTheme(settings.get('theme'));
    }

    if (['renderScale', 'hudScale', 'showFps', 'potato'].includes(key)) {
        applyAppSettings();
    }

    game?.applySettings(key);

});


async function openWorldList() {

    const worlds = storage ? await storage.listWorlds() : [];

    menu.showWorlds(worlds, !storage);

}


async function createWorld(name, seedText, terrain, gameMode) {

    const worldInfo = createWorldInfo(name, seedFromText(seedText), terrain, gameMode);

    if (storage) {
        await storage.saveWorld(worldInfo);
    }

    await playWorld(worldInfo);

}


async function deleteWorld(worldInfo) {

    if (storage) {
        await storage.deleteWorld(worldInfo.id);
    }

    await openWorldList();

}


async function playWorld(worldInfo) {

    if (state !== 'menu') {
        return;
    }


    state = 'loading';

    menu.showLoading(TEXTS.loadingWorld);


    try {

        game = await Game.start(renderer, input, storage, worldInfo, settings);

        game.sounds = sounds;

        // Telefon / tablet (sterowanie dotykowe) - np. dla osiągnięć.

        game.touchMode = touchMode;

        // Aplikacja na telefon ('android') albo null (osiągnięcia).

        game.nativeApp = nativeApp;

        // Osiągnięcia: gra zgłasza zdarzenia, księga zapisuje, w którym świecie.

        game.achievements = achievements;

        achievements.attach(game, worldInfo);

        // /osiagniecia ksiega - otwiera księgę (jak klawisz L).

        game.onOpenAchievements = () => {

            if (state === 'chat') {
                closeChat(false);
            }

            if (state === 'paused') {
                menu.showAchievements('pause');
            }

        };

        // Komunikaty gry (np. gdzie spadł meteoryt) trafiają na czat.

        game.onMessage = (text) => chat.print(text, 'hint');

        // Krótkie komunikaty (np. "Ekwipunek pełny") - nad paskiem bloków.

        game.onNotice = (text) => hotbar.showName(text);

        // Pomiar wydajności (komenda /wydajnosc).

        game.perf = perf;

        perf.reset();

    }

    catch (error) {

        console.error(error);

        game = null;
        state = 'menu';

        menu.showError(TEXTS.worldLoadError);

        return;

    }


    // Świat gotowy - przechwytujemy mysz i gramy.

    state = 'paused';

    resume();

    chat.print(touchMode ? TEXTS.touchHint : TEXTS.chatHint, 'hint');

}

// ------------------------------------------------------------
// PAUZA
//
// Gra działa tylko wtedy, gdy mysz jest przechwycona. ESC
// (albo przełączenie okna) zwalnia mysz - wtedy pojawia się
// menu pauzy, a świat się zapisuje.
// ------------------------------------------------------------

function resume() {

    if (!game) {
        return;
    }


    input.reset();


    // Telefon: bez przechwytywania myszy - od razu gramy.

    if (touchMode) {

        state = 'playing';

        menu.hide();

        guardBackButton();

        return;

    }


    // Starsze przeglądarki nie zwracają Promise - stąd "?.".

    try {

        renderer.domElement
            .requestPointerLock()
            ?.catch?.(pointerLockFailed);

    }

    catch (error) {

        pointerLockFailed();

    }


    // Zabezpieczenie: jeśli po sekundzie mysz nadal nie jest
    // przechwycona, pokazujemy menu pauzy z przyciskiem "Wróć do gry".

    setTimeout(() => {

        if (game && state === 'paused' && !document.pointerLockElement) {
            menu.showPause();
        }

    }, 1000);

}


// Przeglądarka nie pozwoliła przechwycić myszy
// (np. ESC było wciśnięte przed chwilą) - zostajemy w pauzie.

function pointerLockFailed() {

    if (game && state === 'paused') {
        menu.showPause(TEXTS.pointerLockFailed);
    }

}

document.addEventListener('pointerlockerror', pointerLockFailed);


// Pauza bez myszy (telefon: przycisk pauzy, przełączenie aplikacji,
// przycisk "wstecz"). Z myszą pauzę robi pointerlockchange niżej.

function pauseGame() {

    if (!game || state !== 'playing') {
        return;
    }

    state = 'paused';

    input.reset();

    menu.showPause();

    game.saver.save();

}


// Telefon: wyjście do innej aplikacji / zgaszenie ekranu = pauza
// i zapis (strona może zostać zamknięta przez system bez pytania).
// Aplikacja na Androida zgłasza to sama zdarzeniem "apppause"
// (android/.../MainActivity.java).

function pauseOnLeave() {

    if (!game) {
        return;
    }

    if (state === 'playing') {
        pauseGame();
    }
    else {
        game.saver.save();
    }

}

document.addEventListener('visibilitychange', () => {

    if (touchMode && document.hidden) {
        pauseOnLeave();
    }

});

window.addEventListener('apppause', pauseOnLeave);


// Przycisk "wstecz" w telefonie (Android) wyszedłby ze strony, a więc
// i z gry. W trakcie gry dokładamy więc wpis w historii przeglądarki -
// "wstecz" zabiera tylko ten wpis, a gra robi pauzę (albo zamyka czat
// / ekwipunek) i dokłada wpis z powrotem. Na ekranie tytułowym
// "wstecz" działa normalnie.

function guardBackButton() {

    if (touchMode && history.state?.voxelGame !== true) {
        history.pushState({ voxelGame: true }, '');
    }

}

window.addEventListener('popstate', () => {

    if (!touchMode || !game) {
        return;
    }

    if (state === 'chat') {
        closeChat(false);
    }
    else if (state === 'inventory') {
        closeInventory(false);
    }
    else if (state === 'playing') {
        pauseGame();
    }

    guardBackButton();

});


document.addEventListener('pointerlockchange', () => {

    if (!game) {
        return;
    }


    const locked =
        document.pointerLockElement === renderer.domElement;


    // Wejście do gry z pauzy (albo po wczytaniu świata). Gdy gra
    // już trwa, nic nie robimy - inaczej kasowalibyśmy klawisze,
    // które gracz właśnie trzyma.

    if (locked) {

        if (state !== 'playing') {

            // Kliknięcie w grę przy otwartym czacie też do niej wraca.

            if (state === 'chat') {
                chat.close();
            }

            if (state === 'inventory') {
                inventoryScreen.close();
                input.enabled = true;
            }

            state = 'playing';

            input.reset();

            menu.hide();

        }

    }

    // Przy otwartym czacie mysz jest wolna celowo - bez pauzy.

    else if (state === 'playing') {

        state = 'paused';

        menu.showPause();

        game.saver.save();

    }

});


// "Zapisz i wyjdź do menu". Świat zamykamy dopiero wtedy, gdy
// zapis naprawdę się udał - inaczej zostajemy w pauzie z ekranem
// błędu (spróbuj ponownie / wyjdź bez zapisywania).

// ------------------------------------------------------------
// CZAT I KOMENDY
//
// T albo / otwiera czat. Tekst zaczynający się od / to komenda
// (src/commands/). Na czas pisania mysz jest zwolniona, a po
// wysłaniu (Enter) gra wraca do przechwyconej myszy.
// ------------------------------------------------------------

const commands = new CommandRegistry();

for (const command of GAME_COMMANDS) {
    commands.register(command);
}


const chat = new Chat(document.getElementById('chat'), {

    submit: submitChat,

    // ESC: przeglądarka nie pozwala po nim od razu przechwycić
    // myszy, więc zamiast tego pokazujemy menu pauzy.
    cancel: () => closeChat(false),

    complete: (text) => (game ? commands.complete(text, commandContext()) : []),

    // Opis komendy z wpisanego tekstu (do podpowiedzi nad polem).

    describe: (text) => {

        const command = commands.find(text.trim().split(/\s+/)[0] ?? '');

        return command
            ? { usage: `Użycie: ${command.usage}`, description: command.description }
            : null;

    }

});


// To, czym mogą sterować komendy.

function commandContext() {

    return {
        game,
        world: game.world,
        player: game.player,
        sky: game.sky,
        time: game.time,
        chat,
        commands,
        map: terrainMap,

        // Sterowanie dotykowe (/dotyk).
        touch: {
            enabled: touchMode,
            detected: touchDetected,
            forced: touchParameter !== null,
            app: nativeApp,
            reload: reloadWithTouch
        }
    };

}


function openChat(prefix) {

    if (!game || state !== 'playing') {
        return;
    }


    state = 'chat';

    input.reset();

    chat.open(prefix);

    document.exitPointerLock();

}


// relock = true: wracamy od razu do gry (przechwytujemy mysz),
// false: pokazujemy menu pauzy.

function closeChat(relock = true) {

    if (state !== 'chat') {
        return;
    }


    chat.close();

    state = 'paused';


    if (relock) {
        resume();
    }
    else {
        menu.showPause();
    }

}


function submitChat(text) {

    if (text.startsWith('/')) {

        chat.print(text, 'command');

        const result = commands.execute(text.slice(1), commandContext());

        if (result.text) {
            chat.print(result.text, result.ok ? 'success' : 'error');
        }

        if (!result.ok) {
            playUi('ui_error');
        }

    }
    else if (text) {

        chat.print(text, 'player');

    }


    closeChat();

}


// ------------------------------------------------------------
// EKWIPUNEK (E)
//
// Jak czat: mysz jest wolna, gra działa dalej, ale klawisze ruchu
// nie działają. E wraca do gry, ESC - do menu pauzy.
// ------------------------------------------------------------

// Księga osiągnięć w trakcie gry (L): pauza z otwartą księgą.

function openAchievements() {

    if (!game || state !== 'playing') {
        return;
    }

    state = 'paused';

    document.exitPointerLock();

    menu.showAchievements('pause');

    game.saver.save();

}


function openInventory() {

    if (!game || state !== 'playing' || !inventoryScreen) {
        return;
    }

    state = 'inventory';

    input.reset();

    input.enabled = false;

    inventoryScreen.open(game);

    document.exitPointerLock();

}


function closeInventory(relock = true) {

    if (state !== 'inventory') {
        return;
    }

    inventoryScreen.close();

    input.enabled = true;

    state = 'paused';

    if (relock) {
        resume();
    }
    else {
        menu.showPause();
    }

}


window.addEventListener('keydown', (event) => {

    // E - ekwipunek.

    if (state === 'playing' && !event.repeat && event.code === 'KeyE') {

        event.preventDefault();

        // To samo wciśnięcie nie może od razu zamknąć ekwipunku
        // (ekran ekwipunku też nasłuchuje klawisza E).

        event.stopImmediatePropagation();

        openInventory();

        return;

    }


    // L - księga osiągnięć (gra staje jak w pauzie, "Gotowe" - pauza).

    if (state === 'playing' && !event.repeat && event.code === 'KeyL') {

        event.preventDefault();

        openAchievements();

        return;

    }


    // M - mapa terenu (otwiera / zamyka).

    if (state === 'playing' && !event.repeat && event.code === 'KeyM') {

        toggleMap();

        return;

    }


    // Telefon z klawiaturą (np. na Bluetooth): ESC - pauza (bez
    // przechwyconej myszy nie zrobi jej przeglądarka).

    if (touchMode && state === 'playing' && event.code === 'Escape') {

        pauseGame();

        return;

    }


    if (
        state === 'playing' &&
        !event.repeat &&
        ['KeyT', 'Slash', 'NumpadDivide'].includes(event.code)
    ) {

        // Bez tego litera "t" trafiłaby do pola czatu.

        event.preventDefault();

        openChat(event.code === 'KeyT' ? '' : '/');

    }

});

// ------------------------------------------------------------


function toggleMap() {

    if (!game) {
        return;
    }

    if (terrainMap.isOpen) {
        terrainMap.close();
    }
    else {
        terrainMap.open(
            game.world.generator,
            game.player.pos.x,
            game.player.pos.z,
            undefined,
            undefined,
            game.player.yaw
        );
    }

}


// /dotyk wl | wyl: zapis świata i strona od nowa z ?dotyk=1 albo
// ?dotyk=0 w adresie (pozostałe dopiski, np. ?ziemniak, zostają).

async function reloadWithTouch(on) {

    if (game) {
        await game.saver.flush();
    }

    const params = new URLSearchParams(location.search);

    params.set('dotyk', on ? '1' : '0');

    location.search = params.toString();

}


// Pełny ekran (przycisk na telefonie) - i od razu obrót na poziomo,
// jeśli telefon na to pozwala.

function toggleFullscreen() {

    if (document.fullscreenElement) {

        document.exitFullscreen?.().catch(() => {});

        return;

    }

    document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
        .then(() => screen.orientation?.lock?.('landscape'))
        .catch(() => {});

}


async function quitToMenu() {

    if (!game || state === 'loading') {
        return;
    }


    state = 'loading';

    menu.showLoading(TEXTS.savingWorld);


    if (!(await game.stop())) {

        state = 'paused';

        menu.showSaveError();

        return;

    }


    closeWorld();

}


// Wyjście bez zapisywania - tylko na wyraźne życzenie gracza
// (z ekranu błędu zapisu).

async function quitWithoutSaving() {

    if (!game || state === 'loading') {
        return;
    }


    state = 'loading';

    await game.stop({ save: false });

    closeWorld();

}


function closeWorld() {

    game = null;

    achievements.detach();

    sounds.stopGameSounds();

    hotbar.reset();

    terrainMap.close();

    chat.clear();


    state = 'menu';

    menu.showTitle();

}

// ------------------------------------------------------------
// PĘTLA GRY
// ------------------------------------------------------------

// Limit FPS (ustawienie): klatki przychodzą od przeglądarki
// (zwykle tyle, ile odświeża się monitor), a nadmiarowe pomijamy.
// nextFrameTime = kiedy wypada następna klatka; przesuwa się zawsze
// o równy odstęp, więc np. limit 60 na monitorze 144 Hz daje
// naprawdę 60 klatek, a nie co którąś klatkę monitora.

let lastFrameTime = 0;

let nextFrameTime = 0;

let fpsShownAt = 0;


function animate(now) {

    requestAnimationFrame(animate);


    const limit = settings.get('fpsLimit');

    if (limit > 0) {

        const interval = 1000 / limit;

        // Odrobina zapasu (1 ms), bo klatki przeglądarki nie
        // przychodzą idealnie równo.

        if (now < nextFrameTime - 1) {
            return;
        }

        // Po dłuższej przerwie nie nadrabiamy zaległych klatek.

        nextFrameTime = Math.max(nextFrameTime + interval, now - interval / 2);

    }


    const dt = lastFrameTime > 0
        ? Math.min((now - lastFrameTime) / 1000, 0.05)
        : 1 / 60;

    lastFrameTime = now;


    // Dźwięki gry grają tylko w trakcie gry (w pauzie i w menu stoją;
    // menu ma swoje - src/audio/ui.js).

    sounds.setActive(Boolean(game) && (state === 'playing' || state === 'chat' || state === 'inventory'));


    // Przyciski dotykowe (telefon) - zależnie od stanu.

    touch?.setState(game ? state : 'menu');

    touch?.update();


    // Niebieska nakładka, gdy kamera jest pod wodą.

    document.body.classList.toggle('underwater', Boolean(game?.water.underwater));


    if (!game) {
        return;
    }


    perf.beginFrame(now);


    // Pasek bloków na dole ekranu.

    hotbar.update(game.inventory.slots.slice(0, HOTBAR_SIZE), game.inventory.selected);


    // Gra działa także przy otwartym czacie i ekwipunku.

    if (state === 'playing' || state === 'chat' || state === 'inventory') {

        // F3 - informacje debugowania w HUD.

        if (input.consumeKeyPress('F3')) {
            settings.set('showDebug', !settings.get('showDebug'));
        }


        perf.begin();

        game.update(dt);

        sounds.updateListener(game.camera);

        perf.endUpdate();

        game.updateHud(infoElement);

    }


    chat.update();

    inventoryScreen?.update();

    crosshairElement.style.visibility = game.cameraMode === 'front' ? 'hidden' : '';

    terrainMap.update(game.player.pos.x, game.player.pos.z, game.player.yaw, game.player.pos.y);


    // W pauzie świat dalej jest widoczny pod menu.

    perf.begin();

    game.render();

    perf.endRender();

    perf.endFrame();


    // Licznik FPS w rogu (odświeżany dwa razy na sekundę).

    if (!fpsElement.hidden && now - fpsShownAt > 500) {

        fpsShownAt = now;

        const summary = perf.summary(1);

        fpsElement.textContent = summary
            ? `${Math.round(summary.fps)} FPS | ${summary.frameMs.toFixed(1)} ms`
            : '-- FPS';

    }

}


// F3 w przeglądarce otwiera wyszukiwanie - w grze go blokujemy.
// F5 w grze zmienia widok kamery (zamiast odświeżać stronę).

window.addEventListener('keydown', (event) => {

    if (event.code === 'F3') {
        event.preventDefault();
    }

    if (event.code === 'F5' && state === 'playing') {
        event.preventDefault();
    }

});


window.addEventListener('resize', () => {

    applyAppSettings();

    game?.resize(window.innerWidth, window.innerHeight);

});

// ------------------------------------------------------------
// START
// ------------------------------------------------------------

await loadTheme(settings.get('theme'));


// Ikonki bloków i pasek bloków na dole ekranu.

const blockIcons = await createBlockIcons();

achievements.setIcons(blockIcons);

const hotbar = new Hotbar(
    document.getElementById('hotbar'),
    blockIcons
);


// Ekwipunek (E) - te same ikonki.

const inventoryScreen = new InventoryScreen(blockIcons, {
    close: (relock) => closeInventory(relock)
});


// Sterowanie dotykowe (telefon, tablet) - przyciski na ekranie.

let touch = null;

function createTouchControls() {

    touch = new TouchControls(
        input,
        {
            pause: pauseGame,
            inventory: openInventory,
            chat: () => openChat(''),
            achievements: openAchievements,
            map: toggleMap,
            // W aplikacji na telefon gra i tak jest na pełnym ekranie.
            fullscreen: nativeApp ? null : toggleFullscreen,

            close: () => {

                if (state === 'chat') {
                    closeChat(true);
                }
                else if (state === 'inventory') {
                    closeInventory(true);
                }

            }
        },
        document.getElementById('hotbar')
    );

}

if (touchMode) {
    createTouchControls();
}


// Pierwsze dotknięcie ekranu palcem, a sterowanie dotykowe wyłączone
// (przeglądarka zgłosiła ekran jak w komputerze - zdarza się np. na
// telefonach z rysikiem): włączamy je od razu. Zostawione wyłączone
// tylko wtedy, gdy gracz sam tak chciał (?dotyk=0, /dotyk wyl).

function enableTouchMode() {

    if (touch) {
        return;
    }

    touchMode = true;

    input.pointerLock = false;

    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    // Lżejsze ustawienia telefonu tam, gdzie gracz nic nie zmieniał.
    settings.useDefaults(TOUCH_SETTINGS);

    createTouchControls();

    applyAppSettings();

    // (Menu zostaje, jak jest - to samo dotknięcie, np. "Wróć do gry",
    // od razu działa już po dotykowemu.)

    if (game) {

        game.touchMode = true;

        chat.print(TEXTS.touchHint, 'hint');

    }

    console.info('Sterowanie dotykowe włączone (dotknięcie ekranu).');

}

window.addEventListener('pointerdown', (event) => {

    if (event.pointerType === 'touch' && !touchMode && touchParameter === null) {
        enableTouchMode();
    }

}, { capture: true });

// ------------------------------------------------------------
// APLIKACJA NA KOMPUTER (desktop/)
//
// W aplikacji jest obiekt window.desktop (desktop/preload.js): przed
// zamknięciem okna zapisujemy świat, a na ekranie tytułowym widać
// wersję gry i pobieraną aktualizację. W przeglądarce nic się tu
// nie dzieje.
// ------------------------------------------------------------

if (window.desktop) {

    window.desktop.onBeforeClose(async () => {

        if (game) {
            await game.saver.flush();
        }

    });


    menu.setAppInfo({
        version: window.desktop.version,
        install: () => window.desktop.installUpdate()
    });


    let announced = null;

    window.desktop.onUpdate((status) => {

        menu.setUpdateStatus(status);

        // W trakcie gry - jedna informacja na czacie.

        if (status?.state === 'ready' && game && announced !== status.version) {

            announced = status.version;

            chat.print(TEXTS.updateReadyInGame(status.version), 'hint');

        }

    });

}


menu.showTitle();

requestAnimationFrame(animate);
