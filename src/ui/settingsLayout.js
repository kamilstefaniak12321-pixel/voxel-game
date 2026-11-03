import { EXPERIMENTS } from '../settings/Settings.js';

// ------------------------------------------------------------
// UKŁAD EKRANU USTAWIEŃ (src/ui/Menu.js - showSettings)
//
// Co jest na której zakładce ustawień (kolejność = kolejność na ekranie).
// Obraz: na górze najważniejsze, reszta pod "Zaawansowane" (ADVANCED_VIDEO).
// 'graphicsPreset' - przycisk jakości grafiki (kilka ustawień naraz).
// Ustawienia, których nie ma w menu (np. loadBudget, showDebug - F3),
// zostają w /ustaw.

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
        'cameraDistance',
        'showHand',
        'viewBobbing',
        'skinOverlay',
        'jointStyle'
    ],

    look: [
        'theme',
        'inventoryStyle',
        'hudScale',
        'texturePack'
    ],

    game: [
        'meteorites',
        'showFps',
        'autoUpdates'
    ],

    experiments: EXPERIMENTS

};

export const ADVANCED_VIDEO = [
    'shadows',
    'ambientOcclusion',
    'lightShafts',
    'fancyLeaves',
    'farDetail',
    'renderScale',
    'dynamicLight',
    'potato'
];


// Ustawienia, których celowo nie ma w menu (tylko /ustaw): czas na
// wczytywanie chunków, napisy F3 (klawisz F3), rozdzielczość tekstur
// (w zakładce Wygląd - razem z paczką tekstur).
export const COMMAND_ONLY_SETTINGS = ['loadBudget', 'showDebug', 'textureResolution'];
