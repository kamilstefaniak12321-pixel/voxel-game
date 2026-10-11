import * as THREE from 'three';

import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { VoxelRaycast } from '../interaction/VoxelRaycast.js';
import { BlockHighlight } from '../interaction/BlockHighlight.js';
import { BlockBreaker } from '../interaction/BlockBreaker.js';
import { BlockPlacer } from '../interaction/BlockPlacer.js';
import {
    getBlockDefinition,
    getBlockId,
    getLightEmission,
    getLightColor,
    getBlockLabel,
    getDropType,
    isPlantId
} from '../blocks/BlockRegistry.js';
import { Inventory } from './Inventory.js';
import { DynamicLight } from '../world/DynamicLight.js';
import { FarTerrain } from '../world/FarTerrain.js';
import { setAmbientOcclusion } from '../rendering/ChunkMesher.js';
import { viewUniforms } from '../rendering/viewUniforms.js';
import { blockMaterial, plantMaterial, setPotatoDefine } from '../rendering/BlockRenderData.js';
import { Meteorites } from './Meteorites.js';
import { createGlowSprite } from '../rendering/Glow.js';
import { WorldSaver } from '../storage/WorldSaver.js';
import { lightToBrightness, describeLight } from '../world/Light.js';
import { WorldTime } from '../sky/WorldTime.js';
import { Sky } from '../sky/Sky.js';
import { skyUniforms } from '../sky/skyShader.js';
import { PlayerModel } from '../player/PlayerModel.js';
import { PlayerAnimator } from '../player/PlayerAnimator.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { COLOR_LEVEL } from '../world/Light.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    START_LOAD_RADIUS,
    POTATO_VIEW_DISTANCE,
    MOUSE_SENSITIVITY,
    HOTBAR_SIZE,
    SPRINT_FOV_FACTOR
} from '../config.js';


// Tryby gry: przygoda (zbieranie i zużywanie bloków) i kreatywny
// (bloki bez końca, latanie po dwukrotnym wciśnięciu Spacji).

export const GAME_MODES = {
    adventure: 'Przygoda',
    creative: 'Kreatywny'
};


// Widoki kamery (F5): z oczu gracza, zza pleców, z przodu.

export const CAMERA_MODES = ['first', 'back', 'front'];

const CAMERA_TEXTS = {
    first: 'z oczu',
    back: 'zza pleców',
    front: 'z przodu'
};

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


        // Dynamiczne światło (lampa w ręce, meteoryty, kule światła)
        // i spadające meteoryty.

        this.dynamicLight = new DynamicLight();

        this.meteorites = new Meteorites(this);

        // Światło lampy trzymanej w ręce (wybranej na pasku).

        this.handLight = {
            position: new THREE.Vector3(),
            color: [1, 1, 1],
            strength: 0
        };

        // Kule światła z komendy /demo kula.

        this.orbs = [];

        // Komunikaty dla gracza (main.js pokazuje je na czacie).

        this.onMessage = null;

        // Pomiar wydajności (ustawia main.js) i trwający test
        // wydajności (/wydajnosc test).

        this.perf = null;

        this.benchmark = null;


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
            savedChunks,
            worldInfo.terrain
        );


        // Daleki teren za zasięgiem widzenia (własna scena, oświetlona
        // tym samym niebem).

        this.farTerrain = new FarTerrain(this.world);

        this.sky.attachLights(this.farTerrain.scene);


        // Cienie w kątach z ustawień - zanim powstaną pierwsze meshe.

        this.appliedAmbientOcclusion = settings.get('ambientOcclusion') / 100;

        setAmbientOcclusion(this.appliedAmbientOcclusion);


        // Wczytujemy teren wokół miejsca, w którym gracz się pojawi:
        // zapisanej pozycji albo miejsca startu w nowym świecie.
        // Od razu tylko najbliższe chunki - dalsze dograją się w grze.

        const start = worldInfo.player ?? this.world.spawnPoint;

        this.world.loadAround(
            start.x,
            start.z,
            Math.min(this.getLoadRadius(), START_LOAD_RADIUS)
        );


        this.player = new Player(
            this.world,
            this.camera
        );

        // Gracz wraca tam, gdzie był przy ostatnim zapisie.

        if (worldInfo.player) {
            this.player.setState(worldInfo.player);
        }


        // Model gracza (widać go z trzeciej osoby - F5) i jego animacje.

        this.model = new PlayerModel();

        this.scene.add(this.model.object);

        this.animator = new PlayerAnimator();

        this.cameraMode = 'first';

        // Położenie kamery z trzeciej osoby (null = z oczu gracza).
        this.view = null;

        // Światło w miejscu gracza (dla modelu), płynnie zmieniane.
        this.modelSky = 1;
        this.modelBlock = new THREE.Vector3();

        // Pole widzenia przy biegu (mnożnik, płynnie).
        this.fovBoost = 1;


        // Pole widzenia, mgła i czułość myszy z ustawień gracza.

        this.applySettings();


        // Celowanie, niszczenie i stawianie bloków.

        this.raycast = new VoxelRaycast(this.world, PLAYER_REACH);

        this.highlight = new BlockHighlight(this.scene);

        this.breaker = new BlockBreaker(this.world);

        this.placer = new BlockPlacer(this.world, this.player);

        this.currentHit = null;


        // Tryb gry i ekwipunek (z paskiem bloków) - zapisywane ze światem.
        // Światy sprzed trybów są kreatywne (bloki były bez końca).

        this.mode = worldInfo.gameMode in GAME_MODES ? worldInfo.gameMode : 'creative';

        worldInfo.gameMode = this.mode;

        this.inventory = Inventory.load(worldInfo, this.mode);

        worldInfo.inventory = this.inventory.data;

        delete worldInfo.hotbar;


        // Dawny "pasek" (komendy, testy): nazwy bloków i wybrane miejsce.

        const inventory = this.inventory;

        this.hotbar = {
            get slots() { return inventory.hotbarTypes(); },
            get selected() { return inventory.selected; },
            set selected(value) { inventory.selected = value; }
        };

        this.player.canFly = this.mode === 'creative';

        // Krótkie komunikaty nad paskiem (np. "Ekwipunek pełny") - main.js.

        this.onNotice = null;


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


        // Test wydajności: kamera powoli obraca się dookoła.

        if (this.benchmark) {
            this.updateBenchmark(dt);
        }


        // Upływ czasu. Z włączonym debugiem (F3) klawisze [ i ]
        // przestawiają zegar o godzinę (do oglądania nieba).

        this.time.update(dt);

        const earlier = input.consumeKeyPress('BracketLeft');
        const later = input.consumeKeyPress('BracketRight');

        if (this.settings.get('showDebug')) {

            if (earlier) this.time.addHours(-1);
            if (later) this.time.addHours(1);

        }


        // Pasek bloków: klawisze 1-9 i kółko myszy (w kółko: za ostatnim
        // jest pierwszy).

        for (let i = 0; i < HOTBAR_SIZE; i++) {

            if (input.consumeKeyPress(`Digit${i + 1}`)) {
                this.inventory.selected = i;
            }

        }


        const wheel = input.consumeWheel();

        if (wheel !== 0) {
            this.inventory.selected += wheel;
        }


        // Czas dla kołysania roślin na wietrze.

        viewUniforms.uTime.value = (viewUniforms.uTime.value + dt) % 3600;


        this.currentHit =
            this.raycast.castFromCamera(this.camera);


        // Oba kliknięcia odczytujemy od razu: gdy w tej samej klatce
        // wciśnięto LPM i PPM, wygrywa niszczenie, a PPM przepada
        // (inaczej blok postawiłby się klatkę później sam z siebie).

        const breakPressed = input.consumeMousePress(0);
        const placePressed = input.consumeMousePress(2);


        // Machnięcie ręką przy każdym kliknięciu (jak w Minecrafcie).

        if (breakPressed || (placePressed && this.selectedBlock)) {
            this.animator.swing();
        }


        if (breakPressed) {

            this.breakTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placePressed) {

            // Puste miejsce na pasku - nie ma czego postawić.

            if (this.selectedBlock) {

                const placed = this.placer.placeBlock(
                    this.currentHit,
                    this.selectedBlock
                );

                // W przygodzie postawiony blok znika ze stosu.

                if (placed && this.mode === 'adventure') {
                    this.inventory.take(this.inventory.selected, 1);
                }

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
            this.settings.get('loadBudget')
        );

        // Daleki teren: wybór i budowanie kafelków (też z limitem czasu).
        // Zaczyna się na końcu zasięgu widzenia - albo bliżej, dopóki
        // dalsze chunki się wczytują (np. zaraz po wejściu do świata).

        this.updateFarRange();

        this.farTerrain.update(this.camera.position);


        // Autozapis co jakiś czas.

        this.saver.update(dt);


        // Z dalekim terenem słońce zachodzi za jego brzegiem - z wysoka
        // ten brzeg jest trochę pod linią poziomu.

        this.sky.horizonDip = this.farTerrain.active
            ? Math.min(0, (this.world.generator.baseHeight + 1 - this.camera.position.y) / this.farTerrain.outer)
            : 0;

        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());

        this.updateFog(dt);


        // Meteoryty, kule światła i dynamiczne światło.

        this.meteorites.update(dt);

        this.updateOrbs(dt);

        this.updateDynamicLight();


        this.highlight.update(this.currentHit);


        // Widok z trzeciej osoby (F5), model gracza i pole widzenia przy biegu.

        if (input.consumeKeyPress('F5')) {
            this.cycleCameraMode();
        }

        this.updateModel(dt);

        this.updateView();

        this.updateFovBoost(dt);

    }

    // --------------------------------------------------------
    // MODEL GRACZA I KAMERA Z TRZECIEJ OSOBY
    // --------------------------------------------------------

    // Następny widok: z oczu -> zza pleców -> z przodu -> z oczu.

    cycleCameraMode() {

        const next = CAMERA_MODES[(CAMERA_MODES.indexOf(this.cameraMode) + 1) % CAMERA_MODES.length];

        this.setCameraMode(next);

    }


    setCameraMode(mode) {

        this.cameraMode = CAMERA_MODES.includes(mode) ? mode : 'first';

        this.updateView();

    }


    // Animacja i położenie modelu, blok w ręce, światło w miejscu gracza.

    updateModel(dt) {

        const player = this.player;

        const pose = this.animator.update(dt, {
            vx: player.vel.x,
            vy: player.vel.y,
            vz: player.vel.z,
            onGround: player.onGround,
            crouching: player.crouching,
            sprinting: player.sprinting,
            flying: player.flying,
            yaw: player.yaw,
            pitch: player.pitch,
            landed: player.landed
        });

        this.model.setPose(pose);

        this.model.place(player.pos, this.animator.bodyYaw, this.animator.previewLift);

        this.model.setHeldBlock(this.selectedBlock);


        // Światło na wysokości piersi gracza (jak w rogach ścian bloków):
        // niebo i lampy osobno, kolor lamp z proporcji kanałów.

        const light = this.world.getLight(
            Math.floor(player.pos.x),
            Math.floor(player.pos.y + 1.2),
            Math.floor(player.pos.z)
        );

        const sky = lightToBrightness(light.sky);

        const strongest = Math.max(light.red, light.green, light.blue);

        const lamp = strongest > 0 ? lightToBrightness(COLOR_LEVEL[strongest]) : 0;

        const rate = Math.min(1, dt * 10);

        this.modelSky += (sky - this.modelSky) * rate;

        this.modelBlock.lerp(
            new THREE.Vector3(
                strongest > 0 ? lamp * light.red / strongest : 0,
                strongest > 0 ? lamp * light.green / strongest : 0,
                strongest > 0 ? lamp * light.blue / strongest : 0
            ),
            rate
        );

        modelLight.uModelSky.value = this.modelSky;
        modelLight.uModelBlock.value.copy(this.modelBlock);

    }


    // Kamera z trzeciej osoby: od oczu gracza do tyłu (albo do przodu,
    // patrząc na gracza), ale nie przez bloki - zatrzymuje się przed ścianą.

    updateView() {

        const thirdPerson = this.cameraMode !== 'first';

        this.model.object.visible = thirdPerson;

        if (!thirdPerson) {

            this.view = null;

            return;

        }


        const { yaw, pitch } = this.player;

        const eye = this.camera.position;

        const direction = new THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
        );

        if (this.cameraMode === 'back') {
            direction.negate();
        }


        const distance = this.settings.get('cameraDistance');

        const point = new THREE.Vector3();

        let reach = distance;

        for (let t = 0.1; t <= distance; t += 0.05) {

            point.copy(eye).addScaledVector(direction, t);

            if (this.solidNear(point, 0.15)) {

                reach = Math.max(0.1, t - 0.2);

                break;

            }

        }


        this.view = {
            position: eye.clone().addScaledVector(direction, reach),
            yaw: this.cameraMode === 'back' ? yaw : yaw + Math.PI,
            pitch: this.cameraMode === 'back' ? pitch : -pitch
        };

    }


    // Czy w pobliżu punktu (± radius) jest blok z kolizją.

    solidNear(point, radius) {

        for (const dx of [-radius, radius]) {

            for (const dy of [-radius, radius]) {

                for (const dz of [-radius, radius]) {

                    if (this.world.isSolid(
                        Math.floor(point.x + dx),
                        Math.floor(point.y + dy),
                        Math.floor(point.z + dz)
                    )) {
                        return true;
                    }

                }

            }

        }

        return false;

    }


    // Bieg poszerza pole widzenia (płynnie).

    updateFovBoost(dt) {

        const target = this.player.sprinting ? SPRINT_FOV_FACTOR : 1;

        const previous = this.fovBoost;

        this.fovBoost += (target - this.fovBoost) * Math.min(1, dt * 8);

        if (Math.abs(target - this.fovBoost) < 0.001) {
            this.fovBoost = target;
        }

        if (this.fovBoost !== previous) {

            this.camera.fov = this.settings.get('fov') * this.fovBoost;

            this.camera.updateProjectionMatrix();

        }

    }


    // Najpierw niebo (własna scena), na nim daleki teren, a na
    // wierzchu świat (prawdziwe chunki zawsze zasłaniają daleki teren).

    render() {

        const renderer = this.renderer;

        renderer.autoClear = false;

        renderer.info.reset();

        renderer.clear();


        // Z trzeciej osoby kamera na czas rysowania przesuwa się za gracza
        // (celowanie i reszta gry dalej liczą się z jego oczu).

        const camera = this.camera;

        const saved = this.view
            ? { position: camera.position.clone(), rotation: camera.rotation.clone() }
            : null;

        if (this.view) {

            camera.position.copy(this.view.position);

            camera.rotation.set(this.view.pitch, this.view.yaw, 0, 'YXZ');

            camera.updateMatrixWorld();

        }


        this.sky.render(renderer, camera);

        renderer.clearDepth();

        this.farTerrain.render(renderer, camera);

        renderer.clearDepth();

        renderer.render(this.scene, camera);


        if (saved) {

            camera.position.copy(saved.position);

            camera.rotation.copy(saved.rotation);

            camera.updateMatrixWorld();

        }

    }


    // --------------------------------------------------------
    // TEST WYDAJNOŚCI (/wydajnosc test): kamera obraca się raz
    // dookoła, a my mierzymy klatki. Wynik trafia na czat.
    // --------------------------------------------------------

    startBenchmark(seconds) {

        this.benchmark = {
            seconds,
            time: 0,
            startYaw: this.player.yaw,
            startPitch: this.player.pitch,
            calls: 0,
            triangles: 0,
            samples: 0
        };

        this.perf?.reset();

    }


    updateBenchmark(dt) {

        const test = this.benchmark;

        test.time += dt;


        // Patrzymy lekko w dół, jak przy zwykłym chodzeniu.

        this.player.yaw = test.startYaw + 2 * Math.PI * Math.min(1, test.time / test.seconds);
        this.player.pitch = -0.1;

        this.player.updateCamera();


        const info = this.renderer.info.render;

        test.calls += info.calls;
        test.triangles += info.triangles;
        test.samples++;


        if (test.time < test.seconds) {
            return;
        }


        this.benchmark = null;

        this.player.yaw = test.startYaw;
        this.player.pitch = test.startPitch;

        this.player.updateCamera();


        const summary = this.perf?.summary(test.seconds + 1);

        if (!summary) {
            return;
        }

        this.onMessage?.(
            `Test wydajności (${test.seconds} s, obrót dookoła): ` +
            `średnio ${summary.fps.toFixed(0)} FPS, ` +
            `najwolniejsze 1%: ${summary.low1.toFixed(0)} FPS, ` +
            `najdłuższa klatka ${summary.worstMs.toFixed(1)} ms | ` +
            `gra ${summary.updateMs.toFixed(1)} ms, rysowanie ${summary.renderMs.toFixed(1)} ms na klatkę | ` +
            `${Math.round(test.calls / test.samples)} rysowań, ` +
            `${Math.round(test.triangles / test.samples / 1000)} tys. trójkątów | ` +
            `zasięg ${this.viewDistance}, daleki teren ${this.settings.get('farTerrain') || 'wył.'}` +
            `${this.settings.get('potato') ? ', tryb ziemniaka' : ''}`
        );

    }


    // Zbiera źródła dynamicznego światła i przelicza je wokół gracza.
    // Ustawienie "Dynamiczne światło" wyłącza je wszystkie.

    updateDynamicLight() {

        const sources = [];


        if (this.settings.get('dynamicLight')) {

            // Lampa w ręce: wybrany na pasku blok, który świeci.

            const id = getBlockId(this.selectedBlock);

            const strength = this.selectedBlock ? getLightEmission(id) : 0;

            if (strength > 0) {

                this.handLight.position.copy(this.camera.position);
                this.handLight.color = getLightColor(id);
                this.handLight.strength = strength;

                sources.push(this.handLight);

            }


            sources.push(...this.meteorites.getLightSources());

            for (const orb of this.orbs) {
                sources.push(orb.light);
            }

        }


        this.dynamicLight.update(this.world, this.camera.position, sources);

    }


    // --------------------------------------------------------
    // KULE ŚWIATŁA (/demo kula) - krążą wokół miejsca, w którym
    // powstały, i świecą dynamicznym światłem.
    // --------------------------------------------------------

    // color - [r, g, b] (0-1)

    addOrb(color, seconds = 60) {

        const center = this.player.pos.clone();

        center.x += -Math.sin(this.player.yaw) * 5;
        center.z += -Math.cos(this.player.yaw) * 5;
        center.y += 1.5;


        const sprite = createGlowSprite(new THREE.Color().setRGB(...color, THREE.SRGBColorSpace), 1.2);

        this.scene.add(sprite);


        this.orbs.push({
            center,
            angle: Math.random() * Math.PI * 2,
            timeLeft: seconds,
            sprite,
            light: { position: center.clone(), color, strength: 14 }
        });

    }


    updateOrbs(dt) {

        for (const orb of this.orbs) {

            orb.timeLeft -= dt;

            orb.angle += dt * 0.8;

            orb.light.position.set(
                orb.center.x + Math.cos(orb.angle) * 4,
                orb.center.y + Math.sin(orb.angle * 2) * 0.8,
                orb.center.z + Math.sin(orb.angle) * 4
            );

            orb.sprite.position.copy(orb.light.position);

        }


        for (const orb of this.orbs.filter((orb) => orb.timeLeft <= 0)) {
            this.removeOrb(orb);
        }

    }


    removeOrb(orb) {

        orb.sprite.removeFromParent();
        orb.sprite.material.dispose();

        this.orbs = this.orbs.filter((other) => other !== orb);

    }


    removeOrbs() {

        for (const orb of [...this.orbs]) {
            this.removeOrb(orb);
        }

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


    // Zasięg widzenia naprawdę używany w grze: z ustawień, a w trybie
    // ziemniaka najwyżej POTATO_VIEW_DISTANCE.

    get viewDistance() {

        const viewDistance = this.settings.get('viewDistance');

        return this.settings.get('potato')
            ? Math.min(viewDistance, POTATO_VIEW_DISTANCE)
            : viewDistance;

    }


    // Gdzie kończą się prawdziwe chunki, a zaczyna daleki teren.

    updateFarRange() {

        const viewDistance = this.viewDistance;

        const outer = this.settings.get('farTerrain');

        // Zaokrąglone do 8 bloków, żeby nie wybierać kafelków co klatkę.

        const loaded = Math.floor(this.world.completeRadius() / 8) * 8;

        const inner = Math.max(16, Math.min(viewDistance, loaded));


        this.farTerrain.setRange(inner, outer);

        viewUniforms.uFarEnabled.value = this.farTerrain.active ? 1 : 0;
        viewUniforms.uFarInner.value = inner;
        viewUniforms.uFarOuter.value = Math.max(outer, inner);

    }


    // Stosuje ustawienia gracza. Wywoływane przy starcie
    // i po każdej zmianie w ekranie ustawień (key = co się zmieniło).

    applySettings(key = null) {

        const settings = this.settings;


        // Zasięg: prawdziwe chunki do viewDistance, dalej daleki teren.
        // Kamera świata musi sięgać do ostatnich wczytanych chunków.

        const viewDistance = this.viewDistance;

        const farTerrain = settings.get('farTerrain');

        this.camera.fov = settings.get('fov') * (this.fovBoost ?? 1);

        this.camera.far = viewDistance + 3 * CHUNK_SIZE + 64;

        this.camera.updateProjectionMatrix();


        this.updateFarRange();


        // Bez dalekiego terenu: mgła gęstnieje od ~45% zasięgu do
        // pełnego zasięgu i teren znika w kolorze nieba.

        this.scene.fog.far = viewDistance;
        this.scene.fog.near = viewDistance * 0.45;


        viewUniforms.uBrightness.value = settings.get('brightness') / 100;


        // Tryb ziemniaka: prostsze niebo, rzadszy daleki teren i kolor
        // mgły liczony w rogach ścian (config.js: POTATO_...).

        const potato = settings.get('potato');

        this.sky.setLowDetail(potato);

        this.farTerrain.setLowDetail(potato);

        setPotatoDefine([blockMaterial, plantMaterial], potato);


        // Model gracza: wierzchnia warstwa skórki, styl zgięć, tryb ziemniaka.

        if (this.model) {

            this.model.setOverlay(settings.get('skinOverlay'));

            this.model.setStyle(settings.get('jointStyle'));

            setPotatoDefine([...this.model.materials, this.model.heldMaterial, this.model.heldPlantMaterial], potato);

        }


        // Cienie w kątach są zapisane w meshach chunków - po zmianie
        // trzeba je przebudować (stopniowo, najbliższe najpierw).

        const ambientOcclusion = settings.get('ambientOcclusion') / 100;

        if (ambientOcclusion !== this.appliedAmbientOcclusion) {

            setAmbientOcclusion(ambientOcclusion);

            this.world.remeshAll();

            this.appliedAmbientOcclusion = ambientOcclusion;

        }


        this.player.mouseSensitivity =
            MOUSE_SENSITIVITY *
            settings.get('mouseSensitivity') / 100;

        this.player.invertMouse = settings.get('invertMouse');

    }


    // --------------------------------------------------------
    // PASEK BLOKÓW
    // --------------------------------------------------------

    // Blok w wybranym miejscu paska (null = puste miejsce).

    get selectedBlock() {

        return this.inventory.selectedItem?.type ?? null;

    }


    // Zmiana trybu gry ('adventure' / 'creative').

    setMode(mode) {

        if (!(mode in GAME_MODES)) {
            return false;
        }

        this.mode = mode;

        this.worldInfo.gameMode = mode;

        this.player.canFly = mode === 'creative';

        if (mode !== 'creative') {
            this.player.flying = false;
        }

        return true;

    }


    // Zniszczenie wskazanego bloku. W przygodzie blok (albo to, co
    // z niego zostaje - np. trawa daje ziemię) trafia do ekwipunku;
    // gdy nie ma na niego miejsca, blok zostaje. Roślina, która rosła
    // na zniszczonym bloku, też trafia do ekwipunku.

    breakTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        if (this.mode !== 'adventure') {
            return this.breaker.breakBlock(hit);
        }


        const { x, y, z, type } = hit.block;

        const drop = getDropType(type);

        if (drop && !this.inventory.canAdd(drop)) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }


        const plantAbove = isPlantId(this.world.getBlockId(x, y + 1, z))
            ? this.world.getBlock(x, y + 1, z)
            : null;


        if (!this.breaker.breakBlock(hit)) {
            return false;
        }

        if (drop) {
            this.inventory.add(drop);
        }

        if (plantAbove && this.world.getBlock(x, y + 1, z) === null) {

            const plantDrop = getDropType(plantAbove);

            if (plantDrop) {
                this.inventory.add(plantDrop);
            }

        }

        return true;

    }


    // "Weź blok" (środkowy przycisk myszy):
    // - blok jest na pasku -> wybieramy jego miejsce,
    // - jest w reszcie ekwipunku -> zamienia się z wybranym miejscem paska,
    // - nie ma go: w trybie kreatywnym trafia do pierwszego pustego
    //   miejsca paska (albo zastępuje wybrany), w przygodzie - nic.

    pickBlock(type) {

        const inventory = this.inventory;


        const onHotbar = inventory.find(type, 0, HOTBAR_SIZE);

        if (onHotbar !== -1) {

            inventory.selected = onHotbar;

            return;

        }


        const inMain = inventory.find(type, HOTBAR_SIZE);

        if (inMain !== -1) {

            const selected = inventory.selected;

            const item = inventory.get(selected);

            inventory.set(selected, inventory.get(inMain));
            inventory.set(inMain, item);

            return;

        }


        if (this.mode !== 'creative') {
            return;
        }


        const empty = inventory.slots.slice(0, HOTBAR_SIZE).indexOf(null);

        if (empty !== -1) {
            inventory.selected = empty;
        }

        inventory.set(inventory.selected, { type, count: 1 });

    }

    // --------------------------------------------------------

    // Promień wczytywania chunków wokół gracza (w chunkach):
    // tyle, żeby krawędź widocznego terenu kryła się we mgle.
    // +2, bo najdalszy pierścień wczytanych chunków jest niewidoczny
    // (czeka na sąsiadów - patrz World.js).

    getLoadRadius() {

        return Math.ceil(
            this.viewDistance / CHUNK_SIZE
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

        this.meteorites.dispose();

        this.removeOrbs();

        this.dynamicLight.dispose();

        this.farTerrain.dispose();

        this.model.dispose();

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


        // Klatki na sekundę i daleki teren.

        const summary = this.perf?.summary(1);

        const far = this.farTerrain.stats();

        const performanceInfo =
            `FPS: ${summary ? Math.round(summary.fps) : '--'}` +
            `${summary ? ` (${summary.frameMs.toFixed(1)} ms)` : ''} | ` +
            `Daleki teren: ${far.active ? `${far.shown} kafelków${far.missing ? `, buduje się ${far.missing}` : ''}` : 'wył.'}`;


        // Zaćmienie słońca (tylko gdy trwa).

        const eclipse = this.sky.state.eclipse;

        const eclipseInfo = eclipse > 0
            ? ` | Zaćmienie: ${Math.round(eclipse * 100)}%${eclipse >= 1 ? ' (pełne!)' : ''}`
            : '';


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
            `Księżyc: ${this.sky.celestial.moonPhaseName}${eclipseInfo}<br>` +

            `${performanceInfo}<br>` +

            `Na ziemi: ${player.onGround ? 'tak' : 'nie'}` +
            `${player.crouching ? ' | kuca' : ''}${player.sprinting ? ' | biegnie' : ''} | ` +
            `Światło: ${describeLight(light)}<br>` +

            `Kamera: ${CAMERA_TEXTS[this.cameraMode]} | Animacja: chód ${Math.round(this.animator.move * 100)}%, ` +
            `bieg ${Math.round(this.animator.run * 100)}%, kucanie ${Math.round(this.animator.crouch * 100)}%, ` +
            `powietrze ${Math.round(this.animator.air * 100)}%<br>` +

            `Tryb: ${GAME_MODES[this.mode]}${player.flying ? ' (lata)' : ''} | ` +
            `Wybrany blok: ${selected ? `${getBlockLabel(this.selectedBlock)} (${this.selectedBlock})` : 'brak'}<br><br>` +

            `${targetInfo}<br><br>` +

            `1-9 / kółko - wybór bloku | środkowy przycisk - weź blok | E - ekwipunek<br>` +

            `LPM - zniszcz | PPM - postaw<br>` +

            `WASD - ruch | Spacja - skok | Shift - kucanie | 2× W albo R - bieg<br>` +
            `Mysz - kamera | F5 - widok | ESC - pauza | F3 - debug | [ ] - czas ±1 h<br>` +

            `T - czat | /pomoc - komendy` +

            `<br><br>${this.saver.getStatus()}`;

    }

}
