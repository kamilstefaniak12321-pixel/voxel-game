# Voxel Game

Gra voxelowa w przeglądarce, napisana w JavaScripcie z użyciem three.js.

> Nazwa robocza - do zmiany, gdy gra dostanie prawdziwą nazwę.

## Jak uruchomić

Gra używa modułów JavaScript, więc nie zadziała po dwukliku w `index.html`.
Trzeba ją otworzyć przez lokalny serwer, na przykład:

- **VS Code:** rozszerzenie *Live Server* -> prawy przycisk na `index.html` -> *Open with Live Server*
- **Node.js:** w folderze gry `npx serve`, potem adres podany w konsoli

Do działania potrzebny jest internet (three.js pobierany z unpkg).

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD | ruch |
| Spacja | skok |
| Shift | kucanie (wolniej, niżej, nie spada się z krawędzi) |
| 2× W albo R | bieg |
| F5 | widok: z oczu / zza pleców / z przodu |
| Mysz | rozglądanie się |
| LPM | zniszcz blok |
| PPM | postaw blok |
| 1-9 / kółko myszy | wybór miejsca na pasku bloków |
| Środkowy przycisk myszy | weź blok, na który patrzysz, na pasek |
| ESC | pauza (wróć do gry, ustawienia, zapisz i wyjdź do menu) |
| F3 | informacje debugowania w lewym górnym rogu |
| [ / ] (z F3) | cofnij / przesuń czas o godzinę |
| T, / | czat i komendy (`/pomoc`) |
| M | mapa terenu z góry (to samo co `/mapa`) |

## Pasek bloków

Na dole ekranu jest pasek z 9 miejscami. Ikonki bloków rysują się same
z tekstur w atlasie, więc nowy blok od razu ma ikonkę.

- Co jest na pasku w nowym świecie - `HOTBAR_DEFAULT` w `src/config.js`.
- Środkowy przycisk myszy na bloku w świecie: jeśli blok jest na pasku,
  wybiera jego miejsce; jeśli nie - wkłada go do pierwszego pustego
  miejsca (albo zastępuje wybrany, gdy pasek jest pełny).
- Zawartość paska i wybrane miejsce zapisują się razem ze światem.
- Wygląd paska (kolory ramek, rozmiar miejsc, nazwa bloku nad paskiem)
  jest w motywie - wartości `--hotbar-...` w `theme.css`.

## Ustawienia

W menu (z ekranu tytułowego i z pauzy) są trzy zakładki:

**Obraz**

- **tryb ziemniaka** - patrz niżej,
- **zasięg widzenia** (24-384 bloków) - jak daleko widać prawdziwe bloki,
- **daleki teren** (do 4096 bloków albo wyłączony) - uproszczony,
  rozmyty teren za zasięgiem widzenia, aż po horyzont,
- **pole widzenia** (50-110°),
- **jasność** - od *Nastrojowej* (zwykłej) do *Jasnej*: rozjaśnia półmrok
  i noc, pełnego światła nie zmienia,
- **rozdzielczość** (25-100%) - mniej = szybciej, ale mniej ostro,
- **limit FPS** (bez limitu, 30, 60, 120, 144),
- **cienie w kątach** (0-100%),
- **dynamiczne światło** (lampa w ręce, meteoryty),
- **wczytywanie** (1-16 ms na klatkę) - ile czasu w każdej
  klatce gra poświęca na nowe chunki: więcej = świat dogrywa się
  szybciej (przy dużym zasięgu), ale mogą być przycięcia.

**Sterowanie** - czułość myszy (10-200%), odwrócona mysz (góra/dół).

**Gracz** - skórka (wczytanie własnego pliku PNG albo domyślna), druga
warstwa skórki, zgięcia rąk i nóg (gładkie albo klocki), odległość
kamery z trzeciej osoby.

**Inne** - motyw menu, rozmiar interfejsu w grze (pasek, czat, napisy),
informacje debugowania (to samo co F3), licznik FPS w rogu ekranu,
spadające meteoryty (wł./wył. - te, które robią kratery).

Zmiany działają od razu, także w grze pod pauzą, i zapisują się
w przeglądarce. Wartości domyślne są w `src/config.js`, a lista ustawień
z zakresami w `src/settings/Settings.js`. Wszystko da się też zmienić
z czatu: `/ustaw` (lista), np. `/ustaw zasieg 256`.

## Gracz

Postać gracza jest klockowa jak w Minecrafcie, ale ma **11 stawów**:
ręce zginają się w łokciach, nogi w kolanach, a tułów w talii. Widać ją
z trzeciej osoby (**F5**). Animacje: stanie (oddech), chód, bieg,
kucanie, skradanie, skok, spadanie, lądowanie, machnięcie ręką przy
niszczeniu i stawianiu, latanie; głowa patrzy tam, gdzie kamera.
W prawej ręce jest blok wybrany na pasku.

**Skórka** to obrazek 64 x 64 w układzie skórek Minecrafta (z drugą
warstwą). Domyślna: `assets/textures/player/skin.png`; własną wczytuje
się w *Ustawienia → Gracz* albo `/skorka plik`.

Do oglądania: `/animacja chodzenie` (podgląd w miejscu), `/model tempo 0.25`
(zwolnione), `/kamera przod`. Opis modelu, układ skórki, liczby animacji
i plan: `docs/gracz.md`.

## Tryb ziemniaka

Dla bardzo słabych komputerów (i komputerów bez karty graficznej).
Wszystko w grze działa tak samo - niebo, zaćmienia, daleki teren,
światło - tylko prościej:

- rozdzielczość najwyżej 50%, bez wygładzania krawędzi,
- zasięg widzenia najwyżej 32 bloki,
- daleki teren z rzadszą siatką (~9 razy mniej trójkątów),
- bez Drogi Mlecznej i galaktyk, 30% najjaśniejszych gwiazd,
- kolor mgły liczony w rogach ścian, a nie w każdym pikselu.

Włącza się go w *Ustawienia → Obraz → Tryb ziemniaka*, komendą
`/ziemniak` albo otwierając grę z dopiskiem `?ziemniak` w adresie
(np. `http://localhost:5500/index.html?ziemniak`; `?ziemniak=0`
wyłącza). Twoje własne ustawienia zostają - po wyłączeniu trybu
wszystko wraca. Wygładzanie krawędzi zmienia się dopiero po
odświeżeniu strony. Liczby da się zmienić w `src/config.js`
(`POTATO_...`). Bez karty graficznej gra w trybie ziemniaka rysuje
się 5-10 razy szybciej.

## Wydajność

- **Licznik FPS** - ustawienie *Inne → Licznik FPS*; z F3 klatki na
  sekundę widać też w debugu.
- `/wydajnosc` - klatki na sekundę, czasy klatki (średnia, najdłuższa,
  najwolniejsze 1%), ile czasu zajmuje gra, a ile rysowanie, liczba
  rysowań i trójkątów, chunki, daleki teren, pamięć.
- `/wydajnosc test [sekundy]` - kamera obraca się raz dookoła, a na
  koniec na czacie pojawia się wynik. Dobre do porównań: ten sam
  test przy różnym zasięgu widzenia, dalekim terenie, rozdzielczości.

Przy dużym zasięgu widzenia od razu (pod ekranem wczytywania) wczytują
się tylko najbliższe chunki (`START_LOAD_RADIUS`), reszta dogrywa się
w trakcie gry.

## Świat

Świat nie ma stałego rozmiaru - teren generuje się wokół gracza, gdy
ten idzie dalej, a chunki daleko za plecami znikają z pamięci (zmiany
gracza w nich zostają). Jak daleko wokół gracza wczytuje się teren,
zależy od ustawienia *Zasięg widzenia*. Świat ma **128 bloków
wysokości** (`CHUNK_HEIGHT`; dawniej 64 - stare zapisy wczytują się
bez zmian, wyżej jest po prostu powietrze).

**Typ terenu** wybiera się przy tworzeniu świata (przycisk *Teren*):

- **Realistyczny (w budowie)** - morza i wybrzeża z plażami, niziny,
  wyżyny i góry z płynnymi przejściami, a w nich formy terenu: grzbiety,
  turnie, wzgórza, pagórki, doliny, kotliny, wąwozy, żleby, depresje,
  równiny, płaskowyże. Poziom morza to `SEA_LEVEL` (48).
  Pod ziemią są różne skały: granit (pod górami tuż pod powierzchnią),
  wapień na wyżynach, piaskowiec na nizinach i wybrzeżach, łupek
  w górach, bazalt na dnie świata i pod głębokim morzem, a lepidolit
  tylko jako rzadkie żyły w granicie (na wierzch wychodzi rzadko). To dopiero
  początek - kolejne aktualizacje będą ten teren zmieniać (rzeki,
  biomy...), więc w takim świecie nowe chunki mogą wyglądać inaczej niż
  wcześniej (Twoje budowle zostają). Woda to na razie zwykły
  nieprzezroczysty blok, przez który się przechodzi - prawdziwa woda
  przyjdzie w etapie "Woda".
- **Klasyczny** - pierwszy generator gry (wzgórza i góry, bez morza).
  Już się nie zmienia. Wszystkie światy sprzed tej aktualizacji są
  klasyczne.

Plan rozdziału o terenie (etapy, formy terenu, rzeki, biomy) i jak
działa generator: `docs/generator-terenu.md`. Teren najłatwiej
oglądać na **mapie** (klawisz **M** albo `/mapa formy 16`) i komendą
`/teren` (co jest pod graczem; `/teren znajdz turnia tp` - teleport
do najbliższej turni). Skały pod ziemią: `/skaly`, `/mapa skaly`,
`/mapa przekroj` (przekrój pionowy) i `/demo skaly` (odkrywka).

**Daleki teren (horyzont):** za zasięgiem widzenia widać uproszczony
teren - te same wzgórza i góry, które wygenerowałyby się tam naprawdę,
ale bez bloków i tekstur, w rozmytych kolorach trawy, ziemi i skały.
Im dalej, tym bardziej ginie w powietrzu (mgiełka w kolorze nieba):
w dzień jest jasny i niebieskawy, wieczorem i w nocy ciemny, a słońce
i księżyc zachodzą za dalekimi górami. Bliskie bloki z odległością
płynnie zlewają się w średni kolor swoich tekstur, więc przejście jest
prawie niewidoczne. Pokazuje też chunki zmienione przez gracza (np.
krater po meteorycie). Zasięg - ustawienie *Daleki teren*; mgiełka -
`FAR_HAZE_...` w `src/config.js`; kod - `src/world/FarTerrain.js`.

Świat kończy się na **granicy** - `WORLD_BORDER` w `src/config.js`
(domyślnie 30 000 bloków od środka w każdą stronę; `Infinity` = bez
granicy). Szum klasycznego terenu powtarza się mniej więcej co 61 000
bloków, a kontynenty realistycznego - co kilkaset tysięcy, więc przy
tej granicy nikt nie trafi na powtórkę. Nowe światy zaczynają się
w pobliżu punktu `WORLD_SPAWN_X` / `WORLD_SPAWN_Z` (w terenie
realistycznym gra szuka tam najbliższego płaskiego lądu).

Wczytywanie chunków ma limit czasu na klatkę (ustawienie *Wczytywanie*,
domyślnie `CHUNK_LOAD_BUDGET_MS`), żeby gra nie przycinała przy
szybkim ruchu. Chunk pojawia się na
ekranie dopiero wtedy, gdy wczytali się wszyscy jego sąsiedzi (bez nich
nie da się policzyć światła i cieni na jego krawędziach).

## Oświetlenie

Światło działa jak w Minecrafcie - każde miejsce ma poziom od 0
(ciemno) do 15:

- **światło nieba** - 15 wszędzie, skąd widać niebo; w głąb tunelu albo
  pod nawis słabnie o 1 z każdym blokiem,
- **światło bloków (kolorowe)** - lampy świecą na 15 bloków. Zwykła lampa
  ciepłym, żółtawym światłem, a kolorowe (czerwona, zielona, niebieska,
  fioletowa) swoim kolorem. Kolor nie blednie z odległością, a światła
  różnych lamp się mieszają (czerwona + niebieska = fioletowo). W dzień
  pod gołym niebem lampy niczego nie rozjaśniają (liczy się jaśniejsze
  z dwóch świateł).

Jak jasne jest światło nieba, zależy od pory dnia (patrz niżej) -
w nocy świat ciemnieje, a lampy świecą tak samo jak w dzień.

Do tego **gładkie przejścia** światła i **cienie w kątach** (ambient
occlusion), a mgła w ciemnym tunelu ciemnieje razem z nim. Poziom
światła w miejscu gracza widać w debugu (F3).

**Dynamiczne światło:** świecący blok wybrany na pasku świeci w ręce
(w swoim kolorze) i oświetla okolicę w czasie ruchu. Tak samo świeci
lecący meteoryt i błysk jego uderzenia. To światło też nie przechodzi
przez ściany. Wyłącza się je w ustawieniach.

Ustawienia w `src/config.js` (sekcja OŚWIETLENIE): jak szybko ciemnieje
półmrok (`LIGHT_CURVE`), jak jasno jest w zupełnej ciemności
(`LIGHT_MIN_BRIGHTNESS`), domyślny kolor światła lamp (`BLOCK_LIGHT_COLOR`)
i siła cieni w kątach (`AMBIENT_OCCLUSION`). Własny kolor lampy:
`lightColor` w definicji bloku (`src/blocks/BlockRegistry.js`).

Barwa światła na świecie pochodzi z nieba: w dzień jest lekko
niebieskawa, o zachodzie ciepła, w nocy chłodna. Inny kolor łuny
zachodu albo księżyca (np. `/ksiezyc kolor krwawy`) też lekko
zabarwia świat.

Światło nie jest zapisywane - po wczytaniu świata liczy się od nowa
(`src/world/Light.js`).

## Czat i komendy

**T** otwiera czat, **/** otwiera czat od razu z ukośnikiem do komendy.
Enter wysyła, ESC zamyka, strzałki ↑ ↓ przywołują poprzednie wpisy.

**Podpowiedzi:** w trakcie pisania komendy nad czatem pojawia się
lista pasujących komend (z opisem) albo słów do wpisania dalej (bloki,
godziny, kolory, warstwy mapy...), a w polu tekstowym szarym kolorem
dopisuje się pierwsza z nich. **Tab** ją zatwierdza, strzałki ↑ ↓
wybierają inną z listy. Gdy komenda jest już wpisana, nad czatem widać,
jak jej użyć.

Komendy służą do sprawdzania nowości w grze, np.:

```
/pomoc                     lista komend (/pomoc czas - opis jednej)
/czas ustaw zachod         godzina albo pora: rano, poludnie, noc...
/ksiezyc faza pelnia       faza księżyca (i o której jest najwyżej)
/ksiezyc kolor krwawy      kolor księżyca (zabarwia światło nocą)
/niebo zachod zielony      kolor łuny wschodu i zachodu
/demo swiatlo              pokój z kolorowymi lampami
/demo kula zielony         krążąca kula dynamicznego światła
/meteor tu                 meteoryt spada tam, gdzie patrzysz
/meteory deszcz wl         deszcz meteorów (/meteory pokaz - kilka od razu)
/zacmienie pokaz pelne     pełne zaćmienie słońca (albo czesciowe, 50...)
/zacmienie                 kiedy następne zaćmienie (/zacmienie lista)
/horyzont 2048             daleki teren (/horyzont lod - dokładność kafelków)
/teren                     forma terenu pod graczem (niziny, wyżyny, góry...)
/teren znajdz kotlina tp   teleport do najbliższej kotliny (/teren formy - lista)
/mapa formy 16             mapa terenu (klawisz M; warstwy: teren, formy, pasy, skaly...)
/mapa przekroj             przekrój pionowy terenu w kierunku patrzenia
/skaly                     skały pod tobą (/skaly zyla tp - żyła lepidolitu)
/demo skaly                odkrywka - na ścianach widać warstwy skał
/ustaw zasieg 256          dowolne ustawienie (/ustaw - lista)
/kamera przod              widok z trzeciej osoby (oczy, tyl, przod; jak F5)
/animacja bieg             podgląd animacji gracza (chodzenie, kucanie, skok...)
/model tempo 0.25          zwolnione animacje (/model klocki - inne zgięcia)
/skorka plik               własna skórka gracza (PNG 64 x 64)
/wydajnosc test            test wydajności z obrotem kamery
/latanie                   latanie (Spacja w górę, Shift w dół)
/tp 100 30 -50             teleport (~ = względem gracza)
/daj lamp_blue             blok na pasek (też po polsku: /daj granit)
/wypelnij ~ ~ ~ ~5 ~3 ~5 stone
```

Pełna lista i jak dodać własną komendę: `docs/komendy.md`.

## Dzień i noc

Doba w grze trwa 20 minut (`DAY_LENGTH_MINUTES` w `src/config.js`),
nowy świat zaczyna się rano. Czas zapisuje się razem ze światem;
w debugu (F3) widać godzinę, numer dnia i fazę księżyca, a klawisze
`[` i `]` przestawiają zegar o godzinę.

- **Słońce** wschodzi o 6:00 na wschodzie i zachodzi o 18:00 na
  zachodzie, w południe świeci z południowej strony nieba. Przy
  wschodzie i zachodzie niebo robi się pomarańczowo-różowe, a cienie
  na ścianach bloków zmieniają się w ciągu dnia razem ze słońcem.
- **Księżyc** ma własny cykl (`MOON_CYCLE_DAYS`, domyślnie 8 dni) i fazy
  jak prawdziwy: w pełni świeci całą noc, kwadry - pół nocy i pół dnia,
  sierp widać w dzień blisko słońca.
- **Noc zależy od księżyca:** w pełni jest na tyle jasno, że dobrze
  widać okolicę, ale w srebrnych, księżycowych barwach. W nowiu jest
  ciemno, za to na niebie widać dużo więcej gwiazd, Drogę Mleczną
  i odległe galaktyki.
- **Gwiazdy** wychodzą o zmierzchu, migoczą i obracają się razem
  z niebem.
- **Spadające gwiazdy** - najwięcej w ciemne noce; mniej więcej co
  siódma noc to deszcz meteorów.
- **Meteoryty** - co kilka nocy (`METEORITES_PER_NIGHT`) w pobliżu spada
  kula ognia, robi krater i zostawia żarzący się blok meteorytu (na
  czacie pojawia się, gdzie). Nie spada w chunki, które zmieniałeś.
  Można je wyłączyć w ustawieniach.
- **Zaćmienia słońca** - mniej więcej co trzeci nów (`ECLIPSE_CHANCE`)
  księżyc przechodzi przed słońcem, koło południa. Zwykle zasłania tylko
  część tarczy - im większą, tym ciemniej robi się na świecie. Czasem
  (`ECLIPSE_TOTAL_SHARE`) zaćmienie jest pełne: na pół minuty robi się
  zmrok, niebo ciemnieje, dookoła horyzontu świeci łuna, wokół czarnej
  tarczy widać koronę, a na niebie najjaśniejsze gwiazdy. Kiedy
  następne - `/zacmienie`.
- **Mgła** ma zawsze kolor nieba za terenem, także o zachodzie.

Kolory nieba i światła o każdej porze dnia są w `src/sky/SkyColors.js`
(jedna tabela), tekstura księżyca w `assets/textures/sky/moon.png`
(32x32, poza tarczą przezroczysta).

Jak jest zbudowane niebo i jak dokładać kolejne rzeczy (kolorowe
i dynamiczne światło, meteoryty, chmury...) - `docs/niebo-i-swiatlo.md`.

## Zapis świata

Świat zapisuje się sam w przeglądarce (IndexedDB): zmienione bloki
2 sekundy po zmianie, pozycja gracza co 10 sekund, a całość także przy
przełączeniu albo zamknięciu karty i przy każdej pauzie. Światy wybiera
się, tworzy i usuwa w menu.

Zapisy są przypisane do adresu, pod którym otwierasz grę
(np. `http://localhost:5500`). Inny adres albo port = inne zapisy.

## Menu i motywy

Wygląd menu jest w **motywie**: jeden folder w `assets/ui/themes/`
z plikiem `theme.css` (kolory, czcionka, rozmiary) i teksturą tła
`background.png`. W grze są dwa motywy: `default` (ziemia) i
`lepidolit` (fioletowy).

**Zmiana motywu:** w grze: *Ustawienia → Motyw*. Motyw domyślny
(przed pierwszym wyborem) ustawia `UI_THEME` w `src/config.js`.

**Własny motyw:**

1. Skopiuj folder `assets/ui/themes/default` i nazwij go po swojemu.
2. Podmień `background.png` na swoją teksturę (np. 16x16).
3. Zmień kolory i rozmiary w `theme.css` - każda wartość ma opis.
4. Dopisz go do `UI_THEMES` w `src/config.js` (nazwa folderu i nazwa
   widoczna w grze) - pojawi się w *Ustawienia → Motyw*.

Inne rzeczy do zmiany:

- **nazwa gry** - `GAME_TITLE` w `src/config.js`,
- **napisy w menu** - `src/ui/texts.js`,
- **rozmieszczenie elementów** - `src/ui/menu.css`,
- **czcionka** - `--ui-font` w motywie; dołączona czcionka
  Pixelify Sans jest na licencji SIL OFL (`assets/fonts/pixelify-sans/OFL.txt`).

## Struktura projektu

```
index.html                  strona gry
assets/textures/blocks/     tekstury bloków (terrain.png = atlas)
assets/textures/sky/        tekstury nieba (księżyc)
assets/textures/player/     skórka gracza i szablon skórki
assets/ui/themes/           motywy menu (kolory, czcionka, tło)
assets/fonts/               czcionki
docs/                       opisy, jak działają większe części gry
src/
  main.js                   start aplikacji, menu, pauza, pętla
  config.js                 ustawienia: chunki, teren, światło, dzień i noc, gracz, menu
  game/                     jeden uruchomiony świat (Game)
  ui/                       ekrany menu, pasek bloków, ikonki, napisy
  settings/                 ustawienia gracza (zapis w przeglądarce)
  blocks/                   lista bloków (BlockRegistry)
  world/                    świat, chunki, szum, światło, daleki teren
  world/terrain/            generatory terenu (realistyczny, lista typów, formy terenu, skały)
  sky/                      czas, słońce, księżyc, gwiazdy, kolory nieba
  storage/                  zapis i wczytywanie światów
  rendering/                atlas tekstur, budowanie meshy chunków
  player/                   ruch i kolizje gracza, model, animacje, skórka
  input/                    klawiatura i mysz
  commands/                 komendy czatu (do testowania)
  interaction/              raycast, niszczenie, stawianie, podświetlenie
```

## Dodawanie nowego bloku

1. Narysuj teksturę 16x16 i wklej ją do wolnego kafelka w `assets/textures/blocks/terrain.png`.
2. Dopisz pozycję kafelka w `ATLAS_TILES` w `src/rendering/TextureAtlas.js`.
3. Dopisz blok w `BLOCK_TYPES` w `src/blocks/BlockRegistry.js` (nowe, unikalne `id`).
   Blok, który ma świecić, dostaje `light: 1-15` (jak lampa: `light: 15`)
   i opcjonalnie kolor światła, np. `lightColor: '#ff3020'`.
4. Sprawdź go w grze: `/daj <nazwa>` wkłada blok na pasek.
