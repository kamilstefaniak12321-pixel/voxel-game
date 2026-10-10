import * as THREE from 'three';

import { InputManager } from './input/InputManager.js';
import { Game } from './game/Game.js';
import {
    WorldStorage,
    createWorldInfo,
    randomSeed
} from './storage/WorldStorage.js';

import { WORLD_SEED } from './config.js';

// ------------------------------------------------------------
// START APLIKACJI
//
// Tu powstaje to, co jest wspólne dla całej aplikacji:
// renderer (rysowanie), obsługa klawiatury i myszy oraz baza
// z zapisami. Sama gra (świat, gracz...) jest w game/Game.js.
// ------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(
    window.innerWidth,
    window.innerHeight
);

renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, 2)
);

document.body.appendChild(
    renderer.domElement
);


const input = new InputManager(
    renderer.domElement
);


const infoElement =
    document.getElementById('info');

// ------------------------------------------------------------
// WCZYTANIE ŚWIATA
// ------------------------------------------------------------

// Baza z zapisami. null = zapis niedostępny, gra działa bez niego.

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


// Ostatnio grany świat, a jeśli nie ma żadnego - nowy.

let worldInfo =
    storage
        ? (await storage.listWorlds())[0]
        : undefined;

if (!worldInfo) {

    worldInfo =
        createWorldInfo(
            'Świat 1',
            WORLD_SEED
        );

}


const game = await Game.start(
    renderer,
    input,
    storage,
    worldInfo
);

// ------------------------------------------------------------
// NOWY ŚWIAT (tymczasowo, do czasu menu)
//
// Klawisz N zapisuje obecny świat i tworzy nowy. Stare światy
// zostają w bazie - pojawią się na liście światów w menu.
// ------------------------------------------------------------

let creatingWorld = false;


async function createNewWorld() {

    if (creatingWorld) {
        return;
    }


    if (!storage) {

        alert('Zapis jest niedostępny, więc nie da się utworzyć nowego świata.');

        return;

    }


    creatingWorld = true;

    document.exitPointerLock();


    const answer =
        prompt(
            'Seed nowego świata (zostaw puste dla losowego):',
            ''
        );


    // Anulowano.

    if (answer === null) {

        creatingWorld = false;

        return;

    }


    // Puste = losowy seed, same cyfry = liczba, reszta = tekst.

    const text = answer.trim();

    let seed = text;

    if (text === '') {
        seed = randomSeed();
    }
    else if (/^-?\d+$/.test(text)) {
        seed = Number(text);
    }


    // Zapisujemy obecny świat i zamykamy go, żeby przy
    // przeładowaniu strony nie stał się znowu "ostatnio granym".

    await game.stop();


    const worlds = await storage.listWorlds();

    const newWorld =
        createWorldInfo(
            `Świat ${worlds.length + 1}`,
            seed
        );

    newWorld.lastPlayed =
        Math.max(
            newWorld.lastPlayed,
            worldInfo.lastPlayed + 1
        );

    await storage.saveWorld(newWorld);


    // Najprostszy sposób na wejście do nowego świata do czasu menu:
    // przeładowanie strony wczyta ostatnio grany świat, czyli nowy.

    location.reload();

}

// ------------------------------------------------------------
// PĘTLA GRY
// ------------------------------------------------------------

const clock = new THREE.Clock();


function animate() {

    requestAnimationFrame(animate);


    const dt = Math.min(
        clock.getDelta(),
        0.05
    );


    if (creatingWorld) {
        return;
    }


    if (input.consumeKeyPress('KeyN')) {
        createNewWorld();
    }


    game.update(dt);

    game.updateHud(infoElement, ' | N - nowy świat');

    game.render();

}


animate();


window.addEventListener(
    'resize',
    () => {

        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

        game.resize(
            window.innerWidth,
            window.innerHeight
        );

    }
);
