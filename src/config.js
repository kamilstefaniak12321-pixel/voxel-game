// ------------------------------------------------------------
// CHUNKI
// ------------------------------------------------------------

// Rozmiar jednego chunka w blokach.
export const CHUNK_SIZE = 16;     // szerokość i długość (X, Z)
export const CHUNK_HEIGHT = 128;  // wysokość (Y) = limit budowania
                                  // (dawniej 64 - stare zapisy są
                                  // automatycznie powiększane)

// Ile milisekund na klatkę może zająć wczytywanie chunków
// (generowanie i budowanie meshy). Więcej = świat dogrywa się
// szybciej, ale gra może lekko przycinać przy szybkim ruchu.
// To wartość domyślna - gracz zmienia ją w ustawieniach
// ("Wczytywanie").
export const CHUNK_LOAD_BUDGET_MS = 4;

// Przy wejściu do świata (pod ekranem wczytywania) od razu
// wczytuje się tyle chunków w każdą stronę - reszta dogrywa się
// już w trakcie gry. Dzięki temu duży zasięg widzenia nie wydłuża
// ekranu wczytywania.
export const START_LOAD_RADIUS = 5;

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

// Typ terenu nowego świata (wybiera się go przy tworzeniu świata):
//   'realistic' - nowy, realistyczny (w budowie, src/world/terrain/,
//                 plan: docs/generator-terenu.md),
//   'classic'   - pierwszy generator gry (wartości niżej).
// Światy zapisane przed wprowadzeniem typów są klasyczne.
export const DEFAULT_TERRAIN = 'realistic';

// Tryb gry nowego świata (do wyboru przy tworzeniu, /tryb w grze):
//   'adventure' - przygoda: zniszczone bloki trafiają do ekwipunku,
//                 stawianie je zużywa,
//   'creative'  - kreatywny: bloki bez końca (ekwipunek E - wszystkie
//                 bloki), latanie po dwukrotnym wciśnięciu Spacji.
// Światy sprzed trybów są kreatywne.
export const DEFAULT_GAME_MODE = 'adventure';

// Poziom morza w terenie realistycznym (y powierzchni wody).
// Kształt terenu (niziny, wyżyny, góry...) - src/world/terrain/TerrainShape.js.
export const SEA_LEVEL = 48;

// --- Teren klasyczny ---

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

// Kolor światła świecących bloków, które nie mają własnego
// lightColor w BlockRegistry.js (np. zwykła lampa) - ciepły żółty.
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

// Średnica tarczy słońca i księżyca na niebie w stopniach (prawdziwe
// mają ~0.5°, w grze są większe). Księżyc musi być choć trochę większy
// od słońca, żeby mogło być pełne zaćmienie - im większa różnica,
// tym dłużej trwa pełne zaćmienie.
export const SUN_DIAMETER = 7;
export const MOON_DIAMETER = 8;

// Zaćmienia słońca: jaka część nowiów (0-1) ma zaćmienie
// (0.3 = mniej więcej co trzeci nów, czyli co ~24 dni gry)
// i jaka część zaćmień jest pełna (reszta to częściowe).
// Zaćmienie widać koło południa i trwa kilka minut.
export const ECLIPSE_CHANCE = 0.3;
export const ECLIPSE_TOTAL_SHARE = 0.35;

// Ile gwiazd jest na niebie w najciemniejszą noc (nów). Przy pełni
// i o zmierzchu widać tylko najjaśniejsze z nich.
export const STAR_COUNT = 4500;

// Ile meteorytów średnio spada na ziemię w ciągu jednej nocy
// (0.3 = mniej więcej co trzecią noc; 0 = wcale). Spadają w pobliżu
// gracza, ale nigdy w chunki, które gracz zmieniał. Spadające
// gwiazdy na niebie to co innego - ich częstość jest w SkyColors.js.
export const METEORITES_PER_NIGHT = 0.3;

// Kolory nieba o różnych porach dnia są w src/sky/SkyColors.js.

// ------------------------------------------------------------
// DALEKI TEREN (HORYZONT)
// ------------------------------------------------------------

// Za zasięgiem widzenia widać uproszczony teren aż do odległości
// z ustawień ("Daleki teren"). Im dalej, tym bardziej ginie
// w powietrzu (mgiełka w kolorze nieba):
//   FAR_HAZE_DISTANCE - po ilu blokach mgiełka zakrywa ~63% terenu
//                       (mniej = gęstsze powietrze),
//   FAR_HAZE_MAX      - najwięcej mgiełki (0-1); poniżej 1 daleki
//                       teren zawsze ma trochę własnego koloru.
export const FAR_HAZE_DISTANCE = 900;
export const FAR_HAZE_MAX = 0.82;

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

// Kucanie (Shift): wolniej, niżej (mieści się pod 1,5 bloku), a na
// krawędzi bloku nie da się z niego spaść.
export const CROUCH_SPEED_FACTOR = 0.3;
export const CROUCH_HEIGHT = 1.5;
export const CROUCH_EYE_HEIGHT = 1.27;

// Bieg (dwa razy W albo przytrzymane R): szybciej i trochę szersze
// pole widzenia.
export const SPRINT_SPEED_FACTOR = 1.3;
export const SPRINT_FOV_FACTOR = 1.1;

// Ile sekund między dwoma wciśnięciami W, żeby zacząć biec.
export const SPRINT_DOUBLE_TAP = 0.3;

// ------------------------------------------------------------
// MODEL GRACZA I KAMERA (src/player/PlayerModel.js,
// docs/gracz.md)
// ------------------------------------------------------------

// Kamera z trzeciej osoby (F5): odległość od głowy (bloki).
// Gracz może ją zmienić w ustawieniach.
export const THIRD_PERSON_DISTANCE = 4;

// ------------------------------------------------------------
// PASEK BLOKÓW
// ------------------------------------------------------------

// Liczba miejsc na pasku (klawisze 1-9).
export const HOTBAR_SIZE = 9;

// Co jest na pasku w nowym świecie KREATYWNYM (kolejność = klawisze
// 1, 2, 3...; świat przygody zaczyna z pustym ekwipunkiem). Jeśli
// bloków jest mniej niż miejsc, reszta zostaje pusta. Środkowy
// przycisk myszy "bierze" blok, na który się patrzy, a komenda
// /daj <blok> [ilość] daje dowolny blok.
export const HOTBAR_DEFAULT = [
    'grass',
    'dirt',
    'stone',
    'lamp',
    'lepidolite',
    'lamp_red',
    'lamp_green',
    'lamp_blue',
    'lamp_purple'
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

// Zasięg widzenia w blokach - tak daleko widać prawdziwe bloki.
export const DEFAULT_VIEW_DISTANCE = 48;

// Rośliny (trawa, kwiaty...) widać do tylu bloków od gracza - dalej
// i tak są malutkie, a to dużo trójkątów (przy dużym zasięgu widzenia).
export const PLANT_VIEW_DISTANCE = 128;

// Daleki teren (horyzont): do ilu bloków od gracza widać uproszczony,
// rozmyty teren za zasięgiem widzenia (0 = wyłączony).
export const DEFAULT_FAR_TERRAIN = 1024;

// TRYB ZIEMNIAKA (ustawienie albo adres gry z ?ziemniak) - wszystko
// działa, ale prościej, żeby gra chodziła nawet na bardzo słabym
// komputerze (albo bez karty graficznej):
//   - rozdzielczość najwyżej POTATO_RENDER_SCALE procent,
//   - zasięg widzenia najwyżej POTATO_VIEW_DISTANCE bloków,
//   - daleki teren z rzadszą siatką (mniej trójkątów),
//   - bez wygładzania krawędzi (po odświeżeniu strony),
//   - bez Drogi Mlecznej i galaktyk, tylko najjaśniejsze gwiazdy
//     (POTATO_STAR_SHARE - jaka część gwiazd zostaje),
//   - kolor mgły liczony w rogach ścian, a nie w każdym pikselu.
// Własne ustawienia gracza zostają - po wyłączeniu trybu wracają.
export const POTATO_RENDER_SCALE = 50;
export const POTATO_VIEW_DISTANCE = 32;
export const POTATO_STAR_SHARE = 0.3;
