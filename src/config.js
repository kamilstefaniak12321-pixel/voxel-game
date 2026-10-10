// ------------------------------------------------------------
// CHUNKI
// ------------------------------------------------------------

// Rozmiar jednego chunka w blokach.
export const CHUNK_SIZE = 16;     // szerokość i długość (X, Z)
export const CHUNK_HEIGHT = 64;   // wysokość (Y) = limit budowania

// Ile milisekund na klatkę może zająć wczytywanie chunków
// (generowanie i budowanie meshy). Więcej = świat dogrywa się
// szybciej, ale gra może lekko przycinać przy szybkim ruchu.
export const CHUNK_LOAD_BUDGET_MS = 4;

// ------------------------------------------------------------
// ŚWIAT
// ------------------------------------------------------------

// Świat generuje się wokół gracza bez końca - aż do granicy.
// Granica = ile bloków od środka (0, 0) w każdą stronę.
// Dalej teren się nie generuje, a gracz zatrzymuje się na niej.
// Infinity = bez granicy. (Szum terenu powtarza się mniej więcej
// co 61 000 bloków, więc przy 30 000 nikt nie trafi na powtórkę.)
export const WORLD_BORDER = 30000;

// Miejsce startu w nowym świecie (w blokach).
export const WORLD_SPAWN_X = 0;
export const WORLD_SPAWN_Z = 0;

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
// OŚWIETLENIE
// ------------------------------------------------------------

// Światło ma poziomy od 0 (ciemno) do 15 (pełne światło dnia).
// Z każdym blokiem odległości od lampy albo od nieba (np. w głąb
// tunelu) światło spada o jeden poziom.

// Jak jasność zależy od poziomu światła:
//   1   = równo (każdy poziom w dół zabiera tyle samo jasności),
//   1.5 = półmrok jest ciemniejszy (bardziej klimatycznie),
//   0.7 = półmrok jest jaśniejszy.
export const LIGHT_CURVE = 1.2;

// Jak jasno jest w zupełnej ciemności (0 = czarno, 1 = jak w dzień).
export const LIGHT_MIN_BRIGHTNESS = 0.08;

// Kolor światła lamp (i innych świecących bloków) - ciepły żółty.
export const BLOCK_LIGHT_COLOR = 0xffd7a0;

// Cienie w kątach i przy ścianach (ambient occlusion):
// 0 = wyłączone, 0.5 = wyraźne, 1 = bardzo mocne.
export const AMBIENT_OCCLUSION = 0.45;

// ------------------------------------------------------------
// DZIEŃ I NOC
// ------------------------------------------------------------

// Ile minut (prawdziwych) trwa cała doba w grze - dzień i noc.
// W Minecrafcie 20.
export const DAY_LENGTH_MINUTES = 20;

// O której godzinie zaczyna się nowy świat:
// 0 = północ, 0.25 = 6:00, 0.5 = południe, 0.75 = 18:00.
export const START_TIME_OF_DAY = 0.3;

// Jak nisko po niebie chodzi słońce (w stopniach). 0 = w południe
// dokładnie nad głową; więcej = niżej, po południowej stronie nieba
// (dłuższe cienie, ładniejsze cieniowanie ścian).
export const SUN_PATH_TILT = 35;

// Po ilu dniach księżyc wraca do tej samej fazy (np. pełnia -> pełnia).
// Każdego dnia wschodzi o (24 / MOON_CYCLE_DAYS) godzin później,
// więc raz świeci w nocy, a raz w dzień.
export const MOON_CYCLE_DAYS = 8;

// Ile gwiazd jest na niebie.
export const STAR_COUNT = 1600;

// Kolory nieba o różnych porach dnia są w src/sky/SkyColors.js.

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
// PASEK BLOKÓW
// ------------------------------------------------------------

// Liczba miejsc na pasku (klawisze 1-9).
export const HOTBAR_SIZE = 9;

// Co jest na pasku w nowym świecie (kolejność = klawisze 1, 2, 3...).
// Pozostałe miejsca są puste - środkowym przyciskiem myszy można
// do nich "wziąć" blok, na który się patrzy.
export const HOTBAR_DEFAULT = [
    'grass',
    'dirt',
    'stone',
    'lamp',
    'lepidolite'
];

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
