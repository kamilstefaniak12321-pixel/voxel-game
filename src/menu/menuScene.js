// Scenografia menu: prawdziwy generator i zasoby aktualnej wersji gry.
// Kolejne duże wydania mogą wymienić ten opis, zachowując nawigację UI.
export const MENU_SCENE = {
    id: 'river-valley-0.56',
    seed: 2138286349,
    terrain: 'realistic',
    time: 10.5 / 24,
    views: {
        home: { position: [-480, 100, 384], target: [-520, 88, 450] },
        river: { position: [-477, 79, 375], target: [-510, 78, 420] },
        forest: { position: [-474, 78, 388], target: [-481, 74.5, 349] },
        mountains: { position: [-476, 106, 426], target: [-530, 103, 580] }
    }
};

// Osobny odczyt ustawień: nie zapisuje ani nie zmienia preferencji gracza.
export function menuSettings(settings, mobile = false) {
    return {
        get(key) {
            const value = settings.get(key);
            if (key === 'viewDistance') return Math.min(value, mobile ? 48 : 64);
            if (key === 'farTerrain') return Math.min(value, mobile ? 1024 : 2048);
            if (key === 'farDetail') return Math.min(value, 2);
            if (key === 'loadBudget') return Math.min(value, 4);
            if (key === 'fov') return 58;
            return value;
        }
    };
}
