// Scenografia menu: prawdziwy generator i zasoby aktualnej wersji gry.
// Kolejne duże wydania mogą wymienić ten opis, zachowując nawigację UI.
export const MENU_SCENE = {
    id: 'autumn-cascades-0.86',
    seed: 86,
    terrain: 'realistic',
    time: 10.7 / 24,
    // Naturalne kaskady tego seeda: 80 -> 73 -> 62. Nie przebudowujemy
    // generatora ani świata gracza dla scenografii menu.
    waterfalls: [{ x: -768, z: 192, top: 80, bottom: 73 },
        { x: -752, z: 208, top: 73, bottom: 62 }],
    views: {
        home: { position: [-779, 77, 257], target: [-731, 70, 242], atmosphere: 'warm' },
        river: { position: [-752, 76, 236], target: [-776, 72, 199], atmosphere: 'waterfall' },
        forest: { position: [-775, 80, 266], target: [-741, 67, 300], atmosphere: 'neutral' },
        mountains: { position: [-773, 82, 244], target: [-725, 73, 229], atmosphere: 'warm' }
    }
};

// Osobny odczyt ustawień: nie zapisuje ani nie zmienia preferencji gracza.
export function menuSettings(settings, mobile = false) {
    return {
        get(key) {
            const value = settings.get(key);
            if (key === 'viewDistance') return mobile ? 128 : 256;
            if (key === 'farTerrain') return mobile ? 768 : 1024;
            if (key === 'farDetail') return Math.min(value, 2);
            if (key === 'loadBudget') return mobile ? 6 : 12;
            if (key === 'fov') return 58;
            return value;
        }
    };
}
