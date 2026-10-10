import * as THREE from 'three';

import { World } from './world/World.js';
import { Player } from './player/Player.js';
import { InputManager } from './input/InputManager.js';
import { VoxelRaycast } from './interaction/VoxelRaycast.js';
import { BlockHighlight } from './interaction/BlockHighlight.js';
import { BlockBreaker } from './interaction/BlockBreaker.js';
import {BlockPlacer} from './interaction/BlockPlacer.js';
import {getBlockDefinition} from './blocks/BlockRegistry.js';
import {
    WorldStorage,
    createWorldInfo,
    randomSeed
} from './storage/WorldStorage.js';
import { WorldSaver } from './storage/WorldSaver.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    WORLD_SEED
} from './config.js';

const scene = new THREE.Scene();

function update(dt) {

    player.update(
        dt,
        input
    );


    updateBlockSelection();


    if (
        input.consumeKeyPress(
            'KeyN'
        )
    ) {

        createNewWorld();

    }


    currentHit =
        voxelRaycast.castFromCamera(
            camera
        );


    if (
        input.consumeMousePress(0)
    ) {

        blockBreaker.breakBlock(
            currentHit
        );


        currentHit =
            voxelRaycast.castFromCamera(
                camera
            );

    }


    else if (
        input.consumeMousePress(2)
    ) {

        blockPlacer.placeBlock(
            currentHit,
            selectedBlock
        );


        currentHit =
            voxelRaycast.castFromCamera(
                camera
            );

    }


    // Przebudowa meshy chunków zmienionych w tej klatce.

    world.updateMeshes();


    // Autozapis co jakiś czas.

    saver.update(dt);


    blockHighlight.update(
        currentHit
    );


    updateHUD();

}
scene.background = new THREE.Color(0x87CEEB);

scene.fog = new THREE.Fog(
    0x87CEEB,
    20,
    45
);

const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    500
);

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

scene.add(
    new THREE.AmbientLight(
        0xffffff,
        0.7
    )
);


const sun = new THREE.DirectionalLight(
    0xffffff,
    0.9
);


sun.position.set(
    20,
    40,
    20
);


scene.add(sun);

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


// Chunki zmienione przez gracza w tym świecie.

const savedChunks =
    storage
        ? await storage.loadChunks(worldInfo.id)
        : new Map();


const world = new World(
    scene,
    worldInfo.seed,
    savedChunks
);

world.generateStartWorld();


const player = new Player(
    world,
    camera
);


// Gracz wraca tam, gdzie był przy ostatnim zapisie.

if (worldInfo.player) {

    player.setState(
        worldInfo.player
    );

}


const saver =
    new WorldSaver(
        storage,
        worldInfo,
        world,
        player
    );

saver.saveOnExit();


// Od razu zapisujemy, żeby nowy świat pojawił się w bazie.

saver.save();

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


    // Zapisujemy obecny świat i wyłączamy autozapis, żeby przy
    // przeładowaniu strony nie stał się znowu "ostatnio granym".

    await saver.save();

    saver.stop();


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


const input = new InputManager(
    renderer.domElement
);

const voxelRaycast =
    new VoxelRaycast(
        world,
        PLAYER_REACH
    );


const blockHighlight =
    new BlockHighlight(scene);

const blockBreaker =
    new BlockBreaker(world);

const blockPlacer =
    new BlockPlacer(
        world,
        player
    );

let selectedBlock = 'stone';

function updateBlockSelection() {

    if (
        input.consumeKeyPress(
            'Digit1'
        )
    ) {

        selectedBlock = 'grass';

    }


    if (
        input.consumeKeyPress(
            'Digit2'
        )
    ) {

        selectedBlock = 'dirt';

    }


    if (
        input.consumeKeyPress(
            'Digit3'
        )
    ) {

        selectedBlock = 'stone';

    }


    if (
        input.consumeKeyPress(
            'Digit4'
        )
    ) {

        selectedBlock = 'lamp';

    }


    if (
        input.consumeKeyPress(
            'Digit5'
        )
    ) {

        selectedBlock = 'lepidolite';

    }

}

let currentHit = null;

const infoElement =
    document.getElementById('info');
    
    function updateHUD() {

    let targetInfo =
        'Cel: brak';


    if (
        currentHit &&
        currentHit.hit
    ) {

const targetDefinition =
    getBlockDefinition(
        currentHit.block.type
    ); 
    
        targetInfo =
    `Cel: ${
        targetDefinition?.name ??
        currentHit.block.type
    }<br>` +

            `BlockPos: ` +
            `${currentHit.block.x}, ` +
            `${currentHit.block.y}, ` +
            `${currentHit.block.z}<br>` +

            `Normal: ` +
            `${currentHit.normal.x}, ` +
            `${currentHit.normal.y}, ` +
            `${currentHit.normal.z}<br>` +

            `Odległość: ` +
            `${currentHit.distance.toFixed(2)}`;

    }


    const selectedDefinition =
        getBlockDefinition(
            selectedBlock
        );


    infoElement.innerHTML =

    `Świat: ${
        worldInfo.name
    } | Seed: ${
        worldInfo.seed
    }${
        storage
            ? ''
            : ' | ZAPIS NIEDOSTĘPNY'
    }<br>` +

    `Pozycja: ${
        player.pos.x.toFixed(1)
    }, ${
        player.pos.y.toFixed(1)
    }, ${
        player.pos.z.toFixed(1)
    }<br>` +

    `Chunk: ${
        Math.floor(player.pos.x / CHUNK_SIZE)
    }, ${
        Math.floor(player.pos.z / CHUNK_SIZE)
    } | Chunków: ${
        world.chunks.size
    }<br>` +

    `Na ziemi: ${
        player.onGround
            ? 'tak'
            : 'nie'
    }<br>` +

    `Wybrany blok: ${
        selectedDefinition?.name ??
        selectedBlock
    }<br><br>` +

    `${targetInfo}<br><br>` +

    `1 Grass | 2 Dirt | 3 Stone | 4 Lamp | 5 Lepidolite<br>` +

    `LPM - zniszcz | PPM - postaw | N - nowy świat<br>` +

    `WASD - ruch | Spacja - skok | ` +
    `Mysz - kamera | ESC - wyjście` +

    `<br><br>${
        saver.getStatus()
    }`;
}

const clock = new THREE.Clock();


function animate() {

    requestAnimationFrame(animate);


    const dt = Math.min(
        clock.getDelta(),
        0.05
    );


    update(dt);


    renderer.render(
        scene,
        camera
    );

}


animate();

window.addEventListener(
    'resize',
    () => {

        camera.aspect =
            window.innerWidth /
            window.innerHeight;


        camera.updateProjectionMatrix();


        renderer.setSize(
            window.innerWidth,
            window.innerHeight
        );

    }
);
