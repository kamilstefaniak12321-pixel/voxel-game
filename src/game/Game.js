import * as THREE from 'three';

import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { VoxelRaycast } from '../interaction/VoxelRaycast.js';
import { BlockHighlight } from '../interaction/BlockHighlight.js';
import { BlockBreaker } from '../interaction/BlockBreaker.js';
import { BlockPlacer } from '../interaction/BlockPlacer.js';
import { getBlockDefinition } from '../blocks/BlockRegistry.js';
import { WorldSaver } from '../storage/WorldSaver.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    MOUSE_SENSITIVITY
} from '../config.js';

// ------------------------------------------------------------
// Bloki pod klawiszami 1-9 (kolejność = numer klawisza).
// ------------------------------------------------------------

const HOTBAR = [
    'grass',
    'dirt',
    'stone',
    'lamp',
    'lepidolite'
];

// ------------------------------------------------------------
// GRA = jeden uruchomiony świat.
//
// Tworzy scenę, świat, gracza i wszystko, co potrzebne do grania.
// Z zewnątrz (main.js, menu) używa się jej tak:
//
//   const game = await Game.start(renderer, input, storage, worldInfo, settings);
//
//   game.update(dt);   // co klatkę
//   game.render();     // co klatkę
//
//   await game.stop(); // zapis i sprzątanie przy wyjściu ze świata
// ------------------------------------------------------------

export class Game {

    // Wczytuje zapisane chunki świata i uruchamia grę.

    static async start(renderer, input, storage, worldInfo, settings) {

        const savedChunks =
            storage
                ? await storage.loadChunks(worldInfo.id)
                : new Map();

        return new Game(
            renderer,
            input,
            storage,
            worldInfo,
            settings,
            savedChunks
        );

    }


    constructor(renderer, input, storage, worldInfo, settings, savedChunks) {

        this.renderer = renderer;
        this.input = input;
        this.storage = storage;
        this.worldInfo = worldInfo;
        this.settings = settings;


        // Scena: niebo, mgła i światło.

        this.scene = new THREE.Scene();

        this.scene.background = new THREE.Color(0x87CEEB);

        this.scene.fog = new THREE.Fog(
            0x87CEEB,
            20,
            45
        );

        this.scene.add(
            new THREE.AmbientLight(0xffffff, 0.7)
        );

        const sun = new THREE.DirectionalLight(0xffffff, 0.9);

        sun.position.set(20, 40, 20);

        this.scene.add(sun);


        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            500
        );


        // Świat i gracz.

        this.world = new World(
            this.scene,
            worldInfo.seed,
            savedChunks
        );

        this.world.generateStartWorld();


        this.player = new Player(
            this.world,
            this.camera
        );

        // Gracz wraca tam, gdzie był przy ostatnim zapisie.

        if (worldInfo.player) {
            this.player.setState(worldInfo.player);
        }


        // Pole widzenia, mgła i czułość myszy z ustawień gracza.

        this.applySettings();


        // Celowanie, niszczenie i stawianie bloków.

        this.raycast = new VoxelRaycast(this.world, PLAYER_REACH);

        this.highlight = new BlockHighlight(this.scene);

        this.breaker = new BlockBreaker(this.world);

        this.placer = new BlockPlacer(this.world, this.player);

        this.selectedBlock = 'stone';

        this.currentHit = null;


        // Autozapis.

        this.saver = new WorldSaver(
            storage,
            worldInfo,
            this.world,
            this.player
        );

        this.saver.saveOnExit();

        // Od razu zapisujemy, żeby nowy świat pojawił się w bazie.

        this.saver.save();

    }

    // --------------------------------------------------------
    // CO KLATKĘ
    // --------------------------------------------------------

    update(dt) {

        const input = this.input;


        this.player.update(dt, input);


        // Wybór bloku klawiszami 1-9.

        for (let i = 0; i < HOTBAR.length; i++) {

            if (input.consumeKeyPress(`Digit${i + 1}`)) {
                this.selectedBlock = HOTBAR[i];
            }

        }


        this.currentHit =
            this.raycast.castFromCamera(this.camera);


        if (input.consumeMousePress(0)) {

            this.breaker.breakBlock(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (input.consumeMousePress(2)) {

            this.placer.placeBlock(
                this.currentHit,
                this.selectedBlock
            );

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }


        // Przebudowa meshy chunków zmienionych w tej klatce.

        this.world.updateMeshes();


        // Autozapis co jakiś czas.

        this.saver.update(dt);


        this.highlight.update(this.currentHit);

    }


    render() {

        this.renderer.render(
            this.scene,
            this.camera
        );

    }


    // Stosuje ustawienia gracza. Wywoływane przy starcie
    // i po każdej zmianie w ekranie ustawień.

    applySettings() {

        const settings = this.settings;


        this.camera.fov = settings.get('fov');

        this.camera.updateProjectionMatrix();


        // Mgła gęstnieje od ~45% zasięgu do pełnego zasięgu.

        const viewDistance = settings.get('viewDistance');

        this.scene.fog.far = viewDistance;
        this.scene.fog.near = viewDistance * 0.45;


        this.player.mouseSensitivity =
            MOUSE_SENSITIVITY *
            settings.get('mouseSensitivity') / 100;

    }


    // Po zmianie rozmiaru okna.

    resize(width, height) {

        this.camera.aspect = width / height;

        this.camera.updateProjectionMatrix();

    }

    // --------------------------------------------------------
    // WYJŚCIE ZE ŚWIATA
    // --------------------------------------------------------

    // Zapisuje świat i zwalnia pamięć (meshe chunków na karcie
    // graficznej). Po stop() tego obiektu nie da się już używać.

    async stop() {

        await this.saver.save();

        this.saver.stop();


        this.world.dispose();

        this.highlight.dispose();

    }

    // --------------------------------------------------------
    // HUD (informacje w lewym górnym rogu)
    // --------------------------------------------------------

    updateHud(element) {

        const player = this.player;
        const hit = this.currentHit;


        let targetInfo = 'Cel: brak';

        if (hit && hit.hit) {

            const definition = getBlockDefinition(hit.block.type);

            targetInfo =
                `Cel: ${definition?.name ?? hit.block.type}<br>` +
                `BlockPos: ${hit.block.x}, ${hit.block.y}, ${hit.block.z}<br>` +
                `Normal: ${hit.normal.x}, ${hit.normal.y}, ${hit.normal.z}<br>` +
                `Odległość: ${hit.distance.toFixed(2)}`;

        }


        const selected = getBlockDefinition(this.selectedBlock);


        // Bez informacji debugowania (F3): tylko wybrany blok.

        if (!this.settings.get('showDebug')) {

            element.innerHTML =
                `Wybrany blok: ${selected?.name ?? this.selectedBlock}` +
                `<br><br>${this.saver.getStatus()}`;

            return;

        }

        const hotbarLegend =
            HOTBAR
                .map((type, i) =>
                    `${i + 1} ${getBlockDefinition(type)?.name ?? type}`
                )
                .join(' | ');


        element.innerHTML =

            `Świat: ${this.worldInfo.name} | Seed: ${this.worldInfo.seed}` +
            `${this.storage ? '' : ' | ZAPIS NIEDOSTĘPNY'}<br>` +

            `Pozycja: ${player.pos.x.toFixed(1)}, ` +
            `${player.pos.y.toFixed(1)}, ` +
            `${player.pos.z.toFixed(1)}<br>` +

            `Chunk: ${Math.floor(player.pos.x / CHUNK_SIZE)}, ` +
            `${Math.floor(player.pos.z / CHUNK_SIZE)} | ` +
            `Chunków: ${this.world.chunks.size}<br>` +

            `Na ziemi: ${player.onGround ? 'tak' : 'nie'}<br>` +

            `Wybrany blok: ${selected?.name ?? this.selectedBlock}<br><br>` +

            `${targetInfo}<br><br>` +

            `${hotbarLegend}<br>` +

            `LPM - zniszcz | PPM - postaw<br>` +

            `WASD - ruch | Spacja - skok | ` +
            `Mysz - kamera | ESC - pauza | F3 - debug` +

            `<br><br>${this.saver.getStatus()}`;

    }

}
