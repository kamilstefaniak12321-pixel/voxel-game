import * as THREE from 'three';

import { InputManager } from './input/InputManager.js';
import { Game } from './game/Game.js';
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
import {
    WorldStorage,
    createWorldInfo,
    seedFromText
} from './storage/WorldStorage.js';

import {
    GAME_TITLE,
    UI_THEMES,
    POTATO_RENDER_SCALE
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
//   'playing' - gra działa, mysz jest przechwycona
//   'chat'    - otwarty czat (gra działa dalej, mysz jest wolna)
//   'paused'  - menu pauzy na tle zatrzymanej gry
// ------------------------------------------------------------

document.title = GAME_TITLE;


// Ustawienia gracza (czułość myszy, pole widzenia, motyw...).

const settings = new Settings();


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

const infoElement = document.getElementById('info');

const fpsElement = document.getElementById('fps');

// Celownik (z kamery z przodu nie ma sensu - wtedy znika).
const crosshairElement = document.getElementById('crosshair');


// Pomiar czasu klatek (licznik FPS, /wydajnosc).

const perf = new PerfMonitor();


// Mapa terenu z góry (/mapa, klawisz M).

const terrainMap = new TerrainMap();


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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);

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


async function createWorld(name, seedText, terrain) {

    const worldInfo = createWorldInfo(name, seedFromText(seedText), terrain);

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

        // Komunikaty gry (np. gdzie spadł meteoryt) trafiają na czat.

        game.onMessage = (text) => chat.print(text, 'hint');

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

    chat.print(TEXTS.chatHint, 'hint');

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
        map: terrainMap
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

    }
    else if (text) {

        chat.print(text, 'player');

    }


    closeChat();

}


window.addEventListener('keydown', (event) => {

    // M - mapa terenu (otwiera / zamyka).

    if (state === 'playing' && !event.repeat && event.code === 'KeyM') {

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


    if (!game) {
        return;
    }


    perf.beginFrame(now);


    // Pasek bloków na dole ekranu.

    hotbar.update(game.hotbar.slots, game.hotbar.selected);


    // Gra działa także przy otwartym czacie.

    if (state === 'playing' || state === 'chat') {

        // F3 - informacje debugowania w HUD.

        if (input.consumeKeyPress('F3')) {
            settings.set('showDebug', !settings.get('showDebug'));
        }


        perf.begin();

        game.update(dt);

        perf.endUpdate();

        game.updateHud(infoElement);

    }


    chat.update();

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

const hotbar = new Hotbar(
    document.getElementById('hotbar'),
    await createBlockIcons()
);

menu.showTitle();

requestAnimationFrame(animate);
