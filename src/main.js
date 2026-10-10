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

const world = new World(
    scene,
    WORLD_SEED
);

world.generateStartWorld();


const player = new Player(
    world,
    camera
);


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

    `LPM - zniszcz | PPM - postaw<br>` +

    `WASD - ruch | Spacja - skok | ` +
    `Mysz - kamera | ESC - wyjście`;
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
