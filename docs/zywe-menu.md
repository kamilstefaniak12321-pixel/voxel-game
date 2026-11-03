# Żywe menu

Menu od 0.56.0 pokazuje osobny, deterministyczny wycinek prawdziwego świata
gry. Korzysta z aktualnego generatora, modeli roślin, atlasu tekstur, wody,
nieba, oświetlenia, cieni i dalekiego terenu. Nie jest filmem ani panoramą.

## Podział odpowiedzialności

- [`menuScene.js`](../src/menu/menuScene.js) opisuje scenerię: identyfikator,
  seed, generator, porę dnia oraz położenie i kierunek czterech kamer.
  `menuSettings` od 0.56.1 ustala własny zasięg podglądu, niezależny od
  suwaków zasięgu gracza: pełny teren do 256 bloków na komputerze / 128 na
  telefonie, horyzont do 1024 / 768. Nie zapisuje tych wartości w preferencjach
  gracza. Budżet przygotowania terenu wynosi odpowiednio 12 / 6 ms na klatkę,
  a FOV menu 58°. Pozostałe ustawienia efektów nadal pochodzą z preferencji
  użytkownika; tryb ziemniaka zachowuje tańszy wariant.
- [`MenuCamera.js`](../src/menu/MenuCamera.js) płynnie zmienia pozycję i cel
  patrzenia. Tłumiony ruch zachowuje prędkość przy zmianie zakładki w połowie
  przejazdu; powrót wybiera ponownie widok `home`. Dodaje niewielki pionowy
  dryf. Przy ograniczeniu ruchu wybiera kadr natychmiast, bez dryfu.
- [`MenuWorld.js`](../src/menu/MenuWorld.js) składa `World`, `Sky`,
  `FarTerrain`, `SunShadows` i `LightShafts`. Przygotowuje jeden stały obszar
  obejmujący wszystkie kadry i przejazdy; zmiana zakładki nie przesuwa kolejki
  chunków. `update` aktualizuje animacje, niebo i oświetlenie. `render`
  odrzuca chunki poza kadrem na podstawie ich przestrzennych obwiedni,
  następnie rysuje cienie, niebo, daleki i bliski teren oraz promienie światła.
  Pora dnia jest stała; animacje wody i roślin pozostają aktywne.
- [`MenuBackdrop.js`](../src/menu/MenuBackdrop.js) obsługuje start po
  przygotowaniu atlasu, gotowość sceny, zmianę widoku, ustawienia, rozmiar
  okna i zwalnianie zasobów. Ukryte okno nie aktualizuje sceny. Błąd sceny
  przywraca zwykłe tło i nie blokuje przycisków menu. Ustawienie ruchu menu
  może respektować preferencję systemową lub wymusić animację / brak ruchu.
- [`main.js`](../src/main.js) łączy nawigację UI z podglądem oraz zatrzymuje
  podgląd przed rozpoczęciem gry.

Podgląd nie tworzy `Game` ani `Player`, nie uruchamia symulacji rozgrywki
i nie odczytuje ani nie zapisuje świata gracza. Używa pustej mapy zmian.
Ekran listy światów nadal działa niezależnie, zgodnie z normalnymi zasadami UI.
Podgląd i rozgrywka nie mogą działać jednocześnie: korzystają ze wspólnych
materiałów i uniformów rendererów. `dispose` zwalnia chunki, pracowników
dalekiego terenu, mapy cieni i pozostałe zasoby własnej sceny; nie usuwa
współdzielonych materiałów gry.

## Szczegóły i przygotowanie sceny od 0.56.1

Środek wczytywanego obszaru to środek prostokąta obejmującego pozycje
wszystkich kamer w osiach X/Z. `cameraReach` jest największą odległością
kamery od tego środka, powiększoną o 2 bloki zapasu. Promień wczytywania
wynosi `ceil((viewDistance + cameraReach) / CHUNK_SIZE) + 2` chunków;
ostatnie dwa pierścienie zapewniają sąsiadów potrzebnych do budowy siatek.
Pełne chunki pokrywają więc zasięg 256 bloków na komputerze / 128 na
telefonie wraz z zapasem dla przejazdów kamery.

Najpierw powstają dane wszystkich chunków tego obszaru, a dopiero potem
ich siatki. Oba etapy korzystają z budżetu 12 ms na komputerze / 6 ms na
telefonie na klatkę. Pozwala to uniknąć wielokrotnego przebudowywania siatek
po dograniu kolejnych sąsiadów. Są to budżety pracy, nie obietnica określonego
czasu całego startu. Scena zostaje odsłonięta dopiero po opróżnieniu kolejek
generacji i przebudowy, przygotowaniu shaderów wody oraz wszystkich
aktualnie potrzebnych kafelków dalekiego terenu. Do tego czasu działa
zwykłe tło i przyciski menu.

Dalszy krajobraz pozostaje uproszczoną siatką terenu. Osobny profil menu
dobiera krok próbkowania do 1 bloku w odległości 512, do 2 bloków w
odległości 800 i do 4 bloków w odległości 1024. Horyzont telefonu kończy
się wcześniej, na 768 blokach. To szczegółowszy daleki teren, a nie pełne
chunki, roślinność i obiekty do 800 bloków. Tryb ziemniaka nadal korzysta
z własnego oszczędnego profilu dalekiego terenu i ogranicza pełne chunki
do 32 bloków.

Tekstury pełnych chunków w menu nie przechodzą z odległością w jednolity
kolor (`uFarTextureBlend = 0`); rozgrywka przywraca swój zwykły sposób
przejścia. Przed rysowaniem `Frustum.intersectsBox` sprawdza obwiednie
chunków, poszerzone o 3 bloki na animację roślin. Dzięki temu stały,
większy obszar nie wymaga rysowania chunków znajdujących się poza kadrem.

Wyniki sprawdzenia i ograniczenia pomiarów:
[`szczegóły menu 0.56.1`](pomiary/szczegoly-menu-0.56.1/README.md).

## Zasięg rozgrywki

Od 0.56.1 suwak zasięgu pełnych bloków w ustawieniach gry obejmuje 24–800
bloków, z krokiem 8. Domyślna wartość pozostaje 48 na komputerze i 32 na
telefonie. Ten sam zakres obowiązuje komendę `/ustaw zasieg`, walidację
i ponowne wczytanie ustawień. Zmiana suwaka nie zmienia stałego zasięgu
scenografii menu.

Wybranie 800 wymaga wczytania około czterech razy więcej chunków niż 384
i zwiększa zużycie pamięci oraz koszt generowania i rysowania terenu.
To opcjonalny limit, nie gwarancja 60 FPS na każdym sprzęcie; dalsze
chunki powstają stopniowo. Tryb ziemniaka nadal ogranicza faktyczny zasięg
do 32 bloków. Zasięg dekoracyjnej roślinności ma osobny limit.

## Sceneria 0.56.0 i kolejne wydania

`river-valley-0.56` korzysta z liczbowego seedu `2138286349`, generatora
`realistic` i godziny 10:30. Główny kadr jest nad doliną; widoki zakładek
przenoszą kamerę nad rzekę, do lasku i ponad korony w stronę gór. Współrzędne
są zapisane wyłącznie w `MENU_SCENE`, żeby można było wymienić scenerię bez
przebudowy nawigacji.

Przy większym wydaniu wybierz miejsce pokazujące aktualne zasoby gry,
zmień identyfikator scenerii i jej opis w `menuScene.js`. Zachowaj klucze
`home`, `river`, `forest`, `mountains`, dopóki nawigacja korzysta z tego
podziału. Sprawdź kadry również z panelem UI, w różnych proporcjach okna:
wolna kamera nie gwarantuje widoczności rzeki ani dobrego ułożenia drzew.
Przeloty muszą omijać pnie i korony także po szybkim przełączaniu zakładek.
Przyszłe pogoda i pory roku powinny korzystać z rzeczywistych systemów gry;
obecny opis sceny nie implementuje jeszcze tych funkcji.

## Sprawdzanie kamer

Z katalogu głównego repozytorium, w Node.js 24:

```sh
node tools/sprawdz_menu_kamere.mjs
node docs/pomiary/zywe-menu-0.56.0/sprawdz-kolizje.mjs
```

Drugi skrypt generuje prawdziwe chunki aktualnej scenerii, sprawdza końce
i sześć bezpośrednich tras, a następnie 80 deterministycznych sekwencji
po 15 sekund z losowym przerywaniem animacji. Uwzględnia promień kamery
0,5 bloku i cały dryf ±0,18; wynik zapisuje obok skryptu w
[`kolizje-kamer.json`](pomiary/zywe-menu-0.56.0/kolizje-kamer.json).
To próba CPU geometrii, bez WebGL i zapisów świata, a nie pomiar FPS.
Próbkowanie nie stanowi dowodu bezpieczeństwa każdej możliwej sekwencji.
Po zmianie generatora lub kamer powtórz tę próbę i sprawdzenie wizualne
w aplikacji, w tym start gry, powrót do menu i koszt renderowania.
