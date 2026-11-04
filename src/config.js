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
//                 bloki), latanie po dwukrotnym wciśnięciu Spacji,
//   'developer' - programista: jak kreatywny, a do tego sceny testowe
//                 (src/dev/scenes.js) i plac testowy (teren 'flat').
// Światy sprzed trybów są kreatywne.
export const DEFAULT_GAME_MODE = 'adventure';

// Czy tryb ma bloki bez końca i latanie (kreatywny i programista).
export function isCreative(mode) {
    return mode === 'creative' || mode === 'developer';
}

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

// Cienie słońca (ustawienie "Cienie słońca" - src/rendering/Shadows.js).
// Z cieniami słońce świeci mocniej, a światło z całego nieba jest
// słabsze, więc plamy słońca i cienie są wyraźniejsze (jak w "Vibrant
// Visuals" w Minecrafcie). 1 = tak samo jak bez cieni.
export const SHADOW_SUN_BOOST = 1.3;
export const SHADOW_AMBIENT = 0.82;

// Tam, gdzie dochodzi mało światła nieba (pokój, jaskinia, gęsty las),
// z cieniami jest ciemniej - wpadające słońce bardziej się wyróżnia.
// 0 = tak jak bez cieni, 1 = wyraźnie ciemniej.
export const SHADOW_INDOOR_DARKNESS = 1.2;

// Światło odbite (ustawienie "Światło odbite" - src/world/BounceLight.js):
// oświetlone słońcem ściany świecą dalej w kolorze swojej tekstury,
// a światło rozlewa się po pokoju.
//   BOUNCE_SIZE / BOUNCE_HEIGHT - pudełko wokół gracza (bloki w poziomie
//       i w pionie) - dalej światła odbitego nie ma,
//   BOUNCE_SPREAD      - jak daleko się rozlewa (0.9 - tuż przy plamie
//       słońca, 0.99 - po całym pokoju i dalej),
//   BOUNCE_STRENGTH    - jasność,
//   BOUNCE_MAX_REFLECT - najwięcej, ile ściana może odbić (0-1),
//   BOUNCE_OUTDOOR     - o ile słabsze jest pod gołym niebem (tam całe
//       niebo i tak świeci; 0 = tak samo jak w środku, 1 = wcale).
export const BOUNCE_SIZE = 40;
export const BOUNCE_HEIGHT = 24;
export const BOUNCE_SPREAD = 0.985;
export const BOUNCE_STRENGTH = 1.5;
export const BOUNCE_MAX_REFLECT = 0.9;
export const BOUNCE_OUTDOOR = 0.6;

// Promienie światła w powietrzu (ustawienie "Promienie światła" -
// src/rendering/LightShafts.js): jasność i gęstość powietrza (ile
// światła rozprasza każdy blok oświetlonego powietrza) - na dworze
// i w ciemnym miejscu (w pokoju z oknem snop jest wyraźny).
export const SHAFT_BRIGHTNESS = 3.0;
export const SHAFT_DENSITY_OUTSIDE = 0.0012;
export const SHAFT_DENSITY_INSIDE = 0.4;

// Jak daleko od oka liczyć promienie z daleką mapą cieni (bloki;
// bez niej - tyle, ile sięga bliska mapa).
export const SHAFT_FAR_REACH = 128;

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
// WODA (src/player/Player.js - pływanie, src/rendering - wygląd)
// ------------------------------------------------------------

// Powierzchnia wody: tyle bloku od dołu (górny blok wody jest trochę
// niższy niż pełny - jak w Minecrafcie).
export const WATER_SURFACE = 0.875;

// Ruch w wodzie: prędkość pozioma (razy zwykła; z biegiem - razy
// SPRINT_SPEED_FACTOR), grawitacja (razy zwykła), opór (im więcej, tym
// szybciej woda hamuje: przy 4 gracz opada najwyżej ~1,5 bloku/s).
export const WATER_SPEED_FACTOR = 0.5;
export const WATER_GRAVITY_FACTOR = 0.2;
export const WATER_DRAG = 4;

// Pływanie w górę (Spacja): przyspieszenie (bloki/s²). Przy powierzchni
// słabnie - gracz unosi się z oczami tuż nad wodą.
export const SWIM_UP_ACCELERATION = 22;

// Shift w wodzie: nurkowanie (dodatkowe przyspieszenie w dół).
export const SWIM_DOWN_ACCELERATION = 10;

// Wyjście z wody na brzeg: Spacja przy ścianie brzegu - wybicie w górę
// (bloki/s).
export const WATER_CLIMB_SPEED = 7.5;

// Pod wodą: kolor mgły (sRGB, w dzień; nocą ciemnieje razem z niebem)
// i gęstość - im więcej, tym gorzej widać (0.055 = ~40 bloków).
export const UNDERWATER_FOG_COLOR = 0x1f5a8a;
export const UNDERWATER_FOG_DENSITY = 0.055;

// Przezroczystość wody: patrząc pionowo w dół i pod małym kątem
// (z boku woda odbija niebo i wydaje się gęstsza). 1 = nieprzezroczysta.
export const WATER_OPACITY = 0.45;
export const WATER_OPACITY_GRAZING = 0.94;

// Fale: o ile (w blokach) faluje powierzchnia; 0 = płaska woda.
export const WATER_WAVE_HEIGHT = 0.045;

// NURT RZEK (src/world/terrain/Rivers.js liczy kierunek i siłę):
//   WATER_FLOW_MAX   - najszybszy nurt zapisywany w chunku (bloki/s),
//   RIVER_PUSH       - jak mocno nurt niesie gracza (1 = z prędkością
//                      nurtu, gdy jest cały w wodzie),
//   RIVER_TEXTURE    - jak szybko płynie tekstura wody (razy nurt).
export const WATER_FLOW_MAX = 4;
export const RIVER_PUSH = 1;
export const RIVER_TEXTURE = 0.6;

// Dno pod wodą ciemnieje z głębokością: światło nieba razy
// WATER_DEPTH_LIGHT do potęgi głębokości (w blokach), najmniej
// WATER_DEPTH_LIGHT_MIN.
export const WATER_DEPTH_LIGHT = 0.9;
export const WATER_DEPTH_LIGHT_MIN = 0.3;

// ------------------------------------------------------------
// KOSMOS - sekret (src/space/, docs/kosmos.md)
// ------------------------------------------------------------

// Lot w pionie (Spacja/Shift w locie) przyspiesza z wysokością:
// powyżej FLY_BOOST_START prędkość w górę i w dół rośnie o tyle,
// ile wynosi zwykła, co FLY_BOOST_BLOCKS bloków (na wysokości 1000
// ~15 razy szybciej, w kosmosie kilkaset bloków na sekundę).
// W poziomie lot jest zwykły.
export const FLY_BOOST_START = 160;
export const FLY_BOOST_BLOCKS = 60;

// Wyżej nie da się polecieć.
export const SPACE_MAX_ALTITUDE = 30000;

// Niebo (wysokość kamery): od SPACE_START zaczyna ciemnieć,
// od SPACE_FULL jest czarne - kosmos (gwiazdy, planety).
export const SPACE_START = 800;
export const SPACE_FULL = 3000;

// Ziemia z wysoka: od SPACE_CURVE_START teren zaczyna się zaginać,
// od SPACE_CURVE_FULL to już kula o promieniu GLOBE_RADIUS bloków
// (świat owinięty dookoła miejsca pod graczem).
export const SPACE_CURVE_START = 350;
export const SPACE_CURVE_FULL = 1600;
export const GLOBE_RADIUS = 4000;

// Spadanie z kosmosu ("jak meteoryt"): zaczyna się, gdy gracz nie
// leci i jest wyżej niż SKYFALL_START. Prędkość spadania zależy od
// wysokości nad morzem: SKYFALL_SPEED + SKYFALL_SPEED_PER_BLOCK *
// wysokość (najwyżej SKYFALL_MAX_SPEED). Uderzenie w ziemię robi
// krater (wielkość: SKYFALL_CRATER_SCALE razy krater meteorytu).
export const SKYFALL_START = 1000;
export const SKYFALL_SPEED = 200;
export const SKYFALL_SPEED_PER_BLOCK = 0.06;
export const SKYFALL_MAX_SPEED = 900;
export const SKYFALL_CRATER_SCALE = 1.2;

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
    lepidolit: 'Lepidolit',
    'grey-wood': 'Szare drewno'
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

// Krzaki owocowe rosną etapami: sadzonka -> krzak -> kilka owoców ->
// pełen owoców (src/game/PlantGrowth.js). Jeden etap trwa średnio
// tyle sekund (losowo: raz szybciej, raz wolniej) - ale rosną tylko
// krzaki w chunkach wczytanych wokół gracza.
export const BUSH_GROWTH_SECONDS = 150;

// Sadzonka drzewa (src/blocks/trees.js) wyrasta w całe drzewo średnio
// po tylu sekundach (też losowo i też tylko we wczytanych chunkach).
// Gdy nad sadzonką nie ma miejsca na drzewo - czeka dalej.
export const TREE_GROWTH_SECONDS = 300;

// KOPANIE (tryb przygody): ile sekund trzeba trzymać LPM, żeby zniszczyć
// blok - według materiału dźwięków bloku (pole sound w BlockRegistry.js;
// blok może mieć własny czas: pole hardness). Liście - LEAVES_BREAK_SECONDS.
// Narzędzie kopie swoje materiały TOOL_SPEED razy szybciej (TOOL_MATERIALS:
// siekiera - drewno, kilof - skały, łopata - ziemia, piasek, żwir, błoto,
// śnieg).
// W trybie kreatywnym blok znika od razu, a trzymany LPM niszczy kolejne
// co CREATIVE_REPEAT_SECONDS.
export const BREAK_SECONDS = {
    plant: 0,
    grass: 0.6,
    dirt: 0.6,
    sand: 0.55,
    gravel: 0.7,
    mud: 0.6,
    glass: 0.45,
    wood: 2,
    stone: 2.2,
    snow: 0.4
};
export const LEAVES_BREAK_SECONDS = 0.35;
export const TOOL_SPEED = 3;
export const TOOL_MATERIALS = {
    axe: ['wood'],
    pickaxe: ['stone'],
    shovel: ['grass', 'dirt', 'sand', 'gravel', 'mud', 'snow']
};

// Przy kopaniu co tyle sekund: machnięcie ręką, stuknięcie (dźwięk)
// i kilka odłamków. Po zniszczeniu bloku chwila przerwy, zanim zacznie
// się kopać następny.
export const MINING_HIT_SECONDS = 0.25;
export const MINING_DELAY_SECONDS = 0.15;
export const CREATIVE_REPEAT_SECONDS = 0.25;

// WIDOK Z OCZU (src/player/FirstPersonHand.js): kołysanie przy chodzeniu
// - ile bloków w górę i w dół (kamera; bieg - więcej) i jak szybko
// (kroki na blok drogi).
export const VIEW_BOB_HEIGHT = 0.055;
export const VIEW_BOB_STEPS = 0.62;

// Po upadku kamera na chwilę się ugina - przy lądowaniu szybszym niż
// LAND_DIP_SPEED bloków/s (zwykły skok ląduje z prędkością ok. 9),
// najwyżej o LAND_DIP_MAX bloku.
export const LAND_DIP_SPEED = 10;
export const LAND_DIP_MAX = 0.2;

// Daleki teren (horyzont): do ilu bloków od gracza widać uproszczony,
// kanciasty teren za zasięgiem widzenia (0 = wyłączony). Kratki rosną
// z odległością, więc nawet kilkanaście tysięcy bloków to niewiele
// więcej pracy niż kilka tysięcy (src/world/FarTerrain.js).
export const DEFAULT_FAR_TERRAIN = 8192;

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

// TELEFON / TABLET (sterowanie dotykowe - src/input/TouchControls.js,
// włącza się samo na ekranie dotykowym bez myszy albo adresem ?dotyk).
// Telefon ma słabszą kartę graficzną niż komputer i baterię, więc
// na start (dopóki gracz sam tego nie zmieni w ustawieniach):
export const TOUCH_SETTINGS = {
    viewDistance: 32,      // bloki
    farTerrain: 1024,      // bloki
    farDetail: 1,          // niskie szczegóły dalekiego terenu (~4x mniej trójkątów)
    renderScale: 80,       // procent rozdzielczości
    fpsLimit: 60,          // klatki na sekundę
    fancyLeaves: false,    // szybkie liście (bez prześwitów - dużo mniej ścian)
    shadows: 0,            // bez cieni słońca (mapa cieni to dużo pracy dla karty)
    lightShafts: false,    // bez promieni światła
    bounceLight: false,    // bez światła odbitego (liczenie w tle)
    lightingMaterials: 'basic', // zachowaj lekką bazę, dopóki nie zmierzymy telefonu
    showDebug: false       // napisy F3 zasłaniałyby przyciski
};
// Ekran telefonu ma 2-3 piksele na punkt - rysujemy najwyżej tyle
// pikseli na punkt (więcej i tak prawie nie widać, a zjada baterię).
export const TOUCH_MAX_PIXEL_RATIO = 1.5;


// WYDANIA (aplikacje na komputer i telefon - docs/aplikacja.md):
// repozytorium z wydaniami (to samo co package.json -> build.publish)
// i szablon paczki tekstur w najnowszym wydaniu (Ustawienia -> Tekstury,
// docs/paczki-tekstur.md).
export const RELEASES_REPO = 'kamilstefaniak12321-pixel/voxel-game-wydania';
export const TEXTURE_PACK_TEMPLATE_URL = `https://github.com/${RELEASES_REPO}/releases/latest/download/Voxel-Game-paczka-tekstur.zip`;
