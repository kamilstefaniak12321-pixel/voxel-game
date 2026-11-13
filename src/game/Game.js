import * as THREE from 'three';
import { fullTerrainDistance, FULL_TERRAIN_DISTANCE, TERRAIN_TRANSITION_START } from '../world/DistanceLod.js';

import { Campfires } from './Campfires.js';
import { GameInteraction } from './GameInteraction.js';
import { TorchRenderer } from '../rendering/TorchRenderer.js';
import { DoorRenderer } from '../rendering/DoorRenderer.js';
import { Chests } from './Chests.js';
import { CarpenterTables } from './CarpenterTables.js';
import { World } from '../world/World.js';
import { waitForTreeShowcase } from '../world/trees/TreeShowcase.js';
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
    getBlockSound,
    isPlantId
} from '../blocks/BlockRegistry.js';
import { getItemLabel, itemExists } from '../items/ItemRegistry.js';
import { Inventory } from './Inventory.js';
import { PlantGrowth } from './PlantGrowth.js';
import { PlantAnimations } from '../rendering/PlantAnimations.js';
import { Rafts } from './Rafts.js';
import { WaterEffects } from './WaterEffects.js';
import { DynamicLight } from '../world/DynamicLight.js';
import { FarTerrain, setFarTerrainShadows } from '../world/FarTerrain.js';
import { setAmbientOcclusion, setFastLeaves } from '../rendering/ChunkMesher.js';
import { viewUniforms } from '../rendering/viewUniforms.js';
import { updateAerialPerspective } from '../rendering/AtmosphereState.js';
import { blockMaterial, plantMaterial, waterMaterial, leafMaterial, setPotatoDefine, setLeafMaterialFast, setShadowDefine } from '../rendering/BlockRenderData.js';
import { SunShadows } from '../rendering/Shadows.js';
import { LightShafts } from '../rendering/LightShafts.js';
import { WorldOutput } from '../rendering/WorldOutput.js';
import { lightingUniforms, resetLightingDiagnostics } from '../rendering/LightingDiagnostics.js';
import { prewarmWaterMaterial, waterShaderVariantKey } from '../rendering/WaterMaterialWarmup.js';
import { BounceLight } from '../world/BounceLight.js';
import { applyMaterialLightingSettings, createBounceLightingState, updateBounceLightingState } from '../rendering/MaterialLighting.js';
import { Meteorites } from './Meteorites.js';
import { SpaceView } from '../space/SpaceView.js';
import { Skyfall } from '../space/Skyfall.js';
import { createGlowSprite } from '../rendering/Glow.js';
import { WorldSaver } from '../storage/WorldSaver.js';
import { summarizeSavedChunk } from '../world/SavedChunkSurface.js';
import { lightToBrightness, describeLight } from '../world/Light.js';
import { atmosphericLightToBrightness } from '../rendering/LightPolicy.js';
import { WorldTime } from '../sky/WorldTime.js';
import { Sky } from '../sky/Sky.js';
import { usesSolarAtmosphere } from '../sky/SolarAtmosphere.js';
import { skyUniforms } from '../sky/skyShader.js';
import { PlayerModel } from '../player/PlayerModel.js';
import { PlayerAnimator } from '../player/PlayerAnimator.js';
import { FirstPersonHand } from '../player/FirstPersonHand.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { BlockDebris } from '../rendering/BlockDebris.js';
import { WaterfallEffects } from '../rendering/WaterfallEffects.js';
import { TreeParticles } from '../rendering/TreeParticles.js';
import { WindStreaks } from '../rendering/WindStreaks.js';
import { windAt } from '../world/AmbientWind.js';
import { WaterfallWetRocks } from '../rendering/WaterfallWetRocks.js';
import { WaterImpactRipples } from '../rendering/WaterImpactRipples.js';
import { RainEffects } from '../rendering/RainEffects.js';
import { BlockCracks } from '../interaction/BlockCracks.js';
import { COLOR_LEVEL } from '../world/Light.js';
import { Wellbeing } from './Wellbeing.js';

import {
    PLAYER_REACH,
    CHUNK_SIZE,
    START_LOAD_RADIUS,
    POTATO_VIEW_DISTANCE,
    MOUSE_SENSITIVITY,
    HOTBAR_SIZE,
    SPRINT_FOV_FACTOR,
    CHUNK_HEIGHT,
    VIEW_BOB_HEIGHT,
    LAND_DIP_SPEED,
    LAND_DIP_MAX,
    SHADOW_INDOOR_DARKNESS,
    SHAFT_BRIGHTNESS,
    SHAFT_DENSITY_OUTSIDE,
    SHAFT_DENSITY_INSIDE,
    SHAFT_FAR_REACH,
    isCreative
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
    creative: 'Kreatywny',
    developer: 'Programista'
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

export class Game extends GameInteraction {

    // Wczytuje zapisane chunki świata i uruchamia grę.

    // options.savedChunks - chunki z innego źródła (gość w grze
    // wieloosobowej - src/net/RemoteChunkStore.js).

    static async start(renderer, input, storage, worldInfo, settings, options = {}) {

        const savedChunks = options.savedChunks ??
            (storage
                ? await (storage.loadSavedChunks
                    ? storage.loadSavedChunks(worldInfo.id, { summarize: summarizeSavedChunk })
                    : storage.loadChunks(worldInfo.id))
                : new Map());

        const game = new Game(
            renderer,
            input,
            storage,
            worldInfo,
            settings,
            savedChunks
        );

        let waterTarget;
        try {
            waterTarget = game.sky.lightingLook === 'natural' ? game.worldOutput.prepareTarget() : null;
            await prewarmWaterMaterial(renderer, game.scene, game.camera, true, waterTarget);
        } catch (error) {
            await game.stop({ save: false });
            throw error;
        }
        game.prewarmedWaterVariant = waterShaderVariantKey(waterTarget);
        return game;

    }


    constructor(renderer, input, storage, worldInfo, settings, savedChunks) {

        super();

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
        this.sky.lightingLook = settings.get('lightingLook');
        this.sky.cloudCover = settings.get('cloudCover') / 100;
        resetLightingDiagnostics();

        this.sky.solarAtmosphere = usesSolarAtmosphere(settings.get('lightingModel'), worldInfo.terrain);

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
            worldInfo.terrain,
            { bushyGrass: settings.get('bushyGrass') }
        );

        // Gra wieloosobowa (src/net/NetHost.js albo NetClient.js) - null,
        // gdy gramy sami.

        this.net = null;


        // Rosnące rośliny (krzaki owocowe).

        this.plantGrowth = new PlantGrowth(this.world);
        this.plantAnimations = new PlantAnimations(this.world, this.camera);

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
        this.bounceLighting = createBounceLightingState();

        this.world.onMeshChanged = (chunk) => {

            this.shadows.markChunk(chunk);

            this.bounce.markChunk(chunk);
            this.campfires?.renderer.light.markChunk(chunk);

        };
        this.plantAnimations.onFrame = (chunk) => this.shadows.markPlantAnimation(chunk);

        this.lightShafts = new LightShafts(renderer);
        this.worldOutput = new WorldOutput(renderer);

        this.shaftColor = new THREE.Color();

        // Czy słońce dochodzi do gracza (0-1, płynnie) - model, ręka,
        // osiągnięcia.

        this.sunVisibility = 1;

        // Światło odbite w miejscu gracza (model, ręka).



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

        // Krople, piana i mgiełka pod wodospadami (WaterfallEffects.js).

        this.waterfalls = new WaterfallEffects(this.scene, this.world);
        this.waterfalls.setAmount(this.settings.get('potato') ? 0.35 : 1);

        // Spadające liście i owoce, smugi wiatru (0.82.0) - jeden wiatr
        // dla obu (AmbientWind.js), liczony z czasu gry.
        this.windClock = 0;
        this.wind = windAt(0);
        this.treeParticles = new TreeParticles(this.scene, this.world);
        this.windStreaks = new WindStreaks(this.scene, this.world);
        this.applyAmbientParticles();
        this.wetRocks = new WaterfallWetRocks(this.scene, this.world);
        this.waterImpacts = new WaterImpactRipples(this.scene, this.world);
        this.rain = new RainEffects(this.scene, this.world, this.waterImpacts);
        this.waterLandingRevision = -1;
        for (const effect of [this.wetRocks, this.waterImpacts, this.rain]) {
            effect.setAmount(this.settings.get('potato') ? .35 : 1);
        }
        setShadowDefine(this.waterSurfaceMaterials(), this.shadows.enabled, this.shadows.hasFar);

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


        // Energia i samopoczucie (tylko tryb przygody) - Wellbeing.js.

        this.wellbeing = Wellbeing.load(worldInfo.wellbeing, this.time.days);

        this.wellbeing.active = !isCreative(this.mode);

        worldInfo.wellbeing = this.wellbeing.data;

        this.eatDelay = 0;

        this.seenJumps = 0;


        // Dawny "pasek" (komendy, testy): nazwy bloków i wybrane miejsce.

        const inventory = this.inventory;

        this.hotbar = {
            get slots() { return inventory.hotbarTypes(); },
            get selected() { return inventory.selected; },
            set selected(value) { inventory.selected = value; }
        };

        this.player.canFly = isCreative(this.mode);

        // Krótkie komunikaty nad paskiem (np. "Ekwipunek pełny") - main.js.

        this.onNotice = null;


        // Dźwięk (audio/SoundManager.js) - ustawia main.js; bez niego
        // gra działa po cichu. Kroki: przebyta droga od ostatniego kroku.

        this.sounds = null;

        this.stepDistance = 0;
        this.stepFrom = new THREE.Vector3();
        this.swimDistance = 0;


        this.campfires = new Campfires(this, worldInfo.campfires);

        // Skrzynie: zawartość i modele (Chests.js); PPM otwiera ekwipunek
        // ze skrzynią (onOpenChest - main.js).
        this.chests = new Chests(this, worldInfo.chests);
        // Stoły stolarskie i furtki (0.90.0) - deski na blatach w zapisie.
        this.carpenterTables = new CarpenterTables(this, worldInfo.carpenterTables);
        this.onOpenChest = null;
        this.torches = new TorchRenderer(this);
        this.torches.setLowDetail(this.settings.get('potato'));
        // Drzwi (0.91.0) - modele z animacją otwierania.
        this.doors = new DoorRenderer(this);

        // Autozapis.

        this.rafts = new Rafts(this, worldInfo.rafts);

        this.saver = new WorldSaver(
            storage,
            worldInfo,
            this.world,
            this.player,
            this.time,
            this.campfires,
            this.rafts,
            this.chests,
            this.carpenterTables
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
        const profile = this.perfDiagnostics;
        profile?.beginStage('player');


        // Przy bardzo szybkim locie nie generujemy zimnego regionu rzek
        // w klatce fizyki. Obraz i interfejs nadal działają, a symulacja
        // gracza czeka na prawdziwe bloki zamiast wpadać w pusty teren.
        profile?.beginStage('generation');
        const playerColumn = this.world.ensurePlayerColumn(
            this.player.pos.x, this.player.pos.z
        );
        profile?.endStage('generation');
        if (!playerColumn) {
            profile?.endStage('player');
            this.updateWhileTerrainLoads(dt, input);
            // Gość czeka na chunk od gospodarza - sieć musi działać dalej.
            this.net?.update(dt);
            return;
        }


        this.player.stamina = this.wellbeing.effects;

        if (!this.rafts?.update(dt, input)) this.player.update(dt, input);

        this.updateFootsteps();


        // Test wydajności: kamera powoli obraca się dookoła.

        if (this.benchmark) {
            this.updateBenchmark(dt);
        }


        // Upływ czasu. Z włączonym debugiem (F3) klawisze [ i ]
        // przestawiają zegar o godzinę (do oglądania nieba).

        this.time.update(dt);

        this.updateWellbeing(dt, input);

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


        // Cel pod celownikiem i kliknięcia: kopanie, stawianie, zbiór,
        // jedzenie, rozgrzebywanie (GameInteraction.js).

        const { breakPressed, breakHeld } = this.updateInteraction(dt, input);


        // Wczytywanie chunków wokół gracza i przebudowa meshy
        // (z limitem czasu na klatkę).

        profile?.endStage('player');
        this.world.perfDiagnostics = profile;
        profile?.beginStage('stream');
        this.world.update(
            this.player.pos.x,
            this.player.pos.z,
            this.getLoadRadius(),
            this.settings.get('loadBudget'),
            dt
        );
        profile?.endStage('stream');

        // Daleki teren: wybór i budowanie kafelków (też z limitem czasu).
        // Zaczyna się na końcu zasięgu widzenia - albo bliżej, dopóki
        // dalsze chunki się wczytują (np. zaraz po wejściu do świata).

        profile?.beginStage('far');
        this.updateFarRange();

        this.farTerrain.update(this.camera.position);
        profile?.endStage('far');


        // Kosmos: jak wysoko jesteśmy (niebo, kula Ziemi) - przed niebem.

        this.spaceView.update(dt, this.camera.position);

        this.updateCameraRange();


        profile?.beginStage('effects');
        this.campfires.update(dt, input.isMouseDown(2) && !breakHeld && !breakPressed);

        this.chests.update(dt);
        this.carpenterTables.update(dt);
        this.torches.update(dt);
        this.doors.update(dt);
        profile?.endStage('effects');

        // Autozapis co jakiś czas.

        profile?.beginStage('save');
        this.saver.update(dt);
        profile?.endStage('save');


        // Z dalekim terenem słońce zachodzi za jego brzegiem - z wysoka
        // ten brzeg jest trochę pod linią poziomu.

        this.sky.horizonDip = this.farTerrain.active
            ? Math.min(0, (this.world.generator.baseHeight + 1 - this.camera.position.y) / this.farTerrain.outer)
            : 0;

        // Z kulą Ziemi (kosmos) horyzont jest dalej - tam, gdzie kończy się kula.

        if (this.spaceView.horizonDip < 0) {
            this.sky.horizonDip = Math.min(this.sky.horizonDip, this.spaceView.horizonDip);
        }

        profile?.beginStage('light');
        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());

        this.updateFog(dt);

        // Cienie: które światło je rzuca i czy przerysować mapę.

        this.shadows.update(dt, this.sky, this.camera.position);

        // Z cieniami słońce mocniej, światło nieba słabiej (config.js).

        this.sky.applyShadowContrast(this.shadows.active ? this.shadows.strength : 0);

        this.updateBounce();
        profile?.endStage('light');


        // Spadanie z kosmosu (ogień, krater), meteoryty, rosnące krzaki,
        // kule światła i dynamiczne światło.

        this.skyfall.update(dt);

        this.meteorites.update(dt);

        // Odłamki niszczonych bloków.

        this.debris.update(dt);

        // Wiatr, spadające liście i owoce, smugi wiatru.

        this.windClock += dt;
        this.wind = windAt(this.windClock);
        this.treeParticles.update(dt, this.player, this.wind);
        this.windStreaks.update(dt, this.player, this.wind, this.sky.state?.daylight ?? 1);

        profile?.beginStage('waterfalls');
        this.waterfalls.update(dt, this.player, this.camera);
        this.updateWaterSurfaceEffects(dt);
        profile?.endStage('waterfalls');

        // Osiągnięcia sprawdzane co chwilę (wysokość, nurkowanie...).

        this.achievements?.update(dt);

        profile?.beginStage('plants');
        this.plantGrowth.update(dt);
        this.plantAnimations.update(dt);
        profile?.endStage('plants');

        this.updateOrbs(dt);

        profile?.beginStage('light');
        this.updateDynamicLight();
        profile?.endStage('light');


        this.highlight.update(this.currentHit);


        // Widok z trzeciej osoby (F5), model gracza i pole widzenia przy biegu.

        if (input.consumeKeyPress('F5')) {
            this.cycleCameraMode();
        }

        this.updateModel(dt);

        this.updateView();

        this.water.update(dt);

        this.updateFovBoost(dt);

        this.net?.update(dt);

    }

    waterSurfaceMaterials() {
        return [...(this.waterfalls?.materials ?? (this.waterfalls ? [this.waterfalls.ripples.material] : [])),
            this.wetRocks?.material, this.waterImpacts?.material].filter(Boolean);
    }

    updateWaterSurfaceEffects(dt) {
        if (!this.waterfalls || !this.wetRocks || !this.waterImpacts || !this.rain) return;
        if (this.waterLandingRevision !== this.waterfalls.landingRevision) {
            this.waterLandingRevision = this.waterfalls.landingRevision;
            this.wetRocks.setLandings(this.waterfalls.landings);
        }
        this.wetRocks.update(dt);
        this.rain.update(dt, this.camera, this.sky.state);
        // One shared discovery allowance for persistent and short-lived rings.
        this.waterImpacts.update(dt, this.player, Math.max(0, 48 - this.waterfalls.ripples.surface.lastProcessed));
    }

    // Brak danych pod graczem wstrzymuje ruch i edycje bloków, ale
    // patrzenie myszą, niebo, woda, oświetlenie i zapis nadal działają.
    updateWhileTerrainLoads(dt, input) {
        const profile = this.perfDiagnostics;
        this.world.perfDiagnostics = profile;
        this.player.updateLook(input);
        this.player.updateCamera();
        this.updateView();
        this.time.update(dt);
        profile?.beginStage('stream');
        this.world.update(this.player.pos.x, this.player.pos.z,
            this.getLoadRadius(), this.settings.get('loadBudget'), dt);
        profile?.endStage('stream');
        profile?.beginStage('far');
        this.updateFarRange();
        this.farTerrain.update(this.camera.position);
        profile?.endStage('far');
        profile?.beginStage('light');
        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());
        this.updateFog(dt);
        this.shadows.update(dt, this.sky, this.camera.position);
        this.sky.applyShadowContrast(this.shadows.active ? this.shadows.strength : 0);
        this.updateBounce();
        this.updateDynamicLight();
        profile?.endStage('light');
        profile?.beginStage('plants');
        this.plantAnimations.update(dt);
        profile?.endStage('plants');
        this.water.update(dt);
        profile?.beginStage('waterfalls');
        this.waterfalls?.update(dt, this.player, this.camera);
        this.updateWaterSurfaceEffects?.(dt);
        profile?.endStage('waterfalls');
        this.currentHit = null;
        this.highlight.update(null);
        profile?.beginStage('save');
        this.saver?.update(dt);
        profile?.endStage('save');
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

        const toBrightness = this.sky.atmosphere ? atmosphericLightToBrightness : lightToBrightness;
        const sky = toBrightness(light.sky);

        const strongest = Math.max(light.red, light.green, light.blue);

        const lamp = strongest > 0 ? toBrightness(COLOR_LEVEL[strongest]) : 0;

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

        const ambientStrength = shadows.active ? shadows.ambientStrength : 0;
        modelLight.uModelAmbient.value = this.modelSky ** (2.2 + SHADOW_INDOOR_DARKNESS * ambientStrength);

        // Sonda już interpoluje lokalny transfer. Aktualne źródła stosujemy
        // bez opóźnienia, żeby zgaszone światło nie pozostawało na dłoni.

        const bounce = this.bounce.enabled ? this.bounce.sample(player.pos.x, player.pos.y + 1.2, player.pos.z) : [0, 0, 0];

        modelLight.uModelBounce.value.set(bounce[0], bounce[1], bounce[2]);

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
        const profile = this.perfDiagnostics;

        renderer.autoClear = false;

        renderer.info.reset();


        // Mapa cieni słońca (gdy trzeba) i cień gracza - przed światem.

        profile?.beginStage('shadows');
        this.shadows.render(this.world, this.camera.position, this.model, this.scene, this.viewDistance, this.farTerrain);
        this.campfires.renderer.renderShadows();
        profile?.endStage('shadows');
        this.bounce.bind();


        const naturalOutput = this.sky.lightingLook === 'natural';
        const grayscaleOutput = lightingUniforms.uLightingDebug.value === 12;
        const outputEnabled = this.worldOutput.begin(naturalOutput || grayscaleOutput,
            { bypassTone: !naturalOutput && grayscaleOutput });
        try {
        if (!outputEnabled) renderer.clear();


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

            profile?.beginStage('sky');
            this.sky.render(renderer, camera);

            renderer.clearDepth();

            // Z wysoka: kula Ziemi pod dalekim terenem, chmury nad nim.

            this.spaceView.renderBehind(renderer, camera);

            this.farTerrain.render(renderer, camera);

            this.spaceView.renderFront(renderer, camera);
            profile?.endStage('sky');

            renderer.clearDepth();

        }

        profile?.beginStage('world');
        renderer.render(this.scene, camera);
        profile?.endStage('world');


        // Promienie światła w powietrzu (na świecie, pod ręką).

        profile?.beginStage('post');
        this.renderLightShafts(camera);
        profile?.endStage('post');


        // Ręka w widoku z oczu - na wierzchu (nigdy nie wchodzi w ścianę).

        if (!this.view && this.settings.get('showHand')) {
            const distanceLod = viewUniforms.uDistanceLodEnabled.value;
            viewUniforms.uDistanceLodEnabled.value = 0;
            try { this.hand.render(renderer, camera); }
            finally { viewUniforms.uDistanceLodEnabled.value = distanceLod; }
        }


        if (saved) {

            camera.position.copy(saved.position);

            camera.rotation.copy(saved.rotation);

            camera.updateMatrixWorld();

        }

        } finally {
            profile?.beginStage('post');
            this.worldOutput.end();
            profile?.endStage('post');
        }

    }


    // Jedno odbicie z lokalnie buforowaną geometrią. Źródła są aktualne
    // w każdej klatce; paleta i maski nie uruchamiają przebudowy chunków.

    updateBounce() {

        this.bounce.update(this.world, this.camera.position,
            updateBounceLightingState(this.bounceLighting, this.settings, this.sky,
                this.renderer.capabilities.isWebGL2));
        this.campfires.renderer.updateBounce();
        this.torches.updateBounce();

    }


    // Promienie światła (LightShafts.js): kolor światła, które rzuca
    // cienie, mocniejsze o wschodzie i zachodzie i w ciemnym miejscu
    // (w pokoju z oknem snop jest wyraźny, na dworze - lekka mgiełka).

    renderLightShafts(camera) {

        const shadows = this.shadows;
        const debugView = lightingUniforms.uLightingDebug.value;
        if (debugView > 0 && debugView !== 12) return;

        if (!this.shaftsEnabled || !shadows.active || this.water.underwater) {
            return;
        }

        const state = this.sky.state;

        const sun = shadows.light === 'sun';

        const intensity = sun ? state.sunLightIntensity : state.moonLightIntensity * 1.6;

        const lowSun = 1 + 0.9 * (1 - smoothstep(0.06, 0.4, shadows.direction.y));

        const amount = intensity * shadows.strength * lowSun * SHAFT_BRIGHTNESS
            * lightingUniforms.uLightingComponents.value.getComponent(sun ? 0 : 1);

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

        const target = this.sky.atmosphere
            ? atmosphericLightToBrightness(light.sky)
            : lightToBrightness(light.sky);


        // Mniej więcej w sekundę dochodzi do nowej jasności.

        this.fogBrightness +=
            (target - this.fogBrightness) * Math.min(1, dt * 3);


        // Kolory w three.js są liniowe, a jasność "na oko" - stąd potęga.

        const fog = this.fogBrightness ** 2.2;

        skyUniforms.uFogBrightness.value = fog;
        updateAerialPerspective(this.settings, this.sky, fog);

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

        const gradual = viewDistance > FULL_TERRAIN_DISTANCE;
        const outer = gradual ? Math.max(viewDistance, this.settings.get('farTerrain')) : this.settings.get('farTerrain');

        // Zaokrąglone do 8 bloków, żeby nie wybierać kafelków co klatkę.

        const loaded = Math.floor(this.world.completeRadius() / 8) * 8;

        // Far tiles cover the overlap even while detailed geometry still exists.
        let inner = Math.max(16, Math.min(gradual ? TERRAIN_TRANSITION_START : viewDistance, loaded));


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
        // Materiały są wspólne z menu. Start, ustawienia i każda klatka gry
        // przywracają dotychczasowe przejście tekstur w daleki teren.
        viewUniforms.uFarTextureBlend.value = 1;
        // Texture averaging meets the end of the overlap, independently of
        // the earlier point where replacement tiles start being prepared.
        viewUniforms.uFarInner.value = gradual ? FULL_TERRAIN_DISTANCE : inner;
        viewUniforms.uFarOuter.value = Math.max(outer, inner);
        viewUniforms.uDistanceLodEnabled.value = gradual && !this.farUnderPlayer ? 1 : 0;
        viewUniforms.uDistanceLodStart.value = TERRAIN_TRANSITION_START;
        viewUniforms.uDistanceLodEnd.value = FULL_TERRAIN_DISTANCE;
        viewUniforms.uDistanceLodCenter.value.set(this.player.pos.x, this.player.pos.z);

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


    // Spadające liście i owoce, smugi wiatru (Ustawienia -> Modele);
    // tryb ziemniaka - mniej liści, bez smug.

    applyAmbientParticles() {

        const potato = Boolean(this.settings.get('potato'));

        this.treeParticles?.setEnabled(this.settings.get('fallingLeaves') !== false);
        this.treeParticles?.setAmount(potato ? 0.35 : 1);
        this.windStreaks?.setEnabled(this.settings.get('windStreaks') !== false && !potato);

    }


    // Stosuje ustawienia gracza. Wywoływane przy starcie
    // i po każdej zmianie w ekranie ustawień (key = co się zmieniło).

    applySettings(key = null) {

        const settings = this.settings;
        this.sky.lightingLook = settings.get('lightingLook');
        this.sky.cloudCover = settings.get('cloudCover') / 100;
        lightingUniforms.uLightingNatural.value = this.sky.lightingLook === 'natural' ? 1 : 0;
        updateAerialPerspective(settings, this.sky, this.fogBrightness ** 2.2);
        applyMaterialLightingSettings(settings);
        this.shadows.setNaturalLighting(this.sky.lightingLook === 'natural');

        this.sky.solarAtmosphere = usesSolarAtmosphere(settings.get('lightingModel'), this.worldInfo.terrain);

        // Eksperyment: trawa kępiasta (tylko wygląd - bloki bez zmian).

        this.world.setExperiments({ bushyGrass: settings.get('bushyGrass') });
        this.world.setDistanceLod(true);

        // Modele -> Animacje roślin (poziom modeli i wiatr - main.js,
        // applyPlantSettings - wspólne z tłem menu).

        this.plantAnimations?.setEnabled(settings.get('plantAnimations'));


        // Zasięg widoku: pełne bloki do 192, dalej stopniowo prostszy krajobraz.
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

        this.waterfalls?.setAmount(potato ? 0.35 : 1);
        this.applyAmbientParticles();
        this.wetRocks?.setAmount(potato ? .35 : 1);
        this.waterImpacts?.setAmount(potato ? .35 : 1);
        this.rain?.setAmount(potato ? .35 : 1);
        this.water?.waterfallAudio?.setAmount(potato ? .35 : 1);


        // Cienie słońca i promienie światła (nie w trybie ziemniaka).

        this.shadows.setQuality(potato ? 0 : settings.get('shadows'));

        setShadowDefine([blockMaterial, plantMaterial, waterMaterial, leafMaterial], this.shadows.enabled, this.shadows.hasFar);
        if (this.waterfalls) setShadowDefine(this.waterSurfaceMaterials(), this.shadows.enabled, this.shadows.hasFar);

        setFarTerrainShadows(this.shadows.hasFar);

        modelLight.uModelShadows.value = this.shadows.enabled ? 1 : 0;
        modelLight.uModelDistantShadows.value = this.shadows.enabled ? 1 : 0;

        this.shaftsEnabled = !potato && settings.get('lightShafts');


        // Model gracza: wierzchnia warstwa skórki, styl zgięć, tryb ziemniaka.

        if (this.model) {

            this.model.setOverlay(settings.get('skinOverlay'));

            this.model.setStyle(settings.get('jointStyle'));

            this.model.setLowDetail(potato);

        }


        // Ręka w widoku z oczu: tryb ziemniaka, rękaw (wierzchnia warstwa).

        if (this.hand) {

            this.hand.setLowDetail(potato);

            this.hand.setOverlay(settings.get('skinOverlay'));

        }

        this.torches?.setLowDetail(potato);
        this.doors?.setLowDetail(potato);
        this.chests?.renderer.setLowDetail(potato);


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

        // Ustawienia są zmieniane także w pauzie, bez Game.update().
        // Odśwież tylko źródła i bieżące próbki, bez pracy solvera ani
        // przesuwania jego cache. Dłoń i ogniska muszą zgasnąć razem z terenem.
        this.bounce.update(null, null,
            updateBounceLightingState(this.bounceLighting, settings, this.sky,
                this.renderer.capabilities.isWebGL2));
        const position = this.player.pos;
        const bounce = this.bounce.sample(position.x, position.y + 1.2, position.z);
        modelLight.uModelBounce.value.set(bounce[0], bounce[1], bounce[2]);
        this.campfires?.renderer.updateBounce();
        this.torches?.updateBounce();

        // Po starcie: nowy kod shaderów przygotuj przy zmianie ustawień.
        // Nie odraczaj go do napotkania wody i nie zatrzymuj samych renderów
        // przy nadal działającej symulacji. Pierwszy warmup czeka w start().
        if (this.prewarmedWaterVariant !== undefined) {
            const waterTarget = this.sky.lightingLook === 'natural' ? this.worldOutput.prepareTarget() : null;
            const variant = waterShaderVariantKey(waterTarget);
            if (variant !== this.prewarmedWaterVariant) {
                prewarmWaterMaterial(this.renderer, this.scene, this.camera, false, waterTarget);
                this.prewarmedWaterVariant = variant;
            }
        }

    }


    // --------------------------------------------------------
    // PASEK BLOKÓW
    // --------------------------------------------------------

    // Blok w wybranym miejscu paska (null = puste miejsce).

    get selectedBlock() {

        return this.inventory.selectedItem?.type ?? null;

    }


    // Zmiana trybu gry ('adventure' / 'creative' / 'developer').

    setMode(mode) {

        if (!(mode in GAME_MODES)) {
            return false;
        }

        this.mode = mode;

        this.worldInfo.gameMode = mode;

        this.player.canFly = isCreative(mode);

        this.wellbeing.active = !isCreative(mode);

        if (!isCreative(mode)) {
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


    // --------------------------------------------------------

    // Promień danych i pełnych bloków. Dalszy widok jest obsługiwany przez
    // FarTerrain, z nakładającymi się strefami zamiast tysięcy pełnych chunków.
    // +2, bo najdalszy pierścień wczytanych chunków jest niewidoczny
    // (czeka na sąsiadów - patrz World.js).

    getLoadRadius() {

        return Math.ceil(
            fullTerrainDistance(this.viewDistance) / CHUNK_SIZE
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

        // A tree command writes over several frames. Finish before the final
        // snapshot so leaving the world cannot save a half-built specimen.
        await waitForTreeShowcase(this.world);

        // Gość: ostatni zapis ekwipunku u gospodarza; gospodarz: koniec
        // gry dla znajomych (przed zapisem - ich ekwipunki już są w świecie).

        if (this.net?.isClient) { this.net.leave(); this.net.dispose(); }
        else if (this.net?.isHost) this.net.close();

        if (save && !(await this.saver.flush())) {
            return false;
        }


        this.saver.stop();

        this.plantAnimations.dispose();
        this.world.dispose();

        this.highlight.dispose();

        this.sky.dispose();

        this.meteorites.dispose();

        this.skyfall.dispose();

        this.water.dispose();

        this.removeOrbs();

        this.dynamicLight.dispose();
        this.campfires.dispose();

        this.chests.dispose();
        this.carpenterTables.dispose();
        this.torches.dispose();
        this.doors.dispose();

        this.farTerrain.dispose();

        this.spaceView.dispose();

        this.model.dispose();

        this.hand.dispose();

        this.cracks.dispose();

        this.debris.dispose();

        this.rafts?.dispose();
        this.waterfalls.dispose();

        this.treeParticles.dispose();

        this.windStreaks.dispose();
        this.wetRocks.dispose();
        this.waterImpacts.dispose();
        this.rain.dispose();

        this.shadows.dispose();

        this.lightShafts.dispose();
        this.worldOutput.dispose();
        resetLightingDiagnostics();

        this.bounce.dispose();

        modelLight.uModelBounce.value.set(0, 0, 0);

        modelLight.uModelShadows.value = 0;
        modelLight.uModelDistantShadows.value = 0;

        return true;

    }

    // --------------------------------------------------------
    // HUD (informacje w lewym górnym rogu)
    // --------------------------------------------------------

    updateHud(element) {

        const debug = this.settings.get('showDebug');
        const status = [this.saver.getStatus(), this.rafts?.hint].filter(Boolean).join(' • ');
        const now = performance.now();
        const hud = this.hudState ??= { element: null, debug: null, status: null, html: null, nextUpdate: 0 };

        // Diagnostyka nie musi przebudowywać DOM i drzewa dostępności co
        // klatkę. F3 oraz komunikaty zapisu nadal reagują natychmiast.
        const changed = element !== hud.element || debug !== hud.debug || status !== hud.status;
        if (!changed && (!debug || now < hud.nextUpdate)) return;
        if (element !== hud.element) hud.html = null;
        hud.element = element;
        hud.debug = debug;
        hud.status = status;
        hud.nextUpdate = now + 200;

        if (!debug) {
            if (status !== hud.html) {
                element.innerHTML = status;
                hud.html = status;
            }
            return;
        }

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
              `${shadows.hasFar ? `, dalsze ${shadows.cascades.map(c => `${c.config.radius} bl. ${c.draws}×`).join(' / ')}` : ''}` +
              `${this.shaftsEnabled ? ' | promienie' : ''} | lokalny dostęp do słońca ${Math.round(this.sunVisibility * 100)}%`
            : `Cienie: wył.${shadows.supported ? '' : ' (brak WebGL2)'}`;


        // Zaćmienie słońca (tylko gdy trwa).

        const eclipse = this.sky.state.eclipse;

        const eclipseInfo = eclipse > 0
            ? ` | Zaćmienie: ${Math.round(eclipse * 100)}%${eclipse >= 1 ? ' (pełne!)' : ''}`
            : '';


        const html =

            `Świat: ${this.worldInfo.name} | Seed: ${this.worldInfo.seed}` +
            `${this.net ? ` | ${this.net.describe()}` : this.storage ? '' : ' | ZAPIS NIEDOSTĘPNY'}<br>` +

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

            `<br><br>${status}`;

        if (html !== hud.html) {
            element.innerHTML = html;
            hud.html = html;
        }

    }

}
