import * as THREE from 'three';

import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { VoxelRaycast } from '../interaction/VoxelRaycast.js';
import { BlockHighlight } from '../interaction/BlockHighlight.js';
import { BlockBreaker } from '../interaction/BlockBreaker.js';
import { BlockPlacer } from '../interaction/BlockPlacer.js';
import {
    getBlockDefinition,
    blockExists
} from '../blocks/BlockRegistry.js';
import { WorldSaver } from '../storage/WorldSaver.js';
import { lightToBrightness } from '../world/Light.js';
import { WorldTime } from '../sky/WorldTime.js';
import { Sky } from '../sky/Sky.js';
import { skyUniforms } from '../sky/skyShader.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    CHUNK_LOAD_BUDGET_MS,
    MOUSE_SENSITIVITY,
    WORLD_SPAWN_X,
    WORLD_SPAWN_Z,
    HOTBAR_SIZE,
    HOTBAR_DEFAULT
} from '../config.js';

// ------------------------------------------------------------
// Pasek bloków świata: zapisany albo domyślny z config.js.
// Nieznane bloki (np. usunięte z gry) zamieniamy na puste miejsca.
//
//   { slots: ['grass', 'dirt', null, ...], selected: 0 }
// ------------------------------------------------------------

function loadHotbar(saved) {

    const source =
        Array.isArray(saved?.slots)
            ? saved.slots
            : HOTBAR_DEFAULT;


    const slots = [];

    for (let i = 0; i < HOTBAR_SIZE; i++) {

        const type = source[i];

        slots.push(blockExists(type) ? type : null);

    }


    const selected =
        Number.isInteger(saved?.selected) &&
        saved.selected >= 0 &&
        saved.selected < HOTBAR_SIZE
            ? saved.selected
            : 0;


    return { slots, selected };

}

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


        // Scena świata i mgła. Kolor mgły na blokach liczy shader
        // z koloru nieba w danym kierunku (patrz sky/skyShader.js).

        this.scene = new THREE.Scene();

        this.scene.fog = new THREE.Fog(
            0x87CEEB,
            20,
            45
        );

        // Jasność mgły: w ciemnym tunelu mgła ciemnieje (inaczej
        // koniec długiego tunelu "świeciłby" kolorem nieba).
        // Zmienia się płynnie - jak oczy przyzwyczajające się do ciemności.

        this.fogBrightness = 1;


        // Czas świata (zapisany albo poranek nowego świata) i niebo:
        // słońce, księżyc, gwiazdy i światło na blokach.

        this.time = new WorldTime(worldInfo.time);

        this.sky = new Sky(this.scene);

        this.sky.update(this.time.days, 0, renderer.getPixelRatio());


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


        // Wczytujemy teren wokół miejsca, w którym gracz się pojawi:
        // zapisanej pozycji albo miejsca startu w nowym świecie.

        const start = worldInfo.player ?? {
            x: WORLD_SPAWN_X + 0.5,
            z: WORLD_SPAWN_Z + 0.5
        };

        this.world.loadAround(
            start.x,
            start.z,
            this.getLoadRadius()
        );


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

        this.currentHit = null;


        // Pasek bloków - zapisywany razem ze światem.

        this.hotbar = loadHotbar(worldInfo.hotbar);

        worldInfo.hotbar = this.hotbar;


        // Autozapis.

        this.saver = new WorldSaver(
            storage,
            worldInfo,
            this.world,
            this.player,
            this.time
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


        // Chunk pod graczem musi istnieć, zanim policzymy kolizje
        // (np. po bardzo szybkim ruchu).

        this.world.ensureColumnLoaded(
            this.player.pos.x,
            this.player.pos.z
        );


        this.player.update(dt, input);


        // Upływ czasu. Z włączonym debugiem (F3) klawisze [ i ]
        // przestawiają zegar o godzinę (do oglądania nieba).

        this.time.update(dt);

        const earlier = input.consumeKeyPress('BracketLeft');
        const later = input.consumeKeyPress('BracketRight');

        if (this.settings.get('showDebug')) {

            if (earlier) this.time.addHours(-1);
            if (later) this.time.addHours(1);

        }


        // Pasek bloków: klawisze 1-9 i kółko myszy.

        for (let i = 0; i < HOTBAR_SIZE; i++) {

            if (input.consumeKeyPress(`Digit${i + 1}`)) {
                this.hotbar.selected = i;
            }

        }


        const wheel = input.consumeWheel();

        if (wheel !== 0) {

            // Kółko przewija w kółko: za ostatnim jest pierwszy.

            this.hotbar.selected =
                ((this.hotbar.selected + wheel) % HOTBAR_SIZE + HOTBAR_SIZE) % HOTBAR_SIZE;

        }


        this.currentHit =
            this.raycast.castFromCamera(this.camera);


        // Oba kliknięcia odczytujemy od razu: gdy w tej samej klatce
        // wciśnięto LPM i PPM, wygrywa niszczenie, a PPM przepada
        // (inaczej blok postawiłby się klatkę później sam z siebie).

        const breakPressed = input.consumeMousePress(0);
        const placePressed = input.consumeMousePress(2);


        if (breakPressed) {

            this.breaker.breakBlock(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placePressed) {

            // Puste miejsce na pasku - nie ma czego postawić.

            if (this.selectedBlock) {

                this.placer.placeBlock(
                    this.currentHit,
                    this.selectedBlock
                );

                this.currentHit =
                    this.raycast.castFromCamera(this.camera);

            }

        }


        // Środkowy przycisk: weź blok, na który patrzysz.

        if (
            input.consumeMousePress(1) &&
            this.currentHit &&
            this.currentHit.hit
        ) {
            this.pickBlock(this.currentHit.block.type);
        }


        // Wczytywanie chunków wokół gracza i przebudowa meshy
        // (z limitem czasu na klatkę).

        this.world.update(
            this.player.pos.x,
            this.player.pos.z,
            this.getLoadRadius(),
            CHUNK_LOAD_BUDGET_MS
        );


        // Autozapis co jakiś czas.

        this.saver.update(dt);


        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());

        this.updateFog(dt);


        this.highlight.update(this.currentHit);

    }


    // Najpierw niebo (własna scena), potem świat na nim.

    render() {

        const renderer = this.renderer;

        renderer.autoClear = false;

        renderer.clear();

        this.sky.render(renderer, this.camera);

        renderer.clearDepth();

        renderer.render(this.scene, this.camera);

    }


    // Mgła ma kolor nieba przyciemniony tak, jak ciemno jest
    // tam, gdzie gracz ma głowę (liczy się tylko światło nieba).

    updateFog(dt) {

        const light = this.world.getLight(
            Math.floor(this.camera.position.x),
            Math.floor(this.camera.position.y),
            Math.floor(this.camera.position.z)
        );

        const target = lightToBrightness(light.sky);


        // Mniej więcej w sekundę dochodzi do nowej jasności.

        this.fogBrightness +=
            (target - this.fogBrightness) * Math.min(1, dt * 3);


        // Kolory w three.js są liniowe, a jasność "na oko" - stąd potęga.

        const fog = this.fogBrightness ** 2.2;

        skyUniforms.uFogBrightness.value = fog;

        // Kolor mgły dla reszty obiektów (np. ramka wskazanego bloku).

        this.scene.fog.color
            .copy(this.sky.state.horizon)
            .multiplyScalar(fog);

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


    // --------------------------------------------------------
    // PASEK BLOKÓW
    // --------------------------------------------------------

    // Blok w wybranym miejscu paska (null = puste miejsce).

    get selectedBlock() {

        return this.hotbar.slots[this.hotbar.selected];

    }


    // "Weź blok" (środkowy przycisk myszy):
    // - blok jest już na pasku -> wybieramy jego miejsce,
    // - nie ma go -> trafia do pierwszego pustego miejsca,
    // - brak pustych -> zastępuje blok w wybranym miejscu.

    pickBlock(type) {

        const slots = this.hotbar.slots;


        const existing = slots.indexOf(type);

        if (existing !== -1) {

            this.hotbar.selected = existing;

            return;

        }


        const empty = slots.indexOf(null);

        if (empty !== -1) {

            slots[empty] = type;

            this.hotbar.selected = empty;

            return;

        }


        slots[this.hotbar.selected] = type;

    }

    // --------------------------------------------------------

    // Promień wczytywania chunków wokół gracza (w chunkach):
    // tyle, żeby krawędź widocznego terenu kryła się we mgle.
    // +2, bo najdalszy pierścień wczytanych chunków jest niewidoczny
    // (czeka na sąsiadów - patrz World.js).

    getLoadRadius() {

        return Math.ceil(
            this.settings.get('viewDistance') / CHUNK_SIZE
        ) + 2;

    }


    // Po zmianie rozmiaru okna.

    resize(width, height) {

        this.camera.aspect = width / height;

        this.camera.updateProjectionMatrix();

    }

    // --------------------------------------------------------
    // WYJŚCIE ZE ŚWIATA
    // --------------------------------------------------------

    // Zapisuje świat (czeka, aż wszystkie zapisy się skończą)
    // i zwalnia pamięć (meshe chunków na karcie graficznej).
    //
    // Zwraca false, jeśli zapis się nie udał - wtedy NIC nie jest
    // sprzątane, świat działa dalej i można spróbować jeszcze raz.
    // stop({ save: false }) zamyka świat bez zapisywania.
    //
    // Po udanym stop() tego obiektu nie da się już używać.

    async stop({ save = true } = {}) {

        if (save && !(await this.saver.flush())) {
            return false;
        }


        this.saver.stop();

        this.world.dispose();

        this.highlight.dispose();

        this.sky.dispose();

        return true;

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


        // Światło w miejscu głowy gracza.

        const light = this.world.getLight(
            Math.floor(this.camera.position.x),
            Math.floor(this.camera.position.y),
            Math.floor(this.camera.position.z)
        );


        // Bez informacji debugowania (F3): tylko komunikat o zapisie
        // (wybrany blok widać na pasku na dole).

        if (!this.settings.get('showDebug')) {

            element.innerHTML = this.saver.getStatus();

            return;

        }


        element.innerHTML =

            `Świat: ${this.worldInfo.name} | Seed: ${this.worldInfo.seed}` +
            `${this.storage ? '' : ' | ZAPIS NIEDOSTĘPNY'}<br>` +

            `Pozycja: ${player.pos.x.toFixed(1)}, ` +
            `${player.pos.y.toFixed(1)}, ` +
            `${player.pos.z.toFixed(1)}<br>` +

            `Chunk: ${Math.floor(player.pos.x / CHUNK_SIZE)}, ` +
            `${Math.floor(player.pos.z / CHUNK_SIZE)} | ` +
            `Wczytane chunki: ${this.world.chunks.size}` +
            `${this.world.loadQueue.length > 0 ? ` (w kolejce: ${this.world.loadQueue.length})` : ''}<br>` +

            `Czas: ${this.time.formatClock()}, dzień ${this.time.dayNumber} | ` +
            `Księżyc: ${this.sky.celestial.moonPhaseName}<br>` +

            `Na ziemi: ${player.onGround ? 'tak' : 'nie'} | ` +
            `Światło: niebo ${light.sky}, lampy ${light.block}<br>` +

            `Wybrany blok: ${selected?.name ?? 'brak'}<br><br>` +

            `${targetInfo}<br><br>` +

            `1-9 / kółko - wybór bloku | środkowy przycisk - weź blok<br>` +

            `LPM - zniszcz | PPM - postaw<br>` +

            `WASD - ruch | Spacja - skok | ` +
            `Mysz - kamera | ESC - pauza | F3 - debug | [ ] - czas ±1 h` +

            `<br><br>${this.saver.getStatus()}`;

    }

}
