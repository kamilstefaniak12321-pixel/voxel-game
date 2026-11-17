import { EXPERIMENTS } from '../settings/Settings.js';

// ------------------------------------------------------------
// UKŁAD EKRANU USTAWIEŃ (src/ui/Menu.js - showSettings)
//
// Co jest na której zakładce ustawień (kolejność = kolejność na ekranie).
// Obraz: na górze najważniejsze, reszta pod "Zaawansowane" (ADVANCED_VIDEO).
// 'graphicsPreset' - przycisk jakości grafiki (kilka ustawień naraz).
// Ustawienia, których nie ma w menu (np. loadBudget, showDebug - F3),
// zostają w /ustaw. 'keys' - przycisk otwierający ekran klawiszy
// (Menu.showKeys, input/bindings.js).

export const SETTINGS_TABS = {

    video: [
        'graphicsPreset',
        'viewDistance',
        'farTerrain',
        'fov',
        'brightness',
        'fpsLimit'
    ],

    sound: [
        'volumeMaster',
        'volumeMusic',
        'volumeBlocks',
        'volumeWorld',
        'volumeUi'
    ],

    player: [
        'skin',
        'mouseSensitivity',
        'invertMouse',
        'keys',
        'cameraDistance',
        'showHand',
        'viewBobbing',
        'skinOverlay',
        'jointStyle'
    ],

    look: [
        'theme',
        'menuMotion',
        'inventoryStyle',
        'inventoryScale',
        'hudScale',
        'texturePack'
    ],

    game: [
        'meteorites',
        'stormFlashes',
        'showFps',
        'performanceLogs',
        'autoUpdates'
    ],

    models: [
        'plantModels',
        'leafModel',
        'plantWind',
        'plantAnimations',
        'fallingLeaves',
        'windStreaks'
    ],

    experiments: EXPERIMENTS,

    // Poradnik: samouczek (powtórka, pytanie w nowych światach) i notatka
    // "jak grać" (src/ui/guide.js).
    guide: [
        'tutorial'
    ]

};

export const ADVANCED_VIDEO = [
    'lightingLook',
    'atmosphereLook',
    'lightingMaterials',
    'surfaceBounce',
    'leafTransmission',
    'shadows',
    'ambientOcclusion',
    'lightShafts',
    'clouds',
    'cloudShadows',
    'wetGround',
    'snowCover',
    'seaWaves',
    'fancyLeaves',
    'farDetail',
    'renderScale',
    'dynamicLight',
    'potato'
];


// Ustawienia, których celowo nie ma w menu (tylko /ustaw): czas na
// wczytywanie chunków, łączenie terenu (do porównań), napisy F3 (klawisz F3), rozdzielczość tekstur
// (w zakładce Wygląd - razem z paczką tekstur).
export const COMMAND_ONLY_SETTINGS = ['loadBudget', 'terrainBatching', 'showDebug', 'textureResolution', 'cloudCover',
    'bounceStrength', 'bounceSaturation', 'materialSpecular',
    // Gra wieloosobowa: imię - w oknie dołączania i w pauzie, serwer - /ustaw serwer.
    'playerName', 'netServer', 'playerId'];
