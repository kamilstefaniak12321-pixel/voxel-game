import { setLeafSeason, leafSeasonUniforms } from '../rendering/LeafSeasons.js';
import { BENCHMARK_FLIGHT, benchmarkText } from '../diagnostics/Benchmark.js';
import * as THREE from 'three';
import { fullTerrainDistance, FULL_TERRAIN_DISTANCE, TERRAIN_TRANSITION_START } from '../world/DistanceLod.js';

import { Campfires } from './Campfires.js';
import { GameInteraction } from './GameInteraction.js';
import { Blackout, NO_INPUT } from './Blackout.js';
import { Beds } from './Beds.js';
import { Sleep } from './Sleep.js';
import { Tutorial } from './Tutorial.js';
import { TorchRenderer } from '../rendering/TorchRenderer.js';
import { DoorRenderer } from '../rendering/DoorRenderer.js';
import { Hedgehogs } from './Hedgehogs.js';
import { doorSound } from '../audio/doorSounds.js';
import { Chests } from './Chests.js';
import { CarpenterTables } from './CarpenterTables.js';
import { SewingTables } from './SewingTables.js';
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
import { blockMaterial, plantMaterial, waterMaterial, leafMaterial, waterUniforms, setPotatoDefine, setLeafMaterialFast, setShadowDefine } from '../rendering/BlockRenderData.js';
import { SunShadows } from '../rendering/Shadows.js';
import { LightShafts } from '../rendering/LightShafts.js';
import { WorldOutput } from '../rendering/WorldOutput.js';
import { lightingUniforms, resetLightingDiagnostics } from '../rendering/LightingDiagnostics.js';
import { prewarmWaterMaterial, waterShaderVariantKey } from '../rendering/WaterMaterialWarmup.js';
import { prewarmScenes, warmupObject, markShadersReady, COLORED_MODEL_ATTRIBUTES, MODEL_ATTRIBUTES } from '../rendering/ShaderWarmup.js';
import { createTorchModel, disposeTorchModel } from '../rendering/TorchMaterial.js';
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
import { seasonAt } from '../sky/Seasons.js';
import { FirstPersonHand } from '../player/FirstPersonHand.js';
import { modelLight } from '../rendering/ModelMaterial.js';
import { BlockDebris } from '../rendering/BlockDebris.js';
import { WaterfallEffects } from '../rendering/WaterfallEffects.js';
import { TreeParticles } from '../rendering/TreeParticles.js';
import { WindStreaks } from '../rendering/WindStreaks.js';
import { Weather } from '../weather/Weather.js';
import { plantWindUniforms } from '../rendering/PlantWind.js';
import { treeWindStrength } from '../blocks/treeSway.js';
import { WaterfallWetRocks } from '../rendering/WaterfallWetRocks.js';
import { WaterImpactRipples } from '../rendering/WaterImpactRipples.js';
import { RainEffects } from '../rendering/RainEffects.js';
import { RainStreaks } from '../rendering/RainStreaks.js';
import { WeatherAudio } from '../audio/WeatherAudio.js';
import { Thunderstorm } from '../weather/Thunderstorm.js';
import { LightningBolts } from '../rendering/LightningBolts.js';
import { Hail } from '../rendering/Hail.js';
import { SnowFall } from '../rendering/SnowFall.js';
import { SandStorm } from '../rendering/SandStorm.js';
import { DustDevils } from '../weather/DustDevils.js';
import { DustDevilRenderer } from '../rendering/DustDevilRenderer.js';
import { seaWave, seaSwell, SEA_WAVE } from '../rendering/WaterWave.js';
import { cloudUniforms } from '../weather/cloudShader.js';
import { seaName } from '../weather/weatherText.js';
import { DAY_SECONDS } from '../weather/WeatherField.js';
import { ThunderAudio } from '../audio/ThunderAudio.js';
import { meteorLightUniforms } from '../rendering/meteorLight.js';
import { BlockCracks } from '../interaction/BlockCracks.js';
import { COLOR_LEVEL } from '../world/Light.js';
import { Wellbeing } from './Wellbeing.js';
import { Drops } from './Drops.js';
import { Orchard } from './Orchard.js';
import { Spoilage } from './Spoilage.js';
import { WoodDrying } from './WoodDrying.js';
import { Woodpiles } from './Woodpiles.js';
import { Felling } from './Felling.js';
import { StarterLog } from './StarterLog.js';
import { Sawhorses } from './Sawhorses.js';
import { ToolWear } from './ToolWear.js';
import { TorchBurn } from './TorchBurn.js';
import { TreeTaps } from './TreeTaps.js';
import { TapRenderer } from '../rendering/TapRenderer.js';
import { Warmth } from './Warmth.js';
import { Freeze } from './Freeze.js';
import { clothesCode } from '../items/clothing.js';
import { DropRenderer } from '../rendering/DropRenderer.js';
import { formatKeys } from '../input/bindings.js';

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


const NO_STRIKES = Object.freeze([]);

// Ciepło klimatu dla pogody: (x, z) => -1..1 albo null, gdy generator go
// nie ma. Od niego zależy temperatura, a więc i granica śniegu - dlatego
// między węzłami siatki (co 256 bloków, zapamiętywanymi) wartość zmienia
// się płynnie; schodki byłoby widać na śniegu.

function weatherWarmth(generator) {

    if (typeof generator?.temperatureAt !== 'function') {
        return null;
    }

    return nodeField((x, z) => generator.temperatureAt(x, z));

}

// Czy to otwarte morze: (x, z) => 0-1 albo null, gdy generator tego nie
// wie. Od tego zależy sztorm (weather.sea) - na jeziorze i rzece go nie ma.

function weatherSea(generator) {

    if (typeof generator?.seaAt !== 'function') {
        return null;
    }

    return nodeField((x, z) => generator.seaAt(x, z));

}

// Pole generatora wygładzone między węzłami siatki co 256 bloków
// (zapamiętywanymi): at(x, z) liczy się tylko w węzłach.

function nodeField(at) {

    const cache = new Map();

    const node = (cx, cz) => {

        const key = cx * 65536 + cz;

        let value = cache.get(key);

        if (value === undefined) {

            if (cache.size > 30000) {
                cache.clear();
            }

            value = at(cx * 256, cz * 256);
            cache.set(key, value);

        }

        return value;

    };

    return (x, z) => {

        const gx = x / 256;
        const gz = z / 256;
        const cx = Math.floor(gx);
        const cz = Math.floor(gz);
        const fx = gx - cx;
        const fz = gz - cz;
        const a = node(cx, cz);
        const b = node(cx + 1, cz);
        const c = node(cx, cz + 1);
        const d = node(cx + 1, cz + 1);

        return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;

    };

}

// Światło błysku burzy (updateStorm): kolor (sinobiały), siła na terenie
// dla pioruna do ziemi i dla błysku w chmurze, rozjaśnienie nieba.
const STORM_LIGHT = Object.freeze({ color: [0.74, 0.82, 1.0], ground: 1.3, cloud: 1.1, sky: 0.2 });

// Wilgotność klimatu dla pogody: (x, z) => -1..1 albo null, gdy
// generator jej nie ma (płaski świat). Zapamiętywana w oczkach po 256
// bloków - pogoda pyta o nią tysiące razy na sekundę.

function weatherClimate(generator) {

    if (typeof generator?.humidityAt !== 'function') {
        return null;
    }

    const cache = new Map();

    return (x, z) => {

        const cx = Math.floor(x / 256);
        const cz = Math.floor(z / 256);
        const key = cx * 65536 + cz;

        let value = cache.get(key);

        if (value === undefined) {

            if (cache.size > 30000) {
                cache.clear();
            }

            value = generator.humidityAt((cx + 0.5) * 256, (cz + 0.5) * 256);
            cache.set(key, value);

        }

        return value;

    };

}


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
            // Wszystkie pozostałe programy cieniujące - też teraz, pod
            // ekranem wczytywania, a nie w pierwszej klatce i przy pierwszej
            // pochodni czy deszczu (rendering/ShaderWarmup.js).
            game.prewarmedPrograms = await game.prewarmShaders(waterTarget);
            // Jedna próbna klatka: cienie, promienie światła i końcowe
            // złożenie obrazu mają własne przebiegi rysowania - ich programy
            // powstają tutaj, a nie w pierwszej klatce po zniknięciu ekranu
            // wczytywania. Błąd próbnej klatki nie zatrzymuje wejścia do świata.
            try {
                game.player.updateCamera();
                game.updateView();
                game.shadows.update(0, game.sky, game.camera.position);
                game.render();
                markShadersReady(renderer);
            } catch (error) {
                console.warn('Próbna klatka (programy cieniujące) nie powiodła się.', error);
            }
        } catch (error) {
            await game.stop({ save: false });
            throw error;
        }
        game.prewarmedWaterVariant = waterShaderVariantKey(waterTarget);
        return game;

    }


    // PROGRAMY CIENIUJĄCE POD EKRANEM WCZYTYWANIA (rendering/ShaderWarmup.js).
    // Sceny w kolejności rysowania (render()); do każdej dochodzą ukryte
    // wzory rzeczy, które powstają dopiero w grze. Wzory żyją do końca gry
    // (shaderWarmup) - trzymają programy, gdy np. zgaśnie ostatnia pochodnia.
    async prewarmShaders(renderTarget) {

        if (!this.shaderWarmup) {

            const world = new THREE.Scene(), far = new THREE.Scene(), hand = new THREE.Scene();

            const collect = (scene, objects) => { for (const object of objects ?? []) scene.add(object); };

            collect(world, this.torches?.shaderPrototypes?.());
            collect(world, this.drops?.renderer?.shaderPrototypes?.());
            collect(world, this.campfires?.renderer?.shaderPrototypes?.());
            collect(world, this.woodpiles?.renderer?.shaderPrototypes?.());
            collect(world, this.felling?.renderer?.shaderPrototypes?.());
            collect(world, this.meteorites?.shaderPrototypes?.());
            collect(far, this.farTerrain?.shaderPrototypes?.());

            // Przedmiot w dłoni modelu gracza (widok zza pleców) i w ręce
            // z oczu: blok albo przedmiot z przezroczystym tłem.
            if (this.model) {
                collect(world, [warmupObject(this.model.heldMaterial, MODEL_ATTRIBUTES),
                    warmupObject(this.model.heldPlantMaterial, COLORED_MODEL_ATTRIBUTES)]);
            }

            let handTorch = null;
            if (this.hand) {
                handTorch = createTorchModel('plain', 'down');
                handTorch.visible = false;
                collect(hand, [warmupObject(this.hand.heldMaterial, MODEL_ATTRIBUTES),
                    warmupObject(this.hand.heldCutoutMaterial, COLORED_MODEL_ATTRIBUTES), handTorch]);
            }

            this.shaderWarmup = { world, far, hand, handTorch };

        }

        const { world, far, hand } = this.shaderWarmup;

        const count = await prewarmScenes(this.renderer, [
            { scene: this.sky?.scene, camera: this.camera },
            { scene: this.farTerrain?.scene, camera: this.camera },
            { scene: far, camera: this.camera, targetScene: this.farTerrain?.scene },
            { scene: this.scene, camera: this.camera },
            { scene: world, camera: this.camera, targetScene: this.scene },
            { scene: this.hand?.scene, camera: this.hand?.camera },
            { scene: hand, camera: this.hand?.camera, targetScene: this.hand?.scene }
        ], renderTarget);

        markShadersReady(this.renderer);

        return count;

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

        // Pogoda (src/weather/): fronty, chmury i wiatr z czasu gry
        // i ziarna świata. W suchych stronach świata chmur jest mniej.

        this.weather = new Weather(worldInfo.seed, {
            climate: weatherClimate(this.world.generator),
            warmth: weatherWarmth(this.world.generator),
            sea: weatherSea(this.world.generator)
        });
        this.sky.clouds.weather = this.weather;

        // Deszcz ustawiony komendą /pogoda deszcz (0-1) albo null - pada
        // tam, gdzie mówi pogoda.
        this.rainOverride = null;

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

        this.cracks = new BlockCracks(this.scene, this);

        this.debris = new BlockDebris(this.scene, this.world);

        // Krople, piana i mgiełka pod wodospadami (WaterfallEffects.js).

        this.waterfalls = new WaterfallEffects(this.scene, this.world);
        this.waterfalls.setAmount(this.settings.get('potato') ? 0.35 : 1);

        // Spadające liście i owoce, smugi wiatru (0.82.0) - niesie je
        // wiatr z pogody w miejscu gracza (weather/Weather.js).
        this.wind = this.weather.wind;
        this.treeParticles = new TreeParticles(this.scene, this.world);
        this.windStreaks = new WindStreaks(this.scene, this.world);
        this.applyAmbientParticles();
        this.wetRocks = new WaterfallWetRocks(this.scene, this.world);
        this.waterImpacts = new WaterImpactRipples(this.scene, this.world);
        this.rain = new RainEffects(this.scene, this.world, this.waterImpacts);

        // Deszcz, który widać i słychać (1.12.0): krople i rozpryski liczy
        // karta graficzna (RainStreaks), szum deszczu i wiatru - WeatherAudio.
        // RainEffects zostaje do kręgów na wodzie (jego kreski są ukryte).
        this.rainStreaks = new RainStreaks(this.scene, this.world);
        this.weatherAudio = new WeatherAudio(this);
        this.rainNow = 0;
        this.shelterCover = 0;

        // Burza (1.13.0): wyładowania z czasu gry i ziarna (Thunderstorm),
        // kanał pioruna (LightningBolts), grzmot spóźniony o odległość
        // (ThunderAudio) i grad (Hail).
        this.thunder = new Thunderstorm(this.weather, { groundAt: (x, z) => this.stormGround(x, z) });
        this.lightning = new LightningBolts(this.scene);
        this.thunderAudio = new ThunderAudio(this);
        this.hail = new Hail(this.scene, this.rainStreaks);
        this.hailNow = 0;
        this.stormLight = false;

        // Zima (1.14.0): płatki śniegu i zamieć przy ziemi (SnowFall);
        // snowNow - ile teraz pada śniegu, graupelNow - krupy śnieżnej.
        this.snowFall = new SnowFall(this.scene, this.rainStreaks);
        // Piasek niesiony wiatrem i bryzgi z morza (od 1.15.0).
        this.sandStorm = new SandStorm(this.scene, this.rainStreaks);
        // Wiry pyłowe: losowanie z czasu gry i rysowanie.
        this.dustDevils = new DustDevils(this.weather.field);
        this.devilRenderer = new DustDevilRenderer(this.scene);
        this.groundAt = (x, z) => this.stormGround(x, z);
        // Tratwa unosi się na falach sztormu (game/RaftPhysics.js).
        this.world.waveOffset = (x, y, z) => seaSwell(x, y, z, plantWindUniforms.uTime.value);
        this.snowNow = 0;
        this.graupelNow = 0;
        this.waterLandingRevision = -1;
        for (const effect of [this.wetRocks, this.waterImpacts, this.rain, this.rainStreaks]) {
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

        // Samouczek (pierwsze minuty w trybie przygody) - Tutorial.js.
        // Czy go zacząć, pyta main.js (menu.showTutorialOffer).

        this.tutorial = new Tutorial(this, worldInfo.tutorial ?? null);

        this.eatDelay = 0;

        // Trwające jedzenie: { type, slot, time, seconds, bite } albo null
        // (GameInteraction.js - eat, updateEating).
        this.eating = null;

        this.seenJumps = 0;

        // Utrata przytomności pod wodą i pobudka na brzegu.

        this.blackout = new Blackout(this);

        // Łóżka, posłania i sen (0.98.0).

        this.beds = new Beds(this);

        this.sleep = new Sleep(this);

        // Zimno i zamarzanie (1.26.0): odczuwalna temperatura (Warmth.js)
        // i bryła lodu (Freeze.js).

        this.warmth = new Warmth(this);

        this.freeze = new Freeze(this);


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

        // Wyrzucone przedmioty leżące w świecie (0.100.0 - Drops.js).
        this.drops = new Drops(this, worldInfo.drops);
        // Opadłe owoce i zimowy rozwój roślin (1.22.0).
        this.orchard = new Orchard(this, worldInfo.orchard);
        // Psucie się jedzenia (1.23.0).
        this.spoilage = new Spoilage(this);
        // Schnięcie drewna (1.33.0).
        this.woodDrying = new WoodDrying(this);
        this.drops.renderer = new DropRenderer(this);

        // Skrzynie: zawartość i modele (Chests.js); PPM otwiera ekwipunek
        // ze skrzynią (onOpenChest - main.js).
        this.chests = new Chests(this, worldInfo.chests);
        // Stoły stolarskie i furtki (0.90.0) - deski na blatach w zapisie.
        this.carpenterTables = new CarpenterTables(this, worldInfo.carpenterTables);
        // Stoły krawieckie (1.27.0) - materiał na blatach w zapisie.
        this.sewingTables = new SewingTables(this, worldInfo.sewingTables);
        // Drewutnie (1.34.0) - stosy polan do suszenia.
        this.woodpiles = new Woodpiles(this, worldInfo.woodpiles);
        // Ścinanie drzew (1.36.0): karby i padające drzewa (bez zapisu).
        this.felling = new Felling(this);
        // Kozły (1.38.0): leżący pień między dwoma kozłami tnie się szybko.
        this.sawhorses = new Sawhorses(this);
        // Twardość i zużycie siekiery (1.39.0).
        this.toolWear = new ToolWear(this);
        // Powalony pień przy miejscu startu nowego świata (1.37.0).
        this.starterLog = new StarterLog(this, !worldInfo.player);
        this.onOpenChest = null;

        // Ubrania na postaci (1.27.0): main.js maluje je na skórce
        // (player/skin.js - setWornClothes). equip - 4 stosy albo null.
        this.onClothes = null;
        // Wypalanie się pochodni (1.35.0) - przed obrazem pochodni, który
        // zgłasza mu każdą zobaczoną pochodnię.
        this.torchBurn = new TorchBurn(this, worldInfo.torchBurn);
        this.torches = new TorchRenderer(this);
        this.torches.setLowDetail(this.settings.get('potato'));
        // Nacięcia w pniach (1.41.0, dary pnia): żywica i soki.
        this.treeTaps = new TreeTaps(this, worldInfo.treeTaps);
        this.tapRenderer = new TapRenderer(this, this.treeTaps);
        // Drzwi (0.91.0) - modele z animacją otwierania.
        this.doors = new DoorRenderer(this);

        // Jeżyki (1.18.0) - pierwsze zwierzęta; nie zapisują się w świecie.
        this.hedgehogs = new Hedgehogs(this);

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

        this.saver.drops = this.drops;
        this.saver.orchard = this.orchard;
        this.saver.sewingTables = this.sewingTables;
        this.saver.woodpiles = this.woodpiles;
        this.saver.torchBurn = this.torchBurn;
        this.saver.treeTaps = this.treeTaps;

        // Drzewo w locie ląduje, zanim świat zapisze się przy wyjściu.
        this.saver.beforeExitSave = () => this.felling.finishAll();

        this.saver.saveOnExit();

        // Od razu zapisujemy, żeby nowy świat pojawił się w bazie.

        this.saver.save();

    }

    // --------------------------------------------------------
    // CO KLATKĘ
    // --------------------------------------------------------

    update(dt) {

        // Nieprzytomny gracz (Blackout.js), śpiący i zamarznięty w bryle
        // lodu (Freeze.js) nie sterują.
        const fainted = this.blackout.update(dt);
        const asleep = this.sleep.update(dt, this.input);
        const iced = this.freeze.update(dt);
        // Padające drzewo tuż nad głową (Felling.js): widok skupia się na
        // nim, sterowanie zamiera - za chwilę ciemność.
        const focus = this.felling.focus;
        if (focus && !fainted) {
            const eye = this.player.pos, fx = focus.x - eye.x, fy = focus.y - (eye.y + (this.player.eyeHeight ?? 1.6)), fz = focus.z - eye.z;
            this.player.yaw = Math.atan2(-fx, -fz);
            this.player.pitch = Math.atan2(fy, Math.hypot(fx, fz));
        }
        const input = fainted || asleep || iced || focus ? NO_INPUT : this.input;
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

        // W lodzie postać stoi; czekający na ratunek może się rozglądać.
        if (iced) {
            if (this.freeze.waiting) this.player.updateLook(this.input);
        }
        else if (!this.rafts?.update(dt, input)) this.player.update(dt, input);

        this.updateFootsteps();


        // Test wydajności: kamera powoli obraca się dookoła.

        if (this.benchmark) {
            this.updateBenchmark(dt);
        }


        // Upływ czasu. Z włączonym debugiem (F3) klawisze [ i ]
        // przestawiają zegar o godzinę (do oglądania nieba).

        // (W przyspieszonym czasie zegar ustawia Freeze.)
        if (this.freeze.phase !== 'lapse') this.time.update(dt);

        this.warmth.update(dt);

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

        // Wyrzucanie (Q - jedna sztuka, z kucaniem - cały stos), leżące
        // przedmioty i podnoszenie.

        if (input.consumeKeyPress('KeyQ') && !this.sleep.active) {
            this.eating = null;
            this.drops.throwSelected(this.player.crouching);
        }

        this.drops.update(dt);

        this.chests.update(dt);
        this.carpenterTables.update(dt);
        this.sewingTables.update(dt);
        this.woodpiles.update(dt);
        this.felling.update(dt);
        this.starterLog.update(dt);
        this.torchBurn.update(dt);
        this.treeTaps.update(dt);
        this.tapRenderer.update(dt);
        this.torches.update(dt);
        this.world.updateLightHolds(dt);
        this.doors.update(dt);
        this.hedgehogs.update(dt);
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

        this.updateWeather(dt);

        profile?.beginStage('light');
        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());
        this.updateWeatherLighting(dt);

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

        // Burza: błyski, pioruny, grzmoty (po meteorytach - światło błysku
        // na terenie dzieli z nimi jedno miejsce w shaderach).

        this.updateStorm(dt);

        // Odłamki niszczonych bloków.

        this.debris.update(dt);

        // Wiatr, spadające liście i owoce, smugi wiatru.

        this.wind = this.weather.wind;
        this.treeParticles.update(dt, this.player, this.wind);
        this.windStreaks.update(dt, this.player, this.wind, this.sky.state?.daylight ?? 1);

        profile?.beginStage('waterfalls');
        this.waterfalls.update(dt, this.player, this.camera);
        this.updateWaterSurfaceEffects(dt);
        profile?.endStage('waterfalls');

        // Osiągnięcia sprawdzane co chwilę (wysokość, nurkowanie...).

        this.achievements?.update(dt);

        this.tutorial.update(dt);

        profile?.beginStage('plants');
        this.updateSeason();
        this.plantGrowth.update(dt);
        this.orchard.update(dt);
        this.spoilage.update(dt);
        this.woodDrying.update(dt);
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

    // Pogoda nad graczem (weather/Weather.js): zachmurzenie zmienia
    // światło całego świata, chmury rzucają cienie, wiatr kołysze
    // roślinami. Przed niebem - niebo bierze z niej zachmurzenie.

    updateWeather(dt) {

        const profile = this.perfDiagnostics;
        const active = this.sky.clouds.active;

        profile?.beginStage('weather');

        this.weather.update(this.time.days, dt, this.camera.position.x, this.camera.position.z, this.camera.position.y);

        this.sky.cloudCover = Math.max(this.settings.get('cloudCover') / 100, active ? this.weather.overcast : 0);
        this.sky.cloudDepth = active ? this.weather.depth : 0;
        // Pył w powietrzu barwi niebo i przygasza słońce.
        this.sky.dust = active ? this.weather.dust : 0;

        plantWindUniforms.uPlantSway.value = this.settings.get('plantWind') ? this.weather.sway : 0;

        // Kołysanie drzew (1.40.0): kierunek i siła wiatru. W ciszy kierunek
        // zostaje dawny, a drzewa ledwo oddychają. Wyłącza je to samo
        // ustawienie, co kołysanie roślin.
        const treeWind = plantWindUniforms.uTreeWind.value, wind = this.weather.wind;
        if (wind.speed > 0.2) { treeWind[0] = wind.x / wind.speed; treeWind[1] = wind.z / wind.speed; }
        treeWind[2] = this.settings.get('plantWind') ? (this.treeWindOverride ?? treeWindStrength(wind.speed)) : 0;

        profile?.endStage('weather');

    }

    updateWeatherLighting(dt) {
        const light = this.sky.clouds.uniforms.uCloudLight.value;
        this.weather.setLight(light, this.sky.clouds.active);
        this.weather.setSky(this.sky.celestial.sunDirection, light,
            this.sky.state.daylight, dt, this.camera.position.x, this.camera.position.z);
    }

    // Wysokość ziemi w miejscu, w które bije piorun: z wczytanych bloków
    // (razem z drzewami), dalej - z generatora terenu.

    stormGround(x, z) {

        const ix = Math.floor(x);
        const iz = Math.floor(z);

        if (this.world.getChunk(Math.floor(ix / CHUNK_SIZE), Math.floor(iz / CHUNK_SIZE))?.blocks) {
            return this.world.getSurfaceY(ix, iz);
        }

        return (this.world.generator.getHeight?.(ix, iz) ?? 0) + 1;

    }


    // Burza (weather/Thunderstorm.js): które wyładowania właśnie błyskają,
    // kanały piorunów, grzmoty i światło błysku na terenie i niebie.

    updateStorm(dt) {

        const profile = this.perfDiagnostics;
        const thunder = this.thunder;
        const camera = this.camera;

        profile?.beginStage('weather');

        thunder.mode = this.settings.get('stormFlashes');
        thunder.update(this.time.days, camera.position);

        // Grzmot każdego nowego wyładowania - dojdzie, gdy doleci dźwięk.

        for (const strike of thunder.started) {
            this.thunderAudio.play(strike, this.shelterCover);
        }

        this.lightning.update(thunder.order, camera,
            2 * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, this.renderer.domElement.height));

        // Światło błysku na terenie, modelach i dalekim terenie: to samo
        // miejsce w shaderach co kula ognia meteorytu (meteorLight.js) -
        // meteoryt ma pierwszeństwo. Błysk świeci tylko tam, dokąd
        // dochodzi światło nieba.

        const light = thunder.light;
        const meteor = meteorLightUniforms.uMeteorColor.value;

        this.stormLight = light.level > 0.002 && meteor.x + meteor.y + meteor.z <= 0;

        if (this.stormLight) {

            const power = light.level * (light.ground ? STORM_LIGHT.ground : STORM_LIGHT.cloud);

            meteorLightUniforms.uMeteorPosition.value.set(light.x, light.y, light.z);
            meteor.set(STORM_LIGHT.color[0] * power, STORM_LIGHT.color[1] * power, STORM_LIGHT.color[2] * power);
            meteorLightUniforms.uMeteorRange.value = light.range;

        }

        meteorLightUniforms.uMeteorSky.value = this.stormLight ? 1 : 0;

        // Niebo i mgiełka rozjaśniają się razem z błyskiem.

        const sky = thunder.sky * STORM_LIGHT.sky;

        skyUniforms.uStormFlash.value.setRGB(STORM_LIGHT.color[0] * sky, STORM_LIGHT.color[1] * sky, STORM_LIGHT.color[2] * sky);

        profile?.endStage('weather');

    }


    // Gaszenie światła błysku, gdy burza się nie liczy (wczytywanie terenu).

    clearStormLight() {

        if (this.stormLight) {
            meteorLightUniforms.uMeteorColor.value.set(0, 0, 0);
            meteorLightUniforms.uMeteorSky.value = 0;
            this.stormLight = false;
        }

        skyUniforms.uStormFlash.value.setRGB(0, 0, 0);

        // Kanały piorunów i poświata w chmurach też gasną.

        if (this.lightning?.active) {
            this.lightning.update(NO_STRIKES, this.camera, 0.003);
        }

        this.thunder?.clearUniforms();

    }

    // Sztorm: fale z wiatrem na tafli morza (shadery i - ten sam rachunek -
    // tratwa oraz liście na wodzie), piana na grzbietach, piana na dalekim
    // morzu. sea - stan morza 0-1 (weather.sea).

    updateSea(sea) {

        const wind = this.weather?.wind;
        const speed = wind?.speed ?? 0;
        const wave = plantWindUniforms.uSeaWave.value;

        // Kierunek zmienia się tylko, gdy wieje (w ciszy zostaje dawny).
        if (speed > 0.2) {
            seaWave.dx = wind.x / speed;
            seaWave.dz = wind.z / speed;
        }

        // Fale tylko tam, gdzie są prawdziwe chunki (dalej płaska woda
        // dalekiego terenu).
        seaWave.amp = SEA_WAVE.height * sea;
        seaWave.radius = Math.max(24, this.viewDistance * 0.9);
        seaWave.cx = this.camera.position.x;
        seaWave.cz = this.camera.position.z;

        wave[0] = seaWave.amp;
        wave[1] = seaWave.dx;
        wave[2] = seaWave.dz;
        wave[3] = seaWave.radius;

        const foam = smoothstep(0.25, 1, sea);

        waterUniforms.uSeaFoam.value = foam;
        cloudUniforms.uSea.value.set(foam, seaWave.dx, seaWave.dz);

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

        // Pada tam, gdzie mówi pogoda (albo tyle, ile ustawiła komenda).
        // O tym, czy to deszcz, czy śnieg, decyduje temperatura tam, gdzie
        // stoi gracz: około zera pada jedno i drugie.
        const local = this.weather.local;
        const weather = this.weather;
        const surfaceFall = this.rainOverride ?? (local.rain > 0.04 ? local.rain : 0);
        const fall = surfaceFall * weather.precipitationAtEye;
        const cold = weather.temperature;
        const rain = fall * (1 - weather.snowShare);

        // Krupa śnieżna: drobne kulki z wypiętrzonych chmur przelotnych
        // opadów, gdy jest około zera.
        const graupel = fall * smoothstep(0.55, 0.7, local.thick) * smoothstep(-4, -1, cold) * (1 - smoothstep(2.5, 5, cold));
        const snow = fall * weather.snowShare * (1 - 0.6 * Math.min(1, graupel * 2));

        // Opad z komendy też zasypuje ziemię wokół gracza.
        if (this.rainOverride !== null && surfaceFall > 0.02) {
            weather.addPrecipitation(this.camera.position.x, this.camera.position.z, surfaceFall, dt / DAY_SECONDS);
        }
        if (Math.abs(rain - this.rain.intensity) > 0.01 || (rain === 0) !== (this.rain.intensity === 0)) {
            this.rain.setIntensity(rain);
        }
        this.rain.update(dt, this.camera, this.sky.state);

        // Kreski dawnego deszczu są ukryte - krople rysuje RainStreaks
        // (ukośne, gęste, pod dachem ich nie ma); RainEffects dalej szuka,
        // gdzie krople trafiają w wodę, i robi na niej kręgi.
        this.rain.mesh.visible = false;

        // Mżawka: słaby opad z niskiej, cienkiej chmury - drobne, wolne krople.
        // (Przy deszczu z komendy decyduje samo natężenie.)
        const drizzle = (1 - smoothstep(0.2, 0.35, rain)) *
            (this.rainOverride === null ? 1 - smoothstep(0.3, 0.5, local.thick) : 1);

        this.rainNow = rain;
        this.rainStreaks.update(dt, this.camera, rain, drizzle, this.weather.wind, this.sky.state);

        // Grad - w środku najsilniejszych burz (albo z komendy); w chłodzie
        // zamiast niego drobniejsza krupa śnieżna.
        this.hailNow = weather.hail * weather.precipitationAtEye;
        this.graupelNow = graupel;
        this.hail.update(dt, Math.max(this.hailNow, graupel), this.weather.wind, this.sky.state, graupel > this.hailNow ? 1 : 0);

        // Śnieg: około zera mokre płaty, na mrozie suchy puch; gdy leży
        // i mocno wieje - zamieć przy ziemi.
        this.snowNow = snow;
        this.snowFall.update(dt, snow, smoothstep(-7, 0.5, cold), this.weather.wind, weather.snowCover, this.sky.state);

        // Pustynia i morze (1.15.0): piasek w burzy piaskowej, bryzgi
        // i fale w sztormie.
        const active = this.sky.clouds.active;
        // (Ustawienie "Fale i piana sztormu" wyłącza sam obraz i huk fal.)
        const sea = active && this.settings.get('seaWaves') !== false ? weather.sea : 0;

        this.sandStorm.update(dt, active ? weather.dust : 0, sea, this.weather.wind, this.sky.state);
        this.updateSea(sea);

        // Wiry pyłowe nad rozgrzaną, suchą pustynią (po deszczu ich nie ma).
        const devils = active && weather.wetness < 0.3
            ? this.dustDevils.update(this.time.days, this.camera.position.x, this.camera.position.z)
            : NO_STRIKES;

        this.devilRenderer.update(devils, this.groundAt, this.weather.wind, this.time.days * DAY_SECONDS,
            this.sky.state, Boolean(this.settings.get('potato')));

        // Szum deszczu i wiatru, stukot gradu; pod dachem i w jaskini
        // przytłumione.
        const eye = this.camera.position;

        this.shelterCover = this.rainStreaks.shelter.cover(eye.x, eye.y, eye.z);
        this.weatherAudio.update({ rain, drizzle, cover: this.shelterCover, speed: this.weather.wind.speed, gust: this.weather.wind.gust,
            hail: Math.max(this.hailNow, 0.4 * graupel), sand: this.sandStorm.level, sea });
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
        this.updateWeather(dt);
        this.clearStormLight();
        profile?.beginStage('light');
        this.sky.update(this.time.days, dt, this.renderer.getPixelRatio());
        this.updateWeatherLighting(dt);
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

        // W bryle lodu postać zastyga w ostatniej pozie.
        const pose = this.freeze.active ? null : this.animator.update(dt, {
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
            landed: player.landed,
            eating: Boolean(this.eating)
        });

        if (pose) this.model.setPose(pose);

        // Śpiący leży (stopy w miejscu gracza, głowa w stronę wezgłowia).
        this.model.place(player.pos, this.sleep.lying ? player.yaw : this.animator.bodyYaw, this.animator.previewLift, this.sleep.lying);

        // Śpiący i zamarznięty nie trzymają niczego w ręce.
        const emptyHanded = this.sleep.lying || this.freeze.active;

        this.model.setHeldBlock(emptyHanded ? null : this.selectedBlock);

        // Bryła lodu wokół zamarzniętego (1.26.0).
        this.model.setIce(this.freeze.ice);


        // Ręka w widoku z oczu i kamera w dół po upadku.

        this.hand.setHeld(emptyHanded ? null : this.selectedBlock);

        this.hand.setEating(Boolean(this.eating));

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

        // Test wydajności liczy polecenia rysowania osobno dla cieni,
        // dalekiego terenu i świata (updateBenchmark).

        const drawn = this.benchmark?.draws;
        // (Atrapy renderera w testach nie mają liczników.)
        const calls = renderer.info?.render ?? { calls: 0 };
        let callsBefore = calls.calls;

        profile?.beginStage('shadows');
        this.shadows.render(this.world, this.camera.position, this.model, this.scene, this.viewDistance, this.farTerrain);
        this.campfires.renderer.renderShadows();
        profile?.endStage('shadows');

        if (drawn) drawn.shadows += calls.calls - callsBefore;
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

        const shake = Math.max(this.meteorites.shake, this.skyfall.shake, this.felling?.shake ?? 0);

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
            profile?.endStage('sky');

            // Daleki teren osobno od nieba (od 1.10.3) - w pomiarze widać,
            // który z nich kosztuje.

            callsBefore = calls.calls;

            profile?.beginStage('farDraw');
            this.farTerrain.render(renderer, camera);

            // Dalekie pioruny: po dalekim terenie (góry je zasłaniają),
            // przed bliskim światem.
            this.lightning?.renderFar(renderer, camera, this.farTerrain);
            profile?.endStage('farDraw');

            if (drawn) drawn.far += calls.calls - callsBefore;

            profile?.beginStage('sky');
            this.spaceView.renderFront(renderer, camera);
            profile?.endStage('sky');

            renderer.clearDepth();

        }

        callsBefore = calls.calls;

        profile?.beginStage('world');

        // Sektory terenu poza kadrem znikają w całości - silnik nie
        // przegląda ich obiektów (rendering/TerrainSectors.js).

        this.world?.sectors?.cull(camera);

        renderer.render(this.scene, camera);
        profile?.endStage('world');

        if (drawn) drawn.world += calls.calls - callsBefore;

        // Lot ponad chmurami: chmury pod kamerą zasłaniają teren.

        if (!this.water.underwater) {
            profile?.beginStage('sky');
            this.sky.renderCloudsBelow?.(renderer, camera);
            profile?.endStage('sky');
        }


        // Promienie światła w powietrzu (na świecie, pod ręką).

        profile?.beginStage('post');
        this.renderLightShafts(camera);
        profile?.endStage('post');


        // Ręka w widoku z oczu - na wierzchu (nigdy nie wchodzi w ścianę).
        // Leżący (śpiący) gracz ma ręce wzdłuż ciała - nie widać ich.

        if (!this.view && this.settings.get('showHand') && !this.sleep.lying && !this.freeze.active) {
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
            updateBounceLightingState(this.bounceLighting, this.settings, this.sky));
        this.campfires.renderer.updateBounce();
        this.woodpiles.renderer.updateBounce();
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
    // TEST WYDAJNOŚCI (/wydajnosc test | lot). Wynik trafia na czat
    // i do raportu diagnostycznego (/logi).
    //
    //   test - kamera obraca się raz dookoła: koszt rysowania tego,
    //          co już wczytane,
    //   lot  - gracz leci prosto przed siebie nad terenem: koszt
    //          wczytywania świata (generowanie, siatki, daleki teren).
    //          Po teście wraca na miejsce startu.
    //
    // Oprócz FPS wynik pokazuje, na co szedł czas klatki: ranking
    // etapów CPU (PerfDiagnostics - te same etapy co w /logi) i czas
    // karty graficznej, jeśli sterownik go mierzy.
    // --------------------------------------------------------

    startBenchmark(seconds, mode = 'spin') {

        const player = this.player;

        this.benchmark = {
            seconds,
            mode,
            time: 0,
            startYaw: player.yaw,
            startPitch: player.pitch,
            startPos: player.pos.clone(),
            startFlying: player.flying,
            height: player.pos.y + BENCHMARK_FLIGHT.climb,
            calls: 0,
            triangles: 0,
            samples: 0,
            queue: 0,
            // Polecenia rysowania według przebiegu (Game.render) i sektory
            // terenu w kadrze.
            draws: { shadows: 0, far: 0, world: 0 },
            sectorsVisible: 0
        };

        this.perf?.reset();
        this.perfDiagnostics?.startSession();

    }


    updateBenchmark(dt) {

        const test = this.benchmark;
        const player = this.player;

        test.time += dt;


        if (test.mode === 'flight') {

            // Prosto w stronę, w którą patrzył gracz, stałą prędkością
            // i ponad terenem - bez kolizji i bez sterowania.

            const distance = BENCHMARK_FLIGHT.speed * Math.min(test.time, test.seconds);

            player.flying = true;
            player.vel.set(0, 0, 0);
            player.pos.set(
                test.startPos.x - Math.sin(test.startYaw) * distance,
                test.height,
                test.startPos.z - Math.cos(test.startYaw) * distance
            );
            player.yaw = test.startYaw;
            player.pitch = BENCHMARK_FLIGHT.pitch;

        }
        else {

            // Patrzymy lekko w dół, jak przy zwykłym chodzeniu.

            player.yaw = test.startYaw + 2 * Math.PI * Math.min(1, test.time / test.seconds);
            player.pitch = -0.1;

        }

        player.updateCamera();


        const info = this.renderer.info.render;

        test.calls += info.calls;
        test.triangles += info.triangles;
        test.queue = Math.max(test.queue, this.world.loadQueue.length + this.world.dirtyChunks.size);
        test.sectorsVisible += this.world.sectors.visible;
        test.samples++;


        if (test.time < test.seconds) {
            return;
        }


        this.benchmark = null;

        if (test.mode === 'flight') {
            player.pos.copy(test.startPos);
            player.vel.set(0, 0, 0);
            player.flying = test.startFlying;
        }

        player.yaw = test.startYaw;
        player.pitch = test.startPitch;

        player.updateCamera();


        const summary = this.perf?.summary(test.seconds + 1);
        const stages = this.perfDiagnostics?.endSession() ?? null;

        if (!summary) {
            return;
        }

        const result = {
            mode: test.mode,
            seconds: test.seconds,
            fps: summary.fps,
            low1: summary.low1,
            worstMs: summary.worstMs,
            updateMs: summary.updateMs,
            renderMs: summary.renderMs,
            calls: Math.round(test.calls / test.samples),
            triangles: Math.round(test.triangles / test.samples),
            queue: test.queue,
            distance: test.mode === 'flight' ? Math.round(BENCHMARK_FLIGHT.speed * test.seconds) : 0,
            viewDistance: this.viewDistance,
            farTerrain: this.settings.get('farTerrain') || 0,
            potato: Boolean(this.settings.get('potato')),
            draws: {
                shadows: Math.round(test.draws.shadows / test.samples),
                far: Math.round(test.draws.far / test.samples),
                world: Math.round(test.draws.world / test.samples)
            },
            terrain: { ...this.world.sectors.stats(), visible: Math.round(test.sectorsVisible / test.samples) },
            stages
        };

        this.onMessage?.(benchmarkText(result));
        this.onBenchmark?.(result);

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

        // Mgła i deszcz zagęszczają powietrze (weather/Weather.js).
        updateAerialPerspective(this.settings, this.sky, fog, this.weather
            ? { fog: this.weather.fog, rain: (this.rainNow ?? 0) + 2.2 * (this.snowNow ?? 0) + 0.7 * (this.snowFall?.driftLevel ?? 0),
                dust: this.sky.dust }
            : null);

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

        // Łączenie sąsiednich chunków w jedno polecenie rysowania
        // (rendering/RegionBatches.js; /ustaw laczenie-terenu wyl - do porównań).
        this.world.setRegionBatching?.(settings.get('terrainBatching'));
        this.world.setDistanceLod(true);

        // Modele -> Animacje roślin (poziom modeli i wiatr - main.js,
        // applyPlantSettings - wspólne z tłem menu).

        this.plantAnimations?.setEnabled(settings.get('plantAnimations'));


        // Zasięg widoku: pełne bloki do 192, dalej stopniowo prostszy krajobraz.
        // Kamera świata musi sięgać do ostatnich wczytanych chunków.

        const viewDistance = this.viewDistance;

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
        this.rainStreaks?.setAmount(potato ? .35 : 1);
        this.water?.waterfallAudio?.setAmount(potato ? .35 : 1);


        // Cienie słońca i promienie światła (nie w trybie ziemniaka).

        this.shadows.setQuality(potato ? 0 : settings.get('shadows'));

        setShadowDefine([blockMaterial, plantMaterial, waterMaterial, leafMaterial], this.shadows.enabled, this.shadows.hasFar);
        if (this.waterfalls) setShadowDefine(this.waterSurfaceMaterials(), this.shadows.enabled, this.shadows.hasFar);

        setFarTerrainShadows(this.shadows.hasFar);

        modelLight.uModelShadows.value = this.shadows.enabled ? 1 : 0;
        modelLight.uModelDistantShadows.value = this.shadows.enabled ? 1 : 0;

        this.shaftsEnabled = !potato && settings.get('lightShafts');

        // Chmury: w trybie ziemniaka płaskie i bez cieni na terenie.

        const clouds = settings.get('clouds');

        if (this.sky.clouds) this.sky.clouds.quality = potato && clouds === 'pelne' ? 'plaskie' : clouds;
        if (this.weather) this.weather.shadows = !potato && settings.get('cloudShadows');
        if (this.weather) this.weather.wetSurfaces = !potato && settings.get('wetGround');
        if (this.weather) this.weather.snowSurfaces = settings.get('snowCover');


        // Model gracza: wierzchnia warstwa skórki, styl zgięć, tryb ziemniaka.

        if (this.model) {

            this.model.setOverlay(settings.get('skinOverlay'));

            this.model.setStyle(settings.get('jointStyle'));

            this.model.setLowDetail(potato);

        }


        // Ręka w widoku z oczu: tryb ziemniaka, rękaw (wierzchnia warstwa).

        if (this.hand) {

            this.hand.setLowDetail(potato);
            this.drops?.renderer?.setLowDetail(potato);

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
            updateBounceLightingState(this.bounceLighting, settings, this.sky));
        const position = this.player.pos;
        const bounce = this.bounce.sample(position.x, position.y + 1.2, position.z);
        modelLight.uModelBounce.value.set(bounce[0], bounce[1], bounce[2]);
        this.campfires?.renderer.updateBounce();
        this.woodpiles?.renderer.updateBounce();
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

        // Samouczek zalicza kroki po tych samych zdarzeniach.

        this.tutorial?.event(name, data);

    }


    // Machnięcie ręką: model gracza (z trzeciej osoby) i ręka w widoku
    // z oczu. seconds - ile trwa machnięcie ręki (przy kopaniu tyle, co
    // jedno uderzenie - kolejne machnięcia łączą się w płynny ruch).

    // ŚWIAT NADRABIA CZAS (0.100.0). Sen i utrata przytomności
    // przesuwają zegar - a razem z nim wszystko, co w świecie trwa:
    // ogniska się dopalają, rośliny rosną, pola zarastają. seconds - ile
    // sekund prawdziwego czasu "minęło" (godzina gry to 50 sekund).
    // Nowy system zależny od czasu dopisz tutaj.

    // PORY ROKU (src/sky/Seasons.js, docs/pory-roku.md): podaje czas gry
    // światu i wzrostowi roślin, a przy zmianie pory mówi o tym graczowi.
    // Nowy system zależny od pory roku dopisz tutaj (albo pytaj
    // seasonAt(this.time.days) tam, gdzie go potrzebujesz).

    updateSeason() {

        const days = this.time.days;

        this.world.updateSeasons(days);
        this.plantGrowth.days = days;

        // Kolor liści, opadłych liści i zimowy śnieg (LeafSeasons.js).
        setLeafSeason(days);

        // Śnieg na liściach leży wtedy, gdy leży na ziemi (pogoda), a nie
        // przez całą zimę.
        if (this.weather) {
            leafSeasonUniforms.uLeafSnow.value = this.weather.snowSurfaces ? this.weather.snowCover : 0;
        }
        this.treeParticles?.setSeason(days);
        this.farTerrain?.setLeafSeason(days);

        const season = seasonAt(days);

        if (this.seasonIndex === season.index) {
            return;
        }

        const changed = this.seasonIndex !== undefined;

        this.seasonIndex = season.index;

        if (changed) {
            // (Zimą nic nie rośnie i nie owocuje - 1.21.0, blocks/fruitSeasons.js.)
            this.onNotice?.(season.key === 'lato' ? 'Nadeszło lato' : season.key === 'zima' ? 'Nadeszła zima - rośliny zasypiają' : `Nadeszła ${season.name}`);
        }

        this.achieve('season', { key: season.key, changed });

    }


    // UBRANIA (1.27.0, items/clothing.js). Po każdej zmianie tego, co
    // gracz ma na sobie: nowa skórka (onClothes - main.js), kod dla innych
    // graczy (NetSession) i osiągnięcia.

    clothesChanged() {

        const equip = this.inventory.equip;

        this.clothes = clothesCode(equip);

        this.onClothes?.(equip);

        const worn = equip.filter(Boolean);

        if (worn.length > 0) {
            this.achieve('dressed', { count: worn.length, colored: worn.some((item) => item.look?.main) });
        }

    }


    advanceWorld(seconds) {

        if (!(seconds > 0)) {
            return;
        }

        this.campfires.advance(seconds);

        this.plantGrowth.advance(seconds);

        this.spoilage.advance(seconds);
        this.woodDrying.advance(seconds);
        this.torchBurn.advance(seconds);
        this.treeTaps.advance(seconds);

    }


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


    // Otwieranie / zamykanie drzwi albo klapy z drewna `wood` w bloku
    // `block` - każde drewno brzmi inaczej (audio/doorSounds.js).

    playDoorSound(kind, open, wood, block) {

        if (!this.sounds) {
            return;
        }

        const { name, pitch, volume } = doorSound(wood, kind, open);

        this.sounds.play(name, {
            position: new THREE.Vector3(block.x + 0.5, block.y + (kind === 'door' ? 1 : 0.5), block.z + 0.5),
            pitch, volume
        });

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

        // Po śniegu (pod gołym niebem, gdy leży) - skrzypienie śniegu.

        const feet = this.player.pos;
        const snowy = water < 0.03 && (this.weather?.snowCover ?? 0) > 0.45 &&
            this.rainStreaks.shelter.roof(feet.x, feet.z) <= feet.y + 0.6;

        if (snowy) {
            this.sounds.play('step_snow', { volume });
        }
        else if (type && water < 0.3) {
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
        // Padające drzewo ląduje przed ostatnim zapisem (Felling.js).
        this.felling.finishAll();

        if (save && !(await (this.net?.isClient ? this.net.saveBeforeExit() : this.saver.flush()))) {
            return false;
        }

        // Po błędzie zapisu gra wraca na pauzę z działającą sesją znajomych.
        if (this.net?.isClient) { this.net.leave(save); this.net.dispose(); }
        else if (this.net?.isHost) this.net.close();

        this.saver.stop();

        if (this.shaderWarmup?.handTorch) disposeTorchModel(this.shaderWarmup.handTorch);
        this.shaderWarmup = null;

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
        this.drops.dispose();

        this.chests.dispose();
        this.carpenterTables.dispose();
        this.sewingTables.dispose();
        this.woodpiles.dispose();
        this.felling.dispose();
        this.torchBurn.dispose();
        this.tapRenderer.dispose();
        this.treeTaps.dispose();
        this.torches.dispose();
        this.doors.dispose();
        this.hedgehogs.dispose();

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
        this.hail.dispose();
        this.snowFall.dispose();
        this.sandStorm.dispose();
        this.devilRenderer.dispose();
        this.updateSea(0);
        this.rainStreaks.dispose();
        this.weatherAudio.dispose();
        this.thunderAudio.dispose();
        this.lightning.dispose();
        this.thunder.dispose();
        this.stormLight = true;
        this.clearStormLight();

        this.weather.dispose();
        plantWindUniforms.uPlantSway.value = this.settings.get('plantWind') ? 1 : 0;

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
            : 'Cienie: wył.';


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

            `Pora roku: ${seasonAt(this.time.days).name}, dzień ${seasonAt(this.time.days).day} z ${seasonAt(this.time.days).days} | ` +
            `Temperatura: ${Math.round(this.weather.temperature)}°C` +
            // (Od 1.15.0: pył nad pustynią i stan morza - tylko gdy są.)
            `${this.weather.dust > 0.05 ? ` | Pył: ${Math.round(this.weather.dust * 100)}%` : ''}` +
            `${this.weather.seaMask > 0.5 || this.weather.seaOverride !== null ? ` | Morze: ${seaName(this.weather.sea)}` : ''}<br>` +

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

            // Klawisze z przypisań gracza (input/bindings.js).
            formatKeys(`1-9 / kółko - wybór bloku | [pick] - weź blok | [inventory] - ekwipunek<br>` +

            `[break] - zniszcz | [use] - postaw / zbierz owoce | [eat] - zjedz | [drop] - wyrzuć<br>` +

            `[forward] [left] [back] [right] - ruch | [jump] - skok | [crouch] - kucanie | 2× [forward] albo [sprint] - bieg<br>` +
            `Mysz - kamera | [view] - widok | ESC - pauza | [debug] - debug | `) + `[ ] - czas ±1 h<br>` +

            formatKeys(`[chat] - czat | /pomoc - komendy`) +

            `<br><br>${status}`;

        if (html !== hud.html) {
            element.innerHTML = html;
            hud.html = html;
        }

    }

}
