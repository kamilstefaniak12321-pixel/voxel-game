// ------------------------------------------------------------
// CHUNKI
// ------------------------------------------------------------

// Rozmiar jednego chunka w blokach.
export const CHUNK_SIZE = 16;     // szerokość i długość (X, Z)
export const CHUNK_HEIGHT = 64;   // wysokość (Y) = limit budowania

// Rozmiar startowego świata w chunkach.
export const WORLD_CHUNKS_X = 8;
export const WORLD_CHUNKS_Z = 8;

// Rozmiar startowego świata w blokach (wyliczany z chunków).
export const WORLD_SIZE_X = WORLD_CHUNKS_X * CHUNK_SIZE;
export const WORLD_SIZE_Z = WORLD_CHUNKS_Z * CHUNK_SIZE;

// ------------------------------------------------------------
// TEREN
// ------------------------------------------------------------

// Seed pierwszego świata: liczba albo tekst.
// Ten sam seed = ten sam świat. Każdy świat ma własny seed,
// to jest tylko wartość domyślna.
export const WORLD_SEED = 'lepidolit';

// Średnia wysokość terenu (poziom nizin).
export const TERRAIN_BASE_HEIGHT = 18;

// Wzgórza: o ile bloków teren faluje w górę i w dół
// oraz jak szerokie są wzgórza (większa liczba = łagodniejsze).
export const TERRAIN_HILL_HEIGHT = 5;
export const TERRAIN_HILL_SCALE = 48;

// Góry: ile bloków dodają w najwyższym miejscu
// oraz jak rozległe są pasma górskie.
export const TERRAIN_MOUNTAIN_HEIGHT = 26;
export const TERRAIN_MOUNTAIN_SCALE = 80;

// Powyżej tej wysokości nie ma już trawy - zostaje goła skała.
export const TERRAIN_ROCK_LEVEL = 32;

// Grubość warstwy ziemi pod trawą.
export const TERRAIN_DIRT_DEPTH = 3;

// Żyły lepidolitu w kamieniu:
// rozmiar żył w blokach i próg (0-1, wyżej = rzadziej).
export const LEPIDOLITE_VEIN_SCALE = 7;
export const LEPIDOLITE_VEIN_THRESHOLD = 0.5;

// ------------------------------------------------------------
// GRACZ
// ------------------------------------------------------------

export const GRAVITY = -30;
export const MOVE_SPEED = 5;
export const JUMP_SPEED = 9;

// Maksymalna prędkość spadania (bloki na sekundę).
export const MAX_FALL_SPEED = 50;

// Podstawowa czułość myszy (radiany na piksel ruchu).
// Gracz może ją zmienić w ustawieniach (procent tej wartości).
export const MOUSE_SENSITIVITY = 0.002;

export const PLAYER_REACH = 5;

// ------------------------------------------------------------
// INTERFEJS
// ------------------------------------------------------------

// Nazwa gry: na ekranie tytułowym i na karcie przeglądarki.
export const GAME_TITLE = 'Voxel Game';

// Motywy menu do wyboru w ustawieniach:
//   nazwa folderu w assets/ui/themes/  ->  nazwa widoczna w grze.
// Nowy motyw: skopiuj folder motywu, zmień jego theme.css
// i dopisz go tutaj.
export const UI_THEMES = {
    default: 'Ziemia',
    lepidolit: 'Lepidolit'
};

// Motyw domyślny (zanim gracz wybierze inny w ustawieniach).
export const UI_THEME = 'default';

// ------------------------------------------------------------
// USTAWIENIA GRACZA (domyślne wartości i zakresy)
// ------------------------------------------------------------

// Czułość myszy w procentach (100 = MOUSE_SENSITIVITY).
export const DEFAULT_MOUSE_SENSITIVITY = 100;

// Pole widzenia kamery w stopniach.
export const DEFAULT_FOV = 75;

// Zasięg widzenia w blokach - dalej teren znika we mgle.
export const DEFAULT_VIEW_DISTANCE = 45;
