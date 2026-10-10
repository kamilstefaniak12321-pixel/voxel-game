import * as THREE from 'three';

import { InputManager } from './input/InputManager.js';
import { Game } from './game/Game.js';
import { Menu } from './ui/Menu.js';
import { TEXTS } from './ui/texts.js';
import {
    WorldStorage,
    createWorldInfo,
    seedFromText
} from './storage/WorldStorage.js';

import {
    GAME_TITLE,
    UI_THEME
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
//   'paused'  - menu pauzy na tle zatrzymanej gry
// ------------------------------------------------------------

document.title = GAME_TITLE;


const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(window.innerWidth, window.innerHeight);

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

document.body.appendChild(renderer.domElement);


const input = new InputManager(renderer.domElement);

const infoElement = document.getElementById('info');


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
        quitToMenu
    }
);


async function openWorldList() {

    const worlds = storage ? await storage.listWorlds() : [];

    menu.showWorlds(worlds, !storage);

}


async function createWorld(name, seedText) {

    const worldInfo = createWorldInfo(name, seedFromText(seedText));

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

        game = await Game.start(renderer, input, storage, worldInfo);

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


    if (locked) {

        state = 'playing';

        input.reset();

        menu.hide();

    }

    else if (state === 'playing') {

        state = 'paused';

        menu.showPause();

        game.saver.save();

    }

});


async function quitToMenu() {

    if (!game || state === 'loading') {
        return;
    }


    state = 'loading';

    menu.showLoading(TEXTS.savingWorld);


    await game.stop();

    game = null;


    state = 'menu';

    menu.showTitle();

}

// ------------------------------------------------------------
// PĘTLA GRY
// ------------------------------------------------------------

const clock = new THREE.Clock();


function animate() {

    requestAnimationFrame(animate);


    const dt = Math.min(clock.getDelta(), 0.05);


    if (!game) {
        return;
    }


    if (state === 'playing') {

        game.update(dt);

        game.updateHud(infoElement);

    }


    // W pauzie świat dalej jest widoczny pod menu.

    game.render();

}


window.addEventListener('resize', () => {

    renderer.setSize(window.innerWidth, window.innerHeight);

    game?.resize(window.innerWidth, window.innerHeight);

});

// ------------------------------------------------------------
// START
// ------------------------------------------------------------

await loadTheme(UI_THEME);

menu.showTitle();

animate();
