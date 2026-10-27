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
    getDropType,
    getBlockSound,
    getHarvest,
    getLoot,
    getStrip,
    getBreakTime,
    isPlantId,
    getAttach,
    ATTACH_OFFSETS
} from '../blocks/BlockRegistry.js';
import { getItemLabel, getPlacedBlock, getTool, itemExists } from '../items/ItemRegistry.js';
import { Inventory } from './Inventory.js';
import { PlantGrowth } from './PlantGrowth.js';
import { WaterEffects } from './WaterEffects.js';
import { DynamicLight } from '../world/DynamicLight.js';
import { FarTerrain, setFarTerrainShadows } from '../world/FarTerrain.js';
import { setAmbientOcclusion, setFastLeaves } from '../rendering/ChunkMesher.js';
import { viewUniforms } from '../rendering/viewUniforms.js';
import { blockMaterial, plantMaterial, waterMaterial, leafMaterial, setPotatoDefine, setLeafMaterialFast, setShadowDefine } from '../rendering/BlockRenderData.js';
import { SunShadows } from '../rendering/Shadows.js';
import { LightShafts } from '../rendering/LightShafts.js';
import { BounceLight, bounceUniforms } from '../world/BounceLight.js';
import { Meteorites } from './Meteorites.js';
import { SpaceView } from '../space/SpaceView.js';
import { Skyfall } from '../space/Skyfall.js';
import { createGlowSprite } from '../rendering/Glow.js';
import { WorldSaver } from '../storage/WorldSaver.js';
import { lightToBrightness, describeLight } from '../world/Light.js';
import { WorldTime } from '../sky/WorldTime.js';
import { Sky } from '../sky/Sky.js';
import { skyUniforms } from '../sky/skyShader.js';
import { PlayerModel } from '../player/PlayerModel.js';
import { PlayerAnimator } from '../player/PlayerAnimator.js';
import { FirstPersonHand } from '../player/FirstPersonHand.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { BlockDebris } from '../rendering/BlockDebris.js';
import { BlockCracks } from '../interaction/BlockCracks.js';
import { COLOR_LEVEL } from '../world/Light.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    START_LOAD_RADIUS,
    POTATO_VIEW_DISTANCE,
    MOUSE_SENSITIVITY,
    HOTBAR_SIZE,
    SPRINT_FOV_FACTOR,
    CHUNK_HEIGHT,
    MINING_HIT_SECONDS,
    MINING_DELAY_SECONDS,
    CREATIVE_REPEAT_SECONDS,
    VIEW_BOB_HEIGHT,
    LAND_DIP_SPEED,
    LAND_DIP_MAX,
    SHADOW_INDOOR_DARKNESS,
    SHAFT_BRIGHTNESS,
    SHAFT_DENSITY_OUTSIDE,
    SHAFT_DENSITY_INSIDE,
    SHAFT_FAR_REACH,
    SHADOW_SUN_BOOST,
    BOUNCE_STRENGTH,
    BOUNCE_OUTDOOR
} from '../config.js';


// Ile bloków nad światem (nad CHUNK_HEIGHT) jeszcze widać prawdziwe
// chunki pod sobą - wyżej sam daleki teren (i kula Ziemi).

const HIGH_VIEW = 1100;


function smoothstep(a, b, x) {

    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));

    return t * t * (3 - 2 * t);

}


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

        // Spadanie z kosmosu jak meteoryt: ogień, wstrząsy, krater.

        this.skyfall = new Skyfall(this);

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

        // Księga osiągnięć (wspólna dla wszystkich światów - ustawia
        // ją main.js; bez niej, np. w testach, osiągnięć nie ma).

        this.achievements = null;

        // Gra na ekranie dotykowym (telefon, tablet - ustawia main.js).

        this.touchMode = false;

        // Aplikacja na telefon: 'android' (main.js), null - przeglądarka
        // albo komputer.

        this.nativeApp = null;

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


        // Rosnące rośliny (krzaki owocowe).

        this.plantGrowth = new PlantGrowth(this.world);

        this.plantGrowth.onTreeGrown = (species) => this.achieve('treeGrown', { species });

        // Woda wokół gracza: widok spod wody, plusk, fale (WaterEffects.js).

        this.water = new WaterEffects(this);


        // Daleki teren za zasięgiem widzenia (własna scena, oświetlona
        // tym samym niebem).

        this.farTerrain = new FarTerrain(this.world);

        this.sky.attachLights(this.farTerrain.scene);


        // Pikselowe cienie słońca i księżyca (mapa cieni przerysowywana,
        // gdy zmienią się chunki w jej zasięgu) i promienie światła
        // w powietrzu (src/rendering/Shadows.js, LightShafts.js).

        this.shadows = new SunShadows(renderer);

        // Światło odbite od oświetlonych słońcem ścian (BounceLight.js).

        this.bounce = new BounceLight();

        this.world.onMeshChanged = (chunk) => {

            this.shadows.markChunk(chunk);

            this.bounce.markChunk(chunk);

        };

        this.lightShafts = new LightShafts(renderer);

        this.shaftColor = new THREE.Color();

        // Czy słońce dochodzi do gracza (0-1, płynnie) - model, ręka,
        // osiągnięcia.

        this.sunVisibility = 1;

        // Światło odbite w miejscu gracza (model, ręka).

        this.modelBounce = new THREE.Vector3();
        this.bounceTarget = new THREE.Vector3();


        // Kosmos (sekret): z wysoka czarne niebo, planety i kula Ziemi
        // (src/space/SpaceView.js).

        this.spaceView = new SpaceView(this);


        // Cienie w kątach z ustawień - zanim powstaną pierwsze meshe.

        this.appliedAmbientOcclusion = settings.get('ambientOcclusion') / 100;

        setAmbientOcclusion(this.appliedAmbientOcclusion);


        // Szybkie albo ładne liście - też przed pierwszymi meshami.

        this.appliedFastLeaves = settings.get('potato') || !settings.get('fancyLeaves');

        setFastLeaves(this.appliedFastLeaves);

        setLeafMaterialFast(this.appliedFastLeaves);


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

        // Ręka (i to, co w niej) w widoku z oczu - osobna scena,
        // rysowana na wierzchu (src/player/FirstPersonHand.js).

        this.hand = new FirstPersonHand(this.sky);

        this.hand.resize(this.camera.aspect);

        // Kamera na chwilę w dół po upadku (bloki).
        this.landDip = 0;

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


        // Kopanie: pęknięcia kopanego bloku (przygoda) i odłamki.
        //   mining - { x, y, z, type, progress 0-1, hit (s do następnego
        //            uderzenia) } albo null,
        //   miningDelay - przerwa po zniszczonym bloku (przygoda),
        //   breakRepeat - kiedy następny blok przy trzymanym LPM (kreatywny).

        this.cracks = new BlockCracks(this.scene);

        this.debris = new BlockDebris(this.scene, this.world);

        this.mining = null;

        this.miningDelay = 0;

        this.breakRepeat = 0;


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


        // Dźwięk (audio/SoundManager.js) - ustawia main.js; bez niego
        // gra działa po cichu. Kroki: przebyta droga od ostatniego kroku.

        this.sounds = null;

        this.stepDistance = 0;
        this.stepFrom = new THREE.Vector3();
        this.swimDistance = 0;


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

        this.updateFootsteps();


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

        // Trzymany LPM: w przygodzie kopie (blok pęka i znika po czasie
        // kopania), w kreatywnym niszczy kolejne bloki co chwilę.

        const breakHeld = input.isMouseDown(0);


        // PPM siekierą na pniu - okorowanie.

        const stripping =
            placePressed &&
            getTool(this.selectedBlock) === 'axe' &&
            this.currentHit?.hit &&
            getStrip(this.currentHit.block.type) !== null;


        // PPM na krzaku z owocami zbiera owoce (z Shiftem i czymś
        // w ręce - zwyczajnie stawia obok). Tak samo żywica z pnia
        // sosny i kwiaty z kwitnącej lipy.

        const harvesting =
            placePressed &&
            !stripping &&
            !(this.player.crouching && this.selectedBlock) &&
            this.currentHit?.hit &&
            getHarvest(this.currentHit.block.type) !== null;


        // Machnięcie ręką przy każdym kliknięciu (jak w Minecrafcie).

        if (breakPressed || (placePressed && (this.selectedBlock || harvesting))) {
            this.swingArm();
        }


        const mined = this.updateMining(dt, breakPressed, breakHeld);

        if (breakPressed || mined) {

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        // PPM - tylko gdy w tej samej klatce nie było LPM.

        const placing = !breakPressed;

        if (placing && stripping) {

            this.stripTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placing && harvesting) {

            this.harvestTarget(this.currentHit);

            this.currentHit =
                this.raycast.castFromCamera(this.camera);

        }

        else if (placing && placePressed) {

            // Puste miejsce na pasku - nie ma czego postawić. Owoc
            // stawia sadzonkę (getPlacedBlock), inny przedmiot - nic.

            const type = this.selectedBlock;

            const block = type ? getPlacedBlock(type) : null;

            if (block) {

                const target = this.placer.targetOf(this.currentHit);

                const placed = this.placer.placeBlock(
                    this.currentHit,
                    block
                );

                if (placed) {

                    this.playBlockSound('place', block, target);

                    this.achieve('blockPlaced', { type: block });

                    // Owoc postawiony jako sadzonka - posadzony.

                    if (block !== type) {
                        this.achieve('planted', { type: block, item: type });
                    }

                }

                // W przygodzie postawiony blok (posadzony owoc) znika ze stosu.

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
            this.pickBlock(getBlockDefinition(this.currentHit.block.type)?.pick ?? this.currentHit.block.type);
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


        // Kosmos: jak wysoko jesteśmy (niebo, kula Ziemi) - przed niebem.

        this.spaceView.update(dt, this.camera.position);

        this.updateCameraRange();


        // Autozapis co jakiś czas.

        this.saver.update(dt);


        // Z dalekim terenem słońce zachodzi za jego brzegiem - z wysoka
        // ten brzeg jest trochę pod linią poziomu.

        this.sky.horizonDip = this.farTerrain.active
            ? Math.min(0, (this.world.generator.baseHeight + 1 - this.camera.position.y) / this.farTerrain.outer)
            : 0;

        // Z kulą Ziemi (kosmos) horyzont jest dalej - tam, gdzie kończy się kula.

        if (this.spaceView.horizonDip < 0) {
            this.sky.horizonDip = Math.min(this.sky.horizonDip, this.spaceView.horizonDip);
        }

        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());

        this.updateFog(dt);

        // Cienie: które światło je rzuca i czy przerysować mapę.

        this.shadows.update(dt, this.sky, this.camera.position);

        // Z cieniami słońce mocniej, światło nieba słabiej (config.js).

        this.sky.applyShadowContrast(this.shadows.active ? this.shadows.strength : 0);

        this.updateBounce();


        // Spadanie z kosmosu (ogień, krater), meteoryty, rosnące krzaki,
        // kule światła i dynamiczne światło.

        this.skyfall.update(dt);

        this.meteorites.update(dt);

        // Odłamki niszczonych bloków.

        this.debris.update(dt);

        // Osiągnięcia sprawdzane co chwilę (wysokość, nurkowanie...).

        this.achievements?.update(dt);

        this.plantGrowth.update(dt);

        this.updateOrbs(dt);

        this.updateDynamicLight();


        this.highlight.update(this.currentHit);


        // Widok z trzeciej osoby (F5), model gracza i pole widzenia przy biegu.

        if (input.consumeKeyPress('F5')) {
            this.cycleCameraMode();
        }

        this.updateModel(dt);

        this.updateView();

        this.water.update(dt);

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
            swimming: player.swimming,
            yaw: player.yaw,
            pitch: player.pitch,
            landed: player.landed
        });

        this.model.setPose(pose);

        this.model.place(player.pos, this.animator.bodyYaw, this.animator.previewLift);

        this.model.setHeldBlock(this.selectedBlock);


        // Ręka w widoku z oczu i kamera w dół po upadku.

        this.hand.setHeld(this.selectedBlock);

        this.hand.update(dt, player);

        if (player.landed > LAND_DIP_SPEED) {
            this.landDip = Math.max(this.landDip, Math.min(LAND_DIP_MAX, (player.landed - LAND_DIP_SPEED) * 0.02));
        }

        this.landDip *= Math.exp(-dt * 7);


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


        // Czy słońce (albo księżyc) świeci na gracza - promień w jego
        // stronę przez bloki. Z cieniami model i ręka ciemnieją w cieniu
        // (tak samo jak bloki obok).

        const shadows = this.shadows;

        const visible = SunShadows.sunVisibility(
            this.world,
            player.pos.x,
            player.pos.y + 1.2,
            player.pos.z,
            shadows.direction
        );

        this.sunVisibility += (visible - this.sunVisibility) * rate;

        const strength = shadows.active ? shadows.strength : 0;

        modelLight.uModelSun.value =
            this.modelSky ** 2.2 + (this.sunVisibility - this.modelSky ** 2.2) * strength;

        modelLight.uModelAmbient.value = this.modelSky ** (2.2 + SHADOW_INDOOR_DARKNESS * strength);

        // Światło odbite w miejscu gracza (płynnie).

        const bounce = this.bounce.enabled ? this.bounce.sample(player.pos.x, player.pos.y + 1.2, player.pos.z) : [0, 0, 0];

        const bounceColor = bounceUniforms.uBounceColor.value;

        const outdoor = 1 - BOUNCE_OUTDOOR * this.modelSky ** 2.2;

        this.modelBounce.lerp(
            this.bounceTarget.set(bounce[0] * bounceColor.r * outdoor, bounce[1] * bounceColor.g * outdoor, bounce[2] * bounceColor.b * outdoor),
            rate
        );

        modelLight.uModelBounce.value.copy(this.modelBounce);

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

        // Bieg i spadanie z kosmosu (ogień) poszerzają pole widzenia.

        const target = (this.player.sprinting ? SPRINT_FOV_FACTOR : 1) * this.skyfall.fovFactor;

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


        // Mapa cieni słońca (gdy trzeba) i cień gracza - przed światem.

        this.shadows.render(this.world, this.camera.position, this.model, this.scene, this.viewDistance, this.farTerrain);


        renderer.clear();


        // Z trzeciej osoby kamera na czas rysowania przesuwa się za gracza
        // (celowanie i reszta gry dalej liczą się z jego oczu).

        const camera = this.camera;

        const shake = Math.max(this.meteorites.shake, this.skyfall.shake);

        // Kołysanie widoku z oczu przy chodzeniu (i w dół po upadku).

        const bob = !this.view && this.settings.get('viewBobbing') ? this.hand.bob : null;

        const bobbing = bob !== null && (bob.amount > 0.01 || this.landDip > 0.002);

        const saved = this.view || shake > 0.001 || bobbing
            ? { position: camera.position.clone(), rotation: camera.rotation.clone() }
            : null;


        // Kołysanie: na boki i w dół (co krok), lekki przechył - tylko
        // obraz (celowanie i ruch liczą się z oczu gracza).

        if (bobbing) {

            const a = bob.amount;

            const side = Math.sin(bob.phase) * VIEW_BOB_HEIGHT * 0.5 * a;

            const down = Math.abs(Math.cos(bob.phase)) * VIEW_BOB_HEIGHT * a + this.landDip;

            camera.position.add((this.bobOffset ??= new THREE.Vector3()).set(side, -down, 0).applyQuaternion(camera.quaternion));

            camera.rotation.z += Math.sin(bob.phase) * 0.008 * a;

            camera.rotation.x += Math.abs(Math.cos(bob.phase)) * 0.004 * a;

            camera.updateMatrixWorld();

        }

        if (this.view) {

            camera.position.copy(this.view.position);

            camera.rotation.set(this.view.pitch, this.view.yaw, 0, 'YXZ');

            camera.updateMatrixWorld();

        }


        // Wstrząs przy uderzeniu meteorytu (tylko obraz - celowanie
        // i ruch gracza się nie zmieniają).

        if (shake > 0.001) {

            const t = performance.now() / 1000;

            const amount = shake * 0.03;

            camera.rotation.x += amount * (Math.sin(t * 47) * 0.6 + Math.sin(t * 29.3) * 0.4);
            camera.rotation.y += amount * (Math.sin(t * 39.7 + 1) * 0.6 + Math.sin(t * 23.1) * 0.4);
            camera.rotation.z += amount * 0.5 * Math.sin(t * 33.3 + 2);

            camera.position.y += shake * 0.08 * Math.sin(t * 53);

            camera.updateMatrixWorld();

        }


        // Pod wodą zamiast nieba i dalekiego terenu - tło w kolorze wody
        // (bliskie bloki i tak znikają w niebieskiej mgle).

        if (this.water.underwater) {

            renderer.getClearColor(this.clearColor ??= new THREE.Color());

            renderer.setClearColor(viewUniforms.uUnderwaterColor.value);

            renderer.clear();

            renderer.setClearColor(this.clearColor);

        }
        else {

            this.sky.render(renderer, camera);

            renderer.clearDepth();

            // Z wysoka: kula Ziemi pod dalekim terenem, chmury nad nim.

            this.spaceView.renderBehind(renderer, camera);

            this.farTerrain.render(renderer, camera);

            this.spaceView.renderFront(renderer, camera);

            renderer.clearDepth();

        }

        renderer.render(this.scene, camera);


        // Promienie światła w powietrzu (na świecie, pod ręką).

        this.renderLightShafts(camera);


        // Ręka w widoku z oczu - na wierzchu (nigdy nie wchodzi w ścianę).

        if (!this.view && this.settings.get('showHand')) {
            this.hand.render(renderer, camera);
        }


        if (saved) {

            camera.position.copy(saved.position);

            camera.rotation.copy(saved.rotation);

            camera.updateMatrixWorld();

        }

    }


    // Światło odbite (BounceLight.js): liczy się w tle (kawałek na
    // klatkę), a jego kolor i siłę - kolor światła, które rzuca cienie,
    // razy siłę cieni - dostaje shader.

    updateBounce() {

        const shadows = this.shadows;

        const enabled = this.bounceEnabled && shadows.active;

        this.bounce.update(this.world, this.camera.position, shadows.direction, shadows.light, enabled);

        const color = bounceUniforms.uBounceColor.value;

        if (!enabled) {

            color.setRGB(0, 0, 0);

            return;

        }

        const state = this.sky.state;

        const sun = shadows.light === 'sun';

        color.copy(sun ? state.sunLightColor : state.moonLightColor)
            .multiplyScalar((sun ? state.sunLightIntensity : state.moonLightIntensity) * shadows.strength * SHADOW_SUN_BOOST * BOUNCE_STRENGTH);

    }


    // Promienie światła (LightShafts.js): kolor światła, które rzuca
    // cienie, mocniejsze o wschodzie i zachodzie i w ciemnym miejscu
    // (w pokoju z oknem snop jest wyraźny, na dworze - lekka mgiełka).

    renderLightShafts(camera) {

        const shadows = this.shadows;

        if (!this.shaftsEnabled || !shadows.active || this.water.underwater) {
            return;
        }

        const state = this.sky.state;

        const sun = shadows.light === 'sun';

        const intensity = sun ? state.sunLightIntensity : state.moonLightIntensity * 1.6;

        const lowSun = 1 + 0.9 * (1 - smoothstep(0.06, 0.4, shadows.direction.y));

        const amount = intensity * shadows.strength * lowSun * SHAFT_BRIGHTNESS;

        if (amount < 0.003) {
            return;
        }

        this.shaftColor.copy(sun ? state.sunLightColor : state.moonLightColor).multiplyScalar(amount);

        // Gęstość powietrza: w ciemnym miejscu (mało światła nieba przy
        // głowie - fogBrightness) snopy są dużo wyraźniejsze. Cień pod
        // drzewami to jeszcze "na dworze" (inaczej las tonąłby w blasku).

        const inside = smoothstep(0.3, 0.8, 1 - this.fogBrightness);

        const density = SHAFT_DENSITY_OUTSIDE + (SHAFT_DENSITY_INSIDE - SHAFT_DENSITY_OUTSIDE) * inside;

        // Na dworze świeci głównie powietrze w stronę słońca (blask wokół
        // niego), w ciemnym pokoju snop widać też z boku.

        const isotropic = 0.12 + 0.5 * inside;

        // Z daleką mapą cieni promienie sięgają dalej (smugi cienia gór
        // o zachodzie).

        const reach = shadows.farValid ? SHAFT_FAR_REACH : shadows.radius;

        this.lightShafts.render(camera, this.world, shadows, this.shaftColor, density, isotropic, reach);

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

            if (this.skyfall.light.strength > 0) {
                sources.push(this.skyfall.light);
            }

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

        let inner = Math.max(16, Math.min(viewDistance, loaded));


        // Bardzo wysoko chunków już nie widać (updateCameraRange) -
        // daleki teren jest wtedy także pod graczem (z zapasem, żeby
        // nie przełączać tam i z powrotem na granicy).

        const height = this.camera.position.y - CHUNK_HEIGHT;

        this.farUnderPlayer = this.farUnderPlayer ? height > HIGH_VIEW - 100 : height > HIGH_VIEW;

        if (this.farUnderPlayer) {
            inner = 16;
        }


        this.farTerrain.setRange(inner, outer);

        viewUniforms.uFarEnabled.value = this.farTerrain.active ? 1 : 0;
        viewUniforms.uFarInner.value = inner;
        viewUniforms.uFarOuter.value = Math.max(outer, inner);

    }


    // Z wysoka kamera świata sięga dalej, żeby chunki pod graczem
    // nie znikały (do HIGH_VIEW bloków nad światem; wyżej jest już
    // tylko daleki teren i kula Ziemi). Zaokrąglone do 64 bloków.
    // Bez dalekiego terenu nie ma po co - chunki i tak znikają we mgle.

    updateCameraRange() {

        const base = this.cameraFarBase;

        if (!base) {
            return;
        }

        const height = this.farTerrain.active
            ? Math.min(HIGH_VIEW + 200, Math.max(0, this.camera.position.y - CHUNK_HEIGHT))
            : 0;

        const far = base + Math.ceil(height * 1.15 / 64) * 64;

        if (far !== this.camera.far) {

            this.camera.far = far;

            this.camera.updateProjectionMatrix();

        }

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

        this.cameraFarBase = viewDistance + 3 * CHUNK_SIZE + 64;

        this.camera.far = this.cameraFarBase;

        this.camera.updateProjectionMatrix();

        this.updateCameraRange();


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

        this.farTerrain.setDetail(settings.get('farDetail'), potato);

        this.spaceView.setLowDetail(potato);

        setPotatoDefine([blockMaterial, plantMaterial, waterMaterial, leafMaterial], potato);


        // Cienie słońca i promienie światła (nie w trybie ziemniaka).

        this.shadows.setQuality(potato ? 0 : settings.get('shadows'));

        setShadowDefine([blockMaterial, plantMaterial, waterMaterial, leafMaterial], this.shadows.enabled, this.shadows.hasFar);

        setFarTerrainShadows(this.shadows.hasFar);

        modelLight.uModelShadows.value = this.shadows.enabled ? 1 : 0;

        this.shaftsEnabled = !potato && settings.get('lightShafts');

        this.bounceEnabled = !potato && settings.get('bounceLight');


        // Model gracza: wierzchnia warstwa skórki, styl zgięć, tryb ziemniaka.

        if (this.model) {

            this.model.setOverlay(settings.get('skinOverlay'));

            this.model.setStyle(settings.get('jointStyle'));

            setPotatoDefine([...this.model.materials, this.model.heldMaterial, this.model.heldPlantMaterial], potato);

        }


        // Ręka w widoku z oczu: tryb ziemniaka, rękaw (wierzchnia warstwa).

        if (this.hand) {

            this.hand.setLowDetail(potato);

            this.hand.setOverlay(settings.get('skinOverlay'));

        }


        // Cienie w kątach są zapisane w meshach chunków - po zmianie
        // trzeba je przebudować (stopniowo, najbliższe najpierw).
        // Tak samo szybkie liście (bez ścian w środku korony) - te są
        // też zawsze w trybie ziemniaka.

        const ambientOcclusion = settings.get('ambientOcclusion') / 100;

        const fastLeaves = potato || !settings.get('fancyLeaves');

        if (ambientOcclusion !== this.appliedAmbientOcclusion || fastLeaves !== this.appliedFastLeaves) {

            setAmbientOcclusion(ambientOcclusion);

            setFastLeaves(fastLeaves);

            setLeafMaterialFast(fastLeaves);

            this.world.remeshAll();

            this.appliedAmbientOcclusion = ambientOcclusion;

            this.appliedFastLeaves = fastLeaves;

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


    // Zdarzenie dla księgi osiągnięć (src/achievements/), np.
    // achieve('blockBroken', { type: 'stone' }). Bez księgi (testy) - nic.

    achieve(name, data = {}) {

        this.achievements?.event(name, data);

    }


    // Machnięcie ręką: model gracza (z trzeciej osoby) i ręka w widoku
    // z oczu. seconds - ile trwa machnięcie ręki (przy kopaniu tyle, co
    // jedno uderzenie - kolejne machnięcia łączą się w płynny ruch).

    swingArm(seconds) {

        this.animator.swing();

        this.hand.swing(seconds);

    }


    // KOPANIE. Zwraca true, gdy w tej klatce zniknął blok.
    //
    // Kreatywny: kliknięcie niszczy blok od razu, trzymany LPM - kolejne
    // bloki co CREATIVE_REPEAT_SECONDS.
    // Przygoda: trzeba trzymać LPM na bloku przez czas kopania
    // (getBreakTime; pasujące narzędzie - siekiera, kilof, łopata -
    // szybciej). Blok pęka (BlockCracks), co MINING_HIT_SECONDS ręka
    // uderza: stuk i odłamki. Zmiana celu albo puszczenie LPM - od nowa.
    // Rośliny znikają od razu.

    updateMining(dt, pressed, held) {

        const hit = this.currentHit?.hit ? this.currentHit : null;


        if (this.mode !== 'adventure') {

            this.stopMining();

            if (pressed) {

                this.breakRepeat = CREATIVE_REPEAT_SECONDS;

                return this.breakTarget(hit);

            }

            if (held && hit) {

                this.breakRepeat -= dt;

                if (this.breakRepeat <= 0) {

                    this.breakRepeat = CREATIVE_REPEAT_SECONDS;

                    this.swingArm(Math.max(CREATIVE_REPEAT_SECONDS, 0.2));

                    return this.breakTarget(hit);

                }

            }

            return false;

        }


        this.miningDelay = Math.max(0, this.miningDelay - dt);

        if (!(pressed || held) || !hit) {

            // Puszczony LPM tuż przed rozbiciem (osiągnięcie).

            if (this.mining && !held && this.mining.progress >= 0.5) {
                this.achieve('miningAbandoned', { type: this.mining.type, progress: this.mining.progress });
            }

            this.stopMining();

            return false;

        }


        // Przerwa po rozbitym bloku (albo po napisie "Ekwipunek pełny" -
        // żeby trzymany LPM nie powtarzał go w każdej klatce).

        if (this.miningDelay > 0) {

            this.cracks.update(null, 0);

            return false;

        }


        const { x, y, z, type } = hit.block;

        let mining = this.mining;

        if (!mining || mining.x !== x || mining.y !== y || mining.z !== z || mining.type !== type) {

            // Pełny ekwipunek - nie ma sensu kopać (blok i tak by został).

            const drop = getDropType(type);

            if (drop && !this.inventory.canAdd(drop)) {

                this.onNotice?.('Ekwipunek pełny');

                this.stopMining();

                this.miningDelay = 1;

                return false;

            }

            mining = this.mining = { x, y, z, type, progress: 0, hit: 0 };

        }


        const time = getBreakTime(type, getTool(this.selectedBlock));

        mining.progress = time <= 0 ? 1 : mining.progress + dt / time;


        // Uderzenie: machnięcie, stuk (dźwięk kroku po tym bloku), odłamki.

        mining.hit -= dt;

        if (mining.hit <= 0 && mining.progress < 1) {

            mining.hit = MINING_HIT_SECONDS;

            if (!pressed) {
                this.swingArm(MINING_HIT_SECONDS);
            }

            this.playBlockSound('step', type, hit.block, 0.7);

            this.debris.chips(type, x, y, z, hit.normal);

        }


        if (mining.progress >= 1) {

            const broken = this.breakTarget(hit);

            this.stopMining();

            // Pełny ekwipunek - blok zostaje; nie próbujemy co klatkę.

            this.miningDelay = broken ? MINING_DELAY_SECONDS : 1;

            return broken;

        }

        this.cracks.update(mining, mining.progress);

        return false;

    }


    stopMining() {

        this.mining = null;

        this.cracks.update(null, 0);

    }


    // Zniszczenie wskazanego bloku. W przygodzie blok (albo to, co
    // z niego zostaje - np. trawa daje ziemię) trafia do ekwipunku;
    // gdy nie mieści się cała paczka łupów (także owoce), blok zostaje.
    // Roślina i dekoracje, które tracą oparcie, też trafiają do ekwipunku.

    breakTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        if (this.mode !== 'adventure') {

            const broken = this.breaker.breakBlock(hit);

            if (broken) {

                this.playBlockSound('break', hit.block.type, hit.block);

                this.debris.burst(hit.block.type, hit.block.x, hit.block.y, hit.block.z);

                this.achieve('blockBroken', { type: hit.block.type, mode: this.mode, tool: getTool(this.selectedBlock) });

            }

            return broken;

        }


        const { x, y, z, type } = hit.block;

        const drops = this.breakDrops(type);

        // Te same sąsiednie bloki, które usuwa World.setBlock:
        // roślina nad podłożem i dekoracje przylegające do podpory.
        // Mapa po pozycji pilnuje, żeby żaden blok nie dał łupu dwa razy.
        const supported = new Map();

        const rememberSupported = (sx, sy, sz) => {
            const key = `${sx},${sy},${sz}`;

            if (!supported.has(key)) {
                supported.set(key, {
                    x: sx, y: sy, z: sz,
                    drops: this.breakDrops(this.world.getBlock(sx, sy, sz))
                });
            }
        };

        if (isPlantId(this.world.getBlockId(x, y + 1, z))) {
            rememberSupported(x, y + 1, z);
        }

        for (let attach = 1; attach < ATTACH_OFFSETS.length; attach++) {
            const [dx, dy, dz] = ATTACH_OFFSETS[attach];
            const sx = x - dx, sy = y - dy, sz = z - dz;

            if (getAttach(this.world.getBlockId(sx, sy, sz)) === attach) {
                rememberSupported(sx, sy, sz);
            }
        }

        // Losujemy raz, przed usunięciem bloku. Osobne canAdd dla każdego
        // łupu nie wystarczyłyby: dwa rodzaje mogłyby liczyć to samo miejsce.
        const supportedDrops = [...supported.values()].flatMap((block) => block.drops);
        const tool = getTool(this.selectedBlock);

        if (!this.inventory.canAddAll([...drops, ...supportedDrops])) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }


        if (!this.breaker.breakBlock(hit)) {
            return false;
        }

        for (const block of supported.values()) {
            if (this.world.getBlock(block.x, block.y, block.z) === null) {
                drops.push(...block.drops);
            }
        }

        for (const { type: item, count } of drops) {
            this.inventory.add(item, count);
        }

        this.playBlockSound('break', type, hit.block);

        this.debris.burst(type, x, y, z);

        this.achieve('blockBroken', { type, mode: this.mode, tool });

        return true;

    }


    // Cała paczka ze zniszczonego bloku, bez zmieniania ekwipunku.
    // Ten sam wynik służy do sprawdzenia miejsca i przyznania łupów.

    breakDrops(type) {

        const drops = [];
        const drop = getDropType(type);

        if (drop) {
            drops.push({ type: drop, count: 1 });
        }

        const harvest = getHarvest(type);

        if (harvest) {

            const [min, max] = harvest.count;
            const count = min + Math.floor(Math.random() * (max - min + 1));

            drops.push({ type: harvest.item, count });

        }

        for (const [item, chance] of getLoot(type)) {

            if (Math.random() < chance) {
                drops.push({ type: item, count: 1 });
            }

        }

        return drops;

    }


    // Okorowanie siekierą (PPM na pniu): pień zamienia się w okorowany,
    // z brzozy zostaje jeszcze kora (do ekwipunku - w obu trybach).

    stripTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        const { x, y, z, type } = hit.block;

        const strip = getStrip(type);

        if (!strip) {
            return false;
        }

        if (strip.item && !this.inventory.canAdd(strip.item)) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }

        if (!this.world.setBlock(x, y, z, strip.into)) {
            return false;
        }

        if (strip.item) {
            this.inventory.add(strip.item);
        }

        this.playBlockSound('break', strip.into, hit.block);

        this.achieve('stripped', { type, into: strip.into, item: strip.item });

        return true;

    }


    // Owoce z rośliny (zbiór albo zniszczony krzak) do ekwipunku.
    // Zwraca, ile sztuk się zmieściło.

    addHarvest(type) {

        const harvest = getHarvest(type);

        if (!harvest) {
            return 0;
        }

        const [min, max] = harvest.count;

        const count = min + Math.floor(Math.random() * (max - min + 1));

        return count - this.inventory.add(harvest.item, count);

    }


    // Zbiór (PPM na krzaku z owocami): owoce trafiają do ekwipunku
    // (w obu trybach), krzak wraca do etapu bez owoców i owocuje od
    // nowa (PlantGrowth.js). Pełny ekwipunek - nic się nie dzieje.

    harvestTarget(hit) {

        if (!hit || !hit.hit) {
            return false;
        }

        const { x, y, z, type } = hit.block;

        const harvest = getHarvest(type);

        if (!harvest) {
            return false;
        }

        if (!this.inventory.canAdd(harvest.item, harvest.count[1])) {

            this.onNotice?.('Ekwipunek pełny');

            return false;

        }

        if (!this.world.setBlock(x, y, z, harvest.becomes)) {
            return false;
        }

        const count = this.addHarvest(type);

        this.sounds?.play('harvest', {
            position: new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5)
        });

        this.achieve('harvested', { type, item: harvest.item });

        return count > 0;

    }


    // --------------------------------------------------------
    // DŹWIĘKI BLOKÓW I KROKÓW
    // --------------------------------------------------------

    // Dźwięk bloku (kind: 'step', 'place', 'break') w środku bloku
    // { x, y, z } albo "w głowie" (position = null).

    playBlockSound(kind, type, block = null, volume = 1) {

        const material = getBlockSound(type);

        if (!this.sounds || !material) {
            return;
        }

        const position = block
            ? new THREE.Vector3(block.x + 0.5, block.y + 0.5, block.z + 0.5)
            : null;

        this.sounds.play(`${kind}_${material}`, { position, volume });

    }


    // Kroki: co kawałek drogi po ziemi dźwięk bloku pod stopami
    // (kucanie - ciszej i rzadziej, bieg - głośniej i rzadziej), przez
    // trawę i kwiaty - jeszcze szelest. Po skoku / upadku - stuk
    // przy lądowaniu (tym głośniejszy, im mocniej).

    updateFootsteps() {

        const player = this.player;

        const moved = Math.hypot(player.pos.x - this.stepFrom.x, player.pos.z - this.stepFrom.z);

        const moved3 = player.pos.distanceTo(this.stepFrom);

        this.stepFrom.copy(player.pos);


        // Pływanie: co kawałek drogi (także w górę i w dół) ruch ramion
        // w wodzie - szybciej i głośniej z biegiem.

        if (player.swimming) {

            if (moved3 > 2) {
                return;
            }

            this.swimDistance += moved3;

            if (this.swimDistance >= (player.sprinting ? 2.2 : 1.5)) {

                this.swimDistance = 0;

                this.sounds?.play('water_swim', { volume: player.sprinting ? 0.9 : 0.6 });

            }

            return;

        }


        if (player.landed > 4 && !player.flying && player.submerged < 0.3) {

            this.playStep(Math.min(1, 0.3 + (player.landed - 4) / 14));

            this.stepDistance = 0;

            return;

        }


        // Teleport albo lot - bez kroków.

        if (!player.onGround || player.flying || moved > 2) {
            return;
        }


        const stride = player.crouching ? 0.9 : player.sprinting ? 2.1 : 1.6;

        this.stepDistance += moved;

        if (this.stepDistance >= stride) {

            this.stepDistance -= stride;

            this.playStep(player.crouching ? 0.35 : player.sprinting ? 0.8 : 0.6);

        }

    }


    playStep(volume) {

        if (!this.sounds) {
            return;
        }

        const type = this.blockUnderFeet();

        // W wodzie: chlupnięcie (w płytkiej wodzie słychać też dno).

        const water = this.player.submerged;

        if (water > 0.03) {
            this.sounds.play('water_wade', { volume: volume * (0.7 + water) });
        }

        if (type && water < 0.3) {
            this.playBlockSound('step', type, null, water > 0.03 ? volume * 0.5 : volume);
        }


        // Trawa, kwiaty, paprocie przy nogach szeleszczą.

        const p = this.player.pos;

        const plant = this.world.getBlockId(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z));

        if (isPlantId(plant)) {
            this.sounds.play('step_plant', { volume: volume * 0.7 });
        }

    }


    // Blok, na którym stoi gracz (środek stóp, a na krawędzi - jeden
    // z rogów).

    blockUnderFeet() {

        const p = this.player.pos;

        const y = Math.floor(p.y - 0.05);

        for (const [dx, dz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {

            const type = this.world.getBlock(Math.floor(p.x + dx), y, Math.floor(p.z + dz));

            if (type && this.world.isSolid(Math.floor(p.x + dx), y, Math.floor(p.z + dz))) {
                return type;
            }

        }

        return null;

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

        this.hand.resize(width / height);

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

        this.skyfall.dispose();

        this.water.dispose();

        this.removeOrbs();

        this.dynamicLight.dispose();

        this.farTerrain.dispose();

        this.spaceView.dispose();

        this.model.dispose();

        this.hand.dispose();

        this.cracks.dispose();

        this.debris.dispose();

        this.shadows.dispose();

        this.lightShafts.dispose();

        this.bounce.dispose();

        modelLight.uModelBounce.value.set(0, 0, 0);

        modelLight.uModelShadows.value = 0;

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


        const selected = itemExists(this.selectedBlock);


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


        // Cienie słońca.

        const shadows = this.shadows;

        const shadowInfo = shadows.enabled
            ? `Cienie: ${shadows.light === 'sun' ? 'słońce' : 'księżyc'} ${Math.round(Math.asin(Math.max(-1, Math.min(1, shadows.direction.y))) * 180 / Math.PI)}°, ` +
              `siła ${Math.round(shadows.strength * 100)}%, mapa ${shadows.size} px (${shadows.radius} bl.), przerysowana ${shadows.draws}×` +
              `${shadows.hasFar ? `, daleka ${shadows.farRadius} bl. ${shadows.farDraws}×` : ''}` +
              `${this.shaftsEnabled ? ' | promienie' : ''} | słońce na graczu ${Math.round(this.sunVisibility * 100)}%`
            : `Cienie: wył.${shadows.supported ? '' : ' (brak WebGL2)'}`;


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

            `${shadowInfo}<br>` +

            `Na ziemi: ${player.onGround ? 'tak' : 'nie'}` +
            `${player.submerged > 0 ? ` | w wodzie ${Math.round(player.submerged * 100)}%${player.swimming ? ', pływa' : ''}${this.water.underwater ? ', pod wodą' : ''}` : ''}` +
            `${player.crouching ? ' | kuca' : ''}${player.sprinting ? ' | biegnie' : ''} | ` +
            `Światło: ${describeLight(light)}<br>` +

            `Kamera: ${CAMERA_TEXTS[this.cameraMode]} | Animacja: chód ${Math.round(this.animator.move * 100)}%, ` +
            `bieg ${Math.round(this.animator.run * 100)}%, kucanie ${Math.round(this.animator.crouch * 100)}%, ` +
            `powietrze ${Math.round(this.animator.air * 100)}%<br>` +

            `Tryb: ${GAME_MODES[this.mode]}${player.flying ? ' (lata)' : ''} | ` +
            `W ręce: ${selected ? `${getItemLabel(this.selectedBlock)} (${this.selectedBlock})` : 'nic'}<br><br>` +

            `${targetInfo}<br><br>` +

            `1-9 / kółko - wybór bloku | środkowy przycisk - weź blok | E - ekwipunek<br>` +

            `LPM - zniszcz | PPM - postaw / zbierz owoce<br>` +

            `WASD - ruch | Spacja - skok | Shift - kucanie | 2× W albo R - bieg<br>` +
            `Mysz - kamera | F5 - widok | ESC - pauza | F3 - debug | [ ] - czas ±1 h<br>` +

            `T - czat | /pomoc - komendy` +

            `<br><br>${this.saver.getStatus()}`;

    }

}
